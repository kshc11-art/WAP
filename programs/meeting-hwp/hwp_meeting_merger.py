# -*- coding: utf-8 -*-
"""
경영전략회의 HWP 취합기 v0.4.2

주요 변경
- Windows Explorer -> GUI 드래그앤드롭 지원 (외부 패키지 없이 Win32 WM_DROPFILES 사용)
- 공통양식 / 회신파일 드롭 영역 분리
- 회신파일 다중 추가, 폴더 일괄 추가, 순서 위/아래 이동, 중복 제거
- 출력파일 자동명명, 저장폴더 열기
- 사전검사 및 진행상태 표시
- COM 엔진 이중화:
  1) pywin32가 설치되어 있으면 pywin32 우선 사용
  2) 없으면 동봉된 PowerShell COM 엔진 사용 (pywin32 불필요)

주의
- v0.4.2도 참고 1 / 참고 2 대형 표는 자동 취합하지 않습니다.
- 실제 기관 PC의 한글 버전/보안정책에 따라 세부 액션 차이가 있을 수 있습니다.
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
import json
import locale
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List, Optional, Tuple

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from smart_rules import SmartOptions, build_smart_plan
from security_support import (
    auto_register_local_example,
    preferred_module_names,
    register_security_dll,
    security_module_status,
)


APP_VERSION = "0.4.2"
APP_TITLE = f"경영전략회의 HWP 취합기 v{APP_VERSION}"
ROOT_DIR = Path(__file__).resolve().parent
PS_ENGINE = ROOT_DIR / "hwp_merge_engine.ps1"

SUPPORTED_EXTS = {".hwp", ".hwpx"}

FIELD_SPECS = [
    ("past_patent", "[특허권리화/컨설팅]"),
    ("future_patent", "[특허권리화/컨설팅]"),
    ("past_transfer", "[기술수요발굴/마케팅/기술이전]"),
    ("future_transfer", "[기술수요발굴/마케팅/기술이전]"),
    ("past_startup", "[창업/연구소기업/출자회사]"),
    ("future_startup", "[창업/연구소기업/출자회사]"),
    ("past_other", "[기타]"),
    ("future_other", "[기타]"),
]
FIELD_NAMES = [name for name, _ in FIELD_SPECS]


class HwpError(RuntimeError):
    pass


@dataclass
class MergeResult:
    source: Path
    copied_fields: List[str]
    skipped_fields: List[str]


# ---------------------------------------------------------------------------
# Common helpers
# ---------------------------------------------------------------------------

def is_hwp_file(path: str | Path) -> bool:
    try:
        p = Path(path)
        return p.is_file() and p.suffix.lower() in SUPPORTED_EXTS
    except Exception:
        return False


def unique_paths(paths: List[str | Path]) -> List[Path]:
    seen = set()
    out = []
    for item in paths:
        p = Path(item).resolve()
        key = os.path.normcase(str(p))
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def default_output_name(base_path: str | Path) -> str:
    if not base_path:
        return ""
    p = Path(base_path)
    # "담당", "작성" 등의 원본명을 유지하되 취합본임을 명확히 표시.
    return str(p.with_name(p.stem + "_취합본.hwp"))


def open_in_explorer(path: Path):
    path = Path(path).resolve()
    target = path if path.is_dir() else path.parent
    if os.name == "nt":
        os.startfile(str(target))  # type: ignore[attr-defined]


def pywin32_available() -> bool:
    if os.name != "nt":
        return False
    try:
        import win32com.client  # noqa: F401
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# pywin32 merge engine
# ---------------------------------------------------------------------------

def import_win32():
    try:
        import win32com.client as win32
        return win32
    except Exception as e:
        raise HwpError("pywin32를 불러오지 못했습니다.") from e


def new_hwp(visible: bool = False):
    if os.name != "nt":
        raise HwpError("한글 Automation은 Windows에서만 실행할 수 있습니다.")
    win32 = import_win32()
    try:
        try:
            hwp = win32.DispatchEx("HWPFrame.HwpObject")
        except Exception:
            hwp = win32.gencache.EnsureDispatch("HWPFrame.HwpObject")

        try:
            hwp.XHwpWindows.Active_XHwpWindow.Visible = visible
        except Exception:
            pass

        for module_name in preferred_module_names():
            try:
                if hwp.RegisterModule("FilePathCheckDLL", module_name):
                    break
            except Exception:
                continue
        return hwp
    except Exception as e:
        raise HwpError(
            "한글 Automation 객체를 만들지 못했습니다. "
            "한컴오피스 한글 설치 여부를 확인하세요."
        ) from e


def hwp_open(hwp, path: Path):
    path = Path(path).resolve()

    # Suppress the "document was created by a newer HWP version" warning.
    # Keep force-open/password options explicit for unattended automation.
    open_arg = (
        "lock:false;"
        "forceopen:true;"
        "suspendpassword:true;"
        "versionwarning:false;"
    )
    ok = hwp.Open(str(path), "", open_arg)

    if ok is False:
        raise HwpError(f"한글 파일을 열지 못했습니다: {path}")


def save_as_hwp(hwp, path: Path):
    path = Path(path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    ok = hwp.SaveAs(str(path), "HWP", "")
    if ok is False:
        raise HwpError(f"저장에 실패했습니다: {path}")


def repeat_find(hwp, text: str) -> bool:
    pset = hwp.HParameterSet.HFindReplace
    hwp.HAction.GetDefault("RepeatFind", pset.HSet)
    pset.FindString = text
    try:
        pset.Direction = hwp.FindDir("Forward")
    except Exception:
        pset.Direction = 0
    pset.WholeWordOnly = 0
    pset.UseWildCards = 0
    pset.SeveralWords = 0
    pset.AllWordForms = 0
    pset.MatchCase = 0
    pset.ReplaceMode = 0
    pset.FindRegExp = 0
    pset.FindJaso = 0
    pset.HanjaFromHangul = 0
    pset.IgnoreMessage = 1
    pset.FindType = 1
    return bool(hwp.HAction.Execute("RepeatFind", pset.HSet))


def tag_target_cells(hwp, log: Callable[[str], None] = lambda s: None):
    if all(bool(hwp.FieldExist(name)) for name in FIELD_NAMES):
        return
    hwp.Run("MoveDocBegin")
    for field_name, header in FIELD_SPECS:
        if not repeat_find(hwp, header):
            raise HwpError(f"'{header}' 제목을 찾지 못했습니다.")
        try:
            hwp.Run("Cancel")
        except Exception:
            pass
        try:
            # Desktop HWP Automation through pywin32 can require all four
            # COM arguments even though some scripting examples omit optional
            # parameters. Passing the complete signature avoids
            # DISP_E_BADPARAMCOUNT (-2147352562).
            ok = hwp.SetCurFieldName(field_name, 0, "", "")
        except Exception as e:
            raise HwpError(
                f"'{header}' 셀의 필드명 지정 중 오류가 발생했습니다: "
                f"SetCurFieldName('{field_name}', 0, '', '')"
            ) from e

        if ok is False:
            raise HwpError(f"'{header}' 셀에 필드명을 지정하지 못했습니다.")
    missing = [name for name in FIELD_NAMES if not bool(hwp.FieldExist(name))]
    if missing:
        raise HwpError("셀 필드 준비에 실패했습니다: " + ", ".join(missing))


def normalize_cell_text(text: str) -> str:
    if text is None:
        return ""
    return str(text).replace("\r\n", "\n").replace("\r", "\n").replace("\x02", "").strip()


def cell_has_payload(hwp, field_name: str, header: str) -> bool:
    raw = normalize_cell_text(hwp.GetFieldText(field_name))
    if not raw:
        return False
    if raw.startswith(header):
        raw = raw[len(header):].strip()
    return bool(raw)


def select_payload_below_header(hwp, field_name: str):
    moved = hwp.MoveToField(field_name, True, True, False)
    if moved is False:
        raise HwpError(f"필드로 이동하지 못했습니다: {field_name}")
    hwp.Run("MoveListBegin")
    if hwp.Run("MoveNextParaBegin") is False:
        return False
    if hwp.Run("MoveSelListEnd") is False:
        return False
    return True


def copy_payload_to_clipboard(hwp, field_name: str) -> bool:
    if not select_payload_below_header(hwp, field_name):
        return False
    ok = hwp.Run("Copy")
    time.sleep(0.08)
    try:
        hwp.Run("Cancel")
    except Exception:
        pass
    return ok is not False


def paste_payload_at_end(hwp, field_name: str):
    moved = hwp.MoveToField(field_name, True, True, False)
    if moved is False:
        raise HwpError(f"최종본 필드로 이동하지 못했습니다: {field_name}")
    hwp.Run("MoveListEnd")
    try:
        hwp.Run("BreakPara")
    except Exception:
        pass
    if hwp.Run("Paste") is False:
        raise HwpError(f"붙여넣기에 실패했습니다: {field_name}")
    time.sleep(0.08)


def close_hwp(hwp):
    if hwp is None:
        return
    try:
        hwp.Clear(1)
    except Exception:
        try:
            hwp.Quit()
        except Exception:
            pass


def merge_with_pywin32(
    base_file: Path,
    response_files: List[Path],
    output_file: Path,
    keep_open: bool,
    log: Callable[[str], None],
    progress: Callable[[int, int], None],
) -> List[MergeResult]:
    output_file.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(base_file, output_file)
    log("기준 양식을 출력파일로 복사했습니다.")

    dest = None
    results: List[MergeResult] = []
    try:
        dest = new_hwp(visible=False)
        hwp_open(dest, output_file)
        tag_target_cells(dest, log)
        total = len(response_files)

        for idx, source_path in enumerate(response_files, 1):
            log(f"[{idx}/{total}] {source_path.name}")
            progress(idx - 1, total)
            src = None
            copied, skipped = [], []
            try:
                src = new_hwp(visible=False)
                hwp_open(src, source_path)
                tag_target_cells(src)
                for field_name, header in FIELD_SPECS:
                    if not cell_has_payload(src, field_name, header):
                        skipped.append(field_name)
                        continue
                    if not copy_payload_to_clipboard(src, field_name):
                        skipped.append(field_name)
                        continue
                    paste_payload_at_end(dest, field_name)
                    copied.append(field_name)
                results.append(MergeResult(source_path, copied, skipped))
                log(f"  -> {len(copied)}개 영역 반영")
            finally:
                close_hwp(src)
            progress(idx, total)

        save_as_hwp(dest, output_file)
        if keep_open:
            try:
                dest.XHwpWindows.Active_XHwpWindow.Visible = True
                dest = None
            except Exception:
                pass
        return results
    finally:
        close_hwp(dest)


# ---------------------------------------------------------------------------
# PowerShell fallback engine
# ---------------------------------------------------------------------------

def _terminate_engine_process(proc):
    if proc is None:
        return
    try:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
    except Exception:
        pass


def validate_powershell_engine_syntax() -> None:
    """Validate hwp_merge_engine.ps1 with Windows PowerShell.

    v0.3.6 appended the engine path after -Command. Windows PowerShell can
    interpret everything after -Command as PowerShell source, so an install
    path such as C:/Users/.../hwp_merge_engine.ps1 became an UnexpectedToken.

    v0.4.2 passes the engine path through environment variables instead.
    The -Command source contains no user or installation path.
    """
    if os.name != "nt":
        return

    if not PS_ENGINE.exists():
        raise HwpError(f"동봉 엔진 파일이 없습니다: {PS_ENGINE}")

    with tempfile.TemporaryDirectory(prefix="hwp_ps_preflight_") as td:
        error_file = Path(td) / "parser_errors.txt"

        env = os.environ.copy()
        env["HWP_ENGINE_PATH"] = str(PS_ENGINE)
        env["HWP_ENGINE_ERROR_PATH"] = str(error_file)

        command = (
            "$tokens=$null; "
            "$errors=$null; "
            "$enginePath=$env:HWP_ENGINE_PATH; "
            "$errorPath=$env:HWP_ENGINE_ERROR_PATH; "
            "[System.Management.Automation.Language.Parser]::ParseFile("
            "$enginePath,[ref]$tokens,[ref]$errors) | Out-Null; "
            "if($errors.Count -gt 0){ "
            "$lines=@($errors | ForEach-Object { "
            "$_.Message + ' [line ' + $_.Extent.StartLineNumber "
            "+ ', col ' + $_.Extent.StartColumnNumber + ']' "
            "}); "
            "$lines | Set-Content -LiteralPath $errorPath -Encoding UTF8; "
            "exit 31 "
            "}; "
            "exit 0"
        )

        console_encoding = (
            locale.getpreferredencoding(False)
            if os.name == "nt"
            else "utf-8"
        ) or "utf-8"

        try:
            proc = subprocess.run(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    command,
                ],
                cwd=str(ROOT_DIR),
                env=env,
                capture_output=True,
                text=True,
                encoding=console_encoding,
                errors="replace",
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                timeout=20,
            )
        except subprocess.TimeoutExpired as e:
            raise HwpError(
                "PowerShell 엔진 문법 사전검사가 20초 안에 끝나지 않았습니다."
            ) from e

        if proc.returncode != 0:
            detail = ""

            if error_file.exists():
                try:
                    detail = error_file.read_text(
                        encoding="utf-8-sig",
                        errors="replace",
                    ).strip()
                except Exception:
                    detail = ""

            if not detail:
                detail = (proc.stderr or proc.stdout or "").strip()

            raise HwpError(
                "동봉 PowerShell 엔진의 문법 검사에 실패했습니다.\n\n"
                + (
                    detail
                    if detail
                    else "Windows PowerShell ParserError"
                )
            )

def run_powershell_engine(
    job: dict,
    log: Callable[[str], None],
    cancel_event: Optional[threading.Event] = None,
    timeout_seconds: int = 180,
) -> dict:
    """Run the PowerShell COM engine without freezing the GUI.

    v0.3.1 used subprocess.run(), so one blocked HWP COM call made the entire
    Tk GUI appear to hang forever. v0.4.2 polls the process, streams engine.log,
    supports cancellation, and aborts a stalled phase after a fixed timeout.
    """
    if os.name != "nt":
        raise HwpError("PowerShell COM 엔진은 Windows에서만 실행할 수 있습니다.")
    if not PS_ENGINE.exists():
        raise HwpError(f"동봉 엔진 파일이 없습니다: {PS_ENGINE}")

    validate_powershell_engine_syntax()

    with tempfile.TemporaryDirectory(prefix="hwp_merge_") as td:
        td_path = Path(td)
        job_file = td_path / "job.json"
        result_file = td_path / "result.json"
        log_file = td_path / "engine.log"

        job_file.write_text(
            json.dumps(job, ensure_ascii=False),
            encoding="utf-8-sig",
        )

        cmd = [
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(PS_ENGINE),
            "-JobFile",
            str(job_file),
            "-ResultFile",
            str(result_file),
            "-LogFile",
            str(log_file),
        ]

        console_encoding = (
            locale.getpreferredencoding(False)
            if os.name == "nt"
            else "utf-8"
        ) or "utf-8"

        proc = subprocess.Popen(
            cmd,
            cwd=str(ROOT_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding=console_encoding,
            errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )

        started = time.monotonic()
        last_activity = started
        emitted_count = 0
        last_log_line = ""

        try:
            while True:
                # Stream newly appended PowerShell engine log lines.
                if log_file.exists():
                    try:
                        lines = log_file.read_text(
                            encoding="utf-8-sig",
                            errors="replace",
                        ).splitlines()
                        if len(lines) > emitted_count:
                            for line in lines[emitted_count:]:
                                if line.strip():
                                    last_log_line = line.strip()
                                    log(last_log_line)
                                    last_activity = time.monotonic()
                            emitted_count = len(lines)
                    except Exception:
                        pass

                if cancel_event is not None and cancel_event.is_set():
                    _terminate_engine_process(proc)
                    raise HwpError("사용자가 취합 작업을 중지했습니다.")

                return_code = proc.poll()
                if return_code is not None:
                    break

                elapsed_without_log = time.monotonic() - last_activity
                total_elapsed = time.monotonic() - started

                if elapsed_without_log > timeout_seconds:
                    _terminate_engine_process(proc)
                    stage = last_log_line or "PowerShell COM 엔진 시작"
                    raise HwpError(
                        "한글 COM 작업이 일정 시간 동안 응답하지 않아 중단했습니다.\n\n"
                        f"마지막 단계: {stage}\n"
                        f"무응답 시간: {int(elapsed_without_log)}초\n\n"
                        "보안 승인창이나 한글 확인창이 다른 창 뒤에 떠 있는지 확인하고, "
                        "같은 문제가 반복되면 [로그 보기]의 마지막 단계와 함께 알려주세요."
                    )

                # Absolute guard in case the engine keeps logging without finishing.
                if total_elapsed > max(timeout_seconds * 4, 600):
                    _terminate_engine_process(proc)
                    raise HwpError(
                        "취합 작업이 최대 허용 시간을 초과하여 중단했습니다."
                    )

                time.sleep(0.15)

            stdout, stderr = proc.communicate(timeout=5)

            # Flush any final log lines written immediately before process exit.
            if log_file.exists():
                try:
                    lines = log_file.read_text(
                        encoding="utf-8-sig",
                        errors="replace",
                    ).splitlines()
                    for line in lines[emitted_count:]:
                        if line.strip():
                            log(line.strip())
                except Exception:
                    pass

            if not result_file.exists():
                detail = (stderr or stdout or "").strip()
                raise HwpError(
                    "PowerShell 엔진 결과파일이 생성되지 않았습니다."
                    + (f"\n{detail}" if detail else "")
                )

            data = json.loads(
                result_file.read_text(encoding="utf-8-sig")
            )

            if proc.returncode != 0 or not data.get("success"):
                detail = data.get("error") or (stderr or stdout or "").strip()
                raise HwpError(
                    "PowerShell COM 엔진 실행에 실패했습니다."
                    + (f"\n{detail}" if detail else "")
                )

            return data

        finally:
            _terminate_engine_process(proc)


def extract_for_smart_merge(
    base_file: Path,
    response_files: List[Path],
    log: Callable[[str], None],
    cancel_event: Optional[threading.Event] = None,
) -> List[dict]:
    log("스마트 취합용 본문 구조를 읽는 중입니다.")
    data = run_powershell_engine(
        {
            "mode": "extract",
            "base_file": str(base_file),
            "response_files": [str(p) for p in response_files],
        },
        log,
        cancel_event=cancel_event,
    )
    extracted = list(data.get("extracted", []))
    if not extracted:
        raise HwpError("스마트 취합용 HWP 본문을 읽지 못했습니다.")
    return extracted


def merge_with_powershell(
    base_file: Path,
    response_files: List[Path],
    output_file: Path,
    keep_open: bool,
    log: Callable[[str], None],
    progress: Callable[[int, int], None],
    smart_plan: Optional[dict] = None,
    cancel_event: Optional[threading.Event] = None,
) -> List[MergeResult]:
    output_file.parent.mkdir(parents=True, exist_ok=True)

    job = {
        "mode": "merge",
        "base_file": str(base_file),
        "response_files": [str(p) for p in response_files],
        "output_file": str(output_file),
        "keep_open": bool(keep_open),
    }
    if smart_plan is not None:
        job["smart_plan"] = smart_plan

    progress(0, max(1, len(response_files)))
    data = run_powershell_engine(
        job,
        log,
        cancel_event=cancel_event,
    )

    results: List[MergeResult] = []
    for item in data.get("results", []):
        results.append(
            MergeResult(
                Path(item["source"]),
                list(item.get("copied_fields", [])),
                list(item.get("skipped_fields", [])),
            )
        )

    smart_fields = list(data.get("smart_fields", []))
    if smart_fields:
        # Synthetic summary result so GUI completion counts smart-rewritten
        # regions in addition to safe copy/paste regions.
        results.append(
            MergeResult(base_file, smart_fields, [])
        )

    progress(len(response_files), max(1, len(response_files)))
    return results


def merge_hwp_files(
    base_file: Path,
    response_files: List[Path],
    output_file: Path,
    keep_open: bool,
    log: Callable[[str], None],
    progress: Callable[[int, int], None],
    smart_enabled: bool = True,
    smart_options: Optional[SmartOptions] = None,
    cancel_event: Optional[threading.Event] = None,
) -> Tuple[str, List[MergeResult]]:
    """v0.4.2 lossless-first merge.

    The destructive smart reconstruction pipeline is intentionally disabled.
    Each response HWP cell is copied natively and appended to the SAME physical
    destination cell. No topic/body content is deleted by Python rules.
    """
    base_file = Path(base_file).resolve()
    response_files = unique_paths(response_files)
    output_file = Path(output_file).resolve()

    options = smart_options or SmartOptions()

    log("취합 방식: 보존 우선 HWP 원본 취합")
    log("자동 삭제/병합: 사용 안 함 (중복 후보만 로그 표시)")
    log("각 회신 셀을 한글 자체 Copy/Paste로 같은 셀에 추가합니다.")

    output_file.parent.mkdir(parents=True, exist_ok=True)

    job = {
        "mode": "lossless",
        "base_file": str(base_file),
        "response_files": [str(p) for p in response_files],
        "output_file": str(output_file),
        "keep_open": bool(keep_open),
        "normalize_symbols": bool(options.normalize_layout),
        "normalize_dates": bool(options.normalize_dates),
        "duplicate_report": bool(options.dedupe),
    }

    progress(0, max(1, len(response_files)))

    data = run_powershell_engine(
        job,
        log,
        cancel_event=cancel_event,
    )

    results: List[MergeResult] = []

    for item in data.get("results", []):
        results.append(
            MergeResult(
                Path(item["source"]),
                list(item.get("copied_fields", [])),
                list(item.get("skipped_fields", [])),
            )
        )

    progress(
        len(response_files),
        max(1, len(response_files)),
    )

    return "powershell-lossless", results


# ---------------------------------------------------------------------------
# Native Windows file drop support (WM_DROPFILES)
# ---------------------------------------------------------------------------

class NativeDropSupport:
    WM_DROPFILES = 0x0233
    GWLP_WNDPROC = -4
    UINT_MAX = 0xFFFFFFFF

    def __init__(self, app: "App"):
        self.app = app
        self.enabled = False
        self._callback = None
        self._old_proc = None
        if os.name != "nt":
            return
        try:
            self._install()
            self.enabled = True
        except Exception:
            # Drag-drop is convenience only; file picker must still work.
            self.enabled = False

    def _install(self):
        user32 = ctypes.windll.user32
        shell32 = ctypes.windll.shell32

        self.hwnd = self.app.winfo_id()
        shell32.DragAcceptFiles.argtypes = [wintypes.HWND, wintypes.BOOL]
        shell32.DragAcceptFiles(self.hwnd, True)

        LRESULT = ctypes.c_ssize_t
        WPARAM = ctypes.c_size_t
        LPARAM = ctypes.c_ssize_t
        WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wintypes.HWND, wintypes.UINT, WPARAM, LPARAM)

        if ctypes.sizeof(ctypes.c_void_p) == 8:
            set_long = user32.SetWindowLongPtrW
            get_long = user32.GetWindowLongPtrW
        else:
            set_long = user32.SetWindowLongW
            get_long = user32.GetWindowLongW

        set_long.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_void_p]
        set_long.restype = ctypes.c_void_p
        get_long.argtypes = [wintypes.HWND, ctypes.c_int]
        get_long.restype = ctypes.c_void_p

        self._old_proc = get_long(self.hwnd, self.GWLP_WNDPROC)

        shell32.DragQueryFileW.argtypes = [
            wintypes.HANDLE, wintypes.UINT, wintypes.LPWSTR, wintypes.UINT
        ]
        shell32.DragQueryFileW.restype = wintypes.UINT
        shell32.DragQueryPoint.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.POINT)]
        shell32.DragQueryPoint.restype = wintypes.BOOL
        shell32.DragFinish.argtypes = [wintypes.HANDLE]

        user32.CallWindowProcW.argtypes = [
            ctypes.c_void_p, wintypes.HWND, wintypes.UINT, WPARAM, LPARAM
        ]
        user32.CallWindowProcW.restype = LRESULT

        @WNDPROC
        def wnd_proc(hwnd, msg, wparam, lparam):
            if msg == self.WM_DROPFILES:
                try:
                    hdrop = wintypes.HANDLE(wparam)
                    count = shell32.DragQueryFileW(hdrop, self.UINT_MAX, None, 0)
                    paths = []
                    for i in range(count):
                        size = shell32.DragQueryFileW(hdrop, i, None, 0)
                        buf = ctypes.create_unicode_buffer(size + 1)
                        shell32.DragQueryFileW(hdrop, i, buf, size + 1)
                        paths.append(buf.value)

                    pt = wintypes.POINT()
                    shell32.DragQueryPoint(hdrop, ctypes.byref(pt))
                    shell32.DragFinish(hdrop)

                    self.app.after(0, lambda p=paths, x=pt.x, y=pt.y: self.app.handle_drop(p, x, y))
                    return 0
                except Exception:
                    pass

            return user32.CallWindowProcW(
                self._old_proc, hwnd, msg, wparam, lparam
            )

        self._callback = wnd_proc
        result = set_long(self.hwnd, self.GWLP_WNDPROC, ctypes.cast(wnd_proc, ctypes.c_void_p))
        if not result:
            # SetWindowLongPtr can return zero when previous value was zero,
            # but top-level Tk windows normally have a previous proc.
            pass

    def close(self):
        if not self.enabled or not self._old_proc:
            return
        try:
            user32 = ctypes.windll.user32
            if ctypes.sizeof(ctypes.c_void_p) == 8:
                set_long = user32.SetWindowLongPtrW
            else:
                set_long = user32.SetWindowLongW
            set_long(self.hwnd, self.GWLP_WNDPROC, self._old_proc)
            ctypes.windll.shell32.DragAcceptFiles(self.hwnd, False)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# GUI
# ---------------------------------------------------------------------------


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)

        # v0.2.0 bug fix:
        # On common 768px-height office monitors, the output section/footer could
        # be pushed out of the visible client area. Grid keeps the footer fixed
        # and lets only the response list absorb resizing.
        self.geometry("980x700")
        self.minsize(820, 560)

        self.base_var = tk.StringVar()
        self.output_var = tk.StringVar()
        self.keep_open_var = tk.BooleanVar(value=True)
        self.auto_output_var = tk.BooleanVar(value=True)
        self.status_var = tk.StringVar(value="준비")
        self.engine_var = tk.StringVar()
        self.security_var = tk.StringVar(value="보안모듈: 확인 중")
        self.smart_merge_var = tk.BooleanVar(value=True)
        self.smart_dedupe_var = tk.BooleanVar(value=True)
        self.smart_group_var = tk.BooleanVar(value=True)
        self.smart_dates_var = tk.BooleanVar(value=True)
        self.smart_layout_var = tk.BooleanVar(value=True)
        self.smart_line_spacing_var = tk.IntVar(value=160)

        self.response_files: List[Path] = []
        self.last_output: Optional[Path] = None

        self.log_lines: List[str] = []
        self.log_window: Optional[tk.Toplevel] = None
        self.log_text: Optional[tk.Text] = None

        self.ui_queue: "queue.Queue[tuple]" = queue.Queue()
        self.worker_thread: Optional[threading.Thread] = None
        self.cancel_event = threading.Event()

        try:
            auto_register_local_example(ROOT_DIR)
        except Exception:
            pass

        self._configure_style()
        self._build_ui()
        self.update_idletasks()
        self.drop_support = NativeDropSupport(self)
        self._refresh_engine_label()

        self.after(100, self._drain_ui_queue)
        self.protocol("WM_DELETE_WINDOW", self.on_close)

    # ---------- style ----------
    def _configure_style(self):
        style = ttk.Style(self)
        try:
            style.theme_use("vista")
        except Exception:
            pass

        style.configure("Title.TLabel", font=("맑은 고딕", 16, "bold"))
        style.configure("Sub.TLabel", font=("맑은 고딕", 9))
        style.configure("Hint.TLabel", font=("맑은 고딕", 9))
        style.configure("Card.TLabelframe", padding=8)
        style.configure("Card.TLabelframe.Label", font=("맑은 고딕", 10, "bold"))
        style.configure("Primary.TButton", font=("맑은 고딕", 11, "bold"), padding=(22, 10))
        style.configure("Drop.TLabel", padding=10, anchor="center", relief="solid")
        style.configure("Status.TLabel", padding=(4, 2))

    def _build_ui(self):
        outer = ttk.Frame(self, padding=12)
        outer.pack(fill="both", expand=True)

        outer.columnconfigure(0, weight=1)
        outer.rowconfigure(0, weight=0)
        outer.rowconfigure(1, weight=0)
        outer.rowconfigure(2, weight=1)  # only response list stretches/shrinks
        outer.rowconfigure(3, weight=0)
        outer.rowconfigure(4, weight=0)

        # Header
        header = ttk.Frame(outer)
        header.grid(row=0, column=0, sticky="ew", pady=(0, 8))
        header.columnconfigure(0, weight=1)

        ttk.Label(
            header, text="경영전략회의 HWP 취합기", style="Title.TLabel"
        ).grid(row=0, column=0, sticky="w")

        ttk.Label(
            header,
            text="팀원에게 배포한 공통 작성 HWP를 기준으로 여러 회신본을 한 번에 취합합니다.",
            style="Sub.TLabel",
        ).grid(row=1, column=0, sticky="w", pady=(2, 0))

        engine_row = ttk.Frame(header)
        engine_row.grid(row=2, column=0, sticky="ew", pady=(4, 0))
        engine_row.columnconfigure(0, weight=1)

        ttk.Label(
            engine_row, textvariable=self.engine_var
        ).grid(row=0, column=0, sticky="w")

        ttk.Label(
            engine_row, textvariable=self.security_var
        ).grid(row=0, column=1, padx=(12, 4), sticky="e")

        ttk.Button(
            engine_row, text="보안모듈 설정", command=self.setup_security_module
        ).grid(row=0, column=2, padx=(0, 12))

        self.drop_status_label = ttk.Label(engine_row, text="")
        self.drop_status_label.grid(row=0, column=3, sticky="e")

        # 1. Common/base HWP
        base_card = ttk.LabelFrame(
            outer,
            text="1. 공통 작성 원본 HWP  -  팀원들에게 동일하게 배포한 파일",
            style="Card.TLabelframe",
        )
        base_card.grid(row=1, column=0, sticky="ew", pady=4)
        base_card.columnconfigure(0, weight=1)

        ttk.Label(
            base_card,
            text=(
                "예: '(작성) 성과정책본부_경영전략회의_260824_담당.hwp'  "
                "※ 지난 회차 참고파일이나 팀원 회신본이 아닙니다."
            ),
            style="Hint.TLabel",
        ).grid(row=0, column=0, columnspan=3, sticky="w", padx=2, pady=(0, 5))

        self.base_drop = ttk.Label(
            base_card,
            text="공통 작성 원본 HWP/HWPX를 여기에 끌어놓으세요",
            style="Drop.TLabel",
            cursor="hand2",
        )
        self.base_drop.grid(row=1, column=0, columnspan=3, sticky="ew", padx=2, pady=(0, 5))
        self.base_drop.bind("<Button-1>", lambda e: self.pick_base())

        self.base_entry = ttk.Entry(base_card, textvariable=self.base_var)
        self.base_entry.grid(row=2, column=0, sticky="ew", padx=(2, 5))
        ttk.Button(base_card, text="찾기", command=self.pick_base).grid(row=2, column=1, padx=3)
        ttk.Button(base_card, text="지우기", command=self.clear_base).grid(row=2, column=2, padx=(3, 2))

        # 2. Response HWP list
        resp_card = ttk.LabelFrame(
            outer,
            text="2. 담당자 회신 HWP  -  작성 후 돌아온 파일들",
            style="Card.TLabelframe",
        )
        resp_card.grid(row=2, column=0, sticky="nsew", pady=4)
        resp_card.columnconfigure(0, weight=1)
        resp_card.rowconfigure(2, weight=1)

        self.response_drop = ttk.Label(
            resp_card,
            text="회신 HWP/HWPX 여러 개를 여기에 한꺼번에 끌어놓으세요",
            style="Drop.TLabel",
            cursor="hand2",
        )
        self.response_drop.grid(row=0, column=0, sticky="ew", padx=2, pady=(0, 5))
        self.response_drop.bind("<Button-1>", lambda e: self.add_responses_dialog())

        toolbar = ttk.Frame(resp_card)
        toolbar.grid(row=1, column=0, sticky="ew", padx=2, pady=(0, 5))
        toolbar.columnconfigure(8, weight=1)

        ttk.Button(toolbar, text="파일 추가", command=self.add_responses_dialog).grid(row=0, column=0)
        ttk.Button(toolbar, text="폴더 추가", command=self.add_folder).grid(row=0, column=1, padx=4)
        ttk.Separator(toolbar, orient="vertical").grid(row=0, column=2, sticky="ns", padx=5)
        ttk.Button(toolbar, text="위로", command=lambda: self.move_selected(-1)).grid(row=0, column=3)
        ttk.Button(toolbar, text="아래로", command=lambda: self.move_selected(1)).grid(row=0, column=4, padx=4)
        ttk.Button(toolbar, text="선택 삭제", command=self.remove_selected).grid(row=0, column=5, padx=(8, 4))
        ttk.Button(toolbar, text="전체 삭제", command=self.clear_responses).grid(row=0, column=6)

        self.count_label = ttk.Label(toolbar, text="0개")
        self.count_label.grid(row=0, column=9, sticky="e")

        tree_frame = ttk.Frame(resp_card)
        tree_frame.grid(row=2, column=0, sticky="nsew", padx=2, pady=(0, 2))
        tree_frame.columnconfigure(0, weight=1)
        tree_frame.rowconfigure(0, weight=1)

        self.tree = ttk.Treeview(
            tree_frame,
            columns=("order", "name", "folder"),
            show="headings",
            selectmode="extended",
            height=5,
        )
        self.tree.heading("order", text="순서")
        self.tree.heading("name", text="파일명")
        self.tree.heading("folder", text="폴더")
        self.tree.column("order", width=55, anchor="center", stretch=False)
        self.tree.column("name", width=380, anchor="w")
        self.tree.column("folder", width=420, anchor="w")
        self.tree.grid(row=0, column=0, sticky="nsew")

        yscroll = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview)
        yscroll.grid(row=0, column=1, sticky="ns")
        self.tree.configure(yscrollcommand=yscroll.set)
        self.tree.bind("<Delete>", lambda e: self.remove_selected())

        # 3. Output HWP
        out_card = ttk.LabelFrame(
            outer,
            text="3. 최종 HWP  -  취합 결과 저장 파일",
            style="Card.TLabelframe",
        )
        out_card.grid(row=3, column=0, sticky="ew", pady=4)
        out_card.columnconfigure(0, weight=1)

        option_row = ttk.Frame(out_card)
        option_row.grid(row=0, column=0, columnspan=3, sticky="ew", padx=2, pady=(0, 4))
        option_row.columnconfigure(1, weight=1)

        ttk.Checkbutton(
            option_row,
            text="공통 작성 원본 기준으로 파일명 자동 생성",
            variable=self.auto_output_var,
            command=self._sync_output_name,
        ).grid(row=0, column=0, sticky="w")

        smart_box = ttk.Frame(option_row)
        smart_box.grid(row=0, column=1, sticky="e", padx=8)

        ttk.Checkbutton(
            smart_box,
            text="보존 우선 취합",
            variable=self.smart_merge_var,
            state="disabled",
        ).pack(side="left")

        ttk.Button(
            smart_box,
            text="후처리 설정",
            command=self.show_smart_settings,
        ).pack(side="left", padx=(4, 0))

        ttk.Checkbutton(
            option_row,
            text="취합 후 한글에서 최종본 열어두기",
            variable=self.keep_open_var,
        ).grid(row=0, column=2, sticky="e")

        self.output_entry = ttk.Entry(out_card, textvariable=self.output_var)
        self.output_entry.grid(row=1, column=0, sticky="ew", padx=(2, 5))
        ttk.Button(out_card, text="저장 위치", command=self.pick_output).grid(row=1, column=1, padx=3)
        ttk.Button(out_card, text="폴더 열기", command=self.open_output_folder).grid(row=1, column=2, padx=(3, 2))

        # Footer: always visible.
        footer = ttk.Frame(outer)
        footer.grid(row=4, column=0, sticky="ew", pady=(7, 0))
        footer.columnconfigure(0, weight=1)

        status_box = ttk.Frame(footer)
        status_box.grid(row=0, column=0, sticky="ew", padx=(0, 10))
        status_box.columnconfigure(0, weight=1)

        ttk.Label(status_box, textvariable=self.status_var, style="Status.TLabel").grid(
            row=0, column=0, sticky="w"
        )
        self.progress = ttk.Progressbar(status_box, mode="determinate", maximum=100)
        self.progress.grid(row=1, column=0, sticky="ew", pady=(3, 0))

        ttk.Button(footer, text="로그 보기", command=self.show_log_window).grid(
            row=0, column=1, rowspan=2, padx=(0, 8), sticky="ns"
        )

        self.stop_btn = ttk.Button(
            footer,
            text="중지",
            command=self.cancel_merge,
            state="disabled",
        )
        self.stop_btn.grid(
            row=0,
            column=2,
            rowspan=2,
            padx=(0, 8),
            sticky="ns",
        )

        self.run_btn = ttk.Button(
            footer,
            text="취합 실행",
            style="Primary.TButton",
            command=self.run_merge,
        )
        self.run_btn.grid(row=0, column=3, rowspan=2, sticky="nsew")

    # ---------- security / smart settings ----------
    def _refresh_security_status(self):
        try:
            ok, text = security_module_status()
            if ok:
                self.security_var.set(f"보안모듈: {text}")
            else:
                self.security_var.set("보안모듈: 미등록 (파일 열 때 승인창 표시)")
        except Exception:
            self.security_var.set("보안모듈: 상태 확인 실패")

    def setup_security_module(self):
        message = (
            "한컴 공식 Automation 보안모듈 DLL을 한 번 등록하면 "
            "각 HWP 파일을 열 때 나오는 접근 허용창을 없앨 수 있습니다.\n\n"
            "이미 '보안모듈(Automation).zip'을 내려받았다면 DLL 선택을 누르세요.\n"
            "아직 없다면 한컴 공식 페이지를 열어 내려받을 수 있습니다."
        )
        choice = messagebox.askyesnocancel(
            APP_TITLE,
            message + "\n\n[예] DLL 선택 후 등록\n[아니오] 한컴 공식 페이지 열기\n[취소] 닫기",
        )

        if choice is None:
            return

        if choice is False:
            webbrowser.open("https://developer.hancom.com/hwpautomation")
            return

        dll = filedialog.askopenfilename(
            title="한컴 Automation 보안모듈 DLL 선택",
            filetypes=[("DLL", "*.dll"), ("모든 파일", "*.*")],
        )
        if not dll:
            return

        try:
            module_name, target = register_security_dll(Path(dll))
            self._refresh_security_status()
            messagebox.showinfo(
                APP_TITLE,
                "보안모듈 등록이 완료되었습니다.\n\n"
                f"모듈명: {module_name}\n"
                f"등록 위치: {target}\n\n"
                "다음 취합부터 HWP 파일 접근 승인창이 나타나지 않는지 확인하세요.",
            )
        except Exception as e:
            messagebox.showerror(APP_TITLE, f"보안모듈 등록 실패:\n{e}")

    def show_smart_settings(self):
        win = tk.Toplevel(self)
        win.title(f"{APP_TITLE} - 보존 우선 후처리 설정")
        win.geometry("560x430")
        win.resizable(False, False)
        win.transient(self)

        frame = ttk.Frame(win, padding=14)
        frame.pack(fill="both", expand=True)

        ttk.Label(
            frame,
            text="v0.4.2은 내용을 삭제하지 않고 HWP 원본을 보존하여 취합합니다.",
            style="Sub.TLabel",
        ).pack(anchor="w", pady=(0, 10))

        ttk.Checkbutton(
            frame,
            text="같은 꼭지명 중복 후보를 로그에 표시 (실제 삭제하지 않음)",
            variable=self.smart_dedupe_var,
        ).pack(anchor="w", pady=4)

        ttk.Checkbutton(
            frame,
            text="자동 재정렬/병합은 정보 누락 방지를 위해 v0.4.2에서 중지",
            variable=self.smart_group_var,
            state="disabled",
        ).pack(anchor="w", pady=4)

        ttk.Checkbutton(
            frame,
            text="본문 날짜 표기 통일 (예: 8/25, 8. 25. → 8.25.; 요일 유지)",
            variable=self.smart_dates_var,
        ).pack(anchor="w", pady=4)

        ttk.Checkbutton(
            frame,
            text="기호 통일 (◦/○ → ㅇ)",
            variable=self.smart_layout_var,
        ).pack(anchor="w", pady=4)

        spacing_row = ttk.Frame(frame)
        spacing_row.pack(fill="x", pady=(12, 4))

        ttk.Label(spacing_row, text="줄간격 자동변경은 원본서식 보존을 위해 사용 안 함").pack(side="left")
        ttk.Spinbox(
            spacing_row,
            from_=80,
            to=300,
            increment=10,
            width=6,
            textvariable=self.smart_line_spacing_var,
            state="disabled",
        ).pack(side="left", padx=(8, 3))
        ttk.Label(spacing_row, text="%").pack(side="left")

        ttk.Separator(frame).pack(fill="x", pady=14)

        ttk.Label(
            frame,
            text=(
                "보존 원칙: 팀원 회신 HWP의 셀 내용을 한글 자체 Copy/Paste로 그대로 옮깁니다. "
                "표·글자모양·볼드·문단서식을 다시 생성하지 않습니다. "
                "동일 꼭지 자동 삭제는 현재 비활성화되어 정보 누락을 방지합니다."
            ),
            wraplength=520,
            justify="left",
        ).pack(anchor="w")

        ttk.Button(
            frame, text="닫기", command=win.destroy
        ).pack(side="bottom", anchor="e", pady=(14, 0))

    # ---------- log window ----------
    def show_log_window(self):
        if self.log_window is not None and self.log_window.winfo_exists():
            self.log_window.deiconify()
            self.log_window.lift()
            return

        win = tk.Toplevel(self)
        win.title(f"{APP_TITLE} - 진행 로그")
        win.geometry("760x420")
        win.minsize(560, 300)
        win.protocol("WM_DELETE_WINDOW", win.withdraw)

        frame = ttk.Frame(win, padding=8)
        frame.pack(fill="both", expand=True)

        text = tk.Text(frame, wrap="word")
        scroll = ttk.Scrollbar(frame, orient="vertical", command=text.yview)
        text.configure(yscrollcommand=scroll.set)

        text.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")

        if self.log_lines:
            text.insert("end", "\n".join(self.log_lines) + "\n")
            text.see("end")
        text.configure(state="disabled")

        self.log_window = win
        self.log_text = text

    # ---------- drop handling ----------
    def handle_drop(self, raw_paths: List[str], client_x: int, client_y: int):
        paths = [Path(p) for p in raw_paths if is_hwp_file(p)]
        if not paths:
            self.status_var.set("HWP/HWPX 파일만 추가할 수 있습니다.")
            return

        sx = self.winfo_rootx() + client_x
        sy = self.winfo_rooty() + client_y

        if self._point_in_widget(self.base_drop, sx, sy) or self._point_in_widget(self.base_entry, sx, sy):
            self.set_base(paths[0])
            if len(paths) > 1:
                self.add_response_paths(paths[1:])
            return

        if self._point_in_widget(self.response_drop, sx, sy) or self._point_in_widget(self.tree, sx, sy):
            self.add_response_paths(paths)
            return

        if not self.base_var.get() and len(paths) == 1:
            self.set_base(paths[0])
        else:
            self.add_response_paths(paths)

    @staticmethod
    def _point_in_widget(widget, sx: int, sy: int) -> bool:
        try:
            x1, y1 = widget.winfo_rootx(), widget.winfo_rooty()
            x2, y2 = x1 + widget.winfo_width(), y1 + widget.winfo_height()
            return x1 <= sx <= x2 and y1 <= sy <= y2
        except Exception:
            return False

    # ---------- file selection ----------
    def pick_base(self):
        path = filedialog.askopenfilename(
            title="팀원에게 배포한 공통 작성 원본 HWP 선택",
            filetypes=[("한글 문서", "*.hwp *.hwpx"), ("모든 파일", "*.*")],
        )
        if path:
            self.set_base(Path(path))

    def set_base(self, path: Path):
        if not is_hwp_file(path):
            messagebox.showwarning(APP_TITLE, "HWP/HWPX 파일을 선택하세요.")
            return
        p = Path(path).resolve()
        self.base_var.set(str(p))
        if self.auto_output_var.get():
            self.output_var.set(default_output_name(p))
        self.status_var.set(f"공통 작성 원본: {p.name}")
        self._update_drop_labels()

    def clear_base(self):
        self.base_var.set("")
        if self.auto_output_var.get():
            self.output_var.set("")
        self._update_drop_labels()

    def add_responses_dialog(self):
        paths = filedialog.askopenfilenames(
            title="담당자 회신 HWP 선택",
            filetypes=[("한글 문서", "*.hwp *.hwpx"), ("모든 파일", "*.*")],
        )
        self.add_response_paths([Path(p) for p in paths])

    def add_folder(self):
        folder = filedialog.askdirectory(title="회신 HWP가 있는 폴더 선택")
        if not folder:
            return
        p = Path(folder)
        found = sorted(
            [f for f in p.iterdir() if f.is_file() and f.suffix.lower() in SUPPORTED_EXTS],
            key=lambda x: x.name.lower(),
        )
        self.add_response_paths(found)
        if found:
            self.status_var.set(f"폴더에서 {len(found)}개 HWP/HWPX를 찾았습니다.")

    def add_response_paths(self, paths: List[Path]):
        base_key = (
            os.path.normcase(str(Path(self.base_var.get()).resolve()))
            if self.base_var.get()
            else ""
        )
        existing = {os.path.normcase(str(p.resolve())) for p in self.response_files}
        added = 0

        for raw in paths:
            p = Path(raw)
            if not is_hwp_file(p):
                continue
            p = p.resolve()
            key = os.path.normcase(str(p))
            if key == base_key or key in existing:
                continue
            self.response_files.append(p)
            existing.add(key)
            added += 1

        self.refresh_tree()

        if added:
            self.status_var.set(f"회신파일 {added}개 추가됨")
        elif paths:
            self.status_var.set("새로 추가할 파일이 없습니다. 중복 파일은 자동 제외됩니다.")

    def remove_selected(self):
        selected = list(self.tree.selection())
        if not selected:
            return
        indexes = sorted((int(iid) for iid in selected), reverse=True)
        for idx in indexes:
            if 0 <= idx < len(self.response_files):
                del self.response_files[idx]
        self.refresh_tree()

    def clear_responses(self):
        self.response_files.clear()
        self.refresh_tree()

    def move_selected(self, delta: int):
        selected = list(self.tree.selection())
        if len(selected) != 1:
            self.status_var.set("순서 변경은 파일 1개를 선택한 상태에서 사용하세요.")
            return

        idx = int(selected[0])
        new_idx = idx + delta
        if not (0 <= new_idx < len(self.response_files)):
            return

        self.response_files[idx], self.response_files[new_idx] = (
            self.response_files[new_idx],
            self.response_files[idx],
        )
        self.refresh_tree(select_index=new_idx)

    def refresh_tree(self, select_index: Optional[int] = None):
        for iid in self.tree.get_children():
            self.tree.delete(iid)

        for idx, p in enumerate(self.response_files):
            self.tree.insert(
                "",
                "end",
                iid=str(idx),
                values=(idx + 1, p.name, str(p.parent)),
            )

        self.count_label.configure(text=f"{len(self.response_files)}개")

        if select_index is not None and 0 <= select_index < len(self.response_files):
            iid = str(select_index)
            self.tree.selection_set(iid)
            self.tree.focus(iid)
            self.tree.see(iid)

        self._update_drop_labels()

    def pick_output(self):
        initial = self.output_var.get() or default_output_name(self.base_var.get())
        ip = Path(initial) if initial else None

        path = filedialog.asksaveasfilename(
            title="최종 HWP 저장",
            defaultextension=".hwp",
            initialdir=str(ip.parent) if ip else None,
            initialfile=ip.name if ip else "경영전략회의_취합본.hwp",
            filetypes=[("한글 문서", "*.hwp"), ("모든 파일", "*.*")],
        )
        if path:
            self.output_var.set(path)
            self.auto_output_var.set(False)

    def open_output_folder(self):
        target = self.last_output or (
            Path(self.output_var.get()) if self.output_var.get() else None
        )
        if target:
            try:
                open_in_explorer(target)
            except Exception as e:
                messagebox.showerror(APP_TITLE, str(e))

    def _sync_output_name(self):
        if self.auto_output_var.get() and self.base_var.get():
            self.output_var.set(default_output_name(self.base_var.get()))

    def _update_drop_labels(self):
        if self.base_var.get():
            name = Path(self.base_var.get()).name
            self.base_drop.configure(
                text=f"공통 작성 원본 선택됨: {name}  (다른 파일을 끌어놓으면 교체)"
            )
        else:
            self.base_drop.configure(
                text="공통 작성 원본 HWP/HWPX를 여기에 끌어놓으세요"
            )

        if self.response_files:
            self.response_drop.configure(
                text=f"회신파일 {len(self.response_files)}개 등록됨  |  추가 파일을 계속 끌어놓을 수 있습니다"
            )
        else:
            self.response_drop.configure(
                text="회신 HWP/HWPX 여러 개를 여기에 한꺼번에 끌어놓으세요"
            )

    # ---------- engine/status ----------
    def _refresh_engine_label(self):
        if pywin32_available():
            self.engine_var.set("COM 엔진: pywin32 사용 가능")
        elif PS_ENGINE.exists():
            self.engine_var.set("COM 엔진: 동봉 PowerShell fallback (pywin32 설치 불필요)")
        else:
            self.engine_var.set("COM 엔진: 사용 불가")

        if getattr(self, "drop_support", None) and self.drop_support.enabled:
            self.drop_status_label.configure(text="Explorer 드래그앤드롭: 사용 가능")
        else:
            self.drop_status_label.configure(text="Explorer 드래그앤드롭: 파일 선택 버튼 사용")

        self._refresh_security_status()

    # ---------- validation ----------
    def validate_inputs(self) -> Tuple[Path, List[Path], Path]:
        if os.name != "nt":
            raise HwpError("이 프로그램은 Windows용입니다.")

        if not self.base_var.get():
            raise HwpError(
                "1번에 팀원들에게 공통으로 배포한 '작성 원본 HWP'를 넣어주세요."
            )

        base = Path(self.base_var.get()).resolve()
        if not is_hwp_file(base):
            raise HwpError("1번 공통 작성 원본 HWP를 찾을 수 없습니다.")

        responses = unique_paths(self.response_files)
        if not responses:
            raise HwpError("2번에 담당자 회신 HWP를 1개 이상 추가하세요.")

        base_key = os.path.normcase(str(base))
        responses = [p for p in responses if os.path.normcase(str(p)) != base_key]
        if not responses:
            raise HwpError("회신파일 목록에 공통 작성 원본만 들어 있습니다.")

        if not self.output_var.get():
            self.output_var.set(default_output_name(base))

        output = Path(self.output_var.get()).resolve()
        if output.suffix.lower() != ".hwp":
            output = output.with_suffix(".hwp")
            self.output_var.set(str(output))

        if os.path.normcase(str(output)) == base_key:
            raise HwpError("출력파일은 공통 작성 원본과 다른 파일명으로 지정하세요.")

        response_keys = {os.path.normcase(str(p)) for p in responses}
        if os.path.normcase(str(output)) in response_keys:
            raise HwpError("출력파일명이 회신파일과 같습니다. 다른 이름을 지정하세요.")

        if output.exists():
            if not messagebox.askyesno(
                APP_TITLE,
                f"출력파일이 이미 있습니다.\n덮어쓸까요?\n\n{output}",
            ):
                raise HwpError("사용자가 덮어쓰기를 취소했습니다.")

        return base, responses, output

    # ---------- run ----------
    def _append_log_main(self, line: str):
        line = line.rstrip()
        if not line:
            return

        self.log_lines.append(line)

        # Surface the current COM stage on the main window.
        if (
            line.startswith("Extract ")
            or line.startswith("Safe merge ")
            or line.startswith("Smart rewrite:")
            or "inspect:" in line
            or line.startswith("Global cleanup")
            or "spacing normalize:" in line
            or "cell payload:" in line
            or line.startswith("Rebuild cell field:")
            or "rich copy:" in line
        ):
            self.status_var.set(line)

        if self.log_text is not None and self.log_window is not None:
            try:
                if self.log_window.winfo_exists():
                    self.log_text.configure(state="normal")
                    self.log_text.insert("end", line + "\n")
                    self.log_text.see("end")
                    self.log_text.configure(state="disabled")
            except Exception:
                pass

    def log(self, msg: str):
        line = msg.rstrip()

        if threading.current_thread() is not threading.main_thread():
            self.ui_queue.put(("log", line))
            return

        self._append_log_main(line)
        self.update_idletasks()

    def _set_progress_main(self, current: int, total: int):
        try:
            self.progress.stop()
        except Exception:
            pass

        self.progress.configure(mode="determinate")

        if total <= 0:
            value = 0
        else:
            value = max(0, min(100, (current / total) * 100))

        self.progress["value"] = value

    def set_progress(self, current: int, total: int):
        if threading.current_thread() is not threading.main_thread():
            self.ui_queue.put(("progress", current, total))
            return

        self._set_progress_main(current, total)
        self.update_idletasks()

    def _drain_ui_queue(self):
        try:
            while True:
                item = self.ui_queue.get_nowait()
                kind = item[0]

                if kind == "log":
                    self._append_log_main(item[1])

                elif kind == "progress":
                    self._set_progress_main(item[1], item[2])

                elif kind == "success":
                    self._finish_success(item[1])

                elif kind == "error":
                    self._finish_error(item[1], item[2])

                elif kind == "stopped":
                    self._finish_stopped(item[1])

        except queue.Empty:
            pass
        finally:
            try:
                self.after(100, self._drain_ui_queue)
            except Exception:
                pass

    def _job_controls(self, running: bool):
        self.run_btn.configure(
            state="disabled" if running else "normal"
        )
        self.stop_btn.configure(
            state="normal" if running else "disabled"
        )

    def cancel_merge(self):
        if self.worker_thread is None or not self.worker_thread.is_alive():
            return

        self.cancel_event.set()
        self.stop_btn.configure(state="disabled")
        self.status_var.set("중지 요청 중...")
        self._append_log_main("사용자가 중지를 요청했습니다.")

    def _finish_success(self, payload: dict):
        self._job_controls(False)
        self.worker_thread = None

        try:
            self.progress.stop()
        except Exception:
            pass

        self.progress.configure(mode="determinate")
        self.progress["value"] = 100

        copied_total = payload["copied_total"]
        engine = payload["engine"]
        output = payload["output"]
        response_count = payload["response_count"]

        self.last_output = Path(output)
        self.status_var.set(f"완료 - {copied_total}개 영역 반영")
        self._append_log_main(
            f"완료: 엔진={engine}, 총 {copied_total}개 영역 반영"
        )
        self._append_log_main(
            "최종본의 줄바꿈/페이지 넘김/중첩표는 육안 검토하세요."
        )

        messagebox.showinfo(
            APP_TITLE,
            f"취합이 완료되었습니다.\n\n"
            f"회신파일: {response_count}개\n"
            f"반영영역: {copied_total}개\n"
            f"엔진: {engine}\n\n"
            f"{output}",
        )

    def _finish_error(self, message: str, trace: str):
        self._job_controls(False)
        self.worker_thread = None

        try:
            self.progress.stop()
        except Exception:
            pass

        self.progress.configure(mode="determinate")
        self.progress["value"] = 0
        self.status_var.set("오류 발생")

        self._append_log_main("오류: " + message)
        if trace:
            self._append_log_main(trace)

        messagebox.showerror(APP_TITLE, message)

    def _finish_stopped(self, message: str):
        self._job_controls(False)
        self.worker_thread = None

        try:
            self.progress.stop()
        except Exception:
            pass

        self.progress.configure(mode="determinate")
        self.progress["value"] = 0
        self.status_var.set("사용자 중지")
        self._append_log_main(message)

    def _run_merge_worker(
        self,
        base: Path,
        responses: List[Path],
        output: Path,
        keep_open: bool,
        smart_enabled: bool,
        smart_options: SmartOptions,
    ):
        try:
            engine, results = merge_hwp_files(
                base,
                responses,
                output,
                keep_open,
                self.log,
                self.set_progress,
                smart_enabled=smart_enabled,
                smart_options=smart_options,
                cancel_event=self.cancel_event,
            )

            if self.cancel_event.is_set():
                self.ui_queue.put((
                    "stopped",
                    "취합 작업을 중지했습니다.",
                ))
                return

            copied_total = sum(
                len(result.copied_fields)
                for result in results
            )

            self.ui_queue.put((
                "success",
                {
                    "copied_total": copied_total,
                    "engine": engine,
                    "output": str(output),
                    "response_count": len(responses),
                },
            ))

        except Exception as e:
            trace = traceback.format_exc()

            if self.cancel_event.is_set() or "사용자가 취합 작업을 중지" in str(e):
                self.ui_queue.put((
                    "stopped",
                    str(e),
                ))
            else:
                self.ui_queue.put((
                    "error",
                    str(e),
                    trace,
                ))

    def run_merge(self):
        if self.worker_thread is not None and self.worker_thread.is_alive():
            return

        try:
            base, responses, output = self.validate_inputs()
        except HwpError as e:
            if "사용자가" not in str(e):
                messagebox.showwarning(APP_TITLE, str(e))
            return

        # A missing security module can leave an HWP permission dialog behind
        # the app and make COM look frozen. Warn before starting.
        try:
            security_ok, _ = security_module_status()
        except Exception:
            security_ok = False

        if not security_ok:
            choice = messagebox.askyesnocancel(
                APP_TITLE,
                "한컴 Automation 보안모듈이 등록되어 있지 않습니다.\n\n"
                "이 상태에서는 HWP 파일을 열 때 접근 허용창이 다른 창 뒤에 떠서 "
                "취합이 멈춘 것처럼 보일 수 있습니다.\n\n"
                "[예] 보안모듈 설정\n"
                "[아니오] 그래도 계속\n"
                "[취소] 취합 취소",
            )

            if choice is None:
                return

            if choice is True:
                self.setup_security_module()
                return

        smart_options = SmartOptions(
            dedupe=bool(self.smart_dedupe_var.get()),
            group_topics=bool(self.smart_group_var.get()),
            normalize_dates=bool(self.smart_dates_var.get()),
            normalize_layout=bool(self.smart_layout_var.get()),
            line_spacing=int(self.smart_line_spacing_var.get()),
        )

        keep_open = bool(self.keep_open_var.get())
        smart_enabled = bool(self.smart_merge_var.get())

        self.cancel_event = threading.Event()
        self._job_controls(True)

        self.progress.configure(mode="indeterminate")
        self.progress["value"] = 0
        self.progress.start(12)

        self.status_var.set("취합 준비 중...")

        self._append_log_main("=" * 64)
        self._append_log_main(f"{APP_TITLE} 시작")
        self._append_log_main(f"공통 작성 원본: {base.name}")
        self._append_log_main(f"회신파일: {len(responses)}개")
        self._append_log_main(f"출력파일: {output.name}")
        self._append_log_main(
            "취합 방식: 보존 우선 HWP 원본 취합"
        )

        self.worker_thread = threading.Thread(
            target=self._run_merge_worker,
            args=(
                base,
                responses,
                output,
                keep_open,
                smart_enabled,
                smart_options,
            ),
            daemon=True,
            name="HwpMergeWorker",
        )
        self.worker_thread.start()

    def on_close(self):
        try:
            if self.worker_thread is not None and self.worker_thread.is_alive():
                self.cancel_event.set()
        except Exception:
            pass

        try:
            self.drop_support.close()
        except Exception:
            pass

        self.destroy()
if __name__ == "__main__":
    App().mainloop()
