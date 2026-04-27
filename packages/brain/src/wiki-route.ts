import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import {
  artifacts,
  claimEdges,
  claims,
  claimVersions,
  moves,
  sessions,
  sources,
  sourceSpans,
  wikiPages,
} from "./db/schema.ts";
import { flattenIssues } from "./schema.ts";

export const WikiRouteRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
  })
  .strict();

export type WikiRouteRequest = z.infer<typeof WikiRouteRequestSchema>;
export type WikiRouteInput = WikiRouteRequest & { sessionId: string };

type SessionRow = typeof sessions.$inferSelect;
type ClaimRow = typeof claims.$inferSelect;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = typeof claimEdges.$inferSelect;
type MoveRow = typeof moves.$inferSelect;
type ArtifactRow = typeof artifacts.$inferSelect;
type SourceSpanRow = typeof sourceSpans.$inferSelect;

export type WikiCompileState = {
  session: SessionRow;
  claims: ClaimRow[];
  claimVersions: ClaimVersionRow[];
  edges: EdgeRow[];
  moves: MoveRow[];
  artifacts: ArtifactRow[];
  sourceSpans: SourceSpanRow[];
};

export type CompiledWikiContent = {
  kind: "session_wiki";
  sourceOfTruth: "claims_claim_versions_edges_moves_artifacts_source_spans";
  editPolicy: "compiled_view_only";
  generatedFrom: {
    sessionId: string;
    claimIds: string[];
    claimVersionIds: string[];
    edgeIds: string[];
    moveIds: string[];
    artifactIds: string[];
    sourceSpanIds: string[];
  };
  sections: Array<{
    heading: string;
    items: unknown[];
  }>;
};

type WikiDraft = {
  title: string;
  slug: string;
  summary: string;
  content: CompiledWikiContent;
};

type PersistedWikiPageSlice = {
  id: string;
  sessionId: string;
  title: string;
  slug: string;
  summary: string;
  content: CompiledWikiContent;
  createdAt: string;
};

type PersistedWikiMove = {
  id: string;
  kind: "wiki_page_compiled";
  summary: string;
  claimIds: string[];
  edgeIds: string[];
  artifactIds: string[];
  wikiPageId: string;
};

export type PersistedWikiPage = {
  wikiPage: PersistedWikiPageSlice;
  move: PersistedWikiMove;
};

export type WikiRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  compileWiki?: (input: WikiRouteInput, options: { db?: PennyDatabase }) => Promise<PersistedWikiPage>;
};

type WikiTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];

export async function handleSessionWikiRequest(
  request: Request,
  sessionId: string,
  options: WikiRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /brain/session/:sessionId/wiki requires the POST method.");
  }

  const sessionIdResult = z.string().uuid().safeParse(sessionId);

  if (!sessionIdResult.success) {
    return jsonResponse(
      {
        error: {
          code: "invalid_session_id",
          message: "Wiki compilation requires a valid session id.",
          issues: flattenIssues(sessionIdResult.error),
        },
      },
      400,
    );
  }

  const parsed = await parseJsonRequest(request, WikiRouteRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const db = resolveWikiDb(options, Boolean(options.compileWiki));
  const compileWiki =
    options.compileWiki ??
    ((input: WikiRouteInput, compileOptions: { db?: PennyDatabase }) =>
      persistSessionWiki(requireWikiDb(compileOptions.db), input));

  try {
    return jsonResponse(
      {
        data: await compileWiki(
          {
            sessionId: sessionIdResult.data,
            ...parsed.data,
          },
          dbOption(db),
        ),
      },
      201,
    );
  } catch (error) {
    return wikiErrorResponse(error);
  }
}

export class WikiNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikiNotFoundError";
  }
}

export class WikiConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikiConflictError";
  }
}

export async function persistSessionWiki(db: PennyDatabase, input: WikiRouteInput): Promise<PersistedWikiPage> {
  return db.transaction(async (tx) => {
    const state = await loadWikiCompileState(tx, input.sessionId);
    const draft = compileWikiPage(state, input);
    const [wikiPage] = await tx
      .insert(wikiPages)
      .values({
        sessionId: state.session.id,
        title: draft.title,
        slug: draft.slug,
        summary: draft.summary,
        content: draft.content,
      })
      .returning();

    if (!wikiPage) {
      throw new WikiConflictError("Failed to persist WikiPage.");
    }

    const [move] = await tx
      .insert(moves)
      .values({
        sessionId: state.session.id,
        kind: "wiki_page_compiled",
        summary: `Compiled WikiPage "${draft.title}" from persisted Brain state.`,
        payload: {
          wikiPageId: wikiPage.id,
          claimIds: draft.content.generatedFrom.claimIds,
          claimVersionIds: draft.content.generatedFrom.claimVersionIds,
          edgeIds: draft.content.generatedFrom.edgeIds,
          sourceMoveIds: draft.content.generatedFrom.moveIds,
          artifactIds: draft.content.generatedFrom.artifactIds,
          sourceSpanIds: draft.content.generatedFrom.sourceSpanIds,
          editPolicy: draft.content.editPolicy,
        },
      })
      .returning();

    if (!move) {
      throw new WikiConflictError("Failed to record WikiPage compilation move.");
    }

    return {
      wikiPage: {
        id: wikiPage.id,
        sessionId: wikiPage.sessionId,
        title: wikiPage.title,
        slug: wikiPage.slug,
        summary: wikiPage.summary,
        content: wikiPage.content as CompiledWikiContent,
        createdAt: wikiPage.createdAt.toISOString(),
      },
      move: {
        id: move.id,
        kind: "wiki_page_compiled",
        summary: move.summary,
        claimIds: draft.content.generatedFrom.claimIds,
        edgeIds: draft.content.generatedFrom.edgeIds,
        artifactIds: draft.content.generatedFrom.artifactIds,
        wikiPageId: wikiPage.id,
      },
    };
  });
}

export function compileWikiPage(state: WikiCompileState, input: WikiRouteInput): WikiDraft {
  if (state.claims.length === 0) {
    throw new WikiConflictError("Cannot compile a WikiPage for a session without claims.");
  }

  const currentVersions = currentVersionsByClaimId(state.claimVersions);
  const claimItems = state.claims.map((claim) => {
    const currentVersion = currentVersions.get(claim.id);
    const spanIds = sourceSpanIdsForClaim(state.sourceSpans, claim.id, currentVersion?.id);

    return {
      claimId: claim.id,
      kind: claim.kind,
      status: currentVersion?.status ?? claim.status,
      confidence: currentVersion?.confidence ?? claim.confidence,
      currentVersionId: currentVersion?.id ?? null,
      text: currentVersion?.content ?? claim.text,
      sourceSpanIds: spanIds,
    };
  });
  const dependencyItems = state.edges.map((edge) => ({
    edgeId: edge.id,
    kind: edge.kind,
    status: edge.status,
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    label: edge.label,
  }));
  const moveItems = state.moves.map((move) => ({
    moveId: move.id,
    kind: move.kind,
    summary: move.summary,
    createdAt: move.createdAt.toISOString(),
  }));
  const artifactItems = state.artifacts.map((artifact) => ({
    artifactId: artifact.id,
    kind: artifact.kind,
    title: artifact.title,
    summary: artifact.summary,
    createdAt: artifact.createdAt.toISOString(),
  }));
  const provenanceItems = state.sourceSpans.map((span) => ({
    sourceSpanId: span.id,
    sourceId: span.sourceId,
    claimId: span.claimId,
    claimVersionId: span.claimVersionId,
    label: span.label,
    startOffset: span.startOffset,
    endOffset: span.endOffset,
  }));
  const title = input.title ?? `Wiki: ${state.session.title ?? shortId(state.session.id)}`;
  const slug = input.slug ?? `session-${shortId(state.session.id)}-wiki`;
  const summary = `${state.claims.length} claims, ${state.edges.length} edges, ${state.moves.length} moves, ${state.artifacts.length} artifacts, ${state.sourceSpans.length} source spans.`;
  const content: CompiledWikiContent = {
    kind: "session_wiki",
    sourceOfTruth: "claims_claim_versions_edges_moves_artifacts_source_spans",
    editPolicy: "compiled_view_only",
    generatedFrom: {
      sessionId: state.session.id,
      claimIds: state.claims.map((claim) => claim.id),
      claimVersionIds: state.claimVersions.map((version) => version.id),
      edgeIds: state.edges.map((edge) => edge.id),
      moveIds: state.moves.map((move) => move.id),
      artifactIds: state.artifacts.map((artifact) => artifact.id),
      sourceSpanIds: state.sourceSpans.map((span) => span.id),
    },
    sections: [
      {
        heading: "Current Claims",
        items: claimItems,
      },
      {
        heading: "Edges",
        items: dependencyItems,
      },
      {
        heading: "Move History",
        items: moveItems,
      },
      {
        heading: "Artifacts",
        items: artifactItems,
      },
      {
        heading: "Source Spans",
        items: provenanceItems,
      },
    ],
  };

  return {
    title,
    slug,
    summary,
    content,
  };
}

async function loadWikiCompileState(tx: WikiTransaction, sessionId: string): Promise<WikiCompileState> {
  const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

  if (!session) {
    throw new WikiNotFoundError("Session was not found.");
  }

  const claimRows = await tx.select().from(claims).where(eq(claims.sessionId, sessionId)).orderBy(asc(claims.createdAt));

  if (claimRows.length === 0) {
    throw new WikiConflictError("Cannot compile a WikiPage for a session without claims.");
  }

  const claimIds = claimRows.map((claim) => claim.id);
  const versionRows = await tx
    .select()
    .from(claimVersions)
    .where(inArray(claimVersions.claimId, claimIds))
    .orderBy(asc(claimVersions.createdAt));
  const edgeRows = await tx
    .select()
    .from(claimEdges)
    .where(eq(claimEdges.sessionId, sessionId))
    .orderBy(asc(claimEdges.createdAt));
  const moveRows = await tx.select().from(moves).where(eq(moves.sessionId, sessionId)).orderBy(asc(moves.createdAt));
  const artifactRows = await tx
    .select()
    .from(artifacts)
    .where(eq(artifacts.sessionId, sessionId))
    .orderBy(asc(artifacts.createdAt));
  const sourceRows = await tx.select().from(sources).where(eq(sources.sessionId, sessionId)).orderBy(asc(sources.createdAt));
  const spanRows =
    sourceRows.length === 0
      ? []
      : await tx
          .select()
          .from(sourceSpans)
          .where(inArray(sourceSpans.sourceId, sourceRows.map((source) => source.id)))
          .orderBy(asc(sourceSpans.createdAt));

  return {
    session,
    claims: claimRows,
    claimVersions: versionRows,
    edges: edgeRows,
    moves: moveRows,
    artifacts: artifactRows,
    sourceSpans: spanRows,
  };
}

function currentVersionsByClaimId(versions: ClaimVersionRow[]): Map<string, ClaimVersionRow> {
  const currentVersions = new Map<string, ClaimVersionRow>();

  for (const version of versions) {
    if (version.isCurrent) {
      currentVersions.set(version.claimId, version);
    }
  }

  return currentVersions;
}

function sourceSpanIdsForClaim(sourceSpanRows: SourceSpanRow[], claimId: string, claimVersionId: string | undefined): string[] {
  return sourceSpanRows
    .filter((span) => span.claimId === claimId || Boolean(claimVersionId && span.claimVersionId === claimVersionId))
    .map((span) => span.id);
}

async function parseJsonRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<{ ok: true; data: z.infer<Schema> } | { ok: false; response: Response }> {
  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "invalid_json",
            message: bodyResult.message,
          },
        },
        400,
      ),
    };
  }

  const parsed = schema.safeParse(bodyResult.value);

  if (!parsed.success) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "invalid_request",
            message: "Wiki request is invalid.",
            issues: flattenIssues(parsed.error),
          },
        },
        400,
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

async function readJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  const text = await request.text();

  if (!text.trim()) {
    return { ok: true, value: {} };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }
}

function resolveWikiDb(options: WikiRouteOptions, hasInjectedCompileWiki: boolean): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedCompileWiki) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireWikiDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for POST /brain/session/:sessionId/wiki.");
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
    { Allow: "POST" },
  );
}

function wikiErrorResponse(error: unknown): Response {
  if (error instanceof WikiNotFoundError) {
    return jsonResponse(
      {
        error: {
          code: "wiki_not_found",
          message: error.message,
        },
      },
      404,
    );
  }

  if (error instanceof WikiConflictError) {
    return jsonResponse(
      {
        error: {
          code: "wiki_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "wiki_failed",
        message: error instanceof Error ? error.message : String(error),
      },
    },
    500,
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

function shortId(value: string): string {
  return value.slice(0, 8);
}
