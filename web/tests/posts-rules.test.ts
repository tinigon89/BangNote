import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { formatNumber } from '@/lib/notes/number';
import { createNote } from '@/lib/notes/notes';
import { postKey, shouldStartPost, slotAfter } from '@/lib/notes/posts';
import { createTag } from '@/lib/notes/tags';
import { createTestDb, type TestDb } from './helpers/test-db';

describe('formatNumber / postKey / shouldStartPost / slotAfter', () => {
  it('formatNumber', () => {
    expect(formatNumber(5, 0)).toBe('5');
    expect(formatNumber(5, 12)).toBe('5.12');
  });

  it('postKey: cùng bài FB dù khác comment_id / tham số phụ / m.', () => {
    const a = postKey('https://www.facebook.com/groups/abc/posts/123/?comment_id=9&__cft__[0]=x#r');
    expect(postKey('https://m.facebook.com/groups/abc/posts/123?mibextid=z')).toBe(a);
    expect(a).toBe('facebook.com/groups/abc/posts/123');
    expect(postKey('https://www.facebook.com/permalink.php?story_fbid=1&id=2&comment_id=3')).toBe(
      'facebook.com/permalink.php?id=2&story_fbid=1',
    );
    expect(postKey('https://www.facebook.com/permalink.php?story_fbid=1&id=2')).not.toBe(
      postKey('https://www.facebook.com/permalink.php?story_fbid=7&id=2'),
    );
    expect(postKey('https://youtube.com/watch?v=abc&t=10')).toBe('youtube.com/watch?v=abc');
    expect(postKey('  không phải url ')).toBe('không phải url');
  });

  it('shouldStartPost', () => {
    const anchor = { position: 3, sub: 2, source: 'extension' as const, sourceUrl: 'https://fb.com/p/1?comment_id=1' };
    expect(shouldStartPost(null, { source: 'web' })).toBe(true);
    expect(shouldStartPost(anchor, { source: 'extension', sourceUrl: 'https://fb.com/p/1?comment_id=2' })).toBe(false);
    expect(shouldStartPost(anchor, { source: 'extension', sourceUrl: 'https://fb.com/p/2' })).toBe(true);
    expect(shouldStartPost(anchor, { source: 'telegram' })).toBe(true);
    expect(shouldStartPost({ ...anchor, sourceUrl: null }, { source: 'extension', sourceUrl: 'https://fb.com/p/2' })).toBe(false);
    expect(shouldStartPost(anchor, { source: 'extension', sourceUrl: 'https://fb.com/p/1', newPost: true })).toBe(true);
  });

  it('slotAfter', () => {
    const anchor = { position: 3, sub: 2, source: 'web' as const, sourceUrl: null };
    expect(slotAfter(null, false)).toEqual({ position: 1, sub: 0 });
    expect(slotAfter(anchor, false)).toEqual({ position: 3, sub: 3 });
    expect(slotAfter(anchor, true)).toEqual({ position: 4, sub: 0 });
  });
});

describe('createNote theo quy tắc bài / comment', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());
  const num = (n: { position: number; sub: number }) => formatNumber(n.position, n.sub);

  it('tag rỗng → #1; cùng nguồn → comment; đổi nguồn → bài mới', async () => {
    expect(num(await createNote(t.db, { content: 'bài', source: 'web' }))).toBe('1');
    expect(num(await createNote(t.db, { content: 'c1', source: 'web' }))).toBe('1.1');
    expect(num(await createNote(t.db, { content: 'c2', source: 'web' }))).toBe('1.2');
    expect(num(await createNote(t.db, { content: 'bot', source: 'telegram' }))).toBe('2');
    expect(num(await createNote(t.db, { content: 'bot2', source: 'telegram' }))).toBe('2.1');
  });

  it('extension: cùng bài FB → comment, khác bài → bài mới; newPost luôn mở bài', async () => {
    const fb = (p: string) => ({ source: 'extension' as const, sourceUrl: `https://www.facebook.com/g/posts/${p}` });
    expect(num(await createNote(t.db, { content: 'p1', ...fb('1') }))).toBe('1');
    expect(num(await createNote(t.db, { content: 'c', ...fb('1/?comment_id=5') }))).toBe('1.1');
    expect(num(await createNote(t.db, { content: 'p2', ...fb('2') }))).toBe('2');
    expect(num(await createNote(t.db, { content: 'x', ...fb('2'), newPost: true }))).toBe('3');
  });

  it('mỗi tag có dãy riêng', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    await createNote(t.db, { content: 'a', source: 'web' });
    expect(num(await createNote(t.db, { content: 'b', source: 'web', tagIds: [ls.id] }))).toBe('1');
  });
});
