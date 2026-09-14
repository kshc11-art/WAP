// ==UserScript==
// @name         [KRISS Portal] 메인 화면 테마
// @namespace    kriss.krisstar.tools
// @version      1.5.5
// @description  크리스타 포털 메인(index.do) 화면 스킨 + 검색창 옆 업무 바로가기 + 위젯 정리(표시·순서). 테마 Alt+Shift+T, 확장 모드 Alt+Shift+F, 위젯 정리 Alt+Shift+W, 설정 초기화 Alt+Shift+R
// @match        https://krisstar.kriss.re.kr/index.do*
// @match        https://krisstar.kriss.re.kr/
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

/*
 * v1.5.5 (2026-08-25) — 로그아웃 버튼이 아래로 밀리던 문제 교정 (patch, 1.5.4 -> 1.5.5)
 *  [증상] 바로가기·검색폼은 한 줄로 붙었는데, 그 줄에 있던 로그아웃 버튼만 다음 줄로 내려갔다.
 *  [원인] 표식(data-pt-qhost)을 '검색폼의 부모'에만 붙였다. 그 부모가 display:flex가 되면서
 *    블록 전폭을 차지하고, 같은 줄에 있던 형제(로그아웃)가 다음 줄로 떨어진다.
 *    검색폼의 부모는 '검색 상자'일 뿐 '줄'이 아니었다.
 *  [교정·앵커] 검색폼과 로그아웃을 함께 담는 가장 가까운 조상을 찾아 그것을 줄로 삼는다
 *    (최대 4단계까지, 직계 자식 8개 이하인 컨테이너만 — 헤더 전체를 flex로 만들지 않기 위한 제한).
 *    로그아웃을 못 찾으면 종전대로 검색폼의 부모를 쓴다.
 *  [교정·순서] 줄의 식구를 order로 세운다: 바로가기 0 · 나머지(검색폼·로그아웃 등) 1.
 *    막대는 항상 컨테이너의 첫 자식으로 넣어 DOM 순서와 CSS order를 일치시킨다.
 *    나머지 식구는 flex:0 0 auto로 자기 폭을 지키고, 남는 폭은 바로가기가 쓰며 모자라면 스크롤한다.
 *  [무변경] 대상 화면·POST 계약 · KrissDash 소비 · 바로가기 관리 · 위젯 정리 · 테마 시트.
 */

/*
 * v1.5.4 (2026-08-25) — 바로가기가 검색창 위 별도 줄로 갈라지던 문제 교정 (patch, 1.5.3 -> 1.5.4)
 *  [증상] v1.5.3에서 마운트는 됐으나 바로가기가 1줄, 검색폼이 2줄로 갈라졌다.
 *  [원인] flex 줄에 flex-wrap:wrap이 걸려 있었고, 막대는 flex:1 1 auto(기준폭 = 내용폭 ≈ 700px+),
 *    검색폼은 min-width:280px였다. 컨테이너 폭이 둘의 합보다 좁으면 줄바꿈이 일어난다.
 *    포털 검색 컨테이너는 그만큼 넓지 않아 항상 두 줄로 떨어졌다.
 *  [교정] ① 줄바꿈 금지(flex-wrap:nowrap) ② 막대는 flex:1 1 0% · min-width:0 으로 '남는 폭만' 쓰고
 *    모자라면 줄을 늘리는 대신 가로로 스크롤한다(스크롤바는 감춘다) ③ 인라인 모드 버튼을
 *    14px/6·12 → 13px/5·9로 줄이고 우측 여백 스페이서(.qsp)를 접어 같은 폭에 더 담는다
 *    ④ 검색폼은 flex:0 1 420px · min-width:240px 로 축소 가능하되 하한을 둔다.
 *    ⑤ 컨테이너의 다른 자식(로그아웃 버튼 등)은 flex:0 0 auto로 자기 폭을 지킨다.
 *  [무변경] 앵커 역탐색(#SrcForm·입력의 form) · 좌우 order · POST 계약 · 위젯 정리 · 테마 시트.
 */

/*
 * v1.5.3 (2026-08-25) — 바로가기가 검색창 옆에 붙지 않던 문제 교정 (patch, 1.5.2 -> 1.5.3)
 *  [증상] 검색줄에 바로가기가 없고 대시보드 폴백 줄(#pd-go)만 보였다. 즉 #pt-quick 마운트 자체가
 *    실패했거나, 붙었어도 flex 배분이 먹지 않아 줄을 이루지 못했다.
 *  [원인1·앵커] 앵커를 컨테이너 id·class(#search_box · .work_search)로만 찾았다. 포털이 검색폼을
 *    다른 컨테이너에 그리면 앵커가 null → 검색창 폴백(중앙 컬럼 상단)으로 새고, 대시보드는
 *    #pt-quick이 없다고 보고 자기 폴백 줄을 그린다. → 검색폼(#SrcForm · name=SrcForm · 검색 입력의
 *    form)에서 역탐색하는 경로를 추가한다.
 *  [원인2·host] flex 배분(폼 0 1 460px · 막대 1 1 auto)은 둘이 같은 부모의 '직계 자식'일 때만 먹는다.
 *    폼이 컨테이너 안쪽에 한 겹 더 들어가 있으면 표식을 붙여도 한 줄이 되지 않는다.
 *    → 표식(data-pt-qhost)을 폼의 부모에 붙이고 막대도 그 부모에 넣는다.
 *  [원인3·좌우] DOM 삽입 순서만으로 좌우를 정하면 포털 재렌더 때 뒤집힐 수 있다.
 *    → CSS order(막대 0 · 폼 1)로 '바로가기 좌측 · 검색폼 우측'을 한 번 더 못 박는다.
 *  [보강] flex 줄 규칙을 [data-pt-qhost] 단독 선택자로 바꿔 컨테이너가 무엇이든 적용되게 하고,
 *    앵커를 끝내 못 찾으면 콘솔에 1회만 경고를 남긴다(원인 추적용).
 *  [무변경] 대상 화면·POST 계약 · KrissDash 소비 · 바로가기 관리 · 위젯 정리 · 테마 시트.
 */

/*
 * v1.5.2 (2026-08-24) — 바로가기 좌측·검색창 우측 · 강조 해제 · 개별 등록 관리 (patch, 1.5.1 -> 1.5.2)
 *  [배치] 같은 줄 안에서 좌우를 바꾼다 — 바로가기 줄이 왼쪽, 검색폼(#SrcForm)이 오른쪽.
 *    막대를 폼 '앞'에 삽입하고 flex 배분(막대 1 1 auto · 폼 0 1 460px)은 그대로 두어
 *    폼이 자연히 우측 끝에 붙는다. 폼 구조·전송 계약 무간섭 원칙 유지.
 *  [표기] 지출발의 신청 강조(.hi 주황 굵게) 해제 — 열 항목 중 하나만 소리칠 이유가 없다.
 *    사용 빈도는 위치(줄 내 순서)로만 말하게 한다. 죽은 .hi 규칙도 함께 제거.
 *  [기능·바로가기 관리] 설정 팝업과 확장 메뉴에 '바로가기 관리'를 추가한다(pt_quick_items_v1).
 *    · 기본 10항목: 체크로 줄 등록/해제(계약·순서 무변경).
 *    · 사용자 추가: 이름 + URL('/'로 시작하는 포털 경로 또는 https:// 주소)로 GET 새 창 항목을
 *      등록·삭제한다. 지출발의 신청처럼 폼 전송 계약(workFlag·processCode 등)이 필요한 화면은
 *      URL 등록으로 재현할 수 없으므로 관리창에 한계를 명시하고, 그런 화면은 계약이 내장된
 *      기본 항목으로만 제공한다.
 *  [무변경] KrissDash 소비 · #pt-quick 소유권 · data-pt-qhost 원복 규약 · 위젯 정리 · 테마 시트.
 */

/*
 * v1.5.1 (2026-08-24) — 바로가기를 검색창과 같은 줄로 · 라벨 제거 · 글자 확대 (patch, 1.5.0 -> 1.5.1)
 *  [배치] #pt-quick을 검색창(#search_box) 아래 별도 줄에서 검색창 '안'으로 옮겨 검색폼(#SrcForm)과
 *    같은 줄에 나란히 둔다. 컨테이너에 data-pt-qhost 표식을 붙여 flex 줄로 만들고(표식 제거 = 원복),
 *    검색폼은 flex:0 1 460px(최소 280px)로 두어 남는 폭을 바로가기가 쓴다. 좁은 화면에서는
 *    flex-wrap으로 자연스럽게 다음 줄로 내려간다. 검색창 부재 시 con_center 최상단 독립 카드
 *    폴백은 유지한다. 실측 #SrcForm(euc-kr POST · Kendo autocomplete · hidden 필드)은 구조를
 *    건드리지 않는다 — 컨테이너 배치와 폼 폭만 조정한다.
 *  [표기] '바로가기' 라벨(.qlv) 제거 — 같은 줄에서는 위치가 곧 설명이라 문구가 잉크 중복이다.
 *  [타이포] 버튼 12.5px→14px(패딩 6×12), '위젯 정리' 11.5px→12.5px. 인라인 모드에서는 카드
 *    테두리·그림자·배경을 걷어 검색 줄의 일부로 보이게 한다(호버 필·강조색은 유지).
 *  [정리] 바로가기 끄기 시 data-pt-qhost 표식도 함께 제거해 검색창 배치를 원상 복구한다.
 *    heal 주기의 syncQuick이 표식 유실(포털 재렌더)을 감지해 재마운트한다.
 *  [무변경] 대상 화면 · KrissDash 계약 소비 · 지출발의 POST 계약 · 위젯 정리 · 테마 시트.
 */

/*
 * v1.5.0 (2026-08-23) — 업무 바로가기 인수 · 위젯 정리 인수 (minor revision, 1.4.0 -> 1.5.0)
 *
 * [책임 정리] 대시보드(업무 대시보드 v1.25.0)와 겹치던 두 가지를 이 파일이 인수한다.
 *   화면 이동과 포털 배치는 '포털 전역'의 일이고, 대시보드는 오늘 처리할 업무의 현황판이다.
 *
 *  [인수1·업무 바로가기] 포털 검색창(#search_box) 바로 아래에 바로가기 줄(#pt-quick)을 만든다.
 *    신청·선행조사·출원·업무요청·등록·청구서·마스터·연차료·개인저작물·지출발의 신청.
 *    · 대시보드가 살아 있으면 unsafeWindow.KrissDash 계약을 호출한다(토스트·팝업 폴백 재사용).
 *      대시보드가 없거나 꺼져 있으면 같은 URL을 자체적으로 새 창으로 연다 — 양쪽 독립 동작.
 *    · 지출발의 신청만 GET 북마크가 불가한 화면이라, 실측 BPM newWork 계약을 폼 POST로 재현한다
 *      (bizKey 빈값 · workFlag=newWork · processCode=B_ACT00002 · statusCode=ST0100 · subFlag=N).
 *    · 검색창을 못 찾으면 con_center 최상단으로 폴백한다. 대시보드는 #pt-quick의 존재를 보고
 *      자기 폴백 줄을 그리지 않는다(중복 방지).
 *  [인수2·위젯 정리] #con_left·#con_center·#con_right의 .widget을 훑어 표시/숨김과 컬럼 내
 *    순서를 저장한다(pt_wl_v1). 순서는 DOM 이동만 사용하고 원래 인덱스를 data-pt-oidx에 남겨
 *    언제든 원복한다. 대시보드가 v1.23.3에서 내려놓은 기능을 여기서 이어받는다. Alt+Shift+W.
 *  [유지] 테마 스타일·확장 모드·목록 높이 3단·대시보드 톤 정렬·자가 복구·하드 리셋(Alt+Shift+R).
 *
 * ─────────────────────────────────────────────────────────────
 * v1.4.0 (2026-08-19) — 확장 모드 재설계, 우측 잘림 수정 (minor revision, 1.3.1 -> 1.4.0)
 *
 * [실화면 확인] 표준/확장 두 모드 캡처 대조. 확장 모드의 접근 자체가 틀렸다.
 *
 *  [수정1·확장 모드 재정의] '높이 제한 해제'에서 '높이를 넉넉하게 통일'로 바꾼다.
 *    원본이 위젯 높이를 고정한 이유가 있었다. 중앙 컬럼은 좌우 2단 float 배치라
 *    높이가 제각각이면 짝이 어긋나고 빈 공간이 생긴다. 실제로 새 게시물 30건이 모두 펼쳐지자
 *    오른쪽 행사 카드와 균형이 무너졌다. 목업도 무한히 펼친 것이 아니라 카드 높이가 나란했다.
 *    → conarea는 절대배치를 유지한 채 높이만 151·168·173px에서 300px(조절 가능)로 키우고,
 *      위젯 min-height를 함께 올려 좌우 짝의 높이를 맞춘다. 스크롤은 필요할 때만 나오게 한다.
 *    → display:contents 기반 탭 재구성(v1.3.0)은 철회한다. 구조를 흔들지 않아도
 *      높이·여백·타이포만으로 목표한 인상에 도달한다.
 *
 *  [수정2·우측 잘림] '내역' 버튼과 게시물 날짜가 오른쪽에서 잘리던 원인.
 *    common.css의 reset에 box-sizing 선언이 없어 기본값이 content-box다.
 *    .conarea는 position:absolute; width:100% 이므로 좌우 padding 16px을 주는 순간
 *    실제 폭이 100%+32px이 되어 오른쪽으로 넘친다.
 *    → 손대는 절대배치 영역에 box-sizing:border-box를 함께 지정한다.
 *    → 목록 폭도 반올림 여유를 두고 다시 계산한다(제목 76% + 날짜 20% + 여백 2%).
 *
 *  [수정3·높이 선택] 설정 팝업에서 목록 높이를 3단(보통 300 / 크게 420 / 아주 크게 560)으로
 *    고른다. CSS 변수(--pt-conh)로 처리하며 위젯 min-height가 함께 따라간다.
 *
 *  [수정4·타이포] 목업 기준으로 다시 맞춘다. 탭은 배경과 세로 구분선을 지우고 활성만 하단
 *    주황선으로 표시. 상태 배지는 전부 주황이라 시끄러워 기본을 회색으로 낮추고, 행 구분은
 *    점선 한 겹으로 통일한다. 행 hover 배경을 넣어 목록 훑기를 돕는다.
 *
 * ─────────────────────────────────────────────────────────────
 * v1.3.1 (2026-08-19) — 테마를 끄면 되돌릴 수 없던 오류 수정
 *   전환 UI 스타일시트 분리, 자가 복구, 확장 메뉴 복구 경로, 하드 리셋(Alt+Shift+R).
 * v1.3.0 (2026-08-19) — 확장 모드 최초 도입(본 버전에서 방식 교체)
 * v1.2.0 (2026-08-19) — 원본 CSS 실측 반영, 개입 범위 축소
 * v1.1.0 (2026-08-19) — 실화면 캡처 기반 파손 규칙 철회
 * v1.0.0 (2026-08-19) — 최초 배포
 * ───────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const VER = '1.5.5';
  const K = {
    on: 'pt_on_v1', bkmk: 'pt_hide_bkmk_v1', full: 'pt_full_v1', conh: 'pt_conh_v1',
    quick: 'pt_quick_v1',   // v1.5.0: 검색창 옆 업무 바로가기
    qitems: 'pt_quick_items_v1',   // v1.5.2: 바로가기 개별 등록 {hidden:[k], custom:[{id,nm,url}]}
    wl: 'pt_wl_v1',         // v1.5.0: 위젯 표시/숨김·순서 {hidden:[key], order:{colId:[key]}}
  };
  const DEF = { on: true, bkmk: true, full: true, conh: 300, quick: true };
  const HEIGHTS = [[300, '보통'], [420, '크게'], [560, '아주 크게']];
  const UW = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

  const gv = (k, d) => { try { const v = GM_getValue(k); return v === undefined ? d : JSON.parse(v); } catch (e) { return d; } };
  const sv = (k, v) => { try { GM_setValue(k, JSON.stringify(v)); } catch (e) { /* noop */ } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* v1.5.0 ── 바로가기 대상(대시보드 IPMS_URL 실측과 동일) ─────────────── */
  const QUICK = [
    { k: 'apply', nm: '신청', url: '/pms/res/intellppty/S_PMS_03010100.do' },
    { k: 'pps', nm: '선행조사', url: '/pms/iprs/pps/S_PMS_03011020.do' },
    { k: 'file', nm: '출원', url: '/pms/iprs/aply/S_PMS_03012010.do' },
    { k: 'task', nm: '업무요청', url: '/pms/iprs/etcTask/S_PMS_03014010.do' },
    { k: 'reg', nm: '등록', url: '/pms/iprs/reg/S_PMS_03013010.do' },
    { k: 'exp', nm: '청구서', url: '/pms/iprs/exp/S_PMS_03015020.do' },
    { k: 'master', nm: '마스터', url: '/pms/iprs/mng/S_PMS_03019010.do' },
    { k: 'pm', nm: '연차료', url: '/pms/iprs/pm/S_PMS_03016010.do' },
    { k: 'tets', nm: '개인저작물', url: '/pms/res/tets/S_PMS_03020305.do' },
    { k: 'expnew', nm: '지출발의 신청', url: '/mis/acc/popup/S_ACC_01020100.do', post: { bizKey: '', workFlag: 'newWork', processCode: 'B_ACT00002', statusCode: 'ST0100', subFlag: 'N' } },
  ];

  /* v1.5.2 ── 바로가기 개별 등록 ─────────────────────────────
   * 기본 항목은 체크로 등록/해제, 사용자 항목은 이름+URL(GET 새 창)로 추가한다.
   * 폼 전송 계약(workFlag·processCode 등)이 필요한 화면은 URL로 재현할 수 없다 —
   * 그런 화면(지출발의 신청)은 계약이 내장된 기본 항목으로만 제공한다. */
  function qprefs() {
    const p = gv(K.qitems, null);
    return (p && typeof p === 'object')
      ? { hidden: Array.isArray(p.hidden) ? p.hidden : [], custom: Array.isArray(p.custom) ? p.custom : [] }
      : { hidden: [], custom: [] };
  }
  function saveQprefs(p) { sv(K.qitems, { hidden: p.hidden || [], custom: p.custom || [] }); }
  function effectiveQuick() {
    const p = qprefs();
    return QUICK.filter((q) => p.hidden.indexOf(q.k) < 0)
      .concat(p.custom.map((c) => ({ k: 'c_' + c.id, nm: c.nm, url: c.url, custom: true })));
  }
  function rebuildQuick() { const c = document.getElementById('pt-quick'); if (c) c.remove(); syncQuick(); }

  /* ══ 1. 테마 스타일 (끄기 대상) ════════════════════════════
   * 확정된 금지 사항(원본 CSS 실측 근거)
   *   1) background 단축속성 금지 — 배경 이미지를 지운다.
   *   2) 버튼에 font-size·color 지정 금지 — 이미지 대체 버튼의 숨은 글자가 드러난다.
   *   3) 글꼴 일괄 지정 금지 — 포털 전용 웹폰트(pretendardGov)가 이미 적용되어 있다.
   *   4) .info_area 내부 색 지정 금지 — 주황 배경 전용 흰색 아이콘이 얹혀 있다.
   *   5) 절대배치 요소에 padding을 줄 때 box-sizing:border-box를 함께 지정한다.
   * ─────────────────────────────────────────────────────────── */
  function themeCss() {
    return `
:root{
  --pt-ink:#17181C; --pt-steel:#5F6470; --pt-faint:#9AA0AC;
  --pt-line:#E7E8EC; --pt-line2:#DCDDE3;
  --pt-bg:#F4F5F7; --pt-tint:#FAFAFB;
  --pt-org:#F37021; --pt-deep:#C14E08; --pt-soft:#FDEADD;
  --pt-conh:300px;
}

/* ══ 기본(안전) 계층 ═══════════════════════════════════════ */
body{ background-color:var(--pt-bg) !important; }
#wrap_main{ font-variant-numeric:tabular-nums; }
#wrap_main :focus-visible{ outline:2px solid var(--pt-org); outline-offset:2px; }

#wrap_main .widget{
  border-radius:12px !important;
  box-shadow:0 1px 2px rgba(20,24,34,.05) !important;
}
#wrap_main .widget:not(.info_area){
  background-color:#fff !important;
  border-color:var(--pt-line) !important;
}
#wrap_main .info_area{ overflow:hidden !important; }

#wrap_main .timecard{
  background-image:linear-gradient(135deg,#F9852F,#E85F06) !important;
  border-color:transparent !important;
  border-radius:12px !important;
  box-shadow:0 8px 20px -10px rgba(232,95,6,.5) !important;
}
#wrap_main .timecard .punchbox button{
  border-radius:7px !important;
  border-color:rgba(255,255,255,.55) !important;
  background-color:rgba(255,255,255,.16) !important;
}
#wrap_main .timecard .punchbox button:hover{ background-color:rgba(255,255,255,.30) !important; }

#wrap_main .tab_menu > div.on > h2 > button{ color:var(--pt-deep) !important; font-weight:700 !important; }

#wrap_main .menu_work .list01 li{
  display:flex !important; align-items:center !important; gap:8px !important;
  border-bottom:1px dashed var(--pt-line) !important;
}
#wrap_main .menu_work .list01 li:last-child{ border-bottom:0 !important; }
#wrap_main .menu_work .list01 .work_condition{ order:1; flex:none !important; }
#wrap_main .menu_work .list01 .work_title{ order:2; flex:1 1 auto !important; width:auto !important; min-width:0 !important; }
#wrap_main .menu_work .list01 .work_date{ order:3; flex:none !important; width:auto !important; }
#wrap_main .menu_work .list01 li button{ order:4; flex:none !important; float:none !important; border-radius:6px !important; border-color:var(--pt-line2) !important; }

#wrap_main .boardarea li{ border-bottom:1px dashed var(--pt-line) !important; }
#wrap_main .boardarea li:last-child{ border-bottom:0 !important; }
#wrap_main .tab_menu table thead th{ background-color:var(--pt-tint) !important; border-color:var(--pt-line2) !important; }
#wrap_main .tab_menu table td{ border-color:var(--pt-line) !important; }
#wrap_main .tab_menu table tbody tr:hover td{ background-color:var(--pt-tint) !important; }
#wrap_main .tab_menu table button{ border-radius:6px !important; border-color:var(--pt-line2) !important; }

#wrap_main .quick_menu .menu{ border-radius:10px !important; overflow:hidden !important; border-color:var(--pt-line2) !important; }
#wrap_main .quick_menu a{ border-color:var(--pt-line2) !important; }

#search_box input[type="text"]{ border-radius:8px !important; border-width:2px !important; }
#search_box input[type="submit"]{ background-color:var(--pt-org) !important; border-radius:8px !important; }
#search_box button{ border-radius:8px !important; border-color:var(--pt-line2) !important; }
#wrap_main .work_search form input[type="text"]{ border-radius:8px !important; border-color:var(--pt-line2) !important; }

#wrap_main a.map{ border-radius:10px !important; }
#wrap_main .btn-kriss{ border-radius:9px !important; box-shadow:none !important; }
#footer{ background-color:#fff !important; border-top:1px solid var(--pt-line) !important; }

html.pt-hide-bkmk #con_center .work_menu.widget{ display:none !important; }

/* ══ 확장 모드 ═════════════════════════════════════════════
 * 구조는 원본 그대로 두고 높이·여백·타이포만 손본다.
 * 좌우 2단 float이므로 같은 행 위젯의 높이가 같아야 정렬이 유지된다.
 * ─────────────────────────────────────────────────────── */

/* 탭 머리: 배경과 세로 구분선을 지우고 활성만 하단 주황선으로 표시 */
html.pt-full #con_center .tab_menu:not(.menu_today) > div h2{ height:auto !important; }
html.pt-full #con_center .tab_menu:not(.menu_today) > div h2 button{
  height:auto !important; line-height:1.3 !important; padding:12px 8px !important;
  border-top:0 !important; border-right:0 !important;
  border-bottom:1px solid var(--pt-line) !important;
  background-color:#fff !important;
}
html.pt-full #con_center .tab_menu:not(.menu_today) > div.on > h2 button{
  border-bottom:2px solid var(--pt-org) !important;
  color:var(--pt-deep) !important; font-weight:700 !important;
}
html.pt-full #con_center .tab_one > div h2{
  height:auto !important; line-height:1.3 !important; padding:13px 16px !important;
  width:auto !important;
  border-top:0 !important;
  border-bottom:1px solid var(--pt-line) !important;
  background-color:#fff !important;
}

/* 내용 영역: 절대배치는 유지하고 높이만 키운다.
   padding을 주므로 box-sizing을 반드시 함께 지정한다(누락 시 우측 잘림). */
html.pt-full #con_center .tab_menu:not(.menu_today) > div > .conarea,
html.pt-full #con_center .tab_one > div > .conarea{
  box-sizing:border-box !important;
  height:var(--pt-conh,300px) !important;
  max-height:none !important;
  padding:8px 14px 12px !important;
  overflow-x:hidden !important; overflow-y:auto !important;
}
html.pt-full #con_center .menu_work,
html.pt-full #con_center .menu_board,
html.pt-full #con_center .box_calendar,
html.pt-full #con_center .box_staff,
html.pt-full #con_center .menu_user{
  min-height:calc(var(--pt-conh,300px) + 58px) !important;
}

/* 더보기: 활성 탭의 것만 남기고 위젯 우측 상단으로 (글자 속성은 건드리지 않는다) */
html.pt-full #con_center .tab_menu:not(.menu_today) > div.off > .tabmore{ display:none !important; }
html.pt-full #con_center .tab_menu:not(.menu_today) > div.on > .tabmore{
  left:auto !important; right:6px !important; top:4px !important;
}
html.pt-full #con_center .tab_one .tabmore{ left:auto !important; right:6px !important; top:6px !important; }
html.pt-full #con_center .box_calendar .month{ top:9px !important; right:42px !important; }

/* 목록: 폭은 반올림 여유를 두고 다시 계산한다(76 + 20 + 2 = 98%) */
html.pt-full #con_center .boardarea li{ line-height:1.6 !important; padding:5px 0 !important; }
html.pt-full #con_center .boardarea li:hover{ background-color:var(--pt-tint) !important; }
html.pt-full #con_center .boardarea li .listtitle{ padding-left:0 !important; width:76% !important; }
html.pt-full #con_center .menu_work .list01{ width:100% !important; margin:0 !important; padding-top:2px !important; }
html.pt-full #con_center .menu_work .list01 li{ line-height:1.6 !important; padding:5px 0 !important; }
html.pt-full #con_center .menu_work .list01 li:hover{ background-color:var(--pt-tint) !important; }

/* 상태 배지: 전부 주황이라 시끄럽다. 기본을 회색으로 낮춘다. */
html.pt-full #con_center .menu_work .list01 .work_condition{
  background-color:#F2F3F6 !important; color:var(--pt-steel) !important;
  border-radius:6px !important; min-width:56px !important;
}
html.pt-full #con_center .menu_work .list01 .work_date{ color:var(--pt-faint) !important; }

/* 표: 좌우 여백을 맞추고 머리행을 옅게 */
html.pt-full #con_center .tab_menu table{ width:100% !important; margin:4px 0 !important; }
html.pt-full #con_center .tab_menu table th,
html.pt-full #con_center .tab_menu table td{ padding:6px !important; }

/* 높이가 통일되면 좌우 짝이 맞으므로 clear는 좌측 열에만 준다 */
@media screen and (min-width:1240px){
  html.pt-full #con_center:not(.pt-dash) > div:nth-child(odd){ clear:both !important; }
}

/* ══ 업무 대시보드(#pd-panel) ══════════════════════════════ */
body #pd-panel{
  --ink:#17181C; --soft:#5F6470; --faint:#9AA0AC;
  --line:#E7E8EC; --line2:#DCDDE3;
  --card:#FFFFFF; --tint:#FAFAFB; --hov:#FAFAFB;
  --accent:#C14E08; --accent-weak:#FDEADD;
  --over:#B3392E; --soon:#9A6B0F;
  font-family:"pretendardGov","Pretendard","Noto Sans KR","Malgun Gothic",system-ui,sans-serif !important;
  border-color:var(--pt-line) !important;
  border-radius:12px !important;
  box-shadow:0 1px 2px rgba(20,24,34,.05) !important;
}
body #pd-panel .pd-head{ border-radius:11px 11px 0 0 !important; }
body #pd-panel .pd-foot{ border-radius:0 0 11px 11px !important; }

/* 대시보드는 첫 자식으로 <section>을 넣어 div 기준 nth-child 배치를 뒤집는다. 원래 의도로 되돌린다. */
@media screen and (min-width:1240px){
  #con_center.pt-dash > div:nth-child(2),
  #con_center.pt-dash > div:nth-child(3){
    clear:both !important; width:100% !important; float:none !important;
  }
  #con_center.pt-dash > div:nth-child(n+4):nth-child(even){
    clear:both !important; width:49% !important; float:left !important;
  }
  #con_center.pt-dash > div:nth-child(n+4):nth-child(odd){
    clear:none !important; width:48% !important; float:right !important;
  }
}

/* ══ 스크롤바 ═════════════════════════════════════════════ */
#wrap_main ::-webkit-scrollbar{ width:8px; height:8px; }
#wrap_main ::-webkit-scrollbar-thumb{
  background-color:rgba(120,124,132,.28); border-radius:99px;
  border:2px solid transparent; background-clip:content-box;
}
#wrap_main ::-webkit-scrollbar-thumb:hover{ background-color:rgba(120,124,132,.5); }
#wrap_main ::-webkit-scrollbar-track{ background-color:transparent; }
`;
  }

  /* ══ 2. 전환 UI · 바로가기 · 위젯 정리 스타일 (절대 끄지 않는다) ══
   * 테마 시트가 꺼져도 살아 있어야 하므로 CSS 변수를 참조하지 않고 색값을 직접 쓴다.
   * ─────────────────────────────────────────────────────────── */
  function uiCss() {
    return `
#pt-quick{
  box-sizing:border-box !important; clear:both !important; float:none !important;
  display:flex !important; align-items:center !important; flex-wrap:wrap !important; gap:2px !important;
  width:100% !important; max-width:100% !important; margin:8px 0 10px !important;
  padding:6px 10px !important; position:relative !important; z-index:5 !important;
  background-color:#fff !important; border:1px solid #E7E8EC !important; border-radius:10px !important;
  box-shadow:0 1px 2px rgba(20,24,34,.05) !important;
  font-family:"pretendardGov","Pretendard","Malgun Gothic",system-ui,sans-serif !important;
}
/* v1.5.1: 검색창과 같은 줄 — 컨테이너를 flex 줄로, 막대는 카드 껍데기 없이 줄의 일부로.
   v1.5.3: 컨테이너 id·class에 기대지 않고 표식만으로 flex 줄을 만든다(검색폼 부모가 무엇이든). */
[data-pt-qhost]{
  display:flex !important; align-items:center !important;
  flex-wrap:nowrap !important;   /* v1.5.4: 줄바꿈 금지 — 두 줄로 갈라지던 원인 */
  gap:0 12px !important; float:none !important; box-sizing:border-box !important;
}
/* v1.5.5: 줄의 식구를 order로 세운다 — 바로가기 0, 나머지(검색폼·로그아웃 등) 1.
   각자 자기 폭을 지키고, 남는 폭은 바로가기가 쓴다. */
[data-pt-qhost] > *{ order:1 !important; flex:0 0 auto !important; float:none !important; }
[data-pt-qhost] > form{
  order:1 !important;   /* v1.5.3: 검색폼은 오른쪽 */
  flex:0 1 auto !important; min-width:220px !important; max-width:100% !important;
  margin:0 !important; float:none !important; box-sizing:border-box !important;
}
#pt-quick.inline{
  order:0 !important;   /* v1.5.3: 바로가기는 왼쪽 — DOM 순서에 더해 CSS로도 못 박는다 */
  /* v1.5.4: 남는 폭만 쓰고(1 1 0%), 모자라면 줄을 늘리는 대신 가로로 스크롤한다. */
  flex:1 1 0% !important; width:auto !important; min-width:0 !important; max-width:none !important;
  flex-wrap:nowrap !important; overflow-x:auto !important; overflow-y:hidden !important;
  scrollbar-width:none !important; -ms-overflow-style:none !important;
  margin:0 !important; padding:0 !important; clear:none !important;
  background-color:transparent !important; border:0 !important; border-radius:0 !important; box-shadow:none !important;
}
#pt-quick.inline::-webkit-scrollbar{ height:0 !important; width:0 !important; }
#pt-quick.inline button.qb{ padding:5px 9px !important; font-size:13px !important; }
#pt-quick.inline .qsp{ display:none !important; }
#pt-quick.inline button.qcfg{ margin-left:6px !important; }
#pt-quick button.qb{
  border:0 !important; background:none !important; border-radius:7px !important;
  padding:6px 12px !important; margin:0 !important; width:auto !important; height:auto !important;
  font-family:inherit !important; font-size:14px !important; font-weight:500 !important; line-height:1.3 !important;
  color:#5F6470 !important; cursor:pointer !important; white-space:nowrap !important; float:none !important;
}
#pt-quick button.qb:hover{ background-color:#FDEADD !important; color:#C14E08 !important; }
#pt-quick button.qb:active{ background-color:#F6DCC9 !important; }
#pt-quick .qsp{ flex:1 1 auto !important; min-width:4px !important; }
#pt-quick button.qcfg{
  border:1px solid #DCDDE3 !important; background-color:#fff !important; border-radius:7px !important;
  padding:5px 11px !important; font-family:inherit !important; font-size:12.5px !important;
  color:#9AA0AC !important; cursor:pointer !important; white-space:nowrap !important;
  width:auto !important; height:auto !important; float:none !important;
}
#pt-quick button.qcfg:hover{ border-color:#F37021 !important; color:#C14E08 !important; }

/* v1.5.2: 바로가기 관리 모달 */
#pt-qm{
  position:fixed !important; inset:0 !important; z-index:2147482500 !important;
  display:flex !important; align-items:center !important; justify-content:center !important;
  background-color:rgba(23,24,28,.42) !important;
  font-family:"pretendardGov","Pretendard","Malgun Gothic",system-ui,sans-serif !important;
}
#pt-qm .box{ width:520px !important; max-width:92vw !important; max-height:84vh !important; overflow:auto !important;
  background-color:#fff !important; border-radius:14px !important; box-shadow:0 18px 50px rgba(0,0,0,.22) !important; }
#pt-qm .top{ display:flex !important; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid #E7E8EC; font-size:14px; font-weight:700; }
#pt-qm .x{ border:0 !important; background:none !important; font-size:14px; color:#9AA0AC !important; cursor:pointer; padding:4px 8px; border-radius:7px; font-family:inherit !important; }
#pt-qm .x:hover{ background-color:#FAFAFB !important; }
#pt-qm .desc{ padding:10px 18px 4px; font-size:12px; color:#5F6470; line-height:1.55; }
#pt-qm .gh{ padding:12px 18px 4px; font-size:10.5px; font-weight:700; letter-spacing:.08em; color:#9AA0AC; }
#pt-qm .row{ display:flex !important; align-items:center; gap:9px; padding:7px 18px; font-size:13px; }
#pt-qm .row:hover{ background-color:#FAFAFB !important; }
#pt-qm .row input[type="checkbox"]{ width:15px; height:15px; cursor:pointer; }
#pt-qm .nm{ font-weight:500; color:#17181C; white-space:nowrap; }
#pt-qm .nm.off{ color:#9AA0AC; text-decoration:line-through; }
#pt-qm .u{ flex:1; min-width:0; font-size:11.5px; color:#9AA0AC; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#pt-qm .del{ border:0 !important; background:none !important; color:#9AA0AC !important; cursor:pointer; padding:2px 6px; border-radius:6px; font-family:inherit !important; }
#pt-qm .del:hover{ color:#C14E08 !important; background-color:#FDEADD !important; }
#pt-qm .none{ padding:6px 18px 2px; font-size:12px; color:#9AA0AC; }
#pt-qm .addrow{ display:flex !important; gap:7px; padding:10px 18px 4px; }
#pt-qm .ai{ flex:0 1 130px; min-width:90px; height:30px; border:1px solid #DCDDE3 !important; border-radius:8px !important; padding:0 10px !important; font-size:12.5px; font-family:inherit !important; background-color:#fff !important; }
#pt-qm .ai.wide{ flex:1 1 auto; }
#pt-qm .add{ border:1px solid #DCDDE3 !important; background-color:#fff !important; border-radius:8px !important; padding:0 14px !important; font-size:12.5px; font-weight:600; color:#17181C !important; cursor:pointer; font-family:inherit !important; }
#pt-qm .add:hover{ border-color:#F37021 !important; color:#C14E08 !important; }
#pt-qm .err{ padding:4px 18px 0; font-size:12px; color:#C14E08; }
#pt-qm .foot{ display:flex !important; justify-content:flex-end; gap:8px; padding:12px 18px 16px; }
#pt-qm .foot .done{ border:1px solid #C14E08 !important; background-color:#C14E08 !important; color:#fff !important; border-radius:9px !important; padding:7px 15px !important; font-size:12.5px !important; cursor:pointer; font-family:inherit !important; }

#pt-fab{
  position:fixed !important; left:16px !important; bottom:16px !important; z-index:2147482000 !important;
  display:flex !important; align-items:center; gap:6px;
  background-color:rgba(23,24,28,.88) !important; color:#F2F3F6 !important;
  border:0 !important; border-radius:99px !important; padding:8px 14px !important;
  font-family:"pretendardGov","Malgun Gothic",system-ui,sans-serif !important;
  font-size:11.5px !important; font-weight:700 !important; line-height:1.2 !important;
  cursor:pointer; opacity:.38; transition:opacity .18s, transform .18s;
  box-shadow:0 8px 22px -10px rgba(0,0,0,.5) !important;
  width:auto !important; height:auto !important; margin:0 !important; float:none !important;
}
#pt-fab:hover{ opacity:1; transform:translateY(-1px); }
#pt-fab .dot{ width:7px; height:7px; border-radius:50%; background-color:#F37021; flex:none; }
#pt-fab.off{ opacity:.9; background-color:rgba(60,62,68,.94) !important; }
#pt-fab.off .dot{ background-color:#9AA0AC; }

#pt-pop{
  position:fixed !important; left:16px !important; bottom:58px !important; z-index:2147482001 !important;
  background-color:#fff !important; color:#17181C !important;
  border:1px solid #DCDDE3 !important; border-radius:11px !important;
  box-shadow:0 16px 38px -14px rgba(0,0,0,.35) !important;
  padding:7px !important; min-width:250px !important;
  font-family:"pretendardGov","Malgun Gothic",system-ui,sans-serif !important;
  font-size:12.5px !important; line-height:1.4 !important;
}
#pt-pop label{ display:flex !important; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; color:#17181C !important; }
#pt-pop label:hover{ background-color:#FAFAFB; }
#pt-pop input[type="checkbox"]{ width:15px !important; height:15px !important; cursor:pointer; flex:none; margin:0 !important; }
#pt-pop .hrow{ display:flex !important; align-items:center; gap:6px; padding:5px 9px 8px; }
#pt-pop .hrow span{ color:#5F6470 !important; font-size:12px; }
#pt-pop .hbtn{
  flex:1; border:1px solid #DCDDE3 !important; background-color:#fff !important;
  border-radius:7px !important; padding:5px 0 !important; cursor:pointer;
  font-family:inherit !important; font-size:11.5px !important; color:#5F6470 !important;
}
#pt-pop .hbtn.on{ border-color:#F37021 !important; color:#C14E08 !important; background-color:#FDEADD !important; font-weight:700 !important; }
#pt-pop .wbtn{
  display:block; width:100%; text-align:left; border:0; background:none;
  padding:7px 9px; border-radius:8px; cursor:pointer;
  font-family:inherit !important; font-size:12.5px !important; color:#17181C !important;
}
#pt-pop .wbtn:hover{ background-color:#FAFAFB; }
#pt-pop .wbtn .k{ float:right; color:#9AA0AC !important; font-size:11px; }
#pt-pop .rst{
  display:block; width:100%; text-align:left; border:0; background:none;
  padding:7px 9px; border-radius:8px; cursor:pointer;
  font-family:inherit !important; font-size:12.5px !important; color:#B3392E !important;
}
#pt-pop .rst:hover{ background-color:#FAFAFB; }
#pt-pop .hint{ padding:7px 9px 4px; font-size:11px; color:#9AA0AC !important; border-top:1px solid #E7E8EC; margin-top:5px; }

#pt-wm{
  position:fixed !important; inset:0 !important; z-index:2147482100 !important;
  background-color:rgba(23,24,28,.38) !important;
  display:flex !important; align-items:center !important; justify-content:center !important;
  font-family:"pretendardGov","Malgun Gothic",system-ui,sans-serif !important;
}
#pt-wm .box{
  width:min(520px,94vw) !important; max-height:84vh !important; display:flex !important; flex-direction:column !important;
  background-color:#fff !important; color:#17181C !important; border-radius:13px !important;
  box-shadow:0 20px 54px rgba(0,0,0,.24) !important; overflow:hidden !important;
}
#pt-wm .top{ display:flex !important; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid #E7E8EC; font-size:14px; font-weight:700; }
#pt-wm .x{ border:0 !important; background:none !important; font-size:14px; color:#9AA0AC !important; cursor:pointer; padding:4px 8px; border-radius:7px; font-family:inherit !important; }
#pt-wm .x:hover{ background-color:#FAFAFB !important; }
#pt-wm .desc{ padding:11px 18px; font-size:12px; color:#5F6470 !important; background-color:#FAFAFB !important; }
#pt-wm .body{ padding:8px 13px 12px; overflow:auto; }
#pt-wm .grp{ margin:8px 0 14px; }
#pt-wm .gh{ font-size:11.5px; font-weight:700; color:#C14E08 !important; padding:4px; border-bottom:1px solid #E7E8EC; margin-bottom:4px; }
#pt-wm .row{ display:flex !important; align-items:center; gap:9px; padding:6px; border-radius:8px; font-size:12.5px; }
#pt-wm .row:hover{ background-color:#FAFAFB !important; }
#pt-wm .row input[type="checkbox"]{ width:15px !important; height:15px !important; cursor:pointer; flex:none; margin:0 !important; }
#pt-wm .row .nm{ flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#pt-wm .row .nm.off{ color:#9AA0AC !important; text-decoration:line-through; }
#pt-wm .row button.mv{
  border:1px solid #DCDDE3 !important; background-color:#fff !important; border-radius:6px !important;
  width:26px !important; height:24px !important; padding:0 !important; cursor:pointer;
  font-family:inherit !important; font-size:11px !important; color:#5F6470 !important; flex:none;
}
#pt-wm .row button.mv:hover{ border-color:#F37021 !important; color:#C14E08 !important; }
#pt-wm .row button.mv:disabled{ opacity:.35; cursor:default; }
#pt-wm .empty{ padding:26px; text-align:center; color:#9AA0AC !important; font-size:12.5px; }
#pt-wm .foot{ display:flex !important; justify-content:space-between; gap:8px; padding:13px 18px; border-top:1px solid #E7E8EC; }
#pt-wm .foot button{
  border:1px solid #DCDDE3 !important; background-color:#fff !important; border-radius:8px !important;
  padding:7px 15px !important; font-size:12.5px !important; cursor:pointer; font-family:inherit !important; color:#17181C !important;
}
#pt-wm .foot .done{ background-color:#C14E08 !important; color:#fff !important; border-color:#C14E08 !important; }
`;
  }

  /* ══ 3. 스타일 주입과 자가 복구 ════════════════════════════ */
  function makeStyle(id, text) {
    const s = document.createElement('style');
    s.id = id; s.setAttribute('data-pt', '1'); s.textContent = text;
    (document.head || document.documentElement).appendChild(s);
    return s;
  }

  let stTheme = makeStyle('pt-style', themeCss());
  let stUi = makeStyle('pt-ui-style', uiCss());

  function reseat() {
    if (!document.head) return;
    [stTheme, stUi].forEach((s) => { if (s && s.parentNode !== document.head) document.head.appendChild(s); });
  }

  function applyState() {
    const on = gv(K.on, DEF.on);
    const full = gv(K.full, DEF.full);
    let h = parseInt(gv(K.conh, DEF.conh), 10);
    if (!HEIGHTS.some((x) => x[0] === h)) h = DEF.conh;
    const root = document.documentElement;
    stTheme.disabled = !on;
    stUi.disabled = false;              // UI 시트는 어떤 경우에도 끄지 않는다
    root.classList.toggle('pt-hide-bkmk', !!(on && gv(K.bkmk, DEF.bkmk)));
    root.classList.toggle('pt-full', !!(on && full));
    root.style.setProperty('--pt-conh', h + 'px');
    const fab = document.getElementById('pt-fab');
    if (fab) {
      fab.classList.toggle('off', !on);
      const lb = fab.querySelector('.lb');
      if (lb) lb.textContent = on ? (full ? '테마 · 확장' : '테마 · 표준') : '테마 꺼짐 · 켜기';
    }
    syncQuick();
  }

  function heal() {
    try {
      if (!document.getElementById('pt-style')) stTheme = makeStyle('pt-style', themeCss());
      if (!document.getElementById('pt-ui-style')) stUi = makeStyle('pt-ui-style', uiCss());
      reseat(); mountFab(); syncQuick(); applyWidgetPrefs(); applyState();
    } catch (e) { /* noop */ }
  }

  applyState();

  /* ══ 4. 대시보드 감지 ══════════════════════════════════════ */
  function syncDash() {
    const c = document.getElementById('con_center');
    if (c) c.classList.toggle('pt-dash', !!document.getElementById('pd-panel'));
  }
  function watchDash() {
    const c = document.getElementById('con_center');
    if (!c) return;
    syncDash();
    try { new MutationObserver(syncDash).observe(c, { childList: true }); } catch (e) { /* noop */ }
    setTimeout(syncDash, 1500);
    setTimeout(syncDash, 4000);
  }

  /* ══ 5. 업무 바로가기 (v1.5.0 인수 · v1.5.1 같은 줄 배치) ══
   * 검색창과 같은 줄에 둔다 — 화면 이동은 검색과 같은 성격의 전역 내비게이션이므로
   * 한 줄을 나눠 쓴다. 대시보드(KrissDash)가 살아 있으면 그 계약을 호출하고,
   * 없으면 같은 URL을 직접 연다.
   * ─────────────────────────────────────────────────────── */
  function dash() { try { return UW.KrissDash || null; } catch (e) { return null; } }

  function openQuick(item) {
    const d = dash();
    try {
      if (d) {
        if (item.k === 'expnew' && typeof d.openExpProposal === 'function') { d.openExpProposal(); return; }
        if (item.k === 'tets' && typeof d.openTets === 'function') { d.openTets(); return; }
        if (typeof d.openList === 'function' && d.openList(item.k)) return;
      }
    } catch (e) { /* 계약 호출 실패 시 자체 경로로 진행 */ }
    if (item.post) { postWindow(item.url, item.post); return; }
    window.open(location.origin + item.url, '_blank');
  }

  // 지출발의 신청: GET 북마크가 불가한 화면. 실측 BPM newWork 계약을 폼 POST로 재현한다.
  //   bizKey는 '빈값 전송'이 계약의 일부이므로 빈 값도 그대로 넣는다.
  function postWindow(url, params) {
    try {
      const f = document.createElement('form');
      f.setAttribute('data-pt', '1');
      f.method = 'POST'; f.action = location.origin + url; f.target = '_blank'; f.style.display = 'none';
      Object.keys(params).forEach((k) => {
        const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = String(params[k]); f.appendChild(i);
      });
      (document.body || document.documentElement).appendChild(f);
      f.submit();
      setTimeout(() => { try { f.remove(); } catch (e) { /* noop */ } }, 800);
    } catch (e) { window.open(location.origin + url, '_blank'); }
  }

  /* v1.5.3: 검색폼을 못 찾으면 바로가기가 통째로 사라지고 대시보드 폴백 줄만 남는다.
   * 컨테이너 id·class에만 기대지 않고 검색폼에서 역탐색하는 경로를 우선한다. */
  function searchForm() {
    return document.querySelector('#SrcForm, form[name="SrcForm"]')
      || document.querySelector('#search_box form, #wrap_main .work_search form')
      || (function () {
        const i = document.querySelector('#wrap_main input[name="allsearch_text"], #wrap_main input[name="kwd"], #search_box input[type="text"]');
        return (i && i.form) ? i.form : null;
      })();
  }
  /* v1.5.5: 검색폼의 부모만 flex로 만들면 그 부모가 블록 전폭을 차지해, 같은 줄에 있던
   * 로그아웃 버튼이 다음 줄로 떨어진다. 검색폼과 로그아웃을 함께 담는 가장 가까운 조상을
   * '줄'로 삼아 셋(바로가기·검색·로그아웃)을 한 줄에 놓는다. */
  function logoutEl() {
    try {
      const byText = Array.from(document.querySelectorAll('a, button'))
        .find((n) => /^\s*로그\s*아웃\s*$/.test(n.textContent || ''));
      if (byText) return byText;
      return document.querySelector('a[href*="logout"], a[href*="Logout"], a[onclick*="logout"], button[onclick*="logout"]');
    } catch (e) { return null; }
  }
  function rowHost(f) {
    if (!f) return null;
    const lo = logoutEl();
    if (lo) {
      let n = f.parentElement, hops = 0;
      // 헤더 전체를 flex로 만들지 않도록 상승 단계(4)와 직계 자식 수(8)를 제한한다.
      while (n && n !== document.body && hops < 4) {
        if (n.contains(lo) && n.children.length <= 8) return n;
        n = n.parentElement; hops++;
      }
    }
    return f.parentElement;
  }
  function quickAnchor() {
    const f = searchForm();
    if (f) { const h = rowHost(f); if (h) return h; }
    return document.getElementById('search_box')
      || document.querySelector('#wrap_main .work_search')
      || null;
  }

  function mountQuick() {
    if (document.getElementById('pt-quick')) return true;
    const bar = document.createElement('div');
    bar.id = 'pt-quick'; bar.setAttribute('data-pt', '1');
    // v1.5.1: '바로가기' 라벨 제거. v1.5.2: 개별 등록 반영 + 지출발의 강조(.hi) 해제.
    bar.innerHTML =
      effectiveQuick().map((q) => '<button type="button" class="qb" data-q="' + esc(q.k) + '" title="' +
        esc(q.nm + ' — ' + q.url) + '">' + esc(q.nm) + '</button>').join('') +
      '<span class="qsp"></span><button type="button" class="qcfg" title="위젯 정리 (Alt+Shift+W)">위젯 정리</button>';

    const anchor = quickAnchor();
    if (anchor) {
      // v1.5.1: 검색창과 같은 줄 — 컨테이너에 표식(data-pt-qhost)을 붙여 flex 줄로 만든다.
      //   표식 제거 = 배치 원복. 스타일은 uiCss의 [data-pt-qhost] · #pt-quick.inline 규칙이 담당한다.
      // v1.5.5: 앵커가 곧 '줄'이다 — quickAnchor가 로그아웃까지 함께 담는 조상을 골라 준다.
      const host = anchor;
      host.setAttribute('data-pt-qhost', '1');
      bar.classList.add('inline');
      // v1.5.2/v1.5.3/v1.5.5: 바로가기 좌측 — 항상 첫 자식(DOM) + order:0(CSS) 양쪽으로 고정한다.
      host.insertBefore(bar, host.firstChild);
    } else {
      // v1.5.3: 앵커 실패는 조용히 넘기지 않는다 — 폴백으로 새는 원인을 콘솔에 1회 남긴다.
      if (!mountQuick._warned) {
        mountQuick._warned = 1;
        try { console.warn('[PT] 검색폼을 찾지 못해 바로가기를 검색줄에 붙이지 못했습니다 — 중앙 컬럼 상단으로 폴백합니다.'); } catch (e) { /* noop */ }
      }
      const c = document.getElementById('con_center') || document.getElementById('wrap_main');
      if (!c) return false;
      c.insertBefore(bar, c.firstChild);   // 검색창 부재 폴백: 기존 독립 카드 줄 유지
    }
    bar.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('.qcfg')) { e.preventDefault(); openWidgetManager(); return; }
      const b = e.target.closest ? e.target.closest('[data-q]') : null;
      if (!b) return;
      e.preventDefault();
      const item = effectiveQuick().find((q) => q.k === b.getAttribute('data-q'));
      if (!item) return;
      if (item.custom) { window.open(/^https?:\/\//.test(item.url) ? item.url : location.origin + item.url, '_blank'); return; }   // v1.5.2: 사용자 항목은 GET 새 창
      openQuick(item);
    });
    return true;
  }

  function syncQuick() {
    const want = gv(K.quick, DEF.quick);
    const cur = document.getElementById('pt-quick');
    if (!want) {
      if (cur) cur.remove();
      // v1.5.1: 검색창 flex 표식도 걷어 원래 배치로 되돌린다.
      document.querySelectorAll('[data-pt-qhost]').forEach((n) => { try { n.removeAttribute('data-pt-qhost'); } catch (e) { /* noop */ } });
      return;
    }
    if (!cur) { mountQuick(); return; }
    // v1.5.1: 자가 복구 — 포털이 검색창을 다시 그려 표식이 사라졌으면 걷어내고 재마운트한다.
    if (cur.classList.contains('inline') && !cur.closest('[data-pt-qhost]')) { cur.remove(); mountQuick(); }
  }

  /* v1.5.2 ── 바로가기 관리 — 기본 항목 등록/해제 + 사용자 URL 추가 ── */
  function openQuickManager() {
    const old = document.getElementById('pt-qm'); if (old) old.remove();
    const p = qprefs();
    const wrap = document.createElement('div');
    wrap.id = 'pt-qm'; wrap.setAttribute('data-pt', '1');
    const bRows = QUICK.map((q) => {
      const off = p.hidden.indexOf(q.k) >= 0;
      return '<div class="row" data-k="' + esc(q.k) + '"><input type="checkbox"' + (off ? '' : ' checked') + '>' +
        '<span class="nm' + (off ? ' off' : '') + '">' + esc(q.nm) + '</span>' +
        '<span class="u">' + esc(q.url) + (q.post ? ' · 폼 전송 계약 내장' : '') + '</span></div>';
    }).join('');
    const cRows = p.custom.length ? p.custom.map((c) => (
      '<div class="row" data-c="' + esc(String(c.id)) + '"><span class="nm">' + esc(c.nm) + '</span>' +
      '<span class="u">' + esc(c.url) + '</span><button type="button" class="del" title="삭제">✕</button></div>'
    )).join('') : '<div class="none">추가한 바로가기가 없습니다.</div>';
    wrap.innerHTML =
      '<div class="box">' +
      '<div class="top"><span>바로가기 관리</span><button type="button" class="x" title="닫기">✕</button></div>' +
      '<div class="desc">체크를 풀면 그 항목을 줄에서 내립니다. 아래에서 화면 URL을 직접 추가할 수 있습니다.<br>' +
      '폼 전송 계약(workFlag 등)이 필요한 화면은 URL 등록으로 열리지 않습니다 — 지출발의 신청처럼 계약이 내장된 기본 항목을 쓰세요.</div>' +
      '<div class="gh">기본 항목</div>' + bRows +
      '<div class="gh">추가 항목 (GET 새 창)</div>' + cRows +
      '<div class="addrow"><input type="text" class="ai" id="pt-q-nm" placeholder="이름" maxlength="20">' +
      '<input type="text" class="ai wide" id="pt-q-url" placeholder="/pms/… 경로 또는 https:// 주소">' +
      '<button type="button" class="add">추가</button></div>' +
      '<div class="err" id="pt-q-err" hidden></div>' +
      '<div class="foot"><button type="button" class="done">닫기</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    const err = (m) => { const e = wrap.querySelector('#pt-q-err'); if (!e) return; e.textContent = m || ''; e.hidden = !m; };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || (e.target.closest && (e.target.closest('.x') || e.target.closest('.done')))) { wrap.remove(); return; }
      const del = e.target.closest ? e.target.closest('.del') : null;
      if (del) {
        const id = del.closest('.row').getAttribute('data-c');
        const pp = qprefs(); pp.custom = pp.custom.filter((c) => String(c.id) !== id); saveQprefs(pp);
        rebuildQuick(); wrap.remove(); openQuickManager(); return;
      }
      if (e.target.closest && e.target.closest('.add')) {
        const nm = (wrap.querySelector('#pt-q-nm').value || '').trim();
        const url = (wrap.querySelector('#pt-q-url').value || '').trim();
        if (!nm) { err('이름을 입력하세요.'); return; }
        if (!(url.charAt(0) === '/' || /^https?:\/\//.test(url))) { err("URL은 '/'로 시작하는 포털 경로 또는 https:// 주소여야 합니다."); return; }
        const pp = qprefs(); pp.custom.push({ id: Date.now(), nm: nm, url: url }); saveQprefs(pp);
        rebuildQuick(); wrap.remove(); openQuickManager(); return;
      }
    });
    wrap.addEventListener('change', (e) => {
      const cb = e.target.closest ? e.target.closest('input[type="checkbox"]') : null; if (!cb) return;
      const k = cb.closest('.row').getAttribute('data-k');
      const pp = qprefs(); const i = pp.hidden.indexOf(k);
      if (cb.checked && i >= 0) pp.hidden.splice(i, 1);
      else if (!cb.checked && i < 0) pp.hidden.push(k);
      saveQprefs(pp); rebuildQuick();
      const nm = cb.closest('.row').querySelector('.nm'); if (nm) nm.classList.toggle('off', !cb.checked);
    });
  }

  /* ══ 6. 위젯 정리 — 표시/숨김 · 컬럼 내 순서 (v1.5.0 인수) ══
   * 순서는 DOM 이동만 사용하고 원래 인덱스를 data-pt-oidx에 남긴다 → 언제든 원복.
   * 대시보드가 v1.23.3에서 내려놓은 기능을 여기서 이어받는다.
   * ─────────────────────────────────────────────────────── */
  const COLS = [['con_left', '좌측'], ['con_center', '중앙'], ['con_right', '우측']];

  function prefs() {
    const p = gv(K.wl, null);
    return (p && typeof p === 'object') ? { hidden: Array.isArray(p.hidden) ? p.hidden : [], order: p.order || {} } : { hidden: [], order: {} };
  }
  function savePrefs(p) { sv(K.wl, { hidden: p.hidden || [], order: p.order || {} }); }

  function widgetsOf(colId) {
    const col = document.getElementById(colId);
    if (!col) return [];
    return Array.from(col.children).filter((n) => n.nodeType === 1 && n.classList && n.classList.contains('widget') && n.id !== 'pd-panel');
  }
  function wkey(colId, node, idx) {
    if (node.getAttribute('data-pt-wk')) return node.getAttribute('data-pt-wk');
    const cls = Array.from(node.classList).filter((c) => c !== 'widget' && c.indexOf('pt-') !== 0).slice(0, 2).join('.');
    const k = colId + '/' + (node.id || cls || 'w') + '/' + idx;
    node.setAttribute('data-pt-wk', k);
    if (!node.hasAttribute('data-pt-oidx')) node.setAttribute('data-pt-oidx', String(idx));
    return k;
  }
  function wlabel(node) {
    const t = node.querySelector('h2 button, h2, .tit, .title, caption');
    let s = (t && (t.textContent || '')).trim().replace(/\s+/g, ' ');
    if (!s) s = (node.id || Array.from(node.classList).filter((c) => c !== 'widget').join(' ') || '위젯');
    return s.length > 42 ? s.slice(0, 42) + '…' : s;
  }
  function scanAll() {
    return COLS.map(([id, nm]) => ({
      id, nm,
      items: widgetsOf(id).map((n, i) => ({ node: n, key: wkey(id, n, i), label: wlabel(n) })),
    })).filter((c) => c.items.length);
  }

  function applyWidgetPrefs() {
    const p = prefs();
    if (!p.hidden.length && !Object.keys(p.order).length) return;
    scanAll().forEach((col) => {
      // 표시/숨김
      col.items.forEach((it) => {
        const hide = p.hidden.indexOf(it.key) >= 0;
        if (hide) {
          if (!it.node.hasAttribute('data-pt-od')) it.node.setAttribute('data-pt-od', it.node.style.display || '');
          it.node.style.display = 'none';
        } else if (it.node.hasAttribute('data-pt-od')) {
          it.node.style.display = it.node.getAttribute('data-pt-od');
          it.node.removeAttribute('data-pt-od');
        }
      });
      // 순서
      const order = p.order[col.id];
      if (!Array.isArray(order) || !order.length) return;
      const parent = document.getElementById(col.id);
      const byKey = {}; col.items.forEach((it) => { byKey[it.key] = it.node; });
      const tail = col.items[col.items.length - 1].node.nextSibling;
      order.concat(col.items.map((i) => i.key).filter((k) => order.indexOf(k) < 0)).forEach((k) => {
        if (byKey[k]) parent.insertBefore(byKey[k], tail);
      });
    });
  }

  function resetWidgets() {
    sv(K.wl, { hidden: [], order: {} });
    COLS.forEach(([id]) => {
      const col = document.getElementById(id); if (!col) return;
      const nodes = Array.from(col.children).filter((n) => n.nodeType === 1 && n.hasAttribute && n.hasAttribute('data-pt-oidx'));
      if (!nodes.length) return;
      const tail = nodes[nodes.length - 1].nextSibling;
      nodes.sort((a, b) => (+a.getAttribute('data-pt-oidx') || 0) - (+b.getAttribute('data-pt-oidx') || 0)).forEach((n) => {
        if (n.hasAttribute('data-pt-od')) { n.style.display = n.getAttribute('data-pt-od'); n.removeAttribute('data-pt-od'); }
        else n.style.display = '';
        col.insertBefore(n, tail);
      });
    });
  }

  function openWidgetManager() {
    const old = document.getElementById('pt-wm'); if (old) old.remove();
    const cols = scanAll();
    const p = prefs();

    const wrap = document.createElement('div');
    wrap.id = 'pt-wm'; wrap.setAttribute('data-pt', '1');
    const bodyHtml = cols.length ? cols.map((col) => {
      const order = (p.order[col.id] || []).slice();
      const keys = order.concat(col.items.map((i) => i.key).filter((k) => order.indexOf(k) < 0))
        .filter((k) => col.items.some((i) => i.key === k));
      const rows = keys.map((k, i) => {
        const it = col.items.find((x) => x.key === k);
        const off = p.hidden.indexOf(k) >= 0;
        return '<div class="row" data-col="' + col.id + '" data-key="' + esc(k) + '">' +
          '<input type="checkbox"' + (off ? '' : ' checked') + '>' +
          '<span class="nm' + (off ? ' off' : '') + '">' + esc(it.label) + '</span>' +
          '<button type="button" class="mv" data-mv="up"' + (i === 0 ? ' disabled' : '') + ' title="위로">↑</button>' +
          '<button type="button" class="mv" data-mv="dn"' + (i === keys.length - 1 ? ' disabled' : '') + ' title="아래로">↓</button>' +
          '</div>';
      }).join('');
      return '<div class="grp"><div class="gh">' + esc(col.nm) + ' 컬럼</div>' + rows + '</div>';
    }).join('') : '<div class="empty">위젯을 찾지 못했습니다. 포털 메인이 모두 로드된 뒤 다시 열어 주세요.</div>';

    wrap.innerHTML =
      '<div class="box">' +
      '<div class="top"><span>위젯 정리</span><button type="button" class="x" title="닫기">✕</button></div>' +
      '<div class="desc">체크를 풀면 그 위젯을 감춥니다. ↑↓로 컬럼 안의 순서를 바꿉니다. 원본 위치는 보존되므로 언제든 초기화할 수 있습니다.</div>' +
      '<div class="body">' + bodyHtml + '</div>' +
      '<div class="foot"><button type="button" class="rst">배치 초기화</button><button type="button" class="done">닫기</button></div>' +
      '</div>';
    document.body.appendChild(wrap);

    const persistOrder = (colId) => {
      const keys = Array.from(wrap.querySelectorAll('.row[data-col="' + colId + '"]')).map((r) => r.getAttribute('data-key'));
      const pp = prefs(); pp.order[colId] = keys; savePrefs(pp); applyWidgetPrefs();
      // 위/아래 버튼 활성 상태 갱신
      const rows = Array.from(wrap.querySelectorAll('.row[data-col="' + colId + '"]'));
      rows.forEach((r, i) => {
        const up = r.querySelector('[data-mv="up"]'); const dn = r.querySelector('[data-mv="dn"]');
        if (up) up.disabled = (i === 0);
        if (dn) dn.disabled = (i === rows.length - 1);
      });
    };

    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || (e.target.closest && (e.target.closest('.x') || e.target.closest('.done')))) { wrap.remove(); return; }
      if (e.target.closest && e.target.closest('.rst')) { resetWidgets(); wrap.remove(); openWidgetManager(); return; }
      const mv = e.target.closest ? e.target.closest('[data-mv]') : null;
      if (!mv || mv.disabled) return;
      const row = mv.closest('.row'); const colId = row.getAttribute('data-col');
      if (mv.getAttribute('data-mv') === 'up') { const prev = row.previousElementSibling; if (prev && prev.classList.contains('row')) row.parentNode.insertBefore(row, prev); }
      else { const next = row.nextElementSibling; if (next && next.classList.contains('row')) row.parentNode.insertBefore(next, row); }
      persistOrder(colId);
    });
    wrap.addEventListener('change', (e) => {
      const cb = e.target.closest ? e.target.closest('input[type="checkbox"]') : null;
      if (!cb) return;
      const row = cb.closest('.row'); const key = row.getAttribute('data-key');
      const pp = prefs(); const i = pp.hidden.indexOf(key);
      if (cb.checked && i >= 0) pp.hidden.splice(i, 1);
      else if (!cb.checked && i < 0) pp.hidden.push(key);
      savePrefs(pp); applyWidgetPrefs();
      const nm = row.querySelector('.nm'); if (nm) nm.classList.toggle('off', !cb.checked);
    });
  }

  /* ══ 7. 전환 UI ════════════════════════════════════════════ */
  function mountFab() {
    if (document.getElementById('pt-fab') || !document.body) return;
    const b = document.createElement('button');
    b.id = 'pt-fab'; b.type = 'button'; b.setAttribute('data-pt', '1');
    b.title = '테마 Alt+Shift+T · 확장 모드 Alt+Shift+F · 위젯 정리 Alt+Shift+W · 설정 초기화 Alt+Shift+R';
    const dot = document.createElement('span'); dot.className = 'dot';
    const lb = document.createElement('span'); lb.className = 'lb'; lb.textContent = '테마';
    b.appendChild(dot); b.appendChild(lb);
    document.body.appendChild(b);
    b.addEventListener('click', (e) => { e.stopPropagation(); togglePop(true); });
  }

  function closePop() { const p = document.getElementById('pt-pop'); if (p) p.remove(); }

  function togglePop(force) {
    const open = !!document.getElementById('pt-pop');
    closePop();
    if (open && !force) return;

    const on = gv(K.on, DEF.on);
    const full = gv(K.full, DEF.full);
    const h = parseInt(gv(K.conh, DEF.conh), 10);
    const p = document.createElement('div');
    p.id = 'pt-pop'; p.setAttribute('data-pt', '1');
    p.innerHTML =
      '<label><input type="checkbox" id="pt-c-on"' + (on ? ' checked' : '') + '>테마 사용</label>' +
      '<label><input type="checkbox" id="pt-c-full"' + (full ? ' checked' : '') + (on ? '' : ' disabled') + '>확장 모드</label>' +
      '<div class="hrow"><span>목록 높이</span>' +
      HEIGHTS.map((x) => '<button type="button" class="hbtn' + (x[0] === h ? ' on' : '') + '" data-h="' + x[0] + '"' + (on && full ? '' : ' disabled') + '>' + x[1] + '</button>').join('') +
      '</div>' +
      '<label><input type="checkbox" id="pt-c-bkmk"' + (gv(K.bkmk, DEF.bkmk) ? ' checked' : '') + (on ? '' : ' disabled') + '>즐겨찾는 업무메뉴 숨기기</label>' +
      '<label><input type="checkbox" id="pt-c-quick"' + (gv(K.quick, DEF.quick) ? ' checked' : '') + '>검색창 옆 업무 바로가기</label>' +
      '<button type="button" class="wbtn" id="pt-wmgr">위젯 정리 (표시·순서)<span class="k">Alt+Shift+W</span></button>' +
      '<button type="button" class="wbtn" id="pt-qmgr">바로가기 관리 (등록·추가)</button>' +
      '<button type="button" class="rst" id="pt-reset">설정 초기화 (모두 켜기)</button>' +
      '<div class="hint">' + (on
        ? '확장 모드는 위젯 높이를 넉넉하게 통일합니다. 좌우 카드 높이가 맞아야 배치가 유지됩니다.'
        : '테마가 꺼져 있습니다. 위 항목을 다시 체크하거나 Alt+Shift+T를 누르세요.') +
      '</div>';
    document.body.appendChild(p);

    p.addEventListener('click', (e) => {
      e.stopPropagation();
      const hb = e.target.closest ? e.target.closest('.hbtn') : null;
      if (hb && !hb.disabled) { sv(K.conh, parseInt(hb.getAttribute('data-h'), 10)); applyState(); togglePop(true); return; }
      if (e.target && e.target.id === 'pt-wmgr') { closePop(); openWidgetManager(); return; }
      if (e.target && e.target.id === 'pt-qmgr') { closePop(); openQuickManager(); return; }   // v1.5.2
      if (e.target && e.target.id === 'pt-reset') {
        sv(K.on, true); sv(K.full, true); sv(K.bkmk, true); sv(K.conh, DEF.conh); sv(K.quick, true);
        resetWidgets(); applyState(); togglePop(true);
      }
    });
    p.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'pt-c-on') sv(K.on, !!t.checked);
      if (t.id === 'pt-c-full') sv(K.full, !!t.checked);
      if (t.id === 'pt-c-bkmk') sv(K.bkmk, !!t.checked);
      if (t.id === 'pt-c-quick') sv(K.quick, !!t.checked);
      applyState(); togglePop(true);
    });
  }

  document.addEventListener('click', closePop);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePop(); const w = document.getElementById('pt-wm'); if (w) w.remove(); const q = document.getElementById('pt-qm'); if (q) q.remove(); return; }
    if (!e.altKey || !e.shiftKey) return;
    const code = e.code || '';
    const key = String(e.key || '').toLowerCase();
    const is = (c, k) => (code === c || key === k);
    if (is('KeyT', 't')) { e.preventDefault(); sv(K.on, !gv(K.on, DEF.on)); applyState(); togglePop(true); }
    else if (is('KeyF', 'f')) { e.preventDefault(); sv(K.full, !gv(K.full, DEF.full)); applyState(); togglePop(true); }
    else if (is('KeyW', 'w')) { e.preventDefault(); openWidgetManager(); }
    else if (is('KeyR', 'r')) {
      e.preventDefault();
      sv(K.on, true); sv(K.full, true); sv(K.bkmk, true); sv(K.conh, DEF.conh); sv(K.quick, true);
      resetWidgets(); applyState(); togglePop(true);
    }
  });

  /* ══ 8. 확장 메뉴 복구 경로 ════════════════════════════════ */
  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('테마 켜기/끄기 (Alt+Shift+T)', () => { sv(K.on, !gv(K.on, DEF.on)); applyState(); });
      GM_registerMenuCommand('확장 모드 켜기/끄기 (Alt+Shift+F)', () => { sv(K.full, !gv(K.full, DEF.full)); applyState(); });
      GM_registerMenuCommand('업무 바로가기 켜기/끄기', () => { sv(K.quick, !gv(K.quick, DEF.quick)); applyState(); });
      GM_registerMenuCommand('위젯 정리 (Alt+Shift+W)', () => { openWidgetManager(); });
      GM_registerMenuCommand('바로가기 관리 (등록·추가)', () => { openQuickManager(); });   // v1.5.2
      GM_registerMenuCommand('설정 초기화 (모두 켜기)', () => {
        sv(K.on, true); sv(K.full, true); sv(K.bkmk, true); sv(K.conh, DEF.conh); sv(K.quick, true);
        resetWidgets(); applyState();
      });
    }
  } catch (e) { /* noop */ }

  /* ══ 9. 부트 ═══════════════════════════════════════════════ */
  function boot() {
    reseat(); mountFab(); syncQuick();
    try { applyWidgetPrefs(); } catch (e) { /* noop */ }
    applyState(); watchDash();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 1500);
  setTimeout(boot, 4000);
  setInterval(heal, 4000);
})();