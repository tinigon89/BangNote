'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import type { ActionState } from '@/app/(admin)/actions';
import { requireSession } from '@/lib/auth/require';
import { callTelegram } from '@/lib/telegram/api';

export async function registerWebhookAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  await requireSession();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return { error: 'Chưa đặt TELEGRAM_WEBHOOK_SECRET' };
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  try {
    await callTelegram('setWebhook', {
      url: `${proto}://${host}/api/telegram/webhook`,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath('/settings');
  return { ok: true };
}
