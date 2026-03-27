import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramUserBotWebhookPost } from '@/lib/telegram-user-bot-webhook-post';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — проверка, что маршрут и прокси доходят до приложения (Telegram шлёт только POST). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'telegram_user_bot_webhook',
    hint: 'Telegram отправляет сюда только POST с телом Update. При секрете предпочтителен путь /api/telegram/user-bot-hook/<secret>',
  });
}

/** POST — legacy URL: секрет через заголовок и/или ?tgSt= (часть прокси обрезает query). */
export async function POST(request: NextRequest) {
  return handleTelegramUserBotWebhookPost(request, { kind: 'legacy' });
}
