import type { Deps } from '../deps.ts';
import type { LineMessage } from '../line/client.ts';

export type Target = { personId: string | null; lineUserId: string | null };

/* 送 LINE 並記錄：reply 免費、push 計則數；失敗也要記（之後可補送） */
export async function send(d: Deps, to: Target, o: { kind: string; mode: 'reply' | 'push'; replyToken?: string; orderId?: string | null; messages: LineMessage[] }) {
  let status: 'sent' | 'failed' | 'skipped' = 'sent', error: string | null = null;
  if (o.mode === 'push' && !to.lineUserId) { status = 'skipped'; error = '對象沒有綁定 LINE'; }
  else {
    try {
      if (o.mode === 'reply') await d.line.reply(o.replyToken!, o.messages);
      else await d.line.push(to.lineUserId!, o.messages);
    } catch (e: any) { status = 'failed'; error = String(e?.message || e).slice(0, 300); }
  }
  await d.db.query(
    'INSERT INTO notifications(person_id, line_user_id, kind, mode, order_id, status, error, payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [to.personId, to.lineUserId, o.kind, o.mode, o.orderId ?? null, status, error, JSON.stringify({ simulated: d.line.simulated, messages: o.messages })],
  );
  return status;
}

export const text = (t: string): LineMessage => ({ type: 'text', text: t });
