# Per-tag numbering, reorder & export options — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi ghi chú thuộc đúng 1 tag và có số thứ tự riêng trong tag; kéo sắp xếp lại, "Đánh số lại"; xuất file với tuỳ chọn số #/chi tiết, ngăn cách một dòng trống.

**Architecture:** Migration SQL chuyển `note_tags` (nhiều-nhiều) thành cột `notes.tag_id` + `notes.position`. Mọi thay đổi tag đi qua `moveNote()`; đánh số lại qua `renumberTag()`. API giữ dạng `tagIds`/`tags[]` (1 phần tử) + thêm `position`, nên extension không đổi; bot và widget chuyển sang "chọn 1".

**Tech Stack:** Như hiện tại — Next.js 16, Drizzle 0.45, PGlite (test), Vitest 5, docx 9.7; widget .NET 8 WPF + xUnit.

**Spec:** `docs/superpowers/specs/2026-09-28-tag-numbering-design.md` (bổ sung cho `2026-09-27-bangnote-design.md`)

## Global Constraints

- Mỗi ghi chú có đúng 1 tag (`notes.tag_id NOT NULL`); tag mặc định "Chưa phân loại" dùng dãy số riêng như mọi tag.
- Số mới = `max(position trong tag) + 1`; tag rỗng → 1. Xoá/chuyển đi không dồn số. Chuyển vào chính tag đang ở → không đổi.
- `id` không hiển thị cho người dùng nữa; vẫn dùng trong callback Telegram và URL API.
- Hiển thị số dạng `<Tên tag> #<position>` (vd `Temp #3`).
- Sort mới `position` nhãn **"Theo số #"**: tăng dần (tag_id, position, id); là mặc định khi lọc đúng 1 tag và URL không có `sort`.
- Xuất: `num=0` bỏ số, `detail=0` bỏ tag/ngày giờ/link; giữa các ghi chú đúng một dòng trống; Word không kẻ viền.
- Cảnh báo Telegram khi khớp nhiều hashtag: `⚠️ Chỉ gắn 1 tag: <tên tag>`.
- Chuỗi hiển thị tiếng Việt. Lệnh `npm` chạy trong `web/`, `dotnet` trong `widget/`.

## Review Focus

1. **Hai ghi chú lưu cùng lúc vào một tag** (widget + Telegram) có thể trùng số → "Đánh số lại" phải đưa về 1…n không trùng — test ở Task 1 (`renumberTag` với position trùng).
2. **Đánh số lại khi đang tìm kiếm/lọc** (chỉ một phần tag đang hiện) → phần đang hiện 1…k, phần ẩn đánh tiếp theo số cũ — test ở Task 1.
3. **Chuyển hàng loạt mà một số ghi chú đã ở tag đích** → ghi chú đó giữ số, số khác nối tiếp theo thứ tự chọn — test ở Task 1.
4. **Bấm nút tag trên tin nhắn Telegram cũ sau khi tag đó đã bị xoá** → không được âm thầm chuyển về "Chưa phân loại"; trả lời "Tag không còn" — test ở Task 2.
5. **Widget chạy với server chưa cập nhật** (API không có `position`) → hiện "Đã lưu", không crash và không hiện `#0` — test ở Task 5.

---

## File Structure

```
web/db/migrations/0002_single_tag_positions.sql   (mới)
web/lib/db/schema.ts                               bỏ noteTags; notes + tagId, position
web/lib/notes/types.ts                             Note + position
web/lib/notes/tags.ts                              pickTagId, resolveTag, nextPosition, moveNote, renumberTag; deleteTag/listTagsWithCounts mới
web/lib/notes/notes.ts                             join tags; createNote cấp số; sort 'position'; moveNotes
web/lib/notes/filters.ts                           sort mặc định theo số tag lọc
web/lib/selection.ts                               + moveItem
web/lib/export/text.ts, docx.ts                    ExportOptions
web/lib/telegram/handler.ts, keyboard.ts           chọn 1 tag, hiển thị "Tag #n"
web/app/api/notes/[id]/tags/route.ts               trả position
web/app/api/export/route.ts                        num/detail
web/app/(admin)/actions.ts                         moveNoteAction, bulkMoveAction, renumberAction, reorderAction
web/app/(admin)/page.tsx                           singleTag, reorderable
web/components/TagChip.tsx, TagPicker.tsx, QuickAdd.tsx, NoteCard.tsx, NoteList.tsx
web/tests/helpers/test-db.ts, fixtures.ts
web/tests/migration-0002.test.ts                   (mới)
widget/src/BangNote.Widget.Core/Models.cs, IApiClient.cs, ApiClient.cs, TagToggle.cs → TagPick.cs, NoteLabel.cs (mới)
widget/src/BangNote.Widget/MainWindow.xaml.cs
```

---

### Task 1: Migration + domain một-tag-có-số

**Files:**
- Create: `web/db/migrations/0002_single_tag_positions.sql`, `web/tests/migration-0002.test.ts`
- Modify: `web/lib/db/schema.ts`, `web/lib/notes/types.ts`, `web/lib/notes/tags.ts`, `web/lib/notes/notes.ts`, `web/tests/helpers/test-db.ts`, `web/tests/helpers/fixtures.ts`
- Rewrite: `web/tests/tags.test.ts`
- Modify tests: `web/tests/notes.test.ts`, `web/tests/components.test.ts`, `web/tests/export.test.ts` (thêm `position` vào Note mẫu)

**Interfaces:**
- Produces:
  - `Note.position: number`; `Note.tags` luôn đúng 1 phần tử.
  - `pickTagId(db, tagIds: number[]): Promise<number | null>` — tag thật đầu tiên còn tồn tại theo thứ tự truyền vào; không có → `null`.
  - `resolveTag(db, tagId: number | null): Promise<Tag>` — id lạ/null → tag mặc định.
  - `nextPosition(db, tagId: number): Promise<number>`.
  - `interface Placement { tag: Tag; position: number }`
  - `moveNote(db, noteId, tagId: number | null): Promise<Placement>` — `not_found` nếu không có ghi chú.
  - `renumberTag(db, tagId, orderedIds: number[]): Promise<void>` — `invalid` nếu có id không thuộc tag.
  - `moveNotes(db, ids: number[], tagId: number | null): Promise<void>` (trong notes.ts).
  - `SORTS = ['newest', 'oldest', 'updated', 'position']`.
  - Tạm giữ (xoá ở Task 3): `setNoteTags(db, noteId, tagIds): Promise<Tag[]>` = `moveNote(pickTagId)`; `setTagsForNotes(db, ids, tagIds)` = `moveNotes(pickTagId)`.
  - Test helpers: `insertNote(db, content?, tagId?)`, `noteTag(db, noteId): Promise<{ name: string; position: number }>`.
  - Bỏ: bảng/biến `noteTags`, `getTagsForNotes`.

- [ ] **Step 1: Test migration chuyển dữ liệu cũ (thất bại)**

`web/tests/migration-0002.test.ts`:
```ts
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
```

Run: `npm test -- tests/migration-0002.test.ts`
Expected: FAIL — `ENOENT … 0002_single_tag_positions.sql`.

- [ ] **Step 2: Viết migration**

`web/db/migrations/0002_single_tag_positions.sql`:
```sql
ALTER TABLE notes ADD COLUMN tag_id integer REFERENCES tags(id);
ALTER TABLE notes ADD COLUMN position integer;

UPDATE notes n SET tag_id = COALESCE(
  (SELECT t.id FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
    WHERE nt.note_id = n.id AND NOT t.is_default
    ORDER BY t.name, t.id LIMIT 1),
  (SELECT id FROM tags WHERE is_default)
);

UPDATE notes n SET position = r.rn
FROM (SELECT id, row_number() OVER (PARTITION BY tag_id ORDER BY created_at, id) AS rn FROM notes) r
WHERE r.id = n.id;

ALTER TABLE notes ALTER COLUMN tag_id SET NOT NULL;
ALTER TABLE notes ALTER COLUMN position SET NOT NULL;
CREATE INDEX notes_tag_position ON notes (tag_id, position);

DROP TABLE note_tags;
```

Run: `npm test -- tests/migration-0002.test.ts`
Expected: 2 PASS.

- [ ] **Step 3: Schema, type, helper test**

`web/lib/db/schema.ts` — thay toàn bộ file:
```ts
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

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
  tagId: integer('tag_id').notNull().references(() => tags.id),
  /** Số thứ tự trong tag (hiển thị "Tag #position"). */
  position: integer('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

`web/lib/notes/types.ts` — trong `interface Note`, thêm sau `tags: Tag[];`:
```ts
  /** Số thứ tự trong tag của ghi chú (tags[0]). */
  position: number;
```
và sửa comment dòng `tags: Tag[];` thành `tags: Tag[]; // luôn đúng 1 phần tử`.

`web/tests/helpers/test-db.ts` — thay chuỗi trong `reset()`:
```ts
      await pg.exec(
        "TRUNCATE notes RESTART IDENTITY CASCADE; DELETE FROM tags WHERE NOT is_default; UPDATE tags SET name = 'Chưa phân loại', color = '#94a3b8' WHERE is_default;",
      );
```

`web/tests/helpers/fixtures.ts` — thay toàn bộ:
```ts
import { eq } from 'drizzle-orm';
import { notes, tags } from '@/lib/db/schema';
import type { DB } from '@/lib/db/types';
import { getDefaultTag, nextPosition } from '@/lib/notes/tags';

/** Chèn note trần (không qua createNote) vào tag cho trước (mặc định: tag mặc định), số nối tiếp. */
export async function insertNote(db: DB, content = 'nội dung', tagId?: number): Promise<number> {
  const tag = tagId ?? (await getDefaultTag(db)).id;
  const [row] = await db
    .insert(notes)
    .values({ content, source: 'web', tagId: tag, position: await nextPosition(db, tag) })
    .returning({ id: notes.id });
  return row.id;
}

export async function noteTag(db: DB, noteId: number): Promise<{ name: string; position: number }> {
  const [row] = await db
    .select({ name: tags.name, position: notes.position })
    .from(notes)
    .innerJoin(tags, eq(tags.id, notes.tagId))
    .where(eq(notes.id, noteId));
  return row;
}
```

- [ ] **Step 4: Viết lại test tag (thất bại)**

`web/tests/tags.test.ts` — thay toàn bộ:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '@/lib/notes/errors';
import {
  createTag,
  deleteTag,
  getDefaultTag,
  listTags,
  listTagsWithCounts,
  moveNote,
  nextPosition,
  pickTagId,
  renumberTag,
  updateTag,
} from '@/lib/notes/tags';
import { insertNote, noteTag } from './helpers/fixtures';
import { createTestDb, type TestDb } from './helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const DEFAULT = 'Chưa phân loại';

describe('listTags / createTag / updateTag', () => {
  it('tag mặc định đứng đầu, còn lại theo tên', async () => {
    await createTag(t.db, { name: 'Y học' });
    await createTag(t.db, { name: 'Lịch sử' });
    expect((await listTags(t.db)).map((x) => x.name)).toEqual([DEFAULT, 'Lịch sử', 'Y học']);
  });

  it('trim, tự chọn màu, chặn trùng khác dấu, chặn rỗng/dài/màu sai', async () => {
    const tag = await createTag(t.db, { name: '  Lịch   sử ' });
    expect(tag).toMatchObject({ name: 'Lịch sử', isDefault: false });
    await expect(createTag(t.db, { name: 'lich SU' })).rejects.toMatchObject({ code: 'conflict' });
    await expect(createTag(t.db, { name: '   ' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createTag(t.db, { name: 'a'.repeat(51) })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createTag(t.db, { name: 'X', color: 'red' })).rejects.toBeInstanceOf(DomainError);
  });

  it('đổi tên/màu kể cả tag mặc định; not_found', async () => {
    const def = await getDefaultTag(t.db);
    expect(await updateTag(t.db, def.id, { name: 'Inbox', color: '#123abc' })).toMatchObject({ name: 'Inbox', isDefault: true });
    await expect(updateTag(t.db, 9999, { name: 'X' })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('pickTagId', () => {
  it('lấy tag thật đầu tiên còn tồn tại theo thứ tự truyền vào', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const yh = await createTag(t.db, { name: 'Y học' });
    const def = await getDefaultTag(t.db);
    expect(await pickTagId(t.db, [9999, yh.id, ls.id])).toBe(yh.id);
    expect(await pickTagId(t.db, [def.id, ls.id])).toBe(ls.id);
    expect(await pickTagId(t.db, [def.id, 9999])).toBeNull();
    expect(await pickTagId(t.db, [])).toBeNull();
  });
});

describe('nextPosition / moveNote', () => {
  it('số mới = max + 1; tag rỗng bắt đầu từ 1 (kể cả sau khi xoá hết)', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    expect(await nextPosition(t.db, ls.id)).toBe(1);
    await insertNote(t.db, 'a', ls.id);
    await insertNote(t.db, 'b', ls.id);
    expect(await nextPosition(t.db, ls.id)).toBe(3);
    await t.pg.query('DELETE FROM notes WHERE tag_id = $1', [ls.id]);
    expect(await nextPosition(t.db, ls.id)).toBe(1);
  });

  it('chuyển sang tag khác → nối cuối tag mới; số cũ để trống', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await insertNote(t.db, 'a');
    const b = await insertNote(t.db, 'b');
    await insertNote(t.db, 'x', ls.id);
    expect(await moveNote(t.db, a, ls.id)).toMatchObject({ tag: { name: 'Lịch sử' }, position: 2 });
    expect(await noteTag(t.db, b)).toEqual({ name: DEFAULT, position: 2 });
  });

  it('chuyển vào chính tag đang ở → không đổi số', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    await insertNote(t.db, 'x', ls.id);
    const a = await insertNote(t.db, 'a', ls.id);
    expect((await moveNote(t.db, a, ls.id)).position).toBe(2);
    expect(await noteTag(t.db, a)).toEqual({ name: 'Lịch sử', position: 2 });
  });

  it('null / id lạ → tag mặc định; ghi chú không tồn tại → not_found', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await insertNote(t.db, 'a', ls.id);
    expect((await moveNote(t.db, a, 9999)).tag.name).toBe(DEFAULT);
    await moveNote(t.db, a, ls.id);
    expect((await moveNote(t.db, a, null)).tag.name).toBe(DEFAULT);
    await expect(moveNote(t.db, 9999, null)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('renumberTag', () => {
  it('gán 1…n theo thứ tự truyền vào, sửa được số trùng', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await insertNote(t.db, 'a', ls.id);
    const b = await insertNote(t.db, 'b', ls.id);
    const c = await insertNote(t.db, 'c', ls.id);
    await t.pg.query('UPDATE notes SET position = 1 WHERE tag_id = $1', [ls.id]);
    await renumberTag(t.db, ls.id, [c, a, b]);
    expect([await noteTag(t.db, c), await noteTag(t.db, a), await noteTag(t.db, b)].map((x) => x.position)).toEqual([1, 2, 3]);
  });

  it('ghi chú của tag không có trong danh sách → đánh tiếp theo số cũ', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await insertNote(t.db, 'a', ls.id); // 1
    const b = await insertNote(t.db, 'b', ls.id); // 2
    const c = await insertNote(t.db, 'c', ls.id); // 3
    const d = await insertNote(t.db, 'd', ls.id); // 4
    await renumberTag(t.db, ls.id, [d, b]);
    expect((await noteTag(t.db, d)).position).toBe(1);
    expect((await noteTag(t.db, b)).position).toBe(2);
    expect((await noteTag(t.db, a)).position).toBe(3);
    expect((await noteTag(t.db, c)).position).toBe(4);
  });

  it('id không thuộc tag → invalid, không đổi gì', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await insertNote(t.db, 'a', ls.id);
    const other = await insertNote(t.db, 'o');
    await expect(renumberTag(t.db, ls.id, [other, a])).rejects.toMatchObject({ code: 'invalid' });
    expect((await noteTag(t.db, a)).position).toBe(1);
  });
});

describe('deleteTag / listTagsWithCounts', () => {
  it('không xoá được tag mặc định; not_found', async () => {
    const def = await getDefaultTag(t.db);
    await expect(deleteTag(t.db, def.id)).rejects.toMatchObject({ code: 'invalid' });
    await expect(deleteTag(t.db, 9999)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('ghi chú của tag bị xoá chuyển về tag mặc định, nối cuối theo số cũ', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    await insertNote(t.db, 'x'); // mặc định #1
    const b = await insertNote(t.db, 'b', ls.id); // LS #1
    const a = await insertNote(t.db, 'a', ls.id); // LS #2
    await deleteTag(t.db, ls.id);
    expect(await noteTag(t.db, b)).toEqual({ name: DEFAULT, position: 2 });
    expect(await noteTag(t.db, a)).toEqual({ name: DEFAULT, position: 3 });
  });

  it('đếm ghi chú theo tag', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    await insertNote(t.db, 'a', ls.id);
    await insertNote(t.db, 'b');
    await insertNote(t.db, 'c');
    expect((await listTagsWithCounts(t.db)).map((c) => [c.name, c.noteCount])).toEqual([
      [DEFAULT, 2],
      ['Lịch sử', 1],
    ]);
  });
});
```

Run: `npm test -- tests/tags.test.ts`
Expected: FAIL — `moveNote`/`pickTagId`/`nextPosition`/`renumberTag` không được export (TypeError hoặc import lỗi).

- [ ] **Step 5: Cài đặt `tags.ts`**

`web/lib/notes/tags.ts` — thay toàn bộ:
```ts
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { notes, tags } from '@/lib/db/schema';
import type { DB } from '@/lib/db/types';
import { normalizeKey } from '@/lib/text/normalize';
import { DomainError } from './errors';
import { sortTags, type Tag } from './types';

export const TAG_COLORS = [
  '#94a3b8', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
] as const;

export const tagColumns = { id: tags.id, name: tags.name, color: tags.color, isDefault: tags.isDefault };

export interface Placement {
  tag: Tag;
  position: number;
}

export async function listTags(db: DB): Promise<Tag[]> {
  return sortTags(await db.select(tagColumns).from(tags).orderBy(desc(tags.isDefault), asc(tags.name)));
}

export async function listTagsWithCounts(db: DB): Promise<(Tag & { noteCount: number })[]> {
  const rows = await db
    .select({ ...tagColumns, noteCount: sql<number>`count(${notes.id})::int` })
    .from(tags)
    .leftJoin(notes, eq(notes.tagId, tags.id))
    .groupBy(tags.id);
  return sortTags(rows);
}

export async function getDefaultTag(db: DB): Promise<Tag> {
  const [tag] = await db.select(tagColumns).from(tags).where(eq(tags.isDefault, true));
  if (!tag) throw new Error('Thiếu tag mặc định — hãy chạy migration');
  return tag;
}

/** Tag thật đầu tiên còn tồn tại theo thứ tự `tagIds`; không có → null (= tag mặc định). */
export async function pickTagId(db: DB, tagIds: number[]): Promise<number | null> {
  const unique = [...new Set(tagIds)];
  if (!unique.length) return null;
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(inArray(tags.id, unique), eq(tags.isDefault, false)));
  const found = new Set(rows.map((r) => r.id));
  return unique.find((id) => found.has(id)) ?? null;
}

/** null hoặc id không tồn tại → tag mặc định. */
export async function resolveTag(db: DB, tagId: number | null): Promise<Tag> {
  if (tagId !== null) {
    const [tag] = await db.select(tagColumns).from(tags).where(eq(tags.id, tagId));
    if (tag) return tag;
  }
  return getDefaultTag(db);
}

export async function nextPosition(db: DB, tagId: number): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${notes.position})` })
    .from(notes)
    .where(eq(notes.tagId, tagId));
  return (row?.max ?? 0) + 1;
}

/** Nơi DUY NHẤT đổi tag của ghi chú. Sang tag khác → nối cuối tag mới; cùng tag → giữ nguyên. */
export async function moveNote(db: DB, noteId: number, tagId: number | null): Promise<Placement> {
  return db.transaction(async (tx) => {
    const [note] = await tx
      .select({ tagId: notes.tagId, position: notes.position })
      .from(notes)
      .where(eq(notes.id, noteId));
    if (!note) throw new DomainError('not_found', 'Không tìm thấy ghi chú');
    const tag = await resolveTag(tx, tagId);
    if (tag.id === note.tagId) return { tag, position: note.position };
    const position = await nextPosition(tx, tag.id);
    await tx.update(notes).set({ tagId: tag.id, position, updatedAt: new Date() }).where(eq(notes.id, noteId));
    return { tag, position };
  });
}

/** Tương thích tạm (Task 3 xoá): nhận danh sách tag kiểu cũ, lấy tag thật đầu tiên. */
export async function setNoteTags(db: DB, noteId: number, tagIds: number[]): Promise<Tag[]> {
  const { tag } = await moveNote(db, noteId, await pickTagId(db, tagIds));
  return [tag];
}

/**
 * Gán 1…k cho `orderedIds` (phải thuộc tag), ghi chú còn lại của tag đánh tiếp k+1… theo số cũ.
 * Không đổi `updated_at` (đánh số không phải là sửa nội dung).
 */
export async function renumberTag(db: DB, tagId: number, orderedIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: notes.id })
      .from(notes)
      .where(eq(notes.tagId, tagId))
      .orderBy(asc(notes.position), asc(notes.id));
    const inTag = new Set(rows.map((r) => r.id));
    const chosen = [...new Set(orderedIds)];
    if (chosen.some((id) => !inTag.has(id))) throw new DomainError('invalid', 'Có ghi chú không thuộc tag này');
    const chosenSet = new Set(chosen);
    const order = [...chosen, ...rows.map((r) => r.id).filter((id) => !chosenSet.has(id))];
    if (!order.length) return;
    const values = sql.join(
      order.map((id, i) => sql`(${id}::int, ${i + 1}::int)`),
      sql`, `,
    );
    await tx.execute(sql`UPDATE notes n SET position = v.pos FROM (VALUES ${values}) AS v(id, pos) WHERE n.id = v.id`);
  });
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

/** Ghi chú của tag bị xoá chuyển về tag mặc định, nối cuối theo số cũ. */
export async function deleteTag(db: DB, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [tag] = await tx.select(tagColumns).from(tags).where(eq(tags.id, id));
    if (!tag) throw new DomainError('not_found', 'Không tìm thấy tag');
    if (tag.isDefault) throw new DomainError('invalid', 'Không thể xoá tag mặc định');
    const def = await getDefaultTag(tx);
    const start = await nextPosition(tx, def.id);
    await tx.execute(sql`
      UPDATE notes n SET tag_id = ${def.id}::int, position = ${start}::int - 1 + r.rn::int
      FROM (SELECT id, row_number() OVER (ORDER BY position, id) AS rn FROM notes WHERE tag_id = ${id}::int) r
      WHERE r.id = n.id`);
    await tx.delete(tags).where(eq(tags.id, id));
  });
}
```

- [ ] **Step 6: Cài đặt `notes.ts`**

Trong `web/lib/notes/notes.ts`:

Thay 2 dòng import đầu và dòng import từ `./tags`:
```ts
import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { notes, tags, type Source } from '@/lib/db/schema';
```
```ts
import { moveNote, nextPosition, pickTagId, resolveTag, tagColumns } from './tags';
```

Thay `SORTS`:
```ts
export const SORTS = ['newest', 'oldest', 'updated', 'position'] as const;
```

Thay `noteColumns` và hàm `withTags` bằng:
```ts
const noteColumns = {
  id: notes.id,
  content: notes.content,
  source: notes.source,
  sourceUrl: notes.sourceUrl,
  sourceTitle: notes.sourceTitle,
  position: notes.position,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};
const noteSelect = { ...noteColumns, tag: tagColumns };

type NoteRow = Omit<Note, 'tags'> & { tag: Note['tags'][number] };
const toNote = ({ tag, ...row }: NoteRow): Note => ({ ...row, tags: [tag] });
```

Thay `createNote`:
```ts
export async function createNote(db: DB, input: CreateNoteInput): Promise<Note> {
  const content = cleanContent(input.content);
  return db.transaction(async (tx) => {
    const tag = await resolveTag(tx, await pickTagId(tx, input.tagIds ?? []));
    const position = await nextPosition(tx, tag.id);
    const [row] = await tx
      .insert(notes)
      .values({
        content,
        source: input.source,
        sourceUrl: input.sourceUrl ?? null,
        sourceTitle: input.sourceTitle ?? null,
        tagId: tag.id,
        position,
      })
      .returning(noteColumns);
    return { ...row, tags: [tag] };
  });
}
```

Thay `getNote`:
```ts
export async function getNote(db: DB, id: number): Promise<Note | null> {
  const [row] = await db.select(noteSelect).from(notes).innerJoin(tags, eq(tags.id, notes.tagId)).where(eq(notes.id, id));
  return row ? toNote(row) : null;
}
```

Trong `listNotes`: thay khối lọc tag bằng
```ts
  if (filter.tagIds?.length) conditions.push(inArray(notes.tagId, filter.tagIds));
```
thay khối `order` bằng
```ts
  const order =
    filter.sort === 'oldest'
      ? [asc(notes.id)]
      : filter.sort === 'updated'
        ? [desc(notes.updatedAt), desc(notes.id)]
        : filter.sort === 'position'
          ? [asc(notes.tagId), asc(notes.position), asc(notes.id)]
          : [desc(notes.id)];
```
và thay truy vấn + return:
```ts
  const rows = await db
    .select(noteSelect)
    .from(notes)
    .innerJoin(tags, eq(tags.id, notes.tagId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...order)
    .limit(limit + 1);

  return { notes: rows.slice(0, limit).map(toNote), hasMore: rows.length > limit };
```

Thay `updateNoteContent`:
```ts
export async function updateNoteContent(db: DB, id: number, content: string): Promise<Note> {
  const clean = cleanContent(content);
  const rows = await db.update(notes).set({ content: clean, updatedAt: new Date() }).where(eq(notes.id, id)).returning({ id: notes.id });
  if (!rows.length) throw new DomainError('not_found', 'Không tìm thấy ghi chú');
  return (await getNote(db, id))!;
}
```

Thay `setTagsForNotes` bằng:
```ts
/** Chuyển nhiều ghi chú sang một tag theo đúng thứ tự `ids` (ghi chú đã ở tag đó giữ số). */
export async function moveNotes(db: DB, ids: number[], tagId: number | null): Promise<void> {
  await db.transaction(async (tx) => {
    for (const id of ids) await moveNote(tx, id, tagId);
  });
}

/** Tương thích tạm (Task 3 xoá). */
export async function setTagsForNotes(db: DB, ids: number[], tagIds: number[]): Promise<void> {
  await moveNotes(db, ids, await pickTagId(db, tagIds));
}
```

- [ ] **Step 7: Cập nhật test notes + Note mẫu**

Trong `web/tests/notes.test.ts`:
- Import thêm `moveNotes` từ `@/lib/notes/notes`.
- Thêm cuối file:
```ts
describe('số thứ tự khi tạo / chuyển hàng loạt / sort theo số', () => {
  it('createNote cấp max + 1 trong tag, tag rỗng → 1 (kể cả sau khi xoá hết)', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    expect((await createNote(t.db, { content: 'a', source: 'web', tagIds: [ls.id] })).position).toBe(1);
    const b = await createNote(t.db, { content: 'b', source: 'web', tagIds: [ls.id] });
    expect(b.position).toBe(2);
    expect((await createNote(t.db, { content: 'c', source: 'web' })).position).toBe(1);
    await deleteNotes(t.db, (await listNotes(t.db, { tagIds: [ls.id] })).notes.map((n) => n.id));
    expect((await createNote(t.db, { content: 'd', source: 'web', tagIds: [ls.id] })).position).toBe(1);
  });

  it('nhiều tagIds → chỉ giữ tag thật đầu tiên', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const yh = await createTag(t.db, { name: 'Y học' });
    const note = await createNote(t.db, { content: 'x', source: 'web', tagIds: [yh.id, ls.id] });
    expect(note.tags.map((x) => x.name)).toEqual(['Y học']);
  });

  it('moveNotes: nối theo thứ tự truyền vào; ghi chú đã ở tag đích giữ số', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const inLs = await createNote(t.db, { content: 'ls', source: 'web', tagIds: [ls.id] }); // LS #1
    const a = await createNote(t.db, { content: 'a', source: 'web' });
    const b = await createNote(t.db, { content: 'b', source: 'web' });
    await moveNotes(t.db, [b.id, inLs.id, a.id], ls.id);
    expect((await getNote(t.db, b.id))!.position).toBe(2);
    expect((await getNote(t.db, inLs.id))!.position).toBe(1);
    expect((await getNote(t.db, a.id))!.position).toBe(3);
  });

  it("sort 'position' tăng dần theo số", async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const a = await createNote(t.db, { content: 'A', source: 'web', tagIds: [ls.id] });
    await createNote(t.db, { content: 'B', source: 'web', tagIds: [ls.id] });
    await t.pg.query('UPDATE notes SET position = 9 WHERE id = $1', [a.id]);
    expect((await listNotes(t.db, { tagIds: [ls.id], sort: 'position' })).notes.map((n) => n.content)).toEqual(['B', 'A']);
  });
});
```

Trong `web/tests/components.test.ts` và `web/tests/export.test.ts`: mỗi object `Note` mẫu (`note`, `n1`) thêm trường `position: 3,` ngay sau `tags: [...]`. (`n2` kế thừa từ `n1` bằng spread nên không cần.)

- [ ] **Step 8: Chạy toàn bộ**

Run: `npm test && npm run typecheck`
Expected: tất cả PASS, không lỗi type. (Các test API/Telegram hiện có vẫn xanh nhờ `setNoteTags`/`setTagsForNotes` tương thích.)

- [ ] **Step 9: Commit**

```bash
git add web
git commit -m "feat(web): single tag per note with per-tag positions (migration 0002)"
```

---

### Task 2: API + bot Telegram theo "chọn 1 tag"

**Files:**
- Modify: `web/app/api/notes/[id]/tags/route.ts`, `web/lib/telegram/handler.ts`, `web/lib/telegram/keyboard.ts`
- Modify tests: `web/tests/api.test.ts`, `web/tests/telegram-handler.test.ts`, `web/tests/telegram-pure.test.ts`

**Interfaces:**
- Consumes: `moveNote`, `pickTagId`, `Placement`, `Note.position`.
- Produces: `PUT /api/notes/:id/tags` → `{ id, tags: [tag], position }`; `savedLabel(tagName, position): string` = `` `${tagName} #${position}` `` (export từ `keyboard.ts`, dùng lại ở Task 3 không bắt buộc). Xoá `toggleTagIds`.

- [ ] **Step 1: Sửa test (thất bại)**

`web/tests/api.test.ts` — trong test `'200 và đổi tag'`, thêm sau dòng kiểm tra tags:
```ts
    expect(body.position).toBe(1);
```
và thêm test trong `describe('POST /api/notes'`:
```ts
  it('trả position theo tag', async () => {
    const first = await (await postNote(req('POST', '/api/notes', { content: 'a', source: 'widget' }))).json();
    const second = await (await postNote(req('POST', '/api/notes', { content: 'b', source: 'widget' }))).json();
    expect([first.position, second.position]).toEqual([1, 2]);
  });
```

`web/tests/telegram-pure.test.ts` — xoá import `toggleTagIds` và toàn bộ `describe('toggleTagIds', …)`; thêm:
```ts
import { savedLabel } from '@/lib/telegram/keyboard';

describe('savedLabel', () => {
  it('Tag #n', () => {
    expect(savedLabel('Temp', 3)).toBe('Temp #3');
  });
});
```

`web/tests/telegram-handler.test.ts`:
- Test `'lưu text, gắn tag từ hashtag…'`: đổi `expect(reply.text).toBe(\`✅ Đã lưu #${note.id}\`);` thành
```ts
    expect(reply.text).toBe('✅ Đã lưu — Lịch sử #1');
```
- Test `'/tags và /recent'`: đổi kỳ vọng `/recent` thành
```ts
    expect(calls('sendMessage')[1].text).toBe('Chưa phân loại #1\nghi chú đầu');
```
- Thay test `'bật tag → bỏ tag mặc định, cập nhật bàn phím'` bằng:
```ts
  it('bấm tag khác → chuyển tag, sửa tin nhắn thành "Tag #n" kèm bàn phím mới', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const note = await createNote(t.db, { content: 'x', source: 'telegram' });
    await handleUpdate(t.db, cb(`t:${note.id}:${ls.id}`), config);

    expect((await getNote(t.db, note.id))!.tags.map((x) => x.name)).toEqual(['Lịch sử']);
    const edit = calls('editMessageText')[0];
    expect(edit).toMatchObject({ chat_id: OWNER, message_id: 60, text: '✅ Đã lưu — Lịch sử #1' });
    expect(edit.reply_markup.inline_keyboard[0][1].text).toBe('✓ Lịch sử');
    expect(calls('answerCallbackQuery')[0]).toMatchObject({ callback_query_id: 'cq1', text: '→ Lịch sử #1' });
  });

  it('bấm tag hiện tại → không đổi gì', async () => {
    const note = await createNote(t.db, { content: 'x', source: 'telegram' });
    const def = await getDefaultTag(t.db);
    await handleUpdate(t.db, cb(`t:${note.id}:${def.id}`), config);
    expect(calls('editMessageText')).toHaveLength(0);
    expect(calls('answerCallbackQuery')[0]).toMatchObject({ text: 'Chưa phân loại #1' });
  });

  it('bấm nút của tag đã bị xoá → "Tag không còn", ghi chú giữ nguyên', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const note = await createNote(t.db, { content: 'x', source: 'telegram', tagIds: [ls.id] });
    await t.pg.query('UPDATE notes SET tag_id = (SELECT id FROM tags WHERE is_default) WHERE id = $1', [note.id]);
    await t.pg.query('DELETE FROM tags WHERE id = $1', [ls.id]);
    await handleUpdate(t.db, cb(`t:${note.id}:${ls.id}`), config);
    expect(calls('answerCallbackQuery')[0]).toMatchObject({ text: 'Tag không còn' });
    expect((await getNote(t.db, note.id))!.tags[0].name).toBe('Chưa phân loại');
  });
```
- Xoá test `'bấm tag mặc định → về Chưa phân loại'` (hành vi đã nằm trong test "bấm tag khác").
- Test `'"message is not modified"…'`: đổi thành bấm tag **khác** và giả lỗi ở `editMessageText`:
```ts
  it('"message is not modified" từ Telegram bị bỏ qua', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const note = await createNote(t.db, { content: 'x', source: 'telegram' });
    tg.mockImplementation(async (method: string) => {
      if (method === 'editMessageText') throw new Error('Telegram editMessageText: Bad Request: message is not modified');
      return {};
    });
    await expect(handleUpdate(t.db, cb(`t:${note.id}:${ls.id}`), config)).resolves.toBeUndefined();
    expect(calls('answerCallbackQuery')).toHaveLength(1);
  });
```
- Test `'xoá note'`: đổi kỳ vọng text thành `'🗑 Đã xoá'`.
- Thêm trong `describe('tin nhắn'`:
```ts
  it('khớp nhiều hashtag → gắn tag đầu, cảnh báo chỉ 1 tag', async () => {
    await createTag(t.db, { name: 'Lịch sử' });
    await createTag(t.db, { name: 'Y học' });
    await handleUpdate(t.db, msg('#YHoc #LichSu nội dung'), config);
    const [note] = (await listNotes(t.db)).notes;
    expect(note.tags[0].name).toBe('Y học');
    expect(calls('sendMessage')[0].text).toBe('✅ Đã lưu — Y học #1\n⚠️ Chỉ gắn 1 tag: Y học');
  });
```

Run: `npm test -- tests/api.test.ts tests/telegram-handler.test.ts tests/telegram-pure.test.ts`
Expected: FAIL ở các kỳ vọng mới (`position` undefined, text `Đã lưu #1`, `savedLabel` không tồn tại…).

- [ ] **Step 2: Cài đặt**

`web/lib/telegram/keyboard.ts` — xoá hàm `toggleTagIds`; thêm:
```ts
export const savedLabel = (tagName: string, position: number) => `${tagName} #${position}`;
```

`web/app/api/notes/[id]/tags/route.ts` — thay import `setNoteTags` bằng `moveNote, pickTagId` và thay dòng trả về:
```ts
    const db = getDb();
    const { tag, position } = await moveNote(db, id, await pickTagId(db, tagIds));
    return NextResponse.json({ id, tags: [tag], position });
```

`web/lib/telegram/handler.ts`:
- Import: thay `import { getDefaultTag, listTags, listTagsWithCounts, setNoteTags } from '@/lib/notes/tags';` bằng `import { listTags, listTagsWithCounts, moveNote } from '@/lib/notes/tags';`; thay `toggleTagIds` bằng `savedLabel` trong import từ `./keyboard`.
- `/recent`: thay dòng map thành
```ts
        .map((n) => `${savedLabel(n.tags[0].name, n.position)}\n${truncate(n.content, 200)}`)
```
- Sau khi tạo note, thay khối `warning` + `reply` bằng:
```ts
    const warnings = [
      ...(tagIds.length > 1 ? [`⚠️ Chỉ gắn 1 tag: ${note.tags[0].name}`] : []),
      ...(unknown.length ? [`⚠️ Không có tag ${unknown.join(', ')}`] : []),
    ];
    await reply([`✅ Đã lưu — ${savedLabel(note.tags[0].name, note.position)}`, ...warnings].join('\n'), {
      reply_markup: buildNoteKeyboard(note.id, allTags, [note.tags[0].id]),
    });
```
- Trong nhánh delete: đổi `text: \`🗑 Đã xoá #${note.id}\`` thành `text: '🗑 Đã xoá'`.
- Thay phần cuối `handleCallback` (từ `const def = await getDefaultTag(db);` tới hết hàm) bằng:
```ts
  const current = note.tags[0];
  if (action.tagId === current.id) {
    await answer(savedLabel(current.name, note.position));
    return;
  }
  const allTags = await listTags(db);
  if (!allTags.some((tag) => tag.id === action.tagId)) {
    await answer('Tag không còn');
    return;
  }
  const { tag, position } = await moveNote(db, note.id, action.tagId);
  try {
    await callTelegram('editMessageText', {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      text: `✅ Đã lưu — ${savedLabel(tag.name, position)}`,
      reply_markup: buildNoteKeyboard(note.id, allTags, [tag.id]),
    });
  } catch (err) {
    if (!(err instanceof Error && err.message.includes('message is not modified'))) throw err;
  }
  await answer(`→ ${savedLabel(tag.name, position)}`);
```

- [ ] **Step 3: Chạy toàn bộ + commit**

Run: `npm test && npm run typecheck`
Expected: PASS / không lỗi.

```bash
git add web
git commit -m "feat(web): single-tag moves in API and Telegram bot, show 'Tag #n'"
```

---

### Task 3: Admin — chọn 1 tag, chip "Tag #n", sort "Theo số #", Đánh số lại, kéo sắp xếp

**Files:**
- Modify: `web/lib/notes/filters.ts`, `web/lib/selection.ts`, `web/app/(admin)/actions.ts`, `web/app/(admin)/page.tsx`, `web/components/TagChip.tsx`, `web/components/TagPicker.tsx`, `web/components/QuickAdd.tsx`, `web/components/NoteCard.tsx`, `web/components/NoteList.tsx`, `web/lib/notes/tags.ts`, `web/lib/notes/notes.ts`
- Test: `web/tests/filters.test.ts`, `web/tests/selection.test.ts`, `web/tests/components.test.ts`, `web/tests/notes.test.ts`

**Interfaces:**
- Consumes: `moveNote`, `moveNotes`, `renumberTag`, `SORTS` có `'position'`.
- Produces:
  - `defaultSort(tagIds: number[]): Sort` — 1 tag → `'position'`, còn lại `'newest'`.
  - `SORT_LABELS.position = 'Theo số #'`.
  - `moveItem(ids: number[], fromId: number, toId: number): number[]`.
  - Actions: `moveNoteAction(noteId, tagId: number | null)`, `bulkMoveAction(noteIds, tagId: number | null)`, `renumberAction(tagId, orderedIds)`, `reorderAction(tagId, orderedIds)`.
  - `TagPicker({ tags, current: number | null, onPick(tagId: number), onCancel, title? })` — chọn 1, bấm là áp dụng.
  - `TagChip({ tag, position? })`.
  - `NoteList({ notes, tags, exportQuery, singleTag: Tag | null, reorderable: boolean })`.
  - Xoá `setNoteTags` (tags.ts), `setTagsForNotes` (notes.ts), `setNoteTagsAction`, `bulkSetTagsAction`.

- [ ] **Step 1: Test thất bại**

`web/tests/filters.test.ts`:
- Import thêm `defaultSort`.
- Thêm:
```ts
describe('sort mặc định', () => {
  it('lọc đúng 1 tag → Theo số #; còn lại → Mới nhất; sort trên URL luôn thắng', () => {
    expect(defaultSort([2])).toBe('position');
    expect(defaultSort([])).toBe('newest');
    expect(defaultSort([2, 3])).toBe('newest');
    expect(parseNoteFilters({ tag: '2' }).sort).toBe('position');
    expect(parseNoteFilters({ tag: '2', sort: 'newest' }).sort).toBe('newest');
    expect(parseNoteFilters({ sort: 'position' }).sort).toBe('position');
  });

  it('filtersToQuery bỏ sort khi bằng mặc định của bộ lọc đó, giữ khi khác', () => {
    expect(filtersToQuery({ ...EMPTY_FILTERS, tagIds: [2], sort: 'position' })).toBe('tag=2');
    expect(filtersToQuery({ ...EMPTY_FILTERS, tagIds: [2], sort: 'newest' })).toBe('tag=2&sort=newest');
  });
});
```

`web/tests/selection.test.ts` — import thêm `moveItem`, thêm:
```ts
describe('moveItem (kéo sắp xếp)', () => {
  it('đưa phần tử tới vị trí của phần tử đích', () => {
    expect(moveItem([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
    expect(moveItem([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 2)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 9, 2)).toEqual([1, 2, 3]);
  });
});
```

`web/tests/components.test.ts`:
- Trong test `'danh sách hiện nội dung…'`: truyền thêm `singleTag: null, reorderable: false` vào props `NoteList`; đổi `expect(html).toContain('#7 · Extension');` thành
```ts
    expect(html).toContain('Lịch sử #3');
    expect(html).toContain('Extension');
    expect(html).not.toContain('#7');
    expect(html).not.toContain('Đánh số lại');
    expect(html).not.toContain('⠿');
```
- Test `'danh sách rỗng'`: truyền thêm `singleTag: null, reorderable: false`.
- Thêm:
```ts
  it('lọc 1 tag + sort theo số → có nút Đánh số lại và tay nắm kéo', () => {
    const html = renderToString(
      createElement(NoteList, { notes: [note], tags: [DEF, LS], exportQuery: 'tag=2', singleTag: LS, reorderable: true }),
    );
    expect(html).toContain('Đánh số lại');
    expect(html).toContain('⠿');
  });

  it('thêm nhanh: chọn 1 tag bằng radio, mặc định Chưa phân loại', () => {
    const quick = renderToString(createElement(QuickAdd, { tags: [DEF, LS] }));
    expect(quick.match(/type="radio"/g)).toHaveLength(2);
    expect(quick).toMatch(/checked=""[^>]*value="1"|value="1"[^>]*checked=""/);
  });
```
- Trong test bộ lọc/thêm nhanh cũ: xoá dòng `expect(quick).not.toContain('Chưa phân loại');` (thêm nhanh giờ có mục này).

`web/tests/notes.test.ts`: xoá import `setTagsForNotes`; trong test `'gắn tag hàng loạt'` đổi `await setTagsForNotes(t.db, [a.id, b.id], [ls.id]);` thành `await moveNotes(t.db, [a.id, b.id], ls.id);`.

Run: `npm test`
Expected: FAIL — `defaultSort`/`moveItem` chưa có; `Lịch sử #3` không có trong HTML; radio chưa có.

- [ ] **Step 2: filters + selection**

`web/lib/notes/filters.ts`:
- Thêm vào `SORT_LABELS`: `position: 'Theo số #',`
- Thêm hàm:
```ts
/** Lọc đúng 1 tag → xem theo số thứ tự của tag; còn lại → mới nhất. */
export function defaultSort(tagIds: number[]): Sort {
  return tagIds.length === 1 ? 'position' : 'newest';
}
```
- Trong `parseNoteFilters`: đổi `sort: oneOf(SORTS, first(sp.sort)) ?? 'newest',` thành `sort: oneOf(SORTS, first(sp.sort)) ?? defaultSort(tagIds),`
- Trong `filtersToQuery`: đổi `if (f.sort !== 'newest') params.set('sort', f.sort);` thành `if (f.sort !== defaultSort(f.tagIds)) params.set('sort', f.sort);`

`web/lib/selection.ts` — thêm:
```ts
/** Đưa `fromId` tới vị trí hiện tại của `toId` (kéo sắp xếp). Id lạ → giữ nguyên. */
export function moveItem(ids: number[], fromId: number, toId: number): number[] {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = ids.filter((id) => id !== fromId);
  next.splice(to, 0, fromId);
  return next;
}
```

- [ ] **Step 3: Actions, xoá lớp tương thích**

`web/app/(admin)/actions.ts`:
- Import: thay `createNote, deleteNotes, setTagsForNotes, updateNoteContent` bằng `createNote, deleteNotes, moveNotes, updateNoteContent`; thay `import { setNoteTags } from '@/lib/notes/tags';` bằng `import { moveNote, renumberTag } from '@/lib/notes/tags';`.
- Thêm `const tagId = id.nullable();` sau `const ids = …`.
- Thay `setNoteTagsAction` và `bulkSetTagsAction` bằng:
```ts
export async function moveNoteAction(noteId: number, toTagId: number | null): Promise<ActionState> {
  return run(() => moveNote(getDb(), id.parse(noteId), tagId.parse(toTagId)));
}

export async function bulkMoveAction(noteIds: number[], toTagId: number | null): Promise<ActionState> {
  return run(() => moveNotes(getDb(), ids.parse(noteIds), tagId.parse(toTagId)));
}

/** Nút "Đánh số lại": 1…n theo thứ tự đang hiển thị. */
export async function renumberAction(inTagId: number, orderedIds: number[]): Promise<ActionState> {
  return run(() => renumberTag(getDb(), id.parse(inTagId), z.array(id).max(5000).parse(orderedIds)));
}

/** Kéo sắp xếp: thứ tự mới của các thẻ đang hiện. */
export async function reorderAction(inTagId: number, orderedIds: number[]): Promise<ActionState> {
  return renumberAction(inTagId, orderedIds);
}
```
- Trong `createNoteAction`: `tagIds` giữ nguyên (radio gửi 0 hoặc 1 giá trị).

`web/lib/notes/tags.ts`: xoá hàm `setNoteTags`. `web/lib/notes/notes.ts`: xoá hàm `setTagsForNotes`.

- [ ] **Step 4: Component**

`web/components/TagChip.tsx` — thay toàn bộ:
```tsx
import type { Tag } from '@/lib/notes/types';

export function TagChip({ tag, position }: { tag: Tag; position?: number }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: tag.color }}
    >
      {tag.name}
      {position !== undefined && <span className="ml-1 opacity-90">#{position}</span>}
    </span>
  );
}
```

`web/components/TagPicker.tsx` — thay toàn bộ:
```tsx
'use client';

import type { Tag } from '@/lib/notes/types';

/** Chọn 1 tag (tag như thư mục); bấm là áp dụng ngay. */
export function TagPicker({
  tags,
  current,
  onPick,
  onCancel,
  title = 'Chuyển sang tag:',
}: {
  tags: Tag[];
  current: number | null;
  onPick: (tagId: number) => void;
  onCancel: () => void;
  title?: string;
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-white p-3 shadow">
      <p className="text-sm text-slate-600">{title}</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={() => onPick(tag.id)}
            className="rounded-full border px-3 py-0.5 text-sm"
            style={tag.id === current ? { borderColor: tag.color, backgroundColor: `${tag.color}33` } : undefined}
          >
            {tag.id === current ? '✓ ' : ''}
            {tag.name}
          </button>
        ))}
      </div>
      <button type="button" onClick={onCancel} className="rounded-lg border px-3 py-1 text-sm">
        Huỷ
      </button>
    </div>
  );
}
```

`web/components/QuickAdd.tsx` — thay khối `{tags.filter((t) => !t.isDefault).map((tag) => (<label …><input type="checkbox" name="tag" value={tag.id} />{tag.name}</label>))}` bằng:
```tsx
        {tags.map((tag) => (
          <label key={tag.id} className="flex items-center gap-1 text-sm">
            <input type="radio" name="tag" value={tag.id} defaultChecked={tag.isDefault} />
            {tag.name}
          </label>
        ))}
```

`web/components/NoteCard.tsx`:
- Import: thay `setNoteTagsAction` bằng `moveNoteAction`.
- Props: thêm
```ts
  /** Hiện tay nắm ⠿ để kéo sắp xếp (chỉ khi lọc 1 tag + sort theo số). */
  reorderable?: boolean;
  onHandlePointerDown?: (e: React.PointerEvent) => void;
```
  (thêm `reorderable = false, onHandlePointerDown,` vào phần destructure).
- Ngay trong `<div className="flex items-start gap-3">`, trước `<div className="min-w-0 flex-1">`, thêm:
```tsx
        {reorderable && (
          <span
            onPointerDown={onHandlePointerDown}
            className="cursor-grab touch-none select-none px-1 text-lg leading-6 text-slate-400 hover:text-slate-700"
            title="Kéo để sắp xếp lại"
            aria-label="Kéo để sắp xếp lại"
          >
            ⠿
          </span>
        )}
```
- Thay khối nút chip + `<span>#{note.id} · …</span>` bằng:
```tsx
        <button onClick={() => setPicking(!picking)} className="flex flex-wrap gap-1" title="Chuyển tag">
          <TagChip tag={note.tags[0]} position={note.position} />
        </button>
        <span>
          {SOURCE_LABELS[note.source]} ·{' '}
          <time dateTime={note.createdAt.toISOString()} suppressHydrationWarning>
            {formatRelative(note.createdAt)}
          </time>
        </span>
```
- Đổi confirm xoá: `confirm(\`Xoá ghi chú ${note.tags[0].name} #${note.position}?\`)`.
- Đổi `aria-label` của ô chọn thành `` aria-label={`Chọn ghi chú ${note.tags[0].name} #${note.position}`} `` (không còn lộ id).
- Thay khối `<TagPicker … />` bằng:
```tsx
          <TagPicker
            tags={tags}
            current={note.tags[0].id}
            onPick={(tagId) =>
              tagId === note.tags[0].id
                ? setPicking(false)
                : run(() => moveNoteAction(note.id, tagId), () => setPicking(false))
            }
            onCancel={() => setPicking(false)}
          />
```

`web/components/NoteList.tsx`:
- Import: thay `bulkSetTagsAction, deleteNotesAction` bằng `bulkMoveAction, deleteNotesAction, renumberAction, reorderAction`; thay `import { applyRange } from '@/lib/selection';` bằng `import { applyRange, moveItem } from '@/lib/selection';`.
- Chữ ký: `export function NoteList({ notes, tags, exportQuery, singleTag, reorderable }: { notes: Note[]; tags: Tag[]; exportQuery: string; singleTag: Tag | null; reorderable: boolean })`.
- Sau `const [pending, startTransition] = useTransition();` thêm:
```ts
  // Thứ tự tạm trong lúc kéo sắp xếp; null = theo server.
  const [order, setOrder] = useState<number[] | null>(null);
  const reorderRef = useRef<number | null>(null);
  useEffect(() => setOrder(null), [notes]);
  const byId = new Map(notes.map((n) => [n.id, n]));
  const shown = (order ?? notes.map((n) => n.id)).map((id) => byId.get(id)!).filter(Boolean);
```
  và đổi `const visibleIds = notes.map((n) => n.id);` thành `const visibleIds = shown.map((n) => n.id);`.
- Trong `useEffect` pointer: đầu `onMove` thêm xử lý kéo sắp xếp (trước `const drag = dragRef.current;`):
```ts
      const moving = reorderRef.current;
      if (moving !== null) {
        if (e.clientY < EDGE) window.scrollBy(0, -16);
        else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, 16);
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-note-id]');
        if (over) setOrder((prev) => moveItem(prev ?? idsRef.current, moving, Number(over.dataset.noteId)));
        return;
      }
```
  và thay `onUp` bằng:
```ts
    const onUp = () => {
      dragRef.current = null;
      if (reorderRef.current !== null) {
        reorderRef.current = null;
        finishReorderRef.current();
      }
    };
```
- Thêm trước `useEffect` pointer:
```ts
  const finishReorderRef = useRef<() => void>(() => undefined);
  finishReorderRef.current = () => {
    if (!singleTag || !order || order.every((id, i) => id === notes[i]?.id)) return;
    const tagId = singleTag.id;
    const next = order;
    startTransition(async () => {
      const res = await reorderAction(tagId, next);
      if (res.error) {
        setError(res.error);
        setOrder(null);
      }
    });
  };

  const startReorder = (id: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    reorderRef.current = id;
    setOrder(notes.map((n) => n.id));
  };

  const renumber = () => {
    if (!singleTag) return;
    if (!confirm(`Đánh số lại ${visibleIds.length} ghi chú trong tag "${singleTag.name}" theo thứ tự đang hiển thị?`)) return;
    const tagId = singleTag.id;
    startTransition(async () => {
      const res = await renumberAction(tagId, visibleIds);
      setError(res.error);
    });
  };
```
- Trong `copyChosen`: đổi `notes.filter(…)` thành `shown.filter(…)`.
- Trong nhóm nút đã chọn: đổi nút "Chuyển tag" giữ nguyên; thay khối `<TagPicker … applyLabel=… onApply=… />` bằng:
```tsx
        <TagPicker
          tags={tags}
          current={null}
          title={`Chuyển ${chosen.length} ghi chú sang tag:`}
          onPick={(tagId) => run(() => bulkMoveAction(chosen, tagId))}
          onCancel={() => setPicking(false)}
        />
```
- Thêm nút Đánh số lại ngay trước `<span className="ml-auto flex flex-wrap items-center gap-2" …>`:
```tsx
        {singleTag && (
          <button onClick={renumber} className="rounded-lg border bg-white px-3 py-1" disabled={pending} title="Gán lại #1…n theo thứ tự đang hiển thị">
            Đánh số lại
          </button>
        )}
```
- Bọc danh sách: đổi `<div className="space-y-3">` gốc thành `<div className={`space-y-3 ${pending ? 'opacity-70' : ''}`}>`; đổi `{notes.map((note) => (` thành `{shown.map((note) => (` và thêm props cho `NoteCard`:
```tsx
          reorderable={reorderable}
          onHandlePointerDown={(e) => startReorder(note.id, e)}
```

`web/app/(admin)/page.tsx`:
- Sau khi có `tags`, thêm:
```ts
  const singleTag = filters.tagIds.length === 1 ? (tags.find((t) => t.id === filters.tagIds[0]) ?? null) : null;
```
- `NoteList` thêm props `singleTag={singleTag} reorderable={!!singleTag && filters.sort === 'position'}`.

- [ ] **Step 5: Chạy test**

Run: `npm test && npm run typecheck`
Expected: PASS / không lỗi.

- [ ] **Step 6: Kiểm tra trên trình duyệt (dev server + Edge headless)**

Với `npm run dev` và cookie phiên hợp lệ, mở `/?tag=<id>` (tag có ≥ 3 ghi chú):
1. Thanh công cụ có "Đánh số lại"; thẻ có ⠿; chip hiện `Tên #n`.
2. Kéo ⠿ của thẻ thứ 1 xuống thẻ thứ 3 → thả → sau khi tải lại, thứ tự mới và số #1…n liền mạch.
3. Chọn sort "Cũ nhất" → bấm Đánh số lại → xác nhận → chuyển về "Theo số #": thứ tự trùng thứ tự cũ-nhất.
4. Bấm chip của một thẻ → chọn tag khác → thẻ chuyển sang tag đó với số cuối dãy.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): single-tag picker, 'Tag #n' chips, sort by number, renumber and drag reorder"
```

---

### Task 4: Xuất file — tuỳ chọn số #, chi tiết, một dòng trống

**Files:**
- Modify: `web/lib/export/text.ts`, `web/lib/export/docx.ts`, `web/app/api/export/route.ts`, `web/components/NoteList.tsx`
- Test: `web/tests/export.test.ts`, `web/tests/export-route.test.ts`, `web/tests/components.test.ts`

**Interfaces:**
- Produces: `interface ExportOptions { number: boolean; detail: boolean }`, `FULL_EXPORT: ExportOptions = { number: true, detail: true }`; `noteHeader(note, opts?)`, `formatNotesTxt(notes, opts?)`, `buildNotesDocx(notes, opts?)`. Bỏ `SEPARATOR`.

- [ ] **Step 1: Test thất bại**

`web/tests/export.test.ts` — thay các test trong `describe('text export')` bằng (giữ test `copy` và `tên file`):
```ts
  it('dòng đầu theo tuỳ chọn: số # là số trong tag, không có số id', () => {
    expect(noteHeader(n1)).toBe('#3 · Lịch sử, Y học · 27/09/2026 14:05 · https://vi.wikipedia.org/x');
    expect(noteHeader(n1, { number: true, detail: false })).toBe('#3');
    expect(noteHeader(n1, { number: false, detail: true })).toBe('Lịch sử, Y học · 27/09/2026 14:05 · https://vi.wikipedia.org/x');
    expect(noteHeader(n1, { number: false, detail: false })).toBe('');
  });

  it('TXT: ghi chú cách nhau đúng một dòng trống, không còn đường kẻ', () => {
    expect(formatNotesTxt([n1, n2], { number: true, detail: false })).toBe('#3\nTrận Bạch Đằng\nnăm 938\n\n#3\nHải Thượng Lãn Ông\n');
    expect(formatNotesTxt([n1, n2], { number: false, detail: false })).toBe('Trận Bạch Đằng\nnăm 938\n\nHải Thượng Lãn Ông\n');
    expect(formatNotesTxt([n1, n2])).not.toContain('---');
    expect(formatNotesTxt([])).toBe('');
  });
```
(Xoá các test cũ `'dòng đầu: id · tag…'`, `'TXT: từng ghi chú có dòng đầu…'`, `'bỏ thông tin → dòng đầu chỉ còn số #'`.)

Trong `describe('docx export')`: thay test `'bỏ thông tin → Word…'` bằng:
```ts
  it('Word: theo tuỳ chọn, không kẻ viền giữa ghi chú', async () => {
    const xmlOf = async (buf: Buffer) => (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
    const full = await xmlOf(await buildNotesDocx([n1, n2]));
    expect(full).toContain('#3 · Lịch sử, Y học');
    expect(full).not.toContain('w:pBdr');
    const bare = await xmlOf(await buildNotesDocx([n1], { number: false, detail: false }));
    expect(bare).not.toContain('#3');
    expect(bare).not.toContain('Lịch sử');
    expect(bare).toContain('Trận Bạch Đằng');
  });
```
và trong test `'tạo file .docx hợp lệ…'` đổi chuỗi `'#12 · Lịch sử, Y học · 27/09/2026 14:05'` thành `'#3 · Lịch sử, Y học · 27/09/2026 14:05'`.

`web/tests/export-route.test.ts` — thay test `'detail=0 → …'` bằng:
```ts
  it('num=0 / detail=0 bật tắt độc lập', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    await createNote(t.db, { content: 'Bạch Đằng', source: 'extension', tagIds: [ls.id], sourceUrl: 'https://a.b/x' });
    expect((await (await GET(req('format=txt'))).text()).split('\n')[0]).toMatch(/^#1 · Lịch sử · .* · https:\/\/a\.b\/x$/);
    expect(await (await GET(req('format=txt&detail=0'))).text()).toBe('#1\nBạch Đằng\n');
    expect((await (await GET(req('format=txt&num=0'))).text()).split('\n')[0]).toMatch(/^Lịch sử · /);
    expect(await (await GET(req('format=txt&num=0&detail=0'))).text()).toBe('Bạch Đằng\n');
  });
```

`web/tests/components.test.ts` — trong test danh sách, thêm `expect(html).toContain('Kèm số #');`.

Run: `npm test -- tests/export.test.ts tests/export-route.test.ts tests/components.test.ts`
Expected: FAIL (tham số `ExportOptions` chưa có, còn `---`, chưa có ô "Kèm số #").

- [ ] **Step 2: Cài đặt**

`web/lib/export/text.ts` — thay toàn bộ:
```ts
import { vnDateString, vnDateTimeString } from '@/lib/notes/dates';
import type { Note } from '@/lib/notes/types';

export interface ExportOptions {
  /** Kèm `#position` (số trong tag). */
  number: boolean;
  /** Kèm tag, ngày giờ, link nguồn. */
  detail: boolean;
}

export const FULL_EXPORT: ExportOptions = { number: true, detail: true };

/** Dòng đầu của ghi chú khi xuất; chuỗi rỗng nếu không bật phần nào. */
export function noteHeader(note: Note, opts: ExportOptions = FULL_EXPORT): string {
  const parts = [
    opts.number ? `#${note.position}` : '',
    ...(opts.detail ? [note.tags.map((t) => t.name).join(', '), vnDateTimeString(note.createdAt), note.sourceUrl ?? ''] : []),
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Mỗi ghi chú: [dòng đầu] + nội dung; các ghi chú cách nhau đúng một dòng trống. */
export function formatNotesTxt(notes: Note[], opts: ExportOptions = FULL_EXPORT): string {
  if (!notes.length) return '';
  const blocks = notes.map((n) => {
    const header = noteHeader(n, opts);
    return header ? `${header}\n${n.content}` : n.content;
  });
  return `${blocks.join('\n\n')}\n`;
}

/** Nội dung dùng cho nút Copy nhiều ghi chú — chỉ nội dung, cách nhau một dòng trống. */
export function joinForCopy(notes: Pick<Note, 'content'>[]): string {
  return notes.map((n) => n.content).join('\n\n');
}

export function exportFilename(ext: 'txt' | 'docx', now = new Date()): string {
  return `bangnote-${vnDateString(now)}.${ext}`;
}
```

`web/lib/export/docx.ts` — thay toàn bộ:
```ts
import { Document, Packer, Paragraph, TextRun } from 'docx';
import type { Note } from '@/lib/notes/types';
import { FULL_EXPORT, noteHeader, type ExportOptions } from './text';

function noteParagraphs(note: Note, opts: ExportOptions): Paragraph[] {
  const header = noteHeader(note, opts);
  const lines = note.content.split(/\r?\n/);
  return [
    ...(header
      ? [new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: header, size: 18, color: '64748B' })] })]
      : []),
    // after: 240 ≈ một dòng trống giữa các ghi chú
    new Paragraph({
      spacing: { after: 240 },
      children: lines.map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0 })),
    }),
  ];
}

export async function buildNotesDocx(notes: Note[], opts: ExportOptions = FULL_EXPORT): Promise<Buffer> {
  const children = notes.length
    ? notes.flatMap((note) => noteParagraphs(note, opts))
    : [new Paragraph({ children: [new TextRun('Không có ghi chú nào.')] })];
  const doc = new Document({
    creator: 'BangNote',
    title: 'BangNote',
    styles: { default: { document: { run: { font: 'Calibri', size: 24 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
```

`web/app/api/export/route.ts`:
- Đổi comment đầu hàm: dòng `` `detail=0` → dòng đầu mỗi ghi chú chỉ còn `#id`. `` thành `` `num=0` bỏ số #, `detail=0` bỏ tag/ngày giờ/link. ``
- Thay `const detailed = params.get('detail') !== '0';` bằng
```ts
    const opts = { number: params.get('num') !== '0', detail: params.get('detail') !== '0' };
```
- Thay `formatNotesTxt(notes, detailed)` → `formatNotesTxt(notes, opts)`; `buildNotesDocx(notes, detailed)` → `buildNotesDocx(notes, opts)`.

`web/components/NoteList.tsx`:
- Thay `const DETAIL_KEY = 'bn-export-detail';` bằng
```ts
const OPTION_KEYS = { number: 'bn-export-num', detail: 'bn-export-detail' } as const;
type ExportOption = keyof typeof OPTION_KEYS;
```
- Thay state `detailed` bằng `const [options, setOptions] = useState({ number: true, detail: true });`
- Thay `useEffect` đọc localStorage và `changeDetailed` bằng:
```ts
  useEffect(() => {
    try {
      setOptions({
        number: localStorage.getItem(OPTION_KEYS.number) !== '0',
        detail: localStorage.getItem(OPTION_KEYS.detail) !== '0',
      });
    } catch {
      // localStorage bị chặn → dùng mặc định
    }
  }, []);

  const changeOption = (key: ExportOption, value: boolean) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
    try {
      localStorage.setItem(OPTION_KEYS[key], value ? '1' : '0');
    } catch {
      // bỏ qua
    }
  };
```
- Trong `exportHref`: thay `detailed ? '' : 'detail=0'` bằng `options.number ? '' : 'num=0', options.detail ? '' : 'detail=0'`.
- Thay label ô tick cũ bằng hai ô:
```tsx
          <label className="flex items-center gap-1" title="Kèm số thứ tự trong tag">
            <input type="checkbox" checked={options.number} onChange={(e) => changeOption('number', e.target.checked)} />
            Kèm số #
          </label>
          <label className="flex items-center gap-1" title="Kèm tên tag, ngày giờ và link nguồn">
            <input type="checkbox" checked={options.detail} onChange={(e) => changeOption('detail', e.target.checked)} />
            Kèm tag, ngày giờ, link
          </label>
```

- [ ] **Step 3: Chạy test + commit**

Run: `npm test && npm run typecheck`
Expected: PASS / không lỗi.

```bash
git add web
git commit -m "feat(web): export options for #number and details, one blank line between notes"
```

---

### Task 5: Widget — chọn 1 tag, hiển thị "Tag #n"

**Files:**
- Modify: `widget/src/BangNote.Widget.Core/Models.cs`, `IApiClient.cs`, `ApiClient.cs`, `widget/src/BangNote.Widget/MainWindow.xaml.cs`
- Delete: `widget/src/BangNote.Widget.Core/TagToggle.cs`, `widget/tests/BangNote.Widget.Core.Tests/TagToggleTests.cs`
- Create: `widget/src/BangNote.Widget.Core/NoteLabel.cs`, `widget/tests/BangNote.Widget.Core.Tests/NoteLabelTests.cs`
- Modify tests: `ApiClientTests.cs`, `SaveServiceTests.cs`

**Interfaces:**
- Produces:
  - `record NoteDto(int Id, string Content, IReadOnlyList<TagDto> Tags, int Position = 0)`
  - `record TagPlacement(IReadOnlyList<TagDto> Tags, int Position)`
  - `IApiClient.SetNoteTagsAsync(int noteId, IReadOnlyList<int> tagIds, CancellationToken ct = default): Task<TagPlacement>`
  - `static class NoteLabel { string Saved(NoteDto note); int[]? TagIdsForPick(NoteDto note, int clickedTagId) }`

- [ ] **Step 1: Test thất bại**

`widget/tests/BangNote.Widget.Core.Tests/NoteLabelTests.cs`:
```csharp
namespace BangNote.Widget.Core.Tests;

public class NoteLabelTests
{
    private static readonly TagDto Temp = new(1, "Temp", "#94a3b8", true);
    private static readonly TagDto Ls = new(2, "LichSu", "#a855f7", false);

    [Fact]
    public void Saved_ShowsTagAndNumber() =>
        Assert.Equal("Đã lưu — Temp #3", NoteLabel.Saved(new NoteDto(9, "x", [Temp], 3)));

    [Fact]
    public void Saved_OldServerWithoutPosition_ShowsPlainSaved() =>
        Assert.Equal("Đã lưu", NoteLabel.Saved(new NoteDto(9, "x", [Temp])));

    [Fact]
    public void Saved_NoTags_ShowsPlainSaved() =>
        Assert.Equal("Đã lưu", NoteLabel.Saved(new NoteDto(9, "x", [], 3)));

    [Fact]
    public void Pick_OtherTag_SendsOnlyThatTag() =>
        Assert.Equal(new[] { 2 }, NoteLabel.TagIdsForPick(new NoteDto(9, "x", [Temp], 1), 2));

    [Fact]
    public void Pick_CurrentTag_NoRequest() =>
        Assert.Null(NoteLabel.TagIdsForPick(new NoteDto(9, "x", [Ls], 1), 2));
}
```

`ApiClientTests.cs`:
- Test `CreateNote_PostsWidgetSource_AndParsesNote`: thêm `,"position":4` vào JSON trả về (sau `"source":"widget"`), và thêm `Assert.Equal(4, note.Position);`.
- Test `SetNoteTags_PutsTagIds_AndReturnsTags`: JSON trả về thêm `,"position":5` (trước `}` cuối); đổi phần kiểm tra thành
```csharp
        var placement = await client.SetNoteTagsAsync(7, [2, 3]);

        Assert.Equal("Lịch sử", placement.Tags.Single().Name);
        Assert.Equal(5, placement.Position);
```

Xoá `TagToggleTests.cs`.

Run: `dotnet test`
Expected: FAIL biên dịch — `NoteLabel`, `NoteDto.Position`, `TagPlacement` chưa có.

- [ ] **Step 2: Cài đặt**

`Models.cs` — thay `NoteDto` bằng:
```csharp
/// <summary>Position = số thứ tự trong tag; 0 khi server cũ chưa trả trường này.</summary>
public sealed record NoteDto(int Id, string Content, IReadOnlyList<TagDto> Tags, int Position = 0);

public sealed record TagPlacement(IReadOnlyList<TagDto> Tags, int Position);
```

`IApiClient.cs` — đổi dòng `SetNoteTagsAsync` thành:
```csharp
    Task<TagPlacement> SetNoteTagsAsync(int noteId, IReadOnlyList<int> tagIds, CancellationToken ct = default);
```

`ApiClient.cs` — xoá `private sealed record SetTagsResponse(…)`; thay `SetNoteTagsAsync` bằng:
```csharp
    public Task<TagPlacement> SetNoteTagsAsync(int noteId, IReadOnlyList<int> tagIds, CancellationToken ct = default) =>
        SendAsync<TagPlacement>(HttpMethod.Put, $"/api/notes/{noteId}/tags", new { tagIds }, ct);
```

`NoteLabel.cs`:
```csharp
namespace BangNote.Widget.Core;

public static class NoteLabel
{
    /// <summary>"Đã lưu — Temp #3"; server cũ (không có position) → "Đã lưu".</summary>
    public static string Saved(NoteDto note) =>
        note.Position > 0 && note.Tags.Count > 0 ? $"Đã lưu — {note.Tags[0].Name} #{note.Position}" : "Đã lưu";

    /// <summary>Mỗi ghi chú chỉ 1 tag: bấm tag khác → gửi đúng tag đó; bấm tag hiện tại → null (không gửi).</summary>
    public static int[]? TagIdsForPick(NoteDto note, int clickedTagId) =>
        note.Tags.Count > 0 && note.Tags[0].Id == clickedTagId ? null : [clickedTagId];
}
```

Xoá `TagToggle.cs`.

`SaveServiceTests.cs` — trong `FakeApi`, đổi kiểu trả về:
```csharp
        public Task<TagPlacement> SetNoteTagsAsync(int noteId, IReadOnlyList<int> tagIds, CancellationToken ct = default) =>
            throw new NotSupportedException();
```

`MainWindow.xaml.cs`:
- Trong `ShowSavedAsync`: đổi `SetStatus($"Đã lưu #{note.Id}", OkBrush);` thành `SetStatus(NoteLabel.Saved(note), OkBrush);`
- Thay thân `ToggleTagAsync` (giữ chữ ký) bằng:
```csharp
        if (_lastNote is not { } note || _app.SaveService.Api is not { } api || _app.Tags is not { } cache) return;
        RestartRevert(TimeSpan.FromSeconds(5));
        if (NoteLabel.TagIdsForPick(note, tag.Id) is not { } tagIds) return;
        try
        {
            var placement = await api.SetNoteTagsAsync(note.Id, tagIds);
            _lastNote = note with { Tags = placement.Tags, Position = placement.Position };
            StatusText.Text = NoteLabel.Saved(_lastNote);
            RenderTags(_lastNote, cache.Current);
            RestartRevert(TimeSpan.FromSeconds(5));
        }
        catch (Exception ex) when (ex is ApiUnavailableException or ApiRejectedException)
        {
            ShowMessage(ex.Message, ErrorBrush, TimeSpan.FromSeconds(3));
        }
```

- [ ] **Step 3: Chạy test + build + commit**

Run: `dotnet test && dotnet build`
Expected: `Passed!`, `Build succeeded`.

```bash
git add -A widget
git commit -m "feat(widget): single-tag pick and 'Đã lưu — Tag #n' label"
```

---

### Task 6: Tài liệu

**Files:**
- Modify: `README.md`, `docs/manual-test.md`, `docs/superpowers/specs/2026-09-28-tag-numbering-design.md`

- [ ] **Step 1: `docs/manual-test.md`**

Trong mục `## Web admin`, thay dòng `- [ ] Bỏ tick "Kèm tag, ngày giờ, link" → file xuất chỉ còn \`#xx\` + nội dung; tải lại trang vẫn nhớ lựa chọn.` bằng:
```markdown
- [ ] Xuất với 4 tổ hợp "Kèm số #" / "Kèm tag, ngày giờ, link"; giữa các ghi chú chỉ một dòng trống; tải lại trang vẫn nhớ lựa chọn.
- [ ] Chip hiện `Tên tag #n`; bấm chip → chọn tag khác → ghi chú nhận số cuối dãy của tag mới.
- [ ] Lọc 1 tag → mặc định "Theo số #", có nút "Đánh số lại" và tay nắm ⠿; kéo ⠿ đổi thứ tự và số liền mạch.
- [ ] Sort "Cũ nhất" + "Đánh số lại" → số theo thời gian tạo.
- [ ] Xoá hết ghi chú trong một tag → ghi chú mới vào tag đó là `#1`.
```
Trong mục `## Bot Telegram`, thay dòng `- [ ] Bấm tag trên bàn phím → ✓ di chuyển đúng; bấm "Chưa phân loại" → bỏ hết tag thật.` bằng:
```markdown
- [ ] Trả lời "✅ Đã lưu — Tag #n"; bấm tag khác → tin nhắn đổi thành tag mới + số mới; bấm tag hiện tại → không đổi.
- [ ] Gõ 2 hashtag → gắn tag đầu + cảnh báo "Chỉ gắn 1 tag".
```
Trong mục `## Widget Windows`, thay dòng `- [ ] Bấm tag trong 5 giây → tag đổi trên web; bấm "Chưa phân loại" → bỏ hết tag thật.` bằng:
```markdown
- [ ] Hiện "Đã lưu — Tag #n"; bấm chip tag khác trong 5 giây → chuyển tag, nhãn đổi số.
```

- [ ] **Step 2: README**

Trong `README.md`, mục "Cài widget Windows", đổi dòng `- Sau khi lưu, bấm nút tag trong 5 giây để chuyển tag.` thành `- Sau khi lưu, widget hiện "Đã lưu — Tag #n"; bấm nút tag khác trong 5 giây để chuyển tag.`. Trong mục "Triển khai web", thêm sau bước 2: `> Cập nhật từ bản cũ: chạy lại \`npm run db:migrate\` (migration \`0002\` chuyển mỗi ghi chú về 1 tag và đánh số theo tag) **trước** khi deploy code mới.`

- [ ] **Step 3: Spec**

Trong `docs/superpowers/specs/2026-09-28-tag-numbering-design.md` §3, đổi `cảnh báo "Chỉ gắn 1 tag: #X"` thành `cảnh báo "Chỉ gắn 1 tag: <tên tag>"`, và thêm dòng vào bảng: `| Bấm nút Telegram của tag đã bị xoá | Không đổi, trả lời "Tag không còn" |`.

- [ ] **Step 4: Kiểm tra cuối + commit**

Run: `cd web && npm test && npm run typecheck && npm run build` và `cd widget && dotnet test`
Expected: tất cả PASS, build sạch.

```bash
git add README.md docs
git commit -m "docs: per-tag numbering, reorder and export options"
```
