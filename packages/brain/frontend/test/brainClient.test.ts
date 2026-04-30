import assert from "node:assert/strict";
import test from "node:test";
import {
  createChallengeBrief,
  fetchSessionCockpit,
  issueChallengeFromCandidate,
  respondToChallenge,
  selectAutopilotNode,
  startAutopilotCandidate,
  tickAutopilot,
} from "../src/api/brainClient";

test("frontend brain client uses session-scoped Autopilot command routes", async () => {
  const sessionId = uuidAt(101);
  const claimId = uuidAt(201);
  const previousSuggestionMoveId = uuidAt(601);
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    jsonResponse(thinkingModeState(sessionId)),
    jsonResponse(startCandidatePayload(sessionId)),
    jsonResponse(issueChallengePayload(sessionId)),
    jsonResponse(challengeRespondPayload(sessionId, "revise")),
    jsonResponse(challengeBriefPayload(sessionId)),
    jsonResponse(manualFocusPayload(sessionId, claimId)),
  ]);

  try {
    const tick = await tickAutopilot(sessionId, true);
    const started = await startAutopilotCandidate(sessionId, "next_candidate");
    const issued = await issueChallengeFromCandidate(sessionId, "next_candidate");
    const responded = await respondToChallenge({
      challengeId: uuidAt(701),
      response: "revise",
      revisedText: "Pre-seed founders will pay only during urgent fundraising decisions.",
      reasoning: "The broader claim overreached.",
    });
    const brief = await createChallengeBrief(sessionId);
    const manual = await selectAutopilotNode({ sessionId, claimId, previousSuggestionMoveId });

    assert.equal(tick.data.suggestion?.candidateId, "next_candidate");
    assert.equal(tick.data.suggestion?.why, "Challenge the paid founder workflow assumption.");
    assert.equal(tick.data.suggestion?.primaryActionLabel, "Start challenge");
    assert.deepEqual(tick.data.suggestion?.exitCriteria.acceptedMoveKinds, ["challenge_issued"]);
    assert.equal(started.data.move.kind, "autopilot_focus_started");
    assert.equal(issued.data.move.kind, "challenge_issued");
    assert.equal(responded.data.move.kind, "claim_revised");
    assert.equal(responded.data.focusCompletedMove.kind, "focus_completed");
    assert.equal(responded.data.receipt.previousClaimVersionId, uuidAt(401));
    assert.equal(responded.data.nextMove.requiredCommand, "tick_autopilot");
    assert.equal(responded.data.nextMove.expectedMoveKind, "next_move_recomputed");
    assert.equal(brief.data.artifact.kind, "challenge_brief");
    assert.equal(manual.data.move.kind, "manual_node_selected");
    assert.equal(calls[0]?.url, `/api/sessions/${sessionId}/autopilot/tick`);
    assert.equal(calls[0]?.method, "POST");
    assert.deepEqual(calls[0]?.body, { resume: true });
    assert.equal(calls[1]?.url, `/api/sessions/${sessionId}/next-move-candidates/next_candidate/start`);
    assert.equal(calls[1]?.method, "POST");
    assert.deepEqual(calls[1]?.body, {});
    assert.equal(calls[2]?.url, `/api/sessions/${sessionId}/next-move-candidates/next_candidate/challenge`);
    assert.equal(calls[2]?.method, "POST");
    assert.deepEqual(calls[2]?.body, {});
    assert.equal(calls[3]?.url, `/api/challenges/${uuidAt(701)}/respond`);
    assert.equal(calls[3]?.method, "POST");
    assert.deepEqual(calls[3]?.body, {
      response: "revise",
      revisedText: "Pre-seed founders will pay only during urgent fundraising decisions.",
      reasoning: "The broader claim overreached.",
    });
    assert.equal(calls[4]?.url, `/api/sessions/${sessionId}/challenge-brief`);
    assert.equal(calls[4]?.method, "POST");
    assert.deepEqual(calls[4]?.body, {});
    assert.equal(calls[5]?.url, `/api/sessions/${sessionId}/focus/manual`);
    assert.equal(calls[5]?.method, "POST");
    assert.deepEqual(calls[5]?.body, { claimId, previousSuggestionMoveId });

    for (const call of calls) {
      assert.equal(call.headers["content-type"], "application/json");
      assert.equal(call.headers["x-user-id"], undefined);
      assert.equal(call.headers["x-project-id"], undefined);
    }
  } finally {
    restoreFetch();
  }
});

test("frontend brain client normalizes cockpit Autopilot state for the existing UI", async () => {
  const sessionId = uuidAt(101);
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [jsonResponse(cockpitPayload(sessionId))]);

  try {
    const cockpit = await fetchSessionCockpit(sessionId);

    assert.equal(calls[0]?.url, `/api/sessions/${sessionId}/cockpit`);
    assert.equal(calls[0]?.method, "GET");
    assert.equal(cockpit.data.ideaMap.claims[0]?.id, uuidAt(201));
    assert.equal(cockpit.data.moves[0]?.type, "challenge_issued");
    assert.equal(cockpit.data.autopilot.suggestion?.candidateId, "next_candidate");
    assert.equal(cockpit.data.autopilot.suggestion?.label, "Challenge");
    assert.equal(cockpit.data.autopilot.suggestion?.primaryActionLabel, "Start challenge");
    assert.equal(cockpit.data.autopilot.suggestion?.why, "Challenge the paid founder workflow assumption.");
    assert.equal(cockpit.data.autopilot.suggestion?.exitCriteria.label, "Issue a challenge.");
    assert.equal(cockpit.data.activeChallenge?.targetClaimId, uuidAt(201));
    assert.equal(cockpit.data.activeChallenge?.challenge, "Admiration is not paid urgency.");
    assert.equal(cockpit.data.latestArtifact?.title, "Challenge Brief");
    assert.equal(cockpit.data.workStructure?.structureType, "startup");
    assert.equal(cockpit.data.workStructure?.steps[0]?.id, "challenge");
    assert.equal(cockpit.data.workStructure?.steps[0]?.detailChoices[0]?.label, "Defend choice");
  } finally {
    restoreFetch();
  }
});

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

function mockFetch(calls: FetchCall[], responses: Response[]): () => void {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const headers = headersRecord(init?.headers);
    const body = typeof init?.body === "string" && init.body.trim() ? JSON.parse(init.body) : null;
    const response = responses.shift();

    calls.push({ url, method, headers, body });

    if (!response) {
      return new Response(JSON.stringify({ error: { message: "Unexpected fetch call." } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    return response;
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

function headersRecord(headers: HeadersInit | undefined): Record<string, string> {
  const record: Record<string, string> = {};

  new Headers(headers).forEach((value, key) => {
    record[key] = value;
  });

  return record;
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function cockpitPayload(sessionId: string) {
  return {
    session: {
      id: sessionId,
      status: "open",
    },
    ideaMap: {
      claims: [
        {
          id: uuidAt(201),
          text: "Pre-seed founders will pay for structured thinking.",
          kind: "assumption",
          status: "exploratory",
          confidence: 42,
        },
      ],
      edges: [],
      keyInsight: "Founder urgency matters.",
    },
    workStructure: {
      structureType: "startup",
      label: "Startup Work Order",
      description: "A live order for turning the idea into a testable startup thesis.",
      activeStepId: "challenge",
      steps: [
        {
          id: "challenge",
          title: "Pressure-test the riskiest claim",
          purpose: "Attack the assumption that the rest of the startup depends on.",
          rank: 1,
          fragility: 100,
          importance: 100,
          status: "active",
          claimIds: [uuidAt(201)],
          edgeIds: [uuidAt(301)],
          whyNow: "The wedge depends on willingness to pay.",
          detailChoices: [
            {
              id: "defend",
              label: "Defend choice",
              description: "Choose evidence that would defend the claim.",
              claimIds: [uuidAt(201)],
              edgeIds: [uuidAt(301)],
            },
          ],
        },
      ],
    },
    moves: [
      {
        id: uuidAt(501),
        kind: "challenge_issued",
        summary: "Issued a challenge.",
        createdAt: "2026-04-29T00:00:05.000Z",
      },
    ],
    autopilot: thinkingModeState(sessionId),
    activeChallenge: {
      id: uuidAt(701),
      targetClaimId: uuidAt(201),
      failureType: "shaky_assumption",
      strength: "strong",
      critique: "Admiration is not paid urgency.",
      targetClaim: {
        id: uuidAt(201),
        text: "Pre-seed founders will pay for structured thinking.",
        kind: "assumption",
        status: "exploratory",
        confidence: 42,
      },
      critiqueClaim: null,
    },
    latestArtifact: {
      id: uuidAt(801),
      kind: "challenge_brief",
      title: "Challenge Brief",
      summary: "Founder paid workflow tightened.",
      payload: {},
      createdAt: "2026-04-29T00:00:10.000Z",
    },
  };
}

function thinkingModeState(sessionId: string) {
  const selectedCandidate = candidate(sessionId);

  return {
    status: "ready",
    brainId: sessionId,
    sessionId,
    focusState: {
      sessionId,
      mode: "challenge",
      focusedClaimId: uuidAt(201),
      focusedEdgeId: uuidAt(301),
      source: "autopilot_suggestion",
      suggestionMoveId: uuidAt(601),
      manualMoveId: null,
      paused: false,
      reason: "Challenge the paid founder workflow assumption.",
      updatedAt: "2026-04-29T00:00:09.000Z",
    },
    candidates: [selectedCandidate],
    selectedCandidate,
    persistedMoveIds: [uuidAt(601)],
    move: {
      id: uuidAt(601),
      kind: "next_move_recomputed",
      summary: "Recomputed next moves.",
    },
  };
}

function startCandidatePayload(sessionId: string) {
  return {
    status: "started",
    brainId: sessionId,
    sessionId,
    focusState: {
      ...thinkingModeState(sessionId).focusState,
      source: "autopilot_started",
    },
    selectedCandidate: candidate(sessionId),
    move: {
      id: uuidAt(602),
      kind: "autopilot_focus_started",
      summary: "Started Autopilot focus.",
    },
  };
}

function issueChallengePayload(sessionId: string) {
  return {
    status: "issued",
    brainId: sessionId,
    sessionId,
    challengeRound: challengeRound(sessionId, "open"),
    targetClaim: claim(),
    critiqueClaim: {
      id: uuidAt(202),
      text: "Admiration is not paid urgency.",
      kind: "belief",
      status: "exploratory",
      confidence: 80,
    },
    challengeEdge: {
      id: uuidAt(301),
      fromClaimId: uuidAt(202),
      toClaimId: uuidAt(201),
      kind: "challenges",
      status: "active",
      label: "shaky_assumption",
    },
    critique: "Admiration is not paid urgency.",
    failureType: "shaky_assumption",
    strength: "strong",
    whyThis: "The wedge depends on willingness to pay.",
    whatWouldResolveIt: "Name the urgent paid moment.",
    suggestedNextMove: "Defend, Revise, or Absorb.",
    move: {
      id: uuidAt(501),
      kind: "challenge_issued",
      summary: "Issued a challenge.",
    },
  };
}

function challengeRespondPayload(sessionId: string, response: "defend" | "revise" | "absorb") {
  const moveKind =
    response === "defend" ? "user_defended" : response === "revise" ? "claim_revised" : "critique_absorbed";

  return {
    status: "responded",
    challengeRound: {
      ...challengeRound(sessionId, "responded"),
      response,
      responseMoveId: uuidAt(502),
      focusCompletedMoveId: uuidAt(503),
      respondedAt: "2026-04-29T00:00:15.000Z",
    },
    response,
    targetClaim: claim({
      text: "Pre-seed founders will pay only during urgent fundraising decisions.",
    }),
    critiqueClaimId: uuidAt(202),
    challengeEdge: {
      id: uuidAt(301),
      fromClaimId: uuidAt(202),
      toClaimId: uuidAt(201),
      kind: "challenges",
      status: "active",
      label: "shaky_assumption",
    },
    move: {
      id: uuidAt(502),
      kind: moveKind,
      summary: "Recorded challenge response.",
    },
    focusCompletedMove: {
      id: uuidAt(503),
      kind: "focus_completed",
      summary: "Completed challenge focus.",
    },
    derivedEffects: [
      {
        id: uuidAt(601),
        kind: "shape_candidate",
        status: "pending_review",
        version: 1,
        title: "Revision after pressure",
        summary: "The user changed a claim in response to a challenge.",
        payload: {},
        createdAt: "2026-04-29T00:00:16.000Z",
      },
    ],
    receipt: {
      response,
      moveKind,
      targetClaimId: uuidAt(201),
      challengeEdgeId: uuidAt(301),
      previousClaimVersionId: response === "revise" ? uuidAt(401) : null,
      currentClaimVersionId: response === "revise" ? uuidAt(402) : uuidAt(401),
      claimTextChanged: response === "revise",
      unresolvedRisk: response === "absorb",
    },
    nextMove: nextMoveDirective(sessionId),
  };
}

function challengeBriefPayload(sessionId: string) {
  return {
    status: "created",
    artifact: {
      id: uuidAt(801),
      sessionId,
      kind: "challenge_brief",
      title: "Challenge Brief",
      summary: "Founder paid workflow tightened.",
      payload: {},
      createdAt: "2026-04-29T00:00:20.000Z",
    },
    move: {
      id: uuidAt(802),
      kind: "artifact_created",
      summary: "Created Challenge Brief.",
    },
    brief: {},
  };
}

function manualFocusPayload(sessionId: string, claimId: string) {
  return {
    status: "paused",
    brainId: sessionId,
    sessionId,
    focusState: {
      ...thinkingModeState(sessionId).focusState,
      source: "manual_selection",
      manualMoveId: uuidAt(603),
      paused: true,
    },
    focusClaim: {
      id: claimId,
      text: "Pre-seed founders will pay for structured thinking.",
      kind: "assumption",
      status: "exploratory",
      confidence: 42,
    },
    move: {
      id: uuidAt(603),
      kind: "manual_node_selected",
      summary: "User manually selected a graph node.",
    },
  };
}

function challengeRound(sessionId: string, status: "open" | "responded") {
  return {
    id: uuidAt(701),
    sessionId,
    status,
    response: null,
    targetClaimId: uuidAt(201),
    targetClaimVersionId: uuidAt(401),
    critiqueClaimId: uuidAt(202),
    critiqueClaimVersionId: uuidAt(402),
    challengeEdgeId: uuidAt(301),
    challengeMoveId: uuidAt(501),
    responseMoveId: null,
    focusCompletedMoveId: null,
    failureType: "shaky_assumption",
    strength: "strong",
    critique: "Admiration is not paid urgency.",
    whyThis: "The wedge depends on willingness to pay.",
    whatWouldResolveIt: "Name the urgent paid moment.",
    createdAt: "2026-04-29T00:00:10.000Z",
    respondedAt: null,
    updatedAt: "2026-04-29T00:00:10.000Z",
  };
}

function claim(overrides: Partial<{ text: string }> = {}) {
  return {
    id: uuidAt(201),
    text: overrides.text ?? "Pre-seed founders will pay for structured thinking.",
    kind: "assumption",
    status: "exploratory",
    confidence: 42,
  };
}

function nextMoveDirective(sessionId: string) {
  return {
    status: "client_tick_required",
    requiredCommand: "tick_autopilot",
    sessionId,
    method: "POST",
    endpoint: `/api/sessions/${sessionId}/autopilot/tick`,
    body: {
      resume: true,
    },
    reason: "Challenge response completed focus.",
    expectedMoveKind: "next_move_recomputed",
  };
}

function candidate(sessionId: string) {
  return {
    id: uuidAt(701),
    sessionId,
    candidateId: "next_candidate",
    action: "challenge",
    mode: "challenge",
    targetClaimId: uuidAt(201),
    targetEdgeId: uuidAt(301),
    score: 920,
    reason: "Challenge the paid founder workflow assumption.",
    reasonCodes: ["load_bearing"],
    exitCriteria: {
      label: "Issue a challenge.",
      acceptedMoveKinds: ["challenge_issued"],
    },
    selected: true,
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
