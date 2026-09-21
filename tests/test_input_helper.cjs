'use strict';

// Reviewer-grid regression for the 등록완료 보고 / 출원결과검토 auto-add in the input
// helper. Fixtures are synthetic (no real employee numbers or names). The shipped
// functions run in isolation against a Kendo-like grid stand-in that mimics the
// page contract observed in the screen source: item.set() raises the page's
// dataChange handler (synchronous employee lookup, then grid1.refreshRow() on
// the *selected* row), while direct property writes do not.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../scripts/ipms-input-helper.user.js'), 'utf8');

function declaration(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(source);
  if (!match) throw new Error('Missing source function: ' + name);
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

const shipped = [
  'sameEmpNo', 'gridItemUid', 'gridAddBlankRow', 'gridWriteFields', 'gridRowEl',
  'gridSelectRow', 'gridRowShows', 'gridRenderRow', 'gridVerifyItem',
  'addReviewerRow', 'addAplyRsltReviewerRow', 'scheduleRegCmplAuto',
].map(declaration).join('\n');

const REG_BLANK = { isChecked: false, rowNumber: '', userId: '', userNm: '', deptNm: '', fgradeNm: '', telnoOffc: '' };
const APLY_BLANK = { isChecked: false, seqNo: '', ivenEmpNo: '', ivenEmpNm: '', deptNm: '', fgradeNm: '', telnoOffc: '', apvlDt: '' };

// Stand-in for the page's kriss.ui.grid + Kendo grid pair.
function makeGrid(options = {}) {
  const nonEditable = new Set(options.nonEditable || ['deptNm', 'fgradeNm', 'telnoOffc']);
  const lookupField = options.lookupField || 'userNm';
  const blank = options.blank || REG_BLANK;
  const items = [];
  const rendered = new Map();
  const listeners = {};
  const log = { lookups: 0, addRow: 0, refreshRow: 0, refreshRowArgs: [], refresh: 0 };
  let seq = 0;
  let selectedUid = null;

  function render(item) {
    rendered.set(item.uid, Object.keys(item)
      .filter(k => typeof item[k] !== 'function' && !['uid', 'dirty', 'dirtyFields'].includes(k))
      .map(k => String(item[k])).join(' | '));
  }

  function makeItem(data) {
    const item = Object.assign({ uid: 'uid-' + (++seq), dirty: false, dirtyFields: {} }, data);
    // Kendo Model.set: ignores editable:false fields, marks dirty, raises itemchange.
    item.set = function (field, value) {
      if (nonEditable.has(field)) return;
      if (this[field] === value) return;
      this[field] = value;
      this.dirty = true;
      this.dirtyFields[field] = true;
      render(this);
      ds.trigger('change', { action: 'itemchange', field, items: [this] });
    };
    return item;
  }

  const ds = {
    data: () => items,
    getByUid: uid => items.find(x => x.uid === uid) || null,
    bind(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    unbind(event, fn) { listeners[event] = (listeners[event] || []).filter(f => f !== fn); },
    trigger(event, e) { (listeners[event] || []).forEach(fn => fn(e)); },
    insert(index, data) { const it = makeItem(data); items.splice(index, 0, it); render(it); return it; },
    add(data) { return ds.insert(items.length, data); },
    // A completed server read replaces the whole data set, as Kendo's DataSource does.
    readComplete(rows) {
      items.length = 0;
      rendered.clear();
      rows.forEach(r => items.push(makeItem(r)));
      items.forEach(render);
      ds.trigger('requestEnd', { type: 'read' });
    },
  };

  const kg = {
    dataSource: ds,
    tbody: {
      find(selector) {
        const uid = (/data-uid="([^"]+)"/.exec(selector) || [])[1];
        const has = rendered.has(uid);
        return { length: has ? 1 : 0, uid: has ? uid : null, text: () => rendered.get(uid) || '' };
      },
    },
    select(tr) { if (tr && tr.uid) selectedUid = tr.uid; return { length: selectedUid ? 1 : 0 }; },
    refresh() {
      log.refresh++;
      if (options.refreshThrows) throw new Error('refresh blocked');
      items.forEach(render);
      selectedUid = null; // Kendo re-render drops the selection
    },
  };

  const pageGrid = {
    addRow() {
      log.addRow++;
      if (options.addRowThrows) throw new Error('addRow blocked');
      const it = makeItem(Object.assign({}, blank));
      if (options.append) items.push(it); else items.unshift(it);
      render(it);
    },
    getRowData() { return selectedUid ? ds.getByUid(selectedUid) : null; },
    // Page contract: refreshRow() re-renders the selected row. The optional row
    // argument is honoured unless the stand-in is told to ignore it.
    refreshRow(row) {
      log.refreshRow++;
      log.refreshRowArgs.push(row ? row.uid : undefined);
      if (options.refreshRowThrows) throw new Error('refreshRow blocked');
      const target = options.refreshRowIgnoresArg ? this.getRowData() : (row || this.getRowData());
      const tr = kg.tbody.find('tr[data-uid="' + target.uid + '"]');
      assert.equal(tr.length, 1);
      render(target);
    },
  };

  // The page's own dataChange handler: a name change runs a synchronous employee
  // lookup and then grid1.refreshRow() with no argument.
  ds.bind('change', e => {
    if (e.action !== 'itemchange' || e.field !== lookupField) return;
    log.lookups++;
    const it = e.items[0];
    it.deptNm = 'Dept lookup';
    it.fgradeNm = 'Grade lookup';
    it.telnoOffc = '0000';
    pageGrid.refreshRow();
  });

  return { kg, pageGrid, ds, items, log, rendered, makeItem, selected: () => selectedUid };
}

function makeContext(grid, overrides = {}) {
  const toasts = [];
  const warns = [];
  const windowObj = { grid1: grid.pageGrid };
  const context = vm.createContext(Object.assign({
    TAG: '[TEST]',
    console: { log() {}, warn: (...a) => warns.push(a.map(String).join(' ')) },
    toast: (msg, type) => toasts.push({ msg, type }),
    $: selector => ({ data: key => (selector === '#grid1' && key === 'kendoGrid') ? grid.kg : null }),
    window: windowObj,
    isRegCmplAccepted: () => true,
    isAplyRsltCnfEditable: () => true,
  }, overrides));
  vm.runInContext(shipped, context, { timeout: 3000 });
  return { context, toasts, warns, windowObj };
}

const REC_A = { empNo: '00001', empNm: 'Tester A', deptNm: 'Dept A', fgradeNm: 'Grade A', telnoOffc: '1234' };

function addReg(ctx, rec = REC_A, source = '주발명자') {
  ctx.context.rec = rec;
  ctx.context.src = source;
  vm.runInContext('addReviewerRow(rec, src)', ctx.context);
}

test('stand-in reproduces the reported page failure when userNm is written through item.set()', () => {
  const grid = makeGrid();
  grid.pageGrid.addRow();
  const item = grid.items[0];
  assert.throws(() => item.set('userNm', 'Tester A'), /Cannot read properties of null \(reading 'uid'\)/);
  assert.equal(grid.log.lookups, 1);
  assert.equal(grid.selected(), null);
  // And Model.set silently ignores the editable:false columns.
  item.set('deptNm', 'Dept A');
  assert.equal(item.deptNm, 'Dept lookup');
});

test('등록완료 보고: new row is filled by direct writes, selected, rendered, without the page lookup', () => {
  const grid = makeGrid();
  const ctx = makeContext(grid);
  addReg(ctx);
  assert.equal(grid.log.addRow, 1);
  assert.equal(grid.log.lookups, 0, 'the page dataChange lookup must not run');
  assert.equal(grid.items.length, 1);
  const row = grid.items[0];
  assert.deepEqual(
    [row.userId, row.userNm, row.deptNm, row.fgradeNm, row.telnoOffc],
    ['00001', 'Tester A', 'Dept A', 'Grade A', '1234'],
  );
  assert.equal(row.dirty, true);
  assert.deepEqual(Object.keys(row.dirtyFields).sort(), ['deptNm', 'fgradeNm', 'telnoOffc', 'userId', 'userNm']);
  assert.equal(grid.selected(), row.uid);
  assert.deepEqual(grid.log.refreshRowArgs, [row.uid]);
  assert.equal(grid.log.refresh, 0);
  assert.match(grid.rendered.get(row.uid), /Tester A/);
  assert.deepEqual(ctx.toasts.map(t => t.type), ['ok']);
  assert.match(ctx.toasts[0].msg, /^주발명자 Tester A \(00001\) 검토자 추가 완료$/);
  assert.deepEqual(ctx.warns, []);
  assert.equal(ctx.windowObj.__krissRegCmplLastAdd.uid, row.uid);
  assert.equal(ctx.windowObj.__krissRegCmplLastAdd.userId, '00001');
});

test('등록완료 보고: a refreshRow that only honours the selected row works because the new row is selected first', () => {
  const grid = makeGrid({ refreshRowIgnoresArg: true });
  const ctx = makeContext(grid);
  addReg(ctx);
  assert.deepEqual(ctx.toasts.map(t => t.type), ['ok']);
  assert.equal(grid.log.refresh, 0);
  assert.equal(grid.log.lookups, 0);
  assert.match(grid.rendered.get(grid.items[0].uid), /Tester A/);
});

test('등록완료 보고: refreshRow failure falls back to the Kendo refresh and re-selects the row', () => {
  const grid = makeGrid({ refreshRowThrows: true });
  const ctx = makeContext(grid);
  addReg(ctx);
  const row = grid.items[0];
  assert.equal(grid.log.refresh, 1);
  assert.equal(grid.selected(), row.uid);
  assert.match(grid.rendered.get(row.uid), /Tester A/);
  assert.deepEqual(ctx.toasts.map(t => t.type), ['ok']);
  assert.equal(ctx.warns.length, 1);
  assert.match(ctx.warns[0], /refreshRow 실패/);
});

test('등록완료 보고: when neither re-render path works, the data stays and the user is warned, not told it succeeded', () => {
  const grid = makeGrid({ refreshRowThrows: true, refreshThrows: true });
  const ctx = makeContext(grid);
  addReg(ctx);
  const row = grid.items[0];
  assert.deepEqual([row.userId, row.userNm], ['00001', 'Tester A']);
  assert.deepEqual(ctx.toasts.map(t => t.type), ['warn']);
  assert.match(ctx.toasts[0].msg, /화면 표시를 확인하지 못했습니다/);
  assert.equal(ctx.windowObj.__krissRegCmplLastAdd.uid, row.uid);
});

test('등록완료 보고: addRow failure reports an error and leaves the grid untouched', () => {
  const grid = makeGrid({ addRowThrows: true });
  const ctx = makeContext(grid);
  addReg(ctx);
  assert.equal(grid.items.length, 0);
  assert.deepEqual(ctx.toasts.map(t => t.type), ['error']);
  assert.match(ctx.toasts[0].msg, /검토행 추가 실패\(addRow blocked\)/);
  assert.equal(ctx.windowObj.__krissRegCmplLastAdd, undefined);
});

test('등록완료 보고: addRow that creates no detectable row stops without writing anything', () => {
  const grid = makeGrid();
  grid.pageGrid.addRow = function () { grid.log.addRow++; };
  const ctx = makeContext(grid);
  addReg(ctx);
  assert.equal(grid.items.length, 0);
  assert.deepEqual(ctx.toasts.map(t => t.type), ['warn']);
  assert.match(ctx.toasts[0].msg, /새 검토행 생성을 확인하지 못했습니다/);
});

test('등록완료 보고: a reviewer already present (leading-zero variant) is not added twice', () => {
  const grid = makeGrid();
  grid.ds.add({ userId: '1', userNm: 'Tester A', deptNm: '', fgradeNm: '', telnoOffc: '' });
  const ctx = makeContext(grid);
  addReg(ctx);
  assert.equal(grid.log.addRow, 0);
  assert.equal(grid.items.length, 1);
  assert.deepEqual(ctx.toasts.map(t => t.type), ['warn']);
  assert.match(ctx.toasts[0].msg, /이미 추가된 검토자입니다: Tester A \(00001\)/);
});

test('등록완료 보고: missing employee number or name is refused before touching the grid', () => {
  const grid = makeGrid();
  const ctx = makeContext(grid);
  addReg(ctx, { empNo: '', empNm: 'Tester A' });
  assert.equal(grid.log.addRow, 0);
  assert.deepEqual(ctx.toasts.map(t => t.type), ['error']);
});

test('등록완료 보고: without the page grid API the dataSource fallback inserts and fills the first row', () => {
  const grid = makeGrid();
  grid.ds.add({ userId: '00002', userNm: 'Tester B', deptNm: '', fgradeNm: '', telnoOffc: '' });
  const ctx = makeContext(grid);
  ctx.windowObj.grid1 = undefined;
  addReg(ctx);
  assert.equal(grid.items.length, 2);
  assert.deepEqual([grid.items[0].userId, grid.items[0].userNm], ['00001', 'Tester A']);
  assert.equal(grid.items[0].dirty, true);
  assert.equal(grid.log.refresh, 1);
  assert.equal(grid.selected(), grid.items[0].uid);
  assert.deepEqual(ctx.toasts.map(t => t.type), ['ok']);
});

test('출원결과검토: the same direct-write contract fills ivenEmpNo/ivenEmpNm and the sequence number', () => {
  const grid = makeGrid({ blank: APLY_BLANK, lookupField: 'ivenEmpNm', append: true });
  grid.ds.add(Object.assign({}, APLY_BLANK, { seqNo: 1, ivenEmpNo: '00009', ivenEmpNm: 'Tester Z' }));
  const ctx = makeContext(grid);
  ctx.context.rec = { empNo: '00002', empNm: 'Tester B', deptNm: 'Dept B', fgradeNm: 'Grade B', telnoOffc: '5678' };
  vm.runInContext("addAplyRsltReviewerRow(rec, '주발명자')", ctx.context);
  assert.equal(grid.log.addRow, 1);
  assert.equal(grid.log.lookups, 0);
  assert.equal(grid.items.length, 2);
  const row = grid.items[1];
  assert.deepEqual(
    [row.ivenEmpNo, row.ivenEmpNm, row.deptNm, row.fgradeNm, row.telnoOffc, row.seqNo],
    ['00002', 'Tester B', 'Dept B', 'Grade B', '5678', 2],
  );
  assert.equal(row.dirty, true);
  assert.equal(grid.selected(), row.uid);
  assert.match(grid.rendered.get(row.uid), /Tester B/);
  assert.deepEqual(ctx.toasts.map(t => t.type), ['ok']);
  assert.match(ctx.toasts[0].msg, /Tester B \(00002\) 검토자 추가 완료/);
});

test('출원결과검토: duplicate by employee number or by name on a blank-number row is refused', () => {
  const grid = makeGrid({ blank: APLY_BLANK, lookupField: 'ivenEmpNm' });
  grid.ds.add(Object.assign({}, APLY_BLANK, { seqNo: 1, ivenEmpNo: '', ivenEmpNm: 'Tester B' }));
  const ctx = makeContext(grid);
  ctx.context.rec = { empNo: '00002', empNm: 'Tester B' };
  vm.runInContext("addAplyRsltReviewerRow(rec, '주발명자')", ctx.context);
  assert.equal(grid.log.addRow, 0);
  assert.deepEqual(ctx.toasts.map(t => t.type), ['warn']);
});

function scheduler(grid) {
  const timers = [];
  const fills = [];
  const ctx = makeContext(grid, {
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    fillRegCmplReviewer: () => fills.push(1),
  });
  vm.runInContext('scheduleRegCmplAuto()', ctx.context);
  const fire = ms => { const due = timers.filter(t => t.ms === ms && !t.fired); due.forEach(t => { t.fired = true; t.fn(); }); return due.length; };
  return { ctx, timers, fills, fire };
}

test('scheduler: the 3.5s fallback adds once, and a later empty read re-adds exactly once', () => {
  const grid = makeGrid();
  const s = scheduler(grid);
  assert.equal(s.fire(3500), 1);
  assert.deepEqual(s.fills, [1]);
  assert.equal(s.ctx.windowObj.__krissRegCmplAutoDone, true);

  // The add completes (as addReviewerRow records it).
  grid.pageGrid.addRow();
  const row = grid.items[0];
  row.userId = '00001'; row.userNm = 'Tester A';
  s.ctx.windowObj.__krissRegCmplLastAdd = { uid: row.uid, userId: '00001', at: 1 };

  // A late server read replaces the data with the saved (empty) reviewer list.
  grid.ds.readComplete([]);
  assert.equal(grid.items.length, 0);
  assert.equal(s.fire(150), 1);
  assert.deepEqual(s.fills, [1, 1], 're-add exactly once');
  assert.equal(s.ctx.windowObj.__krissRegCmplAutoReadd, true);

  // Any further empty read must not add a third time.
  grid.ds.readComplete([]);
  assert.equal(s.fire(150), 1);
  assert.deepEqual(s.fills, [1, 1]);
});

test('scheduler: a read that lands while the first add is still pending does not double-add', () => {
  const grid = makeGrid();
  const s = scheduler(grid);
  s.fire(3500);
  assert.deepEqual(s.fills, [1]);
  grid.ds.readComplete([]);            // lookup still in flight: no LastAdd yet
  s.fire(150);
  assert.deepEqual(s.fills, [1]);
  assert.notEqual(s.ctx.windowObj.__krissRegCmplAutoReadd, true);
});

test('scheduler: a read that returns saved reviewers skips the auto-add and marks it done', () => {
  const grid = makeGrid();
  const s = scheduler(grid);
  grid.ds.readComplete([Object.assign({}, REG_BLANK, { userId: '00003', userNm: 'Tester C' })]);
  s.fire(150);
  assert.deepEqual(s.fills, []);
  assert.equal(s.ctx.windowObj.__krissRegCmplAutoDone, true);
  s.fire(3500);
  assert.deepEqual(s.fills, []);
});

test('scheduler: leaves the accepted-state gate in place', () => {
  const grid = makeGrid();
  const s = scheduler(grid);
  s.ctx.context.isRegCmplAccepted = () => false;
  s.fire(3500);
  assert.deepEqual(s.fills, []);
  assert.notEqual(s.ctx.windowObj.__krissRegCmplAutoDone, true);
});
