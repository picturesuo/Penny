import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainRuns, claimEdges, claims, claimVersions, moves, sessions, sources, sourceSpans } from "./db/schema.ts";
import { scopeValues, type OptionalBrainScope } from "./scope.ts";
import { filterSourceSpansToSources, loadScopedSourcesByIds } from "./source-loading.ts";

const SessionMovesPathSchema = z.string().uuid();

type SessionRow = OptionalBrainScope<typeof sessions.$inferSelect>;
type MoveRow = OptionalBrainScope<typeof moves.$inferSelect>;
type ClaimRow = OptionalBrainScope<typeof claims.$inferSelect>;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = OptionalBrainScope<typeof claimEdges.$inferSelect>;
type BrainRunRow = OptionalBrainScope<typeof brainRuns.$inferSelect>;
type SourceRow = OptionalBrainScope<typeof sources.$inferSelect>;
type SourceSpanRow = typeof sourceSpans.$inferSelect;

export type SessionMovesState = {
  session: SessionRow;
  moves: MoveRow[];
  claims: ClaimRow[];
  claimVersions: ClaimVersionRow[];
  edges: EdgeRow[];
  brainRuns: BrainRunRow[];
  sources: SourceRow[];
  sourceSpans: SourceSpanRow[];
};

export type SessionMovesPayload = ReturnType<typeof buildSessionMovesTimeline>;

export type SessionMovesRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  loadSessionMoves?: (sessionId: string, options: { db?: PennyDatabase }) => Promise<SessionMovesPayload>;
};

type MoveRefs = {
  claimIds: string[];
  versionIds: string[];
  edgeIds: string[];
  sourceIds: string[];
  sourceSpanIds: string[];
  brainRunId: string | null;
  oldVersionId: string | null;
  newVersionId: string | null;
};

export async function handleSessionMovesRequest(
  request: Request,
  sessionId: string,
  options: SessionMovesRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse(
      {
        error: {
          code: "method_not_allowed",
          message: "GET /brain/session/:sessionId/moves requires the GET method.",
        },
      },
      405,
      { Allow: "GET" },
    );
  }

  const parsedSessionId = SessionMovesPathSchema.safeParse(sessionId);

  if (!parsedSessionId.success) {
    return jsonResponse(
      {
        error: {
          code: "invalid_session_id",
          message: "Session moves require a valid session id.",
        },
      },
      400,
    );
  }

  const db = resolveSessionMovesDb(options, Boolean(options.loadSessionMoves));
  const loadMoves =
    options.loadSessionMoves ??
    ((targetSessionId: string, loadOptions: { db?: PennyDatabase }) =>
      loadSessionMoves(requireSessionMovesDb(loadOptions.db), targetSessionId));

  try {
    return jsonResponse({ data: await loadMoves(parsedSessionId.data, dbOption(db)) }, 200);
  } catch (error) {
    if (error instanceof SessionMovesNotFoundError) {
      return jsonResponse(
        {
          error: {
            code: "session_not_found",
            message: error.message,
          },
        },
        404,
      );
    }

    return jsonResponse(
      {
        error: {
          code: "session_moves_failed",
          message: formatErrorMessage(error),
        },
      },
      500,
    );
  }
}

export class SessionMovesNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionMovesNotFoundError";
  }
}

export async function loadSessionMoves(db: PennyDatabase, sessionId: string): Promise<SessionMovesPayload> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

  if (!session) {
    throw new SessionMovesNotFoundError("Session was not found.");
  }

  const moveRows = await db.select().from(moves).where(eq(moves.sessionId, session.id)).orderBy(asc(moves.createdAt));
  const refs = moveRows.map((move) => moveRefs(move.payload));
  const claimIds = new Set(refs.flatMap((ref) => ref.claimIds));
  const versionIds = new Set(refs.flatMap((ref) => ref.versionIds));
  const edgeIds = new Set(refs.flatMap((ref) => ref.edgeIds));
  const sourceIds = new Set(refs.flatMap((ref) => ref.sourceIds));
  const sourceSpanIds = new Set(refs.flatMap((ref) => ref.sourceSpanIds));
  const brainRunIds = new Set(refs.map((ref) => ref.brainRunId).filter((id): id is string => Boolean(id)));

  const edgeRows =
    edgeIds.size > 0
      ? await db.select().from(claimEdges).where(inArray(claimEdges.id, [...edgeIds])).orderBy(asc(claimEdges.createdAt))
      : [];

  for (const edge of edgeRows) {
    claimIds.add(edge.fromClaimId);
    claimIds.add(edge.toClaimId);
  }

  const explicitVersionRows =
    versionIds.size > 0
      ? await db
          .select()
          .from(claimVersions)
          .where(inArray(claimVersions.id, [...versionIds]))
          .orderBy(asc(claimVersions.createdAt))
      : [];

  for (const version of explicitVersionRows) {
    claimIds.add(version.claimId);
    if (version.sourceId) {
      sourceIds.add(version.sourceId);
    }
  }

  const claimRows =
    claimIds.size > 0
      ? await db.select().from(claims).where(inArray(claims.id, [...claimIds])).orderBy(asc(claims.createdAt))
      : [];

  for (const claim of claimRows) {
    if (claim.sourceId) {
      sourceIds.add(claim.sourceId);
    }
  }

  const claimVersionRows = claimRows.length
    ? await db
        .select()
        .from(claimVersions)
        .where(inArray(claimVersions.claimId, claimRows.map((claim) => claim.id)))
        .orderBy(asc(claimVersions.createdAt))
    : [];
  const brainRunRows =
    brainRunIds.size > 0
      ? await db.select().from(brainRuns).where(inArray(brainRuns.id, [...brainRunIds])).orderBy(asc(brainRuns.createdAt))
      : [];

  for (const run of brainRunRows) {
    if (run.sourceId) {
      sourceIds.add(run.sourceId);
    }
  }

  const sourceSpanRows =
    sourceSpanIds.size > 0
      ? await db
          .select()
          .from(sourceSpans)
          .where(inArray(sourceSpans.id, [...sourceSpanIds]))
          .orderBy(asc(sourceSpans.createdAt))
      : [];

  for (const span of sourceSpanRows) {
    sourceIds.add(span.sourceId);
  }

  const sourceRows = await loadScopedSourcesByIds(db, [...sourceIds], session);
  const scopedSourceSpanRows = filterSourceSpansToSources(sourceSpanRows, sourceRows);

  return buildSessionMovesTimeline({
    session,
    moves: moveRows,
    claims: claimRows,
    claimVersions: uniqueRowsById([...explicitVersionRows, ...claimVersionRows]),
    edges: edgeRows,
    brainRuns: brainRunRows,
    sources: sourceRows,
    sourceSpans: scopedSourceSpanRows,
  });
}

export function buildSessionMovesTimeline(state: SessionMovesState) {
  const versionsById = new Map(state.claimVersions.map((version) => [version.id, version]));
  const currentVersionsByClaimId = currentVersionMap(state.claimVersions);
  const claimsById = new Map(
    state.claims.flatMap((claim) => {
      const version = currentVersionsByClaimId.get(claim.id);

      return version ? [[claim.id, claimSlice(claim, version)] as const] : [];
    }),
  );
  const rawClaimsById = new Map(state.claims.map((claim) => [claim.id, claim]));
  const edgesById = new Map(state.edges.map((edge) => [edge.id, edge]));
  const brainRunsById = new Map(state.brainRuns.map((run) => [run.id, run]));
  const sourcesById = new Map(state.sources.map((source) => [source.id, source]));
  const sourceSpansById = new Map(state.sourceSpans.map((span) => [span.id, span]));

  return {
    session: {
      id: state.session.id,
      ...scopeValues(state.session),
      status: state.session.status,
      title: state.session.title,
      createdAt: state.session.createdAt.toISOString(),
    },
    moves: [...state.moves]
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map((move) => {
        const refs = moveRefs(move.payload);
        const affectedEdges = refs.edgeIds.map((id) => edgesById.get(id)).filter((edge): edge is EdgeRow => Boolean(edge));
        const affectedClaimIds = uniqueStrings([
          ...refs.claimIds,
          ...affectedEdges.flatMap((edge) => [edge.fromClaimId, edge.toClaimId]),
          ...refs.versionIds.map((id) => versionsById.get(id)?.claimId).filter((id): id is string => Boolean(id)),
        ]);
        const affectedClaims = affectedClaimIds.map((id) => claimsById.get(id)).filter((claim): claim is NonNullable<typeof claim> => Boolean(claim));
        const affectedVersions = refs.versionIds
          .map((id) => versionsById.get(id))
          .filter((version): version is ClaimVersionRow => Boolean(version))
          .map(versionSlice);
        const oldVersion = refs.oldVersionId ? versionsById.get(refs.oldVersionId) : undefined;
        const newVersion = refs.newVersionId ? versionsById.get(refs.newVersionId) : undefined;
        const relatedClaim = affectedClaims[0] ?? relatedClaimForVersion(newVersion ?? oldVersion, claimsById) ?? null;
        const brainRun = refs.brainRunId ? brainRunsById.get(refs.brainRunId) : undefined;
        const sourceSpan = refs.sourceSpanIds.map((id) => sourceSpansById.get(id)).find(Boolean);
        const source =
          firstSource(refs.sourceIds, sourcesById) ??
          (sourceSpan ? sourcesById.get(sourceSpan.sourceId) : undefined) ??
          (brainRun?.sourceId ? sourcesById.get(brainRun.sourceId) : undefined) ??
          sourceForRelatedClaim(relatedClaim?.id, rawClaimsById, sourcesById) ??
          (newVersion?.sourceId ? sourcesById.get(newVersion.sourceId) : undefined) ??
          null;

        return {
          id: move.id,
          type: move.kind,
          actor: actorForMove(move.kind),
          summary: move.summary,
          createdAt: move.createdAt.toISOString(),
          affectedClaim: affectedClaims[0] ?? null,
          affectedVersion: affectedVersions[0] ?? null,
          affectedEdge: affectedEdges[0] ? edgeSlice(affectedEdges[0]) : null,
          affected: {
            claims: affectedClaims,
            versions: affectedVersions,
            edges: affectedEdges.map(edgeSlice),
          },
          payloadPreview: payloadPreview(move.payload),
          details: {
            whatChanged: move.summary,
            oldVersion: oldVersion ? versionSlice(oldVersion) : null,
            newVersion: newVersion ? versionSlice(newVersion) : null,
            relatedClaim,
            source: source ? sourceSlice(source) : null,
            sourceSpan: sourceSpan ? sourceSpanSlice(sourceSpan) : null,
            brainRun: brainRun ? brainRunSlice(brainRun) : null,
            payload: move.payload,
          },
        };
      }),
  };
}

function moveRefs(payload: unknown): MoveRefs {
  const record = objectRecord(payload);
  const oldVersionId = firstString(record, ["previousVersionId", "previousClaimVersionId"]);
  const newVersionId = firstString(record, [
    "currentVersionId",
    "currentClaimVersionId",
    "claimVersionId",
    "conceptClaimVersionId",
    "critiqueClaimVersionId",
  ]);

  return {
    claimIds: uuidStrings([
      ...stringArrayValues(record, ["claimIds"]),
      ...stringValues(record, ["claimId", "targetClaimId", "critiqueClaimId", "currentClaimId", "conceptClaimId"]),
    ]),
    versionIds: uuidStrings([
      ...stringArrayValues(record, ["claimVersionIds"]),
      ...stringValues(record, [
        "versionId",
        "claimVersionId",
        "targetClaimVersionId",
        "critiqueClaimVersionId",
        "conceptClaimVersionId",
        "previousVersionId",
        "currentVersionId",
        "previousClaimVersionId",
        "currentClaimVersionId",
      ]),
    ]),
    edgeIds: uuidStrings([
      ...stringArrayValues(record, ["edgeIds"]),
      ...stringValues(record, ["edgeId", "challengeEdgeId", "teachesEdgeId"]),
    ]),
    sourceIds: uuidStrings([...stringArrayValues(record, ["sourceIds"]), ...stringValues(record, ["sourceId"])]),
    sourceSpanIds: uuidStrings([
      ...stringArrayValues(record, ["sourceSpanIds"]),
      ...stringValues(record, ["sourceSpanId", "submittedSourceSpanId"]),
    ]),
    brainRunId: firstUuidString(record, ["brainRunId"]),
    oldVersionId,
    newVersionId,
  };
}

function actorForMove(kind: string): "User" | "Penny" {
  if (
    [
      "source.recorded",
      "assumption_confirmed",
      "assumption_rejected",
      "assumption_refined",
      "confidence_update_accepted",
      "confidence_update_rejected",
      "user_defended",
      "claim_revised",
      "critique_absorbed",
      "learning_triggered",
      "challenge.response.defended",
      "challenge.response.revised",
      "challenge.response.absorbed",
    ].includes(kind)
  ) {
    return "User";
  }

  return "Penny";
}

function payloadPreview(payload: unknown): Record<string, unknown> {
  const record = objectRecord(payload);
  const preview: Record<string, unknown> = {};

  for (const key of [
    "action",
    "decision",
    "response",
    "verdict",
    "failureType",
    "strength",
    "confidenceDeltaSuggestion",
    "appliedDelta",
    "edgeStatus",
  ]) {
    if (typeof record[key] === "string" || typeof record[key] === "number" || typeof record[key] === "boolean") {
      preview[key] = record[key];
    }
  }

  for (const key of [
    "claimId",
    "targetClaimId",
    "currentClaimId",
    "conceptClaimId",
    "challengeEdgeId",
    "teachesEdgeId",
    "artifactId",
    "brainRunId",
    "sourceId",
    "sourceSpanId",
    "verifyMoveId",
    "previousVersionId",
    "currentVersionId",
    "previousClaimVersionId",
    "currentClaimVersionId",
  ]) {
    if (typeof record[key] === "string") {
      preview[key] = shortId(record[key]);
    }
  }

  for (const key of ["claimIds", "edgeIds", "artifactIds", "sourceIds", "sourceSpanIds", "claimVersionIds"]) {
    const values = stringArray(record[key]).map(shortId);

    if (values.length > 0) {
      preview[key] = values.slice(0, 4);
    }
  }

  return preview;
}

function claimSlice(claim: ClaimRow, version: ClaimVersionRow) {
  return {
    id: claim.id,
    ...scopeValues(claim),
    versionId: version.id,
    kind: claim.kind,
    status: version.status,
    text: version.content,
    confidence: version.confidence,
  };
}

function versionSlice(version: ClaimVersionRow) {
  return {
    id: version.id,
    claimId: version.claimId,
    sourceId: version.sourceId,
    brainRunId: version.brainRunId,
    moveId: version.moveId,
    content: version.content,
    status: version.status,
    confidence: version.confidence,
    state: version.isCurrent ? "current" : "old",
    isCurrent: version.isCurrent,
    validFrom: version.validFrom.toISOString(),
    validUntil: version.validUntil?.toISOString() ?? null,
    supersededByVersionId: version.supersededByVersionId,
    createdAt: version.createdAt.toISOString(),
  };
}

function edgeSlice(edge: EdgeRow) {
  return {
    id: edge.id,
    ...scopeValues(edge),
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    kind: edge.kind,
    status: edge.status,
    label: edge.label,
    createdAt: edge.createdAt.toISOString(),
  };
}

function sourceSlice(source: SourceRow) {
  return {
    id: source.id,
    ...scopeValues(source),
    sessionId: source.sessionId,
    kind: source.kind,
    rawText: source.rawText,
    createdAt: source.createdAt.toISOString(),
  };
}

function sourceSpanSlice(span: SourceSpanRow) {
  return {
    id: span.id,
    sourceId: span.sourceId,
    claimId: span.claimId,
    claimVersionId: span.claimVersionId,
    startOffset: span.startOffset,
    endOffset: span.endOffset,
    label: span.label,
    createdAt: span.createdAt.toISOString(),
  };
}

function brainRunSlice(run: BrainRunRow) {
  return {
    id: run.id,
    ...scopeValues(run),
    operation: run.operation,
    provider: run.provider,
    model: run.model,
    status: run.status,
    sourceId: run.sourceId,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    input: run.input,
    output: run.output,
    error: run.error,
  };
}

function currentVersionMap(versions: ClaimVersionRow[]): Map<string, ClaimVersionRow> {
  const map = new Map<string, ClaimVersionRow>();

  for (const version of versions) {
    if (version.isCurrent) {
      map.set(version.claimId, version);
    }
  }

  return map;
}

function relatedClaimForVersion(
  version: ClaimVersionRow | undefined,
  claimsById: Map<string, ReturnType<typeof claimSlice>>,
): ReturnType<typeof claimSlice> | null {
  return version ? claimsById.get(version.claimId) ?? null : null;
}

function sourceForRelatedClaim(
  claimId: string | undefined,
  claimsById: Map<string, ClaimRow>,
  sourcesById: Map<string, SourceRow>,
): SourceRow | null {
  const claim = claimId ? claimsById.get(claimId) : undefined;

  return claim?.sourceId ? sourcesById.get(claim.sourceId) ?? null : null;
}

function firstSource(sourceIds: string[], sourcesById: Map<string, SourceRow>): SourceRow | null {
  for (const id of sourceIds) {
    const source = sourcesById.get(id);

    if (source) {
      return source;
    }
  }

  return null;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function firstUuidString(record: Record<string, unknown>, keys: string[]): string | null {
  const value = firstString(record, keys);

  return value && isUuid(value) ? value : null;
}

function stringValues(record: Record<string, unknown>, keys: string[]): string[] {
  return keys.map((key) => record[key]).filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
}

function stringArrayValues(record: Record<string, unknown>, keys: string[]): string[] {
  return keys.flatMap((key) => stringArray(record[key]));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function uuidStrings(values: Array<string | null | undefined>): string[] {
  return uniqueStrings(values).filter(isUuid);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function uniqueRowsById<Row extends { id: string }>(rows: Row[]): Row[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function shortId(value: unknown): string {
  return String(value ?? "").slice(0, 8);
}

function resolveSessionMovesDb(options: SessionMovesRouteOptions, hasInjectedLoader: boolean): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedLoader) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireSessionMovesDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for session moves.");
  }

  return db;
}

function dbOption(db: PennyDatabase | undefined): { db?: PennyDatabase } {
  return db ? { db } : {};
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
