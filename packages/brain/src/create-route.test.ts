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
import { handleBrainImportRequest } from "./brain-memory-route.ts";

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
  assert.ok(data.artifact.sections.find((section) => section.title === "Final coding-agent prompt")?.body.includes("## Product Goal"));
  assert.match(data.artifact.sections.find((section) => section.title === "Final coding-agent prompt")?.body ?? "", /## Personal Context Used/);
  assert.deepEqual(
    data.verification.checks.map((check) => check.key),
    ["intent_match", "buildability", "source_context_grounding", "non_generic", "missing_info", "risks"],
  );

  for (const option of data.optionSet.options) {
    assert.ok(option.title);
    assert.ok(option.oneLine);
    assert.ok(option.rationale);
    assert.match(option.rationale, /Context-light/i);
    assert.ok(option.nextMove);
    assert.ok(option.risks.length >= 1);
    assert.ok(option.sourcesUsed.some((source) => source.kind === "rough_idea"));
    assert.equal(typeof option.scores.intentMatch, "number");
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
  assert.ok(data.optionSet.options.some((option) => option.memoryUsed.length >= 1));
  assert.ok(data.optionSet.options.every((option) => option.sourcesUsed.some((source) => source.label === "Founder workflow notes")));
  assert.ok(data.optionSet.options.every((option) => !/Context-light/i.test(option.rationale)));
  assert.match(sectionBody(data.artifact, "AI/memory orchestration"), /Founder workflow notes/);
  assert.match(sectionBody(data.artifact, "User intent"), /Personal context used/);
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
  assert.match(exported.text, /## User Intent/);
  assert.match(exported.text, /## Personal Context Used/);
  assert.match(exported.text, /Preference: Compact route contracts/);
  assert.match(exported.text, /Founder notes/);
  assert.match(exported.text, /## Selected Option History/);
  assert.match(exported.text, /Practical:/);
  assert.match(exported.text, /Valuable:/);
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

function jsonRequest(url: string, body: unknown, headers: HeadersInit = requestHeaders()): Request {
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
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
