import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { createReadStream, existsSync } from 'fs';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { db } from '@/lib/db';
import path from 'path';
import {
  resolveVideoFilePath,
  sanitizeDownloadFilename,
  findVideoByPlatformId,
  getDownloadSearchDirs,
} from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';
import {
  runFfmpegExtractAudioAacToFile,
  runFfmpegExtractAudioCopyToFile,
  type AudioCopyContainer,
} from '@/lib/ffmpeg-extract-audio';
import { checkTool } from '@/lib/deps';

export const runtime = 'nodejs';

// GET /api/videos/[id]/audio — извлечь аудио через ffmpeg во временный файл (+faststart),
// затем отдать целиком (корректно для локальных плееров; pipe+fMP4 часто не воспроизводится).
// mode=aac (по умолчанию): перекодирование AAC → .m4a
// mode=copy: копирование дорожки (-c:a copy)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let tmpDir: string | null = null;
  try {
    const ffmpegOk = await checkTool('ffmpeg');
    if (!ffmpegOk.installed) {
      return NextResponse.json(
        {
          error: 'ffmpeg is not available',
          details: ffmpegOk.details ?? ffmpegOk.reason,
        },
        { status: 503 }
      );
    }

    const { id } = await params;

    let video = await db.video.findUnique({ where: { id } });
    if (!video) {
      video = await db.video.findFirst({ where: { platformId: id } });
    }
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    let videoPath: string | null = null;
    if (video.filePath) {
      videoPath = await resolveVideoFilePath(
        video.filePath,
        getDownloadPathAsync,
        video.platformId
      );
    }
    if (!videoPath && video.platformId) {
      const downloadPath = await getDownloadPathAsync();
      const searchDirs = getDownloadSearchDirs(downloadPath);
      for (const dir of searchDirs) {
        const found = findVideoByPlatformId(dir, video.platformId);
        if (found) {
          videoPath = found;
          break;
        }
      }
    }

    if (!videoPath || !existsSync(videoPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const ext = path.extname(videoPath).toLowerCase();
    if (!['.mp4', '.webm', '.mkv'].includes(ext)) {
      return NextResponse.json(
        { error: 'Unsupported video container for audio extraction' },
        { status: 400 }
      );
    }

    const modeParam = request.nextUrl.searchParams.get('mode');
    const mode = modeParam === 'copy' ? 'copy' : 'aac';

    let copyContainer: AudioCopyContainer;
    if (ext === '.mp4') copyContainer = 'mp4';
    else if (ext === '.webm') copyContainer = 'webm';
    else copyContainer = 'matroska';

    const isDownload = request.nextUrl.searchParams.get('download') === '1';
    const baseName = sanitizeDownloadFilename(video.title) || video.platformId || video.id;
    let downloadSuffix: string;
    let contentType: string;
    if (mode === 'copy') {
      if (copyContainer === 'mp4') {
        downloadSuffix = '.mp4';
        contentType = 'audio/mp4';
      } else if (copyContainer === 'webm') {
        downloadSuffix = '.webm';
        contentType = 'audio/webm';
      } else {
        downloadSuffix = '.mka';
        contentType = 'application/octet-stream';
      }
    } else {
      downloadSuffix = '.m4a';
      contentType = 'audio/mp4';
    }
    const downloadFilename = `${baseName}${downloadSuffix}`;
    const asciiFilename = downloadFilename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
    const rfc5987Filename = encodeURIComponent(downloadFilename);
    const contentDisposition = isDownload
      ? `attachment; filename="${asciiFilename}"; filename*=UTF-8''${rfc5987Filename}`
      : `inline; filename="${asciiFilename}"; filename*=UTF-8''${rfc5987Filename}`;

    tmpDir = await mkdtemp(path.join(tmpdir(), 'yd-mm-audio-'));
    const outPath = path.join(tmpDir, `out${downloadSuffix}`);

    const signal = request.signal;
    try {
      if (mode === 'copy') {
        await runFfmpegExtractAudioCopyToFile(videoPath, copyContainer, outPath, { signal });
      } else {
        await runFfmpegExtractAudioAacToFile(videoPath, outPath, { signal });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[audio] ffmpeg failed:', msg);
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      tmpDir = null;
      if (signal.aborted) {
        return new NextResponse(null, { status: 499 });
      }
      return NextResponse.json(
        {
          error: 'Audio extraction failed',
          details: process.env.NODE_ENV === 'development' ? msg : undefined,
        },
        { status: 500 }
      );
    }

    const st = await stat(outPath);
    const nodeStream = createReadStream(outPath);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned || !tmpDir) return;
      cleaned = true;
      rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    };
    nodeStream.on('end', cleanup);
    nodeStream.on('close', cleanup);
    nodeStream.on('error', (e) => {
      console.error('[audio] read stream error:', e);
      cleanup();
    });
    signal.addEventListener('abort', () => {
      nodeStream.destroy();
      cleanup();
    });

    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(st.size),
        'Cache-Control': 'no-store',
        'Content-Disposition': contentDisposition,
      },
    });
  } catch (error) {
    console.error('Error extracting audio:', error);
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
    return NextResponse.json({ error: 'Failed to extract audio' }, { status: 500 });
  }
}
