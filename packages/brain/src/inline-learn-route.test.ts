import assert from "node:assert/strict";
import test from "node:test";
import {
  InlineLearnConflictError,
  InlineLearnGenerationError,
  InlineLearnNotFoundError,
  InlineLearnOutputSchema,
  InlineLearnProviderError,
  InlineLearnProviderSchema,
  createDefaultAskPennyProvider,
  createHeuristicInlineLearnProvider,
  createXaiInlineLearnProvider,
  defaultXaiInlineLearnModel,
  generateInlineLearnOutput,
  handleAskPennyRequest,
  handleInlineLearnRequest,
  handleInlineLearnSaveRequest,
  parseInlineLearnOutput,
  resolveXaiInlineLearnModel,
  type InlineLearnGenerateText,
  type InlineLearnRequest,
  type InlineLearnSaveRequest,
} from "./inline-learn-route.ts";
import { BrainRunGuardError } from "./brain-run-guard.ts";
import type { HybridRetrievalContext, HybridRetrievalMode } from "./hybrid-retrieval.ts";

test("POST /brain/learn/inline validates requests before running Learn", async () => {
  let learned = false;
  const response = await handleInlineLearnRequest(
    request("http://localhost/brain/learn/inline", {
      term: "",
      currentClaimId: "not-a-uuid",
      sessionId: uuidAt(100),
      localContext: "The current assumption depends on cognitive load.",
    }),
    {
      async learnInline() {
        learned = true;
        throw new Error("learnInline should not run");
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string; issues: string[] } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_request");
  assert.match(payload.error.issues.join("\n"), /term/);
  assert.match(payload.error.issues.join("\n"), /currentClaimId/);
  assert.equal(learned, false);
});

test("POST /brain/learn/ask answers freeform step questions without a claim", async () => {
  const response = await handleAskPennyRequest(
    request("http://localhost/brain/learn/ask", {
      question: "Give me a concrete example.",
      currentStepTitle: "Produce the final takeaway",
      localContext: "Goal: understand the pricing decision. Current step: produce the final takeaway.",
    }),
    {
      provider: {
        name: "anthropic",
        model: "claude-test",
        async generate(input) {
          return {
            answer: `Example for ${input.currentStepTitle}: convert the lesson into one pricing rule and one next test.`,
            provider: "anthropic",
            model: "claude-test",
          };
        },
      },
    },
  );
  const payload = (await response.json()) as { data: { answer: string; provider: string; model: string } };

  assert.equal(response.status, 200);
  assert.equal(payload.data.provider, "anthropic");
  assert.equal(payload.data.model, "claude-test");
  assert.match(payload.data.answer, /pricing rule/);
});

test("Ask Penny provider selection prefers Claude then xAI then heuristic", () => {
  assert.equal(createDefaultAskPennyProvider({ ANTHROPIC_API_KEY: "claude", XAI_API_KEY: "xai" }).name, "anthropic");
  assert.equal(createDefaultAskPennyProvider({ XAI_API_KEY: "xai" }).name, "xai");
  assert.equal(createDefaultAskPennyProvider({}).name, "heuristic");
});

test("POST /brain/learn/inline returns a contextual explanation without saved graph rows by default", async () => {
  let inputSeen: InlineLearnRequest | undefined;
  const response = await handleInlineLearnRequest(
    request("http://localhost/brain/learn/inline", {
      term: "cognitive load",
      currentClaimId: uuidAt(101),
      sessionId: uuidAt(100),
      localContext: "The assumption says reduced cognitive load improves study behavior.",
    }),
    {
      async learnInline(input) {
        inputSeen = input;

        return {
          ...learnOutput("cognitive load"),
          brainRun: {
            id: uuidAt(201),
            status: "succeeded",
          },
        };
      },
    },
  );
  const payload = (await response.json()) as {
    data: {
      term: string;
      explanation: string;
      saved?: unknown;
      brainRun: { status: string };
    };
  };

  assert.equal(response.status, 200);
  assert.equal(inputSeen?.save, false);
  assert.equal(payload.data.term, "cognitive load");
  assert.match(payload.data.explanation, /mental effort/);
  assert.equal(payload.data.saved, undefined);
  assert.equal(payload.data.brainRun.status, "succeeded");
});

test("POST /brain/learn/inline can save the concept claim, teaches edge, and learning_triggered move", async () => {
  const currentClaimId = uuidAt(101);
  const response = await handleInlineLearnRequest(
    request("http://localhost/brain/learn/inline", {
      term: "working memory",
      currentClaimId,
      sessionId: uuidAt(100),
      localContext: "This assumption depends on the user's ability to keep steps in mind.",
      save: true,
    }),
    {
      async learnInline(input) {
        return {
          ...learnOutput(input.term),
          brainRun: {
            id: uuidAt(201),
            status: "succeeded",
          },
          saved: savedConcept(input.term, currentClaimId),
        };
      },
    },
  );
  const payload = (await response.json()) as {
    data: {
      saved: {
        conceptClaim: { kind: string; text: string };
        teachesEdge: { kind: string; toClaimId: string };
        move: { kind: string; claimIds: string[]; edgeIds: string[] };
      };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(payload.data.saved.conceptClaim.kind, "concept");
  assert.equal(payload.data.saved.teachesEdge.kind, "teaches");
  assert.equal(payload.data.saved.teachesEdge.toClaimId, currentClaimId);
  assert.equal(payload.data.saved.move.kind, "learning_triggered");
  assert.deepEqual(payload.data.saved.move.claimIds, [currentClaimId, uuidAt(301)]);
  assert.deepEqual(payload.data.saved.move.edgeIds, [uuidAt(401)]);
});

test("POST /brain/learn/inline/save persists the displayed explanation without generation", async () => {
  const currentClaimId = uuidAt(101);
  let inputSeen: InlineLearnSaveRequest | undefined;
  const response = await handleInlineLearnSaveRequest(
    request("http://localhost/brain/learn/inline/save", {
      ...learnOutput("desirable difficulty"),
      currentClaimId,
      sessionId: uuidAt(100),
    }),
    {
      async saveInlineLearn(input) {
        inputSeen = input;

        return savedConcept(input.term, currentClaimId);
      },
    },
  );
  const payload = (await response.json()) as {
    data: {
      saved: {
        conceptClaim: { kind: string; text: string };
        teachesEdge: { kind: string; toClaimId: string };
        move: { kind: string; claimIds: string[]; edgeIds: string[] };
      };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(inputSeen?.term, "desirable difficulty");
  assert.equal(inputSeen?.currentClaimId, currentClaimId);
  assert.equal(payload.data.saved.conceptClaim.kind, "concept");
  assert.equal(payload.data.saved.teachesEdge.kind, "teaches");
  assert.equal(payload.data.saved.teachesEdge.toClaimId, currentClaimId);
  assert.equal(payload.data.saved.move.kind, "learning_triggered");
  assert.deepEqual(payload.data.saved.move.claimIds, [currentClaimId, uuidAt(301)]);
  assert.deepEqual(payload.data.saved.move.edgeIds, [uuidAt(401)]);
});

test("Learn route maps inline failures to stable errors", async () => {
  const notFound = await handleInlineLearnRequest(validRequest(), {
    async learnInline() {
      throw new InlineLearnNotFoundError("Current claim was not found in this session.");
    },
  });
  const conflict = await handleInlineLearnRequest(validRequest(), {
    async learnInline() {
      throw new InlineLearnConflictError("Current claim has no current ClaimVersion.");
    },
  });
  const providerFailure = await handleInlineLearnRequest(validRequest(), {
    async learnInline() {
      throw new InlineLearnProviderError("xAI Learn request failed.");
    },
  });
  const generationFailure = await handleInlineLearnRequest(validRequest(), {
    async learnInline() {
      throw new InlineLearnGenerationError("Learn output failed strict validation.", ["explanation too long"]);
    },
  });
  const notFoundPayload = (await notFound.json()) as { error: { code: string } };
  const conflictPayload = (await conflict.json()) as { error: { code: string } };
  const providerPayload = (await providerFailure.json()) as { error: { code: string } };
  const generationPayload = (await generationFailure.json()) as { error: { code: string; issues: string[] } };

  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "inline_learn_not_found");
  assert.equal(conflict.status, 409);
  assert.equal(conflictPayload.error.code, "inline_learn_conflict");
  assert.equal(providerFailure.status, 502);
  assert.equal(providerPayload.error.code, "inline_learn_provider_failed");
  assert.equal(generationFailure.status, 502);
  assert.equal(generationPayload.error.code, "invalid_inline_learn_output");
  assert.deepEqual(generationPayload.error.issues, ["explanation too long"]);
});

test("Learn provider schema stays loose while strict validation enforces local gates", () => {
  const looseProviderOutput = {
    term: "scope",
    explanation: "",
    whyItMattersHere: "It decides how broad the current claim is.",
    example: "Scope can change a broad claim into a testable one.",
    relatedConcepts: ["assumption"],
    saveSuggestion: "Save if this concept will be reused.",
  };

  assert.equal(InlineLearnProviderSchema.safeParse(looseProviderOutput).success, true);
  assert.equal(InlineLearnOutputSchema.safeParse(looseProviderOutput).success, false);
});

test("generateInlineLearnOutput validates heuristic and xAI structured outputs", async () => {
  const input = {
    term: "scope",
    currentClaimId: uuidAt(101),
    sessionId: uuidAt(100),
    localContext: "The claim may only apply to the first draft.",
    currentClaimText: "The idea improves clarity only inside the first draft.",
    currentClaimKind: "assumption" as const,
    lensSnapshot: lensSnapshot(),
    retrievalContext: hybridContext("learn"),
  };
  const heuristic = await generateInlineLearnOutput(input, {
    provider: createHeuristicInlineLearnProvider(),
    brainRunId: uuidAt(701),
  });
  const calls: Parameters<InlineLearnGenerateText>[0][] = [];
  const generateText: InlineLearnGenerateText = async (request) => {
    calls.push(request);

    return {
      output: {
        term: "scope",
        explanation: "Scope is the boundary around where the claim applies.",
        whyItMattersHere: "It keeps the claim from pretending to apply to every learner.",
        example: "Novice users may need a different test than expert users.",
        relatedConcepts: ["boundary", "audience"],
        saveSuggestion: "Save this if the map keeps changing target users.",
      },
    };
  };
  const xai = await generateInlineLearnOutput(input, {
    provider: createXaiInlineLearnProvider({ XAI_API_KEY: "test-key" }, { generateText }),
    brainRunId: uuidAt(702),
  });

  assert.equal(heuristic.term, "scope");
  assert.match(heuristic.explanation, /boundary/);
  assert.match(heuristic.coreIdea, /scope/i);
  assert.ok(heuristic.claims.length > 0);
  assert.ok(heuristic.assumptions.length > 0);
  assert.ok(heuristic.questions.length > 0);
  assert.ok(heuristic.misconceptionsGaps.length > 0);
  assert.ok(heuristic.creativeDirections.length > 0);
  assert.equal(heuristic.suggestedNextMove.action, "save_to_brain");
  assert.equal(heuristic.candidateBrainObjects[0]?.objectType, "learn_output");
  assert.equal(heuristic.candidateBrainObjects[0]?.source, "learn");
  assert.equal(heuristic.candidateBrainObjects[0]?.refs?.currentClaimId, uuidAt(101));
  assert.doesNotMatch(heuristic.explanation, /piece of meaning/i);
  assert.equal(xai.example, "Novice users may need a different test than expert users.");
  assert.equal(xai.suggestedNextMove.action, "save_to_brain");
  assert.equal(xai.candidateBrainObjects[0]?.objectType, "learn_output");
  assert.equal(resolveXaiInlineLearnModel({}), defaultXaiInlineLearnModel);
  assert.equal(calls.length, 1);
  assert.match(calls[0]?.prompt ?? "", /Local context/);
  assert.match(calls[0]?.prompt ?? "", /Local Brain retrieval/);
  assert.match(calls[0]?.prompt ?? "", /Prior Learn concept/);
  assert.match(calls[0]?.prompt ?? "", /Lens snapshot JSON/);
  assert.match(calls[0]?.prompt ?? "", /concept_grounding/);
  assert.match(calls[0]?.prompt ?? "", /candidateBrainObjects/);
  assert.match(calls[0]?.prompt ?? "", /Search decision/);
  assert.equal(calls[0]?.tools, undefined);
});

test("xAI inline Learn attaches web search only when the shared decision says yes", async () => {
  const input = {
    term: "OpenAI pricing",
    currentClaimId: uuidAt(101),
    sessionId: uuidAt(100),
    localContext: "Search current sources for the latest OpenAI pricing before explaining this dependency.",
    currentClaimText: "The product's margin depends on OpenAI pricing staying below current levels.",
    currentClaimKind: "assumption" as const,
    lensSnapshot: lensSnapshot(),
  };
  const calls: Parameters<InlineLearnGenerateText>[0][] = [];
  const generateText: InlineLearnGenerateText = async (request) => {
    calls.push(request);

    return {
      output: {
        term: "OpenAI pricing",
        explanation: "Pricing is the unit cost schedule that determines whether the workflow can be delivered profitably.",
        whyItMattersHere: "The claim depends on a current external price, so Penny should avoid treating the number as a local assumption.",
        example: "If token prices change, the same user workflow can move from viable to unprofitable.",
        relatedConcepts: ["unit cost", "margin"],
        saveSuggestion: "Save this if pricing keeps shaping the business model.",
      },
    };
  };
  const output = await generateInlineLearnOutput(input, {
    provider: createXaiInlineLearnProvider({ XAI_API_KEY: "test-key" }, { generateText }),
    brainRunId: uuidAt(703),
  });

  assert.equal(output.term, "OpenAI pricing");
  assert.ok(calls[0]?.tools?.web_search);
  assert.match(calls[0]?.prompt ?? "", /current_or_time_sensitive/);
});

test("generateInlineLearnOutput requires a recorded BrainRun id", async () => {
  await assert.rejects(
    () =>
      generateInlineLearnOutput(
        {
          term: "scope",
          currentClaimId: uuidAt(101),
          sessionId: uuidAt(100),
          localContext: "The claim may only apply to novice users.",
          currentClaimText: "The assistant improves learning outcomes for novice users.",
          currentClaimKind: "assumption",
        },
        { provider: createHeuristicInlineLearnProvider() },
      ),
    (error) => {
      assert.ok(error instanceof BrainRunGuardError);
      assert.match(error.message, /brain\.learn\.inline/);
      return true;
    },
  );
});

test("heuristic Learn teaches supported concepts instead of generic meta-definitions", async () => {
  const cognitiveLoad = await generateInlineLearnOutput(
    {
      term: "cognitive load",
      currentClaimId: uuidAt(101),
      sessionId: uuidAt(100),
      localContext: "AI study assistant reduces cognitive load.",
      currentClaimText: "AI study assistant reduces cognitive load for students studying complex material.",
      currentClaimKind: "assumption",
    },
    {
      provider: createHeuristicInlineLearnProvider(),
      brainRunId: uuidAt(703),
    },
  );
  const networkEffects = await generateInlineLearnOutput(
    {
      term: "network effects",
      currentClaimId: uuidAt(102),
      sessionId: uuidAt(100),
      localContext: "A study network gets better as more students add explanations.",
      currentClaimText: "Penny has network effects if each saved explanation helps future students.",
      currentClaimKind: "belief",
    },
    {
      provider: createHeuristicInlineLearnProvider(),
      brainRunId: uuidAt(704),
    },
  );

  assert.match(cognitiveLoad.explanation, /mental effort/i);
  assert.match(cognitiveLoad.whyItMattersHere, /AI study assistant/);
  assert.doesNotMatch(cognitiveLoad.explanation, /piece of meaning|needs to be clear/i);
  assert.match(networkEffects.explanation, /additional user/i);
  assert.match(networkEffects.whyItMattersHere, /participation|compounds/i);
});

test("Learn output parsing and xAI provider failures are explicit", async () => {
  const legacyOutput = parseInlineLearnOutput({
    term: "scope",
    explanation: "Scope is the boundary around where the claim applies.",
    whyItMattersHere: "It keeps the claim from pretending to apply to every learner.",
    example: "Novice users may need a different test than expert users.",
    relatedConcepts: ["boundary"],
    saveSuggestion: "Save this if the map keeps changing target users.",
  });

  assert.equal(legacyOutput.coreIdea, "scope: Scope is the boundary around where the claim applies.");
  assert.equal(legacyOutput.suggestedNextMove.action, "save_to_brain");
  assert.equal(legacyOutput.candidateBrainObjects[0]?.objectType, "learn_output");

  assert.throws(
    () =>
      parseInlineLearnOutput({
        term: "scope",
        explanation: "",
        whyItMattersHere: "It matters here.",
        example: "An example.",
        relatedConcepts: ["boundary"],
        saveSuggestion: "Save if useful.",
      }),
    (error) => {
      assert.ok(error instanceof InlineLearnGenerationError);
      return true;
    },
  );

  await assert.rejects(
    () =>
      createXaiInlineLearnProvider({}).generate({
        term: "scope",
        currentClaimId: uuidAt(101),
        sessionId: uuidAt(100),
        localContext: "The claim may only apply to novice users.",
        currentClaimText: "The assistant improves learning outcomes for novice users.",
        currentClaimKind: "assumption",
      }),
    (error) => {
      assert.ok(error instanceof InlineLearnProviderError);
      assert.match(error.message, /XAI_API_KEY/);
      return true;
    },
  );

  await assert.rejects(
    () =>
      generateInlineLearnOutput(
        {
          term: "unknown term",
          currentClaimId: uuidAt(101),
          sessionId: uuidAt(100),
          localContext: "The claim uses an unsupported term.",
          currentClaimText: "The claim uses an unsupported term.",
          currentClaimKind: "assumption",
        },
        {
          provider: createHeuristicInlineLearnProvider(),
          brainRunId: uuidAt(705),
        },
      ),
    (error) => {
      assert.ok(error instanceof InlineLearnProviderError);
      assert.match(error.message, /cannot safely teach/);
      return true;
    },
  );
});

function validRequest(): Request {
  return request("http://localhost/brain/learn/inline", {
    term: "scope",
    currentClaimId: uuidAt(101),
    sessionId: uuidAt(100),
    localContext: "The claim may only apply to novice users.",
  });
}

function request(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function savedConcept(term: string, currentClaimId: string) {
  return {
    conceptClaim: claim(uuidAt(301), uuidAt(302), `${term}: ${term} is contextual.`),
    teachesEdge: {
      id: uuidAt(401),
      fromClaimId: uuidAt(301),
      toClaimId: currentClaimId,
      kind: "teaches" as const,
      status: "active" as const,
      label: term,
    },
    move: {
      id: uuidAt(501),
      kind: "learning_triggered" as const,
      summary: "Saved a Learn concept inside Brain.",
      claimIds: [currentClaimId, uuidAt(301)],
      edgeIds: [uuidAt(401)],
      artifactIds: [],
    },
  };
}

function claim(id: string, versionId: string, text: string) {
  return {
    id,
    versionId,
    kind: "concept" as const,
    status: "exploratory" as const,
    text,
    confidence: 70,
  };
}

function learnOutput(term: string) {
  return parseInlineLearnOutput({
    term,
    explanation: `${term} is the mental effort or boundary the current claim needs to make clear.`,
    whyItMattersHere: "It decides whether the product is reducing effort or just adding another surface.",
    example: "A study flow lowers load if it removes choices instead of adding explanations.",
    relatedConcepts: ["working memory", "attention", "scope"],
    saveSuggestion: `Save ${term} when the map keeps using it as a load-bearing concept.`,
  });
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function lensSnapshot() {
  return {
    shapes: [
      {
        id: uuidAt(901),
        key: "concept_grounding",
        label: "Concept grounding",
        description: "Recent moves use Learn to clarify a concept before continuing the map.",
        confidence: 70,
        status: "confirmed" as const,
        supportingMoveIds: [uuidAt(501)],
      },
    ],
    pendingEffects: [],
  };
}

function hybridContext(mode: HybridRetrievalMode): HybridRetrievalContext {
  return {
    sourceOfTruth: "brain_rows_hybrid_retrieval",
    mode,
    query: "scope first draft",
    planner: "graph_lexical_semantic_recency_scope",
    embeddingProvider: "deterministic_mock",
    terminal1SemanticAvailable: false,
    summary: "Retrieved 1 local Brain item for Learn.",
    results: [
      {
        id: uuidAt(801),
        type: "claim",
        title: "Prior Learn concept",
        text: "Scope has already been used as the boundary around where the claim applies.",
        score: 0.82,
        scoreBreakdown: {
          lexical: 0.8,
          graph: 0.35,
          recency: 1,
        },
        sessionId: uuidAt(100),
        claimId: uuidAt(101),
      },
    ],
  };
}
