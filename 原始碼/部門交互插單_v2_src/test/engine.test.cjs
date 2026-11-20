/* 鎖住試算結果：v2 的 engine.js 必須和 v1 一字不差，三筆示意原文的結果必須和黃金檔一致。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const E = require('../src/engine.js');
const { SAMPLES, AS_OF, summarize } = require('./cases.cjs');
const golden = require('./golden.json');

test('engine.js 與 v1 原檔一字不差', () => {
  const a = fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8');
  const b = fs.readFileSync(path.join(__dirname, '../../demo-v1/engine.js'), 'utf8');
  assert.equal(a, b);
});

for (const s of SAMPLES) {
  test('黃金結果：' + s.key, () => {
    assert.deepEqual(JSON.parse(JSON.stringify(summarize(E, s))), golden[s.key]);
  });
}

test('同樣輸入得到同樣指紋，改參數指紋就變', () => {
  const P = E.defaults();
  const X = { id: 'A-0001', customer: '甲', model: 'A1', qty: 800, due: '2026-11-20', partChange: true };
  const a = E.calc(E.seedQueue(), X, P, AS_OF).fingerprint;
  const b = E.calc(E.seedQueue(), X, E.defaults(), AS_OF).fingerprint;
  assert.equal(a, b);
  const P2 = E.defaults(); P2.guess.wA = 1.5;
  assert.notEqual(E.calc(E.seedQueue(), X, P2, AS_OF).fingerprint, a);
});

test('個案數字沒被改動', () => {
  const D = E.defaults().data;
  assert.equal(D.rate, 150);
  assert.equal(D.changeoverH, 0.90);
  assert.equal(D.poolHoursPerDay, (760 + 133) / 26);
  assert.deepEqual(D.penalty, { '乙': 0.02, '丙': 0.01, '甲': 0 });
});
