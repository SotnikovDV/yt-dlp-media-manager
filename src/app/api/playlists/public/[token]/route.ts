import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jsonSafe } from '@/lib/json-safe';

export const runtime = 'nodejs';

/** GET /api/playlists/public/[token] — публичный просмотр плейлиста по токену (только чтение) */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const playlist = await db.playlist.findFirst({
      where: { shareToken: token, shareEnabled: true },
      include: {
        user: {
          select: { id: true, name: true, username: true },
        },
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
      owner: {
        id: playlist.user.id,
        name: playlist.user.name ?? playlist.user.username ?? null,
      },
      videos: playlist.videos.map((pv) => pv.video),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching public playlist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlist' },
      { status: 500 }
    );
  }
}

