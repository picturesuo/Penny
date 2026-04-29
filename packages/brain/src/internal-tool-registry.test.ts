import assert from "node:assert/strict";
import test from "node:test";
import {
  createPennyInternalToolRegistry,
  PennyInternalToolNotFoundError,
  pennyInternalToolNames,
  runPennyInternalTool,
  type PennyInternalToolServices,
} from "./tools/internal-tool-registry.ts";
import type {
  ChallengeClaimDto,
  ChallengeEdgeDto,
  ChallengeMoveDto,
  ChallengeRoundDto,
  IssueChallengeResponse,
  RespondToChallengeResponse,
} from "./services/challenge-service.ts";
import type { ChallengeBriefResponse } from "./services/challenge-brief-service.ts";
import type {
  ManualFocusResponse,
  StartNextMoveResponse,
  ThinkingModeCandidateDto,
  ThinkingModeMoveDto,
  ThinkingModeStateResponse,
  ThinkingModeTickResponse,
} from "./services/thinking-mode-service.ts";
import type { FocusState } from "./domain/types.ts";

test("internal tool registry exposes the seven Penny tools with schemas and handlers", () => {
  const registry = createPennyInternalToolRegistry(fakeServices([]));
  const tools = [...registry.values()];

  assert.deepEqual(
    tools.map((tool) => tool.name),
    [...pennyInternalToolNames],
  );

  for (const tool of tools) {
    assert.equal(typeof tool.description, "string");
    assert.equal(tool.description.length > 20, true);
    assert.equal(typeof tool.inputSchema.parse, "function");
    assert.equal(typeof tool.outputSchema.parse, "function");
    assert.equal(typeof tool.handler, "function");
  }
});

test("internal tool handlers call the existing services with validated input", async () => {
  const calls: string[] = [];
  const registry = createPennyInternalToolRegistry(fakeServices(calls));
  const brainId = uuidAt(900);
  const sessionId = uuidAt(101);
  const candidateId = "candidate-1";
  const claimId = uuidAt(201);
  const challengeId = uuidAt(501);
  const previousSuggestionMoveId = uuidAt(601);

  assert.equal(
    statusOf(await runPennyInternalTool(registry, "penny.get_autopilot_state", { brainId, sessionId })),
    "ready",
  );
  assert.equal(
    statusOf(await runPennyInternalTool(registry, "penny.tick_autopilot", { brainId, sessionId, resume: true, limit: 4 })),
    "ready",
  );
  assert.equal(
    statusOf(await runPennyInternalTool(registry, "penny.start_next_move", { brainId, sessionId, candidateId })),
    "started",
  );
  assert.equal(
    statusOf(
      await runPennyInternalTool(registry, "penny.select_manual_node", {
        brainId,
        sessionId,
        claimId,
        reason: "Inspect this assumption first.",
        previousSuggestionMoveId,
      }),
    ),
    "paused",
  );
  assert.equal(
    statusOf(await runPennyInternalTool(registry, "penny.issue_challenge", { brainId, sessionId, candidateId })),
    "issued",
  );
  assert.equal(
    statusOf(
      await runPennyInternalTool(registry, "penny.respond_to_challenge", {
        challengeId,
        response: "revise",
        revisedText: "Pre-seed founders pay only during an urgent fundraising or strategy moment.",
        reasoning: null,
      }),
    ),
    "responded",
  );
  assert.equal(
    statusOf(await runPennyInternalTool(registry, "penny.generate_challenge_brief", { sessionId })),
    "created",
  );

  assert.deepEqual(calls, [
    `thinking.getState:${brainId}:${sessionId}`,
    `thinking.tick:${brainId}:${sessionId}:true:4`,
    `thinking.startCandidate:${brainId}:${sessionId}:${candidateId}`,
    `thinking.manualFocus:${brainId}:${sessionId}:${claimId}:Inspect this assumption first.:${previousSuggestionMoveId}`,
    `challenge.issue:${brainId}:${sessionId}:${candidateId}`,
    `challenge.respond:${challengeId}:revise`,
    `brief.generate:${sessionId}`,
  ]);
});

test("internal tool runner rejects unknown tools and invalid input before service calls", async () => {
  const calls: string[] = [];
  const registry = createPennyInternalToolRegistry(fakeServices(calls));

  await assert.rejects(
    () => runPennyInternalTool(registry, "penny.tick_autopilot", { brainId: "not-a-uuid", sessionId: uuidAt(101) }),
    /Invalid UUID/,
  );
  await assert.rejects(
    () =>
      runPennyInternalTool(registry, "penny.start_next_move", {
        brainId: uuidAt(900),
        sessionId: uuidAt(101),
        candidateId: "",
      }),
    /Too small/,
  );
  await assert.rejects(
    () => runPennyInternalTool(registry, "penny.missing", {}),
    PennyInternalToolNotFoundError,
  );

  assert.deepEqual(calls, []);
});

test("internal tool handlers validate service output against their output schemas", async () => {
  const registry = createPennyInternalToolRegistry({
    ...fakeServices([]),
    thinkingModeService: {
      ...fakeServices([]).thinkingModeService,
      async getState() {
        return { status: "mutated" } as unknown as ThinkingModeStateResponse;
      },
    },
  });

  await assert.rejects(
    () =>
      runPennyInternalTool(registry, "penny.get_autopilot_state", {
        brainId: uuidAt(900),
        sessionId: uuidAt(101),
      }),
    /Invalid option/,
  );
});

function fakeServices(calls: string[]): PennyInternalToolServices {
  return {
    thinkingModeService: {
      async getState(brainId, sessionId) {
        calls.push(`thinking.getState:${brainId}:${sessionId}`);

        return thinkingStateResponse(brainId, sessionId);
      },
      async tick(input) {
        calls.push(`thinking.tick:${input.brainId}:${input.sessionId}:${String(input.resume)}:${String(input.limit)}`);

        return {
          ...thinkingStateResponse(input.brainId, input.sessionId),
          graphHash: "graph-hash-1",
          persistedMoveIds: [uuidAt(610)],
          move: thinkingMove("next_move_recomputed"),
        };
      },
      async startCandidate(input) {
        calls.push(`thinking.startCandidate:${input.brainId}:${input.sessionId}:${input.candidateId}`);

        return {
          status: "started",
          brainId: input.brainId,
          sessionId: input.sessionId,
          focusState: focusState(input.sessionId, "autopilot_started", false),
          selectedCandidate: candidate(),
          move: thinkingMove("autopilot_focus_started"),
        };
      },
      async manualFocus(input) {
        calls.push(
          `thinking.manualFocus:${input.brainId}:${input.sessionId}:${input.claimId}:${String(input.reason)}:${String(input.previousSuggestionMoveId)}`,
        );

        return {
          status: "paused",
          brainId: input.brainId,
          sessionId: input.sessionId,
          focusState: focusState(input.sessionId, "manual_selection", true),
          focusClaim: {
            id: input.claimId,
            versionId: uuidAt(301),
            kind: "assumption",
            status: "exploratory",
            text: "Pre-seed founders will pay before traction.",
            confidence: 45,
          },
          move: thinkingMove("manual_node_selected"),
        };
      },
    },
    challengeRoundService: {
      async issueChallengeFromCandidate(input) {
        calls.push(`challenge.issue:${input.brainId}:${input.sessionId}:${input.candidateId}`);

        return issueChallengeResponse(input.brainId, input.sessionId);
      },
      async respondToChallenge(input) {
        calls.push(`challenge.respond:${input.challengeId}:${input.response}`);

        return respondToChallengeResponse(input.challengeId, input.response);
      },
    },
    challengeBriefService: {
      async generateChallengeBrief(sessionId) {
        calls.push(`brief.generate:${sessionId}`);

        return challengeBriefResponse(sessionId);
      },
    },
  };
}

function statusOf(output: unknown): string {
  return (output as { status: string }).status;
}

function thinkingStateResponse(brainId: string, sessionId: string): ThinkingModeStateResponse {
  const selectedCandidate = candidate();

  return {
    status: "ready",
    brainId,
    sessionId,
    focusState: focusState(sessionId, "autopilot_suggestion", false),
    candidates: [selectedCandidate],
    selectedCandidate,
  };
}

function focusState(sessionId: string, source: FocusState["source"], paused: boolean): FocusState {
  return {
    sessionId,
    mode: "challenge",
    focusedClaimId: uuidAt(201),
    focusedEdgeId: null,
    source,
    suggestionMoveId: uuidAt(601),
    manualMoveId: paused ? uuidAt(602) : null,
    paused,
    reason: "Challenge the load-bearing assumption.",
    updatedAt: now(),
  };
}

function candidate(): ThinkingModeCandidateDto {
  return {
    id: uuidAt(701),
    candidateId: "candidate-1",
    fingerprint: "fingerprint-1",
    rank: 1,
    targetClaimId: uuidAt(201),
    targetEdgeId: null,
    action: "challenge",
    mode: "challenge",
    score: 900,
    reason: "Challenge the weakest assumption.",
    reasonCodes: ["unresolved_claim"],
    exitCriteria: {
      label: "A challenge is issued.",
      acceptedMoveKinds: ["challenge_issued"],
    },
    scoreBreakdown: {
      leverage: 200,
      fragility: 200,
      stakes: 150,
      readiness: 150,
      momentum: 100,
      novelty: 100,
      shape: 0,
      penalties: 0,
    },
    graphHash: "graph-hash-1",
    provenance: {
      engine: "thinking-mode-next-move-v1",
      graphHash: "graph-hash-1",
      source: "thinking_graph_snapshot",
      ruleIds: ["challenge"],
      claimIds: [uuidAt(201)],
      edgeIds: [],
      moveIds: [uuidAt(600)],
      artifactIds: [],
    },
    selected: true,
    selectedAt: now(),
  };
}

function thinkingMove(kind: string): ThinkingModeMoveDto {
  return {
    id: uuidAt(620),
    kind,
    summary: `${kind} summary.`,
    payload: {},
    createdAt: now(),
  };
}

function issueChallengeResponse(brainId: string, sessionId: string): IssueChallengeResponse {
  return {
    status: "issued",
    brainId,
    sessionId,
    challengeRound: challengeRound(null),
    targetClaim: challengeClaim(uuidAt(201), uuidAt(301), "Pre-seed founders will pay before traction."),
    critiqueClaim: challengeClaim(uuidAt(202), uuidAt(302), "Founders may defer better thinking unless it helps an urgent job."),
    challengeEdge: challengeEdge(),
    critique: "Founders may defer better thinking unless it helps an urgent job.",
    failureType: "shaky_assumption",
    strength: "strong",
    whyThis: "This is the load-bearing market assumption.",
    whatWouldResolveIt: "Name the urgent paid moment.",
    suggestedNextMove: "Defend, Revise, or Absorb.",
    move: challengeMove("challenge_issued"),
    brainRun: {
      id: uuidAt(801),
      status: "succeeded",
    },
  };
}

function respondToChallengeResponse(
  challengeId: string,
  response: "defend" | "revise" | "absorb",
): RespondToChallengeResponse {
  const moveKind = response === "defend" ? "user_defended" : response === "revise" ? "claim_revised" : "critique_absorbed";

  return {
    status: "responded",
    challengeRound: {
      ...challengeRound(response),
      id: challengeId,
      status: "responded",
      response,
      responseMoveId: uuidAt(621),
      focusCompletedMoveId: uuidAt(622),
      respondedAt: now(),
    },
    response,
    targetClaim: challengeClaim(uuidAt(201), uuidAt(303), "Pre-seed founders pay during urgent strategy moments."),
    critiqueClaimId: uuidAt(202),
    challengeEdge: challengeEdge(),
    move: challengeMove(moveKind),
    focusCompletedMove: challengeMove("focus_completed"),
    derivedEffects: [],
    receipt: {
      response,
      moveKind,
      targetClaimId: uuidAt(201),
      challengeEdgeId: uuidAt(401),
      previousClaimVersionId: response === "revise" ? uuidAt(301) : null,
      currentClaimVersionId: uuidAt(303),
      claimTextChanged: response === "revise",
      unresolvedRisk: response === "absorb",
    },
    nextMove: {
      status: "client_tick_required",
      requiredCommand: "tick_autopilot",
      sessionId: uuidAt(101),
      method: "POST",
      endpoint: `/api/sessions/${uuidAt(101)}/autopilot/tick`,
      body: {
        resume: true,
      },
      reason:
        "Challenge response completed focus; call tick to recompute backend-owned next-move candidates before rendering the next suggestion.",
      expectedMoveKind: "next_move_recomputed",
    },
  };
}

function challengeRound(response: ChallengeRoundDto["response"]): ChallengeRoundDto {
  return {
    id: uuidAt(501),
    sessionId: uuidAt(101),
    status: response ? "responded" : "open",
    response,
    targetClaimId: uuidAt(201),
    targetClaimVersionId: uuidAt(301),
    critiqueClaimId: uuidAt(202),
    critiqueClaimVersionId: uuidAt(302),
    challengeEdgeId: uuidAt(401),
    brainRunId: uuidAt(801),
    challengeMoveId: uuidAt(620),
    responseMoveId: response ? uuidAt(621) : null,
    focusCompletedMoveId: response ? uuidAt(622) : null,
    failureType: "shaky_assumption",
    strength: "strong",
    critique: "Founders may defer better thinking unless it helps an urgent job.",
    whyThis: "This is the load-bearing market assumption.",
    whatWouldResolveIt: "Name the urgent paid moment.",
    createdAt: now(),
    respondedAt: response ? now() : null,
    updatedAt: now(),
  };
}

function challengeClaim(id: string, versionId: string, text: string): ChallengeClaimDto {
  return {
    id,
    versionId,
    kind: "belief",
    status: "exploratory",
    text,
    confidence: 55,
  };
}

function challengeEdge(): ChallengeEdgeDto {
  return {
    id: uuidAt(401),
    fromClaimId: uuidAt(202),
    toClaimId: uuidAt(201),
    kind: "challenges",
    status: "active",
    label: "shaky_assumption",
  };
}

function challengeMove(kind: ChallengeMoveDto["kind"]): ChallengeMoveDto {
  return {
    id: kind === "focus_completed" ? uuidAt(622) : uuidAt(621),
    kind,
    summary: `${kind} summary.`,
    payload: {},
    createdAt: now(),
  };
}

function challengeBriefResponse(sessionId: string): ChallengeBriefResponse {
  const brief = challengeBriefPayload(sessionId);

  return {
    status: "created",
    sessionId,
    artifact: {
      id: uuidAt(901),
      kind: "challenge_brief",
      title: "Challenge Brief",
      summary: "Challenge Brief summary.",
      payload: brief,
      createdAt: now(),
    },
    move: {
      id: uuidAt(902),
      kind: "artifact_created",
      summary: "Generated a Challenge Brief artifact from persisted Thinking Mode state.",
      claimIds: [uuidAt(201)],
      edgeIds: [uuidAt(401)],
      artifactIds: [uuidAt(901)],
    },
    brainRun: {
      id: uuidAt(801),
      status: "succeeded",
    },
    brief,
  };
}

function challengeBriefPayload(sessionId: string): ChallengeBriefResponse["brief"] {
  return {
    kind: "challenge_brief",
    title: "Challenge Brief",
    sessionId,
    sections: {
      originalSeedIdea: {
        text: "I am building Penny for founders.",
        sourceId: uuidAt(151),
      },
      currentPrimaryClaim: {
        claimId: uuidAt(201),
        claimVersionId: uuidAt(303),
        text: "Pre-seed founders pay during urgent strategy moments.",
        confidence: 55,
      },
      keyAssumptions: [],
      selectedPressurePoint: {
        targetClaimId: uuidAt(201),
        targetClaimVersionId: uuidAt(303),
        targetEdgeId: uuidAt(401),
        failureType: "shaky_assumption",
        text: "Pre-seed founders pay during urgent strategy moments.",
      },
      whyPennyChoseIt: ["This was the selected challenge candidate."],
      challengeIssued: {
        text: "Founders may defer better thinking unless it helps an urgent job.",
        strength: "strong",
        whatWouldResolveIt: "Name the urgent paid moment.",
        challengeMoveId: uuidAt(620),
        challengeRoundId: uuidAt(501),
      },
      userResponse: {
        text: "Revise recorded.",
        response: "Revise",
        reasoning: null,
        moveId: uuidAt(621),
      },
      whatChanged: [
        {
          text: "Revised claim is now: Pre-seed founders pay during urgent strategy moments.",
          previousClaimVersionId: uuidAt(301),
          currentClaimVersionId: uuidAt(303),
          moveId: uuidAt(621),
        },
      ],
      openRisks: [],
      recommendedNextMove: {
        action: "challenge",
        targetClaimId: uuidAt(201),
        targetEdgeId: uuidAt(401),
        why: "Continue resolving the weakest pressure point.",
        expectedCompletionMove: "focus_completed",
      },
      moveTimelineSummary: [
        {
          moveId: uuidAt(620),
          kind: "challenge_issued",
          summary: "Issued a challenge.",
          createdAt: now(),
        },
      ],
    },
    refs: {
      sourceIds: [uuidAt(151)],
      sourceSpanIds: [uuidAt(152)],
      claimIds: [uuidAt(201), uuidAt(202)],
      claimVersionIds: [uuidAt(301), uuidAt(302), uuidAt(303)],
      edgeIds: [uuidAt(401)],
      moveIds: [uuidAt(620), uuidAt(621), uuidAt(622)],
      artifactIds: [],
    },
    inputs: {
      focusState: null,
      latestSelectedCandidate: null,
      challengeRoundIds: [uuidAt(501)],
    },
    generatedFrom: {
      claimCount: 2,
      currentClaimVersionCount: 2,
      moveCount: 3,
      challengeCount: 1,
    },
    generatedBy: {
      brainRunId: uuidAt(801),
      compiler: "challenge-brief-v0",
    },
  };
}

function now(): string {
  return "2026-04-29T00:00:00.000Z";
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
