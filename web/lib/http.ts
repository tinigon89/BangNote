import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { DomainError } from '@/lib/notes/errors';

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

const STATUS = { invalid: 400, not_found: 404, conflict: 409 } as const;

export function handleApiError(err: unknown) {
  if (err instanceof DomainError) return jsonError(STATUS[err.code], err.message);
  if (err instanceof ZodError) {
    return jsonError(400, err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  }
  console.error(err);
  return jsonError(500, 'Lỗi máy chủ');
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new DomainError('invalid', 'Body không phải JSON hợp lệ');
  }
}
