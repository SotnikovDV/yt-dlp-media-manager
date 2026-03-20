import { spawn } from 'child_process';
import { resolveToolCommand } from '@/lib/deps';
import { env } from '@/lib/env';

/** Контейнер выхода при `-c:a copy` (совпадает с семейством исходного видео). */
export type AudioCopyContainer = 'mp4' | 'webm' | 'matroska';

/**
 * Битрейт AAC для извлечения аудио (`-b:a`). Задаётся в `.env.local` или на странице «Настройки».
 */
export function resolveAudioExtractAacBitrate(): string {
  return env.audioExtractAacBitrate();
}

/** Моно (`-ac 1`). См. `AUDIO_EXTRACT_AAC_MONO` / настройки. */
export function resolveAudioExtractAacMono(): boolean {
  return env.audioExtractAacMono();
}

function runFfmpegFileOutput(
  args: string[],
  opts?: { signal?: AbortSignal }
): Promise<void> {
  const ffmpeg = resolveToolCommand('ffmpeg');
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, ['-y', ...args], { windowsHide: true });
    let stderr = '';
    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    const onAbort = () => {
      try {
        proc.kill('SIGTERM');
      } catch {
        // ignore
      }
    };
    opts?.signal?.addEventListener('abort', onAbort);
    proc.on('close', (code) => {
      opts?.signal?.removeEventListener('abort', onAbort);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
    proc.on('error', (err) => {
      opts?.signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
  });
}

/**
 * AAC в MP4/M4A, запись в файл (+faststart — нормальная структура для локальных плееров).
 *
 * Битрейт и моно: `AUDIO_EXTRACT_AAC_BITRATE`, `AUDIO_EXTRACT_AAC_MONO` (см. `resolveAudioExtractAacBitrate` / `resolveAudioExtractAacMono`).
 * Плюс `aac_coder=fast` для более быстрого кодирования нативным кодером ffmpeg.
 */
export function runFfmpegExtractAudioAacToFile(
  videoPath: string,
  outPath: string,
  opts?: { signal?: AbortSignal }
): Promise<void> {
  const bitrate = resolveAudioExtractAacBitrate();
  const mono = resolveAudioExtractAacMono();
  const afterMap: string[] = [];
  if (mono) {
    afterMap.push('-ac', '1');
  }
  return runFfmpegFileOutput(
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      videoPath,
      '-vn',
      '-map',
      '0:a:0?',
      ...afterMap,
      '-c:a',
      'aac',
      '-aac_coder',
      'fast',
      '-b:a',
      bitrate,
      '-f',
      'mp4',
      '-movflags',
      '+faststart',
      outPath,
    ],
    opts
  );
}

/**
 * Копирование аудиодорожки без перекодирования в файл (без fragmented pipe).
 */
export function runFfmpegExtractAudioCopyToFile(
  videoPath: string,
  container: AudioCopyContainer,
  outPath: string,
  opts?: { signal?: AbortSignal }
): Promise<void> {
  const base = [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    videoPath,
    '-vn',
    '-map',
    '0:a:0?',
    '-c:a',
    'copy',
  ];
  if (container === 'mp4') {
    return runFfmpegFileOutput(
      [...base, '-f', 'mp4', '-movflags', '+faststart', outPath],
      opts
    );
  }
  if (container === 'webm') {
    return runFfmpegFileOutput([...base, '-f', 'webm', outPath], opts);
  }
  return runFfmpegFileOutput([...base, '-f', 'matroska', outPath], opts);
}
