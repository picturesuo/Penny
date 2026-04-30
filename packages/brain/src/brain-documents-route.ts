import { asc, desc, inArray } from "drizzle-orm";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { artifacts, claimEdges, claims, claimVersions, moves, sessions, sources } from "./db/schema.ts";
import { scopeValues, type BrainScope, type OptionalBrainScope } from "./scope.ts";

type SessionRow = OptionalBrainScope<typeof sessions.$inferSelect>;
type SourceRow = OptionalBrainScope<typeof sources.$inferSelect>;
type ClaimRow = OptionalBrainScope<typeof claims.$inferSelect>;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = OptionalBrainScope<typeof claimEdges.$inferSelect>;
type MoveRow = OptionalBrainScope<typeof moves.$inferSelect>;
type ArtifactRow = OptionalBrainScope<typeof artifacts.$inferSelect>;

export type BrainDocumentsState = {
  sessions: SessionRow[];
  sources: SourceRow[];
  claims: ClaimRow[];
  claimVersions: ClaimVersionRow[];
  edges: EdgeRow[];
  moves: MoveRow[];
  artifacts: ArtifactRow[];
};

export type BrainDocumentClaim = {
  id: string;
  kind: ClaimRow["kind"];
  status: ClaimVersionRow["status"];
  text: string;
  confidence: number;
  versionId: string;
  createdAt: string;
};

export type BrainDocumentSummary = {
  id: string;
  sessionId: string;
  scope: BrainScope;
  title: string;
  status: SessionRow["status"];
  originalIdea: string | null;
  mainClaim: BrainDocumentClaim | null;
  confidence: number | null;
  strongestOptions: BrainDocumentClaim[];
  rejectedOptions: BrainDocumentClaim[];
  todoLaterIdeas: string[];
  finalRecommendations: string[];
  nextActions: string[];
  counts: {
    claims: number;
    edges: number;
    moves: number;
    artifacts: number;
    versions: number;
  };
  latestArtifact: {
    id: string;
    kind: ArtifactRow["kind"];
    title: string;
    summary: string;
    createdAt: string;
  } | null;
  lastMove: {
    id: string;
    kind: MoveRow["kind"];
    summary: string;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type BrainDocumentGraphNode = {
  id: string;
  type: "document" | "claim" | "risk" | "concept";
  label: string;
  sessionId: string;
  confidence: number | null;
  status: string;
};

export type BrainDocumentGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "contains" | "depends_on" | "challenges" | "teaches" | "relates_to";
  label: string | null;
  sessionId: string;
};

export type BrainDocumentsPayload = {
  sourceOfTruth: "sessions_sources_claims_claim_versions_edges_moves_artifacts";
  documents: BrainDocumentSummary[];
  graph: {
    nodes: BrainDocumentGraphNode[];
    edges: BrainDocumentGraphEdge[];
  };
  meta: {
    documentCount: number;
    claimCount: number;
    edgeCount: number;
  };
};

export type BrainDocumentsRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  loadDocuments?: (options: { db?: PennyDatabase }) => Promise<BrainDocumentsPayload>;
};

export async function handleBrainDocumentsRequest(
  request: Request,
  options: BrainDocumentsRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/brain/documents requires the GET method.");
  }

  const db = resolveDocumentsDb(options, Boolean(options.loadDocuments));
  const loadDocuments =
    options.loadDocuments ??
    ((loadOptions: { db?: PennyDatabase }) => loadBrainDocuments(requireDocumentsDb(loadOptions.db)));

  try {
    return jsonResponse({ data: await loadDocuments(dbOption(db)) }, 200);
  } catch (error) {
    return jsonResponse(
      {
        error: {
          code: "brain_documents_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      },
      500,
    );
  }
}

export async function loadBrainDocuments(db: PennyDatabase): Promise<BrainDocumentsPayload> {
  const sessionRows = await db.select().from(sessions).orderBy(desc(sessions.createdAt)).limit(80);
  const sessionIds = sessionRows.map((session) => session.id);

  if (sessionIds.length === 0) {
    return buildBrainDocuments({
      sessions: [],
      sources: [],
      claims: [],
      claimVersions: [],
      edges: [],
      moves: [],
      artifacts: [],
    });
  }

  const [sourceRows, claimRows, edgeRows, moveRows, artifactRows] = await Promise.all([
    db.select().from(sources).where(inArray(sources.sessionId, sessionIds)).orderBy(asc(sources.createdAt)),
    db.select().from(claims).where(inArray(claims.sessionId, sessionIds)).orderBy(asc(claims.createdAt)),
    db.select().from(claimEdges).where(inArray(claimEdges.sessionId, sessionIds)).orderBy(asc(claimEdges.createdAt)),
    db.select().from(moves).where(inArray(moves.sessionId, sessionIds)).orderBy(asc(moves.createdAt)),
    db.select().from(artifacts).where(inArray(artifacts.sessionId, sessionIds)).orderBy(asc(artifacts.createdAt)),
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

  return buildBrainDocuments({
    sessions: sessionRows,
    sources: sourceRows,
    claims: claimRows,
    claimVersions: versionRows,
    edges: edgeRows,
    moves: moveRows,
    artifacts: artifactRows,
  });
}

export function buildBrainDocuments(state: BrainDocumentsState): BrainDocumentsPayload {
  const currentVersions = currentVersionsByClaimId(state.claimVersions);
  const claimSlices = state.claims.flatMap((claim) => {
    const currentVersion = currentVersions.get(claim.id);

    return currentVersion ? [claimSlice(claim, currentVersion)] : [];
  });
  const claimsBySessionId = groupBy(claimSlices, (claim) => claim.sessionId);
  const edgesBySessionId = groupBy(state.edges, (edge) => edge.sessionId);
  const movesBySessionId = groupBy(state.moves, (move) => move.sessionId);
  const sourcesBySessionId = groupBy(state.sources, (source) => source.sessionId);
  const artifactsBySessionId = groupBy(state.artifacts, (artifact) => artifact.sessionId);
  const documents = state.sessions
    .map((session) => {
      const sessionClaims = claimsBySessionId.get(session.id) ?? [];
      const sessionEdges = edgesBySessionId.get(session.id) ?? [];
      const sessionMoves = movesBySessionId.get(session.id) ?? [];
      const sessionSources = sourcesBySessionId.get(session.id) ?? [];
      const sessionArtifacts = artifactsBySessionId.get(session.id) ?? [];
      return documentSummary(session, {
        claims: sessionClaims,
        edges: sessionEdges,
        moves: sessionMoves,
        sources: sessionSources,
        artifacts: sessionArtifacts,
        versionCount: state.claimVersions.filter((version) => sessionClaims.some((claim) => claim.id === version.claimId)).length,
      });
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  return {
    sourceOfTruth: "sessions_sources_claims_claim_versions_edges_moves_artifacts",
    documents,
    graph: documentGraph(documents),
    meta: {
      documentCount: documents.length,
      claimCount: claimSlices.length,
      edgeCount: state.edges.length,
    },
  };
}

function documentSummary(
  session: SessionRow,
  state: {
    claims: Array<BrainDocumentClaim & { sessionId: string }>;
    edges: EdgeRow[];
    moves: MoveRow[];
    sources: SourceRow[];
    artifacts: ArtifactRow[];
    versionCount: number;
  },
): BrainDocumentSummary {
  const originalIdea = state.sources.find((source) => source.kind === "raw_idea")?.rawText ?? state.sources[0]?.rawText ?? null;
  const mainClaim = selectMainClaim(state.claims);
  const latestArtifact = latestRow(state.artifacts);
  const lastMove = latestRow(state.moves);
  const updatedAt = latestDate([
    session.createdAt,
    session.endedAt,
    ...state.moves.map((move) => move.createdAt),
    ...state.artifacts.map((artifact) => artifact.createdAt),
    ...state.claims.map((claim) => new Date(claim.createdAt)),
  ]);
  const artifactPayload = latestArtifact ? objectRecord(latestArtifact.payload) : {};
  const title = session.title?.trim() || mainClaim?.text || originalIdea || "Untitled doc";

  return {
    id: session.id,
    sessionId: session.id,
    scope: scopeValues(session),
    title,
    status: session.status,
    originalIdea,
    mainClaim,
    confidence: mainClaim?.confidence ?? null,
    strongestOptions: strongestOptions(state.claims, mainClaim?.id ?? null),
    rejectedOptions: rejectedOptions(state.claims),
    todoLaterIdeas: todoLaterIdeas(state.claims, state.edges),
    finalRecommendations: finalRecommendations(artifactPayload, state.claims),
    nextActions: nextActions(artifactPayload, state.claims, state.edges),
    counts: {
      claims: state.claims.length,
      edges: state.edges.length,
      moves: state.moves.length,
      artifacts: state.artifacts.length,
      versions: state.versionCount,
    },
    latestArtifact: latestArtifact
      ? {
          id: latestArtifact.id,
          kind: latestArtifact.kind,
          title: latestArtifact.title,
          summary: latestArtifact.summary,
          createdAt: latestArtifact.createdAt.toISOString(),
        }
      : null,
    lastMove: lastMove
      ? {
          id: lastMove.id,
          kind: lastMove.kind,
          summary: lastMove.summary,
          createdAt: lastMove.createdAt.toISOString(),
        }
      : null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function claimSlice(claim: ClaimRow, version: ClaimVersionRow): BrainDocumentClaim & { sessionId: string } {
  return {
    id: claim.id,
    sessionId: claim.sessionId,
    kind: claim.kind,
    status: version.status,
    text: version.content,
    confidence: version.confidence,
    versionId: version.id,
    createdAt: claim.createdAt.toISOString(),
  };
}

function selectMainClaim(claimsForSession: Array<BrainDocumentClaim & { sessionId: string }>): BrainDocumentClaim | null {
  return (
    claimsForSession.find((claim) => claim.kind === "belief" && claim.status !== "rejected") ??
    claimsForSession.find((claim) => claim.status !== "rejected") ??
    claimsForSession[0] ??
    null
  );
}

function strongestOptions(
  claimsForSession: Array<BrainDocumentClaim & { sessionId: string }>,
  mainClaimId: string | null,
): BrainDocumentClaim[] {
  return claimsForSession
    .filter(
      (claim) =>
        claim.id !== mainClaimId &&
        claim.status !== "rejected" &&
        claim.kind !== "concept" &&
        claim.confidence >= 50,
    )
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5)
    .map(stripSessionId);
}

function rejectedOptions(claimsForSession: Array<BrainDocumentClaim & { sessionId: string }>): BrainDocumentClaim[] {
  return claimsForSession
    .filter((claim) => claim.status === "rejected")
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5)
    .map(stripSessionId);
}

function todoLaterIdeas(
  claimsForSession: Array<BrainDocumentClaim & { sessionId: string }>,
  edgesForSession: EdgeRow[],
): string[] {
  const challengedClaimIds = new Set(edgesForSession.filter((edge) => edge.kind === "challenges").map((edge) => edge.toClaimId));
  const lowConfidenceAssumptions = claimsForSession
    .filter((claim) => claim.kind === "assumption" && claim.status === "exploratory")
    .sort((left, right) => left.confidence - right.confidence)
    .map((claim) => `Revisit: ${claim.text}`);
  const openChallenges = claimsForSession
    .filter((claim) => challengedClaimIds.has(claim.id))
    .map((claim) => `Resolve challenge around: ${claim.text}`);

  return uniqueStrings([...openChallenges, ...lowConfidenceAssumptions]).slice(0, 5);
}

function finalRecommendations(
  artifactPayload: Record<string, unknown>,
  claimsForSession: Array<BrainDocumentClaim & { sessionId: string }>,
): string[] {
  const briefRecommendation = challengeBriefRecommendedNextMove(artifactPayload);

  if (briefRecommendation) {
    return [briefRecommendation];
  }

  const mainClaim = selectMainClaim(claimsForSession);

  return mainClaim ? [`Carry forward: ${mainClaim.text}`] : [];
}

function nextActions(
  artifactPayload: Record<string, unknown>,
  claimsForSession: Array<BrainDocumentClaim & { sessionId: string }>,
  edgesForSession: EdgeRow[],
): string[] {
  const briefNextAction = challengeBriefExpectedCompletion(artifactPayload);

  if (briefNextAction) {
    return [briefNextAction];
  }

  const openChallenge = edgesForSession.find((edge) => edge.kind === "challenges" && edge.status === "active");

  if (openChallenge) {
    const target = claimsForSession.find((claim) => claim.id === openChallenge.toClaimId);

    return [`Send to Check: ${target?.text ?? "open challenge"}`];
  }

  const weakestAssumption = claimsForSession
    .filter((claim) => claim.kind === "assumption")
    .sort((left, right) => left.confidence - right.confidence)[0];

  return weakestAssumption ? [`Verify assumption: ${weakestAssumption.text}`] : [];
}

function documentGraph(documents: BrainDocumentSummary[]): BrainDocumentsPayload["graph"] {
  const nodes: BrainDocumentGraphNode[] = [];
  const edges: BrainDocumentGraphEdge[] = [];

  for (const document of documents.slice(0, 24)) {
    const documentNodeId = `document:${document.id}`;
    nodes.push({
      id: documentNodeId,
      type: "document",
      label: document.title,
      sessionId: document.sessionId,
      confidence: document.confidence,
      status: document.status,
    });

    if (document.mainClaim) {
      const claimNodeId = `claim:${document.mainClaim.id}`;
      nodes.push({
        id: claimNodeId,
        type: document.mainClaim.kind === "concept" ? "concept" : "claim",
        label: document.mainClaim.text,
        sessionId: document.sessionId,
        confidence: document.mainClaim.confidence,
        status: document.mainClaim.status,
      });
      edges.push({
        id: `document-main:${document.id}:${document.mainClaim.id}`,
        source: documentNodeId,
        target: claimNodeId,
        kind: "contains",
        label: "main claim",
        sessionId: document.sessionId,
      });
    }

    for (const option of document.strongestOptions.slice(0, 2)) {
      const optionNodeId = `claim:${option.id}`;
      nodes.push({
        id: optionNodeId,
        type: option.kind === "concept" ? "concept" : "claim",
        label: option.text,
        sessionId: document.sessionId,
        confidence: option.confidence,
        status: option.status,
      });
      edges.push({
        id: `document-option:${document.id}:${option.id}`,
        source: documentNodeId,
        target: optionNodeId,
        kind: option.kind === "assumption" ? "depends_on" : "relates_to",
        label: option.kind,
        sessionId: document.sessionId,
      });
    }
  }

  return {
    nodes: uniqueBy(nodes, (node) => node.id),
    edges: uniqueBy(edges, (edge) => edge.id),
  };
}

function challengeBriefRecommendedNextMove(payload: Record<string, unknown>): string | null {
  const sections = objectRecord(payload.sections);
  const recommended = objectRecord(sections.recommendedNextMove);
  const why = stringValue(recommended.why);

  if (why) {
    return why;
  }

  return null;
}

function challengeBriefExpectedCompletion(payload: Record<string, unknown>): string | null {
  const sections = objectRecord(payload.sections);
  const recommended = objectRecord(sections.recommendedNextMove);
  const action = stringValue(recommended.action);
  const why = stringValue(recommended.why);

  if (action && why) {
    return `${formatLooseLabel(action)}: ${why}`;
  }

  return action ? formatLooseLabel(action) : null;
}

function stripSessionId(claim: BrainDocumentClaim & { sessionId: string }): BrainDocumentClaim {
  const { sessionId: _sessionId, ...rest } = claim;

  return rest;
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

function groupBy<Row, Key>(rows: Row[], keyFor: (row: Row) => Key): Map<Key, Row[]> {
  const grouped = new Map<Key, Row[]>();

  for (const row of rows) {
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

function latestRow<Row extends { createdAt: Date }>(rows: Row[]): Row | null {
  return [...rows].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
}

function latestDate(values: Array<Date | null>): Date {
  return (
    values
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? new Date(0)
  );
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => Boolean(value.trim())))];
}

function uniqueBy<T>(values: T[], keyFor: (value: T) => string): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const value of values) {
    const key = keyFor(value);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(value);
  }

  return unique;
}

function formatLooseLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resolveDocumentsDb(options: BrainDocumentsRouteOptions, hasInjectedLoader: boolean): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedLoader) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireDocumentsDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for GET /api/brain/documents.");
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
