import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildGraphHash,
  rankNextMoveCandidates,
  selectNextMove,
  type NextMoveScoreBreakdown,
} from "./domain/engine.ts";
import type { PennyYcDemoGraphFixture, ThinkingEdge, ThinkingGraphSnapshot, ThinkingMove } from "./domain/types.ts";

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
  assert.equal(selected.scoreBreakdown.shape, 0);
  assert.match(selected.reason, /load-bearing risk/);
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
