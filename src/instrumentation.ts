/**
 * Запускается один раз при старте Next.js сервера.
 * Запускаем воркер очереди загрузок, чтобы очередь обрабатывалась сразу после старта приложения.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Избегаем падения процесса при отмене клиентом стрима (закрытие вкладки и т.д.)
    process.on('uncaughtException', (err) => {
      const code = err && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
      if (err?.message === 'Invalid state: Controller is already closed' || code === 'ERR_INVALID_STATE') {
        console.warn('[stream] Client disconnected, stream closed:', err?.message);
        return;
      }
      throw err;
    });

    const { ensureQueueWorker } = await import('@/lib/queue-worker');
    void ensureQueueWorker();

    void import('@/lib/telegram-user-bot-poller').then((m) => m.startTelegramUserBotPollerIfEnabled());
  }
}
