// ==UserScript==
// @name         KRISS IPMS - V21 Quick Panel Adapter
// @namespace    kriss-ipms-enhancement
// @version      2.0.0
// @description  KRISS IPMS 상세 팝업을 V21 Shortcut Studio와 연결합니다. 단축키/배치는 Studio에서 관리하고, 이 스크립트는 버튼 탐지·실행 + Compact Studio 호출만 담당합니다.
// @match        *://krisstar.kriss.re.kr/*
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const COMPANION = 'http://127.0.0.1:32145';
    const CONTEXT_HINT = 'KRISS IPMS · 상세 팝업';
    const PANEL_HOTKEY = 'Alt+/';
    const EMERGENCY_HOTKEY = 'Alt+Shift+X';
    const DEBUG = false;

    /*
     * 중요:
     * - 여기에 "Alt+1" 같은 키 매핑은 없습니다.
     * - 실제 Trigger는 Shortcut Studio의 Binding을 읽습니다.
     * - 이 파일에는 "이 Action을 이 웹페이지에서 어떻게 수행하는가"만 남습니다.
     */
    const ACTION_ADAPTERS = [
        { names: ['접수'], labels: ['접수'] },
        { names: ['승인'], labels: ['승인'] },
        { names: ['최종승인', '최종확인'], labels: ['최종승인', '최종확인'] },
        { names: ['반려'], labels: ['반려'] },
        { names: ['임시저장'], labels: ['임시저장'] },
        { names: ['저장'], labels: ['저장'] },
        { names: ['상세보기'], labels: ['상세보기'] },
        { names: ['접수대기상태로변경', '접수대기상태로 변경'], labels: ['접수대기상태로변경', '접수대기상태로 변경'] },
        { names: ['닫기', '취소'], labels: ['닫기', '취소'] }
    ];

    const isPopup =
        (window.opener && window.opener !== window) ||
        /\/popup\/|B_RES\d|popupAt=popup/i.test(location.href);

    if (!isPopup) return;

    let enabled = true;
    let stateCache = null;
    let contextIdCache = 'global';
    let runtimeCache = {};
    let effectiveBindings = new Map();
    let panelWrap = null;
    let panelFrame = null;
    let panelReady = false;
    let panelHtmlCache = '';
    let refreshTimer = null;
    let toastTimer = null;
    let observerTimer = null;

    function log(...args) {
        if (DEBUG) console.log('[V21-IPMS]', ...args);
    }

    function norm(value) {
        return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
    }

    function canonicalTrigger(value) {
        if (!value) return '';
        const raw = String(value).replace(/\s+/g, '');
        const bits = raw.split('+').filter(Boolean);
        const flags = { Ctrl: false, Alt: false, Shift: false, Win: false };
        let key = '';

        for (const part of bits) {
            const p = part.toLowerCase();
            if (p === 'ctrl' || p === 'control' || p === '^') flags.Ctrl = true;
            else if (p === 'alt' || p === '!') flags.Alt = true;
            else if (p === 'shift') flags.Shift = true;
            else if (p === 'win' || p === 'meta' || p === 'cmd' || p === '#') flags.Win = true;
            else key = part.length === 1 ? part.toUpperCase() : part;
        }

        return [
            flags.Ctrl ? 'Ctrl' : '',
            flags.Alt ? 'Alt' : '',
            flags.Shift ? 'Shift' : '',
            flags.Win ? 'Win' : '',
            key
        ].filter(Boolean).join('+');
    }

    function eventKey(event) {
        const code = event.code || '';
        if (/^Key[A-Z]$/.test(code)) return code.slice(3);
        if (/^Digit[0-9]$/.test(code)) return code.slice(5);
        if (/^F(?:1[3-9]|2[0-4])$/.test(code)) return code;
        const byCode = {
            Slash: '/', Backslash: '\\', Period: '.', Comma: ',', Semicolon: ';',
            Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=',
            Backquote: '`', Space: 'Space', Enter: 'Enter', Escape: 'Esc',
            Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete'
        };
        if (byCode[code]) return byCode[code];
        const key = event.key || '';
        if (/^F(?:1[3-9]|2[0-4])$/.test(key)) return key;
        return key.length === 1 ? key.toUpperCase() : key;
    }

    function eventTrigger(event) {
        const key = eventKey(event);
        if (!key || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return '';
        const mods = [];
        if (event.ctrlKey) mods.push('Ctrl');
        if (event.altKey) mods.push('Alt');
        if (event.shiftKey) mods.push('Shift');
        if (event.metaKey) mods.push('Win');
        return canonicalTrigger([...mods, key].join('+'));
    }

    function gmRequest(method, url, body, headers = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method,
                url,
                data: body,
                headers,
                timeout: 2500,
                onload: response => resolve(response),
                onerror: reject,
                ontimeout: () => reject(new Error('timeout'))
            });
        });
    }

    async function getJson(path) {
        const response = await gmRequest('GET', `${COMPANION}${path}`);
        if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
        return JSON.parse(response.responseText || '{}');
    }

    async function postJson(path, value) {
        const response = await gmRequest(
            'POST',
            `${COMPANION}${path}`,
            JSON.stringify(value || {}),
            { 'Content-Type': 'application/json; charset=utf-8' }
        );
        if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
        return true;
    }

    function visibleButtons() {
        return [...document.querySelectorAll(
            'button, a.btn, a[onclick], input[type=button], input[type=submit], .k-button'
        )].filter(el => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        });
    }

    function elementText(el) {
        return String(el?.innerText || el?.textContent || el?.value || '').trim();
    }

    function findButtonByLabels(labels) {
        const candidates = visibleButtons();
        for (const label of labels) {
            const target = norm(label);
            const found = candidates.find(el => norm(elementText(el)) === target);
            if (found) return found;
        }
        return null;
    }

    function adapterForActionName(actionName) {
        const target = norm(actionName);
        return ACTION_ADAPTERS.find(adapter => adapter.names.some(name => norm(name) === target)) || null;
    }

    function availableActionNames() {
        const names = [];
        for (const adapter of ACTION_ADAPTERS) {
            if (findButtonByLabels(adapter.labels)) names.push(adapter.names[0]);
        }
        return names;
    }

    function showToast(message, error = false) {
        let el = document.getElementById('v21-ipms-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'v21-ipms-toast';
            Object.assign(el.style, {
                position: 'fixed',
                right: '18px',
                bottom: '18px',
                zIndex: '2147483647',
                maxWidth: '360px',
                padding: '9px 13px',
                borderRadius: '999px',
                color: '#fff',
                background: 'rgba(29,29,31,.94)',
                boxShadow: '0 10px 30px rgba(0,0,0,.28)',
                font: '600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
                opacity: '0',
                transform: 'translateY(8px)',
                transition: '.18s ease',
                pointerEvents: 'none'
            });
            document.documentElement.appendChild(el);
        }
        el.textContent = message;
        el.style.background = error ? 'rgba(175,45,45,.96)' : 'rgba(29,29,31,.94)';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(8px)';
        }, 1500);
    }

    function executeAction(actionName) {
        const adapter = adapterForActionName(actionName);
        if (!adapter) return false;

        const el = findButtonByLabels(adapter.labels);
        if (!el) {
            showToast(`‘${adapter.names[0]}’ 버튼 없음`, true);
            return true;
        }

        showToast(`▶ ${elementText(el)}`);
        try {
            el.click();
        } catch (error) {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }
        log('action', actionName, el);
        return true;
    }

    function contextChain(state, contextId) {
        const out = [];
        const seen = new Set();
        let current = state.contexts?.find(c => c.id === contextId) || state.contexts?.find(c => c.id === 'global');

        while (current && !seen.has(current.id)) {
            out.push(current);
            seen.add(current.id);
            current = current.parentId ? state.contexts.find(c => c.id === current.parentId) : null;
        }

        const global = state.contexts?.find(c => c.id === 'global');
        if (global && !out.some(c => c.id === 'global')) out.push(global);
        return out;
    }

    function findCurrentContext(state) {
        const contexts = state?.contexts || [];

        const byHint = contexts.find(c => norm(c.name) === norm(CONTEXT_HINT));
        if (byHint) return byHint.id;

        const host = location.hostname.toLowerCase();
        const siteMatches = contexts
            .filter(c => c.type === 'site' && c.match?.domain)
            .filter(c => {
                const domain = String(c.match.domain).toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^\./, '');
                return host === domain || host.endsWith(`.${domain}`);
            })
            .sort((a, b) => String(b.match.domain).length - String(a.match.domain).length);

        return siteMatches[0]?.id || 'global';
    }

    function sourceIsTampermonkey(state, binding) {
        const source = state.sources?.find(s => s.id === binding.sourceId);
        return String(source?.type || '').toLowerCase() === 'tampermonkey';
    }

    function buildEffectiveBindingMap(state) {
        const contextId = findCurrentContext(state);
        contextIdCache = contextId;

        const actionById = new Map((state.actions || []).map(a => [a.id, a]));
        const chain = contextChain(state, contextId);
        const result = new Map();

        for (const context of chain) {
            const direct = (state.bindings || []).filter(binding =>
                binding.contextId === context.id &&
                ['keyboard', 'v21-l2'].includes(binding.trigger?.type)
            );

            const groups = new Map();
            for (const binding of direct) {
                const value = canonicalTrigger(binding.trigger?.value || '');
                if (!value) continue;
                const key = `${binding.trigger.type}:${value}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(binding);
            }

            for (const [key, bindings] of groups.entries()) {
                if (result.has(key)) continue;
                if (bindings.length !== 1) {
                    result.set(key, { conflict: true });
                    continue;
                }

                const binding = bindings[0];
                const action = actionById.get(binding.actionId);
                if (!action || !adapterForActionName(action.name)) continue;
                if (!sourceIsTampermonkey(state, binding)) continue;

                result.set(key, {
                    binding,
                    action,
                    context,
                    conflict: false
                });
            }
        }

        return result;
    }

    function bindingForEvent(event) {
        const trigger = eventTrigger(event);
        if (!trigger) return null;

        // F13-F24 are treated as V21 Layer 2 signals first.
        if (/^F(?:1[3-9]|2[0-4])$/.test(trigger)) {
            const l2 = effectiveBindings.get(`v21-l2:${trigger}`);
            if (l2 && !l2.conflict) return { ...l2, trigger };
        }

        const keyboard = effectiveBindings.get(`keyboard:${trigger}`);
        if (keyboard && !keyboard.conflict) return { ...keyboard, trigger };
        return null;
    }

    function currentRuntime() {
        return {
            adapterId: 'kriss-ipms-popup',
            url: location.href,
            host: location.hostname,
            title: document.title,
            contextHint: CONTEXT_HINT,
            contextId: contextIdCache,
            availableActions: availableActionNames(),
            updatedAt: new Date().toISOString()
        };
    }

    async function publishRuntime() {
        runtimeCache = currentRuntime();
        try { await postJson('/site-runtime', runtimeCache); } catch {}
        sendToPanel({ type: 'v21-compact-runtime', runtime: runtimeCache });
    }

    async function refreshState({ quiet = true } = {}) {
        try {
            const state = await getJson('/studio-state');
            if (!state || !Array.isArray(state.contexts)) throw new Error('No Studio state');
            stateCache = state;
            contextIdCache = findCurrentContext(state);
            effectiveBindings = buildEffectiveBindingMap(state);
            await publishRuntime();
            sendStateToPanel();
            return true;
        } catch (error) {
            if (!quiet) showToast('V21 Companion / Studio data를 찾지 못했습니다.', true);
            log(error);
            return false;
        }
    }

    function addBadge() {
        const badge = document.createElement('button');
        badge.id = 'v21-ipms-badge';
        badge.type = 'button';
        badge.textContent = 'V21';
        badge.title = `${PANEL_HOTKEY} · Quick Panel`;
        Object.assign(badge.style, {
            position: 'fixed',
            left: '8px',
            bottom: '8px',
            zIndex: '2147483645',
            height: '26px',
            minWidth: '42px',
            padding: '0 9px',
            border: '1px solid rgba(255,255,255,.16)',
            borderRadius: '999px',
            color: '#f5f5f7',
            background: 'rgba(28,28,31,.88)',
            boxShadow: '0 6px 22px rgba(0,0,0,.16)',
            backdropFilter: 'blur(12px)',
            cursor: 'pointer',
            font: '650 10px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
            letterSpacing: '.02em'
        });
        badge.addEventListener('click', () => togglePanel());
        document.documentElement.appendChild(badge);
    }

    function buildPanelShell() {
        if (panelWrap) return;

        panelWrap = document.createElement('div');
        panelWrap.id = 'v21-quick-panel-wrap';
        Object.assign(panelWrap.style, {
            position: 'fixed',
            right: '18px',
            top: '50%',
            transform: 'translateY(-50%) translateX(18px)',
            zIndex: '2147483646',
            width: '380px',
            maxWidth: 'calc(100vw - 28px)',
            height: '690px',
            maxHeight: 'calc(100vh - 28px)',
            opacity: '0',
            pointerEvents: 'none',
            transition: 'opacity .18s ease, transform .2s cubic-bezier(.2,.8,.2,1)',
            filter: 'drop-shadow(0 28px 60px rgba(0,0,0,.38))'
        });

        panelFrame = document.createElement('iframe');
        panelFrame.id = 'v21-quick-panel-frame';
        panelFrame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
        panelFrame.setAttribute('title', 'V21 Quick Panel');
        Object.assign(panelFrame.style, {
            width: '100%',
            height: '100%',
            border: '0',
            borderRadius: '20px',
            overflow: 'hidden',
            background: '#0b0b0d'
        });

        panelWrap.appendChild(panelFrame);
        document.documentElement.appendChild(panelWrap);
    }

    async function loadCompactHtml() {
        if (panelHtmlCache) return panelHtmlCache;

        const response = await gmRequest('GET', `${COMPANION}/`);
        if (response.status < 200 || response.status >= 300) throw new Error(`Studio HTTP ${response.status}`);

        let text = response.responseText || '';
        // srcdoc has no ?compact=1 URL, so inject the flag before Studio's own script starts.
        text = text.replace(
            '<head>',
            '<head><script>window.__V21_COMPACT__=true;<\\/script>'
        );
        panelHtmlCache = text;
        return text;
    }

    async function ensurePanelLoaded() {
        buildPanelShell();
        if (panelReady) return true;

        try {
            await refreshState({ quiet: false });
            const html = await loadCompactHtml();

            panelFrame.onload = () => {
                panelReady = true;
                sendStateToPanel();
                publishRuntime();
            };
            panelFrame.srcdoc = html;
            return true;
        } catch (error) {
            showToast('Quick Panel을 열려면 V21 Companion을 먼저 실행하세요.', true);
            log(error);
            return false;
        }
    }

    async function togglePanel(force) {
        const open = force === undefined
            ? !(panelWrap && panelWrap.dataset.open === '1')
            : !!force;

        if (open) {
            if (!(await ensurePanelLoaded())) return;
            panelWrap.dataset.open = '1';
            panelWrap.style.opacity = '1';
            panelWrap.style.transform = 'translateY(-50%) translateX(0)';
            panelWrap.style.pointerEvents = 'auto';
            await refreshState();
            sendStateToPanel();
        } else if (panelWrap) {
            panelWrap.dataset.open = '0';
            panelWrap.style.opacity = '0';
            panelWrap.style.transform = 'translateY(-50%) translateX(18px)';
            panelWrap.style.pointerEvents = 'none';
        }
    }

    function sendToPanel(message) {
        try { panelFrame?.contentWindow?.postMessage(message, '*'); } catch {}
    }

    function sendStateToPanel() {
        if (!stateCache) return;
        sendToPanel({
            type: 'v21-compact-state',
            state: stateCache,
            runtime: runtimeCache
        });
    }

    window.addEventListener('message', async event => {
        if (!panelFrame || event.source !== panelFrame.contentWindow) return;
        const data = event.data || {};

        if (data.type === 'v21-compact-request-state') {
            if (!stateCache) await refreshState();
            sendStateToPanel();
            return;
        }

        if (data.type === 'v21-compact-save-state' && data.state) {
            try {
                stateCache = data.state;
                await postJson('/studio-state', stateCache);
                contextIdCache = findCurrentContext(stateCache);
                effectiveBindings = buildEffectiveBindingMap(stateCache);
                await publishRuntime();
                sendStateToPanel();
                showToast('Studio saved');
            } catch {
                showToast('Studio 저장 실패', true);
            }
            return;
        }

        if (data.type === 'v21-compact-close') {
            togglePanel(false);
            return;
        }

        if (data.type === 'v21-compact-open-full') {
            GM_openInTab(`${COMPANION}/`, { active: true, insert: true });
        }
    });

    document.addEventListener('keydown', event => {
        if (!enabled) return;

        const trigger = eventTrigger(event);

        if (trigger === EMERGENCY_HOTKEY) {
            event.preventDefault();
            event.stopPropagation();
            enabled = false;
            togglePanel(false);
            document.getElementById('v21-ipms-badge')?.remove();
            showToast('KRISS IPMS V21 Adapter 해제됨');
            return;
        }

        if (trigger === PANEL_HOTKEY) {
            event.preventDefault();
            event.stopPropagation();
            togglePanel();
            return;
        }

        if (event.repeat) return;
        const match = bindingForEvent(event);
        if (!match) return;

        event.preventDefault();
        event.stopPropagation();

        const handled = executeAction(match.action.name);
        if (handled) {
            sendToPanel({
                type: 'v21-runtime-trigger',
                trigger: match.trigger,
                actionName: match.action.name
            });
        }
    }, true);

    // The page can change which buttons are visible without navigation.
    const observer = new MutationObserver(() => {
        clearTimeout(observerTimer);
        observerTimer = setTimeout(() => publishRuntime(), 180);
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'disabled', 'hidden']
    });

    addBadge();
    refreshState();
    refreshTimer = setInterval(() => refreshState(), 3000);
    window.addEventListener('focus', () => refreshState());
    window.addEventListener('beforeunload', () => {
        clearInterval(refreshTimer);
        observer.disconnect();
    });

    log('loaded · Studio-driven bindings · Alt+/ Quick Panel');
})();
