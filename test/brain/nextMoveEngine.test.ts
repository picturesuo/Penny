import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { hashGraph, rankNextMoves, type PureNextMoveCandidate } from "../../packages/brain/src/next-move-engine.ts";
import type { ThinkingGraphSnapshot } from "../../packages/brain/src/domain/types.ts";

type DemoGraphFixture = ThinkingGraphSnapshot & {
  expectedAutopilot: {
    lowConfidenceMarketAssumptionId: string;
    highConfidenceUnsupportedClaimId: string;
    conceptClaimId: string;
  };
};

const fixturePath = resolve("test/fixtures/penny-yc-demo-graph.json");

test("founder willingness-to-pay assumption ranks first or top 2", () => {
  const graph = demoGraph();
  const ranking = rankNextMoves(graph);
  const founderMarketCandidate = candidateForClaim(ranking.candidates, graph.expectedAutopilot.lowConfidenceMarketAssumptionId);

  assert.ok(founderMarketCandidate, "expected a candidate for the founder market assumption");
  assert.equal(founderMarketCandidate.action, "challenge");
  assert.ok(founderMarketCandidate.rank <= 2);
  assert.match(founderMarketCandidate.reason, /load-bearing assumption/i);
});

test("candidate includes reason", () => {
  const ranking = rankNextMoves(demoGraph());

  assert.ok(ranking.selected?.reason);
  assert.match(ranking.selected.reason, /\S{12,}/);
});

test("candidate includes exitCriteria", () => {
  const ranking = rankNextMoves(demoGraph());

  assert.ok(ranking.selected?.exitCriteria);
  assert.match(ranking.selected.exitCriteria.label, /challenge|verify|learn|choose/i);
  assert.match(ranking.selected.exitCriteria.requiredMoveKind, /\S/);
});

test("scoreBreakdown exists", () => {
  const ranking = rankNextMoves(demoGraph());

  assert.ok(ranking.selected?.scoreBreakdown);
  assert.equal(typeof ranking.selected.scoreBreakdown.base, "number");
  assert.equal(
    Object.values(ranking.selected.scoreBreakdown).reduce((sum, value) => sum + value, 0),
    ranking.selected.score,
  );
});

test("open challenge produces resume_open_challenge", () => {
  const graph = withOpenChallenge(demoGraph());
  const ranking = rankNextMoves(graph);

  assert.equal(ranking.selected?.action, "resume_open_challenge");
  assert.equal(ranking.selected.targetClaimId, graph.expectedAutopilot.lowConfidenceMarketAssumptionId);
  assert.equal(ranking.selected.targetEdgeId, challengeEdgeId());
  assert.match(ranking.selected.reason, /open challenge/i);
});

test("concept node produces learn", () => {
  const graph = demoGraph();
  const ranking = rankNextMoves(graph);
  const conceptCandidate = candidateForClaim(ranking.candidates, graph.expectedAutopilot.conceptClaimId);

  assert.ok(conceptCandidate, "expected a candidate for the concept node");
  assert.equal(conceptCandidate.action, "learn");
  assert.equal(conceptCandidate.mode, "learn");
  assert.deepEqual(conceptCandidate.reasonCodes, ["concept_node", "learn_in_context"]);
});

test("high-confidence unsupported claim produces verify", () => {
  const graph = demoGraph();
  const ranking = rankNextMoves(graph);
  const verifyCandidate = candidateForClaim(ranking.candidates, graph.expectedAutopilot.highConfidenceUnsupportedClaimId);

  assert.ok(verifyCandidate, "expected a candidate for the high-confidence unsupported claim");
  assert.equal(verifyCandidate.action, "verify");
  assert.equal(verifyCandidate.mode, "verify");
  assert.ok(verifyCandidate.reasonCodes.includes("unsupported_claim"));
});

test("input graph is not mutated", () => {
  const graph = demoGraph();
  const before = JSON.stringify(graph);

  rankNextMoves(graph);

  assert.equal(JSON.stringify(graph), before);
});

test("fingerprint is stable for same graph/action", () => {
  const graph = demoGraph();
  const first = rankNextMoves(graph).selected;
  const second = rankNextMoves(graph).selected;

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.action, second.action);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.candidateId, second.candidateId);
});

test("graph hash changes when current claim version changes", () => {
  const graph = demoGraph();
  const changedGraph = demoGraph();
  const target = changedGraph.claims.find((claim) => claim.id === changedGraph.expectedAutopilot.lowConfidenceMarketAssumptionId);
  const currentVersion = target?.versions?.find((version) => version.isCurrent);

  assert.ok(target);
  assert.ok(currentVersion);

  currentVersion.text = `${currentVersion.text} Founder willingness to pay is now explicitly unproven.`;
  target.text = currentVersion.text;

  assert.notEqual(hashGraph(changedGraph), hashGraph(graph));
});

function demoGraph(): DemoGraphFixture {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as DemoGraphFixture;
}

function candidateForClaim(candidates: ReadonlyArray<PureNextMoveCandidate>, claimId: string): PureNextMoveCandidate | null {
  return candidates.find((candidate) => candidate.targetClaimId === claimId) ?? null;
}

function withOpenChallenge(graph: DemoGraphFixture): DemoGraphFixture {
  return {
    ...graph,
    edges: [
      ...graph.edges,
      {
        id: challengeEdgeId(),
        sessionId: graph.session.id,
        fromClaimId: "00000000-0000-4000-8000-000000000205",
        toClaimId: graph.expectedAutopilot.lowConfidenceMarketAssumptionId,
        kind: "challenges",
        status: "active",
        label: "willingness_to_pay_gap",
        createdAt: "2026-04-29T14:00:09.000Z",
      },
    ],
  };
}

function challengeEdgeId(): string {
  return "00000000-0000-4000-8000-000000000399";
}
