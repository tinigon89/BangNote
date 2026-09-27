import { describe, expect, it } from 'vitest';
import { resolveDateRange, vnDateString } from '@/lib/notes/dates';

// 27/09/2026 10:00 giờ VN = 03:00 UTC
const now = new Date('2026-09-27T03:00:00Z');
const vn = (s: string) => new Date(`${s}+07:00`);

describe('resolveDateRange (giờ Việt Nam, end không tính)', () => {
  it('không lọc', () => {
    expect(resolveDateRange({ date: '' }, now)).toBeNull();
  });

  it('hôm nay / hôm qua', () => {
    expect(resolveDateRange({ date: 'today' }, now)).toEqual({ start: vn('2026-09-27T00:00:00'), end: vn('2026-09-28T00:00:00') });
    expect(resolveDateRange({ date: 'yesterday' }, now)).toEqual({ start: vn('2026-09-26T00:00:00'), end: vn('2026-09-27T00:00:00') });
  });

  it('23h đêm theo giờ VN vẫn là "hôm nay" dù UTC đã sang ngày khác', () => {
    const lateNight = new Date('2026-09-27T16:30:00Z'); // 23:30 VN ngày 27
    expect(resolveDateRange({ date: 'today' }, lateNight)?.start).toEqual(vn('2026-09-27T00:00:00'));
    const earlyMorning = new Date('2026-09-26T18:30:00Z'); // 01:30 VN ngày 27
    expect(resolveDateRange({ date: 'today' }, earlyMorning)?.start).toEqual(vn('2026-09-27T00:00:00'));
  });

  it('7 / 30 ngày qua tính cả hôm nay', () => {
    expect(resolveDateRange({ date: '7d' }, now)).toEqual({ start: vn('2026-09-21T00:00:00'), end: vn('2026-09-28T00:00:00') });
    expect(resolveDateRange({ date: '30d' }, now)?.start).toEqual(vn('2026-08-29T00:00:00'));
  });

  it('tháng này / tháng trước, kể cả qua năm', () => {
    expect(resolveDateRange({ date: 'thismonth' }, now)).toEqual({ start: vn('2026-09-01T00:00:00'), end: vn('2026-10-01T00:00:00') });
    expect(resolveDateRange({ date: 'lastmonth' }, now)).toEqual({ start: vn('2026-08-01T00:00:00'), end: vn('2026-09-01T00:00:00') });
    const jan = new Date('2027-01-15T03:00:00Z');
    expect(resolveDateRange({ date: 'lastmonth' }, jan)).toEqual({ start: vn('2026-12-01T00:00:00'), end: vn('2027-01-01T00:00:00') });
  });

  it('chọn một ngày', () => {
    expect(resolveDateRange({ date: 'day', day: '2026-02-28' }, now)).toEqual({ start: vn('2026-02-28T00:00:00'), end: vn('2026-03-01T00:00:00') });
    expect(resolveDateRange({ date: 'day', day: '2026-02-30' }, now)).toBeNull();
    expect(resolveDateRange({ date: 'day', day: '' }, now)).toBeNull();
  });

  it('chọn một tháng', () => {
    expect(resolveDateRange({ date: 'month', month: '2026-12' }, now)).toEqual({ start: vn('2026-12-01T00:00:00'), end: vn('2027-01-01T00:00:00') });
    expect(resolveDateRange({ date: 'month', month: '2026-13' }, now)).toBeNull();
  });

  it('tuỳ chọn: tính trọn hai đầu, tự đổi chỗ, cho phép để trống một đầu', () => {
    expect(resolveDateRange({ date: 'custom', from: '2026-09-01', to: '2026-09-15' }, now)).toEqual({ start: vn('2026-09-01T00:00:00'), end: vn('2026-09-16T00:00:00') });
    expect(resolveDateRange({ date: 'custom', from: '2026-09-15', to: '2026-09-01' }, now)).toEqual({ start: vn('2026-09-01T00:00:00'), end: vn('2026-09-16T00:00:00') });
    expect(resolveDateRange({ date: 'custom', from: '2026-09-10', to: '' }, now)).toEqual({ start: vn('2026-09-10T00:00:00'), end: null });
    expect(resolveDateRange({ date: 'custom', from: 'rác', to: '2026-09-10' }, now)).toEqual({ start: null, end: vn('2026-09-11T00:00:00') });
    expect(resolveDateRange({ date: 'custom', from: '', to: '' }, now)).toBeNull();
  });
});

describe('vnDateString', () => {
  it('trả YYYY-MM-DD theo giờ VN', () => {
    expect(vnDateString(new Date('2026-09-27T16:30:00Z'))).toBe('2026-09-27');
    expect(vnDateString(new Date('2026-09-27T17:30:00Z'))).toBe('2026-09-28');
  });
});
