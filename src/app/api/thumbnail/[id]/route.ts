import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { existsSync, createReadStream } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { resolveVideoFilePath, resolvePathUnder } from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

const THUMB_EXT = ['.jpg', '.webp', '.png', '.jpeg'];

/** Минимальное SVG-превью при недоступности YouTube (DNS, сеть). */
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect fill="#1a1a1a" width="320" height="180"/><polygon fill="#404040" points="130,65 130,115 175,90"/><text x="160" y="150" text-anchor="middle" fill="#666" font-size="14" font-family="sans-serif">Без превью</text></svg>`;

function servePlaceholder(): NextResponse {
  return new NextResponse(PLACEHOLDER_SVG, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

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
        // Не передаём request.signal — избегаем "Controller is already closed" при отключении клиента
        const nodeStream = createReadStream(absPath);
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
            // Не передаём request.signal — избегаем "Controller is already closed" при отключении клиента
            const nodeStream = createReadStream(thumbPath);
            nodeStream.on('error', () => {});
            const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
            return new NextResponse(webStream, {
              headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' },
            });
          }
        }
      }
    }

    // 2. Локального файла нет — проксируем с YouTube. При сетевой ошибке — заглушка.
    if (video.thumbnailUrl) {
      try {
        const controller = new AbortController();
        const timeoutMs = Math.max(5000, Math.min(120000, parseInt(process.env.THUMBNAIL_FETCH_TIMEOUT_MS ?? '30000', 10) || 30000));
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        // Только таймаут — не request.signal, чтобы отмена клиента не приводила к "Controller is already closed"
        const res = await fetch(video.thumbnailUrl, {
          headers: { 'User-Agent': 'MediaManager/1.0' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok && res.body) {
          const contentType = res.headers.get('content-type') || 'image/jpeg';
          return new NextResponse(res.body, {
            headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
          });
        }
      } catch (fetchError) {
        console.warn(`[thumbnail] Failed to fetch ${video.thumbnailUrl}:`, fetchError);
        return servePlaceholder();
      }
    }

    return servePlaceholder();
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    return NextResponse.json({ error: 'Failed to serve thumbnail' }, { status: 500 });
  }
}
