import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { cleanOldVideosForSubscription } from '@/lib/subscription-clean-old';

export const runtime = 'nodejs';

/**
 * POST /api/subscriptions/[id]/clean-old
 * Удаляет старые видео подписки (канала): по сроку давности в днях удаляются
 * записи в БД, файлы на диске и соответствующие задачи в очереди загрузок.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const olderThanDaysInput = typeof body.olderThanDays === 'number' ? body.olderThanDays : undefined;

    const sub = await db.subscription.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const olderThanDays =
      olderThanDaysInput != null
        ? olderThanDaysInput
        : typeof sub.autoDeleteDays === 'number'
        ? sub.autoDeleteDays
        : 30;

    if (olderThanDays < 0) {
      return NextResponse.json({ error: 'olderThanDays must be >= 0' }, { status: 400 });
    }

    const result = await cleanOldVideosForSubscription(sub.id, olderThanDays, {
      skipFavoritesForUserId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Error in clean-old:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to clean old videos' },
      { status: 500 }
    );
  }
}
