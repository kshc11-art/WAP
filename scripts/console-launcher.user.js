// ==UserScript==
// @name         KRISS 요구자료 콘솔 — 포털 바로가기
// @namespace    kriss.internal.console
// @version      0.2.0
// @description  포털 화면에 아이콘 버튼 하나만 둔다. 클릭 시 요구자료 콘솔 페이지를 열고 포커스한다. 조회·계산은 이 스크립트에서 일어나지 않는다.
// @author       -
// @match        https://krisstar.kriss.re.kr/*
// @noframes
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/* ---------------------------------------------------------------------------
 * 버전 정책 (통계추출 스크립트와 동일)
 *   patch 0.y.Z = 오류 수정·자잘한 개선 / minor 0.Y.0 = 기능 추가·개편
 *   major X.0.0 = 타 스크립트와의 결합 또는 '1부' 완성 시점
 *
 * 변경이력
 *   0.2.0 (minor) 단일 페이지 재편. 구 셸(v1.0~v1.4)의 포털 오버레이 팔레트를
 *                 폐지하고, 포털에는 아이콘 버튼 하나만 남긴다. 조건 설정·실행·
 *                 결과·내보내기는 전부 콘솔 페이지에서 처리한다.
 *                 ※ 구 표기 v1.0~v1.4는 0.1.0~0.1.4로 소급 재부여함(계보 동일).
 *
 * 목적
 *   포털 화면에서 실행되는 코드를 최소화한다. 이 파일은 버튼 1개와 클릭 처리만
 *   담당하며 API 호출·무거운 계산·DOM 감시를 하지 않는다.
 *
 * 전제 조건
 *   1) 콘솔 스크립트(kriss_console_v0_2_0)가 설치되어 있을 것
 *   2) 콘솔 URL이 HTML 본문을 반환할 것. 404여도 무관
 *   3) 크로스탭 통신은 localStorage storage 이벤트 사용(GM 권한 불필요)
 *
 * 오류 가능 지점
 *   1) 콘솔 URL 미주입 → HELLO 미수신 → 폴백 URL 전환을 사용자에게 제안
 *   2) 팝업 차단 → window.open이 null. 클릭 이벤트 안에서만 호출하며 안내 표시
 *   3) 기존 스크립트 버튼(#tgl, #kpe-btn)과의 겹침 → bottom:72px로 회피
 *   4) storage 이벤트 미발생 브라우저 → 3초 폴링 폴백
 *
 * 검증 방법
 *   - 포털 콘솔: KrissConsoleLink.version, .url() 확인
 *   - 버튼 클릭 후 5초 내 상태 점(dot)이 사라지고 콘솔 탭이 뜨는지 확인
 *   - 원상복구: KrissConsoleLink.remove() 후
 *     document.querySelectorAll('[data-kriss-console]').length === 0
 *
 * 외부 연동 (대시보드 스크립트 등에서 사용)
 *   KrissConsoleLink.open()            콘솔 열기·포커스
 *   KrissConsoleLink.url()             현재 콘솔 URL
 *   KrissConsoleLink.setUrl('primary'|'fallback')
 *   KrissConsoleLink.hideButton(true)  부유 버튼 숨기기(자체 버튼에 연결할 때)
 * ------------------------------------------------------------------------- */

(function () {
  'use strict';

  var VERSION = '0.2.0';
  var NS = 'kriss_lnch_v1';
  var K_STATE = NS + ':state';
  var K_BUS = NS + ':bus';
  var ORIGIN = 'https://krisstar.kriss.re.kr';

  var CONSOLE_URL = {
    primary: ORIGIN + '/popup/S_COM_00000000P.do',
    fallback: ORIGIN + '/index.do?krissConsole=1'
  };
  var WIN_NAME = 'kriss_console';

  // 콘솔 페이지 자신에서는 아무것도 하지 않는다.
  if (/\/popup\/S_COM_00000000P\.do/.test(location.pathname) ||
      /[?&]krissConsole=1(&|$)/.test(location.search)) return;
  if (window.__krissPortalBtn) return;
  window.__krissPortalBtn = 1;

  /* ---- 상태 (콘솔 스크립트와 같은 키를 공유) ---- */
  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(K_STATE) || 'null');
      if (s && typeof s === 'object') return s;
    } catch (e) { /* 손상 시 기본값 */ }
    return {};
  }
  function settings() {
    var s = loadState();
    return (s && s.settings) || {};
  }
  function saveSetting(k, v) {
    var s = loadState();
    s.settings = s.settings || {};
    s.settings[k] = v;
    try { localStorage.setItem(K_STATE, JSON.stringify(s)); } catch (e) {}
  }
  function consoleUrl() {
    return settings().consoleUrl === 'fallback' ? CONSOLE_URL.fallback : CONSOLE_URL.primary;
  }

  /* ---- 버스 (수신 전용) ---- */
  var seen = 0;
  var onMsg = [];
  function dispatch(raw) {
    if (!raw) return;
    var m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || m.from === 'portal' || m.seq <= seen) return;
    seen = m.seq;
    onMsg.forEach(function (h) { try { h(m); } catch (e) {} });
  }
  window.addEventListener('storage', function (ev) {
    if (ev.key === K_BUS) dispatch(ev.newValue);
  });
  setInterval(function () {
    try { dispatch(localStorage.getItem(K_BUS)); } catch (e) {}
  }, 3000);

  /* ---- UI ---- */
  var CSS = [
    ':host{all:initial}',
    '#b{position:fixed;right:16px;bottom:72px;width:34px;height:34px;border:0;padding:0;',
      'border-radius:10px;cursor:pointer;display:grid;place-items:center;z-index:2147483000;',
      'background:oklch(99% 0.002 265/.78);color:oklch(20% 0.008 265);',
      'box-shadow:0 0 0 .5px oklch(20% 0.01 265/.12),0 4px 14px oklch(20% 0.01 265/.14);',
      'transition:transform .2s cubic-bezier(.16,1,.3,1)}',
    '@supports (backdrop-filter:blur(1px)){#b{backdrop-filter:blur(18px) saturate(170%)}}',
    '@supports not (backdrop-filter:blur(1px)){#b{background:oklch(99.5% 0.001 265)}}',
    '#b:hover{transform:translateY(-1px)}',
    '#b:focus-visible{outline:2px solid oklch(55% 0.185 256);outline-offset:3px}',
    '#b i{position:absolute;top:5px;right:5px;width:6px;height:6px;border-radius:50%;',
      'background:oklch(55% 0.185 256);display:none}',
    '#b[data-busy="1"] i{display:block}',
    '@keyframes pl{50%{opacity:.35}}',
    '#b[data-busy="1"] i{animation:pl 1.1s ease-in-out infinite}',
    '#t{position:fixed;right:16px;bottom:112px;max-width:260px;z-index:2147483001;',
      'padding:10px 12px;border-radius:12px;font:13px/1.5 -apple-system,BlinkMacSystemFont,',
      '"Segoe UI Variable Text","Segoe UI","Malgun Gothic",sans-serif;',
      'background:oklch(99.5% 0.001 265);color:oklch(20% 0.008 265);',
      'box-shadow:0 0 0 .5px oklch(20% 0.01 265/.12),0 10px 30px oklch(20% 0.01 265/.20);display:none}',
    '#t.on{display:block}',
    '#t p{margin:0 0 8px;font-size:12px}',
    '#t .r{display:flex;gap:6px;justify-content:flex-end}',
    '#t button{border:0;font:500 12px inherit;padding:5px 11px;border-radius:8px;cursor:pointer;',
      'background:oklch(95% 0.004 265);color:oklch(20% 0.008 265)}',
    '#t button.p{background:oklch(55% 0.185 256);color:oklch(99% 0 0);font-weight:600}',
    '@media (prefers-color-scheme:dark){',
      '#b{background:rgba(30,29,27,.82);color:#eae7df;',
        'box-shadow:0 0 0 .5px #35322b,0 4px 14px rgba(0,0,0,.5)}',
      '@supports not (backdrop-filter:blur(1px)){#b{background:#1e1d1b}}',
      '#b i{background:#f2b23e}',
      '#b:focus-visible{outline-color:#f2b23e}',
      '#t{background:#1e1d1b;color:#eae7df;box-shadow:0 0 0 .5px #35322b,0 10px 26px rgba(0,0,0,.55)}',
      '#t button{background:#262421;color:#eae7df}',
      '#t button.p{background:#f2b23e;color:#241b07}}',
    '@media (prefers-reduced-motion:reduce){#b,#b i{transition:none;animation:none}}'
  ].join('');

  var host = document.createElement('div');
  host.setAttribute('data-kriss-console', 'link');
  host.style.cssText = 'all:initial';
  (document.body || document.documentElement).appendChild(host);
  var root = host.attachShadow({ mode: 'open' });
  var st = document.createElement('style');
  st.textContent = CSS;
  root.appendChild(st);

  var btn = document.createElement('button');
  btn.id = 'b';
  btn.type = 'button';
  btn.title = '요구자료 콘솔 열기 (Ctrl+K)';
  btn.setAttribute('aria-label', '요구자료 콘솔 열기');
  btn.innerHTML =
    '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">' +
    '<rect x="1" y="8" width="2.8" height="6" rx="1" fill="currentColor" opacity=".38"/>' +
    '<rect x="6.1" y="4.5" width="2.8" height="9.5" rx="1" fill="currentColor" opacity=".66"/>' +
    '<rect x="11.2" y="1" width="2.8" height="13" rx="1" fill="currentColor"/></svg>' +
    '<i></i>';
  root.appendChild(btn);

  var tip = document.createElement('div');
  tip.id = 't';
  root.appendChild(tip);

  function showTip(html, actions) {
    tip.innerHTML = '<p>' + html + '</p><div class="r"></div>';
    var r = tip.querySelector('.r');
    (actions || []).forEach(function (a) {
      var b = document.createElement('button');
      if (a.primary) b.className = 'p';
      b.type = 'button';
      b.textContent = a.label;
      b.addEventListener('click', function () { hideTip(); a.run(); });
      r.appendChild(b);
    });
    tip.classList.add('on');
  }
  function hideTip() { tip.classList.remove('on'); tip.innerHTML = ''; }

  /* ---- 열기 + 주입 확인 ---- */
  var probe = null;
  function busy(on) { btn.setAttribute('data-busy', on ? '1' : '0'); }

  function open() {
    hideTip();
    var url = consoleUrl();
    var w = null;
    try { w = window.open(url, WIN_NAME); } catch (e) { w = null; }
    if (!w) {
      showTip('팝업이 차단되어 콘솔을 열 수 없습니다. 브라우저의 팝업 차단을 해제하십시오.',
        [{ label: '닫기', run: hideTip }]);
      return;
    }
    try { w.focus(); } catch (e) {}
    busy(true);
    if (probe) clearTimeout(probe);
    probe = setTimeout(function () {
      busy(false);
      var alt = settings().consoleUrl === 'fallback' ? 'primary' : 'fallback';
      showTip('콘솔 페이지에서 응답이 없습니다. 해당 주소에 스크립트가 주입되지 않은 것으로 보입니다.' +
        '<br><br>현재 주소: <b>' + (settings().consoleUrl === 'fallback' ? '폴백' : '팝업 경로') + '</b>',
        [{ label: '닫기', run: hideTip },
         { label: alt === 'fallback' ? '폴백으로 전환' : '팝업 경로로 전환', primary: true,
           run: function () { saveSetting('consoleUrl', alt); open(); } }]);
    }, 5000);
  }

  onMsg.push(function (m) {
    if (m.type === 'HELLO' || m.type === 'STATUS') {
      if (probe) { clearTimeout(probe); probe = null; }
      hideTip();
    }
    if (m.type === 'STATUS') busy(!!(m.payload && m.payload.running));
    if (m.type === 'HELLO') busy(false);
  });

  btn.addEventListener('click', open);
  window.addEventListener('keydown', function (ev) {
    if (settings().portalHotkey === false) return;
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey &&
        (ev.key === 'k' || ev.key === 'K')) {
      ev.preventDefault();
      open();
    }
  }, true);

  if (settings().hidePortalButton === true) btn.style.display = 'none';

  /* ---- 공개 API ---- */
  window.KrissConsoleLink = {
    version: VERSION,
    open: open,
    url: consoleUrl,
    setUrl: function (which) {
      saveSetting('consoleUrl', which === 'fallback' ? 'fallback' : 'primary');
      return consoleUrl();
    },
    hideButton: function (on) {
      saveSetting('hidePortalButton', on !== false);
      btn.style.display = (on !== false) ? 'none' : '';
    },
    setHotkey: function (on) { saveSetting('portalHotkey', on !== false); },
    remove: function () {
      document.querySelectorAll('[data-kriss-console]').forEach(function (n) { n.remove(); });
    }
  };

  console.log('[요구자료] 포털 바로가기 v' + VERSION + ' 준비 완료 · 콘솔 ' + consoleUrl());
})();