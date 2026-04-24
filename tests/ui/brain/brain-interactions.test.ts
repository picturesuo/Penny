import assert from "node:assert/strict";
import { test } from "node:test";

import { createBrainInteractionUrl } from "../../../apps/web/lib/viewmodels/brain/interactions.ts";

test("createBrainInteractionUrl preserves selected claim while changing mode", () => {
  const url = createBrainInteractionUrl({
    currentHref: "http://localhost:3000/brain?mock=1&claimId=old-claim",
    mode: "challenge",
    selectedClaimId: "claim-123",
  });

  assert.equal(url, "http://localhost:3000/brain?mock=1&claimId=claim-123&mode=challenge");
});

test("createBrainInteractionUrl removes claim id when no claim is selected", () => {
  const url = createBrainInteractionUrl({
    currentHref: "http://localhost:3000/brain?mode=brain&claimId=old-claim",
    mode: "learn",
    selectedClaimId: null,
  });

  assert.equal(url, "http://localhost:3000/brain?mode=learn");
});
