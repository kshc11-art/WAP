# WAP — 업무 자동화 도구

특허 행정·포털·문서 자동화 프로그램을 각각 개선하는 개발 저장소입니다. 2026-09-14 제공 파일을 기준으로 Tampermonkey 24개와 기타 프로그램 9개를 정리했습니다. 기존 프로그램의 코드·메타데이터는 원본 바이트를 유지했습니다. 통합이나 계산 로직 수정은 하지 않았습니다.

## 찾는 곳

| 경로 | 내용 |
|---|---|
| [scripts](scripts) | Tampermonkey 24개, 폴더 없이 스크립트별 한 파일 |
| [programs](programs) | Python·AHK·오프라인 HTML, 실행에 필요한 프로그램별 구조 |
| [knowledge](knowledge) | 제공한 업무·시스템 지식파일 두 개 |
| [validation](validation/README.md) | raw·golden·actual 대조 도구, 파일 출처, 준비 상태 |
| [ENGINEERING_RULES.md](ENGINEERING_RULES.md) | Claude/GPT 공통 작업 규칙 |

단일 Python은 programs 바로 아래에 두고, 여러 파일이 필요한 프로그램만 하위 폴더를 사용합니다. 예전 버전과 제외 자료는 원본 ZIP과 Git 이력에 남깁니다. 새 버전마다 파일·폴더를 복제하지 않습니다. 이전의 미구현 봇·inbox·다단계 폴더 운영 문서는 현재 구조로 대체했습니다.

## 현재 검증 상태

**업무 정확성 검증 대기: raw와 golden은 아직 제공되지 않았습니다.** 사용자가 일부러 제외한 통계 로직도 이번 범위 밖입니다. 기존 ZIP 안의 결과물을 자동으로 golden으로 삼지 않았습니다.

검증 도구는 CSV/TSV·JSON·XLSX의 키·열·값·누락·중복을 비교합니다. 같은 합계라도 구성 행이 다르면 실패합니다. raw/golden 해시 변경과 추가 출력도 오류로 처리합니다. 사용법은 [validation/README.md](validation/README.md)에 있습니다.

```powershell
python -m pip install -r requirements-dev.txt
python tools/check.py
python -m unittest discover -s tests -v
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
