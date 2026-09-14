# Excel Native Backend 운영/유지보수 명세 — v0.6.3

이 문서는 **업무 제출용 XLSX가 왜 Microsoft Excel Native(COM)로 생성되어야 하는지**, 어떤 셀만 수정하는지, AutoFilter가 어떻게 보장되는지, 장애 시 어디를 확인해야 하는지를 상세히 기록한다.

## 1. 변경 배경

v0.3~v0.6.1은 Linux/CI에서 완전한 산출물을 만들기 위해 XLSX ZIP 내부의 OOXML을 직접 수정했다. 의미 회귀검증에는 유용했지만 실제 2026Q3 사용자 검수에서 다음 문제가 확인됐다.

### 1.1 직접 OOXML 재작성에 따른 Excel 복구/열기 실패

ElementTree로 worksheet를 serialize하는 과정에서 원본 XML의 extension namespace와 `mc:Ignorable` 선언이 불일치할 수 있었다. Python parser/renderer에서는 열리지만 Microsoft Excel은 문서를 손상된 것으로 판단할 수 있었다.

### 1.2 필터 확보를 위한 Table 변환 부작용

OOXML 호환성 문제를 피하려고 정상 writer로 재생성하고 필터를 Excel Table로 구현한 실험에서는 파일은 열렸지만 원본 본문의 표시가 달라졌다.

- 가로선이 하늘색으로 보임
- 일부 세로선이 보이지 않음
- 원본 Markpro 일반 범위가 Table 스타일의 시각 규칙을 따름

업무 요구는 “예쁘게 비슷하게”가 아니라 **원본 Markpro 본문을 그대로 유지하면서 앞 4열과 필터만 추가**하는 것이다. 따라서 Table 방식도 폐기한다.

## 2. 현재 아키텍처

```text
XlsxSession (read only / portable regression)
        |
        | 관리번호/금액/헤더 읽기
        v
NativeExcelSession (Windows + Microsoft Excel)
        |
        +-- 원본 XLSX -> byte copy -> output.xlsx
        +-- Excel로 output.xlsx 열기
        +-- Columns("A:D").Insert()
        +-- A:D 값/수식/요청 서식만 입력
        +-- Range.AutoFilter()
        +-- Excel Save()
        +-- Excel Close()
        +-- Excel ReadOnly 재오픈 검증
```

### 파일

- `kriss_annual_fee/excel_native.py` — 실제 Native Excel 구현
- `kriss_annual_fee/excel_backend.py` — backend 정책
- `kriss_annual_fee/xlsx_ooxml.py` — 읽기 + legacy portable writer
- `kriss_annual_fee/excel_com.py` — 과거 import 호환용 export surface

## 3. backend 선택 정책

### `auto` — 운영 기본

- Windows에서 Native Excel을 시작한다.
- Microsoft Excel/pywin32가 없거나 COM 시작이 실패하면 **즉시 중단**한다.
- `portable-legacy`로 자동 fallback하지 않는다.

이 정책은 의도적이다. “일단 파일을 만들고 나중에 Excel에서 안 열리는 것”보다 사전에 중단하는 것이 안전하다.

### `native`

`auto`와 동일한 Native implementation을 명시적으로 요구한다.

### `portable-legacy`

과거 OOXML writer를 사용한다.

사용 목적:

- Linux CI
- private golden semantic regression
- 개발 중 PDF/manifest 경로 검증

**실제 제출파일 생성에는 사용하지 않는다.**

## 4. 원본 보존 원칙

### 4.1 수정 전에 반드시 원본을 복사

Native backend는 source workbook을 직접 열어 Save As 하지 않는다.

1. `shutil.copy2(source, output)`
2. output만 Excel로 연다.
3. source는 byte-identical로 유지된다.

### 4.2 원본 본문은 재스타일링하지 않음

A:D 삽입 후 원본 데이터는 E열 이후로 이동한다. 이 영역에 대해 다음을 하지 않는다.

- 전체 range fill 재적용
- 전체 border 재생성
- font 일괄 재설정
- Excel Table/ListObject 변환
- 열너비/행높이 재계산
- autofit

Excel이 열 삽입을 통해 원본 셀을 이동한 상태를 그대로 둔다.

## 5. 예산 구분 master workbook 생성

### 5.1 A:D 삽입

Excel API:

```python
ws.Columns("A:D").Insert()
```

직접 XML ref shift는 하지 않는다. Excel이 formula/reference/merge/extension을 스스로 이동한다.

### 5.2 새 열

| 열 | 내용 |
|---|---|
| A | 지출발의 적요 |
| B | 사용예산(지출금액) |
| C | 예산코드 |
| D | 예산명 |

본문 original amount/management/title 셀의 **format만** 새 열에 제한적으로 복사한다. 원본은 수정하지 않는다.

### 5.3 Header

- A:D 값 입력
- 기존 source header typography를 format copy
- `A1:D1` fill만 노랑 `#FFFF00`

### 5.4 데이터 행

관리번호가 해소된 행만 A:D를 채운다.

A:

```excel
="2026년 3분기("&D2&") 과제 국내특허 연차유지료"
```

B:

```excel
=<shifted 현지비용(KRW) 셀>
```

C/D는 budget code/name value.

### 5.5 총계행

원본 total row의 label/amount format을 복사한다.

- A: `지출금액`
- B: `=SUBTOTAL(9,B2:B<data_end>)`
- C/D: blank
- A/B font red `#FF0000`
- A/B/C/D fill/border는 원본 total 스타일을 기반으로 함

## 6. 예산별 파일

### 6.1 행 삭제 금지

모든 invoice row를 유지한다.

### 6.2 Python 수동 hidden 금지

다음과 같은 코드는 운영 backend에서 사용하지 않는다.

```python
row.Hidden = True
```

필터를 흉내내기 위한 수동 숨김은 `SUBTOTAL(9,...)`의 업무 의미를 깨뜨릴 수 있다.

### 6.3 Excel Native AutoFilter

base workbook에 filter dropdown을 만든다.

```python
filter_range.AutoFilter()
```

예산별 copy에서:

```python
filter_range.AutoFilter(Field=4, Criteria1=budget_name)
```

즉 D열 `예산명`이 filter field 4다.

### 6.4 Excel Table 생성 금지

다음은 사용하지 않는다.

```python
ws.ListObjects.Add(...)
```

AutoFilter는 일반 worksheet range로 충분하다.

## 7. 수수료 Excel

원본 invoice XLSX를 copy한 뒤 다음만 변경한다.

### 7.1 글씨색

- 국내 service: `당사수수료(KRW)`, `부가세`
- 해외 service: `당사수수료(KRW)`, `부가세`
- 해외 wire: `송금수수료`

대상 열 font = `#0070C0`.

### 7.2 외곽선

각 cell에 medium border를 주지 않는다. 대상 영역 전체의 outer edge만 medium blue.

Excel border indices:

- left 7
- top 8
- bottom 9
- right 10

내부 border는 원본 그대로 둔다.

## 8. 저장 후 재오픈 검증

파일을 만들었다고 성공으로 간주하지 않는다.

Native backend는 각 output을 Excel로 다시 `ReadOnly=True`로 열고 다음을 확인한다.

### master budget workbook

- Excel open 성공
- AutoFilter range 존재
- B total formula가 `SUBTOTAL`인지
- B total value가 assigned total과 일치하는지

### filtered budget workbook

- Excel open 성공
- Field 4 filter가 On인지
- Criteria1이 정확히 budget name인지
- B total formula가 `SUBTOTAL`인지
- 계산된 B total value가 manifest amount와 일치하는지
- visible/hidden row count 기록

### fee workbook

- Excel open 성공

검증기록:

```text
_automation/excel_output_validation.json
```

해당 파일이 없거나 `open_ok=false`인 XLSX가 있으면 portal 제출 전에 중단해야 한다.

## 9. Windows 설치/진단

### 설치

```bat
install_windows.bat
```

설치되는 Python dependency:

```text
pywin32>=306
```

### Native self-test

```bat
native_excel_selftest.bat
```

이 테스트는 Excel 자체로 작은 raw workbook을 만든 뒤 다음을 실제 수행한다.

1. A:D 삽입
2. native AutoFilter
3. 예산별 filter criteria
4. SUBTOTAL 계산
5. 수수료 outer border
6. Save
7. Close
8. ReadOnly reopen

self-test가 실패하면 실제 분기 자료를 처리하지 않는다.

## 10. 자주 발생할 수 있는 오류

### Excel COM 시작 실패

증상:

```text
Microsoft Excel COM 자동화를 시작하지 못했습니다
```

확인:

1. Windows인지
2. Excel Desktop 설치 여부
3. Excel 직접 실행 가능 여부
4. Office 정품 인증
5. `install_windows.bat` 재실행
6. `native_excel_selftest.bat`

### Excel 프로세스가 남음

`NativeExcelSession.close()`가 정상 호출되는지 확인한다. context manager 또는 workflow 종료 경로에서 close가 빠지면 안 된다.

### source workbook 자체가 손상

원본을 Excel에서 직접 열어본다. source 자체 repair가 필요한 경우 자동화 출력 문제와 구분해야 한다.

### 필터는 있는데 total이 틀림

1. D열 Criteria 확인
2. B total formula 확인
3. total row가 filter range 밖인지 확인
4. `excel_output_validation.json`의 `subtotal_value` 확인
5. 수동 hidden을 추가한 코드가 없는지 확인

### 원본 표 선/색상 변경

다음 중 하나가 들어갔는지 검색한다.

- `ListObjects`
- Table 생성
- body 전체 format assignment
- `AutoFit`
- E열 이후 border/fill loop

원칙상 모두 없어야 한다.

## 11. 변경 시 회귀 기준

Excel backend를 수정하면 최소 다음을 확인한다.

1. `native_excel_selftest.bat` PASS
2. 실제 Windows Excel에서 Q3 국내 예산 1개 파일 직접 열기
3. 원본 E열 이후 header/body/bottom visual 비교
4. 실제 filter dropdown에서 D열 filter 상태 확인
5. total B가 filter amount와 일치
6. 수수료 workbook의 내부 border는 원본과 동일하고 outer edge만 굵음
7. `_automation/excel_output_validation.json` 전 records `open_ok=true`

## 12. 금지되는 "쉬운 우회"

다른 AI가 장애를 고칠 때 다음 접근을 우선 선택하면 안 된다.

- openpyxl로 전체 workbook 재저장
- spreadsheet renderer import/export로 전체 workbook 정상화
- Excel Table로 필터 대체
- 행 삭제로 filtered copy 생성
- 수동 hidden + `SUBTOTAL(109)`로 의미를 우회
- OOXML namespace를 계속 patch해서 Excel repair를 억지로 피함

업무 목적은 XLSX 포맷 독립성이 아니라 **실제 Microsoft Excel에서 원본과 동일하게 열리고 작동하는 결과**다.


## v0.6.6 해외 service fee 비연속 열 외곽선

해외 invoice의 service fee 증빙은 `당사수수료(KRW)`와 `부가세`를 강조한다. 2026Q3 양식에서는 각각 J, L열이고 K는 `송금수수료`이다. 따라서 J:L을 하나의 rectangle로 감싸면 안 된다. `create_fee_workbook()`은 해외 service fee일 때 target column 각각을 독립된 full-height block으로 보고 four-edge medium blue outline을 적용한다. K열은 font/border 모두 원본을 유지한다. 해외 wire fee는 K열 단독, 국내 service fee는 인접 target range 하나를 사용한다.
