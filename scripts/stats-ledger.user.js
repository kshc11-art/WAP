// ==UserScript==
// @name         KRISS 보조원장(기술이전) 지재권 집행내역 정제·통계 추출
// @namespace    kriss.pms.techtrns.ipledger
// @version      3.3.1
// @description  보조원장(기술이전)을 읽어 사건 문맥으로 정제하고, 국내/해외 2값(PCT=해외)·PCT 여부·권리유형·재원구분 통계를 백데이터와 함께 xlsx로 내보냅니다. 외부 라이브러리 없이 동작(내부망 대응).
// @match        https://krisstar.kriss.re.kr/pms/res/techtrns/S_ACC_01080250.do*
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

/* ---------------------------------------------------------------------------
 * v3.3 변경점 (minor) — 2026-08-27
 *   - '국내/해외 구분'을 국내·해외 2값으로 정규화: PCT는 해외, 저작권(소프트웨어)은 국내.
 *     기존 수기값 PCT/소프트웨어도 각각 해외/국내로 자동 호환한다.
 *   - PCT 여부(Y/N)·권리유형(특허/저작권(소프트웨어)/기타·미확인) 열과 통계 시트 신설.
 *     PCT/KR 출원번호·(PCT) 태그·관리번호 PCT를 강한 PCT 근거로 인식한다.
 *   - 사건번호 강단서 우선순위를 보강하여 명시적 KR 번호가 지출구분 접두어와 충돌할 때 국내로 교정.
 *   - '년차'도 구분2=연차유지로 집계하고, 상세내역 '기타'는 관리비항목을 미분류로 보존.
 * v3.2 변경점 (minor) — 2026-08-11
 *   - X열(국내/해외 구분) 추론을 행 단독 W→X에서 "사건 문맥 2단계" 방식으로 개편.
 *     ① 강한 행 단서 → ② 같은 RESI/출원·등록번호 전파 → ③ W 보조 단서 → ④ 재전파.
 *   - KR 출원번호는 10-YYYY-7자리만 인정. v3.1의 6~7자리 허용으로 해외 사건
 *     (예: 10-2018-107633)이 국내로 과대 판정되던 문제 수정.
 *   - '중간사건비용+국내관납료 → 국내' 단독 규칙 제거. 해외 사건에도 해당 상세내역이
 *     존재하므로 동일 RESI/출원번호의 문맥을 우선한다.
 * v3.1 변경점 (minor) — 2026-08-11
 *   - data W열(상세내역)·적요의 강한 단서를 이용해 X열(국내/해외 구분) 공백을 보충.
 *     기존 확정 region/country/지출구분 우선순위는 유지하며 빈 region만 채운다.
 *     · 적요의 KR 출원·등록번호(10-YYYY-NNNNNN[N] / 10-NNNNNNN) → 국내
 *       (대괄호 정형 적요에도 적용; v3.0은 서술형에만 적용되어 공백 잔존)
 *     · PCT+국제출원 복합근거 → PCT, 국가명(미국·중국·일본·유럽·독일·베트남·대만) → 해외
 *     · 상세내역 해외대리인비용/해외관납료/해외송금수수료 → 해외
 *     · 중간사건비용+국내관납료 → 국내
 *     단, '국내대리인비용' 단독은 해외 사건에도 다수 사용되어 region 추론에 사용하지 않음.
 * v3.0 변경점 (major) — 2026-07-28
 *   [1] 엑셀 업로드 모드: 시스템 '엑셀 저장'(.xlsx) 파일을 외부 라이브러리 없이 판독
 *       (ZIP+deflate 자체 해제, 공유문자열·날짜 일련값 처리, 헤더 자동 매핑).
 *       정찰 실측 결과 화면 그리드에는 사업구분·사업분류 필드가 없어(20컬럼),
 *       재원구분·로데이터 확보에는 업로드 모드가 정본 경로임.
 *   [2] 검토·수정 워크플로: review 대상(및 전체 행 검색)을 화면에서 직접 수정 →
 *       지출구분·상세내역·국내외·재원구분이 data 값에 즉시 반영되고 localStorage에
 *       영속 저장(키: 결의번호|순번|예산코드). 백업 내보내기/불러오기 지원.
 *       수기 확정 행은 review에서 제외되고 비고에 '수기확정' 표기.
 *   [3] 로데이터 보존: 사업구분(원장)·사업분류(대/소)·관리번호(원장)·발의번호·증빙구분·
 *       발행일자·승인번호·카드번호·입금일자·과세표준액·은행명·계좌번호·잔액(원장)·추가정보
 *       열을 말미에 추가(CONFIG.RAW_KEEP). 그리드 수집 시 미제공 항목은 공란.
 *   [4] 컬럼 레지스트리 도입: 전 출력열을 COLUMNS 한 곳에서 정의, CONFIG.COLUMNS_OFF로
 *       열 단위 on/off. 비목코드·비목명은 코드·계정명과 완전 중복(공유문자열 동일 인덱스
 *       실측)이므로 기본 제외.
 *   [5] 그리드 수집분에 사업구분이 전무하면 행별 review 대신 요약 경고 1건으로 대체.
 * v2.2 변경점 (minor) — 2026-07-28
 *   - 서술형 적요 보충 규칙 신설(사양서 §6.4 실측 근거, 원본 4,529행 오탐 0 확인):
 *     · 관리번호 구조 폴백  : '지식재산권' 접두 없는 P######XX 도 관리번호로 인식
 *     · 국내 판정(강)       : KR 출원·등록번호 패턴(10-YYYY-NNNNNNN / 10-NNNNNNN)
 *     · 국내/해외 토큰      : (국내|해외)+특허/연차 직접 수식 시에만 (예: 국내연차유지료)
 *     · 본문 국가명(중)     : 미국·중국·일본·유럽·독일·베트남·대만 → 해외 + 국가코드
 *     · PCT 복합 근거       : 'PCT' + '국제출원' 동시 출현 시에만 PCT (단독 사용 금지 유지)
 *     · 지출구분 일반화     : 연차·년차 → 연차료 / 출원료·출원비 → (국내|해외)출원료·출원료
 *     · 상세내역 일반화     : 송금수수료→해외송금수수료, 납부수수료→국내대리인비용,
 *                            관납료(명시), 국내수수료→국내대리인비용, 송금비용→해외송금수수료,
 *                            연차(수수료 없음)→관납료 [golden 158:1]
 *     빈 필드만 보충하며(기존 확정값 불변), 미기재 항목·환급/반환·지분·말소 건은
 *     review 사유를 세분화하여 기록. STAGE_MAP에 일반형 '출원료'→'출원' 추가.
 *   - 요약 시트·완료 알림에 대체·환원 제외분 차변/대변/순액 표시
 *     (월분 대체 111건이 상계되지 않음이 실측 확인됨에 따른 가시화 — 2026-07-28 방침 확정).
 * v2.1 변경점 (minor) — 2026-07-28, 사양서 v1.2 변경 이력 반영
 *   - 재원구분 신설(29번째 컬럼 + '통계_재원구분' 시트):
 *     판정 우선순위 ① 사업분류(소) 충당부채 키워드 → ② 사업구분 대응표 → ③ 기본값.
 *       출연금        = 기관고유사업 · 전략연구사업
 *       정부수탁      = 국가연구개발사업(과기부·산자부 등)
 *       기술료 준비금 = 사업분류(소) '기술료충당금(연구개발재투자)' · '지식재산권충당부채'
 *                       (지식재산권충당부채 → 기술료 준비금: 2026-07-28 담당자 확정)
 *       기타(민간수탁 등) = 나머지(수탁·대외·기타).
 *       자체연구개발사업은 잠정 '기타(민간수탁 등)' + review 표시(미확정 사항).
 *     기존 28컬럼(비고 포함) 위치는 그대로 보존하고 말미에만 추가(NUM_COL_IDX 불변).
 *   - 수집 필드 2개 추가: busiClsNm(사업구분), busiBusNm(사업분류(소)).
 *   - 출원/유지/등록 구분에서 '출원(선행기술조사비용)'을 '출원'으로 통일.
 *     통계_관리번호별 시트의 '선행조사' 열 삭제.
 * v2.0 변경점 (major)
 *   - SheetJS(@require cdnjs) 의존 제거 → 자체 xlsx 생성 엔진(MiniXLSX) 내장.
 *     내부망에서 CDN 차단 시에도 다중 시트 xlsx 저장 가능.
 *   - 통계 모듈 신설: 연도×국내해외 / 단계 / 지출구분 / 상세내역 / 관리비항목 /
 *     국가 / 사업분류 / 예산 / 전표성격(구분2) 피벗 + 월별 추이 + 관리번호별 누계.
 *   - 요약(summary) 시트: 실행 정보 + 전 통계 시트 총합계 ↔ data 최종값 검산표.
 *   - 백데이터 포함: 모든 저장 파일에 data(28컬럼)·review 시트 동봉.
 *   - 화면 삽입 요소에 data-kriss-ext 속성 부여(사내 원상복구 규약).
 *     긴급 제거: document.querySelectorAll('[data-kriss-ext]').forEach(e=>e.remove())
 * v1.1
 *   - 기간 지정 자동 조회, 월/분기/연 분할 + 중복 제거 누적, 기간 복원, 사후 필터
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

    // (v2.1) 재원구분 규칙 — 판정 우선순위: FUND_BY_BUSI_SO → FUND_BY_CLS → FUND_DEFAULT
    //   ① 사업분류(소) 키워드(충당부채 계열)가 사업구분('기타')보다 우선
    //      · 지식재산권충당부채 → '기술료 준비금' : 2026-07-28 담당자 확정
    //   ② 사업구분 대응표 (자체연구개발사업은 미확정 → 잠정 분류 + review 사유 기록)
    FUND_BY_BUSI_SO: [
      { test: /기술료충당금/,      value: '기술료 준비금' },
      { test: /지식재산권충당부채/, value: '기술료 준비금' }
    ],
    FUND_BY_CLS: {
      '기관고유사업':     '출연금',
      '전략연구사업':     '출연금',
      '국가연구개발사업': '정부수탁',
      '자체연구개발사업': '기타(민간수탁 등)'
    },
    FUND_DEFAULT: '기타(민간수탁 등)',
    FUND_REVIEW_CLS: {
      '자체연구개발사업': '재원구분 미확정(자체연구개발사업) — 잠정 "기타(민간수탁 등)" 분류'
    },

    // 결의일자 → 결의번호 → 순번(문자열) 오름차순 재정렬
    RESORT: true,

    // 누적 결과를 입력 기간으로 한 번 더 거르기 (서버가 넓게 응답하는 경우 대비)
    POST_FILTER_BY_DATE: true,

    // 금액을 숫자로 기록(true, #,##0 서식) / 천단위 콤마 문자열(false)
    AMOUNT_AS_NUMBER: true,

    // 통계 시트 기본 포함 여부 (화면 체크박스 초기값)
    STATS_DEFAULT_ON: true,

    // 특수 통계 시트 on/off
    STATS_SPECIAL: { month: true, mgmt: true },

    // 조회 1회당 최대 대기(ms), 분할 조회 사이 간격(ms)
    QUERY_TIMEOUT: 120000,
    QUERY_GAP: 400,

    // 출력 파일명 접두어 (영문·숫자·언더바만)
    FILE_PREFIX: 'kriss_ip_ledger',

    // (v3.0) 로데이터 열 포함 여부 / 열 단위 제외 목록(COLUMNS 레지스트리 id 기준)
    //   expCd·expNm(비목코드·비목명)은 코드·계정명과 완전 중복(공유문자열 동일 인덱스 실측)이라 기본 제외
    RAW_KEEP: true,
    COLUMNS_OFF: ['expCd', 'expNm'],

    // (v3.0) 수기 확정(검토·수정) 영속 저장 키 — localStorage
    OVERRIDE_KEY: 'kriss_ip_ledger_overrides_v1'
  };

  // 지출구분 → 출원/유지/등록 구분 (v2.1: 선행기술조사료 포함 전부 '출원'으로 통일)
  // (v2.2) 서술형 일반화로 국내/해외 미상 시 '출원료'가 산출될 수 있어 일반형 추가
  const STAGE_MAP = {
    '국내출원료': '출원', '해외출원료': '출원', '중간사건비용': '출원',
    '선행기술조사료': '출원', '출원료': '출원',
    '국내등록료': '등록', '해외등록료': '등록',
    '국내연차료': '유지', '해외연차료': '유지', '연차료': '유지'
  };

  // (v3.0) 출력 컬럼 레지스트리 — 모든 열을 한 곳에서 정의한다.
  //   get(o, p, x): o=원본행, p=parseDesc 결과, x=파생값{seq,grp2,fin,item,fund,manual}
  //   num: 숫자(#,##0) 서식 / raw: 로데이터 보존 열(CONFIG.RAW_KEEP=false면 제외)
  //   9번째 '순번'은 원본 reslSeq — 기존 자료와 동일하게 헤더명이 중복됩니다.
  const COLUMNS = [
    { id: 'seq',      h: '순번',                 get: function (o, p, x) { return x.seq; } },
    { id: 'acctCd',   h: '코드',                 get: function (o) { return o.acctCd; } },
    { id: 'acctNm',   h: '계정명',               get: function (o) { return o.acctNm; } },
    { id: 'reslDt',   h: '결의일자',             get: function (o) { return o.reslDt; } },
    { id: 'reslNo',   h: '결의번호',             get: function (o) { return o.reslNo; } },
    { id: 'gubun',    h: '구분',                 get: function (o) { return o.reslNo ? o.reslNo.charAt(0) : ''; } },
    { id: 'flow',     h: '집행/흡수',            get: function (o) { return CONFIG.ACCT_FLOW[o.acctCd] || CONFIG.DEFAULT_FLOW; } },
    { id: 'grp2',     h: '구분2',                get: function (o, p, x) { return x.grp2; } },
    { id: 'reslSeq',  h: '순번',                 get: function (o) { return o.reslSeq; } },
    { id: 'bizCd',    h: '사업 구분',            get: function (o) { return o.budgCd ? o.budgCd.substr(2, 3) : ''; } },
    { id: 'busiCat',  h: '보조원장 상 사업분류', get: function (o) { return o.busiCatNm; } },
    { id: 'budgCd',   h: '예산코드',             get: function (o) { return o.budgCd; } },
    { id: 'budgNm',   h: '예산명',               get: function (o) { return o.budgNm; } },
    { id: 'expCd',    h: '비목코드',             get: function (o) { return o.expCd; } },   // 기본 OFF(중복)
    { id: 'expNm',    h: '비목명',               get: function (o) { return o.expNm; } },   // 기본 OFF(중복)
    { id: 'busiReg',  h: '거래처',               get: function (o) { return o.busiRegNm; } },
    { id: 'drAmt',    h: '차변금액',  num: true, get: function (o) { return o.drAmt; } },
    { id: 'crAmt',    h: '대변금액',  num: true, get: function (o) { return o.crAmt; } },
    { id: 'fin',      h: '최종값',    num: true, get: function (o, p, x) { return x.fin; } },
    { id: 'desc',     h: '적요',                 get: function (o) { return o.reslDesc; } },
    { id: 'country',  h: '국가 구분',            get: function (o, p) { return p.country; } },
    { id: 'mgmtNo',   h: '지재권 관리번호',      get: function (o, p) { return p.mgmtNo; } },
    { id: 'rightType',h: '권리유형',             get: function (o, p) { return p.rightType; } },
    { id: 'pctYn',    h: 'PCT 여부',             get: function (o, p) { return p.pctYn; } },
    { id: 'item',     h: '항목별-지재권 관리비', get: function (o, p, x) { return x.item; } },
    { id: 'expType',  h: '지출구분',             get: function (o, p) { return p.expType; } },
    { id: 'detail',   h: '상세내역',             get: function (o, p) { return p.detail; } },
    { id: 'region',   h: '국내/해외 구분',       get: function (o, p) { return p.region; } },
    { id: 'stage',    h: '출원/유지/등록 구분',  get: function (o, p) { return p.stage; } },
    { id: 'note',     h: '비고',                 get: function (o, p, x) { return x.manual ? '수기확정' : ''; } },
    { id: 'fund',     h: '재원구분',             get: function (o, p, x) { return x.fund; } },
    // ---- 로데이터 보존 (v3.0) — 업로드 모드 전체 제공, 그리드 모드 일부 제공 ----
    { id: 'busiCls',  h: '사업구분(원장)',  raw: true, get: function (o) { return o.busiClsNm; } },
    { id: 'busiSep',  h: '사업분류(대)',    raw: true, get: function (o) { return o.busiSepNm; } },
    { id: 'busiBus',  h: '사업분류(소)',    raw: true, get: function (o) { return o.busiBusNm; } },
    { id: 'setlKey',  h: '관리번호(원장)',  raw: true, get: function (o) { return o.setlKey; } },
    { id: 'rqstNo',   h: '발의번호',        raw: true, get: function (o) { return o.rqstNo; } },
    { id: 'evdcCls',  h: '증빙구분',        raw: true, get: function (o) { return o.evdcCls; } },
    { id: 'pblcnDt',  h: '발행일자',        raw: true, get: function (o) { return o.pblcnDt; } },
    { id: 'aprvNo',   h: '승인번호',        raw: true, get: function (o) { return o.aprvNo; } },
    { id: 'cardNo',   h: '카드번호',        raw: true, get: function (o) { return o.cardNo; } },
    { id: 'incomeDt', h: '입금일자',        raw: true, get: function (o) { return o.incomeDt; } },
    { id: 'taxBase',  h: '과세표준액', raw: true, num: true, get: function (o) { return o.taxBase; } },
    { id: 'bankNm',   h: '은행명',          raw: true, get: function (o) { return o.bankNm; } },
    { id: 'bankAcctNo', h: '계좌번호',      raw: true, get: function (o) { return o.bankAcctNo; } },
    { id: 'jaAmt',    h: '잔액(원장)', raw: true, num: true, get: function (o) { return o.jaAmt; } },
    { id: 'addInfo',  h: '추가정보',        raw: true, get: function (o) { return o.addInfo; } }
  ];

  function activeColumns() {
    const off = {};
    (CONFIG.COLUMNS_OFF || []).forEach(function (id) { off[id] = 1; });
    return COLUMNS.filter(function (c) { return !off[c.id] && (CONFIG.RAW_KEEP || !c.raw); });
  }
  function headers() { return activeColumns().map(function (c) { return c.h; }); }
  function numColIdx() {
    const out = [];
    activeColumns().forEach(function (c, i) { if (c.num) out.push(i); });
    return out;
  }

  // ---- 통계 정의 ---------------------------------------------------------
  // 미분류 표기
  const UNC = '(미분류)';

  // 통계 축(차원) 정의: get은 rec 객체에서 값 추출, order는 우선 정렬(없으면 문자 정렬)
  const DIMS = {
    y:       { label: '연도',                 get: function (r) { return r.y; } },
    region:  { label: '국내/해외 구분',        get: function (r) { return r.region; },
               order: ['국내', '해외', UNC] },
    pctYn:   { label: 'PCT 여부',             get: function (r) { return r.pctYn; },
               order: ['Y', 'N', UNC] },
    rightType: { label: '권리유형',           get: function (r) { return r.rightType; },
               order: ['특허', '저작권(소프트웨어)', '기타/미확인', UNC] },
    stage:   { label: '출원/유지/등록',        get: function (r) { return r.stage; },
               order: ['출원', '등록', '유지', UNC] },
    fund:    { label: '재원구분',             get: function (r) { return r.fund; },
               order: ['출연금', '정부수탁', '기술료 준비금', '기타(민간수탁 등)', UNC] },
    expType: { label: '지출구분',             get: function (r) { return r.expType; } },
    detail:  { label: '상세내역',             get: function (r) { return r.detail; } },
    item:    { label: '항목별-지재권 관리비',   get: function (r) { return r.item; },
               order: ['관납료', '외부기관 활용비용', UNC] },
    country: { label: '국가 구분',            get: function (r) { return r.country; } },
    busiCat: { label: '보조원장 상 사업분류',   get: function (r) { return r.busiCat; } },
    budg:    { label: '예산',                 get: function (r) { return r.budg; } },
    grp2:    { label: '구분2',               get: function (r) { return r.grp2; },
               order: ['출원,등록 등', '연차유지'] }
  };

  // 피벗 통계 시트 목록 (행 차원 × 열 차원, 값 = 최종값 합계)
  // counts:true 이면 같은 시트 아래에 건수 표를 함께 출력
  const STATS = [
    { id: 'region',  sheet: '통계_국내해외',   row: 'y',       col: 'region', counts: true },
    { id: 'pct',     sheet: '통계_PCT여부',    row: 'y',       col: 'pctYn', counts: true },
    { id: 'right',   sheet: '통계_권리유형',   row: 'y',       col: 'rightType', counts: true },
    { id: 'fund',    sheet: '통계_재원구분',   row: 'y',       col: 'fund',   counts: true },
    { id: 'stage',   sheet: '통계_단계',       row: 'y',       col: 'stage' },
    { id: 'grp2',    sheet: '통계_전표성격',   row: 'y',       col: 'grp2' },
    { id: 'exptype', sheet: '통계_지출구분',   row: 'expType', col: 'y' },
    { id: 'detail',  sheet: '통계_상세내역',   row: 'detail',  col: 'y' },
    { id: 'item',    sheet: '통계_관리비항목', row: 'item',    col: 'y' },
    { id: 'country', sheet: '통계_국가',       row: 'country', col: 'y' },
    { id: 'bizcat',  sheet: '통계_사업분류',   row: 'busiCat', col: 'y' },
    { id: 'budget',  sheet: '통계_예산',       row: 'budg',    col: 'y' }
  ];

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow
          : (typeof window !== 'undefined') ? window : globalThis;
  const $ = function () { return W.jQuery || W.$; };

  function notify(msg) {
    if (typeof alert === 'function') alert(msg);
    else console.log(msg);
  }

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
      busiClsNm: str(m.busiClsNm), busiBusNm: str(m.busiBusNm),   // (v2.1) 재원구분 판정용
      busiSepNm: str(m.busiSepNm),                                 // (v3.0) 로데이터
      setlKey: str(m.setlKey), rqstNo: str(m.rqstNo), evdcCls: str(m.evdcCls),
      pblcnDt: fmtDate(m.pblcnDt), aprvNo: str(m.aprvNo), cardNo: str(m.cardNo),
      incomeDt: fmtDate(m.incomeDt), taxBase: toNum(m.taxBase),
      bankNm: str(m.bankNm), bankAcctNo: str(m.bankAcctNo), jaAmt: toNum(m.jaAmt),
      addInfo: str(m.addInfo),
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
        busiClsNm: get('busiClsNm'), busiBusNm: get('busiBusNm'), busiSepNm: get('busiSepNm'),
        setlKey: get('setlKey'), bankNm: get('bankNm'), bankAcctNo: get('bankAcctNo'), jaAmt: get('jaAmt'),
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
   * [1.5] 엑셀 업로드 리더 (v3.0)
   *   시스템 '엑셀 저장'(.xlsx)을 외부 라이브러리 없이 판독한다.
   *   ZIP 중앙디렉터리 → deflate-raw 해제(DecompressionStream) → 공유문자열/시트 XML
   *   파싱 → 헤더 제목 기반 필드 매핑. 실측: 헤더 1행, "코드: NNNNN" 라벨행,
   *   결의일자·발행일자·입금일자는 날짜 일련값, 중복 '순번' 헤더 2개(둘째=reslSeq).
   * ========================================================================= */
  const XLSX_TITLE_MAP = {
    '코드': 'acctCd', '계정명': 'acctNm', '결의일자': 'reslDt', '결의번호': 'reslNo',
    '예산코드': 'budgCd', '예산명': 'budgNm', '비목코드': 'expCd', '비목명': 'expNm',
    '거래처': 'busiRegNm', '차변금액': 'drAmt', '대변금액': 'crAmt', '잔액': 'jaAmt',
    '적요': 'reslDesc', '관리번호': 'setlKey', '은행명': 'bankNm', '계좌번호': 'bankAcctNo',
    '발의번호': 'rqstNo', '사업구분': 'busiClsNm', '사업분류(대)': 'busiSepNm',
    '사업분류(중)': 'busiCatNm', '사업분류(소)': 'busiBusNm', '증빙구분': 'evdcCls',
    '발행일자': 'pblcnDt', '승인번호': 'aprvNo', '카드번호': 'cardNo',
    '입금일자': 'incomeDt', '과세표준액': 'taxBase', '추가정보': 'addInfo'
  };
  const XLSX_DATE_F = { reslDt: 1, pblcnDt: 1, incomeDt: 1 };
  const XLSX_NUM_F = { drAmt: 1, crAmt: 1, jaAmt: 1, taxBase: 1 };

  function leU16(b, o) { return b[o] | (b[o + 1] << 8); }
  function leU32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function inflateRawBytes(u8) {
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter();
    w.write(u8); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }

  // ZIP 해제 — want(name)이 true인 엔트리만 {name: Uint8Array}로 반환
  async function unzipEntries(bytes, want) {
    const b = bytes;
    let eocd = -1;
    const lo = Math.max(0, b.length - 22 - 65536);
    for (let i = b.length - 22; i >= lo; i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4B && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('xlsx(ZIP) 형식이 아닙니다.');
    const count = leU16(b, eocd + 10);
    let p = leU32(b, eocd + 16);
    const dec = new TextDecoder('utf-8');
    const out = {};
    for (let n = 0; n < count; n++) {
      if (leU32(b, p) !== 0x02014B50) break;
      const method = leU16(b, p + 10);
      const csize = leU32(b, p + 20);
      const nameLen = leU16(b, p + 28), extraLen = leU16(b, p + 30), cmtLen = leU16(b, p + 32);
      const localOff = leU32(b, p + 42);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + cmtLen;
      if (!want(name)) continue;
      const nl = leU16(b, localOff + 26), el = leU16(b, localOff + 28);
      const start = localOff + 30 + nl + el;
      const data = b.subarray(start, start + csize);
      out[name] = (method === 8) ? await inflateRawBytes(data)
                : (method === 0) ? data
                : (function () { throw new Error('지원하지 않는 압축 방식: ' + method); })();
    }
    return out;
  }

  function xmlUnesc(s) {
    return String(s).replace(/&#x([0-9A-Fa-f]+);/g, function (m, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCodePoint(+d); })
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function tTexts(inner) { // <t> 내용 이어붙이기 (rich run 대응)
    let out = '', m;
    const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
    while ((m = re.exec(inner))) out += (m[1] === undefined) ? '' : xmlUnesc(m[1]);
    return out;
  }
  function parseSharedStrings(xml) {
    const out = []; let m;
    const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\/>/g;
    while ((m = re.exec(xml))) out.push(m[1] === undefined ? '' : tTexts(m[1]));
    return out;
  }
  function colRefIdx(ref) {
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }
  function serialToYmd(n) { // 1900 체계, 로컬 밀림 방지 위해 UTC 산술
    const d = new Date((Math.floor(n) - 25569) * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function parseSheetGrid(xml, sst) {
    const rows = [];
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
      const inner = rm[1] || '';
      const arr = [];
      let cm;
      cellRe.lastIndex = 0;
      while ((cm = cellRe.exec(inner))) {
        const attrs = cm[1] || '', body = cm[2] || '';
        let ref = '', t = '', am;
        const attrRe = /([\w:]+)="([^"]*)"/g;
        while ((am = attrRe.exec(attrs))) {
          if (am[1] === 'r') ref = am[2];
          else if (am[1] === 't') t = am[2];
        }
        const ci = ref ? colRefIdx(ref) : arr.length;
        let v = '';
        if (t === 'inlineStr') {
          v = tTexts(body);
        } else {
          const vm = body.match(/<v>([\s\S]*?)<\/v>/);
          const rawV = vm ? vm[1] : '';
          if (t === 's') v = sst[+rawV] !== undefined ? sst[+rawV] : '';
          else if (t === 'str') v = xmlUnesc(rawV);
          else if (t === 'e') v = '';
          else if (t === 'b') v = rawV === '1' ? 1 : 0;
          else v = rawV === '' ? '' : (isFinite(Number(rawV)) ? Number(rawV) : xmlUnesc(rawV));
        }
        arr[ci] = v;
      }
      rows.push(arr);
    }
    return rows;
  }

  // .xlsx 바이트 → pick() 형태 행 배열
  async function parseXlsxBytes(bytes) {
    const files = await unzipEntries(bytes, function (n) {
      return n === 'xl/sharedStrings.xml' || n === 'xl/workbook.xml' || /^xl\/worksheets\/sheet\d*\.xml$/.test(n);
    });
    const dec = new TextDecoder('utf-8');
    const sst = files['xl/sharedStrings.xml'] ? parseSharedStrings(dec.decode(files['xl/sharedStrings.xml'])) : [];
    let sheetName = null, sheetLen = -1;   // 데이터 시트 = 가장 큰 시트
    Object.keys(files).forEach(function (n) {
      if (/^xl\/worksheets\/sheet\d*\.xml$/.test(n) && files[n].length > sheetLen) { sheetName = n; sheetLen = files[n].length; }
    });
    if (!sheetName) throw new Error('시트를 찾지 못했습니다.');
    if (files['xl/workbook.xml'] && /date1904="(1|true)"/.test(dec.decode(files['xl/workbook.xml'])))
      throw new Error('1904 날짜 체계 파일은 지원하지 않습니다.');
    const grid = parseSheetGrid(dec.decode(files[sheetName]), sst);

    // 헤더행 탐색(상단 10행 내 '결의번호'+'적요' 동시 포함)
    let hi = -1;
    for (let i = 0; i < Math.min(10, grid.length); i++) {
      const titles = (grid[i] || []).map(function (v) { return str(v); });
      if (titles.indexOf('결의번호') >= 0 && titles.indexOf('적요') >= 0) { hi = i; break; }
    }
    if (hi < 0) throw new Error("헤더행('결의번호'·'적요')을 찾지 못했습니다. 보조원장 '엑셀 저장' 파일인지 확인하세요.");

    const fieldAt = {};        // colIdx -> field
    let seqSeen = 0;
    (grid[hi] || []).forEach(function (v, ci) {
      const t = str(v);
      if (!t) return;
      if (t === '순번') { seqSeen++; if (seqSeen === 2) fieldAt[ci] = 'reslSeq'; return; }
      if (XLSX_TITLE_MAP[t]) fieldAt[ci] = XLSX_TITLE_MAP[t];
    });
    if (Object.keys(fieldAt).length < 8) throw new Error('인식된 열이 너무 적습니다(' + Object.keys(fieldAt).length + '개).');

    const rows = [];
    for (let i = hi + 1; i < grid.length; i++) {
      const g = grid[i] || [];
      const m = {};
      Object.keys(fieldAt).forEach(function (ci) {
        const f = fieldAt[ci];
        let v = g[ci];
        if (v === undefined || v === null) v = '';
        if (XLSX_DATE_F[f]) v = (typeof v === 'number') ? serialToYmd(v) : fmtDate(str(v));
        else if (XLSX_NUM_F[f]) v = toNum(v);
        else v = str(v);
        m[f] = v;
      });
      if (!m.reslNo) continue;               // 라벨행("코드: …")·소계행 제거
      rows.push(pick(m));
    }
    return { rows: rows, headerRow: hi + 1, mapped: Object.keys(fieldAt).length };
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
  // (v3.3) 국내/해외 축은 오직 국내·해외만 허용한다.
  // 기존 수기 저장값(PCT/소프트웨어)은 새 정책에 맞게 자동 호환한다.
  function normalizeRegion(v) {
    const s = str(v);
    if (s === 'PCT') return '해외';
    if (s === '소프트웨어') return '국내';
    return (s === '국내' || s === '해외') ? s : '';
  }

  function hasPctEvidence(desc, mgmtNo, country) {
    const d = String(desc || '');
    return country === 'PCT' ||
      /PCT\/[A-Z]{2}\d{4}\/\d+/i.test(d) ||
      /\(\s*PCT\s*\)/i.test(d) ||
      (/PCT/i.test(d) && /국제\s*출원/.test(d));
  }

  function classifyRightType(desc, mgmtNo) {
    const d = String(desc || ''), m = String(mgmtNo || '');
    if (/(저작권|저작물\s*저작권|소프트웨어\s*저작권|컴퓨터\s*프로그램\s*저작물)/.test(d) ||
        /^C\d{6}[A-Z]{2,4}$/i.test(m) || /\bC-\d{4}-\d{6}\b/.test(d)) {
      return '저작권(소프트웨어)';
    }
    if (/^P\d{6}[A-Z]{2,4}$/i.test(m) || /\bRESI\d{10,}\b/i.test(d) ||
        /(?:출원번호|등록번호)\s*:/.test(d) || /(?:국내|해외)?\s*특허/.test(d) ||
        /특허\s*(?:출원|등록|연차)/.test(d) || /PCT\//i.test(d)) {
      return '특허';
    }
    return '기타/미확인';
  }

  function parseDesc(desc) {
    const r = { mgmtNo: '', country: '', rightType: '', pctYn: 'N', expType: '', detail: '', region: '', stage: '', review: '' };
    const d = String(desc || '');

    // (1) 지재권 관리번호
    const mNo = d.match(/지식재산권\s+([A-Za-z0-9-]+)/);
    if (mNo) r.mgmtNo = mNo[1];
    if (!r.mgmtNo) {
      const mP = d.match(/(?:^|[^A-Za-z0-9])(P\d{6}[A-Za-z]{2,4})(?![A-Za-z0-9])/);
      if (mP) r.mgmtNo = mP[1];
    }

    // (2) 국가/PCT/권리유형
    const mCo = r.mgmtNo.match(/([A-Za-z]{2,4})$/);
    if (mCo) r.country = mCo[1].toUpperCase();
    r.pctYn = hasPctEvidence(d, r.mgmtNo, r.country) ? 'Y' : 'N';
    r.rightType = classifyRightType(d, r.mgmtNo);

    // (3) 지출구분 / 상세내역
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
      let m;
      if ((m = d.match(/과제\s*(국내|해외)\s*특허\s*연차유지료/))) {
        r.expType = '연차료'; r.detail = '관납료'; r.region = m[1];
      } else if ((m = d.match(/(국내|해외)\s*특허\s*연차유지료\s*(납부|송금)\s*수수료/))) {
        r.expType = '연차료';
        r.detail = (m[2] === '송금') ? '해외송금수수료' : '국내대리인비용';
        r.region = m[1];
      } else if (/^선행기술\s*조사\s*비용/.test(d)) {
        r.expType = '선행기술조사료'; r.detail = '국내대리인비용'; r.region = '국내';
      } else if (/(저작권\s*등록|저작물\s*저작권|소프트웨어\s*저작권)/.test(d)) {
        r.expType = '국내등록료'; r.detail = '국내관납료'; r.region = '국내';
      }

      if (!r.country) {
        if (!r.region && /(?:^|[^\d])10-(?:\d{4}-\d{7}|\d{7})(?!\d)/.test(d)) r.region = '국내';
        if (!r.region && (m = d.match(/(국내|해외)(?:\s*특허)?\s*연차/))) r.region = m[1];
        if (!r.region && (m = d.match(/(국내|해외)\s*특허/))) r.region = m[1];
        if (!r.region && (m = d.match(/미국|중국|일본|유럽|독일|베트남|대만/))) {
          r.region = '해외';
          r.country = ({ '미국': 'US', '중국': 'CN', '일본': 'JP', '유럽': 'EU',
                         '독일': 'DE', '베트남': 'VN', '대만': 'TW' })[m[0]] || '';
        }
        if (!r.region && r.pctYn === 'Y') r.region = '해외';
      }
      if (!r.expType && /(연차|년\s*차)/.test(d)) r.expType = '연차료';
      if (!r.expType && /출원\s*(?:료|비)/.test(d)) {
        r.expType = (r.region === '국내') ? '국내출원료' : (r.region === '해외') ? '해외출원료' : '출원료';
      }
      if (!r.detail) {
        if (/송금\s*수수료/.test(d)) r.detail = '해외송금수수료';
        else if (/납부\s*수수료/.test(d)) r.detail = '국내대리인비용';
        else if (/관납료/.test(d)) r.detail = '관납료';
        else if (/국내\s*수수료/.test(d)) r.detail = '국내대리인비용';
        else if (/송금\s*비용/.test(d)) r.detail = '해외송금수수료';
        else if (/(연차|년\s*차)/.test(d) && !/수수료/.test(d)) r.detail = '관납료';
      }
    }

    // (5) 강한 사건 식별 단서 우선
    if (r.pctYn === 'Y') {
      r.region = '해외';
    } else if (/(?:^|[^\d])10-(?:\d{4}-\d{7}|\d{7})(?!\d)/.test(d) || /\bC-\d{4}-\d{6}\b/.test(d)) {
      r.region = '국내';
    } else if (/(?:^|[^\d])\d{2}\/\d{3},?\d{3}(?!\d)/.test(d)) {
      r.region = '해외';
    } else {
      r.region = normalizeRegion(r.region);
      if (!r.region) {
        if (r.country === 'KR') r.region = '국내';
        else if (r.country) r.region = '해외';
        else if (/^국내/.test(r.expType)) r.region = '국내';
        else if (/^해외/.test(r.expType)) r.region = '해외';
      }
      if (!r.region && /미국|중국|일본|유럽|독일|베트남|대만/.test(d)) r.region = '해외';
    }
    if (r.pctYn !== 'Y' && r.rightType === '저작권(소프트웨어)') r.region = '국내';
    r.region = normalizeRegion(r.region);

    r.stage = STAGE_MAP[r.expType] || '';

    if (!(brs && brs.length)) {
      const miss = [];
      if (!r.expType) miss.push('지출구분');
      if (!r.detail) miss.push('상세내역');
      if (!r.region) miss.push('국내/해외');
      const rv = [];
      if (miss.length) rv.push((miss.length === 3 && !r.mgmtNo ? '비정형 적요 — ' : '') + miss.join('·') + ' 수기 입력 필요');
      if (/환급|반환|여입/.test(d)) rv.push('환급·반환 성격 — 금액 방향 확인');
      if (/지분/.test(d)) rv.push('지분 변경·정정 건 — 분류 확인');
      if (/말소/.test(d)) rv.push('청구항 말소 건 — 분류 확인');
      if (rv.length) r.review = rv.join(' / ');
    }
    return r;
  }

  /* ---- (v3.3) 사건 문맥 기반 region 보강 ---------------------------------- */
  function descRegionKeys(desc) {
    const d = String(desc || '');
    let caseKey = '', appKey = '';
    const mc = d.match(/(?:^|[^A-Za-z0-9])(RESI\d{10,})(?!\d)/i);
    if (mc) caseKey = mc[1].toUpperCase();
    const ma = d.match(/(?:출원번호|등록번호)\s*:\s*([^)]+)/);
    if (ma) appKey = ma[1].replace(/[\s,]+/g, '').toUpperCase();
    return { caseKey: caseKey, appKey: appKey };
  }

  function regionEvidence(items) {
    const ev = { caseKey: {}, appKey: {} };
    function add(bucket, key, value) {
      if (!key || !value) return;
      if (!bucket[key]) bucket[key] = {};
      bucket[key][value] = 1;
    }
    items.forEach(function (it) {
      const reg = str(it.p.region);
      if (!reg) return;
      const k = descRegionKeys(it.o.reslDesc);
      add(ev.caseKey, k.caseKey, reg);
      add(ev.appKey, k.appKey, reg);
    });
    return ev;
  }

  function uniqueRegion(bucket, key) {
    if (!key || !bucket[key]) return '';
    const a = Object.keys(bucket[key]);
    return a.length === 1 ? a[0] : '';
  }

  function applyRegionContext(items, ev) {
    let changed = 0;
    items.forEach(function (it) {
      if (it.regionLocked || it.p.region) return;
      const k = descRegionKeys(it.o.reslDesc);
      const a = [];
      const c = uniqueRegion(ev.caseKey, k.caseKey);
      const n = uniqueRegion(ev.appKey, k.appKey);
      if (c) a.push(c);
      if (n) a.push(n);
      if (!a.length) return;
      for (let i = 1; i < a.length; i++) if (a[i] !== a[0]) return;
      it.p.region = a[0];
      changed++;
    });
    return changed;
  }

  function applyRegionFallback(items) {
    let changed = 0;
    items.forEach(function (it) {
      if (it.regionLocked || it.p.region) return;
      const p = it.p, d = String(it.o.reslDesc || '');
      const detailKey = String(p.detail || '').replace(/\s+/g, '');
      let v = '';
      if (/^국내/.test(p.expType)) v = '국내';
      else if (/^해외/.test(p.expType)) v = '해외';
      else if (/(?:^|[\s(\[])국내\s*비용/.test(d)) v = '국내';
      else if (/(?:^|[\s(\[])국외\s*비용/.test(d)) v = '해외';
      else if (p.expType === '선행기술조사료' && detailKey === '국내대리인비용') v = '국내';
      else if (detailKey === '해외대리인비용' || detailKey === '해외관납료' || detailKey === '해외송금수수료') v = '해외';
      if (v) { p.region = v; changed++; }
    });
    return changed;
  }

  function rebuildDescReview(p, desc) {
    const d = String(desc || '');
    const miss = [];
    if (!p.expType) miss.push('지출구분');
    if (!p.detail) miss.push('상세내역');
    if (!p.region) miss.push('국내/해외');
    const rv = [];
    if (/\[[^\[\]]*\]/.test(d) && p.review) rv.push(p.review);
    if (miss.length) rv.push((miss.length === 3 && !p.mgmtNo ? '비정형 적요 — ' : '') + miss.join('·') + ' 수기 입력 필요');
    if (/환급|반환|여입/.test(d)) rv.push('환급·반환 성격 — 금액 방향 확인');
    if (/지분/.test(d)) rv.push('지분 변경·정정 건 — 분류 확인');
    if (/말소/.test(d)) rv.push('청구항 말소 건 — 분류 확인');
    p.review = rv.join(' / ');
  }

  function refineRegions(items) {
    applyRegionContext(items, regionEvidence(items));
    applyRegionFallback(items);
    applyRegionContext(items, regionEvidence(items));
  }

  /* =========================================================================
   * [3.5] 재원구분 판정 (v2.1)
   *   우선순위: ① 사업분류(소) 키워드(충당부채 계열 → 기술료 준비금)
   *             ② 사업구분 대응표(출연금/정부수탁/잠정 기타)
   *             ③ 기본값(기타(민간수탁 등))
   *   사업구분이 공백이면 추측하지 않고 공란 + review 기록(사양서 설계 원칙 2).
   *   ①이 ②보다 앞서는 이유: 기술료충당금·지식재산권충당부채는 사업구분 '기타'
   *   하위에 존재하므로, 사업구분을 먼저 보면 전부 '기타'로 오분류된다.
   * ========================================================================= */
  function classifyFund(busiClsNm, busiBusNm) {
    const cls = str(busiClsNm), so = str(busiBusNm);
    for (let i = 0; i < CONFIG.FUND_BY_BUSI_SO.length; i++) {
      const rule = CONFIG.FUND_BY_BUSI_SO[i];
      if (rule.test.test(so)) return { fund: rule.value, review: '' };
    }
    if (Object.prototype.hasOwnProperty.call(CONFIG.FUND_BY_CLS, cls)) {
      return { fund: CONFIG.FUND_BY_CLS[cls], review: CONFIG.FUND_REVIEW_CLS[cls] || '' };
    }
    if (!cls) return { fund: '', review: '사업구분 공백 — 재원구분 판정 불가' };
    return { fund: CONFIG.FUND_DEFAULT, review: '' };
  }

  /* =========================================================================
   * [3.7] 수기 확정(검토·수정) 영속화 (v3.0)
   *   행 키 = 결의번호|순번|예산코드 (원본 유일성 실측). 저장 필드: expType, detail,
   *   region, fund (필요 항목만). 저장된 행은 이후 모든 실행에서 자동 적용되며
   *   review에서 제외되고 비고에 '수기확정'이 표기된다.
   * ========================================================================= */
  const MEM_STORE = {};
  function storeGet(k) {
    try { if (typeof localStorage !== 'undefined') return localStorage.getItem(k); } catch (e) {}
    return Object.prototype.hasOwnProperty.call(MEM_STORE, k) ? MEM_STORE[k] : null;
  }
  function storeSet(k, v) {
    try { if (typeof localStorage !== 'undefined') { localStorage.setItem(k, v); return; } } catch (e) {}
    MEM_STORE[k] = v;
  }

  function rowKey(o) { return o.reslNo + '|' + o.reslSeq + '|' + o.budgCd; }

  let OV_CACHE = null;
  function getOverrides() {
    if (OV_CACHE) return OV_CACHE;
    try {
      const raw = storeGet(CONFIG.OVERRIDE_KEY);
      OV_CACHE = raw ? (JSON.parse(raw).items || {}) : {};
    } catch (e) { OV_CACHE = {}; }
    return OV_CACHE;
  }
  function saveOverrides(map) {
    OV_CACHE = map || {};
    storeSet(CONFIG.OVERRIDE_KEY, JSON.stringify({ v: 1, savedAt: stampHuman(), items: OV_CACHE }));
  }
  function _setOverrides(map) { OV_CACHE = map || {}; }   // 테스트 훅
  function overridesJson() { return JSON.stringify({ v: 1, savedAt: stampHuman(), items: getOverrides() }, null, 1); }
  function importOverridesJson(text) {
    const obj = JSON.parse(text);
    if (!obj || typeof obj.items !== 'object') throw new Error('수정내역 형식이 아닙니다.');
    const cur = getOverrides();
    let n = 0;
    Object.keys(obj.items).forEach(function (k) { cur[k] = obj.items[k]; n++; });
    saveOverrides(cur);
    return n;
  }

  /* =========================================================================
   * [4] 변환 파이프라인
   * ========================================================================= */
  function build(src, via, rangeLabel) {
    if (!src || !src.length) {
      notify('그리드에서 데이터를 찾지 못했습니다. 먼저 자료를 조회한 뒤 다시 실행하세요.');
      return null;
    }
    const stat = { total: src.length, blank: 0, excluded: 0, exDr: 0, exCr: 0, kept: 0, dr: 0, cr: 0, review: 0, manual: 0, warnBusiCls: false, via: via, range: rangeLabel || '' };

    // 4-1. 공백행 / 대체·환원 전표 제외 (v2.2: 제외분 금액도 집계 — 월분 대체는 상계되지 않음 실측)
    const kept = src.filter(function (o) {
      if (!o.reslNo && !o.reslDesc && !o.budgCd && !o.drAmt && !o.crAmt) { stat.blank++; return false; }
      if (CONFIG.EXCLUDE_DESC.test(o.reslDesc)) { stat.excluded++; stat.exDr += o.drAmt; stat.exCr += o.crAmt; return false; }
      return true;
    });

    // 4-2. 정렬
    if (CONFIG.RESORT) {
      kept.sort(function (a, b) {
        return cmpStr(a.reslDt, b.reslDt) || cmpStr(a.reslNo, b.reslNo) || cmpStr(a.reslSeq, b.reslSeq);
      });
    }

    // 4-3. 구분2 : 결의번호 단위로 적요에 '연차' 또는 '년차'가 하나라도 있으면 '연차유지'
    const annuity = new Set();
    kept.forEach(function (o) { if (/(연차|년\s*차)/.test(o.reslDesc)) annuity.add(o.reslNo); });

    // 4-4. 행 생성 (+ 통계용 레코드 recs 동시 생성)
    //      (v3.0) 컬럼 레지스트리 기반 조립 + 수기 확정(override) 적용
    const ACT = activeColumns();
    const aoa = [ACT.map(function (c) { return c.h; })];
    const review = [['순번', '결의일자', '결의번호', '적요', '검토 사유']];
    const recs = [];
    const OV = getOverrides();

    // 그리드 수집분에 사업구분이 전무하면(정찰 실측: 화면 그리드 미제공 가능)
    // 행별 '사업구분 공백' review 홍수 대신 요약 경고 1건으로 대체한다.
    const allBlankCls = kept.length > 0 && kept.every(function (o) { return !o.busiClsNm; });
    stat.warnBusiCls = allBlankCls;

    // (v3.2) 전 행 파싱/수기반영 후 동일 사건 문맥으로 X열을 보강한다.
    const prepared = kept.map(function (o, i) {
      const p = parseDesc(o.reslDesc);
      let f = classifyFund(o.busiClsNm, o.busiBusNm);
      if (allBlankCls) f = { fund: '', review: '' };

      const key = rowKey(o);
      const ov = OV[key];
      let manual = false;
      let regionLocked = false;
      if (ov) {
        manual = true;
        regionLocked = Object.prototype.hasOwnProperty.call(ov, 'region');
        ['expType', 'detail', 'region', 'country', 'pctYn', 'rightType'].forEach(function (k) {
          if (Object.prototype.hasOwnProperty.call(ov, k)) p[k] = str(ov[k]);
        });
        p.region = normalizeRegion(p.region);
        p.pctYn = String(p.pctYn || '').toUpperCase() === 'Y' ? 'Y' : 'N';
        if (!p.rightType) p.rightType = classifyRightType(o.reslDesc, p.mgmtNo);
        // 수기 국내외 값이 정책과 충돌하면 보정하고 검토 사유를 남긴다.
        const requestedRegion = p.region;
        p.review = '';
        if (p.pctYn === 'Y') {
          if (regionLocked && requestedRegion && requestedRegion !== '해외')
            p.review = '수기 국내/해외가 PCT=해외 정책과 충돌 — PCT 여부 확인';
          p.region = '해외';
        } else if (p.rightType === '저작권(소프트웨어)') {
          if (regionLocked && requestedRegion && requestedRegion !== '국내')
            p.review = '수기 국내/해외가 저작권(소프트웨어)=국내 정책과 충돌 — 권리유형 확인';
          p.region = '국내';
        }
        if (Object.prototype.hasOwnProperty.call(ov, 'fund')) f = { fund: str(ov.fund), review: '' };
        p.stage = STAGE_MAP[p.expType] || '';
        stat.manual++;
      }
      return { o: o, p: p, f: f, manual: manual, regionLocked: regionLocked, i: i };
    });

    refineRegions(prepared);

    prepared.forEach(function (it, i) {
      const o = it.o, p = it.p, f = it.f, manual = it.manual;
      if (!manual) rebuildDescReview(p, o.reslDesc);

      const fin = o.drAmt - o.crAmt;
      const item = (p.detail && p.detail !== '기타')
        ? (p.detail.indexOf('관납료') >= 0 ? '관납료' : '외부기관 활용비용') : '';
      const grp2 = annuity.has(o.reslNo) ? '연차유지' : '출원,등록 등';
      const seq = i + 1;
      const x = { seq: seq, grp2: grp2, fin: fin, item: item, fund: f.fund, manual: manual };

      aoa.push(ACT.map(function (c) {
        let v = c.get(o, p, x);
        if (c.num && !CONFIG.AMOUNT_AS_NUMBER) v = comma(v);
        return (v === undefined || v === null) ? '' : v;
      }));

      recs.push({
        y: o.reslDt ? o.reslDt.slice(0, 4) : UNC,
        ym: o.reslDt ? o.reslDt.slice(0, 7) : UNC,
        dt: o.reslDt,
        mgmt: p.mgmtNo || '(관리번호 없음)',
        country: p.country || '(미상)',
        region: p.region || UNC,
        pctYn: p.pctYn || 'N',
        rightType: p.rightType || UNC,
        stage: p.stage || UNC,
        expType: p.expType || UNC,
        detail: p.detail || UNC,
        item: item || UNC,
        grp2: grp2,
        busiCat: o.busiCatNm || '(미지정)',
        budg: (o.budgCd || '') + (o.budgNm ? ' ' + o.budgNm : '') || '(미지정)',
        fund: f.fund || UNC,
        fin: fin
      });

      stat.dr += o.drAmt; stat.cr += o.crAmt;
      const reasons = [];
      if (p.review) reasons.push(p.review);
      if (f.review) reasons.push(f.review);
      if (reasons.length) { review.push([seq, o.reslDt, o.reslNo, o.reslDesc, reasons.join(' / ')]); stat.review++; }
    });

    stat.kept = kept.length;
    return { aoa: aoa, review: review, stat: stat, recs: recs,
             headers: aoa[0].slice(), numIdx: numColIdx(), src: kept };
  }

  /* =========================================================================
   * [4.5] 통계 산출
   *   - 값 = 최종값(차변-대변) 합계. 미분류 값도 '(미분류)' 버킷으로 전량 포함하여
   *     모든 통계 시트의 총합계가 data 시트 최종값 합계와 일치하도록 한다(검산 원칙).
   * ========================================================================= */

  // 셀 스타일 인덱스: 0 일반문자 / 1 숫자(#,##0) / 2 머리글(굵게·음영) / 3 합계숫자(굵게·음영·#,##0)
  function C(v, s) { return { v: v, s: s }; }

  function orderedKeys(keysSet, order) {
    const rest = [];
    keysSet.forEach(function (k) { if (!order || order.indexOf(k) < 0) rest.push(k); });
    rest.sort(cmpStr);
    const head = [];
    (order || []).forEach(function (k) { if (keysSet.has(k)) head.push(k); });
    return head.concat(rest);
  }

  // 일반 피벗: 행 차원 × 열 차원, 금액 합계(+선택 건수)
  function pivot(recs, rowDimKey, colDimKey, withCounts) {
    const rd = DIMS[rowDimKey], cd = DIMS[colDimKey];
    const sums = new Map();   // rowKey -> Map(colKey -> amt)
    const cnts = new Map();
    const rowKeys = new Set(), colKeys = new Set();
    let grand = 0;

    recs.forEach(function (r) {
      const rk = rd.get(r), ck = cd.get(r);
      rowKeys.add(rk); colKeys.add(ck);
      if (!sums.has(rk)) { sums.set(rk, new Map()); cnts.set(rk, new Map()); }
      sums.get(rk).set(ck, (sums.get(rk).get(ck) || 0) + r.fin);
      cnts.get(rk).set(ck, (cnts.get(rk).get(ck) || 0) + 1);
      grand += r.fin;
    });

    const rKeys = orderedKeys(rowKeys, rd.order);
    const cKeys = orderedKeys(colKeys, cd.order);

    function table(map, valueStyle, totalStyle) {
      const rows = [];
      const head = [C(rd.label + ' ＼ ' + cd.label, 2)];
      cKeys.forEach(function (ck) { head.push(C(ck, 2)); });
      head.push(C('합계', 2));
      rows.push(head);

      const colTot = new Map(); let tot = 0;
      rKeys.forEach(function (rk) {
        const line = [C(rk, 0)];
        let rowSum = 0;
        cKeys.forEach(function (ck) {
          const v = (map.get(rk) && map.get(rk).get(ck)) || 0;
          rowSum += v; colTot.set(ck, (colTot.get(ck) || 0) + v);
          line.push(C(v, valueStyle));
        });
        tot += rowSum;
        line.push(C(rowSum, valueStyle));
        rows.push(line);
      });

      const foot = [C('합계', 2)];
      cKeys.forEach(function (ck) { foot.push(C(colTot.get(ck) || 0, totalStyle)); });
      foot.push(C(tot, totalStyle));
      rows.push(foot);
      return { rows: rows, total: tot };
    }

    const out = [[C('금액(단위: 원) — 값 = 최종값(차변금액-대변금액) 합계', 0)]];
    const amt = table(sums, 1, 3);
    amt.rows.forEach(function (r) { out.push(r); });

    if (withCounts) {
      out.push([]);
      out.push([C('건수', 0)]);
      const cnt = table(cnts, 1, 3);
      cnt.rows.forEach(function (r) { out.push(r); });
    }
    return { rows: out, total: amt.total, grand: grand };
  }

  // 월별 추이
  function monthSheet(recs) {
    const m = new Map();
    recs.forEach(function (r) {
      if (!m.has(r.ym)) m.set(r.ym, { c: 0, a: 0 });
      const o = m.get(r.ym); o.c += 1; o.a += r.fin;
    });
    const keys = Array.from(m.keys()).sort(cmpStr);
    const rows = [[C('월별 집행 추이 (단위: 원)', 0)],
                  [C('연월', 2), C('건수', 2), C('금액', 2)]];
    let tc = 0, ta = 0;
    keys.forEach(function (k) {
      const o = m.get(k); tc += o.c; ta += o.a;
      rows.push([C(k, 0), C(o.c, 1), C(o.a, 1)]);
    });
    rows.push([C('합계', 2), C(tc, 3), C(ta, 3)]);
    return { name: '통계_월별추이', rows: rows, freeze: 'A3', total: ta };
  }

  // 관리번호별 누계
  function mgmtSheet(recs) {
    const m = new Map();
    recs.forEach(function (r) {
      if (!m.has(r.mgmt)) m.set(r.mgmt, { country: r.country, c: 0, ap: 0, rg: 0, kp: 0, un: 0, sum: 0, min: '', max: '' });
      const o = m.get(r.mgmt);
      o.c += 1; o.sum += r.fin;
      if (r.stage === '출원') o.ap += r.fin;               // v2.1: 선행기술조사료 포함
      else if (r.stage === '등록') o.rg += r.fin;
      else if (r.stage === '유지') o.kp += r.fin;
      else o.un += r.fin;
      if (r.dt) {
        if (!o.min || r.dt < o.min) o.min = r.dt;
        if (!o.max || r.dt > o.max) o.max = r.dt;
      }
    });
    const keys = Array.from(m.keys()).sort(function (a, b) {
      const an = a === '(관리번호 없음)', bn = b === '(관리번호 없음)';
      if (an !== bn) return an ? 1 : -1;
      return cmpStr(a, b);
    });
    const rows = [[C('지재권 관리번호별 집행 누계 (단위: 원)', 0)],
      [C('지재권 관리번호', 2), C('국가', 2), C('건수', 2), C('출원', 2),
       C('등록', 2), C('유지', 2), C('미분류', 2), C('합계', 2), C('최초 결의일', 2), C('최종 결의일', 2)]];
    const t = { c: 0, ap: 0, rg: 0, kp: 0, un: 0, sum: 0 };
    keys.forEach(function (k) {
      const o = m.get(k);
      t.c += o.c; t.ap += o.ap; t.rg += o.rg; t.kp += o.kp; t.un += o.un; t.sum += o.sum;
      rows.push([C(k, 0), C(o.country, 0), C(o.c, 1), C(o.ap, 1),
                 C(o.rg, 1), C(o.kp, 1), C(o.un, 1), C(o.sum, 1), C(o.min, 0), C(o.max, 0)]);
    });
    rows.push([C('합계', 2), C('', 2), C(t.c, 3), C(t.ap, 3),
               C(t.rg, 3), C(t.kp, 3), C(t.un, 3), C(t.sum, 3), C('', 2), C('', 2)]);
    return { name: '통계_관리번호별', rows: rows, freeze: 'A3', total: t.sum };
  }

  // 통계 시트 일괄 생성 + 검산 정보
  function buildStats(res) {
    const recs = res.recs;
    let sumFin = 0;
    recs.forEach(function (r) { sumFin += r.fin; });

    const sheets = [];
    const checks = [];

    STATS.forEach(function (s) {
      const p = pivot(recs, s.row, s.col, !!s.counts);
      sheets.push({ name: s.sheet, rows: p.rows, freeze: 'A3' });
      checks.push({ name: s.sheet, total: p.total });
    });
    if (CONFIG.STATS_SPECIAL.month) {
      const ms = monthSheet(recs);
      sheets.push(ms); checks.push({ name: ms.name, total: ms.total });
    }
    if (CONFIG.STATS_SPECIAL.mgmt) {
      const gs = mgmtSheet(recs);
      sheets.push(gs); checks.push({ name: gs.name, total: gs.total });
    }
    return { sheets: sheets, checks: checks, sumFin: sumFin };
  }

  // 요약 시트
  function summarySheet(res, stats) {
    const s = res.stat;
    let pctCount = 0, swCount = 0;
    res.recs.forEach(function (r) {
      if (r.pctYn === 'Y') pctCount++;
      if (r.rightType === '저작권(소프트웨어)') swCount++;
    });
    const rows = [
      [C('KRISS 보조원장(기술이전) 지재권 집행내역 — 추출 요약', 2)],
      [],
      [C('생성 일시', 2), C(stampHuman(), 0)],
      [C('조회 범위', 2), C(s.range || '화면 조회 결과', 0)],
      [C('수집 경로', 2), C(s.via, 0)],
      [C('국내/해외 분류 정책', 2), C('국내·해외 2값 (PCT=해외, 저작권(소프트웨어)=국내)', 0)],
      [C('PCT 행수 / 저작권(소프트웨어) 행수', 2), C(pctCount, 0), C(swCount, 0)],
      [],
      [C('조회 행수', 2), C(s.total, 0)],
      [C('공백행 제외', 2), C(s.blank, 0)],
      [C('대체·환원 제외', 2), C(s.excluded, 0)],
      [C('  └ 제외분 차변 / 대변 / 순액(원)', 0), C(s.exDr, 1), C(s.exCr, 1), C(s.exDr - s.exCr, 1)],
      [C('최종 행수 (data 시트)', 2), C(s.kept, 0)],
      [C('수기 확정 적용 (검토·수정)', 2), C(s.manual, 0)],
      [C('수기 확인 필요 (review 시트)', 2), C(s.review, 0)],
      [],
      [C('금액 검산 (단위: 원)', 2)],
      [C('차변 합계', 0), C(s.dr, 1)],
      [C('대변 합계', 0), C(s.cr, 1)],
      [C('data 시트 최종값 합계', 2), C(stats.sumFin, 3)],
      [],
      [C('통계 시트', 2), C('총합계', 2), C('data 대비', 2)]
    ];
    stats.checks.forEach(function (c) {
      const diff = c.total - stats.sumFin;
      rows.push([C(c.name, 0), C(c.total, 1), C(diff === 0 ? '일치' : '불일치(' + comma(diff) + ')', 0)]);
    });
    rows.push([]);
    if (s.warnBusiCls) {
      rows.push([C('경고: 수집분 전체에 사업구분 정보가 없어 재원구분을 산출하지 못했습니다. 화면 그리드에는 사업구분·사업분류 필드가 없으므로(정찰 실측), 보조원장 "엑셀 저장" 파일을 [엑셀 불러오기]로 투입하면 재원구분·로데이터가 채워집니다.', 2)]);
      rows.push([]);
    }
    rows.push([C('산출 기준: 공백행·대체·환원 제외 후 최종값(차변-대변) 합계. 미분류 값은 "(미분류)" 등으로 전량 포함되어 모든 통계 총합계는 data 합계와 일치해야 함. 제외분 순액이 0이 아닐 수 있음(월분 대체는 차변만 존재) — 원장 누계잔액 = data 합계 + 제외 순액.', 0)]);
    return { name: '요약', rows: rows };
  }

  /* =========================================================================
   * [5] MiniXLSX — 외부 라이브러리 없는 xlsx 생성 (내부망 대응)
   *   ZIP(STORE, 무압축) + SpreadsheetML(inline string) 최소 구현.
   *   시트 입력 형식: { name, rows: [[cell,...],...], freeze?, numCols? }
   *     cell: {v, s} | number | string | null(빈칸)
   *     s: 0 일반 / 1 #,##0 / 2 머리글(굵게·음영) / 3 굵게·음영·#,##0
   * ========================================================================= */
  const MiniXLSX = (function () {
    const enc = new TextEncoder();

    // ---- CRC32 ----
    const CRC_TABLE = (function () {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
      }
      return t;
    })();
    function crc32(u8) {
      let c = 0xFFFFFFFF;
      for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    }

    // ---- ZIP (STORE) ----
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    function dosTime(d) { return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF; }
    function dosDate(d) { return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF; }

    // 브라우저 내장 deflate (Chrome/Edge 80+ 표준 API). 미지원·실패 시 무압축(STORE) 폴백.
    async function deflateRaw(u8) {
      const cs = new CompressionStream('deflate-raw');
      const w = cs.writable.getWriter();
      w.write(u8); w.close();
      const buf = await new Response(cs.readable).arrayBuffer();
      return new Uint8Array(buf);
    }

    async function zip(files) {
      const canDeflate = (typeof CompressionStream !== 'undefined');
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        f.crc = crc32(f.data);
        f.usize = f.data.length;
        f.out = f.data; f.method = 0;
        if (canDeflate) {
          try {
            const d = await deflateRaw(f.data);
            if (d.length < f.data.length) { f.out = d; f.method = 8; }
          } catch (e) { /* STORE 유지 */ }
        }
      }
      const now = new Date(), dt = dosTime(now), dd = dosDate(now);
      const chunks = [], central = [];
      let offset = 0;
      files.forEach(function (f) {
        const nameB = enc.encode(f.name);
        const head = new Uint8Array([].concat(
          [0x50, 0x4B, 0x03, 0x04], u16(20), u16(0x0800), u16(f.method), u16(dt), u16(dd),
          u32(f.crc), u32(f.out.length), u32(f.usize), u16(nameB.length), u16(0)));
        chunks.push(head, nameB, f.out);
        central.push({ nameB: nameB, crc: f.crc, csize: f.out.length, usize: f.usize,
                       method: f.method, offset: offset });
        offset += head.length + nameB.length + f.out.length;
      });
      const cdStart = offset;
      central.forEach(function (c) {
        const rec = new Uint8Array([].concat(
          [0x50, 0x4B, 0x01, 0x02], u16(20), u16(20), u16(0x0800), u16(c.method), u16(dt), u16(dd),
          u32(c.crc), u32(c.csize), u32(c.usize), u16(c.nameB.length), u16(0), u16(0),
          u16(0), u16(0), u32(0), u32(c.offset)));
        chunks.push(rec, c.nameB);
        offset += rec.length + c.nameB.length;
      });
      const eocd = new Uint8Array([].concat(
        [0x50, 0x4B, 0x05, 0x06], u16(0), u16(0), u16(files.length), u16(files.length),
        u32(offset - cdStart), u32(cdStart), u16(0)));
      chunks.push(eocd);
      const out = new Uint8Array(offset + eocd.length);
      let p = 0;
      chunks.forEach(function (c) { out.set(c, p); p += c.length; });
      return out;
    }

    // ---- XML ----
    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }
    function colName(i) { // 0-based → A, B, … AA
      let s = ''; i++;
      while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - 1 - m) / 26; }
      return s;
    }

    // 표시 폭 추정 (한글 2, 숫자 콤마 포함)
    function dispLen(v) {
      if (v == null || v === '') return 0;
      if (typeof v === 'number') {
        const n = Math.round(Math.abs(v)).toString().length;
        return n + Math.floor((n - 1) / 3) + (v < 0 ? 1 : 0);
      }
      let w = 0; const s = String(v);
      for (let i = 0; i < s.length; i++) w += (s.charCodeAt(i) > 0x2E7F) ? 2 : 1;
      return w;
    }

    function normCell(c) {
      if (c == null || c === '') return null;
      if (typeof c === 'object') return c;
      if (typeof c === 'number') return { v: c, s: 0 };
      return { v: c, s: 0 };
    }

    function sheetXML(sheet) {
      const rows = sheet.rows || [];
      let maxCols = 1;
      rows.forEach(function (r) { if (r && r.length > maxCols) maxCols = r.length; });

      // 열 너비
      const widths = [];
      for (let cIdx = 0; cIdx < maxCols; cIdx++) {
        let w = 0;
        rows.forEach(function (r) {
          const cell = r && normCell(r[cIdx]);
          if (cell) { const L = dispLen(cell.v); if (L > w) w = L; }
        });
        widths.push(Math.max(6, Math.min(60, w + 2)));
      }

      let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<dimension ref="A1:' + colName(maxCols - 1) + Math.max(1, rows.length) + '"/>' +
        '<sheetViews><sheetView workbookViewId="0"' + (sheet.freeze ? '' : '/>');
      if (sheet.freeze) {
        const fr = sheet.freeze; // 예: 'A2' → 위 1행 고정
        const frRow = parseInt(fr.replace(/^[A-Z]+/, ''), 10);
        x += '><pane ySplit="' + (frRow - 1) + '" topLeftCell="' + fr +
             '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView>';
      }
      x += '</sheetViews><sheetFormatPr defaultRowHeight="16.5"/><cols>';
      widths.forEach(function (w, i) {
        x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      });
      x += '</cols><sheetData>';

      rows.forEach(function (r, ri) {
        if (!r || !r.length) { x += '<row r="' + (ri + 1) + '"/>'; return; }
        x += '<row r="' + (ri + 1) + '">';
        r.forEach(function (raw, ci) {
          const cell = normCell(raw);
          if (!cell) return;
          const ref = colName(ci) + (ri + 1);
          const st = cell.s | 0;
          if (typeof cell.v === 'number' && isFinite(cell.v)) {
            x += '<c r="' + ref + '" s="' + st + '"><v>' + cell.v + '</v></c>';
          } else {
            x += '<c r="' + ref + '" t="inlineStr" s="' + st + '"><is><t xml:space="preserve">' +
                 esc(cell.v) + '</t></is></c>';
          }
        });
        x += '</row>';
      });
      x += '</sheetData></worksheet>';
      return x;
    }

    const STYLES_XML =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="176" formatCode="#,##0"/></numFmts>' +
      '<fonts count="2">' +
      '<font><sz val="10"/><name val="맑은 고딕"/></font>' +
      '<font><b/><sz val="10"/><name val="맑은 고딕"/></font>' +
      '</fonts>' +
      '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEF"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="4">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="176" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="176" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';

    // sheets: [{name, rows, freeze}] → Promise<Uint8Array> (deflate가 비동기)
    async function write(sheets) {
      const n = sheets.length;
      let ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
      for (let i = 1; i <= n; i++) {
        ct += '<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }
      ct += '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>';

      const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        '</Relationships>';

      let wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
      let wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
      sheets.forEach(function (s, i) {
        wb += '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        wbRels += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      });
      wb += '</sheets></workbook>';
      wbRels += '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';

      const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:creator>kriss_ip_ledger_exporter</dc:creator>' +
        '<dcterms:created xsi:type="dcterms:W3CDTF">' + nowIso + '</dcterms:created>' +
        '</cp:coreProperties>';
      const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
        '<Application>MiniXLSX</Application></Properties>';

      const files = [
        { name: '[Content_Types].xml', data: enc.encode(ct) },
        { name: '_rels/.rels', data: enc.encode(rootRels) },
        { name: 'docProps/core.xml', data: enc.encode(core) },
        { name: 'docProps/app.xml', data: enc.encode(app) },
        { name: 'xl/workbook.xml', data: enc.encode(wb) },
        { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
        { name: 'xl/styles.xml', data: enc.encode(STYLES_XML) }
      ];
      sheets.forEach(function (s, i) {
        files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: enc.encode(sheetXML(s)) });
      });
      return zip(files);
    }

    return { write: write, crc32: crc32, zip: zip, colName: colName };
  })();

  /* =========================================================================
   * [5.5] 출력 조립
   * ========================================================================= */

  // AOA(원시 값 배열) → 스타일 부여 시트 행 (머리글 s2, 지정 숫자열 s1)
  function annotate(aoa, numCols) {
    const set = {}; (numCols || []).forEach(function (i) { set[i] = 1; });
    return aoa.map(function (row, ri) {
      return row.map(function (v, ci) {
        if (v == null || v === '') return null;
        if (ri === 0) return C(v, 2);
        if (typeof v === 'number') return C(v, set[ci] ? 1 : 0);
        return C(v, 0);
      });
    });
  }

  function makeWorkbook(res, withStats) {
    const sheets = [];
    let stats = null;
    if (withStats) {
      stats = buildStats(res);
      sheets.push(summarySheet(res, stats));
      stats.sheets.forEach(function (s) { sheets.push(s); });
    }
    sheets.push({ name: 'data', rows: annotate(res.aoa, res.numIdx || numColIdx()), freeze: 'A2' });
    if (res.review.length > 1) sheets.push({ name: 'review', rows: annotate(res.review, []), freeze: 'A2' });
    return { sheets: sheets, stats: stats };
  }

  async function exportXlsx(res, withStats) {
    if (!res) return;
    try {
      const wbk = makeWorkbook(res, withStats);
      const bytes = await MiniXLSX.write(wbk.sheets);
      const suffix = withStats ? '_stats_' : '_';
      download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
               CONFIG.FILE_PREFIX + suffix + stamp() + '.xlsx');
      report(res.stat, withStats
        ? '통계 시트 ' + (wbk.stats ? wbk.stats.sheets.length : 0) + '개 + 요약 + 백데이터(data' +
          (res.review.length > 1 ? '·review' : '') + ') 포함.'
        : '백데이터(data' + (res.review.length > 1 ? '·review' : '') + ')만 저장했습니다.');
    } catch (e) {
      notify('xlsx 생성 실패: ' + (e && e.message ? e.message : e) + '\n[TSV 복사]를 대신 사용하세요.');
      console.error('[보조원장 정제·통계 추출] xlsx 생성 오류', e);
    }
  }

  function exportTsv(res) {
    if (!res) return;
    const tsv = res.aoa.map(function (row) {
      return row.map(function (v) { return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' '); }).join('\t');
    }).join('\r\n');
    const done = function () { report(res.stat, '클립보드에 복사했습니다(data 시트만). 엑셀 A1 셀에 붙여넣으세요.'); };
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
      '대체·환원 제외  : ' + s.excluded + ' (순액 ' + comma(s.exDr - s.exCr) + '원)\n' +
      '최종 행수       : ' + s.kept + '\n' +
      '차변 합계       : ' + comma(s.dr) + '\n' +
      '대변 합계       : ' + comma(s.cr) + '\n' +
      '수기 확정 적용  : ' + (s.manual || 0) + '\n' +
      '수기 확인 필요  : ' + s.review + (s.review ? ' (review 시트)' : '') +
      (s.warnBusiCls ? '\n\n[경고] 사업구분 정보 없음 → 재원구분 미산출.\n원장 "엑셀 저장" 파일을 [엑셀 불러오기]로 투입하세요.' : '') +
      (extra ? '\n\n' + extra : '');
    console.log('[보조원장 정제·통계 추출]', s);
    notify(msg);
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
  function stampHuman() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
           pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  /* ---- 테스트 훅: Node 환경에서는 순수 로직만 노출하고 종료 ---- */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CONFIG: CONFIG, STAGE_MAP: STAGE_MAP, DIMS: DIMS, STATS: STATS,
      COLUMNS: COLUMNS, activeColumns: activeColumns, headers: headers, numColIdx: numColIdx,
      parseDesc: parseDesc, normalizeRegion: normalizeRegion, hasPctEvidence: hasPctEvidence,
      classifyRightType: classifyRightType, descRegionKeys: descRegionKeys, refineRegions: refineRegions,
      classifyFund: classifyFund, build: build, buildStats: buildStats,
      makeWorkbook: makeWorkbook, summarySheet: summarySheet,
      pivot: pivot, monthSheet: monthSheet, mgmtSheet: mgmtSheet,
      MiniXLSX: MiniXLSX, annotate: annotate, splitRange: splitRange, fmtDate: fmtDate,
      parseXlsxBytes: parseXlsxBytes, rowKey: rowKey,
      getOverrides: getOverrides, saveOverrides: saveOverrides, _setOverrides: _setOverrides,
      overridesJson: overridesJson, importOverridesJson: importOverridesJson
    };
    return;
  }

  /* =========================================================================
   * [7] 도구 모음 + 검토·수정 모달 (v3.0)
   * ========================================================================= */
  let ui = null;
  let lastSource = null;   // { rows, via, range } — 마지막 수집/업로드 원본

  function busy(on, text) {
    if (!ui) return;
    ui.status.textContent = text || '';
    [ui.btnNow, ui.btnRange, ui.btnTsv, ui.btnUpload, ui.btnReview].forEach(function (b) { b.disabled = !!on; });
  }
  function statsOn() { return !!(ui && ui.chkStats && ui.chkStats.checked); }

  function rebuild() {
    if (!lastSource) return null;
    return build(lastSource.rows, lastSource.via, lastSource.range);
  }

  function runCurrent(asTsv) {
    const cur = collectCurrent();
    lastSource = { rows: cur.rows, via: cur.via, range: '화면 조회 결과' };
    const res = build(cur.rows, cur.via, '화면 조회 결과');
    if (!res) return;
    asTsv ? exportTsv(res) : exportXlsx(res, statsOn());
  }

  async function runRange() {
    const fr = ui.dFr.value, to = ui.dTo.value;
    if (!fr || !to) { notify('시작일과 종료일을 모두 입력하세요.'); return; }
    if (fr > to) { notify('시작일이 종료일보다 뒤입니다.'); return; }
    busy(true, '조회 준비 중…');
    try {
      const got = await collectRange(fr, to, ui.unit.value, function (t) { busy(true, t); });
      busy(false, '');
      lastSource = { rows: got.rows, via: got.via, range: got.range };
      const res = build(got.rows, got.via, got.range);
      exportXlsx(res, statsOn());
    } catch (e) {
      busy(false, '');
      notify('조회 실패: ' + (e && e.message ? e.message : e));
      console.error('[보조원장 정제·통계 추출]', e);
    }
  }

  function runUploadFile(file) {
    if (!file) return;
    busy(true, '엑셀 판독 중… (' + file.name + ')');
    file.arrayBuffer().then(function (buf) {
      return parseXlsxBytes(new Uint8Array(buf));
    }).then(function (r) {
      busy(false, '');
      lastSource = { rows: r.rows, via: '엑셀 업로드(' + file.name + ')', range: '업로드 파일 전체' };
      const res = build(lastSource.rows, lastSource.via, lastSource.range);
      if (!res) return;
      ui.status.textContent = r.rows.length + '행 판독 (열 ' + r.mapped + '개 인식)';
      openReviewModal(res);
    }).catch(function (e) {
      busy(false, '');
      notify('엑셀 판독 실패: ' + (e && e.message ? e.message : e) + '\n보조원장 화면의 "엑셀 저장" 파일인지 확인하세요.');
      console.error('[보조원장 정제·통계 추출]', e);
    });
  }

  /* ---- 검토·수정 모달 ---- */
  const SEL_OPTS = {
    expType: ['', '국내출원료', '해외출원료', '중간사건비용', '선행기술조사료', '출원료',
              '국내등록료', '해외등록료', '국내연차료', '해외연차료', '연차료', '기타'],
    detail:  ['', '국내관납료', '관납료', '국내대리인비용', '해외관납료', '해외대리인비용', '해외송금수수료', '기타'],
    region:  ['', '국내', '해외'],
    pctYn:   ['N', 'Y'],
    rightType: ['특허', '저작권(소프트웨어)', '기타/미확인'],
    fund:    ['', '출연금', '정부수탁', '기술료 준비금', '기타(민간수탁 등)']
  };
  const EDIT_FIELDS = [['expType', '지출구분'], ['detail', '상세내역'], ['region', '국내/해외 구분'],
                       ['pctYn', 'PCT 여부'], ['rightType', '권리유형'], ['fund', '재원구분']];
  let modal = null;

  function closeReviewModal() {
    if (modal) { modal.remove(); modal = null; }
  }

  function openReviewModal(res) {
    if (!res) { res = rebuild(); }
    if (!res) { notify('먼저 조회하거나 [엑셀 불러오기]로 파일을 투입하세요.'); return; }
    closeReviewModal();

    const H = {};
    res.headers.forEach(function (h, i) { if (!(h in H)) H[h] = i; });   // 중복 '순번'은 첫 번째만
    const inReview = {};
    res.review.slice(1).forEach(function (r) { inReview[r[0]] = String(r[4] || ''); });

    const ov = getOverrides();
    const pending = {};   // key -> {field: value}

    const wrap = document.createElement('div');
    wrap.setAttribute('data-kriss-ext', 'ip-ledger');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:6px;width:min(1480px,98vw);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.3);font-size:12px;';
    wrap.appendChild(box);

    const head = document.createElement('div');
    head.style.cssText = 'padding:10px 14px;border-bottom:1px solid #ddd;display:flex;gap:10px;align-items:center;flex-wrap:wrap;';
    head.innerHTML = '<b style="font-size:13px;">검토·수정</b>' +
      '<span style="color:#555;">최종 ' + res.stat.kept + '행 · review ' + res.stat.review + '건 · 수기 확정 ' + res.stat.manual + '건</span>';
    const search = document.createElement('input');
    search.type = 'text'; search.placeholder = '적요·결의번호 검색';
    search.style.cssText = 'height:24px;font-size:12px;padding:1px 6px;border:1px solid #c8c8c8;border-radius:2px;flex:1;min-width:160px;';
    const chkAll = document.createElement('label');
    chkAll.style.cssText = 'display:inline-flex;gap:3px;align-items:center;cursor:pointer;color:#555;';
    const chkAllBox = document.createElement('input'); chkAllBox.type = 'checkbox';
    chkAll.appendChild(chkAllBox); chkAll.appendChild(document.createTextNode('전체 행 보기(오분류 수정용)'));
    head.appendChild(search); head.appendChild(chkAll);
    box.appendChild(head);

    const body = document.createElement('div');
    body.style.cssText = 'overflow:auto;flex:1;padding:0 8px;';
    box.appendChild(body);

    const foot = document.createElement('div');
    foot.style.cssText = 'padding:10px 14px;border-top:1px solid #ddd;display:flex;gap:6px;flex-wrap:wrap;align-items:center;';
    const info = document.createElement('span');
    info.style.cssText = 'color:#0b6bcb;flex:1;';
    function fbtn(label) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.style.cssText = 'height:26px;font-size:12px;padding:0 10px;border:1px solid #999;border-radius:3px;background:#f5f5f5;cursor:pointer;';
      foot.appendChild(b); return b;
    }
    const bSave = fbtn('수정 저장');
    const bSaveExport = fbtn('저장 후 xlsx 내보내기');
    const bBackup = fbtn('수정내역 백업(JSON)');
    const bRestore = fbtn('백업 불러오기');
    foot.appendChild(info);
    const bClose = fbtn('닫기');
    box.appendChild(foot);

    const jsonInput = document.createElement('input');
    jsonInput.type = 'file'; jsonInput.accept = '.json'; jsonInput.style.display = 'none';
    box.appendChild(jsonInput);

    function mergePending() {
      let n = 0;
      Object.keys(pending).forEach(function (k) {
        const cur = ov[k] || {};
        Object.keys(pending[k]).forEach(function (f) { cur[f] = pending[k][f]; });
        ov[k] = cur; n++;
      });
      if (n) saveOverrides(ov);
      return n;
    }

    function render() {
      body.innerHTML = '';
      const q = search.value.trim();
      const showAll = chkAllBox.checked;
      const tbl = document.createElement('table');
      tbl.style.cssText = 'border-collapse:collapse;width:100%;';
      const thead = document.createElement('tr');
      ['결의일자', '결의번호', '최종값', '적요', '지출구분', '상세내역', '국내/해외', 'PCT', '권리유형', '재원구분', '사유/상태', ''].forEach(function (t) {
        const th = document.createElement('th');
        th.textContent = t;
        th.style.cssText = 'position:sticky;top:0;background:#efefef;border:1px solid #ddd;padding:3px 5px;font-weight:bold;text-align:left;white-space:nowrap;';
        thead.appendChild(th);
      });
      tbl.appendChild(thead);

      let shown = 0;
      const LIMIT = 400;
      for (let i = 1; i < res.aoa.length; i++) {
        const row = res.aoa[i];
        const seq = row[H['순번']];
        const o = res.src[i - 1];
        const key = rowKey(o);
        const isRv = Object.prototype.hasOwnProperty.call(inReview, seq);
        const isManual = row[H['비고']] === '수기확정';
        if (!showAll && !isRv && !isManual) continue;
        const desc = String(row[H['적요']] || '');
        if (q && desc.indexOf(q) < 0 && String(row[H['결의번호']]).indexOf(q) < 0) continue;
        if (++shown > LIMIT) break;

        const tr = document.createElement('tr');
        if (isManual) tr.style.background = '#eef7ee';
        function td(html, css) {
          const c = document.createElement('td');
          c.style.cssText = 'border:1px solid #e2e2e2;padding:2px 5px;vertical-align:top;' + (css || '');
          if (typeof html === 'string') c.textContent = html; else c.appendChild(html);
          tr.appendChild(c); return c;
        }
        td(String(row[H['결의일자']] || ''), 'white-space:nowrap;');
        td(String(row[H['결의번호']] || '') + '-' + String(o.reslSeq || ''), 'white-space:nowrap;');
        td(comma(row[H['최종값']] || 0), 'text-align:right;white-space:nowrap;');
        const dd = document.createElement('div');
        dd.textContent = desc.length > 60 ? desc.slice(0, 60) + '…' : desc;
        dd.title = desc;
        td(dd, 'max-width:340px;');
        EDIT_FIELDS.forEach(function (ef) {
          const sel = document.createElement('select');
          sel.style.cssText = 'font-size:12px;height:22px;max-width:130px;';
          const curVal = String(row[H[ef[1]]] || '');
          let has = false;
          SEL_OPTS[ef[0]].forEach(function (op) {
            const el = document.createElement('option');
            el.value = op; el.textContent = op === '' ? '(공백)' : op;
            if (op === curVal) { el.selected = true; has = true; }
            sel.appendChild(el);
          });
          if (!has && curVal) {
            const el = document.createElement('option');
            el.value = curVal; el.textContent = curVal; el.selected = true;
            sel.appendChild(el);
          }
          sel.addEventListener('change', function () {
            pending[key] = pending[key] || {};
            pending[key][ef[0]] = sel.value;
            tr.style.background = '#fff6dd';
            info.textContent = '변경 대기 ' + Object.keys(pending).length + '건 — [수정 저장]을 눌러 반영';
          });
          td(sel);
        });
        td(isManual ? '수기확정' : (inReview[seq] || ''), 'color:#a05a00;max-width:220px;');
        if (isManual) {
          const undo = document.createElement('a');
          undo.href = 'javascript:void(0)'; undo.textContent = '해제';
          undo.addEventListener('click', function () {
            delete ov[key]; delete pending[key];
            saveOverrides(ov);
            res = rebuild(); if (!res) { closeReviewModal(); return; }
            res.review.slice(1).forEach(function (r) { inReview[r[0]] = String(r[4] || ''); });
            render();
          });
          td(undo);
        } else td('');
        tbl.appendChild(tr);
      }
      body.appendChild(tbl);
      if (shown > LIMIT) info.textContent = LIMIT + '행까지만 표시 — 검색으로 좁혀주세요.';
      else if (!shown) info.textContent = '표시할 행이 없습니다.';
    }

    bSave.addEventListener('click', function () {
      const n = mergePending();
      Object.keys(pending).forEach(function (k) { delete pending[k]; });
      res = rebuild();
      if (!res) { closeReviewModal(); return; }
      Object.keys(inReview).forEach(function (k) { delete inReview[k]; });
      res.review.slice(1).forEach(function (r) { inReview[r[0]] = String(r[4] || ''); });
      info.textContent = '저장 완료: ' + n + '건 (누적 수기 확정 ' + res.stat.manual + '건)';
      render();
    });
    bSaveExport.addEventListener('click', function () {
      mergePending();
      const r2 = rebuild();
      if (r2) exportXlsx(r2, statsOn());
      closeReviewModal();
    });
    bBackup.addEventListener('click', function () {
      download(new Blob([overridesJson()], { type: 'application/json' }),
               CONFIG.FILE_PREFIX + '_overrides_' + stamp() + '.json');
    });
    bRestore.addEventListener('click', function () { jsonInput.click(); });
    jsonInput.addEventListener('change', function () {
      const f = jsonInput.files && jsonInput.files[0];
      if (!f) return;
      f.text().then(function (t) {
        const n = importOverridesJson(t);
        res = rebuild();
        if (res) {
          Object.keys(inReview).forEach(function (k) { delete inReview[k]; });
          res.review.slice(1).forEach(function (r) { inReview[r[0]] = String(r[4] || ''); });
        }
        info.textContent = '백업에서 ' + n + '건 불러옴';
        render();
      }).catch(function (e) { notify('불러오기 실패: ' + e.message); });
      jsonInput.value = '';
    });
    bClose.addEventListener('click', closeReviewModal);
    search.addEventListener('input', render);
    chkAllBox.addEventListener('change', render);

    document.body.appendChild(wrap);
    modal = wrap;
    render();
  }

  function mount() {
    const anchor = document.querySelector('#btnExcelDownload');
    if (!anchor || document.querySelector('#ipLedgerBar')) return true;

    const EXT = 'ip-ledger'; // 사내 원상복구 규약: data-kriss-ext 일괄 제거 대상
    const tag = function (el) { el.setAttribute('data-kriss-ext', EXT); return el; };

    const bar = tag(document.createElement('span'));
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

    const chkWrap = document.createElement('label');
    chkWrap.style.cssText = 'display:inline-flex;align-items:center;gap:2px;font-size:12px;color:#555;cursor:pointer;';
    const chkStats = document.createElement('input');
    chkStats.type = 'checkbox';
    chkStats.checked = !!CONFIG.STATS_DEFAULT_ON;
    chkWrap.appendChild(chkStats);
    chkWrap.appendChild(document.createTextNode('통계'));
    chkWrap.title = '체크 시 요약·통계 시트를 포함해 저장합니다(백데이터 data·review 항상 포함)';

    const status = document.createElement('span');
    status.style.cssText = 'font-size:12px;color:#0b6bcb;min-width:120px;';

    const mkBtn = function (text, handler) {
      const b = tag(document.createElement('button'));
      b.type = 'button'; b.className = anchor.className; b.textContent = text;
      b.addEventListener('click', handler);
      return b;
    };
    const btnRange = mkBtn('기간 조회 후 저장', runRange);
    const btnNow = mkBtn('화면 그대로 저장', function () { runCurrent(false); });
    const btnTsv = mkBtn('TSV 복사', function () { runCurrent(true); });
    const xlsxInput = document.createElement('input');
    xlsxInput.type = 'file'; xlsxInput.accept = '.xlsx'; xlsxInput.style.display = 'none';
    xlsxInput.addEventListener('change', function () {
      runUploadFile(xlsxInput.files && xlsxInput.files[0]);
      xlsxInput.value = '';
    });
    const btnUpload = mkBtn('엑셀 불러오기', function () { xlsxInput.click(); });
    btnUpload.title = "보조원장 '엑셀 저장' 파일을 판독해 정제·검토합니다(사업구분·로데이터 포함 경로)";
    const btnReview = mkBtn('검토·수정', function () { openReviewModal(null); });
    btnReview.title = '수기 확정 값은 이 PC에 저장되어 다음 실행에도 자동 적용됩니다';

    [label, dFr, tilde, dTo, unit, chkWrap, status].forEach(function (el) { bar.appendChild(el); });
    bar.appendChild(xlsxInput);
    anchor.parentNode.insertBefore(bar, anchor);
    [btnRange, btnNow, btnTsv, btnUpload, btnReview].forEach(function (b) {
      anchor.parentNode.insertBefore(b, anchor);
    });

    ui = { dFr: dFr, dTo: dTo, unit: unit, status: status, chkStats: chkStats,
           btnNow: btnNow, btnRange: btnRange, btnTsv: btnTsv,
           btnUpload: btnUpload, btnReview: btnReview };

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
