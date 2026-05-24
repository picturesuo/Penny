import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePennyPublicReadiness } from "./public-readiness.ts";
import { requiredPennySchemaTables } from "./server.ts";

test("public readiness passes for strict token auth, migrated Postgres, explicit limits, and no live Gmail", () => {
  const report = evaluatePennyPublicReadiness({
    env: validPublicEnv(),
    existingTables: requiredPennySchemaTables,
    generatedAt: "2026-05-24T00:00:00.000Z",
  });

  assert.equal(report.ok, true);
  assert.equal(report.strict, true);
  assert.equal(report.summary.fail, 0);
  assert.equal(report.checks.find((check) => check.name === "database-schema")?.status, "pass");
  assert.equal(report.checks.find((check) => check.name === "rate-limits")?.status, "pass");
  assert.equal(report.checks.find((check) => check.name === "gmail-connector-proof")?.status, "pass");
});

test("public readiness fails when schema proof or explicit rate limits are missing", () => {
  const env = validPublicEnv({
    PENNY_RATE_LIMIT_WINDOW_MS: undefined,
    PENNY_AUTH_FAILURE_RATE_LIMIT_MAX: undefined,
  });
  const report = evaluatePennyPublicReadiness({ env });

  assert.equal(report.ok, false);
  assert.equal(report.checks.find((check) => check.name === "database-schema")?.status, "fail");
  assert.deepEqual(
    report.checks.find((check) => check.name === "rate-limits")?.missing,
    ["PENNY_RATE_LIMIT_WINDOW_MS", "PENNY_AUTH_FAILURE_RATE_LIMIT_MAX"],
  );
});

test("public readiness requires final staging proof when live Gmail is enabled", () => {
  const env = validPublicEnv({
    ENABLE_GOOGLE_CONNECTOR: "true",
    ENABLE_GMAIL_CONNECTOR: "true",
    ENABLE_RESTRICTED_GOOGLE_SCOPES: "true",
    NANGO_SECRET_KEY: "nango-secret",
    NANGO_WEBHOOK_SIGNING_KEY: "nango-webhook-signing-key",
    NANGO_PUBLIC_KEY: "nango-public",
    NANGO_BASE_URL: "https://api.nango.test",
    NANGO_GMAIL_INTEGRATION_ID: "google-gmail-staging",
  });
  const missingProof = evaluatePennyPublicReadiness({ env, existingTables: requiredPennySchemaTables });
  const withProof = evaluatePennyPublicReadiness({
    env,
    existingTables: requiredPennySchemaTables,
    gmailStagingBundleVerified: true,
  });

  assert.equal(missingProof.ok, false);
  assert.equal(missingProof.checks.find((check) => check.name === "gmail-connector-proof")?.status, "fail");
  assert.equal(withProof.ok, true);
});

test("public readiness rejects dev-shaped auth even if the local demo would run", () => {
  const report = evaluatePennyPublicReadiness({
    env: {
      NODE_ENV: "development",
      PENNY_DEPLOY_ENV: "local",
      PENNY_AUTH_MODE: "dev",
      PENNY_SKIP_DATABASE_PREP: "true",
      PENNY_RATE_LIMIT_MAX: "120",
      PENNY_RATE_LIMIT_WINDOW_MS: "60000",
      PENNY_AUTH_FAILURE_RATE_LIMIT_MAX: "10",
      PENNY_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS: "60000",
      PENNY_STRUCTURED_LOGS: "true",
    },
    existingTables: requiredPennySchemaTables,
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.find((check) => check.name === "strict-deploy-target")?.status, "fail");
  assert.match(report.checks.find((check) => check.name === "token-auth")?.missing?.join(" ") ?? "", /PENNY_AUTH_MODE=token/);
});

function validPublicEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: "production",
    PENNY_DEPLOY_ENV: "private-alpha",
    DATABASE_URL: "postgresql://penny:penny@db.example.test:5432/penny?sslmode=require",
    PENNY_AUTH_MODE: "token",
    PENNY_API_TOKEN: "penny-api-token-with-at-least-32-chars",
    PENNY_SESSION_SECRET: "penny-session-secret-with-32-chars",
    PENNY_CORS_ORIGINS: "https://penny.example.test",
    PENNY_TRUST_AUTH_HEADERS: "false",
    PENNY_RATE_LIMIT_MAX: "120",
    PENNY_RATE_LIMIT_WINDOW_MS: "60000",
    PENNY_AUTH_FAILURE_RATE_LIMIT_MAX: "10",
    PENNY_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS: "60000",
    PENNY_STRUCTURED_LOGS: "true",
    PENNY_CREATE_MODEL_BACKED: "false",
    ...overrides,
  };
}
