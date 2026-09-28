import { NextResponse } from 'next/server';
import { hasValidApiKey } from '@/lib/auth/api-key';
import { getDb } from '@/lib/db/client';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { moveNote, pickTagId } from '@/lib/notes/tags';
import { noteIdParam, setTagsBody } from '@/lib/notes/validation';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasValidApiKey(req)) return jsonError(401, 'API key không hợp lệ');
  try {
    const id = noteIdParam.parse((await ctx.params).id);
    const { tagIds } = setTagsBody.parse(await readJson(req));
    const db = getDb();
    const { tag, position } = await moveNote(db, id, await pickTagId(db, tagIds));
    return NextResponse.json({ id, tags: [tag], position });
  } catch (err) {
    return handleApiError(err);
  }
}
