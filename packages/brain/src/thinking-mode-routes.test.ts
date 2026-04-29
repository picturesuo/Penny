import assert from "node:assert/strict";
import test from "node:test";
import {
  handleManualFocusRequest,
  handleStartNextMoveCandidateRequest,
  handleThinkingModeStateRequest,
  handleThinkingModeTickRequest,
  type ThinkingModeRouteService,
} from "./routes/thinking-mode-routes.ts";
import type {
  ManualFocusInput,
  StartNextMoveInput,
  ThinkingModeTickInput,
} from "./services/thinking-mode-service.ts";
import { ThinkingModeNotFoundError } from "./services/thinking-mode-service.ts";

test("GET /api/brains/:brainId/autopilot/state is read-only", async () => {
  const calls: string[] = [];
  const service = routeService(calls);
  const response = await handleThinkingModeStateRequest(
    new Request(`http://localhost/api/brains/${uuidAt(900)}/autopilot/state?sessionId=${uuidAt(101)}`),
    uuidAt(900),
    { service },
  );
  const payload = (await response.json()) as { data: { status: string; candidates: unknown[] } };

  assert.equal(response.status, 200);
  assert.equal(payload.data.status, "empty");
  assert.deepEqual(calls, ["getState"]);
});

test("GET state rejects non-GET before service calls", async () => {
  const calls: string[] = [];
  const response = await handleThinkingModeStateRequest(
    requestWithBody(`http://localhost/api/brains/${uuidAt(900)}/autopilot/state?sessionId=${uuidAt(101)}`, {}),
    uuidAt(900),
    { service: routeService(calls) },
  );
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
  assert.equal(payload.error.code, "method_not_allowed");
  assert.deepEqual(calls, []);
});

test("POST /api/brains/:brainId/autopilot/tick returns persisted candidate contract", async () => {
  const ticked: ThinkingModeTickInput[] = [];
  const response = await handleThinkingModeTickRequest(
    requestWithBody(`http://localhost/api/brains/${uuidAt(900)}/autopilot/tick`, {
      sessionId: uuidAt(101),
      limit: 2,
    }),
    uuidAt(900),
    {
      service: routeService([], {
        async tick(input) {
          ticked.push(input);
          return tickResponse(input.brainId, input.sessionId);
        },
      }),
    },
  );
  const payload = (await response.json()) as {
    data: {
      status: string;
      candidates: Array<{ targetClaimId: string; scoreBreakdown: { leverage: number }; provenance: { graphHash: string } }>;
      move: { kind: string };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(ticked[0]?.brainId, uuidAt(900));
  assert.equal(ticked[0]?.sessionId, uuidAt(101));
  assert.equal(ticked[0]?.limit, 2);
  assert.equal(payload.data.status, "ready");
  assert.equal(payload.data.candidates[0]?.targetClaimId, uuidAt(202));
  assert.equal(payload.data.candidates[0]?.scoreBreakdown.leverage, 300);
  assert.equal(payload.data.candidates[0]?.provenance.graphHash, "graph_hash");
  assert.equal(payload.data.move.kind, "next_move_recomputed");
});

test("POST /api/next-move-candidates/:candidateId/start starts the selected focus", async () => {
  const started: StartNextMoveInput[] = [];
  const response = await handleStartNextMoveCandidateRequest(
    requestWithBody(`http://localhost/api/next-move-candidates/${encodeURIComponent("next_candidate")}/start`, {
      brainId: uuidAt(900),
      sessionId: uuidAt(101),
    }),
    "next_candidate",
    {
      service: routeService([], {
        async startCandidate(input) {
          started.push(input);
          return startResponse(input.brainId, input.sessionId, input.candidateId);
        },
      }),
    },
  );
  const payload = (await response.json()) as {
    data: { status: string; focusState: { source: string; paused: boolean }; move: { kind: string } };
  };

  assert.equal(response.status, 201);
  assert.equal(started[0]?.candidateId, "next_candidate");
  assert.equal(payload.data.status, "started");
  assert.equal(payload.data.focusState.source, "autopilot_started");
  assert.equal(payload.data.focusState.paused, false);
  assert.equal(payload.data.move.kind, "autopilot_focus_started");
});

test("POST /api/brains/:brainId/focus/manual creates manual pause response", async () => {
  const manual: ManualFocusInput[] = [];
  const response = await handleManualFocusRequest(
    requestWithBody(`http://localhost/api/brains/${uuidAt(900)}/focus/manual`, {
      sessionId: uuidAt(101),
      claimId: uuidAt(202),
      reason: "Inspect this assumption first.",
    }),
    uuidAt(900),
    {
      service: routeService([], {
        async manualFocus(input) {
          manual.push(input);
          return manualResponse(input.brainId, input.sessionId, input.claimId);
        },
      }),
    },
  );
  const payload = (await response.json()) as {
    data: { status: string; focusState: { source: string; paused: boolean }; move: { kind: string } };
  };

  assert.equal(response.status, 201);
  assert.equal(manual[0]?.claimId, uuidAt(202));
  assert.equal(payload.data.status, "paused");
  assert.equal(payload.data.focusState.source, "manual_selection");
  assert.equal(payload.data.focusState.paused, true);
  assert.equal(payload.data.move.kind, "manual_node_selected");
});

test("thinking mode routes return clear validation and domain errors", async () => {
  const invalid = await handleThinkingModeTickRequest(
    requestWithBody(`http://localhost/api/brains/${uuidAt(900)}/autopilot/tick`, { sessionId: "not-a-uuid" }),
    uuidAt(900),
    { service: routeService([]) },
  );
  const notFound = await handleStartNextMoveCandidateRequest(
    requestWithBody(`http://localhost/api/next-move-candidates/missing/start`, {
      brainId: uuidAt(900),
      sessionId: uuidAt(101),
    }),
    "missing",
    {
      service: routeService([], {
        async startCandidate() {
          throw new ThinkingModeNotFoundError("Next move candidate was not found for this session.");
        },
      }),
    },
  );
  const invalidPayload = (await invalid.json()) as { error: { code: string; issues: string[] } };
  const notFoundPayload = (await notFound.json()) as { error: { code: string; message: string } };

  assert.equal(invalid.status, 400);
  assert.equal(invalidPayload.error.code, "invalid_request");
  assert.match(invalidPayload.error.issues.join("\n"), /sessionId/);
  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "thinking_mode_not_found");
  assert.match(notFoundPayload.error.message, /not found/);
});

function routeService(calls: string[], overrides: Partial<ThinkingModeRouteService> = {}): ThinkingModeRouteService {
  return {
    async getState(brainId, sessionId) {
      calls.push("getState");
      return stateResponse(brainId, sessionId);
    },
    async tick(input) {
      calls.push("tick");
      return tickResponse(input.brainId, input.sessionId);
    },
    async startCandidate(input) {
      calls.push("startCandidate");
      return startResponse(input.brainId, input.sessionId, input.candidateId);
    },
    async manualFocus(input) {
      calls.push("manualFocus");
      return manualResponse(input.brainId, input.sessionId, input.claimId);
    },
    ...overrides,
  };
}

function stateResponse(brainId: string, sessionId: string) {
  return {
    status: "empty" as const,
    brainId,
    sessionId,
    focusState: focusState(sessionId, "none", false),
    candidates: [],
    selectedCandidate: null,
  };
}

function tickResponse(brainId: string, sessionId: string) {
  const candidate = candidateDto(sessionId);

  return {
    status: "ready" as const,
    brainId,
    sessionId,
    focusState: focusState(sessionId, "autopilot_suggestion", false),
    candidates: [candidate],
    selectedCandidate: candidate,
    graphHash: "graph_hash",
    persistedMoveIds: [uuidAt(601)],
    move: moveDto(sessionId, "next_move_recomputed"),
  };
}

function startResponse(brainId: string, sessionId: string, candidateId: string) {
  return {
    status: "started" as const,
    brainId,
    sessionId,
    focusState: focusState(sessionId, "autopilot_started", false),
    selectedCandidate: {
      ...candidateDto(sessionId),
      candidateId,
    },
    move: moveDto(sessionId, "autopilot_focus_started"),
  };
}

function manualResponse(brainId: string, sessionId: string, claimId: string) {
  return {
    status: "paused" as const,
    brainId,
    sessionId,
    focusState: focusState(sessionId, "manual_selection", true),
    focusClaim: {
      id: claimId,
      versionId: uuidAt(702),
      kind: "assumption",
      status: "exploratory",
      text: "Founders will use structured thinking guidance.",
      confidence: 42,
    },
    move: moveDto(sessionId, "manual_node_selected"),
  };
}

function candidateDto(sessionId: string) {
  return {
    id: uuidAt(801),
    candidateId: "next_candidate",
    fingerprint: "fingerprint_123",
    rank: 1,
    targetClaimId: uuidAt(202),
    targetEdgeId: uuidAt(302),
    action: "challenge" as const,
    mode: "challenge" as const,
    score: 920,
    reason: "Challenge the load-bearing market assumption.",
    reasonCodes: ["load_bearing"],
    exitCriteria: {
      label: "Issue a challenge.",
      acceptedMoveKinds: ["challenge_issued"],
    },
    scoreBreakdown: {
      leverage: 300,
      fragility: 200,
      stakes: 120,
      readiness: 100,
      momentum: 90,
      novelty: 110,
      shape: 0,
      penalties: 0,
    },
    graphHash: "graph_hash",
    provenance: {
      engine: "thinking-mode-next-move-v1" as const,
      graphHash: "graph_hash",
      source: "thinking_graph_snapshot" as const,
      ruleIds: ["challenge"],
      claimIds: [uuidAt(202)],
      edgeIds: [uuidAt(302)],
      moveIds: [uuidAt(503)],
      artifactIds: [],
    },
    selected: true,
    selectedAt: "2026-04-29T00:00:09.000Z",
    sessionId,
  };
}

function focusState(sessionId: string, source: "none" | "autopilot_suggestion" | "autopilot_started" | "manual_selection", paused: boolean) {
  return {
    sessionId,
    mode: "challenge" as const,
    focusedClaimId: source === "none" ? null : uuidAt(202),
    focusedEdgeId: source === "none" ? null : uuidAt(302),
    source,
    suggestionMoveId: source === "none" ? null : uuidAt(601),
    manualMoveId: source === "manual_selection" ? uuidAt(602) : null,
    paused,
    reason: source === "none" ? null : "Focus changed.",
    updatedAt: source === "none" ? null : "2026-04-29T00:00:09.000Z",
  };
}

function moveDto(sessionId: string, kind: string) {
  return {
    id: uuidAt(601),
    sessionId,
    kind,
    summary: `Created ${kind}.`,
    payload: {},
    createdAt: "2026-04-29T00:00:10.000Z",
  };
}

function requestWithBody(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
