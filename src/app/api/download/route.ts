import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getVideoInfo, type VideoInfo } from '@/lib/ytdlp';
import { requireDownloadDeps } from '@/lib/deps';
import { ensureQueueWorker } from '@/lib/queue-worker';
import { downloadAndSaveChannelAvatar } from '@/lib/avatars';
import { downloadAndSaveVideoThumbnail } from '@/lib/thumbnails';
import { getDownloadPathAsync } from '@/lib/settings';

export const runtime = 'nodejs';

// Клиентский объект из /api/download/info (camelCase)
type ClientVideoInfo = {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  thumbnail?: string;
  channel?: string;
  channelId?: string;
  viewCount?: number;
  uploadDate?: string;
};

function isUrlMatchingVideoId(url: string, videoId: string): boolean {
  if (!videoId) return false;
  try {
    const u = new URL(url);
    const v = u.searchParams.get('v');
    if (v) return v === videoId;
    return u.pathname.includes(videoId);
  } catch {
    return false;
  }
}

function clientInfoToVideoInfo(client: ClientVideoInfo): VideoInfo {
  return {
    id: client.id ?? '',
    title: client.title ?? '',
    description: client.description,
    duration: client.duration,
    thumbnail: client.thumbnail,
    channel: client.channel,
    uploader: client.channel,
    channel_id: client.channelId,
    uploader_id: client.channelId,
    view_count: client.viewCount,
    upload_date: client.uploadDate,
    thumbnails: client.thumbnail ? [{ url: client.thumbnail }] : undefined,
  };
}

// POST /api/download - добавить задачу на скачивание (требуется авторизация; привязка к пользователю через UserIndividualVideo)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { url, quality = 'best', format = 'mp4', videoInfo: clientVideoInfo } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const deps = await requireDownloadDeps();
    if (!deps.ok) {
      return NextResponse.json(
        {
          error: 'Required dependencies are not available (yt-dlp and/or ffmpeg).',
          deps: deps.status,
        },
        { status: 503 }
      );
    }

    // Используем переданные с клиента данные, если они валидны и соответствуют URL
    let videoInfo: VideoInfo;
    if (
      clientVideoInfo &&
      typeof clientVideoInfo === 'object' &&
      clientVideoInfo.id &&
      clientVideoInfo.title &&
      isUrlMatchingVideoId(url, clientVideoInfo.id)
    ) {
      videoInfo = clientInfoToVideoInfo(clientVideoInfo);
    } else {
      try {
        videoInfo = await getVideoInfo(url);
      } catch (e) {
        return NextResponse.json({ error: 'Failed to get video info. Check if the URL is valid.' }, { status: 400 });
      }
    }

    // Создаём или находим канал
    const platformChannelId =
      videoInfo.channel_id ||
      videoInfo.uploader_id ||
      (videoInfo.uploader ? `uploader:${videoInfo.uploader}` : '');

    if (!platformChannelId) {
      return NextResponse.json({ error: 'Failed to determine channel id from metadata.' }, { status: 400 });
    }

    const channelName = videoInfo.channel || videoInfo.uploader || 'Unknown';

    const channel = await db.channel.upsert({
      where: { platformId: platformChannelId },
      create: {
        platform: 'youtube',
        platformId: platformChannelId,
        name: channelName,
        avatarUrl: videoInfo.thumbnails?.[0]?.url,
      },
      update: {
        name: channelName,
        lastCheckedAt: new Date(),
      },
    });

    const avatarUrl = videoInfo.thumbnails?.[0]?.url;
    if (avatarUrl) {
      void downloadAndSaveChannelAvatar(
        avatarUrl,
        platformChannelId,
        getDownloadPathAsync
      ).then((avatarPath) => {
        if (avatarPath) {
          return db.channel.update({
            where: { id: channel.id },
            data: { avatarPath },
          });
        }
      }).catch(() => {});
    }

    // Проверяем, не скачано ли уже видео
    const existingVideo = await db.video.findUnique({
      where: { platformId: videoInfo.id }
    });

    if (existingVideo && existingVideo.filePath) {
      // Видео уже скачано — добавляем в «отдельные» для текущего пользователя и возвращаем успех
      await db.userIndividualVideo.upsert({
        where: {
          userId_videoId: { userId: session.user.id, videoId: existingVideo.id },
        },
        create: { userId: session.user.id, videoId: existingVideo.id },
        update: {},
      });
      return NextResponse.json({
        success: true,
        alreadyDownloaded: true,
        message: 'Видео уже в медиатеке, добавлено в ваши отдельные видео',
        video: existingVideo,
      });
    }

    const thumbnailUrl = videoInfo.thumbnail || `https://img.youtube.com/vi/${videoInfo.id}/maxresdefault.jpg`;
    const thumbnailPathInitial: string | null = null;

    // Создаём/обновляем запись о видео (нужно для корректных include в очереди)
    const video = existingVideo ?? await db.video.create({
      data: {
        platformId: videoInfo.id,
        channelId: channel.id,
        title: videoInfo.title,
        description: videoInfo.description?.slice(0, 2000),
        duration: videoInfo.duration,
        thumbnailUrl,
        thumbnailPath: thumbnailPathInitial,
        quality,
        format,
        viewCount: videoInfo.view_count ? BigInt(videoInfo.view_count) : null,
        publishedAt: videoInfo.upload_date ? new Date(
          parseInt(videoInfo.upload_date.slice(0, 4)),
          parseInt(videoInfo.upload_date.slice(4, 6)) - 1,
          parseInt(videoInfo.upload_date.slice(6, 8))
        ) : null
      }
    });

    if (!existingVideo) {
      void downloadAndSaveVideoThumbnail(
        thumbnailUrl,
        videoInfo.id,
        getDownloadPathAsync
      ).then((thumbnailPath) => {
        if (thumbnailPath) {
          return db.video.update({
            where: { id: video.id },
            data: { thumbnailPath },
          });
        }
      }).catch(() => {});
    }

    // Создаём задачу на скачивание
    const task = await db.downloadTask.create({
      data: {
        url,
        title: videoInfo.title,
        quality,
        format,
        status: 'pending',
        startedAt: null,
        videoId: video.id,
      }
    });

    // Привязываем видео к пользователю как «отдельное» (после завершения загрузки появится в разделе «Отдельные видео»)
    await db.userIndividualVideo.upsert({
      where: {
        userId_videoId: { userId: session.user.id, videoId: video.id },
      },
      create: { userId: session.user.id, videoId: video.id },
      update: {},
    });

    // Запускаем воркер, который выполнит скачивание с учётом лимита параллелизма
    ensureQueueWorker();

    return NextResponse.json({
      success: true,
      task,
      videoInfo: {
        id: videoInfo.id,
        title: videoInfo.title,
        duration: videoInfo.duration,
        thumbnail: videoInfo.thumbnail
      }
    });
  } catch (error) {
    console.error('Error creating download task:', error);
    return NextResponse.json({ error: 'Failed to create download task' }, { status: 500 });
  }
}
