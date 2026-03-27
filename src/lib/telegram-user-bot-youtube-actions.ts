/**
 * Одна ссылка в сообщении Telegram: YouTube — добавить скачивание ролика или подписку на канал (параметры по умолчанию).
 */

import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { requireDownloadDeps } from '@/lib/deps';
import { ensureQueueWorker } from '@/lib/queue-worker';
import {
  buildYouTubeChannelUrl,
  getChannelInfo,
  getChannelVideosSince,
  getVideoInfo,
  isPermanentDownloadError,
  isYouTubeUrl,
  type VideoInfo,
} from '@/lib/ytdlp';
import { downloadAndSaveChannelAvatar } from '@/lib/avatars';
import { downloadAndSaveVideoThumbnail } from '@/lib/thumbnails';
import { getDownloadPathAsync } from '@/lib/settings';
import { logTelegramUserBot } from '@/lib/telegram-user-bot-log';
import { escapeHtmlTelegram } from '@/lib/telegram';

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

/** Сообщение целиком — одна строка с http(s) URL. */
export function extractSingleUrlFromMessageText(text: string | undefined): string | null {
  if (!text?.trim()) return null;
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length !== 1) return null;
  try {
    const u = new URL(lines[0]);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Грубая классификация ссылки YouTube (до вызова yt-dlp).
 * Плейлисты и служебные страницы — отдельно.
 */
export function classifyYouTubeUrlForBot(url: string): 'video' | 'channel' | 'unsupported' {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!host.includes('youtube.com') && !host.includes('youtu.be')) {
      return 'unsupported';
    }

    if (host.includes('youtu.be')) {
      const seg = u.pathname.replace(/^\//, '').split('/')[0] ?? '';
      return /^[A-Za-z0-9_-]{11}$/.test(seg) ? 'video' : 'unsupported';
    }

    const path = u.pathname;
    const pl = path.toLowerCase();

    if (pl.includes('/playlist')) return 'unsupported';
    if (pl.includes('/results')) return 'unsupported';
    if (pl === '/feed' || pl.startsWith('/feed/')) return 'unsupported';

    if (path === '/watch' || path.startsWith('/watch/') || u.searchParams.get('v')) return 'video';
    if (path.includes('/shorts/')) return 'video';
    if (/\/live\/[^/]+/.test(path)) return 'video';
    if (path.includes('/embed/')) return 'video';

    if (path.startsWith('/@')) return 'channel';
    if (path.startsWith('/channel/')) return 'channel';
    if (path.startsWith('/c/')) return 'channel';
    if (path.startsWith('/user/')) return 'channel';

    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

async function enqueueBackfillSubscription(subscriptionId: string): Promise<void> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { channel: true },
  });
  if (!sub || !sub.isActive) return;

  const channelUrl = buildYouTubeChannelUrl(sub.channel.platformId);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - sub.downloadDays);

  const videos = await getChannelVideosSince(channelUrl, cutoffDate, 200);

  for (const v of videos) {
    const watchUrl = `https://www.youtube.com/watch?v=${v.id}`;
    const [existingVideo, existingTask] = await Promise.all([
      db.video.findUnique({ where: { platformId: v.id }, select: { id: true } }),
      db.downloadTask.findFirst({ where: { url: watchUrl }, select: { id: true } }),
    ]);

    if (!existingVideo && !existingTask) {
      await db.downloadTask.create({
        data: {
          url: watchUrl,
          title: v.title,
          quality: sub.preferredQuality || 'best',
          format: 'mp4',
          status: 'pending',
          subscriptionId: sub.id,
          isAutoSubscriptionTask: true,
        },
      });
    }
  }

  await db.subscription.update({
    where: { id: sub.id },
    data: { lastCheckAt: new Date() },
  });
}

async function addYouTubeVideoDownloadForUser(userId: string, url: string, baseUrl: string): Promise<string> {
  const deps = await requireDownloadDeps();
  if (!deps.ok) {
    logTelegramUserBot('warn', 'youtube_url_deps_missing', {});
    return [
      'На сервере недоступны yt-dlp/ffmpeg — скачивание из Telegram сейчас невозможно.',
      '',
      `<a href="${escapeHtmlTelegram(baseUrl)}">Открыть приложение</a>`,
    ].join('\n');
  }

  let videoInfo: VideoInfo;
  try {
    videoInfo = await getVideoInfo(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logTelegramUserBot('warn', 'youtube_video_getinfo_failed', { message: msg });
    return [
      'Не удалось получить информацию о ролике. Проверьте, что это ссылка на доступное видео YouTube.',
      '',
      `<a href="${escapeHtmlTelegram(baseUrl)}">Открыть приложение</a>`,
    ].join('\n');
  }

  const platformChannelId =
    videoInfo.channel_id ||
    videoInfo.uploader_id ||
    (videoInfo.uploader ? `uploader:${videoInfo.uploader}` : '');

  if (!platformChannelId) {
    return 'Не удалось определить канал для этого видео.';
  }

  const channelName = videoInfo.channel || videoInfo.uploader || 'Unknown';
  const quality = env.defaultQuality() || 'best';
  const format = 'mp4';

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

  const userSubscription = await db.subscription.findFirst({
    where: { userId, channelId: channel.id },
    select: { id: true },
  });

  const avatarUrl = videoInfo.thumbnails?.[0]?.url;
  if (avatarUrl) {
    void downloadAndSaveChannelAvatar(avatarUrl, platformChannelId, getDownloadPathAsync)
      .then((avatarPath) => {
        if (avatarPath) {
          return db.channel.update({ where: { id: channel.id }, data: { avatarPath } });
        }
      })
      .catch(() => {});
  }

  const existingVideo = await db.video.findUnique({
    where: { platformId: videoInfo.id },
  });

  if (existingVideo && existingVideo.filePath) {
    if (!userSubscription) {
      await db.userIndividualVideo.upsert({
        where: {
          userId_videoId: { userId, videoId: existingVideo.id },
        },
        create: { userId, videoId: existingVideo.id },
        update: {},
      });
    }
    const watch = `${baseUrl.replace(/\/$/, '')}/watch/${encodeURIComponent(existingVideo.id)}?fs=1`;
    return [
      'Это видео уже есть в медиатеке.',
      '',
      `<a href="${watch}">Открыть в приложении</a>`,
    ].join('\n');
  }

  const thumbnailUrl = videoInfo.thumbnail || `https://img.youtube.com/vi/${videoInfo.id}/maxresdefault.jpg`;

  const video =
    existingVideo ??
    (await db.video.create({
      data: {
        platformId: videoInfo.id,
        channelId: channel.id,
        title: videoInfo.title,
        description: videoInfo.description?.slice(0, 2000),
        duration: videoInfo.duration,
        thumbnailUrl,
        thumbnailPath: null,
        quality,
        format,
        viewCount: videoInfo.view_count ? BigInt(videoInfo.view_count) : null,
        publishedAt: videoInfo.upload_date
          ? new Date(
              parseInt(videoInfo.upload_date.slice(0, 4), 10),
              parseInt(videoInfo.upload_date.slice(4, 6), 10) - 1,
              parseInt(videoInfo.upload_date.slice(6, 8), 10)
            )
          : null,
      },
    }));

  if (!existingVideo) {
    void downloadAndSaveVideoThumbnail(thumbnailUrl, videoInfo.id, getDownloadPathAsync)
      .then((thumbnailPath) => {
        if (thumbnailPath) {
          return db.video.update({ where: { id: video.id }, data: { thumbnailPath } });
        }
      })
      .catch(() => {});
  }

  const previousFailed = await db.downloadTask.findFirst({
    where: { url, status: 'failed' },
    select: { errorMsg: true },
    orderBy: { completedAt: 'desc' },
  });
  if (previousFailed?.errorMsg && isPermanentDownloadError(previousFailed.errorMsg)) {
    return 'Это видео недоступно для загрузки (участники, приватное или удалено).';
  }

  await db.downloadTask.create({
    data: {
      url,
      title: videoInfo.title,
      quality,
      format,
      status: 'pending',
      startedAt: null,
      videoId: video.id,
      subscriptionId: userSubscription?.id,
      isAutoSubscriptionTask: false,
    },
  });

  if (!userSubscription) {
    await db.userIndividualVideo.upsert({
      where: {
        userId_videoId: { userId, videoId: video.id },
      },
      create: { userId, videoId: video.id },
      update: {},
    });
  }

  ensureQueueWorker();
  logTelegramUserBot('info', 'youtube_url_download_enqueued', { userId, title: videoInfo.title });
  return [
    'Загрузка добавлена в очередь.',
    '',
    `<b>${escapeHtmlTelegram(videoInfo.title)}</b>`,
    '',
    `<a href="${escapeHtmlTelegram(baseUrl.replace(/\/$/, ''))}">Открыть приложение</a>`,
  ].join('\n');
}

async function addYouTubeChannelSubscriptionForUser(
  userId: string,
  channelUrl: string,
  baseUrl: string
): Promise<string> {
  ensureQueueWorker();

  const defaultDays = env.defaultSubscriptionHistoryDays();
  const defaultQuality = env.defaultQuality();
  const effectiveDays = toInt(undefined, defaultDays);
  const effectiveQuality = (defaultQuality ?? 'best').toString();
  const checkInterval = env.defaultCheckInterval();
  const allowedAutoDeleteValues = [0, 7, 14, 30, 60, 90];
  const rawAutoDelete = toInt(undefined, 30);
  const effectiveAutoDeleteDays = allowedAutoDeleteValues.includes(rawAutoDelete) ? rawAutoDelete : 30;

  let channelInfo: { id: string; name: string; description?: string; avatar?: string };
  try {
    channelInfo = await getChannelInfo(channelUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logTelegramUserBot('warn', 'youtube_channel_getinfo_failed', { message: msg });
    return [
      'Не удалось получить данные канала. Убедитесь, что ссылка ведёт на канал YouTube с публичными видео.',
      '',
      `<a href="${escapeHtmlTelegram(baseUrl)}">Открыть приложение</a>`,
    ].join('\n');
  }

  if (!channelInfo.id?.trim()) {
    return 'Не удалось определить ID канала.';
  }

  const channel = await db.channel.upsert({
    where: { platformId: channelInfo.id },
    create: {
      platform: 'youtube',
      platformId: channelInfo.id,
      name: channelInfo.name,
      description: channelInfo.description,
      avatarUrl: channelInfo.avatar,
    },
    update: {
      name: channelInfo.name,
      description: channelInfo.description,
      avatarUrl: channelInfo.avatar,
      lastCheckedAt: new Date(),
    },
  });

  if (channelInfo.avatar) {
    const avatarPath = await downloadAndSaveChannelAvatar(
      channelInfo.avatar,
      channelInfo.id,
      getDownloadPathAsync
    );
    if (avatarPath) {
      await db.channel.update({
        where: { id: channel.id },
        data: { avatarPath },
      });
    }
  }

  const existing = await db.subscription.findFirst({
    where: { channelId: channel.id, userId },
  });

  if (existing) {
    return [
      'Подписка на этот канал уже есть.',
      '',
      `<b>${escapeHtmlTelegram(channelInfo.name)}</b>`,
      '',
      `<a href="${escapeHtmlTelegram(baseUrl.replace(/\/$/, ''))}">Открыть приложение</a>`,
    ].join('\n');
  }

  const subscription = await db.subscription.create({
    data: {
      userId,
      channelId: channel.id,
      downloadDays: effectiveDays,
      autoDeleteDays: effectiveAutoDeleteDays,
      preferredQuality: effectiveQuality,
      checkInterval,
      isActive: true,
    },
  });

  void enqueueBackfillSubscription(subscription.id).catch((e) => {
    console.error('[telegram-user-bot] enqueueBackfillSubscription', e);
  });

  logTelegramUserBot('info', 'youtube_url_subscription_created', { userId, channelId: channel.id });
  return [
    'Подписка на канал добавлена (параметры по умолчанию). Идёт подбор видео за выбранный период.',
    '',
    `<b>${escapeHtmlTelegram(channelInfo.name)}</b>`,
    '',
    `<a href="${escapeHtmlTelegram(baseUrl.replace(/\/$/, ''))}">Открыть приложение</a>`,
  ].join('\n');
}

/**
 * Обрабатывает одну YouTube-ссылку для пользователя сайта (по userId).
 */
export async function runTelegramYouTubeUrlAction(
  userId: string,
  url: string,
  baseUrl: string
): Promise<string> {
  if (!isYouTubeUrl(url)) {
    return 'Поддерживаются только ссылки на YouTube.';
  }

  const kind = classifyYouTubeUrlForBot(url);
  if (kind === 'unsupported') {
    return [
      'Эта страница YouTube не поддерживается. Отправьте ссылку на <b>ролик</b> или на <b>канал</b> (не плейлист).',
      '',
      `<a href="${escapeHtmlTelegram(baseUrl)}">Открыть приложение</a>`,
    ].join('\n');
  }

  if (kind === 'video') {
    return addYouTubeVideoDownloadForUser(userId, url, baseUrl);
  }

  return addYouTubeChannelSubscriptionForUser(userId, url, baseUrl);
}
