# -*- coding: utf-8 -*-
"""
KRISS Committee Automation v0.2.7

Phase 1: working MASTER generation
----------------------------------
Required inputs:
  1) IP detail list XLSX (지식재산권 상세목록)
  2) MarkPro reply XLSX

HWP templates are not required for MASTER generation.
After MASTER generation, hwp_fill.py / fill_hwp_windows.bat can create the committee HWP attachments.

All filing, registration, waiver and graph data are calculated directly from the
IP detail list + MarkPro. No request-date lookup workbook, foreign-review RAW
workbook, or graph workbook is required.

v0.2.6 graph / HWP pipeline
------------------
- Graph style is selectable: line-only or stacked-bar + total trend line.
- v0.1.4 palette is restored: domestic #375B7C, foreign #6991AE, total #2D2D2D.
- Line style uses three open-marker trend lines; combo style uses stacked components + total line.
- The most recent year is visually highlighted and carries carefully separated numeric labels.
- Default display window is the most recent 10 years. Advanced settings allow
  5 years / 10 years / all years / an explicit start-end year pair.
- `20_그래프데이터` always keeps the FULL period regardless of the display
  window, so the chart window never destroys source data.
- Four PNG files are produced: two screen-resolution files and two
  HWPX-insertion files sized to the KRISS report body width.

GUI principles
--------------
- Window-wide PyQt5 drag-and-drop for Windows paths (Korean/spaces supported).
- Multiple quarter buttons can be toggled directly.
- Main agenda period and the waiver-report period (+1 quarter) are shown separately.
- Selected period and preview counts update immediately.
- Compact, scroll-free default layout keeps all primary controls visible at once.
- The primary Generate button stays visible at the bottom of the window.
- Output is a working MASTER.xlsx plus four chart PNG files.

MASTER XLSX is written directly by Python (XlsxWriter), so Microsoft Excel COM is
not used. Graph PNG files are rendered with matplotlib. Core logic can also be
validated with --validate-only.
"""
from __future__ import annotations

import argparse
import datetime as dt
import difflib
import os
import queue
import re
import shutil
import struct
import subprocess
import sys
import threading
import traceback
import unicodedata
import zipfile
import zlib
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable, Optional, Sequence

APP_NAME = "KRISS 직무발명관리위원회 자동화"
VERSION = "0.2.9"

# Graph display window options. The MASTER data sheet always keeps the full
# period; these only control what the chart/PNG shows.
GRAPH_RANGE_MODES = ("recent5", "recent10", "all", "custom")
GRAPH_RANGE_LABELS = {
    "recent5": "최근 5년",
    "recent10": "최근 10년",
    "all": "전체",
    "custom": "직접지정",
}
GRAPH_DEFAULT_MODE = "recent10"

# Graph visual style. Both use the v0.1.4 KRISS palette.
GRAPH_STYLE_MODES = ("line", "combo")
GRAPH_STYLE_LABELS = {
    "line": "꺾은선형",
    "combo": "막대+꺾은선형",
}
GRAPH_DEFAULT_STYLE = "line"
GRAPH_DATA_START_YEAR = 2013  # full-period start for 20_그래프데이터

# HWPX insertion PNG geometry.
# KRISS report body width is about 16 cm; 16 cm / 2.54 = 6.30 inch.
HWPX_PNG_WIDTH_IN = 6.70   # 170.2mm — 2026_2 병합본 그림 표시폭(171.1mm)에 맞춤
HWPX_PNG_HEIGHT_IN = 2.81  # 71.4mm — 병합본 비율 2.388 유지
HWPX_PNG_DPI = 300


def _meeting_round_number(value: Any) -> Optional[int]:
    """Return numeric committee round from values such as '1차' or 1."""
    m = re.search(r"\d+", str(value or ""))
    return int(m.group()) if m else None


HWP_TEMPLATE_EXTS = (".hwp", ".hwpx")


def _dir_has_hwp_templates(d: Path) -> bool:
    return any(d.glob(f"*{ext}") for ext in HWP_TEMPLATE_EXTS)


def zip_contains_hwp_templates(path: str | Path) -> bool:
    """True only for a readable ZIP that actually contains .hwp/.hwpx templates."""
    p = Path(path)
    if not p.is_file() or p.suffix.lower() != ".zip":
        return False
    try:
        with zipfile.ZipFile(p) as zf:
            return any((not i.is_dir()) and i.filename.lower().endswith(HWP_TEMPLATE_EXTS)
                       for i in zf.infolist())
    except (OSError, zipfile.BadZipFile):
        return False


def _app_data_root() -> Path:
    """Persistent per-user data directory shared by all program releases."""
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
        if base:
            return Path(base) / "KRISS_Committee_Automation"
    return Path.home() / ".kriss_committee_automation"


def user_hwp_template_dir(meeting_year: int, meeting_round: Any, *, create: bool = False) -> Path:
    """Stable user-editable template folder, independent of the extracted ZIP version."""
    rnd = _meeting_round_number(meeting_round) or 1
    d = _app_data_root() / "templates" / f"{meeting_year}_{rnd}"
    if create:
        d.mkdir(parents=True, exist_ok=True)
        guide = d / "여기에_한글양식_6종을_넣으세요.txt"
        if not guide.exists():
            guide.write_text(
                "KRISS 직무발명관리위원회 HWP 사용자 양식 폴더\n\n"
                f"회차: {meeting_year}년 {rnd}차\n"
                "이 폴더에 해당 회차 .hwp/.hwpx 양식 6종을 넣으면 프로그램이 내장 양식보다 우선 사용합니다.\n"
                "프로그램 ZIP을 새 버전으로 교체해도 이 폴더는 그대로 유지됩니다.\n",
                encoding="utf-8-sig",
            )
    return d


def bundled_hwp_template_dir(app_root: str | Path, meeting_year: int, meeting_round: Any) -> Optional[Path]:
    """Return the visible release-local HWP template folder when it contains .hwp files."""
    root = Path(app_root).resolve()
    rnd = _meeting_round_number(meeting_round)
    if rnd is None:
        return None
    bundled_root = root / "resources" / "hwp_templates"
    for name in (f"{meeting_year}_{rnd}", f"{meeting_year}_{rnd}차"):
        d = bundled_root / name
        if d.is_dir() and _dir_has_hwp_templates(d):
            return d
    return None


def seed_user_hwp_templates(app_root: str | Path, meeting_year: int, meeting_round: Any) -> tuple[Path, int]:
    """Copy factory HWP templates to the persistent user folder once.

    Existing user .hwp files are never overwritten.  This makes the templates
    visible/editable from the GUI while keeping new program releases independent.
    """
    target = user_hwp_template_dir(meeting_year, meeting_round, create=True)
    source = bundled_hwp_template_dir(app_root, meeting_year, meeting_round)
    if source is None:
        return target, 0
    copied = 0
    srcs = [q for ext in HWP_TEMPLATE_EXTS for q in source.glob(f"*{ext}")]
    for src in sorted(srcs, key=lambda q: q.name):
        dst = target / src.name
        # Fill only missing factory files. A user-edited file with the same name
        # is preserved exactly as-is.
        if not dst.exists():
            shutil.copy2(src, dst)
            copied += 1
    return target, copied


def find_bundled_hwp_templates(app_root: str | Path, meeting_year: int, meeting_round: Any) -> Optional[Path]:
    """Locate HWP templates without ever scanning generated graph/output ZIPs.

    Search order:
      1) persistent user override/copy under LOCALAPPDATA
      2) visible built-in folder under resources/hwp_templates/<year>_<round>
      3) legacy built-in ZIP under resources/hwp_templates
      4) legacy release-local templates folder/ZIP
      5) clearly named committee template ZIP beside the program (compatibility)
    """
    root = Path(app_root).resolve()
    rnd = _meeting_round_number(meeting_round)
    if rnd is None:
        return None
    names = (f"{meeting_year}_{rnd}", f"{meeting_year}_{rnd}차")

    # 1) Stable user override/copy: survives replacement of the release folder.
    user_root = _app_data_root() / "templates"
    for name in names:
        d = user_root / name
        if d.is_dir() and _dir_has_hwp_templates(d):
            return d
        zp = user_root / f"{name}.zip"
        if zip_contains_hwp_templates(zp):
            return zp

    # 2) Visible built-in folder. v0.2.6 ships the six .hwp files directly so
    # users can see that the templates are really included in the release.
    direct = bundled_hwp_template_dir(root, meeting_year, meeting_round)
    if direct is not None:
        return direct

    # 3) Legacy built-in ZIP retained for backward compatibility.
    bundled_root = root / "resources" / "hwp_templates"
    for name in names:
        zp = bundled_root / f"{name}.zip"
        if zip_contains_hwp_templates(zp):
            return zp

    # 4) Legacy direct folder/ZIP retained for backward compatibility.
    templates_root = root / "templates"
    for name in names:
        d = templates_root / name
        if d.is_dir() and _dir_has_hwp_templates(d):
            return d
        for zp in (templates_root / f"{name}.zip", templates_root / name / "committee_templates.zip"):
            if zip_contains_hwp_templates(zp):
                return zp

    # 5) Compatibility: only explicitly named committee ZIPs beside the program.
    root_zips = []
    for zp in root.glob("*.zip"):
        nm = zp.name
        if ("직무발명관리위원회" in nm or "서면심의" in nm or "committee_template" in nm.lower()) and zip_contains_hwp_templates(zp):
            root_zips.append(zp)
    return sorted(root_zips, key=lambda x: x.name)[0] if len(root_zips) == 1 else None


# -----------------------------------------------------------------------------
# Common helpers
# -----------------------------------------------------------------------------

def norm_header(v: Any) -> str:
    if v is None:
        return ""
    s = str(v).replace("\n", "").replace("\r", "").replace("\t", "")
    return re.sub(r"\s+", "", s).strip()


def norm_text(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def canon(v: Any) -> str:
    s = unicodedata.normalize("NFKC", norm_text(v)).upper()
    return re.sub(r"[^0-9A-Z가-힣]", "", s)


def safe_filename(s: str) -> str:
    s = re.sub(r'[\\/:*?"<>|]+', "_", norm_text(s))
    return re.sub(r"\s+", "_", s).strip("_.") or "output"


def natural_key(path_or_name: str | Path) -> list[Any]:
    s = Path(path_or_name).name if not isinstance(path_or_name, str) else Path(path_or_name).name
    return [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", s)]


def excel_serial_to_datetime(v: Any) -> Optional[dt.datetime]:
    if v in (None, ""):
        return None
    if isinstance(v, dt.datetime):
        return v
    if isinstance(v, dt.date):
        return dt.datetime.combine(v, dt.time())
    if isinstance(v, (int, float)):
        try:
            return dt.datetime(1899, 12, 30) + dt.timedelta(days=float(v))
        except Exception:
            return None
    s = norm_text(v)
    if not s:
        return None
    try:
        f = float(s)
        if f > 20000:
            return dt.datetime(1899, 12, 30) + dt.timedelta(days=f)
    except Exception:
        pass
    for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%Y%m%d"):
        try:
            return dt.datetime.strptime(s[:10], fmt)
        except Exception:
            pass
    return None


def _dummy_serial(digits: str) -> bool:
    """Hand-typed placeholder serials, e.g. 10-1234567 / 10-2026-1234567.

    v0.2.9: the 2026 Q2 source workbook carries an administratively closed case
    whose 출원번호 is the placeholder 10-2026-1234567. A trailing ascending
    run 1234567 (or an all-identical non-zero serial such as 1111111) never
    occurs as a real KIPO serial in KRISS data, so it is treated as a dummy.
    """
    if not digits:
        return False
    tail = digits[-7:]
    if tail == "1234567":
        return True
    return len(tail) == 7 and len(set(tail)) == 1


def valid_application_number(v: Any) -> bool:
    """Actual filing-number rule; status is not used as a blanket exclusion."""
    s = norm_text(v).replace(" ", "")
    if not s or s in {"-", "--"}:
        return False
    if "출원전" in s or "미출원" in s:
        return False
    compact = re.sub(r"[^0-9A-Za-z]", "", s).upper()
    if not compact or set(compact) == {"0"}:
        return False
    digits = re.sub(r"\D", "", s)
    if digits.startswith("10") and len(digits) > 2:
        tail = digits[2:]
        if tail and set(tail) == {"0"}:
            return False
    if _dummy_serial(digits):
        return False
    return True


def valid_registration_number(v: Any) -> bool:
    s = norm_text(v).replace(" ", "")
    if not s or s in {"-", "--"}:
        return False
    if "등록전" in s or "미등록" in s:
        return False
    compact = re.sub(r"[^0-9A-Za-z]", "", s).upper()
    if not compact or set(compact) == {"0"}:
        return False
    if _dummy_serial(re.sub(r"\D", "", s)):
        return False
    return True


def normalize_name_list(v: Any) -> str:
    """이름 나열의 콤마 표기 정규화: 콤마 뒤 공백 1개, 앞 공백 제거.

    예) "홍길동,김철수" → "홍길동, 김철수" / "홍길동 ,김철수" → "홍길동, 김철수"
    (v0.2.9) 위원회 안건·MASTER의 발명자/주발명자 표기 규칙.
    """
    t = norm_text(v)
    if not t:
        return t
    t = re.sub(r"\s*[,\uFF0C]\s*", ", ", t)
    return re.sub(r"(, )+", ", ", t).strip(", ")


def placeholder_case_reason(row: dict) -> str:
    """Detect rows whose 발명명칭 is an administrative closure note, not a title.

    Confirmed sample (2026 Q2 상세목록, P250105KR):
      발명명칭 = '본 건은 발명자의 의사에 따라 사건 종결 처리된 건입니다.'
    Matching is deliberately restricted to the 발명명칭(title) field: the same
    wording inside 메모/상태세부 belongs to real patents (e.g. 등록포기 memos)
    and those rows must remain in the report lists.
    """
    t = norm_text(row.get("title")).replace(" ", "")
    if not t:
        return ""
    if "발명자" in t and "의사" in t and ("종결" in t or t.startswith("본건은")):
        return "발명명칭이 발명자 의사에 따른 사건 종결 안내문"
    return ""


def norm_reg_no(v: Any) -> str:
    s = norm_text(v).upper().replace(" ", "")
    return re.sub(r"-00-00$", "", s)


def norm_app_no(v: Any) -> str:
    s = norm_text(v).upper().replace(" ", "")
    if re.fullmatch(r"10-\d{4}-\d{7}", s):
        return s[3:]
    return s


# -----------------------------------------------------------------------------
# Quarter model: the only period selector in the GUI
# -----------------------------------------------------------------------------
@dataclass(frozen=True, order=True)
class Quarter:
    year: int
    quarter: int

    def __post_init__(self):
        if self.quarter not in (1, 2, 3, 4):
            raise ValueError("quarter must be 1..4")

    @property
    def start(self) -> dt.datetime:
        month = (self.quarter - 1) * 3 + 1
        return dt.datetime(self.year, month, 1)

    @property
    def end(self) -> dt.datetime:
        month = self.quarter * 3
        if month == 12:
            return dt.datetime(self.year, 12, 31)
        return dt.datetime(self.year, month + 1, 1) - dt.timedelta(days=1)

    @property
    def code(self) -> str:
        return f"{self.year}Q{self.quarter}"

    @property
    def label(self) -> str:
        return f"{self.year}년 {self.quarter}분기"


def next_quarter(q: Quarter) -> Quarter:
    """Return the quarter immediately following *q*, rolling the year at Q4."""
    return Quarter(q.year + 1, 1) if q.quarter == 4 else Quarter(q.year, q.quarter + 1)


def waiver_reporting_quarter(selected: Sequence[Quarter]) -> Quarter:
    """Display/reporting quarter for waiver agenda items.

    KRISS waiver reporting is one quarter ahead of the main filing/registration/
    foreign-review period.  The MarkPro workbook itself remains the source of
    truth for which annual-fee cases are waiver targets; this quarter is metadata
    for the committee report and is intentionally NOT used as an extra row filter.
    """
    if not selected:
        raise ValueError("At least one quarter must be selected")
    return next_quarter(max(selected))


def date_in_quarters(v: Any, selected: Sequence[Quarter]) -> bool:
    d = excel_serial_to_datetime(v)
    if not d:
        return False
    return any(q.start.date() <= d.date() <= q.end.date() for q in selected)


def selected_period_label(selected: Sequence[Quarter]) -> str:
    qs = sorted(set(selected))
    if not qs:
        return "분기 미선택"
    if len(qs) == 1:
        return qs[0].label
    contiguous = all(
        (b.year * 4 + b.quarter) - (a.year * 4 + a.quarter) == 1
        for a, b in zip(qs, qs[1:])
    )
    if contiguous:
        return f"{qs[0].label} \u223c {qs[-1].label}"
    return ", ".join(q.label for q in qs)


def graph_cutoff(selected: Sequence[Quarter]) -> dt.datetime:
    if not selected:
        raise ValueError("At least one quarter must be selected")
    return max(q.end for q in selected)


def resolve_graph_window(
    years: Sequence[int],
    mode: str = GRAPH_DEFAULT_MODE,
    start_year: Optional[int] = None,
    end_year: Optional[int] = None,
) -> tuple[int, int]:
    """Resolve the chart display window against the available data years.

    *years* is the full list of years present in 20_그래프데이터. The returned
    (start, end) pair is always clamped inside that list, so an out-of-range
    advanced setting can never produce an empty chart.
    """
    ys = sorted({int(y) for y in years})
    if not ys:
        raise ValueError("그래프 데이터 연도가 비어 있습니다.")
    lo, hi = ys[0], ys[-1]
    if mode == "custom":
        s = lo if start_year is None else int(start_year)
        e = hi if end_year is None else int(end_year)
        if s > e:
            s, e = e, s
        s = max(lo, min(hi, s))
        e = max(lo, min(hi, e))
        return s, e
    if mode == "all":
        return lo, hi
    span = 5 if mode == "recent5" else 10
    return max(lo, hi - span + 1), hi


def graph_window_label(mode: str, start_year: int, end_year: int) -> str:
    base = GRAPH_RANGE_LABELS.get(mode, mode)
    return f"{base} ({start_year}\u223c{end_year})"


def parse_quarters(s: str) -> list[Quarter]:
    out: list[Quarter] = []
    for token in re.split(r"[,; ]+", s.strip()):
        if not token:
            continue
        m = re.fullmatch(r"(20\d{2})[Qq]([1-4])", token)
        if not m:
            raise ValueError(f"Invalid quarter: {token} (example: 2025Q4,2026Q1)")
        out.append(Quarter(int(m.group(1)), int(m.group(2))))
    return sorted(set(out))

def foreign_review_window(settings: "Settings") -> tuple[dt.datetime, dt.datetime]:
    """Request-date window for foreign filing review.

    Normally this is the selected quarter span. For the 1st committee, KRISS's
    historical 2026-1 sample carries over the final day immediately before Q4
    (2025-09-30), so that one boundary day is included when Q4 of the previous
    year is part of the selection. This reproduces the confirmed 14 review items
    using only the IP detail workbook.
    """
    if not settings.quarters:
        raise ValueError("At least one quarter must be selected")
    qs = sorted(set(settings.quarters))
    start = min(q.start for q in qs)
    end = max(q.end for q in qs)
    if settings.meeting_round.startswith("1차") and qs[0].quarter == 4:
        start -= dt.timedelta(days=1)
    return start, end


# -----------------------------------------------------------------------------
# Lightweight XLSX reader (read-only, standard library)
# -----------------------------------------------------------------------------
XLSX_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _col_num(cell_ref: str) -> int:
    m = re.match(r"([A-Z]+)", cell_ref)
    if not m:
        return 1
    n = 0
    for ch in m.group(1):
        n = n * 26 + ord(ch) - 64
    return n


def _coerce_number(s: str) -> Any:
    try:
        if re.fullmatch(r"[-+]?\d+", s):
            return int(s)
        return float(s)
    except Exception:
        return s


class XlsxBookReader:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        if not self.path.exists():
            raise FileNotFoundError(self.path)
        self.z = zipfile.ZipFile(self.path)
        self.shared_strings = self._read_shared_strings()
        self.sheet_targets = self._read_sheet_targets()

    def close(self):
        self.z.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def _read_shared_strings(self) -> list[str]:
        out: list[str] = []
        if "xl/sharedStrings.xml" not in self.z.namelist():
            return out
        root = ET.fromstring(self.z.read("xl/sharedStrings.xml"))
        for si in root.findall(f"{{{XLSX_NS}}}si"):
            out.append("".join((t.text or "") for t in si.iter(f"{{{XLSX_NS}}}t")))
        return out

    def _read_sheet_targets(self) -> dict[str, str]:
        wb = ET.fromstring(self.z.read("xl/workbook.xml"))
        relroot = ET.fromstring(self.z.read("xl/_rels/workbook.xml.rels"))
        rels = {r.attrib["Id"]: r.attrib["Target"] for r in relroot}
        out: dict[str, str] = {}
        sheets = wb.find(f"{{{XLSX_NS}}}sheets")
        if sheets is None:
            return out
        for s in sheets:
            name = s.attrib["name"]
            target = rels[s.attrib[f"{{{REL_NS}}}id"]].lstrip("/")
            if not target.startswith("xl/"):
                target = "xl/" + target
            out[name] = target
        return out

    @property
    def sheet_names(self) -> list[str]:
        return list(self.sheet_targets)

    def read_sheet(self, sheet_name: Optional[str] = None) -> list[list[Any]]:
        if sheet_name is None:
            if not self.sheet_names:
                return []
            sheet_name = self.sheet_names[0]
        root = ET.fromstring(self.z.read(self.sheet_targets[sheet_name]))
        sd = root.find(f"{{{XLSX_NS}}}sheetData")
        if sd is None:
            return []
        sparse: dict[int, dict[int, Any]] = {}
        max_col = 0
        max_row = 0
        for row in sd.findall(f"{{{XLSX_NS}}}row"):
            rnum = int(row.attrib["r"])
            rd: dict[int, Any] = {}
            row_max = 0
            for c in row.findall(f"{{{XLSX_NS}}}c"):
                cnum = _col_num(c.attrib.get("r", "A1"))
                row_max = max(row_max, cnum)
                typ = c.attrib.get("t")
                v = c.find(f"{{{XLSX_NS}}}v")
                value: Any = ""
                if typ == "s" and v is not None:
                    try:
                        value = self.shared_strings[int(v.text or "0")]
                    except Exception:
                        value = ""
                elif typ == "inlineStr":
                    value = "".join((t.text or "") for t in c.iter(f"{{{XLSX_NS}}}t"))
                elif typ in {"str", "e"} and v is not None:
                    value = v.text or ""
                elif typ == "b" and v is not None:
                    value = (v.text == "1")
                elif v is not None:
                    value = _coerce_number(v.text or "")
                rd[cnum] = value
            if any(v not in ("", None) for v in rd.values()):
                sparse[rnum] = rd
                max_row = max(max_row, rnum)
                max_col = max(max_col, row_max)
        return [[sparse.get(r, {}).get(c, "") for c in range(1, max_col + 1)] for r in range(1, max_row + 1)]


@dataclass
class FieldSpec:
    candidates: tuple[str, ...]
    fallback_col: int


IP_SCHEMA: dict[str, FieldSpec] = {
    "seq": FieldSpec(("순번",), 1),
    "mgmt": FieldSpec(("관리번호",), 2),
    "request_no": FieldSpec(("신청번호",), 3),
    "right_type": FieldSpec(("지재권구분",), 4),
    "domestic": FieldSpec(("국내외",), 5),
    "country": FieldSpec(("출원국가",), 6),
    "filing_type": FieldSpec(("출원종류",), 7),
    "status": FieldSpec(("특허상태상태", "특허상태"), 8),
    "status_detail": FieldSpec(("상태세부",), 9),
    "title": FieldSpec(("발명명칭(국문)",), 15),
    "main_inventor": FieldSpec(("주발명자",), 17),
    "inventor_names": FieldSpec(("발명자(이름)",), 24),
    "ownership_type": FieldSpec(("단독/공동",), 25),
    "owner": FieldSpec(("권리자",), 26),
    "owner_share": FieldSpec(("특허권자지분",), 27),
    "office": FieldSpec(("특허사무소",), 28),
    "ip_request_date": FieldSpec(("지재권신청일",), 29),
    "app_date": FieldSpec(("출원일자",), 31),
    "app_no": FieldSpec(("출원번호",), 32),
    "reg_date": FieldSpec(("등록일자",), 34),
    "reg_no": FieldSpec(("등록번호",), 35),
    "science": FieldSpec(("과학기술",), 36),
    "industry": FieldSpec(("산업기술",), 37),
    "family_no": FieldSpec(("패밀리번호",), 40),
    "transfer": FieldSpec(("특허활용정보기술이전", "기술이전"), 41),
}

MARKPRO_SCHEMA: dict[str, FieldSpec] = {
    "seq": FieldSpec(("번호",), 1),
    "pay": FieldSpec(("납부여부",), 2),
    "pay_class": FieldSpec(("납부구분",), 3),
    "country": FieldSpec(("국가",), 4),
    "app_no": FieldSpec(("출원번호",), 7),
    "app_date": FieldSpec(("출원일자",), 8),
    "reg_no": FieldSpec(("등록번호",), 9),
    "reg_date": FieldSpec(("등록일자",), 10),
    "mgmt": FieldSpec(("고객관리번호",), 11),
    "owner": FieldSpec(("권리인명",), 17),
    "title": FieldSpec(("발명의명칭",), 30),
    "inventors": FieldSpec(("발명자이름",), 31),
}


def _resolve_indices(matrix: list[list[Any]], header_rows: int, schema: dict[str, FieldSpec]) -> dict[str, int]:
    max_cols = max((len(r) for r in matrix[:header_rows]), default=0)
    labels_by_col: list[set[str]] = []
    for c in range(max_cols):
        vals = [norm_header(matrix[r][c]) for r in range(header_rows) if c < len(matrix[r]) and norm_header(matrix[r][c])]
        combined = "".join(vals)
        labels_by_col.append(set(vals + ([combined] if combined else [])))
    out: dict[str, int] = {}
    for name, spec in schema.items():
        cand = {norm_header(x) for x in spec.candidates}
        found = next((i for i, labels in enumerate(labels_by_col) if cand & labels), None)
        out[name] = spec.fallback_col - 1 if found is None else found
    return out


def matrix_to_records(matrix: list[list[Any]], header_rows: int, schema: dict[str, FieldSpec]) -> list[dict[str, Any]]:
    if len(matrix) <= header_rows:
        return []
    idx = _resolve_indices(matrix, header_rows, schema)
    out: list[dict[str, Any]] = []
    for source_row, row in enumerate(matrix[header_rows:], start=header_rows + 1):
        rec = {name: (row[c] if c < len(row) else "") for name, c in idx.items()}
        for k in ("inventor_names", "inventors", "main_inventor"):
            if k in rec:
                rec[k] = normalize_name_list(rec[k])
        rec["_source_row"] = source_row
        if any(norm_text(rec.get(k)) for k in schema):
            out.append(rec)
    return out


# -----------------------------------------------------------------------------
# HWP/HWPX text extraction (matching only; original form remains untouched)
# -----------------------------------------------------------------------------
FREE = 0xFFFFFFFF
END = 0xFFFFFFFE


class _CFB:
    def __init__(self, path: str | Path):
        self.data = Path(path).read_bytes()
        h = self.data[:512]
        if h[:8] != bytes.fromhex("D0CF11E0A1B11AE1"):
            raise ValueError("not classic HWP/CFB")
        self.major = struct.unpack_from("<H", h, 26)[0]
        self.sector_size = 1 << struct.unpack_from("<H", h, 30)[0]
        self.mini_sector_size = 1 << struct.unpack_from("<H", h, 32)[0]
        self.num_fat = struct.unpack_from("<I", h, 44)[0]
        self.first_dir = struct.unpack_from("<I", h, 48)[0]
        self.mini_cutoff = struct.unpack_from("<I", h, 56)[0]
        self.first_mini_fat = struct.unpack_from("<I", h, 60)[0]
        self.num_mini_fat = struct.unpack_from("<I", h, 64)[0]
        self.first_difat = struct.unpack_from("<I", h, 68)[0]
        self.num_difat = struct.unpack_from("<I", h, 72)[0]
        difat = [x for x in struct.unpack_from("<109I", h, 76) if x not in (FREE, END)]
        sid = self.first_difat
        for _ in range(self.num_difat):
            if sid in (FREE, END):
                break
            vals = struct.unpack("<%dI" % (self.sector_size // 4), self.sector(sid))
            difat += [x for x in vals[:-1] if x not in (FREE, END)]
            sid = vals[-1]
        self.fat: list[int] = []
        for fsid in difat[:self.num_fat]:
            self.fat.extend(struct.unpack("<%dI" % (self.sector_size // 4), self.sector(fsid)))
        dir_bytes = self.read_chain(self.first_dir, None)
        self.entries: list[dict[str, Any]] = []
        for off in range(0, len(dir_bytes), 128):
            e = dir_bytes[off:off + 128]
            if len(e) < 128:
                break
            nlen = struct.unpack_from("<H", e, 64)[0]
            name = e[:max(0, nlen - 2)].decode("utf-16le", "ignore") if nlen >= 2 else ""
            typ = e[66]
            start = struct.unpack_from("<I", e, 116)[0]
            size = struct.unpack_from("<Q", e, 120)[0]
            if self.major == 3:
                size &= 0xFFFFFFFF
            self.entries.append({"name": name, "type": typ, "start": start, "size": size})
        self.root = next((e for e in self.entries if e["type"] == 5), None)
        self.ministream = self.read_chain(self.root["start"], self.root["size"]) if self.root and self.root["start"] not in (FREE, END) else b""
        self.minifat: list[int] = []
        if self.num_mini_fat and self.first_mini_fat not in (FREE, END):
            mb = self.read_chain(self.first_mini_fat, self.num_mini_fat * self.sector_size)
            self.minifat = list(struct.unpack("<%dI" % (len(mb) // 4), mb[:len(mb) // 4 * 4]))

    def sector(self, sid: int) -> bytes:
        a = (sid + 1) * self.sector_size
        return self.data[a:a + self.sector_size]

    def read_chain(self, start: int, size: Optional[int] = None) -> bytes:
        if start in (FREE, END):
            return b""
        out: list[bytes] = []
        sid = start
        seen: set[int] = set()
        while sid not in (FREE, END) and sid < len(self.fat) and sid not in seen:
            seen.add(sid)
            out.append(self.sector(sid))
            sid = self.fat[sid]
            if size is not None and len(out) * self.sector_size >= size:
                break
        data = b"".join(out)
        return data[:size] if size is not None else data

    def read_mini(self, start: int, size: int) -> bytes:
        if start in (FREE, END):
            return b""
        out: list[bytes] = []
        sid = start
        seen: set[int] = set()
        while sid not in (FREE, END) and sid < len(self.minifat) and sid not in seen:
            seen.add(sid)
            a = sid * self.mini_sector_size
            out.append(self.ministream[a:a + self.mini_sector_size])
            sid = self.minifat[sid]
            if len(out) * self.mini_sector_size >= size:
                break
        return b"".join(out)[:size]

    def stream(self, name: str) -> Optional[bytes]:
        e = next((e for e in self.entries if e["type"] == 2 and e["name"] == name), None)
        if not e:
            return None
        return self.read_mini(e["start"], e["size"]) if e["size"] < self.mini_cutoff else self.read_chain(e["start"], e["size"])


def extract_classic_hwp_text(path: str | Path) -> str:
    c = _CFB(path)
    fh = c.stream("FileHeader") or b""
    flags = struct.unpack_from("<I", fh, 36)[0] if len(fh) >= 40 else 0
    compressed = bool(flags & 1)
    encrypted = bool(flags & 2)
    if encrypted:
        raise ValueError("encrypted HWP")
    secs: list[tuple[int, str]] = []
    for e in c.entries:
        if e["type"] == 2 and re.fullmatch(r"Section\d+", e["name"]):
            secs.append((int(e["name"][7:]), e["name"]))
    secs.sort()
    out: list[str] = []
    for _, name in secs:
        b = c.stream(name) or b""
        if compressed:
            b = zlib.decompress(b, -15)
        pos = 0
        while pos + 4 <= len(b):
            hdr = struct.unpack_from("<I", b, pos)[0]
            pos += 4
            tag = hdr & 0x3FF
            size = (hdr >> 20) & 0xFFF
            if size == 0xFFF:
                if pos + 4 > len(b):
                    break
                size = struct.unpack_from("<I", b, pos)[0]
                pos += 4
            payload = b[pos:pos + size]
            pos += size
            if tag == 67:
                s = payload.decode("utf-16le", "ignore")
                s = "".join("\n" if ch in "\r\n" else " " if ord(ch) < 32 else ch for ch in s)
                s = re.sub(r"[ \t]+", " ", s)
                s = re.sub(r"\n+", "\n", s).strip()
                if s:
                    out.append(s)
    return "\n".join(out)


def extract_hwpx_text(path: str | Path) -> str:
    out: list[str] = []
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if n.lower().endswith(".xml") and ("section" in n.lower() or "content" in n.lower())]
        for name in sorted(names):
            try:
                root = ET.fromstring(z.read(name))
                for elem in root.iter():
                    if elem.text and elem.text.strip():
                        out.append(elem.text.strip())
            except Exception:
                continue
    return "\n".join(out)


def extract_review_text(path: str | Path) -> tuple[str, str]:
    p = Path(path)
    try:
        if p.suffix.lower() == ".hwp":
            return extract_classic_hwp_text(p), "HWP text"
        if p.suffix.lower() == ".hwpx":
            return extract_hwpx_text(p), "HWPX text"
    except Exception as e:
        return "", f"text extraction failed: {e}"
    return "", "filename only"


COUNTRY_ALIASES: dict[str, tuple[str, ...]] = {
    "PCT": ("PCT",),
    "미국": ("미국", "USA", "UNITEDSTATES", "US"),
    "중국": ("중국", "CHINA", "CN"),
    "일본": ("일본", "JAPAN", "JP"),
    "유럽 연합": ("유럽연합", "유럽", "EU", "EPO"),
    "싱가포르": ("싱가포르", "SINGAPORE", "SG"),
    "독일": ("독일", "GERMANY", "DE"),
    "영국": ("영국", "UK", "GB", "UNITEDKINGDOM"),
    "프랑스": ("프랑스", "FRANCE", "FR"),
}
DIVISIONS = ("물리", "화학", "바이오", "양자", "전략", "직속")


def canonical_country(v: Any) -> str:
    s = canon(v)
    if s == "PCT":
        return "PCT"
    for key, aliases in COUNTRY_ALIASES.items():
        if any(canon(a) == s for a in aliases):
            return key
    return norm_text(v)


def detect_country_from_text(text: str) -> str:
    ctext = canon(text)
    # PCT first because it is very distinctive in these forms.
    if "PCT" in ctext:
        return "PCT"
    for key, aliases in COUNTRY_ALIASES.items():
        if key == "PCT":
            continue
        if any(canon(a) and canon(a) in ctext for a in aliases if len(canon(a)) >= 2):
            return key
    return ""


def detect_division(path: str | Path, text: str) -> str:
    hay = canon(str(Path(path).parent) + " " + Path(path).stem + " " + text[:3000])
    for d in DIVISIONS:
        if canon(d) in hay:
            return d
    return ""


def detect_main_inventor(text: str) -> str:
    flat = re.sub(r"[\t\r]+", "\n", text)
    patterns = [
        r"주발명자\s*[:：]?\s*([가-힣]{2,5})",
        r"주\s*발명자\s*[:：]?\s*([가-힣]{2,5})",
    ]
    for pat in patterns:
        m = re.search(pat, flat)
        if m:
            return m.group(1)
    return ""


@dataclass
class ReviewDoc:
    path: str
    order: int
    filename: str
    text: str = ""
    text_source: str = ""
    country_hint: str = ""
    inventor_hint: str = ""
    division_hint: str = ""
    matched_mgmt: str = ""
    match_score: float = 0.0
    match_status: str = "미매칭"
    match_note: str = ""


def load_review_docs(paths: Sequence[str | Path], log: Callable[[str], None] = print) -> list[ReviewDoc]:
    unique = sorted({str(Path(p).resolve()) for p in paths if Path(p).suffix.lower() in {".hwp", ".hwpx"}}, key=natural_key)
    out: list[ReviewDoc] = []
    for i, p in enumerate(unique, 1):
        text, src = extract_review_text(p)
        doc = ReviewDoc(
            path=p,
            order=i,
            filename=Path(p).name,
            text=text,
            text_source=src,
            country_hint=detect_country_from_text(text + " " + Path(p).stem),
            inventor_hint=detect_main_inventor(text),
            division_hint=detect_division(p, text),
        )
        out.append(doc)
        log(f"심의서 {i:02d}: {Path(p).name} / {src}")
    return out


def _title_similarity(a: str, b: str) -> float:
    ca, cb = canon(a), canon(b)
    if not ca or not cb:
        return 0.0
    if ca in cb or cb in ca:
        return 1.0
    return difflib.SequenceMatcher(None, ca, cb).ratio()


def candidate_is_near_period(row: dict, selected: Sequence[Quarter]) -> bool:
    # Either internal request date or actual filing date may belong to the meeting quarters.
    # This deliberately handles retroactive internal filing reports.
    return date_in_quarters(row.get("ip_request_date"), selected) or date_in_quarters(row.get("app_date"), selected)


def score_review_candidate(doc: ReviewDoc, row: dict, selected: Sequence[Quarter]) -> tuple[float, list[str]]:
    if norm_text(row.get("right_type")) != "특허":
        return -999.0, []
    if norm_text(row.get("domestic")) == "국내":
        return -999.0, []

    blob = canon(Path(doc.path).stem + " " + doc.text)
    title = norm_text(row.get("title"))
    ctitle = canon(title)
    score = 0.0
    notes: list[str] = []

    mgmt = canon(row.get("mgmt"))
    app_no = canon(row.get("app_no"))
    if mgmt and mgmt in blob:
        score += 500
        notes.append("관리번호")
    if app_no and len(app_no) >= 6 and app_no in blob:
        score += 350
        notes.append("출원번호")
    if ctitle:
        if ctitle in blob:
            score += 280
            notes.append("발명명칭")
        else:
            stem_sim = _title_similarity(Path(doc.path).stem, title)
            if stem_sim >= 0.45:
                score += stem_sim * 130
                notes.append(f"파일명유사{stem_sim:.2f}")

    inv = norm_text(row.get("main_inventor"))
    if doc.inventor_hint and canon(doc.inventor_hint) == canon(inv):
        score += 120
        notes.append("주발명자")
    elif inv and canon(inv) in blob:
        score += 70
        notes.append("발명자본문")

    row_country = canonical_country(row.get("country"))
    if doc.country_hint and canonical_country(doc.country_hint) == row_country:
        score += 80
        notes.append("국가")

    if candidate_is_near_period(row, selected):
        score += 35
        notes.append("선택분기근접")

    # Prefer more recent current records on otherwise equal scores.
    d = excel_serial_to_datetime(row.get("ip_request_date")) or excel_serial_to_datetime(row.get("app_date"))
    if d:
        score += min(20.0, max(0.0, (d.year - 2020) * 2 + d.month / 12))
    return score, notes


def match_review_docs(docs: list[ReviewDoc], ip_rows: list[dict], selected: Sequence[Quarter]) -> list[dict]:
    foreign = [r for r in ip_rows if norm_text(r.get("right_type")) == "특허" and norm_text(r.get("domestic")) != "국내"]
    used: set[str] = set()
    matched_rows: list[dict] = []

    for doc in docs:
        scored: list[tuple[float, dict, list[str]]] = []
        for r in foreign:
            mgmt = norm_text(r.get("mgmt"))
            if not mgmt or mgmt in used:
                continue
            score, notes = score_review_candidate(doc, r, selected)
            if score > 0:
                scored.append((score, r, notes))
        scored.sort(key=lambda x: x[0], reverse=True)
        if not scored or scored[0][0] < 100:
            doc.match_status = "미매칭"
            doc.match_note = "상세목록에서 충분한 후보를 찾지 못함"
            matched_rows.append({"review": doc, "ip": None, "final": "확인", "reason": doc.match_note})
            continue

        top_score, top, notes = scored[0]
        second_score = scored[1][0] if len(scored) > 1 else -999.0
        ambiguous = (top_score - second_score) < 25 and second_score >= 100
        doc.matched_mgmt = norm_text(top.get("mgmt"))
        doc.match_score = top_score
        doc.match_status = "확인필요" if ambiguous else "매칭"
        doc.match_note = ", ".join(notes) + (f" / 2순위와 점수차 {top_score-second_score:.1f}" if ambiguous else "")
        used.add(doc.matched_mgmt)

        status = norm_text(top.get("status"))
        detail = norm_text(top.get("status_detail"))
        cancelled = ("취소" in status) or ("취소" in detail)
        final = "X" if cancelled else "O"
        reason = "상세목록 신청취소" if cancelled else ("심의서+상세목록 매칭")
        matched_rows.append({"review": doc, "ip": top, "final": final, "reason": reason})

    return matched_rows


# -----------------------------------------------------------------------------
# Business logic
# -----------------------------------------------------------------------------
@dataclass
class Settings:
    meeting_year: int
    meeting_round: str
    quarters: list[Quarter]
    excel_visible: bool = False
    validate_reopen: bool = True
    # Advanced: chart display window only. 20_그래프데이터 keeps the full period.
    graph_range_mode: str = GRAPH_DEFAULT_MODE
    graph_start_year: Optional[int] = None
    graph_end_year: Optional[int] = None
    graph_style: str = GRAPH_DEFAULT_STYLE

    def __post_init__(self):
        if self.graph_range_mode not in GRAPH_RANGE_MODES:
            raise ValueError(f"graph_range_mode must be one of {GRAPH_RANGE_MODES}")
        if self.graph_style not in GRAPH_STYLE_MODES:
            raise ValueError(f"graph_style must be one of {GRAPH_STYLE_MODES}")

    @property
    def period_label(self) -> str:
        return selected_period_label(self.quarters)

    @property
    def cutoff(self) -> dt.datetime:
        return graph_cutoff(self.quarters)

    @property
    def waiver_quarter(self) -> Quarter:
        return waiver_reporting_quarter(self.quarters)

    @property
    def waiver_period_label(self) -> str:
        return self.waiver_quarter.label

    def graph_window(self, years: Sequence[int]) -> tuple[int, int]:
        return resolve_graph_window(years, self.graph_range_mode, self.graph_start_year, self.graph_end_year)


@dataclass
class BuildResult:
    applications: list[dict]
    app_excluded: list[dict]
    registrations: list[dict]
    review_matches: list[dict]
    foreign_final: list[dict]
    foreign_excluded: list[dict]
    waivers: list[dict]
    graph_app: list[dict]
    graph_reg: list[dict]
    validation: list[list[Any]]
    graph_window: tuple[int, int] = (0, 0)
    graph_window_label: str = ""

    @property
    def graph_window_index(self) -> tuple[int, int]:
        """0-based [first, last] index into graph_app/graph_reg for the chart."""
        years = [r["year"] for r in self.graph_app]
        if not years:
            return (0, 0)
        s, e = self.graph_window
        idx = [i for i, y in enumerate(years) if s <= y <= e]
        if not idx:
            return (0, len(years) - 1)
        return (idx[0], idx[-1])


def build_applications(ip_rows: list[dict], settings: Settings) -> tuple[list[dict], list[dict]]:
    selected, excluded = [], []
    for r in ip_rows:
        if norm_text(r.get("right_type")) != "특허" or not date_in_quarters(r.get("app_date"), settings.quarters):
            continue
        out = dict(r)
        out["app_dt"] = excel_serial_to_datetime(r.get("app_date"))
        placeholder = placeholder_case_reason(r)
        if placeholder:
            out["reason"] = placeholder
            excluded.append(out)
        elif valid_application_number(r.get("app_no")):
            out["reason"] = "유효 출원번호"
            selected.append(out)
        else:
            out["reason"] = "출원번호 공란/출원전/더미번호"
            excluded.append(out)
    selected.sort(key=lambda x: (x.get("app_dt") or dt.datetime.min, norm_text(x.get("app_no"))), reverse=True)
    excluded.sort(key=lambda x: x.get("app_dt") or dt.datetime.min, reverse=True)
    return selected, excluded


def build_registrations(ip_rows: list[dict], settings: Settings) -> list[dict]:
    out = []
    for r in ip_rows:
        if norm_text(r.get("right_type")) != "특허" or not date_in_quarters(r.get("reg_date"), settings.quarters):
            continue
        if placeholder_case_reason(r):
            continue
        if not valid_registration_number(r.get("reg_no")):
            continue
        z = dict(r)
        z["reg_dt"] = excel_serial_to_datetime(r.get("reg_date"))
        out.append(z)
    out.sort(key=lambda x: (x.get("reg_dt") or dt.datetime.min, norm_text(x.get("reg_no"))), reverse=True)
    return out


def _is_pct_row(row: dict) -> bool:
    return norm_text(row.get("domestic")) == "PCT" or canonical_country(row.get("country")) == "PCT"


def build_foreign_reviews(ip_rows: list[dict], settings: Settings) -> tuple[list[dict], list[dict]]:
    """Derive foreign filing review items directly from the IP detail workbook.

    Confirmed logic (2026-1 regression sample):
      - patent only, non-domestic
      - internal IP request date inside the review window
      - exclude application cancellations
      - exclude European re-registration rows
      - general foreign national filings are excluded when the same family already
        has an earlier PCT request/filing
      - PCT itself is included when it is the first PCT in that family
    """
    start, end = foreign_review_window(settings)
    pct_by_family: dict[str, list[dict]] = {}
    for r in ip_rows:
        if norm_text(r.get("right_type")) != "특허" or not _is_pct_row(r):
            continue
        fam = norm_text(r.get("family_no"))
        if fam:
            pct_by_family.setdefault(fam, []).append(r)

    selected: list[dict] = []
    excluded: list[dict] = []
    for r in ip_rows:
        if norm_text(r.get("right_type")) != "특허":
            continue
        if norm_text(r.get("domestic")) == "국내":
            continue
        req = excel_serial_to_datetime(r.get("ip_request_date"))
        if not req or not (start.date() <= req.date() <= end.date()):
            continue

        z = dict(r)
        z["request_dt"] = req
        z["app_dt"] = excel_serial_to_datetime(r.get("app_date"))
        z["prior_pct_mgmt"] = ""
        status = norm_text(r.get("status"))
        detail = norm_text(r.get("status_detail"))
        filing_type = norm_text(r.get("filing_type"))

        placeholder = placeholder_case_reason(r)
        if placeholder:
            z["review_reason"] = placeholder
            excluded.append(z)
            continue
        if "취소" in status or "취소" in detail:
            z["review_reason"] = "신청취소"
            excluded.append(z)
            continue
        if "유럽건재등록" in canon(filing_type) or ("유럽" in filing_type and "재등록" in filing_type):
            z["review_reason"] = "유럽건 재등록"
            excluded.append(z)
            continue

        fam = norm_text(r.get("family_no"))
        prior_pct: list[dict] = []
        if fam:
            for p in pct_by_family.get(fam, []):
                if norm_text(p.get("mgmt")) == norm_text(r.get("mgmt")):
                    continue
                pd = excel_serial_to_datetime(p.get("ip_request_date")) or excel_serial_to_datetime(p.get("app_date"))
                if pd and pd.date() < req.date():
                    prior_pct.append(p)
        prior_pct.sort(key=lambda p: excel_serial_to_datetime(p.get("ip_request_date")) or excel_serial_to_datetime(p.get("app_date")) or dt.datetime.min)

        if prior_pct:
            z["prior_pct_mgmt"] = norm_text(prior_pct[-1].get("mgmt"))
            z["review_reason"] = "동일 패밀리 PCT 기출원"
            excluded.append(z)
            continue

        z["review_reason"] = "최초 PCT" if _is_pct_row(r) else "최초 해외특허"
        selected.append(z)

    selected.sort(key=lambda x: (x.get("request_dt") or dt.datetime.min, norm_text(x.get("mgmt"))), reverse=True)
    excluded.sort(key=lambda x: (x.get("request_dt") or dt.datetime.min, norm_text(x.get("mgmt"))), reverse=True)
    return selected, excluded


def build_waivers(markpro_rows: list[dict], ip_rows: list[dict]) -> list[dict]:
    ip_by_mgmt = {norm_text(r.get("mgmt")): r for r in ip_rows if norm_text(r.get("mgmt"))}
    out: list[dict] = []
    for m in markpro_rows:
        # 포기심의 대상의 원천 판정 필드는 MarkPro의 `납부구분`이다.
        # `납부여부=N`은 현재 샘플에서는 동일하게 나타나지만, 향후 값이
        # 달라져도 포기대상을 누락시키지 않도록 필터 조건으로 사용하지 않는다.
        # 괄호/공백 등 표현 차이를 허용해 납부구분에 '포기'가 포함되면 대상이다.
        pay_class = norm_text(m.get("pay_class"))
        if "포기" not in canon(pay_class):
            continue
        mgmt = norm_text(m.get("mgmt"))
        ip = ip_by_mgmt.get(mgmt)
        title_match = "미매칭" if not ip else ("일치" if norm_text(m.get("title")) == norm_text(ip.get("title")) else "불일치")
        reg_match = "미매칭" if not ip else ("일치" if norm_reg_no(m.get("reg_no")) == norm_reg_no(ip.get("reg_no")) else "불일치")
        app_match = "미매칭" if not ip else ("일치" if norm_app_no(m.get("app_no")) == norm_app_no(ip.get("app_no")) else "불일치")
        issues = [name for name, val in (("제목", title_match), ("등록번호", reg_match), ("출원번호", app_match)) if val != "일치"]
        out.append({
            "mgmt": mgmt,
            "country": m.get("country"),
            "reg_date": excel_serial_to_datetime(m.get("reg_date")) or m.get("reg_date"),
            "reg_no": m.get("reg_no"),
            "app_no": m.get("app_no"),
            "title": m.get("title"),
            "inventor_names": ip.get("inventor_names") if ip else "",
            "ownership_type": ip.get("ownership_type") if ip else "",
            "owner": ip.get("owner") if ip else m.get("owner"),
            "transfer": ip.get("transfer") if ip else "",
            "status": ip.get("status") if ip else "",
            "status_detail": ip.get("status_detail") if ip else "",
            "pay": m.get("pay"),
            "pay_class": m.get("pay_class"),
            "title_match": title_match,
            "reg_match": reg_match,
            "app_match": app_match,
            "verification": "정상" if not issues else ", ".join(issues),
            "join_status": "매칭" if ip else "상세목록 미매칭",
        })
    return out


def build_graph_data(ip_rows: list[dict], settings: Settings, start_year: int = GRAPH_DATA_START_YEAR) -> tuple[list[dict], list[dict]]:
    """Build the FULL-period graph table.

    This is intentionally independent of the chart display window. The chart
    window (advanced setting) only narrows what 30_그래프 and the PNG files
    show; 20_그래프데이터 always carries every year from *start_year* to the
    cutoff year.
    """
    cutoff = settings.cutoff
    app_rows: list[dict] = []
    reg_rows: list[dict] = []
    for year in range(start_year, cutoff.year + 1):
        year_start = dt.datetime(year, 1, 1)
        year_end = dt.datetime(year, 12, 31) if year < cutoff.year else cutoff
        a = {"domestic": 0, "pct": 0, "foreign_general": 0}
        r = {"domestic": 0, "foreign": 0}
        for row in ip_rows:
            if norm_text(row.get("right_type")) != "특허":
                continue
            if placeholder_case_reason(row):
                continue
            d = excel_serial_to_datetime(row.get("app_date"))
            if d and year_start.date() <= d.date() <= year_end.date() and valid_application_number(row.get("app_no")):
                if norm_text(row.get("domestic")) == "국내":
                    a["domestic"] += 1
                elif norm_text(row.get("domestic")) == "PCT" or canonical_country(row.get("country")) == "PCT":
                    a["pct"] += 1
                else:
                    a["foreign_general"] += 1
            rd = excel_serial_to_datetime(row.get("reg_date"))
            if rd and year_start.date() <= rd.date() <= year_end.date() and valid_registration_number(row.get("reg_no")):
                if norm_text(row.get("domestic")) == "국내":
                    r["domestic"] += 1
                else:
                    r["foreign"] += 1
        a["foreign_pct"] = a["pct"] + a["foreign_general"]
        a["total"] = a["domestic"] + a["foreign_pct"]
        r["total"] = r["domestic"] + r["foreign"]
        label = f"{year}" if year < cutoff.year else f"{year}.{cutoff.month} 누계"
        app_rows.append({"year": year, "label": label, **a, "source": "지식재산권 상세목록"})
        reg_rows.append({"year": year, "label": label, **r, "source": "지식재산권 상세목록"})
    return app_rows, reg_rows


def build_validation(
    apps: list[dict],
    excluded: list[dict],
    regs: list[dict],
    foreign: list[dict],
    foreign_excluded: list[dict],
    waivers: list[dict],
    graph_app: Optional[list[dict]] = None,
    graph_window: Optional[tuple[int, int]] = None,
    graph_window_text: str = "",
) -> list[list[Any]]:
    rows = [["검증항목", "결과", "상세", "조치"]]
    rows += [
        ["출원 현황", len(apps), f"유효 출원번호 기준 / 제외 {len(excluded)}건", "정상"],
        ["등록 현황", len(regs), "상세목록 등록일+유효 등록번호 기준", "정상"],
        ["국외출원 심의", len(foreign), f"지재권신청일+최초 해외특허 / 제외 {len(foreign_excluded)}건", "HWP 심의안건 대상"],
        ["특허 포기", len(waivers), "MarkPro 납부구분에 '포기' 포함", "HWP 포기심의 대상"],
    ]
    waiver_pay_not_n = [r for r in waivers if norm_text(r.get("pay")).upper() != "N"]
    rows.append([
        "포기 납부여부 참고",
        len(waiver_pay_not_n),
        ", ".join(norm_text(r.get("mgmt")) for r in waiver_pay_not_n),
        "판정에는 미사용 / 납부구분의 '포기'가 기준",
    ])
    reason_counts: dict[str, int] = {}
    for r in foreign_excluded:
        reason = norm_text(r.get("review_reason")) or "기타"
        reason_counts[reason] = reason_counts.get(reason, 0) + 1
    rows.append(["국외심의 제외내역", len(foreign_excluded), ", ".join(f"{k} {v}" for k, v in sorted(reason_counts.items())), "자동 판정 로그 확인"])
    waiver_unmatched = [r["mgmt"] for r in waivers if r["join_status"] != "매칭"]
    waiver_mismatch = [r["mgmt"] for r in waivers if r["verification"] != "정상"]
    rows.append(["포기 상세목록 미매칭", len(waiver_unmatched), ", ".join(waiver_unmatched), "관리번호 확인"])
    rows.append(["포기 주요필드 불일치", len(waiver_mismatch), ", ".join(waiver_mismatch), "MarkPro 표현 우선, 상세 비교"])
    if graph_app:
        years = [r["year"] for r in graph_app]
        rows.append([
            "그래프 데이터 기간(MASTER)",
            len(years),
            f"{years[0]}~{years[-1]} (전체 기간 보존)",
            "20_그래프데이터는 표시기간과 무관하게 전체 유지",
        ])
        if graph_window:
            shown = [y for y in years if graph_window[0] <= y <= graph_window[1]]
            rows.append([
                "그래프 표시기간(차트/PNG)",
                len(shown),
                f"{graph_window_text or f'{graph_window[0]}~{graph_window[1]}'}",
                "30_그래프 · PNG에만 적용",
            ])
        bad = [r for r in graph_app if r["total"] != r["domestic"] + r["foreign_pct"]]
        rows.append([
            "출원 합계 정합성",
            len(bad),
            "전체 = 국내 + (PCT+일반국외)" if not bad else ", ".join(str(r["year"]) for r in bad),
            "정상" if not bad else "그래프 집계 확인",
        ])
    return rows


def build_all(ip_matrix: list[list[Any]], markpro_matrix: list[list[Any]], settings: Settings) -> BuildResult:
    """Build the working MASTER from exactly two source workbooks."""
    ip_rows = matrix_to_records(ip_matrix, 2, IP_SCHEMA)
    markpro_rows = matrix_to_records(markpro_matrix, 1, MARKPRO_SCHEMA)
    apps, excluded = build_applications(ip_rows, settings)
    regs = build_registrations(ip_rows, settings)
    foreign, foreign_excluded = build_foreign_reviews(ip_rows, settings)
    waivers = build_waivers(markpro_rows, ip_rows)
    graph_app, graph_reg = build_graph_data(ip_rows, settings)
    years = [r["year"] for r in graph_app]
    window = settings.graph_window(years)
    window_text = graph_window_label(settings.graph_range_mode, window[0], window[1])
    validation = build_validation(
        apps, excluded, regs, foreign, foreign_excluded, waivers,
        graph_app=graph_app, graph_window=window, graph_window_text=window_text,
    )
    return BuildResult(
        applications=apps,
        app_excluded=excluded,
        registrations=regs,
        review_matches=[],
        foreign_final=foreign,
        foreign_excluded=foreign_excluded,
        waivers=waivers,
        graph_app=graph_app,
        graph_reg=graph_reg,
        validation=validation,
        graph_window=window,
        graph_window_label=window_text,
    )


# -----------------------------------------------------------------------------
# Excel output (Windows + Microsoft Excel)
# -----------------------------------------------------------------------------
class XlsxMasterWriter:
    """Stable non-COM MASTER writer using XlsxWriter.

    v0.1.4 used an Excel COM SAFEARRAY assignment that could silently leave only
    one bottom-right cell populated. This writer never uses Excel COM and reopens
    the saved XLSX with the built-in reader to validate actual cell contents.
    """

    RAW_IP_SHEET = "99_RAW_상세목록"
    RAW_MARKPRO_SHEET = "100_RAW_마크프로"

    # Single source of truth for both creation order and post-save validation.
    SHEET_ORDER = [
        "00_요약", "10_출원현황", "11_등록현황", "12_국외심의",
        "13_포기심의", "20_그래프데이터", "30_그래프", "90_검증",
        RAW_IP_SHEET, RAW_MARKPRO_SHEET,
    ]
    SHEETS = set(SHEET_ORDER)

    def __init__(self, log: Callable[[str], None] = print, *, validate_reopen: bool = True):
        self.log = log
        self.validate_reopen = validate_reopen
        self.wb = None
        self.fmts: dict[str, Any] = {}

    def _setup_formats(self):
        wb = self.wb
        self.fmts = {
            "title": wb.add_format({"bold": True, "font_size": 17, "font_color": "#FFFFFF", "bg_color": "#1F4E79", "align": "center", "valign": "vcenter"}),
            "section": wb.add_format({"bold": True, "font_color": "#1F2937", "bg_color": "#DDEBF7", "border": 1, "border_color": "#D7DEE8"}),
            "header": wb.add_format({"bold": True, "font_color": "#FFFFFF", "bg_color": "#1F4E79", "align": "center", "valign": "vcenter", "text_wrap": True, "border": 1, "border_color": "#D7DEE8"}),
            "raw_header": wb.add_format({"bold": True, "font_color": "#FFFFFF", "bg_color": "#4F6228", "align": "center", "valign": "vcenter", "text_wrap": True, "border": 1, "border_color": "#D7DEE8"}),
            "body": wb.add_format({"valign": "vcenter", "border": 1, "border_color": "#E3E8EF"}),
            "body_wrap": wb.add_format({"valign": "vcenter", "text_wrap": True, "border": 1, "border_color": "#E3E8EF"}),
            "center": wb.add_format({"align": "center", "valign": "vcenter", "border": 1, "border_color": "#E3E8EF"}),
            "date": wb.add_format({"num_format": "yyyy-m-d", "align": "center", "valign": "vcenter", "border": 1, "border_color": "#E3E8EF"}),
            "excluded": wb.add_format({"font_color": "#8A3A3A", "bg_color": "#FFF2F2", "valign": "vcenter", "border": 1, "border_color": "#E8DADA"}),
            "muted": wb.add_format({"font_color": "#667085"}),
            "note": wb.add_format({"font_color": "#667085", "bg_color": "#F8FAFC", "text_wrap": True}),
        }

    @staticmethod
    def _value(v: Any) -> Any:
        if isinstance(v, dt.date) and not isinstance(v, dt.datetime):
            return dt.datetime.combine(v, dt.time())
        return "" if v is None else v

    def _write_rows(self, ws, rows: list[list[Any]], start_row: int = 0, start_col: int = 0, header_rows: int = 1, date_cols: Optional[set[int]] = None, excluded_from: Optional[int] = None):
        date_cols = date_cols or set()
        for ri, row in enumerate(rows):
            excel_row = start_row + ri
            vals = [self._value(v) for v in row]
            if ri < header_rows:
                ws.write_row(excel_row, start_col, vals, self.fmts["header"])
                continue
            for ci, v in enumerate(vals):
                fmt = self.fmts["body_wrap"] if isinstance(v, str) and len(v) > 35 else self.fmts["body"]
                if ci in date_cols and isinstance(v, (dt.datetime, dt.date)):
                    fmt = self.fmts["date"]
                if excluded_from is not None and ri >= excluded_from:
                    fmt = self.fmts["excluded"]
                ws.write(excel_row, start_col + ci, v, fmt)

    def _sheet_info(self, files: dict[str, Any], settings: Settings, result: BuildResult):
        ws = self.wb.add_worksheet("00_요약")
        start, end = foreign_review_window(settings)
        rows = [
            ["KRISS 직무발명관리위원회 작업 MASTER", ""],
            ["Version", VERSION],
            ["생성일시", dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
            ["위원회", f"{settings.meeting_year}년 {settings.meeting_round}"],
            ["안건 기준분기", settings.period_label],
            ["포기특허 기준분기", f"{settings.waiver_period_label} (+1분기 / MarkPro 원천 기준)"],
            ["그래프 기준일", f"{settings.cutoff.year}-{settings.cutoff.month}-{settings.cutoff.day}"],
            ["그래프 표시기간", f"{result.graph_window_label} · 30_그래프 및 PNG에만 적용"],
            ["그래프 형태", GRAPH_STYLE_LABELS[settings.graph_style]],
            ["그래프 데이터기간", f"{result.graph_app[0]['year']}\u223c{result.graph_app[-1]['year']} · 20_그래프데이터는 전체 기간 유지" if result.graph_app else "-"],
            ["국외심의 신청일 범위", f"{start.year}-{start.month}-{start.day} \u223c {end.year}-{end.month}-{end.day}"],
            ["", ""],
            ["작업항목", "건수"],
            ["출원 현황", len(result.applications)],
            ["등록 현황", len(result.registrations)],
            ["국외출원 심의", len(result.foreign_final)],
            ["특허 포기 승인", len(result.waivers)],
            ["", ""],
            ["입력", "파일"],
            ["지식재산권 상세목록", str(files.get("ip", ""))],
            ["MarkPro 회신", str(files.get("markpro", ""))],
            ["심의결과표", "HWP/HWPX 생성 단계에서 이미지/PDF로 결합"],
            ["", ""],
            ["산출물", "설명"],
            ["application_trend.png", f"출원 추이 {GRAPH_STYLE_LABELS[settings.graph_style]} (화면/검토용)"],
            ["registration_trend.png", f"등록 추이 {GRAPH_STYLE_LABELS[settings.graph_style]} (화면/검토용)"],
            ["application_trend_hwpx.png", f"HWPX 삽입용 · 약 {HWPX_PNG_WIDTH_IN * 2.54:.1f}cm 폭 @ {HWPX_PNG_DPI}dpi"],
            ["registration_trend_hwpx.png", f"HWPX 삽입용 · 약 {HWPX_PNG_WIDTH_IN * 2.54:.1f}cm 폭 @ {HWPX_PNG_DPI}dpi"],
        ]
        for r, row in enumerate(rows):
            if r == 0:
                ws.merge_range(0, 0, 0, 1, row[0], self.fmts["title"])
            elif row[0] in ("작업항목", "입력", "산출물"):
                ws.write_row(r, 0, row, self.fmts["section"])
            else:
                ws.write_row(r, 0, row)
        ws.set_row(0, 28)
        ws.set_column(0, 0, 26)
        ws.set_column(1, 1, 78)
        ws.freeze_panes(1, 0)

    RAW_ROW_HEIGHT = 18
    RAW_HEADER_HEIGHT = 24

    def _sheet_raw(self, name: str, matrix: list[list[Any]], header_rows: int):
        ws = self.wb.add_worksheet(name)
        # Unify row height for every row, including rows past the data block.
        ws.set_default_row(self.RAW_ROW_HEIGHT)
        if not matrix:
            return
        for r, row in enumerate(matrix):
            fmt = self.fmts["raw_header"] if r < header_rows else self.fmts["body"]
            ws.write_row(r, 0, [self._value(v) for v in row], fmt)
            ws.set_row(r, self.RAW_ROW_HEIGHT)
        for r in range(header_rows):
            ws.set_row(r, self.RAW_HEADER_HEIGHT)
        max_col = max(len(r) for r in matrix)
        ws.set_column(0, max_col - 1, 11)
        for c in range(max_col):
            label = "".join(norm_header(matrix[r][c]) for r in range(min(header_rows, len(matrix))) if c < len(matrix[r]))
            if "발명명칭" in label or "발명의명칭" in label:
                ws.set_column(c, c, 45)
            elif any(x in label for x in ("관리번호", "출원번호", "등록번호", "신청번호")):
                ws.set_column(c, c, 18)
        ws.freeze_panes(header_rows, 0)
        ws.autofilter(header_rows - 1, 0, len(matrix) - 1, max_col - 1)

    def _sheet_applications(self, rows: list[dict], excluded: list[dict]):
        ws = self.wb.add_worksheet("10_출원현황")
        h = ["순번", "최종반영", "관리번호", "출원일자", "국내외", "국가", "출원번호", "발명명칭", "권리자", "발명자", "단독/공동", "상태", "상태세부", "판정근거"]
        data = [h] + [[i, "Y", r.get("mgmt"), r.get("app_dt"), r.get("domestic"), r.get("country"), r.get("app_no"), r.get("title"), r.get("owner"), r.get("inventor_names"), r.get("ownership_type"), r.get("status"), r.get("status_detail"), r.get("reason")] for i, r in enumerate(rows, 1)]
        excluded_start = None
        if excluded:
            data += [["" for _ in h], ["제외목록"] + ["" for _ in h[1:]], h]
            excluded_start = len(data)
            data += [[i, "N", r.get("mgmt"), r.get("app_dt"), r.get("domestic"), r.get("country"), r.get("app_no"), r.get("title"), r.get("owner"), r.get("inventor_names"), r.get("ownership_type"), r.get("status"), r.get("status_detail"), r.get("reason")] for i, r in enumerate(excluded, 1)]
        self._write_rows(ws, data, header_rows=1, date_cols={3}, excluded_from=excluded_start)
        ws.set_column(0, 1, 10); ws.set_column(2, 2, 16); ws.set_column(3, 3, 12); ws.set_column(4, 6, 16)
        ws.set_column(7, 7, 48); ws.set_column(8, 10, 26); ws.set_column(11, 13, 18)
        ws.freeze_panes(1, 0); ws.autofilter(0, 0, len(rows), len(h)-1)

    def _sheet_registrations(self, rows: list[dict]):
        ws = self.wb.add_worksheet("11_등록현황")
        h = ["순번", "최종반영", "관리번호", "등록일자", "국내외", "국가", "등록번호", "출원번호", "발명명칭", "권리자", "발명자", "단독/공동", "상태", "상태세부"]
        data = [h] + [[i, "Y", r.get("mgmt"), r.get("reg_dt"), r.get("domestic"), r.get("country"), r.get("reg_no"), r.get("app_no"), r.get("title"), r.get("owner"), r.get("inventor_names"), r.get("ownership_type"), r.get("status"), r.get("status_detail")] for i, r in enumerate(rows, 1)]
        self._write_rows(ws, data, header_rows=1, date_cols={3})
        ws.set_column(0, 1, 10); ws.set_column(2, 2, 16); ws.set_column(3, 3, 12); ws.set_column(4, 7, 16)
        ws.set_column(8, 8, 48); ws.set_column(9, 11, 26); ws.set_column(12, 13, 18)
        ws.freeze_panes(1, 0); ws.autofilter(0, 0, len(rows), len(h)-1)

    def _sheet_foreign(self, rows: list[dict], excluded: list[dict]):
        ws = self.wb.add_worksheet("12_국외심의")
        h = ["순번", "최종반영", "관리번호", "신청번호", "신청일", "국내외", "국가", "출원종류", "출원번호", "발명명칭", "주발명자", "발명자", "단독/공동", "KRISS지분", "패밀리번호", "기PCT관리번호", "상태", "상태세부", "판정근거"]
        data = [h] + [[i, "Y", r.get("mgmt"), r.get("request_no"), r.get("request_dt"), r.get("domestic"), r.get("country"), r.get("filing_type"), r.get("app_no") or "(출원전)", r.get("title"), r.get("main_inventor"), r.get("inventor_names"), r.get("ownership_type"), r.get("owner_share"), r.get("family_no"), r.get("prior_pct_mgmt"), r.get("status"), r.get("status_detail"), r.get("review_reason")] for i, r in enumerate(rows, 1)]
        excluded_start = None
        if excluded:
            data += [["" for _ in h], ["자동 제외목록"] + ["" for _ in h[1:]], h]
            excluded_start = len(data)
            data += [[i, "N", r.get("mgmt"), r.get("request_no"), r.get("request_dt"), r.get("domestic"), r.get("country"), r.get("filing_type"), r.get("app_no") or "(출원전)", r.get("title"), r.get("main_inventor"), r.get("inventor_names"), r.get("ownership_type"), r.get("owner_share"), r.get("family_no"), r.get("prior_pct_mgmt"), r.get("status"), r.get("status_detail"), r.get("review_reason")] for i, r in enumerate(excluded, 1)]
        self._write_rows(ws, data, header_rows=1, date_cols={4}, excluded_from=excluded_start)
        ws.set_column(0, 1, 10); ws.set_column(2, 3, 18); ws.set_column(4, 4, 12); ws.set_column(5, 8, 15)
        ws.set_column(9, 9, 52); ws.set_column(10, 13, 20); ws.set_column(14, 15, 18); ws.set_column(16, 18, 22)
        ws.freeze_panes(1, 0); ws.autofilter(0, 0, len(rows), len(h)-1)

    def _sheet_waivers(self, rows: list[dict], settings: Settings):
        ws = self.wb.add_worksheet("13_포기심의")
        h = [
            "순번", "최종반영", "안건 기준분기", "포기 기준분기", "관리번호", "국가",
            "등록일자", "등록번호", "출원번호", "발명명칭", "발명자", "단독/공동",
            "권리자", "기술이전", "상태", "상태세부", "납부여부", "납부구분",
            "제목비교", "등록번호비교", "출원번호비교", "검증결과", "조인"
        ]
        data = [h] + [[
            i, "Y", settings.period_label, settings.waiver_period_label, r.get("mgmt"),
            r.get("country"), r.get("reg_date"), r.get("reg_no"), r.get("app_no"),
            r.get("title"), r.get("inventor_names"), r.get("ownership_type"), r.get("owner"),
            r.get("transfer"), r.get("status"), r.get("status_detail"), r.get("pay"),
            r.get("pay_class"), r.get("title_match"), r.get("reg_match"), r.get("app_match"),
            r.get("verification"), r.get("join_status")
        ] for i, r in enumerate(rows, 1)]
        self._write_rows(ws, data, header_rows=1, date_cols={6})
        ws.set_column(0, 1, 10)
        ws.set_column(2, 3, 22)
        ws.set_column(4, 8, 18)
        ws.set_column(9, 9, 50)
        ws.set_column(10, 12, 26)
        ws.set_column(13, 22, 18)
        ws.freeze_panes(1, 0)
        ws.autofilter(0, 0, len(rows), len(h)-1)

    # 20_그래프데이터 column map (0-based). Kept as constants so the native chart
    # ranges and the sheet writer can never drift apart.
    GD_APP_YEAR, GD_APP_LABEL = 0, 1
    GD_APP_DOMESTIC, GD_APP_PCT, GD_APP_FOREIGN_GEN = 2, 3, 4
    GD_APP_FOREIGN_PCT, GD_APP_TOTAL, GD_APP_SHOWN = 5, 6, 7
    GD_REG_YEAR, GD_REG_LABEL = 9, 10
    GD_REG_DOMESTIC, GD_REG_FOREIGN, GD_REG_TOTAL, GD_REG_SHOWN = 11, 12, 13, 14
    GD_FIRST_DATA_ROW = 2  # row 0 = title, row 1 = header

    def _sheet_graph_data(self, result: BuildResult):
        """Always writes the FULL period. The display window is a chart setting."""
        ws = self.wb.add_worksheet("20_그래프데이터")
        lo, hi = result.graph_window
        app = [
            ["출원 추이 (전체 기간 보존)", "", "", "", "", "", "", ""],
            ["연도", "표시", "국내 출원", "PCT", "일반국외", "국외+PCT", "전체 출원", "차트표시"],
        ] + [
            [r["year"], r["label"], r["domestic"], r["pct"], r["foreign_general"],
             r["foreign_pct"], r["total"], "O" if lo <= r["year"] <= hi else ""]
            for r in result.graph_app
        ]
        reg = [
            ["등록 추이 (전체 기간 보존)", "", "", "", "", ""],
            ["연도", "표시", "국내 등록", "국외 등록", "전체 등록", "차트표시"],
        ] + [
            [r["year"], r["label"], r["domestic"], r["foreign"], r["total"],
             "O" if lo <= r["year"] <= hi else ""]
            for r in result.graph_reg
        ]
        for r, row in enumerate(app):
            ws.write_row(r, self.GD_APP_YEAR, row, self.fmts["title"] if r == 0 else self.fmts["header"] if r == 1 else None)
        for r, row in enumerate(reg):
            ws.write_row(r, self.GD_REG_YEAR, row, self.fmts["title"] if r == 0 else self.fmts["header"] if r == 1 else None)
        note_row = self.GD_FIRST_DATA_ROW + max(len(result.graph_app), len(result.graph_reg)) + 1
        ws.write(note_row, 0, f"차트 표시기간: {result.graph_window_label} · 본 데이터 시트는 전체 기간을 그대로 유지합니다.", self.fmts["note"])
        ws.set_column(self.GD_APP_YEAR, self.GD_APP_YEAR, 10)
        ws.set_column(self.GD_APP_LABEL, self.GD_APP_LABEL, 16)
        ws.set_column(self.GD_APP_DOMESTIC, self.GD_APP_SHOWN, 12)
        ws.set_column(self.GD_REG_YEAR, self.GD_REG_YEAR, 10)
        ws.set_column(self.GD_REG_LABEL, self.GD_REG_LABEL, 16)
        ws.set_column(self.GD_REG_DOMESTIC, self.GD_REG_SHOWN, 12)
        ws.freeze_panes(self.GD_FIRST_DATA_ROW, 0)

    # v0.2.3 graph palette restored from v0.1.4.
    # The same palette is used by Excel native charts and PNG/HWP images.
    SERIES_COLORS = {
        "domestic": "#375B7C",
        "foreign": "#6991AE",
        "aux": "#AABECD",
        "total": "#2D2D2D",
        "grid": "#E2E6EA",
        "text": "#3F4650",
        "muted": "#6B7280",
        "latest_bg": "#F4F6F8",
    }

    @staticmethod
    def _draw_end_labels(ax, last_x, items, label_fs, total_label_fs, compact):
        """마지막 값 라벨을 오른쪽 같은 x에 세로로 정렬해 표시한다.

        v0.2.7까지는 라벨을 점 주위에 흩어 놓아(위/왼쪽/오른쪽, 전체값은 검은
        상자) 선과 겹치고 읽기 어려웠다. 값들이 한 열에 나란히 오도록 바꾼다.
        겹칠 만큼 값이 가까우면 최소 간격만큼만 벌린다.
        """
        pairs = [(float(v), c) for v, c in items if v is not None]
        if not pairs:
            return
        span = max(ax.get_ylim()[1] - ax.get_ylim()[0], 1.0)
        gap = span * (0.058 if compact else 0.05)      # 최소 세로 간격
        order = sorted(range(len(pairs)), key=lambda i: pairs[i][0])
        ys = [pairs[i][0] for i in order]
        for k in range(1, len(ys)):                    # 아래에서 위로 밀어내기
            if ys[k] - ys[k - 1] < gap:
                ys[k] = ys[k - 1] + gap
        placed = {}
        for k, i in enumerate(order):
            placed[i] = ys[k]
        dx = 7 if compact else 9
        for i, (value, color) in enumerate(pairs):
            ax.annotate(
                f"{int(round(value)):,}", (last_x, placed[i]),
                xytext=(dx, 0), textcoords="offset points",
                ha="left", va="center",
                fontsize=total_label_fs if i == 0 else label_fs,
                fontweight="bold", color=color, zorder=8, annotation_clip=False,
            )

    @staticmethod
    def _flatten_png(path) -> None:
        """PNG의 알파 채널을 없애 흰 배경 RGB로 다시 저장한다.

        한/글은 알파가 있는 PNG를 개체만 만들고 그림은 비워 두는 경우가 있어
        (삽입은 되는데 안 보이는 증상) 삽입용 PNG는 알파 없이 저장한다.
        """
        try:
            from PIL import Image
        except Exception:
            return
        try:
            with Image.open(path) as im:
                if im.mode in ("RGBA", "LA", "P"):
                    rgba = im.convert("RGBA")
                    flat = Image.new("RGB", rgba.size, (255, 255, 255))
                    flat.paste(rgba, mask=rgba.split()[-1])
                    flat.save(path, format="PNG")
        except Exception:
            pass

    @staticmethod
    def _last_point_labels(n_points: int) -> list[Any]:
        if n_points <= 0:
            return []
        return [{"delete": True}] * (n_points - 1) + [None]

    def _line_series(self, name: str, data_sheet: str, cat_col: int, val_col: int,
                     r0: int, r1: int, color: str, label_position: str) -> dict:
        """One v0.1.4-tone line series with only the latest point labelled."""
        return {
            "name": name,
            "categories": [data_sheet, r0, cat_col, r1, cat_col],
            "values": [data_sheet, r0, val_col, r1, val_col],
            "line": {"color": color, "width": 2.25},
            "marker": {
                "type": "circle", "size": 5,
                "border": {"color": color, "width": 1.25},
                "fill": {"color": "#FFFFFF"},
            },
            "data_labels": {
                "value": True,
                "position": label_position,
                "font": {"size": 9, "bold": True, "color": color},
                "custom": self._last_point_labels(r1 - r0 + 1),
            },
        }

    def _bar_series(self, name: str, data_sheet: str, cat_col: int, val_col: int,
                    r0: int, r1: int, color: str) -> dict:
        return {
            "name": name,
            "categories": [data_sheet, r0, cat_col, r1, cat_col],
            "values": [data_sheet, r0, val_col, r1, val_col],
            "fill": {"color": color},
            "border": {"color": "#FFFFFF", "width": 0.5},
            "data_labels": {
                "value": True,
                "position": "center",
                "font": {"size": 8, "bold": True, "color": "#FFFFFF"},
                "custom": self._last_point_labels(r1 - r0 + 1),
            },
        }

    def _total_line_series(self, name: str, data_sheet: str, cat_col: int, val_col: int,
                           r0: int, r1: int) -> dict:
        color = self.SERIES_COLORS["total"]
        return {
            "name": name,
            "categories": [data_sheet, r0, cat_col, r1, cat_col],
            "values": [data_sheet, r0, val_col, r1, val_col],
            "line": {"color": color, "width": 2.75},
            "marker": {
                "type": "circle", "size": 5,
                "border": {"color": color, "width": 1.25},
                "fill": {"color": "#FFFFFF"},
            },
            "data_labels": {
                "value": True,
                "position": "above",
                "font": {"size": 9, "bold": True, "color": color},
                "custom": self._last_point_labels(r1 - r0 + 1),
            },
        }

    def _style_trend_chart(self, chart, title: str, width: int = 980, height: int = 380):
        chart.set_title({
            "name": title,
            "name_font": {"size": 14, "bold": True, "color": self.SERIES_COLORS["total"]},
        })
        chart.set_legend({"position": "top", "font": {"size": 9, "color": self.SERIES_COLORS["text"]}})
        chart.set_y_axis({
            "min": 0,
            "major_gridlines": {"visible": True, "line": {"color": self.SERIES_COLORS["grid"], "width": 1}},
            "line": {"none": True},
            "num_font": {"size": 9, "color": self.SERIES_COLORS["muted"]},
            "major_tick_mark": "none",
        })
        chart.set_x_axis({
            "line": {"color": "#C9CED5"},
            "num_font": {"size": 9, "color": self.SERIES_COLORS["text"]},
            "major_tick_mark": "none",
        })
        chart.set_chartarea({"border": {"none": True}, "fill": {"color": "#FFFFFF"}})
        chart.set_plotarea({"border": {"none": True}, "fill": {"color": "#FFFFFF"}})
        chart.set_size({"width": width, "height": height})

    def _add_native_charts(self, result: BuildResult, settings: Settings):
        """Create Excel-native charts using the selected line/combo style."""
        ws = self.wb.add_worksheet("30_그래프")
        style_label = GRAPH_STYLE_LABELS[settings.graph_style]
        ws.merge_range("A1:N2", f"특허 출원·등록 추이  ·  {style_label}  ·  표시기간 {result.graph_window_label}", self.fmts["title"])
        data_sheet = "20_그래프데이터"
        i0, i1 = result.graph_window_index
        r0 = self.GD_FIRST_DATA_ROW + i0
        r1 = self.GD_FIRST_DATA_ROW + i1

        def build_chart(kind: str, names: tuple[str, str, str], cat_col: int,
                        domestic_col: int, foreign_col: int, total_col: int, title: str):
            if settings.graph_style == "line":
                chart = self.wb.add_chart({"type": "line"})
                # Latest labels are deliberately separated: domestic left,
                # foreign right, total above.
                chart.add_series(self._line_series(names[0], data_sheet, cat_col, domestic_col,
                                                   r0, r1, self.SERIES_COLORS["domestic"], "left"))
                chart.add_series(self._line_series(names[1], data_sheet, cat_col, foreign_col,
                                                   r0, r1, self.SERIES_COLORS["foreign"], "right"))
                chart.add_series(self._total_line_series(names[2], data_sheet, cat_col, total_col, r0, r1))
            else:
                chart = self.wb.add_chart({"type": "column", "subtype": "stacked"})
                chart.add_series(self._bar_series(names[0], data_sheet, cat_col, domestic_col,
                                                  r0, r1, self.SERIES_COLORS["domestic"]))
                chart.add_series(self._bar_series(names[1], data_sheet, cat_col, foreign_col,
                                                  r0, r1, self.SERIES_COLORS["foreign"]))
                line = self.wb.add_chart({"type": "line"})
                line.add_series(self._total_line_series(names[2], data_sheet, cat_col, total_col, r0, r1))
                chart.combine(line)
            self._style_trend_chart(chart, title)
            return chart

        app = build_chart(
            "application", ("국내 출원", "국외/PCT 출원", "전체 출원"),
            self.GD_APP_LABEL, self.GD_APP_DOMESTIC, self.GD_APP_FOREIGN_PCT, self.GD_APP_TOTAL,
            "연도별 특허 출원 추이",
        )
        ws.insert_chart("A4", app)

        reg = build_chart(
            "registration", ("국내 등록", "국외 등록", "전체 등록"),
            self.GD_REG_LABEL, self.GD_REG_DOMESTIC, self.GD_REG_FOREIGN, self.GD_REG_TOTAL,
            "연도별 특허 등록 추이",
        )
        ws.insert_chart("A24", reg)

        note = (
            "국내·국외·전체를 모두 꺾은선으로 표시"
            if settings.graph_style == "line"
            else "국내/국외는 누적 막대, 전체는 꺾은선으로 표시"
        )
        ws.write(43, 0,
                 f"표시기간 {result.graph_window_label} · {note} · 숫자는 최근연도만 표시 · 원본 집계는 20_그래프데이터 참조",
                 self.fmts["note"])
        ws.set_column("A:N", 11)

    def _save_pngs(self, result: BuildResult, out_dir: Path, settings: Settings) -> dict[str, str]:
        """Render report-ready PNGs in the selected graph style.

        The visible PNG and the HWP insertion PNG share exactly the same palette,
        series ordering and latest-value label strategy.
        """
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            from matplotlib import font_manager
            from matplotlib.ticker import MaxNLocator
        except Exception as e:
            raise RuntimeError("그래프 PNG 생성을 위해 matplotlib가 필요합니다. run_windows.bat를 실행하세요.") from e

        font_candidates = [
            "Malgun Gothic", "맑은 고딕", "Noto Sans CJK KR", "Noto Sans KR",
            "NanumGothic", "NanumBarunGothic", "UnDotum", "AppleGothic",
            "Noto Sans CJK JP", "Noto Sans CJK SC",
        ]
        available = {f.name for f in font_manager.fontManager.ttflist}
        for f in font_candidates:
            if f in available:
                plt.rcParams["font.family"] = f
                break
        else:
            self.log("경고: 한글 폰트를 찾지 못했습니다. PNG의 한글이 깨질 수 있습니다.")
        plt.rcParams["axes.unicode_minus"] = False

        i0, i1 = result.graph_window_index
        app_rows = result.graph_app[i0:i1 + 1]
        reg_rows = result.graph_reg[i0:i1 + 1]

        def draw(rows: list[dict], component_keys: tuple[str, str], component_names: tuple[str, str],
                 title: str, path: Path, *, figsize: tuple[float, float], dpi: int, compact: bool):
            labels = [r["label"] for r in rows]
            x = list(range(len(labels)))
            domestic = [int(r[component_keys[0]]) for r in rows]
            foreign = [int(r[component_keys[1]]) for r in rows]
            totals = [int(r["total"]) for r in rows]

            title_fs = 10.8 if compact else 16
            tick_fs = 7.2 if compact else 9.5
            legend_fs = 7.1 if compact else 9
            label_fs = 7.6 if compact else 9.2
            total_label_fs = 8.0 if compact else 9.5
            bar_width = 0.58 if compact else 0.56

            fig, ax = plt.subplots(figsize=figsize, facecolor="white")
            fig.patch.set_facecolor("white")
            ax.set_facecolor("white")

            # Quiet highlight on the latest year only.
            if x:
                ax.axvspan(x[-1] - 0.46, x[-1] + 0.46,
                           color=self.SERIES_COLORS["latest_bg"], zorder=0)

            if settings.graph_style == "line":
                ax.plot(x, domestic, label=component_names[0], color=self.SERIES_COLORS["domestic"],
                        linewidth=1.8 if compact else 2.0, marker="o",
                        markersize=4.0 if compact else 5.0, markerfacecolor="white",
                        markeredgecolor=self.SERIES_COLORS["domestic"], markeredgewidth=1.3, zorder=3)
                ax.plot(x, foreign, label=component_names[1], color=self.SERIES_COLORS["foreign"],
                        linewidth=1.8 if compact else 2.0, marker="o",
                        markersize=4.0 if compact else 5.0, markerfacecolor="white",
                        markeredgecolor=self.SERIES_COLORS["foreign"], markeredgewidth=1.3, zorder=3)
                ax.plot(x, totals, label="전체", color=self.SERIES_COLORS["total"],
                        linewidth=2.4 if compact else 2.8, marker="o",
                        markersize=4.7 if compact else 5.8, markerfacecolor="white",
                        markeredgecolor=self.SERIES_COLORS["total"], markeredgewidth=1.4, zorder=4)

                if totals and x:
                    self._draw_end_labels(
                        ax, x[-1],
                        [(totals[-1], self.SERIES_COLORS["total"]),
                         (domestic[-1], self.SERIES_COLORS["domestic"]),
                         (foreign[-1], self.SERIES_COLORS["foreign"])],
                        label_fs, total_label_fs, compact)
            else:
                ax.bar(x, domestic, width=bar_width, label=component_names[0],
                       color=self.SERIES_COLORS["domestic"], edgecolor="white", linewidth=0.7, zorder=2)
                ax.bar(x, foreign, width=bar_width, bottom=domestic, label=component_names[1],
                       color=self.SERIES_COLORS["foreign"], edgecolor="white", linewidth=0.7, zorder=2)
                ax.plot(x, totals, label="전체", color=self.SERIES_COLORS["total"],
                        linewidth=2.2 if compact else 2.6, marker="o",
                        markersize=4.4 if compact else 5.5, markerfacecolor="white",
                        markeredgecolor=self.SERIES_COLORS["total"], markeredgewidth=1.4, zorder=4)

                if totals and x:
                    last = x[-1]
                    d = domestic[-1]
                    f = foreign[-1]
                    t = totals[-1]
                    # Segment labels stay centered if the segment has enough height;
                    # otherwise they move outside the bar to avoid cramped white text.
                    min_inside = 8
                    if d >= min_inside:
                        ax.text(last, d / 2, f"{d:,}", ha="center", va="center",
                                fontsize=label_fs, fontweight="bold", color="white", zorder=6)
                    elif d > 0:
                        ax.annotate(f"{d:,}", (last, d / 2), xytext=(-10 if compact else -16, 0),
                                    textcoords="offset points", ha="right", va="center",
                                    fontsize=label_fs, fontweight="bold",
                                    color=self.SERIES_COLORS["domestic"], zorder=6)
                    if f >= min_inside:
                        ax.text(last, d + f / 2, f"{f:,}", ha="center", va="center",
                                fontsize=label_fs, fontweight="bold", color="white", zorder=6)
                    elif f > 0:
                        ax.annotate(f"{f:,}", (last, d + f / 2), xytext=(10 if compact else 16, 0),
                                    textcoords="offset points", ha="left", va="center",
                                    fontsize=label_fs, fontweight="bold",
                                    color=self.SERIES_COLORS["foreign"], zorder=6)
                    self._draw_end_labels(ax, last, [(t, self.SERIES_COLORS["total"])],
                                          label_fs, total_label_fs, compact)

            # No explanatory subtitle: only title + legend, as requested.
            ax.set_title(title, fontsize=title_fs, fontweight="bold", loc="left",
                         color=self.SERIES_COLORS["total"], pad=12 if compact else 15)
            ax.set_xticks(x)
            ax.set_xticklabels(labels, fontsize=tick_fs, color=self.SERIES_COLORS["text"])
            ax.tick_params(axis="x", length=0, pad=5)
            ax.tick_params(axis="y", labelsize=tick_fs, colors=self.SERIES_COLORS["muted"], length=0)
            ax.yaxis.set_major_locator(MaxNLocator(integer=True, nbins=5 if compact else 6))
            ax.set_ylim(bottom=0)
            if totals:
                ax.set_ylim(top=max(totals) * 1.20 + 1)
            ax.set_ylabel("건", rotation=0, labelpad=9, fontsize=tick_fs, color=self.SERIES_COLORS["muted"])
            ax.margins(x=0.035)
            ax.grid(axis="y", color=self.SERIES_COLORS["grid"], linewidth=0.8, zorder=0)
            ax.set_axisbelow(True)
            for side in ("top", "right", "left"):
                ax.spines[side].set_visible(False)
            ax.spines["bottom"].set_color("#C9CED5")
            ax.spines["bottom"].set_linewidth(0.8)

            handles, auto_names = ax.get_legend_handles_labels()
            handle_map = dict(zip(auto_names, handles))
            legend_names = [component_names[0], component_names[1], "전체"]
            legend_handles = [handle_map[n] for n in legend_names if n in handle_map]
            legend_names = [n for n in legend_names if n in handle_map]
            ax.legend(legend_handles, legend_names, ncol=3, frameon=False, loc="upper right",
                      bbox_to_anchor=(1.0, 1.11 if compact else 1.10), fontsize=legend_fs,
                      handlelength=1.9, columnspacing=1.25, borderaxespad=0)

            # 오른쪽 끝 라벨이 잘리지 않도록 x축 여유를 둔다.
            if x:
                ax.set_xlim(x[0] - 0.45, x[-1] + (0.62 if compact else 0.55))

            fig.tight_layout(pad=0.95 if compact else 1.15)
            fig.savefig(path, dpi=dpi, bbox_inches="tight", facecolor="white")
            plt.close(fig)
            self._flatten_png(path)

        app_title = "연도별 특허 출원 추이"
        reg_title = "연도별 특허 등록 추이"
        paths = {
            "application_chart": out_dir / "application_trend.png",
            "registration_chart": out_dir / "registration_trend.png",
            "application_chart_hwpx": out_dir / "application_trend_hwpx.png",
            "registration_chart_hwpx": out_dir / "registration_trend_hwpx.png",
        }
        draw(app_rows, ("domestic", "foreign_pct"), ("국내 출원", "국외/PCT 출원"), app_title,
             paths["application_chart"], figsize=(12, 5.15), dpi=180, compact=False)
        draw(reg_rows, ("domestic", "foreign"), ("국내 등록", "국외 등록"), reg_title,
             paths["registration_chart"], figsize=(12, 5.15), dpi=180, compact=False)
        draw(app_rows, ("domestic", "foreign_pct"), ("국내 출원", "국외/PCT 출원"), app_title,
             paths["application_chart_hwpx"], figsize=(HWPX_PNG_WIDTH_IN, HWPX_PNG_HEIGHT_IN),
             dpi=HWPX_PNG_DPI, compact=True)
        draw(reg_rows, ("domestic", "foreign"), ("국내 등록", "국외 등록"), reg_title,
             paths["registration_chart_hwpx"], figsize=(HWPX_PNG_WIDTH_IN, HWPX_PNG_HEIGHT_IN),
             dpi=HWPX_PNG_DPI, compact=True)
        for p in paths.values():
            if not p.exists() or p.stat().st_size < 3000:
                raise RuntimeError(f"PNG 생성 검증 실패: {p.name}")
        self.log(
            f"PNG 4종 생성 완료 ({GRAPH_STYLE_LABELS[settings.graph_style]} · v0.1.4 색상 · "
            f"HWP용 {HWPX_PNG_WIDTH_IN * 2.54:.1f}cm x {HWPX_PNG_HEIGHT_IN * 2.54:.1f}cm @ {HWPX_PNG_DPI}dpi)"
        )
        return {k: str(v) for k, v in paths.items()}

    def _sheet_validation(self, rows: list[list[Any]]):
        ws = self.wb.add_worksheet("90_검증")
        self._write_rows(ws, rows, header_rows=1)
        ws.set_column(0,0,27); ws.set_column(1,1,12); ws.set_column(2,2,68); ws.set_column(3,3,35); ws.freeze_panes(1,0)

    def _validate_saved(self, output: Path, matrices: dict[str, list[list[Any]]], settings: Settings, result: BuildResult):
        if output.stat().st_size < 50000:
            raise RuntimeError(f"생성 XLSX 크기가 비정상적으로 작습니다: {output.stat().st_size:,} bytes")
        with XlsxBookReader(output) as b:
            actual=set(b.sheet_names); missing=self.SHEETS-actual
            if missing: raise RuntimeError("저장 후 누락 시트: "+", ".join(sorted(missing)))
            info=b.read_sheet("00_요약")
            if not info or norm_text(info[0][0]) != "KRISS 직무발명관리위원회 작업 MASTER": raise RuntimeError("00_요약 실제 셀 검증 실패")
            expected_counts={"출원 현황":len(result.applications),"등록 현황":len(result.registrations),"국외출원 심의":len(result.foreign_final),"특허 포기 승인":len(result.waivers)}
            found={}
            for row in info:
                if len(row)>=2 and norm_text(row[0]) in expected_counts:
                    found[norm_text(row[0])]=int(row[1]) if str(row[1]).strip() else 0
            if found != expected_counts: raise RuntimeError(f"요약 건수 재검증 실패: expected={expected_counts}, actual={found}")
            # v0.1.9 fix: these were still reading the pre-reorder names
            # (01_/02_) after the sheets were renamed to 99_/100_, which made
            # every run fail at the reopen check with a KeyError.
            raw_ip=b.read_sheet(self.RAW_IP_SHEET); raw_mp=b.read_sheet(self.RAW_MARKPRO_SHEET)
            if len(raw_ip)!=len(matrices["ip"]): raise RuntimeError(f"상세목록 RAW 행수 불일치 {len(raw_ip)} != {len(matrices['ip'])}")
            if len(raw_mp)!=len(matrices["markpro"]): raise RuntimeError(f"MarkPro RAW 행수 불일치 {len(raw_mp)} != {len(matrices['markpro'])}")
            # Sheet order must match the agreed committee reading order.
            if b.sheet_names != self.SHEET_ORDER:
                raise RuntimeError(f"시트 순서 검증 실패: {b.sheet_names}")
            gd=b.read_sheet("20_그래프데이터")
            if len(gd) < self.GD_FIRST_DATA_ROW + len(result.graph_app):
                raise RuntimeError("20_그래프데이터 행수 검증 실패")
            data_years=[int(r[self.GD_APP_YEAR]) for r in gd[self.GD_FIRST_DATA_ROW:self.GD_FIRST_DATA_ROW+len(result.graph_app)]]
            expected_years=[r["year"] for r in result.graph_app]
            if data_years != expected_years:
                raise RuntimeError(f"20_그래프데이터 전체기간 검증 실패: {data_years[:3]}... != {expected_years[:3]}...")
            shown=[y for y in data_years if result.graph_window[0] <= y <= result.graph_window[1]]
            if not shown:
                raise RuntimeError("그래프 표시기간이 데이터 범위를 벗어났습니다.")
            # Actual non-empty cells must exist well beyond A1 (guards against v0.1.4 blank-file bug).
            app=b.read_sheet("10_출원현황"); foreign=b.read_sheet("12_국외심의"); waiver=b.read_sheet("13_포기심의")
            if len(app) < 1+len(result.applications): raise RuntimeError("출원 시트 실제 데이터 행 검증 실패")
            if len(foreign) < 1+len(result.foreign_final): raise RuntimeError("국외심의 시트 실제 데이터 행 검증 실패")
            if len(waiver) < 1+len(result.waivers): raise RuntimeError("포기심의 시트 실제 데이터 행 검증 실패")
            if not waiver or "포기기준분기" not in canon(waiver[0][3] if len(waiver[0]) > 3 else ""):
                raise RuntimeError("포기심의 기준분기 열 검증 실패")
            if result.waivers and norm_text(waiver[1][3]) != settings.waiver_period_label:
                raise RuntimeError(f"포기심의 기준분기 값 검증 실패: {waiver[1][3]} != {settings.waiver_period_label}")
        self.log("XLSX reopen/value validation OK")

    def build(self, output: Path, files: dict[str, Any], matrices: dict[str, list[list[Any]]], settings: Settings, result: BuildResult) -> dict[str, str]:
        try:
            import xlsxwriter
        except Exception as e:
            raise RuntimeError("XlsxWriter가 필요합니다. run_windows.bat를 실행해 공용 실행환경을 준비하세요.") from e
        output.parent.mkdir(parents=True, exist_ok=True)
        self.wb = xlsxwriter.Workbook(str(output), {"constant_memory": False})
        self.wb.set_properties({"title": "KRISS 직무발명관리위원회 작업 MASTER", "comments": f"Generated by v{VERSION}"})
        self._setup_formats()
        # Sheets are added in SHEET_ORDER; the post-save check enforces it.
        self._sheet_info(files, settings, result)
        self._sheet_applications(result.applications, result.app_excluded)
        self._sheet_registrations(result.registrations)
        self._sheet_foreign(result.foreign_final, result.foreign_excluded)
        self._sheet_waivers(result.waivers, settings)
        self._sheet_graph_data(result)
        self._add_native_charts(result, settings)
        self._sheet_validation(result.validation)
        self._sheet_raw(self.RAW_IP_SHEET, matrices["ip"], 2)
        self._sheet_raw(self.RAW_MARKPRO_SHEET, matrices["markpro"], 1)
        self.wb.close(); self.wb = None
        pngs = self._save_pngs(result, output.parent, settings)
        if self.validate_reopen:
            self._validate_saved(output, matrices, settings, result)
        self.log(f"Saved and validated: {output}")
        return {"master": str(output), **pngs}


# -----------------------------------------------------------------------------
# Input recognition / orchestration
# -----------------------------------------------------------------------------
def classify_xlsx(path: str | Path) -> str:
    try:
        with XlsxBookReader(path) as b:
            mat = b.read_sheet()
        if not mat:
            return "unknown"
        first = "".join(norm_header(x) for row in mat[:2] for x in row)
        if "고객관리번호" in first and "납부여부" in first:
            return "markpro"
        if "관리번호" in first and "지재권신청일" in first and "출원일자" in first and "등록일자" in first:
            return "ip"
    except Exception:
        pass
    return "unknown"


def expand_drop_paths(paths: Sequence[str | Path]) -> list[Path]:
    out: list[Path] = []
    for p0 in paths:
        p = Path(p0)
        if p.is_dir():
            out.extend(x for x in p.rglob("*") if x.suffix.lower() == ".xlsx")
        elif p.suffix.lower() == ".xlsx":
            out.append(p)
    # Ignore temporary Excel lock files.
    return sorted({x.resolve() for x in out if not x.name.startswith("~$")}, key=natural_key)


def load_inputs(ip_path: str, markpro_path: str, log: Callable[[str], None] = print) -> dict[str, list[list[Any]]]:
    out: dict[str, list[list[Any]]] = {}
    for key, path, label in (("ip", ip_path, "IP detail"), ("markpro", markpro_path, "MarkPro")):
        log(f"Reading {label}: {Path(path).name}")
        with XlsxBookReader(path) as b:
            out[key] = b.read_sheet()
        log(f"  {len(out[key]):,} rows")
    return out


def preview_master(files: dict[str, Any], settings: Settings, log: Callable[[str], None] = lambda _m: None) -> dict[str, Any]:
    """Fast Phase-1 preview. Does not start Excel COM or create files."""
    ip = str(files.get("ip", ""))
    markpro = str(files.get("markpro", ""))
    if not ip or not Path(ip).exists():
        raise FileNotFoundError("지식재산권 상세목록 XLSX가 필요합니다.")
    if not markpro or not Path(markpro).exists():
        raise FileNotFoundError("MarkPro 회신 XLSX가 필요합니다.")
    if not settings.quarters:
        raise ValueError("분기를 하나 이상 선택하세요.")
    matrices = load_inputs(ip, markpro, log)
    result = build_all(matrices["ip"], matrices["markpro"], settings)
    return {
        "applications": len(result.applications),
        "application_excluded": len(result.app_excluded),
        "registrations": len(result.registrations),
        "foreign_reviews": len(result.foreign_final),
        "foreign_excluded": len(result.foreign_excluded),
        "waivers": len(result.waivers),
        "meeting_year": settings.meeting_year,
        "meeting_round": settings.meeting_round,
        "period": settings.period_label,
        "waiver_period": settings.waiver_period_label,
        "cutoff": settings.cutoff.strftime("%Y-%m-%d"),
        "graph_window": result.graph_window,
        "graph_window_label": result.graph_window_label,
        "graph_style": settings.graph_style,
        "graph_style_label": GRAPH_STYLE_LABELS[settings.graph_style],
        "graph_data_years": (result.graph_app[0]["year"], result.graph_app[-1]["year"]) if result.graph_app else (0, 0),
        "validation": result.validation,
    }


def generate_master(files: dict[str, Any], output_dir: str, settings: Settings, log: Callable[[str], None] = print, validate_only: bool = False) -> dict[str, Any]:
    ip = str(files.get("ip", ""))
    markpro = str(files.get("markpro", ""))
    if not ip or not Path(ip).exists():
        raise FileNotFoundError("지식재산권 상세목록 XLSX가 필요합니다.")
    if not markpro or not Path(markpro).exists():
        raise FileNotFoundError("MarkPro 회신 XLSX가 필요합니다.")
    if not settings.quarters:
        raise ValueError("분기를 하나 이상 선택하세요.")

    matrices = load_inputs(ip, markpro, log)
    result = build_all(matrices["ip"], matrices["markpro"], settings)
    summary = {
        "applications": len(result.applications),
        "application_excluded": len(result.app_excluded),
        "registrations": len(result.registrations),
        "foreign_reviews": len(result.foreign_final),
        "foreign_excluded": len(result.foreign_excluded),
        "waivers": len(result.waivers),
        "meeting_year": settings.meeting_year,
        "meeting_round": settings.meeting_round,
        "period": settings.period_label,
        "waiver_period": settings.waiver_period_label,
        "cutoff": settings.cutoff.strftime("%Y-%m-%d"),
        "graph_window": result.graph_window,
        "graph_window_label": result.graph_window_label,
        "graph_data_years": (result.graph_app[0]["year"], result.graph_app[-1]["year"]) if result.graph_app else (0, 0),
        "validation": result.validation,
    }
    log(f"Main agenda period: {settings.period_label}")
    log(f"Waiver report period: {settings.waiver_period_label} (+1 quarter; target rows are selected by MarkPro pay_class containing '포기'; no date filter)")
    log(f"Applications: {summary['applications']} / excluded {summary['application_excluded']}")
    log(f"Registrations: {summary['registrations']}")
    log(f"Foreign reviews: {summary['foreign_reviews']} / excluded {summary['foreign_excluded']}")
    log(f"Waivers: {summary['waivers']}")
    log(f"Graph data (20_그래프데이터): {summary['graph_data_years'][0]}~{summary['graph_data_years'][1]} (full period, always kept)")
    log(f"Graph display window (30_그래프 / PNG): {result.graph_window_label}")
    log(f"Graph style: {GRAPH_STYLE_LABELS[settings.graph_style]}")
    if validate_only:
        return summary

    outdir = Path(output_dir)
    outdir.mkdir(parents=True, exist_ok=True)
    out = outdir / f"{settings.meeting_year}_{safe_filename(settings.meeting_round)}_committee_working_MASTER.xlsx"
    if out.exists():
        out = outdir / f"{settings.meeting_year}_{safe_filename(settings.meeting_round)}_committee_working_MASTER_{dt.datetime.now():%Y%m%d_%H%M%S}.xlsx"
    writer = XlsxMasterWriter(log, validate_reopen=settings.validate_reopen)
    artifacts = writer.build(out, files, matrices, settings, result)
    summary.update(artifacts)
    return summary


# -----------------------------------------------------------------------------
# GUI: PyQt5 native drag-and-drop, Phase 1 only
# -----------------------------------------------------------------------------
def launch_gui():
    try:
        from PyQt5.QtCore import QDate, QEvent, QObject, Qt, QTimer, pyqtSignal
        from PyQt5.QtGui import QFont
        from PyQt5.QtWidgets import (
            QApplication, QButtonGroup, QComboBox, QFileDialog, QFrame, QGridLayout,
            QHBoxLayout, QLabel, QLineEdit, QMainWindow, QMessageBox, QPushButton,
            QDateEdit, QRadioButton, QSizePolicy, QSpinBox, QTextEdit, QVBoxLayout,
            QWidget,
        )
    except Exception as e:
        raise RuntimeError("PyQt5가 필요합니다. Windows에서는 run_windows.bat를 실행하면 공용 실행환경을 자동 준비합니다.") from e

    class Bridge(QObject):
        preview_done = pyqtSignal(object, int)
        preview_error = pyqtSignal(str, int)
        generate_done = pyqtSignal(object)
        generate_error = pyqtSignal(str)
        hwp_done = pyqtSignal(int, str, str)
        hwp_error = pyqtSignal(str)
        log = pyqtSignal(str)

    class DropZone(QFrame):
        filesDropped = pyqtSignal(list)
        clicked = pyqtSignal()

        def __init__(self):
            super().__init__()
            self.setAcceptDrops(True)
            self.setCursor(Qt.PointingHandCursor)
            self.setObjectName("DropZone")
            self.setFixedHeight(50)
            lay = QVBoxLayout(self)
            lay.setContentsMargins(12, 5, 12, 5)
            lay.setSpacing(0)
            self.title = QLabel("XLSX 2개 또는 폴더를 드롭")
            self.title.setObjectName("DropTitle")
            self.title.setAlignment(Qt.AlignCenter)
            self.sub = QLabel("화면 어디에 놓아도 자동 인식 · 상세목록 + MarkPro")
            self.sub.setObjectName("Muted")
            self.sub.setAlignment(Qt.AlignCenter)
            lay.addWidget(self.title)
            lay.addWidget(self.sub)

        def mousePressEvent(self, event):
            if event.button() == Qt.LeftButton:
                self.clicked.emit()
            super().mousePressEvent(event)

        def dragEnterEvent(self, event):
            if event.mimeData().hasUrls():
                event.acceptProposedAction()
                self.setProperty("dragActive", True)
                self.style().unpolish(self); self.style().polish(self)
            else:
                event.ignore()

        def dragLeaveEvent(self, event):
            self.setProperty("dragActive", False)
            self.style().unpolish(self); self.style().polish(self)
            super().dragLeaveEvent(event)

        def dropEvent(self, event):
            self.setProperty("dragActive", False)
            self.style().unpolish(self); self.style().polish(self)
            paths = [u.toLocalFile() for u in event.mimeData().urls() if u.isLocalFile()]
            if paths:
                self.filesDropped.emit(paths)
                event.acceptProposedAction()
            else:
                event.ignore()

    class FileCard(QFrame):
        def __init__(self, title):
            super().__init__()
            self.setObjectName("FileCard")
            self.setFixedHeight(42)
            lay = QHBoxLayout(self)
            lay.setContentsMargins(11, 4, 11, 4)
            lay.setSpacing(6)
            self.dot = QLabel("●")
            self.dot.setObjectName("MissingDot")
            ttl = QLabel(title); ttl.setObjectName("SmallTitle")
            self.value = QLabel("아직 넣지 않음")
            self.value.setObjectName("FileValue")
            self.value.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
            self.value.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Preferred)
            self.value.setMinimumWidth(0)
            self.value.setTextInteractionFlags(Qt.TextSelectableByMouse)
            lay.addWidget(self.dot)
            lay.addWidget(ttl)
            lay.addStretch(1)
            lay.addWidget(self.value, 1)

        def set_file(self, path):
            ok = bool(path)
            self.dot.setObjectName("OkDot" if ok else "MissingDot")
            self.dot.style().unpolish(self.dot); self.dot.style().polish(self.dot)
            self.value.setText(Path(path).name if ok else "아직 넣지 않음")
            self.value.setToolTip(str(path) if ok else "")

    class MetricCard(QFrame):
        def __init__(self, title, note=""):
            super().__init__(); self.setObjectName("MetricCard")
            self.setFixedHeight(72)
            self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
            lay = QVBoxLayout(self); lay.setContentsMargins(12, 6, 12, 6); lay.setSpacing(0)
            t = QLabel(title); t.setObjectName("MetricTitle")
            self.value = QLabel("–"); self.value.setObjectName("MetricValue")
            self.note = QLabel(note); self.note.setObjectName("MetricNote")
            lay.addWidget(t); lay.addWidget(self.value); lay.addWidget(self.note)

    class Window(QMainWindow):
        def __init__(self):
            super().__init__()
            self.ip_path = ""
            self.markpro_path = ""
            self.preview_token = 0
            self.busy = False
            self.last_output_dir = ""
            self.last_master_path = ""
            self.last_master_signature = None
            self.last_master_settings = None
            self.active_generation_signature = None
            self.active_generation_settings = None
            self.pending_hwp_after_master = False
            self.quarter_buttons = {}
            self.bridge = Bridge()
            self.bridge.preview_done.connect(self.on_preview_done)
            self.bridge.preview_error.connect(self.on_preview_error)
            self.bridge.generate_done.connect(self.on_generate_done)
            self.bridge.generate_error.connect(self.on_generate_error)
            self.bridge.hwp_done.connect(self.on_hwp_done)
            self.bridge.hwp_error.connect(self.on_hwp_error)
            self.bridge.log.connect(self.append_log)
            self.preview_timer = QTimer(self); self.preview_timer.setSingleShot(True)
            self.preview_timer.timeout.connect(self.start_preview)
            self.build_ui()
            self.on_graph_option_changed()
            self.rebuild_quarters()
            self.refresh_ready()
            # Make the bundled 2026/1 HWP files visible in the persistent user
            # folder immediately on first launch. Existing user templates are
            # never overwritten.
            try:
                target, copied = seed_user_hwp_templates(Path(__file__).resolve().parent, self.year.value(), self.round.currentText())
                if copied:
                    self.append_log(f"기본 HWP 양식 {copied}종 자동 준비: {target}")
            except Exception as e:
                self.append_log(f"HWP 기본 양식 준비 경고: {e}")

        def build_ui(self):
            self.setWindowTitle(f"{APP_NAME} v{VERSION}")
            self.resize(1040, 690)
            self.setMinimumSize(860, 620)
            self.setAcceptDrops(True)

            root = QWidget(); root.setObjectName("Root"); self.setCentralWidget(root)
            self.root_widget = root
            shell = QVBoxLayout(root); shell.setContentsMargins(0, 0, 0, 0); shell.setSpacing(0)

            content = QWidget(); content.setObjectName("Content")
            main = QVBoxLayout(content); main.setContentsMargins(18, 10, 18, 8); main.setSpacing(8)

            # Header -----------------------------------------------------------
            head = QHBoxLayout(); left = QVBoxLayout(); left.setSpacing(0)
            title = QLabel("직무발명관리위원회 자동화"); title.setObjectName("AppTitle")
            sub = QLabel("상세목록 + MarkPro → MASTER → HWP 안건 6종"); sub.setObjectName("Muted")
            left.addWidget(title); left.addWidget(sub)
            badge = QLabel(f"v{VERSION}"); badge.setObjectName("VersionBadge"); badge.setAlignment(Qt.AlignCenter)
            head.addLayout(left); head.addStretch(); head.addWidget(badge, alignment=Qt.AlignTop); main.addLayout(head)

            # 1. Source files -------------------------------------------------
            card = QFrame(); card.setObjectName("Card")
            cv = QVBoxLayout(card); cv.setContentsMargins(14, 9, 14, 9); cv.setSpacing(6)
            row = QHBoxLayout(); row.setSpacing(6)
            sec = QLabel("1  원본 파일"); sec.setObjectName("SectionTitle")
            phase = QLabel("XLSX 2개"); phase.setObjectName("InfoBadge")
            pick = QPushButton("파일 선택"); pick.setObjectName("SecondaryButton"); pick.clicked.connect(self.pick_files)
            folder = QPushButton("폴더 선택"); folder.setObjectName("SecondaryButton"); folder.clicked.connect(self.pick_folder)
            clear = QPushButton("비우기"); clear.setObjectName("GhostButton"); clear.clicked.connect(self.clear_files)
            row.addWidget(sec); row.addWidget(phase); row.addStretch(); row.addWidget(pick); row.addWidget(folder); row.addWidget(clear)
            cv.addLayout(row)
            self.drop = DropZone(); self.drop.filesDropped.connect(self.add_paths); self.drop.clicked.connect(self.pick_files); cv.addWidget(self.drop)
            filesrow = QHBoxLayout(); filesrow.setSpacing(8)
            self.ip_card = FileCard("지식재산권 상세목록")
            self.mark_card = FileCard("MarkPro 회신")
            filesrow.addWidget(self.ip_card); filesrow.addWidget(self.mark_card); cv.addLayout(filesrow)
            main.addWidget(card)

            # 2. Committee / period ------------------------------------------
            card2 = QFrame(); card2.setObjectName("Card")
            sv = QVBoxLayout(card2); sv.setContentsMargins(14, 9, 14, 9); sv.setSpacing(6)
            sec2 = QLabel("2  위원회 / 안건 기준분기"); sec2.setObjectName("SectionTitle"); sv.addWidget(sec2)
            setrow = QHBoxLayout(); setrow.setSpacing(8)

            meta = QFrame(); meta.setObjectName("SoftPanel"); meta.setFixedWidth(356)
            mg = QGridLayout(meta); mg.setContentsMargins(10, 7, 10, 7); mg.setHorizontalSpacing(7); mg.setVerticalSpacing(4)
            yl = QLabel("연도"); yl.setObjectName("Tiny"); rl = QLabel("회차"); rl.setObjectName("Tiny")
            dl = QLabel("안건 상정 일자"); dl.setObjectName("Tiny")
            self.year = QSpinBox(); self.year.setRange(2020, 2100); self.year.setValue(dt.datetime.now().year); self.year.setFixedWidth(92)
            self.round = QComboBox(); self.round.addItems(["1차", "2차", "3차", "4차"]); self.round.setFixedWidth(92)
            self.hwp_date = QDateEdit(QDate.currentDate()); self.hwp_date.setCalendarPopup(True)
            self.hwp_date.setDisplayFormat("yyyy-M-d"); self.hwp_date.setFixedWidth(118)
            self.hwp_date.setToolTip("한글 안건의 보고일자/심의일자/결의일에 그대로 들어갑니다 (예: 2026.8.31.).")
            mg.addWidget(yl,0,0); mg.addWidget(rl,0,1); mg.addWidget(dl,0,2)
            mg.addWidget(self.year,1,0); mg.addWidget(self.round,1,1); mg.addWidget(self.hwp_date,1,2)
            self.year.valueChanged.connect(self.rebuild_quarters); self.round.currentTextChanged.connect(self.on_round_changed)
            self.year.valueChanged.connect(self.sync_hwp_date_year)
            setrow.addWidget(meta, 0)

            qpanel = QFrame(); qpanel.setObjectName("SoftPanel")
            qv = QVBoxLayout(qpanel); qv.setContentsMargins(10, 6, 10, 6); qv.setSpacing(3)
            hint = QLabel("출원·등록·국외심의 기준분기 · 포기는 마지막 선택분기의 +1분기"); hint.setObjectName("Tiny"); qv.addWidget(hint)
            self.qgrid = QGridLayout(); self.qgrid.setHorizontalSpacing(5); self.qgrid.setVerticalSpacing(3); qv.addLayout(self.qgrid)
            periodrow = QHBoxLayout(); periodrow.setSpacing(12)
            self.period = QLabel(""); self.period.setObjectName("PeriodLabel"); self.period.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Preferred)
            self.waiver_period = QLabel(""); self.waiver_period.setObjectName("WaiverPeriodLabel"); self.waiver_period.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Preferred)
            periodrow.addWidget(self.period); periodrow.addWidget(self.waiver_period); periodrow.addStretch()
            qv.addLayout(periodrow)
            setrow.addWidget(qpanel, 1)
            sv.addLayout(setrow)

            # Advanced settings: compact and collapsed by default.
            advhead = QHBoxLayout(); advhead.setSpacing(6)
            self.adv_btn = QPushButton("고급 설정  ▾"); self.adv_btn.setObjectName("GhostButton")
            self.adv_btn.setCheckable(True); self.adv_btn.clicked.connect(self.toggle_advanced)
            self.adv_summary = QLabel(""); self.adv_summary.setObjectName("Tiny"); self.adv_summary.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Preferred)
            advhead.addWidget(self.adv_btn); advhead.addWidget(self.adv_summary); advhead.addStretch()
            sv.addLayout(advhead)

            self.adv_panel = QFrame(); self.adv_panel.setObjectName("SoftPanel"); self.adv_panel.hide()
            av = QVBoxLayout(self.adv_panel); av.setContentsMargins(10, 7, 10, 7); av.setSpacing(5)
            first = QHBoxLayout(); first.setSpacing(12)
            gl = QLabel("그래프 표시기간"); gl.setObjectName("Tiny"); first.addWidget(gl)
            self.graph_mode_group = QButtonGroup(self); self.graph_radios = {}
            for mode in GRAPH_RANGE_MODES:
                text = GRAPH_RANGE_LABELS[mode] + (" (기본)" if mode == GRAPH_DEFAULT_MODE else "")
                rb = QRadioButton(text); rb.setObjectName("AdvRadio")
                rb.setChecked(mode == GRAPH_DEFAULT_MODE)
                self.graph_mode_group.addButton(rb); self.graph_radios[mode] = rb; first.addWidget(rb)
            first.addStretch(); av.addLayout(first)

            yrow = QHBoxLayout(); yrow.setSpacing(6)
            style_label = QLabel("그래프 형태"); style_label.setObjectName("Tiny"); yrow.addWidget(style_label)
            self.graph_style_group = QButtonGroup(self); self.graph_style_radios = {}
            for style in GRAPH_STYLE_MODES:
                text = GRAPH_STYLE_LABELS[style] + (" (기본)" if style == GRAPH_DEFAULT_STYLE else "")
                rb = QRadioButton(text); rb.setObjectName("AdvRadio")
                rb.setChecked(style == GRAPH_DEFAULT_STYLE)
                self.graph_style_group.addButton(rb); self.graph_style_radios[style] = rb; yrow.addWidget(rb)
            yrow.addSpacing(12)
            now_year = dt.datetime.now().year
            sl = QLabel("시작"); sl.setObjectName("Tiny"); el = QLabel("종료"); el.setObjectName("Tiny")
            self.graph_start = QSpinBox(); self.graph_start.setRange(GRAPH_DATA_START_YEAR, 2100); self.graph_start.setValue(max(GRAPH_DATA_START_YEAR, now_year - 9)); self.graph_start.setFixedWidth(82)
            self.graph_end = QSpinBox(); self.graph_end.setRange(GRAPH_DATA_START_YEAR, 2100); self.graph_end.setValue(now_year); self.graph_end.setFixedWidth(82)
            yrow.addWidget(sl); yrow.addWidget(self.graph_start); yrow.addSpacing(3); yrow.addWidget(el); yrow.addWidget(self.graph_end)
            yrow.addStretch()
            note = QLabel("v0.1.4 색상 · 숫자는 최근연도만")
            note.setObjectName("Muted"); yrow.addWidget(note)
            av.addLayout(yrow); sv.addWidget(self.adv_panel)

            for rb in self.graph_radios.values():
                rb.toggled.connect(self.on_graph_option_changed)
            for rb in self.graph_style_radios.values():
                rb.toggled.connect(self.on_graph_option_changed)
            self.graph_start.valueChanged.connect(self.on_graph_option_changed)
            self.graph_end.valueChanged.connect(self.on_graph_option_changed)
            main.addWidget(card2)

            # 3. Preview / output --------------------------------------------
            card3 = QFrame(); card3.setObjectName("Card")
            pv = QVBoxLayout(card3); pv.setContentsMargins(14, 9, 14, 9); pv.setSpacing(6)
            top = QHBoxLayout(); sec3=QLabel("3  확인 후 생성"); sec3.setObjectName("SectionTitle")
            self.ready_badge=QLabel("입력 대기"); self.ready_badge.setObjectName("StatusBadge")
            top.addWidget(sec3); top.addStretch(); top.addWidget(self.ready_badge); pv.addLayout(top)
            metrics = QHBoxLayout(); metrics.setSpacing(6)
            self.m_app=MetricCard("출원", "더미번호 제외")
            self.m_reg=MetricCard("등록", "유효 등록번호")
            self.m_foreign=MetricCard("국외심의", "신청일·PCT 판정")
            self.m_waiver=MetricCard("포기", "MarkPro · +1분기")
            for m in (self.m_app,self.m_reg,self.m_foreign,self.m_waiver): metrics.addWidget(m)
            pv.addLayout(metrics)
            outrow=QHBoxLayout(); outrow.setSpacing(6)
            outlab=QLabel("저장 위치"); outlab.setObjectName("Tiny"); self.out=QLineEdit(str(Path.cwd()/"committee_output"))
            browse=QPushButton("찾아보기"); browse.setObjectName("SecondaryButton"); browse.clicked.connect(self.pick_output)
            outrow.addWidget(outlab); outrow.addWidget(self.out,1); outrow.addWidget(browse); pv.addLayout(outrow)
            self.status=QLabel("상세목록과 MarkPro를 넣어주세요."); self.status.setObjectName("StatusText")
            self.status.setWordWrap(True); self.status.setMinimumHeight(30); self.status.setMaximumHeight(42); pv.addWidget(self.status)
            main.addWidget(card3)

            shell.addWidget(content, 1)

            # Bottom action bar ----------------------------------------------
            bottom = QWidget(); bottom.setObjectName("BottomBar")
            bv=QVBoxLayout(bottom); bv.setContentsMargins(18, 6, 18, 8); bv.setSpacing(5)
            footer=QHBoxLayout(); footer.setSpacing(6)
            self.log_btn=QPushButton("상세 로그"); self.log_btn.setObjectName("GhostButton"); self.log_btn.clicked.connect(self.toggle_log)
            self.template_btn=QPushButton("한글양식 폴더"); self.template_btn.setObjectName("GhostButton"); self.template_btn.setToolTip("선택한 연도/회차의 공용 HWP 양식 폴더를 엽니다. 내장 기본 양식이 있으면 최초 1회 자동 복사되어 실제 .hwp 파일이 보입니다."); self.template_btn.clicked.connect(self.open_template_folder)
            self.open_btn=QPushButton("결과 폴더"); self.open_btn.setObjectName("SecondaryButton"); self.open_btn.clicked.connect(self.open_output)
            self.hwp_btn=QPushButton("한글 안건 만들기"); self.hwp_btn.setObjectName("SecondaryButton"); self.hwp_btn.setMinimumWidth(145); self.hwp_btn.setToolTip("파일 선택 없이 현재 입력 → MASTER → HWP 안건을 자동 연계합니다."); self.hwp_btn.clicked.connect(self.run_hwp_generate)
            self.run_btn=QPushButton("작업 MASTER 만들기"); self.run_btn.setObjectName("PrimaryButton"); self.run_btn.setMinimumWidth(190); self.run_btn.clicked.connect(self.run_generate)
            footer.addWidget(self.log_btn); footer.addWidget(self.template_btn); footer.addStretch(); footer.addWidget(self.open_btn); footer.addWidget(self.hwp_btn); footer.addWidget(self.run_btn); bv.addLayout(footer)
            self.log_box=QTextEdit(); self.log_box.setReadOnly(True); self.log_box.setObjectName("LogBox"); self.log_box.setFixedHeight(96); self.log_box.hide(); bv.addWidget(self.log_box)
            shell.addWidget(bottom, 0)

            self.setStyleSheet(r"""
                QWidget#Root { background:#F4F7FB; color:#172033; font-family:"Malgun Gothic"; font-size:9.5pt; }
                QWidget#Root[dragActive="true"] { background:#EEF3FF; }
                QWidget#Content { background:transparent; }
                QWidget#BottomBar { background:#F4F7FB; border-top:1px solid #E3E9F2; }
                QFrame#Card { background:#FFFFFF; border:1px solid #E3E9F2; border-radius:12px; }
                QFrame#SoftPanel { background:#F8FAFD; border:1px solid #E8EDF5; border-radius:9px; }
                QFrame#DropZone { background:#F8FAFD; border:1px dashed #BAC8DC; border-radius:9px; }
                QFrame#DropZone[dragActive="true"] { background:#E8F0FF; border:2px solid #315EFB; }
                QFrame#FileCard, QFrame#MetricCard { background:#FAFBFD; border:1px solid #E6EBF2; border-radius:8px; }
                QLabel#AppTitle { font-size:17pt; font-weight:700; color:#101828; }
                QLabel#SectionTitle { font-size:10.5pt; font-weight:700; color:#172033; }
                QLabel#DropTitle { font-size:9.5pt; font-weight:700; color:#25324B; }
                QLabel#Muted { color:#7A8699; font-size:8.3pt; }
                QLabel#Tiny { color:#758197; font-size:8pt; font-weight:600; }
                QLabel#SmallTitle { color:#667085; font-size:8pt; font-weight:600; }
                QLabel#FileValue { color:#25324B; font-size:8.5pt; font-weight:600; }
                QLabel#OkDot { color:#18A66A; } QLabel#MissingDot { color:#C9D1DC; }
                QLabel#VersionBadge { color:#315EFB; background:#EBF0FF; border-radius:7px; padding:4px 8px; font-weight:700; }
                QLabel#InfoBadge { color:#315EFB; background:#EEF3FF; border-radius:6px; padding:3px 7px; font-size:8pt; font-weight:600; }
                QLabel#PeriodLabel { color:#315EFB; font-weight:700; min-height:16px; font-size:8.2pt; }
                QLabel#WaiverPeriodLabel { color:#7A5AF8; font-weight:700; min-height:16px; font-size:8.2pt; }
                QLabel#MetricTitle { color:#78859A; font-size:8pt; font-weight:600; }
                QLabel#MetricValue { color:#101828; font-size:16pt; font-weight:800; min-height:24px; }
                QLabel#MetricNote { color:#98A2B3; font-size:7.3pt; min-height:13px; }
                QLabel#StatusBadge { color:#667085; background:#F0F2F5; border-radius:6px; padding:3px 7px; font-size:8pt; font-weight:700; }
                QLabel#StatusBadge[ready="true"] { color:#168A5B; background:#EAF8F2; }
                QLabel#StatusText { color:#667085; background:#F8FAFD; border-radius:6px; padding:5px 8px; font-size:8.2pt; }
                QLineEdit, QSpinBox, QComboBox { background:#FFFFFF; border:1px solid #CDD5E0; border-radius:6px; padding:4px 7px; min-height:20px; }
                QPushButton { border-radius:7px; padding:5px 10px; font-weight:600; min-height:18px; }
                QPushButton#PrimaryButton { background:#315EFB; color:white; border:none; padding:8px 15px; }
                QPushButton#PrimaryButton:hover { background:#244EDB; } QPushButton#PrimaryButton:disabled { background:#B6C4F6; color:#F5F7FF; }
                QPushButton#SecondaryButton { background:#FFFFFF; color:#25324B; border:1px solid #CCD4DF; } QPushButton#SecondaryButton:hover { background:#F7F9FC; }
                QPushButton#GhostButton { background:transparent; color:#667085; border:1px solid transparent; } QPushButton#GhostButton:hover { background:#EEF1F5; }
                QPushButton#Quarter { background:#FFFFFF; color:#344054; border:1px solid #CDD5E0; min-width:54px; padding:4px 8px; }
                QPushButton#Quarter:hover { border:1px solid #8FA8F9; color:#315EFB; } QPushButton#Quarter:checked { background:#315EFB; color:#FFFFFF; border:1px solid #315EFB; }
                QRadioButton#AdvRadio { color:#344054; font-size:8.3pt; font-weight:600; spacing:5px; padding:1px 0px; }
                QRadioButton#AdvRadio::indicator { width:14px; height:14px; border-radius:7px; }
                QRadioButton#AdvRadio::indicator:unchecked { border:1px solid #CDD5E0; background:#FFFFFF; }
                QRadioButton#AdvRadio::indicator:unchecked:hover { border:1px solid #8FA8F9; }
                QRadioButton#AdvRadio::indicator:checked { border:1px solid #315EFB; background:#315EFB; }
                QRadioButton#AdvRadio:disabled { color:#A6B0BF; }
                QSpinBox:disabled { background:#F2F4F7; color:#A6B0BF; border:1px solid #E3E9F2; }
                QTextEdit#LogBox { background:#121826; color:#D6DCE8; border:none; border-radius:8px; font-family:Consolas; font-size:8.5pt; padding:5px; }
            """)

            # Capture drag/drop on every child widget, including line edits and
            # buttons. This makes the entire visible window a drop target.
            app = QApplication.instance()
            if app is not None:
                app.installEventFilter(self)

        def _set_global_drag_active(self, active):
            active = bool(active)
            for w in (getattr(self, "root_widget", None), getattr(self, "drop", None)):
                if w is not None:
                    w.setProperty("dragActive", active)
                    w.style().unpolish(w); w.style().polish(w)

        def eventFilter(self, obj, event):
            et = event.type()
            is_ours = obj is self or (isinstance(obj, QWidget) and self.isAncestorOf(obj))
            if is_ours and et in (QEvent.DragEnter, QEvent.DragMove):
                if event.mimeData().hasUrls():
                    self._set_global_drag_active(True)
                    event.acceptProposedAction()
                    return True
            elif is_ours and et == QEvent.Drop:
                self._set_global_drag_active(False)
                if event.mimeData().hasUrls():
                    paths = [u.toLocalFile() for u in event.mimeData().urls() if u.isLocalFile()]
                    if paths:
                        self.add_paths(paths)
                        event.acceptProposedAction()
                        return True
            elif is_ours and et == QEvent.DragLeave:
                self._set_global_drag_active(False)
            return super().eventFilter(obj, event)

        def selected_quarters(self):
            return sorted([Quarter(y,q) for (y,q), b in self.quarter_buttons.items() if b.isChecked()])

        def rebuild_quarters(self):
            while self.qgrid.count():
                item=self.qgrid.takeAt(0)
                w=item.widget()
                if w: w.deleteLater()
            self.quarter_buttons={}
            y=self.year.value()
            for row, yy in enumerate((y-1,y)):
                lab=QLabel(str(yy)); lab.setObjectName("Tiny"); self.qgrid.addWidget(lab,row,0)
                for q in range(1,5):
                    b=QPushButton(f"Q{q}"); b.setObjectName("Quarter"); b.setCheckable(True)
                    b.toggled.connect(self.on_quarter_changed)
                    self.qgrid.addWidget(b,row,q)
                    self.quarter_buttons[(yy,q)]=b
            self.apply_round_default_quarters()
            self.on_quarter_changed()

        def apply_round_default_quarters(self):
            if not self.quarter_buttons:
                return
            for b in self.quarter_buttons.values():
                b.blockSignals(True); b.setChecked(False); b.blockSignals(False)
            y=self.year.value(); rnd=self.round.currentText()
            targets=[(y-1,4),(y,1)] if rnd=="1차" else [(y,2)] if rnd=="2차" else [(y,3)] if rnd=="3차" else [(y,4)]
            for key in targets:
                if key in self.quarter_buttons:
                    self.quarter_buttons[key].setChecked(True)

        def on_round_changed(self, *_):
            self.apply_round_default_quarters()
            self.on_quarter_changed()

        def on_quarter_changed(self, *_):
            qs=self.selected_quarters()
            if qs:
                self.period.setText(f"안건 기준 · {selected_period_label(qs)}")
                self.waiver_period.setText(f"포기특허 기준 · {waiver_reporting_quarter(qs).label}  (+1분기 · MarkPro 원천)")
            else:
                self.period.setText("안건 기준분기를 선택하세요")
                self.waiver_period.setText("포기특허 기준 · –")
            self.refresh_advanced_summary()
            self.refresh_ready()
            if self.ip_path and self.markpro_path and qs:
                self.preview_timer.start(180)
            else:
                self.clear_metrics()

        def toggle_advanced(self):
            show = self.adv_btn.isChecked()
            self.adv_panel.setVisible(show)
            self.adv_btn.setText("고급 설정  ▴" if show else "고급 설정  ▾")

        def graph_mode(self) -> str:
            for mode, rb in self.graph_radios.items():
                if rb.isChecked():
                    return mode
            return GRAPH_DEFAULT_MODE

        def graph_style(self) -> str:
            for style, rb in self.graph_style_radios.items():
                if rb.isChecked():
                    return style
            return GRAPH_DEFAULT_STYLE

        def graph_years(self):
            """Full-period year list implied by the current quarter selection.

            Matches build_graph_data exactly, so the GUI can show the resolved
            window without re-reading the source workbooks.
            """
            qs = self.selected_quarters()
            if not qs:
                return []
            return list(range(GRAPH_DATA_START_YEAR, graph_cutoff(qs).year + 1))

        def on_graph_option_changed(self, *_):
            custom = self.graph_mode() == "custom"
            self.graph_start.setEnabled(custom)
            self.graph_end.setEnabled(custom)
            self.refresh_advanced_summary()

        def refresh_advanced_summary(self):
            mode = self.graph_mode()
            style = self.graph_style()
            years = self.graph_years()
            if not years:
                self.adv_summary.setText(f"그래프 · {GRAPH_STYLE_LABELS[style]} · 분기 선택 후 표시기간 확정")
                return
            s, e = resolve_graph_window(
                years, mode,
                self.graph_start.value() if mode == "custom" else None,
                self.graph_end.value() if mode == "custom" else None,
            )
            self.adv_summary.setText(
                f"그래프 · {GRAPH_STYLE_LABELS[style]} · {graph_window_label(mode, s, e)}  |  데이터 {years[0]}~{years[-1]} 전체 보존"
            )

        def settings(self):
            mode = self.graph_mode()
            return Settings(
                self.year.value(), self.round.currentText(), self.selected_quarters(),
                graph_range_mode=mode,
                graph_start_year=self.graph_start.value() if mode == "custom" else None,
                graph_end_year=self.graph_end.value() if mode == "custom" else None,
                graph_style=self.graph_style(),
            )

        @staticmethod
        def _file_signature(path):
            if not path:
                return ("", 0, 0)
            p = Path(path)
            try:
                st = p.stat()
                return (str(p.resolve()), int(st.st_size), int(st.st_mtime_ns))
            except OSError:
                return (str(p), 0, 0)

        def current_master_signature(self):
            """Fingerprint inputs/settings so HWP never uses a stale MASTER."""
            st = self.settings()
            return (
                self._file_signature(self.ip_path),
                self._file_signature(self.markpro_path),
                int(st.meeting_year), str(st.meeting_round),
                tuple((q.year, q.quarter) for q in st.quarters),
                st.graph_range_mode, st.graph_start_year, st.graph_end_year, st.graph_style,
                str(Path(self.out.text().strip() or ".").resolve()),
            )

        def clear_metrics(self):
            for m in (self.m_app,self.m_reg,self.m_foreign,self.m_waiver): m.value.setText("–")

        def refresh_ready(self, *_):
            qs=self.selected_quarters()
            ready=bool(self.ip_path and self.markpro_path and qs and not self.busy)
            self.run_btn.setEnabled(ready)
            # HWP is now a one-click chain from the same source inputs; no MASTER/template dialog required.
            self.hwp_btn.setEnabled(ready)
            self.ready_badge.setProperty("ready", ready)
            self.ready_badge.style().unpolish(self.ready_badge); self.ready_badge.style().polish(self.ready_badge)
            if self.busy:
                self.ready_badge.setText("생성 중")
            elif ready:
                self.ready_badge.setText("생성 가능")
                self.status.setText(f"안건 {selected_period_label(qs)} · 포기 {waiver_reporting_quarter(qs).label}(+1Q) · 아래 미리보기 확인 후 생성")
            else:
                self.ready_badge.setText("입력 대기")
                missing=[]
                if not self.ip_path: missing.append("상세목록")
                if not self.markpro_path: missing.append("MarkPro")
                if not qs: missing.append("분기")
                self.status.setText("필요: " + ", ".join(missing) if missing else "준비 중")

        def pick_files(self):
            names,_=QFileDialog.getOpenFileNames(self,"원본 XLSX 선택","","Excel (*.xlsx);;All files (*.*)")
            if names: self.add_paths(names)

        def pick_folder(self):
            name=QFileDialog.getExistingDirectory(self,"원본 폴더 선택")
            if name: self.add_paths([name])

        def add_paths(self, paths):
            try:
                files=expand_drop_paths(paths)
                if not files:
                    raise ValueError("XLSX 파일을 찾지 못했습니다.")
                unknown=[]; recognized=0
                for p in files:
                    kind=classify_xlsx(p)
                    if kind=="ip":
                        self.ip_path=str(p); recognized+=1
                        self.out.setText(str(p.parent/"committee_output"))
                    elif kind=="markpro":
                        self.markpro_path=str(p); recognized+=1
                    else:
                        unknown.append(p.name)
                self.ip_card.set_file(self.ip_path); self.mark_card.set_file(self.markpro_path)
                self.append_log(f"파일 인식: {recognized}개")
                if unknown: self.append_log("미분류 XLSX: " + ", ".join(unknown))
                self.refresh_ready()
                if self.ip_path and self.markpro_path and self.selected_quarters(): self.preview_timer.start(120)
            except Exception as e:
                QMessageBox.critical(self,"파일 인식 오류",str(e))

        def clear_files(self):
            self.preview_token += 1  # invalidate any in-flight preview
            self.ip_path=""; self.markpro_path=""
            self.ip_card.set_file(""); self.mark_card.set_file("")
            self.clear_metrics(); self.refresh_ready(); self.append_log("입력 파일을 비웠습니다.")

        def start_preview(self):
            if not (self.ip_path and self.markpro_path and self.selected_quarters()) or self.busy: return
            self.preview_token += 1
            token=self.preview_token
            files={"ip":self.ip_path,"markpro":self.markpro_path}
            settings=self.settings()
            self.status.setText("선택 분기로 건수를 확인하고 있습니다…")
            import threading
            def work():
                try:
                    res=preview_master(files,settings)
                    self.bridge.preview_done.emit(res,token)
                except Exception:
                    self.bridge.preview_error.emit(traceback.format_exc(),token)
            threading.Thread(target=work,daemon=True).start()

        def on_preview_done(self,res,token):
            if token != self.preview_token: return
            self.m_app.value.setText(str(res["applications"]))
            self.m_app.note.setText(f"더미 제외 {res['application_excluded']}건")
            self.m_reg.value.setText(str(res["registrations"]))
            self.m_foreign.value.setText(str(res["foreign_reviews"]))
            self.m_foreign.note.setText(f"자동 제외 {res['foreign_excluded']}건")
            self.m_waiver.value.setText(str(res["waivers"]))
            self.m_waiver.note.setText(f"{res['waiver_period']} · 납부구분 '포기' 기준")
            self.refresh_ready()
            self.status.setText(
                f"안건 {res['period']} · 포기기준 {res['waiver_period']} · 출원 {res['applications']} · 등록 {res['registrations']} · "
                f"국외심의 {res['foreign_reviews']} · 포기 {res['waivers']} · 그래프 {res['cutoff']} 기준 / 표시 {res['graph_window_label']}"
            )

        def on_preview_error(self,text,token):
            if token != self.preview_token: return
            self.append_log(text)
            self.status.setText("미리보기 계산 중 오류가 발생했습니다. 상세 로그를 확인하세요.")

        def sync_hwp_date_year(self, year: int):
            d = self.hwp_date.date()
            self.hwp_date.setDate(QDate(int(year), d.month(), min(d.day(), QDate(int(year), d.month(), 1).daysInMonth())))

        def pick_output(self):
            name=QFileDialog.getExistingDirectory(self,"저장 위치 선택",self.out.text())
            if name: self.out.setText(name)

        def run_generate(self):
            if self.busy: return
            if not (self.ip_path and self.markpro_path):
                QMessageBox.warning(self,"입력 확인","상세목록과 MarkPro 회신을 넣어주세요."); return
            settings=self.settings()
            if not settings.quarters:
                QMessageBox.warning(self,"입력 확인","분기를 하나 이상 선택하세요."); return
            out=self.out.text().strip()
            if not out:
                QMessageBox.warning(self,"입력 확인","저장 위치를 선택하세요."); return
            self.active_generation_signature = self.current_master_signature()
            self.active_generation_settings = settings
            self.busy=True; self.refresh_ready(); self.run_btn.setText("생성 중…")
            if self.pending_hwp_after_master:
                self.status.setText("한글 안건 생성을 위해 MASTER부터 자동 생성하고 있습니다…")
            else:
                self.status.setText("MASTER와 그래프를 생성하고 저장 내용을 재검증하고 있습니다…")
            files={"ip":self.ip_path,"markpro":self.markpro_path}
            import threading
            def work():
                try:
                    res=generate_master(files,out,settings,self.bridge.log.emit,False)
                    self.bridge.generate_done.emit(res)
                except Exception:
                    self.bridge.generate_error.emit(traceback.format_exc())
            threading.Thread(target=work,daemon=True).start()

        def on_generate_done(self,res):
            self.busy=False; self.run_btn.setText("작업 MASTER 만들기"); self.refresh_ready()
            self.last_output_dir=str(Path(res["master"]).parent)
            self.last_master_path=str(res["master"])
            self.last_master_signature = self.active_generation_signature
            self.last_master_settings = self.active_generation_settings
            self.active_generation_signature = None
            self.active_generation_settings = None
            self.status.setText(
                f"완료 · 안건 {res['period']} · 포기기준 {res['waiver_period']} · 출원 {res['applications']} · 등록 {res['registrations']} · "
                f"국외심의 {res['foreign_reviews']} · 포기 {res['waivers']} · 그래프 표시 {res['graph_window_label']}"
            )

            # One-click HWP workflow: MASTER was only an internal first step.
            if self.pending_hwp_after_master:
                self.pending_hwp_after_master = False
                self.status.setText("MASTER 생성 완료 · 같은 설정으로 한글 안건 생성을 계속합니다…")
                self._start_hwp_generation(self.last_master_path, self.last_master_settings)
                return

            QMessageBox.information(
                self, "완료",
                "작업 MASTER 생성 완료\n\n"
                f"안건 기준: {res['period']}\n"
                f"포기특허 기준: {res['waiver_period']} (+1분기)\n\n"
                f"출원 {res['applications']}건\n등록 {res['registrations']}건\n"
                f"국외심의 {res['foreign_reviews']}건\n포기 {res['waivers']}건\n\n"
                f"그래프 표시기간: {res['graph_window_label']}\n"
                f"그래프 데이터기간: {res['graph_data_years'][0]}~{res['graph_data_years'][1]} (20_그래프데이터는 전체 보존)\n"
                "PNG 4종 생성: 화면용 2 + HWPX 삽입용 2\n\n"
                "포기 대상은 MarkPro의 납부구분에 '포기'가 포함된 건을 사용하며, 납부여부 N은 필터 조건으로 사용하지 않습니다. "
                "별도 날짜 필터도 적용하지 않습니다.\n저장 후 실제 셀 재검증까지 통과했습니다.\n\n"
                f"{res['master']}"
            )

        def run_hwp_generate(self):
            """One click: reuse matching MASTER, otherwise build it first, then create HWP."""
            if self.busy:
                return
            if not (self.ip_path and self.markpro_path):
                QMessageBox.warning(self, "입력 확인", "상세목록과 MarkPro 회신을 넣어주세요.")
                return
            if not self.selected_quarters():
                QMessageBox.warning(self, "입력 확인", "분기를 하나 이상 선택하세요.")
                return

            current_sig = self.current_master_signature()
            master_ok = (
                bool(self.last_master_path)
                and Path(self.last_master_path).exists()
                and self.last_master_signature == current_sig
            )
            if master_ok:
                self._start_hwp_generation(self.last_master_path, self.last_master_settings or self.settings())
                return

            # No dialog and no stale MASTER: generate the MASTER, then chain HWP automatically.
            self.pending_hwp_after_master = True
            self.run_generate()

        def _start_hwp_generation(self, master, settings):
            app_root = Path(__file__).resolve().parent
            meeting_year = int(getattr(settings, "meeting_year", self.year.value()))
            meeting_round = getattr(settings, "meeting_round", self.round.currentText())
            user_template_dir, copied = seed_user_hwp_templates(app_root, meeting_year, meeting_round)
            if copied:
                self.append_log(f"기본 HWP 양식 {copied}종을 사용자 공용 폴더에 자동 준비: {user_template_dir}")
            tpl = find_bundled_hwp_templates(app_root, meeting_year, meeting_round)
            if not tpl:
                self.pending_hwp_after_master = False
                rnd = _meeting_round_number(meeting_round) or meeting_round
                expected = user_hwp_template_dir(meeting_year, meeting_round, create=True)
                self.status.setText(f"{meeting_year}년 {rnd}차 HWP 양식이 없습니다. 사용자 양식 폴더를 열었습니다.")
                try:
                    if os.name == "nt":
                        os.startfile(str(expected))  # type: ignore[attr-defined]
                except Exception:
                    pass
                QMessageBox.warning(
                    self, "HWP 양식 없음",
                    f"{meeting_year}년 {rnd}차 한글 양식이 내장되어 있지 않습니다.\n\n"
                    "사용자 양식 폴더를 자동으로 열었습니다. 해당 회차 .hwp 양식 6종을 넣으면 바로 인식합니다.\n\n"
                    f"{expected}\n\n"
                    "※ 2026년 1차 기본 양식 6종은 프로그램의 resources\\hwp_templates\\2026_1 폴더에 실제 HWP 파일로 포함되어 있습니다."
                )
                return

            default_out = Path(master).parent / "hwp_output"
            default_out.mkdir(parents=True, exist_ok=True)
            out_dir = str(default_out)

            self.busy = True
            self.refresh_ready()
            self.hwp_btn.setText("한글 생성 중…")
            self.status.setText("MASTER → HWP 안건 6종을 자동 연계 생성하고 있습니다…")
            self.append_log(f"HWP MASTER 자동연계: {master}")
            tpl_origin = "사용자 양식" if str(tpl).startswith(str(_app_data_root())) else "내장 양식"
            self.append_log(f"HWP 템플릿 자동선택 ({tpl_origin}): {tpl}")
            self.append_log(f"HWP 출력폴더 자동선택: {out_dir}")
            script = app_root / "hwp_fill.py"
            runner = Path(sys.executable)
            if runner.name.lower() == "pythonw.exe":
                py_console = runner.with_name("python.exe")
                if py_console.exists():
                    runner = py_console
            hwp_date = self.hwp_date.date().toString("yyyy-MM-dd")
            self.append_log(f"안건 상정 일자(보고/심의/결의일): {self.hwp_date.date().toString('yyyy-M-d')}")
            cmd = [str(runner), str(script), "--master", str(master), "--templates", str(tpl), "--out-dir", out_dir,
                   "--date", hwp_date]
            import threading

            def work():
                try:
                    # Force UTF-8 for redirected child output.  Without this, Windows
                    # CP949 output decoded as UTF-8 produced messages like 'ZIP�� ...'.
                    env = os.environ.copy()
                    env["PYTHONUTF8"] = "1"
                    env["PYTHONIOENCODING"] = "utf-8"
                    cp = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
                    text = (cp.stdout or "") + (("\n" + cp.stderr) if cp.stderr else "")
                    self.bridge.hwp_done.emit(int(cp.returncode), text, out_dir)
                except Exception:
                    self.bridge.hwp_error.emit(traceback.format_exc())
            threading.Thread(target=work, daemon=True).start()

        def on_hwp_done(self, code, text, out_dir):
            self.busy = False
            self.hwp_btn.setText("한글 안건 만들기")
            self.refresh_ready()
            self.last_output_dir = out_dir
            if text.strip():
                self.append_log(text)
            report = Path(out_dir) / "hwp_fill_report.txt"
            preflight = Path(out_dir) / "template_preflight.txt"
            if code == 0:
                self.status.setText("한글 안건 자동 생성 및 검증 완료")
                QMessageBox.information(self, "HWP 생성 완료", f"한글 안건 생성이 완료되었습니다.\n\n{out_dir}")
            elif code == 3:
                self.status.setText("한글 안건 생성 완료 · 수동 확인 항목 있음")
                QMessageBox.warning(self, "HWP 생성 완료/확인 필요",
                                    f"자동 생성은 완료됐지만 수동 확인 항목이 있습니다.\n\n{report}")
            elif code == 1:
                self.status.setText("HWP 사전검사 또는 적용 중 일부 문서가 차단/실패했습니다.")
                QMessageBox.warning(self, "HWP 생성 확인 필요",
                                    "안전 검증에서 일부 문서가 차단되었거나 적용에 실패했습니다.\n\n"
                                    f"사전검사: {preflight}\n리포트: {report if report.exists() else '(실제 적용 전)'}")
            else:
                self.status.setText(f"HWP 생성이 완료되지 않았습니다. 종료코드 {code}")
                QMessageBox.warning(self, "HWP 생성 중단", f"종료코드 {code}\n\n상세 로그를 확인하세요.")

        def on_hwp_error(self, text):
            self.busy = False
            self.pending_hwp_after_master = False
            self.hwp_btn.setText("한글 안건 만들기")
            self.refresh_ready()
            self.append_log(text)
            self.log_box.show(); self.log_btn.setText("로그 닫기")
            self.status.setText("HWP 생성 호출 중 오류가 발생했습니다.")
            QMessageBox.critical(self, "HWP 생성 오류", "HWP 생성 호출 중 오류가 발생했습니다. 상세 로그를 확인하세요.")

        def on_generate_error(self,text):
            self.busy=False; self.run_btn.setText("작업 MASTER 만들기"); self.refresh_ready()
            self.pending_hwp_after_master = False
            self.active_generation_signature = None
            self.active_generation_settings = None
            self.append_log(text); self.log_box.show(); self.log_btn.setText("로그 닫기")
            self.status.setText("생성 중 오류가 발생했습니다. 상세 로그를 확인하세요.")
            QMessageBox.critical(self,"생성 오류","작업 중 오류가 발생했습니다. 상세 로그를 확인하세요.")

        def append_log(self,msg):
            self.log_box.append(str(msg).rstrip())

        def toggle_log(self):
            show=not self.log_box.isVisible(); self.log_box.setVisible(show); self.log_btn.setText("로그 닫기" if show else "상세 로그")

        def open_template_folder(self):
            app_root = Path(__file__).resolve().parent
            target, copied = seed_user_hwp_templates(app_root, self.year.value(), self.round.currentText())
            try:
                if os.name == "nt":
                    os.startfile(str(target))  # type: ignore[attr-defined]
                else:
                    subprocess.Popen(["xdg-open", str(target)])
                suffix = f" · 기본 양식 {copied}종 자동 복사" if copied else ""
                self.status.setText(f"한글양식 폴더를 열었습니다 · {target}{suffix}")
            except Exception as e:
                QMessageBox.critical(self, "한글양식 폴더", str(e))

        def open_output(self):
            target=Path(self.last_output_dir or self.out.text())
            try:
                target.mkdir(parents=True,exist_ok=True)
                if os.name=="nt": os.startfile(str(target))  # type: ignore[attr-defined]
            except Exception as e:
                QMessageBox.critical(self,"폴더 열기",str(e))

    qapp=QApplication.instance() or QApplication(sys.argv)
    qapp.setFont(QFont("Malgun Gothic", 10))
    w=Window(); w.show()
    return qapp.exec_()


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------
def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gui", action="store_true")
    ap.add_argument("--ip")
    ap.add_argument("--markpro")
    ap.add_argument("--quarters", default="")
    ap.add_argument("--year", type=int, default=dt.datetime.now().year)
    ap.add_argument("--round", default="1차")
    ap.add_argument("--output", default="output")
    ap.add_argument("--validate-only", action="store_true")
    ap.add_argument("--graph-range", choices=list(GRAPH_RANGE_MODES), default=GRAPH_DEFAULT_MODE,
                    help="차트 표시기간 (20_그래프데이터는 항상 전체 기간 유지)")
    ap.add_argument("--graph-start-year", type=int, default=None, help="--graph-range custom 일 때 시작년도")
    ap.add_argument("--graph-end-year", type=int, default=None, help="--graph-range custom 일 때 종료년도")
    ap.add_argument("--graph-style", choices=list(GRAPH_STYLE_MODES), default=GRAPH_DEFAULT_STYLE,
                    help="그래프 형태: line=꺾은선형, combo=막대+꺾은선형")
    ns = ap.parse_args(argv)
    if ns.gui or (not ns.ip and not ns.markpro):
        launch_gui(); return 0
    qs = parse_quarters(ns.quarters)
    settings = Settings(
        ns.year, ns.round, qs,
        graph_range_mode=ns.graph_range,
        graph_start_year=ns.graph_start_year,
        graph_end_year=ns.graph_end_year,
        graph_style=ns.graph_style,
    )
    res = generate_master({"ip": ns.ip, "markpro": ns.markpro}, ns.output, settings, print, ns.validate_only)
    print(res)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
