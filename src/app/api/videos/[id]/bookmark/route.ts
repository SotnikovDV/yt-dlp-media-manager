import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { jsonSafe } from '@/lib/json-safe';

export const runtime = 'nodejs';

const LIMIT_REACHED_MESSAGE =
  'Список «Закрепленные» заполнен. Удалите одно видео из списка, чтобы добавить новое.';

// GET /api/videos/[id]/bookmark — признак закреплённости для текущего пользователя
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
    const resolvedId =
      video?.id ??
      (await db.video.findFirst({ where: { platformId: paramId }, select: { id: true } }))?.id;
    if (!resolvedId) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const bookmark = await db.bookmark.findUnique({
      where: {
        userId_videoId: { userId: session.user.id, videoId: resolvedId },
      },
    });

    return NextResponse.json(jsonSafe({ isBookmarked: !!bookmark }));
  } catch (error) {
    console.error('Error fetching bookmark state:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bookmark state' },
      { status: 500 }
    );
  }
}

// PATCH /api/videos/[id]/bookmark — закрепить или открепить видео
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
    const videoId =
      video?.id ??
      (await db.video.findFirst({ where: { platformId: paramId }, select: { id: true } }))?.id;
    if (!videoId) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const isBookmarked =
      typeof body.isBookmarked === 'boolean' ? body.isBookmarked : true;

    if (isBookmarked) {
      const limit = env.mediaLibraryRecentLimit();
      const existing = await db.bookmark.findUnique({
        where: {
          userId_videoId: { userId: session.user.id, videoId },
        },
      });
      if (!existing) {
        const count = await db.bookmark.count({
          where: { userId: session.user.id },
        });
        if (count >= limit) {
          return NextResponse.json(
            jsonSafe({
              error: LIMIT_REACHED_MESSAGE,
              limitReached: true,
            }),
            { status: 409 }
          );
        }
      }
      await db.bookmark.upsert({
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
      await db.bookmark.deleteMany({
        where: {
          userId: session.user.id,
          videoId,
        },
      });
    }

    return NextResponse.json(jsonSafe({ isBookmarked }));
  } catch (error) {
    console.error('Error updating bookmark:', error);
    return NextResponse.json(
      { error: 'Failed to update bookmark' },
      { status: 500 }
    );
  }
}
