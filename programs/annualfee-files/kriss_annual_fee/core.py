from __future__ import annotations

# core.py — utils / models / discover 통합 모듈 (v0.5.1 구조 통합)
# 기존 3개 소형 모듈(utils, models, discover)을 동작 변경 없이 합쳤다.

import csv
import hashlib
import json
import os
import re
import shutil
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


# ===== utils =====
INVALID_WIN_CHARS = '<>:"/\\|?*'


def norm_header(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", "", str(value)).strip()


def norm_management(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def norm_code(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    s = str(value).strip()
    if re.fullmatch(r"\d+\.0", s):
        s = s[:-2]
    return s


def as_int(value: Any) -> int:
    if value is None or value == "":
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(round(value))
    s = str(value).replace(",", "").replace("₩", "").strip()
    if not s:
        return 0
    return int(round(float(s)))


def safe_filename(name: str) -> str:
    """Return a Windows-safe business filename while preserving visible naming.

    Golden 2026Q1 proves that '/' in a budget name is simply removed
    (e.g. '장비/공정' -> '장비공정'), not replaced by an underscore.
    Other Windows-invalid characters are replaced with '_'.  Internal spaces,
    including intentional double spaces such as 'X-ray 3D  현미경장비 개발',
    are preserved exactly.
    """
    out = str(name)
    out = out.replace("/", "").replace("\\", "")
    for ch in '<>:"|?*':
        out = out.replace(ch, "_")
    out = out.rstrip(" .")
    return out or "unnamed"


def ensure_empty_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_csv(path: Path, headers: Sequence[str], rows: Iterable[Sequence[Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(headers)
        for row in rows:
            w.writerow(list(row))


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def period_key_from_name(name: str) -> Tuple[int, int]:
    """Return sortable (year, quarter) from Korean/compact filename. Unknown -> (0,0)."""
    patterns = [
        r"(20\d{2})\s*년도?\s*([1-4])\s*분기",
        r"(20\d{2})(0?[1-4])Q",
        r"(20\d{2})[-_ ]?Q([1-4])",
    ]
    for p in patterns:
        m = re.search(p, name, re.I)
        if m:
            return int(m.group(1)), int(m.group(2))
    return 0, 0


def infer_year_quarter(invoice_name: str) -> Tuple[int, int]:
    m = re.search(r"(20\d{2})(0[1-4])Q", invoice_name)
    if m:
        return int(m.group(1)), int(m.group(2))
    y, q = period_key_from_name(invoice_name)
    if y and q:
        return y, q
    raise ValueError(f"파일명에서 연도/분기를 추출할 수 없습니다: {invoice_name}")


def excel_col(n: int) -> str:
    s = ""
    while n:
        n, rem = divmod(n - 1, 26)
        s = chr(65 + rem) + s
    return s


# ===== models =====
@dataclass
class InputFiles:
    domestic_pdf: Path
    domestic_xlsx: Path
    overseas_pdf: Path
    overseas_xlsx: Path
    research_xlsx: Path
    tech_xlsx: Path
    history_files: List[Path] = field(default_factory=list)


@dataclass
class BudgetMapping:
    management_no: str
    budget_code: str
    budget_name: str
    source_file: str
    source_kind: str  # current_research/current_tech/history_research/history_tech
    source_period: Optional[str] = None


@dataclass
class InvoiceItem:
    scope: str  # domestic / overseas
    excel_row: int
    management_no: str
    spend_amount: int
    original: Dict[str, Any]
    mapping: Optional[BudgetMapping] = None

    @property
    def budget_code(self) -> str:
        return self.mapping.budget_code if self.mapping else ""

    @property
    def budget_name(self) -> str:
        return self.mapping.budget_name if self.mapping else ""


@dataclass
class Job:
    job_id: str
    job_type: str  # budget / fee
    scope: str     # domestic / overseas / common
    budget_code: str
    budget_name: str
    description: str
    amount: int
    item_count: int
    management_numbers: List[str]
    pdf_relpath: str
    xlsx_relpath: str
    folder_relpath: str
    status: str = "pending"
    portal: Optional[Dict[str, Any]] = None
    portal_result: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ===== discover =====
def _one(files: List[Path], *, contains: Iterable[str], suffix: str) -> Path:
    matches = [p for p in files if p.suffix.lower() == suffix and all(x in p.name for x in contains) and "_지출예산 구분" not in p.name and "수수료" not in p.name]
    if len(matches) != 1:
        raise FileNotFoundError(f"조건 {list(contains)} / {suffix} 에 해당하는 파일이 1개여야 합니다. 발견: {matches}")
    return matches[0]


def mapping_file_kind(path: Path) -> Optional[str]:
    """Classify a research/technology-group budget survey workbook by filename.

    Known real filenames differ by quarter:
      - 2026 Q1 research: ...연차유지 지출(연구부서 유지 의사 확인 건).xlsx
      - 2026 Q1 tech:     ...연차유지 지출(기술사업화그룹 납부 대상).xlsx
      - 2026 Q2 research: ...연차유지 지출(연구부서 납부).xlsx
      - 2026 Q2 tech:     ...연차유지 지출(기술사업화그룹).xlsx

    Therefore do NOT require the word '납부'.  The stable discriminators are
    '연차유지' + '연구부서' or '기술사업화그룹'.
    """
    if path.suffix.lower() != ".xlsx":
        return None
    name = path.name
    if "E0259-INV" in name or "수수료" in name or "과제 " in name:
        return None
    # Topic token: quarter naming varies — '연차유지'(2026 Q1/Q2), '연차관리'
    # (2025Q4 통합 목록), and shorthand like '(연구부서납부 특허)' /
    # '(기술사업화납부 특허)'.  '연차' covers the first two; '특허' covers the
    # shorthand.  Generated outputs are already excluded above ('과제 ',
    # 'E0259-INV', '수수료'), so this stays unambiguous.
    if "연차" not in name and "특허" not in name:
        return None
    if "연구부서" in name:
        return "research"
    # '기술사업화그룹' 또는 '기술사업화납부' 등 '그룹' 없는 표기도 인식한다.
    if "기술사업화" in name:
        return "tech"
    return None


def classify_current_files(files: Iterable[Path]) -> Dict[str, List[Path]]:
    """Classify current-quarter input files without enforcing cardinality.

    This is intentionally the single discovery rule shared by CLI/workflow and GUI.
    Keeping the GUI from duplicating filename heuristics prevents future format changes
    from being fixed in one entry point but missed in the other.
    """
    items = [Path(p) for p in files if Path(p).is_file()]
    out: Dict[str, List[Path]] = {
        "domestic_pdf": [],
        "domestic_xlsx": [],
        "overseas_pdf": [],
        "overseas_xlsx": [],
        "research_xlsx": [],
        "tech_xlsx": [],
    }
    for p in items:
        name = p.name
        if "_지출예산 구분" not in name and "수수료" not in name and "E0259-INV" in name:
            if "국내" in name and p.suffix.lower() == ".pdf":
                out["domestic_pdf"].append(p)
            if "국내" in name and p.suffix.lower() == ".xlsx":
                out["domestic_xlsx"].append(p)
            if "해외" in name and p.suffix.lower() == ".pdf":
                out["overseas_pdf"].append(p)
            if "해외" in name and p.suffix.lower() == ".xlsx":
                out["overseas_xlsx"].append(p)
        kind = mapping_file_kind(p)
        if kind == "research":
            out["research_xlsx"].append(p)
        elif kind == "tech":
            out["tech_xlsx"].append(p)
    return out


def _one_mapping(files: List[Path], kind: str) -> Path:
    matches = [p for p in files if mapping_file_kind(p) == kind]
    if len(matches) != 1:
        raise FileNotFoundError(f"{kind} 연차유지 조사 XLSX가 1개여야 합니다. 발견: {matches}")
    return matches[0]


def discover_inputs(input_dir: Path, history_dir: Path | None = None) -> InputFiles:
    files = [p for p in input_dir.iterdir() if p.is_file()]
    classified = classify_current_files(files)

    def exactly_one(key: str, label: str) -> Path:
        matches = classified[key]
        if len(matches) != 1:
            raise FileNotFoundError(f"{label}가 1개여야 합니다. 발견: {matches}")
        return matches[0]

    domestic_pdf = exactly_one("domestic_pdf", "마크프로 국내 PDF")
    domestic_xlsx = exactly_one("domestic_xlsx", "마크프로 국내 XLSX")
    overseas_pdf = exactly_one("overseas_pdf", "마크프로 해외 PDF")
    overseas_xlsx = exactly_one("overseas_xlsx", "마크프로 해외 XLSX")
    research_xlsx = exactly_one("research_xlsx", "연구부서 연차유지 조사 XLSX")
    tech_xlsx = exactly_one("tech_xlsx", "기술사업화그룹 연차유지 조사 XLSX")

    history_files: List[Path] = []
    if history_dir and history_dir.exists():
        # Only keep actual survey workbooks.  A history folder may contain old
        # generated per-budget XLSX files, fee evidence, or processed invoices;
        # those must never participate in budget resolution.
        history_files = sorted(
            [p for p in history_dir.rglob("*.xlsx") if p.is_file() and mapping_file_kind(p)],
            key=lambda p: p.name,
        )

    return InputFiles(
        domestic_pdf=domestic_pdf,
        domestic_xlsx=domestic_xlsx,
        overseas_pdf=overseas_pdf,
        overseas_xlsx=overseas_xlsx,
        research_xlsx=research_xlsx,
        tech_xlsx=tech_xlsx,
        history_files=history_files,
    )
