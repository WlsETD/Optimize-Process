/* 一張單從頭到尾：老闆轉傳 → 業務確認 → 試算 → 生管決定（客戶期限）→ 業務複製回覆 → 回填 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.ts';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { SimLine } from '../src/line/client.ts';
import { sign } from '../src/line/signature.ts';
import { makeJobs } from '../src/jobs.ts';
import { ensureSeed } from '../src/services/params.ts';
import { addPerson, issueBindCode, bindByCode } from '../src/services/people.ts';
import { E } from '../src/engine/index.ts';
import type { Deps } from '../src/deps.ts';

const SECRET = 'test-secret';
const NOW = new Date('2026-11-17T02:30:00Z'); // 台北 11/17 10:30（與黃金測試同一時間）
const ADMIN = { id: 'P-06', name: '管理者', role: 'admin' };
const FULL = '甲客戶追加 A1 800片，11/20 要出貨，零件有換。';
const NOQTY = '乙那邊要插一張 B2，11/20 要，零件不變';

async function setup() {
  const db = await freshDb();
  await ensureSeed(db);
  const line = new SimLine();
  const d: Deps = {
    db, line, jobs: makeJobs(e => { throw e; }), llm: null, now: () => NOW,
    cfg: { ...loadConfig({}), lineChannelSecret: SECRET, liffId: 'LIFF-TEST', sessionSecret: 's'.repeat(32), devLogin: true },
    verifyId: async t => { if (!t.startsWith('ok:')) throw new Error('bad'); return { sub: t.slice(3) }; },
  };
  const people = [['P-01', '老闆', 'boss', 'U-boss'], ['P-02', '業務 A', 'sales', 'U-sales'], ['P-04', '生管 A', 'planner', 'U-plan']] as const;
  for (const [id, name, role, uid] of people) {
    await addPerson(d, { id, name, role }, ADMIN);
    const { code } = await issueBindCode(d, id, ADMIN);
    await bindByCode(d, uid, code);
  }
  const app = createApp(d);
  let n = 0;
  const forward = async (text: string, uid = 'U-boss') => {
    const id = 'EV' + (++n);
    const body = JSON.stringify({ events: [{ type: 'message', webhookEventId: id, replyToken: 'RT' + id, source: { type: 'user', userId: uid }, message: { type: 'text', text } }] });
    await app.request('/line/webhook', { method: 'POST', body, headers: { 'x-line-signature': sign(SECRET, body) } });
    await d.jobs.idle();
  };
  const as = (uid: string) => async (method: string, path: string, json?: unknown) => {
    const r = await app.request(path, { method, headers: { authorization: 'Bearer ok:' + uid, 'content-type': 'application/json' }, body: json === undefined ? undefined : JSON.stringify(json) });
    return { status: r.status, body: await r.json() as any };
  };
  line.sent = [];
  return { d, db, line, app, forward, sales: as('U-sales'), planner: as('U-plan'), boss: as('U-boss') };
}

test('完整流程：確認 → 試算 → 決定 → 回覆 → 回填；老闆只收卡片', async () => {
  const { db, line, forward, sales, planner, boss } = await setup();
  await forward(FULL);
  let v = (await sales('GET', '/api/orders/A-0001')).body.order;
  assert.equal(v.status, 'received');
  assert.deepEqual(v.parse.pending, []);
  assert.equal(v.raw.text, FULL);

  // 沒試算 → 不能回覆
  assert.equal((await sales('POST', '/api/orders/A-0001/reply')).body.code, 'nocalc');
  const c = await sales('POST', '/api/orders/A-0001/confirm', { fields: {}, confirmed: [] });
  assert.deepEqual(c.body, { ok: true, calcId: 'T-0001 r1' });
  // 沒決定 → 不能回覆
  assert.equal((await sales('POST', '/api/orders/A-0001/reply')).body.code, 'nodecision');

  // 老闆、業務都不能決定
  assert.equal((await boss('POST', '/api/orders/A-0001/decide', { type: 'adopt' })).status, 403);
  assert.equal((await sales('POST', '/api/orders/A-0001/decide', { type: 'adopt' })).status, 403);
  assert.equal((await boss('GET', '/api/orders')).status, 403);

  // 生管看板：一行結論
  const list = (await planner('GET', '/api/orders')).body.orders;
  assert.match(list[0].summary.text, /^建議排在 Q-05 後/);

  // 客戶期限早於完成日 → 擋；晚於完成日但沒原因 → 擋
  assert.match((await planner('POST', '/api/orders/A-0001/decide', { type: 'adopt', promise: '2026-11-19' })).body.msg, /不能早於試算完成日/);
  assert.match((await planner('POST', '/api/orders/A-0001/decide', { type: 'adopt', promise: '2026-11-23' })).body.msg, /一定要寫原因/);
  const dec = await planner('POST', '/api/orders/A-0001/decide', { type: 'adopt', calcId: 'T-0001 r1' });
  assert.deepEqual(dec.body, { ok: true, promise: '2026-11-20', calcId: 'T-0001 r1' });
  assert.equal((await db.query('SELECT max(ver)::int v FROM queue_versions')).rows[0].v, 2);

  v = (await sales('GET', '/api/orders/A-0001')).body.order;
  assert.equal(v.decision.promise, '2026-11-20');
  assert.equal(v.decision.afterId, 'Q-05');
  assert.equal(v.replyDraft, '您好，A1 800 片，預計 11/20（週五）可出貨，符合您要求的 11/20（週五）。如有變動我們會先通知您。');

  const rp = await sales('POST', '/api/orders/A-0001/reply');
  assert.equal(rp.body.ok, true);
  assert.match(rp.body.text, /11\/20/);
  assert.equal((await sales('POST', '/api/orders/A-0001/reply')).status, 409);

  assert.match((await sales('POST', '/api/orders/A-0001/actual', { shipDate: '2026-11-20', changeovers: -1, hours: 1 })).body.msg, /整數/);
  assert.equal((await sales('POST', '/api/orders/A-0001/actual', { shipDate: '2026-11-20', changeovers: 1, hours: 1.05 })).body.ok, true);
  assert.equal((await sales('GET', '/api/orders/A-0001')).body.order.status, 'done');

  // 通知：業務收「新單」「可交日」；老闆收「可交日卡片」兩次（決定時、回覆後），沒有任何按鈕
  const pushes = line.sent.filter(s => s.mode === 'push').map(s => s.to + ':' + (s.messages[0] as any).text.split('\n')[0]);
  assert.deepEqual(pushes, ['U-sales:新單 A-0001 待確認', 'U-sales:A-0001 可交日已定：11/20（週五）（客戶要求 11/20（週五））', 'U-boss:可交日｜A-0001', 'U-boss:可交日｜A-0001']);
  assert.ok(line.sent.every(s => s.messages.every(m => m.type === 'text')));
  const actions = (await db.query("SELECT action FROM audit WHERE target = 'A-0001' ORDER BY id")).rows.map(r => r.action);
  assert.deepEqual(actions, ['建單', '解析欄位', '確認並送出', '試算完成', '採用 AI 建議', '複製回覆', '回填實際結果']);
});

test('缺數量：沒處理不能送出；補上並確認後才試算；業務改的欄位有記錄', async () => {
  const { forward, sales, db } = await setup();
  await forward(NOQTY);
  const v = (await sales('GET', '/api/orders/A-0001')).body.order;
  assert.deepEqual(v.parse.pending, [{ k: 'qty', why: 'missing' }]);
  assert.equal((await sales('POST', '/api/orders/A-0001/confirm', { fields: {} })).body.code, 'field');
  assert.equal((await sales('POST', '/api/orders/A-0001/confirm', { fields: { qty: 2400 } })).body.code, 'pending');
  const ok = await sales('POST', '/api/orders/A-0001/confirm', { fields: { qty: '2,400' }, confirmed: ['qty'] });
  assert.equal(ok.body.ok, true);
  const { rows: [c] } = await db.query('SELECT changes FROM confirmations');
  assert.deepEqual(c.changes, [{ field: 'qty', from: null, to: 2400 }]);
});

test('調整位置要寫原因；另一張單會重算，拿舊試算來決定會被擋', async () => {
  const { forward, sales, planner } = await setup();
  await forward(FULL);
  await forward('丙的 C3 加 600片，11/24 要，零件不變');
  await sales('POST', '/api/orders/A-0001/confirm', { confirmed: [] });
  const v2 = (await sales('GET', '/api/orders/A-0002')).body.order;
  await sales('POST', '/api/orders/A-0002/confirm', { confirmed: v2.parse.pending.map((p: any) => p.k) });
  const k = (await planner('GET', '/api/orders/A-0001')).body.order.calcs[0];
  const res = E.calc(k.input.queue, k.input.X, k.input.P, k.input.asOf);
  assert.equal(res.fingerprint, k.fingerprint, '前端可由輸入重算出同一個結果');
  const other = res.cands.find((c: any) => c.k !== res.cands[res.best].k);
  assert.match((await planner('POST', '/api/orders/A-0001/decide', { type: 'adjust', k: other.k, reason: '短' })).body.msg, /調整一定要寫原因/);
  const ok = await planner('POST', '/api/orders/A-0001/decide', { type: 'adjust', k: other.k, reason: '該線明天治具檢修', promise: '2026-11-25' });
  assert.equal(ok.body.ok, true);
  const v = (await planner('GET', '/api/orders/A-0002')).body.order;
  assert.equal(v.calcs.at(-1).id, 'T-0002 r2');
  assert.equal(v.calcs.at(-1).reason, '佇列已變動：A-0001 已插入');
  const stale = await planner('POST', '/api/orders/A-0002/decide', { type: 'adopt', calcId: 'T-0002 r1' });
  assert.equal(stale.status, 409);
  assert.equal((await planner('GET', '/api/orders/A-0001')).body.order.decision.reason, '該線明天治具檢修');
});

test('佇列 CSV 匯入：錯的整批不收；對的成為新版本並重算待決定的單', async () => {
  const { forward, sales, planner, app } = await setup();
  await forward(FULL);
  await sales('POST', '/api/orders/A-0001/confirm', { confirmed: [] });
  const post = (csv: string) => app.request('/api/queue/import', { method: 'POST', body: csv, headers: { authorization: 'Bearer ok:U-plan', 'content-type': 'text/csv' } });
  const bad = await post('編號,客戶,機種,數量,交期\nQ-01,丁,A1,100,2026-11-20\nQ-02,乙,B2,-5,11/20');
  assert.equal(bad.status, 400);
  const be = (await bad.json() as any).errors;
  assert.match(be[0], /第 2 列：客戶「丁」不在客戶表/);
  assert.match(be[1], /第 3 列：數量要是正整數；交期「11\/20」看不懂/);
  const good = await post('﻿編號,客戶,機種,數量,交期,生產中\r\nQ-11,乙,B2,"3,300",2026/11/17,是\r\nQ-12,甲,A1,1200,2026-11-19,\r\n');
  assert.deepEqual(await good.json(), { ok: true, ver: 2, count: 2, recalced: 1 });
  const q = (await planner('GET', '/api/queue')).body.queue;
  assert.deepEqual(q.items[0], { id: 'Q-11', customer: '乙', model: 'B2', qty: 3300, due: '2026-11-17', running: true });
  assert.equal((await sales('POST', '/api/queue/import', {})).status, 403);
});

test('網頁備援收單、退回；本機開發登入只在 DEV_LOGIN 時可用', async () => {
  const { d, sales, app, db } = await setup();
  const r = await sales('POST', '/api/intake', { text: '丙客戶 C3 300片 11/25', source: 'PHONE' });
  assert.equal(r.body.orderId, 'A-0001');
  await d.jobs.idle();
  assert.equal((await db.query('SELECT source FROM raw_messages')).rows[0].source, 'PHONE');
  assert.equal((await sales('POST', '/api/orders/A-0001/return')).body.ok, true);
  assert.equal((await sales('POST', '/api/orders/A-0001/confirm', {})).status, 409);

  const login = await app.request('/auth/dev?person=P-04&next=/planner/');
  assert.equal(login.status, 302);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  assert.match(login.headers.get('set-cookie')!, /HttpOnly/i);
  assert.equal((await app.request('/api/me', { headers: { cookie } })).status, 200);
  assert.equal((await app.request('/api/me', { headers: { cookie: cookie.slice(0, -2) + 'xx' } })).status, 401);
  assert.equal((await app.request('/auth/dev?person=P-04&next=//evil.example')).headers.get('location'), '/planner/');
  const off = createApp({ ...d, cfg: { ...d.cfg, devLogin: false } });
  assert.equal((await off.request('/auth/dev?person=P-04')).status, 404);
  assert.equal((await app.request('/assets/engine.js')).status, 200);
});
