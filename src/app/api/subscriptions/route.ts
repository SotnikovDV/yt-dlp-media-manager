import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getChannelVideosSince, buildYouTubeChannelUrl } from '@/lib/ytdlp';
import { ensureQueueWorker } from '@/lib/queue-worker';
import { env } from '@/lib/env';
import { downloadAndSaveChannelAvatar } from '@/lib/avatars';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

function toInt(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

async function enqueueBackfill(subscriptionId: string) {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { channel: true },
  });
  if (!sub || !sub.isActive) return;

  const channelUrl = buildYouTubeChannelUrl(sub.channel.platformId);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - sub.downloadDays);

  const videos = await getChannelVideosSince(channelUrl, cutoffDate, 200);

  for (const v of videos) {
    const url = `https://www.youtube.com/watch?v=${v.id}`;
    const [existingVideo, existingTask] = await Promise.all([
      db.video.findUnique({ where: { platformId: v.id }, select: { id: true } }),
      db.downloadTask.findFirst({ where: { url }, select: { id: true } }),
    ]);

    if (!existingVideo && !existingTask) {
      await db.downloadTask.create({
        data: {
          url,
          title: v.title,
          quality: sub.preferredQuality || 'best',
          format: 'mp4',
          status: 'pending',
          subscriptionId: sub.id,
          isAutoSubscriptionTask: true,
        },
      });
    }
  }

  await db.subscription.update({
    where: { id: sub.id },
    data: { lastCheckAt: new Date() },
  });
}

// GET /api/subscriptions - получить список подписок текущего пользователя
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const subscriptions = await db.subscription.findMany({
      where: { userId: session.user.id },
      include: {
        channel: {
          include: {
            _count: {
              select: { videos: true }
            }
          }
        },
        category: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    // Счётчик «видео в библиотеке» — только скачанные (filePath не null), как в списке видео
    const channelIds = subscriptions.map((s) => s.channel.id);
    if (channelIds.length > 0) {
      const downloadedCounts = await db.video.groupBy({
        by: ['channelId'],
        where: { channelId: { in: channelIds }, filePath: { not: null } },
        _count: { id: true },
      });
      const countByChannel = Object.fromEntries(downloadedCounts.map((c) => [c.channelId, c._count.id]));
      for (const sub of subscriptions) {
        (sub.channel as { _count?: { videos?: number } })._count = {
          videos: countByChannel[sub.channel.id] ?? 0,
        };
      }
    }

    return NextResponse.json(subscriptions);
  } catch (error: any) {
    console.error('Error fetching subscriptions:', error);
    const msg = process.env.NODE_ENV === 'development' ? error?.message : 'Failed to fetch subscriptions';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/subscriptions - создать подписку
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    ensureQueueWorker();
    const body = await request.json();
    const {
      channelUrl,
      downloadDays,
      preferredQuality,
      outputFolder,
      checkInterval = env.defaultCheckInterval(),
      categoryId,
      autoDeleteDays,
    } = body;

    if (!channelUrl) {
      return NextResponse.json({ error: 'Channel URL is required' }, { status: 400 });
    }

    const defaultDays = env.defaultSubscriptionHistoryDays();
    const defaultQuality = env.defaultQuality();
    const effectiveDays = toInt(downloadDays, defaultDays);
    const effectiveQuality = (preferredQuality ?? defaultQuality ?? 'best').toString();

    const allowedAutoDeleteValues = [0, 7, 14, 30, 60, 90];
    const rawAutoDelete = toInt(autoDeleteDays, 30);
    const effectiveAutoDeleteDays = allowedAutoDeleteValues.includes(rawAutoDelete) ? rawAutoDelete : 30;

    // Динамический импорт для избежания проблем
    const { getChannelInfo } = await import('@/lib/ytdlp');

    // Получаем информацию о канале
    let channelInfo;
    try {
      channelInfo = await getChannelInfo(channelUrl);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to get channel info';
      return NextResponse.json(
        { error: message || 'Failed to get channel info. Check if the URL is valid.' },
        { status: 400 }
      );
    }

    // Создаём или находим канал
    const channel = await db.channel.upsert({
      where: { platformId: channelInfo.id },
      create: {
        platform: 'youtube',
        platformId: channelInfo.id,
        name: channelInfo.name,
        description: channelInfo.description,
        avatarUrl: channelInfo.avatar
      },
      update: {
        name: channelInfo.name,
        description: channelInfo.description,
        avatarUrl: channelInfo.avatar,
        lastCheckedAt: new Date()
      }
    });

    if (channelInfo.avatar) {
      const avatarPath = await downloadAndSaveChannelAvatar(
        channelInfo.avatar,
        channelInfo.id,
        getDownloadPathAsync
      );
      if (avatarPath) {
        await db.channel.update({
          where: { id: channel.id },
          data: { avatarPath }
        });
      }
    }

    // Проверяем, есть ли уже подписка у этого пользователя
    const existing = await db.subscription.findFirst({
      where: { channelId: channel.id, userId: session.user.id }
    });

    if (existing) {
      return NextResponse.json({ 
        error: 'Already subscribed to this channel',
        subscription: existing 
      }, { status: 400 });
    }

    // Создаём подписку
    const subscription = await db.subscription.create({
      data: {
        userId: session.user.id,
        channelId: channel.id,
        downloadDays: effectiveDays,
        autoDeleteDays: effectiveAutoDeleteDays,
        preferredQuality: effectiveQuality,
        outputFolder,
        checkInterval,
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
      },
      include: { channel: true, category: true }
    });

    // В фоне добавляем задачи в очередь за выбранный период
    void enqueueBackfill(subscription.id).catch((e) => {
      console.error('Error backfilling subscription queue:', e);
    });

    return NextResponse.json(subscription);
  } catch (error) {
    console.error('Error creating subscription:', error);
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
  }
}
