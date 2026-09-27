import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));

import { Filters } from '@/components/Filters';
import { NoteList } from '@/components/NoteList';
import { QuickAdd } from '@/components/QuickAdd';
import { EMPTY_FILTERS } from '@/lib/notes/filters';
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
    const html = renderToString(createElement(NoteList, { notes: [note], tags: [DEF, LS], exportQuery: 'tag=2' })).replaceAll('<!-- -->', '');
    expect(html).toContain('Trận Bạch Đằng');
    expect(html).toContain('Lịch sử');
    expect(html).toContain('#7 · Extension');
    expect(html).toContain('href="https://vi.wikipedia.org/x"');
    expect(html).toContain('5 phút trước');
    expect(html).toContain('href="/api/export?format=txt&amp;tag=2"');
    expect(html).toContain('href="/api/export?format=docx&amp;tag=2"');
    expect(html).toContain('data-note-id="7"');
  });

  it('danh sách rỗng', () => {
    expect(renderToString(createElement(NoteList, { notes: [], tags: [DEF], exportQuery: '' }))).toContain('Không có ghi chú nào');
  });

  it('bộ lọc giữ trạng thái đã chọn; thêm nhanh chỉ hiện tag thật', () => {
    const filters = renderToString(
      createElement(Filters, { tags: [DEF, LS], filters: { ...EMPTY_FILTERS, q: 'lich', tagIds: [2], sources: ['web'] } }),
    );
    expect(filters).toContain('value="lich"');
    expect(filters).toContain('name="sort"');
    expect(filters).toContain('name="date"');
    expect(filters).toMatch(/value="2"[^>]*checked|checked[^>]*value="2"/);
    const quick = renderToString(createElement(QuickAdd, { tags: [DEF, LS] }));
    expect(quick).toContain('Lịch sử');
    expect(quick).not.toContain('Chưa phân loại');
  });
});

import { TagTable } from '@/components/TagTable';

describe('render trang Tag', () => {
  it('tag mặc định không có nút Xoá, tag thường có; hiện số ghi chú', () => {
    const html = renderToString(
      createElement(TagTable, {
        tags: [
          { ...DEF, noteCount: 3 },
          { ...LS, noteCount: 1 },
        ],
        colors: ['#94a3b8', '#ef4444'],
      }),
    ).replaceAll('<!-- -->', '');
    expect(html).toContain('mặc định');
    expect(html).toContain('3 ghi chú');
    expect(html.match(/>Xoá</g)).toHaveLength(1);
  });
});
