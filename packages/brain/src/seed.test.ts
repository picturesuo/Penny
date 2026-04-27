import assert from "node:assert/strict";
import test from "node:test";
import {
  BrainSeedProviderError,
  BrainSeedValidationError,
  createHeuristicBrainSeedProvider,
  createXaiBrainSeedProvider,
  generateBrainSeed,
  parseBrainSeedOutput,
  type BrainSeedOutput,
  type BrainSeedProvider,
} from "./seed.ts";

const validSeedOutput: BrainSeedOutput = {
  seedClaim: {
    id: "claim.seed",
    kind: "belief",
    text: "Penny should make the first 60 seconds of thinking visibly useful.",
    confidence: 0.72,
  },
  assumptions: [
    {
      id: "claim.assumption.speed",
      kind: "assumption",
      text: "Fast structure is more valuable than a conversational answer in the first loop.",
      confidence: 0.67,
      pressure: "high",
      whyItMatters: "If speed is not the main value, the MVP should optimize for depth instead.",
    },
  ],
  thoughtMap: {
    claims: [
      {
        id: "claim.seed",
        kind: "belief",
        text: "Penny should make the first 60 seconds of thinking visibly useful.",
        confidence: 0.72,
      },
      {
        id: "claim.assumption.speed",
        kind: "assumption",
        text: "Fast structure is more valuable than a conversational answer in the first loop.",
        confidence: 0.67,
      },
    ],
    edges: [
      {
        id: "edge.seed.speed",
        fromClaimId: "claim.seed",
        toClaimId: "claim.assumption.speed",
        kind: "assumes",
        label: "depends on speed being the main first-session value",
      },
    ],
  },
  explorationPaths: [
    {
      id: "path.shock",
      title: "Make usefulness visible",
      prompt: "What structure would make the user feel the idea changed in under a minute?",
      expectedValue: "Keeps the MVP centered on the first loop instead of feature breadth.",
    },
  ],
  keyInsight: "The first loop should create pressure-tested structure before it creates more conversation.",
  firstChallenge: {
    targetClaimId: "claim.assumption.speed",
    weakestPart: "The product may need trust more than speed.",
    challenge: "Defend whether speed is enough to feel useful without source-backed verification yet.",
    responseOptions: ["Defend", "Revise", "Absorb"],
  },
};

test("generateBrainSeed validates provider output into the Wave 1 structure", async () => {
  const provider: BrainSeedProvider = {
    name: "test",
    async generate() {
      return validSeedOutput;
    },
  };

  const output = await generateBrainSeed(
    { rawIdea: "Penny should make the first 60 seconds of thinking visibly useful." },
    { provider },
  );

  assert.equal(output.seedClaim.kind, "belief");
  assert.equal(output.assumptions[0]?.pressure, "high");
  assert.equal(output.thoughtMap.edges[0]?.kind, "assumes");
  assert.deepEqual(output.firstChallenge.responseOptions, ["Defend", "Revise", "Absorb"]);
});

test("generateBrainSeed rejects generic free-form provider text", async () => {
  const provider: BrainSeedProvider = {
    name: "bad",
    async generate() {
      return "Here is a chatty answer about your idea.";
    },
  };

  await assert.rejects(
    () => generateBrainSeed({ rawIdea: "Build a thinking cockpit." }, { provider }),
    (error) => {
      assert.ok(error instanceof BrainSeedValidationError);
      assert.match(error.issues.join("\n"), /expected object/);
      return true;
    },
  );
});

test("parseBrainSeedOutput rejects maps with dangling challenge references", () => {
  const invalidOutput = {
    ...validSeedOutput,
    firstChallenge: {
      ...validSeedOutput.firstChallenge,
      targetClaimId: "claim.missing",
    },
  };

  assert.throws(
    () => parseBrainSeedOutput(invalidOutput),
    (error) => {
      assert.ok(error instanceof BrainSeedValidationError);
      assert.match(error.issues.join("\n"), /firstChallenge\.targetClaimId must reference a thoughtMap claim/);
      return true;
    },
  );
});

test("heuristic provider keeps Wave 1 usable without live AI credentials", async () => {
  const output = await generateBrainSeed(
    { rawIdea: "I think source-backed memory should become a thinking cockpit." },
    { provider: createHeuristicBrainSeedProvider() },
  );

  assert.equal(output.seedClaim.text, "I think source-backed memory should become a thinking cockpit.");
  assert.ok(output.assumptions.length >= 1);
  assert.ok(output.explorationPaths.length >= 1);
  assert.deepEqual(output.firstChallenge.responseOptions, ["Defend", "Revise", "Absorb"]);
});

test("xAI provider requires an explicit model for live calls", async () => {
  const provider = createXaiBrainSeedProvider({ XAI_API_KEY: "test-key" });

  await assert.rejects(
    () => provider.generate({ rawIdea: "Map this idea before challenging it." }),
    (error) => {
      assert.ok(error instanceof BrainSeedProviderError);
      assert.equal(error.message, "XAI_BRAIN_SEED_MODEL or XAI_MODEL is required for the xAI brain seed provider.");
      return true;
    },
  );
});
