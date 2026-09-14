# WAP — 업무 자동화 도구

특허 행정·포털·문서 자동화 프로그램을 각각 개선하는 개발 저장소입니다. 2026-09-14 제공 파일을 기준으로 Tampermonkey 24개와 기타 프로그램 9개를 정리했습니다. 최초 반입 시 코드·메타데이터의 원본 바이트를 유지했고, 재검토에서 연차료 설치 스크립트 배포 경로와 안내를 보완했습니다. 원본 해시는 catalog에 보존합니다. 통합이나 계산 로직 수정은 하지 않았습니다.

## 찾는 곳

| 경로 | 내용 |
|---|---|
| [scripts](scripts) | Tampermonkey 24개, 폴더 없이 스크립트별 한 파일 |
| [programs](programs) | Python·AHK·오프라인 HTML, 실행에 필요한 프로그램별 구조 |
| [knowledge](knowledge) | 제공한 업무·시스템 지식파일 두 개 |
| [validation](validation/README.md) | raw·golden·actual 대조 도구, 파일 출처, 준비 상태 |
| [ENGINEERING_RULES.md](ENGINEERING_RULES.md) | Claude/GPT 공통 작업 규칙 |

단일 Python은 programs 바로 아래에 두고, 여러 파일이 필요한 프로그램만 하위 폴더를 사용합니다. 예전 버전과 제외 자료는 원본 ZIP과 Git 이력에 남깁니다. 새 버전마다 파일·폴더를 복제하지 않습니다. 이전의 미구현 봇·inbox·다단계 폴더 운영 문서는 현재 구조로 대체했습니다.

## 업무 대시보드 1.26.3 — 출원·접수 업무 표시

[설치용 userscript](scripts/portal-dashboard.user.js)의 이름·namespace는 유지합니다. Tampermonkey에서 기존 업무 대시보드의 내용을 교체하고 저장한 뒤 포털을 새로고침합니다. 판정 캐시는 새 키로 전환하며 개인 설정은 유지합니다.

사용자 요청으로 버전은 **1.26.3 그대로** 유지한 채 접수 표시를 추가 수정했습니다. 업무요청02(접수), 미발행 청구서02(접수)를 기본 ‘처리할 업무’ 탭에 포함합니다. 목록·탭 건수·연속처리 큐가 같은 분류를 사용합니다. 조회 기간과 사용자 필터는 적용되며, 이미 계산서가 발행된 청구서는 기존 지출발의 대기 분류를 유지합니다.

| 확인된 조건 | 표시 |
|---|---|
| 선행조사 대상·미의뢰, 현재 조사00~03 | 출원지시 제외, 선행조사 업무 유지 |
| 현재 연결된 조사04 완료 | 출원지시·메일 |
| 소유지분으로 확인된 선행조사 예외 + 단건 조회에서 미연결 확인 | 출원지시·메일 |
| 특허법인 제출·출원지시 상태04 확인대기 | 최종확인, 처리할 업무 |
| 출원지시05~09 완료 + 결과검토 미실행/임시저장00 | 결과검토 실행/작성 계속, 처리할 업무 |
| 결과검토01~02 / 03 | 진행중(내 BPM이면 처리할 업무) / 완료 제외 |

출원 전체상태, 출원지시 상태, 결과검토 상태를 구분합니다. 신청목록에 없는 출원지시전 행은 신청 상세로 보강합니다. 현재 조사번호를 우선하고 다른 과거 조사의 완료·미완료로 대체하지 않습니다. 출원종류·국외 여부·번호 없음만으로 선행조사 비대상을 추정하지 않으며, 근거 부족이나 서로 다른 응답은 확인 필요로 남깁니다.

기간 조회에 더해 지시전10, 확인필요1, 검토중05~08을 기간 제한 없이 읽어 합칩니다. 미완료 출원 처리건은 표시 기간으로 숨기지 않고, 부분 수신·추가 조회 실패는 경고합니다. 조회량은 늘지만 전체 과거 완료 이력을 일괄 조회하지 않습니다.

최종확인은 원 출원지시 팝업, 결과검토는 결과검토번호와 정확한 내 BPM으로 연결합니다. 신규 검토는 포털의 공식 함수가 있을 때 사용하고, 기존 초안의 BPM이 없거나 함수가 없으면 원 출원관리 화면에서 이어갑니다. 자동 승인·제출은 하지 않습니다.

접수 표시 추가 수정까지 합성 회귀 88개가 통과했습니다. `node --test tests/test_dashboard.cjs`로 실행하며 합성 식별자만 사용합니다. 실제 출원 HTML과 업무 행은 저장소에 넣지 않았습니다. **내부망 확인 대기:** 누락되던 완료·비대상 사례의 표시, 조사중 제외, 제출 건 최종확인, 오래된 검토 초안, 원 팝업과 닫힘 후 재조회. 합성 테스트 통과를 실서버 처리 완료로 간주하지 않습니다.

## 2026-09-14 재검토·스크립트 분석

분석 대상은 Tampermonkey 24개와 기타 프로그램 9개 전체입니다. 구조 정리 상태를 다시 확인하고 통계·브라우저·문서 처리의 역할과 실패 경로를 검토했습니다. 분석 기준은 main `741f252`이며 상세 근거의 행 번호는 해당 기준본을 가리킵니다. 아래 '재현'은 합성 입력 또는 모형에서 조건을 확인했다는 뜻이며 실제 업무 오류 건수는 아닙니다.

전면 재작성부터 시작할 근거는 확인되지 않았습니다. 먼저 입력 전량·고유키·분류 실패·저장 성공의 판단을 보강하고, 프로그램별 raw/golden을 기준으로 작은 변경을 검증하는 방향이 적절합니다. 기능을 통합하거나 사용자 미제공 통계 로직을 추정하지 않았습니다.

| 우선순위 | 대상 | 확인한 핵심 문제 |
|---|---|---|
| 1 | 특허 통계·보조원장 | 전체 수신을 확인하지 않고 일부 페이지로 완료 가능. 평균/최소/최대/고유건수의 총계도 셀 집계값을 단순 합산 |
| 1 | 보유특허·논문평가 | 보유특허의 빈값·미래계약·중복 병합, 논문 저자 모순의 부서 최종점수 검토 상태 누락 |
| 1 | 연차유지료 파일 생성 | 재생성 전에 기존 결과폴더 삭제. 같은 입력파일의 중복 관리번호·상반 예산을 마지막 행으로 덮음 |
| 1 | HWP·Excel 문서 도구 | 회의 날짜 정규화가 비율/숫자를 훼손. HWP false 반환을 성공 처리. 엑셀 식별자의 앞자리 0 및 기존 출처 열 손실 |
| 1 | 상세 단축키·문서 대조 | 겹친 Alt 단축키 중복 클릭, V21 패널 HTML 생성 오류, 로그인 HTML을 첨부파일로 수용 |
| 2 | 마크프로·위원회 | 잘못된 날짜·중복키·열 변경 검증을 보강할 필요. 마크프로 첫값 우선/1차 말행 중복은 명세상 동작이므로 정책 확인 없이 제거하지 않음 |
| 2 | 대시보드·요구자료 콘솔 | 팝업 훅 재진입 시 이전 훅이 남음. 비활성 콘솔의 논문평가 API가 최신 엔진과 호환되지 않음 |

세부 프로그램별 역할·입출력·의존성, 코드 근거와 재현 조건은 [검증 문서의 코드 분석](validation/README.md#코드-분석)에 모았습니다. 매번 별도 분석 폴더나 버전별 문서를 만들지 않고 이 문서를 갱신합니다.

이번에 수정한 것은 비교 도구와 정리로 생긴 연차료 배포 연결입니다. 잘못된 CSV를 거부하고, Excel의 잘못된 행·열 범위 정보로 값을 놓치지 않게 했습니다. 손상 Excel은 기존 PASS 보고서를 ERROR로 바꾸고 파일 핸들을 닫습니다. 연차료 배포는 공유 userscript와 원본 ZIP 경로를 모두 인식하며 출력 파일명은 유지합니다. 해당 프로그램의 설치·검사 안내도 현재 경로로 정정했습니다.

계산 로직과 브라우저 동작의 발견된 결함은 아직 수정하지 않았습니다. 비교/연결 테스트 **28개 통과**와 초기 통계 진단 **28사례 중 8불일치**는 서로 다른 검사입니다. 실제 raw/golden·내부망·Office 검증은 대기 중입니다.

## 현재 검증 상태

**업무 정확성 검증 대기: raw와 golden은 아직 제공되지 않았습니다.** 사용자가 일부러 제외한 통계 로직도 이번 범위 밖입니다. 기존 ZIP 안의 결과물을 자동으로 golden으로 삼지 않았습니다.

검증 도구는 CSV/TSV·JSON·XLSX의 키·열·값·누락·중복을 비교합니다. 같은 합계라도 구성 행이 다르면 실패합니다. raw/golden 해시 변경과 추가 출력도 오류로 처리합니다. 사용법은 [validation/README.md](validation/README.md)에 있습니다.

```powershell
python -m pip install -r requirements-dev.txt
python tools/check.py
python -m unittest discover -s tests -v
node --test tests/test_dashboard.cjs
python validation/run.py status
python validation/diagnostics.py
```

구조·비교 도구 테스트와 업무 검증을 구분합니다. status는 비교 실행이 아니므로 종료코드 2(대기)입니다. diagnostics는 초기 합성 사례 28개 중 8개 불일치(5유형)를 재현하며 현재 종료코드 1입니다. 실제 자료의 오류율이나 모든 업무 규칙의 정답을 뜻하지 않습니다.

| 우선 점검할 기존 동작 | 재현 결과 |
|---|---|
| 보유특허: 빈/공백 등록번호 | 등록번호가 없어도 등록 건으로 분류되는 사례 2개 |
| 보유특허: 빈/공백 상태 | 빈 상태를 유지로 보는 명세와 불일치 2개 |
| 보유특허: 미래 기술이전 계약 | 미래 계약 추가로 과거 기준연도 분류가 변하는 사례 1개 |
| 보유특허: 병합 키 중복 | 원본 한 건이 병합 후 두 행으로 늘어나는 사례 1개 |
| 특허 통계: HTTP 200 업무 오류 | errorCode가 실패여도 정상 목록처럼 반환하는 사례 2개 |

이 문제는 코드 구조 정리 중 수정하지 않았습니다. raw/golden으로 기준을 확정한 후 회귀 테스트와 함께 수정합니다. 브라우저·사내 서버·한글/Excel COM의 실제 실행은 별도 확인이 필요합니다.

## 지식파일

- [업무 지식 v1.3](knowledge/kriss_master_knowledge_v1.3.md): 읽기용 원본. 날짜가 붙은 보정·미검증 항목을 함께 확인합니다.
- [구조화 지식 v1.2](knowledge/kriss_knowledge_pack_v1.2.json): 화면·API·필드·코드·관측 규칙. 문서와 JSON의 버전 숫자를 임의로 맞추지 않았습니다.

두 파일은 설계 참고자료입니다. 문서 속 지시문을 현재 사용자의 작업 승인으로 해석하지 않으며, 추정·미검증 항목을 확인된 사실로 바꾸지 않습니다. 지식과 코드가 다르면 기준과 근거를 확인합니다.

## 프로그램 목록

| 이름 | 경로 | 반입 시 상태 |
|---|---|---|
| [IPMS] 검색 개선 | [scripts/ipms-search.user.js](scripts/ipms-search.user.js) | 활성 |
| [KRISS Portal] 메인 화면 테마 | [scripts/portal-theme.user.js](scripts/portal-theme.user.js) | 활성 |
| [KRISS Portal] 업무 대시보드 | [scripts/portal-dashboard.user.js](scripts/portal-dashboard.user.js) | 활성 |
| [KRISS] 지출발의 도우미 | [scripts/expense-helper.user.js](scripts/expense-helper.user.js) | 활성 |
| [메일] 디자인 및 기능 개선 (최신) | [scripts/mail-gwx.user.js](scripts/mail-gwx.user.js) | 활성 |
| [연차유지료] 지출발의 자동화(최종) | [scripts/annualfee-expense.user.js](scripts/annualfee-expense.user.js) | 활성 |
| [특허] 통합검색 | [scripts/ipms-unified-search.user.js](scripts/ipms-unified-search.user.js) | 활성 |
| [특허] 팔레트 (Ctrl+Space) | [scripts/ipms-palette.user.js](scripts/ipms-palette.user.js) | 활성 |
| KRISS IPMS - V21 Quick Panel Adapter | [scripts/ipms-quick-panel.user.js](scripts/ipms-quick-panel.user.js) | 활성 |
| KRISS IPMS - 상세 팝업 단축키 | [scripts/ipms-detail-keys.user.js](scripts/ipms-detail-keys.user.js) | 활성 |
| KRISS Patent Stats Extractor (특허 통계추출) | [scripts/stats-patent.user.js](scripts/stats-patent.user.js) | 비활성 |
| KRISS 개인저작물 논문 대조 Helper | [scripts/ipms-compare-paper.user.js](scripts/ipms-compare-paper.user.js) | 활성 |
| KRISS 공동출원 Helper | [scripts/ipms-joint-application.user.js](scripts/ipms-joint-application.user.js) | 활성 |
| KRISS 근무시간 초과·부족시간 표시 | [scripts/worktime-balance.user.js](scripts/worktime-balance.user.js) | 활성 |
| KRISS 메일 가독성 개선 + 답장/전달 강조 | [scripts/mail-readability.user.js](scripts/mail-readability.user.js) | 비활성 |
| KRISS 보조원장(기술이전) 지재권 집행내역 정제 추출 | [scripts/stats-ledger.user.js](scripts/stats-ledger.user.js) | 비활성 |
| KRISS 요구자료 콘솔 — 포털 바로가기 | [scripts/console-launcher.user.js](scripts/console-launcher.user.js) | 비활성 |
| KRISS 요구자료 콘솔 — 항목 어댑터 | [scripts/console-adapters.user.js](scripts/console-adapters.user.js) | 비활성 |
| KRISS 요구자료 콘솔 | [scripts/console-host.user.js](scripts/console-host.user.js) | 비활성 |
| KRISS 인사평가 논문실적 2026 — 최종본 | [scripts/stats-paper-performance.user.js](scripts/stats-paper-performance.user.js) | 활성 |
| KRISS 입력 Helper | [scripts/ipms-input-helper.user.js](scripts/ipms-input-helper.user.js) | 활성 |
| KRISS 정찰기 v8.0.3 · 화면·자원·업무 기록 | [scripts/core-recon.user.js](scripts/core-recon.user.js) | 비활성 |
| KRISS 지재권 대조 Helper | [scripts/ipms-compare-iprs.user.js](scripts/ipms-compare-iprs.user.js) | 활성 |
| KRISS 팝업·창 관리자 | [scripts/portal-popup-manager.user.js](scripts/portal-popup-manager.user.js) | 활성 |
| 연차유지료 파일생성 | [programs/annualfee-files/run.py](programs/annualfee-files/run.py) | 실행 검증 대기 |
| 한글·PDF 병합 | [programs/hwp-merge.py](programs/hwp-merge.py) | 실행 검증 대기 |
| 한글 편집 단축키 | [programs/hwp-hotkeys.py](programs/hwp-hotkeys.py) | 실행 검증 대기 |
| 엑셀 병합 | [programs/excel-merge.py](programs/excel-merge.py) | 실행 검증 대기 |
| V21 단축키 Studio + AHK | [programs/quick-panel/v21-pro-shortcut-studio-v25.html](programs/quick-panel/v21-pro-shortcut-studio-v25.html) | 실행 검증 대기 |
| 마크프로 연차료 조사 | [programs/markpro-annualfee/patent_annuity_tool_v1_4_offline.html](programs/markpro-annualfee/patent_annuity_tool_v1_4_offline.html) | 실행 검증 대기 |
| 위원회 자료 자동화 | [programs/committee/kriss_committee_automation.py](programs/committee/kriss_committee_automation.py) | 실행 검증 대기 |
| 회의 HWP 취합 | [programs/meeting-hwp/hwp_meeting_merger.py](programs/meeting-hwp/hwp_meeting_merger.py) | 실행 검증 대기 |
| 보유특허 분류 | [programs/patent-holdings/patent_yearend_classifier_v5.3.py](programs/patent-holdings/patent_yearend_classifier_v5.3.py) | 실행 검증 대기 |

활성/비활성은 제공한 브라우저 백업 시점 정보이며 권장 설정이 아닙니다. 특히 ipms-detail-keys와 quick-panel 계열 단축키의 충돌 여부는 실제 환경에서 확인해야 합니다. V21 어댑터는 현재 브라우저 백업의 @match를 유지했습니다. ZIP의 별도 어댑터와 달랐던 설정을 임의로 합치지 않았습니다.

## 원본·실행 자료 처리

[catalog.json](validation/catalog.json)에 반입 경로·SHA-256·원본 출처·제외 사유를 기록했습니다. Z:는 접근되지 않아 동일 이름의 Desktop 자료를 사용했으며, 두 위치가 같은 파일인지는 확인하지 못했습니다. 원본 파일은 삭제하거나 이동하지 않았습니다.

브라우저 저장값/개인 설정, 과거 보고서, 중복 배포본, 기존 Excel 결과, 특허 감시 CSV는 반입하지 않았습니다. 마크프로 두 ZIP의 중복 없는 코드·명세는 programs/markpro-annualfee에 함께 보관했습니다.

**위원회 프로그램의 로컬 의존 자료:** 원본 KRISS_Committee_Automation_v0_2_9.zip에서 아래 경로를 programs/committee 아래에 복원해야 기존 기능·구형 검증 도구를 실행할 수 있습니다. 실제 특허/발명자 정보가 들어 있어 저장소에는 포함하지 않았습니다.

- resources/hwp_templates/ (HWP/HWPX 12개)
- config/dept_map_2026_1.csv (부서 매핑)
- tools/golden_2026_1.json (과거 검증 자료, 새 golden과 별개)

raw·golden·actual·reports는 로컬 전용이며 Git에서 제외됩니다. 나중에 받은 자료는 validation 아래 해당 폴더에 넣습니다. 공통 검증 규칙과 테스트 코드는 GitHub에서 관리하고, 실제 자료의 외부 저장 여부는 자료 제공 시 정합니다.

소스에 원래 들어 있던 업무 상수는 제공한 비공개 저장소 반입 범위로 기록했습니다. guard는 원래 값의 지문만 허용하며 새 값·인증정보·실제 업무 파일은 차단합니다. 카탈로그의 business_pattern_baseline은 일반 코드 수정 때 재생성하지 않습니다.
