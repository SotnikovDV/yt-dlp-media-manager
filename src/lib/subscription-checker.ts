import { db } from '@/lib/db';
import { getChannelVideosSince, buildYouTubeChannelUrl, isPermanentDownloadError } from '@/lib/ytdlp';
import { env } from '@/lib/env';

/** Subscription с включённым channel для проверки */
export type SubscriptionWithChannel = Awaited<
  ReturnType<typeof db.subscription.findFirst<{ include: { channel: true } }>>
> extends infer T
  ? T extends null
    ? never
    : T
  : never;

export type CheckResult =
  | { channelId: string; channelName: string; checked: number; newFound: number }
  | { channelId: string; channelName: string; error: string };

/**
 * Проверяет подписку на новые видео и добавляет их в очередь загрузок.
 * При ошибке не обновляет lastCheckAt — чтобы повторить при следующем тике.
 */
export async function checkSubscription(sub: SubscriptionWithChannel): Promise<CheckResult> {
  try {
    const platformId = sub.channel.platformId;
    if (!platformId?.trim()) {
      return {
        channelId: sub.channelId,
        channelName: sub.channel.name,
        error: 'Channel platformId is empty. Delete and re-add the subscription to fix.',
      };
    }
    const channelUrl = buildYouTubeChannelUrl(platformId);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - sub.downloadDays);
    const limit = env.subscriptionCheckVideoLimit();
    const videos = await getChannelVideosSince(channelUrl, cutoffDate, limit);

    if (videos.length === 0) {
      console.warn('[subscription-checker]', sub.channel.name, 'yt-dlp returned 0 videos (channel:', channelUrl, 'cutoff:', cutoffDate.toISOString().slice(0, 10), ')');
    }

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
        select: { id: true, url: true, status: true, createdAt: true, errorMsg: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const downloadedSet = new Set(downloadedVideos.map((v) => v.platformId));
    const activeStatuses = new Set(['pending', 'downloading', 'processing', 'paused']);
    const score = (status: string) => (activeStatuses.has(status) ? 3 : status === 'failed' ? 2 : 1);

    const taskByUrl = new Map<
      string,
      { id: string; status: string; createdAt: Date; errorMsg: string | null }
    >();
    for (const t of existingTasks) {
      const prev = taskByUrl.get(t.url);
      if (!prev) {
        taskByUrl.set(t.url, t);
        continue;
      }
      const prevScore = score(prev.status);
      const nextScore = score(t.status);
      if (nextScore > prevScore || (nextScore === prevScore && t.createdAt > prev.createdAt)) {
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

      // Не перезапускаем задачи с постоянной ошибкой (members-only, private, удалено и т.п.)
      if (
        existingTask &&
        existingTask.status === 'failed' &&
        isPermanentDownloadError(existingTask.errorMsg ?? '')
      ) {
        continue;
      }

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
            subscriptionId: sub.id,
          },
        });
      }
      enqueued++;
    }

    await db.subscription.update({
      where: { id: sub.id },
      data: { lastCheckAt: new Date() },
    });

    return {
      channelId: sub.channelId,
      channelName: sub.channel.name,
      checked: videos.length,
      newFound: enqueued,
    };
  } catch (e) {
    console.error(`Error checking subscription ${sub.id}:`, e);
    return {
      channelId: sub.channelId,
      channelName: sub.channel.name,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}
