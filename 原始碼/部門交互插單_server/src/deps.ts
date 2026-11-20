import type { Db } from './db/index.ts';
import type { LineClient } from './line/client.ts';
import type { IdentityVerifier } from './line/liff.ts';
import type { Config } from './config.ts';
import type { Jobs } from './jobs.ts';
import type { LlmCaller } from './parse/openai.ts';
import type { LoginExchange } from './auth.ts';

export type Deps = {
  db: Db;
  line: LineClient;
  cfg: Config;
  jobs: Jobs;
  verifyId: IdentityVerifier;
  llm: LlmCaller | null;     // null = 沒有設定 OpenAI，只用規則
  now: () => Date;
  loginExchange?: LoginExchange | null; // null = 沒設定 LINE Login（網頁只能用本機開發登入）
};
