import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// GET /api/subscriptions/[id] - получить подписку (только свою)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const subscription = await db.subscription.findFirst({
      where: { id, userId: session.user.id },
      include: {
        channel: {
          include: {
            videos: {
              orderBy: { downloadedAt: 'desc' },
              take: 10
            }
          }
        },
        category: true,
      }
    });

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    return NextResponse.json(subscription);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 });
  }
}

// PUT /api/subscriptions/[id] - обновить подписку (только свою)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { downloadDays, preferredQuality, outputFolder, checkInterval, isActive, categoryId, autoDeleteDays } = body;

    const existing = await db.subscription.findFirst({
      where: { id, userId: session.user.id }
    });
    if (!existing) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

    const data: Record<string, unknown> = {
      downloadDays,
      preferredQuality,
      outputFolder,
      checkInterval,
      isActive,
    };
    if (typeof autoDeleteDays === 'number') {
      const n = Math.max(0, Math.floor(autoDeleteDays));
      data.autoDeleteDays = n;
    }
    if (categoryId !== undefined) data.categoryId = categoryId || null;

    const subscription = await db.subscription.update({
      where: { id },
      data,
      include: { channel: true, category: true }
    });

    await db.rejectedSubscriptionVideo.deleteMany({
      where: { subscriptionId: id },
    });

    return NextResponse.json(subscription);
  } catch (error) {
    console.error('Error updating subscription:', error);
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}

// DELETE /api/subscriptions/[id] - удалить подписку (только свою)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const result = await db.subscription.deleteMany({
      where: { id, userId: session.user.id }
    });

    if (result.count === 0) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting subscription:', error);
    return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
  }
}
