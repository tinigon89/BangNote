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
  sub: number;
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

/**
 * Khoá dòng tag tới hết transaction để hai lần lưu cùng lúc vào một tag không lấy trùng số.
 * Gọi trong transaction, trước `nextPosition`.
 */
export async function lockTag(db: DB, tagId: number): Promise<void> {
  await db.execute(sql`SELECT id FROM tags WHERE id = ${tagId}::int FOR UPDATE`);
}

export async function nextPosition(db: DB, tagId: number): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${notes.position})` })
    .from(notes)
    .where(eq(notes.tagId, tagId));
  return (row?.max ?? 0) + 1;
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
    await lockTag(tx, def.id);
    const start = await nextPosition(tx, def.id);
    await tx.execute(sql`
      UPDATE notes n SET tag_id = ${def.id}::int, position = ${start}::int - 1 + r.rk::int
      FROM (SELECT id, dense_rank() OVER (ORDER BY position) AS rk FROM notes WHERE tag_id = ${id}::int) r
      WHERE r.id = n.id`);
    await tx.delete(tags).where(eq(tags.id, id));
  });
}
