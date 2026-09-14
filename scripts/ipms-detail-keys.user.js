// ==UserScript==
// @name         KRISS IPMS - 상세 팝업 단축키
// @namespace    kriss-ipms-enhancement
// @version      1.0
// @description  상세 팝업 공통 단축키. 버튼을 라벨(접수/승인/최종승인/반려/임시저장 등)로 자동 탐지하여 Alt+키에 매핑. Alt+/ 치트시트, Alt+Shift+X 이 스크립트 해제.
// @match        *://*/pms/*.do*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * ── 설계·안전 요지 ───────────────────────────────────────────────
 *  · 상세 팝업은 URL·버튼 id가 제각각이라 "버튼 텍스트"로 탐지한다.
 *    (예: 화면에 보이는 '승인' 버튼을 찾아 클릭)
 *  · 목록 페이지에서는 동작하지 않도록 "팝업 여부"를 런타임에 판정:
 *    window.opener 존재 또는 URL이 팝업 형태일 때만 활성.
 *    (목록 페이지의 목록-공통 스크립트와 충돌하지 않음)
 *  · 안전 원칙(배경 문서): 단축키는 "해당 버튼 1회 클릭"까지만 수행.
 *    사용자가 키를 눌러야만 실행되며(사용자 의사), 이후 뜨는 확인창을
 *    자동으로 수락하지 않는다. 2차 확인창까지 자동화하려면 확인창 형태
 *    (브라우저 confirm / Kendo 모달 / 새 창)를 확정한 뒤 별도 합의 필요.
 *  · 버튼은 라벨 "정확 일치"로만 매칭한다(부분일치 금지 → 오작동 방지).
 * ──────────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    // ============================================================
    //  키 매핑 (여기만 고치면 됨). label 은 버튼에 보이는 글자.
    //  같은 동작의 표기 변형은 배열로 나열(공백은 무시하고 비교).
    // ============================================================
    var KEYMAP = {
        '1': ['접수'],
        '2': ['승인', '출원지시'],
        '3': ['최종승인', '최종확인'],
        '4': ['반려'],
        '5': ['임시저장'],
        '6': ['저장'],
        '8': ['상세보기'],
        '9': ['접수대기상태로변경'],
        '0': ['닫기', '취소'],
        '`': ['대조', '출원대조', '등록대조']
    };

    var DEBUG = true;
    function log() { if (DEBUG) console.log.apply(console, ['[TM-Popup]'].concat([].slice.call(arguments))); }

    // ── 팝업에서만 활성화 ──
    var isPopup = (window.opener && window.opener !== window) ||
                  /\/popup\/|B_RES\d|popupAt=popup/i.test(location.href);
    if (!isPopup) { return; } // 목록 등 최상위 페이지에서는 조용히 종료

    if (typeof $ === 'undefined') { console.warn('[TM-Popup] jQuery 미탑재 — 스킵'); return; }

    var _enabled = true;

    // ============================================================
    //  버튼 탐지·클릭
    // ============================================================
    function norm(s) { return (s || '').replace(/\s+/g, '').trim(); }

    function visibleButtons() {
        return $('button, a.btn, a[onclick], input[type=button], input[type=submit], .k-button')
            .filter(':visible');
    }

    function findButtonByLabels(labels) {
        var $cands = visibleButtons();
        for (var i = 0; i < labels.length; i++) {
            var target = norm(labels[i]);
            var hit = null;
            $cands.each(function () {
                var t = norm($(this).text() || $(this).val());
                if (t === target) { hit = this; return false; } // 정확 일치만
            });
            if (hit) return hit;
        }
        return null;
    }

    function triggerLabels(labels) {
        var el = findButtonByLabels(labels);
        if (!el) { toast('‘' + labels[0] + '’ 버튼 없음', true); log('버튼 없음:', labels); return; }
        toast('▶ ' + ($.trim($(el).text() || $(el).val())));
        log('클릭:', labels, el);
        try { el.click(); } catch (e) { $(el).trigger('click'); }
        // ※ 이후 확인창은 자동 수락하지 않음(사용자가 처리)
    }

    // ============================================================
    //  키 이벤트
    // ============================================================
    document.addEventListener('keydown', function (e) {
        if (!_enabled) return;

        // 긴급 해제 (이 스크립트 한정)
        if (e.altKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
            e.preventDefault(); emergencyOff(); return;
        }
        if (!e.altKey || e.ctrlKey || e.shiftKey) return;

        if (e.key === '/') { e.preventDefault(); toggleCheat(); return; }
        // 한글 IME 상태에서도 키보드 왼쪽 위 ` 키를 안정적으로 인식한다.
        var hotKey = (e.code === 'Backquote') ? '`' : e.key;
        if (KEYMAP.hasOwnProperty(hotKey)) { e.preventDefault(); triggerLabels(KEYMAP[hotKey]); }
    }, true);

    // ============================================================
    //  UI: 토스트 / 배지 / 치트시트
    // ============================================================
    function injectStyles() {
        var css = [
            '#tmp-badge{position:fixed;left:8px;bottom:8px;z-index:99998;background:#2c6fbb;color:#fff;font-size:11px;padding:3px 8px;border-radius:10px;opacity:.85;cursor:pointer;font-family:sans-serif}',
            '#tmp-toast{position:fixed;right:12px;bottom:12px;z-index:99999;background:#333;color:#fff;font-size:13px;padding:6px 12px;border-radius:5px;opacity:0;transition:opacity .15s;font-family:sans-serif}',
            '#tmp-toast.err{background:#a33}',
            '#tmp-cheat{position:fixed;right:12px;bottom:48px;z-index:99999;background:#fff;border:1px solid #ccc;border-radius:8px;padding:12px 14px;box-shadow:0 4px 16px rgba(0,0,0,.2);font-size:12px;font-family:sans-serif;min-width:220px}',
            '#tmp-cheat h4{margin:0 0 8px;font-size:13px}',
            '#tmp-cheat table{border-collapse:collapse}#tmp-cheat td{padding:2px 8px 2px 0}',
            '#tmp-cheat .k{display:inline-block;min-width:34px;text-align:center;border:1px solid #bbb;border-radius:3px;padding:0 4px;background:#f7f7f7;font-weight:bold}',
            '#tmp-cheat .off{color:#bbb}'
        ].join('');
        $('<style id="tmp-style">').text(css).appendTo('head');
    }

    function addBadge() {
        $('<div id="tmp-badge">⌨ 단축키 ON (Alt+/)</div>').appendTo('body').on('click', toggleCheat);
    }

    var _toastT = null;
    function toast(msg, isErr) {
        var $t = $('#tmp-toast');
        if (!$t.length) $t = $('<div id="tmp-toast"></div>').appendTo('body');
        $t.text(msg).toggleClass('err', !!isErr).css('opacity', 1);
        clearTimeout(_toastT); _toastT = setTimeout(function () { $t.css('opacity', 0); }, 1400);
    }

    function toggleCheat() {
        var $c = $('#tmp-cheat');
        if ($c.length) { $c.remove(); return; }
        var rows = '';
        Object.keys(KEYMAP).forEach(function (k) {
            var labels = KEYMAP[k];
            var exists = !!findButtonByLabels(labels);
            rows += '<tr><td><span class="k">Alt+' + k + '</span></td><td class="' + (exists ? '' : 'off') + '">' +
                    labels[0] + (exists ? '' : ' (이 팝업에 없음)') + '</td></tr>';
        });
        rows += '<tr><td><span class="k">Alt+/</span></td><td>치트시트 열기/닫기</td></tr>';
        rows += '<tr><td><span class="k">Alt+⇧+X</span></td><td>이 단축키 해제</td></tr>';

        // 참고: 매핑되지 않은 보이는 버튼 목록
        var mapped = {};
        Object.keys(KEYMAP).forEach(function (k) { KEYMAP[k].forEach(function (l) { mapped[norm(l)] = 1; }); });
        var others = [];
        visibleButtons().each(function () {
            var t = $.trim($(this).text() || $(this).val());
            if (t && !mapped[norm(t)] && others.indexOf(t) === -1) others.push(t);
        });

        var html = '<h4>상세 팝업 단축키</h4><table>' + rows + '</table>';
        if (others.length) html += '<div style="margin-top:8px;color:#888;font-size:11px">미매핑 버튼: ' + others.slice(0, 12).join(', ') + '</div>';
        $('<div id="tmp-cheat"></div>').html(html).appendTo('body');
    }

    function emergencyOff() {
        _enabled = false;
        $('#tmp-badge, #tmp-toast, #tmp-cheat').remove();
        log('단축키 해제됨(이 스크립트 한정). 완전 비활성은 탬퍼몽키 대시보드에서.');
        alert('상세 팝업 단축키를 해제했습니다.\n(이 스크립트 한정 · 다시 켜려면 팝업 새로고침)');
    }

    // ── 시작 ──
    injectStyles();
    addBadge();
    log('로드됨 · 팝업 판정=OK · Alt+/ 로 도움말');

})();