import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getChannelVideosSince } from '@/lib/ytdlp';
import { ensureQueueWorker } from '@/lib/queue-worker';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

// POST /api/subscriptions/check - проверить подписки текущего пользователя
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    ensureQueueWorker();
    const subscriptions = await db.subscription.findMany({
      where: { userId: session.user.id, isActive: true },
      include: { channel: true }
    });

    type CheckResult =
      | { channelId: string; channelName: string; checked: number; newFound: number }
      | { channelId: string; channelName: string; error: string };

    const results: CheckResult[] = [];

    const limit = env.subscriptionCheckVideoLimit();
    const concurrency = 3;

    async function checkOne(sub: (typeof subscriptions)[number]): Promise<CheckResult> {
      try {
        // Получаем URL канала
        const channelUrl = `https://www.youtube.com/channel/${sub.channel.platformId}`;
        
        // Видео за период (фильтрует yt-dlp)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - sub.downloadDays);
        const videos = await getChannelVideosSince(channelUrl, cutoffDate, limit);

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

        // Проверяем какие видео ещё не скачаны
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
                status: 'pending'
              }
            });
          }
          enqueued++;
        }

        // Обновляем время последней проверки
        await db.subscription.update({
          where: { id: sub.id },
          data: { lastCheckAt: new Date() }
        });

        return {
          channelId: sub.channelId,
          channelName: sub.channel.name,
          checked: videos.length,
          newFound: enqueued
        };
      } catch (e) {
        console.error(`Error checking subscription ${sub.id}:`, e);
        return {
          channelId: sub.channelId,
          channelName: sub.channel.name,
          error: e instanceof Error ? e.message : 'Unknown error'
        };
      }
    }

    for (let i = 0; i < subscriptions.length; i += concurrency) {
      const chunk = subscriptions.slice(i, i + concurrency);
      const settled = await Promise.allSettled(chunk.map((sub) => checkOne(sub)));
      for (const r of settled) {
        if (r.status === 'fulfilled') results.push(r.value);
        else {
          // checkOne не должен падать, но на всякий случай
          results.push({ channelId: 'unknown', channelName: 'unknown', error: r.reason?.message || String(r.reason) });
        }
      }
    }

    return NextResponse.json({
      success: true,
      checked: subscriptions.length,
      results
    });
  } catch (error) {
    console.error('Error checking subscriptions:', error);
    return NextResponse.json({ error: 'Failed to check subscriptions' }, { status: 500 });
  }
}
