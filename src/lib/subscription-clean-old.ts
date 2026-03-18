import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { resolveVideoFilePath } from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';
import { cancelDownload } from '@/lib/ytdlp';

const THUMB_EXT = ['.jpg', '.webp', '.png', '.jpeg'];

export type CleanOldOptions = {
  skipFavoritesForUserId?: string | null;
  /** Если true — не удалять видео, у которых есть хотя бы один пин от любого пользователя */
  skipPinned?: boolean;
};

export async function cleanOldVideosForSubscription(
  subscriptionId: string,
  olderThanDays: number,
  options: CleanOldOptions = {},
) {
  if (olderThanDays < 0) {
    throw new Error('olderThanDays must be >= 0');
  }

  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { channel: true },
  });
  if (!sub) {
    throw new Error('Subscription not found');
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const favoriteFilter =
    options.skipFavoritesForUserId != null
      ? {
          favorites: {
            none: {
              userId: options.skipFavoritesForUserId,
            },
          },
        }
      : {};

  // Если видео пометил "Не очищать" хотя бы один пользователь — не удалять
  const pinFilter = options.skipPinned !== false
    ? { pins: { none: {} } }
    : {};

  const videos = await db.video.findMany({
    where: {
      channelId: sub.channelId,
      publishedAt: { not: null, lt: cutoffDate },
      ...favoriteFilter,
      ...pinFilter,
    },
    select: { id: true, filePath: true, platformId: true },
  });

  if (videos.length === 0) {
    return { deletedVideos: 0, deletedTasks: 0, filesRemoved: 0 };
  }

  const videoIds = videos.map((v) => v.id);
  const urls = videos.map((v) => `https://www.youtube.com/watch?v=${v.platformId}`);

  const tasksToRemove = await db.downloadTask.findMany({
    where: {
      OR: [{ videoId: { in: videoIds } }, { url: { in: urls } }],
    },
    select: { id: true, status: true },
  });

  for (const t of tasksToRemove) {
    if (t.status === 'downloading' || t.status === 'processing') {
      try {
        cancelDownload(t.id);
      } catch {
        // ignore
      }
    }
  }

  const deleteTasksResult = await db.downloadTask.deleteMany({
    where: {
      OR: [{ videoId: { in: videoIds } }, { url: { in: urls } }],
    },
  });
  const deletedTasks = deleteTasksResult.count;

  let filesRemoved = 0;
  for (const v of videos) {
    if (!v.filePath) continue;

    const filePath = await resolveVideoFilePath(v.filePath, getDownloadPathAsync, v.platformId);
    if (!existsSync(filePath)) continue;

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
    } catch {
      // ignore single-file errors
    }
  }

  await db.video.deleteMany({
    where: { id: { in: videoIds } },
  });

  return {
    deletedVideos: videos.length,
    deletedTasks,
    filesRemoved,
  };
}

