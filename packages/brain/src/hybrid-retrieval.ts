import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { PennyDatabase } from "./db/client.ts";
import { artifacts, brainObjects, brainRecents, claimVersions, claims, moves, sources } from "./db/schema.ts";
import { scopeValues, type BrainScope, type BrainScopeInput } from "./scope.ts";

export const hybridRetrievalModes = ["learn", "verify", "check", "autopilot"] as const;
export const brainRetrievalKinds = ["claim", "source", "brain_object", "recent", "move", "artifact"] as const;

export type HybridRetrievalMode = (typeof hybridRetrievalModes)[number];
export type BrainRetrievalKind = (typeof brainRetrievalKinds)[number];
export type HybridRetrievalStrategy = "lexical" | "hybrid";

export type BrainRetrievalDocument = {
  id: string;
  kind: BrainRetrievalKind;
  title: string;
  text: string;
  sessionId: string | null;
  claimId: string | null;
  sourceId: string | null;
  moveId: string | null;
  artifactId: string | null;
  updatedAt: Date | null;
  scope: BrainScope;
};

export type HybridRetrievalRequest = {
  query: string;
  mode: HybridRetrievalMode;
  scope?: BrainScopeInput;
  sessionId?: string | null;
  restrictToSession?: boolean;
  includeKinds?: readonly BrainRetrievalKind[];
  limit?: number;
};

export type VectorRetrievalMatch = {
  documentId: string;
  score: number;
  reason?: string;
};

export type VectorRetrievalProviderInput = {
  query: string;
  mode: HybridRetrievalMode;
  scope: BrainScope;
  sessionId: string | null;
  restrictToSession: boolean;
  includeKinds: readonly BrainRetrievalKind[];
  limit: number;
};

export type VectorRetrievalProvider = {
  name: string;
  search(input: VectorRetrievalProviderInput): Promise<readonly VectorRetrievalMatch[]>;
};

export type HybridRetrievalOptions = {
  vectorProvider?: VectorRetrievalProvider | null;
  candidatePoolLimit?: number;
};

export type HybridRetrievalMatch = BrainRetrievalDocument & {
  score: number;
  lexicalScore: number;
  vectorScore: number | null;
  graphScore: number;
  recencyScore: number;
  reasons: string[];
};

export type HybridRetrievalResult = {
  query: string;
  mode: HybridRetrievalMode;
  strategy: HybridRetrievalStrategy;
  vectorProviderName: string | null;
  vectorProviderUsed: boolean;
  matches: HybridRetrievalMatch[];
  contextSummary: string;
};

type SelectDb = Pick<PennyDatabase, "select">;
type ScopeTable = {
  userId: AnyPgColumn;
  workspaceId: AnyPgColumn;
  projectId: AnyPgColumn;
  sphereId: AnyPgColumn;
  sessionId?: AnyPgColumn;
};

export function createNoopVectorRetrievalProvider(name = "noop-vector"): VectorRetrievalProvider {
  return {
    name,
    async search() {
      return [];
    },
  };
}

export async function retrieveBrainContext(
  db: SelectDb,
  request: HybridRetrievalRequest,
  options: HybridRetrievalOptions = {},
): Promise<HybridRetrievalResult> {
  const documents = await loadBrainRetrievalDocuments(
    db,
    request,
    options.candidatePoolLimit === undefined ? {} : { candidatePoolLimit: options.candidatePoolLimit },
  );
  const scope = scopeValues(request.scope);
  const includeKinds = normalizedKinds(request.includeKinds);
  const limit = normalizedLimit(request.limit);
  const vectorMatches = options.vectorProvider
    ? await options.vectorProvider.search({
        query: request.query,
        mode: request.mode,
        scope,
        sessionId: request.sessionId ?? null,
        restrictToSession: request.restrictToSession ?? false,
        includeKinds,
        limit: Math.max(limit, options.candidatePoolLimit ?? 80),
      })
    : [];
  const matches = rankHybridRetrievalDocuments(documents, request, vectorMatches);
  const vectorProviderUsed = vectorMatches.length > 0;

  return {
    query: compactText(request.query),
    mode: request.mode,
    strategy: vectorProviderUsed ? "hybrid" : "lexical",
    vectorProviderName: options.vectorProvider?.name ?? null,
    vectorProviderUsed,
    matches,
    contextSummary: buildBrainContextSummary(matches),
  };
}

export async function loadBrainRetrievalDocuments(
  db: SelectDb,
  request: HybridRetrievalRequest,
  options: { candidatePoolLimit?: number } = {},
): Promise<BrainRetrievalDocument[]> {
  const scope = scopeValues(request.scope);
  const includeKinds = new Set(normalizedKinds(request.includeKinds));
  const limit = Math.max(normalizedLimit(request.limit), options.candidatePoolLimit ?? 80);
  const documents: BrainRetrievalDocument[] = [];

  if (includeKinds.has("claim")) {
    const rows = await db
      .select({
        id: claims.id,
        sessionId: claims.sessionId,
        sourceId: claims.sourceId,
        kind: claims.kind,
        content: claimVersions.content,
        confidence: claimVersions.confidence,
        status: claimVersions.status,
        createdAt: claimVersions.createdAt,
        userId: claims.userId,
        workspaceId: claims.workspaceId,
        projectId: claims.projectId,
        sphereId: claims.sphereId,
      })
      .from(claims)
      .innerJoin(claimVersions, and(eq(claimVersions.claimId, claims.id), eq(claimVersions.isCurrent, true)))
      .where(scopedCondition(claims, scope, request))
      .orderBy(desc(claimVersions.createdAt))
      .limit(limit);

    documents.push(
      ...rows.map((row) => ({
        id: `claim:${row.id}`,
        kind: "claim" as const,
        title: `${titleCase(row.kind)} claim`,
        text: `${row.content}\nStatus: ${row.status}. Confidence: ${row.confidence}.`,
        sessionId: row.sessionId,
        claimId: row.id,
        sourceId: row.sourceId,
        moveId: null,
        artifactId: null,
        updatedAt: row.createdAt,
        scope: scopeFromRow(row),
      })),
    );
  }

  if (includeKinds.has("source")) {
    const rows = await db
      .select()
      .from(sources)
      .where(scopedCondition(sources, scope, request))
      .orderBy(desc(sources.createdAt))
      .limit(limit);

    documents.push(
      ...rows.map((row) => ({
        id: `source:${row.id}`,
        kind: "source" as const,
        title: titleCase(row.kind.replace(/_/g, " ")),
        text: row.rawText,
        sessionId: row.sessionId,
        claimId: null,
        sourceId: row.id,
        moveId: null,
        artifactId: null,
        updatedAt: row.createdAt,
        scope: scopeFromRow(row),
      })),
    );
  }

  if (includeKinds.has("brain_object")) {
    const rows = await db
      .select()
      .from(brainObjects)
      .where(scopedCondition(brainObjects, scope, request))
      .orderBy(desc(brainObjects.updatedAt))
      .limit(limit);

    documents.push(
      ...rows.map((row) => ({
        id: `brain_object:${row.id}`,
        kind: "brain_object" as const,
        title: row.title,
        text: [row.summary, row.body].filter(Boolean).join("\n"),
        sessionId: row.sessionId,
        claimId: null,
        sourceId: null,
        moveId: null,
        artifactId: null,
        updatedAt: row.updatedAt,
        scope: scopeFromRow(row),
      })),
    );
  }

  if (includeKinds.has("recent")) {
    const rows = await db
      .select()
      .from(brainRecents)
      .where(scopedCondition(brainRecents, scope, request))
      .orderBy(desc(brainRecents.updatedAt))
      .limit(limit);

    documents.push(
      ...rows.map((row) => ({
        id: `recent:${row.id}`,
        kind: "recent" as const,
        title: row.title,
        text: [row.summary, row.body].filter(Boolean).join("\n"),
        sessionId: row.sessionId,
        claimId: null,
        sourceId: null,
        moveId: null,
        artifactId: null,
        updatedAt: row.updatedAt,
        scope: scopeFromRow(row),
      })),
    );
  }

  if (includeKinds.has("move")) {
    const rows = await db
      .select()
      .from(moves)
      .where(scopedCondition(moves, scope, request))
      .orderBy(desc(moves.createdAt))
      .limit(limit);

    documents.push(
      ...rows.map((row) => ({
        id: `move:${row.id}`,
        kind: "move" as const,
        title: titleCase(row.kind.replace(/[._]/g, " ")),
        text: `${row.summary}\n${safeJson(row.payload)}`,
        sessionId: row.sessionId,
        claimId: null,
        sourceId: null,
        moveId: row.id,
        artifactId: null,
        updatedAt: row.createdAt,
        scope: scopeFromRow(row),
      })),
    );
  }

  if (includeKinds.has("artifact")) {
    const rows = await db
      .select()
      .from(artifacts)
      .where(scopedCondition(artifacts, scope, request))
      .orderBy(desc(artifacts.createdAt))
      .limit(limit);

    documents.push(
      ...rows.map((row) => ({
        id: `artifact:${row.id}`,
        kind: "artifact" as const,
        title: row.title,
        text: `${row.summary}\n${safeJson(row.payload)}`,
        sessionId: row.sessionId,
        claimId: null,
        sourceId: null,
        moveId: null,
        artifactId: row.id,
        updatedAt: row.createdAt,
        scope: scopeFromRow(row),
      })),
    );
  }

  return dedupeDocuments(documents);
}

export function rankHybridRetrievalDocuments(
  documents: readonly BrainRetrievalDocument[],
  request: HybridRetrievalRequest,
  vectorMatches: readonly VectorRetrievalMatch[] = [],
): HybridRetrievalMatch[] {
  const query = compactText(request.query);
  const queryTokens = tokenSet(query);
  const vectorById = new Map(
    vectorMatches.map((match) => [
      match.documentId,
      {
        score: normalizedVectorScore(match.score),
        reason: match.reason?.trim() || "vector similarity",
      },
    ]),
  );
  const includeKinds = new Set(normalizedKinds(request.includeKinds));
  const ranked = documents
    .filter((document) => includeKinds.has(document.kind))
    .map((document) => {
      const lexicalScore = lexicalMatchScore(document, query, queryTokens);
      const vector = vectorById.get(document.id) ?? null;
      const vectorScore = vector ? Math.round(vector.score * 100) : null;
      const graphScore = graphBoost(document, request);
      const recencyScore = recencyBoost(document.updatedAt);
      const score = lexicalScore + graphScore + recencyScore + (vectorScore ?? 0);
      const reasons = matchReasons(document, request, {
        lexicalScore,
        vectorReason: vector?.reason ?? null,
        graphScore,
        recencyScore,
      });

      return {
        ...document,
        score,
        lexicalScore,
        vectorScore,
        graphScore,
        recencyScore,
        reasons,
      };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return documentSortTime(right) - documentSortTime(left);
    });

  return ranked.slice(0, normalizedLimit(request.limit));
}

export function buildBrainContextSummary(matches: readonly HybridRetrievalMatch[], maxItems = 5): string {
  const lines = matches.slice(0, Math.max(1, maxItems)).map((match, index) => {
    const refs = [
      match.claimId ? `claim:${match.claimId}` : null,
      match.sourceId ? `source:${match.sourceId}` : null,
      match.moveId ? `move:${match.moveId}` : null,
      match.artifactId ? `artifact:${match.artifactId}` : null,
      match.sessionId ? `session:${match.sessionId}` : null,
    ].filter(Boolean);

    return `${index + 1}. [${match.kind}] ${clip(match.title, 96)} — ${clip(match.text, 220)}${
      refs.length ? ` (${refs.join(", ")})` : ""
    }`;
  });

  return lines.join("\n");
}

function lexicalMatchScore(document: BrainRetrievalDocument, query: string, queryTokens: Set<string>): number {
  if (queryTokens.size === 0) {
    return 0;
  }

  const title = document.title.toLowerCase();
  const text = `${document.title}\n${document.text}`.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    if (text.includes(token)) {
      score += 8;
    }

    if (title.includes(token)) {
      score += 4;
    }
  }

  if (query.length >= 12 && text.includes(query.toLowerCase())) {
    score += 32;
  }

  return score;
}

function graphBoost(document: BrainRetrievalDocument, request: HybridRetrievalRequest): number {
  let score = 0;

  if (request.sessionId && document.sessionId === request.sessionId) {
    score += 12;
  }

  if (request.mode === "learn" && (document.kind === "claim" || document.kind === "brain_object")) {
    score += 5;
  }

  if (request.mode === "verify" && (document.kind === "source" || document.kind === "claim")) {
    score += 6;
  }

  if (request.mode === "autopilot" && (document.kind === "move" || document.kind === "claim")) {
    score += 4;
  }

  return score;
}

function recencyBoost(updatedAt: Date | null): number {
  if (!updatedAt) {
    return 0;
  }

  const ageDays = (Date.now() - updatedAt.getTime()) / 86_400_000;

  if (ageDays <= 2) {
    return 6;
  }

  if (ageDays <= 14) {
    return 3;
  }

  if (ageDays <= 60) {
    return 1;
  }

  return 0;
}

function matchReasons(
  document: BrainRetrievalDocument,
  request: HybridRetrievalRequest,
  scores: {
    lexicalScore: number;
    vectorReason: string | null;
    graphScore: number;
    recencyScore: number;
  },
): string[] {
  const reasons = [];

  if (scores.lexicalScore > 0) {
    reasons.push("lexical_overlap");
  }

  if (scores.vectorReason) {
    reasons.push(scores.vectorReason);
  }

  if (scores.graphScore > 0 && request.sessionId && document.sessionId === request.sessionId) {
    reasons.push("same_session_graph_context");
  } else if (scores.graphScore > 0) {
    reasons.push(`${request.mode}_mode_kind_boost`);
  }

  if (scores.recencyScore > 0) {
    reasons.push("recent_brain_activity");
  }

  return reasons;
}

function scopedCondition(table: ScopeTable, scope: BrainScope, request: HybridRetrievalRequest): SQL | undefined {
  const conditions = [
    scopeColumnCondition(table.userId, scope.userId),
    scopeColumnCondition(table.workspaceId, scope.workspaceId),
    scopeColumnCondition(table.projectId, scope.projectId),
    scopeColumnCondition(table.sphereId, scope.sphereId),
    request.restrictToSession && request.sessionId && table.sessionId ? eq(table.sessionId, request.sessionId) : undefined,
  ].filter((condition): condition is SQL => Boolean(condition));

  return conditions.length ? and(...conditions) : undefined;
}

function scopeColumnCondition(column: AnyPgColumn, value: string | null): SQL {
  return value === null ? isNull(column) : eq(column, value);
}

function scopeFromRow(row: BrainScopeInput): BrainScope {
  return scopeValues(row);
}

function normalizedKinds(kinds: readonly BrainRetrievalKind[] | undefined): BrainRetrievalKind[] {
  return kinds?.length ? [...new Set(kinds)] : [...brainRetrievalKinds];
}

function normalizedLimit(limit: number | undefined): number {
  return typeof limit === "number" && Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.round(limit))) : 8;
}

function normalizedVectorScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(1, score));
}

function tokenSet(value: string): Set<string> {
  const stop = new Set(["and", "are", "but", "for", "from", "has", "have", "into", "not", "that", "the", "this", "with"]);

  return new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9'-]{2,}/g)
      ?.filter((token) => !stop.has(token)) ?? [],
  );
}

function dedupeDocuments(documents: BrainRetrievalDocument[]): BrainRetrievalDocument[] {
  const seen = new Set<string>();

  return documents.filter((document) => {
    if (seen.has(document.id)) {
      return false;
    }

    seen.add(document.id);
    return true;
  });
}

function documentSortTime(document: BrainRetrievalDocument): number {
  return document.updatedAt?.getTime() ?? 0;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "";
  }
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clip(value: string, max: number): string {
  const compacted = compactText(value);

  return compacted.length > max ? `${compacted.slice(0, Math.max(0, max - 1)).trimEnd()}...` : compacted;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
