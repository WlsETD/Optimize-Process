/* AI 輔助規則：異常只提醒、理由分類、解釋只用試算數字、換線估計誤差超過 20% 要標示。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Store = require('../src/store.js');

const BOSS = 'P-01', SALES = 'P-02', PLANNER = 'P-04';
const mk = () => Store.create({ fast: true });

async function flowTo(st, key, upto) {
  const s = Store.SAMPLES.find(x => x.key === key);
  const o = (await st.forward(BOSS, s.text, key)).order;
  st.followups(o).forEach(q => {
    if (q.k === 'qty') st.setField(o, 'qty', 2400);
    else if (q.chips.length) st.setField(o, q.k, q.chips[0].v);
  });
  assert.equal(st.submit(o, SALES).ok, true);
  if (upto === 'queued') return o;
  assert.equal(st.decide(o, 'adopt', PLANNER).ok, true);
  return o;
}

test('異常檢查只提醒：數量超範圍會列出，但不改欄位、不擋送出', async () => {
  const st = mk();
  const s = Store.SAMPLES.find(x => x.key === 'full');
  const o = (await st.forward(BOSS, s.text, 'full')).order;
  st.setField(o, 'qty', 99999);
  const found = st.anomalies(o);
  assert.ok(found.some(x => x.startsWith('數量 99999')), '應列出數量異常');
  assert.equal(o.draft.fields.qty.value, 99999, '不改欄位');
  assert.equal(st.submit(o, SALES).ok, true, '只提醒，不擋送出');
  assert.ok(o.anomalies.length >= 1, '送出時留下異常紀錄');
});

test('理由分類用關鍵字，空字串為 null', () => {
  assert.equal(Store.reasonCategory('機台要檢修'), '設備');
  assert.equal(Store.reasonCategory('缺料要等'), '物料');
  assert.equal(Store.reasonCategory('客戶要求改期'), '客戶');
  assert.equal(Store.reasonCategory('其他說明文字'), '其他');
  assert.equal(Store.reasonCategory('   '), null);
});

test('解釋只用試算結果的數字：可對照的數字全部通過檢查', () => {
  const b = { afterId: 'O-1', startAt: { label: '11/21 09:00' }, endAt: { label: '11/23 17:00' }, extraC: 2 };
  const ok = Store.explainCalc(b);
  assert.equal(ok.ok, true);
  assert.match(ok.text, /額外換線 2 次/);
});

test('排程後會產生解釋，且送出的 AI 解釋可在試算摘要看到', async () => {
  const st = mk();
  const o = await flowTo(st, 'full', 'queued');
  const sm = st.summary(o);
  assert.equal(sm.explain.ok, true);
  assert.equal(typeof sm.explain.text, 'string');
  const d = await flowTo(mk(), 'full', 'decided');
  assert.equal(typeof d.decision.explain, 'string');
  assert.equal(d.decision.reasonCat, null, '採用建議沒有理由，分類為 null');
});

test('換線估計誤差超過 20% 會標示，沒超過不標示', async () => {
  const st = mk();
  const o = await flowTo(st, 'full', 'decided');
  assert.equal(st.copyReply(o, SALES).ok, true);
  st.saveActual(o, SALES, { shipDate: o.reply.dueDate, changeovers: 10, hours: 13.5 }); // 每次 1.35 h，估計 0.90 h，誤差 50%
  assert.equal(o.actual.estFlag, true);
  assert.equal(st.metrics().estFlags, 1);

  const st2 = mk();
  const p = await flowTo(st2, 'full', 'decided');
  assert.equal(st2.copyReply(p, SALES).ok, true);
  st2.saveActual(p, SALES, { shipDate: p.reply.dueDate, changeovers: 10, hours: 9 }); // 每次 0.90 h，誤差 0
  assert.equal(p.actual.estFlag, false);
  assert.equal(st2.estimateChangeover().hours, 0.9);
});
