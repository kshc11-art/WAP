'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../scripts/stats-ledger.user.js');

function row(no, seq, dr, cr, desc) {
  return {
    acctCd: '55630', acctNm: '지식재산권출원등록비',
    reslDt: '2026-01-12', reslNo: no, reslSeq: String(seq),
    budgCd: 'TESTBUDG', budgNm: '합성 예산',
    expCd: '55630', expNm: '지식재산권출원등록비',
    busiRegNm: '합성 거래처', busiCatNm: '기본사업',
    busiClsNm: '기관고유사업', busiBusNm: '기본사업소분류',
    busiSepNm: '연구개발', setlKey: '', rqstNo: '', evdcCls: '',
    pblcnDt: '', aprvNo: '', cardNo: '', incomeDt: '',
    taxBase: 0, bankNm: '', bankAcctNo: '', jaAmt: 0, addInfo: '',
    drAmt: dr, crAmt: cr, reslDesc: desc,
  };
}

const input = [
  row('TEST-A', 1, 1000, 0, '국내출원료-국내관납료'),
  row('TEST-B', 1, 0, 250, '해외출원료(중국)-해외관납료'),
  row('TEST-C', 1, 5000, 100, '계정 대체'),
  { ...row('', '', 0, 0, ''), budgCd: '' },
  row('TEST-E', 1, 300, 75, '소프트웨어 저작권 등록비'),
];

test('원본 행, 제외, 금액, 고유키를 행별로 검산한다', () => {
  L._setOverrides({});
  const r = L.build(input.map(x => ({ ...x })), '합성 테스트', '');
  assert.ok(r);
  assert.deepEqual(
    [r.stat.total, r.stat.blank, r.stat.excluded, r.stat.kept],
    [5, 1, 1, 3],
  );
  assert.deepEqual(
    [r.stat.exDr, r.stat.exCr, r.stat.dr, r.stat.cr],
    [5000, 100, 1300, 325],
  );
  assert.equal(r.aoa.length, 4);
  assert.equal(r.recs.length, 3);

  const expected = new Map([
    ['TEST-A|1|TESTBUDG', 1000],
    ['TEST-B|1|TESTBUDG', -250],
    ['TEST-E|1|TESTBUDG', 225],
  ]);
  assert.equal(new Set(r.src.map(L.rowKey)).size, r.src.length);
  const h = r.headers;
  const ix = {
    no: h.indexOf('결의번호'), seq: h.lastIndexOf('순번'),
    budg: h.indexOf('예산코드'), dr: h.indexOf('차변금액'),
    cr: h.indexOf('대변금액'), fin: h.indexOf('최종값'),
  };
  assert.ok(Object.values(ix).every(i => i >= 0));
  const observed = new Set();
  r.aoa.slice(1).forEach((out, i) => {
    const src = r.src[i];
    const key = [out[ix.no], out[ix.seq], out[ix.budg]].join('|');
    assert.equal(key, L.rowKey(src));
    assert.equal(out[ix.dr], src.drAmt);
    assert.equal(out[ix.cr], src.crAmt);
    assert.equal(out[ix.fin], expected.get(key));
    assert.equal(out[ix.fin], out[ix.dr] - out[ix.cr]);
    assert.ok(!observed.has(key));
    observed.add(key);
  });
  assert.deepEqual(observed, new Set(expected.keys()));
  assert.equal([...expected.values()].reduce((a, b) => a + b, 0), 975);
  const stats = L.buildStats(r);
  assert.equal(stats.sumFin, 975);
  assert.ok(stats.checks.every(x => x.total === 975));
});

test('메모리 XLSX 왕복에서 원본 식별자와 금액을 보존한다', async () => {
  L._setOverrides({});
  const r = L.build(input.map(x => ({ ...x })), '합성 테스트', '');
  const bytes = await L.MiniXLSX.write(L.makeWorkbook(r, false).sheets);
  const parsed = await L.parseXlsxBytes(bytes);
  assert.equal(parsed.rows.length, 3);
  assert.deepEqual(
    parsed.rows.map(x => [x.reslNo, x.reslSeq, x.budgCd, x.drAmt, x.crAmt]),
    [
      ['TEST-A', '1', 'TESTBUDG', 1000, 0],
      ['TEST-B', '1', 'TESTBUDG', 0, 250],
      ['TEST-E', '1', 'TESTBUDG', 300, 75],
    ],
  );
});

function one(desc, override = null) {
  const src = row('TEST-ONE', 1, 100, 0, desc);
  L._setOverrides(override ? { [L.rowKey(src)]: override } : {});
  return L.build([src], '합성 테스트', '');
}

function region(r) {
  return r.aoa[1][r.headers.indexOf('국내/해외 구분')];
}

function rightType(r) {
  return r.aoa[1][r.headers.indexOf('권리유형')];
}

test('명시된 30·40 출원·등록번호는 특허 추론을 막고 검토 사유를 남긴다', () => {
  const design = one('출원번호: 30-2026-1111111 [국내출원료-국내관납료]');
  assert.equal(rightType(design), '기타/미확인');
  assert.equal(design.stat.review, 1);
  assert.match(design.review[1][4], /30\/40 계열.*권리유형 확인/);

  const trademark = one('등록번호: 40-1111111 특허 등록 [국내등록료-국내관납료]');
  assert.equal(rightType(trademark), '기타/미확인');
  assert.match(trademark.review[1][4], /30\/40 계열.*권리유형 확인/);

  const manuallyLocated = one('출원번호: 30-2026-1111111 [출원료-관납료]', { region: '국내' });
  assert.equal(rightType(manuallyLocated), '기타/미확인');
  assert.match(manuallyLocated.review[1][4], /30\/40 계열.*권리유형 확인/);
});

test('10 특허·PCT·소프트웨어 근거와 라벨 밖의 숫자를 그대로 처리한다', () => {
  assert.equal(rightType(one('출원번호: 10-2026-1111111 [국내출원료-국내관납료]')), '특허');
  assert.equal(rightType(one('PCT/KR2026/999999 [해외출원료-해외관납료]')), '특허');
  assert.equal(rightType(one('소프트웨어 저작권 등록 [국내등록료-국내관납료]')), '저작권(소프트웨어)');
  assert.equal(rightType(one('특허 출원 30-2026-1111111 [국내출원료-국내관납료]')), '특허');
  assert.equal(rightType(one('출원번호: 130-2026-1111111 특허 [국내출원료-국내관납료]')), '특허');
  assert.equal(rightType(one('출원번호: 30-2026-11111110 특허 [국내출원료-국내관납료]')), '특허');

  const conflicting = one('출원번호: 40-2026-1111111 PCT/KR2026/999999 [해외출원료-해외관납료]');
  assert.equal(rightType(conflicting), '기타/미확인');
  assert.equal(region(conflicting), '해외');
  assert.match(conflicting.review[1][4], /30\/40 계열.*권리유형 확인/);
});

test('대괄호 적요의 누락 분류와 기타 원문을 검토에 남긴다', () => {
  const missing = one('[등록료-관납료]');
  assert.equal(region(missing), '');
  assert.equal(missing.stat.review, 1);
  assert.match(missing.review[1][4], /국내\/해외.*수기 입력 필요/);

  const miscellaneous = one('[기타-기타]');
  assert.match(miscellaneous.review[1][4], /지출구분 원문이 "기타"/);
  assert.match(miscellaneous.review[1][4], /상세내역 원문이 "기타"/);
});

test('KR 출원번호를 다른 번호의 부분 문자열로 오인하지 않는다', () => {
  assert.equal(region(one('110-2023-0092800 [연차료-관납료]')), '');
  assert.equal(region(one('10-2023-0092800 [연차료-관납료]')), '국내');
  assert.equal(region(one('10-2018-107633 [연차료-관납료]')), '');
});

test('PCT와 소프트웨어 저작권의 국내외 정책과 수기 충돌을 검토한다', () => {
  const copyright = '소프트웨어 저작권 [해외등록료-해외대리인비용]';
  assert.equal(region(one(copyright)), '국내');
  const copyrightConflict = one(copyright, {
    rightType: '저작권(소프트웨어)', region: '해외',
  });
  assert.equal(region(copyrightConflict), '국내');
  assert.match(copyrightConflict.review[1][4], /저작권\(소프트웨어\)=국내 정책과 충돌/);

  const pctConflict = one('PCT/KR2024/000001 [해외출원료-국내대리인비용]', {
    pctYn: 'Y', region: '국내',
  });
  assert.equal(region(pctConflict), '해외');
  assert.equal(pctConflict.stat.review, 1);
  assert.match(pctConflict.review[1][4], /PCT=해외 정책과 충돌/);
});
