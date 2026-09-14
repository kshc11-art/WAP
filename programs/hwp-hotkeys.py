# -*- coding: utf-8 -*-

"""
hwp_runner_v3_0.py  (v3.0)  — 한/글 실무 기능 통합 실행기
================================================================
더블클릭하면 창이 뜨고, 버튼/단축키로 기능을 실행한다.
필요:  pip install pyhwpx pywin32 PyQt5 keyboard   (Python 3.9 이상)

[v2.6 → v3.0 주요 변경 — 기능 고도화 + GUI 전면 개편 (major revision)]
  · GUI 전면 개편(탭 구조): [자주 씀]/[표]/[본문]/[문서]/[진단] 탭으로 재배치.
        - 상단 헤더: 연결 상태 칩(● 연결/대상 고정, ○ 미연결) + 대상 문서
          콤보 + [문서 새로고침]을 한 줄로 통합(어느 탭에서든 항상 보임).
        - 버튼 2열 그리드 배치, 실행 로그에 시각([HH:MM:SS]) 표시,
          [지우기] 버튼, 실행 중 모래시계 커서.
  · 신규 기능(검증 상태 병기 — ★ 기존 검증 방식 재사용 / △ 실측 권장):
        [본문]  ★ 이중 공백 정리(AllReplace 반복)
                ★ 사용자 찾아-전체 치환(입력창 2개 + 실행)
                ★ 문서 끝 '  끝.' 입력(행정문서 관례, MoveDocEnd+InsertText)
                △ 줄 간격 130%/160%(HParaShape.LineSpacing* — 멤버 존재는
                   v2.5 진단으로 확인됨. LineSpacingType 상수(0=% 추정)만 실측 요망)
                △ 정렬 3종(ParagraphShapeAlignJustify/Left — Center 는 기검증)
        [표]    ★ 표 전체 글자 9pt/10pt(기존 _set_char 재사용)
                ★ 표 전체 가운데 정렬(기검증 액션)
        [문서]  ★ 문서 정보(경로·쪽수·버전 — 실패 항목은 건너뜀)
                ★ 저장(FileSave) / ★ 백업 저장(저장 후 파일 복사 — SaveAs 의
                   경로 전환 부작용을 피하려고 파일시스템 복사 사용)
                △ PDF로 저장(hwp.SaveAs(경로,"PDF") — 통용 방식, 실측 요망)
        [진단]  ★ 문단배경 진단 버튼 노출(기존 probe_para_bg)
  · 기존 검증 계층(연결/재시도/대상 고정/늦은바인딩 우회)은 변경 없이 유지.
  · 상수 조정 지점: LINE_SPACING_TYPE_PERCENT(줄간격 방식), 표 글자 크기 버튼값.

[v2.5 → v2.6 주요 변경 — 원인 확정 + HBorderFill 주입 경로 (minor revision)]
  · 실측 진단(멤버 목록)으로 원인 확정:
        - HParaShape.BorderFill 이 반환한 살아있는 개체의 멤버가 전부
          글머리표 관련(BulletChar, BulletImage, Checkable ...) = 실제로
          HBulletShape 개체를 반환. 즉 이 한/글 버전의 자동화 계층에서
          해당 속성의 매핑이 잘못되어 있음. gen_py 캐시와 무관(정리 불필요).
        - Automation 의 HSet 멤버는 SetItem 하나뿐(CreateItemSet 없음).
          v2.3 에서 '확인 불가'로 표기했던 가정이 틀렸음을 실측으로 확정.
          (CreateItemSet 은 HwpCtrl OCX 쪽 DHwpParameterSet 의 메서드)
  · 새 우회 경로 ②c — HBorderFill 헬퍼 서브셋 주입(실험적):
        HParameterSet 에서 BorderFill 계열 헬퍼(HBorderFill 등)를 찾아
        그 FillAttr 에 '면 색 없음'을 지정한 뒤, 그 헬퍼의 HSet 을
        HParaShape.HSet.SetItem("BorderFill", <세트>) 로 주입 시도.
        ※ SetItem 이 '세트 값'을 받는지는 공식 문서로 확인 불가 — 실험적.
        ※ 이 경로는 문단 '테두리'도 함께 초기화될 수 있음(이 도구의 목적상 허용).
  · 진단 확장: 실패 시 HParaShape '전체' 멤버(이전 25개 잘림 해소),
        HParameterSet 의 헬퍼 목록 전체를 함께 첨부. IDispatch 기본 멤버
        (QueryInterface 등 7종)는 출력에서 제외해 가독성 확보.

[v2.4 → v2.5 주요 변경 — 원인 판단 수정 + 자가진단·자가적응 (minor revision)]
  · 추가 실측: 세부 오류가 "<unknown>.FillAttr", "<unknown>.CreateItemSet".
        "<unknown>." 접두는 pywin32 '늦은바인딩(CDispatch)'이 실행 시점
        이름 해석(GetIDsOfNames/타입정보)에 실패했을 때의 표기다.
        → 살아 있는 개체 자체가 해당 멤버를 노출하지 않는다는 뜻이므로,
        원인 판단을 'gen_py 캐시 손상 유력'에서
        '이 한/글 버전의 HParaShape.BorderFill 경로 자체가 다르거나 막혀
        있을 가능성'으로 수정한다. (캐시 정리는 저비용 판별용으로 1회 권장 유지.
        같은 표의 셀 음영(HCellBorderFill.FillAttr)은 정상 동작한 것으로 보이는
        점도 이 판단과 부합 — 문제는 문단 배경 경로에 국한.)
  · 자가진단: 타입정보(ITypeInfo)에서 개체의 실제 멤버 이름 목록을 읽는
        _com_member_names/_com_typename 추가. 문단 배경 적용이 끝내 실패하면
        HParaShape / BorderFill 반환 개체 / HSet 의 '실제 멤버 목록'을
        오류 메시지에 첨부 → 로그만 전달하면 정확한 경로를 특정할 수 있다.
  · 자가적응: 실패 시 멤버 목록에서 Fill/CreateItemSet 계열 이름을 탐색해
        이름이 조금 달라도(대소문자·표기 차이) 자동으로 시도한다.
  · 비치명 처리: '표 서식 한번에'에서 문단 배경 제거가 실패해도 전체를
        중단하지 않고 해당 단계만 건너뛴 뒤(△ 경고 로그) 머리행 서식까지
        계속 진행한다. 단독 버튼(셀 문단 배경 제거)은 종전대로 상세 보고.

[v2.3 → v2.4 주요 변경 — gen_py 캐시 손상 전면 대응 (minor revision)]
  · 추가 실측 보고: "HSet instance ... has no attribute 'CreateItemSet'"
        → v2.3의 SetItem 폴백조차 조기바인딩 래퍼(HSet)에 멤버가 없어 실패.
        HBulletShape(FillAttr 없음)에 이어 두 번째 래퍼 클래스 이상 →
        특정 체인의 문제가 아니라 gen_py 캐시 전반이 현재 설치된 한/글의
        타입라이브러리와 어긋나 있다는 강한 신호(한/글 업데이트 후 잔존
        구버전 캐시가 유력). 표 유무와는 무관.
  · 근본 해결: [gen_py 캐시 정리 후 재시작] 버튼 추가.
        캐시 폴더 삭제 → 프로그램 자동 재시작 → 현재 타입라이브러리 기준으로
        캐시 재생성. (이미 import 된 캐시 모듈은 프로세스 재시작 없이는
        완전히 교체되지 않으므로 재시작이 필수.)
  · 세션 내 우회: 늦은바인딩 자동 전환.
        - _dyn(obj): 개체를 dynamic(CDispatch)으로 변환 — 런타임 이름 해석이라
          gen_py 매핑과 무관. (스크립트 매크로(JS)가 같은 체인을 늦은바인딩으로
          쓰는 것이 동작 근거)
        - _gp / _mcall: 속성·메서드 접근이 AttributeError 나는 '그 지점'만
          늦은바인딩으로 재시도.
        - _pset(hwp, 이름): gen_py 오류가 한 번이라도 감지되면(전역 플래그)
          이후 모든 HParameterSet.* 를 처음부터 늦은바인딩으로 가져옴 →
          표 서식 전 기능이 캐시 상태와 무관하게 동작.
  · run(): 오류 문구에 gen_py 서명이 보이면 늦은바인딩 모드로 전환 표시 +
        "다시 한 번 실행" 및 [캐시 정리 후 재시작] 안내를 로그에 출력.
        폴백 각 단계의 실패 사유를 모두 로그에 남겨 원인 추적 가능.

[v2.2 → v2.3 주요 변경 — 조기바인딩 FillAttr 매핑 오류 대응 (minor revision)]
  · 증상(실측 보고): pyhwpx 연결 상태에서 표 서식/문단배경 기능 실행 시
        "'<win32com.gen_py....HBulletShape instance ...>' object has no
         attribute 'FillAttr'"
  · 원인: pyhwpx는 내부적으로 조기바인딩(gencache/gen_py)을 사용하는데,
        gen_py가 HParaShape.BorderFill 의 반환 개체를 엉뚱한 래퍼 클래스
        (HBulletShape)로 매핑 → 그 클래스에는 FillAttr 가 없어 AttributeError.
        (타입라이브러리 형식정보 문제 또는 한/글 업데이트 후 남은 구버전
         gen_py 캐시가 원인일 수 있음. 후자는 캐시 삭제로도 해결 가능 —
         '환경 진단' 버튼에 캐시 경로 표시됨.)
  · 해결: 중첩 파라미터셋(FillAttr) 접근을 어느 바인딩에서도 동작하도록
        다단 폴백으로 교체.
        ① 속성 대입(원래 방식) →
        ② 같은 개체를 늦은바인딩(dynamic)으로 변환해 대입
           (런타임 이름 해석이라 gen_py 매핑 오류와 무관) →
        ③ ParameterSet 정석 API: HSet.CreateItemSet + SetItem
           (메서드 호출만 사용 — 바인딩 방식과 무관)
        ④ (셀 음영 한정) 단독 액션 'CellFill' 을 SetItem 으로 실행.
  · 적용 함수: _para_bg_none, probe_para_bg, _set_border(음영부),
        _set_shade_only(폴백부). 나머지 기능은 변경 없음.

[v2.1 → v2.2 주요 변경 — '대상 문서 고정' 기능 추가 (minor revision)]
  · 문제: 한/글 오토메이션의 HAction 등 HwpObject 수준 API는 항상 '활성 문서'에
        적용되며, 사용자가 마우스로 다른 한/글 창을 클릭하기만 해도 활성 문서가
        바뀐다. → 문서가 여러 개 열려 있으면 의도치 않은 문서가 수정될 수 있음.
  · 해결: GUI에 '대상 문서' 콤보박스 + [열린 문서 목록 새로고침] 버튼 추가.
        - 새로고침: ROT(실행 개체 테이블)에서 실행 중인 모든 한/글 인스턴스
          ('!HwpObject.<버전>...' 모니커)를 찾고, 각 인스턴스의 XHwpDocuments 를
          순회해 열린 문서 전체를 나열한다. (다중 창·다중 프로세스 모두 커버)
        - 목록에서 문서를 선택하면 그 문서에 '고정'되어, 이후 모든 기능은
          실행 직전에 ① 경로로 문서 재탐색 → ② SetActive_XHwpDocument() 활성화
          → ③ 활성 문서가 대상과 일치하는지 검증 → ④ 실행 순서로 동작한다.
        - '자동(현재 활성 문서)'을 선택하면 기존(v2.1) 방식 그대로 동작.
  · 알려진 제약(구조적, 회피 불가):
        - 활성화 시 해당 한/글 창이 앞으로 나오며 키보드 포커스를 가져온다.
          (SetActive_XHwpDocument 의 동작 특성 — 한컴디벨로퍼 포럼에도 보고됨)
        - 고정한 문서가 닫힌 경우 실행 시 감지하여 자동 모드로 전환하고 안내한다.
  · 문서 경로 속성명은 DOC_PATH_ATTRS = ("FullName", "Path") 상수로 분리:
        한/글 버전에 따라 속성명이 다르면(HwpAutomation.pdf 의 IXHwpDocument 참조)
        이 한 줄만 수정하면 된다.

[v2.0 → v2.1 주요 변경 — '간헐(가끔) 오류' 대응, 연결 계층 보강 (minor revision)]
  · COM 오류를 '일시적 바쁨(busy)'과 '연결 단절(lost)'로 구분해 처리.
        - busy(0x80010001 호출 거부 / 0x8001010A 나중에 재시도):
          한/글이 대화상자·작업 중일 때 발생하는 정상적 일시 거부.
          → 재연결하지 않고 잠깐 대기 후 자동 재시도. (MS COM 문서의 표준 대응)
        - v2.0의 _conn_lost는 "-2147"이 포함된 오류를 전부 '단절'로 오판하여
          바쁨 상태에서도 재연결을 수행 → 그때마다 Hwp.exe 창/프로세스가
          하나씩 늘어나는 부작용(간헐 오류의 유력 원인 ①). v2.1에서 수정.
        - "0X8001010" 문자열 검사는 com_error가 HRESULT를 10진수로 표시하므로
          실제로는 한 번도 참이 되지 않는 죽은 코드였음 → HRESULT 정수 비교로 교체.
  · 연결/초기화 각 단계에 짧은 재시도(backoff) 적용:
        방금 실행된 한/글이 초기화 중 호출을 거부하는 타이밍 문제 흡수(원인 ②).
  · gen_py 캐시 정리 경로 보정: v2.0은 %TEMP%\\gen_py 고정 삭제였으나,
        실제 캐시는 win32com.__gen_path__ 위치일 수 있음 → 두 곳 모두 삭제.
        pyhwpx 경로도 내부적으로 gencache를 쓰므로, 캐시 손상 시
        pyhwpx 단계에서도 캐시 정리 후 1회 재시도(원인 ③).
  · 실행 전 연결 생존 확인(_alive): 사용자가 한/글 창을 닫은 뒤
        첫 클릭이 실패하던 문제를 '조용한 자동 재연결'로 대체(원인 ④).
  · '환경 진단 (연결 없이)' 버튼 추가: Python 비트수, 패키지 설치,
        HWPFrame.HwpObject COM 등록, 보안모듈 레지스트리, gen_py 캐시 경로,
        실행 중 Hwp.exe 개수(좀비 탐지)를 연결 없이 표시.
  · 연결 실패 메시지에 흔한 원인 점검 항목 추가:
        좀비 Hwp.exe, 한/글·파이썬 관리자 권한 불일치, 문서 복구/업데이트 대화상자.

[v1.1 → v2.0 주요 변경 — 연결(connect) 계층 전면 재작성]
  · 백엔드 순서 명확화: ① pyhwpx → ② win32com EnsureDispatch(조기바인딩)
        → ③ win32com dynamic(늦은바인딩) 순으로 시도.
  · 창 표시(Visible=True) 강제: 최신 한/글은 자동화 실행 시 '백그라운드(숨김)'로
        뜨는 것이 기본값이라, v1.1은 연결돼도 화면에 아무것도 안 보여 "연결 안 됨"으로
        오인되었음. → _prepare()에서 창을 항상 표시.
  · 열린 문서 보장: 새로 띄운 한/글은 문서가 0개라 본문/표/북마크 기능이 실패.
        → 문서가 없으면 새 문서 1개 생성.
  · 보안모듈 자동 등록: win32com 경로에서 RegisterModule이 동작하려면
        레지스트리(HKCU\\SOFTWARE\\HNC\\HwpAutomation\\Modules)에 DLL 경로가
        '따옴표 없이' 등록되어 있어야 함. → DLL을 탐색해 자동 등록 시도.
        (pyhwpx 경로는 인스턴스화 시 보안모듈을 자동 처리하므로 별도 등록 불필요.)
  · 표 서식의 HParameterSet(중첩 속성 대입)은 늦은바인딩에서 불안정 → 조기바인딩 우선.
  · 연결 실패 시 원인을 묶어 메시지로 표시 + '연결 테스트/진단' 버튼 추가.
        실행 중 오류는 무조건 연결을 끊지 않고, COM 단절로 의심될 때만 재연결.

[기능]
  · 메모 전체 삭제 / 선택 영역 메모 추가(Ctrl+Alt+M)
  · 마크다운 기호 제거(*, #, ---) / 기호 앞 띄어쓰기 정리 / 한 줄로 입력(Ctrl+Alt+L)
  · 표 서식(전체→머리행)
  · 안건 북마크 추가(Ctrl+Alt+B) / 북마크로 목차 생성

[검증 상태]
  · 연결 계층(v2.0): 공식 자료(한컴 디벨로퍼, pyhwpx) 기반으로 작성.
        단, 작성자는 Windows+한/글 환경에서 직접 실행 검증을 하지 못했으므로
        실측 권장.
  · 메모 삭제/추가, 북마크 추가/목차: 원작성자 '실측 확인됨' 표기 유지.
  · 마크다운/띄어쓰기/한 줄로 입력, 표 서식 액션ID: '실측 권장'.
================================================================
"""
import sys
import os
import time

try:
    from PyQt5.QtWidgets import (QApplication, QWidget, QVBoxLayout,
                                  QPushButton, QLabel, QPlainTextEdit,
                                  QComboBox, QTabWidget, QGridLayout,
                                  QHBoxLayout, QLineEdit)
    from PyQt5.QtGui import QFont
    from PyQt5.QtCore import QObject, pyqtSignal, Qt
except Exception:
    print("PyQt5가 필요합니다:  pip install PyQt5"); raise


__version__ = "3.0"


# ═══════════ 보안 모듈 (win32com 직접연결 경로 전용) ═══════════
# 레지스트리 등록 위치는 반드시 HwpAutomation\Modules (HwpCtrl\Modules 아님).
# 등록값(이름)과 RegisterModule()의 2번째 인자가 '동일'해야 한다.
SECURITY_MODULE_NAME = "FilePathCheckerModule"
_REG_SUBKEY = r"SOFTWARE\HNC\HwpAutomation\Modules"


def _find_security_dll():
    """FilePathChecker* 보안모듈 DLL을 흔한 위치에서 탐색해 절대경로 반환(없으면 None)."""
    import glob
    here = os.path.dirname(os.path.abspath(globals().get("__file__", "."))) \
        if globals().get("__file__") else os.getcwd()
    cands = []
    for base in (here, os.getcwd(), os.path.expanduser("~")):
        cands += glob.glob(os.path.join(base, "FilePathChecker*.dll"))
    for root in (r"C:\Program Files (x86)\Hnc", r"C:\Program Files\Hnc"):
        if os.path.isdir(root):
            cands += glob.glob(os.path.join(root, "**", "FilePathChecker*.dll"),
                               recursive=True)
    for p in cands:
        if os.path.isfile(p):
            return os.path.abspath(p)
    return None


def _registry_dll_ok():
    """레지스트리에 등록된 보안모듈 경로가 실제 존재하면 그 경로 반환(아니면 None)."""
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _REG_SUBKEY) as k:
            val, _ = winreg.QueryValueEx(k, SECURITY_MODULE_NAME)
            val = (val or "").strip().strip('"')      # 따옴표가 끼면 등록 실패하므로 제거
            if val and os.path.isfile(val):
                return val
    except OSError:
        pass
    return None


def _register_security_module():
    """필요 시 레지스트리에 보안모듈 DLL을 등록. 등록(또는 기존)경로 / None 반환.
       핵심 규칙: 경로 좌우 따옴표 금지, 위치는 HwpAutomation\\Modules."""
    import winreg
    existing = _registry_dll_ok()
    if existing:
        return existing
    dll = _find_security_dll()
    if not dll:
        return None
    try:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, _REG_SUBKEY) as k:
            winreg.SetValueEx(k, SECURITY_MODULE_NAME, 0, winreg.REG_SZ, dll)  # 따옴표 없이
        return dll
    except OSError:
        return None


# ═══════════ 연결 & 공통 준비 ═══════════
# ── COM 오류 분류: '일시적 바쁨(busy)'과 '연결 단절(lost)'을 구분 ──
# HRESULT(부호 있는 32bit 정수) 기준.
# 근거: MS COM 문서 — 서버가 모달 대화상자 등으로 호출을 처리하지 못하면
#       SERVERCALL_RETRYLATER/REJECTED 가 반환되며, 이때 클라이언트는
#       "조용히 재시도"하는 것이 표준 대응(연결이 끊긴 것이 아님).
HR_BUSY = {
    -2147418111,   # 0x80010001 RPC_E_CALL_REJECTED       : 호출 거부(대화상자·작업 중)
    -2147417846,   # 0x8001010A RPC_E_SERVERCALL_RETRYLATER: 나중에 다시 시도
}
HR_LOST = {
    -2147023174,   # 0x800706BA RPC 서버를 사용할 수 없음   : Hwp.exe 가 종료됨
    -2147417848,   # 0x80010108 RPC_E_DISCONNECTED         : 개체가 서버와 분리됨
    -2147220995,   # 0x800401FD CO_E_OBJNOTCONNECTED       : 개체가 연결되어 있지 않음
}
# 참고(분류 밖, 연결 시점에만 주로 발생):
#   -2147024891(0x80070005 E_ACCESSDENIED)   : 관리자 권한 수준 불일치 의심
#   -2146959355(0x80080005 SERVER_EXEC_FAIL) : 서버 실행 실패(설치/보안SW 간섭 등)


def _hresult(err):
    """com_error 등에서 HRESULT(정수)를 최대한 추출. 없으면 None."""
    hr = getattr(err, "hresult", None)
    if isinstance(hr, int):
        return hr
    args = getattr(err, "args", ())
    if args and isinstance(args[0], int):
        return args[0]
    return None


def _com_busy(err):
    """서버(한/글)가 '일시적으로 바쁨' → 재시도 대상. 재연결 금지."""
    hr = _hresult(err)
    if hr in HR_BUSY:
        return True
    s = str(err)
    return ("-2147418111" in s) or ("-2147417846" in s) \
        or ("호출" in s and "거부" in s)


def _conn_lost(err):
    """COM 연결 단절로 판단되는 경우에만 True(이 경우만 재연결)."""
    hr = _hresult(err)
    if hr in HR_LOST:
        return True
    if hr in HR_BUSY:              # 바쁨은 단절이 아님 — 재연결하면 창만 늘어난다
        return False
    s = str(err); su = s.upper()
    return ("-2147023174" in s) or ("-2147417848" in s) or ("-2147220995" in s) \
        or ("RPC 서버" in s) or ("RPC SERVER" in su) \
        or ("개체" in s and ("끊" in s or "분리" in s))


def _com_retry(fn, tries=4, wait=0.7):
    """일시적(busy) COM 오류만 잠깐 쉬고 재시도. 그 외 오류는 그대로 올린다."""
    last = None
    for i in range(tries):
        try:
            return fn()
        except Exception as e:
            last = e
            if _com_busy(e) and i < tries - 1:
                time.sleep(wait)
                continue
            raise
    raise last


def _gencache_dirs():
    """win32com makepy(gen_py) 캐시 폴더 후보. 실제 경로가 %TEMP%가 아닐 수 있다."""
    import tempfile
    dirs = []
    try:
        import win32com
        p = getattr(win32com, "__gen_path__", None)    # 실제 사용 중인 캐시 경로
        if p:
            dirs.append(p)
    except Exception:
        pass
    dirs.append(os.path.join(tempfile.gettempdir(), "gen_py"))
    out, seen = [], set()
    for d in dirs:
        d = os.path.normpath(d)
        if d.lower() not in seen:
            seen.add(d.lower()); out.append(d)
    return out


def _clear_gencache():
    """gen_py 캐시 삭제(CLSIDToClassMap 등 캐시 손상 오류의 표준 처치)."""
    import shutil
    for d in _gencache_dirs():
        shutil.rmtree(d, ignore_errors=True)


def _cache_broken(err):
    """gen_py(조기바인딩 캐시) 손상 의심 여부."""
    s = str(err)
    return isinstance(err, (AttributeError, KeyError)) \
        or ("CLSIDToClassMap" in s) or ("gen_py" in s)


def _prepare(hwp):
    """어떤 백엔드든 공통: ① 창 표시 ② 열린 문서 1개 보장.
       (이미 사용자가 문서를 열어둔 경우 새 문서를 만들지 않는다.)
       방금 뜬 한/글은 초기화 중이라 호출을 일시 거부할 수 있어 재시도한다."""
    def _show():
        hwp.XHwpWindows.Item(0).Visible = True         # 백그라운드 → 화면 표시
    try:
        _com_retry(_show)
    except Exception:
        pass
    def _doc():
        if hwp.XHwpDocuments.Count == 0:
            hwp.XHwpDocuments.Add(0)                   # 0=새 문서(탭 아님)
    try:
        _com_retry(_doc)
    except Exception:
        try:
            hwp.HAction.Run("FileNew")
        except Exception:
            pass
    return hwp


def connect():
    """① pyhwpx(권장) → ② EnsureDispatch → ③ dynamic 순으로 연결 시도.
       각 단계는 '일시적' COM 오류(초기화 중 호출 거부 등)에 짧게 재시도하고,
       gen_py 캐시 손상이 의심되면 캐시를 비우고 1회 더 시도한다.
       반환: (hwp, 백엔드라벨).  전부 실패하면 원인을 담아 RuntimeError."""
    errors = []

    # ① pyhwpx — 보안모듈 자동등록 + 기존 한/글 창 자동연결
    def _try_pyhwpx():
        from pyhwpx import Hwp
        return Hwp()
    try:
        hwp = _com_retry(_try_pyhwpx, tries=3, wait=1.0)
        return _prepare(hwp), "pyhwpx"
    except ImportError:
        errors.append("pyhwpx 미설치(pip install pyhwpx, Python 3.9+)")
    except Exception as e:
        if _cache_broken(e):                 # pyhwpx도 내부적으로 gencache 사용
            _clear_gencache()
            try:
                hwp = _try_pyhwpx()
                return _prepare(hwp), "pyhwpx(캐시정리후)"
            except Exception as e2:
                errors.append(f"pyhwpx 실패(캐시정리 후에도): {e2}")
        else:
            errors.append(f"pyhwpx 연결 실패: {e}")

    # ②③ win32com — 먼저 보안모듈 등록 시도
    reg = _register_security_module()
    hwp = None

    # ② 조기바인딩(EnsureDispatch): 표 서식의 중첩 파라미터 처리가 안정적
    def _try_ensure():
        from win32com.client import gencache
        return gencache.EnsureDispatch("HWPFrame.HwpObject")
    try:
        hwp = _com_retry(_try_ensure, tries=3, wait=1.0)
    except Exception as e:
        if _cache_broken(e):
            _clear_gencache()
            try:
                hwp = _try_ensure()
            except Exception as e2:
                errors.append(f"EnsureDispatch 재시도 실패: {e2}")
        else:
            errors.append(f"EnsureDispatch 실패: {e}")

    # ③ 늦은바인딩(dynamic) 폴백
    if hwp is None:
        def _try_dyn():
            from win32com.client import dynamic
            return dynamic.Dispatch("HWPFrame.HwpObject")
        try:
            hwp = _com_retry(_try_dyn, tries=3, wait=1.0)
        except Exception as e:
            errors.append(f"dynamic.Dispatch 실패: {e}")

    if hwp is None:
        raise RuntimeError(
            "한/글 연결 실패. 점검:\n"
            "  1) 한/글(아래아한글)이 설치되어 있는지\n"
            "  2) pip install pyhwpx pywin32 (Python 3.9+)\n"
            "  3) 백그라운드에 남은 Hwp.exe(좀비)가 없는지 — 작업 관리자에서 종료\n"
            "  4) 한/글과 파이썬(터미널)의 '관리자 권한' 수준이 서로 다르지 않은지\n"
            "  5) 한/글이 문서 복구/업데이트 등 대화상자를 띄워둔 상태가 아닌지\n"
            "세부: " + " / ".join(errors)
        )

    # 보안모듈 등록(레지스트리 등록값 이름과 2번째 인자 일치)
    try:
        hwp.RegisterModule("FilePathCheckDLL", SECURITY_MODULE_NAME)
    except Exception:
        pass

    label = "win32com" + ("(+보안모듈등록)" if reg else "(보안모듈 미등록)")
    return _prepare(hwp), label


def env_diagnose():
    """연결 없이 실행 가능한 환경 점검. 간헐 오류의 흔한 원인을 눈으로 확인."""
    import platform, struct, subprocess
    lines = [f"[환경 진단 v{__version__}]"]
    lines.append(f"Python {platform.python_version()} / "
                 f"{struct.calcsize('P') * 8}bit / {platform.platform()}")
    for mod in ("pyhwpx", "win32com"):
        try:
            __import__(mod)
            lines.append(f"{mod}: 설치됨")
        except Exception as e:
            lines.append(f"{mod}: 없음({e.__class__.__name__})")
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT,
                            r"HWPFrame.HwpObject\CLSID") as k:
            clsid, _ = winreg.QueryValueEx(k, "")
        lines.append(f"HWPFrame.HwpObject COM 등록: OK ({clsid})")
    except OSError:
        lines.append("HWPFrame.HwpObject COM 등록: 없음 → 한/글 미설치 또는 등록 손상 의심")
    reg = _registry_dll_ok()
    lines.append("보안모듈 레지스트리: " +
                 (f"OK {reg}" if reg else "미등록/경로없음 (연결 시 자동등록 시도)"))
    for d in _gencache_dirs():
        lines.append(f"gen_py 캐시: {d} ({'있음' if os.path.isdir(d) else '없음'})")
    try:
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq Hwp.exe", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, errors="ignore", timeout=5)
        n = sum(1 for ln in out.stdout.splitlines()
                if ln.strip().lower().startswith('"hwp.exe"'))
        tip = "  ← 창이 안 보이는데 2개 이상이면 좀비 의심(작업 관리자에서 정리)" if n >= 2 else ""
        lines.append(f"실행 중 Hwp.exe: {n}개{tip}")
    except Exception:
        lines.append("실행 중 Hwp.exe: 확인 실패(tasklist)")
    return "\n".join(lines)


# ─────────── 대상 문서 고정 (여러 문서/여러 인스턴스) ───────────
# 원리: HwpObject 수준 API(HAction 등)는 '활성 문서'에 적용된다.
#       특정 문서만 안정적으로 조작하려면 실행 직전에 그 문서를
#       SetActive_XHwpDocument()로 활성화하고, 실제로 활성화됐는지 검증해야 한다.
# 부작용: 활성화 시 해당 한/글 창이 앞으로 나오며 포커스를 가져간다(구조적 제약).
DOC_PATH_ATTRS = ("FullName", "Path")   # 문서 전체경로 속성명 후보(버전차 대비)


def _doc_path(doc):
    """XHwpDocument 의 전체 경로를 최대한 읽어온다(없으면 빈 문자열)."""
    for a in DOC_PATH_ATTRS:
        try:
            v = getattr(doc, a)
            if v:
                return str(v)
        except Exception:
            pass
    return ""


def list_hwp_instances():
    """ROT(실행 개체 테이블)에서 실행 중인 한/글 인스턴스를 모두 찾는다.
       모니커 표시이름은 '!HwpObject.<버전>...' 형식(예: 한/글 2022 = 120).
       반환: [(표시이름, hwp객체)]  — 조기바인딩 우선, 실패 시 늦은바인딩."""
    import pythoncom
    from win32com.client import Dispatch
    try:
        pythoncom.CoInitialize()          # 이미 초기화된 스레드면 무해
    except Exception:
        pass
    out = []
    try:
        ctx = pythoncom.CreateBindCtx(0)
        rot = pythoncom.GetRunningObjectTable()
        enum = rot.EnumRunning()
    except Exception:
        return out
    while True:
        try:
            mks = enum.Next(1)
        except Exception:
            break
        if not mks:
            break
        mk = mks[0]
        try:
            name = mk.GetDisplayName(ctx, None)
        except Exception:
            continue
        if "HwpObject" not in name:
            continue
        try:
            unk = rot.GetObject(mk)
            disp = unk.QueryInterface(pythoncom.IID_IDispatch)
            try:
                from win32com.client import gencache
                hwp = gencache.EnsureDispatch(disp)
            except Exception:
                hwp = Dispatch(disp)
            out.append((name, hwp))
        except Exception:
            pass
    return out


def list_open_documents():
    """모든 인스턴스의 열린 문서를 통합 나열.
       반환: [(표시명, hwp, XHwpDocument, 전체경로)]
       같은 경로 문서는 1회만(중복 ROT 항목 대비). 제목 없는 문서는 경로가 빈 값."""
    rows, seen = [], set()
    for label, hwp in list_hwp_instances():
        try:
            cnt = int(hwp.XHwpDocuments.Count)
        except Exception:
            continue
        for i in range(cnt):
            try:
                d = hwp.XHwpDocuments.Item(i)
            except Exception:
                continue
            p = _doc_path(d)
            if p:
                key = p.lower()
                if key in seen:
                    continue
                seen.add(key)
                disp = os.path.basename(p)
            else:
                disp = f"(제목 없는 문서 {i + 1})"
            rows.append((disp, hwp, d, p))
    return rows


def activate_document(hwp, doc, path):
    """대상 문서를 활성화하고 결과를 검증한다.
       경로가 있으면 경로로 재탐색(탭 순서 변경·개체 무효화에 견고).
       실패 시 RuntimeError."""
    target = doc
    if path:
        found = None
        cnt = int(hwp.XHwpDocuments.Count)
        for i in range(cnt):
            d = hwp.XHwpDocuments.Item(i)
            if _doc_path(d).lower() == path.lower():
                found = d
                break
        if found is None:
            raise RuntimeError(f"대상 문서를 찾을 수 없습니다(닫혔나요?): {path}")
        target = found
    target.SetActive_XHwpDocument()
    if path:                              # 활성화 검증(속성 미지원 시 생략)
        try:
            act = hwp.XHwpDocuments.Active_XHwpDocument
            ap = _doc_path(act)
        except Exception:
            return target
        if ap and ap.lower() != path.lower():
            raise RuntimeError("문서 활성화 검증 실패(활성 문서가 대상과 다름)")
    return target


def run_action(hwp, action_id, **items):
    """한/글 정석: CreateAction → CreateSet → GetDefault → SetItem → Execute."""
    act = hwp.CreateAction(action_id)
    pset = act.CreateSet()
    act.GetDefault(pset)
    for k, v in items.items():
        pset.SetItem(k, v)
    return act.Execute(pset)


def get_sel_text(hwp):
    try:
        return (hwp.get_selected_text() or "").strip()
    except Exception:
        return ""


def test_connection(hwp):
    """연결/환경 진단용. 버전·열린 문서 수 등을 읽어 표시."""
    info = []
    for attr in ("Version", "EditMode"):
        try:
            info.append(f"{attr}={getattr(hwp, attr)}")
        except Exception:
            pass
    try:
        info.append(f"열린 문서 {hwp.XHwpDocuments.Count}개")
    except Exception:
        pass
    return "연결 정상 — " + (" | ".join(info) if info else "상태 확인 완료")


# ─────────── 메모 ───────────
def delete_all_memos(hwp):
    total = 0
    for _ in range(50):
        memos = []
        try:
            c = hwp.HeadCtrl
        except Exception:
            c = None
        while c is not None:
            try:
                if str(c.CtrlID) == "%%me":
                    memos.append(c)
                c = c.Next
            except Exception:
                break
        if not memos:
            break
        d = 0
        for m in memos:
            try:
                if hwp.DeleteCtrl(m):
                    d += 1
            except Exception:
                pass
        total += d
        if d == 0:
            break
    return f"메모 {total}개 삭제"


def insert_memo(hwp):
    hwp.HAction.Run("InsertFieldMemo")
    return "선택 영역에 메모 추가"


# ─────────── 본문 정리 ───────────
def clean_markdown(hwp):
    """문서 전체에서 *, #, --- 일괄 제거."""
    for t in ["*", "#", "---"]:
        run_action(hwp, "AllReplace", FindString=t, ReplaceString="",
                   ReplaceMode=1, IgnoreMessage=1)
    return "마크다운 기호(*, #, ---) 제거"


def spacing_rule(hwp):
    """기호 앞 띄어쓰기를 '정확한 칸수'로 고정 (□ 앞 1칸, ㅇ 앞 2칸).
       몇 번을 실행해도 같은 결과 — 칸이 누적되지 않는다(멱등).
       방법: 정규식이 되면 '공백0칸이상+기호'를 한 번에 정리,
             안 되면 '공백 제거 → 정확한 칸수' 2단계로 처리."""
    # (기호, 앞 칸수)  — 필요하면 여기만 수정
    marks = [("□", 1), ("ㅇ", 2), ("-", 3), ("·", 4)]

    # 1) 정규식 시도: " *□" → " □"  (앞 공백 몇 칸이든 정확히 맞춤)
    used_regex = True
    for sym, n in marks:
        try:
            ok = run_action(hwp, "AllReplace",
                            FindString=f"[  ]*{sym}",      # 공백/전각공백 0칸 이상
                            ReplaceString=(" " * n) + sym,
                            ReplaceMode=1, IgnoreMessage=1,
                            FindRegExp=1, Direction=2)
            if ok is False:
                used_regex = False
                break
        except Exception:
            used_regex = False
            break
    if used_regex:
        return "기호 앞 띄어쓰기 고정 (정규식)"

    # 2) 폴백: 공백 제거 → 정확한 칸수 (정규식 미지원 환경)
    for sym, _ in marks:                       # 앞 공백 제거(넉넉히 반복)
        for pad in ("     ", "    ", "   ", "  ", " "):
            run_action(hwp, "AllReplace", FindString=pad + sym,
                       ReplaceString=sym, ReplaceMode=1, IgnoreMessage=1)
    for sym, n in marks:                       # 정확한 칸수 부여
        run_action(hwp, "AllReplace", FindString=sym,
                   ReplaceString=(" " * n) + sym, ReplaceMode=1, IgnoreMessage=1)
    return "기호 앞 띄어쓰기 고정 (2단계)"


def one_line_input(hwp):
    """한/글 내장 '한 줄로 입력'. (선택/현재 문단을 한 줄에 맞춤)
       Action ID = ParagraphShapeSingleRow (카탈로그 확인 권장)."""
    hwp.HAction.Run("ParagraphShapeSingleRow")
    return "한 줄로 입력 적용"


# ─────────── 표 서식 (셀 선택 후 적용) ───────────
# 검증된 방식(pyhwpx 제작자 매크로 녹화 기준):
#   액션명 = "CellBorderFill"  (음영·테두리 모두 이 액션. ApplyTo=2 포함)
#   값 설정 = pset.속성 = 값  (직접 대입; CreateItemSet 아님)
#   음영   = pset.FillAttr.WinBrushFaceColor = 색
#   선종류 = hwp.HwpLineType("Solid"/"DoubleSlim"/...) 또는 정수
# 선 종류 값 — 한/글 실제 입력값은 카탈로그 '선 종류 표' 번호 + 1 로 보임.
#   (표: 0=실선,1=파선,2=점선,...,7=이중실선  →  실제값: 1=실선, 8=이중실선)
#   실선(1)은 정상 동작 확인됨. 이중실선은 8로 설정.
#   ※ 만약 8이 다른 선이면 아래 DOUBLE 값만 바꿔 테스트:
#       이중실선 후보: 8  (안 되면 7) / 얇고굵은이중선: 9
SOLID, DOUBLE, NONE = 1, 8, 0
SHADE_GRAY = 0xEFEFEF       # 15724527, 연한 회색
NO_FILL = 0xFFFFFF          # 흰색 = 음영 없음
W012 = 1


# ── 늦은바인딩 우회 계층: gen_py 캐시가 낡아 래퍼 클래스에 멤버가 없을 때 ──
PREFER_DYNAMIC_PSET = False      # gen_py 오류가 감지되면 True → 이후 전면 늦은바인딩
LAST_WARN = []                   # 기능 내부의 비치명 경고(실행 성공 후 △로 출력)


def _mark_binding_problem():
    """gen_py 매핑 오류 감지 표시 → 이후 파라미터셋을 늦은바인딩으로 취득."""
    global PREFER_DYNAMIC_PSET
    PREFER_DYNAMIC_PSET = True


def _dyn(obj):
    """개체를 늦은바인딩(CDispatch)으로 변환. 불가하면 원개체 반환.
       늦은바인딩은 이름을 실행 시점에 개체에서 직접 해석하므로
       gen_py 캐시 손상의 영향을 받지 않는다."""
    try:
        from win32com.client import dynamic
        ole = getattr(obj, "_oleobj_", None)
        if ole is not None:
            return dynamic.Dispatch(ole)
    except Exception:
        pass
    return obj


def _gp(obj, *names):
    """속성 체인 취득. AttributeError 가 난 '그 지점'만 늦은바인딩으로 재시도."""
    cur = obj
    for n in names:
        try:
            cur = getattr(cur, n)
        except AttributeError:
            cur = getattr(_dyn(cur), n)      # 실패 시 예외 그대로 전파
    return cur


def _mcall(obj, name, *args):
    """메서드 호출. 래퍼에 메서드가 없으면 늦은바인딩으로 재시도."""
    try:
        m = getattr(obj, name)
    except AttributeError:
        m = getattr(_dyn(obj), name)
    return m(*args)


def _setp(obj, name, val):
    """속성 대입. 래퍼에 속성이 없으면 늦은바인딩으로 재시도."""
    try:
        setattr(obj, name, val)
    except AttributeError:
        setattr(_dyn(obj), name, val)


def _pset(hwp, name):
    """HParameterSet.<name> 취득. gen_py 오류가 한 번이라도 감지된 뒤에는
       처음부터 늦은바인딩으로 가져와 이후 모든 접근을 안전하게 만든다."""
    p = _gp(hwp, "HParameterSet", name)
    return _dyn(p) if PREFER_DYNAMIC_PSET else p


def _com_typename(obj):
    """개체의 타입정보상 형식 이름(예: HParaShape). 실패 시 '?'."""
    try:
        ole = getattr(obj, "_oleobj_", None) or obj
        ti = ole.GetTypeInfo()
        return ti.GetDocumentation(-1)[0]
    except Exception:
        return "?"


def _com_member_names(obj, limit=120):
    """개체 타입정보(ITypeInfo)에서 실제 멤버 이름 목록을 읽는다.
       조기/늦은바인딩과 무관하게 '개체가 진짜 가진 이름'을 보여 준다."""
    names = []
    try:
        ole = getattr(obj, "_oleobj_", None) or obj
        ti = ole.GetTypeInfo()
        ta = ti.GetTypeAttr()
        for i in range(ta.cFuncs):
            try:
                nm = ti.GetNames(ti.GetFuncDesc(i).memid)[0]
                if nm not in names:
                    names.append(nm)
            except Exception:
                pass
        for i in range(ta.cVars):
            try:
                nm = ti.GetNames(ti.GetVarDesc(i).memid)[0]
                if nm not in names:
                    names.append(nm)
            except Exception:
                pass
    except Exception:
        pass
    return names[:limit]


def _find_member(obj, *keywords):
    """멤버 이름 중 키워드를 모두 포함(대소문자 무시)하는 첫 이름. 없으면 None."""
    for nm in _com_member_names(obj):
        low = nm.lower()
        if all(k.lower() in low for k in keywords):
            return nm
    return None


_COM_PLUMBING = {"QueryInterface", "AddRef", "Release", "GetTypeInfoCount",
                 "GetTypeInfo", "GetIDsOfNames", "Invoke"}


def _members_clean(obj, limit=120):
    """IDispatch 기본 멤버를 제외한 실제 멤버 이름 목록(진단 출력용)."""
    return [n for n in _com_member_names(obj, limit) if n not in _COM_PLUMBING]


def _fill_attr_set(pset, items):
    """pset(FillAttr 서브셋 보유: HCellBorderFill 등)에 채우기 항목을 적용.
       속성 접근·대입 모두 지점별 늦은바인딩 우회를 거친다."""
    fa = _gp(pset, "FillAttr")
    for k, v in items.items():
        _setp(fa, k, v)


def _goto_table_a1(hwp):
    """표 안 아무 셀에서 호출 → 표의 첫 셀(A1)로 확실히 이동.
       위로/왼쪽으로 끝까지 반복 이동 (더 못 가면 멈춤)."""
    for _ in range(100):
        if not hwp.HAction.Run("TableUpperCell"):   # 더 위 셀 없으면 멈춤
            break
    for _ in range(100):
        if not hwp.HAction.Run("TableLeftCell"):    # 더 왼쪽 셀 없으면 멈춤
            break


def _select_whole_table(hwp):
    """표 전체를 셀 블록 선택 (A1에서 블록 시작 → 오른쪽·아래 끝까지)."""
    _goto_table_a1(hwp)
    hwp.HAction.Run("TableCellBlock")        # F5 (블록 시작)
    hwp.HAction.Run("TableCellBlockExtend")  # 확장 모드
    hwp.HAction.Run("TableColPageDown")      # 맨 아래 행까지
    hwp.HAction.Run("TableColEnd")           # 그 행의 끝 열까지 → 표 전체


def probe_para_bg(hwp):
    """문단 배경(FillAttr) 실제 값 또는, 접근 불가 시 관련 개체들의
       '전체 멤버 목록'을 보여 준다(진단용 — 로그를 그대로 전달하면 됨)."""
    pset = _pset(hwp, "HParaShape")
    hwp.HAction.GetDefault("ParagraphShape", pset.HSet)
    names = ("type", "Type", "WindowsBrush", "WinBrushFaceColor",
             "WinBrushHatchColor", "WinBrushFaceStyle")
    out = []
    try:
        fa = _gp(pset, "BorderFill", "FillAttr")
        for n in names:
            try:
                out.append(f"{n}={getattr(fa, n)}")
            except Exception:
                pass
    except Exception:
        out.append(f"HParaShape[{_com_typename(pset)}] 전체 멤버: "
                   + ", ".join(_members_clean(pset)))
        try:
            bfo = _gp(pset, "BorderFill")
            out.append(f"BorderFill 반환개체[{_com_typename(bfo)}] 멤버: "
                       + ", ".join(_members_clean(bfo, 40)))
        except Exception as e2:
            out.append(f"BorderFill 접근 불가: {e2}")
        try:
            hps = _gp(hwp, "HParameterSet")
            out.append(f"HParameterSet 헬퍼 목록: "
                       + ", ".join(_members_clean(hps)))
        except Exception as e3:
            out.append(f"HParameterSet 조회 불가: {e3}")
    hwp.HAction.Run("Cancel")
    return "문단배경 진단 → " + " | ".join(out)


def _para_bg_none(hwp):
    """현재 선택된 블록의 문단 배경을 '면 색 없음'으로 (선택은 호출자가 함).
       없음 = WinBrushFaceColor=0xFFFFFFFF.
       ① 속성 경로 → ①b 멤버 자동탐색 → ② SetItem(CreateItemSet)
       → ②b 유사명 → ②c HBorderFill 헬퍼 서브셋 주입(실험적).
       전부 실패하면 '전체' 멤버 목록을 첨부해 예외로 올린다."""
    pset = _pset(hwp, "HParaShape")
    hwp.HAction.GetDefault("ParagraphShape", pset.HSet)
    errs = []
    # ① 속성 경로
    try:
        fa = _gp(pset, "BorderFill", "FillAttr")
        _setp(fa, "WinBrushFaceColor", 0xFFFFFFFF)
        hwp.HAction.Execute("ParagraphShape", pset.HSet)
        return
    except Exception as e:
        errs.append(f"속성경로: {e}")
    # ①b BorderFill 반환개체 멤버 자동탐색
    try:
        bfo = _gp(pset, "BorderFill")
        nm = _find_member(bfo, "fillattr") or _find_member(bfo, "fill")
        if not nm:
            raise AttributeError(f"[{_com_typename(bfo)}] Fill 계열 멤버 없음")
        fa = getattr(_dyn(bfo), nm)
        _setp(fa, "WinBrushFaceColor", 0xFFFFFFFF)
        hwp.HAction.Execute("ParagraphShape", pset.HSet)
        return
    except Exception as e:
        errs.append(f"멤버탐색: {e}")
    # ② SetItem 정석 경로 (Automation HSet 에는 없을 수 있음 — 실측상 SetItem 뿐)
    hset = None
    try:
        hset = _gp(pset, "HSet")
        bf = _mcall(hset, "CreateItemSet", "BorderFill", "BorderFill")
        fa = _mcall(bf, "CreateItemSet", "FillAttr", "DrawFillAttr")
        _mcall(fa, "SetItem", "WinBrushFaceColor", 0xFFFFFFFF)
        hwp.HAction.Execute("ParagraphShape", pset.HSet)
        return
    except Exception as e:
        errs.append(f"SetItem경로: {e}")
    # ②b 유사명 탐색
    try:
        if hset is None:
            hset = _gp(pset, "HSet")
        nm = _find_member(hset, "createitemset") or _find_member(hset, "itemset")
        if not nm:
            raise AttributeError(f"[{_com_typename(hset)}] ItemSet 계열 멤버 없음")
        bf = getattr(_dyn(hset), nm)("BorderFill", "BorderFill")
        fa = getattr(_dyn(bf), nm)("FillAttr", "DrawFillAttr")
        _mcall(fa, "SetItem", "WinBrushFaceColor", 0xFFFFFFFF)
        hwp.HAction.Execute("ParagraphShape", pset.HSet)
        return
    except Exception as e:
        errs.append(f"유사명탐색: {e}")
    # ②c HBorderFill 헬퍼 서브셋 주입(실험적): 헬퍼에서 채우기 구성 후
    #     HParaShape.HSet.SetItem("BorderFill", <헬퍼.HSet>) 으로 통째 주입.
    #     ※ 문단 '테두리'가 함께 초기화될 수 있음(목적상 허용).
    try:
        hps = _gp(hwp, "HParameterSet")
        try:
            bfh = getattr(hps, "HBorderFill")
        except AttributeError:
            nm = _find_member(hps, "borderfill")
            if not nm:
                raise AttributeError(
                    "HParameterSet 에 BorderFill 계열 헬퍼 없음. 헬퍼 목록: "
                    + ", ".join(_members_clean(hps)))
            bfh = getattr(_dyn(hps), nm)
        try:
            fa = _gp(bfh, "FillAttr")
        except Exception:
            nm2 = _find_member(bfh, "fillattr") or _find_member(bfh, "fill")
            if not nm2:
                raise AttributeError(
                    f"헬퍼[{_com_typename(bfh)}] Fill 계열 멤버 없음: "
                    + ", ".join(_members_clean(bfh, 40)))
            fa = getattr(_dyn(bfh), nm2)
        _setp(fa, "WinBrushFaceColor", 0xFFFFFFFF)
        sub = _gp(bfh, "HSet")
        if hset is None:
            hset = _gp(pset, "HSet")
        _mcall(hset, "SetItem", "BorderFill", sub)
        hwp.HAction.Execute("ParagraphShape", pset.HSet)
        return
    except Exception as e:
        errs.append(f"HBorderFill주입: {e}")
    # 전부 실패 → 전체 멤버 목록 첨부
    diag = []
    try:
        diag.append(f"HParaShape[{_com_typename(pset)}] 전체: "
                    + ", ".join(_members_clean(pset)))
    except Exception:
        pass
    try:
        hps = _gp(hwp, "HParameterSet")
        diag.append("HParameterSet 헬퍼: " + ", ".join(_members_clean(hps)))
    except Exception:
        pass
    raise RuntimeError("문단 배경 적용 실패. 세부: " + " / ".join(errs)
                       + ("  [진단] " + " ; ".join(diag) if diag else ""))


def clear_table_para_bg(hwp):
    """표 전체 선택 후 문단 배경을 '면 색 없음'으로 (단독 버튼용)."""
    _select_whole_table(hwp)
    _para_bg_none(hwp)
    hwp.HAction.Run("Cancel")
    return "문단 배경 면 색 없음 (표 전체)"


def _select_first_row(hwp):
    """첫 행 전체를 셀 블록 선택.
       A1에서 블록 시작 → '줄 단위 블록'으로 그 행만 선택."""
    _goto_table_a1(hwp)
    hwp.HAction.Run("TableCellBlock")        # F5 (블록 시작)
    hwp.HAction.Run("TableCellBlockRow")     # 줄(행) 단위 블록 → 첫 행 전체


def _set_char(hwp, *, bold=None, height_pt=None, color=None, face=None):
    """선택 영역 글자 모양 (지정한 것만 변경)."""
    pset = _pset(hwp, "HCharShape")
    hwp.HAction.GetDefault("CharShape", pset.HSet)
    if bold is not None:
        _setp(pset, "Bold", 1 if bold else 0)
    if height_pt is not None:
        _setp(pset, "Height", int(height_pt * 100))   # pt → HWPUNIT
    if color is not None:
        _setp(pset, "TextColor", color)
    if face:
        for attr in ("FaceNameHangul", "FaceNameLatin", "FaceNameHanja",
                     "FaceNameJapanese", "FaceNameOther", "FaceNameSymbol"):
            _setp(pset, attr, face)
    hwp.HAction.Execute("CharShape", pset.HSet)


def _set_border(hwp, *, top, bottom, left, right,
                horz=None, vert=None, width=W012, shade=None):
    """선택 셀 테두리(+가운데선 horz/vert, +음영 shade).
       음영 되던 방식 그대로: 액션 'CellBorderFill' + 속성 직접 대입."""
    pset = _pset(hwp, "HCellBorderFill")
    hwp.HAction.GetDefault("CellBorderFill", pset.HSet)
    _setp(pset, "BorderTypeTop", top)
    _setp(pset, "BorderTypeBottom", bottom)
    _setp(pset, "BorderTypeLeft", left)
    _setp(pset, "BorderTypeRight", right)
    for side, t in (("Top", top), ("Bottom", bottom), ("Left", left), ("Right", right)):
        if t:
            _setp(pset, f"BorderWidth{side}", width)
    if horz is not None:                 # 가로 가운데선
        _setp(pset, "TypeHorz", horz)
        if horz:
            _setp(pset, "WidthHorz", width)
    if vert is not None:                 # 세로 가운데선
        _setp(pset, "TypeVert", vert)
        if vert:
            _setp(pset, "WidthVert", width)
    if shade is not None:                # 음영(속성대입 → 늦은바인딩 폴백)
        _fill_attr_set(pset, {"WinBrushFaceColor": shade,
                              "WinBrushHatchColor": shade,
                              "WindowsBrush": 1})
    hwp.HAction.Execute("CellBorderFill", pset.HSet)
    hwp.HAction.Run("Cancel")


def table_body_style(hwp):
    """본문: 위·아래 실선, 좌·우 없음, 가운데 가로·세로 단선, 음영 제거.
       표 안 아무 셀에 커서만 두면 표 전체에 적용된다."""
    _select_whole_table(hwp)
    _set_border(hwp, top=SOLID, bottom=SOLID, left=NONE, right=NONE,
                horz=SOLID, vert=SOLID, shade=NO_FILL)
    return "본문(표 전체): 위아래선·좌우없음·가운데 단선·음영제거"


def _border_bottom_double(hwp):
    """선택 블록의 '아래 테두리'를 이중실선으로 토글.
       매크로 방식: 선 종류를 이중선으로 지정 → TableCellBorderBottom 토글.
       (블록이 살아있는 상태에서 호출할 것)"""
    # 1) 아래 테두리 선 종류를 이중실선으로 미리 지정 (값 후보: 8)
    pset = _pset(hwp, "HCellBorderFill")
    hwp.HAction.GetDefault("CellBorderFill", pset.HSet)
    _setp(pset, "BorderTypeBottom", DOUBLE)  # 이중실선 후보값
    _setp(pset, "BorderWidthBottom", W012)
    hwp.HAction.Execute("CellBorderFill", pset.HSet)
    # 2) 아래 테두리 토글 (현재 지정된 선 종류로 그어짐)
    hwp.HAction.Run("TableCellBorderBottom")


def _set_shade_only(hwp, color):
    """선택 블록에 음영만 적용. pyhwpx 전용 메서드 우선, 실패 시 폴백.
       color = BGR 정수(0xEFEFEF). RGB 튜플도 함께 시도."""
    # 0xEFEFEF → 회색. RGB 각 채널 추출 (회색이라 순서 무관하지만 일반화)
    b = (color >> 16) & 0xFF
    g = (color >> 8) & 0xFF
    r = color & 0xFF

    # (1) pyhwpx 전용 메서드 cell_fill — 가장 확실. 인자 형식을 순서대로 시도.
    fill = getattr(hwp, "cell_fill", None)
    if callable(fill):
        for args in ((r, g, b), ((r, g, b),), (color,)):
            try:
                fill(*args)
                return
            except Exception:
                continue

    # (2) set_font 의 ShadeColor (글자 음영) — 폴백
    setfont = getattr(hwp, "set_font", None)
    if callable(setfont):
        try:
            setfont(ShadeColor=color)
            return
        except Exception:
            pass

    # (3) 폴백: CellBorderFill 의 FillAttr (속성대입 → 늦은바인딩)
    try:
        pset = _pset(hwp, "HCellBorderFill")
        hwp.HAction.GetDefault("CellBorderFill", pset.HSet)
        _fill_attr_set(pset, {"type": 1,               # 1 = 단색 채우기
                              "WinBrushFaceColor": color,
                              "WinBrushHatchColor": color,
                              "WinBrushFaceStyle": 0,  # 0 = 단색
                              "WindowsBrush": 1})
        hwp.HAction.Execute("CellBorderFill", pset.HSet)
        return
    except Exception:
        pass
    # (4) 최후: 단독 액션 'CellFill' — SetItem 만 사용(바인딩 방식 무관)
    run_action(hwp, "CellFill", Type=1,
               WinBrushFaceColor=color, WinBrushHatchColor=color,
               WinBrushHatchStyle=-1)   # -1 = 무늬 없음


def _apply_header_format(hwp):
    """선택된 첫 행 블록에 머리행 서식 적용 (선택은 호출자가 함).
       각 단계를 단독 Execute로 분리 (서로 덮어쓰기 방지)."""
    _set_char(hwp, bold=True)            # 1) 굵게
    hwp.HAction.Run("ParagraphShapeAlignCenter")   # 1-2) 가운데 정렬
    # 2) 위선·세로 가운데선 (음영/이중선과 분리)
    pset = _pset(hwp, "HCellBorderFill")
    hwp.HAction.GetDefault("CellBorderFill", pset.HSet)
    _setp(pset, "BorderTypeTop", SOLID)
    _setp(pset, "BorderWidthTop", W012)
    _setp(pset, "BorderTypeLeft", NONE)
    _setp(pset, "BorderTypeRight", NONE)
    _setp(pset, "TypeVert", SOLID)
    _setp(pset, "WidthVert", W012)
    hwp.HAction.Execute("CellBorderFill", pset.HSet)
    # 3) 아래 이중실선 토글
    _border_bottom_double(hwp)
    # 4) 음영 — 맨 마지막, 단독 Execute (이게 안 섞여야 음영이 남는다)
    _set_shade_only(hwp, SHADE_GRAY)


def table_header_style(hwp):
    """머리행: 첫 행 자동 선택 후 머리행 서식 적용 (단독 버튼용)."""
    _select_first_row(hwp)
    _apply_header_format(hwp)
    hwp.HAction.Run("Cancel")
    return "머리행: 첫 행 + 음영 + 아래 이중실선 + 굵게 + 가운데정렬"


def table_full_style(hwp):
    """표 서식 한 번에 — 선택을 최소화한 효율 버전.
       (1) 표 전체 1회 선택 → 본문 테두리 + 문단 배경 면색 없음
       (2) 첫 행 1회 선택 → 머리행 서식
       표 안 아무 셀에 커서만 두면 된다."""
    # (1) 표 전체 선택 → 본문 테두리, 이어서 같은 선택 위에 문단 배경 제거
    _select_whole_table(hwp)
    _set_border(hwp, top=SOLID, bottom=SOLID, left=NONE, right=NONE,
                horz=SOLID, vert=SOLID, shade=NO_FILL)   # 본문 테두리+음영제거
    _select_whole_table(hwp)        # _set_border가 Cancel하므로 재선택
    note = ""
    try:
        _para_bg_none(hwp)          # 문단 배경 면색 없음
    except Exception as e:
        LAST_WARN.append("문단 배경 제거는 건너뜀 — " + str(e))
        note = " (문단배경 건너뜀)"
    hwp.HAction.Run("Cancel")
    # (2) 첫 행만 선택 → 머리행 서식
    _select_first_row(hwp)
    _apply_header_format(hwp)
    hwp.HAction.Run("Cancel")
    return "표 서식 완료: 본문+면색없음 → 머리행" + note


# ─────────── 북마크 → 목차 ───────────
def add_agenda_bookmark(hwp, marks):
    hwp.Run("MoveLineBegin")
    hwp.Run("MoveSelLineEnd")
    title = get_sel_text(hwp)
    hwp.Run("Cancel")
    hwp.Run("MoveLineBegin")
    name = f"agenda{len(marks)}"
    run_action(hwp, "Bookmark", Name=name)
    if not title:
        title = f"안건 {len(marks) + 1}"
    marks.append((name, title))
    return f"북마크 추가: {title}  (현재 {len(marks)}개)"


def make_toc_from_bookmarks(hwp, marks):
    if not marks:
        return "찍은 북마크가 없습니다. 안건 줄에서 Ctrl+Alt+B를 먼저 누르세요."
    hwp.Run("MoveDocBegin")
    run_action(hwp, "InsertText", Text="목 차\r\n")
    for name, title in marks:
        run_action(hwp, "InsertHyperlink", Text=title, Command=f"?{name};0;0;0")
        hwp.Run("BreakPara")
    n = len(marks)
    marks.clear()
    return f"북마크 {n}개로 목차 생성"


# ─────────── v3.0 신규: 본문 치환/정리 ───────────
def tidy_spaces(hwp):
    """이중 공백 → 한 칸. 3칸 이상도 잡히도록 최대 5회 반복(멱등)."""
    for _ in range(5):
        run_action(hwp, "AllReplace", FindString="  ", ReplaceString=" ",
                   ReplaceMode=1, IgnoreMessage=1)
    return "이중 공백 정리 완료"


def custom_replace(hwp, find, repl):
    """문서 전체 치환(AllReplace). 빈 찾기 문자열은 거부."""
    if not find:
        return "찾을 내용이 비어 있어 실행하지 않았습니다."
    run_action(hwp, "AllReplace", FindString=find, ReplaceString=repl,
               ReplaceMode=1, IgnoreMessage=1)
    return f"전체 치환: '{find}' → '{repl}'"


def insert_end_mark(hwp):
    """문서 맨 끝으로 이동 후 '  끝.' 입력(행정문서 본문 종결 표기 관례)."""
    hwp.Run("MoveDocEnd")
    run_action(hwp, "InsertText", Text="  끝.")
    return "문서 끝에 '  끝.' 입력"


# ─────────── v3.0 신규: 문단 프리셋 ───────────
# HParaShape 의 LineSpacingType/LineSpacing 멤버 존재는 v2.5 실측 진단으로 확인됨.
# 값 의미만 미확인: 0 = '글자에 따라(%)' 로 추정. 다르면 아래 상수만 조정.
LINE_SPACING_TYPE_PERCENT = 0


def set_line_spacing(hwp, percent):
    """선택/현재 문단 줄 간격을 percent% 로."""
    pset = _pset(hwp, "HParaShape")
    hwp.HAction.GetDefault("ParagraphShape", pset.HSet)
    _setp(pset, "LineSpacingType", LINE_SPACING_TYPE_PERCENT)
    _setp(pset, "LineSpacing", int(percent))
    hwp.HAction.Execute("ParagraphShape", pset.HSet)
    return f"줄 간격 {percent}% 적용"


def para_align(hwp, action_id):
    """문단 정렬(Run 액션). Center 는 기존 기능에서 검증됨."""
    hwp.HAction.Run(action_id)
    label = {"ParagraphShapeAlignJustify": "양쪽 정렬",
             "ParagraphShapeAlignLeft": "왼쪽 정렬",
             "ParagraphShapeAlignCenter": "가운데 정렬"}.get(action_id, action_id)
    return label + " 적용"


# ─────────── v3.0 신규: 표 확장 ───────────
def table_font_size(hwp, pt):
    """표 안 아무 셀에 커서 → 표 전체 글자 크기 지정(기존 검증 경로 재사용)."""
    _select_whole_table(hwp)
    _set_char(hwp, height_pt=pt)
    hwp.HAction.Run("Cancel")
    return f"표 전체 글자 {pt}pt"


def table_align_center_all(hwp):
    """표 전체 가운데 정렬(기존 검증 액션 재사용)."""
    _select_whole_table(hwp)
    hwp.HAction.Run("ParagraphShapeAlignCenter")
    hwp.HAction.Run("Cancel")
    return "표 전체 가운데 정렬"


# ─────────── v3.0 신규: 문서/저장 ───────────
def doc_info(hwp):
    """현재 문서 경로·쪽수 등. 조회 실패 항목은 건너뛴다."""
    out = []
    try:
        act = hwp.XHwpDocuments.Active_XHwpDocument
        p = _doc_path(act)
        if p:
            out.append(f"파일: {p}")
    except Exception:
        pass
    for attr, label in (("PageCount", "쪽수"), ("Version", "한/글 버전")):
        try:
            out.append(f"{label}: {getattr(hwp, attr)}")
        except Exception:
            pass
    return "문서 정보 — " + (" | ".join(out) if out else "조회 실패")


def save_now(hwp):
    hwp.HAction.Run("FileSave")
    return "저장 완료(FileSave)"


def backup_copy(hwp):
    """저장 후 '파일 복사'로 백업 생성.
       (한/글 SaveAs 는 문서의 연결 경로를 바꾸므로 파일시스템 복사를 사용)"""
    import datetime
    import shutil as _sh
    hwp.HAction.Run("FileSave")
    act = hwp.XHwpDocuments.Active_XHwpDocument
    p = _doc_path(act)
    if not p:
        return "백업 실패: 저장된 경로가 없습니다(제목 없는 문서는 먼저 저장 필요)."
    base, ext = os.path.splitext(p)
    dst = base + "_" + datetime.datetime.now().strftime("%Y%m%d_%H%M") + ext
    _sh.copy2(p, dst)
    return "백업 생성: " + os.path.basename(dst)


def export_pdf(hwp):
    """현재 문서를 같은 폴더에 PDF 로 저장. hwp.SaveAs(경로, "PDF").
       (통용 방식이나 이 환경 실측은 요망 — 실패 시 로그로 보고됨)"""
    hwp.HAction.Run("FileSave")
    act = hwp.XHwpDocuments.Active_XHwpDocument
    p = _doc_path(act)
    if not p:
        return "PDF 저장 실패: 먼저 문서를 저장해 주세요(경로 필요)."
    pdf = os.path.splitext(p)[0] + ".pdf"
    hwp.SaveAs(pdf, "PDF")
    return "PDF 저장: " + os.path.basename(pdf)


# ─────────── GUI (v3.0 전면 개편) ───────────
QSS = """
QWidget{background:#1b1c22;color:#e7e7ea;font-family:'Malgun Gothic';font-size:13px;}
QLabel#t{font-size:17px;font-weight:700;color:#fff;}
QLabel#sec{color:#8b93ad;font-size:11px;font-weight:700;}
QLabel#h{color:#8b93ad;font-size:11px;}
QTabWidget::pane{border:1px solid #2c2f3a;border-radius:10px;background:#20222b;}
QTabBar::tab{background:transparent;color:#9aa0b4;padding:7px 14px;border:none;font-weight:600;}
QTabBar::tab:selected{color:#ffffff;border-bottom:2px solid #4c6ef5;}
QPushButton{background:#343747;border:1px solid #454960;border-radius:9px;
            padding:10px;color:#fff;font-size:13px;font-weight:600;}
QPushButton:hover{background:#414459;}
QPushButton#p{background:#4c6ef5;border:none;}
QPushButton#p:hover{background:#5c7cfa;}
QPushButton#mini{padding:6px 10px;font-size:12px;background:#2b2e3b;}
QLineEdit{background:#14151b;border:1px solid #2c2f3a;border-radius:8px;
          padding:8px;color:#e7e7ea;}
QComboBox{background:#343747;border:1px solid #454960;border-radius:8px;
          padding:7px;color:#fff;}
QComboBox QAbstractItemView{background:#262833;color:#e7e7ea;
          selection-background-color:#4c6ef5;}
QPlainTextEdit{background:#14151b;border:1px solid #2c2f3a;border-radius:8px;
               padding:8px;color:#c7c9d1;font-size:12px;}
"""


class Bridge(QObject):
    fire = pyqtSignal()


class Win(QWidget):
    def __init__(self):
        super().__init__()
        self.hwp = None
        self.marks = []
        self.target = None          # (hwp, doc, path, 표시명) — 고정 대상
        self._doc_rows = []
        self._registered = set()    # 보안모듈 등록을 마친 인스턴스 id
        self.setWindowTitle(f"한/글 기능 실행  v{__version__}")
        self.setStyleSheet(QSS)
        self.setMinimumWidth(480)
        v = QVBoxLayout(self)
        v.setContentsMargins(16, 12, 16, 12)
        v.setSpacing(8)

        t = QLabel(f"한/글 기능 실행  v{__version__}")
        t.setObjectName("t")
        v.addWidget(t)

        # ── 헤더: 상태 칩 + 대상 문서 콤보 + 새로고침 ──
        head = QHBoxLayout()
        self.chip = QLabel("○ 미연결")
        head.addWidget(self.chip)
        head.addStretch(1)
        self.doc_combo = QComboBox()
        self.doc_combo.setMinimumWidth(220)
        self.doc_combo.addItem("자동: 현재 활성 문서")
        self.doc_combo.currentIndexChanged.connect(self._on_doc_pick)
        head.addWidget(self.doc_combo)
        br = QPushButton("문서 새로고침")
        br.setObjectName("mini")
        br.clicked.connect(self._refresh_docs)
        head.addWidget(br)
        v.addLayout(head)

        # ── 버튼 팩토리 ──
        def mk(text, handler, primary=False):
            b = QPushButton(text)
            if primary:
                b.setObjectName("p")
            b.clicked.connect(handler)
            return b

        def fb(text, fn, primary=False):
            return mk(text, lambda: self.run(fn), primary)

        def page():
            w = QWidget()
            g = QGridLayout(w)
            g.setSpacing(7)
            g.setContentsMargins(10, 12, 10, 12)
            return w, g

        def fill(g, widgets, cols=2):
            for i, wd in enumerate(widgets):
                g.addWidget(wd, i // cols, i % cols)

        tabs = QTabWidget()
        v.addWidget(tabs)

        # [자주 씀]
        w, g = page()
        fill(g, [
            fb("표 서식 한번에", table_full_style, True),
            fb("한 줄로 입력  (Ctrl+Alt+L)", one_line_input, True),
            mk("안건 북마크  (Ctrl+Alt+B)", lambda: self.run(self._add_bm)),
            mk("북마크로 목차 생성", lambda: self.run(self._make_toc)),
            fb("메모 추가  (Ctrl+Alt+M)", insert_memo),
            fb("마크다운 기호 제거", clean_markdown),
            fb("저장", save_now),
            fb("PDF로 저장", export_pdf),
        ])
        g.setRowStretch(g.rowCount(), 1)
        tabs.addTab(w, "자주 씀")

        # [표]
        w, g = page()
        fill(g, [
            fb("표 서식 한번에 (전체→머리행)", table_full_style, True),
            fb("본문: 위아래선·좌우 없음", table_body_style),
            fb("머리행: 음영+아래 이중실선", table_header_style),
            fb("셀 문단 배경(면색) 제거", clear_table_para_bg),
            fb("표 전체 글자 9pt", lambda h: table_font_size(h, 9)),
            fb("표 전체 글자 10pt", lambda h: table_font_size(h, 10)),
            fb("표 전체 가운데 정렬", table_align_center_all),
        ])
        g.setRowStretch(g.rowCount(), 1)
        tabs.addTab(w, "표")

        # [본문]
        w, g = page()
        fill(g, [
            fb("마크다운 기호 제거 (*,#,---)", clean_markdown),
            fb("기호 앞 띄어쓰기 정리", spacing_rule),
            fb("한 줄로 입력  (Ctrl+Alt+L)", one_line_input),
            fb("이중 공백 정리", tidy_spaces),
            fb("문서 끝 '끝.' 입력", insert_end_mark),
            fb("줄 간격 130%", lambda h: set_line_spacing(h, 130)),
            fb("줄 간격 160%", lambda h: set_line_spacing(h, 160)),
            fb("양쪽 정렬", lambda h: para_align(h, "ParagraphShapeAlignJustify")),
            fb("왼쪽 정렬", lambda h: para_align(h, "ParagraphShapeAlignLeft")),
            fb("가운데 정렬", lambda h: para_align(h, "ParagraphShapeAlignCenter")),
        ])
        r = g.rowCount()
        self.ed_find = QLineEdit(); self.ed_find.setPlaceholderText("찾을 내용")
        self.ed_repl = QLineEdit(); self.ed_repl.setPlaceholderText("바꿀 내용")
        g.addWidget(self.ed_find, r, 0)
        g.addWidget(self.ed_repl, r, 1)
        g.addWidget(mk("문서 전체 치환 실행", self._do_replace, True), r + 1, 0, 1, 2)
        g.setRowStretch(r + 2, 1)
        tabs.addTab(w, "본문")

        # [문서]
        w, g = page()
        fill(g, [
            fb("문서 정보", doc_info),
            fb("메모 전체 삭제", delete_all_memos),
            fb("저장 (FileSave)", save_now),
            fb("백업 저장 (사본 생성)", backup_copy),
            fb("PDF로 저장", export_pdf, True),
        ])
        g.setRowStretch(g.rowCount(), 1)
        tabs.addTab(w, "문서")

        # [진단]
        w, g = page()
        fill(g, [
            fb("연결 테스트 / 진단", test_connection, True),
            mk("환경 진단 (연결 없이)", self._diag_env),
            mk("gen_py 캐시 정리 후 재시작", self._reset_gencache),
            fb("문단배경 진단 (멤버 표시)", probe_para_bg),
        ])
        g.setRowStretch(g.rowCount(), 1)
        tabs.addTab(w, "진단")

        # ── 로그 ──
        cap = QHBoxLayout()
        lc = QLabel("실행 로그"); lc.setObjectName("sec")
        cap.addWidget(lc); cap.addStretch(1)
        self.log = QPlainTextEdit(); self.log.setReadOnly(True)
        self.log.setPlaceholderText("실행 결과가 여기에 표시됩니다.")
        self.log.setMinimumHeight(130)
        bcl = QPushButton("지우기"); bcl.setObjectName("mini")
        bcl.clicked.connect(self.log.clear)
        cap.addWidget(bcl)
        v.addLayout(cap)
        v.addWidget(self.log, 1)

        # ── 전역 단축키 ──
        self.brM = Bridge(); self.brM.fire.connect(lambda: self.run(insert_memo))
        self.brB = Bridge(); self.brB.fire.connect(lambda: self.run(self._add_bm))
        self.brL = Bridge(); self.brL.fire.connect(lambda: self.run(one_line_input))
        try:
            import keyboard
            keyboard.add_hotkey("ctrl+alt+m", lambda: self.brM.fire.emit())
            keyboard.add_hotkey("ctrl+alt+b", lambda: self.brB.fire.emit())
            keyboard.add_hotkey("ctrl+alt+l", lambda: self.brL.fire.emit())
            h = QLabel("단축키: Ctrl+Alt+M(메모) · B(북마크) · L(한 줄)   |   대상 문서를 고정하면 모든 기능이 그 문서에만 적용됩니다.")
        except Exception:
            h = QLabel("단축키 사용:  pip install keyboard")
        h.setObjectName("h"); h.setWordWrap(True)
        v.addWidget(h)

    # ── 로그/상태 ──
    def _log(self, msg):
        self.log.appendPlainText(time.strftime("[%H:%M:%S] ") + msg)

    def _set_status(self):
        if self.target is not None:
            self.chip.setText("● 대상 고정: " + self.target[3])
            self.chip.setStyleSheet("color:#7ee787;font-weight:700;")
        elif self.hwp is not None:
            self.chip.setText("● 연결됨 (자동: 활성 문서)")
            self.chip.setStyleSheet("color:#7ee787;font-weight:700;")
        else:
            self.chip.setText("○ 미연결")
            self.chip.setStyleSheet("color:#8b93ad;")

    # ── 치환 입력 ──
    def _do_replace(self):
        f = self.ed_find.text()
        r = self.ed_repl.text()
        self.run(lambda h: custom_replace(h, f, r))

    # ── 북마크 ──
    def _add_bm(self, hwp):
        return add_agenda_bookmark(hwp, self.marks)

    def _make_toc(self, hwp):
        return make_toc_from_bookmarks(hwp, self.marks)

    # ── 대상 문서 ──
    def _refresh_docs(self):
        try:
            rows = list_open_documents()
        except Exception as e:
            self._log(f"✘ 문서 목록 조회 실패: {e}")
            return
        self._doc_rows = rows
        self.doc_combo.blockSignals(True)
        self.doc_combo.clear()
        self.doc_combo.addItem("자동: 현재 활성 문서")
        for disp, hwp, d, p in rows:
            self.doc_combo.addItem(disp + (f"  —  {p}" if p else ""))
        self.doc_combo.setCurrentIndex(0)
        self.doc_combo.blockSignals(False)
        self.target = None
        self._set_status()
        self._log(f"· 열린 문서 {len(rows)}개 — 선택하면 그 문서에 고정됩니다.")

    def _on_doc_pick(self, idx):
        if idx <= 0 or idx - 1 >= len(self._doc_rows):
            self.target = None
            self._set_status()
            self._log("· 대상: 자동(현재 활성 문서)")
            return
        disp, hwp, d, p = self._doc_rows[idx - 1]
        self.target = (hwp, d, p, disp)
        self._set_status()
        self._log("· 대상 고정: " + disp + (f"  ({p})" if p else ""))

    def _set_auto_mode(self):
        self.target = None
        try:
            self.doc_combo.blockSignals(True)
            self.doc_combo.setCurrentIndex(0)
            self.doc_combo.blockSignals(False)
        except Exception:
            pass
        self._set_status()

    def _hwp_for_run(self):
        if self.target is not None:
            hwp, d, p, disp = self.target
            _com_retry(lambda: activate_document(hwp, d, p), tries=3, wait=0.6)
            if id(hwp) not in self._registered:
                try:
                    hwp.RegisterModule("FilePathCheckDLL", SECURITY_MODULE_NAME)
                except Exception:
                    pass
                self._registered.add(id(hwp))
            return hwp
        if not self._alive():
            if not self._connect_now():
                return None
        return self.hwp

    # ── 연결 ──
    def _connect_now(self):
        try:
            self._log("한/글 연결 중...")
            QApplication.processEvents()
            self.hwp, backend = connect()
            self._log(f"✔ 연결됨 [{backend}]")
            self._set_status()
            return True
        except Exception as e:
            self.hwp = None
            self._set_status()
            self._log(f"✘ 연결 실패: {e}")
            try:
                self._log(env_diagnose())
            except Exception:
                pass
            return False

    def _alive(self):
        if self.hwp is None:
            return False
        try:
            _ = self.hwp.XHwpDocuments.Count
            return True
        except Exception as e:
            if _com_busy(e):
                return True
            self.hwp = None
            self._set_status()
            self._log("· 기존 연결이 유효하지 않아 재연결합니다.")
            return False

    # ── 진단/캐시 ──
    def _diag_env(self):
        try:
            self._log(env_diagnose())
        except Exception as e:
            self._log(f"✘ 진단 실패: {e}")

    def _reset_gencache(self):
        import subprocess
        try:
            _clear_gencache()
            self._log("· gen_py 캐시 삭제 완료 — 프로그램을 다시 시작합니다...")
            QApplication.processEvents()
        except Exception as e:
            self._log(f"✘ 캐시 삭제 실패: {e}")
            return
        try:
            script = os.path.abspath(sys.argv[0])
            subprocess.Popen([sys.executable, script])
        except Exception as e:
            self._log(f"✘ 자동 재시작 실패({e}) — 창을 닫고 직접 다시 실행해 주세요.")
            return
        os._exit(0)

    # ── 실행 ──
    def run(self, func):
        del LAST_WARN[:]
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            self._run_inner(func)
        finally:
            QApplication.restoreOverrideCursor()
            self._set_status()

    def _run_inner(self, func):
        # 1) 대상 결정: 고정 문서 활성화(+검증) 또는 자동 연결
        try:
            hwp = self._hwp_for_run()
        except Exception as e:
            if _com_busy(e):
                self._log(f"✘ 한/글이 호출을 거부(작업/대화상자 중): {e}\n"
                          "  → 대화상자를 닫고 다시 눌러 주세요. (고정 대상 유지)")
                return
            self._set_auto_mode()
            self._log(f"✘ 고정 문서 준비 실패: {e}\n"
                      "  → [문서 새로고침] 후 다시 선택해 주세요. (자동 모드로 전환)")
            return
        if hwp is None:
            return
        # 2) 기능 실행 — busy 1회 자동 재시도, lost 만 재연결/재선택
        try:
            self._log("✔ " + _com_retry(lambda: func(hwp), tries=2, wait=0.8))
            while LAST_WARN:
                self._log("△ " + LAST_WARN.pop(0))
        except Exception as e:
            if _com_busy(e):
                self._log(f"✘ 한/글이 호출을 거부(작업/대화상자 중): {e}\n"
                          "  → 한/글에 떠 있는 대화상자를 닫고 다시 눌러 주세요. (연결/대상 유지)")
                return
            es = str(e)
            if "gen_py" in es and "has no attribute" in es:
                _mark_binding_problem()
                self._log("  ↳ 조기바인딩 캐시(gen_py) 손상 의심.\n"
                          "    · 같은 버튼을 다시 누르면 늦은바인딩 모드로 재시도합니다.\n"
                          "    · 근본 해결: [gen_py 캐시 정리 후 재시작] 버튼.")
            self._log(f"✘ 오류: {e}")
            if _conn_lost(e):
                if self.target is not None:
                    self._set_auto_mode()
                    self._log("  (고정 문서의 인스턴스와 연결 끊김 → 문서 새로고침 후 재선택)")
                else:
                    self.hwp = None
                    self._log("  (연결이 끊긴 것으로 보임 → 다음 실행 시 자동 재연결)")



if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setFont(QFont("Malgun Gothic", 10))
    w = Win(); w.show()
    sys.exit(app.exec_())