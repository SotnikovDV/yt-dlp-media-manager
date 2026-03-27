import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramUserBotWebhookPost } from '@/lib/telegram-user-bot-webhook-post';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — проверка прокси (тот же хост, что и у webhook POST). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'telegram_user_bot_hook',
    hint: 'POST сюда с телом Update от Telegram',
  });
}

/**
 * POST /api/telegram/user-bot-hook/[token]
 * Секрет в пути — не пропадает, если обратный прокси обрезает query string до upstream.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }
  return handleTelegramUserBotWebhookPost(request, { kind: 'path', pathToken: token });
}
