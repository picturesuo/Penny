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

test("Thinking Mode route smoke flow drives Autopilot state through manual override", async () => {
  const brainId = uuidAt(900);
  const sessionId = uuidAt(101);
  const claimId = uuidAt(202);
  const service = smokeRouteService(brainId, sessionId);

  const initialState = await handleThinkingModeStateRequest(
    new Request(`http://localhost/api/brains/${brainId}/autopilot/state?sessionId=${sessionId}`),
    brainId,
    { service },
  );
  const initialPayload = (await initialState.json()) as SmokeStatePayload;

  assert.equal(initialState.status, 200);
  assert.equal(initialPayload.data.status, "empty");
  assert.equal(initialPayload.data.focusState.source, "none");
  assert.equal(initialPayload.data.candidates.length, 0);

  const tick = await handleThinkingModeTickRequest(
    requestWithBody(`http://localhost/api/brains/${brainId}/autopilot/tick`, { sessionId, limit: 3 }),
    brainId,
    { service },
  );
  const tickPayload = (await tick.json()) as SmokeTickPayload;
  const selectedCandidateId = tickPayload.data.selectedCandidate?.candidateId;

  assert.equal(tick.status, 201);
  assert.equal(tickPayload.data.status, "ready");
  assert.ok(selectedCandidateId);
  assert.equal(tickPayload.data.selectedCandidate?.selected, true);
  assert.equal(tickPayload.data.focusState.source, "autopilot_suggestion");

  const started = await handleStartNextMoveCandidateRequest(
    requestWithBody(`http://localhost/api/next-move-candidates/${encodeURIComponent(selectedCandidateId)}/start`, {
      brainId,
      sessionId,
    }),
    selectedCandidateId,
    { service },
  );
  const startedPayload = (await started.json()) as SmokeStartPayload;

  assert.equal(started.status, 201);
  assert.equal(startedPayload.data.status, "started");
  assert.equal(startedPayload.data.focusState.source, "autopilot_started");
  assert.equal(startedPayload.data.focusState.paused, false);
  assert.equal(startedPayload.data.move.kind, "autopilot_focus_started");

  const startedState = await handleThinkingModeStateRequest(
    new Request(`http://localhost/api/brains/${brainId}/autopilot/state?sessionId=${sessionId}`),
    brainId,
    { service },
  );
  const startedStatePayload = (await startedState.json()) as SmokeStatePayload;

  assert.equal(startedStatePayload.data.focusState.source, "autopilot_started");
  assert.equal(startedStatePayload.data.focusState.paused, false);

  const manual = await handleManualFocusRequest(
    requestWithBody(`http://localhost/api/brains/${brainId}/focus/manual`, {
      sessionId,
      claimId,
      reason: "Inspect the founder willingness-to-pay assumption first.",
    }),
    brainId,
    { service },
  );
  const manualPayload = (await manual.json()) as SmokeManualPayload;

  assert.equal(manual.status, 201);
  assert.equal(manualPayload.data.status, "paused");
  assert.equal(manualPayload.data.focusState.source, "manual_selection");
  assert.equal(manualPayload.data.focusState.paused, true);
  assert.equal(manualPayload.data.move.kind, "manual_node_selected");
  assert.equal(manualPayload.data.move.payload.pauseAutopilot, true);

  const manualState = await handleThinkingModeStateRequest(
    new Request(`http://localhost/api/brains/${brainId}/autopilot/state?sessionId=${sessionId}`),
    brainId,
    { service },
  );
  const manualStatePayload = (await manualState.json()) as SmokeStatePayload;

  assert.equal(manualStatePayload.data.status, "paused");
  assert.equal(manualStatePayload.data.focusState.source, "manual_selection");
  assert.equal(manualStatePayload.data.focusState.paused, true);
  assert.equal(service.moves.some((move) => move.kind === "manual_node_selected"), true);
});

test("thinking mode routes return clear validation and domain errors", async () => {
  const invalid = await handleThinkingModeTickRequest(
    requestWithBody(`http://localhost/api/brains/${uuidAt(900)}/autopilot/tick`, { sessionId: "not-a-uuid" }),
    uuidAt(900),
    { service: routeService([]) },
  );
  const missingSession = await handleThinkingModeStateRequest(
    new Request(`http://localhost/api/brains/${uuidAt(900)}/autopilot/state`),
    uuidAt(900),
    { service: routeService([]) },
  );
  const invalidCandidateCalls: string[] = [];
  const invalidCandidate = await handleStartNextMoveCandidateRequest(
    requestWithBody(`http://localhost/api/next-move-candidates/%20/start`, {
      brainId: uuidAt(900),
      sessionId: uuidAt(101),
    }),
    " ",
    { service: routeService(invalidCandidateCalls) },
  );
  const invalidClaimCalls: string[] = [];
  const invalidClaim = await handleManualFocusRequest(
    requestWithBody(`http://localhost/api/brains/${uuidAt(900)}/focus/manual`, {
      sessionId: uuidAt(101),
      claimId: "not-a-uuid",
    }),
    uuidAt(900),
    { service: routeService(invalidClaimCalls) },
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
  const missingSessionPayload = (await missingSession.json()) as { error: { code: string; issues: string[] } };
  const invalidCandidatePayload = (await invalidCandidate.json()) as { error: { code: string; issues: string[] } };
  const invalidClaimPayload = (await invalidClaim.json()) as { error: { code: string; issues: string[] } };
  const notFoundPayload = (await notFound.json()) as { error: { code: string; message: string } };

  assert.equal(invalid.status, 400);
  assert.equal(invalidPayload.error.code, "invalid_request");
  assert.match(invalidPayload.error.issues.join("\n"), /sessionId/);
  assert.equal(missingSession.status, 400);
  assert.equal(missingSessionPayload.error.code, "invalid_request");
  assert.match(missingSessionPayload.error.issues.join("\n"), /sessionId/);
  assert.equal(invalidCandidate.status, 400);
  assert.equal(invalidCandidatePayload.error.code, "invalid_request");
  assert.match(invalidCandidatePayload.error.issues.join("\n"), /candidateId/);
  assert.deepEqual(invalidCandidateCalls, []);
  assert.equal(invalidClaim.status, 400);
  assert.equal(invalidClaimPayload.error.code, "invalid_request");
  assert.match(invalidClaimPayload.error.issues.join("\n"), /claimId/);
  assert.deepEqual(invalidClaimCalls, []);
  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "thinking_mode_not_found");
  assert.match(notFoundPayload.error.message, /not found/);
});

type SmokeStatePayload = {
  data: {
    status: string;
    focusState: { source: string; paused: boolean };
    candidates: Array<{ candidateId: string }>;
    selectedCandidate: { candidateId: string; selected: boolean } | null;
  };
};

type SmokeTickPayload = {
  data: SmokeStatePayload["data"] & {
    move: { kind: string };
  };
};

type SmokeStartPayload = {
  data: {
    status: string;
    focusState: { source: string; paused: boolean };
    move: { kind: string; payload: Record<string, unknown> };
  };
};

type SmokeManualPayload = SmokeStartPayload;

function smokeRouteService(brainId: string, sessionId: string): ThinkingModeRouteService & { moves: ReturnType<typeof moveDto>[] } {
  const moves: ReturnType<typeof moveDto>[] = [];
  let currentFocusState = focusState(sessionId, "none", false);
  let candidates: ReturnType<typeof candidateDto>[] = [];
  let selectedCandidate: ReturnType<typeof candidateDto> | null = null;

  return {
    moves,
    async getState(requestBrainId, requestSessionId) {
      assert.equal(requestBrainId, brainId);
      assert.equal(requestSessionId, sessionId);

      return {
        status: currentFocusState.paused ? "paused" : candidates.length > 0 ? "ready" : "empty",
        brainId,
        sessionId,
        focusState: currentFocusState,
        candidates,
        selectedCandidate,
      };
    },
    async tick(input) {
      assert.equal(input.brainId, brainId);
      assert.equal(input.sessionId, sessionId);
      assert.equal(input.limit, 3);
      selectedCandidate = candidateDto(sessionId);
      candidates = [selectedCandidate];
      currentFocusState = focusState(sessionId, "autopilot_suggestion", false);

      const move = moveDto(sessionId, "next_move_recomputed", {
        selectedCandidateId: selectedCandidate.candidateId,
      });
      moves.push(move);

      return {
        status: "ready",
        brainId,
        sessionId,
        focusState: currentFocusState,
        candidates,
        selectedCandidate,
        graphHash: selectedCandidate.graphHash,
        persistedMoveIds: [move.id],
        move,
      };
    },
    async startCandidate(input) {
      assert.equal(input.brainId, brainId);
      assert.equal(input.sessionId, sessionId);

      const candidate = candidates.find(
        (item) => item.id === input.candidateId || item.candidateId === input.candidateId || item.fingerprint === input.candidateId,
      );

      if (!candidate) {
        throw new ThinkingModeNotFoundError("Next move candidate was not found for this session.");
      }

      selectedCandidate = candidate;
      currentFocusState = focusState(sessionId, "autopilot_started", false);

      const move = moveDto(sessionId, "autopilot_focus_started", {
        candidateId: candidate.candidateId,
        targetClaimId: candidate.targetClaimId,
      });
      moves.push(move);

      return {
        status: "started",
        brainId,
        sessionId,
        focusState: currentFocusState,
        selectedCandidate: candidate,
        move,
      };
    },
    async manualFocus(input) {
      assert.equal(input.brainId, brainId);
      assert.equal(input.sessionId, sessionId);
      assert.equal(input.claimId, uuidAt(202));

      currentFocusState = focusState(sessionId, "manual_selection", true);

      const move = moveDto(sessionId, "manual_node_selected", {
        claimId: input.claimId,
        pauseAutopilot: true,
        reason: input.reason ?? null,
      });
      moves.push(move);

      return {
        status: "paused",
        brainId,
        sessionId,
        focusState: currentFocusState,
        focusClaim: {
          id: input.claimId,
          versionId: uuidAt(702),
          kind: "assumption",
          status: "exploratory",
          text: "Founders will use structured thinking guidance.",
          confidence: 42,
        },
        move,
      };
    },
  };
}

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

function moveDto(sessionId: string, kind: string, payload: Record<string, unknown> = {}) {
  return {
    id: uuidAt(601),
    sessionId,
    kind,
    summary: `Created ${kind}.`,
    payload,
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
