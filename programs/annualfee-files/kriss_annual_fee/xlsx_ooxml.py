from __future__ import annotations

"""Cross-platform XLSX reader/editor using OOXML directly.

Why this module exists
----------------------
The v0.1/v0.2 prototype used Microsoft Excel COM.  That preserved formatting well,
but made the generator Windows + Excel dependent and prevented full regression tests
in CI/Linux.  The business transformation is narrow enough that editing the OOXML
package directly is safer than rebuilding the workbook with a general spreadsheet
library:

* existing cells/styles/formulas/print settings are kept byte-for-byte unless they
  must move because four columns are inserted;
* only sheet1, styles.xml (fee evidence only), workbook calculation settings and
  calcChain metadata are changed;
* no third-party spreadsheet runtime is required.

This is deliberately *not* a full Excel implementation.  If Markpro later starts
shipping tables, pivots, external formulas, drawings anchored to the data columns,
etc., add a golden regression before expanding this module.
"""

import copy
import io
import posixpath
import re
import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
import xml.etree.ElementTree as ET

from .core import as_int, excel_col, norm_header

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"


def q(tag: str) -> str:
    return f"{{{MAIN_NS}}}{tag}"


def _register_namespaces(xml_bytes: bytes) -> None:
    """Preserve original namespace prefixes as much as ElementTree allows."""
    head = xml_bytes[:8192].decode("utf-8", errors="ignore")
    for prefix, uri in re.findall(r'xmlns(?::([A-Za-z_][\w.-]*))?="([^"]+)"', head):
        try:
            ET.register_namespace(prefix or "", uri)
        except ValueError:
            pass


def _parse_xml(xml_bytes: bytes) -> ET.Element:
    _register_namespaces(xml_bytes)
    return ET.fromstring(xml_bytes)


def _xml_bytes(root: ET.Element) -> bytes:
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def col_to_num(col: str) -> int:
    n = 0
    for ch in col.upper():
        if "A" <= ch <= "Z":
            n = n * 26 + (ord(ch) - 64)
    return n


def split_cell_ref(ref: str) -> Tuple[int, int]:
    m = re.fullmatch(r"\$?([A-Za-z]{1,3})\$?(\d+)", ref)
    if not m:
        raise ValueError(f"invalid cell ref: {ref}")
    return col_to_num(m.group(1)), int(m.group(2))


def shift_cell_ref(ref: str, delta_cols: int) -> str:
    m = re.fullmatch(r"(\$?)([A-Za-z]{1,3})(\$?\d+)", ref)
    if not m:
        return ref
    c = col_to_num(m.group(2)) + delta_cols
    if c < 1:
        raise ValueError(f"shifted column out of range: {ref}")
    return f"{m.group(1)}{excel_col(c)}{m.group(3)}"


_CELL_REF_RE = re.compile(r"(?<![A-Za-z0-9_\.])(\$?)([A-Z]{1,3})(\$?\d+)")


def _shift_formula(formula: str, delta_cols: int) -> str:
    """Shift A1 refs while ignoring quoted string literals."""
    if not formula or delta_cols == 0:
        return formula
    # Excel escapes quotes inside strings as "".  Splitting this way is enough
    # for the formula vocabulary observed in the two golden quarters.
    parts = re.split(r'("(?:[^"]|"")*")', formula)
    for i in range(0, len(parts), 2):
        parts[i] = _CELL_REF_RE.sub(
            lambda m: f"{m.group(1)}{excel_col(col_to_num(m.group(2)) + delta_cols)}{m.group(3)}",
            parts[i],
        )
    return "".join(parts)


def _shift_ref_expression(value: str, delta_cols: int) -> str:
    """Shift refs/ranges in attributes such as sqref, ref and print ranges."""
    if not value:
        return value
    return _CELL_REF_RE.sub(
        lambda m: f"{m.group(1)}{excel_col(col_to_num(m.group(2)) + delta_cols)}{m.group(3)}",
        value,
    )


def _inline_string_cell(ref: str, value: str, style: Optional[str] = None) -> ET.Element:
    attrs = {"r": ref, "t": "inlineStr"}
    if style not in (None, ""):
        attrs["s"] = str(style)
    c = ET.Element(q("c"), attrs)
    is_el = ET.SubElement(c, q("is"))
    t = ET.SubElement(is_el, q("t"))
    if value.startswith(" ") or value.endswith(" ") or "\n" in value:
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = value
    return c


def _formula_cell(
    ref: str,
    formula: str,
    cached: Any,
    *,
    style: Optional[str] = None,
    string_result: bool = False,
) -> ET.Element:
    attrs = {"r": ref}
    if style not in (None, ""):
        attrs["s"] = str(style)
    if string_result:
        attrs["t"] = "str"
    c = ET.Element(q("c"), attrs)
    f = ET.SubElement(c, q("f"))
    f.text = formula
    v = ET.SubElement(c, q("v"))
    v.text = "" if cached is None else str(cached)
    return c


def _numeric_cell(ref: str, value: Any, style: Optional[str] = None) -> ET.Element:
    attrs = {"r": ref}
    if style not in (None, ""):
        attrs["s"] = str(style)
    c = ET.Element(q("c"), attrs)
    v = ET.SubElement(c, q("v"))
    v.text = str(value)
    return c


def _cell_inline_text(cell: ET.Element) -> str:
    is_el = cell.find(q("is"))
    if is_el is None:
        return ""
    return "".join((t.text or "") for t in is_el.iter(q("t")))


def _shared_strings(files: Dict[str, bytes]) -> List[str]:
    data = files.get("xl/sharedStrings.xml")
    if not data:
        return []
    root = _parse_xml(data)
    result: List[str] = []
    for si in root.findall(q("si")):
        result.append("".join((t.text or "") for t in si.iter(q("t"))))
    return result


def _cell_value(cell: ET.Element, shared: Sequence[str]) -> Any:
    t = cell.get("t")
    if t == "inlineStr":
        return _cell_inline_text(cell)
    v = cell.find(q("v"))
    text = v.text if v is not None else None
    if text is None:
        return None
    if t == "s":
        try:
            return shared[int(text)]
        except Exception:
            return text
    if t in ("str", "e"):
        return text
    if t == "b":
        return text == "1"
    try:
        f = float(text)
        return int(f) if f.is_integer() else f
    except ValueError:
        return text


def _first_sheet_path(files: Dict[str, bytes]) -> str:
    wb = _parse_xml(files["xl/workbook.xml"])
    sheets = wb.find(q("sheets"))
    if sheets is None or len(sheets) == 0:
        raise ValueError("XLSX workbook has no sheets")
    first = sheets[0]
    rid = first.get(f"{{{REL_NS}}}id")
    if not rid:
        return "xl/worksheets/sheet1.xml"
    rels = _parse_xml(files["xl/_rels/workbook.xml.rels"])
    for rel in rels:
        if rel.get("Id") == rid:
            target = rel.get("Target", "worksheets/sheet1.xml")
            if target.startswith("/"):
                return target.lstrip("/")
            return posixpath.normpath(posixpath.join("xl", target))
    return "xl/worksheets/sheet1.xml"


def _read_zip(path: Path) -> Tuple[List[zipfile.ZipInfo], Dict[str, bytes]]:
    with zipfile.ZipFile(path, "r") as zf:
        infos = zf.infolist()
        files = {i.filename: zf.read(i.filename) for i in infos}
    return infos, files


def _write_zip(
    output: Path,
    infos: Sequence[zipfile.ZipInfo],
    files: Dict[str, bytes],
    *,
    omit: Iterable[str] = (),
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    omit_set = set(omit)
    tmp = output.with_suffix(output.suffix + ".tmp")
    if tmp.exists():
        tmp.unlink()
    with zipfile.ZipFile(tmp, "w", allowZip64=True) as zf:
        emitted = set()
        for info in infos:
            if info.filename in omit_set or info.filename not in files:
                continue
            zf.writestr(info, files[info.filename])
            emitted.add(info.filename)
        for name, data in files.items():
            if name in omit_set or name in emitted:
                continue
            zf.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
    tmp.replace(output)


def _remove_calc_chain(files: Dict[str, bytes]) -> None:
    files.pop("xl/calcChain.xml", None)

    rel_name = "xl/_rels/workbook.xml.rels"
    if rel_name in files:
        root = _parse_xml(files[rel_name])
        for el in list(root):
            if (el.get("Type") or "").endswith("/calcChain") or (el.get("Target") or "").endswith("calcChain.xml"):
                root.remove(el)
        files[rel_name] = _xml_bytes(root)

    ct_name = "[Content_Types].xml"
    if ct_name in files:
        root = _parse_xml(files[ct_name])
        for el in list(root):
            if el.get("PartName") == "/xl/calcChain.xml":
                root.remove(el)
        files[ct_name] = _xml_bytes(root)


def _force_recalc(files: Dict[str, bytes]) -> None:
    name = "xl/workbook.xml"
    root = _parse_xml(files[name])
    calc = root.find(q("calcPr"))
    if calc is None:
        calc = ET.SubElement(root, q("calcPr"))
    calc.set("calcMode", "auto")
    calc.set("fullCalcOnLoad", "1")
    calc.set("forceFullCalc", "1")
    files[name] = _xml_bytes(root)
    _remove_calc_chain(files)


def _row_cells(row: ET.Element) -> List[ET.Element]:
    return list(row.findall(q("c")))


def _style_of_cell(row: ET.Element, col_num: int) -> Optional[str]:
    for c in _row_cells(row):
        ref = c.get("r", "")
        try:
            col, _ = split_cell_ref(ref)
        except ValueError:
            continue
        if col == col_num:
            return c.get("s")
    return None


def _solid_fill_id(styles_root: ET.Element, rgb: str) -> int:
    """Return / create a solid fill with an explicit ARGB color."""
    fills = styles_root.find(q("fills"))
    if fills is None:
        fills = ET.SubElement(styles_root, q("fills"), {"count": "0"})
    rgb = rgb.upper()
    for idx, fill in enumerate(list(fills)):
        pf = fill.find(q("patternFill"))
        fg = pf.find(q("fgColor")) if pf is not None else None
        if pf is not None and pf.get("patternType") == "solid" and fg is not None and (fg.get("rgb") or "").upper() == rgb:
            return idx
    fill = ET.Element(q("fill"))
    pf = ET.SubElement(fill, q("patternFill"), {"patternType": "solid"})
    ET.SubElement(pf, q("fgColor"), {"rgb": rgb})
    ET.SubElement(pf, q("bgColor"), {"indexed": "64"})
    fills.append(fill)
    fills.set("count", str(len(list(fills))))
    return len(list(fills)) - 1


def _font_color_id(styles_root: ET.Element, base_font_id: int, rgb: str) -> int:
    fonts = styles_root.find(q("fonts"))
    if fonts is None:
        raise ValueError("styles.xml missing fonts")
    base_fonts = list(fonts)
    if base_font_id >= len(base_fonts):
        base_font_id = 0
    new_font = copy.deepcopy(base_fonts[base_font_id])
    for color in list(new_font.findall(q("color"))):
        new_font.remove(color)
    ET.SubElement(new_font, q("color"), {"rgb": rgb.upper()})
    fonts.append(new_font)
    fonts.set("count", str(len(list(fonts))))
    return len(list(fonts)) - 1


def _style_variant(
    styles_root: ET.Element,
    base_style_id: int,
    *,
    fill_id: Optional[int] = None,
    font_id: Optional[int] = None,
    border_id: Optional[int] = None,
) -> int:
    cell_xfs = styles_root.find(q("cellXfs"))
    if cell_xfs is None:
        raise ValueError("styles.xml missing cellXfs")
    xfs = list(cell_xfs)
    if base_style_id >= len(xfs):
        base_style_id = 0
    xf = copy.deepcopy(xfs[base_style_id])
    if fill_id is not None:
        xf.set("fillId", str(fill_id))
        xf.set("applyFill", "1")
    if font_id is not None:
        xf.set("fontId", str(font_id))
        xf.set("applyFont", "1")
    if border_id is not None:
        xf.set("borderId", str(border_id))
        xf.set("applyBorder", "1" if border_id else "0")
    cell_xfs.append(xf)
    cell_xfs.set("count", str(len(list(cell_xfs))))
    return len(list(cell_xfs)) - 1


def _border_variant_id(
    styles_root: ET.Element,
    base_border_id: int,
    *,
    left: bool = False, right: bool = False, top: bool = False, bottom: bool = False,
    rgb: str = "FF0070C0", style: str = "medium",
) -> int:
    borders = styles_root.find(q("borders"))
    if borders is None:
        raise ValueError("styles.xml missing borders")
    items = list(borders)
    if base_border_id >= len(items):
        base_border_id = 0
    border = copy.deepcopy(items[base_border_id])
    for edge_name, enabled in (("left", left), ("right", right), ("top", top), ("bottom", bottom)):
        if not enabled:
            continue
        edge = border.find(q(edge_name))
        if edge is None:
            edge = ET.Element(q(edge_name))
            border.insert(0, edge)
        edge.set("style", style)
        for child in list(edge):
            edge.remove(child)
        ET.SubElement(edge, q("color"), {"rgb": rgb.upper()})
    borders.append(border)
    borders.set("count", str(len(list(borders))))
    return len(list(borders)) - 1


def _set_dimension(root: ET.Element, max_col: int, max_row: int) -> None:
    dim = root.find(q("dimension"))
    if dim is None:
        dim = ET.Element(q("dimension"), {"ref": f"A1:{excel_col(max_col)}{max_row}"})
        # dimension belongs near the beginning, after sheetPr if present.
        idx = 1 if len(root) and root[0].tag == q("sheetPr") else 0
        root.insert(idx, dim)
    else:
        dim.set("ref", f"A1:{excel_col(max_col)}{max_row}")


def _replace_autofilter(root: ET.Element, ref: str, budget_name: Optional[str] = None) -> None:
    existing = root.find(q("autoFilter"))
    insert_at = None
    if existing is not None:
        insert_at = list(root).index(existing)
        root.remove(existing)
    af = ET.Element(q("autoFilter"), {"ref": ref})
    if budget_name is not None:
        fc = ET.SubElement(af, q("filterColumn"), {"colId": "3"})
        filters = ET.SubElement(fc, q("filters"))
        ET.SubElement(filters, q("filter"), {"val": budget_name})
    if insert_at is None:
        sd = root.find(q("sheetData"))
        insert_at = list(root).index(sd) + 1 if sd is not None else len(root)
    root.insert(insert_at, af)


def _shift_existing_sheet(root: ET.Element, delta_cols: int) -> Tuple[int, int]:
    """Shift existing cells/column metadata and return (old_max_col, max_row)."""
    sheet_data = root.find(q("sheetData"))
    if sheet_data is None:
        raise ValueError("worksheet has no sheetData")
    old_max_col = 0
    max_row = 0
    for row in sheet_data.findall(q("row")):
        rnum = int(row.get("r", "0") or 0)
        max_row = max(max_row, rnum)
        for c in row.findall(q("c")):
            ref = c.get("r")
            if not ref:
                continue
            col, _ = split_cell_ref(ref)
            old_max_col = max(old_max_col, col)
            c.set("r", shift_cell_ref(ref, delta_cols))
            f = c.find(q("f"))
            if f is not None:
                if f.text:
                    f.text = _shift_formula(f.text, delta_cols)
                if f.get("ref"):
                    f.set("ref", _shift_ref_expression(f.get("ref", ""), delta_cols))

    new_max = old_max_col + delta_cols
    for row in sheet_data.findall(q("row")):
        row.set("spans", f"1:{new_max}")

    cols = root.find(q("cols"))
    if cols is not None:
        for col in cols.findall(q("col")):
            col.set("min", str(int(col.get("min", "1")) + delta_cols))
            col.set("max", str(int(col.get("max", "1")) + delta_cols))
        widths = [106.0, 19.7, 13.7, 83.7]
        for idx, width in reversed(list(enumerate(widths, start=1))):
            cols.insert(0, ET.Element(q("col"), {
                "min": str(idx), "max": str(idx), "width": str(width), "customWidth": "1"
            }))
    else:
        widths = [106.0, 19.7, 13.7, 83.7]
        cols = ET.Element(q("cols"))
        for idx, width in enumerate(widths, start=1):
            ET.SubElement(cols, q("col"), {
                "min": str(idx), "max": str(idx), "width": str(width), "customWidth": "1"
            })
        sd_idx = list(root).index(sheet_data)
        root.insert(sd_idx, cols)

    # Other common worksheet references that are column-sensitive.
    for el in root.iter():
        if el.tag in {q("mergeCell"), q("hyperlink")} and el.get("ref"):
            el.set("ref", _shift_ref_expression(el.get("ref", ""), delta_cols))
        if el.tag in {q("conditionalFormatting"), q("dataValidation"), q("ignoredError")} and el.get("sqref"):
            el.set("sqref", _shift_ref_expression(el.get("sqref", ""), delta_cols))

    _set_dimension(root, new_max, max_row)
    return old_max_col, max_row


def _target_col(headers: Sequence[str], aliases: Sequence[str]) -> int:
    hmap = {norm_header(v): i + 1 for i, v in enumerate(headers)}
    for alias in aliases:
        idx = hmap.get(norm_header(alias))
        if idx:
            return idx
    raise KeyError(f"column not found: {aliases}")


def _description_formula(year: int, quarter: int, scope: str, row: int, profile: str) -> str:
    # Formula text itself (without leading '=')
    legacy = profile == "q1-legacy"
    if scope == "domestic":
        between = "과제" if legacy else " 과제"
        return f'"{year}년 {quarter}분기("&D{row}&"){between} 국내특허 연차유지료"'
    between = " 과제" if legacy else "과제"
    return f'"{year}년 {quarter}분기("&D{row}&"){between} 해외특허 연차유지료"'


class XlsxSession:
    """Small API-compatible replacement for the old ExcelSession."""

    def __init__(self, visible: bool = False):
        self.visible = visible

    def __enter__(self) -> "XlsxSession":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read_used_range(self, path: Path) -> Tuple[List[str], List[List[Any]]]:
        infos, files = _read_zip(path)
        shared = _shared_strings(files)
        sheet_name = _first_sheet_path(files)
        root = _parse_xml(files[sheet_name])
        sheet_data = root.find(q("sheetData"))
        if sheet_data is None:
            return [], []
        sparse: Dict[Tuple[int, int], Any] = {}
        max_row = max_col = 0
        for row in sheet_data.findall(q("row")):
            rnum = int(row.get("r", "0") or 0)
            for cell in row.findall(q("c")):
                ref = cell.get("r")
                if not ref:
                    continue
                cnum, rr = split_cell_ref(ref)
                max_row = max(max_row, rr, rnum)
                max_col = max(max_col, cnum)
                sparse[(rr, cnum)] = _cell_value(cell, shared)
        if max_row == 0 or max_col == 0:
            return [], []
        matrix = [[sparse.get((r, c)) for c in range(1, max_col + 1)] for r in range(1, max_row + 1)]
        headers = ["" if x is None else str(x) for x in matrix[0]]
        return headers, matrix[1:]

    def create_budget_workbook(
        self,
        source: Path,
        output: Path,
        mapped_rows: List[Dict[str, Any]],
        scope: str,
        *,
        year: int,
        quarter: int,
        profile: str = "q2-current",
    ) -> None:
        infos, files = _read_zip(source)
        shared = _shared_strings(files)
        sheet_name = _first_sheet_path(files)
        root = _parse_xml(files[sheet_name])
        sheet_data = root.find(q("sheetData"))
        if sheet_data is None:
            raise ValueError("worksheet has no sheetData")

        # Capture source headers and amount/management columns before shifting.
        headers, rows = self.read_used_range(source)
        amount_col = _target_col(headers, ["현지비용(KRW)"])
        mgmt_col = _target_col(headers, ["고객관리번호"])

        old_max_col, max_row = _shift_existing_sheet(root, 4)
        data_end = max((int(x["excel_row"]) for x in mapped_rows), default=max_row - 1)
        # There may be permitted missing/unassigned rows absent from mapped_rows.
        # The invoice total row is the final used row in the observed Markpro files.
        total_row = max_row
        if total_row <= data_end:
            total_row = data_end + 1
            max_row = total_row
            _set_dimension(root, old_max_col + 4, max_row)

        rows_by_num = {int(r.get("r", "0") or 0): r for r in sheet_data.findall(q("row"))}
        header_row = rows_by_num.get(1)
        if header_row is None:
            raise ValueError("header row 1 missing")
        source_header_style_a = int(_style_of_cell(header_row, 5) or 0)  # shifted original A
        source_header_style_b = int(_style_of_cell(header_row, 6) or source_header_style_a)

        # v0.6.1: the four generated business columns deliberately use the
        # yellow header band from the historical golden files.  Keep the
        # original header font/alignment, but remove the inherited green fill.
        styles_name = "xl/styles.xml"
        styles_root = _parse_xml(files[styles_name])
        yellow_fill = _solid_fill_id(styles_root, "FFFFFF00")
        header_a_style = _style_variant(styles_root, source_header_style_a, fill_id=yellow_fill, border_id=0)
        header_bd_style = _style_variant(styles_root, source_header_style_b, fill_id=yellow_fill, border_id=0)

        # New headers.  The trailing spaces in domestic Q2 are intentional.
        if scope == "domestic" and profile != "q1-legacy":
            new_headers = ["지출발의 적요 ", "사용예산(지출금액) ", "예산코드", "예산명"]
        else:
            new_headers = ["지출발의 적요", "사용예산(지출금액)", "예산코드", "예산명"]
        header_styles = [header_a_style, header_bd_style, header_bd_style, header_bd_style]
        new_cells = [_inline_string_cell(f"{excel_col(i)}1", text, header_styles[i-1]) for i, text in enumerate(new_headers, 1)]
        for c in reversed(new_cells):
            header_row.insert(0, c)

        mapped_by_row = {int(x["excel_row"]): x for x in mapped_rows}
        assigned_total = 0
        for rnum, item in mapped_by_row.items():
            row = rows_by_num.get(rnum)
            if row is None:
                raise ValueError(f"invoice row {rnum} missing in {source.name}")
            assigned_total += int(item["spend_amount"])
            amount_style = _style_of_cell(row, amount_col + 4)
            mgmt_style = _style_of_cell(row, mgmt_col + 4)
            desc = str(item["description"])
            formula = _description_formula(year, quarter, scope, rnum, profile)
            b_ref = f"{excel_col(amount_col + 4)}{rnum}"
            inserted = [
                _formula_cell(f"A{rnum}", formula, desc, string_result=True),
                _formula_cell(f"B{rnum}", b_ref, int(item["spend_amount"]), style=amount_style),
                _inline_string_cell(f"C{rnum}", str(item["budget_code"]), mgmt_style),
                _inline_string_cell(f"D{rnum}", str(item["budget_name"])),
            ]
            for c in reversed(inserted):
                row.insert(0, c)

        total = rows_by_num.get(total_row)
        if total is None:
            total = ET.SubElement(sheet_data, q("row"), {"r": str(total_row), "spans": f"1:{old_max_col + 4}"})
            rows_by_num[total_row] = total
        source_total_amount_style = int(_style_of_cell(total, amount_col + 4) or 0)
        source_total_label_style = int(_style_of_cell(total, 5) or 0)  # shifted original A
        generic_total_style = int(_style_of_cell(total, 6) or source_total_label_style)

        # Golden convention: total label / number are red text on the existing
        # green total band; C/D continue the same green band with no red text.
        cell_xfs = styles_root.find(q("cellXfs"))
        if cell_xfs is None:
            raise ValueError("styles.xml missing cellXfs")
        label_xf = list(cell_xfs)[source_total_label_style]
        amount_xf = list(cell_xfs)[source_total_amount_style]
        red_label_font = _font_color_id(styles_root, int(label_xf.get("fontId", "0")), "FFFF0000")
        red_amount_font = _font_color_id(styles_root, int(amount_xf.get("fontId", "0")), "FFFF0000")
        total_label_red_style = _style_variant(styles_root, source_total_label_style, font_id=red_label_font)
        total_amount_red_style = _style_variant(styles_root, source_total_amount_style, font_id=red_amount_font)

        inserted_total = [
            _inline_string_cell(f"A{total_row}", "지출금액", total_label_red_style),
            _formula_cell(
                f"B{total_row}",
                f"SUBTOTAL(9,B2:B{data_end})",
                assigned_total,
                style=total_amount_red_style,
            ),
            _inline_string_cell(f"C{total_row}", "", generic_total_style),
            _inline_string_cell(f"D{total_row}", "", generic_total_style),
        ]
        for c in reversed(inserted_total):
            total.insert(0, c)

        # Current profile: a genuine worksheet AutoFilter excludes the total row.
        # Filtered copies keep filterColumn colId=3 (예산명).  SUBTOTAL(9,...)
        # therefore excludes filtered-out records exactly as Excel does.
        _replace_autofilter(root, f"A1:{excel_col(old_max_col + 4)}{data_end}")
        files[sheet_name] = _xml_bytes(root)
        files[styles_name] = _xml_bytes(styles_root)
        _force_recalc(files)
        _write_zip(output, infos, files, omit={"xl/calcChain.xml"})

    def create_filtered_copy(self, source_budget_workbook: Path, output: Path, budget_name: str) -> None:
        infos, files = _read_zip(source_budget_workbook)
        sheet_name = _first_sheet_path(files)
        root = _parse_xml(files[sheet_name])
        shared = _shared_strings(files)
        sheet_data = root.find(q("sheetData"))
        if sheet_data is None:
            raise ValueError("worksheet has no sheetData")
        rows = sheet_data.findall(q("row"))
        if not rows:
            raise ValueError("worksheet has no rows")
        max_row = max(int(r.get("r", "0") or 0) for r in rows)
        # Total row is the final row; filter ref in the generated base identifies data_end.
        af = root.find(q("autoFilter"))
        data_end = max_row - 1
        max_col = 0
        if af is not None and af.get("ref"):
            right = af.get("ref", "").split(":")[-1]
            try:
                max_col, data_end = split_cell_ref(right)
            except ValueError:
                pass
        if max_col == 0:
            dim = root.find(q("dimension"))
            if dim is not None and dim.get("ref"):
                try:
                    max_col, _ = split_cell_ref(dim.get("ref", "").split(":")[-1])
                except ValueError:
                    pass
        if max_col == 0:
            max_col = 4

        visible_total = 0
        for row in rows:
            rnum = int(row.get("r", "0") or 0)
            if rnum <= 1 or rnum > data_end:
                row.attrib.pop("hidden", None)
                continue
            d_val = ""
            b_val = 0
            for cell in row.findall(q("c")):
                ref = cell.get("r", "")
                try:
                    col, _ = split_cell_ref(ref)
                except ValueError:
                    continue
                if col == 4:
                    d_val = str(_cell_value(cell, shared) or "")
                elif col == 2:
                    b_val = as_int(_cell_value(cell, shared))
            if d_val == budget_name:
                row.attrib.pop("hidden", None)
                visible_total += b_val
            else:
                row.set("hidden", "1")

        # Update cached SUBTOTAL result so non-Excel viewers and the portal see it.
        total_row = next((r for r in rows if int(r.get("r", "0") or 0) == max_row), None)
        if total_row is not None:
            for cell in total_row.findall(q("c")):
                if cell.get("r") == f"B{max_row}":
                    v = cell.find(q("v"))
                    if v is None:
                        v = ET.SubElement(cell, q("v"))
                    v.text = str(visible_total)
                    break

        _replace_autofilter(root, f"A1:{excel_col(max_col)}{data_end}", budget_name)
        files[sheet_name] = _xml_bytes(root)
        _force_recalc(files)
        _write_zip(output, infos, files, omit={"xl/calcChain.xml"})

    def create_fee_workbook(self, source: Path, output: Path, scope: str, fee_kind: str) -> None:
        headers, _ = self.read_used_range(source)
        if scope == "domestic":
            targets = ["당사수수료(KRW)", "부가세"]
        elif fee_kind == "wire":
            targets = ["송금수수료"]
        else:
            targets = ["당사수수료(KRW)", "부가세"]
        target_cols = {_target_col(headers, [t]) for t in targets}

        infos, files = _read_zip(source)
        sheet_name = _first_sheet_path(files)
        sheet_root = _parse_xml(files[sheet_name])
        styles_name = "xl/styles.xml"
        styles_root = _parse_xml(files[styles_name])
        fonts = styles_root.find(q("fonts"))
        cell_xfs = styles_root.find(q("cellXfs"))
        if fonts is None or cell_xfs is None:
            raise ValueError("styles.xml missing fonts/cellXfs")

        style_map: Dict[int, int] = {}
        outline_style_map: Dict[Tuple[int, bool, bool, bool, bool], int] = {}

        def blue_style(old_style: int) -> int:
            if old_style in style_map:
                return style_map[old_style]
            xfs = list(cell_xfs)
            if old_style >= len(xfs):
                old_style = 0
            old_xf = xfs[old_style]
            font_id = int(old_xf.get("fontId", "0"))
            old_fonts = list(fonts)
            if font_id >= len(old_fonts):
                font_id = 0
            new_font = copy.deepcopy(old_fonts[font_id])
            for color in list(new_font.findall(q("color"))):
                new_font.remove(color)
            ET.SubElement(new_font, q("color"), {"rgb": "FF0070C0"})
            new_font_id = len(list(fonts))
            fonts.append(new_font)
            fonts.set("count", str(len(list(fonts))))

            new_xf = copy.deepcopy(old_xf)
            new_xf.set("fontId", str(new_font_id))
            new_xf.set("applyFont", "1")
            new_style_id = len(list(cell_xfs))
            cell_xfs.append(new_xf)
            cell_xfs.set("count", str(len(list(cell_xfs))))
            style_map[old_style] = new_style_id
            return new_style_id

        def outline_style(blue_style_id: int, *, left: bool, right: bool, top: bool, bottom: bool) -> int:
            key = (blue_style_id, left, right, top, bottom)
            if key in outline_style_map:
                return outline_style_map[key]
            if not any((left, right, top, bottom)):
                return blue_style_id
            xfs = list(cell_xfs)
            base_xf = xfs[blue_style_id]
            base_border_id = int(base_xf.get("borderId", "0"))
            new_border_id = _border_variant_id(
                styles_root, base_border_id,
                left=left, right=right, top=top, bottom=bottom,
                rgb="FF0070C0", style="medium",
            )
            new_style_id = _style_variant(styles_root, blue_style_id, border_id=new_border_id)
            outline_style_map[key] = new_style_id
            return new_style_id

        sheet_data = sheet_root.find(q("sheetData"))
        if sheet_data is None:
            raise ValueError("worksheet has no sheetData")
        target_min = min(target_cols)
        target_max = max(target_cols)
        separate_nonadjacent = scope == "overseas" and fee_kind != "wire"
        row_numbers = [int(r.get("r", "0") or 0) for r in sheet_data.findall(q("row"))]
        max_row = max(row_numbers) if row_numbers else 1

        changed = 0
        for row in sheet_data.findall(q("row")):
            rnum = int(row.get("r", "0") or 0)
            for cell in row.findall(q("c")):
                ref = cell.get("r")
                if not ref:
                    continue
                col, _ = split_cell_ref(ref)
                if col not in target_cols:
                    continue
                old = int(cell.get("s", "0"))
                blue = blue_style(old)
                styled = outline_style(
                    blue,
                    left=(True if separate_nonadjacent else col == target_min),
                    right=(True if separate_nonadjacent else col == target_max),
                    top=(rnum == 1),
                    bottom=(rnum == max_row),
                )
                cell.set("s", str(styled))
                changed += 1
        if changed == 0:
            raise ValueError(f"no cells colored for fee workbook: {targets}")

        files[sheet_name] = _xml_bytes(sheet_root)
        files[styles_name] = _xml_bytes(styles_root)
        _write_zip(output, infos, files)


# Compatibility alias used by some third-party local patches made against v0.2.
ExcelSession = XlsxSession


def inspect_workbook(path: Path) -> Dict[str, Any]:
    """Machine-readable semantic snapshot used by regression tests and maintainers."""
    session = XlsxSession()
    headers, rows = session.read_used_range(path)
    infos, files = _read_zip(path)
    sheet_name = _first_sheet_path(files)
    root = _parse_xml(files[sheet_name])
    af = root.find(q("autoFilter"))
    filter_value = None
    if af is not None:
        filt = af.find(f"{q('filterColumn')}/{q('filters')}/{q('filter')}")
        if filt is not None:
            filter_value = filt.get("val")
    hidden = []
    sd = root.find(q("sheetData"))
    if sd is not None:
        for row in sd.findall(q("row")):
            if row.get("hidden") == "1":
                hidden.append(int(row.get("r", "0") or 0))
    return {
        "headers": headers,
        "row_count": len(rows) + (1 if headers else 0),
        "col_count": len(headers),
        "autofilter_ref": af.get("ref") if af is not None else None,
        "filter_value": filter_value,
        "hidden_rows": hidden,
    }
