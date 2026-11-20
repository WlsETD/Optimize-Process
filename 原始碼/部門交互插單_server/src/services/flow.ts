/* 一張單的流程：業務確認送出 → 試算 → 生管決定（客戶期限）→ 業務複製回覆 → 回填實際結果。
   每一步寫稽核；試算由固定程式做；沒有試算與決定就沒有回覆。 */
import type { Deps } from '../deps.ts';
import type { Queryable } from '../db/index.ts';
import { E, type Fields, type FieldKey, type Params } from '../engine/index.ts';
import { liffUrl } from '../config.ts';
import { audit, type Actor } from './audit.ts';
import { asActor, type Person } from './people.ts';
import { createOrder, SRC_LABEL, type Source } from './orders.ts';
import { currentParams, currentQueue } from './params.ts';
import { runCalc, latestCalc, replay, recalcQueued, lockSchedule, calcRef } from './calc.ts';
import { replyText, bossCard, salesDueText } from './reply.ts';
import { send, text } from './notify.ts';
import { runParse } from './parse.ts';

export type Result<T = {}> = ({ ok: true } & T) | { ok: false; msg: string; code?: string };
const fail = (msg: string, code?: string): { ok: false; msg: string; code?: string } => ({ ok: false, msg, code });
const { mdw } = E.util;

export const REQ: FieldKey[] = ['customer', 'model', 'qty', 'due', 'partChange'];

/* 解析結果哪些欄位要業務處理：缺、低信心、機種不在對照表 */
export function lowOf(f: Fields, k: FieldKey, P: Params): 'missing' | 'low' | null {
  const x = f[k];
  if (x.value == null || x.value === '') return 'missing';
  if (k === 'model' && !E.TABLES.models.includes(x.value)) return 'low';
  return x.conf < P.conf.threshold ? 'low' : null;
}
export const pendingOf = (f: Fields, P: Params) => [...REQ, 'isAdd' as FieldKey].filter(k => lowOf(f, k, P));

function coerce(k: FieldKey, v: unknown): { ok: true; v: any } | { ok: false; msg: string } {
  const L = E.FIELD_LABEL[k];
  if (v === '' || v == null) return k === 'isAdd' ? { ok: true, v: false } : { ok: false, msg: L + '不能空白' };
  if (k === 'customer') return E.TABLES.customers[String(v)] ? { ok: true, v: String(v) } : { ok: false, msg: '客戶不在客戶表' };
  if (k === 'model') return E.TABLES.models.includes(String(v)) ? { ok: true, v: String(v) } : { ok: false, msg: '機種不在機種表' };
  if (k === 'qty') { const n = Number(String(v).replace(/,/g, '')); return Number.isInteger(n) && n > 0 && n < 1e6 ? { ok: true, v: n } : { ok: false, msg: '數量要是正整數' }; }
  if (k === 'due') return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !isNaN(Date.parse(String(v))) ? { ok: true, v: String(v) } : { ok: false, msg: '交期要是日期' };
  if (v === true || v === 'true') return { ok: true, v: true };
  if (v === false || v === 'false') return { ok: true, v: false };
  return { ok: false, msg: L + '要是「是」或「否」' };
}

const show = (k: FieldKey, v: any) => v == null || v === '' ? '—' : k === 'qty' ? Number(v).toLocaleString('en-US') + ' 片' : k === 'due' ? mdw(v)
  : k === 'partChange' ? (v ? '要換' : '不換') : k === 'isAdd' ? (v ? '追加單' : '一般單') : String(v);

async function orderRow(q: Queryable, id: string, lock = false) {
  const { rows: [o] } = await q.query('SELECT * FROM orders WHERE id = $1' + (lock ? ' FOR UPDATE' : ''), [id]);
  return o || null;
}
const setStatus = (q: Queryable, id: string, s: string) => q.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [id, s]);

/* ===== 業務：確認送出 ===== */
export async function confirmOrder(d: Deps, p: Person, id: string, body: { fields?: Record<string, unknown>; confirmed?: string[] }): Promise<Result<{ calcId: string }>> {
  return d.db.tx(async q => {
    await lockSchedule(q);
    const o = await orderRow(q, id, true);
    if (!o) return fail('找不到這張單');
    if (o.status !== 'received') return fail('這張不是待確認狀態', 'state');
    const { rows: [pr] } = await q.query('SELECT fields FROM parses WHERE order_id = $1 ORDER BY id DESC LIMIT 1', [id]);
    if (!pr) return fail('還在解析，請稍候再開', 'parsing');
    const { P } = await currentParams(q);
    const parsed: Fields = pr.fields;
    const final: Record<string, any> = {};
    for (const k of E.FIELD_ORDER) {
      const raw = body.fields && k in body.fields ? body.fields[k] : parsed[k].value;
      const c = coerce(k, raw);
      if (!c.ok) return fail(c.msg, 'field');
      final[k] = c.v;
    }
    const confirmed = new Set(body.confirmed || []);
    const pend = pendingOf(parsed, P).filter(k => !confirmed.has(k));
    if (pend.length) return fail('還有 ' + pend.length + ' 欄要處理：' + pend.map(k => E.FIELD_LABEL[k]).join('、'), 'pending');
    const changes = E.FIELD_ORDER.filter(k => String(parsed[k].value) !== String(final[k])).map(k => ({ field: k, from: parsed[k].value, to: final[k] }));
    await q.query('INSERT INTO confirmations(order_id, fields, changes, by_person) VALUES ($1,$2,$3,$4)', [id, JSON.stringify(final), JSON.stringify(changes), p.id]);
    await setStatus(q, id, 'queued');
    await audit(q, asActor(p), '確認並送出', id, changes.length
      ? '修改欄位：' + changes.map(c => `${E.FIELD_LABEL[c.field]} ${show(c.field, c.from)} → ${show(c.field, c.to)}`).join('；') : '沒有修改欄位');
    const c = await runCalc(d, q, id, '首次試算');
    return { ok: true, calcId: c.id };
  });
}

export async function returnOrder(d: Deps, p: Person, id: string): Promise<Result> {
  return d.db.tx(async q => {
    const o = await orderRow(q, id, true);
    if (!o) return fail('找不到這張單');
    if (o.status !== 'received') return fail('只有待確認的單可以退回', 'state');
    await setStatus(q, id, 'returned');
    await audit(q, asActor(p), '退回', id, '原文保留，欄位草稿作廢');
    return { ok: true };
  });
}

/* ===== 網頁備援收單（LINE 不通、電話、口頭） ===== */
export async function webIntake(d: Deps, p: Person, body: { text?: string; source?: string }): Promise<Result<{ orderId: string }>> {
  const t = String(body.text || '').trim();
  const src = (['WEB', 'PHONE', 'ORAL'].includes(String(body.source)) ? body.source : 'WEB') as Source;
  if (t.length < 4) return fail('原文太短');
  if (t.length > 2000) return fail('原文太長（上限 2000 字）');
  const orderId = await d.db.tx(async q => {
    const id = await createOrder(q, { source: src, text: t, senderId: p.id });
    await audit(q, asActor(p), '建單', id, `來源 ${SRC_LABEL[src]}，原文 ${t.length} 字（凍結，不可修改）`);
    return id;
  });
  d.jobs.run('parse ' + orderId, () => runParse(d, orderId));
  return { ok: true, orderId };
}

/* ===== 生管：採用或調整，訂客戶期限 ===== */
export type DecideBody = { type?: string; k?: number; promise?: string; reason?: string; calcId?: string };

export async function decide(d: Deps, p: Person, id: string, b: DecideBody): Promise<Result<{ promise: string; calcId: string }>> {
  const type = b.type === 'adjust' ? 'adjust' : b.type === 'adopt' ? 'adopt' : null;
  if (!type) return fail('type 要是 adopt 或 adjust');
  const r = await d.db.tx(async q => {
    await lockSchedule(q);
    const o = await orderRow(q, id, true);
    if (!o) return fail('找不到這張單');
    if (o.status !== 'queued') return fail('這張不是待決定狀態', 'state');
    const calc = await latestCalc(q, id);
    if (!calc) return fail('沒有試算紀錄');
    const [{ ver: pv }, { ver: qv }] = await Promise.all([currentParams(q), currentQueue(q)]);
    if (calc.param_ver !== pv || calc.queue_ver !== qv) {
      const n = await runCalc(d, q, id, '決定前排程或參數已變動');
      return fail(`排程或參數已變動，已重新試算為 ${n.id}，請再看一次`, 'stale');
    }
    if (b.calcId && b.calcId !== calc.id) return fail(`畫面上的試算不是最新（最新是 ${calc.id}），請重新整理`, 'stale');
    const res = replay(calc);
    let c = res.cands[res.best];
    if (type === 'adjust') { c = res.cands.find((x: any) => x.k === Number(b.k)); if (!c) return fail('找不到這個位置'); }
    const minDate: string = c.endAt.date;
    const promise = b.promise || minDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(promise)) return fail('客戶期限要是日期');
    if (promise < minDate) return fail('客戶期限不能早於試算完成日 ' + mdw(minDate));
    const reason = String(b.reason || '').trim();
    const needReason = type === 'adjust' || promise !== minDate;
    if (needReason && reason.length < 4) return fail((type === 'adjust' ? '調整' : '改客戶期限') + '一定要寫原因（至少 4 個字）');
    await q.query('INSERT INTO decisions(order_id, calc_id, type, cand_k, completion_date, promise_date, reason, by_person) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, calc.id, type, c.k, minDate, promise, needReason ? reason : null, p.id]);
    await setStatus(q, id, 'decided');
    await audit(q, asActor(p), type === 'adopt' ? '採用 AI 建議' : '調整', id,
      `依據 ${calc.id}；排在 ${c.afterId} 之後，${c.startAt.label} 開工；試算完成 ${c.endAt.label}；回給客戶期限 ${mdw(promise)}` +
      (promise !== minDate ? `（比完成日晚 ${E.util.workdaysBetween(minDate, promise)} 個工作天）` : '') + (needReason ? '；原因：' + reason : ''));
    // 佇列：採用這個位置後的順序成為新版本
    const items = c.seqJobs.map((j: any) => { const n = { ...j }; delete n.notBefore; delete n.inserted; if (j.id === id) n.fromOrder = true; return n; });
    const { rows: [nv] } = await q.query('SELECT max(ver)+1 AS v FROM queue_versions');
    await q.query('INSERT INTO queue_versions(ver, items, source, created_by) VALUES ($1,$2,$3,$4)', [nv.v, JSON.stringify(items), '決定 ' + id, p.name]);
    await recalcQueued(d, q, `佇列已變動：${id} 已插入`, id);
    return { ok: true as const, promise, calcId: calc.id, confirmBy: (await lastConfirmer(q, id)) };
  });
  if (!r.ok) return r;
  const f = await confirmedFields(d.db, id);
  // 可交日推給確認的業務；老闆收資訊卡片（push，計則數）
  const salesTo = await bound(d.db, "id = $1 AND role = 'sales'", [r.confirmBy]);
  for (const s of salesTo.length ? salesTo : await bound(d.db, "role = 'sales'"))
    await send(d, { personId: s.id, lineUserId: s.line_user_id }, { kind: 'due', mode: 'push', orderId: id,
      messages: [text(salesDueText({ id, customer: f.customer, model: f.model, promise: r.promise, due: f.due }, liffUrl(d.cfg, 'reply&order=' + id)))] });
  await pushBoss(d, id, f, r.promise, false);
  return { ok: true, promise: r.promise, calcId: r.calcId };
}

async function lastConfirmer(q: Queryable, id: string): Promise<string> {
  const { rows: [c] } = await q.query('SELECT by_person FROM confirmations WHERE order_id = $1 ORDER BY id DESC LIMIT 1', [id]);
  return c?.by_person || '';
}
async function confirmedFields(q: Queryable, id: string) {
  const { rows: [c] } = await q.query('SELECT fields FROM confirmations WHERE order_id = $1 ORDER BY id DESC LIMIT 1', [id]);
  return c.fields;
}
async function bound(q: Queryable, where: string, params: unknown[] = []) {
  return (await q.query(`SELECT id, line_user_id FROM people WHERE active AND line_user_id IS NOT NULL AND ${where}`, params)).rows;
}
async function pushBoss(d: Deps, id: string, f: any, promise: string, replied: boolean) {
  for (const b of await bound(d.db, "role = 'boss'"))
    await send(d, { personId: b.id, lineUserId: b.line_user_id }, { kind: 'bossdue', mode: 'push', orderId: id,
      messages: [text(bossCard({ id, customer: f.customer, model: f.model, qty: f.qty, due: f.due, promise, replied }))] });
}

async function lastDecision(q: Queryable, id: string) {
  const { rows: [x] } = await q.query("SELECT *, to_char(promise_date,'YYYY-MM-DD') AS promise FROM decisions WHERE order_id = $1 ORDER BY id DESC LIMIT 1", [id]);
  return x || null;
}

/* ===== 業務：回覆草稿（沒有試算或決定就沒有草稿） ===== */
export async function replyDraft(q: Queryable, id: string): Promise<Result<{ text: string; promise: string; calcId: string }>> {
  const calc = await latestCalc(q, id);
  if (!calc) return fail('沒有試算紀錄，不能回覆', 'nocalc');
  const dec = await lastDecision(q, id);
  if (!dec) return fail('生管還沒決定，不能回覆', 'nodecision');
  const f = await confirmedFields(q, id);
  return { ok: true, text: replyText(f, dec.promise), promise: dec.promise, calcId: dec.calc_id };
}

export async function copyReply(d: Deps, p: Person, id: string): Promise<Result<{ text: string }>> {
  const r = await d.db.tx(async q => {
    const o = await orderRow(q, id, true);
    if (!o) return fail('找不到這張單');
    const dr = await replyDraft(q, id);
    if (!dr.ok) return dr;
    if (o.status !== 'decided') return fail(o.status === 'replied' || o.status === 'done' ? '已經回覆過' : '這張還不能回覆', 'state');
    const dec = await lastDecision(q, id);
    await q.query('INSERT INTO replies(order_id, calc_id, decision_id, text, by_person) VALUES ($1,$2,$3,$4,$5)', [id, dec.calc_id, dec.id, dr.text, p.id]);
    await setStatus(q, id, 'replied');
    await audit(q, asActor(p), '複製回覆', id, `交期 ${mdw(dr.promise)}，對應試算 ${dec.calc_id}`);
    return { ok: true as const, text: dr.text, promise: dr.promise };
  });
  if (!r.ok) return r;
  await pushBoss(d, id, await confirmedFields(d.db, id), r.promise, true);
  return { ok: true, text: r.text };
}

/* ===== 業務：回填實際結果 ===== */
export async function saveActual(d: Deps, p: Person, id: string, b: { shipDate?: string; shippedQty?: number; changeovers?: number; hours?: number; note?: string }): Promise<Result> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.shipDate))) return fail('實際出貨日要是日期');
  const co = Number(b.changeovers), h = Number(b.hours);
  if (!Number.isInteger(co) || co < 0) return fail('額外換線次數要是 0 以上的整數');
  if (!isFinite(h) || h < 0) return fail('額外換線小時要是 0 以上的數字');
  const qty = b.shippedQty == null || b.shippedQty === ('' as any) ? null : Number(b.shippedQty);
  if (qty != null && (!Number.isInteger(qty) || qty < 0)) return fail('出貨數量要是整數');
  return d.db.tx(async q => {
    const o = await orderRow(q, id, true);
    if (!o) return fail('找不到這張單');
    if (o.status !== 'replied') return fail(o.status === 'done' ? '已經回填過' : '還沒回覆客戶，不能回填', 'state');
    await q.query('INSERT INTO actuals(order_id, ship_date, shipped_qty, changeovers, changeover_hours, note, by_person) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, b.shipDate, qty, co, h, String(b.note || '').slice(0, 300) || null, p.id]);
    await setStatus(q, id, 'done');
    await audit(q, asActor(p), '回填實際結果', id, `實際出貨 ${mdw(b.shipDate!)}；額外換線 ${co} 次 / ${h} h`);
    return { ok: true };
  });
}

export { calcRef };
export type { Actor };
