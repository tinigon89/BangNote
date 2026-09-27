# BangNote Web (admin + API + bot Telegram) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một project Next.js deploy lên Vercel, chứa web admin, REST API cho extension/widget và webhook bot Telegram, lưu dữ liệu trên Neon Postgres.

**Architecture:** Logic nghiệp vụ nằm trong `web/lib/notes/*` dưới dạng hàm thuần nhận `db` (Drizzle) làm tham số đầu tiên — route handler, server action và bot Telegram đều gọi chung các hàm này. Migration là file SQL thuần chạy bằng runner tự viết (dùng chung cho Neon và PGlite). Test chạy trên PGlite (Postgres in-memory, có `unaccent`) nên không cần database thật.

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts`), React 19.3, TypeScript 5.9, Tailwind CSS 4.3, Drizzle ORM 0.45 (`neon-serverless` + `pglite`), `@neondatabase/serverless` 1.1, zod 4.6, Vitest 5, PGlite 0.5.8, tsx.

**Spec:** `docs/superpowers/specs/2026-09-27-bangnote-design.md`

## Global Constraints

- Mọi lệnh `npm` chạy trong thư mục `web/`.
- Node ≥ 22 (máy dev: 22.20). Không dùng TypeScript 7 — ghim `typescript@5.9.3`.
- Next.js 16: file chặn request tên là `proxy.ts`, export `proxy` (không phải `middleware`); runtime là nodejs.
- Route handler dynamic: `params` là `Promise` — `ctx: { params: Promise<{ id: string }> }`.
- ID note/tag là số nguyên (`serial`).
- `source` ∈ `'telegram' | 'extension' | 'widget' | 'web'`.
- Nội dung note: trim; rỗng → lỗi; tối đa **20 000** ký tự.
- Tag mặc định tên **"Chưa phân loại"**, màu `#94a3b8`; đổi tên/màu được, không xoá được.
- Tên tag duy nhất theo `normalizeKey` (bỏ dấu, lowercase, bỏ khoảng trắng và `_`); tối đa 50 ký tự.
- API lỗi luôn trả `{ "error": string }`; 400 invalid, 401 sai key, 404 không có, 409 trùng, 500 lỗi lạ.
- Biến môi trường: `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET` (≥ 16 ký tự), `API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (chỉ `A-Z a-z 0-9 _ -`), `TELEGRAM_OWNER_ID`.
- Tin nhắn bot là text thuần (không `parse_mode`).
- Chuỗi hiển thị cho người dùng bằng tiếng Việt.

**Điều chỉnh nhỏ so với spec (đã cập nhật vào spec ở Task 11):** đăng ký webhook là server action trên `/settings` thay vì route `/api/telegram/setup`; "Tải thêm" tăng `limit` trên URL (50 → 100 → …, tối đa 500) thay vì cursor; `sourceUrl`/`sourceTitle` quá dài bị cắt (2000/500 ký tự) thay vì trả 400; test tìm kiếm chạy trên PGlite (đã xác minh PGlite có `unaccent`).

## Review Focus

1. **Tin nhắn chỉ toàn hashtag** (`#LichSu #YHoc`) → không lưu note rỗng, bot trả "Nội dung trống, không lưu" — test ở Task 7.
2. **Từ khoá tìm kiếm chứa `%` hoặc `_`** → khớp đúng ký tự đó, không thành wildcard — test ở Task 4.
3. **Tạo tag trùng khác dấu/hoa thường** (`lịch sử` khi đã có `Lịch sử`) → 409/lỗi "Đã có tag", nếu không hashtag sẽ khớp mơ hồ — test ở Task 3.
4. **Body API sai kiểu** (JSON hỏng, `tagIds: ["1"]`, id trên path là `abc`) → 400 có thông điệp, không phải 500 — test ở Task 5.
5. **`sourceUrl` rất dài** (URL `data:` hoặc URL có query khổng lồ từ extension) → vẫn lưu được note, URL bị cắt còn 2000 ký tự — test ở Task 5.

---

## File Structure

```
web/
  package.json · tsconfig.json · next.config.ts · postcss.config.mjs · vitest.config.ts
  .env.example · .gitignore · next-env.d.ts (Next tự tạo)
  proxy.ts                          chặn trang admin khi chưa đăng nhập
  db/migrations/0001_init.sql       schema + seed tag mặc định
  scripts/migrate.ts                chạy migration lên Neon
  lib/
    text/normalize.ts               normalizeKey()
    format.ts                       formatRelative()
    http.ts                         jsonError, handleApiError, readJson
    db/schema.ts                    bảng Drizzle + SOURCES
    db/types.ts                     type DB
    db/client.ts                    getDb() → Neon
    db/migrate.ts                   runMigrations()
    notes/types.ts                  Tag, Note, sortTags
    notes/errors.ts                 DomainError
    notes/tags.ts                   CRUD tag + setNoteTags + getTagsForNotes
    notes/notes.ts                  CRUD note + listNotes + setTagsForNotes
    notes/validation.ts             zod schema cho API
    notes/filters.ts                parse/serialize bộ lọc URL
    auth/safe-equal.ts              so sánh constant-time
    auth/api-key.ts                 hasValidApiKey()
    auth/session.ts                 token phiên HMAC + checkPassword
    auth/require.ts                 requireSession() cho server
    telegram/types.ts               kiểu Update tối thiểu
    telegram/api.ts                 callTelegram()
    telegram/hashtags.ts            extractHashtags()
    telegram/keyboard.ts            buildNoteKeyboard, parseCallbackData, toggleTagIds
    telegram/handler.ts             handleUpdate()
  app/
    layout.tsx · globals.css
    login/page.tsx · login/actions.ts
    (admin)/layout.tsx              khung + menu
    (admin)/page.tsx                trang ghi chú
    (admin)/actions.ts              server action cho ghi chú
    (admin)/tags/page.tsx · (admin)/tags/actions.ts
    (admin)/settings/page.tsx · (admin)/settings/actions.ts
    api/tags/route.ts
    api/notes/route.ts
    api/notes/[id]/tags/route.ts
    api/telegram/webhook/route.ts
  components/
    ActionButton.tsx · QuickAdd.tsx · Filters.tsx · NoteList.tsx · NoteCard.tsx
    TagPicker.tsx · TagChip.tsx · TagTable.tsx · NewTagForm.tsx
  tests/
    helpers/test-db.ts · helpers/fixtures.ts
    normalize.test.ts · format.test.ts · db.test.ts · tags.test.ts · notes.test.ts
    filters.test.ts · api.test.ts · telegram-pure.test.ts · telegram-handler.test.ts
    webhook.test.ts · session.test.ts
README.md (gốc repo)             hướng dẫn deploy
docs/manual-test.md              checklist test tay
```

---

### Task 1: Khởi tạo project web + chuẩn hoá chữ

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/postcss.config.mjs`, `web/vitest.config.ts`, `web/.gitignore`, `web/app/globals.css`, `web/app/layout.tsx`, `web/app/page.tsx` (tạm, xoá ở Task 9)
- Create: `web/lib/text/normalize.ts`
- Test: `web/tests/normalize.test.ts`
- Create: `.gitignore` (gốc repo)

**Interfaces:**
- Produces: `normalizeKey(input: string): string`; alias import `@/…` trỏ vào `web/`; lệnh `npm test`, `npm run typecheck`, `npm run build`.

- [ ] **Step 1: Tạo file cấu hình**

`web/package.json`:
```json
{
  "name": "bangnote-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "db:migrate": "tsx scripts/migrate.ts"
  },
  "dependencies": {
    "@neondatabase/serverless": "1.1.0",
    "drizzle-orm": "0.45.3",
    "next": "16.3.6",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@electric-sql/pglite": "0.5.8",
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "^22",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "tailwindcss": "4.3.3",
    "tsx": "4.23.15",
    "typescript": "5.9.3",
    "vitest": "5.0.2"
  }
}
```

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`web/next.config.ts`:
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

`web/postcss.config.mjs`:
```js
export default { plugins: { '@tailwindcss/postcss': {} } };
```

`web/vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: root }] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
```

`web/.gitignore`:
```
node_modules/
.next/
.env*.local
.env
next-env.d.ts
*.tsbuildinfo
.vercel
```

`.gitignore` (gốc repo):
```
node_modules/
.DS_Store
Thumbs.db
```

`web/app/globals.css`:
```css
@import "tailwindcss";
```

`web/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'BangNote' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
```

`web/app/page.tsx` (tạm thời, để build được):
```tsx
export default function Home() {
  return <main className="p-6">BangNote</main>;
}
```

- [ ] **Step 2: Cài dependency**

Run: `cd web && npm install`
Expected: cài xong, không có lỗi `ERESOLVE`.

- [ ] **Step 3: Viết test thất bại cho `normalizeKey`**

`web/tests/normalize.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { normalizeKey } from '@/lib/text/normalize';

describe('normalizeKey', () => {
  it('bỏ dấu tiếng Việt và lowercase', () => {
    expect(normalizeKey('Lịch sử')).toBe('lichsu');
    expect(normalizeKey('Y học')).toBe('yhoc');
  });

  it('chuyển đ/Đ thành d', () => {
    expect(normalizeKey('ĐÀ NẴNG')).toBe('danang');
    expect(normalizeKey('đường')).toBe('duong');
  });

  it('bỏ khoảng trắng và gạch dưới', () => {
    expect(normalizeKey('lịch_sử  thế giới')).toBe('lichsuthegioi');
    expect(normalizeKey('LichSu')).toBe('lichsu');
  });

  it('giữ nguyên chữ số', () => {
    expect(normalizeKey('Thế kỷ 20')).toBe('theky20');
  });
});
```

- [ ] **Step 4: Chạy test, xác nhận thất bại**

Run: `npm test -- tests/normalize.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/text/normalize"`.

- [ ] **Step 5: Cài đặt**

`web/lib/text/normalize.ts`:
```ts
/** Khoá so khớp tên tag / hashtag: bỏ dấu, đ→d, lowercase, bỏ khoảng trắng và `_`. */
export function normalizeKey(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[\s_]+/g, '');
}
```

- [ ] **Step 6: Chạy test + typecheck + build**

Run: `npm test -- tests/normalize.test.ts && npm run typecheck && npm run build`
Expected: 4 test PASS; typecheck không lỗi; build thành công (Next tạo `next-env.d.ts`).

- [ ] **Step 7: Commit**

```bash
git add .gitignore web
git commit -m "feat(web): scaffold Next.js project and normalizeKey"
```

---

### Task 2: Database schema, migration và test DB

**Files:**
- Create: `web/db/migrations/0001_init.sql`, `web/lib/db/schema.ts`, `web/lib/db/types.ts`, `web/lib/db/client.ts`, `web/lib/db/migrate.ts`, `web/scripts/migrate.ts`
- Create: `web/tests/helpers/test-db.ts`
- Test: `web/tests/db.test.ts`

**Interfaces:**
- Consumes: không.
- Produces:
  - `schema.ts`: bảng `tags`, `notes`, `noteTags`; `SOURCES = ['telegram','extension','widget','web'] as const`; `type Source`.
  - `types.ts`: `type DB = PgDatabase<any, typeof schema>` (nhận cả `db` lẫn `tx` trong transaction).
  - `client.ts`: `getDb(): DB`.
  - `migrate.ts`: `interface SqlClient { exec(sql): Promise<unknown>; query<T>(sql, params?): Promise<{ rows: T[] }> }`, `runMigrations(client: SqlClient, dir?: string): Promise<string[]>`.
  - `tests/helpers/test-db.ts`: `createTestDb(): Promise<TestDb>` với `TestDb = { db: DB; pg: PGlite; reset(): Promise<void>; close(): Promise<void> }`. `reset()` xoá toàn bộ note và tag thường, giữ tag mặc định.
  - SQL function `f_unaccent(text)` dùng cho tìm kiếm.

- [ ] **Step 1: Viết migration SQL**

`web/db/migrations/0001_init.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE TABLE tags (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  color text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tags_single_default ON tags (is_default) WHERE is_default;

CREATE TABLE notes (
  id serial PRIMARY KEY,
  content text NOT NULL,
  source text NOT NULL CHECK (source IN ('telegram', 'extension', 'widget', 'web')),
  source_url text,
  source_title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE note_tags (
  note_id integer NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id integer NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);
CREATE INDEX note_tags_tag_id ON note_tags (tag_id);

INSERT INTO tags (name, color, is_default) VALUES ('Chưa phân loại', '#94a3b8', true);
```

- [ ] **Step 2: Schema Drizzle, type DB, client Neon**

`web/lib/db/schema.ts`:
```ts
import { boolean, integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const SOURCES = ['telegram', 'extension', 'widget', 'web'] as const;
export type Source = (typeof SOURCES)[number];

export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notes = pgTable('notes', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  source: text('source', { enum: SOURCES }).notNull(),
  sourceUrl: text('source_url'),
  sourceTitle: text('source_title'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const noteTags = pgTable(
  'note_tags',
  {
    noteId: integer('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.tagId] })],
);
```

`web/lib/db/types.ts`:
```ts
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type * as schema from './schema';

/** Kiểu chung cho Neon, PGlite và transaction — mọi hàm nghiệp vụ nhận `db: DB`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = PgDatabase<any, typeof schema>;
```

`web/lib/db/client.ts`:
```ts
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
```

(Dùng `neon-serverless` + `Pool` chứ không dùng `neon-http`, vì `neon-http` không hỗ trợ transaction — `setNoteTags` và `deleteTag` cần transaction.)

- [ ] **Step 3: Runner migration + script**

`web/lib/db/migrate.ts`:
```ts
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
```

`web/scripts/migrate.ts`:
```ts
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
    query: (sql, params) => pool.query(sql, params),
  });
  console.log(applied.length ? `Đã chạy: ${applied.join(', ')}` : 'Không có migration mới');
} finally {
  await pool.end();
}
```

- [ ] **Step 4: Helper test DB**

`web/tests/helpers/test-db.ts`:
```ts
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
        "TRUNCATE note_tags, notes RESTART IDENTITY CASCADE; DELETE FROM tags WHERE NOT is_default; UPDATE tags SET name = 'Chưa phân loại', color = '#94a3b8' WHERE is_default;",
      );
    },
    close: () => pg.close(),
  };
}
```

- [ ] **Step 5: Viết test thất bại**

`web/tests/db.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '@/lib/db/migrate';
import { createTestDb, type TestDb } from './helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

describe('migrations', () => {
  it('chạy lại không làm gì', async () => {
    const applied = await runMigrations({
      exec: (sql) => t.pg.exec(sql),
      query: (sql, params) => t.pg.query(sql, params),
    });
    expect(applied).toEqual([]);
  });

  it('seed đúng một tag mặc định', async () => {
    const { rows } = await t.pg.query<{ name: string }>('SELECT name FROM tags WHERE is_default');
    expect(rows).toEqual([{ name: 'Chưa phân loại' }]);
  });

  it('không cho tạo tag mặc định thứ hai', async () => {
    await expect(
      t.pg.query("INSERT INTO tags (name, color, is_default) VALUES ('Khác', '#000000', true)"),
    ).rejects.toThrow();
  });

  it('f_unaccent bỏ dấu kể cả Đ', async () => {
    const { rows } = await t.pg.query<{ v: string }>("SELECT f_unaccent(lower('ĐIỆN Biên Phủ')) AS v");
    expect(rows[0].v).toBe('dien bien phu');
  });

  it('source ngoài danh sách bị từ chối', async () => {
    await expect(t.pg.query("INSERT INTO notes (content, source) VALUES ('x', 'email')")).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Chạy test**

Run: `npm test -- tests/db.test.ts`
Expected: 5 PASS. (Nếu chạy trước Step 1–4 sẽ FAIL vì thiếu module — ở task này schema và test viết cùng lúc vì test chính là kiểm chứng migration.)

- [ ] **Step 7: Typecheck + commit**

Run: `npm run typecheck`
Expected: không lỗi.

```bash
git add web
git commit -m "feat(web): database schema, SQL migrations and PGlite test harness"
```

---

### Task 3: Tag và quy tắc tag mặc định

**Files:**
- Create: `web/lib/notes/types.ts`, `web/lib/notes/errors.ts`, `web/lib/notes/tags.ts`
- Create: `web/tests/helpers/fixtures.ts`
- Test: `web/tests/tags.test.ts`

**Interfaces:**
- Consumes: `DB`, bảng `tags/notes/noteTags`, `normalizeKey`.
- Produces:
  - `types.ts`: `interface Tag { id: number; name: string; color: string; isDefault: boolean }`, `interface Note { id; content; source: Source; sourceUrl: string | null; sourceTitle: string | null; createdAt: Date; updatedAt: Date; tags: Tag[] }`, `sortTags(tags: Tag[]): Tag[]` (mặc định đầu, rồi theo tên `localeCompare('vi')`).
  - `errors.ts`: `class DomainError extends Error { code: 'invalid' | 'not_found' | 'conflict' }`.
  - `tags.ts`: `TAG_COLORS` (10 màu), `tagColumns`, `listTags(db): Promise<Tag[]>`, `listTagsWithCounts(db): Promise<(Tag & { noteCount: number })[]>`, `getDefaultTag(db): Promise<Tag>`, `createTag(db, { name, color? }): Promise<Tag>`, `updateTag(db, id, { name?, color? }): Promise<Tag>`, `deleteTag(db, id): Promise<void>`, `setNoteTags(db, noteId, tagIds): Promise<Tag[]>`, `getTagsForNotes(db, noteIds): Promise<Map<number, Tag[]>>`.
  - `fixtures.ts`: `insertNote(db, content?): Promise<number>`, `noteTagNames(db, noteId): Promise<string[]>`.

- [ ] **Step 1: Kiểu dữ liệu và lỗi**

`web/lib/notes/types.ts`:
```ts
import type { Source } from '@/lib/db/schema';

export interface Tag {
  id: number;
  name: string;
  color: string;
  isDefault: boolean;
}

export interface Note {
  id: number;
  content: string;
  source: Source;
  sourceUrl: string | null;
  sourceTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
  tags: Tag[];
}

export function sortTags<T extends Tag>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    a.isDefault === b.isDefault ? a.name.localeCompare(b.name, 'vi') : a.isDefault ? -1 : 1,
  );
}
```

`web/lib/notes/errors.ts`:
```ts
export type DomainErrorCode = 'invalid' | 'not_found' | 'conflict';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
```

`web/tests/helpers/fixtures.ts`:
```ts
import { eq } from 'drizzle-orm';
import { noteTags, notes, tags } from '@/lib/db/schema';
import type { DB } from '@/lib/db/types';

/** Chèn note trần (không qua createNote, không gắn tag) để test tầng tag. */
export async function insertNote(db: DB, content = 'nội dung'): Promise<number> {
  const [row] = await db.insert(notes).values({ content, source: 'web' }).returning({ id: notes.id });
  return row.id;
}

export async function noteTagNames(db: DB, noteId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(noteTags)
    .innerJoin(tags, eq(tags.id, noteTags.tagId))
    .where(eq(noteTags.noteId, noteId));
  return rows.map((r) => r.name).sort();
}
```

- [ ] **Step 2: Viết test thất bại**

`web/tests/tags.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '@/lib/notes/errors';
import {
  createTag,
  deleteTag,
  getDefaultTag,
  getTagsForNotes,
  listTags,
  listTagsWithCounts,
  setNoteTags,
  updateTag,
} from '@/lib/notes/tags';
import { insertNote, noteTagNames } from './helpers/fixtures';
import { createTestDb, type TestDb } from './helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const DEFAULT = 'Chưa phân loại';

describe('listTags', () => {
  it('tag mặc định đứng đầu, còn lại theo tên', async () => {
    await createTag(t.db, { name: 'Y học' });
    await createTag(t.db, { name: 'Lịch sử' });
    expect((await listTags(t.db)).map((x) => x.name)).toEqual([DEFAULT, 'Lịch sử', 'Y học']);
  });
});

describe('createTag', () => {
  it('trim, gộp khoảng trắng và tự chọn màu', async () => {
    const tag = await createTag(t.db, { name: '  Lịch   sử ' });
    expect(tag.name).toBe('Lịch sử');
    expect(tag.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(tag.isDefault).toBe(false);
  });

  it('từ chối tên trùng khác dấu / hoa thường', async () => {
    await createTag(t.db, { name: 'Lịch sử' });
    await expect(createTag(t.db, { name: 'lich SU' })).rejects.toMatchObject({ code: 'conflict' });
    await expect(createTag(t.db, { name: 'chua phan loai' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('từ chối tên rỗng, quá dài, màu sai', async () => {
    await expect(createTag(t.db, { name: '   ' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createTag(t.db, { name: 'a'.repeat(51) })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createTag(t.db, { name: 'X', color: 'red' })).rejects.toBeInstanceOf(DomainError);
  });
});

describe('updateTag', () => {
  it('đổi tên và màu, kể cả tag mặc định', async () => {
    const def = await getDefaultTag(t.db);
    const renamed = await updateTag(t.db, def.id, { name: 'Inbox', color: '#123abc' });
    expect(renamed).toMatchObject({ name: 'Inbox', color: '#123abc', isDefault: true });
  });

  it('cho phép đổi hoa thường của chính nó, chặn trùng tag khác', async () => {
    const a = await createTag(t.db, { name: 'Lịch sử' });
    await createTag(t.db, { name: 'Y học' });
    expect((await updateTag(t.db, a.id, { name: 'LỊCH SỬ' })).name).toBe('LỊCH SỬ');
    await expect(updateTag(t.db, a.id, { name: 'y hoc' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('không tìm thấy → not_found', async () => {
    await expect(updateTag(t.db, 9999, { name: 'X' })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('setNoteTags', () => {
  it('danh sách rỗng → chỉ tag mặc định', async () => {
    const id = await insertNote(t.db);
    const result = await setNoteTags(t.db, id, []);
    expect(result.map((x) => x.name)).toEqual([DEFAULT]);
    expect(await noteTagNames(t.db, id)).toEqual([DEFAULT]);
  });

  it('có tag thật → bỏ tag mặc định', async () => {
    const id = await insertNote(t.db);
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const def = await getDefaultTag(t.db);
    await setNoteTags(t.db, id, []);
    await setNoteTags(t.db, id, [def.id, ls.id, ls.id]);
    expect(await noteTagNames(t.db, id)).toEqual(['Lịch sử']);
  });

  it('id không tồn tại bị bỏ qua; toàn id lạ → tag mặc định', async () => {
    const id = await insertNote(t.db);
    const yh = await createTag(t.db, { name: 'Y học' });
    await setNoteTags(t.db, id, [yh.id, 9999]);
    expect(await noteTagNames(t.db, id)).toEqual(['Y học']);
    await setNoteTags(t.db, id, [9999]);
    expect(await noteTagNames(t.db, id)).toEqual([DEFAULT]);
  });

  it('note không tồn tại → not_found', async () => {
    await expect(setNoteTags(t.db, 9999, [])).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('deleteTag', () => {
  it('không xoá được tag mặc định', async () => {
    const def = await getDefaultTag(t.db);
    await expect(deleteTag(t.db, def.id)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('note mất hết tag → về tag mặc định; note còn tag khác giữ nguyên', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const yh = await createTag(t.db, { name: 'Y học' });
    const onlyLs = await insertNote(t.db, 'a');
    const both = await insertNote(t.db, 'b');
    await setNoteTags(t.db, onlyLs, [ls.id]);
    await setNoteTags(t.db, both, [ls.id, yh.id]);

    await deleteTag(t.db, ls.id);

    expect(await noteTagNames(t.db, onlyLs)).toEqual([DEFAULT]);
    expect(await noteTagNames(t.db, both)).toEqual(['Y học']);
  });

  it('không tìm thấy → not_found', async () => {
    await expect(deleteTag(t.db, 9999)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('listTagsWithCounts & getTagsForNotes', () => {
  it('đếm note theo tag và gom tag theo note', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await insertNote(t.db, 'a');
    const b = await insertNote(t.db, 'b');
    await setNoteTags(t.db, a, [ls.id]);
    await setNoteTags(t.db, b, []);

    const counts = await listTagsWithCounts(t.db);
    expect(counts.map((c) => [c.name, c.noteCount])).toEqual([
      [DEFAULT, 1],
      ['Lịch sử', 1],
    ]);

    const map = await getTagsForNotes(t.db, [a, b, 9999]);
    expect(map.get(a)?.map((x) => x.name)).toEqual(['Lịch sử']);
    expect(map.get(b)?.map((x) => x.name)).toEqual([DEFAULT]);
    expect(map.get(9999)).toEqual([]);
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `npm test -- tests/tags.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/notes/tags"`.

- [ ] **Step 4: Cài đặt `tags.ts`**

`web/lib/notes/tags.ts`:
```ts
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { noteTags, notes, tags } from '@/lib/db/schema';
import type { DB } from '@/lib/db/types';
import { normalizeKey } from '@/lib/text/normalize';
import { DomainError } from './errors';
import { sortTags, type Tag } from './types';

export const TAG_COLORS = [
  '#94a3b8', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
] as const;

export const tagColumns = { id: tags.id, name: tags.name, color: tags.color, isDefault: tags.isDefault };

export async function listTags(db: DB): Promise<Tag[]> {
  return sortTags(await db.select(tagColumns).from(tags).orderBy(desc(tags.isDefault), asc(tags.name)));
}

export async function listTagsWithCounts(db: DB): Promise<(Tag & { noteCount: number })[]> {
  const rows = await db
    .select({ ...tagColumns, noteCount: sql<number>`count(${noteTags.noteId})::int` })
    .from(tags)
    .leftJoin(noteTags, eq(noteTags.tagId, tags.id))
    .groupBy(tags.id);
  return sortTags(rows);
}

export async function getDefaultTag(db: DB): Promise<Tag> {
  const [tag] = await db.select(tagColumns).from(tags).where(eq(tags.isDefault, true));
  if (!tag) throw new Error('Thiếu tag mặc định — hãy chạy migration');
  return tag;
}

function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new DomainError('invalid', 'Tên tag không được trống');
  if (trimmed.length > 50) throw new DomainError('invalid', 'Tên tag tối đa 50 ký tự');
  return trimmed;
}

function cleanColor(color: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new DomainError('invalid', 'Màu phải có dạng #rrggbb');
  return color.toLowerCase();
}

async function assertNameFree(db: DB, name: string, exceptId?: number): Promise<void> {
  const key = normalizeKey(name);
  const clash = (await listTags(db)).find((x) => x.id !== exceptId && normalizeKey(x.name) === key);
  if (clash) throw new DomainError('conflict', `Đã có tag "${clash.name}"`);
}

export async function createTag(db: DB, input: { name: string; color?: string }): Promise<Tag> {
  const name = cleanName(input.name);
  await assertNameFree(db, name);
  const color =
    input.color !== undefined
      ? cleanColor(input.color)
      : TAG_COLORS[(await listTags(db)).length % TAG_COLORS.length];
  const [tag] = await db.insert(tags).values({ name, color }).returning(tagColumns);
  return tag;
}

export async function updateTag(db: DB, id: number, input: { name?: string; color?: string }): Promise<Tag> {
  const patch: { name?: string; color?: string } = {};
  if (input.name !== undefined) {
    patch.name = cleanName(input.name);
    await assertNameFree(db, patch.name, id);
  }
  if (input.color !== undefined) patch.color = cleanColor(input.color);

  const [tag] = Object.keys(patch).length
    ? await db.update(tags).set(patch).where(eq(tags.id, id)).returning(tagColumns)
    : await db.select(tagColumns).from(tags).where(eq(tags.id, id));
  if (!tag) throw new DomainError('not_found', 'Không tìm thấy tag');
  return tag;
}

export async function deleteTag(db: DB, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [tag] = await tx.select(tagColumns).from(tags).where(eq(tags.id, id));
    if (!tag) throw new DomainError('not_found', 'Không tìm thấy tag');
    if (tag.isDefault) throw new DomainError('invalid', 'Không thể xoá tag mặc định');
    await tx.delete(tags).where(eq(tags.id, id));
    const def = await getDefaultTag(tx);
    await tx.execute(sql`
      INSERT INTO note_tags (note_id, tag_id)
      SELECT n.id, ${def.id} FROM notes n
      WHERE NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id)`);
  });
}

/**
 * Nơi DUY NHẤT gán tag cho note. Bỏ tag mặc định và id lạ khỏi `tagIds`;
 * còn tag thật → chỉ giữ chúng, rỗng → gắn tag mặc định.
 */
export async function setNoteTags(db: DB, noteId: number, tagIds: number[]): Promise<Tag[]> {
  return db.transaction(async (tx) => {
    const [note] = await tx.select({ id: notes.id }).from(notes).where(eq(notes.id, noteId));
    if (!note) throw new DomainError('not_found', 'Không tìm thấy ghi chú');

    const unique = [...new Set(tagIds)];
    const real = unique.length
      ? await tx.select(tagColumns).from(tags).where(and(inArray(tags.id, unique), eq(tags.isDefault, false)))
      : [];
    const final = real.length ? real : [await getDefaultTag(tx)];

    await tx.delete(noteTags).where(eq(noteTags.noteId, noteId));
    await tx.insert(noteTags).values(final.map((tag) => ({ noteId, tagId: tag.id })));
    await tx.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));
    return sortTags(final);
  });
}

export async function getTagsForNotes(db: DB, noteIds: number[]): Promise<Map<number, Tag[]>> {
  const map = new Map<number, Tag[]>(noteIds.map((id) => [id, []]));
  if (!noteIds.length) return map;
  const rows = await db
    .select({ noteId: noteTags.noteId, ...tagColumns })
    .from(noteTags)
    .innerJoin(tags, eq(tags.id, noteTags.tagId))
    .where(inArray(noteTags.noteId, noteIds));
  for (const { noteId, ...tag } of rows) map.get(noteId)?.push(tag);
  for (const [id, list] of map) map.set(id, sortTags(list));
  return map;
}
```

- [ ] **Step 5: Chạy test**

Run: `npm test -- tests/tags.test.ts`
Expected: tất cả PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: không lỗi. Nếu `tx` không gán được cho `DB`, đổi `types.ts` thành `PgDatabase<any, typeof schema, any>` rồi chạy lại.

```bash
git add web
git commit -m "feat(web): tags domain with default-tag rule"
```

---

### Task 4: Ghi chú (tạo, tìm, lọc, sửa, xoá, gắn tag hàng loạt)

**Files:**
- Create: `web/lib/notes/notes.ts`
- Test: `web/tests/notes.test.ts`

**Interfaces:**
- Consumes: `setNoteTags`, `getTagsForNotes`, `DomainError`, `Note`, `DB`.
- Produces:
  - `MAX_CONTENT = 20000`
  - `interface CreateNoteInput { content: string; source: Source; tagIds?: number[]; sourceUrl?: string | null; sourceTitle?: string | null }`
  - `createNote(db, input): Promise<Note>`
  - `getNote(db, id): Promise<Note | null>`
  - `interface ListNotesFilter { q?: string; tagIds?: number[]; sources?: Source[]; limit?: number }`
  - `listNotes(db, filter?): Promise<{ notes: Note[]; hasMore: boolean }>` (mới nhất trước; `limit` mặc định 50, kẹp trong 1..500; lọc tag là OR)
  - `updateNoteContent(db, id, content): Promise<Note>`
  - `deleteNotes(db, ids): Promise<number>`
  - `setTagsForNotes(db, ids, tagIds): Promise<void>`

- [ ] **Step 1: Viết test thất bại**

`web/tests/notes.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createNote,
  deleteNotes,
  getNote,
  listNotes,
  setTagsForNotes,
  updateNoteContent,
} from '@/lib/notes/notes';
import { createTag, getDefaultTag } from '@/lib/notes/tags';
import { createTestDb, type TestDb } from './helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const names = (n: { tags: { name: string }[] }) => n.tags.map((x) => x.name);

describe('createNote', () => {
  it('trim nội dung, lưu nguồn, gắn tag mặc định khi không có tag', async () => {
    const note = await createNote(t.db, {
      content: '  Trận Bạch Đằng 938  ',
      source: 'extension',
      sourceUrl: 'https://vi.wikipedia.org/x',
      sourceTitle: 'Wiki',
    });
    expect(note).toMatchObject({
      content: 'Trận Bạch Đằng 938',
      source: 'extension',
      sourceUrl: 'https://vi.wikipedia.org/x',
      sourceTitle: 'Wiki',
    });
    expect(names(note)).toEqual(['Chưa phân loại']);
    expect(note.createdAt).toBeInstanceOf(Date);
  });

  it('gắn tag được truyền vào', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const note = await createNote(t.db, { content: 'x', source: 'web', tagIds: [ls.id] });
    expect(names(note)).toEqual(['Lịch sử']);
  });

  it('từ chối nội dung rỗng hoặc quá 20000 ký tự', async () => {
    await expect(createNote(t.db, { content: ' \n\t ', source: 'web' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createNote(t.db, { content: 'a'.repeat(20001), source: 'web' })).rejects.toMatchObject({
      code: 'invalid',
    });
    expect((await createNote(t.db, { content: 'a'.repeat(20000), source: 'web' })).content).toHaveLength(20000);
  });
});

describe('listNotes', () => {
  it('mới nhất trước', async () => {
    await createNote(t.db, { content: 'một', source: 'web' });
    await createNote(t.db, { content: 'hai', source: 'web' });
    expect((await listNotes(t.db)).notes.map((n) => n.content)).toEqual(['hai', 'một']);
  });

  it('tìm không dấu, không phân biệt hoa thường', async () => {
    await createNote(t.db, { content: 'Lịch sử Việt Nam', source: 'web' });
    await createNote(t.db, { content: 'Y học cổ truyền', source: 'web' });
    expect((await listNotes(t.db, { q: 'lich su' })).notes.map((n) => n.content)).toEqual(['Lịch sử Việt Nam']);
    expect((await listNotes(t.db, { q: 'CỔ TRUYỀN' })).notes).toHaveLength(1);
    expect((await listNotes(t.db, { q: '   ' })).notes).toHaveLength(2);
  });

  it('% và _ trong từ khoá là ký tự thường', async () => {
    await createNote(t.db, { content: '100% đúng', source: 'web' });
    await createNote(t.db, { content: '1000 đúng', source: 'web' });
    await createNote(t.db, { content: 'a_b', source: 'web' });
    await createNote(t.db, { content: 'axb', source: 'web' });
    expect((await listNotes(t.db, { q: '0%' })).notes.map((n) => n.content)).toEqual(['100% đúng']);
    expect((await listNotes(t.db, { q: 'a_b' })).notes.map((n) => n.content)).toEqual(['a_b']);
  });

  it('lọc nhiều tag theo OR, lọc được tag mặc định', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const yh = await createTag(t.db, { name: 'Y học' });
    const vh = await createTag(t.db, { name: 'Văn học' });
    await createNote(t.db, { content: 'A', source: 'web', tagIds: [ls.id] });
    await createNote(t.db, { content: 'B', source: 'web', tagIds: [yh.id] });
    await createNote(t.db, { content: 'C', source: 'web', tagIds: [vh.id] });
    await createNote(t.db, { content: 'D', source: 'web' });
    const def = await getDefaultTag(t.db);

    expect((await listNotes(t.db, { tagIds: [ls.id, yh.id] })).notes.map((n) => n.content)).toEqual(['B', 'A']);
    expect((await listNotes(t.db, { tagIds: [def.id] })).notes.map((n) => n.content)).toEqual(['D']);
  });

  it('lọc theo nguồn', async () => {
    await createNote(t.db, { content: 'tg', source: 'telegram' });
    await createNote(t.db, { content: 'wg', source: 'widget' });
    await createNote(t.db, { content: 'wb', source: 'web' });
    expect((await listNotes(t.db, { sources: ['telegram', 'widget'] })).notes.map((n) => n.content)).toEqual([
      'wg',
      'tg',
    ]);
  });

  it('limit và hasMore', async () => {
    for (let i = 1; i <= 3; i++) await createNote(t.db, { content: `n${i}`, source: 'web' });
    const page = await listNotes(t.db, { limit: 2 });
    expect(page.notes.map((n) => n.content)).toEqual(['n3', 'n2']);
    expect(page.hasMore).toBe(true);
    expect((await listNotes(t.db, { limit: 3 })).hasMore).toBe(false);
  });
});

describe('getNote / updateNoteContent / deleteNotes / setTagsForNotes', () => {
  it('getNote trả null khi không có', async () => {
    expect(await getNote(t.db, 9999)).toBeNull();
  });

  it('sửa nội dung, trim, kiểm tra rỗng và not_found', async () => {
    const note = await createNote(t.db, { content: 'cũ', source: 'web' });
    expect((await updateNoteContent(t.db, note.id, '  mới ')).content).toBe('mới');
    await expect(updateNoteContent(t.db, note.id, '  ')).rejects.toMatchObject({ code: 'invalid' });
    await expect(updateNoteContent(t.db, 9999, 'x')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('xoá nhiều note, trả số note đã xoá', async () => {
    const a = await createNote(t.db, { content: 'a', source: 'web' });
    const b = await createNote(t.db, { content: 'b', source: 'web' });
    expect(await deleteNotes(t.db, [a.id, b.id, 9999])).toBe(2);
    expect(await deleteNotes(t.db, [])).toBe(0);
    expect((await listNotes(t.db)).notes).toHaveLength(0);
  });

  it('gắn tag hàng loạt', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await createNote(t.db, { content: 'a', source: 'web' });
    const b = await createNote(t.db, { content: 'b', source: 'web' });
    await setTagsForNotes(t.db, [a.id, b.id], [ls.id]);
    expect(names((await getNote(t.db, a.id))!)).toEqual(['Lịch sử']);
    expect(names((await getNote(t.db, b.id))!)).toEqual(['Lịch sử']);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test -- tests/notes.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/notes/notes"`.

- [ ] **Step 3: Cài đặt**

`web/lib/notes/notes.ts`:
```ts
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { noteTags, notes, type Source } from '@/lib/db/schema';
import type { DB } from '@/lib/db/types';
import { DomainError } from './errors';
import { getTagsForNotes, setNoteTags } from './tags';
import type { Note } from './types';

export const MAX_CONTENT = 20000;

export interface CreateNoteInput {
  content: string;
  source: Source;
  tagIds?: number[];
  sourceUrl?: string | null;
  sourceTitle?: string | null;
}

export interface ListNotesFilter {
  q?: string;
  tagIds?: number[];
  sources?: Source[];
  limit?: number;
}

const noteColumns = {
  id: notes.id,
  content: notes.content,
  source: notes.source,
  sourceUrl: notes.sourceUrl,
  sourceTitle: notes.sourceTitle,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};

function cleanContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) throw new DomainError('invalid', 'Nội dung không được trống');
  if (trimmed.length > MAX_CONTENT) throw new DomainError('invalid', `Nội dung tối đa ${MAX_CONTENT} ký tự`);
  return trimmed;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function withTags(db: DB, rows: Omit<Note, 'tags'>[]): Promise<Note[]> {
  const map = await getTagsForNotes(db, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, tags: map.get(r.id) ?? [] }));
}

export async function createNote(db: DB, input: CreateNoteInput): Promise<Note> {
  const content = cleanContent(input.content);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(notes)
      .values({
        content,
        source: input.source,
        sourceUrl: input.sourceUrl ?? null,
        sourceTitle: input.sourceTitle ?? null,
      })
      .returning(noteColumns);
    const tags = await setNoteTags(tx, row.id, input.tagIds ?? []);
    return { ...row, tags };
  });
}

export async function getNote(db: DB, id: number): Promise<Note | null> {
  const rows = await db.select(noteColumns).from(notes).where(eq(notes.id, id));
  if (!rows.length) return null;
  return (await withTags(db, rows))[0];
}

export async function listNotes(db: DB, filter: ListNotesFilter = {}): Promise<{ notes: Note[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 500);
  const conditions: SQL[] = [];

  const q = filter.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(sql`f_unaccent(lower(${notes.content})) LIKE f_unaccent(lower(${pattern}))`);
  }
  if (filter.tagIds?.length) {
    conditions.push(
      inArray(notes.id, db.select({ id: noteTags.noteId }).from(noteTags).where(inArray(noteTags.tagId, filter.tagIds))),
    );
  }
  if (filter.sources?.length) conditions.push(inArray(notes.source, filter.sources));

  const rows = await db
    .select(noteColumns)
    .from(notes)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(notes.id))
    .limit(limit + 1);

  return { notes: await withTags(db, rows.slice(0, limit)), hasMore: rows.length > limit };
}

export async function updateNoteContent(db: DB, id: number, content: string): Promise<Note> {
  const clean = cleanContent(content);
  const rows = await db
    .update(notes)
    .set({ content: clean, updatedAt: new Date() })
    .where(eq(notes.id, id))
    .returning(noteColumns);
  if (!rows.length) throw new DomainError('not_found', 'Không tìm thấy ghi chú');
  return (await withTags(db, rows))[0];
}

export async function deleteNotes(db: DB, ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await db.delete(notes).where(inArray(notes.id, ids)).returning({ id: notes.id });
  return rows.length;
}

export async function setTagsForNotes(db: DB, ids: number[], tagIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const id of ids) await setNoteTags(tx, id, tagIds);
  });
}
```

(Postgres mặc định dùng `\` làm ký tự escape cho `LIKE`, nên không cần mệnh đề `ESCAPE`.)

- [ ] **Step 4: Chạy test**

Run: `npm test -- tests/notes.test.ts`
Expected: tất cả PASS.

- [ ] **Step 5: Chạy toàn bộ test + typecheck + commit**

Run: `npm test && npm run typecheck`
Expected: tất cả PASS, không lỗi type.

```bash
git add web
git commit -m "feat(web): notes domain with accent-insensitive search and tag filters"
```

---

### Task 5: REST API cho extension và widget

**Files:**
- Create: `web/lib/auth/safe-equal.ts`, `web/lib/auth/api-key.ts`, `web/lib/http.ts`, `web/lib/notes/validation.ts`
- Create: `web/app/api/tags/route.ts`, `web/app/api/notes/route.ts`, `web/app/api/notes/[id]/tags/route.ts`
- Test: `web/tests/api.test.ts`

**Interfaces:**
- Consumes: `getDb`, `listTags`, `createNote`, `setNoteTags`, `DomainError`, `SOURCES`.
- Produces:
  - `safeEqual(a: string, b: string): boolean`
  - `hasValidApiKey(req: Request): boolean` — header `Authorization: Bearer <API_KEY>`; `API_KEY` rỗng → luôn false.
  - `jsonError(status, error)`, `handleApiError(err): NextResponse`, `readJson(req): Promise<unknown>` (JSON hỏng → `DomainError('invalid')`).
  - zod: `createNoteBody`, `setTagsBody`, `noteIdParam`.
  - HTTP: `GET /api/tags` → `Tag[]`; `POST /api/notes` → `201 Note`; `PUT /api/notes/:id/tags` → `200 { id, tags }`.

- [ ] **Step 1: Viết test thất bại**

`web/tests/api.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTag } from '@/lib/notes/tags';
import { createTestDb, type TestDb } from './helpers/test-db';

const h = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('@/lib/db/client', () => ({ getDb: () => h.db }));

import { GET as getTags } from '@/app/api/tags/route';
import { POST as postNote } from '@/app/api/notes/route';
import { PUT as putNoteTags } from '@/app/api/notes/[id]/tags/route';

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
  });

  it('note không tồn tại → 404; id sai → 400; thiếu key → 401', async () => {
    expect((await putNoteTags(req('PUT', '/api/notes/999/tags', { tagIds: [] }), ctx('999'))).status).toBe(404);
    expect((await putNoteTags(req('PUT', '/api/notes/abc/tags', { tagIds: [] }), ctx('abc'))).status).toBe(400);
    expect((await putNoteTags(req('PUT', '/api/notes/1/tags', { tagIds: [] }, null), ctx('1'))).status).toBe(401);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test -- tests/api.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/api/tags/route"`.

- [ ] **Step 3: Cài đặt tiện ích xác thực và HTTP**

`web/lib/auth/safe-equal.ts`:
```ts
import { createHash, timingSafeEqual } from 'node:crypto';

/** So sánh chuỗi constant-time (băm trước để độ dài khác nhau không lộ thông tin). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
```

`web/lib/auth/api-key.ts`:
```ts
import { safeEqual } from './safe-equal';

export function hasValidApiKey(req: Request): boolean {
  const expected = process.env.API_KEY;
  if (!expected) return false;
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  return !!match && safeEqual(match[1].trim(), expected);
}
```

`web/lib/http.ts`:
```ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { DomainError } from '@/lib/notes/errors';

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

const STATUS = { invalid: 400, not_found: 404, conflict: 409 } as const;

export function handleApiError(err: unknown) {
  if (err instanceof DomainError) return jsonError(STATUS[err.code], err.message);
  if (err instanceof ZodError) {
    return jsonError(400, err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  }
  console.error(err);
  return jsonError(500, 'Lỗi máy chủ');
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new DomainError('invalid', 'Body không phải JSON hợp lệ');
  }
}
```

`web/lib/notes/validation.ts`:
```ts
import { z } from 'zod';
import { SOURCES } from '@/lib/db/schema';

const tagIds = z.array(z.number().int().positive()).max(50);

const truncated = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (v ? v.slice(0, max) : null));

export const createNoteBody = z.object({
  content: z.string(),
  source: z.enum(SOURCES),
  tagIds: tagIds.optional(),
  sourceUrl: truncated(2000),
  sourceTitle: truncated(500),
});

export const setTagsBody = z.object({ tagIds });

export const noteIdParam = z.coerce.number().int().positive();
```

- [ ] **Step 4: Cài đặt route handler**

`web/app/api/tags/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { hasValidApiKey } from '@/lib/auth/api-key';
import { getDb } from '@/lib/db/client';
import { handleApiError, jsonError } from '@/lib/http';
import { listTags } from '@/lib/notes/tags';

export async function GET(req: Request) {
  if (!hasValidApiKey(req)) return jsonError(401, 'API key không hợp lệ');
  try {
    return NextResponse.json(await listTags(getDb()));
  } catch (err) {
    return handleApiError(err);
  }
}
```

`web/app/api/notes/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { hasValidApiKey } from '@/lib/auth/api-key';
import { getDb } from '@/lib/db/client';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { createNote } from '@/lib/notes/notes';
import { createNoteBody } from '@/lib/notes/validation';

export async function POST(req: Request) {
  if (!hasValidApiKey(req)) return jsonError(401, 'API key không hợp lệ');
  try {
    const body = createNoteBody.parse(await readJson(req));
    return NextResponse.json(await createNote(getDb(), body), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
```

`web/app/api/notes/[id]/tags/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { hasValidApiKey } from '@/lib/auth/api-key';
import { getDb } from '@/lib/db/client';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { setNoteTags } from '@/lib/notes/tags';
import { noteIdParam, setTagsBody } from '@/lib/notes/validation';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasValidApiKey(req)) return jsonError(401, 'API key không hợp lệ');
  try {
    const id = noteIdParam.parse((await ctx.params).id);
    const { tagIds } = setTagsBody.parse(await readJson(req));
    return NextResponse.json({ id, tags: await setNoteTags(getDb(), id, tagIds) });
  } catch (err) {
    return handleApiError(err);
  }
}
```

- [ ] **Step 5: Chạy test**

Run: `npm test -- tests/api.test.ts`
Expected: tất cả PASS.

- [ ] **Step 6: Toàn bộ test + typecheck + build + commit**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS / không lỗi / build thành công.

```bash
git add web
git commit -m "feat(web): REST API for tags and notes with API-key auth"
```

---

### Task 6: Phần thuần của bot Telegram (hashtag, bàn phím, callback)

**Files:**
- Create: `web/lib/telegram/hashtags.ts`, `web/lib/telegram/keyboard.ts`
- Test: `web/tests/telegram-pure.test.ts`

**Interfaces:**
- Consumes: `normalizeKey`, `Tag`.
- Produces:
  - `extractHashtags(text: string, tags: Tag[]): { content: string; tagIds: number[]; unknown: string[] }` — chỉ nhận hashtag đứng đầu chuỗi hoặc sau khoảng trắng; hashtag khớp bị cắt khỏi nội dung; `unknown` giữ nguyên dạng `#xyz`.
  - `type InlineButton = { text: string; callback_data: string }`, `type InlineKeyboard = { inline_keyboard: InlineButton[][] }`
  - `buildNoteKeyboard(noteId: number, allTags: Tag[], selectedIds: number[]): InlineKeyboard` — 3 nút/hàng, tối đa 30 tag, `✓ ` cho tag đang gắn, hàng cuối `🗑 Xoá`.
  - `type CallbackAction = { kind: 'toggle'; noteId: number; tagId: number } | { kind: 'delete'; noteId: number }`
  - `parseCallbackData(data: string): CallbackAction | null` — dạng `t:<noteId>:<tagId>` và `d:<noteId>`.
  - `toggleTagIds(current: Tag[], tagId: number, defaultTagId: number): number[]` — bấm tag mặc định → `[]`; tag thật → bật/tắt trong tập tag thật.

- [ ] **Step 1: Viết test thất bại**

`web/tests/telegram-pure.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Tag } from '@/lib/notes/types';
import { extractHashtags } from '@/lib/telegram/hashtags';
import { buildNoteKeyboard, parseCallbackData, toggleTagIds } from '@/lib/telegram/keyboard';

const DEF: Tag = { id: 1, name: 'Chưa phân loại', color: '#94a3b8', isDefault: true };
const LS: Tag = { id: 2, name: 'Lịch sử', color: '#ef4444', isDefault: false };
const YH: Tag = { id: 3, name: 'Y học', color: '#22c55e', isDefault: false };
const ALL = [DEF, LS, YH];

describe('extractHashtags', () => {
  it('khớp nhiều cách viết và cắt khỏi nội dung', () => {
    expect(extractHashtags('#LichSu Trận Bạch Đằng', ALL)).toEqual({
      content: 'Trận Bạch Đằng',
      tagIds: [2],
      unknown: [],
    });
    expect(extractHashtags('Trận Bạch Đằng #lịch_sử #yhoc', ALL).tagIds).toEqual([2, 3]);
    expect(extractHashtags('abc #LICHSU def', ALL).content).toBe('abc def');
  });

  it('giữ xuống dòng của nội dung', () => {
    expect(extractHashtags('dòng 1\ndòng 2 #YHoc', ALL).content).toBe('dòng 1\ndòng 2');
  });

  it('hashtag lạ giữ nguyên và được báo', () => {
    const r = extractHashtags('ghi chú #xyz #xyz', ALL);
    expect(r).toEqual({ content: 'ghi chú #xyz #xyz', tagIds: [], unknown: ['#xyz'] });
  });

  it('bỏ qua # trong URL', () => {
    const r = extractHashtags('xem https://a.com/#lichsu', ALL);
    expect(r).toEqual({ content: 'xem https://a.com/#lichsu', tagIds: [], unknown: [] });
  });

  it('chỉ toàn hashtag → nội dung rỗng', () => {
    expect(extractHashtags('#LichSu #YHoc', ALL).content).toBe('');
  });

  it('không có hashtag → chỉ trim', () => {
    expect(extractHashtags('  xin chào  ', ALL)).toEqual({ content: 'xin chào', tagIds: [], unknown: [] });
  });
});

describe('buildNoteKeyboard', () => {
  it('3 nút mỗi hàng, đánh dấu tag đang gắn, hàng cuối là Xoá', () => {
    const extra: Tag = { id: 4, name: 'Văn học', color: '#000000', isDefault: false };
    const kb = buildNoteKeyboard(12, [...ALL, extra], [2]);
    expect(kb.inline_keyboard).toEqual([
      [
        { text: 'Chưa phân loại', callback_data: 't:12:1' },
        { text: '✓ Lịch sử', callback_data: 't:12:2' },
        { text: 'Y học', callback_data: 't:12:3' },
      ],
      [{ text: 'Văn học', callback_data: 't:12:4' }],
      [{ text: '🗑 Xoá', callback_data: 'd:12' }],
    ]);
  });

  it('callback_data luôn ≤ 64 byte', () => {
    const kb = buildNoteKeyboard(2147483647, [{ ...LS, id: 2147483647 }], []);
    for (const row of kb.inline_keyboard) for (const b of row) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
  });
});

describe('parseCallbackData', () => {
  it('đọc toggle và delete, từ chối dữ liệu lạ', () => {
    expect(parseCallbackData('t:5:2')).toEqual({ kind: 'toggle', noteId: 5, tagId: 2 });
    expect(parseCallbackData('d:5')).toEqual({ kind: 'delete', noteId: 5 });
    expect(parseCallbackData('x:5')).toBeNull();
    expect(parseCallbackData('t:5')).toBeNull();
    expect(parseCallbackData('')).toBeNull();
  });
});

describe('toggleTagIds', () => {
  it('bật/tắt tag thật, bấm tag mặc định thì xoá hết', () => {
    expect(toggleTagIds([DEF], 2, 1)).toEqual([2]);
    expect(toggleTagIds([LS], 3, 1)).toEqual([2, 3]);
    expect(toggleTagIds([LS, YH], 2, 1)).toEqual([3]);
    expect(toggleTagIds([LS, YH], 1, 1)).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test -- tests/telegram-pure.test.ts`
Expected: FAIL — không resolve được `@/lib/telegram/hashtags`.

- [ ] **Step 3: Cài đặt**

`web/lib/telegram/hashtags.ts`:
```ts
import type { Tag } from '@/lib/notes/types';
import { normalizeKey } from '@/lib/text/normalize';

export interface HashtagResult {
  content: string;
  tagIds: number[];
  unknown: string[];
}

const HASHTAG = /(^|\s)#([\p{L}\p{N}_]+)/gu;

export function extractHashtags(text: string, tags: Tag[]): HashtagResult {
  const byKey = new Map(tags.map((tag) => [normalizeKey(tag.name), tag]));
  const tagIds: number[] = [];
  const unknown: string[] = [];
  let removed = false;

  const stripped = text.replace(HASHTAG, (whole: string, prefix: string, word: string) => {
    const tag = byKey.get(normalizeKey(word));
    if (!tag) {
      if (!unknown.includes(`#${word}`)) unknown.push(`#${word}`);
      return whole;
    }
    if (!tagIds.includes(tag.id)) tagIds.push(tag.id);
    removed = true;
    return prefix;
  });

  const content = removed
    ? stripped
        .split('\n')
        .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
        .join('\n')
        .trim()
    : text.trim();

  return { content, tagIds, unknown };
}
```

`web/lib/telegram/keyboard.ts`:
```ts
import type { Tag } from '@/lib/notes/types';

export type InlineButton = { text: string; callback_data: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

export type CallbackAction =
  | { kind: 'toggle'; noteId: number; tagId: number }
  | { kind: 'delete'; noteId: number };

const MAX_TAG_BUTTONS = 30;

export function buildNoteKeyboard(noteId: number, allTags: Tag[], selectedIds: number[]): InlineKeyboard {
  const selected = new Set(selectedIds);
  const buttons = allTags.slice(0, MAX_TAG_BUTTONS).map((tag) => ({
    text: `${selected.has(tag.id) ? '✓ ' : ''}${tag.name}`,
    callback_data: `t:${noteId}:${tag.id}`,
  }));
  const rows: InlineButton[][] = [];
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
  rows.push([{ text: '🗑 Xoá', callback_data: `d:${noteId}` }]);
  return { inline_keyboard: rows };
}

export function parseCallbackData(data: string): CallbackAction | null {
  const toggle = /^t:(\d+):(\d+)$/.exec(data);
  if (toggle) return { kind: 'toggle', noteId: Number(toggle[1]), tagId: Number(toggle[2]) };
  const del = /^d:(\d+)$/.exec(data);
  if (del) return { kind: 'delete', noteId: Number(del[1]) };
  return null;
}

export function toggleTagIds(current: Tag[], tagId: number, defaultTagId: number): number[] {
  if (tagId === defaultTagId) return [];
  const real = current.filter((tag) => !tag.isDefault).map((tag) => tag.id);
  return real.includes(tagId) ? real.filter((id) => id !== tagId) : [...real, tagId];
}
```

- [ ] **Step 4: Chạy test**

Run: `npm test -- tests/telegram-pure.test.ts`
Expected: tất cả PASS.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): telegram hashtag parsing and inline keyboard helpers"
```

---

### Task 7: Bot Telegram — xử lý update và webhook

**Files:**
- Create: `web/lib/telegram/types.ts`, `web/lib/telegram/api.ts`, `web/lib/telegram/handler.ts`, `web/app/api/telegram/webhook/route.ts`
- Test: `web/tests/telegram-handler.test.ts`, `web/tests/webhook.test.ts`

**Interfaces:**
- Consumes: `createNote`, `getNote`, `deleteNotes`, `listNotes`, `listTags`, `listTagsWithCounts`, `getDefaultTag`, `setNoteTags`, `DomainError`, `extractHashtags`, `buildNoteKeyboard`, `parseCallbackData`, `toggleTagIds`, `safeEqual`, `getDb`, `jsonError`.
- Produces:
  - `callTelegram<T = unknown>(method: string, params: Record<string, unknown>): Promise<T>` — ném `Error('Telegram <method>: <description>')` khi `ok: false`.
  - Kiểu `TgUpdate`, `TgMessage`, `TgCallbackQuery`.
  - `interface BotConfig { ownerId: string }`, `handleUpdate(db: DB, update: TgUpdate, config: BotConfig): Promise<void>`.
  - `POST /api/telegram/webhook`.

- [ ] **Step 1: Kiểu Telegram và client API**

`web/lib/telegram/types.ts`:
```ts
import type { InlineKeyboard } from './keyboard';

export interface TgUser {
  id: number;
  first_name?: string;
}

export interface TgChat {
  id: number;
}

export interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  caption?: string;
  reply_markup?: InlineKeyboard;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}
```

`web/lib/telegram/api.ts`:
```ts
export async function callTelegram<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN chưa được đặt');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
  return data.result as T;
}
```

- [ ] **Step 2: Viết test thất bại cho handler**

`web/tests/telegram-handler.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNote, getNote, listNotes } from '@/lib/notes/notes';
import { createTag, getDefaultTag } from '@/lib/notes/tags';
import type { TgUpdate } from '@/lib/telegram/types';
import { createTestDb, type TestDb } from './helpers/test-db';

vi.mock('@/lib/telegram/api', () => ({ callTelegram: vi.fn(async () => ({})) }));
import { callTelegram } from '@/lib/telegram/api';
import { handleUpdate } from '@/lib/telegram/handler';

const tg = vi.mocked(callTelegram);
const OWNER = 111;
const STRANGER = 999;
const config = { ownerId: String(OWNER) };

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(async () => {
  await t.reset();
  tg.mockReset();
  tg.mockResolvedValue({});
});
afterAll(() => t.close());

let updateId = 0;
function msg(text: string | undefined, from = OWNER, extra: Record<string, unknown> = {}): TgUpdate {
  return {
    update_id: ++updateId,
    message: { message_id: 50, chat: { id: from }, from: { id: from }, text, ...extra },
  };
}
function cb(data: string, from = OWNER): TgUpdate {
  return {
    update_id: ++updateId,
    callback_query: {
      id: 'cq1',
      from: { id: from },
      data,
      message: { message_id: 60, chat: { id: from } },
    },
  };
}
const calls = (method: string) => tg.mock.calls.filter(([m]) => m === method).map(([, p]) => p as Record<string, any>);

describe('tin nhắn', () => {
  it('/start trả user ID cho cả người lạ, không lưu gì', async () => {
    await handleUpdate(t.db, msg('/start', STRANGER), config);
    expect(calls('sendMessage')[0].text).toContain(`${STRANGER}`);
    expect(calls('sendMessage')[0].text).not.toContain('/recent');
    expect((await listNotes(t.db)).notes).toHaveLength(0);
  });

  it('/start của chủ có hướng dẫn', async () => {
    await handleUpdate(t.db, msg('/start'), config);
    expect(calls('sendMessage')[0].text).toContain('/recent');
  });

  it('người lạ gửi text → bỏ qua hoàn toàn', async () => {
    await handleUpdate(t.db, msg('xin chào', STRANGER), config);
    expect(tg).not.toHaveBeenCalled();
    expect((await listNotes(t.db)).notes).toHaveLength(0);
  });

  it('ownerId trống → không ai lưu được', async () => {
    await handleUpdate(t.db, msg('xin chào'), { ownerId: '' });
    expect((await listNotes(t.db)).notes).toHaveLength(0);
  });

  it('lưu text, gắn tag từ hashtag, trả lời kèm bàn phím', async () => {
    await createTag(t.db, { name: 'Lịch sử' });
    await handleUpdate(t.db, msg('#LichSu Trận Bạch Đằng'), config);

    const [note] = (await listNotes(t.db)).notes;
    expect(note).toMatchObject({ content: 'Trận Bạch Đằng', source: 'telegram' });
    expect(note.tags.map((x) => x.name)).toEqual(['Lịch sử']);

    const reply = calls('sendMessage')[0];
    expect(reply.text).toBe(`✅ Đã lưu #${note.id}`);
    expect(reply.chat_id).toBe(OWNER);
    expect(reply.reply_parameters).toMatchObject({ message_id: 50 });
    expect(reply.reply_markup.inline_keyboard[0][1]).toEqual({
      text: '✓ Lịch sử',
      callback_data: `t:${note.id}:${note.tags[0].id}`,
    });
  });

  it('báo hashtag lạ nhưng vẫn lưu', async () => {
    await handleUpdate(t.db, msg('ghi chú #xyz'), config);
    expect((await listNotes(t.db)).notes[0].content).toBe('ghi chú #xyz');
    expect(calls('sendMessage')[0].text).toContain('⚠️ Không có tag #xyz');
  });

  it('chỉ toàn hashtag → không lưu', async () => {
    await createTag(t.db, { name: 'Lịch sử' });
    await handleUpdate(t.db, msg('#LichSu'), config);
    expect((await listNotes(t.db)).notes).toHaveLength(0);
    expect(calls('sendMessage')[0].text).toBe('Nội dung trống, không lưu');
  });

  it('ảnh không caption → "Chỉ hỗ trợ text"; có caption → lưu caption', async () => {
    await handleUpdate(t.db, msg(undefined, OWNER, { photo: [{}] }), config);
    expect(calls('sendMessage')[0].text).toBe('Chỉ hỗ trợ text');
    await handleUpdate(t.db, msg(undefined, OWNER, { caption: 'chú thích ảnh' }), config);
    expect((await listNotes(t.db)).notes[0].content).toBe('chú thích ảnh');
  });

  it('nội dung quá dài → báo lỗi, không ném', async () => {
    await handleUpdate(t.db, msg('a'.repeat(20001)), config);
    expect(calls('sendMessage')[0].text).toBe('❌ Nội dung tối đa 20000 ký tự');
  });

  it('/tags và /recent', async () => {
    await createTag(t.db, { name: 'Lịch sử' });
    await createNote(t.db, { content: 'ghi chú đầu', source: 'web' });
    await handleUpdate(t.db, msg('/tags'), config);
    expect(calls('sendMessage')[0].text).toBe('• Chưa phân loại (1)\n• Lịch sử (0)');
    await handleUpdate(t.db, msg('/recent'), config);
    expect(calls('sendMessage')[1].text).toBe('#1 [Chưa phân loại]\nghi chú đầu');
  });

  it('lỗi bất ngờ khi lưu → nhắn "❌ Lỗi khi lưu" và không ném ra ngoài', async () => {
    tg.mockImplementationOnce(async () => {
      throw new Error('mạng lỗi');
    });
    await expect(handleUpdate(t.db, msg('xin chào'), config)).resolves.toBeUndefined();
    expect(calls('sendMessage').at(-1)?.text).toBe('❌ Lỗi khi lưu');
  });
});

describe('callback', () => {
  it('bật tag → bỏ tag mặc định, cập nhật bàn phím', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const note = await createNote(t.db, { content: 'x', source: 'telegram' });
    await handleUpdate(t.db, cb(`t:${note.id}:${ls.id}`), config);

    expect((await getNote(t.db, note.id))!.tags.map((x) => x.name)).toEqual(['Lịch sử']);
    const edit = calls('editMessageReplyMarkup')[0];
    expect(edit).toMatchObject({ chat_id: OWNER, message_id: 60 });
    expect(edit.reply_markup.inline_keyboard[0][1].text).toBe('✓ Lịch sử');
    expect(calls('answerCallbackQuery')[0]).toMatchObject({ callback_query_id: 'cq1', text: 'Lịch sử' });
  });

  it('bấm tag mặc định → về Chưa phân loại', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const def = await getDefaultTag(t.db);
    const note = await createNote(t.db, { content: 'x', source: 'telegram', tagIds: [ls.id] });
    await handleUpdate(t.db, cb(`t:${note.id}:${def.id}`), config);
    expect((await getNote(t.db, note.id))!.tags.map((x) => x.name)).toEqual(['Chưa phân loại']);
  });

  it('"message is not modified" từ Telegram bị bỏ qua', async () => {
    const def = await getDefaultTag(t.db);
    const note = await createNote(t.db, { content: 'x', source: 'telegram' });
    tg.mockImplementation(async (method: string) => {
      if (method === 'editMessageReplyMarkup') throw new Error('Telegram editMessageReplyMarkup: Bad Request: message is not modified');
      return {};
    });
    await expect(handleUpdate(t.db, cb(`t:${note.id}:${def.id}`), config)).resolves.toBeUndefined();
    expect(calls('answerCallbackQuery')).toHaveLength(1);
  });

  it('xoá note', async () => {
    const note = await createNote(t.db, { content: 'x', source: 'telegram' });
    await handleUpdate(t.db, cb(`d:${note.id}`), config);
    expect(await getNote(t.db, note.id)).toBeNull();
    expect(calls('editMessageText')[0]).toMatchObject({ message_id: 60, text: `🗑 Đã xoá #${note.id}` });
  });

  it('note không còn → trả lời "Ghi chú không còn"', async () => {
    await handleUpdate(t.db, cb('t:999:1'), config);
    expect(calls('answerCallbackQuery')[0]).toMatchObject({ text: 'Ghi chú không còn' });
  });

  it('người lạ bấm nút → không đổi gì', async () => {
    const note = await createNote(t.db, { content: 'x', source: 'telegram' });
    await handleUpdate(t.db, cb(`d:${note.id}`, STRANGER), config);
    expect(await getNote(t.db, note.id)).not.toBeNull();
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `npm test -- tests/telegram-handler.test.ts`
Expected: FAIL — không resolve được `@/lib/telegram/handler`.

- [ ] **Step 4: Cài đặt handler**

`web/lib/telegram/handler.ts`:
```ts
import type { DB } from '@/lib/db/types';
import { DomainError } from '@/lib/notes/errors';
import { createNote, deleteNotes, getNote, listNotes } from '@/lib/notes/notes';
import { getDefaultTag, listTags, listTagsWithCounts, setNoteTags } from '@/lib/notes/tags';
import { callTelegram } from './api';
import { extractHashtags } from './hashtags';
import { buildNoteKeyboard, parseCallbackData, toggleTagIds } from './keyboard';
import type { TgCallbackQuery, TgMessage, TgUpdate } from './types';

export interface BotConfig {
  ownerId: string;
}

const isCommand = (text: string, name: string) => new RegExp(`^/${name}(@\\w+)?(\\s|$)`).test(text);
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export async function handleUpdate(db: DB, update: TgUpdate, config: BotConfig): Promise<void> {
  if (update.message) await handleMessage(db, update.message, config);
  else if (update.callback_query) await handleCallback(db, update.callback_query, config);
}

async function handleMessage(db: DB, msg: TgMessage, config: BotConfig): Promise<void> {
  const fromId = String(msg.from?.id ?? '');
  const text = msg.text ?? msg.caption ?? '';
  const reply = (body: string, extra: Record<string, unknown> = {}) =>
    callTelegram('sendMessage', {
      chat_id: msg.chat.id,
      text: body,
      reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true },
      ...extra,
    });

  if (isCommand(text, 'start')) {
    const help =
      fromId === config.ownerId
        ? '\n\nGửi bất kỳ đoạn text nào để lưu vào BangNote. Thêm #TenTag để gắn tag.\n/tags – danh sách tag\n/recent – 5 ghi chú mới nhất'
        : '';
    await reply(`Telegram user ID của bạn: ${fromId}${help}`);
    return;
  }
  if (!config.ownerId || fromId !== config.ownerId) return;

  try {
    if (isCommand(text, 'tags')) {
      const tags = await listTagsWithCounts(db);
      await reply(tags.map((tag) => `• ${tag.name} (${tag.noteCount})`).join('\n'));
      return;
    }
    if (isCommand(text, 'recent')) {
      const { notes } = await listNotes(db, { limit: 5 });
      const body = notes
        .map((n) => `#${n.id} [${n.tags.map((tag) => tag.name).join(', ')}]\n${truncate(n.content, 200)}`)
        .join('\n\n');
      await reply(body || 'Chưa có ghi chú nào');
      return;
    }
    if (!text.trim()) {
      await reply('Chỉ hỗ trợ text');
      return;
    }

    const allTags = await listTags(db);
    const { content, tagIds, unknown } = extractHashtags(text, allTags);
    if (!content) {
      await reply('Nội dung trống, không lưu');
      return;
    }
    const note = await createNote(db, { content, source: 'telegram', tagIds });
    const warning = unknown.length ? `\n⚠️ Không có tag ${unknown.join(', ')}` : '';
    await reply(`✅ Đã lưu #${note.id}${warning}`, {
      reply_markup: buildNoteKeyboard(note.id, allTags, note.tags.map((tag) => tag.id)),
    });
  } catch (err) {
    if (err instanceof DomainError) {
      await reply(`❌ ${err.message}`);
      return;
    }
    console.error('telegram message failed', err);
    await reply('❌ Lỗi khi lưu').catch(() => undefined);
  }
}

async function handleCallback(db: DB, cq: TgCallbackQuery, config: BotConfig): Promise<void> {
  const answer = (text?: string) =>
    callTelegram('answerCallbackQuery', { callback_query_id: cq.id, ...(text ? { text } : {}) });

  if (!config.ownerId || String(cq.from.id) !== config.ownerId) {
    await answer();
    return;
  }
  const action = parseCallbackData(cq.data ?? '');
  const msg = cq.message;
  if (!action || !msg) {
    await answer();
    return;
  }
  const note = await getNote(db, action.noteId);
  if (!note) {
    await answer('Ghi chú không còn');
    return;
  }

  if (action.kind === 'delete') {
    await deleteNotes(db, [note.id]);
    await callTelegram('editMessageText', {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      text: `🗑 Đã xoá #${note.id}`,
    });
    await answer('Đã xoá');
    return;
  }

  const def = await getDefaultTag(db);
  const tags = await setNoteTags(db, note.id, toggleTagIds(note.tags, action.tagId, def.id));
  const allTags = await listTags(db);
  try {
    await callTelegram('editMessageReplyMarkup', {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      reply_markup: buildNoteKeyboard(note.id, allTags, tags.map((tag) => tag.id)),
    });
  } catch (err) {
    if (!(err instanceof Error && err.message.includes('message is not modified'))) throw err;
  }
  await answer(tags.map((tag) => tag.name).join(', '));
}
```

- [ ] **Step 5: Chạy test handler**

Run: `npm test -- tests/telegram-handler.test.ts`
Expected: tất cả PASS.

- [ ] **Step 6: Viết test thất bại cho webhook route**

`web/tests/webhook.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ handleUpdate: vi.fn(async () => undefined) }));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/telegram/handler', () => ({ handleUpdate: h.handleUpdate }));

import { POST } from '@/app/api/telegram/webhook/route';

beforeEach(() => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'hook-secret';
  process.env.TELEGRAM_OWNER_ID = '111';
  h.handleUpdate.mockReset();
  h.handleUpdate.mockResolvedValue(undefined);
});

function req(secret: string | null, body: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== null) headers['x-telegram-bot-api-secret-token'] = secret;
  return new Request('http://localhost/api/telegram/webhook', { method: 'POST', headers, body });
}

describe('POST /api/telegram/webhook', () => {
  it('sai hoặc thiếu secret → 401, không xử lý', async () => {
    expect((await POST(req('sai', '{}'))).status).toBe(401);
    expect((await POST(req(null, '{}'))).status).toBe(401);
    process.env.TELEGRAM_WEBHOOK_SECRET = '';
    expect((await POST(req('', '{}'))).status).toBe(401);
    expect(h.handleUpdate).not.toHaveBeenCalled();
  });

  it('đúng secret → gọi handler với ownerId, trả 200', async () => {
    const res = await POST(req('hook-secret', '{"update_id":1}'));
    expect(res.status).toBe(200);
    expect(h.handleUpdate).toHaveBeenCalledWith({}, { update_id: 1 }, { ownerId: '111' });
  });

  it('handler ném lỗi → vẫn 200 để Telegram không gửi lại', async () => {
    h.handleUpdate.mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await POST(req('hook-secret', '{"update_id":2}'))).status).toBe(200);
  });

  it('body hỏng → 400', async () => {
    expect((await POST(req('hook-secret', '{'))).status).toBe(400);
  });
});
```

- [ ] **Step 7: Chạy test, xác nhận thất bại**

Run: `npm test -- tests/webhook.test.ts`
Expected: FAIL — không resolve được `@/app/api/telegram/webhook/route`.

- [ ] **Step 8: Cài đặt route webhook**

`web/app/api/telegram/webhook/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/auth/safe-equal';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/http';
import { handleUpdate } from '@/lib/telegram/handler';
import type { TgUpdate } from '@/lib/telegram/types';

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!secret || !safeEqual(got, secret)) return jsonError(401, 'Sai secret');

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return jsonError(400, 'Body không hợp lệ');
  }

  try {
    await handleUpdate(getDb(), update, { ownerId: process.env.TELEGRAM_OWNER_ID ?? '' });
  } catch (err) {
    console.error('telegram update failed', err);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 9: Toàn bộ test + typecheck + commit**

Run: `npm test && npm run typecheck`
Expected: PASS / không lỗi.

```bash
git add web
git commit -m "feat(web): telegram bot webhook with hashtag tagging and inline tag toggles"
```

---

### Task 8: Đăng nhập web admin

**Files:**
- Create: `web/lib/auth/session.ts`, `web/lib/auth/require.ts`, `web/proxy.ts`, `web/app/login/page.tsx`, `web/app/login/actions.ts`
- Test: `web/tests/session.test.ts`

**Interfaces:**
- Consumes: `safeEqual`.
- Produces:
  - `SESSION_COOKIE = 'bn_session'`, `SESSION_MAX_AGE = 2592000` (30 ngày, giây).
  - `createSessionToken(now?: number): string` — dạng `<exp>.<hmac base64url>`.
  - `verifySessionToken(token: string | undefined, now?: number): boolean`
  - `checkPassword(input: string): boolean`
  - `requireSession(): Promise<void>` — redirect `/login` nếu không hợp lệ; dùng trong mọi server component/action của admin.
  - Server action `login(formData)`, `logout()`.

- [ ] **Step 1: Viết test thất bại**

`web/tests/session.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION_MAX_AGE, checkPassword, createSessionToken, verifySessionToken } from '@/lib/auth/session';

beforeEach(() => {
  process.env.SESSION_SECRET = 'a-very-long-session-secret';
  process.env.ADMIN_PASSWORD = 'mat-khau';
});

describe('session token', () => {
  it('token vừa tạo hợp lệ', () => {
    expect(verifySessionToken(createSessionToken())).toBe(true);
  });

  it('hết hạn sau 30 ngày', () => {
    const now = Date.now();
    const token = createSessionToken(now);
    expect(verifySessionToken(token, now + (SESSION_MAX_AGE - 60) * 1000)).toBe(true);
    expect(verifySessionToken(token, now + (SESSION_MAX_AGE + 60) * 1000)).toBe(false);
  });

  it('bị sửa hoặc sai định dạng → không hợp lệ', () => {
    const [exp, sig] = createSessionToken().split('.');
    expect(verifySessionToken(`${Number(exp) + 1000}.${sig}`)).toBe(false);
    expect(verifySessionToken(`${exp}.x${sig}`)).toBe(false);
    expect(verifySessionToken('rác')).toBe(false);
    expect(verifySessionToken('')).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
  });

  it('đổi SESSION_SECRET → token cũ mất hiệu lực', () => {
    const token = createSessionToken();
    process.env.SESSION_SECRET = 'another-long-session-secret';
    expect(verifySessionToken(token)).toBe(false);
  });

  it('SESSION_SECRET ngắn hơn 16 ký tự → ném lỗi rõ ràng', () => {
    process.env.SESSION_SECRET = 'short';
    expect(() => createSessionToken()).toThrow('SESSION_SECRET');
  });
});

describe('checkPassword', () => {
  it('đúng / sai / chưa đặt mật khẩu', () => {
    expect(checkPassword('mat-khau')).toBe(true);
    expect(checkPassword('sai')).toBe(false);
    process.env.ADMIN_PASSWORD = '';
    expect(checkPassword('')).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test -- tests/session.test.ts`
Expected: FAIL — không resolve được `@/lib/auth/session`.

- [ ] **Step 3: Cài đặt session**

`web/lib/auth/session.ts`:
```ts
import { createHmac } from 'node:crypto';
import { safeEqual } from './safe-equal';

export const SESSION_COOKIE = 'bn_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) throw new Error('SESSION_SECRET phải có ít nhất 16 ký tự');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionToken(now = Date.now()): string {
  const exp = String(Math.floor(now / 1000) + SESSION_MAX_AGE);
  return `${exp}.${sign(exp)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [exp, sig, extra] = token.split('.');
  if (!exp || !sig || extra !== undefined || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 < now) return false;
  return safeEqual(sig, sign(exp));
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && safeEqual(input, expected);
}
```

- [ ] **Step 4: Chạy test**

Run: `npm test -- tests/session.test.ts`
Expected: tất cả PASS.

- [ ] **Step 5: requireSession, proxy, trang login**

`web/lib/auth/require.ts`:
```ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySessionToken } from './session';

export async function requireSession(): Promise<void> {
  const store = await cookies();
  if (!verifySessionToken(store.get(SESSION_COOKIE)?.value)) redirect('/login');
}
```

`web/proxy.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

export function proxy(req: NextRequest) {
  if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!api|login|_next/static|_next/image|favicon.ico).*)'],
};
```

`web/app/login/actions.ts`:
```ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_MAX_AGE, checkPassword, createSessionToken } from '@/lib/auth/session';

export async function login(formData: FormData): Promise<void> {
  const password = String(formData.get('password') ?? '');
  if (!checkPassword(password)) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    redirect('/login?error=1');
  }
  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  redirect('/');
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
```

`web/app/login/page.tsx`:
```tsx
import { login } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form action={login} className="w-full max-w-xs space-y-3 rounded-xl bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">BangNote</h1>
        <input
          name="password"
          type="password"
          required
          autoFocus
          placeholder="Mật khẩu"
          className="w-full rounded-lg border px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">Sai mật khẩu</p>}
        <button className="w-full rounded-lg bg-slate-900 py-2 text-white hover:bg-slate-700">Đăng nhập</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Kiểm tra bằng tay**

Tạo `web/.env.local` tạm để chạy dev (không commit):
```
SESSION_SECRET=dev-session-secret-123456
ADMIN_PASSWORD=dev
```
Run: `npm run dev`, mở `http://localhost:3000/`
Expected: bị chuyển tới `/login`; nhập sai → "Sai mật khẩu"; nhập `dev` → về `/` (trang tạm "BangNote"). Dừng dev server.

- [ ] **Step 7: Toàn bộ test + typecheck + build + commit**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS / không lỗi / build thành công, output có dòng `ƒ Proxy`.

```bash
git add web
git commit -m "feat(web): password login with signed session cookie and proxy guard"
```

---

### Task 9: Trang ghi chú (danh sách, tìm, lọc, thêm nhanh, sửa, gắn tag hàng loạt)

**Files:**
- Create: `web/lib/notes/filters.ts`, `web/lib/format.ts`
- Create: `web/app/(admin)/layout.tsx`, `web/app/(admin)/page.tsx`, `web/app/(admin)/actions.ts`
- Create: `web/components/ActionButton.tsx`, `web/components/TagChip.tsx`, `web/components/TagPicker.tsx`, `web/components/QuickAdd.tsx`, `web/components/Filters.tsx`, `web/components/NoteCard.tsx`, `web/components/NoteList.tsx`
- Delete: `web/app/page.tsx`
- Test: `web/tests/filters.test.ts`, `web/tests/format.test.ts`

**Interfaces:**
- Consumes: `listNotes`, `createNote`, `updateNoteContent`, `deleteNotes`, `setNoteTags`, `setTagsForNotes`, `listTags`, `requireSession`, `logout`, `DomainError`, `SOURCES`.
- Produces:
  - `parseNoteFilters(sp: Record<string, string | string[] | undefined>): NoteFilters` với `NoteFilters = { q: string; tagIds: number[]; sources: Source[]; limit: number }` (tham số URL: `q`, `tag` lặp lại, `source` lặp lại, `limit`; mặc định limit 50, kẹp 1..500; bỏ giá trị lạ).
  - `filtersToQuery(f: NoteFilters): string` (không có dấu `?`; bỏ tham số rỗng; bỏ `limit` khi = 50).
  - `SOURCE_LABELS: Record<Source, string>`.
  - `formatRelative(date: Date, now?: Date): string` (tiếng Việt).
  - `type ActionState = { ok?: boolean; error?: string }` và các server action: `createNoteAction(prev, formData)`, `updateNoteAction(id, content)`, `setNoteTagsAction(id, tagIds)`, `bulkSetTagsAction(ids, tagIds)`, `deleteNotesAction(ids)` — tất cả trả `Promise<ActionState>`.
  - `ActionButton` (client) — dùng lại ở Task 10.
  - `TagChip({ tag })` — dùng lại ở Task 10.

- [ ] **Step 1: Viết test thất bại cho filters và format**

`web/tests/filters.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { filtersToQuery, parseNoteFilters } from '@/lib/notes/filters';

describe('parseNoteFilters', () => {
  it('mặc định', () => {
    expect(parseNoteFilters({})).toEqual({ q: '', tagIds: [], sources: [], limit: 50 });
  });

  it('đọc tham số đơn và lặp lại, bỏ giá trị lạ', () => {
    expect(
      parseNoteFilters({ q: ' lich su ', tag: ['2', '3', 'abc', '2'], source: ['web', 'email'], limit: '100' }),
    ).toEqual({ q: 'lich su', tagIds: [2, 3], sources: ['web'], limit: 100 });
    expect(parseNoteFilters({ tag: '5', source: 'telegram' })).toMatchObject({ tagIds: [5], sources: ['telegram'] });
  });

  it('kẹp limit', () => {
    expect(parseNoteFilters({ limit: '9999' }).limit).toBe(500);
    expect(parseNoteFilters({ limit: '-3' }).limit).toBe(50);
    expect(parseNoteFilters({ limit: 'x' }).limit).toBe(50);
  });
});

describe('filtersToQuery', () => {
  it('round-trip và bỏ tham số rỗng', () => {
    const f = { q: 'y học', tagIds: [2, 3], sources: ['web' as const], limit: 100 };
    const qs = filtersToQuery(f);
    expect(qs).toBe('q=y+h%E1%BB%8Dc&tag=2&tag=3&source=web&limit=100');
    const sp = Object.fromEntries(
      [...new URLSearchParams(qs).keys()].map((k) => [k, new URLSearchParams(qs).getAll(k)]),
    );
    expect(parseNoteFilters(sp)).toEqual(f);
    expect(filtersToQuery({ q: '', tagIds: [], sources: [], limit: 50 })).toBe('');
  });
});
```

`web/tests/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatRelative } from '@/lib/format';

const now = new Date('2026-09-27T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('formatRelative', () => {
  it('dưới 1 phút', () => {
    expect(formatRelative(ago(20_000), now)).toBe('vừa xong');
  });
  it('phút, giờ, ngày', () => {
    expect(formatRelative(ago(5 * 60_000), now)).toBe('5 phút trước');
    expect(formatRelative(ago(3 * 3_600_000), now)).toBe('3 giờ trước');
    expect(formatRelative(ago(2 * 86_400_000), now)).toBe('2 ngày trước');
  });
  it('quá 30 ngày → ngày tháng', () => {
    expect(formatRelative(new Date('2026-01-05T08:00:00Z'), now)).toBe('05/01/2026');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test -- tests/filters.test.ts tests/format.test.ts`
Expected: FAIL — không resolve được `@/lib/notes/filters` và `@/lib/format`.

- [ ] **Step 3: Cài đặt filters và format**

`web/lib/notes/filters.ts`:
```ts
import { SOURCES, type Source } from '@/lib/db/schema';

export interface NoteFilters {
  q: string;
  tagIds: number[];
  sources: Source[];
  limit: number;
}

export const PAGE_SIZE = 50;

export const SOURCE_LABELS: Record<Source, string> = {
  telegram: 'Telegram',
  extension: 'Extension',
  widget: 'Widget',
  web: 'Web',
};

type SearchParams = Record<string, string | string[] | undefined>;

const all = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function parseNoteFilters(sp: SearchParams): NoteFilters {
  const tagIds = [...new Set(all(sp.tag).filter((s) => /^\d+$/.test(s)).map(Number))].filter((n) => n > 0);
  const sources = [...new Set(all(sp.source))].filter((s): s is Source => (SOURCES as readonly string[]).includes(s));
  const rawLimit = Number(all(sp.limit)[0]);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : PAGE_SIZE;
  return { q: (all(sp.q)[0] ?? '').trim(), tagIds, sources, limit };
}

export function filtersToQuery(f: NoteFilters): string {
  const params = new URLSearchParams();
  if (f.q) params.set('q', f.q);
  for (const id of f.tagIds) params.append('tag', String(id));
  for (const s of f.sources) params.append('source', s);
  if (f.limit !== PAGE_SIZE) params.set('limit', String(f.limit));
  return params.toString();
}
```

`web/lib/format.ts`:
```ts
const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'always' });

export function formatRelative(date: Date, now = new Date()): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'vừa xong';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days <= 30) return rtf.format(-days, 'day');
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
}
```

- [ ] **Step 4: Chạy test**

Run: `npm test -- tests/filters.test.ts tests/format.test.ts`
Expected: PASS. (`numeric: 'always'` để ra "2 ngày trước" thay vì "hôm kia".)

- [ ] **Step 5: Server actions**

`web/app/(admin)/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/require';
import { getDb } from '@/lib/db/client';
import { DomainError } from '@/lib/notes/errors';
import { createNote, deleteNotes, setTagsForNotes, updateNoteContent } from '@/lib/notes/notes';
import { setNoteTags } from '@/lib/notes/tags';

export type ActionState = { ok?: boolean; error?: string };

const id = z.number().int().positive();
const ids = z.array(id).max(500);

async function run(fn: () => Promise<unknown>): Promise<ActionState> {
  await requireSession();
  try {
    await fn();
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    if (err instanceof z.ZodError) return { error: 'Dữ liệu không hợp lệ' };
    throw err;
  }
  revalidatePath('/');
  return { ok: true };
}

export async function createNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(() =>
    createNote(getDb(), {
      content: String(formData.get('content') ?? ''),
      source: 'web',
      tagIds: ids.parse(formData.getAll('tag').map(Number)),
    }),
  );
}

export async function updateNoteAction(noteId: number, content: string): Promise<ActionState> {
  return run(() => updateNoteContent(getDb(), id.parse(noteId), z.string().parse(content)));
}

export async function setNoteTagsAction(noteId: number, tagIds: number[]): Promise<ActionState> {
  return run(() => setNoteTags(getDb(), id.parse(noteId), ids.parse(tagIds)));
}

export async function bulkSetTagsAction(noteIds: number[], tagIds: number[]): Promise<ActionState> {
  return run(() => setTagsForNotes(getDb(), ids.parse(noteIds), ids.parse(tagIds)));
}

export async function deleteNotesAction(noteIds: number[]): Promise<ActionState> {
  return run(() => deleteNotes(getDb(), ids.parse(noteIds)));
}
```

- [ ] **Step 6: Component dùng chung**

`web/components/ActionButton.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import type { ActionState } from '@/app/(admin)/actions';

export function ActionButton({
  action,
  label,
  pendingLabel = 'Đang xử lý…',
  okMessage,
  className = 'rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50',
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  pendingLabel?: string;
  okMessage?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <button disabled={pending} className={className}>
        {pending ? pendingLabel : label}
      </button>
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      {state.ok && okMessage && <span className="text-sm text-green-700">{okMessage}</span>}
    </form>
  );
}
```

`web/components/TagChip.tsx`:
```tsx
import type { Tag } from '@/lib/notes/types';

export function TagChip({ tag }: { tag: Tag }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: tag.color }}
    >
      {tag.name}
    </span>
  );
}
```

`web/components/TagPicker.tsx`:
```tsx
'use client';

import { useState } from 'react';
import type { Tag } from '@/lib/notes/types';

/** Chọn nhiều tag thật; không chọn gì = "Chưa phân loại". */
export function TagPicker({
  tags,
  initial,
  onApply,
  onCancel,
  applyLabel = 'Áp dụng',
}: {
  tags: Tag[];
  initial: number[];
  onApply: (tagIds: number[]) => void;
  onCancel: () => void;
  applyLabel?: string;
}) {
  const [selected, setSelected] = useState(new Set(initial));
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const realTags = tags.filter((t) => !t.isDefault);

  return (
    <div className="space-y-2 rounded-lg border bg-white p-3 shadow">
      <div className="flex flex-wrap gap-2">
        {realTags.map((tag) => (
          <label
            key={tag.id}
            className="flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-sm"
            style={selected.has(tag.id) ? { borderColor: tag.color, backgroundColor: `${tag.color}22` } : undefined}
          >
            <input type="checkbox" checked={selected.has(tag.id)} onChange={() => toggle(tag.id)} />
            {tag.name}
          </label>
        ))}
        {!realTags.length && <span className="text-sm text-slate-500">Chưa có tag nào — tạo ở trang Tag.</span>}
      </div>
      <p className="text-xs text-slate-500">Không chọn tag nào → ghi chú về &quot;Chưa phân loại&quot;.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onApply([...selected])}
          className="rounded-lg bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700"
        >
          {applyLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border px-3 py-1 text-sm">
          Huỷ
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Thêm nhanh và bộ lọc**

`web/components/QuickAdd.tsx`:
```tsx
'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createNoteAction } from '@/app/(admin)/actions';
import type { Tag } from '@/lib/notes/types';

export function QuickAdd({ tags }: { tags: Tag[] }) {
  const [state, formAction, pending] = useActionState(createNoteAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
      <textarea
        name="content"
        required
        rows={3}
        placeholder="Dán đoạn text cần lưu…"
        className="w-full rounded-lg border px-3 py-2"
      />
      <div className="flex flex-wrap items-center gap-2">
        {tags
          .filter((t) => !t.isDefault)
          .map((tag) => (
            <label key={tag.id} className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="tag" value={tag.id} />
              {tag.name}
            </label>
          ))}
        <button
          disabled={pending}
          className="ml-auto rounded-lg bg-slate-900 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? 'Đang lưu…' : 'Lưu'}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
```

`web/components/Filters.tsx`:
```tsx
import Link from 'next/link';
import { SOURCES } from '@/lib/db/schema';
import { SOURCE_LABELS, type NoteFilters } from '@/lib/notes/filters';
import type { Tag } from '@/lib/notes/types';

/** Form GET thuần — bộ lọc nằm trên URL nên bookmark được. */
export function Filters({ tags, filters }: { tags: Tag[]; filters: NoteFilters }) {
  return (
    <form method="get" className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex gap-2">
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Tìm (gõ không dấu cũng được)…"
          className="flex-1 rounded-lg border px-3 py-1.5"
        />
        <button className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm text-white hover:bg-slate-700">Lọc</button>
        <Link href="/" className="rounded-lg border px-3 py-1.5 text-sm">
          Xoá lọc
        </Link>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {tags.map((tag) => (
          <label key={tag.id} className="flex items-center gap-1">
            <input type="checkbox" name="tag" value={tag.id} defaultChecked={filters.tagIds.includes(tag.id)} />
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
            {tag.name}
          </label>
        ))}
        <span className="text-slate-300">|</span>
        {SOURCES.map((s) => (
          <label key={s} className="flex items-center gap-1">
            <input type="checkbox" name="source" value={s} defaultChecked={filters.sources.includes(s)} />
            {SOURCE_LABELS[s]}
          </label>
        ))}
      </div>
    </form>
  );
}
```

- [ ] **Step 8: Thẻ ghi chú và danh sách**

`web/components/NoteCard.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { deleteNotesAction, setNoteTagsAction, updateNoteAction } from '@/app/(admin)/actions';
import { formatRelative } from '@/lib/format';
import { SOURCE_LABELS } from '@/lib/notes/filters';
import type { Note, Tag } from '@/lib/notes/types';
import { TagChip } from './TagChip';
import { TagPicker } from './TagPicker';

export function NoteCard({
  note,
  tags,
  selected,
  onSelect,
}: {
  note: Note;
  tags: Tag[];
  selected: boolean;
  onSelect: (checked: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const long = note.content.split('\n').length > 6 || note.content.length > 600;

  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.error);
      if (!res.error) after?.();
    });

  const copy = async () => {
    await navigator.clipboard.writeText(note.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <article className={`space-y-2 rounded-xl bg-white p-4 shadow-sm ${pending ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="mt-1"
          aria-label={`Chọn ghi chú #${note.id}`}
        />
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(Math.max(draft.split('\n').length, 3), 20)}
                className="w-full rounded-lg border px-3 py-2"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => run(() => updateNoteAction(note.id, draft), () => setEditing(false))}
                  className="rounded-lg bg-slate-900 px-3 py-1 text-sm text-white"
                >
                  Lưu
                </button>
                <button
                  onClick={() => {
                    setDraft(note.content);
                    setEditing(false);
                  }}
                  className="rounded-lg border px-3 py-1 text-sm"
                >
                  Huỷ
                </button>
              </div>
            </div>
          ) : (
            <p
              onClick={() => long && setExpanded(!expanded)}
              className={`whitespace-pre-wrap break-words ${long && !expanded ? 'line-clamp-6 cursor-pointer' : ''}`}
            >
              {note.content}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-7 text-sm text-slate-500">
        <button onClick={() => setPicking(!picking)} className="flex flex-wrap gap-1" title="Đổi tag">
          {note.tags.map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
        </button>
        <span>
          #{note.id} · {SOURCE_LABELS[note.source]} ·{' '}
          <time dateTime={note.createdAt.toISOString()} suppressHydrationWarning>
            {formatRelative(note.createdAt)}
          </time>
        </span>
        {note.sourceUrl && (
          <a href={note.sourceUrl} target="_blank" rel="noreferrer" className="max-w-xs truncate text-blue-600 hover:underline">
            {note.sourceTitle || note.sourceUrl}
          </a>
        )}
        <span className="ml-auto flex gap-3">
          <button onClick={copy} className="hover:text-slate-900">
            {copied ? 'Đã copy' : 'Copy'}
          </button>
          <button onClick={() => setEditing(true)} className="hover:text-slate-900">
            Sửa
          </button>
          <button
            onClick={() => confirm(`Xoá ghi chú #${note.id}?`) && run(() => deleteNotesAction([note.id]))}
            className="hover:text-red-600"
          >
            Xoá
          </button>
        </span>
      </div>

      {picking && (
        <div className="pl-7">
          <TagPicker
            tags={tags}
            initial={note.tags.filter((t) => !t.isDefault).map((t) => t.id)}
            onApply={(ids) => run(() => setNoteTagsAction(note.id, ids), () => setPicking(false))}
            onCancel={() => setPicking(false)}
          />
        </div>
      )}
      {error && <p className="pl-7 text-sm text-red-600">{error}</p>}
    </article>
  );
}
```

`web/components/NoteList.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { bulkSetTagsAction, deleteNotesAction } from '@/app/(admin)/actions';
import type { Note, Tag } from '@/lib/notes/types';
import { NoteCard } from './NoteCard';
import { TagPicker } from './TagPicker';

export function NoteList({ notes, tags }: { notes: Note[]; tags: Tag[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const visibleIds = notes.map((n) => n.id);
  const chosen = visibleIds.filter((id) => selected.has(id));

  const select = (id: number, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.error);
      if (!res.error) {
        setSelected(new Set());
        setPicking(false);
      }
    });

  if (!notes.length) return <p className="py-10 text-center text-slate-500">Không có ghi chú nào.</p>;

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl bg-slate-100/90 px-4 py-2 text-sm backdrop-blur">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={chosen.length === notes.length}
            onChange={(e) => setSelected(e.target.checked ? new Set(visibleIds) : new Set())}
          />
          Chọn tất cả
        </label>
        {chosen.length > 0 && (
          <>
            <span className="text-slate-600">Đã chọn {chosen.length}</span>
            <button onClick={() => setPicking(!picking)} className="rounded-lg border bg-white px-3 py-1" disabled={pending}>
              Chuyển tag
            </button>
            <button
              onClick={() => confirm(`Xoá ${chosen.length} ghi chú?`) && run(() => deleteNotesAction(chosen))}
              className="rounded-lg border border-red-300 bg-white px-3 py-1 text-red-600"
              disabled={pending}
            >
              Xoá
            </button>
          </>
        )}
        {error && <span className="text-red-600">{error}</span>}
      </div>
      {picking && chosen.length > 0 && (
        <TagPicker
          tags={tags}
          initial={[]}
          applyLabel={`Chuyển ${chosen.length} ghi chú`}
          onApply={(tagIds) => run(() => bulkSetTagsAction(chosen, tagIds))}
          onCancel={() => setPicking(false)}
        />
      )}
      {notes.map((note) => (
        <NoteCard
          key={`${note.id}-${note.updatedAt.getTime()}`}
          note={note}
          tags={tags}
          selected={selected.has(note.id)}
          onSelect={(checked) => select(note.id, checked)}
        />
      ))}
    </div>
  );
}
```

(Key gồm `updatedAt` để thẻ reset state nháp khi dữ liệu server thay đổi.)

- [ ] **Step 9: Layout admin và trang chính**

Xoá `web/app/page.tsx` (trang tạm từ Task 1).

`web/app/(admin)/layout.tsx`:
```tsx
import Link from 'next/link';
import { logout } from '@/app/login/actions';
import { requireSession } from '@/lib/auth/require';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="flex items-center gap-4">
        <Link href="/" className="text-lg font-semibold">
          BangNote
        </Link>
        <nav className="flex gap-3 text-sm text-slate-600">
          <Link href="/" className="hover:text-slate-900">
            Ghi chú
          </Link>
          <Link href="/tags" className="hover:text-slate-900">
            Tag
          </Link>
          <Link href="/settings" className="hover:text-slate-900">
            Cài đặt
          </Link>
        </nav>
        <form action={logout} className="ml-auto">
          <button className="text-sm text-slate-500 hover:text-slate-900">Đăng xuất</button>
        </form>
      </header>
      {children}
    </div>
  );
}
```

`web/app/(admin)/page.tsx`:
```tsx
import Link from 'next/link';
import { Filters } from '@/components/Filters';
import { NoteList } from '@/components/NoteList';
import { QuickAdd } from '@/components/QuickAdd';
import { requireSession } from '@/lib/auth/require';
import { getDb } from '@/lib/db/client';
import { PAGE_SIZE, filtersToQuery, parseNoteFilters } from '@/lib/notes/filters';
import { listNotes } from '@/lib/notes/notes';
import { listTags } from '@/lib/notes/tags';

export const dynamic = 'force-dynamic';

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const filters = parseNoteFilters(await searchParams);
  const db = getDb();
  const [tags, result] = await Promise.all([listTags(db), listNotes(db, filters)]);
  const more = filtersToQuery({ ...filters, limit: Math.min(filters.limit + PAGE_SIZE, 500) });

  return (
    <div className="space-y-4">
      <QuickAdd tags={tags} />
      <Filters tags={tags} filters={filters} />
      <NoteList notes={result.notes} tags={tags} />
      {result.hasMore && filters.limit < 500 && (
        <Link href={`/?${more}`} scroll={false} className="block rounded-xl border bg-white py-2 text-center text-sm">
          Tải thêm
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 10: Kiểm tra bằng tay với DB thật**

Tạo một project Neon (hoặc branch `dev`) và thêm vào `web/.env.local`:
```
DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
```
Run: `npm run db:migrate` → Expected: `Đã chạy: 0001_init.sql`.
Run: `npm run dev`, đăng nhập, rồi:
1. Thêm nhanh "Lịch sử Việt Nam" → thẻ xuất hiện với chip "Chưa phân loại".
2. Tìm `lich su` → thấy thẻ; tìm `abc` → "Không có ghi chú nào".
3. Bấm Sửa → đổi nội dung → Lưu → nội dung mới hiện.
4. Chọn 2 thẻ → Xoá → xác nhận → thẻ biến mất.
(Việc gắn tag sẽ thử sau khi có trang Tag ở Task 10.) Dừng dev server.

- [ ] **Step 11: Toàn bộ test + typecheck + build + commit**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS / không lỗi / build thành công.

```bash
git add -A web
git commit -m "feat(web): notes admin page with search, filters, quick add and bulk actions"
```

---

### Task 10: Trang Tag và trang Cài đặt (đăng ký webhook)

**Files:**
- Create: `web/app/(admin)/tags/page.tsx`, `web/app/(admin)/tags/actions.ts`, `web/components/TagTable.tsx`, `web/components/NewTagForm.tsx`
- Create: `web/app/(admin)/settings/page.tsx`, `web/app/(admin)/settings/actions.ts`

**Interfaces:**
- Consumes: `listTagsWithCounts`, `createTag`, `updateTag`, `deleteTag`, `TAG_COLORS`, `callTelegram`, `requireSession`, `ActionButton`, `ActionState`, `DomainError`.
- Produces: server action `createTagAction(prev, formData)`, `updateTagAction(id, { name?, color? })`, `deleteTagAction(id)`, `registerWebhookAction(prev, formData)`.

- [ ] **Step 1: Server action cho tag**

`web/app/(admin)/tags/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/app/(admin)/actions';
import { requireSession } from '@/lib/auth/require';
import { getDb } from '@/lib/db/client';
import { DomainError } from '@/lib/notes/errors';
import { createTag, deleteTag, updateTag } from '@/lib/notes/tags';

const id = z.number().int().positive();

async function run(fn: () => Promise<unknown>): Promise<ActionState> {
  await requireSession();
  try {
    await fn();
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    if (err instanceof z.ZodError) return { error: 'Dữ liệu không hợp lệ' };
    throw err;
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function createTagAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const color = formData.get('color');
  return run(() =>
    createTag(getDb(), {
      name: String(formData.get('name') ?? ''),
      color: typeof color === 'string' && color ? color : undefined,
    }),
  );
}

export async function updateTagAction(tagId: number, input: { name?: string; color?: string }): Promise<ActionState> {
  const patch = z.object({ name: z.string().optional(), color: z.string().optional() }).parse(input);
  return run(() => updateTag(getDb(), id.parse(tagId), patch));
}

export async function deleteTagAction(tagId: number): Promise<ActionState> {
  return run(() => deleteTag(getDb(), id.parse(tagId)));
}
```

- [ ] **Step 2: Component trang Tag**

`web/components/NewTagForm.tsx`:
```tsx
'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createTagAction } from '@/app/(admin)/tags/actions';

export function NewTagForm() {
  const [state, formAction, pending] = useActionState(createTagAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-4 shadow-sm">
      <input name="name" required maxLength={50} placeholder="Tên tag mới (vd: Lịch sử)" className="flex-1 rounded-lg border px-3 py-1.5" />
      <button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
        {pending ? 'Đang tạo…' : 'Tạo tag'}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
```

`web/components/TagTable.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { deleteTagAction, updateTagAction } from '@/app/(admin)/tags/actions';
import type { Tag } from '@/lib/notes/types';

type Row = Tag & { noteCount: number };

function TagRow({ tag, colors }: { tag: Row; colors: readonly string[] }) {
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.error);
      if (res.error) setName(tag.name);
    });

  return (
    <li className={`space-y-1 px-4 py-3 ${pending ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: tag.color }} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== tag.name && run(() => updateTagAction(tag.id, { name }))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          maxLength={50}
          className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 hover:border-slate-300 focus:border-slate-400"
        />
        {tag.isDefault && <span className="text-xs text-slate-500">mặc định</span>}
        <Link href={`/?tag=${tag.id}`} className="text-sm text-blue-600 hover:underline">
          {tag.noteCount} ghi chú
        </Link>
        {!tag.isDefault && (
          <button
            onClick={() =>
              confirm(`Xoá tag "${tag.name}"? Ghi chú không còn tag nào sẽ về "Chưa phân loại".`) &&
              run(() => deleteTagAction(tag.id))
            }
            className="text-sm text-slate-500 hover:text-red-600"
          >
            Xoá
          </button>
        )}
      </div>
      <div className="flex gap-1 pl-7">
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => c !== tag.color && run(() => updateTagAction(tag.id, { color: c }))}
            className={`h-5 w-5 rounded-full ${c === tag.color ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}
            style={{ backgroundColor: c }}
            aria-label={`Màu ${c}`}
          />
        ))}
      </div>
      {error && <p className="pl-7 text-sm text-red-600">{error}</p>}
    </li>
  );
}

export function TagTable({ tags, colors }: { tags: Row[]; colors: readonly string[] }) {
  return (
    <ul className="divide-y rounded-xl bg-white shadow-sm">
      {tags.map((tag) => (
        <TagRow key={`${tag.id}-${tag.name}-${tag.color}`} tag={tag} colors={colors} />
      ))}
    </ul>
  );
}
```

`web/app/(admin)/tags/page.tsx`:
```tsx
import { NewTagForm } from '@/components/NewTagForm';
import { TagTable } from '@/components/TagTable';
import { requireSession } from '@/lib/auth/require';
import { getDb } from '@/lib/db/client';
import { TAG_COLORS, listTagsWithCounts } from '@/lib/notes/tags';

export const dynamic = 'force-dynamic';

export default async function TagsPage() {
  await requireSession();
  const tags = await listTagsWithCounts(getDb());
  return (
    <div className="space-y-4">
      <NewTagForm />
      <TagTable tags={tags} colors={TAG_COLORS} />
    </div>
  );
}
```

- [ ] **Step 3: Trang Cài đặt**

`web/app/(admin)/settings/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import type { ActionState } from '@/app/(admin)/actions';
import { requireSession } from '@/lib/auth/require';
import { callTelegram } from '@/lib/telegram/api';

export async function registerWebhookAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  await requireSession();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return { error: 'Chưa đặt TELEGRAM_WEBHOOK_SECRET' };
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  try {
    await callTelegram('setWebhook', {
      url: `${proto}://${host}/api/telegram/webhook`,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath('/settings');
  return { ok: true };
}
```

`web/app/(admin)/settings/page.tsx`:
```tsx
import { headers } from 'next/headers';
import { ActionButton } from '@/components/ActionButton';
import { requireSession } from '@/lib/auth/require';
import { callTelegram } from '@/lib/telegram/api';
import { registerWebhookAction } from './actions';

export const dynamic = 'force-dynamic';

const ENV_VARS = [
  'DATABASE_URL',
  'ADMIN_PASSWORD',
  'SESSION_SECRET',
  'API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_OWNER_ID',
] as const;

interface WebhookInfo {
  url: string;
  pending_update_count: number;
  last_error_message?: string;
}

async function webhookInfo(): Promise<{ info?: WebhookInfo; error?: string }> {
  try {
    return { info: await callTelegram<WebhookInfo>('getWebhookInfo', {}) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function SettingsPage() {
  await requireSession();
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const { info, error } = await webhookInfo();
  const expectedUrl = `${origin}/api/telegram/webhook`;

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Biến môi trường</h2>
        <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          {ENV_VARS.map((name) => (
            <li key={name}>
              {process.env[name] ? '✅' : '❌'} <code>{name}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Bot Telegram</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && (
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="inline text-slate-500">Webhook hiện tại: </dt>
              <dd className="inline break-all">{info.url || '(chưa đăng ký)'}</dd>
              {info.url === expectedUrl && <span className="ml-1 text-green-700">✓ đúng</span>}
            </div>
            <div>
              <dt className="inline text-slate-500">Tin đang chờ: </dt>
              <dd className="inline">{info.pending_update_count}</dd>
            </div>
            {info.last_error_message && (
              <div className="text-red-600">Lỗi gần nhất: {info.last_error_message}</div>
            )}
          </dl>
        )}
        <ActionButton action={registerWebhookAction} label="Đăng ký webhook" okMessage="Đã đăng ký" />
        <p className="text-xs text-slate-500">
          Đăng ký tới <code className="break-all">{expectedUrl}</code>. Hãy bấm trên domain production (không phải preview).
        </p>
      </section>

      <section className="space-y-2 rounded-xl bg-white p-4 text-sm shadow-sm">
        <h2 className="font-semibold">Extension &amp; Widget</h2>
        <p>
          URL server: <code className="break-all">{origin}</code>
        </p>
        <p>API key: giá trị biến <code>API_KEY</code> trên Vercel.</p>
        <p className="text-slate-500">Hướng dẫn cài đặt chi tiết xem README trong repo.</p>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Kiểm tra bằng tay**

Run: `npm run dev`, đăng nhập:
1. `/tags`: tạo "Lịch sử", "Y học" → xuất hiện; tạo "lich su" → báo "Đã có tag \"Lịch sử\"".
2. Đổi màu "Y học" → chấm màu đổi; đổi tên tag mặc định thành "Inbox" rồi đổi lại "Chưa phân loại".
3. `/`: bấm chip tag của một ghi chú → chọn "Lịch sử" → Áp dụng → chip đổi thành "Lịch sử".
4. Chọn nhiều ghi chú → Chuyển tag → "Y học" → các thẻ đổi tag.
5. `/tags`: xoá "Lịch sử" → ghi chú của nó về "Chưa phân loại"; tag mặc định không có nút Xoá.
6. `/settings`: thấy danh sách biến môi trường ✅/❌; nếu chưa có `TELEGRAM_BOT_TOKEN` thì hiện lỗi rõ ràng, trang không sập.
Dừng dev server.

- [ ] **Step 5: Toàn bộ test + typecheck + build + commit**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS / không lỗi / build thành công.

```bash
git add web
git commit -m "feat(web): tag management page and settings page with webhook registration"
```

---

### Task 11: Tài liệu triển khai, checklist test tay, cập nhật spec

**Files:**
- Create: `web/.env.example`, `README.md`, `docs/manual-test.md`
- Modify: `docs/superpowers/specs/2026-09-27-bangnote-design.md` (các mục §4.2, §5, §9 cho khớp điều chỉnh nhỏ)

**Interfaces:**
- Consumes: toàn bộ các task trước.
- Produces: tài liệu mà plan Extension và Widget sẽ bổ sung thêm mục.

- [ ] **Step 1: `.env.example`**

`web/.env.example`:
```
# Neon → Connection string (pooled)
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require

# Mật khẩu đăng nhập web admin
ADMIN_PASSWORD=

# Chuỗi ngẫu nhiên ≥ 16 ký tự: openssl rand -hex 32
SESSION_SECRET=

# Key cho extension + widget: openssl rand -hex 24
API_KEY=

# Từ @BotFather
TELEGRAM_BOT_TOKEN=

# Chỉ gồm A-Z a-z 0-9 _ - : openssl rand -hex 32
TELEGRAM_WEBHOOK_SECRET=

# Nhắn /start cho bot để biết ID
TELEGRAM_OWNER_ID=
```

- [ ] **Step 2: README hướng dẫn deploy**

`README.md`:
````markdown
# BangNote

Gom nhanh các đoạn text từ điện thoại (bot Telegram), trình duyệt (extension) và Windows (widget kéo thả) vào một kho, phân loại bằng tag.

| Thư mục | Nội dung |
|---|---|
| `web/` | Next.js: web admin + API + webhook bot (deploy Vercel, DB Neon) |
| `extension/` | Extension Chrome/Edge |
| `widget/` | Widget Windows (WPF .NET 8) |

## Triển khai web

1. **Neon**: tạo project tại neon.tech → copy *Connection string* (bản pooled) làm `DATABASE_URL`.
2. **Migration** (trên máy dev):
   ```bash
   cd web
   npm install
   cp .env.example .env.local   # điền DATABASE_URL
   npm run db:migrate           # → Đã chạy: 0001_init.sql
   ```
3. **Bot**: chat với @BotFather → `/newbot` → lấy token làm `TELEGRAM_BOT_TOKEN`.
4. **Vercel**: *Add New Project* → import repo → **Root Directory = `web`** → thêm đủ biến trong `web/.env.example` (tạm để `TELEGRAM_OWNER_ID` trống) → Deploy.
5. Nhắn `/start` cho bot → bot trả user ID → đặt `TELEGRAM_OWNER_ID` trên Vercel → **Redeploy**.
6. Mở domain production → đăng nhập → **Cài đặt** → *Đăng ký webhook* → dòng "Webhook hiện tại" hiện ✓ đúng.
7. Gửi thử một tin nhắn cho bot → bot trả "✅ Đã lưu #1".

Khi thêm migration mới sau này: tạo `web/db/migrations/000N_ten.sql` rồi chạy lại `npm run db:migrate`.

## Phát triển

```bash
cd web
npm test          # Vitest + PGlite, không cần DB thật
npm run typecheck
npm run dev       # cần .env.local
```
````

- [ ] **Step 3: Checklist test tay**

`docs/manual-test.md`:
```markdown
# Checklist test tay

Chạy sau mỗi lần deploy lớn. Đánh dấu từng mục.

## Web admin
- [ ] Mở `/` khi chưa đăng nhập → chuyển tới `/login`; sai mật khẩu → "Sai mật khẩu"; đúng → vào trang ghi chú.
- [ ] Thêm nhanh không chọn tag → chip "Chưa phân loại".
- [ ] Tìm `lich su` ra ghi chú "Lịch sử…"; tìm `100%` chỉ ra ghi chú chứa đúng "100%".
- [ ] Lọc 2 tag → ra ghi chú có tag này HOẶC tag kia; lọc "Chưa phân loại" → chỉ ghi chú chưa gắn tag.
- [ ] Sửa nội dung, Copy, Xoá một ghi chú.
- [ ] Chọn nhiều → Chuyển tag; chọn nhiều → Xoá.
- [ ] "Tải thêm" xuất hiện khi > 50 ghi chú và tải thêm được.
- [ ] Trang Tag: tạo, đổi tên, đổi màu, xoá; tạo trùng khác dấu bị chặn; tag mặc định không xoá được.
- [ ] Trang Cài đặt: đủ ✅ biến môi trường; webhook ✓ đúng.
- [ ] Mở trên điện thoại: bố cục không vỡ, không cuộn ngang.

## Bot Telegram
- [ ] Gửi text → "✅ Đã lưu #n" + bàn phím tag; web thấy ghi chú nguồn Telegram.
- [ ] Forward tin từ chat khác → lưu được.
- [ ] Ảnh có chú thích → lưu chú thích; ảnh không chú thích → "Chỉ hỗ trợ text".
- [ ] `#LichSu nội dung` → gắn tag Lịch sử, nội dung không còn hashtag.
- [ ] `nội dung #khongco` → lưu + cảnh báo "Không có tag #khongco".
- [ ] Chỉ gửi `#LichSu` → "Nội dung trống, không lưu".
- [ ] Bấm tag trên bàn phím → ✓ di chuyển đúng; bấm "Chưa phân loại" → bỏ hết tag thật.
- [ ] Bấm 🗑 Xoá → tin nhắn đổi thành "🗑 Đã xoá #n", web không còn ghi chú.
- [ ] `/tags`, `/recent` trả kết quả đúng.
- [ ] Tài khoản Telegram khác gửi text → bot im lặng; `/start` → chỉ trả ID.
```

- [ ] **Step 4: Cập nhật spec cho khớp điều chỉnh**

Trong `docs/superpowers/specs/2026-09-27-bangnote-design.md`:

Thay đoạn §4.2:
```
`POST /api/telegram/setup` (cần phiên admin): gọi `setWebhook` với URL `${origin}/api/telegram/webhook` và secret; trả kết quả `getWebhookInfo`.
```
bằng:
```
Đăng ký webhook: nút *Đăng ký webhook* trên `/settings` (server action, cần phiên admin) gọi `setWebhook` với URL `${origin}/api/telegram/webhook` và secret; trang hiển thị kết quả `getWebhookInfo`.
```

Trong §4.1, thay dòng validation:
```
Validation (zod): `content` được trim, rỗng → `400`, > 20 000 ký tự → `400`; `source` ∉ danh sách → `400`.
```
bằng:
```
Validation (zod): `content` được trim, rỗng → `400`, > 20 000 ký tự → `400`; `source` ∉ danh sách → `400`; `sourceUrl`/`sourceTitle` dài quá 2000/500 ký tự được cắt bớt (không từ chối).
```

Trong §5, thay:
```
  - Mới nhất trước, 50 note/trang, nút "Tải thêm" (phân trang theo cursor `id`).
```
bằng:
```
  - Mới nhất trước, 50 note; nút "Tải thêm" tăng `limit` trên URL thêm 50 (tối đa 500).
```

Trong §9, thay:
```
- DB test chạy trên **PGlite** (Postgres in-memory) + migration thật; nếu PGlite không có `unaccent` thì test tìm kiếm chạy trên một branch Neon riêng (`DATABASE_URL_TEST`), các test khác vẫn chạy PGlite.
```
bằng:
```
- DB test chạy trên **PGlite** (Postgres in-memory, có extension `unaccent`) + migration thật.
```

- [ ] **Step 5: Kiểm tra cuối**

Run: `cd web && npm test && npm run typecheck && npm run build`
Expected: toàn bộ test PASS, typecheck sạch, build thành công.

- [ ] **Step 6: Commit**

```bash
git add README.md docs web/.env.example
git commit -m "docs: deployment guide, manual test checklist, spec adjustments"
```
