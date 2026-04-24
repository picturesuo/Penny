import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { AI_OPERATIONS } from "../services/operation-names.ts";
import type { DbClient } from "../../db/client.ts";
import { getDb } from "../../db/client.ts";
import { activityEvents, aiJobs, claims, graphEdges, graphNodes, thoughts } from "../../db/schema.ts";

export type DetectContradictionsTargetType = "thought" | "claim";

export type DetectContradictionsEntity = {
  type: DetectContradictionsTargetType;
  id: string;
  mapId: string | null;
  text: string;
};

export type ContradictionCandidate = {
  claimId: string;
  confidenceBps: number;
  reason: string;
  sharedTerms: string[];
  autoCreated: boolean;
};

export type CreatedContradictionEdge = {
  id: string;
  relation: "contradicts";
  sourceNodeId: string;
  targetNodeId: string;
  claimId: string;
};

export type DetectContradictionsResult = {
  aiJobId: string;
  target: DetectContradictionsEntity;
  contradictions: ContradictionCandidate[];
  createdEdges: CreatedContradictionEdge[];
};

export type DetectContradictionsRepository = {
  findTarget(input: {
    userId: string;
    targetType: DetectContradictionsTargetType;
    targetId: string;
  }): Promise<DetectContradictionsEntity | null>;
  findClaimCandidates(input: {
    userId: string;
    target: DetectContradictionsEntity;
  }): Promise<Array<{ id: string; mapId: string; text: string }>>;
  findGraphNode(input: {
    userId: string;
    entity: DetectContradictionsEntity;
  }): Promise<{ id: string } | null>;
  insertGraphNode(record: {
    id: string;
    userId: string;
    entity: DetectContradictionsEntity;
    createdAt: Date;
  }): Promise<void>;
  findGraphEdge(input: {
    userId: string;
    sourceNodeId: string;
    targetNodeId: string;
  }): Promise<{ id: string } | null>;
  insertGraphEdge(record: {
    id: string;
    userId: string;
    mapId: string;
    sourceNodeId: string;
    targetNodeId: string;
    confidenceBps: number;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }): Promise<void>;
  insertAIJob(record: {
    userId: string;
    inputJson: Record<string, unknown>;
    createdAt: Date;
  }): Promise<{ id: string }>;
  completeAIJob(record: {
    id: string;
    outputJson: Record<string, unknown>;
    completedAt: Date;
  }): Promise<void>;
  failAIJob(record: {
    id: string;
    errorMessage: string;
    completedAt: Date;
  }): Promise<void>;
  insertActivityEvent(record: {
    id: string;
    userId: string;
    aiJobId: string;
    target: DetectContradictionsEntity;
    graphEdgeId: string | null;
    outputJson: Record<string, unknown>;
    createdAt: Date;
  }): Promise<void>;
};

export type DetectContradictionsDependencies = {
  createId?: () => string;
  now?: () => Date;
};

type NormalizedDetectContradictionsInput = {
  userId: string;
  targetType: DetectContradictionsTargetType;
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
  "by",
  "for",
  "from",
  "in",
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
  ["win", "lose"],
  ["works", "fails"],
];

export class DetectContradictionsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DetectContradictionsValidationError";
  }
}

export class DetectContradictionsTargetNotFoundError extends Error {
  constructor(targetType: string, targetId: string) {
    super(`Target ${targetType} not found for detectContradictions: ${targetId}`);
    this.name = "DetectContradictionsTargetNotFoundError";
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DetectContradictionsValidationError("detectContradictions input must be an object.");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string, maxLength = 200): string {
  if (typeof value !== "string") {
    throw new DetectContradictionsValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new DetectContradictionsValidationError(`${fieldName} must not be empty.`);
  }

  if (trimmed.length > maxLength) {
    throw new DetectContradictionsValidationError(`${fieldName} must be at most ${maxLength} character(s).`);
  }

  return trimmed;
}

function readTargetType(value: unknown): DetectContradictionsTargetType {
  if (value === "thought" || value === "claim") {
    return value;
  }

  throw new DetectContradictionsValidationError("targetType must be either thought or claim.");
}

function readOptionalBoolean(value: unknown, fieldName: string): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value !== "boolean") {
    throw new DetectContradictionsValidationError(`${fieldName} must be a boolean when provided.`);
  }

  return value;
}

export function validateDetectContradictionsInput(input: unknown): NormalizedDetectContradictionsInput {
  const object = asObject(input);

  return {
    userId: readRequiredString(object.userId, "userId"),
    targetType: readTargetType(object.targetType),
    targetId: readRequiredString(object.targetId, "targetId"),
    autoCreate: readOptionalBoolean(object.autoCreate, "autoCreate"),
  };
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length > 2 && !STOPWORDS.has(word)),
    ),
  );
}

function hasNegation(tokens: string[]) {
  return tokens.some((token) => NEGATION_TERMS.has(token));
}

function hasAntonymPair(leftTokens: Set<string>, rightTokens: Set<string>) {
  return ANTONYM_PAIRS.some(
    ([left, right]) => (leftTokens.has(left) && rightTokens.has(right)) || (leftTokens.has(right) && rightTokens.has(left)),
  );
}

function scoreContradiction(
  target: DetectContradictionsEntity,
  candidate: { id: string; mapId: string; text: string },
): ContradictionCandidate | null {
  const targetTokens = tokenize(target.text);
  const candidateTokens = tokenize(candidate.text);
  const targetTokenSet = new Set(targetTokens);
  const candidateTokenSet = new Set(candidateTokens);
  const sharedTerms = targetTokens.filter((token) => candidateTokenSet.has(token));
  const negationMismatch = hasNegation(targetTokens) !== hasNegation(candidateTokens);
  const antonymPair = hasAntonymPair(targetTokenSet, candidateTokenSet);

  if (sharedTerms.length < 2 || (!negationMismatch && !antonymPair)) {
    return null;
  }

  const unionSize = new Set([...targetTokens, ...candidateTokens]).size || 1;
  const jaccard = sharedTerms.length / unionSize;
  const confidenceBps = Math.min(9600, Math.round(5200 + sharedTerms.length * 650 + jaccard * 2200 + (antonymPair ? 500 : 0)));

  return {
    claimId: candidate.id,
    confidenceBps,
    reason: `${negationMismatch ? "Negation differs" : "Opposing terms appear"} while sharing ${sharedTerms.join(", ")}.`,
    sharedTerms,
    autoCreated: false,
  };
}

function buildContradictions(
  target: DetectContradictionsEntity,
  candidates: Array<{ id: string; mapId: string; text: string }>,
): ContradictionCandidate[] {
  return candidates
    .filter((candidate) => target.type !== "claim" || candidate.id !== target.id)
    .map((candidate) => scoreContradiction(target, candidate))
    .filter((candidate): candidate is ContradictionCandidate => Boolean(candidate))
    .sort((left, right) => right.confidenceBps - left.confidenceBps)
    .slice(0, 6);
}

async function ensureGraphNode(input: {
  repository: DetectContradictionsRepository;
  userId: string;
  entity: DetectContradictionsEntity;
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

async function autoCreateContradictionEdges(input: {
  userId: string;
  target: DetectContradictionsEntity;
  candidates: Array<{ id: string; mapId: string; text: string }>;
  contradictions: ContradictionCandidate[];
  repository: DetectContradictionsRepository;
  createId: () => string;
  now: Date;
}): Promise<CreatedContradictionEdge[]> {
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

  const createdEdges: CreatedContradictionEdge[] = [];

  for (const contradiction of input.contradictions) {
    const candidate = input.candidates.find((item) => item.id === contradiction.claimId && item.mapId === input.target.mapId);

    if (!candidate) {
      continue;
    }

    const candidateNode = await ensureGraphNode({
      repository: input.repository,
      userId: input.userId,
      entity: {
        type: "claim",
        id: candidate.id,
        mapId: candidate.mapId,
        text: candidate.text,
      },
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
    });

    if (existingEdge) {
      contradiction.autoCreated = true;
      createdEdges.push({
        id: existingEdge.id,
        relation: "contradicts",
        sourceNodeId: targetNode.id,
        targetNodeId: candidateNode.id,
        claimId: contradiction.claimId,
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
      confidenceBps: contradiction.confidenceBps,
      metadata: {
        operation: "detectContradictions",
        reason: contradiction.reason,
        sharedTerms: contradiction.sharedTerms,
        claimId: contradiction.claimId,
      },
      createdAt: input.now,
    });

    contradiction.autoCreated = true;
    createdEdges.push({
      id,
      relation: "contradicts",
      sourceNodeId: targetNode.id,
      targetNodeId: candidateNode.id,
      claimId: contradiction.claimId,
    });
  }

  return createdEdges;
}

function buildOutputJson(result: Omit<DetectContradictionsResult, "aiJobId">): Record<string, unknown> {
  return {
    target: result.target,
    contradictions: result.contradictions,
    createdEdges: result.createdEdges,
  };
}

export async function detectContradictions(
  input: unknown,
  repository?: DetectContradictionsRepository,
  dependencies: DetectContradictionsDependencies = {},
): Promise<DetectContradictionsResult> {
  const normalized = validateDetectContradictionsInput(input);
  const resolvedRepository = repository ?? createDetectContradictionsRepository(getDb());
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now?.() ?? new Date();
  const aiJob = await resolvedRepository.insertAIJob({
    userId: normalized.userId,
    inputJson: {
      targetType: normalized.targetType,
      targetId: normalized.targetId,
      autoCreate: normalized.autoCreate,
    },
    createdAt: now,
  });

  try {
    const target = await resolvedRepository.findTarget(normalized);

    if (!target) {
      throw new DetectContradictionsTargetNotFoundError(normalized.targetType, normalized.targetId);
    }

    const candidates = await resolvedRepository.findClaimCandidates({
      userId: normalized.userId,
      target,
    });
    const contradictions = buildContradictions(target, candidates);
    const createdEdges = normalized.autoCreate
      ? await autoCreateContradictionEdges({
          userId: normalized.userId,
          target,
          candidates,
          contradictions,
          repository: resolvedRepository,
          createId,
          now,
        })
      : [];
    const outputJson = buildOutputJson({
      target,
      contradictions,
      createdEdges,
    });

    await resolvedRepository.completeAIJob({
      id: aiJob.id,
      outputJson,
      completedAt: now,
    });
    await resolvedRepository.insertActivityEvent({
      id: createId(),
      userId: normalized.userId,
      aiJobId: aiJob.id,
      target,
      graphEdgeId: createdEdges[0]?.id ?? null,
      outputJson,
      createdAt: now,
    });

    return {
      aiJobId: aiJob.id,
      target,
      contradictions,
      createdEdges,
    };
  } catch (error) {
    await resolvedRepository.failAIJob({
      id: aiJob.id,
      errorMessage: error instanceof Error ? error.message : "Unknown detectContradictions failure.",
      completedAt: now,
    });

    throw error;
  }
}

export function createDetectContradictionsRepository(db: DbClient): DetectContradictionsRepository {
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
    async findClaimCandidates(input) {
      const rows = await db
        .select({
          id: claims.id,
          mapId: claims.mapId,
          text: claims.body,
        })
        .from(claims)
        .where(
          input.target.mapId
            ? and(eq(claims.userId, input.userId), eq(claims.mapId, input.target.mapId))
            : eq(claims.userId, input.userId),
        );

      return rows;
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
          operation: "detectContradictions",
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
            eq(graphEdges.kind, "contradicts"),
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
        kind: "contradicts",
        weightBps: record.confidenceBps,
        metadataJson: record.metadata,
        createdAt: record.createdAt,
        updatedAt: record.createdAt,
      });
    },
    async insertAIJob(record) {
      const rows = await db
        .insert(aiJobs)
        .values({
          userId: record.userId,
          operation: AI_OPERATIONS.detectContradictions,
          promptVersionId: null,
          status: "queued",
          inputJson: record.inputJson,
          outputJson: null,
          errorMessage: null,
          createdAt: record.createdAt,
          updatedAt: record.createdAt,
          startedAt: record.createdAt,
          completedAt: null,
        })
        .returning({ id: aiJobs.id });

      const row = rows[0];

      if (!row) {
        throw new Error("Failed to create detectContradictions AI job.");
      }

      return row;
    },
    async completeAIJob(record) {
      await db
        .update(aiJobs)
        .set({
          status: "succeeded",
          outputJson: record.outputJson,
          errorMessage: null,
          updatedAt: record.completedAt,
          completedAt: record.completedAt,
        })
        .where(eq(aiJobs.id, record.id));
    },
    async failAIJob(record) {
      await db
        .update(aiJobs)
        .set({
          status: "failed",
          outputJson: null,
          errorMessage: record.errorMessage,
          updatedAt: record.completedAt,
          completedAt: record.completedAt,
        })
        .where(eq(aiJobs.id, record.id));
    },
    async insertActivityEvent(record) {
      await db.insert(activityEvents).values({
        id: record.id,
        userId: record.userId,
        sessionId: null,
        mapId: record.target.mapId,
        thoughtId: record.target.type === "thought" ? record.target.id : null,
        claimId: record.target.type === "claim" ? record.target.id : null,
        graphNodeId: null,
        graphEdgeId: record.graphEdgeId,
        confidenceRatingId: null,
        promptVersionId: null,
        aiJobId: record.aiJobId,
        aggregateType: "ai_job",
        aggregateId: record.aiJobId,
        type: "ai.detect_contradictions.completed",
        payloadJson: record.outputJson,
        requestId: null,
        createdAt: record.createdAt,
      });
    },
  };
}
