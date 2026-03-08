import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { jsonSafe } from '@/lib/json-safe';

export const runtime = 'nodejs';

const MAX_LIMIT = 50;
const UNCATEGORIZED_KEY = '__none__';

// GET /api/videos/sections - секции для медиатеки: последние скаченные и просмотренные только с каналов подписок пользователя
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const defaultLimit = env.mediaLibraryRecentLimit();
    const limitParam = searchParams.get('limit');
    const limitRaw = limitParam != null ? parseInt(limitParam, 10) : defaultLimit;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : defaultLimit;

    const [subscriptions, individualVideoIdsResult] = await Promise.all([
      db.subscription.findMany({
        where: { userId: session.user.id },
        select: {
          channelId: true,
          categoryId: true,
          category: {
            select: {
              id: true,
              name: true,
              backgroundColor: true,
            },
          },
        },
      }),
      db.userIndividualVideo.findMany({
        where: { userId: session.user.id },
        select: { videoId: true },
      }).catch(() => [] as { videoId: string }[]),
    ]);
    const channelIds = subscriptions.map((s) => s.channelId);
    const individualVideoIds = individualVideoIdsResult.map((r) => r.videoId);

    // Условие «доступных» видео: с каналов подписок ИЛИ из «Отдельных видео» пользователя (чтобы блоки не были пустыми при отсутствии подписок или при наличии только отдельных загрузок)
    const videoWhereClause =
      channelIds.length > 0 && individualVideoIds.length > 0
        ? { filePath: { not: null }, OR: [{ channelId: { in: channelIds } }, { id: { in: individualVideoIds } }] }
        : channelIds.length > 0
          ? { filePath: { not: null }, channelId: { in: channelIds } }
          : individualVideoIds.length > 0
            ? { filePath: { not: null }, id: { in: individualVideoIds } }
            : { filePath: { not: null }, id: { in: [] } }; // нет ни подписок, ни отдельных — пустой список

    const videoInclude = {
      channel: true,
      watchHistory: true,
      favorites: { where: { userId: session.user.id }, take: 1 } as const,
    };

    const [recentPublished, recentDownloaded, watchedRecords, favoriteRecords, individualRecords] = await Promise.all([
      db.video.findMany({
        where: { ...videoWhereClause, publishedAt: { not: null } },
        include: videoInclude,
        orderBy: { publishedAt: 'desc' },
        take: limit,
      }),
      db.video.findMany({
        where: videoWhereClause,
        include: videoInclude,
        orderBy: { downloadedAt: 'desc' },
        take: limit,
      }),
      db.watchHistory.findMany({
        where: {
          userId: session.user.id,
          video: {
            filePath: { not: null },
            ...(channelIds.length > 0 && individualVideoIds.length > 0
              ? { OR: [{ channelId: { in: channelIds } }, { id: { in: individualVideoIds } }] }
              : channelIds.length > 0
                ? { channelId: { in: channelIds } }
                : individualVideoIds.length > 0
                  ? { id: { in: individualVideoIds } }
                  : { id: { in: [] } }),
          },
        },
        orderBy: { lastWatchedAt: 'desc' },
        take: limit,
        include: {
          video: {
            include: videoInclude,
          },
        },
      }),
      db.favorite.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          video: {
            include: videoInclude,
          },
        },
      }),
      db.userIndividualVideo.findMany({
        where: {
          userId: session.user.id,
          video: { filePath: { not: null } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          video: {
            include: videoInclude,
          },
        },
      }).catch(() => []),
    ]);

    const recentWatched = watchedRecords
      .map((wh) => wh.video)
      .filter((v): v is NonNullable<typeof v> => v != null);

    const favorites = favoriteRecords
      .map((f) => f.video)
      .filter((v): v is NonNullable<typeof v> => v != null && v.filePath != null);

    const individualVideos = individualRecords
      .map((r) => r.video)
      .filter((v): v is NonNullable<typeof v> => v != null && v.filePath != null);

    // Группы по категориям подписок: для каждой категории собираем до `limit` видео
    // из каналов этой категории, отсортированных по дате публикации (publishedAt desc).
    type CategorySection = {
      categoryId: string | null;
      name: string;
      backgroundColor: string | null;
      subscriptionsCount: number;
      channelIds: string[];
    };

    const categoryMap = new Map<string, CategorySection>();

    for (const sub of subscriptions) {
      const key = sub.categoryId ?? UNCATEGORIZED_KEY;
      const existing = categoryMap.get(key);
      if (existing) {
        if (!existing.channelIds.includes(sub.channelId)) {
          existing.channelIds.push(sub.channelId);
        }
        existing.subscriptionsCount += 1;
      } else {
        const baseName =
          sub.category?.name?.trim() ||
          (sub.categoryId ? 'Категория' : 'Без категории');
        categoryMap.set(key, {
          categoryId: sub.categoryId ?? null,
          name: baseName,
          backgroundColor: sub.category?.backgroundColor ?? null,
          subscriptionsCount: 1,
          channelIds: [sub.channelId],
        });
      }
    }

    const rawCategorySections = Array.from(categoryMap.values());

    // Для страницы «Подписки» и медиатеки важно видеть **все** категории,
    // в которых у пользователя есть подписки, даже если в них ещё нет скачанных видео.
    // Поэтому не отфильтровываем категории с пустым списком videos.
    const categorySections = (
      await Promise.all(
        rawCategorySections.map(async (section) => {
          const videos =
            section.channelIds.length === 0
              ? []
              : await db.video.findMany({
                  where: {
                    filePath: { not: null },
                    channelId: { in: section.channelIds },
                    publishedAt: { not: null },
                  },
                  include: videoInclude,
                  orderBy: { publishedAt: 'desc' },
                  take: limit,
                });

          return {
            categoryId: section.categoryId,
            name: section.name,
            backgroundColor: section.backgroundColor,
            subscriptionsCount: section.subscriptionsCount,
            videos,
          };
        })
      )
    ).sort((a, b) => {
      if (b.subscriptionsCount !== a.subscriptionsCount) {
        return b.subscriptionsCount - a.subscriptionsCount;
      }
      return a.name.localeCompare(b.name, 'ru');
    });

    return NextResponse.json(
      jsonSafe({
        recentPublished,
        recentDownloaded,
        recentWatched,
        favorites,
        individualVideos,
        categorySections,
        recentLimit: limit,
      })
    );
  } catch (error: any) {
    console.error('Error fetching video sections:', error);
    const msg = process.env.NODE_ENV === 'development' ? error?.message : 'Failed to fetch sections';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
