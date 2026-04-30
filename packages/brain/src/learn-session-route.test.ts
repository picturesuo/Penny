import assert from "node:assert/strict";
import test from "node:test";
import {
  handleLearnSessionRequest,
  type LearnSessionPayload,
} from "./learn-session-route.ts";
import {
  createHeuristicBrainSeedProvider,
  generateBrainSeed,
  type BrainSeedInput,
  type BrainSeedOutput,
} from "./seed.ts";
import type { BrainSeedPrelude, BrainSeedRunInput, PersistedBrainSeed } from "./seed-persistence.ts";
import type { ThinkingModeTickResponse } from "./services/thinking-mode-service.ts";
import { scopeValues } from "./scope.ts";

test("POST /api/learn/session validates dropped ideas before generation", async () => {
  let generated = false;
  const response = await handleLearnSessionRequest(
    request("http://localhost/api/learn/session", {}),
    {
      async generateSeed() {
        generated = true;
        throw new Error("generateSeed should not run");
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string; issues: string[] } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_request");
  assert.match(payload.error.issues.join("\n"), /rawIdea/);
  assert.equal(generated, false);
});

test("POST /api/learn/session structures a dropped idea and ticks Autopilot", async () => {
  let preparedRun: BrainSeedRunInput | undefined;
  let tickedSessionId: string | undefined;
  const rawIdea = "Penny should help founders learn whether a strategy bet is worth saving.";
  const response = await handleLearnSessionRequest(
    request("http://localhost/api/learn/session", {
      rawIdea,
      autopilot: { limit: 4 },
    }),
    {
      provider: createHeuristicBrainSeedProvider(),
      async prepareSeedRun(input, options) {
        preparedRun = options.run;
        return createPersistedPrelude(input, options.run);
      },
      async generateSeed(input, options) {
        return generateBrainSeed(input, {
          provider: createHeuristicBrainSeedProvider(),
          brainRunId: options.brainRunId,
        });
      },
      async persistSeed(seed, options) {
        return createPersistedSeed(seed, options.prelude);
      },
      async tickAutopilot(input) {
        tickedSessionId = input.sessionId;
        assert.equal(input.limit, 4);
        return autopilotResponse(input.sessionId);
      },
    },
  );
  const payload = (await response.json()) as { data: LearnSessionPayload };

  assert.equal(response.status, 201);
  assert.equal(preparedRun?.operation, "brain.seed");
  assert.equal((preparedRun?.input as { source?: string } | undefined)?.source, "learn_session");
  assert.equal(tickedSessionId, payload.data.session.id);
  assert.equal(payload.data.source.rawText, rawIdea);
  assert.match(payload.data.learn.coreIdea, /load-bearing question|assistant/i);
  assert.equal(payload.data.learn.claims.length, 4);
  assert.equal(payload.data.learn.assumptions.length, 3);
  assert.ok(payload.data.learn.questions.length >= 4);
  assert.equal(payload.data.learn.concepts.length, 1);
  assert.ok(payload.data.learn.creativePotential.length >= 4);
  assert.deepEqual(
    payload.data.learn.nextMoves.map((move) => move.action),
    ["learn", "check", "verify", "save_to_brain"],
  );
  assert.equal(payload.data.learn.nextMoves.find((move) => move.action === "check")?.source, "autopilot");
  assert.equal(payload.data.learn.nextMoves.find((move) => move.action === "save_to_brain")?.source, "learn_session");
  assert.equal(payload.data.candidateBrainObjects.length, 3);
  assert.equal(payload.data.candidateBrainObjects[0]?.objectType, "learn_session");
  assert.equal(payload.data.candidateBrainObjects[0]?.source, "learn");
  assert.equal(payload.data.autopilot.selectedCandidate?.userAction, "check");
  assert.equal(payload.data.modeContract.activeMode, "Check");
});

function request(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "dev-user-1",
      "x-workspace-id": "dev-workspace-1",
      "x-project-id": "dev-project-1",
      "x-sphere-id": "dev-sphere-1",
    },
    body: JSON.stringify(body),
  });
}

function createPersistedPrelude(input: BrainSeedInput, run: BrainSeedRunInput): BrainSeedPrelude {
  const now = new Date("2026-04-30T00:00:00.000Z");
  const sessionId = input.sessionId ?? uuidAt(100);
  const sourceId = uuidAt(101);
  const brainRunId = uuidAt(701);
  const scope = scopeValues(run.scope);

  return {
    session: {
      id: sessionId,
      ...scope,
      status: "open",
      title: input.rawIdea,
      createdAt: now,
      endedAt: null,
    },
    source: {
      id: sourceId,
      ...scope,
      sessionId,
      kind: "raw_idea",
      rawText: input.rawIdea,
      createdAt: now,
    },
    submittedSourceSpan: {
      id: uuidAt(151),
      sourceId,
      claimId: null,
      claimVersionId: null,
      startOffset: 0,
      endOffset: input.rawIdea.length,
      label: "submitted_text",
      createdAt: now,
    },
    brainRun: {
      id: brainRunId,
      ...scope,
      sessionId,
      sourceId,
      operation: run.operation,
      provider: run.provider,
      model: run.model ?? null,
      status: "running",
      input: run.input,
      output: null,
      error: null,
      createdAt: run.startedAt ?? now,
      completedAt: null,
    },
  };
}

function createPersistedSeed(seed: BrainSeedOutput, prelude: BrainSeedPrelude): PersistedBrainSeed {
  const now = new Date("2026-04-30T00:00:00.000Z");
  const sessionId = prelude.session.id;
  const sourceId = prelude.source.id;
  const scope = scopeValues(prelude.session);
  const claims = seed.thoughtMap.claims.map((claim, index) => ({
    id: uuidAt(201 + index),
    seedId: claim.id,
    ...scope,
    sessionId,
    sourceId,
    kind: claim.kind,
    createdAt: now,
  }));
  const claimIds = new Map(claims.map((claim) => [claim.seedId, claim.id]));
  const claimVersions = seed.thoughtMap.claims.map((claim, index) => ({
    id: uuidAt(251 + index),
    seedId: claim.id,
    claimId: requireMappedId(claimIds, claim.id),
    sourceId,
    brainRunId: prelude.brainRun.id,
    moveId: null,
    content: claim.text,
    status: "exploratory" as const,
    confidence: claim.confidence,
    isCurrent: true,
    validFrom: now,
    validUntil: null,
    supersededByVersionId: null,
    createdAt: now,
  }));
  const claimVersionIds = new Map(claimVersions.map((version) => [version.seedId, version.id]));
  const edges = seed.thoughtMap.edges.map((edge, index) => ({
    id: uuidAt(301 + index),
    seedId: edge.id,
    ...scope,
    sessionId,
    fromClaimId: requireMappedId(claimIds, edge.fromClaimId),
    toClaimId: requireMappedId(claimIds, edge.toClaimId),
    kind: edge.kind,
    status: "active" as const,
    label: edge.label,
    createdAt: now,
  }));
  const edgeIds = new Map(edges.map((edge) => [edge.seedId, edge.id]));

  return {
    session: prelude.session,
    source: prelude.source,
    submittedSourceSpan: prelude.submittedSourceSpan,
    claims,
    claimVersions,
    edges,
    moves: [
      move("move.source_recorded", "source.recorded", sessionId, []),
      move("move.seed_claim_created", "seed_claim_created", sessionId, [requireMappedId(claimIds, seed.seedClaim.id)]),
      move(
        "move.assumptions_extracted",
        "assumptions_extracted",
        sessionId,
        seed.assumptions.map((assumption) => requireMappedId(claimIds, assumption.id)),
      ),
      move("move.first_challenge_suggested", "first_challenge_suggested", sessionId, [
        requireMappedId(claimIds, seed.firstChallenge.targetClaimId),
      ]),
    ],
    brainRun: {
      ...prelude.brainRun,
      status: "succeeded",
      output: seed,
      completedAt: now,
    },
    idMaps: {
      claimIds,
      claimVersionIds,
      edgeIds,
    },
  };
}

function move(seedId: string, kind: PersistedBrainSeed["moves"][number]["kind"], sessionId: string, claimIds: string[]) {
  return {
    id: uuidAt(500 + claimIds.length + seedId.length),
    seedId,
    userId: "dev-user-1",
    workspaceId: "dev-workspace-1",
    projectId: "dev-project-1",
    sphereId: "dev-sphere-1",
    sessionId,
    kind,
    summary: seedId,
    payload: {
      claimIds,
      edgeIds: [],
      sourceIds: [],
      sourceSpanIds: [],
    },
    createdAt: new Date("2026-04-30T00:00:00.000Z"),
  };
}

function autopilotResponse(sessionId: string): ThinkingModeTickResponse {
  const selectedCandidate = candidate(sessionId, "check", "challenge", "Check the weakest claim");

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
      reason: "Check the weakest claim.",
      updatedAt: "2026-04-30T00:00:01.000Z",
    },
    modeContract: {
      validModes: ["Learn", "Check", "Brain"],
      activeMode: "Check",
    },
    candidates: [
      selectedCandidate,
      candidate(sessionId, "learn", "learn", "Learn the key concept"),
      candidate(sessionId, "verify", "verify", "Verify with evidence"),
    ],
    selectedCandidate,
    graphHash: "graph-hash",
    persistedMoveIds: [uuidAt(601)],
    move: {
      id: uuidAt(601),
      kind: "next_move_recomputed",
      summary: "Autopilot picked the next move.",
      payload: {},
      createdAt: "2026-04-30T00:00:01.000Z",
    },
  };
}

function candidate(
  sessionId: string,
  userAction: "learn" | "check" | "verify" | "save_to_brain",
  mode: "learn" | "challenge" | "verify" | "artifact",
  label: string,
): ThinkingModeTickResponse["candidates"][number] {
  const action =
    userAction === "check"
      ? "challenge"
      : userAction;

  return {
    id: uuidAt(userAction.length + 700),
    candidateId: `candidate-${userAction}`,
    fingerprint: `fingerprint-${userAction}`,
    rank: userAction === "check" ? 1 : 2,
    targetClaimId: uuidAt(201),
    targetEdgeId: mode === "challenge" ? uuidAt(301) : null,
    action,
    userAction,
    mode,
    mvpMode: mode === "learn" ? "Learn" : "Check",
    label,
    primaryActionLabel: label,
    score: 900,
    reason: `${label}.`,
    whyNow: `${label}.`,
    reasonCodes: [userAction],
    exitCriteria: {
      label: `${label} completes.`,
      acceptedMoveKinds: [],
    },
    scoreBreakdown: {
      leverage: 100,
      fragility: 100,
      stakes: 100,
      readiness: 100,
      momentum: 100,
      novelty: 100,
      shape: 0,
      penalties: 0,
    },
    graphHash: "graph-hash",
    provenance: {
      engine: "thinking-mode-next-move-v1",
      graphHash: "graph-hash",
      source: "thinking_graph_snapshot",
      ruleIds: [userAction],
      claimIds: [uuidAt(201)],
      edgeIds: [],
      moveIds: [uuidAt(501)],
      artifactIds: [],
    },
    candidateBrainObjects: [],
    selected: userAction === "check",
    selectedAt: userAction === "check" ? "2026-04-30T00:00:01.000Z" : null,
  };
}

function requireMappedId(ids: Map<string, string>, seedId: string): string {
  const persistedId = ids.get(seedId);

  assert.ok(persistedId, `Missing persisted id for ${seedId}`);
  return persistedId;
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
