import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { notes, tags, type Source } from '@/lib/db/schema';
import type { DB } from '@/lib/db/types';
import type { DateRange } from './dates';
import { DomainError } from './errors';
import { lastAnchor, shouldStartPost, slotAfter } from './posts';
import { lockTag, pickTagId, resolveTag, tagColumns } from './tags';
import type { Note } from './types';

export const MAX_CONTENT = 20000;
/** Trang web chỉ xin tối đa 500; xuất file xin tới mức này. */
export const MAX_LIST_LIMIT = 5000;

export const SORTS = ['newest', 'oldest', 'updated', 'position'] as const;
export type Sort = (typeof SORTS)[number];

export interface CreateNoteInput {
  content: string;
  source: Source;
  tagIds?: number[];
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  newPost?: boolean;
}

export interface ListNotesFilter {
  q?: string;
  tagIds?: number[];
  sources?: Source[];
  ids?: number[];
  createdRange?: DateRange | null;
  sort?: Sort;
  limit?: number;
}

const noteColumns = {
  id: notes.id,
  content: notes.content,
  source: notes.source,
  sourceUrl: notes.sourceUrl,
  sourceTitle: notes.sourceTitle,
  position: notes.position,
  sub: notes.sub,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};
const noteSelect = { ...noteColumns, tag: tagColumns };

type NoteRow = Omit<Note, 'tags'> & { tag: Note['tags'][number] };
const toNote = ({ tag, ...row }: NoteRow): Note => ({ ...row, tags: [tag] });

function cleanContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) throw new DomainError('invalid', 'Nội dung không được trống');
  if (trimmed.length > MAX_CONTENT) throw new DomainError('invalid', `Nội dung tối đa ${MAX_CONTENT} ký tự`);
  return trimmed;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function createNote(db: DB, input: CreateNoteInput): Promise<Note> {
  const content = cleanContent(input.content);
  return db.transaction(async (tx) => {
    const tag = await resolveTag(tx, await pickTagId(tx, input.tagIds ?? []));
    await lockTag(tx, tag.id);
    const anchor = await lastAnchor(tx, tag.id);
    const slot = slotAfter(anchor, shouldStartPost(anchor, input));
    const [row] = await tx
      .insert(notes)
      .values({
        content,
        source: input.source,
        sourceUrl: input.sourceUrl ?? null,
        sourceTitle: input.sourceTitle ?? null,
        tagId: tag.id,
        position: slot.position,
        sub: slot.sub,
      })
      .returning(noteColumns);
    return { ...row, tags: [tag] };
  });
}

export async function getNote(db: DB, id: number): Promise<Note | null> {
  const [row] = await db.select(noteSelect).from(notes).innerJoin(tags, eq(tags.id, notes.tagId)).where(eq(notes.id, id));
  return row ? toNote(row) : null;
}

export async function listNotes(db: DB, filter: ListNotesFilter = {}): Promise<{ notes: Note[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), MAX_LIST_LIMIT);
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

  const order =
    filter.sort === 'oldest'
      ? [asc(notes.id)]
      : filter.sort === 'updated'
        ? [desc(notes.updatedAt), desc(notes.id)]
        : filter.sort === 'position'
          ? [asc(notes.tagId), asc(notes.position), asc(notes.sub), asc(notes.id)]
          : [desc(notes.id)];

  const rows = await db
    .select(noteSelect)
    .from(notes)
    .innerJoin(tags, eq(tags.id, notes.tagId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...order)
    .limit(limit + 1);

  return { notes: rows.slice(0, limit).map(toNote), hasMore: rows.length > limit };
}

export async function updateNoteContent(db: DB, id: number, content: string): Promise<Note> {
  const clean = cleanContent(content);
  const rows = await db.update(notes).set({ content: clean, updatedAt: new Date() }).where(eq(notes.id, id)).returning({ id: notes.id });
  if (!rows.length) throw new DomainError('not_found', 'Không tìm thấy ghi chú');
  return (await getNote(db, id))!;
}

export async function deleteNotes(db: DB, ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await db.delete(notes).where(inArray(notes.id, ids)).returning({ id: notes.id });
  return rows.length;
}

