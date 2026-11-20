/* 資料層規則：原文不改、稽核只能追加、沒試算不能回覆、調整要原因、改參數會重新試算並留紀錄、
   webhook 去重與未綁定不處理、老闆只收兩種訊息。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Store = require('../src/store.js');

const BOSS = 'P-01', SALES = 'P-02', SALES_B = 'P-03', PLANNER = 'P-04';
const mk = () => Store.create({ fast: true });

async function flowTo(st, key, upto) {
  const s = Store.SAMPLES.find(x => x.key === key);
  const r = await st.forward(BOSS, s.text, key);
  const o = r.order;
  if (upto === 'received') return o;
  st.followups(o).forEach(q => {
    if (q.k === 'qty') st.setField(o, 'qty', 2400);
    else if (q.chips.length) st.setField(o, q.k, q.chips[0].v);
  });
  assert.equal(st.submit(o, SALES).ok, true);
  if (upto === 'queued') return o;
  assert.equal(st.decide(o, 'adopt', PLANNER).ok, true);
  return o;
}

test('三筆示意原文都能從老闆轉傳走到業務回覆與回填', async () => {
  const st = mk();
  for (const k of ['full', 'noqty', 'vague']) {
    const o = await flowTo(st, k, 'decided');
    assert.equal(st.copyReply(o, SALES).ok, true);
    assert.equal(o.status, 'replied');
    assert.equal(st.saveActual(o, SALES, st.sampleActual(o)).ok, true);
    assert.equal(o.status, 'done');
  }
  assert.equal(st.S.orders.length, 3);
});

test('原文凍結，任何一端都改不動', async () => {
  const st = mk();
  const o = await flowTo(st, 'full', 'decided');
  const before = o.raw.text;
  assert.throws(() => { o.raw.text = '改掉'; }, TypeError);
  assert.equal(o.raw.text, before);
  assert.ok(Object.isFrozen(o.raw));
});

test('沒有試算不能複製回覆；生管沒決定也不能', async () => {
  const st = mk();
  const o = await flowTo(st, 'full', 'received');
  const r1 = st.copyReply(o, SALES);
  assert.equal(r1.ok, false);
  assert.match(r1.msg, /試算/);
  assert.equal(st.replyInfo(o).calc, null);
  st.submit(o, SALES);
  const r2 = st.copyReply(o, SALES);
  assert.equal(r2.ok, false);
  assert.match(r2.msg, /生管/);
});

test('調整沒填原因不能儲存；填了會寫進稽核', async () => {
  const st = mk();
  const o = await flowTo(st, 'noqty', 'queued');
  assert.equal(st.decide(o, 'adjust', PLANNER, { k: 1, reason: '' }).ok, false);
  assert.equal(st.decide(o, 'adjust', PLANNER, { k: 1, reason: '短' }).ok, false);
  assert.equal(o.status, 'queued');
  const ok = st.decide(o, 'adjust', PLANNER, { k: 1, reason: '該線明天治具檢修' });
  assert.equal(ok.ok, true);
  const a = st.auditList().find(x => x.action === '調整' && x.order === o.id);
  assert.ok(a);
  assert.match(a.detail, /治具檢修/);
  assert.equal(a.who, '生管 A');
});

test('客戶期限：預填試算完成日；不能更早；改晚要寫原因；回覆用生管訂的期限', async () => {
  const st = mk();
  const o = await flowTo(st, 'full', 'queued');
  const r = st.latestCalc(o).result;
  const end = r.cands[r.best].endAt.date;
  const earlier = '2026-11-17';
  assert.ok(earlier < end);
  assert.match(st.decide(o, 'adopt', PLANNER, { promise: earlier }).msg, /不能早於/);
  assert.match(st.decide(o, 'adopt', PLANNER, { promise: '2026-11-23' }).msg, /原因/);
  assert.equal(o.status, 'queued');
  assert.equal(st.decide(o, 'adopt', PLANNER, { promise: '2026-11-23', reason: '出貨前要多一天檢驗' }).ok, true);
  assert.equal(o.decision.promise, '2026-11-23');
  assert.equal(o.decision.est.endDate, end);
  assert.equal(st.replyInfo(o).dueDate, '2026-11-23');
  st.copyReply(o, SALES);
  assert.equal(o.reply.dueDate, '2026-11-23');
  assert.ok(st.auditList().some(a => a.order === o.id && /回給客戶期限 11\/23/.test(a.detail) && /多一天檢驗/.test(a.detail)));
});

test('客戶期限不改時，採用不需要原因', async () => {
  const st = mk();
  const o = await flowTo(st, 'full', 'queued');
  assert.equal(st.decide(o, 'adopt', PLANNER).ok, true);
  assert.equal(o.decision.promise, o.decision.est.endDate);
  assert.equal(o.decision.promiseChanged, false);
});

test('稽核只能追加，每筆凍結', async () => {
  const st = mk();
  await flowTo(st, 'full', 'decided');
  const list = st.auditList();
  assert.ok(list.length > 3);
  assert.ok(list.every(Object.isFrozen));
  assert.throws(() => { list[0].detail = 'x'; }, TypeError);
  list.length = 0;
  assert.ok(st.auditList().length > 3, '拿到的是副本，清空副本不影響紀錄');
  assert.equal(typeof st.deleteAudit, 'undefined');
});

test('後台改【我猜的】參數 → 待決定的單重新試算並留紀錄', async () => {
  const st = mk();
  const o = await flowTo(st, 'noqty', 'queued');
  const fp1 = st.latestCalc(o).result.fingerprint;
  const g = Object.assign({}, st.S.P.guess, { wA: 1.5 });
  const r = st.applyParams({ guess: g }, '管理者');
  assert.equal(r.ok, true);
  assert.equal(r.recalc, 1);
  const c = st.latestCalc(o);
  assert.equal(c.rev, 2);
  assert.equal(c.pv, 2);
  assert.notEqual(c.result.fingerprint, fp1);
  const au = st.auditList();
  assert.ok(au.some(x => x.action === '參數變更 p2' && /甲虛擬權重 1.25 → 1.5/.test(x.detail)));
  assert.ok(au.some(x => x.action === '重新試算' && x.order === o.id));
  assert.equal(st.S.pver.length, 2);
});

test('只改逾時時長不會重新試算', async () => {
  const st = mk();
  const o = await flowTo(st, 'noqty', 'queued');
  const r = st.applyParams({ ops: { salesRemindMin: 20, plannerRemindMin: 120, plannerEscalateMin: 240 } }, '管理者');
  assert.equal(r.ok, true);
  assert.equal(r.recalc, 0);
  assert.equal(st.latestCalc(o).rev, 1);
});

test('webhook：同一事件 ID 重送只處理一次', async () => {
  const st = mk();
  const r = await st.forward(BOSS, Store.SAMPLES[0].text, 'full');
  const ev = st.S.events[0].eventId;
  const again = await st.redeliver(ev);
  assert.equal(again.dup, true);
  assert.equal(st.S.orders.length, 1);
  assert.equal(r.order.id, 'A-0001');
});

test('未綁定者傳來的訊息不處理，回覆引導；綁定後可用', async () => {
  const st = mk();
  const r = await st.forward(SALES_B, '乙要追加 B2 300片 11/21', null);
  assert.equal(r.unbound, true);
  assert.equal(st.S.orders.length, 0);
  assert.equal(st.S.chats[SALES_B].slice(-1)[0].kind, 'unbound');
  assert.equal(st.bind(SALES_B, 'XXXX').ok, false);
  assert.equal(st.bind(SALES_B, 'k7q2-9f').ok, true);
  assert.equal(st.person(SALES_B).status, 'bound');
  st.unbind(SALES_B, '管理者');
  assert.equal(st.person(SALES_B).status, 'unbound');
  assert.ok(st.person(SALES_B).code);
});

test('老闆只收兩種訊息：已收單、可交日卡片', async () => {
  const st = mk();
  const o = await flowTo(st, 'full', 'decided');
  st.copyReply(o, SALES);
  const kinds = new Set(st.S.chats[BOSS].filter(m => m.from === 'oa').map(m => m.kind));
  assert.deepEqual([...kinds].sort(), ['ack', 'bossdue']);
});

test('回覆不計則數、推播計則數', async () => {
  const st = mk();
  await flowTo(st, 'full', 'received');
  assert.equal(st.replyCount(), 1);   // 已收單（回覆）
  assert.equal(st.pushCount(), 1);    // 新單待確認推給業務 A（推播）
});

test('LINE 斷線：轉傳失敗不建單；推播失敗，恢復後補送', async () => {
  const st = mk();
  st.setLineDown(true);
  const r = await st.forward(BOSS, Store.SAMPLES[0].text, 'full');
  assert.equal(r.down, true);
  assert.equal(st.S.orders.length, 0);
  const o = await st.webIntake(SALES, Store.SAMPLES[0].text, 'WEB');
  assert.equal(o.raw.source, 'WEB');
  assert.equal(st.S.notes.filter(n => n.status === 'failed').length, 1);
  st.setLineDown(false);
  assert.equal(st.S.notes.filter(n => n.status === 'failed').length, 0);
  assert.ok(st.S.chats[SALES].some(m => m.kind === 'new'));
});

test('逾時：業務 30 分提醒；生管 2 小時提醒、4 小時升級給生管主管', async () => {
  const st = mk();
  const a = await flowTo(st, 'full', 'received');
  st.advance(31);
  assert.ok(a.reminded.sales);
  const b = await flowTo(st, 'noqty', 'queued');
  st.advance(121);
  assert.ok(b.reminded.planner);
  assert.ok(!b.reminded.lead);
  st.advance(120);
  assert.ok(b.reminded.lead);
  assert.ok(st.S.chats['P-05'].some(m => m.kind === 'escalate'));
});

test('解析模式：模擬失敗會退回規則並明示', async () => {
  const st = mk();
  st.applyParams({ ai: { mode: 'sim-fail' } }, '管理者');
  const r = await st.forward(BOSS, Store.SAMPLES[0].text, 'full');
  assert.equal(r.order.parse.fallback, true);
  assert.match(r.order.parse.status, /退回規則/);
});
