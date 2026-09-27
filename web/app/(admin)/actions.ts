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
