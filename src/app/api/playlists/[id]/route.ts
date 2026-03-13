import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { jsonSafe } from '@/lib/json-safe';

export const runtime = 'nodejs';

/** PATCH /api/playlists/[id] — обновить плейлист (название и/или состав, для владельца) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: playlistId } = await params;

    const existing = await db.playlist.findFirst({
      where: { id: playlistId, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    const rawVideoIds = Array.isArray(body.videoIds) ? body.videoIds : undefined;
    let videoIds: string[] | undefined;
    if (rawVideoIds !== undefined) {
      const requested = rawVideoIds.filter((id: unknown): id is string => typeof id === 'string').slice(0, 500);
      const found = await db.video.findMany({
        where: { id: { in: requested } },
        select: { id: true },
      });
      const foundIds = new Set(found.map((v) => v.id));
      // Сохраняем порядок из запроса: findMany возвращает строки в произвольном порядке
      videoIds = requested.filter((id) => foundIds.has(id));
    }

    if (videoIds !== undefined) {
      await db.playlistVideo.deleteMany({ where: { playlistId } });
      if (videoIds.length > 0) {
        await db.playlistVideo.createMany({
          data: videoIds.map((videoId, position) => ({
            playlistId,
            videoId,
            position,
          })),
        });
      }
    }

    const playlist = await db.playlist.update({
      where: { id: playlistId },
      data: name !== undefined ? { name } : {},
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
    console.error('Error updating playlist:', error);
    return NextResponse.json(
      { error: 'Failed to update playlist' },
      { status: 500 }
    );
  }
}

/** GET /api/playlists/[id] — получить плейлист текущего пользователя (полное содержимое) */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: playlistId } = await params;

    const playlist = await db.playlist.findFirst({
      where: { id: playlistId, userId: session.user.id },
      include: {
        videos: {
          orderBy: { position: 'asc' },
          include: {
            video: true,
          },
        },
      },
    });

    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const result = jsonSafe({
      id: playlist.id,
      name: playlist.name,
      createdAt: playlist.createdAt,
      shareEnabled: playlist.shareEnabled,
      shareToken: playlist.shareToken,
      videos: playlist.videos.map((pv) => pv.video),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching playlist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlist' },
      { status: 500 }
    );
  }
}

/** DELETE /api/playlists/[id] — удалить плейлист */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: playlistId } = await params;

    const existing = await db.playlist.findFirst({
      where: { id: playlistId, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    await db.playlist.delete({ where: { id: playlistId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    return NextResponse.json(
      { error: 'Failed to delete playlist' },
      { status: 500 }
    );
  }
}
