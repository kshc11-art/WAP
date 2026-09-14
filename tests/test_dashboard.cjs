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
  test('old actionable ' + routeKind + ' stays visible', () => {
    assert.equal(inPeriod({stage: 'file', track: 'action', routeKind, requestDate: '20200101'}), true);
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
});

test('old BPM request date cannot hide an otherwise undated actionable filing', () => {
  assert.equal(inPeriod({stage: 'file', track: 'action', routeKind: 'fileResultReview', myWork: {requestDate: '20200101'}}), true);
});

function merge(parts) {
  const context = vm.createContext({parts});
  vm.runInContext(declaration('pdMergeFilingSources'), context);
  return vm.runInContext('pdMergeFilingSources(parts)', context);
}

test('filing source overlap merges once and uses the later targeted row', () => {
  const result = merge([
    {rows: [filing({apvStat: '03'})]},
    {rows: []},
    {rows: [filing({apvStat: '04', rqstApvStat: '04'})]},
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.n, 1);
  assert.equal(result.rows[0].rqstApvStat, '04');
  assert.deepEqual(Array.from(result.supplementErrors), []);
});

test('a result-review number assigned between reads replaces the earlier same filing row', () => {
  const result = merge([
    {rows: [filing({aplyRsltRqstNo: '', apvStat: '05'})]},
    {rows: []},
    {rows: [filing({aplyRsltRqstNo: 'TEST_REVIEW_B', apvStat: '06'})]},
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].aplyRsltRqstNo, 'TEST_REVIEW_B');
  assert.equal(result.rows[0].apvStat, '06');
});

test('different filing request identities remain separate for the same application', () => {
  const result = merge([{rows: [filing()]}, {rows: []}, {rows: [filing({rqstNo: '202609-904'})]}]);
  assert.equal(result.rows.length, 2);
});

test('failure of all three filing reads stays a failure, not an empty successful list', () => {
  const result = merge([
    {rows: null, err: 'Synthetic period-read failure'},
    {rows: null, err: 'Synthetic pending-read failure'},
    {rows: null, err: 'Synthetic review-read failure'},
  ]);
  assert.equal(result.rows, null);
  assert.ok(result.err);
});

test('partial supplementary failure retains successful rows and warns', () => {
  const result = merge([{rows: [filing()]}, {rows: null, err: 'Synthetic unavailable'}, {rows: []}]);
  assert.equal(result.rows.length, 1);
  assert.ok(result.supplementErrors.some(message => /조회 실패/.test(message)));
});

test('known and possible truncation both remain visible in merge warnings', () => {
  const result = merge([
    {rows: [filing()], truncated: true},
    {rows: [], maybeTruncated: true},
    {rows: []},
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.supplementErrors.filter(message => /일부 수신/.test(message)).length, 2);
});

test('unidentified filing rows are retained separately rather than collapsed', () => {
  const result = merge([{rows: [{apvStat: '04'}]}, {rows: [{apvStat: '10'}]}, {rows: []}]);
  assert.equal(result.rows.length, 2);
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
  const context = vm.createContext({
    DIAG: [],
    requestContext,
    RUNTIME: {isCurrent: () => options.current !== false},
    callApi: async (name, body, ctx) => {
      calls.push({name, body, ctx});
      if (name !== 'file') return {rows: name === 'exp' ? [{}] : [], n: name === 'exp' ? 1 : 0};
      if (!body) return {rows: [filing()], n: 1};
      const selector = body.apvStat || 'confirmation';
      if (selector === options.failedSelector) return {rows: null, n: 0, err: 'Synthetic targeted read failure'};
      return {rows: [filing({rqstNo: 'TEST_FILING_' + selector, apvStat: body.apvStat || '04'})], n: 1};
    },
  });
  vm.runInContext(coreDeclaration[0] + '\n' + declaration('pdMergeFilingSources') + '\n' + declaration('fetchIpmsSources'), context);
  const result = await vm.runInContext('fetchIpmsSources(requestContext)', context);
  return {result, calls, requestContext};
}

test('all six targeted filing reads run even when the base period read already has data', async () => {
  const {result, calls, requestContext} = await fetchSources();
  const filingCalls = calls.filter(call => call.name === 'file');
  assert.equal(filingCalls.length, 7);
  assert.equal(filingCalls.filter(call => call.body === null).length, 1);
  const extra = filingCalls.filter(call => call.body !== null);
  assert.deepEqual(extra.map(call => call.body.apvStat || (call.body.confirmWork1 === 'Y' ? 'confirmation' : '?')).sort(), ['05', '06', '07', '08', '10', 'confirmation']);
  extra.forEach(call => {
    assert.equal(call.body.rqstCls, '03');
    assert.equal(call.body.rqstStrDt, '');
    assert.equal(call.body.rqstEndDt, '');
    assert.equal(call.body.confirmWork2, '');
    assert.equal(call.body.confirmWork3, '');
    assert.equal(call.body.confirmWork4, '');
    assert.equal(call.ctx, requestContext);
    if (call.body.apvStat) assert.equal(call.body.confirmWork1, '');
  });
  assert.equal(result.file.rows.length, 7, 'Targeted results must be returned to buildActions, not merely fetched');
  assert.deepEqual(Array.from(result.file.supplementErrors), []);
});

test('targeted result-review failure preserves the other six filing sources and identifies the failed phase', async () => {
  const {result} = await fetchSources({failedSelector: '06'});
  assert.equal(result.file.rows.length, 6);
  assert.equal(result.file.supplementErrors.length, 1);
  assert.match(result.file.supplementErrors[0], /검토06.*조회 실패/);
});

test('cancelled source context does not dispatch supplementary filing reads', async () => {
  const {result, calls} = await fetchSources({current: false});
  assert.equal(calls.filter(call => call.name === 'file').length, 1);
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
