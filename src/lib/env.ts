/**
 * Единый источник настроек — переменные окружения (.env.local).
 * Все настройки читаются только отсюда.
 */

export function getEnv(key: string, fallback: string): string {
  const v = process.env[key];
  return (v?.trim() ?? fallback);
}

export function getEnvInt(key: string, fallback: number): number {
  const v = process.env[key];
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

const MAX_MEDIA_LIBRARY_RECENT = 50;
const MAX_SUBSCRIPTION_CHECK_VIDEO_LIMIT = 200;
const MAX_QUEUE_MAX_CONCURRENT_DOWNLOADS = 5;

export const env = {
  baseUrl: () =>
    getEnv('BASE_URL', getEnv('NEXTAUTH_URL', 'http://localhost:3000')).replace(/\/$/, ''),
  downloadPath: () => getEnv('DOWNLOAD_PATH', './downloads'),
  defaultQuality: () => getEnv('DEFAULT_QUALITY', 'best'),
  defaultFormat: () => getEnv('DEFAULT_FORMAT', 'mp4'),
  defaultSubscriptionHistoryDays: () => getEnvInt('DEFAULT_SUBSCRIPTION_HISTORY_DAYS', 30),
  defaultSubscriptionAutoDeleteDays: () => getEnvInt('DEFAULT_SUBSCRIPTION_AUTO_DELETE_DAYS', 30),
  defaultCheckInterval: () => getEnvInt('DEFAULT_CHECK_INTERVAL', 360),
  defaultPlayerMode: (): 'normal' | 'fullscreen' | 'mini' => {
    const raw = getEnv('DEFAULT_PLAYER_MODE', 'normal').toLowerCase().trim();
    if (raw === 'fullscreen' || raw === 'mini') return raw;
    return 'normal';
  },
  autoplayOnOpen: () => getEnvInt('AUTOPLAY_ON_OPEN', 1) !== 0,
  mediaLibraryRecentLimit: () =>
    Math.min(MAX_MEDIA_LIBRARY_RECENT, Math.max(1, getEnvInt('MEDIA_LIBRARY_RECENT_LIMIT', 6))),
  subscriptionCheckVideoLimit: () =>
    Math.min(
      MAX_SUBSCRIPTION_CHECK_VIDEO_LIMIT,
      Math.max(1, getEnvInt('SUBSCRIPTION_CHECK_VIDEO_LIMIT', 50))
    ),
  queueMaxConcurrentDownloads: () =>
    Math.min(
      MAX_QUEUE_MAX_CONCURRENT_DOWNLOADS,
      Math.max(1, getEnvInt('QUEUE_MAX_CONCURRENT_DOWNLOADS', 1))
    ),
  subscriptionAutoCheckEnabled: () => getEnvInt('SUBSCRIPTION_AUTO_CHECK_ENABLED', 1) !== 0,
  subscriptionSchedulerIntervalMin: () =>
    Math.max(1, getEnvInt('SUBSCRIPTION_SCHEDULER_INTERVAL_MIN', 5)),
  /** Уровень журнала очереди загрузки и подписок: none, error, warn, info, debug */
  queueLogLevel: (): 'none' | 'error' | 'warn' | 'info' | 'debug' => {
    const v = getEnv('QUEUE_LOG_LEVEL', 'info').toLowerCase().trim();
    if (v === 'none' || v === 'error' || v === 'warn' || v === 'info' || v === 'debug') return v;
    return 'info';
  },
  telegramBotToken: () => getEnv('TELEGRAM_BOT_TOKEN', ''),
  telegramAdminChatId: () => getEnv('TELEGRAM_ADMIN_CHAT_ID', ''),
};
