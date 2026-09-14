// ==UserScript==
// @name         KRISS 보조원장(기술이전) 지재권 집행내역 정제 추출
// @namespace    kriss.pms.techtrns.ipledger
// @version      1.1
// @description  보조원장(기술이전) 그리드를 기간 지정(선택적 분할 조회)으로 읽어 공백행·대체·환원 전표를 제외하고 적요·예산코드를 파싱한 뒤 xlsx/TSV로 내보냅니다.
// @match        https://krisstar.kriss.re.kr/pms/res/techtrns/S_ACC_01080250.do*
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

/* ---------------------------------------------------------------------------
 * v1.1 변경점
 *   - 기간(시작일~종료일) 직접 지정 후 자동 조회 기능 추가
 *   - 장기간 조회 시 월/분기/년 단위 분할 조회 + 중복 제거 누적
 *   - 조회 종료 후 검색폼 원래 기간 복원
 *   - 결의일자 기준 사후 필터(안전망) 추가
 * ------------------------------------------------------------------------- */

(function () {
  'use strict';

  /* =========================================================================
   * [0] 설정 (CONFIG)
   * ========================================================================= */
  const CONFIG = {
    // 적요에 이 정규식이 걸리면 행 제외 (기지출계정대체 포함 — 차·대변 상계되어 총합 0)
    EXCLUDE_DESC: /대체|환원/,

    // 계정코드별 '집행/흡수' 라벨. 미등록 계정은 DEFAULT_FLOW 사용
    ACCT_FLOW: { '55630': '집행' },
    DEFAULT_FLOW: '집행',

    // 결의일자 → 결의번호 → 순번(문자열) 오름차순 재정렬
    RESORT: true,

    // 누적 결과를 입력 기간으로 한 번 더 거르기 (서버가 넓게 응답하는 경우 대비)
    POST_FILTER_BY_DATE: true,

    // 금액을 숫자로 기록(true, #,##0 서식) / 천단위 콤마 문자열(false)
    AMOUNT_AS_NUMBER: true,

    // 조회 1회당 최대 대기(ms), 분할 조회 사이 간격(ms)
    QUERY_TIMEOUT: 120000,
    QUERY_GAP: 400,

    // 출력 파일명 접두어 (영문·숫자·언더바만)
    FILE_PREFIX: 'kriss_ip_ledger'
  };

  // 지출구분 → 출원/유지/등록 구분
  const STAGE_MAP = {
    '국내출원료': '출원', '해외출원료': '출원', '중간사건비용': '출원',
    '국내등록료': '등록', '해외등록료': '등록',
    '국내연차료': '유지', '해외연차료': '유지', '연차료': '유지',
    '선행기술조사료': '출원(선행기술조사비용)'
  };

  // 출력 컬럼 28개. 9번째 '순번'은 원본 reslSeq — 기존 자료와 동일하게 헤더명이 중복됩니다.
  const HEADERS = [
    '순번', '코드', '계정명', '결의일자', '결의번호', '구분', '집행/흡수', '구분2', '순번',
    '사업 구분', '보조원장 상 사업분류', '예산코드', '예산명', '비목코드', '비목명', '거래처',
    '차변금액', '대변금액', '최종값', '적요',
    '국가 구분', '지재권 관리번호', '항목별-지재권 관리비', '지출구분', '상세내역',
    '국내/해외 구분', '출원/유지/등록 구분', '비고'
  ];
  const NUM_COL_IDX = [16, 17, 18]; // 차변금액, 대변금액, 최종값

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const $ = function () { return W.jQuery || W.$; };

  /* =========================================================================
   * [1] 원본 데이터 수집
   * ========================================================================= */
  function kendoGrid() {
    const jq = $();
    return jq ? jq('#grid').data('kendoGrid') : null;
  }

  function readFromGrid() {
    const grid = kendoGrid();
    if (!grid || !grid.dataSource) return null;
    let list = [];
    try { list = flattenGroups(grid.dataSource.view() || []); } catch (e) { list = []; }
    if (!list.length) { try { list = (grid.dataSource.data() || []).slice(); } catch (e) { list = []; } }
    return list.map(pick);
  }

  function pick(m) {
    return {
      acctCd: str(m.acctCd), acctNm: str(m.acctNm),
      reslDt: fmtDate(m.reslDt), reslNo: str(m.reslNo), reslSeq: str(m.reslSeq),
      budgCd: str(m.budgCd), budgNm: str(m.budgNm),
      expCd: str(m.expCd), expNm: str(m.expNm), busiRegNm: str(m.busiRegNm),
      busiCatNm: str(m.busiCatNm),
      drAmt: toNum(m.drAmt), crAmt: toNum(m.crAmt), reslDesc: str(m.reslDesc)
    };
  }

  function flattenGroups(list, out) {
    out = out || [];
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it && it.items && (it.field !== undefined || it.hasSubgroups !== undefined)) flattenGroups(it.items, out);
      else if (it) out.push(it);
    }
    return out;
  }

  // 그리드 객체 접근이 막힌 경우 렌더된 표에서 읽기 (예비 경로)
  function readFromDom() {
    const ths = document.querySelectorAll('#grid .k-grid-header thead th');
    const tbody = document.querySelector('#grid .k-grid-content tbody');
    if (!ths.length || !tbody) return null;
    const idx = {};
    ths.forEach(function (th, i) { const f = th.getAttribute('data-field'); if (f) idx[f] = i; });

    const rows = [];
    tbody.querySelectorAll(':scope > tr').forEach(function (tr) {
      const cls = tr.className || '';
      if (cls.indexOf('k-grouping-row') >= 0 || cls.indexOf('k-group-footer') >= 0) return; // 그룹헤더·소계행
      const tds = tr.querySelectorAll(':scope > td');
      const get = function (f) { const i = idx[f]; return (i === undefined || !tds[i]) ? '' : tds[i].textContent.trim(); };
      rows.push(pick({
        acctCd: get('acctCd'), acctNm: get('acctNm'), reslDt: get('reslDt'),
        reslNo: get('reslNo'), reslSeq: get('reslSeq'), budgCd: get('budgCd'), budgNm: get('budgNm'),
        expCd: get('expCd'), expNm: get('expNm'), busiRegNm: get('busiRegNm'), busiCatNm: get('busiCatNm'),
        drAmt: get('drAmt'), crAmt: get('crAmt'), reslDesc: get('reslDesc')
      }));
    });
    return rows;
  }

  function collectCurrent() {
    let rows = readFromGrid();
    let via = 'kendo dataSource';
    if (!rows || !rows.length) { rows = readFromDom(); via = 'DOM table'; }
    return { rows: rows || [], via: via };
  }

  /* =========================================================================
   * [2] 기간 조회
   * ========================================================================= */
  function getPageDate(id) {
    const jq = $(); if (!jq) return '';
    const dp = jq('#' + id).data('kendoDatePicker');
    const v = dp ? dp.value() : null;
    if (v instanceof Date && !isNaN(v.getTime())) return fmtDate(v);
    return fmtDate(jq('#' + id).val());
  }

  function setPageDate(id, ymd) {
    const jq = $(); if (!jq) return;
    const el = jq('#' + id);
    const dp = el.data('kendoDatePicker');
    const dt = new Date(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
    if (dp) { dp.value(dt); dp.trigger('change'); }
    else { el.val(ymd).trigger('change'); }
  }

  // #btnSearch 클릭 → dataSource change 대기
  function queryAndWait() {
    return new Promise(function (resolve, reject) {
      const jq = $();
      const grid = kendoGrid();
      if (!jq || !grid) { reject(new Error('그리드를 찾지 못했습니다.')); return; }
      const ds = grid.dataSource;
      let done = false;
      const cleanup = function () { ds.unbind('change', ok); ds.unbind('error', ng); };
      const ok = function () { if (done) return; done = true; cleanup(); setTimeout(resolve, 250); };
      const ng = function () { if (done) return; done = true; cleanup(); reject(new Error('서버 조회 중 오류가 발생했습니다.')); };
      ds.bind('change', ok); ds.bind('error', ng);
      jq('#btnSearch').trigger('click');
      setTimeout(function () {
        if (done) return;
        done = true; cleanup();
        reject(new Error('조회 응답이 없습니다. 기간 입력값 또는 네트워크 상태를 확인하세요.'));
      }, CONFIG.QUERY_TIMEOUT);
    });
  }

  // 기간을 단위별로 분할
  function splitRange(fr, to, unit) {
    if (unit === 'none') return [[fr, to]];
    const out = [];
    const end = new Date(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
    let s = new Date(+fr.slice(0, 4), +fr.slice(5, 7) - 1, +fr.slice(8, 10));
    let guard = 0;
    while (s <= end && guard++ < 600) {
      let e;
      if (unit === 'month')        e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
      else if (unit === 'quarter') e = new Date(s.getFullYear(), s.getMonth() + 3, 0);
      else                         e = new Date(s.getFullYear(), 11, 31);
      if (e > end) e = new Date(end);
      out.push([fmtDate(s), fmtDate(e)]);
      s = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
    }
    return out;
  }

  async function collectRange(fr, to, unit, onProgress) {
    const keep = { fr: getPageDate('toDayFr'), to: getPageDate('toDayTo') };
    const parts = splitRange(fr, to, unit);
    const acc = new Map();
    let via = 'kendo dataSource';
    try {
      for (let i = 0; i < parts.length; i++) {
        onProgress('조회 ' + (i + 1) + '/' + parts.length + '  (' + parts[i][0] + ' ~ ' + parts[i][1] + ')');
        setPageDate('toDayFr', parts[i][0]);
        setPageDate('toDayTo', parts[i][1]);
        await queryAndWait();
        const cur = collectCurrent();
        via = cur.via;
        cur.rows.forEach(function (o) { acc.set(o.reslNo + '|' + o.reslSeq + '|' + o.budgCd, o); });
        if (i < parts.length - 1) await sleep(CONFIG.QUERY_GAP);
      }
    } finally {
      if (keep.fr) setPageDate('toDayFr', keep.fr);
      if (keep.to) setPageDate('toDayTo', keep.to);
      onProgress('');
    }
    let rows = Array.from(acc.values());
    if (CONFIG.POST_FILTER_BY_DATE) rows = rows.filter(function (o) { return o.reslDt >= fr && o.reslDt <= to; });
    return { rows: rows, via: via + ' / ' + parts.length + '회 조회', parts: parts.length, range: fr + ' ~ ' + to };
  }

  /* =========================================================================
   * [3] 적요 파싱
   * ========================================================================= */
  function parseDesc(desc) {
    const r = { mgmtNo: '', country: '', expType: '', detail: '', region: '', stage: '', review: '' };
    const d = String(desc || '');

    // (1) 지재권 관리번호 : "지식재산권 P240082KR(출원번호: …)" / "지식재산권 P250010KR - 홍길동(00000)"
    const mNo = d.match(/지식재산권\s+([A-Za-z0-9-]+)/);
    if (mNo) r.mgmtNo = mNo[1];

    // (2) 국가 구분 : 관리번호 말미 영문 (KR/US/EU/PCT/CN/JP/DE/VN/TW …)
    const mCo = r.mgmtNo.match(/([A-Za-z]{2,4})$/);
    if (mCo) r.country = mCo[1].toUpperCase();

    // (3) 지출구분 / 상세내역 : 마지막 대괄호 "[중간사건비용-국내대리인비용]", "[해외출원료(PCT) -국내대리인비용]"
    const brs = d.match(/\[[^\[\]]*\]/g);
    if (brs && brs.length) {
      const last = brs[brs.length - 1].slice(1, -1);
      const mm = last.match(/^(.*?)\s*-\s*(.*)$/);
      if (mm) {
        r.expType = mm[1].replace(/\s*\([^)]*\)\s*/g, '').trim();
        r.detail = mm[2].trim();
        if (r.expType === '기타') r.review = '지출구분 원문이 "기타" — 실제 구분 수기 확인 필요';
        if (r.detail === '기타') r.review = (r.review ? r.review + ' / ' : '') + '상세내역 원문이 "기타" — 수기 확인 필요';
      }
    } else {
      // (4) 대괄호 없는 서술형 적요 — 정형 패턴만 규칙 적용
      let m;
      if ((m = d.match(/과제\s*(국내|해외)\s*특허\s*연차유지료/))) {
        r.expType = '연차료'; r.detail = '관납료'; r.region = m[1];
      } else if ((m = d.match(/(국내|해외)\s*특허\s*연차유지료\s*(납부|송금)\s*수수료/))) {
        r.expType = '연차료';
        r.detail = (m[2] === '송금') ? '해외송금수수료' : '국내대리인비용';
        r.region = m[1];
      } else if (/^선행기술\s*조사\s*비용/.test(d)) {
        r.expType = '선행기술조사료'; r.detail = '국내대리인비용'; r.region = '국내';
      } else if (/(저작권\s*등록|저작물\s*저작권)/.test(d)) {
        r.expType = '국내등록료'; r.detail = '국내관납료'; r.region = '소프트웨어';
      } else {
        r.review = '비정형 적요 — 지출구분·상세내역 수기 입력 필요';
      }
    }

    // (5) 국내/해외 구분
    if (!r.region) {
      if (r.country === 'KR') r.region = '국내';
      else if (r.country === 'PCT') r.region = 'PCT';
      else if (r.country) r.region = '해외';
      else if (/^국내/.test(r.expType)) r.region = '국내';
      else if (/^해외/.test(r.expType)) r.region = '해외';
    }

    // (6) 출원/유지/등록 구분
    r.stage = STAGE_MAP[r.expType] || '';
    return r;
  }

  /* =========================================================================
   * [4] 변환 파이프라인
   * ========================================================================= */
  function build(src, via, rangeLabel) {
    if (!src || !src.length) {
      alert('그리드에서 데이터를 찾지 못했습니다. 먼저 자료를 조회한 뒤 다시 실행하세요.');
      return null;
    }
    const stat = { total: src.length, blank: 0, excluded: 0, kept: 0, dr: 0, cr: 0, review: 0, via: via, range: rangeLabel || '' };

    // 4-1. 공백행 / 대체·환원 전표 제외
    const kept = src.filter(function (o) {
      if (!o.reslNo && !o.reslDesc && !o.budgCd && !o.drAmt && !o.crAmt) { stat.blank++; return false; }
      if (CONFIG.EXCLUDE_DESC.test(o.reslDesc)) { stat.excluded++; return false; }
      return true;
    });

    // 4-2. 정렬
    if (CONFIG.RESORT) {
      kept.sort(function (a, b) {
        return cmpStr(a.reslDt, b.reslDt) || cmpStr(a.reslNo, b.reslNo) || cmpStr(a.reslSeq, b.reslSeq);
      });
    }

    // 4-3. 구분2 : 결의번호 단위로 적요에 '연차'가 하나라도 있으면 '연차유지'
    const annuity = new Set();
    kept.forEach(function (o) { if (/연차/.test(o.reslDesc)) annuity.add(o.reslNo); });

    // 4-4. 행 생성
    const aoa = [HEADERS.slice()];
    const review = [['순번', '결의일자', '결의번호', '적요', '검토 사유']];

    kept.forEach(function (o, i) {
      const p = parseDesc(o.reslDesc);
      const fin = o.drAmt - o.crAmt;
      const item = p.detail ? (p.detail.indexOf('관납료') >= 0 ? '관납료' : '외부기관 활용비용') : '';
      const seq = i + 1;

      aoa.push([
        seq, o.acctCd, o.acctNm, o.reslDt, o.reslNo,
        o.reslNo ? o.reslNo.charAt(0) : '',                          // 구분 (E/T/R)
        CONFIG.ACCT_FLOW[o.acctCd] || CONFIG.DEFAULT_FLOW,           // 집행/흡수
        annuity.has(o.reslNo) ? '연차유지' : '출원,등록 등',           // 구분2
        o.reslSeq,
        o.budgCd ? o.budgCd.substr(2, 3) : '',                       // 사업 구분
        o.busiCatNm,                                                 // 보조원장 상 사업분류
        o.budgCd, o.budgNm, o.expCd, o.expNm, o.busiRegNm,
        CONFIG.AMOUNT_AS_NUMBER ? o.drAmt : comma(o.drAmt),
        CONFIG.AMOUNT_AS_NUMBER ? o.crAmt : comma(o.crAmt),
        CONFIG.AMOUNT_AS_NUMBER ? fin : comma(fin),
        o.reslDesc, p.country, p.mgmtNo, item, p.expType, p.detail, p.region, p.stage, ''
      ]);

      stat.dr += o.drAmt; stat.cr += o.crAmt;
      if (p.review) { review.push([seq, o.reslDt, o.reslNo, o.reslDesc, p.review]); stat.review++; }
    });

    stat.kept = kept.length;
    return { aoa: aoa, review: review, stat: stat };
  }

  /* =========================================================================
   * [5] 출력
   * ========================================================================= */
  function exportXlsx(res) {
    if (!res) return;
    if (typeof XLSX === 'undefined') {
      alert('SheetJS(xlsx) 라이브러리를 불러오지 못했습니다.\n사내망에서 cdnjs 접속이 차단된 경우일 수 있으니 [TSV 복사]를 사용하세요.');
      return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(res.aoa);
    if (CONFIG.AMOUNT_AS_NUMBER) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let R = 1; R <= range.e.r; R++) {
        NUM_COL_IDX.forEach(function (C) {
          const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
          if (cell && cell.t === 'n') cell.z = '#,##0';
        });
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, 'data');
    if (res.review.length > 1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(res.review), 'review');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(new Blob([out], { type: 'application/octet-stream' }), CONFIG.FILE_PREFIX + '_' + stamp() + '.xlsx');
    report(res.stat);
  }

  function exportTsv(res) {
    if (!res) return;
    const tsv = res.aoa.map(function (row) {
      return row.map(function (v) { return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' '); }).join('\t');
    }).join('\r\n');
    const done = function () { report(res.stat, '클립보드에 복사했습니다. 엑셀 A1 셀에 붙여넣으세요.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).then(done, function () { fallbackCopy(tsv, done); });
    } else fallbackCopy(tsv, done);
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    ta.value = text;
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) {
      download(new Blob(['\uFEFF' + text], { type: 'text/tab-separated-values;charset=utf-8' }),
               CONFIG.FILE_PREFIX + '_' + stamp() + '.tsv');
    } finally { document.body.removeChild(ta); }
  }

  function report(s, extra) {
    const msg =
      '추출 완료' + (s.range ? '  [' + s.range + ']' : '') + '\n' +
      '수집 경로       : ' + s.via + '\n' +
      '─────────────────────\n' +
      '조회 행수       : ' + s.total + '\n' +
      '공백행 제외     : ' + s.blank + '\n' +
      '대체·환원 제외  : ' + s.excluded + '\n' +
      '최종 행수       : ' + s.kept + '\n' +
      '차변 합계       : ' + comma(s.dr) + '\n' +
      '대변 합계       : ' + comma(s.cr) + '\n' +
      '수기 확인 필요  : ' + s.review + (s.review ? ' (review 시트)' : '') +
      (extra ? '\n\n' + extra : '');
    console.log('[보조원장 정제 추출]', s);
    alert(msg);
  }

  /* =========================================================================
   * [6] 유틸
   * ========================================================================= */
  function str(v) { return (v == null) ? '' : String(v).trim(); }
  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const s = String(v == null ? '' : v).replace(/,/g, '').trim();
    if (!s || s === '-') return 0;
    const n = Number(s); return isFinite(n) ? n : 0;
  }
  function comma(n) { return Number(n || 0).toLocaleString('en-US'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function cmpStr(a, b) { a = String(a || ''); b = String(b || ''); return a < b ? -1 : a > b ? 1 : 0; }

  // Date / 'yyyyMMdd' / 'yyyy-MM-dd' → 'yyyy-MM-dd' (로컬 기준, UTC 밀림 방지)
  function fmtDate(v) {
    if (!v) return '';
    if (v instanceof Date && !isNaN(v.getTime())) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    const s = String(v).trim();
    if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    return s;
  }
  function stamp() {
    const d = new Date();
    return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  /* =========================================================================
   * [7] 도구 모음 삽입
   * ========================================================================= */
  let ui = null;

  function busy(on, text) {
    if (!ui) return;
    ui.status.textContent = text || '';
    [ui.btnNow, ui.btnRange, ui.btnTsv].forEach(function (b) { b.disabled = !!on; });
  }

  function runCurrent(asTsv) {
    const cur = collectCurrent();
    const res = build(cur.rows, cur.via, '화면 조회 결과');
    if (!res) return;
    asTsv ? exportTsv(res) : exportXlsx(res);
  }

  async function runRange() {
    const fr = ui.dFr.value, to = ui.dTo.value;
    if (!fr || !to) { alert('시작일과 종료일을 모두 입력하세요.'); return; }
    if (fr > to) { alert('시작일이 종료일보다 뒤입니다.'); return; }
    busy(true, '조회 준비 중…');
    try {
      const got = await collectRange(fr, to, ui.unit.value, function (t) { busy(true, t); });
      busy(false, '');
      const res = build(got.rows, got.via, got.range);
      exportXlsx(res);
    } catch (e) {
      busy(false, '');
      alert('조회 실패: ' + (e && e.message ? e.message : e));
      console.error('[보조원장 정제 추출]', e);
    }
  }

  function mount() {
    const anchor = document.querySelector('#btnExcelDownload');
    if (!anchor || document.querySelector('#ipLedgerBar')) return true;

    const bar = document.createElement('span');
    bar.id = 'ipLedgerBar';
    bar.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-right:6px;vertical-align:middle;';

    const label = document.createElement('span');
    label.textContent = '기간';
    label.style.cssText = 'font-size:12px;color:#555;margin-right:2px;';

    const mk = function (type) {
      const el = document.createElement('input');
      el.type = type;
      el.style.cssText = 'height:26px;font-size:12px;padding:1px 4px;border:1px solid #c8c8c8;border-radius:2px;';
      return el;
    };
    const dFr = mk('date'), dTo = mk('date');
    const tilde = document.createElement('span');
    tilde.textContent = '~';
    tilde.style.cssText = 'font-size:12px;color:#888;';

    const unit = document.createElement('select');
    unit.style.cssText = 'height:26px;font-size:12px;border:1px solid #c8c8c8;border-radius:2px;';
    [['none', '한번에'], ['quarter', '분기 분할'], ['month', '월 분할'], ['year', '연 분할']]
      .forEach(function (o) {
        const op = document.createElement('option');
        op.value = o[0]; op.textContent = o[1];
        unit.appendChild(op);
      });

    const status = document.createElement('span');
    status.style.cssText = 'font-size:12px;color:#0b6bcb;min-width:150px;';

    const btnRange = document.createElement('button');
    btnRange.type = 'button'; btnRange.className = anchor.className;
    btnRange.textContent = '기간 조회 후 저장';
    btnRange.addEventListener('click', runRange);

    const btnNow = document.createElement('button');
    btnNow.type = 'button'; btnNow.className = anchor.className;
    btnNow.textContent = '화면 그대로 저장';
    btnNow.addEventListener('click', function () { runCurrent(false); });

    const btnTsv = document.createElement('button');
    btnTsv.type = 'button'; btnTsv.className = anchor.className;
    btnTsv.textContent = 'TSV 복사';
    btnTsv.addEventListener('click', function () { runCurrent(true); });

    [label, dFr, tilde, dTo, unit, status].forEach(function (el) { bar.appendChild(el); });
    anchor.parentNode.insertBefore(bar, anchor);
    anchor.parentNode.insertBefore(btnRange, anchor);
    anchor.parentNode.insertBefore(btnNow, anchor);
    anchor.parentNode.insertBefore(btnTsv, anchor);

    ui = { dFr: dFr, dTo: dTo, unit: unit, status: status, btnNow: btnNow, btnRange: btnRange, btnTsv: btnTsv };

    // 검색폼의 현재 조회기간을 초기값으로
    setTimeout(function () {
      dFr.value = getPageDate('toDayFr') || '';
      dTo.value = getPageDate('toDayTo') || '';
    }, 500);

    return true;
  }

  if (!mount()) {
    const mo = new MutationObserver(function () { if (mount()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 30000);
  }
})();