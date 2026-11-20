import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.ts';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { SimLine } from '../src/line/client.ts';
import { sign, verifySignature } from '../src/line/signature.ts';
import { makeJobs } from '../src/jobs.ts';
import { ensureSeed } from '../src/services/params.ts';
import { addPerson, issueBindCode, bindByCode } from '../src/services/people.ts';
import type { Deps } from '../src/deps.ts';

const SECRET = 'test-secret';
const NOW = new Date('2026-11-17T02:30:00Z'); // 台北 11/17 10:30
const ADMIN = { id: 'P-06', name: '管理者', role: 'admin' };

async function setup() {
  const db = await freshDb();
  await ensureSeed(db);
  const line = new SimLine();
  const d: Deps = {
    db, line, jobs: makeJobs(e => { throw e; }), llm: null, now: () => NOW,
    cfg: { ...loadConfig({}), lineChannelSecret: SECRET, liffId: 'LIFF-TEST' },
    verifyId: async t => { if (!t.startsWith('ok:')) throw new Error('bad'); return { sub: t.slice(3) }; },
  };
  for (const p of [['P-01', '老闆', 'boss'], ['P-02', '業務 A', 'sales'], ['P-04', '生管 A', 'planner']] as const)
    await addPerson(d, { id: p[0], name: p[1], role: p[2] }, ADMIN);
  for (const [pid, uid] of [['P-01', 'U-boss'], ['P-02', 'U-sales'], ['P-04', 'U-plan']]) {
    const { code } = await issueBindCode(d, pid, ADMIN);
    assert.equal((await bindByCode(d, uid, code)).ok, true);
  }
  line.sent = [];
  return { d, db, line, app: createApp(d) };
}

let seq = 0;
const msg = (userId: string, text: string, id = 'EV' + (++seq)) =>
  ({ type: 'message', webhookEventId: id, replyToken: 'RT-' + id, source: { type: 'user', userId }, message: { type: 'text', id: 'm' + id, text } });

async function post(app: any, events: unknown[], sig?: string) {
  const body = JSON.stringify({ destination: 'Uxxx', events });
  return app.request('/line/webhook', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-line-signature': sig ?? sign(SECRET, body) } });
}

test('簽章：正確才通過；錯的、缺的、長度不同都拒絕', () => {
  const body = '{"events":[]}';
  assert.equal(verifySignature(SECRET, body, sign(SECRET, body)), true);
  assert.equal(verifySignature(SECRET, body, sign('other', body)), false);
  assert.equal(verifySignature(SECRET, body, undefined), false);
  assert.equal(verifySignature(SECRET, body, 'abc'), false);
  assert.equal(verifySignature('', body, sign('', body)), false);
});

test('簽章不符 → 401，不建單、有稽核', async () => {
  const { app, db } = await setup();
  const r = await post(app, [msg('U-boss', '甲客戶追加 A1 800片')], 'AAAA');
  assert.equal(r.status, 401);
  assert.equal((await db.query('SELECT count(*)::int n FROM orders')).rows[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int n FROM audit WHERE action='webhook 拒絕'")).rows[0].n, 1);
});

test('LINE 設定 webhook 時的驗證請求（空事件）回 200', async () => {
  const { app } = await setup();
  assert.equal((await post(app, [])).status, 200);
});

test('老闆轉傳 → 建單、原文照存、reply 已收單、背景解析後 push 給業務', async () => {
  const { app, d, db, line } = await setup();
  const text = '甲客戶追加 A1 800片，11/20 要出貨，零件有換。';
  assert.equal((await post(app, [msg('U-boss', text)])).status, 200);
  await d.jobs.idle();
  const { rows: [o] } = await db.query('SELECT o.id, o.status, m.text, m.source, m.sender_id FROM orders o JOIN raw_messages m ON m.id=o.raw_message_id');
  assert.deepEqual(o, { id: 'A-0001', status: 'received', text, source: 'LINE', sender_id: 'P-01' });
  assert.deepEqual(line.sent.map(s => [s.mode, s.to]), [['reply', 'RT-EV' + seq], ['push', 'U-sales']]);
  assert.match(line.texts()[0], /已收單 A-0001/);
  assert.match(line.texts()[1], /新單 A-0001 待確認/);
  const { rows: [p] } = await db.query('SELECT engine, fallback, fields FROM parses');
  assert.equal(p.engine, 'rule');
  assert.equal(p.fields.qty.value, 800);
  const n = (await db.query('SELECT mode, count(*)::int n FROM notifications GROUP BY mode ORDER BY mode')).rows;
  assert.deepEqual(n, [{ mode: 'push', n: 1 }, { mode: 'reply', n: 1 }]);
});

test('同一事件 ID 重送只建一張單', async () => {
  const { app, d, db } = await setup();
  const ev = msg('U-sales', '乙那邊要插一張 B2，11/20 要，零件不變', 'DUP-1');
  await post(app, [ev]);
  await post(app, [{ ...ev, deliveryContext: { isRedelivery: true } }]);
  await d.jobs.idle();
  assert.equal((await db.query('SELECT count(*)::int n FROM orders')).rows[0].n, 1);
  assert.equal((await db.query("SELECT count(*)::int n FROM audit WHERE action='webhook 重送'")).rows[0].n, 1);
});

test('未綁定 → 不建單、回綁定引導；生管傳訊息 → 不建單；群組 → 不處理', async () => {
  const { app, d, db, line } = await setup();
  await post(app, [msg('U-stranger', '丙的 C3 加 600片')]);
  await post(app, [msg('U-plan', '丙的 C3 加 600片')]);
  await post(app, [{ ...msg('U-boss', 'x'), source: { type: 'group', groupId: 'G1', userId: 'U-boss' } }]);
  await d.jobs.idle();
  assert.equal((await db.query('SELECT count(*)::int n FROM orders')).rows[0].n, 0);
  const t = line.texts();
  assert.match(t[0], /還沒綁定.*\n.*liff\.line\.me\/LIFF-TEST\?page=bind/);
  assert.match(t[1], /生管.*不收單/);
  assert.equal(t.length, 2);
});

test('LINE 掛掉：建單照做，通知記為失敗', async () => {
  const { app, d, db, line } = await setup();
  line.down = true;
  await post(app, [msg('U-boss', '甲客戶追加 A1 800片')]);
  await d.jobs.idle();
  assert.equal((await db.query('SELECT count(*)::int n FROM orders')).rows[0].n, 1);
  const st = (await db.query('SELECT status, count(*)::int n FROM notifications GROUP BY status')).rows;
  assert.deepEqual(st, [{ status: 'failed', n: 2 }]);
});

test('綁定：碼只能用一次、過期無效、一個 LINE 只綁一人；LIFF 綁定要驗身分', async () => {
  const { app, d, db } = await setup();
  await addPerson(d, { id: 'P-03', name: '業務 B', role: 'sales' }, ADMIN);
  const { code } = await issueBindCode(d, 'P-03', ADMIN);
  const call = (idToken: string, c: string) => app.request('/api/liff/bind', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken, code: c }) });
  assert.equal((await call('bad', code)).status, 401);
  assert.equal((await call('ok:U-sales', code)).status, 400);           // 這個 LINE 已綁業務 A
  const ok = await call('ok:U-b', code.toLowerCase());
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, name: '業務 B', role: '業務' });
  assert.equal((await call('ok:U-c', code)).status, 400);               // 用過了
  const { code: c2 } = await issueBindCode(d, 'P-04', ADMIN);
  const later = { ...d, now: () => new Date(NOW.getTime() + 25 * 3600_000) };
  assert.equal((await bindByCode(later, 'U-x', c2)).ok, false);         // 過期
  assert.equal((await db.query("SELECT line_user_id FROM people WHERE id='P-03'")).rows[0].line_user_id, 'U-b');
  const codeInAudit = (await db.query('SELECT count(*)::int n FROM audit WHERE detail LIKE $1', ['%' + code + '%'])).rows[0].n;
  assert.equal(codeInAudit, 0);
});
