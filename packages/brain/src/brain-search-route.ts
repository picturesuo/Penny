import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import {
  BrainRepositoryNotFoundError,
  createBrainRepository,
  type BrainSearchInput,
} from "./domain/repository.ts";
import type { BrainSearchResult, CanvasEdge, CanvasNode } from "./domain/types.ts";
import { scopeValues, type BrainScope } from "./scope.ts";

const UuidSchema = z.string().uuid();

export type BrainSearchPayload = {
  sourceOfTruth: "brain_embeddings_plus_brain_objects_notes_claim_versions_recents_artifacts";
  mode: "hybrid_json_embedding_fallback";
  query: string;
  results: ReadonlyArray<BrainSearchResult>;
};

export type SessionCanvasPayload = {
  sourceOfTruth: "claims_claim_versions_claim_edges_sources_session_notes_brain_objects_artifacts";
  sessionId: string;
  nodes: ReadonlyArray<CanvasNode>;
  edges: ReadonlyArray<CanvasEdge>;
  meta: {
    nodeCount: number;
    edgeCount: number;
  };
};

export type BrainSearchRouteService = {
  search(input: BrainSearchInput): Promise<ReadonlyArray<BrainSearchResult>>;
  listCanvas(scope: BrainScope, sessionId: string): Promise<{ nodes: ReadonlyArray<CanvasNode>; edges: ReadonlyArray<CanvasEdge> }>;
};

export type BrainSearchRouteOptions = {
  service?: BrainSearchRouteService;
  db?: PennyDatabase;
  databaseUrl?: string;
};

export async function handleBrainSearchRequest(
  request: Request,
  options: BrainSearchRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/brain/search requires the GET method.", "GET");
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  if (!query) {
    return invalidRequest("Brain search requires q.", ["q query parameter is required."]);
  }

  const limit = limitFromSearchParams(url.searchParams);
  if (limit instanceof Response) {
    return limit;
  }

  try {
    const input: BrainSearchInput = {
      scope: scopeFromRequest(request),
      query,
    };

    if (limit !== undefined) {
      input.limit = limit;
    }

    const results = await resolveService(options).search(input);

    return jsonResponse({
      data: {
        sourceOfTruth: "brain_embeddings_plus_brain_objects_notes_claim_versions_recents_artifacts",
        mode: "hybrid_json_embedding_fallback",
        query,
        results,
      } satisfies BrainSearchPayload,
    });
  } catch (error) {
    return routeErrorResponse(error, "brain_search_failed");
  }
}

export async function handleSessionCanvasRequest(
  request: Request,
  sessionId: string,
  options: BrainSearchRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/sessions/:sessionId/canvas requires the GET method.", "GET");
  }

  const parsed = UuidSchema.safeParse(sessionId);
  if (!parsed.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId path parameter must be a UUID."]);
  }

  try {
    const canvas = await resolveService(options).listCanvas(scopeFromRequest(request), parsed.data);

    return jsonResponse({
      data: {
        sourceOfTruth: "claims_claim_versions_claim_edges_sources_session_notes_brain_objects_artifacts",
        sessionId: parsed.data,
        nodes: canvas.nodes,
        edges: canvas.edges,
        meta: {
          nodeCount: canvas.nodes.length,
          edgeCount: canvas.edges.length,
        },
      } satisfies SessionCanvasPayload,
    });
  } catch (error) {
    return routeErrorResponse(error, "session_canvas_failed");
  }
}

function resolveService(options: BrainSearchRouteOptions): BrainSearchRouteService {
  if (options.service) {
    return options.service;
  }

  const db = options.db ?? createPennyDb(options.databaseUrl);
  const repository = createBrainRepository(db);

  return {
    search: (input) => repository.searchBrainHybrid(input),
    async listCanvas(scope, sessionId) {
      const [nodes, edges] = await Promise.all([
        repository.listCanvasNodesForSession(sessionId, scope),
        repository.listCanvasEdgesForSession(sessionId, scope),
      ]);

      return { nodes, edges };
    },
  };
}

function limitFromSearchParams(params: URLSearchParams): number | Response | undefined {
  const raw = params.get("limit");
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    return invalidRequest("Invalid limit.", ["limit must be an integer from 1 to 50."]);
  }

  return parsed;
}

function scopeFromRequest(request: Request): BrainScope {
  return scopeValues({
    userId: firstPresentHeader(request, ["x-user-id", "x-penny-user-id"]) ?? null,
    workspaceId: firstPresentHeader(request, ["x-workspace-id", "x-penny-workspace-id"]) ?? null,
    projectId: firstPresentHeader(request, ["x-project-id", "x-penny-project-id"]) ?? null,
    sphereId: firstPresentHeader(request, ["x-sphere-id", "x-penny-sphere-id"]) ?? null,
  });
}

function firstPresentHeader(request: Request, names: ReadonlyArray<string>): string | undefined {
  for (const name of names) {
    const value = request.headers.get(name)?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function routeErrorResponse(error: unknown, code: string): Response {
  if (error instanceof BrainRepositoryNotFoundError) {
    return jsonResponse({ error: { code: "not_found", message: error.message } }, 404);
  }

  return jsonResponse(
    {
      error: {
        code,
        message: error instanceof Error ? error.message : String(error),
      },
    },
    500,
  );
}

function methodNotAllowed(message: string, allow: string): Response {
  return jsonResponse({ error: { code: "method_not_allowed", message } }, 405, { allow });
}

function invalidRequest(message: string, issues: string[]): Response {
  return jsonResponse({ error: { code: "invalid_request", message, issues } }, 400);
}

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}
