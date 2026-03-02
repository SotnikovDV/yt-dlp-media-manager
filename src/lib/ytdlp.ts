import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { resolveToolCommand } from './deps';

function getYtDlpCmd() {
  return resolveToolCommand('yt-dlp');
}

function getFfmpegPath() {
  if (process.env.FFMPEG_PATH && process.env.FFMPEG_PATH.trim()) return process.env.FFMPEG_PATH.trim();
  const resolved = resolveToolCommand('ffmpeg');
  return resolved !== 'ffmpeg' ? resolved : undefined;
}

function addFfmpegLocation(args: string[]) {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) return args;
  return ['--ffmpeg-location', ffmpegPath, ...args];
}

export interface VideoInfo {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  thumbnail?: string;
  uploader?: string;
  uploader_id?: string;
  channel?: string;
  channel_id?: string;
  view_count?: number;
  upload_date?: string;
  formats?: FormatInfo[];
  thumbnails?: { url: string; width?: number; height?: number }[];
}

export interface FormatInfo {
  format_id: string;
  format_note?: string;
  ext: string;
  resolution?: string;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  vbr?: number;
  abr?: number;
}

export interface DownloadProgressInfo {
  progress: number;
  status: string;
  downloadedBytes?: number | null;
  totalBytes?: number | null;
}

export interface DownloadOptions {
  url: string;
  quality?: string;
  format?: string;
  outputFolder?: string;
  onProgress?: (info: DownloadProgressInfo) => void;
}

function buildFormatSelector(quality: string | undefined): string {
  const q = (quality ?? 'best').toString().trim().toLowerCase();
  if (!q || q === 'best') {
    // Лучшее доступное (с фолбэком на single-file)
    return 'bestvideo+bestaudio/best';
  }

  // Если качество задано числом (1080/720/480) — выбираем лучшее <= этого значения.
  const n = Number.parseInt(q.replace(/[^\d]/g, ''), 10);
  if (Number.isFinite(n) && n > 0) {
    // yt-dlp сам выберет 720 вместо 1080, если 1080 нет.
    // bv*+ba — раздельные потоки (требует ffmpeg), b* — single-file fallback.
    return `bv*[height<=${n}]+ba/b*[height<=${n}]/b`;
  }

  // Иначе считаем, что пользователь передал валидный format selector yt-dlp
  // (например, 'bestvideo[ext=mp4]+bestaudio/best').
  return quality as string;
}

function assertHttpUrl(url: string) {
  // Базовая защита: не даём yt-dlp работать с file:/ и другими схемами.
  // Для домашнего использования достаточно ограничить ввод на уровне API.
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Invalid URL scheme');
  } catch {
    throw new Error('Invalid URL');
  }
}

const VIDEO_INFO_CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут
const videoInfoCache = new Map<string, { value: VideoInfo; expiresAt: number }>();

function normalizeUrlForCache(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    u.searchParams.sort();
    return u.toString();
  } catch {
    return url;
  }
}

export interface GetVideoInfoOptions {
  /** Для YouTube: меньше запросов (player_skip=webpage,configs), может ускорить получение метаданных */
  fast?: boolean;
}

// Получить информацию о видео без скачивания (с кэшем по URL)
export async function getVideoInfo(url: string, options?: GetVideoInfoOptions): Promise<VideoInfo> {
  assertHttpUrl(url);
  const cacheKey = normalizeUrlForCache(url);
  const cached = videoInfoCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  const info = await getVideoInfoUncached(url, options?.fast ?? false);
  videoInfoCache.set(cacheKey, { value: info, expiresAt: Date.now() + VIDEO_INFO_CACHE_TTL_MS });
  return info;
}

async function getVideoInfoUncached(url: string, fast = false): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const baseArgs = [
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--no-playlist',
    ];
    if (fast) {
      baseArgs.push('--extractor-args', 'youtube:player_skip=webpage,configs');
    }
    baseArgs.push(url);
    const args = addFfmpegLocation(baseArgs);

    const process = spawn(getYtDlpCmd(), args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          // Может быть несколько JSON объектов для плейлистов
          const lines = stdout.trim().split('\n');
          const info = JSON.parse(lines[0]);
          resolve(info);
        } catch (e) {
          reject(new Error(`Failed to parse yt-dlp output: ${e}`));
        }
      } else {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
      }
    });

    process.on('error', (err) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

// Нормализация URL канала YouTube: для @handle и /channel/ ведём на вкладку /videos,
// чтобы yt-dlp стабильно получал список видео и первый элемент содержал channel_id.
function normalizeChannelUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().includes('youtube.com')) return url;
    const path = u.pathname.replace(/\/+$/, '') || '/';
    // Уже вкладка /videos — не трогаем
    if (/\/videos\/?$/i.test(path)) return url;
    // Канал: /@handle или /channel/UCxxx — добавляем /videos
    if (/^\/@[^/]+$/i.test(path) || /^\/channel\/[^/]+$/i.test(path)) {
      u.pathname = path + '/videos';
      return u.toString();
    }
  } catch {
    // ignore
  }
  return url;
}

// Получить информацию о канале
export async function getChannelInfo(url: string): Promise<{ id: string; name: string; description?: string; avatar?: string }> {
  assertHttpUrl(url);
  const normalizedUrl = normalizeChannelUrl(url);
  return new Promise((resolve, reject) => {
    const args = addFfmpegLocation([
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--match-filter', 'availability = public',
      '--playlist-end', '1',
      normalizedUrl
    ]);

    const process = spawn(getYtDlpCmd(), args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          const lines = stdout.trim().split('\n');
          const info = JSON.parse(lines[0]);
          resolve({
            id: info.channel_id || info.uploader_id || '',
            name: info.channel || info.uploader || 'Unknown Channel',
            description: info.description?.slice(0, 500),
            avatar: info.thumbnails?.[0]?.url
          });
        } catch (e) {
          reject(new Error(`Failed to parse channel info: ${e}`));
        }
      } else if (code === 0 && !stdout.trim()) {
        reject(new Error('No public videos found on this channel. Add a public video or use a channel with public content.'));
      } else {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
      }
    });

    process.on('error', (err) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

// Получить последние видео с канала
export async function getChannelVideos(channelUrl: string, limit: number = 50): Promise<VideoInfo[]> {
  assertHttpUrl(channelUrl);
  return new Promise((resolve, reject) => {
    const args = addFfmpegLocation([
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--flat-playlist',
      '--playlist-end', String(limit),
      channelUrl
    ]);

    const process = spawn(getYtDlpCmd(), args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          const lines = stdout.trim().split('\n').filter(Boolean);
          const videos = lines.map(line => JSON.parse(line));
          resolve(videos);
        } catch (e) {
          reject(new Error(`Failed to parse channel videos: ${e}`));
        }
      } else {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
      }
    });

    process.on('error', (err) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

function toYtDlpDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// Получить видео канала за период.
// 1) yt-dlp с --flat-playlist для канала может игнорировать --dateafter, поэтому фильтруем по upload_date в коде.
// 2) Запрашиваем только первые limit записей плейлиста. Предполагается, что для вкладки /videos порядок
//    «сначала новые» — иначе все limit записей могут оказаться старше dateAfter и нужные видео не попадут в ответ.
//    Вызывающий код должен задавать достаточный limit (например SUBSCRIPTION_CHECK_VIDEO_LIMIT).
export async function getChannelVideosSince(
  channelUrl: string,
  dateAfter: Date,
  limit: number = 200
): Promise<VideoInfo[]> {
  assertHttpUrl(channelUrl);
  const videosTabUrl = channelUrl.replace(/\/?$/, '/videos');
  const cutoffStr = toYtDlpDate(dateAfter);

  return new Promise((resolve, reject) => {
    const args = addFfmpegLocation([
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--flat-playlist',
      '--dateafter', cutoffStr,
      '--playlist-end', String(limit),
      videosTabUrl
    ]);

    const process = spawn(getYtDlpCmd(), args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          const lines = stdout.trim().split('\n').filter(Boolean);
          const parsed = lines.map((line) => JSON.parse(line));
          // Надёжная фильтрация по дате: с --flat-playlist yt-dlp для канала может вернуть старые видео
          const videos = parsed.filter((v: VideoInfo) => {
            const ud = v.upload_date;
            if (!ud || typeof ud !== 'string') return true; // даты нет — оставляем (редкий случай)
            return ud >= cutoffStr;
          });
          resolve(videos);
        } catch (e) {
          reject(new Error(`Failed to parse channel videos: ${e}`));
        }
      } else if (code === 0) {
        resolve([]);
      } else {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
      }
    });

    process.on('error', (err) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

// Активные процессы скачивания
const activeDownloads = new Map<string, ChildProcess>();

// Скачать видео
export async function downloadVideo(
  taskId: string,
  options: DownloadOptions
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  const defaultOutputFolder = process.env.DOWNLOAD_PATH?.trim() || path.join(process.cwd(), 'downloads');
  const { url, quality = 'best', format = 'mp4', outputFolder = defaultOutputFolder, onProgress } = options;
  assertHttpUrl(url);

  return new Promise((resolve, reject) => {
    // Папка по channel_id, имя файла: только дата и id (без title — избегаем кириллицы и проблем с путями)
    const outputTemplate = path.join(
      outputFolder,
      '%(channel_id,uploader_id|unknown)s',
      '%(upload_date>%Y-%m-%d,release_date>%Y-%m-%d|unknown)s-%(id)s.%(ext)s'
    );

    // Формируем аргументы для yt-dlp
    const args = addFfmpegLocation([
      '--newline', // Для парсинга прогресса
      '--progress',
      '--progress-template', '%(progress._percent_str)s|%(progress._status)s|%(progress.filename)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s',
      '--print', 'after_move:filepath',
      '-f', buildFormatSelector(quality),
      '--merge-output-format', format,
      '-o', outputTemplate,
      '--write-thumbnail',
      '--write-info-json',
      url
    ]);

    const process = spawn(getYtDlpCmd(), args, { windowsHide: true });
    activeDownloads.set(taskId, process);

    let lastProgress = 0;
    let filePath = '';
    let stderr = '';
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const looksLikePath = (s: string) => {
      const t = s.trim();
      if (!t) return false;
      // Абсолютный Windows путь или относительный с разделителями
      const hasSep = /[\\/]/.test(t);
      const hasExt = /\.[a-z0-9]{2,5}$/i.test(t);
      return hasSep && hasExt;
    };

    const handleLine = (lineRaw: string) => {
      const line = lineRaw.trim();
      if (!line) return;

      // Прогресс из --progress-template: "<percent>|<status>|<filename>|<downloaded_bytes>|<total_bytes>"
      if (line.includes('|')) {
        const parts = line.split('|', 5);
        const [percentRaw, statusRaw, filenameRaw, downloadedRaw, totalRaw] = parts;
        const percent = percentRaw?.replace('%', '').trim();
        const progress = percent ? Number(percent) : NaN;
        const status = (statusRaw || 'downloading').trim();
        if (!Number.isNaN(progress)) lastProgress = progress;
        const parseBytes = (s: string | undefined): number | null => {
          if (s === undefined || s === null) return null;
          const t = String(s).trim();
          if (t === '' || t === 'N/A' || t.toLowerCase() === 'none') return null;
          const n = Number(t);
          return Number.isFinite(n) && n >= 0 ? n : null;
        };
        const downloadedBytes = parseBytes(downloadedRaw);
        const totalBytes = parseBytes(totalRaw);
        if (onProgress) {
          onProgress({
            progress: Math.round(Number.isNaN(progress) ? lastProgress : progress),
            status,
            downloadedBytes: downloadedBytes ?? undefined,
            totalBytes: totalBytes ?? undefined,
          });
        }

        if (filenameRaw && looksLikePath(filenameRaw)) filePath = filenameRaw.trim();
        return;
      }

      // after_move:filepath из --print
      if (looksLikePath(line)) {
        filePath = line;
        return;
      }

      // Ищем путь к итоговому файлу в логах yt-dlp
      const fileMatch = line.match(/\[Merger\] Merging formats into "(.+)"|\[download\] Destination: (.+)/);
      if (fileMatch) {
        const candidate = (fileMatch[1] || fileMatch[2] || '').trim();
        if (candidate) filePath = candidate;
      }
    };

    // yt-dlp на Windows часто выводит прогресс с \r (без \n), разбираем оба варианта
    const splitLines = (buf: string) => {
      const lines = buf.split(/\r?\n|\r/);
      return lines;
    };

    process.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      const lines = splitLines(stdoutBuffer);
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
    });

    process.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      stderrBuffer += chunk;
      const lines = splitLines(stderrBuffer);
      stderrBuffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
    });

    process.on('close', async (code) => {
      activeDownloads.delete(taskId);

      if (code === 0) {
        if (onProgress) {
          onProgress({ progress: 100, status: 'completed' });
        }
        resolve({ success: true, filePath });
      } else {
        resolve({ success: false, error: `yt-dlp exited with code ${code}: ${stderr.trim()}`.trim() });
      }
    });

    process.on('error', (err) => {
      activeDownloads.delete(taskId);
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

// Отменить скачивание
export function cancelDownload(taskId: string): boolean {
  const process = activeDownloads.get(taskId);
  if (process) {
    // На Windows SIGTERM может игнорироваться, но kill() всё равно завершит процесс.
    process.kill('SIGTERM');
    activeDownloads.delete(taskId);
    return true;
  }
  return false;
}

// Получить доступные форматы
export async function getAvailableFormats(url: string): Promise<FormatInfo[]> {
  const info = await getVideoInfo(url);
  return info.formats || [];
}

// Проверка доступности yt-dlp
export async function checkYtDlp(): Promise<{ installed: boolean; version?: string }> {
  return new Promise((resolve) => {
    const process = spawn(getYtDlpCmd(), ['--version'], { windowsHide: true });
    let stdout = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve({ installed: true, version: stdout.trim() });
      } else {
        resolve({ installed: false });
      }
    });

    process.on('error', () => {
      resolve({ installed: false });
    });
  });
}
