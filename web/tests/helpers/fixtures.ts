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
