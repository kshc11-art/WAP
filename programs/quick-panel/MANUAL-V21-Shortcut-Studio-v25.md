# V21 Pro Shortcut Studio v25 — Quick Panel / Site Adapter 포함 사용 설명서

> 구성: **Shortcut Studio v25 + AHK Companion v7 + Tampermonkey Quick Panel Adapter**
>
> v25의 핵심 변화는 Studio 데이터와 브라우저용 Tampermonkey UI를 따로 관리하지 않고, **하나의 Studio State를 공유**하도록 만든 것입니다.

---

# 0. 이번 버전의 핵심 구조

```text
                    ┌──────────────────────┐
                    │ Shortcut Studio v25  │
                    │ Full View            │
                    │                      │
                    │ Context / Action     │
                    │ Binding / Insights   │
                    │ Library / Build AHK  │
                    └──────────┬───────────┘
                               │
                               │ 같은 State
                               ▼
                    ┌──────────────────────┐
                    │ Companion v7         │
                    │                      │
                    │ v21-studio-state.json│
                    │ Active App / Usage   │
                    │ History / Local API  │
                    └──────────┬───────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
    ┌────────────────────┐          ┌──────────────────────┐
    │ Generated / 기존   │          │ Tampermonkey         │
    │ AutoHotkey         │          │ Site Adapter         │
    │                    │          │                      │
    │ Windows Action 실행 │          │ 현재 URL / DOM 파악   │
    └────────────────────┘          │ 웹 Action 실행        │
                                    │ Compact Studio 호출   │
                                    └──────────────────────┘
```

## 중요한 원칙

### 데이터는 한 군데

Tampermonkey 안에 별도의 단축키 표를 복사해 두지 않습니다.

단축키 Trigger / Action / Context는 **Studio State**에서 읽습니다.

### Tampermonkey에는 사이트 구현만

예:

```text
Action: 승인
```

이 웹페이지에서 실제로 어떻게 실행하는지만 userscript가 압니다.

예:

```text
화면에서 "승인" 버튼을 정확 일치로 찾음
→ 1회 click
```

하지만:

```text
Alt+2
Ctrl+Alt+A
F18
```

중 어떤 Trigger가 `승인`을 실행하는지는 Studio가 결정합니다.

---

# 1. 파일 구성

권장 폴더:

```text
v21-pro-shortcut-studio-v25.html
v21-pro-companion-v7.ahk
KRISS-IPMS-V21-Quick-Panel-Adapter-v25.user.js
KRISS-IPMS-V21-Starter-Dictionary-v25.json
```

---

# 2. 첫 설치 순서

## 1) Companion 실행

AutoHotkey v2 설치 후:

```text
v21-pro-companion-v7.ahk
```

실행.

트레이 메뉴:

```text
Open Studio
```

사용 권장.

Studio 주소:

```text
http://127.0.0.1:32145/
```

---

## 2) Studio State 준비

기존 v24 State가 Companion에 있으면 v25에서 읽어 사용할 수 있습니다.

새로 KRISS IPMS 단축키를 시작한다면:

```text
Library
→ Upload
→ Choose JSON
→ KRISS-IPMS-V21-Starter-Dictionary-v25.json
→ Merge
→ Upload
```

합니다.

Starter Dictionary는 기존 임시 Tampermonkey 매핑을 초기값으로만 제공합니다.

```text
Alt+1 → 접수
Alt+2 → 승인
Alt+3 → 최종승인
Alt+4 → 반려
Alt+5 → 임시저장
Alt+6 → 저장
Alt+8 → 상세보기
Alt+9 → 접수대기상태로변경
Alt+0 → 닫기
```

이 값은 **userscript에 고정된 값이 아닙니다.**

Upload 후 Studio에서 자유롭게 바꿀 수 있습니다.

---

## 3) 기존 KRISS Tampermonkey 스크립트 교체

기존의:

```text
KRISS IPMS - 상세 팝업 단축키
```

대신:

```text
KRISS-IPMS-V21-Quick-Panel-Adapter-v25.user.js
```

를 Tampermonkey에 설치합니다.

둘을 동시에 켜두면 동일 Alt Trigger가 중복 실행될 수 있으므로 기존 스크립트는 꺼두는 것을 권장합니다.

---

# 3. KRISS Site Adapter의 역할

이 userscript에는 다음 역할만 남습니다.

## 상세 팝업 판정

목록 페이지에서는 실행하지 않습니다.

## 버튼 탐지

현재 화면에 실제로 보이는:

```text
접수
승인
최종승인
반려
임시저장
...
```

버튼을 찾습니다.

## Action 실행

Studio에서 현재 Trigger가 `승인` Action으로 연결되어 있다면:

```text
해당 Trigger 입력
→ 현재 페이지의 "승인" 버튼 검색
→ 버튼 1회 클릭
```

까지만 합니다.

그 뒤 확인창을 자동 승인하지 않습니다.

## 현재 페이지 상태 전달

Companion / Compact Studio에:

- 현재 URL
- Host
- 페이지 제목
- 현재 Context 힌트
- 현재 페이지에서 실제 사용할 수 있는 Action

을 전달합니다.

## Compact Studio 실행

기본:

```text
Alt+/
```

로 Quick Panel을 열고 닫습니다.

---

# 4. Trigger를 Studio에서 바꾸면 어떻게 되는가

예를 들어 Starter 상태:

```text
승인
Alt+2
```

에서 Studio Library 또는 Layer 1을 사용해:

```text
승인
Ctrl+Alt+A
```

로 바꿉니다.

Tampermonkey userscript를 수정할 필요가 없습니다.

다음 State Refresh 후:

```text
Ctrl+Alt+A
→ 승인 버튼 클릭
```

이 됩니다.

즉 userscript의 본질은:

```text
승인이라는 Action을 웹에서 어떻게 실행하는가
```

이고,

Studio의 본질은:

```text
승인 Action을 어떤 Trigger / V21 Key로 호출하는가
```

입니다.

---

# 5. Quick Panel

KRISS 상세 팝업에서:

```text
Alt+/
```

를 누르거나 왼쪽 아래 작은 `V21` Badge를 누릅니다.

그러면 현재 Studio와 동일한 키보드 디자인이 페이지 위에 표시됩니다.

이 화면은 별도 복제 UI가 아니라 **Studio v25의 Compact Mode HTML 자체**입니다.

Tampermonkey가 Companion에서 Studio HTML을 읽어 iframe `srcdoc`으로 띄웁니다.

---

# 6. Quick Panel 데이터 동기화

Quick Panel은 별도의 localStorage를 원본으로 사용하지 않습니다.

```text
Quick Panel
→ Tampermonkey bridge
→ Companion
→ v21-studio-state.json
```

구조입니다.

Quick Panel에서 Binding을 수정하고 Save하면:

1. Compact Studio가 변경 State를 Tampermonkey에 전달
2. Tampermonkey가 Companion `/studio-state`에 저장
3. Full Studio가 Companion State가 더 최신임을 감지
4. Full Studio 화면도 같은 State로 갱신

따라서 Full Studio와 Quick Panel이 서로 다른 단축키 데이터로 갈라지는 문제를 줄였습니다.

---

# 7. Quick Panel Context

KRISS Adapter는 다음 Context 이름을 우선 힌트로 전달합니다.

```text
KRISS IPMS · 상세 팝업
```

Starter Dictionary를 Merge하면 이 Manual Context가 만들어집니다.

Quick Panel이 열리면 해당 Context를 자동으로 선택합니다.

해당 Context가 없다면:

1. 일치하는 Site Context
2. Companion App Context
3. Global

순서로 fallback합니다.

---

# 8. 현재 페이지에서 사용할 수 없는 Action

userscript는 현재 DOM에서 실제 버튼 존재 여부를 검사합니다.

예를 들어 현재 팝업에:

```text
접수      있음
승인      있음
최종승인  없음
반려      있음
```

이라면 Compact Studio에서 `최종승인`에 연결된 키는 흐리게 표시될 수 있습니다.

즉 Studio의 정적인 Shortcut 정보와 **현재 페이지의 실제 상태**를 합쳐 보여줍니다.

---

# 9. Quick Panel에서 수정

Compact Studio는 단순 스크린샷이 아닙니다.

키를 클릭하면 Studio의 편집창이 Compact 화면 안에서 열립니다.

저장하면 같은 Studio State에 반영됩니다.

다만 구조가 큰 변경은 Full Studio 사용을 권장합니다.

## Quick Panel에 적합

- 현재 Context의 Action 연결
- 기존 Action 선택
- Override Save
- Override 제거
- 빠른 키맵 확인

## Full Studio 권장

- Context 생성/삭제
- Parent/Fallback 구조
- Source 관리
- Dictionary Upload
- Insights 전체 분석
- Build AHK
- 복잡한 Trigger 재설계

Quick Panel 아래:

```text
Open Full Studio ↗
```

로 전체 Studio를 엽니다.

---

# 10. Quick Panel 닫기

다음 중 하나:

```text
Alt+/
상단 ×
Esc (편집창이 없을 때)
```

---

# 11. Tampermonkey Action Source

Starter Dictionary의 Source:

```text
KRISS IPMS · 상세 팝업 Adapter
Type: Tampermonkey
```

userscript는 **Source Type이 Tampermonkey인 Binding 중 자신이 알고 있는 Action만 실행**합니다.

이렇게 해야 AHK가 담당해야 하는 Action을 웹 Adapter가 실수로 실행하지 않습니다.

---

# 12. Action Adapter 목록

현재 Adapter가 웹에서 구현할 수 있는 Action:

```text
접수
승인
최종승인 / 최종확인
반려
임시저장
저장
상세보기
접수대기상태로변경
닫기 / 취소
```

Trigger는 여기에 없습니다.

Action 이름과 실제 페이지 버튼 Label 관계만 있습니다.

Action이 변하면 userscript의 Adapter 목록도 수정이 필요할 수 있지만, **키 위치나 Trigger를 바꿀 때는 userscript를 수정하지 않습니다.**

---

# 13. Full Studio 상단 메뉴

## Library

전체 Action / Binding 검색.

## Contexts

Context / Source 관리.

## Insights

충돌 / 중복 / 빈 슬롯 분석.

## Build AHK

Studio가 실제 AHK 코드를 생성할 Binding을 Preview / Copy / Download.

## Companion

활성 앱 / Layer 1·2 사용량 / History 확인.

## •••

- Open Compact View
- Theme
- Backup
- Restore
- Reset

`Open Compact View`는 Tampermonkey 없이 Compact 디자인 자체를 테스트할 때 사용할 수 있습니다.

---

# 14. Build AHK와 Tampermonkey의 관계

Tampermonkey Action은 보통:

```text
Implementation = Document only
```

로 두는 것을 권장합니다.

왜냐하면 실제 실행은 Tampermonkey Adapter가 하기 때문입니다.

예:

```text
Action          승인
Trigger         Alt+2
Source          KRISS IPMS · 상세 팝업 Adapter
Implementation  Document only
```

이 Binding은 Build AHK에서 코드를 만들지 않습니다.

반면:

```text
Action          Open Terminal
Trigger         Ctrl+Alt+T
Source          Manual
Implementation  Run
Value           wt.exe
```

은 Build AHK 대상입니다.

---

# 15. AHK Companion v7 추가 역할

기존 역할:

- Full Studio 로컬 서버
- Active App / Window 감지
- Layer 1 사용량
- Layer 2 사용량
- History
- Studio JSON 미러

v7 추가:

## Site Runtime 저장

Tampermonkey가:

```text
POST /site-runtime
```

으로 현재 웹페이지 Runtime 정보를 보낼 수 있습니다.

확인:

```text
GET /site-runtime
```

이 endpoint는 이후 Full Studio의 Web Context / Quick Panel 기능을 더 확장할 기반입니다.

---

# 16. Studio State 동기화

v25 Full Studio는 Companion 연결 시 주기적으로:

```text
GET /studio-state
```

를 확인합니다.

Companion에 저장된 `savedAt`가 현재 Full Studio보다 최신이면 Full Studio를 갱신합니다.

따라서 Quick Panel에서 저장한 내용이 Full Studio에 반영됩니다.

Full Studio 저장은 기존처럼:

```text
localStorage
+
Companion /studio-state
```

양쪽에 반영됩니다.

---

# 17. 현재 저장 구조

```text
Browser localStorage
v21-pro-shortcut-studio-v25
```

Full Studio의 빠른 로컬 Cache.

```text
v21-studio-state.json
```

Companion이 보관하는 공유 Studio State.

```text
v21-companion-layout.txt
```

Layer 1 Trigger Layout.

```text
v21-companion-l2-layout.txt
```

Layer 2 Signal Layout.

```text
v21-companion-known-triggers.txt
```

과거 Layer 1 Trigger.

```text
v21-companion-usage.ini
```

Layer 1 / Layer 2 사용량.

```text
v21-companion-history.jsonl
```

입력 / Layout 변경 History.

---

# 18. 기존 AHK 파일에 대한 처리

이번 작업에서 기존 AHK 파일은 **참고만** 했습니다.

자동으로 Studio Dictionary에 넣지 않았습니다.

이유:

- 일부 F-Key가 프로그램 조건에 따라 다르게 동작
- 일부는 좌표 Click 매크로
- 싱글/더블클릭 동작 존재
- 사용자의 최종 Action 이름 / Context 구분이 아직 확정되지 않은 부분 존재

즉 섣불리 Action 이름과 Context를 추측해서 import하면 오히려 Shortcut Hub 데이터가 틀릴 수 있습니다.

필요할 때:

```text
Library
→ Upload
→ Copy AI prompt
```

를 사용해 AHK 파일별로 Dictionary를 정리한 뒤 Merge하는 방식을 권장합니다.

---

# 19. KRISS Starter Dictionary가 임시인 이유

Starter Dictionary는 현재 userscript에 있던 임시 매핑을 옮겨놓은 초기 데이터일 뿐입니다.

userscript는 Starter Trigger에 의존하지 않습니다.

따라서 다음을 Studio에서 바꿔도 됩니다.

```text
Alt+1 → Ctrl+Alt+1
Alt+2 → F13
Alt+3 → Ctrl+Shift+A
```

단:

- 일반 Keyboard Trigger이면 `keyboard` Binding
- V21 Layer 2 F-Key이면 `v21-l2` Binding

으로 저장되어야 합니다.

---

# 20. 실제 사용 예

## 승인 Trigger 변경

현재:

```text
Alt+2 → 승인
```

새 설정:

```text
Ctrl+Alt+A → 승인
```

Studio에서 Binding 수정.

Tampermonkey 재작성 불필요.

---

## V21 Layer 2 F18을 승인으로 사용

Library 또는 Layer 2:

```text
Context        KRISS IPMS · 상세 팝업
Action         승인
Layer 2 Signal F18
Source         KRISS IPMS · 상세 팝업 Adapter
Implementation Document only
```

이후 해당 페이지에서 V21이 F18을 보내면 userscript가 Studio State를 보고 `승인` 버튼을 클릭합니다.

---

# 21. 브라우저 예약키

Tampermonkey `keydown` capture를 사용하더라도 브라우저가 먼저 처리하는 일부 Trigger는 완벽히 제어되지 않을 수 있습니다.

예:

```text
Ctrl+W
Ctrl+L
Alt+F
```

웹 Action용 V21에는 가능하면:

```text
F13–F24
Alt+숫자/문자 중 충돌이 적은 조합
기타 중립 Signal
```

을 권장합니다.

---

# 22. 안전 원칙

KRISS Adapter는 현재:

> 버튼 1회 클릭

까지만 자동화합니다.

그 뒤 뜨는 확인창을 자동 승인하지 않습니다.

이는 기존 상세 팝업 userscript의 안전 원칙을 유지한 것입니다.

---

# 23. 문제 해결

## Alt+/를 눌러도 Panel이 안 뜸

1. Companion v7 실행 확인
2. 같은 폴더에 Studio v25 존재 확인
3. Tampermonkey userscript 활성화 확인
4. 현재 페이지가 상세 팝업인지 확인
5. 브라우저 콘솔에서 `[V21-IPMS]` 확인하려면 userscript의 `DEBUG=true`

---

## Panel은 뜨는데 Global만 보임

Starter Dictionary가 아직 Upload되지 않았거나 Context 이름이 다를 수 있습니다.

권장 이름:

```text
KRISS IPMS · 상세 팝업
```

---

## 키를 눌러도 버튼이 실행되지 않음

확인:

1. Studio Binding이 해당 Context에 있는가
2. Source Type이 `Tampermonkey`인가
3. Action 이름을 Adapter가 알고 있는가
4. 현재 페이지에 실제 버튼이 존재하는가
5. Conflict가 있는가

---

## Quick Panel에서 저장했는데 Full Studio가 바로 안 바뀜

Companion 연결을 확인합니다.

Full Studio는 Companion State를 약 2초 간격과 Window Focus 시 다시 확인합니다.

---

# 24. 권장 작업 흐름

```text
1. Companion v7 실행
2. Full Studio 열기
3. Starter Dictionary Merge
4. 새 KRISS Adapter userscript 설치
5. 기존 KRISS 단축키 userscript 비활성화
6. KRISS 상세 팝업 열기
7. Alt+/ → Quick Panel 확인
8. Studio에서 Trigger 하나 변경
9. 페이지에서 새 Trigger 테스트
10. Quick Panel / Full Studio가 같은 데이터인지 확인
```

---

# 25. 앞으로 확장 가능한 구조

같은 방식으로 다른 Tampermonkey 스크립트도 Site Adapter로 바꿀 수 있습니다.

```text
YouTube Adapter
전자결재 Adapter
사내 시스템 Adapter
웹 메일 Adapter
```

각 Adapter는:

```text
Action 실행법 + 현재 페이지 상태
```

만 알고,

모든 Trigger / V21 배치는 Studio에서 통합 관리합니다.

이렇게 하면 userscript마다 별도 치트시트를 만들 필요가 없어집니다.
