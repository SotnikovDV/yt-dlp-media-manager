/**
 * Long polling getUpdates для TELEGRAM_USER_BOT_TOKEN — альтернатива webhook (без входящих HTTP от Telegram).
 * Запускается вместе с воркером очереди (ensureQueueWorker).
 */

import { env } from '@/lib/env';
import { logTelegramUserBot } from '@/lib/telegram-user-bot-log';
import { processTelegramUserBotUpdate, type TelegramUserBotUpdate } from '@/lib/telegram-user-bot-updates';

const API_TIMEOUT_MS = 60_000;
const BACKOFF_ON_ERROR_MS = 5_000;

declare global {
  var __ydmmTelegramUserBotPoller: { started: boolean } | undefined;
  var __ydmmTelegramUserBotPollerWebhookSkipLogged: boolean | undefined;
}

function getState() {
  if (!globalThis.__ydmmTelegramUserBotPoller) {
    globalThis.__ydmmTelegramUserBotPoller = { started: false };
  }
  return globalThis.__ydmmTelegramUserBotPoller;
}

async function telegramApi<T>(token: string, method: string, params: Record<string, string>): Promise<T> {
  const u = new URL(`https://api.telegram.org/bot${token}/${method}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  return (await res.json()) as T;
}

async function pollLoop(token: string): Promise<void> {
  let offset = 0;
  for (;;) {
    try {
      const data = await telegramApi<{
        ok?: boolean;
        result?: TelegramUserBotUpdate[];
        description?: string;
      }>(token, 'getUpdates', {
        offset: String(offset),
        timeout: '50',
      });

      if (!data.ok) {
        logTelegramUserBot('error', 'getUpdates_failed', { description: data.description ?? null });
        await new Promise((r) => setTimeout(r, BACKOFF_ON_ERROR_MS));
        continue;
      }

      const list = data.result ?? [];
      for (const u of list) {
        if (typeof u.update_id === 'number') offset = u.update_id + 1;
        await processTelegramUserBotUpdate(u);
      }
    } catch (e: unknown) {
      logTelegramUserBot('error', 'getUpdates_exception', {
        error: e instanceof Error ? e.message : String(e),
      });
      await new Promise((r) => setTimeout(r, BACKOFF_ON_ERROR_MS));
    }
  }
}

/**
 * При режиме polling снимает webhook и крутит getUpdates в фоне.
 * Не блокирует: сразу возвращает управление.
 */
export function startTelegramUserBotPollerIfEnabled(): void {
  const mode = env.telegramUserBotUpdatesMode();

  if (mode !== 'polling') {
    if (!globalThis.__ydmmTelegramUserBotPollerWebhookSkipLogged) {
      globalThis.__ydmmTelegramUserBotPollerWebhookSkipLogged = true;
      console.info(
        '[telegram-user-bot-poller] режим webhook (по умолчанию): обновления только с HTTPS POST от Telegram. ' +
          'Если в getWebhookInfo «Read timeout expired» или растёт pending_update_count — задайте в ENV ' +
          'TELEGRAM_USER_BOT_UPDATES_MODE=polling и перезапустите контейнер (фоновый getUpdates).'
      );
    }
    return;
  }

  console.info('[telegram-user-bot-poller] startTelegramUserBotPollerIfEnabled', {
    mode,
    hasUserBotToken: Boolean(env.telegramUserBotToken().trim()),
  });

  const token = env.telegramUserBotToken().trim();
  if (!token) {
    console.warn('[telegram-user-bot-poller] skip: TELEGRAM_USER_BOT_TOKEN пуст');
    logTelegramUserBot('warn', 'poller_skipped_no_token', {});
    return;
  }

  const state = getState();
  if (state.started) {
    console.info('[telegram-user-bot-poller] already started');
    return;
  }
  state.started = true;
  console.info('[telegram-user-bot-poller] starting background getUpdates loop');

  void (async () => {
    try {
      const del = await telegramApi<{ ok?: boolean; description?: string }>(token, 'deleteWebhook', {
        drop_pending_updates: 'true',
      });
      if (!del.ok) {
        console.error('[telegram-user-bot-poller] deleteWebhook failed', del.description ?? null);
        logTelegramUserBot('error', 'deleteWebhook_failed', { description: del.description ?? null });
      } else {
        console.info('[telegram-user-bot-poller] deleteWebhook OK (polling mode)');
        logTelegramUserBot('info', 'deleteWebhook_ok_polling', {});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[telegram-user-bot-poller] deleteWebhook exception', msg);
      logTelegramUserBot('error', 'deleteWebhook_exception', { error: msg });
    }

    console.info('[telegram-user-bot-poller] entering getUpdates long poll loop');
    logTelegramUserBot('info', 'poller_started', {});
    await pollLoop(token);
  })();
}
