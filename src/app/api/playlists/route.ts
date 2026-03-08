import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { jsonSafe } from '@/lib/json-safe';

export const runtime = 'nodejs';

/** GET /api/playlists — список плейлистов текущего пользователя */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const playlists = await db.playlist.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
      include: {
        videos: { orderBy: { position: 'asc' }, select: { videoId: true } },
      },
    });

    const result = playlists.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      videoIds: p.videos.map((v) => v.videoId),
    }));

    return NextResponse.json(jsonSafe({ playlists: result }));
  } catch (error) {
    console.error('Error fetching playlists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlists' },
      { status: 500 }
    );
  }
}

/** POST /api/playlists — создать плейлист */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() || 'Новый плейлист' : 'Новый плейлист';
    const rawIds = Array.isArray(body.videoIds) ? body.videoIds : [];
    const requestedIds = rawIds.filter((id: unknown): id is string => typeof id === 'string').slice(0, 500);
    const existingVideos = await db.video.findMany({
      where: { id: { in: requestedIds } },
      select: { id: true },
    });
    const videoIds = existingVideos.map((v) => v.id);

    const playlist = await db.playlist.create({
      data: {
        userId: session.user.id,
        name,
        videos: {
          create: videoIds.map((videoId, position) => ({ videoId, position })),
        },
      },
      include: {
        videos: { orderBy: { position: 'asc' }, select: { videoId: true } },
      },
    });

    const result = {
      id: playlist.id,
      name: playlist.name,
      createdAt: playlist.createdAt,
      videoIds: playlist.videos.map((v) => v.videoId),
    };

    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    console.error('Error creating playlist:', error);
    return NextResponse.json(
      { error: 'Failed to create playlist' },
      { status: 500 }
    );
  }
}
