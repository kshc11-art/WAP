// ==UserScript==
// @name         [IPMS] 검색 개선
// @namespace    kriss-ipms-enhancement
// @version      1.8.0
// @description  신청 목록 검색조건에 전체/공동/단독 추가: 기존 결과표에 표시, 전체 페이지 확인·건수 반영. 기존 공동출원 상세조회·CSV와 자동검색 유지.
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
 *  v1.8.0 — 신청 목록 검색조건의 전체/공동/단독 → 기존 결과표 필터.
 *    · 첨부 HTML의 soJoCls=S(단독)/J(공동)를 사용. 기관별 검토 패널과 별도.
 *    · 기존 DataSource/열/행 기능 유지. 서버 페이지는 전체 확인 후 필터.
 *    · 불완전 조회·실패·중지 표시, 초기화 시 전체 복귀, 기존 CSV 기능 유지.
 *    · 신청 화면만 적용: 다른 탭의 필드·검색조건 지원을 추정하지 않음.
 *  v1.2 ~ v1.6.4  (이전 이력은 각 버전 원본 주석 참조)
 *
 *  v1.6.8 (patch, 1.6.7 → 1.6.8) — 번호 검색을 1회로 확정, 헛시도 제거
 *    실측 확정(2026-07-30, 등록관리 03013010):
 *      · 검색기준 '관리번호' + 'P240139'(국가코드 미입력) → 조회됨
 *        → 관리번호도 부분일치(LIKE) 지원. §8.4의 부분일치 [실측] 범위가
 *          출원번호에서 관리번호까지 확장 확인.
 *      · 앞서 'P240013'이 9회 모두 0건이었던 원인은 기준 오판이 아니라
 *        해당 건이 등록관리 단계에 없었기 때문(업무요청 실측: 의견제출통지·
 *        보정 단계, 등록관리 목록 10건에 미포함).
 *    수정:
 *      ① 국가코드 접미 순회(KR/US/JP/EU/PCT/CN) 폐기 — 근거 소멸.
 *         기능 자체는 CONFIG.SEARCH_MNG_SUFFIXES 로 남겨두되 기본값 [] (미사용).
 *      ② 후보 큐를 (검색기준 + 검색어) 쌍으로 재구성 — 중복 방지 키도 쌍 단위.
 *      ③ 0건의 성격을 구분:
 *         · 번호류(관리번호·신청번호·출원/등록번호) 입력은 기준이 명확하므로
 *           1회 조회 후 0건이면 즉시 중단(stopOnMiss) → 명칭·이름 기준으로
 *           넘어가지 않음. 안내: 이 탭에 해당 건이 없음 + 단계 무관 조회는
 *           [지식재산권 마스터] 탭 이용(자동 크로스탭 조회는 하지 않음).
 *         · 사람 이름/명칭 등 모호한 입력만 종전대로 순차 재시도(최대 3후보).
 *      ④ 후보 기준이 이 탭에 하나도 없으면(예: 업무요청은 출원·등록번호 옵션
 *         없음) '제목/발명명칭'으로 1회 폴백.
 *      ⑤ 시도 이력을 힌트에 표기(기준+검색어+건수).
 *
 *  v1.6.7 (patch, 1.6.6 → 1.6.7)
 *    ① [자동 포커스] 전 탭 공통. 화면 진입 시 네이티브 검색어 칸에 포커스를
 *       둔다(마우스 클릭 없이 바로 타이핑 → Enter). 화면 스크립트가 나중에
 *       포커스를 가져갈 수 있어 0/250/700/1500ms 4회 재시도하며, 이미 사용자가
 *       다른 입력요소를 잡고 있으면 건드리지 않는다(body/HTML 포커스일 때만 적용).
 *       조회 완료 후에도 검색어 칸으로 되돌리고 기존 문자열을 전체선택 →
 *       다음 검색어를 덮어쓰기만 하면 됨. CONFIG.AUTOFOCUS / AUTOFOCUS_SELECT /
 *       REFOCUS_AFTER_SEARCH 로 개별 제어.
 *    ② [기간 모드 명시] v1.6.5에서 도입한 '검색 시 기간을 2000-01-01~오늘로
 *       설정'은 의도된 동작(업무요청 기간 공백 0건 대응 + 과거 건 조회)이며,
 *       CONFIG.SEARCH_PERIOD_MODE 로 전환 가능:
 *         'wide'(기본) 넓은 기간으로 덮어씀 / 'keep' 화면의 기간 그대로 /
 *         'blank' 기간 공백. 사용자가 기간 버튼으로 직접 지정한 경우에는
 *         'wide' 여도 덮어쓰지 않는다(v1.6.5 periodSet 유지).
 *
 *  v1.6.6 (patch, 1.6.5 → 1.6.6) — 자동판별 모드 고착 결함 수정
 *    증상: 첫 검색에서 엔진이 검색기준을 '제목'·'관리번호' 등으로 설정하면,
 *          이후 검색어를 무엇으로 바꿔도 그 기준으로만 조회됨.
 *    원인: route()·[검색] 가로채기가 '검색기준이 비어 있음(value=="")'을
 *          자동판별 조건으로 사용 → 엔진이 채운 값을 사용자 지정으로 오인.
 *    수정: 자동판별 여부를 별도 상태(AUTO.on)로 관리.
 *          - 엔진이 드롭다운을 바꿀 때는 ENG 가드를 세워 '사용자 변경'으로 계산하지 않음.
 *          - 사용자가 직접 기준을 고르면 AUTO.on=false(네이티브 동작 존중),
 *            다시 '전체/전체검색/선택'으로 되돌리면 AUTO.on=true 로 복귀.
 *          - 검색어가 비어 있는 Enter/[검색]은 기준을 비우고 기간 조회로 처리.
 *    표기: 힌트에 현재 모드와 실제 사용된 기준을 함께 표시.
 *
 *  v1.6.5 (minor revision, 1.6.4 → 1.6.5)
 *    근거: 시스템 구조 마스터 v2.0 §8.1~§8.4, §15-4·15-5(미확인 항목),
 *          실측 HTML 8개 화면(신청·선행·출원·등록·업무×2·청구·마스터).
 *
 *    ① [별도 행 제거 — 네이티브 검색어 칸 사용]
 *       - v1.6.4가 추가한 '빠른검색' 행을 없애고, 화면의 네이티브
 *         검색어 입력(#keyword 또는 #searchKeyword)을 그대로 진입점으로 사용.
 *       - 네이티브 화면은 검색기준 미선택 시 검색어 칸을 잠그므로(신청·등록은
 *         readonly, 출원·업무·청구·마스터는 disabled — 실측) 잠금을 해제해
 *         '기준 없이 검색어만' 입력이 가능하도록 함.
 *       - 동작 분기(검색어 칸 Enter 또는 [검색] 버튼 클릭 시):
 *           · 검색기준이 비어 있음('전체'·'전체검색'·'선택') + 검색어 있음
 *             → 자동 판별 스마트검색(기준을 실제 값으로 치환한 뒤 서버 조회)
 *           · 검색기준을 사용자가 지정함 → 네이티브 동작 그대로(개입 없음)
 *       - [검색] 버튼은 캡처 단계 리스너로만 가로채고, 엔진이 스스로 누르는
 *         클릭은 통과시킴(SS.self 가드) → 네이티브 그리드 바인딩과 충돌 없음.
 *       - '전체' 옵션(value="")을 그대로 서버에 보내는 방식은 채택하지 않음:
 *         (1) item 미선택 + keyword 만 전송 시 전체필드 검색 여부가 §15-4
 *             [미확인], (2) 신청·선행·출원·등록·마스터는 해당 옵션이 '선택'
 *             이며 검색어 칸이 잠기는 구조여서 탭 간 동작이 갈림.
 *
 *    ② [진행상태 버튼(칩) 필터 비활성화]  요구사항
 *       - CONFIG.STATUS_CHIPS = false (기본). 코드는 보존되어 true 로 되돌리면
 *         v1.6.4와 동일하게 동작. 비활성 시 상태 관련 필터·건수 표기도 미적용.
 *
 *    ③ [기간 처리 변경 — 공백 → 넓은 기간]  업무요청 제목 검색 0건 원인 대응
 *       - v1.6.4는 검색 시 기간을 공백으로 만들었음. 실측 결과 업무요청
 *         (03014010)에서 기간 공백 + searchItem/searchKeyword 조회 시 0건
 *         (그리드 '조회된 결과가 없습니다', 총 0건)이 관측됨 → 기간 공백이
 *         원인으로 추정(§15-5 업무요청 날짜 파라미터 미실측).
 *       - v1.6.5는 기간을 비우지 않고 시작일=2000-01-01, 종료일=오늘로 설정.
 *         날짜 형식은 화면 datepicker/직렬화가 처리하므로 탭별 형식 차이(§8.2)
 *         영향 없음. 모드: CONFIG.SEARCH_PERIOD_MODE = 'wide' | 'blank' | 'keep'.
 *       - 원래 기간은 보관하고 화면 [초기화] 클릭 시 상태를 폐기(네이티브 초기화
 *         로직이 날짜를 재설정함).
 *
 *    [잔여 검증 필요]
 *       (a) 업무요청 제목 검색이 넓은 기간에서도 0건이면 원인은 기간이 아니라
 *           제목 부분일치 미지원(§15-4) → 콘솔 로그의 item/keyword 값으로 판별.
 *       (b) 자동 판별 규칙(하이픈 수·한글 길이)은 [추정] — 0건 시 다음 기준으로
 *           최대 3회 재시도하고, 최종 실패 시 시도 이력을 화면에 표기.
 * ──────────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    var VER = '1.8.0';
    console.log('%c[TM-List] 스크립트 진입 v' + VER, 'color:#2c6fbb', location.pathname);

    var EXCLUDE_SCREENS = [];
    var _tmPath = location.pathname || '';
    for (var _i = 0; _i < EXCLUDE_SCREENS.length; _i++) {
        if (EXCLUDE_SCREENS[_i] && _tmPath.indexOf(EXCLUDE_SCREENS[_i]) !== -1) {
            console.warn('[TM-List] 제외 대상 화면 — 개선 미적용');
            return;
        }
    }

    var CONFIG = {
        INIT_RETRY_MS: 500,
        INIT_MAX_RETRY: 40,
        DEBUG: true,
        WIDEN_COLS: ['9%', '54%', '11%', '26%'],

        // ② 진행상태 버튼(칩) 필터 — 요구사항에 따라 기본 비활성화
        STATUS_CHIPS: false,
        STATUS_LABELS: ['진행상태', '결재상태', '처리상태', '상태'],
        STATUS_NM_CANDIDATES: ['apvStatNm', 'detailApvNm', 'masterApvNm', 'aplyApvStatNm', 'rqstApvStatNm', 'progrsStatNm', 'aplyStatNm', 'statNm'],
        STATUS_CODE_CANDIDATES: ['apvStat', 'aplyApvStat', 'detailApvStat', 'rqstApvStat', 'masterApvStat'],
        STATUS_MAX_DISTINCT: 15,
        STATUS_EMPTY_LABEL: '(미지정)',

        PERIOD_AUTO_SEARCH: false,     // 기간 버튼은 날짜만 채움
        COUNT_ID_CANDIDATES: ['gridsTotal', 'totalCount', 'grid1TotCnt'],

        // ① 스마트검색(네이티브 검색어 칸 사용)
        SEARCH_MIN_LEN: 2,
        SEARCH_MAX_TRY: 3,               // 모호한 입력(이름·명칭)의 기준 재시도 상한
        SEARCH_MAX_ATTEMPTS: 4,          // (기준+검색어) 총 시도 상한
        // 관리번호 부분일치가 실측 확인되어 접미 순회는 미사용. 필요 시 ['KR','US','JP'] 등 지정.
        SEARCH_MNG_SUFFIXES: [],
        SEARCH_TIMEOUT_MS: 20000,
        // ③ 검색 시 기간: 'wide'(2000-01-01~오늘) | 'blank'(비움) | 'keep'(유지)
        SEARCH_PERIOD_MODE: 'wide',      // 'wide' | 'keep' | 'blank'
        SEARCH_WIDE_START: '2000-01-01',

        // v1.6.7 자동 포커스
        AUTOFOCUS: true,
        AUTOFOCUS_SELECT: true,          // 포커스 시 기존 문자열 전체선택
        REFOCUS_AFTER_SEARCH: true,

        // 통합검색(팔레트) 제거
        HIDE_USEARCH_ROW: true,
        DISABLE_USEARCH_SCRIPT: true,
        USEARCH_KILL_KEY: 'tm.usearch.off',

        HEAVY_SCREENS: ['S_PMS_03019010', 'S_PMS_03015020', 'S_PMS_03015010'],
        PRIMARY_FALLBACK: '#2c6fbb'
    };

    function log() { if (CONFIG.DEBUG) console.log.apply(console, ['[TM-List]'].concat([].slice.call(arguments))); }
    function warn() { console.warn.apply(console, ['[TM-List]'].concat([].slice.call(arguments))); }
    function err(name, e) { console.error('[TM-List] ' + name + ' 실패:', e); }
    function step(name, fn) { try { fn(); } catch (e) { err(name, e); } }

    function isHeavyScreen() {
        var p = location.pathname || '';
        for (var i = 0; i < CONFIG.HEAVY_SCREENS.length; i++) {
            if (p.indexOf(CONFIG.HEAVY_SCREENS[i]) !== -1) return true;
        }
        return false;
    }

    if (typeof $ === 'undefined') { console.warn('[TM-List] jQuery 미탑재 — 스킵'); return; }

    var CTX = { grid: null, dateStart: null, dateEnd: null, btnSearch: null, btnReset: null,
                countEl: null, table: null, statusField: null, statusMap: null,
                primary: CONFIG.PRIMARY_FALLBACK, savedPeriod: null, periodSet: false };
    var F = { statusVals: [], statusActive: false };
    function anyActive() { return CONFIG.STATUS_CHIPS && F.statusActive; }

    var _reapplying = false;
    var _chip = { mounted: false, skip: false, sig: '', $box: null };
    var $hint = null;

    // 스마트검색 상태기계
    var SS = { active: false, pending: false, self: false, kw: '', queue: [], tried: {}, cur: null, log: [], timer: null };
    // v1.6.6: 자동판별 모드. ENG>0 인 동안의 드롭다운 변경은 '엔진 변경'으로 간주.
    var AUTO = { on: true };
    var ENG = 0;

    /* Joint search v1.7.0: read-only list → institution details; no server-side joint flag assumed. */
    var JOINT = { token: 0, active: false, requests: [], cache: new Map(), result: null, panel: null };
    var JOINT_CONF = { size: 400, max: 20000, concurrency: 3, cacheMs: 300000, timeout: 20000, kriss: '200835806' };

    function jointScreen(path) {
        if (/S_PMS_03010100\.do/.test(path || '')) return { label: '지식재산권 신청', dateFormat: 'hyphen', url: '/pms/res/intellppty/selectIntellpptyList.json' };
        if (/S_PMS_03019010\.do/.test(path || '')) return { label: '지식재산권 마스터', dateFormat: 'compact', url: '/pms/iprs/mng/selectIntellAplyList.json' };
        return null;
    }
    function jointEscape(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    }
    function jointToday() { var d = new Date(); return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); }
    function jointDate(v) { var s = String(v || '').replace(/\D/g, '').slice(0, 8); return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6) : (v || '제한 없음'); }
    function jointPage(offset, size) { return { take: size, skip: offset, pageSkip: offset, pageTake: size, page: Math.floor(offset / size) + 1, pageSize: size, pageNum: Math.floor(offset / size) + 1 }; }
    function jointUnwrap(data) {
        var queue = [data], total = null, rows = null, count = 0;
        while (queue.length && count++ < 20) {
            var d = queue.shift(); if (!d || typeof d !== 'object') continue;
            if (Array.isArray(d)) { if (rows === null) rows = d; continue; }
            ['total', 'totalCount', 'recordsTotal'].some(function (k) {
                if (d[k] != null && d[k] !== '' && isFinite(Number(d[k])) && Number(d[k]) >= 0) { if (total === null) total = Number(d[k]); return true; } return false;
            });
            if (d.success === false || d.isError === true) throw new Error('서버가 조회 실패를 반환했습니다');
            ['data', 'rows', 'list', 'result', 'items', 'resultList', 'dlist', 'dataList', 'gridVO'].forEach(function (k) { if (d[k] && typeof d[k] === 'object') queue.push(d[k]); });
        }
        if (!rows) throw new Error('목록 응답 형식을 확인할 수 없습니다');
        return { rows: rows, total: total };
    }
    function jointOwners(raw) {
        var parsed = jointUnwrap(raw), rows = parsed.rows, by = Object.create(null), members = [];
        if (!rows.length) throw new Error('기관 정보 없음');
        if (parsed.total !== null && parsed.total > rows.length) throw new Error('기관 정보 일부 수신');
        rows.forEach(function (r) {
            if (!r || typeof r !== 'object' || !String(r.orgCd || '').trim()) throw new Error('기관 코드 확인 필요');
            var code = String(r.orgCd).trim(), item = { orgCd: code, orgNm: String(r.orgNm || code), owrQuota: jointRatio(r.owrQuota), costShareRatio: jointRatio(r.costShareRatio) };
            if (by[code]) {
                if (JSON.stringify(by[code]) !== JSON.stringify(item)) throw new Error('동일 기관 정보 불일치');
                return;
            }
            by[code] = item; members.push(item);
        });
        return { members: members, joint: !!by[JOINT_CONF.kriss] && members.some(function (r) { return r.orgCd !== JOINT_CONF.kriss; }),
            externalMajority: members.some(function (r) { return r.orgCd !== JOINT_CONF.kriss && r.owrQuota !== null && r.owrQuota > 50; }) };
    }
    function jointRatio(v) { if (v == null || String(v).trim() === '') return null; var n = Number(v); return isFinite(n) && n >= 0 && n <= 100 ? n : null; }
    function jointStopped(token, state) { state = state || JOINT; if (token !== state.token || !state.active) throw new Error('조회 취소'); }
    function jointRequest(url, data, token, state) {
        state = state || JOINT;
        jointStopped(token, state);
        return new Promise(function (resolve, reject) {
            var nativeRequest = null, settled = false, timer;
            function finish(error, res) {
                if (settled) return; settled = true; clearTimeout(timer);
                var i = state.requests.indexOf(handle); if (i >= 0) state.requests.splice(i, 1);
                if (error) { reject(error); return; }
                try { jointStopped(token, state); resolve(res); } catch (e) { reject(e); }
            }
            var handle = { abort: function (message) {
                finish(new Error(message || '조회 취소'));
                try { if (nativeRequest && typeof nativeRequest.abort === 'function') nativeRequest.abort(); } catch (e) {}
            } };
            state.requests.push(handle);
            timer = setTimeout(function () { handle.abort('서버 응답 시간 초과'); }, JOINT_CONF.timeout);
            try {
                // Native portal posting preserves its established JSON/serialization contract.
                // No loading-mask target is passed, so the panel's Stop button remains usable.
                if (typeof window !== 'undefined' && window.kriss && window.kriss.ajax && typeof window.kriss.ajax.post === 'function') {
                    nativeRequest = window.kriss.ajax.post(url, data, function (res) { finish(null, res); });
                    if (nativeRequest && typeof nativeRequest.fail === 'function') nativeRequest.fail(function () { finish(new Error('서버 조회 실패')); });
                    return;
                }
                // Same JSON fallback contract used by the supplied dashboard and Helper.
                nativeRequest = $.ajax({ url: url, type: 'POST', method: 'POST', data: JSON.stringify(data), processData: false, dataType: 'json', contentType: 'application/json; charset=UTF-8', timeout: JOINT_CONF.timeout });
                nativeRequest.done(function (res) { finish(null, res); });
                nativeRequest.fail(function (_, status) { finish(new Error(status === 'abort' ? '조회 취소' : '서버 조회 실패')); });
            } catch (e) { finish(new Error('서버 조회 시작 실패')); }
        });
    }
    async function jointCandidates(screen, params, token, progress) {
        var rows = [], seen = Object.create(null), offset = 0, total = null, complete = false, reason = '', malformed = 0;
        while (offset < JOINT_CONF.max) {
            jointStopped(token);
            var res;
            try { res = jointUnwrap(await jointRequest(screen.url, Object.assign({}, params, jointPage(offset, JOINT_CONF.size)), token)); }
            catch (e) { jointStopped(token); reason = e.message; break; }
            if (total !== null && res.total !== null && res.total !== total) reason = '조회 도중 총건수가 바뀌었습니다';
            if (res.total !== null) total = res.total;
            var added = 0;
            res.rows.forEach(function (r) {
                var id = r && String(r.intellRqstNo || '').trim();
                if (!id) { malformed++; return; }
                if (!seen[id]) { seen[id] = true; rows.push(Object.assign({}, r, { intellRqstNo: id })); added++; }
            });
            progress(rows.length, total);
            if (total === null) { reason = '서버 총건수 미제공: 수신한 후보만 확인'; break; }
            if (!reason && !malformed && rows.length === total) { complete = true; break; }
            if (!res.rows.length || !added) { reason = reason || '다음 페이지를 확인하지 못했습니다'; break; }
            if (res.rows.length > JOINT_CONF.size) { reason = reason || '서버 페이지 범위를 확인할 수 없습니다'; break; }
            // Advance by the confirmed server page size; Kendo's native page/skip contract is retained.
            if (res.rows.length < JOINT_CONF.size && rows.length < total) { reason = reason || '서버가 요청 페이지 크기보다 적게 반환했습니다'; break; }
            offset += JOINT_CONF.size;
        }
        if (!complete && !reason) reason = '후보 조회 상한 ' + JOINT_CONF.max + '건 도달: 조건을 좁혀 주세요';
        if (malformed) { complete = false; reason += (reason ? ' · ' : '') + '신청번호 없는 후보 ' + malformed + '건'; }
        return { rows: rows, total: total, complete: complete, reason: reason };
    }
    async function jointCheck(candidates, token, progress) {
        var index = 0, done = 0, matches = [], failed = [], other = 0;
        async function worker() {
            while (index < candidates.length) {
                jointStopped(token);
                var row = candidates[index++], id = String(row.intellRqstNo), owned;
                try {
                    var cached = JOINT.cache.get(id);
                    if (cached && Date.now() - cached.at < JOINT_CONF.cacheMs) owned = cached.value;
                    else {
                        owned = jointOwners(await jointRequest('/pms/res/intellppty/searchIntellOwr.json', { intellRqstNo: id }, token));
                        JOINT.cache.set(id, { at: Date.now(), value: owned });
                    }
                    jointStopped(token);
                    if (owned.joint) matches.push({ row: row, members: owned.members, externalMajority: owned.externalMajority });
                    else other++;
                } catch (e) { jointStopped(token); failed.push({ row: row, reason: e.message }); }
                done++; progress({ matches: matches, failed: failed, other: other, done: done, candidateCount: candidates.length });
            }
        }
        await Promise.all(Array.from({ length: Math.min(JOINT_CONF.concurrency, candidates.length) }, worker));
        return { matches: matches, failed: failed, other: other, done: done, candidateCount: candidates.length };
    }
    function jointFormParameters(form) {
        // Portal serializeObject is the form contract observed in the supplied native HTML.
        // It handles Kendo values and hidden lookup codes; no controls are enabled or changed.
        if (typeof form.serializeObject === 'function') {
            var nativeData = form.serializeObject();
            if (nativeData && typeof nativeData === 'object' && !Array.isArray(nativeData)) return Object.assign({}, nativeData);
            throw new Error('검색폼 직렬화 결과를 확인할 수 없습니다');
        }
        var params = {};
        form.serializeArray().forEach(function (p) { if (Object.prototype.hasOwnProperty.call(params, p.name)) params[p.name] = [].concat(params[p.name], p.value); else params[p.name] = p.value; });
        if (typeof form.find === 'function') form.find('input[name],select[name],textarea[name]').each(function () {
            var el = this, name = el.name, type = String(el.type || '').toLowerCase();
            if (!name || Object.prototype.hasOwnProperty.call(params, name) || /^(?:button|submit|reset|file)$/.test(type) || (/^(?:radio|checkbox)$/.test(type) && !el.checked)) return;
            // serializeArray omits disabled lookup controls. Read their existing value without mutation.
            var field = $(el), value = typeof field.kval === 'function' ? field.kval() : field.val();
            if (value != null) params[name] = value;
        });
        return params;
    }
    function jointExpandedDate(compact, sample, screen) {
        var text = String(sample == null ? '' : sample), hyphen;
        if (/^\d{4}-\d{2}-\d{2}/.test(text)) hyphen = true;
        else if (/^\d{8}$/.test(text)) hyphen = false;
        else hyphen = screen && screen.dateFormat === 'hyphen';
        return hyphen ? compact.slice(0, 4) + '-' + compact.slice(4, 6) + '-' + compact.slice(6) : compact;
    }
    function jointParameters(wide) {
        var form = $('#searchForm'); if (!form.length) throw new Error('검색폼을 찾을 수 없습니다');
        var params = jointFormParameters(form), formInfo = detectSearchForm(), screen = jointScreen(location.pathname);
        if (wide) {
            var sample = params.rqstStrDt || params.rqstEndDt;
            params.rqstStrDt = jointExpandedDate('20000101', sample, screen);
            params.rqstEndDt = jointExpandedDate(jointToday(), sample, screen);
        }
        // Resolve the native keyword basis without clicking Search or mutating the native grid.
        var kw = formInfo ? $.trim(formInfo.$kw.val() || '') : $.trim(params.keyword || params.searchKeyword || '');
        if (kw && !formInfo && !(params.item || params.searchItem)) throw new Error('검색기준을 직접 선택한 뒤 다시 조회해 주세요');
        if (kw && formInfo) {
            var item = currentItem(formInfo);
            if (AUTO.on || !item) {
                var plan = planAttempts(kw), opt = null;
                for (var i = 0; i < plan.queue.length && !opt; i++) { opt = findOptionByLabel(formInfo.$sel, plan.queue[i].labels); if (opt) kw = plan.queue[i].kw; }
                if (!opt) throw new Error('검색기준을 직접 선택한 뒤 다시 조회해 주세요');
                item = opt.value;
            }
            params[formInfo.$sel.attr('name') || 'item'] = item;
            params[formInfo.$kw.attr('name') || 'keyword'] = kw;
        }
        var basis = '검색어';
        if (formInfo) formInfo.$sel.find('option').each(function () { if ($(this).attr('value') === String(params.item || params.searchItem || '')) basis = $.trim($(this).text()); });
        return { params: params, summary: jointDate(params.rqstStrDt) + ' ~ ' + jointDate(params.rqstEndDt) + (kw ? ' · ' + basis + ': ' + kw : ' · 검색어 없음') + ' · 나머지 화면 검색조건 유지' };
    }
    function jointMount() {
        if (!jointScreen(location.pathname) || !CTX.btnSearch || !CTX.btnSearch.length || document.getElementById('tmJointOpen')) return;
        var button = $('<button type="button" id="tmJointOpen" class="tm-joint-btn">공동출원 조회</button>');
        CTX.btnSearch.after(button); button.on('click', function (e) { e.preventDefault(); jointOpen(); });
        $('<style>').text([
            '.tm-joint-btn{appearance:none;background:#fff;border:1px solid #dce0e8;border-radius:8px;color:#29354b;padding:4px 10px;font:12px/18px sans-serif;cursor:pointer;margin:0 0 0 6px;white-space:nowrap}',
            '.tm-joint-btn:hover{border-color:#f48222;background:#fff8f1}.tm-joint-btn:disabled{opacity:.5;cursor:default}.tm-joint-btn.tm-joint-primary{background:#ff7f20;border-color:#ff7f20;color:#fff;font-weight:600}',
            '#tmJointPanel{margin:12px 0;background:#fff;border:1px solid #e1e4eb;border-radius:12px;box-shadow:0 1px 3px #17223908;color:#25344c;font:12px/1.6 sans-serif;overflow:hidden}',
            '#tmJointPanel .tm-joint-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:13px 16px;border-bottom:1px solid #eceef3}',
            '#tmJointPanel h3{font-size:15px;margin:0 auto 0 0;color:#19283b}#tmJointPanel .tm-joint-tools{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 16px;background:#fcfcfe}',
            '#tmJointPanel .tm-joint-note{color:#788397;font-size:11px;margin:0;padding:0 16px 10px}#tmJointPanel .tm-joint-state{padding:10px 16px;color:#62718a;border-top:1px solid #eceef3}',
            '#tmJointPanel .tm-joint-state[data-partial="1"]{color:#a55818;background:#fff9f2}#tmJointPanel .tm-joint-scroll{overflow:auto;max-height:480px}',
            '#tmJointPanel table{width:100%;min-width:850px;border-collapse:collapse;table-layout:auto}#tmJointPanel th{background:#f7f8fb;font-weight:500;color:#748096;text-align:left;position:sticky;top:0;z-index:1}',
            '#tmJointPanel th,#tmJointPanel td{padding:9px 12px;border-bottom:1px solid #eceef3;vertical-align:top}#tmJointPanel .tm-joint-no{min-width:110px}#tmJointPanel .tm-joint-title{min-width:230px}',
            '#tmJointPanel .tm-joint-link{border:0;background:none;color:#293c58;font-weight:600;text-decoration:underline;cursor:pointer;padding:0}#tmJointPanel .tm-joint-tag{display:inline-block;border-radius:10px;background:#fff0e4;color:#ad570d;padding:1px 7px;font-size:11px}',
            '#tmJointPanel .tm-joint-empty{padding:24px;text-align:center;color:#8490a2}#tmJointPanel .tm-joint-fail{margin:8px 16px;color:#a55818}#tmJointPanel small{color:#8a94a5;display:block}'
        ].join('')).appendTo('head');
    }
    function jointOpen() {
        if (JOINT.panel) { JOINT.panel.show(); return; }
        var p = $('<section id="tmJointPanel" aria-label="공동출원 조회"><div class="tm-joint-head"><h3>공동출원 조회</h3><button type="button" class="tm-joint-btn" data-joint="close">닫기</button></div><div class="tm-joint-tools"><label><input type="checkbox" data-joint="wide" checked> 기간 확대 (2000년~오늘)</label><button type="button" class="tm-joint-btn tm-joint-primary" data-joint="run">조회</button><button type="button" class="tm-joint-btn" data-joint="cancel" disabled>중지</button><button type="button" class="tm-joint-btn" data-joint="refresh">기관 정보 새로 확인</button><button type="button" class="tm-joint-btn" data-joint="export" disabled>목록 CSV</button></div><p class="tm-joint-note">현재 화면의 검색조건을 적용해 목록의 모든 페이지를 조회합니다. 각 신청번호의 기관 정보를 확인하며, KRISS와 외부기관이 함께 있는 건만 표시합니다. 조회 권한과 검색조건 밖 자료는 포함되지 않습니다.</p><div class="tm-joint-state" role="status" aria-live="polite">조회 버튼을 누르면 시작합니다.</div><div class="tm-joint-scroll"><div class="tm-joint-empty">협약과 연차료 검토를 위한 공동출원 목록</div></div><div class="tm-joint-fail"></div></section>');
        var anchor = (CTX.table && CTX.table.length) ? CTX.table : $('#searchForm'); anchor.after(p); JOINT.panel = p;
        p.on('click', '[data-joint]', function () {
            var action = $(this).attr('data-joint');
            if (action === 'run') jointRun(false);
            if (action === 'refresh') jointRun(true);
            if (action === 'cancel') jointCancel();
            if (action === 'close') { jointCancel(); p.hide(); }
            if (action === 'export') jointExport();
        });
        p.on('click', '[data-joint-id]', function () {
            var id = $(this).attr('data-joint-id');
            if (typeof $.popupWindow !== 'function') { jointStatus('상세보기 팝업 함수를 사용할 수 없습니다. 기존 목록에서 관리번호를 열어 주세요.', true); return; }
            $.popupWindow('/pms/iprs/mng/popup/S_PMS_03019020.do', { width: 1200, height: 840, resizable: 'yes', scrollbars: true, center: 'parent', dataSource: { intellRqstNo: id } });
        });
    }
    function jointBusy(busy) { if (!JOINT.panel) return; JOINT.panel.find('[data-joint="run"],[data-joint="refresh"],[data-joint="wide"]').prop('disabled', busy); JOINT.panel.find('[data-joint="cancel"]').prop('disabled', !busy); }
    function jointStatus(message, partial) { if (JOINT.panel) JOINT.panel.find('.tm-joint-state').text(message).attr('data-partial', partial ? '1' : '0'); }
    function jointCancel() {
        if (!JOINT.active) return;
        JOINT.active = false; JOINT.token++;
        JOINT.requests.slice().forEach(function (r) { try { r.abort(); } catch (e) {} });
        if (JOINT.result) { JOINT.result.complete = false; JOINT.result.reason = '사용자 중지'; jointRender(JOINT.result); }
        jointBusy(false); jointStatus('조회 중지 · 확인된 공동출원 ' + (JOINT.result ? JOINT.result.matches.length : 0) + '건만 표시합니다. 전체 결과가 아닙니다.', true);
    }
    async function jointRun(refresh) {
        if (JOINT.active) return;
        var query, screen = jointScreen(location.pathname);
        try { query = jointParameters(JOINT.panel.find('[data-joint="wide"]').prop('checked')); } catch (e) { jointStatus(e.message, true); return; }
        if (refresh) JOINT.cache.clear();
        var token = ++JOINT.token; JOINT.active = true; jointBusy(true);
        JOINT.result = { matches: [], failed: [], done: 0, candidateCount: 0, complete: false, reason: '', scope: screen.label + ' · ' + query.summary };
        JOINT.panel.find('.tm-joint-fail').empty(); jointRender(JOINT.result); jointStatus(JOINT.result.scope + ' · 후보 조회 중…', false);
        try {
            var candidates = await jointCandidates(screen, query.params, token, function (n, total) { jointStatus(JOINT.result.scope + ' · 후보 수신 ' + n + (total === null ? '' : '/' + total) + '건', false); });
            jointStopped(token);
            var checked = await jointCheck(candidates.rows, token, function (progress) {
                Object.assign(JOINT.result, progress); jointStatus(JOINT.result.scope + ' · 기관 확인 ' + progress.done + '/' + progress.candidateCount + '건 · 공동출원 ' + progress.matches.length + '건 · 확인 실패 ' + progress.failed.length + '건', false);
                if (progress.done % 15 === 0 || progress.done === progress.candidateCount) jointRender(JOINT.result);
            });
            jointStopped(token);
            Object.assign(JOINT.result, checked, { total: candidates.total, complete: candidates.complete && !checked.failed.length, reason: candidates.reason });
            jointRender(JOINT.result);
            jointStatus(JOINT.result.scope + ' · ' + (JOINT.result.complete ? '해당 조건 조회 완료' : '부분 조회') + ' · 공동출원 ' + checked.matches.length + '건 / 기관 확인 ' + checked.done + '건' + (checked.failed.length ? ' · 확인 실패 ' + checked.failed.length + '건' : '') + (candidates.reason ? ' · ' + candidates.reason : ''), !JOINT.result.complete);
        } catch (e) { if (token === JOINT.token) jointStatus('부분 조회 · ' + e.message + ' · 확인된 결과만 표시합니다.', true); }
        finally { if (token === JOINT.token) { JOINT.active = false; jointBusy(false); jointRender(JOINT.result); } }
    }
    function jointRender(result) {
        if (!JOINT.panel) return;
        var matches = result.matches.slice().sort(function (a, b) { return String(a.row.intellMngNo || a.row.intellRqstNo).localeCompare(String(b.row.intellMngNo || b.row.intellRqstNo)); });
        var html = matches.length ? '<table><thead><tr><th>관리번호 / 신청번호</th><th>발명명칭</th><th>공동기관</th><th>특허권 지분</th><th>비용분담</th><th>확인 사항</th></tr></thead><tbody>' + matches.map(function (m) {
            return m.members.map(function (o, i) {
                var span = ' rowspan="' + m.members.length + '"';
                return '<tr>' + (i === 0 ? '<td class="tm-joint-no"' + span + '><button type="button" class="tm-joint-link" data-joint-id="' + jointEscape(m.row.intellRqstNo) + '">' + jointEscape(m.row.intellMngNo || m.row.intellRqstNo) + '</button><small>' + jointEscape(m.row.intellRqstNo) + '</small></td><td class="tm-joint-title"' + span + '>' + jointEscape(m.row.ivenNm || m.row.korRegNm || '명칭 없음') + '</td>' : '') + '<td>' + jointEscape(o.orgNm) + '</td><td>' + jointEscape(o.owrQuota === null ? '확인 필요' : o.owrQuota + '%') + '</td><td>' + jointEscape(o.costShareRatio === null ? '확인 필요' : o.costShareRatio + '%') + '</td>' + (i === 0 ? '<td' + span + '>' + (m.externalMajority ? '<span class="tm-joint-tag">타기관 한 곳 지분 &gt;50%</span>' : '') + '</td>' : '') + '</tr>';
            }).join('');
        }).join('') + '</tbody></table>' : '<div class="tm-joint-empty">' + (JOINT.active ? '기관 정보를 확인하고 있습니다.' : '확인된 공동출원이 없습니다.') + '</div>';
        JOINT.panel.find('.tm-joint-scroll').html(html);
        JOINT.panel.find('[data-joint="export"]').prop('disabled', !matches.length);
        if (result.failed.length) JOINT.panel.find('.tm-joint-fail').html('<details><summary>기관 확인 실패 ' + result.failed.length + '건 — 결과에 포함되지 않음</summary>' + result.failed.map(function (f) { return '<div>' + jointEscape(f.row.intellMngNo || f.row.intellRqstNo) + ' · ' + jointEscape(f.reason) + '</div>'; }).join('') + '</details>');
    }
    function jointCsvCell(v) { var s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
    function jointExport() {
        var r = JOINT.result; if (!r || !r.matches.length) return;
        var rows = [['조회 범위', r.scope], ['조회 상태', r.complete ? '해당 조건 조회 완료' : '부분 조회 / 확인된 결과만'], ['관리번호', '신청번호', '발명명칭', '기관 코드', '기관명', '특허권 지분(%)', '비용분담(%)', '타기관 한 곳 지분 50% 초과']];
        r.matches.forEach(function (m) { m.members.forEach(function (o) { rows.push([m.row.intellMngNo, m.row.intellRqstNo, m.row.ivenNm || m.row.korRegNm, o.orgCd, o.orgNm, o.owrQuota, o.costShareRatio, m.externalMajority ? 'Y' : 'N']); }); });
        var blob = new Blob(['\ufeff' + rows.map(function (row) { return row.map(jointCsvCell).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'KRISS_공동출원_' + jointToday() + (r.complete ? '' : '_부분조회') + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }


    /* ============================================================
     *  초기화
     * ============================================================ */
    /* v1.8.0: filter the existing application grid by its observed soJoCls field.
     * This is the list's S/J classification, distinct from the institution audit panel.
     * Keep the same Kendo DataSource, schema, models, columns and native row actions.
     * Never send an unverified soJoCls search parameter to the server.
     */
    var NATIVE_JOINT = { token: 0, active: false, requests: [], cancel: null, applied: '', ui: null };

    function nativeJointStatus(message, failed) {
        if (NATIVE_JOINT.ui) NATIVE_JOINT.ui.find('[data-native-joint="status"]').text(message).attr('data-error', failed ? '1' : '0');
    }
    function nativeJointBusy(busy) {
        if (NATIVE_JOINT.ui) NATIVE_JOINT.ui.find('[data-native-joint="stop"]').prop('disabled', !busy).toggle(busy);
    }
    function nativeJointStop(message) {
        if (NATIVE_JOINT.cancel) NATIVE_JOINT.cancel();
        if (message) nativeJointStatus(message, true);
    }
    function nativeJointAbortRequests() {
        NATIVE_JOINT.requests.slice().forEach(function (request) { request.abort(); });
    }
    function nativeJointRows(rows, mode) {
        var unknown = 0, known = 0;
        var matches = rows.filter(function (row) {
            var value = String(row && row.soJoCls || '').trim().toUpperCase();
            if (value !== 'J' && value !== 'S') { unknown++; return false; }
            known++;
            return value === mode;
        });
        if (rows.length && !known) throw new Error('목록의 단독/공동 구분값을 확인할 수 없습니다');
        return { rows: matches, unknown: unknown };
    }
    function nativeJointEnvelope(raw, originalRows, rows, total) {
        // Replace only the observed list and count fields, keeping the native response shape.
        function copy(value, depth) {
            if (value === originalRows) return rows;
            if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date || depth > 12) return value;
            var result = {};
            Object.keys(value).forEach(function (key) {
                result[key] = /^(total|totalCount|recordsTotal)$/.test(key) && value[key] != null
                    ? (typeof value[key] === 'string' ? String(total) : total)
                    : copy(value[key], depth + 1);
            });
            return result;
        }
        return copy(raw, 0);
    }
    async function nativeJointCollect(first, params, token, serverPaging, fetchPage, progress) {
        var parsed = jointUnwrap(first);
        if (parsed.total === parsed.rows.length || (parsed.total === null && !serverPaging)) return parsed.rows;
        // A native page is only a sample. Start at offset zero and verify every page.
        var rows = [], ids = Object.create(null), total = null, offset = 0, size = JOINT_CONF.size;
        while (offset < JOINT_CONF.max) {
            jointStopped(token, NATIVE_JOINT);
            var page = jointUnwrap(await fetchPage(Object.assign({}, params, jointPage(offset, size))));
            if (page.total === null) throw new Error('전체 건수가 없어 모든 페이지의 조회 여부를 확인할 수 없습니다');
            if (total !== null && total !== page.total) throw new Error('조회 중 전체 건수가 바뀌었습니다. 다시 검색해 주세요');
            total = page.total;
            if (total > JOINT_CONF.max) throw new Error('조회 대상이 ' + JOINT_CONF.max + '건을 넘습니다. 기간이나 검색어를 좁혀 주세요');
            page.rows.forEach(function (row) {
                var id = String(row && row.intellRqstNo || '').trim();
                if (!id) throw new Error('신청번호 없는 행이 있어 전체 목록을 확인할 수 없습니다');
                if (ids[id]) throw new Error('같은 신청번호가 반복 수신되어 다음 페이지를 확인할 수 없습니다');
                ids[id] = true; rows.push(row);
            });
            progress(rows.length, total);
            if (rows.length === total) return rows;
            if (rows.length > total || !page.rows.length) throw new Error('전체 건수와 수신한 목록이 일치하지 않습니다');
            // Some servers cap pageSize. Use the observed first-page size consistently.
            if (!offset && page.rows.length < size) size = page.rows.length;
            else if (page.rows.length !== size) throw new Error('다음 페이지 범위를 확인할 수 없습니다');
            offset += size;
        }
        throw new Error('조회 상한에 도달했습니다. 기간이나 검색어를 좁혀 주세요');
    }
    function nativeJointTransport(ds, originalRead, transport, options) {
        nativeJointStop();
        var mode = $('#tmNativeJointClass').val() || '';
        if (!mode) {
            NATIVE_JOINT.applied = '';
            nativeJointStatus('전체 · 단독/공동 구분 없이 표시합니다.', false);
            return originalRead.call(transport, options);
        }
        var token = ++NATIVE_JOINT.token;
        var raw = null, parsed = null, settled = false, request = null, timer = null;
        var params = {}, requestData = options.data;
        NATIVE_JOINT.active = true;
        function current() { return !settled && token === NATIVE_JOINT.token; }
        function end() {
            settled = true; clearTimeout(timer);
            NATIVE_JOINT.active = false; NATIVE_JOINT.cancel = null;
            nativeJointAbortRequests(); nativeJointBusy(false);
        }
        function stopSmartSearch() {
            SS.active = false; SS.pending = false;
            if (SS.timer) { clearTimeout(SS.timer); SS.timer = null; }
        }
        function fail(error) {
            if (!current()) return;
            end(); stopSmartSearch();
            NATIVE_JOINT.applied = mode;
            // An incomplete scan is an error, never a successful zero-result search.
            nativeJointStatus('조회 미완료 · ' + error.message + (parsed ? ' · 결과를 표시하지 않았습니다.' : ' · 기존 표는 이전 조회 결과입니다.'), true);
            if (parsed) options.success(nativeJointEnvelope(raw, parsed.rows, [], 0));
            else if (options.error) options.error({ status: 0, statusText: error.message }, 'error', error.message);
        }
        NATIVE_JOINT.cancel = function () {
            if (!current()) return;
            end(); stopSmartSearch();
            try { if (request && typeof request.abort === 'function') request.abort(); } catch (e) {}
            // Release Kendo's read queue; a late native callback is ignored by current().
            if (options.error) options.error({ status: 0, statusText: 'abort' }, 'abort', '조회 취소');
        };
        if (mode) {
            try {
                params = jointFormParameters($('#searchForm'));
                if (typeof requestData === 'string') requestData = JSON.parse(requestData);
                if (requestData && typeof requestData === 'object') params = Object.assign({}, params, requestData);
            } catch (e) { fail(e); return; }
            nativeJointBusy(true);
            nativeJointStatus((mode === 'J' ? '공동' : '단독') + ' 검색 중… 현재 검색조건의 전체 목록을 확인합니다.', false);
            // Additional list pages may legitimately take longer than one smart-search request.
            if (SS.timer) { clearTimeout(SS.timer); SS.timer = null; }
        }
        timer = setTimeout(function () { fail(new Error('서버 응답 시간 초과')); }, JOINT_CONF.timeout);
        var wrapped = Object.assign({}, options, {
            success: function (response) {
                if (!current()) return;
                clearTimeout(timer);
                raw = response;
                (async function () {
                    try {
                        parsed = jointUnwrap(raw);
                        var all = await nativeJointCollect(raw, params, token, !!ds.options.serverPaging, function (data) {
                            return jointRequest('/pms/res/intellppty/selectIntellpptyList.json', data, token, NATIVE_JOINT);
                        }, function (count, total) { nativeJointStatus('단독/공동 검색 · 목록 확인 ' + count + '/' + total + '건', false); });
                        if (!current()) return;
                        var result = nativeJointRows(all, mode), pageRows = result.rows;
                        if (ds.options.serverPaging) {
                            var data = requestData || {}, take = Number(data.take || data.pageSize || ds.pageSize()) || 15;
                            var skip = data.skip != null ? Number(data.skip) : Math.max(0, (Number(data.page || ds.page()) - 1) * take);
                            pageRows = result.rows.slice(skip, skip + take);
                        }
                        var filtered = nativeJointEnvelope(raw, parsed.rows, pageRows, result.rows.length);
                        end(); NATIVE_JOINT.applied = mode;
                        nativeJointStatus((mode === 'J' ? '공동' : '단독') + ' ' + result.rows.length + '건 · 검색조건 내 ' + all.length + '건 확인'
                            + (result.unknown ? ' · 구분값 미확인 ' + result.unknown + '건 제외' : ''), false);
                        options.success(filtered);
                    } catch (e) { fail(e); }
                })();
            },
            error: function () {
                if (!current()) return;
                end(); stopSmartSearch();
                nativeJointStatus('서버 조회 실패 · 기존 표는 이전 조회 결과입니다.', true);
                if (options.error) options.error.apply(this, arguments);
            }
        });
        try { request = originalRead.call(transport, wrapped); }
        catch (e) { fail(e); }
        return request;
    }
    function nativeJointMount() {
        // Only this supplied screen has a verified S/J column and model contract.
        if (!/S_PMS_03010100\.do/.test(location.pathname) || document.getElementById('tmNativeJointClass')) return;
        var ds = CTX.grid && CTX.grid.dataSource;
        if (!ds || !ds.transport || typeof ds.transport.read !== 'function' || !CTX.table) return;
        if (!flatColumns(CTX.grid.columns).some(function (c) { return c.field === 'soJoCls'; })) return;
        var ui = $('<span class="tm-native-joint"><select id="tmNativeJointClass" aria-label="단독/공동여부"><option value="">전체</option><option value="J">공동</option><option value="S">단독</option></select><span data-native-joint="status" role="status" aria-live="polite">선택 후 검색하면 기존 결과표에 표시합니다.</span><button type="button" class="k-button tm-btn" data-native-joint="stop" disabled style="display:none">중지</button></span>');
        // Deliberately no name attribute: this is a local filter, not a server parameter.
        mountNativeRow('단독/공동여부', ui); NATIVE_JOINT.ui = ui;
        $('<style>').text('.tm-native-joint{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.tm-native-joint select{font:12px "Malgun Gothic",sans-serif;min-width:100px;height:26px;padding:2px 8px;border:1px solid #ccc;background:#fff;border-radius:3px}.tm-native-joint [role="status"]{font-size:11px;color:#777}.tm-native-joint [data-error="1"]{color:#a55818}').appendTo('head');
        var transport = ds.transport, originalRead = transport.read;
        transport.read = function (options) { return nativeJointTransport(ds, originalRead, transport, options); };
        ui.on('change', '#tmNativeJointClass', function () {
            nativeJointStop();
            nativeJointStatus('검색을 누르면 ' + (this.value === 'J' ? '공동' : this.value === 'S' ? '단독' : '전체') + ' 조건이 적용됩니다. 기존 표는 이전 조회 결과입니다.', false);
        });
        ui.on('click', '[data-native-joint="stop"]', function () { nativeJointStop('조회 중지 · 기존 표는 이전 조회 결과입니다.'); });
        if (CTX.btnReset) CTX.btnReset.on('click.tmNativeJoint', function () {
            var reload = !!NATIVE_JOINT.applied || NATIVE_JOINT.active;
            nativeJointStop(); ui.find('select').val('');
            nativeJointStatus('전체 · 선택 후 검색하면 기존 결과표에 표시합니다.', false);
            if (reload) setTimeout(nativeSearch, 0);
        });
    }

    var retry = 0;
    (function tryInit() {
        var g = null;
        try { g = findGrid(); } catch (e) { err('findGrid', e); }
        if (g) { safeInit(g); return; }
        if (retry++ < CONFIG.INIT_MAX_RETRY) setTimeout(tryInit, CONFIG.INIT_RETRY_MS);
        else console.warn('[TM-List] Kendo 그리드 미발견 — 스킵 (retry 소진)');
    })();

    function safeInit(grid) {
        CTX.grid = grid;

        step('killUsearch', killUsearch);
        step('detectDateRange', detectDateRange);
        step('detectButtonsAndTable', function () {
            CTX.btnSearch = findBtn(['#btnSearch'], ['.btn_search', 'button.btn_search'], '검색');
            CTX.btnReset = findBtn(['#btnReset'], ['.btn_reset', 'button.btn_reset'], '초기화');
            CTX.countEl = findCountEl();
            CTX.table = (CTX.dateStart && CTX.dateStart.closest('table').length) ? CTX.dateStart.closest('table')
                        : ($('#searchForm table').length ? $('#searchForm table').first()
                        : ($('.sform_type02').length ? $('.sform_type02').first() : null));
        });

        step('samplePrimary', samplePrimary);
        step('injectStyles', injectStyles);
        step('addPeriodButtons', addPeriodButtons);
        setTimeout(function () { step('fixPeriodOneLine', fixPeriodOneLine); }, 80);

        step('bindNativeSearch', bindNativeSearch);   // ① 네이티브 검색어 칸에 부착
        step('hookGrid', hookGrid);
        step('jointMount', jointMount);
        step('nativeJointMount', nativeJointMount);
        logDetect();
    }

    function logDetect() {
        var f = detectSearchForm();
        log('감지결과', {
            ver: VER, page: location.pathname,
            dateRange: !!(CTX.dateStart && CTX.dateEnd), btnSearch: !!CTX.btnSearch, btnReset: !!CTX.btnReset,
            countId: (CTX.countEl && CTX.countEl.attr('id')) || null,
            searchForm: f ? f.kind : null, options: f ? optionDump(f.$sel) : null,
            statusChips: CONFIG.STATUS_CHIPS, periodMode: CONFIG.SEARCH_PERIOD_MODE, primary: CTX.primary
        });
    }
    function optionDump($sel) {
        var out = [];
        $sel.find('option').each(function () {
            var v = $(this).attr('value');
            if (v) out.push(v + '=' + $.trim($(this).text()));
        });
        return out;
    }

    /* ── 통합검색(팔레트) 제거 ───────────────────────────────────── */
    function killUsearch() {
        if (!CONFIG.HIDE_USEARCH_ROW) return;
        if (CONFIG.DISABLE_USEARCH_SCRIPT) {
            try {
                if (localStorage.getItem(CONFIG.USEARCH_KILL_KEY) !== '1') {
                    localStorage.setItem(CONFIG.USEARCH_KILL_KEY, '1');
                    log('통합검색 스크립트 킬 스위치 설정. 되돌리기: localStorage.removeItem("' + CONFIG.USEARCH_KILL_KEY + '")');
                }
            } catch (e) { warn('킬 스위치 설정 실패:', e && e.name); }
        }
        (function hide(n) {
            var $row = $('tr[data-tm-usearch]');
            if ($row.length) { $row.hide(); log('통합검색 행 숨김'); return; }
            if (n < 30) setTimeout(function () { hide(n + 1); }, 500);
        })(0);
    }

    /* ============================================================
     *  감지 유틸
     * ============================================================ */
    function findGrid() {
        var g1 = $('#grid1').data('kendoGrid');
        if (g1 && g1.dataSource) return g1;
        var best = null, bestN = -1;
        $('.k-grid').each(function () {
            var g = $(this).data('kendoGrid');
            if (g && g.dataSource) {
                var n = 0; try { n = g.dataSource.data().length; } catch (e) {}
                if (n > bestN) { bestN = n; best = g; }
            }
        });
        return best;
    }
    function findCountEl() {
        var i, $c;
        for (i = 0; i < CONFIG.COUNT_ID_CANDIDATES.length; i++) {
            $c = $('#' + CONFIG.COUNT_ID_CANDIDATES[i]);
            if ($c.length) return $c.first();
        }
        $c = $('.infonum span.txt_color_blue').first();
        if ($c.length) return $c;
        $c = $('.infonum span[id]').first();
        return $c.length ? $c : null;
    }
    function detectDateRange() {
        var $end = $('input[data-gteqdate-field]').filter(function () { return $(this).data('kendoDatePicker'); }).first();
        if ($end.length) {
            var startId = $end.attr('data-gteqdate-field');
            var $start = startId ? $(document.getElementById(startId)) : $();
            if ($start.length && $start.data('kendoDatePicker')) { CTX.dateStart = $start; CTX.dateEnd = $end; return; }
        }
        var $scope = $('#searchForm').length ? $('#searchForm') : $(document);
        var dps = $scope.find('input[data-role="datepicker"]').filter(function () { return $(this).data('kendoDatePicker'); });
        if (dps.length < 2) {
            dps = $('input[data-role="datepicker"]').filter(function () { return $(this).data('kendoDatePicker'); });
        }
        if (dps.length >= 2) { CTX.dateStart = dps.eq(0); CTX.dateEnd = dps.eq(1); }
    }
    function findBtn(ids, classes, text) {
        var i, $b;
        for (i = 0; i < ids.length; i++) { $b = $(ids[i]); if ($b.length) return $b.first(); }
        for (i = 0; i < classes.length; i++) { $b = $(classes[i]); if ($b.length) return $b.first(); }
        $b = $('button, a.btn, input[type=button]').filter(function () {
            return $.trim($(this).text() || $(this).val()) === text;
        }).first();
        return $b.length ? $b : null;
    }
    function findStatusCell() {
        var $scope = (CTX.table && CTX.table.length) ? CTX.table.find('th, label') : $('th, label');
        var $cell = null;
        $scope.each(function () {
            if ($cell) return;
            var t = $.trim($(this).text());
            if (CONFIG.STATUS_LABELS.indexOf(t) !== -1) {
                var $th = $(this).is('th') ? $(this) : $(this).closest('th');
                if ($th.length && $th.next('td').length) { $cell = $th.next('td'); return; }
                var $td = $(this).closest('td');
                if ($td.length) { $cell = $td; return; }
            }
        });
        return ($cell && $cell.length) ? $cell : null;
    }
    function samplePrimary() {
        var el = (CTX.btnSearch && CTX.btnSearch[0]) || $('.btn_color_main')[0] || null;
        if (!el || !window.getComputedStyle) return;
        var c = window.getComputedStyle(el).backgroundColor;
        if (!c || c === 'transparent') return;
        if (/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(c)) return;
        CTX.primary = c;
    }

    /* ============================================================
     *  ① 스마트검색 — 네이티브 검색어 칸 진입점
     * ============================================================ */
    function setHint(msg, strong) {
        if (!$hint) return;
        if (strong) $hint.html('<b></b>').find('b').text(msg);
        else $hint.text(msg || '');
    }

    function detectSearchForm() {
        var $s = $('#searchItem'), $k = $('#searchKeyword');
        if ($s.length && $k.length) return { kind: 'searchItem', $sel: $s, $kw: $k };
        $s = $('#item'); $k = $('#keyword');
        if ($s.length && $k.length) return { kind: 'item', $sel: $s, $kw: $k };
        return null;
    }
    function currentItem(f) {
        try {
            var ddl = f.$sel.data('kendoDropDownList');
            return $.trim(String((ddl ? ddl.value() : f.$sel.val()) || ''));
        } catch (e) { return ''; }
    }
    function unlockKw() {
        var f = detectSearchForm(); if (!f) return;
        f.$kw.prop('disabled', false).prop('readonly', false)
             .removeAttr('tabindex').removeClass('k-state-disabled');
    }

    // v1.6.7: 검색어 칸 포커스 (사용자가 다른 입력을 잡고 있으면 건드리지 않음)
    function focusKw(force) {
        if (!CONFIG.AUTOFOCUS) return;
        var f = detectSearchForm(); if (!f || !f.$kw.length) return;
        var el = f.$kw[0];
        try {
            var a = document.activeElement;
            var busy = a && a !== document.body && a !== document.documentElement && a !== el &&
                       /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(a.tagName || '');
            if (busy && !force) return;
            unlockKw();
            el.focus();
            if (CONFIG.AUTOFOCUS_SELECT && el.select && el.value) el.select();
        } catch (e) { /* 포커스 실패는 무시 */ }
    }
    function focusKwRetry() {
        [0, 250, 700, 1500].forEach(function (ms) { setTimeout(function () { focusKw(false); }, ms); });
    }

    // v1.6.6: 엔진이 검색기준을 바꿀 때는 ENG 가드를 세워 사용자 변경과 구분
    function setItem(f, val) {
        ENG++;
        try {
            var ddl = f.$sel.data('kendoDropDownList');
            if (ddl) { ddl.value(val); ddl.trigger('change'); }
            else { f.$sel.val(val).trigger('change'); }
        } catch (e) { err('setItem', e); }
        setTimeout(function () { if (ENG > 0) ENG--; }, 0);
    }
    function modeHint() {
        return AUTO.on ? '기준 미선택(자동 판별) — 검색어만 입력하면 기준을 찾아 조회'
                       : '검색기준 지정됨 — 자동 판별 해제(기준을 \'전체/선택\'으로 되돌리면 재활성)';
    }

    function bindNativeSearch() {
        var f = detectSearchForm();
        if (!f) { log('검색기준 UI 미발견 — 스마트검색 미적용(기간버튼만)'); return; }

        unlockKw();
        AUTO.on = (currentItem(f) === '');

        // 화면 로직이 기준 변경 시 다시 잠그므로 재해제 + 사용자 변경 감지(v1.6.6)
        f.$sel.on('change.tm', function () { setTimeout(unlockKw, 0); onItemChanged(f, 'select'); });
        try {
            var ddl0 = f.$sel.data('kendoDropDownList');
            if (ddl0 && ddl0.bind) ddl0.bind('change', function () { onItemChanged(f, 'widget'); });
        } catch (e) { warn('검색기준 change 바인딩 실패:', e && e.message); }
        var n = 0, iv = setInterval(function () { unlockKw(); if (++n > 20) clearInterval(iv); }, 1000);

        // 안내 문구를 검색어 칸 옆(네이티브 셀 안)에 부착 — 새 행 추가 없음
        $hint = $('<span class="tm-hint"></span>');
        f.$kw.after($hint);
        setHint(modeHint());

        // Enter
        f.$kw.on('keydown.tm', function (e) {
            var oe = e.originalEvent || e;
            if (oe.isComposing || e.keyCode === 229) return;
            if (e.which !== 13) return;
            e.preventDefault(); e.stopPropagation();
            route(f, $.trim($(this).val()));
        });

        // [검색] 버튼 — 캡처 단계에서만 가로채고, 엔진 자체 클릭은 통과
        if (CTX.btnSearch && CTX.btnSearch[0] && CTX.btnSearch[0].addEventListener) {
            CTX.btnSearch[0].addEventListener('click', function (ev) {
                if (SS.self) return;
                var ff = detectSearchForm(); if (!ff) return;
                var kw = $.trim(ff.$kw.val());
                if (AUTO.on && kw.length >= CONFIG.SEARCH_MIN_LEN) {
                    ev.stopImmediatePropagation();
                    ev.preventDefault();
                    smartSearch(kw);
                }
            }, true);
        }

        if (CTX.btnReset) CTX.btnReset.on('click.tm', function () {
            CTX.savedPeriod = null; CTX.periodSet = false;
            SS.active = false; SS.pending = false;
            AUTO.on = true; setHint(modeHint());
            setTimeout(function () { unlockKw(); focusKw(true); }, 50);
        });

        focusKwRetry();   // v1.6.7: 진입 시 자동 포커스
    }

    // v1.6.6: 사용자가 드롭다운을 직접 바꿨을 때만 모드 전환
    function onItemChanged(f, src) {
        if (ENG > 0) return;                       // 엔진이 바꾼 것 → 모드 유지
        var v = currentItem(f);
        AUTO.on = (v === '');
        setHint(modeHint());
        log('검색기준 사용자 변경(' + src + ') → 자동판별 ' + (AUTO.on ? 'ON' : 'OFF'), v);
    }

    // 자동판별 모드면 항상 자동 판별, 사용자가 기준을 고른 상태면 네이티브 검색
    function route(f, kw) {
        if (!AUTO.on) { nativeSearch(); return; }
        if (!kw) {                                  // 검색어 없음 → 기준 비우고 기간 조회
            setItem(f, '');
            setTimeout(function () { unlockKw(); setHint('기간 조건으로 조회'); nativeSearch(); }, 0);
            return;
        }
        smartSearch(kw);
    }
    function nativeSearch() {
        if (!CTX.btnSearch || !CTX.btnSearch[0]) return;
        SS.self = true;
        try { CTX.btnSearch[0].click(); } catch (e) { err('nativeSearch', e); }
        setTimeout(function () { SS.self = false; }, 0);
    }

    var MNG_RE   = /^p\d{6}[a-z]{2,4}$/i;   // 관리번호 완전형
    var MNG_BASE = /^p\d{6}$/i;            // 관리번호 본체(국가코드 미입력)
    var CODEISH = /^[a-z]{1,4}\d/i;
    var NUMISH  = /^[0-9][0-9\-\/\.\s]*$/;
    var L_MNG = ['관리번호'], L_RQST = ['신청번호'], L_APLY = ['출원번호'], L_REG = ['등록번호'];
    var L_TITLE = ['발명명칭', '제목'], L_MAIN = ['주발명자', '발명자'], L_PLF = ['사무소'];

    // v1.6.8: (검색기준 후보 + 검색어) 쌍 큐 + 번호류 조기중단 플래그
    function planAttempts(q) {
        var s = $.trim(q), up = s.toUpperCase(), out = [], stop = false;
        function push(labels, kw) { out.push({ labels: labels, kw: kw }); }

        if (MNG_RE.test(s) || MNG_BASE.test(s)) {        // P240139KR · P240139 (부분일치 실측 확인)
            push(L_MNG, up);
            (CONFIG.SEARCH_MNG_SUFFIXES || []).forEach(function (sfx) { push(L_MNG, up + sfx); });
            stop = true;
        } else if (/^resi/i.test(s)) {                   // 신청번호
            push(L_RQST, up); stop = true;
        } else if (NUMISH.test(s)) {                     // 출원/등록번호
            push(L_APLY, s); push(L_REG, s); stop = true;
        } else if (CODEISH.test(s)) {                    // 그 외 영문+숫자 코드
            push(L_MNG, up); push(L_APLY, up); stop = true;
        } else if (/[가-힣]/.test(s)) {                  // 모호한 입력 → 순차 재시도
            if (s.replace(/\s+/g, '').length <= 4) { push(L_MAIN, s); push(L_TITLE, s); push(L_PLF, s); }
            else { push(L_TITLE, s); push(L_MAIN, s); push(L_PLF, s); }
        } else {
            push(L_TITLE, s); push(L_MAIN, s); push(L_PLF, s);
        }
        return { queue: out.slice(0, CONFIG.SEARCH_MAX_ATTEMPTS), stopOnMiss: stop };
    }

    function isMasterTab() { return (location.pathname || '').indexOf('S_PMS_03019010') !== -1; }
    function missHint() {
        if (isMasterTab()) return '해당 번호를 찾을 수 없습니다 — 입력값을 확인해 주세요.';
        return '이 탭에는 해당 건이 없습니다(번호 기준 0건) — 단계와 무관하게 찾으려면 [지식재산권 마스터] 탭에서 조회하세요.';
    }
    function findOptionByLabel($sel, labels) {
        for (var i = 0; i < labels.length; i++) {
            var lab = labels[i], hit = null;
            $sel.find('option').each(function () {
                if (hit) return;
                var v = $(this).attr('value'), t = $.trim($(this).text());
                if (v && t.indexOf(lab) !== -1) hit = { value: v, label: t };
            });
            if (hit) return hit;
        }
        return null;
    }

    /* ── 기간 처리 (③) ──────────────────────────────────────────── */
    function applySearchPeriod() {
        if (CONFIG.SEARCH_PERIOD_MODE === 'keep') return;
        if (!CTX.dateStart || !CTX.dateEnd) return;
        if (CTX.periodSet) return;                       // 한 번의 검색에서 1회만
        if (!CTX.savedPeriod) CTX.savedPeriod = { s: CTX.dateStart.val(), e: CTX.dateEnd.val() };
        var sp = CTX.dateStart.data('kendoDatePicker'), ep = CTX.dateEnd.data('kendoDatePicker');
        if (CONFIG.SEARCH_PERIOD_MODE === 'blank') {
            if (sp) sp.value(''); CTX.dateStart.val('');
            if (ep) ep.value(''); CTX.dateEnd.val('');
        } else {                                         // 'wide'
            var st = CONFIG.SEARCH_WIDE_START.split('-');
            var s = new Date(Number(st[0]), Number(st[1]) - 1, Number(st[2]));
            var e = new Date(); e.setHours(0, 0, 0, 0);
            if (sp) sp.value(s); if (ep) ep.value(e);
        }
        CTX.periodSet = true;
        log('검색 기간 설정(' + CONFIG.SEARCH_PERIOD_MODE + ')', CTX.dateStart.val(), '~', CTX.dateEnd.val(),
            '· 원래 값:', CTX.savedPeriod);
    }

    function smartSearch(raw) {
        var kw = $.trim(raw || '');
        if (kw.length < CONFIG.SEARCH_MIN_LEN) { setHint('검색어를 ' + CONFIG.SEARCH_MIN_LEN + '자 이상 입력해 주세요.'); return; }
        var f = detectSearchForm();
        if (!f || !CTX.btnSearch) { setHint('이 화면에서는 자동 판별 조회를 지원하지 않습니다.'); return; }

        var plan = planAttempts(kw);
        SS = { active: true, pending: false, self: false, kw: kw, queue: plan.queue,
               stopOnMiss: plan.stopOnMiss, executed: 0, fbTitle: false,
               tried: {}, cur: null, log: [], timer: null };
        CTX.periodSet = false;
        applySearchPeriod();
        nextAttempt();
    }

    function nextAttempt() {
        var f = detectSearchForm();
        if (!f) { SS.active = false; return; }
        while (SS.queue.length) {
            var at = SS.queue.shift();
            var opt = findOptionByLabel(f.$sel, at.labels);
            if (!opt) { log('자동판별: 이 탭에 없는 기준 —', at.labels.join('/')); continue; }
            var key = opt.value + '|' + at.kw;              // v1.6.8: 기준+검색어 단위
            if (SS.tried[key]) continue;
            SS.tried[key] = 1; SS.cur = opt; SS.kw = at.kw;
            SS.executed++;
            fireSearch(f, opt);
            return;
        }
        // ④ 후보 기준이 이 탭에 전혀 없으면 제목/발명명칭으로 1회 폴백
        if (SS.executed === 0 && !SS.fbTitle) {
            SS.fbTitle = true; SS.stopOnMiss = false;
            SS.queue.push({ labels: L_TITLE, kw: SS.kw });
            return void nextAttempt();
        }
        SS.active = false;
        setHint(SS.stopOnMiss ? missHint()
                              : '결과 없음 — 시도: ' + (SS.log.join(' → ') || '(해당 기준 없음)') + ' · 검색기준을 직접 지정해 보세요.');
        if (CONFIG.REFOCUS_AFTER_SEARCH) setTimeout(function () { focusKw(true); }, 0);
    }

    function fireSearch(f, opt) {
        try {
            setItem(f, opt.value);          // v1.6.6: ENG 가드 하에 변경(사용자 변경으로 계산되지 않음)
            unlockKw();
            f.$kw.val(SS.kw);

            SS.pending = true;
            if (SS.timer) clearTimeout(SS.timer);
            SS.timer = setTimeout(function () {
                if (SS.active) { SS.active = false; SS.pending = false; setHint('서버 응답 지연 — 다시 시도해 주세요.'); }
            }, CONFIG.SEARCH_TIMEOUT_MS);

            setHint('조회 중… 기준: ' + opt.label);
            log('자동판별 조회', { key: f.kind, item: opt.value, label: opt.label, keyword: SS.kw,
                                 period: [CTX.dateStart && CTX.dateStart.val(), CTX.dateEnd && CTX.dateEnd.val()] });
            nativeSearch();
        } catch (e) { err('fireSearch', e); SS.active = false; SS.pending = false; }
    }

    function loadedCount() {
        try { return CTX.grid.dataSource.data().length; } catch (e) { return 0; }
    }

    /* ============================================================
     *  스타일
     * ============================================================ */
    function injectStyles() {
        var P = CTX.primary;
        var css = [
            '.tm-btn.k-button{padding:2px 9px;margin:0 2px 0 0;font-size:12px;line-height:18px;min-width:0;vertical-align:middle}',
            '.tm-btn.k-button.tm-on{background-image:none;background-color:' + P + ';border-color:' + P + ';color:#fff}',
            '.tm-btn.k-button.tm-on:hover{background-color:' + P + ';color:#fff}',
            '.tm-period-wrap{display:inline-block;margin-left:8px;vertical-align:middle;white-space:nowrap}',
            '.tm-chips{display:inline-flex;flex-wrap:wrap;gap:3px;align-items:center;vertical-align:middle}',
            '.tm-hint{font-size:11px;color:#888;margin-left:6px;vertical-align:middle}',
            '.tm-hint b{color:' + P + ';font-weight:600}',
            '.tm-float{position:fixed;top:8px;right:8px;z-index:99999;background:#fff;border:1px solid #ccc;border-radius:4px;padding:8px 10px;box-shadow:0 2px 8px rgba(0,0,0,.15);font-size:12px}'
        ].join('');
        $('#tm-list-style').remove();
        $('<style id="tm-list-style">').text(css).appendTo('head');
    }
    function btn(text) {
        return $('<button type="button" class="k-button tm-btn"></button>').text(text);
    }

    function mountNativeRow(labelText, $content) {
        if (CTX.table && CTX.table.length) {
            var ncols = CTX.table.find('colgroup col').length || 4;
            var $tr = $('<tr class="tm-nrow"></tr>');
            $tr.append($('<th scope="row"></th>').text(labelText));
            $tr.append($('<td></td>').attr('colspan', Math.max(1, ncols - 1)).append($content));
            CTX.table.find('tbody').first().append($tr);
            return true;
        }
        var $line = $('<div style="margin:3px 0"></div>');
        $line.append($('<b style="margin-right:6px"></b>').text(labelText)).append($content);
        var $f = $('#tm-float');
        if (!$f.length) $f = $('<div id="tm-float" class="tm-float"></div>').appendTo('body');
        $f.append($line);
        return false;
    }

    /* ============================================================
     *  기간 버튼 (날짜만 채움)
     * ============================================================ */
    function addPeriodButtons() {
        if (!CTX.dateStart || !CTX.dateEnd) { log('날짜 범위 미검출 — 기간버튼 생략'); return; }
        var offset = 0;
        var $wrap = $('<span class="tm-period-wrap"></span>');
        var $cnt = $('<span class="tm-hint"></span>');
        [{ id: '1m', t: '◀ 1달' }, { id: '3m', t: '3달' }, { id: '1y', t: '1년' }, { id: 'all', t: '전체' }].forEach(function (d) {
            $wrap.append(btn(d.t).attr('data-pid', d.id));
        });
        $wrap.append($cnt);

        $wrap.on('click', '.tm-btn', function () {
            var pid = $(this).data('pid');
            var today = new Date(); today.setHours(0, 0, 0, 0);
            var start = new Date(today), note = '';
            if (pid === '1m') { offset++; start.setMonth(start.getMonth() - offset); note = offset + '개월 전'; }
            else {
                offset = 0;
                if (pid === '3m') start.setMonth(start.getMonth() - 3);
                else if (pid === '1y') start.setFullYear(start.getFullYear() - 1);
                else {
                    if (isHeavyScreen() && !window.confirm('이 화면은 전체 기간 조회 시 서버 지연·타임아웃 위험이 있습니다.\n\n확인: 전체 기간으로 계속\n취소: 최근 3년으로 설정')) {
                        start.setFullYear(start.getFullYear() - 3); note = '전체 제한→3년';
                    } else { start = null; }
                }
            }
            $wrap.find('.tm-btn').removeClass('tm-on'); $(this).addClass('tm-on');
            var sp = CTX.dateStart.data('kendoDatePicker'), ep = CTX.dateEnd.data('kendoDatePicker');
            if (sp) { if (start) sp.value(start); else { sp.value(''); CTX.dateStart.val(''); } }
            if (ep) ep.value(today);
            CTX.savedPeriod = null; CTX.periodSet = true;   // 사용자 지정 기간 우선(검색 시 덮어쓰지 않음)
            $cnt.html((note ? '(' + note + ') ' : '') + '기간만 설정됨 — [검색] 클릭 시 조회');
            if (CONFIG.PERIOD_AUTO_SEARCH) nativeSearch();
        });

        if (CTX.dateStart.closest('td').length) CTX.dateStart.closest('td').append($wrap);
        else mountNativeRow('기간', $wrap);
    }

    function fixPeriodOneLine() {
        if (!CTX.dateStart) return;
        var $td = CTX.dateStart.closest('td');
        var wrap = $td.find('.tm-period-wrap')[0], dateEl = CTX.dateStart[0];
        if (!wrap || !dateEl) return;
        if (wrap.getBoundingClientRect().top <= dateEl.getBoundingClientRect().top + 10) return;
        $td.css('white-space', 'nowrap');
        var $cols = (CTX.table && CTX.table.length) ? CTX.table.find('colgroup col') : $();
        var $tr = $td.closest('tr'), idx = $tr.children().index($td);
        if ($cols.length === 4 && idx === 1) {
            for (var i = 0; i < 4; i++) $cols.eq(i).css('width', CONFIG.WIDEN_COLS[i]);
            log('기간 열 확장 → 버튼 한 줄');
        }
    }

    /* ============================================================
     *  진행상태 칩 (CONFIG.STATUS_CHIPS=false 이면 전체 미동작)
     * ============================================================ */
    function distinctCount(data, field) {
        var set = {}, n = 0, i, v;
        for (i = 0; i < data.length; i++) {
            v = data[i][field];
            if (v === null || v === undefined || v === '') continue;
            if (!set[v]) { set[v] = 1; n++; }
        }
        return n;
    }
    function valuesToMap(list, vf, tf) {
        var m = {}, i, it;
        for (i = 0; i < list.length; i++) {
            it = list[i];
            if (it && it[vf] !== undefined) m[String(it[vf])] = String(it[tf] == null ? it[vf] : it[tf]);
        }
        return m;
    }
    function flatColumns(cols, out) {
        out = out || [];
        (cols || []).forEach(function (c) {
            if (c && c.columns && c.columns.length) flatColumns(c.columns, out);
            else if (c) out.push(c);
        });
        return out;
    }
    function columnStatusMap(field) {
        try {
            var cols = flatColumns(CTX.grid.columns);
            for (var i = 0; i < cols.length; i++) {
                var c = cols[i];
                if (c.field !== field) continue;
                var ev = c.edit && c.edit.values;
                if (ev && ev.length) return valuesToMap(ev, c.edit.valueField || 'value', c.edit.textField || 'label');
                if (c.values && c.values.length) return valuesToMap(c.values, 'value', 'text');
            }
        } catch (e) { err('columnStatusMap', e); }
        return null;
    }
    function detectStatus(data) {
        if (!data.length) return null;
        var first = data[0], i, k, n;
        for (i = 0; i < CONFIG.STATUS_NM_CANDIDATES.length; i++) {
            k = CONFIG.STATUS_NM_CANDIDATES[i];
            if (!(k in first)) continue;
            n = distinctCount(data, k);
            if (n >= 1 && n <= CONFIG.STATUS_MAX_DISTINCT) return { field: k, map: null };
        }
        for (i = 0; i < CONFIG.STATUS_CODE_CANDIDATES.length; i++) {
            k = CONFIG.STATUS_CODE_CANDIDATES[i];
            if (!(k in first)) continue;
            n = distinctCount(data, k);
            if (n >= 1 && n <= CONFIG.STATUS_MAX_DISTINCT) return { field: k, map: columnStatusMap(k) };
        }
        return null;
    }
    function statusLabel(v, map) {
        if (v === '__EMPTY__') return CONFIG.STATUS_EMPTY_LABEL;
        return (map && map[v] != null) ? map[v] : v;
    }
    function statusFilterItem(field, v) {
        if (v === '__EMPTY__') {
            return { logic: 'or', filters: [
                { field: field, operator: 'eq', value: null },
                { field: field, operator: 'eq', value: '' }
            ] };
        }
        return { field: field, operator: 'eq', value: v };
    }
    function distinctValues(data, field) {
        var out = [], seen = {};
        for (var i = 0; i < data.length; i++) {
            var v = data[i][field];
            if (v === null || v === undefined || v === '') continue;
            v = String(v);
            if (!seen[v]) { seen[v] = 1; out.push(v); }
        }
        return out;
    }
    function chipSig(vals) { return vals.slice().sort().join('|'); }
    function pruneSelection(sel, vals) {
        var out = [];
        for (var i = 0; i < sel.length; i++) if (vals.indexOf(sel[i]) !== -1) out.push(sel[i]);
        return out;
    }

    function ensureChips() {
        if (!CONFIG.STATUS_CHIPS || _chip.skip) return;
        var data;
        try { data = CTX.grid.dataSource.data(); } catch (e) { return; }
        if (!data.length) return;
        if (!CTX.statusField) {
            var ds = detectStatus(data);
            if (ds) { CTX.statusField = ds.field; CTX.statusMap = ds.map; }
        }
        if (!CTX.statusField) { _chip.skip = true; return; }

        var vals = distinctValues(data, CTX.statusField);
        for (var di = 0; di < data.length; di++) {
            var dv = data[di][CTX.statusField];
            if (dv === null || dv === undefined || dv === '') { vals = vals.concat('__EMPTY__'); break; }
        }
        var sig = chipSig(vals);
        if (_chip.mounted && sig === _chip.sig) return;

        var before = F.statusVals.length;
        F.statusVals = pruneSelection(F.statusVals, vals);
        F.statusActive = F.statusVals.length > 0;

        if (!_chip.mounted) {
            _chip.$box = $('<span class="tm-chips"></span>');
            var $sc = findStatusCell();
            if ($sc && $sc.length) { _chip.$box.css('margin-left', '10px'); $sc.append(_chip.$box); }
            else mountNativeRow('진행상태 필터', _chip.$box);
            _chip.$box.on('click', '.tm-btn', function () {
                var v = $(this).attr('data-v');
                var $all = _chip.$box.find('.tm-btn[data-v="__ALL__"]');
                if (v === '__ALL__') { _chip.$box.find('.tm-btn').removeClass('tm-on'); $all.addClass('tm-on'); }
                else { $all.removeClass('tm-on'); $(this).toggleClass('tm-on'); if (!_chip.$box.find('.tm-btn.tm-on').length) $all.addClass('tm-on'); }
                F.statusVals = [];
                _chip.$box.find('.tm-btn.tm-on').each(function () { var x = $(this).attr('data-v'); if (x !== '__ALL__') F.statusVals.push(x); });
                F.statusActive = F.statusVals.length > 0;
                applyFilters();
            });
            _chip.mounted = true;
        }
        renderChips(vals);
        _chip.sig = sig;
        if (before !== F.statusVals.length) applyFilters();
    }
    function renderChips(vals) {
        var $box = _chip.$box; if (!$box) return;
        $box.empty();
        var $all = btn('전체').attr('data-v', '__ALL__');
        if (!F.statusActive) $all.addClass('tm-on');
        $box.append($all);
        vals.forEach(function (v) {
            var $c = btn(statusLabel(v, CTX.statusMap)).attr('data-v', v);
            if (F.statusVals.indexOf(v) !== -1) $c.addClass('tm-on');
            $box.append($c);
        });
    }

    /* ============================================================
     *  필터 · 건수 · 그리드 훅
     * ============================================================ */
    function buildFilter() {
        if (anyActive() && CTX.statusField) {
            return { logic: 'and', filters: [
                { logic: 'or', filters: F.statusVals.map(function (v) { return statusFilterItem(CTX.statusField, v); }) }
            ] };
        }
        return {};
    }
    function applyFilters() {
        if (!CTX.grid) return;
        try { CTX.grid.dataSource.filter(buildFilter()); } catch (e) { err('applyFilters', e); }
    }
    function updateCount() {
        try {
            if (!CTX.countEl) return;
            var ds = CTX.grid.dataSource;
            var filtered = ds.total(), loaded = ds.data().length;
            if (anyActive()) CTX.countEl.html('<b style="color:' + CTX.primary + '">' + filtered + '</b> <span style="font-size:11px;color:#999">/ ' + loaded + '건 중</span>');
            else CTX.countEl.text(filtered);
        } catch (e) {}
    }

    function hookGrid() {
        CTX.grid.bind('dataBound', function () {
            step('ensureChips', ensureChips);
            updateCount();
            setTimeout(unlockKw, 0);

            if (SS.active && SS.pending) {
                SS.pending = false;
                if (SS.timer) { clearTimeout(SS.timer); SS.timer = null; }
                var n = loadedCount();
                SS.log.push((SS.cur ? SS.cur.label : '?') + '(' + SS.kw + ') ' + n + '건');
                if (n > 0) {
                    SS.active = false;
                    setHint('자동 판별: ' + (SS.cur ? SS.cur.label : '') + ' = ' + SS.kw + ' · ' + n + '건'
                            + (SS.log.length > 1 ? ' · 시도: ' + SS.log.join(' → ') : ''), true);
                    if (CONFIG.REFOCUS_AFTER_SEARCH) setTimeout(function () { focusKw(true); }, 0);
                } else if (SS.stopOnMiss && !SS.queue.length) {
                    // ③ 번호류 0건 → 다른 기준으로 헛돌지 않고 중단
                    SS.active = false;
                    log('번호 기준 0건 — 조기 중단', SS.log);
                    setHint(missHint());
                    if (CONFIG.REFOCUS_AFTER_SEARCH) setTimeout(function () { focusKw(true); }, 0);
                } else {
                    setTimeout(nextAttempt, 0);
                }
                return;
            }

            if (!anyActive() || _reapplying) return;
            try {
                var cur = CTX.grid.dataSource.filter();
                if (!cur || !cur.filters || !cur.filters.length) {
                    _reapplying = true; CTX.grid.dataSource.filter(buildFilter()); _reapplying = false;
                }
            } catch (e) { err('reapply', e); _reapplying = false; }
        });
        step('ensureChips', ensureChips);
        updateCount();
    }

})();