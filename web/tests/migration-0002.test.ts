import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, runMigrations } from '@/lib/db/migrate';

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite({ extensions: { unaccent } });
  const dir = mkdtempSync(path.join(tmpdir(), 'bn-mig-'));
  copyFileSync(path.join(MIGRATIONS_DIR, '0001_init.sql'), path.join(dir, '0001_init.sql'));
  await runMigrations({ exec: (s) => pg.exec(s), query: (s, p) => pg.query(s, p) }, dir);
  await pg.exec(`
    INSERT INTO tags (name, color) VALUES ('Y học', '#22c55e'), ('Lịch sử', '#ef4444');
    INSERT INTO notes (content, source, created_at) VALUES
      ('a', 'web', '2026-01-03'), ('b', 'web', '2026-01-01'), ('c', 'web', '2026-01-02'), ('d', 'web', '2026-01-04');
    -- a: Lịch sử + Y học; b: Y học; c: chỉ tag mặc định; d: không có dòng note_tags nào
    INSERT INTO note_tags (note_id, tag_id) VALUES
      (1, (SELECT id FROM tags WHERE name = 'Lịch sử')), (1, (SELECT id FROM tags WHERE name = 'Y học')),
      (2, (SELECT id FROM tags WHERE name = 'Y học')), (3, (SELECT id FROM tags WHERE is_default));
  `);
  await pg.exec(readFileSync(path.join(MIGRATIONS_DIR, '0002_single_tag_positions.sql'), 'utf8'));
});
afterAll(() => pg.close());

describe('0002_single_tag_positions', () => {
  it('mỗi ghi chú giữ 1 tag thật (theo tên), không có → tag mặc định; đánh số theo created_at trong tag', async () => {
    const { rows } = await pg.query<{ content: string; tag: string; position: number }>(
      'SELECT n.content, t.name AS tag, n.position FROM notes n JOIN tags t ON t.id = n.tag_id ORDER BY n.content',
    );
    expect(rows).toEqual([
      { content: 'a', tag: 'Lịch sử', position: 1 },
      { content: 'b', tag: 'Y học', position: 1 },
      { content: 'c', tag: 'Chưa phân loại', position: 1 },
      { content: 'd', tag: 'Chưa phân loại', position: 2 },
    ]);
  });

  it('bỏ bảng note_tags, cột mới NOT NULL', async () => {
    const { rows } = await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'note_tags'");
    expect(rows[0].n).toBe(0);
    await expect(pg.query("INSERT INTO notes (content, source) VALUES ('x', 'web')")).rejects.toThrow();
  });
});
