// ==UserScript==
// @name         [연차유지료] 지출발의 자동화(최종)
// @namespace    kriss-annual-fee
// @version      0.8.3
// @description  연차유지료 지출발의 자동작성 + 저장 확인 자동처리 + 임시저장 승인 재개(myWork) + 전체/작업대기 대시보드 + 국내/해외 소계 + 1~5 단축키. Tampermonkey 하위 메뉴 숨김.
// @match        https://krisstar.kriss.re.kr/*
// @grant        GM.xmlHttpRequest
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '0.8.3';
  // v0.8.3: hides all GM_registerMenuCommand entries from the Tampermonkey popup; in-page controls remain available.
  // v0.8.2: keeps both views: 전체 작업 (all manifest jobs) and 작업 대기 (미작성/저장만).
  // The full view groups 국내/해외 and shows a subtotal row (count + amount) for each scope.
  // v0.8.1: user-facing portal status '결재' is labeled '완료', and adds an actionable queue view.
  // v0.8.0: adds save-confirm auto-click, editable reopen for temporary-saved proposals,
  // direct application launch from the list page, and a full 28-job workflow dashboard.
  // v0.7.11: shortcut 4 confirms the approval-line dialog (#apvlOk), while shortcut 5 opens a new proposal.
  // v0.7.10: scoped portal reconciliation now revalidates ALL completed jobs,
  // including legacy completions that lack rqst_no/completion_source.
  const MAIN_FORM_PATH = '/mis/acc/popup/S_ACC_01020100.do';
  const EXPENSE_LIST_API = '/mis/acc/expndtrMng/expndtrResol/selectExpsMangPayout.json';
  const NEW_PROPOSAL_BPM = Object.freeze({
    bizKey: '',
    workFlag: 'newWork',
    processCode: 'B_ACT00002',
    statusCode: 'ST0100',
    subFlag: 'N',
  });
  const pageWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const ETAX_POPUP_MARKER = '전자세금계산서조회';
  const DEFAULT_BRIDGE = 'http://127.0.0.1:8765';
  const APPROVAL_HANDOFF_TIMEOUT_MS = 120000;
  const APPROVAL_HANDOFF_POLL_MS = 250;
  const APPROVAL_HANDOFF_STATE_KEY = 'krissAnnualFeeApprovalHandoffV0710';
  const APPROVAL_HANDOFF_STATE_TTL_MS = 3 * 60 * 1000;
  const SAVE_AUTOCONFIRM_WINDOW_MS = 12000;
  const PORTAL_ACCT_STATUS = Object.freeze({
    '00': {label: '저장만', group: 'saved'},
    '01': {label: '신청중', group: 'progress'},
    '02': {label: '검토중', group: 'progress'},
    '03': {label: '승인중', group: 'progress'},
    '04': {label: '완료', group: 'approved'},
    '05': {label: '반려', group: 'rejected'},
  });

  // Deliberately conservative: final document save and final e-tax popup
  // confirmation remain manual until the operator explicitly opts in.
  const DEFAULT_ETAX_AUTO_CONFIRM = false;

  // ---------- result folder / GM / bridge ----------
  // primary mode: the operator selects the generated result folder once.
  // Chromium stores the FileSystemDirectoryHandle in IndexedDB so the same
  // folder remains available when a BPM proposal or e-tax popup opens in a new
  // window. The old localhost bridge remains a fallback for older environments.
  const FOLDER_DB_NAME = 'kriss-annual-fee-folder-v1';
  const FOLDER_STORE = 'handles';
  const FOLDER_KEY = 'result-root';
  const MANIFEST_DIR = '템퍼몽키용';
  const MANIFEST_FILE = 'manifest.json';

  const gmRequest = (details) => new Promise((resolve, reject) => {
    GM.xmlHttpRequest({
      ...details,
      onload: resolve,
      onerror: reject,
      ontimeout: reject,
    });
  });

  async function settings() {
    return {
      bridgeUrl: (await GM.getValue('bridgeUrl', DEFAULT_BRIDGE)).replace(/\/$/, ''),
      token: await GM.getValue('bridgeToken', ''),
      etaxAutoConfirm: await GM.getValue('etaxAutoConfirm', DEFAULT_ETAX_AUTO_CONFIRM),
    };
  }

  async function configure() {
    const s = await settings();
    const bridgeUrl = prompt('고급 설정 - Bridge URL\n\n결과폴더 직접 선택을 쓰는 경우 설정할 필요가 없습니다.', s.bridgeUrl);
    if (bridgeUrl === null) return;
    const token = prompt('고급 설정 - Bridge Token\n\n비워두면 로컬 결과폴더 모드만 사용합니다.', s.token);
    if (token === null) return;
    const auto = confirm('전자세금계산서가 공급자/총액 기준으로 정확히 1건일 때 포털의 [선택]까지 자동 클릭할까요?\n\n권장: 취소(수동 확인)');
    await GM.setValue('bridgeUrl', bridgeUrl.trim().replace(/\/$/, ''));
    await GM.setValue('bridgeToken', token.trim());
    await GM.setValue('etaxAutoConfirm', auto);
    alert('고급 설정을 저장했습니다.');
  }

  function openFolderDb() {
    return new Promise((resolve, reject) => {
      const idb = pageWindow.indexedDB || window.indexedDB;
      const req = idb.open(FOLDER_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FOLDER_STORE)) db.createObjectStore(FOLDER_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('폴더 저장소를 열지 못했습니다.'));
    });
  }

  async function idbGetHandle() {
    const db = await openFolderDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(FOLDER_STORE, 'readonly');
        const req = tx.objectStore(FOLDER_STORE).get(FOLDER_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async function idbSetHandle(handle) {
    const db = await openFolderDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(FOLDER_STORE, 'readwrite');
        tx.objectStore(FOLDER_STORE).put(handle, FOLDER_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  async function idbClearHandle() {
    const db = await openFolderDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(FOLDER_STORE, 'readwrite');
        tx.objectStore(FOLDER_STORE).delete(FOLDER_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  async function hasPermission(handle, mode = 'readwrite') {
    if (!handle) return false;
    if (typeof handle.queryPermission !== 'function') return true;
    return (await handle.queryPermission({mode})) === 'granted';
  }

  async function requestHandlePermission(handle, mode = 'readwrite') {
    if (!handle) return false;
    if (await hasPermission(handle, mode)) return true;
    if (typeof handle.requestPermission !== 'function') return true;
    return (await handle.requestPermission({mode})) === 'granted';
  }

  async function getStoredResultRoot({request = false} = {}) {
    let handle = null;
    try { handle = await idbGetHandle(); } catch (e) { console.warn('[KRISS annual fee] folder handle read failed', e); }
    if (!handle) return null;
    const ok = request ? await requestHandlePermission(handle) : await hasPermission(handle);
    return ok ? handle : null;
  }

  async function getManifestFileHandle(root, create = false) {
    const autoDir = await root.getDirectoryHandle(MANIFEST_DIR, {create: false});
    return autoDir.getFileHandle(MANIFEST_FILE, {create});
  }

  async function readLocalManifest(root) {
    const fh = await getManifestFileHandle(root, false);
    const file = await fh.getFile();
    const text = await file.text();
    const manifest = JSON.parse(text);
    if (!Array.isArray(manifest.jobs)) throw new Error('manifest.json에 jobs 배열이 없습니다.');
    return manifest;
  }

  async function writeLocalManifest(root, manifest) {
    const fh = await getManifestFileHandle(root, false);
    if (!(await requestHandlePermission(root, 'readwrite'))) {
      throw new Error('결과폴더 쓰기 권한이 없습니다. [결과폴더 지정/권한]을 다시 눌러주세요.');
    }
    const writable = await fh.createWritable();
    await writable.write(JSON.stringify(manifest, null, 2) + '\n');
    await writable.close();
  }

  function splitRelPath(relpath) {
    return String(relpath || '').replace(/\\/g, '/').split('/').filter(Boolean);
  }

  async function getLocalFile(root, relpath) {
    const parts = splitRelPath(relpath);
    if (!parts.length) throw new Error(`첨부 경로가 비었습니다: ${relpath}`);
    let dir = root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, {create: false});
    const fh = await dir.getFileHandle(parts[parts.length - 1], {create: false});
    return fh.getFile();
  }

  async function validateSelectedFolder(root, manifest) {
    const missing = [];
    let required = 0;
    for (const job of manifest.jobs || []) {
      if (!job.portal?.attachments_required) continue;
      for (const rel of [job.pdf_relpath, job.xlsx_relpath]) {
        if (!rel) {
          missing.push(`${job.job_id}: 첨부 경로 없음`);
          continue;
        }
        required += 1;
        try { await getLocalFile(root, rel); }
        catch (_) { missing.push(rel); }
      }
    }
    return {required, missing};
  }

  async function selectResultFolder() {
    const picker = pageWindow.showDirectoryPicker || window.showDirectoryPicker;
    if (typeof picker !== 'function') {
      throw new Error('이 브라우저는 결과폴더 직접 선택을 지원하지 않습니다. Chrome/Edge 최신 버전을 사용하거나 기존 Bridge 모드를 사용하세요.');
    }
    const root = await picker.call(pageWindow, {id: 'kriss-annual-fee-result', mode: 'readwrite'});
    if (!(await requestHandlePermission(root, 'readwrite'))) throw new Error('결과폴더 읽기/쓰기 권한이 필요합니다.');
    let manifest;
    try {
      manifest = await readLocalManifest(root);
    } catch (e) {
      throw new Error(`선택한 폴더에서 ${MANIFEST_DIR}/${MANIFEST_FILE}을 찾지 못했습니다.\n결과 최상위 폴더를 선택하세요.\n\n${e.message || e}`);
    }
    const check = await validateSelectedFolder(root, manifest);
    if (check.missing.length) {
      throw new Error(`manifest는 찾았지만 첨부파일 ${check.missing.length}개가 없습니다.\n\n${check.missing.slice(0, 8).join('\n')}${check.missing.length > 8 ? '\n...' : ''}`);
    }
    await idbSetHandle(root);
    await GM.setValue('currentJobId', '');
    await GM.setValue('currentJobPayload', '');
    await GM.setValue('awaitingEtaxJobId', '');
    return {root, manifest, attachmentCount: check.required};
  }

  async function clearResultFolder() {
    await idbClearHandle();
    await GM.setValue('currentJobId', '');
    await GM.setValue('currentJobPayload', '');
    await GM.setValue('awaitingEtaxJobId', '');
  }

  async function apiGet(path, responseType = 'json') {
    const s = await settings();
    if (!s.token) throw new Error('Bridge Token이 없습니다. [결과폴더 지정]을 사용하거나 고급 Bridge 설정을 하세요.');
    const res = await gmRequest({
      method: 'GET',
      url: `${s.bridgeUrl}${path}`,
      headers: {'X-KRISS-Token': s.token},
      responseType,
      timeout: 30000,
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`Bridge GET 실패: ${res.status}`);
    return responseType === 'json' ? res.response : res;
  }

  async function apiPost(path, body) {
    const s = await settings();
    if (!s.token) throw new Error('Bridge Token이 없습니다.');
    const res = await gmRequest({
      method: 'POST',
      url: `${s.bridgeUrl}${path}`,
      headers: {'X-KRISS-Token': s.token, 'Content-Type': 'application/json'},
      data: JSON.stringify(body),
      responseType: 'json',
      timeout: 30000,
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`Bridge POST 실패: ${res.status}`);
    return res.response;
  }

  async function dataBackend() {
    let stored = null;
    try { stored = await idbGetHandle(); } catch (_) {}
    if (stored) {
      const granted = await hasPermission(stored, 'readwrite');
      return {type: 'folder', root: granted ? stored : null, stored, permission: granted ? 'granted' : 'prompt', name: stored.name || '결과폴더'};
    }
    const s = await settings();
    if (s.token) return {type: 'bridge', name: s.bridgeUrl};
    return {type: 'none'};
  }

  async function getManifest() {
    const backend = await dataBackend();
    if (backend.type === 'folder') {
      if (!backend.root) throw new Error(`결과폴더 '${backend.name}' 권한이 필요합니다. [결과폴더 지정/권한]을 눌러주세요.`);
      return readLocalManifest(backend.root);
    }
    if (backend.type === 'bridge') return apiGet('/api/manifest', 'json');
    throw new Error('결과폴더가 지정되지 않았습니다. [결과폴더 지정]을 먼저 눌러주세요.');
  }

  async function getJobById(jobId) {
    if (!jobId) return null;
    const manifest = await getManifest();
    return (manifest.jobs || []).find(j => j.job_id === jobId) || null;
  }

  async function getFile(relpath) {
    const backend = await dataBackend();
    if (backend.type === 'folder') {
      if (!backend.root) throw new Error(`결과폴더 '${backend.name}' 권한이 필요합니다.`);
      return getLocalFile(backend.root, relpath);
    }
    const encoded = relpath.split('/').map(encodeURIComponent).join('/');
    const res = await apiGet(`/api/file/${encoded}`, 'arraybuffer');
    const filename = relpath.split('/').pop();
    const type = filename.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return new File([res.response], filename, {type});
  }

  async function markStatus(job, status, portalResult = {}) {
    const backend = await dataBackend();
    if (backend.type === 'folder') {
      if (!backend.root) throw new Error(`결과폴더 '${backend.name}' 권한이 필요합니다.`);
      const manifest = await readLocalManifest(backend.root);
      const target = (manifest.jobs || []).find(j => j.job_id === job.job_id);
      if (!target) throw new Error(`manifest에서 작업을 찾지 못했습니다: ${job.job_id}`);
      target.status = status;
      if (portalResult && Object.keys(portalResult).length) {
        target.portal_result = {...(target.portal_result || {}), ...portalResult};
      }
      await writeLocalManifest(backend.root, manifest);
      return {ok: true, mode: 'folder'};
    }
    if (backend.type === 'bridge') {
      return apiPost('/api/status', {job_id: job.job_id, status, portal_result: portalResult});
    }
    throw new Error('결과폴더/Bridge가 설정되지 않았습니다.');
  }


  // ---------- portal list reconciliation / duplicate protection ----------
  function plainPortalRow(row) {
    if (!row) return {};
    if (typeof row.toJSON === 'function') return row.toJSON();
    const out = {};
    for (const key of [
      'docuType', 'rqstNo', 'billtype', 'rqstDt', 'rqstEmp', 'rqstEmpNo',
      'drAmt', 'rqstDesc', 'currentNm', 'acctStatus', 'jungbing', 'chumbu',
      'reslNo', 'reslEmp', 'jiRqstNo', 'docId', 'skDocId', 'filePath', 'fileName'
    ]) {
      if (row[key] !== undefined) out[key] = row[key];
    }
    return out;
  }

  async function portalGridQuery(data) {
    // IMPORTANT: Do not reproduce the list endpoint with fetch/ajax manually.
    // The KRISS server rejected both JSON and urlencoded hand-written requests
    // with HTTP 415. The real expenditure-list page queries this endpoint through
    // kriss.ui.grid, so instantiate a tiny off-screen KRISS grid and let the
    // portal's own transport/parameterMap/content-type logic make the request.
    await waitFor(() => pageWindow.kriss?.ui?.grid, 15000, 100, '포털 kriss.ui.grid');
    await waitFor(() => pageWindow.jQuery || window.jQuery, 15000, 100, '포털 jQuery');

    const $ = pageWindow.jQuery || window.jQuery;
    const id = `kriss-reconcile-grid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const host = document.createElement('div');
    host.id = id;
    Object.assign(host.style, {
      position: 'fixed', left: '-12000px', top: '0', width: '20px', height: '20px',
      opacity: '0', pointerEvents: 'none', overflow: 'hidden', zIndex: '-1'
    });
    document.body.appendChild(host);

    return new Promise((resolve, reject) => {
      let grid = null;
      let settled = false;
      let started = false;
      const cleanup = () => {
        try {
          const kg = $(host).data('kendoGrid');
          if (kg && typeof kg.destroy === 'function') kg.destroy();
        } catch (_) {}
        try { host.remove(); } catch (_) {}
      };
      const finish = (ok, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        setTimeout(cleanup, 0);
        ok ? resolve(value) : reject(value instanceof Error ? value : new Error(String(value)));
      };
      const timer = setTimeout(() => {
        finish(false, new Error('포털 목록 조회 시간 초과: 포털 kriss.ui.grid 요청이 완료되지 않았습니다.'));
      }, 25000);

      try {
        grid = new pageWindow.kriss.ui.grid({
          selector: `#${id}`,
          url: EXPENSE_LIST_API,
          postDataFunc: function () { return {...(data || {})}; },
          pageable: false,
          autoBind: false,
          editable: false,
          sortable: false,
          filterable: false,
          height: 20,
          schema: {
            model: {
              id: 'rqstNo',
              fields: {
                docuType: {type: 'string'},
                rqstNo: {type: 'string'},
                billtype: {type: 'string'},
                rqstDt: {type: 'date', parse: function (val) { return pageWindow.kendo?.parseDate ? pageWindow.kendo.parseDate(val, 'yyyyMMdd') : val; }},
                rqstEmp: {type: 'string'},
                rqstEmpNo: {type: 'string'},
                drAmt: {type: 'number'},
                rqstDesc: {type: 'string'},
                currentNm: {type: 'string'},
                acctStatus: {type: 'string'},
                filePath: {type: 'string'},
                fileName: {type: 'string'},
              }
            }
          },
          columns: [
            {field: 'rqstNo', title: '발의번호', width: 100},
            {field: 'drAmt', title: '금액', width: 100},
            {field: 'rqstDesc', title: '적요', width: 200},
          ],
          dataBound: function (e) {
            if (!started) return;
            try {
              let rows = [];
              if (grid && typeof grid.getData === 'function') rows = grid.getData() || [];
              else if (e?.sender?.dataSource?.data) rows = e.sender.dataSource.data() || [];
              finish(true, Array.from(rows).map(plainPortalRow));
            } catch (err) {
              finish(false, new Error(`포털 목록 결과 변환 실패: ${String(err?.message || err)}`));
            }
          }
        });

        // Use the exact same public reload method used by the real list page.
        setTimeout(() => {
          try {
            if (!grid || typeof grid.reload !== 'function') {
              finish(false, new Error('포털 kriss.ui.grid.reload 함수를 찾지 못했습니다.'));
              return;
            }
            started = true;
            grid.reload();
          } catch (err) {
            finish(false, new Error(`포털 목록 grid.reload 실패: ${String(err?.message || err)}`));
          }
        }, 0);
      } catch (err) {
        finish(false, new Error(`포털 목록용 임시 grid 생성 실패: ${String(err?.message || err)}`));
      }
    });
  }

  function extractPortalRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    const candidates = [
      payload.data,
      payload.rows,
      payload.list,
      payload.result,
      payload.items,
      payload.content,
      payload.data?.data,
      payload.data?.rows,
      payload.data?.list,
      payload.result?.data,
      payload.result?.rows,
    ];
    for (const c of candidates) if (Array.isArray(c)) return c;
    return [];
  }

  function quarterDateRange(manifest) {
    const year = Number(manifest?.year);
    const quarter = Number(manifest?.quarter);
    if (!year || quarter < 1 || quarter > 4) return {from: '', to: ''};

    const sm = (quarter - 1) * 3 + 1;
    const quarterStart = new Date(year, sm - 1, 1);
    const quarterEnd = new Date(year, sm + 2, 0);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Portal reconciliation must never look beyond today. For an active quarter,
    // use quarter-start ~ today; after the quarter ends, cap at quarter-end.
    // A future-quarter manifest is not a valid reconciliation target yet.
    if (today < quarterStart) return {from: '', to: '', future: true};
    const effectiveEnd = today < quarterEnd ? today : quarterEnd;
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const fmt8 = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    // The list screen displays yyyy-MM-dd, but its real search form is passed
    // through kendoSerializeAll(). The server-side contract uses compact
    // yyyyMMdd values. Keep display values separate from request values so the
    // panel remains readable while the API gets the same date shape as KRISS.
    return {
      from: fmt(quarterStart),
      to: fmt(effectiveEnd),
      requestFrom: fmt8(quarterStart),
      requestTo: fmt8(effectiveEnd),
      future: false,
    };
  }

  async function rememberPortalUser() {
    let empNo = String(document.querySelector('#tb_expndtrItncBacInfo #rqstEmp')?.value || '').trim();
    let empNm = String(document.querySelector('#tb_expndtrItncBacInfo #rqstEmpNm')?.value || '').trim();

    // The expenditure-list page has an empty search #rqstEmp field, so do not
    // use it as identity. Its My Info photo filename contains the logged-in empNo.
    if (!empNo) {
      const img = document.querySelector('.my_info img[src*="filename="]');
      if (img) {
        try {
          const filename = new URL(img.src, location.href).searchParams.get('filename') || '';
          empNo = filename.replace(/\.[^.]+$/, '').trim();
        } catch (_) {}
      }
    }
    if (!empNm) {
      empNm = normalizeText(document.querySelector('.my_info .user')?.textContent || '').split(' ')[0] || '';
    }
    if (empNo) await GM.setValue('portalUserId', empNo);
    if (empNm) await GM.setValue('portalUserName', empNm);
    return {empNo, empNm};
  }

  async function getPortalUserId() {
    const live = await rememberPortalUser();
    return live.empNo || String(await GM.getValue('portalUserId', '') || '').trim();
  }

  async function fetchOwnPatentExpenseRows(manifest) {
    const empNo = await getPortalUserId();
    if (!empNo) throw new Error('현재 로그인 사용자의 사번을 확인하지 못했습니다. 지출발의 신규 화면 또는 지출[발의,결의] 목록 화면에서 다시 실행하세요.');
    const range = quarterDateRange(manifest);
    const base = {
      // Mirror the actual #searchForm fields from the expenditure-list page.
      billCls: '1',
      cdCls: 'AC11',
      rqstDtFr: '',
      rqstDtTo: '',
      rqstDeptNm: '',
      rqstDept: '',
      rqstEmpNm: '',
      rqstEmp: empNo,
      reslDtFr: '',
      reslDtTo: '',
      dangYn: '',
      billNo: '',
      docuType: '27',
      acctStatus: '',
      frAmt: '',
      toAmt: '',
      rqstNo: '',
      reslNo: '',
      jiRqstNo: '',
      order: '1',
      busiRegNm: '',
      busiRegNo: '',
      errorYn: 'A',
    };
    if (range.future) {
      throw new Error('manifest 분기가 아직 시작되지 않아 포털 대조를 실행하지 않습니다.');
    }
    if (!range.from || !range.to) {
      throw new Error('manifest의 연도/분기에서 포털 대조 날짜 범위를 만들지 못했습니다.');
    }

    // The real list page displays dates as yyyy-MM-dd, but postDataFunc returns
    // $('#searchForm').kendoSerializeAll(). Passing the display string directly
    // to our off-screen grid silently produced 0 rows. Send compact yyyyMMdd
    // first, which matches the portal's serialized/server date contract.
    //
    // Safety retry: if compact form returns 0, retry the SAME scoped interval
    // with the display format. This only handles a future portal serialization
    // change; it never removes the date scope, so old-quarter rows cannot leak in.
    const attempts = [
      {...base, rqstDtFr: range.requestFrom, rqstDtTo: range.requestTo},
      {...base, rqstDtFr: range.from, rqstDtTo: range.to},
    ];
    let rows = [];
    let usedDateEncoding = 'yyyyMMdd';
    for (let i = 0; i < attempts.length; i++) {
      rows = await portalGridQuery(attempts[i]);
      usedDateEncoding = i === 0 ? 'yyyyMMdd' : 'yyyy-MM-dd';
      if (rows.length) break;
    }
    rows = rows.filter(r => !r.rqstEmpNo || String(r.rqstEmpNo).trim() === empNo)
      .filter(r => !r.docuType || String(r.docuType).trim() === '27');
    Object.defineProperty(rows, '__dateEncoding', {value: usedDateEncoding, enumerable: false});
    return rows;
  }

  function basename(relpath) {
    const p = splitRelPath(relpath);
    return p.length ? p[p.length - 1] : '';
  }

  function descriptionMatchKey(v) {
    // The list page/server occasionally normalizes spacing (e.g. "납부 수수료"
    // -> "납부수수료"). Amount + document type + attachment filenames remain
    // independent safeguards, so ignore whitespace for the description key.
    return normalizeText(v).replace(/\s+/g, '');
  }

  function portalRowKey(row) {
    return `${String(row?.rqstNo || '')}|${normalizeAmount(row?.drAmt)}|${descriptionMatchKey(row?.rqstDesc)}`;
  }

  function matchPortalRowsForJob(job, rows) {
    const desc = descriptionMatchKey(job.portal?.description || job.description);
    const amount = Number(job.portal?.amount ?? job.amount ?? 0);
    let candidates = rows.filter(r =>
      descriptionMatchKey(r.rqstDesc) === desc &&
      normalizeAmount(r.drAmt) === amount &&
      (!r.docuType || String(r.docuType) === '27')
    );

    if (candidates.length > 1 && job.portal?.attachments_required) {
      const expected = [basename(job.pdf_relpath), basename(job.xlsx_relpath)].filter(Boolean);
      const withFiles = candidates.filter(r => {
        const actual = String(r.fileName || '').split(';').map(x => x.trim()).filter(Boolean);
        return expected.length && expected.every(name => actual.includes(name));
      });
      if (withFiles.length) candidates = withFiles;
    }
    return candidates;
  }

  function canRevalidateCompletedJob(job) {
    // Once the scoped portal-list query succeeds, that list is authoritative
    // for this quarter. Older script versions could leave status=completed
    // without rqst_no/completion_source. If such a legacy completed job cannot
    // be matched by description + amount (+ attachments when needed), it must
    // be returned to pending instead of remaining as a ghost completion.
    return job?.status === 'completed';
  }

  async function persistReconcileChanges(matches, resets) {
    if (!matches.length && !resets.length) return;
    const backend = await dataBackend();
    const now = new Date().toISOString();
    if (backend.type === 'folder') {
      if (!backend.root) throw new Error(`결과폴더 '${backend.name}' 권한이 필요합니다.`);
      const manifest = await readLocalManifest(backend.root);
      for (const m of matches) {
        const target = (manifest.jobs || []).find(j => j.job_id === m.job.job_id);
        if (!target) continue;
        const wasCompleted = target.status === 'completed';
        target.status = 'completed';
        target.portal_result = {
          ...(target.portal_result || {}),
          rqst_no: String(m.row.rqstNo || ''),
          rqst_dt: m.row.rqstDt ? String(m.row.rqstDt instanceof Date ? `${m.row.rqstDt.getFullYear()}-${String(m.row.rqstDt.getMonth()+1).padStart(2,'0')}-${String(m.row.rqstDt.getDate()).padStart(2,'0')}` : m.row.rqstDt) : '',
          acct_status: String(m.row.acctStatus || ''),
          current_nm: String(m.row.currentNm || ''),
          bill_type: String(m.row.billtype || ''),
          resl_no: String(m.row.reslNo || ''),
          ji_rqst_no: String(m.row.jiRqstNo || ''),
          portal_file_names: String(m.row.fileName || ''),
          portal_reconciled_at: now,
          // Keep automation_save_observer when this was genuinely generated by
          // the automation; otherwise record that it was discovered in the list.
          completion_source: wasCompleted && target.portal_result?.completion_source === 'automation_save_observer'
            ? 'automation_save_observer' : 'portal_expense_list',
        };
      }
      for (const x of resets) {
        const target = (manifest.jobs || []).find(j => j.job_id === x.job.job_id);
        if (!target) continue;
        const prev = {...(target.portal_result || {})};
        target.status = 'pending';
        target.portal_result = {
          ...prev,
          previous_rqst_no: String(prev.rqst_no || ''),
          rqst_no: '',
          acct_status: '',
          current_nm: '',
          portal_file_names: '',
          portal_reconciled_at: now,
          portal_missing_at: now,
          completion_source: 'portal_missing_reset',
        };
        delete target.portal_result.completed_at;
      }
      await writeLocalManifest(backend.root, manifest);
      return;
    }
    if (backend.type === 'bridge') {
      for (const m of matches) {
        await apiPost('/api/status', {
          job_id: m.job.job_id,
          status: 'completed',
          portal_result: {
            rqst_no: String(m.row.rqstNo || ''),
            rqst_dt: m.row.rqstDt ? String(m.row.rqstDt instanceof Date ? `${m.row.rqstDt.getFullYear()}-${String(m.row.rqstDt.getMonth()+1).padStart(2,'0')}-${String(m.row.rqstDt.getDate()).padStart(2,'0')}` : m.row.rqstDt) : '',
            acct_status: String(m.row.acctStatus || ''),
            current_nm: String(m.row.currentNm || ''),
            bill_type: String(m.row.billtype || ''),
            resl_no: String(m.row.reslNo || ''),
            ji_rqst_no: String(m.row.jiRqstNo || ''),
            portal_file_names: String(m.row.fileName || ''),
            portal_reconciled_at: now,
            completion_source: m.job?.portal_result?.completion_source === 'automation_save_observer'
              ? 'automation_save_observer' : 'portal_expense_list',
          },
        });
      }
      for (const x of resets) {
        await apiPost('/api/status', {
          job_id: x.job.job_id,
          status: 'pending',
          portal_result: {
            previous_rqst_no: String(x.job?.portal_result?.rqst_no || ''),
            rqst_no: '', acct_status: '', current_nm: '', portal_file_names: '',
            portal_reconciled_at: now,
            portal_missing_at: now,
            completion_source: 'portal_missing_reset',
            completed_at: '',
          },
        });
      }
      return;
    }
    throw new Error('결과폴더/Bridge가 설정되지 않았습니다.');
  }

  async function reconcileWithPortalList() {
    const manifest = await getManifest();
    const queryRange = quarterDateRange(manifest);
    const rows = await fetchOwnPatentExpenseRows(manifest);
    const dateEncoding = rows.__dateEncoding || 'portal';
    const matches = [];      // pending/in-progress -> completed recovery
    const verified = [];     // already completed and still present
    const resets = [];       // completed but portal proposal was deleted/missing
    const conflicts = [];
    const unmatched = [];
    const seenRqstNos = new Set();

    // First verify completed jobs. This prevents a row already belonging to a
    // completed/manual job from being reused by another pending job.
    const completed = (manifest.jobs || []).filter(j => j.status === 'completed');
    for (const job of completed) {
      let candidates = matchPortalRowsForJob(job, rows)
        .filter(r => !seenRqstNos.has(String(r.rqstNo || '')));
      const oldRqstNo = String(job?.portal_result?.rqst_no || '').trim();
      if (oldRqstNo) {
        const exact = candidates.filter(r => String(r.rqstNo || '').trim() === oldRqstNo);
        if (exact.length === 1) candidates = exact;
      }
      if (candidates.length === 1) {
        const row = candidates[0];
        seenRqstNos.add(String(row.rqstNo || ''));
        verified.push({job, row});
      } else if (candidates.length > 1) {
        conflicts.push({job, rows: candidates, keys: candidates.map(portalRowKey)});
      } else if (canRevalidateCompletedJob(job)) {
        // The manifest says completed, but the proposal number no longer exists
        // in the authoritative portal list. Treat it as deleted and make it
        // eligible for automation again.
        resets.push({job});
      }
    }

    // Then recover any currently unfinished jobs that already exist in portal.
    for (const job of manifest.jobs || []) {
      if (job.status === 'completed') continue;
      const candidates = matchPortalRowsForJob(job, rows)
        .filter(r => !seenRqstNos.has(String(r.rqstNo || '')));
      if (candidates.length === 1) {
        const row = candidates[0];
        seenRqstNos.add(String(row.rqstNo || ''));
        matches.push({job, row});
      } else if (candidates.length > 1) {
        conflicts.push({job, rows: candidates, keys: candidates.map(portalRowKey)});
      } else {
        unmatched.push(job);
      }
    }

    await persistReconcileChanges(matches.concat(verified), resets);
    return {matches, verified, resets, conflicts, unmatched, portalRows: rows, queryRange, dateEncoding};
  }

  function reconciliationSummary(r) {
    const rangeText = r.queryRange?.from && r.queryRange?.to ? ` · ${r.queryRange.from}~${r.queryRange.to}` : '';
    const encText = r.portalRows.length === 0 && r.dateEncoding ? ` · 날짜형식 ${r.dateEncoding}` : '';
    const parts = [
      `포털 목록 대조 완료 · 조회 ${r.portalRows.length}건${rangeText}${encText}`,
      `포털 연결 복구 ${r.matches.length}건 · 기존 연결 확인 ${r.verified.length}건`,
    ];
    if (r.resets.length) parts.push(`미확인/삭제 완료건 ${r.resets.length}건 → 다시 미작성으로 전환`);
    if (r.conflicts.length) {
      parts.push(`⚠ 중복 후보 ${r.conflicts.length}건 - 자동 완료처리하지 않음`);
      parts.push(r.conflicts.slice(0, 3).map(x => `· ${x.job.portal?.description || x.job.description}`).join('\n'));
    }
    return parts.join('\n');
  }

  function portalStageForJob(job) {
    const pr = job?.portal_result || {};
    const rqstNo = String(pr.rqst_no || '').trim();
    const code = String(pr.acct_status || '').trim();
    if (!rqstNo) {
      if (job?.status === 'in_progress') return {key: 'prepared', label: '작성중', group: 'not_created', code: ''};
      return {key: 'not_created', label: '미작성', group: 'not_created', code: ''};
    }
    const meta = PORTAL_ACCT_STATUS[code];
    if (meta) return {key: meta.group === 'saved' ? 'saved' : code, label: meta.label, group: meta.group, code};
    return {key: 'portal_unknown', label: code ? `포털상태 ${code}` : '저장됨(상태확인전)', group: 'unknown', code};
  }

  function workflowStats(manifest) {
    const jobs = manifest?.jobs || [];
    const stats = {
      total: jobs.length,
      notCreated: 0,
      saved: 0,
      progress: 0,
      applying: 0,
      reviewing: 0,
      approving: 0,
      approved: 0,
      rejected: 0,
      unknown: 0,
      created: 0,
    };
    for (const job of jobs) {
      const st = portalStageForJob(job);
      if (st.group === 'not_created') stats.notCreated += 1;
      else {
        stats.created += 1;
        if (st.group === 'saved') stats.saved += 1;
        else if (st.group === 'progress') {
          stats.progress += 1;
          if (st.code === '01') stats.applying += 1;
          else if (st.code === '02') stats.reviewing += 1;
          else if (st.code === '03') stats.approving += 1;
        }
        else if (st.group === 'approved') stats.approved += 1;
        else if (st.group === 'rejected') stats.rejected += 1;
        else stats.unknown += 1;
      }
    }
    return stats;
  }

  function workflowHeadline(manifest) {
    const st = workflowStats(manifest);
    return `전체 ${st.total}건 · 작업대기 ${st.notCreated + st.saved}건 · 미작성 ${st.notCreated}건 · 저장만 ${st.saved}건`;
  }

  function actionableWorkflowJobs(manifest) {
    return (manifest?.jobs || []).filter(job => {
      const stage = portalStageForJob(job);
      return stage.group === 'not_created' || stage.group === 'saved';
    });
  }

  function jobScopeKey(job) {
    const raw = String(job?.portal?.scope || job?.scope || '').trim().toLowerCase();
    if (raw === 'domestic' || raw === '국내') return 'domestic';
    if (raw === 'overseas' || raw === 'foreign' || raw === '해외' || raw === '국외') return 'overseas';
    const text = `${job?.portal?.scope_text || ''} ${job?.portal?.description || job?.description || ''}`;
    if (/해외|국외/.test(text)) return 'overseas';
    if (/국내/.test(text)) return 'domestic';
    return 'other';
  }

  function scopeTotals(jobs) {
    const out = {
      domestic: {label: '국내', count: 0, amount: 0},
      overseas: {label: '해외', count: 0, amount: 0},
      other: {label: '기타', count: 0, amount: 0},
      total: {label: '전체', count: 0, amount: 0},
    };
    for (const job of jobs || []) {
      const key = jobScopeKey(job);
      const bucket = out[key] || out.other;
      const amount = Number(job?.amount ?? job?.portal?.amount ?? 0) || 0;
      bucket.count += 1;
      bucket.amount += amount;
      out.total.count += 1;
      out.total.amount += amount;
    }
    return out;
  }

  function escHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ---------- generic DOM/Kendo helpers ----------
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  async function waitFor(fn, timeout = 15000, interval = 100, label = '조건') {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const v = fn();
        if (v) return v;
      } catch (_) {}
      await sleep(interval);
    }
    throw new Error(`${label} 대기 시간 초과`);
  }

  function jq() {
    const $ = pageWindow.jQuery || window.jQuery;
    if (!$) throw new Error('포털 jQuery가 아직 준비되지 않았습니다.');
    return $;
  }

  function normalizeDigits(v) { return String(v || '').replace(/\D/g, ''); }
  function normalizeAmount(v) { return Number(String(v || '').replace(/[^0-9.-]/g, '')) || 0; }
  function normalizeText(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
  function fmt(n) { return Number(n || 0).toLocaleString('ko-KR'); }

  function setPlain(selector, value) {
    const $ = jq();
    const el = document.querySelector(selector);
    if (!el) throw new Error(`요소 없음: ${selector}`);
    try {
      if (typeof $(el).kval === 'function') $(el).kval(value == null ? '' : String(value));
      else $(el).val(value == null ? '' : String(value));
    } catch (_) {
      el.value = value == null ? '' : String(value);
    }
    el.dispatchEvent(new Event('input', {bubbles: true}));
    return el;
  }

  function setKendoDropDownValue(selector, value) {
    const $ = jq();
    const el = $(selector);
    if (!el.length) throw new Error(`드롭다운 없음: ${selector}`);
    const widget = el.data('kendoDropDownList');
    if (widget) widget.value(String(value));
    else if (typeof el.kval === 'function') el.kval(String(value));
    else el.val(String(value));
  }

  async function selectBillKindLikeUser(value) {
    const $ = jq();
    const widget = await waitFor(
      () => $('#billKind').data('kendoDropDownList'),
      15000, 100, '#billKind Kendo DropDownList'
    );
    const data = await waitFor(() => {
      const d = widget.dataSource?.data?.();
      return d && d.length ? d : null;
    }, 15000, 100, '#billKind 데이터');
    const target = String(value);
    const idx = Array.from(data).findIndex(x => String(x.id ?? x.value ?? '') === target);
    if (idx < 0) throw new Error(`영수증구분 코드 ${target}를 찾지 못했습니다.`);

    // The portal wires important logic to the Kendo `select` event rather than
    // the native `change` event: it resets stale receipt data, sets VAT, toggles
    // the e-tax button, sets billTypeChanged and publishes the payer event.
    // Trigger that handler first, then commit the target value.
    let selectEventTriggered = false;
    try {
      const item = widget.ul?.children?.().eq(idx);
      if (item && item.length) {
        widget.trigger('select', {item});
        selectEventTriggered = true;
      }
    } catch (_) {
      // Fallback below still sets all manifest-required values explicitly.
    }
    widget.value(target);
    $('#billKind').trigger('change');
    return selectEventTriggered;
  }

  async function setKendoDropDownByText(selector, text) {
    const $ = jq();
    const widget = await waitFor(
      () => $(selector).data('kendoDropDownList'),
      15000, 100, `${selector} Kendo DropDownList`
    );
    await waitFor(() => {
      const data = widget.dataSource && widget.dataSource.data ? widget.dataSource.data() : [];
      return data && data.length ? data : null;
    }, 15000, 100, `${selector} 데이터`);
    const data = widget.dataSource.data();
    const item = Array.from(data).find(x => String(x.name || x.text || '').trim() === text.trim());
    if (!item) throw new Error(`드롭다운 항목을 찾지 못했습니다: ${text}`);
    const value = item.id != null ? item.id : (item.value != null ? item.value : item.code);
    widget.value(String(value));
    $(selector).trigger('change');
    return String(value);
  }

  function setNumeric(selector, amount) {
    const $ = jq();
    const el = $(selector);
    const widget = el.data('kendoNumericTextBox');
    if (widget) {
      widget.value(Number(amount));
      widget.trigger('change');
    } else if (typeof el.kval === 'function') {
      el.kval(String(amount));
      el.trigger('change');
    } else {
      el.val(String(amount)).trigger('change');
    }
  }

  function getNumeric(selector) {
    const $ = jq();
    const el = $(selector);
    const widget = el.data('kendoNumericTextBox');
    if (widget) return Number(widget.value() || 0);
    return normalizeAmount(el.val());
  }

  function localDateYmd(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getRequestDate() {
    const $ = jq();
    const el = $('#tb_expndtrItncBacInfo [name="rqstDt"]');
    if (!el.length) return '';
    try {
      if (typeof el.kval === 'function') return String(el.kval() || '').trim();
    } catch (_) {}
    return String(el.val() || '').trim();
  }

  function setUsageDateFromRequest(portal) {
    if (!portal || portal.use_date_policy !== 'request_date') return '';
    const $ = jq();
    const date = getRequestDate() || localDateYmd();
    const el = $('#vatDt');
    if (!el.length) return '';
    const widget = el.data('kendoDatePicker');
    if (typeof el.kval === 'function') {
      el.kval(date);
      el.trigger('change');
    } else if (widget) {
      const parts = date.split('-').map(Number);
      widget.value(new Date(parts[0], parts[1] - 1, parts[2]));
      widget.trigger('change');
    } else {
      el.val(date).trigger('change');
    }
    return date;
  }

  async function setBudgetAndExpense(portal) {
    const $ = jq();
    setPlain('#budgCd', portal.budget_code);
    $('#budgCd').trigger('change');
    await waitFor(() => {
      const v = String($('#budgNm').val() || '').trim();
      return v ? v : null;
    }, 20000, 150, `예산코드 ${portal.budget_code} 조회`);

    setPlain('#acctCd', portal.expense_code);
    $('#acctCd').trigger('change');
    await waitFor(() => {
      const v = String($('#acctNm').val() || '').trim();
      return v ? v : null;
    }, 20000, 150, `비목코드 ${portal.expense_code} 조회`);

    const actualBudget = String($('#budgCd').val() || '').trim();
    const actualBudgetName = normalizeText($('#budgNm').val());
    const actualExpense = String($('#acctCd').val() || '').trim();
    const actualExpenseName = normalizeText($('#acctNm').val());
    if (actualBudget !== String(portal.budget_code)) {
      throw new Error(`예산코드 조회 결과 불일치: ${actualBudget} != ${portal.budget_code}`);
    }
    if (portal.budget_name && actualBudgetName !== normalizeText(portal.budget_name)) {
      throw new Error(`예산명 조회 결과 불일치: ${actualBudgetName} != ${portal.budget_name}`);
    }
    if (actualExpense !== String(portal.expense_code)) {
      throw new Error(`비목코드 조회 결과 불일치: ${actualExpense} != ${portal.expense_code}`);
    }
    if (portal.expense_name && actualExpenseName !== normalizeText(portal.expense_name)) {
      throw new Error(`비목명 조회 결과 불일치: ${actualExpenseName} != ${portal.expense_name}`);
    }
  }

  function publishBillKindChange(value) {
    const $ = jq();
    if (typeof $.publish === 'function') $.publish('rciptInfoCom/billKind/change', String(value));
  }

  async function setReceiptOther(portal) {
    const $ = jq();
    await selectBillKindLikeUser(portal.receipt.bill_kind || '10');
    // Keep explicit assertions even though the portal's select handler normally
    // sets these; this makes drift visible and protects against a changed handler.
    setKendoDropDownValue('#vatCd', portal.receipt.vat_code || '9');
    publishBillKindChange(portal.receipt.bill_kind || '10');
    setKendoDropDownValue('#payCls', portal.receipt.pay_class || '1');
    $('#btnTaxBill').hide();
  }

  function fillVendor(vendor) {
    const $ = jq();
    setPlain('#custNm', vendor.name);
    setPlain('#busiRegNo', vendor.business_reg_no);
    setPlain('#mgmtNo', vendor.portal_mgmt_no);
    setPlain('#dpstor', vendor.depositor);
    setPlain('#dpstorNo', vendor.depositor_no || '');
    setPlain('#bankNm', vendor.bank_name);
    setPlain('#bankCd', vendor.bank_code);
    setPlain('#bankAcctNo', vendor.bank_account);
    if ($('#payCls').length) setKendoDropDownValue('#payCls', '1');
  }

  // The portal's e-tax callback automatically clicks #btnCustNm, which would
  // open a second vendor popup. For this automation we already have the vendor
  // master values in the manifest, so suppress exactly that one synthetic click
  // and fill the vendor after the e-tax choice returns.
  function suppressNextVendorPopup(timeoutMs = 180000) {
    const btn = document.querySelector('#btnCustNm');
    if (!btn) return () => {};
    let active = true;
    const handler = (e) => {
      if (!active) return;
      active = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      btn.removeEventListener('click', handler, true);
    };
    btn.addEventListener('click', handler, true);
    const timer = setTimeout(() => {
      active = false;
      btn.removeEventListener('click', handler, true);
    }, timeoutMs);
    return () => {
      clearTimeout(timer);
      active = false;
      btn.removeEventListener('click', handler, true);
    };
  }

  async function prepareEtax(job) {
    const portal = job.portal;
    const r = portal.receipt;
    // Pre-fill supplier before emulating the real receipt selection because the
    // portal's `select` handler immediately opens the e-tax lookup popup.
    setPlain('#custNm', portal.vendor.name);
    setPlain('#busiRegNo', portal.vendor.business_reg_no);
    suppressNextVendorPopup();
    await GM.setValue('currentJobId', job.job_id);
    await GM.setValue('awaitingEtaxJobId', job.job_id);
    const selectEventTriggered = await selectBillKindLikeUser(r.bill_kind || '14');
    setKendoDropDownValue('#vatCd', r.vat_code || '1');
    publishBillKindChange(r.bill_kind || '14');
    setKendoDropDownValue('#payCls', r.pay_class || '2');
    // If a future Kendo build does not expose list items for manual event
    // triggering, open the lookup via the portal's dedicated button instead.
    if (!selectEventTriggered) document.querySelector('#btnTaxBill')?.click();
  }

  function verifyEtaxReturned(job) {
    const etaxPk = String(document.querySelector('#etaxClsPk')?.value || '').trim();
    if (!etaxPk) throw new Error('전자세금계산서가 아직 선택되지 않았습니다. 조회 팝업에서 승인번호를 확인하고 [선택]하세요.');
    const actual = getNumeric('#drCrAmt');
    const expected = Number(job.portal.receipt.etax.expected_total || job.amount || 0);
    if (expected && actual !== expected) {
      throw new Error(`전자세금계산서 총액 불일치: 포털 ${fmt(actual)}원 / 예상 ${fmt(expected)}원`);
    }
    fillVendor(job.portal.vendor);
    // e-tax uses 업체입금 in the form component. Do not overwrite it with the
    // annual-fee 계좌입금 default after verification.
    setKendoDropDownValue('#payCls', job.portal.receipt.pay_class || '2');
    return etaxPk;
  }

  async function setDescriptionAndAmount(job, {fromEtax = false} = {}) {
    setPlain('#rqstDesc', job.portal?.description || job.description);
    if (!fromEtax) setNumeric('#drCrAmt', job.amount);
  }

  function gridRowCount() {
    const $ = jq();
    const grid = $('#expndtrGrid').data('kendoGrid');
    if (grid && grid.dataSource) return grid.dataSource.data().length;
    return document.querySelectorAll('#expndtrGrid .k-grid-content tbody tr').length;
  }

  async function addExpenseRow() {
    const before = gridRowCount();
    const btn = document.querySelector('#btnExpndtrRowInsert');
    if (!btn) throw new Error('지출발의 [행추가] 버튼을 찾지 못했습니다.');
    btn.click();
    await waitFor(() => gridRowCount() > before, 25000, 150, '지출발의 행추가');
    return gridRowCount();
  }

  // ---------- attachment helper ----------
  function findUploadInput() {
    return document.querySelector('#uploader1 input[type="file"], input.dz-hidden-input[type="file"]');
  }

  async function queueAttachments(job) {
    if (!job.portal?.attachments_required) return [];
    const [pdf, xlsx] = await Promise.all([getFile(job.pdf_relpath), getFile(job.xlsx_relpath)]);
    const names = [pdf.name, xlsx.name];
    const currentText = document.querySelector('#uploader1')?.textContent || '';
    if (names.every(n => currentText.includes(n))) return names;

    // kriss.ui.uploader is backed by Dropzone. Prefer its live instance when it
    // is exposed; otherwise use the hidden file input generated by Dropzone.
    const dzHost = document.querySelector('#uploader1 .dropzone');
    const dz = dzHost?.dropzone || null;
    if (dz && typeof dz.addFile === 'function') {
      if (!currentText.includes(pdf.name)) dz.addFile(pdf);
      if (!currentText.includes(xlsx.name)) dz.addFile(xlsx);
    } else {
      const input = await waitFor(() => findUploadInput(), 8000, 100, 'Dropzone 파일 입력');
      const dt = new DataTransfer();
      if (!currentText.includes(pdf.name)) dt.items.add(pdf);
      if (!currentText.includes(xlsx.name)) dt.items.add(xlsx);
      if (dt.files.length) {
        input.files = dt.files;
        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.dispatchEvent(new Event('change', {bubbles: true}));
      }
    }
    await waitFor(() => {
      const t = document.querySelector('#uploader1')?.textContent || '';
      return names.every(n => t.includes(n)) ? true : null;
    }, 15000, 150, '첨부파일 큐 등록');
    return names;
  }

  async function fillAndAddJob(job) {
    if (!job.portal) throw new Error('manifest에 portal payload가 없습니다. 현재 버전의 prepare 결과로 파일을 다시 생성하세요.');
    await setKendoDropDownByText('#docuType', job.portal.document_type_text);
    await sleep(300); // docuType change clears/reinitializes budget fields asynchronously.
    await setBudgetAndExpense(job.portal);

    if (job.portal.receipt.mode === 'etax') {
      const etaxPk = verifyEtaxReturned(job);
      await setDescriptionAndAmount(job, {fromEtax: true});
      const rows = await addExpenseRow();
      const files = await queueAttachments(job);
      await GM.setValue('awaitingEtaxJobId', '');
      return {rows, files, etaxPk};
    }

    await setReceiptOther(job.portal);
    setUsageDateFromRequest(job.portal);
    fillVendor(job.portal.vendor);
    await setDescriptionAndAmount(job);
    const rows = await addExpenseRow();
    const files = await queueAttachments(job);
    return {rows, files};
  }

  async function prepareJob(job) {
    if (!job.portal) throw new Error('manifest portal 정보 없음');
    await setKendoDropDownByText('#docuType', job.portal.document_type_text);
    await sleep(300);
    await setBudgetAndExpense(job.portal);
    if (job.portal.receipt.mode === 'etax') {
      await setDescriptionAndAmount(job, {fromEtax: true});
      await prepareEtax(job);
      return {mode: 'etax-wait'};
    }
    await setReceiptOther(job.portal);
    setUsageDateFromRequest(job.portal);
    fillVendor(job.portal.vendor);
    await setDescriptionAndAmount(job);
    return {mode: 'ready'};
  }

  // ---------- e-tax popup helper ----------
  function popupColumnIndex(field) {
    const headers = Array.from(document.querySelectorAll('#billGrid .k-grid-header th'));
    return headers.findIndex(th => th.getAttribute('data-field') === field);
  }

  function popupRows() {
    const fields = ['selrCorpNo', 'selrCorpNm', 'regsDate', 'totlAmt', 'taxAmt', 'issuSeqno', 'name'];
    const idx = Object.fromEntries(fields.map(f => [f, popupColumnIndex(f)]));
    return Array.from(document.querySelectorAll('#billGrid .k-grid-content tbody tr')).map(tr => {
      const tds = Array.from(tr.querySelectorAll(':scope > td'));
      const val = (f) => idx[f] >= 0 && tds[idx[f]] ? (tds[idx[f]].getAttribute('title') || tds[idx[f]].textContent || '').trim() : '';
      return {
        tr,
        checkbox: tr.querySelector('input[name="isChecked"]'),
        supplierNo: val('selrCorpNo'),
        supplierName: val('selrCorpNm'),
        date: val('regsDate'),
        total: normalizeAmount(val('totlAmt')),
        tax: normalizeAmount(val('taxAmt')),
        approval: val('issuSeqno'),
        item: val('name'),
      };
    });
  }

  function setMasked(selector, digits) {
    const $ = jq();
    const el = $(selector);
    const widget = el.data('kendoMaskedTextBox');
    if (widget) widget.value(digits);
    else el.val(digits);
    el.trigger('change');
  }

  async function searchEtaxCandidate(job, popupMsg) {
    const etax = job.portal.receipt.etax;
    setMasked('[name="selrCorpNo"]', etax.supplier_business_no);
    setPlain('[name="corpNm"]', etax.supplier_name);
    setPlain('[name="itemNm"]', etax.item_keyword || etax.fallback_item_keyword || '연차');
    document.querySelector('#receipCd_N')?.click();
    document.querySelector('#btnSearch')?.click();

    await sleep(500);
    await waitFor(() => document.querySelectorAll('#billGrid .k-grid-content tbody tr').length > 0, 15000, 150, '전자세금계산서 검색결과');
    const expected = Number(etax.expected_total || job.amount || 0);
    const supplier = normalizeDigits(etax.supplier_business_no);
    let rows = popupRows().filter(r => normalizeDigits(r.supplierNo) === supplier && (!expected || r.total === expected));

    if (rows.length === 0 && etax.item_keyword) {
      // If the exact item keyword was too restrictive, retry with a broader annual-fee keyword.
      setPlain('[name="itemNm"]', etax.fallback_item_keyword || '연차');
      document.querySelector('#btnSearch')?.click();
      await sleep(700);
      rows = popupRows().filter(r => normalizeDigits(r.supplierNo) === supplier && (!expected || r.total === expected));
    }

    if (rows.length === 0) {
      // The popup currently advertises a -7 day default for its start-date field.
      // A quarterly invoice can be much older by the time the expenditure is entered,
      // so only after the narrow search fails, widen the date range by clearing it.
      setPlain('#tripStrDdt', '');
      setPlain('#tripEndDdt', '');
      document.querySelector('#btnSearch')?.click();
      await sleep(900);
      rows = popupRows().filter(r => normalizeDigits(r.supplierNo) === supplier && (!expected || r.total === expected));
    }

    document.querySelectorAll('#billGrid .kriss-etax-candidate').forEach(el => el.classList.remove('kriss-etax-candidate'));
    if (rows.length === 1) {
      const r = rows[0];
      r.tr.classList.add('kriss-etax-candidate');
      r.tr.style.outline = '3px solid #e67e22';
      r.tr.style.outlineOffset = '-3px';
      if (r.checkbox && !r.checkbox.checked) r.checkbox.click();
      popupMsg.textContent = `추천 1건 체크됨\n${r.supplierName}\n${fmt(r.total)}원\n승인번호 ${r.approval}\n${r.item}\n\n승인번호를 확인한 뒤 포털 [선택] 버튼을 누르세요.`;
      const s = await settings();
      if (s.etaxAutoConfirm || etax.auto_confirm) {
        await sleep(400);
        document.querySelector('#deptSelectBtn')?.click();
      }
      return r;
    }
    if (rows.length > 1) {
      popupMsg.textContent = `공급자/총액이 같은 후보가 ${rows.length}건입니다. 승인번호/품명을 확인하여 직접 선택하세요.`;
    } else {
      popupMsg.textContent = `예상 총액 ${fmt(expected)}원의 정확한 후보를 자동 식별하지 못했습니다. 검색 조건을 수정하여 직접 선택하세요.`;
    }
    return null;
  }

  function createEtaxPopupPanel() {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;width:360px;background:#fff;border:1px solid #555;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.25);padding:10px;font:13px/1.45 sans-serif;color:#111';
    box.innerHTML = `<div style="font-weight:700">연차유지료 전자세금계산서 도우미 v${VERSION}</div><pre id="kriss-etax-msg" style="white-space:pre-wrap;background:#f5f5f5;padding:8px;margin:8px 0 0"></pre>`;
    document.body.appendChild(box);
    return box.querySelector('#kriss-etax-msg');
  }

  async function initEtaxPopup() {
    const msg = createEtaxPopupPanel();
    try {
      const jobId = await GM.getValue('awaitingEtaxJobId', '') || await GM.getValue('currentJobId', '');
      let job = null;
      try {
        const payload = await GM.getValue('currentJobPayload', '');
        if (payload) job = JSON.parse(payload);
      } catch (_) {}
      if (!job || job.job_id !== jobId) job = await getJobById(jobId);
      if (!job?.portal || job.portal.receipt?.mode !== 'etax') {
        msg.textContent = '현재 작업이 전자세금계산서 수수료 작업이 아닙니다.';
        return;
      }
      msg.textContent = `${job.portal?.description || job.description}\n예상 총액 ${fmt(job.amount)}원\n검색 중...`;
      await searchEtaxCandidate(job, msg);
    } catch (e) {
      msg.textContent = String(e);
    }
  }

  // ---------- main page UX ----------
  function pendingJobs(manifest) {
    return (manifest.jobs || []).filter(j => j.status !== 'completed');
  }

  async function automationProgress(manifest) {
    // User-facing progress is always based on the full manifest workload.
    // A proposal that already existed manually is simply one completed item;
    // it is not removed from the denominator. This keeps the numbers stable:
    // total 28 / completed N / remaining 28-N.
    const jobs = manifest?.jobs || [];
    const completed = jobs.filter(j => j.status === 'completed').length;
    const remaining = jobs.length - completed;
    return {
      total: jobs.length,
      completed,
      remaining,
      targetJobs: jobs,
      excluded: 0,
    };
  }

  function currentRequestNo() {
    return String(document.querySelector('#rqstNo')?.value || '').trim();
  }

  function createMainPanel() {
    const box = document.createElement('div');
    box.id = 'kriss-annual-fee-panel';
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;width:420px;background:#fff;border:1px solid #d0d0d0;border-radius:14px;box-shadow:0 10px 36px rgba(0,0,0,.24);font:13px/1.48 -apple-system,BlinkMacSystemFont,"Malgun Gothic",sans-serif;padding:14px;color:#111';
    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <div style="font-weight:800;font-size:16px;flex:1">연차유지료 자동화 <span style="font-size:11px;color:#777">v${VERSION}</span></div>
        <button id="kriss-reconcile" style="font-size:12px" title="내 지출발의 목록과 manifest를 대조합니다">포털 대조</button>
        <button id="kriss-folder" style="font-size:12px">결과폴더 지정</button>
      </div>
      <div id="kriss-source" style="margin-top:7px;color:#666;font-size:12px">결과폴더 확인 중...</div>
      <div id="kriss-progress" style="margin-top:10px;height:7px;background:#eee;border-radius:99px;overflow:hidden"><div style="height:100%;width:0;background:#555;transition:width .2s"></div></div>
      <div id="kriss-job-info" style="white-space:pre-wrap;background:#f6f7f8;padding:10px;border-radius:9px;min-height:105px;margin-top:9px">작업 불러오는 중...</div>
      <button id="kriss-compose" style="width:100%;margin-top:10px;padding:10px 8px;font-weight:800;font-size:14px">이 건 자동작성　[1]</button>
      <div style="display:flex;gap:6px;margin-top:7px">
        <button id="kriss-new" style="flex:1">지출발의신청　[5]</button>
        <button id="kriss-all" style="flex:1">전체 작업</button>
        <button id="kriss-status" style="flex:1">작업 대기</button>
      </div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button id="kriss-reload" style="flex:1">새로고침</button>
        <button id="kriss-advanced" style="width:44px" title="Bridge / 전자세금계산서 자동선택 설정">⚙</button>
      </div>
      <div style="margin-top:7px;font-size:11px;color:#777">1 자동작성 · 2 저장 · 3 승인 · 4 결재확인→다음 · 5 지출발의신청</div>
      <div id="kriss-msg" style="margin-top:8px;color:#555;white-space:pre-wrap;min-height:20px"></div>`;
    document.body.appendChild(box);
    return box;
  }

  let currentJob = null;
  let currentManifest = null;
  let lastResult = null;
  let composing = false;
  let savedCurrentJob = false;
  let approvalHandoff = null;

  function setComposeDisabled(disabled) {
    const b = document.getElementById('kriss-compose');
    if (b) b.disabled = !!disabled;
  }

  async function updateSourceLabel() {
    const el = document.getElementById('kriss-source');
    if (!el) return;
    const b = await dataBackend();
    if (b.type === 'folder') {
      el.textContent = b.root ? `📁 ${b.name} · 로컬 직접 연결` : `📁 ${b.name} · 폴더 권한 필요`;
    } else if (b.type === 'bridge') {
      el.textContent = `🔌 Bridge fallback · ${b.name}`;
    } else {
      el.textContent = '📁 결과폴더를 먼저 지정하세요.';
    }
  }

  async function renderProgress(manifest) {
    const p = await automationProgress(manifest);
    const st = workflowStats(manifest);
    // Progress means "left my hands": saved-only items are still actionable, so they do not fill the bar.
    const handedOff = Math.max(0, st.total - st.notCreated - st.saved);
    const bar = document.querySelector('#kriss-progress > div');
    if (bar) bar.style.width = st.total ? `${Math.round(handedOff / st.total * 100)}%` : '0%';
    return p;
  }

  async function loadNext() {
    const info = document.getElementById('kriss-job-info');
    const msg = document.getElementById('kriss-msg');
    try {
      await updateSourceLabel();
      const manifest = await getManifest();
      currentManifest = manifest;
      const pgr = await renderProgress(manifest);
      const sourceEl = document.getElementById('kriss-source');
      if (sourceEl && manifest.year && manifest.quarter) sourceEl.textContent += ` · ${manifest.year}년 ${manifest.quarter}분기`;
      const targetPending = pgr.targetJobs.filter(j => j.status !== 'completed');
      const pending = targetPending;
      const openedRqstNo = currentRequestNo();
      const openedJob = openedRqstNo
        ? pgr.targetJobs.find(j => String(j?.portal_result?.rqst_no || '').trim() === openedRqstNo)
        : null;
      const remembered = await GM.getValue('currentJobId', '');
      currentJob = openedJob || (remembered && pending.find(j => j.job_id === remembered)) || pending[0] || null;
      lastResult = null;
      savedCurrentJob = false;
      if (!currentJob) {
        const wst = workflowStats(manifest);
        info.textContent = workflowHeadline(manifest);
        msg.textContent = wst.saved
          ? `새로 작성할 건은 없습니다. 저장만 ${wst.saved}건은 [작업 대기]에서 승인 재개할 수 있습니다.`
          : '새로 작성할 작업이 없습니다. 처리할 작업이 없습니다.';
        setComposeDisabled(true);
        return;
      }
      await GM.setValue('currentJobId', currentJob.job_id);
      await GM.setValue('currentJobPayload', JSON.stringify(currentJob));
      const p = currentJob.portal || {};
      const receipt = p.receipt || {};
      info.textContent = [
        workflowHeadline(manifest),
        `${p.scope_text || currentJob.scope} / ${p.expense_kind || currentJob.job_type}`,
        `예산  ${p.budget_name || currentJob.budget_name}`,
        `      ${p.budget_code || currentJob.budget_code}  /  ${p.expense_name || ''} ${p.expense_code || ''}`,
        `금액  ${fmt(currentJob.amount)}원${currentJob.item_count ? `  ·  ${currentJob.item_count}건` : ''}`,
        `증빙  ${receipt.bill_kind_text || ''}  ·  ${receipt.pay_class_text || ''}`,
        `적요  ${p.description || currentJob.description}`,
      ].join('\n');

      if (currentRequestNo()) {
        const stage = portalStageForJob(currentJob);
        if (stage.group === 'saved') {
          const approveBtn = document.querySelector('#btnBpmApprove');
          const disabled = !!(approveBtn && (approveBtn.disabled || approveBtn.getAttribute('disabled') === 'disabled'));
          const bi = pageWindow.bpmInfo || {};
          msg.textContent = `현재 발의 ${currentRequestNo()} · 상태: 저장만(임시저장)\n` +
            (disabled
              ? `승인 버튼 비활성 · workFlag=${bi.workFlag || '?'} · statusCode=${bi.statusCode || '?'}\n[작업 대기] 또는 지출결의 관리의 [임시저장 승인 재개]로 다시 여세요.`
              : '[3 승인] → 결재선 확인 후 [4]로 상신을 계속할 수 있습니다.');
        } else {
          msg.textContent = `현재 발의 ${currentRequestNo()} · 상태: ${stage.label}\n새 작업은 [지출발의신청]에서 작성하세요.`;
        }
        setComposeDisabled(true);
      } else {
        const wst = workflowStats(manifest);
        msg.textContent = `미작성 ${wst.notCreated}건 · [이 건 자동작성] 한 번으로 행추가와 PDF/XLSX 첨부까지 진행합니다.`;
        setComposeDisabled(false);
      }
    } catch (e) {
      currentJob = null;
      info.textContent = '작업을 불러오지 못했습니다.';
      msg.textContent = String(e.message || e);
      setComposeDisabled(true);
    }
  }

  async function chooseFolderFromPanel() {
    const msg = document.getElementById('kriss-msg');
    try {
      msg.textContent = '결과폴더를 확인하는 중...';
      const r = await selectResultFolder();
      msg.textContent = `${r.root.name}\nmanifest ${r.manifest.jobs.length}건 / 첨부 ${r.attachmentCount}개 확인 완료.\n포털의 내 지출발의 목록을 대조하는 중...`;
      let rec = null;
      try { rec = await reconcileWithPortalList(); } catch (e) { console.warn('[KRISS annual fee] portal reconciliation failed', e); }
      await loadNext();
      if (rec) msg.textContent = reconciliationSummary(rec);
      else msg.textContent = `${r.root.name}\nmanifest ${r.manifest.jobs.length}건 / 첨부 ${r.attachmentCount}개 확인 완료.\n포털 대조는 실패했습니다. 필요하면 [포털 대조]를 다시 누르세요.`;
    } catch (e) {
      if (e && e.name === 'AbortError') {
        msg.textContent = '폴더 선택을 취소했습니다.';
      } else {
        msg.textContent = String(e.message || e);
      }
    }
  }

  async function reconcileFromPanel() {
    const msg = document.getElementById('kriss-msg');
    try {
      await ensureFolderPermissionFromPanel();
      msg.textContent = '포털의 내 지출발의 목록과 현재 결과폴더를 대조하는 중...';
      const r = await reconcileWithPortalList();
      await loadNext();
      msg.textContent = reconciliationSummary(r);
    } catch (e) {
      msg.textContent = `포털 대조 실패\n${String(e.message || e)}`;
    }
  }

  async function ensureFolderPermissionFromPanel() {
    const b = await dataBackend();
    if (b.type === 'folder' && b.stored && !b.root) {
      const ok = await requestHandlePermission(b.stored, 'readwrite');
      if (!ok) throw new Error('결과폴더 권한이 허용되지 않았습니다.');
      await updateSourceLabel();
      return true;
    }
    return false;
  }

  async function waitForEtaxSelection(job) {
    const msg = document.getElementById('kriss-msg');
    msg.textContent = '전자세금계산서 조회창에서 추천행의 승인번호/품목을 확인하고 [선택]하세요.\n선택이 돌아오면 자동으로 계속 진행합니다.';
    await waitFor(() => {
      const pk = String(document.querySelector('#etaxClsPk')?.value || '').trim();
      return pk || null;
    }, 10 * 60 * 1000, 250, '전자세금계산서 선택');
    verifyEtaxReturned(job);
    setPlain('#rqstDesc', job.portal?.description || job.description);
    const rows = await addExpenseRow();
    const files = await queueAttachments(job);
    await GM.setValue('awaitingEtaxJobId', '');
    return {rows, files, etaxPk: String(document.querySelector('#etaxClsPk')?.value || '').trim()};
  }

  async function composeCurrent() {
    const msg = document.getElementById('kriss-msg');
    if (composing) return;
    if (!currentJob) return void (msg.textContent = '현재 작업이 없습니다. 결과폴더를 지정하거나 새로고침하세요.');
    if (currentRequestNo()) return void (msg.textContent = '저장된 발의 화면에는 다음 작업을 입력하지 않습니다. [새 지출발의]를 눌러주세요.');
    if (gridRowCount() > 0) {
      const ok = confirm('현재 지출발의 내역에 이미 행이 있습니다. 자동작성을 다시 실행하면 중복 입력될 수 있습니다.\n\n그래도 계속할까요?');
      if (!ok) return;
    }

    composing = true;
    setComposeDisabled(true);
    try {
      await ensureFolderPermissionFromPanel();
      await markStatus(currentJob, 'in_progress', {started_at: new Date().toISOString()});
      msg.textContent = '지출구분 · 예산 · 비목 · 영수증 · 거래처를 입력하는 중...';

      if (currentJob.portal?.receipt?.mode === 'etax') {
        await setKendoDropDownByText('#docuType', currentJob.portal.document_type_text);
        await sleep(300);
        await setBudgetAndExpense(currentJob.portal);
        await setDescriptionAndAmount(currentJob, {fromEtax: true});
        await prepareEtax(currentJob);
        lastResult = await waitForEtaxSelection(currentJob);
      } else {
        lastResult = await fillAndAddJob(currentJob);
      }

      await markStatus(currentJob, 'in_progress', {
        prepared_at: new Date().toISOString(),
        ...(lastResult || {}),
      });
      msg.textContent = `자동작성 완료\n지출행 ${lastResult?.rows || gridRowCount()}개 · 첨부 ${(lastResult?.files || []).length}개\n\n내용을 확인한 뒤 포털 상단 [저장]을 누르세요. 저장 성공은 자동으로 완료 기록합니다.`;
    } catch (e) {
      msg.textContent = `자동작성 중단\n${String(e.message || e)}`;
      try { await markStatus(currentJob, 'pending', {last_error: String(e.message || e), failed_at: new Date().toISOString()}); } catch (_) {}
    } finally {
      composing = false;
      if (!currentRequestNo()) setComposeDisabled(false);
    }
  }

  async function recordSaveSuccess(expectedJob, rqstNo) {
    if (!expectedJob || savedCurrentJob) return;
    savedCurrentJob = true;
    const msg = document.getElementById('kriss-msg');
    try {
      const savedAt = new Date().toISOString();
      await markStatus(expectedJob, 'completed', {
        rqst_no: rqstNo,
        acct_status: '00',
        saved_at: savedAt,
        completed_at: savedAt,
        completion_source: 'automation_save_observer',
        ...(lastResult || {}),
      });
      await GM.setValue('currentJobId', '');
      await GM.setValue('currentJobPayload', '');
      msg.textContent = `저장 완료 · ${rqstNo}\n상태: 저장만(임시저장). [3 승인] → [4 결재확인]으로 상신할 수 있습니다.`;
      await loadNext();
    } catch (e) {
      savedCurrentJob = false;
      msg.textContent = `포털 저장은 확인했지만 완료 기록에 실패했습니다.\n${String(e.message || e)}`;
    }
  }

  function bindSaveWatcher() {
    const btn = document.querySelector('#btnBpmSave');
    if (!btn || btn.dataset.krissSaveWatch === '1') return;
    btn.dataset.krissSaveWatch = '1';
    btn.addEventListener('click', () => {
      const jobAtClick = currentJob;
      if (!jobAtClick || composing) return;
      const before = currentRequestNo();
      (async () => {
        try {
          const rqstNo = await waitFor(() => {
            const now = currentRequestNo();
            if (!now) return null;
            if (!before || now !== before) return now;
            // A save on an already numbered document is not a new job completion.
            return null;
          }, 45000, 250, '포털 저장 완료');
          await recordSaveSuccess(jobAtClick, rqstNo);
        } catch (_) {
          // Validation failure/cancel is normal; keep the job in progress.
        }
      })();
    }, true);
  }

  let saveAutoConfirmSeq = 0;

  function isVisibleElement(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    try {
      const st = pageWindow.getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity || 1) !== 0;
    } catch (_) {
      return true;
    }
  }

  function findSaveConfirmOkButton() {
    const dialogs = Array.from(document.querySelectorAll(
      '.k-window-content[role="dialog"], .k-window-content, .k-dialog, [role="dialog"]'
    )).filter(isVisibleElement);
    for (const dlg of dialogs) {
      if (dlg.id === 'bpmApprovalLines' || dlg.closest?.('#bpmApprovalLines')) continue;
      const compact = String(dlg.textContent || '').replace(/\s+/g, '');
      if (!/저장/.test(compact)) continue;
      if (!/(하시겠습니까|하겠습니까|할까요|진행하시겠습니까|저장하시겠습니까)/.test(compact)) continue;
      const controls = Array.from(dlg.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"]'))
        .filter(isVisibleElement);
      const ok = controls.find(x => /^(확인|예|Yes)$/i.test(String(x.value || x.textContent || '').replace(/\s+/g, '').trim()));
      if (ok) return ok;
    }
    return null;
  }

  function armSaveAutoConfirm() {
    const seq = ++saveAutoConfirmSeq;
    const deadline = Date.now() + SAVE_AUTOCONFIRM_WINDOW_MS;
    const poll = () => {
      if (seq !== saveAutoConfirmSeq) return;
      const ok = findSaveConfirmOkButton();
      if (ok) {
        saveAutoConfirmSeq += 1;
        try {
          shortcutNotice('저장 확인 자동 처리');
          ok.click();
        } catch (e) {
          console.warn('[KRISS annual fee] save confirmation auto-click failed', e);
        }
        return;
      }
      if (Date.now() < deadline) setTimeout(poll, 60);
    };
    setTimeout(poll, 40);
  }

  function installSaveAutoConfirmWatcher() {
    if (pageWindow.__krissAnnualFeeSaveAutoConfirmV0800) return;
    pageWindow.__krissAnnualFeeSaveAutoConfirmV0800 = true;
    document.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('#btnBpmSave');
      if (!btn || btn.disabled || btn.getAttribute('disabled') === 'disabled') return;
      armSaveAutoConfirm();
    }, true);
  }

  function scriptJson(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  }

  function approvalStateRead() {
    try {
      const raw = pageWindow.localStorage.getItem(APPROVAL_HANDOFF_STATE_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw);
      if (!state || !state.token) return null;
      if (state.expiresAt && Date.now() > Number(state.expiresAt)) {
        pageWindow.localStorage.removeItem(APPROVAL_HANDOFF_STATE_KEY);
        return null;
      }
      return state;
    } catch (_) {
      return null;
    }
  }

  function approvalStateWrite(patch) {
    try {
      const current = approvalStateRead() || {};
      const next = {
        ...current,
        ...(patch || {}),
        updatedAt: Date.now(),
      };
      if (!next.expiresAt) next.expiresAt = Date.now() + APPROVAL_HANDOFF_STATE_TTL_MS;
      pageWindow.localStorage.setItem(APPROVAL_HANDOFF_STATE_KEY, JSON.stringify(next));
      return next;
    } catch (_) {
      return null;
    }
  }

  function approvalStateClear(token) {
    try {
      const state = approvalStateRead();
      if (!state || !token || state.token === token) pageWindow.localStorage.removeItem(APPROVAL_HANDOFF_STATE_KEY);
    } catch (_) {}
  }

  function armApprovalHandoffIntent(source) {
    if (!document.querySelector('#kriss-annual-fee-panel')) return null;
    const requestNo = currentRequestNo();
    if (!requestNo) return null;
    const token = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return approvalStateWrite({
      token,
      phase: 'armed',
      requestNo,
      nextJobLabel: nextJobLabelForHandoff(),
      source: source || 'approve',
      armedAt: Date.now(),
      expiresAt: Date.now() + APPROVAL_HANDOFF_STATE_TTL_MS,
    });
  }

  function approvalWaitHtml({token, requestNo, nextJobLabel}) {
    const action = `${location.origin}${MAIN_FORM_PATH}?popupAt=popup`;
    const params = NEW_PROPOSAL_BPM;
    return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>다음 지출발의 준비</title>
<style>
  html,body{height:100%;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic",sans-serif;background:#f5f6f8;color:#171717}
  body{display:flex;align-items:center;justify-content:center}
  .box{width:min(520px,calc(100vw - 48px));background:#fff;border:1px solid #d9dce1;border-radius:16px;padding:24px;box-shadow:0 18px 55px rgba(0,0,0,.16)}
  h1{font-size:19px;margin:0 0 10px} p{margin:7px 0;line-height:1.6;color:#555}.status{margin-top:16px;padding:12px 14px;background:#f4f5f7;border-radius:10px;font-weight:700;color:#333;white-space:pre-wrap}
  .meta{font-size:12px;color:#777}.actions{display:flex;justify-content:flex-end;margin-top:16px}button{border:1px solid #c8ccd2;background:#fff;border-radius:8px;padding:7px 14px;cursor:pointer}
</style>
</head>
<body>
  <div class="box">
    <h1>다음 지출발의 준비</h1>
    <p>최종 승인 처리가 끝나면 이 창이 자동으로 새 지출발의 화면으로 전환됩니다.</p>
    <div class="meta">현재 발의 ${String(requestNo || '')}${nextJobLabel ? ` · 다음 작업 ${String(nextJobLabel)}` : ''}</div>
    <div id="status" class="status">승인 처리 완료 대기 중…</div>
    <div class="actions"><button id="cancel" type="button">다음 창 취소</button></div>
  </div>
<script>
(() => {
  'use strict';
  const ACTION = ${scriptJson(action)};
  const PARAMS = ${scriptJson(params)};
  const STORAGE_KEY = ${scriptJson(APPROVAL_HANDOFF_STATE_KEY)};
  const TOKEN = ${scriptJson(token)};
  const DEADLINE = Date.now() + ${APPROVAL_HANDOFF_TIMEOUT_MS};
  const POLL = ${APPROVAL_HANDOFF_POLL_MS};
  const status = document.getElementById('status');
  let launched = false;
  let timer = null;

  function state() {
    try {
      const x = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return x && x.token === TOKEN ? x : null;
    } catch (_) { return null; }
  }

  function submitNewProposal() {
    if (launched) return;
    launched = true;
    status.textContent = '승인 완료 · 새 지출발의 여는 중…';
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = ACTION;
    form.target = '_self';
    form.style.display = 'none';
    Object.keys(PARAMS).forEach((name) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = PARAMS[name] == null ? '' : String(PARAMS[name]);
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  document.getElementById('cancel').addEventListener('click', () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    window.close();
  });

  timer = setInterval(() => {
    const s = state();
    if (s && s.phase === 'completed') {
      clearInterval(timer);
      setTimeout(submitNewProposal, 350);
      return;
    }
    if (s && ['cancelled','failed','not-completed'].includes(s.phase)) {
      clearInterval(timer);
      status.textContent = '승인이 완료되지 않아 다음 발의 자동 시작을 취소했습니다.';
      setTimeout(() => window.close(), 2200);
      return;
    }
    if (Date.now() >= DEADLINE) {
      clearInterval(timer);
      status.textContent = '승인 완료 신호를 받지 못해 다음 발의 자동 시작을 취소했습니다.';
      setTimeout(() => window.close(), 2200);
    }
  }, POLL);
  window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer); });
})();
<\/script>
</body>
</html>`;
  }

  function nextJobLabelForHandoff() {
    const jobs = currentManifest?.jobs || [];
    const next = jobs.find(j => j.status !== 'completed' && j.job_id !== currentJob?.job_id) || null;
    if (!next) return '';
    const p = next.portal || {};
    const budget = p.budget_name || next.budget_name || p.budget_code || next.budget_code || '';
    const amount = Number(next.amount || 0);
    return [budget, amount ? `${amount.toLocaleString('ko-KR')}원` : ''].filter(Boolean).join(' · ');
  }

  function reserveNextProposalAtFinalConfirm(state, source) {
    if (!state || !state.token || !state.requestNo) return null;
    if (approvalHandoff?.popup && !approvalHandoff.popup.closed && approvalHandoff.token === state.token) return approvalHandoff.popup;

    const target = `kriss_annual_approval_handoff_${Date.now()}`;
    // Ask Chromium for a real popup window rather than a foreground tab when
    // possible. We immediately return focus to the portal confirmation window.
    const features = 'popup=yes,width=620,height=360,resizable=yes,scrollbars=yes';
    const popup = pageWindow.open('about:blank', target, features);
    if (!popup) {
      approvalStateWrite({...state, phase: 'confirmed-no-window', handoffError: 'popup-blocked'});
      shortcutNotice('다음 창 예약이 차단되었습니다. 승인 후 [5]로 새 발의를 여세요.');
      return null;
    }

    try {
      popup.document.open();
      popup.document.write(approvalWaitHtml({token: state.token, requestNo: state.requestNo, nextJobLabel: state.nextJobLabel || ''}));
      popup.document.close();
      approvalHandoff = {popup, target, token: state.token, requestNo: state.requestNo, source: source || 'final-confirm', createdAt: Date.now()};
      approvalStateWrite({...state, phase: 'standby-open', standbyAt: Date.now()});
      // Do not drag the operator away from the portal's final confirmation.
      try { popup.blur(); pageWindow.focus(); } catch (_) {}
      setTimeout(() => { try { pageWindow.focus(); } catch (_) {} }, 0);
      setTimeout(() => { try { pageWindow.focus(); } catch (_) {} }, 80);
      return popup;
    } catch (e) {
      try { popup.close(); } catch (_) {}
      approvalHandoff = null;
      approvalStateWrite({...state, phase: 'confirmed-no-window', handoffError: String(e.message || e)});
      console.warn('[KRISS annual fee] final-confirm handoff window failed', e);
      return null;
    }
  }

  function installApprovalCompletionHook() {
    if (pageWindow.__krissAnnualFeeCompleteTaskHookV079) return;
    let tries = 0;
    const attempt = () => {
      if (pageWindow.__krissAnnualFeeCompleteTaskHookV079) return;
      const original = pageWindow.fnCompleteTask;
      if (typeof original !== 'function') {
        if (++tries < 80) setTimeout(attempt, 100);
        return;
      }
      if (original.__krissAnnualFeeWrappedV079) {
        pageWindow.__krissAnnualFeeCompleteTaskHookV079 = true;
        return;
      }
      const wrapped = function () {
        const state0 = approvalStateRead();
        const requestNo = currentRequestNo();
        let token = null;
        if (state0 && state0.phase === 'armed' && state0.requestNo === requestNo) {
          token = state0.token;
          approvalStateWrite({...state0, phase: 'final-confirm', finalConfirmAt: Date.now()});
        }
        const ret = original.apply(this, arguments);
        if (token && ret && typeof ret.done === 'function') {
          ret.done(function (completed) {
            const state = approvalStateRead();
            if (!state || state.token !== token) return;
            if (completed === 'completed') {
              approvalStateWrite({...state, phase: 'completed', completedAt: Date.now()});
            } else {
              approvalStateWrite({...state, phase: 'not-completed', result: String(completed == null ? '' : completed), finishedAt: Date.now()});
            }
          });
          if (typeof ret.fail === 'function') {
            ret.fail(function () {
              const state = approvalStateRead();
              if (state && state.token === token) approvalStateWrite({...state, phase: 'failed', finishedAt: Date.now()});
            });
          }
        }
        return ret;
      };
      try { Object.defineProperty(wrapped, '__krissAnnualFeeWrappedV079', {value: true}); } catch (_) { wrapped.__krissAnnualFeeWrappedV079 = true; }
      pageWindow.fnCompleteTask = wrapped;
      pageWindow.__krissAnnualFeeCompleteTaskHookV079 = true;
    };
    attempt();
  }

  function installApprovalHandoffWatcher() {
    if (pageWindow.__krissAnnualFeeApprovalIntentV079) return;
    pageWindow.__krissAnnualFeeApprovalIntentV079 = true;
    document.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('#btnBpmApprove');
      if (!btn || btn.disabled || btn.getAttribute('disabled') === 'disabled') return;
      if (!currentRequestNo()) return;
      try { armApprovalHandoffIntent(e.isTrusted ? 'portal-button' : 'shortcut-button'); }
      catch (err) { console.warn('[KRISS annual fee] approval handoff arm skipped', err); }
    }, true);
  }

  function installFinalApprovalConfirmWatcher() {
    if (pageWindow.__krissAnnualFeeFinalConfirmV079) return;
    pageWindow.__krissAnnualFeeFinalConfirmV079 = true;
    document.addEventListener('click', (e) => {
      if (!e.isTrusted) return;
      const control = e.target?.closest?.('button,a,input[type="button"],input[type="submit"],[role="button"]');
      if (!control) return;
      const text = String(control.value || control.textContent || '').replace(/\s+/g, '').trim();
      const state = approvalStateRead();
      if (!state || state.phase !== 'final-confirm') return;
      if (state.finalConfirmAt && Date.now() - Number(state.finalConfirmAt) > APPROVAL_HANDOFF_STATE_TTL_MS) return;

      if (/^(취소|아니오|닫기)$/.test(text)) {
        approvalStateWrite({...state, phase: 'cancelled', cancelledAt: Date.now()});
        return;
      }
      if (!/^확인/.test(text)) return;
      reserveNextProposalAtFinalConfirm(state, 'final-confirm-click');
    }, true);
  }

  function postBpmFormToNewWindow() {
    const target = `kriss_new_proposal_${Date.now()}`;
    const features = 'width=1700,height=960,resizable=yes,scrollbars=yes';
    const popup = pageWindow.open('about:blank', target, features);
    if (!popup) throw new Error('새 창이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도하세요.');

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${location.origin}${MAIN_FORM_PATH}?popupAt=popup`;
    form.target = target;
    form.style.display = 'none';
    Object.entries(NEW_PROPOSAL_BPM).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    try {
      form.submit();
    } finally {
      form.remove();
    }
    return 'raw-post';
  }

  function openNewProposal() {
    // This screen is not a bookmarkable GET page. A normal portal launch POSTs
    // BPM context. Preserve that contract explicitly so `workFlag` is never lost.
    const $ = pageWindow.jQuery;
    if ($ && typeof $.postWindow === 'function') {
      try {
        $.postWindow(`${MAIN_FORM_PATH}?popupAt=popup`, {
          width: 1700,
          height: 960,
          modalDialog: false,
          center: 'screen',
          scrollbars: true,
          resizable: true,
          dataSource: Object.entries(NEW_PROPOSAL_BPM).map(([name, value]) => ({name, value})),
        });
        return '$.postWindow';
      } catch (e) {
        console.warn('[KRISS annual fee] $.postWindow failed; falling back to raw BPM POST', e);
      }
    }

    // `$.postWindow` is part of the normal portal common library, but the raw
    // POST fallback keeps the launcher usable on portal pages where that helper
    // is not loaded yet. Same-origin cookies/referrer/opener are preserved.
    return postBpmFormToNewWindow();
  }

  function postBpmContextToNewWindow(params, prefix = 'kriss_bpm_work') {
    const target = `${prefix}_${Date.now()}`;
    const popup = pageWindow.open('about:blank', target, 'width=1700,height=960,resizable=yes,scrollbars=yes');
    if (!popup) throw new Error('새 창이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도하세요.');
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${location.origin}${MAIN_FORM_PATH}?popupAt=popup`;
    form.target = target;
    form.style.display = 'none';
    Object.entries(params || {}).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value == null ? '' : String(value);
      form.appendChild(input);
    });
    document.body.appendChild(form);
    try { form.submit(); } finally { form.remove(); }
    return 'raw-post';
  }

  function openSavedProposalForApproval(rqstNo) {
    rqstNo = String(rqstNo || '').trim();
    if (!rqstNo) throw new Error('발의번호가 없습니다.');
    // The management list always uses fnShowReadOnlyBpmPopup, so approval is
    // intentionally disabled there. Re-enter the exact BPM task context instead.
    // Portal-observed myWork context: processCode + bizKey + statusCode + workFlag=myWork.
    if (typeof pageWindow.fnShowWorkBpmPopup === 'function') {
      try {
        pageWindow.fnShowWorkBpmPopup(MAIN_FORM_PATH, 'B_ACT00002', rqstNo, 'ST0100');
        return 'fnShowWorkBpmPopup';
      } catch (e) {
        console.warn('[KRISS annual fee] fnShowWorkBpmPopup failed; using POST fallback', e);
      }
    }

    const params = {
      bizKey: rqstNo,
      workFlag: 'myWork',
      processCode: 'B_ACT00002',
      statusCode: 'ST0100',
      subFlag: 'N',
    };
    const $ = pageWindow.jQuery;
    if ($ && typeof $.postWindow === 'function') {
      try {
        $.postWindow(`${MAIN_FORM_PATH}?popupAt=popup`, {
          width: 1700, height: 960, modalDialog: false, center: 'screen',
          scrollbars: true, resizable: true,
          dataSource: Object.entries(params).map(([name, value]) => ({name, value})),
        });
        return '$.postWindow-myWork';
      } catch (e) {
        console.warn('[KRISS annual fee] saved-proposal $.postWindow failed', e);
      }
    }
    return postBpmContextToNewWindow(params, `kriss_saved_${rqstNo.replace(/\W/g, '')}`);
  }

  function openPortalProposalReadOnly(rqstNo) {
    rqstNo = String(rqstNo || '').trim();
    if (!rqstNo) throw new Error('발의번호가 없습니다.');
    if (typeof pageWindow.fnShowReadOnlyBpmPopup === 'function') {
      pageWindow.fnShowReadOnlyBpmPopup('/mis/acc/popup/S_ACC_01020101.do', rqstNo);
      return 'fnShowReadOnlyBpmPopup';
    }
    const $ = pageWindow.jQuery;
    if ($ && typeof $.popupWindow === 'function') {
      $.popupWindow('/mis/acc/popup/S_ACC_01020101.do?popupAt=popup', {
        width: 1700, height: 960, center: 'screen', scrollbars: true, resizable: true,
        dataSource: [{name: 'rqstNo', value: rqstNo}],
      });
      return '$.popupWindow';
    }
    throw new Error('포털 조회 팝업 함수를 찾지 못했습니다.');
  }

  let taskDashboardManifest = null;
  let taskDashboardMode = 'all';

  function ensureTaskDashboardShell() {
    let back = document.getElementById('kriss-task-dashboard-back');
    if (back) return back;
    back = document.createElement('div');
    back.id = 'kriss-task-dashboard-back';
    back.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.34);display:none;align-items:flex-start;justify-content:center;padding:5vh 16px 30px;';
    back.innerHTML = `
      <div id="kriss-task-dashboard" style="width:min(1180px,96vw);max-height:90vh;background:#fff;border-radius:14px;box-shadow:0 20px 70px rgba(0,0,0,.34);overflow:hidden;font:12px/1.45 -apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;color:#111">
        <div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #ddd;flex-wrap:wrap">
          <strong id="kriss-task-title" style="font-size:16px;flex:1;min-width:190px">연차유지료 전체 작업</strong>
          <button id="kriss-task-mode-all" type="button" style="font-weight:700">전체 작업</button>
          <button id="kriss-task-mode-queue" type="button">작업 대기</button>
          <button id="kriss-task-new" type="button">지출발의신청 [5]</button>
          <button id="kriss-task-refresh" type="button">포털 재조회</button>
          <button id="kriss-task-close" type="button">닫기</button>
        </div>
        <div id="kriss-task-summary" style="padding:10px 14px;background:#f6f7f8;border-bottom:1px solid #e3e3e3;white-space:pre-wrap">불러오는 중...</div>
        <div style="overflow:auto;max-height:calc(90vh - 105px)">
          <table style="border-collapse:collapse;width:100%;font-size:11.5px">
            <thead style="position:sticky;top:0;background:#fff;z-index:1">
              <tr>
                <th style="padding:7px;border-bottom:1px solid #ddd;text-align:center;width:42px">No</th>
                <th style="padding:7px;border-bottom:1px solid #ddd;text-align:left;width:78px">상태</th>
                <th style="padding:7px;border-bottom:1px solid #ddd;text-align:left;width:110px">발의번호</th>
                <th style="padding:7px;border-bottom:1px solid #ddd;text-align:right;width:100px">금액</th>
                <th style="padding:7px;border-bottom:1px solid #ddd;text-align:left">작업</th>
                <th style="padding:7px;border-bottom:1px solid #ddd;text-align:left;width:90px">결재선</th>
                <th style="padding:7px;border-bottom:1px solid #ddd;text-align:center;width:120px">동작</th>
              </tr>
            </thead>
            <tbody id="kriss-task-body"><tr><td colspan="7" style="padding:25px;text-align:center;color:#777">불러오는 중...</td></tr></tbody>
          </table>
        </div>
      </div>`;
    document.body.appendChild(back);
    back.addEventListener('click', (e) => {
      if (e.target === back || e.target?.id === 'kriss-task-close') {
        back.style.display = 'none';
        return;
      }
      if (e.target?.id === 'kriss-task-new') {
        try { openNewProposal(); } catch (err) { shortcutNotice(String(err.message || err)); }
        return;
      }
      if (e.target?.id === 'kriss-task-mode-all') {
        taskDashboardMode = 'all';
        renderTaskDashboard(false, 'all').catch(err => shortcutNotice(String(err.message || err)));
        return;
      }
      if (e.target?.id === 'kriss-task-mode-queue') {
        taskDashboardMode = 'queue';
        renderTaskDashboard(false, 'queue').catch(err => shortcutNotice(String(err.message || err)));
        return;
      }
      if (e.target?.id === 'kriss-task-refresh') {
        renderTaskDashboard(true, taskDashboardMode).catch(err => shortcutNotice(String(err.message || err)));
        return;
      }
      const btn = e.target?.closest?.('[data-kriss-task-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-kriss-task-action');
      const rqstNo = btn.getAttribute('data-rqst-no') || '';
      try {
        if (action === 'resume') openSavedProposalForApproval(rqstNo);
        else if (action === 'view') openPortalProposalReadOnly(rqstNo);
      } catch (err) {
        shortcutNotice(String(err.message || err));
      }
    });
    return back;
  }

  function taskStatusBadge(stage) {
    const styles = {
      not_created: 'background:#eee;color:#555',
      saved: 'background:#fff1c7;color:#7b5400',
      progress: 'background:#e7f0ff;color:#174a8b',
      approved: 'background:#e5f6ea;color:#176b34',
      rejected: 'background:#ffe8e6;color:#9a2c22',
      unknown: 'background:#f1e9ff;color:#5d3794',
    };
    return `<span style="display:inline-block;border-radius:999px;padding:2px 7px;font-weight:700;${styles[stage.group] || styles.unknown}">${escHtml(stage.label)}</span>`;
  }

  function dashboardActionHtml(job, stage) {
    const rqstNo = String(job?.portal_result?.rqst_no || '');
    if (stage.group === 'saved' && rqstNo) {
      return `<button type="button" data-kriss-task-action="resume" data-rqst-no="${escHtml(rqstNo)}" style="font-weight:700">승인 재개</button>`;
    }
    if (rqstNo) {
      return `<button type="button" data-kriss-task-action="view" data-rqst-no="${escHtml(rqstNo)}">조회</button>`;
    }
    return '<span style="color:#999">-</span>';
  }

  function dashboardJobRow(job, displayNo) {
    const stage = portalStageForJob(job);
    const pr = job.portal_result || {};
    const rqstNo = String(pr.rqst_no || '');
    const desc = job.portal?.description || job.description || '';
    const scope = job.portal?.scope_text || (jobScopeKey(job) === 'domestic' ? '국내' : jobScopeKey(job) === 'overseas' ? '해외' : job.scope || '');
    return `<tr>
      <td style="padding:6px;border-bottom:1px solid #eee;text-align:center">${displayNo}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${taskStatusBadge(stage)}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;font-family:Consolas,monospace">${escHtml(rqstNo || '-')}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${fmt(job.amount)}원</td>
      <td style="padding:6px;border-bottom:1px solid #eee"><div style="font-weight:700">${escHtml(scope)}</div><div style="color:#555">${escHtml(desc)}</div></td>
      <td style="padding:6px;border-bottom:1px solid #eee">${escHtml(pr.current_nm || '-')}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;text-align:center">${dashboardActionHtml(job, stage)}</td>
    </tr>`;
  }

  function dashboardAllRows(manifest) {
    const jobs = manifest?.jobs || [];
    const groups = [
      ['domestic', '국내'],
      ['overseas', '해외'],
      ['other', '기타'],
    ];
    const rows = [];
    for (const [key, label] of groups) {
      const items = jobs.map((job, idx) => ({job, idx})).filter(x => jobScopeKey(x.job) === key);
      if (!items.length) continue;
      const sum = scopeTotals(items.map(x => x.job))[key] || scopeTotals(items.map(x => x.job)).other;
      rows.push(`<tr><td colspan="7" style="padding:8px 10px;background:#f1f3f5;border-top:1px solid #d8dadd;border-bottom:1px solid #d8dadd;font-weight:800;font-size:12px">${label} · ${items.length}건</td></tr>`);
      for (const x of items) rows.push(dashboardJobRow(x.job, x.idx + 1));
      rows.push(`<tr>
        <td colspan="3" style="padding:8px;border-top:2px solid #cfd3d7;border-bottom:2px solid #cfd3d7;background:#fafafa;text-align:right;font-weight:800">${label} 소계 · ${sum.count}건</td>
        <td style="padding:8px;border-top:2px solid #cfd3d7;border-bottom:2px solid #cfd3d7;background:#fafafa;text-align:right;white-space:nowrap;font-weight:800">${fmt(sum.amount)}원</td>
        <td colspan="3" style="border-top:2px solid #cfd3d7;border-bottom:2px solid #cfd3d7;background:#fafafa"></td>
      </tr>`);
    }
    return rows.join('');
  }

  function dashboardQueueRows(manifest) {
    const actionable = actionableWorkflowJobs(manifest);
    return actionable.map((job, queueIdx) => dashboardJobRow(job, queueIdx + 1)).join('') ||
      '<tr><td colspan="7" style="padding:25px;text-align:center;color:#666">현재 처리할 미작성/저장만 작업이 없습니다.</td></tr>';
  }

  function dashboardSummaryText(manifest, mode, range) {
    const st = workflowStats(manifest);
    const rangeText = range?.from ? ` · 조회 ${range.from}~${range.to}` : '';
    if (mode === 'queue') {
      const q = actionableWorkflowJobs(manifest);
      const qs = scopeTotals(q);
      return `작업대기 ${q.length}건 · 미작성 ${st.notCreated}건 · 저장만 ${st.saved}건${rangeText}` +
        `\n국내 ${qs.domestic.count}건 ${fmt(qs.domestic.amount)}원 · 해외 ${qs.overseas.count}건 ${fmt(qs.overseas.amount)}원`;
    }
    const sums = scopeTotals(manifest?.jobs || []);
    return `전체 ${st.total}건 · 국내 ${sums.domestic.count}건 ${fmt(sums.domestic.amount)}원 · 해외 ${sums.overseas.count}건 ${fmt(sums.overseas.amount)}원 · 총액 ${fmt(sums.total.amount)}원${rangeText}` +
      `\n미작성 ${st.notCreated} · 저장만 ${st.saved} · 신청중 ${st.applying} · 검토중 ${st.reviewing} · 승인중 ${st.approving} · 완료 ${st.approved} · 반려 ${st.rejected}` +
      (st.unknown ? ` · 상태미확인 ${st.unknown}` : '');
  }

  async function renderTaskDashboard(doReconcile = false, mode = taskDashboardMode) {
    taskDashboardMode = mode === 'queue' ? 'queue' : 'all';
    const back = ensureTaskDashboardShell();
    back.style.display = 'flex';
    const summary = back.querySelector('#kriss-task-summary');
    const body = back.querySelector('#kriss-task-body');
    const title = back.querySelector('#kriss-task-title');
    const allBtn = back.querySelector('#kriss-task-mode-all');
    const queueBtn = back.querySelector('#kriss-task-mode-queue');
    title.textContent = taskDashboardMode === 'all' ? '연차유지료 전체 작업' : '연차유지료 작업 대기';
    allBtn.style.fontWeight = taskDashboardMode === 'all' ? '800' : '400';
    queueBtn.style.fontWeight = taskDashboardMode === 'queue' ? '800' : '400';
    summary.textContent = doReconcile ? '포털 목록과 대조하는 중...' : '작업 상태 불러오는 중...';
    body.innerHTML = '<tr><td colspan="7" style="padding:25px;text-align:center;color:#777">불러오는 중...</td></tr>';

    let rec = null;
    if (doReconcile) rec = await reconcileWithPortalList();
    const manifest = await getManifest();
    taskDashboardManifest = manifest;
    const range = rec?.queryRange;
    summary.textContent = dashboardSummaryText(manifest, taskDashboardMode, range);
    body.innerHTML = taskDashboardMode === 'all' ? dashboardAllRows(manifest) : dashboardQueueRows(manifest);
    return {manifest, rec};
  }

  async function showTaskDashboard(mode = 'all') {
    try {
      taskDashboardMode = mode === 'queue' ? 'queue' : 'all';
      const b = await dataBackend();
      if (b.type === 'folder' && b.stored && !b.root) {
        const ok = await requestHandlePermission(b.stored, 'readwrite');
        if (!ok) throw new Error('결과폴더 권한이 필요합니다.');
      }
      return await renderTaskDashboard(true, taskDashboardMode);
    } catch (e) {
      const back = ensureTaskDashboardShell();
      back.style.display = 'flex';
      back.querySelector('#kriss-task-summary').textContent = `작업 목록을 불러오지 못했습니다: ${String(e.message || e)}`;
      throw e;
    }
  }

  function selectedExpenseListRow() {
    try {
      if (pageWindow.grid1 && typeof pageWindow.grid1.getRowData === 'function') {
        const r = pageWindow.grid1.getRowData();
        if (r) return plainPortalRow(r);
      }
    } catch (_) {}
    try {
      const $ = pageWindow.jQuery || window.jQuery;
      const kg = $ && $('#grid1').data('kendoGrid');
      const tr = document.querySelector('#grid1 tbody tr.k-state-selected');
      if (kg && tr) return plainPortalRow(kg.dataItem(tr));
    } catch (_) {}
    return null;
  }

  function initExpenseListPage() {
    if (document.getElementById('kriss-expense-list-panel')) return;
    const box = document.createElement('div');
    box.id = 'kriss-expense-list-panel';
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;width:330px;background:#fff;border:1px solid #ccc;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.2);padding:11px;font:12px/1.45 -apple-system,BlinkMacSystemFont,"Malgun Gothic",sans-serif';
    box.innerHTML = `
      <div style="font-weight:800;font-size:14px;margin-bottom:8px">연차유지료 작업</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
        <button id="kriss-list-new" type="button">지출발의신청 [5]</button>
        <button id="kriss-list-all" type="button">전체 작업</button>
        <button id="kriss-list-status" type="button">작업 대기</button>
      </div>
      <button id="kriss-list-resume" type="button" style="width:100%;margin-top:6px">선택한 임시저장 건 승인 재개</button>
      <div id="kriss-list-msg" style="margin-top:7px;color:#666">목록 더블클릭은 조회 전용입니다. 임시저장은 위 버튼으로 업무모드로 여세요.</div>`;
    document.body.appendChild(box);

    box.querySelector('#kriss-list-new').addEventListener('click', () => {
      try { openNewProposal(); } catch (e) { box.querySelector('#kriss-list-msg').textContent = String(e.message || e); }
    });
    box.querySelector('#kriss-list-all').addEventListener('click', () => {
      showTaskDashboard('all').catch(() => {});
    });
    box.querySelector('#kriss-list-status').addEventListener('click', () => {
      showTaskDashboard('queue').catch(() => {});
    });
    box.querySelector('#kriss-list-resume').addEventListener('click', () => {
      const row = selectedExpenseListRow();
      if (!row) return void (box.querySelector('#kriss-list-msg').textContent = '목록에서 임시저장 행을 먼저 선택하세요.');
      if (String(row.acctStatus || '') !== '00') {
        return void (box.querySelector('#kriss-list-msg').textContent = `선택 건 ${row.rqstNo || ''}은 임시저장(00)이 아닙니다.`);
      }
      try {
        openSavedProposalForApproval(row.rqstNo);
        box.querySelector('#kriss-list-msg').textContent = `${row.rqstNo} 업무모드로 열었습니다. 승인 버튼을 확인하세요.`;
      } catch (e) {
        box.querySelector('#kriss-list-msg').textContent = String(e.message || e);
      }
    });
  }

  async function initMainPage() {
    const panel = createMainPanel();
    panel.querySelector('#kriss-folder').addEventListener('click', async () => {
      try {
        const b = await dataBackend();
        if (b.type === 'folder' && b.stored && !b.root) {
          const ok = await requestHandlePermission(b.stored, 'readwrite');
          if (ok) return void await loadNext();
        }
      } catch (_) {}
      await chooseFolderFromPanel();
    });
    panel.querySelector('#kriss-compose').addEventListener('click', composeCurrent);
    panel.querySelector('#kriss-reconcile').addEventListener('click', reconcileFromPanel);
    panel.querySelector('#kriss-new').addEventListener('click', () => {
      try { openNewProposal(); } catch (e) { document.getElementById('kriss-msg').textContent = String(e.message || e); }
    });
    panel.querySelector('#kriss-all').addEventListener('click', () => { showTaskDashboard('all').catch(() => {}); });
    panel.querySelector('#kriss-status').addEventListener('click', () => { showTaskDashboard('queue').catch(() => {}); });
    panel.querySelector('#kriss-reload').addEventListener('click', loadNext);
    panel.querySelector('#kriss-advanced').addEventListener('click', configure);
    bindSaveWatcher();
    installSaveAutoConfirmWatcher();
    installApprovalCompletionHook();
    installApprovalHandoffWatcher();
    await rememberPortalUser();
    await loadNext();
    // Every newly opened BPM form is a cheap opportunity to recover jobs that
    // were saved in the portal but not written back to manifest (closed tab,
    // validation flow interruption, etc.). Never block the form if lookup fails.
    try {
      const b = await dataBackend();
      if (b.type === 'folder' && b.root) {
        const rec = await reconcileWithPortalList();
        if (rec.matches.length) {
          await loadNext();
          const msg = document.getElementById('kriss-msg');
          if (msg) msg.textContent = reconciliationSummary(rec);
        }
      }
    } catch (e) {
      console.warn('[KRISS annual fee] automatic portal reconciliation skipped', e);
    }
  }

  // ---------- global keyboard shortcuts ----------
  let shortcutToastTimer = null;
  function shortcutNotice(text) {
    const panelMsg = document.getElementById('kriss-msg');
    if (panelMsg) {
      panelMsg.textContent = text;
      return;
    }
    let toast = document.getElementById('kriss-shortcut-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'kriss-shortcut-toast';
      toast.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#222;color:#fff;padding:9px 12px;border-radius:8px;font:12px/1.4 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.display = 'block';
    clearTimeout(shortcutToastTimer);
    shortcutToastTimer = setTimeout(() => { toast.style.display = 'none'; }, 1800);
  }

  function clickPortalAction(selector, label, noticeText) {
    const btn = document.querySelector(selector);
    if (!btn) return void shortcutNotice(`${label}: 현재 화면에서 버튼을 찾지 못했습니다.`);
    if (btn.disabled || btn.getAttribute('disabled') === 'disabled') return void shortcutNotice(`${label}: 현재 사용할 수 없는 상태입니다.`);
    shortcutNotice(noticeText || `${label} 실행`);
    btn.click();
  }

  async function handleKrissShortcut(n) {
    if (n === 1) {
      if (!document.querySelector('#kriss-compose')) return void shortcutNotice('자동작성: 지출발의 신규작성 화면에서 사용하세요.');
      return composeCurrent();
    }
    if (n === 2) {
      if (composing) return void shortcutNotice('저장: 자동작성 완료 후 실행하세요.');
      return clickPortalAction('#btnBpmSave', '저장');
    }
    if (n === 3) {
      if (composing) return void shortcutNotice('승인: 자동작성/저장 완료 후 실행하세요.');
      if (document.querySelector('#expndtrGrid') && !currentRequestNo()) return void shortcutNotice('승인: 먼저 [2 저장]으로 발의번호를 생성하세요.');
      const approveBtn = document.querySelector('#btnBpmApprove');
      if (approveBtn && (approveBtn.disabled || approveBtn.getAttribute('disabled') === 'disabled')) {
        return void shortcutNotice('승인: 조회전용 화면입니다. 지출결의 관리의 [임시저장 승인 재개] 또는 [작업 대기]에서 다시 여세요.');
      }
      armApprovalHandoffIntent('shortcut-3');
      return clickPortalAction(
        '#btnBpmApprove',
        '승인',
        '승인 실행 · 결재선 정보가 뜨면 [4]로 확인하세요'
      );
    }
    if (n === 4) {
      const okBtn = document.querySelector('#bpmApprovalLines #apvlOk, #apvlOk');
      const visible = !!(okBtn && okBtn.getClientRects && okBtn.getClientRects().length &&
        pageWindow.getComputedStyle(okBtn).display !== 'none' && pageWindow.getComputedStyle(okBtn).visibility !== 'hidden');
      if (!visible) return void shortcutNotice('결재확인: 결재선 정보 확인창이 열려 있을 때 사용하세요.');

      // Shortcut 4 is itself a trusted user gesture. Reserve the next proposal
      // window at this exact moment, then press the portal's real confirmation
      // button. This avoids stealing focus when shortcut 3 first opens the dialog.
      const requestNo = currentRequestNo();
      let state = approvalStateRead();
      if (!state || state.requestNo !== requestNo || ['cancelled','failed','not-completed','completed'].includes(state.phase)) {
        state = armApprovalHandoffIntent('shortcut-4-late');
      }
      if (state && state.phase !== 'final-confirm') {
        state = approvalStateWrite({...state, phase: 'final-confirm', finalConfirmAt: Date.now()});
      }
      if (state) reserveNextProposalAtFinalConfirm(state, 'shortcut-4');

      shortcutNotice('결재정보 확인 · 승인 완료 후 다음 발의로 이동');
      okBtn.click();
      return;
    }
    if (n === 5) {
      try {
        if (document.querySelector('#expndtrGrid') && !currentRequestNo() && gridRowCount() > 0) {
          const ok = confirm('현재 화면에 아직 저장하지 않은 지출발의 내용이 있습니다.\n새 지출발의창을 열까요?');
          if (!ok) return;
        }
        shortcutNotice('지출발의신청 열기');
        openNewProposal();
      } catch (e) {
        shortcutNotice(`지출발의신청 실패: ${String(e.message || e)}`);
      }
    }
  }

  function installGlobalShortcuts() {
    if (pageWindow.__krissAnnualFeeHotkeysV0800) return;
    pageWindow.__krissAnnualFeeHotkeysV0800 = true;
    document.addEventListener('keydown', (e) => {
      if (e.repeat || !e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;
      const key = String(e.key || '');
      const code = String(e.code || '');
      let n = null;
      if (['1','2','3','4','5'].includes(key)) n = Number(key);
      else if (/^Digit[1-5]$/.test(code)) n = Number(code.slice(-1));
      else if (/^Numpad[1-5]$/.test(code)) n = Number(code.slice(-1));
      if (!n) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      Promise.resolve(handleKrissShortcut(n)).catch(err => shortcutNotice(String(err.message || err)));
    }, true);
  }

  // Tampermonkey popup menu intentionally left empty.
  // Use the in-page automation panel for folder selection, reconciliation, dashboards,
  // new proposal launch, refresh, Bridge settings, and folder disconnect.


  installFinalApprovalConfirmWatcher();
  installGlobalShortcuts();

  window.addEventListener('load', async () => {
    await sleep(200);
    try { await rememberPortalUser(); } catch (_) {}
    if (document.querySelector('#billGrid') && document.querySelector('#deptSelectBtn') && document.body.textContent.includes(ETAX_POPUP_MARKER)) {
      initEtaxPopup();
      return;
    }
    if (document.querySelector('#tb_accInfo') && document.querySelector('#expndtrGrid')) {
      initMainPage();
      return;
    }
    if (document.querySelector('#grid1') && document.querySelector('#searchForm #acctStatus') &&
        /지출결의 관리|지출결의 신청내역/.test(document.body.textContent || '')) {
      initExpenseListPage();
    }
  });
})();
