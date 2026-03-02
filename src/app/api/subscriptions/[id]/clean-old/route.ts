import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { resolveVideoFilePath } from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';
import { cancelDownload } from '@/lib/ytdlp';

export const runtime = 'nodejs';

const THUMB_EXT = ['.jpg', '.webp', '.png', '.jpeg'];

/**
 * POST /api/subscriptions/[id]/clean-old
 * Удаляет старые видео подписки (канала): по сроку давности в днях удаляются
 * записи в БД, файлы на диске и соответствующие задачи в очереди загрузок.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const olderThanDays = typeof body.olderThanDays === 'number' ? body.olderThanDays : 30;
    if (olderThanDays < 0) {
      return NextResponse.json({ error: 'olderThanDays must be >= 0' }, { status: 400 });
    }

    const sub = await db.subscription.findFirst({
      where: { id, userId: session.user.id },
      include: { channel: true },
    });

    if (!sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const videos = await db.video.findMany({
      where: {
        channelId: sub.channelId,
        publishedAt: { not: null, lt: cutoffDate },
      },
      select: { id: true, filePath: true, platformId: true },
    });

    const videoIds = videos.map((v) => v.id);
    const urls = videos.map((v) => `https://www.youtube.com/watch?v=${v.platformId}`);

    const tasksToRemove = await db.downloadTask.findMany({
      where: {
        OR: [
          { videoId: { in: videoIds } },
          { url: { in: urls } },
        ],
      },
      select: { id: true, status: true },
    });

    for (const t of tasksToRemove) {
      if (t.status === 'downloading' || t.status === 'processing') {
        try {
          cancelDownload(t.id);
        } catch (e) {
          console.warn('cancelDownload:', e);
        }
      }
    }

    const deleteTasksResult = await db.downloadTask.deleteMany({
      where: {
        OR: [
          { videoId: { in: videoIds } },
          { url: { in: urls } },
        ],
      },
    });
    const deletedTasks = deleteTasksResult.count;

    let filesRemoved = 0;
    for (const v of videos) {
      if (v.filePath) {
        const filePath = await resolveVideoFilePath(
          v.filePath,
          getDownloadPathAsync,
          v.platformId
        );
        if (existsSync(filePath)) {
          try {
            await unlink(filePath);
            filesRemoved++;
            const base = path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)));
            for (const ext of THUMB_EXT) {
              const p = base + ext;
              if (existsSync(p)) {
                await unlink(p);
                filesRemoved++;
              }
            }
            const infoPath = base + '.info.json';
            if (existsSync(infoPath)) {
              await unlink(infoPath);
              filesRemoved++;
            }
          } catch (e) {
            console.warn('Error removing file:', filePath, e);
          }
        }
      }
    }

    await db.video.deleteMany({
      where: { id: { in: videoIds } },
    });

    return NextResponse.json({
      success: true,
      deletedVideos: videos.length,
      deletedTasks,
      filesRemoved,
    });
  } catch (error: any) {
    console.error('Error in clean-old:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to clean old videos' },
      { status: 500 }
    );
  }
}
