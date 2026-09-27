import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface SqlClient {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');

/** Chạy các file .sql chưa chạy theo thứ tự tên; trả về danh sách file vừa chạy. */
export async function runMigrations(client: SqlClient, dir = MIGRATIONS_DIR): Promise<string[]> {
  await client.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const done = new Set(
    (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    const name = file.replace(/'/g, "''");
    await client.exec(`BEGIN;\n${sql}\nINSERT INTO schema_migrations (name) VALUES ('${name}');\nCOMMIT;`);
    applied.push(file);
  }
  return applied;
}
