import { toast } from 'sonner';

/** Подсказка для имени файла AAC (совпадает с расширением от API). */
export function suggestedAudioDownloadName(video: {
  id: string;
  title: string;
  platformId?: string;
}): string {
  const raw =
    video.title
      .replace(/[\x00-\x1f\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || video.platformId || video.id;
  const base = raw || 'audio';
  return `${base}.m4a`;
}

function parseFilenameFromContentDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const star = cd.match(/filename\*\s*=\s*UTF-8''([^;\s]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/['"]/g, ''));
    } catch {
      /* ignore */
    }
  }
  const quoted = cd.match(/filename\s*=\s*"((?:\\"|[^"])*)"/i);
  if (quoted?.[1]) return quoted[1].replace(/\\"/g, '"');
  const unquoted = cd.match(/filename\s*=\s*([^;\s]+)/i);
  if (unquoted?.[1]) return unquoted[1].replace(/^["']|["']$/g, '');
  return null;
}

const AUDIO_DOWNLOAD_TOAST_NAME_MAX = 72;

function truncateForToastFilename(name: string, max: number): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

/**
 * Скачивание через fetch: ход процесса — пульсация заголовка «Media Manager» (см. app-shell + очередь).
 * По завершении — короткий тост с именем файла. Blob в памяти.
 */
export async function fetchAndSavePreparedAudio(video: {
  id: string;
  title: string;
  platformId?: string;
}): Promise<void> {
  const url = `/api/videos/${video.id}/audio?download=1`;
  const fallbackName = suggestedAudioDownloadName(video);
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) {
      let detail = '';
      try {
        const j = (await res.json()) as { error?: string; details?: string };
        detail = (j.details || j.error || '').trim();
      } catch {
        detail = res.statusText;
      }
      throw new Error(detail || `Ошибка ${res.status}`);
    }
    const blob = await res.blob();
    const name =
      parseFilenameFromContentDisposition(res.headers.get('Content-Disposition')) ??
      fallbackName;
    const objectUrl = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    const shown = truncateForToastFilename(name, AUDIO_DOWNLOAD_TOAST_NAME_MAX);
    toast.success(`«${shown}» передано в загрузку`, { duration: 4500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Не удалось скачать аудио';
    toast.error(msg || 'Не удалось скачать аудио', { duration: 6000 });
    throw e;
  }
}
