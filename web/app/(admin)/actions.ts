'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/require';
import { getDb } from '@/lib/db/client';
import { DomainError } from '@/lib/notes/errors';
import { createNote, deleteNotes, moveNotes, updateNoteContent } from '@/lib/notes/notes';
import { moveNote, renumberTag } from '@/lib/notes/tags';

export type ActionState = { ok?: boolean; error?: string };

const id = z.number().int().positive();
const ids = z.array(id).max(500);
const tagId = id.nullable();

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
      newPost: formData.get('newPost') === '1',
      tagIds: ids.parse(formData.getAll('tag').map(Number)),
    }),
  );
}

export async function updateNoteAction(noteId: number, content: string): Promise<ActionState> {
  return run(() => updateNoteContent(getDb(), id.parse(noteId), z.string().parse(content)));
}

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

export async function deleteNotesAction(noteIds: number[]): Promise<ActionState> {
  return run(() => deleteNotes(getDb(), ids.parse(noteIds)));
}
