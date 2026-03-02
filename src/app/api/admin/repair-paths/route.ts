import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { existsSync } from 'fs';
import { resolveVideoFilePath, toRelativeFilePath, toAbsoluteFilePath } from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

/**
 * POST /api/admin/repair-paths
 * Обновляет filePath у видео: находит файл (по текущему пути в БД или по platformId) и записывает
 * в БД путь относительно DOWNLOAD_PATH. Только для isAdmin.
 * Однократный запуск после перехода на относительные пути конвертирует старые абсолютные записи.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as any).isAdmin !== true) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const videos = await db.video.findMany({
      where: { filePath: { not: null } },
      select: { id: true, filePath: true, platformId: true }
    });

    const downloadRoot = toAbsoluteFilePath(await getDownloadPathAsync());
    let updated = 0;
    for (const v of videos) {
      if (!v.filePath) continue;
      const resolved = await resolveVideoFilePath(v.filePath, getDownloadPathAsync, v.platformId);
      if (!existsSync(resolved)) continue;
      const pathToStore = toRelativeFilePath(resolved, downloadRoot);
      if (pathToStore !== v.filePath) {
        await db.video.update({
          where: { id: v.id },
          data: { filePath: pathToStore }
        });
        updated++;
      }
    }

    return NextResponse.json({ updated, total: videos.length });
  } catch (error) {
    console.error('Repair paths error:', error);
    return NextResponse.json({ error: 'Failed to repair paths' }, { status: 500 });
  }
}
