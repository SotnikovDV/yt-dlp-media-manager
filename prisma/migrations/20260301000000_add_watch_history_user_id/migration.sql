-- Add userId to WatchHistory (per-user watch position and recent).
-- Existing rows get the first admin user as owner (SQLite: recreate table).

PRAGMA foreign_keys=OFF;

CREATE TABLE "WatchHistory_new" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "watchCount" INTEGER NOT NULL DEFAULT 1,
    "lastWatchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchHistory_new_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WatchHistory_new_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WatchHistory_new_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WatchHistory_new_userId_videoId_key" UNIQUE ("userId", "videoId")
);

INSERT INTO "WatchHistory_new" ("id", "userId", "videoId", "position", "completed", "watchCount", "lastWatchedAt")
SELECT
    "id",
    COALESCE((SELECT "id" FROM "User" WHERE "isAdmin" = 1 ORDER BY "createdAt" ASC LIMIT 1), (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)),
    "videoId", "position", "completed", "watchCount", "lastWatchedAt"
FROM "WatchHistory";

DROP TABLE "WatchHistory";
ALTER TABLE "WatchHistory_new" RENAME TO "WatchHistory";

CREATE INDEX "WatchHistory_userId_idx" ON "WatchHistory"("userId");

PRAGMA foreign_keys=ON;
