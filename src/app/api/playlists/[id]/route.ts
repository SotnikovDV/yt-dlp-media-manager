import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { jsonSafe } from '@/lib/json-safe';

export const runtime = 'nodejs';

/** PATCH /api/playlists/[id] — обновить плейлист (название и/или состав) */
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
      const existing = await db.video.findMany({
        where: { id: { in: requested } },
        select: { id: true },
      });
      videoIds = existing.map((v) => v.id);
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
