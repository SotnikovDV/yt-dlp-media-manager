/**
 * Ограничение параллельных скачиваний аудио между всеми карточками (один пользователь, несколько вкладок — отдельные очереди).
 * По умолчанию 1: второй запрос ждёт, пока первый полностью завершится (ffmpeg + blob + save).
 *
 * `NEXT_PUBLIC_AUDIO_DOWNLOAD_MAX_CONCURRENT` — целое 1…8 (по умолчанию 1).
 *
 * После каждого изменения числа активных операций шлётся `global-audio-download-count`
 * с `detail.count` — пульсация и бейдж в app-shell.
 */

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function getMaxConcurrent(): number {
  const raw = process.env.NEXT_PUBLIC_AUDIO_DOWNLOAD_MAX_CONCURRENT;
  if (raw == null || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return clampInt(n, 1, 8);
}

let active = 0;
const waiters: Array<() => void> = [];

/** Сколько пользовательских операций «скачать аудио» ещё не завершилось целиком (очередь + ffmpeg + blob). */
let audioDownloadActivityRef = 0;

function emitAudioActivityCount(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('global-audio-download-count', {
      detail: { count: audioDownloadActivityRef },
    })
  );
}

function beginAudioDownloadActivity(): void {
  audioDownloadActivityRef += 1;
  emitAudioActivityCount();
}

function endAudioDownloadActivity(): void {
  audioDownloadActivityRef = Math.max(0, audioDownloadActivityRef - 1);
  emitAudioActivityCount();
}

/**
 * Ждёт свободный слот и возвращает `release()` — вызвать после завершения скачивания (в `finally`).
 */
export function acquireAudioDownloadSlot(): Promise<() => void> {
  const max = getMaxConcurrent();
  return new Promise((resolveRelease) => {
    function tryTake() {
      if (active < max) {
        active += 1;
        let released = false;
        resolveRelease(() => {
          if (released) return;
          released = true;
          active -= 1;
          const next = waiters.shift();
          next?.();
        });
      } else {
        waiters.push(tryTake);
      }
    }
    tryTake();
  });
}

export async function withAudioDownloadSlot<T>(fn: () => Promise<T>): Promise<T> {
  beginAudioDownloadActivity();
  try {
    const release = await acquireAudioDownloadSlot();
    try {
      return await fn();
    } finally {
      release();
    }
  } finally {
    endAudioDownloadActivity();
  }
}
