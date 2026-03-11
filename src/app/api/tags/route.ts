import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const TAGS_CLOUD_LIMIT = 30;

/**
 * GET /api/tags — список тегов с количеством видео, доступных пользователю.
 * Учитываются только видео из каналов, на которые подписан пользователь (как в медиатеке).
 * Без авторизации возвращается пустой список.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id ?? null;

    if (!userId) {
      return NextResponse.json({ tags: [] });
    }

    const subscriptions = await db.subscription.findMany({
      where: { userId },
      select: { channelId: true },
    });
    const channelIds = subscriptions.map((s) => s.channelId);
    if (channelIds.length === 0) {
      return NextResponse.json({ tags: [] });
    }

    const counts = await db.videoTag.groupBy({
      by: ['tagId'],
      where: {
        video: {
          filePath: { not: null },
          channelId: { in: channelIds },
        },
      },
      _count: { videoId: true },
    });

    if (counts.length === 0) {
      return NextResponse.json({ tags: [] });
    }

    const tagIds = counts.map((c) => c.tagId);
    const tags = await db.tag.findMany({
      where: { id: { in: tagIds } },
      select: { id: true, name: true },
    });

    const countByTagId = new Map(counts.map((c) => [c.tagId, c._count.videoId]));
    const result = tags
      .map((t) => ({
        id: t.id,
        name: t.name,
        count: countByTagId.get(t.id) ?? 0,
      }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, TAGS_CLOUD_LIMIT);

    return NextResponse.json({ tags: result });
  } catch (error) {
    console.error('GET /api/tags error:', error);
    return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
  }
}
