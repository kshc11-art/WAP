# WAP — Workflow Automation Project

업무 자동화 저장소. Tampermonkey userscript(브라우저 쪽)와 Python(엑셀·데이터 처리 쪽)을
**하나의 저장소**에서 관리합니다.

> **⚠️ 실제 업무 데이터는 절대 올리지 않습니다.**
> 개인정보, 실제 특허/과제 데이터, API 응답 dump, HAR, 쿠키·세션·인증 헤더, 업무용 Excel 원본은
> commit 대상이 아닙니다. → [ENGINEERING_RULES.md](ENGINEERING_RULES.md) §1

---

## 구조

```
WAP/
├─ userscripts/        # Tampermonkey 스크립트 (스크립트 1개 = 파일 1개)
├─ python/             # Python 자동화 (여러 파일로 커지면 그 프로그램만 하위 폴더로 승격)
├─ tests/fixtures/     # 익명화된 샘플 데이터만
├─ docs/               # 운영/설계 문서
├─ tools/              # 저장소 보조 스크립트(보안 가드 등)
├─ CLAUDE.md           # Claude Code용 지침
├─ AGENTS.md           # Codex용 지침
└─ ENGINEERING_RULES.md  # 두 AI와 내가 공통으로 따르는 규칙
```

폴더는 이 이상 늘리지 않습니다. **프로젝트 구분은 폴더가 아니라 아래 목록 + Issue Label로** 합니다.

---

## 스크립트 목록 (프로젝트 지도)

> 파일을 올린 뒤 파일명·버전·상태를 채워 넣으세요. 이 표가 폴더 구조를 대신합니다.
> 상태: `사용중` / `안정` / `실험` / `보류`

### 대시보드 (`dashboard`)
| 스크립트 | 버전 | 상태 | 비고 |
|---|---|---|---|
| 업무 대시보드 | | 사용중 | |
| 포털 메인 화면 테마 | | 사용중 | |

### IPMS 편의 기능 (`ipms`)
| 스크립트 | 버전 | 상태 | 비고 |
|---|---|---|---|
| 검색 개선 | | 사용중 | |
| 특허 팔레트 | | 사용중 | |
| 상세 팝업 단축키 | | 사용중 | |
| 입력 Helper | | 사용중 | |
| 팝업·창 관리자 | | 사용중 | |

### 요구자료 자동화 (`requirements`)
| 스크립트 | 버전 | 상태 | 비고 |
|---|---|---|---|
| 요구자료 콘솔 | | 사용중 | 본체 |
| 요구자료 콘솔 - 항목 어댑터 | | 사용중 | 콘솔 의존 |
| 요구자료 콘솔 - 포털 바로가기 | | 사용중 | 콘솔 의존 |

### 통계 / 추출 (`stats`)
| 스크립트 | 버전 | 상태 | 비고 |
|---|---|---|---|
| Patent Stats Extractor | | 사용중 | |
| 보조원장 지재권 집행내역 | | 사용중 | |
| 지재권 대조 Helper | | 사용중 | |

### 연차유지료 (`annualfee`)
| 스크립트 | 버전 | 상태 | 비고 |
|---|---|---|---|
| 연차유지료 지출발의 자동화 | | 사용중 | Python 연계 |

### 메일 (`mail`)
| 스크립트 | 버전 | 상태 | 비고 |
|---|---|---|---|
| 메일 디자인 및 기능 개선 | | 사용중 | |

### Python (`python`)
| 프로그램 | 상태 | 입력 | 출력 |
|---|---|---|---|
| | | | |

---

## 작업 방식

```
Issue → feature branch → 구현(Claude Code) → PR → 리뷰(Codex) → 내부망 실제 테스트 → merge
```

- `main` = **지금 회사 PC에서 실제로 쓰고 있는 정상 버전.** 직접 수정하지 않습니다.
- 자세한 운영 규칙: **[docs/GITHUB_OPERATIONS.md](docs/GITHUB_OPERATIONS.md)**
- 코딩/보안 규칙: **[ENGINEERING_RULES.md](ENGINEERING_RULES.md)**

## 최초 1회 설정

```bash
git clone https://github.com/kshc11-art/WAP.git
cd WAP
git config core.hooksPath .githooks   # 업무데이터·인증정보 commit 차단 훅 활성화
```
