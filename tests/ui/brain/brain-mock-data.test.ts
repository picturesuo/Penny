import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createEmptyBrainProjection,
  createMockBrainProjection,
  shouldUseMockBrainData,
} from "../../../apps/web/lib/viewmodels/brain/mock-data.ts";
import { createBrainViewModel } from "../../../apps/web/lib/viewmodels/brain/create-brain-view-model.ts";

test("createMockBrainProjection returns a populated selected Brain projection", () => {
  const projection = createMockBrainProjection();
  const model = createBrainViewModel(projection);

  assert.equal(projection.currentContext?.mode, "brain");
  assert.equal(projection.mapSummary?.title, "Investor readiness");
  assert.equal(projection.claims.length, 4);
  assert.equal(projection.selectedClaim?.id, "mock-claim-founder-proof");
  assert.equal(model.stream.length, 4);
  assert.equal(model.selectedPanel?.title, "Penny should make every investor-facing claim traceable to the origin...");
  assert.equal(model.sphere.workSphere.label, "Work sphere");
  assert.equal(model.sphere.recentSessions.length, 4);
});

test("createEmptyBrainProjection returns a stable empty Brain projection", () => {
  const projection = createEmptyBrainProjection();
  const model = createBrainViewModel(projection);

  assert.equal(projection.mapSummary, null);
  assert.equal(projection.claims.length, 0);
  assert.equal(model.stream.length, 0);
  assert.equal(model.selectedPanel, null);
});

test("shouldUseMockBrainData reads mock query flags", () => {
  assert.equal(shouldUseMockBrainData("?mock=1"), true);
  assert.equal(shouldUseMockBrainData("mock=true"), true);
  assert.equal(shouldUseMockBrainData("?brainMock=true"), true);
  assert.equal(shouldUseMockBrainData("?mock=0"), false);
  assert.equal(shouldUseMockBrainData(""), false);
});
