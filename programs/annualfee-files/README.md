# KRISS 연차유지료 자동화 v0.6.7

> **유지보수 설계도/Compact GUI (v0.6.7):** `docs/MAINTENANCE_BLUEPRINT.md`를 구조의 첫 진입점으로 추가했습니다. GUI는 기본 960×740으로 축소하고 `작업` / `고급 · 로그` 탭으로 분리했습니다. 현재분기 인식·사전검사·생성은 첫 화면에, profile/Excel backend/부분생성/환경진단/로그는 고급 탭에 둡니다. GUI와 CLI의 현재분기 파일 인식은 이제 `core.classify_current_files()` 한 규칙을 공유합니다.

> **GUI/결과폴더 개선 (v0.6.6):** 현재분기 상태/인식파일 표 자체도 드래그앤드롭을 받고, 우측의 과거분기/확정예산 영역을 반씩 나눠 저빈도 입력을 작게 배치했습니다. 결과는 `2026년 3분기 연차관리`처럼 생성되며 바로 아래에 `2. 수수료 납부`, `3. 연차유지료 납부`, `템퍼몽키용` 세 폴더가 보입니다. 미매핑 오류는 관리번호/청구행/금액/출원·등록번호/발명명을 함께 표시합니다. 해외 납부수수료 XLSX는 J열과 L열을 각각 별도 외곽선으로 강조합니다.


> **Windows/Excel COM hotfix (v0.6.5):** keeps the ASCII-only/CRLF launcher rules from v0.6.4 and removes the non-essential `Application.Calculation` assignment that caused Excel COM startup error 1004 (`Unable to set the Calculation property of the Application class`) on some Windows/Office installations. The Excel self-test now prints numbered progress steps and times out instead of appearing to hang.

분기별 마크프로 국내/해외 연차유지료 청구자료와 KRISS 내부 조사자료를 결합하여 **예산별 XLSX/PDF, 수수료 증빙, 포털 작업 manifest, 최종 ZIP**을 만드는 Windows 중심 자동화 도구입니다.

v0.6.3은 **업무용 Excel 산출 방식을 Microsoft Excel Native(COM)로 되돌린 신뢰성 수정 릴리스**입니다. v0.6.1/실험적 v0.6.2에서 실제 Excel이 파일을 복구 대상으로 판단하거나, 필터를 얻기 위해 Excel Table로 변환하면서 원본 Markpro 서식이 바뀌는 문제가 확인되었습니다. 이 릴리스부터 업무용 XLSX는 원본 파일을 먼저 복사한 뒤 Microsoft Excel 자체가 A:D 삽입, 값/수식 입력, AutoFilter 적용, 저장, 재오픈 검증까지 수행합니다.

핵심 원칙은 다음과 같습니다.

1. **원본 Markpro 본문은 재스타일링하지 않음** — 기존 E열 이후 값/서식/테두리/열너비/행높이는 Excel의 열 삽입 결과를 그대로 둡니다.
2. **실제 Excel AutoFilter 사용** — 예산별 파일은 행을 삭제하거나 Python에서 임의 숨김하지 않고 D열 예산명에 Excel 자체 필터 조건을 겁니다.
3. **SUBTOTAL은 필터 결과를 계산** — 총계 B셀은 `SUBTOTAL(9,B2:B...)`이며 저장 후 Excel을 다시 열어 실제 계산값까지 검증합니다.
4. **Excel Table 사용 금지** — 필터 버튼을 만들기 위해 범위를 Table로 변환하지 않습니다. 원본의 하늘색 선/세로선 등 표시가 달라지는 부작용을 방지합니다.
5. **운영 실패 시 fail-fast** — `auto` 모드는 Windows에서 Excel Native를 요구하며 OOXML writer로 몰래 fallback하지 않습니다. Excel이 없으면 업무 파일을 만들지 않고 명확히 중단합니다.
6. **Portable backend는 개발 전용** — `portable-legacy`는 과거 골든/CI 회귀검사용으로만 남기며 실제 제출파일 생성에는 권장하지 않습니다.

전체 버전별 상세 변경내역은 **`RELEASE_NOTES.md`**를 먼저 보세요.

---

## 1. 권장 환경

- Windows 10/11
- Python 3.11 이상
- **Microsoft Excel Desktop (업무용 XLSX 생성 시 필수)**
- Chrome/Edge + Tampermonkey (포털 자동화 사용 시)

`사전 검사`는 Excel 없이도 가능하지만, `전체 파일 생성`의 기본 `auto`/`native` 모드는 Microsoft Excel을 사용합니다. 설치 스크립트는 `pywin32`까지 준비하며, `native_excel_selftest.bat`로 실제 Excel AutoFilter/저장/재오픈 동작을 독립 검증할 수 있습니다.

빠른 환경정보만 확인하려면 `system_doctor.bat`을 사용할 수 있습니다. 이 도구는 Excel을 직접 시작하지 않으므로 설치/패키지/pywin32 상태 확인용이고, 실제 업무 XLSX 호환성의 최종 기준은 계속 `native_excel_selftest.bat`입니다.

---

## 2. 가장 쉬운 사용법 — GUI

### 설치

```text
install_windows.bat
```

### 실행

```text
launch_gui.bat
```

GUI 입력 영역은 세 종류입니다.

### 2.1 현재 분기 자료 — 필수 6개

파일 또는 폴더를 드래그앤드롭할 수 있습니다.

- `E0259-INV-...-국내.pdf`
- `E0259-INV-...-국내.xlsx`
- `E0259-INV-...-해외.pdf`
- `E0259-INV-...-해외.xlsx`
- 연구부서 조사 XLSX
- 기술사업화 조사 XLSX

조사파일은 다음과 같은 다양한 실제 명칭을 인식합니다.

- `2026년도 2분기 연차유지 지출(연구부서 납부).xlsx`
- `2026년도 2분기 연차유지 지출(기술사업화그룹).xlsx`
- `연구부서납부 특허.xlsx`
- `기술사업화납부 특허.xlsx`
- `...연차관리...연구부서...xlsx` / `...연차관리...기술사업화...xlsx`

각 현재분기 종류는 정확히 1개여야 하며 중복이면 임의 선택하지 않습니다.

### 2.2 과거 분기 조사자료 — 선택/권장

이전 분기에 조사됐지만 현재 분기에 지출되는 관리번호를 찾기 위한 history입니다. 파일/폴더를 드롭하면 조사 XLSX만 재귀 수집합니다.

확인된 2026Q2 carry-over:

- `P190114KR` → 2026Q1 연구부서
- `P150159KR` → 2026Q1 연구부서

현재 조사행이 존재하지만 예산이 비어 있는 `EXPLICIT_UNASSIGNED`는 history로 우회하지 않습니다.

### 2.3 확정 예산 master — 선택

v0.6부터 GUI에서도 지원합니다. 부서 회신, 외부 조회, 사후 예산변경처럼 **현재 6개 파일만으로는 결정할 수 없는 예산**을 명시적으로 공급합니다.

필수 헤더:

- `관리번호` 또는 `고객관리번호`
- `예산코드` 또는 `사용예산코드`
- `예산명` 또는 `사용예산명`

폴더를 드롭하면 일반 invoice/수수료/연구·기술사업화 조사파일을 제외한 XLSX를 master 후보로 수집합니다. 같은 관리번호가 여러 master에서 서로 다른 값이면 중단합니다.

### 2.4 실행 순서

1. 현재분기 6개 파일 입력
2. 필요 시 history 입력
3. 필요 시 확정 예산 master 입력
4. 출력 옵션에서 Excel 출력은 기본 `auto` 유지
5. `사전 검사`
6. 매핑 건수/합계/미배정/미매핑 및 Excel Native 환경 확인
7. `전체 파일 생성`
8. 생성 완료 후 `결과 폴더 열기`
9. 포털 사용 시 `포털 브리지 시작`
10. 포털 처리 후 `최종 ZIP 만들기`

`tkinterdnd2`가 로드되지 않는 환경에서도 파일/폴더 선택 버튼은 계속 동작합니다.

---

## 3. CLI

### 사전검사

```bat
.venv\Scripts\python.exe run.py check ^
  --input "C:\KRISS\2026Q3\input" ^
  --history "C:\KRISS\history" ^
  --budget-master "C:\KRISS\budget_master"
```

### 전체 생성

```bat
.venv\Scripts\python.exe run.py prepare ^
  --input "C:\KRISS\2026Q3\input" ^
  --history "C:\KRISS\history" ^
  --budget-master "C:\KRISS\budget_master" ^
  --output "C:\KRISS\output" ^
  --profile q2-current ^
  --excel-backend auto
```

`--budget-master`는 XLSX 하나 또는 폴더를 받을 수 있습니다.

Excel 출력 옵션:

- `--excel-backend auto` — 운영 기본값. Windows에서 Microsoft Excel Native 사용. 실패 시 중단.
- `--excel-backend native` — Excel Native를 명시적으로 요구.
- `--excel-backend portable-legacy` — 과거 OOXML writer. 개발/회귀검증 전용이며 실제 제출파일에는 권장하지 않음.
- `--excel-visible` — 자동화 중 Excel 창 표시. 문제 진단용.
- `--no-excel-reopen-validation` — 저장 후 Excel 자체 재오픈 검증 생략. 일반 업무에서는 사용하지 않음.

### 안전 옵션

- `--allow-unassigned` — 조사행은 있으나 예산이 비어 있는 건을 제외하고 부분 생성
- `--allow-missing` — 현재/history/master 어디에도 없는 건을 제외하고 부분 생성

일반 업무에서는 둘 다 **OFF**가 권장됩니다. 자동화가 모르는 예산을 임의 배정하지 않는 것이 기본 정책입니다.

---

## 4. 생성 결과

예:

```text
2026년 3분기 연차관리/
  2. 수수료 납부/
  3. 연차유지료 납부/
  템퍼몽키용/
    kriss_portal_automation.user.js
    manifest.json
    validation.json
    mapping_audit.csv
    pdf_mark_report.json
    pdf_preflight.json
    input_provenance.json
    source_inputs/
      current_research/
      current_tech/
      history/
      budget_master/
    normalized_sources/     # PDF 경고가 있을 때만 생성/사용
```

### `mapping_audit.csv`

관리번호마다 다음을 기록합니다.

- 국내/해외
- Excel 행
- 지출금액
- 최종 예산코드/예산명
- `current_research`, `current_tech`, `history_*`, `budget_master`
- **현재분기는 조사파일명이 짧아도 invoice 분기(`2026Q3` 등)를 기록**
- 원 입력 경로
- `템퍼몽키용/source_inputs/`에 보관한 archive 경로

### `input_provenance.json`

매핑에 영향을 주는 XLSX 사본의 파일명, byte size, SHA-256, 보관 위치를 기록합니다. GUI staging 임시폴더가 삭제돼도 어떤 입력으로 결과가 만들어졌는지 재현할 수 있습니다.

### `pdf_preflight.json`

PDF의 page count, MuPDF repair 여부, 경고 목록, 내부 정규화 사용 여부를 기록합니다. 정규화본은 `템퍼몽키용/normalized_sources`에만 두고 실제 업무 package에는 원본 PDF를 그대로 보존합니다.

---

## 5. 예산 매핑 정책

우선순위:

1. **확정 budget master** — 있으면 최종 확정값으로 override
2. 현재분기 연구부서 유효 예산
3. 현재분기 기술사업화 → 지식재산권준비금
4. 현재분기 어느 쪽에도 관리번호가 없을 때만 과거 history 최신순
5. 연구부서 행은 존재하지만 예산 공란이면 `EXPLICIT_UNASSIGNED`로 중지
6. 아무 입력에도 없으면 `MISSING`

기술사업화/수수료의 지식재산권준비금 코드는 연도별입니다.

- 2025: `25841004`
- 2026: `26841001`

숫자 패턴으로 추론하지 않습니다. 새 연도는 실물 확인 후 `PREP_BUDGET_CODES_BY_YEAR`에 추가해야 합니다.

---

## 6. XLSX 엔진

### 운영 기본: Microsoft Excel Native

업무파일은 **원본 XLSX를 복사한 뒤 Excel COM으로 최소 수정**합니다.

- 원본 A:R/U 등 Markpro 데이터는 Excel의 열 삽입 결과 외에 재스타일링하지 않음
- A:D 4열만 새로 생성
- A:D header 노란색
- 지출금액은 관납료/현지비용 본체만 참조
- 마지막 A/B는 기존 total-row 서식을 복사한 뒤 빨간 글씨, C/D는 기존 total fill을 그대로 복사
- 총계 B셀 `SUBTOTAL(9,B2:B...)`
- 예산별 사본은 D열에 **Excel native AutoFilter** 적용
- 비대상 행 삭제 금지 / Python `Row.Hidden` 직접 설정 금지
- Excel Table/ListObject 생성 금지
- 수수료 대상 열 파란 글씨 `#0070C0`; 대상 블록은 바깥쪽 medium 파란 outline만 추가
- 저장 후 같은 Excel 인스턴스로 결과를 다시 열어 AutoFilter/criteria/SUBTOTAL 값을 검증

검증기록은 `템퍼몽키용/excel_output_validation.json`에 남습니다.

### 개발용: portable-legacy

과거 `xlsx_ooxml.py` writer는 Linux 골든 회귀 등 개발 목적으로만 남깁니다. 실제 업무 제출파일을 이 backend로 생성하는 것은 권장하지 않습니다.

상세한 변경 금지사항과 COM 동작은 `docs/EXCEL_NATIVE_BACKEND.md` 및 `docs/MAINTAINER_SPEC.md`를 참고하세요.

---

## 7. PDF 엔진

예산별 PDF는 원본 전체 페이지를 유지합니다.

- 대상 관리번호 행 전체: 빨강 `#E52237`
- 대상 지출금액: 노랑 `#FFFF00`
- 수수료 증빙: 주황 `#FF5500`

행 경계는 페이지/좌표 하드코딩이 아니라 텍스트 anchor와 가로 구분선을 사용합니다. 2025Q4처럼 건별 선이 없는 양식은 관리번호 anchor 보정 경로를 사용합니다.

### v0.6 PDF preflight

마크프로 PDF 중 일부는 정상 열람되지만 내부 xref/garbage 경고가 존재합니다. v0.6은 한 번 clean serialization을 수행해 경고를 수집하고, 경고가 있거나 MuPDF가 repair한 경우에만 내부 정규화본을 사용합니다.

- 원본 업무 PDF: 변경하지 않음
- 정규화본: `_automation/normalized_sources/`
- 표시 결과 PDF: 정규화본을 기반으로 생성 가능
- page count 변경 시 즉시 중단

2026Q3 실제 파일에서 국내 xref 경고 5건, 해외 version marker 경고 1건을 탐지하고 자동 정규화 후 전체 생성에 성공했습니다.

---

## 8. KRISS MIS 포털 자동화

파일 생성과 포털 DOM 조작은 분리되어 있습니다.

```bat
.venv\Scripts\python.exe run.py serve --run "C:\KRISS\output\2026년 3분기 연차관리"
```

Tampermonkey 설치 파일:

```text
tampermonkey/kriss_portal_automation.user.js
```

기본 흐름:

`다음 작업 → ① 입력 준비 → 화면 확인 → ② 행추가+첨부 → 포털 저장(수동) → ③ 저장 후 완료기록`

자동 보조 범위:

- 지출구분 `특허 출원/등록/연차료`
- 예산코드/예산명 검증
- 비목 `55630 / 지식재산권출원등록비`
- 금액/적요
- 연차 본체/송금수수료: `기타`, 계좌입금, Markpro 입금정보
- 서비스 수수료: 전자세금계산서 조회 후보 검색/강조
- PDF/XLSX 첨부 queue
- 공식 `행추가` 버튼

**최종 저장과 전자세금계산서 승인번호 최종 확인은 기본 수동입니다.**

v0.6에서는 수수료 job의 portal 예산코드도 `prep_budget_code(year)`를 사용하므로 2025 재현 시 Python job과 portal payload가 서로 다른 준비금 코드를 가지는 문제가 없습니다.

실제 포털 live 검증에서 여전히 확인할 항목:

- Dropzone queue가 실제 저장 후에도 유지되는지
- Kendo e-tax popup이 실세션에서 정확히 1회 열리는지

상세: `docs/PORTAL_AUTOMATION_SPEC.md`, `docs/PORTAL_HANDOFF.md`.

---

## 9. 최종 ZIP

포털 완료기록 후:

```bat
.venv\Scripts\python.exe run.py finalize --run "C:\KRISS\output\2026년 3분기 연차관리"
```

`completed` 상태인 budget job 폴더에만 `_(완료)`를 붙이고 최종 ZIP을 만듭니다.

---

## 10. Windows EXE

```text
build_windows_exe.bat
```

Windows에서 PyInstaller one-file GUI EXE를 생성합니다. Linux에서 Windows EXE cross-build를 전제로 하지 않습니다.

---

## 11. 릴리스 정합성 검증

v0.6부터 `SOURCE_MANIFEST.json`은 직접 손으로 관리하지 않습니다.

```bat
build_release_metadata.bat
```

또는:

```bat
python tools\test_v06_contracts.py
python tools\generate_source_manifest.py
python tools\validate_release.py
```

`test_v06_contracts.py`는 private 분기자료 없이도 버전 단일소스, 2025/2026 준비금 코드, 수수료 portal payload의 연도 처리, current explicit-unassigned의 invoice-derived `source_period`, 미확인 연도 fail-fast를 검사합니다. Q2 골든이 있는 유지보수 환경에서는 `tools\regression_q2.py`도 함께 실행하세요.

검사 항목:

- Python package version
- BUILD_INFO / MAINTENANCE_STATE version
- README title
- Tampermonkey metadata/내부 VERSION
- 실제 파일 목록 vs SOURCE_MANIFEST
- byte size / SHA-256
- 삭제된 `docs/*.md`를 가리키는 stale Markdown reference

`SOURCE_MANIFEST.json` 자체는 self-hash 순환을 피하기 위해 manifest에서 제외하며 이 정책을 JSON에 명시합니다.

---

## 12. 검증된 데이터셋

### 2026Q1
- legacy/history 의미 검증
- `P190081KR` explicit-unassigned 사례

### 2026Q2
- 국내 110/110, 해외 34/34
- carry-over 2건 history 복원
- Q2 golden semantic regression

### 2025Q4
- q1-legacy 공백 규칙
- 2025 준비금 `25841004`
- 외부 확정/사후 변경을 budget master로 재현
- 건별 separator가 없는 국내 PDF anchor fallback

### 2026Q3 — v0.6 운영 입력 검증
- 국내 62/62, 19 예산그룹, 13,604,700원
- 해외 23/23, 6 예산그룹, 33,049,302원
- history fallback 0건
- 현재 매핑 출처 audit: `current_research_2026Q3` 48건 / `current_tech_2026Q3` 37건
- portal manifest 28 jobs
- PDF 국내 5 warnings / 해외 1 warning → 내부 정규화 후 전체 생성 성공

Q3는 아직 사용자가 제공한 **완료 ZIP 골든이 아니라 운영 입력 회귀 fixture**입니다. 따라서 폴더 `_(완료)` 상태나 포털 최종 결과의 골든으로 사용하지 않습니다.

---

## 13. 유지보수자가 먼저 읽을 문서

1. `docs/MAINTENANCE_BLUEPRINT.md` — 구조/책임경계/변경영향/장애수집자료 설계도
2. `docs/MAINTAINER_SPEC.md` — 상세 업무규칙/구현/실패모드 단일 권위 명세
3. `MAINTENANCE_STATE.json` — 현재 검증 상태/미해결 위험
4. `RELEASE_NOTES.md` — 0.1.0부터 현재까지 실패원인까지 포함한 상세 릴리스 이력
5. `docs/AI_HANDOFF_PROMPT.md` — 다른 AI에게 프로젝트와 함께 주는 시작 프롬프트
6. `docs/AI_MAINTENANCE_PLAYBOOK.md` — 장애 유형별 조사 순서
7. `docs/VALIDATIONS.md` — 과거 회귀/검증 기록 원문
8. `docs/PORTAL_AUTOMATION_SPEC.md` — 실제 KRISS MIS DOM/이벤트/전자세금계산서/첨부 계약
9. `docs/PORTAL_HANDOFF.md` — live 검증 상태

### 유지보수 금지사항

- 관리번호별 예산 하드코딩
- 미매핑을 유사도/이름으로 추측
- `EXPLICIT_UNASSIGNED`를 조용히 과거 예산으로 fallback
- PDF 페이지/행 좌표 하드코딩
- 최종 포털 저장/전자세금계산서 승인번호 확인을 검증 없이 자동화
- 릴리스 버전/manifest를 여러 파일에서 수기로 독립 관리
