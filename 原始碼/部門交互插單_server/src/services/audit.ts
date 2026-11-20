import type { Queryable } from '../db/index.ts';

export type Actor = { id: string; name: string; role: string };
export const SYSTEM: Actor = { id: 'system', name: '系統', role: 'system' };
export const AI: Actor = { id: 'ai', name: 'AI', role: 'ai' };

/* 稽核只能新增；資料庫觸發器會擋下任何修改或刪除 */
export async function audit(q: Queryable, who: Actor, action: string, target = '', detail = '', data?: unknown) {
  await q.query(
    'INSERT INTO audit(actor, actor_role, action, target, detail, data) VALUES ($1,$2,$3,$4,$5,$6)',
    [who.name, who.role, action, target, detail, data === undefined ? null : JSON.stringify(data)],
  );
}
