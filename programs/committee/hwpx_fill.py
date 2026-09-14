# -*- coding: utf-8 -*-
"""HWPX(OWPML zip/XML) 직접 편집 적용기 — KRISS 위원회 안건 v0.2.9

병합본(2026_2) 양식에는 .hwpx 문서(붙임2·붙임7)가 포함된다. HWPX는 zip 안의
XML이므로 한/글 COM 없이 어느 OS에서나 다음을 결정적으로 수행할 수 있다.

  * 셀 기입(여러 문단 셀은 꼬리 일치 분배로 줄 구성 보존, 동일 값은 무변경)
  * 표 데이터 행 수 조정(행 복제/삭제 + rowAddr 재색인) — COM 행 액션 불필요
  * 문단 부분치환/교체(표·그림 개체는 XML 상 그대로 보존)
  * 그림 교체(BinData 바이트 교체 + 크기 메타데이터 갱신)
  * 저장 후 자체 재파싱 검증(값·구조·그림 바이트)

hwp_fill.DocPlan 계획 객체를 그대로 받으며, 보고 형식도 COM 경로와 맞춘다.
"""
from __future__ import annotations

import copy
import re
import struct
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Optional

import hwp_support

HP_NS = hwp_support.HP_NS
HP = hwp_support.HP
HC_NS = "http://www.hancom.co.kr/hwpml/2011/core"
HC = "{%s}" % HC_NS

_XMLDECL = b'<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'


def _norm(s: Any) -> str:
    t = "" if s is None else str(s)
    t = t.replace("\u2019", "'").replace("\u2018", "'").replace("\u00b7", "·")
    return re.sub(r"\s+", "", t)


def _same(a: Any, b: Any) -> bool:
    """값 갱신·검증용 엄격 비교: 공백만 접고 문자는 그대로 비교.

    _norm은 ’/‘를 '로 접어 anchor 탐색을 관대하게 하지만, 그 기준으로
    '이미 동일'을 판정하면 U+2019→U+0027 같은 표기 교정이 스킵된다(v0.2.9).
    """
    fold = lambda v: re.sub(r"\s+", "", "" if v is None else str(v))
    return fold(a) == fold(b)


def _apply_subs(cur: str, subs) -> str:
    out = cur
    for pat, repl in subs or []:
        out = re.sub(pat, repl, out)
    return out


def _target_text(cur: str, pr) -> str:
    subs = getattr(pr, "subs", None)
    return _apply_subs(cur, subs) if subs else pr.text


def _png_pixels(data: bytes) -> tuple[int, int]:
    if len(data) >= 24 and data[12:16] == b"IHDR":
        w, h = struct.unpack(">II", data[16:24])
        return int(w), int(h)
    return 0, 0


def _register_namespaces(raw: bytes):
    for prefix, uri in re.findall(rb'xmlns:([A-Za-z0-9_]+)="([^"]+)"', raw):
        ET.register_namespace(prefix.decode(), uri.decode())


class HwpxDoc:
    """하나의 .hwpx 파일을 메모리에서 편집한다."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.entries: dict[str, bytes] = {}
        self.order: list[zipfile.ZipInfo] = []
        with zipfile.ZipFile(self.path) as z:
            for info in z.infolist():
                self.order.append(info)
                self.entries[info.filename] = z.read(info)
        self.section_names = sorted(
            n for n in self.entries if re.fullmatch(r"Contents/section\d+\.xml", n))
        for n in self.section_names:
            _register_namespaces(self.entries[n])
        if "Contents/content.hpf" in self.entries:
            _register_namespaces(self.entries["Contents/content.hpf"])
        self.roots: dict[str, ET.Element] = {
            n: ET.fromstring(self.entries[n]) for n in self.section_names}

    # ---- 구조 접근 ----
    def tables(self) -> list[ET.Element]:
        out: list[ET.Element] = []
        for n in self.section_names:
            out.extend(self.roots[n].iter(f"{HP}tbl"))
        return out

    def paragraphs(self) -> list[ET.Element]:
        out: list[ET.Element] = []
        for n in self.section_names:
            out.extend(self.roots[n].iter(f"{HP}p"))
        return out

    @staticmethod
    def para_text(p: ET.Element) -> str:
        return hwp_support.hwpx_para_text(p)

    @staticmethod
    def _direct_ts(p: ET.Element) -> list[ET.Element]:
        return hwp_support._hwpx_direct_texts(p)

    @staticmethod
    def set_para_text(p: ET.Element, text: str):
        """문단의 직접 텍스트만 교체(표/그림 등 개체 노드는 손대지 않음)."""
        ts = HwpxDoc._direct_ts(p)
        if not ts:
            runs = p.findall(f"{HP}run")
            run = runs[0] if runs else ET.SubElement(p, f"{HP}run")
            t = ET.SubElement(run, f"{HP}t")
            t.text = text
            return
        first = ts[0]
        for extra in list(first):
            first.remove(extra)
        first.text = text
        for t in ts[1:]:
            for extra in list(t):
                t.remove(extra)
            t.text = ""

    # ---- 셀 ----
    @staticmethod
    def cell_paras(tc: ET.Element) -> list[ET.Element]:
        return list(tc.iter(f"{HP}p"))

    @classmethod
    def cell_text(cls, tc: ET.Element) -> str:
        return "".join(cls.para_text(p) for p in cls.cell_paras(tc))

    @classmethod
    def set_cell_text(cls, tc: ET.Element, text: str) -> str:
        """셀 기입. 여러 문단 셀은 '꼬리 문단 일치' 분배로 줄 구성을 보존한다.

        반환: "keep"(동일 값 유지) | "split"(줄 구성 보존 분배) | "flat"(첫 문단 일괄)
        """
        paras = cls.cell_paras(tc)
        cur = cls.cell_text(tc)
        if _same(cur, text):
            return "keep"
        if len(paras) >= 2:
            tail_texts = [cls.para_text(p) for p in paras[1:]]
            tail = "".join(tail_texts)
            if tail and text.endswith(tail):
                cls.set_para_text(paras[0], text[: len(text) - len(tail)])
                return "split"
            # 앞 문단들이 일치하고 마지막 문단만 바뀌는 경우
            head = "".join(cls.para_text(p) for p in paras[:-1])
            if head and text.startswith(head):
                cls.set_para_text(paras[-1], text[len(head):])
                return "split"
        cls.set_para_text(paras[0] if paras else tc, text)
        for p in paras[1:]:
            cls.set_para_text(p, "")
        return "flat"

    # ---- 저장 ----
    def save(self, out_path: Path):
        for n in self.section_names:
            xml = ET.tostring(self.roots[n], encoding="utf-8")
            self.entries[n] = _XMLDECL + xml
        with zipfile.ZipFile(out_path, "w") as z:
            names = [i.filename for i in self.order]
            # hwpx 계열은 mimetype 항목을 무압축 선두로 두는 편이 안전하다.
            if "mimetype" in names:
                z.writestr(zipfile.ZipInfo("mimetype"), self.entries["mimetype"],
                           compress_type=zipfile.ZIP_STORED)
            for info in self.order:
                if info.filename == "mimetype":
                    continue
                z.writestr(info.filename, self.entries[info.filename],
                           compress_type=zipfile.ZIP_DEFLATED)


def _tbl_trs(tbl: ET.Element) -> list[ET.Element]:
    return tbl.findall(f"{HP}tr")


def _tr_cells(tr: ET.Element) -> list[ET.Element]:
    cells = tr.findall(f"{HP}tc")
    def col(tc):
        a = tc.find(f"{HP}cellAddr")
        return int(a.get("colAddr", 0)) if a is not None else 0
    return sorted(cells, key=col)


def _physical_cells(tbl: ET.Element) -> list[ET.Element]:
    out = []
    for tr in _tbl_trs(tbl):
        out.extend(_tr_cells(tr))
    return out


def _live_struct(tbl: ET.Element) -> dict[str, Any]:
    cells = []
    for tr_i, tr in enumerate(_tbl_trs(tbl)):
        for tc in _tr_cells(tr):
            addr = tc.find(f"{HP}cellAddr")
            span = tc.find(f"{HP}cellSpan")
            cells.append({
                "row": int(addr.get("rowAddr", tr_i)) if addr is not None else tr_i,
                "col": int(addr.get("colAddr", 0)) if addr is not None else 0,
                "row_span": int(span.get("rowSpan", 1)) if span is not None else 1,
                "col_span": int(span.get("colSpan", 1)) if span is not None else 1,
            })
    cells.sort(key=lambda c: (c["row"], c["col"]))
    for i, c in enumerate(cells):
        c["seq"] = i
    rows = max((c["row"] + c["row_span"] for c in cells), default=0)
    cols = max((c["col"] + c["col_span"] for c in cells), default=0)
    return {"rows": rows, "cols": cols, "cells": cells}


def _set_row_addr(tr: ET.Element, row: int):
    for tc in tr.findall(f"{HP}tc"):
        a = tc.find(f"{HP}cellAddr")
        if a is not None:
            a.set("rowAddr", str(row))


def fill_table(doc_tbl: ET.Element, t, report: list[str]) -> bool:
    """TableFill을 HWPX 표에 적용. 반환값은 성공 여부."""
    struct_ = _live_struct(doc_tbl)
    prefix = int(t.prefix_cells)
    hrows = hwp_support.header_row_count(struct_, prefix)
    trs = _tbl_trs(doc_tbl)
    if hrows <= 0 or hrows > len(trs):
        report.append(f"  [실패] 표{t.index}({t.name}): 머리행 계산 실패(prefix={prefix})")
        return False
    # 머리행 대조
    got_header = [HwpxDoc.cell_text(tc) for tc in _physical_cells(doc_tbl)[:prefix]]
    want = [h for h in t.expect_header if h]
    if want and not all(any(_norm(w) == _norm(g) for g in got_header) for w in want[:2]):
        report.append(f"  [실패] 표{t.index}({t.name}): 머리행 불일치 — {got_header[:4]}")
        return False

    data_trs = trs[hrows:]
    # 데이터 영역 병합 검사 — HWPX 직접 편집은 병합 없는 데이터 영역만 다룬다.
    for tr in data_trs:
        for tc in tr.findall(f"{HP}tc"):
            span = tc.find(f"{HP}cellSpan")
            if span is not None and (int(span.get("rowSpan", 1)) != 1 or int(span.get("colSpan", 1)) != 1):
                report.append(
                    f"  [실패] 표{t.index}({t.name}): 데이터 영역에 병합 셀 — 직접 편집 대상 아님")
                return False
        if len(_tr_cells(tr)) != t.ncols:
            report.append(
                f"  [실패] 표{t.index}({t.name}): 데이터 행 셀 수 {len(_tr_cells(tr))} ≠ {t.ncols}")
            return False

    need, have = len(t.rows), len(data_trs)
    resized = ""
    if bool(getattr(t, "resize", True)) and need != have:
        if not data_trs:
            report.append(f"  [실패] 표{t.index}({t.name}): 복제할 데이터 행이 없습니다")
            return False
        if have > need:
            for tr in data_trs[need:]:
                doc_tbl.remove(tr)
            resized = f" (행 {have}→{need}: {have - need}행 삭제)"
        else:
            model = data_trs[-1]
            insert_at = list(doc_tbl).index(model) + 1
            for k in range(need - have):
                clone = copy.deepcopy(model)
                doc_tbl.insert(insert_at + k, clone)
            resized = f" (행 {have}→{need}: {need - have}행 추가)"
        trs = _tbl_trs(doc_tbl)
        data_trs = trs[hrows:]
        for k, tr in enumerate(data_trs):
            _set_row_addr(tr, hrows + k)
        doc_tbl.set("rowCnt", str(len(trs)))
    elif not bool(getattr(t, "resize", True)) and need != have:
        report.append(
            f"  [실패] 표{t.index}({t.name}): 고정 골격 행 수 불일치 — 템플릿 {have}행 / 계획 {need}행")
        return False

    bad = 0
    samples: list[str] = []
    for r, row in enumerate(t.rows):
        cells = _tr_cells(data_trs[r])
        for c, val in enumerate(row):
            HwpxDoc.set_cell_text(cells[c], val)
            got = HwpxDoc.cell_text(cells[c])
            if not _same(got, val):
                bad += 1
                if len(samples) < 3:
                    samples.append(f"{r + 1}행{c + 1}열")
    if bad:
        report.append(f"  [검증실패] 표{t.index}({t.name}): {bad}셀 불일치 — " + "; ".join(samples))
        return False
    report.append(f"  [완료] 표{t.index}({t.name}): {need}행 기입·값검증{resized}")
    return True


def _para_hit(cur: str, pr) -> bool:
    if getattr(pr, "exclude", "") and pr.exclude in cur:
        return False
    anchors = [pr.anchor] + list(getattr(pr, "alt_anchors", []) or [])
    if any(a and a in cur for a in anchors):
        return True
    rx = getattr(pr, "anchor_regex", "") or ""
    return bool(rx and re.search(rx, cur))


def replace_para(doc: HwpxDoc, pr, report: list[str]) -> bool:
    hits = 0
    changed = 0
    for p in doc.paragraphs():
        cur = doc.para_text(p)
        if not cur or not _para_hit(cur, pr):
            continue
        target = _target_text(cur, pr)
        hits += 1
        if not _same(target, cur):
            doc.set_para_text(p, target)
            changed += 1
        if not getattr(pr, "all_occurrences", False):
            break
    if not hits:
        if getattr(pr, "optional", False):
            report.append(f"  [생략] 문단({pr.name}): 이 양식에 없는 선택 항목")
            return True
        report.append(f"  [실패] 문단({pr.name}): anchor 미발견 『{pr.anchor}』")
        return False
    keep = hits - changed
    detail = f"{changed}곳 교체" + (f" / {keep}곳 동일 유지" if keep else "")
    report.append(f"  [완료] 문단({pr.name}): {detail}")
    return True


def replace_picture(doc: HwpxDoc, pic, report: list[str]) -> bool:
    png = Path(pic.png)
    try:
        payload = png.read_bytes()
    except Exception as e:
        report.append(f"  [실패] 그림: PNG 읽기 실패 {e}")
        return False
    paras = doc.paragraphs()
    anchor_i = next((i for i, p in enumerate(paras)
                     if pic.anchor in doc.para_text(p)), None)
    if anchor_i is None:
        report.append(f"  [실패] 그림: anchor 미발견 『{pic.anchor}』")
        return False
    pic_el = None
    for p in paras[anchor_i: anchor_i + 4]:
        for run in p.findall(f"{HP}run"):
            found = run.find(f"{HP}pic")
            if found is not None:
                pic_el = found
                break
        if pic_el is not None:
            break
    if pic_el is None:
        report.append("  [실패] 그림: anchor 다음에 그림 개체가 없습니다")
        return False
    img = pic_el.find(f"{HC}img")
    if img is None:
        report.append("  [실패] 그림: 이미지 참조(hc:img)가 없습니다")
        return False
    ref = img.get("binaryItemIDRef", "")
    target_entry = None
    hpf = doc.entries.get("Contents/content.hpf", b"").decode("utf-8", "ignore")
    m = re.search(r'<opf:item[^>]*id="%s"[^>]*href="([^"]+)"' % re.escape(ref), hpf)
    href = m.group(1) if m else ""
    for cand in (href, f"Contents/{href}"):
        if cand and cand in doc.entries:
            target_entry = cand
            break
    if target_entry is None:
        bins = [n for n in doc.entries if n.startswith("BinData/") and ref.lower() in n.lower()]
        target_entry = bins[0] if bins else None
    if target_entry is None:
        report.append(f"  [실패] 그림: BinData 항목을 찾지 못함 (ref={ref})")
        return False

    doc.entries[target_entry] = payload
    if not target_entry.lower().endswith(".png") and href:
        doc.entries["Contents/content.hpf"] = re.sub(
            r'(<opf:item[^>]*id="%s"[^>]*media-type=")[^"]*(")' % re.escape(ref),
            r"\g<1>image/png\g<2>", hpf).encode("utf-8")

    # 크기 메타데이터: 원본 px*75(hwpunit) 기준으로 갱신, 표시 폭 유지·비율 재계산
    w_px, h_px = _png_pixels(payload)
    if w_px and h_px:
        org_w, org_h = w_px * 75, h_px * 75
        def _seti(el, **kw):
            if el is not None:
                for k, v in kw.items():
                    el.set(k, str(int(v)))
        _seti(pic_el.find(f"{HP}orgSz"), width=org_w, height=org_h)
        rect = pic_el.find(f"{HP}imgRect")
        if rect is not None:
            pts = {c.tag.split('}')[1]: c for c in rect}
            _seti(pts.get("pt1"), x=org_w, y=0)
            _seti(pts.get("pt2"), x=org_w, y=org_h)
            _seti(pts.get("pt3"), x=0, y=org_h)
        _seti(pic_el.find(f"{HP}imgClip"), right=org_w, bottom=org_h)
        _seti(pic_el.find(f"{HP}imgDim"), dimwidth=org_w, dimheight=org_h)
        cur_sz = pic_el.find(f"{HP}curSz")
        sz = pic_el.find(f"{HP}sz")
        base_w = None
        for el in (cur_sz, sz):
            if el is not None and el.get("width"):
                base_w = int(el.get("width"))
                break
        if base_w:
            new_h = int(round(base_w * h_px / w_px))
            _seti(cur_sz, height=new_h)
            if sz is not None:
                sz.set("height", str(new_h))
            rot = pic_el.find(f"{HP}rotationInfo")
            if rot is not None:
                rot.set("centerX", str(base_w // 2))
                rot.set("centerY", str(new_h // 2))
            ren = pic_el.find(f"{HP}renderingInfo")
            if ren is not None:
                sca = ren.find(f"{HC}scaMatrix")
                if sca is not None:
                    sca.set("e1", f"{base_w / org_w:.6f}")
                    sca.set("e5", f"{new_h / org_h:.6f}")
        cm = pic_el.find(f"{HP}shapeComment")
        if cm is not None:
            cm.text = (f"그림입니다.\r\n원본 그림의 이름: {png.name}\r\n"
                       f"원본 그림의 크기: 가로 {w_px}pixel, 세로 {h_px}pixel")
    report.append(f"  [완료] 그림 교체 → {png.name} (BinData {target_entry} 바이트 교체)")
    return True


def apply_doc(doc_plan, template: Path, out_path: Path, report: list[str]) -> bool:
    """DocPlan을 .hwpx 템플릿에 적용해 out_path로 저장하고 자체 검증한다."""
    try:
        doc = HwpxDoc(Path(template))
    except Exception as e:
        report.append(f"  [실패] HWPX 열기 실패: {e}")
        return False
    ok = True
    tables = doc.tables()

    for cw in doc_plan.cell_writes:
        if cw.table_index >= len(tables):
            report.append(f"  [실패] 셀({cw.name}): 표{cw.table_index} 없음")
            ok = False
            continue
        cells = _physical_cells(tables[cw.table_index])
        if cw.cell_seq >= len(cells):
            report.append(f"  [실패] 셀({cw.name}): 셀 #{cw.cell_seq} 없음")
            ok = False
            continue
        mode = HwpxDoc.set_cell_text(cells[cw.cell_seq], cw.text)
        got = HwpxDoc.cell_text(cells[cw.cell_seq])
        good = _same(got, cw.text)
        ok &= good
        note = {"keep": " — 기존 값과 동일하여 유지",
                "split": " — 줄 구성 보존", "flat": ""}[mode]
        report.append(f"  [{'완료' if good else '검증실패'}] 셀({cw.name}){note}")

    for t in doc_plan.tables:
        if t.index >= len(tables):
            report.append(f"  [실패] 표{t.index}({t.name}): 없음")
            ok = False
            continue
        ok &= fill_table(tables[t.index], t, report)

    for pr in doc_plan.para_replaces:
        ok &= replace_para(doc, pr, report)

    for pic in doc_plan.pictures:
        ok &= replace_picture(doc, pic, report)

    try:
        doc.save(Path(out_path))
    except Exception as e:
        report.append(f"  [실패] HWPX 저장 실패: {e}")
        return False

    # ---- 저장본 자체 검증 ----
    try:
        saved_tabs = hwp_support.hwpx_table_structures(Path(out_path))
        saved = HwpxDoc(Path(out_path))
    except Exception as e:
        report.append(f"  [서식검증실패] 저장 후 재파싱 실패: {e}")
        return False
    stabs = saved.tables()
    for t in doc_plan.tables:
        if t.index >= len(stabs):
            continue
        struct_ = _live_struct(stabs[t.index])
        hrows = hwp_support.header_row_count(struct_, int(t.prefix_cells))
        data_trs = _tbl_trs(stabs[t.index])[hrows:]
        bad = 0
        if len(data_trs) != len(t.rows):
            report.append(
                f"  [서식검증실패] 표{t.index}({t.name}) 저장 후 행 수 불일치:"
                f" {hrows + len(data_trs)}행 / 기대 {hrows + len(t.rows)}행")
            ok = False
            continue
        for r, row in enumerate(t.rows):
            cells = _tr_cells(data_trs[r])
            for c, val in enumerate(row):
                if not _same(HwpxDoc.cell_text(cells[c]), val):
                    bad += 1
        if bad:
            report.append(f"  [서식검증실패] 표{t.index}({t.name}) 저장 후 {bad}셀 값 불일치")
            ok = False
    for pic in doc_plan.pictures:
        try:
            payload = Path(pic.png).read_bytes()
        except Exception:
            payload = b""
        if payload and hwp_support.embedded_image_contains(Path(out_path), payload):
            report.append(f"  [그림검증] {Path(pic.png).name} 바이트 일치 — 차트가 실제 포함됨")
        else:
            ok = False
            report.append(f"  [실패] 그림검증: {Path(pic.png).name} 저장본 미포함")
    audit = hwp_support.audit_generated_hwpx(doc_plan, Path(template), Path(out_path))
    for msg in audit.get("info", []):
        report.append(f"  [서식검증] {msg}")
    for msg in audit.get("warnings", []):
        report.append(f"  [서식경고] {msg}")
    if audit.get("errors"):
        ok = False
        for msg in audit["errors"]:
            report.append(f"  [서식검증실패] {msg}")
    elif doc_plan.tables:
        report.append("  [서식검증] 저장된 HWPX 표 구조·머리행 서식 참조 일치")
    n_img, total = hwp_support.embedded_image_summary(Path(out_path))
    if doc_plan.pictures:
        report.append(f"  [그림확인] 저장본에 이미지 {n_img}개 포함 ({total // 1024}KB)")
    return ok
