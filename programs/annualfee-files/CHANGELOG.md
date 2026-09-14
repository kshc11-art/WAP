# Changelog

## v0.6.7 - 유지보수 설계도 및 Compact GUI

- `docs/MAINTENANCE_BLUEPRINT.md` 추가: 모듈 책임경계, 허용 의존방향, 변경 영향표, golden 역할, 장애 수집자료, 새 분기/새 연도 체크리스트, 안전한 수정 절차를 한 문서에 정리.
- GUI/CLI의 현재분기 파일 인식 중복을 제거하고 `core.classify_current_files()`를 단일 규칙으로 공유.
- GUI 기본 크기를 1120×900 계열에서 **960×740**으로 축소.
- GUI를 `작업` / `고급 · 로그` 탭으로 분리하여 자주 쓰는 입력/검사/생성만 첫 화면에 유지.
- 현재분기 6개 Treeview에 항목/상태/파일명과 OK/누락/중복 색상 표시.
- history/master는 2열 compact 카드로 유지하며 기존 DnD target과 picker fallback 보존.
- profile/Excel backend/부분생성/진단용 Excel 표시를 고급 탭으로 이동하고 사용자 친화적 label을 사용하되 내부 값은 기존 contract를 유지.
- GUI `환경 확인` 및 `system_doctor.bat` 추가. 이 진단은 Excel을 시작하지 않는 cheap probe이며 실제 Excel 호환성 authority는 `native_excel_selftest.bat` 그대로 유지.
- GUI가 독자 업무규칙을 소유하지 않는 원칙을 문서/AI handoff에 명시.
- portal/Excel/PDF/mapping 업무 semantic 변경 없음.

## v0.6.6

- 현재분기 `상태/인식 파일` Treeview에서도 drag-and-drop 지원. history/master Listbox도 drop target으로 확대.
- 우측 저빈도 입력영역을 history 상단 / budget master 하단 50:50 패널로 재배치.
- 신규 결과폴더: `<연도>년 <분기>분기 연차관리/` 바로 아래 `2. 수수료 납부`, `3. 연차유지료 납부`, `템퍼몽키용`. legacy `package/_automation` run은 bridge/finalize에서 계속 지원.
- MISSING/EXPLICIT_UNASSIGNED 오류에 관리번호, 청구행, 금액, 출원/등록번호, 발명명, 상세 CSV 경로와 해결 안내 표시.
- 해외 service-fee XLSX의 J(당사수수료 KRW), L(부가세)를 각각 별도 blue medium outline으로 변경. K(송금수수료)는 포함하지 않음.

## v0.6.5

- Remove non-essential `Application.Calculation` assignment from Excel COM startup; fixes Excel error 1004 on affected Office installations.
- Add stage-specific COM initialization errors.
- Replace silent Excel self-test with numbered, unbuffered, timeout-protected diagnostic.
- Add Windows/Excel release-safety maintenance prompt.
- Retain v0.6.4 ASCII-only CRLF launcher safeguards.

## v0.6.4 - Windows launcher encoding/path hotfix

- Rewrote every Windows `.bat` launcher as **ASCII-only + CRLF**.
- Removed Korean executable text and `chcp 65001` from batch files. Korean remains in Python/GUI/docs where Unicode handling is safe.
- Changed `cd /d %~dp0` to `cd /d "%~dp0"` everywhere so extraction under paths containing spaces or Korean characters works.
- Stopped relying on `activate.bat` for normal launchers; each launcher invokes `.venv\Scripts\python.exe` / `pythonw.exe` directly.
- `install_windows.bat` now accepts either the Python Launcher (`py`) or `python.exe`, checks each failure point, and verifies `pywin32`.
- `native_excel_selftest.bat` now invokes the self-test directly and propagates installer/self-test exit codes cleanly.
- Added `WINDOWS_FIRST_RUN.txt` with an ASCII-only recovery procedure.
- No changes to mapping, PDF marking, Excel Native workbook semantics, portal manifest, or Tampermonkey behavior.

상세 배경/검증/호환성은 `RELEASE_NOTES.md`를 본다.

## 0.6.3 — 2026-08-14

- 실제 Microsoft Excel에서의 열기/복구 문제와 Table 스타일 부작용을 근본적으로 피하기 위해 **업무용 XLSX 기본 backend를 Microsoft Excel Native(COM)로 전환**.
- 신규 `excel_native.py`: 원본 XLSX byte copy → Excel `Columns("A:D").Insert()` → 새 A:D만 최소 수정 → native `Range.AutoFilter()` → Save/Close → Excel 자체 ReadOnly 재오픈 검증.
- 원본 Markpro 본문 E열 이후를 재스타일링하지 않는 정책 확정. Excel Table/ListObject 생성, 행 삭제, Python 수동 hidden으로 필터 흉내내는 방식 금지.
- 신규 `excel_backend.py`: `auto/native/portable-legacy`. `auto`는 Native 실패 시 조용히 fallback하지 않고 fail-fast.
- 예산별 파일은 D열 Field 4에 실제 Excel filter criteria를 적용하고 B total `SUBTOTAL(9,...)` 계산값을 manifest amount와 재오픈 검증.
- `_automation/excel_output_validation.json` 추가. open success, AutoFilter ref/criteria, subtotal formula/value, visible/hidden rows 기록.
- 수수료 XLSX도 Excel 원본 copy에서 대상 열 blue font + 대상 블록 outer medium blue border만 추가. 내부/source border는 무변경.
- GUI에 Excel backend 선택과 `Excel 창 표시(진단용)` 옵션 추가.
- CLI에 `--excel-backend`, `--excel-visible`, `--no-excel-reopen-validation` 추가.
- Windows dependency `pywin32>=306` 추가, PyInstaller hidden import 보강.
- `native_excel_selftest.bat` 및 `tools/native_excel_selftest.py` 추가. Excel 자체로 synthetic workbook을 만들고 filter/SUBTOTAL/save/reopen까지 end-to-end 검증.
- Linux/CI에서는 `check`와 portable regression을 유지하되 `prepare --excel-backend auto`는 의도적으로 실패하고 partial run folder를 제거.

## 0.6.2 — 2026-08-14 (실험적 SAFE 경로, 운영 채택 안 함)

- Excel 열기 문제 회피를 위해 정상 writer/Table 기반 재생성을 실험. 파일은 열렸지만 원본 Markpro 본문의 선/스타일이 변하고, 전체행 유지/worksheet AutoFilter 요구와 충돌하여 정식 운영 baseline으로 채택하지 않음.

## 0.6.1 — 2026-08-14

- 2026Q3 실사용 검수 피드백 5건 반영. 예산별 XLSX는 Python 단순 숨김이 아니라 실제 worksheet `AutoFilter + filterColumn(예산명)` 상태를 보존하며 `SUBTOTAL(9,...)`이 필터된 행만 합산하도록 수정.
- 생성 4개 열 A:D의 헤더를 노란색으로 통일. 하단 총계 A/B는 초록색 band + 빨간 글씨, C/D는 기존 총계와 동일한 초록색 band로 복원.
- 예산별 PDF 빨간 행 테두리를 1.0pt → 1.6pt로 강화하고 rule-line 기반 행에서는 점선 separator 좌표 자체를 경계로 사용하여 점선을 덮도록 조정.
- 수수료 XLSX의 강조 대상 열 블록에 `#0070C0` medium **외곽선만** 적용. 내부 셀 경계는 기존 thin border를 유지하여 골든의 하나의 굵은 박스 형태를 재현.
- 수수료/송금수수료 PDF 주황 박스의 padding 기반 좌표를 폐기하고 실제 PDF drawing의 검정 실선을 탐색해 사각형 경계를 실선 위에 정렬.
- 2026Q3 재생성 검증: 국내 62/62, 해외 23/23, 예산별 AutoFilter 25/25, 생성 XLSX 36개 artifact_tool import PASS, PDF 대표 렌더 육안 검증 PASS.

## 0.6.0 — 2026-08-14

- GUI에 확정 예산 master XLSX/폴더 drag-and-drop + picker 추가. CLI `--budget-master`와 동일한 override 경로 사용.
- `fee_portal_payload(..., year=...)` 도입. 포털 수수료/송금수수료 준비금 코드도 `prep_budget_code(year)`로 연도별 처리.
- current research/tech `source_period`를 조사파일명이 아니라 invoice `(year, quarter)`에서 확정. short filename Q3 audit가 `2026Q3`으로 기록되며 history current/future cutoff도 invoice period 사용.
- `_automation/source_inputs/` + `input_provenance.json` 추가. current/history/master mapping XLSX를 byte-identical archive하고 SHA-256 기록. `mapping_audit.csv`에 `mapping_source_archived` 열 추가.
- `pdf_mark.normalize_pdf_source()` 추가. clean serialization warning / MuPDF repair가 있으면 `_automation/normalized_sources`에 내부 정규화본을 만들고 page count 검증 후 재사용. `pdf_preflight.json` 추가.
- Python 버전 single source `kriss_annual_fee/version.py` 도입. GUI/Tampermonkey/BUILD_INFO/MAINTENANCE_STATE/README를 0.6.0으로 정합화.
- `tools/generate_source_manifest.py`, `tools/validate_release.py`, `build_release_metadata.bat` 추가. SOURCE_MANIFEST schema 2는 self-hash 순환을 피하기 위해 manifest 자체 제외.
- `tools/test_portal_contract.py`의 fee budget 검증을 manifest year 기반으로 변경.
- 2026Q3 운영 입력 회귀: 국내 62/62(19그룹), 해외 23/23(6그룹), manifest 28 jobs PASS. Q3 current source period 48/37건 모두 `2026Q3`; history 0건. 국내 PDF xref warning 5건, 해외 garbage warning 1건을 정규화 후 전체 생성 성공.

## 0.5.2 — 2026-08-14

- v0.5.1 통합 이후 `MAINTAINER_SPEC.md` 전면 정합성 재작성.
- 연도별 준비금, 확장 파일명 인식, budget master, PDF anchor fallback, q1-legacy profile을 단일 명세에 통합.
- 단계별 실패모드/원리적 한계 장 신설.
- 2025Q4 facts 추가 및 알려진 외부 확정/사후변경 목록 정리.

## 0.5.1 — 2026-08-14

- `utils.py` + `models.py` + `discover.py`를 `core.py`로 통합.
- 문서 다수를 `MAINTAINER_SPEC.md`/`VALIDATIONS.md`로 통합.
- 조사파일 판별을 `(연차|특허) AND (연구부서|기술사업화)`로 확장해 `연구부서납부 특허.xlsx`, `기술사업화납부 특허.xlsx`류 지원.
- 2025Q4+master 회귀 유지.

## 0.5.0 — 2026-08-14

- `--budget-master <xlsx|folder>` 정식 입력 도입. 외부 확정/사후 예산변경을 관리번호 하드코딩 없이 표현.
- 준비금 예산코드를 연도별 테이블로 승격: 2025 `25841004`, 2026 `26841001`; 미확인 연도는 오류.
- `연차관리` 조사파일명 인식.
- 2025Q4 master 재현: 국내 53/53, 해외 40/40, 21/11 예산그룹 골든 소속 일치.

## 0.4.1 — 2026-08-14

- 2025Q4 국내 PDF처럼 건 사이 가로 separator가 없는 양식을 위한 관리번호 column anchor 행경계 fallback 추가.
- rule-line bounds가 이웃 관리번호를 포함할 때만 anchor 보정하며 보정 후에도 무결하지 않으면 `row_bounds_error`.

## 0.4.0 — 2026-08-14

- 실제 KRISS MIS 지출발의/완료/e-tax HTML을 기준으로 Tampermonkey 실제 selector/event 계약 구현.
- 지출구분, 예산코드, 비목 55630, 금액, 기타/전자세금계산서, Markpro 입금정보, 공식 행추가, 첨부 queue 보조.
- e-tax 공급자/품명/총액 후보 검색 및 unique 후보 강조. 승인번호 최종 확인/최종 선택/문서 저장은 기본 수동.
- portal contract schema/test, DOM snapshot validation, bridge smoke test 추가.

## 0.3.0 — 2026-08-14

- Tkinter GUI + `tkinterdnd2` 파일/폴더 drag-and-drop + picker fallback.
- Microsoft Excel COM runtime 의존성 제거. direct OOXML patching engine 도입.
- AutoFilter/hidden rows/SUBTOTAL/cached value/fee blue font/recalc flag 구현.
- Q2 page-bottom PDF boundary fix.
- Q2 full regression: 국내 110/110, 해외 34/34; P190141KR 외부변경 1셀 외 semantic diff 0.

## 0.2.0 — 2026-08-14

- 2026Q1 골든 분석.
- Q2 carry-over `P190114KR`, `P150159KR`을 history 일반 규칙으로 복원.
- 연구부서 행은 존재하지만 예산이 공란인 `EXPLICIT_UNASSIGNED` 상태 도입 및 오래된 예산 fallback 금지.
- `--allow-unassigned`, Q1/Q2 facts, 정확 색상/선두께/SUBTOTAL 명세 추가.
- `P190141KR` 외부 예산변경을 하드코딩하지 않는 알려진 편차로 기록.

## 0.1.0 — 2026-08-14

- 최초 Python/Excel/PDF/manifest/localhost bridge 프로토타입.
- current 6개 + optional history 입력 구조.
- 관리번호 기반 연구부서/기술사업화 예산 매핑.
- Excel COM 기반 A:D 지출열, 예산별 filter 사본, 수수료 증빙.
- PyMuPDF 빨간 행박스/노란 금액 highlight/주황 수수료 box.
- package + `_automation`, manifest/status/finalize `_(완료)` 흐름.
- 실제 portal DOM은 아직 미연결 상태로 Tampermonkey skeleton만 제공.
