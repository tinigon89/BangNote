'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/app/(admin)/actions';
import { requireSession } from '@/lib/auth/require';
import { getDb } from '@/lib/db/client';
import { DomainError } from '@/lib/notes/errors';
import { createTag, deleteTag, updateTag } from '@/lib/notes/tags';

const id = z.number().int().positive();

async function run(fn: () => Promise<unknown>): Promise<ActionState> {
  await requireSession();
  try {
    await fn();
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    if (err instanceof z.ZodError) return { error: 'Dữ liệu không hợp lệ' };
    throw err;
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function createTagAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const color = formData.get('color');
  return run(() =>
    createTag(getDb(), {
      name: String(formData.get('name') ?? ''),
      color: typeof color === 'string' && color ? color : undefined,
    }),
  );
}

export async function updateTagAction(tagId: number, input: { name?: string; color?: string }): Promise<ActionState> {
  const patch = z.object({ name: z.string().optional(), color: z.string().optional() }).parse(input);
  return run(() => updateTag(getDb(), id.parse(tagId), patch));
}

export async function deleteTagAction(tagId: number): Promise<ActionState> {
  return run(() => deleteTag(getDb(), id.parse(tagId)));
}
