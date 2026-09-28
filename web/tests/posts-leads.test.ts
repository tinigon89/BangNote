import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { formatNumber } from '@/lib/notes/number';
import { createNote, getNote } from '@/lib/notes/notes';
import { dropNote, mergeIntoPrevious } from '@/lib/notes/posts';
import { createTestDb, type TestDb } from './helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const add = (content: string, newPost = false) => createNote(t.db, { content, source: 'web', newPost });
const num = async (id: number) => {
  const n = (await getNote(t.db, id))!;
  return formatNumber(n.position, n.sub);
};

describe('↳ chỉ áp dụng cho ghi chú đứng đầu nhóm', () => {
  it('comment của bài → từ chối; bấm ↳ hai lần liền → lần hai bị từ chối, không gộp lần nữa', async () => {
    await add('p1');
    const c1 = await add('c1');
    const p2 = await add('p2', true);
    const d1 = await add('d1');
    await expect(mergeIntoPrevious(t.db, d1.id)).rejects.toMatchObject({ code: 'invalid' });
    await mergeIntoPrevious(t.db, p2.id);
    expect([await num(c1.id), await num(p2.id), await num(d1.id)]).toEqual(['1.1', '1.2', '1.3']);
    await expect(mergeIntoPrevious(t.db, p2.id)).rejects.toMatchObject({ code: 'invalid' });
    expect(await num(p2.id)).toBe('1.2');
  });

  it('nhóm mất bài: comment đầu nhóm gộp được cả nhóm', async () => {
    await add('p1');
    const p2 = await add('p2', true);
    const d1 = await add('d1');
    const d2 = await add('d2');
    await t.pg.query('DELETE FROM notes WHERE id = $1', [p2.id]);
    await mergeIntoPrevious(t.db, d1.id);
    expect([await num(d1.id), await num(d2.id)]).toEqual(['1.1', '1.2']);
  });
});

describe('kéo nhóm mất bài', () => {
  it('kéo comment đầu của nhóm mất bài → di chuyển cả nhóm', async () => {
    const p1 = await add('p1');
    const p2 = await add('p2', true);
    const d1 = await add('d1');
    const d2 = await add('d2');
    await t.pg.query('DELETE FROM notes WHERE id = $1', [p2.id]);
    await dropNote(t.db, d1.id, p1.id, false);
    expect([await num(d1.id), await num(d2.id), await num(p1.id)]).toEqual(['1.1', '1.2', '2']);
  });
});
