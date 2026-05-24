import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { defaultBrainMemoryService, type BrainMemoryRouteService } from "./brain-memory-route.ts";
import {
  artifacts,
  brainObjects,
  brainRecents,
  claimEdges,
  claims,
  claimVersions,
  moves,
  sessionNotes,
  sessions,
  sources,
} from "./db/schema.ts";
import { LearnSessionOutputSchema, learnRecentInputFromSessionOutput } from "./learn-session-output.ts";
import { emitPennyLog } from "./observability.ts";
import { scopeValues, type BrainScope, type OptionalBrainScope } from "./scope.ts";
import { loadScopedSourcesForSessionIds } from "./source-loading.ts";

const UuidSchema = z.string().uuid();
const JsonObjectSchema = z.record(z.string(), z.unknown());
const SaveObjectBodySchema = z
  .object({
    recentId: UuidSchema.optional(),
    sessionId: UuidSchema.nullable().optional(),
    objectType: z.string().trim().min(1).max(80).optional(),
    title: z.string().trim().min(1).max(180).optional(),
    summary: z.string().trim().max(1_000).nullable().optional(),
    content: z.string().max(50_000).optional(),
    body: z.string().max(50_000).optional(),
    payload: JsonObjectSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.recentId && !textValue(value.content ?? value.body)) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: "Saving a Brain object requires recentId or content.",
      });
    }
  });
const RecentBodySchema = z
  .object({
    rawIdea: z.string().trim().min(1).max(10_000).optional(),
    kind: z.string().trim().min(1).max(80).optional(),
    title: z.string().trim().min(1).max(180).optional(),
    summary: z.string().trim().max(1_000).nullable().optional(),
    content: z.string().trim().min(1).max(50_000).optional(),
    sessionId: UuidSchema.nullable().optional(),
    payload: JsonObjectSchema.optional(),
    learnOutput: LearnSessionOutputSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.learnOutput && !textValue(value.rawIdea ?? value.content)) {
      context.addIssue({
        code: "custom",
        path: ["rawIdea"],
        message: "A recent item requires rawIdea, content, or learnOutput.",
      });
    }
  });
const RecentStatusBodySchema = z
  .object({
    status: z.enum(["active", "archived"]),
  })
  .strict();
const NoteBodySchema = z
  .object({
    content: z.string().max(50_000),
  })
  .strict();

type SessionRow = OptionalBrainScope<typeof sessions.$inferSelect>;
type SourceRow = OptionalBrainScope<typeof sources.$inferSelect>;
type ClaimRow = OptionalBrainScope<typeof claims.$inferSelect>;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = OptionalBrainScope<typeof claimEdges.$inferSelect>;
type MoveRow = OptionalBrainScope<typeof moves.$inferSelect>;
type ArtifactRow = OptionalBrainScope<typeof artifacts.$inferSelect>;
type BrainObjectRow = OptionalBrainScope<typeof brainObjects.$inferSelect>;
type BrainRecentRow = OptionalBrainScope<typeof brainRecents.$inferSelect>;
type SessionNoteRow = OptionalBrainScope<typeof sessionNotes.$inferSelect>;
type MemoryBrainObjectsStore = {
  objects: BrainObjectDto[];
  recents: BrainRecentDto[];
  notes: BrainSessionNoteDto[];
};
type BrainObjectMemoryService = Pick<BrainMemoryRouteService, "importSource">;
type ScopeColumn = AnyPgColumn;
type ScopeTable = {
  userId: ScopeColumn;
  workspaceId: ScopeColumn;
  projectId: ScopeColumn;
  sphereId: ScopeColumn;
};

export type BrainObjectRefs = {
  claimIds: string[];
  claimVersionIds: string[];
  edgeIds: string[];
  sourceIds: string[];
  moveIds: string[];
  artifactIds: string[];
};

export type BrainObjectDto = {
  id: string;
  objectType: string;
  backing: { table: string; id: string } | null;
  scope: BrainScope;
  sessionId: string | null;
  parentId: string | null;
  title: string;
  summary: string | null;
  preview: string | null;
  status: string | null;
  createdAt: string;
  updatedAt: string;
  refs: BrainObjectRefs;
};

export type BrainRecentDto = {
  id: string;
  scope: BrainScope;
  sessionId: string | null;
  kind: string;
  title: string;
  summary: string | null;
  status?: "active" | "archived";
  rawIdea: string;
  content: string;
  payload: Record<string, unknown>;
  archivedAt?: string | null;
  archiveExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BrainSessionNoteDto = {
  id: string;
  scope: BrainScope;
  sessionId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type BrainObjectsPayload = {
  sourceOfTruth: "sessions_sources_claims_claim_versions_claim_edges_moves_artifacts_brain_objects_session_notes";
  objects: BrainObjectDto[];
  meta: {
    objectCount: number;
    sessionCount: number;
    savedObjectCount: number;
    noteCount: number;
  };
};

export type BrainRecentsPayload = {
  recents: BrainRecentDto[];
  archived?: BrainRecentDto[];
};

export type SaveBrainObjectInput = {
  scope: BrainScope;
  recentId?: string | undefined;
  sessionId?: string | null | undefined;
  objectType?: string | undefined;
  title?: string | undefined;
  summary?: string | null | undefined;
  content?: string | undefined;
  body?: string | undefined;
  payload?: Record<string, unknown> | undefined;
};

export type CreateBrainRecentInput = {
  scope: BrainScope;
  rawIdea?: string | undefined;
  kind?: string | undefined;
  title?: string | undefined;
  summary?: string | null | undefined;
  content?: string | undefined;
  sessionId?: string | null | undefined;
  payload?: Record<string, unknown> | undefined;
};

export type UpdateBrainRecentStatusInput = {
  scope: BrainScope;
  recentId: string;
  status: "active" | "archived";
};

export type SaveSessionNoteInput = {
  scope: BrainScope;
  sessionId: string;
  content: string;
};

export type BrainObjectsRouteService = {
  listObjects(scope: BrainScope): Promise<BrainObjectsPayload>;
  saveObject(input: SaveBrainObjectInput): Promise<BrainObjectDto>;
  listRecents(scope: BrainScope): Promise<BrainRecentsPayload>;
  createRecent(input: CreateBrainRecentInput): Promise<{ recent: BrainRecentDto; recents: BrainRecentDto[] }>;
  updateRecentStatus?(input: UpdateBrainRecentStatusInput): Promise<BrainRecentsPayload>;
  getSessionNote(scope: BrainScope, sessionId: string): Promise<BrainSessionNoteDto | null>;
  saveSessionNote(input: SaveSessionNoteInput): Promise<BrainSessionNoteDto>;
};

export type BrainObjectsRouteOptions = {
  service?: BrainObjectsRouteService;
  memoryService?: BrainObjectMemoryService | null;
  syncSavedObjectsToMemory?: boolean;
  db?: PennyDatabase;
  databaseUrl?: string;
};

export type SavedBrainObjectMemoryImport = {
  status: "queued" | "running" | "completed" | "failed";
  jobId: string;
  sourceId: string | null;
  sourceLabel: string | null;
  memoryNodeCount: number;
};

const memoryBrainObjectsStores = new Map<string, MemoryBrainObjectsStore>();

export async function handleBrainObjectsRequest(
  request: Request,
  options: BrainObjectsRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/brain/objects requires the GET method.", "GET");
  }

  try {
    const service = resolveService(options);
    return jsonResponse({ data: await service.listObjects(scopeFromRequest(request)) });
  } catch (error) {
    return routeErrorResponse(error, "brain_objects_failed");
  }
}

export async function handleSaveBrainObjectRequest(
  request: Request,
  options: BrainObjectsRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/brain/objects/save requires the POST method.", "POST");
  }

  const parsed = await parseJsonRequest(request, SaveObjectBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = resolveService(options);
    const object = await service.saveObject({ scope: scopeFromRequest(request), ...parsed.data });
    const memoryImport = await syncSavedBrainObjectToMemory(object, request, options);

    return jsonResponse({ data: { object, ...(memoryImport ? { memoryImport } : {}) } }, 201);
  } catch (error) {
    return routeErrorResponse(error, "brain_object_save_failed");
  }
}

export async function handleBrainRecentsRequest(
  request: Request,
  options: BrainObjectsRouteOptions = {},
): Promise<Response> {
  const service = resolveService(options);
  const scope = scopeFromRequest(request);

  if (request.method === "GET") {
    try {
      return jsonResponse({ data: await service.listRecents(scope) });
    } catch (error) {
      return routeErrorResponse(error, "brain_recents_failed");
    }
  }

  if (request.method === "POST") {
    const parsed = await parseJsonRequest(request, RecentBodySchema);
    if (!parsed.ok) {
      return parsed.response;
    }

    try {
      return jsonResponse({ data: await service.createRecent(createRecentInputFromBody(scope, parsed.data)) }, 201);
    } catch (error) {
      return routeErrorResponse(error, "brain_recent_save_failed");
    }
  }

  return methodNotAllowed("GET or POST /api/brain/recents requires GET or POST.", "GET, POST");
}

export async function handleBrainRecentRequest(
  request: Request,
  recentId: string,
  options: BrainObjectsRouteOptions = {},
): Promise<Response> {
  const recentIdResult = UuidSchema.safeParse(recentId);
  if (!recentIdResult.success) {
    return invalidRequest("Brain recent updates require a recent id.", ["recentId: Invalid uuid"]);
  }

  if (request.method !== "PATCH") {
    return methodNotAllowed("PATCH /api/brain/recents/:recentId requires PATCH.", "PATCH");
  }

  const parsed = await parseJsonRequest(request, RecentStatusBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = resolveService(options);
    if (!service.updateRecentStatus) {
      return methodNotAllowed("PATCH /api/brain/recents/:recentId is not available.", "GET, POST");
    }

    return jsonResponse({
      data: await service.updateRecentStatus({
        scope: scopeFromRequest(request),
        recentId: recentIdResult.data,
        status: parsed.data.status,
      }),
    });
  } catch (error) {
    return routeErrorResponse(error, "brain_recent_update_failed");
  }
}

export async function handleSessionNotesRequest(
  request: Request,
  sessionId: string,
  options: BrainObjectsRouteOptions = {},
): Promise<Response> {
  const sessionIdResult = UuidSchema.safeParse(sessionId);
  if (!sessionIdResult.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId path parameter must be a UUID."]);
  }

  const service = resolveService(options);
  const scope = scopeFromRequest(request);

  if (request.method === "GET") {
    try {
      return jsonResponse({ data: { note: await service.getSessionNote(scope, sessionIdResult.data) } });
    } catch (error) {
      return routeErrorResponse(error, "session_note_failed");
    }
  }

  if (request.method === "POST" || request.method === "PUT") {
    const parsed = await parseJsonRequest(request, NoteBodySchema);
    if (!parsed.ok) {
      return parsed.response;
    }

    try {
      return jsonResponse({
        data: {
          note: await service.saveSessionNote({
            scope,
            sessionId: sessionIdResult.data,
            content: parsed.data.content,
          }),
        },
      });
    } catch (error) {
      return routeErrorResponse(error, "session_note_save_failed");
    }
  }

  return methodNotAllowed("GET, POST, or PUT /api/sessions/:sessionId/notes requires GET, POST, or PUT.", "GET, POST, PUT");
}

export async function loadBrainObjects(db: PennyDatabase, scope: BrainScope): Promise<BrainObjectsPayload> {
  const sessionRows = await db
    .select()
    .from(sessions)
    .where(scopeCondition(sessions, scope))
    .orderBy(desc(sessions.createdAt))
    .limit(80);
  const sessionIds = sessionRows.map((session) => session.id);
  const [sourceRows, claimRows, edgeRows, moveRows, artifactRows, savedObjectRows, noteRows] = await Promise.all([
    loadScopedSourcesForSessionIds(db, sessionIds, scope),
    sessionIds.length > 0
      ? db
          .select()
          .from(claims)
          .where(and(inArray(claims.sessionId, sessionIds), scopeCondition(claims, scope)))
          .orderBy(asc(claims.createdAt))
      : [],
    sessionIds.length > 0
      ? db
          .select()
          .from(claimEdges)
          .where(and(inArray(claimEdges.sessionId, sessionIds), scopeCondition(claimEdges, scope)))
          .orderBy(asc(claimEdges.createdAt))
      : [],
    sessionIds.length > 0
      ? db
          .select()
          .from(moves)
          .where(and(inArray(moves.sessionId, sessionIds), scopeCondition(moves, scope)))
          .orderBy(asc(moves.createdAt))
      : [],
    sessionIds.length > 0
      ? db
          .select()
          .from(artifacts)
          .where(and(inArray(artifacts.sessionId, sessionIds), scopeCondition(artifacts, scope)))
          .orderBy(asc(artifacts.createdAt))
      : [],
    db.select().from(brainObjects).where(scopeCondition(brainObjects, scope)).orderBy(desc(brainObjects.updatedAt)).limit(80),
    sessionIds.length > 0
      ? db
          .select()
          .from(sessionNotes)
          .where(and(inArray(sessionNotes.sessionId, sessionIds), scopeCondition(sessionNotes, scope)))
          .orderBy(desc(sessionNotes.updatedAt))
      : [],
  ]);
  const claimIds = claimRows.map((claim) => claim.id);
  const versionRows =
    claimIds.length > 0
      ? await db
          .select()
          .from(claimVersions)
          .where(inArray(claimVersions.claimId, claimIds))
          .orderBy(asc(claimVersions.createdAt))
      : [];

  return buildBrainObjects({
    scope,
    sessions: sessionRows,
    sources: sourceRows,
    claims: claimRows,
    claimVersions: versionRows,
    edges: edgeRows,
    moves: moveRows,
    artifacts: artifactRows,
    brainObjects: savedObjectRows,
    notes: noteRows,
  });
}

export function buildBrainObjects(state: {
  scope: BrainScope;
  sessions: SessionRow[];
  sources: SourceRow[];
  claims: ClaimRow[];
  claimVersions: ClaimVersionRow[];
  edges: EdgeRow[];
  moves: MoveRow[];
  artifacts: ArtifactRow[];
  brainObjects: BrainObjectRow[];
  notes: SessionNoteRow[];
}): BrainObjectsPayload {
  const currentVersions = currentVersionsByClaimId(state.claimVersions);
  const sourcesBySessionId = groupBy(state.sources, (source) => source.sessionId);
  const movesBySessionId = groupBy(state.moves, (move) => move.sessionId);
  const edgesByClaimId = groupEdgesByClaimId(state.edges);
  const objects: BrainObjectDto[] = [];

  for (const session of state.sessions) {
    const sessionSources = sourcesBySessionId.get(session.id) ?? [];
    const sessionMoves = movesBySessionId.get(session.id) ?? [];
    const originalSource = sessionSources.find((source) => source.kind === "raw_idea") ?? sessionSources[0] ?? null;
    const title = session.title?.trim() || clipText(originalSource?.rawText ?? "Dropped idea", 120);

    objects.push({
      id: `session:${session.id}`,
      objectType: "dropped_idea",
      backing: { table: "sessions", id: session.id },
      scope: scopeValues(session),
      sessionId: session.id,
      parentId: null,
      title,
      summary: originalSource ? clipText(originalSource.rawText, 240) : null,
      preview: originalSource?.rawText ?? null,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      updatedAt: latestDate([session.createdAt, ...sessionMoves.map((move) => move.createdAt)]).toISOString(),
      refs: refs({ sourceIds: sessionSources.map((source) => source.id), moveIds: sessionMoves.map((move) => move.id) }),
    });
  }

  for (const source of state.sources) {
    objects.push({
      id: `source:${source.id}`,
      objectType: "source",
      backing: { table: "sources", id: source.id },
      scope: scopeValues(source),
      sessionId: source.sessionId,
      parentId: `session:${source.sessionId}`,
      title: source.kind === "raw_idea" ? "Original idea" : formatLabel(source.kind),
      summary: clipText(source.rawText, 240),
      preview: source.rawText,
      status: null,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.createdAt.toISOString(),
      refs: refs({ sourceIds: [source.id] }),
    });
  }

  for (const claim of state.claims) {
    const version = currentVersions.get(claim.id);
    if (!version) {
      continue;
    }

    const claimEdgesForClaim = edgesByClaimId.get(claim.id) ?? [];
    objects.push({
      id: `claim:${claim.id}`,
      objectType: "claim",
      backing: { table: "claims", id: claim.id },
      scope: scopeValues(claim),
      sessionId: claim.sessionId,
      parentId: `session:${claim.sessionId}`,
      title: formatLabel(claim.kind),
      summary: clipText(version.content, 240),
      preview: version.content,
      status: version.status,
      createdAt: claim.createdAt.toISOString(),
      updatedAt: version.createdAt.toISOString(),
      refs: refs({
        claimIds: [claim.id],
        claimVersionIds: [version.id],
        edgeIds: claimEdgesForClaim.map((edge) => edge.id),
        sourceIds: [claim.sourceId, version.sourceId].filter(isString),
      }),
    });
  }

  for (const artifact of state.artifacts) {
    objects.push({
      id: `artifact:${artifact.id}`,
      objectType: "artifact",
      backing: { table: "artifacts", id: artifact.id },
      scope: scopeValues(artifact),
      sessionId: artifact.sessionId,
      parentId: `session:${artifact.sessionId}`,
      title: artifact.title,
      summary: artifact.summary,
      preview: artifact.summary,
      status: artifact.kind,
      createdAt: artifact.createdAt.toISOString(),
      updatedAt: artifact.createdAt.toISOString(),
      refs: refs({ artifactIds: [artifact.id] }),
    });
  }

  for (const note of state.notes) {
    objects.push(noteObject(note));
  }

  for (const object of state.brainObjects) {
    objects.push(savedObject(object));
  }

  return {
    sourceOfTruth: "sessions_sources_claims_claim_versions_claim_edges_moves_artifacts_brain_objects_session_notes",
    objects: objects.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    meta: {
      objectCount: objects.length,
      sessionCount: state.sessions.length,
      savedObjectCount: state.brainObjects.length,
      noteCount: state.notes.length,
    },
  };
}

export async function saveBrainObject(db: PennyDatabase, input: SaveBrainObjectInput): Promise<BrainObjectDto> {
  return db.transaction(async (tx) => {
    const recent = input.recentId ? await requireRecent(tx, input.scope, input.recentId) : null;
    const sessionId = input.sessionId ?? recent?.sessionId ?? null;

    if (sessionId) {
      await requireScopedSession(tx, input.scope, sessionId);
    }

    const body = textValue(input.content ?? input.body ?? recent?.body);
    if (!body) {
      throw new BrainObjectsValidationError("Saving a Brain object requires content.");
    }

    const title = input.title?.trim() || recent?.title || clipText(body, 120);
    const objectType = input.objectType?.trim() || (recent?.kind === "raw_idea" ? "saved_idea" : recent?.kind) || "learn_output";
    const [row] = await tx
      .insert(brainObjects)
      .values({
        ...input.scope,
        sessionId,
        sourceRecentId: recent?.id ?? input.recentId ?? null,
        objectType,
        title,
        summary: input.summary ?? recent?.summary ?? null,
        body,
        payload: input.payload ?? asRecord(recent?.payload),
      })
      .returning();

    if (!row) {
      throw new BrainObjectsConflictError("Failed to save Brain object.");
    }

    return savedObject(row);
  });
}

export async function loadBrainRecents(db: PennyDatabase, scope: BrainScope): Promise<BrainRecentsPayload> {
  await deleteExpiredArchivedRecents(db, scope);

  const rows = await db
    .select()
    .from(brainRecents)
    .where(scopeCondition(brainRecents, scope))
    .orderBy(desc(brainRecents.updatedAt))
    .limit(60);
  const recents = rows.map(recentDto);

  return {
    recents: recents.filter((recent) => recent.status !== "archived").slice(0, 20),
    archived: recents.filter((recent) => recent.status === "archived").slice(0, 20),
  };
}

export async function createBrainRecent(
  db: PennyDatabase,
  input: CreateBrainRecentInput,
): Promise<{ recent: BrainRecentDto; recents: BrainRecentDto[] }> {
  if (input.sessionId) {
    await requireScopedSession(db, input.scope, input.sessionId);
  }

  const body = textValue(input.rawIdea ?? input.content);
  if (!body) {
    throw new BrainObjectsValidationError("A recent item requires rawIdea or content.");
  }

  const kind = input.kind?.trim() || (input.rawIdea ? "raw_idea" : "learn_output");
  const [row] = await db
    .insert(brainRecents)
    .values({
      ...input.scope,
      sessionId: input.sessionId ?? null,
      kind,
      title: input.title?.trim() || clipText(body, 120),
      summary: input.summary ?? null,
      body,
      payload: input.payload ?? {},
    })
    .returning();

  if (!row) {
    throw new BrainObjectsConflictError("Failed to save recent item.");
  }

  const recents = await loadBrainRecents(db, input.scope);
  return {
    recent: recentDto(row),
    recents: recents.recents,
  };
}

export async function updateBrainRecentStatus(
  db: PennyDatabase,
  input: UpdateBrainRecentStatusInput,
): Promise<BrainRecentsPayload> {
  const [existing] = await db
    .select()
    .from(brainRecents)
    .where(and(eq(brainRecents.id, input.recentId), scopeCondition(brainRecents, input.scope)))
    .limit(1);

  if (!existing) {
    throw new BrainObjectsNotFoundError("Brain recent was not found.");
  }

  const payload = asRecord(existing.payload);
  const nextPayload =
    input.status === "archived"
      ? {
          ...payload,
          status: "archived",
          archivedAt: new Date().toISOString(),
        }
      : activeRecentPayload(payload);

  await db
    .update(brainRecents)
    .set({
      payload: nextPayload,
      updatedAt: new Date(),
    })
    .where(and(eq(brainRecents.id, input.recentId), scopeCondition(brainRecents, input.scope)));

  return loadBrainRecents(db, input.scope);
}

export async function getSessionNote(
  db: PennyDatabase,
  scope: BrainScope,
  sessionId: string,
): Promise<BrainSessionNoteDto | null> {
  await requireScopedSession(db, scope, sessionId);
  const [row] = await db
    .select()
    .from(sessionNotes)
    .where(and(eq(sessionNotes.sessionId, sessionId), scopeCondition(sessionNotes, scope)))
    .limit(1);

  return row ? noteDto(row) : null;
}

export async function saveSessionNote(db: PennyDatabase, input: SaveSessionNoteInput): Promise<BrainSessionNoteDto> {
  await requireScopedSession(db, input.scope, input.sessionId);
  const updatedAt = new Date();
  const [row] = await db
    .insert(sessionNotes)
    .values({
      ...input.scope,
      sessionId: input.sessionId,
      content: input.content,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: sessionNotes.sessionId,
      set: {
        ...input.scope,
        content: input.content,
        updatedAt,
      },
    })
    .returning();

  if (!row) {
    throw new BrainObjectsConflictError("Failed to save session note.");
  }

  return noteDto(row);
}

export class BrainObjectsNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainObjectsNotFoundError";
  }
}

export class BrainObjectsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainObjectsValidationError";
  }
}

export class BrainObjectsConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainObjectsConflictError";
  }
}

function createRecentInputFromBody(scope: BrainScope, body: z.infer<typeof RecentBodySchema>): CreateBrainRecentInput {
  if (!body.learnOutput) {
    return {
      scope,
      rawIdea: body.rawIdea,
      kind: body.kind,
      title: body.title,
      summary: body.summary,
      content: body.content,
      sessionId: body.sessionId,
      payload: body.payload,
    };
  }

  const learnRecent = learnRecentInputFromSessionOutput(body.learnOutput);

  return {
    scope,
    kind: body.kind ?? learnRecent.kind,
    title: body.title ?? learnRecent.title,
    summary: body.summary ?? learnRecent.summary,
    content: body.content ?? body.rawIdea ?? learnRecent.content,
    sessionId: body.sessionId ?? learnRecent.sessionId,
    payload: {
      ...learnRecent.payload,
      ...asRecord(body.payload),
    },
  };
}

function resolveService(options: BrainObjectsRouteOptions): BrainObjectsRouteService {
  if (options.service) {
    return options.service;
  }

  if (!options.db && !resolvedDatabaseUrl(options.databaseUrl)) {
    return memoryBrainObjectsService();
  }

  const db = options.db ?? createPennyDb(options.databaseUrl);
  return {
    listObjects: (scope) => loadBrainObjects(db, scope),
    saveObject: (input) => saveBrainObject(db, input),
    listRecents: (scope) => loadBrainRecents(db, scope),
    createRecent: (input) => createBrainRecent(db, input),
    updateRecentStatus: (input) => updateBrainRecentStatus(db, input),
    getSessionNote: (scope, sessionId) => getSessionNote(db, scope, sessionId),
    saveSessionNote: (input) => saveSessionNote(db, input),
  };
}

async function syncSavedBrainObjectToMemory(
  object: BrainObjectDto,
  request: Request,
  options: BrainObjectsRouteOptions,
): Promise<SavedBrainObjectMemoryImport | null> {
  const memoryService = resolveMemoryService(options);
  const content = textValue(object.preview ?? object.summary ?? object.title);

  if (!memoryService || !content) {
    return null;
  }

  const sourceLabel = savedBrainObjectMemoryLabel(object);

  try {
    const result = await memoryService.importSource(
      {
        kind: "text",
        label: sourceLabel,
        sourceUri: savedBrainObjectSourceUri(object),
        content,
        rawRetention: false,
        privacy: {
          visibility: "private_memory",
          trainingUse: false,
          rawRetention: false,
          source: "manual_import",
          allowedUses: ["private_memory", "create_retrieval"],
        },
      },
      request,
    );

    return {
      status: result.job.status,
      jobId: result.job.id,
      sourceId: result.job.sourceId,
      sourceLabel: result.job.sourceImport?.label ?? sourceLabel,
      memoryNodeCount: result.job.counts.memoryNodes,
    };
  } catch (error) {
    emitPennyLog(
      "brain.object_memory_sync",
      {
        status: "error",
        objectId: object.id,
        objectType: object.objectType,
      },
      { level: "error" },
    );

    return null;
  }
}

function resolveMemoryService(options: BrainObjectsRouteOptions): BrainObjectMemoryService | null {
  if (options.syncSavedObjectsToMemory === false) {
    return null;
  }

  if ("memoryService" in options) {
    return options.memoryService ?? null;
  }

  if (options.service) {
    return null;
  }

  return defaultBrainMemoryService;
}

function savedBrainObjectMemoryLabel(object: BrainObjectDto): string {
  if (object.objectType === "quick_note") {
    return `Quick note: ${clipText(object.title, 140)}`;
  }

  return `Saved Brain object: ${clipText(object.title, 140)}`;
}

function savedBrainObjectSourceUri(object: BrainObjectDto): string {
  if (object.backing) {
    return `penny://brain-objects/${encodeURIComponent(object.backing.table)}/${encodeURIComponent(object.backing.id)}`;
  }

  return `penny://brain-objects/${encodeURIComponent(object.id)}`;
}

function memoryBrainObjectsService(): BrainObjectsRouteService {
  return {
    async listObjects(scope) {
      const store = memoryStoreForScope(scope);
      const objects = [...store.objects, ...store.notes.map(memoryNoteObject)].sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      );

      return {
        sourceOfTruth: "sessions_sources_claims_claim_versions_claim_edges_moves_artifacts_brain_objects_session_notes",
        objects,
        meta: {
          objectCount: objects.length,
          sessionCount: 0,
          savedObjectCount: store.objects.length,
          noteCount: store.notes.length,
        },
      };
    },
    async saveObject(input) {
      const store = memoryStoreForScope(input.scope);
      const recent = input.recentId ? store.recents.find((candidate) => candidate.id === input.recentId) : null;

      if (input.recentId && !recent) {
        throw new BrainObjectsNotFoundError("Recent item was not found in this scope.");
      }

      const body = textValue(input.content ?? input.body ?? recent?.content);
      if (!body) {
        throw new BrainObjectsValidationError("Saving a Brain object requires content.");
      }

      const now = new Date().toISOString();
      const objectType = input.objectType?.trim() || (recent?.kind === "raw_idea" ? "saved_idea" : recent?.kind) || "learn_output";
      const sessionId = input.sessionId ?? recent?.sessionId ?? null;
      const object: BrainObjectDto = {
        id: `brain_object:${randomUUID()}`,
        objectType,
        backing: null,
        scope: input.scope,
        sessionId,
        parentId: sessionId ? `session:${sessionId}` : null,
        title: input.title?.trim() || recent?.title || clipText(body, 120),
        summary: input.summary ?? recent?.summary ?? null,
        preview: body,
        status: objectType,
        createdAt: now,
        updatedAt: now,
        refs: refs({}),
      };

      store.objects.unshift(object);
      return object;
    },
    async listRecents(scope) {
      return visibleMemoryRecents(memoryStoreForScope(scope));
    },
    async createRecent(input) {
      const store = memoryStoreForScope(input.scope);
      const body = textValue(input.rawIdea ?? input.content);
      if (!body) {
        throw new BrainObjectsValidationError("A recent item requires rawIdea or content.");
      }

      const now = new Date().toISOString();
      const recent: BrainRecentDto = {
        id: randomUUID(),
        scope: input.scope,
        sessionId: input.sessionId ?? null,
        kind: input.kind?.trim() || (input.rawIdea ? "raw_idea" : "learn_output"),
        title: input.title?.trim() || clipText(body, 120),
        summary: input.summary ?? null,
        status: "active",
        rawIdea: body,
        content: body,
        payload: input.payload ?? {},
        archivedAt: null,
        archiveExpiresAt: null,
        createdAt: now,
        updatedAt: now,
      };

      store.recents.unshift(recent);
      return { recent, ...visibleMemoryRecents(store) };
    },
    async updateRecentStatus(input) {
      const store = memoryStoreForScope(input.scope);
      const recent = store.recents.find((candidate) => candidate.id === input.recentId);

      if (!recent) {
        throw new BrainObjectsNotFoundError("Recent item was not found in this scope.");
      }

      const now = new Date().toISOString();
      recent.status = input.status;
      recent.updatedAt = now;
      recent.archivedAt = input.status === "archived" ? now : null;
      recent.archiveExpiresAt = input.status === "archived" ? archiveExpiryIso(now) : null;
      recent.payload = input.status === "archived" ? { ...recent.payload, status: "archived", archivedAt: now } : activeRecentPayload(recent.payload);

      return visibleMemoryRecents(store);
    },
    async getSessionNote(scope, sessionId) {
      return memoryStoreForScope(scope).notes.find((note) => note.sessionId === sessionId) ?? null;
    },
    async saveSessionNote(input) {
      const store = memoryStoreForScope(input.scope);
      const now = new Date().toISOString();
      const existing = store.notes.find((note) => note.sessionId === input.sessionId);

      if (existing) {
        existing.content = input.content;
        existing.updatedAt = now;
        return existing;
      }

      const note: BrainSessionNoteDto = {
        id: randomUUID(),
        scope: input.scope,
        sessionId: input.sessionId,
        content: input.content,
        createdAt: now,
        updatedAt: now,
      };
      store.notes.unshift(note);
      return note;
    },
  };
}

function memoryStoreForScope(scope: BrainScope): MemoryBrainObjectsStore {
  const key = JSON.stringify([scope.userId, scope.workspaceId, scope.projectId, scope.sphereId]);
  const existing = memoryBrainObjectsStores.get(key);

  if (existing) {
    return existing;
  }

  const store: MemoryBrainObjectsStore = { objects: [], recents: [], notes: [] };
  memoryBrainObjectsStores.set(key, store);
  return store;
}

function visibleMemoryRecents(store: MemoryBrainObjectsStore): BrainRecentsPayload {
  const sorted = [...store.recents].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  return {
    recents: sorted.filter((recent) => recent.status !== "archived").slice(0, 20),
    archived: sorted.filter((recent) => recent.status === "archived").slice(0, 20),
  };
}

function memoryNoteObject(note: BrainSessionNoteDto): BrainObjectDto {
  return {
    id: `session_note:${note.sessionId}`,
    objectType: "working_note",
    backing: null,
    scope: note.scope,
    sessionId: note.sessionId,
    parentId: `session:${note.sessionId}`,
    title: "Working notes",
    summary: clipText(note.content || "No notes saved.", 240),
    preview: note.content,
    status: "saved",
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    refs: refs({}),
  };
}

function resolvedDatabaseUrl(configured: string | undefined): string | null {
  const value = configured ?? process.env.DATABASE_URL;
  const databaseUrl = value?.trim();

  if (!databaseUrl || shouldUseLocalInMemoryBrainObjects(databaseUrl)) {
    return null;
  }

  return databaseUrl;
}

function shouldUseLocalInMemoryBrainObjects(databaseUrl: string | undefined): boolean {
  if (!databaseUrl || brainObjectsRuntimeKind() !== "dev-test") {
    return false;
  }

  const authMode = process.env.PENNY_AUTH_MODE?.trim().toLowerCase();
  return readEnvFlag("PENNY_SKIP_DATABASE_PREP", false) && (!authMode || authMode === "dev");
}

function brainObjectsRuntimeKind(): "dev-test" | "production" {
  return process.env.NODE_ENV === "production" ? "production" : "dev-test";
}

function readEnvFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  return fallback;
}

async function requireScopedSession(
  db: Pick<PennyDatabase, "select">,
  scope: BrainScope,
  sessionId: string,
): Promise<SessionRow> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), scopeCondition(sessions, scope)))
    .limit(1);

  if (!session) {
    throw new BrainObjectsNotFoundError("Session was not found in this scope.");
  }

  return session;
}

async function requireRecent(
  db: Pick<PennyDatabase, "select">,
  scope: BrainScope,
  recentId: string,
): Promise<BrainRecentRow> {
  const [recent] = await db
    .select()
    .from(brainRecents)
    .where(and(eq(brainRecents.id, recentId), scopeCondition(brainRecents, scope)))
    .limit(1);

  if (!recent) {
    throw new BrainObjectsNotFoundError("Recent item was not found in this scope.");
  }

  return recent;
}

function savedObject(row: BrainObjectRow): BrainObjectDto {
  return {
    id: `brain_object:${row.id}`,
    objectType: row.objectType,
    backing: { table: "brain_objects", id: row.id },
    scope: scopeValues(row),
    sessionId: row.sessionId,
    parentId: row.sessionId ? `session:${row.sessionId}` : null,
    title: row.title,
    summary: row.summary,
    preview: row.body,
    status: row.objectType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    refs: refs({}),
  };
}

function noteObject(row: SessionNoteRow): BrainObjectDto {
  return {
    id: `session_note:${row.sessionId}`,
    objectType: "working_note",
    backing: { table: "session_notes", id: row.id },
    scope: scopeValues(row),
    sessionId: row.sessionId,
    parentId: `session:${row.sessionId}`,
    title: "Working notes",
    summary: clipText(row.content || "No notes saved.", 240),
    preview: row.content,
    status: "saved",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    refs: refs({}),
  };
}

function recentDto(row: BrainRecentRow): BrainRecentDto {
  const payload = asRecord(row.payload);
  const status = payload.status === "archived" ? "archived" : "active";
  const archivedAt = typeof payload.archivedAt === "string" ? payload.archivedAt : null;

  return {
    id: row.id,
    scope: scopeValues(row),
    sessionId: row.sessionId,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    status,
    rawIdea: row.body,
    content: row.body,
    payload,
    archivedAt,
    archiveExpiresAt: archivedAt ? archiveExpiryIso(archivedAt) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function activeRecentPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const { status: _status, archivedAt: _archivedAt, ...rest } = payload;

  return rest;
}

async function deleteExpiredArchivedRecents(db: PennyDatabase, scope: BrainScope): Promise<void> {
  const archiveCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();

  await db
    .delete(brainRecents)
    .where(
      and(
        scopeCondition(brainRecents, scope),
        sql`${brainRecents.payload}->>'status' = 'archived'`,
        sql`${brainRecents.payload}->>'archivedAt' < ${archiveCutoff}`,
      ),
    );
}

function archiveExpiryIso(archivedAt: string): string | null {
  const archivedTime = Date.parse(archivedAt);

  if (!Number.isFinite(archivedTime)) {
    return null;
  }

  return new Date(archivedTime + 30 * 24 * 60 * 60 * 1_000).toISOString();
}

function noteDto(row: SessionNoteRow): BrainSessionNoteDto {
  return {
    id: row.id,
    scope: scopeValues(row),
    sessionId: row.sessionId,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function currentVersionsByClaimId(versions: ClaimVersionRow[]): Map<string, ClaimVersionRow> {
  const map = new Map<string, ClaimVersionRow>();

  for (const version of [...versions].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())) {
    if (version.isCurrent && !map.has(version.claimId)) {
      map.set(version.claimId, version);
    }
  }

  return map;
}

function groupEdgesByClaimId(edges: EdgeRow[]): Map<string, EdgeRow[]> {
  const grouped = new Map<string, EdgeRow[]>();

  for (const edge of edges) {
    appendGrouped(grouped, edge.fromClaimId, edge);
    appendGrouped(grouped, edge.toClaimId, edge);
  }

  return grouped;
}

function refs(values: Partial<BrainObjectRefs>): BrainObjectRefs {
  return {
    claimIds: uniqueStrings(values.claimIds ?? []),
    claimVersionIds: uniqueStrings(values.claimVersionIds ?? []),
    edgeIds: uniqueStrings(values.edgeIds ?? []),
    sourceIds: uniqueStrings(values.sourceIds ?? []),
    moveIds: uniqueStrings(values.moveIds ?? []),
    artifactIds: uniqueStrings(values.artifactIds ?? []),
  };
}

function scopeFromRequest(request: Request): BrainScope {
  return scopeValues({
    userId: firstPresentHeader(request, ["x-user-id", "x-penny-user-id"]) ?? null,
    workspaceId: firstPresentHeader(request, ["x-workspace-id", "x-penny-workspace-id"]) ?? null,
    projectId: firstPresentHeader(request, ["x-project-id", "x-penny-project-id"]) ?? null,
    sphereId: firstPresentHeader(request, ["x-sphere-id", "x-penny-sphere-id"]) ?? null,
  });
}

function scopeCondition(table: ScopeTable, scope: BrainScope) {
  return and(
    scopeColumnCondition(table.userId, scope.userId),
    scopeColumnCondition(table.workspaceId, scope.workspaceId),
    scopeColumnCondition(table.projectId, scope.projectId),
    scopeColumnCondition(table.sphereId, scope.sphereId),
  );
}

function scopeColumnCondition(column: ScopeColumn, value: string | null) {
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

async function parseJsonRequest<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  const text = await request.text();
  const raw = text.trim() ? safeJsonParse(text) : { ok: true as const, value: {} };

  if (!raw.ok) {
    return {
      ok: false,
      response: invalidRequest("Request body must be valid JSON.", [raw.message]),
    };
  }

  const parsed = schema.safeParse(raw.value);
  if (!parsed.success) {
    return {
      ok: false,
      response: invalidRequest(
        "Request body failed validation.",
        parsed.error.issues.map((issue) => {
          const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
          return `${path}${issue.message}`;
        }),
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function routeErrorResponse(error: unknown, code: string): Response {
  if (error instanceof BrainObjectsNotFoundError) {
    return jsonResponse({ error: { code: "brain_object_not_found", message: error.message } }, 404);
  }

  if (error instanceof BrainObjectsValidationError) {
    return jsonResponse({ error: { code: "brain_object_invalid", message: error.message } }, 400);
  }

  if (error instanceof BrainObjectsConflictError) {
    return jsonResponse({ error: { code: "brain_object_conflict", message: error.message } }, 409);
  }

  return jsonResponse(
    {
      error: {
        code,
        message: error instanceof Error ? error.message : String(error),
      },
    },
    500,
  );
}

function methodNotAllowed(message: string, allow: string): Response {
  return jsonResponse({ error: { code: "method_not_allowed", message } }, 405, { allow });
}

function invalidRequest(message: string, issues: string[]): Response {
  return jsonResponse({ error: { code: "invalid_request", message, issues } }, 400);
}

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function groupBy<Row, Key>(rows: Row[], keyFor: (row: Row) => Key): Map<Key, Row[]> {
  const grouped = new Map<Key, Row[]>();

  for (const row of rows) {
    appendGrouped(grouped, keyFor(row), row);
  }

  return grouped;
}

function appendGrouped<Key, Row>(grouped: Map<Key, Row[]>, key: Key, row: Row): void {
  const existing = grouped.get(key);
  if (existing) {
    existing.push(row);
    return;
  }

  grouped.set(key, [row]);
}

function latestDate(values: Date[]): Date {
  return [...values].sort((left, right) => right.getTime() - left.getTime())[0] ?? new Date(0);
}

function textValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function clipText(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}...` : trimmed;
}

function formatLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function uniqueStrings(values: ReadonlyArray<string | null | undefined>): string[] {
  return [...new Set(values.filter(isString))];
}

function isString(value: string | null | undefined): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
