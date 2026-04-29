import { asc, desc, eq, inArray } from "drizzle-orm";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { artifacts, claimEdges, claims, claimVersions, moves, sessions } from "./db/schema.ts";
import { scopeValues, type BrainScope, type OptionalBrainScope } from "./scope.ts";

type SessionRow = OptionalBrainScope<typeof sessions.$inferSelect>;
type ClaimRow = OptionalBrainScope<typeof claims.$inferSelect>;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = OptionalBrainScope<typeof claimEdges.$inferSelect>;
type MoveRow = OptionalBrainScope<typeof moves.$inferSelect>;
type ArtifactRow = OptionalBrainScope<typeof artifacts.$inferSelect>;

export type StreamState = {
  activeSessions: SessionRow[];
  claims: ClaimRow[];
  claimVersions: ClaimVersionRow[];
  edges: EdgeRow[];
  moves: MoveRow[];
  artifacts: ArtifactRow[];
  recentMoves: MoveRow[];
};

type StreamClaim = {
  id: string;
  scope: BrainScope;
  sessionId: string;
  kind: ClaimRow["kind"];
  status: ClaimVersionRow["status"];
  text: string;
  confidence: number;
  versionId: string | null;
  validFrom: string | null;
  validUntil: string | null;
  supersededByVersionId: string | null;
};

type StreamSession = {
  id: string;
  scope: BrainScope;
  title: string | null;
  status: SessionRow["status"];
  createdAt: string;
  claimCount: number;
  edgeCount: number;
  moveCount: number;
  artifactCount: number;
  openChallengeCount: number;
  unresolvedRiskCount: number;
  recentMoveAt: string | null;
};

type StreamOpenChallenge = {
  sessionId: string;
  edgeId: string;
  targetClaim: StreamClaim | null;
  critiqueClaim: StreamClaim | null;
  failureType: string | null;
  status: EdgeRow["status"];
  createdAt: string;
};

type StreamRisk = {
  sessionId: string;
  kind: "open_challenge" | "acknowledged_vulnerability" | "unreviewed_assumption" | "artifact_risk";
  claimId: string | null;
  edgeId: string | null;
  text: string;
  reason: string;
  status: string;
};

type StreamMove = {
  id: string;
  scope: BrainScope;
  sessionId: string;
  kind: MoveRow["kind"];
  summary: string;
  claimIds: string[];
  edgeIds: string[];
  artifactIds: string[];
  createdAt: string;
};

type StreamAttentionClaim = {
  sessionId: string;
  claim: StreamClaim;
  reason: string;
  edgeIds: string[];
  lastMoveAt: string | null;
};

type StreamSuggestedMove = {
  sessionId: string | null;
  kind: "start_session" | "respond_to_challenge" | "review_assumption" | "revisit_vulnerability";
  label: string;
  description: string;
  targetClaimId?: string | null;
  edgeId?: string | null;
};

export type BrainStream = {
  activeSessions: StreamSession[];
  openChallenges: StreamOpenChallenge[];
  unresolvedRisks: StreamRisk[];
  recentMoves: StreamMove[];
  claimsNeedingAttention: StreamAttentionClaim[];
  suggestedNextMoves: StreamSuggestedMove[];
};

export type StreamRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  loadStream?: (options: { db?: PennyDatabase }) => Promise<BrainStream>;
};

export async function handleBrainStreamRequest(
  request: Request,
  options: StreamRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /brain/stream requires the GET method.");
  }

  const db = resolveStreamDb(options, Boolean(options.loadStream));
  const loadStream = options.loadStream ?? ((loadOptions: { db?: PennyDatabase }) => loadBrainStream(requireStreamDb(loadOptions.db)));

  try {
    return jsonResponse({ data: await loadStream(dbOption(db)) }, 200);
  } catch (error) {
    return jsonResponse(
      {
        error: {
          code: "stream_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      },
      500,
    );
  }
}

export async function loadBrainStream(db: PennyDatabase): Promise<BrainStream> {
  const activeSessionRows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.status, "open"))
    .orderBy(desc(sessions.createdAt));
  const activeSessionIds = activeSessionRows.map((session) => session.id);
  const claimRows =
    activeSessionIds.length > 0
      ? await db.select().from(claims).where(inArray(claims.sessionId, activeSessionIds)).orderBy(asc(claims.createdAt))
      : [];
  const claimIds = claimRows.map((claim) => claim.id);
  const versionRows =
    claimIds.length > 0
      ? await db
          .select()
          .from(claimVersions)
          .where(inArray(claimVersions.claimId, claimIds))
          .orderBy(asc(claimVersions.createdAt))
      : [];
  const edgeRows =
    activeSessionIds.length > 0
      ? await db
          .select()
          .from(claimEdges)
          .where(inArray(claimEdges.sessionId, activeSessionIds))
          .orderBy(asc(claimEdges.createdAt))
      : [];
  const moveRows =
    activeSessionIds.length > 0
      ? await db.select().from(moves).where(inArray(moves.sessionId, activeSessionIds)).orderBy(asc(moves.createdAt))
      : [];
  const artifactRows =
    activeSessionIds.length > 0
      ? await db
          .select()
          .from(artifacts)
          .where(inArray(artifacts.sessionId, activeSessionIds))
          .orderBy(asc(artifacts.createdAt))
      : [];
  const recentMoveRows = await db.select().from(moves).orderBy(desc(moves.createdAt)).limit(12);

  return buildBrainStream({
    activeSessions: activeSessionRows,
    claims: claimRows,
    claimVersions: versionRows,
    edges: edgeRows,
    moves: moveRows,
    artifacts: artifactRows,
    recentMoves: recentMoveRows,
  });
}

export function buildBrainStream(state: StreamState): BrainStream {
  const currentVersions = currentVersionsByClaimId(state.claimVersions);
  const claimSlices = state.claims.flatMap((claim) => {
    const currentVersion = currentVersions.get(claim.id);

    return currentVersion ? [claimSlice(claim, currentVersion)] : [];
  });
  const claimsById = new Map(claimSlices.map((claim) => [claim.id, claim]));
  const movesBySessionId = groupBy(state.moves, (move) => move.sessionId);
  const claimsBySessionId = groupBy(claimSlices, (claim) => claim.sessionId);
  const edgesBySessionId = groupBy(state.edges, (edge) => edge.sessionId);
  const artifactsBySessionId = groupBy(state.artifacts, (artifact) => artifact.sessionId);
  const openChallenges = state.edges
    .filter((edge) => isChallengeEdge(edge) && edge.status === "active" && !challengeResponseMove(state.moves, edge.id))
    .map((edge) => ({
      sessionId: edge.sessionId,
      edgeId: edge.id,
      targetClaim: claimsById.get(edge.toClaimId) ?? null,
      critiqueClaim: claimsById.get(edge.fromClaimId) ?? null,
      failureType: edge.label,
      status: edge.status,
      createdAt: edge.createdAt.toISOString(),
    }));
  const unresolvedRisks = [
    ...openChallenges.map((challenge) => ({
      sessionId: challenge.sessionId,
      kind: "open_challenge" as const,
      claimId: challenge.targetClaim?.id ?? null,
      edgeId: challenge.edgeId,
      text: challenge.critiqueClaim?.text ?? "Open challenge has no critique claim text.",
      reason: "Challenge is still waiting for Defend, Revise, or Absorb.",
      status: "active",
    })),
    ...state.edges
      .filter((edge) => isChallengeEdge(edge) && edge.status === "acknowledged_vulnerability")
      .map((edge) => ({
        sessionId: edge.sessionId,
        kind: "acknowledged_vulnerability" as const,
        claimId: edge.toClaimId,
        edgeId: edge.id,
        text: claimsById.get(edge.fromClaimId)?.text ?? "Acknowledged challenge remains unresolved.",
        reason: "Absorbed critique remains a vulnerability in the map.",
        status: edge.status,
      })),
    ...claimSlices
      .filter((claim) => claim.kind === "assumption" && claim.status === "exploratory")
      .slice(0, 8)
      .map((claim) => ({
        sessionId: claim.sessionId,
        kind: "unreviewed_assumption" as const,
        claimId: claim.id,
        edgeId: firstEdgeForClaim(state.edges, claim.id)?.id ?? null,
        text: claim.text,
        reason: "Assumption has not been confirmed, rejected, or resolved.",
        status: claim.status,
      })),
    ...artifactRisks(state.artifacts),
  ];
  const claimsNeedingAttention = claimSlices
    .filter((claim) => {
      const hasOpenChallenge = openChallenges.some((challenge) => challenge.targetClaim?.id === claim.id);

      return hasOpenChallenge || claim.status === "exploratory" || claim.confidence <= 50;
    })
    .map((claim) => ({
      sessionId: claim.sessionId,
      claim,
      reason: attentionReason(claim, openChallenges),
      edgeIds: state.edges
        .filter((edge) => edge.fromClaimId === claim.id || edge.toClaimId === claim.id)
        .map((edge) => edge.id),
      lastMoveAt: latestMoveForClaim(state.moves, claim.id)?.createdAt.toISOString() ?? null,
    }))
    .slice(0, 12);
  const activeSessions = state.activeSessions.map((session) => {
    const sessionMoves = movesBySessionId.get(session.id) ?? [];
    const sessionClaims = claimsBySessionId.get(session.id) ?? [];
    const sessionEdges = edgesBySessionId.get(session.id) ?? [];
    const sessionArtifacts = artifactsBySessionId.get(session.id) ?? [];
    const sessionOpenChallenges = openChallenges.filter((challenge) => challenge.sessionId === session.id);
    const sessionRisks = unresolvedRisks.filter((risk) => risk.sessionId === session.id);

    return {
      id: session.id,
      scope: scopeValues(session),
      title: session.title,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      claimCount: sessionClaims.length,
      edgeCount: sessionEdges.length,
      moveCount: sessionMoves.length,
      artifactCount: sessionArtifacts.length,
      openChallengeCount: sessionOpenChallenges.length,
      unresolvedRiskCount: sessionRisks.length,
      recentMoveAt: latestDate(sessionMoves.map((move) => move.createdAt))?.toISOString() ?? null,
    };
  });

  return {
    activeSessions,
    openChallenges,
    unresolvedRisks: unresolvedRisks.slice(0, 16),
    recentMoves: state.recentMoves.map(moveSlice),
    claimsNeedingAttention,
    suggestedNextMoves: suggestedNextMoves(activeSessions, openChallenges, claimsNeedingAttention, unresolvedRisks),
  };
}

function claimSlice(claim: ClaimRow, version: ClaimVersionRow): StreamClaim {
  return {
    id: claim.id,
    scope: scopeValues(claim),
    sessionId: claim.sessionId,
    kind: claim.kind,
    status: version.status,
    text: version.content,
    confidence: version.confidence,
    versionId: version.id,
    validFrom: version.validFrom.toISOString(),
    validUntil: version.validUntil?.toISOString() ?? null,
    supersededByVersionId: version.supersededByVersionId,
  };
}

function moveSlice(move: MoveRow) {
  return {
    id: move.id,
    scope: scopeValues(move),
    sessionId: move.sessionId,
    kind: move.kind,
    summary: move.summary,
    claimIds: stringArrayPayloadValue(move.payload, "claimIds"),
    edgeIds: stringArrayPayloadValue(move.payload, "edgeIds"),
    artifactIds: stringArrayPayloadValue(move.payload, "artifactIds"),
    createdAt: move.createdAt.toISOString(),
  };
}

function suggestedNextMoves(
  activeSessions: StreamSession[],
  openChallenges: StreamOpenChallenge[],
  attentionClaims: StreamAttentionClaim[],
  risks: StreamRisk[],
): StreamSuggestedMove[] {
  if (activeSessions.length === 0) {
    return [
      {
        sessionId: null,
        kind: "start_session",
        label: "Start with one raw idea",
        description: "Create the next Brain session so Penny has claims, moves, and edges to work from.",
      },
    ];
  }

  const challengeMoves = openChallenges.slice(0, 3).map((challenge) => ({
    sessionId: challenge.sessionId,
    kind: "respond_to_challenge" as const,
    label: "Answer open challenge",
    description: challenge.targetClaim
      ? `Defend, Revise, or Absorb "${clipText(challenge.targetClaim.text, 120)}".`
      : "Defend, Revise, or Absorb the open challenge.",
    targetClaimId: challenge.targetClaim?.id ?? null,
    edgeId: challenge.edgeId,
  }));
  const assumptionMoves = attentionClaims
    .filter((entry) => entry.claim.kind === "assumption" && entry.claim.status === "exploratory")
    .slice(0, 3)
    .map((entry) => ({
      sessionId: entry.sessionId,
      kind: "review_assumption" as const,
      label: "Review assumption",
      description: `Confirm, reject, or refine "${clipText(entry.claim.text, 120)}".`,
      targetClaimId: entry.claim.id,
      edgeId: entry.edgeIds[0] ?? null,
    }));
  const riskMoves = risks
    .filter((risk) => risk.kind === "acknowledged_vulnerability")
    .slice(0, 2)
    .map((risk) => ({
      sessionId: risk.sessionId,
      kind: "revisit_vulnerability" as const,
      label: "Revisit absorbed risk",
      description: `Decide whether the acknowledged vulnerability still changes the idea: "${clipText(risk.text, 120)}".`,
      targetClaimId: risk.claimId,
      edgeId: risk.edgeId,
    }));

  return [...challengeMoves, ...assumptionMoves, ...riskMoves].slice(0, 8);
}

function attentionReason(claim: StreamClaim, openChallenges: StreamOpenChallenge[]): string {
  if (openChallenges.some((challenge) => challenge.targetClaim?.id === claim.id)) {
    return "Open challenge targets this claim.";
  }

  if (claim.kind === "assumption" && claim.status === "exploratory") {
    return "Assumption still needs confirm, reject, or refine.";
  }

  if (claim.confidence <= 50) {
    return "Confidence is low enough to deserve attention.";
  }

  return "Claim is still exploratory.";
}

function artifactRisks(artifactRows: ArtifactRow[]) {
  return artifactRows.flatMap((artifact) => {
    const risks = objectRecord(objectRecord(artifact.payload).challengeBrief).unresolvedRisks;

    if (!Array.isArray(risks)) {
      return [];
    }

    return risks.slice(0, 4).map((risk) => {
      const record = objectRecord(risk);

      return {
        sessionId: artifact.sessionId,
        kind: "artifact_risk" as const,
        claimId: stringValue(record.claimId) ?? null,
        edgeId: stringValue(record.edgeId) ?? null,
        text: stringValue(record.text) ?? artifact.summary,
        reason: stringValue(record.reason) ?? "Compiled artifact marked this as unresolved.",
        status: stringValue(record.status) ?? "artifact",
      };
    });
  });
}

function currentVersionsByClaimId(versions: ClaimVersionRow[]): Map<string, ClaimVersionRow> {
  const currentVersions = new Map<string, ClaimVersionRow>();

  for (const version of [...versions].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())) {
    if (version.isCurrent && !currentVersions.has(version.claimId)) {
      currentVersions.set(version.claimId, version);
    }
  }

  return currentVersions;
}

function challengeResponseMove(moveRows: MoveRow[], edgeId: string): MoveRow | undefined {
  return moveRows.find((move) => {
    if (!["user_defended", "claim_revised", "critique_absorbed"].includes(move.kind)) {
      return false;
    }

    return stringArrayPayloadValue(move.payload, "edgeIds").includes(edgeId) || stringPayloadValue(move.payload, "challengeEdgeId") === edgeId;
  });
}

function latestMoveForClaim(moveRows: MoveRow[], claimId: string): MoveRow | undefined {
  return [...moveRows]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .find((move) => stringArrayPayloadValue(move.payload, "claimIds").includes(claimId));
}

function firstEdgeForClaim(edgeRows: EdgeRow[], claimId: string): EdgeRow | undefined {
  return edgeRows.find((edge) => edge.fromClaimId === claimId || edge.toClaimId === claimId);
}

function isChallengeEdge(edge: EdgeRow): boolean {
  return edge.kind === "challenges" || edge.kind === "contradicts";
}

function groupBy<Row, Key>(rows: Row[], keyFor: (row: Row) => Key): Map<Key, Row[]> {
  const grouped = new Map<Key, Row[]>();

  for (const row of rows) {
    const key = keyFor(row);
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  return grouped;
}

function latestDate(dates: Date[]): Date | null {
  return [...dates].sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

function stringArrayPayloadValue(payload: unknown, key: string): string[] {
  const value = objectRecord(payload)[key];

  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringPayloadValue(payload: unknown, key: string): string | null {
  return stringValue(objectRecord(payload)[key]);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clipText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value;
}

function resolveStreamDb(options: StreamRouteOptions, hasInjectedLoadStream: boolean): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedLoadStream) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireStreamDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for GET /brain/stream.");
  }

  return db;
}

function dbOption(db: PennyDatabase | undefined): { db?: PennyDatabase } {
  return db ? { db } : {};
}

function methodNotAllowed(message: string): Response {
  return jsonResponse(
    {
      error: {
        code: "method_not_allowed",
        message,
      },
    },
    405,
    { Allow: "GET" },
  );
}

function jsonResponse(payload: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}
