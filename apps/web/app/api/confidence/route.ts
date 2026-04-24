import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { apiError, apiOk, invalidJsonResponse, invalidObjectResponse } from "../../../lib/api/response";
import { logBackendError } from "../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";
import { getDb } from "../../../../../server/db/client.ts";
import { activityEvents, claims, confidenceRatings, graphNodes, movesEvents, thoughts } from "../../../../../server/db/schema.ts";
import { getIdempotencyKey } from "../../../../../server/idempotency/get-idempotency-key.ts";

type ConfidenceTarget = {
  key: "thoughtId" | "claimId" | "graphNodeId";
  id: string;
  aggregateType: "thought" | "claim" | "graph_node";
};

class ConfidenceValidationError extends Error {}
class ConfidenceTargetNotFoundError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function hasKey(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function readUuid(value: unknown, key: string) {
  if (typeof value !== "string" || !isUuid(value.trim())) {
    throw new ConfidenceValidationError(`${key} must be a UUID.`);
  }

  return value.trim();
}

function readTarget(body: Record<string, unknown>): ConfidenceTarget {
  const targetKeys = ["thoughtId", "claimId", "graphNodeId"] as const;
  const presentKeys = targetKeys.filter((key) => body[key] != null && body[key] !== "");

  if (presentKeys.length !== 1) {
    throw new ConfidenceValidationError("Exactly one of thoughtId, claimId, or graphNodeId is required.");
  }

  const key = presentKeys[0];
  const aggregateTypes = {
    thoughtId: "thought",
    claimId: "claim",
    graphNodeId: "graph_node",
  } as const;

  return {
    key,
    id: readUuid(body[key], key),
    aggregateType: aggregateTypes[key],
  };
}

function readRatingBps(body: Record<string, unknown>) {
  const hasConfidence = hasKey(body, "confidence");
  const hasRatingBps = hasKey(body, "ratingBps");

  if (hasConfidence === hasRatingBps) {
    throw new ConfidenceValidationError("Exactly one of confidence or ratingBps is required.");
  }

  if (hasRatingBps) {
    const value = body.ratingBps;

    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10_000) {
      throw new ConfidenceValidationError("ratingBps must be an integer between 0 and 10000.");
    }

    return value;
  }

  const value = body.confidence;

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new ConfidenceValidationError("confidence must be a number between 0 and 100.");
  }

  return Math.round(value * 100);
}

function readOptionalText(body: Record<string, unknown>, key: string, maxLength: number) {
  const value = body[key];

  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ConfidenceValidationError(`${key} must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function readSource(body: Record<string, unknown>) {
  return readOptionalText(body, "source", 80) ?? "manual";
}

async function assertOwnedTarget(input: { userId: string; target: ConfidenceTarget }) {
  const db = getDb();

  if (input.target.key === "thoughtId") {
    const rows = await db
      .select({ id: thoughts.id })
      .from(thoughts)
      .where(and(eq(thoughts.id, input.target.id), eq(thoughts.userId, input.userId)))
      .limit(1);

    if (!rows[0]) {
      throw new ConfidenceTargetNotFoundError("Confidence target not found.");
    }

    return;
  }

  if (input.target.key === "claimId") {
    const rows = await db
      .select({ id: claims.id })
      .from(claims)
      .where(and(eq(claims.id, input.target.id), eq(claims.userId, input.userId)))
      .limit(1);

    if (!rows[0]) {
      throw new ConfidenceTargetNotFoundError("Confidence target not found.");
    }

    return;
  }

  const rows = await db
    .select({ id: graphNodes.id })
    .from(graphNodes)
    .where(and(eq(graphNodes.id, input.target.id), eq(graphNodes.userId, input.userId)))
    .limit(1);

  if (!rows[0]) {
    throw new ConfidenceTargetNotFoundError("Confidence target not found.");
  }
}

function serializeConfidence(row: {
  id: string;
  thoughtId: string | null;
  claimId: string | null;
  graphNodeId: string | null;
  ratingBps: number;
  rationale: string | null;
  source: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    thoughtId: row.thoughtId,
    claimId: row.claimId,
    graphNodeId: row.graphNodeId,
    ratingBps: row.ratingBps,
    confidence: row.ratingBps / 100,
    rationale: row.rationale,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}

async function recordConfidence(input: {
  userId: string;
  target: ConfidenceTarget;
  ratingBps: number;
  rationale: string | null;
  source: string;
  requestId: string;
}) {
  const db = getDb();

  await assertOwnedTarget({ userId: input.userId, target: input.target });

  const now = new Date();
  const [row] = await db.transaction(async (tx) => {
    const [createdRating] = await tx
      .insert(confidenceRatings)
      .values({
        userId: input.userId,
        thoughtId: input.target.key === "thoughtId" ? input.target.id : null,
        claimId: input.target.key === "claimId" ? input.target.id : null,
        graphNodeId: input.target.key === "graphNodeId" ? input.target.id : null,
        ratingBps: input.ratingBps,
        rationale: input.rationale,
        source: input.source,
        createdAt: now,
      })
      .returning({
        id: confidenceRatings.id,
        thoughtId: confidenceRatings.thoughtId,
        claimId: confidenceRatings.claimId,
        graphNodeId: confidenceRatings.graphNodeId,
        ratingBps: confidenceRatings.ratingBps,
        rationale: confidenceRatings.rationale,
        source: confidenceRatings.source,
        createdAt: confidenceRatings.createdAt,
      });

    await tx.insert(movesEvents).values({
      userId: input.userId,
      aggregateType: input.target.aggregateType,
      aggregateId: input.target.id,
      type: "confidence.recorded",
      requestId: input.requestId,
      payloadJson: {
        confidenceRatingId: createdRating.id,
        ratingBps: input.ratingBps,
        source: input.source,
        target: {
          type: input.target.aggregateType,
          id: input.target.id,
        },
      },
      createdAt: now,
    });

    await tx.insert(activityEvents).values({
      userId: input.userId,
      thoughtId: input.target.key === "thoughtId" ? input.target.id : null,
      claimId: input.target.key === "claimId" ? input.target.id : null,
      graphNodeId: input.target.key === "graphNodeId" ? input.target.id : null,
      confidenceRatingId: createdRating.id,
      aggregateType: input.target.aggregateType,
      aggregateId: input.target.id,
      type: "confidence.recorded",
      requestId: input.requestId,
      payloadJson: {
        confidenceRatingId: createdRating.id,
        ratingBps: input.ratingBps,
        source: input.source,
        target: {
          type: input.target.aggregateType,
          id: input.target.id,
        },
      },
      createdAt: now,
    });

    return [createdRating];
  });

  return serializeConfidence(row);
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return invalidJsonResponse();
  }

  if (!isObject(body)) {
    return invalidObjectResponse();
  }

  try {
    const userId = getRequestUserId(request.headers);
    const confidence = await recordConfidence({
      userId,
      target: readTarget(body),
      ratingBps: readRatingBps(body),
      rationale: readOptionalText(body, "rationale", 1000),
      source: readSource(body),
      requestId: getIdempotencyKey(request.headers, body) ?? randomUUID(),
    });

    return apiOk({ confidence }, 201);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof ConfidenceValidationError) {
      return apiError(error.message, 400);
    }

    if (error instanceof ConfidenceTargetNotFoundError) {
      return apiError(error.message, 404);
    }

    logBackendError({ error, request, route: "POST /api/confidence" });
    return apiError("Failed to record confidence.", 500);
  }
}
