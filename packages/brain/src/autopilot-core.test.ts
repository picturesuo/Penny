import assert from "node:assert/strict";
import test from "node:test";
import { getAutopilotPauseState, rankAutopilotMoves, type AutopilotState } from "./autopilot-core.ts";

test("rankAutopilotMoves prioritizes an unanswered challenge over other graph work", () => {
  const state = autopilotState();
  const ranking = rankAutopilotMoves(state);

  assert.equal(ranking.status, "ready");
  assert.equal(ranking.suggestion?.action, "respond_to_challenge");
  assert.equal(ranking.suggestion?.mode, "challenge");
  assert.equal(ranking.suggestion?.targetClaimId, uuidAt(202));
  assert.equal(ranking.suggestion?.targetEdgeId, uuidAt(401));
  assert.deepEqual(ranking.suggestion?.goThere, {
    label: "Go there",
    targetClaimId: uuidAt(202),
    targetEdgeId: uuidAt(401),
    mode: "challenge",
  });
  assert.match(ranking.suggestion?.why ?? "", /Defend, Revise, or Absorb/);
});

test("rankAutopilotMoves falls back to load-bearing assumption review when no challenge is open", () => {
  const state = autopilotState({
    moves: [
      {
        id: uuidAt(501),
        sessionId: uuidAt(101),
        kind: "user_defended",
        payload: {
          challengeEdgeId: uuidAt(401),
          edgeIds: [uuidAt(401)],
          claimIds: [uuidAt(202), uuidAt(203)],
        },
        createdAt: dateAt(5),
      },
    ],
  });
  const ranking = rankAutopilotMoves(state);

  assert.equal(ranking.suggestion?.action, "review_assumption");
  assert.equal(ranking.suggestion?.targetClaimId, uuidAt(202));
  assert.ok(ranking.candidates.some((candidate) => candidate.action === "create_challenge_brief"));
});

test("rankAutopilotMoves suggests a challenge brief after a challenge response when assumptions are resolved", () => {
  const state = autopilotState({
    claims: [
      claim(uuidAt(201), "belief", "exploratory", "Penny should guide the next thinking move.", 70, 1),
      claim(uuidAt(202), "assumption", "committed", "Users trust explicit reasoning for navigation.", 66, 2),
      claim(uuidAt(203), "belief", "exploratory", "Trust may matter more than speed.", 62, 3),
    ],
    moves: [
      {
        id: uuidAt(501),
        sessionId: uuidAt(101),
        kind: "claim_revised",
        payload: {
          challengeEdgeId: uuidAt(401),
          edgeIds: [uuidAt(401)],
          claimIds: [uuidAt(202), uuidAt(203)],
        },
        createdAt: dateAt(5),
      },
    ],
  });
  const ranking = rankAutopilotMoves(state);

  assert.equal(ranking.suggestion?.action, "create_challenge_brief");
  assert.equal(ranking.suggestion?.mode, "artifact");
  assert.equal(ranking.suggestion?.targetEdgeId, uuidAt(401));
});

test("getAutopilotPauseState pauses when manual node selection is newer than the latest suggestion", () => {
  const pause = getAutopilotPauseState([
    {
      id: uuidAt(501),
      sessionId: uuidAt(101),
      kind: "autopilot_suggested",
      payload: { targetClaimId: uuidAt(201) },
      createdAt: dateAt(1),
    },
    {
      id: uuidAt(502),
      sessionId: uuidAt(101),
      kind: "manual_node_selected",
      payload: { claimId: uuidAt(202) },
      createdAt: dateAt(2),
    },
  ]);

  assert.equal(pause.paused, true);
  assert.equal(pause.manualMoveId, uuidAt(502));
  assert.equal(pause.focusedClaimId, uuidAt(202));
  assert.equal(pause.pausedAt, dateAt(2).toISOString());
});

function autopilotState(overrides: Partial<AutopilotState> = {}): AutopilotState {
  const sessionId = uuidAt(101);

  return {
    session: {
      id: sessionId,
      status: "open",
      createdAt: dateAt(1),
    },
    sessionId,
    claims: [
      claim(uuidAt(201), "belief", "exploratory", "Penny should guide the next thinking move.", 70, 1),
      claim(uuidAt(202), "assumption", "exploratory", "Users trust explicit reasoning for navigation.", 54, 2),
      claim(uuidAt(203), "belief", "exploratory", "Trust may matter more than speed.", 62, 3),
    ],
    edges: [
      {
        id: uuidAt(301),
        sessionId,
        fromClaimId: uuidAt(201),
        toClaimId: uuidAt(202),
        kind: "depends_on",
        status: "active",
        label: "depends on trust",
        createdAt: dateAt(3),
      },
      {
        id: uuidAt(401),
        sessionId,
        fromClaimId: uuidAt(203),
        toClaimId: uuidAt(202),
        kind: "challenges",
        status: "active",
        label: "shaky_assumption",
        createdAt: dateAt(4),
      },
    ],
    moves: [],
    artifacts: [],
    ...overrides,
  };
}

function claim(
  id: string,
  kind: "belief" | "assumption",
  status: "exploratory" | "committed",
  text: string,
  confidence: number,
  index: number,
) {
  return {
    id,
    sessionId: uuidAt(101),
    kind,
    status,
    text,
    confidence,
    versionId: uuidAt(700 + index),
    createdAt: dateAt(index),
    updatedAt: dateAt(index),
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function dateAt(value: number): Date {
  return new Date(`2026-04-29T00:00:0${value}.000Z`);
}
