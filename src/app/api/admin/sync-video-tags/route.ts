import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getTagsForVideo } from '@/lib/read-info-chapters';
import { getDownloadPathAsync } from '@/lib/settings';
import { syncVideoTagsFromNames } from '@/lib/sync-video-tags';

export const runtime = 'nodejs';

/**
 * POST /api/admin/sync-video-tags
 * Для всех скачанных видео (с filePath) читает теги из .info.json и синхронизирует с БД (Tag, VideoTag).
 * Только для isAdmin.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { isAdmin?: boolean }).isAdmin !== true) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let processed = 0;
  let totalAdded = 0;
  let totalRemoved = 0;
  let failed = 0;

  try {
    const videos = await db.video.findMany({
      where: { filePath: { not: null } },
      select: { id: true, filePath: true, platformId: true },
    });

    for (const video of videos) {
      const filePath = video.filePath;
      if (!filePath) continue;
      try {
        const tags = await getTagsForVideo(
          { filePath, platformId: video.platformId },
          getDownloadPathAsync
        );
        const result = await syncVideoTagsFromNames(video.id, tags);
        processed++;
        totalAdded += result.added;
        totalRemoved += result.removed;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({
      processed,
      totalAdded,
      totalRemoved,
      failed,
      total: videos.length,
    });
  } catch (error) {
    console.error('Admin sync-video-tags error:', error);
    return NextResponse.json(
      { error: 'Failed to sync video tags' },
      { status: 500 }
    );
  }
}
