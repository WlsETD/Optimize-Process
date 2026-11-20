import type { Queryable } from '../db/index.ts';
import { E, type Params, type QueueItem } from '../engine/index.ts';
import { audit, SYSTEM } from './audit.ts';

/* 第一次啟動：參數 v1 = 引擎預設（個案數字＋【我猜的】），佇列 v1 = 示意佇列（生管正式匯入後就被新版本取代） */
export async function ensureSeed(q: Queryable) {
  const { rows: [p] } = await q.query('SELECT count(*)::int AS n FROM param_versions');
  if (!p.n) {
    await q.query('INSERT INTO param_versions(ver, params, note, created_by) VALUES (1,$1,$2,$3)', [JSON.stringify(E.defaults()), '引擎預設（個案數字＋【我猜的】）', '系統']);
    await audit(q, SYSTEM, '參數初始化', 'p1', '引擎預設');
  }
  const { rows: [qv] } = await q.query('SELECT count(*)::int AS n FROM queue_versions');
  if (!qv.n) {
    await q.query('INSERT INTO queue_versions(ver, items, source, created_by) VALUES (1,$1,$2,$3)', [JSON.stringify(E.seedQueue()), '示意佇列（待生管匯入）', '系統']);
    await audit(q, SYSTEM, '佇列初始化', 'q1', '示意佇列，待生管匯入正式資料');
  }
}

export async function currentParams(q: Queryable): Promise<{ ver: number; P: Params }> {
  const { rows: [r] } = await q.query('SELECT ver, params FROM param_versions ORDER BY ver DESC LIMIT 1');
  return { ver: r.ver, P: r.params };
}

export async function currentQueue(q: Queryable): Promise<{ ver: number; items: QueueItem[] }> {
  const { rows: [r] } = await q.query('SELECT ver, items FROM queue_versions ORDER BY ver DESC LIMIT 1');
  return { ver: r.ver, items: r.items };
}
