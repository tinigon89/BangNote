import { describe, expect, it } from 'vitest';
import { ReorderSession } from '@/lib/reorder';

describe('ReorderSession (kéo sắp xếp)', () => {
  it('nửa trên thẻ đích → chèn trước, nửa dưới → chèn sau', () => {
    expect(new ReorderSession([1, 2, 3, 4], 1).over(3, false)).toEqual([2, 1, 3, 4]);
    expect(new ReorderSession([1, 2, 3, 4], 1).over(3, true)).toEqual([2, 3, 1, 4]);
    expect(new ReorderSession([1, 2, 3, 4], 4).over(2, false)).toEqual([1, 4, 2, 3]);
  });

  it('ổn định: cùng vị trí con trỏ trên thẻ cao không đổi qua lại', () => {
    // thẻ ngắn 1 kéo xuống nửa trên của thẻ cao 2 → vẫn đứng trước 2; gọi lại nhiều lần không lật
    const s = new ReorderSession([1, 2, 3], 1);
    expect(s.over(2, false)).toEqual([1, 2, 3]);
    expect(s.over(2, false)).toEqual([1, 2, 3]);
    expect(s.over(2, true)).toEqual([2, 1, 3]);
    expect(s.over(2, true)).toEqual([2, 1, 3]);
  });

  it('thứ tự đọc được ngay (đồng bộ), finish trả thứ tự mới hoặc null nếu không đổi', () => {
    const s = new ReorderSession([1, 2, 3], 3);
    s.over(1, false);
    expect(s.current).toEqual([3, 1, 2]);
    expect(s.finish()).toEqual([3, 1, 2]);
    const unchanged = new ReorderSession([1, 2, 3], 2);
    unchanged.over(3, false);
    expect(unchanged.finish()).toBeNull();
  });

  it('con trỏ trên chính thẻ đang kéo hoặc id lạ → giữ nguyên', () => {
    const s = new ReorderSession([1, 2, 3], 2);
    expect(s.over(2, true)).toEqual([1, 2, 3]);
    expect(s.over(99, true)).toEqual([1, 2, 3]);
  });
});
