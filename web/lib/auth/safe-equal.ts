import { createHash, timingSafeEqual } from 'node:crypto';

/** So sánh chuỗi constant-time (băm trước để độ dài khác nhau không lộ thông tin). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
