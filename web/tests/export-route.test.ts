import JSZip from 'jszip';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken } from '@/lib/auth/session';
import { createNote } from '@/lib/notes/notes';
import { createTag } from '@/lib/notes/tags';
import { createTestDb, type TestDb } from './helpers/test-db';

const h = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('@/lib/db/client', () => ({ getDb: () => h.db }));

import { GET } from '@/app/api/export/route';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
});
beforeEach(async () => {
  await t.reset();
  process.env.SESSION_SECRET = 'a-very-long-session-secret';
});
afterAll(() => t.close());

function req(query: string, cookie: string | null = `bn_session=${createSessionToken()}`) {
  return new NextRequest(`http://localhost/api/export?${query}`, { headers: cookie ? { cookie } : {} });
}

describe('GET /api/export', () => {
  it('chưa đăng nhập hoặc cookie sai → 401', async () => {
    expect((await GET(req('format=txt', null))).status).toBe(401);
    expect((await GET(req('format=txt', 'bn_session=1.x'))).status).toBe(401);
  });

  it('format lạ → 400', async () => {
    expect((await GET(req('format=pdf'))).status).toBe(400);
  });

  it('TXT: toàn bộ ghi chú khớp bộ lọc, tải về dạng attachment', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    await createNote(t.db, { content: 'Bạch Đằng', source: 'web', tagIds: [ls.id] });
    await createNote(t.db, { content: 'Y học cổ truyền', source: 'web' });

    const res = await GET(req(`format=txt&tag=${ls.id}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="bangnote-\d{4}-\d{2}-\d{2}\.txt"$/);
    const body = await res.text();
    expect(body).toContain('Bạch Đằng');
    expect(body).not.toContain('Y học cổ truyền');
  });

  it('có id → chỉ xuất các ghi chú đã chọn, theo sort', async () => {
    const a = await createNote(t.db, { content: 'một', source: 'web' });
    await createNote(t.db, { content: 'hai', source: 'web' });
    const c = await createNote(t.db, { content: 'ba', source: 'web' });
    const body = await (await GET(req(`format=txt&id=${a.id}&id=${c.id}&sort=oldest&q=khong-khop`))).text();
    expect(body.indexOf('một')).toBeGreaterThan(-1);
    expect(body.indexOf('một')).toBeLessThan(body.indexOf('ba'));
    expect(body).not.toContain('hai');
  });

  it('lọc thời gian được áp dụng', async () => {
    const a = await createNote(t.db, { content: 'cũ', source: 'web' });
    await createNote(t.db, { content: 'mới', source: 'web' });
    await t.pg.query("UPDATE notes SET created_at = '2020-01-01T00:00:00Z' WHERE id = $1", [a.id]);
    const body = await (await GET(req('format=txt&date=today'))).text();
    expect(body).toContain('mới');
    expect(body).not.toContain('cũ');
  });

  it('DOCX: đúng content-type, là file Word chứa nội dung', async () => {
    await createNote(t.db, { content: 'Hải Thượng Lãn Ông', source: 'web' });
    const res = await GET(req('format=docx'));
    expect(res.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
    expect(await zip.file('word/document.xml')!.async('string')).toContain('Hải Thượng Lãn Ông');
  });
});
