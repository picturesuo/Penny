-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ThoughtNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" TEXT NOT NULL,
    "nodeStatus" TEXT NOT NULL DEFAULT 'active',
    "actionOrigin" TEXT,
    "supersedesNodeId" TEXT,
    "content" TEXT NOT NULL,
    "note" TEXT,
    "branchOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ThoughtNode_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "ThoughtMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ThoughtNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ThoughtNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ThoughtNode_supersedesNodeId_fkey" FOREIGN KEY ("supersedesNodeId") REFERENCES "ThoughtNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ThoughtNode" ("actionOrigin", "branchOrder", "content", "createdAt", "id", "kind", "mapId", "note", "parentId", "updatedAt") SELECT "actionOrigin", "branchOrder", "content", "createdAt", "id", "kind", "mapId", "note", "parentId", "updatedAt" FROM "ThoughtNode";
DROP TABLE "ThoughtNode";
ALTER TABLE "new_ThoughtNode" RENAME TO "ThoughtNode";
CREATE INDEX "ThoughtNode_mapId_branchOrder_idx" ON "ThoughtNode"("mapId", "branchOrder");
CREATE INDEX "ThoughtNode_parentId_idx" ON "ThoughtNode"("parentId");
CREATE INDEX "ThoughtNode_kind_idx" ON "ThoughtNode"("kind");
CREATE INDEX "ThoughtNode_nodeStatus_idx" ON "ThoughtNode"("nodeStatus");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
