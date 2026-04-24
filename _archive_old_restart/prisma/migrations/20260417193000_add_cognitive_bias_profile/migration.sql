-- CreateTable
CREATE TABLE "CognitiveBiasProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "profileVersion" INTEGER NOT NULL DEFAULT 1,
  "biasProfileJson" TEXT NOT NULL DEFAULT '{}',
  "overallCalibrationTrend" TEXT NOT NULL DEFAULT 'stable',
  "strongestBiasId" TEXT,
  "mostImprovedBiasId" TEXT,
  "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CognitiveBiasProfile_userId_key" ON "CognitiveBiasProfile"("userId");

-- CreateIndex
CREATE INDEX "CognitiveBiasProfile_userId_updatedAt_idx" ON "CognitiveBiasProfile"("userId", "updatedAt");
