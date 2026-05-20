import assert from "node:assert/strict";
import test from "node:test";
import {
  createInMemoryCreateRouteService,
  createInMemoryCreateExportFeedbackService,
  handleCreateCompareRequest,
  handleCreateExportFeedbackRequest,
  handleCreateNextRequest,
  handleExportCodingPromptRequest,
  type CandidateOption,
  type CodingPromptArtifact,
  type CreateNextResult,
  type CreateExportFeedback,
  type CreateOptionProvider,
  type CreateProviderComparisonResult,
  type MemoryRef,
  type PromptExport,
  type SourceRef,
} from "./create-route.ts";
import {
  handleBrainDemoFixtureRequest,
  handleBrainImportRequest,
  handleBrainMemoryProfileRequest,
  handleBrainMemoryReviewRequest,
  handleBrainSourceDeleteRequest,
  type BrainMemoryProfile,
  type IngestionJob,
} from "./brain-memory-route.ts";

test("POST /api/create/next generates the five required Create directions", async () => {
  const service = createInMemoryCreateRouteService();
  const response = await handleCreateNextRequest(
    jsonRequest("http://localhost/api/create/next", {
      rawIdea: "Penny should turn a rough app idea into multiple product directions, then export a coding-agent prompt.",
    }),
    { service },
  );
  const payload = await responsePayload(response);
  const data = payload.data as CreateNextResult;

  assert.equal(response.status, 200);
  assert.equal(data.sourceOfTruth, "create_options_judgments_artifacts_verification");
  assert.deepEqual(
    data.optionSet.options.map((option) => option.lens),
    ["Personal", "Practical", "Valuable", "Critical", "Weird"],
  );
  assert.equal(data.judgmentEvent, null);
  assert.equal(data.artifact.sections.length, 15);
  assert.equal(data.optionSet.nextBestMove.grounded, false);
  assert.match(data.optionSet.nextBestMove.title, /Collect one concrete Brain signal/i);
  assert.equal(data.optionSet.rankedCandidates.length, 5);
  assert.deepEqual(
    data.optionSet.rankedCandidates.map((candidate) => candidate.lens),
    ["Personal", "Practical", "Valuable", "Critical", "Weird"],
  );
  assert.ok(data.artifact.sections.find((section) => section.title === "Final coding-agent prompt")?.body.includes("## Product Goal"));
  assert.match(data.artifact.sections.find((section) => section.title === "Final coding-agent prompt")?.body ?? "", /## Personal Context Used/);
  assert.deepEqual(
    data.verification.checks.map((check) => check.key),
    [
      "intent_match",
      "personal_memory_grounding",
      "buildability",
      "non_genericness",
      "user_autonomy_preserved",
      "fake_claim_risk",
      "prompt_completeness",
    ],
  );
  assert.equal(data.observability.providerMode, "deterministic");
  assert.equal(data.observability.schemaValidation, "not_run");
  assert.equal(data.observability.memoryCountUsed, 0);
  assert.equal(data.observability.sourceCountUsed, 1);
  assert.deepEqual(data.observability.generatedLenses, ["Personal", "Practical", "Valuable", "Critical", "Weird"]);
  assert.equal(data.observability.exportQualitySignals.hasRoughIdea, true);
  assert.equal(data.observability.exportQualitySignals.hasImplementationSequence, true);
  assert.equal(typeof data.verification.scores.promptCompleteness, "number");

  for (const option of data.optionSet.options) {
    assert.ok(option.title);
    assert.ok(option.oneLine);
    assert.ok(option.rationale);
    assert.match(option.rationale, /Context-light/i);
    assert.ok(option.topReason);
    assert.equal(option.grounding, "context_light");
    assert.match(option.contextLabel, /Context-light|search-needed|inferred/i);
    assert.equal(option.memoryCount, 0);
    assert.ok(option.sourceCount >= 1);
    assert.ok(option.rankReasons.length >= 1);
    assert.ok(option.uncertainty.length >= 1);
    assert.ok(option.nextMove);
    assert.ok(option.risks.length >= 1);
    assert.ok(option.sourcesUsed.some((source) => source.kind === "rough_idea"));
    assert.equal(typeof option.scores.intentMatch, "number");
  }
  for (const check of data.verification.checks) {
    assert.equal(typeof check.score, "number");
  }
});

test("POST /api/create/next uses retrieved Brain memory and source refs when imports exist", async () => {
  const headers = requestHeaders({
    "x-user-id": "create-memory-user",
    "x-workspace-id": "create-memory-workspace",
    "x-project-id": "create-memory-project",
    "x-sphere-id": "create-memory-sphere",
  });
  const importResponse = await handleBrainImportRequest(
    jsonRequest(
      "http://localhost/api/brain/import",
      {
        kind: "text",
        label: "Founder workflow notes",
        content:
          "Project: Penny should help founders shape startup ideas without a generic chatbot sidebar. I prefer small reversible builds with explicit source provenance. Avoid fake connector claims before the MVP loop works.",
      },
      headers,
    ),
  );
  const service = createInMemoryCreateRouteService();
  const response = await handleCreateNextRequest(
    jsonRequest(
      "http://localhost/api/create/next",
      {
        rawIdea: "Build Penny Create for founders who need memory-grounded startup idea options without generic chatbot behavior.",
      },
      headers,
    ),
    { service },
  );
  const payload = await responsePayload(response);
  const data = payload.data as CreateNextResult;

  assert.equal(importResponse.status, 200);
  assert.equal(response.status, 200);
  assert.ok(data.optionSet.memoryUsed.some((memory) => /Founder|Penny|Preference|Project/i.test(memory.label)));
  assert.ok(data.optionSet.sourcesUsed.some((source) => source.label === "Founder workflow notes"));
  assert.equal(data.optionSet.nextBestMove.grounded, true);
  assert.match(data.optionSet.nextBestMove.whyItMatters, /remembered|buildable|payoff|risk|signal/i);
  assert.ok(data.optionSet.options.some((option) => option.memoryUsed.length >= 1));
  assert.ok(data.optionSet.options.every((option) => option.sourcesUsed.some((source) => source.label === "Founder workflow notes")));
  assert.ok(data.optionSet.options.every((option) => !/Context-light/i.test(option.rationale)));
  assert.ok(data.optionSet.options.every((option) => option.topReason.length > 10));
  assert.ok(data.optionSet.options.every((option) => option.grounding === "grounded"));
  assert.ok(data.optionSet.options.every((option) => option.contextLabel === "Grounded in Brain memory"));
  assert.ok(data.optionSet.options.every((option) => option.memoryCount >= 1));
  assert.ok(data.optionSet.options.every((option) => option.sourceCount >= 1));
  assert.match(sectionBody(data.artifact, "AI/memory orchestration"), /Founder workflow notes/);
  assert.match(sectionBody(data.artifact, "User intent"), /Personal context used/);
  assert.ok(data.observability.memoryCountUsed >= 1);
  assert.ok(data.observability.sourceCountUsed >= 2);
});

test("POST /api/create/next keeps Brain memory scoped and ignores deleted sources", async () => {
  const rawIdea = "Build the quartzline Create demo from scoped private memory.";
  const userAHeaders = requestHeaders({
    "x-user-id": "create-scope-user-a",
    "x-workspace-id": "create-scope-workspace",
    "x-project-id": "create-scope-project",
    "x-sphere-id": "create-scope-sphere",
  });
  const userBHeaders = requestHeaders({
    "x-user-id": "create-scope-user-b",
    "x-workspace-id": "create-scope-workspace",
    "x-project-id": "create-scope-project",
    "x-sphere-id": "create-scope-sphere",
  });
  const importResponse = await handleBrainImportRequest(
    jsonRequest(
      "http://localhost/api/brain/import",
      {
        kind: "text",
        label: "Quartzline private notes",
        content:
          "Project: The quartzline Create demo should use private memory only for its owner. I prefer source-backed cards and reject fake connector claims.",
      },
      userAHeaders,
    ),
  );
  const importPayload = await responsePayload(importResponse);
  const job = importPayload.data.job as IngestionJob;
  assert.equal(importResponse.status, 200);
  assert.equal(job.status, "completed");
  assert.ok(job.sourceId);

  const owned = await createNext(createInMemoryCreateRouteService(), { rawIdea }, userAHeaders);
  const otherUser = await createNext(createInMemoryCreateRouteService(), { rawIdea }, userBHeaders);

  assert.ok(owned.optionSet.memoryUsed.some((memory) => /quartzline|source-backed/i.test(memory.summary)));
  assert.ok(owned.optionSet.sourcesUsed.some((source) => source.label === "Quartzline private notes"));
  assert.equal(otherUser.observability.memoryCountUsed, 0);
  assert.ok(!otherUser.optionSet.sourcesUsed.some((source) => source.label === "Quartzline private notes"));
  assertNoFakePositiveClaims(optionText(owned, "Personal"));
  assert.ok(owned.optionSet.memoryUsed.every((memory) => !/Gmail|Slack|OAuth/i.test(memory.summary)));

  const deleteResponse = await handleBrainSourceDeleteRequest(
    deleteRequest(`http://localhost/api/brain/sources/${job.sourceId}`, userAHeaders),
    job.sourceId,
    {},
  );
  assert.equal(deleteResponse.status, 200);

  const afterDelete = await createNext(createInMemoryCreateRouteService(), { rawIdea }, userAHeaders);
  assert.equal(afterDelete.observability.memoryCountUsed, 0);
  assert.ok(!afterDelete.optionSet.sourcesUsed.some((source) => source.label === "Quartzline private notes"));
});

test("POST /api/create/next scopes persisted Create artifacts, judgments, and option sets by user", async () => {
  const service = createInMemoryCreateRouteService();
  const rawIdea = "Build a private-alpha Create export flow with scoped artifacts.";
  const projectId = "shared-alpha-project";
  const sessionId = "shared-alpha-session";
  const userAHeaders = requestHeaders({
    "x-user-id": "create-artifact-user-a",
    "x-workspace-id": "create-artifact-workspace",
    "x-project-id": "create-artifact-project",
    "x-sphere-id": "create-artifact-sphere",
  });
  const userBHeaders = requestHeaders({
    "x-user-id": "create-artifact-user-b",
    "x-workspace-id": "create-artifact-workspace",
    "x-project-id": "create-artifact-project",
    "x-sphere-id": "create-artifact-sphere",
  });
  const first = await createNext(service, { rawIdea, projectId, sessionId }, userAHeaders);
  const userASelected = optionsByLens(first.optionSet.options, ["Personal", "Critical"]);
  const userARefined = await createNext(
    service,
    {
      rawIdea,
      projectId,
      sessionId,
      optionSetId: first.optionSet.id,
      selectedOptionIds: userASelected.map((option) => option.id),
      userComment: "user-a-secret-alpha-comment",
      artifact: first.artifact,
    },
    userAHeaders,
  );
  const replayedByUserB = await createNext(
    service,
    {
      rawIdea,
      projectId,
      sessionId,
      optionSetId: first.optionSet.id,
      selectedOptionIds: userASelected.map((option) => option.id),
      userComment: "user-b-private-alpha-comment",
    },
    userBHeaders,
  );
  const userBText = replayedByUserB.artifact.sections.map((section) => section.body).join("\n");

  assert.match(userARefined.artifact.sections.map((section) => section.body).join("\n"), /user-a-secret-alpha-comment/);
  assert.doesNotMatch(userBText, /user-a-secret-alpha-comment/);
  assert.match(userBText, /user-b-private-alpha-comment/);
  assert.equal(replayedByUserB.artifact.version, 2);
  assert.equal(replayedByUserB.judgmentEvent?.userComment, "user-b-private-alpha-comment");
});

test("alpha Brain to Create to export golden path uses reviewed personal context and selected history", async () => {
  const headers = requestHeaders({
    "x-user-id": "alpha-demo-user",
    "x-workspace-id": "alpha-demo-workspace",
    "x-project-id": "alpha-demo-project",
    "x-sphere-id": "alpha-demo-sphere",
  });
  const fixtureResponse = await handleBrainDemoFixtureRequest(getRequest("http://localhost/api/brain/demo-fixture/penny", headers));
  const fixturePayload = await responsePayload(fixtureResponse);
  const importResponse = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", fixturePayload.data.importInput, headers),
  );
  const profileResponse = await handleBrainMemoryProfileRequest(getRequest("http://localhost/api/brain/memory/profile", headers));
  const profilePayload = await responsePayload(profileResponse);
  const importedProfile = profilePayload.data as BrainMemoryProfile;
  const memoryToBoost = importedProfile.recentMemoryNodes.find((node) => /small reversible builds|source-backed|Create/i.test(node.summary));

  assert.equal(fixtureResponse.status, 200);
  assert.equal(importResponse.status, 200);
  assert.equal(profileResponse.status, 200);
  assert.ok(importedProfile.stats.sourceCount >= 1);
  assert.ok(importedProfile.stats.memoryNodeCount >= 5);
  assert.ok(memoryToBoost);

  const reviewResponse = await handleBrainMemoryReviewRequest(
    jsonRequest(`http://localhost/api/brain/memories/${memoryToBoost.id}/review`, { action: "boost" }, headers),
    memoryToBoost.id,
  );
  const reviewPayload = await responsePayload(reviewResponse);
  const reviewedProfile = reviewPayload.data.profile as BrainMemoryProfile;
  const boostedMemory = reviewedProfile.recentMemoryNodes.find((node) => node.id === memoryToBoost.id);

  assert.equal(reviewResponse.status, 200);
  assert.ok((boostedMemory?.confidence ?? 0) >= memoryToBoost.confidence);

  const service = createInMemoryCreateRouteService();
  const rawIdea = "Use Penny's imported Brain context to make a private-alpha Create demo easier to judge and export.";
  const first = await createNext(
    service,
    {
      rawIdea,
      projectId: "alpha-demo-create-project",
      sessionId: "alpha-demo-create-session",
    },
    headers,
  );
  const selected = optionsByLens(first.optionSet.options, ["Personal", "Practical", "Critical"]);
  const refined = await createNext(
    service,
    {
      rawIdea,
      projectId: first.optionSet.projectId,
      sessionId: first.optionSet.sessionId,
      optionSetId: first.optionSet.id,
      selectedOptionIds: selected.map((option) => option.id),
      userComment: "Keep the demo safe, source-backed, and easy to inspect before export.",
      artifact: first.artifact,
    },
    headers,
  );
  const exportResponse = await handleExportCodingPromptRequest(
    jsonRequest(
      "http://localhost/api/create/export-coding-prompt",
      {
        artifact: refined.artifact,
        verification: refined.verification,
        judgmentEvent: refined.judgmentEvent,
      },
      headers,
    ),
    { service },
  );
  const exportPayload = await responsePayload(exportResponse);
  const exported = exportPayload.data.export as PromptExport;

  assert.equal(first.optionSet.options.length, 5);
  assert.ok(first.optionSet.memoryUsed.length >= 1);
  assert.ok(first.optionSet.sourcesUsed.some((source) => source.label === "Penny demo ChatGPT export"));
  assert.ok(first.observability.memoryCountUsed >= 1);
  assert.deepEqual(selected.map((option) => option.lens), ["Personal", "Practical", "Critical"]);
  assert.ok(refined.judgmentEvent);
  assert.match(sectionBody(refined.artifact, "User intent"), /safe, source-backed, and easy to inspect/i);
  assert.equal(exportResponse.status, 200);
  assert.match(exported.text, /## Personal Context Used/);
  assert.match(exported.text, /Penny demo ChatGPT export|small reversible builds|source-backed/i);
  assert.match(exported.text, /## Selected Option History/);
  assert.match(exported.text, /Personal:/);
  assert.match(exported.text, /Practical:/);
  assert.match(exported.text, /Critical:/);
  assert.equal(exported.qualitySignals.hasSelectedOptionHistory, true);
  assert.equal(exported.qualitySignals.hasRelevantPersonalContext, true);
  assert.equal(exported.qualitySignals.promptCompletenessScore, 100);
  assertNoFakePositiveClaims(exported.text);
});

test("POST /api/create/next personalizes the same rough idea for different Brain profiles", async () => {
  const rawIdea = "Build a memory-grounded app that turns rough project notes into an agent-ready implementation plan.";
  const studio = await createNext(createInMemoryCreateRouteService(), {
    rawIdea,
    projectId: "studio-project",
    sessionId: "studio-session",
    memory: studioBrainMemory(),
    sources: studioBrainSources(),
  });
  const field = await createNext(createInMemoryCreateRouteService(), {
    rawIdea,
    projectId: "field-project",
    sessionId: "field-session",
    memory: fieldBrainMemory(),
    sources: fieldBrainSources(),
  });

  for (const lens of ["Personal", "Valuable", "Weird"] satisfies CandidateOption["lens"][]) {
    assert.notEqual(optionText(studio, lens), optionText(field, lens), `${lens} should change when Brain memory changes`);
  }

  assert.match(optionText(studio, "Personal"), /tactile|visual|zine|studio/i);
  assert.match(optionText(field, "Personal"), /offline|field|audit|low-connectivity/i);
  assert.match(optionText(studio, "Valuable"), /maker|workshop|cohort/i);
  assert.match(optionText(field, "Valuable"), /inspection|field|paperwork/i);
  assert.match(optionText(studio, "Weird"), /tactile|visual|zine|studio/i);
  assert.match(optionText(field, "Weird"), /offline|field|rugged|low-connectivity/i);
  assert.match(optionText(studio, "Critical"), /generic GPT-wrapper|fake connector claims|unsupported memory claims/i);
  assert.match(optionText(field, "Critical"), /generic GPT-wrapper|fake connector claims|unsupported memory claims/i);
  assert.ok(optionsByLens(studio.optionSet.options, ["Personal"])[0]?.memoryUsed.some((memory) => /tactile|zine|studio/i.test(memory.summary)));
  assert.ok(optionsByLens(field.optionSet.options, ["Personal"])[0]?.memoryUsed.some((memory) => /offline|audit|field/i.test(memory.summary)));
});

test("POST /api/create/next uses repeated rejected directions to change suggestions and exports", async () => {
  const rawIdea = "Build a memory-grounded app that turns rough project notes into an agent-ready implementation plan.";
  const service = createInMemoryCreateRouteService();
  const baseline = await createNext(service, {
    rawIdea,
    projectId: "reject-base-project",
    sessionId: "reject-base-session",
    memory: [
      {
        id: "memory-base-style",
        label: "Preference: compact planning",
        kind: "preference",
        summary: "The user prefers compact planning artifacts and explicit implementation tests.",
      },
    ],
  });
  const withRejected = await createNext(service, {
    rawIdea,
    projectId: "reject-project",
    sessionId: "reject-session",
    memory: [
      {
        id: "memory-reject-crm",
        label: "Rejected direction: enterprise CRM dashboards",
        kind: "brain",
        summary: "The user repeatedly rejected enterprise CRM dashboards, generic chatbot sidebars, and fake connector claims.",
      },
      {
        id: "memory-reject-style",
        label: "Preference: compact planning",
        kind: "preference",
        summary: "The user prefers compact planning artifacts and explicit implementation tests.",
      },
    ],
  });

  assert.notEqual(optionText(baseline, "Critical"), optionText(withRejected, "Critical"));
  assert.match(optionText(withRejected, "Critical"), /enterprise CRM dashboards|generic chatbot sidebars|fake connector claims/i);
  assert.ok(withRejected.observability.rejectedDirectionsUsed.some((direction) => /enterprise CRM dashboards/i.test(direction)));

  const critical = optionsByLens(withRejected.optionSet.options, ["Critical"]);
  const refined = await createNext(service, {
    rawIdea,
    projectId: withRejected.optionSet.projectId,
    sessionId: withRejected.optionSet.sessionId,
    optionSetId: withRejected.optionSet.id,
    selectedOptionIds: critical.map((option) => option.id),
    userComment: "Keep the rejected enterprise CRM direction visible in the exported prompt.",
    artifact: withRejected.artifact,
  });
  const response = await handleExportCodingPromptRequest(
    jsonRequest("http://localhost/api/create/export-coding-prompt", {
      artifact: refined.artifact,
      verification: refined.verification,
      judgmentEvent: refined.judgmentEvent,
    }),
    { service },
  );
  const payload = await responsePayload(response);
  const exported = payload.data.export as PromptExport;

  assert.match(exported.text, /## Repeated Rejected Directions/);
  assert.match(exported.text, /enterprise CRM dashboards|generic chatbot sidebars|fake connector claims/i);
  assert.equal(exported.qualitySignals.hasRepeatedRejectedDirections, true);
  assertNoFakePositiveClaims(exported.text);
});

test("POST /api/create/next can use a model-backed typed option provider without changing provenance", async () => {
  let providerSawMemory = false;
  const provider: CreateOptionProvider = {
    name: "test",
    async generateOptions(input) {
      providerSawMemory = input.memoryUsed.some((memory) => /source-backed/i.test(memory.summary));

      return {
        options: modelBackedOptionDrafts("Model-backed source ledger"),
      };
    },
  };
  const service = createInMemoryCreateRouteService({ optionProvider: provider });
  const result = await createNext(service, {
    rawIdea: "Build a source-backed planning ledger for rough product notes.",
    memory: [
      {
        id: "memory-model-1",
        label: "Preference: source-backed planning",
        kind: "preference",
        summary: "The user prefers source-backed planning, compact acceptance tests, and visible memory evidence.",
      },
    ],
    sources: [
      {
        id: "source-model-1",
        label: "Planning notes",
        kind: "source",
        excerpt: "Use model-backed copy only when it preserves real source and memory refs.",
        sourceRange: "chunk 1",
      },
    ],
  });
  const personal = optionsByLens(result.optionSet.options, ["Personal"])[0];

  assert.equal(providerSawMemory, true);
  assert.equal(result.optionSet.sourceOfTruth, "rough_idea_context_model_backed_create_lenses");
  assert.equal(result.observability.providerMode, "model_backed");
  assert.equal(result.observability.providerName, "test");
  assert.equal(result.observability.schemaValidation, "success");
  assert.equal(result.observability.fallbackReason, null);
  assert.deepEqual(result.observability.generatedLenses, ["Personal", "Practical", "Valuable", "Critical", "Weird"]);
  assert.match(personal?.title ?? "", /Model-backed source ledger Personal/i);
  assert.ok(personal?.memoryUsed.some((memory) => memory.id === "memory-model-1"));
  assert.ok(personal?.sourcesUsed.some((source) => source.id === "source-model-1"));
  assert.match(personal?.rationale ?? "", /Grounded/i);
  assertNoFakePositiveClaims(result.optionSet.options.map((option) => optionText(result, option.lens)).join("\n"));
});

test("POST /api/create/next rejects unsafe provider claims and falls back to deterministic options", async () => {
  const provider: CreateOptionProvider = {
    name: "test",
    async generateOptions() {
      const drafts = modelBackedOptionDrafts("Unsafe provider");

      return {
        options: drafts.map((draft) =>
          draft.lens === "Personal"
            ? {
                ...draft,
                oneLine: "Grounded in imported Gmail and Slack history that proves the user's hidden preferences.",
              }
            : draft,
        ),
      };
    },
  };
  const service = createInMemoryCreateRouteService({ optionProvider: provider });
  const result = await createNext(service, {
    rawIdea: "Build Create options from real memory without fake connector claims.",
    memory: [
      {
        id: "memory-safe-1",
        label: "Preference: no fake memory",
        kind: "preference",
        summary: "The user wants real memory evidence and rejects fake connector or global-training claims.",
      },
    ],
  });

  assert.equal(result.optionSet.sourceOfTruth, "rough_idea_context_deterministic_create_lenses");
  assert.equal(result.observability.providerMode, "deterministic_fallback");
  assert.equal(result.observability.providerName, "test");
  assert.equal(result.observability.schemaValidation, "failure");
  assert.match(result.observability.fallbackReason ?? "", /fell back to deterministic/i);
  assert.ok(result.optionSet.options.every((option) => !/imported Gmail|Slack history|hidden preferences/i.test(optionText(result, option.lens))));
});

test("POST /api/create/next falls back with a clear trace when provider schema validation fails", async () => {
  const provider: CreateOptionProvider = {
    name: "test",
    async generateOptions() {
      return {
        options: modelBackedOptionDrafts("Malformed provider").slice(0, 2),
      };
    },
  };
  const service = createInMemoryCreateRouteService({ optionProvider: provider });
  const result = await createNext(service, {
    rawIdea: "Build safer Create provider rollout checks.",
  });

  assert.equal(result.optionSet.sourceOfTruth, "rough_idea_context_deterministic_create_lenses");
  assert.equal(result.observability.providerMode, "deterministic_fallback");
  assert.equal(result.observability.schemaValidation, "failure");
  assert.ok(result.observability.schemaValidationErrors.some((error) => /failed validation|Too small|expected array to contain/i.test(error)));
  assert.match(result.observability.fallbackReason ?? "", /fell back to deterministic/i);
});

test("POST /api/create/compare returns deterministic and model-backed outputs side by side", async () => {
  const provider: CreateOptionProvider = {
    name: "test",
    async generateOptions() {
      return {
        options: modelBackedOptionDrafts("Compared model-backed"),
      };
    },
  };
  const service = createInMemoryCreateRouteService({ optionProvider: provider });
  const response = await handleCreateCompareRequest(
    jsonRequest("http://localhost/api/create/compare", {
      rawIdea: "Build a model-backed Create rollout comparison that proves output quality before defaulting it.",
      memory: [
        {
          id: "memory-compare-1",
          label: "Preference: rollout evidence",
          kind: "preference",
          summary: "The user wants side-by-side deterministic and model-backed Create evidence before changing defaults.",
        },
      ],
    }),
    { service },
  );
  const payload = await responsePayload(response);
  const data = payload.data as CreateProviderComparisonResult;

  assert.equal(response.status, 200);
  assert.equal(data.sourceOfTruth, "deterministic_model_backed_create_comparison");
  assert.equal(data.deterministic.providerUsed, "deterministic");
  assert.equal(data.modelBacked.providerUsed, "model_backed");
  assert.equal(data.modelBacked.fallbackReason, null);
  assert.equal(data.deterministic.optionSet.sourceOfTruth, "rough_idea_context_deterministic_create_lenses");
  assert.equal(data.modelBacked.optionSet.sourceOfTruth, "rough_idea_context_model_backed_create_lenses");
  assert.match(data.modelBacked.optionSet.options[0]?.title ?? "", /Compared model-backed Personal/);
  assert.ok(optionSetQualityScore(data.modelBacked.optionSet.options) > optionSetQualityScore(data.deterministic.optionSet.options));
  assert.equal(data.deterministic.verification.checks.length, 7);
  assert.equal(data.modelBacked.verification.scores.promptCompleteness, 100);
  assert.match(data.deterministic.promptExport.text, /## Rough User Idea/);
  assert.match(data.modelBacked.promptExport.text, /## Product Goal/);
  assert.equal(data.modelBacked.promptExport.qualitySignals.hasAcceptanceTests, true);
});

test("POST /api/create/next records multi-select judgment and updates the artifact", async () => {
  const service = createInMemoryCreateRouteService();
  const first = await createNext(service, {
    rawIdea: "Build a memory-native creativity workbench where options and judgment update a coding prompt artifact.",
  });
  const selected = optionsByLens(first.optionSet.options, ["Personal", "Critical", "Weird"]);
  const response = await handleCreateNextRequest(
    jsonRequest("http://localhost/api/create/next", {
      rawIdea: first.optionSet.rawIdea,
      projectId: first.optionSet.projectId,
      sessionId: first.optionSet.sessionId,
      optionSetId: first.optionSet.id,
      selectedOptionIds: selected.map((option) => option.id),
      userComment: "Keep it buildable, but make selected cards visibly mutate the artifact.",
      artifact: first.artifact,
    }),
    { service },
  );
  const payload = await responsePayload(response);
  const data = payload.data as CreateNextResult;

  assert.equal(response.status, 200);
  assert.ok(data.judgmentEvent);
  assert.equal(data.judgmentEvent?.projectId, first.optionSet.projectId);
  assert.equal(data.judgmentEvent?.sessionId, first.optionSet.sessionId);
  assert.equal(data.judgmentEvent?.optionSetId, first.optionSet.id);
  assert.deepEqual(data.judgmentEvent?.selectedOptionIds, selected.map((option) => option.id));
  assert.equal(data.judgmentEvent?.userComment, "Keep it buildable, but make selected cards visibly mutate the artifact.");
  assert.ok(data.judgmentEvent?.inferredSignals.includes("buildability_priority"));
  assert.ok(data.judgmentEvent?.artifactDelta.updatedSectionIds.length);
  assert.equal(data.artifact.version, first.artifact.version + 1);
  assert.ok(data.artifact.judgmentEventIds.includes(data.judgmentEvent?.id ?? "missing"));
  assert.match(sectionBody(data.artifact, "User intent"), /visibly mutate the artifact/i);
  assert.match(sectionBody(data.artifact, "Verification constraints"), /not-GPT-wrapper/i);
});

test("POST /api/create/export-coding-prompt returns a coding-agent ready prompt", async () => {
  const service = createInMemoryCreateRouteService();
  const first = await createNext(service, {
    rawIdea: "Create a compact frontend and backend kernel for Penny's Create mode.",
    memory: [
      {
        id: "memory-demo-1",
        label: "Preference: Compact route contracts",
        kind: "preference",
        summary: "The user prefers compact route contracts, visible provenance, and tests before polish.",
      },
      {
        id: "memory-demo-2",
        label: "Rejected direction: broad connectors",
        kind: "brain",
        summary: "The user repeatedly rejects broad OAuth connectors, fake imported memory, and generic chatbot sidebars before the Create loop works.",
      },
    ],
    sources: [
      {
        id: "source-demo-1",
        label: "Founder notes",
        kind: "source",
        excerpt: "Prioritize route contracts, client methods, compact UI, and tests.",
        sourceRange: "chunk 1",
      },
    ],
  });
  const practical = optionsByLens(first.optionSet.options, ["Practical", "Valuable"]);
  const refined = await createNext(service, {
    rawIdea: first.optionSet.rawIdea,
    projectId: first.optionSet.projectId,
    sessionId: first.optionSet.sessionId,
    optionSetId: first.optionSet.id,
    selectedOptionIds: practical.map((option) => option.id),
    userComment: "Prioritize route contracts, client methods, compact UI, and tests.",
    artifact: first.artifact,
  });
  const response = await handleExportCodingPromptRequest(
    jsonRequest("http://localhost/api/create/export-coding-prompt", {
      artifact: refined.artifact,
      verification: refined.verification,
      judgmentEvent: refined.judgmentEvent,
    }),
    { service },
  );
  const payload = await responsePayload(response);
  const exported = payload.data.export as PromptExport;

  assert.equal(response.status, 200);
  assert.equal(exported.format, "coding_agent_prompt");
  assert.deepEqual(exported.targets, ["Codex", "Claude Code", "Cursor"]);
  assert.match(exported.text, /## Product Goal/);
  assert.match(exported.text, /## Rough User Idea/);
  assert.match(exported.text, /Create a compact frontend and backend kernel/i);
  assert.match(exported.text, /## Non-Goals/);
  assert.match(exported.text, /Do not build broad OAuth connectors/i);
  assert.match(exported.text, /## User Intent/);
  assert.match(exported.text, /## Personal Context Used/);
  assert.match(exported.text, /## Source \/ Memory Evidence/);
  assert.match(exported.text, /Preference: Compact route contracts/);
  assert.match(exported.text, /Rejected direction: broad connectors/);
  assert.match(exported.text, /Founder notes/);
  assert.match(exported.text, /## Selected Option History/);
  assert.match(exported.text, /Practical:/);
  assert.match(exported.text, /Valuable:/);
  assert.match(exported.text, /## Repeated Rejected Directions/);
  assert.match(exported.text, /broad OAuth connectors|generic chatbot sidebars/i);
  assert.match(exported.text, /## UX Requirements/);
  assert.match(exported.text, /## Frontend Requirements/);
  assert.match(exported.text, /## Backend Requirements/);
  assert.match(exported.text, /## Data Model/);
  assert.match(exported.text, /## Privacy Constraints/);
  assert.match(exported.text, /## Verification Constraints/);
  assert.match(exported.text, /## Implementation Sequence/);
  assert.match(exported.text, /## Do-Not-Break List/);
  assert.match(exported.text, /## Definition of Done/);
  assert.match(exported.text, /route contracts, client methods, compact UI, and tests/i);
  assert.equal(exported.qualitySignals.hasRoughIdea, true);
  assert.equal(exported.qualitySignals.hasSelectedOptionHistory, true);
  assert.equal(exported.qualitySignals.hasRelevantPersonalContext, true);
  assert.equal(exported.qualitySignals.hasRepeatedRejectedDirections, true);
  assert.equal(exported.qualitySignals.hasProductGoal, true);
  assert.equal(exported.qualitySignals.hasNonGoals, true);
  assert.equal(exported.qualitySignals.hasUxRequirements, true);
  assert.equal(exported.qualitySignals.hasFrontendRequirements, true);
  assert.equal(exported.qualitySignals.hasBackendRequirements, true);
  assert.equal(exported.qualitySignals.hasDataModel, true);
  assert.equal(exported.qualitySignals.hasPrivacyConstraints, true);
  assert.equal(exported.qualitySignals.hasVerificationRequirements, true);
  assert.equal(exported.qualitySignals.hasImplementationSequence, true);
  assert.equal(exported.qualitySignals.hasAcceptanceTests, true);
  assert.equal(exported.qualitySignals.hasDoNotBreakList, true);
  assert.equal(exported.qualitySignals.promptCompletenessScore, 100);
  assert.deepEqual(exported.qualitySignals.missing, []);
  assertNoFakePositiveClaims(exported.text);
});

test("POST /api/create/export-feedback captures scoped dogfood feedback", async () => {
  const feedbackService = createInMemoryCreateExportFeedbackService();
  const response = await handleCreateExportFeedbackRequest(
    jsonRequest(
      "http://localhost/api/create/export-feedback",
      {
        projectId: "create-project-1",
        sessionId: "create-session-1",
        artifactId: "artifact-1",
        exportId: "export-1",
        rating: "not_useful",
        reasons: ["too_generic", "not_personal_enough", "too_generic"],
        comment: "Needs the memory-backed constraints to be sharper.",
        promptCompletenessScore: 72,
      },
      {
        ...requestHeaders(),
        "x-user-id": "dogfood-user",
        "x-workspace-id": "dogfood-workspace",
      },
    ),
    { feedbackService },
  );
  const payload = await responsePayload(response);
  const feedback = payload.data.feedback as CreateExportFeedback;

  assert.equal(response.status, 201);
  assert.equal(feedback.sourceOfTruth, "create_export_feedback");
  assert.equal(feedback.projectId, "create-project-1");
  assert.equal(feedback.sessionId, "create-session-1");
  assert.equal(feedback.artifactId, "artifact-1");
  assert.equal(feedback.exportId, "export-1");
  assert.equal(feedback.rating, "not_useful");
  assert.deepEqual(feedback.reasons, ["too_generic", "not_personal_enough"]);
  assert.equal(feedback.comment, "Needs the memory-backed constraints to be sharper.");
  assert.equal(feedback.promptCompletenessScore, 72);
  assert.ok(feedback.id.startsWith("create-export-feedback-"));
});

async function createNext(
  service: ReturnType<typeof createInMemoryCreateRouteService>,
  body: Record<string, unknown>,
  headers: HeadersInit = requestHeaders(),
): Promise<CreateNextResult> {
  const response = await handleCreateNextRequest(jsonRequest("http://localhost/api/create/next", body, headers), { service });
  const payload = await responsePayload(response);

  assert.equal(response.status, 200);
  return payload.data as CreateNextResult;
}

function optionsByLens(options: CandidateOption[], lenses: CandidateOption["lens"][]): CandidateOption[] {
  return lenses.map((lens) => {
    const option = options.find((item) => item.lens === lens);
    assert.ok(option, `Missing ${lens} option`);
    return option;
  });
}

function sectionBody(artifact: CodingPromptArtifact, title: string): string {
  return artifact.sections.find((section) => section.title === title)?.body ?? "";
}

function optionText(result: CreateNextResult, lens: CandidateOption["lens"]): string {
  const option = optionsByLens(result.optionSet.options, [lens])[0];

  return [option?.title, option?.oneLine, option?.rationale, option?.nextMove, option?.risks.join(" ")].filter(Boolean).join("\n");
}

function assertNoFakePositiveClaims(text: string): void {
  assert.doesNotMatch(text, /\b(imported|connected|read|pulled from|synced|scanned|analyzed)\b.{0,80}\b(gmail|slack|messages?|oauth)\b/i);
  assert.doesNotMatch(text, /\b(global training|shared training|trained on your data|hidden memory|background import|secret memory|private inbox)\b/i);
}

function optionSetQualityScore(options: CandidateOption[]): number {
  return options.reduce((score, option) => {
    const text = [option.title, option.oneLine, option.rationale, option.nextMove, option.risks.join(" ")].join(" ");

    return score
      + (/\bgrounded\b/i.test(text) ? 2 : 0)
      + (/\bsource|memory|evidence\b/i.test(text) ? 2 : 0)
      + (!/\bgeneric chatbot sidebar|generic wrapper\b/i.test(text) || option.lens === "Critical" ? 1 : 0)
      + (option.title.length <= 80 ? 1 : 0);
  }, 0);
}

function modelBackedOptionDrafts(prefix: string) {
  return (["Personal", "Practical", "Valuable", "Critical", "Weird"] satisfies CandidateOption["lens"][]).map((lens, index) => ({
    lens,
    title: `${prefix} ${lens}`,
    oneLine: `Grounded ${lens.toLowerCase()} direction that uses real Penny memory evidence for the source ledger.`,
    rationale: `Grounded in supplied memory and source refs. Inferred ${lens.toLowerCase()} move: sharpen the planning ledger without inventing connector or training claims.`,
    nextMove: `Apply the ${lens.toLowerCase()} draft to the prompt artifact and keep the evidence references intact.`,
    risks: [`${lens} can become generic if the artifact stops naming the supplied source evidence.`],
    scores: {
      intentMatch: 80 + index,
      buildability: 76 + index,
      value: 78 + index,
      novelty: 64 + index,
      risk: 34 + index,
    },
  }));
}

function studioBrainMemory(): MemoryRef[] {
  return [
    {
      id: "studio-pref",
      label: "Preference: tactile studio tools",
      kind: "preference",
      summary: "The user prefers tactile, visual studio tools with zine-like pacing, handmade samples, and playful critique.",
    },
    {
      id: "studio-project",
      label: "Project: maker cohort prompt kit",
      kind: "brain",
      summary: "They are building a workshop prompt kit for independent makers who need cohort exercises and visible creative constraints.",
    },
    {
      id: "studio-frustration",
      label: "Frustration: bland SaaS dashboards",
      kind: "brain",
      summary: "They dislike bland SaaS dashboards, enterprise CRM workflows, and generic chatbot sidebars.",
    },
  ];
}

function studioBrainSources(): SourceRef[] {
  return [
    {
      id: "studio-source",
      label: "Studio workshop notes",
      kind: "source",
      excerpt: "Use tactile zine pacing, visual critique, maker cohort exercises, and visible constraints.",
      sourceRange: "chunk 2",
    },
  ];
}

function fieldBrainMemory(): MemoryRef[] {
  return [
    {
      id: "field-pref",
      label: "Preference: offline-first field tools",
      kind: "preference",
      summary: "The user prefers rugged offline-first workflows, audit trails, and low-connectivity field capture over polished studio interactions.",
    },
    {
      id: "field-project",
      label: "Project: inspection ledger",
      kind: "brain",
      summary: "They are building an inspection ledger for field teams that turns messy site notes into implementation-ready plans.",
    },
    {
      id: "field-frustration",
      label: "Frustration: paperwork bottleneck",
      kind: "brain",
      summary: "They are frustrated by paperwork bottlenecks, missing audit evidence, and AI magic claims that cannot be verified on site.",
    },
  ];
}

function fieldBrainSources(): SourceRef[] {
  return [
    {
      id: "field-source",
      label: "Field inspection notes",
      kind: "source",
      excerpt: "Prioritize offline capture, audit trails, rugged field workflows, and verifiable site evidence.",
      sourceRange: "chunk 4",
    },
  ];
}

function jsonRequest(url: string, body: unknown, headers: HeadersInit = requestHeaders()): Request {
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function deleteRequest(url: string, headers: HeadersInit = requestHeaders()): Request {
  return new Request(url, {
    method: "DELETE",
    headers,
  });
}

function getRequest(url: string, headers: HeadersInit = requestHeaders()): Request {
  return new Request(url, {
    method: "GET",
    headers,
  });
}

function requestHeaders(overrides: Record<string, string> = {}): HeadersInit {
  return {
    "content-type": "application/json",
    "x-user-id": "test-user",
    "x-workspace-id": "test-workspace",
    "x-project-id": "test-project",
    "x-sphere-id": "test-sphere",
    ...overrides,
  };
}

async function responsePayload(response: Response): Promise<any> {
  return response.json();
}
