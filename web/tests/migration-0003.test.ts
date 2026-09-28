import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { MIGRATIONS_DIR, runMigrations } from '@/lib/db/migrate';

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite({ extensions: { unaccent } });
  const dir = mkdtempSync(path.join(tmpdir(), 'bn-mig3-'));
  for (const f of ['0001_init.sql', '0002_single_tag_positions.sql']) copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(dir, f));
  await runMigrations({ exec: (s) => pg.exec(s), query: (s, p) => pg.query(s, p) }, dir);
  await pg.exec(`INSERT INTO notes (content, source, tag_id, position) VALUES ('a', 'web', 1, 1), ('b', 'web', 1, 2);`);
  await pg.exec(readFileSync(path.join(MIGRATIONS_DIR, '0003_post_comments.sql'), 'utf8'));
});
afterAll(() => pg.close());

it('mọi ghi chú cũ thành bài (sub 0), giữ số', async () => {
  const { rows } = await pg.query('SELECT content, position, sub FROM notes ORDER BY content');
  expect(rows).toEqual([
    { content: 'a', position: 1, sub: 0 },
    { content: 'b', position: 2, sub: 0 },
  ]);
});
