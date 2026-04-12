-- CreateTable
CREATE TABLE "ThoughtMapIntervention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupeKey" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detector" TEXT NOT NULL,
    "triggerReason" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "inputMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "outcomeDelta" TEXT,
    "shownAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "dismissedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ThoughtMapIntervention_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "ThoughtMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ThoughtMapIntervention_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "ThoughtNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ThoughtMapEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapId" TEXT NOT NULL,
    "nodeId" TEXT,
    "interventionId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThoughtMapEvent_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "ThoughtMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ThoughtMapEvent_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "ThoughtNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ThoughtMapEvent_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "ThoughtMapIntervention" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ThoughtMapIntervention_dedupeKey_key" ON "ThoughtMapIntervention"("dedupeKey");

-- CreateIndex
CREATE INDEX "ThoughtMapIntervention_mapId_status_updatedAt_idx" ON "ThoughtMapIntervention"("mapId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ThoughtMapIntervention_targetNodeId_status_idx" ON "ThoughtMapIntervention"("targetNodeId", "status");

-- CreateIndex
CREATE INDEX "ThoughtMapEvent_mapId_eventType_createdAt_idx" ON "ThoughtMapEvent"("mapId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "ThoughtMapEvent_interventionId_idx" ON "ThoughtMapEvent"("interventionId");

-- CreateIndex
CREATE INDEX "ThoughtMapEvent_nodeId_idx" ON "ThoughtMapEvent"("nodeId");
