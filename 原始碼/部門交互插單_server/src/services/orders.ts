import type { Queryable } from '../db/index.ts';

export type Source = 'LINE' | 'WEB' | 'PHONE' | 'ORAL';
export const SRC_LABEL: Record<Source, string> = { LINE: 'LINE', WEB: '網頁備援', PHONE: '電話', ORAL: '口頭' };

/* 建單：原文寫進 raw_messages（之後不可改），訂單只指向它 */
export async function createOrder(q: Queryable, o: { source: Source; text: string; senderId: string | null; lineEventId?: string | null }): Promise<string> {
  const { rows: [m] } = await q.query('INSERT INTO raw_messages(source, text, sender_id, line_event_id) VALUES ($1,$2,$3,$4) RETURNING id',
    [o.source, o.text, o.senderId, o.lineEventId ?? null]);
  const { rows: [s] } = await q.query("SELECT 'A-' || lpad(nextval('order_seq')::text, 4, '0') AS id");
  await q.query("INSERT INTO orders(id, raw_message_id, status, created_by) VALUES ($1,$2,'received',$3)", [s.id, m.id, o.senderId]);
  return s.id;
}
