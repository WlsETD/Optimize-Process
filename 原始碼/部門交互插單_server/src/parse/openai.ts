/* OpenAI 只做「文字 → 欄位」：不排程、不算日期。回傳一律經 validateModelOutput 驗證（值要在原文找得到出處）。
   模型名稱由環境變數 OPENAI_MODEL 指定，程式不寫死；價格與型號以 OpenAI 官方定價頁為準。 */
import type { Params } from '../engine/index.ts';
import { E } from '../engine/index.ts';

export type LlmResult = { obj: unknown; model: string; usage?: { input?: number; output?: number } };
export type LlmCaller = (text: string, ctx: { today: string; P: Params }, signal: AbortSignal) => Promise<LlmResult>;

const field = (valueType: string[]) => ({
  type: 'object', additionalProperties: false,
  required: ['value', 'evidence', 'confidence', 'note', 'alternatives'],
  properties: {
    value: { type: valueType },
    evidence: { type: ['string', 'null'], description: '原文中一字不差的片段' },
    confidence: { type: 'number' },
    note: { type: ['string', 'null'] },
    alternatives: { type: 'array', items: { type: 'string' } },
  },
});

export const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['customer', 'model', 'qty', 'due', 'partChange', 'isAdd'],
  properties: {
    customer: field(['string', 'null']), model: field(['string', 'null']), qty: field(['string', 'null']),
    due: field(['string', 'null']), partChange: field(['string', 'null']), isAdd: field(['string', 'null']),
  },
};

export function systemPrompt(today: string) {
  const T = E.TABLES;
  return [
    '你是 SMT 工廠的插單訊息解析器。只把一則中文訊息拆成欄位，不要排程、不要推算可交日、不要編造。',
    `今天是 ${today}（${E.util.mdw(today)}）。`,
    `客戶只能是：${Object.keys(T.customers).join('、')}（別名：${Object.values(T.customers).flat().join('、')}）。`,
    `機種代碼：${T.models.join('、')}（不在表上也照原文填，例如 D7）。`,
    '欄位：customer 客戶、model 機種、qty 數量（純數字字串）、due 要求交期（YYYY-MM-DD）、partChange 是否換零件（"true"/"false"）、isAdd 是否追加單（"true"/"false"）。',
    '每個欄位的 evidence 必須是原文中一字不差的片段；原文沒有就 value 與 evidence 都填 null。',
    '只說星期幾、無法確定是這週或下週時，value 填最近的一個，alternatives 列出其他可能日期，confidence 不要高於 0.6。',
    'confidence 介於 0 到 1。note 用繁體中文、20 字內。',
  ].join('\n');
}

export function openaiCaller(apiKey: string, model: string, fetchFn: typeof fetch = fetch): LlmCaller {
  return async (text, ctx, signal) => {
    const res = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt(ctx.today) }, { role: 'user', content: text }],
        response_format: { type: 'json_schema', json_schema: { name: 'rush_order_fields', strict: true, schema: SCHEMA } },
        store: false,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const j: any = await res.json();
    const content = j?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI 沒有回傳內容');
    return { obj: JSON.parse(content), model: j.model || model, usage: { input: j.usage?.prompt_tokens, output: j.usage?.completion_tokens } };
  };
}
