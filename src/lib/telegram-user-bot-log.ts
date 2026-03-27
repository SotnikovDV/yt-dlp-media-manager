import { writeQueueLog } from '@/lib/queue-logger';
import { env } from '@/lib/env';

/** События пользовательского Telegram-бота (webhook + связанные вызовы) — пишутся в queue.log при QUEUE_LOG_LEVEL. */
export function logTelegramUserBot(
  level: 'error' | 'warn' | 'info' | 'debug',
  event: string,
  meta?: Record<string, unknown>
): void {
  if (env.queueLogLevel() === 'none') {
    const msg = `[telegram_user_bot.${event}]${meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''}`;
    if (level === 'error') console.error(msg);
    else if (level === 'warn') console.warn(msg);
    else console.info(msg);
  }
  writeQueueLog(level, `telegram_user_bot.${event}`, meta);
}
