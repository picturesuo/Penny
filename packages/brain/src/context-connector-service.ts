import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  planConnectorScope,
  type ConnectorScopePlan,
  type ConnectorScopeSelection,
  type ContextProvider,
  type EphemeralProcessInput,
} from "./context-layer.ts";

export type ConnectorTokenInput = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | Date | null;
};

export type EncryptedConnectorTokens = {
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
};

export type ConnectorSyncItem = {
  id: string;
  sourceUri?: string;
  label?: string;
  snippet?: string;
  body?: string;
  metadata?: Record<string, unknown>;
  start?: string;
  end?: string;
  attendees?: readonly string[];
};

export type ConnectorSyncPlanInput = {
  provider: ContextProvider;
  selection: ConnectorScopeSelection;
  items: readonly ConnectorSyncItem[];
  fetchedAt?: string;
  autoApprove?: boolean;
  rawRetention?: boolean;
};

export type ConnectorSyncPlan = {
  connectorPlan: ConnectorScopePlan;
  syncJob: {
    provider: ContextProvider;
    status: "queued";
    minimumScope: Record<string, unknown>;
    rateLimitKey: string;
  };
  imports: EphemeralProcessInput[];
  warnings: string[];
};

export type ConnectorFetchHttpRequest = {
  url: string;
  method: "GET";
  headers: Record<string, string>;
};

export type ConnectorFetchHttpResponse = {
  status: number;
  body: unknown;
};

export type ConnectorFetchHttpClient = (request: ConnectorFetchHttpRequest) => Promise<ConnectorFetchHttpResponse>;

export type ConnectorFetchInput = {
  provider: Extract<ContextProvider, "gmail" | "calendar">;
  selection: ConnectorScopeSelection;
  accessToken: string;
  http: ConnectorFetchHttpClient;
  maxItems?: number;
  fetchedAt?: string;
};

export type ConnectorFetchResult = {
  connectorPlan: ConnectorScopePlan;
  items: ConnectorSyncItem[];
  fetchedAt: string;
  warnings: string[];
};

export type ConnectorOAuthProviderConfig = {
  provider: Extract<ContextProvider, "gmail" | "calendar">;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  defaultScopes: readonly string[];
  restrictedScopeWarning?: string;
};

export type ConnectorOAuthStartInput = {
  provider: Extract<ContextProvider, "gmail" | "calendar">;
  clientId: string;
  redirectUri: string;
  stateSecret: string;
  selection: ConnectorScopeSelection;
  scopes?: readonly string[];
  now?: string;
  nonce?: string;
};

export type ConnectorOAuthStart = {
  provider: Extract<ContextProvider, "gmail" | "calendar">;
  authorizationUrl: string;
  state: string;
  connectorPlan: ConnectorScopePlan;
  warnings: string[];
};

export type ConnectorOAuthCallbackInput = {
  provider: Extract<ContextProvider, "gmail" | "calendar">;
  code: string;
  state: string;
  stateSecret: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  exchange: ConnectorOAuthTokenExchange;
};

export type ConnectorOAuthRefreshInput = {
  provider: Extract<ContextProvider, "gmail" | "calendar">;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  exchange: ConnectorOAuthRefreshExchange;
};

export type ConnectorOAuthCallback = {
  provider: Extract<ContextProvider, "gmail" | "calendar">;
  connectorPlan: ConnectorScopePlan;
  token: ConnectorTokenInput;
};

export type ConnectorOAuthTokenExchange = (request: {
  tokenEndpoint: string;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) => Promise<{
  accessToken: string;
  refreshToken?: string | null;
  expiresInSeconds?: number | null;
}>;

export type ConnectorOAuthRefreshExchange = (request: {
  tokenEndpoint: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) => Promise<{
  accessToken: string;
  refreshToken?: string | null;
  expiresInSeconds?: number | null;
}>;

const tokenPrefix = "v1";
const oauthStateVersion = "ctx1";
const googleAuthorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenEndpoint = "https://oauth2.googleapis.com/token";
const oauthConfigs: Record<Extract<ContextProvider, "gmail" | "calendar">, ConnectorOAuthProviderConfig> = {
  gmail: {
    provider: "gmail",
    authorizationEndpoint: googleAuthorizationEndpoint,
    tokenEndpoint: googleTokenEndpoint,
    defaultScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    restrictedScopeWarning: "Gmail readonly is a restricted scope and requires Google verification before public launch.",
  },
  calendar: {
    provider: "calendar",
    authorizationEndpoint: googleAuthorizationEndpoint,
    tokenEndpoint: googleTokenEndpoint,
    defaultScopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  },
};

export function encryptConnectorTokens(input: ConnectorTokenInput, secret: string): EncryptedConnectorTokens {
  if (!input.accessToken.trim()) {
    throw new Error("Connector access token is required.");
  }

  return {
    encryptedAccessToken: encryptToken(input.accessToken, secret),
    encryptedRefreshToken: input.refreshToken?.trim() ? encryptToken(input.refreshToken, secret) : null,
    tokenExpiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  };
}

export function decryptConnectorToken(ciphertext: string, secret: string): string {
  const [version, ivValue, tagValue, encryptedValue] = ciphertext.split(".");

  if (version !== tokenPrefix || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Unsupported connector token ciphertext.");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(ivValue, "base64url"));

  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function buildConnectorSyncPlan(input: ConnectorSyncPlanInput): ConnectorSyncPlan {
  const selection: ConnectorScopeSelection = {
    ...input.selection,
    provider: input.provider,
    rawRetention: input.rawRetention === true,
  };
  const connectorPlan = planConnectorScope(selection);

  if (!connectorPlan.allowed) {
    return {
      connectorPlan,
      syncJob: {
        provider: input.provider,
        status: "queued",
        minimumScope: connectorPlan.minimumScope,
        rateLimitKey: rateLimitKey(input.provider, connectorPlan.minimumScope),
      },
      imports: [],
      warnings: connectorPlan.warnings,
    };
  }

  const imports =
    input.provider === "gmail"
      ? gmailImports(input, connectorPlan)
      : input.provider === "calendar"
        ? calendarImports(input, connectorPlan)
        : genericImports(input, connectorPlan);

  return {
    connectorPlan,
    syncJob: {
      provider: input.provider,
      status: "queued",
      minimumScope: connectorPlan.minimumScope,
      rateLimitKey: rateLimitKey(input.provider, connectorPlan.minimumScope),
    },
    imports,
    warnings: connectorPlan.warnings,
  };
}

export async function fetchConnectorSyncItems(input: ConnectorFetchInput): Promise<ConnectorFetchResult> {
  if (!input.accessToken.trim()) {
    throw new Error("Connector fetch requires an access token.");
  }

  const connectorPlan = planConnectorScope({ ...input.selection, provider: input.provider });

  if (!connectorPlan.allowed) {
    throw new Error(connectorPlan.warnings[0] ?? "Selected connector scope is not allowed.");
  }

  const limit = Math.min(Math.max(input.maxItems ?? 25, 1), 100);
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const items =
    input.provider === "gmail"
      ? await fetchGmailMetadataFirst({ ...input, maxItems: limit })
      : await fetchCalendarReadOnly({ ...input, maxItems: limit });

  return {
    connectorPlan,
    items,
    fetchedAt,
    warnings: connectorPlan.warnings,
  };
}

export function buildRefreshTokenUpdate(input: ConnectorTokenInput, secret: string): EncryptedConnectorTokens {
  return encryptConnectorTokens(input, secret);
}

export function buildConnectorOAuthStart(input: ConnectorOAuthStartInput): ConnectorOAuthStart {
  if (!input.clientId.trim()) {
    throw new Error("OAuth client id is required.");
  }

  if (!input.redirectUri.trim()) {
    throw new Error("OAuth redirect URI is required.");
  }

  const connectorPlan = planConnectorScope({ ...input.selection, provider: input.provider });

  if (!connectorPlan.allowed) {
    throw new Error(connectorPlan.warnings[0] ?? "Selected connector scope is not allowed.");
  }

  const config = oauthConfigs[input.provider];
  const scopes = [...new Set([...(input.scopes ?? config.defaultScopes)])];
  const state = signOAuthState(
    {
      provider: input.provider,
      selection: { ...input.selection, provider: input.provider },
      nonce: input.nonce ?? randomBytes(16).toString("base64url"),
      issuedAt: input.now ?? new Date().toISOString(),
    },
    input.stateSecret,
  );
  const authorizationUrl = new URL(config.authorizationEndpoint);

  authorizationUrl.searchParams.set("client_id", input.clientId);
  authorizationUrl.searchParams.set("redirect_uri", input.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", scopes.join(" "));
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("state", state);

  return {
    provider: input.provider,
    authorizationUrl: authorizationUrl.toString(),
    state,
    connectorPlan,
    warnings: [config.restrictedScopeWarning].filter((warning): warning is string => Boolean(warning)),
  };
}

export async function exchangeConnectorOAuthCallback(
  input: ConnectorOAuthCallbackInput,
): Promise<ConnectorOAuthCallback> {
  if (!input.code.trim()) {
    throw new Error("OAuth callback code is required.");
  }

  const state = verifyOAuthState(input.state, input.stateSecret);

  if (state.provider !== input.provider) {
    throw new Error("OAuth callback provider does not match state.");
  }

  const connectorPlan = planConnectorScope(state.selection);

  if (!connectorPlan.allowed) {
    throw new Error(connectorPlan.warnings[0] ?? "Selected connector scope is not allowed.");
  }

  const config = oauthConfigs[input.provider];
  const tokenResponse = await input.exchange({
    tokenEndpoint: config.tokenEndpoint,
    code: input.code,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    redirectUri: input.redirectUri,
  });

  if (!tokenResponse.accessToken.trim()) {
    throw new Error("OAuth token exchange did not return an access token.");
  }

  return {
    provider: input.provider,
    connectorPlan,
    token: {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken ?? null,
      expiresAt:
        tokenResponse.expiresInSeconds && tokenResponse.expiresInSeconds > 0
          ? new Date(Date.now() + tokenResponse.expiresInSeconds * 1000)
          : null,
    },
  };
}

export async function refreshConnectorOAuthToken(input: ConnectorOAuthRefreshInput): Promise<ConnectorTokenInput> {
  if (!input.refreshToken.trim()) {
    throw new Error("OAuth refresh token is required.");
  }

  if (!input.clientId.trim() || !input.clientSecret.trim()) {
    throw new Error("OAuth refresh requires client credentials.");
  }

  const config = oauthConfigs[input.provider];
  const tokenResponse = await input.exchange({
    tokenEndpoint: config.tokenEndpoint,
    refreshToken: input.refreshToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
  });

  if (!tokenResponse.accessToken.trim()) {
    throw new Error("OAuth refresh did not return an access token.");
  }

  return {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken?.trim() ? tokenResponse.refreshToken : input.refreshToken,
    expiresAt:
      tokenResponse.expiresInSeconds && tokenResponse.expiresInSeconds > 0
        ? new Date(Date.now() + tokenResponse.expiresInSeconds * 1000)
        : null,
  };
}

function gmailImports(input: ConnectorSyncPlanInput, connectorPlan: ConnectorScopePlan): EphemeralProcessInput[] {
  return input.items.map((item) => {
    const metadata = item.metadata ?? {};
    const from = stringValue(metadata.from);
    const subject = stringValue(metadata.subject);
    const date = stringValue(metadata.date);
    const labels = arrayValue(metadata.labels).join(", ");
    const threadId = stringValue(metadata.threadId) || item.id;
    const bodyOmitted = Boolean(item.body);
    const text = [
      `Gmail selective metadata for thread ${threadId}.`,
      from ? `Person related: message with ${from}.` : null,
      subject ? `Project related subject: ${subject}.` : null,
      date ? `Last seen in Gmail on ${date}.` : null,
      labels ? `Gmail labels: ${labels}.` : null,
      item.snippet ? `Claim or context snippet: ${item.snippet}` : null,
      bodyOmitted ? "Full Gmail body was intentionally omitted; metadata and snippet were used first." : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join("\n");

    return compactImport({
      provider: "gmail",
      sourceUri: item.sourceUri ?? `gmail:thread:${threadId}`,
      label: item.label ?? `Gmail thread ${threadId}`,
      text,
      fetchedAt: input.fetchedAt,
      autoApprove: input.autoApprove,
      rawRetention: connectorPlan.minimumScope.rawRetention === true,
    });
  });
}

async function fetchGmailMetadataFirst(input: ConnectorFetchInput & { maxItems: number }): Promise<ConnectorSyncItem[]> {
  const labelIds = [...(input.selection.labels ?? [])];
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");

  listUrl.searchParams.set("maxResults", String(input.maxItems));

  const query = gmailSearchQuery(input.selection);

  if (query) {
    listUrl.searchParams.set("q", query);
  }

  for (const labelId of labelIds) {
    listUrl.searchParams.append("labelIds", labelId);
  }

  const listResponse = await requestJson(input.http, input.accessToken, listUrl.toString(), "Gmail message list");
  const messages = arrayRecords(recordValue(listResponse).messages).slice(0, input.maxItems);
  const items: ConnectorSyncItem[] = [];

  for (const message of messages) {
    const messageId = stringValue(message.id);

    if (!messageId) {
      continue;
    }

    const messageUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`);

    messageUrl.searchParams.set("format", "metadata");
    for (const header of ["From", "Subject", "Date"]) {
      messageUrl.searchParams.append("metadataHeaders", header);
    }

    const messageResponse = recordValue(await requestJson(input.http, input.accessToken, messageUrl.toString(), "Gmail metadata"));
    const threadId = stringValue(messageResponse.threadId) ?? stringValue(message.threadId) ?? messageId;
    const headers = gmailHeaderMap(messageResponse.payload);
    const subject = headers.get("subject") ?? null;
    const from = headers.get("from") ?? null;
    const date = headers.get("date") ?? null;
    const item: ConnectorSyncItem = {
      id: threadId,
      sourceUri: `gmail:thread:${threadId}:message:${messageId}`,
      label: subject ? `Gmail: ${subject}` : `Gmail thread ${threadId}`,
      metadata: {
        messageId,
        threadId,
        from,
        subject,
        date,
        labels: labelIds,
      },
    };
    const snippet = stringValue(messageResponse.snippet);

    if (snippet) {
      item.snippet = snippet;
    }

    items.push(item);
  }

  return items;
}

function calendarImports(input: ConnectorSyncPlanInput, connectorPlan: ConnectorScopePlan): EphemeralProcessInput[] {
  return input.items.map((item) => {
    const metadata = item.metadata ?? {};
    const summary = item.label ?? stringValue(metadata.summary) ?? item.id;
    const attendees = item.attendees?.length ? item.attendees.join(", ") : arrayValue(metadata.attendees).join(", ");
    const text = [
      `Calendar project cadence event: ${summary}.`,
      item.start ? `Calendar starts at ${item.start}.` : null,
      item.end ? `Calendar deadline or due window ends at ${item.end}.` : null,
      attendees ? `Meeting graph with recurring collaborators: ${attendees}.` : null,
      item.snippet ? `Calendar context: ${item.snippet}` : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join("\n");

    return compactImport({
      provider: "calendar",
      sourceUri: item.sourceUri ?? `calendar:event:${item.id}`,
      label: summary,
      text,
      fetchedAt: input.fetchedAt,
      autoApprove: input.autoApprove,
      rawRetention: connectorPlan.minimumScope.rawRetention === true,
    });
  });
}

async function fetchCalendarReadOnly(input: ConnectorFetchInput & { maxItems: number }): Promise<ConnectorSyncItem[]> {
  const calendarIds = input.selection.calendarIds?.length ? [...input.selection.calendarIds] : ["primary"];
  const items: ConnectorSyncItem[] = [];

  for (const calendarId of calendarIds) {
    if (items.length >= input.maxItems) {
      break;
    }

    const eventsUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );

    eventsUrl.searchParams.set("singleEvents", "true");
    eventsUrl.searchParams.set("orderBy", "startTime");
    eventsUrl.searchParams.set("maxResults", String(input.maxItems - items.length));

    if (input.selection.dateRange?.from) {
      eventsUrl.searchParams.set("timeMin", input.selection.dateRange.from);
    }

    if (input.selection.dateRange?.to) {
      eventsUrl.searchParams.set("timeMax", input.selection.dateRange.to);
    }

    const eventsResponse = recordValue(await requestJson(input.http, input.accessToken, eventsUrl.toString(), "Calendar event list"));
    const eventRows = arrayRecords(eventsResponse.items);

    for (const eventRow of eventRows) {
      if (items.length >= input.maxItems) {
        break;
      }

      const eventId = stringValue(eventRow.id);

      if (!eventId) {
        continue;
      }

      const summary = stringValue(eventRow.summary) ?? `Calendar event ${eventId}`;
      const start = dateTimeValue(eventRow.start);
      const end = dateTimeValue(eventRow.end);
      const item: ConnectorSyncItem = {
        id: eventId,
        sourceUri: `calendar:event:${calendarId}:${eventId}`,
        label: summary,
        attendees: arrayRecords(eventRow.attendees)
          .map((attendee) => stringValue(attendee.email))
          .filter((email): email is string => Boolean(email)),
        metadata: {
          calendarId,
          summary,
          recurringEventId: stringValue(eventRow.recurringEventId),
        },
      };
      const snippet = stringValue(eventRow.description);

      if (snippet) {
        item.snippet = snippet;
      }

      if (start) {
        item.start = start;
      }

      if (end) {
        item.end = end;
      }

      items.push(item);
    }
  }

  return items;
}

function genericImports(input: ConnectorSyncPlanInput, connectorPlan: ConnectorScopePlan): EphemeralProcessInput[] {
  return input.items.map((item) =>
    compactImport({
      provider: input.provider,
      sourceUri: item.sourceUri ?? `${input.provider}:${item.id}`,
      label: item.label ?? item.id,
      text: [item.snippet, item.body].filter(Boolean).join("\n"),
      fetchedAt: input.fetchedAt,
      autoApprove: input.autoApprove,
      rawRetention: connectorPlan.minimumScope.rawRetention === true,
    }),
  );
}

async function requestJson(
  http: ConnectorFetchHttpClient,
  accessToken: string,
  url: string,
  label: string,
): Promise<unknown> {
  const response = await http({
    url,
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label} failed with status ${response.status}.`);
  }

  return response.body;
}

function gmailSearchQuery(selection: ConnectorScopeSelection): string {
  const parts = [
    ...(selection.searchQueries ?? []),
    ...(selection.senders ?? []).map((sender) => `from:${sender}`),
    selection.dateRange?.from ? `after:${selection.dateRange.from}` : null,
    selection.dateRange?.to ? `before:${selection.dateRange.to}` : null,
  ];

  return parts.filter((part): part is string => Boolean(part?.trim())).join(" ");
}

function gmailHeaderMap(payload: unknown): Map<string, string> {
  const headers = arrayRecords(recordValue(payload).headers);
  const map = new Map<string, string>();

  for (const header of headers) {
    const name = stringValue(header.name);
    const value = stringValue(header.value);

    if (name && value) {
      map.set(name.toLowerCase(), value);
    }
  }

  return map;
}

function dateTimeValue(value: unknown): string | null {
  const record = recordValue(value);

  return stringValue(record.dateTime) ?? stringValue(record.date);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(recordValue).filter((entry) => Object.keys(entry).length > 0) : [];
}

function compactImport(input: {
  provider: ContextProvider;
  sourceUri: string;
  label: string;
  text: string;
  fetchedAt?: string | undefined;
  autoApprove?: boolean | undefined;
  rawRetention?: boolean | undefined;
}): EphemeralProcessInput {
  const output: EphemeralProcessInput = {
    provider: input.provider,
    sourceUri: input.sourceUri,
    label: input.label,
    text: input.text,
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

function encryptToken(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [tokenPrefix, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

function signOAuthState(
  state: {
    provider: Extract<ContextProvider, "gmail" | "calendar">;
    selection: ConnectorScopeSelection;
    nonce: string;
    issuedAt: string;
  },
  secret: string,
): string {
  const payload = Buffer.from(stableStringify(state), "utf8").toString("base64url");
  const signature = createHmac("sha256", oauthStateKey(secret)).update(payload).digest("base64url");

  return [oauthStateVersion, payload, signature].join(".");
}

function verifyOAuthState(state: string, secret: string): {
  provider: Extract<ContextProvider, "gmail" | "calendar">;
  selection: ConnectorScopeSelection;
  nonce: string;
  issuedAt: string;
} {
  const [version, payload, signature] = state.split(".");

  if (version !== oauthStateVersion || !payload || !signature) {
    throw new Error("Unsupported OAuth state.");
  }

  const expected = createHmac("sha256", oauthStateKey(secret)).update(payload).digest("base64url");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error("OAuth state signature is invalid.");
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    provider?: unknown;
    selection?: unknown;
    nonce?: unknown;
    issuedAt?: unknown;
  };

  if ((parsed.provider !== "gmail" && parsed.provider !== "calendar") || !parsed.selection) {
    throw new Error("OAuth state payload is invalid.");
  }

  return {
    provider: parsed.provider,
    selection: parsed.selection as ConnectorScopeSelection,
    nonce: typeof parsed.nonce === "string" ? parsed.nonce : "",
    issuedAt: typeof parsed.issuedAt === "string" ? parsed.issuedAt : "",
  };
}

function oauthStateKey(secret: string): Buffer {
  if (!secret.trim()) {
    throw new Error("OAuth state secret is required.");
  }

  return createHash("sha256").update(`oauth:${secret}`).digest();
}

function encryptionKey(secret: string): Buffer {
  if (!secret.trim()) {
    throw new Error("Connector token encryption secret is required.");
  }

  return createHash("sha256").update(secret).digest();
}

function rateLimitKey(provider: ContextProvider, minimumScope: Record<string, unknown>): string {
  return `${provider}:${createHash("sha256").update(stableStringify(minimumScope)).digest("hex").slice(0, 24)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}
