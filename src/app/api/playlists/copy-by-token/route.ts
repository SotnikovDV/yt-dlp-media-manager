import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { jsonSafe } from '@/lib/json-safe';

export const runtime = 'nodejs';

/** POST /api/playlists/copy-by-token — скопировать плейлист по токену публичной ссылки текущему пользователю */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token : null;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const source = await db.playlist.findFirst({
      where: { shareToken: token, shareEnabled: true },
      include: {
        videos: {
          orderBy: { position: 'asc' },
          select: { videoId: true },
        },
      },
    });

    if (!source) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const videoIds = source.videos.map((v) => v.videoId);

    const copy = await db.playlist.create({
      data: {
        userId: session.user.id,
        name: source.name,
        videos: {
          create: videoIds.map((videoId, position) => ({ videoId, position })),
        },
      },
      include: {
        videos: { orderBy: { position: 'asc' }, select: { videoId: true } },
      },
    });

    const result = jsonSafe({
      id: copy.id,
      name: copy.name,
      createdAt: copy.createdAt,
      videoIds: copy.videos.map((v) => v.videoId),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error copying playlist by token:', error);
    return NextResponse.json(
      { error: 'Failed to copy playlist' },
      { status: 500 }
    );
  }
}

