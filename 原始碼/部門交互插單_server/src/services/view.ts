/* 給畫面的資料：形狀對齊 Demo v2 的訂單物件，前端用同一份引擎由試算輸入重算（指紋必須一致）。 */
import type { Queryable } from '../db/index.ts';
import { E, type FieldKey } from '../engine/index.ts';
import { taipei } from '../time.ts';
import { replay, type CalcRow } from './calc.ts';
import { currentParams } from './params.ts';
import { lowOf, pendingOf, replyDraft } from './flow.ts';

const lab = (t: Date | string | null | undefined) => t ? taipei(new Date(t)).label : null;
const fmtN = (n: number) => Number(n).toLocaleString('en-US');
/* 罰款變化：插單後重排可能讓總罰款變少，負數寫「減少」，不能寫成 +NT$-681 */
export const lossTxt = (d: number) => { const n = Math.round(d); return n > 0 ? `罰款 +NT$${fmtN(n)}` : n < 0 ? `罰款減少 NT$${fmtN(-n)}` : '罰款不變'; };

function parseStatus(p: any): string {
  if (p.engine === 'llm+rule') return `模型解析＋規則比對（${p.model}，${((p.latency_ms || 0) / 1000).toFixed(1)} 秒）`;
  return p.fallback ? `規則解析（${p.fallback}，已退回規則）` : '規則解析（未設定 OpenAI）';
}

const calcOut = (c: CalcRow) => ({ id: c.id, rev: c.rev, reason: c.reason, at: lab(c.created_at), pv: c.param_ver, qv: c.queue_ver, fingerprint: c.fingerprint, input: c.input });

export async function summaryOf(c: CalcRow) {
  const r = replay(c), b = r.cands[r.best];
  return { afterId: b.afterId, text: `建議排在 ${b.afterId} 後，預計 ${b.startAt.label} 開工；${lossTxt(b.deltaLoss)}；連帶 ${b.newLate.length} 張晚交`,
    risk: E.risk(b, r.cal, c.input.P).label, endLabel: b.endAt.label };
}

export async function orderView(q: Queryable, id: string) {
  const { rows: [o] } = await q.query(`SELECT o.*, m.text, m.source, m.sender_id, m.line_event_id, m.received_at, s.name AS sender_name
    FROM orders o JOIN raw_messages m ON m.id = o.raw_message_id LEFT JOIN people s ON s.id = m.sender_id WHERE o.id = $1`, [id]);
  if (!o) return null;
  const one = async (sql: string) => (await q.query(sql, [id])).rows[0] || null;
  const parse = await one('SELECT * FROM parses WHERE order_id = $1 ORDER BY id DESC LIMIT 1');
  const conf = await one('SELECT c.*, p.name FROM confirmations c JOIN people p ON p.id = c.by_person WHERE order_id = $1 ORDER BY c.id DESC LIMIT 1');
  const calc: CalcRow | null = await one('SELECT * FROM calcs WHERE order_id = $1 ORDER BY rev DESC LIMIT 1');
  const dec = await one('SELECT d.*, p.name FROM decisions d JOIN people p ON p.id = d.by_person WHERE order_id = $1 ORDER BY d.id DESC LIMIT 1');
  const rep = await one('SELECT r.*, p.name FROM replies r JOIN people p ON p.id = r.by_person WHERE order_id = $1 ORDER BY r.id DESC LIMIT 1');
  const act = await one('SELECT a.*, p.name FROM actuals a JOIN people p ON p.id = a.by_person WHERE order_id = $1 ORDER BY a.id DESC LIMIT 1');
  const { P, ver: pv } = await currentParams(q);

  const calcs: any[] = [];
  let decision: any = null;
  if (dec) {
    const dc: CalcRow = dec.calc_id === calc?.id ? calc! : (await q.query('SELECT * FROM calcs WHERE id = $1', [dec.calc_id])).rows[0];
    const r = replay(dc); const c = r.cands.find((x: any) => x.k === dec.cand_k);
    if (dc.id !== calc?.id) calcs.push(calcOut(dc));
    decision = {
      type: dec.type, k: dec.cand_k, afterId: c.afterId, reason: dec.reason || '', by: dec.name, at: lab(dec.created_at), calc: dec.calc_id,
      promise: dec.promise_date, promiseChanged: dec.promise_date !== dec.completion_date,
      actualSlot: `${c.startAt.label} 開工（${r.entry.label} 排入）`,
      est: { extraC: c.extraC, extraH: c.extraH, endDate: c.endAt.date, endLabel: c.endAt.label, lateX: c.lateX, risk: E.risk(c, r.cal, dc.input.P).label, startLabel: c.startAt.label },
    };
  }
  if (calc) calcs.push(calcOut(calc));

  // 草稿：業務確認後用確認值；確認前用解析值
  let draft: any = null;
  if (parse) {
    const fields: any = {};
    for (const k of E.FIELD_ORDER) {
      const f = { ...parse.fields[k] };
      if (conf) { f.value = conf.fields[k]; f.confirmed = true; } else f.confirmed = false;
      fields[k] = f;
    }
    draft = { fields };
  }
  const anyField = parse && E.FIELD_ORDER.some(k => k !== 'isAdd' && parse.fields[k].value != null);
  const rd = await replyDraft(q, id);

  return {
    id: o.id, status: o.status, sample: null,
    raw: { text: o.text, source: o.source, by: o.sender_name || '', byId: o.sender_id || '', forwardedAt: lab(o.received_at), receivedAt: lab(o.received_at), eventId: o.line_event_id || '' },
    parse: parse ? { engine: parse.engine, fallback: !!parse.fallback, status: parseStatus(parse), fields: parse.fields, failed: !anyField,
      pending: pendingOf(parse.fields, P).map((k: FieldKey) => ({ k, why: lowOf(parse.fields, k, P) })) } : null,
    draft,
    confirm: conf ? { by: conf.name, byId: conf.by_person, at: lab(conf.created_at), changes: conf.changes } : null,
    calcs, decision,
    replyDraft: rd.ok ? rd.text : null,
    reply: rep ? { text: rep.text, at: lab(rep.created_at), by: rep.name, calc: rep.calc_id, dueDate: dec?.promise_date } : null,
    actual: act ? { shipDate: act.ship_date, shippedQty: act.shipped_qty, changeovers: act.changeovers, hours: act.changeover_hours, note: act.note, at: lab(act.created_at), by: act.name } : null,
    t: { received: lab(o.received_at), confirmed: conf ? lab(conf.created_at) : null, waitingSince: conf ? conf.created_at : o.received_at },
    paramsNow: { ver: pv, threshold: P.conf.threshold },
  };
}

/* 清單（輕量）：業務看全部未退回的單；生管看待決定（等最久在上）與最近已決定 */
export async function orderList(q: Queryable, scope: 'sales' | 'planner') {
  const where = scope === 'sales' ? "o.status <> 'returned'" : "o.status IN ('queued','decided','replied','done')";
  const { rows } = await q.query(`SELECT o.id, o.status, o.created_at, m.text, m.source,
      (SELECT created_at FROM confirmations c WHERE c.order_id = o.id ORDER BY id DESC LIMIT 1) AS confirmed_at,
      (SELECT count(*)::int FROM parses p WHERE p.order_id = o.id) AS parsed
    FROM orders o JOIN raw_messages m ON m.id = o.raw_message_id WHERE ${where} ORDER BY o.created_at DESC LIMIT 200`);
  const out = [];
  for (const r of rows) {
    const item: any = { id: r.id, status: r.status, text: r.text, source: r.source, receivedAt: lab(r.created_at), confirmedAt: lab(r.confirmed_at), parsed: r.parsed > 0,
      waitingSince: (r.confirmed_at || r.created_at) };
    if (scope === 'planner' && r.status === 'queued') {
      const { rows: [c] } = await q.query('SELECT * FROM calcs WHERE order_id = $1 ORDER BY rev DESC LIMIT 1', [r.id]);
      if (c) item.summary = await summaryOf(c);
    }
    if (scope === 'planner' && r.status !== 'queued') {
      const { rows: [d] } = await q.query('SELECT d.type, d.promise_date, p.name FROM decisions d JOIN people p ON p.id = d.by_person WHERE order_id = $1 ORDER BY d.id DESC LIMIT 1', [r.id]);
      if (d) item.decision = { type: d.type, promise: d.promise_date, by: d.name };
    }
    out.push(item);
  }
  if (scope === 'planner') out.sort((a, b) => (a.status === 'queued' ? 0 : 1) - (b.status === 'queued' ? 0 : 1) ||
    (a.status === 'queued' ? new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime() : 0));
  return out;
}
