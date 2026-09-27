import { describe, expect, it } from 'vitest';
import { formatRelative } from '@/lib/format';

const now = new Date('2026-09-27T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('formatRelative', () => {
  it('dưới 1 phút', () => {
    expect(formatRelative(ago(20_000), now)).toBe('vừa xong');
  });
  it('phút, giờ, ngày', () => {
    expect(formatRelative(ago(5 * 60_000), now)).toBe('5 phút trước');
    expect(formatRelative(ago(3 * 3_600_000), now)).toBe('3 giờ trước');
    expect(formatRelative(ago(2 * 86_400_000), now)).toBe('2 ngày trước');
  });
  it('quá 30 ngày → ngày tháng', () => {
    expect(formatRelative(new Date('2026-01-05T08:00:00Z'), now)).toBe('05/01/2026');
  });
});
