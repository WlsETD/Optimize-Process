import { createHmac, timingSafeEqual } from 'node:crypto';

/* LINE webhook 簽章：HMAC-SHA256(channel secret, 原始 body) 的 base64，要和 x-line-signature 相同。
   必須用「原始位元組」計算，不能先 JSON.parse 再轉回字串。 */
export function verifySignature(secret: string, body: string | Buffer, header: string | null | undefined): boolean {
  if (!secret || !header) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  let got: Buffer;
  try { got = Buffer.from(header, 'base64'); } catch { return false; }
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function sign(secret: string, body: string | Buffer): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}
