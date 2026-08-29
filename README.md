# WAP — Workflow Automation Project

사내 웹 시스템 위에서 도는 Tampermonkey 스크립트 17개와, 그것과 연계되는 Python 자동화를 관리한다.

> **정본은 이 저장소가 아니다.** 회사 PC의 Tampermonkey에서 지금 돌고 있는 코드가 정본이고,
> 이 저장소는 그 사본을 받아 정규화·색인·검사하는 기계다. → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

> **⚠️ 실제 업무 데이터는 올리지 않는다.** 개인정보·실제 특허 데이터·API 응답 dump·HAR·
> 인증정보·업무 Excel·화면 스크린샷. → [ENGINEERING_RULES §1](ENGINEERING_RULES.md)
> 저장소는 **private 고정**이며 CI가 확인한다.

---

## 하는 일은 두 가지

```
① AI 채팅에서 받은 .user.js 를 inbox/ 에 넣고 커밋한다   ← 파일명 아무거나
② 봇이 정리해 준 scripts/<slug>.user.js 를 Tampermonkey 편집기에서 덮어쓴다
```

파일명·표시명을 바꾸고 싶으면 [`contracts/scripts.yaml`](contracts/scripts.yaml) 한 줄을 고친다.
경로는 slug가 정하므로 **저장소 안 파일명을 사람이 지을 일이 없다.**

---

## 어디에 무엇이 있나 — 최상위 폴더 6개

| | |
|---|---|
| [`inbox/`](inbox/) | **손대는 유일한 폴더.** 아무 이름으로 넣고 커밋하면 봇이 정리한다 |
| [`scripts/`](scripts/) | Tampermonkey에 붙여넣을 파일 (`<slug>.user.js`) + `_shared/` 공통 코드 |
| [`contracts/`](contracts/) | 사실(fact) — 스크립트 원장 · 화면 · 엔드포인트 · 상태코드 · 규칙 · fixture |
| `python/` | 브리지(manifest 생산자) · 보고서 · xlsx 생성 |
| [`tools/`](tools/) | 가드 · 반입기 · 색인 생성기 |
| [`docs/`](docs/) | 읽는 것 |

뒤에 `state/`(전부 자동 생성, 안 봐도 됨)와 `manual/`(법령·매뉴얼)이 생긴다.

---

## 문서

| | |
|---|---|
| [docs/FINDINGS.md](docs/FINDINGS.md) | **실측 결과.** 지금 코드에 무엇이 있는지. **D0 긴급 확인 2건 포함** |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 저장소 구조와 그 이유, 이행 단계 D0~D12 |
| [docs/AI_OPERATIONS.md](docs/AI_OPERATIONS.md) | Claude와 GPT를 함께 쓰는 방법 |
| [docs/GITHUB_OPERATIONS.md](docs/GITHUB_OPERATIONS.md) | 브랜치·Issue·PR·라벨·머지 기준 |
| [ENGINEERING_RULES.md](ENGINEERING_RULES.md) | 규칙의 유일한 원본 |

---

## 스크립트 17개

실측 기준(2026-08). 상세는 [`contracts/scripts.yaml`](contracts/scripts.yaml).
현재 전부 `pending` — 아직 반입 전이다.

| slug | 표시명 | 줄수 |
|---|---|---|
| `mail-gwx` | 메일 디자인·기능 개선 | 6,505 |
| `core-recon` | 정찰기 v7.0.0 ⚠️ | 4,581 |
| `ipms-input-helper` | 입력 Helper ⚠️ | 3,792 |
| `portal-dashboard` | 업무 대시보드 | 3,699 |
| `stats-patent` | 특허 통계추출 | 3,312 |
| `ipms-compare-paper` | 개인저작물 논문 대조 | 2,855 |
| `annualfee-expense` | 연차유지료 지출발의 ⚠️ | 2,642 |
| `console-host` | 요구자료 콘솔 | 1,539 |
| `ipms-compare-iprs` | 지재권 대조 | 1,523 |
| `ipms-palette` | 특허 팔레트 (Ctrl+Space) | 1,082 |
| `ipms-search` | IPMS 검색 개선 | 931 |
| `console-adapters` | 요구자료 콘솔 항목 어댑터 | 903 |
| `portal-popup-manager` | 팝업·창 관리자 | 869 |
| `stats-ledger` | 보조원장 지재권 집행내역 | 555 |
| `portal-theme` | 포털 메인 화면 테마 | 451 |
| `console-launcher` | 요구자료 콘솔 바로가기 | 263 |
| `ipms-detail-keys` | 상세 팝업 단축키 | 173 |

⚠️ = [docs/FINDINGS.md](docs/FINDINGS.md)에 확인이 필요한 동작이 기록된 스크립트.

---

## 최초 1회 설정

```bash
git clone https://github.com/kshc11-art/WAP.git
cd WAP
git config core.hooksPath .githooks   # 업무데이터·인증정보 커밋 차단
python3 tools/guard.py --all          # 동작 확인
```
