from __future__ import annotations

import argparse
import ctypes
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TIMEOUT_SECONDS = 180


def out(message: str) -> None:
    # Keep console output ASCII-only so Korean Windows cmd.exe code pages cannot corrupt it.
    safe = str(message).encode("ascii", "backslashreplace").decode("ascii")
    print(safe, flush=True)


def excel_pid(app) -> int | None:
    try:
        hwnd = int(app.Hwnd)
        pid = ctypes.c_ulong(0)
        ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        return int(pid.value) or None
    except Exception:
        return None


def make_source(path: Path) -> None:
    import pythoncom  # type: ignore
    import win32com.client  # type: ignore

    pythoncom.CoInitialize()
    app = None
    wb = None
    try:
        out("[STEP 4/13] Starting Microsoft Excel COM for raw workbook test...")
        app = win32com.client.DispatchEx("Excel.Application")
        app.Visible = False
        app.DisplayAlerts = False
        app.ScreenUpdating = False
        app.EnableEvents = False
        app.AskToUpdateLinks = False
        out("[STEP 5/13] Excel COM started. Version=" + str(app.Version))

        out("[STEP 6/13] Creating and saving a tiny XLSX with Excel itself...")
        wb = app.Workbooks.Add()
        ws = wb.Worksheets(1)
        headers = [
            "Country", "Right", "ApplicationNo", "RegistrationNo", "Year", "DueDate",
            "LocalCostKRW", "ServiceFeeKRW", "VAT", "ApplicationDate", "RegistrationDate",
            "Claims", "ExpectedExpiry", "ManagementNo", "Inventor", "Title", "Owner", "CostShare",
        ]
        ws.Range("A1:R1").Value = (tuple(headers),)
        ws.Range("A1:R1").Font.Bold = True
        rows = [
            ["KR", "P", "A1", "R1", 4, "2026-07-01", 100, 12, 1, "", "", 5, "", "M1", "", "T1", "KRISS", ""],
            ["KR", "P", "A2", "R2", 4, "2026-07-02", 200, 12, 1, "", "", 5, "", "M2", "", "T2", "KRISS", ""],
            ["KR", "P", "A3", "R3", 4, "2026-07-03", 300, 12, 1, "", "", 5, "", "M3", "", "T3", "KRISS", ""],
        ]
        ws.Range("A2:R4").Value = tuple(tuple(r) for r in rows)
        ws.Cells(5, 6).Value2 = "Total"
        ws.Cells(5, 7).Formula = "=SUM(G2:G4)"
        wb.SaveAs(str(path.resolve()), FileFormat=51)
        wb.Close(SaveChanges=False)
        wb = None
        out("[STEP 7/13] Raw XLSX saved. Reopening with Excel...")

        wb = app.Workbooks.Open(
            str(path.resolve()),
            UpdateLinks=0,
            ReadOnly=True,
            IgnoreReadOnlyRecommended=True,
            AddToMru=False,
            Notify=False,
        )
        _ = wb.Worksheets(1).Range("A1").Value2
        wb.Close(SaveChanges=False)
        wb = None
        out("[STEP 8/13] Raw XLSX reopen succeeded.")
    finally:
        if wb is not None:
            try:
                wb.Close(SaveChanges=False)
            except Exception:
                pass
        if app is not None:
            try:
                app.Quit()
            except Exception:
                pass
        pythoncom.CoUninitialize()


def worker(pidfile: Path) -> int:
    if os.name != "nt":
        out("[ERROR] This diagnostic requires Windows.")
        return 20

    out("[STEP 1/13] Python executable: " + sys.executable)
    out("[STEP 2/13] Importing pywin32...")
    try:
        import pythoncom  # type: ignore  # noqa: F401
        import win32com.client  # type: ignore  # noqa: F401
    except Exception as exc:
        out("[ERROR] pywin32 import failed: " + repr(exc))
        return 21
    out("[STEP 3/13] pywin32 import succeeded.")

    tmp = Path(tempfile.mkdtemp(prefix="kriss_excel_diag_"))
    try:
        raw = tmp / "source.xlsx"

        # First prove Excel itself can create/save/reopen a plain workbook.
        make_source(raw)

        # Create a Korean-header source workbook for the project backend.
        import pythoncom  # type: ignore
        import win32com.client  # type: ignore
        pythoncom.CoInitialize()
        app = None
        wb = None
        try:
            app = win32com.client.DispatchEx("Excel.Application")
            app.Visible = False
            app.DisplayAlerts = False
            pid = excel_pid(app)
            if pid:
                pidfile.write_text(str(pid), encoding="ascii")
            wb = app.Workbooks.Add()
            ws = wb.Worksheets(1)
            headers = [
                "국가", "권리", "출원번호", "등록번호", "연차", "납부기한일",
                "현지비용(KRW)", "당사수수료(KRW)", "부가세", "출원일자", "등록일자",
                "청구항수", "예상권리만료일", "고객관리번호", "발명자이름", "발명의명칭",
                "권리인명", "비용분담",
            ]
            ws.Range("A1:R1").Value = (tuple(headers),)
            ws.Range("A1:R1").Font.Bold = True
            rows = [
                ["KR", "P", "A1", "R1", 4, "2026-07-01", 100, 12, 1, "", "", 5, "", "M1", "", "발명1", "KRISS", ""],
                ["KR", "P", "A2", "R2", 4, "2026-07-02", 200, 12, 1, "", "", 5, "", "M2", "", "발명2", "KRISS", ""],
                ["KR", "P", "A3", "R3", 4, "2026-07-03", 300, 12, 1, "", "", 5, "", "M3", "", "발명3", "KRISS", ""],
            ]
            ws.Range("A2:R4").Value = tuple(tuple(r) for r in rows)
            ws.Cells(5, 6).Value2 = "합계"
            ws.Cells(5, 7).Formula = "=SUM(G2:G4)"
            source = tmp / "project_source.xlsx"
            wb.SaveAs(str(source.resolve()), FileFormat=51)
            wb.Close(SaveChanges=False)
            wb = None

            # Separate overseas fee fixture: J=service fee KRW, K=wire fee, L=VAT.
            wb = app.Workbooks.Add()
            ws = wb.Worksheets(1)
            ov_headers = [
                "국가", "권리", "출원번호", "등록번호", "연차", "납부기한일",
                "현지비용", "현지비용(KRW)", "당사수수료", "당사수수료(KRW)",
                "송금수수료", "부가세", "고객관리번호", "발명의명칭",
            ]
            ws.Range("A1:N1").Value = (tuple(ov_headers),)
            ws.Range("A1:N1").Font.Bold = True
            ov_rows = [
                ["US", "P", "OA1", "OR1", 4, "2026-07-01", 100, 150000, 120, 180000, 8500, 18000, "OM1", "Overseas1"],
                ["JP", "P", "OA2", "OR2", 4, "2026-07-02", 200, 250000, 120, 180000, 8500, 18000, "OM2", "Overseas2"],
            ]
            ws.Range("A2:N3").Value = tuple(tuple(r) for r in ov_rows)
            ws.Cells(4, 8).Formula = "=SUM(H2:H3)"
            ws.Cells(4, 10).Formula = "=SUM(J2:J3)"
            ws.Cells(4, 11).Formula = "=SUM(K2:K3)"
            ws.Cells(4, 12).Formula = "=SUM(L2:L3)"
            overseas_source = tmp / "overseas_source.xlsx"
            wb.SaveAs(str(overseas_source.resolve()), FileFormat=51)
            wb.Close(SaveChanges=False)
            wb = None
        finally:
            if wb is not None:
                try:
                    wb.Close(SaveChanges=False)
                except Exception:
                    pass
            if app is not None:
                try:
                    app.Quit()
                except Exception:
                    pass
            pythoncom.CoUninitialize()

        out("[STEP 9/13] Importing project Excel Native backend...")
        try:
            from kriss_annual_fee.excel_native import NativeExcelSession
        except Exception as exc:
            out("[ERROR] Project backend import failed: " + repr(exc))
            return 22

        mapped = [
            {"excel_row": 2, "spend_amount": 100, "budget_code": "26000001", "budget_name": "BudgetA", "description": "d1"},
            {"excel_row": 3, "spend_amount": 200, "budget_code": "26000001", "budget_name": "BudgetA", "description": "d2"},
            {"excel_row": 4, "spend_amount": 300, "budget_code": "26000002", "budget_name": "BudgetB", "description": "d3"},
        ]
        master = tmp / "master.xlsx"
        filtered = tmp / "filtered.xlsx"
        fee = tmp / "fee.xlsx"
        overseas_fee = tmp / "overseas_fee.xlsx"

        out("[STEP 10/13] Starting project NativeExcelSession...")
        with NativeExcelSession(visible=False, validate_reopen=True) as excel:
            pid = excel_pid(excel.app)
            if pid:
                pidfile.write_text(str(pid), encoding="ascii")
            out("[STEP 11/13] Creating budget master workbook...")
            excel.create_budget_workbook(source, master, mapped, "domestic", year=2026, quarter=3)

            out("[STEP 12/13] Creating real AutoFilter copy and validating SUBTOTAL...")
            excel.create_filtered_copy(master, filtered, "BudgetA", expected_amount=300)

            out("[STEP 13/13] Creating fee workbooks and validating Excel reopen/J-L outline...")
            excel.create_fee_workbook(source, fee, "domestic", "service")
            excel.create_fee_workbook(overseas_source, overseas_fee, "overseas", "service")

            # Reopen the overseas service workbook in the same isolated Excel process.
            check_wb = excel.app.Workbooks.Open(str(overseas_fee.resolve()), UpdateLinks=0, ReadOnly=True, AddToMru=False)
            try:
                check_ws = check_wb.Worksheets(1)
                blue = 192 * 65536 + 112 * 256 + 0  # Excel BGR integer for RGB(0,112,192)
                j_blue = int(check_ws.Cells(1, 10).Font.Color) == blue
                k_blue = int(check_ws.Cells(1, 11).Font.Color) == blue
                l_blue = int(check_ws.Cells(1, 12).Font.Color) == blue
                if not j_blue or k_blue or not l_blue:
                    raise AssertionError(f"overseas fee font target mismatch: J={j_blue}, K={k_blue}, L={l_blue}")
                # J and L are independent blocks: both must have medium left/right edges.
                for col in (10, 12):
                    left_weight = int(check_ws.Range(check_ws.Cells(1, col), check_ws.Cells(4, col)).Borders(7).Weight)
                    right_weight = int(check_ws.Range(check_ws.Cells(1, col), check_ws.Cells(4, col)).Borders(10).Weight)
                    if left_weight != -4138 or right_weight != -4138:  # xlMedium
                        raise AssertionError(f"overseas fee outline missing on column {col}: {left_weight}/{right_weight}")
            finally:
                check_wb.Close(SaveChanges=False)

        out("[PASS] All Excel Native diagnostic stages completed.")
        return 0
    except Exception as exc:
        out("[ERROR] Diagnostic exception: " + repr(exc))
        import traceback
        tb = traceback.format_exc().encode("ascii", "backslashreplace").decode("ascii")
        out(tb)
        return 23
    finally:
        try:
            pidfile.unlink(missing_ok=True)
        except Exception:
            pass
        shutil.rmtree(tmp, ignore_errors=True)


def parent() -> int:
    pidfile = Path(tempfile.gettempdir()) / ("kriss_excel_diag_pid_" + str(os.getpid()) + ".txt")
    cmd = [sys.executable, "-u", str(Path(__file__).resolve()), "--worker", "--pidfile", str(pidfile)]
    out("[INFO] Diagnostic timeout: %d seconds." % TIMEOUT_SECONDS)
    p = subprocess.Popen(
        cmd,
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="ascii",
        errors="replace",
        bufsize=1,
    )

    q: queue.Queue[str | None] = queue.Queue()

    def reader() -> None:
        assert p.stdout is not None
        for line in p.stdout:
            q.put(line.rstrip("\r\n"))
        q.put(None)

    threading.Thread(target=reader, daemon=True).start()
    start = time.monotonic()
    stream_done = False
    while True:
        try:
            item = q.get(timeout=0.25)
            if item is None:
                stream_done = True
            else:
                print(item, flush=True)
        except queue.Empty:
            pass

        rc = p.poll()
        if rc is not None and stream_done:
            return int(rc)

        if time.monotonic() - start > TIMEOUT_SECONDS:
            out("[ERROR] TIMEOUT. The last printed STEP shows where Excel/COM stopped.")
            try:
                if pidfile.exists():
                    pid = pidfile.read_text(encoding="ascii").strip()
                    if pid.isdigit():
                        out("[INFO] Terminating diagnostic Excel process PID=" + pid)
                        subprocess.run(
                            ["taskkill", "/PID", pid, "/T", "/F"],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            check=False,
                        )
            except Exception:
                pass
            try:
                p.kill()
            except Exception:
                pass
            return 24


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--worker", action="store_true")
    ap.add_argument("--pidfile")
    args = ap.parse_args()
    if args.worker:
        return worker(Path(args.pidfile))
    return parent()


if __name__ == "__main__":
    raise SystemExit(main())
