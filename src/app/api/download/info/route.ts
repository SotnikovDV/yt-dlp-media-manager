import { NextRequest, NextResponse } from 'next/server';
import { getVideoInfo } from '@/lib/ytdlp';
import { checkTool } from '@/lib/deps';

export const runtime = 'nodejs';

// POST /api/download/info - получить информацию о видео по URL
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const ytdlp = await checkTool('yt-dlp');
    if (!ytdlp.installed) {
      return NextResponse.json(
        {
          error: 'yt-dlp is not available',
          ytdlp,
        },
        { status: 503 }
      );
    }

    // Получаем информацию о видео (fast: меньше запросов к YouTube для ускорения)
    const info = await getVideoInfo(url, { fast: true });

    // Получаем доступные форматы
    const formats = info.formats || [];

    // Фильтруем и группируем форматы
    const videoFormats = formats
      .filter(f => f.vcodec && f.vcodec !== 'none')
      .map(f => ({
        format_id: f.format_id,
        format_note: f.format_note,
        ext: f.ext,
        resolution: f.resolution,
        fps: f.fps,
        vcodec: f.vcodec,
        acodec: f.acodec,
        filesize: f.filesize || f.filesize_approx,
        filesize_approx: f.filesize_approx
      }))
      .filter(f => f.resolution) // Только с разрешением
      .sort((a, b) => {
        const resA = parseInt(a.resolution?.split('x')[1] || '0');
        const resB = parseInt(b.resolution?.split('x')[1] || '0');
        return resB - resA;
      });

    // Уникальные разрешения
    const uniqueResolutions = [...new Set(videoFormats.map(f => f.format_note || f.resolution))].filter(Boolean);

    return NextResponse.json({
      success: true,
      info: {
        id: info.id,
        title: info.title,
        description: info.description,
        duration: info.duration,
        thumbnail: info.thumbnail || `https://img.youtube.com/vi/${info.id}/maxresdefault.jpg`,
        channel: info.channel || info.uploader,
        channelId: info.channel_id,
        viewCount: info.view_count,
        uploadDate: info.upload_date,
        formats: videoFormats.slice(0, 20), // Ограничиваем количество
        resolutions: uniqueResolutions.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('Error getting video info:', error);
    return NextResponse.json({ 
      error: 'Failed to get video info. Make sure the URL is valid and yt-dlp is installed.',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
