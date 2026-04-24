import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { PROMPT_VERSION } from "../../server/ai/prompts/generateChallengeCritique/v1.ts";
import { GenerateChallengeCritiqueOutputSchema } from "../../server/ai/schemas/challengeCritique.ts";

const projectRoot = process.cwd();

test("docs/AI_RULES.md exists", () => {
  assert.equal(existsSync(resolve(projectRoot, "docs/AI_RULES.md")), true);
});

test("setup docs list the required backend and AI environment variables", () => {
  const setupDoc = readFileSync(resolve(projectRoot, "docs/setup.md"), "utf8");

  for (const variableName of [
    "DATABASE_URL",
    "DATABASE_DIRECT_URL",
    "ANTHROPIC_API_KEY",
    "XAI_API_KEY",
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
  ]) {
    assert.match(setupDoc, new RegExp(`\\b${variableName}\\b`), `Missing env var in docs/setup.md: ${variableName}`);
  }
});

test("GenerateChallengeCritiqueOutputSchema accepts the expected critique shape", () => {
  const result = GenerateChallengeCritiqueOutputSchema.safeParse({
    summary: "The claim depends on an unproven behavior change.",
    strongestCounterargument: "The observed behavior may only hold for highly engaged pilot users.",
    assumptions: ["Pilot users represent the broader user base."],
    failureModes: ["The retention lift disappears outside founder-led onboarding."],
    followUpQuestions: ["Which segment breaks this claim first?"],
    suggestedConfidenceBps: 4200,
    uncertaintyNote: "The available evidence is still early and narrow.",
  });

  assert.equal(result.success, true);
});

test("GenerateChallengeCritiqueOutputSchema rejects malformed critique output", () => {
  const result = GenerateChallengeCritiqueOutputSchema.safeParse({
    summary: "Too loose",
    strongestCounterargument: "",
    assumptions: [""],
    failureModes: "not-an-array",
    followUpQuestions: ["What breaks?"],
    suggestedConfidenceBps: -1,
    uncertaintyNote: "Unknown.",
  });

  assert.equal(result.success, false);
});

test("generateChallengeCritique prompt version is pinned to v1", () => {
  assert.equal(PROMPT_VERSION, "generateChallengeCritique.v1");
});
