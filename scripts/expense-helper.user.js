// ==UserScript==
// @name         [KRISS] 지출발의 도우미
// @namespace    kriss-expense-helper
// @version      0.2.1
// @description  AI 구독료 / 기본사업 회의비 / 수탁사업 사전회의 및 지출발의 보조. v0.2.1: 거래처 Enter 선택 및 연도/부서장 변경용 설정 추가.
// @match        https://krisstar.kriss.re.kr/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  // v0.2.1
  // - v0.2.0에서 0.0.1 단위로 증가
  // - AI/기본사업: 신용카드(클린및연구비집행), 수탁사업: 신용카드(연구)
  // - 카드조회 사용자는 설정의 '부서장 이름+사번'을 함께 사용
  // - 참석자 팝업의 카드사용자는 지출발의자 본인으로 지정
  // - 카드조회 후보 행 Enter 선택 지원
  // - 거래처조회는 AI 키워드(예: OPENAI/CHATGPT)를 우선, 없으면 첫 사용가능 행을 선택해 두고 Enter로 [선택]
  // - 연도별 기본사업/수탁 예산코드와 부서장 변경은 API 자동연계 대신 [설정]에서 1회 수정해 GM 저장
  // - AI 서비스명/거래처 키워드도 설정 가능(향후 Claude 등 대응)
  // - 정상 안내 모달/토스트는 표시하지 않고 오류만 안내
  // - 카드/거래처/참석자/회의록 준비가 끝나면 지출발의 [행추가] 자동 클릭
  // - 최종 BPM 저장/승인은 자동 실행하지 않음

  const VERSION = '0.2.1';
  const pageWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const $ = () => pageWindow.jQuery || window.jQuery;

  const KEY_DRAFT = 'krissExpenseHelperDraftV0001';
  const KEY_PANEL_COLLAPSED = 'krissExpenseHelperPanelCollapsedV0001';
  const KEY_SETTINGS = 'krissExpenseHelperSettingsV0001';
  const OLD_KEY_DRAFT = 'krissExpenseHelperDraftV0101';
  const OLD_KEY_PANEL_COLLAPSED = 'krissExpenseHelperPanelCollapsedV0101';
  const MAIN_EXPENSE_PATH = '/mis/acc/popup/S_ACC_01020100.do';
  const MAIN_EXPENSE_READ_PATH = '/mis/acc/popup/S_ACC_01020101.do';
  const PMS_NEW_PATH = '/pms/kno/seminar/S_PMS_02040400_01.do';
  const PMS_VIEW_PATH = '/pms/kno/seminar/S_PMS_02040400.do';
  const PMS_SELECT_PATH = '/mis/kno/seminaMgmt/PmsMenuMapping/S_PMS_02040401.do';
  const AI_CERT_PATH = '/mis/acc/popup/S_ACC_01020100_P12.do';
  const ATTD_POPUP_PATH = '/mis/acc/popup/S_ACC_01020100_P03.do';
  const MEETING_POPUP_PATH = '/mis/acc/popup/S_ACC_01020100_P04.do';
  const EXPENSE_LIST_API = '/mis/acc/expndtrMng/expndtrResol/selectExpsMangPayout.json';
  const PMS_LIST_API = '/pms/kno/seminar/listWorkshpRqst.json';
  const ACT_CARD_PATH = '/mis/com/popup/actCardPopup.do';

  const EXPENSE_NEW_BPM = Object.freeze({
    bizKey: '',
    workFlag: 'newWork',
    processCode: 'B_ACT00002',
    statusCode: 'ST0100',
    subFlag: 'N',
  });
  const PMS_NEW_BPM = Object.freeze({
    bizKey: '',
    workFlag: 'newWork',
    processCode: 'S_PMS_02040400',
    statusCode: 'ST0100',
  });

  const CARD_KIND = Object.freeze({
    CORPORATE: '1', // 법인카드(클린및연구비집행전용) / 메인화면: 신용카드(클린및연구비집행)
    RESEARCH: '2',  // 연구비카드 / 메인화면: 신용카드(연구)
  });

  function cardKindForDraft(draft) {
    return draft?.kind === 'trust_expense' ? CARD_KIND.RESEARCH : CARD_KIND.CORPORATE;
  }

  function cardKindLabel(kind) {
    return String(kind) === CARD_KIND.RESEARCH ? '신용카드(연구)' : '신용카드(클린및연구비집행)';
  }

  const DEFAULT_SETTINGS = Object.freeze({
    deptHead: { empNm: '한성', empNo: '00977' },
    basicBudget: {
      budgetCode: '26011077',
      budgetName: '4-1-03. 연구성과 기술사업화 (기술사업화그룹)',
    },
    aiExpense: { expenseCode: '55367', expenseName: '사무기기 및 소프트웨어' },
    meetingExpense: { expenseCode: '55352', expenseName: '회의비' },
    trustBudget: {
      budgetCode: '26632004',
      budgetName: '공공 IP 사업화 자립 지원 사업',
    },
    ai: {
      serviceName: 'ChatGPT',
      merchantHints: 'OPENAI,CHATGPT',
    },
  });

  let SETTINGS = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  let DEPT_HEAD = {...SETTINGS.deptHead};
  let BUDGETS = {};

  function applyRuntimeSettings(input) {
    const saved = input && typeof input === 'object' ? input : {};
    SETTINGS = {
      deptHead: {...DEFAULT_SETTINGS.deptHead, ...(saved.deptHead || {})},
      basicBudget: {...DEFAULT_SETTINGS.basicBudget, ...(saved.basicBudget || {})},
      aiExpense: {...DEFAULT_SETTINGS.aiExpense, ...(saved.aiExpense || {})},
      meetingExpense: {...DEFAULT_SETTINGS.meetingExpense, ...(saved.meetingExpense || {})},
      trustBudget: {...DEFAULT_SETTINGS.trustBudget, ...(saved.trustBudget || {})},
      ai: {...DEFAULT_SETTINGS.ai, ...(saved.ai || {})},
    };
    DEPT_HEAD = {...SETTINGS.deptHead};
    BUDGETS = {
      ai: {...SETTINGS.basicBudget, ...SETTINGS.aiExpense},
      basicMeeting: {...SETTINGS.basicBudget, ...SETTINGS.meetingExpense},
      trustMeeting: {...SETTINGS.trustBudget, ...SETTINGS.meetingExpense},
    };
  }

  async function loadRuntimeSettings() {
    const saved = await GM.getValue(KEY_SETTINGS, null);
    applyRuntimeSettings(saved);
    return SETTINGS;
  }

  async function persistRuntimeSettings(next) {
    applyRuntimeSettings(next);
    await GM.setValue(KEY_SETTINGS, SETTINGS);
    return SETTINGS;
  }

  function merchantHintsForDraft(draft) {
    const raw = draft?.merchantHints || draft?.merchantHint || SETTINGS.ai.merchantHints || '';
    const list = Array.isArray(raw) ? raw : String(raw).split(/[,|\n]/g);
    return list.map(x => String(x || '').trim().toUpperCase()).filter(Boolean);
  }

  function containsMerchantHint(text, hints) {
    const hay = String(text || '').toUpperCase();
    return (hints || []).some(h => h && hay.includes(h));
  }

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
  const amount = (v) => Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')) || 0;
  const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');

  function localYmd(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function compactYmd(d = new Date()) { return localYmd(d).replace(/-/g, ''); }
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

  async function waitFor(fn, timeout = 15000, interval = 100, label = '조건') {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const out = fn();
        if (out) return out;
      } catch (_) {}
      await sleep(interval);
    }
    throw new Error(`${label} 대기 시간 초과`);
  }

  async function getDraft() {
    const d = await GM.getValue(KEY_DRAFT, null);
    return d && typeof d === 'object' ? d : null;
  }
  async function setDraft(draft) { await GM.setValue(KEY_DRAFT, draft); return draft; }
  async function clearDraft() { await GM.deleteValue(KEY_DRAFT); }

  function toast(text, error = false, ms = 3600) {
    // v0.1.4: 정상 진행 '안내 모달/토스트'는 표시하지 않는다.
    // 실제 자동화 중단/오류만 화면 우측 상단에 표시한다.
    if (!error) return;
    let el = document.getElementById('keh-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'keh-toast';
      el.style.cssText = 'position:fixed;right:18px;top:18px;z-index:2147483647;max-width:520px;padding:10px 14px;border-radius:9px;background:#222;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Malgun Gothic",sans-serif;opacity:0;transition:opacity .15s;white-space:pre-wrap';
      document.body.appendChild(el);
    }
    el.style.background = error ? '#a32d2d' : '#222';
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(el.__hideTimer);
    el.__hideTimer = setTimeout(() => { el.style.opacity = '0'; }, ms);
  }

  function jq() {
    const j = $();
    if (!j) throw new Error('포털 jQuery가 준비되지 않았습니다.');
    return j;
  }

  function setPlain(selector, value) {
    const j = jq();
    const el = document.querySelector(selector);
    if (!el) throw new Error(`요소 없음: ${selector}`);
    try {
      if (typeof j(el).kval === 'function') j(el).kval(value == null ? '' : String(value));
      else j(el).val(value == null ? '' : String(value));
    } catch (_) { el.value = value == null ? '' : String(value); }
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
    return el;
  }

  function setNumeric(selector, value) {
    const j = jq();
    const el = j(selector);
    if (!el.length) throw new Error(`숫자 입력 없음: ${selector}`);
    const widget = el.data('kendoNumericTextBox');
    if (widget) { widget.value(Number(value || 0)); widget.trigger('change'); }
    else if (typeof el.kval === 'function') el.kval(String(value || 0));
    else el.val(String(value || 0)).trigger('change');
  }

  function setDropdownValue(selector, value, triggerChange = true) {
    const j = jq();
    const el = j(selector);
    if (!el.length) throw new Error(`드롭다운 없음: ${selector}`);
    const widget = el.data('kendoDropDownList');
    if (widget) widget.value(String(value));
    else if (typeof el.kval === 'function') el.kval(String(value));
    else el.val(String(value));
    if (triggerChange) el.trigger('change');
  }

  async function selectDropdownLikeUser(selector, value) {
    const j = jq();
    const widget = await waitFor(() => j(selector).data('kendoDropDownList'), 15000, 100, `${selector} 드롭다운`);
    await waitFor(() => {
      const d = widget.dataSource?.data?.();
      return d && d.length ? d : null;
    }, 15000, 100, `${selector} 데이터`);
    const data = Array.from(widget.dataSource.data());
    const target = String(value);
    const idx = data.findIndex(x => String(x.id ?? x.value ?? x.v ?? '') === target);
    if (idx < 0) throw new Error(`${selector}에서 값 ${target}을 찾지 못했습니다.`);
    try {
      const item = widget.ul?.children?.().eq(idx);
      if (item && item.length) widget.trigger('select', {item});
    } catch (_) {}
    widget.value(target);
    j(selector).trigger('change');
  }

  function formPostToWindow(path, params, prefix) {
    const target = `${prefix || 'keh'}_${Date.now()}`;
    const popup = pageWindow.open('about:blank', target, 'width=1700,height=960,resizable=yes,scrollbars=yes');
    if (!popup) throw new Error('팝업이 차단되었습니다. krisstar.kriss.re.kr 팝업을 허용해주세요.');
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${location.origin}${path}?popupAt=popup`;
    form.target = target;
    form.style.display = 'none';
    Object.entries(params || {}).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = name; input.value = value == null ? '' : String(value);
      form.appendChild(input);
    });
    document.body.appendChild(form);
    try { form.submit(); } finally { form.remove(); }
    return popup;
  }

  function openBpm(path, params, prefix) {
    const j = $();
    if (j && typeof j.postWindow === 'function') {
      try {
        j.postWindow(`${path}?popupAt=popup`, {
          width: 1700, height: 960, modalDialog: false, center: 'screen', scrollbars: true, resizable: true,
          dataSource: Object.entries(params).map(([name, value]) => ({name, value})),
        });
        return;
      } catch (e) { console.warn('[KEH] $.postWindow 실패, raw POST 사용', e); }
    }
    formPostToWindow(path, params, prefix);
  }

  function isVisible(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    const st = getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity || 1) !== 0;
  }

  function armConfirmDialog(textRegex, timeout = 12000) {
    const deadline = Date.now() + timeout;
    const tick = () => {
      const dialogs = Array.from(document.querySelectorAll('.k-window-content,[role="dialog"],.k-dialog')).filter(isVisible);
      for (const dlg of dialogs) {
        const txt = norm(dlg.textContent);
        if (!textRegex.test(txt)) continue;
        const controls = Array.from(dlg.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"]')).filter(isVisible);
        const ok = controls.find(x => /^(확인|예|Yes)$/i.test(norm(x.value || x.textContent)));
        if (ok) { ok.click(); return; }
      }
      if (Date.now() < deadline) setTimeout(tick, 70);
    };
    setTimeout(tick, 50);
  }

  function suppressNextKrissAlert(textRegex, timeout = 5000) {
    // 포털의 단순 안내 alert을 실제 창으로 띄우지 않고 .done() 후속 로직만 정상 실행한다.
    // 오류/검증 alert은 건드리지 않는다.
    let j;
    try { j = jq(); } catch (_) { return () => {}; }
    const kr = j.kriss;
    if (!kr || typeof kr.alert !== 'function') return () => {};
    const original = kr.alert;
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      if (kr.alert === wrapped) kr.alert = original;
    };
    const wrapped = function(content, ...args) {
      const text = norm(typeof content === 'string' ? content : (content?.content || content?.message || ''));
      if (textRegex.test(text)) {
        restore();
        if (typeof j.Deferred === 'function') {
          const d = j.Deferred();
          setTimeout(() => d.resolve(true), 0);
          return d.promise();
        }
        return {
          done(fn) { if (typeof fn === 'function') setTimeout(() => fn(true), 0); return this; },
          fail() { return this; }, always(fn) { if (typeof fn === 'function') setTimeout(fn, 0); return this; }
        };
      }
      return original.apply(this, [content, ...args]);
    };
    kr.alert = wrapped;
    setTimeout(restore, timeout);
    return restore;
  }

  function portalPost(url, data) {
    return new Promise((resolve, reject) => {
      if (!pageWindow.kriss?.ajax?.post) return reject(new Error('포털 AJAX가 준비되지 않았습니다.'));
      try {
        // KRISS 공통 ajax.post의 실제 사용형식: (url, data, success, loadingSelector)
        pageWindow.kriss.ajax.post(url, data, function (res) {
          if (res && (res.errorCode === 0 || res.errorCode === '0' || res.errorCode == null)) resolve(res.data ?? res);
          else reject(new Error(res?.errorMessage || `요청 실패: ${url}`));
        }, '#con_center');
      } catch (e) { reject(e); }
    });
  }

  async function genericGridQuery(url, postData, fields) {
    await waitFor(() => pageWindow.kriss?.ui?.grid, 15000, 100, 'kriss.ui.grid');
    await waitFor(() => $(), 15000, 100, 'jQuery');
    const j = jq();
    const id = `keh-grid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const host = document.createElement('div');
    host.id = id;
    host.style.cssText = 'position:fixed;left:-12000px;top:0;width:20px;height:20px;opacity:0;pointer-events:none;overflow:hidden;z-index:-1';
    document.body.appendChild(host);
    return new Promise((resolve, reject) => {
      let grid = null, started = false, done = false;
      const finish = (ok, val) => {
        if (done) return; done = true; clearTimeout(timer);
        try { const kg = j(host).data('kendoGrid'); if (kg?.destroy) kg.destroy(); } catch (_) {}
        setTimeout(() => host.remove(), 0);
        ok ? resolve(val) : reject(val instanceof Error ? val : new Error(String(val)));
      };
      const timer = setTimeout(() => finish(false, new Error(`목록 조회 시간 초과: ${url}`)), 25000);
      try {
        const modelFields = {};
        (fields || []).forEach(f => { modelFields[f] = {type: ['amt','totalAmt','drAmt'].includes(f) ? 'number' : 'string'}; });
        grid = new pageWindow.kriss.ui.grid({
          selector: `#${id}`,
          url,
          postDataFunc: () => ({...(postData || {})}),
          pageable: false,
          autoBind: false,
          editable: false,
          sortable: false,
          filterable: false,
          height: 20,
          schema: {model: {fields: modelFields}},
          columns: [{field: (fields || [])[0] || 'rqstNo', title: 'x', width: 30}],
          dataBound: function (e) {
            if (!started) return;
            try {
              const rows = grid?.getData ? grid.getData() : (e?.sender?.dataSource?.data?.() || []);
              finish(true, Array.from(rows || []).map(x => typeof x.toJSON === 'function' ? x.toJSON() : {...x}));
            } catch (err) { finish(false, err); }
          },
        });
        setTimeout(() => { started = true; grid.reload(); }, 0);
      } catch (e) { finish(false, e); }
    });
  }

  function currentPortalUser() {
    let empNo = norm(document.querySelector('#rqstEmp,#userId,#regEmpNo')?.value || '');
    const empNm = norm(document.querySelector('#rqstEmpNm,#userNm,#regEmpNm')?.value || document.querySelector('.my_info .user')?.textContent || '').split(' ')[0];
    if (!empNo) {
      const img = document.querySelector('.my_info img[src*="filename="]');
      if (img) {
        try {
          const filename = new URL(img.src, location.href).searchParams.get('filename') || '';
          empNo = filename.replace(/\.[^.]+$/, '').trim();
        } catch (_) {}
      }
    }
    return {empNo, empNm};
  }

  function proposerFromDraft(draft) {
    const p = draft?.proposer || {};
    return {
      empNo: norm(p.empNo), empNm: norm(p.empNm),
      deptCd: norm(p.deptCd), deptNm: norm(p.deptNm)
    };
  }

  async function captureExpenseProposer(draft) {
    if (!draft || !document.querySelector('#rqstEmp')) return draft;
    const p = {
      empNo: norm(document.querySelector('#rqstEmp')?.value),
      empNm: norm(document.querySelector('#rqstEmpNm')?.value),
      deptCd: norm(document.querySelector('input[name="rqstDept"],#rqstDept')?.value),
      deptNm: norm(document.querySelector('input[name="rqstDeptNm"],#rqstDeptNm')?.value),
    };
    if (p.empNo && p.empNm) {
      draft.proposer = p;
      await setDraft(draft);
    }
    return draft;
  }

  async function resolveEmployeeForAttendee(identity, popupForm) {
    const empNo = norm(identity?.empNo);
    const empNm = norm(identity?.empNm);
    if (empNo) {
      try {
        const req = {
          empNo, empNm,
          vatDt: digits((popupForm || {}).vatDt),
          budgCd: (popupForm || {}).budgCd || '',
          budgYy: (popupForm || {}).budgYy || '',
          busiCls: (popupForm || {}).busiCls || '',
          acctCd: (popupForm || {}).acctCd || '',
        };
        const data = await portalPost('/mis/acc/getEmpAttdListData.json', [req]);
        const arr = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.list) ? data.list : [];
        if (arr.length) return {...identity, ...arr[0]};
      } catch (_) {}
    }
    if (!empNm) throw new Error('지출발의자 정보를 확인하지 못했습니다.');
    let emp = await resolveEmployeeByName(empNm);
    emp = await enrichAttendee(emp, popupForm || {});
    return {...identity, ...emp};
  }

  async function setBudgetAndExpense(profile) {
    const j = jq();
    await waitFor(() => document.querySelector('#budgCd') && document.querySelector('#acctCd'), 15000, 100, '예산/비목 입력');
    setPlain('#budgCd', profile.budgetCode);
    j('#budgCd').trigger('change');
    await waitFor(() => norm(document.querySelector('#budgNm')?.value), 18000, 150, `예산 ${profile.budgetCode}`);
    setPlain('#acctCd', profile.expenseCode);
    j('#acctCd').trigger('change');
    await waitFor(() => norm(document.querySelector('#acctNm')?.value), 18000, 150, `비목 ${profile.expenseCode}`);
  }

  async function waitForAjaxIdle(timeout = 15000, quietMs = 450) {
    const j = jq();
    const start = Date.now();
    let quietStart = null;
    while (Date.now() - start < timeout) {
      const active = Number(j.active || 0);
      if (active === 0) {
        if (quietStart == null) quietStart = Date.now();
        if (Date.now() - quietStart >= quietMs) return;
      } else {
        quietStart = null;
      }
      await sleep(80);
    }
    // 포털의 일부 kriss.ajax 구현이 $.active에 잡히지 않을 수 있으므로
    // 타임아웃 자체를 치명 오류로 만들지는 않고 마지막 안정화 시간을 둔다.
    await sleep(500);
  }

  async function setExpenseDocuType(code) {
    const j = jq();
    const target = String(code);
    const el = j('#docuType');
    const widget = await waitFor(() => el.data('kendoDropDownList'), 15000, 100, '지출구분');

    // 화면 생성 직후에는 빈 Kendo DropDownList가 먼저 만들어지고,
    // selectExpndtrCodeList.json 응답 후 같은 요소가 다시 채워진다.
    // 따라서 "위젯 존재"만 보고 값을 넣으면 실제 지출구분이 선택되지 않을 수 있다.
    await waitFor(() => {
      const w = el.data('kendoDropDownList');
      const data = w?.dataSource?.data?.();
      if (!data || !data.length) return false;
      return Array.from(data).some(x => String(x.id ?? x.value ?? x.v ?? '') === target) ? w : false;
    }, 20000, 100, `지출구분 ${target} 목록`);

    const w = el.data('kendoDropDownList');
    w.value(target);
    // 포털 change 핸들러가 this.value를 직접 읽으므로 원본 input 값도 명시적으로 맞춘다.
    el.val(target);
    el.trigger('change');

    await waitFor(() => String(el.val() || '') === target && String(w.value() || '') === target,
      5000, 80, `지출구분 ${target} 선택`);

    // 지출구분 change → publish → AccInfoComponent에서 예산/비목 초기화 →
    // getAcctValues.json 비동기 호출이 끝난 뒤에만 자동 예산을 입력해야 한다.
    await waitForAjaxIdle(15000, 500);
    await sleep(250);
  }

  function assertExpenseDocuType(code) {
    const actual = String(jq()('#docuType').val() || jq()('#docuType').data('kendoDropDownList')?.value?.() || '');
    if (actual !== String(code)) {
      throw new Error(`지출구분 자동선택 실패: 기대값 ${code}, 현재값 ${actual || '(미선택)'}. 예산 입력을 중단합니다.`);
    }
  }

  function parseInternalNames(text) {
    return Array.from(new Set(String(text || '').split(/[\n,;]/).map(norm).filter(Boolean)));
  }

  function parseExternalRows(text) {
    const rows = [];
    for (const raw of String(text || '').split(/\n+/)) {
      const line = raw.trim(); if (!line) continue;
      const p = line.split('|').map(x => x.trim());
      rows.push({empNm: p[0] || '', compNm: p[1] || '', deptNm: p[2] || '', flocNm: p[3] || ''});
    }
    return rows;
  }

  async function resolveEmployeeByName(name) {
    const data = await portalPost('/mis/hrm/selectEmpNm.json', {nm: name});
    const arr = Array.isArray(data) ? data : [];
    if (arr.length !== 1) throw new Error(`내부 참석자 '${name}' 검색 결과가 ${arr.length}건입니다. 해당 인원은 팝업에서 직접 확인해주세요.`);
    return arr[0];
  }

  async function enrichAttendee(emp, popupForm) {
    try {
      const base = {...(popupForm || {}), empNo: emp.empNo, vatDt: digits((popupForm || {}).vatDt)};
      const info = await portalPost('/mis/acc/getEmpAttdData.json', base);
      return {...emp, ...(info || {})};
    } catch (_) { return emp; }
  }

  function clearKrissGrid(grid) {
    if (!grid?.getData) return;
    for (let i = grid.getData().length - 1; i >= 0; i--) {
      try { grid.removeRow(i); } catch (_) {
        try { grid.dataSource.remove(grid.getData()[i]); } catch (_) {}
      }
    }
    try { grid.refresh(); } catch (_) {}
  }

  async function fillAttendeePopup(draft) {
    const j = jq();
    const g1 = await waitFor(() => pageWindow.dataGrid1, 15000, 100, '내부 참석자 그리드');
    const g2 = await waitFor(() => pageWindow.dataGrid2, 15000, 100, '외부 참석자 그리드');
    await sleep(350);

    const proposer = proposerFromDraft(draft);
    // 카드조회 화면의 '사용자'는 부서장 카드 조회용이다.
    // 참석자 팝업의 카드사용자 체크는 지출발의자 본인에게 둔다.
    // AI는 별도 회의 참석자가 없으므로 지출발의자 본인을 내부 참석자로 등록한다.
    let internalIdentities;
    if (draft.kind === 'ai') {
      if (!proposer.empNo || !proposer.empNm) throw new Error('AI 참석자에 넣을 지출발의자 정보를 확인하지 못했습니다.');
      internalIdentities = [proposer];
    } else {
      internalIdentities = (draft.internalNames || []).map(name => {
        const n = norm(name);
        return proposer.empNm && n === proposer.empNm ? proposer : {empNm:n};
      });
    }
    const external = draft.externalRows || [];
    if (!internalIdentities.length && !external.length) return;

    clearKrissGrid(g1); clearKrissGrid(g2);
    const form = typeof j('form[name="billDtstmnForm"]').serializeObject === 'function'
      ? j('form[name="billDtstmnForm"]').serializeObject() : {};
    let seq = 0;
    const unresolved = [];
    const resolved = [];
    for (const identity of internalIdentities) {
      try {
        const emp = await resolveEmployeeForAttendee(identity, form);
        resolved.push(emp);
      } catch (e) { unresolved.push(e.message); }
    }

    let proposerMatched = false;
    resolved.forEach((emp, idx) => {
      seq++;
      const isProposer = proposer.empNo && String(emp.empNo || '') === proposer.empNo;
      if (isProposer) proposerMatched = true;
      const row = {
        attdSeq: seq, seq: idx + 1,
        empNo: emp.empNo || '', empNm: emp.empNm || '', deptNm: emp.deptNm || proposer.deptNm || '', deptCd: emp.deptCd || proposer.deptCd || '',
        flocNm: emp.flocNm || '', flocCd: emp.flocCd || '',
        tripYn: emp.tripYn || '', vacYn: emp.vacYn || '', partiYn: emp.partiYn || '', partiEmpYn: emp.partiEmpYn || '',
        cardUser: !!isProposer,
      };
      try { g1.addRow(row, g1.getData().length); } catch (_) { g1.addData(row); }
    });
    external.forEach((out, idx) => {
      seq++;
      const row = {attdSeq: seq, seq: idx + 1, empNm: out.empNm, compNm: out.compNm, deptNm: out.deptNm || '', flocNm: out.flocNm || ''};
      try { g2.addRow(row, g2.getData().length); } catch (_) { g2.addData(row); }
    });
    try { g1.refresh(); g2.refresh(); } catch (_) {}

    if (unresolved.length) {
      toast(`일부 내부 참석자를 자동 확정하지 못했습니다.\n${unresolved.join('\n')}\n팝업에서 확인 후 [저장]을 눌러주세요.`, true, 10000);
      return;
    }
    if (proposer.empNo && !proposerMatched) {
      toast(`지출발의자 ${proposer.empNm}(${proposer.empNo})가 내부 참석자 목록에 없습니다.\n카드사용자 체크 대상을 확인한 뒤 [저장]해주세요.`, true, 12000);
      return;
    }
    if (external.some(x => !x.empNm || !x.compNm)) {
      toast('외부 참석자의 이름/회사명이 비어 있습니다. 팝업에서 보완 후 [저장]을 눌러주세요.', true, 9000);
      return;
    }
    document.querySelector('#btnSave')?.click();
  }

  async function fixExistingAttendeeCardUser(draft) {
    const g1 = await waitFor(() => pageWindow.dataGrid1, 15000, 100, '내부 참석자 그리드');
    await sleep(350);
    const proposer = proposerFromDraft(draft);
    if (!proposer.empNo) throw new Error('지출발의자 사번을 확인하지 못했습니다.');
    const rows = Array.from(g1.getData?.() || []);
    let found = false;
    rows.forEach(row => {
      row.cardUser = String(row.empNo || '') === proposer.empNo;
      if (row.cardUser) found = true;
    });
    try { g1.refresh(); } catch (_) {}
    if (!found) {
      toast(`지출발의자 ${proposer.empNm}(${proposer.empNo})가 사전신청 내부 참석자에 없습니다.\n카드사용자 체크 대상을 확인해주세요.`, true, 12000);
      return;
    }
    document.querySelector('#btnSave')?.click();
  }

  async function fillMeetingPopup(draft) {
    await waitFor(() => document.querySelector('#meetingForm') && document.querySelector('#content3'), 15000, 100, '회의록 입력폼');
    const date = draft.date || localYmd();
    setPlain('#content3', draft.title || '업무 관련 회의');
    setPlain('#startDt', date); setPlain('#endDt', date);
    setDropdownValue('#startHour', draft.startHour || '11', false);
    setDropdownValue('#startMin', draft.startMin || '30', false);
    setDropdownValue('#endHour', draft.endHour || '13', false);
    setDropdownValue('#endMin', draft.endMin || '00', false);
    setPlain('#content5', draft.place || '대전광역시 유성구');
    const content = draft.content || draft.title || '업무 관련 논의';
    setPlain('#contentDesc', amount(draft.amount) >= 100000 ? `○ 회의안건\n- ${content}\n○ 회의결과\n- 관련 사항 논의` : content);
    try {
      document.querySelector('input[name="dmexSeCd"][value="A"]')?.click();
      setPlain('#ctySe', 'C94077'); setPlain('#ctySeNm', '대전광역시 유성구');
    } catch (_) {}
    armConfirmDialog(/회의록.*저장|저장하시겠습니까/i, 6000);
    document.querySelector('#btnSave')?.click();
  }

  async function fillPmsPreapply(draft) {
    const j = jq();
    const g1 = await waitFor(() => pageWindow.dataGrid1, 15000, 100, 'PMS 내부 참석자');
    const g2 = await waitFor(() => pageWindow.dataGrid2, 15000, 100, 'PMS 외부 참석자');
    const bg = await waitFor(() => pageWindow.budgGrid, 15000, 100, 'PMS 예산 그리드');
    await sleep(400);

    const date = draft.date || localYmd();
    setPlain('#title', draft.title || '업무 관련 회의');
    setPlain('#strDt', date); setPlain('#endDt', date);
    setDropdownValue('#startHour', draft.startHour || '11', false);
    setDropdownValue('#startMin', draft.startMin || '30', false);
    setDropdownValue('#endHour', draft.endHour || '13', false);
    setDropdownValue('#endMin', draft.endMin || '00', false);
    setPlain('#plc', draft.place || '대전광역시 유성구');
    setPlain('#cn', draft.content || draft.title || '업무 관련 논의');

    const profile = draft.budget || BUDGETS.trustMeeting;
    await waitFor(() => bg.getData && bg.getData().length > 0, 12000, 100, 'PMS 기본 예산행');
    const row = bg.getData()[0];
    row.cls = '1'; row.budgYy = date.slice(0,4); row.budgCd = profile.budgetCode; row.budgNm = profile.budgetName;
    row.expCd = profile.expenseCode; row.expNm = profile.expenseName; row.amt = amount(draft.amount);
    try { bg.refreshRow(row); } catch (_) { try { bg.refresh(); } catch (_) {} }
    try { setNumeric('#totalAmt', draft.amount); } catch (_) {}

    clearKrissGrid(g1); clearKrissGrid(g2);
    const unresolved = [];
    for (const name of draft.internalNames || []) {
      try {
        const emp = await resolveEmployeeByName(name);
        const r = {empNo: emp.empNo || '', empNm: emp.empNm || '', deptNm: emp.deptNm || '', deptCd: emp.deptCd || '', flocNm: emp.flocNm || '', flocCd: emp.flocCd || '', cls: 'I'};
        try { g1.addRow(r, g1.getData().length); } catch (_) { g1.addData(r); }
      } catch (e) { unresolved.push(e.message); }
    }
    for (const out of draft.externalRows || []) {
      const r = {empNm: out.empNm || '', compNm: out.compNm || '', deptNm: out.deptNm || '', flocNm: out.flocNm || '', cls: 'O'};
      try { g2.addRow(r, g2.getData().length); } catch (_) { g2.addData(r); }
    }
    try { g1.refresh(); g2.refresh(); } catch (_) {}
    if (unresolved.length) toast(`자동입력 완료. 다만 내부 참석자 확인 필요:\n${unresolved.join('\n')}`, true, 10000);
    else toast('수탁사업 사전회의 자동입력 완료. 내용 확인 후 [저장] 또는 [승인]을 진행하세요.', false, 7000);
  }

  async function autoSelectPmsRequest(draft) {
    const j = jq();
    await waitFor(() => document.querySelector('#grid1') && pageWindow.grid1, 15000, 100, '회의신청 선택 목록');
    setPlain('#rqstNo', draft.meetingRqstNo);
    try { document.querySelector('#btnSearch')?.click(); } catch (_) { try { pageWindow.grid1.reload(); } catch (_) {} }
    const found = await waitFor(() => {
      const data = pageWindow.grid1?.getData?.() || [];
      const idx = Array.from(data).findIndex(x => String(x.rqstNo || '') === String(draft.meetingRqstNo));
      return idx >= 0 ? {idx, row: data[idx]} : null;
    }, 15000, 150, `사전회의 ${draft.meetingRqstNo}`);
    try {
      if (typeof pageWindow.grid1.selectRowWithoutEvent === 'function') pageWindow.grid1.selectRowWithoutEvent(found.idx);
      else {
        const tr = document.querySelectorAll('#grid1 .k-grid-content tbody tr')[found.idx];
        tr?.click();
      }
      await sleep(150);
      document.querySelector('#selectBtn')?.click();
      toast(`${draft.meetingRqstNo} 사전회의를 자동 선택했습니다.`);
    } catch (e) {
      throw new Error(`사전회의 자동선택 실패: ${e.message || e}`);
    }
  }

  async function prepareExpensePage(draft) {
    if (pageWindow.__kehExpensePreparedV0001) return;
    pageWindow.__kehExpensePreparedV0001 = true;
    if (norm(document.querySelector('#rqstNo')?.value)) return;

    draft = await captureExpenseProposer(draft);

    if (draft.kind === 'ai') {
      suppressNextKrissAlert(/인공지능.*챗봇|구독.*서약서/i, 6000);
      await setExpenseDocuType('32');
      assertExpenseDocuType('32');
      await setBudgetAndExpense(BUDGETS.ai);
      setPlain('#rqstDesc', draft.description || `기술사업화 업무(기술동향, 국제문서 지재권부분 영문 번역 등)를 위한 ${draft.aiServiceName || SETTINGS.ai.serviceName || 'AI'} 활용(${new Date().getMonth()+1}월)`);
      // AI는 기본사업으로 처리하므로 법인카드(클린및연구비집행) 조회창을 바로 연다.
      // 지출구분 선택 시 AI 서약서 팝업도 동시에 열릴 수 있으므로 아주 짧게 양보한 뒤 카드조회로 넘어간다.
      await sleep(450);
      if (!norm(document.querySelector('#cardNo')?.value)) await openCardChooser();
    } else if (draft.kind === 'basic_meeting') {
      await setExpenseDocuType('02');
      assertExpenseDocuType('02');
      await setBudgetAndExpense(draft.budget || BUDGETS.basicMeeting);
      setPlain('#rqstDesc', draft.title || '업무 관련 회의');
      toast(`기본사업 회의비 기본값을 입력했습니다. [카드 조회]에서 카드를 선택하면 참석자 → 회의록 → 행추가까지 자동으로 이어집니다.`, false, 10000);
    } else if (draft.kind === 'trust_expense') {
      await setExpenseDocuType('02');
      assertExpenseDocuType('02');
      await waitFor(() => document.querySelector('#btnWorkshp'), 10000, 100, '워크숍/회의 개최신청 버튼');
      document.querySelector('#btnWorkshp')?.click();
      toast(`${draft.meetingRqstNo} 사전회의 선택창을 열었습니다. 해당 행을 자동 선택한 뒤 연구비카드를 조회합니다.`, false, 8000);
    }
  }

  async function openCardChooser() {
    if (norm(document.querySelector('#cardNo')?.value)) return toast('이미 카드 사용내역이 선택되어 있습니다.');
    const draft = await getDraft();
    if (!draft) return toast('자동화 작업정보가 없습니다.', true);
    const kind = cardKindForDraft(draft);
    try {
      await selectDropdownLikeUser('#billKind', kind);
      toast(`${cardKindLabel(kind)} 카드조회 창을 엽니다.\n사용자는 ${DEPT_HEAD.empNm}(${DEPT_HEAD.empNo})로 자동 조회합니다.`, false, 7000);
    } catch (e) { toast(`카드 조회를 열지 못했습니다.\n${e.message || e}`, true, 7000); }
  }

  function expenseGridCount() {
    try {
      const g = jq()('#expndtrGrid').data('kendoGrid');
      if (g?.dataSource) return g.dataSource.data().length;
    } catch (_) {}
    return document.querySelectorAll('#expndtrGrid .k-grid-content tbody tr').length;
  }

  function fieldValue(selector) {
    try {
      const j = jq();
      const el = j(selector);
      if (!el.length) return '';
      if (typeof el.kval === 'function') return norm(el.kval());
      const w = el.data('kendoDropDownList') || el.data('kendoNumericTextBox') || el.data('kendoDatePicker');
      if (w && typeof w.value === 'function') return norm(w.value());
      return norm(el.val());
    } catch (_) {
      return norm(document.querySelector(selector)?.value || '');
    }
  }

  function paymentReady() {
    const cardNo = fieldValue('#cardNo');
    const apvlNo = fieldValue('#apvlNo');
    const custNm = fieldValue('#custNm');
    const mgmtNo = fieldValue('#mgmtNo');
    const payCls = fieldValue('#payCls');
    return !!cardNo && !!apvlNo && amount(fieldValue('#drCrAmt')) > 0 && !!custNm && !!mgmtNo && !!payCls;
  }

  async function waitForPaymentReady() {
    let warnedVendor = false;
    return waitFor(() => {
      if (expenseGridCount() > 0) return {alreadyAdded:true};
      const cardNo = fieldValue('#cardNo');
      if (!cardNo) return false;
      const custNm = fieldValue('#custNm');
      const mgmtNo = fieldValue('#mgmtNo');
      if (custNm && !mgmtNo && !warnedVendor) {
        warnedVendor = true;
        toast('카드내역은 선택되었습니다. 거래처코드가 아직 없습니다.\n미등록 거래처 확인/등록 팝업이 뜬 경우 처리하면 자동으로 다음 단계가 계속됩니다.', false, 12000);
      }
      return paymentReady() ? {alreadyAdded:false} : false;
    }, 10 * 60 * 1000, 250, '카드/거래처 입력 완료');
  }

  async function ensureAiAttendee() {
    if (amount(fieldValue('#attdCount')) > 0) return;
    const btn = document.querySelector('#btnAttdDesc');
    if (!btn) throw new Error('[참석자입력] 버튼을 찾지 못했습니다.');
    btn.click();
    await waitFor(() => amount(fieldValue('#attdCount')) > 0, 120000, 250, 'AI 참석자 입력 완료');
  }

  async function ensureBasicMeetingDetails() {
    if (amount(fieldValue('#attdCount')) <= 0) {
      const btn = document.querySelector('#btnAttdDesc');
      if (!btn) throw new Error('[참석자입력] 버튼을 찾지 못했습니다.');
      btn.click();
      await waitFor(() => amount(fieldValue('#attdCount')) > 0, 120000, 250, '참석자 입력 완료');
    }
    if (!document.querySelector('#meetingYn')?.checked) {
      const btn = document.querySelector('#btnMetting');
      if (!btn) throw new Error('[회의록 등록] 버튼을 찾지 못했습니다.');
      btn.click();
      await waitFor(() => document.querySelector('#meetingYn')?.checked, 120000, 250, '회의록 입력 완료');
    }
  }

  async function ensureTrustAttendeeCardUser() {
    // 사전회의 선택 callback에서 참석자/회의록은 이미 들어오지만,
    // 카드사용자 체크는 카드조회 명의자가 아니라 지출발의자 본인을 기준으로 확정한다.
    const btn = document.querySelector('#btnAttdDesc');
    if (!btn) throw new Error('[참석자입력] 버튼을 찾지 못했습니다.');
    btn.click();
    await waitFor(() => amount(fieldValue('#attdCount')) > 0, 120000, 250, '수탁 참석자 입력 완료');
  }

  async function autoFinalizeExpense(draft) {
    if (pageWindow.__kehAutoFinalizeV0200) return;
    pageWindow.__kehAutoFinalizeV0200 = true;
    try {
      const ready = await waitForPaymentReady();
      if (ready?.alreadyAdded || expenseGridCount() > 0) return;

      if (draft.kind === 'ai') {
        await ensureAiAttendee();
      } else if (draft.kind === 'basic_meeting') {
        await ensureBasicMeetingDetails();
      } else if (draft.kind === 'trust_expense') {
        await ensureTrustAttendeeCardUser();
        if (!document.querySelector('#meetingYn')?.checked) {
          throw new Error('수탁 사전회의의 회의록 정보가 아직 반영되지 않았습니다. 사전신청 연결 상태를 확인해주세요.');
        }
      }

      if (expenseGridCount() > 0) return;
      toast('필수 입력이 준비되었습니다. 지출발의 [행추가]를 자동 실행합니다.', false, 6000);
      await sleep(250);
      await addExpenseRowAndClear();
    } catch (e) {
      pageWindow.__kehAutoFinalizeV0200 = false;
      toast(`자동 행추가 대기/처리가 중단되었습니다.\n${e.message || e}\n화면 값을 확인한 뒤 패널의 [행추가]로 직접 진행할 수 있습니다.`, true, 12000);
    }
  }

  async function runBasicMeetingDetails() {
    const draft = await getDraft();
    if (!draft || draft.kind !== 'basic_meeting') return toast('기본사업 회의 작업정보가 없습니다.', true);
    if (!norm(document.querySelector('#cardNo')?.value) || !amount(document.querySelector('#drCrAmt')?.value)) {
      return toast('먼저 카드 사용내역을 선택해주세요.', true);
    }
    if (!draft.internalNames?.length) return toast('내부 참석자가 없습니다. 작업정보를 다시 만들어주세요.', true);
    document.querySelector('#btnAttdDesc')?.click();
    try {
      await waitFor(() => amount(document.querySelector('#attdCount')?.value) > 0, 120000, 250, '참석자 입력 완료');
      document.querySelector('#btnMetting')?.click();
      await waitFor(() => document.querySelector('#meetingYn')?.checked, 120000, 250, '회의록 입력 완료');
      toast('참석자와 회의록이 입력되었습니다. 행추가를 자동 실행합니다.', false, 7000);
      if (expenseGridCount() === 0) await addExpenseRowAndClear();
    } catch (e) { toast(`참석자/회의록 자동화가 중단되었습니다.\n${e.message || e}`, true, 9000); }
  }

  async function runTrustCardUserFix() {
    const draft = await getDraft();
    if (!draft || draft.kind !== 'trust_expense') return toast('수탁사업 회의 작업정보가 없습니다.', true);
    if (!norm(document.querySelector('#cardNo')?.value) || !amount(document.querySelector('#drCrAmt')?.value)) {
      return toast('먼저 연구비카드 사용내역을 선택해주세요.', true);
    }
    const btn = document.querySelector('#btnAttdDesc');
    if (!btn) return toast('[참석자입력] 버튼을 찾지 못했습니다.', true);
    btn.click();
    try {
      await waitFor(() => amount(fieldValue('#attdCount')) > 0, 120000, 250, '수탁 참석자 저장 완료');
      if (expenseGridCount() === 0) await addExpenseRowAndClear();
    } catch (e) {
      toast(`카드사용자 지정 후 자동 행추가가 중단되었습니다.\n${e.message || e}`, true, 9000);
    }
  }

  async function addExpenseRowAndClear() {
    const btn = document.querySelector('#btnExpndtrRowInsert');
    if (!btn) return toast('[행추가] 버튼을 찾지 못했습니다.', true);
    const before = expenseGridCount();
    btn.click();
    try {
      await waitFor(() => expenseGridCount() > before, 20000, 150, '지출행 추가');
      await clearDraft();
      renderExpenseWorkflowPanel(null);
      toast('지출행이 추가되었습니다. 포털 내용을 확인한 뒤 저장/상신하세요.', false, 7000);
    } catch (_) { toast('행추가가 완료되지 않았습니다. 포털의 필수입력/경고 메시지를 확인해주세요.', true, 7000); }
  }

  function expenseStatusMeta(code) {
    const c = String(code || '');
    return ({
      '00': {label:'저장만', cls:'saved'}, '01': {label:'신청중', cls:'progress'}, '02': {label:'검토중', cls:'progress'},
      '03': {label:'승인중', cls:'progress'}, '04': {label:'완료', cls:'done'}, '05': {label:'반려', cls:'reject'},
    })[c] || {label: c || '상태미상', cls:'unknown'};
  }

  async function trustDashboardData() {
    const user = currentPortalUser();
    if (!user.empNo) throw new Error('현재 로그인 사용자의 사번을 확인하지 못했습니다. 지출발의 화면 또는 사내 포털 메뉴에서 다시 시도해주세요.');
    const today = new Date();
    const from = `${today.getFullYear()}-01-01`;
    const to = localYmd(addDays(today, 90));
    const pms = await genericGridQuery(PMS_LIST_API, {
      title:'', qFrom:from, qTo:to, rqstEmpNm:user.empNm, rqstEmpNo:user.empNo,
      budgCd:'', budgNm:'', rqstNo:'', searchGubun:'emp', from:'expndtr', apvStat:'05',
    }, ['gubun','rqstNo','regEmpNm','title','strDt','endDt','vistDt','plc','budgCd','budgNm','expCd','expNm','amt','totalAmt','apvStat']);

    const expRows = await genericGridQuery(EXPENSE_LIST_API, {
      billCls:'1', cdCls:'AC11', rqstDtFr:`${today.getFullYear()}0101`, rqstDtTo:compactYmd(today),
      rqstDeptNm:'', rqstDept:'', rqstEmpNm:'', rqstEmp:user.empNo,
      reslDtFr:'', reslDtTo:'', dangYn:'', billNo:'', docuType:'02', acctStatus:'', frAmt:'', toAmt:'',
      rqstNo:'', reslNo:'', jiRqstNo:'', order:'1', busiRegNm:'', busiRegNo:'', errorYn:'A',
    }, ['docuType','rqstNo','billtype','rqstDt','rqstEmp','rqstEmpNo','drAmt','rqstDesc','currentNm','acctStatus','reslNo','jiRqstNo']);

    const linked = new Map();
    const batches = [];
    for (let i=0; i<expRows.length; i+=8) batches.push(expRows.slice(i,i+8));
    for (const batch of batches) {
      const vals = await Promise.all(batch.map(async row => {
        try { const h = await portalPost('/mis/acc/selectRqstHead.json', {rqstNo: row.rqstNo}); return {row, head:h}; }
        catch (_) { return {row, head:null}; }
      }));
      vals.forEach(({row, head}) => {
        if (!head) return;
        if (head.report1 === 'pms/S_PMS_02040400.mrd' && head.report1Key) {
          const key = String(head.report1Key);
          if (!linked.has(key)) linked.set(key, []);
          linked.get(key).push({...row, head});
        }
      });
    }

    const todayYmd = localYmd();
    return pms.filter(x => String(x.gubun || '') === '02').map(m => {
      const exps = linked.get(String(m.rqstNo)) || [];
      let state = {key:'todo', label:'지출발의 필요'};
      let expense = null;
      if (exps.length) {
        const order = {'04':5,'03':4,'02':3,'01':2,'00':1,'05':0};
        exps.sort((a,b) => (order[String(b.acctStatus)]||0) - (order[String(a.acctStatus)]||0));
        expense = exps[0];
        const meta = expenseStatusMeta(expense.acctStatus);
        state = {key:meta.cls, label:meta.label};
      } else {
        const d = String(m.strDt || m.vistDt || '').slice(0,10);
        if (d && d >= todayYmd) state = {key:'scheduled', label:'예정'};
      }
      return {...m, state, expense, allExpenses:exps};
    }).sort((a,b) => String(b.strDt || b.vistDt || '').localeCompare(String(a.strDt || a.vistDt || '')));
  }

  function openExpenseExisting(row) {
    const rqstNo = String(row?.rqstNo || '');
    if (!rqstNo) return;
    const code = String(row.acctStatus || '');
    if (code === '00') {
      if (typeof pageWindow.fnShowWorkBpmPopup === 'function') {
        pageWindow.fnShowWorkBpmPopup(MAIN_EXPENSE_PATH, 'B_ACT00002', rqstNo, 'ST0100');
      } else openBpm(MAIN_EXPENSE_PATH, {bizKey:rqstNo, workFlag:'myWork', processCode:'B_ACT00002', statusCode:'ST0100', subFlag:'N'}, 'keh_saved');
    } else if (typeof pageWindow.fnShowReadOnlyBpmPopup === 'function') {
      pageWindow.fnShowReadOnlyBpmPopup(MAIN_EXPENSE_READ_PATH, rqstNo);
    } else {
      const j = $();
      if (j && typeof j.popupWindow === 'function') j.popupWindow(`${MAIN_EXPENSE_READ_PATH}?popupAt=popup`, {width:1700,height:960,center:'screen',scrollbars:true,resizable:true,dataSource:[{name:'rqstNo',value:rqstNo}]});
    }
  }

  async function launchAi() {
    const serviceName = norm(SETTINGS.ai.serviceName) || 'AI';
    const merchantHints = merchantHintsForDraft({merchantHints: SETTINGS.ai.merchantHints});
    const draft = {
      kind:'ai', internalNames:[], externalRows:[], cardBillKind:CARD_KIND.CORPORATE,
      aiServiceName: serviceName, merchantHints, merchantHint: merchantHints[0] || '',
      createdAt:new Date().toISOString(),
      description:`기술사업화 업무(기술동향, 국제문서 지재권부분 영문 번역 등)를 위한 ${serviceName} 활용(${new Date().getMonth()+1}월)`
    };
    await setDraft(draft);
    openBpm(MAIN_EXPENSE_PATH, EXPENSE_NEW_BPM, 'keh_ai');
  }

  async function launchBasicMeeting(data) {
    const draft = {...data, kind:'basic_meeting', budget:BUDGETS.basicMeeting, cardBillKind:CARD_KIND.CORPORATE, createdAt:new Date().toISOString()};
    await setDraft(draft);
    openBpm(MAIN_EXPENSE_PATH, EXPENSE_NEW_BPM, 'keh_basic');
  }

  async function launchTrustPreapply(data) {
    const draft = {...data, kind:'trust_preapply', createdAt:new Date().toISOString()};
    await setDraft(draft);
    openBpm(PMS_NEW_PATH, PMS_NEW_BPM, 'keh_pms');
  }

  async function launchTrustExpense(meeting) {
    const draft = {
      kind:'trust_expense', cardBillKind:CARD_KIND.RESEARCH, createdAt:new Date().toISOString(), meetingRqstNo:meeting.rqstNo,
      title:meeting.title || '', date:String(meeting.strDt || meeting.vistDt || '').slice(0,10),
      place:meeting.plc || '', amount:meeting.totalAmt || meeting.amt || 0,
    };
    await setDraft(draft);
    openBpm(MAIN_EXPENSE_PATH, EXPENSE_NEW_BPM, 'keh_trust');
  }

  function ensureStyles() {
    if (document.getElementById('keh-style')) return;
    const st = document.createElement('style'); st.id = 'keh-style';
    st.textContent = `
#keh-panel{position:fixed;right:16px;bottom:16px;z-index:2147483600;width:430px;background:#fff;border:1px solid #cfd2d7;border-radius:14px;box-shadow:0 12px 38px rgba(0,0,0,.24);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Malgun Gothic",sans-serif;color:#1d1d1f;overflow:hidden}
#keh-panel *{box-sizing:border-box} #keh-panel button{font:inherit;cursor:pointer;border:1px solid #c9ccd2;background:#fff;border-radius:7px;padding:7px 9px} #keh-panel button:hover{background:#f4f5f7} #keh-panel button.primary{background:#253b80;color:#fff;border-color:#253b80;font-weight:700} #keh-panel button.danger{color:#a32626}
.keh-head{display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid #eceef1;background:#fafbfc}.keh-title{font-weight:800;font-size:15px;flex:1}.keh-ver{font-size:10px;color:#777}.keh-body{padding:11px 12px;max-height:72vh;overflow:auto}.keh-row{display:flex;gap:6px;margin:6px 0}.keh-row>*{flex:1}.keh-note{font-size:11px;color:#6b6f76;white-space:pre-wrap}.keh-card{border:1px solid #e2e4e8;border-radius:9px;padding:8px;margin:7px 0;background:#fff}.keh-card .top{display:flex;gap:7px;align-items:center}.keh-card .name{font-weight:700;flex:1}.keh-card .sub{font-size:11px;color:#666;margin-top:3px}.keh-chip{font-size:10px;font-weight:700;border-radius:999px;padding:2px 7px;background:#eee;white-space:nowrap}.keh-chip.todo{background:#ffe9e7;color:#a62820}.keh-chip.scheduled{background:#f0f1f3;color:#555}.keh-chip.saved{background:#fff2cc;color:#775e00}.keh-chip.progress{background:#e7efff;color:#234b9a}.keh-chip.done{background:#e6f6eb;color:#176b31}.keh-chip.reject{background:#fbe6ef;color:#9a2755}.keh-form label{display:block;font-size:11px;font-weight:700;color:#555;margin:8px 0 3px}.keh-form input,.keh-form textarea,.keh-form select{width:100%;border:1px solid #cfd2d7;border-radius:7px;padding:7px 8px;font:inherit;background:#fff}.keh-form textarea{min-height:64px;resize:vertical}.keh-modalback{position:fixed;inset:0;background:rgba(0,0,0,.36);z-index:2147483650;display:flex;align-items:flex-start;justify-content:center;padding-top:6vh}.keh-modal{width:min(680px,94vw);max-height:88vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.35);padding:16px}.keh-modal h3{margin:0 0 10px}.keh-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.keh-hidden{display:none!important}`;
    document.head.appendChild(st);
  }

  function showMeetingModal(kind) {
    ensureStyles();
    const trust = kind === 'trust_preapply';
    const b = trust ? BUDGETS.trustMeeting : BUDGETS.basicMeeting;
    const back = document.createElement('div'); back.className = 'keh-modalback';
    back.innerHTML = `<div class="keh-modal keh-form">
      <h3>${trust ? '수탁사업 사전회의 신청' : '기본사업 회의비 지출발의'}</h3>
      <div class="keh-grid2"><div><label>회의일자</label><input id="kehf-date" type="date" value="${localYmd()}"></div><div><label>시간 프리셋</label><select id="kehf-time"><option value="lunch">점심 11:30~13:00</option><option value="dinner">저녁 18:00~20:00</option></select></div></div>
      <label>회의 제목 / 목적</label><input id="kehf-title" placeholder="예: 기술이전 사후관리 업무 관련 논의">
      <div class="keh-grid2"><div><label>장소</label><input id="kehf-place" value="대전광역시 유성구"></div><div><label>예상/사용금액</label><input id="kehf-amount" inputmode="numeric" placeholder="예: 200000"></div></div>
      <label>회의내용</label><textarea id="kehf-content" placeholder="간단한 회의 안건/내용"></textarea>
      <label>내부 참석자 (이름을 쉼표로 구분)</label><textarea id="kehf-internal" placeholder="고해림, 김지훈, 김기태, 한성, 송훈찬"></textarea>
      <label>외부 참석자 (한 줄에 1명: 이름|회사명|부서|직책)</label><textarea id="kehf-external" placeholder="류채희|회사명||\n서지영|회사명||\n최재혁|회사명||"></textarea>
      ${trust ? `<div class="keh-grid2"><div><label>예산코드</label><input id="kehf-budgcd" value="${esc(b.budgetCode)}"></div><div><label>비목코드</label><input id="kehf-expcd" value="${esc(b.expenseCode)}"></div></div><label>예산명</label><input id="kehf-budgnm" value="${esc(b.budgetName)}"><label>비목명</label><input id="kehf-expnm" value="${esc(b.expenseName)}">` : ''}
      <div class="keh-note" style="margin-top:8px">현재 버전에서는 참석자 마스터 대신 이름/회사명을 직접 입력합니다. 내부 직원은 이름으로 포털에서 사번·부서를 조회합니다. 카드조회 부서장/예산코드는 패널의 [설정]에서 바꿀 수 있습니다.</div>
      <div class="keh-row" style="margin-top:12px"><button id="kehf-cancel">취소</button><button id="kehf-go" class="primary">${trust ? '사전회의 신청 열기' : '지출발의 열기'}</button></div>
    </div>`;
    document.body.appendChild(back);
    back.querySelector('#kehf-cancel').onclick = () => back.remove();
    back.onclick = e => { if (e.target === back) back.remove(); };
    back.querySelector('#kehf-go').onclick = async () => {
      const preset = back.querySelector('#kehf-time').value;
      const data = {
        date: back.querySelector('#kehf-date').value || localYmd(),
        title: norm(back.querySelector('#kehf-title').value),
        place: norm(back.querySelector('#kehf-place').value),
        amount: amount(back.querySelector('#kehf-amount').value),
        content: norm(back.querySelector('#kehf-content').value),
        internalNames: parseInternalNames(back.querySelector('#kehf-internal').value),
        externalRows: parseExternalRows(back.querySelector('#kehf-external').value),
        ...(preset === 'dinner' ? {startHour:'18',startMin:'00',endHour:'20',endMin:'00'} : {startHour:'11',startMin:'30',endHour:'13',endMin:'00'}),
      };
      if (!data.title) return toast('회의 제목을 입력해주세요.', true);
      if (!data.amount) return toast('금액을 입력해주세요.', true);
      if (!data.internalNames.length) return toast('내부 참석자를 1명 이상 입력해주세요.', true);
      if (trust && !data.externalRows.some(x => x.empNm && x.compNm)) return toast('수탁 사전회의는 외부 참석자 1명 이상(이름+회사명)이 필요합니다.', true);
      if (trust) data.budget = {budgetCode:norm(back.querySelector('#kehf-budgcd').value),budgetName:norm(back.querySelector('#kehf-budgnm').value),expenseCode:norm(back.querySelector('#kehf-expcd').value),expenseName:norm(back.querySelector('#kehf-expnm').value)};
      back.remove();
      try { trust ? await launchTrustPreapply(data) : await launchBasicMeeting(data); }
      catch (e) { toast(String(e.message || e), true, 9000); }
    };
  }

  function showSettingsModal() {
    ensureStyles();
    if (document.getElementById('keh-settings-back')) return;
    const back = document.createElement('div');
    back.id = 'keh-settings-back';
    back.className = 'keh-modalback';
    back.innerHTML = `<div class="keh-modal keh-form">
      <h3>지출발의 도우미 설정</h3>
      <div class="keh-grid2">
        <div><label>카드조회 부서장 이름</label><input id="kehs-headnm" value="${esc(DEPT_HEAD.empNm)}"></div>
        <div><label>카드조회 부서장 사번</label><input id="kehs-headno" value="${esc(DEPT_HEAD.empNo)}"></div>
      </div>
      <label>기본사업 예산코드</label><input id="kehs-basiccd" value="${esc(SETTINGS.basicBudget.budgetCode)}">
      <label>기본사업 예산명</label><input id="kehs-basicnm" value="${esc(SETTINGS.basicBudget.budgetName)}">
      <div class="keh-grid2">
        <div><label>AI 비목코드</label><input id="kehs-aiexpcd" value="${esc(SETTINGS.aiExpense.expenseCode)}"></div>
        <div><label>AI 비목명</label><input id="kehs-aiexpnm" value="${esc(SETTINGS.aiExpense.expenseName)}"></div>
      </div>
      <div class="keh-grid2">
        <div><label>회의비 비목코드</label><input id="kehs-mexpcd" value="${esc(SETTINGS.meetingExpense.expenseCode)}"></div>
        <div><label>회의비 비목명</label><input id="kehs-mexpnm" value="${esc(SETTINGS.meetingExpense.expenseName)}"></div>
      </div>
      <label>수탁 기본 예산코드</label><input id="kehs-trustcd" value="${esc(SETTINGS.trustBudget.budgetCode)}">
      <label>수탁 기본 예산명</label><input id="kehs-trustnm" value="${esc(SETTINGS.trustBudget.budgetName)}">
      <div class="keh-grid2">
        <div><label>AI 서비스명</label><input id="kehs-ainame" value="${esc(SETTINGS.ai.serviceName)}" placeholder="ChatGPT / Claude"></div>
        <div><label>카드/거래처 키워드</label><input id="kehs-aihints" value="${esc(SETTINGS.ai.merchantHints)}" placeholder="OPENAI,CHATGPT"></div>
      </div>
      <div class="keh-note" style="margin-top:8px">연도 변경 시 기본사업/수탁 예산코드만 여기서 바꾸면 다음 실행부터 사용합니다. 부서장 변경 시 이름과 사번을 함께 수정하세요. Claude를 쓰면 서비스명과 키워드를 예: Claude / ANTHROPIC,CLAUDE 로 바꿀 수 있습니다.</div>
      <div class="keh-row" style="margin-top:12px"><button id="kehs-reset">기본값</button><button id="kehs-cancel">취소</button><button id="kehs-save" class="primary">저장</button></div>
    </div>`;
    document.body.appendChild(back);
    back.onclick = e => { if (e.target === back) back.remove(); };
    back.querySelector('#kehs-cancel').onclick = () => back.remove();
    back.querySelector('#kehs-reset').onclick = async () => {
      await persistRuntimeSettings(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
      back.remove();
      const p = document.getElementById('keh-panel');
      if (p) p.remove();
      renderLauncherPanel().catch(() => {});
    };
    back.querySelector('#kehs-save').onclick = async () => {
      const next = {
        deptHead: { empNm:norm(back.querySelector('#kehs-headnm').value), empNo:norm(back.querySelector('#kehs-headno').value) },
        basicBudget: { budgetCode:norm(back.querySelector('#kehs-basiccd').value), budgetName:norm(back.querySelector('#kehs-basicnm').value) },
        aiExpense: { expenseCode:norm(back.querySelector('#kehs-aiexpcd').value), expenseName:norm(back.querySelector('#kehs-aiexpnm').value) },
        meetingExpense: { expenseCode:norm(back.querySelector('#kehs-mexpcd').value), expenseName:norm(back.querySelector('#kehs-mexpnm').value) },
        trustBudget: { budgetCode:norm(back.querySelector('#kehs-trustcd').value), budgetName:norm(back.querySelector('#kehs-trustnm').value) },
        ai: { serviceName:norm(back.querySelector('#kehs-ainame').value) || 'AI', merchantHints:norm(back.querySelector('#kehs-aihints').value) },
      };
      if (!next.deptHead.empNm || !next.deptHead.empNo) return toast('부서장 이름과 사번을 모두 입력해주세요.', true);
      if (!next.basicBudget.budgetCode) return toast('기본사업 예산코드를 입력해주세요.', true);
      await persistRuntimeSettings(next);
      back.remove();
      const p = document.getElementById('keh-panel');
      if (p) p.remove();
      renderLauncherPanel().catch(() => {});
    };
  }

  function createPanel() {
    ensureStyles();
    let p = document.getElementById('keh-panel'); if (p) return p;
    p = document.createElement('div'); p.id = 'keh-panel';
    p.innerHTML = `<div class="keh-head"><div class="keh-title">지출발의 도우미 <span class="keh-ver">v${VERSION}</span></div><button id="keh-settings-global">설정</button><button id="keh-collapse">−</button></div><div class="keh-body" id="keh-body"></div>`;
    document.body.appendChild(p);
    p.querySelector('#keh-settings-global').onclick = showSettingsModal;
    p.querySelector('#keh-collapse').onclick = async () => {
      const body = p.querySelector('#keh-body'); const hidden = !body.classList.contains('keh-hidden');
      body.classList.toggle('keh-hidden', hidden); p.querySelector('#keh-collapse').textContent = hidden ? '+' : '−';
      await GM.setValue(KEY_PANEL_COLLAPSED, hidden);
    };
    GM.getValue(KEY_PANEL_COLLAPSED, false).then(v => { if (v) p.querySelector('#keh-collapse').click(); });
    return p;
  }

  async function renderLauncherPanel() {
    const p = createPanel(); const body = p.querySelector('#keh-body');
    body.innerHTML = `<div class="keh-row"><button id="keh-ai" class="primary">AI 구독료</button><button id="keh-basic">기본사업 회의</button></div>
      <div class="keh-row"><button id="keh-pre">수탁 사전회의 신청</button><button id="keh-trust-refresh">수탁 현황 새로고침</button></div>
      <div class="keh-note">기본사업 예산 ${esc(SETTINGS.basicBudget.budgetCode)} · 카드조회 ${esc(DEPT_HEAD.empNm)}(${esc(DEPT_HEAD.empNo)})<br>수탁 현황은 사전 회의신청 번호(SEM...)와 실제 지출발의의 연결정보를 대조합니다.</div>
      <div id="keh-trust-list" style="margin-top:8px"></div>`;
    body.querySelector('#keh-ai').onclick = () => launchAi().catch(e => toast(String(e.message||e), true));
    body.querySelector('#keh-basic').onclick = () => showMeetingModal('basic_meeting');
    body.querySelector('#keh-pre').onclick = () => showMeetingModal('trust_preapply');
    body.querySelector('#keh-trust-refresh').onclick = async () => {
      const list = body.querySelector('#keh-trust-list'); list.innerHTML = '<div class="keh-note">포털 목록 대조 중...</div>';
      try {
        const data = await trustDashboardData();
        const counts = data.reduce((a,x) => (a[x.state.key]=(a[x.state.key]||0)+1,a),{});
        list.innerHTML = `<div class="keh-note">전체 ${data.length}건 · 지출발의 필요 ${counts.todo||0} · 예정 ${counts.scheduled||0} · 처리/저장 ${(counts.progress||0)+(counts.saved||0)} · 완료 ${counts.done||0}</div>` + data.map((x,i) => {
          const date = String(x.strDt || x.vistDt || '').slice(0,10);
          const money = x.totalAmt || x.amt || 0;
          const exp = x.expense;
          const action = exp ? `<button data-open-exp="${i}">${x.state.key==='saved'?'계속':'보기'}</button>` : `<button data-new-exp="${i}" class="primary">지출발의</button>`;
          return `<div class="keh-card"><div class="top"><div class="name">${esc(x.title)}</div><span class="keh-chip ${esc(x.state.key)}">${esc(x.state.label)}</span></div><div class="sub">${esc(date)} · ${esc(x.rqstNo)} · ${fmt(money)}원<br>${esc(x.budgNm || '')} (${esc(x.budgCd || '')})${exp ? `<br>발의 ${esc(exp.rqstNo || '')}` : ''}</div><div class="keh-row" style="margin-top:6px">${action}<button data-view-pms="${i}">사전신청 보기</button></div></div>`;
        }).join('');
        list.querySelectorAll('[data-new-exp]').forEach(btn => btn.onclick = () => launchTrustExpense(data[Number(btn.dataset.newExp)]).catch(e=>toast(String(e.message||e),true)));
        list.querySelectorAll('[data-open-exp]').forEach(btn => btn.onclick = () => openExpenseExisting(data[Number(btn.dataset.openExp)].expense));
        list.querySelectorAll('[data-view-pms]').forEach(btn => btn.onclick = () => {
          const x = data[Number(btn.dataset.viewPms)];
          if (typeof pageWindow.fnShowReadOnlyBpmPopup === 'function') pageWindow.fnShowReadOnlyBpmPopup(PMS_VIEW_PATH, x.rqstNo);
          else formPostToWindow(PMS_VIEW_PATH, {bizKey:x.rqstNo, workFlag:'readOnly', processCode:'S_PMS_02040400', statusCode:'ST0100'}, 'keh_pms_view');
        });
      } catch (e) { list.innerHTML = `<div class="keh-note" style="color:#a32626">${esc(e.message || e)}</div>`; }
    };
  }

  function renderExpenseWorkflowPanel(draft) {
    const p = createPanel(); const body = p.querySelector('#keh-body');
    if (!draft) {
      body.innerHTML = `<div class="keh-note">현재 자동화 작업정보가 없습니다.</div><div class="keh-row"><button id="keh-ai-mini" class="primary">AI 구독료</button><button id="keh-basic-mini">기본사업 회의</button></div><div class="keh-row"><button id="keh-pre-mini">수탁 사전회의</button><button id="keh-clear">초기화</button></div>`;
      body.querySelector('#keh-ai-mini').onclick = () => launchAi().catch(e => toast(String(e.message||e), true));
      body.querySelector('#keh-basic-mini').onclick = () => showMeetingModal('basic_meeting');
      body.querySelector('#keh-pre-mini').onclick = () => showMeetingModal('trust_preapply');
      body.querySelector('#keh-clear').onclick = () => clearDraft(); return;
    }
    const label = draft.kind === 'ai' ? 'AI 구독료' : draft.kind === 'basic_meeting' ? '기본사업 회의비' : '수탁사업 회의비';
    const expectedCard = cardKindLabel(cardKindForDraft(draft));
    const detailButton = draft.kind === 'basic_meeting'
      ? '<button id="keh-details">참석자+회의록</button>'
      : draft.kind === 'trust_expense' ? '<button id="keh-trust-carduser">발의자 카드사용자 지정</button>'
      : draft.kind === 'ai' ? '<button id="keh-ai-attd">AI 참석자</button>' : '';
    body.innerHTML = `<div class="keh-card"><div class="top"><div class="name">${esc(label)}</div></div><div class="sub">${esc(draft.meetingRqstNo || draft.title || draft.description || '')}<br>카드: ${esc(expectedCard)} · 사용자 ${esc(DEPT_HEAD.empNm)}(${esc(DEPT_HEAD.empNo)})</div></div>
      <div class="keh-row"><button id="keh-card" class="primary">카드 조회</button>${detailButton}</div>
      <div class="keh-row"><button id="keh-add">행추가</button><button id="keh-clear" class="danger">작업정보 초기화</button></div>
      <div class="keh-note">카드조회는 [설정]의 부서장 이름+사번을 함께 넣어 조회합니다. 참석자 팝업의 카드사용자는 지출발의자 본인으로 체크합니다. 카드 선택 후 거래처는 포털 원래 흐름을 그대로 사용합니다. 미등록 거래처 확인/등록 팝업은 직접 확인하세요. 거래처·참석자·회의록 준비가 끝나면 [행추가]는 자동 실행합니다. 최종 저장/승인은 자동으로 누르지 않습니다.</div>`;
    body.querySelector('#keh-card').onclick = openCardChooser;
    if (body.querySelector('#keh-details')) body.querySelector('#keh-details').onclick = runBasicMeetingDetails;
    if (body.querySelector('#keh-trust-carduser')) body.querySelector('#keh-trust-carduser').onclick = runTrustCardUserFix;
    if (body.querySelector('#keh-ai-attd')) body.querySelector('#keh-ai-attd').onclick = async () => {
      try {
        await ensureAiAttendee();
        if (expenseGridCount() === 0 && paymentReady()) await addExpenseRowAndClear();
      } catch (e) { toast(`AI 참석자 자동입력 중단\n${e.message || e}`, true, 9000); }
    };
    body.querySelector('#keh-add').onclick = addExpenseRowAndClear;
    body.querySelector('#keh-clear').onclick = async () => { await clearDraft(); renderExpenseWorkflowPanel(null); };
  }

  async function initMainExpense() {
    let draft = await getDraft();
    if (draft && ['ai','basic_meeting','trust_expense'].includes(draft.kind)) {
      draft = await captureExpenseProposer(draft);
    }
    renderExpenseWorkflowPanel(draft);
    if (!draft || !['ai','basic_meeting','trust_expense'].includes(draft.kind)) return;
    try {
      await prepareExpensePage(draft);
      // 카드 선택 및 (필요시) 거래처 등록은 사용자가 확인한다.
      // 카드 popup이 닫힌 뒤 카드/거래처가 완성되면 참석자/회의록을 처리하고 행추가까지 이어간다.
      autoFinalizeExpense(draft);
    }
    catch (e) { toast(`지출발의 자동입력 중단\n${e.message || e}`, true, 10000); }
  }

  async function initAiCert() {
    const draft = await getDraft(); if (draft?.kind !== 'ai') return;
    await waitFor(() => document.querySelector('#swearBtn'), 10000, 100, 'AI 서약 확인 버튼');
    await sleep(150); document.querySelector('#swearBtn').click();
  }

  async function initAttendeePopup() {
    const draft = await getDraft();
    if (!draft || !['ai','basic_meeting','trust_expense'].includes(draft.kind)) return;
    try {
      if (draft.kind === 'ai' || draft.kind === 'basic_meeting') await fillAttendeePopup(draft);
      else await fixExistingAttendeeCardUser(draft);
    } catch (e) { toast(`참석자 자동입력 중단\n${e.message || e}`, true, 10000); }
  }

  async function initMeetingPopup() {
    const draft = await getDraft(); if (draft?.kind !== 'basic_meeting') return;
    try { await fillMeetingPopup(draft); }
    catch (e) { toast(`회의록 자동입력 중단\n${e.message || e}`, true, 10000); }
  }

  function bindActCardEnterSelect() {
    if (pageWindow.__kehActCardEnterV0001) return;
    pageWindow.__kehActCardEnterV0001 = true;
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' || e.isComposing || e.repeat) return;
      let row = null;
      try { row = pageWindow.actCardGrid?.getRowData?.(); } catch (_) {}
      if (!row) return;
      const btn = document.querySelector('#selectBtn');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      btn.click();
    }, true);
  }

  async function initActCardPopup() {
    const draft = await getDraft();
    if (!draft || !['ai','basic_meeting','trust_expense'].includes(draft.kind)) return;
    const j = jq();
    const expectedKind = cardKindForDraft(draft);
    await waitFor(() => document.querySelector('#actCardSearchForm') && pageWindow.actCardGrid, 15000, 100, '카드조회 화면');
    await waitFor(() => j('#billKind').data('kendoDropDownList'), 10000, 100, '카드구분');
    bindActCardEnterSelect();

    // 카드구분은 업무에 따라 분기한다.
    setDropdownValue('#billKind', expectedKind, false);

    // 중요: 사용자명만 넣으면 사번이 따라오지 않는다. 사용자검색 callback과 동일하게 이름+사번을 같이 셋팅한다.
    try {
      if (typeof j('input[name="rqstEmpNm"]').kval === 'function') {
        j('input[name="rqstEmpNm"]').kval(DEPT_HEAD.empNm);
        j('input[name="rqstEmpNo"]').kval(DEPT_HEAD.empNo);
      } else {
        j('input[name="rqstEmpNm"]').val(DEPT_HEAD.empNm);
        j('input[name="rqstEmpNo"]').val(DEPT_HEAD.empNo);
      }
    } catch (_) {
      const nm = document.querySelector('input[name="rqstEmpNm"]');
      const no = document.querySelector('input[name="rqstEmpNo"]');
      if (nm) nm.value = DEPT_HEAD.empNm;
      if (no) no.value = DEPT_HEAD.empNo;
    }

    // 회의비는 카드사용일이 회의일인 경우가 대부분이므로 해당 일자로 좁힌다. AI는 최근 90일 기본 범위를 유지한다.
    if (draft.date && draft.kind !== 'ai') {
      try { setPlain('input[name="appDateStr"]', draft.date); } catch (_) {}
      try { setPlain('input[name="appDateEnd"]', draft.date); } catch (_) {}
    }
    const uncompleted = document.querySelector('input[name="rqstNoYn"][value="N"]');
    if (uncompleted) uncompleted.checked = true;

    document.querySelector('#btnSearch')?.click();
    // 팝업 최초 autoBind 결과가 남아 있을 수 있으므로, 부서장 사용자 결과가 실제로 반영될 때까지 기다린다.
    await sleep(450);
    const rows = await waitFor(() => {
      const data = Array.from(pageWindow.actCardGrid?.getData?.() || []);
      if (!data.length) return null;
      const headRows = data.filter(row =>
        String(row.cardUser || '') === DEPT_HEAD.empNo ||
        String(row.userNm || '') === DEPT_HEAD.empNm ||
        String(row.cardUserNm || '').includes(DEPT_HEAD.empNm)
      );
      return headRows.length ? data : null;
    }, 15000, 150, '부서장 카드내역 조회 결과').catch(() => []);

    if (!rows.length) {
      toast(`${cardKindLabel(expectedKind)} / 사용자 ${DEPT_HEAD.empNm}(${DEPT_HEAD.empNo}) 조건으로 조회했지만 카드내역이 없습니다. 날짜 범위를 확인해주세요.`, true, 10000);
      return;
    }

    const usable = rows.map((row, idx) => ({row, idx})).filter(x => {
      const rq = norm(x.row.cardRqstNo);
      // 자동 후보는 '아직 발의되지 않은' 카드만 사용한다. PUR_ 등은 화면에는 남겨두되 자동선택에서는 제외.
      return !rq && String(x.row.clickYn || '') !== 'Y';
    });
    let candidates = usable;
    if (draft.kind === 'ai') {
      candidates = usable.filter(x => containsMerchantHint([x.row.joinName, x.row.mercNm, x.row.frstNm].join(' '), merchantHintsForDraft(draft)));
      if (!candidates.length && usable.length === 1) candidates = usable;
    } else {
      if (draft.date) candidates = candidates.filter(x => String(x.row.appDate || '').slice(0,10) === String(draft.date).slice(0,10));
      if (amount(draft.amount)) {
        const exact = candidates.filter(x => amount(x.row.domeMon) === amount(draft.amount));
        if (exact.length) candidates = exact;
        else if (candidates.length !== 1) candidates = [];
      } else if (candidates.length !== 1) {
        candidates = [];
      }
    }

    candidates.sort((a,b) => String(b.row.appDate || '').localeCompare(String(a.row.appDate || '')));
    if (candidates.length) {
      const pick = candidates[0];
      try {
        if (typeof pageWindow.actCardGrid.selectRowWithoutEvent === 'function') pageWindow.actCardGrid.selectRowWithoutEvent(pick.idx);
        else document.querySelectorAll('#actCardGrid .k-grid-content tbody tr')[pick.idx]?.click();
      } catch (_) {}
      const r = pick.row;
      toast(`카드조회 완료: ${DEPT_HEAD.empNm}(${DEPT_HEAD.empNo})\n후보를 선택해 두었습니다: ${r.appDate || ''} / ${fmt(r.domeMon)}원 / ${r.joinName || ''}\n내용 확인 후 [선택]을 눌러주세요.`, false, 12000);
    } else {
      toast(`카드조회 완료: ${rows.length}건. 자동 후보를 특정하지 못했습니다. 목록에서 실제 사용내역을 선택해주세요.`, false, 9000);
    }
  }

  function bindVendorEnterSelect() {
    if (pageWindow.__kehVendorEnterV0001) return;
    pageWindow.__kehVendorEnterV0001 = true;
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' || e.isComposing || e.repeat) return;
      let row = null;
      try { row = pageWindow.grid?.getRowData?.(); } catch (_) {}
      if (!row) return;
      const btn = document.querySelector('#selectBtn');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      btn.click();
    }, true);
  }

  async function initVendorPopup() {
    const draft = await getDraft();
    if (!draft || !['ai','basic_meeting','trust_expense'].includes(draft.kind)) return;
    await waitFor(() => document.querySelector('#grid') && pageWindow.grid && document.querySelector('#selectBtn'), 15000, 100, '거래처조회 화면');
    bindVendorEnterSelect();

    const picked = await waitFor(() => {
      const data = Array.from(pageWindow.grid?.getData?.() || []);
      if (!data.length) return null;
      const usable = data.map((row, idx) => ({row, idx})).filter(x => String(x.row.useYn || 'Y') === 'Y');
      if (!usable.length) return null;

      let match = null;
      if (draft.kind === 'ai') {
        const hints = merchantHintsForDraft(draft);
        match = usable.find(x => containsMerchantHint([
          x.row.busiRegNm, x.row.busiRegNmOnline, x.row.busiRegNmEn, x.row.president
        ].join(' '), hints));
      }

      if (!match) {
        const qName = norm(document.querySelector('#searchForm [name="busiRegNm"]')?.value || '');
        const qNo = digits(document.querySelector('#searchForm [name="busiRegNo"]')?.value || '');
        match = usable.find(x =>
          (qNo && digits(x.row.busiRegNo) === qNo) ||
          (qName && (norm(x.row.busiRegNm) === qName || norm(x.row.busiRegNmOnline) === qName))
        );
      }

      return match || usable[0];
    }, 15000, 150, '거래처 조회결과').catch(() => null);

    if (!picked) return;
    try {
      if (typeof pageWindow.grid.selectRowWithoutEvent === 'function') pageWindow.grid.selectRowWithoutEvent(picked.idx);
      else document.querySelectorAll('#grid .k-grid-content tbody tr')[picked.idx]?.click();
    } catch (_) {}
  }

  async function initPmsNew() {
    const draft = await getDraft(); if (draft?.kind !== 'trust_preapply') return;
    createPanel().querySelector('#keh-body').innerHTML = '<div class="keh-note">수탁 사전회의 입력 준비 중...</div>';
    try { await fillPmsPreapply(draft); }
    catch (e) { toast(`사전회의 자동입력 중단\n${e.message || e}`, true, 10000); }
  }

  async function initPmsSelection() {
    const draft = await getDraft(); if (draft?.kind !== 'trust_expense' || !draft.meetingRqstNo) return;
    try { await autoSelectPmsRequest(draft); }
    catch (e) { toast(`사전회의 선택 자동화 중단\n${e.message || e}`, true, 10000); }
  }

  async function init() {
    try {
      // v0.2.1 설정을 먼저 불러온 뒤 모든 팝업에서 동일하게 사용한다.
      await loadRuntimeSettings();
      // 이전 버전 작업정보가 현재 흐름에 섞이지 않도록 정리.
      try { await GM.deleteValue(OLD_KEY_DRAFT); await GM.deleteValue(OLD_KEY_PANEL_COLLAPSED); } catch (_) {}
      await waitFor(() => document.body, 10000, 50, 'document.body');
      const path = location.pathname;
      if (path.includes(AI_CERT_PATH)) return initAiCert();
      if (path.includes(ACT_CARD_PATH) || document.title.includes('청구내역') || document.querySelector('#actCardGrid')) return initActCardPopup();
      if (document.title.includes('거래처조회') || (document.querySelector('#selectBtn') && document.querySelector('#searchForm [name="busiRegNm"]') && document.querySelector('#grid'))) return initVendorPopup();
      if (path.includes(ATTD_POPUP_PATH) || document.title.includes('회의 참석자')) return initAttendeePopup();
      if (path.includes(MEETING_POPUP_PATH) || document.querySelector('#meetingForm')) return initMeetingPopup();
      if (path.includes(PMS_SELECT_PATH) || document.title.includes('워크숍/세미나/회의 개최 신청 현황')) return initPmsSelection();
      if (path.includes(PMS_NEW_PATH) || (document.querySelector('#editForm') && document.querySelector('#processCode')?.value === 'S_PMS_02040400')) return initPmsNew();
      if (path.includes(MAIN_EXPENSE_PATH) && document.querySelector('#docuType')) return initMainExpense();
      return renderLauncherPanel();
    } catch (e) {
      console.error('[KEH]', e);
      try { await renderLauncherPanel(); toast(String(e.message || e), true, 9000); } catch (_) {}
    }
  }

  init();
})();
