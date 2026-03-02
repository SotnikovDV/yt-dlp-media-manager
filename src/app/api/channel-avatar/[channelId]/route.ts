import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { existsSync, createReadStream } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { resolvePathUnder } from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

function contentTypeFromExt(ext: string): string {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * GET /api/channel-avatar/[channelId] — отдаёт локально сохранённый аватар канала.
 * При отсутствии файла клиент может использовать onError и fallback на avatarUrl.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;
    const channel = await db.channel.findUnique({ where: { id: channelId } });
    if (!channel?.avatarPath) {
      return NextResponse.json({ error: 'Avatar not found' }, { status: 404 });
    }

    const basePath = await getDownloadPathAsync();
    const root = path.isAbsolute(basePath) ? basePath : path.resolve(process.cwd(), basePath);
    const absPath = resolvePathUnder(root, channel.avatarPath);
    if (!existsSync(absPath)) {
      return NextResponse.json({ error: 'Avatar file not found' }, { status: 404 });
    }

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
  } catch (error) {
    console.error('Error serving channel avatar:', error);
    return NextResponse.json({ error: 'Failed to serve avatar' }, { status: 500 });
  }
}
