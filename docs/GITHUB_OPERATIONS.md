# GitHub 운영 방식

브랜치·Issue·PR·라벨·머지 기준. 저장소 구조는 [ARCHITECTURE.md](ARCHITECTURE.md),
AI 분담은 [AI_OPERATIONS.md](AI_OPERATIONS.md), 규칙은 [ENGINEERING_RULES.md](../ENGINEERING_RULES.md)에 있다.

---

## 0. 한 장 요약

| 항목 | 결정 |
|---|---|
| 저장소 | **1개** (`kshc11-art/WAP`). **private 고정** — CI가 확인한다 |
| 정본 | 저장소가 아니라 **회사 PC의 Tampermonkey**. 저장소는 사본 보관소 + 검사기 |
| 반입 | `inbox/`에 넣고 커밋. **`main` 직접 허용**(여기에 마찰을 두면 우회가 시작된다) |
| 그 외 작업 | `feature/*` `fix/*` `refactor/*` `docs/*` → PR |
| 작업 단위 | Issue 1개 = 브랜치 1개 = PR 1개 |
| merge 조건 | 검사 통과 + **내부망 실제 확인 PASS** |
| 커밋 차단 | **정확히 4개**. 늘리지 않는다 |

---

## 1. 올리기 전에 확정할 것

가장 먼저 정리할 것은 코드가 아니라 **반출 기준**이다.

- [ ] 사내 스크립트를 외부 GitHub(private)에 두는 것이 회사 정책상 가능한가?
- [ ] 외부 AI 코딩 도구(Claude, GPT) 사용이 허용되는가?
- [ ] **내부 호스트명·화면 ID·API 경로를 코드에 남겨도 되는가?**
      → 가드가 `WARN`으로 표시하는 항목이 정확히 이것이다. 제거 대상이 아니라 판단 대상이다.
- [ ] 회사가 제공하는 Git 서버(GitHub Enterprise / GitLab)가 있는가? → 있으면 그쪽이 1순위

> **private ≠ 사내.** private은 접근을 제한할 뿐 외부 서비스다.
> 불확실하면 로컬 Git으로 같은 구조를 쓰다가 승인 후 remote를 붙이면 된다.
> 구조와 규칙은 그대로 재사용된다.

---

## 2. 브랜치

```
main
├── feature/…    새 기능
├── fix/…        버그 수정
├── refactor/…   동작 변경 없는 정리
└── docs/…       문서
```

`develop`은 만들지 않는다. **`main`을 직접 고치지 않는 이유는 협업이 아니라 되돌리기 위해서다.**

**예외: `inbox/` 반입은 `main` 직접 커밋을 허용한다.**
파일 하나가 통째로 돌아오므로 diff 리뷰가 의미를 갖지 않고,
여기에 PR을 강제하면 웹 UI 직접 편집으로 우회된다. 검사는 CI가 한다.

> `.githooks/pre-commit`은 **로컬 커밋에서만** 돈다.
> GitHub 웹 UI에서 직접 커밋하면 실행되지 않으므로, 같은 검사가 CI에도 있다.

---

## 3. Issue

기존 요청 양식(목적 / 현황 / 문제점 / 기대효과 / 세부자료)이 템플릿으로 들어 있다.

Issue를 먼저 쓰는 이유는 관리가 아니라 **AI에게 줄 입력을 미리 정리하기 위해서**다.
오타 수정이나 문서 갱신 같은 5분짜리는 Issue 없이 그냥 고쳐도 된다.

### Label

| 종류 | Label |
|---|---|
| 대상 | `tampermonkey` `python` |
| 영역 | `dashboard` `ipms` `mail` `excel` `stats` |
| 성격 | `feature` `bug` `refactor` |
| 상태 | `needs-internal-test` `security-sensitive` |

`needs-internal-test`가 실질적으로 가장 중요하다 —
"AI 작업은 끝났고 내 확인만 남은 것"이 한눈에 보인다.
생성 명령은 [`.github/labels.md`](../.github/labels.md)에 있다.

---

## 4. Pull Request

PR은 코드 묶음이 아니라 **그 기능의 작업 기록**이다.

### PR 두 종류

| | 판정 | 리뷰 |
|---|---|---|
| **부분 수정** | 변경량이 원본의 30% 미만 | Codex diff 리뷰 |
| **전면 교체** | 30% 이상, 또는 섹션 신설·삭제 | **diff 리뷰 요구를 해제**하고 스모크 체크리스트로 |

전면 교체에서 줄 단위 리뷰는 신호 대 잡음비가 0이고, 형식적 통과만 만든다.
그런 게이트는 없는 게 낫다.

### merge 기준

- [ ] 자동 검사 통과 (가드 · 레지스트리 · 구문 · private 확인)
- [ ] 리뷰 지적 반영, 또는 반영하지 않는 이유 기재
- [ ] **회사 PC에서 실제 동작 확인** (`needs-internal-test` 해제)
- [ ] `@version` 상승 (SemVer 3자리)
- [ ] 새 스크립트면 `contracts/scripts.yaml`에 등록

merge는 **Squash and merge**.

---

## 5. 버전과 태그

| 층위 | 용도 | 예 |
|---|---|---|
| `@version` | Tampermonkey 업데이트 판단 | `1.4.2` (SemVer 3자리 고정) |
| commit | 변경 이력 | `fix(ipms): 빈 응답 처리` |
| tag | **되돌아갈 지점** | `baseline-2026-08`, `wap-2026.09` |

태그는 커밋마다 만들지 않는다. "여기로 돌아오면 확실히 정상"인 시점에만.
`@description`에 변경이력을 쌓지 않는다 — `changelogs/<slug>.md`로 간다.

---

## 6. 사고가 났을 때

**1순위는 Git이 아니라 Tampermonkey 스크립트 OFF다.** 먼저 끄고, 업무를 진행하고, 그다음에 고친다.
전역 킬은 브라우저 콘솔에서:

```js
localStorage.setItem('wap.kill', '1')   // 전 스크립트 정지
localStorage.removeItem('wap.kill')     // 해제
```

(이것이 동작하려면 프리앰블이 들어가 있어야 한다 → 이행 단계 D7.
그 전까지는 스크립트마다 개별로 꺼야 한다.)

```bash
# 특정 스크립트만 정상 시점으로
git checkout <태그> -- scripts/<slug>.user.js

# 반입 이전 원본
ls archive/

# 방금 merge한 PR 되돌리기 → GitHub PR 화면의 Revert
```

---

## 7. 자동화 도입 순서

**지금 (이 PR에 포함)**
- `.gitignore` 업무데이터 차단 · `guard.py` 패턴 사전 · pre-commit 훅
- CI: 가드 + 레지스트리 대조 + 구문 검사 + private 확인
- `contracts/scripts.yaml` 초안

**다음 (이행 D4~D7)**
- `inbox/` 반입 Action (정규화 · 색인 · 리포트)
- `state/` 생성기 (충돌표 · PII 리포트 · AI 지시서)
- 설치 현황 대조

**나중에**
- Codex 자동 리뷰 · 계약 드리프트 대조 · 매뉴얼 빌드

**아마 필요 없는 것**
- GitHub Projects 칸반 — 혼자 쓰는데 관리 자체가 일이 된다
- `develop` 브랜치 · 릴리스 자동화 · 커밋마다 Release
