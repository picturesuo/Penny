import { and, asc, eq, inArray } from "drizzle-orm";

import { apiError, apiOk } from "../../../lib/api/response";
import { logBackendError } from "../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";
import { getDb } from "../../../../../server/db/client.ts";
import { graphEdges, graphNodes } from "../../../../../server/db/schema.ts";

class GraphQueryValidationError extends Error {}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function readOptionalUuid(value: string | null, name: string) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (!isUuid(trimmed)) {
    throw new GraphQueryValidationError(`Invalid ${name}. Expected a UUID.`);
  }

  return trimmed;
}

function readOptionalType(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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

async function buildGraph(input: {
  userId: string;
  sessionId: string | null;
  mapId: string | null;
  type: string | null;
}) {
  const db = getDb();
  const nodeConditions = [eq(graphNodes.userId, input.userId)];

  if (input.sessionId) {
    nodeConditions.push(eq(graphNodes.sessionId, input.sessionId));
  }

  if (input.mapId) {
    nodeConditions.push(eq(graphNodes.mapId, input.mapId));
  }

  if (input.type) {
    nodeConditions.push(eq(graphNodes.kind, input.type));
  }

  const nodeRows = await db
    .select({
      id: graphNodes.id,
      kind: graphNodes.kind,
      label: graphNodes.label,
      metadataJson: graphNodes.metadataJson,
    })
    .from(graphNodes)
    .where(and(...nodeConditions))
    .orderBy(asc(graphNodes.createdAt), asc(graphNodes.id));

  if (!nodeRows.length) {
    return { nodes: [], edges: [] };
  }

  const nodeIds = nodeRows.map((row) => row.id);
  const edgeConditions = [
    eq(graphEdges.userId, input.userId),
    inArray(graphEdges.sourceNodeId, nodeIds),
    inArray(graphEdges.targetNodeId, nodeIds),
  ];

  if (input.mapId) {
    edgeConditions.push(eq(graphEdges.mapId, input.mapId));
  }

  const edgeRows = await db
    .select({
      id: graphEdges.id,
      sourceNodeId: graphEdges.sourceNodeId,
      targetNodeId: graphEdges.targetNodeId,
      kind: graphEdges.kind,
      weightBps: graphEdges.weightBps,
      metadataJson: graphEdges.metadataJson,
    })
    .from(graphEdges)
    .where(and(...edgeConditions))
    .orderBy(asc(graphEdges.createdAt), asc(graphEdges.id));

  return {
    nodes: nodeRows.map((row) => {
      const metadata = asRecord(row.metadataJson);

      return {
        id: row.id,
        label: row.label,
        kind: row.kind,
        cluster: readOptionalString(metadata?.cluster) ?? defaultCluster(row.kind),
        description: readOptionalString(metadata?.description) ?? undefined,
        status: readOptionalString(metadata?.status) ?? undefined,
        confidenceBps: readOptionalNumber(metadata?.confidenceBps) ?? undefined,
        x: readOptionalNumber(metadata?.x) ?? undefined,
        y: readOptionalNumber(metadata?.y) ?? undefined,
      };
    }),
    edges: edgeRows.map((row) => {
      const metadata = asRecord(row.metadataJson);

      return {
        id: row.id,
        source: row.sourceNodeId,
        target: row.targetNodeId,
        label: readOptionalString(metadata?.label) ?? row.kind,
        status: readOptionalString(metadata?.status) ?? undefined,
        strength:
          readOptionalNumber(metadata?.strength) ?? (typeof row.weightBps === "number" ? row.weightBps / 10_000 : undefined),
      };
    }),
  };
}

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const { searchParams } = new URL(request.url);
    const graph = await buildGraph({
      userId,
      sessionId: readOptionalUuid(searchParams.get("sessionId"), "sessionId"),
      mapId: readOptionalUuid(searchParams.get("mapId"), "mapId"),
      type: readOptionalType(searchParams.get("type")),
    });

    return apiOk(graph);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof GraphQueryValidationError) {
      return apiError(error.message, 400);
    }

    logBackendError({ error, request, route: "GET /api/graph" });
    return apiError("Failed to build graph view.", 500);
  }
}
