import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createNote,
  deleteNotes,
  getNote,
  listNotes,
  setTagsForNotes,
  updateNoteContent,
} from '@/lib/notes/notes';
import { createTag, getDefaultTag } from '@/lib/notes/tags';
import { createTestDb, type TestDb } from './helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const names = (n: { tags: { name: string }[] }) => n.tags.map((x) => x.name);

describe('createNote', () => {
  it('trim nội dung, lưu nguồn, gắn tag mặc định khi không có tag', async () => {
    const note = await createNote(t.db, {
      content: '  Trận Bạch Đằng 938  ',
      source: 'extension',
      sourceUrl: 'https://vi.wikipedia.org/x',
      sourceTitle: 'Wiki',
    });
    expect(note).toMatchObject({
      content: 'Trận Bạch Đằng 938',
      source: 'extension',
      sourceUrl: 'https://vi.wikipedia.org/x',
      sourceTitle: 'Wiki',
    });
    expect(names(note)).toEqual(['Chưa phân loại']);
    expect(note.createdAt).toBeInstanceOf(Date);
  });

  it('gắn tag được truyền vào', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const note = await createNote(t.db, { content: 'x', source: 'web', tagIds: [ls.id] });
    expect(names(note)).toEqual(['Lịch sử']);
  });

  it('từ chối nội dung rỗng hoặc quá 20000 ký tự', async () => {
    await expect(createNote(t.db, { content: ' \n\t ', source: 'web' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createNote(t.db, { content: 'a'.repeat(20001), source: 'web' })).rejects.toMatchObject({
      code: 'invalid',
    });
    expect((await createNote(t.db, { content: 'a'.repeat(20000), source: 'web' })).content).toHaveLength(20000);
  });
});

describe('listNotes', () => {
  it('mới nhất trước', async () => {
    await createNote(t.db, { content: 'một', source: 'web' });
    await createNote(t.db, { content: 'hai', source: 'web' });
    expect((await listNotes(t.db)).notes.map((n) => n.content)).toEqual(['hai', 'một']);
  });

  it('tìm không dấu, không phân biệt hoa thường', async () => {
    await createNote(t.db, { content: 'Lịch sử Việt Nam', source: 'web' });
    await createNote(t.db, { content: 'Y học cổ truyền', source: 'web' });
    expect((await listNotes(t.db, { q: 'lich su' })).notes.map((n) => n.content)).toEqual(['Lịch sử Việt Nam']);
    expect((await listNotes(t.db, { q: 'CỔ TRUYỀN' })).notes).toHaveLength(1);
    expect((await listNotes(t.db, { q: '   ' })).notes).toHaveLength(2);
  });

  it('% và _ trong từ khoá là ký tự thường', async () => {
    await createNote(t.db, { content: '100% đúng', source: 'web' });
    await createNote(t.db, { content: '1000 đúng', source: 'web' });
    await createNote(t.db, { content: 'a_b', source: 'web' });
    await createNote(t.db, { content: 'axb', source: 'web' });
    expect((await listNotes(t.db, { q: '0%' })).notes.map((n) => n.content)).toEqual(['100% đúng']);
    expect((await listNotes(t.db, { q: 'a_b' })).notes.map((n) => n.content)).toEqual(['a_b']);
  });

  it('lọc nhiều tag theo OR, lọc được tag mặc định', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const yh = await createTag(t.db, { name: 'Y học' });
    const vh = await createTag(t.db, { name: 'Văn học' });
    await createNote(t.db, { content: 'A', source: 'web', tagIds: [ls.id] });
    await createNote(t.db, { content: 'B', source: 'web', tagIds: [yh.id] });
    await createNote(t.db, { content: 'C', source: 'web', tagIds: [vh.id] });
    await createNote(t.db, { content: 'D', source: 'web' });
    const def = await getDefaultTag(t.db);

    expect((await listNotes(t.db, { tagIds: [ls.id, yh.id] })).notes.map((n) => n.content)).toEqual(['B', 'A']);
    expect((await listNotes(t.db, { tagIds: [def.id] })).notes.map((n) => n.content)).toEqual(['D']);
  });

  it('lọc theo nguồn', async () => {
    await createNote(t.db, { content: 'tg', source: 'telegram' });
    await createNote(t.db, { content: 'wg', source: 'widget' });
    await createNote(t.db, { content: 'wb', source: 'web' });
    expect((await listNotes(t.db, { sources: ['telegram', 'widget'] })).notes.map((n) => n.content)).toEqual([
      'wg',
      'tg',
    ]);
  });

  it('limit và hasMore', async () => {
    for (let i = 1; i <= 3; i++) await createNote(t.db, { content: `n${i}`, source: 'web' });
    const page = await listNotes(t.db, { limit: 2 });
    expect(page.notes.map((n) => n.content)).toEqual(['n3', 'n2']);
    expect(page.hasMore).toBe(true);
    expect((await listNotes(t.db, { limit: 3 })).hasMore).toBe(false);
  });
});

describe('getNote / updateNoteContent / deleteNotes / setTagsForNotes', () => {
  it('getNote trả null khi không có', async () => {
    expect(await getNote(t.db, 9999)).toBeNull();
  });

  it('sửa nội dung, trim, kiểm tra rỗng và not_found', async () => {
    const note = await createNote(t.db, { content: 'cũ', source: 'web' });
    expect((await updateNoteContent(t.db, note.id, '  mới ')).content).toBe('mới');
    await expect(updateNoteContent(t.db, note.id, '  ')).rejects.toMatchObject({ code: 'invalid' });
    await expect(updateNoteContent(t.db, 9999, 'x')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('xoá nhiều note, trả số note đã xoá', async () => {
    const a = await createNote(t.db, { content: 'a', source: 'web' });
    const b = await createNote(t.db, { content: 'b', source: 'web' });
    expect(await deleteNotes(t.db, [a.id, b.id, 9999])).toBe(2);
    expect(await deleteNotes(t.db, [])).toBe(0);
    expect((await listNotes(t.db)).notes).toHaveLength(0);
  });

  it('gắn tag hàng loạt', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await createNote(t.db, { content: 'a', source: 'web' });
    const b = await createNote(t.db, { content: 'b', source: 'web' });
    await setTagsForNotes(t.db, [a.id, b.id], [ls.id]);
    expect(names((await getNote(t.db, a.id))!)).toEqual(['Lịch sử']);
    expect(names((await getNote(t.db, b.id))!)).toEqual(['Lịch sử']);
  });
});
