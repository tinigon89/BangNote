import { NextResponse } from 'next/server';
import { hasValidApiKey } from '@/lib/auth/api-key';
import { getDb } from '@/lib/db/client';
import { handleApiError, jsonError } from '@/lib/http';
import { splitPost } from '@/lib/notes/posts';
import { noteIdParam } from '@/lib/notes/validation';

/** 📌 Bài mới từ widget: ghi chú (và các comment sau nó) thành bài mới cuối tag. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasValidApiKey(req)) return jsonError(401, 'API key không hợp lệ');
  try {
    const id = noteIdParam.parse((await ctx.params).id);
    const { tag, position, sub } = await splitPost(getDb(), id);
    return NextResponse.json({ id, tags: [tag], position, sub });
  } catch (err) {
    return handleApiError(err);
  }
}
