// ==UserScript==
// @name         KRISS 지재권 대조 Helper
// @namespace    https://krisstar.kriss.re.kr/
// @version      1.2.1
// @description  지재권 첨부 PDF·DOCX·HWP·HWPX 대조/보기(문서 표시·실제 근거문구·한글 하이라이트) + 다운로드 시 관리번호 접두
// @match        *://*.kriss.re.kr/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 1.2.1
    - 대조가 정의된 첨부는 기존처럼 '대조' 버튼만 표시.
    - 대조가 없는 첨부는 같은 색상의 '보기' 버튼을 표시하고 다운로드 없이 모달에서 열람.

 1.2.0
   - 첨부파일의 별도 "보기" 버튼 제거. 대조 화면이 문서 열람을 함께 담당한다.
   - 대조 대상을 PDF뿐 아니라 DOCX/HWP/HWPX까지 확장한다.
   - 결과표의 "PDF에서 발견" 대신 실제 첨부문서에 적힌 문구/주변 문맥을 표시한다.
   - PDF 한글 하이라이트를 text item 단위가 아닌 줄 단위 결합+정규화 매칭으로 보강한다.
   - DOCX는 HTML 텍스트 하이라이트, HWP/HWPX는 SVG text/tspan 강조를 추가한다.

 1.1.0
   - 내부망 HWP/HWPX 인라인 보기 추가(@rhwp/core WASM 수동 등록, IndexedDB 저장).
   - 기존 PDF/DOCX 보기 및 PDF 대조 동작은 유지한다.

 1.0.0 (버전 체계 재정리)
   - 팝업 처리는 "KRISS 팝업·창 관리자" 스크립트가 전담한다(window.open 패치 제거).
   - 개인저작물(논문) 모듈은 "KRISS 개인저작물 논문 대조 Helper" 로 분리했다.
   - 화면별로 중복이던 결과표 렌더러를 buildResultPanel 하나로 통합했다.
   - 화면 판별은 URL 기준(시스템 구조 문서 §7.1 팝업 계약). 등록완료는 DOM 감지를 폴백으로 유지.
   - 청구서 비용 검산 포함(문서 §6.6): 대리인수수료+부가세+관납료+기타 = 비용합계.
   - 삽입 요소에 data-kriss-ui 부여 → KrissIprs.panic() 으로 일괄 원상복구(문서 §1).

 대조 지원 범위
   비용청구서 S_PMS_03015030 / B_RES00015 · 출원신청 S_PMS_03012020
   등록결정 S_PMS_03013020 · 등록완료 S_PMS_03013030
   그 외 화면(통합허브·업무요청·선행조사·발명신고서·지출발의)은 다운로드 접두만 제공.

 전제 조건
   - 최초 1회 "뷰어 설정"에서 다음 파일 등록 필요
     PDF: pdf.min.js + pdf.worker.min.js / DOCX: mammoth.browser.min.js
     HWP/HWPX: @rhwp/core 0.8.4의 rhwp.js + rhwp_bg.wasm
     (내부망 CDN 차단 → PDF/DOCX는 localStorage, HWP WASM은 IndexedDB 캐시).
   - 조회 전용. 저장·접수·승인·반려 버튼을 자동 클릭하지 않는다(문서 §11).

 검증 방법
   - 콘솔: KrissIprs.screen / KrissIprs.panic() / KrissIprs.setup()
   - 대조 패널 > 전체 복사 → 엑셀에 붙여 항목별 결과 기록.
*/

(function () {
  'use strict';
  var TAG = '[KRISS-IPRS]';
  var VER = '1.2.1';
  // ============================================================
  // [공통 코어 시작] — 두 스크립트에서 바이트 단위로 동일. 수정 시 양쪽 모두 교체할 것.
  // ============================================================
  var CACHE_LIB = 'kriss_pdfjs_lib';
  var CACHE_WORKER = 'kriss_pdfjs_worker';
  var CACHE_MAMMOTH = 'kriss_mammoth_lib';
  var CACHE_RHWP_MARK = 'kriss_rhwp_core_0_8_4_installed';
  var RHWP_DB_NAME = 'kriss_viewer_binary_libs';
  var RHWP_DB_STORE = 'libs';
  var RHWP_JS_KEY = 'rhwp_core_0_8_4_js';
  var RHWP_WASM_KEY = 'rhwp_core_0_8_4_wasm';
  var rhwpCorePromise = null;

  var KILLED = false;   // panic() 이후 재삽입·재바인딩을 막는 플래그

  // 안전 원칙(시스템 구조 문서 §11): 이 스크립트는 조회·표시만 한다.
  // 저장·접수·승인·반려 버튼(btnApvStatSave, btnRept, btnApprove, btnReject, btnSaveTab*)을
  // 자동 클릭하는 코드는 어떤 경우에도 추가하지 않는다.

  // ---------- 기본 유틸 ----------
  function getText(sel) { var el = document.querySelector(sel); return el ? el.textContent.trim() : ''; }
  function getElVal(sel) {
    var el = document.querySelector(sel);
    if (!el) return '';
    return (el.value !== undefined && el.value !== '' ? el.value : el.textContent).trim();
  }
  function getDropdownText(sel) {
    var el = document.querySelector(sel);
    if (!el) return '';
    var kw = el.closest ? el.closest('.k-widget') : null;
    if (kw) { var span = kw.querySelector('.k-input'); if (span) return span.textContent.trim(); }
    if (el.options && el.selectedIndex >= 0) return el.options[el.selectedIndex].text;
    return '';
  }
  function getDropdownVal(sel) { var el = document.querySelector(sel); return el ? (el.value || '') : ''; }
  function getRadioVal(name) {
    var c = document.querySelector('input[name="' + name + '"]:checked');
    return c ? c.value : '';
  }
  function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function cleanText(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function clipText(s, n) { var v = cleanText(s); n = n || 180; return v.length > n ? v.substring(0, n) + '…' : v; }
  function fmtMoney(val) {
    if (!val) return '0원';
    var n = String(val).replace(/[^0-9\-]/g, '');
    if (!n) return val;
    var num = parseInt(n, 10);
    return isNaN(num) ? val : num.toLocaleString('ko-KR') + '원';
  }
  function normalizeChars(t) {
    return String(t || '')
      .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
      .replace(/[\u2018\u2019\u201A\uFE10]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  }
  function normalizeHyphen(t) { return String(t || '').replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-'); }
  function compactText(s) { return normalizeChars(s).replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase(); }
  function normNameKor(s) { return normalizeChars(s || '').replace(/\s+/g, '').trim(); }
  function normNameEng(s) { return normalizeChars(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function escapeRe(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function extractDoiCore(s) {
    if (!s) return '';
    var m = String(s).match(/(10\.\d{4,}\/[A-Za-z0-9._\-()\/]+)/);
    return m ? m[1].replace(/\s+/g, '').replace(/[.,;)]+$/, '') : String(s).trim().replace(/[.,;)]+$/, '');
  }
  function combineTransform(m1, m2) {
    return [m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]];
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).catch(function () { fbCopy(t); });
    } else fbCopy(t);
  }
  function fbCopy(t) {
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px;';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  function showMsg(msg) {
    removeAll();
    var el = document.createElement('div');
    el.id = 'krissComparePanel';
    el.setAttribute('data-kriss-ui', '1');
    el.style.cssText = 'position:fixed;top:10px;right:10px;background:#333;color:#fff;padding:14px 20px;border-radius:8px;z-index:99999;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,0.3);max-width:520px;';
    el.textContent = TAG + ' ' + msg;
    document.body.appendChild(el);
  }
  function removeAll() { var el = document.getElementById('krissComparePanel'); if (el) el.remove(); }

  // 긴급 원상복구(시스템 구조 문서 §1)
  function panic() {
    KILLED = true;   // 이후 버튼 재삽입·다운로드 가로채기 모두 중지
    removeAll();
    Array.prototype.forEach.call(document.querySelectorAll('[data-kriss-ui]'), function (el) { el.remove(); });
    // data-kriss-dl 속성은 그대로 둔다(제거하면 관찰자가 다시 바인딩을 시도한다).
    console.log(TAG, '원상복구 완료 — 삽입 요소 제거, 기능 중지. 되살리려면 새로고침하세요.');
    return true;
  }

  // ---------- 날짜 ----------
  var MONTH_FULL = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function parseDateString(str) {
    var months = {};
    for (var i = 1; i <= 12; i++) {
      months[MONTH_FULL[i].toLowerCase()] = ('0' + i).slice(-2);
      months[MONTH_ABBR[i].toLowerCase()] = ('0' + i).slice(-2);
    }
    var s = cleanText(str);
    var m = s.match(/(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})/);
    if (m) return m[3] + '-' + (months[m[2].toLowerCase()] || '00') + '-' + ('0' + m[1]).slice(-2);
    m = s.match(/([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
    if (m) return m[3] + '-' + (months[m[1].toLowerCase()] || '00') + '-' + ('0' + m[2]).slice(-2);
    m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    return s;
  }

  function dateParts(str) {
    var m = String(str || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return m ? { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) } : null;
  }

  // 국내·해외 문서에서 쓰이는 모든 표기형을 생성한다(역검색용)
  function dateForms(str) {
    var p = dateParts(str);
    if (!p) return str ? [String(str)] : [];
    var mo = ('0' + p.m).slice(-2), d = ('0' + p.d).slice(-2);
    return [
      p.y + '-' + mo + '-' + d, p.y + '.' + mo + '.' + d, p.y + '. ' + mo + '. ' + d,
      p.y + '/' + mo + '/' + d, mo + '/' + d + '/' + p.y, p.m + '/' + p.d + '/' + p.y,
      MONTH_FULL[p.m] + ' ' + p.d + ', ' + p.y, MONTH_ABBR[p.m] + ' ' + p.d + ', ' + p.y,
      p.d + ' ' + MONTH_FULL[p.m] + ' ' + p.y, p.d + ' ' + MONTH_ABBR[p.m] + ' ' + p.y,
      p.y + '년 ' + p.m + '월 ' + p.d + '일', p.y + '년 ' + mo + '월 ' + d + '일',
      p.y + '년' + p.m + '월' + p.d + '일'
    ];
  }

  function dateInPdf(dateStr, pdfCompact) {
    var forms = dateForms(dateStr);
    for (var i = 0; i < forms.length; i++) {
      var f = compactText(forms[i]);
      if (f.length >= 6 && pdfCompact.indexOf(f) >= 0) return true;
    }
    return false;
  }

  function addMonths(dateStr, n) {
    var p = dateParts(dateStr);
    if (!p) return '';
    var base = new Date(p.y, p.m - 1, 1);
    base.setMonth(base.getMonth() + n);
    var last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    return base.getFullYear() + '-' + ('0' + (base.getMonth() + 1)).slice(-2) + '-' + ('0' + Math.min(p.d, last)).slice(-2);
  }

  // 긴 자유텍스트(발명의명칭 등): 완전일치 → 어절 다수일치(partial) → 불일치
  function longTextMatch(value, pdfCompact, pdfLower) {
    if (!value) return 'empty';
    var vc = compactText(value);
    if (vc.length >= 6 && pdfCompact.indexOf(vc) >= 0) return 'match';
    var tokens = normalizeChars(value).toLowerCase().split(/[^0-9a-z가-힣]+/).filter(function (w) { return w.length >= 3; });
    if (tokens.length < 3) return 'mismatch';
    var hit = 0;
    tokens.forEach(function (w) { if (pdfLower.indexOf(w) >= 0) hit++; });
    if (hit >= 4 && (hit / tokens.length) >= 0.75) return 'partial';
    return 'mismatch';
  }

  // ---------- 버튼 ----------
  function mkBtn(parent, text, bg, border, handler) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = text;
    b.setAttribute('data-kriss-ui', '1');
    b.style.cssText = ['margin-left:6px', 'background:' + bg, 'color:#fff', 'border:1px solid ' + border,
      'border-radius:4px', 'font-weight:bold', 'font-size:12px', 'padding:4px 14px', 'cursor:pointer',
      'vertical-align:middle', 'line-height:20px', 'font-family:Malgun Gothic,sans-serif'].join(';');
    b.addEventListener('click', handler);
    b.addEventListener('mouseenter', function () { b.style.opacity = '0.85'; });
    b.addEventListener('mouseleave', function () { b.style.opacity = '1'; });
    parent.appendChild(b);
    return b;
  }

  function mkInlineBtn(text, bg, handler) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'kriss-fbtn'; b.textContent = text;
    b.setAttribute('data-kriss-ui', '1');
    b.style.cssText = 'margin-left:4px;background:' + bg + ';color:#fff;border:none;padding:1px 8px;border-radius:3px;font-size:10px;cursor:pointer;font-weight:bold;vertical-align:middle;line-height:18px;';
    b.addEventListener('click', handler);
    return b;
  }

  // ---------- 첨부파일 다운로드 URL 후보 ----------
  function buildUrlCandidates(progrmId, docId, fileOrdr, rawSys, cntcAt, fileId) {
    var ca = cntcAt || 'R';
    var altCa = (ca === 'R') ? 'L' : 'R';
    var ep = '/com/cmm/fms/download/selectFileItem.json';
    var sysIsNull = (!rawSys || rawSys === 'null' || rawSys === 'undefined');
    var sysValues = sysIsNull ? ['', 'ESHOP', 'EKRISS'] : [rawSys, '', 'ESHOP'];
    var urls = [];
    [ca, altCa].forEach(function (c) {
      var base = '?progrmId=' + encodeURIComponent(progrmId) + '&docId=' + encodeURIComponent(docId) +
        '&fileOrdr=' + encodeURIComponent(fileOrdr) + '&cntcAt=' + c;
      sysValues.forEach(function (sv) { urls.push(ep + base + '&systemName=' + encodeURIComponent(sv)); });
    });
    var seen = {};
    urls = urls.filter(function (u) { if (seen[u]) return false; seen[u] = true; return true; });
    console.log(TAG, 'URL 후보', urls.length + '개 | cntcAt=' + ca + ' | rawSys=' + rawSys);
    return urls;
  }

  async function smartFetch(urls) {
    var jsonInfo = null;
    for (var i = 0; i < urls.length; i++) {
      try {
        var resp = await fetch(urls[i], { credentials: 'same-origin' });
        if (!resp.ok) { console.warn(TAG, '  → HTTP', resp.status); continue; }
        var buffer = await resp.arrayBuffer();
        var head = new Uint8Array(buffer.slice(0, 4));
        if (buffer.byteLength < 100) {
          var txt = new TextDecoder().decode(buffer);
          if (txt.indexOf('null') >= 0 || txt.indexOf('<html>') >= 0) { console.warn(TAG, '  → 빈 응답'); continue; }
        }
        if (head[0] === 0x7B || head[0] === 0x5B) {
          var jtxt = new TextDecoder().decode(buffer);
          try { jsonInfo = JSON.parse(jtxt); } catch (e) {}
          console.warn(TAG, '  → JSON 응답(파일 아님)');
          continue;
        }
        console.log(TAG, '다운로드 성공:', buffer.byteLength, 'bytes [' + (i + 1) + '/' + urls.length + ']');
        return buffer;
      } catch (e) { console.warn(TAG, '  → 네트워크 실패:', e.message); }
    }
    if (jsonInfo) {
      var fileId = jsonInfo.fileId || jsonInfo.atchFileId || jsonInfo.streFileNm ||
        (jsonInfo.data && (jsonInfo.data.fileId || jsonInfo.data.atchFileId));
      if (fileId) {
        var byId = [
          '/com/cmm/fms/download/selectFileItem.json?fileId=' + encodeURIComponent(fileId) + '&cntcAt=R',
          '/com/cmm/fms/FileDown.do?fileId=' + encodeURIComponent(fileId),
          '/cmm/fms/FileDown.do?atchFileId=' + encodeURIComponent(fileId)
        ];
        for (var k = 0; k < byId.length; k++) {
          try {
            var r2 = await fetch(byId[k], { credentials: 'same-origin' });
            if (!r2.ok) continue;
            var b2 = await r2.arrayBuffer();
            var h2 = new Uint8Array(b2.slice(0, 4));
            if (b2.byteLength < 100 || h2[0] === 0x7B || h2[0] === 0x5B) continue;
            console.log(TAG, 'fileId 재시도 성공:', b2.byteLength, 'bytes');
            return b2;
          } catch (e) {}
        }
      }
    }
    throw new Error('모든 다운로드 URL 실패 (' + urls.length + '개 시도)');
  }

  function urlsFromLink(a, fallbackProgrmId, fallbackDocId) {
    return buildUrlCandidates(
      a.getAttribute('data-progrm-id') || fallbackProgrmId || '',
      a.getAttribute('data-doc-id') || fallbackDocId || '',
      a.getAttribute('data-file-ordr') || '',
      a.getAttribute('data-system-name') || '',
      a.getAttribute('data-cntc-at') || '',
      a.getAttribute('data-file-id') || ''
    );
  }

  // ---------- 뷰어 라이브러리 ----------
  function hasPdfLib() { return !!localStorage.getItem(CACHE_LIB); }
  function hasDocxLib() { return !!localStorage.getItem(CACHE_MAMMOTH); }
  function hasRhwpLib() { return localStorage.getItem(CACHE_RHWP_MARK) === '1'; }

  function openViewerDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('이 브라우저에서 IndexedDB를 사용할 수 없습니다.')); return; }
      var req = indexedDB.open(RHWP_DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(RHWP_DB_STORE)) db.createObjectStore(RHWP_DB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB 열기 실패')); };
    });
  }

  async function viewerDbPut(key, value) {
    var db = await openViewerDb();
    try {
      await new Promise(function (resolve, reject) {
        var tx = db.transaction(RHWP_DB_STORE, 'readwrite');
        tx.objectStore(RHWP_DB_STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('IndexedDB 저장 실패')); };
        tx.onabort = function () { reject(tx.error || new Error('IndexedDB 저장 중단')); };
      });
    } finally { db.close(); }
  }

  async function viewerDbGet(key) {
    var db = await openViewerDb();
    try {
      return await new Promise(function (resolve, reject) {
        var tx = db.transaction(RHWP_DB_STORE, 'readonly');
        var req = tx.objectStore(RHWP_DB_STORE).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('IndexedDB 읽기 실패')); };
      });
    } finally { db.close(); }
  }

  function installRhwpTextMeasurer() {
    if (typeof globalThis.measureTextWidth === 'function') return;
    var cvs = document.createElement('canvas');
    var ctx = cvs.getContext('2d');
    globalThis.measureTextWidth = function (font, text) {
      var t = String(text == null ? '' : text);
      if (!ctx) return t.length * 8;
      try { ctx.font = String(font || '10pt sans-serif'); } catch (e) { ctx.font = '10pt sans-serif'; }
      return ctx.measureText(t).width;
    };
  }

  async function loadCachedRhwp() {
    if (window.__krissRhwpCore) return window.__krissRhwpCore;
    if (rhwpCorePromise) return rhwpCorePromise;

    rhwpCorePromise = (async function () {
      if (!hasRhwpLib()) throw new Error('rhwp.js + rhwp_bg.wasm이 등록되지 않았습니다. 뷰어 설정에서 먼저 등록하세요.');
      var jsCode = await viewerDbGet(RHWP_JS_KEY);
      var wasmBuffer = await viewerDbGet(RHWP_WASM_KEY);
      if (typeof jsCode !== 'string' || jsCode.indexOf('HwpDocument') < 0) throw new Error('저장된 rhwp.js가 올바르지 않습니다.');
      if (!(wasmBuffer instanceof ArrayBuffer) || wasmBuffer.byteLength < 8) throw new Error('저장된 rhwp_bg.wasm이 올바르지 않습니다.');

      installRhwpTextMeasurer();
      var moduleUrl = URL.createObjectURL(new Blob([jsCode], { type: 'text/javascript' }));
      try {
        var mod = await import(moduleUrl);
        if (!mod || typeof mod.default !== 'function' || !mod.HwpDocument) throw new Error('rhwp 모듈 export를 확인할 수 없습니다.');
        await mod.default({ module_or_path: wasmBuffer });
        window.__krissRhwpCore = mod;
        console.log(TAG, 'rhwp WASM 로드 완료');
        return mod;
      } catch (e) {
        throw new Error('rhwp WASM 로드 실패: ' + e.message + ' (사이트 CSP가 blob: 모듈 또는 WebAssembly를 차단하는지도 확인하세요)');
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
    })();

    try { return await rhwpCorePromise; }
    catch (e) { rhwpCorePromise = null; throw e; }
  }

  function loadCachedPdfJs() {
    if (window.pdfjsLib) return true;
    var libCode = localStorage.getItem(CACHE_LIB), wkCode = localStorage.getItem(CACHE_WORKER);
    if (!libCode || !wkCode) return false;
    var sc = document.createElement('script');
    sc.textContent = libCode; document.head.appendChild(sc);
    if (!window.pdfjsLib) { console.error(TAG, 'pdf.js 로드 실패'); return false; }
    var blob = new Blob([wkCode], { type: 'application/javascript' });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    console.log(TAG, 'pdf.js 로드 완료');
    return true;
  }

  function loadCachedMammoth() {
    if (window.mammoth) return true;
    var code = localStorage.getItem(CACHE_MAMMOTH);
    if (!code) return false;
    var sc = document.createElement('script');
    sc.textContent = code; document.head.appendChild(sc);
    if (!window.mammoth) { console.error(TAG, 'mammoth.js 로드 실패'); return false; }
    console.log(TAG, 'mammoth.js 로드 완료');
    return true;
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('파일 읽기 실패: ' + file.name)); };
      r.readAsText(file);
    });
  }

  function readFileBuffer(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('파일 읽기 실패: ' + file.name)); };
      r.readAsArrayBuffer(file);
    });
  }

  function ensureViewerSetupButton() {
    if (hasPdfLib() && hasDocxLib() && hasRhwpLib()) return;
    var area = document.querySelector('.titlegroup3 .ft_right') || document.querySelector('.titlegroup3');
    if (area && !document.getElementById('krissViewerSetupBtn')) {
      var b = mkBtn(area, '뷰어 설정', '#4CAF50', '#388E3C', showSetupDialog);
      b.id = 'krissViewerSetupBtn';
    }
  }

  function showSetupDialog() {
    removeAll();
    var modal = document.createElement('div');
    modal.id = 'krissComparePanel';
    modal.setAttribute('data-kriss-ui', '1');
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border:2px solid #1976D2;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,0.4);z-index:99999;width:620px;max-width:94vw;max-height:92vh;overflow:auto;font-family:Malgun Gothic,sans-serif;';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:#1565C0;color:#fff;padding:12px 16px;border-radius:8px 8px 0 0;font-weight:bold;font-size:14px;';
    hdr.textContent = '뷰어 라이브러리 설정';
    modal.appendChild(hdr);
    var body = document.createElement('div');
    body.style.cssText = 'padding:16px;';
    var info = document.createElement('div');
    info.style.cssText = 'background:#E3F2FD;padding:10px;border-radius:4px;font-size:12px;margin-bottom:14px;line-height:1.6;';
    info.innerHTML = '내부망에서 CDN 접근이 차단되므로 라이브러리를 수동 등록합니다.<br><b>PDF:</b> pdf.min.js + pdf.worker.min.js (v3.11.174 권장)<br><b>DOCX:</b> mammoth.browser.min.js<br><b>HWP/HWPX:</b> @rhwp/core 0.8.4의 rhwp.js + rhwp_bg.wasm<br><span style="color:#666">HWP 엔진은 용량 때문에 localStorage가 아닌 IndexedDB에 저장됩니다.</span>';
    body.appendChild(info);
    var mkRow = function (label, installed, accept) {
      var row = document.createElement('div');
      row.style.cssText = 'margin-bottom:10px;';
      var l = document.createElement('div');
      l.style.cssText = 'font-size:13px;font-weight:bold;margin-bottom:4px;';
      l.textContent = label + (installed ? ' (등록됨)' : '');
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept || '.js';
      row.appendChild(l); row.appendChild(inp); body.appendChild(row);
      return inp;
    };
    var inp1 = mkRow('1. pdf.min.js', hasPdfLib(), '.js');
    var inp2 = mkRow('2. pdf.worker.min.js', hasPdfLib(), '.js');
    var inp3 = mkRow('3. mammoth.browser.min.js', hasDocxLib(), '.js');
    var inp4 = mkRow('4. rhwp.js (@rhwp/core 0.8.4)', hasRhwpLib(), '.js');
    var inp5 = mkRow('5. rhwp_bg.wasm (@rhwp/core 0.8.4)', hasRhwpLib(), '.wasm,application/wasm');
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:6px;';
    var save = document.createElement('button');
    save.type = 'button'; save.textContent = '저장';
    save.style.cssText = 'flex:1;background:#1565C0;color:#fff;border:none;padding:8px;border-radius:4px;font-size:13px;font-weight:bold;cursor:pointer;';
    save.addEventListener('click', async function () {
      var f1 = inp1.files[0], f2 = inp2.files[0], f3 = inp3.files[0], f4 = inp4.files[0], f5 = inp5.files[0];
      if (!f1 && !f2 && !f3 && !f4 && !f5) { alert('하나 이상의 파일을 선택하세요.'); return; }
      try {
        if (f1 && f2) {
          localStorage.setItem(CACHE_LIB, await readFile(f1));
          localStorage.setItem(CACHE_WORKER, await readFile(f2));
        } else if (f1 || f2) { alert('pdf.js는 두 파일이 모두 필요합니다.'); return; }
        if (f3) localStorage.setItem(CACHE_MAMMOTH, await readFile(f3));
        if (f4 && f5) {
          var rhwpJs = await readFile(f4);
          var rhwpWasm = await readFileBuffer(f5);
          if (rhwpJs.indexOf('HwpDocument') < 0) throw new Error('선택한 rhwp.js에서 HwpDocument를 찾지 못했습니다.');
          var wh = new Uint8Array(rhwpWasm.slice(0, 4));
          if (wh.length < 4 || wh[0] !== 0x00 || wh[1] !== 0x61 || wh[2] !== 0x73 || wh[3] !== 0x6D) throw new Error('선택한 파일이 WebAssembly(.wasm)가 아닙니다.');
          await viewerDbPut(RHWP_JS_KEY, rhwpJs);
          await viewerDbPut(RHWP_WASM_KEY, rhwpWasm);
          localStorage.setItem(CACHE_RHWP_MARK, '1');
          rhwpCorePromise = null;
          try { delete window.__krissRhwpCore; } catch (e) {}
        } else if (f4 || f5) { alert('HWP/HWPX는 rhwp.js와 rhwp_bg.wasm 두 파일이 모두 필요합니다.'); return; }
        alert('저장했습니다. 페이지를 새로고침하세요.');
        modal.remove();
      } catch (e) { alert('파일 읽기 실패: ' + e.message); }
    });
    var cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = '취소';
    cancel.style.cssText = 'background:#eee;color:#333;border:1px solid #ccc;padding:8px 16px;border-radius:4px;font-size:13px;cursor:pointer;';
    cancel.addEventListener('click', function () { modal.remove(); });
    btnRow.appendChild(save); btnRow.appendChild(cancel);
    body.appendChild(btnRow); modal.appendChild(body);
    document.body.appendChild(modal);
  }

  // ---------- 첨부문서 로드 / 텍스트 추출 ----------
  function fileExt(fileName) {
    var n = String(fileName || '').toLowerCase();
    var p = n.lastIndexOf('.');
    return p >= 0 ? n.substring(p + 1).replace(/[^a-z0-9].*$/, '') : '';
  }

  function isPdfBuffer(buffer) {
    var b = new Uint8Array(buffer || 0);
    return b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2D;
  }

  function sniffHwpFormat(buffer, fileName) {
    var b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
    if (b.length >= 8 && b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0 &&
        b[4] === 0xA1 && b[5] === 0xB1 && b[6] === 0x1A && b[7] === 0xE1) return 'HWP';
    var ext = fileExt(fileName);
    if ((ext === 'hwp' || ext === 'hwpx') && b.length >= 4 && b[0] === 0x50 && b[1] === 0x4B &&
        ((b[2] === 0x03 && b[3] === 0x04) || (b[2] === 0x05 && b[3] === 0x06) || (b[2] === 0x07 && b[3] === 0x08))) return 'HWPX';
    return '';
  }

  // y좌표 변화로 줄바꿈을 복원한다(pdf.js는 줄 정보를 잃기 쉬움).
  async function extractPdfText(pdf) {
    var pageTexts = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var tc = await page.getTextContent();
      var lastY = null, pageText = '';
      tc.items.forEach(function (item) {
        if (!item.str) return;
        var y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) pageText += '\n';
        else if (pageText && !/[\s\n]$/.test(pageText)) pageText += ' ';
        pageText += item.str;
        lastY = y;
      });
      pageTexts.push(pageText);
    }
    return { pageTexts: pageTexts, text: pageTexts.join('\n') };
  }

  function sanitizeDocxHtml(html) {
    var box = document.createElement('template');
    box.innerHTML = String(html || '');
    Array.prototype.forEach.call(box.content.querySelectorAll('script,iframe,object,embed,form,meta,link'), function (el) { el.remove(); });
    Array.prototype.forEach.call(box.content.querySelectorAll('*'), function (el) {
      Array.prototype.slice.call(el.attributes || []).forEach(function (a) {
        var n = a.name.toLowerCase(), v = String(a.value || '').trim();
        if (/^on/.test(n)) el.removeAttribute(a.name);
        if ((n === 'href' || n === 'src' || n === 'xlink:href') && /^(?:javascript:|https?:|\/\/)/i.test(v)) el.removeAttribute(a.name);
      });
    });
    var holder = document.createElement('div');
    holder.appendChild(box.content.cloneNode(true));
    return holder.innerHTML;
  }

  function textFromHtml(html) {
    var d = document.createElement('div');
    d.innerHTML = sanitizeDocxHtml(html);
    return d.textContent || '';
  }

  function textFromSvg(svg) {
    try {
      var xml = new DOMParser().parseFromString(String(svg || ''), 'image/svg+xml');
      return xml.documentElement ? (xml.documentElement.textContent || '') : '';
    } catch (e) { return ''; }
  }

  async function loadAttachmentFromLink(urls, fileName, msgPrefix) {
    showMsg((msgPrefix || '첨부문서') + ' 다운로드 중...');
    var buffer = await smartFetch(Array.isArray(urls) ? urls : [urls]);
    var ext = fileExt(fileName);

    if (isPdfBuffer(buffer)) {
      if (!loadCachedPdfJs()) throw new Error('pdf.js가 등록되지 않았습니다. 뷰어 설정에서 먼저 등록하세요.');
      showMsg('PDF 텍스트 추출 중...');
      var pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
      var ex = await extractPdfText(pdf);
      console.log(TAG, 'PDF 추출:', ex.text.length, '자 |', pdf.numPages, '페이지');
      return { kind: 'PDF', buffer: buffer, pdf: pdf, text: ex.text, pageTexts: ex.pageTexts, pageCount: pdf.numPages };
    }

    if (ext === 'docx') {
      if (!loadCachedMammoth()) throw new Error('mammoth.js가 등록되지 않았습니다. 뷰어 설정에서 먼저 등록하세요.');
      var dh = new Uint8Array(buffer.slice(0, 4));
      if (dh[0] !== 0x50 || dh[1] !== 0x4B) throw new Error('응답이 DOCX(ZIP)가 아닙니다.');
      showMsg('DOCX 텍스트 추출 중...');
      var htmlResult = await window.mammoth.convertToHtml({ arrayBuffer: buffer });
      var rawText = '';
      if (typeof window.mammoth.extractRawText === 'function') {
        try { rawText = (await window.mammoth.extractRawText({ arrayBuffer: buffer })).value || ''; } catch (e) {}
      }
      if (!rawText) rawText = textFromHtml(htmlResult.value);
      return { kind: 'DOCX', buffer: buffer, html: sanitizeDocxHtml(htmlResult.value), text: rawText, pageTexts: [rawText], pageCount: 1 };
    }

    var format = sniffHwpFormat(buffer, fileName);
    if (format) {
      showMsg(format + ' 텍스트·페이지 추출 중...');
      var core = await loadCachedRhwp();
      var doc = null;
      try {
        var bytes = new Uint8Array(buffer);
        try {
          doc = new core.HwpDocument(bytes);
        } catch (firstErr) {
          var password = window.prompt('문서를 열지 못했습니다. 암호 문서라면 암호를 입력하세요.\n암호 문서가 아니면 취소하세요.\n\n' + firstErr.message, '');
          if (password === null || password === '') throw firstErr;
          if (typeof core.HwpDocument.openWithPassword !== 'function') throw new Error('이 rhwp 버전은 암호 열기 API를 제공하지 않습니다.');
          doc = core.HwpDocument.openWithPassword(bytes, password);
        }

        var count = doc.pageCount();
        if (!count || count < 1) throw new Error('표시할 페이지가 없습니다.');
        var pages = [], pageTexts = [];
        for (var i = 0; i < count; i++) {
          var svg = typeof doc.renderPageSvg === 'function' ? doc.renderPageSvg(i) : '';
          pages.push(svg);
          var pt = '';
          if (typeof doc.getPageText === 'function') {
            try { pt = String(doc.getPageText(i) || ''); } catch (e) {}
          }
          if (!pt && svg) pt = textFromSvg(svg);
          pageTexts.push(pt);
          if (i % 2 === 1) await new Promise(function (resolve) { requestAnimationFrame(resolve); });
        }
        var allText = pageTexts.join('\n');
        console.log(TAG, format + ' 추출:', allText.length, '자 |', count, '페이지');
        return { kind: format, buffer: buffer, pages: pages, text: allText, pageTexts: pageTexts, pageCount: count };
      } finally {
        if (doc) { try { doc.free(); } catch (e) {} }
      }
    }

    throw new Error('지원 형식을 판별하지 못했습니다: ' + (fileName || '(파일명 없음)'));
  }

  // ---------- 실제 문서 근거문구 찾기 ----------
  function compactMap(text) {
    var source = String(text || '');
    var compact = '', map = [];
    for (var i = 0; i < source.length; i++) {
      var ch = normalizeChars(source.charAt(i));
      if (/[0-9A-Za-z가-힣]/.test(ch)) {
        compact += ch.toLowerCase();
        map.push(i);
      }
    }
    return { source: source, compact: compact, map: map };
  }

  function evidenceContext(source, start, end) {
    var ls = source.lastIndexOf('\n', start - 1) + 1;
    var le = source.indexOf('\n', end);
    if (le < 0) le = source.length;
    if (le - ls > 190) {
      ls = Math.max(0, start - 70);
      le = Math.min(source.length, end + 90);
    }
    return cleanText((ls > 0 ? '…' : '') + source.slice(ls, le) + (le < source.length ? '…' : ''));
  }

  function findEvidence(text, candidates) {
    var source = String(text || '');
    var list = Array.isArray(candidates) ? candidates.slice() : [candidates];
    list = list.filter(function (v) { return v !== null && v !== undefined && String(v).trim() !== ''; });
    if (!source || !list.length) return { found: false, matched: '', context: '' };

    // 사람이 보는 원문 그대로의 일치를 먼저 찾는다(영문은 대소문자 무시).
    var lower = normalizeChars(source).toLowerCase();
    for (var i = 0; i < list.length; i++) {
      var q = normalizeChars(String(list[i]).trim());
      if (!q) continue;
      var at = lower.indexOf(q.toLowerCase());
      if (at >= 0) {
        return { found: true, matched: source.slice(at, at + q.length), context: evidenceContext(source, at, at + q.length), candidate: list[i] };
      }
    }

    // 공백·점·하이픈·괄호 등이 달라도 찾고, compact 위치를 원문 위치로 되돌린다.
    var cm = compactMap(source);
    var normalized = list.map(function (v) { return { raw: v, clean: compactText(v) }; })
      .filter(function (x) { return x.clean.length >= 2; })
      .sort(function (a, b) { return b.clean.length - a.clean.length; });
    for (var j = 0; j < normalized.length; j++) {
      var idx = cm.compact.indexOf(normalized[j].clean);
      if (idx >= 0 && cm.map[idx] !== undefined && cm.map[idx + normalized[j].clean.length - 1] !== undefined) {
        var st = cm.map[idx], en = cm.map[idx + normalized[j].clean.length - 1] + 1;
        return { found: true, matched: source.slice(st, en), context: evidenceContext(source, st, en), candidate: normalized[j].raw };
      }
    }
    return { found: false, matched: '', context: '' };
  }

  function findPartialEvidence(text, value, minLen) {
    var tokens = normalizeChars(value || '').split(/[^0-9A-Za-z가-힣]+/)
      .filter(function (w) { return w.length >= (minLen || 3); })
      .sort(function (a, b) { return b.length - a.length; });
    var seen = {}, contexts = [];
    for (var i = 0; i < tokens.length && contexts.length < 2; i++) {
      var ev = findEvidence(text, tokens[i]);
      if (ev.found && !seen[ev.context]) { seen[ev.context] = 1; contexts.push(ev.context); }
    }
    return contexts.length ? { found: true, matched: '', context: contexts.join(' / '), partial: true } : { found: false, matched: '', context: '' };
  }

  function findRegexEvidence(text, re) {
    var source = String(text || '');
    if (!source) return { found: false, matched: '', context: '' };
    try {
      re.lastIndex = 0;
      var m = re.exec(source);
      re.lastIndex = 0;
      if (!m) return { found: false, matched: '', context: '' };
      return { found: true, matched: m[0], context: evidenceContext(source, m.index, m.index + m[0].length) };
    } catch (e) { return { found: false, matched: '', context: '' }; }
  }

  function evidenceText(ev, notFound) {
    return ev && ev.found ? ('“' + clipText(ev.context || ev.matched, 170) + '”') : (notFound || '첨부문서에서 미발견');
  }

  function evidenceForField(text, f) {
    if (!f || !f.value) return { found: false, matched: '', context: '' };
    var candidates = [f.value];
    if (f.isDate) candidates = dateForms(f.value);
    if (f.isMoney) {
      var digits = String(f.value).replace(/[^0-9]/g, '');
      if (digits) candidates.push(digits);
    }
    var ev = findEvidence(text, candidates);
    if (!ev.found && f.isLongText) ev = findPartialEvidence(text, f.value, 3);
    return ev;
  }

  // ---------- 하이라이트 ----------
  function matchSetBuilder() {
    var set = [], seen = {};
    return {
      add: function (val, label, opts) {
        if (!val) return;
        var v = String(val).trim();
        if (v.length < 2) return;
        var key = label + '|' + v.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        set.push({
          original: v, clean: compactText(v), label: label,
          isMoney: !!(opts && opts.isMoney)
        });
      },
      addDates: function (val, label) {
        var self = this;
        if (!val) return;
        dateForms(val).forEach(function (f) { self.add(f, label); });
      },
      addWords: function (val, label, minLen) {
        var self = this;
        if (!val) return;
        String(val).split(/\s+/).forEach(function (w) {
          var ww = w.replace(/[^가-힣A-Za-z0-9]/g, '');
          if (ww.length >= (minLen || 3)) self.add(ww, label);
        });
      },
      get: function () { return set; }
    };
  }

  function sortedHighlightNeedles(matchSet) {
    var seen = {};
    return (matchSet || []).map(function (m) { return { clean: m.clean || compactText(m.original), label: m.label || '' }; })
      .filter(function (m) {
        if (!m.clean || m.clean.length < 3 || seen[m.clean]) return false;
        seen[m.clean] = 1; return true;
      }).sort(function (a, b) { return b.clean.length - a.clean.length; });
  }

  // pdf.js는 한글 한 단어도 여러 text item으로 나눌 수 있다.
  // 같은 줄의 item을 x좌표 순으로 다시 결합한 뒤 compact 문자열에서 찾고, 해당 item들로 역매핑한다.
  function buildPdfHighlightMap(items, matchSet) {
    var lines = [], needles = sortedHighlightNeedles(matchSet), result = new Map();
    if (!needles.length) return result;
    (items || []).forEach(function (item, index) {
      if (!item || !item.str) return;
      var y = item.transform && item.transform.length > 5 ? item.transform[5] : 0;
      var x = item.transform && item.transform.length > 4 ? item.transform[4] : index;
      var line = null;
      for (var i = 0; i < lines.length; i++) {
        if (Math.abs(lines[i].y - y) <= 2.5) { line = lines[i]; break; }
      }
      if (!line) { line = { y: y, entries: [] }; lines.push(line); }
      line.entries.push({ item: item, index: index, x: x });
    });

    lines.forEach(function (line) {
      line.entries.sort(function (a, b) { return a.x - b.x; });
      var compact = '', charToEntry = [];
      line.entries.forEach(function (entry, entryIndex) {
        var c = compactText(entry.item.str);
        for (var k = 0; k < c.length; k++) { compact += c.charAt(k); charToEntry.push(entryIndex); }
      });
      needles.forEach(function (needle) {
        var from = 0, at;
        while ((at = compact.indexOf(needle.clean, from)) >= 0) {
          var end = at + needle.clean.length;
          var touched = {};
          for (var p = at; p < end; p++) touched[charToEntry[p]] = 1;
          Object.keys(touched).forEach(function (ei) {
            var ent = line.entries[Number(ei)];
            if (!ent) return;
            var labels = result.get(ent.item) || [];
            if (labels.indexOf(needle.label) < 0) labels.push(needle.label);
            result.set(ent.item, labels);
          });
          from = at + Math.max(1, needle.clean.length);
        }
      });
    });
    return result;
  }

  async function renderPdfPages(pdf, container, matchValues) {
    var containerWidth = Math.max(320, container.clientWidth - 16);
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var vp0 = page.getViewport({ scale: 1 });
      var scale = containerWidth / vp0.width;
      var vp = page.getViewport({ scale: scale });

      var pageBox = document.createElement('div');
      pageBox.style.cssText = 'position:relative;margin-bottom:8px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
      var canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      canvas.style.cssText = 'display:block;width:100%;';
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      pageBox.appendChild(canvas);

      if (matchValues && matchValues.length) {
        var tc = await page.getTextContent();
        var hitMap = buildPdfHighlightMap(tc.items, matchValues);
        tc.items.forEach(function (item) {
          var labels = hitMap.get(item);
          if (!labels || !labels.length) return;
          var tx = combineTransform(vp.transform, item.transform);
          var fh = Math.hypot(tx[2], tx[3]);
          var hl = document.createElement('div');
          hl.style.cssText = 'position:absolute;pointer-events:none;border-radius:2px;background:rgba(255,235,59,0.42);border:1px solid rgba(249,168,37,0.75);box-sizing:border-box;';
          hl.style.left = (tx[4] / canvas.width * 100) + '%';
          hl.style.top = ((tx[5] - fh) / canvas.height * 100) + '%';
          hl.style.width = Math.max(0.15, item.width * scale / canvas.width * 100) + '%';
          hl.style.height = Math.max(0.2, fh * 1.25 / canvas.height * 100) + '%';
          hl.title = labels.join(', ');
          pageBox.appendChild(hl);
        });
      }

      container.appendChild(pageBox);
      if (pdf.numPages > 1) {
        var pn = document.createElement('div');
        pn.style.cssText = 'text-align:center;color:#fff;font-size:11px;padding:2px;';
        pn.textContent = i + ' / ' + pdf.numPages;
        container.appendChild(pn);
      }
    }
  }

  function highlightHtmlText(root, matchSet) {
    var needles = sortedHighlightNeedles(matchSet);
    if (!root || !needles.length) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && n.nodeValue.trim()) nodes.push(n);
    }
    var compact = '', charMap = [];
    nodes.forEach(function (node, ni) {
      var value = node.nodeValue || '';
      for (var i = 0; i < value.length; i++) {
        var ch = normalizeChars(value.charAt(i));
        if (/[0-9A-Za-z가-힣]/.test(ch)) { compact += ch.toLowerCase(); charMap.push({ ni: ni, off: i }); }
      }
    });
    var intervals = nodes.map(function () { return []; });
    needles.forEach(function (needle) {
      var from = 0, at;
      while ((at = compact.indexOf(needle.clean, from)) >= 0) {
        var end = at + needle.clean.length;
        var byNode = {};
        for (var p = at; p < end; p++) {
          var mp = charMap[p]; if (!mp) continue;
          if (!byNode[mp.ni]) byNode[mp.ni] = [mp.off, mp.off + 1];
          else byNode[mp.ni][1] = mp.off + 1;
        }
        Object.keys(byNode).forEach(function (k) { intervals[Number(k)].push(byNode[k]); });
        from = at + Math.max(1, needle.clean.length);
      }
    });
    intervals.forEach(function (arr, ni) {
      if (!arr.length) return;
      arr.sort(function (a, b) { return a[0] - b[0]; });
      var merged = [];
      arr.forEach(function (r) {
        if (!merged.length || r[0] > merged[merged.length - 1][1]) merged.push(r.slice());
        else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
      });
      var base = nodes[ni];
      for (var j = merged.length - 1; j >= 0; j--) {
        if (!base.parentNode) break;
        var st = merged[j][0], en = merged[j][1];
        if (en > base.nodeValue.length) en = base.nodeValue.length;
        var after = base.splitText(en);
        var mid = base.splitText(st);
        var mark = document.createElement('mark');
        mark.style.cssText = 'background:#FFEB3B;color:inherit;padding:0 1px;border-radius:2px;';
        mid.parentNode.insertBefore(mark, after);
        mark.appendChild(mid);
      }
    });
  }

  function rhwpCssLength(v) {
    if (!v) return NaN;
    var m = String(v).trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))(px|pt|pc|mm|cm|in)?$/i);
    if (!m) return NaN;
    var n = Number(m[1]), u = (m[2] || 'px').toLowerCase();
    var k = { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };
    return n * k[u];
  }

  function rhwpSvgSize(svg) {
    try {
      var xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
      var root = xml.documentElement;
      if (!root || root.localName !== 'svg') throw new Error('SVG 아님');
      var vb = (root.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
      if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return { width: vb[2], height: vb[3] };
      var w = rhwpCssLength(root.getAttribute('width')), h = rhwpCssLength(root.getAttribute('height'));
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h };
    } catch (e) {}
    return { width: 794, height: 1123 };
  }

  function highlightRhwpSvg(svg, matchSet) {
    var needles = sortedHighlightNeedles(matchSet);
    if (!needles.length) return svg;
    try {
      var xml = new DOMParser().parseFromString(String(svg || ''), 'image/svg+xml');
      var root = xml.documentElement;
      if (!root || root.localName !== 'svg') return svg;
      var els = root.querySelectorAll('text, tspan');
      Array.prototype.forEach.call(els, function (el) {
        var c = compactText(el.textContent || '');
        if (!c) return;
        var hit = needles.some(function (n) { return c.indexOf(n.clean) >= 0 || (c.length >= 3 && n.clean.indexOf(c) >= 0); });
        if (hit) {
          var old = el.getAttribute('style') || '';
          el.setAttribute('style', old + ';paint-order:stroke fill;stroke:#FDD835;stroke-width:3px;stroke-opacity:.72;stroke-linejoin:round;');
        }
      });
      return new XMLSerializer().serializeToString(root);
    } catch (e) { return svg; }
  }

  function rhwpSafeSvgDoc(svg, width, height, scale, matchSet) {
    svg = highlightRhwpSvg(svg, matchSet);
    return '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:; style-src \'unsafe-inline\'; font-src data:; object-src \'none\'; frame-src \'none\'; base-uri \'none\'; form-action \'none\'">' +
      '<style>html,body{margin:0;padding:0;width:' + (width * scale) + 'px;height:' + (height * scale) + 'px;overflow:hidden;background:#fff}' +
      '#p{width:' + width + 'px;height:' + height + 'px;transform:scale(' + scale + ');transform-origin:0 0;line-height:normal}' +
      '#p>svg{display:block!important;width:' + width + 'px!important;height:' + height + 'px!important;max-width:none!important;max-height:none!important}</style>' +
      '</head><body><div id="p">' + svg + '</div></body></html>';
  }

  async function renderDocxDocument(doc, container, matchSet) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'padding:20px 0;min-height:100%;';
    var box = document.createElement('div');
    box.style.cssText = 'max-width:820px;width:90%;margin:0 auto;background:#fff;padding:40px 48px;box-shadow:0 2px 8px rgba(0,0,0,.25);font-family:Malgun Gothic,sans-serif;font-size:14px;line-height:1.8;color:#333;box-sizing:border-box;';
    box.innerHTML = doc.html || '';
    highlightHtmlText(box, matchSet);
    wrap.appendChild(box); container.appendChild(wrap);
  }

  async function renderRhwpDocument(doc, container, matchSet) {
    var maxWidth = Math.max(320, container.clientWidth - 24);
    for (var i = 0; i < (doc.pages || []).length; i++) {
      var svg = doc.pages[i];
      var sz = rhwpSvgSize(svg);
      var scale = Math.min(1.25, maxWidth / sz.width);
      if (!Number.isFinite(scale) || scale <= 0) scale = 1;
      var pageBox = document.createElement('div');
      pageBox.style.cssText = 'margin:0 auto 10px auto;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.35);line-height:0;width:' + Math.ceil(sz.width * scale) + 'px;';
      var frame = document.createElement('iframe');
      frame.setAttribute('sandbox', '');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('title', doc.kind + ' ' + (i + 1) + '쪽');
      frame.style.cssText = 'display:block;border:0;background:#fff;width:' + Math.ceil(sz.width * scale) + 'px;height:' + Math.ceil(sz.height * scale) + 'px;max-width:none;';
      frame.srcdoc = rhwpSafeSvgDoc(svg, sz.width, sz.height, scale, matchSet);
      pageBox.appendChild(frame); container.appendChild(pageBox);
      if (doc.pageCount > 1) {
        var pn = document.createElement('div');
        pn.style.cssText = 'color:#fff;font-size:11px;padding:1px 0 8px;text-align:center;';
        pn.textContent = (i + 1) + ' / ' + doc.pageCount;
        container.appendChild(pn);
      }
      if (i % 2 === 1) await new Promise(function (resolve) { requestAnimationFrame(resolve); });
    }
  }

  async function renderAttachmentDocument(doc, container, matchSet) {
    if (doc.kind === 'PDF') return renderPdfPages(doc.pdf, container, matchSet);
    if (doc.kind === 'DOCX') return renderDocxDocument(doc, container, matchSet);
    if (doc.kind === 'HWP' || doc.kind === 'HWPX') return renderRhwpDocument(doc, container, matchSet);
    throw new Error('렌더링할 수 없는 문서 형식: ' + doc.kind);
  }

  // ---------- 오버레이 ----------
  function openOverlay(opt) {
    removeAll();
    var overlay = document.createElement('div');
    overlay.id = 'krissComparePanel';
    overlay.setAttribute('data-kriss-ui', '1');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#fff;z-index:99999;display:flex;flex-direction:column;';

    var header = document.createElement('div');
    header.style.cssText = 'background:' + opt.color + ';color:#fff;padding:6px 16px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;';
    var titleEl = document.createElement('span');
    titleEl.style.cssText = 'font-weight:bold;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:12px;';
    titleEl.textContent = opt.title || '';
    var right = document.createElement('div');
    right.style.cssText = 'flex-shrink:0;';
    var hint = document.createElement('span');
    hint.style.cssText = 'font-size:11px;margin-right:10px;opacity:0.85;';
    hint.textContent = 'ESC 닫기';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button'; closeBtn.textContent = 'X 닫기';
    closeBtn.style.cssText = 'background:#fff;color:' + opt.color + ';border:none;padding:4px 14px;cursor:pointer;font-weight:bold;border-radius:4px;';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    right.appendChild(hint); right.appendChild(closeBtn);
    header.appendChild(titleEl); header.appendChild(right);
    overlay.appendChild(header);

    var body = document.createElement('div');
    body.style.cssText = 'flex:1;display:flex;overflow:hidden;';
    overlay.appendChild(body);
    document.body.appendChild(overlay);

    var escH = function (e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escH); }
    };
    document.addEventListener('keydown', escH);
    return { overlay: overlay, body: body };
  }

  // 좌: 첨부문서 렌더+하이라이트 / 우: 대조 결과
  function openSplitView(opt) {
    var o = openOverlay({ title: opt.title, color: opt.color });
    var left = document.createElement('div');
    left.style.cssText = 'width:' + (opt.leftWidth || '57%') + ';height:100%;overflow-y:auto;background:#888;padding:8px;box-sizing:border-box;';
    var right = document.createElement('div');
    right.style.cssText = 'flex:1;height:100%;overflow-y:auto;background:#fafafa;border-left:2px solid ' + opt.color + ';';
    o.body.appendChild(left); o.body.appendChild(right);
    right.appendChild(opt.rightNode);
    renderAttachmentDocument(opt.doc, left, opt.matchSet).catch(function (e) {
      console.error(TAG, '문서 렌더 실패:', e);
      var msg = document.createElement('div');
      msg.style.cssText = 'margin:20px;padding:14px;background:#fff;color:#b71c1c;border-radius:6px;';
      msg.textContent = '문서 표시 실패: ' + e.message + ' (오른쪽 대조 결과는 계속 사용할 수 있습니다.)';
      left.appendChild(msg);
    });
    return o;
  }

  // ---------- 결과표 (4개 화면이 공유하는 단일 렌더러) ----------
  var STATUS = {
    match:             { icon: 'O', color: '#4CAF50', bg: '#f0fff0', kind: 'ok' },
    partial:           { icon: '△', color: '#F9A825', bg: '#fffcf0', kind: 'warn' },
    derived:           { icon: '≈', color: '#7B1FA2', bg: '#f8f0ff', kind: 'warn' },
    mismatch:          { icon: 'X', color: '#F44336', bg: '#fff0f0', kind: 'bad' },
    needs_mapping:     { icon: '↔', color: '#FF9800', bg: '#fff8e1', kind: 'warn' },
    not_extracted:     { icon: '?', color: '#607D8B', bg: '#fffde7', kind: 'etc' },
    not_present:       { icon: 'Ø', color: '#607D8B', bg: '#fafafa', kind: 'etc' },
    external_required: { icon: 'i', color: '#2196F3', bg: '#f5f5ff', kind: 'etc' },
    info:              { icon: 'i', color: '#2196F3', bg: '#f5f5ff', kind: 'etc' },
    empty:             { icon: '-', color: '#999',    bg: '#fafafa', kind: 'etc' }
  };

  // opt = { color, groupBg, checks:[{group,label,tagA,tagB,a,b,status,note}], legendHtml, copyHeader, extraButtons }
  function buildResultPanel(opt) {
    var container = document.createElement('div');
    var checks = opt.checks || [];
    var color = opt.color || '#1565C0';
    var groupBg = opt.groupBg || '#E3F2FD';

    var cnt = { ok: 0, warn: 0, bad: 0, etc: 0 };
    checks.forEach(function (c) {
      var st = STATUS[c.status] || STATUS.empty;
      cnt[st.kind]++;
    });

    var summary = document.createElement('div');
    summary.style.cssText = 'padding:10px 14px;background:' + groupBg + ';font-size:13px;font-weight:bold;border-bottom:2px solid ' + color + ';';
    summary.innerHTML = '대조 결과: <span style="color:#4CAF50">일치 ' + cnt.ok +
      '</span> / <span style="color:#F9A825">부분·파생 ' + cnt.warn +
      '</span> / <span style="color:#F44336">불일치 ' + cnt.bad +
      '</span> / <span style="color:#607D8B">참고 ' + cnt.etc + '</span>';
    container.appendChild(summary);

    var legend = document.createElement('div');
    legend.style.cssText = 'padding:6px 14px;background:#fff3e0;font-size:11px;border-bottom:1px solid #ddd;line-height:1.7;';
    legend.innerHTML = opt.legendHtml ||
      ('<b style="color:#4CAF50">O</b> 일치 <b style="color:#F9A825">△</b> 부분일치 ' +
       '<b style="color:#7B1FA2">≈</b> 파생값 <b style="color:#F44336">X</b> 불일치 ' +
       '<b style="color:#FF9800">↔</b> 매핑 필요 <b style="color:#607D8B">?</b> 추출 안 됨 ' +
       '<b style="color:#2196F3">i</b> 참고 <span style="color:#999">-</span> 빈값');
    container.appendChild(legend);

    var table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
    var currentGroup = '';
    checks.forEach(function (c) {
      if (c.group && c.group !== currentGroup) {
        currentGroup = c.group;
        var gr = document.createElement('tr'), gd = document.createElement('td');
        gd.colSpan = 4;
        gd.style.cssText = 'background:' + groupBg + ';padding:6px 10px;font-weight:bold;font-size:12px;color:' + color + ';';
        gd.textContent = currentGroup;
        gr.appendChild(gd); table.appendChild(gr);
      }
      var st = STATUS[c.status] || STATUS.empty;
      var tr = document.createElement('tr');
      tr.style.background = st.bg;

      var tdL = document.createElement('td');
      tdL.style.cssText = 'padding:4px 8px;border-bottom:1px solid #eee;color:#666;width:17%;vertical-align:top;';
      var warn = (c.status === 'mismatch' || c.status === 'partial' || c.status === 'needs_mapping');
      tdL.textContent = c.label + (c.note && warn ? ' ⚠' : '');
      if (c.note) tdL.title = c.note;

      var tdA = document.createElement('td');
      tdA.style.cssText = 'padding:4px 8px;border-bottom:1px solid #eee;width:31%;word-break:break-all;vertical-align:top;line-height:1.45;';
      tdA.innerHTML = '<span style="color:#1565C0;font-size:10px">' + escHtml(c.tagA || '시스템') + '</span><br>' + escHtml(c.a || '-');
      if (c.a) {
        tdA.style.cursor = 'pointer';
        tdA.title = '클릭하면 복사';
        (function (v, td) {
          td.addEventListener('click', function () {
            copyText(v);
            var old = td.style.background;
            td.style.background = '#C8E6C9';
            setTimeout(function () { td.style.background = old; }, 400);
          });
        })(c.a, tdA);
      }

      var tdB = document.createElement('td');
      tdB.style.cssText = 'padding:4px 8px;border-bottom:1px solid #eee;width:35%;word-break:break-all;vertical-align:top;line-height:1.45;';
      tdB.innerHTML = '<span style="color:#E65100;font-size:10px">' + escHtml(c.tagB || 'PDF') + '</span><br>' + escHtml(c.b || '-');

      var tdS = document.createElement('td');
      tdS.style.cssText = 'padding:4px 6px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;font-size:14px;width:28px;vertical-align:top;color:' + st.color + ';';
      tdS.textContent = st.icon;

      tr.appendChild(tdL); tr.appendChild(tdA); tr.appendChild(tdB); tr.appendChild(tdS);
      table.appendChild(tr);
    });
    container.appendChild(table);

    var btnDiv = document.createElement('div');
    btnDiv.style.cssText = 'padding:10px 14px;border-top:2px solid #e0e0e0;display:flex;gap:6px;flex-wrap:wrap;';
    var cpAll = document.createElement('button');
    cpAll.type = 'button'; cpAll.textContent = '전체 복사';
    cpAll.style.cssText = 'flex:1;background:' + color + ';color:#fff;border:none;padding:6px 10px;cursor:pointer;border-radius:4px;font-size:12px;font-weight:bold;';
    cpAll.addEventListener('click', function () {
      var rows = checks.map(function (c) {
        return [c.group || '', c.label, c.a || '-', c.b || '-', c.status].join('\t');
      }).join('\n');
      copyText((opt.copyHeader || '그룹\t항목\t시스템값\t첨부문서\t결과') + '\n' + rows);
      cpAll.textContent = '복사 완료';
      setTimeout(function () { cpAll.textContent = '전체 복사'; }, 1000);
    });
    btnDiv.appendChild(cpAll);
    (opt.extraButtons || []).forEach(function (b) {
      var e = document.createElement('button');
      e.type = 'button'; e.textContent = b.text;
      e.style.cssText = 'background:' + b.bg + ';color:#fff;border:none;padding:6px 10px;cursor:pointer;border-radius:4px;font-size:12px;';
      e.addEventListener('click', function () {
        b.onClick();
        var t = e.textContent;
        e.textContent = '완료';
        setTimeout(function () { e.textContent = t; }, 1000);
      });
      btnDiv.appendChild(e);
    });
    container.appendChild(btnDiv);
    return container;
  }

  // ---------- 첨부파일 대조 / 보기 버튼 부착 ----------
  // 대조 규칙이 있으면 기존처럼 "대조"만 표시하고,
  // 대조 규칙이 없는 화면에서는 같은 색상의 "보기"를 표시한다.
  // "보기"는 파일을 저장하지 않고 현재 페이지의 전체화면 모달에서만 렌더링한다.
  async function startAttachmentView(urls, fileName) {
    try {
      var r = await loadAttachmentFromLink(urls, fileName, '첨부문서');
      var o = openOverlay({
        title: '보기 | ' + r.kind + ' | ' + (fileName || ''),
        color: '#1565C0'
      });
      o.body.style.cssText = 'flex:1;overflow-y:auto;background:#888;padding:8px;box-sizing:border-box;display:block;';

      var viewer = document.createElement('div');
      viewer.style.cssText = 'width:100%;min-height:100%;box-sizing:border-box;';
      o.body.appendChild(viewer);
      await renderAttachmentDocument(r, viewer, []);
    } catch (e) {
      console.error(TAG, '첨부문서 보기 실패:', e);
      showMsg('첨부문서 보기 실패: ' + e.message);
    }
  }

  function attachFileButtons(opt) {
    var scan = function () {
      if (KILLED) return;
      var links = document.querySelectorAll(opt.selectors);
      if (!links.length) return;
      Array.prototype.forEach.call(links, function (a) {
        if (a.parentNode.querySelector('.kriss-fbtn')) return;
        var fileName = (a.getAttribute('data-orginl-file-nm') || a.textContent).trim();
        var ext = fileExt(fileName);
        var isPdf = (ext === 'pdf'), isDocx = (ext === 'docx'), isHwp = (ext === 'hwp' || ext === 'hwpx');
        if (!isPdf && !isDocx && !isHwp) return;

        var hasCompare = !!(opt.compareLabel && opt.onCompare);
        var buttonLabel = hasCompare ? opt.compareLabel : '보기';
        var urls = urlsFromLink(a, opt.fallbackProgrmId, opt.fallbackDocId ? opt.fallbackDocId() : '');
        var sizeSpan = a.nextElementSibling;
        var anchor = (sizeSpan && sizeSpan.classList && sizeSpan.classList.contains('label-file-size')) ? sizeSpan : a;
        var bc = mkInlineBtn(buttonLabel, '#2196F3', function (e) {
          e.preventDefault(); e.stopPropagation();
          if (isPdf && !loadCachedPdfJs()) { showMsg('pdf.js가 등록되지 않았습니다. 뷰어 설정을 먼저 진행하세요.'); return; }
          if (isDocx && !loadCachedMammoth()) { showMsg('mammoth.js가 등록되지 않았습니다. 뷰어 설정을 먼저 진행하세요.'); return; }
          if (isHwp && !hasRhwpLib()) { showMsg('rhwp.js + rhwp_bg.wasm이 등록되지 않았습니다. 뷰어 설정을 먼저 진행하세요.'); return; }

          if (hasCompare) opt.onCompare(urls, fileName);
          else startAttachmentView(urls, fileName);
        });
        anchor.parentNode.insertBefore(bc, anchor.nextSibling);
      });
    };
    scan();
    var t = null;
    new MutationObserver(function () {
      if (t) clearTimeout(t);
      t = setTimeout(scan, 400);
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ---------- 다운로드 시 관리번호 접두 ----------
  function setupDownloadIntercept(prefixFn) {
    if (window.__krissDlIntercept) return;
    window.__krissDlIntercept = true;
    var bind = function () {
      if (KILLED) return;
      var cnt = 0;
      Array.prototype.forEach.call(document.querySelectorAll('a.download_file'), function (a) {
        if (a.getAttribute('data-kriss-dl') === '1') return;
        a.setAttribute('data-kriss-dl', '1');
        a.addEventListener('click', function (e) {
          if (KILLED) return;   // 원상복구 후에는 원래 다운로드 동작으로 되돌린다
          e.preventDefault(); e.stopPropagation();
          downloadWithPrefix(a, prefixFn);
        }, true);
        cnt++;
      });
      if (cnt) console.log(TAG, '다운로드 링크 바인딩:', cnt, '건');
    };
    bind();
    var t = null;
    new MutationObserver(function () {
      if (t) clearTimeout(t);
      t = setTimeout(bind, 300);
    }).observe(document.body, { childList: true, subtree: true });
  }

  async function downloadWithPrefix(a, prefixFn) {
    var origName = (a.getAttribute('data-orginl-file-nm') || a.textContent).trim();
    var prefix = '';
    try { prefix = prefixFn ? (prefixFn() || '') : ''; } catch (e) {}
    var finalName = (prefix + origName).replace(/[\\/:*?"<>|]/g, '_');
    showMsg('다운로드 중: ' + finalName);
    try {
      var buffer = await smartFetch(urlsFromLink(a, '', ''));
      var blobUrl = URL.createObjectURL(new Blob([buffer]));
      var tmp = document.createElement('a');
      tmp.href = blobUrl; tmp.download = finalName;
      document.body.appendChild(tmp); tmp.click(); tmp.remove();
      setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 1000);
      console.log(TAG, '다운로드 완료:', finalName);
      removeAll();
    } catch (e) {
      console.error(TAG, '다운로드 실패:', e);
      showMsg('다운로드 실패: ' + e.message);
    }
  }
  // ============================================================
  // [공통 코어 끝]
  // ============================================================

  // ============================================================
  // 화면 판별 (URL 우선, 문서 §7.1 팝업 계약 기준)
  // ============================================================
  var U = location.href;
  var SCREEN =
    /S_PMS_03015030|B_RES00015/.test(U) ? 'exp'      : // 비용청구서 상세·검토
    /S_PMS_03012020/.test(U)            ? 'aply'     : // 출원신청
    /S_PMS_03013020/.test(U)            ? 'regDecsn' : // 등록결정사항 검토
    /S_PMS_03013030/.test(U)            ? 'regCmpl'  : // 등록완료 보고
    /S_PMS_03019020/.test(U)            ? 'hub'      : // 통합허브
    /S_PMS_03014020|S_PMS_03014030|B_RES00012/.test(U) ? 'task' :
    /S_PMS_03011010/.test(U)            ? 'pps'      : // 선행조사 상세
    /S_PMS_03015040/.test(U)            ? 'expAct'   : // 지출발의
    /B_RES00004/.test(U)                ? 'aplyRept' : // 발명신고서
    '';

  var SCREEN_LABEL = {
    exp: '비용청구서', aply: '출원신청', regDecsn: '등록결정사항 검토', regCmpl: '등록완료 보고',
    hub: '통합허브', task: '업무요청', pps: '선행조사', expAct: '지출발의', aplyRept: '발명신고서'
  };

  function mgmtNoPrefix() {
    var no = (getText('#intellMngNo') || getText('#intellMgmtNo')).replace(/[\\/:*?"<>|]/g, '').trim();
    return no ? no + '_' : '';
  }

  function boot() {
    if (!SCREEN) {
      // 화면번호가 환경마다 다를 수 있어, 등록완료 화면은 DOM 특징으로 한 번 더 확인한다.
      waitForRegCmplDom();
      return;
    }
    console.log(TAG, 'v' + VER, '|', SCREEN_LABEL[SCREEN], '|', location.pathname);
    ensureViewerSetupButton();
    setupDownloadIntercept(mgmtNoPrefix);
    initScreen(SCREEN);
  }

  function initScreen(s) {
    if (s === 'exp') {
      waitFor(function () { return !!getText('#intellMngNo'); }, function () {
        attachFileButtons({
          selectors: '#uploader1 a.download_file, .uploader a.download_file',
          compareLabel: '대조', onCompare: startExpCompare, fallbackProgrmId: 'iprs.exp'
        });
      });
    } else if (s === 'aply') {
      attachFileButtons({
        selectors: '#uploader3 a.download_file, #uploader4 a.download_file',
        compareLabel: '대조', onCompare: startAplyCompare
      });
      waitForAplyTitle();
    } else if (s === 'regDecsn') {
      attachFileButtons({
        selectors: '#uploader1 a.download_file',
        compareLabel: '대조', onCompare: startRegDecsnCompare,
        fallbackProgrmId: 'iprs.reg.doc1', fallbackDocId: function () { return getRegDecsnFields().rqstNo; }
      });
    } else if (s === 'regCmpl') {
      initRegCmpl();
    } else {
      // 대조 규칙이 정의되지 않은 화면: "보기" 버튼 + 다운로드 접두 제공
      attachFileButtons({ selectors: '.uploader a.download_file, a.download_file', compareLabel: null });
    }
  }

  function waitFor(cond, done, maxTicks) {
    var n = 0, t = setInterval(function () {
      n++;
      if (cond() || n >= (maxTicks || 60)) { clearInterval(t); done(); }
    }, 500);
  }

  // ============================================================
  // 1) 비용청구서 (S_PMS_03015030 / B_RES00015)
  // ============================================================
  function getExpFields() {
    var expCls = getText('#expClsNm') || getDropdownText('#expCls') || getText('#chrgTypNm') ||
      getDropdownText('#chrgTyp') || getText('#intellClsNm') || '';
    if (!expCls) {
      var labels = document.querySelectorAll('th, label, dt');
      for (var i = 0; i < labels.length; i++) {
        if (/^\s*분류\s*$/.test(labels[i].textContent)) {
          var next = labels[i].nextElementSibling ||
            (labels[i].parentElement && labels[i].parentElement.querySelector('td, dd, span'));
          if (next) { expCls = (next.textContent || '').trim(); break; }
        }
      }
    }
    return [
      { group: '기본정보', label: '분류', value: expCls },
      { group: '기본정보', label: '관리번호', value: getText('#intellMngNo') },
      { group: '기본정보', label: '신청번호', value: getText('#intellRqstNo') },
      { group: '기본정보', label: '지재권종류', value: getText('#ivenTypNm') },
      { group: '기본정보', label: '발명의명칭(국문)', value: getText('#ivenNm'), isLongText: true },
      { group: '기본정보', label: '발명의명칭(영문)', value: getText('#ivenEngNm'), isLongText: true },
      { group: '기본정보', label: '특허(저작)권자', value: getText('#owrInfo') },
      { group: '기본정보', label: '출원국가', value: getText('#aplyNtnNm') },
      { group: '기본정보', label: '출원번호', value: getText('#intellAplyNo') },
      { group: '기본정보', label: '출원일자', value: getText('#intellAplyDt'), isDate: true },
      { group: '기본정보', label: '등록번호', value: getText('#intellRegNo') },
      { group: '기본정보', label: '등록일자', value: getText('#intellRegDt'), isDate: true },
      { group: '기본정보', label: '주발명자', value: getText('#mainIvenInfo') },
      { group: '기본정보', label: '발명자', value: getText('#ivenInfo') },
      { group: '청구내용', label: '특허사무소', value: getText('#plfNm') },
      { group: '청구내용', label: '특허 관리번호', value: getText('#plfMgmtRqstNo') },
      { group: '청구내용', label: '청구서 번호', value: getText('#plfRqstNo') },
      { group: '청구내용', label: '대리인수수료(국내)', value: getElVal('#expIn'), isMoney: true },
      { group: '청구내용', label: '부가세(국내)', value: getElVal('#vatIn'), isMoney: true },
      { group: '청구내용', label: '관납료(국내)', value: getElVal('#ofclFeeIn'), isMoney: true },
      { group: '청구내용', label: '대리인수수료(국외)', value: getElVal('#expOut'), isMoney: true },
      { group: '청구내용', label: '해외송금수수료', value: getElVal('#vatOut'), isMoney: true },
      { group: '청구내용', label: '관납료(국외)', value: getElVal('#ofclFeeOut'), isMoney: true },
      { group: '청구내용', label: '기타비용', value: getElVal('#etcFee'), isMoney: true },
      { group: '청구내용', label: '비용합계', value: getText('#totlExp'), isMoney: true },
      { group: '청구내용', label: '세금계산서 발행여부', value: getText('#taxbilIsuClsNm') },
      { group: '청구내용', label: '세금계산서 승인번호', value: getText('#taxbilIsuIdBf') }
    ];
  }

  function detectExpenseClass(pdfText) {
    var found = [];
    if (/등록료|등록결정|등록비|registration\s*fee|grant\s*fee|issue\s*fee/i.test(pdfText)) found.push('등록');
    if (/출원료|출원비|filing\s*fee|application\s*fee/i.test(pdfText)) found.push('출원');
    if (/office\s*action|거절이유|의견서|보정서|중간사건|통지서/i.test(pdfText)) found.push('중간사건(OA)');
    if (/심판|심결|심판청구|appeal|trial/i.test(pdfText)) found.push('심판');
    if (/연차료|연차|유지료|annuity|maintenance|renewal/i.test(pdfText)) found.push('연차료');
    if (/이전|양도|transfer|assignment/i.test(pdfText)) found.push('이전');
    return found;
  }

  function expMatchStatus(f, pdfNorm, pdfClean, detected) {
    if (!f.value || !f.value.trim()) return 'empty';
    var v = f.value.trim();
    if (f.isMoney && v.replace(/[^0-9]/g, '') === '0') return 'empty';

    if (f.label === '분류') {
      if (!detected.length) return 'mismatch';
      return detected.some(function (d) {
        var core = d.replace(/\(OA\)/, '');
        return v.indexOf(core) >= 0 || core.indexOf(v) >= 0;
      }) ? 'match' : 'mismatch';
    }
    if (pdfNorm.indexOf(v) >= 0) return 'match';
    var vc = v.replace(/[\s,\-]/g, '');
    if (vc.length >= 4 && pdfClean.indexOf(vc) >= 0) return 'match';
    if (f.isDate && dateInPdf(v, compactText(pdfNorm))) return 'match';
    if (f.isMoney) {
      var n = v.replace(/[^0-9]/g, '');
      return (n && n !== '0' && pdfClean.indexOf(n) >= 0) ? 'match' : 'mismatch';
    }
    if (f.isLongText && vc.length >= 6) {
      var lo = 1, hi = vc.length, best = 0;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (pdfClean.indexOf(vc.substring(0, mid)) >= 0) { best = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      var ratio = best / vc.length;
      if (ratio >= 0.9) return 'match';
      if (ratio >= 0.5 && best >= 6) return 'partial';
      return 'mismatch';
    }
    return 'mismatch';
  }

  function buildExpMatchSet(fields) {
    var b = matchSetBuilder();
    fields.forEach(function (f) {
      if (!f.value) return;
      b.add(f.value, f.label, { isMoney: f.isMoney });
      if (f.isMoney) {
        var num = String(f.value).replace(/[^0-9]/g, '');
        if (num && num !== '0') b.add(num, f.label + '(숫자)', { isMoney: true });
      }
      if (f.isDate) b.addDates(f.value, f.label);
      if (f.isLongText) b.addWords(f.value, f.label + '(어절)', 3);
    });
    return b.get();
  }

  async function startExpCompare(urls, fileName) {
    try {
      var r = await loadAttachmentFromLink(urls, fileName, '청구서 첨부');
      var fields = getExpFields();
      var docNorm = r.text.replace(/\s+/g, ' ');
      var docClean = r.text.replace(/[\s,\-]/g, '');
      var detected = detectExpenseClass(docNorm);
      var checks = [];

      fields.forEach(function (f) {
        var status = expMatchStatus(f, docNorm, docClean, detected);
        var shown = f.isMoney && f.value ? fmtMoney(f.value) : (f.value || '');
        var ev = evidenceForField(r.text, f);
        var right;
        if (f.label === '분류') {
          var classEv = findRegexEvidence(r.text, /등록료|등록결정|등록비|registration\s*fee|grant\s*fee|issue\s*fee|출원료|출원비|filing\s*fee|application\s*fee|office\s*action|거절이유|의견서|보정서|중간사건|통지서|심판|심결|심판청구|appeal|trial|연차료|연차|유지료|annuity|maintenance|renewal|이전|양도|transfer|assignment/i);
          right = detected.length ? evidenceText(classEv, '문서 분류 키워드: ' + detected.join(', ')) : '첨부문서에서 비용 유형 키워드 미발견';
        } else if (status === 'match') right = evidenceText(ev);
        else if (status === 'partial') right = evidenceText(ev, '일부 일치 — 육안 확인');
        else if (status === 'empty') right = '시스템 값 없음 — 비교 생략';
        else right = '첨부문서에서 미발견';
        checks.push({
          group: f.group, label: f.label, tagA: '시스템', tagB: '첨부 ' + r.kind,
          a: shown, b: right, status: status,
          note: ev && ev.found ? ('실제 문서 근거: ' + (ev.context || ev.matched)) : ''
        });
      });

      var num = function (sel) { return parseInt(String(getElVal(sel) || '0').replace(/[^0-9\-]/g, ''), 10) || 0; };
      var sum = num('#expIn') + num('#expOut') + num('#vatIn') + num('#vatOut') +
        num('#ofclFeeIn') + num('#ofclFeeOut') + num('#etcFee');
      var total = parseInt(String(getText('#totlExp') || '0').replace(/[^0-9\-]/g, ''), 10) || 0;
      if (sum || total) {
        checks.push({
          group: '검산', label: '항목합 = 비용합계', tagA: '항목 합산', tagB: '비용합계 필드',
          a: fmtMoney(String(sum)), b: fmtMoney(String(total)) + (sum === total ? '' : ' · 차액 ' + fmtMoney(String(total - sum))),
          status: sum === total ? 'match' : 'mismatch',
          note: sum === total ? '' : '항목 합계와 비용합계가 다릅니다'
        });
      }

      openSplitView({
        title: '비교 Helper | ' + getText('#intellMngNo') + ' | ' + r.kind + ' | ' + clipText(getText('#ivenNm'), 40),
        color: '#1565C0', leftWidth: '60%', doc: r,
        matchSet: buildExpMatchSet(fields),
        rightNode: buildResultPanel({ color: '#1565C0', groupBg: '#E3F2FD', checks: checks })
      });
    } catch (e) {
      console.error(TAG, '청구서 대조 실패:', e);
      showMsg('청구서 대조 실패: ' + e.message);
    }
  }

  // ============================================================
  // 2) 출원신청 (S_PMS_03012020)
  // ============================================================
  function getAplyFields() {
    return {
      mngNo: getText('#intellMngNo'), rqstNo: getText('#intellRqstNo'),
      reqNameKor: getText('#ivenNm'), reqNameEng: getText('#ivenEngNm'),
      plfNameKor: getText('#aplyNm'), plfNameEng: getText('#aplyEngNm'),
      aplyNo: getText('#aplyNo'), aplyDt: getText('#aplyDt')
    };
  }

  function waitForAplyTitle() {
    var n = 0, t = setInterval(function () {
      n++;
      var plf = getText('#aplyNm');
      if (plf) { clearInterval(t); injectNameBadge('krissAplyBadge', getAplyFields().reqNameKor, getAplyFields().reqNameEng, plf, getText('#aplyEngNm'), '특허사무소'); }
      else if (n >= 30 && getText('#ivenNm')) { clearInterval(t); console.log(TAG, '특허사무소 입력값 없음 — 명칭 배지 생략'); }
      else if (n >= 60) clearInterval(t);
    }, 500);
  }

  // 신청 ↔ 특허사무소 명칭 대조 배지 (출원·등록완료 공용)
  function injectNameBadge(id, korA, engA, korB, engB, tagB) {
    if (document.getElementById(id)) return;
    var area = document.querySelector('.titlegroup3 .ft_right');
    if (!area) return;
    var korMatch = !!korB && normNameKor(korA) === normNameKor(korB);
    var engComparable = !!engA && !!engB;
    var engMatch = engComparable && normNameEng(engA) === normNameEng(engB);
    var allOk = korMatch && (!engComparable || engMatch);

    var badge = document.createElement('span');
    badge.id = id;
    badge.setAttribute('data-kriss-ui', '1');
    badge.style.cssText = 'margin-left:8px;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:bold;color:#fff;cursor:pointer;vertical-align:middle;background:' + (allOk ? '#4CAF50' : '#F44336') + ';';
    badge.textContent = '명칭대조 ' + (korMatch ? '국문 O' : '국문 X') + ' / ' +
      (!engComparable ? '영문 -' : (engMatch ? '영문 O' : '영문 X'));
    badge.title = '클릭하면 상세 비교';
    badge.addEventListener('click', function () {
      showNameDialog([
        { label: '국문', a: korA, b: korB, comparable: true, match: korMatch },
        { label: '영문', a: engA, b: engB, comparable: engComparable, match: engMatch }
      ], tagB);
    });
    area.appendChild(badge);
    console.log(TAG, '명칭 배지 삽입 | 국문:', korMatch, '| 영문:', engComparable ? engMatch : '(비교불가)');
  }

  function showNameDialog(rows, tagB) {
    removeAll();
    var modal = document.createElement('div');
    modal.id = 'krissComparePanel';
    modal.setAttribute('data-kriss-ui', '1');
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border:2px solid #1976D2;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,0.4);z-index:99999;width:660px;max-width:92vw;font-family:Malgun Gothic,sans-serif;';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:#1565C0;color:#fff;padding:12px 16px;border-radius:8px 8px 0 0;font-weight:bold;font-size:14px;display:flex;justify-content:space-between;align-items:center;';
    var h = document.createElement('span');
    h.textContent = '발명의명칭 대조 (신청 ↔ ' + tagB + ')';
    var x = document.createElement('button');
    x.type = 'button'; x.textContent = 'X';
    x.style.cssText = 'background:#fff;color:#1565C0;border:none;padding:2px 10px;border-radius:4px;cursor:pointer;font-weight:bold;';
    x.addEventListener('click', function () { modal.remove(); });
    hdr.appendChild(h); hdr.appendChild(x); modal.appendChild(hdr);

    var body = document.createElement('div');
    body.style.cssText = 'padding:16px;font-size:13px;';
    rows.forEach(function (r) {
      var box = document.createElement('div');
      box.style.cssText = 'margin-bottom:14px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;';
      var st = !r.comparable ? { c: '#999', t: '- 비교불가', bg: '#f5f5f5' }
        : (r.match ? { c: '#4CAF50', t: 'O 일치', bg: '#f0fff0' } : { c: '#F44336', t: 'X 불일치', bg: '#fff0f0' });
      var head = document.createElement('div');
      head.style.cssText = 'padding:6px 12px;font-weight:bold;background:' + st.bg + ';color:' + st.c + ';';
      head.textContent = r.label + '  ' + st.t;
      box.appendChild(head);
      [['신청정보', r.a, '#1565C0'], [tagB, r.b, '#E65100']].forEach(function (p) {
        var d = document.createElement('div');
        d.style.cssText = 'padding:8px 12px;border-top:1px solid #eee;word-break:break-all;line-height:1.5;cursor:pointer;';
        d.innerHTML = '<span style="color:' + p[2] + ';font-size:11px;font-weight:bold">' + escHtml(p[0]) + '</span><br>' + escHtml(p[1] || '(미입력)');
        if (p[1]) d.addEventListener('click', function () { copyText(p[1]); });
        box.appendChild(d);
      });
      body.appendChild(box);
    });
    modal.appendChild(body);
    document.body.appendChild(modal);
    var escH = function (e) { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escH); } };
    document.addEventListener('keydown', escH);
  }

  async function startAplyCompare(urls, fileName) {
    try {
      var r = await loadAttachmentFromLink(urls, fileName, '출원 관련 첨부');
      var f = getAplyFields();
      var docNorm = normalizeChars(r.text).replace(/\s+/g, ' ');
      var docCompact = compactText(r.text);
      var docLower = docNorm.toLowerCase();

      var korR = normNameKor(f.reqNameKor), korP = normNameKor(f.plfNameKor);
      var engR = normNameEng(f.reqNameEng), engP = normNameEng(f.plfNameEng);
      var checks = [
        { group: '발명의명칭 (신청 ↔ 특허사무소)', label: '국문', tagA: '신청', tagB: '특허사무소',
          a: f.reqNameKor, b: f.plfNameKor,
          status: (!korR || !korP) ? 'empty' : (korR === korP ? 'match' : 'mismatch') },
        { group: '발명의명칭 (신청 ↔ 특허사무소)', label: '영문', tagA: '신청', tagB: '특허사무소',
          a: f.reqNameEng, b: f.plfNameEng,
          status: (!engR || !engP) ? 'empty' : (engR === engP ? 'match' : 'mismatch') }
      ];

      var noEv = findEvidence(r.text, f.aplyNo);
      checks.push({ group: '첨부문서 ↔ 특허사무소 입력', label: '출원번호', tagA: '특허사무소', tagB: '첨부 ' + r.kind,
        a: f.aplyNo, b: evidenceText(noEv),
        status: !f.aplyNo ? 'empty' : (noEv.found ? 'match' : 'mismatch') });

      var dtEv = findEvidence(r.text, dateForms(f.aplyDt));
      checks.push({ group: '첨부문서 ↔ 특허사무소 입력', label: '출원일자', tagA: '특허사무소', tagB: '첨부 ' + r.kind,
        a: f.aplyDt, b: evidenceText(dtEv),
        status: !f.aplyDt ? 'empty' : (dtEv.found ? 'match' : 'mismatch') });

      var nameSt = longTextMatch(f.plfNameKor, docCompact, docLower);
      var nameEv = findEvidence(r.text, f.plfNameKor);
      if (!nameEv.found && nameSt === 'partial') nameEv = findPartialEvidence(r.text, f.plfNameKor, 3);
      checks.push({ group: '첨부문서 ↔ 특허사무소 입력', label: '발명의명칭(국문)', tagA: '특허사무소', tagB: '첨부 ' + r.kind,
        a: f.plfNameKor, b: evidenceText(nameEv, nameSt === 'partial' ? '일부 일치 — 육안 확인' : '첨부문서에서 미발견'), status: nameSt });

      var b = matchSetBuilder();
      b.add(f.aplyNo, '출원번호');
      b.addDates(f.aplyDt, '출원일자');
      b.add(f.plfNameKor, '발명의명칭');
      b.addWords(f.plfNameKor, '발명의명칭(어절)', 3);
      b.addWords(f.plfNameEng, '발명의명칭(영문 어절)', 5);

      openSplitView({
        title: '출원대조 | ' + (f.mngNo || '') + ' | ' + r.kind + ' | ' + (fileName || ''),
        color: '#1565C0', leftWidth: '58%', doc: r, matchSet: b.get(),
        rightNode: buildResultPanel({ color: '#1565C0', groupBg: '#E3F2FD', checks: checks })
      });
    } catch (e) {
      console.error(TAG, '출원대조 실패:', e);
      showMsg('출원대조 실패: ' + e.message);
    }
  }

  // ============================================================
  // 3) 등록결정사항 검토 (S_PMS_03013020)
  // ============================================================
  function getRegDecsnFields() {
    return {
      mngNo: getText('#intellMngNo'), familyNo: getText('#intellMgmtNo'),
      rqstNo: getText('#rqstNoSpan') || getElVal('#rqstNo'), rqstDt: getText('#rqstDtSpan'),
      ivenNmKor: getText('#ivenNm'), ivenNmEng: getText('#ivenEngNm'),
      owner: getText('#owrInfo'), country: getText('#aplyNtnNm'),
      aplyNo: getText('#intellAplyNo'), aplyDt: getText('#intellAplyDt'),
      mainInventor: getText('#mainIvenInfo'), inventors: getText('#ivenInfo'),
      patentFirm: getText('#plfMgmtNm'), decisionDt: getText('#intellRegDecsnDt'),
      feeDueDt: getText('#intellRegExpDueDt'), expectedCost: getText('#intellRegAntcExp'),
      cmplNeedDt: getText('#cmplNeedDt'), requestContent: getText('#rqstCntnt')
    };
  }

  function detectRegDocType(pdfText, fileName) {
    var fn = (fileName || '').toLowerCase();
    var t = normalizeChars(pdfText || '').replace(/\s+/g, ' ');
    if (/allowed[\s_-]*claims?|허용[\s_-]*청구항|청구항/.test(fn)) return { key: 'claims', label: '허용 청구항(Allowed Claims)', strict: false };
    if (/notice[\s_-]*of[\s_-]*allow|등록결정|허여결정/.test(fn)) return { key: 'notice', label: '등록결정서(Notice of Allowance)', strict: true };
    if (/notice of allowance|notice of allowability|issue fee/i.test(t)) return { key: 'notice', label: '등록결정서(Notice of Allowance)', strict: true };
    if (/allowed claims?|claims? allowed|the following claims are allowed/i.test(t)) return { key: 'claims', label: '허용 청구항(Allowed Claims)', strict: false };
    if (/office action|non-final rejection|final rejection/i.test(t)) return { key: 'oa', label: '중간사건/Office Action', strict: false };
    return { key: 'other', label: '기타 첨부 문서', strict: false };
  }

  function ownerAliases(owner) {
    var out = [];
    var add = function (v) { if (v && out.indexOf(v) < 0) out.push(v); };
    add(owner);
    if (/한국표준과학연구원/.test(owner || '')) {
      add('Korea Research Institute of Standards and Science');
      add('KRISS');
    }
    return out;
  }

  async function startRegDecsnCompare(urls, fileName) {
    try {
      var r = await loadAttachmentFromLink(urls, fileName, '등록결정 첨부');
      var f = getRegDecsnFields();
      var docType = detectRegDocType(r.text, fileName);
      var docCompact = compactText(r.text);
      var docLower = normalizeChars(r.text).replace(/\s+/g, ' ').toLowerCase();
      var strict = function (found) { return found ? 'match' : (docType.strict ? 'mismatch' : 'info'); };
      var checks = [];

      checks.push({ group: '첨부 문서 판별', label: '문서 유형', tagA: '첨부파일', tagB: r.kind + ' 자동 판별',
        a: fileName || '-', b: docType.label, status: 'info' });

      var noEv = findEvidence(r.text, f.aplyNo);
      checks.push({ group: '출원 기본정보', label: '출원번호', tagB: '첨부 ' + r.kind, a: f.aplyNo,
        b: evidenceText(noEv), status: !f.aplyNo ? 'empty' : strict(noEv.found) });

      var aplyDtEv = findEvidence(r.text, dateForms(f.aplyDt));
      checks.push({ group: '출원 기본정보', label: '출원일자', tagB: '첨부 ' + r.kind, a: f.aplyDt,
        b: evidenceText(aplyDtEv), status: !f.aplyDt ? 'empty' : strict(aplyDtEv.found) });

      var engSt = longTextMatch(f.ivenNmEng, docCompact, docLower);
      if (!docType.strict && engSt === 'mismatch') engSt = 'info';
      var engEv = findEvidence(r.text, f.ivenNmEng);
      if (!engEv.found && engSt === 'partial') engEv = findPartialEvidence(r.text, f.ivenNmEng, 5);
      checks.push({ group: '출원 기본정보', label: '발명의명칭(영문)', tagB: '첨부 ' + r.kind, a: f.ivenNmEng,
        b: evidenceText(engEv, engSt === 'partial' ? '일부 일치 — 육안 확인' : '첨부문서에서 미발견'), status: engSt });

      if (f.ivenNmKor) {
        var korSt = longTextMatch(f.ivenNmKor, docCompact, docLower);
        if (korSt === 'mismatch') korSt = 'info';
        var korEv = findEvidence(r.text, f.ivenNmKor);
        if (!korEv.found) korEv = findPartialEvidence(r.text, f.ivenNmKor, 3);
        checks.push({ group: '출원 기본정보', label: '발명의명칭(국문)', tagB: '첨부 ' + r.kind, a: f.ivenNmKor,
          b: evidenceText(korEv, '외국 문서에는 없을 수 있음'), status: korSt });
      }

      var aliases = ownerAliases(f.owner);
      var ownerEv = findEvidence(r.text, aliases);
      checks.push({ group: '출원 기본정보', label: '특허(저작)권자', tagB: '첨부 ' + r.kind, a: f.owner,
        b: evidenceText(ownerEv, '첨부문서에 출원인·양수인 표기가 없을 수 있음'),
        status: !f.owner ? 'empty' : (ownerEv.found ? 'match' : 'info') });

      if (f.country) {
        var countryEv = /미국/.test(f.country) ? findRegexEvidence(r.text, /united states patent|uspto|u\.s\. patent/i) : findEvidence(r.text, f.country);
        checks.push({ group: '출원 기본정보', label: '출원국가', tagB: '첨부 ' + r.kind, a: f.country,
          b: evidenceText(countryEv, '국가 자동 식별 보류'), status: countryEv.found ? 'match' : 'info' });
      }

      var decEv = findEvidence(r.text, dateForms(f.decisionDt));
      checks.push({ group: '등록결정 정보', label: '등록결정일자', tagB: '첨부 ' + r.kind, a: f.decisionDt,
        b: evidenceText(decEv, docType.key === 'notice' ? 'Mail Date·Notice Date에서 미발견' : '결정서가 아닌 문서일 수 있음'),
        status: !f.decisionDt ? 'empty' : strict(decEv.found) });

      var dueEv = findEvidence(r.text, dateForms(f.feeDueDt));
      var ruleEv = findRegexEvidence(r.text, /(?:three|3)\s*(?:\(3\)\s*)?months?[^\n]{0,100}(?:mailing date|date mailed|mail date|this notice)|(?:mailing date|date mailed|mail date|this notice)[^\n]{0,100}(?:three|3)\s*(?:\(3\)\s*)?months?/i);
      var threeMonth = ruleEv.found;
      var derivedDue = addMonths(f.decisionDt, 3);
      var dueDerivedOk = !!f.feeDueDt && !!derivedDue && normNameKor(f.feeDueDt) === normNameKor(derivedDue) && threeMonth;
      checks.push({ group: '등록결정 정보', label: '등록료 납부기한', tagB: '첨부 ' + r.kind, a: f.feeDueDt,
        b: dueEv.found ? evidenceText(dueEv)
          : (dueDerivedOk ? evidenceText(ruleEv) + ' → 계산 ' + derivedDue
          : (threeMonth ? evidenceText(ruleEv) + ' → 계산 ' + (derivedDue || '?') : '첨부문서에서 기한·3개월 규칙 미발견')),
        status: !f.feeDueDt ? 'empty' : (dueEv.found ? 'match' : (dueDerivedOk ? 'derived' : (docType.strict ? 'mismatch' : 'info'))) });

      if (f.expectedCost) {
        var cd = f.expectedCost.replace(/[^0-9]/g, '');
        var costEv = findEvidence(r.text, cd);
        checks.push({ group: '등록결정 정보', label: '예상 등록비용', tagB: '첨부 ' + r.kind, a: f.expectedCost,
          b: evidenceText(costEv, '통화·수수료 구성은 수동 확인'), status: costEv.found ? 'match' : 'info' });
      }

      if (f.mainInventor) {
        checks.push({ group: '수동 확인', label: '주발명자', a: f.mainInventor,
          b: '한글명 ↔ 영문명 자동 매핑 제외', status: 'info' });
      }

      var b = matchSetBuilder();
      b.add(f.aplyNo, '출원번호');
      var digits = String(f.aplyNo || '').replace(/\D/g, '');
      if (digits.length === 8) {
        b.add(digits.substring(0, 2) + '/' + digits.substring(2, 5) + ',' + digits.substring(5), '출원번호');
        b.add(digits.substring(0, 2) + '/' + digits.substring(2), '출원번호');
      }
      b.addDates(f.aplyDt, '출원일자');
      b.addDates(f.decisionDt, '등록결정일자');
      b.addDates(f.feeDueDt, '등록료 납부기한');
      b.add(f.ivenNmEng, '발명의명칭(영문)');
      b.addWords(f.ivenNmEng, '발명의명칭(어절)', 5);
      b.addWords(f.ivenNmKor, '발명의명칭(국문 어절)', 3);
      aliases.forEach(function (v) { b.add(v, '권리자'); });

      openSplitView({
        title: '등록결정 대조 | ' + (f.mngNo || '') + ' | ' + r.kind + ' | ' + (fileName || ''),
        color: '#0D47A1', leftWidth: '58%', doc: r, matchSet: b.get(),
        rightNode: buildResultPanel({
          color: '#0D47A1', groupBg: '#E3F2FD', checks: checks,
          legendHtml: '<b style="color:#4CAF50">O</b> 일치 <b style="color:#F9A825">△</b> 부분일치 ' +
            '<b style="color:#7B1FA2">≈</b> 3개월 규칙 파생 <b style="color:#F44336">X</b> 필수 문서에서 미발견 ' +
            '<b style="color:#2196F3">i</b> 문서유형상 비교제외 <span style="color:#999">-</span> 빈값'
        })
      });
    } catch (e) {
      console.error(TAG, '등록결정 대조 실패:', e);
      showMsg('등록결정 대조 실패: ' + e.message);
    }
  }

  // ============================================================
  // 4) 등록완료 보고 (S_PMS_03013030)
  // ============================================================
  function waitForRegCmplDom() {
    var n = 0;
    var probe = function () {
      var hasRegNo = !!document.getElementById('intellRegNo');
      var hasUploader = !!document.querySelector('a.download_file[data-progrm-id^="iprs.reg.cmpl"]');
      var titleEl = document.querySelector('.titlegroup3 .h4_normal');
      var isTitle = titleEl ? titleEl.textContent.indexOf('등록완료') >= 0 : false;
      return hasRegNo && (isTitle || hasUploader);
    };
    var run = function () {
      var t = setInterval(function () {
        n++;
        if (probe()) {
          clearInterval(t);
          console.log(TAG, 'v' + VER, '| 등록완료 보고 화면 감지(DOM) |', location.pathname);
          ensureViewerSetupButton();
          setupDownloadIntercept(mgmtNoPrefix);
          initRegCmpl();
        } else if (n >= 40) clearInterval(t);
      }, 500);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }

  function getRegCmplFields() {
    return {
      mngNo: getText('#intellMngNo'), rqstNo: getText('#intellRqstNo'),
      ivenNmKor: getText('#ivenNm'), ivenNmEng: getText('#ivenEngNm'),
      regKorNm: getText('#intellRegKorNm'), regEngNm: getText('#intellRegEngNm'),
      aplyNo: getText('#intellAplyNo'), aplyDt: getText('#intellAplyDt'),
      regNo: getText('#intellRegNo'), regDt: getText('#intellRegDt'),
      pubcNo: getText('#pubcNo'), pubcDt: getText('#pubcDt')
    };
  }

  function initRegCmpl() {
    attachFileButtons({
      selectors: '#uploader1 a.download_file, #uploader2 a.download_file',
      compareLabel: '대조', onCompare: startRegCmplCompare
    });
    waitFor(function () { return !!getText('#intellRegKorNm'); }, function () {
      var f = getRegCmplFields();
      if (f.regKorNm || f.regEngNm) {
        injectNameBadge('krissRegBadge', f.ivenNmKor, f.ivenNmEng, f.regKorNm, f.regEngNm, '특허사무소');
      }
    }, 30);
  }

  async function startRegCmplCompare(urls, fileName) {
    try {
      var r = await loadAttachmentFromLink(urls, fileName, '등록증·첨부');
      var f = getRegCmplFields();
      var docNorm = normalizeChars(r.text).replace(/\s+/g, ' ');
      var docCompact = compactText(r.text);
      var docLower = docNorm.toLowerCase();

      var korR = normNameKor(f.ivenNmKor), korP = normNameKor(f.regKorNm);
      var engR = normNameEng(f.ivenNmEng), engP = normNameEng(f.regEngNm);
      var checks = [
        { group: '발명의명칭 (신청 ↔ 특허사무소)', label: '국문', tagA: '신청', tagB: '특허사무소',
          a: f.ivenNmKor, b: f.regKorNm, status: (!korR || !korP) ? 'empty' : (korR === korP ? 'match' : 'mismatch') },
        { group: '발명의명칭 (신청 ↔ 특허사무소)', label: '영문', tagA: '신청', tagB: '특허사무소',
          a: f.ivenNmEng, b: f.regEngNm, status: (!engR || !engP) ? 'empty' : (engR === engP ? 'match' : 'mismatch') }
      ];

      var G = '첨부문서 ↔ 시스템 입력';
      [['등록번호', f.regNo, false], ['출원번호', f.aplyNo, false],
       ['등록일자', f.regDt, true], ['출원일자', f.aplyDt, true]].forEach(function (row) {
        var ev = row[2] ? findEvidence(r.text, dateForms(row[1])) : findEvidence(r.text, row[1]);
        checks.push({ group: G, label: row[0], tagB: '첨부 ' + r.kind, a: row[1],
          b: evidenceText(ev), status: !row[1] ? 'empty' : (ev.found ? 'match' : 'mismatch') });
      });

      var nm = f.regKorNm || f.ivenNmKor;
      var nmSt = longTextMatch(nm, docCompact, docLower);
      var nmEv = findEvidence(r.text, nm);
      if (!nmEv.found && nmSt === 'partial') nmEv = findPartialEvidence(r.text, nm, 3);
      checks.push({ group: G, label: '발명의명칭(국문)', tagB: '첨부 ' + r.kind, a: nm,
        b: evidenceText(nmEv, nmSt === 'partial' ? '일부 일치 — 육안 확인' : '첨부문서에서 미발견'), status: nmSt });

      if (f.pubcNo) {
        var pubEv = findEvidence(r.text, f.pubcNo);
        checks.push({ group: G, label: '공개번호', tagB: '첨부 ' + r.kind, a: f.pubcNo,
          b: evidenceText(pubEv, '등록증에는 없을 수 있음'), status: pubEv.found ? 'match' : 'info' });
      }

      var b = matchSetBuilder();
      b.add(f.regNo, '등록번호'); b.add(f.aplyNo, '출원번호'); b.add(f.pubcNo, '공개번호');
      b.addDates(f.regDt, '등록일자'); b.addDates(f.aplyDt, '출원일자');
      b.add(nm, '발명의명칭'); b.addWords(nm, '발명의명칭(어절)', 3);

      openSplitView({
        title: '등록대조 | ' + (f.mngNo || '') + ' | ' + r.kind + ' | ' + (fileName || ''),
        color: '#1565C0', leftWidth: '58%', doc: r, matchSet: b.get(),
        rightNode: buildResultPanel({ color: '#1565C0', groupBg: '#E3F2FD', checks: checks })
      });
    } catch (e) {
      console.error(TAG, '등록대조 실패:', e);
      showMsg('등록대조 실패: ' + e.message);
    }
  }

  // ============================================================
  // 진입
  // ============================================================
  window.KrissIprs = { version: VER, screen: SCREEN, panic: panic, setup: showSetupDialog };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();