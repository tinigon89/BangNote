import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { drizzle } from 'drizzle-orm/pglite';
import { runMigrations } from '@/lib/db/migrate';
import * as schema from '@/lib/db/schema';
import type { DB } from '@/lib/db/types';

export interface TestDb {
  db: DB;
  pg: PGlite;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite({ extensions: { unaccent } });
  await runMigrations({
    exec: (sql) => pg.exec(sql),
    query: (sql, params) => pg.query(sql, params),
  });
  const db = drizzle({ client: pg, schema }) as unknown as DB;
  return {
    db,
    pg,
    async reset() {
      await pg.exec(
        "TRUNCATE notes RESTART IDENTITY CASCADE; DELETE FROM tags WHERE NOT is_default; UPDATE tags SET name = 'Chưa phân loại', color = '#94a3b8' WHERE is_default;",
      );
    },
    close: () => pg.close(),
  };
}
