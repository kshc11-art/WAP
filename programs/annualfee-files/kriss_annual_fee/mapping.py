from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .core import mapping_file_kind
from .core import BudgetMapping, InvoiceItem
from .core import as_int, norm_code, norm_header, norm_management, period_key_from_name


PREP_BUDGET_NAME = "지식재산권준비금"

# The technology-transfer-group reserve budget code is YEAR-DEPENDENT.
# Verified against real packages:
#   2025 golden (2025Q4): 25841004 / 지식재산권준비금
#   2026 golden (2026Q1/Q2): 26841001 / 지식재산권준비금
# There is NO derivable numeric pattern (25841004 vs 26841001), so unknown
# years must fail loudly instead of guessing.  Extend this table (or provide
# the value via a budget master input) when a new year is confirmed.
PREP_BUDGET_CODES_BY_YEAR: Dict[int, str] = {
    2025: "25841004",
    2026: "26841001",
}
# Backward-compatible default (2026) for legacy callers that cannot pass a year.
PREP_BUDGET_CODE = PREP_BUDGET_CODES_BY_YEAR[2026]


def prep_budget_code(year: Optional[int]) -> str:
    """Reserve budget code for the invoice year.  Fails loudly on unknown years."""
    if year is None:
        return PREP_BUDGET_CODE
    try:
        return PREP_BUDGET_CODES_BY_YEAR[year]
    except KeyError:
        known = ", ".join(f"{y}={c}" for y, c in sorted(PREP_BUDGET_CODES_BY_YEAR.items()))
        raise ValueError(
            f"{year}년 지식재산권준비금 예산코드가 확인되지 않았습니다 (확인된 값: {known}). "
            "mapping.PREP_BUDGET_CODES_BY_YEAR에 확인된 코드를 추가하거나 budget master 입력으로 제공하세요."
        )


def _header_index(headers: List[str], aliases: Iterable[str]) -> Optional[int]:
    normed = {norm_header(h): i for i, h in enumerate(headers)}
    for alias in aliases:
        key = norm_header(alias)
        if key in normed:
            return normed[key]
    return None


def _period_label(name: str) -> str:
    y, q = period_key_from_name(name)
    return f"{y}Q{q}" if y and q else "unknown"


def parse_research_records(
    headers: List[str], rows: List[List[Any]], source: Path, source_kind: str,
    source_period: Optional[str] = None,
) -> Tuple[Dict[str, BudgetMapping], Dict[str, Dict[str, Any]]]:
    """Return (assigned mappings, explicitly-present-but-unassigned records).

    A research workbook can contain a management number while the budget cells
    are still blank.  Golden 2026Q1 contains exactly such a case (P190081KR).
    Presence with blank budget is semantically different from absence and must
    NOT silently fall back to an older quarter, because that could resurrect a
    stale budget after the current-period survey intentionally left it pending.
    """
    mi = _header_index(headers, ["관리번호", "고객관리번호"])
    ci = _header_index(headers, ["사용예산코드", "예산코드"])
    ni = _header_index(headers, ["사용예산명", "예산명"])
    if mi is None:
        return {}, {}

    assigned: Dict[str, BudgetMapping] = {}
    unassigned: Dict[str, Dict[str, Any]] = {}
    for excel_row, row in enumerate(rows, start=2):
        if mi >= len(row):
            continue
        mgmt = norm_management(row[mi])
        if not mgmt:
            continue
        code = norm_code(row[ci]) if ci is not None and ci < len(row) else ""
        name = str(row[ni]).strip() if ni is not None and ni < len(row) and row[ni] is not None else ""
        if code and name:
            assigned[mgmt] = BudgetMapping(
                management_no=mgmt,
                budget_code=code,
                budget_name=name,
                source_file=str(source),
                source_kind=source_kind,
                source_period=source_period or _period_label(source.name),
            )
        else:
            unassigned[mgmt] = {
                "management_no": mgmt,
                "source_file": str(source),
                "source_kind": source_kind,
                "source_period": source_period or _period_label(source.name),
                "excel_row": excel_row,
                "reason": "research_record_present_but_budget_blank",
                "budget_code": code,
                "budget_name": name,
            }
    return assigned, unassigned


def parse_research_mapping(
    headers: List[str], rows: List[List[Any]], source: Path, source_kind: str,
    source_period: Optional[str] = None,
) -> Dict[str, BudgetMapping]:
    """Compatibility helper: assigned research mappings only."""
    return parse_research_records(headers, rows, source, source_kind, source_period=source_period)[0]


def parse_tech_mapping(
    headers: List[str], rows: List[List[Any]], source: Path, source_kind: str,
    year: Optional[int] = None, source_period: Optional[str] = None,
) -> Dict[str, BudgetMapping]:
    mi = _header_index(headers, ["관리번호", "고객관리번호"])
    if mi is None:
        return {}
    code = prep_budget_code(year)
    out: Dict[str, BudgetMapping] = {}
    for row in rows:
        if mi >= len(row):
            continue
        mgmt = norm_management(row[mi])
        if not mgmt:
            continue
        out[mgmt] = BudgetMapping(
            management_no=mgmt,
            budget_code=code,
            budget_name=PREP_BUDGET_NAME,
            source_file=str(source),
            source_kind=source_kind,
            source_period=source_period or _period_label(source.name),
        )
    return out


def parse_budget_master(headers: List[str], rows: List[List[Any]], source: Path) -> Dict[str, BudgetMapping]:
    """Parse a user-confirmed budget master workbook.

    This is the formalised input for budgets that are NOT derivable from the
    six quarter inputs: externally confirmed assignments (research rows with
    blank budgets, numbers absent from every survey) and post-hoc budget
    replacements of the P190141KR class.  Columns are found by header name:
      관리번호 / 고객관리번호, 예산코드 / 사용예산코드, 예산명 / 사용예산명
    Rows with a blank code or name are skipped (a master never blocks).
    """
    mi = _header_index(headers, ["관리번호", "고객관리번호"])
    ci = _header_index(headers, ["예산코드", "사용예산코드"])
    ni = _header_index(headers, ["예산명", "사용예산명"])
    if mi is None or ci is None or ni is None:
        raise ValueError(
            f"budget master에 필수 헤더(관리번호, 예산코드, 예산명)가 없습니다: {source}"
        )
    out: Dict[str, BudgetMapping] = {}
    for row in rows:
        if mi >= len(row):
            continue
        mgmt = norm_management(row[mi])
        if not mgmt:
            continue
        code = norm_code(row[ci]) if ci < len(row) else ""
        name = str(row[ni]).strip() if ni < len(row) and row[ni] is not None else ""
        if not code or not name or code.upper() in ("#N/A", "0") or name in ("#N/A", "0"):
            continue
        out[mgmt] = BudgetMapping(
            management_no=mgmt,
            budget_code=code,
            budget_name=name,
            source_file=str(source),
            source_kind="budget_master",
            source_period=_period_label(source.name),
        )
    return out


def build_mapping(
    excel,
    current_research: Path,
    current_tech: Path,
    history_files: List[Path],
    master_files: Optional[List[Path]] = None,
    year: Optional[int] = None,
    current_period: Optional[Tuple[int, int]] = None,
) -> Tuple[Dict[str, BudgetMapping], List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """Resolve management number -> budget.

    Resolution rules (authoritative order):
      0. budget master rows (user-confirmed external assignments/corrections)
         override everything, including explicit-unassigned blocks
      1. current-period research record with nonblank budget
      2. current-period technology-group record -> 준비금 (연도별 코드,
         prep_budget_code 참조)
      3. only if management number is ABSENT from current-period files, search
         previous periods newest-to-oldest using the same research/tech rules
      4. a research record present with blank budget is a blocker, not absence;
         do not fall back past it (a master row, however, resolves it)

    Returns:
      mapping: resolved mappings
      conflicts: duplicate research/tech membership requiring human review
      blocked_unassigned: explicit research records whose budget is blank
    """
    master: Dict[str, BudgetMapping] = {}
    for path in sorted(master_files or [], key=lambda p: p.name):
        mh, mr = excel.read_used_range(path)
        parsed = parse_budget_master(mh, mr, path)
        for mgmt, mp in parsed.items():
            if mgmt in master and (master[mgmt].budget_code, master[mgmt].budget_name) != (mp.budget_code, mp.budget_name):
                raise ValueError(
                    f"budget master 간 충돌: {mgmt} -> "
                    f"{master[mgmt].budget_code}/{master[mgmt].budget_name} ({master[mgmt].source_file}) vs "
                    f"{mp.budget_code}/{mp.budget_name} ({mp.source_file})"
                )
            master[mgmt] = mp

    rh, rr = excel.read_used_range(current_research)
    th, tr = excel.read_used_range(current_tech)
    current_period = current_period or period_key_from_name(current_research.name)
    current_period_label = (
        f"{current_period[0]}Q{current_period[1]}" if current_period != (0, 0) else "unknown"
    )
    current_r, current_r_blank = parse_research_records(
        rh, rr, current_research, "current_research", source_period=current_period_label
    )
    current_t = parse_tech_mapping(
        th, tr, current_tech, "current_tech", year=year, source_period=current_period_label
    )

    current_research_present = set(current_r) | set(current_r_blank)
    conflicts: List[Dict[str, Any]] = []
    for mgmt in sorted(current_research_present & set(current_t)):
        conflicts.append({
            "management_no": mgmt,
            "reason": "current_research_and_tech_both_present",
            "research": current_r.get(mgmt).__dict__ if mgmt in current_r else current_r_blank.get(mgmt),
            "tech": current_t[mgmt].__dict__,
        })

    result: Dict[str, BudgetMapping] = dict(current_r)
    blocked: Dict[str, Dict[str, Any]] = dict(current_r_blank)
    for mgmt, mapping in current_t.items():
        if mgmt not in current_research_present:
            result[mgmt] = mapping

    # Budget master overrides survey-derived values and resolves explicit
    # blanks: a master row is a user-confirmed final assignment.
    for mgmt, mp in master.items():
        result[mgmt] = mp
        blocked.pop(mgmt, None)

    # Build history by period.  Newest *prior* period wins.  A blank research
    # record in the newest occurrence blocks older stale values.
    #
    # Important: history folders often accumulate copies of the current quarter
    # (or even future-quarter drafts).  Those must not be allowed to resolve a
    # management number that is absent from the authoritative current input.
    # Only periods strictly older than the invoice-derived current period are used.
    by_period: Dict[Tuple[int, int], Dict[str, List[Path]]] = defaultdict(lambda: {"research": [], "tech": []})
    for path in history_files:
        kind = mapping_file_kind(path)
        if not kind:
            continue
        period = period_key_from_name(path.name)
        if period != (0, 0) and current_period != (0, 0) and period >= current_period:
            continue
        # Unknown-period history is deliberately retained as the oldest/last
        # fallback.  Its source_period is reported as 'unknown' in the audit.
        by_period[period][kind].append(path)

    for period in sorted(by_period.keys(), reverse=True):
        research_assigned: Dict[str, BudgetMapping] = {}
        research_blank: Dict[str, Dict[str, Any]] = {}
        tech_assigned: Dict[str, BudgetMapping] = {}

        for path in sorted(by_period[period]["research"], key=lambda p: p.name):
            hh, hr = excel.read_used_range(path)
            pa, pb = parse_research_records(hh, hr, path, "history_research")
            research_assigned.update(pa)
            research_blank.update(pb)
        for path in sorted(by_period[period]["tech"], key=lambda p: p.name):
            hh, hr = excel.read_used_range(path)
            tech_assigned.update(parse_tech_mapping(hh, hr, path, "history_tech", year=year))

        research_present = set(research_assigned) | set(research_blank)
        for mgmt in sorted(research_present & set(tech_assigned)):
            # Only report a history conflict if the number has not already been
            # resolved/blocked by a newer or current period.
            if mgmt not in result and mgmt not in blocked:
                conflicts.append({
                    "management_no": mgmt,
                    "reason": "history_research_and_tech_both_present",
                    "period": f"{period[0]}Q{period[1]}" if period != (0, 0) else "unknown",
                    "research": research_assigned.get(mgmt).__dict__ if mgmt in research_assigned else research_blank.get(mgmt),
                    "tech": tech_assigned[mgmt].__dict__,
                })

        # Research presence has priority within a period; blank is a blocker.
        for mgmt, mapping in research_assigned.items():
            if mgmt not in result and mgmt not in blocked:
                result[mgmt] = mapping
        for mgmt, meta in research_blank.items():
            if mgmt not in result and mgmt not in blocked:
                blocked[mgmt] = meta
        for mgmt, mapping in tech_assigned.items():
            if mgmt not in result and mgmt not in blocked and mgmt not in research_present:
                result[mgmt] = mapping

    return result, conflicts, blocked


def parse_invoice(headers: List[str], rows: List[List[Any]], scope: str) -> List[InvoiceItem]:
    hmap = {norm_header(h): i for i, h in enumerate(headers)}
    mi = hmap.get(norm_header("고객관리번호"))
    if mi is None:
        raise KeyError("청구 XLSX에 고객관리번호 열이 없습니다.")
    amount_label = "현지비용(KRW)"
    ai = hmap.get(norm_header(amount_label))
    if ai is None:
        raise KeyError(f"청구 XLSX에 {amount_label} 열이 없습니다.")

    items: List[InvoiceItem] = []
    for offset, row in enumerate(rows, start=2):
        if mi >= len(row):
            continue
        mgmt = norm_management(row[mi])
        if not mgmt:
            continue  # total row
        original: Dict[str, Any] = {}
        for i, h in enumerate(headers):
            if h and i < len(row):
                original[str(h)] = row[i]
        items.append(
            InvoiceItem(
                scope=scope,
                excel_row=offset,
                management_no=mgmt,
                spend_amount=as_int(row[ai] if ai < len(row) else 0),
                original=original,
            )
        )
    return items


def apply_mapping(items: List[InvoiceItem], mapping: Dict[str, BudgetMapping]) -> Tuple[List[InvoiceItem], List[InvoiceItem]]:
    mapped: List[InvoiceItem] = []
    missing: List[InvoiceItem] = []
    for item in items:
        item.mapping = mapping.get(item.management_no)
        if item.mapping:
            mapped.append(item)
        else:
            missing.append(item)
    return mapped, missing
