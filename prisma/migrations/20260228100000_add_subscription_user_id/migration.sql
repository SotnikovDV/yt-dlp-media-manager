-- Add userId to Subscription (per-user subscriptions).
-- Existing rows get the first admin user as owner (SQLite: recreate table).

PRAGMA foreign_keys=OFF;

-- Create new table with userId
CREATE TABLE "Subscription_new" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "downloadDays" INTEGER NOT NULL DEFAULT 30,
    "preferredQuality" TEXT DEFAULT 'best',
    "outputFolder" TEXT,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "checkInterval" INTEGER NOT NULL DEFAULT 360,
    "lastCheckAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_new_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Subscription_new_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_new_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_new_userId_channelId_key" UNIQUE ("userId", "channelId")
);

-- Copy data: assign existing subscriptions to first admin
INSERT INTO "Subscription_new" (
    "id", "userId", "channelId", "downloadDays", "preferredQuality", "outputFolder",
    "isActive", "checkInterval", "lastCheckAt", "createdAt", "updatedAt"
)
SELECT
    "id",
    COALESCE((SELECT "id" FROM "User" WHERE "isAdmin" = 1 ORDER BY "createdAt" ASC LIMIT 1), (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)),
    "channelId", "downloadDays", "preferredQuality", "outputFolder",
    "isActive", "checkInterval", "lastCheckAt", "createdAt", "updatedAt"
FROM "Subscription";

DROP TABLE "Subscription";
ALTER TABLE "Subscription_new" RENAME TO "Subscription";

CREATE INDEX "Subscription_isActive_idx" ON "Subscription"("isActive");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

PRAGMA foreign_keys=ON;
