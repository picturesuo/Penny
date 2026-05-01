import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainObjects, claimEdges, claims, claimVersions, focusStates, moves, nextMoveCandidates, sessions } from "./db/schema.ts";
import { scopeValues, type BrainScope, type OptionalBrainScope } from "./scope.ts";

const SessionCanvasPathSchema = z.string().uuid();

type SessionRow = OptionalBrainScope<typeof sessions.$inferSelect>;
type ClaimRow = OptionalBrainScope<typeof claims.$inferSelect>;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = OptionalBrainScope<typeof claimEdges.$inferSelect>;
type BrainObjectRow = OptionalBrainScope<typeof brainObjects.$inferSelect>;
type FocusStateRow = OptionalBrainScope<typeof focusStates.$inferSelect>;
type NextMoveCandidateRow = OptionalBrainScope<typeof nextMoveCandidates.$inferSelect>;
type MoveRow = OptionalBrainScope<typeof moves.$inferSelect>;

export type CanvasNodeKind = "claim" | "assumption" | "question" | "concept" | "artifact" | "source" | string;
export type CanvasNodeAction = "learn" | "check" | "verify" | "save" | "related";

export type CanvasNode = {
  id: string;
  kind: CanvasNodeKind;
  title: string;
  summary?: string | null;
  status?: string | null;
  confidence?: number | null;
  x?: number;
  y?: number;
  refs?: {
    claimId?: string | null;
    sourceId?: string | null;
    artifactId?: string | null;
  };
  actions?: CanvasNodeAction[];
};

export type CanvasEdge = {
  id: string;
  source: string;
  target: string;
  kind: string;
  label?: string | null;
};

export type SessionCanvasPayload = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  recommendedPath?: string[];
  selectedNodeId?: string;
};

export type SessionCanvasState = {
  session: SessionRow;
  claims: ClaimRow[];
  claimVersions: ClaimVersionRow[];
  edges: EdgeRow[];
  brainObjects: BrainObjectRow[];
  focusState?: FocusStateRow | null | undefined;
  nextMoveCandidates?: NextMoveCandidateRow[] | undefined;
  moves?: MoveRow[] | undefined;
};

export type SessionCanvasRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  loadSessionCanvas?: (sessionId: string, scope: BrainScope, options: { db?: PennyDatabase }) => Promise<SessionCanvasPayload>;
};

export async function handleSessionCanvasRequest(
  request: Request,
  sessionId: string,
  options: SessionCanvasRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/sessions/:sessionId/canvas requires the GET method.");
  }

  const parsedSessionId = SessionCanvasPathSchema.safeParse(sessionId);

  if (!parsedSessionId.success) {
    return jsonResponse(
      {
        error: {
          code: "invalid_session_id",
          message: "Session canvas requires a valid session id.",
        },
      },
      400,
    );
  }

  const db = resolveSessionCanvasDb(options, Boolean(options.loadSessionCanvas));
  const loadCanvas =
    options.loadSessionCanvas ??
    ((targetSessionId: string, scope: BrainScope, loadOptions: { db?: PennyDatabase }) =>
      loadSessionCanvas(requireSessionCanvasDb(loadOptions.db), targetSessionId, scope));

  try {
    return jsonResponse({ data: await loadCanvas(parsedSessionId.data, scopeFromRequest(request), dbOption(db)) }, 200);
  } catch (error) {
    return sessionCanvasErrorResponse(error);
  }
}

export class SessionCanvasNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionCanvasNotFoundError";
  }
}

export class SessionCanvasConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionCanvasConflictError";
  }
}

export async function loadSessionCanvas(
  db: PennyDatabase,
  sessionId: string,
  scope: BrainScope,
): Promise<SessionCanvasPayload> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), scopeCondition(sessions, scope)))
    .limit(1);

  if (!session) {
    throw new SessionCanvasNotFoundError("Session was not found in this scope.");
  }

  const claimRows = await db
    .select()
    .from(claims)
    .where(and(eq(claims.sessionId, session.id), scopeCondition(claims, scope)))
    .orderBy(asc(claims.createdAt));
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
    .where(and(eq(claimEdges.sessionId, session.id), scopeCondition(claimEdges, scope)))
    .orderBy(asc(claimEdges.createdAt));
  const objectRows = await db
    .select()
    .from(brainObjects)
    .where(and(eq(brainObjects.sessionId, session.id), scopeCondition(brainObjects, scope)))
    .orderBy(asc(brainObjects.createdAt));
  const [focusState] = await db
    .select()
    .from(focusStates)
    .where(and(eq(focusStates.sessionId, session.id), scopeCondition(focusStates, scope)))
    .limit(1);
  const candidateRows = await db
    .select()
    .from(nextMoveCandidates)
    .where(and(eq(nextMoveCandidates.sessionId, session.id), scopeCondition(nextMoveCandidates, scope)))
    .orderBy(desc(nextMoveCandidates.selected), asc(nextMoveCandidates.rank), asc(nextMoveCandidates.createdAt));
  const moveRows = await db
    .select()
    .from(moves)
    .where(and(eq(moves.sessionId, session.id), scopeCondition(moves, scope)))
    .orderBy(desc(moves.createdAt))
    .limit(12);

  return buildSessionCanvas({
    session,
    claims: claimRows,
    claimVersions: versionRows,
    edges: edgeRows,
    brainObjects: objectRows,
    focusState,
    nextMoveCandidates: candidateRows,
    moves: moveRows,
  });
}

export function buildSessionCanvas(state: SessionCanvasState): SessionCanvasPayload {
  const currentVersions = currentVersionMap(state.claimVersions);
  const claimNodes = state.claims.map((claim, index) => {
    const version = currentVersions.get(claim.id);

    if (!version) {
      throw new SessionCanvasConflictError(`Claim ${claim.id} has no current ClaimVersion.`);
    }

    return claimCanvasNode(claim, version, index);
  });
  const claimNodeIds = new Set(claimNodes.map((node) => node.id));
  const objectNodes = state.brainObjects.map((object, index) => brainObjectCanvasNode(object, claimNodes.length + index));
  const nodes = [...claimNodes, ...objectNodes];
  const edges = state.edges
    .map((edge) => claimCanvasEdge(edge))
    .filter((edge) => claimNodeIds.has(edge.source) && claimNodeIds.has(edge.target));
  const recommendedPath = recommendedPathFor(state, claimNodeIds);
  const selectedNodeId =
    claimNodeId(state.focusState?.focusedClaimId) ??
    recommendedPath[0] ??
    claimNodes[0]?.id;

  return {
    nodes,
    edges,
    ...(recommendedPath.length > 0 ? { recommendedPath } : {}),
    ...(selectedNodeId ? { selectedNodeId } : {}),
  };
}

function claimCanvasNode(claim: ClaimRow, version: ClaimVersionRow, index: number): CanvasNode {
  return {
    id: claimNodeId(claim.id),
    kind: claim.kind,
    title: titleForClaimKind(claim.kind),
    summary: version.content,
    status: version.status,
    confidence: version.confidence,
    refs: {
      claimId: claim.id,
      sourceId: version.sourceId ?? claim.sourceId,
    },
    actions: actionsForClaimKind(claim.kind),
    ...gridPosition(index),
  };
}

function brainObjectCanvasNode(object: BrainObjectRow, index: number): CanvasNode {
  return {
    id: `brain_object:${object.id}`,
    kind: object.objectType,
    title: object.title,
    summary: object.summary ?? clipText(object.body, 220),
    status: "saved",
    refs: {},
    actions: ["learn", "save", "related"],
    ...gridPosition(index),
  };
}

function claimCanvasEdge(edge: EdgeRow): CanvasEdge {
  return {
    id: `edge:${edge.id}`,
    source: claimNodeId(edge.fromClaimId),
    target: claimNodeId(edge.toClaimId),
    kind: edge.kind,
    label: edge.label ?? edge.kind,
  };
}

function recommendedPathFor(state: SessionCanvasState, claimNodeIds: Set<string>): string[] {
  const candidateClaimIds = (state.nextMoveCandidates ?? []).flatMap((candidate) => [
    candidate.targetClaimId,
    ...stringArray(asRecord(candidate.provenance).claimIds),
  ]);
  const moveClaimIds = (state.moves ?? [])
    .filter((move) => move.kind === "autopilot_suggested" || move.kind === "next_move_recomputed")
    .flatMap((move) => [
      ...stringArray(asRecord(move.payload).claimIds),
      stringValue(asRecord(move.payload).targetClaimId),
      ...candidateScoreClaimIds(asRecord(move.payload).candidateScores),
    ]);
  const path = uniqueStrings([...candidateClaimIds, ...moveClaimIds])
    .map(claimNodeId)
    .filter((id): id is string => typeof id === "string" && claimNodeIds.has(id));

  return path.slice(0, 6);
}

function candidateScoreClaimIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => stringValue(asRecord(item).targetClaimId) ?? []);
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

function actionsForClaimKind(kind: ClaimRow["kind"]): CanvasNodeAction[] {
  if (kind === "concept") {
    return ["learn", "save", "related"];
  }

  if (kind === "question") {
    return ["learn", "verify", "related"];
  }

  return ["check", "verify", "learn", "related"];
}

function titleForClaimKind(kind: ClaimRow["kind"]): string {
  if (kind === "belief") {
    return "Claim";
  }

  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function gridPosition(index: number): { x: number; y: number } {
  const column = index % 4;
  const row = Math.floor(index / 4);
  const laneOffset = row % 2 === 0 ? 0 : 96;

  return {
    x: 92 + column * 270 + laneOffset,
    y: 90 + row * 190 + (column % 2) * 34,
  };
}

function claimNodeId(claimId: string): string;
function claimNodeId(claimId: string | null | undefined): string | undefined;
function claimNodeId(claimId: string | null | undefined): string | undefined {
  return claimId ? `claim:${claimId}` : undefined;
}

function scopeFromRequest(request: Request): BrainScope {
  return scopeValues({
    userId: firstPresentHeader(request, ["x-user-id", "x-penny-user-id"]) ?? null,
    workspaceId: firstPresentHeader(request, ["x-workspace-id", "x-penny-workspace-id"]) ?? null,
    projectId: firstPresentHeader(request, ["x-project-id", "x-penny-project-id"]) ?? null,
    sphereId: firstPresentHeader(request, ["x-sphere-id", "x-penny-sphere-id"]) ?? null,
  });
}

type ScopeTable = {
  userId: AnyPgColumn;
  workspaceId: AnyPgColumn;
  projectId: AnyPgColumn;
  sphereId: AnyPgColumn;
};

function scopeCondition(table: ScopeTable, scope: BrainScope) {
  return and(
    scopeColumnCondition(table.userId, scope.userId),
    scopeColumnCondition(table.workspaceId, scope.workspaceId),
    scopeColumnCondition(table.projectId, scope.projectId),
    scopeColumnCondition(table.sphereId, scope.sphereId),
  );
}

function scopeColumnCondition(column: AnyPgColumn, value: string | null) {
  return value === null ? isNull(column) : eq(column, value);
}

function firstPresentHeader(request: Request, names: string[]): string | undefined {
  for (const name of names) {
    const value = request.headers.get(name)?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function resolveSessionCanvasDb(options: SessionCanvasRouteOptions, optional = false): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (optional) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireSessionCanvasDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required to load the session canvas.");
  }

  return db;
}

function dbOption(db: PennyDatabase | undefined): { db?: PennyDatabase } {
  return db ? { db } : {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function clipText(value: string, maxLength: number): string {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function sessionCanvasErrorResponse(error: unknown): Response {
  if (error instanceof SessionCanvasNotFoundError) {
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

  if (error instanceof SessionCanvasConflictError) {
    return jsonResponse(
      {
        error: {
          code: "session_canvas_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "session_canvas_failed",
        message: error instanceof Error ? error.message : "Failed to load session canvas.",
      },
    },
    500,
  );
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
    { allow: "GET" },
  );
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}
