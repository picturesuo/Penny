import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConnectorSyncPlan,
  buildRefreshTokenUpdate,
  decryptConnectorToken,
  encryptConnectorTokens,
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
