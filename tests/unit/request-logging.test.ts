import assert from "node:assert/strict";
import test from "node:test";

import { buildRequestLogEntry, getRequestId, logRequest } from "../../apps/web/lib/request-logging.ts";

test("buildRequestLogEntry creates a structured request log without body data", () => {
  const request = new Request("http://localhost/api/workspace/brain?mode=demo", {
    method: "GET",
  });
  const entry = buildRequestLogEntry(request, "request-123", new Date("2026-04-24T12:00:00.000Z"));

  assert.deepEqual(entry, {
    type: "request",
    method: "GET",
    path: "/api/workspace/brain?mode=demo",
    requestId: "request-123",
    timestamp: "2026-04-24T12:00:00.000Z",
  });
});

test("getRequestId reuses an incoming x-request-id when present", () => {
  const headers = new Headers({
    "x-request-id": " incoming-request ",
  });

  assert.equal(getRequestId(headers), "incoming-request");
});

test("logRequest writes a JSON request entry", () => {
  const request = new Request("http://localhost/health", {
    method: "GET",
  });
  const originalInfo = console.info;
  const messages: string[] = [];

  console.info = (message?: unknown) => {
    messages.push(String(message));
  };

  try {
    const entry = logRequest(request, "health-request", new Date("2026-04-24T12:01:00.000Z"));

    assert.deepEqual(entry, {
      type: "request",
      method: "GET",
      path: "/health",
      requestId: "health-request",
      timestamp: "2026-04-24T12:01:00.000Z",
    });
    assert.deepEqual(messages.map((message) => JSON.parse(message)), [entry]);
  } finally {
    console.info = originalInfo;
  }
});
