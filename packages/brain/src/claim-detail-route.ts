import { and, asc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { claimEdges, claims, claimVersions, moves, sources, sourceSpans } from "./db/schema.ts";

const ClaimDetailPathSchema = z.string().uuid();

type ClaimRow = typeof claims.$inferSelect;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = typeof claimEdges.$inferSelect;
type MoveRow = typeof moves.$inferSelect;
type SourceRow = typeof sources.$inferSelect;
type SourceSpanRow = typeof sourceSpans.$inferSelect;

export type ClaimDetailState = {
  claim: ClaimRow;
  versions: ClaimVersionRow[];
  edges: EdgeRow[];
  connectedClaims: ClaimRow[];
  connectedVersions: ClaimVersionRow[];
  moves: MoveRow[];
  sources: SourceRow[];
  sourceSpans: SourceSpanRow[];
};

export type ClaimDetailPayload = ReturnType<typeof buildClaimDetailFromState>;

export type ClaimDetailRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  loadClaimDetail?: (claimId: string, options: { db?: PennyDatabase }) => Promise<ClaimDetailPayload>;
};

export async function handleClaimDetailRequest(
  request: Request,
  claimId: string,
  options: ClaimDetailRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /brain/claims/:claimId/detail requires the GET method.");
  }

  const parsedClaimId = ClaimDetailPathSchema.safeParse(claimId);

  if (!parsedClaimId.success) {
    return jsonResponse(
      {
        error: {
          code: "invalid_claim_id",
          message: "Claim detail requires a valid claim id.",
        },
      },
      400,
    );
  }

  const db = resolveClaimDetailDb(options, Boolean(options.loadClaimDetail));
  const loadDetail =
    options.loadClaimDetail ??
    ((targetClaimId: string, loadOptions: { db?: PennyDatabase }) =>
      loadClaimDetail(requireClaimDetailDb(loadOptions.db), targetClaimId));

  try {
    return jsonResponse({ data: await loadDetail(parsedClaimId.data, dbOption(db)) }, 200);
  } catch (error) {
    return claimDetailErrorResponse(error);
  }
}

export class ClaimDetailNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimDetailNotFoundError";
  }
}

export class ClaimDetailConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimDetailConflictError";
  }
}

export async function loadClaimDetail(db: PennyDatabase, claimId: string): Promise<ClaimDetailPayload> {
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId)).limit(1);

  if (!claim) {
    throw new ClaimDetailNotFoundError("Claim was not found.");
  }

  const versionRows = await db
    .select()
    .from(claimVersions)
    .where(eq(claimVersions.claimId, claim.id))
    .orderBy(asc(claimVersions.createdAt));

  const edgeRows = await db
    .select()
    .from(claimEdges)
    .where(or(eq(claimEdges.fromClaimId, claim.id), eq(claimEdges.toClaimId, claim.id)))
    .orderBy(asc(claimEdges.createdAt));
  const connectedClaimIds = uniqueStrings(
    edgeRows.map((edge) => (edge.fromClaimId === claim.id ? edge.toClaimId : edge.fromClaimId)),
  );
  const connectedClaimRows =
    connectedClaimIds.length > 0
      ? await db.select().from(claims).where(inArray(claims.id, connectedClaimIds)).orderBy(asc(claims.createdAt))
      : [];
  const connectedVersionRows =
    connectedClaimIds.length > 0
      ? await db
          .select()
          .from(claimVersions)
          .where(and(inArray(claimVersions.claimId, connectedClaimIds), eq(claimVersions.isCurrent, true)))
          .orderBy(asc(claimVersions.createdAt))
      : [];
  const spanRows = await loadClaimSourceSpans(db, claim.id, versionRows.map((version) => version.id));
  const sourceIds = uniqueStrings([
    claim.sourceId,
    ...versionRows.map((version) => version.sourceId),
    ...spanRows.map((span) => span.sourceId),
  ]);
  const sourceRows =
    sourceIds.length > 0
      ? await db.select().from(sources).where(inArray(sources.id, sourceIds)).orderBy(asc(sources.createdAt))
      : [];
  const moveRows = await db.select().from(moves).where(eq(moves.sessionId, claim.sessionId)).orderBy(asc(moves.createdAt));

  return buildClaimDetailFromState({
    claim,
    versions: versionRows,
    edges: edgeRows,
    connectedClaims: connectedClaimRows,
    connectedVersions: connectedVersionRows,
    moves: moveRows,
    sources: sourceRows,
    sourceSpans: spanRows,
  });
}

export function buildClaimDetailFromState(state: ClaimDetailState) {
  const versions = [...state.versions].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const currentVersion = [...versions]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .find((version) => version.isCurrent);

  if (!currentVersion) {
    throw new ClaimDetailConflictError("Claim has no current ClaimVersion.");
  }

  const connectedVersionsByClaimId = currentVersionsByClaimId(state.connectedVersions);
  const connectedClaimsById = new Map(
    state.connectedClaims.map((claim) => [claim.id, claimSlice(claim, connectedVersionsByClaimId.get(claim.id))]),
  );
  const sourceRowsById = new Map(state.sources.map((source) => [source.id, source]));
  const sourceSpanSlices = state.sourceSpans.map((span) => sourceSpanSlice(span, sourceRowsById.get(span.sourceId)));
  const sourceId = currentVersion.sourceId ?? state.claim.sourceId ?? state.sourceSpans[0]?.sourceId ?? null;
  const source = sourceId ? sourceRowsById.get(sourceId) : undefined;
  const connectedEdgeIds = new Set(state.edges.map((edge) => edge.id));
  const versionIds = new Set(versions.map((version) => version.id));
  const moveSlices = state.moves
    .filter((move) => moveInvolvesClaim(move, state.claim.id, connectedEdgeIds, versionIds))
    .map(moveSlice);
  const challengeEdges = state.edges.filter((edge) => edge.kind === "challenges" || edge.kind === "contradicts");
  const teachesEdges = state.edges.filter((edge) => edge.kind === "teaches");

  return {
    claim: claimSlice(state.claim, currentVersion),
    currentVersion: claimVersionSlice(currentVersion),
    oldVersions: versions.filter((version) => !version.isCurrent).map(claimVersionSlice),
    versions: versions.map(claimVersionSlice),
    confidenceHistory: versions.map((version) => ({
      versionId: version.id,
      confidence: version.confidence,
      status: version.status,
      state: version.isCurrent ? "current" : "old",
      createdAt: version.createdAt.toISOString(),
    })),
    moves: moveSlices,
    provenance: {
      source: source ? sourceSlice(source) : null,
      sources: state.sources.map(sourceSlice),
      spans: sourceSpanSlices,
    },
    connectedClaims: state.edges
      .map((edge) => {
        const connectedClaimId = edge.fromClaimId === state.claim.id ? edge.toClaimId : edge.fromClaimId;
        const connectedClaim = connectedClaimsById.get(connectedClaimId);

        if (!connectedClaim) {
          return null;
        }

        return {
          edge: edgeSlice(edge),
          direction: edge.fromClaimId === state.claim.id ? "outgoing" : "incoming",
          claim: connectedClaim,
        };
      })
      .filter((connected): connected is NonNullable<typeof connected> => Boolean(connected)),
    activeChallenges: challengeEdges.map((edge) => ({
      edge: edgeSlice(edge),
      targetClaim:
        edge.toClaimId === state.claim.id ? claimSlice(state.claim, currentVersion) : connectedClaimsById.get(edge.toClaimId) ?? null,
      critiqueClaim:
        edge.fromClaimId === state.claim.id
          ? claimSlice(state.claim, currentVersion)
          : connectedClaimsById.get(edge.fromClaimId) ?? null,
      responseState: responseStateForChallenge(moveSlices, edge.id),
      moves: moveSlices.filter((move) => move.edgeIds.includes(edge.id)),
    })),
    learnedConcepts: teachesEdges
      .map((edge) => {
        const connectedClaimId = edge.fromClaimId === state.claim.id ? edge.toClaimId : edge.fromClaimId;
        const connectedClaim = connectedClaimsById.get(connectedClaimId);
        const currentClaim = claimSlice(state.claim, currentVersion);
        const conceptClaim =
          currentClaim.kind === "concept" ? currentClaim : connectedClaim?.kind === "concept" ? connectedClaim : null;

        if (!connectedClaim || !conceptClaim) {
          return null;
        }

        return {
          edge: edgeSlice(edge),
          conceptClaim,
          attachedClaim: currentClaim.kind === "concept" ? connectedClaim : currentClaim,
        };
      })
      .filter((concept): concept is NonNullable<typeof concept> => Boolean(concept)),
  };
}

async function loadClaimSourceSpans(
  db: PennyDatabase,
  claimId: string,
  claimVersionIds: string[],
): Promise<SourceSpanRow[]> {
  if (claimVersionIds.length === 0) {
    return db.select().from(sourceSpans).where(eq(sourceSpans.claimId, claimId)).orderBy(asc(sourceSpans.createdAt));
  }

  return db
    .select()
    .from(sourceSpans)
    .where(or(eq(sourceSpans.claimId, claimId), inArray(sourceSpans.claimVersionId, claimVersionIds)))
    .orderBy(asc(sourceSpans.createdAt));
}

function claimSlice(claim: ClaimRow, version: ClaimVersionRow | undefined) {
  return {
    id: claim.id,
    versionId: version?.id ?? null,
    sessionId: claim.sessionId,
    sourceId: version?.sourceId ?? claim.sourceId,
    kind: claim.kind,
    status: version?.status ?? claim.status,
    text: version?.content ?? claim.text,
    confidence: version?.confidence ?? claim.confidence,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: claim.updatedAt.toISOString(),
  };
}

function claimVersionSlice(version: ClaimVersionRow) {
  return {
    id: version.id,
    claimId: version.claimId,
    sourceId: version.sourceId,
    content: version.content,
    status: version.status,
    confidence: version.confidence,
    state: version.isCurrent ? "current" : "old",
    isCurrent: version.isCurrent,
    createdAt: version.createdAt.toISOString(),
  };
}

function edgeSlice(edge: EdgeRow) {
  return {
    id: edge.id,
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    kind: edge.kind,
    status: edge.status,
    label: edge.label,
    createdAt: edge.createdAt.toISOString(),
  };
}

function moveSlice(move: MoveRow) {
  return {
    id: move.id,
    kind: move.kind,
    summary: move.summary,
    claimIds: moveClaimIds(move.payload),
    edgeIds: moveEdgeIds(move.payload),
    artifactIds: stringArrayPayloadValue(move.payload, "artifactIds"),
    payload: move.payload,
    createdAt: move.createdAt.toISOString(),
  };
}

function sourceSlice(source: SourceRow) {
  return {
    id: source.id,
    sessionId: source.sessionId,
    kind: source.kind,
    rawText: source.rawText,
    createdAt: source.createdAt.toISOString(),
  };
}

function sourceSpanSlice(span: SourceSpanRow, source: SourceRow | undefined) {
  return {
    id: span.id,
    sourceId: span.sourceId,
    claimId: span.claimId,
    claimVersionId: span.claimVersionId,
    startOffset: span.startOffset,
    endOffset: span.endOffset,
    label: span.label,
    text: source?.rawText.slice(span.startOffset, span.endOffset) ?? "",
    createdAt: span.createdAt.toISOString(),
  };
}

function currentVersionsByClaimId(versionRows: ClaimVersionRow[]): Map<string, ClaimVersionRow> {
  const versionsByClaimId = new Map<string, ClaimVersionRow>();

  for (const version of [...versionRows].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())) {
    if (version.isCurrent && !versionsByClaimId.has(version.claimId)) {
      versionsByClaimId.set(version.claimId, version);
    }
  }

  return versionsByClaimId;
}

function moveInvolvesClaim(
  move: MoveRow,
  claimId: string,
  connectedEdgeIds: Set<string>,
  claimVersionIds: Set<string>,
): boolean {
  const payloadValues = payloadStringValues(move.payload);

  if (payloadValues.has(claimId)) {
    return true;
  }

  for (const edgeId of connectedEdgeIds) {
    if (payloadValues.has(edgeId)) {
      return true;
    }
  }

  for (const versionId of claimVersionIds) {
    if (payloadValues.has(versionId)) {
      return true;
    }
  }

  return false;
}

function responseStateForChallenge(movesForClaim: ReturnType<typeof moveSlice>[], edgeId: string): string {
  const responseMove = [...movesForClaim]
    .reverse()
    .find(
      (move) =>
        move.edgeIds.includes(edgeId) &&
        (move.kind === "user_defended" || move.kind === "claim_revised" || move.kind === "critique_absorbed"),
    );

  return responseMove?.kind ?? "unanswered";
}

function moveClaimIds(payload: unknown): string[] {
  return uniqueStrings([
    ...stringArrayPayloadValue(payload, "claimIds"),
    stringPayloadValue(payload, "claimId"),
    stringPayloadValue(payload, "targetClaimId"),
    stringPayloadValue(payload, "critiqueClaimId"),
    stringPayloadValue(payload, "currentClaimId"),
    stringPayloadValue(payload, "conceptClaimId"),
  ]);
}

function moveEdgeIds(payload: unknown): string[] {
  return uniqueStrings([
    ...stringArrayPayloadValue(payload, "edgeIds"),
    stringPayloadValue(payload, "edgeId"),
    stringPayloadValue(payload, "challengeEdgeId"),
    stringPayloadValue(payload, "teachesEdgeId"),
  ]);
}

function stringPayloadValue(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === "string" ? value : null;
}

function stringArrayPayloadValue(payload: unknown, key: string): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const value = (payload as Record<string, unknown>)[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function payloadStringValues(payload: unknown): Set<string> {
  const values = new Set<string>();
  collectPayloadStringValues(payload, values);
  return values;
}

function collectPayloadStringValues(value: unknown, values: Set<string>): void {
  if (typeof value === "string") {
    values.add(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPayloadStringValues(item, values);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const item of Object.values(value)) {
    collectPayloadStringValues(item, values);
  }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function claimDetailErrorResponse(error: unknown): Response {
  if (error instanceof ClaimDetailNotFoundError) {
    return jsonResponse(
      {
        error: {
          code: "claim_not_found",
          message: error.message,
        },
      },
      404,
    );
  }

  if (error instanceof ClaimDetailConflictError) {
    return jsonResponse(
      {
        error: {
          code: "claim_detail_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "claim_detail_failed",
        message: formatErrorMessage(error),
      },
    },
    500,
  );
}

function resolveClaimDetailDb(options: ClaimDetailRouteOptions, hasInjectedLoadClaimDetail: boolean): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedLoadClaimDetail) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireClaimDetailDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for GET /brain/claims/:claimId/detail.");
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

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}
