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
