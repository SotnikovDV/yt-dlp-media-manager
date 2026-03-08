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

/** Общие аргументы для всех вызовов yt-dlp: JS-рантайм для YouTube, таймаут, EJS. */
function getYtDlpGlobalArgs(): string[] {
  const args = ['--js-runtimes', 'node', '--remote-components', 'ejs:github'];
  const timeout = process.env.YTDLP_SOCKET_TIMEOUT?.trim();
  if (timeout) {
    const sec = Number.parseInt(timeout, 10);
    if (Number.isFinite(sec) && sec > 0) {
      args.push('--socket-timeout', String(sec));
    }
  }
  return args;
}

function addFfmpegLocation(args: string[]) {
  const ffmpegPath = getFfmpegPath();
  const prefix = [...getYtDlpGlobalArgs(), ...(ffmpegPath ? ['--ffmpeg-location', ffmpegPath] : [])];
  return [...prefix, ...args];
}

function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase().includes('youtube.com') || u.hostname.toLowerCase().includes('youtu.be');
  } catch {
    return false;
  }
}

/** Сетевые/временные ошибки, для которых не нужно выводить полный stderr в консоль. */
function isTransientNetworkError(stderrOrMessage: string): boolean {
  const s = stderrOrMessage.toLowerCase();
  return (
    s.includes('connection aborted') ||
    s.includes('connectionreset') ||
    s.includes('connection reset') ||
    s.includes('unable to download') ||
    s.includes('econnreset') ||
    s.includes('etimedout') ||
    s.includes('socket hang up')
  );
}

/** Строит URL канала YouTube для yt-dlp. platformId может быть UC... или @handle. */
export function buildYouTubeChannelUrl(platformId: string): string {
  if (platformId?.startsWith('@')) {
    return `https://www.youtube.com/${platformId}`;
  }
  return `https://www.youtube.com/channel/${platformId}`;
}

/** Добавляет языковой аргумент для YouTube, не меняя тип клиента. */
function withYouTubeLangArgs(args: string[], url: string): { args: string[]; hadLang: boolean } {
  if (!isYouTubeUrl(url)) return { args, hadLang: false };
  return {
    args: [...args, '--extractor-args', 'youtube:lang=ru'],
    hadLang: true,
  };
}

/** Для YouTube без lang не добавляем никаких специальных аргументов (retry после ошибки с lang). */
function withYouTubeArgsNoLang(args: string[], _url: string): string[] {
  return args;
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

/** Формат-селектор без приоритета русского аудио — для ретрая при ошибках. */
function buildFormatSelectorLegacy(quality: string | undefined): string {
  const q = (quality ?? 'best').toString().trim().toLowerCase();
  if (!q || q === 'best') return 'bv*+ba/best';
  const n = Number.parseInt(q.replace(/[^\d]/g, ''), 10);
  if (Number.isFinite(n) && n > 0) {
    return `bv*[height<=${n}]+ba/b*[height<=${n}]/b`;
  }
  return quality as string;
}

/** Максимально мягкий селектор — берёт любой доступный формат. Для ретрая при "Requested format is not available". */
const FORMAT_SELECTOR_BEST = 'bv*+ba/best';

function buildFormatSelector(quality: string | undefined, preferRussianAudio = true): string {
  if (!preferRussianAudio) return buildFormatSelectorLegacy(quality);
  const q = (quality ?? 'best').toString().trim().toLowerCase();
  if (!q || q === 'best') {
    return 'bv*+ba[language^=ru]/bv*+ba/best';
  }
  const n = Number.parseInt(q.replace(/[^\d]/g, ''), 10);
  if (Number.isFinite(n) && n > 0) {
    return `bv*[height<=${n}]+ba[language^=ru]/bv*[height<=${n}]+ba/b*[height<=${n}]/b`;
  }
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
    const commonArgs = [
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--no-playlist',
    ];
    if (fast) {
      // Минимизируем число запросов, но без привязки к языку — язык добавим ниже.
      commonArgs.push('--extractor-args', 'youtube:player_skip=webpage,configs');
    }

    const run = (useLang: boolean) => {
      let argsBase = [...commonArgs];
      if (isYouTubeUrl(url)) {
        argsBase = useLang ? withYouTubeLangArgs(argsBase, url).args : withYouTubeArgsNoLang(argsBase, url);
      }
      argsBase.push(url);
      const args = addFfmpegLocation(argsBase);

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
          return;
        }

        // При ошибке с языковыми аргументами — пробуем ещё раз по старой схеме.
        if (useLang && isYouTubeUrl(url)) {
          if (isTransientNetworkError(stderr)) {
            console.warn('[yt-dlp] getVideoInfoUncached: network error, retrying without lang.');
          } else {
            console.error('getVideoInfoUncached with lang args failed, retrying without lang. Stderr:', stderr);
          }
          run(false);
        } else {
          reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (err) => {
        if (useLang && isYouTubeUrl(url)) {
          if (isTransientNetworkError(err.message)) {
            console.warn('[yt-dlp] getVideoInfoUncached: network error, retrying without lang.');
          } else {
            console.error('Failed to start yt-dlp with lang args, retrying without lang.', err);
          }
          run(false);
        } else {
          reject(new Error(`Failed to start yt-dlp: ${err.message}`));
        }
      });
    };

    // Для YouTube сначала пробуем с русской локализацией, при сбое откатываемся.
    run(isYouTubeUrl(url));
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
    const commonArgs = [
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--match-filter', 'availability = public',
       '--flat-playlist',
      '--playlist-end', '1',
    ];

    const run = (useLang: boolean) => {
      let argsBase = [...commonArgs];
      if (isYouTubeUrl(normalizedUrl)) {
        argsBase = useLang ? withYouTubeLangArgs(argsBase, normalizedUrl).args : withYouTubeArgsNoLang(argsBase, normalizedUrl);
      }
      argsBase.push(normalizedUrl);
      const args = addFfmpegLocation(argsBase);

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
            // У flat-playlist для канала channel_id/uploader_id могут быть null, берём playlist_channel_id
            resolve({
              id: info.channel_id || info.uploader_id || info.playlist_channel_id || '',
              name: info.channel || info.uploader || info.playlist_channel || 'Unknown Channel',
              description: info.description?.slice(0, 500),
              avatar: info.thumbnails?.[0]?.url
            });
          } catch (e) {
            reject(new Error(`Failed to parse channel info: ${e}`));
          }
          return;
        } else if (code === 0 && !stdout.trim()) {
          reject(new Error('No public videos found on this channel. Add a public video or use a channel with public content.'));
          return;
        }

        if (useLang && isYouTubeUrl(normalizedUrl)) {
          if (isTransientNetworkError(stderr)) {
            console.warn('[yt-dlp] getChannelInfo: network error, retrying without lang.');
          } else {
            console.error('getChannelInfo with lang args failed, retrying without lang. Stderr:', stderr);
          }
          run(false);
        } else {
          reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (err) => {
        if (useLang && isYouTubeUrl(normalizedUrl)) {
          if (isTransientNetworkError(err.message)) {
            console.warn('[yt-dlp] getChannelInfo: network error, retrying without lang.');
          } else {
            console.error('Failed to start yt-dlp for getChannelInfo with lang args, retrying without lang.', err);
          }
          run(false);
        } else {
          reject(new Error(`Failed to start yt-dlp: ${err.message}`));
        }
      });
    };

    run(isYouTubeUrl(normalizedUrl));
  });
}

// Получить последние видео с канала
export async function getChannelVideos(channelUrl: string, limit: number = 50): Promise<VideoInfo[]> {
  assertHttpUrl(channelUrl);
  return new Promise((resolve, reject) => {
    const commonArgs = [
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--flat-playlist',
      '--playlist-end', String(limit),
    ];

    const run = (useLang: boolean) => {
      let argsBase = [...commonArgs];
      if (isYouTubeUrl(channelUrl)) {
        argsBase = useLang ? withYouTubeLangArgs(argsBase, channelUrl).args : withYouTubeArgsNoLang(argsBase, channelUrl);
      }
      argsBase.push(channelUrl);
      const args = addFfmpegLocation(argsBase);

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
          return;
        }

        if (useLang && isYouTubeUrl(channelUrl)) {
          if (isTransientNetworkError(stderr)) {
            console.warn('[yt-dlp] getChannelVideos: network error, retrying without lang.');
          } else {
            console.error('getChannelVideos with lang args failed, retrying without lang. Stderr:', stderr);
          }
          run(false);
        } else {
          reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (err) => {
        if (useLang && isYouTubeUrl(channelUrl)) {
          if (isTransientNetworkError(err.message)) {
            console.warn('[yt-dlp] getChannelVideos: network error, retrying without lang.');
          } else {
            console.error('Failed to start yt-dlp for getChannelVideos with lang args, retrying without lang.', err);
          }
          run(false);
        } else {
          reject(new Error(`Failed to start yt-dlp: ${err.message}`));
        }
      });
    };

    run(isYouTubeUrl(channelUrl));
  });
}

function toYtDlpDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

const YYYYMMDD_RE = /^\d{8}$/;

/** Извлекает дату публикации в формате YYYYMMDD. Fallback на release_timestamp/timestamp при отсутствии upload_date. */
function getUploadDateStr(v: { upload_date?: string; release_timestamp?: number; timestamp?: number }): string | null {
  const ud = v.upload_date;
  if (typeof ud === 'string' && ud && ud !== 'NA' && YYYYMMDD_RE.test(ud)) return ud;
  const ts = v.release_timestamp ?? v.timestamp;
  if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
    const d = new Date(ts * 1000);
    return toYtDlpDate(d);
  }
  return null;
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
    const commonArgs = [
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--flat-playlist',
      '--dateafter', cutoffStr,
      '--playlist-end', String(limit),
    ];

    const run = (useLang: boolean) => {
      let argsBase = [...commonArgs];
      if (isYouTubeUrl(videosTabUrl)) {
        argsBase.push('--extractor-args', 'youtubetab:approximate_date');
        argsBase = useLang ? withYouTubeLangArgs(argsBase, videosTabUrl).args : withYouTubeArgsNoLang(argsBase, videosTabUrl);
      }
      argsBase.push(videosTabUrl);
      const args = addFfmpegLocation(argsBase);

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
            const parsed = lines.map((line) => JSON.parse(line)) as VideoInfo[];
            let skippedNoDate = 0;
            let skippedOld = 0;
            const videos = parsed.filter((v) => {
              const ud = getUploadDateStr(v);
              if (!ud) {
                skippedNoDate++;
                return false;
              }
              if (ud < cutoffStr) {
                skippedOld++;
                return false;
              }
              return true;
            });

            if (parsed.length > 0) {
              // Если yt-dlp не даёт даты ни для одного видео — не можем фильтровать по дате.
              // Fallback: берём только первые N записей (плейлист /videos обычно «сначала новые»),
              // чтобы не ставить в очередь десятки старых видео, которых нет в БД.
              const NO_DATE_FALLBACK_TAKE = 20;
              if (videos.length === 0 && skippedNoDate > 0 && skippedOld === 0) {
                const fallbackSlice = parsed.slice(0, NO_DATE_FALLBACK_TAKE);
                console.warn(
                  '[yt-dlp] getChannelVideosSince fallback by no-date:',
                  parsed.length,
                  'entries, returning first',
                  fallbackSlice.length,
                  'for cutoff',
                  cutoffStr
                );
                resolve(fallbackSlice);
                return;
              }

              if (skippedNoDate > 0 || skippedOld > 0) {
                console.warn(
                  '[yt-dlp] getChannelVideosSince filtered:',
                  parsed.length,
                  '->',
                  videos.length,
                  '(no date:',
                  skippedNoDate,
                  'older than',
                  cutoffStr + ':',
                  skippedOld,
                  ')'
                );
              }
            }

            resolve(videos);
          } catch (e) {
            reject(new Error(`Failed to parse channel videos: ${e}`));
          }
          return;
        } else if (code === 0) {
          console.warn('[yt-dlp] getChannelVideosSince: exit 0 but empty stdout for', videosTabUrl);
          resolve([]);
          return;
        }

        if (useLang && isYouTubeUrl(videosTabUrl)) {
          if (isTransientNetworkError(stderr)) {
            console.warn('[yt-dlp] getChannelVideosSince: network error, retrying without lang.');
          } else {
            console.error('getChannelVideosSince with lang args failed, retrying without lang. Stderr:', stderr);
          }
          run(false);
        } else {
          reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (err) => {
        if (useLang && isYouTubeUrl(videosTabUrl)) {
          if (isTransientNetworkError(err.message)) {
            console.warn('[yt-dlp] getChannelVideosSince: network error, retrying without lang.');
          } else {
            console.error('Failed to start yt-dlp for getChannelVideosSince with lang args, retrying without lang.', err);
          }
          run(false);
        } else {
          reject(new Error(`Failed to start yt-dlp: ${err.message}`));
        }
      });
    };

    run(isYouTubeUrl(videosTabUrl));
  });
}

// Активные процессы скачивания
const activeDownloads = new Map<string, ChildProcess>();

function looksLikePath(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const hasSep = /[\\/]/.test(t);
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(t);
  return hasSep && hasExt;
}

/** Один прогон yt-dlp. При ошибке можно повторить с другим formatSelector. */
function runDownloadAttempt(
  taskId: string,
  url: string,
  outputFolder: string,
  quality: string,
  format: string,
  onProgress: DownloadOptions['onProgress'],
  preferRussianAudio: boolean,
  writeThumbnail: boolean,
  formatSelectorOverride?: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const outputTemplate = path.join(
      outputFolder,
      '%(channel_id,uploader_id|unknown)s',
      '%(upload_date>%Y-%m-%d,release_date>%Y-%m-%d|unknown)s-%(id)s.%(ext)s'
    );

    const formatSelector = formatSelectorOverride ?? buildFormatSelector(quality, preferRussianAudio);

    const baseArgs = [
      '--newline',
      '--progress',
      '--progress-template',
      '%(progress._percent_str)s|%(progress._status)s|%(progress.filename)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s',
      '--print',
      'after_move:filepath',
      '-f',
      formatSelector,
      '--merge-output-format',
      format,
      '-o',
      outputTemplate,
      writeThumbnail ? '--write-thumbnail' : '--no-write-thumbnail',
      '--write-info-json',
      url,
    ];

    const args = addFfmpegLocation(baseArgs);
    const proc = spawn(getYtDlpCmd(), args, { windowsHide: true });
    activeDownloads.set(taskId, proc);

    let lastProgress = 0;
    let filePath = '';
    let stderr = '';
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const handleLine = (lineRaw: string) => {
      const line = lineRaw.trim();
      if (!line) return;

      if (line.includes('|')) {
        const parts = line.split('|', 5);
        const [percentRaw, statusRaw, filenameRaw, downloadedRaw, totalRaw] = parts;
        const percent = percentRaw?.replace('%', '').trim();
        const progress = percent ? Number(percent) : NaN;
        const status = (statusRaw || 'downloading').trim();
        if (!Number.isNaN(progress)) lastProgress = progress;
        const parseBytes = (s: string | undefined): number | null => {
          if (s == null) return null;
          const t = String(s).trim();
          if (t === '' || t === 'N/A' || t.toLowerCase() === 'none') return null;
          const n = Number(t);
          return Number.isFinite(n) && n >= 0 ? n : null;
        };
        const downloadedBytes = parseBytes(downloadedRaw);
        const totalBytes = parseBytes(totalRaw);
        onProgress?.({
          progress: Math.round(Number.isNaN(progress) ? lastProgress : progress),
          status,
          downloadedBytes: downloadedBytes ?? undefined,
          totalBytes: totalBytes ?? undefined,
        });
        if (filenameRaw && looksLikePath(filenameRaw)) filePath = filenameRaw.trim();
        return;
      }
      if (looksLikePath(line)) filePath = line;
      const fileMatch = line.match(/\[Merger\] Merging formats into "(.+)"|\[download\] Destination: (.+)/);
      if (fileMatch) {
        const candidate = (fileMatch[1] || fileMatch[2] || '').trim();
        if (candidate) filePath = candidate;
      }
    };

    const splitLines = (buf: string) => buf.split(/\r?\n|\r/);

    proc.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      const lines = splitLines(stdoutBuffer);
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      stderrBuffer += data.toString();
      const lines = splitLines(stderrBuffer);
      stderrBuffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
    });

    proc.on('close', (code) => {
      activeDownloads.delete(taskId);
      if (code === 0) {
        onProgress?.({ progress: 100, status: 'completed' });
        resolve({ success: true, filePath });
      } else {
        resolve({ success: false, error: `yt-dlp exited with code ${code}: ${stderr.trim()}`.trim() });
      }
    });

    proc.on('error', (err) => {
      activeDownloads.delete(taskId);
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

function isFormatNotAvailableError(error: string): boolean {
  const lower = error.toLowerCase();
  return lower.includes('requested format is not available') || lower.includes('format is not available');
}

/** Ошибки, при которых повторная загрузка бессмысленна (members-only, private, удалено и т.п.). */
export function isPermanentDownloadError(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes('members-only') ||
    lower.includes('join this channel to get access') ||
    lower.includes('private video') ||
    lower.includes('video unavailable') ||
    lower.includes('this video has been removed') ||
    lower.includes('video is private') ||
    lower.includes('sign in to confirm your age') ||
    lower.includes('video requires payment')
  );
}

/** Скачать видео. При ошибке — каскад ретраев: без RU аудио → мягкий селектор формата. */
export async function downloadVideo(
  taskId: string,
  options: DownloadOptions
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  const defaultOutputFolder = process.env.DOWNLOAD_PATH?.trim() || path.join(process.cwd(), 'downloads');
  const { url, quality = 'best', format = 'mp4', outputFolder = defaultOutputFolder, onProgress } = options;
  assertHttpUrl(url);

  let result = await runDownloadAttempt(
    taskId,
    url,
    outputFolder,
    quality,
    format,
    onProgress,
    true,  // preferRussianAudio
    true   // writeThumbnail
  );

  if (result.success) return result;
  if (isPermanentDownloadError(result.error ?? '')) return result;

  console.warn('[yt-dlp] Download failed, retrying without Russian audio and without thumbnail:', result.error);
  result = await runDownloadAttempt(
    taskId,
    url,
    outputFolder,
    quality,
    format,
    onProgress,
    false,  // preferRussianAudio — упрощённый селектор
    false   // writeThumbnail — не лезем в i.ytimg.com
  );

  if (result.success) return result;
  if (isPermanentDownloadError(result.error ?? '')) return result;

  if (isFormatNotAvailableError(result.error ?? '')) {
    console.warn('[yt-dlp] Format not available, retrying with fallback selector best:', result.error);
    return runDownloadAttempt(
      taskId,
      url,
      outputFolder,
      quality,
      format,
      onProgress,
      false,
      false,
      FORMAT_SELECTOR_BEST
    );
  }

  return result;
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
