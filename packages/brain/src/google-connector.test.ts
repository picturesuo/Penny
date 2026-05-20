import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoogleConnectorProvider,
  createNangoAdapter,
  planGoogleScopeRequest,
  readGoogleConnectorRuntimeConfig,
  type NangoHttpRequest,
} from "./google-connector.ts";

const configuredEnv = {
  ENABLE_GOOGLE_CONNECTOR: "true",
  NANGO_SECRET_KEY: "nango-secret",
  NANGO_PUBLIC_KEY: "nango-public",
  NANGO_BASE_URL: "https://api.nango.test",
  GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
};

test("Google connector provider shows not configured when env is incomplete", () => {
  const provider = buildGoogleConnectorProvider({
    env: {
      ENABLE_GOOGLE_CONNECTOR: "true",
      NANGO_SECRET_KEY: "nango-secret",
    },
  });

  assert.equal(provider.status, "unsupported");
  assert.equal(provider.configured, false);
  assert.equal(provider.configurationLabel, "not configured");
  assert.deepEqual(provider.missingConfig, [
    "NANGO_PUBLIC_KEY",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
  ]);
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
