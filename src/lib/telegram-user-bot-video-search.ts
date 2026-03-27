/**
 * Поиск видео в медиатеке по подпискам пользователя (по привязанному Telegram Chat ID).
 * Логика выборки совпадает с GET /api/videos без channelId: только каналы из подписок.
 */

import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

const MAX_QUERY_LEN = 200;
/** Сколько строк в одном ответе (лимит Telegram ~4096 символов на сообщение). */
const TELEGRAM_USER_BOT_SEARCH_LIMIT = 12;

export type TelegramUserBotSearchOk = {
  ok: true;
  query: string;
  videos: { id: string; title: string }[];
  total: number;
};

export type TelegramUserBotSearchFail = {
  ok: false;
  reason: 'empty_query' | 'no_user';
};

export type TelegramUserBotSearchResult = TelegramUserBotSearchOk | TelegramUserBotSearchFail;

/**
 * @param telegramChatId — как в Telegram API (строка, например "123456789" или "-100…")
 */
export async function searchVideosForTelegramChat(
  telegramChatId: string,
  rawQuery: string
): Promise<TelegramUserBotSearchResult> {
  const q = rawQuery.trim().slice(0, MAX_QUERY_LEN);
  if (!q) return { ok: false, reason: 'empty_query' };

  const chatKey = telegramChatId.trim();
  const user = await db.user.findFirst({
    where: { telegramChatId: chatKey },
    select: { id: true },
  });
  if (!user) return { ok: false, reason: 'no_user' };

  const subs = await db.subscription.findMany({
    where: { userId: user.id },
    select: { channelId: true },
  });
  const channelIds = subs.map((s) => s.channelId);

  const where: Prisma.VideoWhereInput = {
    filePath: { not: null },
    channelId: { in: channelIds.length > 0 ? channelIds : [] },
    OR: [
      { title: { contains: q } },
      { description: { contains: q } },
      { channel: { name: { contains: q } } },
    ],
  };

  const [videos, total] = await Promise.all([
    db.video.findMany({
      where,
      select: { id: true, title: true },
      /** Сначала свежее по дате публикации; при совпадении или без publishedAt — по дате загрузки. */
      orderBy: [{ publishedAt: 'desc' }, { downloadedAt: 'desc' }],
      take: TELEGRAM_USER_BOT_SEARCH_LIMIT,
    }),
    db.video.count({ where }),
  ]);

  return { ok: true, query: q, videos, total };
}
