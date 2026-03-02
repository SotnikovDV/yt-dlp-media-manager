-- CreateTable
CREATE TABLE "UserIndividualVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserIndividualVideo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserIndividualVideo_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserIndividualVideo_userId_videoId_key" ON "UserIndividualVideo"("userId", "videoId");
CREATE INDEX "UserIndividualVideo_userId_idx" ON "UserIndividualVideo"("userId");
CREATE INDEX "UserIndividualVideo_videoId_idx" ON "UserIndividualVideo"("videoId");
