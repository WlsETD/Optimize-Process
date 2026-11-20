/* 解析：先跑規則（一定有結果），有設定 OpenAI 才呼叫模型；失敗、逾時（8 秒）、驗證不過都退回規則，並寫明用了哪一種。 */
import { E, type Fields, type Params } from '../engine/index.ts';
import type { LlmCaller } from './openai.ts';

export type ParseOutcome = {
  fields: Fields;
  engine: 'rule' | 'llm+rule';
  fallback: string | null;   // 退回規則的原因；null = 沒退回
  status: string;            // 給畫面看的一句話
  model: string | null;
  latencyMs: number | null;
  llmRaw: unknown;
};

export async function parseText(text: string, ctx: { today: string; P: Params }, llm: LlmCaller | null, timeoutMs: number): Promise<ParseOutcome> {
  const rule = E.ruleParse(text, ctx);
  const base = { fields: rule, engine: 'rule' as const, model: null, latencyMs: null, llmRaw: null };
  if (!llm) return { ...base, fallback: null, status: '規則解析（未設定 OpenAI）' };
  const t0 = Date.now();
  const ac = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { ac.abort(); rej(new Error('TIMEOUT')); }, timeoutMs); });
  try {
    const r = await Promise.race([llm(text, ctx, ac.signal), timeout]);
    const ms = Date.now() - t0;
    const v = E.validateModelOutput(text, r.obj, ctx);
    if (!v.fields) return { ...base, fallback: '模型回傳格式不對', status: '規則解析（模型回傳格式不對，已退回規則）', model: r.model, latencyMs: ms, llmRaw: r.obj };
    const fields = E.mergeParse(rule, v.fields);
    const note = v.issues.length ? `；模型有 ${v.issues.length} 個值無出處或無效已丟棄` : '';
    return { fields, engine: 'llm+rule', fallback: null, status: `模型解析＋規則比對（${r.model}，${(ms / 1000).toFixed(1)} 秒${note}）`, model: r.model, latencyMs: ms, llmRaw: r.obj };
  } catch (e: any) {
    const ms = Date.now() - t0;
    const why = e?.message === 'TIMEOUT' ? `模型超過 ${timeoutMs / 1000} 秒` : '模型呼叫失敗';
    return { ...base, fallback: why + (e?.message && e.message !== 'TIMEOUT' ? `：${String(e.message).slice(0, 80)}` : ''), status: `規則解析（${why}，已退回規則）`, latencyMs: ms };
  } finally { clearTimeout(timer); }
}
