import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkDependencies } from '@/lib/deps';
import { ensureQueueWorker } from '@/lib/queue-worker';
import path from 'path';
import { existsSync } from 'fs';
import { getDownloadSearchDirs, toAbsoluteFilePath } from '@/lib/path-utils';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

// GET /api/stats - получить статистику (подписки — только текущего пользователя)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    ensureQueueWorker();
    // Подсчитываем видео
    const videoCount = await db.video.count({
      where: { filePath: { not: null } }
    });

    // Общий размер видео
    const videos = await db.video.findMany({
      where: { 
        filePath: { not: null },
        fileSize: { not: null }
      },
      select: { fileSize: true }
    });
    const totalSize = videos.reduce((acc, v) => acc + Number(v.fileSize || 0), 0);

    // Подсчитываем каналы и подписки текущего пользователя
    const channelCount = await db.channel.count();
    const subscriptionCount = await db.subscription.count({
      where: { userId: session.user.id, isActive: true }
    });

    // Дата/время последней проверки каналов подписок пользователя
    const userSubs = await db.subscription.findMany({
      where: { userId: session.user.id },
      select: { channelId: true }
    });
    const channelIds = userSubs.map((s) => s.channelId);
    let lastCheckAt: Date | null = null;
    if (channelIds.length > 0) {
      const latest = await db.channel.findFirst({
        where: { id: { in: channelIds }, lastCheckedAt: { not: null } },
        orderBy: { lastCheckedAt: 'desc' },
        select: { lastCheckedAt: true }
      });
      lastCheckAt = latest?.lastCheckedAt ?? null;
    }

    // Активные задачи
    const activeTasks = await db.downloadTask.count({
      where: { status: { in: ['pending', 'downloading'] } }
    });

    // Проверяем внешние зависимости
    const deps = await checkDependencies();

    // Дисковое пространство (statfs может быть недоступен на некоторых системах)
    let diskSpace: { total: number; free: number; used: number } | null = null;
    try {
      const statfsFn = (await import('fs/promises')).statfs;
      if (typeof statfsFn === 'function') {
        const { env } = await import('@/lib/env');
        const rawPath = env.downloadPath();
        const candidates = getDownloadSearchDirs(rawPath).map(toAbsoluteFilePath);
        const existing = candidates.find((p) => existsSync(p));
        if (!existing) {
          // Не считаем это ошибкой — папка может быть ещё не создана
          return NextResponse.json({
            baseUrl: env.baseUrl(),
            videos: {
              count: videoCount,
              totalSize,
              totalSizeFormatted: formatBytes(totalSize)
            },
            channels: {
              count: channelCount,
              subscriptions: subscriptionCount,
              lastCheckAt
            },
            queue: {
              active: activeTasks
            },
            deps,
            disk: null
          });
        }
        const stats = await statfsFn(existing);
        diskSpace = {
          total: Number(stats.blocks) * Number(stats.bsize),
          free: Number(stats.bfree) * Number(stats.bsize),
          used: (Number(stats.blocks) - Number(stats.bfree)) * Number(stats.bsize)
        };
      }
    } catch (e) {
      console.error('Error getting disk space:', e);
    }

    return NextResponse.json({
      baseUrl: env.baseUrl(),
      videos: {
        count: videoCount,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize)
      },
      channels: {
        count: channelCount,
        subscriptions: subscriptionCount,
        lastCheckAt
      },
      queue: {
        active: activeTasks
      },
      deps,
      disk: diskSpace ? {
        ...diskSpace,
        totalFormatted: formatBytes(diskSpace.total),
        freeFormatted: formatBytes(diskSpace.free),
        usedFormatted: formatBytes(diskSpace.used)
      } : null
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    const msg = process.env.NODE_ENV === 'development' ? error?.message : 'Failed to fetch stats';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
