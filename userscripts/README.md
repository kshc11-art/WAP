# userscripts

Tampermonkey 스크립트를 둡니다.

## 규칙

- **파일 1개 = 스크립트 1개.** 하나로 합치지 않습니다. (합치면 어떤 기능을 고쳤는지 diff로 안 보임)
- 확장자는 `.user.js`. `.txt`로 두지 않습니다.
- 하위 폴더를 만들지 않습니다. 프로젝트 구분은 [../README.md](../README.md)의 목록과 Issue Label로 합니다.
- 기능이 바뀌면 `// @version`을 올립니다. Tampermonkey가 이 값으로 업데이트를 판단합니다.

## 스크립트 헤더 최소 형식

```javascript
// ==UserScript==
// @name         [IPMS] 기능 이름
// @namespace    wap
// @version      1.0.0
// @description  한 줄 설명
// @match        https://.../*
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  const ENABLED = true;          // 긴급 OFF 스위치
  if (!ENABLED) return;

  try {
    const target = document.querySelector('...');
    if (!target) return;          // DOM 없으면 조용히 종료
    // ...
  } catch (e) {
    console.warn('[WAP] 기능 이름:', e);   // 사내 페이지로 예외를 흘리지 않음
  }
})();
```

`ENABLED` 스위치와 `if (!target) return`, 최상위 `try/catch`는 **모든 스크립트에 있어야 합니다.**
→ [../ENGINEERING_RULES.md](../ENGINEERING_RULES.md) §3
