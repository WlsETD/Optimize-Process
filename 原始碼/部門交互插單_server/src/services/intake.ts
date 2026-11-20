/* LINE webhook 事件處理：（簽章已在路由驗過）→ 事件 ID 去重 → 只收一對一 → 身分 → 建單 → 回「已收單」（reply，免費）→ 背景解析 */
import type { Deps } from '../deps.ts';
import { liffUrl } from '../config.ts';
import { audit, SYSTEM } from './audit.ts';
import { findByLine, asActor, ROLE_LABEL } from './people.ts';
import { createOrder } from './orders.ts';
import { send, text } from './notify.ts';
import { runParse } from './parse.ts';

export type EventResult = { eventId: string; result: string; orderId?: string };

export async function handleWebhook(d: Deps, body: any): Promise<EventResult[]> {
  const out: EventResult[] = [];
  for (const ev of Array.isArray(body?.events) ? body.events : []) out.push(await handleEvent(d, ev));
  return out;
}

async function handleEvent(d: Deps, ev: any): Promise<EventResult> {
  const eventId: string = ev?.webhookEventId;
  if (!eventId) return { eventId: '', result: '沒有事件 ID，略過' };
  const uid: string | null = ev?.source?.userId ?? null;
  const { rows } = await d.db.query(
    'INSERT INTO line_events(event_id, type, line_user_id, body) VALUES ($1,$2,$3,$4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
    [eventId, String(ev.type || ''), uid, JSON.stringify(ev)]);
  if (!rows.length) {
    await audit(d.db, SYSTEM, 'webhook 重送', '', `事件 ${eventId} 已處理過，略過`);
    return { eventId, result: '重複事件，略過' };
  }
  const done = async (result: string, orderId?: string): Promise<EventResult> => {
    await d.db.query('UPDATE line_events SET result = $2 WHERE event_id = $1', [eventId, result]);
    return { eventId, result, orderId };
  };
  const reply = (kind: string, msg: string, personId: string | null, orderId?: string) => ev.replyToken
    ? send(d, { personId, lineUserId: uid }, { kind, mode: 'reply', replyToken: ev.replyToken, orderId, messages: [text(msg)] })
    : Promise.resolve('skipped');

  if (ev?.source?.type !== 'user') {
    await audit(d.db, SYSTEM, '非一對一訊息', '', `來源 ${ev?.source?.type}，本系統只收一對一聊天`);
    return done('群組或聊天室訊息，不處理');
  }
  const p = await findByLine(d.db, uid);
  if (ev.type === 'follow') {
    if (!p) await reply('unbound', `您好，這是昇嶺插單入口。請先向管理者索取一次性綁定碼，再到這裡輸入：\n${liffUrl(d.cfg, 'bind')}`, null);
    return done(p ? '已綁定者加好友' : '新好友，已回覆綁定引導');
  }
  if (ev.type !== 'message') return done(`事件類型 ${ev.type}，不處理`);
  if (!p) {
    await reply('unbound', `這個 LINE 帳號還沒綁定，訊息不會建單。請向管理者索取一次性綁定碼，再到這裡輸入：\n${liffUrl(d.cfg, 'bind')}`, null);
    await audit(d.db, SYSTEM, '未綁定訊息', '', '未綁定使用者傳訊息，不處理');
    return done('未綁定，不處理，已回覆引導');
  }
  if (p.role !== 'boss' && p.role !== 'sales') {
    await reply('text', `這個帳號（${ROLE_LABEL[p.role]}）不收單。新單請由老闆或業務轉傳。`, p.id);
    return done('此角色不收單，已回覆說明');
  }
  if (ev.message?.type !== 'text' || !String(ev.message.text || '').trim()) {
    await reply('text', '目前只收文字訊息。請把插單內容用文字轉傳或貼上。', p.id);
    return done(`訊息類型 ${ev.message?.type}，不建單`);
  }
  const msgText: string = ev.message.text;
  const orderId = await d.db.tx(async q => {
    const id = await createOrder(q, { source: 'LINE', text: msgText, senderId: p.id, lineEventId: eventId });
    await audit(q, asActor(p), '建單', id, `來源 LINE，事件 ${eventId}，原文 ${msgText.length} 字（凍結，不可修改）`);
    return id;
  });
  await reply('ack', `已收單 ${orderId}。生管算好後會通知可交日；請勿口頭先答應日期。`, p.id, orderId);
  d.jobs.run('parse ' + orderId, () => runParse(d, orderId));
  return done('建單 ' + orderId, orderId);
}
