import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logBackendError } from "../../../../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../../../server/auth/get-request-user-id.ts";
import { getDb } from "../../../../../../../../server/db/client.ts";
import { claims, confidenceRatings, graphNodes, thoughts } from "../../../../../../../../server/db/schema.ts";

type RouteContext = {
  params:
    | Promise<{ targetType: string; targetId: string }>
    | { targetType: string; targetId: string };
};

type ConfidenceTarget = {
  type: "thought" | "claim" | "graph_node";
  id: string;
};

type ConfidenceHistoryRow = {
  id: string;
  ratingBps: number;
  rationale: string | null;
  source: string;
  createdAt: Date;
};

class ConfidenceHistoryValidationError extends Error {}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function readTargetId(value: string) {
  const trimmed = value.trim();

  if (!isUuid(trimmed)) {
    throw new ConfidenceHistoryValidationError("Invalid target id. Expected a UUID.");
  }

  return trimmed;
}

function readTargetType(value: string): ConfidenceTarget["type"] {
  const normalized = value.trim().toLowerCase();

  if (normalized === "thought" || normalized === "thoughts") {
    return "thought";
  }

  if (normalized === "claim" || normalized === "claims") {
    return "claim";
  }

  if (
    normalized === "graphnode" ||
    normalized === "graphnodes" ||
    normalized === "graph-node" ||
    normalized === "graph-nodes" ||
    normalized === "graph_node" ||
    normalized === "graph_nodes"
  ) {
    return "graph_node";
  }

  throw new ConfidenceHistoryValidationError("targetType must be thought, claim, or graphNode.");
}

async function assertOwnedTarget(input: { userId: string; target: ConfidenceTarget }) {
  const db = getDb();

  if (input.target.type === "thought") {
    const rows = await db
      .select({ id: thoughts.id })
      .from(thoughts)
      .where(and(eq(thoughts.id, input.target.id), eq(thoughts.userId, input.userId)))
      .limit(1);

    return Boolean(rows[0]);
  }

  if (input.target.type === "claim") {
    const rows = await db
      .select({ id: claims.id })
      .from(claims)
      .where(and(eq(claims.id, input.target.id), eq(claims.userId, input.userId)))
      .limit(1);

    return Boolean(rows[0]);
  }

  const rows = await db
    .select({ id: graphNodes.id })
    .from(graphNodes)
    .where(and(eq(graphNodes.id, input.target.id), eq(graphNodes.userId, input.userId)))
    .limit(1);

  return Boolean(rows[0]);
}

async function buildConfidenceHistory(input: { userId: string; target: ConfidenceTarget }) {
  const db = getDb();
  const targetExists = await assertOwnedTarget(input);

  if (!targetExists) {
    return null;
  }

  const whereClause =
    input.target.type === "thought"
      ? and(eq(confidenceRatings.userId, input.userId), eq(confidenceRatings.thoughtId, input.target.id))
      : input.target.type === "claim"
        ? and(eq(confidenceRatings.userId, input.userId), eq(confidenceRatings.claimId, input.target.id))
        : and(eq(confidenceRatings.userId, input.userId), eq(confidenceRatings.graphNodeId, input.target.id));

  const rows = await db
    .select({
      id: confidenceRatings.id,
      ratingBps: confidenceRatings.ratingBps,
      rationale: confidenceRatings.rationale,
      source: confidenceRatings.source,
      createdAt: confidenceRatings.createdAt,
    })
    .from(confidenceRatings)
    .where(whereClause)
    .orderBy(desc(confidenceRatings.createdAt), desc(confidenceRatings.id));

  const historyRows: ConfidenceHistoryRow[] = rows;

  return {
    target: input.target,
    history: historyRows.map((row) => ({
      id: row.id,
      ratingBps: row.ratingBps,
      confidence: row.ratingBps / 100,
      rationale: row.rationale,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = getRequestUserId(request.headers);
    const params = await Promise.resolve(context.params);
    const target = {
      type: readTargetType(params.targetType),
      id: readTargetId(params.targetId),
    };
    const result = await buildConfidenceHistory({ userId, target });

    if (!result) {
      return NextResponse.json({ error: "Confidence target not found." }, { status: 404 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ConfidenceHistoryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logBackendError({ error, request, route: "GET /api/confidence/[targetType]/[targetId]/history" });
    return NextResponse.json({ error: "Failed to load confidence history." }, { status: 500 });
  }
}
