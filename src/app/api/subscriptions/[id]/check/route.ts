import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureQueueWorker } from '@/lib/queue-worker';
import { checkSubscription } from '@/lib/subscription-checker';
import { writeQueueLog } from '@/lib/queue-logger';

export const runtime = 'nodejs';

/**
 * POST /api/subscriptions/[id]/check
 * Проверить подписку на новые видео и добавить их в очередь загрузок (только свою подписку).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    ensureQueueWorker();

    const sub = await db.subscription.findFirst({
      where: { id, userId: session.user.id },
      include: { channel: true },
    });

    if (!sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    if (request.signal.aborted) {
      return NextResponse.json({ success: false, aborted: true });
    }

    const result = await checkSubscription(sub);

    if (request.signal.aborted) {
      return NextResponse.json({ success: false, aborted: true });
    }

    if ('error' in result) {
      writeQueueLog('error', 'subscription_check', {
        channelId: result.channelId,
        channelName: result.channelName,
        error: result.error,
      });
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    writeQueueLog('info', 'subscription_check', {
      channelId: result.channelId,
      channelName: result.channelName,
      checked: result.checked,
      newFound: result.newFound,
    });
    console.log('[check]', sub.channel.name, 'videos from yt-dlp:', result.checked, 'enqueued:', result.newFound);
    return NextResponse.json({
      success: true,
      channelName: sub.channel.name,
      checked: result.checked,
      newFound: result.newFound,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('Controller is already closed') ||
      msg.includes('aborted') ||
      msg.includes('AbortError')
    ) {
      return NextResponse.json({ success: false, aborted: true });
    }
    console.error('Error checking subscription:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check subscription' },
      { status: 500 }
    );
  }
}
