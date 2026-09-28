import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { formatNumber } from '@/lib/notes/number';
import { createNote, getNote } from '@/lib/notes/notes';
import { dropNote, mergeIntoPrevious, moveNote, moveNotes, renumberTag, splitPost } from '@/lib/notes/posts';
import { createTag, deleteTag, getDefaultTag } from '@/lib/notes/tags';
import { createTestDb, type TestDb } from './helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const add = (content: string, extra: Record<string, unknown> = {}) => createNote(t.db, { content, source: 'web', ...extra });
const num = async (id: number) => {
  const n = (await getNote(t.db, id))!;
  return `${n.tags[0].name} #${formatNumber(n.position, n.sub)}`;
};
const nums = (ids: number[]) => Promise.all(ids.map(num));
const DEF = 'Chưa phân loại';

/** Bài #1 (p1) với c1, c2, c3; bài #2 (p2) với d1. */
async function seed() {
  const p1 = await add('p1');
  const c1 = await add('c1');
  const c2 = await add('c2');
  const c3 = await add('c3');
  const p2 = await add('p2', { newPost: true });
  const d1 = await add('d1');
  return { p1: p1.id, c1: c1.id, c2: c2.id, c3: c3.id, p2: p2.id, d1: d1.id };
}

describe('splitPost (📌 Bài mới)', () => {
  it('tách comment và các comment sau nó thành bài mới cuối tag', async () => {
    const s = await seed();
    expect(await splitPost(t.db, s.c2)).toMatchObject({ position: 3, sub: 0 });
    expect(await nums([s.c1, s.c2, s.c3, s.d1])).toEqual([`${DEF} #1.1`, `${DEF} #3`, `${DEF} #3.1`, `${DEF} #2.1`]);
  });

  it('ghi chú đã là bài → không đổi', async () => {
    const s = await seed();
    expect(await splitPost(t.db, s.p2)).toMatchObject({ position: 2, sub: 0 });
    expect(await num(s.d1)).toBe(`${DEF} #2.1`);
  });
});

describe('mergeIntoPrevious (↳ Gộp vào bài trước)', () => {
  it('cả nhóm nối vào cuối nhóm trước', async () => {
    const s = await seed();
    expect(await mergeIntoPrevious(t.db, s.p2)).toMatchObject({ position: 1, sub: 4 });
    expect(await nums([s.p2, s.d1])).toEqual([`${DEF} #1.4`, `${DEF} #1.5`]);
  });

  it('không có bài trước → lỗi', async () => {
    const s = await seed();
    await expect(mergeIntoPrevious(t.db, s.p1)).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('moveNotes / moveNote (chuyển tag)', () => {
  it('chọn cả bài → thành bài mới cuối tag đích, comment giữ thứ tự', async () => {
    const ls = await createTag(t.db, { name: 'LS' });
    await add('có sẵn', { tagIds: [ls.id] });
    const s = await seed();
    await moveNotes(t.db, [s.c2, s.p1, s.c1, s.c3], ls.id);
    expect(await nums([s.p1, s.c1, s.c2, s.c3])).toEqual(['LS #2', 'LS #2.1', 'LS #2.2', 'LS #2.3']);
  });

  it('bài + một phần comment → phần được chọn đi, phần còn lại ở lại', async () => {
    const ls = await createTag(t.db, { name: 'LS' });
    const s = await seed();
    await moveNotes(t.db, [s.p1, s.c2], ls.id);
    expect(await nums([s.p1, s.c2, s.c1, s.c3])).toEqual(['LS #1', 'LS #1.1', `${DEF} #1.1`, `${DEF} #1.3`]);
  });

  it('chỉ comment → comment nối tiếp bài cuối tag đích; tag đích rỗng → comment đầu thành bài #1', async () => {
    const ls = await createTag(t.db, { name: 'LS' });
    const yh = await createTag(t.db, { name: 'YH' });
    await add('x', { tagIds: [ls.id] });
    const s = await seed();
    await moveNotes(t.db, [s.c1, s.c3], ls.id);
    expect(await nums([s.c1, s.c3])).toEqual(['LS #1.1', 'LS #1.2']);
    await moveNotes(t.db, [s.c2, s.d1], yh.id);
    expect(await nums([s.c2, s.d1])).toEqual(['YH #1', 'YH #1.1']);
  });

  it('moveNote một ghi chú; vào chính tag đang ở → không đổi', async () => {
    const ls = await createTag(t.db, { name: 'LS' });
    const s = await seed();
    expect(await moveNote(t.db, s.p2, ls.id)).toMatchObject({ tag: { name: 'LS' }, position: 1, sub: 0 });
    expect((await moveNote(t.db, s.c1, null)).sub).toBe(1);
    await expect(moveNote(t.db, 9999, null)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('renumberTag (theo sort, toàn tag)', () => {
  it('theo số: dồn chỗ trống, comment .1…; nhóm mất bài → comment đầu thành bài', async () => {
    const s = await seed();
    await t.pg.query('DELETE FROM notes WHERE id = $1 OR id = $2', [s.p1, s.c2]);
    await t.pg.query('UPDATE notes SET position = 7 WHERE id = $1 OR id = $2', [s.p2, s.d1]);
    const def = await getDefaultTag(t.db);
    await renumberTag(t.db, def.id, 'position');
    expect(await nums([s.c1, s.c3, s.p2, s.d1])).toEqual([`${DEF} #1`, `${DEF} #1.1`, `${DEF} #2`, `${DEF} #2.1`]);
  });

  it('theo "Cũ nhất": nhóm xếp theo ghi chú cũ nhất của nhóm', async () => {
    const s = await seed();
    await t.pg.query('UPDATE notes SET position = 1 WHERE id = $1 OR id = $2', [s.p2, s.d1]); // đổi chỗ bằng tay
    await t.pg.query('UPDATE notes SET position = 2 WHERE id IN ($1, $2, $3, $4)', [s.p1, s.c1, s.c2, s.c3]);
    const def = await getDefaultTag(t.db);
    await renumberTag(t.db, def.id, 'oldest');
    expect(await nums([s.p1, s.c3, s.p2])).toEqual([`${DEF} #1`, `${DEF} #1.3`, `${DEF} #2`]);
  });
});

describe('dropNote (kéo thả)', () => {
  it('kéo bài → cả nhóm đổi chỗ, số bài dồn 1…n', async () => {
    const s = await seed();
    const p3 = await add('p3', { newPost: true });
    await dropNote(t.db, p3.id, s.p1, false);
    expect(await nums([p3.id, s.p1, s.c3, s.p2])).toEqual([`${DEF} #1`, `${DEF} #2`, `${DEF} #2.3`, `${DEF} #3`]);
  });

  it('kéo comment trong bài → đổi thứ tự comment', async () => {
    const s = await seed();
    await dropNote(t.db, s.c3, s.c1, false);
    expect(await nums([s.c3, s.c1, s.c2])).toEqual([`${DEF} #1.1`, `${DEF} #1.2`, `${DEF} #1.3`]);
    await dropNote(t.db, s.c3, s.p1, true); // thả lên bài → thành comment đầu
    expect(await num(s.c3)).toBe(`${DEF} #1.1`);
  });

  it('kéo comment sang bài khác → không đổi', async () => {
    const s = await seed();
    await dropNote(t.db, s.c1, s.d1, true);
    expect(await nums([s.c1, s.d1])).toEqual([`${DEF} #1.1`, `${DEF} #2.1`]);
  });
});

describe('deleteTag giữ nhóm', () => {
  it('nhóm của tag bị xoá nối cuối tag mặc định, giữ comment', async () => {
    const ls = await createTag(t.db, { name: 'LS' });
    await add('x');
    const p = await add('p', { tagIds: [ls.id] });
    const c = await add('c', { tagIds: [ls.id] });
    await deleteTag(t.db, ls.id);
    expect(await nums([p.id, c.id])).toEqual([`${DEF} #2`, `${DEF} #2.1`]);
  });
});
