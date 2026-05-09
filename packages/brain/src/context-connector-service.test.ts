import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConnectorSyncPlan,
  buildConnectorOAuthStart,
  buildRefreshTokenUpdate,
  decryptConnectorToken,
  encryptConnectorTokens,
  exchangeConnectorOAuthCallback,
  fetchConnectorSyncItems,
  refreshConnectorOAuthToken,
  type ConnectorFetchHttpRequest,
} from "./context-connector-service.ts";

test("connector token encryption stores opaque AES-GCM ciphertext", () => {
  const encrypted = encryptConnectorTokens(
    {
      accessToken: "access-token-value",
      refreshToken: "refresh-token-value",
      expiresAt: "2026-05-09T12:00:00.000Z",
    },
    "test-secret",
  );

  assert.equal(encrypted.encryptedAccessToken.includes("access-token-value"), false);
  assert.equal(encrypted.encryptedRefreshToken?.includes("refresh-token-value"), false);
  assert.equal(decryptConnectorToken(encrypted.encryptedAccessToken, "test-secret"), "access-token-value");
  assert.equal(
    encrypted.encryptedRefreshToken ? decryptConnectorToken(encrypted.encryptedRefreshToken, "test-secret") : null,
    "refresh-token-value",
  );
  assert.equal(encrypted.tokenExpiresAt?.toISOString(), "2026-05-09T12:00:00.000Z");
});

test("buildRefreshTokenUpdate reuses token encryption for OAuth refreshes", () => {
  const update = buildRefreshTokenUpdate(
    {
      accessToken: "new-access-token",
      expiresAt: "2026-05-09T13:00:00.000Z",
    },
    "refresh-secret",
  );

  assert.equal(decryptConnectorToken(update.encryptedAccessToken, "refresh-secret"), "new-access-token");
  assert.equal(update.encryptedRefreshToken, null);
  assert.equal(update.tokenExpiresAt?.toISOString(), "2026-05-09T13:00:00.000Z");
});

test("Gmail sync plan requires selective metadata-first scope and omits full bodies", () => {
  const blocked = buildConnectorSyncPlan({
    provider: "gmail",
    selection: {
      provider: "gmail",
      sourceUri: "gmail:all-mail",
    },
    items: [
      {
        id: "thread-1",
        body: "Full body should not be imported.",
      },
    ],
  });
  const allowed = buildConnectorSyncPlan({
    provider: "gmail",
    selection: {
      provider: "gmail",
      labels: ["Penny"],
      searchQueries: ["from:founder@example.com newer_than:90d"],
      metadataFirst: true,
    },
    fetchedAt: "2026-05-09T12:00:00.000Z",
    items: [
      {
        id: "thread-1",
        snippet: "I think Penny should prioritize founder memory review.",
        body: "Full body should not be imported.",
        metadata: {
          from: "founder@example.com",
          subject: "Penny memory review",
          labels: ["Penny"],
          date: "2026-05-08",
        },
      },
    ],
  });

  assert.equal(blocked.connectorPlan.allowed, false);
  assert.equal(blocked.imports.length, 0);
  assert.equal(allowed.connectorPlan.allowed, true);
  assert.equal(allowed.syncJob.rateLimitKey.startsWith("gmail:"), true);
  assert.equal(allowed.imports.length, 1);
  assert.equal(allowed.imports[0]?.provider, "gmail");
  assert.equal(allowed.imports[0]?.text.includes("Full body should not be imported."), false);
  assert.equal(allowed.imports[0]?.text.includes("metadata and snippet were used first"), true);
  assert.equal(allowed.imports[0]?.text.includes("Penny memory review"), true);
});

test("Calendar sync plan is read-only and extracts cadence, deadlines, and collaborators", () => {
  const blocked = buildConnectorSyncPlan({
    provider: "calendar",
    selection: {
      provider: "calendar",
      readOnly: false,
    },
    items: [],
  });
  const allowed = buildConnectorSyncPlan({
    provider: "calendar",
    selection: {
      provider: "calendar",
      calendarIds: ["primary"],
      readOnly: true,
    },
    items: [
      {
        id: "event-1",
        label: "Penny context layer review",
        start: "2026-05-10T14:00:00.000Z",
        end: "2026-05-10T14:30:00.000Z",
        attendees: ["founder@example.com", "builder@example.com"],
        snippet: "Review deadline and project cadence.",
      },
    ],
  });

  assert.equal(blocked.connectorPlan.allowed, false);
  assert.equal(allowed.connectorPlan.allowed, true);
  assert.equal(allowed.imports[0]?.provider, "calendar");
  assert.equal(allowed.imports[0]?.text.includes("project cadence"), true);
  assert.equal(allowed.imports[0]?.text.includes("deadline or due"), true);
  assert.equal(allowed.imports[0]?.text.includes("recurring collaborators"), true);
});

test("fetchConnectorSyncItems fetches Gmail metadata and snippets without full bodies", async () => {
  const requests: ConnectorFetchHttpRequest[] = [];
  const result = await fetchConnectorSyncItems({
    provider: "gmail",
    accessToken: "gmail-access-token",
    maxItems: 2,
    fetchedAt: "2026-05-09T12:00:00.000Z",
    selection: {
      provider: "gmail",
      labels: ["Label_123"],
      senders: ["founder@example.com"],
      searchQueries: ["newer_than:90d"],
      metadataFirst: true,
    },
    async http(request) {
      requests.push(request);
      const url = new URL(request.url);

      assert.equal(request.headers.authorization, "Bearer gmail-access-token");

      if (url.pathname.endsWith("/messages")) {
        assert.equal(url.searchParams.get("maxResults"), "2");
        assert.equal(url.searchParams.get("q"), "newer_than:90d from:founder@example.com");
        assert.deepEqual(url.searchParams.getAll("labelIds"), ["Label_123"]);

        return {
          status: 200,
          body: {
            messages: [{ id: "msg-1", threadId: "thread-1" }],
          },
        };
      }

      assert.equal(url.searchParams.get("format"), "metadata");
      assert.deepEqual(url.searchParams.getAll("metadataHeaders"), ["From", "Subject", "Date"]);

      return {
        status: 200,
        body: {
          id: "msg-1",
          threadId: "thread-1",
          snippet: "Founder says Penny should remember launch constraints.",
          payload: {
            headers: [
              { name: "From", value: "founder@example.com" },
              { name: "Subject", value: "Launch constraints" },
              { name: "Date", value: "Fri, 8 May 2026 12:00:00 -0400" },
            ],
          },
        },
      };
    },
  });

  assert.equal(requests.length, 2);
  assert.equal(result.connectorPlan.allowed, true);
  assert.equal(result.fetchedAt, "2026-05-09T12:00:00.000Z");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.id, "thread-1");
  assert.equal(result.items[0]?.label, "Gmail: Launch constraints");
  assert.equal(result.items[0]?.snippet?.includes("launch constraints"), true);
  assert.equal(result.items[0]?.metadata?.subject, "Launch constraints");
});

test("fetchConnectorSyncItems fetches Calendar events read-only across selected calendars", async () => {
  const requests: ConnectorFetchHttpRequest[] = [];
  const result = await fetchConnectorSyncItems({
    provider: "calendar",
    accessToken: "calendar-access-token",
    maxItems: 1,
    selection: {
      provider: "calendar",
      calendarIds: ["primary"],
      readOnly: true,
      dateRange: {
        from: "2026-05-09T00:00:00.000Z",
        to: "2026-05-16T00:00:00.000Z",
      },
    },
    async http(request) {
      requests.push(request);
      const url = new URL(request.url);

      assert.equal(request.headers.authorization, "Bearer calendar-access-token");
      assert.equal(url.pathname, "/calendar/v3/calendars/primary/events");
      assert.equal(url.searchParams.get("singleEvents"), "true");
      assert.equal(url.searchParams.get("orderBy"), "startTime");
      assert.equal(url.searchParams.get("maxResults"), "1");
      assert.equal(url.searchParams.get("timeMin"), "2026-05-09T00:00:00.000Z");
      assert.equal(url.searchParams.get("timeMax"), "2026-05-16T00:00:00.000Z");

      return {
        status: 200,
        body: {
          items: [
            {
              id: "event-1",
              summary: "Penny context review",
              description: "Weekly project cadence and deadline review.",
              start: { dateTime: "2026-05-10T14:00:00.000Z" },
              end: { dateTime: "2026-05-10T14:30:00.000Z" },
              attendees: [{ email: "founder@example.com" }, { email: "builder@example.com" }],
            },
          ],
        },
      };
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(result.connectorPlan.allowed, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.sourceUri, "calendar:event:primary:event-1");
  assert.equal(result.items[0]?.label, "Penny context review");
  assert.equal(result.items[0]?.start, "2026-05-10T14:00:00.000Z");
  assert.deepEqual(result.items[0]?.attendees, ["founder@example.com", "builder@example.com"]);
});

test("buildConnectorOAuthStart creates signed Google authorization URLs for Gmail", () => {
  const start = buildConnectorOAuthStart({
    provider: "gmail",
    clientId: "client-id",
    redirectUri: "https://penny.test/oauth/callback",
    stateSecret: "state-secret",
    nonce: "nonce-1",
    now: "2026-05-09T12:00:00.000Z",
    selection: {
      provider: "gmail",
      labels: ["Penny"],
      searchQueries: ["from:founder@example.com"],
    },
  });
  const url = new URL(start.authorizationUrl);

  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("redirect_uri"), "https://penny.test/oauth/callback");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.readonly");
  assert.equal(url.searchParams.get("state"), start.state);
  assert.equal(start.connectorPlan.allowed, true);
  assert.equal(start.warnings.some((warning) => warning.includes("restricted scope")), true);
});

test("exchangeConnectorOAuthCallback validates state and uses injected token exchange", async () => {
  const start = buildConnectorOAuthStart({
    provider: "calendar",
    clientId: "client-id",
    redirectUri: "https://penny.test/oauth/callback",
    stateSecret: "state-secret",
    nonce: "nonce-1",
    now: "2026-05-09T12:00:00.000Z",
    selection: {
      provider: "calendar",
      calendarIds: ["primary"],
      readOnly: true,
    },
  });
  const callback = await exchangeConnectorOAuthCallback({
    provider: "calendar",
    code: "auth-code",
    state: start.state,
    stateSecret: "state-secret",
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://penny.test/oauth/callback",
    async exchange(request) {
      assert.equal(request.tokenEndpoint, "https://oauth2.googleapis.com/token");
      assert.equal(request.code, "auth-code");
      assert.equal(request.clientId, "client-id");
      assert.equal(request.clientSecret, "client-secret");

      return {
        accessToken: "calendar-access-token",
        refreshToken: "calendar-refresh-token",
        expiresInSeconds: 3600,
      };
    },
  });

  assert.equal(callback.provider, "calendar");
  assert.equal(callback.connectorPlan.allowed, true);
  assert.equal(callback.token.accessToken, "calendar-access-token");
  assert.equal(callback.token.refreshToken, "calendar-refresh-token");
  assert.ok(callback.token.expiresAt instanceof Date);
});

test("refreshConnectorOAuthToken updates access tokens and preserves refresh tokens when not rotated", async () => {
  const refreshed = await refreshConnectorOAuthToken({
    provider: "gmail",
    refreshToken: "existing-refresh-token",
    clientId: "client-id",
    clientSecret: "client-secret",
    async exchange(request) {
      assert.equal(request.tokenEndpoint, "https://oauth2.googleapis.com/token");
      assert.equal(request.refreshToken, "existing-refresh-token");
      assert.equal(request.clientId, "client-id");
      assert.equal(request.clientSecret, "client-secret");

      return {
        accessToken: "new-access-token",
        expiresInSeconds: 1800,
      };
    },
  });

  assert.equal(refreshed.accessToken, "new-access-token");
  assert.equal(refreshed.refreshToken, "existing-refresh-token");
  assert.ok(refreshed.expiresAt instanceof Date);
});

test("refreshConnectorOAuthToken stores rotated refresh tokens and rejects missing access tokens", async () => {
  const rotated = await refreshConnectorOAuthToken({
    provider: "calendar",
    refreshToken: "old-refresh-token",
    clientId: "client-id",
    clientSecret: "client-secret",
    async exchange() {
      return {
        accessToken: "rotated-access-token",
        refreshToken: "new-refresh-token",
      };
    },
  });

  assert.equal(rotated.accessToken, "rotated-access-token");
  assert.equal(rotated.refreshToken, "new-refresh-token");
  assert.equal(rotated.expiresAt, null);

  await assert.rejects(
    () =>
      refreshConnectorOAuthToken({
        provider: "calendar",
        refreshToken: "old-refresh-token",
        clientId: "client-id",
        clientSecret: "client-secret",
        async exchange() {
          return { accessToken: "" };
        },
      }),
    /OAuth refresh did not return an access token/,
  );
});

test("exchangeConnectorOAuthCallback rejects tampered state", async () => {
  const start = buildConnectorOAuthStart({
    provider: "calendar",
    clientId: "client-id",
    redirectUri: "https://penny.test/oauth/callback",
    stateSecret: "state-secret",
    selection: {
      provider: "calendar",
      readOnly: true,
    },
  });

  await assert.rejects(
    () =>
      exchangeConnectorOAuthCallback({
        provider: "calendar",
        code: "auth-code",
        state: `${start.state}tampered`,
        stateSecret: "state-secret",
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "https://penny.test/oauth/callback",
        async exchange() {
          return {
            accessToken: "unused",
          };
        },
      }),
    /OAuth state signature is invalid/,
  );
});
