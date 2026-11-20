/* 回覆客戶的固定範本（移出引擎）：日期一律用生管訂的「客戶期限」，不寫「最快」——生管可能留了緩衝。
   模型之後只能改措辭，改完要檢查日期、數量、機種沒變。 */
import { E } from '../engine/index.ts';

const { mdw } = E.util;
const n = (x: number) => Number(x).toLocaleString('en-US');

export function replyText(f: { model: string; qty: number; due: string }, promise: string): string {
  const head = `您好，${f.model} ${n(f.qty)} 片`;
  if (promise <= f.due) return `${head}，預計 ${mdw(promise)}可出貨，符合您要求的 ${mdw(f.due)}。如有變動我們會先通知您。`;
  return `${head}，可出貨日為 ${mdw(promise)}，趕不上您要求的 ${mdw(f.due)}。若需要更早，我們會再與生管確認後回覆您。`;
}

/* 老闆的可交日卡片：只有資訊，沒有任何可操作的按鈕 */
export function bossCard(o: { id: string; customer: string; model: string; qty: number; due: string; promise: string; replied: boolean }): string {
  return [
    `可交日｜${o.id}`,
    `${o.customer} ${o.model} ${n(o.qty)} 片`,
    `可交日 ${mdw(o.promise)}（客戶要求 ${mdw(o.due)}）${o.promise <= o.due ? '' : '，趕不上'}`,
    o.replied ? '業務已回覆客戶。' : '生管已決定，等業務回覆客戶。',
    '日期由系統試算、生管決定；請勿另外口頭答應。',
  ].join('\n');
}

export function salesDueText(o: { id: string; customer: string; model: string; promise: string; due: string }, link: string): string {
  return `${o.id} 可交日已定：${mdw(o.promise)}（客戶要求 ${mdw(o.due)}）\n${o.customer} ${o.model}。請開這裡複製回覆給客戶：\n${link}`;
}
