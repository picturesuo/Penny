import assert from "node:assert/strict";
import test from "node:test";
import {
  BrainSeedProviderError,
  BrainSeedValidationError,
  buildBrainSeedPrompt,
  buildBrainSeedSystemPrompt,
  createHeuristicBrainSeedProvider,
  createXaiBrainSeedProvider,
  defaultXaiBrainSeedModel,
  generateBrainSeed,
  parseBrainSeedOutput,
  resolveXaiBrainSeedModel,
  SeedProviderSchema,
  SeedStrictSchema,
  type BrainSeedOutput,
  type BrainSeedGenerateText,
  type BrainSeedProvider,
} from "./seed.ts";
import { BrainRunGuardError } from "./brain-run-guard.ts";

const validSeedOutput: BrainSeedOutput = {
  source: {
    id: "source.raw_idea",
    rawText: "Penny should make the first 60 seconds of thinking visibly useful.",
  },
  session: {
    id: "00000000-0000-4000-8000-000000000001",
    sourceId: "source.raw_idea",
    status: "open",
  },
  seedClaim: {
    id: "claim.seed",
    kind: "belief",
    text: "Penny should make the first 60 seconds of thinking visibly useful.",
    confidence: 72,
  },
  assumptions: [
    {
      id: "claim.assumption.speed",
      kind: "assumption",
      text: "Fast structure is more valuable than a conversational answer in the first loop.",
      confidence: 67,
      pressure: "high",
      whyItMatters: "If speed is not the main value, the MVP should optimize for depth instead.",
    },
    {
      id: "claim.assumption.visible",
      kind: "assumption",
      text: "The user can recognize useful thinking structure within the first minute.",
      confidence: 61,
      pressure: "medium",
      whyItMatters: "If usefulness is not visible quickly, the first loop may feel like hidden processing.",
    },
    {
      id: "claim.assumption.challenge",
      kind: "assumption",
      text: "A direct weakest-part challenge helps more than another generated answer.",
      confidence: 58,
      pressure: "high",
      whyItMatters: "If the challenge feels arbitrary, Defend / Revise / Absorb will not be trusted.",
    },
  ],
  thoughtMap: {
    claims: [
      {
        id: "claim.seed",
        kind: "belief",
        text: "Penny should make the first 60 seconds of thinking visibly useful.",
        confidence: 72,
      },
      {
        id: "claim.assumption.speed",
        kind: "assumption",
        text: "Fast structure is more valuable than a conversational answer in the first loop.",
        confidence: 67,
      },
      {
        id: "claim.assumption.visible",
        kind: "assumption",
        text: "The user can recognize useful thinking structure within the first minute.",
        confidence: 61,
      },
      {
        id: "claim.assumption.challenge",
        kind: "assumption",
        text: "A direct weakest-part challenge helps more than another generated answer.",
        confidence: 58,
      },
    ],
    edges: [
      {
        id: "edge.seed.speed",
        fromClaimId: "claim.seed",
        toClaimId: "claim.assumption.speed",
        kind: "depends_on",
        label: "depends on speed being the main first-session value",
      },
      {
        id: "edge.seed.visible",
        fromClaimId: "claim.seed",
        toClaimId: "claim.assumption.visible",
        kind: "depends_on",
        label: "depends on usefulness being visible quickly",
      },
      {
        id: "edge.seed.challenge",
        fromClaimId: "claim.seed",
        toClaimId: "claim.assumption.challenge",
        kind: "depends_on",
        label: "depends on the challenge being trusted",
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
    {
      id: "path-first-move",
      title: "Name the first Move",
      prompt: "What exact meaningful change happens after the raw idea is entered?",
      expectedValue: "Keeps durable history attached to the first loop.",
    },
    {
      id: "path-visible-map",
      title: "Show the map delta",
      prompt: "Which claim, edge, or challenge should visibly appear first?",
      expectedValue: "Separates structure from generic chat output.",
    },
    {
      id: "path-weakest-part",
      title: "Stress the weakest part",
      prompt: "Which assumption would force a major revision if it failed?",
      expectedValue: "Keeps Challenge tied to the load-bearing assumption.",
    },
    {
      id: "path-response",
      title: "Test response choices",
      prompt: "What would Defend, Revise, or Absorb each preserve as a Move?",
      expectedValue: "Makes the next user action durable instead of conversational.",
    },
    {
      id: "path-learn",
      title: "Find the confusing term",
      prompt: "Which concept needs a short contextual explanation before the user can decide?",
      expectedValue: "Keeps Learn subordinate to the challenge loop.",
    },
  ],
  keyInsight: "The first loop should create pressure-tested structure before it creates more conversation.",
  firstChallenge: {
    targetClaimId: "claim.assumption.speed",
    failureType: "shaky_assumption",
    weakestPart: "The product may need trust more than speed.",
    challenge: "Defend whether speed is enough to feel useful without source-backed verification yet.",
    responseOptions: ["Defend", "Revise", "Absorb"],
  },
  learnCandidates: [
    {
      id: "learn.load-bearing",
      claimId: "claim.assumption.challenge",
      term: "load-bearing assumption",
      whyItMatters: "The challenge is only useful if it targets the assumption that would change the idea most.",
      unblockExplanation:
        "A load-bearing assumption is the belief the rest of the idea depends on. If it fails, the idea needs revision rather than polish.",
    },
  ],
};

test("generateBrainSeed validates provider output into the Wave 3 seed structure", async () => {
  const provider: BrainSeedProvider = {
    name: "test",
    async generate() {
      return validSeedOutput;
    },
  };

  const output = await generateBrainSeed(
    { rawIdea: "Penny should make the first 60 seconds of thinking visibly useful." },
    { provider, brainRunId: "00000000-0000-4000-8000-000000000701" },
  );

  assert.equal(output.seedClaim.kind, "belief");
  assert.equal(output.session.status, "open");
  assert.equal(output.seedClaim.confidence, 72);
  assert.equal(output.assumptions[0]?.pressure, "high");
  assert.equal(output.thoughtMap.edges[0]?.kind, "depends_on");
  assert.equal(output.firstChallenge.failureType, "shaky_assumption");
  assert.deepEqual(output.firstChallenge.responseOptions, ["Defend", "Revise", "Absorb"]);
  assert.equal(output.learnCandidates[0]?.claimId, "claim.assumption.challenge");
  assert.equal("moves" in output, false);
  assert.equal("artifacts" in output, false);
});

test("parseBrainSeedOutput accepts counterargument and Learn graph edge kinds", () => {
  const output = parseBrainSeedOutput({
    ...validSeedOutput,
    thoughtMap: {
      claims: [
        ...validSeedOutput.thoughtMap.claims,
        {
          id: "claim.counterargument.trust",
          kind: "belief",
          text: "A visible first minute may still fail if the user needs provenance before trusting the structure.",
          confidence: 54,
        },
        {
          id: "claim.concept.load-bearing",
          kind: "concept",
          text: "A load-bearing assumption is the premise that would force a major revision if it failed.",
          confidence: 76,
        },
      ],
      edges: [
        ...validSeedOutput.thoughtMap.edges,
        {
          id: "edge.counterargument.seed",
          fromClaimId: "claim.counterargument.trust",
          toClaimId: "claim.seed",
          kind: "contradicts",
          label: "contradicts usefulness without provenance",
        },
        {
          id: "edge.concept.assumption",
          fromClaimId: "claim.concept.load-bearing",
          toClaimId: "claim.assumption.challenge",
          kind: "teaches",
          label: "teaches the challenged assumption concept",
        },
      ],
    },
  });

  assert.ok(output.thoughtMap.edges.some((edge) => edge.kind === "contradicts"));
  assert.ok(output.thoughtMap.edges.some((edge) => edge.kind === "teaches"));
});

test("generateBrainSeed requires a recorded BrainRun id before provider generation", async () => {
  let called = false;
  const provider: BrainSeedProvider = {
    name: "test",
    async generate() {
      called = true;
      return validSeedOutput;
    },
  };

  await assert.rejects(
    () => generateBrainSeed({ rawIdea: "Build a thinking cockpit." }, { provider }),
    (error) => {
      assert.ok(error instanceof BrainRunGuardError);
      assert.match(error.message, /brain\.seed/);
      return true;
    },
  );
  assert.equal(called, false);
});

test("prompt keeps Penny on structural seed extraction", () => {
  const system = buildBrainSeedSystemPrompt();
  const prompt = buildBrainSeedPrompt({
    rawIdea: "Build a second brain that challenges the user's weakest assumption.",
    sessionId: "00000000-0000-4000-8000-000000000123",
  });

  assert.match(system, /on the user's team/);
  assert.match(system, /Extract hidden assumptions/);
  assert.match(system, /load-bearing structure/);
  assert.match(system, /Avoid generic startup, product, productivity, or AI-app platitudes/);
  assert.match(prompt, /confidence values must be integer percentages/i);
  assert.match(prompt, /Defend, Revise, Absorb/);
  assert.match(prompt, /Do not return moves/);
  assert.match(prompt, /Do not return artifacts/);
  assert.match(prompt, /00000000-0000-4000-8000-000000000123/);
});

test("generateBrainSeed rejects generic free-form provider text", async () => {
  const provider: BrainSeedProvider = {
    name: "bad",
    async generate() {
      return "Here is a chatty answer about your idea.";
    },
  };

  await assert.rejects(
    () => generateBrainSeed({ rawIdea: "Build a thinking cockpit." }, { provider, brainRunId: "00000000-0000-4000-8000-000000000701" }),
    (error) => {
      assert.ok(error instanceof BrainSeedValidationError);
      assert.match(error.issues.join("\n"), /expected object/);
      return true;
    },
  );
});

test("SeedProviderSchema stays loose while SeedStrictSchema enforces local quality gates", () => {
  const looseProviderOutput = {
    ...validSeedOutput,
    seedClaim: {
      ...validSeedOutput.seedClaim,
      text: "",
      confidence: 120,
    },
    assumptions: validSeedOutput.assumptions.slice(0, 2),
    explorationPaths: validSeedOutput.explorationPaths.slice(0, 5),
  };

  assert.equal(SeedProviderSchema.safeParse(looseProviderOutput).success, true);

  const strict = SeedStrictSchema.safeParse(looseProviderOutput);
  assert.equal(strict.success, false);

  if (!strict.success) {
    const issues = strict.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    assert.match(issues, /seedClaim\.text/);
    assert.match(issues, /seedClaim\.confidence/);
    assert.match(issues, /assumptions/);
    assert.match(issues, /explorationPaths/);
  }
});

test("parseBrainSeedOutput requires failureType on the first challenge", () => {
  const invalidOutput = {
    ...validSeedOutput,
    firstChallenge: {
      targetClaimId: validSeedOutput.firstChallenge.targetClaimId,
      weakestPart: validSeedOutput.firstChallenge.weakestPart,
      challenge: validSeedOutput.firstChallenge.challenge,
      responseOptions: validSeedOutput.firstChallenge.responseOptions,
    },
  };

  assert.throws(
    () => parseBrainSeedOutput(invalidOutput),
    (error) => {
      assert.ok(error instanceof BrainSeedValidationError);
      assert.match(error.issues.join("\n"), /firstChallenge\.failureType/);
      return true;
    },
  );
});

test("parseBrainSeedOutput rejects generic structured provider responses", () => {
  const invalidOutput = {
    ...validSeedOutput,
    keyInsight: "Here is a chatty answer about your idea.",
  };

  assert.throws(
    () => parseBrainSeedOutput(invalidOutput),
    (error) => {
      assert.ok(error instanceof BrainSeedValidationError);
      assert.match(error.issues.join("\n"), /keyInsight must be specific structured seed content/);
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

test("parseBrainSeedOutput strips seed-time moves and artifacts from provider extras", () => {
  const invalidOutput = {
    ...validSeedOutput,
    moves: [
      {
        id: "move.model-authored",
        kind: "artifact.created",
        summary: "A model-authored move should not survive seed parsing.",
        claimIds: ["claim.seed"],
        edgeIds: [],
        artifactIds: ["artifact.model-authored"],
      },
    ],
    artifacts: [
      {
        id: "artifact.model-authored",
        kind: "challenge_brief",
        title: "Model-authored artifact",
        summary: "Seed artifacts should be compiled later from persisted state.",
        claimIds: ["claim.seed"],
        edgeIds: [],
      },
    ],
  };
  const output = parseBrainSeedOutput(invalidOutput);

  assert.equal("moves" in output, false);
  assert.equal("artifacts" in output, false);
});

test("parseBrainSeedOutput rejects learn candidates with dangling claim references", () => {
  const invalidOutput = {
    ...validSeedOutput,
    learnCandidates: validSeedOutput.learnCandidates.map((candidate) => ({
      ...candidate,
      claimId: "claim.missing",
    })),
  };

  assert.throws(
    () => parseBrainSeedOutput(invalidOutput),
    (error) => {
      assert.ok(error instanceof BrainSeedValidationError);
      assert.match(error.issues.join("\n"), /learnCandidate\.claimId must reference a thoughtMap claim/);
      return true;
    },
  );
});

test("parseBrainSeedOutput does not require seed-time artifacts", () => {
  const output = parseBrainSeedOutput(validSeedOutput);

  assert.equal("artifacts" in output, false);
});

test("heuristic provider keeps seed extraction usable without live AI credentials", async () => {
  const output = await generateBrainSeed(
    { rawIdea: "I think source-backed memory should become a thinking cockpit." },
    { provider: createHeuristicBrainSeedProvider(), brainRunId: "00000000-0000-4000-8000-000000000701" },
  );

  assert.equal(output.seedClaim.text, "I think source-backed memory should become a thinking cockpit.");
  assert.ok(output.assumptions.length >= 3);
  assert.match(output.assumptions[0]?.text ?? "", /bottleneck|structure/i);
  assert.equal(output.firstChallenge.failureType, "definition_failure");
  assert.match(output.firstChallenge.weakestPart, /cognitive load|define/i);
  assert.ok(output.explorationPaths.length >= 6);
  assert.equal(output.learnCandidates[0]?.term, "the user's cognitive load");
  assert.deepEqual(output.firstChallenge.responseOptions, ["Defend", "Revise", "Absorb"]);
  assert.equal("moves" in output, false);
  assert.equal("artifacts" in output, false);
});

test("heuristic provider gives the YC demo idea a sharp first-loop structure", async () => {
  const rawIdea =
    "Penny is the most consistently efficient way to evoke creativity and turn it into structured, source-grounded thinking.";
  const output = await generateBrainSeed(
    { rawIdea },
    { provider: createHeuristicBrainSeedProvider(), brainRunId: "00000000-0000-4000-8000-000000000703" },
  );

  assert.equal(output.seedClaim.text, rawIdea);
  assert.equal(output.assumptions.length, 3);
  assert.match(output.keyInsight, /inspectable, challengeable, and source-grounded/);
  assert.match(output.assumptions[0]?.text ?? "", /creative starting points/);
  assert.match(output.assumptions[1]?.text ?? "", /claims, assumptions, checks, and sources/);
  assert.equal(output.firstChallenge.targetClaimId, "claim.assumption.creativity");
  assert.equal(output.firstChallenge.failureType, "shaky_assumption");
  assert.match(output.firstChallenge.challenge, /strong prompt in a chat window/);
  assert.ok(output.thoughtMap.claims.some((claim) => claim.kind === "question" && /first-session signal/.test(claim.text)));
  assert.ok(output.thoughtMap.claims.some((claim) => claim.kind === "concept" && /Source-grounded thinking/.test(claim.text)));
  assert.deepEqual(
    output.learnCandidates.map((candidate) => candidate.term),
    ["source-grounded thinking", "structured creativity"],
  );
  assert.ok(output.explorationPaths.some((path) => /grounding threshold/i.test(path.title)));
});

test("xAI provider uses AI SDK structured output with the default model", async () => {
  const calls: Parameters<BrainSeedGenerateText>[0][] = [];
  const generateText: BrainSeedGenerateText = async (request) => {
    calls.push(request);

    return { output: validSeedOutput };
  };

  const provider = createXaiBrainSeedProvider({ XAI_API_KEY: "test-key" }, { generateText });
  const output = await generateBrainSeed(
    { rawIdea: "Penny should make the first 60 seconds of thinking visibly useful." },
    { provider, brainRunId: "00000000-0000-4000-8000-000000000701" },
  );

  assert.equal(output.seedClaim.text, "Penny should make the first 60 seconds of thinking visibly useful.");
  assert.equal(resolveXaiBrainSeedModel({}), defaultXaiBrainSeedModel);
  assert.equal(calls.length, 1);
  assert.match(calls[0]?.system ?? "", /hidden assumptions/i);
  assert.match(calls[0]?.prompt ?? "", /load-bearing assumption/i);
  assert.match(calls[0]?.prompt ?? "", /Search decision/);
  assert.equal(calls[0]?.tools, undefined);
  assert.equal(calls[0]?.providerOptions.xai.store, false);
  assert.equal("reasoningEffort" in (calls[0]?.providerOptions.xai ?? {}), false);
});

test("xAI seed provider attaches web search only for decision-backed Learn inputs", async () => {
  const calls: Parameters<BrainSeedGenerateText>[0][] = [];
  const generateText: BrainSeedGenerateText = async (request) => {
    calls.push(request);

    return { output: validSeedOutput };
  };

  const provider = createXaiBrainSeedProvider({ XAI_API_KEY: "test-key" }, { generateText });
  await generateBrainSeed(
    { rawIdea: "Search current OpenAI pricing before structuring this product margin idea." },
    { provider, brainRunId: "00000000-0000-4000-8000-000000000702" },
  );

  assert.ok(calls[0]?.tools?.web_search);
  assert.match(calls[0]?.prompt ?? "", /current_or_time_sensitive/);
});

test("xAI provider lets env override the default seed model", () => {
  assert.equal(resolveXaiBrainSeedModel({ XAI_MODEL: "custom-general-model" }), "custom-general-model");
  assert.equal(resolveXaiBrainSeedModel({ XAI_BRAIN_SEED_MODEL: "custom-seed-model" }), "custom-seed-model");
});

test("xAI provider requires an API key for live calls", async () => {
  const provider = createXaiBrainSeedProvider({});

  await assert.rejects(
    () => provider.generate({ rawIdea: "Map this idea before challenging it." }),
    (error) => {
      assert.ok(error instanceof BrainSeedProviderError);
      assert.equal(error.message, "XAI_API_KEY is required for the xAI brain seed provider.");
      return true;
    },
  );
});
