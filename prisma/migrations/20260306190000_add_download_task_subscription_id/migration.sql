-- AlterTable
ALTER TABLE "DownloadTask" ADD COLUMN "subscriptionId" TEXT;

-- CreateIndex
CREATE INDEX "DownloadTask_subscriptionId_idx" ON "DownloadTask"("subscriptionId");
