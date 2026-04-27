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
  source: {
    id: "source.raw_idea",
    rawText: "Penny should make the first 60 seconds of thinking visibly useful.",
  },
  session: {
    id: "00000000-0000-4000-8000-000000000001",
    sourceId: "source.raw_idea",
    status: "seeded",
  },
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
  moves: [
    {
      id: "move.source.recorded",
      kind: "source.recorded",
      summary: "Recorded the raw idea as the source.",
      claimIds: [],
      edgeIds: [],
      artifactIds: [],
    },
    {
      id: "move.claim.created",
      kind: "claim.created",
      summary: "Created the seed claim and assumption claim.",
      claimIds: ["claim.seed", "claim.assumption.speed"],
      edgeIds: [],
      artifactIds: [],
    },
    {
      id: "move.edge.created",
      kind: "edge.created",
      summary: "Connected the seed claim to the speed assumption.",
      claimIds: ["claim.seed", "claim.assumption.speed"],
      edgeIds: ["edge.seed.speed"],
      artifactIds: [],
    },
    {
      id: "move.challenge.created",
      kind: "challenge.created",
      summary: "Challenged whether speed is the weakest part.",
      claimIds: ["claim.assumption.speed"],
      edgeIds: ["edge.seed.speed"],
      artifactIds: [],
    },
    {
      id: "move.artifact.created",
      kind: "artifact.created",
      summary: "Created the session outputs.",
      claimIds: ["claim.seed", "claim.assumption.speed"],
      edgeIds: ["edge.seed.speed"],
      artifactIds: ["artifact.idea_map", "artifact.challenge_brief"],
    },
  ],
  artifacts: [
    {
      id: "artifact.idea_map",
      kind: "idea_map",
      title: "Idea Map",
      summary: "Seed claim, hidden speed assumption, and typed dependency edge.",
      claimIds: ["claim.seed", "claim.assumption.speed"],
      edgeIds: ["edge.seed.speed"],
    },
    {
      id: "artifact.challenge_brief",
      kind: "challenge_brief",
      title: "Challenge Brief",
      summary: "The first challenge and Defend / Revise / Absorb response paths.",
      claimIds: ["claim.assumption.speed"],
      edgeIds: ["edge.seed.speed"],
    },
  ],
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
  assert.deepEqual(
    output.moves.map((move) => move.kind),
    ["source.recorded", "claim.created", "edge.created", "challenge.created", "artifact.created"],
  );
  assert.deepEqual(
    output.artifacts.map((artifact) => artifact.kind),
    ["idea_map", "challenge_brief"],
  );
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

test("parseBrainSeedOutput rejects moves with dangling artifact references", () => {
  const invalidOutput = {
    ...validSeedOutput,
    moves: validSeedOutput.moves.map((move) =>
      move.id === "move.artifact.created"
        ? {
            ...move,
            artifactIds: ["artifact.missing"],
          }
        : move,
    ),
  };

  assert.throws(
    () => parseBrainSeedOutput(invalidOutput),
    (error) => {
      assert.ok(error instanceof BrainSeedValidationError);
      assert.match(error.issues.join("\n"), /move\.artifactId must reference an artifact/);
      return true;
    },
  );
});

test("parseBrainSeedOutput requires Idea Map and Challenge Brief artifacts", () => {
  const invalidOutput = {
    ...validSeedOutput,
    artifacts: validSeedOutput.artifacts.filter((artifact) => artifact.kind !== "challenge_brief"),
    moves: validSeedOutput.moves.map((move) =>
      move.id === "move.artifact.created"
        ? {
            ...move,
            artifactIds: ["artifact.idea_map"],
          }
        : move,
    ),
  };

  assert.throws(
    () => parseBrainSeedOutput(invalidOutput),
    (error) => {
      assert.ok(error instanceof BrainSeedValidationError);
      assert.match(error.issues.join("\n"), /artifacts must include challenge_brief/);
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
  assert.ok(output.moves.some((move) => move.kind === "artifact.created"));
  assert.ok(output.artifacts.some((artifact) => artifact.kind === "idea_map"));
  assert.ok(output.artifacts.some((artifact) => artifact.kind === "challenge_brief"));
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
