import assert from "node:assert/strict";
import test from "node:test";
import { guardApiRequest } from "./server.ts";

const pennyEnvKeys = [
  "NODE_ENV",
  "PENNY_API_TOKEN",
  "PENNY_AUTH_MODE",
  "PENNY_AUTH_PROJECT_ID",
  "PENNY_AUTH_SPHERE_ID",
  "PENNY_AUTH_USER_ID",
  "PENNY_AUTH_WORKSPACE_ID",
  "PENNY_CORS_ORIGINS",
  "PENNY_RATE_LIMIT_MAX",
  "PENNY_RATE_LIMIT_WINDOW_MS",
  "PENNY_TRUST_AUTH_HEADERS",
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

function apiRequest(headers: HeadersInit = {}, method = "GET"): Request {
  return new Request("http://localhost/api/brain/documents", {
    method,
    headers,
  });
}

async function errorPayload(response: Response | undefined): Promise<{ error: { code: string; message: string } }> {
  assert.ok(response);

  return (await response.json()) as { error: { code: string; message: string } };
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
