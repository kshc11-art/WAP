import os
import sys
import platform
import subprocess
from typing import List, Set, Tuple, Optional

import pandas as pd
from PyQt5 import QtCore, QtGui, QtWidgets

# 지원 확장자
ALLOWED_EXTS = {".csv", ".xls", ".xlsx"}

# --------- 파일 유틸 ---------
def is_allowed(path: str) -> bool:
    return os.path.splitext(path)[1].lower() in ALLOWED_EXTS

def gather_paths(path: str) -> List[str]:
    """파일/폴더 경로에서 허용 확장자만 수집(폴더는 재귀)."""
    results = []
    if not path:
        return results
    if os.path.isdir(path):
        for root, _, files in os.walk(path):
            for f in files:
                if is_allowed(f):
                    results.append(os.path.join(root, f))
    else:
        if is_allowed(path):
            results.append(path)
    return results

def parse_plaintext_paths(s: str) -> List[str]:
    """드래그 소스가 plain text로 경로를 넘기는 경우 처리."""
    out = []
    for line in s.splitlines():
        line = line.strip().strip('"')
        if line and os.path.exists(line) and is_allowed(line):
            out.append(line)
    return out

# --------- 로딩/정규화 ---------
def read_csv_robust(path: str) -> pd.DataFrame:
    """CSV 인코딩/구분자 자동 시도."""
    for enc in ("utf-8-sig", "cp949", "euc-kr", "utf-16", "latin1"):
        try:
            return pd.read_csv(path, sep=None, engine="python", encoding=enc)
        except Exception:
            continue
    raise ValueError(f"CSV 인코딩/구분자 판별 실패: {path}")

def _dedupe_columns(df: pd.DataFrame) -> pd.DataFrame:
    """중복 열명에 .1, .2 접미사 부여."""
    seen = {}
    new_cols = []
    for c in df.columns:
        c = str(c).strip()
        if c in seen:
            seen[c] += 1
            new_cols.append(f"{c}.{seen[c]}")
        else:
            seen[c] = 0
            new_cols.append(c)
    df.columns = new_cols
    return df

def _normalize_df(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    return _dedupe_columns(df)

def _excel_engine(ext: str) -> str:
    """확장자별 엔진 선택(.xlsx=openpyxl, .xls=xlrd)."""
    return "openpyxl" if ext == ".xlsx" else "xlrd"

def read_excel_first_sheet(path: str, engine: str) -> Tuple[pd.DataFrame, str]:
    x = pd.ExcelFile(path, engine=engine)
    sheet = x.sheet_names[0]
    df = x.parse(sheet_name=sheet)
    return df, sheet

def read_excel_all_sheets(path: str, engine: str) -> List[Tuple[pd.DataFrame, str]]:
    x = pd.ExcelFile(path, engine=engine)
    out = []
    for sheet in x.sheet_names:
        df = x.parse(sheet_name=sheet)
        out.append((df, sheet))
    return out

def read_tables(path: str, merge_all_sheets: bool) -> List[Tuple[pd.DataFrame, Optional[str]]]:
    """
    파일 하나에서 (DataFrame, sheet_name) 목록을 반환.
    CSV는 sheet_name=None.
    """
    ext = os.path.splitext(path)[1].lower()
    if ext == ".csv":
        return [(read_csv_robust(path), None)]
    elif ext in (".xlsx", ".xls"):
        eng = _excel_engine(ext)
        if merge_all_sheets:
            return read_excel_all_sheets(path, eng)
        else:
            df, sheet = read_excel_first_sheet(path, eng)
            return [(df, sheet)]
    else:
        raise ValueError(f"지원하지 않는 확장자: {ext}")

# --------- 병합 로직 ---------
def merge_by_headers(paths: List[str], add_source: bool = True, merge_all_sheets: bool = False) -> pd.DataFrame:
    """
    머릿글(열 이름) 기준 병합.
    - 열 순서가 달라도 열의 합집합으로 정렬하여 세로 결합
    - add_source=True이면 source_file 열 추가
    - merge_all_sheets=True이면 Excel의 모든 시트 병합 및 source_sheet 열 추가
    """
    dfs = []
    all_cols: List[str] = []

    def extend_union(cols: List[str], acc: List[str]):
        for c in [str(x).strip() for x in cols]:
            if c not in acc:
                acc.append(c)

    for p in paths:
        for df_raw, sheet in read_tables(p, merge_all_sheets):
            if df_raw is None or df_raw.shape[1] == 0:
                continue
            df = _normalize_df(df_raw)
            if add_source:
                df["source_file"] = os.path.basename(p)
            if merge_all_sheets and sheet is not None:
                df["source_sheet"] = sheet
            extend_union(list(df.columns), all_cols)
            dfs.append(df)

    if not dfs:
        return pd.DataFrame()

    aligned = [d.reindex(columns=all_cols) for d in dfs]
    return pd.concat(aligned, ignore_index=True, sort=False)

# --------- 결과 파일 실행 ---------
def open_file(path: str):
    try:
        if platform.system() == "Windows":
            os.startfile(path)  # type: ignore[attr-defined]
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
    except Exception:
        pass

# --------- GUI 위젯 ---------
class DropListWidget(QtWidgets.QListWidget):
    """파일 목록 위젯(개별 드롭도 허용)."""
    paths_changed = QtCore.pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAcceptDrops(True)
        self.setSelectionMode(self.ExtendedSelection)
        self.setAlternatingRowColors(True)
        self.setDragDropMode(self.NoDragDrop)
        self.setDropIndicatorShown(True)
        self.setDefaultDropAction(QtCore.Qt.CopyAction)  # 기본 드롭 액션 고정

    def dragEnterEvent(self, event: QtGui.QDragEnterEvent):
        if event.mimeData().hasUrls() or event.mimeData().hasText():
            event.acceptProposedAction()
        else:
            event.ignore()

    def dragMoveEvent(self, event: QtGui.QDragMoveEvent):
        if event.mimeData().hasUrls() or event.mimeData().hasText():
            event.acceptProposedAction()
        else:
            event.ignore()

    def dropEvent(self, event: QtGui.QDropEvent):
        added = []
        md = event.mimeData()
        if md.hasUrls():
            for u in md.urls():
                p = u.toLocalFile()
                if p:
                    added.extend(gather_paths(p))
        if md.hasText():
            added.extend(parse_plaintext_paths(md.text()))
        if added:
            self.add_unique_paths(added)
            self.paths_changed.emit()
        event.setDropAction(QtCore.Qt.CopyAction)
        event.acceptProposedAction()

    def current_paths(self) -> List[str]:
        return [self.item(i).data(QtCore.Qt.UserRole) for i in range(self.count())]

    def add_unique_paths(self, new_paths: List[str]):
        existing: Set[str] = set(self.current_paths())
        for p in new_paths:
            ap = os.path.abspath(p)
            if ap in existing:
                continue
            item = QtWidgets.QListWidgetItem(os.path.basename(ap))
            item.setToolTip(ap)
            item.setData(QtCore.Qt.UserRole, ap)
            self.addItem(item)
            existing.add(ap)

    def remove_selected(self):
        for it in self.selectedItems():
            self.takeItem(self.row(it))

# --------- 메인 윈도우 ---------
class MainWindow(QtWidgets.QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("엑셀 병합 프로그램(Made by 1545)")
        self.resize(780, 560)
        self.setAcceptDrops(True)  # 창 전체 드롭 허용
        self._dragHighlight = False
        self._build_ui()

    # 전역 드롭 처리: OS가 파일을 열어버리는 문제 방지
    def eventFilter(self, obj, event):
        if isinstance(obj, QtWidgets.QWidget) and obj.window() is self:
            et = event.type()
            if et in (QtCore.QEvent.DragEnter, QtCore.QEvent.DragMove):
                md = event.mimeData()
                if md and (md.hasUrls() or md.hasText()):
                    self._dragHighlight = True
                    self.update()
                    event.setDropAction(QtCore.Qt.CopyAction)
                    event.accept()
                    return True
            elif et == QtCore.QEvent.DragLeave:
                self._dragHighlight = False
                self.update()
                event.accept()
                return True
            elif et == QtCore.QEvent.Drop:
                md = event.mimeData()
                if md:
                    self._process_drop_mime(md)
                self._dragHighlight = False
                self.update()
                event.setDropAction(QtCore.Qt.CopyAction)
                event.accept()
                return True
        return super().eventFilter(obj, event)

    def _process_drop_mime(self, md: QtCore.QMimeData):
        paths = []
        if md.hasUrls():
            for u in md.urls():
                p = u.toLocalFile()
                paths.extend(gather_paths(p))
        if md.hasText():
            paths.extend(parse_plaintext_paths(md.text()))
        if paths:
            self.listw.add_unique_paths(paths)
            self._update_count()

    def paintEvent(self, e):
        super().paintEvent(e)
        if self._dragHighlight:
            p = QtGui.QPainter(self)
            pen = QtGui.QPen(QtGui.QColor(0, 120, 215))
            pen.setWidth(3)
            pen.setStyle(QtCore.Qt.DashLine)
            p.setPen(pen)
            p.drawRect(self.rect().adjusted(2, 2, -2, -2))

    def _build_ui(self):
        lbl = QtWidgets.QLabel(
            "파일/폴더 드래그앤드롭 가능. 지원: .csv, .xls, .xlsx\n"
            "‘엑셀 모든 시트 병합’ 체크 시 각 파일의 모든 시트를 병합"
        )
        lbl.setWordWrap(True)

        self.listw = DropListWidget()
        self.listw.paths_changed.connect(self._update_count)

        # 상단 버튼들
        btn_add = QtWidgets.QPushButton("파일 추가")
        btn_add.clicked.connect(self._on_add_files)
        btn_add_dir = QtWidgets.QPushButton("폴더 추가")
        btn_add_dir.clicked.connect(self._on_add_dir)
        btn_remove = QtWidgets.QPushButton("선택 삭제")
        btn_remove.clicked.connect(self.listw.remove_selected)
        btn_clear = QtWidgets.QPushButton("전체 비우기")
        btn_clear.clicked.connect(self._on_clear)

        # 옵션
        self.chk_src = QtWidgets.QCheckBox("원본 파일명 열 추가")
        self.chk_src.setChecked(False)
        self.chk_all_sheets = QtWidgets.QCheckBox("엑셀 모든 시트 병합")
        self.chk_all_sheets.setChecked(False)  # 기본은 첫 시트만

        # 출력
        self.out_edit = QtWidgets.QLineEdit(os.path.abspath("_merged.xlsx"))
        btn_browse = QtWidgets.QPushButton("저장 위치…")
        btn_browse.clicked.connect(self._on_browse_out)

        # 실행/상태
        self.btn_merge = QtWidgets.QPushButton("병합 실행")
        self.btn_merge.clicked.connect(self._on_merge)
        self.count_lbl = QtWidgets.QLabel("파일 0개")

        # 레이아웃 구성
        top = QtWidgets.QHBoxLayout()
        top.addWidget(btn_add)
        top.addWidget(btn_add_dir)
        top.addStretch(1)
        top.addWidget(btn_remove)
        top.addWidget(btn_clear)

        opts = QtWidgets.QHBoxLayout()
        opts.addWidget(self.chk_src)
        opts.addSpacing(12)
        opts.addWidget(self.chk_all_sheets)
        opts.addStretch(1)

        out_lay = QtWidgets.QHBoxLayout()
        out_lay.addWidget(QtWidgets.QLabel("저장 파일:"))
        out_lay.addWidget(self.out_edit)
        out_lay.addWidget(btn_browse)

        main = QtWidgets.QVBoxLayout(self)
        main.addWidget(lbl)
        main.addLayout(top)
        main.addWidget(self.listw)
        main.addLayout(opts)
        main.addLayout(out_lay)

        bottom = QtWidgets.QHBoxLayout()
        bottom.addWidget(self.count_lbl)
        bottom.addStretch(1)
        bottom.addWidget(self.btn_merge)
        main.addLayout(bottom)

    def _update_count(self):
        self.count_lbl.setText(f"파일 {self.listw.count()}개")

    # 버튼 핸들러
    def _on_add_files(self):
        paths, _ = QtWidgets.QFileDialog.getOpenFileNames(
            self, "파일 선택", "", "CSV/XLS/XLSX (*.csv *.xls *.xlsx)"
        )
        if paths:
            self.listw.add_unique_paths(paths)
            self._update_count()

    def _on_add_dir(self):
        d = QtWidgets.QFileDialog.getExistingDirectory(self, "폴더 선택", "")
        if d:
            self.listw.add_unique_paths(gather_paths(d))
            self._update_count()

    def _on_clear(self):
        self.listw.clear()
        self._update_count()

    def _on_browse_out(self):
        path, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "저장 파일 선택", self.out_edit.text(), "Excel 병합 파일 (*.xlsx)"
        )
        if path:
            if not path.lower().endswith(".xlsx"):
                path += ".xlsx"
            self.out_edit.setText(path)

    # 메시지
    def _error(self, msg: str):
        QtWidgets.QMessageBox.critical(self, "오류", msg)

    def _info(self, msg: str):
        QtWidgets.QMessageBox.information(self, "안내", msg)

    # 병합 실행
    def _on_merge(self):
        paths = self.listw.current_paths()
        if not paths:
            self._error("병합할 파일을 추가해 주십시오.")
            return
        out_path = self.out_edit.text().strip() or os.path.abspath("merged.xlsx")

        try:
            self.btn_merge.setEnabled(False)
            QtWidgets.QApplication.setOverrideCursor(QtCore.Qt.WaitCursor)

            df = merge_by_headers(
                paths,
                add_source=self.chk_src.isChecked(),
                merge_all_sheets=self.chk_all_sheets.isChecked()
            )
            if df.empty:
                raise ValueError("병합할 유효한 데이터가 없습니다.")

            out_dir = os.path.dirname(out_path) or "."
            if out_dir and not os.path.exists(out_dir):
                os.makedirs(out_dir, exist_ok=True)
            df.to_excel(out_path, index=False, engine="openpyxl")

        except Exception as e:
            self._error(f"병합 실패: {e}")
            return
        finally:
            self.btn_merge.setEnabled(True)
            QtWidgets.QApplication.restoreOverrideCursor()

        self._info(f"병합 완료:\n{out_path}\n\n이제 결과 파일을 실행합니다.")
        open_file(out_path)

# --------- 엔트리 포인트 ---------
def main():
    app = QtWidgets.QApplication(sys.argv)
    w = MainWindow()
    # 전역 이벤트 필터 등록: 창/자식 위젯 어디든 드롭 수락(외부 앱 실행 차단)
    app.installEventFilter(w)
    w.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()
