# -*- coding: utf-8 -*-
"""
KRISS Committee Automation - HWP 양식 채움 모듈 (v0.2.7)
================================================================

MASTER.xlsx(v0.1.9+ 산출물)를 읽어 직무발명관리위원회 붙임 HWP 양식
6종(붙임1/2/5/6/7/8)의 데이터 표·요약 문구·통계표·그래프 그림을 채운다.

동작 구조 (2단계)
  1) PlanBuilder  : MASTER → "채움 계획(FillPlan)" 생성. OS 무관.
                    --dry-run 시 plan JSON + 문서별 미리보기 텍스트 출력.
  2) HwpApplier   : Windows + 한/글(한컴오피스) COM 자동화로 plan을
                    붙임 템플릿 .hwp에 적용 후 "다른 이름 저장".
                    연결 계층은 pyhwpx → win32com EnsureDispatch →
                    win32com dynamic 순서 (한글편집단축키.py v2.0과 동일).

표 접근 방식
  - 문서 내 표를 "표 순번(index)"으로 접근하고, 채우기 전에 머리행
    텍스트를 실제로 읽어 기대 머리행과 대조한다. 불일치 시 그 표는
    건너뛰고 리포트에 남긴다 (템플릿 개정 감지).
  - 셀 이동은 ShapeObjTableSelCell(첫 셀 진입) + TableRightCell(순차 이동)을
    사용한다. 제공 양식의 국가 열 세로병합은 TableSplitCell로 자동 분할한
    뒤 직사각형 데이터 영역으로 정규화한다. 예상과 다른 병합 구조는 중단한다.
  - 행 수 조정(v0.2.7): 원본의 첫 데이터행/마지막 데이터행을 보존하고, 기준 중간행을
    TableCellBlockRow로 선택한 뒤 TableInsertLowerRow(호환 fallback TableAppendRow)로 삽입한다.
    이 방식으로 머리/중간/마지막 행의 테두리·배경 패턴을 최대한 그대로 유지한다.
  - 국가/구분 세로병합은 입력 전에 풀고, 값 검증 후 MASTER의 그룹 길이에 맞춰
    다시 병합한다. 저장 후 HWP 바이너리에서 폭/여백/테두리/문단·글자모양/병합을 재검증한다.

자동화 범위 (v0.2.7)
  붙임1  출원 보고  : 표지/속표지, 개요 문구, 국내표, 국외표, 통계표, 그래프 PNG
  붙임2  등록 보고  : 위와 동일 구조
  붙임5  국외심의   : 표지/속표지, 개요 문구, 본부별 집계표, 심의목록표
  붙임6  포기 승인  : 표지/속표지, 주문/제안 문구, 절차표, 국내표, 국외표
  붙임7  개최 운영안: 작성월 및 안건명 갱신, 위원 명단·예산은 템플릿 유지
  붙임8  서면결의서: 작성월·안건명·결의일 갱신, 위원 표시/의견/서명란 유지

  보존/수동 영역
  - 붙임5 별첨 개별 평가표: 기존 템플릿 내용을 보존하되, 심의목록과
    제목/주발명자 연계가 모두 맞는지 preflight로 확인. 불일치 시 해당 문서 차단.
  - 붙임5 본부(소): --dept-map 또는 config/dept_map_<연도>_<회차>.csv 사용

검증 원칙 (프로젝트 공통)
  적용 후 각 표를 다시 읽어 계획과 대조하고, 불일치가 있으면 완료로
  보고하지 않는다. 결과는 out/hwp_fill_report.txt 에 기록한다.

[실측 상태] COM 적용부는 Windows+한/글 환경에서 실측 검증 전이다.
PlanBuilder/dry-run/preflight는 2026년 1차 골든 및 실제 제공 양식으로 검증한다.
(VALIDATION_v0_2_1_HWPFILL.md 참조).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import re
import shutil
import struct
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

# 코어 모듈의 정규화/국가 판정 헬퍼 재사용 (무거운 GUI/그래프 의존성은 지연 임포트라 안전)
import kriss_committee_automation as kca
import hwp_support

VERSION = "0.2.9"
# 셀 하나의 텍스트로 볼 수 있는 최대 길이(초과 시 표 전체가 반환된 것으로 판단)
CELL_TEXT_SANE_LEN = 400
# 본문 개체(표/그리기개체/수식/글상자)의 CtrlID — 문단 편집 시 보호 대상
BODY_CTRL_IDS = ("tbl", "gso", "eqed", "$rec", "atno", "form")
# anchor 반복 탐색 상한(문서를 한 바퀴 돈 것은 위치로 먼저 감지한다)
MAX_PARA_HITS = 80
# 행 삭제/추가 액션 후보 — 한/글 버전마다 먹는 이름이 달라 결과로 판정한다
DELETE_ROW_ACTIONS = ("TableDeleteRow", "TableDeleteRowColumn", "TableDeleteRowCol",
                      "@TableDeleteRowCol")
INSERT_ROW_ACTIONS = ("TableInsertLowerRow", "TableAppendRow", "TableInsertRowBelow",
                      "TableInsertRow", "TableInsertUpperRow", "TableRightCellAppend")

HWPX_PNG_WIDTH_MM = 170  # 병합본(2026_2) 그림 표시폭 171.1mm에 맞춘 규격 (v0.2.9)

# Table-style constants from the supplied HWP utility.
# HWP line type values: 0 none, 1 solid, 8 double-slim/double.
HWP_LINE_NONE = 0
HWP_LINE_SOLID = 1
HWP_LINE_DOUBLE = 8
HWP_LINE_WIDTH_012 = 1
HWP_HEADER_SHADE = 0xEFEFEF
HWP_CELL_WHITE = 0xFFFFFF
HWP_PARA_NO_FILL = 0xFFFFFFFF


# ---------------------------------------------------------------------------
# Windows HWP automation connection helpers
# Based on the connection strategy supplied in 한글편집단축키.py:
# pyhwpx -> EnsureDispatch -> dynamic.Dispatch, with security-module repair.
# ---------------------------------------------------------------------------

SECURITY_MODULE_NAME = "FilePathCheckerModule"
_REG_SUBKEY = r"SOFTWARE\HNC\HwpAutomation\Modules"


def _find_security_dll() -> Optional[Path]:
    """Find a FilePathChecker security DLL without assuming an install path."""
    if os.name != "nt":
        return None
    import glob

    here = Path(__file__).resolve().parent
    cands: list[str] = []
    for base in (str(here), os.getcwd(), str(Path.home())):
        cands.extend(glob.glob(os.path.join(base, "FilePathChecker*.dll")))
    for root in (r"C:\Program Files (x86)\Hnc", r"C:\Program Files\Hnc"):
        if os.path.isdir(root):
            cands.extend(glob.glob(os.path.join(root, "**", "FilePathChecker*.dll"), recursive=True))
    for item in cands:
        if os.path.isfile(item):
            return Path(item).resolve()
    return None


def _registered_security_dll() -> Optional[Path]:
    """Return the registered security DLL when the HKCU entry is valid."""
    if os.name != "nt":
        return None
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _REG_SUBKEY) as key:
            val, _ = winreg.QueryValueEx(key, SECURITY_MODULE_NAME)
        value = str(val or "").strip().strip('"')
        path = Path(value)
        return path if value and path.is_file() else None
    except OSError:
        return None


def _ensure_security_module_registry() -> Optional[Path]:
    """Register FilePathChecker under HwpAutomation\\Modules when discoverable."""
    if os.name != "nt":
        return None
    existing = _registered_security_dll()
    if existing:
        return existing
    dll = _find_security_dll()
    if not dll:
        return None
    try:
        import winreg
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, _REG_SUBKEY) as key:
            # Registry value must be the raw path, not a quoted path.
            winreg.SetValueEx(key, SECURITY_MODULE_NAME, 0, winreg.REG_SZ, str(dll))
        return dll
    except OSError:
        return None


def _prepare_hwp_object(hwp):
    """Make the automation window visible and ensure an editable document exists."""
    try:
        hwp.XHwpWindows.Item(0).Visible = True
    except Exception:
        pass
    try:
        if hwp.XHwpDocuments.Count == 0:
            hwp.XHwpDocuments.Add(0)
    except Exception:
        try:
            hwp.HAction.Run("FileNew")
        except Exception:
            pass
    return hwp

DOMESTIC_COUNTRY_TOKENS = {"한국", "대한민국", "국내", "KR", "KOREA", "REPUBLIC OF KOREA"}


# ---------------------------------------------------------------------------
# 공통 유틸
# ---------------------------------------------------------------------------

def is_object_char(ch: str) -> bool:
    """문단 텍스트에 섞여 나오는 개체(표/그림) 자리표시 문자인지."""
    o = ord(ch)
    return o < 0x20 or 0xFFF9 <= o <= 0xFFFC


def strip_object_chars(text: str) -> str:
    return "".join(c for c in text if not is_object_char(c))


def short(s: Any, limit: int = 24) -> str:
    """리포트용 축약 문자열(표 전체가 반환돼도 로그가 폭발하지 않도록)."""
    t = re.sub(r"\s+", " ", "" if s is None else str(s)).strip()
    return t if len(t) <= limit else t[:limit] + f"…({len(t)}자)"


def norm_ws(s: Any) -> str:
    """공백/개행/전각공백을 접어 비교용 문자열로 정규화."""
    t = "" if s is None else str(s)
    t = t.replace("\u2019", "'").replace("\u2018", "'").replace("\u00b7", "·")
    return re.sub(r"\s+", "", t)


def same_text(a: Any, b: Any) -> bool:
    """기입 스킵 판정용 엄격 비교: 공백만 접고 문자는 그대로 (v0.2.9).

    norm_ws는 ’/‘→' 접기를 포함해 anchor 탐색·검증을 관대하게 하지만, 그
    기준으로 '이미 동일'을 판정하면 표기 교정(’→', ~→∼)이 스킵된다.
    """
    fold = lambda v: re.sub(r"\s+", "", "" if v is None else str(v))
    return fold(a) == fold(b)


def fmt_date(v: Any) -> str:
    d = kca.excel_serial_to_datetime(v)
    if d:
        return f"{d.year}-{d.month}-{d.day}"  # m-d: 월·일 선행 0 없음 (v0.2.9 표기 규칙)
    return kca.norm_text(v)


def short_year(y: int) -> str:
    return f"'{y % 100:02d}"  # '25 — 2026_2 병합본은 곹은따옴표(U+0027) 표기


def kdate(d: dt.date) -> str:
    return f"{short_year(d.year)}. {d.month}. {d.day}."


def is_domestic_country(v: Any) -> bool:
    c = kca.norm_text(v).upper()
    return c in DOMESTIC_COUNTRY_TOKENS or kca.canonical_country(v) in ("한국", "대한민국")

def display_country(v: Any) -> str:
    """위원회 양식용 국가명 표준화."""
    c = kca.canonical_country(v)
    fallback = {"TW": "대만", "TAIWAN": "대만", "EP": "유럽 연합", "EU": "유럽 연합"}
    return fallback.get(c.upper(), c) if c else kca.norm_text(v)


def country_sort_key(v: Any) -> tuple[int, str]:
    c = display_country(v)
    order = {"PCT": 0, "미국": 10, "중국": 20, "일본": 30, "유럽 연합": 40,
             "대만": 50, "독일": 60, "영국": 70, "프랑스": 80, "싱가포르": 90}
    return (order.get(c, 999), c)


def png_size_mm(path: Path, target_w_mm: float) -> tuple[float, float]:
    """PNG IHDR에서 픽셀 크기를 읽어 폭 target_w_mm 기준 높이를 비율 계산."""
    with open(path, "rb") as f:
        head = f.read(26)
    if len(head) < 26 or head[12:16] != b"IHDR":
        return (target_w_mm, target_w_mm * 0.5)
    w, h = struct.unpack(">II", head[16:24])
    return (target_w_mm, target_w_mm * h / w) if w else (target_w_mm, target_w_mm * 0.5)


# ---------------------------------------------------------------------------
# MASTER 읽기
# ---------------------------------------------------------------------------

@dataclass
class MasterData:
    path: Path
    period_label: str                 # 예: 2025년 4분기 ~ 2026년 1분기
    waiver_label: str                 # 예: 2026년 2분기
    quarters: list[tuple[int, int]]   # [(2025,4),(2026,1)]
    applications: list[dict]          # 10_출원현황 최종반영 Y
    registrations: list[dict]         # 11_등록현황
    foreign_reviews: list[dict]       # 12_국외심의 최종반영 Y
    waivers: list[dict]               # 13_포기심의
    graph_app: list[dict]             # 20_그래프데이터 출원 블록 (전체 기간)
    graph_reg: list[dict]             # 등록 블록
    meeting_year: Optional[int] = None
    meeting_round: Optional[int] = None
    master_version: str = ""



def _dict_rows(matrix: list[list[Any]], header_row: int = 0) -> list[dict]:
    """머리행 이후, '최종반영'이 있으면 Y인 행만. 제외목록 블록(재머리행 이후)은 버린다."""
    if not matrix:
        return []
    header = [kca.norm_text(h) for h in matrix[header_row]]
    out = []
    for row in matrix[header_row + 1:]:
        vals = list(row) + [""] * (len(header) - len(row))
        rec = {header[i]: vals[i] for i in range(len(header))}
        if [kca.norm_text(v) for v in vals[: len(header)]] == header:
            break
        if all(kca.norm_text(v) == "" for v in vals[: len(header)]):
            continue
        if "최종반영" in rec and kca.norm_text(rec["최종반영"]) not in ("Y", ""):
            continue
        if kca.norm_text(rec.get("순번", "")) in ("", "제외목록", "자동 제외목록"):
            continue
        out.append(rec)
    return out


def parse_period_quarters(label: str) -> list[tuple[int, int]]:
    qs = [(int(y), int(q)) for y, q in re.findall(r"(\d{4})년\s*(\d)분기", label)]
    if len(qs) == 2 and any(t in label for t in ("~", "\u223c", "\uff5e")):
        (y1, q1), (y2, q2) = qs
        out, y, q = [], y1, q1
        while (y, q) <= (y2, q2):
            out.append((y, q))
            q += 1
            if q == 5:
                y, q = y + 1, 1
        return out
    return qs


def read_master(path: Path) -> MasterData:
    """Read a MASTER without Excel/openpyxl. Reuses the project native XLSX reader."""
    with kca.XlsxBookReader(path) as xr:
        need = ["00_요약", "10_출원현황", "11_등록현황", "12_국외심의", "13_포기심의", "20_그래프데이터"]
        missing = [name for name in need if name not in xr.sheet_names]
        if missing:
            raise SystemExit(f"MASTER 시트 누락: {missing} — v0.1.9 이상 MASTER인지 확인하십시오.")
        summary = xr.read_sheet("00_요약")
        app_m = xr.read_sheet("10_출원현황")
        reg_m = xr.read_sheet("11_등록현황")
        foreign_m = xr.read_sheet("12_국외심의")
        waiver_m = xr.read_sheet("13_포기심의")
        gd = xr.read_sheet("20_그래프데이터")

    period = waiver = master_version = ""
    meeting_year: Optional[int] = None
    meeting_round: Optional[int] = None
    for row in summary:
        k = kca.norm_text(row[0] if row else "")
        v = kca.norm_text(row[1] if row and len(row) > 1 else "")
        if k == "Version":
            master_version = v
        elif k == "위원회":
            mm = re.search(r"(20\d{2})년\s*(\d+)차", v)
            if mm:
                meeting_year, meeting_round = int(mm.group(1)), int(mm.group(2))
        elif k == "안건 기준분기":
            period = v
        elif k == "포기특허 기준분기":
            waiver = re.sub(r"\s*\(.*\)\s*$", "", v)
    if not period:
        raise SystemExit("00_요약에서 '안건 기준분기'를 찾지 못했습니다.")

    graph_app, graph_reg = [], []
    for row in gd[2:]:
        row = list(row) + [""] * 16
        if isinstance(row[0], (int, float)) and row[0]:
            graph_app.append({
                "year": int(row[0]), "label": kca.norm_text(row[1]),
                "domestic": int(row[2] or 0), "pct": int(row[3] or 0),
                "foreign_general": int(row[4] or 0), "total": int(row[6] or 0),
                "show": kca.norm_text(row[7]).upper().startswith("O"),
            })
        if isinstance(row[9], (int, float)) and row[9]:
            graph_reg.append({
                "year": int(row[9]), "label": kca.norm_text(row[10]),
                "domestic": int(row[11] or 0), "foreign": int(row[12] or 0),
                "total": int(row[13] or 0),
                "show": kca.norm_text(row[14]).upper().startswith("O"),
            })

    return MasterData(
        path=path, period_label=period, waiver_label=waiver,
        quarters=parse_period_quarters(period),
        applications=_dict_rows(app_m), registrations=_dict_rows(reg_m),
        foreign_reviews=_dict_rows(foreign_m), waivers=_dict_rows(waiver_m),
        graph_app=graph_app, graph_reg=graph_reg,
        meeting_year=meeting_year, meeting_round=meeting_round, master_version=master_version,
    )


# ---------------------------------------------------------------------------
# 채움 계획 (FillPlan)
# ---------------------------------------------------------------------------

@dataclass
class TableFill:
    index: int                 # 문서 내 표 순번 (0-base)
    name: str
    expect_header: list[str]   # 대조용 머리행(첫 행) 텍스트
    prefix_cells: int          # 데이터 영역 앞의 셀 개수(제목/머리행/병합 포함, 읽기순서)
    ncols: int                 # 데이터 행의 셀 개수
    rows: list[list[str]]      # 데이터 행
    resize: bool = True        # 행 수 조정 허용 여부 (False = 고정 골격, 값만 기입)
    merged_run_col: Optional[int] = None   # 반복값 세로병합 열(0-base); v0.2.2 자동 분할
    merged_run_lengths: list[int] = field(default_factory=list)


@dataclass
class CellWrite:
    table_index: int
    cell_seq: int              # 표 내 읽기순서 셀 번호 (0-base)
    text: str
    name: str = ""


@dataclass
class ParaReplace:
    anchor: str                # 이 문자열을 포함하는 문단을 찾아
    text: str                  # 문단 전체를 이 텍스트로 교체 (subs가 있으면 참고용 견본)
    all_occurrences: bool = False
    name: str = ""
    exclude: str = ""          # 문단에 이 문자열이 함께 있으면 교체하지 않음
    alt_anchors: list[str] = field(default_factory=list)   # 양식 세대별 대체 anchor
    subs: list[list[str]] = field(default_factory=list)    # [[정규식, 치환문], ...] 문단 내 부분치환
    optional: bool = False     # 이 양식에 없으면 조용히 생략
    anchor_regex: str = ""     # anchor 미발견 시 문단 전체를 정규식으로 탐색


def apply_para_subs(cur: str, subs: list[list[str]]) -> str:
    """문단 텍스트에 부분치환 규칙을 순서대로 적용(들여쓰기·고정 문구 보존)."""
    out = cur
    for pat, repl in subs or []:
        out = re.sub(pat, repl, out)
    return out


def para_target_text(cur: str, pr: "ParaReplace") -> str:
    return apply_para_subs(cur, pr.subs) if pr.subs else pr.text


@dataclass
class PictureReplace:
    anchor: str                # 이 문단 다음 문단(그림 단독 문단)을 대상으로 교체
    png: str
    width_mm: float
    height_mm: float


@dataclass
class DocPlan:
    key: str                   # b1/b2/b5/b6/b7/b8
    template_pattern: str      # 템플릿 파일명 앞부분 매칭
    out_name: str
    cell_writes: list[CellWrite] = field(default_factory=list)
    tables: list[TableFill] = field(default_factory=list)
    para_replaces: list[ParaReplace] = field(default_factory=list)
    pictures: list[PictureReplace] = field(default_factory=list)
    manual_todo: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


@dataclass
class FillPlan:
    meta: dict
    docs: list[DocPlan]


def load_dept_map(path: Optional[Path]) -> dict[str, str]:
    if not path:
        return {}
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.reader(f):
            if len(row) >= 2 and kca.norm_text(row[0]) and kca.norm_text(row[0]) != "주발명자":
                out[kca.normalize_name_list(row[0])] = kca.norm_text(row[1])
    return out


class PlanBuilder:
    def __init__(self, m: MasterData, round_no: int, report_date: dt.date,
                 dept_map: dict[str, str], png_dir: Path):
        self.m = m
        self.round_no = round_no
        self.date = report_date
        self.dept_map = dept_map
        self.png_dir = png_dir

    # --- 공통 문자열 ---
    @property
    def year(self) -> int:
        return self.m.meeting_year or (self.m.quarters[-1][0] if self.m.quarters else self.date.year)

    @property
    def banner(self) -> str:
        return f"{self.year}년 제{self.round_no}차 직무발명관리위원회(서면)"

    @property
    def period_short(self) -> str:
        qs = self.m.quarters
        if len(qs) >= 2:
            return f"{short_year(qs[0][0])}년 {qs[0][1]}분기 \u223c {short_year(qs[-1][0])}년 {qs[-1][1]}분기"
        if qs:
            return f"{short_year(qs[0][0])}년 {qs[0][1]}분기"
        return self.m.period_label

    @property
    def period_range(self) -> str:
        qs = self.m.quarters
        if not qs:
            return ""
        s = dt.date(qs[0][0], (qs[0][1] - 1) * 3 + 1, 1)
        em = qs[-1][1] * 3
        e = (dt.date(qs[-1][0] + 1, 1, 1) - dt.timedelta(days=1)) if em == 12 else (
            dt.date(qs[-1][0], em + 1, 1) - dt.timedelta(days=1))
        return f"{kdate(s)}\u223c{kdate(e)}"

    @property
    def date_str(self) -> str:
        return f"{self.date.year}년 {self.date.month}월 {self.date.day}일"

    @property
    def period_plain(self) -> str:
        qs = self.m.quarters
        if len(qs) >= 2:
            return f"{qs[0][0] % 100:02d}년 {qs[0][1]}분기\u223c{qs[-1][0] % 100:02d}년 {qs[-1][1]}분기"
        if qs:
            return f"{qs[0][0] % 100:02d}년 {qs[0][1]}분기"
        return self.m.period_label

    @property
    def waiver_plain(self) -> str:
        m = re.match(r"(\d{4})년\s*(\d)분기", self.m.waiver_label or "")
        if m:
            return f"{int(m.group(1)) % 100:02d}년 {int(m.group(2))}분기"
        return self.m.waiver_label

    @staticmethod
    def _run_lengths(values: list[str]) -> list[int]:
        if not values:
            return []
        out, last, n = [], values[0], 1
        for v in values[1:]:
            if v == last:
                n += 1
            else:
                out.append(n); last, n = v, 1
        out.append(n)
        return out

    def stat_year_label(self, year: int, is_last: bool, end_month: int) -> str:
        return f"{year}년(\u223c{end_month}월)" if is_last else f"{year}년"

    # 분기 토큰(병합본 표기 호환): '26년 2분기 / '26년도 3분기 / 25년 4분기~26년 1분기
    _Q_YDO = r"['\u2018\u2019]?\s?(?<!\d)\d{2}년도\s*\d분기(?:\s*[~\u223c\uff5e]\s*['\u2018\u2019]?(?<!\d)\d{2}년도?\s*\d분기)?"
    _Q_Y = r"['\u2018\u2019]?\s?(?<!\d)\d{2}년\s*\d분기(?:\s*[~\u223c\uff5e]\s*['\u2018\u2019]?(?<!\d)\d{2}년\s*\d분기)?"
    _RANGE = r"['\u2018\u2019]?\d{2}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*[~\u223c\uff5e]\s*['\u2018\u2019]?\d{2}\.\s*\d{1,2}\.\s*\d{1,2}\.?"

    def q_subs(self, y_label: str, ydo_label: str = "") -> list[list[str]]:
        """분기 토큰 부분치환 규칙 — '년도' 표기 문단은 '년도'형으로 유지한다."""
        out = []
        if ydo_label:
            out.append([self._Q_YDO, ydo_label])
        else:
            out.append([self._Q_YDO, y_label.replace("년 ", "년도 ", 1)])
        out.append([self._Q_Y, y_label])
        return out

    def range_subs(self) -> list[list[str]]:
        return [[self._RANGE, self.period_range]]

    @property
    def date_dot(self) -> str:
        return f"{self.date.year}.{self.date.month}.{self.date.day}."

    def _cover(self, doc: DocPlan, kind_label: str, ho: int, title: str, inner_title: str = ""):
        doc.cell_writes += [
            CellWrite(0, 0, self.banner, "상단 배너"),
            CellWrite(1, 0, title, "표지 제목"),
            CellWrite(2, 1, f"제 {ho} 호", f"{kind_label} 번호"),
            CellWrite(2, 3, self.date_dot, f"{kind_label}일자"),
            CellWrite(3, 1, inner_title or title, "속표지 제목"),
        ]

    # --- 붙임1: 출원 보고 ---
    def build_b1(self) -> DocPlan:
        m = self.m
        dom = [r for r in m.applications if kca.norm_text(r.get("국내외")) == "국내"]
        fon = [r for r in m.applications if kca.norm_text(r.get("국내외")) != "국내"]
        # 병합본 정렬: 출원일 오름차순, 국외는 PCT를 맨 뒤로
        appd = lambda r: fmt_date(r.get("출원일자"))
        dom = sorted(dom, key=appd)
        fon = sorted(fon, key=lambda r: (display_country(r.get("국가")) == "PCT", appd(r)))
        title = f"{self.period_short} 특허 국내·외 출원 현황 보고"
        doc = DocPlan("b1", "붙임1", f"붙임1_보고안건1_{self.year}년_제{self.round_no}차_특허_출원_현황_보고.hwp")
        self._cover(doc, "보고안건", 1, title)
        doc.tables.append(TableFill(
            4, "국내 출원 세부", ["No", "출원일자", "출원번호", "발명의 명칭", "출원인", "발명자"], 6, 6,
            [[str(i), fmt_date(r.get("출원일자")), kca.norm_text(r.get("출원번호")),
              kca.norm_text(r.get("발명명칭")), kca.norm_text(r.get("권리자")),
              kca.normalize_name_list(r.get("발명자"))] for i, r in enumerate(dom, 1)]))
        b1_for_rows = [[str(i), fmt_date(r.get("출원일자")), display_country(r.get("국가")),
                        kca.norm_text(r.get("출원번호")), kca.norm_text(r.get("발명명칭")),
                        kca.norm_text(r.get("권리자")), kca.normalize_name_list(r.get("발명자"))]
                       for i, r in enumerate(fon, 1)]
        doc.tables.append(TableFill(
            5, "국외 출원 세부", ["No", "출원일자", "국가", "출원번호", "발명의 명칭", "출원인", "발명자"], 7, 7,
            b1_for_rows, merged_run_col=2, merged_run_lengths=self._run_lengths([r[2] for r in b1_for_rows])))
        end_m = (m.quarters[-1][1] * 3) if m.quarters else 12
        stat = [g for g in m.graph_app if g.get("show", True)] or m.graph_app
        last_y = max((g["year"] for g in stat), default=self.year)
        doc.tables.append(TableFill(
            6, "출원 통계", ["(단위:건)"], 7, 5,
            [[self.stat_year_label(g["year"], g["year"] == last_y, end_m),
              str(g["domestic"]), str(g["pct"]), str(g["foreign_general"]), str(g["total"])]
             for g in stat]))
        n_all, n_dom, n_fon = len(dom) + len(fon), len(dom), len(fon)
        doc.para_replaces += [
            ParaReplace("특허 국내·외 출원 현황 보고", title, all_occurrences=True, name="본문 제목",
                        subs=self.q_subs(self.period_short)),
            ParaReplace("대상 기간", f"ㅇ 대상 기간: {self.period_range}", all_occurrences=True,
                        name="개요 기간", optional=True, subs=self.range_subs()),
            ParaReplace("ㅇ 출원", f"ㅇ 출원 특허: 총 {n_all}건(국내 {n_dom}건, 국외 {n_fon}건)",
                        name="개요 건수", alt_anchors=["ㅇ 출원 완료"],
                        subs=[[r"총\s*\d+\s*건\s*\(\s*국내\s*\d+\s*건,?\s*국외\s*\d+\s*건\s*\)",
                               f"총 {n_all}건(국내 {n_dom}건, 국외 {n_fon}건)"]]),
            ParaReplace("□ 국내 출원 세부 현황", f"□ 국내 출원 세부 현황 ({n_dom}건)", name="국내 소제목",
                        subs=[[r"\(\d+건\)", f"({n_dom}건)"]]),
            ParaReplace("□ 국외 출원 세부 현황", f"□ 국외 출원 세부 현황 ({n_fon}건)", name="국외 소제목",
                        subs=[[r"\(\d+건\)", f"({n_fon}건)"]]),
        ]
        png = self.png_dir / "application_trend_hwpx.png"
        if png.exists():
            w, h = png_size_mm(png, HWPX_PNG_WIDTH_MM)
            doc.pictures.append(PictureReplace("(참고) 국내·외 특허 출원 현황", str(png), w, h))
        else:
            doc.manual_todo.append(f"그래프 PNG 미발견: {png} — 그림 수동 교체 필요")
        return doc

    # --- 붙임2: 등록 보고 ---
    def build_b2(self) -> DocPlan:
        m = self.m
        dom = [r for r in m.registrations if kca.norm_text(r.get("국내외")) == "국내"]
        fon = [r for r in m.registrations if kca.norm_text(r.get("국내외")) != "국내"]
        regd = lambda r: fmt_date(r.get("등록일자"))
        dom = sorted(dom, key=regd)
        fon = sorted(fon, key=lambda r: (display_country(r.get("국가")) == "PCT", regd(r)))
        title = f"{self.period_short} 특허 국내·외 등록 현황 보고"
        doc = DocPlan("b2", "붙임2", f"붙임2_보고안건2_{self.year}년_제{self.round_no}차_특허_등록_현황_보고.hwp")
        self._cover(doc, "보고안건", 2, title)
        doc.tables.append(TableFill(
            4, "국내 등록 세부", ["No", "등록일자", "등록번호", "발명의 명칭", "출원인", "발명자"], 6, 6,
            [[str(i), fmt_date(r.get("등록일자")), kca.norm_text(r.get("등록번호")),
              kca.norm_text(r.get("발명명칭")), kca.norm_text(r.get("권리자")),
              kca.normalize_name_list(r.get("발명자"))] for i, r in enumerate(dom, 1)]))
        b2_for_rows = [[str(i), fmt_date(r.get("등록일자")), display_country(r.get("국가")),
                        kca.norm_text(r.get("등록번호")), kca.norm_text(r.get("발명명칭")),
                        kca.norm_text(r.get("권리자")), kca.normalize_name_list(r.get("발명자"))]
                       for i, r in enumerate(fon, 1)]
        doc.tables.append(TableFill(
            5, "국외 등록 세부", ["No", "등록일자", "대상 국가", "등록번호", "발명의 명칭", "출원인", "발명자"], 7, 7,
            b2_for_rows, merged_run_col=2, merged_run_lengths=self._run_lengths([r[2] for r in b2_for_rows])))
        end_m = (m.quarters[-1][1] * 3) if m.quarters else 12
        stat = [g for g in m.graph_reg if g.get("show", True)] or m.graph_reg
        last_y = max((g["year"] for g in stat), default=self.year)
        doc.tables.append(TableFill(
            6, "등록 통계", ["(단위: 건)"], 5, 4,
            [[self.stat_year_label(g["year"], g["year"] == last_y, end_m),
              str(g["domestic"]), str(g["foreign"]), str(g["total"])] for g in stat]))
        n_all, n_dom, n_fon = len(dom) + len(fon), len(dom), len(fon)
        doc.para_replaces += [
            ParaReplace("특허 국내·외 등록 현황 보고", title, all_occurrences=True, name="본문 제목",
                        subs=self.q_subs(self.period_short)),
            ParaReplace("대상 기간", f"□ 특허 국내·외 등록 현황 (대상 기간: {self.period_range})",
                        all_occurrences=True, name="개요 기간", optional=True, subs=self.range_subs()),
            ParaReplace("ㅇ 등록", f"ㅇ 등록 특허: 총 {n_all}건(국내 {n_dom}건, 국외 {n_fon}건)",
                        name="개요 건수", alt_anchors=["ㅇ 등록 완료"], optional=True,
                        subs=[[r"총\s*\d+\s*건\s*\(\s*국내\s*\d+\s*건,?\s*국외\s*\d+\s*건\s*\)",
                               f"총 {n_all}건 (국내 {n_dom}건, 국외 {n_fon}건)"]]),
            ParaReplace("□ 국내 등록 세부 현황", f"□ 국내 등록 세부 현황 ({n_dom}건)", name="국내 소제목",
                        subs=[[r"\(\d+건\)", f"({n_dom}건)"]]),
            ParaReplace("□ 국외 등록 세부 현황", f"□ 국외 등록 세부 현황 ({n_fon}건)", name="국외 소제목",
                        subs=[[r"\(\d+건\)", f"({n_fon}건)"]]),
        ]
        doc.notes.append("세부 표는 등록일 오름차순으로 정렬합니다"
                         " (병합본 붙임2 국외 표만 내림차순이었으나 다른 표와 동일 기준으로 통일)")
        png = self.png_dir / "registration_trend_hwpx.png"
        if png.exists():
            w, h = png_size_mm(png, HWPX_PNG_WIDTH_MM)
            doc.pictures.append(PictureReplace("(참고) 국내·외 특허 등록 현황", str(png), w, h))
        else:
            doc.manual_todo.append(f"그래프 PNG 미발견: {png} — 그림 수동 교체 필요")
        return doc

    # --- 붙임5: 국외특허 출원 심의 최종승인 ---
    def build_b5(self) -> DocPlan:
        m = self.m

        def req_date(r: dict) -> str:
            for k in ("지재권신청일", "신청일", "신청일자", "출원일자"):
                v = r.get(k)
                if v not in (None, ""):
                    return fmt_date(v)
            return ""

        rows = sorted(m.foreign_reviews, key=lambda r: (country_sort_key(r.get("국가")), req_date(r)))
        title = f"{self.period_short} 국외특허 출원 심의 최종승인(안)"
        doc = DocPlan("b5", "붙임5", f"붙임5_심의안건1_{self.year}년_제{self.round_no}차_국외특허_출원_심의_최종승인안.hwp")
        self._cover(doc, "심의안건", 1, title)

        def country_of(r: dict) -> str:
            if kca.norm_text(r.get("국내외")) == "PCT" or kca.canonical_country(r.get("국가")) == "PCT":
                return "PCT"
            return display_country(r.get("국가"))

        def dept_of(r: dict) -> str:
            # MASTER에 본부(소) 정보가 없다. --dept-map을 준 경우에만 채우고,
            # 없으면 빈 칸으로 두어 위원회에서 직접 적도록 한다.
            return self.dept_map.get(kca.normalize_name_list(r.get("주발명자")), "")

        pct_n = sum(1 for r in rows if country_of(r) == "PCT")
        gen_n = len(rows) - pct_n

        # 본부별 집계표 (표4): 국가 행 x 본부 열(+합계). 행 수는 국가 종류에 맞춰 조정.
        depts = list(kca.DIVISIONS)
        countries = []
        for r in rows:
            c = country_of(r)
            if c not in countries:
                countries.append(c)
        order = {c: i for i, c in enumerate(countries)}
        countries.sort(key=lambda c: (c != "PCT", order[c]))
        agg_rows = []
        col_tot = {d: 0 for d in depts}
        for c in countries:
            sub = [r for r in rows if country_of(r) == c]
            cnt = {d: 0 for d in depts}
            unknown = 0
            for r in sub:
                d = dept_of(r)
                if d in cnt:
                    cnt[d] += 1
                    col_tot[d] += 1
                else:
                    unknown += 1
            cells = [c] + [str(cnt[d]) if cnt[d] else "-" for d in depts] + [str(len(sub))]
            agg_rows.append(cells)
            if unknown:
                doc.notes.append(f"본부별 집계표: '{c}' {unknown}건은 합계에만 반영(본부 열은 빈 칸)")
        agg_rows.append(["합계"] + [str(col_tot[d]) if col_tot[d] else "-" for d in depts] + [str(len(rows))])
        doc.tables.append(TableFill(
            4, "본부별 집계", ["구 분", "물리", "화학", "바이오", "양자", "전략", "직속", "합계"],
            8, 8, agg_rows))

        b5_list_rows = [[str(i), country_of(r), kca.norm_text(r.get("출원번호")) or "(출원전)",
                         kca.norm_text(r.get("발명명칭")), dept_of(r), kca.normalize_name_list(r.get("주발명자"))]
                        for i, r in enumerate(rows, 1)]
        doc.tables.append(TableFill(
            5, "심의 목록", ["No", "국가", "출원번호", "발명의 명칭", "본부(소)", "주발명자"], 6, 6,
            b5_list_rows, merged_run_col=1, merged_run_lengths=self._run_lengths([r[1] for r in b5_list_rows])))

        doc.para_replaces += [
            ParaReplace("국외특허 출원 심의 최종승인(안)", title, all_occurrences=True, name="본문 제목",
                        exclude="원안", subs=self.q_subs(self.period_short)),
            ParaReplace("ㅇ 심의기간", f"ㅇ 심의기간: {self.period_range}", name="개요 심의기간",
                        subs=self.range_subs()),
            ParaReplace("ㅇ 대상특허",
                        f"ㅇ 대상특허: 총 {len(rows)}건 (PCT {pct_n}건, 개별국가 {gen_n}건)", name="개요 대상특허",
                        subs=[[r"총\s*\d+건\s*\(PCT\s*\d+건,\s*개별국가\s*\d+건\)",
                               f"총 {len(rows)}건 (PCT {pct_n}건, 개별국가 {gen_n}건)"]]),
            ParaReplace("ㅇ 심의결과(안)",
                        f"ㅇ 심의결과(안): 국외 특허 출원 {len(rows)}건에 대한 심의 승인", name="개요 심의결과",
                        subs=[[r"출원\s*\d+건", f"출원 {len(rows)}건"]]),
            ParaReplace("세부 심의 목록", f"ㅇ 국외 특허 세부 심의 목록: {len(rows)}건 본부/연구소/직속연구단(팀) 심의 가결",
                        name="목록 건수줄", optional=True,
                        subs=[[r"목록:\s*\d+건", f"목록: {len(rows)}건"]]),
        ]
        missing_dept = sorted({kca.norm_text(r.get("주발명자")) for r in rows if not dept_of(r)})
        if missing_dept:
            doc.notes.append(
                f"본부(소): MASTER에 없는 항목이라 {len(missing_dept)}건을 빈 칸으로 둡니다"
                " (채우려면 --dept-map CSV 지정)")
        else:
            doc.notes.append("본부(소): 매핑 완료")
        doc.notes.append("별첨 개별 평가표는 템플릿 기존 내용을 보존하며, preflight에서 심의목록과 제목/주발명자 연계를 확인")
        return doc

    # --- 붙임6: 특허 포기 승인 ---
    def build_b6(self) -> DocPlan:
        m = self.m
        rows = m.waivers
        regd = lambda r: fmt_date(r.get("등록일자"))
        dom = sorted([r for r in rows if is_domestic_country(r.get("국가"))], key=regd)
        fon = sorted([r for r in rows if not is_domestic_country(r.get("국가"))], key=regd)
        wq = re.match(r"(\d{4})년\s*(\d)분기", m.waiver_label or "")
        wy, wqn = (int(wq.group(1)), int(wq.group(2))) if wq else (self.year, 0)
        prev_q = wqn - 1 if wqn > 1 else 4
        prev_y = wy if wqn > 1 else wy - 1
        wl_y = f"{short_year(wy)}년 {wqn}분기"            # '26년 3분기 (표지)
        wl = f"{short_year(wy)}년도 {wqn}분기"            # '26년도 3분기 (본문)
        survey = f"「{wl} 특허 연차유지여부 검토」"
        cover_title = f"{wl_y} 특허 포기 승인(안)"
        title = f"{wl} 특허 포기 승인(안)"
        doc = DocPlan("b6", "붙임6", f"붙임6_심의안건2_{self.year}년_제{self.round_no}차_특허_포기_승인안.hwp")
        self._cover(doc, "심의안건", 2, cover_title, inner_title=title)

        doc.tables.append(TableFill(
            4, "포기 절차 현황", ["포기 절차", "국내", "국외", "합계"], 4, 4,
            [["단독특허", str(len(dom)), str(len(fon)), str(len(rows))],
             ["공동권리자에 권리 이관", "-", "-", "-"],
             ["합계", str(len(dom)), str(len(fon)), str(len(rows))]],
            resize=False))
        doc.tables.append(TableFill(
            5, "국내 포기", ["No", "등록일자", "등록번호", "발명의 명칭", "발명자"], 5, 5,
            [[str(i), fmt_date(r.get("등록일자")), kca.norm_text(r.get("등록번호")),
              kca.norm_text(r.get("발명명칭")), kca.normalize_name_list(r.get("발명자"))]
             for i, r in enumerate(dom, 1)]))
        b6_for_rows = [[str(i), display_country(r.get("국가")), fmt_date(r.get("등록일자")),
                        kca.norm_text(r.get("등록번호")), kca.norm_text(r.get("발명명칭")),
                        kca.normalize_name_list(r.get("발명자"))] for i, r in enumerate(fon, 1)]
        doc.tables.append(TableFill(
            6, "국외 포기", ["No", "국가", "등록일자", "등록번호", "발명의 명칭", "발명자"], 6, 6,
            b6_for_rows, merged_run_col=1, merged_run_lengths=self._run_lengths([r[1] for r in b6_for_rows])))

        n = len(rows)
        prev_sub = [r"\d{4}년\s*\d분기에 추진", f"{prev_y}년 {prev_q}분기에 추진"]
        qsub = self.q_subs(wl_y, wl)
        doc.para_replaces += [
            ParaReplace("특허 포기 승인(안)", title, all_occurrences=True, name="본문 제목",
                        exclude="」", subs=qsub),
            ParaReplace("원안과 같이 의결함",
                        f"◦「{title}」을 원안과 같이 의결함", name="주문", subs=qsub),
            ParaReplace("보유 가치가 없는 것으로 판단된",
                        f"◦ {prev_y}년 {prev_q}분기에 추진한{survey} 조사 결과에 따라 보유 가치가 없는 것으로 "
                        f"판단된 특허 {n}건을 포기 승인 후 그에 따라 처리하고자 함", name="제안사유",
                        subs=[prev_sub] + qsub + [[r"특허\s*\d+\s*건", f"특허 {n}건"]]),
            ParaReplace("포기 대상 특허로 선별",
                        f"◦ {prev_y}년 {prev_q}분기에 추진한{survey} 조사를 통해 {n}건의 특허를 포기 대상 "
                        f"특허로 선별", name="제안내용 1",
                        subs=[prev_sub] + qsub + [[r"\d+\s*건의 특허", f"{n}건의 특허"]]),
            ParaReplace("대상 특허: 총", f"□ 대상 특허: 총 {n}건 (국내 {len(dom)}, 국외 {len(fon)})",
                        name="개요 대상", alt_anchors=["ㅇ 대상 : 총"],
                        subs=[[r"총\s*\d+\s*건\s*\(국내\s*\d+,\s*국외\s*\d+\)",
                               f"총 {n}건 (국내 {len(dom)}, 국외 {len(fon)})"]]),
            ParaReplace("조사 결과 포기 대상으로 분류된",
                        f"ㅇ {prev_y}년 {prev_q}분기에 추진된{survey} 조사 결과 포기 대상으로 분류된 특허 {n}건",
                        name="개요 각주",
                        subs=[prev_sub] + qsub + [[r"분류된 특허\s*\d+\s*건", f"분류된 특허 {n}건"]]),
            ParaReplace("포기 대상 특허의 포기 절차 현황",
                        f"< {wl} 포기 대상 특허의 포기 절차 현황 >", name="절차표 제목", subs=qsub),
            ParaReplace("- 국내 특허(", f"    - 국내 특허({len(dom)}건)", name="국내 소제목",
                        subs=[[r"\(\d+건\)", f"({len(dom)}건)"]]),
            ParaReplace("- 국외 특허(", f"    - 국외 특허({len(fon)}건)", name="국외 소제목",
                        subs=[[r"\(\d+건\)", f"({len(fon)}건)"]]),
        ]
        doc.notes.append("세부 표는 등록일 오름차순으로 정렬합니다 (병합본 기준)")
        return doc

    # --- 붙임7: 위원회 개최(안) ---
    def build_b7(self) -> DocPlan:
        title = f"{self.year}년도 제{self.round_no}차 직무발명관리위원회 개최(안)"
        p_lab = f"{short_year(self.m.quarters[0][0])}년 {self.m.quarters[0][1]}분기" if self.m.quarters else self.period_short
        if len(self.m.quarters) >= 2:
            p_lab = (f"{short_year(self.m.quarters[0][0])}년 {self.m.quarters[0][1]}분기"
                     f"\u223c{short_year(self.m.quarters[-1][0])}년 {self.m.quarters[-1][1]}분기")
        wq = re.match(r"(\d{4})년\s*(\d)분기", self.m.waiver_label or "")
        w_lab = f"{short_year(int(wq.group(1)))}년 {int(wq.group(2))}분기" if wq else self.waiver_plain
        doc = DocPlan("b7", "붙임7", f"붙임7_{self.year}년_제{self.round_no}차_직무발명관리위원회_개최안.hwp")
        doc.para_replaces += [
            ParaReplace("직무발명관리위원회 개최", title, all_occurrences=True, name="문서 제목",
                        alt_anchors=["직무발명관리위원회 개최 운영(안)"]),
            ParaReplace("기술사업화그룹)", f"('{self.year % 100:02d}. {self.date.month}. 기술사업화그룹)",
                        name="작성월",
                        subs=[[r"['\u2018\u2019]\d{2}\.\s*\d{1,2}\.",
                               f"'{self.year % 100:02d}. {self.date.month}."]]),
            ParaReplace("특허 국내·외 출원 현황 보고(안)", f"{p_lab} 특허 국내·외 출원 현황 보고(안)",
                        all_occurrences=True, name="보고안건1", alt_anchors=["(보고안건1)"],
                        subs=self.q_subs(p_lab)),
            ParaReplace("특허 국내·외 등록 현황 보고(안)", f"{p_lab} 특허 국내·외 등록 현황 보고(안)",
                        all_occurrences=True, name="보고안건2", alt_anchors=["(보고안건2)"],
                        subs=self.q_subs(p_lab)),
            ParaReplace("국외특허 출원 심의 최종승인(안)", f"{p_lab} 국외특허 출원 심의 최종승인(안)",
                        all_occurrences=True, name="심의안건1", alt_anchors=["(심의안건1)"],
                        subs=self.q_subs(p_lab)),
            ParaReplace("특허 포기 승인(안)", f"{w_lab} 특허 포기 승인(안)",
                        all_occurrences=True, name="심의안건2", alt_anchors=["(심의안건2)"],
                        subs=self.q_subs(w_lab)),
        ]
        doc.notes.append("위원 명단·활용예산은 템플릿 값을 유지합니다. 인사/예산 변경 시 최종 확인 필요")
        return doc

    # --- 붙임8: 서면결의서 ---
    def build_b8(self) -> DocPlan:
        title = f"{self.year}년 제{self.round_no}차 직무발명관리위원회 서면결의서"
        p_lab = f"{short_year(self.m.quarters[0][0])}년 {self.m.quarters[0][1]}분기" if self.m.quarters else self.period_short
        if len(self.m.quarters) >= 2:
            p_lab = (f"{short_year(self.m.quarters[0][0])}년 {self.m.quarters[0][1]}분기"
                     f"\u223c{short_year(self.m.quarters[-1][0])}년 {self.m.quarters[-1][1]}분기")
        wq = re.match(r"(\d{4})년\s*(\d)분기", self.m.waiver_label or "")
        w_lab = f"{short_year(int(wq.group(1)))}년 {int(wq.group(2))}분기" if wq else self.waiver_plain
        doc = DocPlan("b8", "붙임8", f"붙임8_{self.year}년_제{self.round_no}차_직무발명관리위원회_서면결의서.hwp")
        doc.para_replaces += [
            ParaReplace("직무발명관리위원회 서면결의서", title, all_occurrences=True, name="문서 제목"),
            ParaReplace("기술사업화그룹>", f"<{self.year}. {self.date.month}. 기술사업화그룹>", name="작성월",
                        subs=[[r"20\d{2}\.\s*\d{1,2}\.", f"{self.year}. {self.date.month}."]]),
            ParaReplace("특허 국내·외 출원 현황 보고(안)", f"{p_lab} 특허 국내·외 출원 현황 보고(안)",
                        all_occurrences=True, name="보고안건1", subs=self.q_subs(p_lab)),
            ParaReplace("특허 국내·외 등록 현황 보고(안)", f"{p_lab} 특허 국내·외 등록 현황 보고(안)",
                        all_occurrences=True, name="보고안건2", subs=self.q_subs(p_lab)),
            ParaReplace("국외특허 출원 심의 최종승인(안)", f"{p_lab} 국외특허 출원 심의 최종승인(안)",
                        all_occurrences=True, name="심의안건1", subs=self.q_subs(p_lab)),
            ParaReplace("특허 포기 승인(안)", f"{w_lab} 특허 포기 승인(안)",
                        all_occurrences=True, name="심의안건2", subs=self.q_subs(w_lab)),
            ParaReplace(f"{self.year}. 00. 00.", f"{self.date.year}. {self.date.month}. {self.date.day}.",
                        name="결의일",
                        anchor_regex=r"^\s*20\d{2}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*$"),
        ]
        doc.notes.append("위원별 접수/승인 표시·의견·서명란은 빈 양식으로 유지")
        return doc

    def build(self, docs: list[str]) -> FillPlan:
        builders = {"b1": self.build_b1, "b2": self.build_b2, "b5": self.build_b5, "b6": self.build_b6,
                    "b7": self.build_b7, "b8": self.build_b8}
        plan_docs = [builders[k]() for k in docs if k in builders]
        return FillPlan(
            meta={
                "version": VERSION, "master": str(self.m.path),
                "period_label": self.m.period_label, "waiver_label": self.m.waiver_label,
                "round_no": self.round_no, "year": self.year,
                "report_date": self.date.isoformat(),
                "counts": {
                    "applications": len(self.m.applications),
                    "registrations": len(self.m.registrations),
                    "foreign_reviews": len(self.m.foreign_reviews),
                    "waivers": len(self.m.waivers),
                },
            },
            docs=plan_docs,
        )


# ---------------------------------------------------------------------------
# dry-run 출력
# ---------------------------------------------------------------------------

def plan_to_json(plan: FillPlan) -> dict:
    def d(o):
        if hasattr(o, "__dataclass_fields__"):
            return {k: d(getattr(o, k)) for k in o.__dataclass_fields__}
        if isinstance(o, list):
            return [d(x) for x in o]
        return o
    return {"meta": plan.meta, "docs": [d(x) for x in plan.docs]}


def write_dry_run(plan: FillPlan, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "fill_plan.json").write_text(
        json.dumps(plan_to_json(plan), ensure_ascii=False, indent=2), encoding="utf-8")
    for doc in plan.docs:
        lines = [f"### {doc.key} → {doc.out_name}", ""]
        for c in doc.cell_writes:
            lines.append(f"[셀] 표{c.table_index} #{c.cell_seq} ({c.name}) = {c.text}")
        for p in doc.para_replaces:
            ex = f" (제외:『{p.exclude}』)" if p.exclude else ""
            alt = f" (대체:{'/'.join('『%s』' % a for a in p.alt_anchors)})" if p.alt_anchors else ""
            opt = " (선택)" if p.optional else ""
            mode = " [부분치환]" if p.subs else ""
            lines.append(f"[문단] anchor『{p.anchor}』{alt}{ex}{opt}{mode} → {p.text}")
        for t in doc.tables:
            lines.append(f"[표{t.index}] {t.name} — {len(t.rows)}행 x {t.ncols}열"
                         f"{' (골격 고정)' if not t.resize else ''}")
            for r in t.rows:
                lines.append("    | " + " | ".join(r))
        for pic in doc.pictures:
            lines.append(f"[그림] 『{pic.anchor}』 다음 문단 → {pic.png} ({pic.width_mm:.0f}x{pic.height_mm:.0f}mm)")
        for note in doc.notes:
            lines.append(f"[참고] {note}")
        for td in doc.manual_todo:
            lines.append(f"[수동] {td}")
        (out_dir / f"preview_{doc.key}.txt").write_text("\n".join(lines), encoding="utf-8")
    print(f"[dry-run] fill_plan.json + preview_*.txt → {out_dir}")


# ---------------------------------------------------------------------------
# Windows 한/글 COM 적용부
# [실측 상태] Windows + 한/글 환경 실측 전. 실패 항목은 리포트에 기록되며
# 완료로 보고하지 않는다.
# ---------------------------------------------------------------------------

def infer_existing_merged_rows(cell_texts: list[str], prefix_cells: int, ncols: int, merged_col: int) -> tuple[int, list[tuple[int, int]], str]:
    """Infer existing logical rows and vertical-merge runs from a template table.

    Data rows are identified by the sequential No column (1,2,...). A vertically
    merged target cell is present only on the first row of its run, so continuation
    rows contain ncols-1 physical cells. Returns (row_count, [(cell_seq, run_len)], error).
    cell_seq values refer to the original, not-yet-split table.
    """
    if prefix_cells < 0 or ncols < 2 or not (0 <= merged_col < ncols):
        return 0, [], "병합 메타데이터가 잘못되었습니다."
    if len(cell_texts) < prefix_cells:
        return 0, [], "표 셀 수가 prefix보다 작습니다."
    data = cell_texts[prefix_cells:]
    if not data:
        return 0, [], ""

    segments: list[list[str]] = []
    cur: list[str] = []
    next_no = 1
    for cell in data:
        v = norm_ws(cell)
        if v == str(next_no):
            if cur:
                segments.append(cur)
            cur = [cell]
            next_no += 1
        elif cur:
            cur.append(cell)
        elif v:
            return 0, [], f"첫 데이터 셀에서 No.1을 찾지 못했습니다: {cell!r}"
    if cur:
        segments.append(cur)
    if not segments:
        return 0, [], "데이터 행 번호(1,2,...)를 찾지 못했습니다."

    allowed = {ncols, ncols - 1}
    bad = [(i + 1, len(seg)) for i, seg in enumerate(segments) if len(seg) not in allowed]
    if bad:
        return 0, [], "행별 물리 셀 수가 예상과 다릅니다: " + ", ".join(f"{r}행={n}" for r, n in bad[:8])
    if len(segments[0]) != ncols:
        return 0, [], "첫 데이터 행의 병합 시작 셀을 찾지 못했습니다."

    runs: list[tuple[int, int]] = []
    offsets: list[int] = []
    acc = prefix_cells
    for seg in segments:
        offsets.append(acc)
        acc += len(seg)
    i = 0
    while i < len(segments):
        if len(segments[i]) != ncols:
            return 0, [], f"{i+1}행이 이전 병합의 연속행인데 시작행이 없습니다."
        j = i + 1
        while j < len(segments) and len(segments[j]) == ncols - 1:
            j += 1
        run_len = j - i
        runs.append((offsets[i] + merged_col, run_len))
        i = j
    return len(segments), runs, ""


class HwpApplier:
    def __init__(self, log):
        self.cell_read_mode: Optional[str] = None
        self._row_action_hint: dict[bool, str] = {}
        self.log = log
        self.hwp = None
        self.backend = ""

    # --- 연결 (pyhwpx → EnsureDispatch → dynamic) ---
    def connect(self):
        """Connect using the supplied field-proven backend order.

        pyhwpx is preferred because it handles Hancom automation/security setup
        well.  win32com early binding is the second choice because nested
        HParameterSet assignments used by table formatting are more stable
        there.  Dynamic dispatch is the final compatibility fallback.
        """
        errs: list[str] = []
        self._pyhwpx_wrapper = None

        try:
            from pyhwpx import Hwp  # type: ignore
            try:
                wrapper = Hwp(new=True, visible=True)
            except TypeError:
                # Older pyhwpx releases do not expose the constructor options.
                wrapper = Hwp()
            self._pyhwpx_wrapper = wrapper
            self.hwp = getattr(wrapper, "hwp", wrapper)
            self.hwp = _prepare_hwp_object(self.hwp)
            self.backend = "pyhwpx"
            return
        except ImportError as e:
            errs.append(f"pyhwpx import: {e}")
        except Exception as e:
            errs.append(f"pyhwpx connect: {e}")

        _ensure_security_module_registry()
        try:
            from win32com.client import gencache  # type: ignore
            try:
                self.hwp = gencache.EnsureDispatch("HWPFrame.HwpObject")
                self.backend = "win32com(early)"
            except AttributeError as e:
                # win32com gen_py cache corruption is common after Office/HWP
                # updates. Remove only the generated cache and retry once.
                errs.append(f"EnsureDispatch cache: {e}")
                shutil.rmtree(Path(tempfile.gettempdir()) / "gen_py", ignore_errors=True)
                self.hwp = gencache.EnsureDispatch("HWPFrame.HwpObject")
                self.backend = "win32com(early-rebuilt)"
            except Exception as e:
                errs.append(f"EnsureDispatch: {e}")
                self.hwp = None
        except Exception as e:
            errs.append(f"win32com early import/connect: {e}")
            self.hwp = None

        if self.hwp is None:
            try:
                from win32com.client import dynamic  # type: ignore
                self.hwp = dynamic.Dispatch("HWPFrame.HwpObject")
                self.backend = "win32com(dynamic)"
            except Exception as e:
                errs.append(f"dynamic.Dispatch: {e}")
                self.hwp = None

        if self.hwp is None:
            raise SystemExit("한/글 연결 실패:\n  " + "\n  ".join(errs))

        try:
            self.hwp.RegisterModule("FilePathCheckDLL", SECURITY_MODULE_NAME)
        except Exception:
            pass
        self.hwp = _prepare_hwp_object(self.hwp)

    # --- 저수준 헬퍼 ---
    def run(self, act: str) -> bool:
        try:
            return bool(self.hwp.HAction.Run(act))
        except Exception:
            return False

    def run_action(self, action_id: str, **items) -> bool:
        """CreateAction → CreateSet → GetDefault → SetItem → Execute."""
        try:
            act = self.hwp.CreateAction(action_id)
            pset = act.CreateSet()
            act.GetDefault(pset)
            for key, value in items.items():
                pset.SetItem(key, value)
            return bool(act.Execute(pset))
        except Exception:
            return False

    def insert_text(self, text: str):
        if not self.run_action("InsertText", Text=text):
            raise RuntimeError("InsertText action failed")

    def selected_text(self) -> str:
        try:
            return self.hwp.GetTextFile("TEXT", "saveblock:true") or ""
        except Exception:
            return ""

    def cur_pos(self) -> Optional[tuple[int, int, int]]:
        """현재 캐럿의 (리스트, 문단, 위치)."""
        try:
            v = self.hwp.GetPos()
            return (int(v[0]), int(v[1]), int(v[2]))
        except Exception:
            return None

    def body_ctrls(self) -> list:
        """본문에 삽입된 개체(표/그림 등) 컨트롤 목록."""
        out, ctrl = [], self.hwp.HeadCtrl
        while ctrl:
            try:
                cid = str(ctrl.CtrlID)
            except Exception:
                cid = ""
            if cid in BODY_CTRL_IDS:
                out.append((cid, ctrl))
            ctrl = ctrl.Next
        return out

    def ctrl_anchors_in_para(self, pos: Optional[tuple[int, int, int]]) -> list[tuple[int, str, Any]]:
        """지정 문단에 앵커를 둔 개체 목록 [(문단 내 위치, CtrlID, ctrl)]."""
        if not pos:
            return []
        found = []
        for cid, ctrl in self.body_ctrls():
            try:
                st = ctrl.GetAnchorPos(0)
                lst, para, cpos = int(st.Item("List")), int(st.Item("Para")), int(st.Item("Pos"))
            except Exception:
                continue
            if lst == pos[0] and para == pos[1]:
                found.append((cpos, cid, ctrl))
        found.sort()
        return found

    def table_ctrls(self) -> list:
        out, ctrl = [], self.hwp.HeadCtrl
        while ctrl:
            if ctrl.CtrlID == "tbl":
                out.append(ctrl)
            ctrl = ctrl.Next
        return out

    def enter_table(self, ctrl) -> bool:
        try:
            self.hwp.SetPosBySet(ctrl.GetAnchorPos(0))
        except Exception:
            return False
        self.hwp.FindCtrl()
        if not self.run("ShapeObjTableSelCell"):
            return False
        self.run("Cancel")
        return True

    def goto_table_a1(self) -> bool:
        """Move from any cell in the current table to A1 using HWP table actions."""
        for _ in range(100):
            if not self.run("TableUpperCell"):
                break
        for _ in range(100):
            if not self.run("TableLeftCell"):
                break
        return True

    def select_whole_table(self) -> bool:
        """Select the whole table using the same cell-block sequence as the reference tool."""
        self.goto_table_a1()
        if not self.run("TableCellBlock"):
            return False
        if not self.run("TableCellBlockExtend"):
            self.run("Cancel")
            return False
        if not self.run("TableColPageDown"):
            self.run("Cancel")
            return False
        if not self.run("TableColEnd"):
            self.run("Cancel")
            return False
        return True

    def select_current_row(self) -> bool:
        """Select the complete logical row that contains the current cell."""
        if not self.run("TableCellBlock"):
            return False
        if not self.run("TableCellBlockRow"):
            self.run("Cancel")
            return False
        return True

    def _set_selected_char_bold(self) -> bool:
        """Set bold on the current selection without changing face/size."""
        try:
            pset = self.hwp.HParameterSet.HCharShape
            self.hwp.HAction.GetDefault("CharShape", pset.HSet)
            pset.Bold = 1
            return bool(self.hwp.HAction.Execute("CharShape", pset.HSet))
        except Exception:
            return False

    def _set_selected_border(self, *, top: int, bottom: int, left: int, right: int,
                             horz: Optional[int] = None, vert: Optional[int] = None,
                             width: int = HWP_LINE_WIDTH_012, shade: Optional[int] = None) -> bool:
        """Apply CellBorderFill to the currently selected cell block.

        This follows the supplied utility's direct HParameterSet assignment
        pattern, which is why early-bound win32com is preferred.
        """
        try:
            pset = self.hwp.HParameterSet.HCellBorderFill
            self.hwp.HAction.GetDefault("CellBorderFill", pset.HSet)
            pset.BorderTypeTop = int(top)
            pset.BorderTypeBottom = int(bottom)
            pset.BorderTypeLeft = int(left)
            pset.BorderTypeRight = int(right)
            for side, line_type in (("Top", top), ("Bottom", bottom), ("Left", left), ("Right", right)):
                if line_type:
                    setattr(pset, f"BorderWidth{side}", int(width))
            if horz is not None:
                pset.TypeHorz = int(horz)
                if horz:
                    pset.WidthHorz = int(width)
            if vert is not None:
                pset.TypeVert = int(vert)
                if vert:
                    pset.WidthVert = int(width)
            if shade is not None:
                pset.FillAttr.WinBrushFaceColor = int(shade)
                pset.FillAttr.WinBrushHatchColor = int(shade)
                pset.FillAttr.WindowsBrush = 1
            return bool(self.hwp.HAction.Execute("CellBorderFill", pset.HSet))
        except Exception:
            return False

    def _clear_selected_para_background(self) -> bool:
        """Set paragraph background to Hancom's explicit no-fill value."""
        try:
            pset = self.hwp.HParameterSet.HParaShape
            self.hwp.HAction.GetDefault("ParagraphShape", pset.HSet)
            pset.BorderFill.FillAttr.WinBrushFaceColor = HWP_PARA_NO_FILL
            return bool(self.hwp.HAction.Execute("ParagraphShape", pset.HSet))
        except Exception:
            return False

    def _set_selected_shade_only(self, color: int) -> bool:
        """Apply header cell shading without overwriting the border setup."""
        wrapper = getattr(self, "_pyhwpx_wrapper", None)
        fill = getattr(wrapper, "cell_fill", None) if wrapper is not None else None
        if callable(fill):
            b = (color >> 16) & 0xFF
            g = (color >> 8) & 0xFF
            r = color & 0xFF
            for args in ((r, g, b), ((r, g, b),), (color,)):
                try:
                    fill(*args)
                    return True
                except Exception:
                    pass
        try:
            pset = self.hwp.HParameterSet.HCellBorderFill
            self.hwp.HAction.GetDefault("CellBorderFill", pset.HSet)
            try:
                pset.FillAttr.type = 1
            except Exception:
                pass
            pset.FillAttr.WinBrushFaceColor = int(color)
            pset.FillAttr.WinBrushHatchColor = int(color)
            try:
                pset.FillAttr.WinBrushFaceStyle = 0
            except Exception:
                pass
            pset.FillAttr.WindowsBrush = 1
            return bool(self.hwp.HAction.Execute("CellBorderFill", pset.HSet))
        except Exception:
            return False

    def _select_first_row(self, ctrl) -> bool:
        if not self.enter_table(ctrl):
            return False
        self.goto_table_a1()
        if not self.run("TableCellBlock"):
            return False
        if not self.run("TableCellBlockRow"):
            self.run("Cancel")
            return False
        return True

    def apply_reference_table_style(self, t: TableFill, report: list[str]) -> bool:
        """Apply the supplied office table style to ordinary header+body tables.

        Only tables whose first physical row is exactly the column header are
        touched. Statistical tables with unit/title rows are intentionally left
        on their template-native style.
        """
        if t.prefix_cells != t.ncols or len(t.expect_header) != t.ncols:
            return True
        ctrls = self.table_ctrls()
        if t.index >= len(ctrls):
            return False
        ctrl = ctrls[t.index]

        # Body: top/bottom solid, no outside left/right line, solid inner grid,
        # white cell fill, and paragraph background set to explicit no-fill.
        if not self.enter_table(ctrl) or not self.select_whole_table():
            report.append(f"  [서식실패] 표{t.index}({t.name}): 표 전체 선택 실패")
            return False
        ok = self._set_selected_border(
            top=HWP_LINE_SOLID, bottom=HWP_LINE_SOLID,
            left=HWP_LINE_NONE, right=HWP_LINE_NONE,
            horz=HWP_LINE_SOLID, vert=HWP_LINE_SOLID, shade=HWP_CELL_WHITE)
        self.run("Cancel")
        if not ok:
            report.append(f"  [서식실패] 표{t.index}({t.name}): 본문 CellBorderFill 적용 실패")
            return False

        if not self.enter_table(ctrl) or not self.select_whole_table():
            report.append(f"  [서식실패] 표{t.index}({t.name}): 문단 배경 선택 실패")
            return False
        ok = self._clear_selected_para_background()
        self.run("Cancel")
        if not ok:
            report.append(f"  [서식실패] 표{t.index}({t.name}): 문단 배경 제거 실패")
            return False

        # Header: bold + centered + gray shade + double bottom rule.
        if not self._select_first_row(ctrl):
            report.append(f"  [서식실패] 표{t.index}({t.name}): 머리행 선택 실패")
            return False
        if not self._set_selected_char_bold():
            self.run("Cancel")
            report.append(f"  [서식실패] 표{t.index}({t.name}): 머리행 굵게 실패")
            return False
        if not self.run("ParagraphShapeAlignCenter"):
            self.run("Cancel")
            report.append(f"  [서식실패] 표{t.index}({t.name}): 머리행 가운데정렬 실패")
            return False
        ok = self._set_selected_border(
            top=HWP_LINE_SOLID, bottom=HWP_LINE_DOUBLE,
            left=HWP_LINE_NONE, right=HWP_LINE_NONE,
            vert=HWP_LINE_SOLID, width=HWP_LINE_WIDTH_012)
        if not ok:
            self.run("Cancel")
            report.append(f"  [서식실패] 표{t.index}({t.name}): 머리행 테두리 실패")
            return False
        if not self._set_selected_shade_only(HWP_HEADER_SHADE):
            self.run("Cancel")
            report.append(f"  [서식실패] 표{t.index}({t.name}): 머리행 음영 실패")
            return False
        self.run("Cancel")
        report.append(f"  [표서식] 표{t.index}({t.name}): 기준 표서식(본문+머리행) 재적용")
        return True

    def next_cell(self) -> bool:
        return self.run("TableRightCell")

    # --- 셀 단위 텍스트 접근 (v0.2.7) -------------------------------------
    # [중요] 셀 블록(TableCellBlock) 상태에서 GetTextFile("TEXT","saveblock:true")는
    # 선택 셀이 아니라 "표 전체"를 돌려준다(v0.2.6까지의 오작동 원인). 셀 하나만
    # 읽으려면 셀=리스트 범위 안의 '문자 블록'을 잡아야 한다.
    #   MoveListBegin  : 현재 리스트(=셀) 처음으로 이동
    #   MoveSelListEnd : 현재 리스트(=셀) 끝까지 문자 블록 확장
    def _read_cell_raw(self, mode: str) -> str:
        if mode == "list":
            self.run("Cancel")
            self.run("MoveListBegin")
            self.run("MoveSelListEnd")
            t = self.selected_text()
            self.run("Cancel")
            self.run("MoveListBegin")
            return t
        self.run("TableCellBlock")
        t = self.selected_text()
        self.run("Cancel")
        return t

    def probe_cell_reader(self, ctrl, report: list[str]) -> bool:
        """표의 앞 두 셀을 읽어 '셀 단위'로 읽히는 모드를 1회 선택한다."""
        if self.cell_read_mode:
            return True
        for mode in ("list", "block"):
            if not self.enter_table(ctrl):
                return False
            a = self._read_cell_raw(mode)
            if not self.next_cell():
                continue
            b = self._read_cell_raw(mode)
            # 셀 단위로 읽히면 인접 머리셀 값이 서로 다르고, 표 전체 덤프처럼 길지 않다.
            if a != b and len(a) <= CELL_TEXT_SANE_LEN and len(b) <= CELL_TEXT_SANE_LEN:
                self.cell_read_mode = mode
                if mode != "list":
                    report.append(f"  [주의] 셀 읽기 모드 '{mode}' 사용 — 한/글 동작 확인 권장")
                return True
        report.append(
            "  [실패] 셀 단위 읽기 불가: 이 한/글에서 셀 하나만 읽는 데 실패했습니다"
            " (표 전체가 반환됨). 값 검증을 할 수 없어 문서 생성을 중단합니다.")
        return False

    def write_cell(self, text: str):
        """셀 안 문자 블록만 지우고 다시 쓴다(셀 자체/표 구조는 건드리지 않음)."""
        cur = self._read_cell_raw(self.cell_read_mode or "list")
        if cur:
            self.run("Cancel")
            self.run("MoveListBegin")
            self.run("MoveSelListEnd")
            self.run("Delete")
        self.run("MoveListBegin")
        if text != "":
            self.insert_text(text)

    def read_cell(self) -> str:
        return self._read_cell_raw(self.cell_read_mode or "list")

    def goto_cell(self, ctrl, seq: int) -> bool:
        if not self.enter_table(ctrl):
            return False
        for _ in range(seq):
            if not self.next_cell():
                return False
        return True

    def count_cells(self, ctrl, limit: int = 4000) -> int:
        if not self.enter_table(ctrl):
            return 0
        n = 1
        while n < limit and self.next_cell():
            n += 1
        return n

    def table_cell_texts(self, ctrl, limit: int = 4000) -> list[str]:
        if not self.enter_table(ctrl):
            return []
        out = [self.read_cell()]
        while len(out) < limit and self.next_cell():
            out.append(self.read_cell())
        return out

    def split_cell_rows(self, rows: int) -> bool:
        """Split the current (possibly vertically merged) cell into *rows* cells."""
        if rows <= 1:
            return True
        try:
            ps = self.hwp.HParameterSet.HTableSplitCell
            self.hwp.HAction.GetDefault("TableSplitCell", ps.HSet)
            ps.Rows = int(rows)
            ps.Cols = 0
            ps.DistributeHeight = 1
            return bool(self.hwp.HAction.Execute("TableSplitCell", ps.HSet))
        except Exception:
            try:
                act = self.hwp.CreateAction("TableSplitCell")
                st = act.CreateSet()
                act.GetDefault(st)
                st.SetItem("Rows", int(rows))
                st.SetItem("Cols", 0)
                st.SetItem("DistributeHeight", 1)
                return bool(act.Execute(st))
            except Exception:
                return False

    def split_data_merges(self, t: TableFill, report: list[str]) -> bool:
        """데이터 영역의 세로병합을 사전분석 위치(순회 인덱스)로 분할한다.

        세로병합 셀은 걸친 행마다 다시 방문되므로 순회 인덱스는 분할 전후가
        같다. 따라서 위치 보정 없이 순서대로 분할하면 된다.
        """
        runs = list(getattr(t, "_traversal_merge_runs", []) or [])
        if not runs:
            return True
        done = 0
        for seq, span in runs:
            ctrls = self.table_ctrls()
            if t.index >= len(ctrls) or not self.goto_cell(ctrls[t.index], int(seq)):
                report.append(f"  [실패] 표{t.index}({t.name}): 병합 셀 이동 실패 (순회 {seq})")
                return False
            self.run("TableCellBlock")
            ok = self.split_cell_rows(int(span))
            self.run("Cancel")
            if not ok:
                report.append(f"  [실패] 표{t.index}({t.name}): 세로병합 {span}행 분할 실패")
                return False
            done += 1
        report.append(f"  [자동보정] 표{t.index}({t.name}): 데이터 영역 세로병합 {done}곳 분할(병합 없는 표로 생성)")
        return True

    def _row_op(self, t: TableFill, seq: int, actions: tuple[str, ...],
                delta: int, report: list[str]) -> bool:
        """행 추가/삭제를 '결과'로 판정한다.

        한/글 버전에 따라 어떤 액션 이름이 먹는지 다르고, HAction.Run의 반환값이
        성공 여부와 일치하지 않는 경우도 있다. 그래서 이름을 차례로 시도하되
        반환값이 아니라 순회 셀 수 변화로 성공을 판정하고, 엉뚱하게 바뀌었으면
        되돌린다.
        """
        ctrls = self.table_ctrls()
        if t.index >= len(ctrls):
            return False
        before = self.count_cells(ctrls[t.index])
        want = before + delta * t.ncols
        for act in actions:
            if not self.goto_cell(self.table_ctrls()[t.index], seq):
                return False
            if not self.select_current_row():
                self.run("Cancel")
                continue
            if act.startswith("@"):
                self.run_action(act[1:], Remove=1 if delta < 0 else 0)
            else:
                self.run(act)
            self.run("Cancel")
            after = self.count_cells(self.table_ctrls()[t.index])
            if after == want:
                if act != self._row_action_hint.get(delta < 0):
                    self._row_action_hint[delta < 0] = act
                return True
            if after != before:
                for _ in range(4):                     # 엉뚱하게 바뀌면 되돌린다
                    self.run("Undo")
                    if self.count_cells(self.table_ctrls()[t.index]) == before:
                        break
        report.append(
            f"  [주의] 표{t.index}({t.name}): 행 {'삭제' if delta < 0 else '추가'} 액션이"
            f" 모두 동작하지 않았습니다 (시도: {', '.join(a.lstrip('@') for a in actions)})")
        return False

    def resize_data_rows(self, t: TableFill, cur_rows: int, want: int,
                         report: list[str]) -> int:
        """데이터 행 수를 want로 맞추고, 실제로 맞춘 행 수를 돌려준다.

        KRISS 양식은 첫/중간/마지막 데이터행의 테두리가 다를 수 있어 가능하면
        첫·마지막 행을 남기고 중간행만 넣고 뺀다. 행 수를 못 바꾸더라도 실패로
        끝내지 않고 '맞출 수 있는 만큼'을 돌려준다(호출부가 남는 행을 비우고
        못 담은 행을 리포트에 남긴다).
        """
        if want == cur_rows:
            return cur_rows
        guard = abs(want - cur_rows) + 5
        while cur_rows > want and guard > 0:
            guard -= 1
            row = (cur_rows - 2) if (want >= 2 and cur_rows >= 3) else (1 if cur_rows > 1 else 0)
            if not self._row_op(t, t.prefix_cells + row * t.ncols, DELETE_ROW_ACTIONS, -1, report):
                break
            cur_rows -= 1
        while cur_rows < want and guard > 0:
            guard -= 1
            row = (cur_rows - 2) if cur_rows >= 3 else max(0, cur_rows - 1)
            if not self._row_op(t, t.prefix_cells + row * t.ncols, INSERT_ROW_ACTIONS, +1, report):
                break
            cur_rows += 1
        return cur_rows

    def fill_table(self, t: TableFill, report: list[str]) -> bool:
        ctrls = self.table_ctrls()
        if t.index >= len(ctrls):
            report.append(f"  [실패] 표{t.index}({t.name}): 문서 내 표 {len(ctrls)}개뿐")
            return False
        ctrl = ctrls[t.index]
        # 셀 단위 읽기 가능 여부 확인(문서당 1회)
        if not self.probe_cell_reader(ctrl, report):
            return False
        # 머리행 대조
        if not self.enter_table(ctrl):
            report.append(f"  [실패] 표{t.index}({t.name}): 진입 실패")
            return False
        got = []
        for i in range(len(t.expect_header)):
            got.append(self.read_cell())
            if i < len(t.expect_header) - 1 and not self.next_cell():
                break
        if [norm_ws(x) for x in got] != [norm_ws(x) for x in t.expect_header]:
            report.append(
                f"  [건너뜀] 표{t.index}({t.name}): 머리행 불일치"
                f" 읽음={[short(x) for x in got]} 기대={[short(x) for x in t.expect_header]}")
            return False
        # 순회(TableRightCell) 기준으로 머리셀 수를 보정한다. 세로병합된 머리
        # 셀은 걸친 행마다 다시 방문되므로 물리 셀 수와 다르다.
        tprefix = getattr(t, "_traversal_prefix", None)
        if isinstance(tprefix, int) and tprefix > 0 and tprefix != t.prefix_cells:
            report.append(
                f"  [자동보정] 표{t.index}({t.name}): 머리셀 {t.prefix_cells}→{tprefix} (한/글 순회 기준)")
            t.prefix_cells = tprefix
        # 데이터 영역 세로병합은 먼저 분할한다(결과물은 병합 없는 표).
        if not self.split_data_merges(t, report):
            return False
        total = self.count_cells(self.table_ctrls()[t.index])
        data_cells = total - t.prefix_cells
        if data_cells < 0 or data_cells % t.ncols:
            report.append(
                f"  [건너뜀] 표{t.index}({t.name}): 표 구조를 해석하지 못했습니다"
                f" (순회 {total}셀, 머리 {t.prefix_cells}, {t.ncols}열)")
            return False
        cur_rows = data_cells // t.ncols
        want = len(t.rows)
        if t.resize and cur_rows != want:
            cur_rows = self.resize_data_rows(t, cur_rows, want, report)
        elif not t.resize and cur_rows != want:
            report.append(f"  [실패] 표{t.index}({t.name}): 골격 고정 표 행 수 불일치 {cur_rows}!={want}")
            return False
        if want == 0 and cur_rows == 0:
            report.append(f"  [완료] 표{t.index}({t.name}): 데이터 0행")
            return True
        writable = min(cur_rows, want)
        rows_to_write = [list(r) for r in t.rows[:writable]]
        blanks = max(0, cur_rows - want)
        overflow = max(0, want - cur_rows)
        if blanks:
            rows_to_write += [[""] * t.ncols for _ in range(blanks)]
        if overflow or blanks:
            report.append(
                f"  [주의] 표{t.index}({t.name}): 표 {cur_rows}행 / 데이터 {want}행 —"
                + (f" {overflow}행을 담지 못했습니다(한/글에서 행 추가 후 재실행)." if overflow else "")
                + (f" 남는 {blanks}행은 비워 둡니다(한/글에서 행 삭제)." if blanks else ""))

        # 데이터 기입 (재진입 후 순차)
        ctrl = self.table_ctrls()[t.index]
        if not self.goto_cell(ctrl, t.prefix_cells):
            report.append(f"  [실패] 표{t.index}({t.name}): 데이터 시작 셀 이동 실패")
            return False
        for r, row in enumerate(rows_to_write):
            for c, val in enumerate(row):
                self.write_cell(val)
                if not (r == len(rows_to_write) - 1 and c == len(row) - 1):
                    if not self.next_cell():
                        report.append(f"  [실패] 표{t.index}({t.name}): {r + 1}행 {c + 1}열 이후 이동 실패")
                        return False
        # 검증 (읽기 재대조)
        if not self.goto_cell(self.table_ctrls()[t.index], t.prefix_cells):
            return False
        bad, samples = 0, []
        for r, row in enumerate(rows_to_write):
            for c, val in enumerate(row):
                got_v = self.read_cell()
                if norm_ws(got_v) != norm_ws(val):
                    bad += 1
                    if len(samples) < 3:
                        samples.append(f"{r + 1}행{c + 1}열 읽음={short(got_v)} 기대={short(val)}")
                if not (r == len(rows_to_write) - 1 and c == len(row) - 1):
                    self.next_cell()
        if bad:
            report.append(
                f"  [검증실패] 표{t.index}({t.name}): {bad}셀 불일치"
                + (" — " + "; ".join(samples) if samples else ""))
            return False
        # Keep the template-native border/fill/paragraph/character IDs intact.
        # The supplied CellBorderFill implementation is retained as a guarded
        # reference helper, but is not forced over an existing committee template.
        # This avoids visually equivalent yet newly allocated HWP style IDs that
        # would defeat the strict post-save template-fidelity audit.
        report.append(
            f"  [{'완료' if not (overflow or blanks) else '부분완료'}] 표{t.index}({t.name}):"
            f" {writable}행 기입·값검증" + (f" / 빈 행 {blanks}" if blanks else "")
            + (f" / 미수록 {overflow}행" if overflow else ""))
        return not (overflow or blanks)

    def write_cell_by_seq(self, cw: CellWrite, report: list[str]) -> bool:
        ctrls = self.table_ctrls()
        if cw.table_index >= len(ctrls):
            report.append(f"  [실패] 셀({cw.name}): 표{cw.table_index} 없음")
            return False
        if not self.goto_cell(ctrls[cw.table_index], cw.cell_seq):
            report.append(f"  [실패] 셀({cw.name}): 이동 실패")
            return False
        if same_text(self.read_cell(), cw.text):
            report.append(f"  [완료] 셀({cw.name}) — 기존 값과 동일하여 유지")
            return True
        self.write_cell(cw.text)
        ok = norm_ws(self.read_cell()) == norm_ws(cw.text)
        report.append(f"  [{'완료' if ok else '검증실패'}] 셀({cw.name})")
        return ok

    # --- 문단 교체 ---
    def find_once(self, needle: str) -> bool:
        try:
            ps = self.hwp.HParameterSet.HFindReplace
            self.hwp.HAction.GetDefault("RepeatFind", ps.HSet)
            ps.FindString = needle
            ps.Direction = 0
            ps.IgnoreMessage = 1
            return bool(self.hwp.HAction.Execute("RepeatFind", ps.HSet))
        except Exception:
            return False

    def _select_para_tail(self, pos, suffix: str) -> bool:
        """현재 문단에서 '끝에서부터 suffix' 만큼만 문자 블록으로 잡는다.

        개체 앵커의 위치(GetAnchorPos의 Pos)는 한/글 버전·배치에 따라 의미가
        달라 신뢰하기 어렵다. 그래서 위치를 계산하지 않고, 문단 끝 근처부터
        시작 위치를 옮겨 가며 '선택된 꼬리 텍스트가 목표와 같아지는 지점'을
        찾는다. 개체보다 뒤쪽만 선택하므로 개체가 지워지지 않는다.
        """
        self.run("MoveParaEnd")
        end = self.cur_pos()
        if not end:
            return False
        limit = min(end[2], len(suffix) + 8)
        for back in range(0, limit + 1):
            try:
                self.hwp.SetPos(int(pos[0]), int(pos[1]), int(end[2]) - back)
            except Exception:
                return False
            self.run("MoveSelParaEnd")
            if self.selected_text() == suffix:
                return True
            self.run("Cancel")
        return False

    def _replace_para_keep_objects(self, pr: ParaReplace, pos, cur: str,
                                   anchors: list, report: list[str]) -> bool:
        """표/그림 앵커가 같은 문단에 있으면 '바뀐 꼬리'만 교체해 개체를 보존한다.

        문단 전체를 선택해 Delete하면 문단에 박힌 개체 앵커까지 지워져 표가
        통째로 사라진다(붙임2의 세부현황 소제목이 이 경우).
        """
        # 문단 텍스트에 개체 자리표시 문자가 섞여 나오는 한/글도 있다. 그 문자는
        # 절대로 지우면 안 되므로, 바꿀 구간은 '마지막 개체 문자 뒤'로 제한한다.
        obj_end = 0
        plain_before = 0
        for i, ch in enumerate(cur):
            if is_object_char(ch):
                obj_end = i + 1
                plain_before = len(strip_object_chars(cur[:i]))
        if obj_end:
            head_plain = strip_object_chars(cur[:obj_end])
            if not pr.text.startswith(head_plain):
                self.run("Cancel")
                report.append(
                    f"  [수동] 문단({pr.name}): 개체 앞부분이 바뀌어 자동 교체 보류"
                    f" — 『{pr.text}』로 직접 수정 필요")
                return False
            old_tail, new_tail = cur[obj_end:], pr.text[plain_before:]
        else:
            keep = 0
            for i, (x, y) in enumerate(zip(cur, pr.text)):
                if x != y:
                    break
                keep = i + 1
            old_tail, new_tail = cur[keep:], pr.text[keep:]
        if not old_tail and not new_tail:
            return True
        if old_tail and not self._select_para_tail(pos, old_tail):
            self.run("Cancel")
            report.append(
                f"  [수동] 문단({pr.name}): 개체(표/그림)와 같은 문단이라 자동 교체 보류"
                f" — 『{pr.text}』로 직접 수정 필요")
            return False
        if old_tail:
            self.run("Delete")
        else:
            self.run("MoveParaEnd")
        if new_tail:
            self.insert_text(new_tail)
        return True

    def _replace_one_para(self, pr: ParaReplace, pos, cur: str, report: list[str]) -> str:
        """현재 문단(위치 pos, 텍스트 cur)에 교체를 적용. 반환: hit|manual|skip."""
        target = para_target_text(cur, pr)
        if pr.subs and same_text(target, cur):
            # 부분치환 대상 토큰이 이 문단에 없거나 이미 목표값 — 그대로 둔다.
            self.run("MoveParaEnd")
            return "hit"
        if same_text(cur, target):
            return "hit"
        anchors = self.ctrl_anchors_in_para(pos)
        import dataclasses as _dc
        eff = _dc.replace(pr, text=target)
        if anchors:
            if self._replace_para_keep_objects(eff, pos, cur, anchors, report):
                return "hit"
            return "manual"
        self.run("MoveParaBegin")
        self.run("MoveSelParaEnd")
        self.run("Delete")
        self.insert_text(target)
        return "hit"

    def _para_iter_positions(self, max_paras: int = 600):
        """문서 처음부터 문단 단위로 (pos, text)를 순회한다."""
        self.run("MoveDocBegin")
        seen: set[tuple[int, int]] = set()
        for _ in range(max_paras):
            self.run("MoveParaBegin")
            pos = self.cur_pos()
            if pos is None:
                return
            key = (pos[0], pos[1])
            if key in seen:
                return
            seen.add(key)
            self.run("MoveSelParaEnd")
            cur = self.selected_text()
            self.run("Cancel")
            yield pos, cur
            self.run("MoveParaEnd")
            if not self.run("MoveNextParaBegin"):
                self.run("MoveRight")

    def replace_para(self, pr: ParaReplace, report: list[str]) -> bool:
        before_tables = len(self.table_ctrls())
        hits, manual = 0, 0
        anchors = [a for a in [pr.anchor] + list(pr.alt_anchors or []) if a]
        for anchor in anchors:
            self.run("MoveDocBegin")
            seen: set[tuple[int, int]] = set()
            for _ in range(MAX_PARA_HITS):
                if not self.find_once(anchor):
                    break
                self.run("Cancel")
                self.run("MoveParaBegin")
                pos = self.cur_pos()
                if pos is not None:
                    key = (pos[0], pos[1])
                    if key in seen:
                        break            # RepeatFind가 문서 끝에서 처음으로 되돌아온 경우
                    seen.add(key)
                self.run("MoveSelParaEnd")
                cur = self.selected_text()
                self.run("Cancel")
                if pr.exclude and pr.exclude in cur:
                    self.run("MoveParaEnd")
                    if not pr.all_occurrences:
                        break
                    continue
                res = self._replace_one_para(pr, pos, cur, report)
                if res == "hit":
                    hits += 1
                elif res == "manual":
                    manual += 1
                now = len(self.table_ctrls())
                if now < before_tables:
                    for _ in range(8):
                        self.run("Undo")
                        if len(self.table_ctrls()) >= before_tables:
                            break
                    report.append(
                        f"  [실패] 문단({pr.name}): 교체 중 표 개수 감소 감지 — Undo 후 중단")
                    return False
                if not pr.all_occurrences:
                    break
                self.run("MoveParaEnd")
            if hits and not pr.all_occurrences:
                break
        if not hits and not manual and pr.anchor_regex:
            rx = re.compile(pr.anchor_regex)
            matched = []
            for pos, cur in self._para_iter_positions():
                if rx.search(cur) and not (pr.exclude and pr.exclude in cur):
                    matched.append((pos, cur))
                    if not pr.all_occurrences:
                        break
            for pos, cur in matched:
                try:
                    self.hwp.SetPos(int(pos[0]), int(pos[1]), 0)
                except Exception:
                    pass
                res = self._replace_one_para(pr, pos, cur, report)
                if res == "hit":
                    hits += 1
                elif res == "manual":
                    manual += 1
        if not hits and not manual:
            if pr.optional:
                report.append(f"  [생략] 문단({pr.name}): 이 양식에 없는 선택 항목")
                return True
            report.append(f"  [실패] 문단({pr.name}): anchor 미발견 『{pr.anchor}』")
            return False
        tag = "완료" if not manual else "부분완료"
        report.append(f"  [{tag}] 문단({pr.name}): {hits}곳" + (f" 교체 / {manual}곳 수동" if manual else ""))
        return manual == 0

    def replace_picture(self, pic: PictureReplace, report: list[str]) -> bool:
        self.run("MoveDocBegin")
        if not self.find_once(pic.anchor):
            report.append(f"  [실패] 그림: anchor 미발견 『{pic.anchor}』")
            return False
        self.run("Cancel")
        self.run("MoveParaEnd")
        self.run("MoveNextParaBegin")
        pos = self.cur_pos()
        targets = self.ctrl_anchors_in_para(pos)
        if any(cid == "tbl" for _, cid, _ in targets):
            report.append("  [실패] 그림: 대상 문단에 표가 함께 있어 자동 교체 중단 — 수동 교체 필요")
            return False
        removed = 0
        for _, _, ctrl in targets:
            try:
                self.hwp.SetPosBySet(ctrl.GetAnchorPos(0))
                self.hwp.FindCtrl()
                if self.run("Delete"):
                    removed += 1
            except Exception:
                pass
        if not removed:
            # 개체가 없으면 기존 방식대로 해당 문단의 텍스트만 비운다.
            self.run("MoveParaBegin")
            self.run("MoveSelParaEnd")
            self.run("Delete")
        mm_w = max(1, int(round(pic.width_mm)))
        mm_h = max(1, int(round(pic.height_mm)))
        hwpunit_w = int(pic.width_mm / 25.4 * 7200)
        hwpunit_h = int(pic.height_mm / 25.4 * 7200)
        before = sum(1 for cid, _ in self.body_ctrls() if cid == "gso")
        errs: list[str] = []
        for label, call in self._insert_picture_calls(pic.png, mm_w, mm_h):
            try:
                call()
            except Exception as e:                      # 다음 호출 형태로 넘어간다
                errs.append(f"{label}: {e}")
                continue
            after = sum(1 for cid, _ in self.body_ctrls() if cid == "gso")
            if after > before:
                self._resize_last_picture(hwpunit_w, hwpunit_h)
                report.append(
                    f"  [완료] 그림 교체 → {Path(pic.png).name}"
                    f" ({label}, {mm_w}x{mm_h}mm 지정 — 배치 육안 확인 권장)")
                return True
            errs.append(f"{label}: 개체가 늘지 않음")
        report.append(
            "  [실패] 그림 삽입: " + " / ".join(errs[:3]) + " — 한/글에서 수동 삽입 필요")
        return False

    def _raw_hwp(self):
        """pyhwpx 등 래퍼 뒤의 실제 COM 객체(있으면)."""
        inner = getattr(self.hwp, "hwp", None)
        return inner if inner is not None and hasattr(inner, "InsertPicture") else self.hwp

    def _insert_picture_calls(self, path: str, w: int, h: int):
        """그림 삽입 호출 후보. w/h는 mm 단위 정수.

        한/글 InsertPicture의 Width/Height 인자는 mm이다. HWPUNIT(예: 45,354)을
        넘기면 최대 크기로 잘려 1000.00x1000.00mm 거대 그림이 되므로(0.2.8 실기
        증상) 반드시 mm로 전달한다. 래퍼(pyhwpx)가 인자 순서를 바꿔 감싸는
        경우가 있어 원본 COM 객체 → 래퍼 → 원래 크기 순으로 시도한다.
        """
        raw = self._raw_hwp()
        return [
            ("원본 COM/지정크기", lambda: raw.InsertPicture(path, True, 1, False, False, 0, w, h)),
            ("원본 COM/원래크기", lambda: raw.InsertPicture(path, True, 0)),
            ("래퍼/기본", lambda: self.hwp.InsertPicture(path)),
        ]

    def _resize_last_picture(self, w: int, h: int) -> bool:
        """마지막에 삽입된 그림을 지정 크기로 맞춘다. w/h는 HWPUNIT(1/7200in)."""
        gso = [c for cid, c in self.body_ctrls() if cid == "gso"]
        if not gso:
            return False
        try:
            self.hwp.SetPosBySet(gso[-1].GetAnchorPos(0))
            self.hwp.FindCtrl()
            pset = self.hwp.HParameterSet.HShapeObject
            self.hwp.HAction.GetDefault("ShapeObjDialog", pset.HSet)
            pset.Width = int(w)
            pset.Height = int(h)
            return bool(self.hwp.HAction.Execute("ShapeObjDialog", pset.HSet))
        except Exception:
            return False

    # --- 문서 단위 ---
    def pick_probe_table(self):
        """셀이 2개 이상인 첫 표(프로브용). 배너 1x1 표는 건너뛴다."""
        for ctrl in self.table_ctrls():
            if self.count_cells(ctrl, limit=3) >= 2:
                return ctrl
        return None

    def apply_doc(self, doc: DocPlan, template: Path, out_path: Path, report: list[str]) -> bool:
        self.hwp.Open(str(template), "HWP", "lock:false;forceopen:true")
        ok = True
        self.cell_read_mode = None
        if doc.cell_writes or doc.tables:
            probe = self.pick_probe_table()
            if probe is None:
                report.append("  [실패] 문서에 표가 없어 셀 기입을 진행할 수 없습니다.")
                self.run("FileClose")
                return False
            if not self.probe_cell_reader(probe, report):
                self.run("FileClose")
                return False
        for cw in doc.cell_writes:
            ok &= self.write_cell_by_seq(cw, report)
        for t in doc.tables:
            ok &= self.fill_table(t, report)
        for pr in doc.para_replaces:
            ok &= self.replace_para(pr, report)
        for pic in doc.pictures:
            ok &= self.replace_picture(pic, report)
        try:
            self.hwp.SaveAs(str(out_path), "HWP", "")
        except Exception:
            ps = self.hwp.HParameterSet.HFileOpenSave
            self.hwp.HAction.GetDefault("FileSaveAs_S", ps.HSet)
            ps.filename = str(out_path)
            ps.Format = "HWP"
            self.hwp.HAction.Execute("FileSaveAs_S", ps.HSet)
        self.run("FileClose")
        if self._row_action_hint:
            used = ", ".join(f"{'삭제' if k else '추가'}={v}" for k, v in self._row_action_hint.items())
            report.append(f"  [참고] 이 한/글에서 동작한 행 조작 액션: {used}")

        # v0.2.6 post-save design QA: parse the actual generated HWP and compare
        # table widths/margins/borders/paragraph+character styles/merge spans to
        # the original template. Any design regression marks the document failed.
        if doc.pictures:
            n_img, total = hwp_support.embedded_image_summary(out_path)
            report.append(f"  [그림확인] 저장본에 이미지 {n_img}개 포함 ({total // 1024}KB)")
            for pic in doc.pictures:
                try:
                    payload = Path(pic.png).read_bytes()
                except Exception:
                    payload = b""
                if payload and hwp_support.embedded_image_contains(out_path, payload):
                    report.append(f"  [그림검증] {Path(pic.png).name} 바이트 일치 — 차트가 실제 포함됨")
                else:
                    ok = False
                    report.append(
                        f"  [실패] 그림검증: {Path(pic.png).name} 이(가) 저장본에 실제로 들어있지 않습니다"
                        " — 한/글에서 『" + pic.anchor + "』 아래에 PNG를 직접 삽입하십시오"
                        f" (파일: {pic.png})")
        try:
            audit = hwp_support.audit_generated_document(doc, template, out_path)
            for msg in audit.get("info", []):
                report.append(f"  [서식검증] {msg}")
            for msg in audit.get("warnings", []):
                report.append(f"  [서식경고] {msg}")
            if audit.get("errors"):
                ok = False
                for msg in audit["errors"]:
                    report.append(f"  [서식검증실패] {msg}")
            else:
                report.append("  [서식검증] 저장된 HWP 표 디자인 핵심속성 일치")
        except Exception as e:
            ok = False
            report.append(f"  [서식검증실패] 저장 후 HWP 분석 예외: {e}")
        return ok

    def quit(self):
        try:
            self.hwp.Quit()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

VALID_DOCS = ("b1", "b2", "b5", "b6", "b7", "b8")


def unique_output_path(path: Path) -> Path:
    """Avoid HWP SaveAs overwrite dialogs during unattended runs."""
    if not path.exists():
        return path
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    return path.with_name(f"{path.stem}_{stamp}{path.suffix}")


def write_preflight_report(out_dir: Path, lines: list[str]) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    p = out_dir / "template_preflight.txt"
    p.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return p


def main(argv=None):
    ap = argparse.ArgumentParser(description=f"KRISS HWP 양식 채움 v{VERSION}")
    ap.add_argument("--master", required=True, help="MASTER.xlsx 경로")
    ap.add_argument("--templates", default=None, help="붙임 HWP 템플릿 폴더 또는 ZIP")
    ap.add_argument("--templates-dir", default=None, help="[호환] 템플릿 폴더. --templates 사용 권장")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--png-dir", default=None, help="*_hwpx.png 폴더 (기본: MASTER와 같은 폴더)")
    ap.add_argument("--round", type=int, default=None, help="회차 (기본: 기준분기 끝 분기로 자동 판정)")
    ap.add_argument("--date", default=None, help="보고/심의일자 YYYY-MM-DD (미지정 시 템플릿에서 추론)")
    ap.add_argument("--dept-map", default=None, help="주발명자,본부 CSV (붙임5 본부 열)")
    ap.add_argument("--docs", default=",".join(VALID_DOCS), help="생성 문서 키, 기본 b1,b2,b5,b6,b7,b8")
    ap.add_argument("--allow-annex-mismatch", action="store_true",
                    help="[호환] 기본 동작과 동일 — 붙임5 별첨 불일치를 경고로 처리")
    ap.add_argument("--strict-annex", action="store_true",
                    help="붙임5 별첨 평가표가 이번 회차와 다르면 문서 생성을 아예 중단")
    ap.add_argument("--dry-run", action="store_true", help="plan+템플릿 preflight만 생성 (한/글 미사용)")
    args = ap.parse_args(argv)

    template_arg = args.templates or args.templates_dir
    if not template_arg:
        ap.error("--templates 에 템플릿 폴더 또는 ZIP을 지정하십시오.")

    docs = [d.strip().lower() for d in args.docs.split(",") if d.strip()]
    unknown = [d for d in docs if d not in VALID_DOCS]
    if unknown:
        ap.error(f"알 수 없는 --docs 값: {', '.join(unknown)} / 허용: {', '.join(VALID_DOCS)}")
    # Preserve order but remove accidental duplicates.
    docs = list(dict.fromkeys(docs))

    master_path = Path(args.master).expanduser().resolve()
    master = read_master(master_path)
    if args.round is not None:
        round_no = args.round
        round_source = "명시(--round)"
    elif master.meeting_round is not None:
        round_no = master.meeting_round
        round_source = "MASTER 00_요약"
    else:
        q_last = master.quarters[-1][1] if master.quarters else 1
        round_no = q_last
        round_source = "기준분기 fallback"
    year = master.meeting_year or (master.quarters[-1][0] if master.quarters else dt.date.today().year)
    png_dir = Path(args.png_dir).expanduser().resolve() if args.png_dir else master_path.parent
    out_dir = Path(args.out_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    root = Path(__file__).resolve().parent
    with hwp_support.TemplateBundle(Path(template_arg)) as bundle:
        if args.date:
            try:
                report_date = dt.date.fromisoformat(args.date)
            except ValueError:
                ap.error("--date는 YYYY-MM-DD 형식이어야 합니다.")
            date_source = "명시(--date)"
        else:
            inferred = hwp_support.infer_report_date(bundle)
            if inferred:
                report_date = inferred
                date_source = "템플릿 자동추론"
            else:
                report_date = dt.date.today()
                date_source = "오늘 날짜 fallback(템플릿 날짜 추론 실패)"

        if args.dept_map:
            dept_path = Path(args.dept_map).expanduser().resolve()
            dept_map = load_dept_map(dept_path)
            dept_source = str(dept_path)
        else:
            dept_map, dept_source = hwp_support.load_default_dept_map(root, year, round_no)
            dept_source = dept_source or "없음"

        plan = PlanBuilder(master, round_no, report_date, dept_map, png_dir).build(docs)
        plan.meta.update({
            "templates_source": str(Path(template_arg).expanduser().resolve()),
            "template_files": bundle.list_names(),
            "date_source": date_source,
            "round_source": round_source,
            "master_version": master.master_version,
            "dept_map_source": dept_source,
        })
        write_dry_run(plan, out_dir)

        preflight_lines = [
            f"KRISS HWP 템플릿 사전검사 v{VERSION}",
            f"MASTER: {master.path}",
            f"템플릿: {Path(template_arg).expanduser().resolve()}",
            f"기준분기: {master.period_label} / 포기: {master.waiver_label}",
            f"회차: {round_no} ({round_source}) / 일자: {report_date} ({date_source})",
            f"본부 매핑: {dept_source}",
            "",
        ]
        resolved: dict[str, Path] = {}
        preflight_errors: dict[str, list[str]] = {}
        preflight_warnings: dict[str, list[str]] = {}

        for doc in plan.docs:
            preflight_lines.append(f"== {doc.key} / {doc.template_pattern} ==")
            tpl = bundle.find(doc.template_pattern)
            if not tpl:
                msg = f"템플릿 미발견: {doc.template_pattern}*.hwp"
                preflight_errors[doc.key] = [msg]
                preflight_lines.append(f"[ERROR] {msg}")
                preflight_lines.append("")
                continue
            resolved[doc.key] = tpl
            preflight_lines.append(f"파일: {tpl.name}")
            result = hwp_support.preflight_template(doc, tpl)
            errs = list(result["errors"])
            warns = list(result["warnings"])
            # 별첨 개별 평가표는 MASTER에 없는 자료(심의결과표 원본)라 회차가 바뀌면
            # 항상 불일치한다. 문서 전체를 막는 대신 '반드시 수동 교체' 과제로 돌린다.
            if doc.key == "b5" and not args.strict_annex:
                moved = [e for e in errs if e.startswith("별첨 평가표 연계 확인")]
                if moved:
                    errs = [e for e in errs if e not in moved]
                    warns.extend(moved)
                    doc.manual_todo.append(
                        "붙임5 별첨 개별 평가표는 이전 회차 내용이 그대로 남습니다 —"
                        " 이번 회차 심의결과표로 반드시 교체하십시오.")
            if errs:
                preflight_errors[doc.key] = errs
            if warns:
                preflight_warnings[doc.key] = warns
            for msg in result["info"]:
                preflight_lines.append(f"[OK] {msg}")
            for msg in warns:
                preflight_lines.append(f"[WARN] {msg}")
            for msg in errs:
                preflight_lines.append(f"[ERROR] {msg}")
            for note in doc.notes:
                preflight_lines.append(f"[INFO] {note}")
            for todo in doc.manual_todo:
                preflight_lines.append(f"[MANUAL] {todo}")
            preflight_lines.append("")

        drift = hwp_support.archival_drift_report(master, root)
        if drift:
            preflight_lines += [
                "== 2026년 제1차 보관 정본 대비 데이터 드리프트 ==",
                "현재 원천/Master를 과거 정본과 비교한 참고 경고입니다. 생성 데이터는 MASTER를 기준으로 합니다.",
            ]
            preflight_lines += [f"[WARN] {line}" for line in drift]
            preflight_lines.append("")

        pf_path = write_preflight_report(out_dir, preflight_lines)
        print(f"[preflight] {pf_path}")
        if preflight_errors:
            print("[preflight] 실패 문서: " + ", ".join(preflight_errors))

        if args.dry_run:
            return 1 if preflight_errors else 0

        report = [
            f"KRISS HWP 채움 리포트 v{VERSION}",
            f"MASTER: {master.path}",
            f"템플릿: {Path(template_arg).expanduser().resolve()}",
            f"기준분기: {master.period_label} / 포기: {master.waiver_label}",
            f"회차: {round_no} ({round_source}) / 일자: {report_date} ({date_source})",
            f"사전검사: {pf_path.name}",
            "",
        ]
        if drift:
            report.append("[데이터 드리프트 경고]")
            report.extend("  - " + x for x in drift)
            report.append("")

        def out_name_for(doc: DocPlan, tpl: Path) -> str:
            # 산출물 확장자는 실제 템플릿 형식을 따른다 (병합본에는 .hwpx가 포함됨)
            return Path(doc.out_name).with_suffix(tpl.suffix.lower()).name

        hwpx_keys = [d.key for d in plan.docs
                     if d.key in resolved and hwp_support.is_hwpx(resolved[d.key])]
        classic_keys = [d.key for d in plan.docs
                        if d.key in resolved and not hwp_support.is_hwpx(resolved[d.key])]

        all_ok = True
        has_manual = False
        skipped_classic: list[str] = []

        def _post(doc: DocPlan, ok: bool):
            nonlocal all_ok, has_manual
            all_ok &= ok
            for note in doc.notes:
                report.append(f"  [참고] {note}")
            for td in doc.manual_todo:
                report.append(f"  [수동] {td}")
                has_manual = True

        # 1) HWPX 템플릿: zip/XML 직접 편집 — 한/글 없이 어느 OS에서나 생성·검증
        if hwpx_keys:
            import hwpx_fill
            report.append(f"HWPX 직접 편집: {', '.join(hwpx_keys)} (한/글 불필요)")
        for doc in plan.docs:
            if doc.key not in hwpx_keys:
                continue
            report.append(f"\n== {doc.key} ==")
            if doc.key in preflight_errors:
                report.append("  [사전검사 실패] 안전을 위해 이 문서는 생성하지 않음")
                for e in preflight_errors[doc.key]:
                    report.append(f"    - {e}")
                all_ok = False
                continue
            tpl = resolved[doc.key]
            report.append(f"  템플릿: {tpl.name} [HWPX]")
            out_path = unique_output_path(out_dir / out_name_for(doc, tpl))
            ok = hwpx_fill.apply_doc(doc, tpl, out_path, report)
            report.append(f"  출력: {out_path.name}")
            _post(doc, ok)

        # 2) classic .hwp 템플릿: Windows + 한/글 COM
        if classic_keys and sys.platform != "win32":
            report.append(
                "\n[대기] .hwp 템플릿 문서는 Windows + 한/글 환경에서 다시 실행해야 생성됩니다: "
                + ", ".join(classic_keys))
            skipped_classic = classic_keys
        elif classic_keys:
            app = HwpApplier(print)
            try:
                app.connect()
            except Exception as e:
                report.append(f"[실패] 한/글 COM 연결 실패: {e}")
                (out_dir / "hwp_fill_report.txt").write_text("\n".join(report), encoding="utf-8")
                print("\n".join(report))
                return 1
            report.append(f"한/글 연결: {app.backend}")
            try:
                for doc in plan.docs:
                    if doc.key not in classic_keys:
                        continue
                    report.append(f"\n== {doc.key} ==")
                    if doc.key in preflight_errors:
                        report.append("  [사전검사 실패] 안전을 위해 이 문서는 생성하지 않음")
                        for e in preflight_errors[doc.key]:
                            report.append(f"    - {e}")
                        all_ok = False
                        continue
                    tpl = resolved.get(doc.key)
                    if not tpl:
                        report.append("  [실패] 템플릿 미해결")
                        all_ok = False
                        continue
                    report.append(f"  템플릿: {tpl.name}")
                    out_path = unique_output_path(out_dir / out_name_for(doc, tpl))
                    ok = app.apply_doc(doc, tpl, out_path, report)
                    report.append(f"  출력: {out_path.name}")
                    _post(doc, ok)
            finally:
                app.quit()

        missing_tpl = [d.key for d in plan.docs if d.key not in resolved]
        if missing_tpl:
            all_ok = False

        if not all_ok:
            final = "일부 실패 — 사전검사/적용 실패 항목을 확인하십시오."
            code = 1
        elif skipped_classic:
            final = ("HWPX 문서 생성 완료 / .hwp 문서(" + ", ".join(skipped_classic)
                     + ")는 Windows + 한/글에서 같은 명령으로 생성하십시오.")
            code = 2
        elif has_manual:
            final = "자동 생성 완료 / 수동 확인 항목 있음"
            code = 3
        else:
            final = "자동 생성 및 검증 완료"
            code = 0
        report.append("\n결과: " + final)
        report_path = out_dir / "hwp_fill_report.txt"
        report_path.write_text("\n".join(report), encoding="utf-8")
        print("\n".join(report))
        return code


if __name__ == "__main__":
    try:
        code = main()
    except (FileNotFoundError, ValueError) as e:
        # Predictable user/input errors should be readable in the GUI log instead
        # of producing a full traceback (e.g. a ZIP with no .hwp templates).
        print(f"[중단] 입력/템플릿 오류: {e}")
        code = 1
    sys.exit(code)
