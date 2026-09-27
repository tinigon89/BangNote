import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/auth/safe-equal';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/http';
import { handleUpdate } from '@/lib/telegram/handler';
import type { TgUpdate } from '@/lib/telegram/types';

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!secret || !safeEqual(got, secret)) return jsonError(401, 'Sai secret');

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return jsonError(400, 'Body không hợp lệ');
  }

  try {
    await handleUpdate(getDb(), update, { ownerId: process.env.TELEGRAM_OWNER_ID ?? '' });
  } catch (err) {
    console.error('telegram update failed', err);
  }
  return NextResponse.json({ ok: true });
}
