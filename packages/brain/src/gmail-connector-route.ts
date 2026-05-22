import {
  defaultBrainMemoryService,
  type BrainMemoryRouteService,
} from "./brain-memory-route.ts";
import {
  buildGoogleConnectorProvider,
  completeGoogleConnectorSync,
  connectorSourceToBrainImport,
  createNangoAdapter,
  type ConnectorError,
  googleConnectorCredentialLabel,
  googleConnectorTagKeys,
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
  type NangoAdapter,
  type NangoConnectSessionInput,
  type NangoProxyResponse,
} from "./google-connector.ts";
import {
  mergeGoogleConnectorStates,
  resolveDefaultGoogleConnectorStateStore,
  type GoogleConnectorStateStore,
} from "./google-connector-state-store.ts";

export type GoogleGmailConnectorRouteOptions = {
  env?: Record<string, string | undefined>;
  adapter?: NangoAdapter;
  stateStore?: GoogleConnectorStateStore;
  brainMemoryService?: BrainMemoryRouteService;
};

export type GmailKeywordSearchInput = {
  text?: string;
  from?: string;
  to?: string;
  subject?: string;
  label?: string | string[];
  after?: string;
  before?: string;
  hasAttachment?: boolean;
  maxResults?: number;
  pageToken?: string;
  sync?: boolean;
};

export type GmailParsedMessage = {
  id: string;
  threadId: string | null;
  historyId: string | null;
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  date: string | null;
  labels: string[];
  snippet: string;
  plainTextBody: string;
  messageId: string;
  rfcMessageId: string | null;
  sizeEstimate: number | null;
  hasAttachment: boolean;
  attachments: Array<{
    filename: string;
    mimeType: string;
    attachmentId: string | null;
  }>;
  bodyTruncated: boolean;
};

const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
const gmailScopeAuditReason = "read email for private Brain memory and email search.";
const gmailApiBaseUrl = "https://gmail.googleapis.com/gmail/v1";
const defaultGmailMaxResults = 25;
const hardGmailMaxResults = 100;
const hardGmailPageLimit = 5;
const gmailMessageSizeByteLimit = 2_000_000;
const gmailBodyCharLimit = 100_000;
const gmailBodyEncodedCharLimit = 150_000;
const gmailSnippetCharLimit = 500;
const gmailSubjectCharLimit = 300;
const gmailAttachmentMetadataLimit = 25;
const gmailProxyMaxAttempts = 3;
const gmailProxyRetryBaseDelayMs = 100;

export async function handleGoogleGmailConnectRequest(
  request: Request,
  options: GoogleGmailConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/gmail/connect requires the POST method.", "POST");
  }

  const config = readGoogleConnectorRuntimeConfig(options.env);
  const configError = gmailConfigResponse(config);

  if (configError) {
    return configError;
  }

  const body = await readJsonBody<Partial<NangoConnectSessionInput>>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  const endUserId = firstNonEmpty(body.value.endUserId, request.headers.get("x-user-id"), request.headers.get("x-penny-user-id"));

  if (!endUserId) {
    return invalidRequest("Gmail connect requires an end user id.", ["endUserId"]);
  }

  const scope = scopeFromRequest(request);
  const scopePlan = planGoogleScopeRequest({
    surfaceIds: ["google_gmail"],
    mode: googleScopeRequestMode(options.env),
    config,
  });

  if (!scopePlan.requestableScopeUrls.includes(gmailReadonlyScope)) {
    return jsonResponse(
      {
        error: {
          code: "gmail_scope_blocked",
          message: "Gmail is restricted-scope gated and cannot be connected in this environment.",
          retryable: false,
          details: {
            warnings: scopePlan.warnings,
            missingConfig: config.missingGmailConfig,
          },
        },
      },
      409,
    );
  }

  const input: NangoConnectSessionInput = {
    endUserId,
    allowedIntegrations: [config.nangoGmailIntegrationId!],
    tags: {
      ...(body.value.tags ?? {}),
      [googleConnectorTagKeys.bundle]: "gmail",
      [googleConnectorTagKeys.surfaces]: "google_gmail",
      [googleConnectorTagKeys.scopeIds]: "google.gmail.readonly",
      penny_scope_audit_reason: gmailScopeAuditReason,
      ...(scope.projectId ? { [googleConnectorTagKeys.projectId]: scope.projectId } : {}),
      ...(scope.sphereId ? { [googleConnectorTagKeys.sphereId]: scope.sphereId } : {}),
    },
  };
  const organizationId = firstNonEmpty(
    body.value.organizationId,
    request.headers.get("x-workspace-id"),
    request.headers.get("x-penny-workspace-id"),
  );

  if (organizationId) {
    input.organizationId = organizationId;
  }

  if (body.value.endUserEmail) {
    input.endUserEmail = body.value.endUserEmail;
  }

  if (body.value.endUserDisplayName) {
    input.endUserDisplayName = body.value.endUserDisplayName;
  }

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
        requestedSurfaceIds: ["google_gmail"],
        requestableSurfaceIds: ["google_gmail"],
        requestableScopeUrls: [gmailReadonlyScope],
        providerConfigKey: config.nangoGmailIntegrationId,
        restrictedScope: true,
        gated: true,
        private: true,
        scopeAuditReason: gmailScopeAuditReason,
        warnings: scopePlan.warnings,
      },
    },
    201,
  );
}

export async function handleGoogleGmailStatusRequest(
  request: Request,
  options: GoogleGmailConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/connectors/google/gmail/status requires the GET method.", "GET");
  }

  const scope = scopeFromRequest(request);
  const config = readGoogleConnectorRuntimeConfig(options.env);
  const state = await loadGoogleConnectorState(options, scope);
  const provider = buildGoogleConnectorProvider({
    ...(options.env ? { env: options.env } : {}),
    connections: state.connections,
  });
  const gmailSurface = provider.surfaces.find((surface) => surface.id === "google_gmail") ?? null;
  const gmailConnections = state.connections.filter((connection) => connection.surfaces.includes("google_gmail"));
  const enabledGmailSources = state.sources.filter(
    (source) => source.surface === "google_gmail" && source.privacy.retrievalAccess === "enabled",
  );
  const statusState = gmailStatusStateView(state, gmailConnections, enabledGmailSources);

  return jsonResponse({
    data: {
      sourceOfTruth: "gmail_connector_state_and_private_brain_memory",
      configured: config.gmailConfigured,
      message: config.gmailConfigured ? "Gmail configured." : "Gmail not configured.",
      missingConfig: config.missingGmailConfig,
      status: gmailConnections.some((connection) => connection.status === "syncing")
        ? "syncing"
        : gmailConnections.some((connection) => connection.status === "connected")
          ? "connected"
          : (gmailSurface?.status ?? "gated_verification_required"),
      scopes: [gmailReadonlyScope],
      scopeAuditReason: gmailScopeAuditReason,
      restrictedScope: true,
      gated: true,
      private: true,
      privacy: gmailPrivacyCopy(),
      lastSyncAt: latestIso(gmailConnections.map((connection) => connection.lastSyncedAt)),
      messageCount: enabledGmailSources.length,
      surface: gmailSurface,
      connections: statusState.connections,
      sources: statusState.sources,
      state: statusState,
    },
  });
}

export async function handleGoogleGmailSyncRequest(
  request: Request,
  options: GoogleGmailConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/gmail/sync requires the POST method.", "POST");
  }

  const body = await readJsonBody<Record<string, unknown>>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  const configError = gmailConfigResponse(readGoogleConnectorRuntimeConfig(options.env));

  if (configError) {
    return configError;
  }

  const syncInput = {
    request,
    options,
    body: body.value,
    q: stringValue(body.value.q) ?? buildGmailSearchQuery(body.value),
    maxResults: boundedInt(body.value.maxResults, defaultGmailMaxResults, 1, hardGmailMaxResults),
    pageLimit: boundedInt(body.value.pageLimit, 1, 1, hardGmailPageLimit),
    includeSpamTrash: body.value.includeSpamTrash === true,
  };
  const pageToken = stringValue(body.value.pageToken);
  const result = await syncGmailMessages(pageToken ? { ...syncInput, pageToken } : syncInput);

  if (!result.ok) {
    return result.response;
  }

  return jsonResponse({ data: result.data }, 200);
}

export async function handleGoogleGmailSearchRequest(
  request: Request,
  options: GoogleGmailConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/gmail/search requires the POST method.", "POST");
  }

  const body = await readJsonBody<GmailKeywordSearchInput & Record<string, unknown>>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  const configError = gmailConfigResponse(readGoogleConnectorRuntimeConfig(options.env));

  if (configError) {
    return configError;
  }

  const scope = scopeFromRequest(request);
  const state = await loadGoogleConnectorState(options, scope);
  const connection = findGmailConnection(state, scope, body.value);

  if (!connection.ok) {
    return connection.response;
  }

  const readonlyError = gmailReadonlyResponse(connection.value);

  if (readonlyError) {
    return readonlyError;
  }

  const adapter = resolveAdapter(options);
  const q = buildGmailSearchQuery(body.value);
  const maxResults = boundedInt(body.value.maxResults, 10, 1, 50);
  const listResult = await gmailProxy(adapter, connection.value, "GET", "users/me/messages", {
    q,
    maxResults,
    includeSpamTrash: false,
    ...(body.value.pageToken ? { pageToken: body.value.pageToken } : {}),
  });

  if (!listResult.ok) {
    return adapterResponse(listResult, 200);
  }

  const listBody = recordValue(listResult.data.body);
  const refs = messageListItems(listBody).slice(0, maxResults);
  const details = await Promise.all(
    refs.map((ref) =>
      gmailProxy(adapter, connection.value, "GET", `users/me/messages/${encodeURIComponent(ref.id)}`, {
        format: "metadata",
      }),
    ),
  );
  const results = details.flatMap((result) =>
    result.ok ? [gmailSearchResultFromMessage(parseGmailMessage(recordValue(result.data.body)))] : [],
  ).filter((result) => result.messageId);
  let syncData: unknown = null;

  if (body.value.sync === true) {
    const syncInput = {
      request,
      options,
      body: body.value,
      q,
      maxResults,
      pageLimit: 1,
      includeSpamTrash: false,
    };
    const syncResult = body.value.pageToken
      ? await syncGmailMessages({ ...syncInput, pageToken: body.value.pageToken })
      : await syncGmailMessages(syncInput);

    if (!syncResult.ok) {
      return syncResult.response;
    }

    syncData = syncResult.data;
  }

  return jsonResponse({
    data: {
      sourceOfTruth: "gmail_api_search_via_nango",
      query: q,
      stored: body.value.sync === true,
      sync: syncData,
      nextPageToken: stringValue(listBody.nextPageToken),
      results,
    },
  });
}

export async function handleGoogleGmailSemanticSearchRequest(
  request: Request,
  options: GoogleGmailConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/gmail/semantic-search requires the POST method.", "POST");
  }

  const body = await readJsonBody<Record<string, unknown>>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  const configError = gmailConfigResponse(readGoogleConnectorRuntimeConfig(options.env));

  if (configError) {
    return configError;
  }

  const query = stringValue(body.value.query) ?? stringValue(body.value.text);

  if (!query) {
    return invalidRequest("Gmail semantic search requires query or text.", ["query"]);
  }

  const scope = scopeFromRequest(request);
  const state = await loadGoogleConnectorState(options, scope);
  const selectedConnection = hasGmailConnectionSelector(body.value) ? findGmailConnection(state, scope, body.value) : null;

  if (selectedConnection && !selectedConnection.ok) {
    return selectedConnection.response;
  }

  if (selectedConnection?.ok) {
    const readonlyError = gmailReadonlyResponse(selectedConnection.value);

    if (readonlyError) {
      return readonlyError;
    }
  }

  const gmailSources = state.sources.filter(
    (source) =>
      source.surface === "google_gmail" &&
      source.privacy.retrievalAccess === "enabled" &&
      source.brainSourceId &&
      (!selectedConnection?.ok || source.connectionId === selectedConnection.value.id),
  );

  if (!gmailSources.length) {
    return jsonResponse(
      {
        error: {
          code: "gmail_not_synced",
          message: "Sync Gmail first.",
          retryable: false,
        },
      },
      409,
    );
  }

  const sourceByBrainId = new Map(gmailSources.map((source) => [source.brainSourceId, source]));
  const retrieval = await resolveBrainMemoryService(options).retrieve(
    {
      query,
      limit: boundedInt(body.value.limit, 8, 1, 20),
    },
    request,
  );
  const results = retrieval.results
    .filter((result) => sourceByBrainId.has(result.sourceId))
    .map((result) => {
      const source = sourceByBrainId.get(result.sourceId)!;
      const metadata = emailMetadata(source);

      return {
        messageId: metadata.messageId,
        threadId: metadata.threadId,
        subject: metadata.subject,
        sender: metadata.sender,
        date: metadata.date,
        snippet: result.excerpt,
        sourceRef: {
          id: source.id,
          providerId: source.providerId,
          surface: source.surface,
          sourceUri: source.sourceUri,
          externalId: source.sourceRef.externalId,
          url: source.sourceRef.url,
        },
        memoryRef: result.memoryRef,
        grounding: result.evidenceLevel === "inferred" ? "inferred" : "grounded",
        scoreReason: scoreReason(result.evidenceLevel, metadata.subject, result.type),
      };
    });

  return jsonResponse({
    data: {
      sourceOfTruth: "synced_private_gmail_brain_memory",
      query,
      engine: "deterministic_text_similarity",
      contextLight: results.length === 0,
      results,
    },
  });
}

export async function handleGoogleGmailRevokeRequest(
  request: Request,
  options: GoogleGmailConnectorRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/connectors/google/gmail/revoke requires the POST method.", "POST");
  }

  const body = await readJsonBody<Record<string, unknown>>(request);

  if (!body.ok) {
    return invalidJson(body.message);
  }

  const scope = scopeFromRequest(request);
  const state = await loadGoogleConnectorState(options, scope);
  const connection = findGmailConnection(state, scope, body.value);

  if (!connection.ok) {
    return connection.response;
  }

  const adapterResult = await resolveAdapter(options).revokeConnection({
    connectionId: connection.value.credential.connectionId,
    providerConfigKey: connection.value.credential.providerConfigKey,
  });

  if (!adapterResult.ok) {
    return adapterResponse(adapterResult, 200);
  }

  const nextState = revokeGoogleConnectorAccess({
    state,
    scope,
    connectionId: connection.value.id,
    now: new Date().toISOString(),
  });
  const saved = await saveGoogleConnectorState(options, scope, nextState);

  return jsonResponse({ data: { ...adapterResult.data, state: saved } }, 200);
}

export function buildGmailSearchQuery(input: GmailKeywordSearchInput | Record<string, unknown>): string {
  const parts: string[] = [];
  const text = stringValue(input.text);
  const from = stringValue(input.from);
  const to = stringValue(input.to);
  const subject = stringValue(input.subject);
  const labels = Array.isArray(input.label)
    ? input.label.map((label) => (typeof label === "string" ? label.trim() : "")).filter(Boolean)
    : stringValue(input.label)
      ? [stringValue(input.label)!]
      : [];
  const after = gmailDateValue(stringValue(input.after));
  const before = gmailDateValue(stringValue(input.before));

  if (text) {
    parts.push(gmailQuotedTerm(text));
  }

  if (from) {
    parts.push(`from:${gmailSearchToken(from)}`);
  }

  if (to) {
    parts.push(`to:${gmailSearchToken(to)}`);
  }

  if (subject) {
    parts.push(`subject:${gmailSearchToken(subject)}`);
  }

  for (const label of labels) {
    parts.push(`label:${gmailSearchToken(label)}`);
  }

  if (after) {
    parts.push(`after:${after}`);
  }

  if (before) {
    parts.push(`before:${before}`);
  }

  if (input.hasAttachment === true) {
    parts.push("has:attachment");
  }

  return parts.join(" ").trim();
}

export function parseGmailMessage(message: Record<string, unknown>): GmailParsedMessage {
  const payload = recordValue(message.payload);
  const headers = gmailHeaders(payload);
  const labelIds = stringArray(message.labelIds);
  const parts = flattenMessageParts(payload);
  const plainTextBody = decodedMessageBody(parts, "text/plain");
  const plainTextBodyRaw = plainTextBody.text;
  const htmlFallback = plainTextBodyRaw ? { text: "", truncated: false } : decodedMessageBody(parts, "text/html", stripHtml);
  const htmlFallbackRaw = htmlFallback.text;
  const bodyText = limitText(plainTextBodyRaw || htmlFallbackRaw || stringValue(message.snippet) || "", gmailBodyCharLimit);
  const subject = clipText(headerValue(headers, "subject") ?? "(no subject)", gmailSubjectCharLimit);
  const id = stringValue(message.id) ?? "";
  const messageId = id;
  const attachments = parts
    .filter((part) => Boolean(part.filename || part.attachmentId))
    .slice(0, gmailAttachmentMetadataLimit)
    .map((part) => ({
      filename: clipText(part.filename ?? "(unnamed attachment)", 240),
      mimeType: clipText(part.mimeType || "application/octet-stream", 120),
      attachmentId: part.attachmentId,
    }));

  return {
    id,
    threadId: stringValue(message.threadId) ?? null,
    historyId: stringValue(message.historyId) ?? null,
    subject,
    from: headerValue(headers, "from") ?? "",
    to: splitAddressHeader(headerValue(headers, "to")),
    cc: splitAddressHeader(headerValue(headers, "cc")),
    date: headerValue(headers, "date") ?? dateFromInternalDate(message.internalDate),
    labels: labelIds,
    snippet: clipText(stringValue(message.snippet) ?? "", gmailSnippetCharLimit),
    plainTextBody: bodyText.text,
    messageId,
    rfcMessageId: headerValue(headers, "message-id"),
    sizeEstimate: numberValue(message.sizeEstimate),
    hasAttachment: attachments.length > 0,
    attachments,
    bodyTruncated: plainTextBody.truncated || htmlFallback.truncated || bodyText.truncated,
  };
}

async function syncGmailMessages(input: {
  request: Request;
  options: GoogleGmailConnectorRouteOptions;
  body: Record<string, unknown>;
  q: string;
  maxResults: number;
  pageToken?: string;
  pageLimit: number;
  includeSpamTrash: boolean;
}): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; response: Response }
> {
  const scope = scopeFromRequest(input.request);
  const state = await loadGoogleConnectorState(input.options, scope);
  const connection = findGmailConnection(state, scope, input.body);

  if (!connection.ok) {
    return { ok: false, response: connection.response };
  }

  const readonlyError = gmailReadonlyResponse(connection.value);

  if (readonlyError) {
    return { ok: false, response: readonlyError };
  }

  const adapter = resolveAdapter(input.options);
  const now = stringValue(input.body.now) ?? new Date().toISOString();
  const runningState = startGoogleConnectorSync({
    state,
    scope,
    connectionId: connection.value.id,
    surface: "google_gmail",
    now,
  });
  const runningJob = [...runningState.syncJobs]
    .reverse()
    .find((job) => job.connectionId === connection.value.id && job.surface === "google_gmail" && job.status === "running");

  if (!runningJob) {
    return {
      ok: false,
      response: jsonResponse({ error: { code: "gmail_sync_not_started", message: "Gmail sync could not start." } }, 500),
    };
  }

  const profileResult = await gmailProxy(adapter, connection.value, "GET", "users/me/profile");

  if (!profileResult.ok) {
    return { ok: false, response: adapterResponse(profileResult, 200) };
  }

  const profile = recordValue(profileResult.data.body);
  const messages: GmailParsedMessage[] = [];
  const partialFailures: GmailSyncPartialFailure[] = [];
  let nextPageToken = input.pageToken;

  for (let page = 0; page < input.pageLimit && messages.length < input.maxResults; page += 1) {
    const listResult = await gmailProxy(adapter, connection.value, "GET", "users/me/messages", {
      q: input.q,
      maxResults: Math.min(input.maxResults - messages.length, hardGmailMaxResults),
      includeSpamTrash: input.includeSpamTrash,
      ...(nextPageToken ? { pageToken: nextPageToken } : {}),
    });

    if (!listResult.ok) {
      return { ok: false, response: adapterResponse(listResult, 200) };
    }

    const listBody = recordValue(listResult.data.body);
    const refs = messageListItems(listBody);

    if (!refs.length) {
      nextPageToken = stringValue(listBody.nextPageToken);
      break;
    }

    const details = await Promise.all(
      refs.map(async (ref) => ({
        ref,
        result: await gmailProxy(adapter, connection.value, "GET", `users/me/messages/${encodeURIComponent(ref.id)}`, {
          format: "full",
        }),
      })),
    );

    for (const detail of details) {
      if (detail.result.ok) {
        const parsed = parseGmailMessage(recordValue(detail.result.data.body));

        if (!parsed.id || (!input.includeSpamTrash && parsed.labels.some((label) => label === "SPAM" || label === "TRASH"))) {
          continue;
        }

        if (parsed.sizeEstimate !== null && parsed.sizeEstimate > gmailMessageSizeByteLimit) {
          partialFailures.push(gmailOversizedFailure(parsed));
        } else {
          messages.push(parsed);
        }
      } else {
        partialFailures.push(gmailPartialFailure(detail.ref, detail.result.error));
      }
    }

    nextPageToken = stringValue(listBody.nextPageToken);

    if (!nextPageToken) {
      break;
    }
  }

  const imported = await importGmailMessages({
    request: input.request,
    options: input.options,
    connection: connection.value,
    messages,
    now,
    cursor: gmailCursor(profile, messages),
  });
  const nextState = completeGoogleConnectorSync({
    state: runningState,
    scope,
    connectionId: connection.value.id,
    jobId: runningJob.id,
    surface: "google_gmail",
    now,
    cursor: imported.cursor,
    nextSyncAt: nextGmailSyncAt(now),
    sources: imported.sources,
  });
  const saved = await saveGoogleConnectorState(input.options, scope, nextState);

  return {
    ok: true,
    data: {
      sourceOfTruth: "gmail_sync_via_nango_proxy_private_brain_memory",
      profile: {
        emailAddress: stringValue(profile.emailAddress),
        messagesTotal: numberValue(profile.messagesTotal),
        threadsTotal: numberValue(profile.threadsTotal),
        historyId: stringValue(profile.historyId),
      },
      importedSources: imported.importedSources,
      messageCount: messages.length,
      partialFailureCount: partialFailures.length,
      partialFailures,
      nextPageToken,
      cursor: imported.cursor,
      state: saved,
    },
  };
}

async function importGmailMessages(input: {
  request: Request;
  options: GoogleGmailConnectorRouteOptions;
  connection: ConnectorConnection;
  messages: GmailParsedMessage[];
  now: string;
  cursor: string | null;
}): Promise<{
  cursor: string | null;
  sources: Array<GoogleConnectorSourceDraft & { content: string }>;
  importedSources: Array<{ messageId: string; brainSourceId: string; memoryNodeCount: number }>;
}> {
  const sources = input.messages.map((message) => gmailMessageSourceDraft(message));
  const importedSources: Array<{ messageId: string; brainSourceId: string; memoryNodeCount: number }> = [];

  for (const source of sources) {
    const sourceRef = pendingGmailConnectorSource({
      connection: input.connection,
      source,
      now: input.now,
      cursor: input.cursor,
    });
    const importResult = await resolveBrainMemoryService(input.options).importSource(
      connectorSourceToBrainImport(sourceRef, source.content),
      input.request,
    );

    source.brainSourceId = importResult.job.sourceId;
    source.brainNodeIds = importResult.profile.recentMemoryNodes
      .filter((node) => node.sourceId === importResult.job.sourceId)
      .map((node) => node.id);
    importedSources.push({
      messageId: source.externalId,
      brainSourceId: importResult.job.sourceId ?? "",
      memoryNodeCount: importResult.job.counts.memoryNodes,
    });
  }

  return {
    cursor: input.cursor,
    sources,
    importedSources,
  };
}

function gmailMessageSourceDraft(message: GmailParsedMessage): GoogleConnectorSourceDraft & { content: string } {
  return {
    surface: "google_gmail",
    kind: "google_gmail_message",
    externalId: message.id,
    sourceUri: `gmail:message:${message.id}`,
    label: message.subject || `Gmail message ${message.id}`,
    url: message.threadId ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(message.threadId)}` : null,
    metadata: {
      messageId: message.messageId,
      rfcMessageId: message.rfcMessageId,
      threadId: message.threadId,
      subject: message.subject,
      from: message.from,
      to: message.to,
      cc: message.cc,
      date: message.date,
      labels: message.labels,
      sizeEstimate: message.sizeEstimate,
      messageSizeLimitBytes: gmailMessageSizeByteLimit,
      snippet: message.snippet,
      hasAttachment: message.hasAttachment,
      attachmentCount: message.attachments.length,
      attachments: message.attachments,
      historyId: message.historyId,
      bodyTruncated: message.bodyTruncated,
      bodyCharLimit: gmailBodyCharLimit,
      scopeAuditReason: gmailScopeAuditReason,
      trainingUse: false,
      rawRetention: false,
    },
    rawContentStored: false,
    content: gmailMessageContent(message),
  };
}

function pendingGmailConnectorSource(input: {
  connection: ConnectorConnection;
  source: GoogleConnectorSourceDraft;
  now: string;
  cursor: string | null;
}): ConnectorSource {
  return {
    id: `pending:${input.connection.id}:${input.source.sourceUri}`,
    connectionId: input.connection.id,
    providerId: "google",
    surface: "google_gmail",
    kind: "google_gmail_message",
    sourceUri: input.source.sourceUri,
    label: input.source.label,
    metadata: input.source.metadata ?? {},
    sourceRef: {
      providerId: "google",
      surface: "google_gmail",
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
      cursor: input.cursor,
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

function gmailMessageContent(message: GmailParsedMessage): string {
  return [
    `Subject: ${message.subject}`,
    `From: ${message.from}`,
    message.to.length ? `To: ${message.to.join(", ")}` : null,
    message.cc.length ? `Cc: ${message.cc.join(", ")}` : null,
    message.date ? `Date: ${message.date}` : null,
    message.labels.length ? `Labels: ${message.labels.join(", ")}` : null,
    message.threadId ? `Thread ID: ${message.threadId}` : null,
    `Gmail message ID: ${message.messageId}`,
    message.rfcMessageId ? `RFC Message-ID: ${message.rfcMessageId}` : null,
    message.snippet ? `Snippet: ${message.snippet}` : null,
    message.attachments.length
      ? `Attachments: ${message.attachments.map((attachment) => `${attachment.filename} (${attachment.mimeType})`).join(", ")}`
      : null,
    message.plainTextBody ? `Body:\n${message.plainTextBody}` : null,
    message.bodyTruncated ? `[Body truncated at ${gmailBodyCharLimit} characters]` : null,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n");
}

function gmailSearchResultFromMessage(message: GmailParsedMessage) {
  return {
    messageId: message.messageId,
    threadId: message.threadId,
    subject: message.subject,
    sender: message.from,
    date: message.date,
    labels: message.labels,
    snippet: message.snippet,
    sourceRef: {
      providerId: "google",
      surface: "google_gmail",
      externalId: message.id,
      sourceUri: `gmail:message:${message.id}`,
      url: message.threadId ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(message.threadId)}` : null,
    },
  };
}

function emailMetadata(source: ConnectorSource): {
  messageId: string;
  threadId: string | null;
  subject: string;
  sender: string;
  date: string | null;
} {
  const metadata = recordValue(source.metadata);

  return {
    messageId: stringValue(metadata.messageId) ?? source.sourceRef.externalId,
    threadId: stringValue(metadata.threadId) ?? null,
    subject: stringValue(metadata.subject) ?? source.label,
    sender: stringValue(metadata.from) ?? "",
    date: stringValue(metadata.date) ?? null,
  };
}

function scoreReason(evidenceLevel: string, subject: string, type: string): string {
  const label = evidenceLevel === "inferred" ? "inferred" : "grounded";

  return `${label} match from synced Gmail memory for "${clipText(subject, 80)}" (${type}).`;
}

function gmailConfigResponse(config: ReturnType<typeof readGoogleConnectorRuntimeConfig>): Response | null {
  if (!config.gmailConfigured) {
    return jsonResponse(
      {
        error: {
          code: "gmail_not_configured",
          message: "Gmail not configured.",
          retryable: false,
          details: {
            missingConfig: config.missingGmailConfig,
            requiredEnv: [
              "ENABLE_GMAIL_CONNECTOR",
              "ENABLE_RESTRICTED_GOOGLE_SCOPES",
              "NANGO_SECRET_KEY",
              "NANGO_PUBLIC_KEY",
              "NANGO_BASE_URL",
              "NANGO_GMAIL_INTEGRATION_ID",
            ],
          },
        },
      },
      503,
    );
  }

  return null;
}

function findGmailConnection(
  state: GoogleConnectorState,
  scope: ConnectorStateScope,
  input: Record<string, unknown>,
): { ok: true; value: ConnectorConnection } | { ok: false; response: Response } {
  const connectionId = stringValue(input.connectionId);
  const providerConfigKey = stringValue(input.providerConfigKey);
  const connection = state.connections.find(
    (candidate) =>
      candidate.surfaces.includes("google_gmail") &&
      (!connectionId || candidate.id === connectionId || candidate.credential.connectionId === connectionId) &&
      (!providerConfigKey || candidate.credential.providerConfigKey === providerConfigKey),
  );

  if (!connection) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "gmail_connection_not_found",
            message: "Connect or sync Gmail first.",
            retryable: false,
          },
        },
        404,
      ),
    };
  }

  if (connection.status === "revoked") {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "gmail_connection_revoked",
            message: "Revoked Gmail connections cannot be used for sync or search.",
            retryable: false,
          },
        },
        409,
      ),
    };
  }

  if (connection.scope.userId !== scope.userId || connection.scope.workspaceId !== scope.workspaceId) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "gmail_connection_not_found",
            message: "No Gmail connection matched this user and workspace scope.",
            retryable: false,
          },
        },
        404,
      ),
    };
  }

  return { ok: true, value: connection };
}

function hasGmailConnectionSelector(input: Record<string, unknown>): boolean {
  return Boolean(stringValue(input.connectionId) || stringValue(input.providerConfigKey));
}

function gmailReadonlyResponse(connection: ConnectorConnection): Response | null {
  if (!connection.scopes.includes(gmailReadonlyScope)) {
    return jsonResponse(
      {
        error: {
          code: "gmail_scope_invalid",
          message: "Gmail connection is missing gmail.readonly scope.",
          retryable: false,
        },
      },
      409,
    );
  }

  return null;
}

async function gmailProxy(
  adapter: NangoAdapter,
  connection: ConnectorConnection,
  method: "GET" | "POST" | "DELETE",
  path: string,
  query: Record<string, string | number | boolean | null | undefined> = {},
  body?: unknown,
): Promise<ConnectorAdapterResult<NangoProxyResponse>> {
  let lastResult: ConnectorAdapterResult<NangoProxyResponse> | null = null;

  for (let attempt = 1; attempt <= gmailProxyMaxAttempts; attempt += 1) {
    const result = await adapter.proxy({
      connectionId: connection.credential.connectionId,
      providerConfigKey: connection.credential.providerConfigKey,
      method,
      path,
      query,
      ...(body !== undefined ? { body } : {}),
      baseUrlOverride: gmailApiBaseUrl,
    });

    if (result.ok || !result.error.retryable || attempt === gmailProxyMaxAttempts) {
      return result;
    }

    lastResult = result;
    await delay(gmailProxyRetryBaseDelayMs * attempt);
  }

  return lastResult ?? {
    ok: false,
    error: {
      code: "nango_request_failed",
      message: "Gmail proxy request failed before completion.",
      retryable: true,
    },
  };
}

type GmailSyncPartialFailure = {
  messageId: string;
  threadId: string | null;
  stage: "message_detail" | "message_oversized";
  retryable: boolean;
  status: number | null;
  errorCode: string;
  message: string;
};

function gmailPartialFailure(
  ref: { id: string; threadId: string | null },
  error: ConnectorError,
): GmailSyncPartialFailure {
  return {
    messageId: ref.id,
    threadId: ref.threadId,
    stage: "message_detail",
    retryable: error.retryable,
    status: numberValue(recordValue(error.details).status),
    errorCode: error.code,
    message: clipText(error.message, 240),
  };
}

function gmailOversizedFailure(message: GmailParsedMessage): GmailSyncPartialFailure {
  return {
    messageId: message.id,
    threadId: message.threadId,
    stage: "message_oversized",
    retryable: false,
    status: null,
    errorCode: "gmail_message_oversized",
    message: `Gmail message sizeEstimate ${message.sizeEstimate} exceeded the ${gmailMessageSizeByteLimit} byte sync limit.`,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveAdapter(options: GoogleGmailConnectorRouteOptions): NangoAdapter {
  return options.adapter ?? createNangoAdapter(readGoogleConnectorRuntimeConfig(options.env));
}

function resolveBrainMemoryService(options: GoogleGmailConnectorRouteOptions): BrainMemoryRouteService {
  return options.brainMemoryService ?? defaultBrainMemoryService;
}

async function loadGoogleConnectorState(
  options: GoogleGmailConnectorRouteOptions,
  scope: ConnectorStateScope,
): Promise<GoogleConnectorState> {
  return (options.stateStore ?? resolveDefaultGoogleConnectorStateStore(options.env)).load(scope);
}

async function saveGoogleConnectorState(
  options: GoogleGmailConnectorRouteOptions,
  scope: ConnectorStateScope,
  state: GoogleConnectorState,
): Promise<GoogleConnectorState> {
  const store = options.stateStore ?? resolveDefaultGoogleConnectorStateStore(options.env);
  const current = await store.load(scope);
  const merged = mergeGoogleConnectorStates(current, state);

  await store.save(merged);

  return merged;
}

function scopeFromRequest(request: Request): ConnectorStateScope {
  return {
    userId: request.headers.get("x-user-id") ?? request.headers.get("x-penny-user-id"),
    workspaceId: request.headers.get("x-workspace-id") ?? request.headers.get("x-penny-workspace-id"),
    projectId: request.headers.get("x-project-id") ?? request.headers.get("x-penny-project-id"),
    sphereId: request.headers.get("x-sphere-id") ?? request.headers.get("x-penny-sphere-id"),
  };
}

function googleScopeRequestMode(env: Record<string, string | undefined> | undefined): "production" | "development" {
  const source = env ?? process.env;
  const nodeEnv = source.NODE_ENV?.trim().toLowerCase();
  const deployEnv = source.PENNY_DEPLOY_ENV?.trim().toLowerCase();

  return nodeEnv === "production" || deployEnv === "production" || deployEnv === "staging" || deployEnv === "private-alpha"
    ? "production"
    : "development";
}

function messageListItems(body: Record<string, unknown>): Array<{ id: string; threadId: string | null }> {
  return arrayRecords(body.messages)
    .map((message) => ({
      id: stringValue(message.id) ?? "",
      threadId: stringValue(message.threadId) ?? null,
    }))
    .filter((message) => message.id);
}

function gmailHeaders(payload: Record<string, unknown>): Map<string, string> {
  const headers = new Map<string, string>();

  for (const header of arrayRecords(payload.headers)) {
    const name = stringValue(header.name)?.toLowerCase();
    const value = stringValue(header.value);

    if (name && value) {
      headers.set(name, value);
    }
  }

  return headers;
}

function headerValue(headers: Map<string, string>, key: string): string | null {
  return headers.get(key.toLowerCase()) ?? null;
}

function flattenMessageParts(payload: Record<string, unknown>): Array<{
  mimeType: string;
  bodyData: string | null;
  filename: string | null;
  attachmentId: string | null;
}> {
  const parts: Array<{
    mimeType: string;
    bodyData: string | null;
    filename: string | null;
    attachmentId: string | null;
  }> = [];
  const visit = (part: Record<string, unknown>) => {
    const body = recordValue(part.body);

    parts.push({
      mimeType: stringValue(part.mimeType) ?? "",
      bodyData: stringValue(body.data) ?? null,
      filename: stringValue(part.filename) ?? null,
      attachmentId: stringValue(body.attachmentId) ?? null,
    });

    for (const child of arrayRecords(part.parts)) {
      visit(child);
    }
  };

  visit(payload);

  return parts;
}

function decodedMessageBody(
  parts: Array<{ mimeType: string; bodyData: string | null }>,
  mimeType: "text/plain" | "text/html",
  transform: (value: string) => string = (value) => value,
): { text: string; truncated: boolean } {
  const texts: string[] = [];
  let truncated = false;
  let textLength = 0;

  for (const part of parts.filter((candidate) => candidate.mimeType === mimeType)) {
    if (textLength >= gmailBodyCharLimit) {
      truncated = true;
      break;
    }

    const decoded = decodeBase64Url(part.bodyData);
    const remaining = Math.max(0, gmailBodyCharLimit - textLength);
    const transformed = transform(decoded.text);
    const text = transformed.length > remaining ? transformed.slice(0, remaining).trim() : transformed;

    if (text) {
      texts.push(text);
      textLength += text.length;
    }

    truncated = truncated || decoded.truncated || transformed.length > remaining;
  }

  const limited = limitText(texts.join("\n\n").trim(), gmailBodyCharLimit);

  return {
    text: limited.text,
    truncated: truncated || limited.truncated,
  };
}

function decodeBase64Url(value: string | null): { text: string; truncated: boolean } {
  if (!value) {
    return { text: "", truncated: false };
  }

  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const clippedLength =
      normalized.length > gmailBodyEncodedCharLimit
        ? Math.max(0, gmailBodyEncodedCharLimit - (gmailBodyEncodedCharLimit % 4))
        : normalized.length;
    const clipped = normalized.slice(0, clippedLength);
    const padded = clipped.padEnd(Math.ceil(clipped.length / 4) * 4, "=");

    return {
      text: Buffer.from(padded, "base64").toString("utf8"),
      truncated: clipped.length < normalized.length,
    };
  } catch {
    return { text: "", truncated: true };
  }
}

function splitAddressHeader(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function dateFromInternalDate(value: unknown): string | null {
  const raw = typeof value === "string" ? Number(value) : typeof value === "number" ? value : Number.NaN;

  return Number.isFinite(raw) ? new Date(raw).toISOString() : null;
}

function gmailCursor(profile: Record<string, unknown>, messages: GmailParsedMessage[]): string | null {
  return stringValue(profile.historyId) ?? [...messages].reverse().find((message) => message.historyId)?.historyId ?? null;
}

function nextGmailSyncAt(now: string): string {
  const date = new Date(now);

  if (Number.isNaN(date.getTime())) {
    return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  }

  return new Date(date.getTime() + 6 * 60 * 60 * 1000).toISOString();
}

function gmailPrivacyCopy() {
  return {
    copy: "Penny reads Gmail only after consent. No human review. trainingUse=false. Delete/revoke removes retrieval access.",
    trainingUse: false,
    rawRetentionDefault: false,
    noHumanReview: true,
  };
}

function gmailStatusStateView(
  state: GoogleConnectorState,
  gmailConnections: readonly ConnectorConnection[],
  enabledGmailSources: readonly ConnectorSource[],
) {
  return {
    connections: gmailConnections.map(gmailStatusConnectionView),
    syncJobs: state.syncJobs.filter((job) => job.surface === "google_gmail").map(gmailStatusSyncJobView),
    sources: enabledGmailSources.map(gmailStatusSourceView),
  };
}

function gmailStatusConnectionView(connection: ConnectorConnection) {
  return {
    id: connection.id,
    status: connection.status,
    surfaces: connection.surfaces,
    scopes: connection.scopes,
    lastSyncedAt: connection.lastSyncedAt,
    nextSyncAt: connection.nextSyncAt,
    revokedAt: connection.revokedAt,
    sourceCounts: connection.sourceCounts,
    credential: {
      connectionId: connection.credential.connectionId,
      providerConfigKey: connection.credential.providerConfigKey,
      ...(connection.credential.accountEmail ? { accountEmail: connection.credential.accountEmail } : {}),
      ...(connection.credential.accountLabel ? { accountLabel: connection.credential.accountLabel } : {}),
      ...(connection.credential.accountId ? { accountId: connection.credential.accountId } : {}),
      ...(connection.credential.endUserId ? { endUserId: connection.credential.endUserId } : {}),
    },
  };
}

function gmailStatusSyncJobView(job: GoogleConnectorState["syncJobs"][number]) {
  return {
    id: job.id,
    connectionId: job.connectionId,
    surface: job.surface,
    status: job.status,
    requestedAt: job.requestedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

function gmailStatusSourceView(source: ConnectorSource) {
  return {
    id: source.id,
    connectionId: source.connectionId,
    kind: source.kind,
    label: `Gmail message ${source.sourceRef.externalId || source.id}`,
    sourceUri: source.sourceUri,
    brainSourceId: source.brainSourceId ?? null,
    privacy: {
      retrievalAccess: source.privacy.retrievalAccess,
    },
  };
}

function latestIso(values: Array<string | null>): string | null {
  const latest = values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];

  return latest ?? null;
}

function gmailSearchToken(value: string): string {
  return /\s/.test(value) ? gmailQuotedTerm(value) : value.replace(/"/g, "");
}

function gmailQuotedTerm(value: string): string {
  const trimmed = value.trim();

  return /\s/.test(trimmed) || /["']/i.test(trimmed) ? `"${trimmed.replace(/"/g, '\\"')}"` : trimmed;
}

function gmailDateValue(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (!Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return `${parsed.getUTCFullYear()}/${String(parsed.getUTCMonth() + 1).padStart(2, "0")}/${String(parsed.getUTCDate()).padStart(2, "0")}`;
  }

  return value.replace(/-/g, "/");
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clipText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();

  return compacted.length <= maxLength ? compacted : `${compacted.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function limitText(value: string, maxLength: number): { text: string; truncated: boolean } {
  const text = value.trim();

  if (text.length <= maxLength) {
    return { text, truncated: false };
  }

  return { text: text.slice(0, maxLength).trim(), truncated: true };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function adapterResponse<T>(result: ConnectorAdapterResult<T>, successStatus: number): Response {
  if (result.ok) {
    return jsonResponse({ data: result.data }, successStatus);
  }

  const status =
    result.error.code === "not_configured" || result.error.code === "connector_disabled"
      ? 503
      : result.error.retryable
        ? 502
        : 400;

  return jsonResponse({ error: result.error }, status);
}

function methodNotAllowed(message: string, allow: string): Response {
  return new Response(JSON.stringify({ error: { code: "method_not_allowed", message } }), {
    status: 405,
    headers: {
      "content-type": "application/json",
      allow,
    },
  });
}

function invalidRequest(message: string, fields: string[] = []): Response {
  return jsonResponse(
    {
      error: {
        code: "invalid_request",
        message,
        fields,
      },
    },
    400,
  );
}

function invalidJson(message: string): Response {
  return jsonResponse(
    {
      error: {
        code: "invalid_json",
        message,
      },
    },
    400,
  );
}

async function readJsonBody<T>(request: Request): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    const text = await request.text();

    return { ok: true, value: (text.trim() ? JSON.parse(text) : {}) as T };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}
