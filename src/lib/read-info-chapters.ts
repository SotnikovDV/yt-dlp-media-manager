import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { resolveVideoFilePath } from '@/lib/path-utils';

export interface VideoChapter {
  startTime: number;
  endTime: number;
  title: string;
}

interface VideoWithPath {
  filePath: string;
  platformId: string;
}

type GetDownloadPath = () => Promise<string>;

/**
 * Читает главы из .info.json рядом с видео (формат yt-dlp).
 * Возвращает пустой массив, если файла нет, chapters отсутствует или произошла ошибка.
 */
export async function getChaptersForVideo(
  video: VideoWithPath,
  getDownloadPath: GetDownloadPath
): Promise<VideoChapter[]> {
  try {
    const videoPath = await resolveVideoFilePath(
      video.filePath,
      getDownloadPath,
      video.platformId
    );
    const dir = path.dirname(videoPath);
    const base = path.basename(videoPath, path.extname(videoPath));
    const infoPath = path.join(dir, `${base}.info.json`);

    if (!existsSync(infoPath)) return [];

    const raw = await readFile(infoPath, 'utf-8');
    const data = JSON.parse(raw) as {
      chapters?: Array<{
        start_time?: number;
        end_time?: number;
        title?: string;
      }>;
      duration?: number;
    };

    const chapters = data.chapters;
    if (!Array.isArray(chapters) || chapters.length === 0) return [];

    const duration = typeof data.duration === 'number' && Number.isFinite(data.duration)
      ? data.duration
      : undefined;

    const out: VideoChapter[] = [];
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const start = typeof ch.start_time === 'number' && Number.isFinite(ch.start_time)
        ? Math.max(0, ch.start_time)
        : 0;
      let end = typeof ch.end_time === 'number' && Number.isFinite(ch.end_time)
        ? ch.end_time
        : (duration ?? start);
      if (end < start) end = start;
      if (duration != null && end > duration) end = duration;
      const title = typeof ch.title === 'string' ? ch.title : '';
      out.push({ startTime: start, endTime: end, title });
    }
    return out;
  } catch {
    return [];
  }
}

/** Максимальная длина одного тега в символах (для обрезки из JSON) */
const MAX_TAG_LENGTH = 100;

/**
 * Читает теги (tags) из .info.json рядом с видео (формат yt-dlp).
 * Возвращает пустой массив, если файла нет, поля tags нет или произошла ошибка.
 */
export async function getTagsForVideo(
  video: VideoWithPath,
  getDownloadPath: GetDownloadPath
): Promise<string[]> {
  try {
    const videoPath = await resolveVideoFilePath(
      video.filePath,
      getDownloadPath,
      video.platformId
    );
    const dir = path.dirname(videoPath);
    const base = path.basename(videoPath, path.extname(videoPath));
    const infoPath = path.join(dir, `${base}.info.json`);

    if (!existsSync(infoPath)) return [];

    const raw = await readFile(infoPath, 'utf-8');
    const data = JSON.parse(raw) as { tags?: unknown };

    const tags = data.tags;
    if (!Array.isArray(tags)) return [];

    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tags) {
      const name = typeof t === 'string' ? t.trim().toLowerCase() : '';
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name.slice(0, MAX_TAG_LENGTH));
    }
    return out;
  } catch {
    return [];
  }
}
