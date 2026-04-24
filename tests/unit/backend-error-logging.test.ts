import assert from "node:assert/strict";
import test from "node:test";

import { buildBackendErrorLogEntry, logBackendError } from "../../apps/web/lib/backend-error-logging.ts";

test("buildBackendErrorLogEntry creates a structured backend error log", () => {
  const error = new Error("Database connection failed.");
  error.name = "DatabaseError";
  const request = new Request("http://localhost/api/workspace/brain?mode=brain", {
    method: "GET",
    headers: {
      "x-request-id": "request-123",
    },
  });

  const entry = buildBackendErrorLogEntry({
    error,
    request,
    route: "GET /api/workspace/brain",
    now: new Date("2026-04-24T12:02:00.000Z"),
  });

  assert.equal(entry.type, "backend_error");
  assert.equal(entry.route, "GET /api/workspace/brain");
  assert.equal(entry.method, "GET");
  assert.equal(entry.path, "/api/workspace/brain?mode=brain");
  assert.equal(entry.requestId, "request-123");
  assert.equal(entry.errorName, "DatabaseError");
  assert.equal(entry.errorMessage, "Database connection failed.");
  assert.equal(entry.timestamp, "2026-04-24T12:02:00.000Z");
  assert.equal(typeof entry.errorStack, "string");
});

test("logBackendError writes a JSON backend error entry", () => {
  const request = new Request("http://localhost/api/commands/maps/create", {
    method: "POST",
  });
  const originalError = console.error;
  const messages: string[] = [];

  console.error = (message?: unknown) => {
    messages.push(String(message));
  };

  try {
    const entry = logBackendError({
      error: "Unexpected failure",
      request,
      route: "POST /api/commands/maps/create",
      now: new Date("2026-04-24T12:03:00.000Z"),
    });

    assert.deepEqual(entry, {
      type: "backend_error",
      route: "POST /api/commands/maps/create",
      method: "POST",
      path: "/api/commands/maps/create",
      requestId: null,
      errorName: "NonError",
      errorMessage: "Unexpected failure",
      timestamp: "2026-04-24T12:03:00.000Z",
    });
    assert.deepEqual(messages.map((message) => JSON.parse(message)), [entry]);
  } finally {
    console.error = originalError;
  }
});
