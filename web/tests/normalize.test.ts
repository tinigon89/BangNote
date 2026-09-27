import { describe, expect, it } from 'vitest';
import { normalizeKey } from '@/lib/text/normalize';

describe('normalizeKey', () => {
  it('bỏ dấu tiếng Việt và lowercase', () => {
    expect(normalizeKey('Lịch sử')).toBe('lichsu');
    expect(normalizeKey('Y học')).toBe('yhoc');
  });

  it('chuyển đ/Đ thành d', () => {
    expect(normalizeKey('ĐÀ NẴNG')).toBe('danang');
    expect(normalizeKey('đường')).toBe('duong');
  });

  it('bỏ khoảng trắng và gạch dưới', () => {
    expect(normalizeKey('lịch_sử  thế giới')).toBe('lichsuthegioi');
    expect(normalizeKey('LichSu')).toBe('lichsu');
  });

  it('giữ nguyên chữ số', () => {
    expect(normalizeKey('Thế kỷ 20')).toBe('theky20');
  });
});
