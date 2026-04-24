import { and, desc, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logBackendError } from "../../../../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../../../server/auth/get-request-user-id.ts";
import { getDb } from "../../../../../../../../server/db/client.ts";
import { confidenceRatings, graphEdges, graphNodes } from "../../../../../../../../server/db/schema.ts";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

class GraphNodeDetailValidationError extends Error {}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function readNodeId(value: string) {
  const trimmed = value.trim();

  if (!isUuid(trimmed)) {
    throw new GraphNodeDetailValidationError("Invalid node id. Expected a UUID.");
  }

  return trimmed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function defaultCluster(kind: string) {
  if (kind === "map") {
    return "map";
  }

  if (kind === "claim") {
    return "claim";
  }

  if (kind === "round") {
    return "challenge";
  }

  if (kind === "critique") {
    return "critique";
  }

  if (kind === "learn") {
    return "learn";
  }

  return "context";
}

function serializeNode(row: {
  id: string;
  sessionId: string | null;
  mapId: string;
  claimId: string | null;
  thoughtId: string | null;
  kind: string;
  label: string;
  metadataJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  const metadata = asRecord(row.metadataJson);

  return {
    id: row.id,
    sessionId: row.sessionId,
    mapId: row.mapId,
    claimId: row.claimId,
    thoughtId: row.thoughtId,
    label: row.label,
    kind: row.kind,
    cluster: readOptionalString(metadata?.cluster) ?? defaultCluster(row.kind),
    description: readOptionalString(metadata?.description) ?? undefined,
    status: readOptionalString(metadata?.status) ?? undefined,
    confidenceBps: readOptionalNumber(metadata?.confidenceBps) ?? undefined,
    x: readOptionalNumber(metadata?.x) ?? undefined,
    y: readOptionalNumber(metadata?.y) ?? undefined,
    metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeEdge(row: {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: string;
  weightBps: number | null;
  metadataJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  const metadata = asRecord(row.metadataJson);

  return {
    id: row.id,
    source: row.sourceNodeId,
    target: row.targetNodeId,
    kind: row.kind,
    label: readOptionalString(metadata?.label) ?? row.kind,
    status: readOptionalString(metadata?.status) ?? undefined,
    strength: readOptionalNumber(metadata?.strength) ?? (typeof row.weightBps === "number" ? row.weightBps / 10_000 : undefined),
    weightBps: row.weightBps,
    metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function buildGraphNodeDetail(input: { userId: string; nodeId: string }) {
  const db = getDb();
  const nodeRows = await db
    .select({
      id: graphNodes.id,
      sessionId: graphNodes.sessionId,
      mapId: graphNodes.mapId,
      claimId: graphNodes.claimId,
      thoughtId: graphNodes.thoughtId,
      kind: graphNodes.kind,
      label: graphNodes.label,
      metadataJson: graphNodes.metadataJson,
      createdAt: graphNodes.createdAt,
      updatedAt: graphNodes.updatedAt,
    })
    .from(graphNodes)
    .where(and(eq(graphNodes.id, input.nodeId), eq(graphNodes.userId, input.userId)))
    .limit(1);
  const node = nodeRows[0] ?? null;

  if (!node) {
    return null;
  }

  const edgeRows = await db
    .select({
      id: graphEdges.id,
      sourceNodeId: graphEdges.sourceNodeId,
      targetNodeId: graphEdges.targetNodeId,
      kind: graphEdges.kind,
      weightBps: graphEdges.weightBps,
      metadataJson: graphEdges.metadataJson,
      createdAt: graphEdges.createdAt,
      updatedAt: graphEdges.updatedAt,
    })
    .from(graphEdges)
    .where(
      and(
        eq(graphEdges.userId, input.userId),
        or(eq(graphEdges.sourceNodeId, input.nodeId), eq(graphEdges.targetNodeId, input.nodeId)),
      ),
    )
    .orderBy(desc(graphEdges.createdAt), desc(graphEdges.id));

  const ratingRows = await db
    .select({
      id: confidenceRatings.id,
      ratingBps: confidenceRatings.ratingBps,
      rationale: confidenceRatings.rationale,
      source: confidenceRatings.source,
      createdAt: confidenceRatings.createdAt,
    })
    .from(confidenceRatings)
    .where(and(eq(confidenceRatings.userId, input.userId), eq(confidenceRatings.graphNodeId, input.nodeId)))
    .orderBy(desc(confidenceRatings.createdAt), desc(confidenceRatings.id));

  return {
    node: serializeNode(node),
    incomingEdges: edgeRows.filter((edge) => edge.targetNodeId === input.nodeId).map(serializeEdge),
    outgoingEdges: edgeRows.filter((edge) => edge.sourceNodeId === input.nodeId).map(serializeEdge),
    confidenceRatings: ratingRows.map((rating) => ({
      id: rating.id,
      ratingBps: rating.ratingBps,
      rationale: rating.rationale,
      source: rating.source,
      createdAt: rating.createdAt.toISOString(),
    })),
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = getRequestUserId(request.headers);
    const params = await Promise.resolve(context.params);
    const detail = await buildGraphNodeDetail({
      userId,
      nodeId: readNodeId(params.id),
    });

    if (!detail) {
      return NextResponse.json({ error: "Graph node not found." }, { status: 404 });
    }

    return NextResponse.json(detail, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof GraphNodeDetailValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logBackendError({ error, request, route: "GET /api/graph/nodes/[id]/detail" });
    return NextResponse.json({ error: "Failed to build graph node detail." }, { status: 500 });
  }
}
