import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { existsSync, createReadStream } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { resolveVideoFilePath, resolvePathUnder } from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

const THUMB_EXT = ['.jpg', '.webp', '.png', '.jpeg'];

function contentTypeFromExt(ext: string): string {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * GET /api/thumbnail/[id] — превью из локального файла или прокси с YouTube.
 * Приоритет: thumbnailPath (локальный кэш) → превью рядом с видео (yt-dlp) → прокси thumbnailUrl.
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

    // 0. Локальный кэш по thumbnailPath (для ещё не скачанных и уже сохранённых превью)
    if (video.thumbnailPath) {
      const basePath = await getDownloadPathAsync();
      const root = path.isAbsolute(basePath) ? basePath : path.resolve(process.cwd(), basePath);
      const absPath = resolvePathUnder(root, video.thumbnailPath);
      if (existsSync(absPath)) {
        const ext = path.extname(absPath).toLowerCase();
        const ct = contentTypeFromExt(ext);
        const nodeStream = createReadStream(absPath, {
          ...(request.signal && { signal: request.signal }),
        });
        nodeStream.on('error', () => {});
        const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
        return new NextResponse(webStream, {
          headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' },
        });
      }
    }

    // 1. Пытаемся отдать превью рядом с видео (соглашение yt-dlp --write-thumbnail)
    if (video.filePath) {
      const videoPath = await resolveVideoFilePath(
        video.filePath,
        getDownloadPathAsync,
        video.platformId
      );

      if (existsSync(videoPath)) {
        const base = path.join(path.dirname(videoPath), path.basename(videoPath, path.extname(videoPath)));
        for (const ext of THUMB_EXT) {
          const thumbPath = base + ext;
          if (existsSync(thumbPath)) {
            const ct = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
            const nodeStream = createReadStream(thumbPath, {
              ...(request.signal && { signal: request.signal }),
            });
            nodeStream.on('error', () => {});
            const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
            return new NextResponse(webStream, {
              headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' },
            });
          }
        }
      }
    }

    // 2. Локального файла нет — проксируем с YouTube (сервер имеет интернет, клиент — нет)
    if (video.thumbnailUrl) {
      const res = await fetch(video.thumbnailUrl, {
        headers: { 'User-Agent': 'MediaManager/1.0' },
        signal: request.signal ?? undefined,
      });
      if (res.ok && res.body) {
        const contentType = res.headers.get('content-type') || 'image/jpeg';
        return new NextResponse(res.body, {
          headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
        });
      }
    }

    return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 });
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    return NextResponse.json({ error: 'Failed to serve thumbnail' }, { status: 500 });
  }
}
