import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { mapTelegramApiErrorToUserMessage } from '@/lib/telegram-user-errors';
import { logTelegramUserBot } from '@/lib/telegram-user-bot-log';
import {
  buildTelegramUserBotSetWebhookBody,
  buildTelegramUserBotWebhookUrl,
} from '@/lib/telegram-user-bot-set-webhook-body';

export const runtime = 'nodejs';

const TELEGRAM_API_TIMEOUT_MS = 10_000;

function isValidTelegramChatId(s: string): boolean {
  return /^-?\d+$/.test(s.trim());
}

/**
 * POST /api/profile/telegram-test
 * Тестовое сообщение пользовательским ботом (TELEGRAM_USER_BOT_TOKEN).
 * Тело: { telegramChatId?: string } — если не передано, берётся сохранённый ID из профиля.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const json = await request.json().catch(() => ({}));
  let chatId: string | null =
    typeof json.telegramChatId === 'string' ? json.telegramChatId.trim() : null;

  if (!chatId) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { telegramChatId: true },
    });
    chatId = user?.telegramChatId?.trim() ?? null;
  }

  if (!chatId) {
    return NextResponse.json(
      { error: 'Укажите Telegram Chat ID и сохраните профиль или введите ID в поле' },
      { status: 400 }
    );
  }

  if (!isValidTelegramChatId(chatId)) {
    return NextResponse.json({ error: 'Некорректный Telegram Chat ID' }, { status: 400 });
  }

  const token = env.telegramUserBotToken().trim();
  if (!token) {
    return NextResponse.json(
      { error: 'На сервере не задан TELEGRAM_USER_BOT_TOKEN' },
      { status: 400 }
    );
  }

  const base = env.baseUrl();
  const secret = env.telegramUserBotWebhookSecret().trim();
  const webhookSecretConfigured = secret.length > 0;
  const updatesMode = env.telegramUserBotUpdatesMode();

  // Best-effort: при тесте выставим/обновим webhook. Если задан TELEGRAM_USER_BOT_WEBHOOK_SECRET —
  // всегда вызываем setWebhook, чтобы secret_token в Telegram совпадал с .env (без ручного POST).
  let webhookEnsured = false;
  let webhookError: string | null = null;
  let webhookReRegistered = false;
  if (updatesMode === 'polling') {
    webhookEnsured = true;
    logTelegramUserBot('info', 'webhook_skipped_polling_mode', {});
  } else {
    try {
    const webhookUrl = buildTelegramUserBotWebhookUrl(base, secret);

    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS),
    });
    const info = (await infoRes.json()) as {
      ok?: boolean;
      result?: any;
      description?: string;
    };

    const currentUrl = info?.result?.url;
    const needsUpdate = typeof currentUrl === 'string' ? currentUrl !== webhookUrl : true;
    const pendingCount = Math.max(0, Number(info?.result?.pending_update_count) || 0);
    logTelegramUserBot('debug', 'getWebhookInfo', {
      ok: info.ok,
      url: currentUrl ?? null,
      needsUpdate,
      pending: pendingCount,
      lastError: info?.result?.last_error_message ?? null,
      allowed_updates: info?.result?.allowed_updates ?? null,
    });

    const callSetWebhook = async (dropPendingUpdates: boolean) => {
      const body = buildTelegramUserBotSetWebhookBody({
        url: webhookUrl,
        secretToken: secret || undefined,
        dropPendingUpdates,
      });

      const swRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS),
      });
      const sw = (await swRes.json()) as { ok?: boolean; description?: string; result?: unknown };
      if (!sw.ok) {
        webhookError = sw.description ?? 'setWebhook failed';
        logTelegramUserBot('error', 'setWebhook_failed', { description: sw.description ?? null });
        return false;
      }
      webhookReRegistered = true;
      logTelegramUserBot('info', 'setWebhook_ok', {
        url: webhookUrl,
        hasSecret: Boolean(secret),
        dropPendingUpdates,
      });
      return true;
    };

    const mustCallSetWebhook = needsUpdate || pendingCount > 0 || webhookSecretConfigured;

    if (mustCallSetWebhook) {
      webhookEnsured = await callSetWebhook(pendingCount > 0);
    } else {
      webhookEnsured = true;
    }
    } catch (e: unknown) {
      webhookError = 'Не удалось выставить webhook для TELEGRAM_USER_BOT_TOKEN';
      logTelegramUserBot('error', 'webhook_setup_exception', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const text = `✅ <b>Тестовое уведомление</b>\n\nЕсли вы видите это сообщение, доставка из профиля настроена верно.\n\n<a href="${base}">Открыть приложение</a>`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS),
    });

    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok) {
      const raw = data.description ?? 'Unknown error';
      return NextResponse.json(
        { error: mapTelegramApiErrorToUserMessage(raw) },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      webhookEnsured,
      webhookError,
      webhookSecretConfigured,
      webhookReRegistered,
      telegramUpdatesMode: updatesMode,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Ошибка сети при обращении к Telegram API';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
