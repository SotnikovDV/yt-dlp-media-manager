import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { jsonSafe } from '@/lib/json-safe';

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
    const channelId = searchParams.get('channelId') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const tagId = searchParams.get('tagId') || '';
    const quality = searchParams.get('quality') || '';
    const sort = searchParams.get('sort') || 'downloadedAt';

    const skip = (page - 1) * limit;

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

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } }
      ];
    }

    if (tagId) {
      where.videoTags = { some: { tagId } };
    }

    if (quality) {
      where.quality = quality;
    }

    const orderBy: Prisma.VideoOrderByWithRelationInput =
      sort === 'publishedAt'
        ? { publishedAt: 'desc' }
        : { downloadedAt: 'desc' };

    const [videos, total] = await Promise.all([
      db.video.findMany({
        where,
        include: {
          channel: true,
          watchHistory: userId ? { where: { userId }, take: 1 } : false,
          favorites: userId ? { where: { userId }, take: 1 } : false,
          bookmarks: userId ? { where: { userId }, take: 1 } : false,
          pins: userId ? { where: { userId }, take: 1 } : false,
        },
        orderBy,
        skip,
        take: limit
      }),
      db.video.count({ where })
    ]);

    return NextResponse.json(
      jsonSafe({
        videos,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      })
    );
  } catch (error) {
    console.error('Error fetching videos:', error);
    return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 });
  }
}
