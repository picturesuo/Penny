import assert from "node:assert/strict";
import test from "node:test";
import { processEphemeralContext } from "./context-layer.ts";
import { contextMemoryAuditEvent } from "./context-layer-repository.ts";

test("contextMemoryAuditEvent distinguishes blocked sources from extracted memory", () => {
  const blocked = processEphemeralContext({
    provider: "manual",
    sourceUri: "manual:blocked-source",
    label: "Blocked source",
    text: "Do not ingest: private payroll export. I think this should never become memory.",
  });
  const extracted = processEphemeralContext({
    provider: "manual",
    sourceUri: "manual:idea",
    label: "Idea",
    text: "I think Penny should remember source-backed founder goals.",
  });

  assert.equal(contextMemoryAuditEvent(blocked), "memory.blocked");
  assert.equal(contextMemoryAuditEvent(extracted), "memory.extracted");
});
