/**
 * Одноразовая по смыслу ссылка для входа с уведомления Telegram: подпись HMAC, срок жизни.
 * Секрет — NEXTAUTH_SECRET (тот же, что у NextAuth).
 */

import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7 дней

type Payload = { u: string; v: string; exp: number };

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET?.trim();
  if (!s) throw new Error('NEXTAUTH_SECRET is required for watch login links');
  return s;
}

/** Ссылка для GET /api/auth/watch-link?t=… */
export function createWatchLoginToken(userId: string, videoId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const payload: Payload = { u: userId, v: videoId, exp };
  const payloadStr = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(payloadStr).digest('base64url');
  return `${payloadStr}.${sig}`;
}

export function verifyWatchLoginToken(token: string): { userId: string; videoId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, sig] = parts;
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) return null;
  const expected = createHmac('sha256', secret).update(payloadStr).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8')) as Payload;
    if (typeof payload.exp !== 'number' || !payload.u || !payload.v) return null;
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;
    return { userId: payload.u, videoId: payload.v };
  } catch {
    return null;
  }
}
