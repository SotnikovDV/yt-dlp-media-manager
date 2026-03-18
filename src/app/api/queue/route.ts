import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureQueueWorker } from '@/lib/queue-worker';
import { jsonSafe } from '@/lib/json-safe';
import { cancelDownload } from '@/lib/ytdlp';

export const runtime = 'nodejs';

// PUT /api/queue - пауза/старт для всех
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === 'retry_failed') {
      const tasks = await db.downloadTask.findMany({
        where: { status: 'failed' },
        select: { id: true },
      });
      for (const t of tasks) {
        await db.downloadTask.update({
          where: { id: t.id },
          data: { status: 'pending', errorMsg: null, progress: 0, startedAt: null, completedAt: null },
        });
      }
      return NextResponse.json({ success: true, retried: tasks.length });
    }
    const paused = body.paused === true;
    await db.setting.upsert({
      where: { key: 'queuePaused' },
      create: { key: 'queuePaused', value: paused ? 'true' : 'false' },
      update: { value: paused ? 'true' : 'false' },
    });
    if (paused) {
      // При глобальной паузе останавливаем текущие загрузки и переводим задачи в paused
      const running = await db.downloadTask.findMany({
        where: { status: { in: ['downloading', 'processing'] } },
        select: { id: true },
      });
      for (const t of running) {
        try {
          cancelDownload(t.id);
        } catch (e) {
          console.warn('cancelDownload on global pause:', e);
        }
        await db.downloadTask.update({
          where: { id: t.id },
          data: { status: 'paused' },
        });
      }
    } else {
      // При снятии глобальной паузы возвращаем все paused-задачи в очередь
      await db.downloadTask.updateMany({
        where: { status: 'paused' },
        data: { status: 'pending', startedAt: null },
      });
    }
    return NextResponse.json({ success: true, paused });
  } catch (error) {
    console.error('Error updating queue pause:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// DELETE /api/queue - удалить задачи. ?all=true — все (включая completed/failed), иначе только активные
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const all = url.searchParams.get('all') === 'true';

    const where = all
      ? {} // все задачи
      : { status: { in: ['pending', 'downloading', 'processing', 'paused'] } };

    const tasks = await db.downloadTask.findMany({
      where,
      select: { id: true, status: true },
    });

    for (const t of tasks) {
      if (t.status === 'downloading' || t.status === 'processing') {
        try {
          cancelDownload(t.id);
        } catch (e) {
          console.warn('cancelDownload:', e);
        }
      }
      await db.downloadTask.delete({ where: { id: t.id } });
    }

    return NextResponse.json({ success: true, deleted: tasks.length });
  } catch (error: any) {
    console.error('Error clearing queue:', error);
    const msg = process.env.NODE_ENV === 'development' ? error?.message : 'Failed to clear queue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const PRISMA_TIMEOUT_CODE = 'P1008';

async function fetchQueueData() {
  const pausedSetting = await db.setting.findUnique({
    where: { key: 'queuePaused' },
    select: { value: true },
  });
  const paused = pausedSetting?.value === 'true';

  // Очистку завершённых задач делаем в queue-worker редко, чтобы не блокировать SQLite при каждом опросе
  const tasks = await db.downloadTask.findMany({
    where: {
      status: { in: ['pending', 'downloading', 'processing', 'paused'] }
    },
    include: {
      video: {
        include: { channel: true }
      },
      subscription: {
        select: { channel: { select: { id: true, name: true } } }
      }
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' }
    ]
  });

  const recentCompleted = await db.downloadTask.findMany({
    where: {
      status: { in: ['completed', 'failed'] }
    },
    include: {
      video: {
        include: { channel: true }
      },
      subscription: {
        select: { channel: { select: { id: true, name: true } } }
      }
    },
    orderBy: { completedAt: 'desc' },
    take: 10
  });

  return { tasks, recentCompleted, paused };
}

// GET /api/queue - получить очередь задач
export async function GET() {
  try {
    await ensureQueueWorker();

    let data: Awaited<ReturnType<typeof fetchQueueData>>;
    try {
      data = await fetchQueueData();
    } catch (error: any) {
      if (error?.code === PRISMA_TIMEOUT_CODE) {
        await new Promise((r) => setTimeout(r, 500));
        data = await fetchQueueData();
      } else {
        throw error;
      }
    }

    return NextResponse.json(
      jsonSafe({
        active: data.tasks,
        recent: data.recentCompleted,
        paused: data.paused,
      })
    );
  } catch (error: any) {
    console.error('Error fetching queue:', error);
    const msg = process.env.NODE_ENV === 'development' ? error?.message : 'Failed to fetch queue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
