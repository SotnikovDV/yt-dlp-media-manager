import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getChaptersForVideo } from '@/lib/read-info-chapters';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

/**
 * GET /api/videos/[id]/chapters — главы из .info.json рядом с видео (yt-dlp).
 * id — cuid видео или platformId. При отсутствии файла/глав возвращает { chapters: [] }.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let video = await db.video.findUnique({ where: { id } });
    if (!video) {
      video = await db.video.findFirst({ where: { platformId: id } });
    }

    if (!video || !video.filePath) {
      return NextResponse.json({ chapters: [] });
    }

    const chapters = await getChaptersForVideo(
      { filePath: video.filePath, platformId: video.platformId },
      getDownloadPathAsync
    );

    return NextResponse.json({ chapters });
  } catch {
    return NextResponse.json({ chapters: [] });
  }
}
