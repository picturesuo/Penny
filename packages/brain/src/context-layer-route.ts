import {
  planConnectorScope,
  processEphemeralContext,
  type ConnectorScopePlan,
  type ConnectorScopeSelection,
  type ContextProvider,
  type EphemeralProcessResult,
  type MemoryReviewStatus,
} from "./context-layer.ts";
import {
  deleteContextMemory,
  loadContextDashboard,
  persistContextImport,
  reviewContextMemory,
  revokeContextConnector,
} from "./context-layer-repository.ts";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { scopeValues, type BrainScope, type BrainScopeInput } from "./scope.ts";

export type ContextDashboardPayload = {
  sourceOfTruth: "context_layer";
  sources: Array<{
    id: string;
    provider: ContextProvider;
    label: string;
    scopes: readonly string[];
    lastSync: string | null;
    memoriesCreated: number;
    rawRetention: boolean;
    status: "active" | "paused" | "revoked" | "errored";
  }>;
  reviewQueue: Array<{
    id: string;
    text: string;
    type: string;
    sourceClass: string;
    confidence: number;
    createdAt: string;
  }>;
  consent: {
    memoryEnabled: boolean;
    referenceChatgptImport: boolean;
    referenceGmail: boolean;
    referenceCalendar: boolean;
    useForPrivateFineTune: boolean;
    useToImproveSharedModels: boolean;
  };
  auditSummary: {
    lastAccessAt: string | null;
    syncCount: number;
    extractedMemoryCount: number;
    deletionCount: number;
  };
};

export type ContextImportRequestBody = {
  provider?: ContextProvider;
  sourceUri?: string;
  label?: string;
  text?: string;
  autoApprove?: boolean;
  rawRetention?: boolean;
  connector?: ConnectorScopeSelection;
};

export type ContextImportPayload = {
  sourceOfTruth: "context_layer_ephemeral_processor";
  flow: readonly [
    "connect_source",
    "fetch_minimum_scoped_data",
    "ephemeral_processing",
    "redaction",
    "extraction",
    "review_queue",
    "memory_shards",
    "brain_graph_links",
    "delete_raw_temp_content",
  ];
  connectorPlan: ConnectorScopePlan;
  processing: EphemeralProcessResult;
};

export type MemoryReviewAction = "approve" | "reject" | "edit" | "merge" | "deprioritize";

export type MemoryReviewPayload = {
  memoryId: string;
  action: MemoryReviewAction;
  reviewStatus: MemoryReviewStatus;
  text: string | null;
  mergeIntoMemoryId: string | null;
  auditEvent: string;
};

export type DeleteMemoryPayload = {
  memoryId: string;
  deleted: true;
  rawDeleted: true;
  auditEvent: "memory.deleted";
};

export type RevokeConnectorPayload = {
  connectorAccountId: string;
  revoked: true;
  auditEvent: "connector.revoked";
};

export type ContextLayerRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  loadDashboard?: (scope: BrainScope) => Promise<ContextDashboardPayload>;
  persistImport?: (input: {
    scope: BrainScope;
    connectorPlan: ConnectorScopePlan;
    processing: EphemeralProcessResult;
  }) => Promise<EphemeralProcessResult>;
  reviewMemory?: (input: {
    scope: BrainScope;
    memoryId: string;
    action: MemoryReviewAction;
    text: string | null;
    mergeIntoMemoryId: string | null;
  }) => Promise<MemoryReviewPayload>;
  deleteMemory?: (input: { scope: BrainScope; memoryId: string }) => Promise<DeleteMemoryPayload>;
  revokeConnector?: (input: { scope: BrainScope; connectorAccountId: string }) => Promise<RevokeConnectorPayload>;
};

const contextFlow = [
  "connect_source",
  "fetch_minimum_scoped_data",
  "ephemeral_processing",
  "redaction",
  "extraction",
  "review_queue",
  "memory_shards",
  "brain_graph_links",
  "delete_raw_temp_content",
] as const;

const reviewStatusByAction: Record<MemoryReviewAction, MemoryReviewStatus> = {
  approve: "approved",
  reject: "rejected",
  edit: "pending",
  merge: "merged",
  deprioritize: "deprioritized",
};

export async function handleContextDashboardRequest(
  request: Request,
  options: ContextLayerRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/context/dashboard requires the GET method.");
  }

  const scope = scopeFromRequest(request);
  const db = resolveContextDb(options, Boolean(options.loadDashboard));
  const loadDashboard = options.loadDashboard ?? ((requestScope: BrainScope) => loadContextDashboard(requireContextDb(db), requestScope));

  return jsonResponse({ data: await loadDashboard(scope) }, 200);
}

export async function handleContextImportRequest(
  request: Request,
  options: ContextLayerRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/context/import requires the POST method.");
  }

  const body = await readJsonBody<ContextImportRequestBody>(request);

  if (!body.ok) {
    return jsonResponse({ error: { code: "invalid_json", message: body.message } }, 400);
  }

  const validation = validateImportBody(body.value);

  if (!validation.ok) {
    return jsonResponse({ error: { code: validation.code, message: validation.message } }, 400);
  }

  const connectorPlan = planConnectorScope(validation.connector);

  if (!connectorPlan.allowed) {
    return jsonResponse(
      {
        error: {
          code: "context_scope_not_allowed",
          message: connectorPlan.warnings[0] ?? "Selected connector scope is not allowed.",
          details: connectorPlan,
        },
      },
      409,
    );
  }

  const processing = processEphemeralContext({
    provider: validation.provider,
    sourceUri: validation.sourceUri,
    label: validation.label,
    text: validation.text,
    autoApprove: validation.autoApprove,
    rawRetention: validation.rawRetention,
  });
  const db = resolveContextDb(options, Boolean(options.persistImport));
  const persisted = options.persistImport
    ? await options.persistImport({ scope: scopeFromRequest(request), connectorPlan, processing })
    : await persistContextImport(requireContextDb(db), {
        scope: scopeFromRequest(request),
        connectorPlan,
        processing,
      });
  const payload: ContextImportPayload = {
    sourceOfTruth: "context_layer_ephemeral_processor",
    flow: contextFlow,
    connectorPlan,
    processing: persisted,
  };

  return jsonResponse({ data: payload }, 201);
}

export async function handleContextMemoryReviewRequest(
  request: Request,
  memoryId: string,
  options: ContextLayerRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/context/memories/:memoryId/review requires the POST method.");
  }

  const normalizedMemoryId = memoryId.trim();

  if (!normalizedMemoryId) {
    return jsonResponse({ error: { code: "invalid_memory_id", message: "Memory review requires a memory id." } }, 400);
  }

  const body = await readJsonBody<{ action?: MemoryReviewAction; text?: string | null; mergeIntoMemoryId?: string | null }>(
    request,
  );

  if (!body.ok) {
    return jsonResponse({ error: { code: "invalid_json", message: body.message } }, 400);
  }

  const action = body.value.action;

  if (!isMemoryReviewAction(action)) {
    return jsonResponse(
      {
        error: {
          code: "invalid_review_action",
          message: "Memory review action must be approve, reject, edit, merge, or deprioritize.",
        },
      },
      400,
    );
  }

  const text = typeof body.value.text === "string" && body.value.text.trim() ? body.value.text.trim() : null;
  const mergeIntoMemoryId =
    typeof body.value.mergeIntoMemoryId === "string" && body.value.mergeIntoMemoryId.trim()
      ? body.value.mergeIntoMemoryId.trim()
      : null;

  if (action === "edit" && !text) {
    return jsonResponse({ error: { code: "missing_review_text", message: "Edit review requires replacement text." } }, 400);
  }

  if (action === "merge" && !mergeIntoMemoryId) {
    return jsonResponse({ error: { code: "missing_merge_target", message: "Merge review requires a target memory id." } }, 400);
  }

  const db = resolveContextDb(options, Boolean(options.reviewMemory));
  const reviewMemory =
    options.reviewMemory ??
    ((reviewInput: {
      scope: BrainScope;
      memoryId: string;
      action: MemoryReviewAction;
      text: string | null;
      mergeIntoMemoryId: string | null;
    }) => reviewContextMemory(requireContextDb(db), reviewInput));
  const payload = await reviewMemory({
    scope: scopeFromRequest(request),
    memoryId: normalizedMemoryId,
    action,
    text,
    mergeIntoMemoryId,
  });

  return jsonResponse({ data: payload }, 200);
}

export async function handleContextMemoryDeleteRequest(
  request: Request,
  memoryId: string,
  options: ContextLayerRouteOptions = {},
): Promise<Response> {
  if (request.method !== "DELETE") {
    return methodNotAllowed("DELETE /api/context/memories/:memoryId requires the DELETE method.");
  }

  const normalizedMemoryId = memoryId.trim();

  if (!normalizedMemoryId) {
    return jsonResponse({ error: { code: "invalid_memory_id", message: "Memory deletion requires a memory id." } }, 400);
  }

  const db = resolveContextDb(options, Boolean(options.deleteMemory));
  const deleteMemory =
    options.deleteMemory ??
    ((deleteInput: { scope: BrainScope; memoryId: string }) => deleteContextMemory(requireContextDb(db), deleteInput));

  return jsonResponse({ data: await deleteMemory({ scope: scopeFromRequest(request), memoryId: normalizedMemoryId }) }, 200);
}

export async function handleContextConnectorRevokeRequest(
  request: Request,
  connectorAccountId: string,
  options: ContextLayerRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/context/connectors/:connectorAccountId/revoke requires the POST method.");
  }

  const normalizedConnectorAccountId = connectorAccountId.trim();

  if (!normalizedConnectorAccountId) {
    return jsonResponse(
      { error: { code: "invalid_connector_account_id", message: "Connector revoke requires an account id." } },
      400,
    );
  }

  const db = resolveContextDb(options, Boolean(options.revokeConnector));
  const revokeConnector =
    options.revokeConnector ??
    ((revokeInput: { scope: BrainScope; connectorAccountId: string }) =>
      revokeContextConnector(requireContextDb(db), revokeInput));

  return jsonResponse(
    {
      data: await revokeConnector({
        scope: scopeFromRequest(request),
        connectorAccountId: normalizedConnectorAccountId,
      }),
    },
    200,
  );
}

function validateImportBody(body: ContextImportRequestBody):
  | {
      ok: true;
      provider: ContextProvider;
      sourceUri: string;
      label: string;
      text: string;
      autoApprove: boolean;
      rawRetention: boolean;
      connector: ConnectorScopeSelection;
    }
  | { ok: false; code: string; message: string } {
  if (!isContextProvider(body.provider)) {
    return { ok: false, code: "invalid_provider", message: "Context import requires a supported provider." };
  }

  if (typeof body.sourceUri !== "string" || body.sourceUri.trim().length === 0) {
    return { ok: false, code: "invalid_source_uri", message: "Context import requires sourceUri." };
  }

  if (typeof body.label !== "string" || body.label.trim().length === 0) {
    return { ok: false, code: "invalid_label", message: "Context import requires label." };
  }

  if (typeof body.text !== "string" || body.text.trim().length === 0) {
    return { ok: false, code: "invalid_text", message: "Context import requires text." };
  }

  const connector: ConnectorScopeSelection = {
    ...(body.connector ?? {}),
    provider: body.provider,
    sourceUri: body.sourceUri.trim(),
    label: body.label.trim(),
    rawRetention: body.rawRetention === true,
  };

  if (body.provider === "chatgpt") {
    connector.manualExport = true;
  } else if (body.connector?.manualExport !== undefined) {
    connector.manualExport = body.connector.manualExport;
  }

  return {
    ok: true,
    provider: body.provider,
    sourceUri: body.sourceUri.trim(),
    label: body.label.trim(),
    text: body.text,
    autoApprove: body.autoApprove === true,
    rawRetention: body.rawRetention === true,
    connector,
  };
}

async function readJsonBody<T>(request: Request): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: (await request.json()) as T };
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }
}

function scopeFromRequest(request: Request): BrainScope {
  const scope: BrainScopeInput = {
    userId: request.headers.get("x-user-id"),
    workspaceId: request.headers.get("x-workspace-id"),
    projectId: request.headers.get("x-project-id"),
    sphereId: request.headers.get("x-sphere-id"),
  };

  return scopeValues(scope);
}

function isContextProvider(value: unknown): value is ContextProvider {
  return (
    value === "manual" ||
    value === "chatgpt" ||
    value === "gmail" ||
    value === "calendar" ||
    value === "slack" ||
    value === "canvas" ||
    value === "instagram"
  );
}

function isMemoryReviewAction(value: unknown): value is MemoryReviewAction {
  return value === "approve" || value === "reject" || value === "edit" || value === "merge" || value === "deprioritize";
}

function auditEventForReview(action: MemoryReviewAction): string {
  switch (action) {
    case "approve":
      return "memory.approved";
    case "reject":
      return "memory.rejected";
    case "edit":
      return "memory.edited";
    case "merge":
      return "memory.merged";
    case "deprioritize":
      return "memory.deprioritized";
  }
}

function resolveContextDb(options: ContextLayerRouteOptions, hasInjectedHandler: boolean): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedHandler) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireContextDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for Context Layer routes.");
  }

  return db;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function methodNotAllowed(message: string): Response {
  return new Response(JSON.stringify({ error: { code: "method_not_allowed", message } }), {
    status: 405,
    headers: {
      allow: message.split(" ")[0] ?? "",
      "content-type": "application/json",
    },
  });
}
