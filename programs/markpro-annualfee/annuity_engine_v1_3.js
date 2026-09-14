/* =====================================================================
 * Patent Annuity Survey Builder - Core Engine  v1.3
 * v1.3 변경: 스마트등급 조회/매칭 추가
 *            - buildSmartQuery: 국가별(한국/일본/중국/미국/유럽/조회제외) 조회용 워크북 생성(조사대상 아님 제외)
 *            - gradeRecords 옵션: 평가결과(출원/등록번호+등급)를 정규화 매칭해 2차 Y열(스마트등급) 기입
 *              정규화 규칙은 patent_grade_matcher.py v1.1과 동일(등록 우선, 출원 보조, MIN_KEY_LEN=6, 충돌 검사)
 *            - 출자 규칙 문구 확정: 기간 경과와 무관하게 기술사업화그룹(분류 동작 변경 없음)
 * v1.2 변경: 패밀리 처리 옵션화(familyMode: group|report|off, 기본 report)
 *            - report 모드에서 패밀리 건은 연구부서로 분류하고 리포트에 '유지주의' 표기
 *            - 레거시 familyPropagation(bool) 하위호환 유지(true→group, false→off)
 * 공용 엔진: Node(검증) / Browser(운영) 동일 코드
 * 입력: 마크프로 제공 목록 + 지식재산권 마스터
 * 출력: 1차 업로드 2종, 2차 업로드 1종, 검토 리포트 1종
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnnuityEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 공통 유틸 ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function toStr(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.getUTCFullYear() + '-' + pad2(v.getUTCMonth() + 1) + '-' + pad2(v.getUTCDate());
    if (typeof v === 'object') { // ExcelJS formula/richtext
      if (v.result !== undefined) return toStr(v.result);
      if (v.text !== undefined) return toStr(v.text);
      if (v.richText) return v.richText.map(function (t) { return t.text; }).join('');
      return String(v);
    }
    return String(v).trim();
  }
  function toDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
    var s = toStr(v).slice(0, 10).replace(/\./g, '-').replace(/\//g, '-');
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  function dstr(d) { return d ? d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) : ''; }
  function maxDate(a, b) { if (!a) return b; if (!b) return a; return a > b ? a : b; }
  function parseNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    var n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  /* ---------- 시트 탐지 ---------- */
  function rowValues(ws, r, maxC) {
    var out = [];
    for (var c = 1; c <= maxC; c++) out.push(toStr(ws.getRow(r).getCell(c).value));
    return out;
  }
  function colLetter(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }

  function findSheets(workbooks) {
    var mkCands = [], msCands = [], notes = [];
    workbooks.forEach(function (wb, wi) {
      wb.eachSheet(function (ws) {
        var r1 = rowValues(ws, 1, 45);
        if (r1.indexOf('고객관리번호') >= 0 && r1.indexOf('MARKPRO REF.') >= 0 &&
            r1.indexOf('납부 구분') < 0 && r1.indexOf('3.연차료 납부 조사 대상') < 0) {
          var maxDue = null;
          for (var r = 2; r <= ws.rowCount; r++) {
            if (!toStr(ws.getRow(r).getCell(10).value)) continue;
            var d = toDate(ws.getRow(r).getCell(13).value);
            if (d && (!maxDue || d > maxDue)) maxDue = d;
          }
          mkCands.push({ ws: ws, wi: wi, maxDue: maxDue });
        }
        // 마스터: 헤더가 1~3행에 분산 수출되는 경우가 있어 행 무관 탐지
        function headAt(col, name) {
          for (var hr = 1; hr <= 3; hr++)
            if (toStr(ws.getRow(hr).getCell(col).value).replace(/[\s\n]/g, '') === name) return hr;
          return 0;
        }
        var rMgmt = headAt(2, '관리번호'), rDan = headAt(25, '단독/공동');
        if (rMgmt && rDan) {
          var headerRow = Math.max(rMgmt, rDan);
          var cnt = 0;
          for (var rr = headerRow + 1; rr <= ws.rowCount; rr++) if (toStr(ws.getRow(rr).getCell(2).value)) cnt++;
          var miss = [];
          [[13, '계약세부'], [14, '종료/해지일'], [17, '주발명자'], [18, '주발명자사번'], [19, '재직여부'],
           [20, '차상위검토자사번'], [21, '차상위검토자성명'], [40, '패밀리번호'], [62, '계약번호'],
           [63, '종료(예정)일'], [64, '계약명']].forEach(function (p) { if (!headAt(p[0], p[1])) miss.push(colLetter(p[0]) + '열 "' + p[1] + '"'); });
          msCands.push({ ws: ws, headerRow: headerRow, wi: wi, rows: cnt, miss: miss });
        }
      });
    });
    var markpro = null, master = null;
    if (mkCands.length) {
      mkCands.sort(function (a, b) { return (b.maxDue || 0) - (a.maxDue || 0); });
      markpro = mkCands[0].ws;
      if (mkCands.length > 1)
        notes.push('마크프로 후보 시트 ' + mkCands.length + '개 → 납부기한 최신 시트 [' + markpro.name + '] 사용 (최신 기한 ' + dstr(mkCands[0].maxDue) + ')');
    }
    if (msCands.length) {
      var same = mkCands.length ? msCands.filter(function (m) { return m.wi === mkCands[0].wi; }) : [];
      var pool = same.length ? same : msCands.slice();
      pool.sort(function (a, b) { return b.rows - a.rows; });
      master = { ws: pool[0].ws, headerRow: pool[0].headerRow };
      if (pool[0].miss && pool[0].miss.length)
        notes.push('마스터 헤더 확인 필요(기대 위치에 없음): ' + pool[0].miss.join(', ') + ' — 열 위치 변경 시 결과 오류 가능');
      if (msCands.length > 1)
        notes.push('마스터 후보 시트 ' + msCands.length + '개 → [' + master.ws.name + '] 사용 (' + (same.length ? '마크프로와 동일 파일' : '데이터 행 최다 ' + pool[0].rows + '건') + ')');
    }
    if (!markpro) notes.push('마크프로 제공 목록 시트를 찾지 못했습니다.');
    if (!master) notes.push('지식재산권 마스터 시트를 찾지 못했습니다. (헤더행에 관리번호/단독·공동 필요)');
    return { markpro: markpro, master: master, notes: notes };
  }

  /* ---------- 마스터 파싱 ---------- */
  var MC = { mgmt: 2, contractDetail: 13, endTerm: 14, mainInv: 17, mainInvId: 18, tenure: 19,
             altId: 20, altName: 21, danGong: 25, shareTxt: 27, family: 40,
             cNo: 62, cEnd: 63, cName: 64 };
  function parseMaster(found) {
    var ws = found.ws, hr = found.headerRow;
    var map = {}, fam = {}, sparse = 0, total = 0;
    var last = ws.rowCount;
    for (var r = hr + 1; r <= last; r++) {
      var key = toStr(ws.getRow(r).getCell(MC.mgmt).value);
      if (!key) continue;
      total++;
      var rec = {
        key: key,
        M: toStr(ws.getRow(r).getCell(MC.contractDetail).value),
        N: toDate(ws.getRow(r).getCell(MC.endTerm).value),
        BJ: toStr(ws.getRow(r).getCell(MC.cNo).value),
        BK: toDate(ws.getRow(r).getCell(MC.cEnd).value),
        BL: toStr(ws.getRow(r).getCell(MC.cName).value),
        mainInv: toStr(ws.getRow(r).getCell(MC.mainInv).value),
        mainInvId: toStr(ws.getRow(r).getCell(MC.mainInvId).value),
        tenure: toStr(ws.getRow(r).getCell(MC.tenure).value),
        altId: toStr(ws.getRow(r).getCell(MC.altId).value),
        altName: toStr(ws.getRow(r).getCell(MC.altName).value),
        dan: toStr(ws.getRow(r).getCell(MC.danGong).value),
        fam: toStr(ws.getRow(r).getCell(MC.family).value)
      };
      rec.isSparse = !rec.dan && !rec.mainInv && !rec.fam && !rec.M;
      if (rec.isSparse) sparse++;
      if (!(key in map)) map[key] = rec;               // 첫 매칭(VLOOKUP 동일)
      if (rec.fam) { (fam[rec.fam] = fam[rec.fam] || []).push(rec); }
    }
    return { map: map, fam: fam, sparse: sparse, total: total };
  }

  /* ---------- 마크프로 파싱 (표준 36열 + 신규열 자동 승계) ---------- */
  var MK_HEAD = ['번호', '납부여부', '국가', '권리', '구분', '출원번호', '출원일자', '등록번호', '등록일자',
    '고객관리번호', 'MARKPRO REF.', '연차', '납부기한일', '청구항수', '비용분담', '권리인명', '예상권리만료일',
    'US entity', '예상비용 통화', '예상비용', '예상비용 (비용분담)', '당사수수료 통화', '당사수수료',
    '당사수수료 (비용분담)', '대리인', '대리인명(국문)', '사업장명', '사업장2', '발명의명칭', '발명자이름',
    '건담당자', '관리소속1', '관리소속2', '존속만료일까지 12개월 이내건', 'EP지정국Check', '국내디자인 확인 필요'];
  function parseMarkpro(ws) {
    var headerIssues = [], extraHeaders = [];
    var lastCol = 36;
    for (var c = 1; c <= 60; c++) {
      var h = toStr(ws.getRow(1).getCell(c).value);
      if (c <= 36) { if (h !== MK_HEAD[c - 1]) headerIssues.push(colLetter(c) + '열 헤더 상이: 기대 "' + MK_HEAD[c - 1] + '" / 실제 "' + h + '"'); }
      else if (h) { extraHeaders.push(h); lastCol = c; }
      else if (c > 36) break;
    }
    var rows = [];
    for (var r = 2; r <= ws.rowCount; r++) {
      var mgmt = toStr(ws.getRow(r).getCell(10).value); // J 고객관리번호
      if (!mgmt) continue;                              // 합계/공백행 제외
      var src = [], extra = [];
      for (var c2 = 1; c2 <= 36; c2++) src.push(toStr(ws.getRow(r).getCell(c2).value));
      for (var c3 = 37; c3 <= 36 + extraHeaders.length; c3++) extra.push(toStr(ws.getRow(r).getCell(c3).value));
      rows.push({ src: src, extra: extra, mgmt: mgmt,
                  due: toDate(src[12]), regDate: toDate(src[8]),
                  curr: src[18], cost: src[19], costShare: src[20],
                  markproYear: src[11] });
    }
    return { rows: rows, extraHeaders: extraHeaders, headerIssues: headerIssues };
  }

  /* ---------- 비용분담 문자열 해석 ---------- */
  function parseShare(txt) {
    var kriss = null, others = [];
    toStr(txt).split('/').forEach(function (seg) {
      var m = seg.match(/:\s*([\d.]+)\s*%/);
      if (!m) return;
      var pct = parseFloat(m[1]);
      if (/KRISS|표준과학연구원/.test(seg)) kriss = pct; else others.push(pct);
    });
    return { kriss: kriss, others: others };
  }

  /* ---------- 핵심 판정 ---------- */
  var F_GROUP = '기술사업화그룹';
  var F_RES = '연구부서 납부';
  var F_EXCL = '조사대상 아님(기업납부로 무조건 유지 필요)';

  function transferState(rec, due, opts) {
    if (!rec || !rec.M) return null;
    var end = opts.useMaxNBk ? maxDate(rec.N, rec.BK) : rec.N;
    var type = rec.M === '출자' ? '출자' : '기술이전';
    var ongoing, label;
    if (type === '출자') {
      if (!end) { ongoing = true; label = '출자(종료일 정보 없음)'; }
      else if (due && due < end) { ongoing = true; label = '출자기간(' + dstr(end) + ')'; }
      else { ongoing = !!opts.expiredEquityToGroup; label = '출자종료(' + dstr(end) + ')'; }
    } else {
      if (!end) { ongoing = false; label = '기술이전(종료일 정보 없음)'; }
      else if (due && due < end) { ongoing = true; label = '계약기간(' + dstr(end) + ')'; }
      else { ongoing = false; label = '계약종료(' + dstr(end) + ')'; }
    }
    return { type: type, end: end, ongoing: ongoing, label: label, multi: /,/.test(rec.BJ || ''), nbkDiff: !!(rec.N && rec.BK && dstr(rec.N) !== dstr(rec.BK)) };
  }

  /* familyMode 정규화(v1.2)
   *   'group'  : 패밀리 전파 → 기술사업화그룹 (+리포트)  [v1.1 거동]
   *   'report' : 패밀리 건은 연구부서로 두되 리포트에 유지주의 표기 [신규 기본]
   *   'off'    : 패밀리 규칙 미적용, 리포트 표기도 없음 [레거시]
   * 우선순위: 명시적 opts.familyMode > 레거시 opts.familyPropagation(bool) > 기본 'report'
   */
  function resolveFamilyMode(opts) {
    if (opts.familyMode === 'group' || opts.familyMode === 'report' || opts.familyMode === 'off') return opts.familyMode;
    if (opts.familyPropagation === true) return 'group';
    if (opts.familyPropagation === false) return 'off';
    return 'report';
  }

  function classify(rows, master, opts) {
    var famMode = resolveFamilyMode(opts);
    rows.forEach(function (row, i) {
      row.no = i + 1;
      row.reasons = [];
      var rec = master.map[row.mgmt] || null;
      row.ref = rec;
      if (!rec) row.reasons.push('마스터 미매칭');
      else if (rec.isSparse) row.reasons.push('마스터 정보 부족(관리번호만 존재)');

      /* G: 등록 후 연차 */
      row.G = row.regDate ? (opts.baseYear - row.regDate.getUTCFullYear() + 1) : null;
      if (row.G === null) row.reasons.push('등록일자 없음: 연차 산정 불가');
      var mk = (row.markproYear.match(/(\d+)\s*$/) || [])[1];
      if (mk && row.G !== null && parseInt(mk, 10) !== row.G)
        row.reasons.push('연차 확인: 산식 ' + row.G + '년차 vs 마크프로 ' + parseInt(mk, 10) + '년차 (' + row.src[2] + ')');

      /* D: 공동출원 여부 (문구 통일) */
      var sh = parseShare(row.src[14]);
      var dan = rec ? rec.dan : '';
      var base = dan === '단독' ? '단독출원' : dan === '공동' ? '공동출원' : '';
      if (!base) { row.reasons.push('단독/공동 정보 없음'); }
      if (sh.kriss === 0) row.D = (base || '공동출원') + '(기업 100% 납부)';
      else if (base === '공동출원' && sh.kriss === 100) row.D = '공동출원(표준연 100% 납부)';
      else row.D = base;
      if (base === '단독출원' && sh.others.some(function (p) { return p > 0; }))
        row.reasons.push('지분표기상 공동 의심(마스터 단독/공동=단독, 지분="' + row.src[14] + '"): 확인 필요');

      /* E: 본인 기술이전/출자 상태 */
      var own = transferState(rec, row.due, opts);
      row.own = own;
      row.E = own ? own.label : '';
      if (own && own.multi) row.reasons.push('복수 계약번호(' + rec.BJ + '): 종료일 확인 필요');
      if (own && own.nbkDiff) row.reasons.push('종료/해지일(N) ' + dstr(rec.N) + ' ≠ 종료(예정)일(BK) ' + dstr(rec.BK) + ': MAX값 적용');

      /* 패밀리 전파 탐지 */
      row.famHits = [];
      if (rec && rec.fam && master.fam[rec.fam]) {
        master.fam[rec.fam].forEach(function (sib) {
          if (sib === rec || !sib.M) return;
          var st = transferState(sib, row.due, opts);
          if (st && st.ongoing) row.famHits.push({ key: sib.key, type: st.type, end: dstr(st.end) || '(없음)' });
        });
      }

      /* F: 납부주체 결정 */
      var exc = opts.exceptions && opts.exceptions.cls && opts.exceptions.cls[row.mgmt];
      if (exc) { row.F = exc; row.reasons.push('예외 목록 적용: ' + exc); }
      else if (sh.kriss === 0) { row.F = F_EXCL; row.C = '납부지시 : 기업 납부로 유지 필요'; }
      else if (row.G !== null && row.G <= 5) { row.F = F_GROUP; }
      else if (own && own.type === '출자' && own.ongoing) {
        row.F = F_GROUP;
        row.reasons.push(own.label.indexOf('출자종료') === 0 ? '출자 건(기간 경과): 확정 규칙(출자는 기간 무관)에 따라 기술사업화그룹' : '출자 건');
      }
      else if (own && own.type === '기술이전' && own.ongoing) { row.F = F_GROUP; }
      else if (famMode === 'group' && row.famHits.length) {
        row.F = F_GROUP;
        row.reasons.push('패밀리 전파(기술사업화그룹): ' + row.famHits.map(function (h) { return h.key + '(' + h.type + '~' + h.end + ')'; }).join(', '));
      }
      else {
        row.F = F_RES;
        if (own && !own.ongoing) row.reasons.push(own.type === '출자' ? '출자 기간경과 → 연구부서(옵션)' : '기술이전 계약종료 → 연구부서 전환: 실제 종료 여부 확인 권장');
        if (famMode === 'report' && row.famHits.length) {
          row.famReport = true;   // 특별관리/히스토리 대상 표식
          row.reasons.push('패밀리 유지주의: 패밀리 내 진행중 계약 [' + row.famHits.map(function (h) { return h.key + '(' + h.type + '~' + h.end + ')'; }).join(', ') + '] → 연구부서 분류이나 연차 유지 필요(포기 주의)');
        }
      }
      if (!row.C) row.C = '';

      /* 통화 점검 */
      if (row.curr && row.curr !== 'KRW' && row.curr !== 'USD')
        row.reasons.push('미지원 통화 ' + row.curr + ': USD 환율만 지원, 환산 미적용 - 수기 확인 필요');

      /* 2차용: BPM 수신자 */
      if (rec) {
        row.tenure = rec.tenure;
        row.L = rec.tenure === '퇴직' ? '퇴직' : rec.tenure === '재직' ? '정상' : '';
        if (!row.L) row.reasons.push('재직여부 정보 없음');
        if (rec.tenure === '퇴직') {
          row.bpmId = rec.altId; row.bpmName = rec.altName;
          row.reasons.push('주발명자 퇴직: 수신자(차상위/당시 부서장 등) 확인 필요 [자동기입: ' + rec.altName + ']');
        } else { row.bpmId = rec.mainInvId; row.bpmName = rec.mainInv; }
        var bo = opts.exceptions && opts.exceptions.bpm && opts.exceptions.bpm[row.mgmt];
        if (bo) {
          if (bo.id) row.bpmId = bo.id;
          if (bo.name) row.bpmName = bo.name;
          if (bo.l) row.L = bo.l;
          row.reasons.push('BPM 수신자 예외 적용: ' + (bo.name || row.bpmName) + '(' + (bo.id || row.bpmId) + ')' + (bo.l ? ' / 표기=' + bo.l : ''));
        }
        row.mainInv = rec.mainInv;
      } else { row.L = ''; row.bpmId = ''; row.bpmName = ''; row.mainInv = ''; }
    });
    return rows;
  }

  /* ---------- 산출물 생성 ---------- */
  var YELLOW = 'FFFFFF00', GREEN = 'FFC6D3B4', H2FILL = 'FFFFFF99';
  var WON_FMT = '_-"₩"* #,##0_-;\\-"₩"* #,##0_-;_-"₩"* "-"_-;_-@_-';
  var NUM_FMT = '_-* #,##0_-;\\-* #,##0_-;_-* "-"_-;_-@_-';

  var U1_HEAD = ['번호', '납부여부', '', '국가', '권리', '구분', '출원번호', '출원일자', '등록번호', '등록일자',
    '고객관리번호', 'MARKPRO REF.', '연차', '납부기한일', '청구항수', '권리인명', '실제존속만료일',
    '예상비용 통화', '예상비용', '예상비용 (비용분담)', '', '', '당사수수료 통화', '당사수수료',
    '당사수수료 (비용분담)', '', '', '비용분담', '대리인', '대리인명(국문)', '사업장명', '사업장2',
    '발명의명칭', '발명자이름', '건담당자', '관리소속1', '관리소속2', '존속만료일까지 12개월 이내건',
    'EP지정국Check', '국내디자인 확인 필요'];
  var U1_WIDTH = { 4: 5.1, 6: 13.1, 7: 13.7, 8: 11.3, 9: 17.1, 10: 11.3, 11: 15.9, 12: 19.7, 13: 5.1, 14: 11.0,
    16: 51.4, 17: 17.3, 19: 11.4, 20: 18.4, 21: 17.3, 24: 15.7, 25: 18.4, 26: 18.4, 28: 90.0, 29: 10.7,
    30: 32.1, 31: 10.7, 33: 28.6, 35: 10.7 };
  // 마크프로 원본열(1기준) → 1차 업로드열
  var U1_SRC = { 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9, 11: 10, 12: 11, 13: 12, 14: 13, 15: 14, 16: 16, 17: 17,
    18: 19, 19: 20, 20: 21, 23: 22, 24: 23, 25: 24, 28: 15, 29: 25, 30: 26, 31: 27, 32: 28, 33: 29, 34: 30,
    35: 31, 36: 32, 37: 33, 38: 34, 39: 35, 40: 36 };

  /* ---------- 스마트등급 조회/매칭 (v1.3) ----------
   * 정규화 규칙: patent_grade_matcher.py v1.1 이식.
   * 차이점(개선): 숫자 셀은 '123.0' 꼬리 없이 정수 문자열로 처리(xlrd float 표기 아티팩트 미재현). */
  var GRADE_MIN_KEY = 6;
  function numStr(x) {
    if (x === null || x === undefined) return '';
    if (typeof x === 'number') { var rr = Math.round(x); return Math.abs(x - rr) < 1e-9 ? String(rr) : String(x); }
    return String(x);
  }
  function gradeKeyReg(x) {
    var s = numStr(x).trim().toUpperCase();
    s = s.replace(/^[A-Z]+/, '');      /* ① 국가 접두문자 제거 (EP, US, ZL ...) */
    s = s.replace(/[A-Z]\d?$/, '');    /* ② 종류코드 제거 (B1, B2, A ...) - 숫자 추출 전에! */
    var d = s.replace(/\D/g, '');      /* ③ 숫자만 */
    return d.length >= GRADE_MIN_KEY ? d : '';
  }
  function gradeKeyApp(x) {
    var s = numStr(x).trim().toUpperCase();
    s = s.replace(/^[A-Z]+/, '');      /* ① 국가 접두문자 제거 */
    s = s.replace(/\.\d$/, '');        /* ② 유럽 체크디짓 제거 (.5, .7 ...) */
    var d = s.replace(/\D/g, '');      /* ③ 숫자만 */
    if (d.length === 13 && d.indexOf('10') === 0) d = d.slice(2); /* ④ 한국 출원 13자리+10시작 → '10' 제거 */
    return d.length >= GRADE_MIN_KEY ? d : '';
  }
  /* 결과 시트(배열의 배열: 1행=머리글) → {records:[{app,reg,grade}], cols} */
  function parseGradeSheet(aoa, gradeHeader) {
    gradeHeader = numStr(gradeHeader).trim() || '총점등급';
    if (!aoa || !aoa.length) return { error: '스마트등급 결과 파일이 비어 있습니다.' };
    var head = (aoa[0] || []).map(function (h) { return numStr(h).trim(); });
    function findCol(exact, contains) {
      var i = head.indexOf(exact);
      if (i >= 0) return i;
      for (var c = 0; c < head.length; c++) if (head[c] && head[c].indexOf(contains) >= 0) return c;
      return -1;
    }
    var ai = findCol('출원번호', '출원'), ri = findCol('등록번호', '등록'), gi = findCol(gradeHeader, gradeHeader);
    if (gi < 0) gi = findCol('총점등급', '등급');
    if (ai < 0 || ri < 0 || gi < 0)
      return { error: '결과 파일 1행에서 머리글을 찾지 못했습니다: ' + [ai < 0 ? '출원번호' : '', ri < 0 ? '등록번호' : '', gi < 0 ? '등급(' + gradeHeader + ')' : ''].filter(Boolean).join(', ') };
    var records = [];
    for (var r = 1; r < aoa.length; r++) {
      var row = aoa[r] || [];
      records.push({ app: row[ai], reg: row[ri], grade: row[gi] });
    }
    return { records: records, cols: { app: head[ai], reg: head[ri], grade: head[gi] } };
  }
  /* 등급 원본 → 매칭 맵 (등록 우선/출원 보조), 서로 다른 원본이 같은 key로 뭉치면 충돌 기록 */
  function buildGradeMaps(records) {
    var regMap = {}, appMap = {}, regSeen = {}, appSeen = {}, conflicts = [], loaded = 0;
    (records || []).forEach(function (rec) {
      var g = numStr(rec.grade).trim();
      if (!g) return;
      loaded++;
      var app = numStr(rec.app).trim(), reg = numStr(rec.reg).trim();
      var rk = gradeKeyReg(reg), ak = gradeKeyApp(app);
      if (rk) {
        if (regSeen[rk] && regSeen[rk][0] !== reg)
          conflicts.push('등록 key ' + rk + ': ' + regSeen[rk][0] + '(' + regSeen[rk][1] + ') vs ' + reg + '(' + g + ')');
        if (!regSeen[rk]) regSeen[rk] = [reg, g];
        if (!(rk in regMap)) regMap[rk] = g;
      }
      if (ak) {
        if (appSeen[ak] && appSeen[ak][0] !== app)
          conflicts.push('출원 key ' + ak + ': ' + appSeen[ak][0] + '(' + appSeen[ak][1] + ') vs ' + app + '(' + g + ')');
        if (!appSeen[ak]) appSeen[ak] = [app, g];
        if (!(ak in appMap)) appMap[ak] = g;
      }
    });
    return { regMap: regMap, appMap: appMap, conflicts: conflicts, loaded: loaded };
  }
  /* 분류된 행에 등급 적용: 등록번호(src[7]) 우선, 출원번호(src[5]) 보조 */
  function applyGrades(rows, maps) {
    var filled = 0, unmatched = [];
    rows.forEach(function (row) {
      var rk = gradeKeyReg(row.src[7]), ak = gradeKeyApp(row.src[5]);
      var g = (rk && maps.regMap[rk]) || (ak && maps.appMap[ak]) || '';
      row.grade = g;
      row.gradeSrc = g ? ((rk && maps.regMap[rk]) ? '등록번호' : '출원번호') : '';
      if (g) filled++;
      else if (row.F !== F_EXCL) {
        unmatched.push(row.mgmt);
        row.reasons.push('스마트등급 미매칭: 결과 파일에서 해당 출원/등록번호를 찾지 못함 → 2차(Y열) 수동 확인');
      }
    });
    return { filled: filled, unmatched: unmatched };
  }
  /* 국가 → 조회 시트 매핑: 유럽은 EP/EU/UP + EPC 회원국 코드 */
  var SMART_EU = { EP: 1, EU: 1, UP: 1, GB: 1, DE: 1, FR: 1, IT: 1, ES: 1, NL: 1, SE: 1, FI: 1, DK: 1, CH: 1, AT: 1, BE: 1, NO: 1, IE: 1, PT: 1, PL: 1, CZ: 1, HU: 1, TR: 1, GR: 1, LU: 1, MC: 1, SI: 1, SK: 1, RO: 1, BG: 1, HR: 1, EE: 1, LV: 1, LT: 1, IS: 1, LI: 1, SM: 1, MK: 1, RS: 1, AL: 1, ME: 1, CY: 1, MT: 1 };
  function smartSheetName(cc) {
    cc = numStr(cc).trim().toUpperCase();
    if (cc === 'KR') return '한국';
    if (cc === 'JP') return '일본';
    if (cc === 'CN') return '중국';
    if (cc === 'US') return '미국';
    if (SMART_EU[cc]) return '유럽';
    return '조회제외(기타국가)';
  }
  /* 스마트등급 조회용 워크북: 5개 조회 시트 + 조회제외 시트, '조사대상 아님' 제외 */
  function buildSmartQuery(ExcelJS, rows) {
    var wb = new ExcelJS.Workbook();
    var order = ['한국', '일본', '중국', '미국', '유럽', '조회제외(기타국가)'];
    var sheets = {};
    order.forEach(function (nm) {
      var ws = wb.addWorksheet(nm);
      ws.getRow(1).values = ['관리번호', '국가', '출원번호', '등록번호', '분류(참고)'];
      ws.getRow(1).font = { bold: true };
      [16, 8, 20, 24, 16].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      sheets[nm] = { ws: ws, n: 1 };
    });
    rows.forEach(function (row) {
      if (row.F === F_EXCL) return; /* 기업 100% 납부 건: 등급 조회 불필요 */
      var s = sheets[smartSheetName(row.src[2])];
      s.n++;
      s.ws.getRow(s.n).values = [row.mgmt, row.src[2], row.src[5], row.src[7], row.F];
    });
    return wb;
  }

  function buildUpload1(ExcelJS, rows, convert, rate, extraHeaders) {
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('연구부서 연차유지료 납부 목록');
    var hrow = ws.getRow(1);
    for (var c = 1; c <= 40; c++) {
      var cell = hrow.getCell(c);
      cell.value = U1_HEAD[c - 1] || null;
      cell.font = { name: '맑은 고딕', size: 9, bold: true };
      cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: (c >= 4 && c <= 20) ? YELLOW : GREEN } };
    }
    (extraHeaders || []).forEach(function (h, i) {
      var cell = hrow.getCell(41 + i);
      cell.value = h;
      cell.font = { name: '맑은 고딕', size: 9, bold: true };
      cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
    });
    hrow.height = 31.5;
    Object.keys(U1_WIDTH).forEach(function (c) { ws.getColumn(+c).width = U1_WIDTH[c]; });
    ws.getColumn(26).numFmt = WON_FMT; ws.getColumn(27).numFmt = WON_FMT;

    var out = 2;
    function writeRow(row, idx) {
      var r = ws.getRow(out++);
      r.getCell(1).value = idx;
      Object.keys(U1_SRC).forEach(function (dc) {
        var v = row.src[U1_SRC[dc] - 1];
        r.getCell(+dc).value = v === '' ? null : v;
      });
      if (convert && row.curr === 'USD') {
        r.getCell(18).value = 'KRW';
        var s = parseNum(row.cost), t = parseNum(row.costShare);
        if (s !== null) r.getCell(19).value = s * rate;
        if (t !== null) r.getCell(20).value = t * rate;
      }
      (row.extra || []).forEach(function (v, i) { r.getCell(41 + i).value = v === '' ? null : v; });
      var lastC = 40 + ((extraHeaders && extraHeaders.length) || 0);
      for (var c = 1; c <= lastC; c++) {
        r.getCell(c).font = { name: 'Tahoma', size: 10 };
        r.getCell(c).alignment = { horizontal: 'left' };
      }
    }
    rows.forEach(function (row, i) { writeRow(row, i + 1); });
    if (rows.length) writeRow(rows[rows.length - 1], rows.length); // 시스템 대응용 말행 중복
    ws.autoFilter = 'D1:' + colLetter(40 + ((extraHeaders && extraHeaders.length) || 0)) + (out - 1);
    ws.views = [{ state: 'frozen', xSplit: 10, ySplit: 1 }];
    return wb;
  }

  var U2_HEAD = ['순번', '관리번호', 'MARKPRO REF', '국가', '연차', '계약번호', '기술이전\n\n계약명', '계약시작일',
    '계약종료일', '해지일자', '주발명자', '주발명자\n\n퇴직여부', 'BPM수신자\n\n사번', 'BPM수신자\n\n성명(참조용)',
    '심의결과\n\n유지여부', '심의결과\n\n사용예산', '예산 필수 확인', '유지여부\n\n확인대상', '발명자 의견',
    '사용예산\n\n확인대상', '사용예산코드', '시작일', '종료일', '비고', '스마트등급', '납부기한일', '예상비용',
    '발명의명칭', '출원번호', '출원일자', '등록번호', '등록일자', '발명자', 'BPM신청번호\n\n(수정금지)', 'BPM상태\n\n(수정금지)'];
  var U2_WIDTH = { 1: 7.1, 2: 17.1, 3: 20.0, 4: 7.1, 5: 12.9, 6: 15.8, 7: 14.2, 14: 23.9, 15: 14.2,
    28: 57.1, 29: 17.1, 30: 14.2, 31: 21.4, 32: 14.2, 33: 28.6, 34: 14.2 };

  function buildUpload2(ExcelJS, rows, rate, gradeOn) {
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('Sheet1');
    var hrow = ws.getRow(1);
    for (var c = 1; c <= 35; c++) {
      var cell = hrow.getCell(c);
      cell.value = U2_HEAD[c - 1];
      cell.font = { name: '맑은 고딕', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: H2FILL } };
    }
    Object.keys(U2_WIDTH).forEach(function (c) { ws.getColumn(+c).width = U2_WIDTH[c]; });
    ws.getColumn(27).numFmt = NUM_FMT;

    rows.forEach(function (row, i) {
      var r = ws.getRow(i + 2);
      var rec = row.ref || {};
      var amt = parseNum(row.costShare);
      if (row.curr === 'USD' && amt !== null) amt = amt * rate;
      else if (row.curr && row.curr !== 'KRW') amt = null; // 미지원 통화: 수기 확인
      var vals = [String(i + 1), row.mgmt, row.src[10], row.src[2], row.G === null ? '' : String(row.G),
        rec.BJ || '', rec.BL || '', '', rec.BK ? dstr(rec.BK) : '', '',
        row.mainInv, row.L, row.bpmId, row.bpmName, 'Y', '', '', 'Y', '', 'Y',
        '', '', '', '', (row.grade || ''), row.src[12], amt === null ? '' : Math.round(amt),
        row.src[28], row.src[5], row.src[6], row.src[7], row.src[8], row.src[29], '', ''];
      vals.forEach(function (v, ci) {
        var cell = r.getCell(ci + 1);
        cell.value = v === '' ? null : v;
        cell.font = { name: '맑은 고딕', size: 10 };
        cell.alignment = { horizontal: 'center' };
      });
      if (gradeOn && !row.grade) {
        var yc = r.getCell(25);
        yc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
        yc.note = '스마트등급 결과 파일에 해당 특허 없음 → 수동 확인 필요';
      }
    });
    ws.autoFilter = 'A1:AI' + (rows.length + 1);
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    var ws2 = wb.addWorksheet('Sheet2');
    ws2.getCell('A1').value = 'BPM수신자\n\n성명(참조용)';
    var seen = {}, names = [];
    rows.forEach(function (row) { if (row.bpmName && !seen[row.bpmName]) { seen[row.bpmName] = 1; names.push(row.bpmName); } });
    names.forEach(function (nm, i) {
      ws2.getCell('A' + (i + 2)).value = nm;
      ws2.getCell('B' + (i + 2)).value = ',';
    });
    if (names.length) ws2.getCell('D2').value = names.join(',');
    ws2.getColumn(1).width = 23.9;
    return wb;
  }

  /* ---------- 구분값(시트2) + 검토 리포트 ---------- */
  var S2_HEAD = ['번호', '납부여부', '납부 구분', '1.공동출원 여부', '2.기술이전(종료) 여부', '3.연차료 납부 조사 대상',
    '4.등록 후 연차', '국가', '권리', '구분', '출원번호', '출원일자', '등록번호', '등록일자', '고객관리번호',
    'MARKPRO REF.', '연차', '납부기한일', '청구항수', '비용분담', '권리인명', '예상권리만료일', 'US entity',
    '예상비용 통화', '예상비용', '예상비용 (비용분담)', '당사수수료 통화', '당사수수료', '당사수수료 (비용분담)',
    '대리인', '대리인명(국문)', '사업장명', '사업장2', '발명의명칭', '발명자이름', '건담당자', '관리소속1',
    '관리소속2', '존속만료일까지 12개월 이내건', 'EP지정국Check', '국내디자인 확인 필요'];

  function buildReport(ExcelJS, rows, opts, master, extraHeaders, sheetNotes, gradeStats) {
    var wb = new ExcelJS.Workbook();

    var info = wb.addWorksheet('0.실행정보');
    var meta = [
      ['항목', '값'],
      ['실행일시', new Date().toISOString().replace('T', ' ').slice(0, 19)],
      ['기준연도', opts.baseYear],
      ['분기 라벨', opts.quarterLabel],
      ['적용 환율(USD→KRW)', opts.usdRate],
      ['환율 기준일/출처', opts.rateNote || '(미기재)'],
      ['출자 기간경과 처리', opts.expiredEquityToGroup ? '기술사업화그룹(확정 규칙: 출자는 기간 무관)' : '연구부서 전환(비표준: 확정 규칙과 다름)'],
      ['패밀리 처리', (function () { var fm = resolveFamilyMode(opts); return fm === 'group' ? '전파(기술사업화그룹)' : fm === 'report' ? '연구부서 유지 + 리포트 표기(신규 기본)' : '미적용(레거시)'; })()],
      ['종료일 판정', opts.useMaxNBk ? 'MAX(종료/해지일, 종료(예정)일)' : '종료/해지일(N열)만'],
      ['스마트등급 매칭', gradeStats ? ('기입 ' + gradeStats.filled + '건 / 미매칭 ' + gradeStats.unmatched.length + '건 / 정규화 충돌 ' + gradeStats.conflicts.length + '건 (결과 로드 ' + gradeStats.loaded + '건)') : '미사용(결과 파일 미업로드)'],
      ['조사 대상 건수', rows.length],
      ['마스터 건수', master.total + ' (정보부족 ' + master.sparse + ')'],
      ['분류: 연구부서 납부', rows.filter(function (r) { return r.F === F_RES; }).length],
      ['분류: 기술사업화그룹', rows.filter(function (r) { return r.F === F_GROUP; }).length],
      ['분류: 조사대상 아님', rows.filter(function (r) { return r.F === F_EXCL; }).length],
      ['시트 선택/헤더 참고', (sheetNotes && sheetNotes.length) ? sheetNotes.join(' | ') : '-'],
      ['도구 버전', 'annuity_engine v1.3']
    ];
    meta.forEach(function (m, i) { info.getRow(i + 1).values = m; });
    info.getColumn(1).width = 24; info.getColumn(2).width = 60;
    info.getRow(1).font = { bold: true };

    var s2 = wb.addWorksheet('1.구분값(시트2)');
    s2.getRow(1).values = S2_HEAD.concat(extraHeaders || []);
    s2.getRow(1).font = { name: '맑은 고딕', size: 9, bold: true };
    s2.getRow(1).eachCell(function (c, n) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: (n >= 3 && n <= 7) ? YELLOW : GREEN } };
      c.alignment = { vertical: 'center', wrapText: true };
    });
    rows.forEach(function (row, i) {
      var v = [String(row.no), 'Y/N', row.C, row.D, row.E, row.F, row.G === null ? '' : row.G];
      for (var c = 3; c <= 36; c++) v.push(row.src[c - 1]);
      (row.extra || []).forEach(function (x) { v.push(x); });
      s2.getRow(i + 2).values = v.map(function (x) { return x === '' ? null : x; });
      s2.getRow(i + 2).font = { name: '맑은 고딕', size: 9 };
    });
    s2.autoFilter = 'A1:' + colLetter(41 + ((extraHeaders || []).length)) + (rows.length + 1);
    s2.views = [{ state: 'frozen', xSplit: 7, ySplit: 1 }];
    [1, 3, 4, 5, 6].forEach(function (c) { s2.getColumn(c).width = 16; });
    s2.getColumn(5).width = 22; s2.getColumn(6).width = 26;

    var rv = wb.addWorksheet('2.검토필요');
    rv.getRow(1).values = ['번호', '고객관리번호', '납부주체 분류', '등록후연차', '검토 사유'];
    rv.getRow(1).font = { bold: true };
    rv.getRow(1).eachCell(function (c) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } }; });
    var n = 2;
    rows.forEach(function (row) {
      if (!row.reasons.length) return;
      row.reasons.forEach(function (reason) {
        rv.getRow(n++).values = [String(row.no), row.mgmt, row.F, row.G === null ? '' : row.G, reason];
      });
    });
    if (n === 2) rv.getRow(2).values = ['', '', '', '', '검토 필요 항목 없음'];
    [8, 16, 30, 10, 90].forEach(function (w, i) { rv.getColumn(i + 1).width = w; });
    rv.views = [{ state: 'frozen', ySplit: 1 }];
    rv.autoFilter = 'A1:E' + Math.max(2, n - 1);

    /* 3.스마트등급: 매칭 상세 (결과 파일 업로드 시에만) */
    if (gradeStats) {
      var gsw = wb.addWorksheet('3.스마트등급');
      var gmeta = [
        ['항목', '값'],
        ['결과 파일 등급 로드', gradeStats.loaded + '건'],
        ['기입(매칭)', gradeStats.filled + '건'],
        ['미매칭(조사대상 중)', gradeStats.unmatched.length ? gradeStats.unmatched.length + '건 — ' + gradeStats.unmatched.join(', ') : '0건'],
        ['정규화 충돌', gradeStats.conflicts.length ? gradeStats.conflicts.length + '건 (하단 목록)' : '없음']
      ];
      gmeta.forEach(function (m, i) { gsw.getRow(i + 1).values = m; });
      gsw.getRow(1).font = { bold: true };
      var ghr = 7;
      gsw.getRow(ghr).values = ['관리번호', '국가', '분류', '출원번호', '등록번호', '스마트등급', '매칭근거'];
      gsw.getRow(ghr).font = { bold: true };
      var gn = ghr;
      rows.forEach(function (row) {
        if (row.F === F_EXCL) return;
        gn++;
        gsw.getRow(gn).values = [row.mgmt, row.src[2], row.F, row.src[5], row.src[7], row.grade || '(미매칭)', row.gradeSrc || ''];
      });
      if (gradeStats.conflicts.length) {
        gn += 2;
        gsw.getRow(gn).values = ['정규화 충돌 목록: 서로 다른 특허가 같은 key로 인식됨 — 수동 확인 필요'];
        gsw.getRow(gn).font = { bold: true };
        gradeStats.conflicts.forEach(function (c) { gn++; gsw.getRow(gn).values = ['', c]; });
      }
      [16, 8, 16, 20, 24, 12, 10].forEach(function (w, i) { gsw.getColumn(i + 1).width = w; });
      gsw.views = [{ state: 'frozen', ySplit: ghr }];
      gsw.autoFilter = 'A' + ghr + ':G' + Math.max(ghr + 1, gn);
    }
    return wb;
  }

  /* ---------- 실행 진입점 ---------- */
  function run(ExcelJS, workbooks, opts) {
    opts = Object.assign({ expiredEquityToGroup: true, useMaxNBk: true,
                           exceptions: { cls: {}, bpm: {} }, quarterLabel: '' }, opts || {});
    var found = findSheets(workbooks);
    if (!found.markpro || !found.master) return { error: found.notes.join(' / ') };
    var master = parseMaster(found.master);
    var parsed = parseMarkpro(found.markpro);
    var rows = classify(parsed.rows, master, opts);
    var notes = found.notes.concat(parsed.headerIssues);
    var gradeStats = null;
    if (opts.gradeRecords && opts.gradeRecords.length) {
      var gmaps = buildGradeMaps(opts.gradeRecords);
      var gap = applyGrades(rows, gmaps);
      gradeStats = { loaded: gmaps.loaded, filled: gap.filled, unmatched: gap.unmatched, conflicts: gmaps.conflicts };
    }
    var res = rows.filter(function (r) { return r.F === F_RES; });
    var grp = rows.filter(function (r) { return r.F === F_GROUP; });
    return {
      rows: rows, master: master, notes: notes, extraHeaders: parsed.extraHeaders,
      counts: { research: res.length, group: grp.length,
        excluded: rows.filter(function (r) { return r.F === F_EXCL; }).length },
      wbUpload1Research: buildUpload1(ExcelJS, res, true, opts.usdRate, parsed.extraHeaders),
      wbUpload1Group: buildUpload1(ExcelJS, grp, false, opts.usdRate, parsed.extraHeaders),
      wbUpload2Research: buildUpload2(ExcelJS, res, opts.usdRate, !!gradeStats),
      wbReport: buildReport(ExcelJS, rows, opts, master, parsed.extraHeaders, notes, gradeStats),
      wbSmartQuery: buildSmartQuery(ExcelJS, rows),
      grade: gradeStats
    };
  }

    return { run: run, classify: classify, parseMaster: parseMaster, parseMarkpro: parseMarkpro,
           findSheets: findSheets, toStr: toStr, toDate: toDate, dstr: dstr, parseNum: parseNum,
           gradeKeyReg: gradeKeyReg, gradeKeyApp: gradeKeyApp, buildGradeMaps: buildGradeMaps,
           parseGradeSheet: parseGradeSheet, buildSmartQuery: buildSmartQuery, smartSheetName: smartSheetName,
           labels: { F_GROUP: F_GROUP, F_RES: F_RES, F_EXCL: F_EXCL } };
}));
