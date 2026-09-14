// ==UserScript==
// @name         [특허] 팔레트 (Ctrl+Space)
// @namespace    kriss-ipms-enhancement
// @version      1.3.4
// @description  지식재산권 팔레트(포털 메인 포함). v1.3.4(긴급): v1.3.2~1.3.3이 로드 즉시 실패하던 결함 수정(주석 안의 와일드카드 패턴이 블록 주석을 조기 종료). v1.3.3: 닫은 뒤에도 투명 오버레이가 화면을 덮어 페이지의 모든 클릭이 막히던 결함 수정. v1.3.2: 포털 루트 URL 매칭 누락 수정(대시보드와 공존), jQuery 부재 시에도 기동, z-index 상향, 입력 중 Shift 2연타 억제. 마스터(정본)를 항상 최상단에 배치하고, 조회 범위를 '마스터만 / 전 탭'으로 전환(Ctrl+M · 하단 배지). 관리번호뿐 아니라 발명명칭·발명자·출원/등록번호도 마스터 서버 검색으로 즉시 조회. Ctrl+Space(또는 Ctrl+Shift+Space / Shift 두 번)로 오버레이를 열고 검색어를 입력하면 5개 탭 인덱스 + 관리번호 서버 단건을 즉시 검색. Enter=상세 팝업 직접 오픈, Shift+Enter=해당 탭에서 찾기. 화면에 아무 행도 주입하지 않음(목록개선과 충돌 없음). 애플 글래스 + 오렌지 무지개 림, Listary형 키보드 우선 UI, 결과 목록 독립 스크롤.
// @match        *://krisstar.kriss.re.kr/*
// @match        *://*/pms/*S_PMS_0301*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * ── 변경 이력 ────────────────────────────────────────────────────
 *  v1.3.4 (patch, 1.3.3 → 1.3.4) — ★ 로드 즉시 실패(팔레트 미표시) 원인 수정
 *    [증상] v1.3.2·v1.3.3 에서 단축키를 눌러도 아무 반응 없음(오버레이 미생성).
 *    [원인] v1.3.2 변경이력 주석에 @match 와일드카드 패턴을 원문 그대로 기재.
 *      그 문자열에 포함된 '별표+슬래시' 조합이 블록 주석을 조기 종료시켜, 이후 텍스트가
 *      코드로 해석됨 → 로드 시 ReferenceError 로 스크립트 전체가 실행되지 않았다.
 *      ⚠ node --check 는 통과한다(끊긴 뒤 다시 주석이 열려 문법상 유효). 정적 문법
 *      검사만으로는 잡히지 않는 결함이며, jsdom 실행 검증에서 확인됨.
 *    [수정] 해당 주석 문장에서 패턴 원문 제거. 이후 주석에는 와일드카드 패턴을 쓰지 않는다.
 *    [검증] jsdom 로드 → Ctrl+Space → Esc 순서로 오버레이 생성·표시·숨김을 실측 확인.
 *
 *  v1.3.3 (patch, 1.3.2 → 1.3.3) — ★ 오버레이 클릭 차단 결함 수정(전 화면 영향)
 *    [증상] 팔레트를 한 번 열었다 닫으면 그 화면의 모든 버튼·링크가 반응하지 않음.
 *      (포털에서 특히 뚜렷 — 위젯 버튼 전부 무반응)
 *    [원인] 닫기(close)가 .on 클래스만 제거해 opacity:0 으로만 만들고 요소를 숨기지
 *      않았음. .pal-back 은 position:fixed·inset:0 전체 화면 요소이므로 투명한 상태로
 *      화면을 계속 덮으면서 모든 포인터 이벤트를 흡수. 배경 mousedown 핸들러는
 *      UI.open=false 라 조기 반환 → 클릭이 아무 동작 없이 사라짐.
 *      (close 안의 `UI.back.style.display = ''` 은 flex 로 되돌리는 무효 코드였음)
 *    [수정]
 *      ① CSS: 기본 display:none · pointer-events:none, 열릴 때만(inline display:flex +
 *         .on) 표시·수신. 전환 애니메이션은 requestAnimationFrame 으로 유지.
 *      ② close(): .on 제거 후 150ms 뒤 display:none 확정(열림 상태면 취소).
 *      ③ Esc 는 열려 있지 않아도 잔류 오버레이를 강제로 숨김(자기 치유).
 *      ④ 기동 시 이전 버전이 남긴 .pal-back 요소를 제거(구버전 잔류 오버레이 정리).
 *      ⑤ 이중 안전장치: 오버레이가 표시 상태인데 UI.open=false 면 3초 주기 점검에서 숨김.
 *
 *  v1.3.2 (patch, 1.3.1 → 1.3.2) — 포털 대시보드와 공존 · 매칭/기동 조건 완화
 *    [원인] 포털에서 팔레트가 반응하지 않는 현상. 코드 대조 결과 대시보드
 *      ([KRISS Portal] 업무 대시보드 v1.20.2)와의 기능 충돌은 없음 —
 *      대시보드는 [data-pd] 요소만 정리하고 키는 Alt+Shift+X/E · Esc · '/' 만 사용.
 *      실제 원인은 URL 매칭: 대시보드는 https://krisstar.kriss.re.kr/ (루트)까지
 *      매칭하는데 v1.3.1은 /index.do 만 매칭 → 루트 주소로 포털을 열면 미주입.
 *    ① @match 를 호스트 전역(*://krisstar.kriss.re.kr/*)으로 교체하고, 타 호스트용은
 *       모든 호스트의 S_PMS_0301 계열 화면을 한 줄 와일드카드로 축약(@match 참조).
 *       ※ 주석에는 와일드카드 패턴을 원문 그대로 쓰지 않는다 — 별표+슬래시 조합이
 *          블록 주석을 조기 종료시켜 스크립트 전체가 로드 실패한다(v1.3.4 원인).
 *    ② jQuery 부재 시 미기동 → 조건부 기동으로 완화. jQuery 가 필요한 경로
 *       ($.popupWindow · 네이티브 검색폼 조작)만 건너뛰고, 검색·표시·form POST
 *       팝업은 정상 동작. 토스트도 순수 DOM 으로 교체.
 *    ③ z-index 상향: 오버레이 2147483400 · 토스트 2147483401.
 *       대시보드 모달(#pd-hm·#pd-ps = 2147483200)보다 위에 표시되도록 함.
 *    ④ 입력 중 Shift 2연타 억제: 대시보드 검색창 등에서 대문자 입력 시 Shift 가
 *       연속 눌리면 팔레트가 열리던 오작동 방지(입력 요소 포커스 시 비활성).
 *    ⑤ 기동 시 대시보드 존재(#pd-panel)를 감지해 콘솔에 공존 로그 출력(진단용).
 *
 *  v1.3.1 (patch, 1.3.0 → 1.3.1) — 포털 메인(index.do) 지원
 *    근거: 마스터 v2.0 §13(포털 메인 구조 실측). 포털은 IPMS와 동일 오리진이므로
 *          목록 API·팝업(§7)·통합허브(§12)를 그대로 호출할 수 있음.
 *    ① @match 에 포털 메인(krisstar.kriss.re.kr/index.do, /pms/index.do) 추가.
 *    ② 성능 영향 최소화 — 로드 시점에는 keydown 리스너 1개만 등록하고 오버레이 DOM·
 *       스타일·데이터 조회는 첫 호출(Ctrl+Space) 때 생성한다(지연 마운트, v1.2.0부터).
 *       포털 위젯(myWorkList·fn_busBdg 등 §13)과 경합하지 않으며, 포털의
 *       #con_left .timecard / #con_center 위젯 DOM 은 건드리지 않는다(삽입 없음).
 *    ③ 목록 화면이 아닌 페이지(포털 등)에서는 조회 범위 기본값을 'master' 로 한다.
 *       단계 탭 5개 인덱싱(목록 API 5회)은 포털에서 실익이 낮고 초기 응답을 늦추므로,
 *       마스터 서버 조회 1~2회만 사용. 사용자가 Ctrl+M 으로 한 번이라도 범위를
 *       바꾸면 그 선택을 저장하고 이후에는 저장값을 우선한다(scopeSetByUser).
 *    ④ 목록 화면이 아닌 곳에서 Shift+Enter(찾기)는 해당 탭으로 이동 후 자동 조회
 *       (sessionStorage intent + 네이티브 검색기준) — 포털에서 곧바로 탭 이동 가능.
 *    ⑤ jQuery 미탑재 페이지에서는 종전대로 미기동(경고 후 return).
 *
 *  v1.3.0 (minor revision, 1.2.0 → 1.3.0) — 마스터 우선 + 조회 범위 설정
 *    근거: 마스터 v2.0 §6.7(마스터 = 특허 신원의 정본·검색 단일 창구),
 *          §8.3(마스터 item 옵션 11종 실측), 마스터 화면 실측(grid2 = cls:'small').
 *    ① [마스터 최상단] 결과 렌더 순서를 마스터 → (전 탭 모드일 때) 5개 탭 → 청구서로 고정.
 *       마스터는 출원·등록·기술이전·과제·비용까지 합쳐진 정본이므로 첫 후보로 노출.
 *    ② [마스터 전방위 서버 검색] 종전에는 관리번호 패턴일 때만 마스터를 조회했으나,
 *       입력 유형을 판별해 마스터 검색기준을 자동 선택하고 최대 2건을 병렬 조회 후 병합:
 *         관리번호/코드 → intellMngNo · RESI… → intellRqstNo
 *         숫자·하이픈 → aplyNo + intellRegNo · 한글 4자 이하 → mainIvenEmpNm + ivenEmpNm
 *         그 외 텍스트 → ivenNm
 *       응답은 cls:'small'(마스터 화면 grid2 실측)로 요청해 65필드 대신 경량 필드만 받음.
 *    ③ [조회 범위 설정] CFG.scope = 'all'(기본) | 'master'.
 *       하단 배지 클릭 또는 Ctrl+M 으로 전환하며 localStorage(tm.palette.cfg)에 저장.
 *       'master' 모드에서는 5개 탭 인덱스 로드와 청구서 조회를 하지 않음(요청·메모리 절약).
 *       탭 단위 미세 조정은 CFG.tabs 배열로 가능(기본 5개 전부).
 *    ④ 마스터 응답 상한: CFG.masterMax(표시) · masterHardCap(매핑) 으로 대량 응답 방어.
 *
 *  v1.2.0 ([특허] 통합검색 1.1.0 → 팔레트 1.2.0) — 인라인 행 폐기, 오버레이 전환
 *    근거: 시스템 구조 마스터 v2.0 §3(온디맨드)·§4(식별자)·§7(팝업 계약)·
 *          §8(검색 파라미터)·§9(상태코드)·§12(통합허브),
 *          2026-07-30 실측(8개 화면 DOM 덤프 + 등록관리 관리번호 부분일치 확인).
 *
 *    [UI] ① 검색폼에 행을 주입하던 방식 폐기 → 단축키 오버레이 전용.
 *            목록개선(v1.6.x)과 자리·키·디자인 충돌이 구조적으로 소멸.
 *         ② 결과 목록을 독립 스크롤 컨테이너로 분리(max-height + overflow-y).
 *            v1.1.0은 패널이 overflow:hidden + 높이 무제한이라 항목이 화면 밖으로
 *            넘치면 ↓ 이동·스크롤이 불가했음 → 이번 버전에서 해결.
 *            ↑↓(순환) · PageUp/PageDown(±8) · Home/End · 마우스 휠 · 호버 선택 지원.
 *         ③ 애플 글래스(blur+saturate) + 오렌지 무지개 conic 림(별도 래퍼 요소로
 *            구현 — backdrop-filter 위의 z-index:-1 의사요소는 렌더 누락 사례가 있음).
 *            선택행은 오렌지 톤, 모션은 20s 저속(prefers-reduced-motion 존중).
 *    [키] Ctrl+Space(기본) · Ctrl+Shift+Space · Shift 2연타(300ms) — CFG.hotkey 로 개별 해제.
 *         Esc 닫기, Enter 상세 팝업, Shift+Enter 해당 탭에서 찾기, Ctrl+C 관리번호 복사.
 *    [엔진] v1.1.0의 레지스트리·인덱스·캐시·팝업 라우팅 유지. 변경점:
 *         ④ 킬 스위치 키를 tm.usearch.off → tm.palette.off 로 분리.
 *            (목록개선 v1.6.4+ 가 구 키를 1로 설정해 두므로 그대로 두면 미기동)
 *         ⑤ 관리번호 부분일치 실측 확인(2026-07-30, 등록관리 'P240139' 조회 성공)
 *            → 서버 단건 조회 대상을 완전형(P260083KR)에서 본체형(P260083)까지 확대.
 *         ⑥ 등록관리 주발명자 필드: 그리드 컬럼 실측이 mainIvenNm 이므로 1순위로 교정
 *            (v1.1.0 은 mainIvenEmpNm 추정). reptUserNm(접수담당자)은 폴백 유지.
 *         ⑦ '찾기'(Shift+Enter) 를 그리드 클라이언트 필터에서 네이티브 검색기준
 *            서버 조회로 교체 — 전 탭이 item/keyword 또는 searchItem/searchKeyword
 *            2계열(§8.1)로 확인되어 라벨 매칭으로 일반화 가능.
 *    [보존] 등록관리 statusMap 은 v1.1.0 값 유지. 화면 드롭다운(01 결정보고제출…10 완료)과
 *         그리드 셀 실측(04 검토중 / 06 사무소확인대기 / 07·12 완료)이 상충하는데(§15-1),
 *         사용자가 목록에서 보는 값은 그리드 쪽이므로 그리드 기준을 따른다.
 *    [미확인] (a) $.popupWindow 존재 — §7.1상 네이티브 경로이나 부재 시 form POST 폴백.
 *         (b) 명칭·발명자 서버 부분일치(§15-4) — 팔레트는 로컬 인덱스 매칭이라 무관.
 *         (c) 마스터·청구서 단건 응답 지연 — timing 로그로 관측 후 조정.
 * ──────────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    var VER = '1.3.4', NS = 'tm.palette', TAG = '[TM-Palette]';

    try { if (localStorage.getItem(NS + '.off') === '1') { console.warn(TAG, '킬 스위치 활성 — 미기동'); return; } } catch (e) {}
    // v1.3.2 ②: jQuery 는 선택 의존. 없으면 팝업은 form POST, '찾기'는 비활성으로 동작.
    var $ = window.jQuery || null;

    function log()  { console.log.apply(console, [TAG].concat([].slice.call(arguments))); }
    function warn() { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); }
    function err(n, e) { console.error(TAG, n + ' 실패:', e); }

    var CFG = {
        ttlMin: 30, perGroup: 6, debounceMs: 120,
        heavyTimeoutMs: 8000, lightTimeoutMs: 20000, jumpTtlSec: 60,
        masterItem: 'intellMngNo', expItem: 'intellMngNo',
        scope: 'all',                 // 'all' = 마스터 + 5개 탭 + 청구서 / 'master' = 마스터만
        scopeSetByUser: false,        // Ctrl+M 으로 사용자가 직접 바꿨는지(저장값 우선 판단)
        tabs: ['apply', 'pps', 'aply', 'reg', 'task'],   // 전 탭 모드에서 조회할 단계 탭
        masterCls: 'small',           // 마스터 응답 형태(실측: small=경량, detail=65필드)
        masterMax: 8, masterHardCap: 200,
        serverDebounceMs: 300,
        hotkey: { ctrlSpace: true, ctrlShiftSpace: true, doubleShift: true, doubleShiftMs: 300 },
        animateRim: true
    };
    try { var c = JSON.parse(localStorage.getItem(NS + '.cfg') || '{}'); for (var ck in c) CFG[ck] = c[ck]; } catch (e) {}
    function saveCfg() {
        try {
            var keep = JSON.parse(localStorage.getItem(NS + '.cfg') || '{}');
            keep.scope = CFG.scope; keep.scopeSetByUser = true;
            localStorage.setItem(NS + '.cfg', JSON.stringify(keep));
        } catch (e) { warn('설정 저장 실패:', e && e.name); }
    }

    /* ── 순수 유틸 ─────────────────────────────────────────────── */
    var KEY_FULL = /^p\d{6}[a-z]{2,4}$/i;      // 관리번호 완전형 (§4)
    var KEY_BASE = /^p\d{6}$/i;                // 관리번호 본체 (부분일치 실측)
    function isKey(s) { return KEY_FULL.test(s) || KEY_BASE.test(s); }
    function norm(s) { return String(s == null ? '' : s).toLowerCase(); }
    function toksOf(q) { return norm(q).split(/\s+/).filter(function (t) { return t.length > 0; }); }
    function fmtD(v) {
        if (v == null || v === '') return '';
        if (typeof v === 'number' && v > 1e12) { var dt = new Date(v); return isNaN(dt) ? '' : dt.toISOString().slice(0, 10); }
        var s = String(v);
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
        return '';
    }
    function fmtAgo(at) {
        var sec = Math.max(0, Math.floor((Date.now() - at) / 1000));
        if (sec < 60) return '방금';
        var min = Math.floor(sec / 60);
        if (min < 60) return min + '분 전';
        return Math.floor(min / 60) + '시간 전';
    }
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
    function stat(map, code) {
        if (code == null || code === '') return '';
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

    /* ── 레지스트리 (§6·§8·§9 실측) ────────────────────────────── */
    var TODAY = new Date(), P2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var TODAY_YMD = String(TODAY.getFullYear()) + P2(TODAY.getMonth() + 1) + P2(TODAY.getDate());

    var REG = {
        apply: { label: '신청', glyph: '신', screenDo: '/pms/res/intellppty/S_PMS_03010100.do',
            api: '/pms/res/intellppty/selectIntellpptyList.json', body: function () { return {}; },
            statusMap: { '00': '임시저장', '01': '신청', '02': '내부결재', '03': '내부결재', '04': '완료' },
            map: function (r) { return recOf('apply', r.intellMngNo || r.intellRqstNo, r.intellRqstNo, r.ivenNm,
                pickJoin(r, ['mainIvenEmpNm', 'rqstEmpNm']), stat(this.statusMap, r.apvStat), r.rqstDt, r.intellRqstNo, ''); } },

        pps: { label: '선행조사', glyph: '선', screenDo: '/pms/iprs/pps/S_PMS_03011020.do',
            api: '/pms/iprs/pps/selectPpsList.json', body: function () { return {}; },
            statusMap: { '00': '임시저장', '01': '신청', '02': '접수', '03': '처리중', '04': '완료' },
            map: function (r) { return recOf('pps', r.intellMngNo || r.rqstNo, r.rqstNo, r.rqstSbjt || r.ivenNm,
                pickJoin(r, ['mainIvenEmpNm', 'busiRegNm']), stat(this.statusMap, r.apvStat), r.rqstDt, r.intellRqstNo, r.rqstNo); } },

        aply: { label: '출원', glyph: '출', screenDo: '/pms/iprs/aply/S_PMS_03012010.do',
            api: '/pms/iprs/aply/selectAplyRqstList.json', body: function () { return {}; },
            statusMap: { '10': '출원지시전', '00': '임시저장', '01': '출원지시', '02': '접수', '03': '처리중',
                         '04': '제출', '05': '출원검토', '06': '출원검토', '07': '출원검토', '08': '출원검토', '09': '완료' },
            map: function (r) { return recOf('aply', r.intellMngNo, r.aplyNo || r.rqstNo, r.ivenNm,
                pickJoin(r, ['mainIvenEmpNm', 'plfNm']), stat(this.statusMap, r.apvStat), r.rqstDt, r.intellRqstNo, r.rqstNo); } },

        reg: { label: '등록', glyph: '등', screenDo: '/pms/iprs/reg/S_PMS_03013010.do',
            api: '/pms/iprs/intellReg/selectIntellRegRqstList.json',   // 화면 URL(reg)과 API 경로(intellReg) 상이 — 실측
            body: function () { return {}; },
            // 그리드 셀 실측 기준(화면 드롭다운과 상충: §15-1). 사용자가 목록에서 보는 값을 따름.
            statusMap: { '00': '사무소신청중', '01': '접수대기중', '02': '접수', '03': '임시저장', '04': '검토중',
                         '05': '검토중', '06': '사무소확인대기', '07': '완료', '08': '완료', '09': '완료',
                         '10': '완료', '11': '완료', '12': '완료' },
            // v1.2.0 ⑥: 등록관리 그리드 컬럼 field 실측 = mainIvenNm
            map: function (r) { return recOf('reg', r.intellMngNo, r.intellRegNo || r.intellAplyNo, r.korRegNm,
                pickJoin(r, ['mainIvenNm', 'mainIvenEmpNm', 'reptUserNm']), stat(this.statusMap, r.apvStat),
                r.rqstDt, r.intellRqstNo, r.rqstNo); } },

        task: { label: '업무요청', glyph: '업', screenDo: '/pms/iprs/etcTask/S_PMS_03014010.do',
            api: '/pms/iprs/etcTask/selectEtcTaskRqstList.json', body: function () { return {}; },
            statusMap: null,                                   // apvStatNm 명칭 필드 직접 사용
            map: function (r) { return recOf('task', r.intellMngNo || r.rqstNo, r.rqstNo, r.rqstSbjt || r.korRegNm,
                pickJoin(r, ['mainIvenEmpNm', 'rqstTpeNm']), String(r.apvStatNm || ''), r.rqstDt, r.intellRqstNo, r.rqstNo); } },

        // heavy: 전건 금지, 관리번호 단건만 (§3 온디맨드)
        master: { label: '마스터', glyph: '마', heavy: true, screenDo: '/pms/iprs/mng/S_PMS_03019010.do',
            api: '/pms/iprs/mng/selectIntellAplyList.json',
            // v1.3.0 ②: 검색기준·검색어를 지정해 서버가 그 건만 반환(§8.3 옵션 실측)
            queryBody: function (item, kw) { return { isAuthorized: 'Y', searchDtCls: '03', searchStrDt: '20000101',
                searchEndDt: TODAY_YMD, item: item, keyword: kw, cls: CFG.masterCls }; },
            singleBody: function (key) { return this.queryBody(CFG.masterItem, key); },
            map: function (r, key) { return recOf('master', r.intellMngNo || key, r.intellAplyNo || r.intellRegNo, r.ivenNm || '마스터 건',
                pickJoin(r, ['mainIvenEmpNm', 'plfNm']), String(r.masterApvNm || r.detailApvNm || ''),
                r.intellRegDt || r.intellAplyDt || r.rqstDt, r.intellRqstNo, ''); } },

        exp: { label: '청구서', glyph: '청', heavy: true, screenDo: '/pms/iprs/exp/S_PMS_03015020.do',
            api: '/pms/iprs/exp/selectExpRqstList.json',
            statusMap: { '00': '신청중', '01': '접수대기', '02': '접수', '03': '임시저장', '04': '검토실행',
                         '05': '임시저장', '06': '검토중', '07': '검토중', '08': '과제책임자',
                         '09': '계산서발행대기', '10': '발의대기', '11': '완료' },
            taxbilMap: { 'Y': '발행완료', 'W': '발행대기', 'N': '해당없음' },
            singleBody: function (key) { return { rqstStrDt: '20000101', rqstEndDt: TODAY_YMD,
                searchItem: CFG.expItem, searchKeyword: key }; },
            map: function (r, key) {
                var sub = [];
                if (r.cnfUserNm) sub.push(String(r.cnfUserNm));
                if (r.taxbilIsuCls === 'W' || r.taxbilIsuCls === 'Y') sub.push('계산서 ' + stat(this.taxbilMap, r.taxbilIsuCls));
                return recOf('exp', r.intellMngNo || key, r.rqstNo,
                    (r.budgNm ? String(r.budgNm) + ' · ' : '') + '청구 ' + (r.totlExp != null ? Number(r.totlExp).toLocaleString() : ''),
                    sub.join(' · '), stat(this.statusMap, r.apvStat), r.rqstDt, r.intellRqstNo, r.rqstNo); } }
    };
    var ALL_LIGHT = ['apply', 'pps', 'aply', 'reg', 'task'];
    function lightTabs() {
        if (CFG.scope === 'master') return [];
        var out = [];
        (CFG.tabs || ALL_LIGHT).forEach(function (t) { if (ALL_LIGHT.indexOf(t) !== -1) out.push(t); });
        return out;
    }

    function recOf(t, k, k2, ti, sub, st, d, rq, rn) {
        if (!k && !ti) return null;
        var rec = { t: t, k: String(k || ''), k2: String(k2 || ''), ti: String(ti || '').slice(0, 110),
                    st: String(st || ''), s: sub || '', d: fmtD(d), rq: String(rq || ''), rn: String(rn || '') };
        rec._k = norm(rec.k); rec._ti = norm(rec.ti); rec._s = norm(rec.k2 + ' ' + rec.s + ' ' + rec.st);
        return rec;
    }

    var CUR = (function () {
        var p = location.pathname;
        for (var t in REG) {
            if (!REG[t].screenDo) continue;
            var scr = REG[t].screenDo.split('/').pop().replace('.do', '');
            if (p.indexOf(scr) !== -1) return t;
        }
        return '';
    })();

    // v1.3.1 ③: 목록 화면이 아니면(포털 등) 기본 범위를 마스터로. 사용자 저장값이 있으면 그것을 우선.
    var IS_LIST = !!CUR;
    if (!IS_LIST && !CFG.scopeSetByUser) CFG.scope = 'master';

    /* ── 전송 계층 ─────────────────────────────────────────────── */
    function post(api, body, timeoutMs) {
        var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var to = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;
        var t0 = performance.now();
        return fetch(api, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(body || {}), signal: ctrl ? ctrl.signal : undefined
        }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
        }).then(function (txt) {
            var j = JSON.parse(txt);
            if (j && j.errorCode && String(j.errorCode) !== '0' && String(j.errorCode) !== '200') throw new Error('errorCode=' + j.errorCode);
            if (!j || !Array.isArray(j.data)) throw new Error('응답 형식 예상 밖');
            return { data: j.data, total: j.total, ms: Math.round(performance.now() - t0), bytes: txt.length };
        }).finally(function () { if (to) clearTimeout(to); });
    }

    /* ── 인덱스 · 캐시 ─────────────────────────────────────────── */
    var IDX = { rows: {}, at: {}, state: {}, started: false, warned: false };

    function cacheKey(t) { return NS + '.idx.' + t; }
    function readCache(t) {
        try {
            var raw = localStorage.getItem(cacheKey(t)); if (!raw) return null;
            var o = JSON.parse(raw);
            if (!o || !o.at || !Array.isArray(o.rows)) return null;
            if (Date.now() - o.at > CFG.ttlMin * 60 * 1000) return null;
            for (var i = 0; i < o.rows.length; i++) {
                var r = o.rows[i];
                r._k = norm(r.k); r._ti = norm(r.ti); r._s = norm((r.k2 || '') + ' ' + (r.s || '') + ' ' + (r.st || ''));
            }
            return o;
        } catch (e) { return null; }
    }
    function writeCache(t) {
        try {
            var slim = IDX.rows[t].map(function (r) {
                return { t: r.t, k: r.k, k2: r.k2, ti: r.ti, st: r.st, s: r.s, d: r.d, rq: r.rq, rn: r.rn };
            });
            localStorage.setItem(cacheKey(t), JSON.stringify({ at: IDX.at[t], rows: slim }));
        } catch (e) {
            if (!IDX.warned) { warn('캐시 저장 실패 — 메모리 전용:', e && e.name); IDX.warned = true; }
        }
    }
    function loadTab(t, force) {
        var P = REG[t];
        if (!force) {
            var c = readCache(t);
            if (c) { IDX.rows[t] = c.rows; IDX.at[t] = c.at; IDX.state[t] = 'ok'; render(); return; }
        }
        IDX.state[t] = 'wait'; render();
        post(P.api, P.body(), CFG.lightTimeoutMs).then(function (res) {
            var rows = [];
            for (var i = 0; i < res.data.length; i++) { var rec = P.map(res.data[i]); if (rec) rows.push(rec); }
            IDX.rows[t] = rows; IDX.at[t] = Date.now(); IDX.state[t] = 'ok';
            log('timing', P.label, { n: rows.length, kb: Math.round(res.bytes / 1024), ms: res.ms });
            writeCache(t); render();
        }).catch(function (e) {
            IDX.state[t] = 'fail'; warn(P.label, '조회 실패:', e && e.message); render();
        });
    }
    function startAll() {
        if (CFG.scope === 'master') return;
        if (IDX.started) return;
        IDX.started = true;
        var L = lightTabs();
        var order = [CUR].concat(L.filter(function (t) { return t !== CUR; }));
        order.forEach(function (t) { if (L.indexOf(t) !== -1) loadTab(t, false); });
    }

    /* ── 마스터 서버 검색 (v1.3.0 ②) ───────────────────────────── */
    var MQ = { q: '', state: 'idle', rows: [], fail: false, ms: 0 };
    var EQ = { q: '', state: 'idle', rows: [], fail: false };

    var RE_NUM  = /^[0-9][0-9\-\/\.\s]*$/;
    var RE_CODE = /^[a-z]{1,4}\d/i;

    // 입력 유형 → 마스터 검색기준(최대 2개 병렬)
    function masterPlan(q) {
        var s = q.trim(), up = s.toUpperCase(), out = [];
        if (isKey(s))                    out.push(['intellMngNo', up]);
        else if (/^resi/i.test(s))       out.push(['intellRqstNo', up]);
        else if (RE_NUM.test(s))       { out.push(['aplyNo', s]); out.push(['intellRegNo', s]); }
        else if (RE_CODE.test(s))        out.push(['intellMngNo', up]);
        else if (/[가-힣]/.test(s)) {
            if (s.replace(/\s+/g, '').length <= 4) { out.push(['mainIvenEmpNm', s]); out.push(['ivenEmpNm', s]); }
            else out.push(['ivenNm', s]);
        } else                           out.push(['ivenNm', s]);
        return out.slice(0, 2);
    }

    function masterQuery(q) {
        if (MQ.q === q && MQ.state !== 'idle') return;
        MQ = { q: q, state: 'loading', rows: [], fail: false, ms: 0 };
        render();
        var plan = masterPlan(q), left = plan.length, seen = {}, acc = [], t0 = performance.now();
        plan.forEach(function (pair) {
            post(REG.master.api, REG.master.queryBody(pair[0], pair[1]), CFG.heavyTimeoutMs).then(function (res) {
                var lim = Math.min(res.data.length, CFG.masterHardCap);
                for (var i = 0; i < lim; i++) {
                    var r = res.data[i], id = String(r.intellRqstNo || r.intellMngNo || (pair[0] + i));
                    if (seen[id]) continue;
                    seen[id] = 1;
                    var rec = REG.master.map(r, pair[1]);
                    if (rec) acc.push(rec);
                }
                log('timing 마스터', { item: pair[0], kw: pair[1], n: res.data.length, ms: res.ms });
            }).catch(function (e) {
                MQ.fail = true; warn('마스터 조회 실패(' + pair[0] + '):', e && e.message);
            }).finally(function () {
                if (--left === 0) { MQ.rows = acc; MQ.state = 'ok'; MQ.ms = Math.round(performance.now() - t0); render(); }
            });
        });
    }

    // 청구서: 관리번호 단건 (전 탭 모드에서만)
    function expQuery(key) {
        if (CFG.scope === 'master') return;
        if (EQ.q === key && EQ.state !== 'idle') return;
        EQ = { q: key, state: 'loading', rows: [], fail: false };
        render();
        var P = REG.exp;
        post(P.api, P.singleBody(key), CFG.heavyTimeoutMs).then(function (res) {
            var rows = [], up = key.toUpperCase();
            for (var i = 0; i < res.data.length && rows.length < 8; i++) {
                var r = res.data[i];
                if (String(r.intellMngNo || '').toUpperCase().indexOf(up) !== -1) {
                    var rec = P.map(r, key); if (rec) rows.push(rec);
                }
            }
            EQ.rows = rows; EQ.state = 'ok'; render();
        }).catch(function (e) {
            EQ.fail = true; EQ.state = 'ok'; warn('청구서 조회 실패:', e && e.message); render();
        });
    }

    /* ── 팝업 엔진 (§7 실측 계약) ──────────────────────────────── */
    var HUB = '/pms/iprs/mng/popup/S_PMS_03019020.do';
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
            var name = 'tmpal_' + Math.random().toString(36).slice(2, 8);
            var win = window.open('', name, 'width=' + (w || 1200) + ',height=' + (h || 800) + ',resizable=yes,scrollbars=yes');
            if (!win) return false;
            var f = document.createElement('form');
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
    var POPUP = {
        apply:  { via: 'submit', url: '/pms/res/intellppty/B_RES00004_01.do', w: 1280, h: 900,
            params: function (r) { return r.rq ? { bizKey: r.rq, workFlag: 'readOnly', from: 'S_PMS_03010100' } : null; } },
        pps:    { via: 'pw', url: '/pms/iprs/pps/popup/S_PMS_03011010.do', w: 1100, h: 665,
            params: function (r) { return r.rn ? { rqstNo: r.rn } : null; } },
        aply:   { via: 'pw', url: '/pms/iprs/aply/popup/S_PMS_03012020.do',
            params: function (r) { if (!r.rq) return null; var p = { intellRqstNo: r.rq }; if (r.rn) p.rqstNo = r.rn; return p; } },
        reg:    { via: 'pw', url: HUB, w: 1280, h: 900,
            params: function (r) { return r.rq ? { intellRqstNo: r.rq } : null; } },
        task:   { via: 'pw', url: '/pms/iprs/etcTask/popup/S_PMS_03014020.do',
            params: function (r) { return r.rn ? { rqstNo: r.rn } : null; } },
        exp:    { via: 'pw', url: '/pms/iprs/exp/S_PMS_03015030.do?popupAt=popup', w: 1024, h: 768,
            params: function (r) { return r.rn ? { rqstNo: r.rn } : null; } },
        master: { via: 'pw', url: HUB, w: 1280, h: 900,
            params: function (r) { return r.rq ? { intellRqstNo: r.rq } : null; } }
    };
    function openRec(rec) {
        var def = POPUP[rec.t];
        var params = def ? def.params(rec) : null;
        var url = def && def.url, via = def && def.via, w = def && def.w, h = def && def.h;
        if (!params && rec.rq && url !== HUB) { url = HUB; via = 'pw'; w = 1280; h = 900; params = { intellRqstNo: rec.rq }; }
        if (!params) { warn('팝업 파라미터 부재 — 탭에서 찾기로 폴백'); locate(rec); return; }
        var ok = (via === 'submit')
            ? (formPostPopup(url, params, w, h) || callPopupWindow(url, params, w, h))
            : (callPopupWindow(url, params, w, h) || formPostPopup(url, params, w, h));
        if (ok) { log('팝업 오픈:', rec.t, url, params); close(); }
        else toast('팝업이 차단되었습니다. 브라우저 팝업 허용을 확인해 주세요.');
    }

    /* ── 찾기: 해당 탭으로 이동 + 네이티브 검색기준 서버 조회(§8.1) ── */
    function detectSearchForm() {
        if (!$) return null;                     // v1.3.2 ②: jQuery 없으면 네이티브 검색폼 조작 불가
        var $s = $('#searchItem'), $k = $('#searchKeyword');
        if ($s.length && $k.length) return { $sel: $s, $kw: $k };
        $s = $('#item'); $k = $('#keyword');
        if ($s.length && $k.length) return { $sel: $s, $kw: $k };
        return null;
    }
    function optionByLabel($sel, labels) {
        for (var i = 0; i < labels.length; i++) {
            var lab = labels[i], hit = null;
            $sel.find('option').each(function () {
                if (hit) return;
                var v = $(this).attr('value'), t = $.trim($(this).text());
                if (v && t.indexOf(lab) !== -1) hit = v;
            });
            if (hit) return hit;
        }
        return null;
    }
    function locate(rec) {
        var P = REG[rec.t];
        if (!P || !P.screenDo) return;
        if (rec.t === CUR) { localFind(rec); close(); return; }
        try {
            sessionStorage.setItem(NS + '.jump', JSON.stringify({ tab: rec.t, k: rec.k, rq: rec.rq, rn: rec.rn, ts: Date.now() }));
        } catch (e) {}
        location.href = P.screenDo;
    }
    function localFind(rec) {
        var f = detectSearchForm();
        if (!f) { warn('찾기: 검색기준 UI 미발견'); return; }
        var item = null, kw = '';
        if (isKey(rec.k)) { item = optionByLabel(f.$sel, ['관리번호']); kw = rec.k.toUpperCase(); }
        if (!item && rec.rq) { item = optionByLabel(f.$sel, ['신청번호']); kw = rec.rq; }
        if (!item) { warn('찾기: 적합한 검색기준 옵션 없음'); return; }
        try {
            var ddl = f.$sel.data('kendoDropDownList');
            if (ddl) { ddl.value(item); ddl.trigger('change'); } else f.$sel.val(item).trigger('change');
            f.$kw.prop('disabled', false).prop('readonly', false).removeAttr('tabindex').val(kw);
            // 기간을 넓혀 과거 건도 포함
            var dps = $('#searchForm input[data-role="datepicker"]').filter(function () { return $(this).data('kendoDatePicker'); });
            if (dps.length >= 2) {
                var sp = dps.eq(0).data('kendoDatePicker'), ep = dps.eq(1).data('kendoDatePicker');
                if (sp) sp.value(new Date(2000, 0, 1));
                if (ep) ep.value(new Date());
            }
            var $btn = $('#btnSearch');
            if ($btn.length && $btn[0].click) $btn[0].click();
            log('찾기 실행:', { item: item, keyword: kw });
        } catch (e) { err('localFind', e); }
    }
    function handleJumpIntent() {
        if (!$) return;
        var raw = null;
        try { raw = sessionStorage.getItem(NS + '.jump'); } catch (e) {}
        if (!raw) return;
        var it = null; try { it = JSON.parse(raw); } catch (e) {}
        try { sessionStorage.removeItem(NS + '.jump'); } catch (e) {}
        if (!it || Date.now() - it.ts > CFG.jumpTtlSec * 1000 || it.tab !== CUR) return;
        var tries = 0;
        (function step() {
            if (detectSearchForm() && $('#btnSearch').length) { localFind({ k: it.k, rq: it.rq, rn: it.rn }); return; }
            if (++tries < 25) setTimeout(step, 400);
        })();
    }

    /* ── 스타일 (글래스 + 오렌지 무지개 림) ───────────────── */
    function injectStyles() {
        if (document.getElementById('tm-palette-style')) return;   // v1.3.2: 중복 주입 방지
        var css = [
            // v1.3.3 ①: 기본은 완전 비활성(display:none + pointer-events:none). 열릴 때만 수신.
            '.pal-back{position:fixed;inset:0;z-index:2147483400;display:none;justify-content:center;align-items:flex-start;',
            ' padding:11vh 16px 24px;background:rgba(18,20,26,.30);opacity:0;pointer-events:none;transition:opacity .13s ease}',
            '.pal-back.on{opacity:1;pointer-events:auto}',
            '.pal-rim{width:min(780px,94vw);border-radius:20px;padding:1.5px;position:relative;',
            ' background:conic-gradient(from 200deg,#ff9a3d,#ff6f52,#ff53c8,#8b5cff,#33ceff,#4dffc3,#ffd24d,#ff9a3d);',
            ' box-shadow:0 34px 90px -22px rgba(16,20,30,.55),0 2px 10px rgba(255,138,61,.28);',
            ' transform:translateY(-6px) scale(.99);opacity:0;transition:transform .16s cubic-bezier(.2,.9,.3,1),opacity .16s}',
            '.pal-back.on .pal-rim{transform:none;opacity:1}',
            CFG.animateRim ? '@keyframes palrim{to{filter:hue-rotate(360deg)}} .pal-rim{animation:palrim 20s linear infinite}' : '',
            '@media (prefers-reduced-motion:reduce){.pal-rim{animation:none;transition:none}}',
            '.pal{border-radius:18.5px;overflow:hidden;background:linear-gradient(180deg,rgba(255,252,249,.90),rgba(248,249,252,.80));',
            ' backdrop-filter:blur(30px) saturate(1.9);-webkit-backdrop-filter:blur(30px) saturate(1.9);',
            ' box-shadow:0 1px 0 rgba(255,255,255,.85) inset;',
            ' font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","맑은 고딕",sans-serif;color:#1d1d1f}',

            '.pal-in{display:flex;align-items:center;gap:11px;padding:14px 18px;border-bottom:1px solid rgba(0,0,0,.07)}',
            '.pal-in svg{flex:none;opacity:.55}',
            '.pal-in input{flex:1;border:0;outline:0;background:transparent;font-size:19px;line-height:26px;color:#1d1d1f;font-family:inherit}',
            '.pal-in input::placeholder{color:#a0a0a6}',
            '.pal-tag{flex:none;font-size:10.5px;color:#b45309;background:rgba(255,138,61,.16);border-radius:6px;padding:2px 8px;font-weight:600}',

            '.pal-list{max-height:min(56vh,470px);overflow-y:auto;overscroll-behavior:contain;padding:4px 0 6px;scrollbar-width:thin}',
            '.pal-list::-webkit-scrollbar{width:10px}',
            '.pal-list::-webkit-scrollbar-thumb{background:rgba(120,120,128,.35);border-radius:99px;border:3px solid transparent;background-clip:content-box}',
            '.pal-list::-webkit-scrollbar-thumb:hover{background:rgba(120,120,128,.55);background-clip:content-box}',

            '.pal-sec{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:7px;padding:9px 18px 5px;',
            ' font-size:11.5px;font-weight:700;color:#6e6e73;background:linear-gradient(180deg,rgba(252,250,248,.96),rgba(252,250,248,.72));',
            ' backdrop-filter:blur(6px);letter-spacing:.02em}',
            '.pal-cap{font-size:9.5px;font-weight:700;color:#c2410c;background:rgba(255,138,61,.15);border-radius:5px;padding:1px 6px}',
            '.pal-cnt{font-weight:500;color:#aeaeb2}',
            '.pal-fresh{margin-left:auto;font-weight:500;font-size:10.5px;color:#b6b6bb;display:flex;align-items:center;gap:6px}',
            '.pal-rf{cursor:pointer;padding:1px 5px;border-radius:99px}',
            '.pal-rf:hover{background:rgba(120,120,128,.16);color:#1d1d1f}',

            '.pal-row{display:flex;align-items:center;gap:11px;margin:1px 8px;padding:8px 10px;border-radius:11px;cursor:pointer}',
            '.pal-row.on{background:linear-gradient(90deg,rgba(255,138,61,.22),rgba(255,138,61,.07));box-shadow:inset 0 0 0 1px rgba(255,138,61,.42)}',
            '.pal-gl{flex:none;width:27px;height:27px;border-radius:8px;display:flex;align-items:center;justify-content:center;',
            ' font-size:12px;font-weight:700;color:#5b5b60;background:rgba(120,120,128,.15)}',
            '.pal-row.on .pal-gl{background:linear-gradient(160deg,#ff9a3d,#ff6f52);color:#fff;box-shadow:0 2px 6px rgba(255,111,82,.35)}',
            '.pal-key{flex:none;font-family:Consolas,"Courier New",monospace;font-size:12.5px;font-weight:700;color:#1d1d1f}',
            '.pal-ti{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#48484a;font-size:13px}',
            '.pal-meta{flex:none;display:flex;align-items:center;gap:6px;font-size:11.5px;color:#6e6e73;max-width:44%}',
            '.pal-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.pal-dot{width:7px;height:7px;border-radius:99px;flex:none;background:#ff9500}',
            '.pal-dot.g{background:#a5adb8}.pal-dot.b{background:#0a84ff}',
            '.pal-meta em{font-style:normal;color:#b6b6bb;font-size:11px;font-family:Consolas,monospace}',
            '.pal-row mark{background:rgba(255,196,61,.55);color:inherit;border-radius:3px;padding:0 1px}',

            '.pal-more{margin:2px 18px 6px 56px;font-size:11.5px;color:#c2410c;cursor:pointer;width:fit-content;font-weight:600}',
            '.pal-more:hover{text-decoration:underline}',
            '.pal-pend{display:flex;align-items:center;gap:7px;padding:8px 18px;font-size:11.5px;color:#8a8a90;flex-wrap:wrap}',
            '.pal-pc{display:inline-flex;align-items:center;gap:5px;background:rgba(120,120,128,.13);border-radius:99px;padding:2px 10px}',
            '.pal-pc i{width:6px;height:6px;border-radius:99px;background:#ff9a3d;animation:palbl 1s infinite}',
            '@keyframes palbl{50%{opacity:.3}}',
            '.pal-fail{display:flex;align-items:center;gap:9px;margin:5px 10px;padding:8px 12px;border-radius:10px;font-size:12px;color:#c33b32;background:rgba(255,59,48,.09)}',
            '.pal-fail button{margin-left:auto;border:0;background:rgba(255,59,48,.14);color:#c33b32;border-radius:99px;padding:3px 12px;font-size:11.5px;cursor:pointer;font-family:inherit}',
            '.pal-empty{padding:34px 20px;text-align:center;color:#8e8e93;font-size:12.5px}',
            '.pal-empty b{display:block;color:#48484a;font-size:13.5px;margin-bottom:4px}',

            '.pal-foot{display:flex;align-items:center;gap:15px;padding:8px 18px;font-size:11px;color:#8a8a90;',
            ' background:linear-gradient(180deg,rgba(120,120,128,.06),rgba(255,138,61,.06));border-top:1px solid rgba(0,0,0,.06)}',
            '.pal-kbd{font-family:Consolas,monospace;font-size:10.5px;background:rgba(255,255,255,.85);border:1px solid rgba(0,0,0,.13);',
            ' border-radius:5px;padding:0 5px;color:#515154;margin-right:4px;box-shadow:0 1px 0 rgba(0,0,0,.05)}',
            '.pal-scope{margin-left:auto;cursor:pointer;font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:99px;',
            ' background:rgba(120,120,128,.14);color:#5b5b60;user-select:none}',
            '.pal-scope:hover{background:rgba(120,120,128,.24)}',
            '.pal-scope[data-scope="master"]{background:linear-gradient(120deg,rgba(255,154,61,.30),rgba(255,111,82,.22));color:#9a3412}',
            '.pal-hint{color:#b6b6bb;min-width:34px;text-align:right}',
            '.pal-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#1e2126;color:#f6f7f8;font-size:12.5px;',
            ' padding:9px 16px;border-radius:9px;z-index:2147483401;box-shadow:0 12px 30px rgba(0,0,0,.3);opacity:0;',
            ' pointer-events:none;transition:opacity .15s;font-family:-apple-system,"Malgun Gothic",sans-serif}',
            '.pal-toast.show{opacity:1}'
        ].join('');
        var st = document.createElement('style');
        st.id = 'tm-palette-style'; st.textContent = css;
        document.head.appendChild(st);
    }

    var toastEl = null, toastTo = null;
    function toast(msg) {
        injectStyles();
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'pal-toast';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        if (toastTo) clearTimeout(toastTo);
        toastTo = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
    }

    /* ── UI 상태 ───────────────────────────────────────────────── */
    var UI = { back: null, input: null, list: null, tag: null, open: false, mounted: false };
    var Q = '', SEL = 0, FLAT = [], MORE = {};

    // 서버 검색 트리거(마스터 항상 · 청구서는 전 탭 모드 + 관리번호)
    function runServer() {
        var q = Q.trim();
        if (q.length < 2) { MQ = { q: '', state: 'idle', rows: [], fail: false, ms: 0 }; return; }
        masterQuery(q);
        if (isKey(q)) expQuery(q.toUpperCase());
    }

    function scopeLabel() { return CFG.scope === 'master' ? '마스터만' : '전 탭 조회'; }
    function paintScope() {
        if (!UI.scope) return;
        UI.scope.textContent = scopeLabel();
        UI.scope.title = (CFG.scope === 'master'
            ? '마스터(정본)만 조회 — 클릭 또는 Ctrl+M 으로 전 탭 조회로 전환'
            : '마스터 + 신청·선행·출원·등록·업무·청구서 조회 — 클릭 또는 Ctrl+M 으로 마스터만')
            + (IS_LIST ? '' : ' · 이 화면은 목록 탭이 아니어서 마스터 조회가 기본입니다');
        UI.scope.setAttribute('data-scope', CFG.scope);
    }
    function toggleScope() {
        CFG.scope = (CFG.scope === 'master') ? 'all' : 'master';
        CFG.scopeSetByUser = true;
        saveCfg();
        if (CFG.scope === 'all' && Q.trim()) startAll();
        paintScope();
        SEL = 0; render();
        log('조회 범위:', CFG.scope);
    }

    function mount() {
        if (UI.mounted) return;
        injectStyles();
        var back = document.createElement('div');
        back.className = 'pal-back';
        back.innerHTML =
            '<div class="pal-rim"><div class="pal">' +
              '<div class="pal-in">' +
                '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8a8a90" stroke-width="2.2" stroke-linecap="round">' +
                  '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.6-3.6"></path></svg>' +
                '<input type="text" spellcheck="false" autocomplete="off" placeholder="관리번호 · 발명명칭 · 발명자 이름으로 검색">' +
                '<span class="pal-tag"></span>' +
              '</div>' +
              '<div class="pal-list"></div>' +
              '<div class="pal-foot">' +
                '<span><span class="pal-kbd">↑↓</span>이동</span>' +
                '<span><span class="pal-kbd">↩</span>상세 팝업</span>' +
                '<span><span class="pal-kbd">⇧↩</span>탭에서 찾기</span>' +
                '<span><span class="pal-kbd">^M</span>범위</span>' +
                '<span><span class="pal-kbd">esc</span>닫기</span>' +
                '<span class="pal-scope" role="button"></span>' +
                '<span class="pal-hint"></span>' +
              '</div>' +
            '</div></div>';
        document.body.appendChild(back);

        UI.back = back;
        UI.input = back.querySelector('.pal-in input');
        UI.list = back.querySelector('.pal-list');
        UI.tag = back.querySelector('.pal-tag');
        UI.hint = back.querySelector('.pal-hint');
        UI.scope = back.querySelector('.pal-scope');
        UI.scope.addEventListener('click', function (e) { e.stopPropagation(); toggleScope(); UI.input.focus(); });
        paintScope();
        UI.mounted = true;

        var deb = null, debS = null;
        UI.input.addEventListener('input', function () {
            Q = UI.input.value;
            if (Q.trim()) startAll();
            if (deb) clearTimeout(deb);
            deb = setTimeout(function () { SEL = 0; MORE = {}; render(); }, CFG.debounceMs);
            if (debS) clearTimeout(debS);
            debS = setTimeout(runServer, CFG.serverDebounceMs);
        });
        UI.input.addEventListener('keydown', onKey);

        back.addEventListener('mousedown', function (e) {
            if (!e.target.closest('.pal-rim')) close();
        });
        UI.list.addEventListener('click', function (e) {
            var row = e.target.closest('.pal-row');
            if (row) { var fi = +row.getAttribute('data-fi'); if (FLAT[fi]) { e.shiftKey ? locate(FLAT[fi]) : openRec(FLAT[fi]); } return; }
            var more = e.target.closest('.pal-more');
            if (more) { MORE[more.getAttribute('data-more')] = true; render(); return; }
            var rf = e.target.closest('.pal-rf');
            if (rf) { e.stopPropagation(); loadTab(rf.getAttribute('data-rt'), true); return; }
            var rt = e.target.closest('[data-retry]');
            if (rt) { loadTab(rt.getAttribute('data-retry'), true); }
        });
        UI.list.addEventListener('mousemove', function (e) {
            var row = e.target.closest('.pal-row');
            if (!row) return;
            var fi = +row.getAttribute('data-fi');
            if (fi !== SEL) { SEL = fi; paintSel(false); }
        });
    }

    function onKey(e) {
        var oe = e;
        if (oe.isComposing || e.keyCode === 229) return;
        var k = e.key;
        if (k === 'Escape') { e.preventDefault(); close(); return; }   // 입력창 Esc
        if (k === 'ArrowDown') { e.preventDefault(); move(1); return; }
        if (k === 'ArrowUp') { e.preventDefault(); move(-1); return; }
        if (k === 'PageDown') { e.preventDefault(); move(8); return; }
        if (k === 'PageUp') { e.preventDefault(); move(-8); return; }
        if (k === 'Home') { e.preventDefault(); SEL = 0; paintSel(true); return; }
        if (k === 'End') { e.preventDefault(); SEL = Math.max(0, FLAT.length - 1); paintSel(true); return; }
        if (e.which === 13) {
            e.preventDefault(); e.stopPropagation();
            if (FLAT[SEL]) { e.shiftKey ? locate(FLAT[SEL]) : openRec(FLAT[SEL]); }
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (k === 'm' || k === 'M')) { e.preventDefault(); toggleScope(); return; }
        if ((e.ctrlKey || e.metaKey) && (k === 'c' || k === 'C') && FLAT[SEL] && !window.getSelection().toString()) {
            e.preventDefault();
            copyText(FLAT[SEL].k);
            toast('복사: ' + FLAT[SEL].k);
        }
    }
    function copyText(t) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) return void navigator.clipboard.writeText(t);
        } catch (e) {}
        var ta = document.createElement('textarea');
        ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e2) {}
        document.body.removeChild(ta);
    }

    // 순환 이동 + 스크롤 동기화
    function move(d) {
        if (!FLAT.length) return;
        var n = FLAT.length;
        SEL = (Math.abs(d) === 1) ? ((SEL + d + n) % n) : Math.max(0, Math.min(n - 1, SEL + d));
        paintSel(true);
    }
    function paintSel(scroll) {
        var rows = UI.list.querySelectorAll('.pal-row');
        for (var i = 0; i < rows.length; i++) rows[i].classList.remove('on');
        var el = UI.list.querySelector('.pal-row[data-fi="' + SEL + '"]');
        if (!el) return;
        el.classList.add('on');
        if (!scroll) return;
        // 섹션 헤더(sticky 40px)를 가리지 않도록 여백 확보
        var lr = UI.list.getBoundingClientRect(), er = el.getBoundingClientRect(), pad = 42;
        if (er.top < lr.top + pad) UI.list.scrollTop -= (lr.top + pad - er.top);
        else if (er.bottom > lr.bottom - 6) UI.list.scrollTop += (er.bottom - lr.bottom + 6);
    }

    /* ── 렌더 ──────────────────────────────────────────────────── */
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function hiInto(node, text, toks) {
        var s = String(text || ''), low = s.toLowerCase(), pos = 0;
        while (pos < s.length) {
            var best = -1, bl = 0;
            for (var i = 0; i < toks.length; i++) {
                var p = low.indexOf(toks[i], pos);
                if (p !== -1 && (best === -1 || p < best)) { best = p; bl = toks[i].length; }
            }
            if (best === -1) { node.appendChild(document.createTextNode(s.slice(pos))); break; }
            if (best > pos) node.appendChild(document.createTextNode(s.slice(pos, best)));
            var m = el('mark', null, s.slice(best, best + bl));
            node.appendChild(m);
            pos = best + bl;
        }
    }
    function dotCls(st) {
        if (/완료/.test(st)) return 'g';
        if (/(신청|임시)/.test(st)) return 'b';
        return '';
    }
    function rowEl(rec, toks, fi) {
        var r = el('div', 'pal-row'); r.setAttribute('data-fi', fi);
        r.appendChild(el('span', 'pal-gl', REG[rec.t].glyph));
        var k = el('span', 'pal-key'); hiInto(k, rec.k || rec.k2, toks); r.appendChild(k);
        var t = el('span', 'pal-ti'); hiInto(t, rec.ti, toks); r.appendChild(t);
        var m = el('span', 'pal-meta');
        if (rec.st) { m.appendChild(el('i', 'pal-dot ' + dotCls(rec.st))); m.appendChild(el('span', null, rec.st)); }
        if (rec.s) m.appendChild(el('span', null, (rec.st ? '· ' : '') + rec.s.split(' · ')[0]));
        if (rec.d) m.appendChild(el('em', null, rec.d));
        r.appendChild(m);
        return r;
    }
    function buildGroups(toks) {
        var byTab = {}, i, L = lightTabs();
        for (i = 0; i < L.length; i++) {
            var t = L[i];
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
        return { order: order, byTab: byTab,
                 pending: L.filter(function (x) { return IDX.state[x] === 'wait'; }),
                 failed: L.filter(function (x) { return IDX.state[x] === 'fail'; }) };
    }

    function render() {
        if (!UI.mounted || !UI.open) return;
        var list = UI.list;
        list.innerHTML = ''; FLAT = [];
        var q = Q.trim();
        UI.tag.textContent = isKey(q) ? '관리번호' : '';

        if (!q) {
            var e0 = el('div', 'pal-empty');
            e0.appendChild(el('b', null, '무엇을 찾으시나요?'));
            e0.appendChild(document.createTextNode('관리번호(P260083 · P260083KR) · 발명명칭 일부 · 발명자 이름'
                + (IS_LIST ? '' : '   ·   Enter 상세 팝업 / Shift+Enter 해당 탭으로 이동')));
            list.appendChild(e0);
            UI.hint.textContent = '';
            return;
        }

        var toks = toksOf(q), G = buildGroups(toks), shown = 0;

        // ① 마스터(정본) 최상단
        if (MQ.state === 'loading' && MQ.q === q) {
            var pdm = el('div', 'pal-pend');
            var pcm = el('span', 'pal-pc'); pcm.appendChild(el('i')); pcm.appendChild(el('span', null, '마스터 조회'));
            pdm.appendChild(pcm); list.appendChild(pdm);
        } else if (MQ.state === 'ok' && MQ.q === q) {
            if (MQ.rows.length) {
                var capM = MORE.master ? MQ.rows.length : CFG.masterMax;
                var secM = el('div', 'pal-sec');
                secM.appendChild(el('span', null, '지식재산권 마스터'));
                secM.appendChild(el('span', 'pal-cap', '정본'));
                secM.appendChild(el('span', 'pal-cnt', String(MQ.rows.length)));
                var frM = el('span', 'pal-fresh');
                frM.appendChild(el('span', null, MQ.ms ? MQ.ms + 'ms' : ''));
                secM.appendChild(frM);
                list.appendChild(secM);
                MQ.rows.slice(0, capM).forEach(function (rec) {
                    FLAT.push(rec); list.appendChild(rowEl(rec, toks, FLAT.length - 1)); shown++;
                });
                if (MQ.rows.length > capM) {
                    var moM = el('div', 'pal-more', '더보기 ' + (MQ.rows.length - capM) + '건');
                    moM.setAttribute('data-more', 'master'); list.appendChild(moM);
                }
            } else if (MQ.fail) {
                list.appendChild(el('div', 'pal-pend', '마스터: 조회 실패 — 마스터 탭에서 직접 확인'));
            }
        }

        if (G.pending.length) {
            var pd = el('div', 'pal-pend');
            G.pending.forEach(function (t) {
                var pc = el('span', 'pal-pc'); pc.appendChild(el('i')); pc.appendChild(el('span', null, REG[t].label));
                pd.appendChild(pc);
            });
            list.appendChild(pd);
        }

        G.order.forEach(function (t) {
            var hits = G.byTab[t];
            var sec = el('div', 'pal-sec');
            sec.appendChild(el('span', null, REG[t].label));
            if (t === CUR) sec.appendChild(el('span', 'pal-cap', '현재 화면'));
            sec.appendChild(el('span', 'pal-cnt', String(hits.length)));
            var fr = el('span', 'pal-fresh');
            fr.appendChild(el('span', null, IDX.at[t] ? fmtAgo(IDX.at[t]) : ''));
            var rf = el('span', 'pal-rf', '⟳'); rf.setAttribute('data-rt', t); rf.title = '다시 불러오기';
            fr.appendChild(rf); sec.appendChild(fr);
            list.appendChild(sec);

            var cap = MORE[t] ? hits.length : CFG.perGroup;
            hits.slice(0, cap).forEach(function (h) { FLAT.push(h.rec); list.appendChild(rowEl(h.rec, toks, FLAT.length - 1)); shown++; });
            if (hits.length > cap) {
                var mo = el('div', 'pal-more', '더보기 ' + (hits.length - cap) + '건');
                mo.setAttribute('data-more', t); list.appendChild(mo);
            }
        });

        // 청구서: 관리번호 단건 (전 탭 모드)
        if (CFG.scope !== 'master' && isKey(q)) {
            if (EQ.state === 'loading' && EQ.q === q.toUpperCase()) {
                var pd2 = el('div', 'pal-pend');
                var pc2 = el('span', 'pal-pc'); pc2.appendChild(el('i')); pc2.appendChild(el('span', null, '청구서 조회'));
                pd2.appendChild(pc2); list.appendChild(pd2);
            } else if (EQ.state === 'ok' && EQ.rows.length) {
                var sec2 = el('div', 'pal-sec');
                sec2.appendChild(el('span', null, REG.exp.label));
                sec2.appendChild(el('span', 'pal-cap', '서버 조회'));
                sec2.appendChild(el('span', 'pal-cnt', String(EQ.rows.length)));
                list.appendChild(sec2);
                EQ.rows.forEach(function (rec) { FLAT.push(rec); list.appendChild(rowEl(rec, toks, FLAT.length - 1)); shown++; });
            }
        }

        G.failed.forEach(function (t) {
            var f = el('div', 'pal-fail');
            f.appendChild(el('span', null, REG[t].label + ' 응답 없음'));
            var b = el('button', null, '재시도'); b.type = 'button'; b.setAttribute('data-retry', t);
            f.appendChild(b); list.appendChild(f);
        });

        if (!shown && !G.pending.length && !G.failed.length && MQ.state !== 'loading' && EQ.state !== 'loading') {
            var e1 = el('div', 'pal-empty');
            e1.appendChild(el('b', null, '일치하는 건이 없습니다'));
            e1.appendChild(document.createTextNode('관리번호 일부(P2601) 또는 이름으로 다시 검색해 보세요'));
            list.appendChild(e1);
        }

        UI.hint.textContent = FLAT.length ? (FLAT.length + '건') : '';
        paintScope();
        SEL = Math.min(SEL, Math.max(0, FLAT.length - 1));
        paintSel(false);
    }

    /* ── 열기/닫기 · 단축키 ────────────────────────────────────── */
    function open(seed) {
        mount();
        UI.open = true;
        UI.back.style.display = 'flex';
        if (window.requestAnimationFrame) requestAnimationFrame(function () { if (UI.open) UI.back.classList.add('on'); });
        else UI.back.classList.add('on');
        document.documentElement.style.overflow = 'hidden';
        if (seed != null) { Q = seed; UI.input.value = seed; }
        UI.input.focus(); UI.input.select();
        if (Q.trim()) { startAll(); runServer(); }
        render();
    }
    // v1.3.3 ②③: 닫을 때 요소를 확실히 숨긴다(투명 상태로 화면을 덮어 클릭을 삼키는 문제 방지).
    //   force=true 면 열림 여부와 무관하게 정리(Esc·주기 점검의 자기 치유 경로).
    function close(force) {
        if (!UI.back) return;
        if (!UI.open && !force) return;
        UI.open = false;
        UI.back.classList.remove('on');
        document.documentElement.style.overflow = '';
        setTimeout(function () {
            if (!UI.open && UI.back) UI.back.style.display = 'none';
        }, 150);
        if (force) UI.back.style.display = 'none';
    }
    function toggle(seed) { UI.open ? close() : open(seed); }

    var lastShift = 0;
    function bindHotkeys() {
        document.addEventListener('keydown', function (e) {
            if (e.repeat) return;
            var hk = CFG.hotkey;
            // Ctrl(⌘)+Space / Ctrl+Shift+Space
            if ((e.code === 'Space' || e.key === ' ') && (e.ctrlKey || e.metaKey)) {
                if (e.shiftKey ? hk.ctrlShiftSpace : hk.ctrlSpace) {
                    e.preventDefault(); e.stopImmediatePropagation();
                    var sel = String(window.getSelection ? window.getSelection().toString() : '').trim();
                    toggle(sel && sel.length <= 40 ? sel : null);
                    return;
                }
            }
            // Shift 두 번 연타 — v1.3.2 ④: 다른 입력창에 포커스가 있으면 억제(대문자 입력 오작동 방지)
            var ae = document.activeElement, tn = (ae && ae.tagName || '').toLowerCase();
            var typing = (tn === 'input' || tn === 'textarea' || tn === 'select' || (ae && ae.isContentEditable))
                         && !(UI.open && ae === UI.input);
            if (hk.doubleShift && !typing && e.key === 'Shift' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                var now = Date.now();
                if (now - lastShift < hk.doubleShiftMs) { lastShift = 0; e.preventDefault(); toggle(null); }
                else lastShift = now;
                return;
            }
            if (e.key === 'Escape') { if (UI.open) { e.preventDefault(); close(); } else if (UI.back && UI.back.style.display === 'flex') close(true); }
        }, true);
    }

    /* ── 기동 ──────────────────────────────────────────────────── */
    try {
        // v1.3.3 ④: 구버전(1.3.0~1.3.2)이 남긴 오버레이 잔류물 제거
        try {
            var stale = document.querySelectorAll('.pal-back');
            for (var i = 0; i < stale.length; i++) stale[i].parentNode.removeChild(stale[i]);
            if (stale.length) log('구버전 오버레이 ' + stale.length + '개 제거');
        } catch (e0) {}

        bindHotkeys();
        handleJumpIntent();

        // v1.3.3 ⑤: 이중 안전장치 — 닫힌 상태인데 오버레이가 표시돼 있으면 즉시 숨김
        setInterval(function () {
            if (!UI.open && UI.back && UI.back.style.display === 'flex') {
                warn('닫힌 상태의 오버레이 감지 — 강제 숨김');
                close(true);
            }
        }, 3000);
        if (document.getElementById('pd-panel')) log('포털 대시보드(#pd-panel) 감지 — 공존 모드(요소·키 충돌 없음)');
        if (!$) warn('jQuery 미탑재 화면 — 팝업은 form POST, 찾기(Shift+Enter)는 비활성');
        log('기동 v' + VER + ' — 화면:', REG[CUR] ? REG[CUR].label : (IS_LIST ? '(미상)' : '포털·기타'),
            '| 범위:', CFG.scope,
            '| Ctrl+Space · Ctrl+Shift+Space · Shift×2 · Ctrl+M(범위) | 킬 스위치: localStorage["' + NS + '.off"]="1"');
    } catch (e) { err('init', e); }

})();