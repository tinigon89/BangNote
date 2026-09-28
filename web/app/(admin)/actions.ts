'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/require';
import { getDb } from '@/lib/db/client';
import { DomainError } from '@/lib/notes/errors';
import { SORTS, createNote, deleteNotes, updateNoteContent, type Sort } from '@/lib/notes/notes';
import { noteIdsInput } from '@/lib/notes/validation';
import { dropNote, mergeIntoPrevious, moveNote, moveNotes, renumberTag, splitPost } from '@/lib/notes/posts';

export type ActionState = { ok?: boolean; error?: string };

const id = z.number().int().positive();
const ids = noteIdsInput;
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

export async function deleteNotesAction(noteIds: number[]): Promise<ActionState> {
  return run(() => deleteNotes(getDb(), ids.parse(noteIds)));
}
