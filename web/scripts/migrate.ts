import { Pool } from '@neondatabase/serverless';
import { runMigrations } from '../lib/db/migrate';

try {
  process.loadEnvFile('.env.local');
} catch {
  // không có .env.local → dùng biến môi trường sẵn có
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL chưa được đặt');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
try {
  const applied = await runMigrations({
    exec: (sql) => pool.query(sql),
    query: async <T,>(sql: string, params?: unknown[]) => (await pool.query(sql, params)) as unknown as { rows: T[] },
  });
  console.log(applied.length ? `Đã chạy: ${applied.join(', ')}` : 'Không có migration mới');
} finally {
  await pool.end();
}
