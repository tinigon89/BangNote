import { createHmac } from 'node:crypto';
import { safeEqual } from './safe-equal';

export const SESSION_COOKIE = 'bn_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) throw new Error('SESSION_SECRET phải có ít nhất 16 ký tự');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionToken(now = Date.now()): string {
  const exp = String(Math.floor(now / 1000) + SESSION_MAX_AGE);
  return `${exp}.${sign(exp)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [exp, sig, extra] = token.split('.');
  if (!exp || !sig || extra !== undefined || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 < now) return false;
  return safeEqual(sig, sign(exp));
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && safeEqual(input, expected);
}
