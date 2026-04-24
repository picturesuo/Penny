import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildLearnExperienceViewModel,
  getVisibleLearnState,
} from "../../../apps/web/lib/viewmodels/learn/learn-experience.ts";

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

  assert.equal(viewModel.experienceState.id, "active_concept");
  assert.equal(viewModel.heroTitle, "Users retain concepts better when they teach them back");
  assert.deepEqual(viewModel.concept, {
    title: "Users retain concepts better when they teach them back",
    explanation: "Users retain concepts better when they teach them back.",
  });
  assert.deepEqual(viewModel.selectedClaim, {
    body: "Users retain concepts better when they teach them back.",
    confidenceLabel: "72% confidence",
  });
  assert.match(viewModel.teachBackPrompt, /Users retain concepts/);
  assert.equal(viewModel.feedback.title, "Penny feedback");
  assert.match(viewModel.feedback.body, /concrete example/);
  assert.deepEqual(
    viewModel.practiceSteps.map((step) => step.title),
    ["Explain", "Example", "Edge case"],
  );
  assert.deepEqual(
    viewModel.retrievalCards.map((card) => card.title),
    ["Plain-language recall", "Evidence hook", "Challenge memory"],
  );
  assert.deepEqual(
    viewModel.relatedIdeas.map((idea) => idea.title),
    ["Source claim", "Evidence to recall", "Challenge memory"],
  );
  assert.deepEqual(viewModel.brainMiniMap, {
    current: "Users retain concepts better when they teach them back",
    neighbors: ["Map map-1", "Claim claim-1", "Challenge memory"],
  });
  assert.deepEqual(viewModel.switchConcept, {
    label: "Switch concept",
    disabled: true,
  });
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
  assert.equal(viewModel.experienceState.id, "placeholder");
  assert.deepEqual(viewModel.concept, {
    title: "No concept selected",
    explanation: "Choose a claim from Brain or Challenge so Learn can turn it into a teach-back concept.",
  });
  assert.equal(viewModel.selectedClaim, null);
  assert.equal(viewModel.teachBackPrompt, "Select a claim before writing a teach-back.");
  assert.equal(viewModel.feedback.title, "Penny feedback pending");
  assert.match(viewModel.feedback.body, /Select a concept/);
  assert.equal(viewModel.brainMiniMap.current, "No concept selected");
  assert.equal(viewModel.reviewState.mapLabel, "No map selected");
  assert.equal(viewModel.reviewState.claimLabel, "No claim selected");
});

test("learn experience distinguishes loading and error states from projection status", () => {
  const loadingViewModel = buildLearnExperienceViewModel({
    selectedMapId: null,
    selectedClaimId: null,
    selectedClaim: null,
    learnState: {
      status: "loading",
      message: "Loading Learn mode",
    },
    status: "loading",
    message: "Loading Learn mode",
  });

  assert.deepEqual(loadingViewModel.experienceState, {
    id: "loading",
    title: "Loading concept",
    body: "Penny is reading the current Learn projection.",
  });

  const errorViewModel = buildLearnExperienceViewModel({
    selectedMapId: null,
    selectedClaimId: null,
    selectedClaim: null,
    learnState: {
      status: "error",
      message: "Learn projection failed",
    },
    status: "error",
    message: "Learn projection failed",
  });

  assert.deepEqual(errorViewModel.experienceState, {
    id: "error",
    title: "Learn unavailable",
    body: "Learn projection failed",
  });
});

test("learn experience shows feedback state once a teach-back draft exists", () => {
  const viewModel = buildLearnExperienceViewModel({
    selectedMapId: "map-1",
    selectedClaimId: "claim-1",
    selectedClaim: {
      id: "claim-1",
      body: "Teach-back makes concept gaps visible.",
      confidenceBps: 6700,
    },
    learnState: {
      status: "placeholder",
      message: "Learn mode coming soon",
    },
    status: "placeholder",
    message: "Learn mode coming soon",
  });

  assert.equal(getVisibleLearnState(viewModel.experienceState, "").id, "active_concept");
  assert.deepEqual(getVisibleLearnState(viewModel.experienceState, "A draft explanation"), {
    id: "feedback_shown",
    title: "Feedback shown",
    body: "Penny is responding to the current teach-back draft.",
  });
});
