/* 解析：模型只拆欄位；失敗、逾時、格式錯、無出處都退回規則或丟棄，並寫明用了哪一種 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E } from '../src/engine/index.ts';
import { parseText } from '../src/parse/index.ts';
import { openaiCaller, SCHEMA } from '../src/parse/openai.ts';
import type { LlmCaller } from '../src/parse/openai.ts';

const ctx = { today: '2026-11-17', P: E.defaults() };
const TEXT = '丙的 C3 加 600片，週四要，零件不變';
const f = (value: string | null, evidence: string | null, confidence = 0.9) => ({ value, evidence, confidence, note: null, alternatives: [] });
const good = {
  customer: f('丙', '丙'), model: f('C3', 'C3'), qty: f('600', '600片'), due: f('2026-11-19', '週四', 0.9),
  partChange: f('false', '零件不變'), isAdd: f('true', '加'),
};

test('沒設定模型 → 規則解析，狀態寫明', async () => {
  const r = await parseText(TEXT, ctx, null, 8000);
  assert.equal(r.engine, 'rule');
  assert.equal(r.fallback, null);
  assert.match(r.status, /規則解析（未設定 OpenAI）/);
});

test('模型正常 → 合併規則；「週四」有歧義，模型不能把信心拉高', async () => {
  const llm: LlmCaller = async () => ({ obj: good, model: 'test-model' });
  const r = await parseText(TEXT, ctx, llm, 8000);
  assert.equal(r.engine, 'llm+rule');
  assert.equal(r.fields.qty.value, 600);
  assert.ok(r.fields.due.conf < 0.7, '週四仍要業務確認');
  assert.match(r.status, /模型解析＋規則比對（test-model/);
});

test('模型編出原文沒有的數量 → 該欄丟棄，用規則', async () => {
  const llm: LlmCaller = async () => ({ obj: { ...good, qty: f('900', '900片') }, model: 'm' });
  const r = await parseText(TEXT, ctx, llm, 8000);
  assert.equal(r.fields.qty.value, 600);
  assert.equal(r.fields.qty.src, 'rule');
  assert.match(r.status, /1 個值無出處或無效已丟棄/);
});

test('模型超過時限 → 退回規則，並中止請求', async () => {
  let aborted = false;
  const llm: LlmCaller = (_t, _c, signal) => new Promise(res => {
    signal.addEventListener('abort', () => { aborted = true; });
    setTimeout(() => res({ obj: good, model: 'slow' }), 500);
  });
  const r = await parseText(TEXT, ctx, llm, 50);
  assert.equal(r.engine, 'rule');
  assert.equal(r.fallback, '模型超過 0.05 秒');
  assert.match(r.status, /已退回規則/);
  assert.equal(aborted, true);
});

test('模型呼叫失敗或回傳不是物件 → 退回規則', async () => {
  const boom: LlmCaller = async () => { throw new Error('OpenAI HTTP 500'); };
  const r1 = await parseText(TEXT, ctx, boom, 8000);
  assert.equal(r1.engine, 'rule');
  assert.match(r1.fallback!, /模型呼叫失敗：OpenAI HTTP 500/);
  const junk: LlmCaller = async () => ({ obj: 'hello', model: 'm' });
  const r2 = await parseText(TEXT, ctx, junk, 8000);
  assert.equal(r2.fallback, '模型回傳格式不對');
});

test('OpenAI 請求：金鑰只在標頭、用 JSON schema、不留存（store:false）', async () => {
  let req: any;
  const fakeFetch = (async (url: string, init: any) => {
    req = { url, headers: init.headers, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ model: 'gpt-x', choices: [{ message: { content: JSON.stringify(good) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await openaiCaller('sk-test', 'gpt-x', fakeFetch)(TEXT, ctx, new AbortController().signal);
  assert.equal(req.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(req.headers.Authorization, 'Bearer sk-test');
  assert.equal(req.body.store, false);
  assert.deepEqual(req.body.response_format.json_schema.schema, SCHEMA);
  assert.match(req.body.messages[0].content, /2026-11-17/);
  assert.equal(req.body.messages[1].content, TEXT);
  assert.deepEqual(r.usage, { input: 10, output: 5 });
});
