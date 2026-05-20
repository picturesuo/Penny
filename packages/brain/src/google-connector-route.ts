import {
  defaultBrainMemoryService,
  type BrainMemoryRouteService,
} from "./brain-memory-route.ts";
import {
  buildGoogleConnectorProvider,
  completeGoogleConnectorSync,
  connectorSourceToBrainImport,
  createNangoAdapter,
  deleteGoogleConnectorSourceAccess,
  googleScopeRegistry,
  initializeGoogleConnectorConnection,
  readGoogleConnectorRuntimeConfig,
  revokeGoogleConnectorAccess,
  startGoogleConnectorSync,
  type ConnectorAdapterResult,
  type ConnectorConnection,
  type ConnectorStateScope,
  type ConnectorSource,
  type GoogleConnectorState,
  type GoogleConnectorSourceDraft,
  type GoogleSurfaceId,
  type NangoAdapter,
  type NangoCallbackInput,
  type NangoConnectSessionInput,
  type NangoConnectionInput,
  type NangoCredentialsInput,
  type NangoStartSyncInput,
  type NangoSyncStatusInput,
} from "./google-connector.ts";
import {
  mergeGoogleConnectorStates,
  resolveDefaultGoogleConnectorStateStore,
  type GoogleConnectorStateStore,
} from "./google-connector-state-store.ts";

export type GoogleConnectorRouteOptions = {
  env?: Record<string, string | undefined>;
  adapter?: NangoAdapter;
  stateStore?: GoogleConnectorStateStore;
  brainMemoryService?: BrainMemoryRouteService;
};

export type GoogleConnectSessionRequestBody = Partial<NangoConnectSessionInput>;

export type GoogleConnectorCallbackRequestBody = Partial<NangoCallbackInput> & {
  surfaces?: GoogleSurfaceId[];
  now?: string;
  syncIntervalHours?: number;
};

export type GoogleConnectorConnectionRequestBody = Partial<NangoConnectionInput>;

export type GoogleConnectorCredentialsRequestBody = Partial<NangoCredentialsInput>;

export type GoogleConnectorSyncRequestBody = Partial<NangoStartSyncInput> & {
  surface?: GoogleSurfaceId;
  now?: string;
};

export type GoogleConnectorSyncStatusRequestBody = Partial<NangoSyncStatusInput>;

export type GoogleConnectorSyncCompleteSourceInput = GoogleConnectorSourceDraft & {
  content: string;
};

export type GoogleConnectorSyncCompleteRequestBody = Partial<NangoConnectionInput> & {
  jobId?: string;
  surface?: GoogleSurfaceId;
  cursor?: string | null;
  nextSyncAt?: string;
  now?: string;
  sources?: GoogleConnectorSyncCompleteSourceInput[];
};

export type GoogleConnectorSourceDeleteRequestBody = {
  sourceId?: string;
  now?: string;
};

const defaultGoogleSyncNames = ["google-drive-files", "google-calendar-events"] as const;

export async function handleGoogleConnectorProviderRequest(
  request: Request,
  options: GoogleConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/connectors/google requires the GET method.", "GET");
  }

  const scope = scopeFromRequest(request);
  const state = await loadGoogleConnectorState(options, scope);

  return jsonResponse(
    {
      data: {
        sourceOfTruth: "google_connector_registry_and_state",
        provider: buildGoogleConnectorProvider({
          ...(options.env ? { env: options.env } : {}),
          connections: state.connections,
        }),
        state,
      },
    },
    200,
  );
}

export async function handleGoogleConnectorConnectSessionRequest(
  request: Request,
  options: GoogleConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/connect-session requires the POST method.", "POST");
  }

  const body = await readJsonBody<GoogleConnectSessionRequestBody>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  const endUserId = firstNonEmpty(body.value.endUserId, request.headers.get("x-user-id"), request.headers.get("x-penny-user-id"));

  if (!endUserId) {
    return invalidRequest("Google connect session requires an end user id.", ["endUserId"]);
  }

  const input: NangoConnectSessionInput = {
    endUserId,
  };

  if (body.value.organizationId) {
    input.organizationId = body.value.organizationId;
  } else {
    const workspaceId = request.headers.get("x-workspace-id") ?? request.headers.get("x-penny-workspace-id");

    if (workspaceId) {
      input.organizationId = workspaceId;
    }
  }

  if (body.value.endUserEmail) {
    input.endUserEmail = body.value.endUserEmail;
  }

  if (body.value.endUserDisplayName) {
    input.endUserDisplayName = body.value.endUserDisplayName;
  }

  if (body.value.allowedIntegrations) {
    input.allowedIntegrations = body.value.allowedIntegrations;
  }

  if (body.value.tags) {
    input.tags = body.value.tags;
  }

  if (body.value.integrationsConfigDefaults) {
    input.integrationsConfigDefaults = body.value.integrationsConfigDefaults;
  }

  if (body.value.overrides) {
    input.overrides = body.value.overrides;
  }

  return adapterResponse(await resolveAdapter(options).createConnectSession(input), 201);
}

export async function handleGoogleConnectorCallbackRequest(
  request: Request,
  options: GoogleConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/callback requires the POST method.", "POST");
  }

  const body = await readJsonBody<GoogleConnectorCallbackRequestBody>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  if (!body.value.connectionId || !body.value.providerConfigKey) {
    return invalidRequest("Google connector callback requires connectionId and providerConfigKey.", [
      "connectionId",
      "providerConfigKey",
    ]);
  }

  const surfaces = callbackSurfaces(body.value);

  if (!surfaces.length) {
    return invalidRequest("Google connector callback requires explicit surfaces or recognizable Google scopes.", [
      "surfaces",
      "scopes",
    ]);
  }

  const callback = await resolveAdapter(options).handleCallback({
    connectionId: body.value.connectionId,
    providerConfigKey: body.value.providerConfigKey,
    ...(body.value.accountId ? { accountId: body.value.accountId } : {}),
    ...(body.value.endUserId ? { endUserId: body.value.endUserId } : {}),
    ...(body.value.scopes ? { scopes: body.value.scopes } : {}),
  });

  if (!callback.ok) {
    return adapterResponse(callback, 200);
  }

  const initializedState = initializeGoogleConnectorConnection({
    scope: scopeFromRequest(request),
    credential: callback.data,
    surfaces,
    scopes: body.value.scopes ?? [],
    now: body.value.now ?? new Date().toISOString(),
    ...(body.value.syncIntervalHours !== undefined ? { syncIntervalHours: body.value.syncIntervalHours } : {}),
  });
  const state = await saveGoogleConnectorState(
    options,
    initializedState.connections[0]?.scope ?? scopeFromRequest(request),
    initializedState,
  );

  return jsonResponse(
    {
      data: {
        credential: callback.data,
        state,
      },
    },
    200,
  );
}

export async function handleGoogleConnectorListConnectionsRequest(
  request: Request,
  options: GoogleConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/connectors/google/connections requires the GET method.", "GET");
  }

  const url = new URL(request.url);
  const endUserId = firstNonEmpty(url.searchParams.get("endUserId"), request.headers.get("x-user-id"), request.headers.get("x-penny-user-id"));
  const organizationId = firstNonEmpty(
    url.searchParams.get("organizationId"),
    request.headers.get("x-workspace-id"),
    request.headers.get("x-penny-workspace-id"),
  );
  const connectionId = url.searchParams.get("connectionId")?.trim();
  const limitValue = url.searchParams.get("limit");
  const pageValue = url.searchParams.get("page");

  return adapterResponse(
    await resolveAdapter(options).listConnections({
      ...(connectionId ? { connectionId } : {}),
      ...(endUserId ? { endUserId } : {}),
      ...(organizationId ? { organizationId } : {}),
      ...(limitValue ? { limit: boundedPositiveInt(limitValue, 50) } : {}),
      ...(pageValue ? { page: boundedPositiveInt(pageValue, 1) } : {}),
    }),
    200,
  );
}

export async function handleGoogleConnectorCredentialsRequest(
  request: Request,
  options: GoogleConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/credentials requires the POST method.", "POST");
  }

  const body = await readJsonBody<GoogleConnectorCredentialsRequestBody>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  const input = connectionInput(body.value);

  if (!input.ok) {
    return input.response;
  }

  return adapterResponse(
    await resolveAdapter(options).getCredentials({
      ...input.value,
      ...(body.value.forceRefresh !== undefined ? { forceRefresh: body.value.forceRefresh } : {}),
      ...(body.value.includeRefreshToken !== undefined ? { includeRefreshToken: body.value.includeRefreshToken } : {}),
    }),
    200,
  );
}

export async function handleGoogleConnectorSyncNowRequest(
  request: Request,
  options: GoogleConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/sync-now requires the POST method.", "POST");
  }

  const body = await readJsonBody<GoogleConnectorSyncRequestBody>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  const input = connectionInput(body.value);

  if (!input.ok) {
    return input.response;
  }

  const adapterResult = await resolveAdapter(options).startSync({
    ...input.value,
    syncNames: body.value.syncNames?.length ? body.value.syncNames : defaultGoogleSyncNames,
    ...(body.value.reset !== undefined ? { reset: body.value.reset } : {}),
    ...(body.value.emptyCache !== undefined ? { emptyCache: body.value.emptyCache } : {}),
  });

  if (!adapterResult.ok) {
    return adapterResponse(adapterResult, 202);
  }

  const scope = scopeFromRequest(request);
  const currentState = await loadGoogleConnectorState(options, scope);
  const connection = findRouteConnection(currentState, input.value.connectionId);

  if (!connection) {
    return jsonResponse({ data: adapterResult.data }, 202);
  }

  const now = body.value.now ?? new Date().toISOString();
  const surfaces = body.value.surface ? [body.value.surface].filter(isGoogleSurfaceId) : connection.surfaces;
  const nextState = surfaces.reduce(
    (state, surface) =>
      startGoogleConnectorSync({
        state,
        scope,
        connectionId: connection.id,
        surface,
        now,
      }),
    currentState,
  );
  const state = await saveGoogleConnectorState(options, scope, nextState);

  return jsonResponse({ data: { ...adapterResult.data, state } }, 202);
}

export async function handleGoogleConnectorSyncStatusRequest(
  request: Request,
  options: GoogleConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return methodNotAllowed("GET or POST /api/connectors/google/sync-status requires GET or POST.", "GET, POST");
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const connectionId = url.searchParams.get("connectionId")?.trim();
    const providerConfigKey = url.searchParams.get("providerConfigKey")?.trim();
    const input = connectionInput({
      ...(connectionId ? { connectionId } : {}),
      ...(providerConfigKey ? { providerConfigKey } : {}),
    });

    if (!input.ok) {
      return input.response;
    }

    const syncNames = url.searchParams.get("syncNames")?.split(",").map((name) => name.trim()).filter(Boolean);

    return adapterResponse(
      await resolveAdapter(options).getSyncStatus({
        ...input.value,
        ...(syncNames?.length ? { syncNames } : {}),
      }),
      200,
    );
  }

  const body = await readJsonBody<GoogleConnectorSyncStatusRequestBody>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  const input = connectionInput(body.value);

  if (!input.ok) {
    return input.response;
  }

  return adapterResponse(
    await resolveAdapter(options).getSyncStatus({
      ...input.value,
      ...(body.value.syncNames ? { syncNames: body.value.syncNames } : {}),
    }),
    200,
  );
}

export async function handleGoogleConnectorSyncCompleteRequest(
  request: Request,
  options: GoogleConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/sync-complete requires the POST method.", "POST");
  }

  const body = await readJsonBody<GoogleConnectorSyncCompleteRequestBody>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  const input = connectionInput(body.value);

  if (!input.ok) {
    return input.response;
  }

  if (!body.value.jobId || !body.value.surface || !isGoogleSurfaceId(body.value.surface) || !body.value.nextSyncAt) {
    return invalidRequest("Google connector sync completion requires jobId, surface, and nextSyncAt.", [
      "jobId",
      "surface",
      "nextSyncAt",
    ]);
  }

  const sourceInputs = body.value.sources ?? [];

  if (!Array.isArray(sourceInputs)) {
    return invalidRequest("Google connector sync completion sources must be an array.", ["sources"]);
  }

  for (const source of sourceInputs) {
    if (!source.content?.trim()) {
      return invalidRequest("Google connector sync completion sources require content for Brain import.", ["sources.content"]);
    }
  }

  const scope = scopeFromRequest(request);
  const currentState = await loadGoogleConnectorState(options, scope);
  const connection = findRouteConnection(currentState, input.value.connectionId);

  if (!connection) {
    return jsonResponse(
      { error: { code: "connector_connection_not_found", message: "No Google connector connection matched this scope." } },
      404,
    );
  }

  const now = body.value.now ?? new Date().toISOString();
  const importedSources = await Promise.all(
    sourceInputs.map(async (source) => {
      const importResult = await resolveBrainMemoryService(options).importSource(
        connectorSourceToBrainImport(
          pendingConnectorSource({
            connection,
            source,
            now,
            cursor: body.value.cursor ?? null,
          }),
          source.content,
        ),
        request,
      );

      return {
        source: {
          ...source,
          brainSourceId: importResult.job.sourceId,
          brainNodeIds: importResult.profile.recentMemoryNodes
            .filter((node) => node.sourceId === importResult.job.sourceId)
            .map((node) => node.id),
        },
        brainSourceId: importResult.job.sourceId,
        memoryNodeCount: importResult.job.counts.memoryNodes,
      };
    }),
  );
  const nextState = completeGoogleConnectorSync({
    state: currentState,
    scope,
    connectionId: connection.id,
    jobId: body.value.jobId,
    surface: body.value.surface,
    now,
    cursor: body.value.cursor ?? null,
    nextSyncAt: body.value.nextSyncAt,
    sources: importedSources.map((result) => result.source),
  });
  const state = await saveGoogleConnectorState(options, scope, nextState);

  return jsonResponse(
    {
      data: {
        importedSources: importedSources.map((result) => ({
          brainSourceId: result.brainSourceId,
          memoryNodeCount: result.memoryNodeCount,
        })),
        state,
      },
    },
    200,
  );
}

export async function handleGoogleConnectorRefreshRequest(
  request: Request,
  options: GoogleConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/refresh requires the POST method.", "POST");
  }

  const body = await readJsonBody<GoogleConnectorConnectionRequestBody>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  const input = connectionInput(body.value);

  if (!input.ok) {
    return input.response;
  }

  return adapterResponse(await resolveAdapter(options).refreshConnection(input.value), 200);
}

export async function handleGoogleConnectorSourceDeleteRequest(
  request: Request,
  options: GoogleConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/source-delete requires the POST method.", "POST");
  }

  const body = await readJsonBody<GoogleConnectorSourceDeleteRequestBody>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  const sourceId = body.value.sourceId?.trim();

  if (!sourceId) {
    return invalidRequest("Google connector source deletion requires sourceId.", ["sourceId"]);
  }

  const scope = scopeFromRequest(request);
  const currentState = await loadGoogleConnectorState(options, scope);
  const source = currentState.sources.find((candidate) => candidate.id === sourceId);

  if (!source) {
    return jsonResponse(
      { error: { code: "connector_source_not_found", message: "No Google connector source matched this scope." } },
      404,
    );
  }

  const brainDelete = source.brainSourceId
    ? await resolveBrainMemoryService(options).deleteSource(source.brainSourceId, request)
    : null;
  const state = await saveGoogleConnectorState(
    options,
    scope,
    deleteGoogleConnectorSourceAccess({
      state: currentState,
      scope,
      sourceId,
      now: body.value.now ?? new Date().toISOString(),
    }),
  );

  return jsonResponse(
    {
      data: {
        deleted: true,
        brainSourceDeleted: brainDelete?.deleted ?? false,
        ...(brainDelete ? { profile: brainDelete.profile } : {}),
        state,
      },
    },
    200,
  );
}

export async function handleGoogleConnectorRevokeRequest(
  request: Request,
  options: GoogleConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/revoke requires the POST method.", "POST");
  }

  const body = await readJsonBody<GoogleConnectorConnectionRequestBody>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  const input = connectionInput(body.value);

  if (!input.ok) {
    return input.response;
  }

  const adapterResult = await resolveAdapter(options).revokeConnection(input.value);

  if (!adapterResult.ok) {
    return adapterResponse(adapterResult, 200);
  }

  const scope = scopeFromRequest(request);
  const currentState = await loadGoogleConnectorState(options, scope);
  const connection = findRouteConnection(currentState, input.value.connectionId);

  if (!connection) {
    return jsonResponse({ data: adapterResult.data }, 200);
  }

  const state = await saveGoogleConnectorState(
    options,
    scope,
    revokeGoogleConnectorAccess({
      state: currentState,
      scope,
      connectionId: connection.id,
      now: new Date().toISOString(),
    }),
  );

  return jsonResponse({ data: { ...adapterResult.data, state } }, 200);
}

function resolveAdapter(options: GoogleConnectorRouteOptions): NangoAdapter {
  return options.adapter ?? createNangoAdapter(readGoogleConnectorRuntimeConfig(options.env));
}

function resolveBrainMemoryService(options: GoogleConnectorRouteOptions): BrainMemoryRouteService {
  return options.brainMemoryService ?? defaultBrainMemoryService;
}

async function loadGoogleConnectorState(
  options: GoogleConnectorRouteOptions,
  scope: ConnectorStateScope,
): Promise<GoogleConnectorState> {
  return (options.stateStore ?? resolveDefaultGoogleConnectorStateStore(options.env)).load(scope);
}

async function saveGoogleConnectorState(
  options: GoogleConnectorRouteOptions,
  scope: ConnectorStateScope,
  state: GoogleConnectorState,
): Promise<GoogleConnectorState> {
  const store = options.stateStore ?? resolveDefaultGoogleConnectorStateStore(options.env);
  const current = await store.load(scope);
  const merged = mergeGoogleConnectorStates(current, state);

  await store.save(merged);

  return merged;
}

function findRouteConnection(state: GoogleConnectorState, connectionId: string): ConnectorConnection | null {
  return (
    state.connections.find(
      (connection) => connection.id === connectionId || connection.credential.connectionId === connectionId,
    ) ?? null
  );
}

function pendingConnectorSource(input: {
  connection: ConnectorConnection;
  source: GoogleConnectorSyncCompleteSourceInput;
  now: string;
  cursor: string | null;
}): ConnectorSource {
  return {
    id: `pending:${input.connection.id}:${input.source.sourceUri}`,
    connectionId: input.connection.id,
    providerId: "google",
    surface: input.source.surface,
    kind: input.source.kind,
    sourceUri: input.source.sourceUri,
    label: input.source.label,
    metadata: input.source.metadata ?? {},
    sourceRef: {
      providerId: "google",
      surface: input.source.surface,
      externalId: input.source.externalId,
      url: input.source.url ?? null,
    },
    provenance: {
      credentialRef: input.connection.credential.credentialRef,
      fetchedAt: input.now,
      cursor: input.cursor ?? input.source.cursor ?? null,
    },
    privacy: {
      trainingUse: false,
      visibility: "private_user_memory",
      rawContentStored: false,
      productionLogSafe: false,
      retrievalAccess: "enabled",
    },
  };
}

function scopeFromRequest(request: Request): ConnectorStateScope {
  return {
    userId: request.headers.get("x-user-id") ?? request.headers.get("x-penny-user-id"),
    workspaceId: request.headers.get("x-workspace-id") ?? request.headers.get("x-penny-workspace-id"),
    projectId: request.headers.get("x-project-id") ?? request.headers.get("x-penny-project-id"),
    sphereId: request.headers.get("x-sphere-id") ?? request.headers.get("x-penny-sphere-id"),
  };
}

function callbackSurfaces(input: GoogleConnectorCallbackRequestBody): GoogleSurfaceId[] {
  const explicitSurfaces = (input.surfaces ?? []).filter(isGoogleSurfaceId);

  if (explicitSurfaces.length > 0) {
    return [...new Set(explicitSurfaces)];
  }

  const surfaces = (input.scopes ?? []).flatMap((scope) =>
    googleScopeRegistry.filter((entry) => entry.scope === scope).map((entry) => entry.surface),
  );

  return [...new Set(surfaces)];
}

function isGoogleSurfaceId(value: unknown): value is GoogleSurfaceId {
  return (
    value === "google_drive" ||
    value === "google_docs_sheets_slides" ||
    value === "google_calendar" ||
    value === "google_gmail" ||
    value === "google_youtube" ||
    value === "google_takeout" ||
    value === "google_my_activity" ||
    value === "chrome_extension_history"
  );
}

function connectionInput(
  input: Partial<NangoConnectionInput>,
): { ok: true; value: NangoConnectionInput } | { ok: false; response: Response } {
  if (!input.connectionId || !input.providerConfigKey) {
    return {
      ok: false,
      response: invalidRequest("Google connector operation requires connectionId and providerConfigKey.", [
        "connectionId",
        "providerConfigKey",
      ]),
    };
  }

  return {
    ok: true,
    value: {
      connectionId: input.connectionId,
      providerConfigKey: input.providerConfigKey,
    },
  };
}

function adapterResponse<T>(result: ConnectorAdapterResult<T>, successStatus: number): Response {
  if (result.ok) {
    return jsonResponse({ data: result.data }, successStatus);
  }

  return jsonResponse({ error: result.error }, result.error.code === "not_configured" ? 503 : 409);
}

async function readJsonBody<T>(request: Request): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: (await request.json()) as T };
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }
}

function boundedPositiveInt(value: string, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();

    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function invalidJson(message: string): Response {
  return jsonResponse({ error: { code: "invalid_json", message } }, 400);
}

function invalidRequest(message: string, issues: string[]): Response {
  return jsonResponse({ error: { code: "invalid_request", message, issues } }, 400);
}

function methodNotAllowed(message: string, allow: string): Response {
  return jsonResponse({ error: { code: "method_not_allowed", message } }, 405, { Allow: allow });
}

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}
