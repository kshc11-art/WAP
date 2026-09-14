// ==UserScript==
// @name         KRISS 팝업·창 관리자
// @namespace    https://krisstar.kriss.re.kr/
// @version      1.1.0
// @description  팝업 통합 관리 — 지정 팝업 차단(window.open + form.submit + iframe), "오늘 하루 보지 않기" 자동 체크, 새 탭/새 창 통일, 열린 창 관리, 긴급 원상복구
// @match        *://*.kriss.re.kr/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 변경 이력
   1.1.0  form.submit 후킹 추가(아키텍처 문서 §3: 팝업 트리거는 window.open 또는 form.submit target=새창)
          내장 차단 목록(포털 공지 팝업 P13·P16) 추가 / 차단 기록 로그 / 긴급 원상복구(panic) /
          iframe 삽입형 팝업 차단 / 관리 패널은 최상위 창에서만 표시
   1.0.0  최초 작성

 목적
   - 업무와 무관한 포털 공지 팝업을 표시 단계에서 제거한다.
   - 그 외 팝업의 "오늘 하루 이 창을 열지 않음" 류 체크박스를 자동으로 체크한다.
   - window.open / form.submit 으로 열리는 화면을 새 탭 또는 새 창으로 일관되게 열고, 한 곳에서 닫는다.

 전제 조건
   - Tampermonkey, @grant none, @run-at document-start (페이지 스크립트보다 먼저 후킹).
   - 규칙·설정은 localStorage 에 저장되며 오리진(krisstar.kriss.re.kr)별로 분리된다.
   - 기존 "KRISS 비교 Helper"의 Part 1(window.open 패치)과 공존 가능하나, 로그 혼선을 막으려면 Part 1 제거를 권장한다.
   - 삽입 요소는 모두 data-kriss-pwm-ui 속성을 가지며, 숨긴 요소는 data-kriss-pwm-hidden 을 가진다
     → 콘솔에서 KrissPWM.panic() 한 번으로 화면을 원상복구한다(문서 §1 요구사항).

 오류 가능 지점
   - 포털이 $.postWindow 로 팝업을 열 때 window.open 의 url 인자가 빈 문자열이므로 URL 규칙이 매칭되지 않는다
     → form.submit 후킹에서 form.action 으로 판정한다(이번 버전에서 보강).
   - 체크박스 상태를 "닫기" 시점에 저장하는 팝업은 체크만으로 저장되지 않는다 → autoCloseAfterCheck 사용.
   - 레이어 차단은 텍스트·셀렉터 기반이므로 오차단 가능 → dryRun 으로 먼저 확인.
   - 차단만 하면 서버·페이지가 매 로그인마다 팝업 열기를 계속 시도한다(무해하지만 로그가 쌓임)
     → blockMode 를 'once' 로 두면 하루 1회만 열어 체크·닫기까지 수행한 뒤 이후 차단한다.

 검증 방법
   - 패널 > 진단 실행: 감지된 체크박스 수·결과·근거 텍스트 표시.
   - 패널 > 차단 기록: 오늘 무엇이 어떤 규칙·어떤 경로(open/form/iframe/document)로 차단되었는지 확인.
   - 콘솔: KrissPWM.run(), KrissPWM.log(), KrissPWM.panic().
*/

(function () {
  'use strict';

  var TAG = '[KRISS-PWM]';
  var VER = '1.1.0';
  var CFG_KEY = 'kriss_pwm_cfg';
  var LOG_KEY = 'kriss_pwm_log';
  var DISMISS_KEY = 'kriss_pwm_dismissed';
  var UI_ATTR = 'data-kriss-pwm-ui';

  // 내장 차단 목록 — 설정 초기화와 무관하게 유지된다.
  // 출처: 사용자 지정(포털 공지 팝업). 아키텍처 문서 §7 은 S_PMS_*/B_RES* 만 다루므로 S_COM_* 계약은 미기재 항목이다.
  var BUILTIN_BLOCK = [
    { pattern: 'S_COM_00000000P16.do', note: '포털 공지 팝업 P16' },
    { pattern: 'S_COM_00000000P13.do', note: '포털 공지 팝업 P13' }
  ];

  var DEFAULT_CFG = {
    enabled: true,
    dryRun: false,
    useBuiltinBlock: true,
    blockMode: 'always',         // 'always' 즉시 차단 | 'once' 하루 1회만 열어 체크·닫기 후 차단
    openMode: 'tab',             // 'tab' | 'window' | 'native'
    windowFeatures: 'width=1280,height=900,resizable=yes,scrollbars=yes',
    autoCheckDontShow: true,
    autoCloseAfterCheck: false,
    removeBackdrop: true,
    trackWindows: true,
    showPanel: false,
    keepNative: [],
    blockUrl: [],
    blockLayer: []
  };

  var cfg = loadCfg();

  function loadCfg() {
    var c = {};
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (raw) c = JSON.parse(raw) || {};
    } catch (e) {
      console.warn(TAG, '설정 읽기 실패 — 기본값 사용:', e.message);
    }
    var out = {};
    Object.keys(DEFAULT_CFG).forEach(function (k) {
      out[k] = (c[k] === undefined) ? DEFAULT_CFG[k] : c[k];
    });
    ['keepNative', 'blockUrl', 'blockLayer'].forEach(function (k) {
      if (!Array.isArray(out[k])) out[k] = [];
    });
    return out;
  }

  function saveCfg() {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
      return true;
    } catch (e) {
      console.error(TAG, '설정 저장 실패:', e.message);
      return false;
    }
  }

  // ============================================================
  // 규칙 매칭
  // ============================================================
  // 규칙 문자열: '/정규식/플래그' 형태면 정규식, 그 외에는 대소문자 무시 부분일치
  function ruleMatch(rule, target) {
    if (!rule || !target) return false;
    var s = String(rule).trim();
    if (s.length < 2) return false;
    if (s.charAt(0) === '/' && s.lastIndexOf('/') > 0) {
      var last = s.lastIndexOf('/');
      try {
        return new RegExp(s.substring(1, last), s.substring(last + 1) || 'i').test(target);
      } catch (e) { return false; }
    }
    return String(target).toLowerCase().indexOf(s.toLowerCase()) >= 0;
  }

  function matchAny(rules, target) {
    for (var i = 0; i < rules.length; i++) {
      if (ruleMatch(rules[i], target)) return rules[i];
    }
    return null;
  }

  function activeBlockRules() {
    var list = [];
    if (cfg.useBuiltinBlock) BUILTIN_BLOCK.forEach(function (b) { list.push(b.pattern); });
    return list.concat(cfg.blockUrl);
  }

  function isBlocked(url) {
    if (!cfg.enabled) return null;
    return matchAny(activeBlockRules(), url);
  }

  // ============================================================
  // 차단 기록 · 하루 1회 처리 상태
  // ============================================================
  function today() {
    var d = new Date();
    return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  }

  function readStore(key) {
    try {
      var o = JSON.parse(localStorage.getItem(key) || '{}');
      if (o.date !== today()) return { date: today(), items: [] };
      if (!Array.isArray(o.items)) o.items = [];
      return o;
    } catch (e) { return { date: today(), items: [] }; }
  }

  function writeStore(key, o) {
    try { localStorage.setItem(key, JSON.stringify(o)); } catch (e) {}
  }

  function logBlocked(url, rule, via) {
    var s = readStore(LOG_KEY);
    s.items.unshift({ url: String(url).substring(0, 200), rule: rule, via: via, at: new Date().toTimeString().substring(0, 8) });
    if (s.items.length > 50) s.items.length = 50;
    writeStore(LOG_KEY, s);
    refreshPanel();
  }

  function dismissedToday(rule) {
    return readStore(DISMISS_KEY).items.indexOf(rule) >= 0;
  }

  function markDismissed(rule) {
    var s = readStore(DISMISS_KEY);
    if (s.items.indexOf(rule) < 0) s.items.push(rule);
    writeStore(DISMISS_KEY, s);
    console.log(TAG, '오늘 처리 완료로 기록:', rule);
  }

  // blockMode='once' 이면 하루 첫 1회는 통과시켜 자식 문서에서 체크·닫기를 수행한다
  function shouldPassOnce(rule) {
    return cfg.blockMode === 'once' && !dismissedToday(rule);
  }

  // ============================================================
  // window.open 후킹
  // ============================================================
  var openedWindows = [];

  (function hookWindowOpen() {
    if (window.__krissPwmHooked) return;
    window.__krissPwmHooked = true;
    var nativeOpen = window.open;

    window.open = function (url, name, features) {
      var target = String(url || '');
      var hit = target ? isBlocked(target) : null;

      if (hit) {
        if (shouldPassOnce(hit)) {
          console.log(TAG, '차단 대상이지만 하루 1회 처리 모드로 통과:', target, '| 규칙:', hit);
        } else {
          console.log(TAG, '팝업 차단(window.open):', target, '| 규칙:', hit, cfg.dryRun ? '| dryRun — 실제로는 열림' : '');
          logBlocked(target, hit, 'window.open');
          if (!cfg.dryRun) return null;
        }
      }

      var keep = matchAny(cfg.keepNative, target);
      var mode = (!cfg.enabled || keep) ? 'native' : cfg.openMode;

      var win = null;
      try {
        if (mode === 'tab') win = nativeOpen.call(window, url, name || '_blank');
        else if (mode === 'window') win = nativeOpen.call(window, url, name || '_blank', features || cfg.windowFeatures);
        else win = nativeOpen.call(window, url, name, features);
      } catch (e) {
        console.warn(TAG, 'open 실패 — 원래 방식 재시도:', e.message);
        try { win = nativeOpen.call(window, url); } catch (e2) {}
      }

      if (win && cfg.trackWindows) {
        openedWindows.push({ win: win, url: target || '(form 제출 대기)', name: name || '', at: new Date() });
        if (openedWindows.length > 40) openedWindows.shift();
        refreshPanel();
      }
      return win;
    };
  })();

  // ============================================================
  // form.submit 후킹 — $.postWindow 계열(target=새 창) 차단
  //   문서 §3: 상세 팝업은 숨은 form 에 파라미터를 채워 form.submit(target=새 창) 하는 경우가 있다.
  //   이때 window.open 은 url='' 로 호출되므로 URL 규칙이 매칭되지 않는다.
  // ============================================================
  (function hookFormSubmit() {
    if (window.__krissPwmFormHooked) return;
    window.__krissPwmFormHooked = true;
    if (!window.HTMLFormElement || !HTMLFormElement.prototype) return;
    var nativeSubmit = HTMLFormElement.prototype.submit;

    HTMLFormElement.prototype.submit = function () {
      try {
        var action = this.getAttribute('action') || this.action || '';
        var tgt = this.getAttribute('target') || '';
        var toNewWindow = !!tgt && ['_self', '_parent', '_top'].indexOf(tgt) < 0;
        var hit = action ? isBlocked(action) : null;
        if (hit && toNewWindow && !shouldPassOnce(hit)) {
          console.log(TAG, '팝업 차단(form.submit):', action, '| target:', tgt, '| 규칙:', hit, cfg.dryRun ? '| dryRun' : '');
          logBlocked(action, hit, 'form.submit');
          if (!cfg.dryRun) return;   // 제출 취소
        }
      } catch (e) {
        console.warn(TAG, 'form.submit 검사 오류(원래 동작 유지):', e.message);
      }
      return nativeSubmit.apply(this, arguments);
    };
  })();

  // ============================================================
  // 팝업 문서 자체가 차단 대상일 때
  // ============================================================
  var selfBlockRule = isBlocked(location.href);

  function handleSelfBlocked() {
    if (!selfBlockRule) return false;

    // 하루 1회 처리 모드: 체크박스를 체크하고 닫기까지 수행한 뒤 기록
    if (shouldPassOnce(selfBlockRule)) {
      console.log(TAG, '하루 1회 처리 모드 — 체크 후 닫기 진행:', location.href);
      var run = function () {
        var n = runAutoCheck(null);
        setTimeout(function () {
          markDismissed(selfBlockRule);
          if (!clickCloseIn(document.body)) { try { window.close(); } catch (e) {} }
        }, n > 0 ? 400 : 200);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
      else setTimeout(run, 300);
      return false;   // 이후 자동 체크 로직도 정상 동작하도록 계속 진행
    }

    console.log(TAG, '현재 문서가 차단 대상:', location.href, '| 규칙:', selfBlockRule, cfg.dryRun ? '| dryRun' : '');
    logBlocked(location.href, selfBlockRule, 'document');
    if (cfg.dryRun) return false;

    if (window.opener) {
      try { window.close(); } catch (e) {}
      setTimeout(function () { try { window.close(); } catch (e) {} }, 300);
    }
    var apply = function () {
      try {
        document.documentElement.innerHTML =
          '<body style="font:13px Malgun Gothic,sans-serif;padding:20px;color:#37474F">' +
          '차단된 팝업입니다.<br>규칙: ' + escHtml(selfBlockRule) +
          '<br><br>해제는 포털 화면 우측 하단 <b>팝업 관리</b> 패널에서 합니다.</body>';
      } catch (e) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
    else apply();
    return true;
  }

  // ============================================================
  // "오늘 하루 보지 않기" 자동 체크
  // ============================================================
  var DONT_SHOW_RE = new RegExp([
    '오늘\\s*하루', '하루\\s*동안', '하루\\s*종일', '오늘\\s*중', '오늘\\s*은', '일주일\\s*동안',
    '다시\\s*보지', '다시\\s*열지', '더\\s*이상\\s*보지', '보지\\s*않', '열지\\s*않', '띄우지\\s*않',
    '안\\s*보기', '안\\s*열기', '그만\\s*보기', '창을?\\s*닫',
    'do\\s*not\\s*show', "don'?t\\s*show", 'hide\\s*(for\\s*)?today'
  ].join('|'), 'i');

  var CLOSE_TEXT_RE = /^\s*(닫기|창\s*닫기|확인|확인하기|close|ok)\s*$/i;

  function cssEsc(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/([^\w-])/g, '\\$1');
  }

  function nearbyText(box) {
    var parts = [];
    if (box.id) {
      var l = document.querySelector('label[for="' + cssEsc(box.id) + '"]');
      if (l) parts.push(l.textContent);
    }
    var wrapLabel = box.closest ? box.closest('label') : null;
    if (wrapLabel) parts.push(wrapLabel.textContent);

    var sib = box.nextElementSibling, i = 0;
    while (sib && i < 2) { parts.push(sib.textContent || ''); sib = sib.nextElementSibling; i++; }
    sib = box.previousElementSibling; i = 0;
    while (sib && i < 2) { parts.push(sib.textContent || ''); sib = sib.previousElementSibling; i++; }

    var p = box.parentElement; i = 0;
    while (p && i < 3) {
      var t = p.textContent || '';
      if (t.length <= 200) parts.push(t);
      p = p.parentElement; i++;
    }
    ['value', 'title', 'aria-label', 'name', 'id'].forEach(function (a) {
      var v = box.getAttribute(a);
      if (v) parts.push(v);
    });
    return parts.join(' ').replace(/\s+/g, ' ');
  }

  function forceCheck(box) {
    if (box.checked) return 'already';
    if (cfg.dryRun) return 'dryRun';
    try { box.click(); } catch (e) {}
    if (!box.checked) {
      box.checked = true;
      ['input', 'change'].forEach(function (t) {
        try { box.dispatchEvent(new Event(t, { bubbles: true })); } catch (e) {}
      });
      if (window.jQuery) { try { window.jQuery(box).trigger('change'); } catch (e) {} }
    }
    return box.checked ? 'checked' : 'failed';
  }

  function layerContainer(box) {
    var p = box.parentElement;
    while (p && p !== document.body) {
      var st;
      try { st = getComputedStyle(p); } catch (e) { break; }
      var z = parseInt(st.zIndex, 10) || 0;
      if ((st.position === 'fixed' || st.position === 'absolute') && z >= 50) return p;
      p = p.parentElement;
    }
    return null;
  }

  function clickCloseIn(scope) {
    if (!scope) return false;
    var cands = scope.querySelectorAll('button, a, input[type="button"], input[type="submit"], span[onclick], div[onclick], img[onclick]');
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      var txt = (el.textContent || el.value || el.getAttribute('alt') || el.getAttribute('title') || '').trim();
      if (!CLOSE_TEXT_RE.test(txt)) continue;
      console.log(TAG, '닫기 클릭:', txt, cfg.dryRun ? '| dryRun' : '');
      if (cfg.dryRun) return true;
      try { el.click(); return true; } catch (e) {}
    }
    return false;
  }

  function runAutoCheck(report) {
    if (!cfg.enabled || !cfg.autoCheckDontShow || !document.body) return 0;
    var boxes = document.querySelectorAll('input[type="checkbox"]:not([data-kriss-pwm])');
    var n = 0;
    Array.prototype.forEach.call(boxes, function (box) {
      var text = nearbyText(box);
      if (!DONT_SHOW_RE.test(text)) return;
      box.setAttribute('data-kriss-pwm', '1');
      var r = forceCheck(box);
      n++;
      console.log(TAG, '"보지 않기" 체크박스 처리:', r, '| 근거:', text.substring(0, 80));
      if (report) report.push({ result: r, text: text.substring(0, 80) });

      if (cfg.autoCloseAfterCheck && (r === 'checked' || r === 'already')) {
        var scope = window.opener ? document.body : layerContainer(box);
        setTimeout(function () { clickCloseIn(scope || document.body); }, 200);
      }
    });
    return n;
  }

  // ============================================================
  // 레이어 팝업 · iframe 차단
  // ============================================================
  function hideEl(el, why) {
    console.log(TAG, '레이어 차단:', why, '|', (el.id || el.className || el.tagName), cfg.dryRun ? '| dryRun' : '');
    if (cfg.dryRun) return;
    el.setAttribute('data-kriss-pwm-hidden', '1');
    el.style.setProperty('display', 'none', 'important');
  }

  function removeBackdrops() {
    if (!cfg.removeBackdrop || cfg.dryRun) return;
    var sels = '.k-overlay, .modal-backdrop, [class*="dimm"], [class*="dimmed"], [id*="dimm"], [class*="layerMask"]';
    Array.prototype.forEach.call(document.querySelectorAll(sels), function (el) {
      el.setAttribute('data-kriss-pwm-hidden', '1');
      el.style.setProperty('display', 'none', 'important');
    });
    if (document.body) { document.body.style.removeProperty('overflow'); document.body.style.removeProperty('position'); }
  }

  function runLayerBlock() {
    if (!cfg.enabled || !document.body) return 0;
    var hidden = 0;

    // iframe 삽입형 팝업: src 가 차단 규칙에 걸리면 무력화
    Array.prototype.forEach.call(document.querySelectorAll('iframe[src]'), function (fr) {
      if (fr.getAttribute('data-kriss-pwm-hidden')) return;
      var hit = isBlocked(fr.getAttribute('src') || '');
      if (!hit || shouldPassOnce(hit)) return;
      logBlocked(fr.getAttribute('src'), hit, 'iframe');
      if (!cfg.dryRun) { try { fr.setAttribute('src', 'about:blank'); } catch (e) {} }
      hideEl(fr, 'iframe 규칙 ' + hit);
      hidden++;
    });

    if (!cfg.blockLayer.length) { if (hidden) removeBackdrops(); return hidden; }

    cfg.blockLayer.forEach(function (rule) {
      if (!rule) return;
      if (/^[#.\[]/.test(String(rule).trim())) {
        var nodes;
        try { nodes = document.querySelectorAll(rule); } catch (e) { return; }
        Array.prototype.forEach.call(nodes, function (el) {
          if (el.getAttribute('data-kriss-pwm-hidden')) return;
          hideEl(el, '셀렉터 ' + rule); hidden++;
        });
      } else {
        Array.prototype.forEach.call(document.querySelectorAll('div, section, aside, article'), function (el) {
          if (el.getAttribute('data-kriss-pwm-hidden')) return;
          if (el.hasAttribute(UI_ATTR)) return;
          var st;
          try { st = getComputedStyle(el); } catch (e) { return; }
          if (st.position !== 'fixed' && st.position !== 'absolute') return;
          if (st.display === 'none' || st.visibility === 'hidden') return;
          if ((el.textContent || '').substring(0, 400).indexOf(rule) < 0) return;
          if (el.parentElement && el.parentElement.getAttribute('data-kriss-pwm-hidden')) return;
          hideEl(el, '텍스트 "' + rule + '"'); hidden++;
        });
      }
    });
    if (hidden > 0) removeBackdrops();
    return hidden;
  }

  // ============================================================
  // 실행
  // ============================================================
  if (handleSelfBlocked()) return;

  var pending = null;
  function schedule() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () {
      pending = null;
      try { runAutoCheck(null); runLayerBlock(); }
      catch (e) { console.warn(TAG, '스케줄 실행 오류:', e.message); }
    }, 350);
  }

  function start() {
    if (!document.body) { setTimeout(start, 100); return; }
    console.log(TAG, 'v' + VER, '시작 |', location.pathname, '| 팝업창:', !!window.opener,
      '| 내장차단:', cfg.useBuiltinBlock ? BUILTIN_BLOCK.length + '건' : '해제', '| 모드:', cfg.blockMode);
    schedule();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    [1000, 2500, 5000].forEach(function (t) { setTimeout(schedule, t); });
    if (cfg.showPanel && !window.opener) buildPanel();   // 최상위 창에서만 패널 표시
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  setInterval(function () {
    var before = openedWindows.length;
    openedWindows = openedWindows.filter(function (w) {
      try { return w.win && !w.win.closed; } catch (e) { return false; }
    });
    if (openedWindows.length !== before) refreshPanel();
  }, 2000);

  // ============================================================
  // 긴급 원상복구 (문서 §1)
  // ============================================================
  function panic() {
    Array.prototype.forEach.call(document.querySelectorAll('[' + UI_ATTR + ']'), function (el) { el.remove(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-kriss-pwm-hidden]'), function (el) {
      el.style.removeProperty('display');
      el.removeAttribute('data-kriss-pwm-hidden');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-kriss-pwm]'), function (el) {
      el.removeAttribute('data-kriss-pwm');
    });
    cfg.enabled = false;
    panel = null; panelBody = null; toggleBtn = null;
    console.log(TAG, '원상복구 완료 — 이 탭에서는 기능이 중지되었습니다. 새로고침하면 설정값에 따라 다시 동작합니다.');
    return true;
  }

  // ============================================================
  // 관리 패널
  // ============================================================
  var panel = null, panelBody = null, toggleBtn = null;

  function mark(el) { el.setAttribute(UI_ATTR, '1'); return el; }

  function buildPanel() {
    if (document.getElementById('krissPwmToggle')) return;
    toggleBtn = mark(document.createElement('button'));
    toggleBtn.id = 'krissPwmToggle';
    toggleBtn.type = 'button';
    toggleBtn.style.cssText = [
      'position:fixed', 'right:14px', 'bottom:14px', 'z-index:2147483000',
      'background:#37474F', 'color:#fff', 'border:none', 'border-radius:18px',
      'padding:7px 14px', 'font:bold 12px Malgun Gothic,sans-serif',
      'cursor:pointer', 'box-shadow:0 2px 8px rgba(0,0,0,0.35)'
    ].join(';');
    toggleBtn.addEventListener('click', function () {
      if (!panel) createPanel();
      panel.style.display = (panel.style.display === 'none') ? 'flex' : 'none';
      refreshPanel();
    });
    document.body.appendChild(toggleBtn);
    refreshPanel();
  }

  function createPanel() {
    panel = mark(document.createElement('div'));
    panel.id = 'krissPwmPanel';
    panel.style.cssText = [
      'position:fixed', 'right:14px', 'bottom:56px', 'width:390px', 'max-height:72vh',
      'z-index:2147483000', 'background:#fff', 'border:1px solid #37474F', 'border-radius:8px',
      'box-shadow:0 6px 24px rgba(0,0,0,0.3)', 'display:flex', 'flex-direction:column',
      'font:12px Malgun Gothic,sans-serif', 'color:#263238'
    ].join(';');

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:#37474F;color:#fff;padding:8px 12px;border-radius:7px 7px 0 0;display:flex;justify-content:space-between;align-items:center;font-weight:bold;';
    var h = document.createElement('span');
    h.textContent = '팝업·창 관리자 v' + VER;
    var x = document.createElement('button');
    x.type = 'button'; x.textContent = '닫기';
    x.style.cssText = 'background:#fff;color:#37474F;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font-weight:bold;';
    x.addEventListener('click', function () { panel.style.display = 'none'; });
    hdr.appendChild(h); hdr.appendChild(x);
    panel.appendChild(hdr);

    panelBody = document.createElement('div');
    panelBody.style.cssText = 'padding:10px 12px;overflow-y:auto;line-height:1.6;';
    panel.appendChild(panelBody);
    document.body.appendChild(panel);
    renderPanelBody();
  }

  function section(title) {
    var d = document.createElement('div');
    d.style.cssText = 'margin:10px 0 4px;font-weight:bold;color:#1565C0;border-bottom:1px solid #eee;padding-bottom:2px;';
    d.textContent = title;
    return d;
  }

  function checkboxRow(label, key) {
    var wrap = document.createElement('label');
    wrap.style.cssText = 'display:block;cursor:pointer;';
    var c = document.createElement('input');
    c.type = 'checkbox'; c.checked = !!cfg[key];
    c.setAttribute('data-kriss-pwm', '1');   // 자동 체크 대상에서 제외
    c.style.cssText = 'margin-right:6px;vertical-align:middle;';
    c.addEventListener('change', function () { cfg[key] = c.checked; saveCfg(); schedule(); });
    wrap.appendChild(c);
    wrap.appendChild(document.createTextNode(label));
    return wrap;
  }

  function smallBtn(text, bg, handler) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = text;
    b.style.cssText = 'background:' + bg + ';color:#fff;border:none;border-radius:3px;padding:3px 9px;cursor:pointer;font-size:11px;';
    b.addEventListener('click', handler);
    return b;
  }

  function ruleEditor(title, key, placeholder) {
    var box = document.createElement('div');
    box.appendChild(section(title));
    var list = document.createElement('div');
    list.style.cssText = 'margin-bottom:6px;';
    var render = function () {
      list.innerHTML = '';
      if (!cfg[key].length) {
        var e = document.createElement('div');
        e.style.cssText = 'color:#90A4AE;'; e.textContent = '등록된 규칙 없음';
        list.appendChild(e); return;
      }
      cfg[key].forEach(function (r, i) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;align-items:center;padding:2px 0;';
        var t = document.createElement('span');
        t.style.cssText = 'flex:1;word-break:break-all;'; t.textContent = r;
        row.appendChild(t);
        row.appendChild(smallBtn('삭제', '#EF5350', function () {
          cfg[key].splice(i, 1); saveCfg(); render(); schedule();
        }));
        list.appendChild(row);
      });
    };
    render();
    box.appendChild(list);

    var inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:6px;';
    var inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = placeholder;
    inp.style.cssText = 'flex:1;border:1px solid #B0BEC5;border-radius:3px;padding:3px 6px;font-size:11px;';
    inputRow.appendChild(inp);
    inputRow.appendChild(smallBtn('추가', '#1565C0', function () {
      var v = inp.value.trim();
      if (v.length < 2) { alert('2자 이상 입력하세요.'); return; }
      cfg[key].push(v); saveCfg(); inp.value = ''; render(); schedule();
    }));
    box.appendChild(inputRow);
    return box;
  }

  function renderPanelBody() {
    if (!panelBody) return;
    panelBody.innerHTML = '';

    // 내장 차단 목록
    panelBody.appendChild(section('내장 차단 목록'));
    panelBody.appendChild(checkboxRow('내장 차단 목록 사용', 'useBuiltinBlock'));
    BUILTIN_BLOCK.forEach(function (b) {
      var d = document.createElement('div');
      d.style.cssText = 'color:#546E7A;padding-left:20px;word-break:break-all;';
      d.textContent = '· ' + b.pattern + ' — ' + b.note;
      panelBody.appendChild(d);
    });

    var modeRow = document.createElement('div');
    modeRow.style.cssText = 'margin-top:6px;';
    modeRow.appendChild(document.createTextNode('차단 방식: '));
    var bsel = document.createElement('select');
    bsel.style.cssText = 'border:1px solid #B0BEC5;border-radius:3px;padding:2px 4px;';
    [['always', '즉시 차단'], ['once', '하루 1회 열어 체크·닫기 후 차단']].forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      if (cfg.blockMode === o[0]) op.selected = true;
      bsel.appendChild(op);
    });
    bsel.addEventListener('change', function () { cfg.blockMode = bsel.value; saveCfg(); });
    modeRow.appendChild(bsel);
    panelBody.appendChild(modeRow);

    // 동작 설정
    panelBody.appendChild(section('동작'));
    panelBody.appendChild(checkboxRow('전체 기능 사용', 'enabled'));
    panelBody.appendChild(checkboxRow('"오늘 하루 보지 않기" 자동 체크', 'autoCheckDontShow'));
    panelBody.appendChild(checkboxRow('체크 후 닫기 자동 실행', 'autoCloseAfterCheck'));
    panelBody.appendChild(checkboxRow('레이어 차단 시 딤 처리 제거', 'removeBackdrop'));
    panelBody.appendChild(checkboxRow('테스트 모드(로그만 남기고 조작하지 않음)', 'dryRun'));

    var openRow = document.createElement('div');
    openRow.style.cssText = 'margin-top:6px;';
    openRow.appendChild(document.createTextNode('팝업 열기 방식: '));
    var sel = document.createElement('select');
    sel.style.cssText = 'border:1px solid #B0BEC5;border-radius:3px;padding:2px 4px;';
    [['tab', '새 탭'], ['window', '새 창'], ['native', '원래 방식']].forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      if (cfg.openMode === o[0]) op.selected = true;
      sel.appendChild(op);
    });
    sel.addEventListener('change', function () { cfg.openMode = sel.value; saveCfg(); });
    openRow.appendChild(sel);
    panelBody.appendChild(openRow);

    // 열린 창
    panelBody.appendChild(section('열린 창'));
    var winList = document.createElement('div');
    winList.id = 'krissPwmWinList';
    panelBody.appendChild(winList);
    var winBtns = document.createElement('div');
    winBtns.style.cssText = 'margin-top:6px;display:flex;gap:6px;';
    winBtns.appendChild(smallBtn('열린 창 모두 닫기', '#546E7A', function () {
      openedWindows.forEach(function (w) { try { w.win.close(); } catch (e) {} });
      openedWindows = []; refreshPanel();
    }));
    panelBody.appendChild(winBtns);

    // 차단 기록
    panelBody.appendChild(section('오늘 차단 기록'));
    var logList = document.createElement('div');
    logList.id = 'krissPwmLogList';
    panelBody.appendChild(logList);

    // 현재 화면
    panelBody.appendChild(section('현재 화면'));
    var cur = document.createElement('div');
    cur.style.cssText = 'word-break:break-all;color:#546E7A;margin-bottom:4px;';
    cur.textContent = location.pathname;
    panelBody.appendChild(cur);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
    btnRow.appendChild(smallBtn('이 화면을 팝업 차단에 추가', '#EF6C00', function () {
      var v = prompt('팝업 차단 규칙(URL 조각 또는 /정규식/)', guessScreenKey());
      if (!v) return;
      cfg.blockUrl.push(v.trim()); saveCfg(); renderPanelBody();
    }));
    btnRow.appendChild(smallBtn('진단 실행', '#00897B', function () {
      var rep = [];
      Array.prototype.forEach.call(document.querySelectorAll('[data-kriss-pwm]'), function (el) {
        if (!el.hasAttribute(UI_ATTR)) el.removeAttribute('data-kriss-pwm');
      });
      var n = runAutoCheck(rep);
      var layers = runLayerBlock();
      var msg = '"보지 않기" 체크박스 ' + n + '건 처리, 레이어·iframe 차단 ' + layers + '건.\n\n';
      msg += rep.map(function (r, i) { return (i + 1) + ') ' + r.result + ' — ' + r.text; }).join('\n') || '감지된 체크박스 없음';
      alert(msg);
    }));
    btnRow.appendChild(smallBtn('긴급 원상복구', '#B71C1C', function () {
      if (confirm('삽입 요소를 모두 제거하고 숨긴 요소를 복원합니다. 이 탭에서는 기능이 중지됩니다. 진행하시겠습니까?')) panic();
    }));
    panelBody.appendChild(btnRow);

    // 규칙 편집
    panelBody.appendChild(ruleEditor('추가 팝업 차단 규칙 (URL)', 'blockUrl', '예) S_COM_00000000P12.do'));
    panelBody.appendChild(ruleEditor('레이어 팝업 차단 규칙', 'blockLayer', '예) #noticeLayer 또는 시스템 점검 안내'));
    panelBody.appendChild(ruleEditor('원래 방식 유지 (opener 의존 팝업)', 'keepNative', '예) budgPopup2.do'));

    // 설정 백업
    panelBody.appendChild(section('설정 백업'));
    var backupRow = document.createElement('div');
    backupRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
    backupRow.appendChild(smallBtn('JSON 복사', '#455A64', function () {
      var t = JSON.stringify(cfg, null, 2);
      if (navigator.clipboard) navigator.clipboard.writeText(t);
      console.log(TAG, '설정 JSON:\n' + t);
    }));
    backupRow.appendChild(smallBtn('JSON 붙여넣기', '#455A64', function () {
      var v = prompt('설정 JSON을 붙여넣으세요.');
      if (!v) return;
      try {
        var o = JSON.parse(v);
        Object.keys(DEFAULT_CFG).forEach(function (k) { if (o[k] !== undefined) cfg[k] = o[k]; });
        saveCfg(); renderPanelBody();
        alert('불러왔습니다. 새로고침 후 적용됩니다.');
      } catch (e) { alert('JSON 형식이 올바르지 않습니다: ' + e.message); }
    }));
    backupRow.appendChild(smallBtn('오늘 처리 기록 초기화', '#455A64', function () {
      localStorage.removeItem(DISMISS_KEY); localStorage.removeItem(LOG_KEY);
      renderPanelBody();
    }));
    panelBody.appendChild(backupRow);

    refreshWinList();
    refreshLogList();
  }

  function guessScreenKey() {
    var m = location.href.match(/[A-Z]_[A-Z]{3}_\w+\.do/) || location.href.match(/B_[A-Z]+\d+/);
    return m ? m[0] : (location.pathname.split('/').filter(Boolean).pop() || '');
  }

  function refreshWinList() {
    var list = document.getElementById('krissPwmWinList');
    if (!list) return;
    list.innerHTML = '';
    if (!openedWindows.length) {
      var e = document.createElement('div');
      e.style.cssText = 'color:#90A4AE;'; e.textContent = '추적 중인 창 없음';
      list.appendChild(e); return;
    }
    openedWindows.forEach(function (w, i) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;padding:2px 0;border-bottom:1px solid #f0f0f0;';
      var t = document.createElement('span');
      t.style.cssText = 'flex:1;word-break:break-all;font-size:11px;';
      t.textContent = (i + 1) + ') ' + w.url.replace(/^https?:\/\/[^/]+/, '').substring(0, 58) + ' · ' + w.at.toTimeString().substring(0, 5);
      row.appendChild(t);
      row.appendChild(smallBtn('이동', '#1565C0', function () { try { w.win.focus(); } catch (e) {} }));
      row.appendChild(smallBtn('닫기', '#EF5350', function () {
        try { w.win.close(); } catch (e) {}
        openedWindows.splice(i, 1); refreshPanel();
      }));
      list.appendChild(row);
    });
  }

  function refreshLogList() {
    var list = document.getElementById('krissPwmLogList');
    if (!list) return;
    var items = readStore(LOG_KEY).items;
    list.innerHTML = '';
    if (!items.length) {
      var e = document.createElement('div');
      e.style.cssText = 'color:#90A4AE;'; e.textContent = '오늘 차단된 팝업 없음';
      list.appendChild(e); return;
    }
    items.slice(0, 12).forEach(function (it) {
      var d = document.createElement('div');
      d.style.cssText = 'font-size:11px;color:#546E7A;word-break:break-all;border-bottom:1px solid #f5f5f5;padding:1px 0;';
      d.textContent = it.at + ' [' + it.via + '] ' + it.rule + ' ← ' + it.url.replace(/^https?:\/\/[^/]+/, '').substring(0, 46);
      list.appendChild(d);
    });
  }

  function refreshPanel() {
    if (toggleBtn) {
      var blocked = readStore(LOG_KEY).items.length;
      toggleBtn.textContent = '팝업 관리' +
        (openedWindows.length ? ' · 창 ' + openedWindows.length : '') +
        (blocked ? ' · 차단 ' + blocked : '');
    }
    refreshWinList();
    refreshLogList();
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 콘솔 API
  window.KrissPWM = {
    version: VER,
    cfg: function () { return cfg; },
    save: saveCfg,
    run: function () { return { checked: runAutoCheck(null), layers: runLayerBlock() }; },
    windows: function () { return openedWindows.slice(); },
    log: function () { return readStore(LOG_KEY).items; },
    builtin: BUILTIN_BLOCK,
    test: function (url) { return isBlocked(url) || '(차단 규칙 없음)'; },
    panic: panic,
    reset: function () {
      [CFG_KEY, LOG_KEY, DISMISS_KEY].forEach(function (k) { localStorage.removeItem(k); });
      console.log(TAG, '설정·기록 초기화 — 새로고침하세요.');
    }
  };
})();