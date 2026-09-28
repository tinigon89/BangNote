import { describe, expect, it } from 'vitest';
import type { Tag } from '@/lib/notes/types';
import { extractHashtags } from '@/lib/telegram/hashtags';
import { buildNoteKeyboard, parseCallbackData, savedLabel } from '@/lib/telegram/keyboard';

const DEF: Tag = { id: 1, name: 'Chưa phân loại', color: '#94a3b8', isDefault: true };
const LS: Tag = { id: 2, name: 'Lịch sử', color: '#ef4444', isDefault: false };
const YH: Tag = { id: 3, name: 'Y học', color: '#22c55e', isDefault: false };
const ALL = [DEF, LS, YH];

describe('extractHashtags', () => {
  it('khớp nhiều cách viết và cắt khỏi nội dung', () => {
    expect(extractHashtags('#LichSu Trận Bạch Đằng', ALL)).toEqual({
      content: 'Trận Bạch Đằng',
      tagIds: [2],
      unknown: [],
    });
    expect(extractHashtags('Trận Bạch Đằng #lịch_sử #yhoc', ALL).tagIds).toEqual([2, 3]);
    expect(extractHashtags('abc #LICHSU def', ALL).content).toBe('abc def');
  });

  it('giữ xuống dòng của nội dung', () => {
    expect(extractHashtags('dòng 1\ndòng 2 #YHoc', ALL).content).toBe('dòng 1\ndòng 2');
  });

  it('hashtag lạ giữ nguyên và được báo', () => {
    const r = extractHashtags('ghi chú #xyz #xyz', ALL);
    expect(r).toEqual({ content: 'ghi chú #xyz #xyz', tagIds: [], unknown: ['#xyz'] });
  });

  it('bỏ qua # trong URL', () => {
    const r = extractHashtags('xem https://a.com/#lichsu', ALL);
    expect(r).toEqual({ content: 'xem https://a.com/#lichsu', tagIds: [], unknown: [] });
  });

  it('chỉ toàn hashtag → nội dung rỗng', () => {
    expect(extractHashtags('#LichSu #YHoc', ALL).content).toBe('');
  });

  it('không có hashtag → chỉ trim', () => {
    expect(extractHashtags('  xin chào  ', ALL)).toEqual({ content: 'xin chào', tagIds: [], unknown: [] });
  });
});

describe('buildNoteKeyboard', () => {
  it('3 nút mỗi hàng, đánh dấu tag đang gắn, hàng cuối là Xoá', () => {
    const extra: Tag = { id: 4, name: 'Văn học', color: '#000000', isDefault: false };
    const kb = buildNoteKeyboard(12, [...ALL, extra], [2]);
    expect(kb.inline_keyboard).toEqual([
      [
        { text: 'Chưa phân loại', callback_data: 't:12:1' },
        { text: '✓ Lịch sử', callback_data: 't:12:2' },
        { text: 'Y học', callback_data: 't:12:3' },
      ],
      [{ text: 'Văn học', callback_data: 't:12:4' }],
      [
        { text: '📌 Bài mới', callback_data: 'n:12' },
        { text: '🗑 Xoá', callback_data: 'd:12' },
      ],
    ]);
  });

  it('callback_data luôn ≤ 64 byte', () => {
    const kb = buildNoteKeyboard(2147483647, [{ ...LS, id: 2147483647 }], []);
    for (const row of kb.inline_keyboard) for (const b of row) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
  });
});

describe('parseCallbackData', () => {
  it('đọc toggle và delete, từ chối dữ liệu lạ', () => {
    expect(parseCallbackData('t:5:2')).toEqual({ kind: 'toggle', noteId: 5, tagId: 2 });
    expect(parseCallbackData('d:5')).toEqual({ kind: 'delete', noteId: 5 });
    expect(parseCallbackData('n:5')).toEqual({ kind: 'newpost', noteId: 5 });
    expect(parseCallbackData('x:5')).toBeNull();
    expect(parseCallbackData('t:5')).toBeNull();
    expect(parseCallbackData('')).toBeNull();
  });
});

describe('savedLabel', () => {
  it('Tag #n', () => {
    expect(savedLabel('Temp', 3)).toBe('Temp #3');
    expect(savedLabel('Temp', 5, 3)).toBe('Temp #5.3');
  });
});
