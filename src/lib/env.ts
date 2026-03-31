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

/** Парсинг float из env; пустая строка → `null` (использовать fallback снаружи). */
export function tryParseEnvFloat(key: string): number | null {
  const v = process.env[key]?.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const MAX_MEDIA_LIBRARY_RECENT = 50;
const MAX_SUBSCRIPTION_CHECK_VIDEO_LIMIT = 200;
const MAX_QUEUE_MAX_CONCURRENT_DOWNLOADS = 5;
const MAX_AI_SEARCH_VIDEO_CANDIDATES = 500;
const MAX_AI_SEARCH_SMART_RESULT = 200;
const MAX_AI_SEARCH_V1_RERANK_POOL = 100;

/** Нормализация ввода битрейта; `null` — недопустимое значение (для валидации в API). */
export function tryParseAudioExtractAacBitrate(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return '96k';
  if (/^\d+$/.test(t)) return `${t}k`;
  if (/^\d+k$/.test(t)) return t;
  return null;
}

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
  /** Отладка Chromecast: сервер логирует запросы к /api/stream (терминал/Docker) */
  chromecastDebug: (): boolean =>
    ['1', 'true', 'yes', 'on'].includes(getEnv('CHROMECAST_DEBUG', '').toLowerCase()),
  telegramBotToken: () => getEnv('TELEGRAM_BOT_TOKEN', ''),
  telegramAdminChatId: () => getEnv('TELEGRAM_ADMIN_CHAT_ID', ''),
  /** Отдельный бот для уведомлений пользователей о новых видео по подпискам (не админский). */
  telegramUserBotToken: () => getEnv('TELEGRAM_USER_BOT_TOKEN', ''),
  /**
   * Секрет для webhook пользовательского бота (setWebhook с secret_token).
   * Если задан — заголовок X-Telegram-Bot-Api-Secret-Token должен совпадать.
   */
  telegramUserBotWebhookSecret: () => getEnv('TELEGRAM_USER_BOT_WEBHOOK_SECRET', ''),
  /**
   * Как получать входящие команды пользовательского бота: webhook (по умолчанию) или polling (getUpdates в фоне, без HTTPS webhook).
   */
  telegramUserBotUpdatesMode: (): 'webhook' | 'polling' => {
    const v = getEnv('TELEGRAM_USER_BOT_UPDATES_MODE', 'webhook').toLowerCase().trim();
    return v === 'polling' ? 'polling' : 'webhook';
  },
  /**
   * Битрейт AAC при извлечении аудио из видео (меню «Скачать» → «Аудио»).
   * Примеры: `96k`, `128k` или число `96` → `96k`.
   */
  audioExtractAacBitrate: (): string => {
    return tryParseAudioExtractAacBitrate(getEnv('AUDIO_EXTRACT_AAC_BITRATE', '')) ?? '96k';
  },
  /** Моно (`-ac 1`) для извлечения AAC. */
  audioExtractAacMono: (): boolean => {
    const raw = getEnv('AUDIO_EXTRACT_AAC_MONO', '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  },

  /** Базовый URL OpenAI-совместимого API (без завершающего /). */
  aiBaseUrl: () => getEnv('AI_BASE_URL', 'https://api.openai.com').replace(/\/$/, ''),
  aiApiKey: () => getEnv('AI_API_KEY', ''),
  /** Таймаут HTTP к AI в секундах. */
  aiHttpTimeoutSec: () => Math.min(120, Math.max(5, getEnvInt('AI_HTTP_TIMEOUT', 30))),
  aiModel: () => getEnv('AI_MODEL', 'gpt-4o-mini'),
  aiTemperature: (): number => tryParseEnvFloat('AI_TEMPERATURE') ?? 0.5,
  aiMaxTokens: () => Math.min(8192, Math.max(64, getEnvInt('AI_MAX_TOKENS', 1000))),
  aiSearchVideoModel: (): string => {
    const o = getEnv('AI_SEARCH_VIDEO_MODEL', '').trim();
    return o || getEnv('AI_MODEL', 'gpt-4o-mini');
  },
  /** Этап 1 (ключевые слова). Пусто — как AI_SEARCH_VIDEO_MODEL. */
  aiSearchKeywordsModel: (): string => {
    const o = getEnv('AI_SEARCH_KEYWORDS_MODEL', '').trim();
    return o || env.aiSearchVideoModel();
  },
  /** Этап 3 (реранк). Пусто — как AI_SEARCH_VIDEO_MODEL. */
  aiSearchRerankModel: (): string => {
    const o = getEnv('AI_SEARCH_RERANK_MODEL', '').trim();
    return o || env.aiSearchVideoModel();
  },
  aiSearchVideoTemperature: (): number =>
    tryParseEnvFloat('AI_SEARCH_VIDEO_TEMPERATURE') ?? tryParseEnvFloat('AI_TEMPERATURE') ?? 0.5,
  aiSearchVideoMaxTokens: (): number => {
    const raw = getEnv('AI_SEARCH_VIDEO_MAX_TOKENS', '').trim();
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.min(8192, Math.max(64, Math.floor(n)));
    }
    return Math.min(8192, Math.max(64, getEnvInt('AI_MAX_TOKENS', 1000)));
  },
  /**
   * max_tokens ответа на этапе «ключевые слова». У моделей с reasoning ответ сначала занят рассуждением;
   * жёсткий низкий лимит (раньше 256) обрезал вывод до появления JSON → step1_keywords_parse_failed.
   */
  aiSearchKeywordsMaxTokens: (): number => {
    const raw = getEnv('AI_SEARCH_KEYWORDS_MAX_TOKENS', '').trim();
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.min(8192, Math.max(128, Math.floor(n)));
    }
    const video = env.aiSearchVideoMaxTokens();
    return Math.min(2048, Math.max(1024, video));
  },
  /**
   * Этап «ключевые слова»: передать в API `response_format: { type: "json_object" }` (OpenAI и часть совместимых шлюзов).
   * Выключите (0), если провайдер возвращает 400 — например Ollama или часть Perplexity.
   * На Groq с reasoning-моделями обычно имеет смысл 1; при 400 — 0 или другая модель.
   */
  aiSearchKeywordsResponseJson: (): boolean => {
    const raw = getEnv('AI_SEARCH_KEYWORDS_RESPONSE_JSON', '').trim().toLowerCase();
    if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
    return false;
  },
  /**
   * Этап реранга: `response_format: json_object`. Если не задано — как у AI_SEARCH_KEYWORDS_RESPONSE_JSON.
   * Явный 0 выключает JSON-режим только для реранга (например если этап 1 работает, а этап 3 даёт 400).
   */
  aiSearchRerankResponseJson: (): boolean => {
    const raw = getEnv('AI_SEARCH_RERANK_RESPONSE_JSON', '').trim().toLowerCase();
    if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
    if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
    const kw = getEnv('AI_SEARCH_KEYWORDS_RESPONSE_JSON', '').trim().toLowerCase();
    return kw === '1' || kw === 'true' || kw === 'yes' || kw === 'on';
  },
  /** max_tokens для этапа реранга (длинный список id + reasoning); по умолчанию не ниже 1536 и не выше 4096 относительно AI_SEARCH_VIDEO_MAX_TOKENS. */
  aiSearchRerankMaxTokens: (): number => {
    const raw = getEnv('AI_SEARCH_RERANK_MAX_TOKENS', '').trim();
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.min(8192, Math.max(256, Math.floor(n)));
    }
    const video = env.aiSearchVideoMaxTokens();
    return Math.min(4096, Math.max(1536, video));
  },
  /** Символов заголовка в JSON этапа реранга (меньше — меньше TPM). */
  aiSearchRerankTitleChars: (): number =>
    Math.min(500, Math.max(16, getEnvInt('AI_SEARCH_RERANK_TITLE_CHARS', 100))),
  /** Символов описания в JSON этапа реранга. */
  aiSearchRerankDescriptionChars: (): number =>
    Math.min(2000, Math.max(16, getEnvInt('AI_SEARCH_RERANK_DESCRIPTION_CHARS', 72))),
  /** Символов имени канала в JSON этапа реранга. */
  aiSearchRerankChannelChars: (): number =>
    Math.min(200, Math.max(8, getEnvInt('AI_SEARCH_RERANK_CHANNEL_CHARS', 48))),
  /**
   * Сколько видео-кандидатов отдаём модели для умного поиска (последние по дате в области фильтра).
   * @deprecated Использовался пайплайном до v1; оставлено для совместимости env.
   */
  aiSearchVideoCandidateLimit: () =>
    Math.min(
      MAX_AI_SEARCH_VIDEO_CANDIDATES,
      Math.max(20, getEnvInt('AI_SEARCH_VIDEO_CANDIDATE_LIMIT', 200))
    ),
  /**
   * AI-поиск v1: сколько первых совпадений (по дате) передаём на этап реранга LLM при total > 5.
   */
  aiSearchV1RerankPool: () =>
    Math.min(
      MAX_AI_SEARCH_V1_RERANK_POOL,
      Math.max(6, getEnvInt('AI_SEARCH_V1_RERANK_POOL', 36))
    ),
  /**
   * Максимум id в ответе умного поиска (пагинация клиентом через ids=…).
   */
  aiSearchSmartResultCap: () =>
    Math.min(
      MAX_AI_SEARCH_SMART_RESULT,
      Math.max(10, getEnvInt('AI_SEARCH_SMART_RESULT_CAP', 80))
    ),
  /**
   * После успешного реранка (этап 3): дополнять список id из пула этапа 2 (порядок по дате) до result cap.
   * 0 / false / no / off — только id в порядке LLM (без добора из пула ключевого поиска).
   */
  aiSearchSmartAppendKeywordPool: (): boolean => {
    const raw = getEnv('AI_SEARCH_SMART_APPEND_KEYWORD_POOL', '')
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .trim()
      .toLowerCase();
    if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
    if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
    return true;
  },
  smartSearchAvailable: (): boolean => getEnv('AI_API_KEY', '').trim().length > 0,
};
