-- Ручное выполнение на продакшене: Telegram Chat ID пользователя, уведомления о новых по подписке.
-- Миграция: 20260324120000_user_telegram_subscription_notify

ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;

CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

ALTER TABLE "Subscription" ADD COLUMN "notifyOnNewVideos" BOOLEAN NOT NULL DEFAULT 0;
