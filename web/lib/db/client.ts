import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';
import type { DB } from './types';

let db: DB | undefined;

export function getDb(): DB {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL chưa được đặt');
    // Pool được dùng lại giữa các lần gọi của cùng một instance serverless. Kết nối rảnh có thể bị Neon
    // đóng khi instance bị đóng băng — không bắt 'error' thì node-postgres ném lỗi và làm sập cả instance.
    const pool = new Pool({ connectionString: url, idleTimeoutMillis: 5_000 });
    pool.on('error', (err: Error) => console.error('neon pool error', err));
    db = drizzle({ client: pool, schema });
  }
  return db;
}
