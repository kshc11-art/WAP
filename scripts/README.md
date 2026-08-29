# scripts/

**여기 있는 파일은 봇이 만든 것이다. 직접 편집하지 않는다.**

Tampermonkey에 붙여넣을 사본이 `<slug>.user.js` 이름으로 놓인다.
slug는 [`contracts/scripts.yaml`](../contracts/scripts.yaml)이 정한다 —
**파일명을 사람이 지을 일이 없다.**

## 고치고 싶으면

1. `state/brief/<slug>.md` + 이 폴더의 `<slug>.user.js` 를 AI에 붙여넣는다
2. 받은 파일 전문을 [`inbox/`](../inbox/)에 넣고 커밋한다
3. 봇이 정리해서 이 폴더로 돌려준다
4. 그걸 **Tampermonkey 편집기에서 덮어쓴다** ("새 스크립트 설치" 금지)

## 파일 안에서 건드리면 안 되는 것

| | 왜 |
|---|---|
| `/* WAP-ID START … END */` | 킬스위치 + 자기등록. 지우면 `Alt+Shift+X` 전체 정지가 안 된다 |
| `@namespace` | Tampermonkey 식별자. 바꾸면 별개 스크립트가 되어 저장 데이터가 갈린다 |
| `/* WAP-INLINE … */` 마커 쌍 | 공유 코드 경계. 봇이 원본과 동일하게 유지한다 |

위 셋은 **커밋 차단 대상**이다(→ [ENGINEERING_RULES §0](../ENGINEERING_RULES.md)).

## 새 스크립트를 추가하려면

먼저 `contracts/scripts.yaml`에 slug를 등록하고, 그 다음에 만든다.
등록 없이 `inbox/`에 넣으면 반입기가 slug를 판정하지 못하고 그대로 남긴다.
