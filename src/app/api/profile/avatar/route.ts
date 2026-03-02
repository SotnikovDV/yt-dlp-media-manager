import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import sharp from 'sharp';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { getProjectRoot } from '@/lib/runtime-paths';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Нужна картинка' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Слишком большой файл (макс 5MB)' }, { status: 400 });
  }

  const projectRoot = getProjectRoot();
  const avatarsDir = path.join(projectRoot, 'data', 'avatars');
  await mkdir(avatarsDir, { recursive: true });

  const outRel = path.join('data', 'avatars', `${session.user.id}.webp`);
  const outAbs = path.join(projectRoot, outRel);

  const out = await sharp(buf)
    .rotate()
    .resize(256, 256, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer();

  await writeFile(outAbs, out);

  await db.user.update({
    where: { id: session.user.id },
    data: { avatarPath: outRel },
  });

  return NextResponse.json({ success: true, avatarUrl: `/api/avatar/${session.user.id}` });
}

