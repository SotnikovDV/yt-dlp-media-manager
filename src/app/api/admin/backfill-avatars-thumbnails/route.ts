import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getDownloadPathAsync } from '@/lib/settings';
import { downloadAndSaveChannelAvatar } from '@/lib/avatars';
import { downloadAndSaveVideoThumbnail } from '@/lib/thumbnails';

export const runtime = 'nodejs';

/**
 * POST /api/admin/backfill-avatars-thumbnails
 * Для каналов с avatarUrl, но без avatarPath — скачивает аватар в avatars/, проставляет avatarPath.
 * Для видео с thumbnailUrl, но без thumbnailPath — скачивает превью в thumbnails/, проставляет thumbnailPath.
 * Только для isAdmin.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { isAdmin?: boolean }).isAdmin !== true) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let channelsUpdated = 0;
  let channelsFailed = 0;
  let videosUpdated = 0;
  let videosFailed = 0;

  try {
    const channels = await db.channel.findMany({
      where: {
        avatarUrl: { not: null },
        avatarPath: null,
      },
      select: { id: true, avatarUrl: true, platformId: true },
    });

    for (const ch of channels) {
      const url = ch.avatarUrl;
      if (!url) continue;
      const avatarPath = await downloadAndSaveChannelAvatar(
        url,
        ch.platformId,
        getDownloadPathAsync
      );
      if (avatarPath) {
        await db.channel.update({
          where: { id: ch.id },
          data: { avatarPath },
        });
        channelsUpdated++;
      } else {
        channelsFailed++;
      }
    }

    const videos = await db.video.findMany({
      where: {
        thumbnailUrl: { not: null },
        thumbnailPath: null,
      },
      select: { id: true, thumbnailUrl: true, platformId: true },
    });

    for (const v of videos) {
      const url = v.thumbnailUrl;
      if (!url) continue;
      const thumbnailPath = await downloadAndSaveVideoThumbnail(
        url,
        v.platformId,
        getDownloadPathAsync
      );
      if (thumbnailPath) {
        await db.video.update({
          where: { id: v.id },
          data: { thumbnailPath },
        });
        videosUpdated++;
      } else {
        videosFailed++;
      }
    }

    return NextResponse.json({
      channelsUpdated,
      channelsFailed,
      channelsTotal: channels.length,
      videosUpdated,
      videosFailed,
      videosTotal: videos.length,
    });
  } catch (error) {
    console.error('Backfill avatars/thumbnails error:', error);
    return NextResponse.json(
      {
        error: 'Failed to backfill',
        channelsUpdated,
        channelsFailed,
        videosUpdated,
        videosFailed,
      },
      { status: 500 }
    );
  }
}
