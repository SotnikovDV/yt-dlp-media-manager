import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { existsSync } from 'fs';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import path from 'path';
import {
  resolveVideoFilePath,
  sanitizeDownloadFilename,
  findVideoByPlatformId,
  getDownloadSearchDirs,
} from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

function streamLog(...args: unknown[]) {
  if (env.chromecastDebug()) {
    console.log('[stream]', new Date().toISOString(), ...args);
  }
}

/** CORS для Chromecast и других медиа-клиентов: без заголовков браузер блокирует cross-origin запросы */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
};

function withCors(headers: Record<string, string>): Record<string, string> {
  return { ...CORS_HEADERS, ...headers };
}

// OPTIONS — preflight для CORS (Chromecast может отправлять)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: withCors({}),
  });
}

// GET /api/stream/[id] - стриминг видео
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  streamLog(
    'GET',
    id,
    'range:',
    request.headers.get('range') ?? '(нет)',
    'ua:',
    request.headers.get('user-agent')?.slice(0, 80) ?? '(нет)',
    'origin:',
    request.headers.get('origin') ?? '(нет)'
  );
  try {
    
    let video = await db.video.findUnique({
      where: { id },
    });
    if (!video) {
      video = await db.video.findFirst({
        where: { platformId: id },
      });
    }

    if (!video) {
      streamLog(id, '404 video not found');
      return NextResponse.json({ error: 'Video not found' }, {
        status: 404,
        headers: withCors({}),
      });
    }
    let filePath: string | null = null;

    // Основной путь: используем filePath из БД, если он есть
    if (video.filePath) {
      filePath = await resolveVideoFilePath(
        video.filePath,
        getDownloadPathAsync,
        video.platformId
      );
    }

    // Фолбэк: если в БД нет пути, но есть platformId — попробуем найти файл по ID в папке загрузок
    if (!filePath && video.platformId) {
      const downloadPath = await getDownloadPathAsync();
      const searchDirs = getDownloadSearchDirs(downloadPath);
      for (const dir of searchDirs) {
        const found = findVideoByPlatformId(dir, video.platformId);
        if (found) {
          filePath = found;
          break;
        }
      }
    }

    if (!filePath) {
      streamLog(id, '404 file path not found');
      return NextResponse.json({ error: 'File not found' }, {
        status: 404,
        headers: withCors({}),
      });
    }

    if (!existsSync(filePath)) {
      streamLog(id, '404 file not on disk', filePath);
      if (process.env.NODE_ENV === 'development') {
        console.warn('[stream] File not found:', { resolved: filePath, raw: video.filePath, cwd: process.cwd() });
        return NextResponse.json(
          { error: 'File not found', debug: { resolved: filePath, raw: video.filePath, cwd: process.cwd() } },
          { status: 404, headers: withCors({}) }
        );
      }
      return NextResponse.json({ error: 'File not found' }, {
        status: 404,
        headers: withCors({}),
      });
    }

    const fileStat = await stat(filePath);
    const fileSize = fileStat.size;
    const range = request.headers.get('range');

    const ext = path.extname(filePath).toLowerCase();
    streamLog(id, '200 OK', 'size:', fileSize, 'ext:', ext, 'range:', range ? 'yes' : 'no');
    const contentType =
      ext === '.mp4' ? 'video/mp4' :
      ext === '.webm' ? 'video/webm' :
      ext === '.mkv' ? 'video/x-matroska' :
      'application/octet-stream';

    const isDownload = request.nextUrl.searchParams.get('download') === '1';
    const extForFilename = ext || '.mp4';
    const baseName = sanitizeDownloadFilename(video.title) || video.platformId || video.id;
    const downloadFilename = `${baseName}${extForFilename}`;
    // RFC 5987 encoding for non-ASCII filenames (Cyrillic, etc.)
    // Plain filename= must be ASCII-safe; filename*= carries the full Unicode name
    const asciiFilename = downloadFilename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
    const rfc5987Filename = encodeURIComponent(downloadFilename);
    const contentDisposition = isDownload
      ? `attachment; filename="${asciiFilename}"; filename*=UTF-8''${rfc5987Filename}`
      : undefined;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const endRaw = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const end = Number.isFinite(endRaw) ? Math.min(endRaw, fileSize - 1) : fileSize - 1;

      if (!Number.isFinite(start) || start < 0 || start >= fileSize || end < start) {
        return new NextResponse(null, {
          status: 416,
          headers: withCors({ 'Content-Range': `bytes */${fileSize}` }),
        });
      }
      const chunkSize = end - start + 1;

      // Не передаём request.signal — при отключении клиента createReadStream+Readable.toWeb
      // дают гонку и "Controller is already closed". Соединение закроется при записи в сокет.
      const nodeStream = createReadStream(filePath, { start, end });
      nodeStream.on('error', () => {}); // игнорируем ошибки при закрытии клиентом
      const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

      const headers: Record<string, string> = withCors({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType,
      });
      if (contentDisposition) headers['Content-Disposition'] = contentDisposition;
      return new NextResponse(webStream, { status: 206, headers });
    }

    // Не передаём request.signal — избегаем "Controller is already closed" при отключении клиента
    const nodeStream = createReadStream(filePath);
    nodeStream.on('error', () => {}); // игнорируем ошибки при закрытии клиентом
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    const headers: Record<string, string> = withCors({
      'Accept-Ranges': 'bytes',
      'Content-Length': String(fileSize),
      'Content-Type': contentType,
    });
    if (contentDisposition) headers['Content-Disposition'] = contentDisposition;
    return new NextResponse(webStream, { headers });
  } catch (error) {
    streamLog('ERROR', id, error);
    console.error('Error streaming video:', error);
    return NextResponse.json({ error: 'Failed to stream video' }, {
      status: 500,
      headers: withCors({}),
    });
  }
}
