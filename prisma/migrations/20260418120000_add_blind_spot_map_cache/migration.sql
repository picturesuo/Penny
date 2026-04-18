-- CreateTable
CREATE TABLE "BlindSpotMapCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "blindSpotMapJson" TEXT NOT NULL DEFAULT '{}',
  "lastComputedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "BlindSpotMapCache_userId_key" ON "BlindSpotMapCache"("userId");

-- CreateIndex
CREATE INDEX "BlindSpotMapCache_userId_updatedAt_idx" ON "BlindSpotMapCache"("userId", "updatedAt");
