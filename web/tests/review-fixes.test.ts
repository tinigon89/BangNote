import { describe, expect, it } from 'vitest';
import { splitNeedsConfirm } from '@/lib/groups';
import { noteIdsInput } from '@/lib/notes/validation';

describe('📌 hỏi xác nhận', () => {
  it('không biết bao nhiêu ghi chú bị đổi (chế độ phẳng / đang lọc) → luôn hỏi', () => {
    expect(splitNeedsConfirm(undefined)).toBe(true);
  });
  it('biết chính xác: chỉ hỏi khi > 1', () => {
    expect(splitNeedsConfirm(1)).toBe(false);
    expect(splitNeedsConfirm(3)).toBe(true);
  });
});

describe('danh sách id cho thao tác hàng loạt', () => {
  it('nhận cả trang nhóm lớn (20 bài × nhiều comment)', () => {
    const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
    expect(noteIdsInput.parse(ids)).toHaveLength(1200);
  });
  it('vẫn chặn id sai và danh sách quá lớn', () => {
    expect(() => noteIdsInput.parse([0])).toThrow();
    expect(() => noteIdsInput.parse(Array.from({ length: 5001 }, (_, i) => i + 1))).toThrow();
  });
});
