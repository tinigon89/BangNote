import { NextResponse } from 'next/server';
import { hasValidApiKey } from '@/lib/auth/api-key';
import { getDb } from '@/lib/db/client';
import { handleApiError, jsonError } from '@/lib/http';
import { listTags } from '@/lib/notes/tags';

export async function GET(req: Request) {
  if (!hasValidApiKey(req)) return jsonError(401, 'API key không hợp lệ');
  try {
    return NextResponse.json(await listTags(getDb()));
  } catch (err) {
    return handleApiError(err);
  }
}
