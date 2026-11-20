import type { Deps } from '../deps.ts';
import { E, type Fields, type Params } from '../engine/index.ts';
import { parseText } from '../parse/index.ts';
import { taipei } from '../time.ts';
import { liffUrl } from '../config.ts';
import { audit, AI } from './audit.ts';
import { currentParams } from './params.ts';
import { send, text } from './notify.ts';

export const pendingFields = (f: Fields, P: Params) =>
  E.FIELD_ORDER.filter(k => f[k].value == null || f[k].conf < P.conf.threshold);

/* 解析一張單並通知已綁定的業務（push，計則數） */
export async function runParse(d: Deps, orderId: string) {
  const { rows: [o] } = await d.db.query('SELECT o.id, m.text FROM orders o JOIN raw_messages m ON m.id = o.raw_message_id WHERE o.id = $1', [orderId]);
  if (!o) throw new Error('找不到訂單 ' + orderId);
  const { P } = await currentParams(d.db);
  const ctx = { today: taipei(d.now()).date, P };
  const r = await parseText(o.text, ctx, d.llm, d.cfg.parseTimeoutMs);
  const low = pendingFields(r.fields, P);
  await d.db.tx(async q => {
    await q.query('INSERT INTO parses(order_id, engine, fallback, model, latency_ms, fields, llm_raw) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [orderId, r.engine, r.fallback, r.model, r.latencyMs, JSON.stringify(r.fields), r.llmRaw == null ? null : JSON.stringify(r.llmRaw)]);
    await audit(q, AI, '解析欄位', orderId, r.status + (low.length ? `；${low.length} 個欄位待業務確認` : ''));
  });
  const { rows: sales } = await d.db.query("SELECT id, line_user_id FROM people WHERE role = 'sales' AND active AND line_user_id IS NOT NULL");
  for (const s of sales) {
    await send(d, { personId: s.id, lineUserId: s.line_user_id }, {
      kind: 'new', mode: 'push', orderId,
      messages: [text(`新單 ${orderId} 待確認${low.length ? `（${low.length} 個欄位要看）` : ''}\n${liffUrl(d.cfg, 'confirm&order=' + orderId)}`)],
    });
  }
  return r;
}
