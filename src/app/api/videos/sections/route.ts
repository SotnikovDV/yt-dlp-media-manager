import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { jsonSafe } from '@/lib/json-safe';

export const runtime = 'nodejs';

const MAX_LIMIT = 50;

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
        select: { channelId: true },
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

    const [recentDownloaded, watchedRecords, favoriteRecords, individualRecords] = await Promise.all([
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

    return NextResponse.json(
      jsonSafe({
        recentDownloaded,
        recentWatched,
        favorites,
        individualVideos,
      })
    );
  } catch (error: any) {
    console.error('Error fetching video sections:', error);
    const msg = process.env.NODE_ENV === 'development' ? error?.message : 'Failed to fetch sections';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
