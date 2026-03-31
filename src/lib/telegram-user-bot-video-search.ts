/**
 * Поиск видео в медиатеке по подпискам пользователя (по привязанному Telegram Chat ID).
 * При наличии AI_API_KEY — пайплайн v1 (ключевые слова → OR-поиск → при >5 совпадений реранк).
 * При отсутствии ключей или нуле совпадений по ключам — обычный поиск по подстроке.
 */

import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { env } from '@/lib/env';
import {
  extractSearchKeywords,
  logSmartSearchV1Debug,
  normalizeKeywordsForSearch,
  rerankVideoIdsForQuery,
  smartSearchOrderedIdsAfterRerank,
} from '@/lib/ai-search-pipeline-v1';
import {
  expandQueryNeedlesForCaseInsensitiveSearch,
  findVideoIdsCaseInsensitiveText,
} from '@/lib/video-case-insensitive-search';

const MAX_QUERY_LEN = 200;
/** Сколько строк в одном ответе (лимит Telegram ~4096 символов на сообщение). */
const TELEGRAM_USER_BOT_SEARCH_LIMIT = 12;

export type TelegramUserBotSearchOk = {
  ok: true;
  query: string;
  videos: { id: string; title: string; publishedAt: Date | null }[];
  total: number;
  searchKind: 'smart' | 'classic';
};

export type TelegramUserBotSearchFail = {
  ok: false;
  reason: 'empty_query' | 'no_user';
};

export type TelegramUserBotSearchResult = TelegramUserBotSearchOk | TelegramUserBotSearchFail;

const orderByTelegram: Prisma.VideoOrderByWithRelationInput[] = [
  { publishedAt: 'desc' },
  { downloadedAt: 'desc' },
];

async function searchClassicSubstring(
  whereBase: Prisma.VideoWhereInput,
  q: string
): Promise<{
  videos: { id: string; title: string; publishedAt: Date | null }[];
  total: number;
}> {
  const textIds = await findVideoIdsCaseInsensitiveText(db, {
    needles: expandQueryNeedlesForCaseInsensitiveSearch(q),
    channelId: whereBase.channelId,
    userIndividualVideos: whereBase.userIndividualVideos,
    includeChannelName: true,
  });
  const where: Prisma.VideoWhereInput = {
    ...whereBase,
    ...(textIds.length > 0
      ? { id: { in: textIds } }
      : { id: { in: [] as string[] } }),
  };

  const [videos, total] = await Promise.all([
    db.video.findMany({
      where,
      select: { id: true, title: true, publishedAt: true },
      orderBy: orderByTelegram,
      take: TELEGRAM_USER_BOT_SEARCH_LIMIT,
    }),
    db.video.count({ where }),
  ]);

  return { videos, total };
}

function mapVideosByOrderedIds(
  showIds: string[],
  rows: { id: string; title: string; publishedAt: Date | null }[]
): { id: string; title: string; publishedAt: Date | null }[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return showIds
    .map((id) => byId.get(id))
    .filter(
      (v): v is { id: string; title: string; publishedAt: Date | null } =>
        v != null
    );
}

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

  const whereBase: Prisma.VideoWhereInput = {
    filePath: { not: null },
    channelId: { in: channelIds.length > 0 ? channelIds : [] },
  };

  if (env.smartSearchAvailable()) {
    const kwRaw = await extractSearchKeywords(q);
    const keywords = normalizeKeywordsForSearch(kwRaw, q);
    logSmartSearchV1Debug('step1_keywords', {
      source: 'telegram-user-bot',
      userQuery: q,
      llmKeywords: kwRaw,
      normalizedKeywords: keywords,
      llmReturnedNull: kwRaw === null,
    });
    const keywordIds = await findVideoIdsCaseInsensitiveText(db, {
      needles: keywords,
      channelId: whereBase.channelId,
      userIndividualVideos: whereBase.userIndividualVideos,
      includeChannelName: true,
    });
    const smartWhere: Prisma.VideoWhereInput = {
      AND: [
        whereBase,
        keywordIds.length > 0
          ? { id: { in: keywordIds } }
          : { id: { in: [] as string[] } },
      ],
    };

    const totalSmart = await db.video.count({ where: smartWhere });
    logSmartSearchV1Debug('step2_keyword_hits', {
      source: 'telegram-user-bot',
      userQuery: q,
      totalSmart,
    });

    if (totalSmart === 0) {
      logSmartSearchV1Debug('step3_branch', {
        source: 'telegram-user-bot',
        branch: 'classic_fallback',
        totalSmart: 0,
        reason: 'no_keyword_hits',
      });
      const classic = await searchClassicSubstring(whereBase, q);
      return {
        ok: true,
        query: q,
        videos: classic.videos,
        total: classic.total,
        searchKind: 'classic',
      };
    }

    if (totalSmart <= 5) {
      logSmartSearchV1Debug('step3_branch', {
        source: 'telegram-user-bot',
        branch: 'no_rerank',
        totalSmart,
        reason: 'totalSmart<=5',
      });
      const videos = await db.video.findMany({
        where: smartWhere,
        select: { id: true, title: true, publishedAt: true },
        orderBy: orderByTelegram,
        take: TELEGRAM_USER_BOT_SEARCH_LIMIT,
      });
      return {
        ok: true,
        query: q,
        videos,
        total: totalSmart,
        searchKind: 'smart',
      };
    }

    const poolTake = env.aiSearchV1RerankPool();
    const pool = await db.video.findMany({
      where: smartWhere,
      select: {
        id: true,
        title: true,
        description: true,
        channel: { select: { name: true } },
      },
      orderBy: orderByTelegram,
      take: poolTake,
    });

    const poolOrderIds = pool.map((p) => p.id);
    const rerankItems = pool.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      channelName: p.channel.name,
    }));

    const ranked = await rerankVideoIdsForQuery(q, rerankItems);
    const cap = env.aiSearchSmartResultCap();
    const appendPool = env.aiSearchSmartAppendKeywordPool();
    const orderedIds = smartSearchOrderedIdsAfterRerank(
      ranked,
      poolOrderIds,
      cap,
      appendPool
    );

    logSmartSearchV1Debug('step3_rerank', {
      source: 'telegram-user-bot',
      userQuery: q,
      totalSmart,
      poolTake,
      poolSize: pool.length,
      rerankReturnedIds: ranked?.length ?? null,
      rerankNullOrEmpty: ranked === null || ranked.length === 0,
      usedAiOrder: ranked !== null && ranked.length > 0,
      smartAppendKeywordPool: appendPool,
      resultCap: cap,
      orderedIdsCount: orderedIds.length,
      orderedIdsHead: orderedIds.slice(0, 16),
      poolPreview: pool.slice(0, 5).map((p) => ({
        id: p.id,
        title: p.title.slice(0, 100),
      })),
    });

    const showIds = orderedIds.slice(0, TELEGRAM_USER_BOT_SEARCH_LIMIT);
    const rows = await db.video.findMany({
      where: { id: { in: showIds }, filePath: { not: null } },
      select: { id: true, title: true, publishedAt: true },
    });
    const videos = mapVideosByOrderedIds(showIds, rows);

    return {
      ok: true,
      query: q,
      videos,
      total: orderedIds.length,
      searchKind: 'smart',
    };
  }

  const { videos, total } = await searchClassicSubstring(whereBase, q);
  return { ok: true, query: q, videos, total, searchKind: 'classic' };
}
