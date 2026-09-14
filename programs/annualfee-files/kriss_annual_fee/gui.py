from __future__ import annotations

import json
import os
import platform
import queue
import shutil
import subprocess
import tempfile
import threading
import traceback
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from tkinter.scrolledtext import ScrolledText

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD  # type: ignore
    DND_AVAILABLE = True
except Exception:
    DND_FILES = "DND_Files"
    TkinterDnD = None
    DND_AVAILABLE = False

from .bridge import BridgeServer
from .excel_backend import backend_environment
from .core import classify_current_files, mapping_file_kind
from .workflow import automation_dir_for, finalize, preflight, prepare
from .version import VERSION


CURRENT_SLOTS = [
    ("domestic_pdf", "마크프로 국내 PDF"),
    ("domestic_xlsx", "마크프로 국내 XLSX"),
    ("overseas_pdf", "마크프로 해외 PDF"),
    ("overseas_xlsx", "마크프로 해외 XLSX"),
    ("research_xlsx", "연구부서 조사 XLSX"),
    ("tech_xlsx", "기술사업화그룹 조사 XLSX"),
]

PROFILE_CHOICES = {
    "현재 양식 (권장)": "q2-current",
    "구형 1분기 양식": "q1-legacy",
}

EXCEL_BACKEND_CHOICES = {
    "자동 - Excel Native (권장)": "auto",
    "Excel Native 강제": "native",
    "Portable Legacy (개발용)": "portable-legacy",
}



def classify_current(paths: Iterable[Path]) -> Dict[str, List[Path]]:
    """GUI compatibility wrapper around the shared core discovery rule."""
    return classify_current_files(paths)

def _expand_current_drop(paths: Sequence[Path]) -> Set[Path]:
    out: Set[Path] = set()
    for p in paths:
        if p.is_dir():
            out.update(x for x in p.iterdir() if x.is_file() and x.suffix.lower() in {".xlsx", ".pdf"})
        elif p.is_file():
            out.add(p)
    return out


def _expand_history_drop(paths: Sequence[Path]) -> Set[Path]:
    out: Set[Path] = set()
    for p in paths:
        if p.is_dir():
            out.update(x for x in p.rglob("*.xlsx") if x.is_file() and mapping_file_kind(x))
        elif p.is_file() and mapping_file_kind(p):
            out.add(p)
    return out


def _expand_master_drop(paths: Sequence[Path]) -> Set[Path]:
    """Collect explicit budget-master workbooks from files/folders.

    The master lane is user-selected, so filenames do not need a special token.
    We still exclude invoice/output/survey workbooks to prevent accidental
    ingestion when a broad working folder is dropped.
    """
    out: Set[Path] = set()
    def accept(x: Path) -> bool:
        n = x.name
        return (
            x.is_file()
            and x.suffix.lower() == ".xlsx"
            and not n.startswith("~$")
            and "E0259-INV" not in n
            and "수수료" not in n
            and "_지출예산 구분" not in n
            and mapping_file_kind(x) is None
        )
    for p in paths:
        if p.is_dir():
            out.update(x for x in p.rglob("*.xlsx") if accept(x))
        elif accept(p):
            out.add(p)
    return out


def _open_path(path: Path) -> None:
    if os.name == "nt":
        os.startfile(str(path))  # type: ignore[attr-defined]
    elif sys_platform() == "darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])


def sys_platform() -> str:
    import sys
    return sys.platform


class AnnualFeeApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title(f"KRISS 연차유지료 자동화 v{VERSION}")
        # Compact by default.  The advanced/log tab keeps low-frequency controls
        # out of the main workflow so the application fits comfortably on 1080p.
        self.root.geometry("960x740")
        self.root.minsize(840, 660)

        self.current_paths: Set[Path] = set()
        self.history_paths: Set[Path] = set()
        self.budget_master_paths: Set[Path] = set()
        self.run_dir: Optional[Path] = None
        self.bridge: Optional[BridgeServer] = None
        self.bridge_thread: Optional[threading.Thread] = None
        self.worker: Optional[threading.Thread] = None
        self.uiq: "queue.Queue[Tuple[str, object]]" = queue.Queue()

        default_out = Path.home() / "Documents" / "KRISS_연차유지료_자동화"
        self.output_var = tk.StringVar(value=str(default_out))
        self.profile_display_var = tk.StringVar(value="현재 양식 (권장)")
        self.excel_backend_display_var = tk.StringVar(value="자동 - Excel Native (권장)")
        self.excel_visible_var = tk.BooleanVar(value=False)
        self.allow_missing_var = tk.BooleanVar(value=False)
        self.allow_unassigned_var = tk.BooleanVar(value=False)
        self.progress_var = tk.DoubleVar(value=0)
        self.progress_text = tk.StringVar(value="대기 중")
        self.ready_var = tk.StringVar(value="현재분기 0/6")
        self.env_var = tk.StringVar(value="환경 진단 전")

        self._configure_style()
        self._build_ui()
        self._refresh_inputs()
        self.root.after(100, self._poll_queue)

    def _configure_style(self) -> None:
        style = ttk.Style(self.root)
        themes = set(style.theme_names())
        if os.name == "nt" and "vista" in themes:
            style.theme_use("vista")
        elif "clam" in themes:
            style.theme_use("clam")

        base_font = ("Segoe UI" if os.name == "nt" else "맑은 고딕", 9)
        style.configure("TLabel", font=base_font)
        style.configure("TButton", font=base_font, padding=(9, 5))
        style.configure("TCheckbutton", font=base_font)
        style.configure("TLabelframe.Label", font=(base_font[0], 9, "bold"))
        style.configure("Title.TLabel", font=(base_font[0], 17, "bold"))
        style.configure("Subtitle.TLabel", font=(base_font[0], 9), foreground="#5f6368")
        style.configure("Ready.TLabel", font=(base_font[0], 9, "bold"), foreground="#137333")
        style.configure("Warn.TLabel", font=(base_font[0], 9, "bold"), foreground="#b06000")
        style.configure("Primary.TButton", font=(base_font[0], 10, "bold"), padding=(14, 7))
        style.configure("Compact.TButton", padding=(7, 3))
        style.configure("Treeview", rowheight=23, font=base_font)
        style.configure("Treeview.Heading", font=(base_font[0], 9, "bold"))
        style.configure("TNotebook.Tab", padding=(12, 6))

    # ---------- UI construction ----------
    def _build_ui(self) -> None:
        outer = ttk.Frame(self.root, padding=(12, 10))
        outer.pack(fill="both", expand=True)

        header = ttk.Frame(outer)
        header.pack(fill="x", pady=(0, 7))
        title_box = ttk.Frame(header)
        title_box.pack(side="left", fill="x", expand=True)
        ttk.Label(title_box, text="KRISS 연차유지료 자동화", style="Title.TLabel").pack(anchor="w")
        ttk.Label(
            title_box,
            text="자료 인식 → 사전검사 → 예산별 Excel/PDF → 포털 작업목록",
            style="Subtitle.TLabel",
        ).pack(anchor="w", pady=(1, 0))
        self.ready_badge = ttk.Label(header, textvariable=self.ready_var, style="Warn.TLabel")
        self.ready_badge.pack(side="right", anchor="n", padx=(8, 0), pady=(3, 0))

        self.notebook = ttk.Notebook(outer)
        self.notebook.pack(fill="both", expand=True)
        work_tab = ttk.Frame(self.notebook, padding=9)
        advanced_tab = ttk.Frame(self.notebook, padding=9)
        self.notebook.add(work_tab, text="작업")
        self.notebook.add(advanced_tab, text="고급 · 로그")

        # ---- Main tab: frequent workflow only ----
        current_frame = ttk.LabelFrame(work_tab, text="1. 현재 분기 자료 · 필수 6개", padding=8)
        current_frame.pack(fill="x", expand=False)

        top_line = ttk.Frame(current_frame)
        top_line.pack(fill="x", pady=(0, 5))
        self.current_drop = tk.Label(
            top_line,
            text="파일/폴더를 이 영역 또는 아래 표에 드롭",
            relief="solid", bd=1, padx=10, pady=7, bg="#f5f8fc", fg="#33536d", anchor="w",
        )
        self.current_drop.pack(side="left", fill="x", expand=True)
        self._enable_drop(self.current_drop, "current")
        ttk.Button(top_line, text="파일", style="Compact.TButton", command=self._choose_current_files).pack(side="left", padx=(6, 0))
        ttk.Button(top_line, text="폴더", style="Compact.TButton", command=self._choose_current_folder).pack(side="left", padx=4)
        ttk.Button(top_line, text="비우기", style="Compact.TButton", command=self._clear_current).pack(side="left")

        self.slot_tree = ttk.Treeview(current_frame, columns=("item", "status", "file"), show="headings", height=6)
        self.slot_tree.heading("item", text="항목")
        self.slot_tree.heading("status", text="상태")
        self.slot_tree.heading("file", text="인식 파일")
        self.slot_tree.column("item", width=170, stretch=False)
        self.slot_tree.column("status", width=70, stretch=False, anchor="center")
        self.slot_tree.column("file", width=560)
        self.slot_tree.tag_configure("ok", foreground="#137333")
        self.slot_tree.tag_configure("missing", foreground="#b3261e")
        self.slot_tree.tag_configure("duplicate", foreground="#b06000")
        self.slot_tree.pack(fill="both", expand=True)
        self._enable_drop(self.slot_tree, "current")

        optional = ttk.Frame(work_tab)
        optional.pack(fill="x", pady=(8, 0))
        optional.columnconfigure(0, weight=1)
        optional.columnconfigure(1, weight=1)
        history_frame = ttk.LabelFrame(optional, text="2. 과거 분기 조사자료 · 선택", padding=7)
        master_frame = ttk.LabelFrame(optional, text="3. 확정 예산 master · 선택", padding=7)
        history_frame.grid(row=0, column=0, sticky="nsew", padx=(0, 4))
        master_frame.grid(row=0, column=1, sticky="nsew", padx=(4, 0))

        self.history_drop = tk.Label(
            history_frame, text="이전 조사 XLSX/폴더 드롭", relief="solid", bd=1,
            padx=7, pady=5, bg="#f8f9fa", fg="#5f6368", anchor="w",
        )
        self.history_drop.pack(fill="x")
        self._enable_drop(self.history_drop, "history")
        hb = ttk.Frame(history_frame)
        hb.pack(fill="x", pady=(4, 3))
        ttk.Button(hb, text="파일", style="Compact.TButton", command=self._choose_history_files).pack(side="left")
        ttk.Button(hb, text="폴더", style="Compact.TButton", command=self._choose_history_folder).pack(side="left", padx=4)
        ttk.Button(hb, text="비우기", style="Compact.TButton", command=self._clear_history).pack(side="left")
        self.history_list = tk.Listbox(history_frame, height=1, relief="solid", bd=1, activestyle="none")
        self.history_list.pack(fill="both", expand=True)
        self._enable_drop(self.history_list, "history")

        self.master_drop = tk.Label(
            master_frame, text="확정/사후 예산 XLSX/폴더 드롭", relief="solid", bd=1,
            padx=7, pady=5, bg="#fffaf0", fg="#7a5d00", anchor="w",
        )
        self.master_drop.pack(fill="x")
        self._enable_drop(self.master_drop, "master")
        mb = ttk.Frame(master_frame)
        mb.pack(fill="x", pady=(4, 3))
        ttk.Button(mb, text="파일", style="Compact.TButton", command=self._choose_master_files).pack(side="left")
        ttk.Button(mb, text="폴더", style="Compact.TButton", command=self._choose_master_folder).pack(side="left", padx=4)
        ttk.Button(mb, text="비우기", style="Compact.TButton", command=self._clear_master).pack(side="left")
        self.master_list = tk.Listbox(master_frame, height=1, relief="solid", bd=1, activestyle="none")
        self.master_list.pack(fill="both", expand=True)
        self._enable_drop(self.master_list, "master")

        out_frame = ttk.LabelFrame(work_tab, text="4. 결과", padding=8)
        out_frame.pack(fill="x", pady=(8, 0))
        out_row = ttk.Frame(out_frame)
        out_row.pack(fill="x")
        ttk.Label(out_row, text="저장 위치").pack(side="left")
        ttk.Entry(out_row, textvariable=self.output_var).pack(side="left", fill="x", expand=True, padx=6)
        ttk.Button(out_row, text="찾아보기", style="Compact.TButton", command=self._choose_output).pack(side="left")

        action_row = ttk.Frame(out_frame)
        action_row.pack(fill="x", pady=(7, 0))
        self.check_btn = ttk.Button(action_row, text="사전 검사", command=self._start_check)
        self.check_btn.pack(side="left")
        self.generate_btn = ttk.Button(action_row, text="전체 파일 생성", style="Primary.TButton", command=self._start_generate)
        self.generate_btn.pack(side="left", padx=6)
        self.open_btn = ttk.Button(action_row, text="결과 열기", command=self._open_result, state="disabled")
        self.open_btn.pack(side="left", padx=(10, 0))
        self.bridge_btn = ttk.Button(action_row, text="포털 브리지", command=self._start_bridge, state="disabled")
        self.bridge_btn.pack(side="left", padx=5)
        self.finalize_btn = ttk.Button(action_row, text="최종 ZIP", command=self._finalize, state="disabled")
        self.finalize_btn.pack(side="left")

        prog = ttk.Frame(work_tab)
        prog.pack(fill="x", pady=(8, 0))
        ttk.Progressbar(prog, variable=self.progress_var, maximum=100).pack(side="left", fill="x", expand=True)
        ttk.Label(prog, textvariable=self.progress_text, width=30, anchor="e").pack(side="left", padx=(8, 0))

        summary = ttk.LabelFrame(work_tab, text="검사/생성 요약", padding=5)
        summary.pack(fill="both", expand=False, pady=(7, 0))
        self.summary_text = ScrolledText(summary, height=3, wrap="word", relief="flat", borderwidth=0)
        self.summary_text.pack(fill="both", expand=True)
        self.summary_text.configure(state="disabled")
        self._set_summary("먼저 현재 분기 자료 6개를 드래그하거나 선택하세요.")

        # ---- Advanced tab: rarely changed options and diagnostic log ----
        options = ttk.LabelFrame(advanced_tab, text="실행 옵션", padding=9)
        options.pack(fill="x")
        grid = ttk.Frame(options)
        grid.pack(fill="x")
        grid.columnconfigure(1, weight=1)
        grid.columnconfigure(3, weight=1)
        ttk.Label(grid, text="출력 프로필").grid(row=0, column=0, sticky="w")
        ttk.Combobox(
            grid, textvariable=self.profile_display_var, values=list(PROFILE_CHOICES),
            state="readonly", width=24,
        ).grid(row=0, column=1, sticky="w", padx=(7, 18))
        ttk.Label(grid, text="Excel 출력").grid(row=0, column=2, sticky="w")
        ttk.Combobox(
            grid, textvariable=self.excel_backend_display_var, values=list(EXCEL_BACKEND_CHOICES),
            state="readonly", width=27,
        ).grid(row=0, column=3, sticky="w", padx=(7, 0))
        ttk.Checkbutton(grid, text="Excel 창 표시 (진단용)", variable=self.excel_visible_var).grid(row=1, column=0, columnspan=2, sticky="w", pady=(7, 0))
        ttk.Checkbutton(grid, text="예산 미배정 건 제외 후 부분 생성", variable=self.allow_unassigned_var).grid(row=1, column=2, columnspan=2, sticky="w", pady=(7, 0))
        ttk.Checkbutton(grid, text="관리번호 미매핑 건 제외 후 부분 생성", variable=self.allow_missing_var).grid(row=2, column=2, columnspan=2, sticky="w", pady=(3, 0))

        envf = ttk.LabelFrame(advanced_tab, text="환경 진단", padding=8)
        envf.pack(fill="x", pady=(8, 0))
        envrow = ttk.Frame(envf)
        envrow.pack(fill="x")
        ttk.Label(envrow, textvariable=self.env_var).pack(side="left", fill="x", expand=True)
        ttk.Button(envrow, text="환경 확인", command=self._run_env_doctor).pack(side="right")
        ttk.Label(
            envf,
            text="※ Microsoft Excel의 실제 저장/재오픈은 native_excel_selftest.bat로 최종 확인합니다.",
            style="Subtitle.TLabel",
        ).pack(anchor="w", pady=(4, 0))

        logf = ttk.LabelFrame(advanced_tab, text="작업 로그", padding=6)
        logf.pack(fill="both", expand=True, pady=(8, 0))
        self.log = ScrolledText(logf, height=18, wrap="word", state="disabled")
        self.log.pack(fill="both", expand=True)

        if not DND_AVAILABLE:
            self._append_log("tkinterdnd2가 없어 드래그앤드롭은 비활성화되었습니다. 파일/폴더 선택 버튼은 정상 사용 가능합니다.")

    def _profile_value(self) -> str:
        return PROFILE_CHOICES.get(self.profile_display_var.get(), "q2-current")

    def _excel_backend_value(self) -> str:
        return EXCEL_BACKEND_CHOICES.get(self.excel_backend_display_var.get(), "auto")

    def _set_summary(self, text: str) -> None:
        if not hasattr(self, "summary_text"):
            return
        self.summary_text.configure(state="normal")
        self.summary_text.delete("1.0", "end")
        self.summary_text.insert("1.0", text)
        self.summary_text.configure(state="disabled")

    def _run_env_doctor(self) -> None:
        try:
            probe = backend_environment()
            excel = "사용 가능" if probe.get("available") else str(probe.get("reason", "사용 불가"))
            out = Path(self.output_var.get()).expanduser()
            writable = True
            write_reason = "OK"
            try:
                out.mkdir(parents=True, exist_ok=True)
                marker = out / ".kriss_write_test"
                marker.write_text("ok", encoding="ascii")
                marker.unlink(missing_ok=True)
            except Exception as exc:
                writable = False
                write_reason = str(exc)
            text = (
                f"Windows/OS: {platform.platform()} | Python {platform.python_version()} | "
                f"Drag&Drop: {'사용 가능' if DND_AVAILABLE else '비활성'} | "
                f"Excel Native: {excel} | 출력폴더: {'쓰기 가능' if writable else '쓰기 실패'}"
            )
            self.env_var.set(text)
            self._append_log("[환경 진단] " + text)
            if not writable:
                self._append_log("[환경 진단] 출력폴더 오류: " + write_reason)
        except Exception as exc:
            self.env_var.set(f"환경 진단 실패: {exc}")
            self._append_log(f"[환경 진단 실패] {exc}")

    def _enable_drop(self, widget: tk.Widget, target: str) -> None:
        if not DND_AVAILABLE:
            return
        try:
            widget.drop_target_register(DND_FILES)  # type: ignore[attr-defined]
            widget.dnd_bind("<<Drop>>", lambda e: self._on_drop(e, target))  # type: ignore[attr-defined]
        except Exception as exc:
            self._append_log(f"드래그앤드롭 초기화 실패: {exc}")

    # ---------- input collection ----------
    def _on_drop(self, event, target: str) -> None:
        try:
            raw = self.root.tk.splitlist(event.data)
            paths = [Path(x) for x in raw]
            if target == "current":
                self.current_paths.update(_expand_current_drop(paths))
            elif target == "history":
                self.history_paths.update(_expand_history_drop(paths))
            elif target == "master":
                self.budget_master_paths.update(_expand_master_drop(paths))
            self._refresh_inputs()
        except Exception as exc:
            messagebox.showerror("드롭 오류", str(exc))

    def _choose_current_files(self) -> None:
        names = filedialog.askopenfilenames(filetypes=[("Excel/PDF", "*.xlsx *.pdf"), ("모든 파일", "*.*")])
        self.current_paths.update(Path(x) for x in names)
        self._refresh_inputs()

    def _choose_current_folder(self) -> None:
        name = filedialog.askdirectory()
        if name:
            self.current_paths.update(_expand_current_drop([Path(name)]))
            self._refresh_inputs()

    def _choose_history_files(self) -> None:
        names = filedialog.askopenfilenames(filetypes=[("Excel", "*.xlsx"), ("모든 파일", "*.*")])
        self.history_paths.update(_expand_history_drop([Path(x) for x in names]))
        self._refresh_inputs()

    def _choose_history_folder(self) -> None:
        name = filedialog.askdirectory()
        if name:
            self.history_paths.update(_expand_history_drop([Path(name)]))
            self._refresh_inputs()

    def _choose_master_files(self) -> None:
        names = filedialog.askopenfilenames(filetypes=[("Excel", "*.xlsx"), ("모든 파일", "*.*")])
        self.budget_master_paths.update(_expand_master_drop([Path(x) for x in names]))
        self._refresh_inputs()

    def _choose_master_folder(self) -> None:
        name = filedialog.askdirectory()
        if name:
            self.budget_master_paths.update(_expand_master_drop([Path(name)]))
            self._refresh_inputs()

    def _choose_output(self) -> None:
        name = filedialog.askdirectory()
        if name:
            self.output_var.set(name)

    def _clear_current(self) -> None:
        self.current_paths.clear()
        self._refresh_inputs()

    def _clear_history(self) -> None:
        self.history_paths.clear()
        self._refresh_inputs()

    def _clear_master(self) -> None:
        self.budget_master_paths.clear()
        self._refresh_inputs()

    def _refresh_inputs(self) -> None:
        classified = classify_current(self.current_paths)
        self.slot_tree.delete(*self.slot_tree.get_children())
        for key, label in CURRENT_SLOTS:
            matches = sorted(classified[key], key=lambda p: p.name)
            if len(matches) == 1:
                status = "OK"
                name = matches[0].name
                tag = "ok"
            elif len(matches) == 0:
                status = "누락"
                name = "-"
                tag = "missing"
            else:
                status = f"중복 {len(matches)}"
                name = " | ".join(x.name for x in matches)
                tag = "duplicate"
            self.slot_tree.insert("", "end", values=(label, status, name), tags=(tag,))

        self.history_list.delete(0, "end")
        for p in sorted(self.history_paths, key=lambda x: x.name):
            kind = mapping_file_kind(p) or "ignored"
            label = "연구" if kind == "research" else "기술사업화" if kind == "tech" else kind
            self.history_list.insert("end", f"[{label}] {p.name}")

        self.master_list.delete(0, "end")
        for p in sorted(self.budget_master_paths, key=lambda x: x.name):
            self.master_list.insert("end", p.name)

        ok = sum(1 for v in classified.values() if len(v) == 1)
        self.ready_var.set(f"현재분기 {ok}/6")
        self.ready_badge.configure(style="Ready.TLabel" if ok == 6 else "Warn.TLabel")
        self.current_drop.config(text=f"{'6개 파일 인식 완료' if ok == 6 else '파일/폴더를 이 영역 또는 아래 표에 드롭'}")
        self.history_drop.config(text=f"과거 조사자료 {len(self.history_paths)}개 · XLSX/폴더 드롭")
        self.master_drop.config(text=f"확정 예산 master {len(self.budget_master_paths)}개 · XLSX/폴더 드롭")

    def _resolved_current(self) -> Dict[str, Path]:
        classified = classify_current(self.current_paths)
        bad = {k: v for k, v in classified.items() if len(v) != 1}
        if bad:
            labels = dict(CURRENT_SLOTS)
            msg = []
            for key, vals in bad.items():
                msg.append(f"- {labels[key]}: {len(vals)}개")
            raise RuntimeError("현재분기 6개 파일이 정확히 1개씩 필요합니다.\n" + "\n".join(msg))
        return {k: v[0] for k, v in classified.items()}

    def _stage_inputs(self) -> Tuple[Path, Optional[Path], Optional[Path], Path]:
        current = self._resolved_current()
        root = Path(tempfile.mkdtemp(prefix="kriss_annual_fee_gui_"))
        curr = root / "current"
        hist = root / "history"
        curr.mkdir(parents=True)
        for p in current.values():
            shutil.copy2(p, curr / p.name)
        if self.history_paths:
            hist.mkdir(parents=True)
            used: Set[str] = set()
            for p in sorted(self.history_paths, key=lambda x: str(x)):
                name = p.name
                if name in used:
                    stem, suffix = p.stem, p.suffix
                    i = 2
                    while f"{stem}_{i}{suffix}" in used:
                        i += 1
                    name = f"{stem}_{i}{suffix}"
                used.add(name)
                shutil.copy2(p, hist / name)
            hist_path: Optional[Path] = hist
        else:
            hist_path = None

        master = root / "budget_master"
        if self.budget_master_paths:
            master.mkdir(parents=True)
            used_master: Set[str] = set()
            for p in sorted(self.budget_master_paths, key=lambda x: str(x)):
                name = p.name
                if name in used_master:
                    stem, suffix = p.stem, p.suffix
                    i = 2
                    while f"{stem}_{i}{suffix}" in used_master:
                        i += 1
                    name = f"{stem}_{i}{suffix}"
                used_master.add(name)
                shutil.copy2(p, master / name)
            master_path: Optional[Path] = master
        else:
            master_path = None
        return curr, hist_path, master_path, root

    # ---------- background work ----------
    def _set_busy(self, busy: bool) -> None:
        state = "disabled" if busy else "normal"
        self.check_btn.config(state=state)
        self.generate_btn.config(state=state)

    def _start_check(self) -> None:
        self._start_worker("check")

    def _start_generate(self) -> None:
        self._start_worker("generate")

    def _start_worker(self, mode: str) -> None:
        if self.worker and self.worker.is_alive():
            return
        try:
            Path(self.output_var.get()).mkdir(parents=True, exist_ok=True)
            self._resolved_current()
        except Exception as exc:
            messagebox.showerror("입력 확인", str(exc))
            return
        self._set_busy(True)
        self.progress_var.set(0)
        self.progress_text.set("검사 준비")
        self._append_log(f"--- {mode} 시작 ---")
        self.worker = threading.Thread(target=self._worker, args=(mode,), daemon=True)
        self.worker.start()

    def _worker(self, mode: str) -> None:
        staging_root: Optional[Path] = None
        try:
            curr, hist, master, staging_root = self._stage_inputs()
            if mode == "check":
                self.uiq.put(("progress", ("check", 20, "관리번호/예산 매핑 검사")))
                report = preflight(curr, hist, master)
                self.uiq.put(("check_done", report))
            else:
                out = Path(self.output_var.get())
                def cb(stage: str, pct: int, detail: str):
                    self.uiq.put(("progress", (stage, pct, detail)))
                run_dir = prepare(
                    curr, out, hist,
                    allow_missing=self.allow_missing_var.get(),
                    allow_unassigned=self.allow_unassigned_var.get(),
                    budget_master=master,
                    profile=self._profile_value(),
                    excel_backend=self._excel_backend_value(),
                    excel_visible=self.excel_visible_var.get(),
                    excel_validate_reopen=True,
                    progress=cb,
                )
                self.uiq.put(("generate_done", run_dir))
        except Exception as exc:
            self.uiq.put(("error", (str(exc), traceback.format_exc())))
        finally:
            if staging_root:
                shutil.rmtree(staging_root, ignore_errors=True)
            self.uiq.put(("idle", None))

    def _poll_queue(self) -> None:
        try:
            while True:
                kind, payload = self.uiq.get_nowait()
                if kind == "progress":
                    stage, pct, detail = payload  # type: ignore[misc]
                    self.progress_var.set(pct)
                    self.progress_text.set(f"{pct}% - {detail}")
                    self._append_log(f"[{pct:3d}%] {stage}: {detail}")
                elif kind == "check_done":
                    report = payload  # type: ignore[assignment]
                    self.progress_var.set(100)
                    self.progress_text.set("사전 검사 완료")
                    self._show_preflight(report)
                elif kind == "generate_done":
                    self.run_dir = Path(payload)  # type: ignore[arg-type]
                    self.progress_var.set(100)
                    self.progress_text.set("전체 파일 생성 완료")
                    validation = json.loads((automation_dir_for(self.run_dir) / "validation.json").read_text(encoding="utf-8"))
                    self._show_validation(validation)
                    self.open_btn.config(state="normal")
                    self.bridge_btn.config(state="normal")
                    self.finalize_btn.config(state="normal")
                    self._append_log(f"결과: {self.run_dir}")
                    messagebox.showinfo("생성 완료", f"파일 생성이 완료되었습니다.\n\n{self.run_dir}")
                elif kind == "error":
                    msg, tb = payload  # type: ignore[misc]
                    self.progress_text.set("오류")
                    self._append_log(tb)
                    messagebox.showerror("작업 실패", msg)
                elif kind == "idle":
                    self._set_busy(False)
        except queue.Empty:
            pass
        self.root.after(100, self._poll_queue)

    def _show_preflight(self, r: Dict[str, object]) -> None:
        dom = r["domestic"]  # type: ignore[index]
        ov = r["overseas"]  # type: ignore[index]
        missing = r["missing"]  # type: ignore[index]
        unassigned = r["explicit_unassigned"]  # type: ignore[index]
        ready = r["ready"]
        xenv = r.get("excel_output_environment", {})  # type: ignore[assignment]
        excel_line = "확인 필요"
        if isinstance(xenv, dict):
            excel_line = "사용 가능" if xenv.get("available") else str(xenv.get("reason", "사용 불가"))
        text = (
            f"{r['year']}년 {r['quarter']}분기 | 생성 준비: {'OK' if ready else '검토 필요'}\n"
            f"국내: {dom['mapped']}/{dom['invoice_items']}건, {dom['groups']}개 예산, {dom['assigned_spend_total']:,}원\n"
            f"해외: {ov['mapped']}/{ov['invoice_items']}건, {ov['groups']}개 예산, {ov['assigned_spend_total']:,}원\n"
            f"과거분기 참조: {len(r['history_management_numbers'])}건 {r['history_management_numbers']}\n"
            f"확정 예산 master: {r.get('budget_master_count', 0)}개\n"
            f"Excel Native 환경: {excel_line}\n"
            f"명시적 미배정: {len(unassigned)}건 / 미매핑: {len(missing)}건 / 충돌: {len(r['conflicts'])}건"
        )

        def detail_lines(items, label):
            lines = []
            for d in list(items)[:8]:
                scope = d.get("scope_label") or ("국내" if d.get("scope") == "domestic" else "해외")
                reg = d.get("registration_no") or ""
                app = d.get("application_no") or ""
                title = str(d.get("title") or "").replace("\n", " ")
                if len(title) > 48:
                    title = title[:45] + "..."
                ids = "/".join(x for x in [str(reg), str(app)] if x)
                lines.append(
                    f"  - {scope} {d.get('management_no')} | 청구 {d.get('excel_row')}행 | "
                    f"{int(d.get('amount') or 0):,}원" + (f" | {ids}" if ids else "") + (f" | {title}" if title else "")
                )
            if len(items) > 8:
                lines.append(f"  - ... 외 {len(items)-8}건")
            return ("\n" + label + "\n" + "\n".join(lines)) if lines else ""

        text += detail_lines(missing, "미매핑 상세:")
        text += detail_lines(unassigned, "예산 미배정 상세:")
        self._set_summary(text)
        self._append_log(text)

    def _show_validation(self, v: Dict[str, object]) -> None:
        text = (
            f"{v['year']}년 {v['quarter']}분기 생성 완료 | 엔진: {v.get('engine')}\n"
            f"국내 {v['domestic_mapped']}/{v['domestic_items']}건, {v['domestic_budget_groups']}개 예산, "
            f"{v['domestic_assigned_spend_total']:,}원\n"
            f"해외 {v['overseas_mapped']}/{v['overseas_items']}건, {v['overseas_budget_groups']}개 예산, "
            f"{v['overseas_assigned_spend_total']:,}원\n"
            f"미배정 {v['explicit_unassigned']}건 / 미매핑 {v['missing']}건"
        )
        self._set_summary(text)

    # ---------- post-generation ----------
    def _open_result(self) -> None:
        if self.run_dir:
            _open_path(self.run_dir)

    def _start_bridge(self) -> None:
        if not self.run_dir:
            return
        if self.bridge_thread and self.bridge_thread.is_alive():
            assert self.bridge
            self._show_bridge_info(self.bridge)
            return
        try:
            self.bridge = BridgeServer(self.run_dir)
            self.bridge_thread = threading.Thread(target=self.bridge.serve, daemon=True)
            self.bridge_thread.start()
            self._show_bridge_info(self.bridge)
        except Exception as exc:
            messagebox.showerror("브리지 오류", str(exc))

    def _show_bridge_info(self, bridge: BridgeServer) -> None:
        text = f"URL: http://{bridge.host}:{bridge.port}\nToken: {bridge.token}"
        self._append_log("포털 브리지 시작\n" + text)
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(bridge.token)
        except Exception:
            pass
        messagebox.showinfo("포털 브리지", text + "\n\nToken을 클립보드에 복사했습니다.")

    def _finalize(self) -> None:
        if not self.run_dir:
            return
        try:
            z = finalize(self.run_dir)
            self._append_log(f"최종 ZIP: {z}")
            messagebox.showinfo("ZIP 생성", f"최종 ZIP을 만들었습니다.\n\n{z}")
        except Exception as exc:
            messagebox.showerror("ZIP 오류", str(exc))

    def _append_log(self, text: str) -> None:
        if not hasattr(self, "log"):
            return
        self.log.config(state="normal")
        self.log.insert("end", text.rstrip() + "\n")
        self.log.see("end")
        self.log.config(state="disabled")


def create_root() -> tk.Tk:
    if DND_AVAILABLE and TkinterDnD is not None:
        return TkinterDnD.Tk()  # type: ignore[return-value]
    return tk.Tk()


def main() -> None:
    root = create_root()
    AnnualFeeApp(root)
    root.mainloop()
