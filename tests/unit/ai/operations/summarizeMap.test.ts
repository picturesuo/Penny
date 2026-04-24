import assert from "node:assert/strict";
import test from "node:test";

import {
  SummarizeMapNotFoundError,
  SummarizeMapValidationError,
  summarizeMap,
  type SummarizeMapRepository,
} from "../../../../server/ai/operations/summarizeMap.ts";
import {
  buildSummarizeMapPromptInput,
  SUMMARIZE_MAP_PROMPT_VERSION,
} from "../../../../server/ai/prompts/summarizeMap/v1.ts";

function createRepository(): SummarizeMapRepository {
  return {
    async findMap(input) {
      if (input.mapId !== "map-1") {
        return null;
      }

      return {
        id: "map-1",
        title: "Onboarding Map",
      };
    },
    async findClaims() {
      return [
        {
          id: "claim-1",
          body: "Penny should shorten onboarding because activation improves when setup is fast.",
          confidenceBps: 7600,
        },
        {
          id: "claim-2",
          body: "Shorter onboarding may hide important tradeoffs unless users see examples.",
          confidenceBps: 6200,
        },
      ];
    },
  };
}

test("summarizeMap returns summary, key claims, tensions, and next questions", async () => {
  const result = await summarizeMap(
    {
      userId: "user-1",
      mapId: "map-1",
    },
    createRepository(),
  );

  assert.match(result.summary, /Onboarding Map/);
  assert.equal(result.keyClaims.length, 2);
  assert.match(result.keyClaims[0] ?? "", /shorten onboarding/);
  assert.ok(result.tensions.length >= 1);
  assert.ok(result.nextQuestions.includes("Which claim has the weakest evidence?"));
});

test("summarizeMap rejects invalid input", async () => {
  await assert.rejects(
    () => summarizeMap({ userId: "user-1", mapId: "" }, createRepository()),
    (error) => {
      assert.ok(error instanceof SummarizeMapValidationError);
      assert.equal(error.message, "mapId must not be blank.");
      return true;
    },
  );
});

test("summarizeMap rejects maps not owned by the user", async () => {
  await assert.rejects(
    () => summarizeMap({ userId: "user-1", mapId: "missing-map" }, createRepository()),
    (error) => {
      assert.ok(error instanceof SummarizeMapNotFoundError);
      return true;
    },
  );
});

test("summarizeMap prompt input exposes the operation metadata without provider code", () => {
  const promptInput = buildSummarizeMapPromptInput({
    mapId: "map-1",
    title: "Onboarding Map",
    claims: ["A test claim."],
  });

  assert.equal(SUMMARIZE_MAP_PROMPT_VERSION, "summarizeMap.v1");
  assert.equal(promptInput.operation, "summarizeMap");
  assert.equal(promptInput.promptVersion, "summarizeMap.v1");
  assert.deepEqual(promptInput.responseFields, ["summary", "keyClaims", "tensions", "nextQuestions"]);
});
