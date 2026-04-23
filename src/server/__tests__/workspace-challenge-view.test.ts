import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChallengeViewFromState,
} from "@/server/workspace-projections";
import {
  challengeIds,
  createClaimRecord,
  createCritiqueRecord,
  createMapRecord,
  createPriorRoundRecord,
  createRoundRecord,
} from "@/server/__tests__/fixtures/challenge";

function createChallengeState(options: {
  critiqueRecord?: ReturnType<typeof createCritiqueRecord> | null;
  roundOverrides?: Record<string, unknown>;
}) {
  const currentRound = createRoundRecord(options.roundOverrides);
  const priorRound = createPriorRoundRecord();
  const mapRecord = createMapRecord();
  const claimRecord = createClaimRecord();

  return {
    parsed: {
      userId: challengeIds.userId,
      workspaceContextId: challengeIds.workspaceContextId,
      contextKey: "workspace:test",
      mapId: challengeIds.mapId,
      mode: "challenge" as const,
    },
    contextRecord: null,
    mode: "challenge" as const,
    mapRecord,
    claimRecords: [claimRecord],
    selectedClaim: claimRecord,
    roundRecords: [currentRound, priorRound],
    critiqueByRoundId: new Map(
      options.critiqueRecord ? [[challengeIds.roundId, options.critiqueRecord]] : [],
    ),
    eventRecords: [],
  };
}

test("buildChallengeViewFromState reports pending critique state", () => {
  const view = buildChallengeViewFromState(
    createChallengeState({
      roundOverrides: {
        uncertainty: {
          critiqueStatus: "pending",
          critiqueRequestId: "req-pending",
          critiqueIdempotencyKey: "idem-pending",
          promptVersion: "challenge-critique-v1",
          qualityTier: "standard",
          critiqueRequestedAt: "2026-04-23T14:00:00.000Z",
          userGoal: "Pressure-test the architecture choice.",
        },
      },
    }),
  );

  assert.equal(view.critique?.status, "pending");
  assert.equal(view.critique?.requestId, "req-pending");
  assert.equal(view.critique?.userGoal, "Pressure-test the architecture choice.");
  assert.deepEqual(view.shell.breadcrumb, ["Work", "Market Thesis", "Distribution Claim"]);
});

test("buildChallengeViewFromState reports ready critique state from validated output", () => {
  const view = buildChallengeViewFromState(
    createChallengeState({
      critiqueRecord: createCritiqueRecord(),
      roundOverrides: {
        uncertainty: {
          critiqueStatus: "ready",
          critiqueRequestId: "req-ready",
          critiqueIdempotencyKey: "idem-ready",
          claimVersion: "1713874500000",
          critiqueRunId: "run-ready",
          qualityTier: "standard",
          critiqueRepairAttempted: false,
        },
      },
    }),
  );

  assert.equal(view.critique?.status, "ready");
  assert.equal(view.critique?.provider, "xai");
  assert.equal(view.critique?.conciseCritiqueSummary, createCritiqueRecord().headline);
  assert.equal(view.currentRound?.id, challengeIds.roundId);
  assert.equal(view.priorRound?.id, challengeIds.priorRoundId);
});

test("buildChallengeViewFromState reports failed critique state from uncertainty metadata", () => {
  const view = buildChallengeViewFromState(
    createChallengeState({
      roundOverrides: {
        uncertainty: {
          critiqueStatus: "failed",
          critiqueRequestId: "req-failed",
          critiqueIdempotencyKey: "idem-failed",
          promptVersion: "challenge-critique-v1",
          qualityTier: "degraded",
          critiqueRunId: "run-failed",
          critiqueRequestedAt: "2026-04-23T14:00:00.000Z",
          critiqueFailedAt: "2026-04-23T14:01:00.000Z",
          critiqueError: "Provider timeout",
          critiqueRepairAttempted: null,
        },
      },
    }),
  );

  assert.equal(view.critique?.status, "failed");
  assert.equal(view.critique?.errorMessage, "Provider timeout");
  assert.equal(view.critique?.qualityTier, "degraded");
});
