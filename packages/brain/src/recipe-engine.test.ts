import assert from "node:assert/strict";
import test from "node:test";
import {
  CheckRecipeContract,
  LearnRecipeContract,
  VerifyRecipeContract,
  createRecipeRun,
} from "./recipe-engine.ts";

test("recipe contracts define Learn, Verify, and Check step interfaces", () => {
  assert.deepEqual(
    LearnRecipeContract.steps.map((step) => step.key),
    ["retrieve_context", "explain_term", "structure_output"],
  );
  assert.deepEqual(
    VerifyRecipeContract.steps.map((step) => step.key),
    ["retrieve_local_context", "decide_search", "evaluate_evidence", "suggest_confidence"],
  );
  assert.deepEqual(
    CheckRecipeContract.steps.map((step) => step.key),
    ["retrieve_prior_patterns", "select_weakness", "issue_challenge"],
  );
  assert.deepEqual(VerifyRecipeContract.steps[0]?.expectedOutputs, ["hybridResults"]);
  assert.deepEqual(CheckRecipeContract.steps[0]?.requiredInputs, ["targetClaimId"]);
});

test("createRecipeRun initializes pending RecipeRun and RecipeStepRun records", () => {
  const run = createRecipeRun(VerifyRecipeContract, {
    id: uuidAt(701),
    sessionId: uuidAt(100),
    targetClaimId: uuidAt(101),
    startedAt: "2026-05-01T10:00:00.000Z",
    payload: {
      claimText: "Worked examples reduce cognitive load.",
    },
  });

  assert.equal(run.id, uuidAt(701));
  assert.equal(run.kind, "verify");
  assert.equal(run.status, "pending");
  assert.equal(run.targetClaimId, uuidAt(101));
  assert.equal(run.steps.length, VerifyRecipeContract.steps.length);
  assert.ok(run.steps.every((step) => step.status === "pending"));
  assert.deepEqual(run.steps[0]?.inputs, { required: ["claimId"] });
  assert.deepEqual(run.steps[0]?.outputs, { expected: ["hybridResults"] });
});

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
