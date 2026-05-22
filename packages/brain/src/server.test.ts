import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidPennyStartupEnvironment,
  createPennyServer,
  guardApiRequest,
  missingPennySchemaTables,
  PennyEnvironmentValidationError,
  requiredPennySchemaTables,
  validatePennyStartupEnvironment,
} from "./server.ts";

const pennyEnvKeys = [
  "NODE_ENV",
  "DATABASE_URL",
  "PENNY_AUTO_MIGRATE",
  "PENNY_DEPLOY_ENV",
  "PENNY_API_TOKEN",
  "PENNY_AUTH_MODE",
  "PENNY_AUTH_FAILURE_RATE_LIMIT_MAX",
  "PENNY_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS",
  "PENNY_AUTH_PROJECT_ID",
  "PENNY_AUTH_SPHERE_ID",
  "PENNY_AUTH_USER_ID",
  "PENNY_AUTH_WORKSPACE_ID",
  "PENNY_CORS_ORIGINS",
  "PENNY_RATE_LIMIT_MAX",
  "PENNY_RATE_LIMIT_WINDOW_MS",
  "PENNY_SESSION_MAX_AGE_SECONDS",
  "PENNY_SESSION_SECRET",
  "PENNY_SKIP_DATABASE_PREP",
  "PENNY_STRUCTURED_LOGS",
  "PENNY_TRUST_AUTH_HEADERS",
  "PENNY_CREATE_MODEL_BACKED",
  "XAI_API_KEY",
];

test("API guard trusts scope headers in dev mode and mirrors Penny scope aliases", async () => {
  await withPennyEnv({ PENNY_AUTH_MODE: "dev", PENNY_RATE_LIMIT_MAX: "0" }, async () => {
    const request = apiRequest({
      "x-user-id": "dev-user-1",
      "x-workspace-id": "workspace-1",
      "x-project-id": "project-1",
      "x-sphere-id": "sphere-1",
    });
    const guard = guardApiRequest(request, new URL(request.url));

    assert.equal(guard.response, undefined);
    assert.equal(guard.request.headers.get("x-user-id"), "dev-user-1");
    assert.equal(guard.request.headers.get("x-penny-user-id"), "dev-user-1");
    assert.equal(guard.request.headers.get("x-workspace-id"), "workspace-1");
    assert.equal(guard.request.headers.get("x-penny-workspace-id"), "workspace-1");
    assert.equal(guard.request.headers.get("x-project-id"), "project-1");
    assert.equal(guard.request.headers.get("x-penny-project-id"), "project-1");
    assert.equal(guard.request.headers.get("x-sphere-id"), "sphere-1");
    assert.equal(guard.request.headers.get("x-penny-sphere-id"), "sphere-1");
  });
});

test("API guard rejects missing token credentials before route dispatch", async () => {
  await withPennyEnv({ PENNY_AUTH_MODE: "token", PENNY_API_TOKEN: "secret", PENNY_RATE_LIMIT_MAX: "0" }, async () => {
    const request = apiRequest();
    const guard = guardApiRequest(request, new URL(request.url));
    const payload = await errorPayload(guard.response);

    assert.equal(guard.response?.status, 401);
    assert.equal(guard.response?.headers.get("www-authenticate"), 'Bearer realm="penny"');
    assert.equal(payload.error.code, "unauthorized");
  });
});

test("API guard ignores caller scope headers in token mode unless explicitly trusted", async () => {
  await withPennyEnv(
    {
      PENNY_API_TOKEN: "secret",
      PENNY_AUTH_MODE: "token",
      PENNY_AUTH_PROJECT_ID: "server-project",
      PENNY_AUTH_SPHERE_ID: "server-sphere",
      PENNY_AUTH_USER_ID: "server-user",
      PENNY_AUTH_WORKSPACE_ID: "server-workspace",
      PENNY_RATE_LIMIT_MAX: "0",
    },
    async () => {
      const request = apiRequest({
        authorization: "Bearer secret",
        "x-user-id": "caller-user",
        "x-workspace-id": "caller-workspace",
        "x-project-id": "caller-project",
        "x-sphere-id": "caller-sphere",
      });
      const guard = guardApiRequest(request, new URL(request.url));

      assert.equal(guard.response, undefined);
      assert.equal(guard.request.headers.get("x-user-id"), "server-user");
      assert.equal(guard.request.headers.get("x-workspace-id"), "server-workspace");
      assert.equal(guard.request.headers.get("x-project-id"), "server-project");
      assert.equal(guard.request.headers.get("x-sphere-id"), "server-sphere");
    },
  );

  await withPennyEnv(
    {
      PENNY_API_TOKEN: "secret",
      PENNY_AUTH_MODE: "token",
      PENNY_RATE_LIMIT_MAX: "0",
      PENNY_TRUST_AUTH_HEADERS: "true",
    },
    async () => {
      const request = apiRequest({
        authorization: "Bearer secret",
        "x-user-id": "trusted-user",
      });
      const guard = guardApiRequest(request, new URL(request.url));

      assert.equal(guard.response, undefined);
      assert.equal(guard.request.headers.get("x-user-id"), "trusted-user");
      assert.equal(guard.request.headers.get("x-penny-user-id"), "trusted-user");
    },
  );
});

test("API guard handles CORS before auth and exposes API preflight headers", async () => {
  await withPennyEnv(
    {
      PENNY_API_TOKEN: "secret",
      PENNY_AUTH_MODE: "token",
      PENNY_CORS_ORIGINS: "http://demo.local",
      PENNY_RATE_LIMIT_MAX: "0",
    },
    async () => {
      const rejectedRequest = apiRequest({ origin: "http://evil.local" });
      const rejected = guardApiRequest(rejectedRequest, new URL(rejectedRequest.url));
      const rejectedPayload = await errorPayload(rejected.response);

      assert.equal(rejected.response?.status, 403);
      assert.equal(rejectedPayload.error.code, "cors_origin_not_allowed");

      const preflightRequest = apiRequest(
        {
          origin: "http://demo.local",
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,content-type",
        },
        "OPTIONS",
      );
      const preflight = guardApiRequest(preflightRequest, new URL(preflightRequest.url));

      assert.equal(preflight.response?.status, 204);
      assert.equal(preflight.headers.get("access-control-allow-origin"), "http://demo.local");
      assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /authorization/);
      assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /x-penny-user-id/);
    },
  );
});

test("API guard allows loopback dev origins on fallback frontend ports", async () => {
  await withPennyEnv(
    {
      NODE_ENV: "development",
      PENNY_AUTH_MODE: "dev",
      PENNY_RATE_LIMIT_MAX: "0",
    },
    async () => {
      const allowedRequest = apiRequest({ origin: "http://localhost:5174" });
      const allowed = guardApiRequest(allowedRequest, new URL(allowedRequest.url));

      assert.equal(allowed.response, undefined);
      assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5174");
      assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");

      const rejectedRequest = apiRequest({ origin: "http://demo.local:5174" });
      const rejected = guardApiRequest(rejectedRequest, new URL(rejectedRequest.url));
      const rejectedPayload = await errorPayload(rejected.response);

      assert.equal(rejected.response?.status, 403);
      assert.equal(rejectedPayload.error.code, "cors_origin_not_allowed");
    },
  );
});

test("API rate limit is scoped to the authenticated identity", async () => {
  await withPennyEnv(
    {
      PENNY_AUTH_MODE: "dev",
      PENNY_RATE_LIMIT_MAX: "1",
      PENNY_RATE_LIMIT_WINDOW_MS: "60000",
    },
    async () => {
      const userOne = `rate-user-${process.pid}-one`;
      const userTwo = `rate-user-${process.pid}-two`;
      const firstRequest = apiRequest({ "x-user-id": userOne });
      const first = guardApiRequest(firstRequest, new URL(firstRequest.url));
      const secondRequest = apiRequest({ "x-user-id": userOne });
      const second = guardApiRequest(secondRequest, new URL(secondRequest.url));
      const thirdRequest = apiRequest({ "x-user-id": userTwo });
      const third = guardApiRequest(thirdRequest, new URL(thirdRequest.url));
      const secondPayload = await errorPayload(second.response);

      assert.equal(first.response, undefined);
      assert.equal(first.headers.get("ratelimit-limit"), "1");
      assert.equal(second.response?.status, 429);
      assert.equal(second.response?.headers.get("retry-after"), "60");
      assert.equal(secondPayload.error.code, "rate_limited");
      assert.equal(third.response, undefined);
      assert.equal(third.request.headers.get("x-user-id"), userTwo);
    },
  );
});

test("Penny login protects the frontend and creates an API session cookie", async () => {
  await withPennyEnv(
    {
      NODE_ENV: "production",
      PENNY_API_TOKEN: "secret",
      PENNY_AUTH_MODE: "token",
      PENNY_RATE_LIMIT_MAX: "0",
      PENNY_AUTH_FAILURE_RATE_LIMIT_MAX: "0",
      PENNY_SESSION_SECRET: "test-session-secret",
    },
    async () => {
      await withTestServer(async (baseUrl) => {
        const unauthenticated = await fetch(`${baseUrl}/`);
        const unauthenticatedBody = await unauthenticated.text();

        assert.equal(unauthenticated.status, 200);
        assert.match(unauthenticatedBody, /Enter the private access token/);

        const login = await fetch(`${baseUrl}/penny/login`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: "secret" }),
          redirect: "manual",
        });
        const sessionCookie = login.headers.get("set-cookie")?.split(";")[0];

        assert.equal(login.status, 303);
        assert.ok(sessionCookie?.startsWith("__Host-penny_session="));

        const cookieHeader = sessionCookie;
        assert.ok(cookieHeader);

        const frontend = await fetch(`${baseUrl}/`, { headers: { cookie: cookieHeader } });

        assert.equal(frontend.status, 200);
        assert.doesNotMatch(await frontend.text(), /Enter the private access token/);

        const apiRequestWithCookie = apiRequest({ cookie: cookieHeader });
        const guard = guardApiRequest(apiRequestWithCookie, new URL(apiRequestWithCookie.url));

        assert.equal(guard.response, undefined);
      });
    },
  );
});

test("API guard rate limits failed token attempts by client address", async () => {
  await withPennyEnv(
    {
      PENNY_API_TOKEN: "secret",
      PENNY_AUTH_MODE: "token",
      PENNY_AUTH_FAILURE_RATE_LIMIT_MAX: "1",
      PENNY_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS: "60000",
      PENNY_RATE_LIMIT_MAX: "0",
    },
    async () => {
      const first = guardApiRequest(apiRequest({ "x-penny-client-ip": "203.0.113.9" }), new URL("http://localhost/api/brain/documents"));
      const second = guardApiRequest(apiRequest({ "x-penny-client-ip": "203.0.113.9" }), new URL("http://localhost/api/brain/documents"));
      const otherClient = guardApiRequest(apiRequest({ "x-penny-client-ip": "203.0.113.10" }), new URL("http://localhost/api/brain/documents"));
      const payload = await errorPayload(second.response);

      assert.equal(first.response?.status, 401);
      assert.equal(second.response?.status, 429);
      assert.equal(second.response?.headers.get("retry-after"), "60");
      assert.equal(payload.error.code, "auth_rate_limited");
      assert.equal(otherClient.response?.status, 401);
    },
  );
});

test("startup env validation rejects unsafe strict deployment config", () => {
  const result = validatePennyStartupEnvironment({
    NODE_ENV: "production",
    PENNY_DEPLOY_ENV: "staging",
    DATABASE_URL: "postgresql://127.0.0.1:5432/penny",
    PENNY_AUTH_MODE: "dev",
    PENNY_API_TOKEN: "short",
    PENNY_SESSION_SECRET: "short",
    PENNY_CORS_ORIGINS: "*",
    PENNY_TRUST_AUTH_HEADERS: "true",
    PENNY_RATE_LIMIT_MAX: "0",
    PENNY_CREATE_MODEL_BACKED: "true",
  });

  assert.equal(result.strict, true);
  assert.deepEqual(
    result.issues.map((issue) => issue.code).sort(),
    [
      "api_token_too_short",
      "auth_mode_token_required",
      "cors_wildcard_forbidden",
      "database_url_local_in_strict_deploy",
      "model_backed_missing_key",
      "rate_limit_required",
      "session_secret_required",
      "trust_auth_headers_forbidden",
    ],
  );
  assert.throws(() => assertValidPennyStartupEnvironment({
    ...validStrictEnv(),
    DATABASE_URL: "not-a-url",
  }), PennyEnvironmentValidationError);
});

test("startup env validation accepts staged token auth with remote Postgres and model config", () => {
  const result = assertValidPennyStartupEnvironment({
    ...validStrictEnv(),
    PENNY_CREATE_MODEL_BACKED: "true",
    XAI_API_KEY: "xai-test-key",
  });

  assert.equal(result.deployTarget, "staging");
  assert.equal(result.strict, true);
  assert.deepEqual(result.issues, []);
});

test("startup env validation rejects database prep bypass in strict deploys", () => {
  const result = validatePennyStartupEnvironment({
    ...validStrictEnv(),
    PENNY_SKIP_DATABASE_PREP: "true",
  });

  assert.equal(result.strict, true);
  assert.ok(result.issues.some((issue) => issue.code === "database_prep_skip_forbidden"));
});

test("startup env validation requires webhook signing key for strict Gmail deploys", () => {
  const strictGmailEnv = {
    ...validStrictEnv(),
    ENABLE_GOOGLE_CONNECTOR: "true",
    ENABLE_GMAIL_CONNECTOR: "true",
    ENABLE_RESTRICTED_GOOGLE_SCOPES: "true",
    NANGO_SECRET_KEY: "nango-secret",
    NANGO_PUBLIC_KEY: "nango-public",
    NANGO_BASE_URL: "https://api.nango.test",
    NANGO_GMAIL_INTEGRATION_ID: "google-gmail-staging",
  };
  const missingKey = validatePennyStartupEnvironment(strictGmailEnv);
  const withKey = assertValidPennyStartupEnvironment({
    ...strictGmailEnv,
    NANGO_WEBHOOK_SIGNING_KEY: "nango-webhook-signing-key",
  });

  assert.equal(missingKey.strict, true);
  assert.ok(missingKey.issues.some((issue) => issue.code === "gmail_webhook_signing_key_required"));
  assert.deepEqual(withKey.issues, []);
});

test("startup env validation allows explicit local in-memory startup without a database", () => {
  const result = assertValidPennyStartupEnvironment({
    NODE_ENV: "development",
    PENNY_DEPLOY_ENV: "local",
    DATABASE_URL: "",
    PENNY_AUTH_MODE: "dev",
    PENNY_SKIP_DATABASE_PREP: "true",
  });

  assert.equal(result.strict, false);
  assert.deepEqual(result.issues, []);
  assert.ok(result.warnings.some((warning) => warning.code === "database_url_missing_dev_fallback"));
});

test("missingPennySchemaTables reports dogfood-critical migration gaps", () => {
  assert.deepEqual(missingPennySchemaTables(requiredPennySchemaTables), []);
  assert.deepEqual(
    missingPennySchemaTables(requiredPennySchemaTables.filter((table) => table !== "create_export_feedback")),
    ["create_export_feedback"],
  );
});

test("startup env validation keeps local dev warnings explicit", () => {
  const result = validatePennyStartupEnvironment({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://127.0.0.1:5432/penny",
    PENNY_AUTH_MODE: "dev",
    PENNY_CREATE_MODEL_BACKED: "false",
  });

  assert.equal(result.deployTarget, "local");
  assert.equal(result.strict, false);
  assert.deepEqual(result.issues, []);
  assert.ok(result.warnings.some((warning) => warning.code === "dev_auth_enabled"));
});

function apiRequest(headers: HeadersInit = {}, method = "GET"): Request {
  return new Request("http://localhost/api/brain/documents", {
    method,
    headers,
  });
}

async function withTestServer(fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const testServer = createPennyServer();

  await new Promise<void>((resolve) => {
    testServer.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = testServer.address();

    assert.ok(address && typeof address === "object");
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      testServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

async function errorPayload(response: Response | undefined): Promise<{ error: { code: string; message: string } }> {
  assert.ok(response);

  return (await response.json()) as { error: { code: string; message: string } };
}

function validStrictEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    PENNY_DEPLOY_ENV: "staging",
    DATABASE_URL: "postgresql://penny:secret@db.example.com:5432/penny?sslmode=require",
    PENNY_AUTH_MODE: "token",
    PENNY_API_TOKEN: "penny-api-token-with-at-least-32-chars",
    PENNY_SESSION_SECRET: "penny-session-secret-with-at-least-32-chars",
    PENNY_CORS_ORIGINS: "https://penny-alpha.example.com",
    PENNY_CREATE_MODEL_BACKED: "false",
  };
}

async function withPennyEnv(env: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const previous = new Map(pennyEnvKeys.map((key) => [key, process.env[key]]));

  for (const key of pennyEnvKeys) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  try {
    await fn();
  } finally {
    for (const key of pennyEnvKeys) {
      const value = previous.get(key);

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
