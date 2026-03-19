/**
 * Утилита отправки уведомлений администратору через Telegram Bot API.
 * Требует TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_ID в .env.local.
 */

import { env } from '@/lib/env';

const TELEGRAM_API_TIMEOUT_MS = 10_000;

/**
 * Шаблоны «мусорного» текста в сообщениях yt-dlp, который не несёт полезной информации
 * и захламляет уведомление. Вырезаются перед отправкой.
 */
const NOISE_PATTERNS: RegExp[] = [
  // Подсказка про cookies: "See https://...FAQ... for how to manually pass cookies. Also see https://...Extractors... for tips..."
  /\.?\s*See\s+https?:\/\/\S*yt-dlp\S*\s+for\s+how\s+to\s+manually\s+pass\s+cookies\.?\s*Also\s+see\s+https?:\/\/\S*yt-dlp\S*\s+for\s+tips\s+on\s+effectively\s+exporting\s+YouTube\s+cookies\.?/gi,
];

/** Как долго одинаковая ошибка считается «уже отправленной» и подавляется. */
const ERROR_DEDUP_TTL_MS = 60 * 60 * 1000; // 1 час

/** In-memory дедупликация: fingerprint → время последней отправки. */
const sentErrors = new Map<string, number>();

/**
 * Строит «отпечаток» ошибки: убирает специфику конкретного видео
 * (YouTube ID, числовые ID, URL-пути, хэши), оставляя суть сообщения.
 * Это позволяет считать одинаковыми ошибки вида
 * "Sign in to confirm..." для разных видео из одной очереди.
 */
function errorFingerprint(errorMsg: string): string {
  return errorMsg
    .replace(/[A-Za-z0-9_-]{11}(?=[:\s,)'"]|$)/g, '[ID]') // YouTube video/channel ID (11 симв.)
    .replace(/https?:\/\/\S+/g, '[URL]')                   // URL целиком
    .replace(/\b[0-9a-f]{8,}\b/gi, '[HASH]')               // hex-хэши
    .replace(/\d{5,}/g, '[N]')                              // длинные числа (порты, коды)
    .replace(/\uFFFD+/g, '[?]')                             // символы замены
    .trim()
    .slice(0, 300);                                         // ограничиваем длину ключа
}

/**
 * Очищает текст перед отправкой:
 * - убирает «мусорные» подсказки yt-dlp
 * - заменяет кракозябры (U+FFFD) на [?]
 * - схлопывает повторные пробелы/переносы
 */
function sanitizeText(text: string): string {
  let result = text;
  for (const pattern of NOISE_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result
    .replace(/\uFFFD+/g, '[?]')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * @param text    Полный текст уведомления (HTML, с именем задачи и т.д.)
 * @param dedupKey Строка для дедупликации — обычно только текст ошибки (без названия задачи).
 *                 Если не передана, используется весь text.
 */
export async function sendTelegramAdminNotification(text: string, dedupKey?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (!token || !chatId) return;

  // Дедупликация: не отправляем одну и ту же ошибку повторно в течение TTL
  const fp = errorFingerprint(dedupKey ?? text);
  const lastSent = sentErrors.get(fp) ?? 0;
  if (Date.now() - lastSent < ERROR_DEDUP_TTL_MS) return;
  sentErrors.set(fp, Date.now());

  // Периодически чистим устаревшие записи, чтобы Map не росла бесконечно
  if (sentErrors.size > 200) {
    const cutoff = Date.now() - ERROR_DEDUP_TTL_MS;
    for (const [key, ts] of sentErrors) {
      if (ts < cutoff) sentErrors.delete(key);
    }
  }

  const serverUrl = env.baseUrl();
  const fullText = sanitizeText(text) + `\n\n🖥 <a href="${serverUrl}">${serverUrl}</a>`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TELEGRAM_API_TIMEOUT_MS);
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: fullText, parse_mode: 'HTML' }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // Не прерываем основной поток при сбое доставки
  }
}
