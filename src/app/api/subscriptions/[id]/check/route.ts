import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getChannelVideosSince } from '@/lib/ytdlp';
import { ensureQueueWorker } from '@/lib/queue-worker';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * POST /api/subscriptions/[id]/check
 * Проверить подписку на новые видео и добавить их в очередь загрузок (только свою подписку).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    ensureQueueWorker();

    const sub = await db.subscription.findFirst({
      where: { id, userId: session.user.id },
      include: { channel: true },
    });

    if (!sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const channelUrl = `https://www.youtube.com/channel/${sub.channel.platformId}`;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - sub.downloadDays);

    console.log('[check]', sub.channel.name, 'url:', channelUrl, 'days:', sub.downloadDays, 'cutoff:', cutoffDate.toISOString().slice(0, 10));
    const limit = env.subscriptionCheckVideoLimit();
    const videos = await getChannelVideosSince(channelUrl, cutoffDate, limit);
    console.log('[check]', sub.channel.name, 'videos from yt-dlp:', videos.length);

    const videoIds = Array.from(
      new Set(
        videos
          .map((v) => v.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );
    const urls = videoIds.map((videoId) => `https://www.youtube.com/watch?v=${videoId}`);

    const [downloadedVideos, existingTasks] = await Promise.all([
      db.video.findMany({
        where: { platformId: { in: videoIds }, filePath: { not: null } },
        select: { platformId: true },
      }),
      db.downloadTask.findMany({
        where: { url: { in: urls } },
        select: { id: true, url: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const downloadedSet = new Set(downloadedVideos.map((v) => v.platformId));

    const activeStatuses = new Set(['pending', 'downloading', 'processing', 'paused']);
    const score = (status: string) => (activeStatuses.has(status) ? 3 : status === 'failed' ? 2 : 1);

    const taskByUrl = new Map<string, { id: string; status: string; createdAt: Date }>();
    for (const t of existingTasks) {
      const prev = taskByUrl.get(t.url);
      if (!prev) {
        taskByUrl.set(t.url, t);
        continue;
      }
      const prevScore = score(prev.status);
      const nextScore = score(t.status);
      if (nextScore > prevScore) {
        taskByUrl.set(t.url, t);
      } else if (nextScore === prevScore && t.createdAt > prev.createdAt) {
        taskByUrl.set(t.url, t);
      }
    }

    let enqueued = 0;
    for (const v of videos) {
      const videoId = v.id;
      if (!videoId) continue;
      if (downloadedSet.has(videoId)) continue;

      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const existingTask = taskByUrl.get(url);
      if (existingTask && activeStatuses.has(existingTask.status)) continue;

      if (existingTask && existingTask.status === 'failed') {
        await db.downloadTask.update({
          where: { id: existingTask.id },
          data: { status: 'pending', errorMsg: null, progress: 0 },
        });
      } else if (!existingTask) {
        await db.downloadTask.create({
          data: {
            url,
            title: v.title || 'Video',
            quality: sub.preferredQuality || 'best',
            format: 'mp4',
            status: 'pending',
          },
        });
      }
      enqueued++;
    }

    await db.subscription.update({
      where: { id: sub.id },
      data: { lastCheckAt: new Date() },
    });

    console.log('[check]', sub.channel.name, 'enqueued:', enqueued);
    return NextResponse.json({
      success: true,
      channelName: sub.channel.name,
      checked: videos.length,
      newFound: enqueued,
    });
  } catch (error: any) {
    console.error('Error checking subscription:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to check subscription' },
      { status: 500 }
    );
  }
}
