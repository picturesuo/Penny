import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchSessionCockpit,
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
    jsonResponse(manualFocusPayload(sessionId, claimId)),
  ]);

  try {
    const tick = await tickAutopilot(sessionId, true);
    const started = await startAutopilotCandidate(sessionId, "next_candidate");
    const manual = await selectAutopilotNode({ sessionId, claimId, previousSuggestionMoveId });

    assert.equal(tick.data.suggestion?.candidateId, "next_candidate");
    assert.equal(tick.data.suggestion?.why, "Challenge the paid founder workflow assumption.");
    assert.equal(started.data.move.kind, "autopilot_focus_started");
    assert.equal(manual.data.move.kind, "manual_node_selected");
    assert.equal(calls[0]?.url, `/api/sessions/${sessionId}/autopilot/tick`);
    assert.equal(calls[0]?.method, "POST");
    assert.deepEqual(calls[0]?.body, { resume: true });
    assert.equal(calls[1]?.url, `/api/sessions/${sessionId}/next-move-candidates/next_candidate/start`);
    assert.equal(calls[1]?.method, "POST");
    assert.deepEqual(calls[1]?.body, {});
    assert.equal(calls[2]?.url, `/api/sessions/${sessionId}/focus/manual`);
    assert.equal(calls[2]?.method, "POST");
    assert.deepEqual(calls[2]?.body, { claimId, previousSuggestionMoveId });
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
    assert.equal(cockpit.data.autopilot.suggestion?.why, "Challenge the paid founder workflow assumption.");
    assert.equal(cockpit.data.activeChallenge?.targetClaimId, uuidAt(201));
    assert.equal(cockpit.data.activeChallenge?.challenge, "Admiration is not paid urgency.");
    assert.equal(cockpit.data.latestArtifact?.title, "Challenge Brief");
  } finally {
    restoreFetch();
  }
});

type FetchCall = {
  url: string;
  method: string;
  body: unknown;
};

function mockFetch(calls: FetchCall[], responses: Response[]): () => void {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" && init.body.trim() ? JSON.parse(init.body) : null;
    const response = responses.shift();

    calls.push({ url, method, body });

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
    selected: true,
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
