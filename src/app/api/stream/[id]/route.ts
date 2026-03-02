import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { existsSync } from 'fs';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import path from 'path';
import { resolveVideoFilePath, sanitizeDownloadFilename } from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

// GET /api/stream/[id] - стриминг видео
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    let video = await db.video.findUnique({
      where: { id }
    });
    if (!video) {
      video = await db.video.findFirst({
        where: { platformId: id }
      });
    }

    if (!video || !video.filePath) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const filePath = await resolveVideoFilePath(
      video.filePath,
      getDownloadPathAsync,
      video.platformId
    );

    if (!existsSync(filePath)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[stream] File not found:', { resolved: filePath, raw: video.filePath, cwd: process.cwd() });
        return NextResponse.json(
          { error: 'File not found', debug: { resolved: filePath, raw: video.filePath, cwd: process.cwd() } },
          { status: 404 }
        );
      }
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileStat = await stat(filePath);
    const fileSize = fileStat.size;
    const range = request.headers.get('range');

    const ext = path.extname(filePath).toLowerCase();
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
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          }
        });
      }
      const chunkSize = end - start + 1;

      const nodeStream = createReadStream(filePath, {
        start,
        end,
        ...(request.signal && { signal: request.signal }),
      });
      nodeStream.on('error', () => {}); // избегаем uncaughtException при отмене/закрытии
      const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

      const headers: Record<string, string> = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType,
      };
      if (contentDisposition) headers['Content-Disposition'] = contentDisposition;
      return new NextResponse(webStream, { status: 206, headers });
    }

    const nodeStream = createReadStream(filePath, {
      ...(request.signal && { signal: request.signal }),
    });
    nodeStream.on('error', () => {}); // избегаем uncaughtException при отмене/закрытии
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    const headers: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(fileSize),
      'Content-Type': contentType,
    };
    if (contentDisposition) headers['Content-Disposition'] = contentDisposition;
    return new NextResponse(webStream, { headers });
  } catch (error) {
    console.error('Error streaming video:', error);
    return NextResponse.json({ error: 'Failed to stream video' }, { status: 500 });
  }
}
