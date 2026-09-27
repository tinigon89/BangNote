import { safeEqual } from './safe-equal';

export function hasValidApiKey(req: Request): boolean {
  const expected = process.env.API_KEY;
  if (!expected) return false;
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  return !!match && safeEqual(match[1].trim(), expected);
}
