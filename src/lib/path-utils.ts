import path from 'path';
import { existsSync, readdirSync } from 'fs';

const VIDEO_EXT = ['.mp4', '.webm', '.mkv'];

const MAX_FILENAME_LENGTH = 150;
const UNSAFE_FILENAME_RE = /[\x00-\x1f\\/:*?"<>|]/g;

/**
 * Санитизирует строку для использования в имени файла при скачивании.
 * Убирает недопустимые символы, лишние пробелы, обрезает длину.
 */
export function sanitizeDownloadFilename(name: string): string {
  const cleaned = name
    .replace(UNSAFE_FILENAME_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.length > MAX_FILENAME_LENGTH
    ? cleaned.slice(0, MAX_FILENAME_LENGTH)
    : cleaned;
}

/** Проверка: cwd указывает на .next/standalone (standalone-сборка) */
function isStandaloneCwd(): boolean {
  const cwd = path.normalize(process.cwd());
  return path.basename(cwd) === 'standalone' && path.basename(path.dirname(cwd)) === '.next';
}

/** Базовые директории для поиска downloads (при cwd=.next/standalone файлы в корне проекта) */
export function getDownloadSearchDirs(configured: string): string[] {
  const dirs: string[] = [configured];
  if (isStandaloneCwd()) {
    const projectRoot = path.resolve(process.cwd(), '..', '..');
    dirs.push(path.join(projectRoot, 'downloads'));
    dirs.push(path.join(projectRoot, configured.replace(/^\.\//, '')));
  }
  if (configured !== './downloads') dirs.push('./downloads');
  return dirs;
}

/**
 * Нормализует путь к файлу в абсолютный для единообразного хранения и чтения.
 */
export function toAbsoluteFilePath(raw: string): string {
  const trimmed = raw.trim().replace(/^\.\//, '');
  if (path.isAbsolute(trimmed)) {
    return path.normalize(trimmed);
  }
  return path.resolve(process.cwd(), trimmed);
}

/**
 * Разрешает относительный путь относительно базовой директории (например DOWNLOAD_PATH).
 * Возвращает абсолютный путь. Разделители в relativePath могут быть / или \.
 */
export function resolvePathUnder(basePath: string, relativePath: string): string {
  const base = path.normalize(basePath);
  const trimmed = relativePath.trim().replace(/^\.\//, '').replace(/\\/g, '/');
  return path.join(base, trimmed);
}

/**
 * Преобразует абсолютный путь в относительный к базе (например к DOWNLOAD_PATH).
 * В БД храним относительные пути; разделители нормализуем в / для переносимости.
 */
export function toRelativeFilePath(absolutePath: string, basePath: string): string {
  const abs = path.normalize(absolutePath);
  const base = path.normalize(basePath);
  let rel = path.relative(base, abs);
  if (path.sep !== '/') rel = rel.split(path.sep).join('/');
  return rel.replace(/^\.\//, '');
}

/**
 * Ищет видеофайл по platformId (YouTube ID) в папке загрузок.
 * Имя файла: *-{platformId}.{ext}
 */
export function findVideoByPlatformId(
  downloadDir: string,
  platformId: string
): string | null {
  const absDir = toAbsoluteFilePath(downloadDir);
  if (!existsSync(absDir)) return null;

  const suffix = `-${platformId}`;
  const suffixAlt = platformId; // fallback: файл может содержать id в имени

  function scan(dir: string): string | null {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const found = scan(full);
          if (found) return found;
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (VIDEO_EXT.includes(ext)) {
            const base = path.basename(entry.name, ext);
            if (base.endsWith(suffix) || base.includes(platformId)) return full;
          }
        }
      }
    } catch {
      // ignore
    }
    return null;
  }
  return scan(absDir);
}

/**
 * Разрешает путь к видеофайлу. В БД хранится путь относительно DOWNLOAD_PATH (или устаревший абсолютный).
 * Возвращает абсолютный путь к файлу для чтения/стриминга.
 */
export async function resolveVideoFilePath(
  raw: string,
  getDownloadPath: () => Promise<string>,
  platformId?: string
): Promise<string> {
  const trimmed = raw.trim().replace(/^\.\//, '');
  const configured = await getDownloadPath();
  const downloadRoot = toAbsoluteFilePath(configured);

  // Если в БД относительный путь — собираем абсолютный от корня загрузок
  const primary = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.join(downloadRoot, trimmed);
  if (existsSync(primary)) return primary;

  const searchDirs = getDownloadSearchDirs(configured);

  // Поиск по platformId — надёжно при неверном пути в БД
  if (platformId) {
    for (const dir of searchDirs) {
      const found = findVideoByPlatformId(dir, platformId);
      if (found) return found;
    }
  }

  const parts = trimmed.split(/[/\\]/).filter(Boolean);

  const idx = parts.findIndex((p) => p === 'downloads-test' || p === 'downloads');
  if (idx >= 0 && idx < parts.length - 1) {
    const rest = parts.slice(idx + 1).join(path.sep);
    const configuredAbs = toAbsoluteFilePath(configured);

    const candidates: string[] = [
      path.join(configuredAbs, rest),
      path.join(process.cwd(), 'downloads', rest),
      path.join(process.cwd(), 'downloads-test', rest),
    ];
    if (isStandaloneCwd()) {
      const projectRoot = path.resolve(process.cwd(), '..', '..');
      candidates.push(path.join(projectRoot, 'downloads', rest));
      candidates.push(path.join(projectRoot, configured.replace(/^\.\//, ''), rest));
    }
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
  }

  return primary;
}
