import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// PATCH /api/videos/[id]/pin — установить/снять признак "Не очищать"
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
    const pinned = typeof body.pinned === 'boolean' ? body.pinned : null;
    if (pinned === null) {
      return NextResponse.json({ error: 'pinned (boolean) is required' }, { status: 400 });
    }

    if (pinned) {
      await db.videoPin.upsert({
        where: { userId_videoId: { userId: session.user.id, videoId } },
        create: { userId: session.user.id, videoId },
        update: {},
      });
    } else {
      await db.videoPin.deleteMany({
        where: { userId: session.user.id, videoId },
      });
    }

    return NextResponse.json({ success: true, pinned });
  } catch (error) {
    console.error('Error toggling video pin:', error);
    return NextResponse.json({ error: 'Failed to toggle pin' }, { status: 500 });
  }
}
