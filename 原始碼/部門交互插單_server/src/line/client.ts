/* LINE 訊息送出。Reply（用 reply token 回覆）免費；Push（主動推播）計入每月則數。
   沒有 access token 時用「模擬」客戶端：只記錄，不送出，畫面與紀錄都標模擬。 */
import { randomUUID } from 'node:crypto';

export type LineMessage = { type: 'text'; text: string } | { type: 'flex'; altText: string; contents: unknown };

export interface LineClient {
  readonly simulated: boolean;
  reply(replyToken: string, messages: LineMessage[]): Promise<void>;
  push(to: string, messages: LineMessage[]): Promise<void>;
}

const API = 'https://api.line.me/v2/bot/message';

export function realLine(accessToken: string, fetchFn: typeof fetch = fetch): LineClient {
  async function call(path: string, body: unknown, headers: Record<string, string> = {}) {
    const res = await fetchFn(`${API}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`LINE ${path} 失敗：HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return {
    simulated: false,
    reply: (replyToken, messages) => call('reply', { replyToken, messages }),
    // X-Line-Retry-Key：同一則推播重試時不會重複送達
    push: (to, messages) => call('push', { to, messages }, { 'X-Line-Retry-Key': randomUUID() }),
  };
}

export type Sent = { mode: 'reply' | 'push'; to: string; messages: LineMessage[] };

/* 模擬客戶端（沒有 token 時，以及測試用）：記下要送的內容；可設定成「LINE 掛了」 */
export class SimLine implements LineClient {
  readonly simulated = true;
  sent: Sent[] = [];
  down = false;
  async reply(replyToken: string, messages: LineMessage[]) {
    if (this.down) throw new Error('模擬：LINE 無法連線');
    this.sent.push({ mode: 'reply', to: replyToken, messages });
  }
  async push(to: string, messages: LineMessage[]) {
    if (this.down) throw new Error('模擬：LINE 無法連線');
    this.sent.push({ mode: 'push', to, messages });
  }
  texts() { return this.sent.flatMap(s => s.messages.map(m => (m.type === 'text' ? m.text : m.altText))); }
}
