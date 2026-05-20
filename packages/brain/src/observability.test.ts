import assert from "node:assert/strict";
import test from "node:test";
import { emitPennyLog, safeLogPayload, setPennyLogSinkForTests, type PennyLogEvent } from "./observability.ts";

test("safeLogPayload removes raw private text-shaped fields", () => {
  const safe = safeLogPayload({
    sourceId: "source-1",
    contentLength: 123,
    rawText: "private source text",
    prompt: "private prompt",
    query: "private retrieval query",
    token: "secret-token",
    resultCount: 2,
  });

  assert.deepEqual(safe, {
    sourceId: "source-1",
    contentLength: 123,
    resultCount: 2,
  });
});

test("emitPennyLog is enabled for strict deploy envs and uses the safe payload", () => {
  const events: PennyLogEvent[] = [];

  setPennyLogSinkForTests((event) => events.push(event));
  try {
    emitPennyLog(
      "brain.import",
      {
        status: "completed",
        sourceId: "source-1",
        contentLength: 123,
        rawContent: "private import text",
      },
      {
        env: {
          PENNY_DEPLOY_ENV: "staging",
        },
      },
    );
  } finally {
    setPennyLogSinkForTests(null);
  }

  assert.equal(events.length, 1);
  assert.equal(events[0]?.event, "brain.import");
  assert.equal(events[0]?.payload.sourceId, "source-1");
  assert.equal(events[0]?.payload.contentLength, 123);
  assert.equal("rawContent" in (events[0]?.payload ?? {}), false);
});

test("emitPennyLog stays quiet in local env unless enabled", () => {
  const events: PennyLogEvent[] = [];

  setPennyLogSinkForTests((event) => events.push(event));
  try {
    emitPennyLog("create.generate", { providerMode: "deterministic" }, { env: { NODE_ENV: "development" } });
    emitPennyLog("create.generate", { providerMode: "deterministic" }, { env: { PENNY_STRUCTURED_LOGS: "true" } });
  } finally {
    setPennyLogSinkForTests(null);
  }

  assert.equal(events.length, 1);
  assert.equal(events[0]?.event, "create.generate");
});
