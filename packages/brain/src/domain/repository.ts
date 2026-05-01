import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { PennyDatabase } from "../db/client.ts";
import {
  artifacts,
  brainEmbeddings,
  brainObjects,
  brainRecents,
  challengeRounds,
  claimEdges,
  claims,
  claimVersions,
  focusStates,
  moves,
  nextMoveCandidates,
  sessionNotes,
  sessions,
  sources,
} from "../db/schema.ts";
import {
  createMove as createPersistedMove,
  type CreatedMove,
  type CreateMoveInput,
  type MoveKind,
} from "../move-payloads.ts";
import {
  learnRecentInputFromSessionOutput,
  learnSessionSaveCandidateFromRecent,
  type LearnSessionOutput,
  type LearnSessionSaveCandidate,
} from "../learn-session-output.ts";
import { scopeValues, type BrainScope } from "../scope.ts";
import type {
  BrainEmbeddingObjectType,
  BrainSearchResult,
  CanvasEdge,
  CanvasNode,
  ChallengeBriefArtifact,
  ClaimVersionSnapshot,
  EntityId,
  FocusState,
  ThinkingClaim,
  ThinkingEdge,
  ThinkingGraphSnapshot,
  ThinkingMove,
} from "./types.ts";
import type {
  NextMoveCandidate,
  NextMoveExitCriteria,
  NextMoveProvenance,
  NextMoveScoreBreakdown,
} from "./engine.ts";

export const recentSearchTtlMs = 1000 * 60 * 60 * 24 * 14;

export type UpsertEmbeddingForObjectInput = {
  scope: BrainScope;
  objectType: BrainEmbeddingObjectType;
  objectId: EntityId;
  title: string;
  content: string;
  embedding: ReadonlyArray<number>;
  embeddingModel: string;
  sessionId?: EntityId | null;
  metadata?: Record<string, unknown>;
  expiresAt?: Date | string | null;
};

export type BrainSearchInput = {
  scope: BrainScope;
  query: string;
  embedding?: ReadonlyArray<number>;
  limit?: number;
  now?: Date;
  includeExpired?: boolean;
};

export type PersistedNextMoveCandidate = Omit<
  typeof nextMoveCandidates.$inferSelect,
  "action" | "mode" | "reasonCodes" | "exitCriteria" | "scoreBreakdown" | "provenance"
> & {
  action: NextMoveCandidate["action"];
  mode: NextMoveCandidate["mode"];
  reasonCodes: ReadonlyArray<string>;
  exitCriteria: NextMoveExitCriteria;
  scoreBreakdown: NextMoveScoreBreakdown;
  provenance: NextMoveProvenance;
};

export type AutopilotPersistenceState = {
  sessionId: EntityId;
  focusState: FocusState;
  candidates: ReadonlyArray<PersistedNextMoveCandidate>;
  selectedCandidate: PersistedNextMoveCandidate | null;
};

export type CurrentClaimVersion = {
  claim: typeof claims.$inferSelect;
  version: typeof claimVersions.$inferSelect;
  snapshot: ClaimVersionSnapshot;
};

export type ReviseClaimInput = {
  claimId: EntityId;
  challengeEdgeId: EntityId;
  revisedText: string;
  reasoning?: string | null;
  moveId?: EntityId;
  versionId?: EntityId;
};

export type RevisedClaim = {
  claim: typeof claims.$inferSelect;
  previousVersion: typeof claimVersions.$inferSelect;
  currentVersion: typeof claimVersions.$inferSelect;
  move: CreatedMove<"claim_revised">;
};

export type PersistedLearnSessionRecent = {
  recent: typeof brainRecents.$inferSelect;
  saveCandidate: LearnSessionSaveCandidate;
};

export type ChallengeRoundPersistenceModel = typeof challengeRounds;
export const challengeRoundPersistenceModel: ChallengeRoundPersistenceModel = challengeRounds;
export type ExistingArtifactModel = typeof artifacts;
export const artifactPersistenceModel: ExistingArtifactModel = artifacts;

export interface BrainRepository {
  loadGraphSnapshot(sessionId: EntityId): Promise<ThinkingGraphSnapshot>;
  getAutopilotState(sessionId: EntityId): Promise<AutopilotPersistenceState>;
  upsertNextMoveCandidates(
    sessionId: EntityId,
    candidates: ReadonlyArray<NextMoveCandidate>,
  ): Promise<ReadonlyArray<PersistedNextMoveCandidate>>;
  markCandidateSelected(sessionId: EntityId, fingerprint: string): Promise<PersistedNextMoveCandidate>;
  upsertFocusState(focusState: FocusState): Promise<FocusState>;
  createMove<K extends MoveKind>(kind: K, input: CreateMoveInput<K>): Promise<CreatedMove<K>>;
  getClaimCurrentVersion(claimId: EntityId): Promise<CurrentClaimVersion>;
  reviseClaim(input: ReviseClaimInput): Promise<RevisedClaim>;
  upsertEmbeddingForObject(input: UpsertEmbeddingForObjectInput): Promise<BrainSearchResult>;
  searchBrainSemantic(input: BrainSearchInput): Promise<ReadonlyArray<BrainSearchResult>>;
  searchBrainHybrid(input: BrainSearchInput): Promise<ReadonlyArray<BrainSearchResult>>;
  listCanvasNodesForSession(sessionId: EntityId, scope?: BrainScope): Promise<ReadonlyArray<CanvasNode>>;
  listCanvasEdgesForSession(sessionId: EntityId, scope?: BrainScope): Promise<ReadonlyArray<CanvasEdge>>;
}

type BrainTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];
type CandidateRow = typeof nextMoveCandidates.$inferSelect;
type ClaimRow = typeof claims.$inferSelect;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = typeof claimEdges.$inferSelect;
type MoveRow = typeof moves.$inferSelect;
type ArtifactRow = typeof artifacts.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;
type FocusStateRow = typeof focusStates.$inferSelect;
type SourceRow = typeof sources.$inferSelect;
type BrainEmbeddingRow = typeof brainEmbeddings.$inferSelect;
type BrainObjectRow = typeof brainObjects.$inferSelect;
type BrainRecentRow = typeof brainRecents.$inferSelect;
type SessionNoteRow = typeof sessionNotes.$inferSelect;
type ScopeColumn = AnyPgColumn;
type ScopeTable = {
  userId: ScopeColumn;
  workspaceId: ScopeColumn;
  projectId: ScopeColumn;
  sphereId: ScopeColumn;
};

export class DrizzleBrainRepository implements BrainRepository {
  constructor(private readonly db: PennyDatabase) {}

  async loadGraphSnapshot(sessionId: EntityId): Promise<ThinkingGraphSnapshot> {
    return this.db.transaction((tx) => loadGraphSnapshotInTransaction(tx, sessionId));
  }

  async getAutopilotState(sessionId: EntityId): Promise<AutopilotPersistenceState> {
    return this.db.transaction(async (tx) => {
      const session = await requireSession(tx, sessionId);
      const [focusStateRow] = await tx.select().from(focusStates).where(eq(focusStates.sessionId, sessionId)).limit(1);
      const candidateRows = await tx
        .select()
        .from(nextMoveCandidates)
        .where(eq(nextMoveCandidates.sessionId, sessionId))
        .orderBy(desc(nextMoveCandidates.selected), asc(nextMoveCandidates.rank), asc(nextMoveCandidates.createdAt));
      const candidates = candidateRows.map(toPersistedNextMoveCandidate);

      return {
        sessionId,
        focusState: focusStateRow ? toFocusState(focusStateRow) : defaultFocusState(session),
        candidates,
        selectedCandidate: candidates.find((candidate) => candidate.selected) ?? null,
      };
    });
  }

  async upsertNextMoveCandidates(
    sessionId: EntityId,
    candidates: ReadonlyArray<NextMoveCandidate>,
  ): Promise<ReadonlyArray<PersistedNextMoveCandidate>> {
    if (candidates.length === 0) {
      return [];
    }

    return this.db.transaction(async (tx) => {
      const session = await requireSession(tx, sessionId);
      const now = new Date();
      const persisted: PersistedNextMoveCandidate[] = [];

      for (const candidate of candidates) {
        if (candidate.graphHash !== candidate.provenance.graphHash) {
          throw new BrainRepositoryConflictError("Candidate provenance graphHash must match candidate graphHash.");
        }

        const [row] = await tx
          .insert(nextMoveCandidates)
          .values({
            ...scopeValues(session),
            sessionId,
            candidateId: candidate.candidateId,
            fingerprint: candidate.fingerprint,
            graphHash: candidate.graphHash,
            action: candidate.action,
            mode: candidate.mode,
            targetClaimId: candidate.targetClaimId,
            targetEdgeId: candidate.targetEdgeId,
            score: candidate.score,
            rank: candidate.rank,
            reason: candidate.reason,
            reasonCodes: [...candidate.reasonCodes],
            exitCriteria: candidate.exitCriteria,
            scoreBreakdown: candidate.scoreBreakdown,
            provenance: candidate.provenance,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [nextMoveCandidates.sessionId, nextMoveCandidates.fingerprint],
            set: {
              candidateId: candidate.candidateId,
              graphHash: candidate.graphHash,
              action: candidate.action,
              mode: candidate.mode,
              targetClaimId: candidate.targetClaimId,
              targetEdgeId: candidate.targetEdgeId,
              score: candidate.score,
              rank: candidate.rank,
              reason: candidate.reason,
              reasonCodes: [...candidate.reasonCodes],
              exitCriteria: candidate.exitCriteria,
              scoreBreakdown: candidate.scoreBreakdown,
              provenance: candidate.provenance,
              updatedAt: now,
            },
          })
          .returning();

        if (!row) {
          throw new BrainRepositoryConflictError("Failed to upsert next move candidate.");
        }

        persisted.push(toPersistedNextMoveCandidate(row));
      }

      return persisted;
    });
  }

  async markCandidateSelected(sessionId: EntityId, fingerprint: string): Promise<PersistedNextMoveCandidate> {
    return this.db.transaction(async (tx) => {
      await requireSession(tx, sessionId);
      const selectedAt = new Date();

      await tx
        .update(nextMoveCandidates)
        .set({ selected: false, selectedAt: null, updatedAt: selectedAt })
        .where(eq(nextMoveCandidates.sessionId, sessionId));

      const [selected] = await tx
        .update(nextMoveCandidates)
        .set({ selected: true, selectedAt, updatedAt: selectedAt })
        .where(and(eq(nextMoveCandidates.sessionId, sessionId), eq(nextMoveCandidates.fingerprint, fingerprint)))
        .returning();

      if (!selected) {
        throw new BrainRepositoryNotFoundError("Next move candidate was not found.");
      }

      return toPersistedNextMoveCandidate(selected);
    });
  }

  async upsertFocusState(focusState: FocusState): Promise<FocusState> {
    return this.db.transaction(async (tx) => {
      const session = await requireSession(tx, focusState.sessionId);
      const updatedAt = focusState.updatedAt ? new Date(focusState.updatedAt) : new Date();
      const [row] = await tx
        .insert(focusStates)
        .values({
          ...scopeValues(session),
          sessionId: focusState.sessionId,
          mode: focusState.mode,
          focusedClaimId: focusState.focusedClaimId,
          focusedEdgeId: focusState.focusedEdgeId,
          source: focusState.source,
          suggestionMoveId: focusState.suggestionMoveId,
          manualMoveId: focusState.manualMoveId,
          paused: focusState.paused,
          reason: focusState.reason,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: focusStates.sessionId,
          set: {
            ...scopeValues(session),
            mode: focusState.mode,
            focusedClaimId: focusState.focusedClaimId,
            focusedEdgeId: focusState.focusedEdgeId,
            source: focusState.source,
            suggestionMoveId: focusState.suggestionMoveId,
            manualMoveId: focusState.manualMoveId,
            paused: focusState.paused,
            reason: focusState.reason,
            updatedAt,
          },
        })
        .returning();

      if (!row) {
        throw new BrainRepositoryConflictError("Failed to upsert focus state.");
      }

      return toFocusState(row);
    });
  }

  async createMove<K extends MoveKind>(kind: K, input: CreateMoveInput<K>): Promise<CreatedMove<K>> {
    return this.db.transaction((tx) => createPersistedMove(tx, kind, input));
  }

  async getClaimCurrentVersion(claimId: EntityId): Promise<CurrentClaimVersion> {
    return this.db.transaction((tx) => getClaimCurrentVersionInTransaction(tx, claimId));
  }

  async reviseClaim(input: ReviseClaimInput): Promise<RevisedClaim> {
    return this.db.transaction(async (tx) => {
      const [edge] = await tx.select().from(claimEdges).where(eq(claimEdges.id, input.challengeEdgeId)).limit(1);

      if (!edge) {
        throw new BrainRepositoryNotFoundError("Challenge edge was not found.");
      }

      if ((edge.kind !== "challenges" && edge.kind !== "contradicts") || edge.toClaimId !== input.claimId) {
        throw new BrainRepositoryConflictError("Claim revision must target a challenge edge for the same claim.");
      }

      const current = await getClaimCurrentVersionInTransaction(tx, input.claimId);
      const [critiqueClaim] = await tx.select().from(claims).where(eq(claims.id, edge.fromClaimId)).limit(1);

      if (!critiqueClaim) {
        throw new BrainRepositoryConflictError("Challenge edge has no critique claim.");
      }

      const versionId = input.versionId ?? randomUUID();
      const moveId = input.moveId ?? randomUUID();
      const validFrom = new Date();
      const move = await createPersistedMove(tx, "claim_revised", {
        id: moveId,
        sessionId: current.claim.sessionId,
        scope: current.claim,
        summary: "User revised the target claim in response to the critique.",
        payload: {
          response: "revise",
          reasoning: input.reasoning ?? null,
          targetClaimId: current.claim.id,
          previousClaimVersionId: current.version.id,
          currentClaimVersionId: versionId,
          critiqueClaimId: critiqueClaim.id,
          challengeEdgeId: edge.id,
          claimVersionIds: [current.version.id, versionId],
          claimIds: [current.claim.id, critiqueClaim.id],
          edgeIds: [edge.id],
        },
      });

      const [newVersion] = await tx
        .insert(claimVersions)
        .values({
          id: versionId,
          claimId: current.claim.id,
          sourceId: current.version.sourceId ?? current.claim.sourceId,
          moveId: move.id,
          content: input.revisedText,
          status: "exploratory",
          confidence: current.version.confidence,
          isCurrent: false,
          validFrom,
        })
        .returning();

      if (!newVersion) {
        throw new BrainRepositoryConflictError("Failed to create revised ClaimVersion.");
      }

      await tx
        .update(claimVersions)
        .set({
          isCurrent: false,
          validUntil: validFrom,
          supersededByVersionId: versionId,
        })
        .where(and(eq(claimVersions.claimId, current.claim.id), eq(claimVersions.isCurrent, true)));

      const [markedCurrentVersion] = await tx
        .update(claimVersions)
        .set({
          isCurrent: true,
        })
        .where(eq(claimVersions.id, newVersion.id))
        .returning();

      if (!markedCurrentVersion) {
        throw new BrainRepositoryConflictError("Failed to mark revised ClaimVersion current.");
      }

      return {
        claim: current.claim,
        previousVersion: current.version,
        currentVersion: {
          ...newVersion,
          isCurrent: true,
        },
        move,
      };
    });
  }

  async upsertEmbeddingForObject(input: UpsertEmbeddingForObjectInput): Promise<BrainSearchResult> {
    const title = requiredText(input.title, "Embedding title is required.");
    const content = requiredText(input.content, "Embedding content is required.");
    const embedding = normalizeEmbedding(input.embedding);
    const embeddingModel = requiredText(input.embeddingModel, "Embedding model is required.");
    const now = new Date();
    const [row] = await this.db
      .insert(brainEmbeddings)
      .values({
        ...input.scope,
        sessionId: input.sessionId ?? null,
        objectType: input.objectType,
        objectId: input.objectId,
        title,
        content,
        contentHash: hashText(content),
        embeddingModel,
        embeddingJson: embedding,
        embeddingText: JSON.stringify(embedding),
        metadata: input.metadata ?? {},
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [brainEmbeddings.objectType, brainEmbeddings.objectId],
        set: {
          ...input.scope,
          sessionId: input.sessionId ?? null,
          title,
          content,
          contentHash: hashText(content),
          embeddingModel,
          embeddingJson: embedding,
          embeddingText: JSON.stringify(embedding),
          metadata: input.metadata ?? {},
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          updatedAt: now,
        },
      })
      .returning();

    if (!row) {
      throw new BrainRepositoryConflictError("Failed to upsert Brain embedding.");
    }

    return embeddingRowToSearchResult(row, 1, 0, "semantic");
  }

  async searchBrainSemantic(input: BrainSearchInput): Promise<ReadonlyArray<BrainSearchResult>> {
    return searchBrainSemantic(this.db, input);
  }

  async searchBrainHybrid(input: BrainSearchInput): Promise<ReadonlyArray<BrainSearchResult>> {
    return searchBrainHybrid(this.db, input);
  }

  async listCanvasNodesForSession(sessionId: EntityId, scope?: BrainScope): Promise<ReadonlyArray<CanvasNode>> {
    const state = await loadCanvasState(this.db, sessionId, scope);
    return buildCanvasNodes(state);
  }

  async listCanvasEdgesForSession(sessionId: EntityId, scope?: BrainScope): Promise<ReadonlyArray<CanvasEdge>> {
    const state = await loadCanvasState(this.db, sessionId, scope);
    return buildCanvasEdges(state);
  }
}

export function createBrainRepository(db: PennyDatabase): BrainRepository {
  return new DrizzleBrainRepository(db);
}

export async function recordLearnSessionOutput(
  db: PennyDatabase,
  output: LearnSessionOutput,
): Promise<PersistedLearnSessionRecent> {
  return db.transaction(async (tx) => {
    const session = await requireSession(tx, output.sessionId);
    const recentInput = learnRecentInputFromSessionOutput(output);
    const [recent] = await tx
      .insert(brainRecents)
      .values({
        ...scopeValues(session),
        sessionId: session.id,
        kind: recentInput.kind,
        title: recentInput.title,
        summary: recentInput.summary,
        body: recentInput.content,
        payload: recentInput.payload,
      })
      .returning();

    if (!recent) {
      throw new BrainRepositoryConflictError("Failed to record Learn session recent.");
    }

    return {
      recent,
      saveCandidate: learnSessionSaveCandidateFromRecent(recent),
    };
  });
}

export async function searchBrainSemantic(
  db: PennyDatabase,
  input: BrainSearchInput,
): Promise<ReadonlyArray<BrainSearchResult>> {
  const query = requiredText(input.query, "Brain search query is required.");
  const limit = normalizeLimit(input.limit);
  const now = input.now ?? new Date();
  const rows = await db
    .select()
    .from(brainEmbeddings)
    .where(scopeCondition(brainEmbeddings, input.scope))
    .orderBy(desc(brainEmbeddings.updatedAt))
    .limit(500);
  const activeRows = input.includeExpired ? rows : rows.filter((row) => !row.expiresAt || row.expiresAt > now);
  const queryEmbedding = normalizeEmbedding(input.embedding ?? mockedEmbeddingForText(query));

  return activeRows
    .map((row) => embeddingRowToSearchResult(row, cosineSimilarity(queryEmbedding, normalizeEmbedding(row.embeddingJson)), 0, "semantic"))
    .filter((result) => result.semanticScore > 0)
    .sort(searchResultSort)
    .slice(0, limit);
}

export async function searchBrainHybrid(
  db: PennyDatabase,
  input: BrainSearchInput,
): Promise<ReadonlyArray<BrainSearchResult>> {
  const query = requiredText(input.query, "Brain search query is required.");
  const limit = normalizeLimit(input.limit);
  const semanticResults = await searchBrainSemantic(db, { ...input, limit: 100 });
  const lexicalObjects = await listBrainSearchIndexObjects(db, input.scope, input.now ?? new Date());
  const merged = new Map<string, BrainSearchResult>();

  for (const result of semanticResults) {
    merged.set(searchResultKey(result), {
      ...result,
      source: "hybrid",
      score: result.semanticScore * 0.7,
    });
  }

  for (const object of lexicalObjects) {
    const lexicalScore = lexicalMatchScore(query, `${object.title} ${object.preview}`);
    if (lexicalScore <= 0) {
      continue;
    }

    const key = `${object.objectType}:${object.objectId}`;
    const existing = merged.get(key);

    if (existing) {
      merged.set(key, {
        ...existing,
        lexicalScore,
        source: "hybrid",
        score: existing.semanticScore * 0.7 + lexicalScore * 0.3,
      });
      continue;
    }

    merged.set(key, {
      ...object,
      lexicalScore,
      semanticScore: 0,
      source: "lexical",
      score: lexicalScore * 0.6,
    });
  }

  return [...merged.values()].sort(searchResultSort).slice(0, limit);
}

export async function listBrainSearchIndexObjects(
  db: PennyDatabase,
  scope: BrainScope,
  now = new Date(),
): Promise<ReadonlyArray<Omit<BrainSearchResult, "score" | "semanticScore" | "lexicalScore" | "source">>> {
  const [objectRows, noteRows, recentRows, artifactRows, claimRows] = await Promise.all([
    db.select().from(brainObjects).where(scopeCondition(brainObjects, scope)).orderBy(desc(brainObjects.updatedAt)).limit(200),
    db.select().from(sessionNotes).where(scopeCondition(sessionNotes, scope)).orderBy(desc(sessionNotes.updatedAt)).limit(200),
    db.select().from(brainRecents).where(scopeCondition(brainRecents, scope)).orderBy(desc(brainRecents.updatedAt)).limit(200),
    db.select().from(artifacts).where(scopeCondition(artifacts, scope)).orderBy(desc(artifacts.createdAt)).limit(200),
    db.select().from(claims).where(scopeCondition(claims, scope)).orderBy(desc(claims.createdAt)).limit(300),
  ]);
  const claimIds = claimRows.map((claim) => claim.id);
  const versionRows =
    claimIds.length > 0
      ? await db
          .select()
          .from(claimVersions)
          .where(and(inArray(claimVersions.claimId, claimIds), eq(claimVersions.isCurrent, true)))
          .orderBy(desc(claimVersions.createdAt))
      : [];
  const claimsById = new Map(claimRows.map((claim) => [claim.id, claim]));
  const recentCutoff = new Date(now.getTime() - recentSearchTtlMs);

  return [
    ...objectRows.map(searchObjectFromBrainObject),
    ...noteRows.map(searchObjectFromNote),
    ...recentRows.filter((row) => row.updatedAt >= recentCutoff).map(searchObjectFromRecent),
    ...artifactRows.map(searchObjectFromArtifact),
    ...versionRows.flatMap((row) => {
      const claim = claimsById.get(row.claimId);
      return claim ? [searchObjectFromClaimVersion(row, claim)] : [];
    }),
  ];
}

export class BrainRepositoryNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainRepositoryNotFoundError";
  }
}

export class BrainRepositoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainRepositoryConflictError";
  }
}

type CanvasState = {
  session: SessionRow;
  sources: SourceRow[];
  claims: ClaimRow[];
  claimVersions: ClaimVersionRow[];
  edges: EdgeRow[];
  notes: SessionNoteRow[];
  brainObjects: BrainObjectRow[];
  artifacts: ArtifactRow[];
};

async function loadCanvasState(db: PennyDatabase, sessionId: EntityId, scope?: BrainScope): Promise<CanvasState> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(sessionCondition(sessionId, scope))
    .limit(1);

  if (!session) {
    throw new BrainRepositoryNotFoundError("Session was not found.");
  }

  const [sourceRows, claimRows, edgeRows, noteRows, objectRows, artifactRows] = await Promise.all([
    db.select().from(sources).where(eq(sources.sessionId, session.id)).orderBy(asc(sources.createdAt)),
    db.select().from(claims).where(eq(claims.sessionId, session.id)).orderBy(asc(claims.createdAt)),
    db.select().from(claimEdges).where(eq(claimEdges.sessionId, session.id)).orderBy(asc(claimEdges.createdAt)),
    db.select().from(sessionNotes).where(eq(sessionNotes.sessionId, session.id)).orderBy(asc(sessionNotes.updatedAt)),
    db.select().from(brainObjects).where(eq(brainObjects.sessionId, session.id)).orderBy(asc(brainObjects.updatedAt)),
    db.select().from(artifacts).where(eq(artifacts.sessionId, session.id)).orderBy(asc(artifacts.createdAt)),
  ]);
  const claimIds = claimRows.map((claim) => claim.id);
  const versionRows =
    claimIds.length > 0
      ? await db
          .select()
          .from(claimVersions)
          .where(and(inArray(claimVersions.claimId, claimIds), eq(claimVersions.isCurrent, true)))
          .orderBy(asc(claimVersions.createdAt))
      : [];

  return {
    session,
    sources: sourceRows,
    claims: claimRows,
    claimVersions: versionRows,
    edges: edgeRows,
    notes: noteRows,
    brainObjects: objectRows,
    artifacts: artifactRows,
  };
}

function buildCanvasNodes(state: CanvasState): CanvasNode[] {
  const currentVersions = new Map(state.claimVersions.map((version) => [version.claimId, version]));
  const sourceCountByClaimId = new Map<string, number>();
  const nodes: CanvasNode[] = [];

  for (const source of state.sources) {
    nodes.push(canvasNodeWithPosition(nodes.length, {
      id: `source:${source.id}`,
      objectId: source.id,
      type: source.kind === "raw_idea" ? "idea" : "evidence",
      title: source.kind === "raw_idea" ? "Dropped idea" : formatCanvasTitle(source.kind),
      preview: clipText(source.rawText, 280),
      status: "recent",
      sourceCount: 1,
      metadata: {
        sessionId: source.sessionId,
        sourceKind: source.kind,
      },
    }));
  }

  for (const claim of state.claims) {
    const version = currentVersions.get(claim.id);
    if (!version) {
      continue;
    }

    if (claim.sourceId) {
      sourceCountByClaimId.set(claim.id, 1);
    }

    nodes.push(canvasNodeWithPosition(nodes.length, {
      id: `claim:${claim.id}`,
      claimId: claim.id,
      type: canvasNodeTypeForClaim(claim.kind),
      title: clipText(version.content, 96),
      preview: clipText(version.content, 280),
      status: canvasStatusForClaimVersion(version),
      confidence: version.confidence,
      sourceCount: sourceCountByClaimId.get(claim.id) ?? 0,
      metadata: {
        sessionId: claim.sessionId,
        claimVersionId: version.id,
        claimKind: claim.kind,
        claimStatus: version.status,
      },
    }));
  }

  for (const note of state.notes) {
    if (!note.content.trim()) {
      continue;
    }

    nodes.push(canvasNodeWithPosition(nodes.length, {
      id: `note:${note.id}`,
      objectId: note.id,
      type: "note",
      title: "Working notes",
      preview: clipText(note.content, 280),
      status: "saved",
      metadata: {
        sessionId: note.sessionId,
      },
    }));
  }

  for (const object of state.brainObjects) {
    nodes.push(canvasNodeWithPosition(nodes.length, {
      id: `brain_object:${object.id}`,
      objectId: object.id,
      type: canvasNodeTypeForBrainObject(object.objectType),
      title: object.title,
      preview: clipText(object.summary ?? object.body, 280),
      status: "saved",
      metadata: {
        sessionId: object.sessionId,
        objectType: object.objectType,
        sourceRecentId: object.sourceRecentId,
      },
    }));
  }

  for (const artifact of state.artifacts) {
    nodes.push(canvasNodeWithPosition(nodes.length, {
      id: `artifact:${artifact.id}`,
      objectId: artifact.id,
      type: "artifact",
      title: artifact.title,
      preview: clipText(artifact.summary, 280),
      status: "saved",
      metadata: {
        sessionId: artifact.sessionId,
        artifactKind: artifact.kind,
      },
    }));
  }

  return nodes;
}

function buildCanvasEdges(state: CanvasState): CanvasEdge[] {
  const edges: CanvasEdge[] = state.edges.map((edge) => ({
    id: `claim_edge:${edge.id}`,
    sourceId: `claim:${edge.fromClaimId}`,
    targetId: `claim:${edge.toClaimId}`,
    type: edge.kind,
    weight: edge.status === "active" ? 1 : 0.5,
    provenance: "claim_edge",
  }));

  for (const object of state.brainObjects) {
    const refs = asRecord(object.payload).refs;
    const claimIds = typeof refs === "object" && refs ? stringArrayValues(asRecord(refs), ["claimIds", "currentClaimId"]) : [];

    for (const claimId of claimIds) {
      edges.push({
        id: `brain_object:${object.id}:claim:${claimId}`,
        sourceId: `brain_object:${object.id}`,
        targetId: `claim:${claimId}`,
        type: "related_to",
        weight: 0.4,
        provenance: "brain_object",
      });
    }
  }

  return edges;
}

function canvasNodeWithPosition(index: number, node: CanvasNode): CanvasNode {
  const column = index % 4;
  const row = Math.floor(index / 4);

  return {
    ...node,
    x: column * 260,
    y: row * 180,
  };
}

async function loadGraphSnapshotInTransaction(tx: BrainTransaction, sessionId: EntityId): Promise<ThinkingGraphSnapshot> {
  const session = await requireSession(tx, sessionId);
  const claimRows = await tx.select().from(claims).where(eq(claims.sessionId, session.id)).orderBy(asc(claims.createdAt));
  const claimIds = claimRows.map((claim) => claim.id);
  const versionRows =
    claimIds.length > 0
      ? await tx.select().from(claimVersions).where(eqAnyClaimId(claimIds)).orderBy(asc(claimVersions.createdAt))
      : [];
  const edgeRows = await tx
    .select()
    .from(claimEdges)
    .where(eq(claimEdges.sessionId, session.id))
    .orderBy(asc(claimEdges.createdAt));
  const moveRows = await tx.select().from(moves).where(eq(moves.sessionId, session.id)).orderBy(asc(moves.createdAt));
  const artifactRows = await tx
    .select()
    .from(artifacts)
    .where(eq(artifacts.sessionId, session.id))
    .orderBy(asc(artifacts.createdAt));
  const [focusStateRow] = await tx.select().from(focusStates).where(eq(focusStates.sessionId, session.id)).limit(1);

  return {
    session: {
      id: session.id,
      status: session.status,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
    },
    focusState: focusStateRow ? toFocusState(focusStateRow) : defaultFocusState(session),
    claims: toThinkingClaims(claimRows, versionRows),
    edges: edgeRows.map(toThinkingEdge),
    moves: moveRows.map(toThinkingMove),
    artifacts: artifactRows.map(toChallengeBriefArtifact),
  };
}

async function requireSession(tx: BrainTransaction, sessionId: EntityId): Promise<SessionRow> {
  const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

  if (!session) {
    throw new BrainRepositoryNotFoundError("Session was not found.");
  }

  return session;
}

async function getClaimCurrentVersionInTransaction(tx: BrainTransaction, claimId: EntityId): Promise<CurrentClaimVersion> {
  const [claim] = await tx.select().from(claims).where(eq(claims.id, claimId)).limit(1);

  if (!claim) {
    throw new BrainRepositoryNotFoundError("Claim was not found.");
  }

  const [version] = await tx
    .select()
    .from(claimVersions)
    .where(and(eq(claimVersions.claimId, claim.id), eq(claimVersions.isCurrent, true)))
    .orderBy(desc(claimVersions.createdAt))
    .limit(1);

  if (!version) {
    throw new BrainRepositoryConflictError("Claim has no current ClaimVersion.");
  }

  return {
    claim,
    version,
    snapshot: toClaimVersionSnapshot(version),
  };
}

function eqAnyClaimId(claimIds: ReadonlyArray<EntityId>) {
  return claimIds.length === 1 ? eq(claimVersions.claimId, claimIds[0] ?? "") : inArray(claimVersions.claimId, [...claimIds]);
}

function toThinkingClaims(claimRows: ReadonlyArray<ClaimRow>, versionRows: ReadonlyArray<ClaimVersionRow>): ThinkingClaim[] {
  const versionsByClaimId = new Map<EntityId, ClaimVersionSnapshot[]>();

  for (const version of versionRows) {
    const versions = versionsByClaimId.get(version.claimId) ?? [];
    versions.push(toClaimVersionSnapshot(version));
    versionsByClaimId.set(version.claimId, versions);
  }

  return claimRows.flatMap((claim) => {
    const versions = versionsByClaimId.get(claim.id) ?? [];
    const currentVersion = versions.find((version) => version.isCurrent);

    if (!currentVersion) {
      return [];
    }

    return [
      {
        id: claim.id,
        sessionId: claim.sessionId,
        kind: claim.kind,
        currentVersionId: currentVersion.id,
        text: currentVersion.text,
        confidence: currentVersion.confidence,
        status: currentVersion.status,
        createdAt: claim.createdAt.toISOString(),
        versions,
      },
    ];
  });
}

function toClaimVersionSnapshot(version: ClaimVersionRow): ClaimVersionSnapshot {
  return {
    id: version.id,
    claimId: version.claimId,
    text: version.content,
    confidence: version.confidence,
    status: version.status,
    isCurrent: version.isCurrent,
    validFrom: version.validFrom.toISOString(),
    validUntil: version.validUntil?.toISOString() ?? null,
    supersededByVersionId: version.supersededByVersionId,
  };
}

function toThinkingEdge(edge: EdgeRow): ThinkingEdge {
  return {
    id: edge.id,
    sessionId: edge.sessionId,
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    kind: edge.kind,
    status: edge.status,
    label: edge.label,
    createdAt: edge.createdAt.toISOString(),
  };
}

function toThinkingMove(move: MoveRow): ThinkingMove {
  return {
    id: move.id,
    sessionId: move.sessionId,
    kind: move.kind as ThinkingMove["kind"],
    summary: move.summary,
    payload: asRecord(move.payload),
    createdAt: move.createdAt.toISOString(),
  };
}

function toFocusState(row: FocusStateRow): FocusState {
  return {
    sessionId: row.sessionId,
    mode: row.mode,
    focusedClaimId: row.focusedClaimId,
    focusedEdgeId: row.focusedEdgeId,
    source: row.source,
    suggestionMoveId: row.suggestionMoveId,
    manualMoveId: row.manualMoveId,
    paused: row.paused,
    reason: row.reason,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function defaultFocusState(session: SessionRow): FocusState {
  return {
    sessionId: session.id,
    mode: "brain",
    focusedClaimId: null,
    focusedEdgeId: null,
    source: "none",
    suggestionMoveId: null,
    manualMoveId: null,
    paused: false,
    reason: null,
    updatedAt: null,
  };
}

function toPersistedNextMoveCandidate(row: CandidateRow): PersistedNextMoveCandidate {
  return {
    ...row,
    action: row.action,
    mode: row.mode,
    reasonCodes: Array.isArray(row.reasonCodes) ? row.reasonCodes : [],
    exitCriteria: row.exitCriteria as NextMoveExitCriteria,
    scoreBreakdown: row.scoreBreakdown as NextMoveScoreBreakdown,
    provenance: row.provenance as NextMoveProvenance,
  };
}

function toChallengeBriefArtifact(row: ArtifactRow): ChallengeBriefArtifact {
  const payload = asRecord(row.payload);
  const ideaMap = asRecord(payload.ideaMap);
  const challengeBrief = asRecord(payload.challengeBrief);

  return {
    id: row.id,
    sessionId: row.sessionId,
    kind: "challenge_brief",
    title: row.title,
    claimIds: objectArrayIds(ideaMap.claims),
    claimVersionIds: objectArrayIds(ideaMap.claimVersions),
    edgeIds: objectArrayIds(ideaMap.edges),
    moveIds: objectArrayIds(challengeBrief.whatChanged),
    createdAt: row.createdAt.toISOString(),
    sections: {
      seedSummary: row.summary,
      claimMapSummary: `${objectArrayIds(ideaMap.claims).length} claims and ${objectArrayIds(ideaMap.edges).length} edges.`,
      loadBearingAssumptions: textArray(challengeBrief.unresolvedRisks),
      challengeOutcome: textArray(challengeBrief.whatChanged).join(" ") || row.summary,
      unresolvedRisks: textArray(challengeBrief.unresolvedRisks),
      recommendedNextMove: typeof challengeBrief.recommendedNextMove === "string" ? challengeBrief.recommendedNextMove : null,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function objectArrayIds(value: unknown): EntityId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);

    return typeof record.id === "string" ? [record.id] : [];
  });
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string") {
      return [item];
    }

    const record = asRecord(item);
    const text = record.summary ?? record.title ?? record.reason ?? record.text;

    return typeof text === "string" ? [text] : [];
  });
}

function searchObjectFromBrainObject(
  row: BrainObjectRow,
): Omit<BrainSearchResult, "score" | "semanticScore" | "lexicalScore" | "source"> {
  return {
    objectType: "brain_object",
    objectId: row.id,
    sessionId: row.sessionId,
    title: row.title,
    preview: clipText(row.summary ?? row.body, 360),
    metadata: {
      objectType: row.objectType,
      sourceRecentId: row.sourceRecentId,
    },
    updatedAt: row.updatedAt.toISOString(),
  };
}

function searchObjectFromNote(
  row: SessionNoteRow,
): Omit<BrainSearchResult, "score" | "semanticScore" | "lexicalScore" | "source"> {
  return {
    objectType: "session_note",
    objectId: row.id,
    sessionId: row.sessionId,
    title: "Working notes",
    preview: clipText(row.content, 360),
    metadata: {},
    updatedAt: row.updatedAt.toISOString(),
  };
}

function searchObjectFromRecent(
  row: BrainRecentRow,
): Omit<BrainSearchResult, "score" | "semanticScore" | "lexicalScore" | "source"> {
  return {
    objectType: "brain_recent",
    objectId: row.id,
    sessionId: row.sessionId,
    title: row.title,
    preview: clipText(row.summary ?? row.body, 360),
    metadata: {
      kind: row.kind,
      expiresAfterMs: recentSearchTtlMs,
    },
    updatedAt: row.updatedAt.toISOString(),
  };
}

function searchObjectFromArtifact(
  row: ArtifactRow,
): Omit<BrainSearchResult, "score" | "semanticScore" | "lexicalScore" | "source"> {
  return {
    objectType: "artifact",
    objectId: row.id,
    sessionId: row.sessionId,
    title: row.title,
    preview: clipText(row.summary, 360),
    metadata: {
      artifactKind: row.kind,
    },
    updatedAt: row.createdAt.toISOString(),
  };
}

function searchObjectFromClaimVersion(
  version: ClaimVersionRow,
  claim: ClaimRow,
): Omit<BrainSearchResult, "score" | "semanticScore" | "lexicalScore" | "source"> {
  return {
    objectType: "claim_version",
    objectId: version.id,
    sessionId: claim.sessionId,
    title: formatCanvasTitle(claim.kind),
    preview: clipText(version.content, 360),
    metadata: {
      claimId: claim.id,
      claimKind: claim.kind,
      claimStatus: version.status,
      confidence: version.confidence,
    },
    updatedAt: version.createdAt.toISOString(),
  };
}

function embeddingRowToSearchResult(
  row: BrainEmbeddingRow,
  semanticScore: number,
  lexicalScore: number,
  source: BrainSearchResult["source"],
): BrainSearchResult {
  return {
    objectType: row.objectType,
    objectId: row.objectId,
    sessionId: row.sessionId,
    title: row.title,
    preview: clipText(row.content, 360),
    score: semanticScore * 0.7 + lexicalScore * 0.3,
    semanticScore,
    lexicalScore,
    source,
    metadata: asRecord(row.metadata),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function searchResultKey(result: Pick<BrainSearchResult, "objectType" | "objectId">): string {
  return `${result.objectType}:${result.objectId}`;
}

function searchResultSort(left: BrainSearchResult, right: BrainSearchResult): number {
  return right.score - left.score || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function lexicalMatchScore(query: string, text: string): number {
  const queryTerms = termSet(query);
  if (queryTerms.size === 0) {
    return 0;
  }

  const textTerms = termSet(text);
  let matches = 0;

  for (const term of queryTerms) {
    if (textTerms.has(term)) {
      matches += 1;
    }
  }

  return matches / queryTerms.size;
}

function termSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((term) => term.trim())
      .filter((term) => term.length > 1),
  );
}

function mockedEmbeddingForText(value: string, dimensions = 16): number[] {
  const digest = createHash("sha256").update(value).digest();
  const values: number[] = [];

  for (let index = 0; index < dimensions; index += 1) {
    values.push((digest[index % digest.length] ?? 0) / 255);
  }

  return normalizeEmbedding(values);
}

function normalizeEmbedding(embedding: ReadonlyArray<number>): number[] {
  return embedding.map((value) => (Number.isFinite(value) ? Number(value) : 0));
}

function cosineSimilarity(left: ReadonlyArray<number>, right: ReadonlyArray<number>): number {
  const dimensions = Math.min(left.length, right.length);
  if (dimensions === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < dimensions; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return Math.max(0, dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)));
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requiredText(value: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BrainRepositoryConflictError(message);
  }

  return trimmed;
}

function normalizeLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 10;
  }

  return Math.max(1, Math.min(50, Math.floor(value)));
}

function scopeCondition(table: ScopeTable, scope: BrainScope) {
  return and(
    scopeColumnCondition(table.userId, scope.userId),
    scopeColumnCondition(table.workspaceId, scope.workspaceId),
    scopeColumnCondition(table.projectId, scope.projectId),
    scopeColumnCondition(table.sphereId, scope.sphereId),
  );
}

function sessionCondition(sessionId: EntityId, scope: BrainScope | undefined) {
  return scope ? and(eq(sessions.id, sessionId), scopeCondition(sessions, scope)) : eq(sessions.id, sessionId);
}

function scopeColumnCondition(column: ScopeColumn, value: string | null) {
  return value === null ? isNull(column) : eq(column, value);
}

function canvasNodeTypeForClaim(kind: ClaimRow["kind"]): CanvasNode["type"] {
  switch (kind) {
    case "assumption":
      return "assumption";
    case "question":
      return "question";
    case "concept":
      return "concept";
    case "belief":
      return "claim";
  }
}

function canvasNodeTypeForBrainObject(objectType: string): CanvasNode["type"] {
  if (objectType.includes("creative")) {
    return "creative_direction";
  }

  if (objectType.includes("learn") || objectType.includes("concept")) {
    return "concept";
  }

  if (objectType.includes("evidence") || objectType.includes("verify")) {
    return "evidence";
  }

  return "idea";
}

function canvasStatusForClaimVersion(version: ClaimVersionRow): NonNullable<CanvasNode["status"]> {
  switch (version.status) {
    case "committed":
    case "resolved":
      return "saved";
    case "rejected":
      return "archived";
    case "exploratory":
      return "recent";
  }
}

function formatCanvasTitle(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stringArrayValues(record: Record<string, unknown>, keys: ReadonlyArray<string>): string[] {
  const values: string[] = [];

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      values.push(value);
    } else if (Array.isArray(value)) {
      values.push(...value.filter(isString));
    }
  }

  return uniqueStrings(values);
}

function clipText(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}...` : trimmed;
}

function uniqueStrings(values: ReadonlyArray<string | null | undefined>): string[] {
  return [...new Set(values.filter(isString))];
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
