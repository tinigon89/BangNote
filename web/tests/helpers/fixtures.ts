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
