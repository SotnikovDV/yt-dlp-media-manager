import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * GET /api/telegram/user-bot-webhook-info
 * Админ: показывает текущие настройки webhook для TELEGRAM_USER_BOT_TOKEN.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = env.telegramUserBotToken().trim();
  if (!token) return NextResponse.json({ error: 'TELEGRAM_USER_BOT_TOKEN не задан' }, { status: 400 });

  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json()) as { ok?: boolean; description?: string; result?: any };

  if (!data.ok) {
    return NextResponse.json({ error: data.description ?? 'getWebhookInfo failed' }, { status: 502 });
  }

  return NextResponse.json({ success: true, result: data.result });
}

