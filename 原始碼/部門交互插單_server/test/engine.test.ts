/* 鎖住試算：server 的 engine.cjs 必須和 v1 一字不差，三筆示意原文的結果必須和 Demo 的黃金檔一致。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { E } from '../src/engine/index.ts';

const require = createRequire(import.meta.url);
const { SAMPLES, AS_OF, summarize } = require('./fixtures/cases.cjs');
const golden = require('./fixtures/golden.json');
const here = (p: string) => new URL(p, import.meta.url);

test('engine.cjs 與 v1 原檔一字不差', { skip: !existsSync(here('../../demo-v1/engine.js')) }, () => {
  assert.equal(readFileSync(here('../src/engine/engine.cjs'), 'utf8'), readFileSync(here('../../demo-v1/engine.js'), 'utf8'));
});

for (const s of SAMPLES) {
  test('黃金結果：' + s.key, () => {
    assert.deepEqual(JSON.parse(JSON.stringify(summarize(E, s))), golden[s.key]);
  });
}

test('相同輸入得到相同指紋，改參數指紋就變', () => {
  const X = { id: 'A-0001', customer: '甲', model: 'A1', qty: 800, due: '2026-11-20', partChange: true };
  const a = E.calc(E.seedQueue(), X, E.defaults(), AS_OF).fingerprint;
  assert.equal(E.calc(E.seedQueue(), X, E.defaults(), AS_OF).fingerprint, a);
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
