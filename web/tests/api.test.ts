import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTag } from '@/lib/notes/tags';
import { createTestDb, type TestDb } from './helpers/test-db';

const h = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('@/lib/db/client', () => ({ getDb: () => h.db }));

import { GET as getTags } from '@/app/api/tags/route';
import { POST as postNote } from '@/app/api/notes/route';
import { PUT as putNoteTags } from '@/app/api/notes/[id]/tags/route';
import { POST as postNewPost } from '@/app/api/notes/[id]/new-post/route';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
});
beforeEach(async () => {
  await t.reset();
  process.env.API_KEY = 'test-key';
});
afterAll(() => t.close());

function req(method: string, url: string, body?: unknown, key: string | null = 'test-key') {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (key) headers.authorization = `Bearer ${key}`;
  return new Request(`http://localhost${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('xác thực API key', () => {
  it('thiếu key, sai key, server chưa đặt key → 401', async () => {
    expect((await getTags(req('GET', '/api/tags', undefined, null))).status).toBe(401);
    expect((await getTags(req('GET', '/api/tags', undefined, 'sai'))).status).toBe(401);
    process.env.API_KEY = '';
    expect((await getTags(req('GET', '/api/tags', undefined, ''))).status).toBe(401);
  });
});

describe('GET /api/tags', () => {
  it('trả danh sách tag, mặc định đầu tiên', async () => {
    await createTag(t.db, { name: 'Y học' });
    const res = await getTags(req('GET', '/api/tags'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((x: { name: string }) => x.name)).toEqual(['Chưa phân loại', 'Y học']);
    expect(body[0]).toMatchObject({ isDefault: true, color: '#94a3b8' });
  });
});

describe('POST /api/notes', () => {
  it('trả position theo tag', async () => {
    const first = await (await postNote(req('POST', '/api/notes', { content: 'a', source: 'widget' }))).json();
    const second = await (await postNote(req('POST', '/api/notes', { content: 'b', source: 'widget' }))).json();
    expect([first.position, first.sub, second.position, second.sub]).toEqual([1, 0, 1, 1]);
  });

  it('201 và gắn tag mặc định', async () => {
    const res = await postNote(req('POST', '/api/notes', { content: ' hello ', source: 'widget' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: 1, content: 'hello', source: 'widget' });
    expect(body.tags.map((x: { name: string }) => x.name)).toEqual(['Chưa phân loại']);
  });

  it('nhận tagIds, sourceUrl, sourceTitle', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const res = await postNote(
      req('POST', '/api/notes', {
        content: 'x',
        source: 'extension',
        tagIds: [ls.id],
        sourceUrl: 'https://a.b',
        sourceTitle: 'T',
      }),
    );
    const body = await res.json();
    expect(body).toMatchObject({ sourceUrl: 'https://a.b', sourceTitle: 'T' });
    expect(body.tags.map((x: { name: string }) => x.name)).toEqual(['Lịch sử']);
  });

  it('cắt sourceUrl/sourceTitle quá dài thay vì từ chối', async () => {
    const res = await postNote(
      req('POST', '/api/notes', {
        content: 'x',
        source: 'extension',
        sourceUrl: 'data:' + 'a'.repeat(5000),
        sourceTitle: 't'.repeat(900),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sourceUrl).toHaveLength(2000);
    expect(body.sourceTitle).toHaveLength(500);
  });

  it.each([
    ['nội dung rỗng', { content: '   ', source: 'web' }],
    ['quá dài', { content: 'a'.repeat(20001), source: 'web' }],
    ['source lạ', { content: 'x', source: 'email' }],
    ['thiếu content', { source: 'web' }],
    ['tagIds là chuỗi', { content: 'x', source: 'web', tagIds: ['1'] }],
    ['JSON hỏng', '{content:'],
  ])('%s → 400 kèm error', async (_label, body) => {
    const res = await postNote(req('POST', '/api/notes', body));
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe('string');
  });
});

describe('PUT /api/notes/:id/tags', () => {
  it('200 và đổi tag', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    await postNote(req('POST', '/api/notes', { content: 'x', source: 'widget' }));
    const res = await putNoteTags(req('PUT', '/api/notes/1/tags', { tagIds: [ls.id] }), ctx('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.tags.map((x: { name: string }) => x.name)).toEqual(['Lịch sử']);
    expect(body.position).toBe(1);
    expect(body.sub).toBe(0);
  });

  it('note không tồn tại → 404; id sai → 400; thiếu key → 401', async () => {
    expect((await putNoteTags(req('PUT', '/api/notes/999/tags', { tagIds: [] }), ctx('999'))).status).toBe(404);
    expect((await putNoteTags(req('PUT', '/api/notes/abc/tags', { tagIds: [] }), ctx('abc'))).status).toBe(400);
    expect((await putNoteTags(req('PUT', '/api/notes/1/tags', { tagIds: [] }, null), ctx('1'))).status).toBe(401);
  });
});

describe('POST /api/notes/:id/new-post', () => {
  it('tách comment thành bài mới; thiếu key → 401; không có → 404', async () => {
    await postNote(req('POST', '/api/notes', { content: 'bài', source: 'widget' }));
    const c = await (await postNote(req('POST', '/api/notes', { content: 'c', source: 'widget' }))).json();
    expect(c.sub).toBe(1);
    const res = await postNewPost(req('POST', `/api/notes/${c.id}/new-post`), ctx(String(c.id)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: c.id, position: 2, sub: 0, tags: [{ name: 'Chưa phân loại' }] });
    expect((await postNewPost(req('POST', '/api/notes/1/new-post', undefined, null), ctx('1'))).status).toBe(401);
    expect((await postNewPost(req('POST', '/api/notes/999/new-post'), ctx('999'))).status).toBe(404);
  });
});
