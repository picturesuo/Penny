import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import type { DbClient } from "../../db/client.ts";
import { getDb } from "../../db/client.ts";
import { claims, graphEdges, graphNodes, thoughts } from "../../db/schema.ts";

export type SuggestConnectionsTargetType = "thought" | "claim";

export type SuggestConnectionsInput = {
  userId: string;
  targetType: SuggestConnectionsTargetType;
  targetId: string;
  autoCreate?: boolean | null;
};

export type SuggestConnectionsEntity = {
  type: SuggestConnectionsTargetType;
  id: string;
  mapId: string | null;
  text: string;
};

export type SuggestedConnectionRelation = "related" | "supports" | "contradicts";

export type SuggestedConnection = {
  targetType: SuggestConnectionsTargetType;
  targetId: string;
  relation: SuggestedConnectionRelation;
  confidenceBps: number;
  reason: string;
  sharedTerms: string[];
  autoCreated: boolean;
};

export type CreatedConnectionEdge = {
  id: string;
  relation: SuggestedConnectionRelation;
  sourceNodeId: string;
  targetNodeId: string;
  targetType: SuggestConnectionsTargetType;
  targetId: string;
};

export type SuggestConnectionsResult = {
  target: SuggestConnectionsEntity;
  suggestions: SuggestedConnection[];
  createdEdges: CreatedConnectionEdge[];
};

export type SuggestConnectionsRepository = {
  findTarget(input: {
    userId: string;
    targetType: SuggestConnectionsTargetType;
    targetId: string;
  }): Promise<SuggestConnectionsEntity | null>;
  findCandidates(input: {
    userId: string;
    target: SuggestConnectionsEntity;
  }): Promise<SuggestConnectionsEntity[]>;
  findGraphNode(input: {
    userId: string;
    entity: SuggestConnectionsEntity;
  }): Promise<{ id: string } | null>;
  insertGraphNode(record: {
    id: string;
    userId: string;
    entity: SuggestConnectionsEntity;
    createdAt: Date;
  }): Promise<void>;
  findGraphEdge(input: {
    userId: string;
    sourceNodeId: string;
    targetNodeId: string;
    relation: SuggestedConnectionRelation;
  }): Promise<{ id: string } | null>;
  insertGraphEdge(record: {
    id: string;
    userId: string;
    mapId: string;
    sourceNodeId: string;
    targetNodeId: string;
    relation: SuggestedConnectionRelation;
    confidenceBps: number;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }): Promise<void>;
};

export type SuggestConnectionsDependencies = {
  createId?: () => string;
  now?: () => Date;
};

export class SuggestConnectionsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuggestConnectionsValidationError";
  }
}

export class SuggestConnectionsTargetNotFoundError extends Error {
  constructor(targetType: string, targetId: string) {
    super(`Target ${targetType} not found for suggestConnections: ${targetId}`);
    this.name = "SuggestConnectionsTargetNotFoundError";
  }
}

type NormalizedSuggestConnectionsInput = {
  userId: string;
  targetType: SuggestConnectionsTargetType;
  targetId: string;
  autoCreate: boolean;
};

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "but",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "when",
  "with",
]);

const NEGATION_TERMS = new Set([
  "avoid",
  "cannot",
  "cant",
  "doesnt",
  "dont",
  "false",
  "fail",
  "failed",
  "fails",
  "never",
  "no",
  "not",
  "shouldnt",
  "stop",
  "without",
  "wont",
  "wrong",
]);

const ANTONYM_PAIRS: Array<[string, string]> = [
  ["increase", "decrease"],
  ["safe", "risky"],
  ["true", "false"],
  ["always", "never"],
  ["fast", "slow"],
  ["trust", "doubt"],
];

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SuggestConnectionsValidationError("suggestConnections input must be an object.");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string, maxLength = 200): string {
  if (typeof value !== "string") {
    throw new SuggestConnectionsValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new SuggestConnectionsValidationError(`${fieldName} must not be empty.`);
  }

  if (trimmed.length > maxLength) {
    throw new SuggestConnectionsValidationError(`${fieldName} must be at most ${maxLength} character(s).`);
  }

  return trimmed;
}

function readTargetType(value: unknown): SuggestConnectionsTargetType {
  if (value === "thought" || value === "claim") {
    return value;
  }

  throw new SuggestConnectionsValidationError("targetType must be either thought or claim.");
}

function readOptionalBoolean(value: unknown, fieldName: string): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value !== "boolean") {
    throw new SuggestConnectionsValidationError(`${fieldName} must be a boolean when provided.`);
  }

  return value;
}

export function validateSuggestConnectionsInput(input: unknown): NormalizedSuggestConnectionsInput {
  const object = asObject(input);

  return {
    userId: readRequiredString(object.userId, "userId"),
    targetType: readTargetType(object.targetType),
    targetId: readRequiredString(object.targetId, "targetId"),
    autoCreate: readOptionalBoolean(object.autoCreate, "autoCreate"),
  };
}

function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));

  return Array.from(new Set(words));
}

function hasNegation(tokens: string[]) {
  return tokens.some((token) => NEGATION_TERMS.has(token));
}

function hasAntonymPair(leftTokens: Set<string>, rightTokens: Set<string>) {
  return ANTONYM_PAIRS.some(
    ([left, right]) => (leftTokens.has(left) && rightTokens.has(right)) || (leftTokens.has(right) && rightTokens.has(left)),
  );
}

function scoreCandidate(target: SuggestConnectionsEntity, candidate: SuggestConnectionsEntity): SuggestedConnection | null {
  const targetTokens = tokenize(target.text);
  const candidateTokens = tokenize(candidate.text);
  const targetTokenSet = new Set(targetTokens);
  const candidateTokenSet = new Set(candidateTokens);
  const sharedTerms = targetTokens.filter((token) => candidateTokenSet.has(token));
  const unionSize = new Set([...targetTokens, ...candidateTokens]).size || 1;
  const jaccard = sharedTerms.length / unionSize;
  const negationMismatch = hasNegation(targetTokens) !== hasNegation(candidateTokens);
  const antonymPair = hasAntonymPair(targetTokenSet, candidateTokenSet);
  const contradicts = sharedTerms.length >= 2 && (negationMismatch || antonymPair);

  if (!contradicts && sharedTerms.length === 0) {
    return null;
  }

  const confidenceBps = Math.min(
    9500,
    Math.round(3400 + sharedTerms.length * 700 + jaccard * 2600 + (contradicts ? 1200 : 0)),
  );
  const relation: SuggestedConnectionRelation = contradicts ? "contradicts" : jaccard >= 0.3 ? "supports" : "related";
  const reason =
    relation === "contradicts"
      ? `Potential contradiction: ${negationMismatch ? "negation differs" : "opposing terms appear"} while sharing ${sharedTerms.join(", ")}.`
      : relation === "supports"
        ? `Strong overlap around ${sharedTerms.join(", ")}.`
        : `Related through ${sharedTerms.join(", ")}.`;

  return {
    targetType: candidate.type,
    targetId: candidate.id,
    relation,
    confidenceBps,
    reason,
    sharedTerms,
    autoCreated: false,
  };
}

function buildSuggestions(target: SuggestConnectionsEntity, candidates: SuggestConnectionsEntity[]): SuggestedConnection[] {
  return candidates
    .filter((candidate) => candidate.id !== target.id || candidate.type !== target.type)
    .map((candidate) => scoreCandidate(target, candidate))
    .filter((suggestion): suggestion is SuggestedConnection => Boolean(suggestion))
    .sort((left, right) => {
      if (left.relation === "contradicts" && right.relation !== "contradicts") {
        return -1;
      }

      if (right.relation === "contradicts" && left.relation !== "contradicts") {
        return 1;
      }

      return right.confidenceBps - left.confidenceBps;
    })
    .slice(0, 6);
}

async function ensureGraphNode(input: {
  repository: SuggestConnectionsRepository;
  userId: string;
  entity: SuggestConnectionsEntity;
  createId: () => string;
  now: Date;
}): Promise<{ id: string } | null> {
  if (!input.entity.mapId) {
    return null;
  }

  const existing = await input.repository.findGraphNode({
    userId: input.userId,
    entity: input.entity,
  });

  if (existing) {
    return existing;
  }

  const id = input.createId();

  await input.repository.insertGraphNode({
    id,
    userId: input.userId,
    entity: input.entity,
    createdAt: input.now,
  });

  return { id };
}

async function autoCreateEdges(input: {
  userId: string;
  target: SuggestConnectionsEntity;
  candidates: SuggestConnectionsEntity[];
  suggestions: SuggestedConnection[];
  repository: SuggestConnectionsRepository;
  createId: () => string;
  now: Date;
}): Promise<CreatedConnectionEdge[]> {
  if (!input.target.mapId) {
    return [];
  }

  const targetNode = await ensureGraphNode({
    repository: input.repository,
    userId: input.userId,
    entity: input.target,
    createId: input.createId,
    now: input.now,
  });

  if (!targetNode) {
    return [];
  }

  const createdEdges: CreatedConnectionEdge[] = [];

  for (const suggestion of input.suggestions) {
    const candidate = input.candidates.find(
      (item) => item.type === suggestion.targetType && item.id === suggestion.targetId && item.mapId === input.target.mapId,
    );

    if (!candidate) {
      continue;
    }

    const candidateNode = await ensureGraphNode({
      repository: input.repository,
      userId: input.userId,
      entity: candidate,
      createId: input.createId,
      now: input.now,
    });

    if (!candidateNode) {
      continue;
    }

    const existingEdge = await input.repository.findGraphEdge({
      userId: input.userId,
      sourceNodeId: targetNode.id,
      targetNodeId: candidateNode.id,
      relation: suggestion.relation,
    });

    if (existingEdge) {
      suggestion.autoCreated = true;
      createdEdges.push({
        id: existingEdge.id,
        relation: suggestion.relation,
        sourceNodeId: targetNode.id,
        targetNodeId: candidateNode.id,
        targetType: suggestion.targetType,
        targetId: suggestion.targetId,
      });
      continue;
    }

    const id = input.createId();

    await input.repository.insertGraphEdge({
      id,
      userId: input.userId,
      mapId: input.target.mapId,
      sourceNodeId: targetNode.id,
      targetNodeId: candidateNode.id,
      relation: suggestion.relation,
      confidenceBps: suggestion.confidenceBps,
      metadata: {
        operation: "suggestConnections",
        reason: suggestion.reason,
        sharedTerms: suggestion.sharedTerms,
        targetType: suggestion.targetType,
        targetId: suggestion.targetId,
      },
      createdAt: input.now,
    });

    suggestion.autoCreated = true;
    createdEdges.push({
      id,
      relation: suggestion.relation,
      sourceNodeId: targetNode.id,
      targetNodeId: candidateNode.id,
      targetType: suggestion.targetType,
      targetId: suggestion.targetId,
    });
  }

  return createdEdges;
}

export async function suggestConnections(
  input: unknown,
  repository?: SuggestConnectionsRepository,
  dependencies: SuggestConnectionsDependencies = {},
): Promise<SuggestConnectionsResult> {
  const normalized = validateSuggestConnectionsInput(input);
  const resolvedRepository = repository ?? createSuggestConnectionsRepository(getDb());
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now?.() ?? new Date();
  const target = await resolvedRepository.findTarget(normalized);

  if (!target) {
    throw new SuggestConnectionsTargetNotFoundError(normalized.targetType, normalized.targetId);
  }

  const candidates = await resolvedRepository.findCandidates({
    userId: normalized.userId,
    target,
  });
  const suggestions = buildSuggestions(target, candidates);
  const createdEdges = normalized.autoCreate
    ? await autoCreateEdges({
        userId: normalized.userId,
        target,
        candidates,
        suggestions,
        repository: resolvedRepository,
        createId,
        now,
      })
    : [];

  return {
    target,
    suggestions,
    createdEdges,
  };
}

export function createSuggestConnectionsRepository(db: DbClient): SuggestConnectionsRepository {
  return {
    async findTarget(input) {
      if (input.targetType === "claim") {
        const rows = await db
          .select({
            id: claims.id,
            mapId: claims.mapId,
            text: claims.body,
          })
          .from(claims)
          .where(and(eq(claims.id, input.targetId), eq(claims.userId, input.userId)))
          .limit(1);

        return rows[0] ? { type: "claim", id: rows[0].id, mapId: rows[0].mapId, text: rows[0].text } : null;
      }

      const rows = await db
        .select({
          id: thoughts.id,
          mapId: thoughts.mapId,
          text: thoughts.rawText,
        })
        .from(thoughts)
        .where(and(eq(thoughts.id, input.targetId), eq(thoughts.userId, input.userId)))
        .limit(1);

      return rows[0] ? { type: "thought", id: rows[0].id, mapId: rows[0].mapId, text: rows[0].text } : null;
    },
    async findCandidates(input) {
      const thoughtMapCondition = input.target.mapId ? eq(thoughts.mapId, input.target.mapId) : isNull(thoughts.mapId);
      const claimRows = input.target.mapId
        ? await db
            .select({
              id: claims.id,
              mapId: claims.mapId,
              text: claims.body,
            })
            .from(claims)
            .where(and(eq(claims.userId, input.userId), eq(claims.mapId, input.target.mapId)))
        : [];
      const thoughtRows = await db
        .select({
          id: thoughts.id,
          mapId: thoughts.mapId,
          text: thoughts.rawText,
        })
        .from(thoughts)
        .where(and(eq(thoughts.userId, input.userId), thoughtMapCondition));

      return [
        ...claimRows.map((row) => ({ type: "claim" as const, id: row.id, mapId: row.mapId, text: row.text })),
        ...thoughtRows.map((row) => ({ type: "thought" as const, id: row.id, mapId: row.mapId, text: row.text })),
      ];
    },
    async findGraphNode(input) {
      if (!input.entity.mapId) {
        return null;
      }

      const entityCondition =
        input.entity.type === "claim"
          ? eq(graphNodes.claimId, input.entity.id)
          : eq(graphNodes.thoughtId, input.entity.id);
      const rows = await db
        .select({ id: graphNodes.id })
        .from(graphNodes)
        .where(and(eq(graphNodes.userId, input.userId), eq(graphNodes.mapId, input.entity.mapId), entityCondition))
        .limit(1);

      return rows[0] ?? null;
    },
    async insertGraphNode(record) {
      if (!record.entity.mapId) {
        return;
      }

      await db.insert(graphNodes).values({
        id: record.id,
        userId: record.userId,
        mapId: record.entity.mapId,
        kind: record.entity.type,
        label: record.entity.text.slice(0, 160),
        claimId: record.entity.type === "claim" ? record.entity.id : null,
        thoughtId: record.entity.type === "thought" ? record.entity.id : null,
        metadataJson: {
          operation: "suggestConnections",
        },
        createdAt: record.createdAt,
        updatedAt: record.createdAt,
      });
    },
    async findGraphEdge(input) {
      const rows = await db
        .select({ id: graphEdges.id })
        .from(graphEdges)
        .where(
          and(
            eq(graphEdges.userId, input.userId),
            eq(graphEdges.sourceNodeId, input.sourceNodeId),
            eq(graphEdges.targetNodeId, input.targetNodeId),
            eq(graphEdges.kind, input.relation),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    },
    async insertGraphEdge(record) {
      await db.insert(graphEdges).values({
        id: record.id,
        userId: record.userId,
        mapId: record.mapId,
        sourceNodeId: record.sourceNodeId,
        targetNodeId: record.targetNodeId,
        kind: record.relation,
        weightBps: record.confidenceBps,
        metadataJson: record.metadata,
        createdAt: record.createdAt,
        updatedAt: record.createdAt,
      });
    },
  };
}
