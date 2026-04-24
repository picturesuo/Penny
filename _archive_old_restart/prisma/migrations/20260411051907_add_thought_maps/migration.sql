-- CreateTable
CREATE TABLE "ThoughtMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rawThought" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ThoughtNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" TEXT NOT NULL,
    "actionOrigin" TEXT,
    "content" TEXT NOT NULL,
    "note" TEXT,
    "branchOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ThoughtNode_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "ThoughtMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ThoughtNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ThoughtNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ThoughtMap_userId_updatedAt_idx" ON "ThoughtMap"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ThoughtNode_mapId_branchOrder_idx" ON "ThoughtNode"("mapId", "branchOrder");

-- CreateIndex
CREATE INDEX "ThoughtNode_parentId_idx" ON "ThoughtNode"("parentId");

-- CreateIndex
CREATE INDEX "ThoughtNode_kind_idx" ON "ThoughtNode"("kind");
