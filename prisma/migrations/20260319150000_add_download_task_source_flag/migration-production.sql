-- Ручное выполнение на продакшене: флаг источника задачи (автоподписка/ручная).
-- Миграция: 20260319150000_add_download_task_source_flag

-- AlterTable
ALTER TABLE "DownloadTask" ADD COLUMN "isAutoSubscriptionTask" BOOLEAN NOT NULL DEFAULT false;
