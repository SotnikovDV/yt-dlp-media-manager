import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logTelegramUserBot } from '@/lib/telegram-user-bot-log';
import { TELEGRAM_USER_BOT_WEBHOOK_SECRET_QUERY } from '@/lib/telegram-user-bot-set-webhook-body';
import {
  processTelegramUserBotUpdate,
  type TelegramUserBotUpdate,
} from '@/lib/telegram-user-bot-updates';

/** Telegram достаточно любого 2xx; короткий plain-текст быстрее для прокси. */
function okAck(): Response {
  return new Response('OK', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export type TelegramUserBotWebhookAuth =
  | { kind: 'path'; pathToken: string }
  | { kind: 'legacy' };

/**
 * Общая обработка POST webhook пользовательского бота.
 */
export async function handleTelegramUserBotWebhookPost(
  request: NextRequest,
  auth: TelegramUserBotWebhookAuth
): Promise<Response> {
  logTelegramUserBot('debug', 'webhook_request', {
    hasSecretConfigured: Boolean(env.telegramUserBotWebhookSecret().trim()),
    authKind: auth.kind,
    pathname: request.nextUrl.pathname,
    hasQueryTgSt: Boolean(request.nextUrl.searchParams.get(TELEGRAM_USER_BOT_WEBHOOK_SECRET_QUERY)),
    hasSecretHeader: Boolean(request.headers.get('x-telegram-bot-api-secret-token')),
  });

  const secret = env.telegramUserBotWebhookSecret().trim();
  if (secret) {
    if (auth.kind === 'path') {
      let fromPath = auth.pathToken;
      try {
        fromPath = decodeURIComponent(fromPath);
      } catch {
        /* как пришло */
      }
      fromPath = fromPath.trim();
      if (fromPath !== secret) {
        logTelegramUserBot('warn', 'path_secret_mismatch', {
          pathTokenLen: auth.pathToken.length,
        });
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      const hdr = request.headers.get('x-telegram-bot-api-secret-token')?.trim();
      const q = request.nextUrl.searchParams.get(TELEGRAM_USER_BOT_WEBHOOK_SECRET_QUERY)?.trim();
      const ok = hdr === secret || q === secret;
      if (!ok) {
        logTelegramUserBot('warn', 'secret_token_mismatch', {
          hasHeader: Boolean(hdr),
          headerMatches: hdr === secret,
          hasQuery: Boolean(q),
          queryMatches: q === secret,
        });
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  const token = env.telegramUserBotToken().trim();
  if (!token) {
    logTelegramUserBot('error', 'missing_user_bot_token', {});
    return NextResponse.json({ error: 'TELEGRAM_USER_BOT_TOKEN не задан' }, { status: 503 });
  }

  let update: TelegramUserBotUpdate;
  try {
    update = (await request.json()) as TelegramUserBotUpdate;
  } catch {
    logTelegramUserBot('error', 'bad_json', {});
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  setImmediate(() => {
    void processTelegramUserBotUpdate(update);
  });

  return okAck();
}
