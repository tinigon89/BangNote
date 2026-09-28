import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '@/lib/notes/errors';
import {
  createTag,
  deleteTag,
  getDefaultTag,
  listTags,
  listTagsWithCounts,
  moveNote,
  nextPosition,
  pickTagId,
  renumberTag,
  updateTag,
} from '@/lib/notes/tags';
import { insertNote, noteTag } from './helpers/fixtures';
import { createTestDb, type TestDb } from './helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const DEFAULT = 'Chưa phân loại';

describe('listTags / createTag / updateTag', () => {
  it('tag mặc định đứng đầu, còn lại theo tên', async () => {
    await createTag(t.db, { name: 'Y học' });
    await createTag(t.db, { name: 'Lịch sử' });
    expect((await listTags(t.db)).map((x) => x.name)).toEqual([DEFAULT, 'Lịch sử', 'Y học']);
  });

  it('trim, tự chọn màu, chặn trùng khác dấu, chặn rỗng/dài/màu sai', async () => {
    const tag = await createTag(t.db, { name: '  Lịch   sử ' });
    expect(tag).toMatchObject({ name: 'Lịch sử', isDefault: false });
    await expect(createTag(t.db, { name: 'lich SU' })).rejects.toMatchObject({ code: 'conflict' });
    await expect(createTag(t.db, { name: '   ' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createTag(t.db, { name: 'a'.repeat(51) })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createTag(t.db, { name: 'X', color: 'red' })).rejects.toBeInstanceOf(DomainError);
  });

  it('đổi tên/màu kể cả tag mặc định; not_found', async () => {
    const def = await getDefaultTag(t.db);
    expect(await updateTag(t.db, def.id, { name: 'Inbox', color: '#123abc' })).toMatchObject({ name: 'Inbox', isDefault: true });
    await expect(updateTag(t.db, 9999, { name: 'X' })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('pickTagId', () => {
  it('lấy tag thật đầu tiên còn tồn tại theo thứ tự truyền vào', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const yh = await createTag(t.db, { name: 'Y học' });
    const def = await getDefaultTag(t.db);
    expect(await pickTagId(t.db, [9999, yh.id, ls.id])).toBe(yh.id);
    expect(await pickTagId(t.db, [def.id, ls.id])).toBe(ls.id);
    expect(await pickTagId(t.db, [def.id, 9999])).toBeNull();
    expect(await pickTagId(t.db, [])).toBeNull();
  });
});

describe('nextPosition / moveNote', () => {
  it('số mới = max + 1; tag rỗng bắt đầu từ 1 (kể cả sau khi xoá hết)', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    expect(await nextPosition(t.db, ls.id)).toBe(1);
    await insertNote(t.db, 'a', ls.id);
    await insertNote(t.db, 'b', ls.id);
    expect(await nextPosition(t.db, ls.id)).toBe(3);
    await t.pg.query('DELETE FROM notes WHERE tag_id = $1', [ls.id]);
    expect(await nextPosition(t.db, ls.id)).toBe(1);
  });

  it('chuyển sang tag khác → nối cuối tag mới; số cũ để trống', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await insertNote(t.db, 'a');
    const b = await insertNote(t.db, 'b');
    await insertNote(t.db, 'x', ls.id);
    expect(await moveNote(t.db, a, ls.id)).toMatchObject({ tag: { name: 'Lịch sử' }, position: 2 });
    expect(await noteTag(t.db, b)).toEqual({ name: DEFAULT, position: 2 });
  });

  it('chuyển vào chính tag đang ở → không đổi số', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    await insertNote(t.db, 'x', ls.id);
    const a = await insertNote(t.db, 'a', ls.id);
    expect((await moveNote(t.db, a, ls.id)).position).toBe(2);
    expect(await noteTag(t.db, a)).toEqual({ name: 'Lịch sử', position: 2 });
  });

  it('null / id lạ → tag mặc định; ghi chú không tồn tại → not_found', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await insertNote(t.db, 'a', ls.id);
    expect((await moveNote(t.db, a, 9999)).tag.name).toBe(DEFAULT);
    await moveNote(t.db, a, ls.id);
    expect((await moveNote(t.db, a, null)).tag.name).toBe(DEFAULT);
    await expect(moveNote(t.db, 9999, null)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('renumberTag', () => {
  it('gán 1…n theo thứ tự truyền vào, sửa được số trùng', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await insertNote(t.db, 'a', ls.id);
    const b = await insertNote(t.db, 'b', ls.id);
    const c = await insertNote(t.db, 'c', ls.id);
    await t.pg.query('UPDATE notes SET position = 1 WHERE tag_id = $1', [ls.id]);
    await renumberTag(t.db, ls.id, [c, a, b]);
    expect([await noteTag(t.db, c), await noteTag(t.db, a), await noteTag(t.db, b)].map((x) => x.position)).toEqual([1, 2, 3]);
  });

  it('ghi chú của tag không có trong danh sách → đánh tiếp theo số cũ', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await insertNote(t.db, 'a', ls.id); // 1
    const b = await insertNote(t.db, 'b', ls.id); // 2
    const c = await insertNote(t.db, 'c', ls.id); // 3
    const d = await insertNote(t.db, 'd', ls.id); // 4
    await renumberTag(t.db, ls.id, [d, b]);
    expect((await noteTag(t.db, d)).position).toBe(1);
    expect((await noteTag(t.db, b)).position).toBe(2);
    expect((await noteTag(t.db, a)).position).toBe(3);
    expect((await noteTag(t.db, c)).position).toBe(4);
  });

  it('id không thuộc tag → invalid, không đổi gì', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await insertNote(t.db, 'a', ls.id);
    const other = await insertNote(t.db, 'o');
    await expect(renumberTag(t.db, ls.id, [other, a])).rejects.toMatchObject({ code: 'invalid' });
    expect((await noteTag(t.db, a)).position).toBe(1);
  });
});

describe('deleteTag / listTagsWithCounts', () => {
  it('không xoá được tag mặc định; not_found', async () => {
    const def = await getDefaultTag(t.db);
    await expect(deleteTag(t.db, def.id)).rejects.toMatchObject({ code: 'invalid' });
    await expect(deleteTag(t.db, 9999)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('ghi chú của tag bị xoá chuyển về tag mặc định, nối cuối theo số cũ', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    await insertNote(t.db, 'x'); // mặc định #1
    const b = await insertNote(t.db, 'b', ls.id); // LS #1
    const a = await insertNote(t.db, 'a', ls.id); // LS #2
    await deleteTag(t.db, ls.id);
    expect(await noteTag(t.db, b)).toEqual({ name: DEFAULT, position: 2 });
    expect(await noteTag(t.db, a)).toEqual({ name: DEFAULT, position: 3 });
  });

  it('đếm ghi chú theo tag', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    await insertNote(t.db, 'a', ls.id);
    await insertNote(t.db, 'b');
    await insertNote(t.db, 'c');
    expect((await listTagsWithCounts(t.db)).map((c) => [c.name, c.noteCount])).toEqual([
      [DEFAULT, 2],
      ['Lịch sử', 1],
    ]);
  });
});
