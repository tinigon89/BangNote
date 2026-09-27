import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ handleUpdate: vi.fn(async () => undefined) }));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/telegram/handler', () => ({ handleUpdate: h.handleUpdate }));

import { POST } from '@/app/api/telegram/webhook/route';

beforeEach(() => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'hook-secret';
  process.env.TELEGRAM_OWNER_ID = '111';
  h.handleUpdate.mockReset();
  h.handleUpdate.mockResolvedValue(undefined);
});

function req(secret: string | null, body: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== null) headers['x-telegram-bot-api-secret-token'] = secret;
  return new Request('http://localhost/api/telegram/webhook', { method: 'POST', headers, body });
}

describe('POST /api/telegram/webhook', () => {
  it('sai hoặc thiếu secret → 401, không xử lý', async () => {
    expect((await POST(req('sai', '{}'))).status).toBe(401);
    expect((await POST(req(null, '{}'))).status).toBe(401);
    process.env.TELEGRAM_WEBHOOK_SECRET = '';
    expect((await POST(req('', '{}'))).status).toBe(401);
    expect(h.handleUpdate).not.toHaveBeenCalled();
  });

  it('đúng secret → gọi handler với ownerId, trả 200', async () => {
    const res = await POST(req('hook-secret', '{"update_id":1}'));
    expect(res.status).toBe(200);
    expect(h.handleUpdate).toHaveBeenCalledWith({}, { update_id: 1 }, { ownerId: '111' });
  });

  it('handler ném lỗi → vẫn 200 để Telegram không gửi lại', async () => {
    h.handleUpdate.mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await POST(req('hook-secret', '{"update_id":2}'))).status).toBe(200);
  });

  it('body hỏng → 400', async () => {
    expect((await POST(req('hook-secret', '{'))).status).toBe(400);
  });
});
