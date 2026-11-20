/* HTTP 路由。老闆沒有任何 API（只在 LINE 收「已收單」與可交日卡片）。 */
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Deps } from './deps.ts';
import { verifySignature } from './line/signature.ts';
import { handleWebhook } from './services/intake.ts';
import { bindByCode, ROLE_LABEL, findByLine, getPerson } from './services/people.ts';
import { audit, SYSTEM } from './services/audit.ts';
import { confirmOrder, returnOrder, decide, copyReply, saveActual, webIntake } from './services/flow.ts';
import { orderView, orderList } from './services/view.ts';
import { importQueue } from './services/queue.ts';
import { currentParams, currentQueue } from './services/params.ts';
import { requireRole, whoIs, startSession, endSession, signValue, readValue, safeNext, randomToken, type Env } from './auth.ts';

const ENGINE_JS = readFileSync(fileURLToPath(new URL('./engine/engine.cjs', import.meta.url)), 'utf8');
const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));

export function createApp(d: Deps) {
  const app = new Hono<Env>();
  const out = (c: any, r: { ok: boolean; code?: string }) => c.json(r, r.ok ? 200 : r.code === 'stale' || r.code === 'state' ? 409 : 400);

  app.get('/healthz', c => c.json({ ok: true, line: d.line.simulated ? '模擬（未設定 access token）' : '已設定', ai: d.llm ? '已設定' : '只用規則' }));

  /* ---------- LINE webhook：先用原始 body 驗簽章 ---------- */
  app.post('/line/webhook', async c => {
    const raw = await c.req.text();
    if (!verifySignature(d.cfg.lineChannelSecret, raw, c.req.header('x-line-signature'))) {
      await audit(d.db, SYSTEM, 'webhook 拒絕', '', '簽章不符或缺少簽章（HTTP 401）');
      return c.json({ ok: false }, 401);
    }
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return c.json({ ok: false }, 400); }
    const results = await handleWebhook(d, body);
    return c.json({ ok: true, n: results.length });
  });

  /* ---------- 綁定（LIFF） ---------- */
  app.post('/api/liff/bind', async c => {
    const b = await c.req.json().catch(() => ({} as any));
    let sub: string;
    try { sub = (await d.verifyId(String(b.idToken || ''))).sub; } catch { return c.json({ ok: false, msg: '無法確認 LINE 身分，請從 LINE 裡重新開啟此頁。' }, 401); }
    const r = await bindByCode(d, sub, String(b.code || ''));
    if (!r.ok) return c.json(r, 400);
    return c.json({ ok: true, name: r.person.name, role: ROLE_LABEL[r.person.role] });
  });

  /* ---------- 登入 ---------- */
  app.get('/api/config', c => c.json({ liffId: d.cfg.liffId, devLogin: d.cfg.devLogin, lineLogin: !!d.loginExchange }));
  app.get('/api/me', async c => {
    const p = await whoIs(c, d);
    if (!p) {
      // LIFF 已登入 LINE 但沒綁定：回 bound:false 讓前端導到綁定頁
      return c.json({ ok: false, msg: '未登入或未綁定' }, 401);
    }
    return c.json({ ok: true, id: p.id, name: p.name, role: p.role, roleLabel: ROLE_LABEL[p.role] });
  });

  app.get('/auth/login', c => {
    if (!d.loginExchange || !d.cfg.loginChannelId || !d.cfg.publicUrl) return c.text('尚未設定 LINE Login（LINE_LOGIN_CHANNEL_ID、LINE_LOGIN_CHANNEL_SECRET、PUBLIC_URL）', 503);
    const state = randomToken(), nonce = randomToken();
    setCookie(c, 'oauth', signValue(d.cfg.sessionSecret, JSON.stringify({ state, nonce, next: safeNext(c.req.query('next')) }), 600, d.now()),
      { httpOnly: true, sameSite: 'Lax', secure: d.cfg.publicUrl.startsWith('https://'), path: '/auth', maxAge: 600 });
    const u = new URL('https://access.line.me/oauth2/v2.1/authorize');
    u.search = new URLSearchParams({ response_type: 'code', client_id: d.cfg.loginChannelId, redirect_uri: d.cfg.publicUrl + '/auth/callback', state, scope: 'openid profile', nonce }).toString();
    return c.redirect(u.toString());
  });

  app.get('/auth/callback', async c => {
    const saved = readValue(d.cfg.sessionSecret, getCookie(c, 'oauth'), d.now());
    deleteCookie(c, 'oauth', { path: '/auth' });
    const s = saved ? JSON.parse(saved) : null;
    if (!s || c.req.query('state') !== s.state || !c.req.query('code') || !d.loginExchange) return c.text('登入逾時或來源不符，請重新登入。', 400);
    let sub: string;
    try { sub = (await d.loginExchange(c.req.query('code')!, d.cfg.publicUrl + '/auth/callback', s.nonce)).sub; } catch { return c.text('LINE 登入失敗，請重試。', 400); }
    const p = await findByLine(d.db, sub);
    if (!p) return c.text('這個 LINE 帳號還沒綁定人員。請先向管理者索取綁定碼，在 LINE 裡完成綁定。', 403);
    if (!['planner', 'lead', 'admin'].includes(p.role)) return c.text(`${ROLE_LABEL[p.role]}請在 LINE 裡操作，不用登入電腦網頁。`, 403);
    startSession(c, d, p.id);
    await audit(d.db, { id: p.id, name: p.name, role: p.role }, '網頁登入', '', 'LINE Login');
    return c.redirect(s.next);
  });

  app.get('/auth/dev', async c => {
    if (!d.cfg.devLogin) return c.text('Not found', 404);
    const pid = c.req.query('person');
    if (pid) {
      const p = await getPerson(d.db, pid);
      if (!p) return c.text('沒有這個人', 404);
      startSession(c, d, p.id);
      await audit(d.db, { id: p.id, name: p.name, role: p.role }, '網頁登入', '', '本機開發登入（不經 LINE）');
      return c.redirect(safeNext(c.req.query('next')));
    }
    const { rows } = await d.db.query('SELECT id, name, role FROM people WHERE active ORDER BY id');
    const next = encodeURIComponent(safeNext(c.req.query('next')));
    return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>本機登入</title>
      <body style="font:16px system-ui;padding:24px;max-width:480px;margin:auto"><h1>本機開發登入</h1><p>不經 LINE，只在本機開發可用。</p><ul>` +
      rows.map(r => `<li><a href="/auth/dev?person=${encodeURIComponent(r.id)}&next=${next}">${r.id} ${r.name}（${ROLE_LABEL[r.role as keyof typeof ROLE_LABEL]}）</a></li>`).join('') + '</ul></body>');
  });

  app.post('/auth/logout', c => { endSession(c); return c.json({ ok: true }); });

  /* ---------- 訂單 ---------- */
  const viewers = requireRole(d, 'sales', 'planner', 'lead', 'admin');
  const sales = requireRole(d, 'sales');
  const planners = requireRole(d, 'planner', 'lead');

  app.get('/api/orders', viewers, async c => c.json({ ok: true, orders: await orderList(d.db, c.var.person.role === 'sales' ? 'sales' : 'planner') }));
  app.get('/api/orders/:id', viewers, async c => {
    const v = await orderView(d.db, c.req.param('id'));
    return v ? c.json({ ok: true, order: v }) : c.json({ ok: false, msg: '找不到這張單' }, 404);
  });
  const body = async (c: any) => c.req.json().catch(() => ({}));
  app.post('/api/orders/:id/confirm', sales, async c => out(c, await confirmOrder(d, c.var.person, c.req.param('id'), await body(c))));
  app.post('/api/orders/:id/return', sales, async c => out(c, await returnOrder(d, c.var.person, c.req.param('id'))));
  app.post('/api/orders/:id/reply', sales, async c => out(c, await copyReply(d, c.var.person, c.req.param('id'))));
  app.post('/api/orders/:id/actual', sales, async c => out(c, await saveActual(d, c.var.person, c.req.param('id'), await body(c))));
  app.post('/api/orders/:id/decide', planners, async c => out(c, await decide(d, c.var.person, c.req.param('id'), await body(c))));
  app.post('/api/intake', sales, async c => out(c, await webIntake(d, c.var.person, await body(c))));

  /* ---------- 佇列與參數 ---------- */
  app.get('/api/queue', viewers, async c => c.json({ ok: true, queue: await currentQueue(d.db) }));
  app.post('/api/queue/import', planners, async c => {
    const ct = c.req.header('content-type') || '';
    const csv = ct.includes('json') ? String((await body(c)).csv || '') : await c.req.text();
    const r = await importQueue(d, c.var.person, csv);
    return c.json(r, r.ok ? 200 : 400);
  });
  app.get('/api/params', viewers, async c => c.json({ ok: true, params: await currentParams(d.db) }));

  /* ---------- 前端靜態檔 ---------- */
  app.get('/assets/engine.js', c => c.body(ENGINE_JS, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }));
  app.get('/', c => c.redirect('/planner/'));
  app.use('/*', serveStatic({ root: PUBLIC.replace(/\\/g, '/'), rewriteRequestPath: p => p }));

  return app;
}
