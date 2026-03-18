import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sendTelegramAdminNotification } from '@/lib/telegram';

export const runtime = 'nodejs';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as any).isAdmin !== true) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();

  if (!token || !chatId) {
    return NextResponse.json(
      { error: 'TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_ID не заданы' },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '✅ <b>Тестовое уведомление</b>\nНастройка Telegram-уведомлений прошла успешно.',
        parse_mode: 'HTML',
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await res.json();
    if (!data.ok) {
      return NextResponse.json(
        { error: `Telegram API: ${data.description ?? 'Unknown error'}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Ошибка сети при обращении к Telegram API' },
      { status: 502 }
    );
  }
}
