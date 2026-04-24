import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logBackendError } from "../../../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../../server/auth/get-request-user-id.ts";
import { getDb } from "../../../../../../../server/db/client.ts";
import { graphEdges } from "../../../../../../../server/db/schema.ts";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

class GraphEdgeValidationError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function readEdgeId(value: string) {
  const trimmed = value.trim();

  if (!isUuid(trimmed)) {
    throw new GraphEdgeValidationError("Invalid edge id. Expected a UUID.");
  }

  return trimmed;
}

function hasKey(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function readOptionalKind(body: Record<string, unknown>) {
  if (!hasKey(body, "kind") && !hasKey(body, "type")) {
    return undefined;
  }

  const value = body.kind ?? body.type;

  if (typeof value !== "string" || !value.trim()) {
    throw new GraphEdgeValidationError("kind or type must be a non-empty string.");
  }

  return value.trim();
}

function readOptionalWeightBps(body: Record<string, unknown>) {
  if (!hasKey(body, "weightBps")) {
    return undefined;
  }

  const value = body.weightBps;

  if (value == null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new GraphEdgeValidationError("weightBps must be an integer between 0 and 10000.");
  }

  return value;
}

function readOptionalMetadata(body: Record<string, unknown>) {
  if (!hasKey(body, "metadata")) {
    return undefined;
  }

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

async function updateGraphEdge(input: {
  userId: string;
  edgeId: string;
  kind: string | undefined;
  weightBps: number | null | undefined;
  metadata: Record<string, unknown> | null | undefined;
}) {
  const db = getDb();
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
    .where(and(eq(graphEdges.id, input.edgeId), eq(graphEdges.userId, input.userId)))
    .limit(1);
  const existingEdge = existingRows[0] ?? null;

  if (!existingEdge) {
    return null;
  }

  const updates: {
    kind?: string;
    weightBps?: number | null;
    metadataJson?: Record<string, unknown> | null;
    updatedAt?: Date;
  } = {};

  if (input.kind !== undefined) {
    updates.kind = input.kind;
  }

  if (input.weightBps !== undefined) {
    updates.weightBps = input.weightBps;
  }

  if (input.metadata !== undefined) {
    updates.metadataJson = input.metadata;
  }

  if (!Object.keys(updates).length) {
    return serializeEdge(existingEdge);
  }

  updates.updatedAt = new Date();

  const updatedRows = await db
    .update(graphEdges)
    .set(updates)
    .where(and(eq(graphEdges.id, input.edgeId), eq(graphEdges.userId, input.userId)))
    .returning({
      id: graphEdges.id,
      sourceNodeId: graphEdges.sourceNodeId,
      targetNodeId: graphEdges.targetNodeId,
      kind: graphEdges.kind,
      weightBps: graphEdges.weightBps,
      metadataJson: graphEdges.metadataJson,
      createdAt: graphEdges.createdAt,
      updatedAt: graphEdges.updatedAt,
    });

  return serializeEdge(updatedRows[0] ?? existingEdge);
}

async function deleteGraphEdge(input: { userId: string; edgeId: string }) {
  const db = getDb();
  const deletedRows = await db
    .delete(graphEdges)
    .where(and(eq(graphEdges.id, input.edgeId), eq(graphEdges.userId, input.userId)))
    .returning({
      id: graphEdges.id,
      sourceNodeId: graphEdges.sourceNodeId,
      targetNodeId: graphEdges.targetNodeId,
      kind: graphEdges.kind,
      weightBps: graphEdges.weightBps,
      metadataJson: graphEdges.metadataJson,
      createdAt: graphEdges.createdAt,
      updatedAt: graphEdges.updatedAt,
    });

  return deletedRows[0] ? serializeEdge(deletedRows[0]) : null;
}

export async function PATCH(request: Request, context: RouteContext) {
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
    const params = await Promise.resolve(context.params);
    const edge = await updateGraphEdge({
      userId,
      edgeId: readEdgeId(params.id),
      kind: readOptionalKind(body),
      weightBps: readOptionalWeightBps(body),
      metadata: readOptionalMetadata(body),
    });

    if (!edge) {
      return NextResponse.json({ error: "Graph edge not found." }, { status: 404 });
    }

    return NextResponse.json({ edge }, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof GraphEdgeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logBackendError({ error, request, route: "PATCH /api/graph/edges/[id]" });
    return NextResponse.json({ error: "Failed to update graph edge." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const userId = getRequestUserId(request.headers);
    const params = await Promise.resolve(context.params);
    const edge = await deleteGraphEdge({
      userId,
      edgeId: readEdgeId(params.id),
    });

    if (!edge) {
      return NextResponse.json({ error: "Graph edge not found." }, { status: 404 });
    }

    return NextResponse.json({ edge, deleted: true }, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof GraphEdgeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logBackendError({ error, request, route: "DELETE /api/graph/edges/[id]" });
    return NextResponse.json({ error: "Failed to delete graph edge." }, { status: 500 });
  }
}
