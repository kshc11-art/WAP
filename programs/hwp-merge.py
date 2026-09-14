"""
파일 병합기 (File Merger) v2.1
========================================
- GUI 드래그 앤 드롭으로 파일/폴더 추가
- 폴더 드롭 시 내부 파일 자동 탐색
- 순서 변경 (위/아래 이동, 삭제)
- HWP/HWPX 병합 (한컴오피스 COM 자동화)
- PDF 병합 (PyPDF2)
- 향후 Excel 병합 기능 확장 예정

v2.1 변경사항:
  - [FIX] RegisterModule 호출을 try/except로 감싸 버전 호환성 확보
  - [FIX] Open() → HParameterSet.HFileOpenSave 기반으로 전환 (매개변수 오류 해결)
  - [FIX] InsertFile 호출부 안정화 (HAction.GetDefault 제거, 직접 속성 설정)
  - [FIX] SaveAs() → Save() + HParameterSet.HFileOpenSave 기반으로 전환
  - [ADD] 병합 엔진 내부 디버그 로깅 추가 (콘솔 출력)

v2.0 변경사항:
  - [ADD] PDF 병합 모드 추가 (PyPDF2 기반)
  - [ADD] 모드 전환 시 기존 파일 목록 자동 초기화
  - [ADD] 앱 타이틀을 "파일 병합기"로 변경

v1.2 변경사항:
  - [FIX] InsertFile → HAction.Execute("InsertFile") + HParameterSet 방식으로 변경
  - [FIX] gencache.EnsureDispatch → Dispatch 변경 (캐시 충돌 방지)
  - [FIX] RegisterModule 보안 모듈명 수정

v1.1 변경사항:
  - [FIX] pady 중복 전달 TypeError 수정
  - [ADD] 폴더 드래그 앤 드롭 / 폴더 선택 버튼 추가
  - [ADD] 폴더 내 HWP 파일 재귀 탐색 (이름순 정렬)

필수 요구사항:
  - Windows OS (HWP 병합 시)
  - 한컴오피스 한글 설치 (HWP 병합 시)
  - Python 3.8+
  - pip install pywin32 tkinterdnd2 PyPDF2
"""

import os
import sys
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from pathlib import Path

# ── 드래그 앤 드롭 지원 여부 확인 ──────────────────────────────────
try:
    from tkinterdnd2 import TkinterDnD, DND_FILES
    DND_AVAILABLE = True
except ImportError:
    DND_AVAILABLE = False

# ── win32com 지원 여부 확인 ─────────────────────────────────────────
try:
    import win32com.client
    WIN32COM_AVAILABLE = True
except ImportError:
    WIN32COM_AVAILABLE = False

# ── PyPDF2 지원 여부 확인 ──────────────────────────────────────────
try:
    from PyPDF2 import PdfMerger
    PYPDF2_AVAILABLE = True
except ImportError:
    PYPDF2_AVAILABLE = False


# ====================================================================
# 병합 엔진 (Merge Engines)
# ====================================================================

class HwpMergeEngine:
    """한컴오피스 COM 자동화를 이용한 HWP 병합 엔진 (v2.1)"""

    SUPPORTED_EXT = {".hwp", ".hwpx"}

    @staticmethod
    def is_available():
        return WIN32COM_AVAILABLE

    @staticmethod
    def merge(file_list, output_path, progress_cb=None):
        if not file_list:
            raise ValueError("병합할 파일이 없습니다.")
        if not WIN32COM_AVAILABLE:
            raise RuntimeError(
                "pywin32가 설치되어 있지 않습니다.\n"
                "터미널에서 'pip install pywin32' 를 실행하세요."
            )

        hwp = None
        try:
            # ── COM 객체 생성 (Dispatch 사용, 캐시 충돌 방지) ──
            hwp = win32com.client.Dispatch("HWPFrame.HwpObject")

            # ── 보안 모듈 등록 (버전별 호환) ──
            try:
                hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
            except Exception:
                try:
                    hwp.RegisterModule("FilePathCheckDLL", "SecurityModule")
                except Exception:
                    # 보안 모듈 등록 실패 시 무시 (일부 버전에서는 불필요)
                    print("[WARN] RegisterModule 호출 실패 — 무시하고 계속 진행")

            hwp.XHwpWindows.Item(0).Visible = False

            # ── 첫 번째 파일 열기 (HParameterSet 방식) ──
            first_path = os.path.abspath(file_list[0])
            print(f"[INFO] 첫 번째 파일 열기: {first_path}")

            hwp.HAction.GetDefault("FileOpen", hwp.HParameterSet.HFileOpenSave.HSet)
            hwp.HParameterSet.HFileOpenSave.filename = first_path
            hwp.HParameterSet.HFileOpenSave.Format = "HWP"
            hwp.HAction.Execute("FileOpen", hwp.HParameterSet.HFileOpenSave.HSet)

            if progress_cb:
                progress_cb(1, len(file_list))

            # ── 나머지 파일을 끝에 삽입 ──
            for idx, fpath in enumerate(file_list[1:], start=2):
                abs_path = os.path.abspath(fpath)
                print(f"[INFO] 파일 삽입 ({idx}/{len(file_list)}): {abs_path}")

                # 문서 끝으로 이동
                hwp.HAction.Run("MoveDocEnd")

                # 새 페이지 삽입 (병합 파일 간 페이지 분리)
                hwp.HAction.Run("BreakPage")

                # ── HParameterSet 방식으로 파일 삽입 ──
                pset = hwp.HParameterSet.HInsertFile
                hwp.HAction.GetDefault("InsertFile", pset.HSet)
                pset.filename = abs_path
                pset.KeepSection = False
                pset.KeepCharshape = True
                pset.KeepParashape = True
                pset.KeepStyle = True
                hwp.HAction.Execute("InsertFile", pset.HSet)

                if progress_cb:
                    progress_cb(idx, len(file_list))

            # ── 저장 (HParameterSet 방식) ──
            save_path = os.path.abspath(output_path)
            print(f"[INFO] 저장: {save_path}")

            hwp.HAction.GetDefault("FileSaveAs_S", hwp.HParameterSet.HFileOpenSave.HSet)
            hwp.HParameterSet.HFileOpenSave.filename = save_path
            hwp.HParameterSet.HFileOpenSave.Format = "HWP"
            hwp.HAction.Execute("FileSaveAs_S", hwp.HParameterSet.HFileOpenSave.HSet)

        except Exception as e:
            raise RuntimeError(f"HWP 병합 중 오류 발생: {e}")
        finally:
            if hwp is not None:
                try:
                    hwp.Clear(1)
                    hwp.Quit()
                except Exception:
                    pass


class PdfMergeEngine:
    """PyPDF2를 이용한 PDF 병합 엔진"""

    SUPPORTED_EXT = {".pdf"}

    @staticmethod
    def is_available():
        return PYPDF2_AVAILABLE

    @staticmethod
    def merge(file_list, output_path, progress_cb=None):
        if not file_list:
            raise ValueError("병합할 파일이 없습니다.")
        if not PYPDF2_AVAILABLE:
            raise RuntimeError(
                "PyPDF2가 설치되어 있지 않습니다.\n"
                "터미널에서 'pip install PyPDF2' 를 실행하세요."
            )

        merger = None
        try:
            merger = PdfMerger()

            for idx, fpath in enumerate(file_list, start=1):
                merger.append(os.path.abspath(fpath))
                if progress_cb:
                    progress_cb(idx, len(file_list))

            with open(os.path.abspath(output_path), "wb") as f:
                merger.write(f)

        except Exception as e:
            raise RuntimeError(f"PDF 병합 중 오류 발생: {e}")
        finally:
            if merger is not None:
                try:
                    merger.close()
                except Exception:
                    pass


# ====================================================================
# GUI 애플리케이션
# ====================================================================

class FileMergerApp:
    """파일 병합 GUI 메인 클래스"""

    APP_TITLE = "파일 병합기 v2.1"
    WINDOW_SIZE = "720x640"

    MODES = {
        "HWP 병합": {
            "engine": HwpMergeEngine,
            "filetypes": [("한글 파일", "*.hwp *.hwpx"), ("모든 파일", "*.*")],
            "default_ext": ".hwp",
        },
        "PDF 병합": {
            "engine": PdfMergeEngine,
            "filetypes": [("PDF 파일", "*.pdf"), ("모든 파일", "*.*")],
            "default_ext": ".pdf",
        },
    }

    def __init__(self):
        if DND_AVAILABLE:
            self.root = TkinterDnD.Tk()
        else:
            self.root = tk.Tk()

        self.root.title(self.APP_TITLE)
        self.root.geometry(self.WINDOW_SIZE)
        self.root.minsize(600, 500)
        self.root.configure(bg="#FAFAFA")

        self.file_list = []
        self.is_merging = False

        self._setup_styles()
        self._build_ui()

        if DND_AVAILABLE:
            self._setup_dnd()

    # ── 스타일 ─────────────────────────────────────────────────────
    def _setup_styles(self):
        style = ttk.Style()
        style.theme_use("clam")

        style.configure("Title.TLabel", font=("맑은 고딕", 14, "bold"),
                        background="#FAFAFA", foreground="#1A1A2E")
        style.configure("Sub.TLabel", font=("맑은 고딕", 9),
                        background="#FAFAFA", foreground="#555")
        style.configure("Status.TLabel", font=("맑은 고딕", 9),
                        background="#FAFAFA", foreground="#333")
        style.configure("Action.TButton", font=("맑은 고딕", 10), padding=6)
        style.configure("Small.TButton", font=("맑은 고딕", 9), padding=4)
        style.configure("Merge.TButton", font=("맑은 고딕", 11, "bold"), padding=10)

    # ── UI 빌드 ────────────────────────────────────────────────────
    def _build_ui(self):
        PX = 12

        # ── 상단: 모드 선택 ────────────────────────────────────────
        top_frame = ttk.Frame(self.root)
        top_frame.pack(fill="x", padx=PX, pady=(12, 4))

        ttk.Label(top_frame, text="파일 병합기", style="Title.TLabel").pack(side="left")

        self.mode_var = tk.StringVar(value=list(self.MODES.keys())[0])
        mode_combo = ttk.Combobox(
            top_frame, textvariable=self.mode_var,
            values=list(self.MODES.keys()), state="readonly", width=20
        )
        mode_combo.pack(side="right")
        mode_combo.bind("<<ComboboxSelected>>", self._on_mode_changed)
        ttk.Label(top_frame, text="모드:", style="Sub.TLabel").pack(side="right", padx=(0, 6))

        # ── 드래그 앤 드롭 안내 영역 ──────────────────────────────
        drop_frame = tk.Frame(self.root, bg="#E8EAF6", relief="groove", bd=1,
                              highlightbackground="#9FA8DA", highlightthickness=1)
        drop_frame.pack(fill="x", padx=PX, pady=(4, 2))

        if DND_AVAILABLE:
            drop_text = "여기에 파일 또는 폴더를 드래그 앤 드롭하세요"
        else:
            drop_text = "드래그 앤 드롭 미지원 (tkinterdnd2 미설치) — 아래 버튼으로 추가"

        self.drop_label = tk.Label(
            drop_frame, text=drop_text, bg="#E8EAF6",
            fg="#3F51B5", font=("맑은 고딕", 10), pady=18
        )
        self.drop_label.pack(fill="x")
        self.drop_frame = drop_frame

        # ── 파일/폴더 추가 버튼 ───────────────────────────────────
        btn_add_frame = ttk.Frame(self.root)
        btn_add_frame.pack(fill="x", padx=PX, pady=(2, 2))

        ttk.Button(btn_add_frame, text="파일 추가", style="Action.TButton",
                   command=self._on_add_files).pack(side="left", padx=(0, 4))
        ttk.Button(btn_add_frame, text="폴더 추가", style="Action.TButton",
                   command=self._on_add_folder).pack(side="left", padx=(0, 4))
        ttk.Button(btn_add_frame, text="전체 제거", style="Small.TButton",
                   command=self._on_clear_all).pack(side="right")

        # ── 파일 목록 (Treeview) ──────────────────────────────────
        list_frame = ttk.Frame(self.root)
        list_frame.pack(fill="both", expand=True, padx=PX, pady=(2, 2))

        columns = ("no", "filename", "path")
        self.tree = ttk.Treeview(list_frame, columns=columns, show="headings",
                                 selectmode="extended", height=12)
        self.tree.heading("no", text="#", anchor="center")
        self.tree.heading("filename", text="파일명", anchor="w")
        self.tree.heading("path", text="경로", anchor="w")
        self.tree.column("no", width=40, minwidth=40, stretch=False, anchor="center")
        self.tree.column("filename", width=200, minwidth=120)
        self.tree.column("path", width=400, minwidth=200)

        scrollbar = ttk.Scrollbar(list_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # ── 순서 조작 버튼 ────────────────────────────────────────
        order_frame = ttk.Frame(self.root)
        order_frame.pack(fill="x", padx=PX, pady=(2, 2))

        ttk.Button(order_frame, text="▲ 위로", style="Small.TButton",
                   command=self._on_move_up).pack(side="left", padx=(0, 4))
        ttk.Button(order_frame, text="▼ 아래로", style="Small.TButton",
                   command=self._on_move_down).pack(side="left", padx=(0, 4))
        ttk.Button(order_frame, text="✕ 선택 삭제", style="Small.TButton",
                   command=self._on_remove_selected).pack(side="left", padx=(0, 4))

        # ── 진행 표시줄 ──────────────────────────────────────────
        self.progress = ttk.Progressbar(self.root, mode="determinate")
        self.progress.pack(fill="x", padx=PX, pady=(4, 0))

        # ── 상태 표시 + 병합 버튼 ────────────────────────────────
        bottom_frame = ttk.Frame(self.root)
        bottom_frame.pack(fill="x", padx=PX, pady=(4, 12))

        self.status_var = tk.StringVar(value="파일을 추가하세요.")
        ttk.Label(bottom_frame, textvariable=self.status_var,
                  style="Status.TLabel").pack(side="left")

        self.merge_btn = ttk.Button(
            bottom_frame, text="병합 시작", style="Merge.TButton",
            command=self._on_merge
        )
        self.merge_btn.pack(side="right")

    # ── 드래그 앤 드롭 설정 ────────────────────────────────────────
    def _setup_dnd(self):
        self.drop_frame.drop_target_register(DND_FILES)
        self.drop_frame.dnd_bind("<<Drop>>", self._on_drop)
        self.drop_frame.dnd_bind("<<DragEnter>>", self._on_drag_enter)
        self.drop_frame.dnd_bind("<<DragLeave>>", self._on_drag_leave)

        self.tree.drop_target_register(DND_FILES)
        self.tree.dnd_bind("<<Drop>>", self._on_drop)

    def _on_drag_enter(self, event):
        self.drop_frame.configure(bg="#C5CAE9")
        self.drop_label.configure(bg="#C5CAE9")

    def _on_drag_leave(self, event):
        self.drop_frame.configure(bg="#E8EAF6")
        self.drop_label.configure(bg="#E8EAF6")

    def _on_drop(self, event):
        self.drop_frame.configure(bg="#E8EAF6")
        self.drop_label.configure(bg="#E8EAF6")

        raw = event.data
        paths = self._parse_dnd_paths(raw)
        self._add_paths(paths)

    @staticmethod
    def _parse_dnd_paths(raw):
        """드래그 앤 드롭 데이터에서 파일 경로 파싱"""
        paths = []
        i = 0
        while i < len(raw):
            if raw[i] == "{":
                j = raw.index("}", i)
                paths.append(raw[i + 1 : j])
                i = j + 2
            elif raw[i] == " ":
                i += 1
            else:
                j = raw.find(" ", i)
                if j == -1:
                    j = len(raw)
                paths.append(raw[i:j])
                i = j + 1
        return paths

    # ── 폴더에서 지원 파일 재귀 탐색 ─────────────────────────────
    def _collect_files_from_folder(self, folder_path):
        """폴더 내 지원 확장자 파일을 이름순으로 재귀 수집"""
        mode_cfg = self.MODES[self.mode_var.get()]
        engine = mode_cfg["engine"]
        collected = []

        for root_dir, dirs, files in os.walk(folder_path):
            dirs.sort()
            for fname in sorted(files):
                ext = Path(fname).suffix.lower()
                if ext in engine.SUPPORTED_EXT:
                    collected.append(os.path.join(root_dir, fname))

        return collected

    # ── 파일/폴더 통합 추가 ───────────────────────────────────────
    def _add_paths(self, paths):
        """파일과 폴더를 모두 처리하는 통합 추가 메서드"""
        all_files = []
        folder_count = 0

        for p in paths:
            p = os.path.normpath(p)
            if os.path.isdir(p):
                folder_count += 1
                all_files.extend(self._collect_files_from_folder(p))
            else:
                all_files.append(p)

        self._add_files_to_list(all_files, folder_count)

    def _add_files_to_list(self, file_paths, folder_count=0):
        """파일 경로 리스트를 검증 후 목록에 추가"""
        mode_cfg = self.MODES[self.mode_var.get()]
        engine = mode_cfg["engine"]
        added = 0
        skipped = []

        for p in file_paths:
            p = os.path.normpath(p)
            ext = Path(p).suffix.lower()

            if ext not in engine.SUPPORTED_EXT:
                skipped.append(Path(p).name)
                continue
            if p in self.file_list:
                continue

            self.file_list.append(p)
            added += 1

        self._refresh_tree()

        msg_parts = []
        if added:
            msg = f"{added}개 파일 추가됨"
            if folder_count:
                msg += f" (폴더 {folder_count}개 탐색)"
            msg_parts.append(msg + ".")
        if skipped:
            names = ", ".join(skipped[:3])
            if len(skipped) > 3:
                names += f" 외 {len(skipped) - 3}개"
            msg_parts.append(f"미지원 파일 건너뜀: {names}")
        if not added and not skipped:
            msg_parts.append("추가할 새 파일이 없습니다.")

        self.status_var.set(" ".join(msg_parts))
        self._update_status_count()

    # ── 파일 추가 (탐색기) ────────────────────────────────────────
    def _on_add_files(self):
        mode_cfg = self.MODES[self.mode_var.get()]
        paths = filedialog.askopenfilenames(
            title="파일 선택",
            filetypes=mode_cfg["filetypes"]
        )
        if paths:
            self._add_paths(list(paths))

    # ── 폴더 추가 (탐색기) ────────────────────────────────────────
    def _on_add_folder(self):
        folder = filedialog.askdirectory(title="폴더 선택")
        if folder:
            self._add_paths([folder])

    # ── 모드 변경 ─────────────────────────────────────────────────
    def _on_mode_changed(self, event=None):
        """모드 전환 시 파일 목록 초기화"""
        self.file_list.clear()
        self._refresh_tree()
        mode_name = self.mode_var.get()
        self.status_var.set(f"[{mode_name}] 파일을 추가하세요.")

    # ── 전체 제거 ─────────────────────────────────────────────────
    def _on_clear_all(self):
        self.file_list.clear()
        self._refresh_tree()
        self.status_var.set("파일을 추가하세요.")

    # ── 선택 삭제 ─────────────────────────────────────────────────
    def _on_remove_selected(self):
        selected = self.tree.selection()
        if not selected:
            return
        indices = sorted(
            [int(self.tree.item(iid)["values"][0]) - 1 for iid in selected],
            reverse=True
        )
        for idx in indices:
            if 0 <= idx < len(self.file_list):
                self.file_list.pop(idx)
        self._refresh_tree()
        self._update_status_count()

    # ── 순서 변경 ─────────────────────────────────────────────────
    def _on_move_up(self):
        selected = self.tree.selection()
        if not selected:
            return
        indices = sorted(
            int(self.tree.item(iid)["values"][0]) - 1 for iid in selected
        )
        if indices[0] == 0:
            return
        for idx in indices:
            self.file_list[idx - 1], self.file_list[idx] = (
                self.file_list[idx], self.file_list[idx - 1]
            )
        self._refresh_tree()
        for idx in indices:
            new_idx = idx - 1
            iid = self.tree.get_children()[new_idx]
            self.tree.selection_add(iid)

    def _on_move_down(self):
        selected = self.tree.selection()
        if not selected:
            return
        indices = sorted(
            (int(self.tree.item(iid)["values"][0]) - 1 for iid in selected),
            reverse=True
        )
        if indices[0] >= len(self.file_list) - 1:
            return
        for idx in indices:
            self.file_list[idx + 1], self.file_list[idx] = (
                self.file_list[idx], self.file_list[idx + 1]
            )
        self._refresh_tree()
        for idx in indices:
            new_idx = idx + 1
            iid = self.tree.get_children()[new_idx]
            self.tree.selection_add(iid)

    # ── Treeview 갱신 ─────────────────────────────────────────────
    def _refresh_tree(self):
        for item in self.tree.get_children():
            self.tree.delete(item)
        for i, fpath in enumerate(self.file_list, start=1):
            fname = Path(fpath).name
            self.tree.insert("", "end", values=(i, fname, fpath))

    def _update_status_count(self):
        n = len(self.file_list)
        if n == 0:
            self.status_var.set("파일을 추가하세요.")
        else:
            self.status_var.set(f"총 {n}개 파일 준비됨.")

    # ── 병합 실행 ─────────────────────────────────────────────────
    def _on_merge(self):
        if self.is_merging:
            return
        if len(self.file_list) < 2:
            messagebox.showwarning("알림", "병합하려면 2개 이상의 파일이 필요합니다.")
            return

        mode_cfg = self.MODES[self.mode_var.get()]
        engine = mode_cfg["engine"]

        if not engine.is_available():
            lib_name = "pywin32" if engine is HwpMergeEngine else "PyPDF2"
            messagebox.showerror(
                "오류",
                f"필요한 라이브러리가 설치되어 있지 않습니다.\n\n"
                f"pip install {lib_name}"
            )
            return

        default_ext = mode_cfg["default_ext"]
        output_path = filedialog.asksaveasfilename(
            title="병합 파일 저장",
            defaultextension=default_ext,
            filetypes=mode_cfg["filetypes"]
        )
        if not output_path:
            return

        self.is_merging = True
        self.merge_btn.configure(state="disabled")
        self.progress["value"] = 0
        self.progress["maximum"] = len(self.file_list)
        self.status_var.set("병합 진행 중...")

        thread = threading.Thread(
            target=self._merge_worker,
            args=(engine, list(self.file_list), output_path),
            daemon=True
        )
        thread.start()

    def _merge_worker(self, engine, files, output_path):
        try:
            def on_progress(current, total):
                self.root.after(0, self._update_progress, current, total)

            engine.merge(files, output_path, progress_cb=on_progress)
            self.root.after(0, self._on_merge_done, output_path, None)
        except Exception as e:
            self.root.after(0, self._on_merge_done, output_path, str(e))

    def _update_progress(self, current, total):
        self.progress["value"] = current
        self.status_var.set(f"병합 중... ({current}/{total})")

    def _on_merge_done(self, output_path, error):
        self.is_merging = False
        self.merge_btn.configure(state="normal")

        if error:
            self.progress["value"] = 0
            self.status_var.set("병합 실패.")
            messagebox.showerror("병합 오류", f"병합 중 오류가 발생했습니다:\n\n{error}")
        else:
            self.progress["value"] = self.progress["maximum"]
            self.status_var.set(f"병합 완료: {Path(output_path).name}")
            messagebox.showinfo(
                "완료",
                f"파일이 성공적으로 병합되었습니다.\n\n{output_path}"
            )

    # ── 실행 ──────────────────────────────────────────────────────
    def run(self):
        self.root.mainloop()


# ====================================================================
# 엔트리포인트
# ====================================================================

if __name__ == "__main__":
    app = FileMergerApp()
    app.run()