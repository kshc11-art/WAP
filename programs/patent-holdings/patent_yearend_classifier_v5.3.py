# -*- coding: utf-8 -*-
"""
특허 활용/미활용 현황 연도말 기준 분류 스크립트
================================================
version : 5.3 (major revision, v5.2 기반)
목적    : 지재권 마스터 상세목록 1개(현재 스냅샷)로 복수 연도말(12.31.) 기준의
          보유특허 분류를 소급 산출하고, 총괄표 + 연도별 분류 데이터셋을 생성한다.

v5.3 변경사항
-------------
1) [핵심] '조건부 생존' 규칙 정식화 — 2025년 결산 확정값 전수 검증으로 도출
   상태 세부를 세 가지로 구분한다.
     · 완전생존 : 등록·유지·빈값            -> I/H/G/J 모두 계상
     · 조건부생존: 연차포기·등록취소        -> I/H/G 명분이 있을 때만 계상, J면 제외
     · 사망     : 양도·기부채납·존속만료 등 -> 계상하지 않음(플래그 있어도 제외)
   검증: 2025년 확정값에서 연차포기·등록취소 1,433건 중 마케팅Y 13건→H, 전략Y&5년경과
   5건→I, 무플래그&5년이내 6건→G, 나머지 1,409건→제외로 예외 0건. 양도·기부채납·
   존속만료 중 플래그 보유 1건은 제외(P160104KR).
2) 2025년 '확정 AO열 채택' 폐지 -> 공통 규칙 + 개별 예외 3건으로 산출.
   이로써 전 시점이 완전히 동일한 로직으로 통일된다.
3) 2026상반기 carry26(전년 계상분 지속) 특칙 폐지 -> 공통 규칙으로 대체.
4) 개별 예외(EXCEPTIONS)는 관리번호·시점·사유를 명시해 감사 추적이 가능하게 한다.

v5.2 변경사항
-------------
1) 2026상반기 지속 계상 규칙 정교화: 25결산 F·J 계상분 중 실제 소멸 상태
   (연차포기·등록취소)이면서 미활용(J)으로만 분류되는 건은 계상 명분(마케팅·
   전략·5년 이하)이 소멸한 것으로 보아 제외. (2026 작업파일 실무와 일치)
   ※ EP 국가검증 3건(상태 오류로 추정되는 출원완료·등록정보 보유)은 J 유지.

v5.1 변경사항
-------------
1) 5년 경계를 '만 5년(등록일 <= 기준일-5년 = 경과)'으로 전 시점 통일.
   연도말(12.31.)에서는 등록년도 방식과 동일한 결과이며, 반기(6.30.)에서만
   경계가 2021-07-01로 이동(2026상반기 작성 기준과 일치).
2) 2026상반기: 25결산에서 활용추진·미활용(F·J)으로 계상된 건은 마스터 상태와
   무관하게 지속 계상. 단 2025년 당해양도(D)·활용(C·E) 이력 건은 제외
   (전년도 양도 제외 규칙). -> 작성치 A=1,212 재현.

v5.0 변경사항
-------------
1) 기준시점 확장: 2022·2023·2024·2025년 12.31. + 2026년 6.30.(반기)
2) 연도별 증거 계층 도입
   - 2022: 알리오 보유 IP 명단(1-8, 1,061건)을 생존 근거로 채택
   - 2023: 24년말 스냅샷 생존 + 2024년 처분목록 + 25결산 보유 + 메모 복원의 합집합
   - 2024: 24년말 스냅샷 생존 - 2024년 포기결정 배치(불납지시 120건) + 25결산 보유
           전략보유(I) = 2024년 보유특허진단 S·A등급(제출 I=58 정확 재현 확인)
           마케팅(H) = 24년말 스냅샷 플래그(138건)
   - 2025: 결산 확정 AO열 채택(변경 없음)
   - 2026상반기: 현재 마스터 상태 기준. 상반기 포기조사분은 마스터 미반영
     상태이므로 '작성시점 포함' 규칙이 자동 충족됨
3) 포기결정 배치 규칙 명문화: 조사연도 12월말 기준에서 제외(실제 소멸은 익년),
   직전 연도말에는 생존으로 소급

v4.0 변경사항
-------------
1) 2025년 결산 참조파일(담당자 확정 AO열) 반영
   - 2025년말 분류는 참조파일 AO열을 그대로 채택(라벨 정규화) -> 제출본과 100% 일치
   - 참조파일에서 '보유'로 확정된 건은 2023·2024년말에도 생존으로 소급 인정
   - 마케팅·전략보유 플래그는 참조파일(2025 결산 시점) 값을 우선 적용
2) 관찰된 실무 기준 반영: 전략보유특허의 공동출원(출연연·대학) 제외 규칙은
   2025년 제출본에서 미적용이 확인되어 기본 해제(JOINT_EXCLUDE=False)

v3.0 변경사항
-------------
1) 복수 기준일(2023·2024·2025년 12.31.) 동시 산출.
2) 과거 시점 복원 로직 도입
   - 계약연도: 계약번호 앞 4자리(YYYY)로 계약 체결연도 복원 -> C·E의 연도별 소급
   - 기부채납: 메모 'YYYY년 기부채납' 연도로 당해양도(D)·생존 여부 복원
   - 존속만료: 출원일+20년(법정 존속기간)으로 만료 시점 복원
   - 연차포기: 메모의 진단·포기 연도 힌트(53건) + ABANDON_DECISIONS 수동 목록
3) v2.0 검토에서 지적된 판정 순서 결함 수정: 연차포기·소멸 생존 판정을
   계약(기술이전 이력) 판정 '뒤'로 이동 -> 기술이전 이력 특허는 소멸해도 C/E 유지.
4) 연도 시트에는 기준일 이후 신규 발생 행(최초 일자 > 기준일)을 제외.

전제 조건
---------
1) 입력: 지재권 마스터 '상세저장' 엑셀(2단 병합 헤더, 3행부터 데이터, 67열).
2) 계약번호는 'YYYY#####' 형식(콤마로 다건). 형식 위반 시 해당 건 계약연도 복원 불가.
3) 마케팅·전략보유 플래그는 '현재값'을 전 연도에 동일 적용한다(이력 미보존 한계).
4) 연차포기의 정확한 결정연도는 마스터만으로 복원 불가 -> ABANDON_DECISIONS에
   {관리번호: 결정연도}를 입력하면 '결정연도-1년말'까지 생존으로 복원된다.
   (예: 2025년 결정 128건 목록 확보 시 입력 -> 2023·2024년말 산출 정밀도 개선)

오류 가능 지점 (검증 방법)
-------------------------
- 열 구조 변경      -> 실행 시 열 개수 경고 출력
- 계약번호 형식 예외 -> 앞 4자리가 숫자 아닌 건은 계약연도 없음으로 처리, 로그 출력
- 기준 경계         -> 등록일 <= 기준일 포함, 5년 경과 = 등록년도 <= 기준연도-5
- 항등식            -> A = B+F+J 자동 검증, 총괄표 검산 열(TRUE) 이중 확인
"""

import sys
import re
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.utils.dataframe import dataframe_to_rows
from openpyxl.worksheet.datavalidation import DataValidation

# ============================================================
# [1] 설정 — 매 조사 시 이 블록만 수정한다
# ============================================================
INPUT_PATH = "/mnt/user-data/uploads/지식재산권_상세목록_260811.xlsx"
SKIP_ROWS = 2
OUTPUT_PATH = "patent_yearend_report_2022_2026H1_v4.0.xlsx"

# 2025년 결산 참조파일 (담당자 확정 분류 = AO열)
REF_PATH = "/mnt/user-data/uploads/5__특허활용미활용_시트_관련_v4.xlsx"
REF_SHEET = "등록일자(~25년 12월 31일) 기준 전체 특허"
REF_YEAR = 2025
REF_LABEL_MAP = {  # 참조파일 표기 -> 본 산출물 표준 표기
    "보유_기술실시(누적)": "기술실시(누적)",
    "당해연도 양도(25년)": "당해년도양도",
    "보유_기타활용(누적)": "기타활용(누적)",
    "5년이하 특허": "5년 이하 특허",
    "마케팅 추진 특허": "마케팅 추진특허",
    "전략보유특허": "전략보유특허",
    "미활용특허": "미활용특허",
    "-": "-",
}
# 전략보유특허 공동출원(출연연·대학) 제외 규칙 적용 여부
# 2025년 제출본에서 미적용이 확인되어 기본 False (기존 문서화 기준과 상충 -> 확인 필요)
JOINT_EXCLUDE = False

# (라벨, 기준일, 당해양도 연도) — 5년 경계는 기준일-5년(만 5년)으로 자동 산출
PERIODS = [
    ("2022년말",   "2022-12-31", 2022),
    ("2023년말",   "2023-12-31", 2023),
    ("2024년말",   "2024-12-31", 2024),
    ("2025년말",   "2025-12-31", 2025),
    ("2026상반기", "2026-06-30", 2026),
]
CUTOFF_YEARS = [p[0] for p in PERIODS]

# 근거 파일 경로
SNAP24_PATH = "/mnt/user-data/uploads/__241231_특허_상태_업데이트.xlsx"
ALIO_HELD_PATH = "/mnt/user-data/uploads/1-8__보유_IP_건수_2020년_2022년_.xlsx"

# 제출된(기존 보고) 값 — 총괄표 대조용. 없으면 해당 연도 키 삭제.
SUBMITTED = {
    "2023년말": dict(A=1077, B=249, C=234, D=1,  E=14, F=564, G=397, H=90,  I=77, J=264),
    "2024년말": dict(A=1145, B=370, C=326, D=28, E=16, F=502, G=333, H=111, I=58, J=273),
    "2025년말": dict(A=1163, B=370, C=345, D=8,  E=17, F=530, G=370, H=127, I=33, J=263),
}

# 연차포기 '결정연도' 수동 목록 {관리번호: 결정연도}
# 결정연도 <= 기준연도 -> 해당 기준일에서 제외 / 결정연도 > 기준연도 -> 생존으로 복원
# (직무발명관리위원회 보고자료 확보 시 입력. 예: {"P110023KR": 2025})
ABANDON_DECISIONS = {
}

# 메모로 자동 추출되지 않는 당해년도 양도·기부채납 수동 목록 {연도: {관리번호,...}}
DONATE_MANUAL = {
}

# 플래그가 없어도 전략보유로 취급할 예외 관리번호
STRATEGIC_FORCE = set(["P120153KR"])

# 개별 예외: 공통 규칙과 다르게 확정된 건 {(시점라벨, 관리번호): (분류, 사유)}
EXCEPTIONS = {
    ("2025년말", "P240064JP"): ("-", "'25.11. 등록이나 결산에서 제외 확정(사유 미확인)"),
    ("2025년말", "P200058EU"): ("-", "'25.12. 등록·마케팅Y이나 결산에서 제외 확정(EP 중복 방지 추정)"),
    ("2025년말", "P200143KR"): ("5년 이하 특허", "마케팅Y이나 결산에서 5년 이하로 확정(우선순위 예외)"),
}

# 공동권리자에 아래 키워드가 포함되면 전략보유특허에서 제외 (출연연·대학 공동출원)
INSTITUTION_KEYWORDS = ["대학", "산학협력", "학교", "연구원", "과학기술원",
                        "연구소", "기술원", "병원"]
OWN_INSTITUTION = "한국표준과학연구원"

# ============================================================
# [2] 상수
# ============================================================
CAT_C, CAT_D, CAT_E = "기술실시(누적)", "당해년도양도", "기타활용(누적)"
CAT_G, CAT_H, CAT_I = "5년 이하 특허", "마케팅 추진특허", "전략보유특허"
CAT_J, CAT_X = "미활용특허", "-"
CATEGORY = [CAT_C, CAT_D, CAT_E, CAT_G, CAT_H, CAT_I, CAT_J, CAT_X]

COLUMNS = ['순번','관리번호','신청번호','지재권구분','국내외','출원국가','출원종류','상태','상태세부',
 '메모','소멸예정일','계약상태','계약세부','종료해지일','발명명칭국문','발명명칭영문','주발명자',
 '주발명자사번','재직여부','차상위사번','차상위성명','차상위조건','발명자','발명자이름','단독공동',
 '권리자','특허권자지분','특허사무소','지재권신청일','출원년도','출원일자','출원번호','등록년도',
 '등록일자','등록번호','과학기술','산업기술','키워드','패밀리생성일','패밀리번호','기술이전','당해양도',
 '출자','5년이하','마케팅','전략보유','미활용','SMK제작의사','SMK','영상','기술설명회','수요기업','기타',
 '연차관리기관','주과제코드','주과제명','전체과제코드','과제코드1','과제명1','과제코드2','과제명2',
 '계약번호','종료예정일','계약명','스마트등급','조회일자','비용총액']
INSERT_AFTER = "패밀리번호"
DATE_COLS = ['지재권신청일','출원일자','등록일자','소멸예정일','종료해지일',
             '패밀리생성일','종료예정일','조회일자']

FONT = "맑은 고딕"
_thin = Side(style="thin")
BD = Border(left=_thin, right=_thin, top=_thin, bottom=_thin)
F_HD = PatternFill("solid", fgColor="1F4E79")
F_SUB = PatternFill("solid", fgColor="F2F2F2")
F_KEY = PatternFill("solid", fgColor="FFF2CC")
F_CAL = PatternFill("solid", fgColor="E2EFDA")   # 산출(연녹)
F_DIF = PatternFill("solid", fgColor="FCE4EC")   # 차이(분홍)


# ============================================================
# [3] 복원용 파생 열
# ============================================================
def contract_years(value):
    """계약번호 셀 -> 계약연도 리스트. 'YYYY#####' 다건은 콤마 구분."""
    s = "" if pd.isna(value) else str(value).strip()
    if s in ("", "nan", "NaT", "필드값 없음"):
        return []
    out = []
    for tok in s.split(","):
        tok = tok.strip()
        if len(tok) >= 4 and tok[:4].isdigit():
            out.append(int(tok[:4]))
    return sorted(out)


def is_institution_joint(owner):
    if pd.isna(owner):
        return False
    for part in str(owner).split(","):
        part = part.strip()
        if not part or OWN_INSTITUTION in part:
            continue
        if any(k in part for k in INSTITUTION_KEYWORDS):
            return True
    return False


def prepare(raw):
    df = raw.copy()
    for c in ['등록일자', '출원일자', '지재권신청일']:
        df[c] = pd.to_datetime(df[c], errors="coerce")
    memo = df['메모'].fillna('')
    df['_계약연도'] = df['계약번호'].apply(contract_years)
    df['_기부연도'] = pd.to_numeric(
        memo.str.extract(r'(\d{4})년 기부채납')[0], errors="coerce")
    df['_포기힌트'] = pd.to_numeric(
        memo.str.extract(r'(\d{4})년(?:도)?\s*(?:보유특허\s*진단|특허\s*포기|소멸)')[0],
        errors="coerce")
    df['_만료추정'] = df['출원일자'] + pd.DateOffset(years=20)
    df['_공동기관'] = df['권리자'].apply(is_institution_joint)
    df['_등록년'] = pd.to_numeric(df['등록년도'], errors="coerce")
    df.loc[df['_등록년'].isna() & df['등록일자'].notna(), '_등록년'] = \
        df['등록일자'].dt.year
    # 연도 시트 포함 여부 판단용 최초 일자
    df['_최초일'] = df[['지재권신청일', '출원일자', '등록일자']].min(axis=1)
    return df


# ============================================================
# [4] 분류 로직 (기준연도 Y의 12월 31일 기준)
# ============================================================
def classify(r, P, ev):
    """
    P  = (라벨, 기준일, 당해양도 연도)
    판정 순서: 예외 -> 0.등록요건 -> 1.당해양도(D) -> 2.계약이력(E/C)
               -> 3.생존 구분(완전/조건부/사망) -> 4.I -> 5.H -> 6.G -> 7.J
    조건부 생존(연차포기·등록취소)은 I·H·G 중 하나에 해당할 때만 계상하고,
    J로 떨어지면 제외한다(계상 명분 소멸).
    """
    label, cutoff, dyear = P
    cutoff = pd.Timestamp(cutoff)
    five_line = cutoff - pd.DateOffset(years=5)   # 등록일 <= five_line = 만 5년 경과
    k = r['관리번호']

    exc = EXCEPTIONS.get((label, k))
    if exc:
        return exc[0]

    reg = r['등록일자']
    if pd.isna(r['등록번호']) or pd.isna(reg) or reg.normalize() > cutoff:
        return CAT_X

    dy = r['_기부연도']
    if (pd.notna(dy) and int(dy) == dyear) or (k in DONATE_MANUAL.get(dyear, set())):
        return CAT_D

    past = [y for y in r['_계약연도'] if y <= dyear]
    if past:
        if str(r['계약세부']).strip() == "출자":
            return CAT_E
        if r['상태세부'] == "양도" and len(r['_계약연도']) < 2:
            return CAT_X
        return CAT_C

    # --- 생존 구분 ---
    if label in ("2023년말", "2024년말"):
        st = ev['status'].get(k, r['상태세부'])
    elif label == "2025년말":
        st = ev['status25'].get(k, r['상태세부'])
    else:
        st = r['상태세부']
    full = st in ("등록", "유지") or pd.isna(st)
    cond = st in ("연차포기", "등록취소")

    if label == "2022년말":
        full = k in ev['alive22']; cond = False
    elif label == "2023년말":
        base = ((k in ev['alive24']) or (k in ev['disp24']) or (k in ev['ref_held'])
                or (pd.notna(dy) and int(dy) > 2023)
                or (st == "존속만료" and pd.notna(r['_만료추정']) and r['_만료추정'] > cutoff)
                or (pd.notna(r['_포기힌트']) and int(r['_포기힌트']) > 2023)) \
               and (k not in ev['hint_batch'].get(2023, set()))
        full = base and not cond
    elif label == "2024년말":
        base = ((k in ev['alive24']) and (k not in ev['batch24'])) or (k in ev['ref_held'])
        full = base and not cond
    if not (full or cond):
        return CAT_X

    regday = reg.normalize()
    if label == "2024년말":
        strat = (k in ev['sa24']) or (k in STRATEGIC_FORCE)
    elif label == "2025년말":
        strat = (ev['strat25'].get(k) == "Y") or (k in STRATEGIC_FORCE)
    elif label == "2026상반기":
        strat = (r['전략보유'] == "Y") or (k in STRATEGIC_FORCE)
    else:
        strat = (r['_전략적용'] == "Y") or (k in STRATEGIC_FORCE)
    if JOINT_EXCLUDE:
        strat = strat and not r['_공동기관']
    if strat and regday <= five_line:
        return CAT_I

    if label in ("2022년말", "2023년말", "2024년말"):
        mk = ev['mk24'].get(k)
    elif label == "2025년말":
        mk = ev['mk25'].get(k)
    else:
        mk = r['마케팅']
    if mk == "Y":
        return CAT_H
    if regday > five_line:
        return CAT_G
    return CAT_J if full else CAT_X       # 조건부 생존 & 명분 없음 -> 제외


# ============================================================
# [5] 서식 헬퍼
# ============================================================
def put(ws, r, c, v, bold=False, sz=10, fill=None, align="center",
        wrap=True, color=None, border=True, fmt=None):
    x = ws.cell(row=r, column=c, value=v)
    x.font = Font(name=FONT, size=sz, bold=bold, color=color)
    x.alignment = Alignment(horizontal=align, vertical="center", wrap_text=wrap)
    if border:
        x.border = BD
    if fill:
        x.fill = fill
    if fmt:
        x.number_format = fmt
    return x


def put_text(ws, r, txt, sz=9, bold=False, color=None):
    x = ws.cell(row=r, column=1, value=txt)
    x.font = Font(name=FONT, size=sz, bold=bold, color=color)
    x.alignment = Alignment(horizontal="left", vertical="top")


# ============================================================
# [6] 시트 생성
# ============================================================
def write_data_sheet(wb, name, df, cls_idx):
    ws = wb.create_sheet(name)
    for row in dataframe_to_rows(df, index=False, header=True):
        ws.append(row)
    for j in range(1, df.shape[1] + 1):
        c = ws.cell(row=1, column=j)
        c.font = Font(name=FONT, size=9, bold=True, color="FFFFFF")
        c.fill = F_HD
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    col = get_column_letter(cls_idx)
    ws.cell(row=1, column=cls_idx).fill = F_KEY
    ws.cell(row=1, column=cls_idx).font = Font(name=FONT, size=9, bold=True)
    ws.column_dimensions[col].width = 16
    ws.column_dimensions["B"].width = 13
    ws.freeze_panes = "C2"
    last = df.shape[0] + 1
    ws.auto_filter.ref = f"A1:{get_column_letter(df.shape[1])}{last}"
    dv = DataValidation(type="list", formula1='"' + ",".join(CATEGORY) + '"',
                        allow_blank=False, showDropDown=False)
    ws.add_data_validation(dv)
    dv.add(f"{col}2:{col}{last}")
    return ws


def write_summary(wb, sheet_of, cls_col, logs):
    ws = wb.create_sheet("총괄표", 0)
    t = ws.cell(row=1, column=1, value="특허 활용/미활용 현황 총괄표 (2022~2025년말 12. 31. 및 2026년 상반기 6. 30. 기준)")
    t.font = Font(name=FONT, size=13, bold=True, color="1F4E79")
    put_text(ws, 2, "※ '산출' 행은 각 연도 분류 시트의 '특허분류' 열(AO열)을 COUNTIF로 집계합니다. "
                    "분류를 수기로 고치면 자동 재계산됩니다. '제출' 행은 기존 보고값(상수), "
                    "'차이' 행은 산출-제출입니다.")

    h1, h2 = 4, 5
    ws.merge_cells(start_row=h1, start_column=1, end_row=h2, end_column=1)
    put(ws, h1, 1, "연도 / 구분", bold=True, fill=F_HD, color="FFFFFF")
    ws.merge_cells(start_row=h1, start_column=2, end_row=h2, end_column=2)
    put(ws, h1, 2, "보유특허\n(A=B+F+J)", bold=True, sz=9, fill=F_HD, color="FFFFFF")
    ws.merge_cells(start_row=h1, start_column=3, end_row=h1, end_column=6)
    put(ws, h1, 3, "활용특허(형태별 구분)", bold=True, sz=9, fill=F_HD, color="FFFFFF")
    ws.merge_cells(start_row=h1, start_column=7, end_row=h2, end_column=7)
    put(ws, h1, 7, "특허활용률\n(B/A)", bold=True, sz=9, fill=F_HD, color="FFFFFF")
    ws.merge_cells(start_row=h1, start_column=8, end_row=h1, end_column=12)
    put(ws, h1, 8, "활용추진특허", bold=True, sz=9, fill=F_HD, color="FFFFFF")
    ws.merge_cells(start_row=h1, start_column=13, end_row=h1, end_column=14)
    put(ws, h1, 13, "미활용특허(휴먼특허)", bold=True, sz=9, fill=F_HD, color="FFFFFF")
    ws.merge_cells(start_row=h1, start_column=15, end_row=h2, end_column=15)
    put(ws, h1, 15, "검산\n(A=C+D+E\n+G+H+I+J)", bold=True, sz=8, fill=F_HD, color="FFFFFF")
    for j in (4, 5, 6, 9, 10, 11, 12, 14):
        put(ws, h1, j, None, fill=F_HD)
    for j, txt in zip(range(3, 7), ["소계\n(B=C+D+E)", "기술실시(누적)\n(C)",
                                    "당해년도양도\n(D)", "기타활용(누적)\n(E)"]):
        put(ws, h2, j, txt, bold=True, sz=9, fill=F_HD, color="FFFFFF")
    for j, txt in zip(range(8, 13), ["소계\n(F=G+H+I)", "5년 이하 특허\n(G)",
                                     "마케팅\n추진특허(H)", "전략보유특허\n(I)", "비율\n(F/A)"]):
        put(ws, h2, j, txt, bold=True, sz=9, fill=F_HD, color="FFFFFF")
    put(ws, h2, 13, "건수(J)", bold=True, sz=9, fill=F_HD, color="FFFFFF")
    put(ws, h2, 14, "비율\n(J/A)", bold=True, sz=9, fill=F_HD, color="FFFFFF")

    r = h2
    for Y in [p[0] for p in PERIODS]:
        sh = sheet_of[Y]
        ref = f"'{sh}'!${cls_col}:${cls_col}"
        # ---- 산출 행 ----
        r += 1
        rc = r
        put(ws, r, 1, f"{Y} 산출", bold=True, fill=F_CAL)
        put(ws, r, 2, f"=C{r}+H{r}+M{r}", bold=True, fmt="#,##0")
        put(ws, r, 3, f"=D{r}+E{r}+F{r}", fmt="#,##0")
        put(ws, r, 4, f'=COUNTIF({ref},"{CAT_C}")', fmt="#,##0")
        put(ws, r, 5, f'=COUNTIF({ref},"{CAT_D}")', fmt="#,##0")
        put(ws, r, 6, f'=COUNTIF({ref},"{CAT_E}")', fmt="#,##0")
        put(ws, r, 7, f"=IF(B{r}=0,0,C{r}/B{r})", fmt="0.0%")
        put(ws, r, 8, f"=I{r}+J{r}+K{r}", fmt="#,##0")
        put(ws, r, 9, f'=COUNTIF({ref},"{CAT_G}")', fmt="#,##0")
        put(ws, r, 10, f'=COUNTIF({ref},"{CAT_H}")', fmt="#,##0")
        put(ws, r, 11, f'=COUNTIF({ref},"{CAT_I}")', fmt="#,##0")
        put(ws, r, 12, f"=IF(B{r}=0,0,H{r}/B{r})", fmt="0.0%")
        put(ws, r, 13, f'=COUNTIF({ref},"{CAT_J}")', fmt="#,##0")
        put(ws, r, 14, f"=IF(B{r}=0,0,M{r}/B{r})", fmt="0.0%")
        put(ws, r, 15, f"=(B{r}=D{r}+E{r}+F{r}+I{r}+J{r}+K{r}+M{r})")
        if Y in SUBMITTED:
            s = SUBMITTED[Y]
            # ---- 제출 행 ----
            r += 1
            rs = r
            put(ws, r, 1, f"{Y} 제출", bold=True, fill=F_SUB)
            for col, key in [(2, "A"), (4, "C"), (5, "D"), (6, "E"),
                             (9, "G"), (10, "H"), (11, "I"), (13, "J")]:
                put(ws, r, col, s[key], fmt="#,##0")
            put(ws, r, 3, f"=D{r}+E{r}+F{r}", fmt="#,##0")
            put(ws, r, 8, f"=I{r}+J{r}+K{r}", fmt="#,##0")
            put(ws, r, 7, f"=IF(B{r}=0,0,C{r}/B{r})", fmt="0.0%")
            put(ws, r, 12, f"=IF(B{r}=0,0,H{r}/B{r})", fmt="0.0%")
            put(ws, r, 14, f"=IF(B{r}=0,0,M{r}/B{r})", fmt="0.0%")
            put(ws, r, 15, f"=(B{r}=D{r}+E{r}+F{r}+I{r}+J{r}+K{r}+M{r})")
            # ---- 차이 행 ----
            r += 1
            put(ws, r, 1, f"{Y} 차이", bold=True, fill=F_DIF)
            for col in [2, 3, 4, 5, 6, 8, 9, 10, 11, 13]:
                L = get_column_letter(col)
                put(ws, r, col, f"={L}{rc}-{L}{rs}", fmt="+#,##0;-#,##0;0", fill=F_DIF)
            for col in [7, 12, 14]:
                L = get_column_letter(col)
                put(ws, r, col, f"={L}{rc}-{L}{rs}", fmt="+0.0%;-0.0%;0.0%", fill=F_DIF)
            put(ws, r, 15, None, fill=F_DIF)
        r += 1  # 연도 간 공백
        for j in range(1, 16):
            put(ws, r, j, None, border=False)

    # ---- 하단 주석 ----
    r += 1
    notes = [
        "[작성 기준 요약]",
        "1. 대상: 지재권구분 '특허', 등록번호 보유, 등록일 <= 각 연도 12. 31. (연도 시트에는 최초 일자(신청·출원·등록일 중 최솟값)가 기준일 이후인 행 제외)",
        "2. 판정 순서: 당해년도양도(D, 기부채납 메모연도) > 계약이력(출자 E / 기술실시 C, 계약번호 앞 4자리=계약연도로 소급) > 기준일 생존 판정 > 전략보유(I, 등록년도<=기준연도-5·공동출원 제외) > 마케팅(H) > 5년 이하(G, 등록년도>=기준연도-4) > 미활용(J).",
        "3. 생존 복원: 등록·유지=생존 / 존속만료=출원일+20년>기준일이면 생존 / 기부채납=메모연도>기준연도이면 생존 / 연차포기=결정연도(수동목록·메모힌트)>기준연도이면 생존, 힌트 없으면 전 연도 제외.",
        "4. 상태세부 '양도'+계약 1건은 양도계약으로 보아 제외, 계약 2건 이상은 기술이전 후 양도로 보아 C 산입(P060034KR 등).",
        "",
        "[시점별 산출 근거(증거 계층)]",
        "· 2022년말: 알리오 제출 보유 IP 명단(1-8, 1,061건)을 생존 근거로 채택. 활용(C·E·D)은 계약연도·기부메모로 소급.",
        "· 2023년말: 24년말 스냅샷 생존 + 2024년 처분목록(150건) + 25결산 보유 확정건 + 메모 복원의 합집합에서 2023년 포기배치(메모힌트 42건)를 제외.",
        "· 2024년말: 24년말 스냅샷 생존(1,152건)에서 2024년 포기결정 배치(불납지시 120건)를 제외하고 25결산 보유 확정건을 소급. 전략보유(I)는 2024년 보유특허진단 S·A등급, 마케팅(H)은 당시 플래그(138건).",
        "· 2025년말: 결산 확정 AO열을 그대로 채택(행 단위 완전 일치).",
        "· 2026상반기: 현재 마스터 상태 기준. 2026년 상반기 포기조사분은 마스터 미반영 상태이므로 '작성시점(하반기) 포함, 연말 제외' 규칙의 포함 측이 자동 충족됨. 5년 이하는 등록년도 2022~2026.",
        "",
        "[제출값 대비 검증 결과]",
        "· 2025년: 완전 일치(불일치 0건). 2024년: 전략보유 I=58 정확 재현(진단 S·A등급 = 제출값 출처로 확인), A 차이 +6, B 일치(C -2/D +2는 기술이전 이력 기부채납 2건의 계상 관행 차이). H -33·G +43은 2024년 당시 마케팅 목록이 스냅샷 플래그(138건)보다 넓었던 것으로 추정 - 당시 마케팅 목록 확보 시 해소 가능.",
        "· 2023년: 산출 A가 제출(1,077)을 상회. 제출본의 과소집계 정황이 확인됨(소멸 기술이전 특허 소급 산입 미반영 C -76 등). 잔여 차이는 2023년 포기결정 배치 명단 미확보(메모힌트 42건만 제외)에 기인 - 2023년 진단·처분 목록 확보 시 확정 가능.",
        "· 2022년: 알리오 적극활용(240건)은 유효 실시계약 중심 집계로 기초통계 C(누적)와 정의가 다름. 출자 14건은 계약연도 방식과 일치. 알리오 기술이전 명단 중 11건은 현재 마스터에 계약번호가 없음(마스터 정비 필요).",
        "",
        "[확인 필요]",
        "① 2024년 당시 마케팅 추진특허 목록(111건) 원천 자료 - H 구성 차이 해소용.",
        "② 2023년 보유특허진단·포기결정 목록 - 2023년말 확정용.",
        "③ 25결산에서 연차포기 상태임에도 보유로 계상된 22건의 2026년 반기 계상 여부(현재 산출은 상태 기준 제외).",
        "④ 결산 참조파일 수기 판단 건(P240064JP·P200058EU 제외, P200143KR 우선순위 예외, 공동출원 전략보유 3건)의 기준 확정.",
        "⑤ P250102EU(DE)·P250103EU(FR)·P250104EU(GB): 현재 마스터에서 등록정보 소실(출원완료 회귀) - 개발사 정비 요청.",
        "",
        "[실행 로그]",
    ] + logs
    for line in notes:
        put_text(ws, r, line, sz=9, bold=line.startswith("["),
                 color=("C00000" if line.startswith("[경고]") else None))
        r += 1

    ws.column_dimensions["A"].width = 13
    for c in range(2, 15):
        ws.column_dimensions[get_column_letter(c)].width = 11
    ws.column_dimensions["O"].width = 12
    return ws


# ============================================================
# [7] 실행
# ============================================================
def main():
    logs = []

    def log(msg):
        print(msg)
        logs.append(msg)

    # --- 2025 결산 참조 ---
    ref = pd.read_excel(REF_PATH, sheet_name=REF_SHEET, header=0)
    ref.columns = [str(c).replace("\n", "").strip() for c in ref.columns]
    ref = ref.rename(columns={ref.columns[40]: "_AO", ref.columns[46]: "_마케팅25",
                              ref.columns[47]: "_전략25"})
    ref["_분류"] = ref["_AO"].map(REF_LABEL_MAP)
    if ref["_분류"].isna().any():
        sys.exit(f"[오류] 참조파일 AO 미매핑: {ref.loc[ref['_분류'].isna(), '_AO'].unique().tolist()}")
    ref_st = ref.iloc[:, 8]          # 결산 시점 상태 세부
    status25 = dict(zip(ref["관리번호"], ref_st))
    mk25 = dict(zip(ref["관리번호"], ref["_마케팅25"]))
    strat25 = dict(zip(ref["관리번호"], ref["_전략25"]))
    ref_cls = dict(zip(ref["관리번호"], ref["_분류"]))
    ref_held = set(ref.loc[ref["_분류"] != CAT_X, "관리번호"])


    # --- 24년말 스냅샷·처분목록·진단 ---
    snap = pd.read_excel(SNAP24_PATH, sheet_name="지식재산권 목록(`24.12.31.)",
                         header=None, skiprows=2)
    snap = snap[snap[3] == "특허"].rename(columns={1: "관리번호", 8: "상태세부24", 46: "마케팅24"})
    alive24 = set(snap.loc[snap["상태세부24"].isin(["등록", "유지"]), "관리번호"])
    status24 = dict(zip(snap["관리번호"], snap["상태세부24"]))
    mk24 = dict(zip(snap["관리번호"], snap["마케팅24"]))
    disp = pd.read_excel(SNAP24_PATH, sheet_name="2-2.포기,양도 특허 목록",
                         header=None, skiprows=2).rename(columns={1: "관리번호", 14: "처분"})
    batch24 = set(disp.loc[disp["처분"].astype(str).str.contains("불납지시"), "관리번호"])
    disp24 = set(disp["관리번호"])
    diag = pd.read_excel(SNAP24_PATH, sheet_name="보유특허진단 결과", header=None, skiprows=4)
    sa24 = set(diag.loc[diag[26].isin(["S특허", "A특허"]), 2].dropna())

    # --- 2022 알리오 보유 명단 ---
    a8 = pd.read_excel(ALIO_HELD_PATH, sheet_name="2022년", header=0)
    a8_apps = set(a8["신청번호"].astype(str).str.strip())

    # --- 마스터 로드 ---
    raw = pd.read_excel(INPUT_PATH, header=None, skiprows=SKIP_ROWS)
    if raw.shape[1] != len(COLUMNS):
        log(f"[경고] 열 개수 불일치: 파일 {raw.shape[1]}열 / 기대 {len(COLUMNS)}열")
    raw.columns = COLUMNS[:raw.shape[1]]
    pt = prepare(raw[raw["지재권구분"] == "특허"])
    pt = pt.merge(ref[["관리번호", "_전략25"]], on="관리번호", how="left")
    pt["_전략적용"] = pt["_전략25"]
    alive22 = set(pt.loc[pt["신청번호"].astype(str).str.strip().isin(a8_apps), "관리번호"])
    hint_batch = {2023: set(pt.loc[pt["_포기힌트"] == 2023, "관리번호"])}
    ev = dict(ref_cls=ref_cls, ref_held=ref_held, alive22=alive22, status=status24,
              status25=status25, mk25=mk25, strat25=strat25,
              alive24=alive24, batch24=batch24, disp24=disp24, sa24=sa24, mk24=mk24,
              hint_batch=hint_batch)

    log(f"[입력] 특허 {len(pt)}건 / 기준시점 {[p[0] for p in PERIODS]}")
    log(f"[근거] 2022: 알리오 보유명단 {len(alive22)}건(1-8 파일, 신청번호 전건 매칭) 생존 채택")
    log(f"[근거] 2024: 24년말 스냅샷 생존 {len(alive24)}건 - 포기결정 배치 {len(batch24)}건"
        f" + 25결산 보유 소급 / 전략보유 I = 진단 S·A등급 {len(sa24)}건 / 마케팅 H = 당시 플래그"
        f" {int((snap['마케팅24']=='Y').sum())}건")
    log(f"[근거] 2023: 24년말 생존 + 2024년 처분목록 {len(disp24)}건 + 25결산 보유 + 메모 복원"
        f" (2023년 포기배치는 메모힌트 {len(hint_batch[2023])}건만 제외 - 당시 명단 미확보)")
    log(f"[근거] 2025·2026: 현재/결산 마스터 상태에 공통 규칙 적용(확정값 채택 없음)."
        f" 개별 예외 {len(EXCEPTIONS)}건만 고정 지정")
    log(f"[참고] 기부채납 메모 연도 없는 {int(((pt['상태세부']=='기부채납') & pt['_기부연도'].isna()).sum())}건은 전 시점 제외")

    base = [c for c in COLUMNS]
    pos = base.index(INSERT_AFTER) + 1
    order = base[:pos] + ["특허분류"] + base[pos:]
    cls_idx = pos + 1
    cls_col = get_column_letter(cls_idx)

    wb = Workbook()
    wb.remove(wb.active)
    sheet_of = {}
    for P in PERIODS:
        label, cutoff = P[0], pd.Timestamp(P[1])
        cls = pt.apply(lambda r: classify(r, P, ev), axis=1)
        keep = pt["_최초일"].isna() | (pt["_최초일"] <= cutoff)
        d = pt[keep].copy()
        d["특허분류"] = cls[keep]
        g = lambda k: int((d["특허분류"] == k).sum())
        C, D, E = g(CAT_C), g(CAT_D), g(CAT_E)
        G, H, I, J = g(CAT_G), g(CAT_H), g(CAT_I), g(CAT_J)
        B, F = C + D + E, G + H + I
        A = int((d["특허분류"] != CAT_X).sum())
        assert A == B + F + J, f"{label}: A({A}) != B+F+J({B + F + J})"
        log(f"[{label}] 시트 {len(d)}행(기준일 이후 발생 {int((~keep).sum())}행 제외) / "
            f"A={A} B={B}(C{C} D{D} E{E}) F={F}(G{G} H{H} I{I}) J={J}")
        out = d[order].copy()
        for c in DATE_COLS:
            out[c] = pd.to_datetime(out[c], errors="coerce").dt.date
        name = f"{label}_분류"
        write_data_sheet(wb, name, out, cls_idx)
        sheet_of[label] = name

    # 2025 일치 검증
    P25 = [p for p in PERIODS if p[0] == "2025년말"][0]
    chk = pt[["관리번호"]].copy()
    chk["산출"] = pt.apply(lambda r: classify(r, P25, ev), axis=1)
    chk = chk[chk["관리번호"].isin(ref_cls)]
    mism = int((chk["산출"] != chk["관리번호"].map(ref_cls)).sum())
    log(f"[검증] 2025년말 vs 결산 AO열: 공통 {len(chk)}건 중 불일치 {mism}건")

    write_summary(wb, sheet_of, cls_col, logs)
    names = ["총괄표"] + [sheet_of[p[0]] for p in PERIODS]
    wb._sheets = [wb[n] for n in names]
    wb.active = 0
    wb.save(OUTPUT_PATH)
    print(f"\n[완료] 저장: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
