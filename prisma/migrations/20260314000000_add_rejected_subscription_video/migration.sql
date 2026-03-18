-- CreateTable
CREATE TABLE "RejectedSubscriptionVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RejectedSubscriptionVideo_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RejectedSubscriptionVideo_subscriptionId_platformId_key" ON "RejectedSubscriptionVideo"("subscriptionId", "platformId");

-- CreateIndex
CREATE INDEX "RejectedSubscriptionVideo_subscriptionId_idx" ON "RejectedSubscriptionVideo"("subscriptionId");
