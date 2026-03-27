import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { jsonSafe } from '@/lib/json-safe';
import { resolveVideoFilePath } from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

// GET /api/videos/[id] - получить информацию о видео
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id ?? null;

    const { id } = await params;

    const video = await db.video.findUnique({
      where: { id },
      include: {
        channel: true,
        watchHistory: userId ? { where: { userId }, take: 1 } : false,
        favorites: userId ? { where: { userId }, take: 1 } : false,
        bookmarks: userId ? { where: { userId }, take: 1 } : false,
        pins: userId ? { where: { userId }, take: 1 } : false,
        videoTags: {
          include: { tag: true }
        }
      }
    });

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    return NextResponse.json(jsonSafe(video));
  } catch (error) {
    console.error('Error fetching video:', error);
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 });
  }
}

// DELETE /api/videos/[id] - удалить видео
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const video = await db.video.findUnique({
      where: { id }
    });

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Удаляем файл если существует (resolveVideoFilePath находит файл даже при старом пути в БД)
    const filePath = video.filePath
      ? await resolveVideoFilePath(video.filePath, getDownloadPathAsync, video.platformId)
      : null;
    if (filePath && existsSync(filePath)) {
      try {
        await unlink(filePath);
        // Удаляем связанные файлы (thumbnail, info.json)
        const basePath = path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)));
        const relatedFiles = [`${basePath}.jpg`, `${basePath}.webp`, `${basePath}.info.json`];
        for (const file of relatedFiles) {
          if (existsSync(file)) {
            await unlink(file);
          }
        }
      } catch (e) {
        console.error('Error deleting file:', e);
      }
    }

    // Удаляем запись из базы
    await db.video.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting video:', error);
    return NextResponse.json({ error: 'Failed to delete video' }, { status: 500 });
  }
}
