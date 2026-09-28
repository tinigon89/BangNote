import { describe, expect, it } from 'vitest';
import { applyRange } from '@/lib/selection';

const ids = [10, 11, 12, 13, 14];
const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);

describe('applyRange (kéo chọn / Shift+click)', () => {
  it('kéo xuống chọn cả đoạn từ thẻ bắt đầu tới thẻ hiện tại', () => {
    expect(sorted(applyRange(ids, new Set(), 11, 13, true))).toEqual([11, 12, 13]);
  });

  it('kéo lên cũng được', () => {
    expect(sorted(applyRange(ids, new Set(), 13, 11, true))).toEqual([11, 12, 13]);
  });

  it('kéo lùi lại thì các thẻ ra khỏi đoạn trở về trạng thái lúc bắt đầu kéo', () => {
    const base = new Set([14]);
    expect(sorted(applyRange(ids, base, 11, 12, true))).toEqual([11, 12, 14]);
  });

  it('chế độ bỏ chọn', () => {
    expect(sorted(applyRange(ids, new Set(ids), 12, 14, false))).toEqual([10, 11]);
  });

  it('không đổi tập ban đầu; id lạ → giữ nguyên', () => {
    const base = new Set([10]);
    applyRange(ids, base, 11, 13, true);
    expect(sorted(base)).toEqual([10]);
    expect(sorted(applyRange(ids, base, 99, 13, true))).toEqual([10]);
  });
});
