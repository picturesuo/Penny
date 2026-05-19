import assert from "node:assert/strict";
import test from "node:test";
import {
  createInMemoryCreateRouteService,
  handleCreateNextRequest,
  handleExportCodingPromptRequest,
  type CandidateOption,
  type CodingPromptArtifact,
  type CreateNextResult,
  type PromptExport,
} from "./create-route.ts";

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
  assert.ok(data.artifact.sections.find((section) => section.title === "Final coding-agent prompt")?.body.includes("## Goal"));
  assert.deepEqual(
    data.verification.checks.map((check) => check.key),
    ["intent_match", "buildability", "source_context_grounding", "non_generic", "missing_info", "risks"],
  );

  for (const option of data.optionSet.options) {
    assert.ok(option.title);
    assert.ok(option.oneLine);
    assert.ok(option.rationale);
    assert.ok(option.nextMove);
    assert.ok(option.risks.length >= 1);
    assert.ok(option.sourcesUsed.some((source) => source.kind === "rough_idea"));
    assert.equal(typeof option.scores.intentMatch, "number");
  }
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
  assert.match(exported.text, /## Goal/);
  assert.match(exported.text, /## Requirements/);
  assert.match(exported.text, /## Implementation Sequence/);
  assert.match(exported.text, /## Do-Not-Break List/);
  assert.match(exported.text, /## Definition of Done/);
  assert.match(exported.text, /route contracts, client methods, compact UI, and tests/i);
});

async function createNext(service: ReturnType<typeof createInMemoryCreateRouteService>, body: Record<string, unknown>): Promise<CreateNextResult> {
  const response = await handleCreateNextRequest(jsonRequest("http://localhost/api/create/next", body), { service });
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

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "test-user",
      "x-workspace-id": "test-workspace",
      "x-project-id": "test-project",
      "x-sphere-id": "test-sphere",
    },
    body: JSON.stringify(body),
  });
}

async function responsePayload(response: Response): Promise<any> {
  return response.json();
}
