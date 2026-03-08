import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import path from 'path';
import { existsSync, createReadStream } from 'fs';
import { Readable } from 'stream';
import { getDataRoot } from '@/lib/runtime-paths';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const isAdmin = (session.user as any).isAdmin === true;
  if (!isAdmin && session.user.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const user = await db.user.findUnique({ where: { id }, select: { avatarPath: true } });
  if (!user?.avatarPath) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const dataRoot = getDataRoot();
  const abs = path.isAbsolute(user.avatarPath)
    ? user.avatarPath
    : path.join(dataRoot, user.avatarPath.replace(/^data[/\\]/, ''));
  if (!existsSync(abs)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Не передаём request.signal — избегаем "Controller is already closed" при отключении клиента
  const nodeStream = createReadStream(abs);
  nodeStream.on('error', () => {});
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  return new NextResponse(webStream, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

