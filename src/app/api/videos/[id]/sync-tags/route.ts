import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getTagsForVideo } from '@/lib/read-info-chapters';
import { getDownloadPathAsync } from '@/lib/settings';
import { syncVideoTagsFromNames } from '@/lib/sync-video-tags';

export const runtime = 'nodejs';

/**
 * POST /api/videos/[id]/sync-tags — синхронизировать теги видео из .info.json в БД (Tag, VideoTag).
 * id — cuid видео или platformId. Требуется авторизация.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    let video = await db.video.findUnique({ where: { id } });
    if (!video) {
      video = await db.video.findFirst({ where: { platformId: id } });
    }

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }
    if (!video.filePath) {
      return NextResponse.json(
        { error: 'Video has no file path; sync tags only for downloaded videos' },
        { status: 400 }
      );
    }

    const tags = await getTagsForVideo(
      { filePath: video.filePath, platformId: video.platformId },
      getDownloadPathAsync
    );
    const result = await syncVideoTagsFromNames(video.id, tags);

    return NextResponse.json({ added: result.added, removed: result.removed });
  } catch (error) {
    console.error('Error syncing video tags:', error);
    return NextResponse.json(
      { error: 'Failed to sync tags' },
      { status: 500 }
    );
  }
}
