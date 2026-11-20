/* 身分：
   - LIFF（業務在 LINE 裡開的小頁）：每次請求帶 LIFF ID token（Authorization: Bearer），由 LINE 驗證。
   - 電腦網頁（生管、後台）：LINE Login 登入後發簽章 cookie（HttpOnly、SameSite=Lax）。
   - 本機開發：DEV_LOGIN=1 時可直接選人登入；Cloud Run 上一律關閉。 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Deps } from './deps.ts';
import { findByLine, getPerson, type Person, type Role } from './services/people.ts';

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const mac = (secret: string, s: string) => createHmac('sha256', secret).update(s).digest('base64url');

export function signValue(secret: string, value: string, ttlSec: number, now: Date): string {
  const body = b64(JSON.stringify({ v: value, exp: Math.floor(now.getTime() / 1000) + ttlSec }));
  return body + '.' + mac(secret, body);
}
export function readValue(secret: string, token: string | undefined, now: Date): string | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(mac(secret, body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const j = JSON.parse(Buffer.from(body, 'base64url').toString());
    return j.exp > now.getTime() / 1000 ? String(j.v) : null;
  } catch { return null; }
}

export const SESSION_COOKIE = 'sid';
const SESSION_TTL = 12 * 3600; // 【我猜的】網頁登入 12 小時有效

export function startSession(c: Context, d: Deps, personId: string) {
  setCookie(c, SESSION_COOKIE, signValue(d.cfg.sessionSecret, personId, SESSION_TTL, d.now()), {
    httpOnly: true, sameSite: 'Lax', secure: d.cfg.publicUrl.startsWith('https://'), path: '/', maxAge: SESSION_TTL,
  });
}
export const endSession = (c: Context) => deleteCookie(c, SESSION_COOKIE, { path: '/' });

/* LIFF ID token 驗證結果暫存 5 分鐘，避免每個請求都打 LINE */
const tokenCache = new Map<string, { sub: string; until: number }>();

export async function whoIs(c: Context, d: Deps): Promise<Person | null> {
  const h = c.req.header('authorization') || '';
  if (h.startsWith('Bearer ')) {
    const tok = h.slice(7).trim();
    const now = d.now().getTime();
    let hit = tokenCache.get(tok);
    if (!hit || hit.until < now) {
      try { hit = { sub: (await d.verifyId(tok)).sub, until: now + 5 * 60_000 }; } catch { return null; }
      if (tokenCache.size > 500) tokenCache.clear();
      tokenCache.set(tok, hit);
    }
    return findByLine(d.db, hit.sub);
  }
  const pid = readValue(d.cfg.sessionSecret, getCookie(c, SESSION_COOKIE), d.now());
  if (!pid) return null;
  const p = await getPerson(d.db, pid);
  return p && p.active ? p : null;
}

export type Env = { Variables: { person: Person } };

export function requireRole(d: Deps, ...roles: Role[]): MiddlewareHandler<Env> {
  return async (c, next) => {
    const p = await whoIs(c, d);
    if (!p) return c.json({ ok: false, msg: '請先登入（或從 LINE 重新開啟）', code: 'auth' }, 401);
    if (roles.length && !roles.includes(p.role)) return c.json({ ok: false, msg: '這個角色不能做這件事', code: 'role' }, 403);
    c.set('person', p);
    await next();
  };
}

/* ===== LINE Login（網頁） ===== */
export type LoginExchange = (code: string, redirectUri: string, nonce: string) => Promise<{ sub: string }>;

export function lineLoginExchange(channelId: string, channelSecret: string, fetchFn: typeof fetch = fetch): LoginExchange {
  return async (code, redirectUri, nonce) => {
    const tok = await fetchFn('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: channelId, client_secret: channelSecret }),
    });
    if (!tok.ok) throw new Error('LINE Login 換 token 失敗');
    const { id_token } = await tok.json() as any;
    const v = await fetchFn('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ id_token, client_id: channelId, nonce }),
    });
    if (!v.ok) throw new Error('LINE Login ID token 驗證失敗');
    const j: any = await v.json();
    return { sub: j.sub };
  };
}

export const safeNext = (n: string | undefined) => n && /^\/[^/\\]/.test(n) ? n : '/planner/';
export const randomToken = () => randomBytes(16).toString('base64url');
