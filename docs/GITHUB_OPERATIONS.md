# GitHub 운영 방식

이 저장소를 어떻게 굴릴지에 대한 규칙입니다. 코딩 규칙은 [../ENGINEERING_RULES.md](../ENGINEERING_RULES.md)에 있습니다.

---

## 0. 한 장 요약

| 항목 | 결정 |
|---|---|
| 저장소 | **1개** (`kshc11-art/WAP`, Private). 프로젝트별로 쪼개지 않음 |
| 폴더 | `userscripts/` + `python/` **2개**. 나머지는 관리 파일 |
| 프로젝트 구분 | 폴더가 아니라 **README 목록 + Issue Label** |
| 브랜치 | `main` + 작업용 `feature/*` `fix/*` `refactor/*`. `develop` 없음 |
| 작업 단위 | **Issue 1개 = 브랜치 1개 = PR 1개** |
| merge 조건 | 리뷰 통과 + **내부망 실제 테스트 PASS** |
| main의 의미 | **지금 회사 PC에 깔려 돌아가는 정상 버전** |
| 자동화 | 지금은 syntax/보안 체크만. `@claude` 자동 실행은 나중에 |

---

## 1. 올리기 전에 확정할 것 (한 번만)

가장 먼저 정리해야 하는 건 코드가 아니라 **반출 기준**입니다.

- [ ] 사내 코드/스크립트를 외부 GitHub(Private)에 두는 것이 회사 정책상 가능한가?
- [ ] 외부 AI 코딩 도구(Claude Code, Codex) 사용이 허용되는가?
- [ ] 사내 시스템명·내부 URL·API 경로를 코드에 남겨도 되는가?
- [ ] 회사가 제공하는 Git 서버(GitHub Enterprise / GitLab)가 있는가? → **있으면 그쪽이 1순위**

> **Private ≠ 사내.** Private은 접근을 제한할 뿐 외부 서비스입니다.
> 위 항목이 불확실하면, 확정될 때까지는 **로컬 Git 저장소로 동일한 구조를 만들어** 쓰다가
> 승인 후 remote를 붙이면 됩니다. (구조와 규칙은 그대로 재사용됩니다.)

애매한 항목이 하나라도 있으면, 그 부분만 코드에서 분리해 두세요.
내부 URL은 상수로 모으고, 필요하면 `local/`(gitignore 대상)로 뺍니다.

---

## 2. 첫 커밋: 지금 쓰는 스크립트를 **그대로** 넣기

가장 중요한 원칙입니다. **처음부터 고치지 마세요.**

```bash
# 1) 지금 Tampermonkey에 들어있는 스크립트를 그대로 복사
userscripts/[IPMS] 검색 개선.user.js
userscripts/[특허] 팔레트.user.js
...

# 2) Python도 그대로
python/연차료처리.py
...

# 3) 손대지 않은 상태로 커밋
git add .
git commit -m "chore: 현재 사용 중인 자동화 스크립트 baseline 등록"

# 4) 되돌아올 지점을 태그로 못박기
git tag baseline-2026-08
git push -u origin main --tags
```

이 태그가 있으면 나중에 AI가 코드를 크게 고치다 망가져도

```bash
git checkout baseline-2026-08 -- "userscripts/[IPMS] 검색 개선.user.js"
```

로 그 파일 하나만 정상 상태로 되돌릴 수 있습니다.

**확장자는 `.txt`가 아니라 `.user.js`로 유지하세요.** 구문 강조가 되고, diff가 읽히고,
이 파일이 userscript라는 게 명확해집니다.

그다음 [README.md](../README.md)의 스크립트 목록 표를 채웁니다. 이 표가 폴더 구조를 대신합니다.

---

## 3. 브랜치

```
main                        ← 회사 PC에서 실제로 쓰는 정상 버전
├── feature/ipms-task-card   ← 새 기능
├── fix/mail-empty-response  ← 버그 수정
└── refactor/stats-fetch     ← 동작 변경 없는 정리
```

- `develop` 브랜치는 만들지 않습니다. 혼자 쓰는 저장소에 단계가 하나 더 늘 뿐입니다.
- 브랜치명은 `타입/영역-내용` (영문 소문자, 하이픈).
- 작업이 끝나 merge하면 브랜치는 지웁니다.

**`main`을 직접 고치지 않는 이유**는 협업 때문이 아니라 **되돌리기 위해서**입니다.
main이 항상 "지금 깔려 있는 것과 같은 상태"여야, 문제가 생겼을 때 기준점이 됩니다.

---

## 4. 하루 작업 루프

```
   Issue 작성            "무엇을 왜 바꾸는가"를 5줄로
        │
        ▼
   feature 브랜치         git switch -c feature/xxx
        │
        ▼
   Claude Code 구현       "Issue #12 구현해. 기존 동작 유지. main 수정 금지."
        │
        ▼
   commit + push
        │
        ▼
   Pull Request           영향 범위 / 롤백 방법 / 내부망 확인 항목 기재
        │
        ├── 자동 체크      syntax + 금지 파일 스캔
        └── Codex 리뷰     @codex review
        │
        ▼
   Claude 수정            지적사항 반영
        │
        ▼
   needs-internal-test    ← 여기서 멈추고 회사 PC로
        │
        ▼
   회사 PC에서 실제 테스트
        │
     ┌──┴──┐
   실패   PASS
     │      │
   재작업  merge → main → Tampermonkey에 반영
```

핵심은 **`needs-internal-test` 단계에서 반드시 멈춘다**는 것입니다.
Claude도 Codex도 사내망을 볼 수 없습니다. 두 AI가 OK를 줘도 그건 "코드가 말이 된다"는 뜻이지
"실제로 동작한다"는 뜻이 아닙니다.

---

## 5. Issue

기존에 쓰던 요청 양식(목적 / 현황 / 문제점 / 기대효과 / 세부자료)을 템플릿으로 만들어 뒀습니다.
→ `.github/ISSUE_TEMPLATE/`

Issue를 먼저 쓰는 이유는 관리가 아니라 **AI에게 줄 입력을 미리 정리하기 위해서**입니다.
Issue가 잘 써지면 `Issue #37 구현해` 한 줄로 작업을 시작할 수 있습니다.

Issue를 안 써도 되는 경우: 오타 수정, 문서 갱신 같은 5분짜리. 그냥 브랜치 파고 고치세요.

### Label (8~10개면 충분)

| 종류 | Label |
|---|---|
| 대상 | `tampermonkey` `python` |
| 영역 | `dashboard` `ipms` `mail` `excel` `stats` |
| 성격 | `feature` `bug` `refactor` |
| 상태 | `needs-internal-test` `security-sensitive` |

`needs-internal-test`가 실질적으로 가장 중요합니다.
"AI 작업은 끝났고 내 확인만 남은 것"이 한눈에 보입니다.

라벨 생성 명령은 [.github/labels.md](../.github/labels.md)에 정리해 뒀습니다.

---

## 6. Pull Request

PR은 코드 묶음이 아니라 **그 기능의 작업 기록**입니다. 나중에 "이거 왜 이렇게 했더라"의 답이 여기 남습니다.

PR 본문에 반드시 들어갈 것 (템플릿에 있음):

1. 관련 Issue
2. 무엇을 바꿨는지
3. **영향 범위** — 깨질 수 있는 기존 동작
4. **롤백 방법**
5. **내부망 확인 체크리스트** — 회사 PC에서 눌러볼 항목
6. 보안 확인 — 실제 데이터/인증정보가 들어가지 않았는지

### merge 기준 (Definition of Done)

- [ ] 자동 체크 통과 (syntax + 금지 파일 스캔)
- [ ] Codex 리뷰 지적사항 반영 또는 반영하지 않는 이유 기재
- [ ] **회사 PC에서 실제로 동작 확인** (`needs-internal-test` 해제)
- [ ] userscript면 `@version` 상승
- [ ] README 스크립트 목록 갱신 (새 스크립트인 경우)

merge는 **Squash and merge**를 씁니다. main 히스토리가 "기능 1개 = 커밋 1개"로 정리됩니다.

---

## 7. AI 분담

| 역할 | 담당 | 근거 파일 |
|---|---|---|
| 구현 | Claude Code | `CLAUDE.md` |
| 독립 리뷰 | Codex | `AGENTS.md` |
| 최종 판정 | 나 (내부망) | — |

**같은 사람이 쓰고 같은 사람이 검토하면 의미가 없습니다.** 구현과 리뷰를 다른 도구에 맡기는 게 핵심입니다.
두 파일 모두 [ENGINEERING_RULES.md](../ENGINEERING_RULES.md)를 참조하므로, **규칙은 한 곳에서만 고칩니다.**

```
CLAUDE.md ──┐
            ├──▶ ENGINEERING_RULES.md
AGENTS.md ──┘
```

### 로컬 Claude Code vs 웹(GitHub 연결)

- **로컬**: 회사 PC의 실제 환경, 설치된 패키지, 커밋 안 된 코드까지 그대로 볼 수 있음 → 실전 디버깅에 유리
- **웹**: GitHub repo를 격리 VM에 clone해서 작업 → 여러 작업 병렬, PR 단위 위임에 유리

초반에는 **로컬 Claude Code + GitHub PR** 조합이 이해하기 쉽습니다. 익숙해지면 웹을 병행하세요.

---

## 8. 버전과 태그

세 층위를 구분합니다.

| 층위 | 용도 | 예 |
|---|---|---|
| userscript `@version` | Tampermonkey 업데이트 판단 | `1.4.2` |
| git commit | 변경 이력 | `fix(ipms): 빈 응답 처리` |
| git tag | **되돌아갈 지점** | `baseline-2026-08`, `wap-2026.09` |

태그는 커밋마다 만들지 않습니다. "여기로 돌아오면 확실히 정상"인 시점에만 만듭니다.
분기별 한 번 정도면 충분합니다.

---

## 9. main 보호와 사고 복구

GitHub 플랜에 따라 Private 저장소의 branch protection 사용 범위가 다릅니다. 가능하면:

- `main` force push 금지 / 삭제 금지
- PR을 통해서만 변경
- 자동 체크 통과 후 merge

설정이 안 되면 규칙만 지켜도 효과는 대부분 얻습니다.

### 문제가 생겼을 때

```bash
# 특정 스크립트만 정상 시점으로 되돌리기
git checkout baseline-2026-08 -- "userscripts/문제파일.user.js"

# 방금 merge한 PR을 통째로 되돌리기
#   GitHub PR 화면 → Revert 버튼

# 지금 main 상태를 그냥 받아서 Tampermonkey에 붙여넣기
git switch main && git pull
```

**긴급 상황의 1순위는 Git이 아니라 Tampermonkey 스크립트 OFF**입니다.
먼저 끄고, 업무를 진행하고, 그다음에 고칩니다.

---

## 10. 자동화 도입 순서

지금 전부 붙이지 마세요. 순서대로 갑니다.

**지금 (이 PR에 포함)**
- `.gitignore` 업무데이터 차단 규칙
- `pre-commit` 훅 — 엑셀/HAR/zip/인증정보 커밋 차단
- GitHub Actions — JS/Python 구문 검사 + 금지 파일 스캔 (수십 초, 무료 한도 내)

**익숙해진 다음 (2~3개월 뒤)**
- Codex 자동 리뷰 (모든 PR 자동)
- 판정 로직 fixture 테스트 자동 실행
- GitHub Issue에서 `@claude` 호출로 바로 작업

> `@claude` GitHub Action은 GitHub App에 Contents/Issues/PR 쓰기 권한이 필요합니다.
> 사내 코드가 든 저장소라면 **연결 전에 권한 범위를 확인**하세요.

**아마 필요 없는 것**
- GitHub Projects 칸반 — 혼자 쓰는데 관리 자체가 일이 됩니다. Issue + Label로 충분합니다.
- `develop` 브랜치, 릴리스 자동화, 커밋마다 Release

---

## 11. 첫 주 실행 계획

```
1일차  □ 반출 기준 확인 (§1)
       □ 지금 쓰는 스크립트 전부 그대로 커밋 → baseline 태그
       □ git config core.hooksPath .githooks

2일차  □ README 스크립트 목록 표 채우기
       □ Label 8개 생성

3일차  □ 가장 자주 불편했던 것 하나로 Issue 작성
       □ feature 브랜치 → Claude Code → PR → 내부망 테스트 → merge
       ※ 첫 한 바퀴는 아주 작은 변경으로 도는 것 자체가 목적

이후   □ 모든 변경을 이 루프로. 예외 없이.
```

한 바퀴만 제대로 돌려보면 나머지는 반복입니다.
