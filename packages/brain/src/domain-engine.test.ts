import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildGraphHash,
  rankNextMoveCandidates,
  selectNextMove,
  type NextMoveScoreBreakdown,
} from "./domain/engine.ts";
import type { PennyYcDemoGraphFixture, ThinkingClaim, ThinkingEdge, ThinkingGraphSnapshot, ThinkingMove } from "./domain/types.ts";

const scoreBreakdownKeys = [
  "leverage",
  "fragility",
  "stakes",
  "readiness",
  "momentum",
  "novelty",
  "shape",
  "penalties",
] satisfies Array<keyof NextMoveScoreBreakdown>;

test("rankNextMoveCandidates ranks the founder adoption assumption first without mutating input", () => {
  const graph = loadFixture();
  const before = structuredClone(graph);
  const candidates = rankNextMoveCandidates(graph, 5);
  const selected = candidates[0];

  assert.ok(selected);
  assert.equal(selected.rank, 1);
  assert.equal(selected.action, "challenge");
  assert.equal(selected.targetClaimId, graph.expectedAutopilot.lowConfidenceMarketAssumptionId);
  assert.equal(selected.graphHash, buildGraphHash(graph));
  assert.equal(selected.score, sumScore(selected.scoreBreakdown));
  assert.deepEqual(Object.keys(selected.scoreBreakdown).sort(), [...scoreBreakdownKeys].sort());
  assert.ok(selected.scoreBreakdown.shape >= 0);
  assert.match(selected.reason, /load-bearing risk/);
  assert.match(selected.whyPennyRecommendsThis, /Why Penny recommends this/);
  assert.ok(selected.exitCriteria.acceptedMoveKinds.includes("challenge_issued"));
  assert.ok(selected.fingerprint.length > 20);
  assert.equal(selected.provenance.engine, "thinking-mode-next-move-v1");
  assert.equal(selected.provenance.graphHash, selected.graphHash);
  assert.ok(selected.provenance.claimIds.includes(graph.expectedAutopilot.lowConfidenceMarketAssumptionId));

  const verifyCandidate = candidates.find((candidate) => candidate.targetClaimId === graph.expectedAutopilot.highConfidenceUnsupportedClaimId);
  assert.equal(verifyCandidate?.action, "verify");
  assert.ok(selected.score > (verifyCandidate?.score ?? 0));
  assert.deepEqual(graph, before);
});

test("selectNextMove returns resume_open_challenge for an unanswered challenge", () => {
  const graph = withOpenChallenge(loadFixture());
  const selected = selectNextMove(graph);

  assert.ok(selected);
  assert.equal(selected.action, "resume_open_challenge");
  assert.equal(selected.targetClaimId, graph.expectedAutopilot.lowConfidenceMarketAssumptionId);
  assert.equal(selected.targetEdgeId, "00000000-0000-4000-8000-000000000399");
  assert.match(selected.reason, /Resume the open challenge/);
  assert.ok(selected.exitCriteria.acceptedMoveKinds.includes("claim_revised"));
  assert.ok(selected.scoreBreakdown.readiness > 0);
});

test("selectNextMove can recommend save_to_brain after a challenge response", () => {
  const graph = withChallengeResponse(withOpenChallenge(loadFixture()));
  const selected = selectNextMove(graph);

  assert.ok(selected);
  assert.equal(selected.action, "save_to_brain");
  assert.equal(selected.mode, "artifact");
  assert.equal(selected.targetClaimId, graph.expectedAutopilot.lowConfidenceMarketAssumptionId);
  assert.equal(selected.targetEdgeId, "00000000-0000-4000-8000-000000000399");
  assert.ok(selected.exitCriteria.acceptedMoveKinds.includes("artifact_created"));
  assert.ok(selected.reasonCodes.includes("artifact_boundary"));
});

test("rankNextMoveCandidates recommends Learn when a dropped idea has concept confusion", () => {
  const seed = sampleClaim(1001, "belief", "Build a study autopilot for busy operators.", 76, ["seed"]);
  const concept = sampleClaim(
    1002,
    "concept",
    "Retrieval practice is unclear and creates a knowledge gap for this idea.",
    45,
    ["concept_gap"],
  );
  const question = sampleClaim(1003, "question", "Which learning loop should the user see first?", 72);
  const assumption = sampleClaim(1004, "assumption", "People will complete a short review after each session.", 74);
  const graph = sampleDroppedIdeaGraph({
    claims: [seed, concept, question, assumption],
    edges: [
      sampleEdge(1101, seed.id, assumption.id, "depends_on"),
      sampleEdge(1102, question.id, concept.id, "questions"),
      sampleEdge(1103, concept.id, seed.id, "teaches"),
      sampleEdge(1104, seed.id, assumption.id, "supports"),
    ],
  });
  const selected = selectNextMove(graph);

  assert.ok(selected);
  assert.equal(selected.action, "learn");
  assert.equal(selected.targetClaimId, concept.id);
  assert.ok(selected.reasonCodes.includes("concept_confusion_high"));
  assert.match(selected.whyPennyRecommendsThis, /Why Penny recommends this/);
});

test("rankNextMoveCandidates recommends Check when a dropped idea has fragile assumptions", () => {
  const seed = sampleClaim(1201, "belief", "Create a calm planning surface for personal projects.", 78, ["seed"]);
  const assumption = sampleClaim(
    1202,
    "assumption",
    "The workflow only works if people complete a daily review.",
    31,
    ["load_bearing"],
  );
  const question = sampleClaim(1203, "question", "What breaks if the daily review is skipped?", 70);
  const graph = sampleDroppedIdeaGraph({
    claims: [seed, assumption, question],
    edges: [sampleEdge(1301, seed.id, assumption.id, "depends_on"), sampleEdge(1302, question.id, assumption.id, "questions")],
  });
  const selected = selectNextMove(graph);

  assert.ok(selected);
  assert.equal(selected.action, "challenge");
  assert.equal(selected.targetClaimId, assumption.id);
  assert.ok(selected.reasonCodes.includes("assumption_fragility_high"));
  assert.match(selected.reason, /load-bearing risk/);
  assert.match(selected.whyPennyRecommendsThis, /Why Penny recommends this/);
});

test("rankNextMoveCandidates recommends Check for the YC demo idea's load-bearing creativity assumption", () => {
  const seed = sampleClaim(
    1801,
    "belief",
    "Penny is the most consistently efficient way to evoke creativity and turn it into structured, source-grounded thinking.",
    64,
    ["seed"],
  );
  const creativity = sampleClaim(
    1802,
    "assumption",
    "Penny can evoke better creative starting points more consistently than an open-ended chat or blank document.",
    46,
    ["load_bearing"],
  );
  const structure = sampleClaim(
    1803,
    "assumption",
    "Penny can turn that creative spark into claims, assumptions, checks, and sources without slowing the user down.",
    50,
  );
  const concept = sampleClaim(
    1804,
    "concept",
    "Source-grounded thinking keeps a visible path back to evidence, assumptions, or user-provided context.",
    74,
  );
  const graph = sampleDroppedIdeaGraph({
    claims: [seed, creativity, structure, concept],
    edges: [
      sampleEdge(1901, seed.id, creativity.id, "depends_on"),
      sampleEdge(1902, seed.id, structure.id, "depends_on"),
      sampleEdge(1903, concept.id, seed.id, "teaches"),
    ],
  });
  const selected = selectNextMove(graph);
  const candidates = rankNextMoveCandidates(graph, 4);

  assert.ok(selected);
  assert.equal(selected.action, "challenge");
  assert.equal(selected.mode, "challenge");
  assert.equal(selected.targetClaimId, creativity.id);
  assert.ok(selected.reasonCodes.includes("assumption_fragility_high"));
  assert.match(selected.reason, /load-bearing risk/);
  assert.ok(candidates.some((candidate) => candidate.action === "learn" && candidate.targetClaimId === concept.id));
});

test("rankNextMoveCandidates recommends Verify when a dropped idea has external factual claims", () => {
  const seed = sampleClaim(1401, "belief", "Build a founder workflow assistant.", 78, ["seed"]);
  const factualClaim = sampleClaim(
    1402,
    "belief",
    "40% of founders will pay $200/month for this workflow.",
    70,
    ["external_fact"],
  );
  const graph = sampleDroppedIdeaGraph({
    claims: [seed, factualClaim],
    edges: [sampleEdge(1501, factualClaim.id, seed.id, "supports")],
  });
  const selected = selectNextMove(graph);

  assert.ok(selected);
  assert.equal(selected.action, "verify");
  assert.equal(selected.targetClaimId, factualClaim.id);
  assert.ok(selected.reasonCodes.includes("external_factual_claim"));
  assert.ok(selected.reasonCodes.includes("source_grounding_needed"));
  assert.match(selected.reason, /source grounding/);
  assert.match(selected.whyPennyRecommendsThis, /Why Penny recommends this/);
});

test("rankNextMoveCandidates recommends Save when dropped idea structure is stable and useful", () => {
  const seed = sampleClaim(1601, "belief", "Turn meeting notes into a durable decision map.", 82, ["seed"]);
  const assumption = sampleClaim(1602, "assumption", "The user already has notes they want to organize.", 78, [], "resolved");
  const question = sampleClaim(1603, "question", "Which decision should be preserved first?", 76, [], "resolved");
  const concept = sampleClaim(1604, "concept", "Decision map", 82, [], "resolved");
  const graph = sampleDroppedIdeaGraph({
    claims: [seed, assumption, question, concept],
    edges: [
      sampleEdge(1701, seed.id, assumption.id, "depends_on"),
      sampleEdge(1702, question.id, seed.id, "questions"),
      sampleEdge(1703, concept.id, seed.id, "teaches"),
    ],
  });
  const selected = selectNextMove(graph);

  assert.ok(selected);
  assert.equal(selected.action, "save_to_brain");
  assert.equal(selected.targetClaimId, seed.id);
  assert.ok(selected.reasonCodes.includes("stable_structure"));
  assert.match(selected.whyPennyRecommendsThis, /Why Penny recommends this/);
});

test("buildGraphHash and ranking are stable when graph arrays are reordered", () => {
  const graph = loadFixture();
  const reordered: ThinkingGraphSnapshot = {
    ...graph,
    claims: [...graph.claims].reverse(),
    edges: [...graph.edges].reverse(),
    moves: [...graph.moves].reverse(),
    artifacts: [...graph.artifacts].reverse(),
  };

  assert.equal(buildGraphHash(reordered), buildGraphHash(graph));
  assert.deepEqual(
    rankNextMoveCandidates(reordered, 5).map(candidateKey),
    rankNextMoveCandidates(graph, 5).map(candidateKey),
  );
});

test("candidate fingerprint stays stable when only a recompute move is appended", () => {
  const graph = loadFixture();
  const first = rankNextMoveCandidates(graph, 1)[0];

  assert.ok(first);

  const recomputed: ThinkingGraphSnapshot = {
    ...graph,
    moves: [
      ...graph.moves,
      {
        id: "00000000-0000-4000-8000-000000000777",
        sessionId: graph.session.id,
        kind: "next_move_recomputed",
        summary: "Recomputed next moves and selected challenge.",
        payload: {
          graphHash: first.graphHash,
          selectedCandidateId: first.candidateId,
          selectedFingerprint: first.fingerprint,
          claimIds: [first.targetClaimId],
          edgeIds: first.targetEdgeId ? [first.targetEdgeId] : [],
          artifactIds: [],
        },
        createdAt: "2026-04-29T14:00:10.000Z",
      },
    ],
  };
  const second = rankNextMoveCandidates(recomputed, 1)[0];

  assert.ok(second);
  assert.notEqual(second.graphHash, first.graphHash);
  assert.equal(second.action, first.action);
  assert.equal(second.targetClaimId, first.targetClaimId);
  assert.equal(second.targetEdgeId, first.targetEdgeId);
  assert.equal(second.fingerprint, first.fingerprint);
  assert.equal(second.candidateId, first.candidateId);
});

function loadFixture(): PennyYcDemoGraphFixture {
  return JSON.parse(readFileSync(new URL("../../../test/fixtures/penny-yc-demo-graph.json", import.meta.url), "utf8")) as PennyYcDemoGraphFixture;
}

function withOpenChallenge(graph: PennyYcDemoGraphFixture): PennyYcDemoGraphFixture {
  const challengeEdge: ThinkingEdge = {
    id: "00000000-0000-4000-8000-000000000399",
    sessionId: graph.session.id,
    fromClaimId: graph.expectedAutopilot.highConfidenceUnsupportedClaimId,
    toClaimId: graph.expectedAutopilot.lowConfidenceMarketAssumptionId,
    kind: "challenges",
    status: "active",
    label: "challenge founder adoption",
    createdAt: "2026-04-29T14:00:09.000Z",
  };
  const challengeMove: ThinkingMove = {
    id: "00000000-0000-4000-8000-000000000509",
    sessionId: graph.session.id,
    kind: "challenge_issued",
    summary: "Issued a challenge against founder adoption.",
    payload: {
      claimIds: [challengeEdge.toClaimId, challengeEdge.fromClaimId],
      edgeIds: [challengeEdge.id],
      challengeEdgeId: challengeEdge.id,
    },
    createdAt: "2026-04-29T14:00:09.000Z",
  };

  return {
    ...graph,
    edges: [...graph.edges, challengeEdge],
    moves: [...graph.moves, challengeMove],
  };
}

function withChallengeResponse(graph: PennyYcDemoGraphFixture): PennyYcDemoGraphFixture {
  const responseMove: ThinkingMove = {
    id: "00000000-0000-4000-8000-000000000510",
    sessionId: graph.session.id,
    kind: "critique_absorbed",
    summary: "User absorbed the challenge as a live risk.",
    payload: {
      response: "absorb",
      targetClaimId: graph.expectedAutopilot.lowConfidenceMarketAssumptionId,
      targetClaimVersionId: "00000000-0000-4000-8000-000000000202",
      critiqueClaimId: graph.expectedAutopilot.highConfidenceUnsupportedClaimId,
      challengeEdgeId: "00000000-0000-4000-8000-000000000399",
      edgeStatus: "acknowledged_vulnerability",
      claimIds: [
        graph.expectedAutopilot.lowConfidenceMarketAssumptionId,
        graph.expectedAutopilot.highConfidenceUnsupportedClaimId,
      ],
      edgeIds: ["00000000-0000-4000-8000-000000000399"],
    },
    createdAt: "2026-04-29T14:00:20.000Z",
  };

  return {
    ...graph,
    moves: [...graph.moves, responseMove],
  };
}

function candidateKey(candidate: ReturnType<typeof rankNextMoveCandidates>[number]) {
  return [candidate.rank, candidate.action, candidate.targetClaimId, candidate.targetEdgeId, candidate.score];
}

function sumScore(scoreBreakdown: NextMoveScoreBreakdown): number {
  return Object.values(scoreBreakdown).reduce((total, value) => total + value, 0);
}

function sampleDroppedIdeaGraph(input: {
  claims: ReadonlyArray<ThinkingClaim>;
  edges: ReadonlyArray<ThinkingEdge>;
  moves?: ReadonlyArray<ThinkingMove>;
}): ThinkingGraphSnapshot {
  const sessionId = uuidAt(1000);
  const seedClaimId = input.claims[0]?.id ?? uuidAt(9999);

  return {
    session: {
      id: sessionId,
      status: "open",
      title: "Sample dropped idea",
      createdAt: "2026-04-30T10:00:00.000Z",
      endedAt: null,
    },
    focusState: {
      sessionId,
      mode: "brain",
      focusedClaimId: null,
      focusedEdgeId: null,
      source: "none",
      suggestionMoveId: null,
      manualMoveId: null,
      paused: false,
      reason: null,
      updatedAt: null,
    },
    claims: input.claims.map((claim) => ({ ...claim, sessionId })),
    edges: input.edges.map((edge) => ({ ...edge, sessionId })),
    moves: input.moves ?? [
      {
        id: uuidAt(1801),
        sessionId,
        kind: "seed_claim_created",
        summary: "Created the dropped idea seed claim.",
        payload: {
          claimId: seedClaimId,
          claimIds: [seedClaimId],
        },
        createdAt: "2026-04-30T10:00:01.000Z",
      },
      {
        id: uuidAt(1802),
        sessionId,
        kind: "assumptions_extracted",
        summary: "Structured the dropped idea into claims, assumptions, and questions.",
        payload: {
          claimIds: input.claims.map((claim) => claim.id),
          edgeIds: input.edges.map((edge) => edge.id),
        },
        createdAt: "2026-04-30T10:00:02.000Z",
      },
    ],
    artifacts: [],
  };
}

function sampleClaim(
  idNumber: number,
  kind: ThinkingClaim["kind"],
  text: string,
  confidence: number,
  tags: ReadonlyArray<string> = [],
  status: ThinkingClaim["status"] = "exploratory",
): ThinkingClaim {
  const id = uuidAt(idNumber);

  return {
    id,
    sessionId: uuidAt(1000),
    kind,
    currentVersionId: uuidAt(idNumber + 5000),
    text,
    confidence,
    status,
    createdAt: "2026-04-30T10:00:00.000Z",
    tags,
  };
}

function sampleEdge(idNumber: number, fromClaimId: string, toClaimId: string, kind: ThinkingEdge["kind"]): ThinkingEdge {
  return {
    id: uuidAt(idNumber),
    sessionId: uuidAt(1000),
    fromClaimId,
    toClaimId,
    kind,
    status: "active",
    label: null,
    createdAt: "2026-04-30T10:00:00.000Z",
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
