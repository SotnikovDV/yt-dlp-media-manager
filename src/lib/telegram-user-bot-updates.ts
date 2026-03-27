/**
 * Обработка входящих Update пользовательского бота (общая для webhook и long polling).
 */

import { env } from '@/lib/env';
import { db } from '@/lib/db';
import { setLastUserBotUpdate } from '@/lib/user-bot-debug';
import { logTelegramUserBot } from '@/lib/telegram-user-bot-log';
import { searchVideosForTelegramChat } from '@/lib/telegram-user-bot-video-search';
import {
  classifyYouTubeUrlForBot,
  extractSingleUrlFromMessageText,
  runTelegramYouTubeUrlAction,
} from '@/lib/telegram-user-bot-youtube-actions';
import { isYouTubeUrl } from '@/lib/ytdlp';
import { escapeHtmlTelegram } from '@/lib/telegram';

const SEND_MESSAGE_TIMEOUT_MS = 15_000;

export type TelegramUserBotMessage = {
  message_id?: number;
  chat?: { id?: number | string; type?: string };
  text?: string;
  caption?: string;
  from?: { is_bot?: boolean };
};

export type TelegramUserBotUpdate = {
  update_id?: number;
  message?: TelegramUserBotMessage;
  edited_message?: TelegramUserBotMessage;
};

function isIdOrStartCommand(text: string | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  return /^\/(id|start)(@\w+)?(\s|$)/i.test(t);
}

function truncateForTelegramLine(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function buildVideoSearchReplyHtml(
  base: string,
  query: string,
  videos: { id: string; title: string }[],
  total: number
): string {
  const root = base.replace(/\/$/, '');
  const lines: string[] = [
    `По запросу «${escapeHtmlTelegram(query)}»:`,
    '',
  ];
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const title = escapeHtmlTelegram(truncateForTelegramLine(v.title, 120));
    const url = `${root}/watch/${encodeURIComponent(v.id)}?fs=1`;
    lines.push(`${i + 1}. <a href="${url}">${title}</a>`);
  }
  if (total > videos.length) {
    lines.push(
      '',
      `Всего найдено: ${total} (показаны первые ${videos.length}). Откройте сайт для полного списка.`
    );
  }
  lines.push('', `<a href="${root}">Открыть приложение</a>`);
  return lines.join('\n');
}

function summarizeUpdate(u: TelegramUserBotUpdate): Record<string, unknown> {
  const keys = u && typeof u === 'object' ? Object.keys(u as object) : [];
  return {
    update_id: u.update_id ?? null,
    keys,
  };
}

async function sendReplyMessage(token: string, chatId: number | string, html: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_MESSAGE_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (!res.ok || !data?.ok) {
      logTelegramUserBot('error', 'sendMessage_failed', {
        chatId,
        status: res.status,
        description: data?.description ?? null,
      });
    } else {
      logTelegramUserBot('info', 'sendMessage_ok', { chatId });
    }
  } catch (e: unknown) {
    logTelegramUserBot('error', 'sendMessage_exception', {
      chatId,
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Разбор одного Update: логи, /id и /start → sendMessage.
 * Для webhook вызывайте из setImmediate после ответа 200; для polling — await напрямую.
 */
export async function processTelegramUserBotUpdate(update: TelegramUserBotUpdate): Promise<void> {
  logTelegramUserBot('info', 'update_received', summarizeUpdate(update));

  const token = env.telegramUserBotToken().trim();
  if (!token) {
    logTelegramUserBot('error', 'missing_user_bot_token', {});
    return;
  }

  const msg = update.message ?? update.edited_message;
  if (msg?.chat?.id === undefined || msg?.chat?.id === null) {
    logTelegramUserBot('debug', 'no_message_in_update', summarizeUpdate(update));
    return;
  }

  if (msg.from?.is_bot) {
    logTelegramUserBot('debug', 'ignored_from_bot', { chatId: msg.chat.id });
    return;
  }

  const rawText = msg.text ?? msg.caption;
  const numericChatId = typeof msg.chat.id === 'number' ? msg.chat.id : Number(msg.chat.id);
  setLastUserBotUpdate({
    chatId: Number.isFinite(numericChatId) ? numericChatId : null,
    text: rawText ?? null,
    update,
  });

  logTelegramUserBot('info', 'message', {
    chatId: msg.chat.id,
    text: rawText ?? null,
    messageId: msg.message_id ?? null,
  });

  const chatId = msg.chat.id;
  const chatIdStr = String(chatId).trim();
  const base = env.baseUrl().replace(/\/$/, '');

  if (isIdOrStartCommand(rawText)) {
    const idStr = String(chatId);
    const text = [
      'Ваш <b>Chat ID</b> для профиля на сайте:',
      '',
      `<code>${idStr}</code>`,
      '',
      'Скопируйте число в поле «Telegram Chat ID» и сохраните профиль.',
      '',
      `🔗 <a href="${base}">Открыть приложение</a>`,
    ].join('\n');

    logTelegramUserBot('info', 'command_scheduled', { chatId, command: rawText?.trim() ?? null });
    await sendReplyMessage(token, chatId, text);
    return;
  }

  const trimmed = rawText?.trim() ?? '';
  if (!trimmed || trimmed.startsWith('/')) {
    return;
  }

  const singleUrl = extractSingleUrlFromMessageText(trimmed);
  if (singleUrl) {
    if (!isYouTubeUrl(singleUrl)) {
      await sendReplyMessage(
        token,
        chatId,
        [
          'Если отправить <b>одну ссылку</b>, обрабатываются только адреса <b>YouTube</b> (ролик или канал).',
          '',
          `<a href="${base}">Открыть приложение</a>`,
        ].join('\n')
      );
      return;
    }

    const linkedUser = await db.user.findFirst({
      where: { telegramChatId: chatIdStr },
      select: { id: true },
    });
    if (!linkedUser) {
      logTelegramUserBot('info', 'youtube_url_skipped_no_profile', { chatId });
      await sendReplyMessage(
        token,
        chatId,
        [
          'Действия по ссылке недоступны: профиль на сайте не привязан к этому чату.',
          '',
          'Отправьте <code>/id</code>, укажите Chat ID в профиле и сохраните.',
          '',
          `<a href="${base}">Открыть приложение</a>`,
        ].join('\n')
      );
      return;
    }

    const kind = classifyYouTubeUrlForBot(singleUrl);
    const waitHint =
      kind === 'video'
        ? 'Ссылка на <b>ролик</b> принята. Запрашиваю данные у YouTube и ставлю загрузку в очередь — подождите…'
        : kind === 'channel'
          ? 'Ссылка на <b>канал</b> принята. Получаю данные канала и добавляю подписку (это может занять до минуты) — подождите…'
          : 'Проверяю ссылку — подождите…';
    await sendReplyMessage(token, chatId, waitHint);

    try {
      const html = await runTelegramYouTubeUrlAction(linkedUser.id, singleUrl, base);
      logTelegramUserBot('info', 'youtube_url_handled', { chatId });
      await sendReplyMessage(token, chatId, html);
    } catch (e: unknown) {
      logTelegramUserBot('error', 'youtube_url_exception', {
        chatId,
        error: e instanceof Error ? e.message : String(e),
      });
      await sendReplyMessage(
        token,
        chatId,
        [
          'Произошла внутренняя ошибка при обработке ссылки. Попробуйте позже или выполните действие через сайт.',
          '',
          `<a href="${base}">Открыть приложение</a>`,
        ].join('\n')
      );
    }
    return;
  }

  const searchResult = await searchVideosForTelegramChat(chatIdStr, trimmed);
  if (!searchResult.ok) {
    if (searchResult.reason === 'no_user') {
      logTelegramUserBot('info', 'search_skipped_no_profile', { chatId });
      await sendReplyMessage(
        token,
        chatId,
        [
          'Поиск недоступен: профиль на сайте не привязан к этому чату.',
          '',
          'Отправьте команду <code>/id</code>, скопируйте Chat ID в профиль и сохраните — после этого можно искать видео текстом.',
          '',
          `<a href="${base}">Открыть приложение</a>`,
        ].join('\n')
      );
    }
    return;
  }

  logTelegramUserBot('info', 'search_query', {
    chatId,
    query: searchResult.query,
    total: searchResult.total,
    shown: searchResult.videos.length,
  });

  if (searchResult.total === 0) {
    await sendReplyMessage(
      token,
      chatId,
      [
        `По запросу «${escapeHtmlTelegram(searchResult.query)}» ничего не найдено среди видео по вашим подпискам.`,
        '',
        `<a href="${base}">Открыть приложение</a>`,
      ].join('\n')
    );
    return;
  }

  let toShow = searchResult.videos;
  let html = buildVideoSearchReplyHtml(base, searchResult.query, toShow, searchResult.total);
  while (html.length > 4000 && toShow.length > 1) {
    toShow = toShow.slice(0, toShow.length - 1);
    html = buildVideoSearchReplyHtml(base, searchResult.query, toShow, searchResult.total);
  }
  await sendReplyMessage(token, chatId, html);
}
