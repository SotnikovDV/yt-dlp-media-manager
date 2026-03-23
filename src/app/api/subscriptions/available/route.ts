import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/** GET /api/subscriptions/available — публичные подписки других пользователей на каналы, на которые я не подписан */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const myChannelIds = await db.subscription
      .findMany({
        where: { userId: session.user.id },
        select: { channelId: true },
      })
      .then((rows) => rows.map((r) => r.channelId));

    const subscriptions = await db.subscription.findMany({
      where: {
        isPublic: true,
        userId: { not: session.user.id },
        channelId: { notIn: myChannelIds },
      },
      include: {
        channel: {
          include: {
            _count: { select: { videos: true } },
          },
        },
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Счётчик «видео в библиотеке» — скачанные
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
  } catch (error) {
    console.error('Error fetching available subscriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available subscriptions' },
      { status: 500 }
    );
  }
}
