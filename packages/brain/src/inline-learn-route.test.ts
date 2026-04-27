import assert from "node:assert/strict";
import test from "node:test";
import {
  InlineLearnConflictError,
  InlineLearnGenerationError,
  InlineLearnNotFoundError,
  InlineLearnOutputSchema,
  InlineLearnProviderError,
  InlineLearnProviderSchema,
  createHeuristicInlineLearnProvider,
  createXaiInlineLearnProvider,
  defaultXaiInlineLearnModel,
  generateInlineLearnOutput,
  handleInlineLearnRequest,
  handleInlineLearnSaveRequest,
  parseInlineLearnOutput,
  resolveXaiInlineLearnModel,
  type InlineLearnGenerateText,
  type InlineLearnRequest,
  type InlineLearnSaveRequest,
} from "./inline-learn-route.ts";

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

test("inline Learn maps route failures to stable errors", async () => {
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
      throw new InlineLearnProviderError("xAI Inline Learn request failed.");
    },
  });
  const generationFailure = await handleInlineLearnRequest(validRequest(), {
    async learnInline() {
      throw new InlineLearnGenerationError("Inline Learn output failed strict validation.", ["explanation too long"]);
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

test("inline Learn provider schema stays loose while strict validation enforces local gates", () => {
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
    localContext: "The claim may only apply to novice users.",
    currentClaimText: "The assistant improves learning outcomes for novice users.",
    currentClaimKind: "assumption" as const,
  };
  const heuristic = await generateInlineLearnOutput(input, {
    provider: createHeuristicInlineLearnProvider(),
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
  });

  assert.equal(heuristic.term, "scope");
  assert.match(heuristic.explanation, /boundary/);
  assert.doesNotMatch(heuristic.explanation, /piece of meaning/i);
  assert.equal(xai.example, "Novice users may need a different test than expert users.");
  assert.equal(resolveXaiInlineLearnModel({}), defaultXaiInlineLearnModel);
  assert.equal(calls.length, 1);
  assert.match(calls[0]?.prompt ?? "", /Local context/);
});

test("heuristic Inline Learn teaches supported concepts instead of generic meta-definitions", async () => {
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
    },
  );

  assert.match(cognitiveLoad.explanation, /mental effort/i);
  assert.match(cognitiveLoad.whyItMattersHere, /AI study assistant/);
  assert.doesNotMatch(cognitiveLoad.explanation, /piece of meaning|needs to be clear/i);
  assert.match(networkEffects.explanation, /additional user/i);
  assert.match(networkEffects.whyItMattersHere, /participation|compounds/i);
});

test("inline Learn output parsing and xAI provider failures are explicit", async () => {
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
      summary: "Saved an inline Learn concept inside Brain.",
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
  return {
    term,
    explanation: `${term} is the mental effort or boundary the current claim needs to make clear.`,
    whyItMattersHere: "It decides whether the product is reducing effort or just adding another surface.",
    example: "A study flow lowers load if it removes choices instead of adding explanations.",
    relatedConcepts: ["working memory", "attention", "scope"],
    saveSuggestion: `Save ${term} when the map keeps using it as a load-bearing concept.`,
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
