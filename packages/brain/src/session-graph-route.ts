import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import {
  claimEdges,
  claims,
  claimVersions,
  derivedEffects,
  moves,
  sessions,
  shapes,
  sources,
  sourceSpans,
} from "./db/schema.ts";
import { scopeValues, type OptionalBrainScope } from "./scope.ts";
import { compiledShapesFromRows } from "./shapes.ts";

const SessionGraphPathSchema = z.string().uuid();

type SessionRow = OptionalBrainScope<typeof sessions.$inferSelect>;
type ClaimRow = OptionalBrainScope<typeof claims.$inferSelect>;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = OptionalBrainScope<typeof claimEdges.$inferSelect>;
type MoveRow = OptionalBrainScope<typeof moves.$inferSelect>;
type SourceRow = OptionalBrainScope<typeof sources.$inferSelect>;
type SourceSpanRow = typeof sourceSpans.$inferSelect;
type ShapeRow = typeof shapes.$inferSelect;
type DerivedEffectRow = OptionalBrainScope<typeof derivedEffects.$inferSelect>;

export type SessionGraphState = {
  session: SessionRow;
  claims: ClaimRow[];
  claimVersions: ClaimVersionRow[];
  edges: EdgeRow[];
  moves: MoveRow[];
  sources: SourceRow[];
  sourceSpans: SourceSpanRow[];
  shapes?: ShapeRow[];
  pendingEffects?: DerivedEffectRow[];
};

export type SessionGraphPayload = ReturnType<typeof buildSessionGraph>;

export type SessionGraphRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  loadSessionGraph?: (sessionId: string, options: { db?: PennyDatabase }) => Promise<SessionGraphPayload>;
};

type GraphClaimVersion = ReturnType<typeof claimVersionSlice>;
type GraphEdge = ReturnType<typeof edgeSlice>;
type GraphMoveReferences = {
  claimIds: string[];
  claimVersionIds: string[];
  edgeIds: string[];
  artifactIds: string[];
  sourceIds: string[];
  sourceSpanIds: string[];
  brainRunIds: string[];
};

type ReferenceIndexes = {
  claimIds: Set<string>;
  claimVersionsById: Map<string, ClaimVersionRow>;
  edgesById: Map<string, EdgeRow>;
  sourcesById: Map<string, SourceRow>;
  sourceSpansById: Map<string, SourceSpanRow>;
};

export async function handleSessionGraphRequest(
  request: Request,
  sessionId: string,
  options: SessionGraphRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /brain/session/:sessionId/graph requires the GET method.");
  }

  const parsedSessionId = SessionGraphPathSchema.safeParse(sessionId);

  if (!parsedSessionId.success) {
    return jsonResponse(
      {
        error: {
          code: "invalid_session_id",
          message: "Session graph requires a valid session id.",
        },
      },
      400,
    );
  }

  const db = resolveSessionGraphDb(options, Boolean(options.loadSessionGraph));
  const loadGraph =
    options.loadSessionGraph ??
    ((targetSessionId: string, loadOptions: { db?: PennyDatabase }) =>
      loadSessionGraph(requireSessionGraphDb(loadOptions.db), targetSessionId));

  try {
    return jsonResponse({ data: await loadGraph(parsedSessionId.data, dbOption(db)) }, 200);
  } catch (error) {
    return sessionGraphErrorResponse(error);
  }
}

export class SessionGraphNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionGraphNotFoundError";
  }
}

export class SessionGraphConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionGraphConflictError";
  }
}

export async function loadSessionGraph(db: PennyDatabase, sessionId: string): Promise<SessionGraphPayload> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

  if (!session) {
    throw new SessionGraphNotFoundError("Session was not found.");
  }

  const claimRows = await db.select().from(claims).where(eq(claims.sessionId, session.id)).orderBy(asc(claims.createdAt));
  const claimIds = claimRows.map((claim) => claim.id);
  const versionRows =
    claimIds.length > 0
      ? await db
          .select()
          .from(claimVersions)
          .where(inArray(claimVersions.claimId, claimIds))
          .orderBy(asc(claimVersions.createdAt))
      : [];
  const edgeRows = await db
    .select()
    .from(claimEdges)
    .where(eq(claimEdges.sessionId, session.id))
    .orderBy(asc(claimEdges.createdAt));
  const moveRows = await db.select().from(moves).where(eq(moves.sessionId, session.id)).orderBy(asc(moves.createdAt));
  const sourceRows = await db.select().from(sources).where(eq(sources.sessionId, session.id)).orderBy(asc(sources.createdAt));
  const sourceIds = sourceRows.map((source) => source.id);
  const spanRows =
    sourceIds.length > 0
      ? await db
          .select()
          .from(sourceSpans)
          .where(inArray(sourceSpans.sourceId, sourceIds))
          .orderBy(asc(sourceSpans.createdAt))
      : [];
  const shapeRows = await db.select().from(shapes).where(eq(shapes.sessionId, session.id)).orderBy(desc(shapes.createdAt));
  const pendingEffectRows = await db
    .select()
    .from(derivedEffects)
    .where(and(eq(derivedEffects.sessionId, session.id), eq(derivedEffects.status, "pending_review")))
    .orderBy(desc(derivedEffects.createdAt))
    .limit(6);

  return buildSessionGraph({
    session,
    claims: claimRows,
    claimVersions: versionRows,
    edges: edgeRows,
    moves: moveRows,
    sources: sourceRows,
    sourceSpans: spanRows,
    shapes: shapeRows,
    pendingEffects: pendingEffectRows,
  });
}

export function buildSessionGraph(state: SessionGraphState) {
  const versionsByClaimId = groupBySorted(state.claimVersions, (version) => version.claimId);
  const currentVersionsByClaimId = currentVersionMap(state.claimVersions);
  const versionSlicesById = new Map(state.claimVersions.map((version) => [version.id, claimVersionSlice(version)]));
  const indexes: ReferenceIndexes = {
    claimIds: new Set(state.claims.map((claim) => claim.id)),
    claimVersionsById: new Map(state.claimVersions.map((version) => [version.id, version])),
    edgesById: new Map(state.edges.map((edge) => [edge.id, edge])),
    sourcesById: new Map(state.sources.map((source) => [source.id, source])),
    sourceSpansById: new Map(state.sourceSpans.map((span) => [span.id, span])),
  };
  const sourceRowsById = indexes.sourcesById;
  const moveRefsById = new Map(
    state.moves.map((move) => {
      return [move.id, moveReferences(move.payload, indexes)] as const;
    }),
  );
  const outgoingEdgeIdsByClaimId = groupEdgeIds(state.edges, "fromClaimId");
  const incomingEdgeIdsByClaimId = groupEdgeIds(state.edges, "toClaimId");
  const sourceSpanIdsByClaimId = groupSourceSpanIdsByClaimId(state.sourceSpans, indexes.claimVersionsById);
  const moveIdsByClaimId = groupMoveIdsByClaimId(state.moves, moveRefsById, indexes.claimVersionsById, indexes.edgesById);
  const claimSlices = [...state.claims]
    .sort(rowDateSort)
    .map((claim) => {
      const currentVersion = currentVersionsByClaimId.get(claim.id);

      if (!currentVersion) {
        throw new SessionGraphConflictError(`Claim ${claim.id} has no current ClaimVersion.`);
      }

      const versions = (versionsByClaimId.get(claim.id) ?? []).map((version) => requireVersionSlice(versionSlicesById, version.id));

      return claimSlice(claim, currentVersion, {
        currentVersion: requireVersionSlice(versionSlicesById, currentVersion.id),
        versions,
        incomingEdgeIds: incomingEdgeIdsByClaimId.get(claim.id) ?? [],
        outgoingEdgeIds: outgoingEdgeIdsByClaimId.get(claim.id) ?? [],
        moveIds: moveIdsByClaimId.get(claim.id) ?? [],
        sourceSpanIds: sourceSpanIdsByClaimId.get(claim.id) ?? [],
      });
    });
  const claimSlicesById = new Map(claimSlices.map((claim) => [claim.id, claim]));
  const edgeSlices = [...state.edges]
    .sort(rowDateSort)
    .map((edge) => edgeSlice(edge, currentVersionsByClaimId.get(edge.fromClaimId), currentVersionsByClaimId.get(edge.toClaimId)));
  const moveSlices = [...state.moves].sort(rowDateSort).map((move) => moveSlice(move, moveRefsById.get(move.id) ?? emptyMoveReferences()));
  const sourceSlices = [...state.sources].sort(rowDateSort).map(sourceSlice);
  const sourceSpanSlices = [...state.sourceSpans].sort(rowDateSort).map((span) => sourceSpanSlice(span, sourceRowsById.get(span.sourceId)));
  const claimVersionSlices = [...state.claimVersions].sort(rowDateSort).map(claimVersionSlice);

  return {
    session: {
      id: state.session.id,
      scope: scopeValues(state.session),
      status: state.session.status,
      title: state.session.title,
      createdAt: state.session.createdAt.toISOString(),
      endedAt: state.session.endedAt?.toISOString() ?? null,
    },
    sourceOfTruth: "claims_claim_versions_edges_moves_sources_source_spans",
    ideaMap: {
      artifactId: null,
      keyInsight: null,
      claims: claimSlices,
      claimVersions: claimVersionSlices,
      edges: edgeSlices,
    },
    graph: {
      nodes: claimSlices.map(graphNodeSlice),
      edges: edgeSlices.map((edge) => graphEdgeSlice(edge, claimSlicesById)),
    },
    moves: moveSlices,
    sources: sourceSlices,
    sourceSpans: sourceSpanSlices,
    lensSnapshot: lensSnapshotSlice(state.shapes ?? [], state.pendingEffects ?? []),
    meta: {
      claimCount: claimSlices.length,
      claimVersionCount: claimVersionSlices.length,
      edgeCount: edgeSlices.length,
      moveCount: moveSlices.length,
      sourceCount: sourceSlices.length,
      sourceSpanCount: sourceSpanSlices.length,
      shapeCount: state.shapes?.length ?? 0,
      pendingEffectCount: state.pendingEffects?.length ?? 0,
    },
  };
}

function claimSlice(
  claim: ClaimRow,
  currentVersion: ClaimVersionRow,
  refs: {
    currentVersion: GraphClaimVersion;
    versions: GraphClaimVersion[];
    incomingEdgeIds: string[];
    outgoingEdgeIds: string[];
    moveIds: string[];
    sourceSpanIds: string[];
  },
) {
  return {
    id: claim.id,
    scope: scopeValues(claim),
    sessionId: claim.sessionId,
    sourceId: currentVersion.sourceId ?? claim.sourceId,
    kind: claim.kind,
    status: currentVersion.status,
    text: currentVersion.content,
    confidence: currentVersion.confidence,
    versionId: currentVersion.id,
    currentVersion: refs.currentVersion,
    versions: refs.versions,
    incomingEdgeIds: refs.incomingEdgeIds,
    outgoingEdgeIds: refs.outgoingEdgeIds,
    moveIds: refs.moveIds,
    sourceSpanIds: refs.sourceSpanIds,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: currentVersion.createdAt.toISOString(),
  };
}

function claimVersionSlice(version: ClaimVersionRow) {
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

function edgeSlice(edge: EdgeRow, fromVersion: ClaimVersionRow | undefined, toVersion: ClaimVersionRow | undefined) {
  return {
    id: edge.id,
    scope: scopeValues(edge),
    sessionId: edge.sessionId,
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    fromClaimVersionId: fromVersion?.id ?? null,
    toClaimVersionId: toVersion?.id ?? null,
    kind: edge.kind,
    status: edge.status,
    label: edge.label,
    createdAt: edge.createdAt.toISOString(),
  };
}

function moveSlice(move: MoveRow, refs: GraphMoveReferences) {
  return {
    id: move.id,
    scope: scopeValues(move),
    sessionId: move.sessionId,
    kind: move.kind,
    summary: move.summary,
    claimIds: refs.claimIds,
    claimVersionIds: refs.claimVersionIds,
    edgeIds: refs.edgeIds,
    artifactIds: refs.artifactIds,
    sourceIds: refs.sourceIds,
    sourceSpanIds: refs.sourceSpanIds,
    brainRunIds: refs.brainRunIds,
    payload: move.payload,
    createdAt: move.createdAt.toISOString(),
  };
}

function sourceSlice(source: SourceRow) {
  return {
    id: source.id,
    scope: scopeValues(source),
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

function graphNodeSlice(claim: ReturnType<typeof claimSlice>) {
  return {
    id: claim.id,
    type: "claim" as const,
    claimId: claim.id,
    label: claim.text,
    kind: claim.kind,
    status: claim.status,
    confidence: claim.confidence,
    versionId: claim.versionId,
  };
}

function graphEdgeSlice(edge: GraphEdge, claimsById: Map<string, ReturnType<typeof claimSlice>>) {
  return {
    id: edge.id,
    type: "claim_edge" as const,
    source: edge.fromClaimId,
    target: edge.toClaimId,
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    kind: edge.kind,
    status: edge.status,
    label: edge.label,
    fromClaimVersionId: claimsById.get(edge.fromClaimId)?.versionId ?? edge.fromClaimVersionId,
    toClaimVersionId: claimsById.get(edge.toClaimId)?.versionId ?? edge.toClaimVersionId,
  };
}

function lensSnapshotSlice(shapeRows: ShapeRow[], pendingEffectRows: DerivedEffectRow[]) {
  return {
    shapes: compiledShapesFromRows(shapeRows).map((shape) => ({
      id: shape.id,
      key: shape.key,
      label: shape.label,
      description: shape.description,
      confidence: shape.confidence,
      status: shape.status,
      supportingMoveIds: shape.supportingMoveIds,
    })),
    pendingEffects: pendingEffectRows.map((effect) => ({
      id: effect.id,
      kind: effect.kind,
      title: effect.title,
      summary: effect.summary,
      payload: effect.payload,
    })),
  };
}

function currentVersionMap(versions: ClaimVersionRow[]): Map<string, ClaimVersionRow> {
  const map = new Map<string, ClaimVersionRow>();

  for (const version of [...versions].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())) {
    if (version.isCurrent && !map.has(version.claimId)) {
      map.set(version.claimId, version);
    }
  }

  return map;
}

function moveReferences(payload: unknown, indexes: ReferenceIndexes): GraphMoveReferences {
  const values = payloadStringValues(payload);
  const keyedValues = objectRecord(payload);

  return {
    claimIds: [...indexes.claimIds].filter((id) => values.has(id)),
    claimVersionIds: [...indexes.claimVersionsById.keys()].filter((id) => values.has(id)),
    edgeIds: [...indexes.edgesById.keys()].filter((id) => values.has(id)),
    artifactIds: uniqueStrings([...stringArrayValues(keyedValues, ["artifactIds"]), ...stringValues(keyedValues, ["artifactId"])]),
    sourceIds: [...indexes.sourcesById.keys()].filter((id) => values.has(id)),
    sourceSpanIds: [...indexes.sourceSpansById.keys()].filter((id) => values.has(id)),
    brainRunIds: uniqueStrings([...stringArrayValues(keyedValues, ["brainRunIds"]), ...stringValues(keyedValues, ["brainRunId"])]),
  };
}

function groupMoveIdsByClaimId(
  moveRows: MoveRow[],
  moveRefsById: Map<string, GraphMoveReferences>,
  versionsById: Map<string, ClaimVersionRow>,
  edgesById: Map<string, EdgeRow>,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const move of [...moveRows].sort(rowDateSort)) {
    const refs = moveRefsById.get(move.id) ?? emptyMoveReferences();
    const claimIds = uniqueStrings([
      ...refs.claimIds,
      ...refs.claimVersionIds.map((id) => versionsById.get(id)?.claimId),
      ...refs.edgeIds.flatMap((id) => {
        const edge = edgesById.get(id);

        return edge ? [edge.fromClaimId, edge.toClaimId] : [];
      }),
    ]);

    for (const claimId of claimIds) {
      appendGrouped(grouped, claimId, move.id);
    }
  }

  return grouped;
}

function groupEdgeIds(edges: EdgeRow[], key: "fromClaimId" | "toClaimId"): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const edge of [...edges].sort(rowDateSort)) {
    appendGrouped(grouped, edge[key], edge.id);
  }

  return grouped;
}

function groupSourceSpanIdsByClaimId(
  spans: SourceSpanRow[],
  versionsById: Map<string, ClaimVersionRow>,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const span of [...spans].sort(rowDateSort)) {
    if (span.claimId) {
      appendGrouped(grouped, span.claimId, span.id);
    }

    if (span.claimVersionId) {
      const claimId = versionsById.get(span.claimVersionId)?.claimId;

      if (claimId) {
        appendGrouped(grouped, claimId, span.id);
      }
    }
  }

  return grouped;
}

function groupBySorted<Row extends { createdAt: Date }, Key>(
  rows: Row[],
  keyFor: (row: Row) => Key,
): Map<Key, Row[]> {
  const grouped = new Map<Key, Row[]>();

  for (const row of [...rows].sort(rowDateSort)) {
    const key = keyFor(row);
    const existing = grouped.get(key);

    if (existing) {
      existing.push(row);
      continue;
    }

    grouped.set(key, [row]);
  }

  return grouped;
}

function requireVersionSlice(versionsById: Map<string, GraphClaimVersion>, versionId: string): GraphClaimVersion {
  const version = versionsById.get(versionId);

  if (!version) {
    throw new SessionGraphConflictError(`ClaimVersion ${versionId} was not available in the graph slice.`);
  }

  return version;
}

function emptyMoveReferences(): GraphMoveReferences {
  return {
    claimIds: [],
    claimVersionIds: [],
    edgeIds: [],
    artifactIds: [],
    sourceIds: [],
    sourceSpanIds: [],
    brainRunIds: [],
  };
}

function rowDateSort<Row extends { createdAt: Date }>(left: Row, right: Row): number {
  return left.createdAt.getTime() - right.createdAt.getTime();
}

function appendGrouped(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);

  if (existing) {
    if (!existing.includes(value)) {
      existing.push(value);
    }

    return;
  }

  map.set(key, [value]);
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

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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

function sessionGraphErrorResponse(error: unknown): Response {
  if (error instanceof SessionGraphNotFoundError) {
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

  if (error instanceof SessionGraphConflictError) {
    return jsonResponse(
      {
        error: {
          code: "session_graph_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "session_graph_failed",
        message: formatErrorMessage(error),
      },
    },
    500,
  );
}

function resolveSessionGraphDb(options: SessionGraphRouteOptions, hasInjectedLoader: boolean): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedLoader) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireSessionGraphDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for GET /brain/session/:sessionId/graph.");
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
