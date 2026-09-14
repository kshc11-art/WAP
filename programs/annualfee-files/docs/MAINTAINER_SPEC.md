# KRISS 연차유지료 자동화 - 유지보수 명세서

문서 버전: **0.6.3** (v0.5.2 단일 명세를 기준으로 운영 provenance/PDF preflight/릴리스 정합성까지 확장)  
기준 골든: **2025년 4분기 ZIP + 2026년 1분기 ZIP + 2026년 2분기 ZIP** / 운영 회귀 fixture: **2026Q3 입력세트**  
미래 분기 기본 업무 레이아웃: **2026년 2분기 형식(q2-current profile)** (2026Q3 입력에서도 검증됨) — 단, 적요/파일명 공백 규칙은 분기 실물에 따라 다르며 2025Q4는 q1-legacy 규칙이었다(§6 참조).

> 통합 안내: 기존 RULES/KNOWN_DEVIATIONS/ARCHITECTURE/CODE_MAP/OOXML_ENGINE/GUI/GOLDEN_ANALYSIS 문서는 이 문서의 장으로 흡수·개정되었다. 검증 기록 원문은 `docs/VALIDATIONS.md`, 포털 계층은 `PORTAL_*` 문서를 본다. 코드도 utils/models/discover가 `kriss_annual_fee/core.py`로 통합되었다(v0.5.1).

> **읽기 순서:** 구조/책임경계는 `MAINTENANCE_BLUEPRINT.md`를 먼저 보고, 이 문서는 상세 업무규칙의 source of truth로 사용한다. GUI는 업무판단을 소유하지 않는다.
>
> **v0.6.7 운영 레이아웃/GUI 규칙:** 신규 결과 run은 `<연도>년 <분기>분기 연차관리`이고 direct child는 `2. 수수료 납부`, `3. 연차유지료 납부`, `템퍼몽키용`이다. 신규 코드에서 `package/`나 `_automation/`을 다시 만들지 말 것(legacy read compatibility만 유지). 현재분기 Treeview와 history/master Listbox는 모두 DnD target이다. MISSING/EXPLICIT_UNASSIGNED는 관리번호뿐 아니라 청구행·금액·출원/등록번호·발명명을 오류/CSV에 남긴다. 해외 service fee는 J/L 비연속 대상 각각에 독립 외곽선을 적용하여 K(송금수수료)를 포함하지 않는다.
## 0. v0.6.3 최우선 오버라이드 — 업무 XLSX는 Excel Native

> **이 절은 아래 문서에 남아 있는 v0.3~v0.6.1 OOXML 운영 설명보다 우선한다.** 과거 설명은 회귀/역사 이해를 위해 남겨두지만 실제 제출파일 생성 정책으로 사용하면 안 된다.

실제 2026Q3 사용자 검수에서 두 종류의 실패가 확인됐다.

1. worksheet XML 직접 재작성 후 Microsoft Excel이 파일을 손상/복구 대상으로 판단하는 사례
2. 실제 필터를 확보하려고 범위를 Excel Table로 재구성했을 때 원본 Markpro 본문의 표 선/색상이 달라지는 사례

따라서 v0.6.3부터 운영 기본은 **Microsoft Excel Desktop COM Native backend**다. `auto`는 Windows에서 native를 선택하며, native 시작에 실패하면 **중단**한다. `portable-legacy`로 자동 fallback하지 않는다.

### 0.1 절대 불변 규칙

- 원본 Markpro XLSX를 먼저 byte copy한 뒤 그 **사본을 Microsoft Excel로 연다**.
- Excel에서 `Columns("A:D").Insert()`를 사용한다. 원본 E열 이후 본문에 별도 재스타일링을 하지 않는다.
- 기존 원본 본문의 값/서식/테두리/열너비/행높이를 Python library로 rebuild하지 않는다.
- 새 A:D만 입력/서식한다.
- 예산별 파일에서 **행 삭제 금지**.
- 예산별 파일에서 Python 코드로 `Row.Hidden=True`를 직접 설정해 필터를 흉내내는 것 금지.
- Excel `Range.AutoFilter(Field=4, Criteria1=<예산명>)`을 사용한다.
- Excel Table/ListObject 생성 금지. 필터 버튼을 얻기 위해 Table로 변환하지 않는다.
- 총계 B셀은 `=SUBTOTAL(9,B2:B<data_end>)`.
- A1:D1은 노랑. 마지막 A/B는 기존 total style을 복사하고 글씨 빨강. C/D는 기존 total amount style을 복사한다.
- 수수료 XLSX는 원본 복사본에서 대상 열 글씨만 파랑으로 바꾸고, 대상 블록의 **외곽 네 면만** medium 파란 선을 추가한다. 내부 원본 border는 건드리지 않는다.
- 모든 생성 XLSX는 Excel로 저장 후 **같은 Excel 엔진으로 다시 열어** 검증한다. 필터 criteria, SUBTOTAL formula/value, open success를 `_automation/excel_output_validation.json`에 기록한다.

### 0.2 backend 정책

- `auto`: 운영 기본. Native Excel을 요구. 실패 시 중단.
- `native`: Native Excel 명시 요구.
- `portable-legacy`: 과거 `xlsx_ooxml.py` 구현. Linux 골든/개발 회귀용. 실제 제출파일 생성에는 사용하지 않는다.

### 0.3 Windows 의존성

업무 XLSX 생성에는 다음이 필요하다.

- Windows 10/11
- Microsoft Excel Desktop
- `pywin32`

`check`/매핑/PDF 분석은 Excel 없이도 가능하다. GUI/CLI 전체 생성은 기본 `auto`에서 Excel이 없으면 fail-fast한다.

### 0.4 장애 진단 순서

Excel 파일이 열리지 않거나 복구 메시지가 뜨면 **OOXML patch를 더 추가하지 말 것**.

1. `native_excel_selftest.bat` 실행
2. 실패하면 Excel 설치/정품인증/COM/pywin32 확인
3. self-test PASS인데 업무파일만 실패하면 `_automation/excel_output_validation.json` 확인
4. 원본 XLSX 자체를 Excel에서 직접 열어 확인
5. `excel_native.py`에서 우리가 수정하는 A:D/AutoFilter/fee outline만 조사
6. 원본 E열 이후 스타일을 다시 만드는 로직을 추가하지 않는다

---

> 이 문서는 사람뿐 아니라 후속 AI가 코드의 의도, 입력 자료의 의미, 골든과의 차이, 실패 시 조사 순서를 재구성할 수 있도록 작성한다. 구현을 수정할 때는 먼저 이 문서의 “불변 규칙”, “골든 사실”, “알려진 미해결 항목”을 확인한다.

### v0.6.1 산출물 시각/필터 불변 규칙

2026Q3 실사용 검수에서 아래 다섯 항목이 명시적으로 확정됐다. 이 규칙은 단순 미관이 아니라 Excel 재계산/증빙 가독성에 영향을 주므로 회귀테스트 없이 완화하지 않는다.

1. 예산별 XLSX는 **실제 worksheet AutoFilter**여야 한다. D열(예산명) `filterColumn colId=3`을 저장하고 총계행은 filter ref 밖에 둔다. `hidden=1`만으로 흉내내면 `SUBTOTAL(9,...)`이 Excel 재계산 시 수동 숨김행을 포함하므로 금지한다.
2. 생성 A:D 헤더는 노랑 `#FFFF00`. 총계 A/B는 초록 `#C6D3B4` + 빨강 글씨 `#FF0000`, C/D는 초록 `#C6D3B4`.
3. 예산별 PDF red row box는 `#E52237`, **1.6pt**. rule-line template에서는 상/하 dashed separator 좌표 자체를 box edge로 사용하여 기존 점선을 덮는다.
4. 수수료 XLSX는 대상 열 블록의 글씨 `#0070C0` + **medium 파란 외곽선**. 내부 셀 border는 원본 thin을 유지하여 각 셀마다 굵은 박스가 생기면 안 된다.
5. 수수료/송금수수료 PDF orange box는 텍스트 padding이 아니라 PDF drawing의 실제 black table rule을 찾아 그 좌표에 정렬한다.

---

## 1. 업무 목적과 범위

마크프로가 분기별로 제공하는 국내/해외 특허 연차료 청구자료와 KRISS 내부의 연차유지 조사자료를 결합하여 다음을 자동 생성한다.

1. 관리번호별 지출 예산코드/예산명 결정
2. 국내/해외 청구 XLSX 앞에 지출용 4개 열 추가
3. 예산별 XLSX 사본 생성 및 AutoFilter 적용
4. 예산별 PDF 생성
   - 원본 PDF 전체 페이지 유지
   - 해당 예산에 속한 관리번호의 상세 건 전체를 빨간 테두리로 표시
   - 해당 건의 지출 대상 금액만 노란 형광표시
5. 국내/해외 수수료 및 해외 송금수수료 증빙 XLSX/PDF 생성
6. 포털 자동화를 위한 `manifest.json` 생성
7. Tampermonkey 처리 결과를 받아 완료 폴더명 반영 및 최종 ZIP 생성

**중요:** Python 파일생성 엔진과 포털 브라우저 자동화는 의도적으로 분리한다. Excel/PDF/업무판단은 Python이 담당하고, Tampermonkey는 확정된 manifest를 화면에 입력하는 역할만 담당한다.

---

## 2. 정답 자료(골든)의 권위 순서

자동화 규칙이 문서/코드와 골든에서 충돌할 때 다음 순서로 판단한다.

1. 사용자가 현재 대화에서 직접 확정한 설명
2. **2026Q2 `2분기.zip`** - 현재 업무 형식의 1차 정답
3. **2026Q1 `1분기.zip`** - 이전 형식 및 예외/역사조회 규칙의 정답
3-1. **2025Q4 완료본 ZIP** - q1-legacy 적요 규칙, 연도별 준비금 코드(25841004), 외부 확정/사후 예산변경(budget master 대상)의 실증 골든
4. 사용자 확정 budget master XLSX (제공된 경우, 조사 XLSX보다 우선)
5. 현재 분기 내부 조사 XLSX
5. 마크프로 원본 청구 XLSX/PDF
6. 이 문서와 코드

Q1과 Q2에서 파일명 공백, 폴더 번호, 완료표기 등이 서로 다르다. 미래 분기 산출은 특별한 지시가 없으면 **Q2 형식**을 따른다. Q1은 데이터 의미와 과거분기 조회 규칙을 검증하기 위한 골든으로 사용한다.

골든에서 기계적으로 추출한 값은:

- `docs/golden/2026Q1_facts.json`
- `docs/golden/2026Q2_facts.json`
- `docs/golden/2026Q1_tree.txt`
- `docs/golden/2026Q2_tree.txt`

에 저장한다.

---

## 3. 핵심 용어

### 관리번호
마크프로 청구 XLSX의 `고객관리번호`와 내부 조사 XLSX의 `관리번호`를 연결하는 **최우선 조인 키**이다.

예:
- `P190114KR`
- `P150159KR`
- `P200141AU`

문자열 앞뒤 공백만 제거한다. 내부 공백/하이픈/괄호를 임의로 정규화하지 않는다.

### 연구부서 조사파일
파일명에 `연차유지`와 `연구부서`가 들어가는 XLSX. 분기별 실제 이름이 다르다.

확인된 예:
- Q1: `2026년도 1분기 연차유지 지출(연구부서 유지 의사 확인 건).xlsx`
- Q2: `2026년도 2분기 연차유지 지출(연구부서 납부).xlsx`

핵심 열:
- `관리번호`
- `사용예산코드`
- `사용예산명`

### 기술사업화그룹 조사파일
파일명에 `연차유지`와 `기술사업화그룹`이 들어가는 XLSX.

확인된 예:
- Q1: `2026년도 1분기 연차유지 지출(기술사업화그룹 납부 대상).xlsx`
- Q2: `2026년도 2분기 연차유지 지출(기술사업화그룹).xlsx`

이 파일에 존재하는 관리번호는 조사파일 내부 `사용예산코드` 값과 무관하게 **지식재산권준비금**으로 처리한다. 준비금 예산코드는 **연도별**이다.

| 청구 연도 | 준비금 코드 | 근거 |
|---|---|---|
| 2025 | `25841004` | 2025Q4 골든 |
| 2026 | `26841001` | 2026Q1/Q2 골든 |

구현: `mapping.prep_budget_code(year)` / `PREP_BUDGET_CODES_BY_YEAR`. 두 코드 사이에 도출 가능한 숫자 패턴이 없으므로 미등록 연도는 추측하지 않고 명시적 오류로 중단한다. 새 연도는 실물 확인 후 테이블에 추가하거나 budget master로 공급한다.

실제 Q1/Q2/2025Q4 기술사업화그룹 파일의 `사용예산코드` 열은 비어 있다. (2025Q4 국내 최종 골든에만 예산명이 `지식재산권 준비금`으로 공백이 들어간 수기 편차가 있다. 데이터/폴더 표준은 공백 없는 `지식재산권준비금`이다.)

### 지출금액
예산별 지출로 넘기는 금액. **수수료가 아니라 관납/현지비용 본체만** 의미한다.

- 국내: `현지비용(KRW)` = 국내 PDF의 관납료에 대응
- 해외: `현지비용(KRW)`

당사수수료, 부가세, 송금수수료를 포함하지 않는다.

---

## 4. 입력 파일 탐색 규칙

### 4.1 현재분기 입력 폴더
기본 입력은 6개이다.

1. `E0259-INV-...-국내.pdf`
2. `E0259-INV-...-국내.xlsx`
3. `E0259-INV-...-해외.pdf`
4. `E0259-INV-...-해외.xlsx`
5. 연구부서 조사 XLSX
6. 기술사업화그룹 조사 XLSX

현재분기 조사 XLSX를 찾을 때 **`납부`라는 단어를 필수로 요구하면 안 된다.** Q1 연구부서 파일명에는 `납부`가 없기 때문이다.

분류 규칙(v0.5.1 확장, `core.mapping_file_kind`):

- 제외 우선: 파일명에 `E0259-INV`, `수수료`, `과제 `(공백 포함)가 있으면 제외 — 청구 원본/증빙/예산별 산출물 오인식 방지
- 주제 토큰: `연차` 또는 `특허` 중 하나 이상 — `연차유지`(2026), `연차관리`(2025Q4 통합목록), `(연구부서납부 특허)`류 축약 표기를 모두 포괄
- 소속 토큰: `연구부서` → research, `기술사업화` → tech (`기술사업화그룹`뿐 아니라 `기술사업화납부` 등 '그룹' 생략 표기 포함)

확인된 실물 파일명 예:
- 2026Q1 연구: `...연차유지 지출(연구부서 유지 의사 확인 건).xlsx` (`납부` 없음 — 필수 요구 금지)
- 2026Q2 기술: `...연차유지 지출(기술사업화그룹).xlsx`
- 2025Q4: `__연구부서_납부_특허_연차관리_목록_통합_1_4분기_.xlsx`
- 2026Q3: `연구부서납부 특허.xlsx`, `기술사업화납부 특허.xlsx` (연/분기 토큰이 없어도 current period는 invoice에서 확정)

### 4.2 history 폴더
과거분기에 조사했지만 현재분기에 지출되는 건이 존재하므로 history는 선택이 아니라 사실상 필수 기능이다.

history 폴더는 재귀 탐색하되 **조사파일만** 사용한다. 예산별 산출 XLSX, 수수료 XLSX, 마크프로 청구 XLSX가 history 매핑에 섞이면 안 된다.

확인된 Q2 carry-over:

| 현재 지출 관리번호 | 현재분기 조사파일 | 과거 출처 | 예산코드 | 예산명 |
|---|---|---|---|---|
| `P190114KR` | 없음 | 2026Q1 연구부서, 실제 행 6 | `25571009` | `(5세부-주관) 센서, 액추에이터 모듈화를 위한 통합 시스템 개발 및 실증` |
| `P150159KR` | 없음 | 2026Q1 연구부서, 실제 행 36 | `26021013` | `양자소재 성능평가 플랫폼 구축` |

따라서 이 2건은 하드코딩/수동보정 항목이 아니다. **일반적인 과거분기 조회 결과**여야 한다.

### 4.3 budget master (v0.5.0 신설, `--budget-master <xlsx|folder>`)
조사자료 밖에서 확정되는 예산을 공급하는 공식 입력이다. 두 부류를 처리한다.

1. 외부 확정: 조사행이 있으나 예산이 빈 건(EXPLICIT_UNASSIGNED), 조사파일 어디에도 없는 건(MISSING)에 대해 부서 회신 등으로 확정된 예산
2. 사후 예산변경: 조사값과 다른 예산으로 최종 지출되는 P190141KR류 교체 건

형식: XLSX, 헤더명 기반 3열 — `관리번호`(또는 `고객관리번호`) / `예산코드`(또는 `사용예산코드`) / `예산명`(또는 `사용예산명`). 코드나 명이 비었거나 `#N/A`/`0`인 행은 무시한다(master는 절대 차단하지 않는다). 폴더를 주면 하위 `*.xlsx`를 재귀 수집하며, 같은 관리번호에 서로 다른 값이 있으면 중단한다.

실증: 2025Q4 골든의 백업 파일(`(백업)..._예산추가.xlsx`)과 예산별 XLSX 표시행에서 추출한 master로 93/93 전건 매핑, 전 예산 그룹의 건별 소속이 골든과 완전 일치함을 검증했다. v0.6부터 동일 입력을 GUI의 **확정 예산 master** drag-and-drop lane에서도 공급할 수 있다.

---

## 5. 예산 매핑 알고리즘

### 5.0 budget master 최우선
master에 M이 있으면 그 값을 쓴다. 조사값을 덮어쓰고, 명시적 미배정 블록도 해제한다. master 행은 사용자가 확정한 최종 결정이기 때문이다. audit의 `mapping_source`는 `budget_master`로 남는다.

### 5.1 현재분기 우선
관리번호 M에 대해:

1. 현재 연구부서 파일에 M이 있고 `사용예산코드`와 `사용예산명`이 모두 존재하면 그 값을 사용한다.
2. 현재 기술사업화그룹 파일에 M이 있으면 지식재산권준비금(연도별 코드, §3)을 사용한다.
3. 현재 연구부서와 기술사업화그룹 양쪽에 M이 동시에 존재하면 자동 결정하지 말고 충돌로 중단한다.

### 5.2 “현재 파일에 존재하지만 예산이 빈 것”과 “현재 파일에 없는 것”을 구분
이 구분은 매우 중요하다.

Q1 골든에는 `P190081KR`이 연구부서 조사파일에 존재하지만 `사용예산코드/사용예산명`이 모두 비어 있다.

Q1 결과:
- 원 청구 금액: 94,000원
- 지출예산 구분 XLSX에서 A:D가 비어 있음
- `사용예산(지출금액)`도 비어 있음
- 예산별 폴더가 생성되지 않음
- 지출금액 SUBTOTAL에서 제외됨

Q1 국내 원 청구 관납료 총액 `28,154,850`원과 배정된 지출금액 `28,060,850`원의 차이 `94,000`원이 정확히 이 건이다.

따라서 **현재 연구부서 파일에 존재하지만 예산이 빈 행은 “미발견”이 아니다.** 코드에서는 `EXPLICIT_UNASSIGNED` 상태로 구분한다.

안전 규칙:
- 현재분기에 명시적으로 예산이 비어 있으면 과거분기 예산을 자동 재사용하지 않는다.
- 기본 실행은 중단하고 검토파일을 남긴다.
- 사용자가 의도적으로 보류 건을 제외한 부분 산출을 원할 때만 `--allow-unassigned` 사용.

### 5.3 과거분기 조회
현재분기 연구/기술사업화 파일 **어디에도 관리번호가 없을 때만** history를 사용한다.

검색 순서:
1. **현재분기 기준은 invoice 파일명에서 확정한 `(연도, 분기)`를 사용**한다. 현재 조사파일명이 `연구부서납부 특허.xlsx`처럼 짧아도 `mapping_source_period`는 현재 invoice 분기로 기록한다.
2. history 파일명에서 `(연도, 분기)` 추출
3. 가장 최근 과거분기부터 역순
4. 같은 분기에서는 연구부서/기술사업화그룹 여부를 확인
5. 연구부서의 유효 예산이 있으면 사용
6. 연구부서에 존재하지만 예산이 비어 있으면 그 시점에서 `EXPLICIT_UNASSIGNED`로 정지. 더 오래된 예산을 되살리지 않음
7. 기술사업화그룹에 존재하면 준비금으로 사용

동일 과거분기에 연구부서와 기술사업화그룹 양쪽에 있으면 충돌로 검토한다.

### 5.4 예산 값 정규화
- 예산코드는 **문자열**로 처리. Excel 숫자 `26021013.0`은 `26021013`으로 정규화.
- 예산명은 앞뒤 공백만 제거.
- 예산명 내부의 이중 공백은 보존. 예: `X-ray 3D  현미경장비 개발`.

---

## 6. 청구 XLSX 구조와 변환

### 6.1 템플릿 차이
마크프로 XLSX 열 수는 분기마다 달라질 수 있다. 위치 기반으로 읽지 말고 헤더명으로 찾는다.

확인된 Q1 국내 원형(수수료 사본에서 확인): 18열  
확인된 Q2 국내 원본: 19열 (`비고` 추가 등)

확인된 Q1 해외 원형: 22열  
확인된 Q2 해외 원본: 21열

필수 헤더는 최소:
- `고객관리번호`
- `현지비용(KRW)`

그 외 열은 가능한 원본 순서/스타일을 유지한다.

### 6.2 앞쪽 4열 삽입
원본 XLSX의 A:D 앞에 새 4열을 삽입한다.

Q2-current 기준 헤더:
1. `지출발의 적요 ` (국내 골든에는 뒤 공백이 존재할 수 있음)
2. `사용예산(지출금액) `
3. `예산코드`
4. `예산명`

해외 Q2는 앞 두 헤더의 뒤 공백이 없는 버전이다. 코드 로직에서는 헤더 비교 시 공백을 무시하되, 출력 텍스트는 current profile을 따른다.

### 6.3 행별 입력
매핑 성공 행:
- A: 지출발의 적요
- B: `현지비용(KRW)` 정수
- C: 예산코드 문자열
- D: 예산명

명시적 미배정 또는 허용된 미매핑 행:
- A:D 공란 유지
- 원본 청구 데이터 열은 그대로 유지

### 6.4 지출발의 적요 - 현재(Q2) 규칙
국내:

`{연도}년 {분기}분기({예산명}) 과제 국내특허 연차유지료`

해외:

`{연도}년 {분기}분기({예산명})과제 해외특허 연차유지료`

공백 차이는 실제 포털 적요와 파일명에 영향을 주므로 임의로 통일하지 않는다.

### 6.5 q1-legacy 공백 규칙과 적용 분기
q1-legacy는 Q2와 반대다.

- 국내: `...)과제 국내특허...`
- 해외: `...) 과제 해외특허...`

**2025Q4 골든이 정확히 q1-legacy 규칙이다** (2025Q4 대조에서 `--profile q1-legacy`로 적요 수식 완전 일치 확인). 미래분기 출력은 특별 지시가 없으면 Q2 규칙을 쓰되, 과거 분기 재현이나 실물이 legacy 규칙일 때는 profile로 전환한다. 공백 하나가 포털 적요와 파일명에 그대로 반영되므로 임의 통일 금지.

### 6.6 지출금액 합계행
원본 마지막 합계행과 같은 물리 행에:
- A = `지출금액`
- B = `SUBTOTAL(9,B2:B{마지막데이터행})`

왜 `SUM`이 아니라 `SUBTOTAL(9,...)`인가:
- 예산별 XLSX는 같은 전체 데이터에 필터만 적용한다.
- 필터 후 B 합계가 해당 예산의 보이는 행만 합산되어야 한다.

골든 검증:
- Q1 국내 X-ray 3D 예산 사본: B136 = 265,000, formula `SUBTOTAL(9,$B$2:$B$135)`
- Q2 예산 사본도 동일한 SUBTOTAL 방식.

### 6.7 AutoFilter
예산별 XLSX는 행 삭제 방식이 아니다.

- 모든 청구 데이터 행 유지
- `예산명`(삽입 후 4번째 열)에 필터 조건 설정
- 다른 예산 행은 숨김 상태
- SUBTOTAL은 필터 결과를 반영

최신 Q2 골든은 필터 범위에서 합계행을 제외한다. Q1 국내 base 파일에 합계행까지 포함한 레거시 불일치가 있으나 이를 새 규칙으로 따라 하지 않는다.

---

## 7. 예산별 그룹 생성

그룹 키는 `(예산코드, 예산명)`이다. 같은 예산명에 서로 다른 예산코드가 존재한다면 하나로 합치지 말고 충돌/별도 그룹 여부를 검토해야 한다. 포털은 예산코드가 실질 키이기 때문이다.

Q2 골든:
- 국내 110건 -> 23개 예산 그룹
- 해외 34건 -> 8개 예산 그룹

Q1 골든:
- 국내 134건 중 배정 133건 -> 30개 예산 그룹 + 미배정 1건
- 해외 25건 -> 5개 예산 그룹

---

## 8. 예산별 XLSX 파일명과 폴더명

### 8.1 Q2-current 파일명
국내:

`{연도}년 {분기}분기({예산명}) 과제 국내특허 연차유지료.xlsx`

해외:

`{연도}년 {분기}분기({예산명})과제 해외특허 연차유지료.xlsx`

PDF:

`{예산명}.pdf`

### 8.2 Windows 금지문자 처리
데이터 내부 예산명은 바꾸지 않는다. 파일/폴더명만 안전화한다.

골든에서 확인된 `/` 처리:
- 데이터: `고신뢰성 장비/공정 해석 ...`
- 폴더/파일: `고신뢰성 장비공정 해석 ...`

따라서 `/`와 `\`는 **삭제**한다.

기타 Windows 금지문자 `< > : " | ? *`는 `_`로 치환하고, 끝의 점/공백은 제거한다.

내부 공백/이중 공백은 보존한다.

---

## 9. PDF 예산별 표기 규칙

### 9.1 원본 유지
예산별 PDF는 관련 페이지만 뽑는 파일이 아니다.

- 마크프로 원본 PDF의 **전체 페이지를 유지**
- 해당 예산에 속한 상세행에만 추가 표기
- 표지, 다른 상세행, 납부증빙/송금증빙 페이지는 원본 유지

Q1 국내 골든은 원본 84페이지 전체를 예산별 PDF에서도 유지한다.

### 9.2 대상 식별
Excel의 `고객관리번호`를 PDF 상세 페이지에서 검색한다.

정상 조건:
- 전체 PDF에서 관리번호가 정확히 1회 검색됨
- 검색된 페이지에서 해당 건의 `현지비용(KRW)`을 천단위 콤마 형식 문자열로 찾을 수 있음

예: Excel 353000 -> PDF 검색 문자열 `353,000`.

같은 금액이 페이지 내 여러 건에 존재할 수 있으므로 **관리번호가 속한 행의 수직 범위 안**에서 금액을 다시 찾는다. 가장 왼쪽의 금액 hit를 현지비용으로 선택하는 현재 방식은 Q1/Q2 템플릿에서 유효하다.

### 9.3 빨간 행 테두리
골든의 실제 색상:
- RGB: approximately `(229, 34, 55)`
- HEX: `#E52237`
- 선 두께: 약 `1 pt`

Q1/Q2 골든의 PDF 작성툴은 이 테두리를 내용 없는 FreeText annotation의 appearance stream으로 만들었지만, 자동화는 시각 결과가 동일하면 Rectangle/Square annotation을 사용해도 된다.

행 테두리 범위:
- 좌우: 상세 표 본문 전체 폭
- 위아래: 해당 레코드의 행 경계
- Q1/Q2는 점선/실선 가로 구분선이 있으므로 관리번호 y 중심을 기준으로 위/아래 경계선을 찾는다.

고정 페이지 번호를 하드코딩하지 않는다.

행 경계 탐지는 2단계다(v0.4.1).
1. 기본: 검정 가로 규칙선(점선 우선) 기반 — Q1/Q2 및 2025Q4 해외 템플릿
2. 보정: 선 기반 경계 안에 **다른 건의 관리번호 anchor**가 포함되면(건 사이 구분선이 없는 템플릿, 최초 사례 2025Q4 국내) 관리번호 컬럼 anchor(정규식 `[PD]\d{6}[A-Z]{2}`, 같은 컬럼 x±30pt) 기준으로 자기 anchor ~ 다음 anchor 직전으로 재계산한다. 보정 후에도 타 건이 포함되면 §9.5대로 `row_bounds_error` 보고. report에 `row_source`(rule-lines/anchors)를 남긴다.

2025Q4 골든 대조: 골든의 건별 박스(FreeText, 2pt)와 anchor 보정 산출(Square, 1pt)의 좌표가 ±3pt 내 일치. 테두리 두께는 분기별 수기 편차(Q1/Q2 1pt, 2025Q4 2pt)로 판단하며 자동화 기본은 1pt를 유지한다.

### 9.4 금액 형광표시
- Annotation subtype: Highlight에 해당하는 시각 효과
- 색상: `#FFFF00`
- 대상: 해당 행의 현지비용/관납료 숫자 텍스트만
- 합계/수수료 금액은 표시하지 않음

골든 Q2 바이오의료측정본부 예: `P150141KR`, 353,000원에 노란 highlight + 행 전체 빨간 테두리.

### 9.5 PDF 실패 시 정책
다음이면 자동 저장 후 넘어가지 말고 실패 보고:
- 관리번호 0회 검색
- 관리번호 2회 이상 검색
- 같은 행에서 금액 검색 실패
- 행 경계를 합리적으로 찾을 수 없음

`pdf_mark_report.json`에 관리번호, 페이지, 검색 금액, row box, amount box, 상태를 남긴다.

---

## 10. 수수료 XLSX 규칙

수수료 증빙은 원본 청구 XLSX의 데이터 구조를 유지하고 특정 열의 글씨색만 파란색으로 바꾼다.

파란색:
- RGB `(0,112,192)`
- HEX `#0070C0`
- OOXML 출력에서는 `styles.xml`의 font color를 `rgb="FF0070C0"`로 기록한다.

대상은 **헤더부터 합계행까지 전체 사용범위**이다.

### 국내 납부 수수료
파란색 열:
- `당사수수료(KRW)`
- `부가세`

포털/지출액:
- `당사수수료(KRW) 합계 + 부가세 합계`

### 해외 납부 수수료
파란색 열:
- `당사수수료(KRW)`
- `부가세`

지출액:
- 두 합계의 합

### 해외 송금 수수료
파란색 열:
- `송금수수료`

지출액:
- `송금수수료` 합계

골든 금액:

| 분기 | 국내 수수료+VAT | 해외 수수료+VAT | 해외 송금수수료 |
|---|---:|---:|---:|
| 2026Q1 | 1,683,000 | 4,720,525 | 197,872 |
| 2026Q2 | 1,382,700 | 6,471,639 | 159,469 |

---

## 11. 수수료 PDF 규칙

원본 전체 PDF를 복사하고 표지(첫 페이지)의 해당 청구내역에 주황색 사각형을 추가한다.

골든 스타일:
- RGB `(255,85,0)`
- HEX `#FF5500`
- 선 두께 `3 pt`
- Square/Rectangle annotation 시각 효과

### 국내 납부 수수료
첫 페이지에서 `당사수수료`부터 `수수료소계`까지 수수료 블록을 감싼다.

### 해외 납부 수수료
첫 페이지에서 `당사수수료`부터 `수수료소계`까지 수수료 블록을 감싼다.

### 해외 송금 수수료
첫 페이지 `송금수수료` 행만 감싼다.

좌표를 분기별 절대값으로 하드코딩하기보다 기준 문구의 PDF 텍스트 좌표에서 계산한다.

---

## 12. Q2-current 패키지 구조

미래 분기 기본 구조는 Q2를 따른다.

```text
2. 수수료납부/
  YYYY년 Q분기 국내 특허 연차유지료 납부 수수료/
    ...pdf
    ...xlsx
  YYYY년 Q분기 해외 특허 연차유지료 납부 수수료/
    ...pdf
    ...xlsx
  YYYY년 Q분기 해외 특허 연차유지료 송금 수수료/
    ...pdf
    ...xlsx

3. 연차유지료 납부/
  0. 마크프로 청구/
    원본 국내 PDF/XLSX
    원본 해외 PDF/XLSX
  1. 국내/
    원본 국내 PDF
    E0259-...-국내_지출예산 구분.xlsx
    지출예산 구분 원본파일/
      E0259-...-국내_지출예산 구분.xlsx
    {예산명}_(완료)/ 또는 {예산명}/
      {예산명}.pdf
      YYYY년 Q분기({예산명}) 과제 국내특허 연차유지료.xlsx
  2. 해외/
    ... 동일 구조 ...
  현재분기 연구부서 조사파일.xlsx
  현재분기 기술사업화그룹 조사파일.xlsx
```

`Thumbs.db`는 Windows 탐색기 부수파일이며 자동화에서 만들지 않는다.

### 완료 표기
Q2-current:
- 포털 완료: `{예산명}_(완료)`
- 미완료: `{예산명}`

Q1의 `_완료`는 legacy 표기이며 미래 출력 기본값이 아니다.

---

## 13. `지출예산 구분 원본파일`의 의미

Q2 ZIP에는 각 국내/해외 영역에 `지출예산 구분 원본파일` 사본이 있다.

의도:
- 내부 조사파일에서 최초 도출된 예산 매핑을 보존
- 이후 외부 정보 또는 포털 처리 과정에서 예산코드가 수정되더라도 원도출 결과를 추적 가능

Q2에서 실제로 국내 원본파일과 최종파일을 셀 단위 비교하면 **단 1개 셀만 다르다.**

- 관리번호: `P190141KR`
- 행: 55
- 열: C (`예산코드`)
- 원본파일/현재 연구부서 자료: `25102108`
- 최종 base 및 예산별 XLSX: `26102079`
- 예산명은 동일: `멀티노드 양자 네트워크를 위한 온칩 시각동기화 공동연구실`

제공된 Q1/Q2 조사파일 어디에서도 `26102079`의 근거를 찾을 수 없다. 따라서 이 값은 현재 입력 6개+Q1 history만으로 **자동 추론하면 안 되는 외부 후처리 보정**으로 분류한다.

이런 외부 갱신은 v0.5.0부터 **budget master 입력으로 정식 처리한다**(§4.3). 원천자료가 없으면 여전히 자동 추론 금지이며, deviation으로만 기록한다(§32).

---

## 14. Q1 골든에서 확인된 명시적 미배정 사례

`P190081KR`:
- Q1 국내 청구 행 16
- 등록번호 `10-2202941-00-00`
- 현지비용/관납료 94,000원
- Q1 연구부서 조사파일에는 존재
- `사용예산코드`, `사용예산명` 공란

결과:
- 지출예산 구분 XLSX A:D 공란
- 예산별 폴더 없음
- 지출 SUBTOTAL에서 제외

이 사례 때문에 `MISSING`과 `EXPLICIT_UNASSIGNED`를 코드에서 분리한다.

---

## 15. 검증 불변식

파일 생성이 끝났다고 성공으로 간주하기 전에 최소 다음을 검사한다.

### 15.1 관리번호 커버리지
`invoice_items = resolved + explicit_unassigned + missing`

중복 없이 정확히 분해되어야 한다.

### 15.2 예산별 건수
각 예산 그룹:
- filtered XLSX에서 보이는 관리번호 집합
- PDF에 빨간 테두리가 추가된 관리번호 집합
- manifest의 `management_numbers`

세 집합이 동일해야 한다.

### 15.3 예산별 금액
각 예산 그룹:
- manifest amount
- filtered XLSX의 SUBTOTAL
- 그룹 관리번호의 `현지비용(KRW)` 합

동일해야 한다.

### 15.4 전체 지출금액
`assigned_spend_total + explicit_unassigned_spend + missing_spend = invoice_spend_total`

모두 매핑된 Q2에서는 assigned가 invoice와 같아야 한다.

Q1 국내 골든에서는:
- invoice 28,154,850
- assigned 28,060,850
- explicit unassigned 94,000

### 15.5 수수료
- 국내 service = 당사수수료(KRW) total + VAT total
- 해외 service = 당사수수료(KRW) total + VAT total
- 해외 wire = 송금수수료 total

### 15.6 PDF
각 resolved management number마다 정확히 1개의 `ok` 기록 필요.

---

## 16. 포털용 manifest 계약

Python 엔진이 업무판단을 끝낸 뒤 Tampermonkey는 다시 엑셀을 해석하지 않는다.

예산 job 최소 필드:
- `job_id`
- `job_type = budget`
- `scope = domestic|overseas`
- `budget_code`
- `budget_name`
- `description`
- `amount`
- `item_count`
- `management_numbers[]`
- `pdf_relpath`
- `xlsx_relpath`
- `folder_relpath`
- `status`
- `portal_result`

수수료 job도 동일한 파일 경로/금액 계약을 사용하되 budget_code는 비울 수 있다.

Tampermonkey 성공 후 localhost bridge의 `/api/status`에 `completed`를 기록한다. `finalize`는 completed인 예산 폴더만 `_(완료)`로 바꾼다.

---

## 17. localhost bridge 보안 원칙

- `127.0.0.1`에만 bind
- 실행 때 생성된 토큰 필요
- 파일 경로는 package 디렉터리 밖으로 탈출하지 못하도록 resolve 검사
- 외부 서버로 내부 문서를 업로드하지 않음
- Tampermonkey `@connect`도 localhost만 허용하는 구성이 바람직

포털 DOM이 바뀌더라도 Excel/PDF 업무엔진은 수정하지 않고 Tampermonkey selector 계층만 수정하는 것이 설계 목표다.

---

## 18. 에러 처리 정책

### 즉시 중단
- 현재 연구/기술사업화 중복 관리번호
- 관리번호 컬럼 없음
- `현지비용(KRW)` 컬럼 없음
- PDF 관리번호 0/2+ hit
- PDF 금액 hit 실패
- 생성 파일 저장 실패
- history에도 없는 관리번호(기본값)
- 명시적 미배정(기본값)

### 선택적 부분 산출
- `--allow-unassigned`: 명시적 미배정 행을 예산별 출력에서 제외하고 base XLSX에는 공란으로 남김
- `--allow-missing`: 조사파일 어디에도 없는 행까지 부분 산출. 일반 업무에서는 권장하지 않음

부분 산출 시 반드시 CSV/validation에 금액과 관리번호를 남긴다.

---

## 19. 다른 AI가 유지보수할 때의 조사 순서

1. 새 골든 ZIP을 복사해 별도 디렉터리에 풀기
2. 파일 트리 비교
3. 원본/최종 `지출예산 구분.xlsx`의 셀 값 비교
4. 관리번호별 예산코드/예산명 출처 추적
5. per-budget XLSX의 AutoFilter Field/Criteria와 SUBTOTAL formula 검사
6. PDF를 렌더하고 annotation/diff 확인
7. 수수료 XLSX font RGB 확인
8. 포털 DOM 변경이면 `PORTAL_HANDOFF.md`의 selector만 수정
9. 코드 변경 후 Q1/Q2 golden facts가 깨지지 않는지 회귀검증
10. 새 예외가 발견되면 **하드코딩부터 하지 말고**, 외부 입력원/일반 규칙인지 먼저 판정

---

## 20. 골든 PDF 스타일을 조사하는 재현 명령 예시

```python
# PyMuPDF로 annotation/geometry 조사 (환경 독립)
import pymupdf
doc = pymupdf.open("target.pdf")
for pno, page in enumerate(doc):
    for a in page.annots() or []:
        print(pno+1, a.type[1], a.rect, a.colors, a.border)
page.get_pixmap(dpi=180).save("p.png")  # 시각 확인
```

PDF 수정 후:

```bash
pymupdf 렌더 두 장을 픽셀 diff (또는 §20의 조사 스니펫 재사용)
```

바이트 단위 PDF 비교는 annotation UUID/수정일 때문에 의미가 낮다. 시각 diff + 대상 관리번호/annotation geometry를 비교한다.

---

## 21. XLSX/OOXML 유지보수 원칙 (v0.3)

역사적으로 v0.3~v0.6.1은 Microsoft Excel COM 의존성을 제거하고 `xlsx_ooxml.py`로 업무 XLSX를 직접 수정했다. **이 설명은 현재 운영정책이 아니다.** v0.6.3부터 해당 구현은 `portable-legacy` 개발/회귀 backend이며 실제 업무 XLSX는 §0의 Excel Native 정책을 따른다.

### 21.1 왜 workbook 전체를 새로 만들지 않는가
마크프로 원본에는 이미 열 너비, 행 높이, 셀 스타일, 인쇄 설정, 페이지 설정, 정렬, 숫자형식 등이 들어 있다. 이를 범용 라이브러리로 새 workbook에 복제하면 시각/기능적 차이가 생길 수 있다. v0.3은 **원본 XLSX를 ZIP으로 열어 기존 파트를 보존하고 필요한 XML만 최소 패치**한다.

주요 변경 파트:
- `xl/worksheets/<first sheet>.xml`: A:D 삽입, 원본 셀 참조 +4 이동, AutoFilter/hidden row/SUBTOTAL 갱신
- `xl/styles.xml`: 수수료 증빙에서만 파란 font/style 복제
- `xl/workbook.xml`: 재계산 플래그 설정
- `xl/_rels/workbook.xml.rels`, `[Content_Types].xml`: stale `calcChain.xml` 관계 제거

그 외 XLSX ZIP entry는 가능한 원본 bytes와 metadata를 유지한다.

### 21.2 원본 열 4칸 이동
A:D를 삽입한 효과를 OOXML에서 재현하기 위해 원본 셀의 `r` 주소, formula A1 reference, merge/ref/sqref류 속성을 +4열 이동한다. 수식 내 따옴표 문자열은 주소 치환에서 제외한다. 이 구현은 Q1/Q2에서 관찰한 수식 vocabulary를 기준으로 한다.

**새 템플릿에 structured reference, table, pivot, external link, drawing anchor가 추가되면 즉시 골든 회귀를 먼저 추가하고 이동 대상 XML을 확장해야 한다.** 임의로 전체 파일을 다시 저장하는 방식으로 우회하지 않는다.

### 21.3 계산식과 cached value
자동화는 Excel이 설치되지 않은 환경에서도 포털/미리보기에서 값이 보이도록 formula와 cached `<v>`를 함께 기록한다.
- A열 적요: formula + cached 문자열
- B열 지출금액: 원본 현지비용 셀 참조 formula + cached 정수
- 합계 B: `SUBTOTAL(9,B2:B{data_end})` + 현재 보이는 그룹 합계 cached value

workbook에는 `calcMode=auto`, `fullCalcOnLoad=1`, `forceFullCalc=1`을 설정하고 stale calcChain을 제거한다. 실제 Excel로 열면 Excel이 다시 계산할 수 있다.

### 21.4 AutoFilter와 hidden row가 둘 다 필요한 이유
골든의 예산별 파일은 행을 삭제하지 않고 전체 데이터를 유지한다. v0.3은:
1. `autoFilter ref=A1:<lastcol><data_end>`
2. 예산명 열(`D`, zero-based filter `colId=3`)에 criteria 기록
3. 다른 예산의 데이터 row에 `hidden=1`
4. 마지막 합계행은 visible
5. SUBTOTAL cached value를 해당 예산 금액으로 갱신

한다. GUI나 포털이 Excel calculation engine 없이 파일을 읽어도 현재 필터 상태와 합계가 의미 있게 보이도록 하기 위함이다.

### 21.5 스타일 ID는 골든과 같을 필요가 없다
수수료 XLSX에서 기존 font를 복제해 `#0070C0`만 적용하므로 새 font/style ID는 골든과 다를 수 있다. 회귀검증은 style ID가 아니라 **실제 font RGB와 대상 열 범위**를 비교한다.

### 21.6 유지보수 금지사항
- `pywin32` 또는 Excel 설치를 필수 런타임으로 다시 추가하지 않는다. 필요하면 별도 optional backend로 설계한다.
- `openpyxl`/기타 라이브러리로 사용자 workbook을 전체 재저장하는 우회는 골든 검증 없이 도입하지 않는다.
- 열 번호를 하드코딩하지 말고 `고객관리번호`, `현지비용(KRW)` 등 헤더명으로 원본 열을 찾는다.
- 현재 `xlsx_ooxml.py`는 완전한 Excel 엔진이 아니다. 새로운 OOXML feature를 지원할 때는 먼저 실패하는 골든 테스트를 추가한다.

세부 구현은 §37(OOXML 엔진 세부)을 본다.

---

## 22. 현재 코드가 의도적으로 자동 추론하지 않는 것

1. 외부에서 갱신된 예산코드
   - 대표 사례 `P190141KR`의 `25102108 -> 26102079`
2. 포털의 실제 DOM selector
3. 사용자가 아직 확정하지 않은 포털 저장/승인 클릭 순서
4. 예산 미배정 행을 강제로 준비금에 넣는 것
5. history가 없는데 관리번호와 이름 유사도로 예산을 추측하는 것

특히 4, 5는 절대 금지. 잘못된 예산 지출은 조용한 자동오류보다 중단이 낫다.

---

## 23. 확인된 골든 수치 요약

### 2026Q1
- 국내 청구 134건
- 국내 배정 133건
- 국내 명시적 미배정 1건 (`P190081KR`, 94,000원)
- 국내 배정 지출합계 28,060,850원
- 국내 원 관납료 합계 28,154,850원
- 국내 예산그룹 30
- 해외 25건, 전부 배정
- 해외 현지비용(KRW) 24,751,007원
- 해외 예산그룹 5

### 2026Q2
- 국내 110건
  - 현재 연구부서 54
  - 현재 기술사업화그룹 54
  - 2026Q1 history 연구부서 2 (`P190114KR`, `P150159KR`)
- 국내 지출합계 25,180,670원
- 국내 예산그룹 23
- 해외 34건
  - 현재 연구부서 11
  - 현재 기술사업화그룹 23
- 해외 현지비용(KRW) 33,817,584원
- 해외 예산그룹 8

---

## 24. 유지보수 완료 조건

다른 AI/개발자가 수정 후 “완료”라고 말하려면 최소:

- Python syntax/compile 통과
- Q1 history 파일명이 연구부서로 인식됨
- Q2의 `P190114KR`, `P150159KR`이 하드코딩 없이 Q1 history에서 해소됨
- Q1의 `P190081KR`이 `MISSING`이 아니라 `EXPLICIT_UNASSIGNED`로 분류됨
- Q2 관리번호/금액/그룹 수 불변식 충족
- 예산 PDF 빨강/노랑 표시 시각검증
- 수수료 PDF 주황 box 시각검증
- 수수료 XLSX 대상 열 `#0070C0`
- `P190141KR` 외부보정 문제를 조용히 임의 추론하지 않음
- 변경사항을 `CHANGELOG.md`에 기록


## 25. 코드/문서 탐색 지도

다른 AI가 이 프로젝트를 처음 인수할 경우:

- 업무 규칙·아키텍처·코드지도·OOXML·GUI·골든 편차: 이 문서(`docs/MAINTAINER_SPEC.md`) 단일본 — §31 골든 사실, §32 편차, §33 빠른 참조, §34 한계/실패 모드, §35 아키텍처, §36 코드지도, §37 OOXML 세부, §38 GUI
- 빠른 고장 진단: `docs/AI_MAINTENANCE_PLAYBOOK.md`
- 검증 기록 원문(Q2_PRECHECK/VALIDATION_2026Q2_V03/V04/TESTING): `docs/VALIDATIONS.md`
- 포털 자동화 계약: `docs/PORTAL_AUTOMATION_SPEC.md`
- 포털 DOM 근거: `docs/PORTAL_DOM_FACTS.json`
- 포털 live 상태: `docs/PORTAL_HANDOFF.md`
- 포털 정적 snapshot 검증: `docs/PORTAL_SNAPSHOT_VALIDATION_2026-08-14.json`
- 기계 판독 골든: `docs/golden/*.json`

코드 책임:
- `discover.py`: 입력 탐색
- `mapping.py`: 관리번호 -> 예산 결정
- `excel_native.py`: Windows Microsoft Excel COM 기반 운영 XLSX 생성/실제 AutoFilter/재오픈검증
- `excel_backend.py`: `auto/native/portable-legacy` 선택 및 fail-fast 정책
- `xlsx_ooxml.py`: read parser + 과거 portable-legacy 회귀 backend
- `excel_com.py`: 호환 import 표면; 현재 `ExcelSession`은 NativeExcelSession을 가리킴
- `pdf_mark.py`: PDF 표기
- `workflow.py`: 전체 workflow/manifest/finalize
- `bridge.py`: localhost API
- Tampermonkey: 포털 DOM 자동입력만

history는 이름상 history 폴더에 있다는 이유만으로 신뢰하지 않는다. **파일명에서 분기를 읽을 수 있을 때 현재분기와 같은 분기 또는 미래분기 파일은 fallback 후보에서 제외**한다. 분기를 읽을 수 없는 조사파일은 audit에 `unknown`으로 남기고 가장 마지막 fallback으로만 사용한다.

## 26. 명세 수정 원칙

코드가 골든을 맞추기 위해 바뀌면 문서도 같은 커밋/배포본에서 바꾼다.

1. 새 사실인지, 사용자 확정 규칙인지, 단순 추정인지 구분한다.
2. 새 사실은 `GOLDEN_ANALYSIS.md` 및 `golden/*.json`에 기록한다.
3. 아직 근거가 없는 차이는 `KNOWN_DEVIATIONS.md`로 보낸다.
4. 일반화된 업무 규칙만 이 `MAINTAINER_SPEC.md`에 승격한다.
5. 관리번호 1건짜리 예외를 발견했다고 바로 하드코딩하지 않는다. 먼저 history/외부 master/후처리 단계가 있는지 조사한다.


---

## 27. GUI 및 드래그앤드롭 계약 (v0.3)

GUI 진입점은 `run_gui.pyw`, 구현은 `kriss_annual_fee/gui.py`이다. 목적은 사용자가 파일명을 정확히 기억하거나 CLI를 입력하지 않고도 안전하게 입력 세트를 구성하는 것이다.

### 27.1 현재분기 드롭 영역
파일 6개를 개별로 한꺼번에 드롭하거나, 그 6개가 들어 있는 폴더 하나를 드롭할 수 있다. GUI는 다음 슬롯을 실시간 분류한다.

1. 마크프로 국내 PDF
2. 마크프로 국내 XLSX
3. 마크프로 해외 PDF
4. 마크프로 해외 XLSX
5. 연구부서 조사 XLSX
6. 기술사업화그룹 조사 XLSX

각 슬롯은 정확히 1개여야 `전체 파일 생성`이 가능하다. 0개는 `누락`, 2개 이상은 `중복`으로 표시하고 자동 선택하지 않는다.

현재분기 폴더 드롭은 **직속 파일만** 읽는다. 이는 과거 산출물/하위 폴더가 섞여 잘못 분류되는 것을 줄이기 위한 안전장치다.

### 27.2 history 드롭 영역
history는 파일 또는 폴더를 드롭할 수 있고 폴더는 재귀 탐색한다. 단, `mapping_file_kind()`가 연구부서/기술사업화그룹 조사파일로 판정한 XLSX만 채택한다. 마크프로 청구/예산별/수수료 XLSX는 GUI 단계에서부터 버린다.

### 27.3 native DnD와 fallback
`tkinterdnd2` 설치 시 Windows Explorer의 파일/폴더 drag-and-drop을 지원한다. 설치/로딩이 실패하면 프로그램 자체가 실패하지 않고 `파일 선택`, `폴더 선택` 버튼만으로 동일 기능을 제공한다.

### 27.4 staging 원칙
사용자가 여러 위치의 파일을 섞어 드롭할 수 있으므로 GUI는 실행 직전에 임시 staging directory를 만든다.
- current: 분류된 정확한 6개만 복사
- history: 채택된 조사파일만 복사
- 동명 history 파일은 `_2`, `_3` suffix를 붙여 충돌 방지
- workflow 종료 후 staging 삭제

따라서 core `discover.py`/`workflow.py`는 GUI 경로의 복잡성을 알 필요가 없다.

### 27.5 thread/UI 규칙
PDF/XLSX 생성은 Tk main thread에서 실행하면 화면이 멈추므로 worker thread에서 수행한다. worker는 Tk widget을 직접 만지지 않고 `queue.Queue`로 progress/error/result event를 main thread에 전달한다.

### 27.6 운영 옵션
GUI 기본값:
- profile: `q2-current`
- `allow-unassigned`: OFF
- `allow-missing`: OFF

두 부분 산출 옵션은 오류를 숨길 수 있으므로 일반 업무에서는 켜지 않는다.

세부 사용법은 구 `GUI.md`(v0.5.1 이전; 현 내용은 이 문서에 통합)를 본다.

---

## 28. v0.3에서 실제 수행한 Q2 골든 회귀 결과

2026Q2 6개 원본 + 2026Q1 history를 v0.3 엔진으로 처음부터 생성하여 `2분기.zip`을 의미 단위로 비교했다. 실행 도구는 `tools/regression_q2.py`이다.

검증 결과:
- 사전매핑: 국내 110/110, 해외 34/34, missing 0, explicit-unassigned 0
- history: `P190114KR`, `P150159KR` 2건이 Q1 조사파일에서 일반 규칙으로 해소
- 국내 master XLSX: 알려진 외부보정 `P190141KR` C셀을 제외하면 **값 차이 0**
- 해외 master XLSX: 의미상 **값 차이 0**
- 국내 `2-3-04. 바이오의료측정본부` filtered XLSX: 값, AutoFilter ref/criteria, hidden row 집합 **모두 일치**
- 수수료 XLSX: 대상 열 font `FF0070C0` 확인
- 바이오의료측정본부 PDF: 7건 각각 highlight + red row marker 생성. 원본에 이미 존재하던 납부증빙 annotation도 보존
- PDF golden이 red row를 FreeText annotation으로 저장한 반면 v0.3은 Square annotation을 사용한다. subtype byte-level 동일성은 요구하지 않으며 색/선두께/geometry/대상 건수가 기준이다.

현재 회귀의 유일한 warning은 구 `KNOWN_DEVIATIONS.md`(v0.5.1 이전; 현 내용은 §32에 통합)에 기록된 `P190141KR 25102108 -> 26102079`이다. 입력원에서 근거가 제공되기 전에는 warning을 없애려고 하드코딩하지 않는다.

---

## 29. Windows 배포 방식

### Python 설치형
1. `install_windows.bat`
2. `launch_gui.bat`

### 단일 EXE 빌드
Windows PC에서 `build_windows_exe.bat`를 실행한다. PyInstaller가 `tkinterdnd2`의 Tcl/Tk resource를 포함하여 `dist/KRISS_연차유지료_자동화.exe`를 만든다.

Linux에서 Windows EXE를 신뢰성 있게 cross-build하지 않는다. 이 프로젝트 ZIP에는 **재현 가능한 빌드 스크립트**를 제공하고, 실제 EXE는 업무 PC 또는 Windows CI에서 빌드하는 것을 기준으로 한다.


---

## 30. v0.4 실제 KRISS MIS 포털 계약

2026-08-14 제공된 portal DOM으로 v0.3의 selector skeleton을 실제 입력 로직으로 승격했다. 상세는 `PORTAL_AUTOMATION_SPEC.md`가 권위 문서다. 여기서는 파일생성 엔진과 결합되는 불변식만 명시한다.

### 30.1 manifest 불변식
모든 job은 `portal` dict를 가진다. top-level `portal_contract_version`은 현재 `1`이다. budget job의 `portal.budget_code/amount`는 각각 job의 `budget_code/amount`와 같아야 한다.

### 30.2 공통 portal 값
- 지출구분 표시명: `특허 출원/등록/연차료`
- 비목: `55630 / 지식재산권출원등록비`
- Markpro 사업자번호: `1168152646`
- portal 거래처코드: `200852645`
- 계좌: `기업은행 / 12007 / 221-035662-04-047`

### 30.3 budget job
- 영수증 `기타(10)`
- VAT `없음(9)`
- 지급 `계좌입금(1)`
- 사용일자 정책 `request_date`
- PDF/XLSX 2개 첨부

### 30.4 fee job
service:
- 예산 지식재산권준비금(코드는 연도별, §3 — 2025: 25841004, 2026: 26841001)
- e-tax `14`, VAT `1`, 지급 `2`
- expected total == service + VAT == job amount
- e-tax auto-confirm default false

wire:
- 같은 fee budget
- 기타 `10`, VAT `9`, 지급 `1`
- portal 적요의 `송금수수료`는 붙여 쓴다. golden 파일/폴더명의 `송금 수수료`는 바꾸지 않는다.

### 30.5 포털 이벤트 불변식
`#billKind`는 hidden value만 바꾸지 않는다. 포털 source가 Kendo `select` callback에 reset/VAT/popup/billTypeChanged/publish를 묶었으므로 Tampermonkey는 가능한 경우 그 select event를 재현한다. 행추가는 `#btnExpndtrRowInsert`를 클릭하여 portal의 `/mis/acc/checkInformation.json` validation을 거친다.

### 30.6 사람 확인 경계
- e-tax 후보가 1건이어도 승인번호 확인 후 최종 `선택`은 default manual
- portal 최종 `저장`도 default manual
- 후보 복수/총액 불일치/예산조회 실패는 자동 진행 금지

### 30.7 아직 LIVE 검증 필요
정적 DOM snapshot으로는 runtime Dropzone hidden input과 실제 popup window timing을 완전히 검증할 수 없다. 첫 운영 1건에서 `PORTAL_AUTOMATION_SPEC.md` LIVE-01~10을 수행한다.

### 30.8 유지보수 완료 조건에 추가
포털 코드를 수정했다면 최소:
- `node --check tampermonkey/kriss_portal_automation.user.js`
- Q2 prepare 후 `tools/test_portal_contract.py` 통과
- prepare run이 있으면 `tools/test_bridge_smoke.py <run_dir>` 통과
- DOM snapshot을 가진 경우 `tools/validate_portal_snapshots.py` 통과
- live portal 변경이라면 새 DOM facts/스크린캡처 근거를 문서화
- auto-save/auto-etax-select default를 몰래 true로 바꾸지 않음


---

## 31. 골든 사실 요약

### 2026Q2 (현행 형식 1차 정답)
- 국내 110건→23그룹, 해외 34건→8그룹, 전건 매핑
- carry-over 2건: P190114KR→25571009, P150159KR→26021013 (Q1 history 일반 조회로 해소)
- 외부 후처리 1건: P190141KR 25102108→26102079 (base와 최종의 유일한 셀 차이)
- 수수료: 국내 1,382,700 / 해외 6,471,639 / 송금 159,469

### 2026Q1 (legacy 형식·history 규칙 정답)
- 국내 134건(배정 133+미배정 1: P190081KR 94,000원), 해외 25건→5그룹
- invoice 28,154,850 = assigned 28,060,850 + explicit_unassigned 94,000

### 2025Q4 (q1-legacy 적요·연도별 준비금·master 실증 골든)
- 국내 53건→21그룹, 해외 40건→11그룹(기술료준비금 `22131` 유형 최초 등장)
- 조사기준 자동 매핑 65/93 일치, 외부 확정 16건 + 사후 예산변경 12건은 master 영역
- 준비금 25841004, 수수료: 국내 551,400+VAT 55,140 / 해외 6,718,560+VAT 671,856 / 송금 197,776
- 특수: P200132EU(BE) 1차/2차 분할납부(예산 상이), P200130EU(GB) 최종 `우리나라 ERC 참여 확대를 위한 NCP 활동 (2026)`(26102072) 전환 — base 매핑까지가 자동화 범위, 분할/전환은 수동
- 기계 추출 facts: `docs/golden/2025Q4_facts.json`(신규), `2026Q1_facts.json`, `2026Q2_facts.json`

---

## 32. 알려진 편차·미해결 항목 (개정 통합)

1. **P190141KR (2026Q2)**: 조사 25102108 → 최종 26102079. 근거 원천 미확보. master 제공 시 §4.3 경로로 처리, 그 전까지 자동 추론 금지.
2. **2025Q4 외부 확정 16건 + 사후 예산변경 12건**: §31 참조. 골든 백업 파일이 확정값 스냅샷. master로 재현 검증 완료. 사후 변경 예: 2-5-02·1-2-04→2-5-01 통합, 해외 2-5-02→2-5-03, 양자사이버보안(24571002)→3-1-02, 반도체식각(25201021)→4-2-11, P160084KR↔P170072KR(벌크시료↔3-4-03) 상호 교체, 준비금→기술료준비금(22131) 2건.
3. **조사파일 다중 시트**: 엔진은 첫 시트만 읽는다. 2025Q4 연구부서 파일에 `Sheet1 (P180025KR 추가)` 시트가 존재했고 두 시트의 관건 값은 동일했으나, 어느 시트가 정본인지는 자동 판단 불가 — 시트가 2개 이상이면 사람이 정본을 확인해야 한다(§34-2).
4. **패키지 형식 분기 편차**: Q1(`3. 수수료 납부`/`4. 연차유지료 납부`, `_완료`), Q2(`2. 수수료납부`/`3. 연차유지료 납부`/`0. 마크프로 청구`, `_(완료)`), 2025Q4(수기: `국내 연차료`/`해외 연차료` 평면 구조, 수수료 파일명 원본 유지). 자동화 기본은 Q2 형식이며 과거 수기 구조는 재현 대상이 아니다.
5. **준비금 표기 편차**: 2025Q4 국내 최종 base만 `지식재산권 준비금`(공백). 표준은 공백 없음.
6. **P190081KR (2026Q1)**: 명시적 미배정의 표준 사례(§14).

---

## 33. 빠른 참조 (구 RULES 개정판)

입력: 현재분기 6개(국내/해외 PDF·XLSX + 연구부서·기술사업화 조사 XLSX) + `--history`(재귀) + `--budget-master`(선택).
매핑: 0) master 최우선 → 1) 현재 연구부서 유효예산 → 2) 현재 기술사업화 → 준비금(연도별 코드 §3) → 3) 현재에 없을 때만 최신 과거분기 → 4) 조사행 있으나 예산 공란 = EXPLICIT_UNASSIGNED(정지, fallback 금지) → 5) 어디에도 없음 = MISSING.
청구 XLSX: A:D 4열 삽입, 지출금액 = `현지비용(KRW)`만(수수료/VAT/송금 금지), 합계 `SUBTOTAL(9,...)`, 예산별 사본은 행삭제가 아니라 AutoFilter+hidden.
적요: profile 규칙(§6.4~6.5). Q2: 국내 `) 과제`/해외 `)과제`, q1-legacy(=2025Q4): 반대.
PDF: 원본 전체 페이지 유지, 해당 건 빨강 `#E52237` 1.6pt + 지출금액 노랑 `#FFFF00`. 행 경계: 규칙선 → anchor 보정(§9.3).
수수료: XLSX 파랑 `#0070C0`(국내·해외: 당사수수료+부가세, 송금: 송금수수료), PDF 주황 `#FF5500` 3pt.
금지: 관리번호별 예산 하드코딩, 유사도 추측, 미배정의 조용한 과거 fallback, 행 삭제 방식, 좌표/페이지 하드코딩, 포털 DOM 이유로 파일엔진 수정.

---

## 34. 원하는 산출물이 나오지 않을 수 있는 경우 (한계·실패 모드 전수 검토, v0.5.2)

파이프라인 단계 순. "중단"은 의도된 안전 정지(잘못된 산출 방지), "위험"은 잘못된 산출이 나올 수 있어 검토가 필요한 경우다.

### 34-1. 입력 탐지
- [중단] 6개 파일 종류별 정확히 1개가 아님(누락/중복). GUI 폴더 드롭은 직속 파일만 수집하므로 하위폴더 분산 시 누락으로 보인다.
- [중단] 조사파일명이 인식 규칙 밖: (연차|특허) AND (연구부서|기술사업화) 조합이 없는 새 명명(예: "지재권 목록.xlsx").
- [중단] 청구 파일명에 `E0259-INV`/`국내`/`해외` 토큰이 없어지는 명명 변경.
- [완화됨 v0.6] current 조사파일명이 짧아도 현재 cutoff는 invoice period를 사용하므로 current/future history가 period 파싱되는 한 안전하게 배제된다. 단, **history 파일 자체**에서 분기를 읽지 못하면 unknown-period 최후순위 fallback 후보에 남으므로 history 파일명에는 연/분기 표기를 유지하는 것이 안전하다.

### 34-2. 파싱
- [위험] **조사파일 다중 시트**: 첫 시트만 읽는다. 수정본이 두 번째 시트면 조용히 무시된다(2025Q4 실사례, §32-3). 시트 2개 이상이면 사람이 정본 확인 필요.
- [중단] 필수 헤더(`관리번호`/`고객관리번호`, `현지비용(KRW)`, 조사파일의 `사용예산코드`/`사용예산명`) 명칭 변경.
- [위험] 관리번호 표기 흔들림: 앞뒤 공백만 정규화한다. `P200132EU(BE)` vs `P200132EU (BE)`처럼 내부 공백이 다르면 다른 번호로 취급된다(의도된 보수적 동작).
- [중단] 청구 파일명에서 연도/분기 추출 실패(`YYYY0QQ` 패턴 밖).

### 34-3. 매핑
- [중단] MISSING/EXPLICIT_UNASSIGNED 존재(기본값). 해소 수단: history 추가, 연구부서 빈 칸 기입, budget master. `--allow-*`는 부분 산출일 뿐 완성본이 아니다.
- [중단] 연구·기술사업화 동시 존재 충돌, master 간 값 충돌, master 필수 헤더 부재.
- [중단] 미등록 연도의 준비금 코드(예: 2027 실행) — 테이블 추가 또는 master 공급 전까지 정지.
- [원리적 한계] 조사 이후의 **사후 예산변경**(P190141KR류)과 **분할납부/과제 전환**(HFSP류)은 입력 6개에 근거가 없어 자동 산출 불가. master 갱신(변경분) + 수동 처리(분할)가 정답 경로다. 자동화 산출이 "골든과 다름" ≠ "오류"인 대표 영역.

### 34-4. XLSX 생성 (OOXML)
- [위험] 마크프로 템플릿에 Excel Table/Pivot/드로잉 anchor/구조적 참조 등 신규 요소 도입 시 +4열 이동 범위 밖 참조가 깨질 수 있음 → Excel "복구" 메시지. §37의 위험 신호 목록 참조. 새 골든 확보 후 이동 대상 확장이 정석.
- [환경] Excel 미설치 환경에서는 캐시값으로 표시된다. 재계산 플래그는 심어두므로 Excel에서 열면 재계산된다.

### 34-5. PDF 표기
- [v0.6 preflight] source를 clean serialization하여 MuPDF repair/xref/garbage 경고를 수집한다. 경고가 있으면 `_automation/normalized_sources/` 정규화본을 만들고 page count 동일성을 확인한 뒤 모든 파생 PDF가 이를 재사용한다. package에는 원본을 보존한다.
- [중단] 정규화 전후 page count가 다르면 원본 손상 가능성으로 중단한다.
- [중단] 관리번호 검색 0회(스캔 이미지 PDF, 줄바꿈 분절, 폰트 임베딩 문제) 또는 2회 이상(동일 번호 중복 기재).
- [중단] 행 범위 내 금액 문자열(천단위 콤마) 미발견 — 금액 표기 형식 변경 시.
- [중단] anchor 보정 후에도 행 경계 확정 실패(`row_bounds_error`).
- [위험] 관리번호 체계가 `[PD]+6자리+국가코드` 패턴을 벗어나면 anchor 보정이 무력화되어 규칙선 기반으로만 동작한다(구분선 없는 템플릿과 겹치면 중단으로 귀결).

### 34-6. 수수료 증빙
- [중단] 표지 기준 문구(`당사수수료`, `수수료소계`, `송금수수료`) 또는 수수료 열명 변경.
- [형식 편차] 파일명은 Q2 형식(제목형)으로 생성한다. 2025Q4 수기본처럼 원본 파일명 유지가 필요하면 별도 지시 필요.

### 34-7. 패키지·파일시스템
- [위험] **Windows 경로 길이(260자)**: 예산명이 길면 `출력경로 + 예산명 폴더 + "YYYY년 Q분기(예산명)과제..." 파일명`이 한도를 넘을 수 있다. 금지문자는 치환하지만 길이는 치환하지 않는다 — 출력 루트를 짧게 잡을 것.
- [사양] 패키지 골격은 Q2 형식 고정. 과거 수기 구조(2025Q4 평면형)는 재현하지 않는다.

### 34-8. 포털 계층
- [중단/수동] DOM/selector 변경, 세션 만료, e-tax 후보 0건 또는 다수 — Tampermonkey 계층에서 해결하며 파일 엔진은 불변. 최종 저장은 설계상 수동이다.

### 34-9. 요약: 자동화가 "정답을 낼 수 없는" 4가지 근본 원인
1. 입력에 없는 결정(외부 확정·사후 변경·분할납부) — master/수동의 영역
2. 템플릿·명명 규칙의 미래 변화 — 골든 확보 후 규칙 확장의 영역
3. 원본 데이터 자체의 모호성(다중 시트, 중복 관리번호, 동일 예산명·상이 코드) — 사람 판단의 영역
4. 실행 환경 제약(경로 길이, Excel 부재, 포털 세션) — 운영 수칙의 영역

---

## 35. 아키텍처와 데이터 흐름 (v0.6 기준)

## 1. 전체 흐름

```text
[GUI drag/drop 또는 CLI]
          |
          v
   GUI staging (GUI only)
          |
          v
[현재분기 원본 6개]      [history 조사 XLSX]      [budget master]
        |                       |                        |
        +----------+------------+------------------------+
                   v
             core.py(구 discover)
                   v
              mapping.py
        (관리번호 -> 예산/출처)
                   |
        +----------+-----------+
        |                      |
        v                      v
   xlsx_ooxml.py           pdf_mark.py
        |                      |
        +----------+-----------+
                   v
              workflow.py
        package/ + _automation/
                   |
         +---------+----------+
         |                    |
         v                    v
     bridge.py          Tampermonkey
  localhost API          portal DOM only
         |                    |
         +---------+----------+
                   v
           portal status update
                   v
              finalize()
                   v
               final ZIP
```

## 2. 설계의 가장 중요한 경계

### 업무판단과 UI를 분리한다
GUI는 파일을 모으고 실행상태를 보여줄 뿐, 예산을 결정하지 않는다. 예산 판단은 `mapping.py`에만 둔다.

### 파일생성과 포털 자동화를 분리한다
Python이 예산코드/금액/첨부파일을 확정해 `manifest.json`에 기록한다. Tampermonkey는 이 값을 포털 DOM에 옮기는 thin client로 유지한다. 포털 selector가 바뀌어도 mapping/XLSX/PDF는 건드리지 않는다.

### XLSX는 원본을 최소 패치한다
v0.3에서 한동안 Excel COM backend를 제거했으나, 실제 Excel 호환성/원본 서식 보존 실패를 거쳐 **v0.6.3에서 운영 backend로 복귀**했다. 현재 `excel_native.py`가 업무 산출을 담당하며 `xlsx_ooxml.py`는 읽기/legacy 회귀용이다.

## 3. 모듈 계약

### `gui.py`
입력: Explorer drag/drop 또는 picker
출력: 정확히 분류된 current 6개 + history 조사파일 + 실행 옵션
책임:
- 슬롯 분류/중복·누락 표시
- staging
- worker thread/progress
- bridge/finalize 편의 버튼
비책임: 예산 판단, PDF 좌표 판단, XLSX XML 규칙.

### `core.py(구 discover)`
입력: clean current directory, optional history directory
출력: `InputFiles`
책임: 공용 유틸(경로 안전화·정규화·해시·CSV), 데이터클래스(InputFiles/BudgetMapping/InvoiceItem), 파일 분류. `_지출예산 구분`, 수수료, 예산별 결과물을 invoice candidate에서 제외.

### `mapping.py`
입력: XLSX reader + current research/tech + history
출력:
- resolved mapping
- conflicts
- explicit-unassigned
- source provenance
책임: 관리번호별 예산의 우선순위와 출처.

### `xlsx_ooxml.py`
입력: 확정된 mapping rows
출력:
- base `지출예산 구분.xlsx`
- budget-filtered copies
- fee evidence workbook
책임:
- first sheet 읽기
- OOXML cell/reference shift
- 4열 삽입
- formula/cache
- AutoFilter/hidden rows
- fee font style clone
비책임: 예산 선택.

### `excel_com.py`
v0.6.3 compatibility surface. `ExcelSession`은 `NativeExcelSession`을 가리키며 실제 COM을 사용한다. `XlsxSession`은 별도 legacy/read 용도로도 export한다.

### `pdf_mark.py`
입력: 관리번호 + 지출금액 목록
출력: 원본 전체 페이지를 유지한 marked PDF + geometry report
책임:
- 관리번호/금액 text search
- record row boundary 계산
- 빨간 row marker + 노란 amount highlight
- fee orange marker
비책임: 예산 선택.

### `workflow.py`
책임:
- 전체 실행순서
- package layout/profile
- fail/allow policy
- audit/validation/manifest
- finalize

### `bridge.py`
책임:
- `127.0.0.1` manifest/file/status API
- token
- package 밖 path traversal 차단

### Tampermonkey
책임:
- manifest job 순회
- 포털 값 입력/파일 첨부/클릭
- 결과 번호/status 반환
비책임: XLSX 파싱이나 예산 추론.

## 4. 관리번호 상태 모델

```text
RESOLVED
  ├─ current_research
  ├─ current_tech
  ├─ history_research
  └─ history_tech

EXPLICIT_UNASSIGNED
  └─ 조사행 존재 + 예산코드/예산명 불완전

MISSING
  └─ current/history 어디에도 관리번호 없음

CONFLICT
  └─ 같은 우선순위에서 상충 출처 존재
```

현재분기에 연구부서 행이 존재하지만 예산이 비어 있으면 `EXPLICIT_UNASSIGNED`에서 멈춘다. 더 오래된 history를 탐색하지 않는다.

## 5. GUI staging 계층이 존재하는 이유

core `core.py(구 discover)`는 한 디렉터리 안에 정확한 입력 set이 있다고 가정하는 편이 안정적이다. 그러나 사용자는 네트워크 드라이브/다운로드/메일 폴더 등 서로 다른 경로의 파일을 섞어 드롭할 수 있다.

GUI는 임시 directory를 만들고:
- current 6개만 평탄화해서 복사
- history는 조사 XLSX만 복사
- 동명 history collision을 suffix로 해소
- 종료 후 삭제

한다. 이 계층 덕분에 GUI 입력 UX와 core parser의 규칙을 독립적으로 수정할 수 있다.

## 6. 감사 가능성

자동 판단은 최소 다음으로 역추적 가능해야 한다.

- `mapping_audit.csv`: 관리번호 → 예산 + source file/kind/period
- `validation.json`: 건수/금액 불변식
- `pdf_mark_report.json`: 페이지/row/amount geometry
- `manifest.json`: 포털에 전달한 최종 job
- `지출예산 구분 원본파일`: current/history에서 최초 도출된 결과

`P190141KR`처럼 최종 골든에서 외부 후처리가 있었던 경우 이 audit trail 때문에 “입력원 → base → final” 중 어디서 값이 달라졌는지 구분할 수 있다.


## v0.4 portal contract layer

`portal_contract.py` sits between `workflow.py` and Tampermonkey. It converts already-decided jobs into a browser-facing contract (document type, 55630 account, receipt mode, vendor, e-tax expected total). This prevents portal DOM code from becoming a second business-rule engine. See `PORTAL_AUTOMATION_SPEC.md`.


---

## 36. 코드 탐색 지도

코드를 처음 보는 유지보수자가 grep 시간을 줄일 수 있도록 “업무 질문 → 함수”를 연결한다.

## `core.py` (utils+models+discover 통합, v0.5.1)
- `mapping_file_kind(path)` — 조사 XLSX 판정: 제외(E0259-INV/수수료/`과제 `) 후 (연차|특허) AND (연구부서|기술사업화)
- 경로 안전화/정규화/해시/CSV 유틸, `InputFiles`/`BudgetMapping`/`InvoiceItem` 데이터클래스
- `discover_inputs(current_dir, history_dir)` — current 6개 + history 후보 수집

변경 신호:
- 마크프로 파일명 규칙 변화
- 연구부서/기술사업화그룹 파일명 변화

## `mapping.py`
- `prep_budget_code(year)` / `PREP_BUDGET_CODES_BY_YEAR` — 연도별 준비금 코드(2025:25841004, 2026:26841001)
- `parse_budget_master()` — 사용자 확정 예산 master 파서(§4.3)
- `build_mapping(..., master_files, year)` — master 최우선 적용
- invoice parser — `고객관리번호`, `현지비용(KRW)` 기준 item 생성
- survey loader — `관리번호`, `사용예산코드`, `사용예산명`
- current research vs current tech precedence/conflict
- history period ordering
- `EXPLICIT_UNASSIGNED` vs `MISSING`

절대 management_no별 budget dictionary를 여기에 넣지 않는다.

## `xlsx_ooxml.py`
- `XlsxSession.read_used_range()` — first sheet matrix reader
- `create_budget_workbook()` — source invoice → A:D가 추가된 base
- `create_filtered_copy()` — 전체 row 유지 + budget filter/hidden/cache
- `create_fee_workbook()` — target column blue font
- `inspect_workbook()` — regression semantic snapshot

내부 helper:
- `_first_sheet_path()` — workbook relationship로 실제 sheet part 찾음
- `_shift_formula()` — A1 formula ref +4
- `_shift_ref_expression()` — ref/sqref/range +4
- `_force_recalc()` — calcPr + stale chain 제거

## `pdf_mark.py`
- `mark_budget_pdf()` — management number list를 한 PDF에 표시
- management number search
- row boundary detection
- amount within row search
- red Square + yellow Highlight
- `mark_fee_pdf()` — service/wire orange box

2026Q2 page-bottom fix: row boundary 후보에서 light/white horizontal line 제외.

## `workflow.py`
- `_invoice_description()` — q2-current/q1-legacy 적요 띄어쓰기
- `_fee_totals()` — source total row에서 service/vat/wire 추출
- `preflight()` — 생성 없이 mapping/amount/group/master 검사
- `prepare()` — 전체 package 생성 + mapping input provenance archive + PDF preflight/normalization
- `finalize()` — completed job folder rename + ZIP

folder hierarchy/file naming/profile 변경은 여기부터 본다.

## `gui.py`
- `classify_current()` — 6 slots
- `_expand_current_drop()` — current folder direct children
- `_expand_history_drop()` — recursive mapping XLSX only
- `_expand_master_drop()` — explicit master lane에서 invoice/fee/survey 산출물 제외 후 XLSX 수집
- `_stage_inputs()` — current/history/master temp clean input set
- `_worker()` — background preflight/prepare
- `_poll_queue()` — main-thread UI updates

## `portal_contract.py`
- `DOCUMENT_TYPE_TEXT` — `특허 출원/등록/연차료`
- `PATENT_EXPENSE_CODE` — `55630`
- `MARKPRO_VENDOR` — portal 거래처/은행 계약
- `annual_portal_payload()` — 예산별 원금: 기타/계좌입금
- `fee_portal_payload(..., year=...)` — service e-tax / wire 기타; 준비금 코드는 `prep_budget_code(year)` 사용

이 파일은 portal 업무 고정값을 한 곳에 격리한다. 관리번호별 예산규칙은 여기에 넣지 않는다.

## `bridge.py`
- manifest endpoint
- package file endpoint
- status update endpoint
- token/path-traversal protection

포털 업무 필드가 추가되더라도 실제 portal selector가 아니라 데이터 계약 변경이면 bridge/manifest schema를 함께 수정한다.

## `tampermonkey/kriss_portal_automation.user.js`
- 실제 `S_ACC_01020100.do` 메인 발의 DOM 자동입력
- Kendo docuType/billKind event 처리
- budget/acct lookup 대기/검증
- Markpro 입금자 입력
- e-tax popup 검색/추천/approval-number 수동확인
- official 행추가 + Dropzone 첨부
- 수동 저장 후 bridge 완료기록

DOM 변경이면 `PORTAL_AUTOMATION_SPEC.md`와 `PORTAL_DOM_FACTS.json`부터 비교한다.

## `tools/test_portal_contract.py`
생성된 manifest의 portal schema/금액/receipt invariant를 검증한다.

## `tools/validate_portal_snapshots.py`
사용자가 캡처한 신규/완료/전자세금계산서 DOM이 현재 selector/event 계약을 만족하는지 검사한다.

## `tools/regression_q2.py`
Q2 current + Q1 history → generated package → Q2 golden semantic comparison.

새 분기 도구를 만들 때 이 파일을 복붙해서 management_no/금액을 하드코딩하기보다 facts JSON과 일반 snapshot comparator를 확장하는 방향을 선호한다.


---

## 37. Legacy OOXML 엔진 세부 (portable-legacy 전용)

대상 코드: `kriss_annual_fee/xlsx_ooxml.py`

이 절은 v0.3~v0.6.1의 OOXML 구현을 **역사/회귀용**으로 기록한다. v0.6.3 운영 장애를 고칠 때 이 절을 따라 OOXML patch를 확대하지 말고 §0과 `docs/EXCEL_NATIVE_BACKEND.md`를 우선한다.

## 1. XLSX는 ZIP 패키지다

`.xlsx`는 여러 XML/relationship/media part가 들어 있는 ZIP이다. v0.3은 원본 package를 읽은 뒤 변경해야 하는 entry만 교체하고 나머지는 원본 그대로 다시 쓴다.

업무상 핵심 entry:

```text
[Content_Types].xml
xl/workbook.xml
xl/_rels/workbook.xml.rels
xl/worksheets/sheetN.xml
xl/styles.xml
xl/sharedStrings.xml        # 있을 수도/없을 수도 있음
xl/calcChain.xml            # stale이면 제거
```

first sheet의 실제 경로는 `workbook.xml`의 sheet r:id와 `workbook.xml.rels`를 따라 찾는다. `sheet1.xml`이라고 무조건 가정하는 것은 reader/editor core에서는 금지한다.

## 2. reader 계약

`XlsxSession.read_used_range(path)`는 첫 worksheet의 cell matrix를 반환한다.

지원 cell text:
- shared string (`t=s`)
- inlineStr
- string/error
- boolean
- numeric

formula cell은 `<v>` cached value를 읽는다. 이는 Excel이 없는 환경에서도 마크프로 원본과 생성파일의 현재 값을 읽기 위한 의도다.

### 헤더 정규화
비즈니스 column 탐색은 `norm_header()`로 공백 차이를 흡수한다. 원본 출력 문자열 자체를 임의 변환하지 않는다.

## 3. 4열 삽입을 “새 workbook 작성”이 아니라 “주소 이동”으로 구현한다

원본 A열부터 모든 cell/reference를 4열 오른쪽으로 이동하고 새 A:D를 쓴다.

수정 대상 예:
- cell `r="A2"` → `E2`
- formula의 A1 reference
- dimension/ref/sqref/merge-like reference attributes
- AutoFilter ref

formula 안의 quoted string은 cell reference처럼 보이더라도 이동하면 안 되므로 `_shift_formula()`가 quoted token과 non-string token을 분리한다.

### 새 workbook feature가 들어왔을 때 위험 신호
다음이 원본에 새로 등장하면 기존 +4 이동이 부족할 수 있다.
- Excel Table (`xl/tables/*`)
- PivotTable/PivotCache
- charts/drawings의 cell anchors
- data validation formula
- conditional formatting formula
- external links/names
- structured references (`Table1[Column]`)
- dynamic arrays/spill refs

이 경우 먼저 새 골든을 확보하고 **원본 XML part의 cell reference가 실제로 무엇을 의미하는지 분석한 후** 이동 범위를 확장한다.

## 4. 삽입 A:D의 셀 타입

### A 지출발의 적요
- formula 존재
- cached string 존재
- cell `t="str"`

이중 기록 이유: Excel이 없어도 값이 보이고, Excel에서 열면 formula도 유지하기 위해서다.

### B 사용예산(지출금액)
- shifted 원본 `현지비용(KRW)` cell을 참조하는 formula
- cached integer
- 원본 amount cell의 style을 복사

### C 예산코드
inline string으로 기록한다. 예산코드가 숫자로 보이더라도 문자열이 권위값이다. `.0` 정규화는 mapping 단계에서 한다.

### D 예산명
inline string.

## 5. 합계행

최종 physical row에는:

```text
A = 지출금액
B = SUBTOTAL(9,B2:B{data_end})
```

을 기록한다.

base workbook의 cached B는 전체 assigned 합계이며, budget filtered copy를 만들 때 해당 budget visible row의 합으로 다시 갱신한다.

## 6. 예산별 filtered copy

골든은 row delete가 아니다.

각 데이터 row에서 D 예산명을 읽고:
- 같은 budget → `hidden` 제거
- 다른 budget → `hidden="1"`

그리고:

```xml
<autoFilter ref="A1:W111">
  <filterColumn colId="3">
    <filters><filter val="...budget..."/></filters>
  </filterColumn>
</autoFilter>
```

형태를 만든다. `colId=3`은 A=0 기준이므로 D열이다.

합계행은 filter ref에서 제외하고 숨기지 않는다.

## 7. 수수료 workbook의 파란 글씨

원본 style을 훼손하지 않기 위해 해당 cell의 기존 `xf → fontId`를 읽는다.

각 기존 font를 deep copy하고 기존 `<color>`를 제거한 뒤:

```xml
<color rgb="FF0070C0"/>
```

를 추가한다. 새 fontId를 참조하는 새 cellXf를 만들고 대상 열 cell에만 새 style id를 설정한다.

**style id 자체는 골든과 비교하지 않는다.** 새 style/font를 append하는 순서가 달라질 수 있기 때문이다. 회귀 기준은 대상 header와 실제 font RGB이다.

## 8. 계산 chain 처리

우리가 formula를 추가/변경했는데 원본 `calcChain.xml`이 남아 있으면 chain이 stale할 수 있다.

따라서:
- `xl/calcChain.xml` 삭제
- workbook rel의 calcChain relationship 삭제
- Content Types override 삭제
- workbook `calcPr`에 auto/fullCalcOnLoad/forceFullCalc 설정

한다.

## 9. ZIP 재작성 원칙

원본 `ZipInfo`가 존재하는 entry는 원래 info를 사용해 재기록한다. 새 entry가 필요한 경우만 deflate 기본을 사용한다.

바이트 hash 동일성은 목표가 아니다. XML serializer namespace order나 ZIP 압축 결과는 달라질 수 있다. 의미 검증이 목표다.

## 10. Q2 실제 회귀 결과

v0.3 Q2 생성본과 골든 비교:

- 국내 master: C열 budget code를 string으로 normalize하면 `P190141KR` 1셀 외 차이 0
- 해외 master: 차이 0
- 국내 바이오의료측정본부 filtered copy: 값 0 diff
- 동일 filtered copy의 AutoFilter ref/criteria/hidden row 집합: 일치
- 수수료 workbook: target columns `FF0070C0`

이 결과가 현재 OOXML 엔진의 baseline이다.

## 11. 장애 진단

### Excel에서 “복구된 레코드” 메시지가 뜬다
1. XLSX를 ZIP으로 풀어 XML well-formed 확인
2. first sheet relation path 확인
3. formula/reference shift가 malformed ref를 만들지 않았는지 확인
4. `[Content_Types].xml`/rels에서 삭제한 part를 아직 참조하는지 확인
5. 동일 새 input으로 최소 1개 workbook만 생성해 범위를 줄인다.

### 필터는 보이지만 다른 행도 화면에 보인다
- row `hidden=1` 확인
- filterColumn `colId=3` 확인
- criteria budget_name의 공백/이중공백 확인

### 합계가 전체 금액으로 보인다
- filtered copy의 B total cached `<v>`가 visible total로 갱신됐는지 확인
- formula가 `SUBTOTAL(9,...)`인지 확인
- total row가 filter range 안에 들어가지 않았는지 확인

### 수수료 파란색이 사라진다
- target header 탐색 결과 확인
- target column 전체 cell에 새 style 적용 여부 확인
- styles font color가 theme/indexed가 아니라 `rgb=FF0070C0`인지 확인

## 12. 의도적으로 하지 않는 것

- 사용자 workbook을 openpyxl로 열었다가 그대로 save
- COM으로 Excel을 띄워 저장
- formula 결과를 계산하는 완전한 Excel evaluator 구현
- 모든 OOXML feature 지원

새 요구가 이 범위를 벗어나면 optional backend를 새로 설계할 수 있지만, 현재 엔진의 골든 회귀를 깨지 않는 것이 조건이다.


---

## 38. GUI / 드래그앤드롭 운영

진입점: `run_gui.pyw`  
구현: `kriss_annual_fee/gui.py`

## 1. 화면 구조

1. 현재 분기 자료
   - drag/drop zone
   - 파일 선택 / 폴더 선택 / 비우기
   - 6개 슬롯 인식 table
2. 과거 분기 조사자료
   - drag/drop zone
   - 파일 선택 / 폴더 선택 / 비우기
   - 채택된 mapping file list
3. 출력/실행 옵션
   - output directory
   - `q2-current` / `q1-legacy`
   - allow-unassigned / allow-missing
4. action
   - 사전 검사
   - 전체 파일 생성
   - 결과 폴더 열기
   - 포털 브리지 시작
   - 최종 ZIP 만들기
5. progress / summary / log

## 2. drag/drop dependency

`tkinterdnd2`가 있으면 `DND_FILES` target을 등록한다. Windows Explorer는 공백/한글이 포함된 path를 Tcl list 형태로 전달할 수 있으므로 수동으로 `{}`를 파싱하지 않고:

```python
self.root.tk.splitlist(event.data)
```

를 사용한다.

## 3. 현재분기 파일 분류

`classify_current()`가 다음을 각각 list로 만든다.

```text
domestic_pdf
domestic_xlsx
overseas_pdf
overseas_xlsx
research_xlsx
tech_xlsx
```

invoice 후보는:
- 확장자 일치
- `E0259-INV`
- `국내`/`해외`
- `_지출예산 구분` 제외
- `수수료` 제외

research/tech는 `core.mapping_file_kind()`를 재사용한다. GUI와 core에서 서로 다른 파일명 규칙을 만들지 않는다.

## 4. 폴더 드롭의 깊이 차이

### current
직속 `.xlsx/.pdf`만 수집. 산출물 폴더를 통째로 드롭했을 때 예산별 사본까지 재귀 수집되어 중복되는 사고를 막기 위함.

### history
재귀 `*.xlsx` 수집 후 `mapping_file_kind()`가 true인 것만 보존. 분기별 폴더를 history 상위폴더 하나로 관리할 수 있도록 하기 위함.

## 5. staging

GUI가 `workflow.prepare()`에 원래 사용자 directory를 직접 주지 않는다. `_stage_inputs()`가 temp root를 만든다.

```text
<temp>/current/   정확한 6개
<temp>/history/   채택된 조사 XLSX만
```

이렇게 하면 사용자가 서로 다른 폴더에서 파일을 드롭해도 core discover의 입력 계약이 유지된다.

## 6. 동시성

`prepare()`는 Q2 기준 수십 초가 걸릴 수 있다. Tk mainloop에서 실행하면 Windows가 “응답 없음”으로 보이므로 worker thread를 사용한다.

worker → UI 전달은 `queue.Queue` event만 사용:
- progress
- check_done
- generate_done
- error
- idle

Tk widget을 background thread에서 직접 수정하지 않는다.

## 7. progress callback

`workflow.prepare(... progress=callback)`의 percent는 단조 증가해야 한다. v0.3 baseline:

```text
2 scan
8 mapping
12 copy
16 domestic base xlsx
~20-64 domestic budget files
65 overseas base xlsx
~65-80 overseas budget files
82 fees
92 validation
100 done
```

새 stage를 추가할 때 이전 percent보다 내려가지 않게 조정한다.

## 8. 오류 UX

- 현재 6개 중 누락/중복: worker 시작 전에 messagebox
- mapping/PDF/XLSX 실패: traceback은 log, 간단한 message는 dialog
- allow options는 기본 OFF
- 성공 후 결과 directory를 기억하고 post-generation button 활성화

## 9. EXE 배포

`build_windows_exe.bat`는:

```text
pyinstaller --onefile --windowed --collect-all tkinterdnd2 run_gui.pyw
```

구조를 사용한다.

`tkinterdnd2`의 Tcl/Tk package data가 누락되면 EXE는 열리지만 DnD만 실패할 수 있다. 이때 picker fallback이 존재하므로 업무 자체는 수행 가능해야 한다.

## 10. 미래 개선 후보

포털 DOM이 확정된 뒤 GUI에 다음을 붙일 수 있다.
- “포털 자동화 시작” 버튼으로 브리지 + 브라우저 안내 통합
- job별 완료/실패 table
- manifest status refresh
- 최종 ZIP 전에 미완료 job warning

단, 포털 selector/business logic을 `gui.py`에 직접 넣지 않는다.


---

## 39. v0.6 운영 안정화 계약

### 39.1 버전 정본
Python 코드의 현재 버전 정본은 `kriss_annual_fee/version.py`의 `VERSION`이다. `__init__.py`와 GUI는 이 값을 import한다. Tampermonkey userscript metadata는 Python을 import할 수 없으므로 `tools/validate_release.py`가 일치 여부를 강제한다.

### 39.2 릴리스 metadata
배포 전 순서:

```text
python tools/generate_source_manifest.py
python tools/validate_release.py
```

Windows에서는 `build_release_metadata.bat`를 사용해도 된다. `SOURCE_MANIFEST.json` schema 2는 self-hash 순환을 피하기 위해 manifest 자신을 제외하고 `self_excluded=true`를 기록한다. 사람이 hash/파일목록을 수기로 유지하지 않는다.

### 39.3 GUI master lane
CLI `--budget-master`와 GUI master drag-and-drop은 같은 `workflow.preflight/prepare(..., budget_master=...)` 경로를 사용해야 한다. GUI만 별도 예산 규칙을 구현하지 않는다. 폴더 drop에서 invoice/수수료/가공본/research/tech 조사파일을 master로 오인하지 않도록 `_expand_master_drop()` 필터를 유지한다.

### 39.4 current source period
현재 연구/기술 조사파일의 파일명에서 period를 추정하지 않는다. invoice에서 확정한 `(year, quarter)`를 `build_mapping(current_period=...)`에 전달하며 current mapping과 explicit-unassigned audit에는 그 값을 기록한다. 이 규칙은 축약 파일명 Q3에서 검증됐다.

### 39.5 mapping input provenance
`prepare()`가 성공/실패 산출을 만들기 시작한 뒤 현재 research/tech, history, budget master XLSX는 `_automation/source_inputs/<role>/`에 byte-identical copy로 보존한다. `input_provenance.json`에 bytes/SHA-256/archive path를 기록하고 `mapping_audit.csv.mapping_source_archived`로 연결한다. GUI temp source path가 삭제돼도 archive가 감사 근거다.

### 39.6 PDF preflight
`normalize_pdf_source()`는 source당 1회 clean serialization을 수행해 warning을 수집한다. repair/warning이 있으면 내부 정규화본을 저장하고 파생 PDF가 그 copy를 재사용한다. **업무 package의 원본 청구 PDF는 항상 원본 bytes를 복사**해야 한다. normalized copy를 `0. 마크프로 청구`에 넣지 않는다.

2026Q3 검증:
- 국내 50쪽, xref warning 5건 -> normalized
- 해외 9쪽, version-marker garbage warning 1건 -> normalized
- 국내 62/62, 해외 23/23 매핑/표기 성공
- portal contract 28 jobs PASS

원본 검증 JSON: `docs/VALIDATION_2026Q3_V06.json`. Q3는 완료 ZIP 골든이 아니라 운영 입력 fixture라는 점을 유지한다.

### 39.7 포털 fee budget 불변식
fee job top-level `budget_code`와 `portal.budget_code`는 같은 `prep_budget_code(year)` 결과여야 한다. `portal_contract.py`에 2026 고정 `26841001` 상수를 다시 만들지 않는다. `tools/test_portal_contract.py`는 manifest year 기준으로 이를 검사한다.


## Windows batch launcher invariant (v0.6.4+)

The `.bat` files are executable transport, not user-facing documentation. They MUST remain ASCII-only with CRLF line endings. Never place Korean or other non-ASCII text in a batch file, never depend on `chcp 65001`, and always quote `%~dp0`. User-facing Korean belongs in Python GUI / Python console output / Markdown. A release is invalid if any `.bat` contains a byte >= 0x80 or uses bare LF line endings.
