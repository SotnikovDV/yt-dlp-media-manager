import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { jsonSafe } from '@/lib/json-safe';

export const runtime = 'nodejs';

// GET /api/videos/[id]/favorite — признак избранного для текущего пользователя
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: paramId } = await params;

    const video = await db.video.findUnique({
      where: { id: paramId },
      select: { id: true },
    });
    const resolvedId = video?.id ?? (await db.video.findFirst({ where: { platformId: paramId }, select: { id: true } }))?.id;
    if (!resolvedId) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const fav = await db.favorite.findUnique({
      where: {
        userId_videoId: { userId: session.user.id, videoId: resolvedId },
      },
    });

    return NextResponse.json(jsonSafe({ isFavorite: !!fav }));
  } catch (error) {
    console.error('Error fetching favorite state:', error);
    return NextResponse.json(
      { error: 'Failed to fetch favorite state' },
      { status: 500 }
    );
  }
}

// PATCH /api/videos/[id]/favorite — установить или снять избранное
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: paramId } = await params;

    const video = await db.video.findUnique({
      where: { id: paramId },
      select: { id: true },
    });
    const videoId = video?.id ?? (await db.video.findFirst({ where: { platformId: paramId }, select: { id: true } }))?.id;
    if (!videoId) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const isFavorite = typeof body.isFavorite === 'boolean' ? body.isFavorite : true;

    if (isFavorite) {
      await db.favorite.upsert({
        where: {
          userId_videoId: { userId: session.user.id, videoId },
        },
        create: {
          userId: session.user.id,
          videoId,
        },
        update: {},
      });
    } else {
      await db.favorite.deleteMany({
        where: {
          userId: session.user.id,
          videoId,
        },
      });
    }

    return NextResponse.json(jsonSafe({ isFavorite }));
  } catch (error) {
    console.error('Error updating favorite:', error);
    return NextResponse.json(
      { error: 'Failed to update favorite' },
      { status: 500 }
    );
  }
}
