from __future__ import annotations

"""Microsoft Excel native output backend (Windows only).

Purpose
-------
The project previously generated business XLSX files by patching OOXML directly.
That made Linux regression possible, but two real-world failure modes were observed:

1. manual worksheet XML rewrites could leave namespace declarations inconsistent,
   causing Microsoft Excel to reject/repair a workbook;
2. converting the data range to an Excel Table just to obtain filter controls changed
   the original Markpro workbook's visual formatting (blue horizontal rules, missing
   vertical rules, etc.).

This backend deliberately uses *Microsoft Excel itself* to perform the small set of
mutations required by the business workflow.  The original invoice workbook is copied
first, then Excel inserts A:D, writes the four generated columns, applies a native
AutoFilter, saves, closes, and re-opens the result as a validation step.

The backend is optional at import time so the rest of the project (mapping/PDF/check)
continues to run on Linux/macOS.  Business XLSX generation defaults to this backend on
Windows and must fail rather than silently falling back to unsafe XML surgery.
"""

import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .core import excel_col, norm_header
from .xlsx_ooxml import XlsxSession

# Excel/VBA constants used through late-bound COM.  Numeric constants avoid requiring
# makepy-generated type libraries and behave reliably inside a PyInstaller executable.
XL_PASTE_FORMATS = -4122
XL_EDGE_LEFT = 7
XL_EDGE_TOP = 8
XL_EDGE_BOTTOM = 9
XL_EDGE_RIGHT = 10
XL_CONTINUOUS = 1
XL_MEDIUM = -4138
XL_AUTOMATIC = -4105
XL_CALCULATION_AUTOMATIC = -4105
XL_CELL_TYPE_VISIBLE = 12


def rgb(r: int, g: int, b: int) -> int:
    """VBA RGB() equivalent used by Excel's ``Color`` property."""
    return int(r) + int(g) * 256 + int(b) * 65536


class ExcelNativeUnavailable(RuntimeError):
    pass


def native_excel_environment() -> Dict[str, Any]:
    """Cheap environment probe without starting Excel."""
    if os.name != "nt":
        return {"available": False, "reason": "Microsoft Excel native backend requires Windows", "platform": os.name}
    try:
        import win32com.client  # type: ignore  # noqa: F401
        import pythoncom  # type: ignore  # noqa: F401
    except Exception as exc:  # pragma: no cover - only meaningful on Windows
        return {"available": False, "reason": f"pywin32 unavailable: {exc}", "platform": os.name}
    return {"available": True, "reason": "pywin32 import available; Excel will be probed on session start", "platform": os.name}


def _target_col(headers: Sequence[str], aliases: Sequence[str]) -> int:
    hmap = {norm_header(v): i + 1 for i, v in enumerate(headers)}
    for alias in aliases:
        idx = hmap.get(norm_header(alias))
        if idx:
            return idx
    raise KeyError(f"column not found: {aliases}")


def _description_formula(year: int, quarter: int, scope: str, row: int, profile: str) -> str:
    legacy = profile == "q1-legacy"
    if scope == "domestic":
        between = "과제" if legacy else " 과제"
        return f'="{year}년 {quarter}분기("&D{row}&"){between} 국내특허 연차유지료"'
    between = " 과제" if legacy else "과제"
    return f'="{year}년 {quarter}분기("&D{row}&"){between} 해외특허 연차유지료"'


class NativeExcelSession:
    """Excel COM session used only for business-output workbook generation."""

    engine_name = "excel-native-com"

    def __init__(self, visible: bool = False, validate_reopen: bool = True):
        self.visible = bool(visible)
        self.validate_reopen = bool(validate_reopen)
        self.app = None
        self._pythoncom = None
        self.validation_log: List[Dict[str, Any]] = []
        self.reader = XlsxSession()

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass

    def __enter__(self) -> "NativeExcelSession":
        if os.name != "nt":
            raise ExcelNativeUnavailable(
                "업무용 XLSX는 Microsoft Excel Native 방식으로 생성하도록 설정되어 있습니다. "
                "Windows + Microsoft Excel이 설치된 PC에서 실행하세요."
            )
        try:
            import pythoncom  # type: ignore
            import win32com.client  # type: ignore
        except Exception as exc:  # pragma: no cover - Windows only
            raise ExcelNativeUnavailable(
                "pywin32를 불러오지 못했습니다. install_windows.bat를 다시 실행하세요. "
                f"원인: {exc}"
            ) from exc
        stage = "CoInitialize"
        try:
            pythoncom.CoInitialize()
            self._pythoncom = pythoncom
            stage = "DispatchEx(Excel.Application)"
            self.app = win32com.client.DispatchEx("Excel.Application")
            stage = "Application.Visible"
            self.app.Visible = self.visible
            stage = "Application.DisplayAlerts"
            self.app.DisplayAlerts = False
            stage = "Application.ScreenUpdating"
            self.app.ScreenUpdating = False
            stage = "Application.EnableEvents"
            self.app.EnableEvents = False
            stage = "Application.AskToUpdateLinks"
            self.app.AskToUpdateLinks = False
            # Do NOT set Application.Calculation during COM startup.
            # Some valid Microsoft Excel installations raise error 1004
            # ("Unable to set the Calculation property of the Application class")
            # at this stage. Calculation mode is not required for correctness because
            # _save_close() explicitly runs CalculateFullRebuild/CalculateFull and
            # generated SUBTOTAL results are validated after Excel re-opens the file.
            stage = "Application.Version"
            _ = str(self.app.Version)
        except Exception as exc:  # pragma: no cover - Windows only
            self.close()
            raise ExcelNativeUnavailable(
                "Microsoft Excel COM 자동화 초기화에 실패했습니다. "
                f"실패 단계: {stage}. 원인: {exc}"
            ) from exc
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def close(self) -> None:
        app = self.app
        self.app = None
        if app is not None:
            try:
                app.CutCopyMode = False
            except Exception:
                pass
            try:
                app.Quit()
            except Exception:
                pass
        if self._pythoncom is not None:
            try:
                self._pythoncom.CoUninitialize()
            except Exception:
                pass
            self._pythoncom = None

    # ---------- low-level helpers ----------
    def read_used_range(self, path: Path):
        # Read-only parsing remains cross-platform and deterministic.
        return self.reader.read_used_range(path)

    def _require_app(self):
        if self.app is None:
            raise RuntimeError("NativeExcelSession must be used as a context manager")
        return self.app

    def _open(self, path: Path, read_only: bool = False):
        app = self._require_app()
        return app.Workbooks.Open(
            str(path.resolve()),
            UpdateLinks=0,
            ReadOnly=bool(read_only),
            IgnoreReadOnlyRecommended=True,
            AddToMru=False,
            Notify=False,
        )

    def _copy_source(self, source: Path, output: Path) -> None:
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists():
            output.unlink()
        shutil.copy2(source, output)

    def _paste_format(self, ws, source_cell, target_range) -> None:
        source_cell.Copy()
        target_range.PasteSpecial(Paste=XL_PASTE_FORMATS)
        self._require_app().CutCopyMode = False

    def _last_dimensions(self, source: Path) -> Tuple[List[str], int, int]:
        headers, rows = self.reader.read_used_range(source)
        if not headers:
            raise ValueError(f"empty workbook: {source}")
        return headers, len(rows) + 1, len(headers)

    def _save_close(self, wb) -> None:
        app = self._require_app()
        try:
            app.CalculateFullRebuild()
        except Exception:
            try:
                app.CalculateFull()
            except Exception:
                pass
        wb.Save()
        wb.Close(SaveChanges=False)

    def _auto_filter_address(self, ws) -> Optional[str]:
        try:
            if not bool(ws.AutoFilterMode):
                return None
            return str(ws.AutoFilter.Range.Address(False, False))
        except Exception:
            return None

    def _record_reopen_validation(
        self,
        path: Path,
        *,
        kind: str,
        expected_filter_value: Optional[str] = None,
        expected_total: Optional[int] = None,
        total_row: Optional[int] = None,
        data_end: Optional[int] = None,
    ) -> None:
        if not self.validate_reopen:
            return
        wb = None
        report: Dict[str, Any] = {
            "path": str(path),
            "kind": kind,
            "open_ok": False,
            "engine": self.engine_name,
        }
        try:
            wb = self._open(path, read_only=True)
            ws = wb.Worksheets(1)
            report["open_ok"] = True
            report["autofilter_ref"] = self._auto_filter_address(ws)
            if expected_filter_value is not None:
                filter_on = False
                criteria = None
                try:
                    filt = ws.AutoFilter.Filters.Item(4)
                    filter_on = bool(filt.On)
                    if filter_on:
                        raw_criteria = str(filt.Criteria1)
                        criteria = raw_criteria[1:] if raw_criteria.startswith("=") else raw_criteria
                except Exception:
                    pass
                report["filter_field4_on"] = filter_on
                report["filter_criteria"] = criteria
                if not filter_on or criteria != str(expected_filter_value):
                    raise RuntimeError(
                        f"Excel native AutoFilter validation failed: expected {expected_filter_value!r}, got {criteria!r}"
                    )
            if total_row:
                formula = str(ws.Cells(total_row, 2).Formula or "")
                value = ws.Cells(total_row, 2).Value2
                report["subtotal_formula"] = formula
                report["subtotal_value"] = value
                if not formula.upper().startswith("=SUBTOTAL("):
                    raise RuntimeError(f"subtotal formula missing in {path.name}: {formula}")
                if expected_total is not None and int(round(float(value or 0))) != int(expected_total):
                    raise RuntimeError(
                        f"subtotal value mismatch in {path.name}: expected {expected_total}, got {value}"
                    )
            if data_end:
                visible = 0
                hidden = 0
                for r in range(2, int(data_end) + 1):
                    if bool(ws.Rows(r).Hidden):
                        hidden += 1
                    else:
                        visible += 1
                report["visible_data_rows"] = visible
                report["hidden_data_rows"] = hidden
        finally:
            if wb is not None:
                try:
                    wb.Close(SaveChanges=False)
                except Exception:
                    pass
            self.validation_log.append(report)

    # ---------- business workbook operations ----------
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
        headers, source_rows = self.reader.read_used_range(source)
        if not headers or not source_rows:
            raise ValueError(f"empty workbook: {source}")
        total_row = len(source_rows) + 1
        old_max_col = len(headers)
        amount_col = _target_col(headers, ["현지비용(KRW)"])
        mgmt_col = _target_col(headers, ["고객관리번호"])
        title_col = _target_col(headers, ["발명의명칭"])
        total_label_col = next(
            (i + 1 for i, value in enumerate(source_rows[-1]) if str(value or "").strip() == "합계"),
            6,
        )
        data_end = total_row - 1
        assigned_total = sum(int(x["spend_amount"]) for x in mapped_rows)

        self._copy_source(source, output)
        wb = self._open(output, read_only=False)
        try:
            ws = wb.Worksheets(1)
            # Never turn the invoice into an Excel Table. Insert four ordinary columns.
            ws.Columns("A:D").Insert()
            new_max_col = old_max_col + 4

            # Widths are the observed golden widths; only the newly-created columns change.
            ws.Columns("A").ColumnWidth = 106.0
            ws.Columns("B").ColumnWidth = 19.7
            ws.Columns("C").ColumnWidth = 13.7
            ws.Columns("D").ColumnWidth = 83.7

            # Copy only formatting for the new columns. Existing Markpro columns E:... are
            # never restyled. This preserves their original borders/fills exactly.
            shifted_amount = amount_col + 4
            shifted_mgmt = mgmt_col + 4
            shifted_title = title_col + 4
            if data_end >= 2:
                self._paste_format(ws, ws.Cells(2, shifted_title), ws.Range(f"A2:A{data_end}"))
                self._paste_format(ws, ws.Cells(2, shifted_amount), ws.Range(f"B2:B{data_end}"))
                self._paste_format(ws, ws.Cells(2, shifted_mgmt), ws.Range(f"C2:D{data_end}"))

            # Header: copy source header typography, then apply only requested yellow fill.
            self._paste_format(ws, ws.Cells(1, 5), ws.Range("A1:A1"))
            self._paste_format(ws, ws.Cells(1, 6), ws.Range("B1:D1"))
            if scope == "domestic" and profile != "q1-legacy":
                new_headers = ["지출발의 적요 ", "사용예산(지출금액) ", "예산코드", "예산명"]
            else:
                new_headers = ["지출발의 적요", "사용예산(지출금액)", "예산코드", "예산명"]
            ws.Range("A1:D1").Value = (tuple(new_headers),)
            ws.Range("A1:D1").Interior.Color = rgb(255, 255, 0)

            # Write generated business values only to the invoice rows that resolved.
            mapped_by_row = {int(x["excel_row"]): x for x in mapped_rows}
            for rnum, item in mapped_by_row.items():
                ws.Cells(rnum, 1).Formula = _description_formula(year, quarter, scope, rnum, profile)
                ws.Cells(rnum, 2).Formula = f"={excel_col(shifted_amount)}{rnum}"
                ws.Cells(rnum, 3).NumberFormat = "@"
                ws.Cells(rnum, 3).Value2 = str(item["budget_code"])
                ws.Cells(rnum, 4).Value2 = str(item["budget_name"])

            # Total line: preserve the source total-row visual language.  A/B use the
            # source label/amount styles; C/D use the same green total fill as the amount.
            shifted_total_label_col = total_label_col + 4
            source_total_amount_col = amount_col + 4
            self._paste_format(ws, ws.Cells(total_row, shifted_total_label_col), ws.Cells(total_row, 1))
            self._paste_format(ws, ws.Cells(total_row, source_total_amount_col), ws.Range(f"B{total_row}:D{total_row}"))
            ws.Cells(total_row, 1).Value2 = "지출금액"
            ws.Cells(total_row, 2).Formula = f"=SUBTOTAL(9,B2:B{data_end})"
            ws.Cells(total_row, 3).ClearContents()
            ws.Cells(total_row, 4).ClearContents()
            ws.Range(f"A{total_row}:B{total_row}").Font.Color = rgb(255, 0, 0)

            # Native worksheet AutoFilter. No row deletion or manual Row.Hidden changes.
            try:
                if bool(ws.AutoFilterMode):
                    ws.AutoFilterMode = False
            except Exception:
                pass
            filter_range = ws.Range(f"A1:{excel_col(new_max_col)}{data_end}")
            filter_range.AutoFilter()
            ws.Activate()
            ws.Range("A1").Select()
            self._save_close(wb)
            wb = None
        finally:
            if wb is not None:
                try:
                    wb.Close(SaveChanges=False)
                except Exception:
                    pass

        self._record_reopen_validation(
            output,
            kind="budget_master",
            expected_total=assigned_total,
            total_row=total_row,
            data_end=data_end,
        )

    def create_filtered_copy(
        self,
        source_budget_workbook: Path,
        output: Path,
        budget_name: str,
        expected_amount: Optional[int] = None,
    ) -> None:
        _, total_row, max_col = self._last_dimensions(source_budget_workbook)
        data_end = total_row - 1
        self._copy_source(source_budget_workbook, output)
        wb = self._open(output, read_only=False)
        try:
            ws = wb.Worksheets(1)
            filter_range = ws.Range(f"A1:{excel_col(max_col)}{data_end}")
            # Existing base filter exists but has no criteria. Applying the native filter
            # makes Excel itself hide the rows and maintain the filter dropdown state.
            filter_range.AutoFilter(4, str(budget_name))
            ws.Activate()
            ws.Range("A1").Select()
            self._save_close(wb)
            wb = None
        finally:
            if wb is not None:
                try:
                    wb.Close(SaveChanges=False)
                except Exception:
                    pass

        self._record_reopen_validation(
            output,
            kind="budget_filtered",
            expected_filter_value=str(budget_name),
            expected_total=expected_amount,
            total_row=total_row,
            data_end=data_end,
        )

    def create_fee_workbook(self, source: Path, output: Path, scope: str, fee_kind: str) -> None:
        headers, total_row, _ = self._last_dimensions(source)
        if scope == "domestic":
            targets = ["당사수수료(KRW)", "부가세"]
        elif fee_kind == "wire":
            targets = ["송금수수료"]
        else:
            targets = ["당사수수료(KRW)", "부가세"]
        target_cols = [_target_col(headers, [t]) for t in targets]
        left_col, right_col = min(target_cols), max(target_cols)
        # Overseas service fee uses J (service fee KRW) and L (VAT), with K
        # reserved for wire fee.  Those two non-adjacent columns must be boxed
        # independently so K is not accidentally included in a J:L outline.
        if scope == "overseas" and fee_kind != "wire":
            outline_blocks = [(c, c) for c in target_cols]
        else:
            outline_blocks = [(left_col, right_col)]

        self._copy_source(source, output)
        wb = self._open(output, read_only=False)
        try:
            ws = wb.Worksheets(1)
            # Only target columns receive blue font.  The outline is applied once to the
            # combined rectangular region, leaving every internal/source border untouched.
            for col in target_cols:
                ws.Range(ws.Cells(1, col), ws.Cells(total_row, col)).Font.Color = rgb(0, 112, 192)

            for block_left, block_right in outline_blocks:
                block = ws.Range(ws.Cells(1, block_left), ws.Cells(total_row, block_right))
                for edge in (XL_EDGE_LEFT, XL_EDGE_TOP, XL_EDGE_BOTTOM, XL_EDGE_RIGHT):
                    border = block.Borders(edge)
                    border.LineStyle = XL_CONTINUOUS
                    border.Weight = XL_MEDIUM
                    border.Color = rgb(0, 112, 192)

            ws.Activate()
            ws.Range("A1").Select()
            self._save_close(wb)
            wb = None
        finally:
            if wb is not None:
                try:
                    wb.Close(SaveChanges=False)
                except Exception:
                    pass

        self._record_reopen_validation(output, kind=f"fee_{scope}_{fee_kind}")


def create_native_session(*, visible: bool = False, validate_reopen: bool = True) -> NativeExcelSession:
    return NativeExcelSession(visible=visible, validate_reopen=validate_reopen)
