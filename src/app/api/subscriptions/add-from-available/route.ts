import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureQueueWorker } from '@/lib/queue-worker';

export const runtime = 'nodejs';

/** POST /api/subscriptions/add-from-available — добавить подписку из «Доступные» к своим */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId : null;

    if (!subscriptionId) {
      return NextResponse.json({ error: 'subscriptionId is required' }, { status: 400 });
    }

    const source = await db.subscription.findUnique({
      where: { id: subscriptionId },
      include: { channel: true, category: true },
    });

    if (!source) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }
    if (!source.isPublic) {
      return NextResponse.json({ error: 'Subscription is not public' }, { status: 403 });
    }
    if (source.userId === session.user.id) {
      return NextResponse.json({ error: 'Cannot add your own subscription' }, { status: 400 });
    }

    const existing = await db.subscription.findFirst({
      where: { channelId: source.channelId, userId: session.user.id },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Already subscribed to this channel', subscription: existing },
        { status: 400 }
      );
    }

    ensureQueueWorker();

    const subscription = await db.subscription.create({
      data: {
        userId: session.user.id,
        channelId: source.channelId,
        downloadDays: source.downloadDays,
        autoDeleteDays: source.autoDeleteDays,
        preferredQuality: source.preferredQuality ?? 'best',
        outputFolder: source.outputFolder,
        checkInterval: source.checkInterval,
        isActive: true,
        isPublic: false,
        categoryId: source.categoryId,
      },
      include: { channel: true, category: true },
    });

    // Backfill в фоне — импортируем логику из route.ts
    const { getChannelVideosSince, buildYouTubeChannelUrl } = await import('@/lib/ytdlp');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - subscription.downloadDays);
    const channelUrl = buildYouTubeChannelUrl(subscription.channel.platformId);

    void (async () => {
      try {
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
                quality: subscription.preferredQuality || 'best',
                format: 'mp4',
                status: 'pending',
                subscriptionId: subscription.id,
                isAutoSubscriptionTask: true,
              },
            });
          }
        }
        await db.subscription.update({
          where: { id: subscription.id },
          data: { lastCheckAt: new Date() },
        });
      } catch (e) {
        console.error('Error backfilling subscription:', e);
      }
    })();

    return NextResponse.json(subscription);
  } catch (error) {
    console.error('Error adding subscription from available:', error);
    return NextResponse.json(
      { error: 'Failed to add subscription' },
      { status: 500 }
    );
  }
}
