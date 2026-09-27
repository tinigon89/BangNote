import type { PgDatabase } from 'drizzle-orm/pg-core';
import type * as schema from './schema';

/** Kiểu chung cho Neon, PGlite và transaction — mọi hàm nghiệp vụ nhận `db: DB`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = PgDatabase<any, typeof schema>;
