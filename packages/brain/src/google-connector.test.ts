import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoogleConnectorProvider,
  completeGoogleConnectorSync,
  connectorSourceToBrainImport,
  createNangoAdapter,
  deleteGoogleConnectorSourceAccess,
  googleConnectorCredentialWithAccountDetails,
  initializeGoogleConnectorConnection,
  planGoogleScopeRequest,
  readGoogleConnectorRuntimeConfig,
  revokeGoogleConnectorAccess,
  startGoogleConnectorSync,
  visibleConnectorSourcesForScope,
  type NangoHttpRequest,
} from "./google-connector.ts";

const configuredEnv = {
  ENABLE_GOOGLE_CONNECTOR: "true",
  NANGO_SECRET_KEY: "nango-secret",
  NANGO_BASE_URL: "https://api.nango.test",
};

test("Google connector provider shows an honest disabled state when the connector flag is off", () => {
  const provider = buildGoogleConnectorProvider({
    env: {
      ...configuredEnv,
      ENABLE_GOOGLE_CONNECTOR: "false",
    },
  });

  assert.equal(provider.status, "unsupported");
  assert.equal(provider.configured, false);
  assert.equal(provider.configurationLabel, "disabled");
  assert.equal(provider.surfaces.every((surface) => surface.status === "unsupported"), true);
  assert.ok(provider.surfaces.find((surface) => surface.id === "google_gmail")?.notFaked.some((claim) => /No hidden Gmail import/i.test(claim)));
  assert.ok(provider.surfaces.find((surface) => surface.id === "google_my_activity")?.notFaked.some((claim) => /No direct Google Search history/i.test(claim)));
  assert.ok(provider.surfaces.find((surface) => surface.id === "chrome_extension_history")?.notFaked.some((claim) => /No browser history access/i.test(claim)));
});

test("Google connector provider shows not configured when env is incomplete", () => {
  const provider = buildGoogleConnectorProvider({
    env: {
      ENABLE_GOOGLE_CONNECTOR: "true",
    },
  });

  assert.equal(provider.status, "unsupported");
  assert.equal(provider.configured, false);
  assert.equal(provider.configurationLabel, "not configured");
  assert.deepEqual(provider.missingConfig, ["NANGO_SECRET_KEY"]);
  assert.equal(provider.surfaces.every((surface) => surface.status === "unsupported"), true);
});

test("Google surfaces distinguish available, gated, manual import, and extension-required access", () => {
  const provider = buildGoogleConnectorProvider({ env: configuredEnv });
  const statuses = new Map(provider.surfaces.map((surface) => [surface.id, surface.status]));

  assert.equal(provider.status, "available");
  assert.equal(provider.configurationLabel, "configured");
  assert.equal(statuses.get("google_drive"), "available");
  assert.equal(statuses.get("google_docs_sheets_slides"), "available");
  assert.equal(statuses.get("google_calendar"), "available");
  assert.equal(statuses.get("google_youtube"), "available");
  assert.equal(statuses.get("google_gmail"), "gated_verification_required");
  assert.equal(statuses.get("google_takeout"), "manual_import_only");
  assert.equal(statuses.get("google_my_activity"), "manual_import_only");
  assert.equal(statuses.get("chrome_extension_history"), "extension_required");

  const gmail = provider.surfaces.find((surface) => surface.id === "google_gmail");
  const youtube = provider.surfaces.find((surface) => surface.id === "google_youtube");

  assert.ok(gmail?.notFaked.some((claim) => /No hidden Gmail import/i.test(claim)));
  assert.ok(youtube?.notFaked.some((claim) => /No YouTube watch history/i.test(claim)));
});

test("Google scope planning keeps restricted scopes out of production by default", () => {
  const config = readGoogleConnectorRuntimeConfig(configuredEnv);
  const drivePlan = planGoogleScopeRequest({
    surfaceIds: ["google_drive"],
    mode: "production",
    config,
  });
  const gmailPlan = planGoogleScopeRequest({
    surfaceIds: ["google_gmail"],
    mode: "production",
    config,
  });

  assert.deepEqual(drivePlan.requestableScopeUrls, ["https://www.googleapis.com/auth/drive.file"]);
  assert.equal(drivePlan.blockedScopes.some((scope) => scope.id === "google.drive.metadata.readonly"), true);
  assert.equal(drivePlan.warnings.some((warning) => /restricted Google scope/i.test(warning)), true);
  assert.deepEqual(gmailPlan.requestableScopeUrls, []);
  assert.equal(gmailPlan.blockedScopes.every((scope) => scope.surface === "google_gmail"), true);
  assert.equal(gmailPlan.warnings.some((warning) => /ENABLE_GMAIL_CONNECTOR/i.test(warning)), true);
});

test("Gmail restricted scopes stay blocked in production even when explicit gates are enabled", () => {
  const config = readGoogleConnectorRuntimeConfig({
    ...configuredEnv,
    ENABLE_GMAIL_CONNECTOR: "true",
    ENABLE_RESTRICTED_GOOGLE_SCOPES: "true",
  });
  const productionPlan = planGoogleScopeRequest({
    surfaceIds: ["google_gmail"],
    mode: "production",
    config,
  });
  const developmentPlan = planGoogleScopeRequest({
    surfaceIds: ["google_gmail"],
    mode: "development",
    config,
  });

  assert.deepEqual(productionPlan.requestableScopeUrls, []);
  assert.equal(productionPlan.warnings.every((warning) => /not production allowed/i.test(warning)), true);
  assert.deepEqual(developmentPlan.requestableScopeUrls, [
    "https://www.googleapis.com/auth/gmail.metadata",
    "https://www.googleapis.com/auth/gmail.readonly",
  ]);
});

test("Nango adapter returns not configured instead of faking a connection", async () => {
  const adapter = createNangoAdapter(
    readGoogleConnectorRuntimeConfig({ ENABLE_GOOGLE_CONNECTOR: "true" }),
    async () => {
      throw new Error("Nango should not be called when config is missing.");
    },
  );

  const result = await adapter.createConnectSession({ endUserId: "user-1" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "not_configured");
    assert.match(result.error.message, /NANGO_SECRET_KEY/);
  }
});

test("Nango adapter creates connect sessions with Google integration tags", async () => {
  const requests: NangoHttpRequest[] = [];
  const adapter = createNangoAdapter(readGoogleConnectorRuntimeConfig(configuredEnv), async (request) => {
    requests.push(request);

    return {
      status: 201,
      body: {
        data: {
          token: "session-token",
          expires_at: "2026-05-20T12:30:00Z",
          connect_link: "https://connect.nango.test/session-token",
        },
      },
    };
  });

  const result = await adapter.createConnectSession({
    endUserId: "user-1",
    organizationId: "workspace-1",
    endUserEmail: "user@example.com",
  });

  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, "POST");
  assert.equal(requests[0]?.url, "https://api.nango.test/connect/sessions");
  assert.equal(requests[0]?.headers.Authorization, "Bearer nango-secret");
  assert.deepEqual(requests[0]?.body, {
    allowed_integrations: ["google"],
    tags: {
      end_user_id: "user-1",
      organization_id: "workspace-1",
      end_user_email: "user@example.com",
    },
    integrations_config_defaults: {},
    overrides: {},
  });

  if (result.ok) {
    assert.equal(result.data.token, "session-token");
    assert.equal(result.data.connectLink, "https://connect.nango.test/session-token");
  }
});

test("Google connector sync lifecycle creates cursors, private source refs, and source counts", () => {
  const scope = { userId: "user-1", workspaceId: "workspace-1", projectId: null, sphereId: null };
  const otherScope = { ...scope, userId: "user-2" };
  const initial = initializeGoogleConnectorConnection({
    scope,
    now: "2026-05-20T12:00:00.000Z",
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-google-1",
      providerConfigKey: "google",
      credentialRef: "nango:google:nango-google-1",
      endUserId: "user-1",
    },
    surfaces: ["google_drive", "google_calendar"],
    scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/calendar.readonly"],
  });
  const connectionId = initial.connections[0]?.id ?? "";
  const running = startGoogleConnectorSync({
    state: initial,
    scope,
    connectionId,
    surface: "google_drive",
    now: "2026-05-20T12:01:00.000Z",
  });
  const runningJob = running.syncJobs.find((job) => job.status === "running" && job.surface === "google_drive");

  assert.equal(initial.connections[0]?.nextSyncAt, "2026-05-20T12:00:00.000Z");
  assert.equal(initial.syncJobs.length, 2);
  assert.equal(running.connections[0]?.status, "syncing");
  assert.ok(runningJob);

  const completed = completeGoogleConnectorSync({
    state: running,
    scope,
    connectionId,
    jobId: runningJob?.id ?? "",
    surface: "google_drive",
    now: "2026-05-20T12:02:00.000Z",
    cursor: "drive-cursor-2",
    nextSyncAt: "2026-05-20T18:02:00.000Z",
    sources: [
      {
        surface: "google_drive",
        kind: "google_doc",
        externalId: "doc-1",
        sourceUri: "google-drive:file:doc-1",
        label: "Strategy doc",
        url: "https://docs.google.com/document/d/doc-1",
        metadata: { mimeType: "application/vnd.google-apps.document" },
        brainSourceId: "brain-source-doc-1",
        brainNodeIds: ["memory-node-1"],
      },
      {
        surface: "google_drive",
        kind: "google_sheet",
        externalId: "sheet-1",
        sourceUri: "google-drive:file:sheet-1",
        label: "Research sheet",
        metadata: { mimeType: "application/vnd.google-apps.spreadsheet" },
      },
    ],
  });

  assert.equal(completed.connections[0]?.status, "connected");
  assert.equal(completed.connections[0]?.lastSyncedAt, "2026-05-20T12:02:00.000Z");
  assert.equal(completed.connections[0]?.nextSyncAt, "2026-05-20T18:02:00.000Z");
  assert.deepEqual(completed.connections[0]?.sourceCounts, { google_doc: 1, google_sheet: 1 });
  assert.equal(completed.cursors.find((cursor) => cursor.surface === "google_drive")?.cursor, "drive-cursor-2");
  assert.equal(completed.syncJobs.find((job) => job.id === runningJob?.id)?.status, "succeeded");
  assert.equal(completed.sources.every((source) => source.privacy.trainingUse === false), true);
  assert.equal(completed.sources.every((source) => source.privacy.visibility === "private_user_memory"), true);
  assert.equal(completed.sources.every((source) => source.privacy.productionLogSafe === false), true);
  assert.equal(visibleConnectorSourcesForScope(completed, scope).length, 2);
  assert.equal(visibleConnectorSourcesForScope(completed, otherScope).length, 0);
  assert.equal(completed.audits.some((audit) => audit.event === "connector.sync_completed"), true);

  const docSource = completed.sources.find((source) => source.kind === "google_doc");
  assert.equal(docSource?.brainSourceId, "brain-source-doc-1");
  assert.deepEqual(docSource?.brainNodeIds, ["memory-node-1"]);
});

test("Google connector revoke and source delete remove retrieval access without cross-user leakage", () => {
  const scope = { userId: "user-1", workspaceId: "workspace-1", projectId: null, sphereId: null };
  const initial = initializeGoogleConnectorConnection({
    scope,
    now: "2026-05-20T12:00:00.000Z",
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-google-1",
      providerConfigKey: "google",
      credentialRef: "nango:google:nango-google-1",
    },
    surfaces: ["google_calendar"],
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
  const connectionId = initial.connections[0]?.id ?? "";
  const running = startGoogleConnectorSync({
    state: initial,
    scope,
    connectionId,
    surface: "google_calendar",
    now: "2026-05-20T12:01:00.000Z",
  });
  const job = running.syncJobs.find((candidate) => candidate.status === "running");
  const completed = completeGoogleConnectorSync({
    state: running,
    scope,
    connectionId,
    jobId: job?.id ?? "",
    surface: "google_calendar",
    now: "2026-05-20T12:02:00.000Z",
    cursor: "calendar-cursor-1",
    nextSyncAt: "2026-05-20T18:02:00.000Z",
    sources: [
      {
        surface: "google_calendar",
        kind: "google_calendar_event",
        externalId: "event-1",
        sourceUri: "google-calendar:event:primary:event-1",
        label: "Penny planning review",
      },
    ],
  });
  const sourceId = completed.sources[0]?.id ?? "";
  const deleted = deleteGoogleConnectorSourceAccess({
    state: completed,
    scope,
    sourceId,
    now: "2026-05-20T12:03:00.000Z",
  });
  const revoked = revokeGoogleConnectorAccess({
    state: completed,
    scope,
    connectionId,
    now: "2026-05-20T12:04:00.000Z",
  });

  assert.equal(deleted.sources[0]?.privacy.retrievalAccess, "deleted");
  assert.equal(visibleConnectorSourcesForScope(deleted, scope).length, 0);
  assert.equal(deleted.audits.some((audit) => audit.event === "connector.source_deleted"), true);
  assert.equal(revoked.connections[0]?.status, "revoked");
  assert.equal(revoked.connections[0]?.nextSyncAt, null);
  assert.equal(revoked.sources[0]?.privacy.retrievalAccess, "revoked");
  assert.equal(revoked.cursors[0]?.nextSyncAt, null);
  assert.equal(visibleConnectorSourcesForScope(revoked, scope).length, 0);
  assert.equal(revoked.audits.some((audit) => audit.event === "connector.revoked"), true);
});

test("connectorSourceToBrainImport preserves provenance and private raw-retention defaults", () => {
  const importInput = connectorSourceToBrainImport(
    {
      id: "source-1",
      connectionId: "conn-1",
      providerId: "google",
      surface: "google_docs_sheets_slides",
      kind: "google_doc",
      sourceUri: "google-drive:file:doc-1",
      label: "Strategy doc",
      metadata: {},
      sourceRef: {
        providerId: "google",
        surface: "google_docs_sheets_slides",
        externalId: "doc-1",
        url: "https://docs.google.com/document/d/doc-1",
      },
      provenance: {
        credentialRef: "nango:google:conn-1",
        fetchedAt: "2026-05-20T12:00:00.000Z",
        cursor: "cursor-1",
      },
      privacy: {
        trainingUse: false,
        visibility: "private_user_memory",
        rawContentStored: false,
        productionLogSafe: false,
        retrievalAccess: "enabled",
      },
    },
    "Penny should use this document as private Brain context.",
  );

  assert.deepEqual(importInput, {
    kind: "docs_text",
    label: "Strategy doc",
    sourceUri: "google-drive:file:doc-1",
    content: "Penny should use this document as private Brain context.",
    rawRetention: false,
  });
});

test("Google connector account metadata labels source provenance and Brain imports", () => {
  const scope = { userId: "user-1", workspaceId: "workspace-1", projectId: null, sphereId: null };
  const credential = googleConnectorCredentialWithAccountDetails(
    {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-google-work",
      providerConfigKey: "google",
      credentialRef: "nango:google:nango-google-work",
    },
    {
      metadata: { email: "work@example.com", name: "Work Google" },
      tags: { end_user_id: "user-1" },
    },
  );
  const initial = initializeGoogleConnectorConnection({
    scope,
    now: "2026-05-20T12:00:00.000Z",
    credential,
    surfaces: ["google_drive"],
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  const running = startGoogleConnectorSync({
    state: initial,
    scope,
    connectionId: initial.connections[0]?.id ?? "",
    surface: "google_drive",
    now: "2026-05-20T12:01:00.000Z",
  });
  const job = running.syncJobs.find((candidate) => candidate.status === "running");
  const completed = completeGoogleConnectorSync({
    state: running,
    scope,
    connectionId: initial.connections[0]?.id ?? "",
    jobId: job?.id ?? "",
    surface: "google_drive",
    now: "2026-05-20T12:02:00.000Z",
    cursor: "drive-cursor-1",
    nextSyncAt: "2026-05-20T18:02:00.000Z",
    sources: [
      {
        surface: "google_drive",
        kind: "google_doc",
        externalId: "doc-1",
        sourceUri: "google-drive:file:doc-1",
        label: "Strategy doc",
      },
    ],
  });
  const source = completed.sources[0];

  assert.equal(credential.accountEmail, "work@example.com");
  assert.equal(credential.accountLabel, "Work Google");
  assert.equal(source?.provenance.accountEmail, "work@example.com");
  assert.equal(source?.provenance.accountLabel, "Work Google");
  assert.equal(source?.provenance.connectionLabel, "Work Google");
  assert.equal(connectorSourceToBrainImport(source!, "Private context.").label, "Strategy doc (work@example.com)");
});
