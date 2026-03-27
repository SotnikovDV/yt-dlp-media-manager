import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { env } from '@/lib/env';
import { logTelegramUserBot } from '@/lib/telegram-user-bot-log';
import {
  buildTelegramUserBotSetWebhookBody,
  buildTelegramUserBotWebhookUrl,
} from '@/lib/telegram-user-bot-set-webhook-body';

export const runtime = 'nodejs';

/**
 * POST /api/telegram/user-bot-set-webhook
 * Админский хэндлер: устанавливает webhook для пользовательского бота (TELEGRAM_USER_BOT_TOKEN).
 *
 * URL webhook: buildTelegramUserBotWebhookUrl (при секрете — с ?tgSt=…).
 * Если задан TELEGRAM_USER_BOT_WEBHOOK_SECRET — передаём secret_token.
 *
 * Тело (опционально): `{ "dropPendingUpdates": true }` — сбросить очередь необработанных
 * апдейтов в Telegram (после зависших доставок из‑за таймаута и т.п.).
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = env.telegramUserBotToken().trim();
  if (!token) return NextResponse.json({ error: 'TELEGRAM_USER_BOT_TOKEN не задан' }, { status: 400 });

  if (env.telegramUserBotUpdatesMode() === 'polling') {
    return NextResponse.json(
      {
        error:
          'Включён TELEGRAM_USER_BOT_UPDATES_MODE=polling — webhook не используется; команды забирает фоновый getUpdates.',
      },
      { status: 400 }
    );
  }

  const json = (await request.json().catch(() => ({}))) as { dropPendingUpdates?: boolean };
  const dropPendingUpdates = json.dropPendingUpdates === true;

  const base = env.baseUrl();
  const secret = env.telegramUserBotWebhookSecret().trim();
  const url = buildTelegramUserBotWebhookUrl(base, secret);

  const body = buildTelegramUserBotSetWebhookBody({
    url,
    secretToken: secret || undefined,
    dropPendingUpdates,
  });

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { ok?: boolean; description?: string; result?: any };
  if (!data.ok) {
    logTelegramUserBot('error', 'setWebhook_failed', { description: data.description ?? null });
    return NextResponse.json(
      { error: data.description ?? 'Telegram setWebhook failed' },
      { status: 502 },
    );
  }

  logTelegramUserBot('info', 'setWebhook_ok', { url, hasSecret: Boolean(secret) });
  return NextResponse.json({ success: true, result: data.result });
}

