import {
  planConnectorScope,
  processEphemeralContext,
  type ConnectorScopePlan,
  type ConnectorScopeSelection,
  type ContextProvider,
  type ContextSourceClass,
  type EphemeralProcessResult,
  type MemoryReviewStatus,
  type RetrievalRequest,
  type RetrievalResult,
} from "./context-layer.ts";
import type { ConnectorSyncItem, ConnectorTokenInput } from "./context-connector-service.ts";
import {
  connectContextConnector,
  type ConnectContextConnectorPayload,
  deleteContextMemory,
  loadContextDashboard,
  persistContextImport,
  reviewContextMemory,
  retrieveContextMemories,
  revokeContextConnector,
  syncContextConnector,
  type SyncContextConnectorPayload,
  type ContextConsentPayload,
  type ContextConsentUpdate,
  updateContextConsent,
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

export type ContextConnectorConnectRequestBody = {
  provider?: ContextProvider;
  connector?: ConnectorScopeSelection;
  token?: ConnectorTokenInput | null;
};

export type ContextConnectorSyncRequestBody = {
  provider?: ContextProvider;
  selection?: ConnectorScopeSelection;
  items?: ConnectorSyncItem[];
  fetchedAt?: string;
  autoApprove?: boolean;
  rawRetention?: boolean;
};

export type ContextConsentRequestBody = ContextConsentUpdate;

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

export type ContextRetrievalPayload = {
  sourceOfTruth: "context_layer_memory_retrieval";
  query: string;
  results: RetrievalResult[];
};

export type RevokeConnectorPayload = {
  connectorAccountId: string;
  revoked: true;
  auditEvent: "connector.revoked";
};

export type ContextLayerRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  connectorTokenSecret?: string;
  loadDashboard?: (scope: BrainScope) => Promise<ContextDashboardPayload>;
  connectConnector?: (input: {
    scope: BrainScope;
    provider: ContextProvider;
    connectorPlan: ConnectorScopePlan;
    token: ConnectorTokenInput | null;
  }) => Promise<ConnectContextConnectorPayload>;
  syncConnector?: (input: {
    scope: BrainScope;
    connectorAccountId: string;
    provider: ContextProvider;
    selection: ConnectorScopeSelection;
    items: readonly ConnectorSyncItem[];
    fetchedAt: string | undefined;
    autoApprove: boolean | undefined;
    rawRetention: boolean | undefined;
  }) => Promise<SyncContextConnectorPayload>;
  updateConsent?: (input: { scope: BrainScope; consent: ContextConsentUpdate }) => Promise<ContextConsentPayload>;
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
  retrieveMemories?: (input: { scope: BrainScope; request: RetrievalRequest }) => Promise<ContextRetrievalPayload>;
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

export async function handleContextConnectorConnectRequest(
  request: Request,
  options: ContextLayerRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/context/connectors requires the POST method.");
  }

  const body = await readJsonBody<ContextConnectorConnectRequestBody>(request);

  if (!body.ok) {
    return jsonResponse({ error: { code: "invalid_json", message: body.message } }, 400);
  }

  if (!isContextProvider(body.value.provider)) {
    return jsonResponse({ error: { code: "invalid_provider", message: "Connector connection requires a supported provider." } }, 400);
  }

  const selection: ConnectorScopeSelection = {
    ...(body.value.connector ?? {}),
    provider: body.value.provider,
  };
  const connectorPlan = planConnectorScope(selection);

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

  const db = resolveContextDb(options, Boolean(options.connectConnector));
  const connectConnector =
    options.connectConnector ??
    ((input: {
      scope: BrainScope;
      provider: ContextProvider;
      connectorPlan: ConnectorScopePlan;
      token: ConnectorTokenInput | null;
    }) =>
      connectContextConnector(
        requireContextDb(db),
        options.connectorTokenSecret === undefined
          ? input
          : {
              ...input,
              tokenSecret: options.connectorTokenSecret,
            },
      ));

  return jsonResponse(
    {
      data: await connectConnector({
        scope: scopeFromRequest(request),
        provider: body.value.provider,
        connectorPlan,
        token: body.value.token ?? null,
      }),
    },
    201,
  );
}

export async function handleContextConnectorSyncRequest(
  request: Request,
  connectorAccountId: string,
  options: ContextLayerRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/context/connectors/:connectorAccountId/sync requires the POST method.");
  }

  const normalizedConnectorAccountId = connectorAccountId.trim();

  if (!normalizedConnectorAccountId) {
    return jsonResponse(
      { error: { code: "invalid_connector_account_id", message: "Connector sync requires an account id." } },
      400,
    );
  }

  const body = await readJsonBody<ContextConnectorSyncRequestBody>(request);

  if (!body.ok) {
    return jsonResponse({ error: { code: "invalid_json", message: body.message } }, 400);
  }

  if (!isContextProvider(body.value.provider)) {
    return jsonResponse({ error: { code: "invalid_provider", message: "Connector sync requires a supported provider." } }, 400);
  }

  if (!Array.isArray(body.value.items)) {
    return jsonResponse({ error: { code: "invalid_sync_items", message: "Connector sync requires an items array." } }, 400);
  }

  const selection: ConnectorScopeSelection = {
    ...(body.value.selection ?? {}),
    provider: body.value.provider,
  };
  const connectorPlan = planConnectorScope(selection);

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

  const db = resolveContextDb(options, Boolean(options.syncConnector));
  const syncConnector =
    options.syncConnector ??
    ((input: {
      scope: BrainScope;
      connectorAccountId: string;
      provider: ContextProvider;
      selection: ConnectorScopeSelection;
      items: readonly ConnectorSyncItem[];
      fetchedAt: string | undefined;
      autoApprove: boolean | undefined;
      rawRetention: boolean | undefined;
    }) => syncContextConnector(requireContextDb(db), compactSyncInput(input)));

  return jsonResponse(
    {
      data: await syncConnector({
        scope: scopeFromRequest(request),
        connectorAccountId: normalizedConnectorAccountId,
        provider: body.value.provider,
        selection,
        items: body.value.items,
        fetchedAt: body.value.fetchedAt,
        autoApprove: body.value.autoApprove,
        rawRetention: body.value.rawRetention,
      }),
    },
    202,
  );
}

export async function handleContextConsentRequest(
  request: Request,
  options: ContextLayerRouteOptions = {},
): Promise<Response> {
  if (request.method !== "PUT") {
    return methodNotAllowed("PUT /api/context/consent requires the PUT method.");
  }

  const body = await readJsonBody<ContextConsentRequestBody>(request);

  if (!body.ok) {
    return jsonResponse({ error: { code: "invalid_json", message: body.message } }, 400);
  }

  const validation = validateConsentBody(body.value);

  if (!validation.ok) {
    return jsonResponse({ error: { code: validation.code, message: validation.message } }, 400);
  }

  const db = resolveContextDb(options, Boolean(options.updateConsent));
  const updateConsent =
    options.updateConsent ??
    ((input: { scope: BrainScope; consent: ContextConsentUpdate }) =>
      updateContextConsent(requireContextDb(db), input));

  return jsonResponse(
    {
      data: await updateConsent({
        scope: scopeFromRequest(request),
        consent: validation.consent,
      }),
    },
    200,
  );
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

function validateConsentBody(
  body: ContextConsentRequestBody,
): { ok: true; consent: ContextConsentUpdate } | { ok: false; code: string; message: string } {
  const allowedKeys = new Set([
    "memoryEnabled",
    "referenceChatgptImport",
    "referenceGmail",
    "referenceCalendar",
    "useForPrivateFineTune",
    "useToImproveSharedModels",
  ]);
  const entries = Object.entries(body ?? {});

  if (entries.length === 0) {
    return { ok: false, code: "empty_consent_update", message: "Consent update requires at least one setting." };
  }

  for (const [key, value] of entries) {
    if (!allowedKeys.has(key) || typeof value !== "boolean") {
      return { ok: false, code: "invalid_consent_update", message: "Consent settings must be known boolean fields." };
    }
  }

  return { ok: true, consent: body };
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

export async function handleContextRetrievalRequest(
  request: Request,
  options: ContextLayerRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/context/retrieve requires the GET method.");
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return jsonResponse({ error: { code: "invalid_query", message: "Context retrieval requires q." } }, 400);
  }

  const limitValue = Number(url.searchParams.get("limit") ?? "5");
  const retrievalRequest: RetrievalRequest = {
    query,
    limit: Number.isFinite(limitValue) ? limitValue : 5,
  };
  const sourceGroup = url.searchParams.get("sourceClass")?.trim();
  const topicCluster = url.searchParams.get("topicCluster")?.trim();

  if (isContextSourceClass(sourceGroup)) {
    retrievalRequest.sourceGroup = sourceGroup;
  }

  if (topicCluster) {
    retrievalRequest.topicCluster = topicCluster;
  }

  const db = resolveContextDb(options, Boolean(options.retrieveMemories));
  const retrieveMemories =
    options.retrieveMemories ??
    (async (input: { scope: BrainScope; request: RetrievalRequest }): Promise<ContextRetrievalPayload> => {
      const retrieval = await retrieveContextMemories(requireContextDb(db), input.scope, input.request);

      return {
        sourceOfTruth: retrieval.sourceOfTruth,
        query: input.request.query,
        results: retrieval.results,
      };
    });

  return jsonResponse(
    {
      data: await retrieveMemories({
        scope: scopeFromRequest(request),
        request: retrievalRequest,
      }),
    },
    200,
  );
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

function compactSyncInput(input: {
  scope: BrainScope;
  connectorAccountId: string;
  provider: ContextProvider;
  selection: ConnectorScopeSelection;
  items: readonly ConnectorSyncItem[];
  fetchedAt: string | undefined;
  autoApprove: boolean | undefined;
  rawRetention: boolean | undefined;
}): {
  scope: BrainScope;
  connectorAccountId: string;
  provider: ContextProvider;
  selection: ConnectorScopeSelection;
  items: readonly ConnectorSyncItem[];
  fetchedAt?: string;
  autoApprove?: boolean;
  rawRetention?: boolean;
} {
  const output: {
    scope: BrainScope;
    connectorAccountId: string;
    provider: ContextProvider;
    selection: ConnectorScopeSelection;
    items: readonly ConnectorSyncItem[];
    fetchedAt?: string;
    autoApprove?: boolean;
    rawRetention?: boolean;
  } = {
    scope: input.scope,
    connectorAccountId: input.connectorAccountId,
    provider: input.provider,
    selection: input.selection,
    items: input.items,
  };

  if (input.fetchedAt !== undefined) {
    output.fetchedAt = input.fetchedAt;
  }

  if (input.autoApprove !== undefined) {
    output.autoApprove = input.autoApprove;
  }

  if (input.rawRetention !== undefined) {
    output.rawRetention = input.rawRetention;
  }

  return output;
}

function isContextSourceClass(value: unknown): value is ContextSourceClass {
  return (
    value === "manual" ||
    value === "private_export" ||
    value === "email" ||
    value === "calendar_event" ||
    value === "chat" ||
    value === "learning_platform" ||
    value === "social"
  );
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
