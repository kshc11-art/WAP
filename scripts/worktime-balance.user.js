// ==UserScript==
// @name         KRISS 근무시간 초과·부족시간 표시
// @namespace    kriss.local.worktime
// @version      1.0.0
// @description  KRISSTAR 근무시간 상세정보 화면에서 어제까지의 인정 근무시간과 기준 근무시간을 비교해 초과/부족시간을 표시합니다.
// @match        https://krisstar.kriss.re.kr/mis/hrm/worktime/S_HRM_01051730.do*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /**
     * PRD v1 기준 설정
     * - 정상 근무일 1일 기준: 8시간(480분)
     * - 오늘은 제외하고 어제까지 계산
     * - .-restDay는 기준 근무일에서 제외
     * - 휴일이라도 .hourCount가 있으면 실제 인정근무시간에는 포함
     */
    const CONFIG = Object.freeze({
        STANDARD_MINUTES_PER_DAY: 8 * 60,
        SUMMARY_ID: 'tm-worktime-summary',
        STYLE_ID: 'tm-worktime-summary-style',
        INITIAL_RETRY_COUNT: 24,
        INITIAL_RETRY_DELAY_MS: 250,
        RECALC_DEBOUNCE_MS: 120,
        DEBUG: false,
    });

    let recalcTimer = null;
    let calendarObserver = null;

    function log(...args) {
        if (CONFIG.DEBUG) {
            console.log('[KRISS Worktime]', ...args);
        }
    }

    function warn(...args) {
        console.warn('[KRISS Worktime]', ...args);
    }

    /** HH:MM -> 분 */
    function parseTimeToMinutes(value) {
        const text = String(value ?? '').trim();
        const match = text.match(/^(\d{1,3}):([0-5]\d)$/);
        if (!match) return null;

        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

        return (hours * 60) + minutes;
    }

    /** 분 -> 00시간 00분 */
    function formatMinutes(totalMinutes) {
        const minutes = Math.max(0, Math.trunc(Math.abs(totalMinutes)));
        const hours = Math.floor(minutes / 60);
        const remainder = minutes % 60;
        return `${String(hours).padStart(2, '0')}시간 ${String(remainder).padStart(2, '0')}분`;
    }

    function formatDate(year, month, day) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function startOfToday() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    /**
     * 화면의 기준월 확인.
     * 1) #searchCalendarDate.value
     * 2) value attribute
     * 3) 현재월 화면이면 .currentDay를 근거로 로컬 현재 연/월 사용
     *
     * 기준월을 확정할 수 없으면 잘못 계산하지 않고 null 반환.
     */
    function getDisplayedYearMonth() {
        const input = document.querySelector('#searchCalendarDate');
        const candidates = [
            input?.value,
            input?.getAttribute('value'),
        ];

        for (const raw of candidates) {
            const parsed = parseYearMonth(raw);
            if (parsed) return parsed;
        }

        // 현재월 달력에는 currentDay 클래스가 존재하므로 안전한 fallback으로 사용.
        const currentDayCell = document.querySelector('#scheduler td.currentDay .dateNumber');
        if (currentDayCell) {
            const today = new Date();
            return {
                year: today.getFullYear(),
                month: today.getMonth() + 1,
                source: 'currentDay-fallback',
            };
        }

        return null;
    }

    function parseYearMonth(raw) {
        const text = String(raw ?? '').trim();
        if (!text) return null;

        // 2026-09, 2026.09, 2026/09, 2026년 09월 등
        let match = text.match(/^(\d{4})\D+(\d{1,2})/);
        if (!match) {
            // 202609
            match = text.match(/^(\d{4})(\d{2})$/);
        }
        if (!match) return null;

        const year = Number(match[1]);
        const month = Number(match[2]);
        if (year < 2000 || year > 2200 || month < 1 || month > 12) return null;

        return { year, month, source: 'calendar-input' };
    }

    function isValidDate(year, month, day) {
        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year
            && date.getMonth() === month - 1
            && date.getDate() === day;
    }

    /**
     * 달력 DOM을 기준으로 어제까지 계산한다.
     */
    function calculateWorktimeBalance() {
        const scheduler = document.querySelector('#scheduler');
        if (!scheduler) {
            return { ok: false, reason: '근무시간 달력을 찾을 수 없습니다.' };
        }

        const yearMonth = getDisplayedYearMonth();
        if (!yearMonth) {
            return { ok: false, reason: '기준월을 확인할 수 없습니다.' };
        }

        const { year, month } = yearMonth;
        const today = startOfToday();
        const cells = scheduler.querySelectorAll('table.scheduler-calendar tbody td');

        let actualMinutes = 0;
        let standardWorkdays = 0;
        let eligibleCalendarDays = 0;
        let invalidHourCountCount = 0;
        let lastIncludedDay = null;

        for (const cell of cells) {
            const dateNumberEl = cell.querySelector('.dateNumber');
            if (!dateNumberEl) continue;

            const day = Number(dateNumberEl.textContent.trim());
            if (!Number.isInteger(day) || day < 1 || day > 31) continue;
            if (!isValidDate(year, month, day)) continue;

            const cellDate = new Date(year, month - 1, day);

            // 오늘 및 미래 날짜 제외 -> "어제까지"
            if (cellDate >= today) continue;

            eligibleCalendarDays += 1;
            lastIncludedDay = day;

            // 실제 인정근무시간은 휴일 여부와 관계없이 시스템이 표시한 hourCount를 합산한다.
            const hourCountEl = cell.querySelector('.hourCount');
            if (hourCountEl) {
                const parsed = parseTimeToMinutes(hourCountEl.textContent);
                if (parsed === null) {
                    invalidHourCountCount += 1;
                    warn('해석할 수 없는 hourCount 값:', hourCountEl.textContent, cell);
                } else {
                    actualMinutes += parsed;
                }
            }

            // 기준근무시간: PRD v1에 따라 -restDay가 아닌 과거 날짜를 정상 근무일로 계산.
            if (!cell.classList.contains('-restDay')) {
                standardWorkdays += 1;
            }
        }

        const standardMinutes = standardWorkdays * CONFIG.STANDARD_MINUTES_PER_DAY;
        const balanceMinutes = actualMinutes - standardMinutes;

        return {
            ok: true,
            year,
            month,
            source: yearMonth.source,
            actualMinutes,
            standardMinutes,
            standardWorkdays,
            balanceMinutes,
            eligibleCalendarDays,
            invalidHourCountCount,
            lastIncludedDay,
        };
    }

    function ensureStyles() {
        if (document.getElementById(CONFIG.STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = CONFIG.STYLE_ID;
        style.textContent = `
            #${CONFIG.SUMMARY_ID} {
                box-sizing: border-box;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: flex-end;
                gap: 8px 14px;
                margin: 8px 0 10px;
                padding: 9px 12px;
                border: 1px solid #d9e0e7;
                border-radius: 3px;
                background: #f7f9fb;
                color: #333;
                font-size: 13px;
                line-height: 1.5;
            }
            #${CONFIG.SUMMARY_ID} .tm-worktime-item {
                white-space: nowrap;
            }
            #${CONFIG.SUMMARY_ID} .tm-worktime-label {
                color: #555;
            }
            #${CONFIG.SUMMARY_ID} .tm-worktime-value {
                margin-left: 4px;
                font-weight: 700;
                color: #222;
            }
            #${CONFIG.SUMMARY_ID} .tm-worktime-divider {
                color: #b3bac2;
            }
            #${CONFIG.SUMMARY_ID} .tm-worktime-status {
                padding: 2px 7px;
                border-radius: 3px;
                font-weight: 700;
            }
            #${CONFIG.SUMMARY_ID}[data-status="over"] .tm-worktime-status {
                color: #126b39;
                background: #e9f7ef;
            }
            #${CONFIG.SUMMARY_ID}[data-status="under"] .tm-worktime-status {
                color: #a62b2b;
                background: #fdeeee;
            }
            #${CONFIG.SUMMARY_ID}[data-status="equal"] .tm-worktime-status,
            #${CONFIG.SUMMARY_ID}[data-status="empty"] .tm-worktime-status {
                color: #3f5368;
                background: #edf1f5;
            }
            #${CONFIG.SUMMARY_ID}[data-status="error"] {
                justify-content: flex-start;
                color: #a62b2b;
                background: #fff6f6;
                border-color: #efcccc;
            }
        `;
        document.head.appendChild(style);
    }

    function createSummaryElement() {
        let summary = document.getElementById(CONFIG.SUMMARY_ID);
        if (summary) return summary;

        const heading = document.querySelector('.scheduler-calendar-heading');
        if (!heading) return null;

        summary = document.createElement('div');
        summary.id = CONFIG.SUMMARY_ID;
        summary.setAttribute('role', 'status');
        summary.setAttribute('aria-live', 'polite');

        heading.insertAdjacentElement('afterend', summary);
        return summary;
    }

    function appendTextItem(parent, label, value, extraClass = '') {
        const item = document.createElement('span');
        item.className = `tm-worktime-item ${extraClass}`.trim();

        const labelEl = document.createElement('span');
        labelEl.className = 'tm-worktime-label';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.className = 'tm-worktime-value';
        valueEl.textContent = value;

        item.append(labelEl, valueEl);
        parent.appendChild(item);
    }

    function appendDivider(parent) {
        const divider = document.createElement('span');
        divider.className = 'tm-worktime-divider';
        divider.textContent = '│';
        divider.setAttribute('aria-hidden', 'true');
        parent.appendChild(divider);
    }

    function renderResult(result) {
        ensureStyles();
        const summary = createSummaryElement();
        if (!summary) return;

        summary.replaceChildren();

        if (!result.ok) {
            summary.dataset.status = 'error';
            summary.textContent = `근무시간 계산 불가: ${result.reason}`;
            return;
        }

        if (result.eligibleCalendarDays === 0) {
            summary.dataset.status = 'empty';
            appendTextItem(summary, '어제까지', '계산 대상 날짜 없음', 'tm-worktime-status');
            summary.title = `기준월 ${result.year}-${String(result.month).padStart(2, '0')}에는 오늘 이전의 날짜가 없습니다.`;
            return;
        }

        const standardHours = CONFIG.STANDARD_MINUTES_PER_DAY / 60;
        const lastDateText = result.lastIncludedDay
            ? formatDate(result.year, result.month, result.lastIncludedDay)
            : '어제';

        appendTextItem(summary, '어제까지 누적 :', formatMinutes(result.actualMinutes));
        appendDivider(summary);
        appendTextItem(
            summary,
            '기준 :',
            `${formatMinutes(result.standardMinutes)} (${result.standardWorkdays}일 × ${standardHours}시간)`
        );
        appendDivider(summary);

        if (result.balanceMinutes > 0) {
            summary.dataset.status = 'over';
            appendTextItem(summary, '초과 :', `+${formatMinutes(result.balanceMinutes)}`, 'tm-worktime-status');
        } else if (result.balanceMinutes < 0) {
            summary.dataset.status = 'under';
            appendTextItem(summary, '부족 :', `-${formatMinutes(result.balanceMinutes)}`, 'tm-worktime-status');
        } else {
            summary.dataset.status = 'equal';
            appendTextItem(summary, '기준 충족 :', formatMinutes(0), 'tm-worktime-status');
        }

        const tooltipLines = [
            `계산 기준일: ${lastDateText}`,
            `인정 근무시간: 시스템 달력의 .hourCount 합계`,
            `기준 근무시간: -restDay 제외 근무일 × ${standardHours}시간`,
            `오늘과 미래 날짜는 제외`,
        ];
        if (result.invalidHourCountCount > 0) {
            tooltipLines.push(`주의: 해석하지 못한 근무시간 ${result.invalidHourCountCount}건`);
        }
        summary.title = tooltipLines.join('\n');

        log('계산 결과', result);
    }

    function recalculate() {
        try {
            bindCalendarInputEvents();
            const result = calculateWorktimeBalance();
            renderResult(result);
        } catch (error) {
            console.error('[KRISS Worktime] 계산 중 오류가 발생했습니다.', error);
            renderResult({ ok: false, reason: '스크립트 오류가 발생했습니다. 개발자 도구 콘솔을 확인하십시오.' });
        }
    }

    function scheduleRecalculate() {
        if (recalcTimer !== null) {
            clearTimeout(recalcTimer);
        }
        recalcTimer = window.setTimeout(() => {
            recalcTimer = null;
            recalculate();
        }, CONFIG.RECALC_DEBOUNCE_MS);
    }

    function bindCalendarInputEvents() {
        const input = document.querySelector('#searchCalendarDate');
        if (!input || input.dataset.tmWorktimeBound === '1') return;

        input.dataset.tmWorktimeBound = '1';
        input.addEventListener('change', scheduleRecalculate);
        input.addEventListener('input', scheduleRecalculate);
    }

    function setupMutationObserver() {
        const box = document.querySelector('.scheduler-calendar-box');
        if (!box) return false;

        if (calendarObserver) {
            calendarObserver.disconnect();
        }

        calendarObserver = new MutationObserver((mutations) => {
            // 우리가 추가한 요약 영역만 바뀐 경우 재계산하지 않아 루프 방지.
            const hasRelevantMutation = mutations.some((mutation) => {
                const target = mutation.target instanceof Element
                    ? mutation.target
                    : mutation.target.parentElement;

                if (target?.closest?.(`#${CONFIG.SUMMARY_ID}`)) {
                    return false;
                }
                return true;
            });

            if (hasRelevantMutation) {
                scheduleRecalculate();
            }
        });

        calendarObserver.observe(box, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        return true;
    }

    function initialize(attempt = 0) {
        const scheduler = document.querySelector('#scheduler table.scheduler-calendar');
        const heading = document.querySelector('.scheduler-calendar-heading');

        if (scheduler && heading) {
            bindCalendarInputEvents();
            setupMutationObserver();
            recalculate();
            return;
        }

        if (attempt < CONFIG.INITIAL_RETRY_COUNT) {
            window.setTimeout(() => initialize(attempt + 1), CONFIG.INITIAL_RETRY_DELAY_MS);
            return;
        }

        warn('초기화 실패: 근무시간 상세정보 달력을 찾지 못했습니다.');
    }

    initialize();
})();
