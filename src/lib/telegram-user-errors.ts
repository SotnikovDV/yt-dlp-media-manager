/**
 * Человекочитаемые сообщения по ответам Telegram Bot API (sendMessage и т.п.).
 * `description` — поле из JSON при ok: false.
 */
export function mapTelegramApiErrorToUserMessage(description: string): string {
  const d = description.trim();
  const lower = d.toLowerCase();

  if (lower.includes("bots can't send messages to bots") || lower.includes('send messages to bots')) {
    return (
      'Указан ID бота, а нужен ID вашего личного чата с Telegram. ' +
      'Число из @userinfobot — это ваш ID; ID вида «бота» сюда вставлять нельзя. ' +
      'Напишите /start или /id нашему боту уведомлений (если настроен webhook) — он пришлёт правильное число.'
    );
  }

  if (
    lower.includes("bot can't initiate conversation") ||
    lower.includes('have no rights to send a message') ||
    lower.includes('blocked by the user')
  ) {
    return (
      'Сначала откройте чат с ботом уведомлений и нажмите «Запустить» или напишите /start. ' +
      'Без этого бот не может писать вам первым.'
    );
  }

  if (lower.includes('chat not found') || lower.includes('peer_id_invalid') || lower.includes('user is deactivated')) {
    return (
      'Telegram не находит этот чат. Проверьте, что ID скопирован полностью, это ваш личный ID, ' +
      'и аккаунт не удалён.'
    );
  }

  if (lower.includes('too many requests') || lower.includes('retry after')) {
    return 'Слишком частые запросы к Telegram. Подождите минуту и попробуйте снова.';
  }

  return `Не удалось отправить: ${d}`;
}
