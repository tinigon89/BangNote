import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';
import type { DB } from './types';

let db: DB | undefined;

export function getDb(): DB {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL chưa được đặt');
    db = drizzle({ client: new Pool({ connectionString: url }), schema });
  }
  return db;
}
