import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { jsonSafe } from '@/lib/json-safe';
import crypto from 'crypto';

export const runtime = 'nodejs';

type ShareBody = {
  action?: 'get' | 'enable' | 'regenerate' | 'disable';
};

/** POST /api/playlists/[id]/share — включить/выключить общий доступ и получить ссылку */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: playlistId } = await params;
    const body = (await request.json().catch(() => ({}))) as ShareBody;
    const action = body.action ?? 'get';

    const existing = await db.playlist.findFirst({
      where: { id: playlistId, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    let updated = existing;

    if (action === 'enable') {
      let shareToken = existing.shareToken;
      if (!shareToken) {
        shareToken = crypto.randomBytes(16).toString('base64url');
      }
      updated = await db.playlist.update({
        where: { id: playlistId },
        data: {
          shareEnabled: true,
          shareToken,
        },
      });
    } else if (action === 'regenerate') {
      const shareToken = crypto.randomBytes(16).toString('base64url');
      updated = await db.playlist.update({
        where: { id: playlistId },
        data: {
          shareEnabled: true,
          shareToken,
        },
      });
    } else if (action === 'disable') {
      updated = await db.playlist.update({
        where: { id: playlistId },
        data: {
          shareEnabled: false,
          shareToken: null,
        },
      });
    }

    const baseUrl = env.baseUrl();

    const shareUrl =
      updated.shareEnabled && updated.shareToken && baseUrl
        ? `${baseUrl.replace(/\/+$/, '')}/playlist/shared/${updated.shareToken}`
        : null;

    return NextResponse.json(
      jsonSafe({
        id: updated.id,
        shareEnabled: updated.shareEnabled,
        shareToken: updated.shareToken,
        shareUrl,
      })
    );
  } catch (error) {
    console.error('Error updating playlist sharing:', error);
    return NextResponse.json(
      { error: 'Failed to update playlist sharing' },
      { status: 500 }
    );
  }
}

