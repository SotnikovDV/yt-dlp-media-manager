import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { resolveVideoFilePath } from '@/lib/path-utils';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

/**
 * DELETE /api/videos/[id]/individual — убрать видео из «моих отдельных».
 * Удаляется запись UserIndividualVideo для текущего пользователя.
 * Файл с диска удаляется только если никто другой не имеет это видео в отдельных и никто другой не подписан на канал.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: videoId } = await params;

    const link = await db.userIndividualVideo.findUnique({
      where: {
        userId_videoId: { userId: session.user.id, videoId },
      },
      include: { video: true },
    });

    if (!link) {
      return NextResponse.json(
        { error: 'Это видео не является отдельным для вас' },
        { status: 403 }
      );
    }

    const video = link.video;
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // 1) Удаляем запись для текущего пользователя
    await db.userIndividualVideo.delete({
      where: { userId_videoId: { userId: session.user.id, videoId } },
    });

    // 2) Есть ли ещё пользователи с этим видео в UserIndividualVideo?
    const otherIndividualCount = await db.userIndividualVideo.count({
      where: { videoId },
    });
    if (otherIndividualCount > 0) {
      return NextResponse.json({ success: true });
    }

    // 3) Есть ли у других пользователей подписка на канал этого видео?
    const otherSubscriptionsCount = await db.subscription.count({
      where: {
        channelId: video.channelId,
        userId: { not: session.user.id },
      },
    });
    if (otherSubscriptionsCount > 0) {
      return NextResponse.json({ success: true });
    }

    // 4) Удаляем файл с диска и обнуляем filePath в Video
    const filePath = video.filePath
      ? await resolveVideoFilePath(video.filePath, getDownloadPathAsync, video.platformId)
      : null;
    if (filePath && existsSync(filePath)) {
      try {
        await unlink(filePath);
        const basePath = path.join(
          path.dirname(filePath),
          path.basename(filePath, path.extname(filePath))
        );
        const relatedFiles = [
          `${basePath}.jpg`,
          `${basePath}.webp`,
          `${basePath}.info.json`,
        ];
        for (const file of relatedFiles) {
          if (existsSync(file)) await unlink(file);
        }
      } catch (e) {
        console.error('Error deleting file:', e);
      }
    }

    await db.video.update({
      where: { id: videoId },
      data: {
        filePath: null,
        downloadedAt: null,
        fileSize: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/videos/[id]/individual:', error);
    return NextResponse.json(
      { error: 'Failed to remove individual video' },
      { status: 500 }
    );
  }
}
