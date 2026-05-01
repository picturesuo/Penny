import { and, desc, eq, inArray, isNull } from "drizzle-orm";
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
  sources,
} from "./db/schema.ts";
import { scopeValues, type BrainScope, type BrainScopeInput } from "./scope.ts";

export const brainRetrievalModes = ["learn", "verify", "check", "autopilot"] as const;
export const brainRetrievalDocumentKinds = [
  "claim",
  "source",
  "edge",
  "move",
  "artifact",
  "brain_object",
  "recent",
  "session_note",
] as const;

export type BrainRetrievalMode = (typeof brainRetrievalModes)[number];
export type BrainRetrievalDocumentKind = (typeof brainRetrievalDocumentKinds)[number];
export type BrainRetrievalStrategy = "hybrid_lexical_vector";
export type BrainVector = readonly number[];

export type BrainVectorProvider = {
  /**
   * Wave 7 typed stub for a later persistent embedding/vector-store lane.
   * Implementations must return one normalized vector per text, in order.
   * The fallback below uses deterministic hashed token vectors so Learn/Verify
   * can consume the contract before a provider or pgvector table is available.
   */
  embed(texts: readonly string[]): Promise<readonly BrainVector[]>;
};

export type BrainRetrievalDocument = {
  id: string;
  kind: BrainRetrievalDocumentKind;
  title: string;
  text: string;
  sessionId: string | null;
  claimId: string | null;
  sourceId: string | null;
  updatedAt: string | null;
  tags: readonly string[];
};

export type BrainRetrievalMatch = {
  id: string;
  kind: BrainRetrievalDocumentKind;
  title: string;
  text: string;
  sessionId: string | null;
  claimId: string | null;
  sourceId: string | null;
  score: number;
  lexicalScore: number;
  vectorScore: number;
  recencyScore: number;
  graphScore: number;
  matchedTerms: readonly string[];
  reasons: readonly string[];
};

export type BrainRetrievalContext = {
  sourceOfTruth: "brain_rows_hybrid_retrieval";
  mode: BrainRetrievalMode;
  query: string;
  strategy: BrainRetrievalStrategy;
  vectorContract: "BrainVectorProvider";
  vectorProvider: "deterministic_mock" | "external_provider";
  matchCount: number;
  matches: readonly BrainRetrievalMatch[];
  summary: string;
};

export type BrainRetrievalRequest = {
  mode: BrainRetrievalMode;
  query: string;
  sessionId?: string | null;
  currentClaimId?: string | null;
  scope?: BrainScopeInput | null;
  limit?: number;
};

export type BrainRetrievalOptions = {
  vectorProvider?: BrainVectorProvider | null;
};

type SelectDb = Pick<PennyDatabase, "select">;
type ScopeColumn = AnyPgColumn;
type ScopeTable = {
  userId: ScopeColumn;
  workspaceId: ScopeColumn;
  projectId: ScopeColumn;
  sphereId: ScopeColumn;
};

export async function loadBrainRetrievalContext(
  db: SelectDb,
  request: BrainRetrievalRequest,
  options: BrainRetrievalOptions = {},
): Promise<BrainRetrievalContext> {
  const corpus = await loadBrainRetrievalCorpus(db, request);

  return retrieveBrainContext(corpus, request, options);
}

export async function retrieveBrainContext(
  documents: readonly BrainRetrievalDocument[],
  request: BrainRetrievalRequest,
  options: BrainRetrievalOptions = {},
): Promise<BrainRetrievalContext> {
  const query = compactText(request.query);
  const limit = clampLimit(request.limit);
  const vectorProvider = options.vectorProvider ?? null;
  const queryVector = vectorProvider
    ? (await vectorProvider.embed([query]))[0] ?? hashedTextVector(query)
    : hashedTextVector(query);
  const documentVectors = vectorProvider
    ? await vectorProvider.embed(documents.map((document) => document.text))
    : documents.map((document) => hashedTextVector(document.text));
  const queryTerms = termsFor(query);
  const scored = documents
    .map((document, index) => scoreDocument(document, {
      queryTerms,
      queryVector,
      documentVector: documentVectors[index] ?? hashedTextVector(document.text),
      request,
      index,
      total: documents.length,
    }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || kindRank(left.kind) - kindRank(right.kind) || left.title.localeCompare(right.title))
    .slice(0, limit);
  const matches = scored.length > 0 ? scored : fallbackMatches(documents, request, limit);

  return {
    sourceOfTruth: "brain_rows_hybrid_retrieval",
    mode: request.mode,
    query,
    strategy: "hybrid_lexical_vector",
    vectorContract: "BrainVectorProvider",
    vectorProvider: vectorProvider ? "external_provider" : "deterministic_mock",
    matchCount: matches.length,
    matches,
    summary: retrievalSummary(matches, request.mode),
  };
}

export function formatBrainRetrievalContext(context: BrainRetrievalContext | undefined): string {
  if (!context) {
    return "Brain retrieval context: none.";
  }

  const lines = context.matches.map((match, index) =>
    [
      `${index + 1}. [${match.kind}] ${match.title}`,
      `score=${match.score.toFixed(3)} lexical=${match.lexicalScore.toFixed(3)} vector=${match.vectorScore.toFixed(3)}`,
      match.claimId ? `claimId=${match.claimId}` : null,
      match.sourceId ? `sourceId=${match.sourceId}` : null,
      `text=${clipText(match.text, 420)}`,
      match.reasons.length ? `reasons=${match.reasons.join(", ")}` : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" | "),
  );

  return [
    "Brain retrieval context:",
    `- sourceOfTruth: ${context.sourceOfTruth}`,
    `- mode: ${context.mode}`,
    `- strategy: ${context.strategy}`,
    `- vectorProvider: ${context.vectorProvider}`,
    `- query: ${context.query}`,
    `- summary: ${context.summary}`,
    ...lines,
  ].join("\n");
}

export function buildBrainRetrievalDocument(input: BrainRetrievalDocument): BrainRetrievalDocument {
  return {
    id: input.id,
    kind: input.kind,
    title: clipText(compactText(input.title), 160),
    text: clipText(compactText(input.text), 2_000),
    sessionId: input.sessionId,
    claimId: input.claimId,
    sourceId: input.sourceId,
    updatedAt: input.updatedAt,
    tags: uniqueStrings(input.tags.map((tag) => tag.trim()).filter(Boolean)).slice(0, 12),
  };
}

async function loadBrainRetrievalCorpus(db: SelectDb, request: BrainRetrievalRequest): Promise<BrainRetrievalDocument[]> {
  const scope = request.scope ? scopeValues(request.scope) : null;
  const sessionRows = await loadRetrievalSessions(db, request, scope);
  const sessionIds = sessionRows.map((session) => session.id);

  if (sessionIds.length === 0) {
    return [];
  }

  const [
    sourceRows,
    claimRows,
    edgeRows,
    moveRows,
    artifactRows,
    objectRows,
    recentRows,
    noteRows,
  ] = await Promise.all([
    db.select().from(sources).where(and(inArray(sources.sessionId, sessionIds), scopedCondition(sources, scope))).orderBy(desc(sources.createdAt)),
    db.select().from(claims).where(and(inArray(claims.sessionId, sessionIds), scopedCondition(claims, scope))).orderBy(desc(claims.createdAt)),
    db.select().from(claimEdges).where(and(inArray(claimEdges.sessionId, sessionIds), scopedCondition(claimEdges, scope))).orderBy(desc(claimEdges.createdAt)),
    db.select().from(moves).where(and(inArray(moves.sessionId, sessionIds), scopedCondition(moves, scope))).orderBy(desc(moves.createdAt)).limit(80),
    db.select().from(artifacts).where(and(inArray(artifacts.sessionId, sessionIds), scopedCondition(artifacts, scope))).orderBy(desc(artifacts.createdAt)).limit(30),
    db.select().from(brainObjects).where(and(inArray(brainObjects.sessionId, sessionIds), scopedCondition(brainObjects, scope))).orderBy(desc(brainObjects.updatedAt)).limit(60),
    db.select().from(brainRecents).where(and(inArray(brainRecents.sessionId, sessionIds), scopedCondition(brainRecents, scope))).orderBy(desc(brainRecents.updatedAt)).limit(60),
    db.select().from(sessionNotes).where(and(inArray(sessionNotes.sessionId, sessionIds), scopedCondition(sessionNotes, scope))).orderBy(desc(sessionNotes.updatedAt)).limit(30),
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
  const versionsByClaimId = new Map(versionRows.map((version) => [version.claimId, version]));
  const claimTextById = new Map(
    claimRows.map((claim) => [claim.id, versionsByClaimId.get(claim.id)?.content ?? ""]),
  );

  return [
    ...claimRows
      .map((claim) => {
        const version = versionsByClaimId.get(claim.id);

        return version
          ? buildBrainRetrievalDocument({
              id: version.id,
              kind: "claim",
              title: `${claim.kind}: ${clipText(version.content, 80)}`,
              text: version.content,
              sessionId: claim.sessionId,
              claimId: claim.id,
              sourceId: version.sourceId ?? claim.sourceId,
              updatedAt: version.createdAt.toISOString(),
              tags: [claim.kind, version.status, `confidence_${version.confidence}`],
            })
          : null;
      })
      .filter((document): document is BrainRetrievalDocument => Boolean(document)),
    ...sourceRows.map((source) =>
      buildBrainRetrievalDocument({
        id: source.id,
        kind: "source",
        title: `${source.kind}: ${clipText(source.rawText, 80)}`,
        text: source.rawText,
        sessionId: source.sessionId,
        claimId: null,
        sourceId: source.id,
        updatedAt: source.createdAt.toISOString(),
        tags: [source.kind, "source"],
      }),
    ),
    ...edgeRows.map((edge) =>
      buildBrainRetrievalDocument({
        id: edge.id,
        kind: "edge",
        title: `${edge.kind} edge`,
        text: [
          edge.label,
          claimTextById.get(edge.fromClaimId),
          edge.kind,
          claimTextById.get(edge.toClaimId),
        ]
          .filter(Boolean)
          .join(" -> "),
        sessionId: edge.sessionId,
        claimId: edge.toClaimId,
        sourceId: null,
        updatedAt: edge.createdAt.toISOString(),
        tags: [edge.kind, edge.status, "graph_edge"],
      }),
    ),
    ...moveRows.map((move) =>
      buildBrainRetrievalDocument({
        id: move.id,
        kind: "move",
        title: `${move.kind}: ${clipText(move.summary, 80)}`,
        text: [move.summary, safePayloadText(move.payload)].filter(Boolean).join("\n"),
        sessionId: move.sessionId,
        claimId: firstPayloadString(move.payload, ["claimId", "targetClaimId", "focusedClaimId"]),
        sourceId: null,
        updatedAt: move.createdAt.toISOString(),
        tags: [move.kind, "move"],
      }),
    ),
    ...artifactRows.map((artifact) =>
      buildBrainRetrievalDocument({
        id: artifact.id,
        kind: "artifact",
        title: artifact.title,
        text: [artifact.summary, safePayloadText(artifact.payload)].filter(Boolean).join("\n"),
        sessionId: artifact.sessionId,
        claimId: null,
        sourceId: null,
        updatedAt: artifact.createdAt.toISOString(),
        tags: [artifact.kind, "artifact"],
      }),
    ),
    ...objectRows.map((object) =>
      buildBrainRetrievalDocument({
        id: object.id,
        kind: "brain_object",
        title: object.title,
        text: [object.summary, object.body, safePayloadText(object.payload)].filter(Boolean).join("\n"),
        sessionId: object.sessionId,
        claimId: firstPayloadString(object.payload, ["currentClaimId", "claimId"]),
        sourceId: null,
        updatedAt: object.updatedAt.toISOString(),
        tags: [object.objectType, "brain_object"],
      }),
    ),
    ...recentRows.map((recent) =>
      buildBrainRetrievalDocument({
        id: recent.id,
        kind: "recent",
        title: recent.title,
        text: [recent.summary, recent.body, safePayloadText(recent.payload)].filter(Boolean).join("\n"),
        sessionId: recent.sessionId,
        claimId: firstPayloadString(recent.payload, ["currentClaimId", "claimId"]),
        sourceId: null,
        updatedAt: recent.updatedAt.toISOString(),
        tags: [recent.kind, "recent"],
      }),
    ),
    ...noteRows.map((note) =>
      buildBrainRetrievalDocument({
        id: note.id,
        kind: "session_note",
        title: "Session note",
        text: note.content,
        sessionId: note.sessionId,
        claimId: null,
        sourceId: null,
        updatedAt: note.updatedAt.toISOString(),
        tags: ["session_note"],
      }),
    ),
  ];
}

async function loadRetrievalSessions(
  db: SelectDb,
  request: BrainRetrievalRequest,
  scope: BrainScope | null,
): Promise<Array<typeof sessions.$inferSelect>> {
  if (request.sessionId) {
    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, request.sessionId), scopedCondition(sessions, scope)))
      .limit(1);

    return rows;
  }

  return db
    .select()
    .from(sessions)
    .where(scopedCondition(sessions, scope))
    .orderBy(desc(sessions.createdAt))
    .limit(12);
}

function scoreDocument(
  document: BrainRetrievalDocument,
  context: {
    queryTerms: readonly string[];
    queryVector: BrainVector;
    documentVector: BrainVector;
    request: BrainRetrievalRequest;
    index: number;
    total: number;
  },
): BrainRetrievalMatch {
  const documentTerms = termsFor(`${document.title} ${document.text} ${document.tags.join(" ")}`);
  const matchedTerms = context.queryTerms.filter((term) => documentTerms.includes(term));
  const lexicalScore = context.queryTerms.length === 0 ? 0 : matchedTerms.length / context.queryTerms.length;
  const vectorScore = cosineSimilarity(context.queryVector, context.documentVector);
  const recencyScore = context.total <= 1 ? 1 : 1 - context.index / Math.max(1, context.total - 1);
  const graphScore = graphBoost(document, context.request);
  const score = roundScore(0.5 * lexicalScore + 0.35 * vectorScore + 0.1 * graphScore + 0.05 * recencyScore);
  const reasons = [
    matchedTerms.length ? `matched:${matchedTerms.slice(0, 5).join(",")}` : null,
    document.sessionId && document.sessionId === context.request.sessionId ? "same_session" : null,
    document.claimId && document.claimId === context.request.currentClaimId ? "current_claim" : null,
    document.kind === "source" || document.sourceId ? "source_grounding" : null,
    document.kind === "brain_object" ? "saved_brain_object" : null,
  ].filter((reason): reason is string => Boolean(reason));

  return {
    id: document.id,
    kind: document.kind,
    title: document.title,
    text: clipText(document.text, 1_000),
    sessionId: document.sessionId,
    claimId: document.claimId,
    sourceId: document.sourceId,
    score,
    lexicalScore: roundScore(lexicalScore),
    vectorScore: roundScore(vectorScore),
    recencyScore: roundScore(recencyScore),
    graphScore: roundScore(graphScore),
    matchedTerms,
    reasons,
  };
}

function fallbackMatches(
  documents: readonly BrainRetrievalDocument[],
  request: BrainRetrievalRequest,
  limit: number,
): BrainRetrievalMatch[] {
  return documents
    .filter((document) => !request.sessionId || document.sessionId === request.sessionId)
    .slice(0, limit)
    .map((document, index) => ({
      id: document.id,
      kind: document.kind,
      title: document.title,
      text: clipText(document.text, 1_000),
      sessionId: document.sessionId,
      claimId: document.claimId,
      sourceId: document.sourceId,
      score: roundScore(0.05 - index * 0.001),
      lexicalScore: 0,
      vectorScore: 0,
      recencyScore: roundScore(1 - index / Math.max(1, limit)),
      graphScore: roundScore(graphBoost(document, request)),
      matchedTerms: [],
      reasons: ["fallback_recent_brain_row"],
    }));
}

function retrievalSummary(matches: readonly BrainRetrievalMatch[], mode: BrainRetrievalMode): string {
  if (matches.length === 0) {
    return `No Brain retrieval matches were available for ${mode}.`;
  }

  const kinds = [...new Set(matches.map((match) => match.kind))].join(", ");

  return `Found ${matches.length} relevant Brain row${matches.length === 1 ? "" : "s"} for ${mode}: ${kinds}.`;
}

function graphBoost(document: BrainRetrievalDocument, request: BrainRetrievalRequest): number {
  let boost = 0;

  if (document.sessionId && request.sessionId && document.sessionId === request.sessionId) {
    boost += 0.45;
  }

  if (document.claimId && request.currentClaimId && document.claimId === request.currentClaimId) {
    boost += 0.45;
  }

  if (document.kind === "claim" || document.kind === "brain_object") {
    boost += 0.1;
  }

  return Math.min(1, boost);
}

function termsFor(text: string): string[] {
  const baseTerms = compactText(text)
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'-]{1,}/g) ?? [];
  const terms = baseTerms
    .map((term) => stemTerm(term))
    .flatMap((term) => [term, ...synonymsFor(term)])
    .filter((term) => term.length > 1 && !stopWords.has(term));

  return uniqueStrings(terms);
}

function hashedTextVector(text: string, dimensions = 64): BrainVector {
  const vector = Array.from({ length: dimensions }, () => 0);
  const terms = termsFor(text);

  for (const term of terms) {
    const index = positiveHash(term) % dimensions;
    const sign = positiveHash(`sign:${term}`) % 2 === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign * (1 + Math.min(2, term.length / 10));
  }

  return normalizeVector(vector);
}

function normalizeVector(vector: readonly number[]): BrainVector {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (magnitude === 0) {
    return vector.map(() => 0);
  }

  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(left: BrainVector, right: BrainVector): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;

  for (let index = 0; index < length; index += 1) {
    dot += (left[index] ?? 0) * (right[index] ?? 0);
  }

  return roundScore(Math.max(0, dot));
}

function positiveHash(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
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

function kindRank(kind: BrainRetrievalDocumentKind): number {
  return {
    claim: 0,
    brain_object: 1,
    source: 2,
    artifact: 3,
    edge: 4,
    move: 5,
    recent: 6,
    session_note: 7,
  }[kind];
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(12, Math.round(limit ?? 6)));
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

function stemTerm(term: string): string {
  return term
    .replace(/'s$/, "")
    .replace(/(?:ing|ers|er|ed|es|s)$/i, "");
}

function synonymsFor(term: string): string[] {
  const groups = [
    ["pay", "paid", "pricing", "price", "revenue", "willingness", "money"],
    ["founder", "startup", "yc", "preseed", "traction"],
    ["verify", "evidence", "source", "citation", "study", "research"],
    ["learn", "concept", "explain", "definition", "understand"],
    ["challenge", "risk", "weak", "assumption", "counterargument"],
  ];
  const group = groups.find((candidate) => candidate.includes(term));

  return group ? group.filter((value) => value !== term) : [];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
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
  "inside",
  "outside",
]);
