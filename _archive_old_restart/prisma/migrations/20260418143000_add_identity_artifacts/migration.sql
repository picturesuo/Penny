CREATE TABLE "BiographyAnnotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "annotationText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "FingerprintPatternReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "disputeText" TEXT,
    "falsificationCondition" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "BiographyAnnotation_userId_chapterId_idx" ON "BiographyAnnotation"("userId", "chapterId");
CREATE INDEX "BiographyAnnotation_userId_targetType_targetId_idx" ON "BiographyAnnotation"("userId", "targetType", "targetId");
CREATE INDEX "FingerprintPatternReview_userId_updatedAt_idx" ON "FingerprintPatternReview"("userId", "updatedAt");
CREATE UNIQUE INDEX "FingerprintPatternReview_userId_patternId_key" ON "FingerprintPatternReview"("userId", "patternId");
