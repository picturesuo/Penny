import assert from "node:assert/strict";
import test from "node:test";
import {
  handleChallengeRoundRespondRequest,
  handleIssueChallengeFromCandidateRequest,
  handleManualFocusRequest,
  handleStartNextMoveCandidateRequest,
  handleThinkingModeStateRequest,
  handleThinkingModeTickRequest,
  type ChallengeRoundRouteService,
  type ThinkingModeRouteService,
} from "./routes/thinking-mode-routes.ts";
import type {
  ManualFocusInput,
  StartNextMoveInput,
  ThinkingModeTickInput,
} from "./services/thinking-mode-service.ts";
import { ThinkingModeNotFoundError } from "./services/thinking-mode-service.ts";
import type { IssueChallengeFromCandidateInput, RespondToChallengeInput } from "./services/challenge-service.ts";
import { ChallengeRoundConflictError, ChallengeRoundNotFoundError } from "./services/challenge-service.ts";

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

test("GET /api/brains/:brainId/autopilot/state covers invalid, empty, and seeded session states", async () => {
  const brainId = uuidAt(900);
  const emptySessionId = uuidAt(101);
  const seededSessionId = uuidAt(102);
  const invalidSessionId = uuidAt(999);
  const calls: string[] = [];
  const service = routeService(calls, {
    async getState(requestBrainId, requestSessionId) {
      calls.push(`getState:${requestSessionId}`);
      assert.equal(requestBrainId, brainId);

      if (requestSessionId === invalidSessionId) {
        throw new ThinkingModeNotFoundError("Session was not found.");
      }

      if (requestSessionId === seededSessionId) {
        const candidate = candidateDto(seededSessionId);

        return {
          status: "ready",
          brainId: requestBrainId,
          sessionId: requestSessionId,
          focusState: focusState(requestSessionId, "autopilot_suggestion", false),
          candidates: [candidate],
          selectedCandidate: candidate,
        };
      }

      return stateResponse(requestBrainId, requestSessionId);
    },
  });

  const empty = await handleThinkingModeStateRequest(
    new Request(`http://localhost/api/brains/${brainId}/autopilot/state?sessionId=${emptySessionId}`),
    brainId,
    { service },
  );
  const seeded = await handleThinkingModeStateRequest(
    new Request(`http://localhost/api/brains/${brainId}/autopilot/state?sessionId=${seededSessionId}`),
    brainId,
    { service },
  );
  const invalid = await handleThinkingModeStateRequest(
    new Request(`http://localhost/api/brains/${brainId}/autopilot/state?sessionId=${invalidSessionId}`),
    brainId,
    { service },
  );
  const emptyPayload = (await empty.json()) as SmokeStatePayload;
  const seededPayload = (await seeded.json()) as SmokeStatePayload;
  const invalidPayload = (await invalid.json()) as { error: { code: string; message: string } };

  assert.equal(empty.status, 200);
  assert.equal(emptyPayload.data.status, "empty");
  assert.equal(emptyPayload.data.focusState.source, "none");
  assert.equal(emptyPayload.data.candidates.length, 0);
  assert.equal(seeded.status, 200);
  assert.equal(seededPayload.data.status, "ready");
  assert.equal(seededPayload.data.focusState.source, "autopilot_suggestion");
  assert.equal(seededPayload.data.candidates[0]?.candidateId, "next_candidate");
  assert.equal(seededPayload.data.selectedCandidate?.selected, true);
  assert.equal(invalid.status, 404);
  assert.equal(invalidPayload.error.code, "thinking_mode_not_found");
  assert.match(invalidPayload.error.message, /not found/i);
  assert.deepEqual(calls, [
    `getState:${emptySessionId}`,
    `getState:${seededSessionId}`,
    `getState:${invalidSessionId}`,
  ]);
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

test("POST /api/next-move-candidates/:candidateId/challenge issues a ChallengeRound", async () => {
  const issued: IssueChallengeFromCandidateInput[] = [];
  const response = await handleIssueChallengeFromCandidateRequest(
    requestWithBody(`http://localhost/api/next-move-candidates/${encodeURIComponent("next_candidate")}/challenge`, {
      brainId: uuidAt(900),
      sessionId: uuidAt(101),
    }),
    "next_candidate",
    {
      service: challengeRouteService({
        async issueChallengeFromCandidate(input) {
          issued.push(input);
          return challengeIssueResponse(input.brainId, input.sessionId);
        },
      }),
    },
  );
  const payload = (await response.json()) as {
    data: {
      status: string;
      challengeRound: { status: string };
      failureType: string;
      strength: string;
      whyThis: string;
      move: { kind: string };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(issued[0]?.candidateId, "next_candidate");
  assert.equal(issued[0]?.brainId, uuidAt(900));
  assert.equal(payload.data.status, "issued");
  assert.equal(payload.data.challengeRound.status, "open");
  assert.equal(payload.data.failureType, "shaky_assumption");
  assert.equal(payload.data.strength, "strong");
  assert.match(payload.data.whyThis, /willingness to pay/);
  assert.equal(payload.data.move.kind, "challenge_issued");
});

test("POST /api/challenges/:challengeId/respond supports Defend Revise Absorb and completes focus", async () => {
  const responses: RespondToChallengeInput[] = [];
  const service = challengeRouteService({
    async respondToChallenge(input) {
      responses.push(input);
      return challengeRespondResponse(input);
    },
  });

  const defend = await handleChallengeRoundRespondRequest(
    requestWithBody(`http://localhost/api/challenges/${uuidAt(901)}/respond`, {
      response: "defend",
      reasoning: "The critique ignores paid urgent founder moments.",
    }),
    uuidAt(901),
    { service },
  );
  const revise = await handleChallengeRoundRespondRequest(
    requestWithBody(`http://localhost/api/challenges/${uuidAt(902)}/respond`, {
      response: "revise",
      revisedText: "Pre-seed founders will pay when Penny produces a fundraising or decision artifact immediately.",
      reasoning: "The broader claim was too loose.",
    }),
    uuidAt(902),
    { service },
  );
  const absorb = await handleChallengeRoundRespondRequest(
    requestWithBody(`http://localhost/api/challenges/${uuidAt(903)}/respond`, {
      response: "absorb",
      reasoning: "This remains a live market risk.",
    }),
    uuidAt(903),
    { service },
  );
  const defendPayload = (await defend.json()) as ChallengeRespondPayload;
  const revisePayload = (await revise.json()) as ChallengeRespondPayload;
  const absorbPayload = (await absorb.json()) as ChallengeRespondPayload;

  assert.equal(defend.status, 200);
  assert.equal(revise.status, 200);
  assert.equal(absorb.status, 200);
  assert.equal(responses[0]?.response, "defend");
  assert.equal(responses[1]?.response, "revise");
  assert.equal(responses[2]?.response, "absorb");
  assert.equal(defendPayload.data.move.kind, "user_defended");
  assert.equal(revisePayload.data.move.kind, "claim_revised");
  assert.equal(absorbPayload.data.move.kind, "critique_absorbed");
  assert.equal(defendPayload.data.focusCompletedMove.kind, "focus_completed");
  assert.equal(revisePayload.data.receipt.claimTextChanged, true);
  assert.equal(revisePayload.data.receipt.previousClaimVersionId, uuidAt(702));
  assert.equal(absorbPayload.data.receipt.unresolvedRisk, true);
});

test("POST tick recomputes a next move after ChallengeRound response", async () => {
  const events: string[] = [];
  const challengeService = challengeRouteService({
    async respondToChallenge(input) {
      events.push(`respond:${input.response}`);
      return challengeRespondResponse(input);
    },
  });
  const thinkingService = routeService([], {
    async tick(input) {
      events.push("tick");
      return tickResponse(input.brainId, input.sessionId);
    },
  });
  const response = await handleChallengeRoundRespondRequest(
    requestWithBody(`http://localhost/api/challenges/${uuidAt(901)}/respond`, {
      response: "absorb",
      reasoning: "Keep the willingness-to-pay objection open for the next move.",
    }),
    uuidAt(901),
    { service: challengeService },
  );
  const responsePayload = (await response.json()) as ChallengeRespondPayload;
  const tick = await handleThinkingModeTickRequest(
    requestWithBody(`http://localhost/api/brains/${uuidAt(900)}/autopilot/tick`, {
      sessionId: uuidAt(101),
      resume: true,
      limit: 2,
    }),
    uuidAt(900),
    { service: thinkingService },
  );
  const tickPayload = (await tick.json()) as SmokeTickPayload;

  assert.equal(response.status, 200);
  assert.equal(responsePayload.data.focusCompletedMove.kind, "focus_completed");
  assert.equal(tick.status, 201);
  assert.equal(tickPayload.data.move.kind, "next_move_recomputed");
  assert.equal(tickPayload.data.selectedCandidate?.selected, true);
  assert.deepEqual(events, ["respond:absorb", "tick"]);
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

test("challenge round routes return clear validation and domain errors", async () => {
  const invalidReviseCalls: string[] = [];
  const invalidRevise = await handleChallengeRoundRespondRequest(
    requestWithBody(`http://localhost/api/challenges/${uuidAt(901)}/respond`, {
      response: "revise",
      reasoning: "This should not be enough without revised text.",
    }),
    uuidAt(901),
    {
      service: challengeRouteService({
        async respondToChallenge(input) {
          invalidReviseCalls.push(input.response);
          return challengeRespondResponse(input);
        },
      }),
    },
  );
  const invalidIssue = await handleIssueChallengeFromCandidateRequest(
    requestWithBody(`http://localhost/api/next-move-candidates/${encodeURIComponent("next_candidate")}/challenge`, {
      sessionId: uuidAt(101),
    }),
    "next_candidate",
    { service: challengeRouteService() },
  );
  const invalidChallengeId = await handleChallengeRoundRespondRequest(
    requestWithBody("http://localhost/api/challenges/not-a-uuid/respond", {
      response: "defend",
      reasoning: "Enough context exists.",
    }),
    "not-a-uuid",
    { service: challengeRouteService() },
  );
  const notFound = await handleChallengeRoundRespondRequest(
    requestWithBody(`http://localhost/api/challenges/${uuidAt(901)}/respond`, {
      response: "defend",
      reasoning: "Enough context exists.",
    }),
    uuidAt(901),
    {
      service: challengeRouteService({
        async respondToChallenge() {
          throw new ChallengeRoundNotFoundError("ChallengeRound was not found.");
        },
      }),
    },
  );
  const conflict = await handleChallengeRoundRespondRequest(
    requestWithBody(`http://localhost/api/challenges/${uuidAt(902)}/respond`, {
      response: "absorb",
    }),
    uuidAt(902),
    {
      service: challengeRouteService({
        async respondToChallenge() {
          throw new ChallengeRoundConflictError("ChallengeRound has already been responded to.");
        },
      }),
    },
  );
  const invalidIssuePayload = (await invalidIssue.json()) as { error: { code: string; issues: string[] } };
  const invalidRevisePayload = (await invalidRevise.json()) as { error: { code: string; issues: string[] } };
  const invalidChallengeIdPayload = (await invalidChallengeId.json()) as { error: { code: string; issues: string[] } };
  const notFoundPayload = (await notFound.json()) as { error: { code: string; message: string } };
  const conflictPayload = (await conflict.json()) as { error: { code: string; message: string } };

  assert.equal(invalidRevise.status, 400);
  assert.equal(invalidRevisePayload.error.code, "invalid_request");
  assert.match(invalidRevisePayload.error.issues.join("\n"), /revisedText/);
  assert.deepEqual(invalidReviseCalls, []);
  assert.equal(invalidIssue.status, 400);
  assert.equal(invalidIssuePayload.error.code, "invalid_request");
  assert.match(invalidIssuePayload.error.issues.join("\n"), /brainId/);
  assert.equal(invalidChallengeId.status, 400);
  assert.match(invalidChallengeIdPayload.error.issues.join("\n"), /challengeId/);
  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "challenge_round_not_found");
  assert.equal(conflict.status, 409);
  assert.equal(conflictPayload.error.code, "challenge_round_conflict");
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

type ChallengeRespondPayload = {
  data: {
    move: { kind: string };
    focusCompletedMove: { kind: string };
    receipt: {
      claimTextChanged: boolean;
      previousClaimVersionId: string | null;
      unresolvedRisk: boolean;
    };
  };
};

function challengeRouteService(overrides: Partial<ChallengeRoundRouteService> = {}): ChallengeRoundRouteService {
  return {
    async issueChallengeFromCandidate(input) {
      return challengeIssueResponse(input.brainId, input.sessionId);
    },
    async respondToChallenge(input) {
      return challengeRespondResponse(input);
    },
    ...overrides,
  };
}

function challengeIssueResponse(brainId: string, sessionId: string) {
  return {
    status: "issued" as const,
    brainId,
    sessionId,
    challengeRound: challengeRoundDto(sessionId, "open" as const),
    targetClaim: challengeClaimDto(uuidAt(202), uuidAt(702), "Pre-seed founders will pay for structured thinking before traction."),
    critiqueClaim: challengeClaimDto(uuidAt(203), uuidAt(703), "Pre-seed founders may admire the product but defer payment."),
    challengeEdge: challengeEdgeDto("active" as const),
    critique: "The risky assumption is willingness to pay before traction.",
    failureType: "shaky_assumption" as const,
    strength: "strong" as const,
    whyThis: "This is load-bearing because the wedge depends on willingness to pay before traction.",
    whatWouldResolveIt: "Name the urgent paid moment and artifact.",
    suggestedNextMove: "Defend, Revise, or Absorb.",
    move: challengeMoveDto("challenge_issued"),
    brainRun: {
      id: uuidAt(950),
      status: "succeeded" as const,
    },
  };
}

function challengeRespondResponse(input: RespondToChallengeInput) {
  const kind =
    input.response === "defend"
      ? ("user_defended" as const)
      : input.response === "revise"
        ? ("claim_revised" as const)
        : ("critique_absorbed" as const);
  const currentVersionId = input.response === "revise" ? uuidAt(704) : uuidAt(702);

  return {
    status: "responded" as const,
    challengeRound: {
      ...challengeRoundDto(uuidAt(101), "responded" as const),
      id: input.challengeId,
      response: input.response,
      responseMoveId: uuidAt(603),
      focusCompletedMoveId: uuidAt(604),
      respondedAt: "2026-04-29T00:00:12.000Z",
    },
    response: input.response,
    targetClaim: challengeClaimDto(uuidAt(202), currentVersionId, "Pre-seed founders will pay for a concrete urgent artifact."),
    critiqueClaimId: uuidAt(203),
    challengeEdge: challengeEdgeDto(input.response === "absorb" ? "acknowledged_vulnerability" : "active"),
    move: challengeMoveDto(kind),
    focusCompletedMove: challengeMoveDto("focus_completed"),
    receipt: {
      response: input.response,
      moveKind: kind,
      targetClaimId: uuidAt(202),
      challengeEdgeId: uuidAt(302),
      previousClaimVersionId: input.response === "revise" ? uuidAt(702) : null,
      currentClaimVersionId: currentVersionId,
      claimTextChanged: input.response === "revise",
      unresolvedRisk: input.response === "absorb",
    },
  };
}

function challengeRoundDto(sessionId: string, status: "open" | "responded") {
  return {
    id: uuidAt(901),
    sessionId,
    status,
    response: null,
    targetClaimId: uuidAt(202),
    targetClaimVersionId: uuidAt(702),
    critiqueClaimId: uuidAt(203),
    critiqueClaimVersionId: uuidAt(703),
    challengeEdgeId: uuidAt(302),
    brainRunId: uuidAt(950),
    challengeMoveId: uuidAt(602),
    responseMoveId: null,
    focusCompletedMoveId: null,
    failureType: "shaky_assumption" as const,
    strength: "strong" as const,
    critique: "The risky assumption is willingness to pay before traction.",
    whyThis: "The market wedge depends on this claim.",
    whatWouldResolveIt: "Name the urgent paid moment and artifact.",
    createdAt: "2026-04-29T00:00:10.000Z",
    respondedAt: null,
    updatedAt: "2026-04-29T00:00:10.000Z",
  };
}

function challengeClaimDto(id: string, versionId: string, text: string) {
  return {
    id,
    versionId,
    kind: "assumption" as const,
    status: "exploratory" as const,
    text,
    confidence: 42,
  };
}

function challengeEdgeDto(status: "active" | "acknowledged_vulnerability") {
  return {
    id: uuidAt(302),
    fromClaimId: uuidAt(203),
    toClaimId: uuidAt(202),
    kind: "challenges" as const,
    status,
    label: "shaky_assumption",
  };
}

function challengeMoveDto(kind: "challenge_issued" | "user_defended" | "claim_revised" | "critique_absorbed" | "focus_completed") {
  return {
    id: kind === "focus_completed" ? uuidAt(604) : uuidAt(603),
    kind,
    summary: `Created ${kind}.`,
    payload: {},
    createdAt: "2026-04-29T00:00:11.000Z",
  };
}

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
