import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureQueueWorker } from '@/lib/queue-worker';
import { checkSubscription, type CheckResult } from '@/lib/subscription-checker';

export const runtime = 'nodejs';

const CONCURRENCY = 3;

// POST /api/subscriptions/check-by-category - проверить подписки категории текущего пользователя
// Body: { categoryId: string } — id категории или '__none__' для подписок без категории
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : null;
    if (!categoryId) {
      return NextResponse.json({ error: 'categoryId required' }, { status: 400 });
    }

    ensureQueueWorker();

    const whereCategory =
      categoryId === '__none__' ? { categoryId: null } : { categoryId };

    const subscriptions = await db.subscription.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
        ...whereCategory,
      },
      include: { channel: true },
    });

    const results: CheckResult[] = [];
    for (let i = 0; i < subscriptions.length; i += CONCURRENCY) {
      if (request.signal.aborted) {
        return NextResponse.json({
          success: false,
          aborted: true,
          checked: results.length,
          results,
        });
      }
      const chunk = subscriptions.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(chunk.map((sub) => checkSubscription(sub)));
      for (const r of settled) {
        if (r.status === 'fulfilled') results.push(r.value);
        else {
          results.push({
            channelId: 'unknown',
            channelName: 'unknown',
            error: r.reason?.message || String(r.reason),
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      checked: subscriptions.length,
      results,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isAbort =
      msg.includes('Controller is already closed') || msg.includes('aborted') || msg.includes('AbortError');
    if (isAbort) {
      return NextResponse.json({ success: false, aborted: true, checked: 0, results: [] });
    }
    console.error('Error checking subscriptions by category:', error);
    return NextResponse.json({ error: 'Failed to check subscriptions' }, { status: 500 });
  }
}
