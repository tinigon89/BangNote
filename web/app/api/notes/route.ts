import { NextResponse } from 'next/server';
import { hasValidApiKey } from '@/lib/auth/api-key';
import { getDb } from '@/lib/db/client';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { createNote } from '@/lib/notes/notes';
import { createNoteBody } from '@/lib/notes/validation';

export async function POST(req: Request) {
  if (!hasValidApiKey(req)) return jsonError(401, 'API key không hợp lệ');
  try {
    const body = createNoteBody.parse(await readJson(req));
    return NextResponse.json(await createNote(getDb(), body), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
