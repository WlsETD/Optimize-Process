/* 設定一律從環境變數讀；金鑰只放後端（Cloud Run 用 Secret Manager 注入），不寫進程式或前端。 */
export type Config = {
  port: number;
  lineChannelSecret: string;        // Messaging API channel secret：驗 webhook 簽章
  lineAccessToken: string;          // Messaging API channel access token：沒有就只記錄、不真的送（標「模擬」）
  loginChannelId: string;           // LINE Login channel ID：驗 LIFF / 網頁登入的 ID token
  liffId: string;
  openaiKey: string;                // 沒有就只用規則解析
  openaiModel: string;
  parseTimeoutMs: number;           // 個案要求：8 秒
  bindCodeHours: number;            // 【我猜的】綁定碼有效時數
  loginChannelSecret: string;       // LINE Login channel secret：網頁登入換 token 用
  sessionSecret: string;            // 網頁登入 cookie 簽章用，至少 32 字
  publicUrl: string;                // 對外網址（LINE Login 回呼用），例：https://xxx.a.run.app
  devLogin: boolean;                // 僅本機：免 LINE 直接選人登入（Cloud Run 上一律關閉）
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT || 8080),
    lineChannelSecret: env.LINE_CHANNEL_SECRET || '',
    lineAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN || '',
    loginChannelId: env.LINE_LOGIN_CHANNEL_ID || '',
    liffId: env.LIFF_ID || '',
    openaiKey: env.OPENAI_API_KEY || '',
    openaiModel: env.OPENAI_MODEL || '',
    parseTimeoutMs: Number(env.PARSE_TIMEOUT_MS || 8000),
    bindCodeHours: Number(env.BIND_CODE_HOURS || 24),
    loginChannelSecret: env.LINE_LOGIN_CHANNEL_SECRET || '',
    sessionSecret: env.SESSION_SECRET || '',
    publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
    devLogin: env.DEV_LOGIN === '1' && !env.K_SERVICE,
  };
}

export const liffUrl = (c: Config, page: string) => c.liffId ? `https://liff.line.me/${c.liffId}?page=${page}` : '（綁定頁網址尚未設定）';
