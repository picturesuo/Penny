export type RecipeKind = "learn" | "verify" | "check";
export type RecipeStepStatus = "pending" | "running" | "completed" | "limited" | "failed" | "skipped";

export type RecipeStepRun = {
  id: string;
  recipeRunId: string;
  key: string;
  title: string;
  status: RecipeStepStatus;
  startedAt?: string;
  completedAt?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error?: string;
};

export type RecipeRun = {
  id: string;
  kind: RecipeKind;
  sessionId: string;
  targetClaimId?: string;
  status: RecipeStepStatus;
  startedAt: string;
  completedAt?: string;
  steps: RecipeStepRun[];
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
};

export type RecipeStepContract = {
  key: string;
  title: string;
  purpose: string;
  requiredInputs: readonly string[];
  expectedOutputs: readonly string[];
};

export type RecipeContract<Kind extends RecipeKind> = {
  kind: Kind;
  version: 1;
  title: string;
  goal: string;
  steps: readonly RecipeStepContract[];
};

export type LearnRecipe = RecipeContract<"learn">;
export type VerifyRecipe = RecipeContract<"verify">;
export type CheckRecipe = RecipeContract<"check">;

export type RecipeEngine = {
  plan<Kind extends RecipeKind>(
    recipe: RecipeContract<Kind>,
    input: {
      sessionId: string;
      targetClaimId?: string;
      payload: Record<string, unknown>;
    },
  ): RecipeRun;
};

export const LearnRecipeContract: LearnRecipe = {
  kind: "learn",
  version: 1,
  title: "Learn contextual explanation",
  goal: "Explain a confusing term inside the active Brain context and suggest the next Autopilot action.",
  steps: [
    step("retrieve_context", "Retrieve Brain context", "Find local Brain rows related to the term and active claim.", ["term", "currentClaimId"], ["hybridResults"]),
    step("explain_term", "Explain term", "Generate a compact contextual explanation.", ["term", "currentClaimText", "hybridResults"], ["explanation"]),
    step("structure_output", "Structure output", "Return candidate claims, assumptions, questions, gaps, and save candidates.", ["explanation"], ["learnOutput"]),
  ],
};

export const VerifyRecipeContract: VerifyRecipe = {
  kind: "verify",
  version: 1,
  title: "Verify source-grounded claim",
  goal: "Use local Brain/source context first, then external search when needed, to evaluate a claim.",
  steps: [
    step("retrieve_local_context", "Retrieve local context", "Gather local Brain rows and source rows before web search.", ["claimId"], ["hybridResults"]),
    step("decide_search", "Decide search", "Decide whether local context is enough or web search is needed.", ["claimText", "hybridResults"], ["searchDecision"]),
    step("evaluate_evidence", "Evaluate evidence", "Compare local and external evidence against the exact claim.", ["claimText", "sources"], ["evidenceCards"]),
    step("suggest_confidence", "Suggest confidence", "Return a pending confidence delta without mutating truth.", ["verdict"], ["confidenceDeltaSuggestion"]),
  ],
};

export const CheckRecipeContract: CheckRecipe = {
  kind: "check",
  version: 1,
  title: "Check structural weakness",
  goal: "Retrieve prior shapes, mistakes, and misconceptions, then challenge the weakest load-bearing claim.",
  steps: [
    step("retrieve_prior_patterns", "Retrieve prior patterns", "Find relevant shapes, mistakes, misconceptions, and graph neighbors.", ["targetClaimId"], ["hybridResults"]),
    step("select_weakness", "Select weakness", "Choose the load-bearing failure mode to pressure-test.", ["targetClaimText", "hybridResults"], ["failureType"]),
    step("issue_challenge", "Issue challenge", "Generate a Defend/Revise/Absorb-ready challenge.", ["failureType"], ["challenge"]),
  ],
};

export function createRecipeRun<Kind extends RecipeKind>(
  recipe: RecipeContract<Kind>,
  input: {
    id: string;
    sessionId: string;
    targetClaimId?: string;
    startedAt: string;
    payload: Record<string, unknown>;
  },
): RecipeRun {
  return {
    id: input.id,
    kind: recipe.kind,
    sessionId: input.sessionId,
    ...(input.targetClaimId ? { targetClaimId: input.targetClaimId } : {}),
    status: "pending",
    startedAt: input.startedAt,
    input: input.payload,
    steps: recipe.steps.map((contract, index) => ({
      id: `${input.id}:step:${index + 1}`,
      recipeRunId: input.id,
      key: contract.key,
      title: contract.title,
      status: "pending",
      inputs: {
        required: [...contract.requiredInputs],
      },
      outputs: {
        expected: [...contract.expectedOutputs],
      },
    })),
  };
}

function step(
  key: string,
  title: string,
  purpose: string,
  requiredInputs: readonly string[],
  expectedOutputs: readonly string[],
): RecipeStepContract {
  return {
    key,
    title,
    purpose,
    requiredInputs,
    expectedOutputs,
  };
}
