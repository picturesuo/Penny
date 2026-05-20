import { z } from "zod";
import {
  DrizzleCodebaseMemoryRepository,
  type CodeSourceKind,
  type CodeChunkKind,
  type CodebaseContextInput,
  type CodebaseMemoryRepository,
  type CodebaseSearchInput,
} from "./codebase-service.ts";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { scopeValues, type BrainScope } from "./scope.ts";

const codeSourceKinds = [
  "backend_source",
  "frontend_source",
  "test",
  "doc",
  "memory_note",
  "config",
  "script",
  "migration",
  "schema",
  "package",
  "style",
  "unknown",
] as const satisfies readonly CodeSourceKind[];

const codeChunkKinds = [
  "file",
  "imports",
  "exports",
  "function",
  "class",
  "component",
  "route",
  "test",
  "docs_section",
  "schema",
  "css_section",
  "memory_note",
] as const satisfies readonly CodeChunkKind[];

const IngestBodySchema = z
  .object({
    maxFileBytes: z.number().int().min(1_000).max(5_000_000).optional(),
  })
  .strict()
  .optional();

const SearchBodySchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z.number().int().min(1).max(50).optional(),
    includeDependencies: z.boolean().optional(),
    filters: z
      .object({
        pathPrefix: z.string().trim().min(1).optional(),
        sourceKinds: z.array(z.enum(codeSourceKinds)).max(20).optional(),
        languages: z.array(z.string().trim().min(1)).max(20).optional(),
        chunkKinds: z.array(z.enum(codeChunkKinds)).max(20).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const ContextBodySchema = SearchBodySchema.extend({
  task: z.string().trim().min(1).optional(),
  maxChunks: z.number().int().min(1).max(20).optional(),
  maxChars: z.number().int().min(2_000).max(60_000).optional(),
}).strict();

export type CodebaseRouteOptions = {
  service?: CodebaseMemoryRepository;
  db?: PennyDatabase;
  databaseUrl?: string;
  repoRoot?: string;
};

export async function handleCodebaseIngestRequest(
  request: Request,
  options: CodebaseRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/codebase/ingest requires the POST method.", "POST");
  }

  const body = await parseOptionalJson(request, IngestBodySchema);

  if (body instanceof Response) {
    return body;
  }

  try {
    const input: Parameters<CodebaseMemoryRepository["ingest"]>[0] = {
      scope: scopeFromRequest(request),
    };

    if (body?.maxFileBytes !== undefined) {
      input.maxFileBytes = body.maxFileBytes;
    }

    const scan = await resolveService(options).ingest(input);

    return jsonResponse({ data: scan }, 201);
  } catch (error) {
    return routeErrorResponse(error, "codebase_ingest_failed");
  }
}

export async function handleCodebaseScanRequest(
  request: Request,
  scanId: string,
  options: CodebaseRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/codebase/scan/:scanId requires the GET method.", "GET");
  }

  const normalizedScanId = scanId.trim();

  if (!normalizedScanId) {
    return invalidRequest("Invalid scan id.", ["scanId path parameter is required."]);
  }

  try {
    const scan = await resolveService(options).getScan(scopeFromRequest(request), normalizedScanId);

    if (!scan) {
      return jsonResponse({ error: { code: "not_found", message: "Codebase scan was not found for this scope." } }, 404);
    }

    return jsonResponse({ data: scan });
  } catch (error) {
    return routeErrorResponse(error, "codebase_scan_failed");
  }
}

export async function handleCodebaseSearchRequest(
  request: Request,
  options: CodebaseRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/codebase/search requires the POST method.", "POST");
  }

  const body = await parseJson(request, SearchBodySchema);

  if (body instanceof Response) {
    return body;
  }

  try {
    const input = searchInputFromBody(scopeFromRequest(request), body);
    const results = await resolveService(options).search(input);

    return jsonResponse({
      data: {
        sourceOfTruth: "codebase_db_index",
        strategy: "bm25_dependency_adjacency",
        query: input.query,
        results,
        meta: {
          resultCount: results.length,
        },
      },
    });
  } catch (error) {
    return routeErrorResponse(error, "codebase_search_failed");
  }
}

export async function handleCodebaseContextRequest(
  request: Request,
  options: CodebaseRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/codebase/context requires the POST method.", "POST");
  }

  const body = await parseJson(request, ContextBodySchema);

  if (body instanceof Response) {
    return body;
  }

  try {
    const input: CodebaseContextInput = {
      ...searchInputFromBody(scopeFromRequest(request), body),
    };

    if (body.task !== undefined) {
      input.task = body.task;
    }

    if (body.maxChunks !== undefined) {
      input.maxChunks = body.maxChunks;
    }

    if (body.maxChars !== undefined) {
      input.maxChars = body.maxChars;
    }

    const context = await resolveService(options).context(input);

    return jsonResponse({ data: context });
  } catch (error) {
    return routeErrorResponse(error, "codebase_context_failed");
  }
}

export async function handleCodebaseAuditRequest(
  request: Request,
  options: CodebaseRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/codebase/audit requires the POST method.", "POST");
  }

  try {
    const audit = await resolveService(options).audit(scopeFromRequest(request));

    return jsonResponse({ data: audit });
  } catch (error) {
    return routeErrorResponse(error, "codebase_audit_failed");
  }
}

function resolveService(options: CodebaseRouteOptions): CodebaseMemoryRepository {
  if (options.service) {
    return options.service;
  }

  return new DrizzleCodebaseMemoryRepository(options.db ?? createPennyDb(options.databaseUrl), options.repoRoot);
}

function searchInputFromBody(scope: BrainScope, body: z.infer<typeof SearchBodySchema>): CodebaseSearchInput {
  const input: CodebaseSearchInput = {
    scope,
    query: body.query,
  };

  if (body.limit !== undefined) {
    input.limit = body.limit;
  }

  if (body.includeDependencies !== undefined) {
    input.includeDependencies = body.includeDependencies;
  }

  if (body.filters !== undefined) {
    const filters: NonNullable<CodebaseSearchInput["filters"]> = {};

    if (body.filters.pathPrefix !== undefined) {
      filters.pathPrefix = body.filters.pathPrefix;
    }

    if (body.filters.sourceKinds !== undefined) {
      filters.sourceKinds = body.filters.sourceKinds;
    }

    if (body.filters.languages !== undefined) {
      filters.languages = body.filters.languages;
    }

    if (body.filters.chunkKinds !== undefined) {
      filters.chunkKinds = body.filters.chunkKinds;
    }

    input.filters = filters;
  }

  return input;
}

async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T | Response> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    return invalidRequest("Invalid JSON body.", ["Request body must be valid JSON."]);
  }

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return invalidRequest(
      "Invalid codebase request.",
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`),
    );
  }

  return parsed.data;
}

async function parseOptionalJson<T>(request: Request, schema: z.ZodType<T>): Promise<T | Response> {
  const text = await request.text();

  if (!text.trim()) {
    const parsed = schema.safeParse(undefined);

    if (!parsed.success) {
      return invalidRequest("Invalid codebase request.", parsed.error.issues.map((issue) => issue.message));
    }

    return parsed.data;
  }

  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    return invalidRequest("Invalid JSON body.", ["Request body must be valid JSON."]);
  }

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return invalidRequest(
      "Invalid codebase request.",
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`),
    );
  }

  return parsed.data;
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
