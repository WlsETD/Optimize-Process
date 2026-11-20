/* 啟動：讀設定 → 連資料庫 → migration → 種子資料 → 開 HTTP */
import { serve } from '@hono/node-server';
import { loadConfig } from './config.ts';
import { openDb } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { ensureSeed } from './services/params.ts';
import { realLine, SimLine } from './line/client.ts';
import { lineIdVerifier } from './line/liff.ts';
import { lineLoginExchange } from './auth.ts';
import { openaiCaller } from './parse/openai.ts';
import { makeJobs } from './jobs.ts';
import { createApp } from './app.ts';
import type { Deps } from './deps.ts';

const cfg = loadConfig();
if (!cfg.lineChannelSecret) console.warn('[警告] 未設定 LINE_CHANNEL_SECRET：所有 webhook 都會被拒絕（401）');
if (cfg.openaiKey && !cfg.openaiModel) console.warn('[警告] 有 OPENAI_API_KEY 但沒有 OPENAI_MODEL：只用規則解析');

const db = await openDb();
await migrate(db);
await ensureSeed(db);

const d: Deps = {
  db, cfg,
  line: cfg.lineAccessToken ? realLine(cfg.lineAccessToken) : new SimLine(),
  verifyId: lineIdVerifier(cfg.loginChannelId),
  loginExchange: cfg.loginChannelId && cfg.loginChannelSecret ? lineLoginExchange(cfg.loginChannelId, cfg.loginChannelSecret) : null,
  llm: cfg.openaiKey && cfg.openaiModel ? openaiCaller(cfg.openaiKey, cfg.openaiModel) : null,
  jobs: makeJobs(),
  now: () => new Date(),
};

serve({ fetch: createApp(d).fetch, port: cfg.port }, i => {
  console.log(`昇嶺插單入口 後端啟動：http://localhost:${i.port}（資料庫 ${db.kind}；LINE ${d.line.simulated ? '模擬' : '真實'}；解析 ${d.llm ? 'OpenAI＋規則' : '只用規則'}）`);
});
