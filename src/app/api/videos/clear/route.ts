import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { resolveVideoFilePath } from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

const THUMB_EXT = ['.jpg', '.webp', '.png', '.jpeg'];

/**
 * DELETE /api/videos/clear
 * Удаляет скачанные видео: файлы на диске и записи в БД.
 * ?channelId=xxx — все видео канала (включая без filePath), иначе — только с filePath.
 */
export async function DELETE(request: NextRequest) {
  try {
    const channelId = request.nextUrl.searchParams.get('channelId') || undefined;

    const where = channelId
      ? { channelId }
      : ({ filePath: { not: null } } as { filePath: { not: null }; channelId?: string });

    const videos = await db.video.findMany({
      where,
      select: { id: true, filePath: true, platformId: true },
    });

    let deleted = 0;
    let filesRemoved = 0;

    for (const v of videos) {
      if (v.filePath) {
        const filePath = await resolveVideoFilePath(
          v.filePath,
          getDownloadPathAsync,
          v.platformId
        );
        if (existsSync(filePath)) {
          try {
            await unlink(filePath);
            filesRemoved++;
            const base = path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)));
            for (const ext of THUMB_EXT) {
              const p = base + ext;
              if (existsSync(p)) {
                await unlink(p);
                filesRemoved++;
              }
            }
            const infoPath = base + '.info.json';
            if (existsSync(infoPath)) {
              await unlink(infoPath);
              filesRemoved++;
            }
          } catch (e) {
            console.warn('Error removing file:', filePath, e);
          }
        }
      }

      try {
        await db.video.delete({ where: { id: v.id } });
        deleted++;
      } catch (e) {
        console.warn('Error deleting video from DB:', v.id, e);
      }
    }

    return NextResponse.json({
      success: true,
      deleted,
      filesRemoved,
    });
  } catch (error) {
    console.error('Error clearing videos:', error);
    return NextResponse.json({ error: 'Failed to clear videos' }, { status: 500 });
  }
}
