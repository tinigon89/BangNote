import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));

import { Filters } from '@/components/Filters';
import { NoteList } from '@/components/NoteList';
import { Pager } from '@/components/Pager';
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
  position: 3,
  sub: 0,
};

describe('render phía server của trang ghi chú', () => {
  it('lọc 1 tag + sort theo số → có nút Đánh số lại và tay nắm kéo', () => {
    const html = renderToString(
      createElement(NoteList, { notes: [note], tags: [DEF, LS], exportQuery: 'tag=2', singleTag: LS, reorderable: true, grouped: false, sort: 'newest', postsOnly: false, hasPrevPage: false, initialCollapsed: [] }),
    );
    expect(html).toContain('Đánh số lại');
    expect(html).toContain('⠿');
  });

  it('thêm nhanh: chọn 1 tag bằng radio, mặc định Chưa phân loại', () => {
    const quick = renderToString(createElement(QuickAdd, { tags: [DEF, LS] }));
    expect(quick.match(/type="radio"/g)).toHaveLength(2);
    expect(quick).toMatch(/checked=""[^>]*value="1"|value="1"[^>]*checked=""/);
  });

  it('danh sách hiện nội dung, tag, nguồn, link', () => {
    const html = renderToString(createElement(NoteList, { notes: [note], tags: [DEF, LS], exportQuery: 'tag=2', singleTag: null, reorderable: false, grouped: false, sort: 'newest', postsOnly: false, hasPrevPage: false, initialCollapsed: [] })).replaceAll('<!-- -->', '');
    expect(html).toContain('Trận Bạch Đằng');
    expect(html).toContain('Lịch sử');
    expect(html).toContain('Lịch sử #3');
    expect(html).toContain('Extension');
    expect(html).not.toContain('#7');
    expect(html).not.toContain('Đánh số lại');
    expect(html).not.toContain('⠿');
    expect(html).toContain('href="https://vi.wikipedia.org/x"');
    expect(html).toContain('5 phút trước');
    expect(html).toContain('href="/api/export?format=txt&amp;tag=2"');
    expect(html).toContain('href="/api/export?format=docx&amp;tag=2"');
    expect(html).toContain('data-note-id="7"');
    expect(html).toContain('Kèm tag, ngày giờ, link');
    expect(html).toContain('Kèm số #');
  });

  it('danh sách rỗng', () => {
    expect(renderToString(createElement(NoteList, { notes: [], tags: [DEF], exportQuery: '', singleTag: null, reorderable: false, grouped: false, sort: 'newest', postsOnly: false, hasPrevPage: false, initialCollapsed: [] }))).toContain('Không có ghi chú nào');
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

describe('ô sắp xếp trong bộ lọc', () => {
  it('lọc 1 tag → có ô "Chỉ hiện bài viết"', () => {
    const html = renderToString(createElement(Filters, { tags: [DEF, LS], filters: { ...EMPTY_FILTERS, tagIds: [2], sort: 'position' } }));
    expect(html).toContain('name="posts"');
  });

  const html = (f: Partial<typeof EMPTY_FILTERS>) =>
    renderToString(createElement(Filters, { tags: [DEF, LS], filters: { ...EMPTY_FILTERS, ...f } }));

  it('sort đang bằng mặc định → chọn "Mặc định" (không ép sort lên URL khi bấm Lọc)', () => {
    expect(html({ tagIds: [2], sort: 'position' })).toMatch(/<option value="" selected="">Mặc định/);
    expect(html({})).toMatch(/<option value="" selected="">Mặc định/);
  });

  it('sort khác mặc định → giữ lựa chọn đó', () => {
    expect(html({ tagIds: [2], sort: 'newest' })).toMatch(/<option value="newest" selected="">/);
  });
});

describe('chế độ nhóm & phân trang', () => {
  const p = { ...note, id: 20, position: 4, sub: 0, content: 'Nội dung bài' };
  const c1 = { ...note, id: 21, position: 4, sub: 1, content: 'Comment một' };
  const c2 = { ...note, id: 22, position: 4, sub: 2, content: 'Comment hai' };
  const render = (postsOnly: boolean) =>
    renderToString(
      createElement(NoteList, {
        notes: [p, c1, c2], tags: [DEF, LS], exportQuery: 'tag=2', singleTag: LS, reorderable: true,
        grouped: true, sort: 'position', postsOnly, hasPrevPage: true, initialCollapsed: [],
      }),
    ).replaceAll('<!-- -->', '');

  it('bài + comment thụt vào, số #4 / #4.1, nút 📌 trên comment, ↳ trên bài', () => {
    const html = render(false);
    expect(html).toContain('data-group-lead="20"');
    expect(html).toContain('Lịch sử #4');
    expect(html).toContain('Lịch sử #4.2');
    expect(html).toContain('Comment hai');
    expect(html.match(/📌 Bài mới/g)).toHaveLength(2);
    expect(html).toContain('↳ Gộp vào bài trước');
  });

  it('"Chỉ hiện bài viết" → ẩn comment, hiện số comment', () => {
    const html = render(true);
    expect(html).toContain('Nội dung bài');
    expect(html).not.toContain('Comment hai');
    expect(html).toContain('▸ 2 comment');
  });

  it('Pager: link giữ bộ lọc, đánh dấu trang hiện tại; 1 trang → không hiện', () => {
    const html = renderToString(createElement(Pager, { page: 2, pageCount: 3, hrefFor: (n: number) => `/?tag=2&page=${n}` }));
    expect(html).toContain('href="/?tag=2&amp;page=3"');
    expect(html).toContain('aria-current="page"');
    expect(renderToString(createElement(Pager, { page: 1, pageCount: 1, hrefFor: () => '/' }))).toBe('');
  });
});

describe('↳, thu gọn từ cookie, ô "Chỉ hiện bài viết"', () => {
  const g1 = [{ ...note, id: 30, position: 1, sub: 0, content: 'B1' }, { ...note, id: 31, position: 1, sub: 1, content: 'B1c' }];
  const g2 = [{ ...note, id: 40, position: 2, sub: 0, content: 'B2' }];
  const headless = [{ ...note, id: 50, position: 3, sub: 2, content: 'Mồ côi' }];
  const render = (extra: Record<string, unknown>) =>
    renderToString(
      createElement(NoteList, {
        notes: [...g1, ...g2, ...headless], tags: [DEF, LS], exportQuery: '', singleTag: LS, reorderable: true,
        grouped: true, sort: 'position', postsOnly: false, hasPrevPage: false, initialCollapsed: [], ...extra,
      }),
    ).replaceAll('<!-- -->', '');

  it('↳ chỉ trên bài có bài phía trước (và đầu nhóm mất bài); trang sau thì bài đầu cũng có', () => {
    expect(render({}).match(/↳ Gộp vào bài trước/g)).toHaveLength(2);
    expect(render({ hasPrevPage: true }).match(/↳ Gộp vào bài trước/g)).toHaveLength(3);
  });

  it('trạng thái thu gọn lấy từ server (cookie) nên không nháy khi tải trang', () => {
    const html = render({ initialCollapsed: [30] });
    expect(html).toContain('▸ 1 comment');
    expect(html).not.toContain('B1c');
  });

  it('ô "Chỉ hiện bài viết" chỉ hiện khi đang xem theo nhóm', () => {
    const f = (sort: 'position' | 'newest') =>
      renderToString(createElement(Filters, { tags: [DEF, LS], filters: { ...EMPTY_FILTERS, tagIds: [2], sort } }));
    expect(f('position')).toContain('name="posts"');
    expect(f('newest')).not.toContain('name="posts"');
  });
});
