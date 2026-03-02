import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { jsonSafe } from '@/lib/json-safe';

export const runtime = 'nodejs';

// GET /api/videos/[id]/watch — позиция просмотра текущего пользователя для видео
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: videoId } = await params;

    const video = await db.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    });
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const record = await db.watchHistory.findUnique({
      where: {
        userId_videoId: { userId: session.user.id, videoId },
      },
      select: { position: true, completed: true, lastWatchedAt: true },
    });

    return NextResponse.json(
      jsonSafe({
        position: record?.position ?? 0,
        completed: record?.completed ?? false,
        lastWatchedAt: record?.lastWatchedAt ?? null,
      })
    );
  } catch (error) {
    console.error('Error fetching watch position:', error);
    return NextResponse.json(
      { error: 'Failed to fetch watch position' },
      { status: 500 }
    );
  }
}

// PATCH /api/videos/[id]/watch — сохранить позицию просмотра
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: videoId } = await params;

    const video = await db.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    });
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const position = typeof body.position === 'number' ? Math.max(0, Math.floor(body.position)) : 0;
    const completed = typeof body.completed === 'boolean' ? body.completed : undefined;

    await db.watchHistory.upsert({
      where: {
        userId_videoId: { userId: session.user.id, videoId },
      },
      create: {
        userId: session.user.id,
        videoId,
        position,
        completed: completed ?? false,
        watchCount: 1,
        lastWatchedAt: new Date(),
      },
      update: {
        position,
        lastWatchedAt: new Date(),
        ...(completed !== undefined && { completed }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving watch position:', error);
    return NextResponse.json(
      { error: 'Failed to save watch position' },
      { status: 500 }
    );
  }
}
