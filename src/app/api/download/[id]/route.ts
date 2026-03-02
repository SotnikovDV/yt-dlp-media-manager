import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cancelDownload } from '@/lib/ytdlp';
import { jsonSafe } from '@/lib/json-safe';

export const runtime = 'nodejs';

// GET /api/download/[id] - получить статус задачи
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const task = await db.downloadTask.findUnique({
      where: { id },
      include: {
        video: {
          include: { channel: true }
        }
      }
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(jsonSafe(task));
  } catch (error) {
    console.error('Error fetching task:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

// PATCH /api/download/[id] - пауза/старт задачи
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action =
      body.action === 'pause'
        ? 'pause'
        : body.action === 'resume'
          ? 'resume'
          : body.action === 'retry'
            ? 'retry'
            : null;

    if (!action) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const task = await db.downloadTask.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (action === 'pause') {
      if (task.status === 'downloading' || task.status === 'processing') {
        cancelDownload(id);
      }
      await db.downloadTask.update({
        where: { id },
        data: { status: 'paused' },
      });
    } else if (action === 'resume') {
      if (task.status !== 'paused') {
        return NextResponse.json({ error: 'Task is not paused' }, { status: 400 });
      }
      await db.downloadTask.update({
        where: { id },
        data: { status: 'pending' },
      });
    } else {
      // retry
      if (task.status !== 'failed') {
        return NextResponse.json({ error: 'Task is not failed' }, { status: 400 });
      }
      await db.downloadTask.update({
        where: { id },
        data: { status: 'pending', errorMsg: null, progress: 0, startedAt: null, completedAt: null },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error pausing/resuming task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/download/[id] - отменить задачу
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const task = await db.downloadTask.findUnique({
      where: { id }
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Отменяем процесс если он активен
    if (task.status === 'downloading' || task.status === 'processing' || task.status === 'pending') {
      cancelDownload(id);
    }

    // Удаляем задачу
    await db.downloadTask.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cancelling task:', error);
    return NextResponse.json({ error: 'Failed to cancel task' }, { status: 500 });
  }
}
