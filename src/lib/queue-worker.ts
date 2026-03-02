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
          await db.downloadTask.update({
            where: { id: task.id },
            data: {
              status: 'failed',
              errorMsg: e?.message || 'Failed to fetch video metadata',
              completedAt: new Date(),
            },
          });
          activeCount--;
          continue;
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
            }
            return;
          }

          await db.downloadTask.update({
            where: { id: task.id },
            data: { status: 'failed', errorMsg: result.error || 'Unknown error', completedAt },
          });
        })
        .catch(async (err) => {
          await db.downloadTask.update({
            where: { id: task.id },
            data: { status: 'failed', errorMsg: err?.message || 'Unknown error', completedAt: new Date() },
          });
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
    });

  return state.ready;
}

