// ==UserScript==
// @name         KRISS 요구자료 콘솔
// @namespace    kriss.internal.console
// @version      0.2.0
// @description  요구자료 추출 전용 단일 페이지. 좌측에서 항목을 고르고 우측에서 공통·항목별 조건을 정한 뒤 한 번에 추출한다. 조회는 이 페이지에서만 발생한다.
// @author       -
// @match        https://krisstar.kriss.re.kr/popup/S_COM_00000000P.do*
// @match        https://krisstar.kriss.re.kr/index.do?krissConsole=1*
// @noframes
// @run-at       document-start
// @grant        none
// ==/UserScript==

/* ---------------------------------------------------------------------------
 * 버전 정책 (통계추출 스크립트와 동일)
 *   patch 0.y.Z = 오류 수정·자잘한 개선 / minor 0.Y.0 = 기능 추가·개편
 *   major X.0.0 = 타 스크립트와의 결합 또는 '1부' 완성 시점
 *
 * 변경이력
 *   0.2.0 (minor) 단일 페이지 재편.
 *     (1)[원인] 포털 오버레이(700px)와 콘솔 두 표면으로 나뉘어 설정이 두 곳에
 *        흩어지고, 좁은 폭 때문에 항목별 조건 지정이 불가능했다. 크로스탭
 *        RUN 디스패치·ACK 재전송도 실패 지점이었다. → 조건·실행·결과를 한
 *        페이지에 모으고 좌(목록)·우(조건·실행) 2컬럼으로 재구성.
 *     (2)항목별 조건 신설 — 공통값을 기본으로 두고 항목마다 덮어쓸 수 있다.
 *        해석 순서: 항목 재지정 → 공통 → 매니페스트 기본값.
 *     (3)번들이 항목·공통조건·항목별 재지정을 함께 보관한다.
 *     (4)버스는 포털에 보내는 HELLO·STATUS 두 종류만 남았다.
 *     (5)설정·진단을 좌측 하단 접이식으로 이동(단일 출처).
 *     (6)[원인] startRun이 큐 완료를 기다리지 않고 먼저 resolve해 외부에서
 *        await KrissConsole.run() 이 무의미했다. release가 pump 프라미스를
 *        반환하도록 수정.
 *     ※ 구 셸 표기 v1.0~v1.4는 0.1.0~0.1.4로 소급 재부여함(계보 동일).
 *
 * 절대 규칙 (기존 스크립트 관행 유지)
 *   G1 모든 통계 출력은 결과 / 백데이터 / 산출조건 3시트 원칙을 지킨다.
 *   G2 분류·집계에는 근거 열을 남긴다. 값만 내보내고 근거를 지우지 않는다.
 *   G3 쓰기 계열 엔드포인트는 api.post에서 차단한다(§11 안전경계).
 *   G4 수신 행수와 서버 total을 대조해 전량/부분 배지를 반드시 표기한다.
 *
 * 엔진 계약
 *   register({ id, version, title, subtitle, group, keywords[], needs[],
 *              checks[{id,label,run}], params[], outputs[], readOnly:true,
 *              run: async (ctx) => ({ rows, total, note, sheets:[{name,aoa,cols}] }) })
 *   ctx = { params, api:{post,postCached}, cache, util:{normPeriod},
 *           log(text), step(text, pct) }
 *
 * 오류 가능 지점
 *   1) 이 URL에 주입되지 않음 → 포털 버튼이 5초 후 폴백 전환을 제안
 *   2) 엔진 스크립트 미로드 → 해당 항목만 '구현 없음'
 *   3) 세션 만료 → api.post가 비 JSON을 감지해 메시지 반환
 *   4) localStorage 용량 초과 → 결과 원본은 저장하지 않고 파일로만 내보낸다
 *   5) 동시 실행 2에서도 같은 조회는 postCached로 1회만 발생
 *
 * 검증 방법
 *   - 콘솔에서 KrissConsole.selfTest() 전체 PASS
 *   - 항목 1건 실행 후 행수를 원래 화면의 총 건수 표기와 대조
 *   - 좌측 진단 섹션에서 '조회전용 미선언 0개' 확인
 * ------------------------------------------------------------------------- */

(function () {
  'use strict';

  var VERSION = '0.2.0';
  var NS = 'kriss_lnch_v1';
  var K_STATE = NS + ':state';
  var K_BUS = NS + ':bus';
  var ORIGIN = 'https://krisstar.kriss.re.kr';

  var IS_CONSOLE = /\/popup\/S_COM_00000000P\.do/.test(location.pathname) ||
                   /[?&]krissConsole=1(&|$)/.test(location.search);
  if (!IS_CONSOLE) return;
  if (window.__krissConsoleBooted) return;
  window.__krissConsoleBooted = 1;

  /* =======================================================================
   * 1. 유틸
   * ===================================================================== */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function errMsg(e) { return (e && e.message) ? e.message : String(e || '알 수 없는 오류'); }
  function nowStamp() {
    var d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' +
           pad2(d.getHours()) + pad2(d.getMinutes());
  }
  function fmtElapsed(ms) {
    var t = Math.max(0, Math.round(ms / 1000));
    return Math.floor(t / 60) + ':' + pad2(t % 60);
  }
  function cellText(v) {
    if (v && typeof v === 'object' && 'v' in v) v = v.v;
    return v == null ? '' : String(v);
  }
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function toCho(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xAC00 && c <= 0xD7A3) out += CHO.charAt(Math.floor((c - 0xAC00) / 588));
      else out += s.charAt(i);
    }
    return out;
  }
  var CHO_ONLY = /^[ㄱ-ㅎ\s]+$/;

  // 기간 입력 정규화. '2020' → 연 전체, 시작만 입력 → 오늘까지.
  function normPeriod(fromRaw, toRaw, gran, todayD) {
    var g = gran === 'ym' ? 'ym' : 'ymd';
    var td = todayD instanceof Date ? todayD : new Date();
    var todayYmd = td.getFullYear() + '-' + pad2(td.getMonth() + 1) + '-' + pad2(td.getDate());
    var lastDay = function (y, m) { return new Date(+y, +m, 0).getDate(); };
    var parse = function (raw, isEnd) {
      var s = String(raw == null ? '' : raw).trim().replace(/[./]/g, '-');
      if (!s) return '';
      var d = s.replace(/-/g, '');
      if (/^(19|20)\d{2}$/.test(d)) {
        if (g === 'ym') return isEnd ? d + '-12' : d + '-01';
        return isEnd ? d + '-12-31' : d + '-01-01';
      }
      if (/^(19|20)\d{4}$/.test(d)) {
        var y = d.slice(0, 4), m = d.slice(4, 6);
        if (g === 'ym') return y + '-' + m;
        return isEnd ? y + '-' + m + '-' + pad2(lastDay(y, m)) : y + '-' + m + '-01';
      }
      if (/^(19|20)\d{6}$/.test(d)) {
        var y2 = d.slice(0, 4), m2 = d.slice(4, 6), d2 = d.slice(6, 8);
        return g === 'ym' ? y2 + '-' + m2 : y2 + '-' + m2 + '-' + d2;
      }
      return s;
    };
    var from = parse(fromRaw, false);
    var to = parse(toRaw, true);
    if (from && !to) to = (g === 'ym') ? todayYmd.slice(0, 7) : todayYmd;
    return { from: from, to: to };
  }
  function download(blob, name) {
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = u; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 2000);
  }
  function aoaToTsv(aoa) {
    return (aoa || []).map(function (r) {
      return (r || []).map(function (v) {
        return cellText(v).replace(/[\t\r\n]+/g, ' ');
      }).join('\t');
    }).join('\r\n');
  }

  /* =======================================================================
   * 2. 상태 (localStorage. 결과 원본은 저장하지 않는다)
   * ===================================================================== */
  var DEFAULT_STATE = {
    bundles: [], checks: {}, snapshots: [], lastSelection: null,
    settings: {
      theme: 'auto', concurrency: 1, packageMode: 'single',
      consoleUrl: 'primary', hidePortalButton: false, portalHotkey: true
    }
  };
  var STATE = load();
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(K_STATE) || 'null');
      if (s && typeof s === 'object') {
        return Object.assign({}, DEFAULT_STATE, s, {
          settings: Object.assign({}, DEFAULT_STATE.settings, s.settings || {})
        });
      }
    } catch (e) { /* 손상 시 기본값 */ }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
  function save() {
    try { localStorage.setItem(K_STATE, JSON.stringify(STATE)); }
    catch (e) { console.warn('[요구자료] 상태 저장 실패:', errMsg(e)); }
  }

  /* ---- 포털에 보내는 신호 (HELLO / STATUS 두 종류만) ---- */
  var busSeq = 0;
  function notify(type, payload) {
    busSeq++;
    var msg = { seq: Date.now() * 1000 + (busSeq % 1000), from: 'console',
                type: type, payload: payload || {}, ts: Date.now() };
    try { localStorage.setItem(K_BUS, JSON.stringify(msg)); } catch (e) {}
  }

  /* =======================================================================
   * 3. 레지스트리
   * ===================================================================== */
  var REG = [];
  var WRITE_GUARD = /(create|update|save|delete|insert|modify|approve|reject|regist)/i;
  var BLOCKED = ['createActRqstByIntellPptyExp.json'];

  function register(m) {
    if (!m || !m.id || !m.title) { console.warn('[요구자료] register: id·title 필수'); return null; }
    var n = {
      id: String(m.id), version: m.version || '',
      title: String(m.title), subtitle: m.subtitle || '',
      group: m.group || '기타',
      keywords: Array.isArray(m.keywords) ? m.keywords : [],
      needs: Array.isArray(m.needs) ? m.needs : [],
      checks: Array.isArray(m.checks)
        ? m.checks.filter(function (c) { return c && c.id && typeof c.run === 'function'; }) : [],
      params: Array.isArray(m.params) ? m.params : [],
      outputs: Array.isArray(m.outputs) ? m.outputs : ['xlsx'],
      readOnly: m.readOnly === true,
      note: m.note || '',
      run: typeof m.run === 'function' ? m.run : null
    };
    n._hay = [n.title, n.subtitle, n.group, n.keywords.join(' '), n.id].join(' ').toLowerCase();
    n._cho = toCho(n.title + ' ' + n.subtitle + ' ' + n.group);
    if (!n.readOnly) n.note = (n.note ? n.note + ' / ' : '') + '조회 전용 선언 없음(readOnly:true 권장)';
    var i = REG.findIndex(function (x) { return x.id === n.id; });
    if (i >= 0) REG[i] = n; else REG.push(n);
    if (BOOTED) renderAll();
    return n;
  }
  function byId(id) { return REG.find(function (x) { return x.id === id; }) || null; }
  function search(q) {
    var s = String(q || '').trim();
    if (!s) return REG.slice();
    var low = s.toLowerCase();
    var cho = CHO_ONLY.test(s) ? s.replace(/\s+/g, '') : null;
    return REG.filter(function (m) {
      if (m._hay.indexOf(low) >= 0) return true;
      if (cho && m._cho.replace(/\s+/g, '').indexOf(cho) >= 0) return true;
      return false;
    });
  }

  /* =======================================================================
   * 4. 조회 API + 실행 단위 캐시
   * ===================================================================== */
  var CACHE = {};
  function cached(key, fn) {
    if (!(key in CACHE)) CACHE[key] = Promise.resolve().then(fn);
    return CACHE[key];
  }
  async function apiPost(path, body) {
    var url = /^https?:/.test(path) ? path : ORIGIN + path;
    var tail = url.split('?')[0].split('/').pop() || '';
    if (WRITE_GUARD.test(tail) || BLOCKED.indexOf(tail) >= 0) {
      throw new Error('쓰기 계열로 판정된 엔드포인트는 차단됩니다: ' + tail);
    }
    var res = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Accept': 'application/json' },
      body: JSON.stringify(body || {})
    });
    var text = await res.text();
    var json = null;
    try { json = JSON.parse(text); } catch (e) { /* 비 JSON */ }
    if (!res.ok) {
      throw new Error('HTTP ' + res.status +
        (res.status === 401 || res.status === 403 ? ' (로그인·권한 확인)' : ''));
    }
    if (json == null) throw new Error('응답이 JSON이 아닙니다. 세션 만료로 추정됩니다.');
    return json;
  }
  function ctxApi() {
    return {
      post: apiPost,
      postCached: function (path, body) {
        var k = 'api|' + path + '|' + JSON.stringify(body || {});
        var first = !(k in CACHE);
        return cached(k, function () { return apiPost(path, body); }).then(function (v) {
          if (!first) log('조회 캐시 재사용: ' + path);
          return v;
        });
      }
    };
  }
  function xlsxWriter() {
    if (window.KrissPaperEval && window.KrissPaperEval.KX && window.KrissPaperEval.KX.writeXlsx) {
      return window.KrissPaperEval.KX;
    }
    return null;
  }

  /* =======================================================================
   * 5. 파라미터 해석 (항목 재지정 → 공통 → 기본값)
   * ===================================================================== */
  function rawValue(m, key) {
    var sel = SEL[m.id];
    if (sel && sel.params && key in sel.params && sel.params[key] !== '' && sel.params[key] != null) {
      return { v: sel.params[key], src: 'item' };
    }
    if (key in COMMON && COMMON[key] !== '' && COMMON[key] != null) return { v: COMMON[key], src: 'common' };
    var p = m.params.filter(function (x) { return x.key === key; })[0];
    return { v: p ? p.def : undefined, src: 'default' };
  }
  function resolveParams(m) {
    var out = {};
    m.params.forEach(function (p) {
      var v = rawValue(m, p.key).v;
      if (p.type === 'period') {
        var src = v || {};
        out[p.key] = normPeriod(src.from, src.to, p.gran || 'ymd');
      } else if (p.type === 'multi') {
        out[p.key] = Array.isArray(v) ? v : (v == null ? [] : [v]);
      } else if (p.type === 'switch') {
        out[p.key] = !!v;
      } else if (p.type === 'number') {
        out[p.key] = (v === '' || v == null) ? null : Number(v);
      } else {
        out[p.key] = v == null ? '' : v;
      }
    });
    return out;
  }
  // 선택된 항목 중 2개 이상이 공유하는 파라미터만 공통 조건으로 노출
  function commonParams() {
    var picked = REG.filter(function (m) { return SEL[m.id]; });
    if (picked.length < 2) return [];
    var cnt = {};
    picked.forEach(function (m) {
      m.params.forEach(function (p) {
        var k = p.key + '|' + p.type;
        cnt[k] = cnt[k] || { p: p, n: 0 };
        cnt[k].n++;
      });
    });
    return Object.keys(cnt).filter(function (k) { return cnt[k].n >= 2; })
      .map(function (k) { return cnt[k].p; });
  }
  function overrideCount(m) {
    var sel = SEL[m.id];
    if (!sel || !sel.params) return 0;
    return Object.keys(sel.params).filter(function (k) {
      var v = sel.params[k];
      if (v == null || v === '') return false;
      if (typeof v === 'object') return !!(v.from || v.to);
      return true;
    }).length;
  }
  function selectedIds() {
    return REG.filter(function (m) { return SEL[m.id]; }).map(function (m) { return m.id; });
  }

  /* =======================================================================
   * 6. 디자인 토큰
   * ---------------------------------------------------------------------
   * 라이트: 애플 시스템 색 기준. 다크: 사내 GWX 메일 v1.3.6 Ember 값 그대로.
   * Ember의 강조색이 앰버이므로 '부분·추정'은 오렌지(GWX --gwx-warn)를 쓴다.
   * ===================================================================== */
  var LIGHT = [
    '--paper:oklch(97.2% 0.003 265);',
    '--surface:oklch(99.5% 0.001 265);',
    '--material:oklch(99% 0.002 265/.72);',
    '--fill:oklch(95% 0.004 265);',
    '--fill2:oklch(91% 0.006 265);',
    '--ink:oklch(20% 0.008 265);',
    '--ink2:oklch(20% 0.008 265/.58);',
    '--ink3:oklch(20% 0.008 265/.32);',
    '--rule:oklch(20% 0.008 265/.11);',
    '--act:oklch(55% 0.185 256);',
    '--on-act:oklch(99% 0 0);',
    '--act-wash:oklch(55% 0.185 256/.11);',
    '--t-full:oklch(48% 0.115 155);--t-full-w:oklch(48% 0.115 155/.13);',
    '--t-part:oklch(56% 0.14 62);--t-part-w:oklch(56% 0.14 62/.15);',
    '--t-none:oklch(52% 0.19 25);--t-none-w:oklch(52% 0.19 25/.12);',
    '--sh-1:0 1px 2px oklch(20% 0.01 265/.10);',
    '--sh-2:0 1px 3px oklch(20% 0.01 265/.10),0 20px 50px oklch(20% 0.01 265/.18);'
  ].join('');
  var EMBER = [
    '--paper:#161514;', '--surface:#1e1d1b;', '--material:rgba(30,29,27,.80);',
    '--fill:#262421;', '--fill2:#35322b;',
    '--ink:#eae7df;', '--ink2:#b3aea1;', '--ink3:#7d796d;', '--rule:#35322b;',
    '--act:#f2b23e;', '--on-act:#241b07;', '--act-wash:rgba(242,178,62,.16);',
    '--t-full:#74dfa2;--t-full-w:rgba(34,197,94,.15);',
    '--t-part:#ff9558;--t-part-w:rgba(255,149,88,.16);',
    '--t-none:#ff6f66;--t-none-w:rgba(255,111,102,.13);',
    '--sh-1:0 1px 2px rgba(0,0,0,.45);', '--sh-2:0 10px 26px rgba(0,0,0,.55);'
  ].join('');
  var PAGE_BG = { light: '#f3f3f7', dark: '#161514' };

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;margin:0;padding:0;font-family:var(--ui);',
      '-webkit-font-smoothing:antialiased}',
    ':host{',
      '--ui:-apple-system,BlinkMacSystemFont,"SF Pro Text","Apple SD Gothic Neo",',
        '"Segoe UI Variable Text","Segoe UI","Malgun Gothic",sans-serif;',
      '--mono:ui-monospace,SFMono-Regular,"SF Mono",Consolas,"D2Coding",monospace;',
      LIGHT,
      '--ease:cubic-bezier(.16,1,.3,1);--snap:cubic-bezier(.3,0,.2,1);',
      'color:var(--ink);font-size:13px;line-height:1.5;font-variant-numeric:tabular-nums}',
    ':host([data-theme="dark"]){' + EMBER + '}',
    '@media (prefers-color-scheme:dark){:host(:not([data-theme="light"])){' + EMBER + '}}',
    '@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}',

    /* 레이아웃 */
    '#app{min-height:100vh;background:var(--paper);display:flex;flex-direction:column}',
    '.top{position:sticky;top:0;z-index:6;background:var(--material);',
      'box-shadow:inset 0 -.5px 0 var(--rule)}',
    '@supports (backdrop-filter:blur(1px)){.top{backdrop-filter:blur(24px) saturate(170%)}}',
    '@supports not (backdrop-filter:blur(1px)){.top{background:var(--surface)}}',
    '.top .in{max-width:1240px;margin:0 auto;padding:11px 22px;display:flex;align-items:center;gap:12px}',
    '.top h1{font-size:16px;font-weight:600;letter-spacing:-.022em}',
    '.top .v{font-size:11px;color:var(--ink3)}',
    '.top .clock{font-family:var(--mono);font-size:15px;font-weight:500;letter-spacing:-.03em}',
    '.top .phase{font-size:11px;color:var(--ink2);max-width:280px;overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap}',
    '.spacer{flex:1}',

    '.main{flex:1;max-width:1240px;width:100%;margin:0 auto;display:flex;align-items:stretch}',
    '.side{width:214px;flex:none;padding:14px 12px 30px;box-shadow:inset -.5px 0 0 var(--rule)}',
    '.work{flex:1;min-width:0;padding:16px 22px 110px}',
    '@media (max-width:860px){.main{flex-direction:column}',
      '.side{width:auto;box-shadow:inset 0 -.5px 0 var(--rule)}}',

    /* 좌측 */
    '.q{display:flex;align-items:center;gap:7px;background:var(--surface);border-radius:8px;',
      'padding:5px 9px;box-shadow:inset 0 0 0 .5px var(--rule);margin-bottom:14px}',
    '.q svg{flex:none;color:var(--ink3)}',
    '.q input{flex:1;min-width:0;border:0;background:none;color:var(--ink);font-size:12.5px;outline:none}',
    '.q input::placeholder{color:var(--ink3)}',
    '.sh{display:flex;align-items:baseline;gap:5px;font-size:10.5px;font-weight:700;',
      'color:var(--ink3);letter-spacing:.05em;text-transform:uppercase;padding:12px 4px 5px}',
    '.sh b{font-weight:500;letter-spacing:0}',
    '.row{display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:8px;cursor:pointer;',
      'transition:background .12s var(--snap)}',
    '.row:hover{background:var(--fill)}',
    '.row.on{background:var(--fill2)}',
    '.row .ck{width:15px;height:15px;flex:none;border-radius:4px;display:grid;place-items:center;',
      'box-shadow:inset 0 0 0 1.5px var(--ink3);color:transparent}',
    '.row[data-sel="1"] .ck{background:var(--act);box-shadow:inset 0 0 0 1.5px var(--act);color:var(--on-act)}',
    '.row .nm{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.row[data-sel="1"] .nm{font-weight:500}',
    '.row.mut .nm{color:var(--ink2)}',
    '.row .ic{flex:none;color:var(--ink3);display:grid;place-items:center;width:15px}',
    '.row.on .ic{color:var(--act)}',

    'details.fold{margin-top:14px;box-shadow:inset 0 .5px 0 var(--rule);padding-top:6px}',
    'details.fold>summary{list-style:none;cursor:pointer;font-size:10.5px;font-weight:700;',
      'color:var(--ink3);letter-spacing:.05em;text-transform:uppercase;padding:6px 4px;user-select:none}',
    'details.fold>summary::-webkit-details-marker{display:none}',
    'details.fold>summary::before{content:"▸ "}',
    'details.fold[open]>summary::before{content:"▾ "}',

    /* 카드·폼 */
    '.card{background:var(--surface);border-radius:12px;overflow:hidden;',
      'box-shadow:inset 0 0 0 .5px var(--rule);margin-bottom:12px}',
    '.ch{font-size:10.5px;font-weight:700;color:var(--ink3);letter-spacing:.05em;',
      'text-transform:uppercase;padding:10px 13px 3px}',
    '.ch em{font-style:normal;font-weight:500;letter-spacing:0;text-transform:none}',
    '.f{display:flex;align-items:center;gap:8px;padding:6px 13px;box-shadow:inset 0 .5px 0 var(--rule)}',
    '.f:first-of-type{box-shadow:none}',
    '.f>label{width:96px;flex:none;font-size:12px;color:var(--ink2)}',
    '.f .val{flex:1;min-width:0;font-size:12px;color:var(--ink2)}',
    '.f input,.f select{flex:1;min-width:0;background:var(--paper);color:var(--ink);font-size:12px;',
      'font-family:var(--ui);padding:4px 8px;border:0;border-radius:6px;',
      'box-shadow:inset 0 0 0 .5px var(--rule);outline:none}',
    '.f input:focus,.f select:focus{box-shadow:inset 0 0 0 1.5px var(--act)}',
    '.f input[data-ov="1"],.f select[data-ov="1"]{box-shadow:inset 0 0 0 1px var(--act)}',
    '.f .chk{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--ink2)}',
    '.f .chk input{flex:none;width:auto;box-shadow:none}',

    '.it>.hd{display:flex;align-items:center;gap:9px;padding:7px 13px;cursor:pointer;',
      'box-shadow:inset 0 .5px 0 var(--rule)}',
    '.it:first-of-type>.hd{box-shadow:none}',
    '.it>.hd .nm{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.it[data-open="1"]>.hd .nm{font-weight:600}',
    '.it>.bd{padding:0 13px 9px 34px}',
    '.it>.bd .f{padding-left:0;padding-right:0;box-shadow:none}',
    '.it>.bd .f>label{width:78px}',

    /* 배지·버튼 */
    '.tag{flex:none;font-size:10px;font-weight:600;padding:1.5px 6px;border-radius:5px;',
      'background:var(--fill2);color:var(--ink2);white-space:nowrap}',
    '.tag.full{background:var(--t-full-w);color:var(--t-full)}',
    '.tag.part{background:var(--t-part-w);color:var(--t-part)}',
    '.tag.none{background:var(--t-none-w);color:var(--t-none)}',
    '.tag.act{background:var(--act-wash);color:var(--act)}',
    'button{font-family:var(--ui);cursor:pointer}',
    'button.pri{border:0;background:var(--act);color:var(--on-act);font-size:12px;font-weight:600;',
      'padding:7px 16px;border-radius:9px;transition:filter .14s var(--snap)}',
    'button.pri:hover{filter:brightness(1.1)}',
    'button.pri[disabled]{opacity:.32;cursor:default;filter:none}',
    'button.gh{background:var(--surface);color:var(--ink);font-size:12px;font-weight:500;',
      'padding:6px 12px;border:0;border-radius:9px;box-shadow:inset 0 0 0 .5px var(--rule)}',
    'button.gh:hover{background:var(--fill)}',
    'button.gh[disabled]{opacity:.36;cursor:default}',
    'button.tiny{font-size:10.5px;padding:2.5px 8px;border-radius:6px}',
    'button:focus-visible{outline:2px solid var(--act);outline-offset:2px}',
    '.seg{display:flex;gap:2px;padding:2px;background:var(--fill);border-radius:8px;flex:none}',
    '.seg button{border:0;background:none;color:var(--ink2);font-size:11px;font-weight:600;',
      'padding:3px 9px;border-radius:6px}',
    '.seg button[aria-selected="true"]{background:var(--surface);color:var(--ink);box-shadow:var(--sh-1)}',

    /* 실행바·진행 */
    '.bar{display:flex;align-items:center;gap:9px;margin:4px 0 16px}',
    '.bar .sp{flex:1;font-size:12px;color:var(--ink2)}',
    '.bar .sp b{color:var(--ink);font-weight:600}',
    '.job{box-shadow:inset 0 .5px 0 var(--rule)}',
    '.job:first-child{box-shadow:none}',
    '.job .t{display:flex;align-items:center;gap:11px;padding:10px 13px}',
    '.job .gl{flex:none;width:15px;height:15px;display:grid;place-items:center}',
    '.job .tx{flex:1;min-width:0}',
    '.job .t1{font-size:12.5px;font-weight:500}',
    '.job[data-s="running"] .t1{font-weight:600}',
    '.job[data-s="wait"] .t1,.job[data-s="hold"] .t1{color:var(--ink2)}',
    '.job .t2{font-size:11px;color:var(--ink2);margin-top:1px;overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap}',
    '.job .cnt{flex:none;font-family:var(--mono);font-size:12.5px;letter-spacing:-.02em}',
    '.job .cnt em{font-style:normal;font-family:var(--ui);font-size:10.5px;color:var(--ink3);margin-left:2px}',
    '.job .pr{height:2px;background:transparent}',
    '.job[data-s="running"] .pr{background:var(--fill2)}',
    '.job .pr i{display:block;height:100%;background:var(--act);transform-origin:left;',
      'transition:transform .45s var(--ease)}',
    '.job .peek{padding:0 13px 11px;overflow:auto}',
    '@keyframes sp{to{transform:rotate(360deg)}}',
    '.spin{animation:sp .9s linear infinite;transform-origin:center}',

    'table.pv{border-collapse:collapse;font-family:var(--mono);font-size:11px;',
      'letter-spacing:-.01em;min-width:100%}',
    'table.pv th,table.pv td{text-align:left;padding:3.5px 9px;white-space:nowrap;',
      'box-shadow:inset 0 -.5px 0 var(--rule)}',
    'table.pv th{background:var(--fill);font-family:var(--ui);font-size:10px;font-weight:700;',
      'color:var(--ink2);letter-spacing:.03em;position:sticky;top:0}',
    'table.pv .more{color:var(--ink3);font-family:var(--ui);box-shadow:none;padding-top:7px}',

    /* 도크 */
    '.dock{position:fixed;left:0;right:0;bottom:0;z-index:7;background:var(--material);',
      'box-shadow:inset 0 .5px 0 var(--rule);transform:translateY(100%);',
      'transition:transform .42s var(--ease)}',
    '@supports (backdrop-filter:blur(1px)){.dock{backdrop-filter:blur(24px) saturate(170%)}}',
    '@supports not (backdrop-filter:blur(1px)){.dock{background:var(--surface)}}',
    '.dock.on{transform:translateY(0)}',
    '.dock .in{max-width:1240px;margin:0 auto;padding:12px 22px;display:flex;align-items:center;gap:10px}',
    '.dock .sp{flex:1;font-size:12px;color:var(--ink2)}',
    '.dock .sp b{color:var(--ink);font-weight:600}',

    'details.log{margin-top:16px}',
    'details.log>summary{list-style:none;cursor:pointer;font-size:11px;font-weight:600;',
      'color:var(--ink2);padding:7px 0;user-select:none}',
    'details.log>summary::-webkit-details-marker{display:none}',
    'details.log>summary::before{content:"▸ ";color:var(--ink3)}',
    'details.log[open]>summary::before{content:"▾ "}',
    '.log pre{font-family:var(--mono);font-size:11px;line-height:1.65;white-space:pre-wrap;',
      'color:var(--ink2);max-height:240px;overflow:auto;background:var(--surface);',
      'border-radius:10px;padding:11px 13px;box-shadow:inset 0 0 0 .5px var(--rule)}',
    '.empty{padding:40px 14px;text-align:center;color:var(--ink3);font-size:12px;line-height:1.8}'
  ].join('');

  /* =======================================================================
   * 7. 화면 상태
   * ===================================================================== */
  var SEL = {};        // { id: { params: {} } }
  var COMMON = {};     // 공통 조건
  var QUERY = '';
  var OPEN = null;     // 항목별 조건 펼침 대상 id
  var PEEK = null;     // 결과 미리보기 대상 id
  var QUEUE = [];
  var RESULTS = [];
  var LOGS = [];
  var PRE = null;
  var RUNNING = false;
  var STARTED = null;
  var TICK = null;
  var BOOTED = false;
  var UI = { host: null, root: null, app: null };

  function log(t) {
    LOGS.push('[' + new Date().toLocaleTimeString('ko-KR') + '] ' + t);
    if (LOGS.length > 500) LOGS.shift();
    var el = UI.app && UI.app.querySelector('.log pre');
    if (el) { el.textContent = LOGS.join('\n'); el.scrollTop = el.scrollHeight; }
  }

  function resolvedTheme() {
    var t = STATE.settings.theme || 'auto';
    if (t === 'light' || t === 'dark') return t;
    try {
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
        ? 'dark' : 'light';
    } catch (e) { return 'light'; }
  }
  function applyTheme() {
    var t = STATE.settings.theme || 'auto';
    if (UI.host) {
      if (t === 'auto') UI.host.removeAttribute('data-theme');
      else UI.host.setAttribute('data-theme', t);
    }
    var bg = PAGE_BG[resolvedTheme()];
    try {
      document.documentElement.style.background = bg;
      if (document.body) document.body.style.background = bg;
    } catch (e) {}
  }

  /* =======================================================================
   * 8. 아이콘
   * ===================================================================== */
  function svgCheck() {
    return '<svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden="true">' +
      '<path d="M1 3.4L3.3 5.7L8 1" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function svgSearch() {
    return '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<circle cx="6.8" cy="6.8" r="4.6" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  }
  function svgChevron(open) {
    return '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">' +
      '<path d="' + (open ? 'M2.5 4.5L6 8L9.5 4.5' : 'M4.5 2.5L8 6L4.5 9.5') +
      '" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function svgFolder() {
    return '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
      '<path d="M1.4 3.6a1 1 0 0 1 1-1h2.3l1 1.4h4.5a1 1 0 0 1 1 1v5.4a1 1 0 0 1-1 1H2.4a1 1 0 0 1-1-1z" ' +
      'stroke="currentColor" stroke-width="1.2"/></svg>';
  }
  function statusGlyph(state, partial) {
    if (state === 'running') {
      return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" class="spin">' +
        '<circle cx="7" cy="7" r="5.6" stroke="var(--fill2)" stroke-width="1.7"/>' +
        '<path d="M7 1.4A5.6 5.6 0 0 1 12.6 7" stroke="var(--act)" stroke-width="1.7" ' +
        'stroke-linecap="round"/></svg>';
    }
    if (state === 'done') {
      var c = partial ? 'var(--t-part)' : 'var(--t-full)';
      return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
        '<circle cx="7" cy="7" r="6.2" fill="' + c + '" opacity=".16"/>' +
        '<path d="M4.2 7.2L6.2 9.2L9.9 4.9" stroke="' + c + '" stroke-width="1.7" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (state === 'fail') {
      return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
        '<circle cx="7" cy="7" r="6.2" fill="var(--t-none)" opacity=".16"/>' +
        '<path d="M4.8 4.8L9.2 9.2M9.2 4.8L4.8 9.2" stroke="var(--t-none)" ' +
        'stroke-width="1.7" stroke-linecap="round"/></svg>';
    }
    if (state === 'hold') {
      return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
        '<circle cx="7" cy="7" r="5.6" stroke="var(--t-part)" stroke-width="1.5" ' +
        'stroke-dasharray="2.2 2.4"/></svg>';
    }
    return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
      '<circle cx="7" cy="7" r="5.6" stroke="var(--ink3)" stroke-width="1.5"/></svg>';
  }

  /* =======================================================================
   * 9. 렌더
   * ===================================================================== */
  function levelTag(m) {
    if (!m.run) return '<span class="tag none">구현 없음</span>';
    if (m.note) return '<span class="tag part">조건부</span>';
    return '';
  }
  function phaseText() {
    if (PRE && PRE.state === 'running') return '사전점검 중';
    if (PRE && PRE.state === 'blocked') return '점검 미충족으로 보류';
    var run = QUEUE.filter(function (i) { return i.state === 'running'; });
    if (run.length) return run.map(function (i) { return i.title; }).join(', ');
    var wait = QUEUE.filter(function (i) { return i.state === 'wait' || i.state === 'hold'; }).length;
    if (wait) return wait + '건 대기';
    if (QUEUE.length) return '모두 종료';
    var n = selectedIds().length;
    return n ? n + '개 선택됨' : '항목을 고르세요';
  }
  function jobLabel(it) {
    if (it.state === 'done') return it.note || '완료';
    if (it.state === 'fail') return it.note || '실패';
    if (it.state === 'running') return it.step || '실행 중';
    if (it.state === 'hold') return '사전점검 결과 대기';
    return '대기 중';
  }

  function renderAll() {
    if (!UI.app) return;
    UI.app.innerHTML = tplTop() +
      '<div class="main">' + tplSide() + '<div class="work">' + tplWork() + '</div></div>' +
      tplDock();
    wire();
  }
  function tick() {
    if (!UI.app) return;
    var cl = UI.app.querySelector('[data-clock]');
    if (cl) cl.textContent = STARTED ? fmtElapsed(Date.now() - STARTED) : '0:00';
    var ph = UI.app.querySelector('[data-phase]');
    if (ph) ph.textContent = phaseText();
    var ok = true;
    QUEUE.forEach(function (it, i) {
      var row = UI.app.querySelector('.job[data-i="' + i + '"]');
      if (!row) { ok = false; return; }
      var lb = row.querySelector('.t2');
      if (lb) lb.textContent = jobLabel(it);
      var b = row.querySelector('.pr i');
      if (b) b.style.transform = 'scaleX(' + (it.pct || (it.state === 'done' ? 1 : 0)) + ')';
    });
    return ok;
  }
  function startTick() { if (!TICK) TICK = setInterval(tick, 1000); }
  function stopTick() { if (TICK) { clearInterval(TICK); TICK = null; } }

  function tplTop() {
    var t = STATE.settings.theme || 'auto';
    var segs = [['auto', '자동'], ['light', '라이트'], ['dark', '다크']];
    return '<div class="top"><div class="in">' +
      '<h1>요구자료 콘솔</h1><span class="v">v' + VERSION + '</span>' +
      '<span class="spacer"></span>' +
      '<span class="clock" data-clock>' + (STARTED ? fmtElapsed(Date.now() - STARTED) : '0:00') + '</span>' +
      '<span class="phase" data-phase>' + esc(phaseText()) + '</span>' +
      '<span class="seg" role="group" aria-label="테마">' +
        segs.map(function (s) {
          return '<button data-theme-set="' + s[0] + '" aria-selected="' + (t === s[0]) + '">' + s[1] + '</button>';
        }).join('') +
      '</span>' +
      '<button class="gh" data-revert>원상복구</button>' +
      '</div></div>';
  }

  function tplSide() {
    var list = search(QUERY);
    var groups = {};
    list.forEach(function (m) { (groups[m.group] = groups[m.group] || []).push(m); });
    var gk = Object.keys(groups).sort();

    var bundles = STATE.bundles.length
      ? STATE.bundles.map(function (b, i) {
          var miss = b.items.filter(function (id) { return !byId(id); }).length;
          return '<div class="row" data-bundle="' + i + '" title="' + esc(b.note || '') + '">' +
            '<span class="ic">' + svgFolder() + '</span>' +
            '<span class="nm">' + esc(b.name) + '</span>' +
            (b.cadence ? '<span class="tag">' + esc(b.cadence) + '</span>' : '') +
            (miss ? '<span class="tag part">미등록 ' + miss + '</span>' : '') +
            '</div>';
        }).join('')
      : '<div class="row mut"><span class="ic"></span><span class="nm">저장된 번들 없음</span></div>';

    var items = gk.map(function (g) {
      return '<div class="sh">' + esc(g) + '<b>' + groups[g].length + '</b></div>' +
        groups[g].map(function (m) {
          return '<div class="row" data-pick="' + esc(m.id) + '" data-sel="' + (SEL[m.id] ? 1 : 0) + '"' +
            ' title="' + esc(m.subtitle || '') + '">' +
            '<span class="ck">' + svgCheck() + '</span>' +
            '<span class="nm">' + esc(m.title) + '</span>' +
            levelTag(m) + '</div>';
        }).join('');
    }).join('') || '<div class="empty">일치하는 항목이 없습니다.</div>';

    return '<div class="side">' +
      '<div class="q">' + svgSearch() +
        '<input data-q type="text" value="' + esc(QUERY) + '" placeholder="검색 (초성 가능)" ' +
        'autocomplete="off" spellcheck="false"></div>' +
      '<div class="sh">번들<b>' + STATE.bundles.length + '</b></div>' + bundles +
      items +
      tplSettings() + tplDiag() +
      '</div>';
  }

  function tplSettings() {
    var s = STATE.settings;
    return '<details class="fold"><summary>설정</summary>' +
      '<div class="f"><label>동시 실행</label><select data-set="concurrency">' +
        '<option value="1"' + (s.concurrency === 1 ? ' selected' : '') + '>1개 (권장)</option>' +
        '<option value="2"' + (s.concurrency === 2 ? ' selected' : '') + '>2개</option>' +
      '</select></div>' +
      '<div class="f"><label>출력 형태</label><select data-set="packageMode">' +
        '<option value="single"' + (s.packageMode === 'single' ? ' selected' : '') + '>워크북 1개</option>' +
        '<option value="split"' + (s.packageMode === 'split' ? ' selected' : '') + '>항목별 파일</option>' +
      '</select></div>' +
      '<div class="f"><label>콘솔 주소</label><select data-set="consoleUrl">' +
        '<option value="primary"' + (s.consoleUrl === 'primary' ? ' selected' : '') + '>팝업 경로</option>' +
        '<option value="fallback"' + (s.consoleUrl === 'fallback' ? ' selected' : '') + '>index.do 폴백</option>' +
      '</select></div>' +
      '<div class="f"><label>포털 버튼</label>' +
        '<label class="chk"><input type="checkbox" data-set-bool="hidePortalButton"' +
        (s.hidePortalButton ? ' checked' : '') + '>숨기기</label></div>' +
      '</details>';
  }

  function tplDiag() {
    var noRO = REG.filter(function (m) { return !m.readOnly; }).length;
    var ck = STATE.checks;
    var rows = [
      ['버전', 'v' + VERSION],
      ['등록 항목', REG.length + '개 (구현 ' + REG.filter(function (m) { return m.run; }).length + ')'],
      ['조회전용 미선언', noRO ? noRO + '개' : '없음'],
      ['테마', resolvedTheme() === 'dark' ? '다크 (Ember)' : '라이트 (애플)']
    ].map(function (r) {
      return '<div class="f"><label>' + esc(r[0]) + '</label><span class="val">' + esc(r[1]) + '</span></div>';
    }).join('');
    var ckRows = (ck && ck.rows && ck.rows.length)
      ? '<div class="f"><label>최근 점검</label><span class="val">' + esc(ck.at) + '</span></div>' +
        ck.rows.map(function (r) {
          var cls = r.state === 'ok' ? 'full' : r.state === 'fail' ? 'none' : '';
          return '<div class="f"><label style="width:auto;flex:1">' + esc(r.label) + '</label>' +
            '<span class="tag ' + cls + '">' + (r.state === 'ok' ? '충족' : r.state === 'fail' ? '미충족' : esc(r.state)) +
            '</span></div>';
        }).join('')
      : '';
    return '<details class="fold"><summary>진단</summary>' + rows + ckRows +
      '<div class="f"><label></label><button class="gh tiny" data-selftest>자가진단</button></div>' +
      '</details>';
  }

  function fieldRow(m, p, scope) {
    // scope: 'common' | 'item'
    var lab = esc(p.label || p.key);
    var attr = 'data-scope="' + scope + '" data-key="' + esc(p.key) + '"' +
      (scope === 'item' ? ' data-id="' + esc(m.id) + '"' : '');
    var rv = (scope === 'item') ? rawValue(m, p.key) : { v: COMMON[p.key], src: 'common' };
    var ov = (scope === 'item' && rv.src === 'item') ? ' data-ov="1"' : '';
    var v = rv.v;

    if (p.type === 'period') {
      var pv = v || {};
      var hint = (p.gran === 'ym') ? '2025 · 2025-01' : '2025 · 20250101';
      var ph1 = (scope === 'item' && rv.src !== 'item' && pv.from) ? String(pv.from) : ('시작: ' + hint);
      var ph2 = (scope === 'item' && rv.src !== 'item' && pv.to) ? String(pv.to) : '종료 (비우면 오늘)';
      var val1 = (scope === 'item' && rv.src !== 'item') ? '' : (pv.from || '');
      var val2 = (scope === 'item' && rv.src !== 'item') ? '' : (pv.to || '');
      return '<div class="f"><label>' + lab + '</label>' +
        '<input ' + attr + ' data-sub="from"' + ov + ' value="' + esc(val1) + '" placeholder="' + esc(ph1) + '">' +
        '<input ' + attr + ' data-sub="to"' + ov + ' value="' + esc(val2) + '" placeholder="' + esc(ph2) + '"></div>';
    }
    if (p.type === 'select') {
      var opts = (p.options || []).map(function (o) {
        var ovl = (o && typeof o === 'object') ? o.value : o;
        var otx = (o && typeof o === 'object') ? o.label : o;
        return '<option value="' + esc(ovl) + '"' + (String(v) === String(ovl) ? ' selected' : '') +
          '>' + esc(otx) + '</option>';
      }).join('');
      return '<div class="f"><label>' + lab + '</label>' +
        '<select ' + attr + ov + '>' + opts + '</select></div>';
    }
    if (p.type === 'multi') {
      var cur = Array.isArray(v) ? v.map(String) : [];
      return '<div class="f"><label>' + lab + '</label><span class="val">' +
        (p.options || []).map(function (o) {
          var ovl = (o && typeof o === 'object') ? o.value : o;
          var otx = (o && typeof o === 'object') ? o.label : o;
          return '<label class="chk" style="margin-right:10px"><input type="checkbox" ' + attr +
            ' data-multi="' + esc(ovl) + '"' + (cur.indexOf(String(ovl)) >= 0 ? ' checked' : '') + '>' +
            esc(otx) + '</label>';
        }).join('') + '</span></div>';
    }
    if (p.type === 'switch') {
      return '<div class="f"><label>' + lab + '</label><span class="val">' +
        '<label class="chk"><input type="checkbox" ' + attr + (v ? ' checked' : '') + '>사용</label></span></div>';
    }
    var pv2 = (scope === 'item' && rv.src !== 'item' && v != null && v !== '') ? String(v) : (p.placeholder || '');
    var val = (scope === 'item' && rv.src !== 'item') ? '' : (v == null ? '' : v);
    return '<div class="f"><label>' + lab + '</label>' +
      '<input ' + attr + ov + ' value="' + esc(val) + '" placeholder="' + esc(pv2) + '"></div>';
  }

  function tplWork() {
    var picked = REG.filter(function (m) { return SEL[m.id]; });
    if (!REG.length) {
      return '<div class="empty">등록된 항목이 없습니다.<br>' +
        '어댑터 스크립트(kriss_console_adapters)가 설치되어 있는지 확인하세요.</div>';
    }
    if (!picked.length) {
      return '<div class="empty">좌측에서 요구자료 항목이나 번들을 고르세요.<br>' +
        '두 개 이상 고르면 공통 조건을 한 번만 입력합니다.</div>' + tplJobs() + tplLog();
    }

    var cps = commonParams();
    var common = cps.length
      ? '<div class="card"><div class="ch">공통 조건 <em>· ' + picked.length + '개 항목에 적용</em></div>' +
        cps.map(function (p) { return fieldRow(null, p, 'common'); }).join('') + '</div>'
      : '';

    var items = '<div class="card"><div class="ch">항목별 조건 <em>· 공통값을 덮어씁니다</em></div>' +
      picked.map(function (m) {
        var open = OPEN === m.id;
        var n = overrideCount(m);
        var body = open
          ? '<div class="bd">' +
            (m.params.length
              ? m.params.map(function (p) { return fieldRow(m, p, 'item'); }).join('')
              : '<div class="f"><span class="val">조건 없음</span></div>') +
            (m.needs.length
              ? '<div class="f"><label>필요 조건</label><span class="val">' + esc(m.needs.join(' · ')) + '</span></div>'
              : '') +
            (m.note ? '<div class="f"><label></label><span class="val" style="color:var(--t-part)">' +
              esc(m.note) + '</span></div>' : '') +
            (n ? '<div class="f"><label></label><button class="gh tiny" data-reset-item="' + esc(m.id) +
              '">재지정 초기화</button></div>' : '') +
            '</div>'
          : '';
        return '<div class="it" data-open="' + (open ? 1 : 0) + '">' +
          '<div class="hd" data-toggle="' + esc(m.id) + '">' +
          '<span class="ic" style="color:var(--ink3)">' + svgChevron(open) + '</span>' +
          '<span class="nm">' + esc(m.title) + '</span>' +
          (n ? '<span class="tag act">' + n + '개 재지정</span>'
             : '<span class="tag">공통값 사용</span>') +
          '</div>' + body + '</div>';
      }).join('') + '</div>';

    var cacheHint = '';
    if (picked.filter(function (m) { return m.group === '지재권'; }).length >= 2) {
      cacheHint = ' · 같은 조회는 1회로 합쳐집니다';
    }
    var bar = '<div class="bar">' +
      '<span class="sp"><b>' + picked.length + '개</b> 선택' + cacheHint + '</span>' +
      '<button class="gh" data-save-bundle>번들로 저장</button>' +
      '<button class="gh" data-preflight>사전점검</button>' +
      '<button class="pri" data-run' + (RUNNING ? ' disabled' : '') + '>실행</button>' +
      '</div>';

    return common + items + bar + tplPre() + tplJobs() + tplLog();
  }

  function tplPre() {
    if (!PRE) return '';
    var st = PRE.state;
    if (st === 'passed' || st === 'skipped' || st === 'forced') {
      var okN = PRE.rows.filter(function (r) { return r.state === 'ok'; }).length;
      var word = st === 'passed' ? '사전점검 통과' : st === 'skipped' ? '사전점검 건너뜀' : '점검 무시';
      return '<div class="card"><div class="f"><label>사전점검</label>' +
        '<span class="val">' + word + ' · ' + okN + '/' + PRE.rows.length + ' 충족</span>' +
        '<span class="tag ' + (st === 'passed' ? 'full' : 'part') + '">' + word + '</span></div></div>';
    }
    var rows = PRE.rows.map(function (r) {
      var cls = r.state === 'ok' ? 'full' : r.state === 'fail' ? 'none' : r.state === 'running' ? 'part' : '';
      var txt = r.state === 'ok' ? '충족' : r.state === 'fail' ? '미충족'
        : r.state === 'running' ? '확인 중' : r.state === 'skip' ? '건너뜀' : '대기';
      return '<div class="f"><label>' + esc(r.label) + '</label>' +
        '<span class="val">' + esc(r.detail || r.by.join(', ')) + '</span>' +
        '<span class="tag ' + cls + '">' + txt + '</span></div>';
    }).join('');
    var act = (st === 'blocked')
      ? '<div class="f"><label></label><span class="val"></span>' +
        '<button class="gh" data-pre-cancel>취소</button>' +
        '<button class="pri" data-pre-force>무시하고 실행</button></div>'
      : '';
    return '<div class="card"><div class="ch">' +
      (st === 'blocked' ? '사전점검 미충족' : '사전점검 진행 중') + '</div>' + rows + act + '</div>';
  }

  function tplJobs() {
    if (!QUEUE.length) return '';
    return '<div class="ch" style="padding:14px 2px 6px">진행</div><div class="card">' +
      QUEUE.map(function (it, i) {
        var partial = (it.total != null && it.rows != null && it.rows !== it.total);
        var tag = '';
        if (it.state === 'done') {
          tag = partial
            ? '<span class="tag part">부분 ' + Number(it.rows).toLocaleString() + '/' +
              Number(it.total).toLocaleString() + '</span>'
            : '<span class="tag full">전량</span>';
        } else if (it.state === 'fail') {
          tag = '<button class="gh tiny" data-retry="' + i + '">재시도</button>';
        }
        var cnt = (it.rows != null)
          ? '<span class="cnt">' + Number(it.rows).toLocaleString() + '<em>행</em></span>' : '';
        var res = RESULTS.filter(function (r) { return r.id === it.id; })[0];
        var open = (PEEK === it.id) && res && res.sheets && res.sheets.length;
        return '<div class="job" data-i="' + i + '" data-s="' + it.state + '">' +
          '<div class="t"' + (res ? ' data-peek="' + esc(it.id) + '" style="cursor:pointer"' : '') + '>' +
          '<span class="gl">' + statusGlyph(it.state, partial) + '</span>' +
          '<span class="tx"><span class="t1">' + esc(it.title) + '</span>' +
          '<span class="t2">' + esc(jobLabel(it)) + '</span></span>' +
          cnt + tag +
          (res ? '<span class="tag">' + (open ? '접기' : '미리보기') + '</span>' : '') +
          '</div>' +
          '<div class="pr"><i style="transform:scaleX(' +
            (it.pct || (it.state === 'done' ? 1 : 0)) + ')"></i></div>' +
          (open ? tplPeek(res) : '') + '</div>';
      }).join('') + '</div>';
  }
  function tplPeek(res) {
    var sh = res.sheets[0];
    var aoa = sh.aoa || [];
    if (!aoa.length) return '<div class="peek"><span class="t2">내용 없음</span></div>';
    var head = (aoa[0] || []).map(function (c) { return '<th>' + esc(cellText(c)) + '</th>'; }).join('');
    var body = aoa.slice(1, 9).map(function (r) {
      return '<tr>' + (r || []).map(function (c) { return '<td>' + esc(cellText(c)) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var more = aoa.length > 9
      ? '<tr><td class="more" colspan="' + (aoa[0] || []).length + '">이하 ' +
        (aoa.length - 9).toLocaleString() + '행 · 시트 ' + res.sheets.length + '개는 파일에 모두 포함됩니다</td></tr>'
      : '';
    return '<div class="peek"><table class="pv"><thead><tr>' + head + '</tr></thead>' +
      '<tbody>' + body + more + '</tbody></table></div>';
  }
  function tplLog() {
    if (!LOGS.length) return '';
    return '<details class="log"><summary>실행 로그 ' + LOGS.length + '줄</summary>' +
      '<pre>' + esc(LOGS.join('\n')) + '</pre></details>';
  }
  function tplDock() {
    var sheets = RESULTS.reduce(function (a, r) { return a + (r.sheets ? r.sheets.length : 0); }, 0);
    var failed = QUEUE.filter(function (i) { return i.state === 'fail'; }).length;
    return '<div class="dock' + (RESULTS.length ? ' on' : '') + '"><div class="in">' +
      '<span class="sp"><b>' + RESULTS.length + '개</b> 항목 · <b>' + sheets + '개</b> 시트 준비됨' +
      (failed ? ' · <span style="color:var(--t-none)">실패 ' + failed + '건 제외</span>' : '') + '</span>' +
      '<button class="gh" data-tsv>TSV 복사</button>' +
      '<button class="gh" data-clear>비우기</button>' +
      '<button class="pri" data-export>엑셀로 내려받기</button>' +
      '</div></div>';
  }

  /* =======================================================================
   * 10. 이벤트
   * ===================================================================== */
  function wire() {
    var A = UI.app;
    var on = function (sel, ev, fn) {
      A.querySelectorAll(sel).forEach(function (el) { el.addEventListener(ev, fn); });
    };
    var q = A.querySelector('[data-q]');
    if (q) q.addEventListener('input', function () { QUERY = q.value; renderSide(); });

    on('[data-theme-set]', 'click', function (e) {
      STATE.settings.theme = e.currentTarget.dataset.themeSet;
      save(); applyTheme(); renderAll();
    });
    on('[data-revert]', 'click', function () {
      if (!confirm('이 페이지에 삽입한 요소를 모두 제거합니다. 새로고침하면 복원됩니다.')) return;
      revert();
    });
    on('[data-pick]', 'click', function (e) {
      var id = e.currentTarget.dataset.pick;
      if (SEL[id]) { delete SEL[id]; if (OPEN === id) OPEN = null; }
      else { SEL[id] = { params: {} }; if (!OPEN) OPEN = id; }
      renderAll();
    });
    on('[data-bundle]', 'click', function (e) {
      var b = STATE.bundles[Number(e.currentTarget.dataset.bundle)];
      if (!b) return;
      SEL = {};
      b.items.forEach(function (id) {
        SEL[id] = { params: (b.itemParams && b.itemParams[id]) ? JSON.parse(JSON.stringify(b.itemParams[id])) : {} };
      });
      COMMON = b.common ? JSON.parse(JSON.stringify(b.common)) : {};
      OPEN = b.items[0] || null;
      log('번들 불러옴: ' + b.name + ' (' + b.items.length + '개)');
      renderAll();
    });
    on('[data-toggle]', 'click', function (e) {
      var id = e.currentTarget.dataset.toggle;
      OPEN = (OPEN === id) ? null : id;
      renderAll();
    });
    on('[data-reset-item]', 'click', function (e) {
      e.stopPropagation();
      var id = e.currentTarget.dataset.resetItem;
      if (SEL[id]) SEL[id].params = {};
      renderAll();
    });
    on('[data-scope]', 'change', function (e) {
      var el = e.currentTarget;
      var scope = el.dataset.scope, key = el.dataset.key, id = el.dataset.id;
      var bag = (scope === 'common') ? COMMON : (SEL[id] = SEL[id] || { params: {} }).params;
      if (el.dataset.sub) {
        bag[key] = Object.assign({}, bag[key] || {});
        bag[key][el.dataset.sub] = el.value;
      } else if (el.dataset.multi != null) {
        var cur = Array.isArray(bag[key]) ? bag[key].slice() : [];
        var v = el.dataset.multi;
        var i = cur.map(String).indexOf(String(v));
        if (el.checked) { if (i < 0) cur.push(v); } else if (i >= 0) cur.splice(i, 1);
        bag[key] = cur;
      } else if (el.type === 'checkbox') {
        bag[key] = el.checked;
      } else {
        bag[key] = el.value;
      }
      renderWork();
    });
    on('[data-set]', 'change', function (e) {
      var k = e.currentTarget.dataset.set;
      STATE.settings[k] = (k === 'concurrency') ? Number(e.currentTarget.value) : e.currentTarget.value;
      save();
    });
    on('[data-set-bool]', 'change', function (e) {
      STATE.settings[e.currentTarget.dataset.setBool] = e.currentTarget.checked;
      save();
    });
    on('[data-save-bundle]', 'click', function () {
      var ids = selectedIds();
      if (!ids.length) return;
      var name = prompt('번들 이름 (예: 2026 기초통계자료)', '');
      if (!name) return;
      var ip = {};
      ids.forEach(function (id) {
        if (SEL[id] && Object.keys(SEL[id].params).length) ip[id] = JSON.parse(JSON.stringify(SEL[id].params));
      });
      STATE.bundles.push({
        id: 'b_' + Date.now().toString(36), name: name, cadence: '',
        items: ids, common: JSON.parse(JSON.stringify(COMMON)), itemParams: ip,
        note: '', at: new Date().toLocaleString('ko-KR')
      });
      save(); log('번들 저장: ' + name); renderAll();
    });
    on('[data-preflight]', 'click', function () { runPreflight(selectedIds(), false); });
    on('[data-run]', 'click', function () { startRun(false); });
    on('[data-pre-force]', 'click', function () {
      log('점검 결과를 무시하고 실행합니다.');
      if (PRE) PRE.state = 'forced';
      release();
    });
    on('[data-pre-cancel]', 'click', function () {
      QUEUE = QUEUE.filter(function (it) { return it.state !== 'hold'; });
      PRE = null; log('보류된 작업을 취소했습니다.'); renderAll();
    });
    on('[data-retry]', 'click', function (e) {
      e.stopPropagation();
      retryItem(Number(e.currentTarget.dataset.retry));
    });
    on('[data-peek]', 'click', function (e) {
      var id = e.currentTarget.dataset.peek;
      PEEK = (PEEK === id) ? null : id;
      renderWork();
    });
    on('[data-export]', 'click', exportPackage);
    on('[data-tsv]', 'click', copyTsv);
    on('[data-clear]', 'click', function () {
      QUEUE = []; RESULTS = []; PRE = null; PEEK = null; STARTED = null; CACHE = {};
      stopTick(); renderAll();
    });
    on('[data-selftest]', 'click', function () {
      var r = selfTest();
      alert('자가진단: ' + (r.fail ? 'FAIL ' + r.fail + '건' : 'PASS ' + r.pass + '건') +
        '\n자세한 내용은 브라우저 콘솔을 확인하세요.');
    });
  }
  // 부분 렌더 (입력 포커스 유지가 필요한 경우 전체 렌더 회피)
  function renderSide() {
    var host = UI.app && UI.app.querySelector('.side');
    if (!host) { renderAll(); return; }
    var tmp = document.createElement('div');
    tmp.innerHTML = tplSide();
    host.replaceWith(tmp.firstElementChild);
    wire();
    var q = UI.app.querySelector('[data-q]');
    if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  function renderWork() {
    var host = UI.app && UI.app.querySelector('.work');
    if (!host) { renderAll(); return; }
    host.innerHTML = tplWork();
    var d = UI.app.querySelector('.dock');
    if (d) d.replaceWith(nodeFrom(tplDock()));
    wire();
  }
  function nodeFrom(html) {
    var t = document.createElement('div');
    t.innerHTML = html;
    return t.firstElementChild;
  }

  /* =======================================================================
   * 11. 사전점검
   * ===================================================================== */
  var BUILTIN_CHECKS = {
    session: {
      id: 'session', label: '포털 로그인 세션',
      run: async function (ctx) {
        var env = await ctx.api.post('/pms/iprs/pps/selectPpsList.json',
          { take: 1, skip: 0, page: 1, pageSize: 1 });
        return { ok: true, detail: (typeof env.total === 'number') ? ('응답 total ' + env.total) : '응답 수신' };
      }
    }
  };
  async function runPreflight(ids, skip) {
    var ms = ids.map(byId).filter(Boolean);
    var map = { session: { c: BUILTIN_CHECKS.session, by: ['전체'] } };
    ms.forEach(function (m) {
      m.checks.forEach(function (c) {
        if (!map[c.id]) map[c.id] = { c: c, by: [] };
        map[c.id].by.push(m.title);
      });
    });
    var keys = Object.keys(map);
    PRE = { state: 'running', skipped: !!skip, rows: keys.map(function (k) {
      return { id: k, label: map[k].c.label || k, by: map[k].by, state: 'wait', detail: '' };
    }) };
    renderWork();
    if (skip) {
      PRE.rows.forEach(function (r) { r.state = 'skip'; r.detail = '건너뜀'; });
      PRE.state = 'skipped'; log('사전점검을 건너뛰었습니다.'); report();
      return { ok: true };
    }
    for (var i = 0; i < keys.length; i++) {
      var row = PRE.rows[i];
      row.state = 'running'; renderWork();
      try {
        var r = await map[keys[i]].c.run({ api: ctxApi(), log: log }) || {};
        row.state = (r.ok === false) ? 'fail' : 'ok';
        row.detail = r.detail || '';
      } catch (e) { row.state = 'fail'; row.detail = errMsg(e); }
      log('점검 ' + row.label + ': ' + (row.state === 'ok' ? '충족' : '미충족 ' + row.detail));
      renderWork();
    }
    var bad = PRE.rows.filter(function (r) { return r.state === 'fail'; });
    PRE.state = bad.length ? 'blocked' : 'passed';
    report();
    return { ok: !bad.length, bad: bad };

    function report() {
      STATE.checks = { at: new Date().toLocaleString('ko-KR'), rows: PRE.rows.map(function (r) {
        return { id: r.id, label: r.label, state: r.state, detail: r.detail };
      }) };
      save();
      renderWork();
    }
  }

  /* =======================================================================
   * 12. 실행
   * ===================================================================== */
  async function startRun(skipPreflight) {
    var ids = selectedIds();
    if (!ids.length) return;
    QUEUE = ids.map(function (id) {
      var m = byId(id);
      return { id: id, title: m ? m.title : id, state: 'hold', pct: 0, step: '' };
    });
    RESULTS = []; PEEK = null; CACHE = {};
    STARTED = Date.now(); startTick();
    STATE.lastSelection = { ids: ids, common: COMMON, at: Date.now() };
    save();
    log('실행 시작 · ' + ids.length + '건');
    renderAll();
    var r = await runPreflight(ids, !!skipPreflight);
    if (!r.ok) {
      log('사전점검 미충족 ' + r.bad.length + '건. 실행을 보류했습니다.');
      renderWork();
      return;
    }
    return release();
  }
  // 큐 처리 프라미스를 반환한다. 외부에서 await KrissConsole.run() 이 완료를 보장한다.
  function release() {
    QUEUE.forEach(function (it) { if (it.state === 'hold') it.state = 'wait'; });
    renderWork();
    return pump();
  }
  async function pump() {
    if (RUNNING) return;
    RUNNING = true;
    notify('STATUS', { running: true });
    startTick();
    var conc = STATE.settings.concurrency || 1;
    var ws = [];
    for (var i = 0; i < conc; i++) ws.push(worker());
    await Promise.all(ws);
    RUNNING = false;
    notify('STATUS', { running: false });
    stopTick();
    log('큐 처리 종료.');
    renderAll();
  }
  async function worker() {
    for (;;) {
      var it = QUEUE.filter(function (x) { return x.state === 'wait'; })[0];
      if (!it) return;
      it.state = 'running'; it.pct = 0.04; it.step = '준비';
      renderWork();
      var m = byId(it.id);
      var t0 = Date.now();
      try {
        if (!m) throw new Error('항목이 등록되지 않았습니다');
        if (!m.run) throw new Error('이 항목에는 구현이 없습니다');
        log(m.title + ' 시작');
        var out = await m.run({
          params: resolveParams(m),
          api: ctxApi(),
          cache: cached,
          util: { normPeriod: normPeriod },
          log: function (t) { log(m.title + ': ' + t); },
          step: function (t, pct) {
            if (t) it.step = t;
            if (typeof pct === 'number') it.pct = Math.max(0.04, Math.min(1, pct));
            if (!tick()) renderWork();
          }
        }) || {};
        it.state = 'done'; it.pct = 1;
        it.rows = out.rows != null ? out.rows
          : (Array.isArray(out.records) ? out.records.length : null);
        it.total = out.total != null ? out.total : null;
        var secs = ((Date.now() - t0) / 1000).toFixed(1);
        it.note = (out.note ? out.note + ' · ' : '') + secs + '초';
        RESULTS.push({
          id: m.id, title: m.title,
          sheets: out.sheets || (out.resultAOA ? [{ name: m.title, aoa: out.resultAOA }] : []),
          rows: it.rows, total: it.total
        });
        log(m.title + ' 완료 (' + secs + '초)');
      } catch (e) {
        it.state = 'fail'; it.pct = 0; it.note = errMsg(e);
        log(it.title + ' 실패: ' + it.note);
      }
      renderWork();
    }
  }
  function retryItem(i) {
    var it = QUEUE[i];
    if (!it) return;
    it.state = 'wait'; it.note = ''; it.rows = null; it.total = null; it.pct = 0; it.step = '';
    RESULTS = RESULTS.filter(function (r) { return r.id !== it.id; });
    log(it.title + ' 재시도');
    renderWork();
    pump();
  }

  /* =======================================================================
   * 13. 내보내기
   * ===================================================================== */
  function safeSheetName(s, used) {
    var n = String(s).replace(/[\[\]:*?/\\]/g, '_').slice(0, 28);
    var k = n, i = 1;
    while (used[k]) k = n.slice(0, 25) + '_' + (++i);
    used[k] = 1;
    return k;
  }
  function metaSheet(mode) {
    return [
      [{ v: '항목', s: 2 }, { v: '값', s: 2 }],
      ['생성시각', new Date().toLocaleString('ko-KR')],
      ['콘솔 버전', 'v' + VERSION],
      ['항목 수', RESULTS.length],
      ['출력 형태', mode === 'single' ? '워크북 1개' : '항목별 파일'],
      ['공통 조건', JSON.stringify(COMMON)]
    ].concat(RESULTS.map(function (r) {
      return [r.title, (r.rows != null ? r.rows + '행' : '') +
        (r.total != null ? ' / total ' + r.total : '')];
    }));
  }
  async function exportPackage() {
    if (!RESULTS.length) return;
    var KX = xlsxWriter();
    var stamp = nowStamp();
    if (!KX) {
      log('xlsx 작성기를 찾지 못했습니다(논문평가 스크립트 미로드). TSV로 내려받습니다.');
      var txt = RESULTS.map(function (r) {
        return '### ' + r.title + '\n' + r.sheets.map(function (s) { return aoaToTsv(s.aoa); }).join('\n\n');
      }).join('\n\n');
      download(new Blob(['\uFEFF' + txt], { type: 'text/tab-separated-values;charset=utf-8' }),
        'kriss_package_' + stamp + '.tsv');
      return;
    }
    var mode = STATE.settings.packageMode || 'single';
    if (mode === 'single') {
      var used = {};
      var sheets = [{ name: '00.실행요약', aoa: metaSheet(mode), cols: [30, 44] }];
      RESULTS.forEach(function (r) {
        (r.sheets.length ? r.sheets : [{ name: r.title, aoa: [['(결과 없음)']] }]).forEach(function (s) {
          sheets.push({ name: safeSheetName(s.name || r.title, used), aoa: s.aoa, cols: s.cols });
        });
      });
      var blob = await KX.writeXlsx(sheets);
      download(blob, 'kriss_package_' + stamp + '.xlsx');
      log('워크북 1개로 내려받았습니다. 시트 ' + sheets.length + '개');
    } else {
      for (var i = 0; i < RESULTS.length; i++) {
        var r2 = RESULTS[i], u2 = {};
        var sh = [{ name: '00.실행요약', aoa: metaSheet(mode), cols: [30, 44] }].concat(
          (r2.sheets.length ? r2.sheets : [{ name: r2.title, aoa: [['(결과 없음)']] }])
            .map(function (s) {
              return { name: safeSheetName(s.name || r2.title, u2), aoa: s.aoa, cols: s.cols };
            }));
        var b2 = await KX.writeXlsx(sh);
        download(b2, 'kriss_' + r2.id + '_' + stamp + '.xlsx');
      }
      log('항목별 파일 ' + RESULTS.length + '개로 내려받았습니다.');
    }
  }
  function copyTsv() {
    var txt = RESULTS.map(function (r) {
      return '### ' + r.title + '\n' + r.sheets.map(function (s) { return aoaToTsv(s.aoa); }).join('\n\n');
    }).join('\n\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(
        function () { log('클립보드에 복사했습니다.'); },
        function () { log('클립보드 접근이 차단되었습니다.'); });
    } else log('이 브라우저는 클립보드 API를 지원하지 않습니다.');
  }

  /* =======================================================================
   * 14. 원상복구 · 자가진단
   * ===================================================================== */
  function revert() {
    document.querySelectorAll('[data-kriss-console]').forEach(function (n) { n.remove(); });
    UI.host = null; UI.root = null; UI.app = null;
    stopTick();
    console.log('[요구자료] 삽입 요소를 제거했습니다. 새로고침하면 복원됩니다.');
  }
  function selfTest() {
    var R = [];
    var eq = function (n, got, want) {
      R.push({ 항목: n, 결과: JSON.stringify(got) === JSON.stringify(want) ? 'PASS' : 'FAIL',
               실제: JSON.stringify(got), 기대: JSON.stringify(want) });
    };
    var fx = new Date(2026, 6, 30);
    eq('기간: 연도만 → 연 전체',
      (function () { var p = normPeriod('2025', '2025', 'ymd', fx); return [p.from, p.to]; })(),
      ['2025-01-01', '2025-12-31']);
    eq('기간: 시작만 → 오늘까지',
      (function () { var p = normPeriod('20250101', '', 'ymd', fx); return [p.from, p.to]; })(),
      ['2025-01-01', '2026-07-30']);
    eq('기간: ym 단위',
      (function () { var p = normPeriod('2025', '2025', 'ym', fx); return [p.from, p.to]; })(),
      ['2025-01', '2025-12']);
    eq('초성 변환', toCho('지재권 통계'), 'ㅈㅈㄱ ㅌㄱ');

    var keepREG = REG.slice(), keepSEL = SEL, keepCOM = COMMON;
    REG.length = 0;
    register({ id: 't1', title: '지재권 마스터 건수', group: '지재권', keywords: ['iprs'], readOnly: true });
    register({ id: 't2', title: '논문 실적', group: '논문·인사', readOnly: true });
    eq('검색: 한글 부분일치', search('지재권').map(function (m) { return m.id; }), ['t1']);
    eq('검색: 초성', search('ㅈㅈㄱ').map(function (m) { return m.id; }), ['t1']);
    eq('검색: 영문 키워드', search('iprs').map(function (m) { return m.id; }), ['t1']);
    eq('등록: 중복 id 대체',
      (function () { register({ id: 't1', title: '변경', readOnly: true }); return REG.length; })(), 2);

    REG.length = 0;
    register({ id: 'a', title: 'A', readOnly: true,
      params: [{ key: 'period', type: 'period' }, { key: 'only', type: 'text', def: 'D' }] });
    register({ id: 'b', title: 'B', readOnly: true, params: [{ key: 'period', type: 'period' }] });
    SEL = { a: { params: {} }, b: { params: {} } };
    COMMON = { period: { from: '2020', to: '2021' } };
    eq('공통 조건: 2개 이상 공유만', commonParams().map(function (p) { return p.key; }), ['period']);
    eq('해석: 공통값 상속',
      (function () { var r = resolveParams(byId('a')); return [r.period.from, r.period.to]; })(),
      ['2020-01-01', '2021-12-31']);
    SEL.a.params.period = { from: '2024', to: '2024' };
    eq('해석: 항목 재지정이 공통을 덮어씀',
      (function () { var r = resolveParams(byId('a')); return [r.period.from, r.period.to]; })(),
      ['2024-01-01', '2024-12-31']);
    eq('해석: 미지정은 기본값', resolveParams(byId('a')).only, 'D');
    eq('재지정 개수 집계', overrideCount(byId('a')), 1);
    eq('b는 공통값 유지',
      (function () { var r = resolveParams(byId('b')); return r.period.from; })(), '2020-01-01');
    eq('점검 계약: run 없는 항목 제외',
      (function () {
        REG.length = 0;
        register({ id: 'c1', title: 'C', readOnly: true, checks: [
          { id: 'k1', label: 'A', run: function () { return { ok: true }; } }, { id: 'k2', label: 'B' }] });
        return byId('c1').checks.map(function (c) { return c.id; });
      })(), ['k1']);

    REG.length = 0;
    keepREG.forEach(function (m) { REG.push(m); });
    SEL = keepSEL; COMMON = keepCOM;

    var fail = R.filter(function (x) { return x.결과 === 'FAIL'; }).length;
    try { console.table(R); } catch (e) { console.log(R); }
    console.log(fail ? '[요구자료] selfTest FAIL ' + fail + '건'
      : '[요구자료] selfTest 전체 PASS (' + R.length + '건)');
    return { pass: R.length - fail, fail: fail, details: R };
  }

  /* =======================================================================
   * 15. 공개 API · 부팅
   * ===================================================================== */
  window.KrissConsole = {
    version: VERSION,
    register: register,
    registerMany: function (a) { (a || []).forEach(register); return REG.length; },
    registry: function () {
      return REG.map(function (m) {
        return { id: m.id, title: m.title, group: m.group, hasImpl: !!m.run, readOnly: m.readOnly };
      });
    },
    registerBundle: function (b) {
      if (!b || !b.id || !b.name || !Array.isArray(b.items)) return null;
      STATE.seededBundles = STATE.seededBundles || [];
      if (STATE.seededBundles.indexOf(b.id) >= 0) return null;
      STATE.seededBundles.push(b.id);
      STATE.bundles.push({
        id: b.id, name: b.name, cadence: b.cadence || '', items: b.items.slice(),
        common: b.common ? JSON.parse(JSON.stringify(b.common)) : {},
        itemParams: b.itemParams ? JSON.parse(JSON.stringify(b.itemParams)) : {},
        note: b.note || '', preset: true, at: '기본 제공'
      });
      save();
      if (BOOTED) renderAll();
      return b.id;
    },
    bundles: function () { return STATE.bundles.slice(); },
    select: function (ids, common) {
      SEL = {};
      (ids || []).forEach(function (id) { SEL[id] = { params: {} }; });
      if (common) COMMON = common;
      if (BOOTED) renderAll();
    },
    run: function () { return startRun(false); },
    api: { post: apiPost },
    util: { normPeriod: normPeriod, toCho: toCho },
    state: function () { return STATE; },
    revert: revert,
    selfTest: selfTest
  };

  function boot() {
    document.title = 'KRISS 요구자료 콘솔';
    if (document.head) document.head.innerHTML = '';
    var meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width,initial-scale=1';
    (document.head || document.documentElement).appendChild(meta);
    if (document.body) { document.body.innerHTML = ''; document.body.style.cssText = 'margin:0'; }

    var host = document.createElement('div');
    host.setAttribute('data-kriss-console', 'app');
    host.style.cssText = 'all:initial';
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: 'open' });
    var st = document.createElement('style');
    st.textContent = CSS;
    root.appendChild(st);
    var app = document.createElement('div');
    app.id = 'app';
    root.appendChild(app);
    UI.host = host; UI.root = root; UI.app = app;

    applyTheme();
    try {
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
          if ((STATE.settings.theme || 'auto') === 'auto') { applyTheme(); renderAll(); }
        });
      }
    } catch (e) {}

    BOOTED = true;
    renderAll();
    notify('HELLO', { version: VERSION });
    log('콘솔 준비 완료. 좌측에서 항목을 고르세요.');
    console.log('[요구자료] 콘솔 v' + VERSION + ' 준비 완료 · 등록 ' + REG.length + '개');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else boot();
})();