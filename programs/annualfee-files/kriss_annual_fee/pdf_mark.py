from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Tuple

import fitz  # PyMuPDF


RED = (0.898, 0.1333, 0.2157)
ORANGE = (1.0, 0.3333, 0.0)
YELLOW = (1.0, 1.0, 0.0)


def _krw_text(value: int) -> str:
    return f"{int(value):,}"


def _dashed_row_bounds(page: fitz.Page, management_rect: fitz.Rect) -> Tuple[float, float]:
    y = (management_rect.y0 + management_rect.y1) / 2
    dashed: List[float] = []
    all_h: List[float] = []
    for d in page.get_drawings():
        color = d.get("color")
        dash = d.get("dashes") or ""
        for item in d.get("items", []):
            if item[0] != "l":
                continue
            p1, p2 = item[1], item[2]
            if abs(p1.y - p2.y) < 0.5 and abs(p1.x - p2.x) > 400:
                # Only black/near-black rules are semantic row boundaries.
                # The Markpro PDFs also contain white horizontal drawing lines
                # inside a record.  Treating those as fallback boundaries clips
                # the last record on a page (Q2 P200155KR is the golden case).
                if color and max(color) < 0.2:
                    all_h.append(float(p1.y))
                    if "2" in dash:
                        dashed.append(float(p1.y))
    dashed = sorted(set(round(v, 3) for v in dashed))
    all_h = sorted(set(round(v, 3) for v in all_h))
    above = max((v for v in dashed if v < y), default=None)
    below = min((v for v in dashed if v > y), default=None)
    if above is None:
        above = max((v for v in all_h if v < y), default=management_rect.y0 - 20)
    if below is None:
        below = min((v for v in all_h if v > y), default=management_rect.y1 + 50)
    # v0.6.1: use the separator rules themselves as the rectangle edges.
    # With a slightly thicker red stroke this fully covers the dashed rule
    # instead of leaving the original dots visible above/below the box.
    return float(above), float(below)


import re

_MGMT_TOKEN = re.compile(r"^[PD]\d{6}[A-Z]{2}")


def _mgmt_column_anchors(page: fitz.Page, mgmt_rect: fitz.Rect) -> List[fitz.Rect]:
    """Rects of every management-number-like token in the same column.

    Used only as a fallback when rule-line based row bounds are invalid
    (e.g. the 2025Q4 domestic template has no horizontal separator lines
    between records).  Column membership = x0 within 30pt of the target's
    management number, which matches the fixed right-hand column layout of
    the Markpro domestic/overseas detail tables.
    """
    anchors: List[fitz.Rect] = []
    for w in page.get_text("words"):
        x0, y0, x1, y1, text = w[0], w[1], w[2], w[3], w[4]
        if _MGMT_TOKEN.match(text) and abs(x0 - mgmt_rect.x0) < 30:
            anchors.append(fitz.Rect(x0, y0, x1, y1))
    return sorted(anchors, key=lambda r: r.y0)


def _foreign_anchor_inside(anchors: List[fitz.Rect], mgmt_rect: fitz.Rect, y0: float, y1: float) -> bool:
    tgt_cy = (mgmt_rect.y0 + mgmt_rect.y1) / 2
    for a in anchors:
        cy = (a.y0 + a.y1) / 2
        if abs(cy - tgt_cy) < 1.0:
            continue  # the target itself
        if y0 < cy < y1:
            return True
    return False


def _anchor_row_bounds(page: fitz.Page, mgmt_rect: fitz.Rect, anchors: List[fitz.Rect], line_below: float) -> Tuple[float, float]:
    """Row bounds from neighbouring record anchors (templates without rules).

    In the Markpro detail tables the management number sits on the record's
    first text line, so the record spans from its own anchor down to just
    above the next record's anchor.  For the last record on a page the
    nearest black rule below (subtotal/table bottom) is kept as the bound.
    """
    tgt_cy = (mgmt_rect.y0 + mgmt_rect.y1) / 2
    below = [a for a in anchors if (a.y0 + a.y1) / 2 > tgt_cy + 1.0]
    top = mgmt_rect.y0 - 5.0
    if below:
        bottom = below[0].y0 - 5.0
    else:
        bottom = line_below - 2.0
    return top, bottom



def normalize_pdf_source(source_pdf: Path, normalized_pdf: Path) -> Dict[str, Any]:
    """Preflight a source PDF and write a normalized copy only when needed.

    Some Markpro PDFs open normally but contain broken / dangling xref objects
    that MuPDF reports only when the document is serialized.  v0.6 performs a
    clean in-memory serialization once per source, captures MuPDF warnings, and
    reuses the normalized copy for every marked derivative when warnings or an
    automatic repair are detected.  The original invoice PDF is never modified.
    """
    normalized_pdf.parent.mkdir(parents=True, exist_ok=True)
    fitz.TOOLS.mupdf_warnings(reset=1)
    prev_err = fitz.TOOLS.mupdf_display_errors(False)
    prev_warn = fitz.TOOLS.mupdf_display_warnings(False)
    doc = None
    try:
        doc = fitz.open(source_pdf)
        page_count = len(doc)
        is_repaired = bool(getattr(doc, "is_repaired", False))
        clean_bytes = doc.tobytes(garbage=4, deflate=True, clean=True)
        warnings = fitz.TOOLS.mupdf_warnings(reset=1) or ""
    finally:
        if doc is not None:
            doc.close()
        fitz.TOOLS.mupdf_display_errors(prev_err)
        fitz.TOOLS.mupdf_display_warnings(prev_warn)

    warning_lines = [x.strip() for x in str(warnings).splitlines() if x.strip()]
    needs_normalization = is_repaired or bool(warning_lines)
    active_source = source_pdf
    if needs_normalization:
        normalized_pdf.write_bytes(clean_bytes)
        # Fail early if the normalized stream cannot be reopened or page count changed.
        check = fitz.open(normalized_pdf)
        try:
            if len(check) != page_count:
                raise ValueError(
                    f"PDF normalization page-count mismatch: {source_pdf} {page_count} -> {len(check)}"
                )
        finally:
            check.close()
        active_source = normalized_pdf

    return {
        "status": "ok",
        "source": str(source_pdf),
        "page_count": page_count,
        "is_repaired": is_repaired,
        "warning_count": len(warning_lines),
        "warnings": warning_lines,
        "normalized": needs_normalization,
        "normalized_source": str(active_source) if needs_normalization else "",
        "active_source": str(active_source),
    }

def mark_budget_pdf(source_pdf: Path, output_pdf: Path, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    output_pdf.parent.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(source_pdf)
    report: List[Dict[str, Any]] = []
    try:
        for item in items:
            mgmt = item["management_no"]
            amount_text = _krw_text(int(item["spend_amount"]))
            mgmt_hits: List[Tuple[int, fitz.Rect]] = []
            for pno in range(1, len(doc)):  # page 1 is invoice cover; details start on page 2
                rects = doc[pno].search_for(mgmt)
                for r in rects:
                    mgmt_hits.append((pno, r))
            if len(mgmt_hits) != 1:
                report.append({"management_no": mgmt, "status": "management_match_error", "matches": len(mgmt_hits)})
                continue

            pno, mgmt_rect = mgmt_hits[0]
            page = doc[pno]
            y0, y1 = _dashed_row_bounds(page, mgmt_rect)
            row_source = "rule-lines"
            anchors = _mgmt_column_anchors(page, mgmt_rect)
            if _foreign_anchor_inside(anchors, mgmt_rect, y0, y1):
                # Rule-line bounds swallowed neighbouring records: the template
                # has no per-record separator lines (first seen 2025Q4 domestic).
                y0, y1 = _anchor_row_bounds(page, mgmt_rect, anchors, y1 + 2.0)
                row_source = "anchors"
                if _foreign_anchor_inside(anchors, mgmt_rect, y0, y1):
                    report.append({
                        "management_no": mgmt,
                        "status": "row_bounds_error",
                        "page": pno + 1,
                    })
                    continue
            box = fitz.Rect(36.0, y0, page.rect.width - 35.0, y1)

            amount_hits = []
            for ar in page.search_for(amount_text):
                cy = (ar.y0 + ar.y1) / 2
                if y0 - 1 <= cy <= y1 + 1:
                    amount_hits.append(ar)
            if not amount_hits:
                report.append({
                    "management_no": mgmt,
                    "status": "amount_match_error",
                    "amount_text": amount_text,
                    "page": pno + 1,
                })
                continue
            amount_rect = min(amount_hits, key=lambda r: r.x0)

            h = page.add_highlight_annot(amount_rect)
            h.set_colors(stroke=YELLOW)
            h.set_opacity(1.0)
            h.update()

            r = page.add_rect_annot(box)
            r.set_colors(stroke=RED)
            r.set_border(width=1.6)
            r.update()
            report.append({
                "management_no": mgmt,
                "status": "ok",
                "page": pno + 1,
                "amount_text": amount_text,
                "row_box": [box.x0, box.y0, box.x1, box.y1],
                "row_source": row_source,
                "amount_box": [amount_rect.x0, amount_rect.y0, amount_rect.x1, amount_rect.y1],
            })

        doc.save(output_pdf, garbage=4, deflate=True)
    finally:
        doc.close()
    return report


def _rect_from_terms(page: fitz.Page, first_term: str, last_term: str, x0: float, x1: float, pad_top: float, pad_bottom: float) -> fitz.Rect:
    a = page.search_for(first_term)
    b = page.search_for(last_term)
    if not a or not b:
        raise ValueError(f"PDF에서 강조 영역 기준 문구를 찾지 못했습니다: {first_term}, {last_term}")
    return fitz.Rect(x0, a[0].y0 - pad_top, x1, b[-1].y1 + pad_bottom)


def _solid_rule_box(page: fitz.Page, top_term: str, bottom_term: str) -> fitz.Rect:
    """Return a rectangle whose edges sit on the actual black table rules.

    We locate the nearest full-width horizontal rules above/below the target
    text and use their own x extents.  This avoids hand-tuned padding that can
    make a 3pt orange annotation overshoot the printed black lines.
    """
    top_hits = page.search_for(top_term)
    bottom_hits = page.search_for(bottom_term)
    if not top_hits or not bottom_hits:
        raise ValueError(f"PDF에서 강조 영역 기준 문구를 찾지 못했습니다: {top_term}, {bottom_term}")
    top_y = top_hits[0].y0
    bottom_y = bottom_hits[-1].y1
    rules = []
    for drawing in page.get_drawings():
        color = drawing.get("color")
        if color and max(color) >= 0.2:
            continue
        for item in drawing.get("items", []):
            if not item or item[0] != "l":
                continue
            p1, p2 = item[1], item[2]
            if abs(p1.y - p2.y) < 0.5 and abs(p1.x - p2.x) > 350:
                rules.append((float(p1.y), min(float(p1.x), float(p2.x)), max(float(p1.x), float(p2.x))))
    above = [r for r in rules if r[0] < top_y]
    below = [r for r in rules if r[0] > bottom_y]
    if not above or not below:
        raise ValueError(f"PDF 표 실선 경계를 찾지 못했습니다: {top_term}, {bottom_term}")
    top_rule = max(above, key=lambda r: r[0])
    bottom_rule = min(below, key=lambda r: r[0])
    x0 = max(top_rule[1], bottom_rule[1])
    x1 = min(top_rule[2], bottom_rule[2])
    return fitz.Rect(x0, top_rule[0], x1, bottom_rule[0])


def mark_fee_pdf(source_pdf: Path, output_pdf: Path, scope: str, fee_kind: str) -> Dict[str, Any]:
    """Add the orange rectangle used in the fee evidence PDFs."""
    output_pdf.parent.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(source_pdf)
    try:
        page = doc[0]
        if fee_kind == "wire":
            rect = _solid_rule_box(page, "송금수수료", "송금수수료")
        else:
            rect = _solid_rule_box(page, "당사수수료", "수수료소계")
        a = page.add_rect_annot(rect)
        a.set_colors(stroke=ORANGE)
        a.set_border(width=3.0)
        a.update()
        doc.save(output_pdf, garbage=4, deflate=True)
        return {"status": "ok", "box": [rect.x0, rect.y0, rect.x1, rect.y1]}
    finally:
        doc.close()
