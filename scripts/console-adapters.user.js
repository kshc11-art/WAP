// ==UserScript==
// @name         KRISS 요구자료 콘솔 — 항목 어댑터
// @namespace    kriss.internal.console
// @version      0.2.0
// @description  기존 엔진 스크립트를 수정하지 않고 요구자료 콘솔에 항목으로 등록한다. 콘솔 페이지에서만 로드된다.
// @author       -
// @match        https://krisstar.kriss.re.kr/popup/S_COM_00000000P.do*
// @match        https://krisstar.kriss.re.kr/index.do?krissConsole=1*
// @noframes
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/* ---------------------------------------------------------------------------
 * 버전 정책 (통계추출 스크립트와 동일)
 *   patch 0.y.Z = 오류 수정·자잘한 개선 / minor 0.Y.0 = 기능 추가·개편
 *
 * 변경이력
 *   0.2.0 (minor) 단일 페이지 재편에 맞춰 재작성.
 *     (1)@match를 콘솔 URL로 한정 — 포털 화면에서는 이 파일이 로드되지 않는다.
 *     (2)공개 API 이름 변경: KrissLauncher → KrissConsole.
 *     (3)보조원장 항목을 '화면 열기 + 안내 시트' 방식으로 바꿔 확정 실패를 없앰.
 *     (4)매니페스트·구현·사전점검을 한 번에 등록(분리 불필요).
 *     ※ 구 어댑터 표기 v1.0~v1.3은 0.1.0~0.1.3으로 소급 재부여함(계보 동일).
 *
 * 목적
 *   요구자료 콘솔에 항목을 등록한다. 새 요구자료 추가는 MANIFESTS 배열에
 *   객체 1개를 넣는 작업이다. params를 콘솔이 읽어 폼을 자동 생성한다.
 *
 * 전제 조건
 *   1) kriss_console_v0_2_0.user.js 설치
 *   2) 콘솔 페이지에 기존 엔진 스크립트가 함께 로드될 것
 *      (통계추출·논문평가는 @match .../* 이므로 콘솔 URL에서도 자동 로드됨)
 *   3) 집계 항목은 통계추출 v0.8.3 패치(__internals 공개)가 적용되어 있을 것
 *      → kriss_statstool_patch_v0_8_3.md 참조. 미적용 시 해당 항목만 안내 후 실패
 *
 * 구동 수준
 *   완전     paper_eval    개인·부서 점수        KrissPaperEval 공개 API
 *   완전     tets_raw      논문 원자료            KrissStatsTool.importTetsDirect
 *   완전     exp_class     지출결의 분류          api.post + classifyPatentExpense
 *   완전     iprs_holding  보유특허 활용·미활용   마스터 응답 필드 직접 판정
 *   패치필요 iprs_master   마스터 + 연도별 건수   __internals.computeIprsCounts
 *   패치필요 nst_report    연도별 특허비 보고서   __internals.computeNST
 *   패치필요 paper_stats   연도별 논문 통계       __internals.computePaperStats
 *   추정경로 pm_annuity    연차유지 조사          후보 경로 순차 탐색(§15-7)
 *   화면안내 ip_ledger     보조원장 집행내역      화면을 열고 안내 시트 출력
 *
 * 오류 가능 지점
 *   1) 콘솔 미설치 → 등록 실패. 0.25초 간격 40회 재시도 후 경고
 *   2) 콘솔 페이지에 엔진 미로드 → '구현 없음' 배지
 *   3) __internals 미적용 → 해당 항목 실행 시 패치 안내 메시지로 실패
 *   4) 명단·JCR 미등록 → 사전점검에서 미충족으로 표시(실행 전 차단)
 *   5) 날짜 형식 차이 → params.gran 으로 엔진별 실측 형식 고정
 *   6) addDataset 호출은 통계추출 데이터셋 목록을 늘린다(의도된 동작, 원본 불변)
 *
 * 검증 방법
 *   - 콘솔에서 KrissConsole.registry() 로 hasImpl 확인
 *   - 항목 1개 실행 후 행수를 원래 화면의 총 건수 표기와 대조
 *   - 좌측 진단 섹션에서 '조회전용 미선언 0개' 확인
 * ------------------------------------------------------------------------- */

(function () {
  'use strict';

  /* --- 공통 유틸 ------------------------------------------------------- */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function lastDayOfMonth(ym) {
    var m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]), 0);
    return m[1] + '-' + m[2] + '-' + pad2(d.getDate());
  }
  function hdr(a) { return a.map(function (t) { return { v: t, s: 2 }; }); }
  function ymd2iso(v) {
    var s = String(v == null ? '' : v);
    var m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    return m ? (m[1] + '-' + m[2] + '-' + m[3]) : s;
  }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function yearOnly(v) { var m = String(v || '').match(/(19|20)\d{2}/); return m ? m[0] : ''; }

  function recordsToAoa(records, cols) {
    if (!records || !records.length) return [['(결과 없음)']];
    var keys = cols && cols.length ? cols : Object.keys(records[0]);
    return [hdr(keys)].concat(records.map(function (r) {
      return keys.map(function (k) {
        var v = r[k];
        if (v == null) return '';
        return (typeof v === 'number') ? v : String(v);
      });
    }));
  }
  function envRows(env) { return (env && Array.isArray(env.data)) ? env.data : []; }
  function envTotal(env) { return (env && typeof env.total === 'number') ? env.total : null; }

  var MASTER_URL = '/pms/iprs/mng/selectIntellAplyList.json';
  // 두 엔진이 같은 본문을 만들어야 실행 캐시가 재사용된다.
  function masterBody(params) {
    var p = params.period || {};
    return {
      isAuthorized: 'Y',
      searchDtCls: params.searchDtCls || '03',
      searchStrDt: (p.from || '').replace(/-/g, ''),
      searchEndDt: (p.to || '').replace(/-/g, ''),
      cntCls: params.cntCls || '', item: '', keyword: '', cls: 'detail'
    };
  }
  var MASTER_PARAMS = [
    { key: 'period', type: 'period', gran: 'ymd', label: '기준일자' },
    { key: 'searchDtCls', type: 'select', label: '날짜 기준', def: '03',
      options: [{ value: '03', label: '신청일자' }, { value: '01', label: '출원일자' }, { value: '02', label: '등록일자' }] },
    { key: 'cntCls', type: 'select', label: '국내외', def: '',
      options: [{ value: '', label: '전체' }, { value: 'I', label: '국내' },
                { value: 'O', label: '국외' }, { value: 'M', label: 'PCT' }] }
  ];

  var ST = function () { return window.KrissStatsTool || null; };
  var PE = function () { return window.KrissPaperEval || null; };
  function internals() { var s = ST(); return (s && s.__internals) ? s.__internals : null; }
  function needPatch(fn) {
    var I = internals();
    if (I && typeof I[fn] === 'function') return I;
    throw new Error('통계추출 v0.8.3 패치(__internals 공개)가 필요합니다. ' +
      'kriss_statstool_patch_v0_8_3.md 의 편집 1건을 적용하세요.');
  }

  // ctx.step 미지원 구버전에서도 동작하도록 감싼다.
  function stepper(ctx) {
    return function (text, pct) {
      if (ctx.step) ctx.step(text, pct);
      else if (ctx.log) ctx.log(text);
    };
  }

  function yn(v) { return /^y/i.test(String(v == null ? '' : v).trim()); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  /* --- 보유특허 판정 규칙 (보정은 이 블록만 수정) ----------------------
     근거: 지식재산권 마스터 응답 필드(구조문서 §6.7). 값 체계가 확인되지 않은
     항목은 플래그 Y/N 판정으로만 사용하고, 판정 근거를 행마다 기록한다. */
  var HOLD_RULES = {
    patentType: /특허/,                                   // ivenTypNm
    expiredState: /소멸|포기|취하|거절|무효|말소|철회|거절결정/,  // masterApvNm + detailApvNm
    utilizeFlags: [
      ['기술이전', 'techTrnsYn'],
      ['출자', 'investmentYn'],
      ['당해양도', 'seaTrnsYn'],
      ['마케팅', 'marketingYn']
    ],
    contractField: 'ctrctNos',
    unuseField: 'unuseYn',
    strategyField: 'ownStrgyYn'
  };
  function regionOf(v) {
    var t = String(v == null ? '' : v).trim();
    return (t === '국내' || t === '국외' || t === 'PCT') ? t : '기타';
  }

  /* --- 연차관리 API 경로 후보 -----------------------------------------
     구조문서 §6.8은 API 이름만 확정(selectIprsPmMgmtList)이고 실경로는 [미확인].
     §6.5의 등록관리 사례(화면 reg / 실경로 intellReg)처럼 어긋날 수 있어 후보를
     순차 시도하고, 성공한 경로를 산출조건 시트와 로그에 기록한다(재정찰 대체). */
  var PM_PATHS = [
    '/pms/iprs/pm/selectIprsPmMgmtList.json',
    '/pms/iprs/pm/selectIprsPmList.json',
    '/pms/iprs/intellPm/selectIprsPmMgmtList.json',
    '/pms/iprs/pm/selectIprsPmPsrvMngBpmList.json',
    '/pms/iprs/mng/selectIprsPmMgmtList.json'
  ];
  var PM_BODIES = [
    { label: '기본(빈 본문)', body: {} },
    { label: '검색폼형', body: { rqstStrDt: '', rqstEndDt: '', apvStat: '', item: '', keyword: '' } },
    { label: '검색폼형+q_first', body: { q_first: 'Y', rqstStrDt: '', rqstEndDt: '', apvStat: '', item: '', keyword: '' } }
  ];
  var PM_PAGING = { take: 2000, skip: 0, page: 1, pageSize: 2000, pageNum: 1, pageSkip: 0, pageTake: 2000 };
  var PM_FOUND = null;   // { path, bodyLabel, body }

  // 후보 조합을 순차 시도. 행이 나오는 조합을 우선 채택하고, 없으면 응답만 온 조합을 기록.
  async function pmProbe(api, logf) {
    if (PM_FOUND) return PM_FOUND;
    var responded = null;
    for (var i = 0; i < PM_PATHS.length; i++) {
      for (var j = 0; j < PM_BODIES.length; j++) {
        var body = Object.assign({}, PM_BODIES[j].body, PM_PAGING);
        try {
          var env = await api.post(PM_PATHS[i], body);
          var rows = envRows(env);
          if (String(env.errorCode || '') === '400') continue;
          if (rows.length) {
            PM_FOUND = { path: PM_PATHS[i], bodyLabel: PM_BODIES[j].label, body: body, total: envTotal(env), rows: rows };
            if (logf) logf('경로 확인: ' + PM_FOUND.path + ' (' + PM_FOUND.bodyLabel + ')');
            return PM_FOUND;
          }
          if (!responded) responded = { path: PM_PATHS[i], bodyLabel: PM_BODIES[j].label, body: body, total: envTotal(env), rows: [] };
        } catch (e) { /* 다음 후보 */ }
      }
    }
    if (responded) { PM_FOUND = responded; if (logf) logf('응답은 왔으나 0건: ' + responded.path); return PM_FOUND; }
    return null;
  }

  // 납부기한 후보 열 자동 탐지
  function pmDueKey(row) {
    var keys = Object.keys(row || {});
    var pat = [/^payDueDt$/i, /dueDt$/i, /payDt$/i, /납부/, /기한/, /expDt$/i];
    for (var i = 0; i < pat.length; i++) {
      var hit = keys.find(function (k) { return pat[i].test(k); });
      if (hit) return hit;
    }
    return null;
  }
  function isoOf(v) {
    var s = String(v == null ? '' : v).trim();
    var m = s.match(/^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/);
    return m ? (m[1] + '-' + m[2] + '-' + m[3]) : '';
  }
  function daysBetween(a, b) {
    if (!a || !b) return null;
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }

  var LEDGER_URL = 'https://krisstar.kriss.re.kr/pms/res/techtrns/S_ACC_01080250.do';

  var MEDIUM_OPTS = [
    { value: '01', label: '국내논문' }, { value: '02', label: '국외논문' },
    { value: '03', label: '국내학회' }, { value: '04', label: '국제학회' }
  ];

  /* --- 지출결의 조회 본문 (실측 파라미터) ------------------------------ */
  function expBody(p, docuType, status) {
    return {
      billCls: '1', cdCls: 'AC11',
      rqstDtFr: (p && p.from) || '', rqstDtTo: (p && p.to) || '',
      rqstDeptNm: '', rqstDept: '', rqstEmpNm: '', rqstEmp: '',
      reslDtFr: '', reslDtTo: '', dangYn: '', billNo: '',
      docuType: docuType == null ? '27' : docuType,
      acctStatus: status || '',
      frAmt: '', toAmt: '', rqstNo: '', reslNo: '', jiRqstNo: '',
      order: '1', busiRegNm: '', busiRegNo: '', errorYn: 'A'
    };
  }
  var EXP_URL = '/mis/acc/expndtrMng/expndtrResol/selectExpsMangPayout.json';
  var EXP_COLS = ['발의번호', '발의일자', '발의자', '결의금액', '적요', '결의번호',
    '특허_국내해외', '특허_단계', '특허_국가', '특허_비용성격', '특허_PCT', '특허_건수', '특허_분류방식'];

  // 지출결의 원시행 → 분류 포함 한글 레코드
  function expRecords(rows) {
    var s = ST();
    var cls = (s && s.classifyPatentExpense) ? s.classifyPatentExpense : function () { return {}; };
    return rows.map(function (r) {
      var c = cls(r.rqstDesc) || {};
      return {
        '발의번호': r.rqstNo || '',
        '발의일자': ymd2iso(r.rqstDt),
        '발의자': r.rqstEmp || '',
        '결의금액': num(r.drAmt),
        '적요': r.rqstDesc || '',
        '결의번호': r.reslNo || '',
        '특허_국내해외': c.region || '', '특허_단계': c.stage || '',
        '특허_국가': c.country || '', '특허_비용성격': c.cost || '',
        '특허_PCT': c.pct || '', '특허_건수': c.count == null ? '' : c.count,
        '특허_분류방식': c.method || ''
      };
    });
  }

  /* --- 사전점검 정의 --------------------------------------------------- */
  var CHK = {
    rosterTarget: {
      id: 'roster_target', label: '인사평가 대상자 명단',
      run: async function () {
        var p = PE();
        if (!p) return { ok: false, detail: '논문평가 스크립트 미로드' };
        var d = p.data().target;
        return d ? { ok: true, detail: d.records.length + '명 (' + d.label + ')' }
                 : { ok: false, detail: '미등록. 논문평가 패널 [원자료] 탭에서 올리세요' };
      }
    },
    rosterRegular: {
      id: 'roster_regular', label: '정규직 명단',
      run: async function () {
        var p = PE();
        if (!p) return { ok: false, detail: '논문평가 스크립트 미로드' };
        var d = p.data().regular;
        return d ? { ok: true, detail: d.records.length + '명' }
                 : { ok: false, detail: '미등록. 부서평가 산출 불가' };
      }
    },
    jcr: {
      id: 'jcr', label: 'JCR 에디션 내장',
      run: async function () {
        var p = PE();
        if (!p) return { ok: false, detail: '논문평가 스크립트 미로드' };
        var ys = p.jcrYears();
        return ys.length ? { ok: true, detail: p.jcrStatus() }
                         : { ok: false, detail: '없음. 게재연도 −2 에디션을 올리세요' };
      }
    },
    statsTool: {
      id: 'stats_tool', label: '통계추출 스크립트 로드',
      run: async function () {
        var s = ST();
        return s ? { ok: true, detail: 'v' + (s.version || '?') }
                 : { ok: false, detail: '이 탭에 로드되지 않음' };
      }
    },
    patch: {
      id: 'patch', label: '통계추출 __internals 패치',
      run: async function () {
        var I = internals();
        if (!I) return { ok: false, detail: '미적용. kriss_statstool_patch_v0_8_3.md 참조' };
        var miss = ['computeIprsCounts', 'computeNST', 'computePaperStats', 'importIprsRows']
          .filter(function (k) { return typeof I[k] !== 'function'; });
        return miss.length ? { ok: false, detail: '누락: ' + miss.join(', ') }
                           : { ok: true, detail: '집계 4종 사용 가능' };
      }
    },
    pmPath: {
      id: 'pm_path', label: '연차관리 API 경로 (추정 후보 탐색)',
      run: async function (ctx) {
        var f = await pmProbe(ctx.api, ctx.log);
        if (!f) return { ok: false, detail: '후보 ' + PM_PATHS.length + '종 모두 실패. 재정찰 필요(구조문서 §15-7)' };
        return f.rows.length
          ? { ok: true, detail: f.path + ' · ' + f.bodyLabel + ' · ' + f.rows.length + '행' }
          : { ok: false, detail: '응답은 수신, 0건: ' + f.path + '. 파라미터 재정찰 필요' };
      }
    },
    classifier: {
      id: 'classifier', label: '특허비 적요 분류기',
      run: async function () {
        var s = ST();
        return (s && s.classifyPatentExpense) ? { ok: true, detail: '사용 가능' }
                                              : { ok: false, detail: '미로드. 분류 없이 원자료만 출력' };
      }
    }
  };

  /* =====================================================================
   * 매니페스트
   * ===================================================================*/
  var MANIFESTS = [

    /* --- 1. 논문실적 인사평가 점수 --------------------------------------- */
    {
      id: 'paper_eval',
      version: '0.3.2',
      title: '논문실적 인사평가 점수',
      subtitle: '개인 점수합계 + 부서 목표대비 점수',
      group: '논문·인사',
      keywords: ['논문', '인사평가', 'JCR', '부서점수', 'paper', 'eval'],
      needs: ['인사평가 대상자 명단', '정규직 명단', 'JCR 에디션 내장'],
      checks: [CHK.rosterTarget, CHK.rosterRegular, CHK.jcr],
      params: [
        { key: 'period', type: 'period', gran: 'ym', label: '게재일' },
        { key: 'medium', type: 'multi', label: '발표매체', def: ['01', '02'], options: MEDIUM_OPTS }
      ],
      outputs: ['xlsx'],
      readOnly: true,
      run: async function (ctx) {
        var p0 = PE();
        if (!p0) throw new Error('논문평가 스크립트가 이 탭에 로드되지 않았습니다');
        var p = ctx.params.period || {};
        if (!p.from || !p.to) throw new Error('게재일 기간을 입력하세요 (예: 2025)');

        var step = stepper(ctx);
        step('RawData 조회 ' + p.from + ' ~ ' + p.to, 0.15);
        var ds = await p0.fetchRawData({ from: p.from, to: p.to, medium: ctx.params.medium });
        p0.setRules({ periodFrom: p.from + '-01', periodTo: lastDayOfMonth(p.to) || (p.to + '-28') });

        step(ds.records.length.toLocaleString() + '행 · 점수 계산', 0.6);
        var R = p0.run({});
        step('시트 구성', 0.9);
        var persons = Object.keys(R.perPerson).map(function (k) { return R.perPerson[k]; })
          .sort(function (a, b) { return b.sum - a.sum; });

        var indiv = [hdr(['본부/소', '부서명', '사번', '성명', '인정논문수', '논문점수합계'])]
          .concat(persons.map(function (x) {
            return [x.hq, x.dept, String(x.sabun), x.name, x.cnt, Math.round(x.sum * 100) / 100];
          }));
        var dc = ['본부', '목표건수', '실적건수', '달성률(%p)', '부서점수', '10점환산'];
        var dept = [hdr(dc)].concat(R.deptResult.map(function (d) {
          return [d['본부'], d['목표건수'], d['실적건수'], d['달성률(%p)'], d['부서점수'], d['10점환산']];
        }));

        return {
          rows: ds.records.length,
          note: '개인 ' + persons.length + '명',
          sheets: [
            { name: '논문_개인점수', aoa: indiv, cols: [22, 20, 12, 12, 12, 14] },
            { name: '논문_부서점수', aoa: dept, cols: dc.map(function () { return 13; }) },
            { name: '논문_계산백데이터', aoa: recordsToAoa(R.rows) }
          ]
        };
      }
    },

    /* --- 2. 논문 RawData 원자료 ----------------------------------------- */
    {
      id: 'tets_raw',
      version: '0.8.2',
      title: '논문 RawData 원자료',
      subtitle: '개인저작물 38필드 전량 추출',
      group: '논문·인사',
      keywords: ['논문', '원자료', 'RawData', 'tets', '개인저작물'],
      needs: ['통계추출 스크립트 로드'],
      checks: [CHK.statsTool],
      params: [{ key: 'period', type: 'period', gran: 'ym', label: '게재일' }],
      outputs: ['xlsx'],
      readOnly: true,
      run: async function (ctx) {
        var s = ST();
        if (!s || !s.importTetsDirect) throw new Error('통계추출 스크립트가 이 탭에 로드되지 않았습니다');
        var step = stepper(ctx);
        var p = ctx.params.period || {};
        step('직접 조회 ' + (p.from || '전체') + ' ~ ' + (p.to || '전체'), 0.2);
        var ds = await s.importTetsDirect({ fromYyMm: p.from, toYyMm: p.to });
        step(ds.records.length.toLocaleString() + '행 정리', 0.85);
        return {
          rows: ds.records.length, total: ds.total,
          sheets: [{ name: '논문_원자료',
            aoa: recordsToAoa(ds.records, ds.columns.map(function (c) { return c.name; })) }]
        };
      }
    },

    /* --- 3. 연도별 논문 통계 -------------------------------------------- */
    {
      id: 'paper_stats',
      version: '0.2.0',
      title: '연도별 논문 통계',
      subtitle: '고유 논문수 · 성별 · 발표구분 · 교신저자',
      group: '논문·인사',
      keywords: ['논문', '연도별', '통계', '성별', '교신저자', 'stats'],
      needs: ['통계추출 스크립트 로드', '통계추출 __internals 패치'],
      checks: [CHK.statsTool, CHK.patch],
      params: [{ key: 'period', type: 'period', gran: 'ym', label: '게재일' }],
      outputs: ['xlsx'],
      readOnly: true,
      run: async function (ctx) {
        var I = needPatch('computePaperStats');
        var s = ST();
        var step = stepper(ctx);
        var p = ctx.params.period || {};
        step('RawData 조회', 0.2);
        var ds = await s.importTetsDirect({ fromYyMm: p.from, toYyMm: p.to });
        step(ds.records.length.toLocaleString() + '행 · 연도별 집계', 0.7);
        var res = I.computePaperStats(ds);
        if (!res) throw new Error('집계 실패. 논문 RawData 스키마를 확인하세요');
        return {
          rows: ds.records.length, total: ds.total,
          sheets: [
            { name: '논문_연도별통계', aoa: res.resultAOA },
            { name: '논문_산출조건', aoa: res.meta, cols: [30, 80] }
          ]
        };
      }
    },

    /* --- 4. 특허비 지출결의 분류 ---------------------------------------- */
    {
      id: 'exp_class',
      version: '0.2.0',
      title: '특허비 지출결의 (적요 분류)',
      subtitle: '국내외 · 단계 · PCT 분류 포함 원자료',
      group: '비용·회계',
      keywords: ['특허비', '지출결의', '적요', '연차료', '중간사건', 'expense'],
      needs: ['특허비 적요 분류기'],
      checks: [CHK.classifier],
      params: [
        { key: 'period', type: 'period', gran: 'ymd', label: '발의일자' },
        { key: 'docuType', type: 'select', label: '지출구분', def: '27',
          options: [{ value: '27', label: '특허 출원/등록/연차료' }, { value: '', label: '전체' }] },
        { key: 'status', type: 'select', label: '결재상태', def: '',
          options: [{ value: '', label: '전체' }, { value: '04', label: '결재완료' }] }
      ],
      outputs: ['xlsx'],
      readOnly: true,
      run: async function (ctx) {
        var step = stepper(ctx);
        var p = ctx.params.period || {};
        step('지출결의 조회', 0.2);
        var env = await ctx.api.post(EXP_URL, expBody(p, ctx.params.docuType, ctx.params.status));
        var rows = envRows(env);
        if (!rows.length) return { rows: 0, total: envTotal(env), note: '0건. 기간·지출구분 확인' };
        step(rows.length.toLocaleString() + '행 적요 분류', 0.7);
        var recs = expRecords(rows);
        var ok = recs.filter(function (r) { return r['특허_국내해외'] && r['특허_국내해외'] !== '미분류'; }).length;
        return {
          rows: recs.length, total: envTotal(env),
          note: '국내외 분류 ' + (ok / recs.length * 100).toFixed(1) + '%',
          sheets: [{ name: '특허비_지출결의', aoa: recordsToAoa(recs, EXP_COLS),
            cols: [14, 12, 10, 14, 60, 14, 12, 12, 10, 16, 10, 8, 16] }]
        };
      }
    },

    /* --- 5. 연도별 특허비 보고서 ---------------------------------------- */
    {
      id: 'nst_report',
      version: '0.2.0',
      title: '연도별 특허비 보고서',
      subtitle: '국내/국외 × 출원·등록·유지 (국외는 PCT 구분)',
      group: '비용·회계',
      keywords: ['특허비', '보고서', '연도별', 'NST', '제출자료', '백만원'],
      needs: ['특허비 적요 분류기', '통계추출 __internals 패치'],
      checks: [CHK.classifier, CHK.patch],
      params: [
        { key: 'period', type: 'period', gran: 'ymd', label: '발의일자' },
        { key: 'unit', type: 'select', label: '단위', def: '백만원',
          options: [{ value: '백만원', label: '백만원 (반올림)' }, { value: '원', label: '원' }] }
      ],
      outputs: ['xlsx'],
      readOnly: true,
      run: async function (ctx) {
        var I = needPatch('computeNST');
        var s = ST();
        var step = stepper(ctx);
        var p = ctx.params.period || {};
        step('지출결의 조회', 0.15);
        var env = await ctx.api.post(EXP_URL, expBody(p, '27', ''));
        var rows = envRows(env);
        if (!rows.length) return { rows: 0, total: envTotal(env), note: '0건. 기간 확인' };

        step(rows.length.toLocaleString() + '행 분류', 0.5);
        var recs = expRecords(rows);
        s.addDataset(EXP_COLS, recs, '런처 지출결의 ' + (p.from || '전체') + '~' + (p.to || '전체'));
        var ds = s.getActiveDataset();

        step('연도별 보고서 산출', 0.8);
        var res = I.computeNST(ds, {
          unit: ctx.params.unit || '백만원',
          yFrom: yearOnly(p.from), yTo: yearOnly(p.to)
        });
        if (!res) throw new Error('보고서 산출 실패. 분류 열이 있는지 확인하세요');
        return {
          rows: recs.length, total: envTotal(env),
          note: '단위 ' + (ctx.params.unit || '백만원'),
          sheets: [
            { name: '특허비_연도별보고서', aoa: res.resultAOA },
            { name: '특허비_산출조건', aoa: res.meta, cols: [30, 80] },
            { name: '특허비_백데이터', aoa: recordsToAoa(res.backRecords, res.backCols) }
          ]
        };
      }
    },

    /* --- 6. 지식재산권 마스터 ------------------------------------------- */
    {
      id: 'iprs_master',
      version: '0.2.0',
      title: '지식재산권 마스터',
      subtitle: '연도별 출원·등록 건수 + 68필드 원자료',
      group: '지재권',
      keywords: ['지재권', '마스터', '특허', '출원', '등록', 'iprs', 'master'],
      needs: ['통계추출 __internals 패치'],
      checks: [CHK.statsTool, CHK.patch],
      params: MASTER_PARAMS,
      outputs: ['xlsx'],
      readOnly: true,
      run: async function (ctx) {
        var step = stepper(ctx);
        step('마스터 조회', 0.2);
        var env = await ctx.api.postCached(MASTER_URL, masterBody(ctx.params));
        var rows = envRows(env);
        if (!rows.length) return { rows: 0, total: envTotal(env), note: '0건. 날짜 기준·기간 확인' };
        step(rows.length.toLocaleString() + '행 수신', 0.6);

        var I = internals();
        var s = ST();
        if (I && I.importIprsRows && I.computeIprsCounts) {
          ctx.log('한글 헤더 변환 + 연도별 건수 집계 (원본 규칙 재사용)');
          I.importIprsRows(rows, '런처 조회');
          var ds = s.getActiveDataset();
          var agg = I.computeIprsCounts(ds);
          var sheets = [];
          if (agg) {
            sheets.push({ name: '지재권_연도별건수', aoa: agg.resultAOA });
            sheets.push({ name: '지재권_산출조건', aoa: agg.meta, cols: [30, 80] });
          }
          sheets.push({ name: '지재권_마스터',
            aoa: recordsToAoa(ds.records, ds.columns.map(function (c) { return c.name; })) });
          return { rows: ds.records.length, total: envTotal(env), sheets: sheets };
        }
        ctx.log('패치 미적용. 서버 필드명으로 원자료만 출력합니다');
        return {
          rows: rows.length, total: envTotal(env), note: '집계 미적용(패치 필요)',
          sheets: [{ name: '지재권_마스터', aoa: recordsToAoa(rows) }]
        };
      }
    },


    /* --- 7. 보유특허 활용·미활용 ---------------------------------------- */
    {
      id: 'iprs_holding',
      version: '0.2.0',
      title: '보유특허 활용·미활용',
      subtitle: '보유 판정 + 활용 근거별 분류 (판정근거 열 포함)',
      group: '지재권',
      keywords: ['보유특허', '활용', '미활용', '기술이전', '유휴특허', 'holding'],
      needs: ['포털 로그인 세션'],
      checks: [],
      params: MASTER_PARAMS.concat([
        { key: 'asOf', type: 'text', label: '기준일', placeholder: 'YYYY-MM-DD (비우면 오늘)' }
      ]),
      outputs: ['xlsx'],
      readOnly: true,
      note: '소멸 판정은 상태명 문자열과 소멸예정일에 근거합니다. 규칙은 어댑터 HOLD_RULES에서 보정하세요.',
      run: async function (ctx) {
        var step = stepper(ctx);
        var asOf = isoOf(ctx.params.asOf) || today();
        step('마스터 조회 (기준일 ' + asOf + ')', 0.2);
        var env = await ctx.api.postCached(MASTER_URL, masterBody(ctx.params));
        var rows = envRows(env);
        if (!rows.length) return { rows: 0, total: envTotal(env), note: '0건. 날짜 기준·기간 확인' };

        step('보유·활용 판정 ' + rows.length.toLocaleString() + '건', 0.65);
        var SUM = {};       // 구분|지역 → 카운터
        var UTIL = {};      // 활용 근거 → 건수
        var conflicts = [];
        var detail = [];

        rows.forEach(function (r) {
          var isPat = HOLD_RULES.patentType.test(String(r.ivenTypNm || ''));
          var kind = isPat ? '특허' : '특허외';
          var region = regionOf(r.cntClsNm);
          var stateTxt = String(r.masterApvNm || '') + ' ' + String(r.detailApvNm || '');
          var regNo = String(r.intellRegNo == null ? '' : r.intellRegNo).trim();
          var expDt = isoOf(r.expectExpDt);

          // 보유 상태 판정
          var status, why;
          if (HOLD_RULES.expiredState.test(stateTxt)) { status = '소멸·처분'; why = '상태명 매칭'; }
          else if (!regNo) { status = '출원중'; why = '등록번호 없음'; }
          else if (expDt && expDt < asOf) { status = '소멸·처분'; why = '소멸예정일 경과(' + expDt + ')'; }
          else { status = '보유'; why = '등록번호 보유'; }

          // 활용 근거 수집
          var basis = [];
          HOLD_RULES.utilizeFlags.forEach(function (f) { if (yn(r[f[1]])) basis.push(f[0]); });
          if (String(r[HOLD_RULES.contractField] == null ? '' : r[HOLD_RULES.contractField]).trim()) basis.push('계약보유');
          var unuse = yn(r[HOLD_RULES.unuseField]);
          var strategy = yn(r[HOLD_RULES.strategyField]);

          var use, useWhy;
          if (basis.length) { use = '활용'; useWhy = basis.join('+'); }
          else if (unuse) { use = '미활용'; useWhy = '미활용 플래그'; }
          else if (strategy) { use = '미활용'; useWhy = '전략보유(활용실적 없음)'; }
          else { use = '미활용'; useWhy = '활용 근거 없음'; }

          var conflict = (basis.length && unuse) ? '활용근거와 미활용 플래그 동시' : '';
          if (conflict) conflicts.push({
            '관리번호': r.intellMngNo || '', '발명명칭': r.ivenNm || '',
            '활용근거': basis.join('+'), '미활용플래그': 'Y', '검토사유': conflict
          });

          var col = (status === '보유') ? (use === '활용' ? '보유_활용' : '보유_미활용') : status;
          var key = kind + '|' + region;
          SUM[key] = SUM[key] || { 보유_활용: 0, 보유_미활용: 0, 출원중: 0, '소멸·처분': 0 };
          SUM[key][col]++;
          if (status === '보유' && use === '활용') basis.forEach(function (b) { UTIL[b] = (UTIL[b] || 0) + 1; });

          detail.push({
            '관리번호': r.intellMngNo || '', '신청번호': r.intellRqstNo || '',
            '지재권구분': r.ivenTypNm || '', '국내외': r.cntClsNm || '', '출원국가': r.aplyNtnNm || '',
            '발명명칭': r.ivenNm || '', '주발명자': r.mainIvenEmpNm || '',
            '특허상태': r.masterApvNm || '', '상태세부': r.detailApvNm || '',
            '출원일자': isoOf(r.intellAplyDt), '출원번호': r.intellAplyNo || '',
            '등록일자': isoOf(r.intellRegDt), '등록번호': regNo,
            '소멸예정일': expDt,
            '보유판정': status, '보유판정근거': why,
            '활용판정': (status === '보유') ? use : '-', '활용판정근거': (status === '보유') ? useWhy : '-',
            '플래그충돌': conflict,
            '주과제명': r.projNm1 || '', '비용누계': num(r.rqstAmtSum)
          });
        });

        // 요약표
        var cols = ['보유_활용', '보유_미활용', '출원중', '소멸·처분'];
        var head = ['구분', '국내외'].concat(cols, ['보유계', '전체']);
        var keys = Object.keys(SUM).sort();
        var tot = new Array(head.length - 2).fill(0);
        var body = keys.map(function (k) {
          var pt = k.split('|'), c = SUM[k];
          var hold = c['보유_활용'] + c['보유_미활용'];
          var all = hold + c['출원중'] + c['소멸·처분'];
          var row = [pt[0], pt[1], c['보유_활용'], c['보유_미활용'], c['출원중'], c['소멸·처분'], hold, all];
          row.slice(2).forEach(function (v, i) { tot[i] += v; });
          return row;
        });
        var summary = [hdr(head)].concat(body, [['합계', ''].concat(tot)]);

        var util = [hdr(['활용 근거', '건수', '비고'])].concat(
          Object.keys(UTIL).sort(function (a, b) { return UTIL[b] - UTIL[a]; }).map(function (k) {
            return [k, UTIL[k], '한 건이 여러 근거를 가질 수 있어 합계가 활용 건수보다 클 수 있습니다'];
          }));

        var rules = [
          hdr(['항목', '값']),
          ['생성시각', new Date().toLocaleString('ko-KR')],
          ['기준일', asOf],
          ['원천', '지식재산권 마스터 selectIntellAplyList.json (cls=detail)'],
          ['특허 판정', '지재권구분에 ' + String(HOLD_RULES.patentType) + ' 매칭 시 특허'],
          ['소멸 판정', '상태명(특허상태+상태세부)에 ' + String(HOLD_RULES.expiredState) + ' 매칭, 또는 소멸예정일 < 기준일'],
          ['출원중 판정', '등록번호 없음'],
          ['활용 판정', HOLD_RULES.utilizeFlags.map(function (f) { return f[0]; }).join(' / ') + ' 플래그 Y 또는 계약번호 존재'],
          ['미활용 판정', '활용 근거 없음. 미활용 플래그 Y 또는 전략보유는 근거 문구로 구분'],
          ['플래그 충돌', '활용 근거와 미활용 플래그가 동시에 있는 건은 활용으로 집계하고 검토 시트에 별도 기록'],
          ['검증', '명세 시트의 보유판정근거·활용판정근거 열에서 행별 근거 확인'],
          ['확인 불가', '소멸 상태 문자열 체계가 실측 확정되지 않았습니다. 검토 시트와 명세를 대조해 HOLD_RULES를 보정하세요']
        ];

        var sheets = [
          { name: '보유특허_요약', aoa: summary, cols: [10, 10, 12, 13, 10, 12, 10, 10] },
          { name: '보유특허_활용유형', aoa: util, cols: [16, 10, 60] },
          { name: '보유특허_명세', aoa: recordsToAoa(detail) },
          { name: '보유특허_산출조건', aoa: rules, cols: [16, 90] }
        ];
        if (conflicts.length) sheets.splice(3, 0, { name: '보유특허_검토', aoa: recordsToAoa(conflicts), cols: [14, 46, 20, 12, 30] });

        return {
          rows: rows.length, total: envTotal(env),
          note: '보유 ' + (tot[0] + tot[1]) + '건 (활용 ' + tot[0] + ' / 미활용 ' + tot[1] + ')' +
                (conflicts.length ? ' · 검토 ' + conflicts.length + '건' : ''),
          sheets: sheets
        };
      }
    },

    /* --- 8. 연차유지 조사 ----------------------------------------------- */
    {
      id: 'pm_annuity',
      version: '0.2.0',
      title: '연차유지 조사',
      subtitle: '납부기한 임박 목록 + 전량 원자료',
      group: '지재권',
      keywords: ['연차', '연차료', '유지', '납부기한', '권리소멸', 'annuity', 'pm'],
      needs: ['연차관리 API 경로 (추정 후보 탐색)'],
      checks: [CHK.pmPath],
      params: [
        { key: 'dday', type: 'number', label: '임박 기준(일)', def: 90 },
        { key: 'asOf', type: 'text', label: '기준일', placeholder: 'YYYY-MM-DD (비우면 오늘)' }
      ],
      outputs: ['xlsx'],
      readOnly: true,
      note: '연차관리 API 실경로는 구조문서에서 미확인 상태입니다. 후보를 순차 시도하고 확인된 경로를 산출조건 시트에 기록합니다.',
      run: async function (ctx) {
        var asOf = isoOf(ctx.params.asOf) || today();
        var dd = (ctx.params.dday == null || isNaN(ctx.params.dday)) ? 90 : Number(ctx.params.dday);

        var step = stepper(ctx);
        step('API 경로 탐색', 0.1);
        var f = await pmProbe(ctx.api, ctx.log);
        if (!f) throw new Error('연차관리 API 경로를 찾지 못했습니다. 후보 ' + PM_PATHS.length +
          '종 실패. 연차관리 화면에서 개발자도구 Network 탭의 요청 1건을 확보해 PM_PATHS에 추가하세요.');
        var rows = f.rows;
        if (!rows.length) throw new Error('경로 ' + f.path + ' 는 응답하지만 0건입니다. 필수 파라미터 재정찰이 필요합니다.');

        step(rows.length.toLocaleString() + '행 수신 · 기한 판정', 0.7);
        var dueKey = pmDueKey(rows[0]);
        ctx.log('납부기한 열 추정: ' + (dueKey || '탐지 실패'));

        var imminent = [];
        var byMonth = {};
        var enriched = rows.map(function (r) {
          var o = Object.assign({}, r);
          if (dueKey) {
            var due = isoOf(r[dueKey]);
            var d = daysBetween(asOf, due);
            o.__납부기한 = due;
            o.__남은일수 = (d == null) ? '' : d;
            if (due) {
              var ym = due.slice(0, 7);
              byMonth[ym] = (byMonth[ym] || 0) + 1;
              if (d != null && d <= dd) imminent.push(o);
            }
          }
          return o;
        });
        imminent.sort(function (a, b) { return (a.__남은일수 === '' ? 1e9 : a.__남은일수) - (b.__남은일수 === '' ? 1e9 : b.__남은일수); });

        var sheets = [];
        if (dueKey) {
          sheets.push({ name: '연차_기한임박', aoa: recordsToAoa(imminent) });
          var mk = Object.keys(byMonth).sort();
          sheets.push({ name: '연차_월별기한',
            aoa: [hdr(['기한 월', '건수'])].concat(mk.map(function (k) { return [k, byMonth[k]]; })) });
        }
        sheets.push({ name: '연차_전량', aoa: recordsToAoa(enriched) });
        sheets.push({ name: '연차_산출조건', aoa: [
          hdr(['항목', '값']),
          ['생성시각', new Date().toLocaleString('ko-KR')],
          ['기준일', asOf],
          ['임박 기준', dd + '일 이내'],
          ['확인된 경로', f.path + '  [실측 확인됨]'],
          ['사용한 본문 형태', f.bodyLabel],
          ['본문(JSON)', JSON.stringify(f.body)],
          ['서버 total', f.total == null ? '(미제공)' : f.total],
          ['수신 행수', rows.length],
          ['납부기한 열 추정', dueKey || '탐지 실패. 파생열 미생성'],
          ['파생열', '__납부기한(ISO), __남은일수(기준일 기준)'],
          ['후속 조치', '확인된 경로를 시스템 구조 문서 §6.8·§15-7에 [실측]으로 반영하십시오'],
          ['확인 불가', '응답 필드 체계가 실측 확정되지 않아 원자료를 서버 필드명으로 출력합니다']
        ], cols: [18, 96] });

        return {
          rows: rows.length, total: f.total,
          note: dueKey ? ('임박 ' + imminent.length + '건 / ' + dd + '일') : '기한 열 미탐지',
          sheets: sheets
        };
      }
    },

    /* --- 9. 보조원장(기술이전) 지재권 집행내역 --------------------------
       보조원장 스크립트(v1.1)는 화면 Kendo 그리드를 직접 읽고 공개 API가 없어
       콘솔에서 자동 실행할 수 없다. 확정 실패로 남기지 않고, 화면을 새 탭으로
       열어 주면서 워크북에 안내 시트를 남기는 방식으로 처리한다. */
    {
      id: 'ip_ledger',
      version: '0.2.0',
      title: '보조원장 지재권 집행내역',
      subtitle: '화면을 열어 그 화면에서 추출 (자동 실행 불가)',
      group: '비용·회계',
      keywords: ['보조원장', '기술이전', '집행내역', '결의', 'ledger'],
      needs: ['해당 화면 접근 권한'],
      params: [],
      outputs: ['xlsx'],
      readOnly: true,
      note: '화면 그리드를 직접 읽는 구조라 자동 실행이 불가합니다. 실행하면 해당 화면을 새 탭으로 엽니다.',
      run: async function (ctx) {
        var url = LEDGER_URL;
        var opened = false;
        try { opened = !!window.open(url, 'kriss_ip_ledger'); } catch (e) { opened = false; }
        ctx.log(opened ? '보조원장 화면을 새 탭으로 열었습니다' : '팝업이 차단되어 화면을 열지 못했습니다');
        var aoa = [
          hdr(['항목', '내용']),
          ['상태', opened ? '화면을 새 탭으로 열었습니다' : '팝업 차단 — 아래 주소를 직접 열어 주세요'],
          ['주소', url],
          ['추출 방법', '해당 화면 도구 모음의 [기간 조회 후 저장] 또는 [화면 그대로 저장]을 사용하십시오'],
          ['자동 실행 불가 사유', '보조원장 스크립트 v1.1이 화면 Kendo 그리드를 직접 읽으며 공개 API가 없습니다'],
          ['후속 조치', '보조원장 스크립트에 조회·정제 함수를 공개하면 이 항목도 자동 실행으로 전환할 수 있습니다']
        ];
        return {
          rows: 0,
          note: opened ? '화면을 열었습니다 (자동 추출 아님)' : '팝업 차단',
          sheets: [{ name: '보조원장_안내', aoa: aoa, cols: [22, 90] }]
        };
      }
    }
  ];

  /* =====================================================================
   * 번들 프리셋 (최초 1회만 심김. 사용자가 지우면 다시 만들지 않음)
   * ===================================================================*/
  var BUNDLES = [
    {
      id: 'basic_stats_v1',
      name: '기초통계자료',
      cadence: '연 2회',
      items: ['paper_stats', 'iprs_master', 'iprs_holding', 'nst_report'],
      common: {},
      note: '세부 자료 4종(논문게재현황·지식재산권 현황·보유특허·지식재산권 비용). ' +
            '각 항목은 단독 실행도 가능합니다. 지식재산권 현황과 보유특허는 마스터 조회를 공유하므로 API 호출이 1회로 합쳐집니다.'
    },
    {
      id: 'annuity_survey_v1',
      name: '연차유지 조사',
      cadence: '연 4회',
      items: ['pm_annuity'],
      common: { dday: 90 },
      note: '납부기한 임박 목록이 핵심 산출물입니다. 임박 기준(일)은 조사 주기에 맞춰 조정하세요(연 4회면 90일 권장).'
    }
  ];

  /* =====================================================================
   * 등록
   * ===================================================================*/
  function attach() {
    var C = window.KrissConsole;
    if (!C || !C.register) return false;
    MANIFESTS.forEach(function (m) { C.register(m); });
    if (C.registerBundle) BUNDLES.forEach(function (b) { C.registerBundle(b); });
    console.log('[요구자료] 어댑터 v0.2.0 · ' + MANIFESTS.length + '개 항목 등록' +
      (internals() ? ' · __internals 감지' : ' · __internals 미적용'));
    return true;
  }

  if (!attach()) {
    var tries = 0;
    var t = setInterval(function () {
      if (attach() || ++tries > 40) {
        clearInterval(t);
        if (tries > 40) {
          console.warn('[요구자료] 콘솔을 찾지 못했습니다. kriss_console_v0_2_0 설치를 확인하세요.');
        }
      }
    }, 250);
  }
})();