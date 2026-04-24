import assert from "node:assert/strict";
import { test } from "node:test";

import { buildChallengeExperienceViewModel } from "../../../apps/web/lib/viewmodels/challenge/challenge-experience.ts";

test("challenge experience surfaces critique cards and dependency cascade", () => {
  const viewModel = buildChallengeExperienceViewModel({
    activeClaim: {
      id: "claim-1",
      body: "Penny should challenge claims before users rely on them.",
      confidenceBps: 6400,
    },
    activeChallengeRound: {
      id: "round-1",
      status: "started",
    },
    critiqueStatus: "ready",
    critiqueState: {
      status: "ready",
      critiqueId: "critique-1",
      body: "Main challenge: the workflow may slow users down.",
      critiquePayload: {
        critique: {
          conciseCritiqueSummary: "The workflow may slow users down.",
          strongestCounterargument: "A fast capture loop may matter more than rigorous critique for early use.",
          assumptions: ["Users have enough time to review a critique."],
          likelyFailureModes: ["Users skip Challenge when the prompt feels too heavy."],
          followUpQuestions: ["Which claims deserve challenge before action?"],
          suggestedConfidenceDelta: -12,
          uncertaintyNote: "The right cadence depends on user intent.",
        },
        metadata: {
          provider: "test-provider",
          model: "test-model",
          promptVersion: "test-prompt-v1",
        },
      },
    },
    responseState: {
      status: "not_recorded",
    },
  });

  assert.deepEqual(viewModel.selectedClaim, {
    body: "Penny should challenge claims before users rely on them.",
    confidenceLabel: "64% confidence",
  });
  assert.equal(viewModel.strongestCounterargument, "A fast capture loop may matter more than rigorous critique for early use.");
  assert.equal(viewModel.keyWeaknessSummary, "The workflow may slow users down.");
  assert.ok(viewModel.whatsAtStake.items.includes("Users skip Challenge when the prompt feels too heavy."));
  assert.equal(viewModel.critiqueTransparency.provider, "test-provider");
  assert.equal(viewModel.critiqueTransparency.model, "test-model");
  assert.equal(viewModel.critiqueTransparency.promptVersion, "test-prompt-v1");
  assert.deepEqual(viewModel.dependencyCascade.assumptions, ["Users have enough time to review a critique."]);
  assert.deepEqual(viewModel.dependencyCascade.followUpQuestions, ["Which claims deserve challenge before action?"]);
  assert.deepEqual(
    viewModel.responseActions.map((action) => action.label),
    ["Defend", "Revise", "Absorb"],
  );
  assert.equal(viewModel.canRequestCritique, true);
  assert.equal(viewModel.canRecordResponse, true);
});

test("challenge experience has useful empty states before critique exists", () => {
  const viewModel = buildChallengeExperienceViewModel({
    activeClaim: null,
    activeChallengeRound: null,
    critiqueStatus: "not_requested",
    critiqueState: {
      status: "not_requested",
      critiqueId: null,
    },
  });

  assert.equal(viewModel.selectedClaim, null);
  assert.equal(viewModel.canStartChallenge, false);
  assert.equal(viewModel.canRequestCritique, false);
  assert.equal(viewModel.canRecordResponse, false);
  assert.match(viewModel.strongestCounterargument, /Request critique/);
  assert.match(viewModel.whatsAtStake.summary, /Select a claim/);
  assert.equal(viewModel.critiqueTransparency.status, "not_requested");
});
