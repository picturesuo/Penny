import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { PennyDatabase } from "./db/client.ts";
import {
  artifacts,
  brainObjects,
  brainRecents,
  claimEdges,
  claimVersions,
  claims,
  moves,
  sessionNotes,
  sessions,
  shapes,
  sources,
} from "./db/schema.ts";
import {
  cosineSimilarity,
  createEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingVector,
} from "./embedding-provider.ts";
import { scopeValues, type BrainScope, type BrainScopeInput } from "./scope.ts";

export type HybridSearchResultType = "brain_object" | "claim" | "note" | "recent" | "artifact" | "source";

export type HybridSearchResult = {
  id: string;
  type: HybridSearchResultType;
  title: string;
  text: string;
  score: number;
  scoreBreakdown?: {
    semantic?: number;
    lexical?: number;
    graph?: number;
    recency?: number;
  };
  sessionId?: string;
  projectId?: string;
  claimId?: string;
  objectId?: string;
  sourceId?: string;
};

export type HybridRetrievalMode = "learn" | "check" | "verify" | "autopilot";

export type HybridRetrievalRequest = {
  mode: HybridRetrievalMode;
  query: string;
  sessionId?: string | null;
  projectId?: string | null;
  currentClaimId?: string | null;
  scope?: BrainScopeInput | null;
  limit?: number;
};

export type HybridRetrievalContext = {
  sourceOfTruth: "brain_rows_hybrid_retrieval";
  mode: HybridRetrievalMode;
  query: string;
  planner: "graph_lexical_semantic_recency_scope";
  embeddingProvider: EmbeddingProvider["kind"];
  terminal1SemanticAvailable: boolean;
  results: readonly HybridSearchResult[];
  summary: string;
};

export type HybridRetrievalCandidate = HybridSearchResult & {
  updatedAt?: string | null;
  graphDistance?: number | null;
  tags?: readonly string[];
};

export type Terminal1SemanticSearch = (request: HybridRetrievalRequest & { limit: number }) => Promise<readonly HybridSearchResult[]>;

export type HybridRetrievalRepository = {
  scopedCandidates(request: HybridRetrievalRequest): Promise<readonly HybridRetrievalCandidate[]>;
  graphNeighbors?(request: HybridRetrievalRequest): Promise<readonly HybridRetrievalCandidate[]>;
  lexicalSearch?(request: HybridRetrievalRequest): Promise<readonly HybridSearchResult[]>;
  terminal1SemanticSearch?: Terminal1SemanticSearch;
};

export type HybridRetrievalOptions = {
  embeddingProvider?: EmbeddingProvider;
};

type SelectDb = Pick<PennyDatabase, "select">;
type ScopeColumn = AnyPgColumn;
type ScopeTable = {
  userId: ScopeColumn;
  workspaceId: ScopeColumn;
  projectId: ScopeColumn;
  sphereId: ScopeColumn;
};
type HybridRetrievalCandidateInput = {
  id: string;
  type: HybridSearchResultType;
  title: string;
  text: string;
  score?: number;
  scoreBreakdown?: HybridSearchResult["scoreBreakdown"];
  sessionId?: string | null | undefined;
  projectId?: string | null | undefined;
  claimId?: string | null | undefined;
  objectId?: string | null | undefined;
  sourceId?: string | null | undefined;
  updatedAt?: string | null | undefined;
  graphDistance?: number | null | undefined;
  tags?: readonly string[] | undefined;
};

export async function planHybridRetrieval(
  request: HybridRetrievalRequest,
  repository: HybridRetrievalRepository,
  options: HybridRetrievalOptions = {},
): Promise<HybridRetrievalContext> {
  const limit = clampLimit(request.limit);
  const embeddingProvider = options.embeddingProvider ?? createEmbeddingProvider();
  const terminal1SemanticAvailable = Boolean(repository.terminal1SemanticSearch);
  const [candidates, graphNeighbors, lexicalMatches, terminalSemanticMatches] = await Promise.all([
    repository.scopedCandidates(request),
    repository.graphNeighbors?.(request) ?? Promise.resolve([]),
    repository.lexicalSearch?.(request) ?? Promise.resolve([]),
    repository.terminal1SemanticSearch?.({ ...request, limit }) ?? Promise.resolve([]),
  ]);
  const localSemanticMatches =
    terminalSemanticMatches.length > 0 ? [] : await semanticMatches(request.query, candidates, embeddingProvider);
  const merged = mergeHybridMatches({
    request,
    limit,
    candidates,
    graphNeighbors,
    lexicalMatches: lexicalMatches.length > 0 ? lexicalMatches : lexicalMatchesFromCandidates(request.query, candidates),
    semanticMatches: terminalSemanticMatches.length > 0 ? terminalSemanticMatches : localSemanticMatches,
  });

  return {
    sourceOfTruth: "brain_rows_hybrid_retrieval",
    mode: request.mode,
    query: compactText(request.query),
    planner: "graph_lexical_semantic_recency_scope",
    embeddingProvider: embeddingProvider.kind,
    terminal1SemanticAvailable,
    results: merged,
    summary:
      merged.length === 0
        ? `No local Brain context found for ${request.mode}.`
        : `Retrieved ${merged.length} local Brain item${merged.length === 1 ? "" : "s"} for ${request.mode}.`,
  };
}

export async function loadHybridRetrievalContext(
  db: SelectDb,
  request: HybridRetrievalRequest,
  options: HybridRetrievalOptions = {},
): Promise<HybridRetrievalContext> {
  return planHybridRetrieval(request, createDbHybridRetrievalRepository(db), options);
}

export function createDbHybridRetrievalRepository(db: SelectDb): HybridRetrievalRepository {
  return {
    scopedCandidates(request) {
      return loadDbCandidates(db, request);
    },
    graphNeighbors(request) {
      return loadGraphNeighbors(db, request);
    },
  };
}

export function formatHybridRetrievalContext(context: HybridRetrievalContext | undefined): string {
  if (!context) {
    return "Local Brain retrieval: none.";
  }

  const rows = context.results.map((result, index) =>
    [
      `${index + 1}. [${result.type}] ${result.title}`,
      `score=${result.score.toFixed(3)}`,
      result.scoreBreakdown
        ? `breakdown=${[
            result.scoreBreakdown.semantic !== undefined ? `semantic:${result.scoreBreakdown.semantic.toFixed(3)}` : null,
            result.scoreBreakdown.lexical !== undefined ? `lexical:${result.scoreBreakdown.lexical.toFixed(3)}` : null,
            result.scoreBreakdown.graph !== undefined ? `graph:${result.scoreBreakdown.graph.toFixed(3)}` : null,
            result.scoreBreakdown.recency !== undefined ? `recency:${result.scoreBreakdown.recency.toFixed(3)}` : null,
          ]
            .filter(Boolean)
            .join(",")}`
        : null,
      result.claimId ? `claimId=${result.claimId}` : null,
      result.sourceId ? `sourceId=${result.sourceId}` : null,
      `text=${clipText(result.text, 420)}`,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" | "),
  );

  return [
    "Local Brain retrieval:",
    `- sourceOfTruth: ${context.sourceOfTruth}`,
    `- mode: ${context.mode}`,
    `- planner: ${context.planner}`,
    `- embeddingProvider: ${context.embeddingProvider}`,
    `- terminal1SemanticAvailable: ${context.terminal1SemanticAvailable}`,
    `- query: ${context.query}`,
    `- summary: ${context.summary}`,
    ...rows,
  ].join("\n");
}

function mergeHybridMatches(input: {
  request: HybridRetrievalRequest;
  limit: number;
  candidates: readonly HybridRetrievalCandidate[];
  graphNeighbors: readonly HybridRetrievalCandidate[];
  lexicalMatches: readonly HybridSearchResult[];
  semanticMatches: readonly HybridSearchResult[];
}): HybridSearchResult[] {
  const candidateMap = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const recencyScores = recencyScoreMap(input.candidates);
  const merged = new Map<string, HybridSearchResult>();
  const ensure = (result: HybridSearchResult): HybridSearchResult => {
    const base = merged.get(result.id) ?? normalizeResult(candidateMap.get(result.id) ?? result);

    merged.set(result.id, base);

    return base;
  };

  for (const candidate of input.candidates) {
    const result = ensure(candidate);
    const recency = recencyScores.get(candidate.id) ?? 0;

    result.scoreBreakdown = {
      ...result.scoreBreakdown,
      recency,
    };
  }

  for (const result of input.graphNeighbors) {
    const target = ensure(result);
    const graphScore = result.scoreBreakdown?.graph ?? graphScoreFor(candidateMap.get(result.id) ?? result, input.request);

    target.scoreBreakdown = {
      ...target.scoreBreakdown,
      graph: Math.max(target.scoreBreakdown?.graph ?? 0, graphScore),
    };
  }

  for (const result of input.lexicalMatches) {
    const target = ensure(result);

    target.scoreBreakdown = {
      ...target.scoreBreakdown,
      lexical: Math.max(target.scoreBreakdown?.lexical ?? 0, result.scoreBreakdown?.lexical ?? result.score),
    };
  }

  for (const result of input.semanticMatches) {
    const target = ensure(result);

    target.scoreBreakdown = {
      ...target.scoreBreakdown,
      semantic: Math.max(target.scoreBreakdown?.semantic ?? 0, result.scoreBreakdown?.semantic ?? result.score),
    };
  }

  return [...merged.values()]
    .map((result) => finalizeScore(result, input.request))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, input.limit);
}

async function semanticMatches(
  query: string,
  candidates: readonly HybridRetrievalCandidate[],
  embeddingProvider: EmbeddingProvider,
): Promise<HybridSearchResult[]> {
  if (candidates.length === 0) {
    return [];
  }

  const [queryVector, ...candidateVectors] = await embeddingProvider.embed([
    query,
    ...candidates.map((candidate) => `${candidate.title}\n${candidate.text}\n${candidate.tags?.join(" ") ?? ""}`),
  ]);

  return candidates.map((candidate, index) => {
    const semantic = cosineSimilarity(queryVector ?? [], candidateVectors[index] ?? []);

    return {
      ...normalizeResult(candidate),
      score: semantic,
      scoreBreakdown: {
        semantic,
      },
    };
  });
}

function lexicalMatchesFromCandidates(
  query: string,
  candidates: readonly HybridRetrievalCandidate[],
): HybridSearchResult[] {
  const queryTerms = termsFor(query);

  return candidates.map((candidate) => {
    const candidateTerms = termsFor(`${candidate.title} ${candidate.text} ${candidate.tags?.join(" ") ?? ""}`);
    const matched = queryTerms.filter((term) => candidateTerms.includes(term));
    const lexical = queryTerms.length === 0 ? 0 : matched.length / queryTerms.length;

    return {
      ...normalizeResult(candidate),
      score: roundScore(lexical),
      scoreBreakdown: {
        lexical: roundScore(lexical),
      },
    };
  });
}

function finalizeScore(result: HybridSearchResult, request: HybridRetrievalRequest): HybridSearchResult {
  const semantic = result.scoreBreakdown?.semantic ?? 0;
  const lexical = result.scoreBreakdown?.lexical ?? 0;
  const graph = Math.max(result.scoreBreakdown?.graph ?? 0, graphScoreFor(result, request));
  const recency = result.scoreBreakdown?.recency ?? 0;
  const score = roundScore(0.4 * semantic + 0.3 * lexical + 0.2 * graph + 0.1 * recency);

  return {
    ...result,
    score,
    scoreBreakdown: {
      semantic,
      lexical,
      graph,
      recency,
    },
  };
}

function normalizeResult(result: HybridSearchResult): HybridSearchResult {
  return {
    id: result.id,
    type: result.type,
    title: clipText(result.title, 160),
    text: clipText(result.text, 1_500),
    score: roundScore(result.score),
    ...(result.scoreBreakdown ? { scoreBreakdown: result.scoreBreakdown } : {}),
    ...(result.sessionId ? { sessionId: result.sessionId } : {}),
    ...(result.projectId ? { projectId: result.projectId } : {}),
    ...(result.claimId ? { claimId: result.claimId } : {}),
    ...(result.objectId ? { objectId: result.objectId } : {}),
    ...(result.sourceId ? { sourceId: result.sourceId } : {}),
  };
}

function graphScoreFor(result: Pick<HybridSearchResult, "sessionId" | "claimId">, request: HybridRetrievalRequest): number {
  let score = 0;

  if (request.sessionId && result.sessionId === request.sessionId) {
    score += 0.35;
  }

  if (request.currentClaimId && result.claimId === request.currentClaimId) {
    score += 0.55;
  }

  return Math.min(1, score);
}

function recencyScoreMap(candidates: readonly HybridRetrievalCandidate[]): Map<string, number> {
  const dated = candidates
    .map((candidate) => ({ candidate, time: candidate.updatedAt ? Date.parse(candidate.updatedAt) : Number.NaN }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((left, right) => right.time - left.time);
  const scores = new Map<string, number>();

  dated.forEach((entry, index) => {
    scores.set(entry.candidate.id, roundScore(1 - index / Math.max(1, dated.length - 1)));
  });

  return scores;
}

async function loadDbCandidates(db: SelectDb, request: HybridRetrievalRequest): Promise<HybridRetrievalCandidate[]> {
  const scope = request.scope ? scopeValues(request.scope) : null;
  const sessionRows = await loadRetrievalSessions(db, request, scope);
  const sessionIds = sessionRows.map((session) => session.id);

  if (sessionIds.length === 0) {
    return [];
  }

  const [sourceRows, claimRows, artifactRows, objectRows, recentRows, noteRows, shapeRows, moveRows] = await Promise.all([
    db.select().from(sources).where(and(inArray(sources.sessionId, sessionIds), scopedCondition(sources, scope))).orderBy(desc(sources.createdAt)).limit(60),
    db.select().from(claims).where(and(inArray(claims.sessionId, sessionIds), scopedCondition(claims, scope))).orderBy(desc(claims.createdAt)).limit(100),
    db.select().from(artifacts).where(and(inArray(artifacts.sessionId, sessionIds), scopedCondition(artifacts, scope))).orderBy(desc(artifacts.createdAt)).limit(40),
    db.select().from(brainObjects).where(and(inArray(brainObjects.sessionId, sessionIds), scopedCondition(brainObjects, scope))).orderBy(desc(brainObjects.updatedAt)).limit(80),
    db.select().from(brainRecents).where(and(inArray(brainRecents.sessionId, sessionIds), scopedCondition(brainRecents, scope))).orderBy(desc(brainRecents.updatedAt)).limit(80),
    db.select().from(sessionNotes).where(and(inArray(sessionNotes.sessionId, sessionIds), scopedCondition(sessionNotes, scope))).orderBy(desc(sessionNotes.updatedAt)).limit(40),
    db.select().from(shapes).where(and(inArray(shapes.sessionId, sessionIds), scopedCondition(shapes, scope))).orderBy(desc(shapes.createdAt)).limit(40),
    db.select().from(moves).where(and(inArray(moves.sessionId, sessionIds), scopedCondition(moves, scope))).orderBy(desc(moves.createdAt)).limit(60),
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
  const versionByClaimId = new Map(versionRows.map((version) => [version.claimId, version]));

  return [
    ...claimRows
      .map((claim) => {
        const version = versionByClaimId.get(claim.id);

        return version
          ? candidate({
              id: version.id,
              type: "claim",
              title: `${claim.kind}: ${clipText(version.content, 90)}`,
              text: version.content,
              sessionId: claim.sessionId,
              projectId: claim.projectId ?? undefined,
              claimId: claim.id,
              sourceId: version.sourceId ?? claim.sourceId ?? undefined,
              updatedAt: version.createdAt.toISOString(),
              tags: [claim.kind, version.status],
            })
          : null;
      })
      .filter((item): item is HybridRetrievalCandidate => Boolean(item)),
    ...sourceRows.map((source) =>
      candidate({
        id: source.id,
        type: "source",
        title: `${source.kind}: ${clipText(source.rawText, 90)}`,
        text: source.rawText,
        sessionId: source.sessionId,
        projectId: source.projectId ?? undefined,
        sourceId: source.id,
        updatedAt: source.createdAt.toISOString(),
        tags: [source.kind],
      }),
    ),
    ...artifactRows.map((artifact) =>
      candidate({
        id: artifact.id,
        type: "artifact",
        title: artifact.title,
        text: [artifact.summary, safePayloadText(artifact.payload)].filter(Boolean).join("\n"),
        sessionId: artifact.sessionId,
        projectId: artifact.projectId ?? undefined,
        updatedAt: artifact.createdAt.toISOString(),
        tags: [artifact.kind],
      }),
    ),
    ...objectRows.map((object) =>
      candidate({
        id: object.id,
        type: "brain_object",
        title: object.title,
        text: [object.summary, object.body, safePayloadText(object.payload)].filter(Boolean).join("\n"),
        sessionId: object.sessionId ?? undefined,
        projectId: object.projectId ?? undefined,
        objectId: object.id,
        claimId: firstPayloadString(object.payload, ["currentClaimId", "claimId"]) ?? undefined,
        updatedAt: object.updatedAt.toISOString(),
        tags: [object.objectType],
      }),
    ),
    ...recentRows.map((recent) =>
      candidate({
        id: recent.id,
        type: "recent",
        title: recent.title,
        text: [recent.summary, recent.body, safePayloadText(recent.payload)].filter(Boolean).join("\n"),
        sessionId: recent.sessionId ?? undefined,
        projectId: recent.projectId ?? undefined,
        claimId: firstPayloadString(recent.payload, ["currentClaimId", "claimId"]) ?? undefined,
        updatedAt: recent.updatedAt.toISOString(),
        tags: [recent.kind],
      }),
    ),
    ...noteRows.map((note) =>
      candidate({
        id: note.id,
        type: "note",
        title: "Session note",
        text: note.content,
        sessionId: note.sessionId,
        projectId: note.projectId ?? undefined,
        updatedAt: note.updatedAt.toISOString(),
        tags: ["session_note"],
      }),
    ),
    ...shapeRows.map((shape) =>
      candidate({
        id: shape.id,
        type: "note",
        title: `Shape: ${shape.label}`,
        text: [shape.description, safePayloadText(shape.payload)].filter(Boolean).join("\n"),
        sessionId: shape.sessionId,
        projectId: shape.projectId ?? undefined,
        updatedAt: shape.createdAt.toISOString(),
        tags: ["shape", shape.status, shape.key],
      }),
    ),
    ...moveRows.map((move) =>
      candidate({
        id: move.id,
        type: "note",
        title: `${move.kind}: ${clipText(move.summary, 90)}`,
        text: [move.summary, safePayloadText(move.payload)].filter(Boolean).join("\n"),
        sessionId: move.sessionId,
        projectId: move.projectId ?? undefined,
        claimId: firstPayloadString(move.payload, ["claimId", "targetClaimId", "focusedClaimId"]) ?? undefined,
        updatedAt: move.createdAt.toISOString(),
        tags: [move.kind],
      }),
    ),
  ];
}

async function loadGraphNeighbors(db: SelectDb, request: HybridRetrievalRequest): Promise<HybridRetrievalCandidate[]> {
  if (!request.currentClaimId) {
    return [];
  }

  const scope = request.scope ? scopeValues(request.scope) : null;
  const edgeRows = await db
    .select()
    .from(claimEdges)
    .where(
      and(
        or(eq(claimEdges.fromClaimId, request.currentClaimId), eq(claimEdges.toClaimId, request.currentClaimId)),
        scopedCondition(claimEdges, scope),
      ),
    )
    .limit(24);
  const neighborIds = [
    ...new Set(
      edgeRows
        .flatMap((edge) => [edge.fromClaimId, edge.toClaimId])
        .filter((claimId) => claimId !== request.currentClaimId),
    ),
  ];

  if (neighborIds.length === 0) {
    return [];
  }

  const [claimRows, versionRows] = await Promise.all([
    db.select().from(claims).where(and(inArray(claims.id, neighborIds), scopedCondition(claims, scope))),
    db
      .select()
      .from(claimVersions)
      .where(and(inArray(claimVersions.claimId, neighborIds), eq(claimVersions.isCurrent, true))),
  ]);
  const versionByClaimId = new Map(versionRows.map((version) => [version.claimId, version]));

  return claimRows
    .map((claim) => {
      const version = versionByClaimId.get(claim.id);

      return version
        ? candidate({
            id: version.id,
            type: "claim",
            title: `Neighbor ${claim.kind}: ${clipText(version.content, 90)}`,
            text: version.content,
            sessionId: claim.sessionId,
            projectId: claim.projectId ?? undefined,
            claimId: claim.id,
            sourceId: version.sourceId ?? claim.sourceId ?? undefined,
            updatedAt: version.createdAt.toISOString(),
            graphDistance: 1,
            scoreBreakdown: { graph: 1 },
            tags: ["graph_neighbor", claim.kind, version.status],
          })
        : null;
    })
    .filter((item): item is HybridRetrievalCandidate => Boolean(item));
}

async function loadRetrievalSessions(
  db: SelectDb,
  request: HybridRetrievalRequest,
  scope: BrainScope | null,
): Promise<Array<typeof sessions.$inferSelect>> {
  if (request.sessionId) {
    return db.select().from(sessions).where(and(eq(sessions.id, request.sessionId), scopedCondition(sessions, scope))).limit(1);
  }

  return db.select().from(sessions).where(scopedCondition(sessions, scope)).orderBy(desc(sessions.createdAt)).limit(12);
}

function candidate(input: HybridRetrievalCandidateInput): HybridRetrievalCandidate {
  return {
    id: input.id,
    type: input.type,
    score: input.score ?? 0,
    title: clipText(input.title, 160),
    text: clipText(input.text, 1_500),
    ...(input.scoreBreakdown ? { scoreBreakdown: input.scoreBreakdown } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.claimId ? { claimId: input.claimId } : {}),
    ...(input.objectId ? { objectId: input.objectId } : {}),
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    ...(input.graphDistance !== undefined && input.graphDistance !== null ? { graphDistance: input.graphDistance } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
  };
}

function scopedCondition(table: ScopeTable, scope: BrainScope | null) {
  if (!scope) {
    return undefined;
  }

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

function termsFor(text: string): string[] {
  const baseTerms = compactText(text)
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'-]{1,}/g) ?? [];
  const terms = baseTerms
    .map((term) => term.replace(/'s$/, "").replace(/(?:ing|ers|er|ed|es|s)$/i, ""))
    .flatMap((term) => [term, ...synonymsFor(term)])
    .filter((term) => term.length > 1 && !stopWords.has(term));

  return [...new Set(terms)];
}

function synonymsFor(term: string): string[] {
  const groups = [
    ["pay", "paid", "pricing", "price", "revenue", "willingness", "money"],
    ["founder", "startup", "yc", "preseed", "traction"],
    ["verify", "evidence", "source", "citation", "study", "research"],
    ["learn", "concept", "explain", "definition", "understand"],
    ["check", "challenge", "risk", "mistake", "misconception", "assumption", "counterargument"],
  ];
  const group = groups.find((candidateGroup) => candidateGroup.includes(term));

  return group ? group.filter((value) => value !== term) : [];
}

function safePayloadText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  try {
    return clipText(JSON.stringify(payload), 1_200);
  } catch {
    return "";
  }
}

function firstPayloadString(payload: unknown, keys: readonly string[]): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value) {
      return value;
    }
  }

  return null;
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(12, Math.round(limit ?? 6)));
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clipText(value: string, maxLength: number): string {
  const compacted = compactText(value);

  if (compacted.length <= maxLength) {
    return compacted;
  }

  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function roundScore(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

const stopWords = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "into",
  "will",
  "would",
  "could",
  "should",
  "before",
  "after",
  "about",
  "because",
  "when",
  "where",
  "what",
  "which",
  "who",
  "why",
  "how",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "not",
  "but",
  "you",
  "your",
  "their",
  "they",
  "them",
  "our",
  "its",
]);
