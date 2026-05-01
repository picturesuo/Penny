import assert from "node:assert/strict";
import test from "node:test";
import { createSearchBroker } from "./search-broker.ts";
import { shouldUseWebSearch } from "./search-decision-service.ts";

test("shouldUseWebSearch uses web when the user explicitly asks", () => {
  const decision = shouldUseWebSearch(
    {
      query: "network effects",
      userRequest: "Search the web and cite latest sources for current examples.",
      text: "Explain network effects in this idea.",
    },
    "learn",
    { brainContextSufficient: true },
  );

  assert.equal(decision.useWebSearch, true);
  assert.equal(decision.depth, "deep");
  assert.ok(decision.reasonCodes.includes("user_explicitly_asks"));
  assert.ok(decision.reasonCodes.includes("current_or_time_sensitive"));
});

test("shouldUseWebSearch detects current facts, named entities, evidence claims, and high stakes", () => {
  const decision = shouldUseWebSearch(
    {
      query: "OpenAI pricing changed this month",
      text: "OpenAI pricing changed this month and affects our financial forecast.",
    },
    "learn",
    {
      brainContext: "The Brain has no pricing rows.",
      knownBrainEntities: ["Penny"],
      brainContextSufficient: false,
    },
  );

  assert.equal(decision.useWebSearch, true);
  assert.equal(decision.depth, "deep");
  assert.equal(decision.filters.recencyDays, 30);
  assert.ok(decision.reasonCodes.includes("current_or_time_sensitive"));
  assert.ok(decision.reasonCodes.includes("named_entity_or_fact_not_in_brain"));
  assert.ok(decision.reasonCodes.includes("brain_context_insufficient"));
  assert.ok(decision.reasonCodes.includes("high_stakes_factual_claim"));
});

test("shouldUseWebSearch keeps local Learn context offline when Brain context is enough", () => {
  const decision = shouldUseWebSearch(
    {
      query: "scope",
      text: "Scope means the boundary around where my claim applies.",
      userRequest: "Explain this term in my local idea.",
    },
    "learn",
    { brainContext: "The local claim defines the idea boundary.", brainContextSufficient: true },
  );

  assert.equal(decision.useWebSearch, false);
  assert.equal(decision.depth, "fast");
  assert.deepEqual(decision.reasonCodes, []);
});

test("shouldUseWebSearch does not treat Brain context history as a web-search trigger", () => {
  const decision = shouldUseWebSearch(
    {
      query: "scope",
      text: "The idea improves clarity only inside one draft.",
      userRequest: "Explain this term using my local idea.",
    },
    "learn",
    {
      brainContext: "Recent moves used Learn for concept grounding.",
      brainContextSufficient: true,
    },
  );

  assert.equal(decision.useWebSearch, false);
  assert.deepEqual(decision.reasonCodes, []);
});

test("shouldUseWebSearch defaults Verify to source grounding", () => {
  const decision = shouldUseWebSearch(
    {
      query: "I want this idea to feel calmer than a generic dashboard.",
      text: "I want this idea to feel calmer than a generic dashboard.",
    },
    "verify",
    { verifyRequiresSources: true },
  );

  assert.equal(decision.useWebSearch, true);
  assert.equal(decision.depth, "deep");
  assert.ok(decision.reasonCodes.includes("verify_requires_sources"));
});

test("shouldUseWebSearch keeps Brain mode offline even with explicit search language", () => {
  const decision = shouldUseWebSearch(
    {
      query: "latest pricing",
      text: "Search the latest pricing and cite sources.",
      userRequest: "Search the web.",
    },
    "brain",
    {
      brainContextSufficient: false,
    },
  );

  assert.equal(decision.useWebSearch, false);
  assert.equal(decision.depth, "fast");
  assert.deepEqual(decision.reasonCodes, []);
  assert.match(decision.reason, /does not browse/);
});

test("SearchBroker attaches provider tool options and preserves unsupported filters in instructions", () => {
  const seenOptions: unknown[] = [];
  const broker = createSearchBroker({
    providerName: "test",
    webSearch(options) {
      seenOptions.push(options);
      return { kind: "web_search", options };
    },
  });
  const result = broker.prepare(
    {
      query: "retrieval practice study",
      text: "Find academic evidence for retrieval practice.",
      userRequest: "Use sources.",
    },
    "learn",
    {
      brainContextSufficient: false,
      filters: {
        allowedDomains: ["example.edu", "example.edu"],
        excludedDomains: ["spam.test"],
        recencyDays: 365,
        academic: true,
      },
    },
  );

  assert.equal(result.decision.useWebSearch, true);
  assert.ok(result.tools?.web_search);
  assert.deepEqual(seenOptions, [
    {
      allowedDomains: ["example.edu"],
      excludedDomains: ["spam.test"],
      enableImageUnderstanding: false,
    },
  ]);
  assert.match(result.instructions, /recency: last 365 days/);
  assert.match(result.instructions, /academic\/research sources preferred/);
});
