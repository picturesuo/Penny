import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverSource = new URL("./server.ts", import.meta.url);
const clientSource = new URL("../frontend/src/api/brainClient.ts", import.meta.url);

test("P3 cleanup preserves active session-scoped public routes", async () => {
  const server = await normalizedSource(serverSource);

  assertSourceIncludes(server, 'url.pathname === "/api/brain/search"', "Brain hybrid search route");
  assertSourceIncludes(server, "^/api/sessions/([^/]+)/canvas$", "session canvas route");
  assertSourceIncludes(server, "^/api/sessions/([^/]+)/cockpit$", "session cockpit route");
  assertSourceIncludes(server, "^/api/sessions/([^/]+)/autopilot/state$", "session Autopilot state route");
  assertSourceIncludes(server, "^/api/sessions/([^/]+)/autopilot/tick$", "session Autopilot tick route");
  assertSourceIncludes(
    server,
    "^/api/sessions/([^/]+)/next-move-candidates/([^/]+)/start$",
    "session start-candidate route",
  );
  assertSourceIncludes(
    server,
    "^/api/sessions/([^/]+)/next-move-candidates/([^/]+)/challenge$",
    "session issue-challenge route",
  );
  assertSourceIncludes(server, "^/api/sessions/([^/]+)/focus/manual$", "session manual focus route");
  assertSourceIncludes(server, "^/api/challenges/([^/]+)/respond$", "challenge response route");
  assertSourceIncludes(server, "^/api/sessions/([^/]+)/challenge-brief$", "session Challenge Brief route");
});

test("P3 cleanup keeps compatibility aliases until a focused deletion pass removes them", async () => {
  const server = await normalizedSource(serverSource);

  assertSourceIncludes(server, 'url.pathname === "/autopilot/tick"', "legacy Autopilot tick alias");
  assertSourceIncludes(server, 'url.pathname === "/autopilot/select-node"', "legacy manual-selection alias");
  assertSourceIncludes(server, "^/api/brains/([^/]+)/autopilot/state$", "legacy brain-scoped state alias");
  assertSourceIncludes(server, "^/api/brains/([^/]+)/autopilot/tick$", "legacy brain-scoped tick alias");
  assertSourceIncludes(server, "^/api/brains/([^/]+)/focus/manual$", "legacy brain-scoped manual-focus alias");
  assertSourceIncludes(server, 'url.pathname === "/brain/challenge"', "legacy challenge issue route");
  assertSourceIncludes(server, 'url.pathname === "/brain/challenge/respond"', "legacy challenge response route");
  assertSourceIncludes(server, 'url.pathname === "/brain/artifact"', "legacy artifact route");
  assertSourceIncludes(server, "^/brain/session/([^/]+)/artifact$", "legacy session artifact route");
});

test("frontend Thinking Mode client stays on session-scoped routes during cleanup", async () => {
  const client = await normalizedSource(clientSource);

  assertSourceIncludes(client, "/api/sessions/${encodeURIComponent(sessionId)}/cockpit", "cockpit client route");
  assertSourceIncludes(
    client,
    "/api/sessions/${encodeURIComponent(sessionId)}/autopilot/tick",
    "Autopilot tick client route",
  );
  assertSourceIncludes(
    client,
    "/api/sessions/${encodeURIComponent(sessionId)}/next-move-candidates/${encodeURIComponent(candidateId)}/start",
    "start-candidate client route",
  );
  assertSourceIncludes(
    client,
    "/api/sessions/${encodeURIComponent(input.sessionId)}/focus/manual",
    "manual-focus client route",
  );
  assertSourceIncludes(
    client,
    "/api/sessions/${encodeURIComponent(sessionId)}/next-move-candidates/${encodeURIComponent(candidateId)}/challenge",
    "issue-challenge client route",
  );
  assertSourceIncludes(client, "/api/challenges/${encodeURIComponent(input.challengeId)}/respond", "challenge response client route");
  assertSourceIncludes(
    client,
    "/api/sessions/${encodeURIComponent(sessionId)}/challenge-brief",
    "Challenge Brief client route",
  );
  assert.equal(client.includes("fetch(`/autopilot/tick"), false, "frontend client must not return to legacy Autopilot tick");
  assert.equal(client.includes("/api/brains/"), false, "frontend client must not return to brain-scoped aliases");
});

async function normalizedSource(url: URL): Promise<string> {
  return (await readFile(url, "utf8")).replaceAll("\\/", "/");
}

function assertSourceIncludes(source: string, expected: string, label: string): void {
  assert.ok(source.includes(expected), `${label} missing: ${expected}`);
}
