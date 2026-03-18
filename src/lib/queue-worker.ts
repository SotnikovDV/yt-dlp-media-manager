import path from 'path';
import { db } from '@/lib/db';
import { downloadVideo, getVideoInfo } from '@/lib/ytdlp';
import { stat } from 'fs/promises';
import { requireDownloadDeps } from '@/lib/deps';
import { getDownloadPath, getDownloadPathAsync } from '@/lib/settings';
import { env } from '@/lib/env';
import { toRelativeFilePath } from '@/lib/path-utils';
import { downloadAndSaveChannelAvatar } from '@/lib/avatars';
import { downloadAndSaveVideoThumbnail } from '@/lib/thumbnails';
import { checkSubscription } from '@/lib/subscription-checker';
import { writeQueueLog } from '@/lib/queue-logger';
import { sendTelegramAdminNotification } from '@/lib/telegram';
import { cleanOldVideosForSubscription } from '@/lib/subscription-clean-old';
import { getTagsForVideo } from '@/lib/read-info-chapters';
import { syncVideoTagsFromNames } from '@/lib/sync-video-tags';

const CLEANUP_TICK_INTERVAL = 20; // очистка старых completed раз в ~60 сек (tick каждые 3 сек)
const COMPLETED_KEEP_HOURS = 24;

/** Минимальный интервал (мс) между обновлениями прогресса в БД — снижает нагрузку на SQLite */
const PROGRESS_UPDATE_INTERVAL_MS = 2000;

/** Последнее время обновления прогресса по taskId (для троттлинга) */
const lastProgressUpdate = new Map<string, number>();

const PRISMA_TIMEOUT_CODES = ['P1008', 'P2024'] as const;

function isTimeoutError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  if (PRISMA_TIMEOUT_CODES.includes(err?.code as (typeof PRISMA_TIMEOUT_CODES)[number])) return true;
  const msg = String(err?.message ?? '').toLowerCase();
  return msg.includes('timeout') || msg.includes('socket timeout');
}

async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      if (i < maxRetries - 1 && isTimeoutError(e)) {
        await new Promise((r) => setTimeout(r, 300 + i * 200));
        continue;
      }
      throw e;
    }
  }
  throw new Error('withDbRetry: unreachable');
}

declare global {
  // eslint-disable-next-line no-var
  var __ydmmQueueWorker:
    | {
        started: boolean;
        ready?: Promise<void>;
        interval?: NodeJS.Timeout;
        subSchedulerInterval?: NodeJS.Timeout;
        running: boolean;
        tickCount: number;
      }
    | undefined;
}

function getState() {
  if (!globalThis.__ydmmQueueWorker) {
    globalThis.__ydmmQueueWorker = { started: false, running: false, tickCount: 0 };
  }
  return globalThis.__ydmmQueueWorker;
}

async function ensureVideoAndChannelForUrl(url: string) {
  const info = await getVideoInfo(url);
  const platformChannelId =
    info.channel_id ||
    info.uploader_id ||
    (info.uploader ? `uploader:${info.uploader}` : '');

  if (!platformChannelId) {
    throw new Error('Failed to determine channel id from metadata.');
  }

  const channelName = info.channel || info.uploader || 'Unknown';

  const channel = await db.channel.upsert({
    where: { platformId: platformChannelId },
    create: {
      platform: 'youtube',
      platformId: platformChannelId,
      name: channelName,
      avatarUrl: info.thumbnails?.[0]?.url,
      lastCheckedAt: new Date(),
    },
    update: {
      name: channelName,
      lastCheckedAt: new Date(),
    },
  });

  const channelAvatarUrl = info.thumbnails?.[0]?.url;
  if (channelAvatarUrl) {
    const avatarPath = await downloadAndSaveChannelAvatar(
      channelAvatarUrl,
      platformChannelId,
      getDownloadPathAsync
    );
    if (avatarPath) {
      await db.channel.update({
        where: { id: channel.id },
        data: { avatarPath },
      });
    }
  }

  const existingVideo = await db.video.findUnique({
    where: { platformId: info.id },
  });

  const thumbnailUrl = info.thumbnail || `https://img.youtube.com/vi/${info.id}/maxresdefault.jpg`;
  let thumbnailPath: string | null = null;
  if (!existingVideo) {
    thumbnailPath = await downloadAndSaveVideoThumbnail(
      thumbnailUrl,
      info.id,
      getDownloadPathAsync
    );
  }

  const video =
    existingVideo ??
    (await db.video.create({
      data: {
        platformId: info.id,
        channelId: channel.id,
        title: info.title,
        description: info.description?.slice(0, 2000),
        duration: info.duration,
        thumbnailUrl,
        thumbnailPath,
        viewCount: info.view_count ? BigInt(info.view_count) : null,
        publishedAt: info.upload_date
          ? new Date(
              parseInt(info.upload_date.slice(0, 4)),
              parseInt(info.upload_date.slice(4, 6)) - 1,
              parseInt(info.upload_date.slice(6, 8))
            )
          : null,
      },
    }));

  return { info, video };
}

async function isQueuePaused(): Promise<boolean> {
  try {
    const s = await db.setting.findUnique({ where: { key: 'queuePaused' }, select: { value: true } });
    return s?.value === 'true';
  } catch {
    return false;
  }
}

const SUBSCRIPTION_SCHEDULER_CONCURRENCY = 3;
const DUE_CANDIDATES_MIN_AGE_MS = 60 * 60 * 1000; // 1 час — кандидаты для фильтрации по checkInterval
const DUE_TAKE_LIMIT = 20;

async function runAutoDeleteSubscriptions() {
  const subs = await db.subscription.findMany({
    where: {
      isActive: true,
      autoDeleteDays: { gt: 0 },
    },
    select: { id: true, autoDeleteDays: true, userId: true },
    take: DUE_TAKE_LIMIT,
  });

  if (subs.length === 0) return;

  let totalDeletedVideos = 0;
  let totalDeletedTasks = 0;
  let totalFilesRemoved = 0;

  for (let i = 0; i < subs.length; i += SUBSCRIPTION_SCHEDULER_CONCURRENCY) {
    const chunk = subs.slice(i, i + SUBSCRIPTION_SCHEDULER_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((sub) =>
        cleanOldVideosForSubscription(sub.id, sub.autoDeleteDays, {
          skipFavoritesForUserId: sub.userId,
          skipPinned: true,
        }),
      ),
    );

    results.forEach((res, idx) => {
      const sub = chunk[idx];
      if (res.status === 'fulfilled') {
        const { deletedVideos, deletedTasks, filesRemoved } = res.value;
        totalDeletedVideos += deletedVideos;
        totalDeletedTasks += deletedTasks;
        totalFilesRemoved += filesRemoved;
        if (deletedVideos > 0 || deletedTasks > 0 || filesRemoved > 0) {
          writeQueueLog('info', 'subscription_auto_delete', {
            subscriptionId: sub.id,
            autoDeleteDays: sub.autoDeleteDays,
            deletedVideos,
            deletedTasks,
            filesRemoved,
          });
        }
      } else {
        writeQueueLog('error', 'subscription_auto_delete_failed', {
          subscriptionId: sub.id,
          autoDeleteDays: sub.autoDeleteDays,
          error: String(res.reason),
        });
      }
    });
  }

  writeQueueLog('info', 'subscription_auto_delete_batch', {
    subscriptionsProcessed: subs.length,
    deletedVideos: totalDeletedVideos,
    deletedTasks: totalDeletedTasks,
    filesRemoved: totalFilesRemoved,
  });
}

async function runSubscriptionScheduler() {
  if (!env.subscriptionAutoCheckEnabled()) return;

  await runAutoDeleteSubscriptions();

  const activeCount = await db.downloadTask.count({
    where: { status: { in: ['downloading', 'processing'] } },
  });
  if (activeCount > 0) return;

  const now = Date.now();
  const minLastCheck = new Date(now - DUE_CANDIDATES_MIN_AGE_MS);
  const candidates = await db.subscription.findMany({
    where: {
      isActive: true,
      OR: [{ lastCheckAt: null }, { lastCheckAt: { lt: minLastCheck } }],
    },
    include: { channel: true },
    take: DUE_TAKE_LIMIT,
  });

  const due = candidates.filter((sub) => {
    if (!sub.lastCheckAt) return true;
    const dueAt = sub.lastCheckAt.getTime() + sub.checkInterval * 60 * 1000;
    return dueAt <= now;
  });
  if (due.length === 0) return;

  let totalEnqueued = 0;
  for (let i = 0; i < due.length; i += SUBSCRIPTION_SCHEDULER_CONCURRENCY) {
    const chunk = due.slice(i, i + SUBSCRIPTION_SCHEDULER_CONCURRENCY);
    const results = await Promise.all(chunk.map((sub) => checkSubscription(sub)));
    for (const r of results) {
      if ('newFound' in r) {
        totalEnqueued += r.newFound;
        writeQueueLog('info', 'subscription_check', {
          channelId: r.channelId,
          channelName: r.channelName,
          checked: r.checked,
          newFound: r.newFound,
        });
      } else {
        writeQueueLog('error', 'subscription_check', {
          channelId: r.channelId,
          channelName: r.channelName,
          error: r.error,
        });
      }
    }
  }
  writeQueueLog('info', 'subscription_check_batch', {
    subscriptionsChecked: due.length,
    newEnqueued: totalEnqueued,
  });
  console.log('[subscription-scheduler] checked', due.length, 'subscriptions, new enqueued:', totalEnqueued);
}

async function cleanupOldCompletedTasks() {
  try {
    const before = new Date();
    before.setHours(before.getHours() - COMPLETED_KEEP_HOURS);
    const r = await db.downloadTask.deleteMany({
      where: { status: 'completed', completedAt: { lt: before } },
    });
    if (r.count > 0) {
      console.log('[queue-worker] Cleaned', r.count, 'old completed task(s)');
    }
  } catch (e) {
    console.warn('[queue-worker] Cleanup old completed failed:', e);
  }
}

async function tick() {
  const state = getState();
  if (state.running) return;
  state.running = true;

  try {
    state.tickCount = (state.tickCount ?? 0) + 1;
    if (state.tickCount % CLEANUP_TICK_INTERVAL === 0) {
      void cleanupOldCompletedTasks();
    }

    if (await isQueuePaused()) return;

    const deps = await requireDownloadDeps();
    if (!deps.ok) return;

    const maxConcurrent = env.queueMaxConcurrentDownloads();
    let activeCount = await db.downloadTask.count({
      where: { status: { in: ['downloading', 'processing'] } },
    });

    while (activeCount < maxConcurrent) {
      const task = await withDbRetry(() =>
        db.downloadTask.findFirst({
          where: { status: 'pending' },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
          include: { subscription: true },
        })
      );

      if (!task) return;

      // Атомарно «захватываем» задачу, чтобы не стартовать дважды.
      const claim = await withDbRetry(() =>
        db.downloadTask.updateMany({
          where: { id: task.id, status: 'pending' },
          data: { status: 'downloading', progress: 0, startedAt: new Date(), errorMsg: null },
        })
      );
      if (claim.count !== 1) continue;

      activeCount++;
      writeQueueLog('info', 'start', { taskId: task.id, url: task.url });

      // Небольшая пауза между стартами, чтобы снизить пиковую нагрузку на SQLite
      if (activeCount < maxConcurrent) await new Promise((r) => setTimeout(r, 150));

      // Проставим videoId если его ещё нет
      let videoId = task.videoId;
      if (!videoId) {
        try {
          const { video } = await ensureVideoAndChannelForUrl(task.url);
          videoId = video.id;
          await db.downloadTask.update({
            where: { id: task.id },
            data: { videoId, title: task.title || video.title },
          });
        } catch (e: any) {
          const errorMsg = e?.message || 'Failed to fetch video metadata';
          writeQueueLog('error', 'failed', { taskId: task.id, errorMsg });
          await db.downloadTask.update({
            where: { id: task.id },
            data: {
              status: 'failed',
              errorMsg,
              completedAt: new Date(),
            },
          });
          void sendTelegramAdminNotification(
            `⚠️ <b>Ошибка загрузки</b>\nЗадача: ${task.title || task.url}\nОшибка: ${errorMsg}`,
            errorMsg
          );
          activeCount--;
          continue;
        }
      }

      // Отсечка по дате публикации: задача из подписки — не качаем видео старше окна downloadDays
      if (task.subscriptionId && task.subscription) {
        const video = await db.video.findUnique({
          where: { id: videoId! },
          select: { publishedAt: true, title: true, platformId: true },
        });
        if (video?.publishedAt) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - task.subscription.downloadDays);
          if (video.publishedAt < cutoff) {
            await db.downloadTask.update({
              where: { id: task.id },
              data: {
                status: 'completed',
                progress: 100,
                completedAt: new Date(),
                errorMsg: null,
              },
            });
            if (video.platformId) {
              try {
                await db.rejectedSubscriptionVideo.create({
                  data: {
                    subscriptionId: task.subscriptionId,
                    platformId: video.platformId,
                  },
                });
              } catch (e: unknown) {
                const err = e as { code?: string };
                if (err?.code !== 'P2002') throw e;
              }
            }
            activeCount--;
            continue;
          }
        }
      }

      const outputFolder = getDownloadPath();
      void downloadVideo(task.id, {
        url: task.url,
        quality: task.quality || 'best',
        format: task.format || 'mp4',
        outputFolder,
        onProgress: async (info) => {
          const now = Date.now();
          const last = lastProgressUpdate.get(task.id) ?? 0;
          // Троттлинг: обновляем БД не чаще чем раз в PROGRESS_UPDATE_INTERVAL_MS, либо при завершении
          const isComplete = info.status === 'completed';
          if (!isComplete && now - last < PROGRESS_UPDATE_INTERVAL_MS) return;
          lastProgressUpdate.set(task.id, now);

          try {
            const data: { progress: number; status: string; downloadedBytes?: bigint; totalBytes?: bigint } = {
              progress: info.progress,
              status: info.status === 'completed' ? 'completed' : 'downloading',
            };
            if (info.downloadedBytes != null) data.downloadedBytes = BigInt(info.downloadedBytes);
            if (info.totalBytes != null) data.totalBytes = BigInt(info.totalBytes);
            await db.downloadTask.update({
              where: { id: task.id },
              data,
            });
          } catch {
            // ignore — не падаем на timeout/блокировке SQLite
          } finally {
            if (isComplete) lastProgressUpdate.delete(task.id);
          }
        },
      })
        .then(async (result) => {
          const completedAt = new Date();
          if (result.success && result.filePath) {
            const absPath = path.isAbsolute(result.filePath)
              ? path.normalize(result.filePath)
              : path.join(outputFolder, result.filePath);
            const pathToStore = toRelativeFilePath(absPath, outputFolder);
            let fileSizeBytes: bigint | null = null;
            try {
              const fileStat = await stat(absPath);
              fileSizeBytes = BigInt(fileStat.size);
            } catch {
              // ignore
            }
            await db.downloadTask.update({
              where: { id: task.id },
              data: {
                status: 'completed',
                progress: 100,
                filePath: pathToStore,
                completedAt,
                ...(fileSizeBytes != null && { downloadedBytes: fileSizeBytes, totalBytes: fileSizeBytes }),
              },
            });

            if (videoId) {
              try {
                const size = fileSizeBytes ?? BigInt((await stat(absPath)).size);
                await db.video.update({
                  where: { id: videoId },
                  data: { filePath: pathToStore, fileSize: size, downloadedAt: completedAt },
                });
              } catch {
                await db.video.update({
                  where: { id: videoId },
                  data: { filePath: pathToStore, downloadedAt: completedAt },
                });
              }
              // Синхронизация тегов из .info.json в БД (Tag, VideoTag)
              try {
                const video = await db.video.findUnique({
                  where: { id: videoId },
                  select: { filePath: true, platformId: true },
                });
                if (video?.filePath) {
                  const tags = await getTagsForVideo(
                    { platformId: video.platformId, filePath: video.filePath },
                    getDownloadPathAsync
                  );
                  if (tags.length > 0) {
                    await syncVideoTagsFromNames(videoId, tags);
                  }
                }
              } catch (tagErr) {
                // не ломаем завершение задачи при ошибке синхронизации тегов
                writeQueueLog('warn', 'sync-tags-failed', { taskId: task.id, videoId, error: String((tagErr as Error).message) });
              }
            }
            writeQueueLog('info', 'completed', { taskId: task.id, filePath: pathToStore });
            return;
          }

          writeQueueLog('error', 'failed', { taskId: task.id, errorMsg: result.error || 'Unknown error' });
          await db.downloadTask.update({
            where: { id: task.id },
            data: { status: 'failed', errorMsg: result.error || 'Unknown error', completedAt },
          });
          void sendTelegramAdminNotification(
            `⚠️ <b>Ошибка загрузки</b>\nЗадача: ${task.title || task.url}\nОшибка: ${result.error || 'Unknown error'}`,
            result.error || 'Unknown error'
          );
        })
        .catch(async (err) => {
          const errorMsg = err?.message || 'Unknown error';
          writeQueueLog('error', 'failed', { taskId: task.id, errorMsg });
          await db.downloadTask.update({
            where: { id: task.id },
            data: { status: 'failed', errorMsg, completedAt: new Date() },
          });
          void sendTelegramAdminNotification(
            `⚠️ <b>Ошибка загрузки</b>\nЗадача: ${task.title || task.url}\nОшибка: ${errorMsg}`,
            errorMsg
          );
        });
    }
  } finally {
    state.running = false;
  }
}

/**
 * Запускает воркер очереди. Возвращает Promise, который резолвится после сброса «залипших» задач,
 * чтобы не гонять с другими запросами (GET /api/queue) по SQLite и избежать P1008 / lock.
 */
export function ensureQueueWorker(): Promise<void> {
  const state = getState();
  if (state.started && state.ready) return state.ready;
  if (state.started) return Promise.resolve();

  state.started = true;

  // После перезапуска сервера задачи в downloading/processing остаются в БД, но процесса уже нет.
  // Сбрасываем их в pending, затем уже запускаем интервал — так меньше конкуренции за SQLite.
  state.ready = withDbRetry(() =>
    db.downloadTask.updateMany({
      where: { status: { in: ['downloading', 'processing'] } },
      data: { status: 'pending', startedAt: null },
    })
  )
    .then((r) => {
      if (r.count > 0) console.log('[queue-worker] Reset', r.count, 'stale task(s) to pending after start');
    })
    .catch((e) => {
      console.error('[queue-worker] Failed to reset stale tasks:', e);
    })
    .then(() => {
      state.interval = setInterval(() => {
        void tick().catch((e) => {
          console.error('Queue worker tick failed:', e);
        });
      }, 3000);

      const schedulerIntervalMin = env.subscriptionSchedulerIntervalMin();
      state.subSchedulerInterval = setInterval(() => {
        void runSubscriptionScheduler().catch((e) => {
          console.error('Subscription scheduler failed:', e);
        });
      }, schedulerIntervalMin * 60 * 1000);
    });

  return state.ready;
}

