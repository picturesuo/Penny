import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  buildConnectorSyncPlan,
  buildRefreshTokenUpdate,
  decryptConnectorToken,
  encryptConnectorTokens,
  fetchConnectorSyncItems,
  refreshConnectorOAuthToken,
  type ConnectorFetchHttpClient,
  type ConnectorOAuthRefreshExchange,
  type ConnectorSyncItem,
  type ConnectorTokenInput,
} from "./context-connector-service.ts";
import type { PennyDatabase } from "./db/client.ts";
import {
  brainEdges,
  brainNodes,
  checkResults,
  claimSuggestions,
  connectorAccounts,
  connectorSyncJobs,
  consentSettings,
  contextAuditLogs,
  contextChunks,
  contextSources,
  evidencePointers,
  learnCards,
  memoryShards,
  sourceDigests,
} from "./db/schema.ts";
import type {
  ConnectorScopePlan,
  EphemeralProcessResult,
  ContextProvider,
  MemoryReviewStatus,
  RetrievalShard,
  RetrievalRequest,
  RetrievalResult,
} from "./context-layer.ts";
import { checkMemoryGraph, createLearnCardsForShards, processEphemeralContext, rankMemoryShards } from "./context-layer.ts";
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
    connectorAccountId?: string;
  },
): Promise<EphemeralProcessResult> {
  return db.transaction(async (tx) => {
    const scope = scopeValues(input.scope);
    const now = new Date();
    const account = input.connectorAccountId
      ? await touchConnectorAccount(tx, scope, input.connectorAccountId, now)
      : (
          await tx
            .insert(connectorAccounts)
            .values({
              ...scope,
              provider: input.processing.source.provider,
              scopes: scopesFromPlan(input.connectorPlan),
              status: "active",
              lastSync: now,
            })
            .returning()
        )[0];

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
    const persistedShards: RetrievalShard[] = [];

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
            topicCluster: shard.topicCluster,
          },
          lastSeen: new Date(shard.lastSeen),
          visibility: shard.visibility,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to persist memory shard.");
      }

      shardIdMap.set(shard.id, row.id);
      persistedShards.push({
        id: row.id,
        text: row.text,
        type: row.type,
        sourceClass: row.sourceClass,
        confidence: row.confidence,
        decay: row.decay,
        lastSeen: row.lastSeen.toISOString(),
        topicCluster: shard.topicCluster,
        evidence: shard.evidence,
      });

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

    const nodeIdByShardId = new Map<string, string>();

    for (const node of input.processing.brainNodes) {
      if (!node.shardId) {
        continue;
      }

      const persistedShardId = shardIdMap.get(node.shardId);
      const persistedNodeId = nodeIdMap.get(node.id);

      if (persistedShardId && persistedNodeId) {
        nodeIdByShardId.set(persistedShardId, persistedNodeId);
      }
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

    const checkSignals = checkMemoryGraph({
      shards: persistedShards,
      edges: input.processing.brainEdges,
    });

    for (const signal of checkSignals) {
      const matchingShard = persistedShards.find((shard) => signal.claim === shard.text) ?? persistedShards[0];
      const nodeId = matchingShard ? nodeIdByShardId.get(matchingShard.id) : undefined;

      if (!nodeId) {
        continue;
      }

      await tx.insert(checkResults).values({
        ...scope,
        nodeId,
        claim: signal.claim,
        risk: signal.risk,
        explanation: signal.explanation,
        evidenceIds: signal.evidenceIds,
      });
    }

    for (const card of createLearnCardsForShards(persistedShards)) {
      const nodeId = nodeIdByShardId.get(card.nodeId.replace(/^node:/, ""));

      if (!nodeId) {
        continue;
      }

      await tx.insert(learnCards).values({
        ...scope,
        nodeId,
        prompt: card.prompt,
        answerHint: card.answerHint,
        dueAt: new Date(card.dueAt),
        strength: card.strength,
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

export type ConnectContextConnectorPayload = {
  connectorAccountId: string;
  provider: ContextProvider;
  scopes: string[];
  status: "active";
  tokenExpiresAt: string | null;
  auditEvent: "connector.connected";
};

export async function connectContextConnector(
  db: PennyDatabase,
  input: {
    scope: BrainScope;
    provider: ContextProvider;
    connectorPlan: ConnectorScopePlan;
    token?: ConnectorTokenInput | null;
    tokenSecret?: string | null;
  },
): Promise<ConnectContextConnectorPayload> {
  return db.transaction(async (tx) => {
    const scope = scopeValues(input.scope);
    const encryptedTokens = input.token
      ? encryptConnectorTokens(input.token, input.tokenSecret ?? process.env.PENNY_CONNECTOR_TOKEN_SECRET ?? "")
      : {
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          tokenExpiresAt: null,
        };
    const [account] = await tx
      .insert(connectorAccounts)
      .values({
        ...scope,
        provider: input.provider,
        scopes: scopesFromPlan(input.connectorPlan),
        status: "active",
        encryptedAccessToken: encryptedTokens.encryptedAccessToken,
        encryptedRefreshToken: encryptedTokens.encryptedRefreshToken,
        tokenExpiresAt: encryptedTokens.tokenExpiresAt,
      })
      .returning();

    if (!account) {
      throw new Error("Failed to connect context connector.");
    }

    await tx.insert(contextAuditLogs).values({
      ...scope,
      event: "connector.connected",
      actorUserId: scope.userId,
      connectorAccountId: account.id,
      details: {
        provider: input.provider,
        scopes: account.scopes,
        hasEncryptedAccessToken: Boolean(account.encryptedAccessToken),
        hasEncryptedRefreshToken: Boolean(account.encryptedRefreshToken),
      },
    });

    return {
      connectorAccountId: account.id,
      provider: account.provider,
      scopes: account.scopes,
      status: "active",
      tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
      auditEvent: "connector.connected",
    };
  });
}

export type SyncContextConnectorPayload = {
  syncJobId: string;
  provider: ContextProvider;
  status: "succeeded";
  importsCreated: number;
  warnings: string[];
};

export type FetchContextConnectorPayload = {
  connectorAccountId: string;
  provider: Extract<ContextProvider, "gmail" | "calendar">;
  fetchedAt: string;
  items: ConnectorSyncItem[];
  warnings: string[];
  auditEvent: "source.fetched";
};

export type RefreshContextConnectorPayload = {
  connectorAccountId: string;
  provider: Extract<ContextProvider, "gmail" | "calendar">;
  status: "active";
  tokenExpiresAt: string | null;
  refreshTokenRotated: boolean;
  auditEvent: "connector.refreshed";
};

export async function refreshContextConnectorToken(
  db: PennyDatabase,
  input: {
    scope: BrainScope;
    connectorAccountId: string;
    provider: Extract<ContextProvider, "gmail" | "calendar">;
    clientId: string;
    clientSecret: string;
    tokenSecret?: string | null;
    exchange: ConnectorOAuthRefreshExchange;
  },
): Promise<RefreshContextConnectorPayload> {
  return db.transaction(async (tx) => {
    const scope = scopeValues(input.scope);
    const [account] = await tx
      .select()
      .from(connectorAccounts)
      .where(and(eq(connectorAccounts.id, input.connectorAccountId), scopeCondition(connectorAccounts, scope)))
      .limit(1);

    if (!account || account.status !== "active") {
      throw new Error("Active connector account was not found.");
    }

    if (account.provider !== input.provider) {
      throw new Error("Connector account provider does not match refresh provider.");
    }

    if (!account.encryptedRefreshToken) {
      throw new Error("Connector account does not have a refresh token.");
    }

    const tokenSecret = input.tokenSecret ?? process.env.PENNY_CONNECTOR_TOKEN_SECRET ?? "";
    const existingRefreshToken = decryptConnectorToken(account.encryptedRefreshToken, tokenSecret);
    const refreshedToken = await refreshConnectorOAuthToken({
      provider: input.provider,
      refreshToken: existingRefreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      exchange: input.exchange,
    });
    const encryptedTokens = buildRefreshTokenUpdate(refreshedToken, tokenSecret);
    const refreshedAt = new Date();
    const [updated] = await tx
      .update(connectorAccounts)
      .set({
        encryptedAccessToken: encryptedTokens.encryptedAccessToken,
        encryptedRefreshToken: encryptedTokens.encryptedRefreshToken,
        tokenExpiresAt: encryptedTokens.tokenExpiresAt,
        updatedAt: refreshedAt,
      })
      .where(and(eq(connectorAccounts.id, input.connectorAccountId), scopeCondition(connectorAccounts, scope)))
      .returning();

    if (!updated) {
      throw new Error("Failed to refresh connector account token.");
    }

    const refreshTokenRotated = refreshedToken.refreshToken !== existingRefreshToken;

    await tx.insert(contextAuditLogs).values({
      ...scope,
      event: "connector.refreshed",
      actorUserId: scope.userId,
      connectorAccountId: account.id,
      details: {
        provider: input.provider,
        refreshTokenRotated,
        tokenExpiresAt: updated.tokenExpiresAt?.toISOString() ?? null,
      },
    });

    return {
      connectorAccountId: updated.id,
      provider: input.provider,
      status: "active",
      tokenExpiresAt: updated.tokenExpiresAt?.toISOString() ?? null,
      refreshTokenRotated,
      auditEvent: "connector.refreshed",
    };
  });
}

export async function fetchContextConnectorItems(
  db: PennyDatabase,
  input: {
    scope: BrainScope;
    connectorAccountId: string;
    provider: Extract<ContextProvider, "gmail" | "calendar">;
    selection: Parameters<typeof fetchConnectorSyncItems>[0]["selection"];
    maxItems?: number;
    tokenSecret?: string | null;
    fetchHttp?: ConnectorFetchHttpClient;
  },
): Promise<FetchContextConnectorPayload> {
  const scope = scopeValues(input.scope);
  const [account] = await db
    .select()
    .from(connectorAccounts)
    .where(and(eq(connectorAccounts.id, input.connectorAccountId), scopeCondition(connectorAccounts, scope)))
    .limit(1);

  if (!account || account.status !== "active") {
    throw new Error("Active connector account was not found.");
  }

  if (account.provider !== input.provider) {
    throw new Error("Connector account provider does not match fetch provider.");
  }

  if (!account.encryptedAccessToken) {
    throw new Error("Connector account does not have an access token.");
  }

  const fetchInput: Parameters<typeof fetchConnectorSyncItems>[0] = {
    provider: input.provider,
    selection: input.selection,
    accessToken: decryptConnectorToken(
      account.encryptedAccessToken,
      input.tokenSecret ?? process.env.PENNY_CONNECTOR_TOKEN_SECRET ?? "",
    ),
    http: input.fetchHttp ?? defaultConnectorFetchHttp,
  };

  if (input.maxItems !== undefined) {
    fetchInput.maxItems = input.maxItems;
  }

  const fetchResult = await fetchConnectorSyncItems(fetchInput);

  await db.insert(contextAuditLogs).values({
    ...scope,
    event: "source.fetched",
    actorUserId: scope.userId,
    connectorAccountId: account.id,
    details: {
      provider: input.provider,
      minimumScope: fetchResult.connectorPlan.minimumScope,
      itemCount: fetchResult.items.length,
    },
  });

  return {
    connectorAccountId: account.id,
    provider: input.provider,
    fetchedAt: fetchResult.fetchedAt,
    items: fetchResult.items,
    warnings: fetchResult.warnings,
    auditEvent: "source.fetched",
  };
}

export async function syncContextConnector(
  db: PennyDatabase,
  input: {
    scope: BrainScope;
    connectorAccountId: string;
    provider: ContextProvider;
    selection: Parameters<typeof buildConnectorSyncPlan>[0]["selection"];
    items: readonly ConnectorSyncItem[];
    fetchedAt?: string;
    autoApprove?: boolean;
    rawRetention?: boolean;
  },
): Promise<SyncContextConnectorPayload> {
  const scope = scopeValues(input.scope);
  const syncPlanInput: Parameters<typeof buildConnectorSyncPlan>[0] = {
    provider: input.provider,
    selection: input.selection,
    items: input.items,
  };

  if (input.fetchedAt !== undefined) {
    syncPlanInput.fetchedAt = input.fetchedAt;
  }

  if (input.autoApprove !== undefined) {
    syncPlanInput.autoApprove = input.autoApprove;
  }

  if (input.rawRetention !== undefined) {
    syncPlanInput.rawRetention = input.rawRetention;
  }

  const syncPlan = buildConnectorSyncPlan(syncPlanInput);

  if (!syncPlan.connectorPlan.allowed) {
    throw new Error(syncPlan.warnings[0] ?? "Connector sync scope is not allowed.");
  }

  const job = await db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(connectorAccounts)
      .where(and(eq(connectorAccounts.id, input.connectorAccountId), scopeCondition(connectorAccounts, scope)))
      .limit(1);

    if (!account || account.status !== "active") {
      throw new Error("Active connector account was not found.");
    }

    const [inFlightJob] = await tx
      .select()
      .from(connectorSyncJobs)
      .where(
        and(
          eq(connectorSyncJobs.connectorAccountId, account.id),
          eq(connectorSyncJobs.rateLimitKey, syncPlan.syncJob.rateLimitKey),
          scopeCondition(connectorSyncJobs, scope),
          inArray(connectorSyncJobs.status, ["queued", "running"]),
        ),
      )
      .limit(1);

    if (inFlightJob) {
      throw new Error("Connector sync is already in progress for this scope.");
    }

    const startedAt = new Date();
    const [job] = await tx
      .insert(connectorSyncJobs)
      .values({
        ...scope,
        connectorAccountId: account.id,
        provider: input.provider,
        status: "running",
        minimumScope: syncPlan.syncJob.minimumScope,
        rateLimitKey: syncPlan.syncJob.rateLimitKey,
        startedAt,
      })
      .returning();

    if (!job) {
      throw new Error("Failed to create connector sync job.");
    }

    return job;
  });

  try {
    for (const importInput of syncPlan.imports) {
      await persistContextImport(db, {
        scope,
        connectorPlan: syncPlan.connectorPlan,
        processing: processEphemeralContext(importInput),
        connectorAccountId: input.connectorAccountId,
      });
    }

    await db
      .update(connectorSyncJobs)
      .set({
        status: "succeeded",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(connectorSyncJobs.id, job.id), scopeCondition(connectorSyncJobs, scope)));

    return {
      syncJobId: job.id,
      provider: input.provider,
      status: "succeeded",
      importsCreated: syncPlan.imports.length,
      warnings: syncPlan.warnings,
    };
  } catch (error) {
    await db
      .update(connectorSyncJobs)
      .set({
        status: "failed",
        completedAt: new Date(),
        updatedAt: new Date(),
        error: { message: error instanceof Error ? error.message : String(error) },
      })
      .where(and(eq(connectorSyncJobs.id, job.id), scopeCondition(connectorSyncJobs, scope)));

    throw error;
  }
}

export async function retrieveContextMemories(
  db: PennyDatabase,
  scope: BrainScope,
  request: RetrievalRequest,
): Promise<{ sourceOfTruth: "context_layer_memory_retrieval"; results: RetrievalResult[] }> {
  const shardRows = await db
    .select()
    .from(memoryShards)
    .where(scopeCondition(memoryShards, scope))
    .orderBy(desc(memoryShards.lastSeen))
    .limit(200);
  const shardIds = shardRows.map((shard) => shard.id);
  const pointerRows = shardIds.length
    ? await db
        .select()
        .from(evidencePointers)
        .where(and(scopeCondition(evidencePointers, scope), inArray(evidencePointers.shardId, shardIds)))
    : [];
  const sourceIds = [...new Set(pointerRows.map((pointer) => pointer.sourceId))];
  const sourceRows = sourceIds.length
    ? await db
        .select()
        .from(contextSources)
        .where(and(scopeCondition(contextSources, scope), inArray(contextSources.id, sourceIds)))
    : [];
  const nodeRows = shardIds.length
    ? await db
        .select()
        .from(brainNodes)
        .where(and(scopeCondition(brainNodes, scope), inArray(brainNodes.memoryShardId, shardIds)))
    : [];
  const nodeIds = nodeRows.map((node) => node.id);
  const edgeRows = nodeIds.length
    ? await db
        .select()
        .from(brainEdges)
        .where(
          and(
            scopeCondition(brainEdges, scope),
            or(inArray(brainEdges.fromNode, nodeIds), inArray(brainEdges.toNode, nodeIds)),
          ),
        )
    : [];
  const sourceById = new Map(sourceRows.map((source) => [source.id, source]));
  const pointersByShard = new Map<string, typeof pointerRows>();

  for (const pointer of pointerRows) {
    pointersByShard.set(pointer.shardId, [...(pointersByShard.get(pointer.shardId) ?? []), pointer]);
  }

  const graphDistanceByShard = new Map<string, number>();

  for (const node of nodeRows) {
    if (!node.memoryShardId) {
      continue;
    }

    graphDistanceByShard.set(
      node.memoryShardId,
      edgeRows.some((edge) => edge.fromNode === node.id || edge.toNode === node.id) ? 1 : 3,
    );
  }

  const retrievalShards: RetrievalShard[] = shardRows.map((shard) => {
    const consent = asRecord(shard.consent);
    const pointers = pointersByShard.get(shard.id) ?? [];

    return {
      id: shard.id,
      text: shard.text,
      type: shard.type,
      sourceClass: shard.sourceClass,
      confidence: shard.confidence,
      decay: shard.decay,
      lastSeen: shard.lastSeen.toISOString(),
      topicCluster: typeof consent.topicCluster === "string" ? consent.topicCluster : shard.type,
      graphDistance: graphDistanceByShard.get(shard.id) ?? 3,
      projectRelevance: shard.visibility === "project" ? 0.85 : 0.5,
      novelty: 0.5,
      contradicted: shard.reviewStatus === "rejected",
      evidence: pointers.map((pointer) => ({
        sourceUri: sourceById.get(pointer.sourceId)?.sourceUri ?? pointer.sourceId,
        locator: locatorFromValue(pointer.locator),
        snippetPolicy: pointer.snippetPolicy,
      })),
    };
  });

  return {
    sourceOfTruth: "context_layer_memory_retrieval",
    results: rankMemoryShards(request, retrievalShards),
  };
}

export type ContextArtifactsPayload = {
  sourceOfTruth: "context_layer_artifacts";
  checkResults: Array<{
    id: string;
    nodeId: string;
    claim: string;
    risk: string;
    explanation: string;
    evidenceIds: string[];
    createdAt: string;
  }>;
  learnCards: Array<{
    id: string;
    nodeId: string;
    prompt: string;
    answerHint: string;
    dueAt: string;
    strength: number;
    createdAt: string;
  }>;
};

export async function loadContextArtifacts(
  db: PennyDatabase,
  scope: BrainScope,
  input: { limit?: number } = {},
): Promise<ContextArtifactsPayload> {
  const boundedLimit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const [checkRows, cardRows] = await Promise.all([
    db
      .select()
      .from(checkResults)
      .where(scopeCondition(checkResults, scope))
      .orderBy(desc(checkResults.createdAt))
      .limit(boundedLimit),
    db
      .select()
      .from(learnCards)
      .where(scopeCondition(learnCards, scope))
      .orderBy(asc(learnCards.dueAt))
      .limit(boundedLimit),
  ]);

  return {
    sourceOfTruth: "context_layer_artifacts",
    checkResults: checkRows.map((row) => ({
      id: row.id,
      nodeId: row.nodeId,
      claim: row.claim,
      risk: row.risk,
      explanation: row.explanation,
      evidenceIds: row.evidenceIds,
      createdAt: row.createdAt.toISOString(),
    })),
    learnCards: cardRows.map((row) => ({
      id: row.id,
      nodeId: row.nodeId,
      prompt: row.prompt,
      answerHint: row.answerHint,
      dueAt: row.dueAt.toISOString(),
      strength: row.strength,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export type ContextConsentUpdate = {
  memoryEnabled?: boolean;
  referenceChatgptImport?: boolean;
  referenceGmail?: boolean;
  referenceCalendar?: boolean;
  useForPrivateFineTune?: boolean;
  useToImproveSharedModels?: boolean;
};

export type ContextConsentPayload = {
  memoryEnabled: boolean;
  referenceChatgptImport: boolean;
  referenceGmail: boolean;
  referenceCalendar: boolean;
  useForPrivateFineTune: boolean;
  useToImproveSharedModels: boolean;
  auditEvent: "consent.updated" | "training.preference.updated";
};

export async function updateContextConsent(
  db: PennyDatabase,
  input: {
    scope: BrainScope;
    consent: ContextConsentUpdate;
  },
): Promise<ContextConsentPayload> {
  const scope = scopeValues(input.scope);
  const nextConsent = {
    memoryEnabled: input.consent.memoryEnabled ?? true,
    referenceChatgptImport: input.consent.referenceChatgptImport ?? false,
    referenceGmail: input.consent.referenceGmail ?? false,
    referenceCalendar: input.consent.referenceCalendar ?? false,
    useForPrivateFineTune: input.consent.useForPrivateFineTune ?? false,
    useToImproveSharedModels:
      input.consent.memoryEnabled === false ? false : input.consent.useToImproveSharedModels ?? false,
  };
  const auditEvent =
    input.consent.useForPrivateFineTune !== undefined || input.consent.useToImproveSharedModels !== undefined
      ? "training.preference.updated"
      : "consent.updated";

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(consentSettings)
      .values({
        ...scope,
        ...nextConsent,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          consentSettings.userId,
          consentSettings.workspaceId,
          consentSettings.projectId,
          consentSettings.sphereId,
        ],
        set: {
          ...nextConsent,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to update Context Layer consent settings.");
    }

    await tx.insert(contextAuditLogs).values({
      ...scope,
      event: auditEvent,
      actorUserId: scope.userId,
      details: nextConsent,
    });

    return {
      memoryEnabled: row.memoryEnabled,
      referenceChatgptImport: row.referenceChatgptImport,
      referenceGmail: row.referenceGmail,
      referenceCalendar: row.referenceCalendar,
      useForPrivateFineTune: row.useForPrivateFineTune,
      useToImproveSharedModels: row.useToImproveSharedModels,
      auditEvent,
    };
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

async function touchConnectorAccount(
  tx: Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0],
  scope: BrainScope,
  connectorAccountId: string,
  lastSync: Date,
): Promise<typeof connectorAccounts.$inferSelect | undefined> {
  const [account] = await tx
    .update(connectorAccounts)
    .set({
      lastSync,
      updatedAt: lastSync,
    })
    .where(and(eq(connectorAccounts.id, connectorAccountId), scopeCondition(connectorAccounts, scope)))
    .returning();

  return account;
}

function locatorFromValue(value: unknown): { chunkHash: string; line?: number; pattern?: string } {
  const record = asRecord(value);
  const locator: { chunkHash: string; line?: number; pattern?: string } = {
    chunkHash: typeof record.chunkHash === "string" ? record.chunkHash : "unknown",
  };

  if (typeof record.line === "number") {
    locator.line = record.line;
  }

  if (typeof record.pattern === "string") {
    locator.pattern = record.pattern;
  }

  return locator;
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

const defaultConnectorFetchHttp: ConnectorFetchHttpClient = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
  });
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  return {
    status: response.status,
    body,
  };
};
