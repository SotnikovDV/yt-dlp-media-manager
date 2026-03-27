/**
 * Тело запроса setWebhook для TELEGRAM_USER_BOT_TOKEN.
 * Явно задаём allowed_updates: если раньше webhook был с узким списком без «message»,
 * команды (/start, /id) Telegram вообще не шлёт на URL — это не лечится на стороне Next.
 */

/**
 * Дублирование секрета в query для старого URL /api/telegram/user-bot-webhook (legacy).
 * Часть прокси обрезает query до upstream — тогда используйте путь /api/telegram/user-bot-hook/<secret>.
 */
export const TELEGRAM_USER_BOT_WEBHOOK_SECRET_QUERY = 'tgSt';

export function buildTelegramUserBotWebhookUrl(baseUrl: string, secretToken: string): string {
  const root = baseUrl.replace(/\/$/, '');
  const s = secretToken.trim();
  if (!s) return `${root}/api/telegram/user-bot-webhook`;
  return `${root}/api/telegram/user-bot-hook/${encodeURIComponent(s)}`;
}

export const TELEGRAM_USER_BOT_WEBHOOK_ALLOWED_UPDATES = [
  'message',
  'edited_message',
  'callback_query',
] as const;

export type BuildUserBotSetWebhookBodyOpts = {
  url: string;
  secretToken?: string;
  dropPendingUpdates?: boolean;
};

export function buildTelegramUserBotSetWebhookBody(
  opts: BuildUserBotSetWebhookBodyOpts
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    url: opts.url,
    allowed_updates: [...TELEGRAM_USER_BOT_WEBHOOK_ALLOWED_UPDATES],
  };
  if (opts.secretToken) body.secret_token = opts.secretToken;
  if (opts.dropPendingUpdates) body.drop_pending_updates = true;
  return body;
}
