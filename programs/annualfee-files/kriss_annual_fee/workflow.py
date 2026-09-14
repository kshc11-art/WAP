from __future__ import annotations

import json
import shutil
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable, Dict, List, Tuple

from .core import discover_inputs
from .xlsx_ooxml import XlsxSession
from .excel_backend import backend_environment, open_output_session
from .mapping import apply_mapping, build_mapping, parse_invoice, prep_budget_code
from .core import InvoiceItem, Job
from .pdf_mark import mark_budget_pdf, mark_fee_pdf, normalize_pdf_source
from .portal_contract import PORTAL_CONTRACT_VERSION, annual_portal_payload, fee_portal_payload
from .core import (
    as_int,
    copy_file,
    ensure_empty_dir,
    infer_year_quarter,
    norm_header,
    safe_filename,
    sha256,
    write_csv,
    write_json,
)

ProgressCallback = Callable[[str, int, str], None]

# v0.6.6 operational layout.  The business folders and Tampermonkey support
# folder are intentionally visible directly under the quarter result folder.
FEE_DIR_NAME = "2. 수수료 납부"
ANNUAL_DIR_NAME = "3. 연차유지료 납부"
AUTOMATION_DIR_NAME = "템퍼몽키용"


def result_dir_name(year: int, quarter: int) -> str:
    return f"{year}년 {quarter}분기 연차관리"


def automation_dir_for(run_dir: Path) -> Path:
    """Return the automation/manifest directory for new and legacy run layouts."""
    new_dir = run_dir / AUTOMATION_DIR_NAME
    if new_dir.exists() or not (run_dir / "_automation").exists():
        return new_dir
    return run_dir / "_automation"


def package_dir_for(run_dir: Path) -> Path:
    """Return the business-file root for new and legacy run layouts."""
    legacy = run_dir / "package"
    if legacy.exists():
        return legacy
    return run_dir


def _emit(cb: ProgressCallback | None, stage: str, percent: int, detail: str = "") -> None:
    if cb:
        cb(stage, max(0, min(100, int(percent))), detail)


def _invoice_description(year: int, quarter: int, scope: str, budget_name: str, profile: str = "q2-current") -> str:
    legacy = profile == "q1-legacy"
    if scope == "domestic":
        sep = "" if legacy else " "
        return f"{year}년 {quarter}분기({budget_name}){sep}과제 국내특허 연차유지료"
    sep = " " if legacy else ""
    return f"{year}년 {quarter}분기({budget_name}){sep}과제 해외특허 연차유지료"


def _mapped_dict(item: InvoiceItem, year: int, quarter: int, profile: str) -> Dict[str, Any]:
    assert item.mapping
    return {
        "excel_row": item.excel_row,
        "management_no": item.management_no,
        "spend_amount": item.spend_amount,
        "budget_code": item.mapping.budget_code,
        "budget_name": item.mapping.budget_name,
        "description": _invoice_description(year, quarter, item.scope, item.mapping.budget_name, profile),
        "mapping_source": item.mapping.source_file,
        "mapping_source_kind": item.mapping.source_kind,
        "mapping_source_period": item.mapping.source_period,
    }


def _group_items(mapped: List[InvoiceItem]) -> Dict[Tuple[str, str], List[InvoiceItem]]:
    groups: Dict[Tuple[str, str], List[InvoiceItem]] = defaultdict(list)
    for item in mapped:
        assert item.mapping
        groups[(item.mapping.budget_code, item.mapping.budget_name)].append(item)
    return groups


def _header_map(headers: List[str]) -> Dict[str, int]:
    return {norm_header(h): i for i, h in enumerate(headers)}


def _original_value(item: InvoiceItem, *aliases: str) -> str:
    normalized = {norm_header(k): v for k, v in item.original.items()}
    for alias in aliases:
        value = normalized.get(norm_header(alias))
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _item_detail(item: InvoiceItem) -> Dict[str, Any]:
    return {
        "scope": item.scope,
        "scope_label": "국내" if item.scope == "domestic" else "해외",
        "excel_row": item.excel_row,
        "management_no": item.management_no,
        "amount": item.spend_amount,
        "application_no": _original_value(item, "출원번호"),
        "registration_no": _original_value(item, "등록번호"),
        "title": _original_value(item, "발명의명칭"),
    }


def _item_detail_line(item: InvoiceItem) -> str:
    d = _item_detail(item)
    identifiers = []
    if d["registration_no"]:
        identifiers.append(f"등록 {d['registration_no']}")
    if d["application_no"]:
        identifiers.append(f"출원 {d['application_no']}")
    ident = " / ".join(identifiers) or "등록/출원번호 없음"
    title = str(d["title"] or "").replace("\n", " ").strip()
    if len(title) > 70:
        title = title[:67] + "..."
    return (
        f"- {d['scope_label']} | 관리번호 {d['management_no']} | 청구 Excel {d['excel_row']}행 | "
        f"{d['amount']:,}원 | {ident}" + (f" | {title}" if title else "")
    )


def _unresolved_message(title: str, items: List[InvoiceItem], csv_path: Path, remedy: str) -> str:
    preview = "\n".join(_item_detail_line(x) for x in items[:12])
    more = f"\n- ... 외 {len(items)-12}건" if len(items) > 12 else ""
    return (
        f"{title} {len(items)}건이 있습니다.\n\n{preview}{more}\n\n"
        f"조치: {remedy}\n상세 CSV: {csv_path}"
    )


def _fee_totals(headers: List[str], rows: List[List[Any]], scope: str) -> Dict[str, int]:
    h = _header_map(headers)
    last = rows[-1] if rows else []

    def value(label: str) -> int:
        i = h.get(norm_header(label))
        return as_int(last[i]) if i is not None and i < len(last) else 0

    if scope == "domestic":
        return {"service": value("당사수수료(KRW)"), "vat": value("부가세"), "wire": 0}
    return {
        "service": value("당사수수료(KRW)"),
        "vat": value("부가세"),
        "wire": value("송금수수료"),
    }


def _discover_master_files(budget_master: Path | None) -> list[Path]:
    if not budget_master:
        return []
    if budget_master.is_dir():
        return sorted(p for p in budget_master.rglob("*.xlsx") if p.is_file())
    return [budget_master]


def _archive_mapping_inputs(auto_dir: Path, state: Dict[str, Any]) -> Dict[str, str]:
    """Archive every XLSX that can influence budget resolution.

    GUI mode stages user files in a temporary directory which is deleted after
    prepare.  Without an archive, mapping_audit.csv may therefore point at a
    path that no longer exists.  v0.6 keeps byte-identical copies plus SHA-256
    metadata under _automation/source_inputs and returns a source->archive map
    used by the audit CSV.
    """
    inputs = state["inputs"]
    year, quarter = state["year"], state["quarter"]
    records: List[Dict[str, Any]] = []
    lookup: Dict[str, str] = {}
    archive_root = auto_dir / "source_inputs"

    specs: List[Tuple[str, Path, str]] = [
        ("current_research", inputs.research_xlsx, f"{year}Q{quarter}"),
        ("current_tech", inputs.tech_xlsx, f"{year}Q{quarter}"),
    ]
    specs.extend(("history", p, "") for p in inputs.history_files)
    specs.extend(("budget_master", p, "") for p in state.get("master_files", []))

    seen: set[str] = set()
    for role, source, forced_period in specs:
        digest = sha256(source)
        base = source.name
        key = f"{role}/{base}"
        if key in seen:
            base = f"{digest[:10]}_{base}"
            key = f"{role}/{base}"
        seen.add(key)
        rel = Path("source_inputs") / role / base
        dst = auto_dir / rel
        copy_file(source, dst)
        lookup[str(source)] = rel.as_posix()
        try:
            lookup[str(source.resolve())] = rel.as_posix()
        except Exception:
            pass
        records.append({
            "role": role,
            "source_path": str(source),
            "file_name": source.name,
            "bytes": source.stat().st_size,
            "sha256": digest,
            "source_period": forced_period,
            "archived_relpath": rel.as_posix(),
        })

    write_json(auto_dir / "input_provenance.json", {
        "schema_version": 1,
        "invoice_period": f"{year}Q{quarter}",
        "mapping_inputs": records,
    })
    return lookup


def _load_state(input_dir: Path, history_dir: Path | None = None, budget_master: Path | None = None) -> Dict[str, Any]:
    inputs = discover_inputs(input_dir, history_dir)
    year, quarter = infer_year_quarter(inputs.domestic_xlsx.name)
    excel = XlsxSession()
    master_files = _discover_master_files(budget_master)
    mapping, conflicts, blocked_unassigned = build_mapping(
        excel, inputs.research_xlsx, inputs.tech_xlsx, inputs.history_files,
        master_files=master_files, year=year, current_period=(year, quarter),
    )
    dh, dr = excel.read_used_range(inputs.domestic_xlsx)
    oh, orows = excel.read_used_range(inputs.overseas_xlsx)
    domestic = parse_invoice(dh, dr, "domestic")
    overseas = parse_invoice(oh, orows, "overseas")
    dom_mapped, dom_unresolved = apply_mapping(domestic, mapping)
    ov_mapped, ov_unresolved = apply_mapping(overseas, mapping)
    unresolved = dom_unresolved + ov_unresolved
    explicit_unassigned = [x for x in unresolved if x.management_no in blocked_unassigned]
    missing = [x for x in unresolved if x.management_no not in blocked_unassigned]
    return {
        "inputs": inputs,
        "year": year,
        "quarter": quarter,
        "excel": excel,
        "mapping": mapping,
        "master_files": master_files,
        "conflicts": conflicts,
        "blocked_unassigned": blocked_unassigned,
        "dh": dh,
        "dr": dr,
        "oh": oh,
        "orows": orows,
        "domestic": domestic,
        "overseas": overseas,
        "dom_mapped": dom_mapped,
        "ov_mapped": ov_mapped,
        "explicit_unassigned": explicit_unassigned,
        "missing": missing,
    }


def preflight(input_dir: Path, history_dir: Path | None = None, budget_master: Path | None = None) -> Dict[str, Any]:
    """Analyze all mapping/amount invariants without creating business output."""
    s = _load_state(input_dir, history_dir, budget_master)
    dom_mapped: List[InvoiceItem] = s["dom_mapped"]
    ov_mapped: List[InvoiceItem] = s["ov_mapped"]
    domestic: List[InvoiceItem] = s["domestic"]
    overseas: List[InvoiceItem] = s["overseas"]
    explicit: List[InvoiceItem] = s["explicit_unassigned"]
    missing: List[InvoiceItem] = s["missing"]
    dom_fee = _fee_totals(s["dh"], s["dr"], "domestic")
    ov_fee = _fee_totals(s["oh"], s["orows"], "overseas")

    source_counts: Dict[str, int] = defaultdict(int)
    history_numbers: List[str] = []
    for item in dom_mapped + ov_mapped:
        if item.mapping:
            label = item.mapping.source_kind
            if item.mapping.source_period:
                label += f"_{item.mapping.source_period}"
            source_counts[label] += 1
            if item.mapping.source_kind.startswith("history"):
                history_numbers.append(item.management_no)

    return {
        "year": s["year"],
        "quarter": s["quarter"],
        "conflicts": s["conflicts"],
        "domestic": {
            "invoice_items": len(domestic),
            "mapped": len(dom_mapped),
            "groups": len(_group_items(dom_mapped)),
            "invoice_spend_total": sum(x.spend_amount for x in domestic),
            "assigned_spend_total": sum(x.spend_amount for x in dom_mapped),
        },
        "overseas": {
            "invoice_items": len(overseas),
            "mapped": len(ov_mapped),
            "groups": len(_group_items(ov_mapped)),
            "invoice_spend_total": sum(x.spend_amount for x in overseas),
            "assigned_spend_total": sum(x.spend_amount for x in ov_mapped),
        },
        "explicit_unassigned": [_item_detail(x) for x in explicit],
        "missing": [_item_detail(x) for x in missing],
        "mapping_source_counts": dict(sorted(source_counts.items())),
        "history_management_numbers": sorted(history_numbers),
        "fees": {"domestic": dom_fee, "overseas": ov_fee},
        "budget_master_files": [str(p) for p in s["master_files"]],
        "budget_master_count": len(s["master_files"]),
        "excel_output_environment": backend_environment(),
        "ready": not s["conflicts"] and not explicit and not missing,
    }


def prepare(
    input_dir: Path,
    output_dir: Path,
    history_dir: Path | None = None,
    allow_missing: bool = False,
    allow_unassigned: bool = False,
    *,
    budget_master: Path | None = None,
    profile: str = "q2-current",
    excel_backend: str = "auto",
    excel_visible: bool = False,
    excel_validate_reopen: bool = True,
    progress: ProgressCallback | None = None,
) -> Path:
    _emit(progress, "scan", 2, "입력 파일을 검사합니다.")
    s = _load_state(input_dir, history_dir, budget_master)
    inputs = s["inputs"]
    year, quarter = s["year"], s["quarter"]
    excel_reader: XlsxSession = s["excel"]
    conflicts = s["conflicts"]
    blocked_unassigned = s["blocked_unassigned"]
    dh, dr, oh, orows = s["dh"], s["dr"], s["oh"], s["orows"]
    domestic: List[InvoiceItem] = s["domestic"]
    overseas: List[InvoiceItem] = s["overseas"]
    dom_mapped: List[InvoiceItem] = s["dom_mapped"]
    ov_mapped: List[InvoiceItem] = s["ov_mapped"]
    explicit_unassigned: List[InvoiceItem] = s["explicit_unassigned"]
    missing: List[InvoiceItem] = s["missing"]

    run_dir = output_dir / result_dir_name(year, quarter)
    # v0.6.6: no extra ``package`` wrapper.  These three folders are visible
    # immediately under the quarter result directory:
    #   2. 수수료 납부 / 3. 연차유지료 납부 / 템퍼몽키용
    package_dir = run_dir
    auto_dir = run_dir / AUTOMATION_DIR_NAME
    ensure_empty_dir(run_dir)
    auto_dir.mkdir(parents=True, exist_ok=True)
    source_archive_lookup = _archive_mapping_inputs(auto_dir, s)
    # Put the matching userscript beside manifest/validation for easier handoff.
    package_root = Path(__file__).resolve().parents[1]
    userscripts = (
        package_root.parent.parent / "scripts" / "annualfee-expense.user.js",
        package_root / "tampermonkey" / "kriss_portal_automation.user.js",
    )
    userscript = next((p for p in userscripts if p.is_file()), None)
    if userscript is not None:
        copy_file(userscript, auto_dir / "kriss_portal_automation.user.js")

    _emit(progress, "pdf-preflight", 5, "PDF 무결성을 검사하고 필요한 경우 내부 정규화본을 준비합니다.")
    normalized_root = auto_dir / "normalized_sources"
    dom_pdf_health = normalize_pdf_source(
        inputs.domestic_pdf, normalized_root / safe_filename(inputs.domestic_pdf.name)
    )
    ov_pdf_health = normalize_pdf_source(
        inputs.overseas_pdf, normalized_root / safe_filename(inputs.overseas_pdf.name)
    )
    pdf_preflight = {"domestic": dom_pdf_health, "overseas": ov_pdf_health}
    write_json(auto_dir / "pdf_preflight.json", pdf_preflight)
    active_pdf = {
        "domestic": Path(dom_pdf_health["active_source"]),
        "overseas": Path(ov_pdf_health["active_source"]),
    }

    _emit(progress, "mapping", 8, f"국내 {len(domestic)}건 / 해외 {len(overseas)}건 예산을 매핑했습니다.")
    if conflicts:
        write_json(auto_dir / "mapping_conflicts.json", conflicts)
        raise RuntimeError(f"예산 매핑 충돌 {len(conflicts)}건. mapping_conflicts.json 확인 필요")

    # Audit before business output.
    audit_rows = []
    for item in domestic + overseas:
        m = item.mapping
        blocked = blocked_unassigned.get(item.management_no)
        if m:
            status = "RESOLVED"
            source_kind = m.source_kind
            source_period = m.source_period or ""
            source_file = m.source_file
            budget_code = m.budget_code
            budget_name = m.budget_name
        elif blocked:
            status = "EXPLICIT_UNASSIGNED"
            source_kind = blocked.get("source_kind", "research_unassigned")
            source_period = blocked.get("source_period", "")
            source_file = blocked.get("source_file", "")
            budget_code = budget_name = ""
        else:
            status = source_kind = "MISSING"
            source_period = source_file = budget_code = budget_name = ""
        archived_source = source_archive_lookup.get(source_file, "")
        audit_rows.append([
            item.scope, item.excel_row, item.management_no, item.spend_amount,
            status, budget_code, budget_name, source_kind, source_period, source_file, archived_source,
        ])
    write_csv(
        auto_dir / "mapping_audit.csv",
        ["scope", "excel_row", "management_no", "spend_amount", "status", "budget_code", "budget_name", "mapping_source_kind", "mapping_source_period", "mapping_source_file", "mapping_source_archived"],
        audit_rows,
    )

    if explicit_unassigned:
        unassigned_csv = auto_dir / "unassigned_mappings.csv"
        write_csv(
            unassigned_csv,
            ["scope", "excel_row", "management_no", "spend_amount", "application_no", "registration_no", "title", "source_period", "source_file", "reason"],
            [[
                x.scope, x.excel_row, x.management_no, x.spend_amount,
                _item_detail(x)["application_no"], _item_detail(x)["registration_no"], _item_detail(x)["title"],
                blocked_unassigned[x.management_no].get("source_period", ""),
                blocked_unassigned[x.management_no].get("source_file", ""),
                blocked_unassigned[x.management_no].get("reason", ""),
            ] for x in explicit_unassigned],
        )
        if not allow_unassigned:
            raise RuntimeError(_unresolved_message(
                "조사파일에는 있지만 예산코드/예산명이 비어 있는 관리번호",
                explicit_unassigned,
                unassigned_csv,
                "현재분기 연구부서 조사자료의 해당 관리번호 행에서 예산코드/예산명을 확인하거나, 확정 예산 master를 추가하세요.",
            ))

    if missing:
        missing_csv = auto_dir / "missing_mappings.csv"
        write_csv(
            missing_csv,
            ["scope", "excel_row", "management_no", "spend_amount", "application_no", "registration_no", "title"],
            [[
                x.scope, x.excel_row, x.management_no, x.spend_amount,
                _item_detail(x)["application_no"], _item_detail(x)["registration_no"], _item_detail(x)["title"],
            ] for x in missing],
        )
        if not allow_missing:
            raise RuntimeError(_unresolved_message(
                "현재/과거 조사파일 어디에도 찾을 수 없는 관리번호",
                missing,
                missing_csv,
                "관리번호 오탈자를 확인하고, 이전 분기에 조사된 건이면 과거 분기 조사 XLSX를 추가하세요. 외부 확정 건이면 확정 예산 master를 추가하세요.",
            ))

    _emit(progress, "copy", 12, "원본 자료를 패키지에 복사합니다.")
    markpro = package_dir / ANNUAL_DIR_NAME / "0. 마크프로 청구"
    for p in [inputs.domestic_pdf, inputs.domestic_xlsx, inputs.overseas_pdf, inputs.overseas_xlsx]:
        copy_file(p, markpro / p.name)
    root_annual = package_dir / ANNUAL_DIR_NAME
    copy_file(inputs.research_xlsx, root_annual / inputs.research_xlsx.name)
    copy_file(inputs.tech_xlsx, root_annual / inputs.tech_xlsx.name)

    _emit(progress, "excel", 14, "Microsoft Excel Native 출력 엔진을 시작합니다.")
    try:
        excel = open_output_session(
            excel_backend, visible=excel_visible, validate_reopen=excel_validate_reopen
        )
    except Exception:
        # Do not leave a package that looks usable when the operational Excel backend
        # was unavailable. Mapping/preflight artifacts are reproducible via `check`.
        shutil.rmtree(run_dir, ignore_errors=True)
        raise
    excel_engine = getattr(excel, "engine_name", excel_backend)

    jobs: List[Job] = []
    pdf_reports: List[Dict[str, Any]] = []
    all_groups = len(_group_items(dom_mapped)) + len(_group_items(ov_mapped))
    group_done = 0

    for scope, source_pdf, source_xlsx, mapped in [
        ("domestic", active_pdf["domestic"], inputs.domestic_xlsx, dom_mapped),
        ("overseas", active_pdf["overseas"], inputs.overseas_xlsx, ov_mapped),
    ]:
        area = package_dir / ANNUAL_DIR_NAME / ("1. 국내" if scope == "domestic" else "2. 해외")
        area.mkdir(parents=True, exist_ok=True)
        original_pdf = inputs.domestic_pdf if scope == "domestic" else inputs.overseas_pdf
        copy_file(original_pdf, area / original_pdf.name)

        _emit(progress, "xlsx", 16 if scope == "domestic" else 65, f"{scope} 지출예산 구분 XLSX를 생성합니다.")
        budget_xlsx = area / f"{source_xlsx.stem}_지출예산 구분.xlsx"
        excel.create_budget_workbook(
            source_xlsx,
            budget_xlsx,
            [_mapped_dict(x, year, quarter, profile) for x in mapped],
            scope,
            year=year,
            quarter=quarter,
            profile=profile,
        )
        copy_file(budget_xlsx, area / "지출예산 구분 원본파일" / budget_xlsx.name)

        groups = _group_items(mapped)
        for (budget_code, budget_name), items in sorted(groups.items(), key=lambda kv: kv[0][1]):
            folder = area / safe_filename(budget_name)
            folder.mkdir(parents=True, exist_ok=True)
            pdf_path = folder / f"{safe_filename(budget_name)}.pdf"
            if scope == "domestic":
                xlsx_name = f"{year}년 {quarter}분기({budget_name}){'과제' if profile == 'q1-legacy' else ' 과제'} 국내특허 연차유지료.xlsx"
            else:
                xlsx_name = f"{year}년 {quarter}분기({budget_name}){' 과제' if profile == 'q1-legacy' else '과제'} 해외특허 연차유지료.xlsx"
            xlsx_path = folder / safe_filename(xlsx_name)
            amount = sum(i.spend_amount for i in items)
            excel.create_filtered_copy(budget_xlsx, xlsx_path, budget_name, expected_amount=amount)
            report = mark_budget_pdf(
                source_pdf,
                pdf_path,
                [{"management_no": i.management_no, "spend_amount": i.spend_amount} for i in items],
            )
            pdf_reports.append({"scope": scope, "budget_name": budget_name, "report": report})
            bad = [r for r in report if r.get("status") != "ok"]
            if bad:
                raise RuntimeError(f"PDF 표기 실패: {budget_name} / {bad}")

            desc = _invoice_description(year, quarter, scope, budget_name, profile)
            jobs.append(Job(
                job_id=f"{scope}-{budget_code}",
                job_type="budget",
                scope=scope,
                budget_code=budget_code,
                budget_name=budget_name,
                description=desc,
                amount=amount,
                item_count=len(items),
                management_numbers=[i.management_no for i in items],
                pdf_relpath=pdf_path.relative_to(package_dir).as_posix(),
                xlsx_relpath=xlsx_path.relative_to(package_dir).as_posix(),
                folder_relpath=folder.relative_to(package_dir).as_posix(),
                portal=annual_portal_payload(
                    scope=scope, budget_code=budget_code, budget_name=budget_name, amount=amount, description=desc
                ),
            ))
            group_done += 1
            pct = 20 + int(60 * group_done / max(1, all_groups))
            _emit(progress, "budget", pct, f"{scope}: {budget_name} ({len(items)}건)")

    # Fee evidence (3 folders)
    _emit(progress, "fees", 82, "수수료/송금수수료 증빙을 생성합니다.")
    fee_root = package_dir / FEE_DIR_NAME
    dom_fee = _fee_totals(dh, dr, "domestic")
    ov_fee = _fee_totals(oh, orows, "overseas")
    fee_specs = [
        ("domestic", "service", f"{year}년 {quarter}분기 국내 특허 연차유지료 납부 수수료", active_pdf["domestic"], inputs.domestic_xlsx, dom_fee["service"] + dom_fee["vat"]),
        ("overseas", "service", f"{year}년 {quarter}분기 해외 특허 연차유지료 납부 수수료", active_pdf["overseas"], inputs.overseas_xlsx, ov_fee["service"] + ov_fee["vat"]),
        ("overseas", "wire", f"{year}년 {quarter}분기 해외 특허 연차유지료 송금 수수료", active_pdf["overseas"], inputs.overseas_xlsx, ov_fee["wire"]),
    ]
    for scope, kind, title, spdf, sxlsx, amount in fee_specs:
        folder = fee_root / title
        pdf_path = folder / f"{title}.pdf"
        xlsx_path = folder / f"{title}.xlsx"
        excel.create_fee_workbook(sxlsx, xlsx_path, scope, kind)
        mark_fee_pdf(spdf, pdf_path, scope, kind)
        portal_desc = title.replace("송금 수수료", "송금수수료") if kind == "wire" else title
        jobs.append(Job(
            job_id=f"fee-{scope}-{kind}", job_type="fee", scope=scope,
            budget_code=prep_budget_code(year), budget_name="지식재산권준비금", description=title, amount=amount,
            item_count=0, management_numbers=[],
            pdf_relpath=pdf_path.relative_to(package_dir).as_posix(),
            xlsx_relpath=xlsx_path.relative_to(package_dir).as_posix(),
            folder_relpath=folder.relative_to(package_dir).as_posix(),
            portal=fee_portal_payload(scope=scope, kind=kind, amount=amount, description=portal_desc, year=year),
        ))

    _emit(progress, "validate", 92, "생성 결과의 불변식을 검증합니다.")
    dom_total = sum(x.spend_amount for x in dom_mapped)
    ov_total = sum(x.spend_amount for x in ov_mapped)
    # Native Excel itself re-opens each generated workbook before we accept it.
    excel_validation_path = auto_dir / "excel_output_validation.json"
    write_json(excel_validation_path, {
        "engine": excel_engine,
        "records": list(getattr(excel, "validation_log", [])),
    })
    try:
        excel.close()
    except Exception:
        pass

    validation = {
        "engine": excel_engine,
        "excel_backend_requested": excel_backend,
        "excel_validation": f"{AUTOMATION_DIR_NAME}/excel_output_validation.json",
        "profile": profile,
        "year": year,
        "quarter": quarter,
        "domestic_items": len(domestic),
        "overseas_items": len(overseas),
        "domestic_mapped": len(dom_mapped),
        "overseas_mapped": len(ov_mapped),
        "explicit_unassigned": len(explicit_unassigned),
        "missing": len(missing),
        "domestic_budget_groups": len(_group_items(dom_mapped)),
        "overseas_budget_groups": len(_group_items(ov_mapped)),
        "domestic_assigned_spend_total": dom_total,
        "overseas_assigned_spend_total": ov_total,
        "domestic_invoice_spend_total": sum(x.spend_amount for x in domestic),
        "overseas_invoice_spend_total": sum(x.spend_amount for x in overseas),
        "unassigned_spend_total": sum(x.spend_amount for x in explicit_unassigned),
        "missing_spend_total": sum(x.spend_amount for x in missing),
        "fee_totals": {"domestic": dom_fee, "overseas": ov_fee},
        "budget_master_files": len(s.get("master_files", [])),
        "history_input_files": len(inputs.history_files),
        "input_provenance": f"{AUTOMATION_DIR_NAME}/input_provenance.json",
        "pdf_preflight": {
            "domestic_normalized": bool(dom_pdf_health.get("normalized")),
            "domestic_warning_count": int(dom_pdf_health.get("warning_count", 0)),
            "overseas_normalized": bool(ov_pdf_health.get("normalized")),
            "overseas_warning_count": int(ov_pdf_health.get("warning_count", 0)),
        },
    }
    # Mathematical coverage invariant.
    for scope_name, inv, mapped in [("domestic", domestic, dom_mapped), ("overseas", overseas, ov_mapped)]:
        unresolved_scope = [x for x in explicit_unassigned + missing if x.scope == scope_name]
        if len(inv) != len(mapped) + len(unresolved_scope):
            raise RuntimeError(f"{scope_name} 관리번호 커버리지 불변식 실패")
        if sum(x.spend_amount for x in inv) != sum(x.spend_amount for x in mapped) + sum(x.spend_amount for x in unresolved_scope):
            raise RuntimeError(f"{scope_name} 지출금액 합계 불변식 실패")

    write_json(auto_dir / "validation.json", validation)
    write_json(auto_dir / "pdf_mark_report.json", pdf_reports)
    manifest = {
        "version": 2,
        "engine": excel_engine,
        "year": year,
        "quarter": quarter,
        "package_dir": str(package_dir),
        "automation_dir": str(auto_dir),
        "portal_contract_version": PORTAL_CONTRACT_VERSION,
        "jobs": [j.to_dict() for j in jobs],
    }
    write_json(auto_dir / "manifest.json", manifest)
    _emit(progress, "done", 100, f"생성 완료: {run_dir}")
    return run_dir


def finalize(run_dir: Path, zip_path: Path | None = None) -> Path:
    run_dir = run_dir.resolve()
    package_dir = package_dir_for(run_dir)
    auto_dir = automation_dir_for(run_dir)
    manifest_path = auto_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    for job in manifest.get("jobs", []):
        if job.get("job_type") != "budget" or job.get("status") != "completed":
            continue
        rel = Path(job["folder_relpath"])
        src = package_dir / rel
        if not src.exists():
            if (src.parent / f"{src.name}_(완료)").exists():
                continue
            continue
        src.rename(src.parent / f"{src.name}_(완료)")

    if zip_path is None:
        y, q = manifest.get("year"), manifest.get("quarter")
        zip_path = run_dir / f"{y}년_{q}분기_연차유지료_자동화결과.zip"
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
        # Final business ZIP deliberately excludes the Tampermonkey/debug folder.
        # The visible run folder keeps it beside the two business folders.
        business_roots = [package_dir / FEE_DIR_NAME, package_dir / ANNUAL_DIR_NAME]
        # Backward compatibility for runs made before v0.6.6.
        if not any(x.exists() for x in business_roots):
            business_roots = [p for p in package_dir.iterdir() if p.is_dir() and p.name != AUTOMATION_DIR_NAME]
        for root in business_roots:
            if not root.exists():
                continue
            for p in sorted(root.rglob("*")):
                if p.is_file():
                    zf.write(p, p.relative_to(package_dir).as_posix())
    return zip_path
