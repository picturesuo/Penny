import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLearnExperienceViewModel } from "../../../apps/web/lib/viewmodels/learn/learn-experience.ts";

test("learn experience builds a teach-back surface for the selected claim", () => {
  const viewModel = buildLearnExperienceViewModel({
    selectedMapId: "map-1",
    selectedClaimId: "claim-1",
    selectedClaim: {
      id: "claim-1",
      body: "Users retain concepts better when they teach them back.",
      confidenceBps: 7200,
    },
    learnState: {
      status: "placeholder",
      message: "Learn mode coming soon",
    },
    status: "placeholder",
    message: "Learn mode coming soon",
  });

  assert.equal(viewModel.heroTitle, "Teach back the selected claim");
  assert.deepEqual(viewModel.selectedClaim, {
    body: "Users retain concepts better when they teach them back.",
    confidenceLabel: "72% confidence",
  });
  assert.match(viewModel.teachBackPrompt, /Users retain concepts/);
  assert.deepEqual(
    viewModel.practiceSteps.map((step) => step.title),
    ["Explain", "Example", "Edge case"],
  );
  assert.deepEqual(
    viewModel.retrievalCards.map((card) => card.title),
    ["Plain-language recall", "Evidence hook", "Challenge memory"],
  );
  assert.deepEqual(viewModel.reviewState, {
    status: "placeholder",
    mapLabel: "map-1",
    claimLabel: "claim-1",
  });
});

test("learn experience keeps a clear no-claim state", () => {
  const viewModel = buildLearnExperienceViewModel({
    selectedMapId: null,
    selectedClaimId: null,
    selectedClaim: null,
    learnState: {
      status: "placeholder",
      message: "Learn mode coming soon",
    },
    status: "placeholder",
    message: "Learn mode coming soon",
  });

  assert.equal(viewModel.heroTitle, "Learn mode coming soon");
  assert.equal(viewModel.selectedClaim, null);
  assert.equal(viewModel.teachBackPrompt, "Select a claim before writing a teach-back.");
  assert.equal(viewModel.reviewState.mapLabel, "No map selected");
  assert.equal(viewModel.reviewState.claimLabel, "No claim selected");
});
