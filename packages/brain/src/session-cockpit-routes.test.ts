import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSessionCockpitPayload,
  handleSessionAutopilotStateRequest,
  handleSessionAutopilotTickRequest,
  handleSessionCockpitRequest,
  handleSessionManualFocusRequest,
  handleSessionStartNextMoveCandidateRequest,
  type SessionAutopilotTickInput,
  type SessionCockpitChallengeRound,
  type SessionCockpitPayload,
  type SessionCockpitRouteService,
  type SessionManualFocusInput,
  type SessionStartNextMoveInput,
} from "./routes/session-cockpit-routes.ts";
import type { FocusState } from "./domain/types.ts";
import type { SessionGraphPayload } from "./session-graph-route.ts";
import { ThinkingModeNotFoundError } from "./services/thinking-mode-service.ts";

test("buildSessionCockpitPayload composes graph, moves, autopilot, active challenge, and latest artifact", () => {
  const sessionId = uuidAt(101);
  const payload = buildSessionCockpitPayload(
    graphPayload(sessionId),
    autopilotState(sessionId),
    challengeRound(sessionId),
    latestArtifact(sessionId),
  );

  assert.equal(payload.session.id, sessionId);
  assert.equal(payload.sourceOfTruth, "claims_claim_versions_edges_moves_sources_source_spans");
  assert.equal(payload.ideaMap.claims[0]?.id, uuidAt(201));
  assert.equal(payload.workStructure.structureType, "startup");
  assert.equal(payload.workStructure.activeStepId, "challenge");
  assert.equal(payload.workStructure.steps[0]?.id, "challenge");
  assert.equal(payload.workStructure.steps[0]?.rank, 1);
  assert.deepEqual(payload.workStructure.steps[0]?.claimIds.includes(uuidAt(201)), true);
  assert.deepEqual(payload.workStructure.steps[0]?.edgeIds.includes(uuidAt(301)), true);
  assert.equal(payload.graphPath.layout, "top_down");
  assert.equal(payload.graphPath.generatedFrom, "claims_edges_moves");
  assert.equal(payload.graphPath.focusClaimId, uuidAt(201));
  assert.equal(payload.graphPath.nodes.length, 2);
  assert.equal(payload.graphPath.nodes[0]?.claimId, uuidAt(201));
  assert.equal(payload.graphPath.nodes[0]?.role, "main_claim");
  assert.equal(payload.graphPath.nodes[0]?.selected, true);
  assert.equal(payload.graphPath.nodes[1]?.depth, 1);
  assert.equal(payload.graphPath.edges[0]?.edgeId, uuidAt(301));
  assert.equal(payload.graphPath.edges[0]?.fromNodeId, `claim:${uuidAt(201)}`);
  assert.equal(payload.graphPath.edges[0]?.toNodeId, `claim:${uuidAt(202)}`);
  assert.equal(payload.graph.nodes[0]?.claimId, uuidAt(201));
  assert.equal(payload.moves[0]?.kind, "challenge_issued");
  assert.equal(payload.autopilot.selectedCandidate?.candidateId, "next_candidate");
  assert.equal(payload.activeChallenge?.id, uuidAt(701));
  assert.equal(payload.activeChallenge?.targetClaim?.id, uuidAt(201));
  assert.equal(payload.activeChallenge?.critiqueClaim?.id, uuidAt(202));
  assert.equal(payload.activeChallenge?.challengeEdge?.id, uuidAt(301));
  assert.equal(payload.latestArtifact?.id, uuidAt(801));
  assert.equal(payload.latestArtifact?.payload.sections, "newer challenge brief shape");
  assert.equal(payload.meta.activeChallengeId, uuidAt(701));
  assert.equal(payload.meta.latestArtifactId, uuidAt(801));
});

test("GET /api/sessions/:sessionId/cockpit returns composed cockpit state", async () => {
  const sessionId = uuidAt(101);
  const calls: string[] = [];
  const response = await handleSessionCockpitRequest(
    new Request(`http://localhost/api/sessions/${sessionId}/cockpit`),
    sessionId,
    { service: routeService(calls) },
  );
  const payload = (await response.json()) as { data: SessionCockpitPayload };

  assert.equal(response.status, 200);
  assert.equal(payload.data.session.id, sessionId);
  assert.equal(payload.data.autopilot.focusState.sessionId, sessionId);
  assert.equal(payload.data.activeChallenge?.targetClaim?.text, "Pre-seed founders will pay for structured thinking.");
  assert.equal(payload.data.latestArtifact?.title, "Challenge Brief");
  assert.deepEqual(calls, [`getCockpit:${sessionId}`]);
});

test("GET cockpit validates method and session id before service calls", async () => {
  const calls: string[] = [];
  const nonGet = await handleSessionCockpitRequest(
    requestWithBody(`http://localhost/api/sessions/${uuidAt(101)}/cockpit`, {}),
    uuidAt(101),
    { service: routeService(calls) },
  );
  const invalid = await handleSessionCockpitRequest(
    new Request("http://localhost/api/sessions/not-a-uuid/cockpit"),
    "not-a-uuid",
    { service: routeService(calls) },
  );
  const nonGetPayload = (await nonGet.json()) as { error: { code: string } };
  const invalidPayload = (await invalid.json()) as { error: { code: string; issues: string[] } };

  assert.equal(nonGet.status, 405);
  assert.equal(nonGet.headers.get("allow"), "GET");
  assert.equal(nonGetPayload.error.code, "method_not_allowed");
  assert.equal(invalid.status, 400);
  assert.equal(invalidPayload.error.code, "invalid_request");
  assert.match(invalidPayload.error.issues.join("\n"), /sessionId/);
  assert.deepEqual(calls, []);
});

test("GET cockpit maps session adapter not found errors", async () => {
  const sessionId = uuidAt(101);
  const response = await handleSessionCockpitRequest(
    new Request(`http://localhost/api/sessions/${sessionId}/cockpit`),
    sessionId,
    {
      service: routeService([], {
        async getCockpit() {
          throw new ThinkingModeNotFoundError("Session was not found.");
        },
      }),
    },
  );
  const payload = (await response.json()) as { error: { code: string; message: string } };

  assert.equal(response.status, 404);
  assert.equal(payload.error.code, "session_adapter_not_found");
  assert.match(payload.error.message, /not found/i);
});

test("session-scoped Autopilot aliases delegate without brainId or body sessionId", async () => {
  const sessionId = uuidAt(101);
  const candidateId = "next_candidate";
  const claimId = uuidAt(201);
  const previousSuggestionMoveId = uuidAt(601);
  const calls: string[] = [];
  const service = routeService(calls);
  const state = await handleSessionAutopilotStateRequest(
    new Request(`http://localhost/api/sessions/${sessionId}/autopilot/state`),
    sessionId,
    { service },
  );
  const tick = await handleSessionAutopilotTickRequest(
    requestWithBody(`http://localhost/api/sessions/${sessionId}/autopilot/tick`, {
      resume: true,
      limit: 4,
    }),
    sessionId,
    { service },
  );
  const start = await handleSessionStartNextMoveCandidateRequest(
    requestWithBody(`http://localhost/api/sessions/${sessionId}/next-move-candidates/${candidateId}/start`, {}),
    sessionId,
    candidateId,
    { service },
  );
  const manual = await handleSessionManualFocusRequest(
    requestWithBody(`http://localhost/api/sessions/${sessionId}/focus/manual`, {
      claimId,
      reason: "Inspect this assumption first.",
      previousSuggestionMoveId,
    }),
    sessionId,
    { service },
  );
  const statePayload = (await state.json()) as { data: { sessionId: string } };
  const tickPayload = (await tick.json()) as { data: { status: string; persistedMoveIds: string[] } };
  const startPayload = (await start.json()) as { data: { status: string; move: { kind: string } } };
  const manualPayload = (await manual.json()) as { data: { status: string; move: { kind: string } } };

  assert.equal(state.status, 200);
  assert.equal(tick.status, 201);
  assert.equal(start.status, 201);
  assert.equal(manual.status, 201);
  assert.equal(statePayload.data.sessionId, sessionId);
  assert.equal(tickPayload.data.status, "ready");
  assert.deepEqual(tickPayload.data.persistedMoveIds, [uuidAt(601)]);
  assert.equal(startPayload.data.status, "started");
  assert.equal(startPayload.data.move.kind, "autopilot_focus_started");
  assert.equal(manualPayload.data.status, "paused");
  assert.equal(manualPayload.data.move.kind, "manual_node_selected");
  assert.deepEqual(calls, [
    `getAutopilotState:${sessionId}`,
    `tickAutopilot:${sessionId}:true:4`,
    `startCandidate:${sessionId}:${candidateId}`,
    `manualFocus:${sessionId}:${claimId}:Inspect this assumption first.:${previousSuggestionMoveId}`,
  ]);
});

test("session-scoped aliases reject duplicated session or brain ids in bodies", async () => {
  const sessionId = uuidAt(101);
  const calls: string[] = [];
  const service = routeService(calls);
  const tick = await handleSessionAutopilotTickRequest(
    requestWithBody(`http://localhost/api/sessions/${sessionId}/autopilot/tick`, {
      sessionId,
    }),
    sessionId,
    { service },
  );
  const start = await handleSessionStartNextMoveCandidateRequest(
    requestWithBody(`http://localhost/api/sessions/${sessionId}/next-move-candidates/next_candidate/start`, {
      brainId: uuidAt(900),
    }),
    sessionId,
    "next_candidate",
    { service },
  );
  const manual = await handleSessionManualFocusRequest(
    requestWithBody(`http://localhost/api/sessions/${sessionId}/focus/manual`, {
      sessionId,
      claimId: uuidAt(201),
    }),
    sessionId,
    { service },
  );
  const tickPayload = (await tick.json()) as { error: { code: string; issues: string[] } };
  const startPayload = (await start.json()) as { error: { code: string; issues: string[] } };
  const manualPayload = (await manual.json()) as { error: { code: string; issues: string[] } };

  assert.equal(tick.status, 400);
  assert.equal(start.status, 400);
  assert.equal(manual.status, 400);
  assert.equal(tickPayload.error.code, "invalid_request");
  assert.equal(startPayload.error.code, "invalid_request");
  assert.equal(manualPayload.error.code, "invalid_request");
  assert.match(tickPayload.error.issues.join("\n"), /Unrecognized key/);
  assert.match(startPayload.error.issues.join("\n"), /Unrecognized key/);
  assert.match(manualPayload.error.issues.join("\n"), /Unrecognized key/);
  assert.deepEqual(calls, []);
});

function routeService(
  calls: string[],
  overrides: Partial<SessionCockpitRouteService> = {},
): SessionCockpitRouteService {
  return {
    async getCockpit(sessionId) {
      calls.push(`getCockpit:${sessionId}`);

      return buildSessionCockpitPayload(
        graphPayload(sessionId),
        autopilotState(sessionId),
        challengeRound(sessionId),
        latestArtifact(sessionId),
      );
    },
    async getAutopilotState(sessionId) {
      calls.push(`getAutopilotState:${sessionId}`);

      return autopilotState(sessionId);
    },
    async tickAutopilot(input: SessionAutopilotTickInput) {
      calls.push(`tickAutopilot:${input.sessionId}:${String(input.resume)}:${String(input.limit)}`);

      return tickResponse(input.sessionId);
    },
    async startCandidate(input: SessionStartNextMoveInput) {
      calls.push(`startCandidate:${input.sessionId}:${input.candidateId}`);

      return startResponse(input.sessionId, input.candidateId);
    },
    async manualFocus(input: SessionManualFocusInput) {
      calls.push(
        `manualFocus:${input.sessionId}:${input.claimId}:${String(input.reason)}:${String(input.previousSuggestionMoveId)}`,
      );

      return manualResponse(input.sessionId, input.claimId);
    },
    ...overrides,
  };
}

function graphPayload(sessionId: string): SessionGraphPayload {
  return {
    session: {
      id: sessionId,
      scope: {
        userId: "user-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        sphereId: "sphere-1",
      },
      status: "open",
      title: "Founder paid workflow",
      createdAt: "2026-04-29T00:00:01.000Z",
      endedAt: null,
    },
    sourceOfTruth: "claims_claim_versions_edges_moves_sources_source_spans",
    ideaMap: {
      artifactId: null,
      keyInsight: null,
      claims: [
        {
          id: uuidAt(201),
          scope: emptyScope(),
          sessionId,
          sourceId: uuidAt(901),
          kind: "assumption",
          status: "exploratory",
          text: "Pre-seed founders will pay for structured thinking.",
          confidence: 42,
          versionId: uuidAt(401),
          currentVersion: claimVersion(uuidAt(401), uuidAt(201), "current"),
          versions: [claimVersion(uuidAt(401), uuidAt(201), "current")],
          incomingEdgeIds: [uuidAt(301)],
          outgoingEdgeIds: [],
          moveIds: [uuidAt(501)],
          sourceSpanIds: [],
          createdAt: "2026-04-29T00:00:02.000Z",
          updatedAt: "2026-04-29T00:00:02.000Z",
        },
        {
          id: uuidAt(202),
          scope: emptyScope(),
          sessionId,
          sourceId: uuidAt(901),
          kind: "belief",
          status: "exploratory",
          text: "Founders may admire structured thinking but defer paying for it.",
          confidence: 70,
          versionId: uuidAt(402),
          currentVersion: claimVersion(uuidAt(402), uuidAt(202), "current"),
          versions: [claimVersion(uuidAt(402), uuidAt(202), "current")],
          incomingEdgeIds: [],
          outgoingEdgeIds: [uuidAt(301)],
          moveIds: [uuidAt(501)],
          sourceSpanIds: [],
          createdAt: "2026-04-29T00:00:03.000Z",
          updatedAt: "2026-04-29T00:00:03.000Z",
        },
      ],
      claimVersions: [
        claimVersion(uuidAt(401), uuidAt(201), "current"),
        claimVersion(uuidAt(402), uuidAt(202), "current"),
      ],
      edges: [
        {
          id: uuidAt(301),
          scope: emptyScope(),
          sessionId,
          fromClaimId: uuidAt(202),
          toClaimId: uuidAt(201),
          fromClaimVersionId: uuidAt(402),
          toClaimVersionId: uuidAt(401),
          kind: "challenges",
          status: "active",
          label: "shaky_assumption",
          createdAt: "2026-04-29T00:00:04.000Z",
        },
      ],
    },
    graph: {
      nodes: [
        {
          id: uuidAt(201),
          claimId: uuidAt(201),
          label: "Pre-seed founders will pay for structured thinking.",
          kind: "assumption",
          status: "exploratory",
          confidence: 42,
          x: 0,
          y: 0,
          radius: 18,
        },
      ],
      edges: [
        {
          id: uuidAt(301),
          from: uuidAt(202),
          to: uuidAt(201),
          kind: "challenges",
          status: "active",
          label: "shaky_assumption",
        },
      ],
    },
    moves: [
      {
        id: uuidAt(501),
        scope: emptyScope(),
        sessionId,
        kind: "challenge_issued",
        summary: "Issued a challenge.",
        createdAt: "2026-04-29T00:00:05.000Z",
        claimIds: [uuidAt(201), uuidAt(202)],
        claimVersionIds: [uuidAt(401), uuidAt(402)],
        edgeIds: [uuidAt(301)],
        artifactIds: [],
        sourceIds: [],
        sourceSpanIds: [],
        brainRunIds: [uuidAt(601)],
      },
    ],
    sources: [],
    sourceSpans: [],
    lensSnapshot: {
      shapes: [],
      pendingEffects: [],
    },
    meta: {
      claimCount: 2,
      claimVersionCount: 2,
      edgeCount: 1,
      moveCount: 1,
      sourceCount: 0,
      sourceSpanCount: 0,
      shapeCount: 0,
      pendingEffectCount: 0,
    },
  } as unknown as SessionGraphPayload;
}

function autopilotState(sessionId: string) {
  const candidate = candidateDto(sessionId);

  return {
    status: "ready" as const,
    brainId: sessionId,
    sessionId,
    focusState: focusState(sessionId, "autopilot_suggestion", false),
    candidates: [candidate],
    selectedCandidate: candidate,
  };
}

function tickResponse(sessionId: string) {
  return {
    ...autopilotState(sessionId),
    graphHash: "graph_hash",
    persistedMoveIds: [uuidAt(601)],
    move: moveDto(sessionId, "next_move_recomputed"),
  };
}

function startResponse(sessionId: string, candidateId: string) {
  return {
    status: "started" as const,
    brainId: sessionId,
    sessionId,
    focusState: focusState(sessionId, "autopilot_started", false),
    selectedCandidate: {
      ...candidateDto(sessionId),
      candidateId,
    },
    move: moveDto(sessionId, "autopilot_focus_started"),
  };
}

function manualResponse(sessionId: string, claimId: string) {
  return {
    status: "paused" as const,
    brainId: sessionId,
    sessionId,
    focusState: focusState(sessionId, "manual_selection", true),
    focusClaim: {
      id: claimId,
      versionId: uuidAt(401),
      kind: "assumption",
      status: "exploratory",
      text: "Pre-seed founders will pay for structured thinking.",
      confidence: 42,
    },
    move: moveDto(sessionId, "manual_node_selected"),
  };
}

function candidateDto(sessionId: string) {
  return {
    id: uuidAt(701),
    sessionId,
    candidateId: "next_candidate",
    fingerprint: "fingerprint_123",
    rank: 1,
    targetClaimId: uuidAt(201),
    targetEdgeId: uuidAt(301),
    action: "challenge" as const,
    mode: "challenge" as const,
    score: 920,
    reason: "Challenge the paid founder workflow assumption.",
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
      claimIds: [uuidAt(201)],
      edgeIds: [uuidAt(301)],
      moveIds: [uuidAt(501)],
      artifactIds: [],
    },
    selected: true,
    selectedAt: "2026-04-29T00:00:09.000Z",
  };
}

function challengeRound(sessionId: string): SessionCockpitChallengeRound {
  return {
    id: uuidAt(701),
    sessionId,
    status: "open",
    response: null,
    targetClaimId: uuidAt(201),
    targetClaimVersionId: uuidAt(401),
    critiqueClaimId: uuidAt(202),
    critiqueClaimVersionId: uuidAt(402),
    challengeEdgeId: uuidAt(301),
    brainRunId: uuidAt(601),
    challengeMoveId: uuidAt(501),
    responseMoveId: null,
    focusCompletedMoveId: null,
    failureType: "shaky_assumption",
    strength: "strong",
    critique: "Admiration is not the same as paid urgency.",
    whyThis: "The rest of the founder wedge depends on this.",
    whatWouldResolveIt: "Name the urgent paid moment.",
    createdAt: "2026-04-29T00:00:06.000Z",
    respondedAt: null,
    updatedAt: "2026-04-29T00:00:06.000Z",
  };
}

function latestArtifact(sessionId: string) {
  return {
    id: uuidAt(801),
    sessionId,
    kind: "challenge_brief" as const,
    title: "Challenge Brief",
    summary: "Founder paid workflow tightened.",
    payload: {
      sections: "newer challenge brief shape",
    },
    createdAt: "2026-04-29T00:00:10.000Z",
  };
}

function focusState(sessionId: string, source: FocusState["source"], paused: boolean): FocusState {
  return {
    sessionId,
    mode: "challenge",
    focusedClaimId: source === "none" ? null : uuidAt(201),
    focusedEdgeId: source === "none" ? null : uuidAt(301),
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

function claimVersion(id: string, claimId: string, state: "current" | "old") {
  return {
    id,
    claimId,
    text:
      claimId === uuidAt(201)
        ? "Pre-seed founders will pay for structured thinking."
        : "Founders may admire structured thinking but defer paying for it.",
    confidence: claimId === uuidAt(201) ? 42 : 70,
    status: "exploratory" as const,
    state,
    isCurrent: state === "current",
    sourceId: uuidAt(901),
    brainRunId: null,
    moveId: null,
    validFrom: "2026-04-29T00:00:02.000Z",
    validUntil: null,
    supersededByVersionId: null,
    createdAt: "2026-04-29T00:00:02.000Z",
  };
}

function emptyScope() {
  return {
    userId: null,
    workspaceId: null,
    projectId: null,
    sphereId: null,
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
