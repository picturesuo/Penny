-- CreateTable
CREATE TABLE "MarginFragment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceSessionId" TEXT,
    "sourceMapId" TEXT,
    "sphere" TEXT NOT NULL DEFAULT 'work',
    "content" TEXT NOT NULL,
    "contextSnapshot" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'floating',
    "priority" REAL NOT NULL DEFAULT 0.5,
    "surfaceCount" INTEGER NOT NULL DEFAULT 0,
    "lastSurfacedAt" DATETIME,
    "promotedAt" DATETIME,
    "archivedAt" DATETIME,
    "mergedInto" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "emailVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "selectedRole" TEXT NOT NULL DEFAULT 'default',
    "currentStep" TEXT NOT NULL DEFAULT 'welcome',
    "completedStepsJson" TEXT NOT NULL DEFAULT '[]',
    "firstMapId" TEXT,
    "firstClaimId" TEXT,
    "firstCritiqueRoundId" TEXT,
    "skippedAt" DATETIME,
    "completedAt" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BlindSpotMapCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "blindSpotMapJson" TEXT NOT NULL DEFAULT '{}',
    "lastComputedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BlindSpotMapCache" ("blindSpotMapJson", "createdAt", "id", "lastComputedAt", "updatedAt", "userId") SELECT "blindSpotMapJson", "createdAt", "id", "lastComputedAt", "updatedAt", "userId" FROM "BlindSpotMapCache";
DROP TABLE "BlindSpotMapCache";
ALTER TABLE "new_BlindSpotMapCache" RENAME TO "BlindSpotMapCache";
CREATE UNIQUE INDEX "BlindSpotMapCache_userId_key" ON "BlindSpotMapCache"("userId");
CREATE INDEX "BlindSpotMapCache_userId_updatedAt_idx" ON "BlindSpotMapCache"("userId", "updatedAt");
CREATE TABLE "new_CognitiveBiasProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "profileVersion" INTEGER NOT NULL DEFAULT 1,
    "biasProfileJson" TEXT NOT NULL DEFAULT '{}',
    "overallCalibrationTrend" TEXT NOT NULL DEFAULT 'stable',
    "strongestBiasId" TEXT,
    "mostImprovedBiasId" TEXT,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CognitiveBiasProfile" ("biasProfileJson", "createdAt", "id", "lastUpdated", "mostImprovedBiasId", "overallCalibrationTrend", "profileVersion", "strongestBiasId", "updatedAt", "userId") SELECT "biasProfileJson", "createdAt", "id", "lastUpdated", "mostImprovedBiasId", "overallCalibrationTrend", "profileVersion", "strongestBiasId", "updatedAt", "userId" FROM "CognitiveBiasProfile";
DROP TABLE "CognitiveBiasProfile";
ALTER TABLE "new_CognitiveBiasProfile" RENAME TO "CognitiveBiasProfile";
CREATE UNIQUE INDEX "CognitiveBiasProfile_userId_key" ON "CognitiveBiasProfile"("userId");
CREATE INDEX "CognitiveBiasProfile_userId_updatedAt_idx" ON "CognitiveBiasProfile"("userId", "updatedAt");
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mapId" TEXT,
    "title" TEXT NOT NULL,
    "rawIdea" TEXT NOT NULL,
    "category" TEXT,
    "declaredIntention" TEXT NOT NULL DEFAULT '',
    "intentionType" TEXT NOT NULL DEFAULT 'open_exploration',
    "scopedClaimIds" TEXT NOT NULL DEFAULT '[]',
    "timeBudgetMinutes" INTEGER,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "actualDurationMinutes" INTEGER,
    "sessionEvents" TEXT NOT NULL DEFAULT '[]',
    "closingRitual" TEXT,
    "sessionSummary" TEXT,
    "energyRating" TEXT,
    "focusRating" TEXT,
    "productivityRating" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentStage" TEXT NOT NULL DEFAULT 'intake',
    "questionBudget" INTEGER NOT NULL DEFAULT 5,
    "clarityScore" INTEGER NOT NULL DEFAULT 18,
    "extractedProblem" TEXT,
    "extractedCustomer" TEXT,
    "extractedSolution" TEXT,
    "ideaSummary" TEXT,
    "targetUser" TEXT,
    "problem" TEXT,
    "solution" TEXT,
    "assumptions" TEXT NOT NULL DEFAULT '[]',
    "resolvedAssumptions" TEXT NOT NULL DEFAULT '[]',
    "risks" TEXT NOT NULL DEFAULT '[]',
    "unknowns" TEXT NOT NULL DEFAULT '[]',
    "evidenceFor" TEXT NOT NULL DEFAULT '[]',
    "evidenceAgainst" TEXT NOT NULL DEFAULT '[]',
    "marketPatterns" TEXT NOT NULL DEFAULT '[]',
    "questionsAsked" TEXT NOT NULL DEFAULT '[]',
    "answers" TEXT NOT NULL DEFAULT '[]',
    "conversation" TEXT NOT NULL DEFAULT '[]',
    "conceptBrief" TEXT,
    "logicOnlyMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Session" ("answers", "assumptions", "category", "clarityScore", "conceptBrief", "conversation", "createdAt", "currentStage", "evidenceAgainst", "evidenceFor", "extractedCustomer", "extractedProblem", "extractedSolution", "id", "ideaSummary", "logicOnlyMode", "marketPatterns", "problem", "questionBudget", "questionsAsked", "rawIdea", "resolvedAssumptions", "risks", "solution", "status", "targetUser", "title", "unknowns", "updatedAt", "userId") SELECT "answers", "assumptions", "category", "clarityScore", "conceptBrief", "conversation", "createdAt", "currentStage", "evidenceAgainst", "evidenceFor", "extractedCustomer", "extractedProblem", "extractedSolution", "id", "ideaSummary", "logicOnlyMode", "marketPatterns", "problem", "questionBudget", "questionsAsked", "rawIdea", "resolvedAssumptions", "risks", "solution", "status", "targetUser", "title", "unknowns", "updatedAt", "userId" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MarginFragment_userId_status_updatedAt_idx" ON "MarginFragment"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "MarginFragment_userId_sphere_updatedAt_idx" ON "MarginFragment"("userId", "sphere", "updatedAt");

-- CreateIndex
CREATE INDEX "MarginFragment_sourceSessionId_idx" ON "MarginFragment"("sourceSessionId");

-- CreateIndex
CREATE INDEX "MarginFragment_sourceMapId_idx" ON "MarginFragment"("sourceMapId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_sessionTokenHash_key" ON "AuthSession"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_sessionTokenHash_idx" ON "AuthSession"("sessionTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_consumedAt_idx" ON "EmailVerificationToken"("userId", "consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_userId_key" ON "OnboardingProgress"("userId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_userId_updatedAt_idx" ON "OnboardingProgress"("userId", "updatedAt");

