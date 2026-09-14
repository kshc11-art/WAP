# -*- coding: utf-8 -*-
"""Pure-Python regression for the HWP table-style action sequence.

This does not replace a Windows/Hancom rendering test. It validates that the
COM parameter sequence remains aligned with the supplied field utility:
CellBorderFill body grid, explicit paragraph no-fill, and header bold/center/
gray shade/double-bottom rule.
"""
from __future__ import annotations

from types import SimpleNamespace
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from hwp_fill import (
    HWP_CELL_WHITE,
    HWP_HEADER_SHADE,
    HWP_LINE_DOUBLE,
    HWP_LINE_NONE,
    HWP_LINE_SOLID,
    HWP_PARA_NO_FILL,
    HwpApplier,
    TableFill,
)


class PSet(SimpleNamespace):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.HSet = self


class FakeAction:
    def __init__(self):
        self.executions = []

    def GetDefault(self, name, hset):
        return True

    def Execute(self, name, hset):
        snap = {"name": name}
        for attr in (
            "Bold", "BorderTypeTop", "BorderTypeBottom", "BorderTypeLeft",
            "BorderTypeRight", "TypeHorz", "TypeVert", "WidthHorz", "WidthVert",
        ):
            if hasattr(hset, attr):
                snap[attr] = getattr(hset, attr)
        fill = getattr(hset, "FillAttr", None)
        if fill is not None:
            snap["WinBrushFaceColor"] = getattr(fill, "WinBrushFaceColor", None)
        border_fill = getattr(hset, "BorderFill", None)
        if border_fill is not None:
            snap["ParaFaceColor"] = getattr(border_fill.FillAttr, "WinBrushFaceColor", None)
        self.executions.append(snap)
        return True


class FakeHwp:
    def __init__(self):
        self.HAction = FakeAction()
        fill = SimpleNamespace(
            type=0,
            WinBrushFaceColor=0,
            WinBrushHatchColor=0,
            WinBrushFaceStyle=0,
            WindowsBrush=0,
        )
        self.HParameterSet = SimpleNamespace(
            HCharShape=PSet(Bold=0),
            HCellBorderFill=PSet(FillAttr=fill),
            HParaShape=PSet(BorderFill=SimpleNamespace(FillAttr=SimpleNamespace(WinBrushFaceColor=0))),
        )


def main() -> int:
    app = HwpApplier(lambda *_: None)
    app.hwp = FakeHwp()
    app._pyhwpx_wrapper = None
    app.table_ctrls = lambda: [object()]
    app.enter_table = lambda ctrl: True
    app.select_whole_table = lambda: True
    app._select_first_row = lambda ctrl: True
    actions = []

    def run(name):
        actions.append(name)
        return True

    app.run = run
    report = []
    table = TableFill(
        index=0,
        name="test",
        expect_header=["A", "B"],
        prefix_cells=2,
        ncols=2,
        rows=[["1", "2"]],
    )
    if not app.apply_reference_table_style(table, report):
        print("FAIL: apply_reference_table_style returned False")
        return 1

    executions = app.hwp.HAction.executions
    cell_execs = [x for x in executions if x["name"] == "CellBorderFill"]
    para_execs = [x for x in executions if x["name"] == "ParagraphShape"]
    char_execs = [x for x in executions if x["name"] == "CharShape"]

    checks = [
        (len(cell_execs) >= 3, "CellBorderFill executions"),
        (cell_execs[0].get("BorderTypeTop") == HWP_LINE_SOLID, "body top solid"),
        (cell_execs[0].get("BorderTypeBottom") == HWP_LINE_SOLID, "body bottom solid"),
        (cell_execs[0].get("BorderTypeLeft") == HWP_LINE_NONE, "body left none"),
        (cell_execs[0].get("BorderTypeRight") == HWP_LINE_NONE, "body right none"),
        (cell_execs[0].get("TypeHorz") == HWP_LINE_SOLID, "body inner horizontal solid"),
        (cell_execs[0].get("TypeVert") == HWP_LINE_SOLID, "body inner vertical solid"),
        (cell_execs[0].get("WinBrushFaceColor") == HWP_CELL_WHITE, "body white fill"),
        (para_execs and para_execs[0].get("ParaFaceColor") == HWP_PARA_NO_FILL, "paragraph no-fill"),
        (char_execs and char_execs[0].get("Bold") == 1, "header bold"),
        ("ParagraphShapeAlignCenter" in actions, "header center"),
        (any(x.get("BorderTypeBottom") == HWP_LINE_DOUBLE for x in cell_execs), "header double bottom"),
        (any(x.get("WinBrushFaceColor") == HWP_HEADER_SHADE for x in cell_execs), "header gray shade"),
    ]
    failed = [label for ok, label in checks if not ok]
    if failed:
        for label in failed:
            print("FAIL:", label)
        return 1
    print(f"HWP reference table-style regression: PASS ({len(checks)}/{len(checks)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
