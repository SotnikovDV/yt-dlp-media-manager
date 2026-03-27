import path from 'path';
import { existsSync } from 'fs';
import { resolvePathUnder, resolveVideoFilePath } from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';

const THUMB_EXT = ['.jpg', '.webp', '.png', '.jpeg'] as const;

/** Локальный растровый превью-файл (как в GET /api/thumbnail/[id]), без HTTP. */
export async function getLocalVideoThumbnailAbsPath(video: {
  thumbnailPath: string | null;
  filePath: string | null;
  platformId: string;
}): Promise<string | null> {
  const basePath = await getDownloadPathAsync();
  const root = path.isAbsolute(basePath) ? basePath : path.resolve(process.cwd(), basePath);

  if (video.thumbnailPath) {
    const absPath = resolvePathUnder(root, video.thumbnailPath);
    if (existsSync(absPath)) {
      const ext = path.extname(absPath).toLowerCase();
      if ((THUMB_EXT as readonly string[]).includes(ext)) return absPath;
    }
  }

  if (video.filePath) {
    const videoPath = await resolveVideoFilePath(video.filePath, getDownloadPathAsync, video.platformId);
    if (existsSync(videoPath)) {
      const base = path.join(path.dirname(videoPath), path.basename(videoPath, path.extname(videoPath)));
      for (const ext of THUMB_EXT) {
        const thumbPath = base + ext;
        if (existsSync(thumbPath)) return thumbPath;
      }
    }
  }

  return null;
}
