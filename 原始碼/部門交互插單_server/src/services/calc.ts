/* 試算：固定程式。輸入（佇列、單、參數、時間）整份存檔；讀出時重算一次並比對指紋，保證可重現。 */
import type { Queryable } from '../db/index.ts';
import type { Deps } from '../deps.ts';
import { E, type CalcInput, type Params, type QueueItem, type AsOf } from '../engine/index.ts';
import { taipei } from '../time.ts';
import { audit, SYSTEM } from './audit.ts';
import { currentParams, currentQueue } from './params.ts';

export type CalcRow = { id: string; order_id: string; rev: number; param_ver: number; queue_ver: number; fingerprint: string; reason: string;
  input: { queue: QueueItem[]; X: CalcInput; P: Params; asOf: AsOf }; created_at: Date };

export const calcRef = (orderId: string, rev: number) => orderId.replace(/^A-/, 'T-') + ' r' + rev;

/* 全系統排程只有一份：建單確認、決定、匯入佇列都要排隊進行 */
export const lockSchedule = (q: Queryable) => q.query('SELECT pg_advisory_xact_lock(7301)');

export async function confirmedX(q: Queryable, orderId: string): Promise<CalcInput> {
  const { rows: [c] } = await q.query('SELECT fields FROM confirmations WHERE order_id = $1 ORDER BY id DESC LIMIT 1', [orderId]);
  if (!c) throw new Error('沒有確認紀錄');
  const f = c.fields;
  return { id: orderId, customer: f.customer, model: f.model, qty: f.qty, due: f.due, partChange: !!f.partChange };
}

export async function runCalc(d: Deps, q: Queryable, orderId: string, reason: string) {
  const [{ ver: pv, P }, { ver: qv, items }] = await Promise.all([currentParams(q), currentQueue(q)]);
  const X = await confirmedX(q, orderId);
  const t = taipei(d.now());
  const asOf = { date: t.date, hour: t.hour };
  const result = E.calc(items, X, P, asOf);
  const { rows: [r] } = await q.query('SELECT coalesce(max(rev),0)+1 AS rev FROM calcs WHERE order_id = $1', [orderId]);
  const id = calcRef(orderId, r.rev);
  await q.query('INSERT INTO calcs(id, order_id, rev, param_ver, queue_ver, as_of, fingerprint, input, result, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [id, orderId, r.rev, pv, qv, JSON.stringify(asOf), result.fingerprint, JSON.stringify({ queue: items, X, P, asOf }), JSON.stringify(stripCal(result)), reason]);
  const b = result.cands[result.best];
  await audit(q, SYSTEM, r.rev === 1 ? '試算完成' : '重新試算', orderId,
    `${id}${r.rev > 1 ? '（' + reason + '）' : ''}；建議排在 ${b.afterId} 之後，額外換線 ${b.extraC} 次；參數 p${pv}、佇列 q${qv}；輸入指紋 ${result.fingerprint}`);
  return { id, rev: r.rev, result, pv, qv };
}

/* 存檔用：去掉日曆物件（函式），其餘照存 */
function stripCal(r: any) { const { cal, ...rest } = r; return rest; }

export async function latestCalc(q: Queryable, orderId: string): Promise<CalcRow | null> {
  const { rows } = await q.query<CalcRow>('SELECT * FROM calcs WHERE order_id = $1 ORDER BY rev DESC LIMIT 1', [orderId]);
  return rows[0] || null;
}

/* 由存檔輸入重算；指紋不符代表程式或資料被動過，直接報錯 */
export function replay(c: CalcRow) {
  const { queue, X, P, asOf } = c.input;
  const result = E.calc(queue, X, P, asOf);
  if (result.fingerprint !== c.fingerprint) throw new Error(`試算 ${c.id} 無法重現（指紋不符）`);
  return result;
}

export async function recalcQueued(d: Deps, q: Queryable, reason: string, exceptId?: string) {
  const { rows } = await q.query("SELECT id FROM orders WHERE status = 'queued' AND id <> $1 ORDER BY id", [exceptId || '']);
  for (const r of rows) await runCalc(d, q, r.id, reason);
  return rows.length;
}
