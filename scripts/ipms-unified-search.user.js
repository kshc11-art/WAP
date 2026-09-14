// ==UserScript==
// @name         [특허] 통합검색
// @namespace    kriss-ipms-enhancement
// @version      1.1.0
// @description  지식재산권 전 탭 통합검색(Spotlight형). v1.1.0: 검토의견 결함 ①~⑯ 일괄 수정 + 팝업 엔진을 대시보드 v1.18.1 실측 패턴($.popupWindow→form POST 폴백)으로 교체. Enter=상세 팝업 직접 오픈, Shift+Enter=해당 탭에서 찾기.
// @match        *://*/pms/*S_PMS_03010100.do*
// @match        *://*/pms/*S_PMS_03011020.do*
// @match        *://*/pms/*S_PMS_03012010.do*
// @match        *://*/pms/*S_PMS_03013010.do*
// @match        *://*/pms/*S_PMS_03014010.do*
// @match        *://*/pms/*S_PMS_03015020.do*
// @match        *://*/pms/*S_PMS_03015010.do*
// @match        *://*/pms/*S_PMS_03016010.do*
// @match        *://*/pms/*S_PMS_03017010.do*
// @match        *://*/pms/*S_PMS_03019010.do*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * ── 변경 이력 ────────────────────────────────────────────────────
 * v1.1.0 (minor revision, 1.0.2 → 1.1.0) — 검토의견(2026-07-28) 결함 수정 + 팝업 엔진 교체
 *   근거: 시스템 구조 마스터 v2.0.1 (§7 팝업 계약·§8 서버검색·§9 상태코드),
 *         포털 대시보드 v1.18.1 실측 구현(callPortalPopup/submitPopup/STAGE_POPUP/openMasterRow).
 *
 *   [상 ① 청구서 단건 날짜형식] singleBody 날짜를 하이픈 → yyyyMMdd(§8.2 실측: 청구서=yyyyMMdd,
 *         오형식 시 0건). '2016-01-01' → '20000101'~오늘(마스터와 통일).
 *   [상 ② 검색기준 확정값] CFG.masterItem/expItem 기본값 '' → 'intellMngNo'(§8.3 실측 확정).
 *         localStorage 설정으로 상시 재정의 가능(기존 유지).
 *   [상 ③ 관리번호 대문자화] 관리번호 패턴이면 서버 전송 전 자동 toUpperCase()(§8.4 구현 요구
 *         사항: 서버는 대문자만 매칭). heavy 단건 호출 경로에 적용.
 *   [상 ④ 허브 파라미터 오전달] rec.k2(출원=출원번호, 등록=등록번호)를 intellRqstNo로 쓰던
 *         구조 폐기 → 레코드에 rq(intellRqstNo)·rn(단계 rqstNo) 필드 신설, 팝업 라우팅은
 *         전용 POPUP 테이블(§7.1 실측 계약)로 분리. k2는 표시 전용으로 환원.
 *   [상 ⑤ 선행조사 축 혼용] aplyApvStat(출원 축)에 apvStat 맵 적용하던 것을 apvStat(선행조사
 *         진행 축)로 교정(§9: 축 혼용 금지). '미요청' 라벨은 축 교정으로 소멸.
 *   [상 ⑥ 미확인 필드] 등록 부가정보 mainIvenNm(문서 미등재) → mainIvenEmpNm 후보 +
 *         reptUserNm(§6.5 확정) 폴백.
 *   [중 ⑦ #tmAll 경합] 구 목록개선 전체검색 행은 그리드 초기화 후 늦게 생성 → 1회 숨김을
 *         지연 감시(500ms×30)로 교체. (근본 해결은 목록개선 1.7.0에서 행 생성 제거)
 *   [중 ⑧ 팝업 차단] 탭 이동 후 무제스처 자동 팝업 경로 전면 폐기. Enter/클릭(사용자 제스처)
 *         에서 즉시 직접 팝업. 이동(찾기) 경로 도착 시엔 자동검색·그리드 필터만 수행(팝업 없음).
 *   [중 ⑨ intent 잔존] 같은 탭 실행 시 sessionStorage 기록 자체를 생략(이동 직전에만 기록)
 *         → 60초 내 새로고침 유령 점프 소멸.
 *   [중 ⑩ heavy 디바운스] heavySingle 호출을 디바운스 내부로 이동(입력 중 중복 요청 차단).
 *   [중 ⑪ 업무요청 키 유형] 찾기 검색기준을 키 유형별 분기: 관리번호→06 / intellRqstNo→05 /
 *         rqstNo→02 (§8.3). 청구서: 관리번호→intellMngNo / intellRqstNo→intellRqstNo.
 *   [중 ⑫ CUR 폴백] 미등록 화면(03015010 등)에서 'task' 오폴백 → ''(미상)으로 교정.
 *   [하 ⑬ taxbilMap] 미사용 정의 → 청구서 부가정보에 '계산서 발행대기/발행완료' 표기로 활용
 *         (N=해당없음은 표기 생략).
 *   [하 ⑭ placeholder] '전 탭' 과대 표기 → 실제 범위 명시.
 *   [하 ⑮ 페이징 키] 단건 조회의 pageIndex/pageUnit(§8.2 미관측 키) 제거 — 대시보드 v1.18.1
 *         마스터 호출이 페이징 키 없이 정상 동작함을 실측 확인, 동일 형태로 통일.
 *   [하 ⑯ 숫자 contains] 그리드 필터 대상 필드를 문자열형으로 한정(Kendo contains 오류 예방).
 *
 *   [엔진] 팝업 오픈: $.popupWindow(kriss.popup.js, dataSource=params) 1순위 → 숨은 form
 *         POST(target=새창) 폴백. 차단 시 토스트 안내. GET 쿼리 window.open(구 jumpByPopup)·
 *         합성 더블클릭(jumpByDblclick)·CFG.openMode 는 폐기.
 *   [키] Enter/클릭 = 상세 팝업 직접 오픈(탭 이동 없음) · Shift+Enter/Shift+클릭 = 해당 탭
 *         으로 이동해 자동검색(업무·청구) 또는 그리드 필터(그 외)로 찾기.
 *   [캐시] 레코드 스키마 변경(rq/rn 추가)으로 캐시 키 idx→idx3 승격, 구 키는 로드 시 제거.
 *   [가드] window.jQuery 부재 화면에서는 경고 후 미기동(비-jQuery 화면 방어, 신규).
 *   [잔여 검증 필요] (a) IPMS 화면의 $.popupWindow 존재 — §7.1상 네이티브 사용이나 [추정],
 *         부재 시 form POST 폴백으로 동작. (b) 업무·청구 검색폼 #searchItem/#searchKeyword/
 *         #btnSearch DOM id [추정] — 미발견 시 그리드 필터 폴백. (c) 명칭·발명자 매칭 방식,
 *         실 페이징 키(§15-4·13)는 재정찰 대상 유지.
 *
 * v1.0.2  openMode 확정 시도(통합허브 window.open GET) — v1.1.0에서 폐기·교체.
 * v1.0.1  이동을 탭 유형별 분기, 상태맵 전체 반영(정찰 드롭다운 실측). 스펙 v1.2 기반.
 * v1.0.0  레지스트리 → API 직접 조회(현재 탭 우선, 병렬) → 정규화 인덱스(메모리+localStorage
 *         TTL 캐시, 프로그레시브) → Spotlight형 패널 → 점프 프로토콜. 안전: select* 조회만,
 *         응답 봉투 검증, 부분 실패 허용, 킬 스위치, data-tm-usearch 일괄 표식.
 */

(function () {
    'use strict';

    var VER = '1.1.0', NS = 'tm.usearch', TAG = '[TM-USearch]';

    // ── 킬 스위치 · 환경 가드 ─────────────────────────────────────
    try { if (localStorage.getItem(NS + '.off') === '1') { console.warn(TAG, '킬 스위치 활성 — 미기동'); return; } } catch (e) {}
    if (typeof window.jQuery === 'undefined') { console.warn(TAG, 'jQuery 미탑재 화면 — 미기동'); return; }
    var $ = window.jQuery;

    function log()  { console.log.apply(console, [TAG].concat([].slice.call(arguments))); }
    function warn() { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); }
    function err(n, e) { console.error(TAG, n + ' 실패:', e); }

    // ── 설정 (localStorage 외부화) ────────────────────────────────
    //  v1.1.0 ②: masterItem/expItem 기본값을 §8.3 실측 확정값 'intellMngNo'로. openMode 폐기.
    var CFG = { ttlMin: 30, perGroup: 8, debounceMs: 150, heavyTimeoutMs: 8000, lightTimeoutMs: 20000,
                jumpTtlSec: 60, masterItem: 'intellMngNo', expItem: 'intellMngNo' };
    try { var c = JSON.parse(localStorage.getItem(NS + '.cfg') || '{}'); for (var ck in c) CFG[ck] = c[ck]; } catch (e) {}

    /*<pure>*/
    // ── 순수 유틸 (노드 단위테스트 대상) ──────────────────────────
    var KEY_RE = /^p\d{6}[a-z]{2,4}$/i;             // 관리번호 패턴 (KR/US/JP/EU/PCT 등, §4)
    function norm(s) { return String(s == null ? '' : s).toLowerCase(); }
    function toksOf(q) { return norm(q).split(/\s+/).filter(function (t) { return t.length > 0; }); }
    // v1.1.0 ③: 관리번호 패턴이면 서버 전송용 대문자화(§8.4 — 서버는 대문자만 매칭)
    function upKey(q) { var s = String(q == null ? '' : q).trim(); return KEY_RE.test(s) ? s.toUpperCase() : s; }
    // 날짜 정규화: 'YYYY-MM-DD...' | 'YYYYMMDD' | epoch(ms) → 'YYYY-MM-DD' (그 외 '')
    function fmtD(v) {
        if (v == null || v === '') return '';
        if (typeof v === 'number' && v > 1e12) { var dt = new Date(v); return isNaN(dt) ? '' : dt.toISOString().slice(0, 10); }
        var s = String(v);
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
        return '';
    }
    function fmtAgo(at, nowTs) {
        var sec = Math.max(0, Math.floor(((nowTs || Date.now()) - at) / 1000));
        if (sec < 60) return '방금 전';
        var min = Math.floor(sec / 60);
        if (min < 60) return min + '분 전';
        return Math.floor(min / 60) + '시간 전';
    }
    // 레코드 스코어: 토큰 전부 포함(AND) 시 합산, 아니면 -1
    function scoreRec(rec, toks) {
        var key = rec._k, ti = rec._ti, sub = rec._s, sum = 0;
        for (var i = 0; i < toks.length; i++) {
            var t = toks[i], s = 0;
            if (key === t) s = 100;
            else if (key.indexOf(t) === 0) s = 80;
            else if (key.indexOf(t) !== -1) s = 60;
            else if (ti.indexOf(t) !== -1) s = 40;
            else if (sub.indexOf(t) !== -1) s = 20;
            if (s === 0) return -1;
            sum += s;
        }
        return sum;
    }
    function stat(map, code, emptyLabel) {
        if (code == null || code === '') return emptyLabel || '';
        var k = String(code);
        return (map && map[k] != null) ? map[k] : k;
    }
    function pickJoin(row, fields) {
        var out = [];
        for (var i = 0; i < fields.length; i++) {
            var v = row[fields[i]];
            if (v != null && v !== '') out.push(String(v));
        }
        return out.join(' · ');
    }
    /*</pure>*/

    // ── 프로바이더 레지스트리 (정찰 실측 고정) ────────────────────
    //  statusMap 은 정찰 덤프에서 코드↔표시명이 실측된 값만 수록. 그 외 코드는 그대로 표기.
    //  v1.1.0 ④: recOf 에 rq(intellRqstNo)·rn(단계 rqstNo) 추가 — 팝업 계약(§7.1) 전용 키.
    var TODAY = new Date(), Y = TODAY.getFullYear(), P2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var TODAY_YMD = String(Y) + P2(TODAY.getMonth() + 1) + P2(TODAY.getDate());

    var REG = {
        apply: { label: '신청목록', glyph: '신', screenDo: '/pms/res/intellppty/S_PMS_03010100.do',
            api: '/pms/res/intellppty/selectIntellpptyList.json', body: function () { return {}; },
            statusMap: { '00': '임시저장', '01': '신청', '03': '내부결재', '04': '완료' }, // 신청 드롭다운 미검출(정찰) → 행실측 기반
            map: function (r) { return recOf('apply', r.intellMngNo || r.intellRqstNo, r.intellRqstNo, r.ivenNm,
                pickJoin(r, ['mainIvenEmpNm', 'rqstEmpNm']), stat(this.statusMap, r.apvStat), r.rqstDt,
                r.intellRqstNo, ''); } },
        pps: { label: '선행조사', glyph: '선', screenDo: '/pms/iprs/pps/S_PMS_03011020.do',
            api: '/pms/iprs/pps/selectPpsList.json', body: function () { return {}; },
            statusMap: { '00': '임시저장', '01': '신청', '02': '접수', '03': '처리중', '04': '완료' }, // apvStat 드롭다운 실측
            // v1.1.0 ⑤: aplyApvStat(출원 축) → apvStat(선행조사 진행 축)로 교정(§9 축 혼용 금지)
            map: function (r) { return recOf('pps', r.intellMngNo || r.rqstNo, r.rqstNo, r.rqstSbjt || r.ivenNm,
                pickJoin(r, ['mainIvenEmpNm', 'busiRegNm']), stat(this.statusMap, r.apvStat), r.rqstDt,
                r.intellRqstNo, r.rqstNo); } },
        aply: { label: '출원관리', glyph: '출', screenDo: '/pms/iprs/aply/S_PMS_03012010.do',
            api: '/pms/iprs/aply/selectAplyRqstList.json', body: function () { return {}; },
            statusMap: { '10': '출원지시전', '00': '임시저장', '01': '출원지시', '02': '접수', '03': '처리중', '04': '제출', '05': '출원검토', '06': '출원검토', '07': '출원검토', '08': '출원검토', '09': '완료' }, // apvStat 드롭다운 실측
            map: function (r) { return recOf('aply', r.intellMngNo, r.aplyNo || r.rqstNo, r.ivenNm,
                pickJoin(r, ['mainIvenEmpNm', 'plfNm']), stat(this.statusMap, r.apvStat), r.rqstDt,
                r.intellRqstNo, r.rqstNo); } },
        reg: { label: '등록관리', glyph: '등', screenDo: '/pms/iprs/reg/S_PMS_03013010.do',
            api: '/pms/iprs/intellReg/selectIntellRegRqstList.json',   // 화면 URL(reg)과 API 경로(intellReg) 다름 — 정찰 확정
            body: function () { return {}; },
            statusMap: { '00': '사무소신청중', '01': '접수대기중', '02': '접수', '03': '임시저장', '04': '검토중', '05': '검토중', '06': '사무소확인대기', '07': '완료', '08': '완료', '09': '완료', '10': '완료', '11': '완료', '12': '완료' }, // 드롭다운 실측(§15-1 상충은 재정찰 대상)
            // v1.1.0 ⑥: mainIvenNm(문서 미등재) → mainIvenEmpNm 후보 + reptUserNm(§6.5 확정) 폴백
            map: function (r) { return recOf('reg', r.intellMngNo, r.intellRegNo, r.korRegNm,
                pickJoin(r, ['mainIvenEmpNm', 'reptUserNm']), stat(this.statusMap, r.apvStat), r.rqstDt,
                r.intellRqstNo, r.rqstNo); } },
        task: { label: '업무요청', glyph: '업', form: true, screenDo: '/pms/iprs/etcTask/S_PMS_03014010.do',
            api: '/pms/iprs/etcTask/selectEtcTaskRqstList.json', body: function () { return {}; },
            statusMap: null,                                            // apvStatNm 명칭 필드 직접 사용
            map: function (r) { return recOf('task', r.intellMngNo || r.rqstNo, r.rqstNo, r.rqstSbjt,
                pickJoin(r, ['mainIvenEmpNm', 'rqstTpeNm']), String(r.apvStatNm || ''), r.rqstDt,
                r.intellRqstNo, r.rqstNo); } },
        // heavy: 전건 금지, 관리번호 단건만. v1.1.0 ⑮: 페이징 키 제거(대시보드 v1.18.1 실측 호출과 동일 형태)
        master: { label: '마스터', glyph: '마', heavy: true, screenDo: '/pms/iprs/mng/S_PMS_03019010.do',
            api: '/pms/iprs/mng/selectIntellAplyList.json',
            singleBody: function (key) { return { isAuthorized: 'Y', searchDtCls: '03', searchStrDt: '20000101',
                searchEndDt: TODAY_YMD, item: CFG.masterItem, keyword: key, cls: 'detail' }; },
            map: function (r, key) { return recOf('master', r.intellMngNo || key, r.intellRqstNo, r.ivenNm || '마스터 건',
                pickJoin(r, ['mainIvenEmpNm']), String(r.masterApvNm || r.detailApvNm || ''), r.intellRegDt || r.rqstDt,
                r.intellRqstNo, ''); } },
        exp: { label: '청구서', glyph: '청', heavy: true, form: true, screenDo: '/pms/iprs/exp/S_PMS_03015020.do',
            statusMap: { '00': '신청중', '01': '접수대기', '02': '접수', '03': '임시저장', '04': '검토실행', '05': '임시저장', '06': '검토중', '07': '검토중', '08': '과제책임자', '09': '계산서발행대기', '10': '발의대기', '11': '완료' },
            taxbilMap: { 'Y': '발행완료', 'W': '발행대기', 'N': '해당없음' },
            api: '/pms/iprs/exp/selectExpRqstList.json',
            // v1.1.0 ①: 날짜 형식 하이픈 → yyyyMMdd(§8.2 실측), 기간 시작 20000101 통일. ⑮: 페이징 키 제거.
            singleBody: function (key) { return { rqstStrDt: '20000101', rqstEndDt: TODAY_YMD,
                searchItem: CFG.expItem, searchKeyword: key }; },
            // v1.1.0 ⑬: taxbilMap 활용 — W/Y만 부가정보로 표기(N 생략)
            map: function (r, key) {
                var subArr = [];
                if (r.cnfUserNm) subArr.push(String(r.cnfUserNm));
                if (r.taxbilIsuCls === 'W' || r.taxbilIsuCls === 'Y') subArr.push('계산서 ' + stat(this.taxbilMap, r.taxbilIsuCls));
                return recOf('exp', r.intellMngNo || key, r.rqstNo,
                    (r.budgNm ? String(r.budgNm) + ' · ' : '') + '청구 ' + (r.totlExp != null ? Number(r.totlExp).toLocaleString() : ''),
                    subArr.join(' · '), stat(this.statusMap, r.apvStat), r.rqstDt,
                    r.intellRqstNo, r.rqstNo); } },
        // 점프 전용 (인덱스 제외 — 응답 필드 미정찰. 팔레트 이동 대상으로 유지)
        annual: { label: '연차관리', glyph: '연', jumpOnly: true, screenDo: '/pms/iprs/pm/S_PMS_03016010.do' },
        trns:   { label: '이관요청', glyph: '이', jumpOnly: true, screenDo: '/pms/iprs/trns/S_PMS_03017010.do' }
    };
    var LIGHT = ['apply', 'pps', 'aply', 'reg', 'task'];

    function recOf(t, k, k2, ti, sub, st, d, rq, rn) {
        if (!k && !ti) return null;
        var rec = { t: t, k: String(k || ''), k2: String(k2 || ''), ti: String(ti || '').slice(0, 90),
                    st: String(st || ''), s: sub || '', d: fmtD(d),
                    rq: String(rq || ''), rn: String(rn || '') };   // v1.1.0 ④: 팝업 계약 키
        rec._k = norm(rec.k); rec._ti = norm(rec.ti); rec._s = norm(rec.k2 + ' ' + rec.s + ' ' + rec.st);
        return rec;
    }

    // 현재 탭 판별 — v1.1.0 ⑫: 미등록 화면(03015010 등)은 ''(미상)으로. 'task' 오폴백 제거.
    var CUR = (function () {
        var p = location.pathname;
        for (var t in REG) if (REG[t].screenDo && p.indexOf(REG[t].screenDo.split('/').pop().replace('.do', '')) !== -1) return t;
        return '';
    })();

    // ── 전송 계층 ─────────────────────────────────────────────────
    function post(api, body, timeoutMs) {
        var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var to = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;
        var t0 = performance.now();
        return fetch(api, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(body || {}),
            signal: ctrl ? ctrl.signal : undefined
        }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
        }).then(function (txt) {
            var tFetch = performance.now() - t0, t1 = performance.now();
            var j = JSON.parse(txt);
            var tParse = performance.now() - t1;
            if (j && j.errorCode && String(j.errorCode) !== '0' && String(j.errorCode) !== '200') {
                throw new Error('서버 오류 errorCode=' + j.errorCode);
            }
            if (!j || !Array.isArray(j.data)) throw new Error('응답 형식 예상 밖(data 배열 아님)');
            return { data: j.data, total: j.total, ms: { fetch: tFetch, parse: tParse, bytes: txt.length } };
        }).finally(function () { if (to) clearTimeout(to); });
    }

    // ── 인덱스 (프로그레시브 + 캐시) ──────────────────────────────
    var IDX = { rows: {}, at: {}, state: {}, started: false, quotaWarned: false };
    var TIMING = { tabs: {}, t0: 0 };

    // v1.1.0: 레코드 스키마 변경(rq/rn) → 캐시 키 승격(idx3). 구 키는 로드 시 제거.
    function cacheKey(t) { return NS + '.idx3.' + t; }
    function readCache(t) {
        try {
            var raw = localStorage.getItem(cacheKey(t)); if (!raw) return null;
            var o = JSON.parse(raw);
            if (!o || !o.at || !Array.isArray(o.rows)) return null;
            if (Date.now() - o.at > CFG.ttlMin * 60 * 1000) return null;
            for (var i = 0; i < o.rows.length; i++) {
                var r = o.rows[i];
                r.rq = r.rq || ''; r.rn = r.rn || '';
                r._k = norm(r.k); r._ti = norm(r.ti); r._s = norm((r.k2 || '') + ' ' + (r.s || '') + ' ' + (r.st || ''));
            }
            return o;
        } catch (e) { return null; }
    }
    function writeCache(t) {
        try {
            var slim = IDX.rows[t].map(function (r) { return { t: r.t, k: r.k, k2: r.k2, ti: r.ti, st: r.st, s: r.s, d: r.d, rq: r.rq || '', rn: r.rn || '' }; });
            localStorage.setItem(cacheKey(t), JSON.stringify({ at: IDX.at[t], total: slim.length, rows: slim }));
        } catch (e) {
            if (!IDX.quotaWarned) { warn('캐시 저장 실패(용량 등) — 메모리 전용으로 계속:', e && e.name); IDX.quotaWarned = true; }
        }
    }
    function loadTab(t, force) {
        var P = REG[t];
        try { localStorage.removeItem(NS + '.idx.' + t); } catch (e) {}   // v1.1.0: 구 스키마 캐시 정리
        if (!force) {
            var c = readCache(t);
            if (c) { IDX.rows[t] = c.rows; IDX.at[t] = c.at; IDX.state[t] = 'ok'; log('캐시 사용:', P.label, c.rows.length + '건', fmtAgo(c.at)); render(); return; }
        }
        IDX.state[t] = 'wait'; render();
        post(P.api, P.body(), CFG.lightTimeoutMs).then(function (res) {
            var t1 = performance.now(), rows = [], d = res.data;
            for (var i = 0; i < d.length; i++) { var rec = P.map(d[i]); if (rec) rows.push(rec); }
            var tNorm = performance.now() - t1;
            IDX.rows[t] = rows; IDX.at[t] = Date.now(); IDX.state[t] = 'ok';
            TIMING.tabs[t] = { n: rows.length, kb: Math.round(res.ms.bytes / 1024),
                fetch: Math.round(res.ms.fetch), parse: Math.round(res.ms.parse), norm: Math.round(tNorm) };
            log('timing', P.label, TIMING.tabs[t]);
            writeCache(t); render(); maybeTimingSummary();
        }).catch(function (e) {
            IDX.state[t] = 'fail'; warn(P.label, '조회 실패:', e && e.message); render(); maybeTimingSummary();
        });
    }
    function maybeTimingSummary() {
        for (var i = 0; i < LIGHT.length; i++) { var s = IDX.state[LIGHT[i]]; if (s !== 'ok' && s !== 'fail') return; }
        if (TIMING.t0) { log('timing 총(콜드, 프로그레시브)', Math.round(performance.now() - TIMING.t0) + 'ms'); TIMING.t0 = 0; }
    }
    function startAll() {
        if (IDX.started) return;
        IDX.started = true; TIMING.t0 = performance.now();
        var order = [CUR].concat(LIGHT.filter(function (t) { return t !== CUR; }));   // 현재 탭 먼저
        order.forEach(function (t) { if (LIGHT.indexOf(t) !== -1) loadTab(t, false); });
    }

    // heavy 단건 상태기계 — key 는 호출부에서 이미 대문자화(③)
    var HV = { key: '', state: 'idle', rows: {} };
    function heavySingle(key) {
        if (HV.key === key && HV.state !== 'idle') return;
        HV = { key: key, state: 'loading', rows: {} };
        render();
        var left = 2;
        ['master', 'exp'].forEach(function (t) {
            var P = REG[t];
            post(P.api, P.singleBody(key), CFG.heavyTimeoutMs).then(function (res) {
                var hit = null;
                for (var i = 0; i < res.data.length; i++) {
                    var r = res.data[i];
                    if (String(r.intellMngNo || '').toUpperCase() === key.toUpperCase()) { hit = P.map(r, key); break; }
                }
                if (!hit && res.data.length === 1) hit = P.map(res.data[0], key);
                if (hit) HV.rows[t] = hit;
            }).catch(function (e) {
                warn(P.label, '단건 조회 실패:', e && e.message); HV.rows[t + '_fail'] = true;
            }).finally(function () { if (--left === 0) { HV.state = 'ok'; render(); } });
        });
    }

    // ── 검색 · 그룹 구성 ──────────────────────────────────────────
    var Q = '', SEL = 0, MORE = {}, FLAT = [];
    function buildGroups() {
        var toks = toksOf(Q);
        if (!toks.length) return null;
        var byTab = {}, t, i;
        for (i = 0; i < LIGHT.length; i++) {
            t = LIGHT[i];
            if (IDX.state[t] !== 'ok') continue;
            var rows = IDX.rows[t], hits = [];
            for (var r = 0; r < rows.length; r++) {
                var s = scoreRec(rows[r], toks);
                if (s >= 0) hits.push({ rec: rows[r], s: s });
            }
            if (hits.length) {
                hits.sort(function (a, b) { return b.s - a.s || (b.rec.d || '').localeCompare(a.rec.d || ''); });
                byTab[t] = hits;
            }
        }
        var order = Object.keys(byTab).sort(function (a, b) {
            if (a === CUR) return -1; if (b === CUR) return 1;
            return (byTab[b][0].s - byTab[a][0].s) || (byTab[b].length - byTab[a].length);
        });
        return { toks: toks, order: order, byTab: byTab,
                 pending: LIGHT.filter(function (x) { return IDX.state[x] === 'wait'; }),
                 failed: LIGHT.filter(function (x) { return IDX.state[x] === 'fail'; }) };
    }

    // ── UI ────────────────────────────────────────────────────────
    var UI = { $wrap: null, $input: null, $panel: null, open: false };

    function injectStyles() {
        var css = [
            '.tmus-field{display:flex;align-items:center;gap:10px;background:rgba(252,253,255,.92);border:1px solid #c9d2dc;border-radius:10px;padding:6px 12px;max-width:640px}',
            '.tmus-field:focus-within{border-color:#0a7cff;box-shadow:0 0 0 3px rgba(10,124,255,.14)}',
            '.tmus-field input{flex:1;border:0;outline:0;background:transparent;font-size:15px;color:#1d1d1f;font-family:inherit}',
            '.tmus-field .esc{font-size:11px;color:#8e8e93;background:rgba(120,120,128,.14);border-radius:6px;padding:1px 7px}',
            '.tmus-anchor{position:relative}',
            '.tmus-panel{position:absolute;left:0;top:calc(100% + 6px);width:640px;max-width:96vw;z-index:99990;border-radius:16px;overflow:hidden;',
            ' background:rgba(250,250,252,.78);backdrop-filter:blur(26px) saturate(1.6);-webkit-backdrop-filter:blur(26px) saturate(1.6);',
            ' border:1px solid rgba(0,0,0,.1);box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 24px 60px -16px rgba(20,25,35,.35);',
            ' font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","맑은 고딕",sans-serif;font-size:13px;color:#1d1d1f}',
            '.tmus-hr{height:1px;background:rgba(0,0,0,.08)}',
            '.tmus-pend{display:flex;align-items:center;gap:7px;padding:8px 16px;font-size:11.5px;color:#6e6e73;flex-wrap:wrap}',
            '.tmus-pc{display:inline-flex;align-items:center;gap:5px;background:rgba(120,120,128,.12);border-radius:999px;padding:2px 10px}',
            '.tmus-pc i{width:6px;height:6px;border-radius:99px;background:#8e8e93;animation:tmusbl 1s infinite}',
            '@keyframes tmusbl{50%{opacity:.35}}',
            '.tmus-sec{display:flex;align-items:center;gap:7px;padding:10px 16px 4px;font-size:12px;font-weight:600;color:#6e6e73}',
            '.tmus-cap{font-size:10px;color:#0a7cff;background:rgba(10,124,255,.12);border-radius:5px;padding:1px 6px}',
            '.tmus-cnt{font-weight:400;color:#aeaeb2}',
            '.tmus-fresh{margin-left:auto;display:flex;align-items:center;gap:5px;font-weight:400;font-size:11px;color:#aeaeb2}',
            '.tmus-rf{cursor:pointer;padding:3px 6px;border-radius:99px;color:#aeaeb2}',
            '.tmus-rf:hover{background:rgba(120,120,128,.14);color:#1d1d1f}',
            '.tmus-row{display:flex;align-items:center;gap:10px;margin:0 8px;padding:7px 10px;border-radius:10px;cursor:pointer}',
            '.tmus-row:hover{background:rgba(0,0,0,.05)}',
            '.tmus-row.on{background:#0a7cff}',
            '.tmus-gl{flex:none;width:26px;height:26px;border-radius:7px;background:rgba(120,120,128,.16);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#515154}',
            '.tmus-row.on .tmus-gl{background:rgba(255,255,255,.28);color:#fdfdfe}',
            '.tmus-key{flex:none;font-family:Consolas,"Courier New",monospace;font-size:12.5px;font-weight:600;color:#1d1d1f}',
            '.tmus-ti{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#48484a}',
            '.tmus-meta{flex:none;display:flex;align-items:center;gap:6px;font-size:11.5px;color:#6e6e73}',
            '.tmus-dot{width:7px;height:7px;border-radius:99px;display:inline-block;background:#0a84ff}',
            '.tmus-dot.o{background:#ff9500}.tmus-dot.g{background:#a5adb8}',
            '.tmus-meta em{font-style:normal;color:#aeaeb2;font-size:11px;font-family:Consolas,monospace}',
            '.tmus-row.on .tmus-key,.tmus-row.on .tmus-ti,.tmus-row.on .tmus-meta,.tmus-row.on .tmus-meta em{color:#fdfdfe}',
            '.tmus-row mark{background:rgba(255,204,0,.5);color:inherit;border-radius:2px;padding:0 1px}',
            '.tmus-row.on mark{background:rgba(255,255,255,.32);color:#fdfdfe}',
            '.tmus-more{margin:1px 16px 5px 52px;font-size:12px;color:#0a7cff;cursor:pointer;width:fit-content}',
            '.tmus-more:hover{text-decoration:underline}',
            '.tmus-fail{display:flex;align-items:center;gap:9px;margin:5px 8px;padding:8px 12px;border-radius:10px;font-size:12px;color:#c33b32;background:rgba(255,59,48,.09)}',
            '.tmus-fail button{margin-left:auto;border:0;background:rgba(255,59,48,.14);color:#c33b32;border-radius:999px;padding:3px 13px;font-size:11.5px;cursor:pointer}',
            '.tmus-empty{padding:28px 20px;text-align:center;color:#8e8e93;font-size:12.5px}',
            '.tmus-empty b{display:block;color:#48484a;font-weight:600;margin-bottom:3px}',
            '.tmus-foot{display:flex;align-items:center;gap:14px;padding:8px 16px;font-size:11px;color:#8e8e93;background:rgba(120,120,128,.07)}',
            '.tmus-kbd{font-family:Consolas,monospace;font-size:10.5px;background:rgba(255,255,255,.75);border:1px solid rgba(0,0,0,.12);border-radius:5px;padding:0 5px;color:#515154;margin-right:3px}',
            '.tmus-narrow{margin-left:auto;border:0;background:transparent;color:#0a7cff;font-size:11.5px;cursor:pointer;padding:3px 8px;border-radius:7px}',
            '.tmus-narrow:hover{background:rgba(10,124,255,.1)}',
            // v1.1.0: 팝업 차단 등 안내 토스트
            '.tmus-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#1e2126;color:#f6f7f8;font-size:12.5px;padding:9px 15px;border-radius:8px;z-index:2147483000;box-shadow:0 10px 26px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:opacity .15s;max-width:88vw}',
            '.tmus-toast.show{opacity:1}'
        ].join('');
        $('<style data-tm-usearch>').text(css).appendTo('head');
    }

    var $toast = null, toastTo = null;
    function toast(msg) {
        if (!$toast) $toast = $('<div class="tmus-toast" data-tm-usearch>').appendTo('body');
        $toast.text(msg).addClass('show');
        if (toastTo) clearTimeout(toastTo);
        toastTo = setTimeout(function () { $toast.removeClass('show'); }, 2600);
    }

    function dotCls(st) {
        if (/완료/.test(st)) return 'g';
        if (/(신청|임시)/.test(st)) return '';
        return 'o';   // 진행·대기·검토 계열 및 기타
    }
    function hiInto($el, text, toks) {
        var s = String(text || ''), low = s.toLowerCase(), pos = 0;
        while (pos < s.length) {
            var best = -1, bl = 0;
            for (var i = 0; i < toks.length; i++) {
                var p = low.indexOf(toks[i], pos);
                if (p !== -1 && (best === -1 || p < best)) { best = p; bl = toks[i].length; }
            }
            if (best === -1) { $el.append(document.createTextNode(s.slice(pos))); break; }
            if (best > pos) $el.append(document.createTextNode(s.slice(pos, best)));
            $('<mark>').text(s.slice(best, best + bl)).appendTo($el);
            pos = best + bl;
        }
    }

    function rowEl(rec, toks, flatIdx) {
        var $r = $('<div class="tmus-row" data-tm-usearch>').attr('data-fi', flatIdx);
        $('<span class="tmus-gl">').text(REG[rec.t].glyph).appendTo($r);
        var $k = $('<span class="tmus-key">').appendTo($r); hiInto($k, rec.k || rec.k2, toks);
        var $ti = $('<span class="tmus-ti">').appendTo($r); hiInto($ti, rec.ti, toks);
        var $m = $('<span class="tmus-meta">').appendTo($r);
        if (rec.st) { $('<i class="tmus-dot ' + dotCls(rec.st) + '">').appendTo($m); $('<span>').text(rec.st).appendTo($m); }
        if (rec.s) $('<span>').text((rec.st ? '· ' : '') + rec.s.split(' · ')[0]).appendTo($m);
        if (rec.d) $('<em>').text(rec.d).appendTo($m);
        return $r;
    }

    function render() {
        if (!UI.$panel) return;
        var $p = UI.$panel;
        if (!Q.trim()) { $p.hide(); UI.open = false; return; }
        $p.empty().show(); UI.open = true;
        var G = buildGroups();
        FLAT = [];

        if (G && G.pending.length) {
            var $pd = $('<div class="tmus-pend">').text('불러오는 중').appendTo($p);
            G.pending.forEach(function (t) { $('<span class="tmus-pc"><i></i></span>').append($('<span>').text(REG[t].label)).appendTo($pd); });
        }

        var shown = 0;
        if (G) G.order.forEach(function (t) {
            var hits = G.byTab[t];
            var $sec = $('<div class="tmus-sec">').appendTo($p);
            $('<span>').text(REG[t].label).appendTo($sec);
            if (t === CUR) $('<span class="tmus-cap">현재 화면</span>').appendTo($sec);
            $('<span class="tmus-cnt">').text(hits.length).appendTo($sec);
            var $fr = $('<span class="tmus-fresh">').appendTo($sec);
            $('<span>').text(fmtAgo(IDX.at[t])).appendTo($fr);
            $('<span class="tmus-rf" title="다시 불러오기">⟳</span>').attr('data-rt', t).appendTo($fr);
            var cap = MORE[t] ? hits.length : CFG.perGroup;
            hits.slice(0, cap).forEach(function (h) { FLAT.push(h.rec); $p.append(rowEl(h.rec, G.toks, FLAT.length - 1)); shown++; });
            if (hits.length > cap) $('<div class="tmus-more">').text('더보기 ' + (hits.length - cap) + '건').attr('data-more', t).appendTo($p);
        });

        if (G) G.failed.forEach(function (t) {
            var $f = $('<div class="tmus-fail">').appendTo($p);
            $('<span>').text(REG[t].label + ' 응답 없음').appendTo($f);
            $('<button type="button">재시도</button>').attr('data-retry', t).appendTo($f);
        });

        // heavy 단건
        var keyQ = Q.trim();
        if (KEY_RE.test(keyQ)) {
            if (HV.state === 'loading') {
                $('<div class="tmus-pend"><span class="tmus-pc"><i></i><span>마스터·청구서 단건 조회</span></span></div>').appendTo($p);
            } else if (HV.state === 'ok') {
                ['master', 'exp'].forEach(function (t) {
                    if (HV.rows[t]) {
                        var $sec = $('<div class="tmus-sec">').appendTo($p);
                        $('<span>').text(REG[t].label).appendTo($sec);
                        $('<span class="tmus-cap">단건</span>').appendTo($sec);
                        FLAT.push(HV.rows[t]); $p.append(rowEl(HV.rows[t], G ? G.toks : toksOf(Q), FLAT.length - 1)); shown++;
                    } else if (HV.rows[t + '_fail']) {
                        $('<div class="tmus-pend">').text(REG[t].label + ': 조회 지연·실패 — 탭에서 직접 확인').appendTo($p);
                    }
                });
            }
        }

        var allSettled = G && !G.pending.length;
        if (allSettled && shown === 0 && !G.failed.length && HV.state !== 'loading') {
            $('<div class="tmus-empty"><b>일치하는 건이 없습니다</b>관리번호 일부나 이름으로 다시 검색해 보세요</div>').appendTo($p);
        }

        var $ft = $('<div class="tmus-foot">').appendTo($p);
        $ft.append('<span><span class="tmus-kbd">↑</span><span class="tmus-kbd">↓</span>이동</span>' +
                   '<span><span class="tmus-kbd">↩</span>팝업 열기</span>' +
                   '<span><span class="tmus-kbd">⇧↩</span>탭에서 찾기</span>' +
                   '<span><span class="tmus-kbd">esc</span>닫기</span>');
        $('<button type="button" class="tmus-narrow">이 화면에서 추리기</button>').appendTo($ft);

        SEL = Math.min(SEL, Math.max(0, FLAT.length - 1));
        applySel();
    }
    function applySel() {
        UI.$panel.find('.tmus-row').removeClass('on');
        var $on = UI.$panel.find('.tmus-row[data-fi="' + SEL + '"]').addClass('on');
        if ($on.length && $on[0].scrollIntoView) $on[0].scrollIntoView({ block: 'nearest' });
    }

    // ── 팝업 엔진 (대시보드 v1.18.1 실측 이식) ────────────────────
    //  1순위 $.popupWindow(kriss.popup.js — §7.1 네이티브 오픈 경로, dataSource 로 POST 파라미터)
    //  2순위 숨은 form POST(target=새창). 둘 다 실패(차단) 시 토스트 안내.
    var HUB_URL = '/pms/iprs/mng/popup/S_PMS_03019020.do';
    function callPopupWindow(url, params, w, h) {
        try {
            if ($ && typeof $.popupWindow === 'function') {
                $.popupWindow(url, { width: w || 1200, height: h || 800, resizable: 'no', center: 'parent', dataSource: params });
                return true;
            }
        } catch (e) { warn('$.popupWindow 실패:', e && e.message); }
        return false;
    }
    function formPostPopup(url, params, w, h) {
        try {
            var name = 'tmus_pop_' + Math.random().toString(36).slice(2, 8);
            var win = window.open('', name, 'width=' + (w || 1200) + ',height=' + (h || 800) + ',resizable=yes,scrollbars=yes');
            if (!win) return false;
            var f = document.createElement('form');
            f.setAttribute('data-tm-usearch', '1');
            f.method = 'POST'; f.action = location.origin + url; f.target = name; f.style.display = 'none';
            for (var k in params) {
                if (params[k] == null || params[k] === '') continue;
                var inp = document.createElement('input');
                inp.type = 'hidden'; inp.name = k; inp.value = String(params[k]); f.appendChild(inp);
            }
            document.body.appendChild(f); f.submit();
            setTimeout(function () { try { if (f.parentNode) f.parentNode.removeChild(f); } catch (e2) {} }, 800);
            return true;
        } catch (e) { warn('form POST 팝업 실패:', e && e.message); return false; }
    }

    // 탭별 상세 팝업 라우팅 테이블 (§7.1 실측 계약 · 대시보드 STAGE_POPUP 대조 확정)
    //  params(rec) 가 null 이면 필수 키 부재 → 통합허브(rq) 폴백 → 그래도 없으면 '찾기'로 강등.
    var POPUP = {
        apply: { via: 'submit', url: '/pms/res/intellppty/B_RES00004_01.do', w: 1280, h: 900,   // 신고서 열람(§7.2 readOnly)
            params: function (rec) { return rec.rq ? { bizKey: rec.rq, workFlag: 'readOnly', from: 'S_PMS_03010100' } : null; } },
        pps: { via: 'pw', url: '/pms/iprs/pps/popup/S_PMS_03011010.do',
            params: function (rec) { return rec.rn ? { rqstNo: rec.rn } : null; } },
        aply: { via: 'pw', url: '/pms/iprs/aply/popup/S_PMS_03012020.do',                        // 출원지시전 행은 intellRqstNo 만(§6.3 실측)
            params: function (rec) { if (!rec.rq) return null; var p = { intellRqstNo: rec.rq }; if (rec.rn) p.rqstNo = rec.rn; return p; } },
        reg: { via: 'pw', url: HUB_URL, w: 1280, h: 900,                                          // 등록 기본정보 셀 계약과 동일(§7.3)
            params: function (rec) { return rec.rq ? { intellRqstNo: rec.rq } : null; } },
        task: { via: 'pw', url: '/pms/iprs/etcTask/popup/S_PMS_03014020.do',
            params: function (rec) { return rec.rn ? { rqstNo: rec.rn } : null; } },
        exp: { via: 'pw', url: '/pms/iprs/exp/S_PMS_03015030.do?popupAt=popup',
            params: function (rec) { return rec.rn ? { rqstNo: rec.rn } : null; } },
        master: { via: 'pw', url: HUB_URL, w: 1280, h: 900,
            params: function (rec) { return rec.rq ? { intellRqstNo: rec.rq } : null; } }
    };

    // Enter/클릭(사용자 제스처) → 상세 팝업 직접 오픈. 탭 이동 없음(⑧).
    function openRec(rec) {
        var def = POPUP[rec.t];
        var params = def ? def.params(rec) : null;
        var url = def && def.url, via = def && def.via, w = def && def.w, h = def && def.h;
        if (!params && rec.rq && url !== HUB_URL) {   // 1차 파라미터 부재 → 통합허브 폴백(§12: {intellRqstNo})
            url = HUB_URL; via = 'pw'; w = 1280; h = 900; params = { intellRqstNo: rec.rq };
            log('1차 팝업 파라미터 부재 → 통합허브 폴백:', rec.t, rec.k);
        }
        if (!params) { warn('팝업 파라미터 부재 — 탭에서 찾기로 폴백:', rec.t, rec.k); locate(rec); return; }
        var ok = (via === 'submit')
            ? (formPostPopup(url, params, w, h) || callPopupWindow(url, params, w, h))
            : (callPopupWindow(url, params, w, h) || formPostPopup(url, params, w, h));
        if (ok) log('팝업 오픈:', rec.t, url, params);
        else toast('팝업이 차단되었습니다. 브라우저 팝업 허용을 확인해 주세요.');
    }

    // ── 찾기(Shift+Enter): 해당 탭으로 이동해 자동검색/그리드 필터 ─
    //  v1.1.0 ⑨: intent 는 '탭 이동 직전'에만 기록(같은 탭 실행은 미기록 → 유령 점프 소멸).
    //  v1.1.0 ⑧: 도착 후에는 팝업을 열지 않음(무제스처 차단 회피) — 목록 확인 후 사용자가 직접 오픈.
    function locate(rec) {
        var P = REG[rec.t];
        if (!P || !P.screenDo) return;
        if (rec.t === CUR) { localLocate(rec); return; }
        try { sessionStorage.setItem(NS + '.jump', JSON.stringify({ tab: rec.t, k: rec.k, k2: rec.k2, rq: rec.rq || '', rn: rec.rn || '', ts: Date.now() })); } catch (e) {}
        location.href = P.screenDo;
    }
    function handleJumpIntent() {
        var raw = null;
        try { raw = sessionStorage.getItem(NS + '.jump'); } catch (e) {}
        if (!raw) return;
        var it = null; try { it = JSON.parse(raw); } catch (e) {}
        try { sessionStorage.removeItem(NS + '.jump'); } catch (e) {}
        if (!it || Date.now() - it.ts > CFG.jumpTtlSec * 1000) return;
        if (it.tab !== CUR) return;
        log('찾기 intent 수신:', it.k);
        localLocate({ t: it.tab, k: it.k, k2: it.k2, rq: it.rq, rn: it.rn });
    }
    function localLocate(rec) {
        var P = REG[rec.t];
        if (P && P.form) formSearch(rec);          // 검색기준 UI 보유 탭(업무요청·청구서)
        else gridFilterKey(rec.k || rec.k2);       // 그 외: 로드된 그리드 클라이언트 필터
    }

    // v1.1.0 ⑪: 찾기 검색기준을 키 유형별 분기(§8.3 실측 옵션값)
    function pickFormItem(t, rec) {
        var k = String(rec.k || '');
        if (t === 'task') {   // 업무요청(숫자코드형): 06 지재권 관리번호 / 05 지재권 신청번호 / 02 신청번호
            if (KEY_RE.test(k)) return { item: '06', kw: k.toUpperCase() };
            if (rec.rq) return { item: '05', kw: rec.rq };
            if (rec.rn) return { item: '02', kw: rec.rn };
            return { item: null, kw: k };
        }
        // 청구서(필드명형): intellMngNo / intellRqstNo (rqstNo 옵션 없음 — §8.3)
        if (KEY_RE.test(k)) return { item: 'intellMngNo', kw: k.toUpperCase() };
        if (rec.rq) return { item: 'intellRqstNo', kw: rec.rq };
        return { item: null, kw: k };
    }
    // 검색기준 요소 id(#searchItem/#searchKeyword/#btnSearch)는 [추정] — 미발견 시 그리드 필터 폴백.
    function formSearch(rec) {
        var tries = 0, pick = pickFormItem(rec.t, rec);
        (function step() {
            var $sel = $('#searchItem'), ddl = $sel.data && $sel.data('kendoDropDownList');
            var $kw = $('#searchKeyword');
            if (!$sel.length || !$kw.length || !ddl) {
                if (++tries < 20) return void setTimeout(step, 400);
                warn('찾기: 검색기준 요소 미발견([추정] DOM id) — 그리드 필터로 폴백');
                return gridFilterKey(pick.kw);
            }
            var val = pick.item;
            if (val === null) $sel.find('option').each(function () {
                if (val === null && /관리번호/.test($(this).text())) val = $(this).attr('value');
            });
            try {
                if (val !== null) { ddl.value(val); ddl.trigger('change'); }
                $kw.prop('disabled', false).removeAttr('tabindex').val(pick.kw);
                var $btn = $('#btnSearch');
                if ($btn.length) $btn.trigger('click'); else warn('찾기: 검색 버튼 미발견');
            } catch (e) { err('찾기 formSearch', e); }
            // v1.1.0 ⑧: 후속 합성 더블클릭 제거 — 결과 목록에서 사용자가 직접 상세를 연다.
        })();
    }

    // ── 그리드 클라이언트 필터 (⑯: 문자열 필드 한정 · 공용) ──────
    function stringFieldsOf(g) {
        var data = g.dataSource.data(); if (!data.length) return [];
        var first = data[0], fields = [];
        for (var k in first) {
            if (k.charAt(0) === '_' || k === 'uid' || k === 'isChecked' || k === 'rowNumber') continue;
            if (typeof first[k] === 'string') fields.push(k);
        }
        return fields;
    }
    function containsFilter(fields, toks) {
        var groups = toks.map(function (tk) {
            return { logic: 'or', filters: fields.map(function (f) { return { field: f, operator: 'contains', value: tk }; }) };
        });
        return groups.length ? { logic: 'and', filters: groups } : {};
    }
    function gridFilterKey(key) {
        if (!key) return;
        var t2 = 0;
        (function step() {
            var g = $('#grid1').data('kendoGrid');
            if (g && g.dataSource && g.dataSource.data().length) {
                try {
                    var fields = stringFieldsOf(g);
                    if (fields.length) { g.dataSource.filter(containsFilter(fields, [key])); log('그리드 필터로 찾기:', key); }
                } catch (e) { err('gridFilterKey', e); }
                return;
            }
            if (++t2 < 30) setTimeout(step, 400); else warn('찾기: 그리드 준비 안 됨 — 목록 조회 후 다시 시도:', key);
        })();
    }

    // '이 화면에서 추리기' — 현재 탭 Kendo 그리드 클라이언트 필터 (부가 기능)
    function narrowGrid() {
        try {
            var g = $('#grid1').data('kendoGrid');
            if (!g || !g.dataSource) return warn('추리기: 그리드 미발견');
            var fields = stringFieldsOf(g); if (!fields.length) return;
            g.dataSource.filter(containsFilter(fields, toksOf(Q)));
            log('추리기 적용:', Q);
        } catch (e) { err('narrowGrid', e); }
    }

    // ── 마운트 ────────────────────────────────────────────────────
    function findSearchTable() {
        var $dp = $('#searchForm input[data-role="datepicker"]').first();
        if ($dp.length && $dp.closest('table').length) return $dp.closest('table');
        if ($('#searchForm table').length) return $('#searchForm table').first();
        if ($('.sform_type02').length) return $('.sform_type02').first();
        return null;
    }
    function mount() {
        // 과도기(⑦): 구 목록개선 전체검색 행(#tmAll)은 그리드 초기화 후 늦게 생성 → 지연 감시로 숨김.
        //  근본 해결은 목록개선 1.7.0에서 행 생성 자체를 제거.
        (function hideOldAll(n) {
            var $old = $('#tmAll');
            if ($old.length) { $old.closest('tr').hide(); log('구 전체검색 행 숨김(과도기)'); return; }
            if (n < 30) setTimeout(function () { hideOldAll(n + 1); }, 500);
        })(0);

        var $tbl = findSearchTable();
        var ncols = $tbl ? ($tbl.find('colgroup col').length || 4) : 4;
        var $field = $('<div class="tmus-field" data-tm-usearch>');
        $('<span style="color:#8e8e93">🔍</span>').appendTo($field);
        // v1.1.0 ⑭: 실제 검색 범위 명시
        UI.$input = $('<input type="text" placeholder="지식재산권 검색 — 관리번호는 전 탭 · 명칭·이름은 신청~업무 5개 탭">').appendTo($field);
        var $esc = $('<span class="esc" style="display:none">esc</span>').appendTo($field);
        UI.$panel = $('<div class="tmus-panel" data-tm-usearch style="display:none">');
        var $anchor = $('<div class="tmus-anchor" data-tm-usearch>').append($field, UI.$panel);

        if ($tbl) {
            var $tr = $('<tr data-tm-usearch>');
            $('<th scope="row">통합검색</th>').appendTo($tr);
            $('<td>').attr('colspan', Math.max(1, ncols - 1)).append($anchor).appendTo($tr);
            $tbl.find('tbody').first().append($tr);
        } else {
            $anchor.css({ position: 'fixed', top: '8px', right: '8px', zIndex: 99990, width: '420px' }).appendTo('body');
            warn('검색조건 표 미발견 — 우상단 고정 배치');
        }

        var deb = null;
        UI.$input.on('input', function () {
            Q = $(this).val(); $esc.toggle(!!Q);
            if (Q.trim()) startAll();
            if (deb) clearTimeout(deb);
            deb = setTimeout(function () {
                SEL = 0; render();
                var kq = Q.trim();
                // v1.1.0 ⑩: heavy 단건은 디바운스 이후 1회 · ③: 서버 전송 전 대문자화(§8.4)
                if (KEY_RE.test(kq)) heavySingle(kq.toUpperCase());
            }, CFG.debounceMs);
        });
        UI.$input.on('keydown', function (e) {
            var oe = e.originalEvent || e;
            if (oe.isComposing || e.keyCode === 229) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); SEL = Math.min(SEL + 1, FLAT.length - 1); applySel(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); SEL = Math.max(SEL - 1, 0); applySel(); }
            else if (e.which === 13) {
                e.preventDefault(); e.stopPropagation();
                if (FLAT[SEL]) { if (e.shiftKey) locate(FLAT[SEL]); else openRec(FLAT[SEL]); }   // Enter=팝업 · Shift+Enter=찾기
            }
            else if (e.key === 'Escape') { Q = ''; UI.$input.val(''); $esc.hide(); render(); }
        });
        UI.$panel.on('click', '.tmus-row', function (ev) {
            var fi = +$(this).attr('data-fi');
            if (FLAT[fi]) { if (ev.shiftKey) locate(FLAT[fi]); else openRec(FLAT[fi]); }
        });
        UI.$panel.on('click', '.tmus-more', function () { MORE[$(this).attr('data-more')] = true; render(); });
        UI.$panel.on('click', '[data-retry]', function () { loadTab($(this).attr('data-retry'), true); });
        UI.$panel.on('click', '.tmus-rf', function (e) { e.stopPropagation(); loadTab($(this).attr('data-rt'), true); });
        UI.$panel.on('click', '.tmus-narrow', function () { narrowGrid(); });
        $(document).on('mousedown.tmus', function (e) {
            if (UI.open && !$(e.target).closest('.tmus-anchor').length) { UI.$panel.hide(); UI.open = false; }
        });
        UI.$input.on('focus', function () { if (Q.trim()) { UI.$panel.show(); UI.open = true; } });
    }

    // ── 기동 ──────────────────────────────────────────────────────
    try {
        injectStyles();
        mount();
        handleJumpIntent();
        log('기동 완료 v' + VER + ' — 현재 탭:', REG[CUR] ? REG[CUR].label : '(미상)',
            '| 킬 스위치: localStorage["' + NS + '.off"]="1" | 설정: ' + NS + '.cfg');
    } catch (e) { err('init', e); }

})();