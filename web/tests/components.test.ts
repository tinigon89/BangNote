import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));

import { Filters } from '@/components/Filters';
import { NoteList } from '@/components/NoteList';
import { QuickAdd } from '@/components/QuickAdd';
import type { Note, Tag } from '@/lib/notes/types';

const DEF: Tag = { id: 1, name: 'Chưa phân loại', color: '#94a3b8', isDefault: true };
const LS: Tag = { id: 2, name: 'Lịch sử', color: '#ef4444', isDefault: false };
const note: Note = {
  id: 7,
  content: 'Trận Bạch Đằng\nnăm 938',
  source: 'extension',
  sourceUrl: 'https://vi.wikipedia.org/x',
  sourceTitle: 'Wiki',
  createdAt: new Date(Date.now() - 5 * 60_000),
  updatedAt: new Date(),
  tags: [LS],
};

describe('render phía server của trang ghi chú', () => {
  it('danh sách hiện nội dung, tag, nguồn, link', () => {
    const html = renderToString(createElement(NoteList, { notes: [note], tags: [DEF, LS] })).replaceAll('<!-- -->', '');
    expect(html).toContain('Trận Bạch Đằng');
    expect(html).toContain('Lịch sử');
    expect(html).toContain('#7 · Extension');
    expect(html).toContain('href="https://vi.wikipedia.org/x"');
    expect(html).toContain('5 phút trước');
  });

  it('danh sách rỗng', () => {
    expect(renderToString(createElement(NoteList, { notes: [], tags: [DEF] }))).toContain('Không có ghi chú nào');
  });

  it('bộ lọc giữ trạng thái đã chọn; thêm nhanh chỉ hiện tag thật', () => {
    const filters = renderToString(
      createElement(Filters, { tags: [DEF, LS], filters: { q: 'lich', tagIds: [2], sources: ['web'], limit: 50 } }),
    );
    expect(filters).toContain('value="lich"');
    expect(filters).toMatch(/value="2"[^>]*checked|checked[^>]*value="2"/);
    const quick = renderToString(createElement(QuickAdd, { tags: [DEF, LS] }));
    expect(quick).toContain('Lịch sử');
    expect(quick).not.toContain('Chưa phân loại');
  });
});
