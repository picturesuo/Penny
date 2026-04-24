import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logBackendError } from "../../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../server/auth/get-request-user-id.ts";
import { getDb } from "../../../../../../server/db/client.ts";
import { graphEdges, graphNodes } from "../../../../../../server/db/schema.ts";

class GraphEdgeValidationError extends Error {}
class GraphEdgeNodeNotFoundError extends Error {}
class GraphEdgeMapMismatchError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function readRequiredUuid(body: Record<string, unknown>, key: string) {
  const value = body[key];

  if (typeof value !== "string" || !isUuid(value.trim())) {
    throw new GraphEdgeValidationError(`${key} must be a UUID.`);
  }

  return value.trim();
}

function readOptionalUuid(body: Record<string, unknown>, key: string) {
  const value = body[key];

  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !isUuid(value.trim())) {
    throw new GraphEdgeValidationError(`${key} must be a UUID.`);
  }

  return value.trim();
}

function readKind(body: Record<string, unknown>) {
  const value = body.kind ?? body.type;

  if (typeof value !== "string" || !value.trim()) {
    throw new GraphEdgeValidationError("kind or type is required.");
  }

  return value.trim();
}

function readOptionalWeightBps(body: Record<string, unknown>): number | null {
  const value = body.weightBps;

  if (value == null) {
    return null;
  }

  if (typeof value !== "number") {
    throw new GraphEdgeValidationError("weightBps must be an integer between 0 and 10000.");
  }

  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new GraphEdgeValidationError("weightBps must be an integer between 0 and 10000.");
  }

  return value;
}

function readOptionalMetadata(body: Record<string, unknown>) {
  const value = body.metadata;

  if (value == null) {
    return null;
  }

  if (!isObject(value)) {
    throw new GraphEdgeValidationError("metadata must be a JSON object.");
  }

  return value;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  const metadata = isObject(row.metadataJson) ? row.metadataJson : null;

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

async function createGraphEdge(input: {
  userId: string;
  sourceNodeId: string;
  targetNodeId: string;
  mapId: string | null;
  kind: string;
  weightBps: number | null;
  metadata: Record<string, unknown> | null;
}) {
  const db = getDb();
  const nodeRows = await db
    .select({
      id: graphNodes.id,
      mapId: graphNodes.mapId,
    })
    .from(graphNodes)
    .where(and(eq(graphNodes.userId, input.userId), inArray(graphNodes.id, [input.sourceNodeId, input.targetNodeId])));
  const sourceNode = nodeRows.find((node) => node.id === input.sourceNodeId) ?? null;
  const targetNode = nodeRows.find((node) => node.id === input.targetNodeId) ?? null;

  if (!sourceNode || !targetNode) {
    throw new GraphEdgeNodeNotFoundError("Source or target graph node not found.");
  }

  if (sourceNode.mapId !== targetNode.mapId) {
    throw new GraphEdgeMapMismatchError("Graph edge endpoints must belong to the same map.");
  }

  if (input.mapId && input.mapId !== sourceNode.mapId) {
    throw new GraphEdgeMapMismatchError("mapId must match the source and target graph nodes.");
  }

  const existingRows = await db
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
        eq(graphEdges.sourceNodeId, input.sourceNodeId),
        eq(graphEdges.targetNodeId, input.targetNodeId),
        eq(graphEdges.kind, input.kind),
      ),
    )
    .limit(1);
  const existingEdge = existingRows[0] ?? null;

  if (existingEdge) {
    return {
      edge: serializeEdge(existingEdge),
      created: false,
    };
  }

  const now = new Date();
  const id = randomUUID();

  await db.insert(graphEdges).values({
    id,
    userId: input.userId,
    mapId: sourceNode.mapId,
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    kind: input.kind,
    weightBps: input.weightBps,
    metadataJson: input.metadata,
    createdAt: now,
    updatedAt: now,
  });

  return {
    edge: {
      id,
      source: input.sourceNodeId,
      target: input.targetNodeId,
      kind: input.kind,
      label: readOptionalString(input.metadata?.label) ?? input.kind,
      status: readOptionalString(input.metadata?.status) ?? undefined,
      strength: readOptionalNumber(input.metadata?.strength) ?? (typeof input.weightBps === "number" ? input.weightBps / 10_000 : undefined),
      weightBps: input.weightBps,
      metadata: input.metadata,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    created: true,
  };
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isObject(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  try {
    const userId = getRequestUserId(request.headers);
    const result = await createGraphEdge({
      userId,
      sourceNodeId: readRequiredUuid(body, "sourceNodeId"),
      targetNodeId: readRequiredUuid(body, "targetNodeId"),
      mapId: readOptionalUuid(body, "mapId"),
      kind: readKind(body),
      weightBps: readOptionalWeightBps(body),
      metadata: readOptionalMetadata(body),
    });

    return NextResponse.json({ edge: result.edge }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof GraphEdgeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof GraphEdgeNodeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof GraphEdgeMapMismatchError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    logBackendError({ error, request, route: "POST /api/graph/edges" });
    return NextResponse.json({ error: "Failed to create graph edge." }, { status: 500 });
  }
}
