-- AlterTable
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "notifyOnNewVideos" BOOLEAN NOT NULL DEFAULT 0;
