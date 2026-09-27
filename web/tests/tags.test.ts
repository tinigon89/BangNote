import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '@/lib/notes/errors';
import {
  createTag,
  deleteTag,
  getDefaultTag,
  getTagsForNotes,
  listTags,
  listTagsWithCounts,
  setNoteTags,
  updateTag,
} from '@/lib/notes/tags';
import { insertNote, noteTagNames } from './helpers/fixtures';
import { createTestDb, type TestDb } from './helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const DEFAULT = 'Chưa phân loại';

describe('listTags', () => {
  it('tag mặc định đứng đầu, còn lại theo tên', async () => {
    await createTag(t.db, { name: 'Y học' });
    await createTag(t.db, { name: 'Lịch sử' });
    expect((await listTags(t.db)).map((x) => x.name)).toEqual([DEFAULT, 'Lịch sử', 'Y học']);
  });
});

describe('createTag', () => {
  it('trim, gộp khoảng trắng và tự chọn màu', async () => {
    const tag = await createTag(t.db, { name: '  Lịch   sử ' });
    expect(tag.name).toBe('Lịch sử');
    expect(tag.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(tag.isDefault).toBe(false);
  });

  it('từ chối tên trùng khác dấu / hoa thường', async () => {
    await createTag(t.db, { name: 'Lịch sử' });
    await expect(createTag(t.db, { name: 'lich SU' })).rejects.toMatchObject({ code: 'conflict' });
    await expect(createTag(t.db, { name: 'chua phan loai' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('từ chối tên rỗng, quá dài, màu sai', async () => {
    await expect(createTag(t.db, { name: '   ' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createTag(t.db, { name: 'a'.repeat(51) })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createTag(t.db, { name: 'X', color: 'red' })).rejects.toBeInstanceOf(DomainError);
  });
});

describe('updateTag', () => {
  it('đổi tên và màu, kể cả tag mặc định', async () => {
    const def = await getDefaultTag(t.db);
    const renamed = await updateTag(t.db, def.id, { name: 'Inbox', color: '#123abc' });
    expect(renamed).toMatchObject({ name: 'Inbox', color: '#123abc', isDefault: true });
  });

  it('cho phép đổi hoa thường của chính nó, chặn trùng tag khác', async () => {
    const a = await createTag(t.db, { name: 'Lịch sử' });
    await createTag(t.db, { name: 'Y học' });
    expect((await updateTag(t.db, a.id, { name: 'LỊCH SỬ' })).name).toBe('LỊCH SỬ');
    await expect(updateTag(t.db, a.id, { name: 'y hoc' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('không tìm thấy → not_found', async () => {
    await expect(updateTag(t.db, 9999, { name: 'X' })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('setNoteTags', () => {
  it('danh sách rỗng → chỉ tag mặc định', async () => {
    const id = await insertNote(t.db);
    const result = await setNoteTags(t.db, id, []);
    expect(result.map((x) => x.name)).toEqual([DEFAULT]);
    expect(await noteTagNames(t.db, id)).toEqual([DEFAULT]);
  });

  it('có tag thật → bỏ tag mặc định', async () => {
    const id = await insertNote(t.db);
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const def = await getDefaultTag(t.db);
    await setNoteTags(t.db, id, []);
    await setNoteTags(t.db, id, [def.id, ls.id, ls.id]);
    expect(await noteTagNames(t.db, id)).toEqual(['Lịch sử']);
  });

  it('id không tồn tại bị bỏ qua; toàn id lạ → tag mặc định', async () => {
    const id = await insertNote(t.db);
    const yh = await createTag(t.db, { name: 'Y học' });
    await setNoteTags(t.db, id, [yh.id, 9999]);
    expect(await noteTagNames(t.db, id)).toEqual(['Y học']);
    await setNoteTags(t.db, id, [9999]);
    expect(await noteTagNames(t.db, id)).toEqual([DEFAULT]);
  });

  it('note không tồn tại → not_found', async () => {
    await expect(setNoteTags(t.db, 9999, [])).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('deleteTag', () => {
  it('không xoá được tag mặc định', async () => {
    const def = await getDefaultTag(t.db);
    await expect(deleteTag(t.db, def.id)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('note mất hết tag → về tag mặc định; note còn tag khác giữ nguyên', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const yh = await createTag(t.db, { name: 'Y học' });
    const onlyLs = await insertNote(t.db, 'a');
    const both = await insertNote(t.db, 'b');
    await setNoteTags(t.db, onlyLs, [ls.id]);
    await setNoteTags(t.db, both, [ls.id, yh.id]);

    await deleteTag(t.db, ls.id);

    expect(await noteTagNames(t.db, onlyLs)).toEqual([DEFAULT]);
    expect(await noteTagNames(t.db, both)).toEqual(['Y học']);
  });

  it('không tìm thấy → not_found', async () => {
    await expect(deleteTag(t.db, 9999)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('listTagsWithCounts & getTagsForNotes', () => {
  it('đếm note theo tag và gom tag theo note', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await insertNote(t.db, 'a');
    const b = await insertNote(t.db, 'b');
    await setNoteTags(t.db, a, [ls.id]);
    await setNoteTags(t.db, b, []);

    const counts = await listTagsWithCounts(t.db);
    expect(counts.map((c) => [c.name, c.noteCount])).toEqual([
      [DEFAULT, 1],
      ['Lịch sử', 1],
    ]);

    const map = await getTagsForNotes(t.db, [a, b, 9999]);
    expect(map.get(a)?.map((x) => x.name)).toEqual(['Lịch sử']);
    expect(map.get(b)?.map((x) => x.name)).toEqual([DEFAULT]);
    expect(map.get(9999)).toEqual([]);
  });
});
