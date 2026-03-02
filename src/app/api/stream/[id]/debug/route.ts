import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { existsSync } from 'fs';
import { resolveVideoFilePath, findVideoByPlatformId, toAbsoluteFilePath, getDownloadSearchDirs } from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

/**
 * GET /api/stream/[id]/debug — диагностика пути к видео
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let video = await db.video.findUnique({ where: { id } });
    if (!video) video = await db.video.findFirst({ where: { platformId: id } });

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const downloadPath = await getDownloadPathAsync();
    const searchDirs = getDownloadSearchDirs(downloadPath);
    const byPlatformIdResults: Record<string, string | null> = {};
    for (const dir of searchDirs) {
      const found = video.platformId ? findVideoByPlatformId(dir, video.platformId) : null;
      byPlatformIdResults[dir] = found;
    }
    const foundByPlatformId = Object.values(byPlatformIdResults).find(Boolean) ?? null;

    const primary = toAbsoluteFilePath(video.filePath || '');
    const resolved = await resolveVideoFilePath(
      video.filePath || '',
      getDownloadPathAsync,
      video.platformId || undefined
    );

    return NextResponse.json({
      videoId: video.id,
      platformId: video.platformId,
      filePathInDb: video.filePath,
      primaryPath: primary,
      primaryExists: existsSync(primary),
      searchDirsTried: searchDirs,
      foundByPlatformId,
      foundByPlatformIdDetails: byPlatformIdResults,
      resolvedPath: resolved,
      resolvedExists: existsSync(resolved),
      downloadPath,
      cwd: process.cwd(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
