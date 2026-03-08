import path from 'path';
import { appendFile, mkdir } from 'fs/promises';
import { getQueueLogDir } from '@/lib/deps';
import { env } from '@/lib/env';

const LEVEL_ORDER: Record<string, number> = {
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

let logDirReady: Promise<void> | null = null;

function ensureLogDir(): Promise<void> {
  if (!logDirReady) {
    logDirReady = mkdir(getQueueLogDir(), { recursive: true }).then(() => {});
  }
  return logDirReady;
}

function getLogFilePath(): string {
  return path.join(getQueueLogDir(), 'queue.log');
}

function isLevelEnabled(level: string): boolean {
  const configured = env.queueLogLevel();
  return LEVEL_ORDER[level] > 0 && LEVEL_ORDER[level] <= LEVEL_ORDER[configured];
}

/**
 * Пишет одну строку в queue.log при условии, что уровень разрешён QUEUE_LOG_LEVEL.
 * Вызов не блокирует: запись в файл выполняется асинхронно, ошибки только в console.warn.
 */
export function writeQueueLog(
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  meta?: Record<string, unknown>
): void {
  if (!isLevelEnabled(level)) return;

  const ts = new Date().toISOString();
  const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  const line = `${ts} ${level.toUpperCase()} ${message}${metaStr}\n`;

  void ensureLogDir()
    .then(() => appendFile(getLogFilePath(), line, 'utf8'))
    .catch((err) => {
      console.warn('[queue-logger] Failed to write log:', err?.message ?? err);
    });
}
