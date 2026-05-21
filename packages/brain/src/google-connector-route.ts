import { createHmac, timingSafeEqual } from "node:crypto";
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
  googleConnectorCredentialLabel,
  googleConnectorCredentialWithAccountDetails,
  googleConnectorTagKeys,
  googleScopeRegistry,
  googleSurfaceIdsForScopes,
  googleSyncNamesForSurfaces,
  googleWorkspaceSurfaceIds,
  initializeGoogleConnectorConnection,
  planGoogleScopeRequest,
  readGoogleConnectorRuntimeConfig,
  revokeGoogleConnectorAccess,
  startGoogleConnectorSync,
  type ConnectorAdapterResult,
  type ConnectorConnection,
  type ConnectorStateScope,
  type ConnectorSource,
  type GoogleConnectorState,
  type GoogleConnectorSourceDraft,
  type GoogleScopeRequestPlan,
  type GoogleSurfaceId,
  type NangoAdapter,
  type NangoCallbackInput,
  type NangoConnectSessionInput,
  type NangoConnectionInput,
  type NangoCredentialsInput,
  type NangoStartSyncInput,
  type NangoSyncStatusInput,
  type ScopeRequestMode,
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

export type GoogleConnectSessionRequestBody = Partial<NangoConnectSessionInput> & {
  surfaceIds?: GoogleSurfaceId[];
  workspaceBundle?: boolean;
};

export type GoogleConnectorCallbackRequestBody = Partial<NangoCallbackInput> & {
  surfaces?: GoogleSurfaceId[];
  metadata?: Record<string, unknown>;
  tags?: Record<string, string>;
  now?: string;
  syncIntervalHours?: number;
};

export type GoogleConnectorNangoWebhookRequestBody = {
  type?: string;
  operation?: string;
  success?: boolean;
  connectionId?: string;
  providerConfigKey?: string;
  provider?: string;
  authMode?: string;
  tags?: Record<string, string>;
  endUser?: {
    endUserId?: string;
    organizationId?: string;
    email?: string;
    emailAddress?: string;
    displayName?: string;
    name?: string;
  };
  metadata?: Record<string, unknown>;
  environment?: string;
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

  const scope = scopeFromRequest(request);
  const requestedSurfaceIds = requestedConnectSurfaceIds(body.value.surfaceIds);
  const scopePlan = planGoogleScopeRequest({
    surfaceIds: requestedSurfaceIds,
    mode: googleScopeRequestMode(options.env),
    config: readGoogleConnectorRuntimeConfig(options.env),
  });
  const requestableScopeIds = preferredGoogleScopeIdsForSurfaces(requestedSurfaceIds, scopePlan);
  const requestableScopeUrls = googleScopeUrlsForIds(requestableScopeIds);
  const requestableSurfaceIds = googleSurfaceIdsForScopes(requestableScopeUrls).filter((surfaceId) =>
    requestedSurfaceIds.includes(surfaceId),
  );

  if (!requestableSurfaceIds.length) {
    return jsonResponse(
      {
        error: {
          code: "google_workspace_scopes_blocked",
          message: "No requested Google Workspace scopes are currently requestable.",
          details: {
            requestedSurfaceIds,
            warnings: scopePlan.warnings,
            blockedScopes: scopePlan.blockedScopes.map((blockedScope) => blockedScope.id),
          },
        },
      },
      409,
    );
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

  input.tags = {
    ...(input.tags ?? {}),
    [googleConnectorTagKeys.bundle]: body.value.workspaceBundle === false ? "custom" : "workspace",
    [googleConnectorTagKeys.surfaces]: requestableSurfaceIds.join(","),
    ...(requestableScopeIds.length ? { [googleConnectorTagKeys.scopeIds]: requestableScopeIds.join(",") } : {}),
    ...(scope.projectId ? { [googleConnectorTagKeys.projectId]: scope.projectId } : {}),
    ...(scope.sphereId ? { [googleConnectorTagKeys.sphereId]: scope.sphereId } : {}),
  };

  if (body.value.integrationsConfigDefaults) {
    input.integrationsConfigDefaults = body.value.integrationsConfigDefaults;
  }

  if (body.value.overrides) {
    input.overrides = body.value.overrides;
  }

  const result = await resolveAdapter(options).createConnectSession(input);

  if (!result.ok) {
    return adapterResponse(result, 201);
  }

  return jsonResponse(
    {
      data: {
        ...result.data,
        requestedSurfaceIds,
        requestableSurfaceIds,
        requestableScopeUrls,
        warnings: scopePlan.warnings,
      },
    },
    201,
  );
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

  const adapter = resolveAdapter(options);
  const callback = await adapter.handleCallback({
    connectionId: body.value.connectionId,
    providerConfigKey: body.value.providerConfigKey,
    ...(body.value.accountId ? { accountId: body.value.accountId } : {}),
    ...(body.value.accountEmail ? { accountEmail: body.value.accountEmail } : {}),
    ...(body.value.accountLabel ? { accountLabel: body.value.accountLabel } : {}),
    ...(body.value.endUserId ? { endUserId: body.value.endUserId } : {}),
    ...(body.value.scopes ? { scopes: body.value.scopes } : {}),
  });

  if (!callback.ok) {
    return adapterResponse(callback, 200);
  }

  const credential = await enrichGoogleConnectorCredential(adapter, callback.data, {
    connectionId: body.value.connectionId,
    providerConfigKey: body.value.providerConfigKey,
    accountId: body.value.accountId ?? null,
    accountEmail: body.value.accountEmail ?? null,
    accountLabel: body.value.accountLabel ?? null,
    endUserId: body.value.endUserId ?? null,
    ...(body.value.metadata ? { metadata: body.value.metadata } : {}),
    ...(body.value.tags ? { tags: body.value.tags } : {}),
  });
  const initializedState = initializeGoogleConnectorConnection({
    scope: scopeFromRequest(request),
    credential,
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
        credential,
        state,
      },
    },
    200,
  );
}

export async function handleGoogleConnectorNangoWebhookRequest(
  request: Request,
  options: GoogleConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/nango-webhook requires the POST method.", "POST");
  }

  const rawBody = await request.text();
  const signatureError = verifyNangoWebhookSignature(rawBody, request, options.env);

  if (signatureError) {
    return signatureError;
  }

  const parsed = parseJson<GoogleConnectorNangoWebhookRequestBody>(rawBody);

  if (!parsed.ok) {
    return invalidJson(parsed.message);
  }

  const body = parsed.value;

  if (body.type !== "auth") {
    return jsonResponse({ data: { ignored: true, reason: "unsupported_webhook_type" } }, 200);
  }

  if (body.operation !== "creation" && body.operation !== "override") {
    return jsonResponse({ data: { ignored: true, reason: "unsupported_auth_operation" } }, 200);
  }

  if (body.success !== true) {
    return jsonResponse({ data: { ignored: true, reason: "auth_not_successful" } }, 200);
  }

  const tags = stringRecord(body.tags);
  const endUser = recordValue(body.endUser);
  const connectionId = firstNonEmpty(body.connectionId, stringValue((body as Record<string, unknown>).connection_id));
  const providerConfigKey = firstNonEmpty(body.providerConfigKey, stringValue((body as Record<string, unknown>).provider_config_key));

  if (!connectionId || !providerConfigKey) {
    return invalidRequest("Nango auth webhook requires connectionId and providerConfigKey.", [
      "connectionId",
      "providerConfigKey",
    ]);
  }

  const scope = scopeFromNangoWebhook(tags, endUser);

  if (!scope.userId) {
    return invalidRequest("Nango auth webhook requires a tagged end user id.", ["tags.end_user_id"]);
  }

  const taggedScopes = parseList(tags[googleConnectorTagKeys.scopes]);
  const taggedScopeIds = parseList(tags[googleConnectorTagKeys.scopeIds]);
  const scopesFromIds = googleScopeUrlsForIds(taggedScopeIds);
  const scopesFromTags = taggedScopes.length ? taggedScopes : scopesFromIds;
  const surfacesFromTags = parseSurfaceList(tags[googleConnectorTagKeys.surfaces]);
  const surfaces = surfacesFromTags.length ? surfacesFromTags : googleSurfaceIdsForScopes(scopesFromTags);
  const scopes = scopesFromTags.length ? scopesFromTags : googleScopeUrlsForSurfaces(surfaces, options.env);

  if (!surfaces.length) {
    return invalidRequest("Nango auth webhook requires Penny Google surfaces or recognizable scopes.", [
      googleConnectorTagKeys.surfaces,
      googleConnectorTagKeys.scopes,
    ]);
  }

  const adapter = resolveAdapter(options);
  const callback = await adapter.handleCallback({
    connectionId,
    providerConfigKey,
    endUserId: scope.userId,
    scopes,
  });

  if (!callback.ok) {
    return adapterResponse(callback, 200);
  }

  const now = new Date().toISOString();
  const credential = await enrichGoogleConnectorCredential(adapter, callback.data, {
    connectionId,
    providerConfigKey,
    accountEmail: firstNonEmpty(tags.end_user_email, tags.email, stringValue(endUser.email), stringValue(endUser.emailAddress)),
    accountLabel: firstNonEmpty(
      tags.end_user_display_name,
      tags.display_name,
      stringValue(endUser.displayName),
      stringValue(endUser.name),
    ),
    endUserId: scope.userId,
    metadata: recordValue(body.metadata),
    tags,
  });
  const initializedState = initializeGoogleConnectorConnection({
    scope,
    credential,
    surfaces,
    scopes,
    now,
  });
  const scopedConnectionId = initializedState.connections[0]?.id ?? connectionId;
  let state = await saveGoogleConnectorState(options, scope, initializedState);
  const syncNames = googleSyncNamesForSurfaces(surfaces);
  let autoSync:
    | { attempted: false; syncNames: string[] }
    | { attempted: true; started: true; syncNames: string[] }
    | { attempted: true; started: false; syncNames: string[]; error: unknown } = {
    attempted: false,
    syncNames,
  };

  if (syncNames.length) {
    const syncResult = await adapter.startSync({
      connectionId,
      providerConfigKey,
      syncNames,
    });

    if (syncResult.ok) {
      state = await saveGoogleConnectorState(
        options,
        scope,
        surfaces
          .filter((surface) => googleSyncNamesForSurfaces([surface]).length > 0)
          .reduce(
            (nextState, surface) =>
              startGoogleConnectorSync({
                state: nextState,
                scope,
                connectionId: scopedConnectionId,
                surface,
                now,
              }),
            state,
          ),
      );
      autoSync = { attempted: true, started: true, syncNames };
    } else {
      autoSync = { attempted: true, started: false, syncNames, error: syncResult.error };
    }
  }

  return jsonResponse(
    {
      data: {
        credential,
        state,
        autoSync,
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

  const scope = scopeFromRequest(request);
  const currentState = await loadGoogleConnectorState(options, scope);
  const connection = findRouteConnection(currentState, input.value.connectionId);

  if (connection?.status === "revoked") {
    return jsonResponse(
      { error: { code: "connector_revoked", message: "Revoked Google connector connections cannot be synced." } },
      409,
    );
  }

  const adapterResult = await resolveAdapter(options).startSync({
    ...input.value,
    syncNames: body.value.syncNames?.length
      ? body.value.syncNames
      : googleSyncNamesForSurfaces(
          body.value.surface && isGoogleSurfaceId(body.value.surface)
            ? [body.value.surface]
            : connection?.surfaces.length
              ? connection.surfaces
              : googleWorkspaceSurfaceIds,
        ),
    ...(body.value.reset !== undefined ? { reset: body.value.reset } : {}),
    ...(body.value.emptyCache !== undefined ? { emptyCache: body.value.emptyCache } : {}),
  });

  if (!adapterResult.ok) {
    return adapterResponse(adapterResult, 202);
  }

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

async function enrichGoogleConnectorCredential(
  adapter: NangoAdapter,
  credential: ConnectorConnection["credential"],
  input: NangoConnectionInput & {
    metadata?: Record<string, unknown>;
    tags?: Record<string, string>;
    accountId?: string | null;
    accountEmail?: string | null;
    accountLabel?: string | null;
    endUserId?: string | null;
  },
): Promise<ConnectorConnection["credential"]> {
  let enriched = googleConnectorCredentialWithAccountDetails(credential, input);

  try {
    const listed = await adapter.listConnections({ connectionId: input.connectionId });

    if (listed.ok) {
      const match =
        listed.data.find(
          (connection) =>
            connection.connectionId === input.connectionId && connection.providerConfigKey === input.providerConfigKey,
        ) ?? listed.data.find((connection) => connection.connectionId === input.connectionId);

      if (match) {
        enriched = googleConnectorCredentialWithAccountDetails(enriched, {
          metadata: match.metadata,
          tags: match.tags,
        });
      }
    }
  } catch {
    // Account labels are useful provenance, but missing Nango metadata should not block a successful consent callback.
  }

  return enriched;
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
      connectionId: input.connection.credential.connectionId,
      providerConfigKey: input.connection.credential.providerConfigKey,
      connectionLabel: googleConnectorCredentialLabel(input.connection.credential),
      ...(input.connection.credential.accountEmail ? { accountEmail: input.connection.credential.accountEmail } : {}),
      ...(input.connection.credential.accountLabel ? { accountLabel: input.connection.credential.accountLabel } : {}),
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

function scopeFromNangoWebhook(tags: Record<string, string>, endUser: Record<string, unknown>): ConnectorStateScope {
  return {
    userId: firstNonEmpty(
      tags[googleConnectorTagKeys.userId],
      tags.end_user_id,
      stringValue(endUser.endUserId),
      stringValue(endUser.end_user_id),
    ),
    workspaceId: firstNonEmpty(
      tags[googleConnectorTagKeys.workspaceId],
      tags.workspace_id,
      tags.organization_id,
      stringValue(endUser.organizationId),
      stringValue(endUser.organization_id),
    ),
    projectId: firstNonEmpty(tags[googleConnectorTagKeys.projectId], tags.project_id),
    sphereId: firstNonEmpty(tags[googleConnectorTagKeys.sphereId], tags.sphere_id),
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

function requestedConnectSurfaceIds(values: readonly GoogleSurfaceId[] | undefined): GoogleSurfaceId[] {
  const explicit = (values ?? []).filter(isGoogleSurfaceId);

  return explicit.length ? [...new Set(explicit)] : [...googleWorkspaceSurfaceIds];
}

function googleScopeRequestMode(env: Record<string, string | undefined> | undefined): ScopeRequestMode {
  const source = env ?? process.env;
  const nodeEnv = source.NODE_ENV?.trim().toLowerCase();
  const deployEnv = source.PENNY_DEPLOY_ENV?.trim().toLowerCase();

  return nodeEnv === "production" || deployEnv === "production" || deployEnv === "staging" || deployEnv === "private-alpha"
    ? "production"
    : "development";
}

const preferredGoogleScopeIdsBySurface = {
  google_drive: ["google.drive.file"],
  google_docs_sheets_slides: ["google.docs.drive_file_export"],
  google_calendar: ["google.calendar.readonly"],
  google_gmail: ["google.gmail.readonly"],
  google_youtube: ["google.youtube.readonly"],
  google_takeout: [],
  google_my_activity: [],
  chrome_extension_history: [],
} as const satisfies Record<GoogleSurfaceId, readonly string[]>;

function preferredGoogleScopeIdsForSurfaces(
  surfaceIds: readonly GoogleSurfaceId[],
  scopePlan: GoogleScopeRequestPlan,
): string[] {
  const requestableScopeUrls = new Set(scopePlan.requestableScopeUrls);
  const scopeById = new Map(scopePlan.scopes.map((scope) => [scope.id, scope]));
  const scopeIds: string[] = [];

  for (const surfaceId of surfaceIds) {
    for (const scopeId of preferredGoogleScopeIdsBySurface[surfaceId]) {
      const scope = scopeById.get(scopeId);

      if (scope?.scope && requestableScopeUrls.has(scope.scope)) {
        scopeIds.push(scopeId);
      }
    }
  }

  return [...new Set(scopeIds)];
}

function googleScopeUrlsForIds(scopeIds: readonly string[]): string[] {
  const requested = new Set(scopeIds);
  const urls = googleScopeRegistry
    .filter((scope) => scope.scope && requested.has(scope.id))
    .map((scope) => scope.scope)
    .filter((scope): scope is string => Boolean(scope));

  return [...new Set(urls)];
}

function googleScopeUrlsForSurfaces(
  surfaceIds: readonly GoogleSurfaceId[],
  env: Record<string, string | undefined> | undefined,
): string[] {
  if (!surfaceIds.length) {
    return [];
  }

  return planGoogleScopeRequest({
    surfaceIds,
    mode: googleScopeRequestMode(env),
    config: readGoogleConnectorRuntimeConfig(env),
  }).requestableScopeUrls;
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

function verifyNangoWebhookSignature(
  rawBody: string,
  request: Request,
  env: Record<string, string | undefined> | undefined,
): Response | null {
  const secret = readGoogleConnectorRuntimeConfig(env).nangoSecretKey;

  if (!secret) {
    return jsonResponse(
      {
        error: {
          code: "not_configured",
          message: "Google connector Nango webhook verification requires NANGO_SECRET_KEY.",
          retryable: false,
          details: { missingConfig: ["NANGO_SECRET_KEY"] },
        },
      },
      503,
    );
  }

  const signature = request.headers.get("x-nango-hmac-sha256")?.trim();

  if (!signature) {
    return jsonResponse(
      {
        error: {
          code: "invalid_webhook_signature",
          message: "Nango webhook signature is required.",
        },
      },
      401,
    );
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return jsonResponse(
      {
        error: {
          code: "invalid_webhook_signature",
          message: "Nango webhook signature is invalid.",
        },
      },
      401,
    );
  }

  return null;
}

function parseJson<T>(value: string): { ok: true; value: T } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(value) as T };
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item));
  }

  return stringValue(value)
    ?.split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
}

function parseSurfaceList(value: unknown): GoogleSurfaceId[] {
  return parseList(value).filter(isGoogleSurfaceId);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringRecord(value: unknown): Record<string, string> {
  const record = recordValue(value);
  const output: Record<string, string> = {};

  for (const [key, entry] of Object.entries(record)) {
    const stringEntry = stringValue(entry);

    if (stringEntry) {
      output[key] = stringEntry;
    }
  }

  return output;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
