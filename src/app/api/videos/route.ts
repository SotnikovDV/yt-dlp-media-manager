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
    const pageRaw = parseInt(searchParams.get('page') || '1');
    const limitRaw = parseInt(searchParams.get('limit') || '20');
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
    const search = searchParams.get('search') || '';
    const channelId = searchParams.get('channelId') || '';
    const quality = searchParams.get('quality') || '';
    const sort = searchParams.get('sort') || 'downloadedAt';

    const skip = (page - 1) * limit;

    const where: Prisma.VideoWhereInput = {
      filePath: { not: null }
    };

    // Режим «Отдельные видео»: только видео, запрошенные текущим пользователем через UserIndividualVideo
    if (channelId === '__individual__') {
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      where.userIndividualVideos = { some: { userId: session.user.id } };
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
