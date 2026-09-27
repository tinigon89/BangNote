import { headers } from 'next/headers';
import { ActionButton } from '@/components/ActionButton';
import { requireSession } from '@/lib/auth/require';
import { callTelegram } from '@/lib/telegram/api';
import { registerWebhookAction } from './actions';

export const dynamic = 'force-dynamic';

const ENV_VARS = [
  'DATABASE_URL',
  'ADMIN_PASSWORD',
  'SESSION_SECRET',
  'API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_OWNER_ID',
] as const;

interface WebhookInfo {
  url: string;
  pending_update_count: number;
  last_error_message?: string;
}

async function webhookInfo(): Promise<{ info?: WebhookInfo; error?: string }> {
  try {
    return { info: await callTelegram<WebhookInfo>('getWebhookInfo', {}) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function SettingsPage() {
  await requireSession();
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const { info, error } = await webhookInfo();
  const expectedUrl = `${origin}/api/telegram/webhook`;

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Biến môi trường</h2>
        <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          {ENV_VARS.map((name) => (
            <li key={name}>
              {process.env[name] ? '✅' : '❌'} <code>{name}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Bot Telegram</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && (
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="inline text-slate-500">Webhook hiện tại: </dt>
              <dd className="inline break-all">{info.url || '(chưa đăng ký)'}</dd>
              {info.url === expectedUrl && <span className="ml-1 text-green-700">✓ đúng</span>}
            </div>
            <div>
              <dt className="inline text-slate-500">Tin đang chờ: </dt>
              <dd className="inline">{info.pending_update_count}</dd>
            </div>
            {info.last_error_message && (
              <div className="text-red-600">Lỗi gần nhất: {info.last_error_message}</div>
            )}
          </dl>
        )}
        <ActionButton action={registerWebhookAction} label="Đăng ký webhook" okMessage="Đã đăng ký" />
        <p className="text-xs text-slate-500">
          Đăng ký tới <code className="break-all">{expectedUrl}</code>. Hãy bấm trên domain production (không phải preview).
        </p>
      </section>

      <section className="space-y-2 rounded-xl bg-white p-4 text-sm shadow-sm">
        <h2 className="font-semibold">Extension &amp; Widget</h2>
        <p>
          URL server: <code className="break-all">{origin}</code>
        </p>
        <p>API key: giá trị biến <code>API_KEY</code> trên Vercel.</p>
        <p className="text-slate-500">Hướng dẫn cài đặt chi tiết xem README trong repo.</p>
      </section>
    </div>
  );
}
