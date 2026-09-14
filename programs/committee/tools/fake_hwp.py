# -*- coding: utf-8 -*-
"""한/글 COM 객체 모형(오프라인 검증용) v0.2.8.

Windows/한글이 없는 환경에서 hwp_fill.HwpApplier의 제어 흐름을 검증한다.
실측 로그에서 확인된 한/글 동작을 그대로 재현한다.

  (1) 셀 블록 상태의 GetTextFile("TEXT","saveblock:true")는 선택 셀이 아니라
      '표 전체'를 돌려준다.                                    → v0.2.6 증상
  (2) 문단 전체를 선택해 Delete하면 그 문단에 앵커를 둔 개체가 함께 사라진다.
                                                               → v0.2.6/0.2.7 증상
  (3) TableRightCell 순회는 물리 셀이 아니라 '논리 행 x 셀' 단위다. 세로로 병합된
      셀은 걸쳐 있는 행마다 다시 방문된다(붙임1 표6이 물리 77셀인데 80으로
      세어진 이유).                                            → v0.2.7 증상
  (4) 행 추가/삭제 액션은 한/글 버전에 따라 먹는 이름이 다르고, 지원하지 않는
      이름은 아무 일도 하지 않는다.                            → v0.2.7 증상
  (5) 그림 삽입 API를 래퍼가 다른 인자 순서로 감싸면 '지정 크기'가 먹지 않아
      개체만 생기고 그림이 보이지 않는다.                      → v0.2.7 증상
"""
from __future__ import annotations

import copy
from typing import Any, Optional

OBJ_CHAR = "\uFFFC"


class Anchor:
    """문단에 박힌 개체(표/그리기개체) 앵커."""

    def __init__(self, ctrl_id: str, payload: Any = None):
        self.ctrl_id = ctrl_id
        self.payload = payload
        self.alive = True


class Cell:
    def __init__(self, row: int, col: int, text: str = "", row_span: int = 1, col_span: int = 1):
        self.row, self.col = row, col
        self.row_span, self.col_span = row_span, col_span
        self.text = text


class Table:
    """물리 셀 + 병합 정보를 가진 표."""

    def __init__(self, rows: int, cols: int, cells: list[Cell]):
        self.rows, self.cols = rows, cols
        self.cells = cells

    @classmethod
    def grid(cls, rows: int, cols: int, texts: list[str]) -> "Table":
        return cls(rows, cols,
                   [Cell(r, c, texts[r * cols + c]) for r in range(rows) for c in range(cols)])

    def covering(self, row: int) -> list["Cell"]:
        out = [c for c in self.cells if c.row <= row < c.row + max(1, c.row_span)]
        return sorted(out, key=lambda c: c.col)

    def visits(self) -> list["Cell"]:
        """TableRightCell 순회 순서(세로병합 셀은 걸친 행마다 재방문)."""
        out: list[Cell] = []
        for r in range(self.rows):
            out.extend(self.covering(r))
        return out

    def texts(self) -> list[str]:
        return [c.text for c in sorted(self.cells, key=lambda c: (c.row, c.col))]

    def row_texts(self, row: int) -> list[str]:
        return [c.text for c in self.covering(row)]

    def merged_count(self) -> int:
        return sum(1 for c in self.cells if max(1, c.row_span) > 1)

    # --- 행 조작 -------------------------------------------------------
    def delete_row(self, row: int) -> bool:
        if not (0 <= row < self.rows):
            return False
        keep: list[Cell] = []
        for c in self.cells:
            if c.row <= row < c.row + max(1, c.row_span):
                if max(1, c.row_span) > 1:
                    c.row_span -= 1
                    if c.row > row:
                        c.row -= 1
                    keep.append(c)
                continue
            if c.row > row:
                c.row -= 1
            keep.append(c)
        self.cells = keep
        self.rows -= 1
        return True

    def insert_row_below(self, row: int) -> bool:
        if not (0 <= row < self.rows):
            return False
        src = self.covering(row)
        widened = set()
        for c in self.cells:
            if c.row > row:
                c.row += 1
            elif c.row <= row < c.row + max(1, c.row_span) and max(1, c.row_span) > 1:
                c.row_span += 1
                widened.add(id(c))
        for c in src:
            if id(c) not in widened:
                self.cells.append(Cell(row + 1, c.col, "", 1, c.col_span))
        self.rows += 1
        return True

    def split_cell(self, cell: "Cell", rows: int) -> bool:
        if max(1, cell.row_span) != rows or rows <= 1:
            return False
        base = cell.row
        cell.row_span = 1
        for k in range(1, rows):
            self.cells.append(Cell(base + k, cell.col, "", 1, cell.col_span))
        return True


class ParamSet:
    def __init__(self, **kw):
        self._d = dict(kw)

    def Item(self, k):
        return self._d.get(k)

    def SetItem(self, k, v):
        self._d[k] = v

    def __getattr__(self, k):
        if k.startswith("_"):
            raise AttributeError(k)
        return self._d.get(k)

    def __setattr__(self, k, v):
        if k == "_d":
            object.__setattr__(self, k, v)
        else:
            self._d[k] = v


class _Ctrl:
    def __init__(self, doc, anchor: Anchor):
        self.doc = doc
        self.anchor = anchor
        self.Next = None

    @property
    def CtrlID(self):
        return self.anchor.ctrl_id

    def GetAnchorPos(self, _n):
        lst, para, pos = self.doc.locate_anchor(self.anchor)
        if self.doc.anchor_pos_is_para_end:
            pos = len(self.doc.paras[para])      # 실측에서 의심되는 동작
        return ParamSet(List=lst, Para=para, Pos=pos)


class _HAction:
    def __init__(self, hwp):
        self.hwp = hwp

    def Run(self, act):
        return self.hwp._run(act)

    def GetDefault(self, action_id, pset):
        return True

    def Execute(self, action_id, pset):
        return self.hwp._execute(action_id, pset)


class _HParameterSet:
    @staticmethod
    def _linked() -> ParamSet:
        ps = ParamSet()
        ps.HSet = ps
        return ps

    def __init__(self):
        self.HFindReplace = self._linked()
        self.HCharShape = self._linked()
        self.HCellBorderFill = self._linked()
        self.HTableSplitCell = self._linked()
        self.HFileOpenSave = self._linked()
        self.HShapeObject = self._linked()


DEFAULT_ROW_ACTIONS = ("TableDeleteRow", "TableInsertLowerRow")


class FakeHwp:
    def __init__(self, paragraphs, *, cellblock_returns_whole_table=True,
                 export_object_char=False, para_delete_kills_anchor=True,
                 supported_row_actions=DEFAULT_ROW_ACTIONS,
                 anchor_pos_is_para_end=False, picture_api="native"):
        self.paras = [list(p) for p in paragraphs]
        self.cellblock_bug = cellblock_returns_whole_table
        self.export_object_char = export_object_char
        self.para_delete_kills_anchor = para_delete_kills_anchor
        self.supported_row_actions = set(supported_row_actions)
        self.anchor_pos_is_para_end = anchor_pos_is_para_end
        self.picture_api = picture_api           # native | wrapper

        self.pos = [0, 0, 0]
        self.sel = None
        self.cell_ctx = None
        self.undo_stack: list[Any] = []
        self.pictures: list[tuple] = []
        self.saved_as = None
        self.HAction = _HAction(self)
        self.HParameterSet = _HParameterSet()

    # ------------------------------------------------------------ 조회
    def tables(self) -> list[Table]:
        return [a.payload for a in self.anchors() if a.ctrl_id == "tbl"]

    def anchors(self) -> list[Anchor]:
        return [it for p in self.paras for it in p if isinstance(it, Anchor) and it.alive]

    def locate_anchor(self, anchor: Anchor):
        for pi, p in enumerate(self.paras):
            for ix, it in enumerate(p):
                if it is anchor:
                    return 0, pi, ix
        return 0, 0, 0

    def para_text(self, pi) -> str:
        out = []
        for it in self.paras[pi]:
            if isinstance(it, Anchor):
                if self.export_object_char:
                    out.append(OBJ_CHAR)
            else:
                out.append(it)
        return "".join(out)

    def _cur_cell(self) -> Optional[Cell]:
        if not self.cell_ctx:
            return None
        tbl, vi = self.cell_ctx
        vs = tbl.visits()
        return vs[vi] if 0 <= vi < len(vs) else None

    def _snapshot(self):
        self.undo_stack.append(copy.deepcopy(self.paras))
        if len(self.undo_stack) > 30:
            self.undo_stack.pop(0)

    # ------------------------------------------------------------ 액션
    def _run(self, act):  # noqa: C901
        p = self.pos
        if act == "Cancel":
            self.sel = None
            return True
        if act == "MoveDocBegin":
            self.cell_ctx = None
            self.pos = [0, 0, 0]
            self.sel = None
            return True
        if act in ("MoveParaBegin", "MoveListBegin"):
            self.sel = None
            self.pos = [p[0], p[1], 0]
            return True
        if act in ("MoveParaEnd", "MoveListEnd"):
            self.sel = None
            self.pos = [p[0], p[1], self._len(p)]
            return True
        if act == "MoveNextParaBegin":
            self.sel = None
            if p[0] == 0 and p[1] + 1 < len(self.paras):
                self.pos = [0, p[1] + 1, 0]
                return True
            return False
        if act in ("MoveSelParaEnd", "MoveSelListEnd"):
            self.sel = ("chars", p[0], p[1], p[2], self._len(p))
            return True
        if act == "TableCellBlock":
            if not self.cell_ctx:
                return False
            self.sel = ("cell", self.cell_ctx[0], self.cell_ctx[1])
            return True
        if act == "TableCellBlockRow":
            if not self.cell_ctx:
                return False
            self.sel = ("row", self.cell_ctx[0], self._visit_row(*self.cell_ctx))
            return True
        if act == "ShapeObjTableSelCell":
            if not self.cell_ctx:
                return False
            self.cell_ctx = (self.cell_ctx[0], 0)
            self.pos = [self._list_id(*self.cell_ctx), 0, 0]
            self.sel = ("cell", self.cell_ctx[0], 0)
            return True
        if act == "TableRightCell":
            if not self.cell_ctx:
                return False
            tbl, vi = self.cell_ctx
            if vi + 1 >= len(tbl.visits()):
                return False
            self.cell_ctx = (tbl, vi + 1)
            self.pos = [self._list_id(tbl, vi + 1), 0, 0]
            self.sel = None
            return True
        if act in ("TableDeleteRow", "TableDeleteRowColumn", "TableDeleteRowCol"):
            return self._row_action(act, delete=True)
        if act in ("TableInsertLowerRow", "TableAppendRow", "TableInsertRowBelow",
                   "TableRightCellAppend"):
            return self._row_action(act, delete=False)
        if act == "Delete":
            return self._delete()
        if act == "Undo":
            if self.undo_stack:
                self.paras = self.undo_stack.pop()
                return True
            return False
        if act == "FileClose":
            self.cell_ctx = None
            return True
        return True

    def _visit_row(self, tbl, vi) -> int:
        n = 0
        for r in range(tbl.rows):
            k = len(tbl.covering(r))
            if vi < n + k:
                return r
            n += k
        return max(0, tbl.rows - 1)

    def _row_action(self, act, delete: bool) -> bool:
        if act not in self.supported_row_actions:
            return False                       # 지원하지 않는 이름은 무동작
        if not self.sel or self.sel[0] != "row":
            return False
        _, tbl, row = self.sel
        ok = tbl.delete_row(row) if delete else tbl.insert_row_below(row)
        self.sel = None
        self.cell_ctx = (tbl, 0)
        return ok

    def _list_id(self, tbl, vi):
        return 1000 + (id(tbl) % 900) * 100 + vi

    def _len(self, p):
        if p[0] == 0:
            return len(self.paras[p[1]])
        cell = self._cur_cell()
        return len(cell.text) if cell else 0

    def _delete(self):
        if not self.sel:
            return False
        kind = self.sel[0]
        if kind == "cell":
            cell = self._cur_cell()
            if cell:
                cell.text = ""
            self.sel = None
            return True
        if kind == "row":
            return False
        _, lst, para, a, b = self.sel
        if lst != 0:
            cell = self._cur_cell()
            if cell:
                cell.text = cell.text[:a] + cell.text[b:]
            self.sel = None
            self.pos = [lst, para, a]
            return True
        self._snapshot()
        items = self.paras[para]
        for it in items[a:b]:
            if isinstance(it, Anchor) and self.para_delete_kills_anchor:
                it.alive = False
        self.paras[para] = items[:a] + items[b:]
        self.sel = None
        self.pos = [0, para, a]
        return True

    def _insert_text(self, text):
        lst, para, pos = self.pos
        if lst == 0:
            self._snapshot()
            items = self.paras[para]
            self.paras[para] = items[:pos] + list(text) + items[pos:]
            self.pos = [0, para, pos + len(text)]
        else:
            cell = self._cur_cell()
            if cell:
                cell.text = cell.text[:pos] + text + cell.text[pos:]
            self.pos = [lst, para, pos + len(text)]
        self.sel = None
        return True

    def _execute(self, action_id, pset):
        if action_id == "InsertText":
            return self._insert_text(pset.Item("Text") or "")
        if action_id == "RepeatFind":
            return self._find(pset.FindString or "")
        if action_id == "TableSplitCell":
            cell = self._cur_cell()
            if not cell or not self.cell_ctx:
                return False
            return self.cell_ctx[0].split_cell(cell, int(pset.Rows or 0))
        if action_id == "TableDeleteRowCol":
            return self._row_action("TableDeleteRowCol", delete=True)
        if action_id == "FileSaveAs_S":
            self.saved_as = pset.filename
            return True
        return True

    def _find(self, needle):
        if not needle:
            return False
        n = len(self.paras)
        start = self.pos[1] if self.pos[0] == 0 else 0
        offset = self.pos[2] if self.pos[0] == 0 else 0
        for step in range(n + 1):
            pi = (start + step) % n
            text = self.para_text(pi)
            k = text.find(needle, offset if step == 0 else 0)
            if k >= 0:
                self.cell_ctx = None
                self.pos = [0, pi, min(k + len(needle), len(self.paras[pi]))]
                self.sel = ("chars", 0, pi, k, k + len(needle))
                return True
        return False

    # ------------------------------------------------------------ COM API
    @property
    def HeadCtrl(self):
        ctrls = [_Ctrl(self, a) for a in self.anchors()]
        for i in range(len(ctrls) - 1):
            ctrls[i].Next = ctrls[i + 1]
        return ctrls[0] if ctrls else None

    def GetTextFile(self, fmt, opt=""):
        if not self.sel:
            return ""
        if self.sel[0] == "cell":
            _, tbl, vi = self.sel
            if self.cellblock_bug:
                return "\r\n" + "\r\n".join(tbl.texts())
            vs = tbl.visits()
            return vs[vi].text if vi < len(vs) else ""
        if self.sel[0] == "row":
            return ""
        _, lst, para, a, b = self.sel
        if lst != 0:
            cell = self._cur_cell()
            return cell.text[a:b] if cell else ""
        out = []
        for it in self.paras[para][a:b]:
            if isinstance(it, Anchor):
                if self.export_object_char:
                    out.append(OBJ_CHAR)
            else:
                out.append(it)
        return "".join(out)

    def GetPos(self):
        return tuple(self.pos)

    def SetPos(self, lst, para, pos):
        self.sel = None
        self.pos = [int(lst), int(para), int(pos)]
        return True

    def SetPosBySet(self, pset):
        lst, para, pos = int(pset.Item("List")), int(pset.Item("Para")), int(pset.Item("Pos"))
        self.pos = [lst, para, pos]
        self.sel = None
        item = self.paras[para][pos] if lst == 0 and pos < len(self.paras[para]) else None
        if not isinstance(item, Anchor):
            item = next((x for x in self.paras[para] if isinstance(x, Anchor)), None)
        if isinstance(item, Anchor) and item.ctrl_id == "tbl":
            self.cell_ctx = (item.payload, 0)
        self._pending_ctrl = item
        return True

    def FindCtrl(self):
        item = getattr(self, "_pending_ctrl", None)
        if isinstance(item, Anchor):
            _, para, pos = self.locate_anchor(item)
            self.pos = [0, para, pos]
            self.sel = ("chars", 0, para, pos, pos + 1)
            return True
        return False

    def CreateAction(self, action_id):
        hwp = self

        class _A:
            def CreateSet(self):
                return ParamSet()

            def GetDefault(self, st):
                return True

            def Execute(self, st):
                return hwp._execute(action_id, st)

        return _A()

    def Open(self, path, fmt=None, arg=None):
        return True

    def SaveAs(self, path, fmt=None, arg=None):
        self.saved_as = path
        return True

    def InsertPicture(self, *args):
        """native = 원본 API 순서, wrapper = 인자 한 칸 밀림(크기 지정 무효)."""
        path = args[0]
        if self.picture_api == "native" and len(args) >= 8:
            w, h = int(args[6]), int(args[7])
        else:
            w = h = 0
        a = Anchor("gso", path)
        para = self.paras[self.pos[1]]
        para.insert(min(self.pos[2], len(para)), a)
        self.pictures.append((path, w, h))
        return True

    def Quit(self):
        return True

    def RegisterModule(self, *a):
        return True
