export const connectorStatuses = [
  "available",
  "connected",
  "syncing",
  "failed",
  "revoked",
  "unsupported",
  "manual_import_only",
  "gated_verification_required",
  "extension_required",
] as const;

export type ConnectorStatus = (typeof connectorStatuses)[number];

export type BrainSourceKind =
  | "user_upload"
  | "google_drive_file"
  | "google_doc"
  | "google_sheet"
  | "google_slide"
  | "google_calendar_event"
  | "google_gmail_message"
  | "google_youtube_resource"
  | "google_takeout_import"
  | "google_my_activity_import"
  | "browser_history_extension";

export type GoogleSurfaceId =
  | "google_drive"
  | "google_docs_sheets_slides"
  | "google_calendar"
  | "google_gmail"
  | "google_youtube"
  | "google_takeout"
  | "google_my_activity"
  | "chrome_extension_history";

export type GoogleScopeSensitivity = "non_sensitive" | "sensitive" | "restricted" | "unsupported";

export type ConnectorScope = {
  id: string;
  providerId: "google";
  surface: GoogleSurfaceId;
  scope: string | null;
  sensitivity: GoogleScopeSensitivity;
  whyPennyNeedsIt: string;
  userExplanation: string;
  gated: boolean;
  gatedStatus: ConnectorStatus | null;
  productionAllowed: boolean;
  requiredEnvGate: string | null;
};

export type ConnectorCredentialRef = {
  providerId: "google";
  adapter: "nango";
  connectionId: string;
  providerConfigKey: string;
  credentialRef: string;
  accountId?: string;
  endUserId?: string;
};

export type ConnectorConnection = {
  id: string;
  providerId: "google";
  adapter: "nango";
  credential: ConnectorCredentialRef;
  status: ConnectorStatus;
  surfaces: GoogleSurfaceId[];
  scopes: string[];
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  revokedAt: string | null;
  sourceCounts: Partial<Record<BrainSourceKind, number>>;
  error: ConnectorError | null;
};

export type ConnectorSurface = {
  id: GoogleSurfaceId;
  providerId: "google";
  label: string;
  status: ConnectorStatus;
  sourceKinds: BrainSourceKind[];
  scopes: ConnectorScope[];
  whyPennyCanUseThis: string;
  userExplanation: string;
  supportedNow: string[];
  notFaked: string[];
};

export type ConnectorProvider = {
  id: "google";
  label: "Google";
  adapter: "nango";
  status: ConnectorStatus;
  configured: boolean;
  configurationLabel: "configured" | "not configured" | "disabled";
  surfaces: ConnectorSurface[];
  missingConfig: string[];
};

export type ConnectorSyncCursor = {
  id: string;
  connectionId: string;
  providerId: "google";
  surface: GoogleSurfaceId;
  cursor: string | null;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  updatedAt: string;
};

export type ConnectorSyncJob = {
  id: string;
  connectionId: string;
  providerId: "google";
  surface: GoogleSurfaceId;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  cursorBefore: ConnectorSyncCursor | null;
  cursorAfter: ConnectorSyncCursor | null;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  sourceCounts: Partial<Record<BrainSourceKind, number>>;
  error: ConnectorError | null;
};

export type ConnectorSource = {
  id: string;
  connectionId: string;
  providerId: "google";
  surface: GoogleSurfaceId;
  kind: BrainSourceKind;
  sourceUri: string;
  label: string;
  metadata: Record<string, unknown>;
  sourceRef: {
    providerId: "google";
    surface: GoogleSurfaceId;
    externalId: string;
    url: string | null;
  };
  provenance: {
    credentialRef: string;
    fetchedAt: string;
    cursor: string | null;
  };
  privacy: {
    trainingUse: false;
    visibility: "private_user_memory";
    rawContentStored: boolean;
    productionLogSafe: boolean;
    retrievalAccess: "enabled" | "revoked" | "deleted";
  };
};

export type ConnectorPermissionAudit = {
  id: string;
  providerId: "google";
  connectionId: string | null;
  sourceId: string | null;
  actorUserId: string | null;
  event: ConnectorEvent["type"];
  details: Record<string, unknown>;
  createdAt: string;
};

export type ConnectorError = {
  code:
    | "not_configured"
    | "connector_disabled"
    | "restricted_scope_not_enabled"
    | "gmail_not_enabled"
    | "unsupported_surface"
    | "extension_required"
    | "manual_import_only"
    | "nango_request_failed"
    | "nango_response_invalid";
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
};

export type ConnectorEvent =
  | {
      id: string;
      type: "connector.connect_session_created";
      providerId: "google";
      connectionId: null;
      createdAt: string;
      payload: NangoConnectSession;
    }
  | {
      id: string;
      type: "connector.connected";
      providerId: "google";
      connectionId: string;
      createdAt: string;
      payload: ConnectorCredentialRef;
    }
  | {
      id: string;
      type: "connector.sync_started" | "connector.sync_status_checked";
      providerId: "google";
      connectionId: string;
      createdAt: string;
      payload: Record<string, unknown>;
    }
  | {
      id: string;
      type: "connector.refreshed" | "connector.revoked";
      providerId: "google";
      connectionId: string;
      createdAt: string;
      payload: Record<string, unknown>;
    };

export type GoogleConnectorRuntimeConfig = {
  nangoSecretKey: string | null;
  nangoPublicKey: string | null;
  nangoBaseUrl: string;
  googleOAuthClientId: string | null;
  googleOAuthClientSecret: string | null;
  enableGoogleConnector: boolean;
  enableRestrictedGoogleScopes: boolean;
  enableGmailConnector: boolean;
  missingConfig: string[];
  configured: boolean;
};

export type GoogleConnectorProviderInput = {
  env?: Record<string, string | undefined>;
  connections?: readonly ConnectorConnection[];
};

export type ScopeRequestMode = "production" | "development";

export type GoogleScopeRequest = {
  surfaceIds: readonly GoogleSurfaceId[];
  mode: ScopeRequestMode;
  config?: GoogleConnectorRuntimeConfig;
};

export type GoogleScopeRequestPlan = {
  scopes: ConnectorScope[];
  requestableScopeUrls: string[];
  blockedScopes: ConnectorScope[];
  warnings: string[];
};

export type NangoConnectSessionInput = {
  endUserId: string;
  organizationId?: string;
  endUserEmail?: string;
  endUserDisplayName?: string;
  allowedIntegrations?: readonly string[];
  tags?: Record<string, string>;
  integrationsConfigDefaults?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
};

export type NangoConnectSession = {
  token: string;
  expiresAt: string;
  connectLink: string;
};

export type NangoCallbackInput = {
  connectionId: string;
  providerConfigKey: string;
  endUserId?: string;
  accountId?: string;
  scopes?: readonly string[];
};

export type NangoConnectionSummary = {
  connectionId: string;
  providerConfigKey: string;
  provider: string;
  createdAt: string | null;
  updatedAt: string | null;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  status: ConnectorStatus;
  errors: unknown[];
};

export type NangoCredentialPayload = {
  connectionId: string;
  providerConfigKey: string;
  provider: string;
  credentials: Record<string, unknown>;
  metadata: Record<string, unknown>;
  tags: Record<string, string>;
};

export type NangoListConnectionsInput = {
  connectionId?: string;
  endUserId?: string;
  organizationId?: string;
  tags?: Record<string, string>;
  limit?: number;
  page?: number;
};

export type NangoConnectionInput = {
  connectionId: string;
  providerConfigKey: string;
};

export type NangoCredentialsInput = NangoConnectionInput & {
  forceRefresh?: boolean;
  includeRefreshToken?: boolean;
};

export type NangoStartSyncInput = NangoConnectionInput & {
  syncNames: readonly string[];
  reset?: boolean;
  emptyCache?: boolean;
};

export type NangoSyncStatusInput = NangoConnectionInput & {
  syncNames?: readonly string[];
};

export type NangoSyncStatus = {
  syncs: Array<{
    id: string | null;
    name: string;
    status: ConnectorStatus;
    finishedAt: string | null;
    nextScheduledSyncAt: string | null;
    recordCount: Record<string, unknown>;
  }>;
};

export type ConnectorAdapterResult<T> = { ok: true; data: T } | { ok: false; error: ConnectorError };

export type NangoAdapter = {
  createConnectSession(input: NangoConnectSessionInput): Promise<ConnectorAdapterResult<NangoConnectSession>>;
  handleCallback(input: NangoCallbackInput): Promise<ConnectorAdapterResult<ConnectorCredentialRef>>;
  listConnections(input?: NangoListConnectionsInput): Promise<ConnectorAdapterResult<NangoConnectionSummary[]>>;
  getCredentials(input: NangoCredentialsInput): Promise<ConnectorAdapterResult<NangoCredentialPayload>>;
  revokeConnection(input: NangoConnectionInput): Promise<ConnectorAdapterResult<{ revoked: true }>>;
  startSync(input: NangoStartSyncInput): Promise<ConnectorAdapterResult<{ started: true }>>;
  getSyncStatus(input: NangoSyncStatusInput): Promise<ConnectorAdapterResult<NangoSyncStatus>>;
  refreshConnection(input: NangoConnectionInput): Promise<ConnectorAdapterResult<NangoCredentialPayload>>;
};

export type NangoHttpRequest = {
  method: "GET" | "POST" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: unknown;
};

export type NangoHttpResponse = {
  status: number;
  body: unknown;
};

export type NangoHttpClient = (request: NangoHttpRequest) => Promise<NangoHttpResponse>;

const defaultNangoBaseUrl = "https://api.nango.dev";
const googleProviderConfigKey = "google";

const baseGoogleScopeRegistry = [
  {
    id: "google.drive.file",
    surface: "google_drive",
    scope: "https://www.googleapis.com/auth/drive.file",
    sensitivity: "non_sensitive",
    whyPennyNeedsIt: "Let the user choose specific Drive files that Penny may index and resync.",
    userExplanation: "Penny can read only the Drive files you select or share with Penny.",
    gated: false,
    gatedStatus: null,
    productionAllowed: true,
    requiredEnvGate: null,
  },
  {
    id: "google.drive.metadata.readonly",
    surface: "google_drive",
    scope: "https://www.googleapis.com/auth/drive.metadata.readonly",
    sensitivity: "restricted",
    whyPennyNeedsIt: "Discover Drive file metadata for broad account-level sync.",
    userExplanation: "Penny would see metadata for Drive files, so broad account sync stays gated.",
    gated: true,
    gatedStatus: "gated_verification_required",
    productionAllowed: false,
    requiredEnvGate: "ENABLE_RESTRICTED_GOOGLE_SCOPES",
  },
  {
    id: "google.drive.readonly",
    surface: "google_docs_sheets_slides",
    scope: "https://www.googleapis.com/auth/drive.readonly",
    sensitivity: "restricted",
    whyPennyNeedsIt: "Export selected Google Docs, Sheets, and Slides through Drive where file-level selection is insufficient.",
    userExplanation: "Penny would be able to view and download Drive files, so this is gated until verification.",
    gated: true,
    gatedStatus: "gated_verification_required",
    productionAllowed: false,
    requiredEnvGate: "ENABLE_RESTRICTED_GOOGLE_SCOPES",
  },
  {
    id: "google.docs.drive_file_export",
    surface: "google_docs_sheets_slides",
    scope: "https://www.googleapis.com/auth/drive.file",
    sensitivity: "non_sensitive",
    whyPennyNeedsIt: "Export only user-selected Docs, Sheets, and Slides into source chunks.",
    userExplanation: "Penny can process selected Google files without getting account-wide Drive access.",
    gated: false,
    gatedStatus: null,
    productionAllowed: true,
    requiredEnvGate: null,
  },
  {
    id: "google.calendar.readonly",
    surface: "google_calendar",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    sensitivity: "sensitive",
    whyPennyNeedsIt: "Read calendar event metadata for deadlines, cadence, and collaborator context.",
    userExplanation: "Penny reads calendar events but cannot create, edit, or delete them.",
    gated: false,
    gatedStatus: null,
    productionAllowed: true,
    requiredEnvGate: null,
  },
  {
    id: "google.gmail.metadata",
    surface: "google_gmail",
    scope: "https://www.googleapis.com/auth/gmail.metadata",
    sensitivity: "restricted",
    whyPennyNeedsIt: "Read Gmail labels and headers without message bodies for selective, metadata-first memory.",
    userExplanation: "Penny would see message metadata only, and Gmail access stays off until restricted-scope approval is enabled.",
    gated: true,
    gatedStatus: "gated_verification_required",
    productionAllowed: false,
    requiredEnvGate: "ENABLE_GMAIL_CONNECTOR,ENABLE_RESTRICTED_GOOGLE_SCOPES",
  },
  {
    id: "google.gmail.readonly",
    surface: "google_gmail",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    sensitivity: "restricted",
    whyPennyNeedsIt: "Read selected Gmail threads only when the product has explicit verification and user-scoped filters.",
    userExplanation: "Penny will not request Gmail message access unless Gmail and restricted-scope gates are enabled.",
    gated: true,
    gatedStatus: "gated_verification_required",
    productionAllowed: false,
    requiredEnvGate: "ENABLE_GMAIL_CONNECTOR,ENABLE_RESTRICTED_GOOGLE_SCOPES",
  },
  {
    id: "google.youtube.readonly",
    surface: "google_youtube",
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    sensitivity: "sensitive",
    whyPennyNeedsIt: "Read supported YouTube account resources such as channel or playlist metadata when explicitly connected.",
    userExplanation: "Penny can use supported YouTube resources, but not watch history.",
    gated: false,
    gatedStatus: null,
    productionAllowed: true,
    requiredEnvGate: null,
  },
  {
    id: "google.takeout.manual",
    surface: "google_takeout",
    scope: null,
    sensitivity: "unsupported",
    whyPennyNeedsIt: "Guide the user through a manual Takeout import instead of pretending OAuth can fetch Takeout archives.",
    userExplanation: "Penny can import files you provide; it cannot pull Google Takeout automatically.",
    gated: true,
    gatedStatus: "manual_import_only",
    productionAllowed: true,
    requiredEnvGate: null,
  },
  {
    id: "google.my_activity.manual",
    surface: "google_my_activity",
    scope: null,
    sensitivity: "unsupported",
    whyPennyNeedsIt: "Accept a user-provided My Activity export later without claiming direct Search history access.",
    userExplanation: "Search and My Activity data require manual import guidance; Penny will not fake direct access.",
    gated: true,
    gatedStatus: "manual_import_only",
    productionAllowed: true,
    requiredEnvGate: null,
  },
  {
    id: "google.chrome.extension.history",
    surface: "chrome_extension_history",
    scope: null,
    sensitivity: "unsupported",
    whyPennyNeedsIt: "Leave a Chrome extension seam for browser history and search context after the core loop works.",
    userExplanation: "Browser and search history require a separate extension and explicit permission.",
    gated: true,
    gatedStatus: "extension_required",
    productionAllowed: false,
    requiredEnvGate: null,
  },
] as const satisfies ReadonlyArray<Omit<ConnectorScope, "providerId">>;

export const googleScopeRegistry: readonly ConnectorScope[] = baseGoogleScopeRegistry.map((scope) => ({
  providerId: "google",
  ...scope,
}));

const surfaceDefinitions = [
  {
    id: "google_drive",
    label: "Drive",
    sourceKinds: ["google_drive_file"],
    whyPennyCanUseThis: "Drive files can become private Brain source nodes when the user chooses files or a verified narrow sync.",
    userExplanation: "Connect selected Drive files so Brain can remember what you actually work from.",
    supportedNow: ["Selected-file metadata and source refs", "Resync seam through Nango sync jobs"],
    notFaked: ["No account-wide Drive crawl without restricted-scope verification"],
  },
  {
    id: "google_docs_sheets_slides",
    label: "Docs, Sheets, and Slides",
    sourceKinds: ["google_doc", "google_sheet", "google_slide"],
    whyPennyCanUseThis: "Workspace files are source-backed working material for claims, assumptions, and challenge context.",
    userExplanation: "Penny can export selected Docs, Sheets, and Slides through Drive where permissions allow it.",
    supportedNow: ["Selected-file export seam", "Source refs and normalized chunks"],
    notFaked: ["No broad export of every Workspace file without gated Drive scopes"],
  },
  {
    id: "google_calendar",
    label: "Calendar",
    sourceKinds: ["google_calendar_event"],
    whyPennyCanUseThis: "Calendar gives low-content, high-signal context about deadlines, cadence, and collaborators.",
    userExplanation: "Penny reads events only; it does not write to your calendar.",
    supportedNow: ["Read-only event sync", "Deadline and cadence memory notes"],
    notFaked: ["No event creation, edit, or attendee messaging"],
  },
  {
    id: "google_gmail",
    label: "Gmail",
    sourceKinds: ["google_gmail_message"],
    whyPennyCanUseThis: "Email can be useful context only with metadata-first selection and explicit restricted-scope approval.",
    userExplanation: "Gmail is gated. Penny will not request Gmail scopes unless restricted Google scopes and Gmail are explicitly enabled.",
    supportedNow: ["Gated metadata-first scaffold"],
    notFaked: ["No hidden Gmail import", "No unrestricted mailbox scan", "No message-body access by default"],
  },
  {
    id: "google_youtube",
    label: "YouTube",
    sourceKinds: ["google_youtube_resource"],
    whyPennyCanUseThis: "Supported YouTube resources can explain what the user creates or organizes, not what they watched privately.",
    userExplanation: "Penny can use supported YouTube resources later; watch history is not available through this connector.",
    supportedNow: ["YouTube readonly scope registration", "Resource sync seam"],
    notFaked: ["No YouTube watch history", "No Google Search history"],
  },
  {
    id: "google_takeout",
    label: "Google Takeout",
    sourceKinds: ["google_takeout_import"],
    whyPennyCanUseThis: "Takeout is a manual import path for user-provided archives after parsing is explicit.",
    userExplanation: "Penny can guide a manual import, but it cannot fetch Takeout archives for you.",
    supportedNow: ["Manual import guidance"],
    notFaked: ["No automatic Takeout API access"],
  },
  {
    id: "google_my_activity",
    label: "My Activity",
    sourceKinds: ["google_my_activity_import"],
    whyPennyCanUseThis: "My Activity can only enter Penny through an explicit user-provided export.",
    userExplanation: "Penny will not claim direct Google Search history access.",
    supportedNow: ["Manual import guidance"],
    notFaked: ["No direct Google Search history access"],
  },
  {
    id: "chrome_extension_history",
    label: "Chrome extension seam",
    sourceKinds: ["browser_history_extension"],
    whyPennyCanUseThis: "Browser and search history need explicit extension permissions and a separate review path.",
    userExplanation: "Browser history is future extension work, not part of Google OAuth.",
    supportedNow: ["Extension-required status only"],
    notFaked: ["No browser history access from backend OAuth"],
  },
] as const satisfies ReadonlyArray<Omit<ConnectorSurface, "providerId" | "status" | "scopes">>;

export function readGoogleConnectorRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): GoogleConnectorRuntimeConfig {
  const nangoSecretKey = readEnv(env, "NANGO_SECRET_KEY");
  const nangoPublicKey = readEnv(env, "NANGO_PUBLIC_KEY");
  const googleOAuthClientId = readEnv(env, "GOOGLE_OAUTH_CLIENT_ID");
  const googleOAuthClientSecret = readEnv(env, "GOOGLE_OAUTH_CLIENT_SECRET");
  const nangoBaseUrl = readEnv(env, "NANGO_BASE_URL") ?? defaultNangoBaseUrl;
  const enableGoogleConnector = readFlag(env, "ENABLE_GOOGLE_CONNECTOR");
  const missingConfig = [
    nangoSecretKey ? null : "NANGO_SECRET_KEY",
    nangoPublicKey ? null : "NANGO_PUBLIC_KEY",
    googleOAuthClientId ? null : "GOOGLE_OAUTH_CLIENT_ID",
    googleOAuthClientSecret ? null : "GOOGLE_OAUTH_CLIENT_SECRET",
  ].filter((value): value is string => Boolean(value));

  return {
    nangoSecretKey,
    nangoPublicKey,
    nangoBaseUrl,
    googleOAuthClientId,
    googleOAuthClientSecret,
    enableGoogleConnector,
    enableRestrictedGoogleScopes: readFlag(env, "ENABLE_RESTRICTED_GOOGLE_SCOPES"),
    enableGmailConnector: readFlag(env, "ENABLE_GMAIL_CONNECTOR"),
    missingConfig,
    configured: enableGoogleConnector && missingConfig.length === 0,
  };
}

export function buildGoogleConnectorProvider(input: GoogleConnectorProviderInput = {}): ConnectorProvider {
  const config = readGoogleConnectorRuntimeConfig(input.env);
  const connections = input.connections ?? [];
  const configurationLabel = !config.enableGoogleConnector
    ? "disabled"
    : config.configured
      ? "configured"
      : "not configured";
  const surfaces = surfaceDefinitions.map((surface) => buildSurface(surface, config, connections));
  const status = providerStatus(config, surfaces);

  return {
    id: "google",
    label: "Google",
    adapter: "nango",
    status,
    configured: config.configured,
    configurationLabel,
    surfaces,
    missingConfig: config.missingConfig,
  };
}

export function planGoogleScopeRequest(input: GoogleScopeRequest): GoogleScopeRequestPlan {
  const config = input.config ?? readGoogleConnectorRuntimeConfig();
  const requested = googleScopeRegistry.filter((scope) => input.surfaceIds.includes(scope.surface));
  const scopes = dedupeScopes(requested);
  const requestable: ConnectorScope[] = [];
  const blockedScopes: ConnectorScope[] = [];
  const warnings: string[] = [];

  for (const scope of scopes) {
    const blockedReason = blockedScopeReason(scope, config, input.mode);

    if (blockedReason) {
      blockedScopes.push(scope);
      warnings.push(blockedReason);
    } else {
      requestable.push(scope);
    }
  }

  return {
    scopes,
    requestableScopeUrls: requestable
      .map((scope) => scope.scope)
      .filter((scope): scope is string => typeof scope === "string" && scope.length > 0),
    blockedScopes,
    warnings,
  };
}

export function createNangoAdapter(
  config: GoogleConnectorRuntimeConfig = readGoogleConnectorRuntimeConfig(),
  http: NangoHttpClient = defaultNangoHttpClient,
): NangoAdapter {
  return {
    async createConnectSession(input) {
      const configured = nangoConfigured(config);

      if (!configured.ok) {
        return configured;
      }

      const body = removeUndefined({
        allowed_integrations: input.allowedIntegrations?.length ? [...input.allowedIntegrations] : [googleProviderConfigKey],
        tags: {
          ...input.tags,
          end_user_id: input.endUserId,
          ...(input.organizationId ? { organization_id: input.organizationId } : {}),
          ...(input.endUserEmail ? { end_user_email: input.endUserEmail } : {}),
          ...(input.endUserDisplayName ? { end_user_display_name: input.endUserDisplayName } : {}),
        },
        integrations_config_defaults: input.integrationsConfigDefaults ?? {},
        overrides: input.overrides ?? {},
      });
      const response = await nangoRequest(config, http, "POST", "/connect/sessions", {}, body);

      if (!response.ok) {
        return response;
      }

      const data = recordValue(recordValue(response.data).data);
      const token = stringValue(data.token);
      const expiresAt = stringValue(data.expires_at);
      const connectLink = stringValue(data.connect_link);

      if (!token || !expiresAt || !connectLink) {
        return {
          ok: false,
          error: {
            code: "nango_response_invalid",
            message: "Nango connect session response did not include token, expires_at, and connect_link.",
            retryable: false,
          },
        };
      }

      return { ok: true, data: { token, expiresAt, connectLink } };
    },
    async handleCallback(input) {
      const configured = nangoConfigured(config);

      if (!configured.ok) {
        return configured;
      }

      return {
        ok: true,
        data: {
          providerId: "google",
          adapter: "nango",
          connectionId: input.connectionId,
          providerConfigKey: input.providerConfigKey,
          credentialRef: `nango:${input.providerConfigKey}:${input.connectionId}`,
          ...(input.accountId ? { accountId: input.accountId } : {}),
          ...(input.endUserId ? { endUserId: input.endUserId } : {}),
        },
      };
    },
    async listConnections(input = {}) {
      const configured = nangoConfigured(config);

      if (!configured.ok) {
        return configured;
      }

      const query: Record<string, string> = {};

      if (input.connectionId) {
        query.connectionId = input.connectionId;
      }

      if (input.endUserId) {
        query["tags[end_user_id]"] = input.endUserId;
      }

      if (input.organizationId) {
        query["tags[organization_id]"] = input.organizationId;
      }

      if (input.limit !== undefined) {
        query.limit = String(input.limit);
      }

      if (input.page !== undefined) {
        query.page = String(input.page);
      }

      for (const [key, value] of Object.entries(input.tags ?? {})) {
        query[`tags[${key}]`] = value;
      }

      const response = await nangoRequest(config, http, "GET", "/connections", query);

      if (!response.ok) {
        return response;
      }

      const connections = arrayRecords(recordValue(response.data).connections).map(nangoConnectionSummary);

      return { ok: true, data: connections };
    },
    async getCredentials(input) {
      const configured = nangoConfigured(config);

      if (!configured.ok) {
        return configured;
      }

      return getNangoCredentials(config, http, input);
    },
    async revokeConnection(input) {
      const configured = nangoConfigured(config);

      if (!configured.ok) {
        return configured;
      }

      const response = await nangoRequest(
        config,
        http,
        "DELETE",
        `/connections/${encodeURIComponent(input.connectionId)}`,
        { provider_config_key: input.providerConfigKey },
      );

      if (!response.ok) {
        return response;
      }

      return { ok: true, data: { revoked: true } };
    },
    async startSync(input) {
      const configured = nangoConfigured(config);

      if (!configured.ok) {
        return configured;
      }

      const response = await nangoRequest(config, http, "POST", "/sync/trigger", {}, {
        provider_config_key: input.providerConfigKey,
        syncs: [...input.syncNames],
        connection_id: input.connectionId,
        opts: removeUndefined({
          reset: input.reset,
          emptyCache: input.emptyCache,
        }),
      });

      if (!response.ok) {
        return response;
      }

      return { ok: true, data: { started: true } };
    },
    async getSyncStatus(input) {
      const configured = nangoConfigured(config);

      if (!configured.ok) {
        return configured;
      }

      const response = await nangoRequest(config, http, "GET", "/sync/status", {
        provider_config_key: input.providerConfigKey,
        connection_id: input.connectionId,
        syncs: input.syncNames?.length ? input.syncNames.join(",") : "*",
      });

      if (!response.ok) {
        return response;
      }

      const syncs = arrayRecords(recordValue(response.data).syncs).map((sync) => ({
        id: stringValue(sync.id),
        name: stringValue(sync.name) ?? "unknown",
        status: nangoSyncStatus(stringValue(sync.status)),
        finishedAt: stringValue(sync.finishedAt),
        nextScheduledSyncAt: stringValue(sync.nextScheduledSyncAt),
        recordCount: recordValue(sync.recordCount),
      }));

      return { ok: true, data: { syncs } };
    },
    async refreshConnection(input) {
      const configured = nangoConfigured(config);

      if (!configured.ok) {
        return configured;
      }

      return getNangoCredentials(config, http, { ...input, forceRefresh: true });
    },
  };
}

async function getNangoCredentials(
  config: GoogleConnectorRuntimeConfig,
  http: NangoHttpClient,
  input: NangoCredentialsInput,
): Promise<ConnectorAdapterResult<NangoCredentialPayload>> {
  const response = await nangoRequest(
    config,
    http,
    "GET",
    `/connections/${encodeURIComponent(input.connectionId)}`,
    {
      provider_config_key: input.providerConfigKey,
      ...(input.forceRefresh ? { force_refresh: "true" } : {}),
      ...(input.includeRefreshToken ? { refresh_token: "true" } : {}),
    },
  );

  if (!response.ok) {
    return response;
  }

  const data = recordValue(response.data);
  const connectionId = stringValue(data.connection_id);
  const providerConfigKey = stringValue(data.provider_config_key);
  const provider = stringValue(data.provider);

  if (!connectionId || !providerConfigKey || !provider) {
    return {
      ok: false,
      error: {
        code: "nango_response_invalid",
        message: "Nango credential response did not include connection_id, provider_config_key, and provider.",
        retryable: false,
      },
    };
  }

  return {
    ok: true,
    data: {
      connectionId,
      providerConfigKey,
      provider,
      credentials: recordValue(data.credentials),
      metadata: recordValue(data.metadata),
      tags: stringRecord(data.tags),
    },
  };
}

async function nangoRequest(
  config: GoogleConnectorRuntimeConfig,
  http: NangoHttpClient,
  method: NangoHttpRequest["method"],
  path: string,
  query: Record<string, string> = {},
  body?: unknown,
): Promise<ConnectorAdapterResult<unknown>> {
  const secret = config.nangoSecretKey;

  if (!secret) {
    return notConfigured(["NANGO_SECRET_KEY"]);
  }

  const url = new URL(path, ensureTrailingSlash(config.nangoBaseUrl));

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const request: NangoHttpRequest = {
    method,
    url: url.toString(),
    headers,
  };

  if (body !== undefined) {
    request.body = body;
  }

  const response = await http(request);

  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false,
      error: {
        code: "nango_request_failed",
        message: nangoErrorMessage(response.body, response.status),
        retryable: response.status >= 500 || response.status === 429,
        details: { status: response.status, body: response.body },
      },
    };
  }

  return { ok: true, data: response.body };
}

async function defaultNangoHttpClient(request: NangoHttpRequest): Promise<NangoHttpResponse> {
  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
  };

  if (request.body !== undefined) {
    init.body = JSON.stringify(request.body);
  }

  const response = await fetch(request.url, init);
  const text = await response.text();

  return {
    status: response.status,
    body: text.trim() ? JSON.parse(text) : null,
  };
}

function buildSurface(
  definition: (typeof surfaceDefinitions)[number],
  config: GoogleConnectorRuntimeConfig,
  connections: readonly ConnectorConnection[],
): ConnectorSurface {
  const scopes = googleScopeRegistry.filter((scope) => scope.surface === definition.id);
  const connected = connections.find(
    (connection) => connection.status !== "revoked" && connection.surfaces.includes(definition.id),
  );
  const status = connected ? connected.status : defaultSurfaceStatus(definition.id, config);

  return {
    ...definition,
    providerId: "google",
    status,
    sourceKinds: [...definition.sourceKinds],
    supportedNow: [...definition.supportedNow],
    notFaked: [...definition.notFaked],
    scopes,
  };
}

function defaultSurfaceStatus(surfaceId: GoogleSurfaceId, config: GoogleConnectorRuntimeConfig): ConnectorStatus {
  if (!config.enableGoogleConnector || !config.configured) {
    return "unsupported";
  }

  switch (surfaceId) {
    case "google_drive":
    case "google_docs_sheets_slides":
    case "google_calendar":
    case "google_youtube":
      return "available";
    case "google_gmail":
      return config.enableGmailConnector && config.enableRestrictedGoogleScopes
        ? "available"
        : "gated_verification_required";
    case "google_takeout":
    case "google_my_activity":
      return "manual_import_only";
    case "chrome_extension_history":
      return "extension_required";
  }
}

function providerStatus(config: GoogleConnectorRuntimeConfig, surfaces: readonly ConnectorSurface[]): ConnectorStatus {
  if (!config.enableGoogleConnector || !config.configured) {
    return "unsupported";
  }

  if (surfaces.some((surface) => surface.status === "syncing")) {
    return "syncing";
  }

  if (surfaces.some((surface) => surface.status === "connected")) {
    return "connected";
  }

  return "available";
}

function blockedScopeReason(
  scope: ConnectorScope,
  config: GoogleConnectorRuntimeConfig,
  mode: ScopeRequestMode,
): string | null {
  if (!scope.scope) {
    return `${scope.id} does not use OAuth and is ${scope.gatedStatus ?? "unsupported"}.`;
  }

  if (scope.surface === "google_gmail" && !config.enableGmailConnector) {
    return `${scope.id} is blocked until ENABLE_GMAIL_CONNECTOR is true.`;
  }

  if (scope.sensitivity === "restricted" && !config.enableRestrictedGoogleScopes) {
    return `${scope.id} is a restricted Google scope and is blocked until ENABLE_RESTRICTED_GOOGLE_SCOPES is true.`;
  }

  if (mode === "production" && !scope.productionAllowed) {
    return `${scope.id} is not production allowed without documented Google verification.`;
  }

  return null;
}

function dedupeScopes(scopes: readonly ConnectorScope[]): ConnectorScope[] {
  const seen = new Set<string>();
  const result: ConnectorScope[] = [];

  for (const scope of scopes) {
    const key = scope.scope ?? scope.id;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(scope);
  }

  return result;
}

function nangoConfigured(config: GoogleConnectorRuntimeConfig): ConnectorAdapterResult<true> {
  if (!config.enableGoogleConnector) {
    return {
      ok: false,
      error: {
        code: "connector_disabled",
        message: "Google connector is disabled. Set ENABLE_GOOGLE_CONNECTOR=true to enable it.",
        retryable: false,
      },
    };
  }

  if (config.missingConfig.length > 0) {
    return notConfigured(config.missingConfig);
  }

  return { ok: true, data: true };
}

function notConfigured(missingConfig: readonly string[]): ConnectorAdapterResult<never> {
  return {
    ok: false,
    error: {
      code: "not_configured",
      message: `Google connector is not configured. Missing: ${missingConfig.join(", ")}.`,
      retryable: false,
      details: { missingConfig: [...missingConfig] },
    },
  };
}

function nangoConnectionSummary(input: Record<string, unknown>): NangoConnectionSummary {
  const errors = Array.isArray(input.errors) ? input.errors : [];

  return {
    connectionId: stringValue(input.connection_id) ?? "",
    providerConfigKey: stringValue(input.provider_config_key) ?? "",
    provider: stringValue(input.provider) ?? "",
    createdAt: stringValue(input.created_at) ?? stringValue(input.created),
    updatedAt: stringValue(input.updated_at),
    tags: stringRecord(input.tags),
    metadata: recordValue(input.metadata),
    status: errors.length > 0 ? "failed" : "connected",
    errors,
  };
}

function nangoSyncStatus(status: string | null): ConnectorStatus {
  switch (status?.toUpperCase()) {
    case "RUNNING":
    case "STARTED":
    case "PAUSED_BY_USER":
      return "syncing";
    case "ERROR":
    case "FAILED":
    case "STOPPED":
      return "failed";
    case "SUCCESS":
    case "SUCCEEDED":
    case "DONE":
    case "COMPLETED":
      return "connected";
    default:
      return "available";
  }
}

function nangoErrorMessage(body: unknown, status: number): string {
  const record = recordValue(body);
  const nestedError = recordValue(record.error);
  const message = stringValue(nestedError.message) ?? stringValue(record.message);

  return message ?? `Nango request failed with status ${status}.`;
}

function readEnv(env: Record<string, string | undefined>, key: string): string | null {
  const value = env[key]?.trim();

  return value ? value : null;
}

function readFlag(env: Record<string, string | undefined>, key: string): boolean {
  const value = env[key]?.trim().toLowerCase();

  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function removeUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function stringRecord(value: unknown): Record<string, string> {
  const record = recordValue(value);
  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string") {
      result[key] = entry;
    }
  }

  return result;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
