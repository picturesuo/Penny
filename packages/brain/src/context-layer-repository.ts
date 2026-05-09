import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { PennyDatabase } from "./db/client.ts";
import {
  brainEdges,
  brainNodes,
  claimSuggestions,
  connectorAccounts,
  consentSettings,
  contextAuditLogs,
  contextChunks,
  contextSources,
  evidencePointers,
  memoryShards,
  sourceDigests,
} from "./db/schema.ts";
import type {
  ConnectorScopePlan,
  EphemeralProcessResult,
  MemoryReviewStatus,
} from "./context-layer.ts";
import type {
  ContextDashboardPayload,
  DeleteMemoryPayload,
  MemoryReviewAction,
  MemoryReviewPayload,
  RevokeConnectorPayload,
} from "./context-layer-route.ts";
import { scopeValues, type BrainScope } from "./scope.ts";

type ScopeColumn = AnyPgColumn;
type ScopeTable = {
  userId: ScopeColumn;
  workspaceId: ScopeColumn;
  projectId: ScopeColumn;
  sphereId: ScopeColumn;
};

const reviewStatusByAction: Record<MemoryReviewAction, MemoryReviewStatus> = {
  approve: "approved",
  reject: "rejected",
  edit: "pending",
  merge: "merged",
  deprioritize: "deprioritized",
};

export async function loadContextDashboard(
  db: PennyDatabase,
  scope: BrainScope,
): Promise<ContextDashboardPayload> {
  const [sourceRows, accountRows, reviewRows, consentRows, auditRows] = await Promise.all([
    db
      .select()
      .from(contextSources)
      .where(scopeCondition(contextSources, scope))
      .orderBy(desc(contextSources.updatedAt))
      .limit(50),
    db
      .select()
      .from(connectorAccounts)
      .where(scopeCondition(connectorAccounts, scope))
      .orderBy(desc(connectorAccounts.updatedAt))
      .limit(50),
    db
      .select()
      .from(memoryShards)
      .where(and(scopeCondition(memoryShards, scope), eq(memoryShards.reviewStatus, "pending")))
      .orderBy(desc(memoryShards.createdAt))
      .limit(50),
    db.select().from(consentSettings).where(scopeCondition(consentSettings, scope)).limit(1),
    db
      .select()
      .from(contextAuditLogs)
      .where(scopeCondition(contextAuditLogs, scope))
      .orderBy(desc(contextAuditLogs.createdAt))
      .limit(200),
  ]);
  const chunkRows = sourceRows.length
    ? await db
        .select()
        .from(contextChunks)
        .where(
          and(
            scopeCondition(contextChunks, scope),
            inArray(
              contextChunks.sourceId,
              sourceRows.map((source) => source.id),
            ),
          ),
        )
    : [];
  const sourceIds = new Set(sourceRows.map((source) => source.id));
  const pointerRows = sourceRows.length
    ? await db
        .select()
        .from(evidencePointers)
        .where(
          and(
            scopeCondition(evidencePointers, scope),
            inArray(
              evidencePointers.sourceId,
              sourceRows.map((source) => source.id),
            ),
          ),
        )
    : [];
  const memoriesBySource = new Map<string, Set<string>>();

  for (const pointer of pointerRows) {
    if (!sourceIds.has(pointer.sourceId)) {
      continue;
    }

    const ids = memoriesBySource.get(pointer.sourceId) ?? new Set<string>();

    ids.add(pointer.shardId);
    memoriesBySource.set(pointer.sourceId, ids);
  }
  const consentRow = consentRows[0] ?? null;

  return {
    sourceOfTruth: "context_layer",
    sources: sourceRows.map((source) => {
      const account = accountRows.find((candidate) => candidate.id === source.connectorAccountId) ?? null;
      const chunks = chunkRows.filter((chunk) => chunk.sourceId === source.id);

      return {
        id: source.id,
        provider: source.provider,
        label: source.label,
        scopes: account?.scopes ?? [],
        lastSync: account?.lastSync?.toISOString() ?? null,
        memoriesCreated: memoriesBySource.get(source.id)?.size ?? 0,
        rawRetention: chunks.some((chunk) => chunk.retentionFlag),
        status: account?.status ?? "active",
      };
    }),
    reviewQueue: reviewRows.map((shard) => ({
      id: shard.id,
      text: shard.text,
      type: shard.type,
      sourceClass: shard.sourceClass,
      confidence: shard.confidence,
      createdAt: shard.createdAt.toISOString(),
    })),
    consent: consentRow
      ? {
          memoryEnabled: consentRow.memoryEnabled,
          referenceChatgptImport: consentRow.referenceChatgptImport,
          referenceGmail: consentRow.referenceGmail,
          referenceCalendar: consentRow.referenceCalendar,
          useForPrivateFineTune: consentRow.useForPrivateFineTune,
          useToImproveSharedModels: consentRow.useToImproveSharedModels,
        }
      : {
          memoryEnabled: true,
          referenceChatgptImport: false,
          referenceGmail: false,
          referenceCalendar: false,
          useForPrivateFineTune: false,
          useToImproveSharedModels: false,
        },
    auditSummary: {
      lastAccessAt: auditRows[0]?.createdAt.toISOString() ?? null,
      syncCount: auditRows.filter((row) => row.event === "connector.synced").length,
      extractedMemoryCount: auditRows.filter((row) => row.event === "memory.extracted").length,
      deletionCount: auditRows.filter((row) => row.event === "memory.deleted" || row.event === "chunk.deleted").length,
    },
  };
}

export async function persistContextImport(
  db: PennyDatabase,
  input: {
    scope: BrainScope;
    connectorPlan: ConnectorScopePlan;
    processing: EphemeralProcessResult;
  },
): Promise<EphemeralProcessResult> {
  return db.transaction(async (tx) => {
    const scope = scopeValues(input.scope);
    const now = new Date();
    const [account] = await tx
      .insert(connectorAccounts)
      .values({
        ...scope,
        provider: input.processing.source.provider,
        scopes: scopesFromPlan(input.connectorPlan),
        status: "active",
        lastSync: now,
      })
      .returning();

    if (!account) {
      throw new Error("Failed to persist connector account.");
    }

    const [source] = await tx
      .insert(contextSources)
      .values({
        ...scope,
        connectorAccountId: account.id,
        provider: input.processing.source.provider,
        sourceUri: input.processing.source.sourceUri,
        label: input.processing.source.label,
        owner: null,
        timeRange: asRecord(input.connectorPlan.minimumScope.dateRange),
        permissions: input.connectorPlan.minimumScope,
      })
      .onConflictDoUpdate({
        target: [contextSources.provider, contextSources.sourceUri, contextSources.userId],
        set: {
          connectorAccountId: account.id,
          label: input.processing.source.label,
          permissions: input.connectorPlan.minimumScope,
          updatedAt: now,
        },
      })
      .returning();

    if (!source) {
      throw new Error("Failed to persist context source.");
    }

    await tx
      .insert(contextChunks)
      .values({
        ...scope,
        sourceId: source.id,
        hash: input.processing.chunk.hash,
        retentionFlag: input.processing.chunk.retentionFlag,
        processingStatus: input.processing.chunk.processingStatus,
        redactionSummary: {
          findings: input.processing.redaction.findings,
        },
        rawDeletedAt: input.processing.chunk.rawDeleted ? now : null,
      })
      .onConflictDoNothing();

    const [digest] = await tx
      .insert(sourceDigests)
      .values({
        ...scope,
        sourceId: source.id,
        title: input.processing.digest.title,
        summary: input.processing.digest.summary,
        provenance: input.processing.digest.provenance,
      })
      .returning();

    if (!digest) {
      throw new Error("Failed to persist source digest.");
    }

    const shardIdMap = new Map<string, string>();
    const nodeIdMap = new Map<string, string>();

    for (const shard of input.processing.memoryShards) {
      const [row] = await tx
        .insert(memoryShards)
        .values({
          ...scope,
          text: shard.text,
          type: shard.type,
          sourceClass: shard.sourceClass,
          confidence: shard.confidence,
          decay: shard.decay,
          reviewStatus: shard.reviewStatus,
          sourceDigestId: digest.id,
          consent: {
            visibility: shard.visibility,
            autoApproved: shard.reviewStatus === "auto_approved",
          },
          lastSeen: new Date(shard.lastSeen),
          visibility: shard.visibility,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to persist memory shard.");
      }

      shardIdMap.set(shard.id, row.id);

      await tx.insert(claimSuggestions).values({
        ...scope,
        shardId: row.id,
        claim: shard.text,
        kind: shard.type === "concept" ? "concept" : shard.type === "claim" ? "belief" : "assumption",
        confidence: shard.confidence,
        reviewStatus: shard.reviewStatus,
        rationale: `Extracted from ${input.processing.source.provider} context.`,
      });

      for (const evidence of shard.evidence) {
        await tx.insert(evidencePointers).values({
          ...scope,
          shardId: row.id,
          sourceId: source.id,
          locator: evidence.locator,
          snippetPolicy: evidence.snippetPolicy,
        });
      }
    }

    for (const node of input.processing.brainNodes) {
      const shardId = node.shardId ? shardIdMap.get(node.shardId) : undefined;
      const [row] = await tx
        .insert(brainNodes)
        .values({
          ...scope,
          type: node.type,
          title: node.title,
          summary: node.summary,
          status: node.status,
          memoryShardId: shardId ?? null,
          claimId: null,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to persist Brain node.");
      }

      nodeIdMap.set(node.id, row.id);
    }

    for (const edge of input.processing.brainEdges) {
      const fromNode = nodeIdMap.get(edge.fromNode);
      const toNode = nodeIdMap.get(edge.toNode);

      if (!fromNode || !toNode) {
        continue;
      }

      await tx.insert(brainEdges).values({
        ...scope,
        fromNode,
        toNode,
        type: edge.type,
        weight: edge.weight,
        evidenceIds: edge.evidenceIds,
      });
    }

    await tx.insert(contextAuditLogs).values([
      {
        ...scope,
        event: "connector.connected",
        actorUserId: scope.userId,
        connectorAccountId: account.id,
        sourceId: source.id,
        details: { provider: input.processing.source.provider, minimumScope: input.connectorPlan.minimumScope },
      },
      {
        ...scope,
        event: "connector.synced",
        actorUserId: scope.userId,
        connectorAccountId: account.id,
        sourceId: source.id,
        details: { sourceUri: input.processing.source.sourceUri },
      },
      {
        ...scope,
        event: "memory.extracted",
        actorUserId: scope.userId,
        connectorAccountId: account.id,
        sourceId: source.id,
        details: { count: input.processing.memoryShards.length, digestId: digest.id },
      },
      {
        ...scope,
        event: input.processing.chunk.rawDeleted ? "chunk.deleted" : "chunk.redacted",
        actorUserId: scope.userId,
        connectorAccountId: account.id,
        sourceId: source.id,
        details: {
          chunkHash: input.processing.chunk.hash,
          rawDeleted: input.processing.chunk.rawDeleted,
          findings: input.processing.redaction.findings,
        },
      },
    ]);

    return input.processing;
  });
}

export async function reviewContextMemory(
  db: PennyDatabase,
  input: {
    scope: BrainScope;
    memoryId: string;
    action: MemoryReviewAction;
    text: string | null;
    mergeIntoMemoryId: string | null;
  },
): Promise<MemoryReviewPayload> {
  return db.transaction(async (tx) => {
    const scope = scopeValues(input.scope);
    const reviewStatus = reviewStatusByAction[input.action];
    const [existing] = await tx
      .select()
      .from(memoryShards)
      .where(and(eq(memoryShards.id, input.memoryId), scopeCondition(memoryShards, scope)))
      .limit(1);

    if (!existing) {
      throw new Error("Memory shard was not found.");
    }

    await tx
      .update(memoryShards)
      .set({
        text: input.text ?? existing.text,
        reviewStatus,
      })
      .where(and(eq(memoryShards.id, input.memoryId), scopeCondition(memoryShards, scope)));

    await tx
      .update(brainNodes)
      .set({
        summary: input.text ?? existing.text,
        status: reviewStatus === "approved" || reviewStatus === "auto_approved" ? "active" : "needs_review",
      })
      .where(and(eq(brainNodes.memoryShardId, input.memoryId), scopeCondition(brainNodes, scope)));

    await tx.insert(contextAuditLogs).values({
      ...scope,
      event: auditEventForReview(input.action),
      actorUserId: scope.userId,
      memoryShardId: input.memoryId,
      details: {
        action: input.action,
        reviewStatus,
        mergeIntoMemoryId: input.mergeIntoMemoryId,
      },
    });

    return {
      memoryId: input.memoryId,
      action: input.action,
      reviewStatus,
      text: input.text,
      mergeIntoMemoryId: input.mergeIntoMemoryId,
      auditEvent: auditEventForReview(input.action),
    };
  });
}

export async function deleteContextMemory(
  db: PennyDatabase,
  input: { scope: BrainScope; memoryId: string },
): Promise<DeleteMemoryPayload> {
  return db.transaction(async (tx) => {
    const scope = scopeValues(input.scope);
    const [existing] = await tx
      .select()
      .from(memoryShards)
      .where(and(eq(memoryShards.id, input.memoryId), scopeCondition(memoryShards, scope)))
      .limit(1);

    if (!existing) {
      throw new Error("Memory shard was not found.");
    }

    await tx.insert(contextAuditLogs).values({
      ...scope,
      event: "memory.deleted",
      actorUserId: scope.userId,
      memoryShardId: input.memoryId,
      details: { rawDeleted: true },
    });
    await tx.delete(memoryShards).where(and(eq(memoryShards.id, input.memoryId), scopeCondition(memoryShards, scope)));

    return {
      memoryId: input.memoryId,
      deleted: true,
      rawDeleted: true,
      auditEvent: "memory.deleted",
    };
  });
}

export async function revokeContextConnector(
  db: PennyDatabase,
  input: { scope: BrainScope; connectorAccountId: string },
): Promise<RevokeConnectorPayload> {
  return db.transaction(async (tx) => {
    const scope = scopeValues(input.scope);
    const revokedAt = new Date();
    const [account] = await tx
      .update(connectorAccounts)
      .set({
        status: "revoked",
        revokedAt,
        updatedAt: revokedAt,
      })
      .where(and(eq(connectorAccounts.id, input.connectorAccountId), scopeCondition(connectorAccounts, scope)))
      .returning();

    if (!account) {
      throw new Error("Connector account was not found.");
    }

    await tx.insert(contextAuditLogs).values({
      ...scope,
      event: "connector.revoked",
      actorUserId: scope.userId,
      connectorAccountId: input.connectorAccountId,
      details: { provider: account.provider, revokedAt: revokedAt.toISOString() },
    });

    return {
      connectorAccountId: input.connectorAccountId,
      revoked: true,
      auditEvent: "connector.revoked",
    };
  });
}

function scopeCondition(table: ScopeTable, scope: BrainScope) {
  return and(
    nullableEq(table.userId, scope.userId),
    nullableEq(table.workspaceId, scope.workspaceId),
    nullableEq(table.projectId, scope.projectId),
    nullableEq(table.sphereId, scope.sphereId),
  );
}

function nullableEq(column: ScopeColumn, value: string | null) {
  return value === null ? sql`${column} IS NULL` : eq(column, value);
}

function scopesFromPlan(plan: ConnectorScopePlan): string[] {
  const scopes = plan.minimumScope.scopes;

  return Array.isArray(scopes) ? scopes.map(String) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function auditEventForReview(action: MemoryReviewAction) {
  switch (action) {
    case "approve":
      return "memory.approved";
    case "reject":
      return "memory.rejected";
    case "edit":
      return "memory.edited";
    case "merge":
      return "memory.merged";
    case "deprioritize":
      return "memory.edited";
  }
}
