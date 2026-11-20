import { randomInt } from 'node:crypto';
import type { Deps } from '../deps.ts';
import type { Queryable } from '../db/index.ts';
import { audit, type Actor } from './audit.ts';

export type Role = 'boss' | 'sales' | 'planner' | 'lead' | 'admin';
export type Person = { id: string; name: string; role: Role; line_user_id: string | null; active: boolean };
export const ROLE_LABEL: Record<Role, string> = { boss: '老闆', sales: '業務', planner: '生管', lead: '生管主管', admin: '管理者' };

export const asActor = (p: Person): Actor => ({ id: p.id, name: p.name, role: p.role });

export async function findByLine(q: Queryable, lineUserId: string | undefined | null): Promise<Person | null> {
  if (!lineUserId) return null;
  const { rows } = await q.query<Person>('SELECT * FROM people WHERE line_user_id = $1 AND active', [lineUserId]);
  return rows[0] || null;
}

export async function getPerson(q: Queryable, id: string): Promise<Person | null> {
  const { rows } = await q.query<Person>('SELECT * FROM people WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function addPerson(d: Deps, p: { id: string; name: string; role: Role }, by: Actor) {
  await d.db.tx(async q => {
    await q.query('INSERT INTO people(id, name, role) VALUES ($1,$2,$3)', [p.id, p.name, p.role]);
    await audit(q, by, '新增人員', p.id, `${p.name}（${ROLE_LABEL[p.role]}）`);
  });
}

/* 一次性綁定碼：去掉 0/O/1/I 等易混字，格式 XXXX-XX */
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const genCode = () => Array.from({ length: 6 }, () => ALPHA[randomInt(ALPHA.length)]).join('').replace(/^(.{4})/, '$1-');

export async function issueBindCode(d: Deps, personId: string, by: Actor): Promise<{ code: string; expiresAt: Date }> {
  const expiresAt = new Date(d.now().getTime() + d.cfg.bindCodeHours * 3600_000);
  const code = genCode();
  await d.db.tx(async q => {
    // 舊的未使用碼立即失效
    await q.query('UPDATE bind_codes SET expires_at = $2 WHERE person_id = $1 AND used_at IS NULL AND expires_at > $2', [personId, d.now()]);
    await q.query('INSERT INTO bind_codes(code, person_id, expires_at, created_by) VALUES ($1,$2,$3,$4)', [code, personId, expiresAt, by.name]);
    await audit(q, by, '產生綁定碼', personId, `有效 ${d.cfg.bindCodeHours} 小時（碼不寫進稽核）`);
  });
  return { code, expiresAt };
}

export type BindResult = { ok: true; person: Person } | { ok: false; msg: string };

export async function bindByCode(d: Deps, lineUserId: string, rawCode: string): Promise<BindResult> {
  const code = String(rawCode || '').trim().toUpperCase().replace(/\s/g, '');
  const now = d.now();
  return d.db.tx(async q => {
    const { rows: [c] } = await q.query('SELECT * FROM bind_codes WHERE code = $1 FOR UPDATE', [code]);
    if (!c || c.used_at || new Date(c.expires_at) <= now) {
      await audit(q, { id: 'unknown', name: '未綁定使用者', role: 'unknown' }, '綁定失敗', '', '綁定碼無效、已用過或過期');
      return { ok: false, msg: '綁定碼無效、已用過或已過期，請向管理者重新索取。' } as BindResult;
    }
    const taken = await findByLine(q, lineUserId);
    if (taken) return { ok: false, msg: `這個 LINE 帳號已綁定「${taken.name}」，如要更換請找管理者先解除。` } as BindResult;
    const p = await getPerson(q, c.person_id);
    if (!p || !p.active) return { ok: false, msg: '這個綁定碼對應的人員已停用。' } as BindResult;
    if (p.line_user_id) return { ok: false, msg: `「${p.name}」已綁定其他 LINE 帳號，請找管理者先解除。` } as BindResult;
    await q.query('UPDATE bind_codes SET used_at = $2, used_by = $3 WHERE code = $1', [code, now, lineUserId]);
    await q.query('UPDATE people SET line_user_id = $2, bound_at = $3 WHERE id = $1', [p.id, lineUserId, now]);
    await audit(q, asActor(p), '綁定 LINE', p.id, `${p.name}（${ROLE_LABEL[p.role]}）以一次性碼綁定`);
    return { ok: true, person: { ...p, line_user_id: lineUserId } } as BindResult;
  });
}

export async function unbind(d: Deps, personId: string, by: Actor) {
  await d.db.tx(async q => {
    await q.query('UPDATE people SET line_user_id = NULL, bound_at = NULL WHERE id = $1', [personId]);
    await audit(q, by, '解除綁定', personId, '');
  });
}
