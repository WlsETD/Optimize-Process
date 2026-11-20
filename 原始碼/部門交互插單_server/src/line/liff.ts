/* 驗證 LIFF / LINE Login 的 ID token（由 LINE 伺服器驗），拿到可信的 LINE userId（sub）。 */
export type IdentityVerifier = (idToken: string) => Promise<{ sub: string; name?: string }>;

export function lineIdVerifier(channelId: string, fetchFn: typeof fetch = fetch): IdentityVerifier {
  return async idToken => {
    if (!channelId) throw new Error('尚未設定 LINE_LOGIN_CHANNEL_ID');
    const res = await fetchFn('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error('ID token 驗證失敗');
    const j: any = await res.json();
    if (!j.sub) throw new Error('ID token 沒有使用者');
    return { sub: j.sub, name: j.name };
  };
}
