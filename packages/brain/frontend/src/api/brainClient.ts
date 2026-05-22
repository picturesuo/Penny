import type {
  AutopilotSuggestion,
  AskPennyResponse,
  AutopilotTickData,
  BrainClaim,
  BrainDemoFixtureResponse,
  BrainDocumentsResponse,
  BrainHybridSearchResponse,
  CodebaseAuditResponse,
  CodebaseIngestResponse,
  CodebaseSearchResponse,
  BrainImportInput,
  BrainImportJobResponse,
  BrainImportResponse,
  BrainMemoryProfileResponse,
  BrainMemoryReviewInput,
  BrainMemoryReviewResponse,
  BrainRecentsResponse,
  BrainRetrieveInput,
  BrainRetrieveResponse,
  BrainSessionNoteResponse,
  BrainSourceDeleteResponse,
  AutopilotTickResponse,
  ChallengeBriefResponse,
  ChallengeResponseKind,
  ClaimDetailResponse,
  SessionCanvasResponse,
  BrainMove,
  CreateExportFeedbackInput,
  CreateExportFeedbackResponse,
  CreateProviderComparisonResponse,
  CreateNextInput,
  CreateNextResponse,
  ExportCodingPromptInput,
  InlineLearnOutput,
  InlineLearnResponse,
  InlineLearnSaveResponse,
  IssueChallengeResponse,
  BrainVerifyConfidenceDecisionResponse,
  BrainVerifyResponse,
  KeepBrainRecentIdeaResponse,
  LearnSessionResponse,
  LearnPageV2,
  ManualNodeSelectionResponse,
  PromptExportResponse,
  RespondToChallengeResponse,
  SaveBrainObjectResponse,
  SeedBrainResponse,
  SessionCockpitData,
  SessionCockpitResponse,
  StartNextMoveResponse,
  ThinkingModeCandidate,
  ThinkingModeStateData,
  UpdateBrainRecentStatusResponse,
} from "../types/brain";

const jsonHeaders = {
  "content-type": "application/json",
};

function requestHeaders(): HeadersInit {
  const headers: Record<string, string> = { ...jsonHeaders };
  const token = runtimeEnv("VITE_PENNY_API_TOKEN");

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  addOptionalHeader(headers, "x-user-id", "VITE_PENNY_USER_ID");
  addOptionalHeader(headers, "x-workspace-id", "VITE_PENNY_WORKSPACE_ID");
  addOptionalHeader(headers, "x-project-id", "VITE_PENNY_PROJECT_ID");
  addOptionalHeader(headers, "x-sphere-id", "VITE_PENNY_SPHERE_ID");

  return headers;
}

function addOptionalHeader(headers: Record<string, string>, headerName: string, envName: string): void {
  const value = runtimeEnv(envName);

  if (value) {
    headers[headerName] = value;
  }
}

function runtimeEnv(name: string): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const value = env?.[name];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function seedBrain(rawIdea: string): Promise<SeedBrainResponse> {
  const response = await fetch("/brain/seed", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({ rawIdea }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/seed failed with ${response.status}.`));
  }

  return payload as SeedBrainResponse;
}

export type LearnSourceMaterialInput = {
  kind: "text" | "pdf" | "slides" | "document";
  fileName?: string;
  extractedText: string;
};

export async function createLearnSession(rawIdea: string, sourceMaterial?: LearnSourceMaterialInput): Promise<LearnSessionResponse> {
  const response = await fetch("/api/learn/session", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({ rawIdea, ...(sourceMaterial ? { sourceMaterial } : {}), autopilot: { limit: 6 } }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/learn/session failed with ${response.status}.`));
  }

  return payload as LearnSessionResponse;
}

export async function createNext(input: CreateNextInput): Promise<CreateNextResponse> {
  const response = await fetch("/api/create/next", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/create/next failed with ${response.status}.`));
  }

  return payload as CreateNextResponse;
}

export async function compareCreateProviders(input: CreateNextInput): Promise<CreateProviderComparisonResponse> {
  const response = await fetch("/api/create/compare", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/create/compare failed with ${response.status}.`));
  }

  return payload as CreateProviderComparisonResponse;
}

export async function exportCodingPrompt(input: ExportCodingPromptInput): Promise<PromptExportResponse> {
  const response = await fetch("/api/create/export-coding-prompt", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/create/export-coding-prompt failed with ${response.status}.`));
  }

  return payload as PromptExportResponse;
}

export async function submitCreateExportFeedback(input: CreateExportFeedbackInput): Promise<CreateExportFeedbackResponse> {
  const response = await fetch("/api/create/export-feedback", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/create/export-feedback failed with ${response.status}.`));
  }

  return payload as CreateExportFeedbackResponse;
}

export async function fetchBrainDocuments(): Promise<BrainDocumentsResponse> {
  const response = await fetch("/api/brain/documents", {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/brain/documents failed with ${response.status}.`));
  }

  return payload as BrainDocumentsResponse;
}

export async function importBrainSource(input: BrainImportInput): Promise<BrainImportResponse> {
  const response = await fetch("/api/brain/import", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/brain/import failed with ${response.status}.`));
  }

  return payload as BrainImportResponse;
}

export async function fetchBrainDemoFixtureImport(): Promise<BrainDemoFixtureResponse> {
  const response = await fetch("/api/brain/demo-fixture/penny", {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/brain/demo-fixture/penny failed with ${response.status}.`));
  }

  return payload as BrainDemoFixtureResponse;
}

export async function fetchBrainImportJob(jobId: string): Promise<BrainImportJobResponse> {
  const response = await fetch(`/api/brain/import/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/brain/import/${jobId} failed with ${response.status}.`));
  }

  return payload as BrainImportJobResponse;
}

export async function fetchBrainMemoryProfile(): Promise<BrainMemoryProfileResponse> {
  const response = await fetch("/api/brain/memory/profile", {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/brain/memory/profile failed with ${response.status}.`));
  }

  return payload as BrainMemoryProfileResponse;
}

export async function retrieveBrainMemory(input: BrainRetrieveInput): Promise<BrainRetrieveResponse> {
  const response = await fetch("/api/brain/retrieve", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/brain/retrieve failed with ${response.status}.`));
  }

  return payload as BrainRetrieveResponse;
}

export async function reviewBrainMemory(nodeId: string, input: BrainMemoryReviewInput): Promise<BrainMemoryReviewResponse> {
  const response = await fetch(`/api/brain/memories/${encodeURIComponent(nodeId)}/review`, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/brain/memories/${nodeId}/review failed with ${response.status}.`));
  }

  return payload as BrainMemoryReviewResponse;
}

export async function deleteBrainSource(sourceId: string): Promise<BrainSourceDeleteResponse> {
  const response = await fetch(`/api/brain/sources/${encodeURIComponent(sourceId)}`, {
    method: "DELETE",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `DELETE /api/brain/sources/${sourceId} failed with ${response.status}.`));
  }

  return payload as BrainSourceDeleteResponse;
}

export interface GoogleConnectorScopeView {
  id: string;
  surface: string;
  scope: string | null;
  sensitivity: string;
  whyPennyNeedsIt: string;
  userExplanation: string;
  gated: boolean;
  gatedStatus: string | null;
  productionAllowed: boolean;
}

export interface GoogleConnectorSurfaceView {
  id: string;
  label: string;
  status: string;
  sourceKinds: string[];
  scopes: GoogleConnectorScopeView[];
  whyPennyCanUseThis: string;
  userExplanation: string;
  supportedNow: string[];
  notFaked: string[];
}

export interface GoogleConnectorProviderView {
  id: "google";
  label: "Google";
  adapter: "nango";
  status: string;
  configured: boolean;
  configurationLabel: string;
  surfaces: GoogleConnectorSurfaceView[];
  missingConfig: string[];
}

export interface GoogleConnectorProviderResponse {
  data: {
    sourceOfTruth: "google_connector_registry";
    provider: GoogleConnectorProviderView;
  };
}

export interface GoogleConnectorConnectSessionResponse {
  data: {
    token: string;
    expiresAt: string;
    connectLink: string;
    requestedSurfaceIds: string[];
    requestableSurfaceIds: string[];
    requestableScopeUrls: string[];
    warnings: string[];
  };
}

export interface GoogleGmailStatusResponse {
  data: {
    sourceOfTruth: "gmail_connector_state_and_private_brain_memory" | string;
    configured: boolean;
    message: string;
    missingConfig: string[];
    status: string;
    scopes: string[];
    scopeAuditReason: string;
    restrictedScope: boolean;
    gated: boolean;
    private: boolean;
    privacy: {
      copy: string;
      trainingUse: false;
      rawRetentionDefault: boolean;
      noHumanReview: boolean;
    };
    lastSyncAt: string | null;
    messageCount: number;
    surface: GoogleConnectorSurfaceView | null;
    connections: Array<{
      id: string;
      status: string;
      surfaces: string[];
      scopes: string[];
      lastSyncedAt: string | null;
      nextSyncAt: string | null;
      revokedAt: string | null;
      sourceCounts: Record<string, number>;
      credential: {
        connectionId: string;
        providerConfigKey: string;
        accountEmail?: string;
        accountLabel?: string;
      };
    }>;
    sources: Array<{
      id: string;
      connectionId: string;
      kind: string;
      label: string;
      sourceUri: string;
      brainSourceId?: string | null;
      privacy: {
        retrievalAccess: string;
      };
    }>;
    state?: {
      connections: unknown[];
      syncJobs: unknown[];
      sources: unknown[];
    };
  };
}

export interface GoogleGmailConnectResponse extends GoogleConnectorConnectSessionResponse {
  data: GoogleConnectorConnectSessionResponse["data"] & {
    providerConfigKey: string;
    restrictedScope: boolean;
    gated: boolean;
    private: boolean;
    scopeAuditReason: string;
  };
}

export interface GoogleGmailSyncResponse {
  data: {
    sourceOfTruth: "gmail_sync_via_nango_proxy_private_brain_memory" | string;
    messageCount: number;
    cursor: string | null;
    nextPageToken?: string | null;
    importedSources: Array<{
      messageId: string;
      brainSourceId: string;
      memoryNodeCount: number;
    }>;
    state?: {
      connections: unknown[];
      syncJobs: unknown[];
      sources: unknown[];
    };
  };
}

export interface GoogleGmailSearchInput {
  connectionId?: string;
  providerConfigKey?: string;
  text?: string;
  from?: string;
  to?: string;
  subject?: string;
  label?: string | string[];
  after?: string;
  before?: string;
  hasAttachment?: boolean;
  maxResults?: number;
  sync?: boolean;
}

export interface GoogleGmailSearchResponse {
  data: {
    sourceOfTruth: "gmail_api_search_via_nango" | string;
    query: string;
    stored: boolean;
    nextPageToken?: string | null;
    results: Array<{
      messageId: string;
      threadId: string | null;
      subject: string;
      sender: string;
      date: string | null;
      labels: string[];
      snippet: string;
      sourceRef: {
        providerId: "google";
        surface: "google_gmail";
        externalId: string;
        sourceUri: string;
        url: string | null;
      };
    }>;
  };
}

export interface GoogleGmailSemanticSearchInput {
  connectionId?: string;
  providerConfigKey?: string;
  query: string;
  limit?: number;
}

export interface GoogleGmailSemanticSearchResponse {
  data: {
    sourceOfTruth: "synced_private_gmail_brain_memory" | string;
    query: string;
    engine: string;
    contextLight: boolean;
    results: Array<{
      messageId: string;
      threadId: string | null;
      subject: string;
      sender: string;
      date: string | null;
      snippet: string;
      sourceRef: {
        id: string;
        providerId: "google";
        surface: "google_gmail";
        sourceUri: string;
        externalId: string;
        url: string | null;
      };
      memoryRef: {
        id: string;
        label: string;
        kind: "brain" | "preference" | "context";
        summary: string;
      };
      grounding: "grounded" | "inferred";
      scoreReason: string;
    }>;
  };
}

export async function fetchGoogleConnectorProvider(): Promise<GoogleConnectorProviderResponse> {
  const response = await fetch("/api/connectors/google", {
    method: "GET",
    headers: requestHeaders(),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/connectors/google failed with ${response.status}.`));
  }

  return payload as GoogleConnectorProviderResponse;
}

export async function createGoogleConnectorConnectSession(): Promise<GoogleConnectorConnectSessionResponse> {
  const response = await fetch("/api/connectors/google/connect-session", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({ workspaceBundle: true }),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/connectors/google/connect-session failed with ${response.status}.`));
  }

  return payload as GoogleConnectorConnectSessionResponse;
}

export async function fetchGoogleGmailStatus(): Promise<GoogleGmailStatusResponse> {
  const response = await fetch("/api/connectors/google/gmail/status", {
    method: "GET",
    headers: requestHeaders(),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/connectors/google/gmail/status failed with ${response.status}.`));
  }

  return payload as GoogleGmailStatusResponse;
}

export async function createGoogleGmailConnectSession(): Promise<GoogleGmailConnectResponse> {
  const response = await fetch("/api/connectors/google/gmail/connect", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({}),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/connectors/google/gmail/connect failed with ${response.status}.`));
  }

  return payload as GoogleGmailConnectResponse;
}

export async function syncGoogleGmail(input: {
  connectionId?: string;
  providerConfigKey?: string;
  maxResults?: number;
} = {}): Promise<GoogleGmailSyncResponse> {
  const response = await fetch("/api/connectors/google/gmail/sync", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/connectors/google/gmail/sync failed with ${response.status}.`));
  }

  return payload as GoogleGmailSyncResponse;
}

export async function searchGoogleGmail(input: GoogleGmailSearchInput): Promise<GoogleGmailSearchResponse> {
  const response = await fetch("/api/connectors/google/gmail/search", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/connectors/google/gmail/search failed with ${response.status}.`));
  }

  return payload as GoogleGmailSearchResponse;
}

export async function semanticSearchGoogleGmail(input: GoogleGmailSemanticSearchInput): Promise<GoogleGmailSemanticSearchResponse> {
  const response = await fetch("/api/connectors/google/gmail/semantic-search", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/connectors/google/gmail/semantic-search failed with ${response.status}.`));
  }

  return payload as GoogleGmailSemanticSearchResponse;
}

export async function revokeGoogleGmail(input: {
  connectionId?: string;
  providerConfigKey?: string;
} = {}): Promise<{ data: { revoked: true; state?: unknown } }> {
  const response = await fetch("/api/connectors/google/gmail/revoke", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/connectors/google/gmail/revoke failed with ${response.status}.`));
  }

  return payload as { data: { revoked: true; state?: unknown } };
}

export async function fetchBrainRecents(): Promise<BrainRecentsResponse> {
  const response = await fetch("/api/brain/recents", {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/brain/recents failed with ${response.status}.`));
  }

  return payload as BrainRecentsResponse;
}

export async function keepBrainRecentIdea(rawIdea: string): Promise<KeepBrainRecentIdeaResponse> {
  const response = await fetch("/api/brain/recents", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({ rawIdea }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/brain/recents failed with ${response.status}.`));
  }

  return payload as KeepBrainRecentIdeaResponse;
}

export async function updateBrainRecentStatus(
  recentId: string,
  status: "active" | "archived",
): Promise<UpdateBrainRecentStatusResponse> {
  const response = await fetch(`/api/brain/recents/${encodeURIComponent(recentId)}`, {
    method: "PATCH",
    headers: requestHeaders(),
    body: JSON.stringify({ status }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `PATCH /api/brain/recents/${recentId} failed with ${response.status}.`));
  }

  return payload as UpdateBrainRecentStatusResponse;
}

export async function fetchSessionNote(sessionId: string): Promise<BrainSessionNoteResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/notes`, {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/sessions/${sessionId}/notes failed with ${response.status}.`));
  }

  return payload as BrainSessionNoteResponse;
}

export async function fetchSessionCanvas(sessionId: string): Promise<SessionCanvasResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/canvas`, {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/sessions/${sessionId}/canvas failed with ${response.status}.`));
  }

  return normalizeSessionCanvas(payload);
}

export async function saveSessionNote(input: { sessionId: string; content: string }): Promise<BrainSessionNoteResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(input.sessionId)}/notes`, {
    method: "PUT",
    headers: requestHeaders(),
    body: JSON.stringify({ content: input.content }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `PUT /api/sessions/${input.sessionId}/notes failed with ${response.status}.`));
  }

  return payload as BrainSessionNoteResponse;
}

export async function saveBrainObject(input: {
  sessionId?: string | null;
  objectType?: string;
  title?: string;
  summary?: string | null;
  content: string;
  payload?: Record<string, unknown>;
}): Promise<SaveBrainObjectResponse> {
  const response = await fetch("/api/brain/objects/save", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/brain/objects/save failed with ${response.status}.`));
  }

  return payload as SaveBrainObjectResponse;
}

export async function fetchBrainHybridSearch(input: {
  query: string;
  sessionId?: string | null;
  claimId?: string | null;
  mode?: "learn" | "check" | "verify" | "autopilot";
  limit?: number;
}): Promise<BrainHybridSearchResponse> {
  const params = new URLSearchParams({ q: input.query });
  if (input.limit) {
    params.set("limit", String(input.limit));
  }

  const response = await fetch(`/api/brain/search?${params.toString()}`, {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (response.status === 404 || response.status === 405) {
    return unavailableHybridSearch(input.query);
  }

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/brain/search failed with ${response.status}.`));
  }

  return normalizeBrainHybridSearch(payload, input.query);
}

export async function ingestCodebase(): Promise<CodebaseIngestResponse> {
  const response = await fetch("/api/codebase/ingest", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({}),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/codebase/ingest failed with ${response.status}.`));
  }

  return payload as CodebaseIngestResponse;
}

export async function fetchCodebaseAudit(): Promise<CodebaseAuditResponse> {
  const response = await fetch("/api/codebase/audit", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({}),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/codebase/audit failed with ${response.status}.`));
  }

  return payload as CodebaseAuditResponse;
}

export async function searchCodebase(query: string): Promise<CodebaseSearchResponse> {
  const response = await fetch("/api/codebase/search", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({ query, limit: 8, includeDependencies: true }),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/codebase/search failed with ${response.status}.`));
  }

  return payload as CodebaseSearchResponse;
}

function normalizeSessionCanvas(payload: unknown): SessionCanvasResponse {
  const maybePayload =
    payload && typeof payload === "object" && "data" in payload ? (payload as { data?: unknown }).data : payload;

  if (isSessionCanvasData(maybePayload)) {
    return { data: maybePayload };
  }

  return {
    data: {
      nodes: [],
      edges: [],
    },
  };
}

function isSessionCanvasData(payload: unknown): payload is SessionCanvasResponse["data"] {
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    Array.isArray((payload as SessionCanvasResponse["data"]).nodes) &&
    Array.isArray((payload as SessionCanvasResponse["data"]).edges)
  );
}

function normalizeBrainHybridSearch(payload: unknown, query: string): BrainHybridSearchResponse {
  const maybePayload =
    payload && typeof payload === "object" && "data" in payload ? (payload as { data?: unknown }).data : payload;

  if (!maybePayload || typeof maybePayload !== "object") {
    return unavailableHybridSearch(query);
  }

  const candidate = maybePayload as Partial<BrainHybridSearchResponse["data"]> & {
    sourceOfTruth?: string;
    mode?: string;
    query?: string;
    results?: unknown[];
  };
  const results = Array.isArray(candidate.results) ? candidate.results.map(normalizeBrainSearchResult) : [];

  return {
    data: {
      available: candidate.available !== false,
      ...(typeof candidate.sourceOfTruth === "string" ? { sourceOfTruth: candidate.sourceOfTruth } : {}),
      ...(typeof candidate.strategy === "string"
        ? { strategy: candidate.strategy }
        : typeof candidate.mode === "string"
          ? { strategy: candidate.mode }
          : {}),
      results,
      meta: {
        ...(candidate.meta && typeof candidate.meta === "object" ? candidate.meta : {}),
        query: typeof candidate.query === "string" ? candidate.query : query,
        resultCount: results.length,
      },
    },
  };
}

function normalizeBrainSearchResult(value: unknown): BrainHybridSearchResponse["data"]["results"][number] {
  const result = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const id = stringValue(result.id) ?? stringValue(result.objectId) ?? "brain-search-result";
  const title = stringValue(result.title) ?? "Brain result";
  const normalized: BrainHybridSearchResponse["data"]["results"][number] = {
    id,
    title,
    summary: stringValue(result.summary) ?? stringValue(result.preview) ?? null,
    kind: stringValue(result.kind) ?? stringValue(result.objectType) ?? "brain",
  };
  const sessionId = stringValue(result.sessionId);
  const claimId = stringValue(result.claimId);

  if (sessionId) {
    normalized.sessionId = sessionId;
  }

  if (claimId) {
    normalized.claimId = claimId;
  }

  if (typeof result.score === "number") {
    normalized.score = result.score;
  }

  return normalized;
}

function unavailableHybridSearch(query: string): BrainHybridSearchResponse {
  return {
    data: {
      available: false,
      results: [],
      meta: {
        query,
        resultCount: 0,
      },
    },
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export async function fetchClaimDetail(claimId: string): Promise<ClaimDetailResponse> {
  const response = await fetch(`/brain/claims/${encodeURIComponent(claimId)}/detail`, {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /brain/claims/${claimId}/detail failed with ${response.status}.`));
  }

  return payload as ClaimDetailResponse;
}

export async function tickAutopilot(sessionId: string, resume = false): Promise<AutopilotTickResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/autopilot/tick`, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({ resume }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/sessions/${sessionId}/autopilot/tick failed with ${response.status}.`));
  }

  return {
    data: normalizeAutopilotState((payload as { data: ThinkingModeStateData }).data),
  };
}

export async function startAutopilotCandidate(sessionId: string, candidateId: string): Promise<StartNextMoveResponse> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/next-move-candidates/${encodeURIComponent(candidateId)}/start`,
    {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({}),
    },
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      errorMessage(
        payload,
        `POST /api/sessions/${sessionId}/next-move-candidates/${candidateId}/start failed with ${response.status}.`,
      ),
    );
  }

  return payload as StartNextMoveResponse;
}

export async function issueChallengeFromCandidate(
  sessionId: string,
  candidateId: string,
): Promise<IssueChallengeResponse> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/next-move-candidates/${encodeURIComponent(candidateId)}/challenge`,
    {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({}),
    },
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      errorMessage(
        payload,
        `POST /api/sessions/${sessionId}/next-move-candidates/${candidateId}/challenge failed with ${response.status}.`,
      ),
    );
  }

  return payload as IssueChallengeResponse;
}

export async function respondToChallenge(input: {
  challengeId: string;
  response: ChallengeResponseKind;
  reasoning?: string;
  revisedText?: string;
}): Promise<RespondToChallengeResponse> {
  const body =
    input.response === "revise"
      ? {
          response: input.response,
          revisedText: input.revisedText,
          ...(input.reasoning ? { reasoning: input.reasoning } : {}),
        }
      : {
          response: input.response,
          ...(input.reasoning ? { reasoning: input.reasoning } : {}),
        };
  const response = await fetch(`/api/challenges/${encodeURIComponent(input.challengeId)}/respond`, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(body),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      errorMessage(payload, `POST /api/challenges/${input.challengeId}/respond failed with ${response.status}.`),
    );
  }

  return payload as RespondToChallengeResponse;
}

export async function createChallengeBrief(sessionId: string): Promise<ChallengeBriefResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/challenge-brief`, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({}),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      errorMessage(payload, `POST /api/sessions/${sessionId}/challenge-brief failed with ${response.status}.`),
    );
  }

  return payload as ChallengeBriefResponse;
}

export async function verifyClaim(input: {
  claimId: string;
  currentClaimText: string;
  sessionId: string;
}): Promise<BrainVerifyResponse> {
  const response = await fetch("/brain/verify", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/verify failed with ${response.status}.`));
  }

  return payload as BrainVerifyResponse;
}

export async function decideVerifyConfidence(input: {
  verifyMoveId: string;
  decision: "accept" | "reject";
  reason?: string;
}): Promise<BrainVerifyConfidenceDecisionResponse> {
  const response = await fetch("/brain/verify/confidence", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/verify/confidence failed with ${response.status}.`));
  }

  return payload as BrainVerifyConfidenceDecisionResponse;
}

export async function createInlineLearn(input: {
  term: string;
  currentClaimId: string;
  sessionId: string;
  localContext: string;
  save?: boolean;
}): Promise<InlineLearnResponse> {
  const response = await fetch("/brain/learn/inline", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/learn/inline failed with ${response.status}.`));
  }

  return payload as InlineLearnResponse;
}

export async function askPenny(input: {
  question: string;
  currentStepTitle: string;
  localContext: string;
  quickAction?: "explain_visual" | "another_example" | "make_simpler" | "quiz_me" | "connect_previous";
  activeLesson?: AskPennyActiveLessonInput;
}): Promise<AskPennyResponse> {
  let response: Response;

  try {
    response = await fetch("/brain/learn/ask", {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify(input),
    });
  } catch (error) {
    const directResponse = await askPennyViaApiOrigin(input).catch(() => null);

    if (directResponse) {
      return directResponse;
    }

    return localAskPennyResponse(input, error);
  }

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/learn/ask failed with ${response.status}.`));
  }

  return payload as AskPennyResponse;
}

async function askPennyViaApiOrigin(input: {
  question: string;
  currentStepTitle: string;
  localContext: string;
  quickAction?: "explain_visual" | "another_example" | "make_simpler" | "quiz_me" | "connect_previous";
  activeLesson?: AskPennyActiveLessonInput;
}): Promise<AskPennyResponse> {
  const response = await fetch(`${askPennyApiOrigin()}/brain/learn/ask`, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/learn/ask failed with ${response.status}.`));
  }

  return payload as AskPennyResponse;
}

function askPennyApiOrigin(): string {
  const configuredOrigin = import.meta.env?.VITE_PENNY_API_ORIGIN;

  return (configuredOrigin && configuredOrigin.trim()) || "http://localhost:3000";
}

function localAskPennyResponse(
  input: {
    question: string;
    currentStepTitle: string;
    localContext: string;
    quickAction?: "explain_visual" | "another_example" | "make_simpler" | "quiz_me" | "connect_previous";
    activeLesson?: AskPennyActiveLessonInput;
  },
  error: unknown,
): AskPennyResponse {
  const answer = localAskPennyAnswer(input);
  const suffix =
    error instanceof Error && error.message && error.message !== "Failed to fetch"
      ? `\n\nThe live Ask Penny service was unreachable: ${error.message}`
      : "";

  return {
    data: {
      answer: `${answer}${suffix}`,
      provider: "heuristic",
      model: null,
    },
  };
}

function localAskPennyAnswer(input: {
  question: string;
  currentStepTitle: string;
  localContext: string;
  quickAction?: "explain_visual" | "another_example" | "make_simpler" | "quiz_me" | "connect_previous";
  activeLesson?: AskPennyActiveLessonInput;
}): string {
  const quickActionAnswer = localAskPennyQuickActionAnswer(input);

  if (quickActionAnswer) {
    return quickActionAnswer;
  }

  const question = input.question.trim();
  const compactQuestion = question.toLowerCase();
  const arithmetic = compactQuestion.match(
    /(?:^|\b)(?:what(?:'s| is)?\s+)?(-?\d+(?:\.\d+)?)\s*(?:x|\*|times|multiplied by)\s*(-?\d+(?:\.\d+)?)(?:\?|$)/,
  );

  if (/why\s+is\s+the\s+sky\s+blue\??/.test(compactQuestion)) {
    return "The sky looks blue because air molecules scatter shorter blue wavelengths of sunlight more than longer red wavelengths. That scattered blue light reaches your eyes from across the sky.";
  }

  if (arithmetic) {
    const left = Number(arithmetic[1]);
    const right = Number(arithmetic[2]);

    if (Number.isFinite(left) && Number.isFinite(right)) {
      return `${arithmetic[1]} x ${arithmetic[2]} = ${formatAskPennyNumber(left * right)}.`;
    }
  }

  const technicalAnswer = localTechnicalAskPennyAnswer(question, input.localContext);

  if (technicalAnswer) {
    return technicalAnswer;
  }

  const step = clipAskPennyText(input.currentStepTitle, 120);
  const clippedQuestion = clipAskPennyText(question, 220);
  const { goal, coreIdea } = askPennyContextParts(input.localContext);
  const focus = coreIdea ?? goal ?? clipAskPennyText(input.localContext, 220);

  return [
    `Next step: write one plain sentence for "${step}" that answers the question "${clippedQuestion}" from the lesson you are working on.`,
    `For this lesson, that sentence should stay focused on: ${focus}.`,
    "If the sentence still feels vague, add one specific example or source you could inspect next.",
  ].join("\n\n");
}

type AskPennyActiveLessonInput = {
  lessonNumber: number;
  totalLessons: number;
  title: string;
  explanation: string;
  visual: Pick<LearnPageV2["visual"], "type" | "title" | "description" | "body">;
  quickCheck: string;
  takeaway: string;
  sourceSpans: Array<{
    label: string;
    text: string;
    sourceRange?: string;
  }>;
};

function localAskPennyQuickActionAnswer(input: {
  quickAction?: "explain_visual" | "another_example" | "make_simpler" | "quiz_me" | "connect_previous";
  activeLesson?: AskPennyActiveLessonInput;
}): string | null {
  const lesson = input.activeLesson;

  if (!lesson || !input.quickAction) {
    return null;
  }

  switch (input.quickAction) {
    case "explain_visual":
      return `${lesson.visual.title}: ${lesson.visual.description}\n\nRead it as ${lesson.visual.body}.`;
    case "another_example":
      return lesson.sourceSpans[0]
        ? `Another example: apply "${lesson.title}" to ${lesson.sourceSpans[0].text}. The same takeaway should still hold: ${lesson.takeaway}`
        : `Another example: use the current idea as the case, then test whether "${lesson.takeaway}" still holds.`;
    case "make_simpler":
      return `Simpler: ${lesson.explanation.split(/[.!?]/)[0]?.trim() || lesson.title}. Remember: ${lesson.takeaway}`;
    case "quiz_me":
      return `Quick quiz: ${lesson.quickCheck}`;
    case "connect_previous":
      return `This page connects by adding "${lesson.title}" to the path. Keep the previous page as context, then carry forward: ${lesson.takeaway}`;
  }
}

function formatAskPennyNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
}

function localTechnicalAskPennyAnswer(question: string, localContext = ""): string | null {
  const compact = question.trim().toLowerCase();
  const derivativeContext = localDerivativeContext(`${compact} ${localContext.toLowerCase()}`);

  if (derivativeContext) {
    const derivativeAnswer = derivativeOfPolynomialExpressionAnswer(compact);

    if (derivativeAnswer) {
      return derivativeAnswer;
    }
  }

  if (!localTechnicalQuestion(compact)) {
    return null;
  }

  const linearDerivative = derivativeOfPolynomialExpressionAnswer(compact);

  if (linearDerivative) {
    return linearDerivative;
  }

  if (/\b(projectile|kinematic|velocity|acceleration|force|newton|physics|gravity)\b/.test(compact)) {
    return [
      "For a physics problem, first name the knowns, the unknown, and the model. If the motion has constant acceleration, the core equations are:",
      "$$v = v_0 + at$$",
      "$$x = x_0 + v_0t + \\frac{1}{2}at^2$$",
      "$$v^2 = v_0^2 + 2a(x-x_0)$$",
      "For projectile motion, split the problem into horizontal and vertical parts. Usually $a_x = 0$ and $a_y = -g$, so solve vertical motion for time, then use that time in horizontal motion. A complete answer should include the setup, substitution, units, and a quick check that the sign and size make sense.",
    ].join("\n\n");
  }

  if (/\b(derivative|differentiate|slope|rate of change)\b/.test(compact)) {
    return [
      "To answer a derivative question, identify the function, apply the rule, then interpret the result. The derivative is the instantaneous rate of change:",
      "$$f'(x)=\\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}$$",
      "For example, if $f(x)=x^2$, then $f'(x)=2x$. At $x=3$, the slope is $f'(3)=6$. A good answer should show the rule used, the simplified derivative, and what the derivative means in the original situation.",
    ].join("\n\n");
  }

  if (/\b(integral|integrate|area under|antiderivative)\b/.test(compact)) {
    return [
      "For an integration question, decide whether you need an antiderivative or an accumulated quantity. The basic form is:",
      "$$\\int_a^b f(x)\\,dx = F(b)-F(a)$$",
      "where $F'(x)=f(x)$. A complete answer should state the antiderivative, apply the bounds if present, keep units attached, and interpret the sign or area in context.",
    ].join("\n\n");
  }

  if (/\b(probability|statistics|expected value|variance|standard deviation)\b/.test(compact)) {
    return [
      "For a statistics or probability question, define the random variable, list the possible outcomes or distribution, then compute from the definition.",
      "$$E[X]=\\sum_i x_iP(X=x_i)$$",
      "$$\\mathrm{Var}(X)=E[X^2]-E[X]^2$$",
      "A complete answer should say what the variable represents, show the calculation, and translate the result back into the real-world meaning of the question.",
    ].join("\n\n");
  }

  if (/\b(solve|equation|algebra|quadratic|system)\b/.test(compact)) {
    return [
      "For an algebra question, isolate the unknown while doing the same operation to both sides. If it is quadratic, put it in standard form:",
      "$$ax^2+bx+c=0$$",
      "then use factoring when obvious or the quadratic formula:",
      "$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$",
      "A complete answer should show each transformation, check the solution in the original equation, and reject any value that violates the original constraints.",
    ].join("\n\n");
  }

  return [
    "For a technical question, give the answer as a worked chain: define the quantities, choose the governing relation, substitute, simplify, and interpret.",
    "$$\\text{knowns} \\rightarrow \\text{model} \\rightarrow \\text{calculation} \\rightarrow \\text{check}$$",
    "A comprehensive answer should include formulas in LaTeX, the units or assumptions, and a final sentence explaining what the result means.",
  ].join("\n\n");
}

function derivativeOfPolynomialExpressionAnswer(compactQuestion: string): string | null {
  const variable = derivativeVariable(compactQuestion);
  const rawExpression = derivativeExpression(compactQuestion, variable);

  if (!rawExpression) {
    return null;
  }

  const expression = parsePolynomialExpression(rawExpression, variable);

  if (!expression) {
    return null;
  }

  const derivative = expression.terms
    .map((term) => ({
      coefficient: term.coefficient * term.power,
      power: term.power - 1,
      leftSymbolicFactor: term.leftSymbolicFactor,
      rightSymbolicFactor: term.rightSymbolicFactor,
    }))
    .filter((term) => term.coefficient !== 0);
  const derivativeText = formatPolynomial(derivative, variable);

  return [
    `Treat every other letter as a constant because the derivative is with respect to $${variable}$.`,
    `For $f(${variable})=${expression.display}$, the derivative is $f'(${variable})=${derivativeText}$.`,
    `Use the power rule: $\\frac{d}{d${variable}}(a${variable}^n)=an${variable}^{n-1}$, and differentiate each term separately.`,
    `So $\\frac{d}{d${variable}}(${expression.display})=${derivativeText}$.`,
  ].join("\n\n");
}

type PolynomialTerm = {
  coefficient: number;
  power: number;
  leftSymbolicFactor: string;
  rightSymbolicFactor: string;
};

function derivativeVariable(question: string): string {
  return (
    question.match(/\bd\/d([a-z])\b/)?.[1] ??
    question.match(/\b(?:with\s+respect\s+to|respect\s+to|wrt|to|by)\s+([a-z])\b/)?.[1] ??
    "x"
  );
}

function derivativeExpression(question: string, variable: string): string | null {
  const keyword = "(?:derivative|differentiate|derive|slope|rate of change)";
  const afterKeyword = question.match(new RegExp(`\\b${keyword}\\b(?:\\s+(?:of|for))?\\s+(.+)$`))?.[1] ?? null;
  const beforeKeyword = question.match(new RegExp(`^(.+?)\\s+\\b${keyword}\\b`))?.[1] ?? null;
  const followupExpression = derivativeFollowupExpression(question);
  const rawExpression = expressionLike(afterKeyword, variable)
    ? afterKeyword
    : expressionLike(beforeKeyword, variable)
      ? beforeKeyword
      : expressionLike(followupExpression, variable)
        ? followupExpression
        : null;

  if (!rawExpression) {
    return null;
  }

  return rawExpression
    .replace(new RegExp(`\\b(?:with\\s+respect\\s+to|respect\\s+to|wrt|to|by)\\s+${variable}\\b.*$`), "")
    .replace(new RegExp(`\\bd/d${variable}\\b.*$`), "")
    .trim();
}

function derivativeFollowupExpression(question: string): string {
  return question
    .replace(/^(?:what\s+about|how\s+about|what\s+is|how\s+do\s+i\s+do|do|and|then|for)\s+/i, "")
    .replace(/\b(?:please|also|too)\b/gi, "")
    .trim();
}

function expressionLike(value: string | null, variable: string): value is string {
  if (!value || /^\s*(?:with\s+respect\s+to|respect\s+to|wrt|to|by)\s+[a-z]\b/.test(value)) {
    return false;
  }

  return new RegExp(`[0-9${variable}]`).test(value);
}

function parsePolynomialExpression(rawExpression: string, variable: string): { display: string; terms: PolynomialTerm[] } | null {
  const cleaned = rawExpression
    .replace(/[?.!,;:]+$/g, "")
    .replace(/\s+/g, "")
    .replace(/\*\*/g, "^")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .toLowerCase();
  const expression = cleaned.match(/^(.+?)(?:withrespectto|wrt|inrespectto|respectto|d\/d|$)/)?.[1];

  if (!expression || !expression.includes(variable)) {
    return null;
  }

  const terms = expression.match(/[+-]?[^+-]+/g) ?? [];
  const parsedTerms = terms.map((term) => parsePolynomialTerm(term, variable));

  if (!parsedTerms.length || parsedTerms.some((term) => !term)) {
    return null;
  }

  return {
    display: formatPolynomial(parsedTerms as PolynomialTerm[], variable),
    terms: parsedTerms as PolynomialTerm[],
  };
}

function parsePolynomialTerm(term: string, variable: string): PolynomialTerm | null {
  const escapedVariable = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = term.match(new RegExp(`^([+-]?)(?:(\\d+(?:\\.\\d+)?|\\.\\d+)\\*?)?([a-z])?${escapedVariable}(?:\\^(-?\\d+))?(?:\\*?([a-z]))?$`));

  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const coefficient = match[2] ? Number(match[2]) : 1;
  const power = match[4] ? Number(match[4]) : 1;

  if (!Number.isFinite(coefficient) || !Number.isInteger(power) || power < 1) {
    return null;
  }

  return {
    coefficient: sign * coefficient,
    power,
    leftSymbolicFactor: match[3] && match[3] !== variable ? match[3] : "",
    rightSymbolicFactor: match[5] && match[5] !== variable ? match[5] : "",
  };
}

function formatPolynomial(terms: PolynomialTerm[], variableName = "x"): string {
  if (!terms.length) {
    return "0";
  }

  return terms
    .map((term, index) => {
      const sign = term.coefficient < 0 ? "-" : index === 0 ? "" : "+";
      const absoluteCoefficient = Math.abs(term.coefficient);
      const numericCoefficient = term.power === 0 || absoluteCoefficient !== 1 ? formatAskPennyNumber(absoluteCoefficient) : "";
      const coefficient = `${numericCoefficient}${term.leftSymbolicFactor}`;
      const variable = term.power === 0 ? "" : term.power === 1 ? variableName : `${variableName}^${term.power}`;

      return `${sign}${coefficient}${variable}${term.rightSymbolicFactor}`;
    })
    .join("");
}

function localTechnicalQuestion(compactQuestion: string): boolean {
  return /\b(math|physics|formula|equation|solve|derive|calculate|compute|derivative|integral|algebra|quadratic|probability|statistics|kinematic|velocity|acceleration|force|newton|energy|momentum|latex)\b/.test(
    compactQuestion,
  );
}

function localDerivativeContext(compactText: string): boolean {
  return /\b(derivative|differentiate|differentiation|slope|rate of change)\b/.test(compactText);
}

function clipAskPennyText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1).trimEnd()}...`;
}

function askPennyContextParts(localContext: string): { goal: string | null; coreIdea: string | null } {
  const goal = localContext.match(/Goal:\s*(.*?)(?:\s+Current step:|\s+Core idea:|$)/i)?.[1];
  const coreIdea = localContext.match(/Core idea:\s*(.*?)(?:\s+Keep the end state tied to:|$)/i)?.[1];

  return {
    goal: goal ? clipAskPennyText(goal, 180) : null,
    coreIdea: coreIdea ? clipAskPennyText(coreIdea, 220) : null,
  };
}

export async function saveInlineLearn(input: InlineLearnOutput & {
  currentClaimId: string;
  sessionId: string;
}): Promise<InlineLearnSaveResponse> {
  const response = await fetch("/brain/learn/inline/save", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/learn/inline/save failed with ${response.status}.`));
  }

  return payload as InlineLearnSaveResponse;
}

export async function selectAutopilotNode(input: {
  sessionId: string;
  claimId: string;
  previousSuggestionMoveId?: string | null;
}): Promise<ManualNodeSelectionResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(input.sessionId)}/focus/manual`, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({
      claimId: input.claimId,
      ...(input.previousSuggestionMoveId ? { previousSuggestionMoveId: input.previousSuggestionMoveId } : {}),
    }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/sessions/${input.sessionId}/focus/manual failed with ${response.status}.`));
  }

  return payload as ManualNodeSelectionResponse;
}

export async function fetchSessionCockpit(sessionId: string): Promise<SessionCockpitResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/cockpit`, {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/sessions/${sessionId}/cockpit failed with ${response.status}.`));
  }

  return {
    data: normalizeCockpitData((payload as { data: RawSessionCockpitData }).data),
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }

  return fallback;
}

interface RawSessionCockpitData {
  session: SessionCockpitData["session"];
  ideaMap: {
    claims?: SessionCockpitData["ideaMap"]["claims"];
    edges?: SessionCockpitData["ideaMap"]["edges"];
    keyInsight?: string | null;
  };
  graphPath?: SessionCockpitData["graphPath"];
  workStructure?: SessionCockpitData["workStructure"];
  moves?: BrainMove[];
  autopilot: ThinkingModeStateData;
  activeChallenge?: {
    id: string;
    status?: string;
    response?: ChallengeResponseKind | null;
    targetClaimId?: string;
    critique?: string;
    failureType?: string;
    strength?: string;
    whatWouldResolveIt?: string;
    targetClaim?: BrainClaim | null;
    critiqueClaim?: BrainClaim | null;
  } | null;
  latestArtifact?: SessionCockpitData["latestArtifact"];
}

function normalizeCockpitData(data: RawSessionCockpitData): SessionCockpitData {
  const activeChallenge = data.activeChallenge ? normalizeActiveChallenge(data.activeChallenge) : null;

  return {
    session: data.session,
    ideaMap: {
      claims: data.ideaMap.claims ?? [],
      edges: data.ideaMap.edges ?? [],
      ...(data.ideaMap.keyInsight !== undefined ? { keyInsight: data.ideaMap.keyInsight } : {}),
    },
    graphPath: data.graphPath ?? emptyGraphPath(),
    workStructure: data.workStructure ?? null,
    moves: (data.moves ?? []).map(normalizeMove),
    autopilot: normalizeAutopilotState(data.autopilot),
    activeChallenge,
    latestArtifact: data.latestArtifact ?? null,
  };
}

function emptyGraphPath(): SessionCockpitData["graphPath"] {
  return {
    layout: "top_down",
    generatedFrom: "claims_edges_moves",
    focusClaimId: null,
    nodes: [],
    edges: [],
    meta: {
      nodeCount: 0,
      edgeCount: 0,
      maxDepth: 0,
    },
  };
}

function normalizeAutopilotState(data: ThinkingModeStateData): AutopilotTickData {
  const candidates = (data.candidates ?? []).map(candidateToSuggestion);
  const selectedCandidate = data.selectedCandidate ? candidateToSuggestion(data.selectedCandidate) : null;

  return {
    status: data.status,
    sessionId: data.sessionId,
    suggestion: selectedCandidate,
    candidates,
    selectedCandidate,
    focusState: data.focusState,
    move: data.move
      ? {
          id: data.move.id,
          kind: data.move.kind,
          summary: data.move.summary,
        }
      : null,
    ...(data.focusState.paused
      ? {
          pause: {
            paused: true,
            manualMoveId: data.focusState.manualMoveId,
            focusedClaimId: data.focusState.focusedClaimId,
            pausedAt: data.focusState.updatedAt,
          },
        }
      : {}),
  };
}

function candidateToSuggestion(candidate: ThinkingModeCandidate): AutopilotSuggestion {
  const exitCriteria = candidate.exitCriteria ?? {
    label: "Complete the selected thinking action.",
    acceptedMoveKinds: [],
  };

  return {
    id: candidate.id,
    candidateId: candidate.candidateId,
    action: candidate.action,
    mode: candidate.mode,
    label: titleize(candidate.action),
    primaryActionLabel: primaryActionLabel(candidate.action),
    targetClaimId: candidate.targetClaimId,
    targetEdgeId: candidate.targetEdgeId,
    score: candidate.score,
    why: candidate.reason,
    ...(candidate.reasonCodes ? { reasonCodes: candidate.reasonCodes } : {}),
    exitCriteria,
  };
}

function normalizeActiveChallenge(
  challenge: NonNullable<RawSessionCockpitData["activeChallenge"]>,
): NonNullable<SessionCockpitData["activeChallenge"]> {
  return {
    id: challenge.id,
    responseOptions: ["Defend", "Revise", "Absorb"],
    targetClaim: challenge.targetClaim ?? null,
    critiqueClaim: challenge.critiqueClaim ?? null,
    ...(challenge.targetClaimId !== undefined ? { targetClaimId: challenge.targetClaimId } : {}),
    ...(challenge.targetClaim?.text !== undefined ? { weakestPart: challenge.targetClaim.text } : {}),
    ...(challenge.failureType !== undefined ? { failureType: challenge.failureType } : {}),
    ...(challenge.strength !== undefined ? { strength: challenge.strength } : {}),
    ...(challenge.status !== undefined ? { status: challenge.status } : {}),
    ...(challenge.response !== undefined ? { response: challenge.response } : {}),
    ...(challenge.whatWouldResolveIt !== undefined ? { whatWouldResolveIt: challenge.whatWouldResolveIt } : {}),
    ...(challenge.critique !== undefined ? { challenge: challenge.critique, critique: challenge.critique } : {}),
  };
}

function normalizeMove(move: BrainMove): BrainMove {
  return {
    ...move,
    type: move.type ?? move.kind ?? "move",
  };
}

function titleize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function primaryActionLabel(action: string): string {
  switch (action) {
    case "challenge":
      return "Start challenge";
    case "verify":
      return "Start verification";
    case "learn":
      return "Start learn";
    case "clarify":
      return "Clarify claim";
    case "resume_open_challenge":
      return "Resume challenge";
    default:
      return `Start ${titleize(action).toLowerCase()}`;
  }
}
