# -*- coding: utf-8 -*-
"""COM 적용부 회귀 검증 (Windows/한글 없이 실행).

tools/fake_hwp.py 의 한/글 모형 위에서 hwp_fill.HwpApplier 를 실제로 돌려
실측 로그에 나온 실패들이 재현되는지, v0.2.8 로직이 그 실패를 해소하는지
확인한다.

사용: python tools/validate_com_logic.py    (종료코드 0 = 전체 통과)
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import hwp_fill  # noqa: E402
import hwp_support  # noqa: E402
from fake_hwp import Anchor, Cell, FakeHwp, Table  # noqa: E402

RESULTS: list[tuple[bool, str]] = []


def check(cond: bool, label: str):
    RESULTS.append((bool(cond), label))
    print(("  [OK]   " if cond else "  [FAIL] ") + label)


def applier(hwp) -> hwp_fill.HwpApplier:
    a = hwp_fill.HwpApplier(lambda *_: None)
    a.hwp = hwp
    return a


def detail_table(n_data: int, merged: bool = False) -> Table:
    """머리 1행 + 데이터 n행 x 4열. merged=True면 국가 열이 세로 병합."""
    cells = [Cell(0, c, ["No", "국가", "출원번호", "발명의 명칭"][c]) for c in range(4)]
    span = min(3, n_data)
    for r in range(1, n_data + 1):
        cells.append(Cell(r, 0, str(r)))
        if merged:
            if r == 1:
                cells.append(Cell(r, 1, "미국", row_span=span))
            elif r > span:
                cells.append(Cell(r, 1, "미국"))
        else:
            cells.append(Cell(r, 1, "미국"))
        cells.append(Cell(r, 2, f"A{r}"))
        cells.append(Cell(r, 3, f"명칭{r}"))
    return Table(n_data + 1, 4, cells)


def doc_with(table: Table) -> FakeHwp:
    return FakeHwp([list("□ 세부 현황"), [Anchor("tbl", table)]])


def plan_table(index, rows, *, tprefix=4, merges=None, resize=True):
    t = hwp_fill.TableFill(index, "세부", ["No", "국가", "출원번호", "발명의 명칭"], 4, 4,
                           rows, resize=resize)
    setattr(t, "_traversal_prefix", tprefix)
    setattr(t, "_traversal_merge_runs", merges or [])
    return t


def rows_of(n, tag="새"):
    return [[str(i), "PCT", f"P{i}", f"{tag}{i}"] for i in range(1, n + 1)]


# --------------------------------------------------------------------------
def test_traversal_model_on_real_templates():
    print("\n[1] 실제 템플릿에 대한 순회 모형 (한/글이 세는 셀 수)")
    d = ROOT / "resources" / "hwp_templates" / "2026_1"
    specs = {"붙임1": [(6, 7, 5, 10, 80)], "붙임2": [(6, 5, 4, 5, 61)],
             "붙임5": [(5, 6, 6, 6, 90)], "붙임6": [(6, 6, 6, 6, 78)]}
    for stem, items in specs.items():
        f = next(d.glob(stem + "*"), None)
        if not f:
            check(False, f"{stem} 템플릿 없음")
            continue
        sts = hwp_support.classic_hwp_table_structures(f)
        for idx, phys_prefix, ncols, want_prefix, want_total in items:
            st = sts[idx]
            _, tprefix = hwp_support.traversal_prefix(st, phys_prefix)
            total = hwp_support.traversal_cell_count(st)
            ok = tprefix == want_prefix and total == want_total and (total - tprefix) % ncols == 0
            check(ok, f"{stem} 표{idx}: 순회 {total}셀 / 머리 {tprefix}"
                      f" (기대 {want_total}/{want_prefix})")
    f = next(d.glob("붙임1*"))
    st = hwp_support.classic_hwp_table_structures(f)[6]
    check(hwp_support.traversal_cell_count(st) == 80,
          "붙임1 표6 순회 80셀 — 실측 로그의 '총 80셀'과 일치")


def test_cell_reader():
    print("\n[2] 셀 단위 읽기")
    hwp = doc_with(detail_table(3))
    ap = applier(hwp)
    ctrl = ap.table_ctrls()[0]
    ap.enter_table(ctrl)
    legacy = ap._read_cell_raw("block")
    check(len(legacy) > 30 and "명칭1" in legacy, "v0.2.6 재현: 셀 블록 읽기가 표 전체 반환")
    rep: list[str] = []
    check(ap.probe_cell_reader(ctrl, rep) and ap.cell_read_mode == "list", "프로브가 list 모드 선택")
    ap.enter_table(ctrl)
    check(ap.read_cell() == "No", "첫 셀 = 'No'")


def test_prefix_correction():
    print("\n[3] 병합 머리행이 있는 표(붙임1 표6 유형)")
    cells = [Cell(0, 0, "(단위:건)", col_span=4)]
    cells += [Cell(1, c, ["연도", "국내", "국외", "합계"][c]) for c in range(4)]
    for r in range(2, 5):
        for c in range(4):
            cells.append(Cell(r, c, f"{r}-{c}"))
    tbl = Table(5, 4, cells)
    ap = applier(doc_with(tbl))
    rep: list[str] = []
    ap.probe_cell_reader(ap.table_ctrls()[0], rep)
    t = hwp_fill.TableFill(0, "통계", ["(단위:건)"], 5, 4,
                           [["2024", "1", "2", "3"], ["2025", "4", "5", "6"],
                            ["2026", "7", "8", "9"]], resize=False)
    setattr(t, "_traversal_prefix", 5)
    ok = ap.fill_table(t, rep)
    check(ok, "머리 순회 5 기준 고정표 채움 성공 " + ("" if ok else str(rep)))
    check(tbl.row_texts(2) == ["2024", "1", "2", "3"], "첫 데이터행 정확")
    check(tbl.row_texts(4) == ["2026", "7", "8", "9"], "마지막 데이터행 정확")


def test_merge_split():
    print("\n[4] 데이터 영역 세로병합 분할(결과물은 병합 없는 표)")
    tbl = detail_table(4, merged=True)
    check(tbl.merged_count() == 1, "템플릿에 세로병합 1곳")
    ap = applier(doc_with(tbl))
    rep: list[str] = []
    ap.probe_cell_reader(ap.table_ctrls()[0], rep)
    ok = ap.fill_table(plan_table(0, rows_of(4), merges=[(5, 3)]), rep)
    got = [tbl.row_texts(r) for r in range(1, tbl.rows)]
    check(ok, "채움 성공 " + ("" if ok else str(rep)))
    check(tbl.merged_count() == 0, "세로병합이 모두 분할됨")
    check(got == rows_of(4), f"4행 모두 정확(국가 열 포함) — {got}")


def test_row_resize_variants():
    print("\n[5] 행 삭제/추가 — 액션 이름이 다른 한/글")
    for actions, label in [
        (("TableDeleteRow", "TableInsertLowerRow"), "표준 이름"),
        (("TableDeleteRowColumn", "TableAppendRow"), "두 번째 후보만 지원"),
        (("TableDeleteRowCol", "TableInsertRowBelow"), "세 번째 후보만 지원"),
    ]:
        tbl = detail_table(6)
        ap = applier(FakeHwp([list("□ 세부"), [Anchor("tbl", tbl)]],
                             supported_row_actions=actions))
        rep: list[str] = []
        ap.probe_cell_reader(ap.table_ctrls()[0], rep)
        ok = ap.fill_table(plan_table(0, rows_of(3)), rep)
        got = [tbl.row_texts(r) for r in range(1, tbl.rows)]
        check(ok and tbl.rows == 4, f"축소 6→3행 ({label}) rows={tbl.rows} " + ("" if ok else str(rep)))
        check(got == rows_of(3), f"내용 정확 ({label})")

        tbl2 = detail_table(2)
        ap2 = applier(FakeHwp([list("□ 세부"), [Anchor("tbl", tbl2)]],
                              supported_row_actions=actions))
        rep2: list[str] = []
        ap2.probe_cell_reader(ap2.table_ctrls()[0], rep2)
        ok2 = ap2.fill_table(plan_table(0, rows_of(5)), rep2)
        got2 = [tbl2.row_texts(r) for r in range(1, tbl2.rows)]
        check(ok2 and tbl2.rows == 6, f"확대 2→5행 ({label}) rows={tbl2.rows} " + ("" if ok2 else str(rep2)))
        check(got2 == rows_of(5), f"내용 정확 ({label})")


def test_graceful_degradation():
    print("\n[6] 행 조작이 전혀 안 되는 한/글 — 그래도 데이터는 넣는다")
    tbl = detail_table(6)
    ap = applier(FakeHwp([list("□ 세부"), [Anchor("tbl", tbl)]], supported_row_actions=()))
    rep: list[str] = []
    ap.probe_cell_reader(ap.table_ctrls()[0], rep)
    ok = ap.fill_table(plan_table(0, rows_of(3)), rep)
    check(ok is False, "완료로 보고하지 않음")
    check([tbl.row_texts(r) for r in range(1, 4)] == rows_of(3), "데이터 3행은 정상 기입")
    check([tbl.row_texts(r) for r in range(4, 7)] == [[""] * 4] * 3, "남는 3행은 빈 칸")
    check(any("남는 3행은 비워" in x for x in rep), "리포트에 수동 조치 안내")

    tbl2 = detail_table(2)
    ap2 = applier(FakeHwp([list("□ 세부"), [Anchor("tbl", tbl2)]], supported_row_actions=()))
    rep2: list[str] = []
    ap2.probe_cell_reader(ap2.table_ctrls()[0], rep2)
    ap2.fill_table(plan_table(0, rows_of(5)), rep2)
    check([tbl2.row_texts(r) for r in range(1, 3)] == rows_of(5)[:2], "담을 수 있는 2행은 기입")
    check(any("담지 못했습니다" in x for x in rep2), "미수록 행 수를 리포트")


def test_para_replace_keeps_table():
    print("\n[7] 문단 교체가 같은 문단의 표를 지우지 않는가")
    for obj_char in (False, True):
        for anchor_end in (False, True):
            paras = [list("□ 국내 등록 세부 현황") + [Anchor("tbl", detail_table(2))] + list(" (34건)"),
                     [Anchor("tbl", detail_table(1))] + list("□ 국외 등록 세부 현황 (11건)")]
            hwp = FakeHwp(paras, export_object_char=obj_char, anchor_pos_is_para_end=anchor_end)
            ap = applier(hwp)
            tag = f"개체문자={'O' if obj_char else 'X'}/앵커Pos={'문단끝' if anchor_end else '실제'}"
            rep: list[str] = []
            ok = ap.replace_para(hwp_fill.ParaReplace(
                "□ 국내 등록 세부 현황", "□ 국내 등록 세부 현황 (30건)", name="국내 소제목"), rep)
            ok2 = ap.replace_para(hwp_fill.ParaReplace(
                "□ 국외 등록 세부 현황", "□ 국외 등록 세부 현황 (8건)", name="국외 소제목"), rep)
            check(ok and ok2 and len(hwp.tables()) == 2, f"표 2개 보존 + 교체 성공 ({tag})")
            check(hwp.para_text(0).replace("\uFFFC", "") == "□ 국내 등록 세부 현황 (30건)",
                  f"중간 앵커 문단 = {hwp.para_text(0)!r} ({tag})")
            check(hwp.para_text(1).replace("\uFFFC", "") == "□ 국외 등록 세부 현황 (8건)",
                  f"선두 앵커 문단 = {hwp.para_text(1)!r} ({tag})")


def test_wraparound():
    print("\n[8] anchor 반복 탐색 되돌아옴 감지")
    hwp = FakeHwp([list("’25년 특허 등록 현황 보고"), list("본문"), list("’25년 특허 등록 현황 보고")])
    ap = applier(hwp)
    rep: list[str] = []
    ap.replace_para(hwp_fill.ParaReplace("등록 현황 보고", "’26년 특허 등록 현황 보고",
                                         all_occurrences=True, name="본문 제목"), rep)
    check(rep and "2곳" in rep[0], f"실제 2곳만 교체 ({rep[0] if rep else ''})")


def test_picture():
    print("\n[9] 그림 교체")
    for api, label in (("native", "원본 API"), ("wrapper", "래퍼가 인자를 미는 한/글")):
        paras = [list("(참고) 국내·외 특허 출원 현황"), [Anchor("gso", "old.png")],
                 [Anchor("tbl", detail_table(1))]]
        hwp = FakeHwp(paras, picture_api=api)
        ap = applier(hwp)
        rep: list[str] = []
        ok = ap.replace_picture(hwp_fill.PictureReplace(
            "(참고) 국내·외 특허 출원 현황", "new.png", 160.0, 85.0), rep)
        check(ok, f"삽입 성공 ({label}) " + ("" if ok else str(rep)))
        check(bool(hwp.pictures) and hwp.pictures[-1][0] == "new.png", f"새 PNG 삽입 ({label})")
        check(all(a.payload != "old.png" for a in hwp.anchors()), f"옛 그림 제거 ({label})")
        check(len(hwp.tables()) == 1, f"표 영향 없음 ({label})")

    hwp2 = FakeHwp([list("(참고) 국내·외 특허 출원 현황"), [Anchor("tbl", detail_table(1))]])
    ap2 = applier(hwp2)
    rep2: list[str] = []
    check(ap2.replace_picture(hwp_fill.PictureReplace("(참고) 국내·외 특허 출원 현황",
                                                      "new.png", 160.0, 85.0), rep2) is False
          and len(hwp2.tables()) == 1, "다음 문단이 표면 삭제하지 않고 중단")


def test_cover_cell():
    print("\n[10] 표지 셀 기입")
    tbl = detail_table(1)
    ap = applier(doc_with(tbl))
    rep: list[str] = []
    ap.probe_cell_reader(ap.table_ctrls()[0], rep)
    ok = ap.write_cell_by_seq(hwp_fill.CellWrite(0, 5, "2026-07-13", "보고안건일자"), rep)
    check(ok, "셀 기입·검증 성공")
    check(tbl.row_texts(1)[1] == "2026-07-13", "해당 셀만 변경")
    check(tbl.row_texts(0) == ["No", "국가", "출원번호", "발명의 명칭"], "머리행 미변경")


def main() -> int:
    test_traversal_model_on_real_templates()
    test_cell_reader()
    test_prefix_correction()
    test_merge_split()
    test_row_resize_variants()
    test_graceful_degradation()
    test_para_replace_keeps_table()
    test_wraparound()
    test_picture()
    test_cover_cell()
    bad = [l for ok, l in RESULTS if not ok]
    print(f"\n통과 {len(RESULTS) - len(bad)} / {len(RESULTS)}")
    for l in bad:
        print("  X", l)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
