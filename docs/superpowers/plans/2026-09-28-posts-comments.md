# Posts / comments numbering & pagination — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Số hai cấp `#bài.comment` trong mỗi tag, tự mở bài mới khi đổi nguồn/link, nút 📌/↳, xem theo nhóm có thu gọn và chọn cả bài, kéo bài/comment, phân trang theo số trang.

**Architecture:** Thêm cột `notes.sub` (0 = bài). Mọi phép đổi `(tag, position, sub)` gom vào `web/lib/notes/posts.ts` (tạo slot, tách/gộp, chuyển tag theo nhóm, đánh số lại theo sort, kéo thả). Hàm hiển thị số thuần nằm ở `web/lib/notes/number.ts` để component client dùng được. Web có hai chế độ liệt kê: nhóm (1 tag + "Theo số #", 20 bài/trang) và phẳng (50 ghi chú/trang).

**Tech Stack:** Như hiện tại — Next.js 16, Drizzle 0.45, PGlite (test), Vitest 5; widget .NET 8 WPF + xUnit.

**Spec:** `docs/superpowers/specs/2026-09-28-posts-comments-design.md` (bổ sung `2026-09-28-tag-numbering-design.md`)

## Global Constraints

- `sub = 0` là bài; `sub ≥ 1` là comment của bài `position`. Nhóm = cùng `(tag_id, position)`. Hiển thị `#5` / `#5.3` qua `formatNumber(position, sub)`.
- Ghi chú mới thành **bài mới** khi: tag rỗng; `newPost`; `source` khác ghi chú mốc; cùng `source`, cả hai có URL và `postKey` khác. Ngược lại là comment `sub = max + 1` của bài cuối. Ghi chú mốc = `ORDER BY position DESC, sub DESC, id DESC LIMIT 1` trong tag.
- `postKey`: host bỏ `www.`/`m.`/`mobile.`, pathname bỏ `/` cuối, chỉ giữ tham số `fbid`, `id`, `story_fbid`, `v` (theo thứ tự tên); URL hỏng → chuỗi đã trim.
- Mọi phép đổi số chạy trong transaction và gọi `lockTag` trên tag bị đổi.
- Chế độ nhóm: đúng 1 tag + sort `position`; 20 nhóm/trang. Chế độ phẳng: 50 ghi chú/trang. `page` ≥ 1, vượt quá → trang cuối. Bỏ tham số `limit`.
- Kéo sắp xếp chỉ khi `canReorder`; 📌/↳ ở mọi chế độ.
- Component client không được import `web/lib/notes/posts.ts`/`notes.ts`/`tags.ts` (kéo drizzle vào bundle) — chỉ `number.ts`, `filters.ts`, `groups.ts`, `selection.ts`, `reorder.ts`, `pager.ts`, `export/text.ts`, `types.ts`.
- Chuỗi hiển thị tiếng Việt. Lệnh `npm` chạy trong `web/`, `dotnet` trong `widget/`.

## Review Focus

1. **Xoá mất ghi chú bài của một nhóm** → nhóm chỉ còn comment; "Đánh số lại" phải đưa comment đầu thành bài — test ở Task 2.
2. **Link FB khác nhau nhưng cùng bài** (`?comment_id=`, `__cft__`, `m.facebook.com`) → cùng `postKey`; khác `story_fbid` → khác — test ở Task 1.
3. **Chuyển tag khi chỉ chọn bài + một phần comment** → phần được chọn thành nhóm mới, phần còn lại ở lại tag cũ — test ở Task 2.
4. **Kéo một comment thả lên thẻ của bài khác** → không đổi gì (không nhảy nhóm) — test ở Task 2.
5. **`page` lớn hơn số trang** (vd sau khi xoá bớt) → hiện trang cuối, không trang trắng — test ở Task 3.

---

## File Structure

```
web/db/migrations/0003_post_comments.sql     (mới)
web/lib/db/schema.ts                          notes + sub
web/lib/notes/number.ts                       (mới) formatNumber
web/lib/notes/posts.ts                        (mới) postKey, shouldStartPost, slotAfter, lastAnchor, moveNotes, moveNote,
                                              splitPost, mergeIntoPrevious, renumberTag, dropNote
web/lib/notes/tags.ts                         Placement + sub; bỏ moveNote, renumberTag; deleteTag giữ nhóm
web/lib/notes/notes.ts                        createNote theo slot; bỏ moveNotes; buildConditions; listNotesPage, listPostsPage
web/lib/notes/types.ts                        Note + sub
web/lib/notes/filters.ts                      page, posts, isGrouped, renumberConfirmText mới; bỏ limit
web/lib/notes/validation.ts                   newPost
web/lib/groups.ts, pager.ts                   (mới) groupNotes, expandSelection; pageItems
web/lib/selection.ts                          + idsBetween
web/lib/reorder.ts                            + target
web/lib/telegram/keyboard.ts, handler.ts      📌 Bài mới, savedLabel(tag, pos, sub)
web/lib/export/text.ts                        #5.3
web/app/api/notes/route.ts                    newPost
web/app/api/notes/[id]/tags/route.ts          + sub
web/app/api/notes/[id]/new-post/route.ts      (mới)
web/app/(admin)/actions.ts                    splitPostAction, mergePostAction, dropNoteAction, renumberAction(sort)
web/app/(admin)/page.tsx                      chế độ nhóm/phẳng, Pager
web/components/Pager.tsx                      (mới)
web/components/NoteList.tsx                   viết lại: nhóm, thu gọn, chọn cả bài, kéo bài/comment
web/components/NoteCard.tsx, TagChip.tsx, QuickAdd.tsx, Filters.tsx
widget/src/BangNote.Widget.Core/Models.cs, IApiClient.cs, ApiClient.cs, NoteLabel.cs
widget/src/BangNote.Widget/MainWindow.xaml.cs
```

---

### Task 1: Cột `sub`, số hiển thị, quy tắc tạo bài mới

**Files:**
- Create: `web/db/migrations/0003_post_comments.sql`, `web/lib/notes/number.ts`, `web/lib/notes/posts.ts`, `web/tests/posts-rules.test.ts`, `web/tests/migration-0003.test.ts`
- Modify: `web/lib/db/schema.ts`, `web/lib/notes/types.ts`, `web/lib/notes/tags.ts` (Placement), `web/lib/notes/notes.ts` (createNote, order), `web/lib/notes/validation.ts`, `web/app/(admin)/actions.ts` (createNoteAction), `web/components/QuickAdd.tsx`
- Modify tests: `web/tests/notes.test.ts`, `web/tests/api.test.ts`, `web/tests/components.test.ts`, `web/tests/export.test.ts`

**Interfaces:**
- Produces:
  - `formatNumber(position: number, sub: number): string` (`number.ts`).
  - `Note.sub: number`; `Placement = { tag: Tag; position: number; sub: number }`.
  - `posts.ts`: `postKey(url)`, `interface Anchor { position; sub; source: Source; sourceUrl: string | null }`, `interface Slot { position; sub }`, `shouldStartPost(anchor: Anchor | null, next: { source; sourceUrl?; newPost? }): boolean`, `slotAfter(anchor, asPost): Slot`, `lastAnchor(db, tagId): Promise<Anchor | null>`.
  - `CreateNoteInput.newPost?: boolean`; API body `newPost?: boolean`; form field `newPost=1`.
  - `listNotes` sort `position` thứ tự `(tag_id, position, sub, id)`.

- [ ] **Step 1: Test thất bại**

`web/tests/migration-0003.test.ts`:
```ts
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
```

`web/tests/posts-rules.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { formatNumber } from '@/lib/notes/number';
import { createNote } from '@/lib/notes/notes';
import { postKey, shouldStartPost, slotAfter } from '@/lib/notes/posts';
import { createTag } from '@/lib/notes/tags';
import { createTestDb, type TestDb } from './helpers/test-db';

describe('formatNumber / postKey / shouldStartPost / slotAfter', () => {
  it('formatNumber', () => {
    expect(formatNumber(5, 0)).toBe('5');
    expect(formatNumber(5, 12)).toBe('5.12');
  });

  it('postKey: cùng bài FB dù khác comment_id / tham số phụ / m.', () => {
    const a = postKey('https://www.facebook.com/groups/abc/posts/123/?comment_id=9&__cft__[0]=x#r');
    expect(postKey('https://m.facebook.com/groups/abc/posts/123?mibextid=z')).toBe(a);
    expect(a).toBe('facebook.com/groups/abc/posts/123');
    expect(postKey('https://www.facebook.com/permalink.php?story_fbid=1&id=2&comment_id=3')).toBe(
      'facebook.com/permalink.php?id=2&story_fbid=1',
    );
    expect(postKey('https://www.facebook.com/permalink.php?story_fbid=1&id=2')).not.toBe(
      postKey('https://www.facebook.com/permalink.php?story_fbid=7&id=2'),
    );
    expect(postKey('https://youtube.com/watch?v=abc&t=10')).toBe('youtube.com/watch?v=abc');
    expect(postKey('  không phải url ')).toBe('không phải url');
  });

  it('shouldStartPost', () => {
    const anchor = { position: 3, sub: 2, source: 'extension' as const, sourceUrl: 'https://fb.com/p/1?comment_id=1' };
    expect(shouldStartPost(null, { source: 'web' })).toBe(true);
    expect(shouldStartPost(anchor, { source: 'extension', sourceUrl: 'https://fb.com/p/1?comment_id=2' })).toBe(false);
    expect(shouldStartPost(anchor, { source: 'extension', sourceUrl: 'https://fb.com/p/2' })).toBe(true);
    expect(shouldStartPost(anchor, { source: 'telegram' })).toBe(true);
    expect(shouldStartPost({ ...anchor, sourceUrl: null }, { source: 'extension', sourceUrl: 'https://fb.com/p/2' })).toBe(false);
    expect(shouldStartPost(anchor, { source: 'extension', sourceUrl: 'https://fb.com/p/1', newPost: true })).toBe(true);
  });

  it('slotAfter', () => {
    const anchor = { position: 3, sub: 2, source: 'web' as const, sourceUrl: null };
    expect(slotAfter(null, false)).toEqual({ position: 1, sub: 0 });
    expect(slotAfter(anchor, false)).toEqual({ position: 3, sub: 3 });
    expect(slotAfter(anchor, true)).toEqual({ position: 4, sub: 0 });
  });
});

describe('createNote theo quy tắc bài / comment', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());
  const num = (n: { position: number; sub: number }) => formatNumber(n.position, n.sub);

  it('tag rỗng → #1; cùng nguồn → comment; đổi nguồn → bài mới', async () => {
    expect(num(await createNote(t.db, { content: 'bài', source: 'web' }))).toBe('1');
    expect(num(await createNote(t.db, { content: 'c1', source: 'web' }))).toBe('1.1');
    expect(num(await createNote(t.db, { content: 'c2', source: 'web' }))).toBe('1.2');
    expect(num(await createNote(t.db, { content: 'bot', source: 'telegram' }))).toBe('2');
    expect(num(await createNote(t.db, { content: 'bot2', source: 'telegram' }))).toBe('2.1');
  });

  it('extension: cùng bài FB → comment, khác bài → bài mới; newPost luôn mở bài', async () => {
    const fb = (p: string) => ({ source: 'extension' as const, sourceUrl: `https://www.facebook.com/g/posts/${p}` });
    expect(num(await createNote(t.db, { content: 'p1', ...fb('1') }))).toBe('1');
    expect(num(await createNote(t.db, { content: 'c', ...fb('1/?comment_id=5') }))).toBe('1.1');
    expect(num(await createNote(t.db, { content: 'p2', ...fb('2') }))).toBe('2');
    expect(num(await createNote(t.db, { content: 'x', ...fb('2'), newPost: true }))).toBe('3');
  });

  it('mỗi tag có dãy riêng', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    await createNote(t.db, { content: 'a', source: 'web' });
    expect(num(await createNote(t.db, { content: 'b', source: 'web', tagIds: [ls.id] }))).toBe('1');
  });
});
```

Run: `npm test -- tests/migration-0003.test.ts tests/posts-rules.test.ts`
Expected: FAIL — thiếu `0003_post_comments.sql`, `@/lib/notes/number`, `@/lib/notes/posts`.

- [ ] **Step 2: Migration, schema, type**

`web/db/migrations/0003_post_comments.sql`:
```sql
ALTER TABLE notes ADD COLUMN sub integer NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS notes_tag_position;
CREATE INDEX notes_tag_position ON notes (tag_id, position, sub);
```

`web/lib/db/schema.ts` — trong bảng `notes`, thêm ngay sau dòng `position: integer('position').notNull(),`:
```ts
  /** 0 = bài; ≥ 1 = comment thứ `sub` của bài `position` (hiển thị "#position.sub"). */
  sub: integer('sub').notNull().default(0),
```

`web/lib/notes/types.ts` — trong `interface Note`, thêm sau `position: number;`:
```ts
  /** 0 = bài; ≥ 1 = comment của bài `position`. */
  sub: number;
```

`web/lib/notes/tags.ts` — đổi `interface Placement` thành:
```ts
export interface Placement {
  tag: Tag;
  position: number;
  sub: number;
}
```
và trong `moveNote` (còn ở tags.ts tới Task 2) đổi hai `return` thành `return { tag, position: note.position, sub: 0 };` và `return { tag, position, sub: 0 };`.

`web/lib/notes/number.ts`:
```ts
/** "#5" cho bài, "#5.3" cho comment thứ 3 của bài 5 (không kèm dấu #). */
export function formatNumber(position: number, sub: number): string {
  return sub > 0 ? `${position}.${sub}` : `${position}`;
}
```

`web/lib/notes/posts.ts`:
```ts
import { desc, eq } from 'drizzle-orm';
import { notes, type Source } from '@/lib/db/schema';
import type { DB } from '@/lib/db/types';

const ID_PARAMS = ['fbid', 'id', 'story_fbid', 'v'] as const;

/** Khoá định danh bài của một link, để so "cùng bài" giữa các lần lưu từ extension. */
export function postKey(url: string): string {
  const raw = url.trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  const keep = ID_PARAMS.filter((k) => u.searchParams.has(k)).map((k) => `${k}=${u.searchParams.get(k)}`);
  return `${host}${path}${keep.length ? `?${keep.join('&')}` : ''}`;
}

export interface Anchor {
  position: number;
  sub: number;
  source: Source;
  sourceUrl: string | null;
}

export interface Slot {
  position: number;
  sub: number;
}

export interface NewNoteHints {
  source: Source;
  sourceUrl?: string | null;
  newPost?: boolean;
}

/** Ghi chú mới có mở bài mới không, so với ghi chú mốc (ghi chú thêm gần nhất vào bài cuối). */
export function shouldStartPost(anchor: Anchor | null, next: NewNoteHints): boolean {
  if (!anchor || next.newPost) return true;
  if (anchor.source !== next.source) return true;
  return !!anchor.sourceUrl && !!next.sourceUrl && postKey(anchor.sourceUrl) !== postKey(next.sourceUrl);
}

export function slotAfter(anchor: Anchor | null, asPost: boolean): Slot {
  if (!anchor || asPost) return { position: (anchor?.position ?? 0) + 1, sub: 0 };
  return { position: anchor.position, sub: anchor.sub + 1 };
}

/** Ghi chú mốc của tag: bài cuối (position lớn nhất), comment cuối (sub lớn nhất). */
export async function lastAnchor(db: DB, tagId: number): Promise<Anchor | null> {
  const [row] = await db
    .select({ position: notes.position, sub: notes.sub, source: notes.source, sourceUrl: notes.sourceUrl })
    .from(notes)
    .where(eq(notes.tagId, tagId))
    .orderBy(desc(notes.position), desc(notes.sub), desc(notes.id))
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 3: createNote, thứ tự, newPost**

`web/lib/notes/notes.ts`:
- Import: `import { lockTag, moveNote, nextPosition, pickTagId, resolveTag, tagColumns } from './tags';` → `import { lockTag, moveNote, pickTagId, resolveTag, tagColumns } from './tags';` và thêm `import { lastAnchor, shouldStartPost, slotAfter } from './posts';`.
- `CreateNoteInput`: thêm `newPost?: boolean;`.
- `noteColumns`: thêm `sub: notes.sub,` sau `position: notes.position,`.
- Trong `createNote`: thay `const position = await nextPosition(tx, tag.id);` bằng
```ts
    const anchor = await lastAnchor(tx, tag.id);
    const slot = slotAfter(anchor, shouldStartPost(anchor, input));
```
  và trong `.values({…})` thay `position,` bằng `position: slot.position,\n        sub: slot.sub,`.
- Trong `listNotes`: thay `[asc(notes.tagId), asc(notes.position), asc(notes.id)]` bằng `[asc(notes.tagId), asc(notes.position), asc(notes.sub), asc(notes.id)]`.

`web/lib/notes/validation.ts` — trong `createNoteBody` thêm `newPost: z.boolean().optional(),`.

`web/app/(admin)/actions.ts` — trong `createNoteAction`, thêm vào object truyền `createNote`: `newPost: formData.get('newPost') === '1',`.

`web/components/QuickAdd.tsx` — thêm ngay trước nút Lưu (`<button disabled={pending}`):
```tsx
        <label className="flex items-center gap-1 text-sm" title="Ghi chú này là nội dung bài viết mới (không phải comment)">
          <input type="checkbox" name="newPost" value="1" />
          Là bài mới
        </label>
```

- [ ] **Step 4: Sửa test cũ theo quy tắc mới**

`web/tests/notes.test.ts`, test `'createNote cấp max + 1 trong tag, tag rỗng → 1 (kể cả sau khi xoá hết)'` — thay thân test bằng:
```ts
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    expect((await createNote(t.db, { content: 'a', source: 'web', tagIds: [ls.id] })).position).toBe(1);
    const b = await createNote(t.db, { content: 'b', source: 'web', tagIds: [ls.id], newPost: true });
    expect(b.position).toBe(2);
    expect((await createNote(t.db, { content: 'c', source: 'web' })).position).toBe(1);
    await deleteNotes(t.db, (await listNotes(t.db, { tagIds: [ls.id] })).notes.map((n) => n.id));
    expect((await createNote(t.db, { content: 'd', source: 'web', tagIds: [ls.id] })).position).toBe(1);
```
Trong test `"sort 'position' tăng dần theo số"`: tạo `B` với `newPost: true`.
Trong test `'moveNotes: …'`: tạo `a` và `b` với `newPost: true` (để mỗi cái là một bài riêng).

`web/tests/api.test.ts`, test `'trả position theo tag'`: thay dòng kỳ vọng bằng
```ts
    expect([first.position, first.sub, second.position, second.sub]).toEqual([1, 0, 1, 1]);
```

`web/tests/components.test.ts` và `web/tests/export.test.ts`: thêm `sub: 0,` ngay sau `position: 3,` trong Note mẫu.

- [ ] **Step 5: Chạy toàn bộ + commit**

Run: `npm test && npm run typecheck`
Expected: PASS / không lỗi type.

```bash
git add web
git commit -m "feat(web): post/comment sub-number with auto new post on source or link change"
```

---

### Task 2: Thao tác nhóm — chuyển tag, tách, gộp, đánh số lại, kéo thả

**Files:**
- Modify: `web/lib/notes/posts.ts`, `web/lib/notes/tags.ts`, `web/lib/notes/notes.ts`, `web/lib/telegram/handler.ts` (import), `web/app/api/notes/[id]/tags/route.ts`, `web/app/(admin)/actions.ts`
- Test: `web/tests/posts-ops.test.ts` (mới); modify `web/tests/tags.test.ts`, `web/tests/notes.test.ts`

**Interfaces:**
- Consumes: `lockTag`, `nextPosition`, `resolveTag`, `pickTagId`, `tagColumns`, `Placement` (tags.ts); `Sort` (type, notes.ts).
- Produces (tất cả ở `posts.ts`; xoá bản cũ ở tags.ts/notes.ts):
  - `moveNotes(db, ids: number[], tagId: number | null): Promise<void>`
  - `moveNote(db, noteId, tagId: number | null): Promise<Placement>`
  - `splitPost(db, noteId): Promise<Placement>`
  - `mergeIntoPrevious(db, noteId): Promise<Placement>` — `invalid` "Không có bài nào trước".
  - `renumberTag(db, tagId, sort: Sort = 'position'): Promise<void>`
  - `dropNote(db, movingId, targetId, after: boolean): Promise<void>`
  - `deleteTag` (tags.ts) giữ nguyên nhóm/sub khi dồn sang tag mặc định.
  - Actions: `renumberAction(tagId, sort: Sort)`, `splitPostAction(noteId)`, `mergePostAction(noteId)`, `dropNoteAction(movingId, targetId, after)`; xoá `reorderAction`.

- [ ] **Step 1: Test thất bại**

`web/tests/posts-ops.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { formatNumber } from '@/lib/notes/number';
import { createNote, getNote } from '@/lib/notes/notes';
import { dropNote, mergeIntoPrevious, moveNote, moveNotes, renumberTag, splitPost } from '@/lib/notes/posts';
import { createTag, deleteTag, getDefaultTag } from '@/lib/notes/tags';
import { createTestDb, type TestDb } from './helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const add = (content: string, extra: Record<string, unknown> = {}) => createNote(t.db, { content, source: 'web', ...extra });
const num = async (id: number) => {
  const n = (await getNote(t.db, id))!;
  return `${n.tags[0].name} #${formatNumber(n.position, n.sub)}`;
};
const nums = (ids: number[]) => Promise.all(ids.map(num));
const DEF = 'Chưa phân loại';

/** Bài #1 (p1) với c1, c2, c3; bài #2 (p2) với d1. */
async function seed() {
  const p1 = await add('p1');
  const c1 = await add('c1');
  const c2 = await add('c2');
  const c3 = await add('c3');
  const p2 = await add('p2', { newPost: true });
  const d1 = await add('d1');
  return { p1: p1.id, c1: c1.id, c2: c2.id, c3: c3.id, p2: p2.id, d1: d1.id };
}

describe('splitPost (📌 Bài mới)', () => {
  it('tách comment và các comment sau nó thành bài mới cuối tag', async () => {
    const s = await seed();
    expect(await splitPost(t.db, s.c2)).toMatchObject({ position: 3, sub: 0 });
    expect(await nums([s.c1, s.c2, s.c3, s.d1])).toEqual([`${DEF} #1.1`, `${DEF} #3`, `${DEF} #3.1`, `${DEF} #2.1`]);
  });

  it('ghi chú đã là bài → không đổi', async () => {
    const s = await seed();
    expect(await splitPost(t.db, s.p2)).toMatchObject({ position: 2, sub: 0 });
    expect(await num(s.d1)).toBe(`${DEF} #2.1`);
  });
});

describe('mergeIntoPrevious (↳ Gộp vào bài trước)', () => {
  it('cả nhóm nối vào cuối nhóm trước', async () => {
    const s = await seed();
    expect(await mergeIntoPrevious(t.db, s.p2)).toMatchObject({ position: 1, sub: 4 });
    expect(await nums([s.p2, s.d1])).toEqual([`${DEF} #1.4`, `${DEF} #1.5`]);
  });

  it('không có bài trước → lỗi', async () => {
    const s = await seed();
    await expect(mergeIntoPrevious(t.db, s.p1)).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('moveNotes / moveNote (chuyển tag)', () => {
  it('chọn cả bài → thành bài mới cuối tag đích, comment giữ thứ tự', async () => {
    const ls = await createTag(t.db, { name: 'LS' });
    await add('có sẵn', { tagIds: [ls.id] });
    const s = await seed();
    await moveNotes(t.db, [s.c2, s.p1, s.c1, s.c3], ls.id);
    expect(await nums([s.p1, s.c1, s.c2, s.c3])).toEqual(['LS #2', 'LS #2.1', 'LS #2.2', 'LS #2.3']);
  });

  it('bài + một phần comment → phần được chọn đi, phần còn lại ở lại', async () => {
    const ls = await createTag(t.db, { name: 'LS' });
    const s = await seed();
    await moveNotes(t.db, [s.p1, s.c2], ls.id);
    expect(await nums([s.p1, s.c2, s.c1, s.c3])).toEqual(['LS #1', 'LS #1.1', `${DEF} #1.1`, `${DEF} #1.3`]);
  });

  it('chỉ comment → comment nối tiếp bài cuối tag đích; tag đích rỗng → comment đầu thành bài #1', async () => {
    const ls = await createTag(t.db, { name: 'LS' });
    const yh = await createTag(t.db, { name: 'YH' });
    await add('x', { tagIds: [ls.id] });
    const s = await seed();
    await moveNotes(t.db, [s.c1, s.c3], ls.id);
    expect(await nums([s.c1, s.c3])).toEqual(['LS #1.1', 'LS #1.2']);
    await moveNotes(t.db, [s.c2, s.d1], yh.id);
    expect(await nums([s.c2, s.d1])).toEqual(['YH #1', 'YH #1.1']);
  });

  it('moveNote một ghi chú; vào chính tag đang ở → không đổi', async () => {
    const ls = await createTag(t.db, { name: 'LS' });
    const s = await seed();
    expect(await moveNote(t.db, s.p2, ls.id)).toMatchObject({ tag: { name: 'LS' }, position: 1, sub: 0 });
    expect((await moveNote(t.db, s.c1, null)).sub).toBe(1);
    await expect(moveNote(t.db, 9999, null)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('renumberTag (theo sort, toàn tag)', () => {
  it('theo số: dồn chỗ trống, comment .1…; nhóm mất bài → comment đầu thành bài', async () => {
    const s = await seed();
    await t.pg.query('DELETE FROM notes WHERE id = $1 OR id = $2', [s.p1, s.c2]);
    await t.pg.query('UPDATE notes SET position = 7 WHERE id = $1 OR id = $2', [s.p2, s.d1]);
    const def = await getDefaultTag(t.db);
    await renumberTag(t.db, def.id, 'position');
    expect(await nums([s.c1, s.c3, s.p2, s.d1])).toEqual([`${DEF} #1`, `${DEF} #1.1`, `${DEF} #2`, `${DEF} #2.1`]);
  });

  it('theo "Cũ nhất": nhóm xếp theo ghi chú cũ nhất của nhóm', async () => {
    const s = await seed();
    await t.pg.query('UPDATE notes SET position = 1 WHERE id = $1 OR id = $2', [s.p2, s.d1]); // đổi chỗ bằng tay
    await t.pg.query('UPDATE notes SET position = 2 WHERE id IN ($1, $2, $3, $4)', [s.p1, s.c1, s.c2, s.c3]);
    const def = await getDefaultTag(t.db);
    await renumberTag(t.db, def.id, 'oldest');
    expect(await nums([s.p1, s.c3, s.p2])).toEqual([`${DEF} #1`, `${DEF} #1.3`, `${DEF} #2`]);
  });
});

describe('dropNote (kéo thả)', () => {
  it('kéo bài → cả nhóm đổi chỗ, số bài dồn 1…n', async () => {
    const s = await seed();
    const p3 = await add('p3', { newPost: true });
    await dropNote(t.db, p3.id, s.p1, false);
    expect(await nums([p3.id, s.p1, s.c3, s.p2])).toEqual([`${DEF} #1`, `${DEF} #2`, `${DEF} #2.3`, `${DEF} #3`]);
  });

  it('kéo comment trong bài → đổi thứ tự comment', async () => {
    const s = await seed();
    await dropNote(t.db, s.c3, s.c1, false);
    expect(await nums([s.c3, s.c1, s.c2])).toEqual([`${DEF} #1.1`, `${DEF} #1.2`, `${DEF} #1.3`]);
    await dropNote(t.db, s.c3, s.p1, true); // thả lên bài → thành comment đầu
    expect(await num(s.c3)).toBe(`${DEF} #1.1`);
  });

  it('kéo comment sang bài khác → không đổi', async () => {
    const s = await seed();
    await dropNote(t.db, s.c1, s.d1, true);
    expect(await nums([s.c1, s.d1])).toEqual([`${DEF} #1.1`, `${DEF} #2.1`]);
  });
});

describe('deleteTag giữ nhóm', () => {
  it('nhóm của tag bị xoá nối cuối tag mặc định, giữ comment', async () => {
    const ls = await createTag(t.db, { name: 'LS' });
    await add('x');
    const p = await add('p', { tagIds: [ls.id] });
    const c = await add('c', { tagIds: [ls.id] });
    await deleteTag(t.db, ls.id);
    expect(await nums([p.id, c.id])).toEqual([`${DEF} #2`, `${DEF} #2.1`]);
  });
});
```

`web/tests/tags.test.ts`:
- Import: bỏ `moveNote`, `renumberTag` khỏi import từ `@/lib/notes/tags`; thêm `import { moveNote, renumberTag } from '@/lib/notes/posts';`.
- Xoá `describe('renumberTag', …)` (3 test dùng danh sách id) — đã thay bằng posts-ops.test.ts; giữ `describe('renumberTag với tag rất lớn', …)`.
- Trong `describe('renumberTag với tag rất lớn'`, đổi `await renumberTag(t.db, ls.id, rows.map((r) => r.id));` thành `await renumberTag(t.db, ls.id, 'oldest');` (xoá dòng `const { rows } = …` không còn dùng).

`web/tests/notes.test.ts`: đổi import `moveNotes` sang `import { moveNotes } from '@/lib/notes/posts';` (bỏ khỏi import notes).

Run: `npm test -- tests/posts-ops.test.ts`
Expected: FAIL — `dropNote`, `splitPost`… chưa export.

- [ ] **Step 2: Cài đặt `posts.ts`**

Thay 3 dòng import đầu `web/lib/notes/posts.ts` bằng:
```ts
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { notes, tags, type Source } from '@/lib/db/schema';
import type { DB } from '@/lib/db/types';
import { DomainError } from './errors';
import type { Sort } from './notes';
import { lockTag, nextPosition, resolveTag, tagColumns, type Placement } from './tags';
```
và thêm cuối file:
```ts
type NoteRef = { id: number; tagId: number; position: number; sub: number };
const refColumns = { id: notes.id, tagId: notes.tagId, position: notes.position, sub: notes.sub };

async function getRef(db: DB, id: number): Promise<NoteRef> {
  const [row] = await db.select(refColumns).from(notes).where(eq(notes.id, id));
  if (!row) throw new DomainError('not_found', 'Không tìm thấy ghi chú');
  return row;
}

async function placementOf(db: DB, id: number): Promise<Placement> {
  const [row] = await db
    .select({ position: notes.position, sub: notes.sub, tag: tagColumns })
    .from(notes)
    .innerJoin(tags, eq(tags.id, notes.tagId))
    .where(eq(notes.id, id));
  if (!row) throw new DomainError('not_found', 'Không tìm thấy ghi chú');
  return row;
}

/**
 * Chuyển ghi chú sang tag khác theo từng nhóm nguồn (thứ tự xuất hiện trong `ids`):
 * có chọn bài của nhóm → các ghi chú được chọn thành nhóm mới cuối tag đích;
 * chỉ chọn comment → comment nối tiếp bài cuối tag đích (tag rỗng → ghi chú đầu thành bài #1).
 */
export async function moveNotes(db: DB, ids: number[], tagId: number | null): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await resolveTag(tx, tagId);
    await lockTag(tx, target.id);
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const rows = await tx.select(refColumns).from(notes).where(inArray(notes.id, unique));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const groups = new Map<string, NoteRef[]>();
    for (const id of unique) {
      const r = byId.get(id);
      if (!r || r.tagId === target.id) continue;
      const key = `${r.tagId}:${r.position}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    for (const members of groups.values()) {
      members.sort((a, b) => a.sub - b.sub || a.id - b.id);
      const asPost = members[0].sub === 0;
      const slot = slotAfter(await lastAnchor(tx, target.id), asPost);
      for (const [i, m] of members.entries()) {
        await tx
          .update(notes)
          .set({ tagId: target.id, position: slot.position, sub: slot.sub + i, updatedAt: new Date() })
          .where(eq(notes.id, m.id));
      }
    }
  });
}

export async function moveNote(db: DB, noteId: number, tagId: number | null): Promise<Placement> {
  return db.transaction(async (tx) => {
    await getRef(tx, noteId);
    await moveNotes(tx, [noteId], tagId);
    return placementOf(tx, noteId);
  });
}

/** 📌 Bài mới: ghi chú (và các comment sau nó trong bài) thành bài mới cuối tag. Đã là bài → giữ nguyên. */
export async function splitPost(db: DB, noteId: number): Promise<Placement> {
  return db.transaction(async (tx) => {
    const note = await getRef(tx, noteId);
    if (note.sub === 0) return placementOf(tx, noteId);
    await lockTag(tx, note.tagId);
    const position = await nextPosition(tx, note.tagId);
    await tx.execute(sql`
      UPDATE notes n SET position = ${position}::int, sub = r.rn::int - 1
      FROM (SELECT id, row_number() OVER (ORDER BY sub, id) AS rn FROM notes
            WHERE tag_id = ${note.tagId}::int AND position = ${note.position}::int AND sub >= ${note.sub}::int) r
      WHERE n.id = r.id`);
    return placementOf(tx, noteId);
  });
}

/** ↳ Gộp vào bài trước: cả nhóm của ghi chú thành các comment nối tiếp nhóm đứng ngay trước. */
export async function mergeIntoPrevious(db: DB, noteId: number): Promise<Placement> {
  return db.transaction(async (tx) => {
    const note = await getRef(tx, noteId);
    await lockTag(tx, note.tagId);
    const [prev] = await tx
      .select({ position: sql<number | null>`max(${notes.position})::int` })
      .from(notes)
      .where(and(eq(notes.tagId, note.tagId), lt(notes.position, note.position)));
    if (prev?.position == null) throw new DomainError('invalid', 'Không có bài nào trước');
    const [base] = await tx
      .select({ sub: sql<number>`max(${notes.sub})::int` })
      .from(notes)
      .where(and(eq(notes.tagId, note.tagId), eq(notes.position, prev.position)));
    await tx.execute(sql`
      UPDATE notes n SET position = ${prev.position}::int, sub = ${base.sub}::int + r.rn::int
      FROM (SELECT id, row_number() OVER (ORDER BY sub, id) AS rn FROM notes
            WHERE tag_id = ${note.tagId}::int AND position = ${note.position}::int) r
      WHERE n.id = r.id`);
    return placementOf(tx, noteId);
  });
}

/**
 * Đánh số lại toàn tag theo `sort`: nhóm xếp theo ghi chú đầu của nhóm theo sort đó rồi đánh 1…n;
 * trong nhóm giữ thứ tự sub, đánh 0, 1, 2… (nhóm mất bài → comment đầu thành bài).
 */
export async function renumberTag(db: DB, tagId: number, sort: Sort = 'position'): Promise<void> {
  await db.transaction(async (tx) => {
    await lockTag(tx, tagId);
    const rows = await tx
      .select({ id: notes.id, position: notes.position, updatedAt: notes.updatedAt })
      .from(notes)
      .where(eq(notes.tagId, tagId))
      .orderBy(asc(notes.position), asc(notes.sub), asc(notes.id));
    if (!rows.length) return;
    const groups = new Map<number, typeof rows>();
    for (const r of rows) {
      if (!groups.has(r.position)) groups.set(r.position, []);
      groups.get(r.position)!.push(r);
    }
    const key = (g: typeof rows): number =>
      sort === 'oldest'
        ? Math.min(...g.map((r) => r.id))
        : sort === 'newest'
          ? -Math.max(...g.map((r) => r.id))
          : sort === 'updated'
            ? -Math.max(...g.map((r) => r.updatedAt.getTime()))
            : g[0].position;
    const list = [...groups.values()].sort((a, b) => key(a) - key(b) || a[0].position - b[0].position);
    const ids: number[] = [];
    const positions: number[] = [];
    const subs: number[] = [];
    list.forEach((g, i) =>
      g.forEach((r, j) => {
        ids.push(r.id);
        positions.push(i + 1);
        subs.push(j);
      }),
    );
    await tx.execute(sql`
      UPDATE notes n SET position = v.pos, sub = v.sub
      FROM unnest(${sql.param(ids)}::int[], ${sql.param(positions)}::int[], ${sql.param(subs)}::int[]) AS v(id, pos, sub)
      WHERE n.id = v.id`);
  });
}

/** Kéo thả: bài → cả nhóm tới trước/sau nhóm của `targetId`; comment → đổi chỗ trong nhóm của nó (khác nhóm → bỏ qua). */
export async function dropNote(db: DB, movingId: number, targetId: number, after: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const moving = await getRef(tx, movingId);
    const target = await getRef(tx, targetId);
    if (moving.tagId !== target.tagId) throw new DomainError('invalid', 'Chỉ sắp xếp được trong cùng một tag');
    await lockTag(tx, moving.tagId);
    if (moving.sub === 0) await reorderGroups(tx, moving.tagId, moving.position, target.position, after);
    else if (target.position === moving.position) await reorderComments(tx, moving, target, after);
  });
}

async function reorderGroups(db: DB, tagId: number, from: number, to: number, after: boolean): Promise<void> {
  if (from === to) return;
  const rows = await db
    .selectDistinct({ position: notes.position })
    .from(notes)
    .where(eq(notes.tagId, tagId))
    .orderBy(asc(notes.position));
  const order = rows.map((r) => r.position).filter((p) => p !== from);
  const index = order.indexOf(to);
  if (index < 0) return;
  order.splice(after ? index + 1 : index, 0, from);
  const news = order.map((_, i) => i + 1);
  await db.execute(sql`
    UPDATE notes n SET position = m.new
    FROM unnest(${sql.param(order)}::int[], ${sql.param(news)}::int[]) AS m(old, new)
    WHERE n.tag_id = ${tagId}::int AND n.position = m.old`);
}

async function reorderComments(db: DB, moving: NoteRef, target: NoteRef, after: boolean): Promise<void> {
  const rows = await db
    .select({ id: notes.id, sub: notes.sub })
    .from(notes)
    .where(and(eq(notes.tagId, moving.tagId), eq(notes.position, moving.position)))
    .orderBy(asc(notes.sub), asc(notes.id));
  const comments = rows.filter((r) => r.sub > 0 && r.id !== moving.id).map((r) => r.id);
  let index: number;
  if (target.sub === 0) index = 0;
  else {
    const at = comments.indexOf(target.id);
    if (at < 0) return;
    index = after ? at + 1 : at;
  }
  comments.splice(index, 0, moving.id);
  const subs = comments.map((_, i) => i + 1);
  await db.execute(sql`
    UPDATE notes n SET sub = v.sub
    FROM unnest(${sql.param(comments)}::int[], ${sql.param(subs)}::int[]) AS v(id, sub)
    WHERE n.id = v.id`);
}
```

- [ ] **Step 3: Dọn tags.ts / notes.ts, cập nhật nơi gọi**

`web/lib/notes/tags.ts`:
- Xoá hàm `moveNote` và hàm `renumberTag` (cùng comment JSDoc của chúng).
- Trong `deleteTag` thay câu `tx.execute(sql\`UPDATE notes n SET tag_id … \`)` bằng:
```ts
    await tx.execute(sql`
      UPDATE notes n SET tag_id = ${def.id}::int, position = ${start}::int - 1 + r.rk::int
      FROM (SELECT id, dense_rank() OVER (ORDER BY position) AS rk FROM notes WHERE tag_id = ${id}::int) r
      WHERE r.id = n.id`);
```

`web/lib/notes/notes.ts`: xoá hàm `moveNotes`; bỏ `moveNote` khỏi import từ `./tags`.

`web/lib/telegram/handler.ts`: `import { listTags, listTagsWithCounts, moveNote } from '@/lib/notes/tags';` → `import { listTags, listTagsWithCounts } from '@/lib/notes/tags';` và thêm `import { moveNote } from '@/lib/notes/posts';`.

`web/app/api/notes/[id]/tags/route.ts`: `import { moveNote, pickTagId } from '@/lib/notes/tags';` → `import { pickTagId } from '@/lib/notes/tags';` + `import { moveNote } from '@/lib/notes/posts';`; đổi dòng trả về thành
```ts
    const { tag, position, sub } = await moveNote(db, id, await pickTagId(db, tagIds));
    return NextResponse.json({ id, tags: [tag], position, sub });
```

`web/app/(admin)/actions.ts`:
- Import: `import { createNote, deleteNotes, moveNotes, updateNoteContent } from '@/lib/notes/notes';` → `import { SORTS, createNote, deleteNotes, updateNoteContent, type Sort } from '@/lib/notes/notes';`; `import { moveNote, renumberTag } from '@/lib/notes/tags';` → `import { dropNote, mergeIntoPrevious, moveNote, moveNotes, renumberTag, splitPost } from '@/lib/notes/posts';`.
- Thay `renumberAction` và `reorderAction` bằng:
```ts
/** Nút "Đánh số lại": toàn tag theo cách sắp xếp đang chọn. */
export async function renumberAction(inTagId: number, sort: Sort): Promise<ActionState> {
  return run(() => renumberTag(getDb(), id.parse(inTagId), z.enum(SORTS).parse(sort)));
}

export async function splitPostAction(noteId: number): Promise<ActionState> {
  return run(() => splitPost(getDb(), id.parse(noteId)));
}

export async function mergePostAction(noteId: number): Promise<ActionState> {
  return run(() => mergeIntoPrevious(getDb(), id.parse(noteId)));
}

/** Kéo thả bài/comment: đặt `movingId` trước/sau `targetId`. */
export async function dropNoteAction(movingId: number, targetId: number, after: boolean): Promise<ActionState> {
  return run(() => dropNote(getDb(), id.parse(movingId), id.parse(targetId), z.boolean().parse(after)));
}
```

`web/components/NoteList.tsx` (tạm, để typecheck qua — Task 5 viết lại): đổi import `reorderAction` thành `dropNoteAction`; trong `finishReorderRef.current` thay `const res = await reorderAction(tagId, next);` bằng `const res = await dropNoteAction(next[0], next[1] ?? next[0], false);`; trong `renumber` thay `renumberAction(tagId, visibleIds)` bằng `renumberAction(tagId, 'position')`.

- [ ] **Step 4: Chạy toàn bộ + commit**

Run: `npm test && npm run typecheck`
Expected: PASS / không lỗi type.

```bash
git add web
git commit -m "feat(web): group-aware move, split/merge posts, renumber by sort, drag drop on server"
```

---

### Task 3: Phân trang, bộ lọc, gom nhóm phía client

**Files:**
- Modify: `web/lib/notes/notes.ts`, `web/lib/notes/filters.ts`, `web/lib/selection.ts`, `web/lib/reorder.ts`
- Create: `web/lib/groups.ts`, `web/lib/pager.ts`
- Test: `web/tests/paging.test.ts` (mới), `web/tests/groups.test.ts` (mới); modify `web/tests/filters.test.ts`, `web/tests/reorder.test.ts`, `web/tests/selection.test.ts`

**Interfaces:**
- Produces:
  - `interface NotePage { notes: Note[]; page: number; pageCount: number; total: number }`
  - `listNotesPage(db, filter: ListNotesFilter, page: number, perPage: number): Promise<NotePage>`
  - `listPostsPage(db, filter: ListNotesFilter & { tagId: number }, page: number, perPage: number): Promise<NotePage>` (`total` = số nhóm)
  - `filters.ts`: `NoteFilters` bỏ `limit`, thêm `page: number` (≥1) và `posts: boolean`; `POSTS_PER_PAGE = 20`, `NOTES_PER_PAGE = 50`; bỏ `PAGE_SIZE`; `isGrouped(f): boolean`; `renumberConfirmText(tagName, total, sortLabel)`; `toListFilter` không còn `limit`.
  - `groups.ts`: `interface NoteGroup { lead: number; position: number; post: Note | null; comments: Note[] }`, `groupNotes(notes): NoteGroup[]`, `expandSelection(next: Set<number>, changed: number[], select: boolean, groups: NoteGroup[]): Set<number>`.
  - `pager.ts`: `pageItems(page, pageCount): (number | '…')[]`.
  - `selection.ts`: `idsBetween(ids, a, b): number[]`.
  - `ReorderSession.target: { id: number; after: boolean } | null`.

- [ ] **Step 1: Test thất bại**

`web/tests/paging.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createNote, listNotesPage, listPostsPage } from '@/lib/notes/notes';
import { getDefaultTag } from '@/lib/notes/tags';
import { pageItems } from '@/lib/pager';
import { createTestDb, type TestDb } from './helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

describe('pageItems', () => {
  it('trang đầu, cuối, hiện tại ±2, dấu …', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(1, 3)).toEqual([1, 2, 3]);
    expect(pageItems(6, 12)).toEqual([1, '…', 4, 5, 6, 7, 8, '…', 12]);
    expect(pageItems(2, 12)).toEqual([1, 2, 3, 4, '…', 12]);
  });
});

describe('listNotesPage (phẳng)', () => {
  it('chia trang theo ghi chú; trang vượt quá → trang cuối', async () => {
    for (let i = 1; i <= 5; i++) await createNote(t.db, { content: `n${i}`, source: 'web', newPost: true });
    const p1 = await listNotesPage(t.db, {}, 1, 2);
    expect(p1).toMatchObject({ page: 1, pageCount: 3, total: 5 });
    expect(p1.notes.map((n) => n.content)).toEqual(['n5', 'n4']);
    const last = await listNotesPage(t.db, {}, 99, 2);
    expect(last.page).toBe(3);
    expect(last.notes.map((n) => n.content)).toEqual(['n1']);
    expect((await listNotesPage(t.db, {}, 1, 50)).pageCount).toBe(1);
  });
});

describe('listPostsPage (nhóm)', () => {
  it('chia trang theo bài, mỗi trang đủ comment của các bài', async () => {
    for (let p = 1; p <= 3; p++) {
      await createNote(t.db, { content: `p${p}`, source: 'web', newPost: true });
      await createNote(t.db, { content: `p${p}c1`, source: 'web' });
    }
    const def = await getDefaultTag(t.db);
    const page1 = await listPostsPage(t.db, { tagId: def.id, sort: 'position' }, 1, 2);
    expect(page1).toMatchObject({ page: 1, pageCount: 2, total: 3 });
    expect(page1.notes.map((n) => n.content)).toEqual(['p1', 'p1c1', 'p2', 'p2c1']);
    const page2 = await listPostsPage(t.db, { tagId: def.id, sort: 'position' }, 5, 2);
    expect(page2.page).toBe(2);
    expect(page2.notes.map((n) => n.content)).toEqual(['p3', 'p3c1']);
  });

  it('tìm kiếm: chỉ nhóm có ghi chú khớp, chỉ hiện ghi chú khớp', async () => {
    await createNote(t.db, { content: 'bài một', source: 'web' });
    await createNote(t.db, { content: 'comment táo', source: 'web' });
    await createNote(t.db, { content: 'bài hai', source: 'web', newPost: true });
    const def = await getDefaultTag(t.db);
    const page = await listPostsPage(t.db, { tagId: def.id, sort: 'position', q: 'tao' }, 1, 20);
    expect(page.total).toBe(1);
    expect(page.notes.map((n) => n.content)).toEqual(['comment táo']);
  });

  it('tag rỗng → 1 trang, không ghi chú', async () => {
    const def = await getDefaultTag(t.db);
    expect(await listPostsPage(t.db, { tagId: def.id }, 1, 20)).toMatchObject({ page: 1, pageCount: 1, total: 0, notes: [] });
  });
});
```

`web/tests/groups.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { expandSelection, groupNotes } from '@/lib/groups';
import type { Note, Tag } from '@/lib/notes/types';
import { idsBetween } from '@/lib/selection';

const TAG: Tag = { id: 1, name: 'Temp', color: '#94a3b8', isDefault: true };
const n = (id: number, position: number, sub: number): Note => ({
  id, content: `n${id}`, source: 'web', sourceUrl: null, sourceTitle: null,
  createdAt: new Date(0), updatedAt: new Date(0), tags: [TAG], position, sub,
});

describe('groupNotes', () => {
  it('gom theo bài, giữ thứ tự; nhóm mất bài có lead là comment đầu', () => {
    const groups = groupNotes([n(1, 1, 0), n(2, 1, 1), n(3, 1, 2), n(5, 2, 1), n(6, 3, 0)]);
    expect(groups.map((g) => [g.lead, g.post?.id ?? null, g.comments.map((c) => c.id)])).toEqual([
      [1, 1, [2, 3]],
      [5, null, [5]],
      [6, 6, []],
    ]);
  });
});

describe('expandSelection', () => {
  const groups = groupNotes([n(1, 1, 0), n(2, 1, 1), n(3, 1, 2), n(4, 2, 0)]);
  it('tick bài → chọn cả comment (kể cả đang thu gọn); bỏ tick → bỏ cả nhóm', () => {
    expect([...expandSelection(new Set([1]), [1], true, groups)].sort()).toEqual([1, 2, 3]);
    expect([...expandSelection(new Set([2, 4]), [1], false, groups)].sort()).toEqual([4]);
  });
  it('tick comment → chỉ comment đó', () => {
    expect([...expandSelection(new Set([2]), [2], true, groups)]).toEqual([2]);
  });
});

describe('idsBetween', () => {
  it('đoạn giữa hai id theo thứ tự, hai chiều; id lạ → rỗng', () => {
    expect(idsBetween([1, 2, 3, 4], 2, 4)).toEqual([2, 3, 4]);
    expect(idsBetween([1, 2, 3, 4], 4, 2)).toEqual([2, 3, 4]);
    expect(idsBetween([1, 2], 9, 2)).toEqual([]);
  });
});
```

`web/tests/reorder.test.ts` — thêm vào cuối describe:
```ts
  it('target: thẻ đích cuối cùng và nửa trên/dưới (để server làm lại đúng phép thả)', () => {
    const s = new ReorderSession([1, 2, 3, 4], 1);
    expect(s.target).toBeNull();
    s.over(3, true);
    s.over(2, false);
    expect(s.target).toEqual({ id: 2, after: false });
    s.over(1, true); // chính nó → không đổi target
    expect(s.target).toEqual({ id: 2, after: false });
  });
```

`web/tests/filters.test.ts`:
- Import thêm `isGrouped`.
- Trong test `'mặc định'`: thay `limit: 50,` bằng `page: 1, posts: false,`.
- Test `'đọc tham số đơn và lặp lại…'`: thay `limit: '100'` bằng `page: '3', posts: '1'` và `limit: 100` bằng `page: 3, posts: true`.
- Thay test `'kẹp limit'` bằng:
```ts
  it('page: số nguyên ≥ 1, sai → 1', () => {
    expect(parseNoteFilters({ page: '0' }).page).toBe(1);
    expect(parseNoteFilters({ page: '-3' }).page).toBe(1);
    expect(parseNoteFilters({ page: 'x' }).page).toBe(1);
    expect(parseNoteFilters({ page: '7' }).page).toBe(7);
  });
```
- Test `'round-trip…'`: thay `limit: 100` bằng `page: 2, posts: true` và chuỗi kỳ vọng `'q=y+h%E1%BB%8Dc&tag=2&tag=3&source=web&limit=100'` bằng `'q=y+h%E1%BB%8Dc&tag=2&tag=3&source=web&posts=1&page=2'`.
- Test `toListFilter`: xoá dòng `limit: 50,` khỏi object kỳ vọng.
- Thay `describe('renumberConfirmText', …)` bằng:
```ts
describe('renumberConfirmText', () => {
  it('nói rõ toàn tag, theo sort nào', () => {
    expect(renumberConfirmText('Temp', 18, 'Cũ nhất')).toBe(
      'Đánh số lại toàn bộ 18 ghi chú trong tag "Temp" theo "Cũ nhất"? Bài đánh #1…, comment trong mỗi bài .1, .2…',
    );
  });
});

describe('isGrouped', () => {
  it('đúng 1 tag + sort theo số', () => {
    expect(isGrouped({ ...EMPTY_FILTERS, tagIds: [2], sort: 'position' })).toBe(true);
    expect(isGrouped({ ...EMPTY_FILTERS, tagIds: [2], sort: 'newest' })).toBe(false);
    expect(isGrouped({ ...EMPTY_FILTERS, tagIds: [2, 3], sort: 'position' })).toBe(false);
  });
});
```

Run: `npm test -- tests/paging.test.ts tests/groups.test.ts tests/filters.test.ts tests/reorder.test.ts`
Expected: FAIL (hàm chưa có, kỳ vọng mới).

- [ ] **Step 2: Cài đặt**

`web/lib/notes/notes.ts`:
- Tách phần tạo điều kiện trong `listNotes` thành hàm (đặt trước `listNotes`):
```ts
function buildConditions(db: DB, filter: ListNotesFilter): SQL[] {
  const conditions: SQL[] = [];
  const q = filter.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(sql`f_unaccent(lower(${notes.content})) LIKE f_unaccent(lower(${pattern}))`);
  }
  if (filter.tagIds?.length) conditions.push(inArray(notes.tagId, filter.tagIds));
  if (filter.sources?.length) conditions.push(inArray(notes.source, filter.sources));
  if (filter.ids) conditions.push(filter.ids.length ? inArray(notes.id, filter.ids) : sql`false`);
  if (filter.createdRange?.start) conditions.push(gte(notes.createdAt, filter.createdRange.start));
  if (filter.createdRange?.end) conditions.push(lt(notes.createdAt, filter.createdRange.end));
  return conditions;
}

function orderFor(sort: Sort | undefined) {
  return sort === 'oldest'
    ? [asc(notes.id)]
    : sort === 'updated'
      ? [desc(notes.updatedAt), desc(notes.id)]
      : sort === 'position'
        ? [asc(notes.tagId), asc(notes.position), asc(notes.sub), asc(notes.id)]
        : [desc(notes.id)];
}
```
  (`db` không dùng trong `buildConditions` — bỏ tham số nếu linter phàn nàn; giữ chữ ký `buildConditions(filter)` cũng được, nhớ sửa nơi gọi.) Trong `listNotes`: thay khối tạo `conditions` và `order` bằng `const conditions = buildConditions(db, filter);` và `.orderBy(...orderFor(filter.sort))`.
- Thêm:
```ts
export interface NotePage {
  notes: Note[];
  page: number;
  pageCount: number;
  total: number;
}

const clampPage = (page: number, pageCount: number) => Math.min(Math.max(Math.trunc(page) || 1, 1), pageCount);

/** Danh sách phẳng, phân trang theo ghi chú. */
export async function listNotesPage(db: DB, filter: ListNotesFilter, page: number, perPage: number): Promise<NotePage> {
  const conditions = buildConditions(db, filter);
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(notes).where(where);
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const current = clampPage(page, pageCount);
  const rows = await db
    .select(noteSelect)
    .from(notes)
    .innerJoin(tags, eq(tags.id, notes.tagId))
    .where(where)
    .orderBy(...orderFor(filter.sort))
    .limit(perPage)
    .offset((current - 1) * perPage);
  return { notes: rows.map(toNote), page: current, pageCount, total };
}

/** Chế độ nhóm (một tag): phân trang theo bài; mỗi trang gồm mọi ghi chú khớp bộ lọc của các bài đó. */
export async function listPostsPage(
  db: DB,
  filter: ListNotesFilter & { tagId: number },
  page: number,
  perPage: number,
): Promise<NotePage> {
  const where = and(...buildConditions(db, filter), eq(notes.tagId, filter.tagId));
  const groups = (
    await db.selectDistinct({ position: notes.position }).from(notes).where(where).orderBy(asc(notes.position))
  ).map((r) => r.position);
  const pageCount = Math.max(1, Math.ceil(groups.length / perPage));
  const current = clampPage(page, pageCount);
  const slice = groups.slice((current - 1) * perPage, current * perPage);
  const rows = slice.length
    ? await db
        .select(noteSelect)
        .from(notes)
        .innerJoin(tags, eq(tags.id, notes.tagId))
        .where(and(where, inArray(notes.position, slice)))
        .orderBy(asc(notes.position), asc(notes.sub), asc(notes.id))
    : [];
  return { notes: rows.map(toNote), page: current, pageCount, total: groups.length };
}
```

`web/lib/notes/filters.ts`:
- `interface NoteFilters`: thay `limit: number;` bằng
```ts
  /** Trang hiện tại (≥ 1). */
  page: number;
  /** Chế độ nhóm: thu gọn hết comment ("Chỉ hiện bài viết"). */
  posts: boolean;
```
- Thay `export const PAGE_SIZE = 50;` bằng `export const POSTS_PER_PAGE = 20;\nexport const NOTES_PER_PAGE = 50;`.
- `EMPTY_FILTERS`: thay `limit: PAGE_SIZE,` bằng `page: 1,\n  posts: false,`.
- Thêm (sau `canReorder`):
```ts
/** Hiện theo nhóm bài/comment: đúng 1 tag + sort theo số. */
export function isGrouped(f: NoteFilters): boolean {
  return f.tagIds.length === 1 && f.sort === 'position';
}
```
- Thay thân `renumberConfirmText` và chữ ký:
```ts
export function renumberConfirmText(tagName: string, total: number, sortLabel: string): string {
  return `Đánh số lại toàn bộ ${total} ghi chú trong tag "${tagName}" theo "${sortLabel}"? Bài đánh #1…, comment trong mỗi bài .1, .2…`;
}
```
- `parseNoteFilters`: thay 2 dòng `rawLimit`/`limit` bằng
```ts
  const rawPage = Number(all(sp.page)[0]);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
```
  và trong object trả về thay `limit,` bằng `page,\n    posts: first(sp.posts) === '1',`.
- `filtersToQuery`: thay dòng `limit` bằng
```ts
  if (f.posts) params.set('posts', '1');
  if (f.page > 1) params.set('page', String(f.page));
```
- `toListFilter`: xoá dòng `limit: f.limit,`.

`web/lib/selection.ts` — thêm:
```ts
/** Các id nằm giữa `a` và `b` (tính cả hai đầu) theo thứ tự `ids`. */
export function idsBetween(ids: number[], a: number, b: number): number[] {
  const i = ids.indexOf(a);
  const j = ids.indexOf(b);
  if (i < 0 || j < 0) return [];
  return ids.slice(Math.min(i, j), Math.max(i, j) + 1);
}
```

`web/lib/reorder.ts`:
- Thêm field `private last: { id: number; after: boolean } | null = null;`
- Trong `over`, ngay trước `this.order = without;` thêm `this.last = { id: targetId, after };`
- Thêm getter:
```ts
  /** Thẻ đích cuối cùng — server làm lại đúng phép thả bằng (movingId, target). */
  get target(): { id: number; after: boolean } | null {
    return this.last;
  }
```

`web/lib/groups.ts`:
```ts
import type { Note } from '@/lib/notes/types';

export interface NoteGroup {
  /** Id đại diện nhóm: bài, hoặc comment đầu nếu nhóm mất bài. */
  lead: number;
  position: number;
  post: Note | null;
  comments: Note[];
}

/** Gom danh sách đã sắp theo (position, sub) thành nhóm bài + comment, giữ thứ tự xuất hiện. */
export function groupNotes(list: Note[]): NoteGroup[] {
  const out: NoteGroup[] = [];
  const byKey = new Map<string, NoteGroup>();
  for (const note of list) {
    const key = `${note.tags[0].id}:${note.position}`;
    let group = byKey.get(key);
    if (!group) {
      group = { lead: note.id, position: note.position, post: null, comments: [] };
      byKey.set(key, group);
      out.push(group);
    }
    if (note.sub === 0 && !group.post) {
      group.post = note;
      group.lead = note.id;
    } else group.comments.push(note);
  }
  return out;
}

/** Tick/kéo chọn trúng thẻ bài → áp cùng trạng thái cho mọi comment của bài (kể cả đang thu gọn). */
export function expandSelection(next: Set<number>, changed: number[], select: boolean, groups: NoteGroup[]): Set<number> {
  const out = new Set(next);
  const byPost = new Map(groups.filter((g) => g.post).map((g) => [g.post!.id, g.comments.map((c) => c.id)]));
  for (const id of changed) {
    for (const c of byPost.get(id) ?? []) {
      if (select) out.add(c);
      else out.delete(c);
    }
  }
  return out;
}
```

`web/lib/pager.ts`:
```ts
/** Trang hiển thị trên thanh phân trang: đầu, cuối, hiện tại ±2; khoảng hở → "…". */
export function pageItems(page: number, pageCount: number): (number | '…')[] {
  const keep = new Set([1, pageCount]);
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= pageCount) keep.add(p);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}
```

`web/app/(admin)/page.tsx` (tạm, để typecheck qua — Task 5 viết lại): thay `PAGE_SIZE` bằng `NOTES_PER_PAGE` trong import; thay `listNotes(db, toListFilter(filters))` bằng `listNotesPage(db, toListFilter(filters), filters.page, NOTES_PER_PAGE)` (import `listNotesPage` thay `listNotes`); xoá biến `more` và khối `{result.hasMore && …}`; `exportQuery={filtersToQuery({ ...filters, page: 1 })}`.

`web/components/NoteList.tsx` (tạm): trong `renumber`, đổi `renumberConfirmText(singleTag.name, visibleIds.length, singleTag.noteCount ?? visibleIds.length)` thành `renumberConfirmText(singleTag.name, singleTag.noteCount ?? visibleIds.length, 'Theo số #')`.

- [ ] **Step 3: Chạy toàn bộ + commit**

Run: `npm test && npm run typecheck`
Expected: PASS / không lỗi type.

```bash
git add web
git commit -m "feat(web): page-based listing (by post in grouped mode), grouping and selection helpers"
```

---

### Task 4: API "bài mới", Telegram 📌, số trong file xuất

**Files:**
- Create: `web/app/api/notes/[id]/new-post/route.ts`
- Modify: `web/lib/telegram/keyboard.ts`, `web/lib/telegram/handler.ts`, `web/lib/export/text.ts`
- Test: modify `web/tests/api.test.ts`, `web/tests/telegram-pure.test.ts`, `web/tests/telegram-handler.test.ts`, `web/tests/export.test.ts`

**Interfaces:**
- Consumes: `splitPost`, `moveNote` (posts.ts), `formatNumber`.
- Produces: `POST /api/notes/:id/new-post` → `{ id, tags: [tag], position, sub }`; `savedLabel(tagName, position, sub = 0)`; `CallbackAction` thêm `{ kind: 'newpost'; noteId }` (`n:<id>`); hàng cuối bàn phím `[📌 Bài mới][🗑 Xoá]`.

- [ ] **Step 1: Test thất bại**

`web/tests/api.test.ts`:
- Thêm import: `import { POST as postNewPost } from '@/app/api/notes/[id]/new-post/route';`
- Thêm:
```ts
describe('POST /api/notes/:id/new-post', () => {
  it('tách comment thành bài mới; thiếu key → 401; không có → 404', async () => {
    await postNote(req('POST', '/api/notes', { content: 'bài', source: 'widget' }));
    const c = await (await postNote(req('POST', '/api/notes', { content: 'c', source: 'widget' }))).json();
    expect(c.sub).toBe(1);
    const res = await postNewPost(req('POST', `/api/notes/${c.id}/new-post`), ctx(String(c.id)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: c.id, position: 2, sub: 0, tags: [{ name: 'Chưa phân loại' }] });
    expect((await postNewPost(req('POST', '/api/notes/1/new-post', undefined, null), ctx('1'))).status).toBe(401);
    expect((await postNewPost(req('POST', '/api/notes/999/new-post'), ctx('999'))).status).toBe(404);
  });
});
```
- Trong test `'200 và đổi tag'` thêm `expect(body.sub).toBe(0);`.

`web/tests/telegram-pure.test.ts`:
- Trong test bàn phím `'3 nút mỗi hàng…'`, đổi hàng cuối kỳ vọng thành
```ts
      [
        { text: '📌 Bài mới', callback_data: 'n:12' },
        { text: '🗑 Xoá', callback_data: 'd:12' },
      ],
```
- Trong `parseCallbackData` test thêm `expect(parseCallbackData('n:5')).toEqual({ kind: 'newpost', noteId: 5 });`
- Trong `savedLabel` test thêm `expect(savedLabel('Temp', 5, 3)).toBe('Temp #5.3');`

`web/tests/telegram-handler.test.ts` — thêm trong `describe('callback'`:
```ts
  it('📌 Bài mới: comment thành bài mới, sửa tin nhắn; đã là bài → báo', async () => {
    await createNote(t.db, { content: 'bài', source: 'telegram' });
    const c = await createNote(t.db, { content: 'c', source: 'telegram' });
    await handleUpdate(t.db, cb(`n:${c.id}`), config);
    expect(calls('editMessageText')[0]).toMatchObject({ message_id: 60, text: '✅ Đã lưu — Chưa phân loại #2' });
    expect(calls('answerCallbackQuery')[0]).toMatchObject({ text: '📌 Bài mới #2' });
    await handleUpdate(t.db, cb(`n:${c.id}`), config);
    expect(calls('answerCallbackQuery')[1]).toMatchObject({ text: 'Đã là bài #2' });
  });
```
và trong `describe('tin nhắn'`:
```ts
  it('gửi tiếp cùng nguồn → comment "#1.1"', async () => {
    await handleUpdate(t.db, msg('bài viết'), config);
    await handleUpdate(t.db, msg('comment'), config);
    expect(calls('sendMessage')[1].text).toBe('✅ Đã lưu — Chưa phân loại #1.1');
  });
```

`web/tests/export.test.ts` — thêm trong `describe('text export')`:
```ts
  it('comment hiện dạng #bài.comment', () => {
    expect(noteHeader({ ...n1, position: 5, sub: 2 }, { number: true, detail: false })).toBe('#5.2');
  });
```

Run: `npm test -- tests/api.test.ts tests/telegram-pure.test.ts tests/telegram-handler.test.ts tests/export.test.ts`
Expected: FAIL.

- [ ] **Step 2: Cài đặt**

`web/app/api/notes/[id]/new-post/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { hasValidApiKey } from '@/lib/auth/api-key';
import { getDb } from '@/lib/db/client';
import { handleApiError, jsonError } from '@/lib/http';
import { splitPost } from '@/lib/notes/posts';
import { noteIdParam } from '@/lib/notes/validation';

/** 📌 Bài mới từ widget: ghi chú (và các comment sau nó) thành bài mới cuối tag. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasValidApiKey(req)) return jsonError(401, 'API key không hợp lệ');
  try {
    const id = noteIdParam.parse((await ctx.params).id);
    const { tag, position, sub } = await splitPost(getDb(), id);
    return NextResponse.json({ id, tags: [tag], position, sub });
  } catch (err) {
    return handleApiError(err);
  }
}
```

`web/lib/telegram/keyboard.ts`:
- Thêm import `import { formatNumber } from '@/lib/notes/number';`
- `CallbackAction`: thêm `| { kind: 'newpost'; noteId: number }`.
- Trong `buildNoteKeyboard`: đổi `rows.push([{ text: '🗑 Xoá', callback_data: \`d:${noteId}\` }]);` thành
```ts
  rows.push([
    { text: '📌 Bài mới', callback_data: `n:${noteId}` },
    { text: '🗑 Xoá', callback_data: `d:${noteId}` },
  ]);
```
- Trong `parseCallbackData`, trước `return null;` thêm:
```ts
  const newPost = /^n:(\d+)$/.exec(data);
  if (newPost) return { kind: 'newpost', noteId: Number(newPost[1]) };
```
- Đổi `savedLabel`:
```ts
export const savedLabel = (tagName: string, position: number, sub = 0) => `${tagName} #${formatNumber(position, sub)}`;
```

`web/lib/telegram/handler.ts`:
- Import thêm `splitPost` từ `@/lib/notes/posts` (cùng dòng `moveNote`).
- `/recent`: `savedLabel(n.tags[0].name, n.position)` → `savedLabel(n.tags[0].name, n.position, n.sub)`.
- Trả lời khi lưu: `savedLabel(note.tags[0].name, note.position)` → `savedLabel(note.tags[0].name, note.position, note.sub)`.
- Trong `handleCallback`, ngay sau khối `if (action.kind === 'delete') { … return; }` thêm:
```ts
  if (action.kind === 'newpost') {
    if (note.sub === 0) {
      await answer(`Đã là bài #${note.position}`);
      return;
    }
    const placed = await splitPost(db, note.id);
    const allTags = await listTags(db);
    try {
      await callTelegram('editMessageText', {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        text: `✅ Đã lưu — ${savedLabel(placed.tag.name, placed.position, placed.sub)}`,
        reply_markup: buildNoteKeyboard(note.id, allTags, [placed.tag.id]),
      });
    } catch (err) {
      if (!(err instanceof Error && err.message.includes('message is not modified'))) throw err;
    }
    await answer(`📌 Bài mới #${placed.position}`);
    return;
  }
```
- Trong nhánh bấm tag hiện tại: `savedLabel(current.name, note.position)` → `savedLabel(current.name, note.position, note.sub)`.
- Sau `moveNote`: `const { tag, position } = await moveNote(…)` → `const { tag, position, sub } = await moveNote(…)`, và hai chỗ `savedLabel(tag.name, position)` → `savedLabel(tag.name, position, sub)`.

`web/lib/export/text.ts`: thêm `import { formatNumber } from '@/lib/notes/number';` và đổi `` opts.number ? `#${note.position}` : '' `` thành `` opts.number ? `#${formatNumber(note.position, note.sub)}` : '' ``.

- [ ] **Step 3: Chạy toàn bộ + commit**

Run: `npm test && npm run typecheck`
Expected: PASS / không lỗi type.

```bash
git add web
git commit -m "feat(web): new-post API, Telegram 📌 button and #post.comment numbers in bot and export"
```

---

### Task 5: Web — chế độ nhóm, thu gọn, chọn cả bài, 📌/↳, kéo bài/comment, phân trang

**Files:**
- Create: `web/components/Pager.tsx`
- Rewrite: `web/components/NoteList.tsx`
- Modify: `web/components/NoteCard.tsx`, `web/components/TagChip.tsx`, `web/components/Filters.tsx`, `web/app/(admin)/page.tsx`
- Test: `web/tests/components.test.ts`

**Interfaces:**
- Consumes: `groupNotes`, `expandSelection`, `idsBetween`, `applyRange`, `ReorderSession(.target)`, `pageItems`, `isGrouped`, `canReorder`, `SORT_LABELS`, `renumberConfirmText`, `formatNumber`, actions `splitPostAction`, `mergePostAction`, `dropNoteAction`, `renumberAction`, `bulkMoveAction`, `deleteNotesAction`, `listNotesPage`, `listPostsPage`.
- Produces:
  - `TagChip({ tag, number?: string })`.
  - `NoteCard` props thêm `collapse?: { collapsed: boolean; count: number; onToggle: () => void }`, `affected?: number`.
  - `NoteList({ notes, tags, exportQuery, singleTag, reorderable, grouped, sort, postsOnly })`.
  - `Pager({ page, pageCount, hrefFor })`.

- [ ] **Step 1: Test render thất bại**

`web/tests/components.test.ts`:
- Mọi chỗ `createElement(NoteList, { … })` thêm `grouped: false, sort: 'newest', postsOnly: false`.
- Thêm import: `import { Pager } from '@/components/Pager';`
- Thêm:
```ts
describe('chế độ nhóm & phân trang', () => {
  const p = { ...note, id: 20, position: 4, sub: 0, content: 'Nội dung bài' };
  const c1 = { ...note, id: 21, position: 4, sub: 1, content: 'Comment một' };
  const c2 = { ...note, id: 22, position: 4, sub: 2, content: 'Comment hai' };
  const render = (postsOnly: boolean) =>
    renderToString(
      createElement(NoteList, {
        notes: [p, c1, c2], tags: [DEF, LS], exportQuery: 'tag=2', singleTag: LS, reorderable: true,
        grouped: true, sort: 'position', postsOnly,
      }),
    ).replaceAll('<!-- -->', '');

  it('bài + comment thụt vào, số #4 / #4.1, nút 📌 trên comment, ↳ trên bài', () => {
    const html = render(false);
    expect(html).toContain('data-group-lead="20"');
    expect(html).toContain('Lịch sử #4');
    expect(html).toContain('Lịch sử #4.2');
    expect(html).toContain('Comment hai');
    expect(html.match(/📌 Bài mới/g)).toHaveLength(2);
    expect(html).toContain('↳ Gộp vào bài trước');
  });

  it('"Chỉ hiện bài viết" → ẩn comment, hiện số comment', () => {
    const html = render(true);
    expect(html).toContain('Nội dung bài');
    expect(html).not.toContain('Comment hai');
    expect(html).toContain('▸ 2 comment');
  });

  it('Pager: link giữ bộ lọc, đánh dấu trang hiện tại; 1 trang → không hiện', () => {
    const html = renderToString(createElement(Pager, { page: 2, pageCount: 3, hrefFor: (n: number) => `/?tag=2&page=${n}` }));
    expect(html).toContain('href="/?tag=2&amp;page=3"');
    expect(html).toContain('aria-current="page"');
    expect(renderToString(createElement(Pager, { page: 1, pageCount: 1, hrefFor: () => '/' }))).toBe('');
  });
});
```
- Test bộ lọc: thêm kiểm tra ô "Chỉ hiện bài viết" khi lọc 1 tag:
```ts
  it('lọc 1 tag → có ô "Chỉ hiện bài viết"', () => {
    const html = renderToString(createElement(Filters, { tags: [DEF, LS], filters: { ...EMPTY_FILTERS, tagIds: [2], sort: 'position' } }));
    expect(html).toContain('name="posts"');
  });
```

Run: `npm test -- tests/components.test.ts`
Expected: FAIL (props/Pager/nút chưa có).

- [ ] **Step 2: TagChip, NoteCard, Filters, Pager**

`web/components/TagChip.tsx` — thay toàn bộ:
```tsx
import type { Tag } from '@/lib/notes/types';

export function TagChip({ tag, number }: { tag: Tag; number?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: tag.color }}
    >
      {tag.name}
      {number !== undefined && <span className="ml-1 opacity-90">#{number}</span>}
    </span>
  );
}
```

`web/components/NoteCard.tsx`:
- Import: `moveNoteAction` → thêm `mergePostAction, splitPostAction` vào import từ `@/app/(admin)/actions`; thêm `import { formatNumber } from '@/lib/notes/number';`.
- Props: thêm vào destructure `collapse,\n  affected,` và vào kiểu:
```ts
  /** Thẻ bài có comment trong chế độ nhóm: nút thu gọn/mở. */
  collapse?: { collapsed: boolean; count: number; onToggle: () => void };
  /** Số ghi chú bị đổi số khi bấm 📌/↳ (để hỏi xác nhận khi > 1); không biết → coi như nhiều. */
  affected?: number;
```
- Thêm sau `const long = …`:
```ts
  const number = formatNumber(note.position, note.sub);
  const label = `${note.tags[0].name} #${number}`;
```
- Đổi `aria-label={\`Chọn ghi chú ${note.tags[0].name} #${note.position}\`}` → `aria-label={\`Chọn ghi chú ${label}\`}`; confirm xoá `\`Xoá ghi chú ${note.tags[0].name} #${note.position}?\`` → `\`Xoá ghi chú ${label}?\``.
- `<TagChip tag={note.tags[0]} position={note.position} />` → `<TagChip tag={note.tags[0]} number={number} />`.
- Ngay sau nút chip (`</button>` của chip), thêm:
```tsx
        {collapse && (
          <button onClick={collapse.onToggle} className="text-xs hover:text-slate-900" title={collapse.collapsed ? 'Mở comment' : 'Thu gọn comment'}>
            {collapse.collapsed ? `▸ ${collapse.count} comment` : '▾'}
          </button>
        )}
```
- Trong `<span className="ml-auto flex gap-3">`, thêm trước nút Copy:
```tsx
          {note.sub > 0 && (
            <button
              onClick={() =>
                ((affected ?? 1) <= 1 || confirm(`Tách ${label} và các comment sau nó thành bài mới?`)) &&
                run(() => splitPostAction(note.id))
              }
              className="hover:text-slate-900"
              title="Ghi chú này là nội dung bài viết mới"
            >
              📌 Bài mới
            </button>
          )}
          {note.sub === 0 && note.position > 1 && (
            <button
              onClick={() => confirm(`Gộp bài ${label} (và comment của nó) vào bài trước?`) && run(() => mergePostAction(note.id))}
              className="hover:text-slate-900"
              title="Biến bài này thành comment của bài trước"
            >
              ↳ Gộp vào bài trước
            </button>
          )}
```

`web/components/Filters.tsx` — trong `<div className="flex flex-wrap items-center gap-2 text-sm">` (dòng có SortSelect/DateFilter), thêm sau `<DateFilter filters={filters} />`:
```tsx
        {filters.tagIds.length === 1 && (
          <label className="flex items-center gap-1" title="Thu gọn hết comment, chỉ hiện các bài">
            <input type="checkbox" name="posts" value="1" defaultChecked={filters.posts} />
            Chỉ hiện bài viết
          </label>
        )}
```

`web/components/Pager.tsx`:
```tsx
import Link from 'next/link';
import { pageItems } from '@/lib/pager';

export function Pager({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (page: number) => string }) {
  if (pageCount <= 1) return null;
  const cell = 'min-w-9 rounded-lg border px-3 py-1 text-center text-sm';
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1" aria-label="Phân trang">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={`${cell} bg-white`} aria-label="Trang trước">
          ‹
        </Link>
      ) : (
        <span className={`${cell} text-slate-300`}>‹</span>
      )}
      {pageItems(page, pageCount).map((item, i) =>
        item === '…' ? (
          <span key={`gap-${i}`} className="px-1 text-slate-400">
            …
          </span>
        ) : item === page ? (
          <span key={item} aria-current="page" className={`${cell} border-slate-900 bg-slate-900 text-white`}>
            {item}
          </span>
        ) : (
          <Link key={item} href={hrefFor(item)} className={`${cell} bg-white hover:bg-slate-50`}>
            {item}
          </Link>
        ),
      )}
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className={`${cell} bg-white`} aria-label="Trang sau">
          ›
        </Link>
      ) : (
        <span className={`${cell} text-slate-300`}>›</span>
      )}
    </nav>
  );
}
```

- [ ] **Step 3: Viết lại NoteList**

`web/components/NoteList.tsx` — thay toàn bộ:
```tsx
'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { bulkMoveAction, deleteNotesAction, dropNoteAction, renumberAction } from '@/app/(admin)/actions';
import { joinForCopy } from '@/lib/export/text';
import { expandSelection, groupNotes, type NoteGroup } from '@/lib/groups';
import { SORT_LABELS, renumberConfirmText } from '@/lib/notes/filters';
import type { Sort } from '@/lib/notes/notes';
import type { Note, Tag } from '@/lib/notes/types';
import { ReorderSession } from '@/lib/reorder';
import { applyRange, idsBetween } from '@/lib/selection';
import { NoteCard } from './NoteCard';
import { TagPicker } from './TagPicker';

type Drag = { anchorId: number; base: Set<number>; select: boolean };
/** Đang kéo sắp xếp: cả bài (session trên lead các nhóm) hoặc một comment (session trên comment của nhóm `lead`). */
type Reorder = { kind: 'post'; session: ReorderSession } | { kind: 'comment'; lead: number; session: ReorderSession };

const EDGE = 48; // px gần mép màn hình thì tự cuộn khi đang kéo
const OPTION_KEYS = { number: 'bn-export-num', detail: 'bn-export-detail' } as const;
type ExportOption = keyof typeof OPTION_KEYS;

export function NoteList({
  notes,
  tags,
  exportQuery,
  singleTag,
  reorderable,
  grouped,
  sort,
  postsOnly,
}: {
  notes: Note[];
  tags: Tag[];
  exportQuery: string;
  /** Đang lọc đúng 1 tag → cho phép Đánh số lại (noteCount = tổng số ghi chú của tag). */
  singleTag: (Tag & { noteCount?: number }) | null;
  /** Cho phép kéo ⠿ (xem trọn một tag theo số). */
  reorderable: boolean;
  /** Hiện theo nhóm bài / comment. */
  grouped: boolean;
  sort: Sort;
  /** "Chỉ hiện bài viết": thu gọn hết comment. */
  postsOnly: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState({ number: true, detail: true });
  const [pending, startTransition] = useTransition();

  const groups = grouped ? groupNotes(notes) : [];
  const groupsRef = useRef<NoteGroup[]>(groups);
  groupsRef.current = groups;

  // ---- thu gọn (nhớ theo tag) ----
  const collapseKey = singleTag ? `bn-collapsed-${singleTag.id}` : null;
  // Tính ngay khi khởi tạo để render phía server cũng đúng với "Chỉ hiện bài viết"
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set(postsOnly ? groups.map((g) => g.lead) : []));
  useEffect(() => {
    if (postsOnly) {
      setCollapsed(new Set(groupsRef.current.map((g) => g.lead)));
      return;
    }
    try {
      const raw = collapseKey ? localStorage.getItem(collapseKey) : null;
      setCollapsed(new Set(raw ? (JSON.parse(raw) as number[]) : []));
    } catch {
      setCollapsed(new Set());
    }
  }, [collapseKey, postsOnly, notes]);
  const toggleCollapse = (lead: number) => {
    const next = new Set(collapsed);
    if (next.has(lead)) next.delete(lead);
    else next.add(lead);
    setCollapsed(next);
    if (!postsOnly && collapseKey) {
      try {
        localStorage.setItem(collapseKey, JSON.stringify([...next]));
      } catch {
        // bỏ qua
      }
    }
  };

  // ---- kéo sắp xếp: thứ tự tạm; null = theo server ----
  const [groupOrder, setGroupOrder] = useState<number[] | null>(null);
  const [commentOrder, setCommentOrder] = useState<{ lead: number; ids: number[] } | null>(null);
  const reorderRef = useRef<Reorder | null>(null);
  useEffect(() => {
    setGroupOrder(null);
    setCommentOrder(null);
  }, [notes]);

  const byLead = new Map(groups.map((g) => [g.lead, g]));
  const byId = new Map(notes.map((n) => [n.id, n]));
  const orderedGroups = (groupOrder ?? groups.map((g) => g.lead)).map((l) => byLead.get(l)!).filter(Boolean);
  const commentsOf = (g: NoteGroup) =>
    commentOrder?.lead === g.lead ? commentOrder.ids.map((id) => byId.get(id)!).filter(Boolean) : g.comments;
  const allNotes: Note[] = grouped ? orderedGroups.flatMap((g) => [...(g.post ? [g.post] : []), ...commentsOf(g)]) : notes;
  const shown: Note[] = grouped
    ? orderedGroups.flatMap((g) => [...(g.post ? [g.post] : []), ...(collapsed.has(g.lead) && g.post ? [] : commentsOf(g))])
    : notes;

  const visibleIds = shown.map((n) => n.id);
  const idsRef = useRef(visibleIds);
  idsRef.current = visibleIds;
  const dragRef = useRef<Drag | null>(null);
  const anchorRef = useRef<number | null>(null);
  const allIds = allNotes.map((n) => n.id);
  const chosen = allIds.filter((id) => selected.has(id));

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

  const finishReorderRef = useRef<(movingId: number, targetId: number, after: boolean) => void>(() => undefined);
  finishReorderRef.current = (movingId, targetId, after) => {
    startTransition(async () => {
      const res = await dropNoteAction(movingId, targetId, after);
      if (res.error) {
        setError(res.error);
        setGroupOrder(null);
        setCommentOrder(null);
      }
    });
  };

  useEffect(() => {
    const autoScroll = (e: PointerEvent) => {
      if (e.clientY < EDGE) window.scrollBy(0, -16);
      else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, 16);
    };
    const onMove = (e: PointerEvent) => {
      const r = reorderRef.current;
      if (r) {
        autoScroll(e);
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (r.kind === 'post') {
          const block = el?.closest<HTMLElement>('[data-group-lead]');
          if (block) {
            const rect = block.getBoundingClientRect();
            setGroupOrder([...r.session.over(Number(block.dataset.groupLead), e.clientY > rect.top + rect.height / 2)]);
          }
        } else {
          const card = el?.closest<HTMLElement>('[data-note-id]');
          const block = card?.closest<HTMLElement>('[data-group-lead]');
          if (card && block && Number(block.dataset.groupLead) === r.lead) {
            const rect = card.getBoundingClientRect();
            const ids = r.session.over(Number(card.dataset.noteId), e.clientY > rect.top + rect.height / 2);
            setCommentOrder({ lead: r.lead, ids: [...ids] });
          }
        }
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      autoScroll(e);
      const card = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-note-id]');
      if (!card) return;
      const current = Number(card.dataset.noteId);
      const next = applyRange(idsRef.current, drag.base, drag.anchorId, current, drag.select);
      setSelected(expandSelection(next, idsBetween(idsRef.current, drag.anchorId, current), drag.select, groupsRef.current));
    };
    const onUp = () => {
      dragRef.current = null;
      const r = reorderRef.current;
      if (r) {
        reorderRef.current = null;
        const target = r.session.target;
        if (r.session.finish() && target) finishReorderRef.current(r.session.movingId, target.id, target.after);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const startGutter = (id: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (e.shiftKey && anchorRef.current !== null) {
      const next = applyRange(visibleIds, selected, anchorRef.current, id, true);
      setSelected(expandSelection(next, idsBetween(visibleIds, anchorRef.current, id), true, groups));
      return;
    }
    const select = !selected.has(id);
    dragRef.current = { anchorId: id, base: selected, select };
    anchorRef.current = id;
    setSelected(expandSelection(applyRange(visibleIds, selected, id, id, select), [id], select, groups));
  };

  const toggle = (id: number) => {
    const select = !selected.has(id);
    const next = new Set(selected);
    if (select) next.add(id);
    else next.delete(id);
    setSelected(expandSelection(next, [id], select, groups));
  };

  const startReorder = (note: Note, e: React.PointerEvent) => {
    // Lần kéo trước còn đang lưu → chờ, tránh danh sách nhảy về thứ tự cũ giữa chừng
    if (e.button !== 0 || pending || !grouped) return;
    e.preventDefault();
    const group = groups.find((g) => g.post?.id === note.id || g.comments.some((c) => c.id === note.id));
    if (!group) return;
    if (note.sub === 0) {
      const leads = groups.map((g) => g.lead);
      reorderRef.current = { kind: 'post', session: new ReorderSession(leads, group.lead) };
      setGroupOrder(leads);
    } else {
      const ids = group.comments.map((c) => c.id);
      reorderRef.current = { kind: 'comment', lead: group.lead, session: new ReorderSession(ids, note.id) };
      setCommentOrder({ lead: group.lead, ids });
    }
  };

  const renumber = () => {
    if (!singleTag) return;
    if (!confirm(renumberConfirmText(singleTag.name, singleTag.noteCount ?? notes.length, SORT_LABELS[sort]))) return;
    const tagId = singleTag.id;
    startTransition(async () => {
      const res = await renumberAction(tagId, sort);
      setError(res.error);
    });
  };

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.error);
      if (!res.error) {
        setSelected(new Set());
        setPicking(false);
      }
    });

  const copyChosen = async () => {
    await navigator.clipboard.writeText(joinForCopy(allNotes.filter((n) => selected.has(n.id))));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const exportHref = (format: 'txt' | 'docx') => {
    const params = [
      `format=${format}`,
      exportQuery,
      ...chosen.map((id) => `id=${id}`),
      options.number ? '' : 'num=0',
      options.detail ? '' : 'detail=0',
    ].filter(Boolean);
    return `/api/export?${params.join('&')}`;
  };
  const exportScope = chosen.length ? `${chosen.length} đã chọn` : 'tất cả kết quả';

  if (!notes.length) return <p className="py-10 text-center text-slate-500">Không có ghi chú nào.</p>;

  const card = (note: Note, extra: { collapse?: Parameters<typeof NoteCard>[0]['collapse']; affected?: number }) => (
    <NoteCard
      key={`${note.id}-${note.updatedAt.getTime()}`}
      note={note}
      tags={tags}
      selected={selected.has(note.id)}
      onToggle={() => toggle(note.id)}
      onGutterPointerDown={(e) => startGutter(note.id, e)}
      reorderable={reorderable}
      onHandlePointerDown={(e) => startReorder(note, e)}
      {...extra}
    />
  );

  return (
    <div className={`space-y-3 ${pending ? 'opacity-70' : ''}`}>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl bg-slate-100/90 px-4 py-2 text-sm backdrop-blur">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={chosen.length === allIds.length}
            onChange={(e) => setSelected(e.target.checked ? new Set(allIds) : new Set())}
          />
          Chọn tất cả
        </label>
        {/* Luôn giữ chỗ cho nhóm nút (chỉ ẩn đi) để thanh không đổi chiều cao — nếu không, danh sách nhảy xuống dưới con trỏ khi bắt đầu kéo chọn. */}
        <span className={`flex flex-wrap items-center gap-3 ${chosen.length ? '' : 'invisible'}`} aria-hidden={!chosen.length}>
          <span className="text-slate-600">Đã chọn {chosen.length}</span>
          <button onClick={copyChosen} className="rounded-lg border bg-white px-3 py-1" disabled={!chosen.length}>
            {copied ? 'Đã copy' : `Copy (${chosen.length})`}
          </button>
          <button onClick={() => setPicking(!picking)} className="rounded-lg border bg-white px-3 py-1" disabled={pending || !chosen.length}>
            Chuyển tag
          </button>
          <button
            onClick={() => confirm(`Xoá ${chosen.length} ghi chú?`) && run(() => deleteNotesAction(chosen))}
            className="rounded-lg border border-red-300 bg-white px-3 py-1 text-red-600"
            disabled={pending || !chosen.length}
          >
            Xoá
          </button>
        </span>
        {singleTag && (
          <button onClick={renumber} className="rounded-lg border bg-white px-3 py-1" disabled={pending} title="Gán lại #1…n cho toàn tag theo cách sắp xếp đang chọn">
            Đánh số lại
          </button>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2" title={`Xuất ${exportScope}`}>
          <label className="flex items-center gap-1" title="Kèm số thứ tự trong tag">
            <input type="checkbox" checked={options.number} onChange={(e) => changeOption('number', e.target.checked)} />
            Kèm số #
          </label>
          <label className="flex items-center gap-1" title="Kèm tên tag, ngày giờ và link nguồn">
            <input type="checkbox" checked={options.detail} onChange={(e) => changeOption('detail', e.target.checked)} />
            Kèm tag, ngày giờ, link
          </label>
          <a href={exportHref('txt')} download className="rounded-lg border bg-white px-3 py-1">
            Xuất TXT
          </a>
          <a href={exportHref('docx')} download className="rounded-lg border bg-white px-3 py-1">
            Xuất Word
          </a>
        </span>
        <span className="w-full text-xs text-slate-500 sm:w-auto">
          Xuất: {exportScope} · Kéo cột ô chọn để chọn nhanh{grouped ? ' · Tick bài = chọn cả comment' : ''}
        </span>
        {error && <span className="text-red-600">{error}</span>}
      </div>
      {picking && chosen.length > 0 && (
        <TagPicker
          tags={tags}
          current={null}
          title={`Chuyển ${chosen.length} ghi chú sang tag:`}
          onPick={(tagId) => run(() => bulkMoveAction(chosen, tagId))}
          onCancel={() => setPicking(false)}
        />
      )}
      {grouped
        ? orderedGroups.map((g) => {
            const comments = commentsOf(g);
            const isCollapsed = collapsed.has(g.lead) && !!g.post;
            return (
              <div key={g.lead} data-group-lead={g.lead} className="space-y-2">
                {g.post &&
                  card(g.post, {
                    collapse: comments.length
                      ? { collapsed: isCollapsed, count: comments.length, onToggle: () => toggleCollapse(g.lead) }
                      : undefined,
                    affected: 1 + comments.length,
                  })}
                {!isCollapsed &&
                  comments.map((c, i) => (
                    <div key={c.id} className="ml-6 border-l-2 border-slate-200 pl-2 sm:ml-10">
                      {card(c, { affected: comments.length - i })}
                    </div>
                  ))}
              </div>
            );
          })
        : notes.map((n) => card(n, {}))}
    </div>
  );
}
```

`web/app/(admin)/page.tsx` — thay toàn bộ:
```tsx
import { Filters } from '@/components/Filters';
import { NoteList } from '@/components/NoteList';
import { Pager } from '@/components/Pager';
import { QuickAdd } from '@/components/QuickAdd';
import { requireSession } from '@/lib/auth/require';
import { getDb } from '@/lib/db/client';
import {
  NOTES_PER_PAGE,
  POSTS_PER_PAGE,
  canReorder,
  filtersToQuery,
  isGrouped,
  parseNoteFilters,
  toListFilter,
} from '@/lib/notes/filters';
import { listNotesPage, listPostsPage } from '@/lib/notes/notes';
import { listTagsWithCounts } from '@/lib/notes/tags';

export const dynamic = 'force-dynamic';

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const filters = parseNoteFilters(await searchParams);
  const db = getDb();
  const tags = await listTagsWithCounts(db);
  const singleTag = filters.tagIds.length === 1 ? (tags.find((t) => t.id === filters.tagIds[0]) ?? null) : null;
  const grouped = isGrouped(filters) && !!singleTag;
  const result = grouped
    ? await listPostsPage(db, { ...toListFilter(filters), tagId: singleTag!.id }, filters.page, POSTS_PER_PAGE)
    : await listNotesPage(db, toListFilter(filters), filters.page, NOTES_PER_PAGE);

  return (
    <div className="space-y-4">
      <QuickAdd tags={tags} />
      <Filters tags={tags} filters={filters} />
      <NoteList
        notes={result.notes}
        tags={tags}
        exportQuery={filtersToQuery({ ...filters, page: 1 })}
        singleTag={singleTag}
        reorderable={canReorder(filters)}
        grouped={grouped}
        sort={filters.sort}
        postsOnly={filters.posts}
      />
      <Pager
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={(page) => `/?${filtersToQuery({ ...filters, page })}`}
      />
    </div>
  );
}
```

- [ ] **Step 4: Chạy test + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS / không lỗi / build thành công. (Nếu Next báo không truyền được hàm `hrefFor` qua ranh giới — `Pager` là server component nên không bị; nếu build than phiền, đổi `hrefFor` thành prop `baseQuery: string` và ghép `page` bên trong Pager.)

- [ ] **Step 5: Kiểm tra trên trình duyệt (dev server + Edge headless, DB đã migrate 0003)**

Với tag có ≥ 3 bài (mỗi bài vài comment):
1. `/?tag=<id>` hiện nhóm: bài, comment thụt vào, `Tag #n` / `Tag #n.k`.
2. Bấm ▾ → thu gọn thành `▸ k comment`; tải lại vẫn thu gọn. Tick "Chỉ hiện bài viết" → mọi bài thu gọn.
3. Tick ô chọn của một bài → "Đã chọn" = 1 + số comment; Chuyển tag → cả nhóm sang tag khác thành bài cuối.
4. Kéo ⠿ của bài 1 xuống nửa dưới bài 3 → thả nhanh → tải lại: thứ tự nhóm đúng, số bài 1…n.
5. Kéo ⠿ của comment cuối lên đầu nhóm → số comment đổi đúng.
6. 📌 trên comment giữa nhóm → tách; ↳ trên bài → gộp.
7. Phân trang: > 20 bài → thanh trang; bấm trang 2; `?page=999` → trang cuối.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): grouped post/comment view with collapse, select whole post, split/merge, drag posts and comments, pagination"
```

---

### Task 6: Widget — số `#bài.comment` và nút 📌 Bài mới

**Files:**
- Modify: `widget/src/BangNote.Widget.Core/Models.cs`, `IApiClient.cs`, `ApiClient.cs`, `NoteLabel.cs`, `widget/src/BangNote.Widget/MainWindow.xaml.cs`
- Test: `widget/tests/BangNote.Widget.Core.Tests/NoteLabelTests.cs`, `ApiClientTests.cs`, `SaveServiceTests.cs`

**Interfaces:**
- Produces: `NoteDto(int Id, string Content, IReadOnlyList<TagDto> Tags, int Position = 0, int Sub = 0)`; `TagPlacement(IReadOnlyList<TagDto> Tags, int Position, int Sub = 0)`; `IApiClient.NewPostAsync(int noteId, CancellationToken ct = default): Task<TagPlacement>`; `NoteLabel.Number(int position, int sub): string`.

- [ ] **Step 1: Test thất bại**

`NoteLabelTests.cs` — thêm:
```csharp
    [Fact]
    public void Saved_Comment_ShowsPostDotComment() =>
        Assert.Equal("Đã lưu — Temp #5.3", NoteLabel.Saved(new NoteDto(9, "x", [Temp], 5, 3)));

    [Fact]
    public void Number_Formats() => Assert.Equal(("5", "5.2"), (NoteLabel.Number(5, 0), NoteLabel.Number(5, 2)));
```

`ApiClientTests.cs` — thêm:
```csharp
    [Fact]
    public async Task NewPost_PostsToEndpoint_AndParsesPlacement()
    {
        var (client, handler) = Create((_, _) => Task.FromResult(Json(HttpStatusCode.OK,
            """{"id":7,"tags":[{"id":1,"name":"Temp","color":"#94a3b8","isDefault":true}],"position":6,"sub":0}""")));

        var placement = await client.NewPostAsync(7);

        Assert.Equal(6, placement.Position);
        Assert.Equal(0, placement.Sub);
        var (request, _) = handler.Requests.Single();
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("https://x.test/api/notes/7/new-post", request.RequestUri!.ToString());
    }
```

Run: `dotnet test`
Expected: FAIL biên dịch (`NewPostAsync`, `NoteLabel.Number`, tham số `Sub`).

- [ ] **Step 2: Cài đặt**

`Models.cs`: thay hai record bằng
```csharp
/// <summary>Position = số bài trong tag, Sub = số comment (0 = bài); 0 khi server cũ chưa trả trường này.</summary>
public sealed record NoteDto(int Id, string Content, IReadOnlyList<TagDto> Tags, int Position = 0, int Sub = 0);

public sealed record TagPlacement(IReadOnlyList<TagDto> Tags, int Position, int Sub = 0);
```

`IApiClient.cs`: thêm
```csharp
    Task<TagPlacement> NewPostAsync(int noteId, CancellationToken ct = default);
```

`ApiClient.cs`: thêm
```csharp
    public Task<TagPlacement> NewPostAsync(int noteId, CancellationToken ct = default) =>
        SendAsync<TagPlacement>(HttpMethod.Post, $"/api/notes/{noteId}/new-post", null, ct);
```

`NoteLabel.cs`: thay `Saved` bằng
```csharp
    public static string Number(int position, int sub) => sub > 0 ? $"{position}.{sub}" : $"{position}";

    /// <summary>"Đã lưu — Temp #5.3"; server cũ (không có position) → "Đã lưu".</summary>
    public static string Saved(NoteDto note) =>
        note.Position > 0 && note.Tags.Count > 0 ? $"Đã lưu — {note.Tags[0].Name} #{Number(note.Position, note.Sub)}" : "Đã lưu";
```

`SaveServiceTests.cs` — trong `FakeApi` thêm:
```csharp
        public Task<TagPlacement> NewPostAsync(int noteId, CancellationToken ct = default) => throw new NotSupportedException();
```

`MainWindow.xaml.cs`:
- Trong `ToggleTagAsync`: `_lastNote = note with { Tags = placement.Tags, Position = placement.Position };` → `_lastNote = note with { Tags = placement.Tags, Position = placement.Position, Sub = placement.Sub };`
- Trong `RenderTags`, ngay sau `TagPanel.Children.Clear();` thêm:
```csharp
        if (note.Sub > 0)
        {
            var newPost = new Button
            {
                Content = "📌 Bài mới",
                Margin = new Thickness(2),
                Padding = new Thickness(6, 2, 6, 2),
                FontSize = 11,
                Foreground = Brushes.White,
                Background = ParseBrush("#E6334155"),
                BorderThickness = new Thickness(0),
                Cursor = Cursors.Hand,
                ToolTip = "Ghi chú này là nội dung bài viết mới",
            };
            newPost.Click += async (_, _) => await NewPostAsync();
            TagPanel.Children.Add(newPost);
        }
```
- Thêm phương thức (cạnh `ToggleTagAsync`):
```csharp
    private async Task NewPostAsync()
    {
        if (_lastNote is not { } note || _app.SaveService.Api is not { } api || _app.Tags is not { } cache) return;
        RestartRevert(TimeSpan.FromSeconds(5));
        try
        {
            var placement = await api.NewPostAsync(note.Id);
            _lastNote = note with { Tags = placement.Tags, Position = placement.Position, Sub = placement.Sub };
            StatusText.Text = NoteLabel.Saved(_lastNote);
            RenderTags(_lastNote, cache.Current);
            RestartRevert(TimeSpan.FromSeconds(5));
        }
        catch (Exception ex) when (ex is ApiUnavailableException or ApiRejectedException)
        {
            ShowMessage(ex.Message, ErrorBrush, TimeSpan.FromSeconds(3));
        }
    }
```
- Đảm bảo `TagPanel.Visibility` hiện khi có nút 📌 dù không có tag: đổi dòng cuối `RenderTags` thành `TagPanel.Visibility = TagPanel.Children.Count > 0 ? Visibility.Visible : Visibility.Collapsed;`.

- [ ] **Step 3: Chạy test + build + commit**

Run: `dotnet test && dotnet build`
Expected: `Passed!`, `Build succeeded`.

```bash
git add widget
git commit -m "feat(widget): '#post.comment' label and 📌 new-post button"
```

---

### Task 7: Tài liệu

**Files:** Modify `README.md`, `docs/manual-test.md`

- [ ] **Step 1: README**

Trong mục "Triển khai web", thay khối "**Cập nhật từ bản cũ (nhiều tag → 1 tag có số):**" bằng:
```markdown
   > **Cập nhật từ bản cũ:** chạy lại `npm run db:migrate` rồi push code để Vercel deploy ngay (giữa hai bước web/bot cũ sẽ lỗi), sau đó build lại widget.
   > - `0002`: nhiều tag → 1 tag có số (xoá bảng `note_tags`; nên tạo branch sao lưu Neon trước).
   > - `0003`: thêm số comment (`#bài.comment`); không xoá dữ liệu.
```
Thêm mục mới trước "## Phát triển":
```markdown
## Bài & comment

Mỗi tag gồm các **bài** `#1, #2…`, mỗi bài có **comment** `#1.1, #1.2…`.

- Ghi chú mới mặc định là comment của bài cuối trong tag. Tự thành **bài mới** khi: tag rỗng · đổi nguồn gửi (web ↔ bot ↔ widget ↔ extension) · extension sang link bài khác · tick **Là bài mới** (web) · bấm **📌 Bài mới** (web, bot, widget).
- **↳ Gộp vào bài trước** khi tách nhầm. **Đánh số lại** chạy trên toàn tag theo cách sắp xếp đang chọn.
- Lọc 1 tag + "Theo số #": xem theo nhóm, ▸/▾ thu gọn, "Chỉ hiện bài viết", tick bài = chọn cả comment, kéo ⠿ bài hoặc comment. 20 bài/trang (chế độ khác 50 ghi chú/trang).
```

- [ ] **Step 2: `docs/manual-test.md`**

Thêm cuối mục `## Web admin`:
```markdown
- [ ] Web: thêm 2 ghi chú liền → `#n`, `#n.1`; tick "Là bài mới" → bài mới.
- [ ] Bot sau web → bài mới; bot tiếp → comment; 📌 trên tin trả lời bot → tin đổi thành `Tag #m`.
- [ ] Extension trên cùng bài FB (comment khác nhau) → comment; sang bài FB khác → bài mới.
- [ ] Chế độ nhóm: thu gọn/mở, "Chỉ hiện bài viết", tick bài chọn cả comment, chuyển tag cả bài.
- [ ] Kéo bài / kéo comment; 📌 giữa nhóm tách đúng; ↳ gộp đúng; Đánh số lại theo "Cũ nhất".
- [ ] Phân trang: thanh trang, trang 2, `?page=999` → trang cuối.
```
Trong mục `## Widget Windows` thêm:
```markdown
- [ ] Sau khi lưu comment hiện "Đã lưu — Tag #n.k" + nút 📌 Bài mới; bấm → "Đã lưu — Tag #m".
```

- [ ] **Step 3: Kiểm tra cuối + commit**

Run: `cd web && npm test && npm run typecheck && npm run build` và `cd widget && dotnet test`
Expected: tất cả PASS, build sạch.

```bash
git add README.md docs
git commit -m "docs: posts & comments numbering, pagination"
```
