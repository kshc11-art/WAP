# 검증 자료와 사용법

현재 저장소의 raw/golden 비교 케이스에는 승인된 실제 기대값이 등록되지 않았다. 2026-09-15 제공된 최신 원자료·수작업 통계는 로컬 검토에 사용했지만, 수작업 결과나 ZIP의 과거 산출물을 golden으로 자동 채택하지 않았다.

각 프로그램이 지금 어떤 자료를 읽고 어떤 순서로 계산하는지는 [통계자료 로직 지도](../README.md#통계자료-로직-지도)에서 먼저 확인한다.

```text
validation/
  catalog.json       프로그램/파일 출처와 현재 기준 해시
  cases.json         프로그램별 입력·기대결과·비교 규칙
  raw/<id>/         원본 입력, 수정하지 않음 (로컬)
  golden/<id>/      사용자가 지정한 기대 결과 (로컬)
  actual/<id>/      프로그램이 새로 만든 결과 (로컬)
  reports/<id>.json 비교 보고서 (로컬)
```

1. `python validation/run.py status` 또는 루트 `verify.cmd`: 준비 상태 확인.
2. 프로그램별 모집단·기준일·행별 기대값을 근거로 확정한 뒤 로컬 raw/golden 폴더와 cases.json을 채운다. 각 raw 파일의 SHA-256과 승인된 golden 파일의 SHA-256을 등록한다. 수작업 합계가 가깝다는 이유만으로 golden을 만들지 않는다.
3. 대상 프로그램을 별도로 실행해 actual/<id>에 결과를 저장한다. 현재 도구는 프로그램 실행이나 Office 조작을 자동화하지 않는다.
4. `python validation/run.py compare patent-holdings`: 등록된 출력 전체를 비교한다.

준비된 케이스 형식 예시(설명용, 실제 자료가 아님):

```json
{
  "id": "patent-holdings", "status": "ready", "period": "사용자 확정 기준기간",
  "raw": [{"path": "input.xlsx", "sha256": "실제 파일 SHA256"}],
  "comparisons": [{"path": "report.xlsx", "golden_sha256": "기준 파일 SHA256",
    "sheets": {"분류": {"header_row": 1, "keys": ["관리번호"]}, "총괄표": {}}}]
}
```

CSV/TSV: 열 이름·값을 비교한다. `keys`가 있으면 키별 비교로 행 순서만 무시하며 빈/중복 키는 오류다. 키가 없으면 순서까지 비교한다. 인코딩은 기본 utf-8-sig이며 필요하면 encoding을 명시한다.

JSON: 구조·타입·값을 비교하고 중복 객체 키를 거부한다. 객체 배열에 keys를 지정할 수 있다.

XLSX: 모든 시트·시트 순서·셀 값을 비교한다. sheets를 지정하면 실제 모든 시트를 포함해야 한다. 키 설정된 시트만 키별 비교한다. 누락된 수식 캐시나 오류 셀은 실패한다. 스타일·인쇄 배치·수식 문자열의 동일성은 검사하지 않으므로 실제 Office 출력 검증과 구분한다.

그 밖의 파일은 SHA-256 바이트 일치 비교다. PDF/HWP의 내용·레이아웃 비교 기능은 아니다.

raw/golden 해시 불일치, 등록하지 않은 추가 출력, 키 중복은 오류다. 숫자는 허용 오차 없이 비교하며 텍스트의 공백·앞자리 0은 자동 제거하지 않는다. 결과 로그는 로컬에만 생성한다.

종료코드: status는 실행 결과를 검사하지 않아 항상 2다. compare 종료코드는 0=실제 비교 통과, 1=불일치 또는 입력 오류, 2=자료 준비 대기. 구조/테스트 CI 통과와 업무 통계 검증 통과는 별개다.

`python validation/diagnostics.py`: 초기 합성 28사례 진단. 현재 알려진 8개 불일치(5유형)를 재현한다. 이는 실제 자료의 오류율을 뜻하지 않는다. 순수 함수/응답 함수만 테스트하며 서버·Office·업무 원본을 실행하지 않는다.


## 코드 분석

## 이번 재검토에서 보완한 기반

- CSV 닫히지 않은 따옴표를 기존 비교기가 정상 값처럼 수용하던 사례를 재현하고 strict 파싱으로 수정.
- 실제 셀은 B2까지 있는데 XLSX dimension이 A1만 가리키는 두 파일의 값 차이를 기존 비교기가 놓치는 사례를 재현하고 저장된 셀 전체를 읽도록 수정.
- 손상 ZIP/XML의 ERROR 보고서 처리와 Windows 파일 핸들 정리를 보완. 오래된 PASS가 남지 않도록 검증.
- 연차료 workflow의 userscript 경로를 저장소 canonical 경로→원본 ZIP 경로 순서로 확인하고 배포 파일명 유지. 계산 로직은 변경하지 않음.
- 설치 문서에서 삭제된 구형 배포 도구의 실행 안내를 현재 catalog/check/test로 정정.
- 현재 기반 테스트 28개 통과. 이는 아래 프로그램별 업무 정확성의 인증이 아님.

## 분석 범위와 증거 해석

전체 33개 프로그램의 구조와 주요 업무 경로를 대상으로 한 정적 분석 및 선택한 합성 사례 검토다. 모든 실행 분기·내장 외부 라이브러리를 정밀 검증한 것은 아니다. raw/golden은 미제공이며 사내 서버·Office·브라우저의 실제 동작은 미검증이다. 문서에 있는 과거 검증 기록을 이번 검사 결과로 합산하지 않았다.

아래 로컬 work/review_* 명령과 JSON은 이번 검토 세션에서 만든 합성 관찰용 작업 파일이다. 저장소에 상시 제공되는 정상 회귀 테스트나 사용자 지정 golden이 아니다. 구현 수정 시 정상 기대값의 회귀 테스트로 전환해야 하며, 관찰 스크립트 종료0을 제품의 정상 판정으로 사용하면 안 된다.

## WAP 통계 영역 재검토 — 2026-09-14

검토 기준: main `741f252f884d50c7d9f80d0d07a07ec4090fa440`의 로컬 사본. 업무 소스 수정 없음. 실제 PMS·Office 실행, 서버 호출, raw/golden 비교 없음. AGENTS/ENGINEERING_RULES/README와 제공 지식의 13장 최신 보완, 보유특허·마크프로 명세를 대조했다. 과거 문서의 '실측 검증 완료'는 이번 검증 실적으로 계산하지 않았다.

### 프로그램별 역할과 상태

| 프로그램 | 입력 → 처리 → 출력 | 핵심 규칙/의존성 | 다음 검증의 중심 |
|---|---|---|---|
| `scripts/stats-patent.user.js` | 파일·화면 그리드·PMS 직접조회 → 특허비 적요 분류, 피벗, 출원/등록 건수, NST 지출, 논문 집계 → Excel·백데이터 | 브라우저/PMS 스키마/Kendo/SheetJS. 상당히 큰 범용 통계 도구이며 단일 특허 산식만 있는 파일이 아님. 백업 시 비활성 | 수신 전량·오류 응답, 그룹 키, 비가산 집계 총계, 날짜·식별자 일관성. 기존 selfTest는 정해진 예제 중심이며 아래 실패를 막지 못함 |
| `scripts/stats-ledger.user.js` | 보조원장 Kendo/DOM·분할 기간조회 → 대체/환원 제거, 차변−대변, 적요 파싱·정렬 → XLSX/TSV | 해당 보조원장 화면과 jQuery/Kendo. `@require` 외부 cdnjs SheetJS(사내망/캐시 의존). 백업 시 비활성 | 수집 전체성, 금액 형식, 중복 제거 키, 제거 전표 근거. `순번` 헤더 2개는 주석상 의도이므로 검증 설정에서 위치 또는 구분된 별칭 필요 |
| `scripts/stats-paper-performance.user.js` | 논문 저자행+평가대상자+정규직 명단+투고연도별 JCI → 개인/부서 실적 → 근거 Excel·설정 백업 | 개인 JCI<70.5, 부서 JCI<30.5 또는 일반 Metrologia, 동일논문/본부 1건, 내부/외부 포함 공저자 분모, 3****/3- 제외. 오프라인 I/O/JCR 내장, 직접조회, IndexedDB. 백업 시 활성 | 저자 모순의 검토 전파, API·파일 양쪽의 데이터 완전성, 명단 기준일, 예외 충돌. 기본 정상·경계·완전동일 중복 제거는 합성 검증에서 정상 |
| `programs/patent-holdings/` | 현재 마스터+2025 결산+2024 스냅샷/처분/진단+2022 보유명단 → 2022~2025말/2026상반기 C/D/E/G/H/I/J/X 소급 분류 → Excel | pandas/openpyxl, 67열 위치, 명명된 시트/과거자료. 현재 절대 입력 경로는 `/mnt/user-data/uploads/…`, 경로 설정 필요. 문서 v2.0과 코드 v5.3의 오래된 설명이 섞임 | 빈값, 미래 이력 차단, 키 유일성, 기간 경계, 비교 집합 완전성. 공통키만 비교/불일치여도 저장하므로 현 검증 로그는 승인 장치가 아님 |
| `programs/markpro-annualfee/` | 마크프로 목록+IP 마스터(+스마트등급) → 납부주체/연차/수신자 → 1차2종·2차1종·검토/조회 Excel, Python 분기이력 | 독립 JS 엔진과 오프라인 HTML 내장 엔진, ExcelJS/JSZip/SheetJS 인라인. 연구부서/그룹/기업납부 구분, 패밀리 기본 report, 출자는 종료무관 옵션. Python 이력은 표준lib | 실제 분기별 셀·타입 대조, 날짜·금액, 동일키 상반값, 등급 충돌, 재처리 이력. 명세에서 요구하는 validate_v13_full.js/integrity_proof.js는 제공 저장소에 없음 |

### 구현 결함·검사 공백: 재현 또는 정적으로 확정

#### P1 — 피벗 평균/고유건수 등의 합계가 다른 계산이다

[scripts/stats-patent.user.js:645](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/stats-patent.user.js#L645) (`aggregate:605–612`). 각 셀 평균/최소/최대/고유건수를 합산해 행·열·전체 합계를 만든다. 합계·건수 외에는 일반적으로 가산할 수 없다.

- 입력 A그룹 `[0,10]`, B그룹 `[30]`: 전체 평균 기대 `40/3`, 실제 `35`; 최소 기대 `0`, 실제 `30`; 최대 기대 `30`, 실제 `40`.
- 같은 식별자 하나가 두 그룹에 있음: 전체 고유건수 기대 `1`, 실제 `2`.
- 계산 오류이며 raw/golden 없이 확정 가능. 행/열 구성비도 이 잘못된 총계에 의존한다.
- 조치 방향: 합계 위치의 원본행을 다시 집계하고 비가산 집계의 구성비 정의를 별도로 명시.

#### P1 — 특허 통계의 논문 직접조회가 부분 수신을 반환한다

[scripts/stats-patent.user.js:2681](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/stats-patent.user.js#L2681), 결과 생성 `2858–2862`.

요청 페이지 크기는 5000인데 서버 `total=250`, 응답 100행이면 `arr.length<PAGE`에서 종료한다. 기대: 나머지 150행 수집 또는 전량 미확인 실패. 실제: 100행과 total250을 정상 반환. 원클릭 통계는 `100/250` 문구만 붙여 계산·완료 표시를 계속한다. HTTP200 업무 오류를 정상 목록으로 받는 기존 결함과 별개다. 합성 fetch로 재현했고 실제 서버가 이 형태로 응답한다는 주장은 하지 않는다.

#### P1 — 보조원장은 현재 페이지/뷰를 전체처럼 취급한다

[scripts/stats-ledger.user.js:80](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/stats-ledger.user.js#L80), `201–224`.

`dataSource.view()`가 비어 있지 않으면 `dataSource.data()`보다 먼저 반환한다. total 또는 남은 페이지 검사가 없다. 가짜 Kendo에서 `view=1행`, `data/total=2행`을 주면 1행 수집. 기간 분할 조회도 매 기간마다 같은 함수를 사용하므로 각 월의 첫 페이지씩만 누적할 수 있다. 실제 화면이 페이징을 쓰는지는 내부망 확인 대상이지만, 코드의 부분수신 탐지 부재는 확정.

#### P1 — 논문 원자료 모순이 있어도 해당 부서 점수가 확정될 수 있다

[scripts/stats-paper-performance.user.js:138](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/stats-paper-performance.user.js#L138), `159–162`, `184–187`.

총저자수1에 내부저자2명을 주면 `AUTHOR_TOTAL` 검토가 생기고 개인점수는 보류한다. 하지만 부서 판단은 `authorConflict`를 사용하지 않아 부서 실적1건, `provisional=false`가 된다. 검토목록이 있다는 표시와 본부 최종점수의 확정 상태가 어긋난다. 지식 `13-6`은 미해결 검토가 있는 본부의 최종점수를 미확정으로 두도록 설명한다.

정확한 후속 정책은 '모순이면 실적 후보도 제외'와 '후보실적은 표시하되 최종점수만 보류'를 구분해야 한다. 이번에는 1건 집계 자체를 임의로 바꾸지 않고 검토 상태 전파 공백을 지적한다.

#### P1 — 금액의 파싱 실패를 0원으로 바꾼다

[scripts/stats-ledger.user.js:417](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/stats-ledger.user.js#L417), 금액 투입 `95–96`, 차감 `319`, 집계 `338`.

합성 `toNum('INVALID')` → 0. 숫자로 읽을 수 없는 청구금액이 차/대변 0으로 편입되고 오류 사유도 없다. 정상적인 공란/-와 형식 오류를 구분해야 한다. `stats-patent`도 `computeNST:3246`의 `toNum(...)||0`에 같은 누락 가능성이 있어 실제 필드 타입 계약과 함께 점검 필요.

#### P2 — 복수 행 차원의 문자열 키가 충돌한다

[scripts/stats-patent.user.js:624](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/stats-patent.user.js#L624).

두 차원 값 `['A / B','C']`, `['A','B / C']`가 모두 `A / B / C`가 되어 두 그룹이 하나가 된다(합성 재현). 값 조합의 식별 키와 표시 문구를 분리해야 한다.

#### P2 — 그리드 조회 타임아웃이 Promise를 끝내지 못한다

[scripts/stats-patent.user.js:2749](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/stats-patent.user.js#L2749).

20초 타이머가 `done=true`로 만든 뒤 `onChange()`를 부르지만 `onChange()` 첫 줄에서 즉시 반환한다. change도 error도 안 오면 영구 대기하며 오류 표시가 안 된다. 가짜 타이머/가짜 그리드로 `pending` 재현. 기대는 reject. 실제 서버 호출 없음.

#### P2 — 포기결정 수동 설정이 읽히지 않는다

[programs/patent-holdings/patent_yearend_classifier_v5.3.py:151](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/programs/patent-holdings/patent_yearend_classifier_v5.3.py#L151) (`ABANDON_DECISIONS`). AST 검사 결과 선언 Store 1회, Load 0회. 주석 81–83 및 별도 명세180은 여기 목록을 넣으면 복원에 쓰인다고 설명하지만, 어떤 값을 채워도 계산에 반영되지 않는다. 현재 설정은 빈 딕셔너리이므로 이번 자료의 결과 영향은 미확정. 설정 연결 또는 문서 철회가 필요.

#### P2 — 마크프로 날짜가 자동으로 다른 날짜가 된다

[programs/markpro-annualfee/annuity_engine_v1_3.js:34](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/programs/markpro-annualfee/annuity_engine_v1_3.js#L34).

`2026-02-30`을 거부하지 않고 `2026-03-02`로 바꾼다. 그 값은 등록연차/계약종료/납부기한 판단에 쓰인다. 합성 재현. 달력 유효성 확인과 잘못된 날짜의 검토/중단 처리가 필요하다.

#### P2 — 동일 번호의 상반된 등급이 충돌 목록에도 없다

[programs/markpro-annualfee/annuity_engine_v1_3.js:396](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/programs/markpro-annualfee/annuity_engine_v1_3.js#L396).

동일 원문 `US1234567B2`에 A/C 두 등급을 주면 첫 A 유지, `conflicts=[]`. 충돌 검사가 원문 번호가 다른 경우만 확인하고 동일 번호의 등급 차이는 보지 않는다. 명세는 '서로 다른 원본 번호의 정규화 충돌'만 정의하므로 구현이 명세를 어긴 것은 아니지만, 데이터 검증 공백은 확정이다. 상반 등급의 선택 기준을 정하기 전 자동 확정을 피할 필요가 있다.

#### P2 — 미해석 대괄호 적요가 검토에서 빠진다

[scripts/stats-ledger.user.js:243](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/stats-ledger.user.js#L243), `280–283`.

`지식재산권 SYN001KR [해석불가]`처럼 대괄호는 있고 '-'가 없으면 지출구분·단계가 비어도 `review=''`. 보고서는 수기확인0건으로 표시 가능. 미분류를 검토대상으로 포함해야 한다.

### 명세대로 동작하지만 정확성상 위험하거나 정책 확인이 필요한 부분

- **마크프로 국가를 지운 번호 매칭/첫값 유지:** engine350–363,396–420, spec204. EP1234567B1=A와 US1234567B2=C를 주면 US행에 A가 들어간다. 서로 다른 원문이므로 충돌 경고는 있지만 업로드값은 첫값이다. 명세에 적힌 동작이므로 코드 버그로 단정하지 않는다. 국가+권리종류를 키에 포함할지, 충돌행을 업로드에서 보류할지 정책 확인 후 회귀검증 필요.
- **마크프로 마스터 첫 행 우선:** engine143, spec138. 같은 관리번호의 첫 행에 계약없음, 둘째 행에 계약있음이어도 첫행을 쓴다. 충돌 자체를 차단하지 않는 설계다. 자료마다 의미있는 중복이 있는지 먼저 확인해야 한다.
- **마크프로 고정 열/헤더 경고만:** engine84–88,105–107,156–176,676–684, spec99. 열 이동을 감지해도 계속 위치로 읽는다. 잘못된 열의 값을 납부주체·비용으로 사용할 수 있으므로 핵심 열 변경은 중단하는 보강이 적절하다. 명세 변경을 수반한다.
- **논문 내부 동일저자의 상반 역할 자동 OR:** paper129–136. 한 저자의 `순위1/교신N`과 `순위2/교신Y`를 함께 주면 제1+교신으로 합치고 `AUTHOR_DUPLICATE` 정보만 남겨 검토0건. 동일인이 두 역할일 수 있으나 입력 두 행의 상반값을 합쳐도 되는지는 명확하지 않다. 완전동일 중복 제거와 역할 모순을 구분할 정책/원자료 계약이 필요하다. 이 문제는 확정 계산 실수가 아닌 자동확정 위험으로 남긴다.
- **보유특허 소급복원 한계:** 현재 상태·일부 과거 스냅샷·계약번호의 연도만으로 과거를 복원한다. 2026상반기에 같은 해 하반기 체결/기부를 구분할 실제 일이 없다. 마케팅·전략 과거값도 일부 참조연도 값 사용. 사용자 미제공 과거 로직/원자료를 임의로 추정하지 않았다.
- **특별관리 히스토리 재처리:** special_patents_history.py310–311은 같은 분기 재수집 시 현재 특별관리 태그가 없는 행을 `continue`하므로 과거 같은키 기록을 제거/종료하지 않는다. 정정본으로 과거 분기를 갱신하는 정책인지, 한 번 특별관리였던 이력을 계속 보존하는 정책인지 결정 필요. 아직 합성 파일 재현은 하지 않았음.
- **제거하면 안 되는 의도된 중복:** 마크프로 1차 파일 마지막 행 1회 중복(engine504, spec235)은 내부 시스템 대응 명세다. 단순 중복 제거 대상으로 고치면 안 된다.

### 기존 진단 재확인

`python validation/diagnostics.py`를 실행했다. 합성28개 중20일치/8불일치, 종료1. 아래 기존5유형 그대로다.

| 유형 | 코드 | 사례 |
|---|---|---|
| 등록번호 빈/공백인데 등록 건 | holdings273 | 2 |
| 상태 빈/공백을 유지로 보지 않음 | holdings295 | 2 |
| 미래 계약 추가가 과거 분류 변경 | holdings280–285 | 1 |
| 참조 관리번호 중복으로 병합행 증가 | holdings567 | 1 |
| HTTP200 업무오류 정상 반환 | stats-patent1524–1534 | 2 |

보유특허의 검증 자체도 `617–622`에서 공통키만 비교하며 빠진/늘어난 관리번호를 실패로 처리하지 않는다. 불일치가 있어도 `629`에서 보고서를 저장한다. 총괄 `A=B+F+J` 항등식은 같은 분류 열에서 계산한 양변이라 중복·누락이 있어도 참일 수 있다.

### 연계 점검

독립 코드인 console-adapters의 보유특허 판정과 통계 본체는 별도 규칙으로 남아 있다. 이번 범위에서는 통합하지 않았다.

논문평가 연계의 공개 API 불일치는 별도 브라우저 리뷰와 교차확인했다. `console-adapters:298`은 없는 `jcrYears()`, `371–372`는 없는 `fetchRawData()/setRules()` 호출. 현 `stats-paper-performance:597`은 `jcrStatus()/importPaperFromPortal()/configure()`를 제공하며 인자명도 다르다. `run:553` 반환은 `persons`/`departmentSummary`인데 adapter377/385는 `perPerson`/`deptResult`를 기대한다. 그대로 활성화하면 TypeError이므로 연결 계약부터 수정해야 한다.

### 수행 검증과 인계

- `node work/review_stats.cjs`: 네트워크/업무자료를 쓰지 않는23개 관찰. 정상 대조6개는 기대 일치. 나머지17개는 위 결함·검사공백·정책위험을 드러내는 사례이며 **17개의 독립 버그라는 뜻이 아니다**. 일부 동일결함의 변형과 명세상 동작도 포함된다.
- `work/review_stats_results.json`: expected/actual/category/expectation_basis 보존. category가 design-risk인 기대값은 검토 제안이며 사용자가 확정한 업무 정답이 아니다.
- 이 CJS는 **관찰용**이며 잘못된 현재값을 정답으로 assert하지 않는다. 기대값과 actual의 일치 여부를 JSON에 기록하고 관찰 완료 시 종료0이다. 업무검증 PASS를 뜻하지 않는다. 후속 회귀테스트로 승격할 때 정책 확정 사례를 분리하고 검증 실패를 종료1/assert 실패로 연결해야 한다.
- `ABANDON_DECISIONS`: Python AST Load0회 확인. 원본 main을 실행하지 않았음.
- 기존 `validation/diagnostics.py`: 28개20일치/8불일치. 계산 원본을 수정하지 않고 기존 검증함수만 실행.
- 실제 raw/golden 검증/내부망/PDF/한글/서버/Office 실행은 미수행. 문서에 인용된 과거 검증용 JS/원자료 중 미제공 부분은 결과를 재사용하지 않았다.

수정 우선순위는 수신 전량·검토상태·집계총계·유일키 검사를 먼저 고정하고, 입력/기간 경계 테스트, 프로그램별 raw/golden 회귀검증, 사내 실행 확인 순서가 적절하다. 소스의 모듈화는 이 회귀기준이 생긴 뒤 작게 진행한다.


## WAP 프로그램 6종 재검토

검토 기준: main `741f252f884d50c7d9f80d0d07a07ec4090fa440`. 아래 행 번호는 이 기준본의 1-based 번호다. 주 검토에서 연차유지료 패키징 경로를 수정하여 workflow.py 361 이후 현재 작업본 행 번호가 바뀔 수 있다.

기존 계산·문서 처리 소스를 수정하지 않았다. 실제 업무 자료, Office, COM 서버, 포털/외부 서버는 실행하지 않았다. 일반 Python 모듈과 AST로 추출한 함수, 합성 입력, 가짜 COM 반환값만 사용했다. 연차유지료 PDF 모듈은 PyMuPDF가 없어 import용 빈 모듈로 격리했으며 PDF 함수는 실행하지 않았다.

### 1. 프로그램별 구조와 판단

| 프로그램 | 역할·입력 → 출력 | 구조·실행 의존성 | 유지할 기반 / 먼저 개선할 부분 |
|---|---|---|---|
| 연차유지료 파일 생성 v0.6.7 | 국내·해외 청구 PDF/XLSX 4개 + 연구부서·기술사업화 조사 XLSX 2개, 선택 history·예산 master → 예산별 XLSX/PDF, 수수료 증빙, manifest/audit, ZIP | run.py/GUI → core(입력·모델) → mapping(예산 결정) → workflow(전체 생성). Excel native/OOXML, PDF 표기, portal_contract, localhost bridge가 분리됨. 운영 출력 Windows+Excel+pywin32, PyMuPDF; GUI tkinter/tkinterdnd2 | 명시적 미배정 차단, 미래 history 제외, 원본 보관·해시, Excel 재오픈 검증은 좋은 기반. 분기 결과 선삭제, 한 파일 내부 중복예산, 입력 기간 일치, 출력 경로 충돌을 먼저 보강. 전면 재작성 불필요 |
| 위원회 자료 v0.2.9 | 지재권 상세목록 XLSX + MarkPro XLSX → MASTER 10개 시트, 그래프 PNG 4개; MASTER+서식 → HWP/HWPX 안건 | main 파일에 XLSX 읽기·집계·PyQt GUI·XlsxWriter 출력. hwp_fill은 계획/사전검사/COM 적용, hwpx_fill은 XML 출력, hwp_support 공용 처리, bootstrap_runtime 환경. XlsxWriter/matplotlib/PyQt5, HWP는 Windows+한컴+pywin32/pyhwpx | 표 서식·셀 쓰기 FakeHwp 검사가 상당히 존재. 통계 행 유일성, 누락 헤더/날짜 값의 엄격한 입력 계약이 우선. 출력검사보다 입력→집계의 신뢰도를 강화할 필요 |
| 회의 HWP 취합 v0.4.2 | 기준 HWP + 회신 HWP 여러 개 → 8개 독립 영역을 보존 병합한 HWP, 로그 | tkinter UI → subprocess JSON job → hwp_merge_engine.ps1의 lossless COM 엔진. smart_rules는 호환·테스트용이며 실제 내용 재구성에는 쓰지 않음. Windows PowerShell+한컴, 보안모듈 지원 | 자동 중복 삭제를 끄고 원본 셀 Copy/Paste하는 방향은 적절. 날짜 정규화가 숫자·비율을 훼손하는 구체 결함이 있어 여기를 최우선 수정. UI의 입력=출력 차단, 취소/타임아웃은 존재 |
| 한글·PDF 병합 | HWP/HWPX 또는 PDF 여러 개 → 한 개 병합 파일 | 단일 Python, tkinter, 선택 tkinterdnd2; HWP win32com, PDF PyPDF2.PdfMerger | UI/엔진 분리 정도는 충분. HWP API false 반환을 무시해 실패가 완료로 보이는 문제가 우선. HWP 백그라운드 스레드의 COM 초기화도 회사 PC 재확인 대상 |
| 한글 편집 단축키 3.0 | 열린 한글 문서/선택영역 → 서식·치환·책갈피·저장·백업·PDF 등 | 단일 Python, PyQt5. 연결은 pyhwpx/EnsureDispatch/dynamic.Dispatch 대안. 열린 문서 고정 선택·진단·busy 재시도 포함 | 문서 대상 고정과 진단은 유지. 저장 반환값·백업 이름 충돌·부분 적용 후 재시도 정책을 강화. 전체 코드 분할보다 저장/실행 결과 판정을 우선 |
| 엑셀 병합 | CSV/XLS/XLSX, 선택 모든 시트 → 열 이름 합집합으로 세로 결합한 XLSX | 단일 Python, pandas/PyQt5/openpyxl, XLS는 xlrd. 자동 CSV 인코딩/구분자 탐지와 열 이름 정규화 | 범용 표 연결 도구이며 통계 정답 판정기는 아님. 식별자 문자열 보존·메타데이터 열 충돌·출력 파일 재입력/덮어쓰기 방지를 먼저 개선 |

### 2. 확인된 결함과 직접적인 실패 경로

#### P1 — 연차 결과폴더를 검사 전에 삭제

- 근거: [programs/annualfee-files/kriss_annual_fee/workflow.py:351](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/programs/annualfee-files/kriss_annual_fee/workflow.py#L351), `:357`; `core.py:74`–`:77`.
- 같은 분기를 같은 출력 경로에 다시 생성하면 `ensure_empty_dir`가 기존 전체 분기 폴더를 지운다. 이후 PDF 검사, 매핑 충돌 검사, Excel 초기화를 수행한다(`workflow.py:365`, `:381`, `:464`). GUI도 기존 결과에 대한 확인·보존 없이 이 함수를 호출한다(`gui.py:594`).
- 재현: work 아래 폐기 가능한 임시 분기 폴더에 기존 완료 marker를 만든 뒤 PDF 검사만 모형 오류로 설정. prepare가 실패한 뒤 marker가 사라짐을 확인했다. 사용자 파일은 건드리지 않았다.
- 영향: 입력 오류로 새 결과가 실패해도 지난 작업의 완료 폴더·manifest·기존 ZIP이 이미 없어질 수 있다.
- 개선: 새 임시 실행 폴더에 생성·검증 후 결과로 전환하고, 같은 분기의 기존 결과는 명시적으로 보존하는 방식 필요.

#### P1 — 같은 master/조사 파일 안의 예산 충돌을 마지막 행으로 덮음

- 근거: `mapping.py:86`, `:170`. 파일 간 master 충돌은 `:213`에서 검사하지만 파일 내부는 이미 dict로 축약된 뒤다.
- 재현: 동일 관리번호 TEST에 `(A, first)`, `(B, second)` 2행을 주면 parse_budget_master와 parse_research_records 모두 B를 선택하고 오류를 내지 않는다.
- 영향: 입력행 순서에 따라 예산이 바뀌고, 매핑 충돌 목록으로도 드러나지 않을 수 있다. 중복행의 예산이 동일한지·다른지를 구분한 검증이 필요하다.

#### P1 — 회의 취합 날짜 정규화가 숫자와 비율을 바꿈

- 근거: [programs/meeting-hwp/hwp_merge_engine.ps1:768](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/programs/meeting-hwp/hwp_merge_engine.ps1#L768)–`:807`, `:993`–`:1005`; 전체 문자열 치환은 `:842`–`:850`.
- 정규식 끝에 다음 숫자를 막는 경계가 없어 `1.80%`에서 `1.8`만 날짜로 인식한다. `%` 예외 검사는 바로 다음 글자 `0`을 보므로 통과한다.
- 실제 production PowerShell의 `Add-DateReplacementPairs` 정의만 AST로 추출해 실행: `1.80%`에 `{1.8 → 1.8.}`, `1.234`에 `{1.23 → 1.23.}` 생성 확인. 이 문자열의 문서 전체 치환 결과는 각각 `1.8.0%`, `1.23.4`다.
- 별도 문제: 한 문서에 `1.8(Thu) / 1.8%`가 있으면 앞의 날짜에서 얻은 `1.8 → 1.8.`를 문서 전체에 적용하여 뒤의 `%` 값도 `1.8.%`로 바꾼다. 날짜 탐지에서 예외 처리해도 전체 치환으로 다시 훼손된다.
- 대조군: `2026.09.01. ~ 2027.08.31.`은 기대한 `2026.9.1. ~ 2027.8.31.` 변환을 확인했다.
- 이 동작은 단순 문서 모양 수정이 아니라 수치 텍스트 변형이다. 날짜 위치별 치환과 날짜/숫자 경계 검증이 필요하다. HWP 화면에서 실제 적용된 결과는 별도 검증 대기다.

#### P1 — HWP 병합 실패가 성공으로 보고될 수 있음

- 근거: [programs/hwp-merge.py:116](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/programs/hwp-merge.py#L116), `:140`, `:152`에서 HAction.Execute의 반환값을 확인하지 않음; `:623`–`:624`, `:642`–`:645`는 예외가 없으면 완료 표시.
- 재현: 가짜 COM 객체의 FileOpen/InsertFile/FileSaveAs를 모두 false로 반환하게 했는데 merge가 정상 반환함. Office는 실행하지 않았다.
- 영향: 파일 열기·일부 삽입·저장 실패가 예외 대신 false로 보고되는 경우 누락/미생성 결과를 완료로 안내한다.
- 개선: 각 단계 반환값을 검사하고 최종 파일 존재·읽기·입력별 반영 검증까지 연결한다.

#### P1 — 엑셀 병합에서 식별자·기존 열을 조용히 바꿈

- 근거: [programs/excel-merge.py:46](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/programs/excel-merge.py#L46), `:78`, `:85`에 dtype/NA 보존 계약 없음; `:129`와 `:131`은 기존 source_file/source_sheet 열에 대입.
- 합성 CSV `patent_id,amount / 00123,100`을 읽으면 patent_id가 123이 된다. 원본 source_file 값 `original ledger`는 기본 출처 옵션에서 `synthetic.csv`로 덮였다.
- 영향: 앞의 0을 가진 등록·출원·기관 식별자에 대해 raw와 actual이 달라진다. 기존 출처 열도 사라져 검증용 전처리로 바로 신뢰하기 어렵다.
- 개선: 식별자·문자열 열 계약과 원값 보존, 출처 메타데이터의 충돌 없는 이름을 정한다.

#### P2 — 한글 단축키 저장 실패를 완료로 표시

- 근거: [programs/hwp-hotkeys.py:1343](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/programs/hwp-hotkeys.py#L1343)–`:1345`, `:1353`, `:1367`–`:1374`.
- 재현: FileSave가 false인 모형에서도 save_now가 `저장 완료(FileSave)` 반환.
- 백업도 저장 반환값을 확인하지 않아 저장 실패 후 이전 디스크본을 복사할 수 있다. 백업 파일명은 분 단위(`:1359`)라 같은 분에 두 번 백업하면 동일 경로에 덮어쓴다.
- PDF SaveAs의 false도 확인하지 않는다. 이 두 경로의 실제 Office 동작은 미실행이며 반환값 처리 누락 자체는 코드로 확인했다.

#### P2 — 엑셀 중복 열 이름 처리에 충돌 가능

- 근거: [programs/excel-merge.py:51](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/programs/excel-merge.py#L51)–`:63`.
- 재현: 열 이름 `[a, a, a.1]`이 `[a, a.1, a.1]`로 변환된다. 이 상태에서 `:138`의 reindex가 중복 열 때문에 실패할 수 있다.
- 개선: 새 접미사가 이미 사용 중인 원래 열 이름과도 충돌하지 않도록 유일성 검증.

### 3. 재현했지만 입력/업무 계약 확정이 필요한 항목

아래는 해당 입력에서의 코드 동작을 확인한 것이다. 실제 raw에서 이런 형태가 가능한지, 중복은 거부/합치기/별건 중 무엇이 정답인지 확인해야 하며, 이를 곧바로 실제 업무 오류 건수라고 세면 안 된다.

| 프로그램·근거 | 관측된 동작 | 확정할 규칙·권장 검사 |
|---|---|---|
| 연차 core.py:287–302, workflow.py:231 | 국내 파일은 Q2, 해외는 Q3여도 종류별 1개이면 입력 탐색 성공. 결과의 기준 분기는 국내 XLSX명에서만 결정 | 청구 PDF/XLSX 네 개의 동일 연도·분기를 필수 계약으로 정하고 일치 검사. 현재분기 조사 파일은 짧은 이름을 허용하므로 동일 방식의 이름검사 강요는 피할 것 |
| 연차 workflow.py:147–161 | 수수료를 행 합계와 대조하지 않고 마지막 행 값으로 반환. 총계행 없는 상세 100/200 → 200 사용 | 공식 청구양식의 총계행 식별과 합계·캐시 유효성 확인. 총계행 없을 때 임의 합산으로 보정할지 중단할지는 규칙 확정 필요 |
| 연차 core.py:57–71, workflow.py:505–514 | 예산명 A/B와 AB가 같은 폴더/PDF 경로가 됨. 서로 다른 코드에 동일 예산명도 가능 | 원본 이름 보존 규칙과 충돌 시 이름 정책을 정해야 함. 충돌 탐지 없이 생성하면 PDF/출력 경로가 공유됨. 생성 전체를 Office에서 실행한 것은 아님 |
| 위원회 main.py(실제 파일 kriss_committee_automation.py):1177–1212,1339–1397 | 동일 관리번호·출원번호의 완전 동일 행 두 개를 출원 2건으로 집계. 검증표는 정상으로 표시 | 관리번호/국가/권리 식별자 중 어떤 조합이 행 유일성 기준인지 확정. 중복을 자동 삭제하기보다 충돌 행과 원본 행번호를 보여주고 차단하는 것이 안전 |
| 위원회 kriss_committee_automation.py:719–730 | 필수 헤더를 못 찾으면 고정 열번호로 fallback. 등록번호 헤더가 없는 합성표에서 날짜 텍스트를 등록번호로 해석 | 이전 양식은 승인된 헤더/열 배열로만 호환하고 모르는 양식은 오류. 현재 fallback은 과거 고정양식 지원 의도이므로 범위를 먼저 확정 |
| 위원회 kriss_committee_automation.py:285–289,1179–1181 | 숫자 20260410은 Excel serial로 계산하려다 실패→None→집계 제외. 문자열 20260410은 별도 처리 가능 | YYYYMMDD 숫자를 지원할지 명시. 미지원이어도 날짜 파싱 실패를 누락 집계와 구분해 알려야 함 |
| 위원회 kriss_committee_automation.py:1233–1238,1276–1287 | 과거 PCT 후보 풀에 취소 상태의 PCT도 들어갈 수 있음 | 취소된 PCT가 후속 국외심의를 제외하는 근거인지 업무 확인 필요. 이 경우는 코드 추론이며 이번 합성 실행에는 포함하지 않음 |

분기 경계 처리 자체는 위원회 date_in_quarters가 날짜 단위로 비교하여 시작일·종료일 당일 오후를 포함하고 전후 날짜를 제외하는 것을 확인했다. 포기 자료의 +1분기는 문서 메타데이터이며 추가 날짜 필터로 쓰지 않는 현재 명세도 확인했다. 이 의도된 규칙을 오류로 취급하지 않았다.

### 4. 기존 구조 정리의 영향

- 실행 경로 누락 확인: 연차 workflow.py:361–363은 패키지 내부 `tampermonkey/kriss_portal_automation.user.js`를 찾는데 저장소에는 canonical `scripts/annualfee-expense.user.js`로 이동했다. 없으면 오류 없이 건너뛰므로 생성 결과에 설치 스크립트가 빠진다. 주 검토에서 canonical 경로+원본 ZIP 경로 호환으로 경로 보완과 격리 테스트를 완료했다. 출력 설치 파일 이름 `kriss_portal_automation.user.js`는 유지해야 한다.
- 연차 README는 삭제한 MAINTENANCE_BLUEPRINT/RELEASE_NOTES/여러 docs 및 build_release_metadata 배치를 계속 안내했다. 이는 코드 결함과 별도의 정리 후 안내 불일치다. 이번 검토에서 진입 안내를 수정했다.
- 위원회 resources/hwp_templates 12개, config/dept_map_2026_1.csv, tools/golden_2026_1.json은 실데이터 포함으로 의도적으로 제외했으며 루트 README에 복원 안내가 있다. 단순 clone만으로 HWP 생성 및 기존 모든 검증이 완료되는 상태는 아니다. 이번 검토에서 업무 자료를 복원하지 않았다.
- 회의 취합 release_check.py가 요구한 runtime 파일은 모두 존재하며 기존 release check는 통과했다. 그 검사로 문서 병합의 정확성이 보장되는 것은 아니다.
- 단일 Python 도구 3개의 실제 GUI/Office 의존성은 루트 requirements-dev.txt의 검증 도구 의존성과 다르다. 현재 자동 검사는 이 앱들의 실행 가능성까지 인증하지 않는다.
- 기존 연차 EXE 빌드 배치에는 userscript용 --add-data가 없으므로, onefile EXE에서 동봉 문제는 원본부터 있던 별도 검증 대상이다. 이번 저장소 경로 변경만으로 EXE 배포까지 해결됐다고 하면 안 된다.

### 5. 실행한 검사와 한계

| 검사 | 결과 |
|---|---|
| 이번 합성 Python 분석: work/review_programs_cases.py | 22개 관측: 14개 위험/미지원 동작 재현, 8개 정상 대조군. 14개에는 위의 계약 미확정 항목이 포함되므로 확정 업무 결함 14개라는 뜻이 아님 |
| 이번 production PS 날짜 함수 추출: work/review_programs_dates.ps1 | 4개 사례: 숫자/비율 치환 위험 3개 + 정상 전체날짜 대조군 1개. 실제 HWP 치환은 미실행 |
| committee tools/validate_hwp_reference_style.py | 13/13 PASS (모형 액션·서식 파라미터) |
| committee tools/validate_com_logic.py 전체 | 템플릿 미복원으로 시작 단계 실패/StopIteration. 전체 통과로 보고할 수 없음 |
| 위 검사 중 실제 템플릿을 읽지 않는 9개 test 함수 | 53/53 체크 PASS. 셀 읽기/행 증감/표 보존/앵커/그림/표지 모형이며 실제 렌더링과 다름 |
| meeting-hwp/date_normalization_check.py | 기존 7개 사례 PASS. production PowerShell 함수 대신 Python smart_rules를 검사하며 새로 찾은 숫자 경계 사례는 없었음 |
| meeting-hwp/release_check.py | PASS. 필수 파일·문법·배치 개행·정적 구조 검사 |
| annualfee-files/tools/test_v06_contracts.py | 로컬 PyMuPDF(fitz) 미설치로 import 실패. 제품 코드 실패로 단정하지 않음. 이번 별도 합성 사례는 PDF 호출을 완전히 격리해 실행 |
| raw/golden 대조·Office·브라우저 | 미실행. raw/golden은 미제공 상태 |

보조 결과: work/review_programs_cases.json, work/review_programs_existing_tests.json. 결과 JSON은 이번 분석용이며 사용자가 지정한 golden이 아니다.

### 6. 진행 순서 제안

1. 통계에 앞서 raw가 프로그램에 제대로 들어오는지를 고정: 필수 헤더·형식·날짜 파싱 실패·고유 키·행 수·누락/중복 검증. 위원회와 연차의 입력 계약부터 마련한다.
2. 파괴/오보고 방지: 연차 분기 결과 선삭제, 회의 수치 텍스트 변형, HWP 저장 false 처리, 엑셀 식별자 손실을 각각 작은 변경으로 수정하고 위 합성 사례를 회귀 테스트로 전환한다.
3. 사용자 raw/golden이 오면 대표 한 분기에 대해 행별 비교를 먼저 통과시킨 뒤 이전 분기·경계일·예외입력으로 확장한다. 합계만 같은 성공은 인정하지 않는다.
4. Office가 필요한 최종 단계는 회사 PC에서 실제 생성 후 재오픈·행 누락·페이지/표/글꼴·총계 계산·파일 전체 목록까지 검사한다. 모형 53/53 통과를 Office 검증 완료로 대체하지 않는다.

여섯 프로그램 모두 당장 전면 재작성할 필요는 확인되지 않았다. 명확한 계산·입력·출력 책임이 이미 있는 부분을 보존하고, 재현된 실패 경로에 좁게 방어와 검증을 추가하는 편이 적절하다.


## 브라우저 계열 검토 (2026-09-14)

기준 커밋: `741f252f884d50c7d9f80d0d07a07ec4090fa440`. 파일과 1-based 라인은 이 커밋의 `https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/<path>#L<line>`에 대응한다.

범위: scripts의 통계 3종을 제외한 userscript 21개와 programs/quick-panel. 사용자 요청에 따라 저장소 기준본의 역할, 실행 조건, 저장 및 통신 경계, 중복·실패 처리 중심으로 검토했다. 모든 UI나 사내 서버를 실행한 검증이 아니다. 브라우저, 서버, AHK 실행 및 원본 소스 변경은 하지 않았다. AGENTS/ENGINEERING_RULES/README와 지식파일의 관련 실행계약 및 2026-09-08/11 정정을 참고했다. 지식파일의 지시를 현재 승인으로 해석하지 않았다.

### 우선 발견

#### B1 — 상세 단축키 두 개가 같은 버튼을 중복 실행 [P1, 합성 재현]
- 위치: [scripts/ipms-detail-keys.user.js:93](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/ipms-detail-keys.user.js#L93)–106, [scripts/ipms-quick-panel.user.js:555](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/ipms-quick-panel.user.js#L555)–592.
- 두 파일 모두 백업 활성이다. 같은 IPMS 팝업에서 Studio에 Alt+1=접수 등 겹치는 매핑을 넣으면 두 document capture 리스너가 같은 입력을 처리한다. 구형은 preventDefault만, V21은 stopPropagation만 하므로 동일 document의 다음 리스너를 차단하지 않는다. 둘 다 defaultPrevented도 검사하지 않는다.
- 업무함수·이벤트만 VM에 추출한 합성 검증에서 한 번의 Alt+1에 구형과 V21 클릭이 각각 1회 발생했다. 구형은 e.repeat도 검사하지 않아 길게 누를 때 추가 클릭을 수행한다. 실제 서버의 중복 접수 방어 유무는 별도다.
- 개선: 팝업별 단축키 소유자를 한 개로 결정하고 중복 이벤트 및 반복 입력을 차단. 기존 두 파일의 역할을 유지하되 실행 공존 계약부터 정해야 한다. 사용자 설정/현재활성을 임의 변경하지 않음.

#### B2 — V21 Quick Panel의 srcdoc 시작 스크립트가 닫히지 않음 [P1, 합성 재현]
- 위치: [scripts/ipms-quick-panel.user.js:456](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/ipms-quick-panel.user.js#L456)–459 (특히458), srcdoc 적용477.
- 주입 문자열의 이중 역슬래시 때문에 생성 HTML에 실제 `<\\/script>`가 아니라 한 개의 역슬래시가 들어간 `<\/script>` 텍스트가 남는다. 이는 HTML script 종료 태그가 아니다. 결과적으로 뒤의 HTML을 JavaScript로 읽는다.
- loadCompactHtml 원함수를 VM에서 실행, 합성 Studio HTML을 반환시킨 뒤 첫 script 본문 구문검사: `SyntaxError: Unexpected token '<'`. 실제 Studio도 3행이 `<head>`이므로 replace 대상에 해당한다.
- 개선: HTML의 올바른 script 종료 문자열로 수정 후, 생성 HTML의 JS 구문과 sandbox srcdoc 로딩을 확인. Studio의 독립 브라우저 실행 문제와는 별개이다.

#### B3 — 첨부 응답으로 HTTP200 로그인 HTML을 성공 처리 [P1, 합성 재현]
- 위치: [scripts/ipms-compare-iprs.user.js:273](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/ipms-compare-iprs.user.js#L273)–292, [scripts/ipms-compare-paper.user.js:354](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/ipms-compare-paper.user.js#L354)–373.
- smartFetch는 길이가100바이트 미만인 일부 HTML/null만 거르고 첫 바이트가 { 또는 [ 인 JSON만 제외한다. 보통 길이의 로그인/오류 HTML이 200으로 오면 파일로 바로 반환하고 다음 URL 후보도 시도하지 않는다.
- 두 원함수에 338바이트 로그인 HTML을 반환하는 가짜 fetch를 넣었을 때 두 함수 모두 첫 URL에서 다운로드 성공으로 반환했다. PDF 같은 이름으로 HTML을 저장하거나 뷰어 파싱 오류로 끝날 수 있다.
- 다운로드 소비 위치: compare-iprs1334–1340, compare-paper1415 이하. 실제 포털 세션 만료가 항상 HTTP200인지는 관측하지 않았다. 응답조건 하에서 결함은 확정된다.
- 개선: 예상 문서 형식과 Content-Type/파일 헤더를 함께 확인하고 HTML·업무오류를 분리. 공유 코어를 현재처럼 두 소스에 둔다면 같은 회귀 사례를 양쪽에 적용.

#### B4 — 연차료 작업이 없어도 일반 지출발의의 저장 확인을 자동 처리 [P1, 조건부 운영영향/감시 시작 합성 재현]
- 위치: [scripts/annualfee-expense.user.js:1785](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/annualfee-expense.user.js#L1785)–1792,2486–2491,2633–2634.
- initMainPage는 #tb_accInfo와 #expndtrGrid가 있는 지출발의 화면이면 실행되며, loadNext 전에 installSaveAutoConfirmWatcher를 설치한다. 이 리스너는 #btnBpmSave 존재·disabled만 확인하며 currentJob/연차료 작성 완료 상태를 확인하지 않는다.
- currentJob=null 합성 이벤트에서도 armSaveAutoConfirm 호출1회 재현. 이후12초 안에 '저장…하시겠습니까' 형태 모달을 찾으면1774에서 확인을 클릭한다.
- 연차료와 일반 expense-helper는 같은 지출발의 화면에 함께 활성화되어 있다. 일반 비용저장까지 자동 확인하는 것이 의도인지 확인하고, 연차료 작업/신청번호/작성단계와 연결하여 범위를 제한할 필요가 있다. 실제 저장/결재 수행은 하지 않았다.

#### B5 — 대시보드 팝업 포획 훅의 복원 순서가 이전 훅을 남김 [P2, 합성 재현]
- 위치: [scripts/portal-dashboard.user.js:3511](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/portal-dashboard.user.js#L3511)–3515,3522.
- 첫 호출이 동기적으로 창을 열지 않아1.5초 유예 중인 상태에서 두 번째 withOpenCapture가 호출되면, orig에 첫 wrapper를 먼저 담고 그 뒤 기존 훅을 복원한다. 두 번째 종료 시 orig(첫 wrapper)로 되돌아간다.
- VM에서 두 호출 뒤 OPEN_HOOK.cur=null이지만 UW.open!==원래 함수임을 재현했다. 기존 wrapper가 남아 후속 포획/긴급복구의 전제를 깨뜨릴 수 있다. 즉시 중복 서버처리가 발생한다고 단정하지 않는다.
- 개선: 이전 포획을 끝낸 후 현재 UW.open을 캡처하고, 중첩·비동기·예외·긴급복구를 한 세트로 검사.

#### B6 — Companion 설정의 저장이 비원자적 [P2, 정적근거]
- 위치: [programs/quick-panel/v21-pro-companion-v7.ahk:682](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/programs/quick-panel/v21-pro-companion-v7.ahk#L682)–685, 동일패턴163–164/183–184/288–289.
- /studio-state는 기존 설정 파일을 삭제한 뒤 새 본문을 append한다. 디스크/권한/중단 실패 시 기존 설정이 소실될 수 있으며, delete 실패를 무시한 채 append하면 JSON을 이어붙일 수 있다. 설정 본문 JSON 검증과 백업도 없다. AHK를 실제 실행하여 장애를 유발하지는 않았다.
- 개선: 본문 구조 검증→같은 디렉터리 임시 파일 쓰기→읽기 확인→원자적 교체 및 이전값 보존. 여러 팝업의 저장은 revision 등 충돌조건을 함께 정해야 한다.

#### B7 — 요구자료 콘솔이 최신 논문평가 엔진 API와 호환되지 않음 [P2, 정적 계약 확인]
- 위치: [scripts/console-adapters.user.js:298](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/console-adapters.user.js#L298),371–385; [scripts/stats-paper-performance.user.js:597](https://github.com/kshc11-art/WAP/blob/741f252f884d50c7d9f80d0d07a07ec4090fa440/scripts/stats-paper-performance.user.js#L597) 공개 API,553/189 반환 구조(통계 담당과 교차 확인).
- 어댑터는 `jcrYears()`, `fetchRawData()`, `setRules()`를 요구하지만 최신 엔진에 없다. `jcrStatus()`는 문자열을 반환하는 함수로, 이 항목 자체는 호환성 결함이 아니다. `run`의 실제 결과는 persons 배열/departmentSummary 배열인데 어댑터는 perPerson 객체/deptResult 배열을 요구한다.
- 콘솔 3종이 현재 비활성이므로 지금 자동 발생하는 오류는 아니다. 콘솔을 켜고 논문평가를 실행하면 사전점검부터 TypeError가 발생한다. 단순 함수명 치환으로 고칠 수 없는 입력·반환계약 차이다.
- 개선: 기존 독립 논문평가 화면은 유지하고 콘솔 어댑터의 최신 계약을 별도 회귀검증. 사용자가 제공하지 않은 예전/별도 논문로직을 추정해서 복구하지 않음.

### 실행 관계: 결함과 구분할 운영 사실

- 검색 개선(활성)은 CONFIG 기본값 HIDE_USEARCH_ROW/DISABLE_USEARCH_SCRIPT=true(170–172), 기동 때 tm.usearch.off=1을 저장(725–731). 통합검색(백업 활성)은 그 키를 보고 즉시 종료(81). 따라서 '둘 다 활성'은 '둘 다 작동'이 아니다. 코드 주석상 의도된 기능 대체로 보이므로 삭제나 복구를 자동 결정하면 안 된다. 팔레트는 별도 tm.palette라 이 킬키의 대상이 아니다.
- portal-theme은 KrissDash로 대시보드와 연동하고 별도 pt_* GM 키를 쓴다. dashboard는 pd_* GM 키와 PPSD_KEY=kriss.pps.draft.v1을 읽으며, 입력Helper가 후자 로컬 상태를 쓴다. PPSD 공유는 의도된 연결이다. localStorage는 origin 단위라 다른 호스트는 별도 저장소다.
- compare-paper/iprs는 PDF·DOCX 캐시 localStorage 키, HWP IndexedDB를 공유한다. 공통 코어 복사본에 대한 동시 테스트가 필요하며, 공유키만 같다고 충돌로 단정하지 않았다. 두 파일에서는 과거 window.open 패치가 제거되어 현재 popup-manager가 전담한다.
- popup-manager는 document-start의 window.open, HTMLFormElement.prototype.submit을 감싼다. dashboard는 일시적 UW.open 포획, core-recon(비활성)은 수집 중 fetch/XHR/window.open 관찰, mail-gwx는 메일 XHR/팝업/알림을 감싼다. 훅 동작 전체가 같은 호스트/같은 프레임에서 발생하는지 구분해야 한다. 실제 페이지 컨텍스트와 Edge/Tampermonkey 주입방식은 사내에서 재검증해야 한다.
- console-host/adapters/launcher는 모두 백업 비활성. 실행 페이지별 공개 엔진 API 의존이 있으므로 세 개만 켠다고 통계 기능이 완성되지 않는다. 특히 adapters371 fetchRawData/372 setRules/377 perPerson·385 deptResult는 최신 논문평가 공개 API와 호환되지 않는다(B7). `needPatch`124–128도 __internals 공개를 요구한다.
- Companion은127.0.0.1:32145의 로컬 서버이며 CORS '*'(884), 요청원 검증 없이 HandleHttp(method,path,body)(856)를 호출한다. 현재 브라우저의 로컬 네트워크 허용 정책에 따라 접근성이 달라지므로 외부 페이지에서 반드시 접근된다고 단정하지 않는다. 향후 원자적 저장과 함께 요청 출처/비밀값 검증을 개선할 여지가 있다.

### 프로그램별 분류 및 다음 점검

'활성'은 백업 시점 설정이다. 개선점은 바로 재작성한다는 뜻이 아니다. LS=localStorage, GM=Tampermonkey 저장, IDB=IndexedDB.

| 프로그램 | 백업 | 역할·대상 | 저장·통신·관계 | 유지/개선 포인트 |
|---|---|---|---|---|
| ipms-search | 활성 | 신청·출원·등록·업무·청구·마스터 목록의 자동 검색/기간·공동출원 필터 | 네이티브 Kendo/jQuery 조회, 기관소유지분 상세조회; tm.usearch.off | 현재 검색기능 유지. 전량 페이지 누락·같은 행 중복·지분 확인 실패의 표시를 회귀검증. 통합검색 중지 설정을 명시 |
| portal-theme | 활성 | 포털 루트/index 테마·위젯·바로가기 | GM pt_*; KrissDash 호출/폼POST로 화면 열기 | 독립 UI로 유지. 대시보드 재배치·사용자 위젯 복구를 실제 DOM에서 확인 |
| portal-dashboard | 활성 | IPMS 단계+BPM 나의업무 통합·연속 팝업 | 조회 POST/GET; GM pd_*; LS kriss.pps.draft.v1 읽기; UW.open 포획 | B5 수정 대상. 캐시 이월/부분실패 표시, 업무키 연결, 연속처리 중 재정렬 억제를 회귀검증 |
| expense-helper | 활성 | AI 구독·기본/수탁 회의비 입력, 카드/거래처/참석자·행추가 | GM krissExpenseHelperDraftV0001/settings; pageWindow 포털API·폼 | 단일 전역 draft라 동시 여러 지출발의창의 대상 일치 검사 필요. B4와 공존 확인. 자동입력/행추가와 실제 저장 단계를 구별 |
| mail-gwx | 활성 | 그룹웨어 목록·탭읽기·작성 UI·수신자역할·에디터·로컬 초안 | GM gwx.*; unsafeWindow 메일 함수/XHR/알림; 작성 iframe | 7,283행의 기능별 내부 경계가 있어 전면재작성보다 기능별 회귀검증. 초안 복원/발송실패/첨부유지·복수작성창·XHR복원 우선 |
| annualfee-expense | 활성 | 연차료 manifest 작업선택→지출작성→저장/승인 재개 | GM 작업ID/설정, 폴더핸들IDB/manifest 읽기쓰기 또는 localhost bridge; MIS/BPM; LS 승인핸드오프 | B4 제한 우선. 작업ID/신청번호/금액 매칭, 다중탭 저장경합, 포털저장성공-로컬기록실패 복구를 검증 |
| ipms-unified-search | 활성 | IPMS 여러 탭 통합검색/상세이동 | tm.usearch.* 캐시; API조회·폼POST; 검색개선 킬키 영향 | 팔레트와 기능중복. 현재 사용자 선호를 반영해 활성권장 세트를 정하되 소스는 독립 유지 |
| ipms-palette | 활성 | Ctrl+Space 전역 특허검색·관리번호 기반 이동 | tm.palette.*; 전량조회+캐시; 포털/pms | API실패/캐시만남음/관리번호 해외접미·새 탭 폼전송 검사. 통합검색과 저장키 별도 |
| ipms-quick-panel | 활성 | 상세팝업 버튼탐지와 Studio 단축키/compact iframe 연결 | GM XHR localhost32145; /studio-state,/site-runtime; sandbox srcdoc 메시지 | B1/B2 우선. Studio 저장 실패 시 stateCache 선반영530–533도 이전값 복구 필요. @match가 전체 krisstar라 IPMS 아닌 opener팝업도 초기화됨 |
| ipms-detail-keys | 활성 | 팝업 라벨 exact match로 Alt숫자 동작 | 서버호출 직접 없음, 찾은 버튼 click; 저장 없음 | B1 우선. repeat/IME/비활성버튼/동일라벨 다수·입력중 키 정책 검증. V21과 소유권 필요 |
| ipms-compare-paper | 활성 | B_RES00002 논문 화면과 첨부 서지·저자·Funding 대조 | 동일origin 파일fetch, PDF/DOCX LS+HWP IDB 공유 | B3. 출판사별 문서패턴/두단조판/OCR/미추출을 실패 또는 참고로 구분. golden PDF+DOM 짝 필요 |
| ipms-joint-application | 활성 | 공동출원 소유기관/담당자·HWP협약·내부결재·우편 초안 | GM 사건/transfer; 원본 HWP 내장→문구검사후 재작성; 서버 저장/메일발송 직접 안 함 | 기존 원문위치 및 문단/개체 재검증 장점 유지. 2·3기관/지분≠비용분담/기관동명이름, 원본 HWP 한글 재열기 검증 |
| worktime-balance | 활성 | HRM근무달력 어제까지8시간 기준 초과/부족 표시 | DOM만, 저장/추가API없음 | 월경계·윤년·휴일·시간형식 오류를 표본검증. 현재 8시간/-restDay는 코드상 기준이며 실제 근무제 전체에 맞는지는 별도 |
| mail-readability | 비활성 | 구형 메일 폰트/답장·전달/날짜 강조 | DOM 스타일/텍스트관찰, 별도저장 없음 | mail-gwx와 UI중복. 비활성 기준 보존, 동시에 켤 때 텍스트 이중변환/스타일 우선순위 확인 |
| console-launcher | 비활성 | 포털의 요구자료 콘솔 버튼/단축키 | LS kriss_lnch_v1:state/:bus, 고정이름 창과 상태메시지 | 별도콘솔 URL/HELLO 타임아웃/팝업차단 확인. 실제조회 없음 |
| console-adapters | 비활성 | 콘솔 항목과 기존통계엔진 연결, 일부 자체 판정 | KrissStatsTool.__internals/KrissPaperEval, host의 api.post; 독자HOLD_RULES/연차후보탐색 | 최신 엔진 공개API와 호환성 우선. 자체 보유특허판정은 Python과 같은 정답이라고 가정하지 않음. 오류코드/페이지전량/추정API 구분 |
| console-host | 비활성 | 콘솔페이지 재구성·입력/실행/산출공통 UI | LS kriss_lnch_v1; fetchPOST+실행캐시; XLSX writer 외부엔진 | HTTP200 업무오류 검증244–263 필요. 부분결과/항목실패/캐시수명 구분. noframes 및 URLguard 있음 |
| ipms-input-helper | 활성 | 담당자·문구/세금문구·메일작성/직인·선행조사 대상/출원사무소 보조 | 포털조회·kriss.ajax.post 감시; kriss.pps.draft.v1; 문구LS; .kriss.re.kr 일회전달cookie | 대시보드PPSD연계 유지. 지분>50 규칙/국내일반/기존선행조사·미확인보류는 지식정정 반영. 실제 화면 대상키 일치/수신자 확정/다중탭 전달회귀 |
| core-recon | 비활성 | 화면·자원·요청응답·전후동작 ZIP 기록 | GM kriss.recon803.*, fetch/XHR/open 관찰; 선택범위자원조회 | 운영개선엔진과 별도로 필요할 때 수집. 훅중첩/정지복원·부분수집갭/저장실패·용량제한 확인, ZIP은 raw/golden으로 자동 채택 금지 |
| ipms-compare-iprs | 활성 | 청구·출원·등록 문서 대조, 첨부 관리번호 접두 | 동일origin 파일fetch; 공유PDF/DOCX/HWP캐시; 비용합계 검산 | B3. 통화/원단위/VAT/관납료/합계누락·정규화 경계, 시스템 빈값/문서누락·둘다없는값을 일치로 보지 않는 회귀검증 |
| portal-popup-manager | 활성 | 공지차단·보지않기·팝업탭화·열린창관리 | LS kriss_pwm_cfg/log/dismissed; open/form.submit/iframe DOM 감시 | 기본차단 P13/P16, keepNative 예외·원상복구·폼POST 창계약 검증. 다른 스크립트와 훅복원 순서 확인 |
| quick-panel 묶음 | 실행대기 | Studio HTML에서 키/문맥사전 관리, AHK 물리단축키·로컬서버 | LS v21-pro-shortcut-studio-v25; v21-studio-state.json 등 생성; localhost32145 | B6. 웹Adapter와 함께 검증해야 완결. 저장 ACK/여러창 동시편집/서비스중단, JSON 내보내기·복원 및 AHK실행 확인 |

### 수행한 합성 검증
- `node work/review_browser_repro.cjs`: 5사례 모두 현재 결함조건을 재현(B1 두사례/B2 한사례/B3 두사례). 종료0은 프로그램 무결함이 아니라 assert한 결함이 재현되었다는 뜻.
- `node work/review_browser_hooks.cjs`: 2사례 모두 현재 결함조건 재현(B4 감시시작/B5 훅복원). 외부요청·실제문서저장·버튼클릭은 수행하지 않았다.
- 소스 로직·README·브라우저 활성 설정은 변경하지 않았다. 통계3종의 계산정확성 및 실제 업무자료 검증은 다른 담당범위이며 이 문서의 통과 여부로 대체할 수 없다.

재현 cjs는 기대정상동작 대신 **현재 깨진 동작을 assert**하도록 작성한 검토용 진단이다. 고친 뒤에는 해당 assert가 실패해야 하며, 제품 회귀테스트로 채택할 때 정상 기대값으로 바꾸어야 한다. 정상 동작 보증용 테스트로 그대로 CI에 넣으면 안 된다.

