V21 Pro Shortcut Studio v25 — Quick Panel package

권장 순서
1. v21-pro-companion-v7.ahk 와 v21-pro-shortcut-studio-v25.html 을 같은 폴더에 둡니다.
2. Companion v7 실행 → Tray → Open Studio.
3. Library → Upload → KRISS-IPMS-V21-Starter-Dictionary-v25.json → Merge.
4. 기존 "KRISS IPMS - 상세 팝업 단축키" userscript는 비활성화합니다.
5. KRISS-IPMS-V21-Quick-Panel-Adapter-v25.user.js 를 Tampermonkey에 설치합니다.
6. 상세 팝업에서 Alt+/ 또는 왼쪽 아래 V21 badge → Quick Panel.
7. Trigger/Action은 Studio에서 변경합니다. userscript의 키 매핑을 수정할 필요가 없습니다.

핵심
- Studio = Shortcut 데이터/설계의 원본
- Companion = 공유 State + 앱/입력/History
- Tampermonkey Adapter = 현재 웹페이지 DOM을 보고 Action 실행 + Compact Studio 호출
