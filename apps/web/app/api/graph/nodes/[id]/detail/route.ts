import { and, desc, eq, inArray, or } from "drizzle-orm";

import { apiError, apiOk } from "../../../../../../lib/api/response";
import { logBackendError } from "../../../../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../../../../server/auth/get-request-user-id.ts";
import { getDb } from "../../../../../../../../server/db/client.ts";
import {
  activityEvents,
  confidenceRatings,
  graphEdges,
  graphNodes,
} from "../../../../../../../../server/db/schema.ts";

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

function readPayloadTitle(value: unknown) {
  const payload = asRecord(value);

  return (
    readOptionalString(payload?.title) ??
    readOptionalString(payload?.body) ??
    readOptionalString(payload?.text) ??
    readOptionalString(payload?.summary)
  );
}

function serializeConnection(
  edge: ReturnType<typeof serializeEdge>,
  nodeId: string,
  connectedNodesById: Map<string, { id: string; label: string; kind: string }>,
) {
  const connectedNodeId = edge.source === nodeId ? edge.target : edge.source;
  const connectedNode = connectedNodesById.get(connectedNodeId);

  return {
    id: edge.id,
    nodeId: connectedNodeId,
    title: connectedNode?.label ?? edge.label,
    detail: edge.label,
    kind: edge.kind,
    direction: edge.source === nodeId ? "outgoing" : "incoming",
    connectedNodeKind: connectedNode?.kind,
    strength: edge.strength,
    weightBps: edge.weightBps,
    status: edge.status,
    createdAt: edge.createdAt,
    updatedAt: edge.updatedAt,
  };
}

function isDependencyConnection(connection: ReturnType<typeof serializeConnection>) {
  return connection.kind === "depends_on" || /depend/i.test(connection.detail);
}

function isContradictionConnection(connection: ReturnType<typeof serializeConnection>) {
  return connection.kind === "contradicts" || /contradict/i.test(connection.detail);
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

  const connectedNodeIds = Array.from(
    new Set(
      edgeRows
        .flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId])
        .filter((id) => id !== input.nodeId),
    ),
  );
  const connectedNodeRows = connectedNodeIds.length
    ? await db
        .select({
          id: graphNodes.id,
          kind: graphNodes.kind,
          label: graphNodes.label,
        })
        .from(graphNodes)
        .where(and(eq(graphNodes.userId, input.userId), inArray(graphNodes.id, connectedNodeIds)))
    : [];
  const connectedNodesById = new Map(connectedNodeRows.map((row) => [row.id, row]));

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

  const activityTargetConditions = [eq(activityEvents.graphNodeId, input.nodeId)];

  if (node.claimId) {
    activityTargetConditions.push(eq(activityEvents.claimId, node.claimId));
  }

  if (node.thoughtId) {
    activityTargetConditions.push(eq(activityEvents.thoughtId, node.thoughtId));
  }

  const activityRows = await db
    .select({
      id: activityEvents.id,
      aggregateType: activityEvents.aggregateType,
      aggregateId: activityEvents.aggregateId,
      type: activityEvents.type,
      payloadJson: activityEvents.payloadJson,
      requestId: activityEvents.requestId,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(and(eq(activityEvents.userId, input.userId), or(...activityTargetConditions)))
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    .limit(10);

  const incomingEdges = edgeRows.filter((edge) => edge.targetNodeId === input.nodeId).map(serializeEdge);
  const outgoingEdges = edgeRows.filter((edge) => edge.sourceNodeId === input.nodeId).map(serializeEdge);
  const keyConnections = [...incomingEdges, ...outgoingEdges].map((edge) =>
    serializeConnection(edge, input.nodeId, connectedNodesById),
  );
  const confidenceHistory = ratingRows.map((rating) => ({
    id: rating.id,
    ratingBps: rating.ratingBps,
    rationale: rating.rationale,
    source: rating.source,
    createdAt: rating.createdAt.toISOString(),
  }));

  return {
    node: serializeNode(node),
    incomingEdges,
    outgoingEdges,
    confidenceRatings: confidenceHistory,
    keyConnections,
    dependencies: keyConnections.filter(isDependencyConnection),
    contradictions: keyConnections.filter(isContradictionConnection),
    recentActivity: activityRows.map((activity) => ({
      id: activity.id,
      title: readPayloadTitle(activity.payloadJson) ?? activity.type,
      detail: activity.type,
      aggregateType: activity.aggregateType,
      aggregateId: activity.aggregateId,
      requestId: activity.requestId,
      createdAt: activity.createdAt.toISOString(),
    })),
    confidenceHistory,
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
      return apiError("Graph node not found.", 404);
    }

    return apiOk(detail);
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return apiError(error.message, 401);
    }

    if (error instanceof GraphNodeDetailValidationError) {
      return apiError(error.message, 400);
    }

    logBackendError({ error, request, route: "GET /api/graph/nodes/[id]/detail" });
    return apiError("Failed to build graph node detail.", 500);
  }
}
