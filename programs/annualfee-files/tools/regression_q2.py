from __future__ import annotations

"""Golden regression runner for the 2026Q2 business package.

This tool intentionally compares *semantics*, not ZIP/XLSX/PDF byte hashes:
- XLSX XML timestamps/style IDs/formula calc metadata may differ while the workbook is
  operationally identical.
- PDF annotation object IDs and modified dates may differ.

Usage example (from project root):

    python tools/regression_q2.py \
      --input C:\\test\\q2_input \
      --history C:\\test\\history \
      --golden-package C:\\test\\q2_golden_unzipped \
      --work C:\\test\\regression_out

The only currently accepted Q2 semantic difference is P190141KR budget-code C cell:
source/current survey 25102108 vs final golden 26102079.  This is *reported as a
known deviation*, never silently rewritten.
"""

import argparse
import json
import math
import shutil
import sys
import tempfile
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
import xml.etree.ElementTree as ET

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

import fitz  # type: ignore

from kriss_annual_fee.workflow import package_dir_for, prepare, preflight
from kriss_annual_fee.xlsx_ooxml import XlsxSession, inspect_workbook

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
q = lambda tag: f"{{{MAIN_NS}}}{tag}"

KNOWN_Q2_DEVIATION = {
    "management_no": "P190141KR",
    "field": "예산코드",
    "generated": "25102108",
    "golden": "26102079",
}


def _load_facts() -> Dict[str, Any]:
    return json.loads((PROJECT / "docs/golden/2026Q2_facts.json").read_text(encoding="utf-8"))


def _norm(v: Any) -> Any:
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def _budget_code(v: Any) -> str:
    if v in (None, ""):
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    s = str(v).strip()
    if s.endswith(".0"):
        try:
            return str(int(float(s)))
        except ValueError:
            pass
    return s


def _find_file(root: Path, name: str) -> Path:
    hits = list(root.rglob(name))
    if len(hits) != 1:
        raise RuntimeError(f"expected exactly one {name!r} under {root}, found {len(hits)}")
    return hits[0]


def _master_path(root: Path, scope: str) -> Path:
    suffix = "국내_지출예산 구분.xlsx" if scope == "domestic" else "해외_지출예산 구분.xlsx"
    hits = [p for p in root.rglob("*.xlsx") if p.name.endswith(suffix) and "지출예산 구분 원본파일" not in str(p.parent)]
    # In golden package there is exactly one current master per scope.
    # Ignore any files nested in a budget folder; those do not have the INV master name.
    if len(hits) != 1:
        raise RuntimeError(f"master {scope}: expected 1, found {len(hits)}: {hits}")
    return hits[0]


def _filtered_path(root: Path, scope_dir: str, budget_name: str) -> Path:
    bases = []
    for d in root.rglob("*"):
        if not d.is_dir():
            continue
        clean = d.name.removesuffix("_(완료)").removesuffix("_완료")
        if clean == budget_name and scope_dir in d.parts:
            bases.append(d)
    if len(bases) != 1:
        raise RuntimeError(f"filtered folder {budget_name}: expected 1, found {len(bases)}")
    xlsx = list(bases[0].glob("*.xlsx"))
    if len(xlsx) != 1:
        raise RuntimeError(f"filtered workbook {budget_name}: expected 1, found {len(xlsx)}")
    return xlsx[0]


def _compare_matrix(generated: Path, golden: Path, scope: str) -> Dict[str, Any]:
    ses = XlsxSession()
    gh, gr = ses.read_used_range(generated)
    th, tr = ses.read_used_range(golden)
    diffs: List[Dict[str, Any]] = []
    known: List[Dict[str, Any]] = []
    if gh != th:
        diffs.append({"kind": "headers", "generated": gh, "golden": th})
    rows = max(len(gr), len(tr))
    cols = max(len(gh), len(th))
    header_norm = [str(x).strip() for x in gh]
    try:
        mgmt_idx = header_norm.index("고객관리번호")
    except ValueError:
        mgmt_idx = -1
    for ri in range(rows):
        a = gr[ri] if ri < len(gr) else []
        b = tr[ri] if ri < len(tr) else []
        mgmt = ""
        if mgmt_idx >= 0:
            if mgmt_idx < len(a): mgmt = str(a[mgmt_idx] or "").strip()
            elif mgmt_idx < len(b): mgmt = str(b[mgmt_idx] or "").strip()
        for ci in range(cols):
            av = a[ci] if ci < len(a) else None
            bv = b[ci] if ci < len(b) else None
            if ci == 2:  # inserted budget-code column C
                av, bv = _budget_code(av), _budget_code(bv)
            else:
                av, bv = _norm(av), _norm(bv)
            if av == bv:
                continue
            item = {"row": ri + 2, "col": ci + 1, "header": gh[ci] if ci < len(gh) else None,
                    "management_no": mgmt, "generated": av, "golden": bv}
            if (scope == "domestic" and mgmt == KNOWN_Q2_DEVIATION["management_no"] and ci == 2
                    and str(av) == KNOWN_Q2_DEVIATION["generated"] and str(bv) == KNOWN_Q2_DEVIATION["golden"]):
                known.append(item)
            else:
                diffs.append(item)
    return {"unexpected_differences": diffs, "known_deviations": known,
            "generated": str(generated), "golden": str(golden)}


def _font_rgb_by_column(path: Path, target_headers: Sequence[str]) -> Dict[str, List[str]]:
    """Return font RGB values used by data cells of target columns.

    We use OOXML directly here because style IDs are allowed to differ from golden.
    """
    with zipfile.ZipFile(path) as z:
        files = {n: z.read(n) for n in z.namelist()}
    styles = ET.fromstring(files["xl/styles.xml"])
    ns = {"m": MAIN_NS}
    fonts = styles.find(q("fonts"))
    xfs = styles.find(q("cellXfs"))
    if fonts is None or xfs is None:
        return {}
    # first worksheet path is sheet1 for all golden inputs in this workflow
    sheet = ET.fromstring(files["xl/worksheets/sheet1.xml"])
    shared: List[str] = []
    if "xl/sharedStrings.xml" in files:
        ss = ET.fromstring(files["xl/sharedStrings.xml"])
        for si in ss.findall(q("si")):
            shared.append("".join(t.text or "" for t in si.iter(q("t"))))

    def cell_text(c: ET.Element) -> str:
        if c.get("t") == "inlineStr":
            return "".join(t.text or "" for t in c.iter(q("t")))
        v = c.find(q("v"))
        if v is None or v.text is None:
            return ""
        if c.get("t") == "s":
            try: return shared[int(v.text)]
            except Exception: return v.text
        return v.text

    header_cells = {}
    sd = sheet.find(q("sheetData"))
    if sd is None:
        return {}
    first = sd.find(q("row"))
    if first is None:
        return {}
    for c in first.findall(q("c")):
        ref = c.get("r", "")
        col = "".join(ch for ch in ref if ch.isalpha())
        header_cells[cell_text(c).strip()] = col
    out: Dict[str, List[str]] = {}
    for target in target_headers:
        col = header_cells.get(target.strip())
        rgbs: List[str] = []
        if col:
            for row in sd.findall(q("row"))[1:]:
                for c in row.findall(q("c")):
                    if not (c.get("r", "").startswith(col)):
                        continue
                    sid = int(c.get("s", "0"))
                    xf_items = list(xfs)
                    if sid >= len(xf_items): continue
                    fid = int(xf_items[sid].get("fontId", "0"))
                    font_items = list(fonts)
                    if fid >= len(font_items): continue
                    color = font_items[fid].find(q("color"))
                    if color is not None and color.get("rgb"):
                        rgbs.append(color.get("rgb") or "")
        out[target] = sorted(set(rgbs))
    return out


def _pdf_annotation_signature(path: Path) -> Dict[str, Any]:
    doc = fitz.open(path)
    types = Counter()
    stroke = Counter()
    fill = Counter()
    widths = Counter()
    page_counts = Counter()
    total = 0
    for pno, page in enumerate(doc):
        annot = page.first_annot
        while annot:
            total += 1
            types[annot.type[1]] += 1
            page_counts[pno + 1] += 1
            colors = annot.colors or {}
            s = colors.get("stroke")
            f = colors.get("fill")
            if s:
                stroke[tuple(round(float(x), 3) for x in s)] += 1
            if f:
                fill[tuple(round(float(x), 3) for x in f)] += 1
            try:
                widths[round(float(annot.border.get("width", 0)), 2)] += 1
            except Exception:
                pass
            annot = annot.next
    doc.close()
    return {
        "total": total,
        "types": dict(types),
        "stroke": {str(k): v for k, v in stroke.items()},
        "fill": {str(k): v for k, v in fill.items()},
        "widths": {str(k): v for k, v in widths.items()},
        "page_counts": dict(page_counts),
    }


def _check_preflight(input_dir: Path, history: Optional[Path]) -> Dict[str, Any]:
    r = preflight(input_dir, history)
    facts = _load_facts()
    expected = {
        "domestic.invoice_items": facts["domestic"]["invoice_items"],
        "domestic.assigned_spend_total": facts["domestic"]["assigned_spend_total"],
        "domestic.groups": len(facts["domestic"]["groups"]),
        "overseas.invoice_items": facts["overseas"]["invoice_items"],
        "overseas.assigned_spend_total": facts["overseas"]["assigned_spend_total"],
        "overseas.groups": len(facts["overseas"]["groups"]),
    }
    actual = {
        "domestic.invoice_items": r["domestic"]["invoice_items"],
        "domestic.assigned_spend_total": r["domestic"]["assigned_spend_total"],
        "domestic.groups": r["domestic"]["groups"],
        "overseas.invoice_items": r["overseas"]["invoice_items"],
        "overseas.assigned_spend_total": r["overseas"]["assigned_spend_total"],
        "overseas.groups": r["overseas"]["groups"],
    }
    mismatches = {k: {"expected": expected[k], "actual": actual[k]} for k in expected if expected[k] != actual[k]}
    expected_history = {"P190114KR", "P150159KR"}
    got_history = set(r.get("history_management_numbers", []))
    if got_history != expected_history:
        mismatches["history_management_numbers"] = {"expected": sorted(expected_history), "actual": sorted(got_history)}
    return {"pass": not mismatches and bool(r.get("ready")), "mismatches": mismatches, "raw": r}


def run(args: argparse.Namespace) -> Dict[str, Any]:
    work = args.work.resolve()
    if work.exists() and args.clean:
        shutil.rmtree(work)
    work.mkdir(parents=True, exist_ok=True)

    report: Dict[str, Any] = {"period": "2026Q2", "checks": {}, "warnings": [], "failures": []}
    pre = _check_preflight(args.input, args.history)
    report["checks"]["preflight"] = pre
    if not pre["pass"]:
        report["failures"].append("preflight")
        return report

    run_dir = prepare(args.input, work, args.history, profile="q2-current", excel_backend="portable-legacy")
    generated_package = package_dir_for(run_dir)
    golden = args.golden_package.resolve()

    for scope in ("domestic", "overseas"):
        comp = _compare_matrix(_master_path(generated_package, scope), _master_path(golden, scope), scope)
        report["checks"][f"{scope}_master"] = comp
        if comp["unexpected_differences"]:
            report["failures"].append(f"{scope}_master")
        if comp["known_deviations"]:
            report["warnings"].append(f"{scope}_master has documented P190141KR external correction")

    budget = "2-3-04. 바이오의료측정본부"
    gen_f = _filtered_path(generated_package, "1. 국내", budget)
    gold_f = _filtered_path(golden, "1. 국내", budget)
    fcomp = _compare_matrix(gen_f, gold_f, "domestic")
    gi, ti = inspect_workbook(gen_f), inspect_workbook(gold_f)
    structural = {
        "autofilter_ref_equal": gi["autofilter_ref"] == ti["autofilter_ref"],
        "filter_value_equal": gi["filter_value"] == ti["filter_value"],
        "hidden_rows_equal": gi["hidden_rows"] == ti["hidden_rows"],
        "generated": gi,
        "golden": ti,
    }
    report["checks"]["filtered_bio"] = {"values": fcomp, "structure": structural}
    if fcomp["unexpected_differences"] or not all(structural[k] for k in ("autofilter_ref_equal", "filter_value_equal", "hidden_rows_equal")):
        report["failures"].append("filtered_bio")

    # Fee workbook color checks.  The target is semantic RGB, not style index.
    fee_checks = {}
    for label, pattern, headers in [
        ("domestic_service", "*국내 특허 연차유지료 납부 수수료.xlsx", ["당사수수료(KRW)", "부가세"]),
        ("overseas_service", "*해외 특허 연차유지료 납부 수수료.xlsx", ["당사수수료(KRW)", "부가세"]),
        ("overseas_wire", "*해외 특허 연차유지료 송금 수수료.xlsx", ["송금수수료"]),
    ]:
        hits = list(generated_package.rglob(pattern))
        if len(hits) != 1:
            fee_checks[label] = {"pass": False, "error": f"found {len(hits)} files"}
            report["failures"].append(f"fee_{label}")
            continue
        rgb = _font_rgb_by_column(hits[0], headers)
        ok = all("FF0070C0" in rgb.get(h, []) for h in headers)
        fee_checks[label] = {"pass": ok, "rgb": rgb, "file": str(hits[0])}
        if not ok:
            report["failures"].append(f"fee_{label}")
    report["checks"]["fee_xlsx_colors"] = fee_checks

    gen_pdf = next(gen_f.parent.glob("*.pdf"))
    gold_pdf = next(gold_f.parent.glob("*.pdf"))
    psig_g = _pdf_annotation_signature(gen_pdf)
    psig_t = _pdf_annotation_signature(gold_pdf)
    # Golden uses FreeText rectangle while generator uses Square; compare operational count
    # and require 7 highlights + 7 red row markers in generated.
    # The source domestic PDF already contains 11 FreeText annotations in the appended
    # payment-evidence pages.  Golden adds seven more FreeText row boxes; v0.3 adds
    # seven Square row boxes instead.  Therefore compare the *added business marks*
    # while allowing the pre-existing 11 annotations to remain untouched.
    baseline_freetext = psig_g["types"].get("FreeText", 0)
    generated_pdf_ok = (psig_g["total"] == 25 and psig_g["types"].get("Highlight") == 7
                        and psig_g["types"].get("Square") == 7 and baseline_freetext == 11)
    golden_pdf_ok = (psig_t["total"] == 25 and psig_t["types"].get("Highlight") == 7
                     and psig_t["types"].get("FreeText") == baseline_freetext + 7)
    report["checks"]["pdf_bio_annotations"] = {
        "pass": generated_pdf_ok and golden_pdf_ok,
        "generated": psig_g,
        "golden": psig_t,
        "note": "annotation subtype may differ (golden FreeText vs generated Square); count/color/geometry intent is authoritative",
    }
    if not (generated_pdf_ok and golden_pdf_ok):
        report["failures"].append("pdf_bio_annotations")

    report["run_dir"] = str(run_dir)
    report["pass"] = len(report["failures"]) == 0
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="2026Q2 golden semantic regression")
    ap.add_argument("--input", type=Path, required=True, help="Q2 current six-file input directory")
    ap.add_argument("--history", type=Path, default=None, help="Q1/history survey directory")
    ap.add_argument("--golden-package", type=Path, required=True, help="decoded 2분기.zip root")
    ap.add_argument("--work", type=Path, required=True, help="temporary/output directory")
    ap.add_argument("--report", type=Path, default=None)
    ap.add_argument("--clean", action="store_true")
    args = ap.parse_args()
    report = run(args)
    out = args.report or (args.work / "q2_regression_report.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"pass": report.get("pass"), "failures": report.get("failures"),
                      "warnings": report.get("warnings"), "report": str(out)}, ensure_ascii=False, indent=2))
    return 0 if report.get("pass") else 1


if __name__ == "__main__":
    raise SystemExit(main())
