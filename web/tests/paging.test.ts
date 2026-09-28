import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createNote, listNotesPage, listPostsPage } from '@/lib/notes/notes';
import { getDefaultTag } from '@/lib/notes/tags';
import { pageItems } from '@/lib/pager';
import { createTestDb, type TestDb } from './helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

describe('pageItems', () => {
  it('trang đầu, cuối, hiện tại ±2, dấu …', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(1, 3)).toEqual([1, 2, 3]);
    expect(pageItems(6, 12)).toEqual([1, '…', 4, 5, 6, 7, 8, '…', 12]);
    expect(pageItems(2, 12)).toEqual([1, 2, 3, 4, '…', 12]);
  });
});

describe('listNotesPage (phẳng)', () => {
  it('chia trang theo ghi chú; trang vượt quá → trang cuối', async () => {
    for (let i = 1; i <= 5; i++) await createNote(t.db, { content: `n${i}`, source: 'web', newPost: true });
    const p1 = await listNotesPage(t.db, {}, 1, 2);
    expect(p1).toMatchObject({ page: 1, pageCount: 3, total: 5 });
    expect(p1.notes.map((n) => n.content)).toEqual(['n5', 'n4']);
    const last = await listNotesPage(t.db, {}, 99, 2);
    expect(last.page).toBe(3);
    expect(last.notes.map((n) => n.content)).toEqual(['n1']);
    expect((await listNotesPage(t.db, {}, 1, 50)).pageCount).toBe(1);
  });
});

describe('listPostsPage (nhóm)', () => {
  it('chia trang theo bài, mỗi trang đủ comment của các bài', async () => {
    for (let p = 1; p <= 3; p++) {
      await createNote(t.db, { content: `p${p}`, source: 'web', newPost: true });
      await createNote(t.db, { content: `p${p}c1`, source: 'web' });
    }
    const def = await getDefaultTag(t.db);
    const page1 = await listPostsPage(t.db, { tagId: def.id, sort: 'position' }, 1, 2);
    expect(page1).toMatchObject({ page: 1, pageCount: 2, total: 3 });
    expect(page1.notes.map((n) => n.content)).toEqual(['p1', 'p1c1', 'p2', 'p2c1']);
    const page2 = await listPostsPage(t.db, { tagId: def.id, sort: 'position' }, 5, 2);
    expect(page2.page).toBe(2);
    expect(page2.notes.map((n) => n.content)).toEqual(['p3', 'p3c1']);
  });

  it('tìm kiếm: chỉ nhóm có ghi chú khớp, chỉ hiện ghi chú khớp', async () => {
    await createNote(t.db, { content: 'bài một', source: 'web' });
    await createNote(t.db, { content: 'comment táo', source: 'web' });
    await createNote(t.db, { content: 'bài hai', source: 'web', newPost: true });
    const def = await getDefaultTag(t.db);
    const page = await listPostsPage(t.db, { tagId: def.id, sort: 'position', q: 'tao' }, 1, 20);
    expect(page.total).toBe(1);
    expect(page.notes.map((n) => n.content)).toEqual(['comment táo']);
  });

  it('tag rỗng → 1 trang, không ghi chú', async () => {
    const def = await getDefaultTag(t.db);
    expect(await listPostsPage(t.db, { tagId: def.id }, 1, 20)).toMatchObject({ page: 1, pageCount: 1, total: 0, notes: [] });
  });
});
