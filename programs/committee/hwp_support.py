# -*- coding: utf-8 -*-
"""Support utilities for KRISS HWP generation (v0.2.7).

Keeps template discovery / ZIP extraction / preflight / archival drift checks
separate from the Windows COM implementation so they can be tested on any OS.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import re
import shutil
import struct
import tempfile
import zipfile
import zlib
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import kriss_committee_automation as kca

_ESCAPED_UNICODE = re.compile(r"#U([0-9A-Fa-f]{4})")


def decode_escaped_unicode(text: str) -> str:
    """Decode literal '#Ubd99#Uc7841' style names used by some HWP ZIP exports."""
    return _ESCAPED_UNICODE.sub(lambda m: chr(int(m.group(1), 16)), text)


def _template_key(text: str) -> str:
    text = decode_escaped_unicode(text)
    text = text.replace("·", "").replace("․", "")
    return re.sub(r"[\s._()\[\]{}-]+", "", text).casefold()


TEMPLATE_EXTS = (".hwp", ".hwpx")

# 파일명 접두어가 다른 병합본(예: "(양식) …서면결의서")을 위한 키워드 보조 매칭
TEMPLATE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "붙임8": ("서면결의", "서면심의"),
}


def _template_paths(directory: Path) -> list[Path]:
    out: list[Path] = []
    for ext in TEMPLATE_EXTS:
        out.extend(directory.glob(f"*{ext}"))
    return sorted(out, key=lambda p: p.name)


@dataclass
class TemplateBundle:
    """Directory/ZIP wrapper. ZIP contents are flattened into a temporary folder."""
    source: Path
    _tmp: Optional[tempfile.TemporaryDirectory] = field(default=None, init=False, repr=False)
    directory: Optional[Path] = field(default=None, init=False)

    def __enter__(self) -> "TemplateBundle":
        src = self.source.expanduser().resolve()
        if src.is_dir():
            self.directory = src
            return self
        if not src.is_file():
            raise FileNotFoundError(f"템플릿 경로를 찾지 못했습니다: {src}")
        if src.suffix.lower() != ".zip":
            raise ValueError("템플릿은 폴더 또는 .zip 파일이어야 합니다.")

        self._tmp = tempfile.TemporaryDirectory(prefix="kriss_hwp_templates_")
        out = Path(self._tmp.name)
        used: set[str] = set()
        with zipfile.ZipFile(src) as z:
            for info in z.infolist():
                if info.is_dir():
                    continue
                raw_name = Path(info.filename).name
                if not raw_name.lower().endswith(TEMPLATE_EXTS):
                    continue
                name = decode_escaped_unicode(raw_name)
                # Flatten and de-duplicate; prevents path traversal and nested-path surprises.
                name = Path(name).name
                stem, suffix = Path(name).stem, Path(name).suffix
                candidate = name
                n = 2
                while candidate.casefold() in used:
                    candidate = f"{stem}_{n}{suffix}"
                    n += 1
                used.add(candidate.casefold())
                with z.open(info) as rf, open(out / candidate, "wb") as wf:
                    shutil.copyfileobj(rf, wf)
        if not _template_paths(out):
            raise ValueError(f"ZIP에 .hwp/.hwpx 템플릿이 없습니다: {src.name}")
        self.directory = out
        return self

    def __exit__(self, exc_type, exc, tb):
        if self._tmp is not None:
            self._tmp.cleanup()
            self._tmp = None

    def find(self, pattern: str) -> Optional[Path]:
        if self.directory is None:
            raise RuntimeError("TemplateBundle은 with 문 안에서 사용하십시오.")
        want = _template_key(pattern)
        cands = []
        for p in _template_paths(self.directory):
            if _template_key(p.stem).startswith(want):
                cands.append(p)
        if cands:
            return sorted(cands, key=lambda p: _template_key(p.name))[0]
        # 접두어 불일치 시 키워드 보조 매칭 (예: 붙임8 ↔ "(양식) …서면결의서")
        for kw in TEMPLATE_KEYWORDS.get(pattern, ()):  # 순서 = 우선순위
            kws = _template_key(kw)
            hits = [p for p in _template_paths(self.directory) if kws in _template_key(p.stem)]
            if len(hits) == 1:
                return hits[0]
            if hits:
                return sorted(hits, key=lambda p: _template_key(p.name))[0]
        return None

    def list_names(self) -> list[str]:
        if self.directory is None:
            return []
        return [p.name for p in _template_paths(self.directory)]


def _classic_hwp_section_records(path: Path) -> list[tuple[int, int, bytes]]:
    """Return (tag, level, payload) records from classic-HWP BodyText sections."""
    c = kca._CFB(path)
    fh = c.stream("FileHeader") or b""
    flags = struct.unpack_from("<I", fh, 36)[0] if len(fh) >= 40 else 0
    if flags & 2:
        raise ValueError("encrypted HWP")
    compressed = bool(flags & 1)
    sections: list[tuple[int, str]] = []
    for e in c.entries:
        m = re.fullmatch(r"Section(\d+)", e.get("name", "")) if e.get("type") == 2 else None
        if m:
            sections.append((int(m.group(1)), e["name"]))
    records: list[tuple[int, int, bytes]] = []
    for _, name in sorted(sections):
        data = c.stream(name) or b""
        if compressed:
            data = zlib.decompress(data, -15)
        pos = 0
        while pos + 4 <= len(data):
            hdr = struct.unpack_from("<I", data, pos)[0]
            pos += 4
            tag = hdr & 0x3FF
            level = (hdr >> 10) & 0x3FF
            size = (hdr >> 20) & 0xFFF
            if size == 0xFFF:
                if pos + 4 > len(data):
                    break
                size = struct.unpack_from("<I", data, pos)[0]
                pos += 4
            payload = data[pos:pos + size]
            pos += size
            records.append((tag, level, payload))
    return records


def classic_hwp_table_structures(path: Path) -> list[dict[str, Any]]:
    """Return classic-HWP table geometry plus cell style metadata.

    HWPTAG_TABLE is tag 77. Cell LIST_HEADER records are tag 72 at the table
    record level. v0.2.6 also captures width/height, margins, borderFillId,
    first paragraph shape/style IDs and first char-shape ID for post-save
    format-fidelity verification.
    """
    records = _classic_hwp_section_records(path)
    out: list[dict[str, Any]] = []
    for i, (tag, level, payload) in enumerate(records):
        if tag != 77 or len(payload) < 8:
            continue
        rows = int(struct.unpack_from("<H", payload, 4)[0])
        cols = int(struct.unpack_from("<H", payload, 6)[0])
        cells: list[dict[str, Any]] = []
        parent_level = level - 1
        j = i + 1
        while j < len(records):
            tag2, level2, payload2 = records[j]
            if level2 <= parent_level:
                break
            if tag2 == 72 and level2 == level and len(payload2) >= 16:
                col, row, col_span, row_span = struct.unpack_from("<HHHH", payload2, 8)
                width = height = 0
                margins = (0, 0, 0, 0)
                border_fill_id = 0
                if len(payload2) >= 24:
                    width, height = struct.unpack_from("<II", payload2, 16)
                if len(payload2) >= 32:
                    margins = tuple(int(x) for x in struct.unpack_from("<HHHH", payload2, 24))
                if len(payload2) >= 34:
                    border_fill_id = int(struct.unpack_from("<H", payload2, 32)[0])

                para_shape_id: Optional[int] = None
                para_style_id: Optional[int] = None
                char_shape_id: Optional[int] = None
                k = j + 1
                while k < len(records):
                    tag3, level3, payload3 = records[k]
                    if level3 < level or (tag3 == 72 and level3 == level):
                        break
                    if tag3 == 66 and level3 == level and len(payload3) >= 11 and para_shape_id is None:
                        para_shape_id = int(struct.unpack_from("<H", payload3, 8)[0])
                        para_style_id = int(payload3[10])
                    elif tag3 == 68 and level3 >= level and len(payload3) >= 8 and char_shape_id is None:
                        char_shape_id = int(struct.unpack_from("<I", payload3, 4)[0])
                    k += 1

                cells.append({
                    "seq": len(cells), "col": int(col), "row": int(row),
                    "col_span": int(col_span), "row_span": int(row_span),
                    "width": int(width), "height": int(height),
                    "margins": margins, "border_fill_id": int(border_fill_id),
                    "para_shape_id": para_shape_id, "para_style_id": para_style_id,
                    "char_shape_id": char_shape_id,
                })
            j += 1
        out.append({"rows": rows, "cols": cols, "cells": cells})
    return out


# ---------------------------------------------------------------------------
# 표 순회(TableRightCell) 모형 — v0.2.8
#
# 한/글의 TableRightCell은 "물리 셀"이 아니라 "논리 행 x 셀" 단위로 이동한다.
# 세로로 병합된 셀은 그 셀이 걸쳐 있는 행마다 한 번씩 다시 방문된다.
# 따라서 순회 셀 수 = Σ(물리 셀의 rowSpan) 이며, 가로 병합은 배수가 되지 않는다.
# (실측: 붙임1 표6은 물리 77셀이지만 COM 순회로는 80셀로 세어졌다.)
# ---------------------------------------------------------------------------

def _cells_covering_row(cells: list[dict[str, Any]], row: int) -> list[dict[str, Any]]:
    """논리 행 하나를 덮는 물리 셀들을 열 순서로 반환."""
    out = [c for c in cells
           if int(c.get("row", 0)) <= row < int(c.get("row", 0)) + max(1, int(c.get("row_span", 1)))]
    return sorted(out, key=lambda c: int(c.get("col", 0)))


def traversal_cell_count(table: dict[str, Any]) -> int:
    """TableRightCell로 끝까지 이동했을 때 세어지는 셀 수."""
    return sum(max(1, int(c.get("row_span", 1))) for c in table.get("cells", []))


def header_row_count(table: dict[str, Any], physical_prefix: int) -> int:
    """계획의 물리 머리셀 수로부터 머리행이 몇 개 논리 행인지 구한다."""
    cells = table.get("cells", [])
    head = cells[:max(0, int(physical_prefix))]
    if not head:
        return 1
    return max(int(c.get("row", 0)) + max(1, int(c.get("row_span", 1))) for c in head)


def traversal_prefix(table: dict[str, Any], physical_prefix: int) -> tuple[int, int]:
    """(머리행 수, 머리 영역의 순회 셀 수)."""
    cells = table.get("cells", [])
    rows = header_row_count(table, physical_prefix)
    return rows, sum(len(_cells_covering_row(cells, r)) for r in range(rows))


def traversal_merge_runs(table: dict[str, Any], physical_prefix: int) -> list[tuple[int, int]]:
    """데이터 영역 세로병합의 (첫 방문 순회 인덱스, rowSpan) 목록.

    세로병합을 나누어도 순회 셀 수는 변하지 않으므로(이미 rowSpan번 세어짐)
    이 인덱스들은 분할 전후로 동일하게 유효하다.
    """
    cells = table.get("cells", [])
    head_rows = header_row_count(table, physical_prefix)
    runs: list[tuple[int, int]] = []
    index = 0
    for r in range(int(table.get("rows", 0))):
        for c in _cells_covering_row(cells, r):
            span = max(1, int(c.get("row_span", 1)))
            if r >= head_rows and span > 1 and int(c.get("row", 0)) == r:
                runs.append((index, span))
            index += 1
    return runs


def classic_hwp_table_shapes(path: Path) -> list[tuple[int, int]]:
    """Return classic-HWP table logical shapes as (rows, cols) in document order."""
    return [(int(t["rows"]), int(t["cols"])) for t in classic_hwp_table_structures(path)]


def infer_report_date(bundle: TemplateBundle) -> Optional[dt.date]:
    """Infer a concrete committee date from the templates (ignores day/month 00).

    2026_2 병합본은 "2026.8.31." / "2026. 8. 31." 점 표기를 쓰고, 미확정 칸은
    "2026.8.00"으로 남는다. 유효한 날짜 후보 중 가장 늦은 날짜(결의일)를 쓴다.
    """
    candidates: list[dt.date] = []
    paths: list[Path] = []
    if bundle.directory:
        paths = _template_paths(bundle.directory)
    for p in paths:
        try:
            text = template_text(p)
        except Exception:
            continue
        pats = (r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일",
                r"(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?")
        for pat in pats:
            for y, m, d in re.findall(pat, text):
                yi, mi, di = int(y), int(m), int(d)
                if mi <= 0 or di <= 0 or mi > 12 or di > 31:
                    continue
                try:
                    candidates.append(dt.date(yi, mi, di))
                except ValueError:
                    pass
    return max(candidates) if candidates else None


def load_default_dept_map(root: Path, year: int, round_no: int) -> tuple[dict[str, str], str]:
    p = root / "config" / f"dept_map_{year}_{round_no}.csv"
    if not p.exists():
        return {}, ""
    out: dict[str, str] = {}
    with open(p, encoding="utf-8-sig", newline="") as f:
        for row in csv.reader(f):
            if len(row) < 2:
                continue
            name, dept = kca.normalize_name_list(row[0]), kca.norm_text(row[1])
            if name and name != "주발명자" and dept:
                out[name] = dept
    return out, str(p)


def _norm(s: Any) -> str:
    t = "" if s is None else str(s)
    t = t.replace("’", "'").replace("‘", "'").replace("·", "")
    return re.sub(r"\s+", "", t)


def preflight_template(doc: Any, template: Path) -> dict[str, list[str]]:
    """OS-independent structural/anchor check using classic-HWP text extraction."""
    result = {"errors": [], "warnings": [], "info": []}
    try:
        text = template_text(template)
    except Exception as e:
        result["errors"].append(f"HWP 텍스트 추출 실패: {e}")
        return result
    ntext = _norm(text)
    if not ntext:
        result["errors"].append("템플릿 텍스트를 읽지 못했습니다.")
        return result

    try:
        structures = table_structures(template)
    except Exception as e:
        result["errors"].append(f"HWP 표 구조 추출 실패: {e}")
        return result

    for t in getattr(doc, "tables", []):
        idx = int(getattr(t, "index", -1))
        if idx < 0 or idx >= len(structures):
            result["errors"].append(
                f"표 구조 불일치: {getattr(t, 'name', '')}가 표{idx}를 요구하지만 템플릿 표는 {len(structures)}개")
            continue
        st = structures[idx]
        rows, cols = int(st["rows"]), int(st["cols"])
        ncols = int(getattr(t, "ncols", 0))
        if cols != ncols:
            result["errors"].append(
                f"표{idx}({getattr(t, 'name', '')}) 열 수 불일치: 템플릿 {cols}열 / 계획 {ncols}열")
            continue
        prefix = int(getattr(t, "prefix_cells", 0))
        plan_rows = len(getattr(t, "rows", []))
        setattr(t, "_template_rows", rows)
        setattr(t, "_template_cols", cols)
        head_rows, tprefix = traversal_prefix(st, prefix)
        ttotal = traversal_cell_count(st)
        tmerges = traversal_merge_runs(st, prefix)
        setattr(t, "_traversal_prefix", tprefix)
        setattr(t, "_traversal_total", ttotal)
        setattr(t, "_traversal_merge_runs", tmerges)
        setattr(t, "_header_rows", head_rows)
        data_cells = ttotal - tprefix
        if ncols and data_cells % ncols:
            result["errors"].append(
                f"표{idx}({getattr(t, 'name', '')}) 순회 셀 수 불일치:"
                f" 머리 {tprefix} + 데이터 {data_cells} (÷{ncols} 나누어떨어지지 않음)")
            continue
        if tprefix != prefix:
            result["info"].append(
                f"표{idx}({getattr(t, 'name', '')}) 머리 {head_rows}행 —"
                f" 병합 때문에 한/글 순회 기준 머리셀 {tprefix}개(물리 {prefix}개)")
        if tmerges:
            result["info"].append(
                f"표{idx}({getattr(t, 'name', '')}) 데이터 영역 세로병합 {len(tmerges)}곳 —"
                f" 채우기 전에 분할(결과물은 병합 없는 표)")
        merged_col = getattr(t, "merged_run_col", None)
        merge_runs: list[tuple[int, int]] = []
        unexpected: list[str] = []
        # prefix==ncols means a simple 1-row header followed by the data grid.
        # Complex statistical tables intentionally contain merged header rows and are
        # validated by column count + HWP header text instead of this data-area rule.
        simple_data_grid = prefix == ncols
        if simple_data_grid and merged_col is not None:
            for cell in st.get("cells", []):
                # Only data-area vertical merges in the declared repeated-value column are safe to auto-split.
                if int(cell.get("row", 0)) <= 0:
                    continue
                cs, rs = int(cell.get("col_span", 1)), int(cell.get("row_span", 1))
                col = int(cell.get("col", 0))
                if rs > 1 and col == int(merged_col) and cs == 1:
                    merge_runs.append((int(cell.get("seq", 0)), rs))
                elif rs > 1 or cs > 1:
                    unexpected.append(
                        f"seq{cell.get('seq')} col{col} row{cell.get('row')} span{cs}x{rs}")
        elif simple_data_grid and merged_col is None:
            for cell in st.get("cells", []):
                if int(cell.get("row", 0)) > 0 and (int(cell.get("row_span", 1)) > 1 or int(cell.get("col_span", 1)) > 1):
                    unexpected.append(
                        f"seq{cell.get('seq')} col{cell.get('col')} row{cell.get('row')} "
                        f"span{cell.get('col_span')}x{cell.get('row_span')}")
        setattr(t, "_template_vertical_merges", merge_runs)
        setattr(t, "_template_uses_vertical_merge", bool(merge_runs))
        if unexpected:
            result["errors"].append(
                f"표{idx}({getattr(t, 'name', '')}) 데이터 영역에 예상 밖 병합 존재: " + "; ".join(unexpected[:6]))
        if prefix == ncols and rows >= 1:
            existing = rows - 1
            if not bool(getattr(t, "resize", True)) and existing != plan_rows:
                result["errors"].append(
                    f"표{idx}({getattr(t, 'name', '')}) 고정 행 수 불일치: 템플릿 {existing}행 / 계획 {plan_rows}행")
            elif existing != plan_rows:
                result["info"].append(
                    f"표{idx}({getattr(t, 'name', '')}) 데이터 행 자동조정 예정: 템플릿 {existing}행 → MASTER {plan_rows}행")
        if merge_runs:
            result["info"].append(
                f"표{idx}({getattr(t, 'name', '')}) 세로병합 {len(merge_runs)}곳 사전분석 완료")
        result["info"].append(f"표{idx}({getattr(t, 'name', '')}) 구조 {rows}행×{cols}열 확인")

    for cw in getattr(doc, "cell_writes", []):
        ti = int(getattr(cw, "table_index", -1))
        seq = int(getattr(cw, "cell_seq", -1))
        if ti < 0 or ti >= len(structures):
            result["errors"].append(
                f"셀 구조 불일치: {getattr(cw, 'name', '')}가 표{ti}를 요구하지만 템플릿 표는 {len(structures)}개")
            continue
        physical = len(structures[ti].get("cells", []))
        if seq < 0 or seq >= physical:
            result["errors"].append(
                f"셀 구조 불일치: 표{ti} {getattr(cw, 'name', '')}의 셀순번 {seq} / 물리셀 {physical}개")

    missing: list[str] = []
    skipped_optional = 0
    n_anchors = 0
    for pr in getattr(doc, "para_replaces", []):
        n_anchors += 1
        cands = [pr.anchor] + list(getattr(pr, "alt_anchors", []) or [])
        found = any(_norm(a) in ntext for a in cands if a)
        rx = getattr(pr, "anchor_regex", "") or ""
        if not found and rx:
            found = bool(re.search(rx, text, re.MULTILINE))
        if not found:
            if bool(getattr(pr, "optional", False)):
                skipped_optional += 1
            else:
                missing.append(f"문단/{getattr(pr, 'name', '')}: 『{pr.anchor}』")
    for pic in getattr(doc, "pictures", []):
        n_anchors += 1
        if _norm(pic.anchor) not in ntext:
            missing.append(f"그림: 『{pic.anchor}』")
    if missing:
        result["errors"].append("anchor 미발견 — " + "; ".join(missing))
    else:
        note = f" (양식에 없는 선택 항목 {skipped_optional}건 생략)" if skipped_optional else ""
        result["info"].append(f"문단/그림 anchor {n_anchors - skipped_optional}개 확인{note}")

    # 붙임5의 별첨 평가표는 템플릿에 이미 존재하므로, 목록의 제목+주발명자가
    # 템플릿 본문에 모두 있는지 확인한 뒤 그대로 보존한다.
    if getattr(doc, "key", "") == "b5":
        table = next((t for t in getattr(doc, "tables", []) if getattr(t, "name", "") == "심의 목록"), None)
        if table:
            matched = 0
            missing_items = []
            for row in table.rows:
                if len(row) < 6:
                    continue
                title, inventor = str(row[3]), str(row[5])
                if _norm(title) in ntext and _norm(inventor) in ntext:
                    matched += 1
                else:
                    missing_items.append(f"No.{row[0]} {inventor} / {title[:28]}")
            if missing_items:
                result["errors"].append(
                    f"별첨 평가표 연계 확인 {matched}/{len(table.rows)} — 현재 MASTER와 기존 별첨이 달라 자동 보존할 수 없음: "
                    + "; ".join(missing_items[:5])
                )
                result["warnings"].append(
                    "별첨 평가표는 MASTER에 없는 자료(심의결과표 원본)이므로 회차가 바뀌면 항상 불일치합니다. "
                    "본문 표는 그대로 자동 생성하되, 별첨 개별 평가표는 생성 후 이번 회차 자료로 교체하십시오."
                )
            else:
                result["info"].append(f"별첨 평가표 연계 {matched}/{len(table.rows)}건 확인 — 기존 별첨 보존 가능")
    return result


def _cell_style_core(cell: dict[str, Any], *, include_border: bool = True) -> tuple[Any, ...]:
    """Return style attributes that should survive template-based text edits.

    Cell height is excluded because long titles may legitimately wrap and grow.
    """
    core = (
        int(cell.get("width", 0)),
        tuple(cell.get("margins", (0, 0, 0, 0))),
        cell.get("para_shape_id"),
        cell.get("para_style_id"),
        cell.get("char_shape_id"),
    )
    return core + (int(cell.get("border_fill_id", 0)),) if include_border else core


def _cell_layout_core(cell: dict[str, Any], *, include_border: bool = True) -> tuple[Any, ...]:
    """눈에 보이는 레이아웃만 비교한다(폭·여백·테두리/채우기).

    셀 안 글자를 지우고 다시 쓰면 한/글이 문단/글자 모양 ID를 새로 배정하는
    일이 흔하다. 모양이 실제로 같아도 ID가 달라지므로 ID 차이는 실패가 아니라
    경고로 다룬다(v0.2.8).
    """
    core = (int(cell.get("width", 0)), tuple(cell.get("margins", (0, 0, 0, 0))))
    return core + (int(cell.get("border_fill_id", 0)),) if include_border else core


def _by_coord(table: dict[str, Any]) -> dict[tuple[int, int], dict[str, Any]]:
    return {(int(c.get("col", -1)), int(c.get("row", -1))): c for c in table.get("cells", [])}


def embedded_image_summary(path: Path) -> tuple[int, int]:
    """저장본에 포함된 이미지 (개수, 총 바이트). .hwp/.hwpx 모두 지원."""
    items = embedded_image_bytes(Path(path))
    return len(items), sum(len(d) for _, d in items)


def audit_generated_document(doc: Any, template: Path, generated: Path) -> dict[str, list[str]]:
    if is_hwpx(Path(generated)) or is_hwpx(Path(template)):
        return audit_generated_hwpx(doc, Path(template), Path(generated))
    """Post-save HWP table-design audit against the original template.

    Checks width, cell margins, border/fill IDs, paragraph/character style IDs,
    logical row/column counts and declared vertical merges. Long-table middle
    rows may use several legitimate borderFill IDs around page boundaries; any
    middle-row style already present in the template is accepted.
    """
    result: dict[str, list[str]] = {"errors": [], "warnings": [], "info": []}
    try:
        src_tables = classic_hwp_table_structures(template)
        out_tables = classic_hwp_table_structures(generated)
    except Exception as e:
        result["errors"].append(f"저장 후 HWP 표 스타일 분석 실패: {e}")
        return result

    def core_no_border(cell: dict[str, Any]) -> tuple[Any, ...]:
        return _cell_style_core(cell, include_border=False)

    for t in getattr(doc, "tables", []):
        idx = int(getattr(t, "index", -1))
        name = getattr(t, "name", "")
        if idx < 0 or idx >= len(src_tables) or idx >= len(out_tables):
            result["errors"].append(f"표{idx}({name}) 저장 후 표 인덱스가 유지되지 않았습니다.")
            continue
        src, out = src_tables[idx], out_tables[idx]
        ncols = int(getattr(t, "ncols", 0))
        if int(out.get("cols", 0)) != ncols:
            result["errors"].append(
                f"표{idx}({name}) 저장 후 열 수 변경: {out.get('cols')}열 / 기대 {ncols}열")
            continue

        prefix = int(getattr(t, "prefix_cells", 0))
        rows_plan = len(getattr(t, "rows", []))
        simple_grid = prefix == ncols
        src_by = _by_coord(src)
        out_by = _by_coord(out)

        if not simple_grid:
            bad = 0
            for coord, a in src_by.items():
                b = out_by.get(coord)
                if b is None or _cell_layout_core(a) != _cell_layout_core(b):
                    bad += 1
            if bad:
                result["errors"].append(f"표{idx}({name}) 고정표 스타일 {bad}셀 변경")
            else:
                result["info"].append(f"표{idx}({name}) 고정표 스타일 보존 확인")
            continue

        header_bad = 0
        for col in range(ncols):
            a, b = src_by.get((col, 0)), out_by.get((col, 0))
            if a is None or b is None or _cell_layout_core(a) != _cell_layout_core(b):
                header_bad += 1
        if header_bad:
            result["errors"].append(f"표{idx}({name}) 머리행 레이아웃 {header_bad}셀 변경(폭/여백/테두리)")

        expected_rows = rows_plan + 1
        if int(out.get("rows", 0)) != expected_rows:
            result["errors"].append(
                f"표{idx}({name}) 저장 후 행 수 불일치: {out.get('rows')}행 / 기대 {expected_rows}행")
            continue
        if rows_plan == 0:
            result["info"].append(f"표{idx}({name}) 데이터 0행 구조 확인")
            continue

        src_rows = int(src.get("rows", 0))
        if src_rows < 2:
            result["warnings"].append(f"표{idx}({name}) 템플릿 데이터행 스타일 원형이 부족해 상세 비교 생략")
            continue
        merged_col = getattr(t, "merged_run_col", None)
        template_uses_merge = False
        if merged_col is not None:
            template_uses_merge = any(
                int(c.get("row", 0)) > 0 and int(c.get("col", -1)) == int(merged_col)
                and int(c.get("row_span", 1)) > 1
                for c in src.get("cells", [])
            )

        first_ref = {c: src_by.get((c, 1)) for c in range(ncols)}
        last_ref = {c: src_by.get((c, src_rows - 1)) for c in range(ncols)}
        middle_core: dict[int, set[tuple[Any, ...]]] = {c: set() for c in range(ncols)}
        middle_border: dict[int, set[int]] = {c: set() for c in range(ncols)}
        for r in range(2, max(2, src_rows - 1)):
            for c in range(ncols):
                cell = src_by.get((c, r))
                if cell is None:
                    continue
                middle_core[c].add(core_no_border(cell))
                middle_border[c].add(int(cell.get("border_fill_id", 0)))
        for c in range(ncols):
            if not middle_core[c] and first_ref[c] is not None:
                middle_core[c].add(core_no_border(first_ref[c]))
                middle_border[c].add(int(first_ref[c].get("border_fill_id", 0)))

        bad = 0
        compared = 0
        for row in range(1, expected_rows):
            for col in range(ncols):
                if template_uses_merge and merged_col is not None and col == int(merged_col):
                    continue
                b = out_by.get((col, row))
                if b is None:
                    bad += 1
                    continue
                compared += 1
                if row == 1:
                    a = first_ref.get(col)
                    if a is None or _cell_layout_core(a) != _cell_layout_core(b):
                        bad += 1
                elif row == expected_rows - 1:
                    a = last_ref.get(col)
                    if a is None or _cell_layout_core(a) != _cell_layout_core(b):
                        bad += 1
                else:
                    if core_no_border(b) not in middle_core[col]:
                        bad += 1
                    elif int(b.get("border_fill_id", 0)) not in middle_border[col]:
                        bad += 1
        if bad:
            result["errors"].append(
                f"표{idx}({name}) 데이터행 레이아웃 {bad}셀 불일치 (비교 {compared}셀) — 폭/여백/테두리 확인")
        else:
            result["info"].append(f"표{idx}({name}) 데이터행 스타일 {compared}셀 보존 확인")

        if merged_col is not None and template_uses_merge:
            lengths = [int(x) for x in (getattr(t, "merged_run_lengths", []) or [])]
            if sum(lengths) != rows_plan:
                result["errors"].append(
                    f"표{idx}({name}) 병합계획 합계 오류: {sum(lengths)} != 데이터 {rows_plan}행")
            else:
                logical = 1
                merge_bad = 0
                for run_len in lengths:
                    cell = out_by.get((int(merged_col), logical))
                    if cell is None or int(cell.get("row_span", 1)) != run_len:
                        merge_bad += 1
                    logical += run_len
                if merge_bad:
                    result["errors"].append(f"표{idx}({name}) 세로병합 {merge_bad}그룹 불일치")
                else:
                    result["info"].append(f"표{idx}({name}) 세로병합 {len(lengths)}그룹 저장 확인")
        elif merged_col is not None:
            unexpected = [
                c for c in out.get("cells", [])
                if int(c.get("row", 0)) > 0 and int(c.get("col", -1)) == int(merged_col)
                and int(c.get("row_span", 1)) > 1
            ]
            if unexpected:
                result["errors"].append(f"표{idx}({name}) 원본에 없던 세로병합이 생성되었습니다.")
            else:
                result["info"].append(f"표{idx}({name}) 원본과 동일하게 세로병합 없음")

    return result


def _counter_diff(cur: Counter, gold: Counter) -> tuple[list[Any], list[Any]]:
    extra = list((cur - gold).elements())
    missing = list((gold - cur).elements())
    return extra, missing


def _fmt_items(items: list[tuple], limit: int = 6) -> str:
    if not items:
        return "없음"
    parts = []
    for it in items[:limit]:
        parts.append(" / ".join(str(x) for x in it if str(x)))
    if len(items) > limit:
        parts.append(f"외 {len(items)-limit}건")
    return "; ".join(parts)


def _norm_id(value: Any, kind: str = "") -> str:
    s = _norm(value).upper()
    s = s.replace("–", "-").replace("—", "-")
    if kind == "waiver":
        # MarkPro sometimes exports domestic patent numbers with payment-sequence suffixes.
        s = re.sub(r"-00-00$", "", s)
    return s


def archival_drift_report(master: Any, root: Path) -> list[str]:
    """Compare identifiers/counts with the archived 2026-1 committee golden set. Advisory only."""
    my = getattr(master, "meeting_year", None)
    mr = getattr(master, "meeting_round", None)
    if my is not None or mr is not None:
        if (my, mr) != (2026, 1):
            return []
    elif "2025년 4분기" not in getattr(master, "period_label", "") or "2026년 1분기" not in getattr(master, "period_label", ""):
        return []
    gp = root / "tools" / "golden_2026_1.json"
    if not gp.exists():
        return []
    g = json.loads(gp.read_text(encoding="utf-8"))
    et = g.get("expected_tables", {})

    cur_sets = {
        "출원": Counter(_norm_id(r.get("출원번호"), "application") for r in master.applications),
        "등록": Counter(_norm_id(r.get("등록번호"), "registration") for r in master.registrations),
        "국외심의": Counter(_norm_id(r.get("출원번호") or "(출원전)", "foreign") for r in master.foreign_reviews),
        "포기": Counter(_norm_id(r.get("등록번호"), "waiver") for r in master.waivers),
    }
    gold_sets = {
        "출원": Counter(
            [_norm_id(r[2], "application") for r in et.get("b1_dom", [])]
            + [_norm_id(r[3], "application") for r in et.get("b1_for", [])]
        ),
        "등록": Counter(
            [_norm_id(r[2], "registration") for r in et.get("b2_dom", [])]
            + [_norm_id(r[3], "registration") for r in et.get("b2_for", [])]
        ),
        "국외심의": Counter(_norm_id(r[2], "foreign") for r in et.get("b5_list", [])),
        "포기": Counter(
            [_norm_id(r[2], "waiver") for r in et.get("b6_dom", [])]
            + [_norm_id(r[3], "waiver") for r in et.get("b6_for", [])]
        ),
    }

    lines: list[str] = []
    for name in ("출원", "등록", "국외심의", "포기"):
        cur, gold = cur_sets[name], gold_sets[name]
        extra, missing = _counter_diff(cur, gold)
        if extra or missing:
            lines.append(
                f"{name}: 현재 {sum(cur.values())}건 / 2026-1 보관 정본 {sum(gold.values())}건; "
                f"추가 [{_fmt_items([(x,) for x in extra])}]; 누락 [{_fmt_items([(x,) for x in missing])}]"
            )
    return lines



# ---------------------------------------------------------------------------
# HWPX (OWPML zip/XML) parsing — v0.2.9
#
# 병합본 양식(2026_2)에는 .hwpx 문서(붙임2·붙임7)가 포함된다. 아래 파서는
# classic 파서와 동일한 dict 형태를 돌려주어 preflight/감사 로직을 공유한다.
# ---------------------------------------------------------------------------
import xml.etree.ElementTree as _ET

HP_NS = "http://www.hancom.co.kr/hwpml/2011/paragraph"
HP = "{%s}" % HP_NS


def is_hwpx(path: Path) -> bool:
    return Path(path).suffix.lower() == ".hwpx"


def hwpx_section_names(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as z:
        return sorted(n for n in z.namelist() if re.fullmatch(r"Contents/section\d+\.xml", n))


def hwpx_section_roots(path: Path) -> list[_ET.Element]:
    with zipfile.ZipFile(path) as z:
        return [_ET.fromstring(z.read(n)) for n in hwpx_section_names(path)]


def _hwpx_direct_texts(p: _ET.Element) -> list[_ET.Element]:
    """이 문단 소속 텍스트 노드(run 바로 아래 t). 중첩 표/개체 내부는 제외."""
    out: list[_ET.Element] = []
    for run in p.findall(f"{HP}run"):
        for child in run:
            if child.tag == f"{HP}t":
                out.append(child)
    return out


def hwpx_para_text(p: _ET.Element) -> str:
    return "".join("".join(t.itertext()) for t in _hwpx_direct_texts(p))


def hwpx_text(path: Path) -> str:
    """모든 문단(표 셀 포함)의 텍스트를 문단 단위 개행으로 연결."""
    lines: list[str] = []
    for root in hwpx_section_roots(path):
        for p in root.iter(f"{HP}p"):
            lines.append(hwpx_para_text(p))
    return "\n".join(lines)


def _hwpx_first_para_ids(tc: _ET.Element) -> tuple[Optional[int], Optional[int], Optional[int]]:
    p = tc.find(f".//{HP}p")
    if p is None:
        return None, None, None
    para_pr = p.get("paraPrIDRef")
    style = p.get("styleIDRef")
    run = p.find(f"{HP}run")
    char_pr = run.get("charPrIDRef") if run is not None else None
    to_int = lambda v: int(v) if v is not None and str(v).isdigit() else None
    return to_int(para_pr), to_int(style), to_int(char_pr)


def hwpx_table_structures(path: Path) -> list[dict[str, Any]]:
    """classic_hwp_table_structures와 동일한 형태의 표 구조(+스타일 메타)."""
    out: list[dict[str, Any]] = []
    for root in hwpx_section_roots(path):
        for tbl in root.iter(f"{HP}tbl"):
            rows = int(tbl.get("rowCnt", 0) or 0)
            cols = int(tbl.get("colCnt", 0) or 0)
            cells: list[dict[str, Any]] = []
            raw: list[tuple[int, int, _ET.Element]] = []
            for tc in tbl.iter(f"{HP}tc"):
                # 중첩 표의 셀 제외: 가장 가까운 tbl 조상이 이 tbl인 셀만
                # (ElementTree에는 부모 참조가 없어, 중첩 tbl 셀을 미리 수집해 배제)
                raw.append((0, 0, tc))
            nested: set[int] = set()
            for sub in tbl.iter(f"{HP}tbl"):
                if sub is tbl:
                    continue
                for tc in sub.iter(f"{HP}tc"):
                    nested.add(id(tc))
            for _, _, tc in raw:
                if id(tc) in nested:
                    continue
                addr = tc.find(f"{HP}cellAddr")
                span = tc.find(f"{HP}cellSpan")
                sz = tc.find(f"{HP}cellSz")
                mg = tc.find(f"{HP}cellMargin")
                pp, ps, cp = _hwpx_first_para_ids(tc)
                cells.append({
                    "col": int(addr.get("colAddr", 0)) if addr is not None else 0,
                    "row": int(addr.get("rowAddr", 0)) if addr is not None else 0,
                    "col_span": int(span.get("colSpan", 1)) if span is not None else 1,
                    "row_span": int(span.get("rowSpan", 1)) if span is not None else 1,
                    "width": int(sz.get("width", 0)) if sz is not None else 0,
                    "height": int(sz.get("height", 0)) if sz is not None else 0,
                    "margins": tuple(int(mg.get(k, 0)) for k in ("left", "right", "top", "bottom")) if mg is not None else (0, 0, 0, 0),
                    "border_fill_id": int(tc.get("borderFillIDRef", 0) or 0),
                    "para_shape_id": pp, "para_style_id": ps, "char_shape_id": cp,
                })
            cells.sort(key=lambda c: (c["row"], c["col"]))
            for i, c in enumerate(cells):
                c["seq"] = i
            out.append({"rows": rows, "cols": cols, "cells": cells})
    return out


def template_text(path: Path) -> str:
    """형식(.hwp/.hwpx)에 맞는 전체 텍스트 추출."""
    p = Path(path)
    if is_hwpx(p):
        return hwpx_text(p)
    return kca.extract_classic_hwp_text(p)


def table_structures(path: Path) -> list[dict[str, Any]]:
    p = Path(path)
    if is_hwpx(p):
        return hwpx_table_structures(p)
    return classic_hwp_table_structures(p)


def hwpx_image_items(path: Path) -> list[tuple[str, bytes]]:
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if n.startswith("BinData/")]
        return [(n, z.read(n)) for n in sorted(names)]


def classic_image_streams(path: Path) -> list[tuple[str, bytes]]:
    """classic HWP BinData 스트림(압축 해제 시도 포함)을 (이름, 바이트)로 반환."""
    out: list[tuple[str, bytes]] = []
    try:
        c = kca._CFB(path)
        fh = c.stream("FileHeader") or b""
        flags = struct.unpack_from("<I", fh, 36)[0] if len(fh) >= 40 else 0
        compressed = bool(flags & 1)
        for e in c.entries:
            name = e.get("name", "")
            if e.get("type") == 2 and re.match(r"(?i)^(BIN|BinData)", name):
                data = c.stream(name) or b""
                if compressed:
                    try:
                        data = zlib.decompress(data, -15)
                    except Exception:
                        pass
                out.append((name, data))
    except Exception:
        pass
    return out


def embedded_image_bytes(path: Path) -> list[tuple[str, bytes]]:
    p = Path(path)
    return hwpx_image_items(p) if is_hwpx(p) else classic_image_streams(p)


def embedded_image_contains(path: Path, payload: bytes) -> bool:
    """저장본 안에 지정 이미지 바이트가 실제로 들어 있는지 확인."""
    if not payload:
        return False
    for _, data in embedded_image_bytes(path):
        if data == payload or payload in data:
            return True
    return False


def audit_generated_hwpx(doc: Any, template: Path, generated: Path) -> dict[str, list[str]]:
    """HWPX 산출물 감사: 표 구조·병합·머리행 스타일·테두리채움 참조 일치.

    classic 감사와 항목 구성은 같되, 스타일 심층 비교는 ID 참조(borderFill/
    paraPr/charPr) 다중집합 비교로 대신한다(같은 파일 내 참조라 결정적).
    """
    result = {"errors": [], "warnings": [], "info": []}
    try:
        t_tabs = hwpx_table_structures(template)
        g_tabs = hwpx_table_structures(generated)
    except Exception as e:
        result["errors"].append(f"HWPX 구조 분석 실패: {e}")
        return result
    if len(t_tabs) != len(g_tabs):
        result["errors"].append(f"표 개수 변화: 템플릿 {len(t_tabs)} → 저장본 {len(g_tabs)}")
        return result
    plans = {int(getattr(t, "index", -1)): t for t in getattr(doc, "tables", [])}
    for i, (tt, gg) in enumerate(zip(t_tabs, g_tabs)):
        name = getattr(plans.get(i), "name", "") if i in plans else ""
        label = f"표{i}" + (f"({name})" if name else "")
        if int(tt["cols"]) != int(gg["cols"]):
            result["errors"].append(f"{label} 열 수 변화: {tt['cols']} → {gg['cols']}")
            continue
        t_plan = plans.get(i)
        if t_plan is not None and bool(getattr(t_plan, "resize", True)):
            want_rows = len(getattr(t_plan, "rows", [])) + header_row_count(tt, int(getattr(t_plan, "prefix_cells", 0)))
            if int(gg["rows"]) != want_rows:
                result["errors"].append(f"{label} 저장 후 행 수 불일치: {gg['rows']}행 / 기대 {want_rows}행")
                continue
        elif int(tt["rows"]) != int(gg["rows"]):
            result["errors"].append(f"{label} 행 수 변화: {tt['rows']} → {gg['rows']}")
            continue
        # 머리행 서식 참조 보존 (행 수가 달라져도 머리행은 그대로여야 한다)
        prefix = int(getattr(t_plan, "prefix_cells", 0)) if t_plan is not None else 0
        hrows = header_row_count(tt, prefix) if prefix else 0
        th = Counter((c["row"], c["col"], c["border_fill_id"], c["para_shape_id"], c["char_shape_id"])
                     for c in tt["cells"] if c["row"] < hrows)
        gh = Counter((c["row"], c["col"], c["border_fill_id"], c["para_shape_id"], c["char_shape_id"])
                     for c in gg["cells"] if c["row"] < hrows)
        if th != gh:
            result["errors"].append(f"{label} 머리행 서식 참조 변화")
            continue
        # 데이터행 테두리채움 참조 구성 확인 (행 복제 기반이므로 종류 집합이 보존되어야 함)
        t_ref = {c["border_fill_id"] for c in tt["cells"] if c["row"] >= hrows}
        g_ref = {c["border_fill_id"] for c in gg["cells"] if c["row"] >= hrows}
        extra = g_ref - t_ref
        if extra:
            result["errors"].append(f"{label} 데이터행에 새 테두리채움 ID {sorted(extra)} 생성")
            continue
        result["info"].append(f"{label} 구조·머리행·테두리채움 참조 보존 확인")
    return result
