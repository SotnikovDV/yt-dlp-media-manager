import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { jsonSafe } from '@/lib/json-safe';
import { env } from '@/lib/env';
import {
  SMART_SEARCH_ALGORITHM_VERSION,
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

/** Для отладки AI-поиска: сколько каналов в scope (подписки / один канал), иначе null. */
function smartSearchSubscriptionChannelCount(
  filter: Prisma.VideoWhereInput['channelId']
): number | null {
  if (filter === undefined || filter === null) return null;
  if (typeof filter === 'string') return 1;
  if (typeof filter === 'object' && filter !== null && 'in' in filter) {
    const arr = (filter as { in: string[] }).in;
    return Array.isArray(arr) ? arr.length : null;
  }
  return null;
}

export const runtime = 'nodejs';

// GET /api/videos - получить список видео
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id ?? null;

    const searchParams = request.nextUrl.searchParams;
    const idsParam = searchParams.get('ids'); // список id через запятую (для плейлистов)
    const pageRaw = parseInt(searchParams.get('page') || '1');
    const limitRaw = parseInt(searchParams.get('limit') || '20');
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 20;
    const search = searchParams.get('search') || '';
    const searchMode = searchParams.get('searchMode') === 'smart' ? 'smart' : 'classic';
    const channelId = searchParams.get('channelId') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const tagId = searchParams.get('tagId') || '';
    const quality = searchParams.get('quality') || '';
    const sort = searchParams.get('sort') || 'downloadedAt';

    const skip = (page - 1) * limit;

    if (searchMode === 'smart' && search.trim()) {
      const unsupportedChannel = new Set([
        '__favorites__',
        '__bookmarks__',
        '__recentWatched__',
        '__individual__',
      ]);
      if (unsupportedChannel.has(channelId)) {
        return NextResponse.json(
          { error: 'smart_search_not_supported_for_view' },
          { status: 409 }
        );
      }
    }

    // Запрос по списку id (для плейлистов): с пагинацией по индексам или без
    if (idsParam && idsParam.trim()) {
      const allIds = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (allIds.length > 0) {
        const total = allIds.length;
        const totalPages = Math.ceil(total / limit);
        const pageIds = allIds.slice(skip, skip + limit);
        if (pageIds.length === 0) {
          return NextResponse.json(
            jsonSafe({
              videos: [],
              pagination: { page, limit, total, totalPages },
            })
          );
        }
        const videosById = await db.video.findMany({
          where: { id: { in: pageIds }, filePath: { not: null } },
          include: {
            channel: true,
            watchHistory: userId ? { where: { userId }, take: 1 } : false,
            favorites: userId ? { where: { userId }, take: 1 } : false,
            bookmarks: userId ? { where: { userId }, take: 1 } : false,
            pins: userId ? { where: { userId }, take: 1 } : false,
          },
        });
        const byId = new Map(videosById.map((v) => [v.id, v]));
        const ordered = pageIds.map((id) => byId.get(id)).filter(Boolean);
        return NextResponse.json(
          jsonSafe({
            videos: ordered,
            pagination: { page, limit, total, totalPages },
          })
        );
      }
    }

    const where: Prisma.VideoWhereInput = {
      filePath: { not: null }
    };

    // Режим «Отдельные видео»: только видео, запрошенные текущим пользователем через UserIndividualVideo
    if (channelId === '__individual__') {
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      where.userIndividualVideos = { some: { userId: session.user.id } };
    } else if (channelId === '__favorites__') {
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const favWhere = {
        userId: session.user.id,
        video: { filePath: { not: null } },
      };
      const [favoriteRecords, totalFav] = await Promise.all([
        db.favorite.findMany({
          where: favWhere,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            video: {
              include: {
                channel: true,
                watchHistory: userId ? { where: { userId }, take: 1 } : false,
                favorites: userId ? { where: { userId }, take: 1 } : false,
                bookmarks: userId ? { where: { userId }, take: 1 } : false,
                pins: userId ? { where: { userId }, take: 1 } : false,
              },
            },
          },
        }),
        db.favorite.count({ where: favWhere }),
      ]);
      const videos = favoriteRecords.map((f) => f.video).filter(Boolean);
      return NextResponse.json(
        jsonSafe({
          videos,
          pagination: {
            page,
            limit,
            total: totalFav,
            totalPages: Math.ceil(totalFav / limit),
          },
        })
      );
    } else if (channelId === '__bookmarks__') {
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const bookmarkWhere = {
        userId: session.user.id,
        video: { filePath: { not: null } },
      };
      const [bookmarkRecords, totalBookmarks] = await Promise.all([
        db.bookmark.findMany({
          where: bookmarkWhere,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            video: {
              include: {
                channel: true,
                watchHistory: userId ? { where: { userId }, take: 1 } : false,
                favorites: userId ? { where: { userId }, take: 1 } : false,
                bookmarks: userId ? { where: { userId }, take: 1 } : false,
                pins: userId ? { where: { userId }, take: 1 } : false,
              },
            },
          },
        }),
        db.bookmark.count({ where: bookmarkWhere }),
      ]);
      const videos = bookmarkRecords.map((b) => b.video).filter(Boolean);
      return NextResponse.json(
        jsonSafe({
          videos,
          pagination: {
            page,
            limit,
            total: totalBookmarks,
            totalPages: Math.ceil(totalBookmarks / limit),
          },
        })
      );
    } else if (channelId === '__recentWatched__') {
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const watchedWhere = {
        userId: session.user.id,
        video: { filePath: { not: null } },
      };
      const [watchedRecords, totalWatched] = await Promise.all([
        db.watchHistory.findMany({
          where: watchedWhere,
          orderBy: { lastWatchedAt: 'desc' },
          skip,
          take: limit,
          include: {
            video: {
              include: {
                channel: true,
                watchHistory: { where: { userId: session.user.id }, take: 1 },
                favorites: { where: { userId: session.user.id }, take: 1 },
                bookmarks: { where: { userId: session.user.id }, take: 1 },
                pins: { where: { userId: session.user.id }, take: 1 },
              },
            },
          },
        }),
        db.watchHistory.count({ where: watchedWhere }),
      ]);
      const videos = watchedRecords.map((r) => r.video).filter(Boolean);
      return NextResponse.json(
        jsonSafe({
          videos,
          pagination: {
            page,
            limit,
            total: totalWatched,
            totalPages: Math.ceil(totalWatched / limit),
          },
        })
      );
    } else if (categoryId && session?.user?.id) {
      const subscriptions = await db.subscription.findMany({
        where: {
          userId: session.user.id,
          ...(categoryId === '__none__' ? { categoryId: null } : { categoryId }),
        },
        select: { channelId: true },
      });
      const channelIds = subscriptions.map((s) => s.channelId);
      if (channelIds.length > 0) {
        where.channelId = { in: channelIds };
      } else {
        where.channelId = { in: [] };
      }
    } else if (channelId) {
      where.channelId = channelId;
    } else if (session?.user?.id) {
      const subscriptions = await db.subscription.findMany({
        where: { userId: session.user.id },
        select: { channelId: true },
      });
      const channelIds = subscriptions.map((s) => s.channelId);
      where.channelId = { in: channelIds };
    }

    if (tagId) {
      where.videoTags = { some: { tagId } };
    }

    if (quality) {
      where.quality = quality;
    }

    const useSmartSearchPath =
      searchMode === 'smart' && search.trim().length > 0 && page === 1;

    function appendAndIdFilter(ids: string[]): void {
      const idFilter =
        ids.length > 0 ? { id: { in: ids } } : { id: { in: [] as string[] } };
      const prev = where.AND;
      where.AND = Array.isArray(prev)
        ? [...prev, idFilter]
        : prev
          ? [prev, idFilter]
          : [idFilter];
    }

    if (search && !useSmartSearchPath) {
      const textIds = await findVideoIdsCaseInsensitiveText(db, {
        needles: expandQueryNeedlesForCaseInsensitiveSearch(search.trim()),
        channelId: where.channelId,
        userIndividualVideos: where.userIndividualVideos,
        tagId: tagId || undefined,
        quality: quality || undefined,
        includeChannelName: false,
      });
      appendAndIdFilter(textIds);
    }

    const orderBy: Prisma.VideoOrderByWithRelationInput =
      sort === 'publishedAt'
        ? { publishedAt: 'desc' }
        : { downloadedAt: 'desc' };

    const videoInclude = {
      channel: true,
      watchHistory: userId ? { where: { userId }, take: 1 } : false,
      favorites: userId ? { where: { userId }, take: 1 } : false,
      bookmarks: userId ? { where: { userId }, take: 1 } : false,
      pins: userId ? { where: { userId }, take: 1 } : false,
    } as const;

    // Умный поиск: пайплайн v1 (ключевые слова LLM → OR по полям → при >5 совпадений реранк LLM).
    if (useSmartSearchPath) {
      if (!env.smartSearchAvailable()) {
        return NextResponse.json(
          { error: 'smart_search_unavailable' },
          { status: 503 }
        );
      }

      const kwRaw = await extractSearchKeywords(search.trim());
      const keywords = normalizeKeywordsForSearch(kwRaw, search.trim());
      logSmartSearchV1Debug('step1_keywords', {
        source: 'api/videos',
        userQuery: search.trim(),
        llmKeywords: kwRaw,
        normalizedKeywords: keywords,
        llmReturnedNull: kwRaw === null,
      });
      const keywordIds = await findVideoIdsCaseInsensitiveText(db, {
        needles: keywords,
        channelId: where.channelId,
        userIndividualVideos: where.userIndividualVideos,
        tagId: tagId || undefined,
        quality: quality || undefined,
        includeChannelName: true,
      });
      const smartWhere: Prisma.VideoWhereInput = {
        AND: [
          where,
          keywordIds.length > 0
            ? { id: { in: keywordIds } }
            : { id: { in: [] as string[] } },
        ],
      };

      const totalSmart = await db.video.count({ where: smartWhere });
      logSmartSearchV1Debug('step2_keyword_hits', {
        source: 'api/videos',
        userQuery: search.trim(),
        totalSmart,
        subscriptionChannelCount: smartSearchSubscriptionChannelCount(
          where.channelId
        ),
      });

      if (totalSmart === 0) {
        logSmartSearchV1Debug('step3_branch', {
          source: 'api/videos',
          branch: 'empty',
          totalSmart: 0,
          reason: 'no_keyword_hits',
        });
        return NextResponse.json(
          jsonSafe({
            videos: [],
            pagination: { page, limit, total: 0, totalPages: 0 },
            smartSearchVersion: SMART_SEARCH_ALGORITHM_VERSION,
          })
        );
      }

      if (totalSmart <= 5) {
        logSmartSearchV1Debug('step3_branch', {
          source: 'api/videos',
          branch: 'no_rerank',
          totalSmart,
          reason: 'totalSmart<=5',
        });
        const videosSmall = await db.video.findMany({
          where: smartWhere,
          include: videoInclude,
          orderBy,
          skip,
          take: limit,
        });
        return NextResponse.json(
          jsonSafe({
            videos: videosSmall,
            pagination: {
              page,
              limit,
              total: totalSmart,
              totalPages: Math.ceil(totalSmart / limit),
            },
            smartSearchVersion: SMART_SEARCH_ALGORITHM_VERSION,
          })
        );
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
        orderBy,
        take: poolTake,
      });

      const poolOrderIds = pool.map((p) => p.id);
      const rerankItems = pool.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        channelName: p.channel.name,
      }));

      const ranked = await rerankVideoIdsForQuery(
        search.trim(),
        rerankItems
      );

      const rerankPayloadCharEstimate =
        `User query: ${search.trim()}\n\nVideos JSON:\n${JSON.stringify(
          rerankItems.map((i) => ({
            id: i.id,
            title: i.title.slice(0, env.aiSearchRerankTitleChars()),
            description: (i.description ?? '').slice(
              0,
              env.aiSearchRerankDescriptionChars()
            ),
            channel: i.channelName.slice(0, env.aiSearchRerankChannelChars()),
          }))
        )}`.length;

      const cap = env.aiSearchSmartResultCap();
      const orderedIds = smartSearchOrderedIdsAfterRerank(
        ranked,
        poolOrderIds,
        cap,
        env.aiSearchSmartAppendKeywordPool()
      );

      logSmartSearchV1Debug('step3_rerank', {
        source: 'api/videos',
        userQuery: search.trim(),
        totalSmart,
        poolTake,
        poolSize: pool.length,
        rerankReturnedIds: ranked?.length ?? null,
        rerankRawNull: ranked === null,
        rerankEmptyArray: ranked !== null && ranked.length === 0,
        rerankPayloadCharEstimate,
        rerankNullOrEmpty: ranked === null || ranked.length === 0,
        usedAiOrder: ranked !== null && ranked.length > 0,
        smartAppendKeywordPool: env.aiSearchSmartAppendKeywordPool(),
        resultCap: cap,
        orderedIdsCount: orderedIds.length,
        orderedIdsHead: orderedIds.slice(0, 16),
        poolPreview: pool.slice(0, 5).map((p) => ({
          id: p.id,
          title: p.title.slice(0, 100),
        })),
      });

      const pageIds = orderedIds.slice(skip, skip + limit);
      if (pageIds.length === 0) {
        return NextResponse.json(
          jsonSafe({
            videos: [],
            pagination: {
              page,
              limit,
              total: orderedIds.length,
              totalPages: Math.ceil(orderedIds.length / limit) || 0,
            },
            smartOrderedVideoIds: orderedIds,
            smartSearchVersion: SMART_SEARCH_ALGORITHM_VERSION,
          })
        );
      }

      const videosById = await db.video.findMany({
        where: { id: { in: pageIds }, filePath: { not: null } },
        include: videoInclude,
      });
      const byId = new Map(videosById.map((v) => [v.id, v]));
      const videos = pageIds.map((id) => byId.get(id)).filter(Boolean);
      return NextResponse.json(
        jsonSafe({
          videos,
          pagination: {
            page,
            limit,
            total: orderedIds.length,
            totalPages: Math.ceil(orderedIds.length / limit) || 0,
          },
          smartOrderedVideoIds: orderedIds,
          smartSearchVersion: SMART_SEARCH_ALGORITHM_VERSION,
        })
      );
    }

    const [videos, total] = await Promise.all([
      db.video.findMany({
        where,
        include: videoInclude,
        orderBy,
        skip,
        take: limit,
      }),
      db.video.count({ where }),
    ]);

    return NextResponse.json(
      jsonSafe({
        videos,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    );
  } catch (error) {
    console.error('Error fetching videos:', error);
    return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 });
  }
}
