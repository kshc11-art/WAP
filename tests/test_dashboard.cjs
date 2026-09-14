'use strict';

// Business fixtures contain synthetic identifiers only. Run the shipped rule
// functions in isolation: no browser startup, requests, or live portal writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../scripts/portal-dashboard.user.js'), 'utf8');

function declaration(name, required = true) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(source);
  if (!match) {
    if (!required) return '';
    throw new Error('Missing source function: ' + name);
  }
  // Let JavaScript's parser decide the function boundary, including braces in
  // strings/comments/regular expressions, rather than using a brace counter.
  for (let end = source.indexOf('}', match.index); end >= 0; end = source.indexOf('}', end + 1)) {
    const candidate = source.slice(match.index, end + 1);
    try {
      new vm.Script('(' + candidate + ')');
      return candidate;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  throw new Error('Incomplete source function: ' + name);
}

function section(start, end) {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && finish > begin, 'Missing source section: ' + start);
  return source.slice(begin, finish);
}

const actualRules = [
  section('  const F = {', '  const K = {'),
  section('  const APV_STAT = {', '  const STAGE_ORDER = '),
  section('  const firstVal = ', '  function fmtYmd('),
  declaration('status2'),
  declaration('pdKrJudge'),
  declaration('krissPpsPolicy'),
  declaration('pdPpsNumber', false),
  declaration('pdFilingReview', false),
  declaration('pdFilingActionDate', false),
  declaration('pdSortKey'),
  section('  function normBiz(', '  function patentBpmMeta('),
  declaration('patentBpmMeta'),
  declaration('addBpmSafetyNet'),
  declaration('buildActions'),
].join('\n');

async function build(overrides = {}, myWork = [], expectedNotes = []) {
  const fixture = Object.fromEntries(['apply', 'pps', 'file', 'task', 'reg', 'exp'].map(key => [key, {rows: [], valid: true}]));
  Object.entries(overrides).forEach(([key, rows]) => {
    fixture[key] = Array.isArray(rows) ? {rows, valid: true} : rows;
  });
  const context = vm.createContext({
    // Only browser/storage integration boundaries are stubbed. Source policy,
    // gating, indexing, grouping, and BPM promotion run unchanged.
    setTimeout: callback => { queueMicrotask(callback); return 0; },
    CONF: {PPS_DONE_STRICT: true, DELAY_OVER: 60, DELAY_WARN: 30, DONE: [], REG_DONE: []},
    K: {fgnfile: 'test.foreign'},
    gmGet: (_key, fallback) => fallback,
    ppsDraftLedger: () => ({}),
    WORK: {myOk: true, my: myWork},
    STAGE_NM: {},
    ETC_SORT: 80000,
    TETS_SORT: 90000,
    fixture,
  });
  vm.runInContext(actualRules, context, {timeout: 3000});
  const result = await vm.runInContext('buildActions(fixture, [])', context);
  assert.deepEqual(Array.from(result.notes), expectedNotes, 'No unexpected rule exceptions or diagnostics may be silently hidden in notes');
  return Array.from(result.acts);
}

function application(changes = {}) {
  return {
    intellRqstNo: 'TEST_APPLICATION_A', intellMngNo: 'TEST_PATENT_A',
    ivenNm: 'Synthetic filing fixture', rqstDt: '20260901',
    apvStat: '04', cntCls: 'I', reRqstType: 'G',
    __krissOwnerEvidence: {owners: [{orgCd: '200835806', owrQuota: 100}], externalMajority: null},
    __krissPpsChecked: true,
    ...changes,
  };
}

function pps(changes = {}) {
  return {rqstNo: '202609-901', intellRqstNo: 'TEST_APPLICATION_A', intellMngNo: 'TEST_PATENT_A', apvStat: '04', rqstDt: '20260901', cmplDt: '20260910', ...changes};
}

function filing(changes = {}) {
  return {rqstNo: '202609-903', intellRqstNo: 'TEST_APPLICATION_A', intellMngNo: 'TEST_PATENT_A', ivenNm: 'Synthetic filing fixture', rqstDt: '20260910', ...changes};
}

function instruction(acts) { return acts.filter(row => row.routeKind === 'fileInstruction'); }

function oneAction(acts, route) {
  const rows = acts.filter(row => row.stage === 'file' && row.routeKind === route);
  assert.equal(rows.length, 1, route + ' must appear exactly once');
  assert.equal(rows[0].track, 'action');
  assert.equal(rows[0].baseTrack, 'action');
  return rows[0];
}

test('PPS target without a request remains a PPS task, not a filing instruction', async () => {
  const acts = await build({apply: [application()]});
  assert.equal(instruction(acts).length, 0);
  assert.ok(acts.some(row => row.stage === 'pps' && row.routeKind === 'ppsCreate' && row.track === 'action'));
});

for (const state of ['00', '01', '02', '03']) {
  test('current PPS ' + state + ' must not become a filing instruction', async () => {
    const acts = await build({apply: [application({ppsRqstNo: '202609-901'})], pps: [pps({apvStat: state})]});
    assert.equal(instruction(acts).length, 0);
    assert.ok(acts.some(row => row.stage === 'pps'));
  });
}

test('current completed PPS is a filing instruction', async () => {
  const acts = await build({apply: [application({ppsRqstNo: '202609-901'})], pps: [pps()]});
  oneAction(acts, 'fileInstruction');
});

test('completed single-record PPS survives an empty period-limited list', async () => {
  const acts = await build({apply: [application({ppsRqstNo: '202609-901', __krissPpsRecord: pps()})]});
  oneAction(acts, 'fileInstruction');
});

test('current completed PPS is not hidden by a different historical unfinished request', async () => {
  const acts = await build({apply: [application({ppsRqstNo: '202609-901'})], pps: [pps(), pps({rqstNo: '202608-902', apvStat: '03'})]});
  oneAction(acts, 'fileInstruction');
});

test('verified PPS exemption remains a filing instruction task', async () => {
  const externalMajority = {orgCd: 'TEST_EXTERNAL_ORG', orgNm: 'Synthetic external owner', owrQuota: 60};
  const acts = await build({apply: [application({__krissOwnerEvidence: {owners: [externalMajority], externalMajority}})]});
  oneAction(acts, 'fileInstruction');
});

function exemptApplication() {
  const externalMajority = {orgCd: 'TEST_EXTERNAL_ORG', orgNm: 'Synthetic external owner', owrQuota: 60};
  return application({__krissOwnerEvidence: {owners: [externalMajority], externalMajority}, __krissPpsChecked: true, __krissPpsRecord: null});
}

test('verified single-record PPS absence is not blocked by failure of the unrelated whole list', async () => {
  const acts = await build({apply: [exemptApplication()], pps: {rows: null, err: 'Synthetic unavailable'}}, [], ['선행조사 조회 실패: Synthetic unavailable']);
  oneAction(acts, 'fileInstruction');
});

for (const limitation of ['truncated', 'maybeTruncated', 'stale']) {
  test('verified PPS exemption does not require an unlimited current whole list: ' + limitation, async () => {
    const acts = await build({apply: [exemptApplication()], pps: {rows: [], [limitation]: true}});
    oneAction(acts, 'fileInstruction');
  });
}

test('an unrelated application pending PPS does not defeat verified exemption', async () => {
  const acts = await build({apply: [exemptApplication()], pps: [pps({intellRqstNo: 'TEST_DIFFERENT_APPLICATION', apvStat: '03'})]});
  oneAction(acts, 'fileInstruction');
});

test('fresh pending PPS for the same application conflicts with an exempt no-PPS context', async () => {
  const acts = await build({apply: [exemptApplication()], pps: [pps({apvStat: '03'})]});
  assert.equal(instruction(acts).length, 0);
});

test('not-requested display text is not mistaken for an existing PPS identifier', async () => {
  const acts = await build({apply: [application({ppsRqstNo: '의뢰하지 않음'})]});
  assert.equal(instruction(acts).length, 0);
  assert.ok(acts.some(row => row.routeKind === 'ppsCreate' && row.track === 'action'));
});

test('unknown ownership is not silently treated as a PPS exemption', async () => {
  const acts = await build({apply: [application({__krissOwnerEvidence: null, __krissOwnerError: 'Synthetic unavailable evidence'})]});
  assert.equal(instruction(acts).length, 0);
});

test('an actual pending PPS still blocks instruction even for an exempt owner', async () => {
  const externalMajority = {orgCd: 'TEST_EXTERNAL_ORG', orgNm: 'Synthetic external owner', owrQuota: 60};
  const acts = await build({apply: [application({ppsRqstNo: '202609-901', __krissOwnerEvidence: {owners: [externalMajority], externalMajority}})], pps: [pps({apvStat: '03'})]});
  assert.equal(instruction(acts).length, 0);
});

test('unapproved application cannot advance to a filing instruction', async () => {
  const acts = await build({apply: [application({apvStat: '03', ppsRqstNo: '202609-901'})], pps: [pps()]});
  assert.equal(instruction(acts).length, 0);
});

test('an issued filing prevents a duplicate new instruction', async () => {
  const acts = await build({apply: [application({ppsRqstNo: '202609-901'})], pps: [pps()], file: [filing({apvStat: '01', rqstApvStat: '01'})]});
  assert.equal(instruction(acts).length, 0);
});

test('filing-before-instruction candidate can use its verified exempt parent', async () => {
  const externalMajority = {orgCd: 'TEST_EXTERNAL_ORG', orgNm: 'Synthetic external owner', owrQuota: 60};
  const parent = application({__krissOwnerEvidence: {owners: [externalMajority], externalMajority}});
  const acts = await build({file: [filing({rqstNo: '', rqstDt: '', apvStat: '10', __pdApplication: parent})]});
  oneAction(acts, 'fileInstruction');
});

test('filing-before-instruction candidate with an unrequested PPS target is excluded', async () => {
  const acts = await build({file: [filing({rqstNo: '', rqstDt: '', apvStat: '10', __pdApplication: application()})]});
  assert.equal(instruction(acts).length, 0);
});

test('filing-before-instruction without parent evidence is not assumed eligible', async () => {
  const acts = await build({file: [filing({rqstNo: '', rqstDt: '', apvStat: '10'})]});
  assert.equal(instruction(acts).length, 0);
});

test('office submission awaiting confirmation is actionable', async () => {
  const acts = await build({file: [filing({apvStat: '04', rqstApvStat: '04', cmplDt: '20260912'})]});
  const row = oneAction(acts, 'fileConfirmation');
  assert.equal(row.source, 'file');
  assert.equal(row.stageRqstNo, '202609-903');
});

for (const state of ['05', '06', '07', '08', '09']) {
  test('completed instruction ' + state + ' with no result-review start remains actionable', async () => {
    const acts = await build({file: [filing({apvStat: state, rqstApvStat: state, aplyRsltRqstDt: null, cmplDt: '20260912'})]});
    oneAction(acts, 'fileResultReview');
  });
}

test('final completed result review is excluded', async () => {
  const acts = await build({file: [filing({apvStat: '09', rqstApvStat: '09', aplyRsltApvStat: '03', aplyRsltRqstNo: 'TEST_RESULT_REVIEW', aplyRsltRqstDt: '20260912'})]});
  assert.equal(acts.filter(row => row.stage === 'file').length, 0);
});

test('a started result-review draft is an actionable resume task', async () => {
  const acts = await build({file: [filing({apvStat: '06', rqstApvStat: '06', aplyRsltApvStat: '00', aplyRsltRqstNo: 'TEST_RESULT_REVIEW', aplyRsltRqstDt: '20260912'})]});
  const row = oneAction(acts, 'fileResultReview');
  assert.equal(row.aplyRsltRqstNo, 'TEST_RESULT_REVIEW');
});

for (const state of ['06', '07', '08']) {
  test('overall review status ' + state + ' is retained while result review progresses', async () => {
    const acts = await build({file: [filing({apvStat: state, rqstApvStat: state, aplyRsltApvStat: '02', aplyRsltRqstNo: 'TEST_RESULT_REVIEW', aplyRsltRqstDt: '20260912'})]});
    const rows = acts.filter(row => row.stage === 'file');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].track, 'progress');
    assert.equal(rows[0].aplyRsltRqstNo, 'TEST_RESULT_REVIEW');
  });
}

test('filing candidate uses a completed parent PPS even without application or PPS list rows', async () => {
  const parent = application({ppsRqstNo: '202609-901', __krissPpsRecord: pps()});
  const acts = await build({file: [filing({rqstNo: '', rqstDt: '', apvStat: '10', __pdApplication: parent})]});
  oneAction(acts, 'fileInstruction');
});

test('application and pending filing create one instruction using the filing request identity', async () => {
  const parent = application({ppsRqstNo: '202609-901', __krissPpsRecord: pps()});
  const row = filing({apvStat: '10', rqstDt: '', ppsRqstNo: '202609-901', __pdApplication: parent});
  const acts = await build({apply: [parent], file: [row]});
  const act = oneAction(acts, 'fileInstruction');
  assert.equal(act.source, 'file');
  assert.equal(act.intellRqstNo, 'TEST_APPLICATION_A');
  assert.equal(act.filingRqstNo, '202609-903');
});

test('completed single PPS with a different application identity cannot approve filing', async () => {
  const parent = application({ppsRqstNo: '202609-901', __krissPpsRecord: pps({intellRqstNo: 'TEST_DIFFERENT_APPLICATION'})});
  const acts = await build({apply: [parent]});
  assert.equal(instruction(acts).length, 0);
});

test('completed single PPS with a different request identity cannot approve filing', async () => {
  const parent = application({ppsRqstNo: '202609-901', __krissPpsRecord: pps({rqstNo: '202608-902'})});
  const acts = await build({apply: [parent]});
  assert.equal(instruction(acts).length, 0);
});

test('matching PPS request number with a different application identity is rejected', async () => {
  const acts = await build({apply: [application({ppsRqstNo: '202609-901'})], pps: [pps({intellRqstNo: 'TEST_DIFFERENT_APPLICATION'})]});
  assert.equal(instruction(acts).length, 0);
});

test('missing current PPS is not replaced by an older completed request', async () => {
  const parent = application({ppsRqstNo: '202609-901', __krissPpsRecord: null});
  const acts = await build({apply: [parent], pps: [pps({rqstNo: '202608-902'})]});
  assert.equal(instruction(acts).length, 0);
});

test('conflicting current PPS rows do not silently pass completion', async () => {
  const acts = await build({apply: [application({ppsRqstNo: '202609-901'})], pps: [pps(), pps({apvStat: '03'})]});
  assert.equal(instruction(acts).length, 0);
});

const periodRules = ['fmtYmd8', 'shiftMonthsClamped', 'pdCalendarDate', 'pdInWorkPeriod'].map(name => declaration(name)).join('\n');
function inPeriod(row) {
  const context = vm.createContext({periodMonths: 3, row, now: new Date(2026, 8, 14)});
  vm.runInContext(periodRules, context);
  return vm.runInContext('pdInWorkPeriod(row, now)', context);
}

for (const routeKind of ['fileInstruction', 'fileConfirmation', 'fileResultReview']) {
  test('old actionable ' + routeKind + ' follows the selected period', () => {
    assert.equal(inPeriod({stage: 'file', track: 'action', routeKind, requestDate: '20200101'}), false);
  });
  test('future actionable ' + routeKind + ' stays excluded', () => {
    assert.equal(inPeriod({stage: 'file', track: 'action', routeKind, requestDate: '20260915'}), false);
  });
}

test('old filing progress remains subject to the selected period', () => {
  assert.equal(inPeriod({stage: 'file', track: 'progress', requestDate: '20200101'}), false);
});

test('old action in a different stage does not acquire the filing exception', () => {
  assert.equal(inPeriod({stage: 'pps', track: 'action', requestDate: '20200101'}), false);
});

test('period boundaries remain inclusive', () => {
  assert.equal(inPeriod({stage: 'file', track: 'progress', requestDate: '20260614'}), true);
  assert.equal(inPeriod({stage: 'file', track: 'progress', requestDate: '20260613'}), false);
  assert.equal(inPeriod({stage: 'file', track: 'progress', requestDate: '20260914'}), true);
  assert.equal(inPeriod({stage: 'file', track: 'action', routeKind: 'fileInstruction', requestDate: '20260614'}), true);
  assert.equal(inPeriod({stage: 'file', track: 'action', routeKind: 'fileInstruction', requestDate: '20260613'}), false);
});

test('old BPM request date also follows the selected period for an undated actionable filing', () => {
  assert.equal(inPeriod({stage: 'file', track: 'action', routeKind: 'fileResultReview', myWork: {requestDate: '20200101'}}), false);
});

function resultInProgress() {
  return filing({apvStat: '07', rqstApvStat: '07', aplyRsltRqstNo: 'TEST_RESULT_REVIEW', aplyRsltRqstDt: '20260912', aplyRsltApvStat: '02'});
}

function bpm(changes = {}) {
  return {processcode: 'B_RES00011', instancename: 'TEST_RESULT_REVIEW', statuscode: 'ST0201', taskid: 'TEST_BPM_TASK', requestDate: '20260912', ...changes};
}

test('filing BPM candidate contains only the result-review request number', () => {
  const context = vm.createContext({row: {stage: 'file', intellRqstNo: 'TEST_APPLICATION_A', rqstNo: '202609-903', stageRqstNo: '202609-903', aplyRsltRqstNo: 'TEST_RESULT_REVIEW'}});
  vm.runInContext(section('  const STAGE_MATCH_KEYS = {', '  function bracketTokens(') + '\n' + declaration('normBiz'), context);
  const values = vm.runInContext('workCandidates(row)', context);
  assert.deepEqual(Array.from(values, value => ({f: value.f, v: value.v})), [{f: 'aplyRsltRqstNo', v: 'TEST_RESULT_REVIEW'}]);
});

test('matching B_RES00011 result-review BPM promotes the actual filing row', async () => {
  const acts = await build({file: [resultInProgress()]}, [bpm()]);
  const row = acts.find(act => act.intellRqstNo === 'TEST_APPLICATION_A');
  assert.ok(row);
  assert.equal(row.track, 'action');
  assert.equal(row.baseTrack, 'progress');
  assert.equal(row.myWork.processcode, 'B_RES00011');
  assert.equal(row.myWork.instancename, 'TEST_RESULT_REVIEW');
  assert.equal(acts.filter(act => act.orphanBpm).length, 0);
});

for (const wrongProcess of ['B_RES00004', 'B_RES00015', 'TEST_UNKNOWN_PROCESS']) {
  test('same result-review string in ' + wrongProcess + ' cannot promote a filing row', async () => {
    const acts = await build({file: [resultInProgress()]}, [bpm({processcode: wrongProcess})]);
    const row = acts.find(act => act.intellRqstNo === 'TEST_APPLICATION_A');
    assert.equal(row.track, 'progress');
    assert.equal(row.myWork, undefined);
    assert.ok(acts.some(act => act.orphanBpm));
  });
}

for (const wrongKey of ['TEST_APPLICATION_A', '202609-903']) {
  test('B_RES00011 cannot match using ' + wrongKey + ' from a different identifier field', async () => {
    const acts = await build({file: [resultInProgress()]}, [bpm({instancename: wrongKey})]);
    const row = acts.find(act => act.intellRqstNo === 'TEST_APPLICATION_A');
    assert.equal(row.track, 'progress');
    assert.equal(row.myWork, undefined);
  });
}

test('fresh current PPS pending state outranks an older cached completed single record', async () => {
  const parent = application({ppsRqstNo: '202609-901', __krissPpsRecord: pps()});
  const acts = await build({apply: [parent], pps: [pps({apvStat: '03'})]});
  assert.equal(instruction(acts).length, 0);
});

test('pending filing PPS number cannot override a current parent explicitly checked as having no PPS', async () => {
  const parent = application({ppsRqstNo: '', __krissPpsChecked: true, __krissPpsRecord: null});
  const row = filing({apvStat: '10', rqstDt: '', ppsRqstNo: '202609-901', __pdApplication: parent});
  const acts = await build({file: [row], pps: [pps()]});
  assert.equal(instruction(acts).length, 0);
});

async function fetchSources(options = {}) {
  const calls = [];
  const requestContext = {fixture: true};
  const coreDeclaration = source.match(/  const CORE_SOURCES = [^\n]+/);
  assert.ok(coreDeclaration);
  class FixtureDate extends Date {
    constructor(...args) {super(...(args.length ? args : [2026, 8, 14]));}
    static now() {return new Date(2026, 8, 14).getTime();}
  }
  const context = vm.createContext({
    Date: FixtureDate,
    DIAG: [],
    requestContext,
    periodMonths: options.months || 3,
    K: {debug: 'test.debug'}, gmGet: (_key, fallback) => fallback,
    RUNTIME: {isCurrent: () => true},
    // Only transport is mocked. Production API defaults, callApi response
    // handling, and the complete source-fetch coordinator execute together.
    httpPost: async (url, body, signal) => {
      calls.push({url, body, signal});
      const isFile = url === '/pms/iprs/aply/selectAplyRqstList.json';
      if (isFile && options.failure) throw new Error('Synthetic filing read failure');
      const rows = isFile ? (options.empty ? [] : [filing()]) : [{apvStat: '01'}];
      return {status: 200, text: JSON.stringify({rows, total: rows.length})};
    },
  });
  const code = [
    coreDeclaration[0],
    section('  const API = {', '  function pageBody('),
    section('  const SOURCE_KEYS = {', '  function validateRows('),
    ...['pageBody', 'fmtYmd8', 'shiftMonthsClamped', 'expPeriod', 'periodMin', 'extractRows', 'readTotal', 'validateRows', 'callApi', 'fetchIpmsSources'].map(name => declaration(name)),
  ].join('\n');
  vm.runInContext(code, context);
  const result = await vm.runInContext('fetchIpmsSources(requestContext)', context);
  return {result, calls, requestContext};
}

function filingCalls(calls) {return calls.filter(call => call.url === '/pms/iprs/aply/selectAplyRqstList.json');}

test('filing is fetched once using the default three-month application-date range', async () => {
  const {result, calls} = await fetchSources();
  const requests = filingCalls(calls);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.rqstCls, '03');
  assert.equal(requests[0].body.rqstStrDt, '20260614');
  assert.equal(requests[0].body.rqstEndDt, '20260914');
  assert.equal(result.file.rows.length, 1);
  assert.equal(result.file.err, null);
});

test('an empty filing range does not trigger a whole-history fallback', async () => {
  const {result, calls} = await fetchSources({empty: true});
  const requests = filingCalls(calls);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.rqstStrDt, '20260614');
  assert.equal(requests[0].body.rqstEndDt, '20260914');
  assert.equal(result.file.rows.length, 0);
  assert.equal(result.file.err, null);
  assert.equal(result.file.valid, true);
});

test('filing request failure remains an error without a wider-range retry', async () => {
  const {result, calls} = await fetchSources({failure: true});
  assert.equal(filingCalls(calls).length, 1);
  assert.equal(result.file.rows, null);
  assert.equal(result.file.valid, false);
  assert.match(result.file.err, /Synthetic filing read failure/);
});

test('a user-selected six-month range changes the actual filing request dates', async () => {
  const {result, calls} = await fetchSources({months: 6});
  const requests = filingCalls(calls);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.rqstStrDt, '20260314');
  assert.equal(requests[0].body.rqstEndDt, '20260914');
  assert.equal(result.file.rows.length, 1);
});

function actionHarness(official = 'success') {
  const calls = {official: [], nativeOpen: [], tracked: [], scheduled: [], popup: [], submit: [], list: [], toast: []};
  const windowHandle = {closed: false};
  const UW = {open: (...args) => {calls.nativeOpen.push(args); return windowHandle;}};
  const originalOpen = UW.open;
  if (official !== 'absent') {
    UW.fnShowNewBpmPopup = (...args) => {
      calls.official.push(args);
      if (official === 'throw') throw new Error('Synthetic popup failure');
      UW.open('synthetic:review', 'synthetic-window');
    };
  }
  const context = vm.createContext({
    UW,
    CHAIN_RUN: false,
    PD_CHAIN: {token: 1},
    PD_OPEN_LOCKS: new Set(),
    OPEN_HOOK: {cur: null},
    RUNTIME: {cleanups: new Set(), timeout: (...args) => calls.scheduled.push(args)},
    K: {chain: 'test.chain'},
    gmGet: (_key, fallback) => fallback,
    toast: (...args) => calls.toast.push(args),
    trackPopups: windows => calls.tracked.push(Array.from(windows)),
    scheduleRefresh: reason => calls.scheduled.push(reason),
    callPortalPopup: (...args) => {calls.popup.push(args); return true;},
    submitPopup: (...args) => {calls.submit.push(args); return true;},
    openListTab: (...args) => calls.list.push(args),
  });
  const code = [section('  const STAGE_POPUP = {', '  const F = {'), ...['status2', 'pdQueueKey', 'resolvePopup', 'withOpenCapture', 'openAction'].map(name => declaration(name))].join('\n');
  vm.runInContext(code, context);
  return {
    calls, context, UW, originalOpen, windowHandle,
    open: async row => {context.row = row; return await vm.runInContext('openAction(row)', context);},
  };
}

function newReviewAction(changes = {}) {
  return {stage: 'file', source: 'file', routeKind: 'fileResultReview', track: 'action', fileRqstStat: '05', stageRqstNo: '202609-903', intellRqstNo: 'TEST_APPLICATION_A', mng: 'TEST_PATENT_A', aplyRsltRqstDt: '', ...changes};
}

test('new result review calls the official popup exactly once with the filing request contract and captures its window', async () => {
  const harness = actionHarness();
  assert.equal(await harness.open(newReviewAction()), true);
  assert.equal(harness.calls.official.length, 1);
  const args = harness.calls.official[0];
  assert.equal(args[0], '/pms/iprs/aply/B_RES00011_01.do');
  assert.equal(typeof args[1], 'function');
  assert.deepEqual(Array.from(args[2], item => ({name: item.name, value: item.value})), [{name: 'aplyRqstNo', value: '202609-903'}]);
  assert.equal(harness.calls.nativeOpen.length, 1);
  assert.deepEqual(harness.calls.tracked, [[harness.windowHandle]]);
  assert.equal(harness.UW.open, harness.originalOpen, 'Temporary window hook must be restored');
  assert.equal(harness.context.RUNTIME.cleanups.size, 0);
  assert.equal(harness.calls.submit.length + harness.calls.popup.length + harness.calls.list.length, 0);
  args[1]();
  assert.ok(harness.calls.scheduled.includes('filing-review'));
});

test('official new-review popup failure does not retry via another creation path', async () => {
  const harness = actionHarness('throw');
  assert.equal(await harness.open(newReviewAction()), false);
  assert.equal(harness.calls.official.length, 1);
  assert.equal(harness.calls.nativeOpen.length, 0);
  assert.equal(harness.calls.submit.length + harness.calls.popup.length + harness.calls.list.length, 0);
  assert.equal(harness.context.PD_OPEN_LOCKS.size, 0);
  assert.equal(harness.context.RUNTIME.cleanups.size, 0);
  assert.equal(harness.UW.open, harness.originalOpen);
  assert.ok(harness.calls.toast.length > 0);
});

test('missing official creation function opens the original filing list and returns false', async () => {
  const harness = actionHarness('absent');
  assert.equal(await harness.open(newReviewAction()), false);
  assert.deepEqual(harness.calls.list, [['file', 'TEST_PATENT_A']]);
  assert.equal(harness.calls.official.length + harness.calls.submit.length + harness.calls.popup.length, 0);
});

test('unconfirmed instruction status cannot start a new result-review process', async () => {
  const harness = actionHarness();
  assert.equal(await harness.open(newReviewAction({fileRqstStat: '04'})), false);
  assert.equal(harness.calls.official.length, 0);
  assert.equal(harness.calls.list.length, 1);
});

test('existing result review opens read-only using its own request identity', async () => {
  const harness = actionHarness();
  assert.equal(await harness.open(newReviewAction({aplyRsltRqstNo: 'TEST_RESULT_REVIEW', aplyRsltRqstDt: '20260912', fileResultStat: '02'})), true);
  assert.equal(harness.calls.official.length, 0);
  assert.equal(harness.calls.submit.length, 1);
  assert.equal(harness.calls.submit[0][0], '/pms/iprs/aply/B_RES00011_01.do');
  assert.deepEqual({...harness.calls.submit[0][1]}, {bizKey: 'TEST_RESULT_REVIEW', workFlag: 'readOnly', from: 'S_PMS_03012010'});
});

test('existing review draft without a verified my-work contract returns to the native list', async () => {
  const harness = actionHarness();
  assert.equal(await harness.open(newReviewAction({aplyRsltRqstNo: 'TEST_RESULT_REVIEW', aplyRsltRqstDt: '20260912', fileResultStat: '00'})), false);
  assert.equal(harness.calls.official.length + harness.calls.submit.length + harness.calls.popup.length, 0);
  assert.equal(harness.calls.list.length, 1);
});

test('office confirmation resolves the native filing detail with both request identities', async () => {
  const harness = actionHarness();
  const row = newReviewAction({routeKind: 'fileConfirmation', st: '04', fileRqstStat: '04'});
  harness.context.row = row;
  const route = vm.runInContext('resolvePopup(row)', harness.context);
  assert.equal(route.url, '/pms/iprs/aply/popup/S_PMS_03012020.do');
  assert.equal(route.via, 'popupWindow');
  assert.deepEqual({...route.params}, {intellRqstNo: 'TEST_APPLICATION_A', rqstNo: '202609-903'});
  assert.equal(await harness.open(row), true);
  assert.equal(harness.calls.popup.length, 1);
  assert.deepEqual({...harness.calls.popup[0][1]}, {intellRqstNo: 'TEST_APPLICATION_A', rqstNo: '202609-903'});
  assert.equal(harness.calls.official.length, 0);
});

test('office confirmation without any request identity cannot open a blank detail', async () => {
  const harness = actionHarness();
  assert.equal(await harness.open(newReviewAction({routeKind: 'fileConfirmation', intellRqstNo: '', stageRqstNo: '', rqstNo: ''})), false);
  assert.equal(harness.calls.popup.length + harness.calls.submit.length + harness.calls.official.length, 0);
  assert.ok(harness.calls.toast.length > 0);
});

function taskRequest(state, changes = {}) {
  return {rqstNo: 'TEST_TASK_' + state, bpmRqstNo: 'TEST_TASK_BPM_' + state, intellRqstNo: 'TEST_APPLICATION_A', intellMngNo: 'TEST_PATENT_A', apvStat: state, rqstDt: '20260901', rqstSbjt: 'Synthetic task request', ...changes};
}

function expenseRequest(changes = {}) {
  return {rqstNo: 'TEST_EXPENSE_REQUEST', intellRqstNo: 'TEST_APPLICATION_A', intellMngNo: 'TEST_PATENT_A', apvStat: '02', rqstDt: '20260901', ivenNm: 'Synthetic expense request', taxbilIsuCls: 'N', ...changes};
}

test('received task request is actionable without a my-work BPM', async () => {
  const acts = await build({task: [taskRequest('02')]});
  assert.equal(acts.length, 1);
  assert.equal(acts[0].stage, 'task');
  assert.equal(acts[0].track, 'action');
  assert.equal(acts[0].baseTrack, 'action');
  assert.equal(acts[0].action, '업무요청 접수 · 후속 처리');
});

test('received task stays actionable after its BPM is matched and later removed', async () => {
  const work = bpm({processcode: 'B_RES00012', instancename: 'TEST_TASK_BPM_02'});
  const acts = await build({task: [taskRequest('02')]}, [work]);
  const row = acts.find(act => act.stage === 'task' && !act.orphanBpm);
  assert.equal(row.myWork.processcode, 'B_RES00012');
  assert.equal(row.track, 'action');
  assert.equal(row.baseTrack, 'action');
  const context = vm.createContext({WORK: {my: [], myOk: true}, STAGE_NM: {}, acts});
  vm.runInContext(section('  function normBiz(', '  function patentBpmMeta('), context);
  vm.runInContext('applyWorkflowContinuity(acts, {clearExisting: true})', context);
  assert.equal(row.myWork, undefined);
  assert.equal(row.track, 'action');
  assert.equal(row.baseTrack, 'action');
  assert.equal(row.action, '업무요청 접수 · 후속 처리');
});

for (const state of ['00', '05']) {
  test('task state ' + state + ' remains excluded', async () => {
    const acts = await build({task: [taskRequest(state)]});
    assert.equal(acts.length, 0);
  });
}

for (const state of ['03', '04']) {
  test('task state ' + state + ' remains progress without matching my-work', async () => {
    const acts = await build({task: [taskRequest(state)]});
    assert.equal(acts.length, 1);
    assert.equal(acts[0].track, 'progress');
    assert.equal(acts[0].baseTrack, 'progress');
  });
}

test('received expense with no issued invoice is actionable', async () => {
  const acts = await build({exp: [expenseRequest()]});
  assert.equal(acts.length, 1);
  assert.equal(acts[0].stage, 'exp');
  assert.equal(acts[0].track, 'action');
  assert.equal(acts[0].baseTrack, 'action');
  assert.equal(acts[0].action, '청구서 접수 (검토 대기)');
});

for (const issuance of [{taxbilIsuCls: 'Y'}, {taxbilIsuCls: 'N', taxbilIsuDt: '20260910'}]) {
  test('received expense with invoice issuance evidence remains progress: ' + Object.keys(issuance).join(','), async () => {
    const acts = await build({exp: [expenseRequest(issuance)]});
    assert.equal(acts.length, 1);
    assert.equal(acts[0].track, 'progress');
    assert.equal(acts[0].baseTrack, 'progress');
    assert.equal(acts[0].taxDone, true);
  });
}

test('default receipt list and stage counters follow the same classification before and after track switching', async () => {
  const acts = await build({
    task: [taskRequest('02'), taskRequest('03')],
    exp: [expenseRequest(), expenseRequest({rqstNo: 'TEST_ISSUED_EXPENSE', taxbilIsuCls: 'Y'})],
  });
  const nodes = Object.fromEntries(['pd-tabs', 'pd-tc-a', 'pd-tc-p', 'pd-bign'].map(id => [id, {textContent: '', innerHTML: '', querySelectorAll: () => []}]));
  class FixtureDate extends Date {
    constructor(...args) {super(...(args.length ? args : [2026, 8, 14]));}
    static now() {return new Date(2026, 8, 14).getTime();}
  }
  const context = vm.createContext({
    Date: FixtureDate,
    document: {getElementById: id => nodes[id] || null},
    MODEL: {acts}, PORTAL: [], MASTER: null,
    hiddenActions: [], query: '', trackFilter: 'action', stageFilter: 'all', actionFilter: 'all', urgFilter: 'all',
    periodMonths: 3, K: {portal: 'test.portal'}, gmGet: (_key, fallback) => fallback,
  });
  const declarations = ['fmtYmd8', 'shiftMonthsClamped', 'pdCalendarDate', 'pdInWorkPeriod', 'pdScopedActions', 'pdPortalInPeriod', 'stageKeys', 'renderApplied', 'renderTabs', 'currentList'].map(name => declaration(name));
  vm.runInContext(section('  const STAGE_NM = ', '  const ETC_SORT = ') + '\n' + declarations.join('\n'), context);
  vm.runInContext('renderTabs()', context);
  const list = vm.runInContext('currentList()', context);
  assert.deepEqual(Array.from(list, item => item.title).sort(), ['업무요청 접수 · 후속 처리', '청구서 접수 (검토 대기)'].sort());
  assert.equal(nodes['pd-tc-a'].textContent, list.length);
  assert.equal(nodes['pd-tc-p'].textContent, 2);
  assert.equal(nodes['pd-bign'].textContent, list.length);
  assert.match(nodes['pd-tabs'].innerHTML, /data-stage="task">업무요청<i>1<\/i>/);
  assert.match(nodes['pd-tabs'].innerHTML, /data-stage="exp">청구서<i>1<\/i>/);
  vm.runInContext("trackFilter='progress'; renderTabs()", context);
  const progress = vm.runInContext('currentList()', context);
  assert.equal(progress.length, 2);
  assert.ok(Array.from(progress).every(item => item.act.track === 'progress'));
  assert.equal(nodes['pd-tc-p'].textContent, progress.length);
  assert.equal(nodes['pd-bign'].textContent, progress.length);
  assert.equal(nodes['pd-tc-a'].textContent, 2);
});
