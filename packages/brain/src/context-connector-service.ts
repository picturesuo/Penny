import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
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

const tokenPrefix = "v1";

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

export function buildRefreshTokenUpdate(input: ConnectorTokenInput, secret: string): EncryptedConnectorTokens {
  return encryptConnectorTokens(input, secret);
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
