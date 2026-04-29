import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { PennyDatabase } from "../db/client.ts";
import {
  artifacts,
  challengeRounds,
  claimEdges,
  claims,
  claimVersions,
  focusStates,
  moves,
  nextMoveCandidates,
  sessions,
} from "../db/schema.ts";
import {
  createMove as createPersistedMove,
  type CreatedMove,
  type CreateMoveInput,
  type MoveKind,
} from "../move-payloads.ts";
import { scopeValues } from "../scope.ts";
import type {
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
}

export function createBrainRepository(db: PennyDatabase): BrainRepository {
  return new DrizzleBrainRepository(db);
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
