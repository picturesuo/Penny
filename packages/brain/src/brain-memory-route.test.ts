import assert from "node:assert/strict";
import test from "node:test";
import {
  createInMemoryBrainMemoryService,
  handleBrainImportJobRequest,
  handleBrainImportRequest,
  handleBrainMemoryProfileRequest,
  handleBrainMemoryReviewRequest,
  handleBrainRetrieveRequest,
  handleBrainSourceDeleteRequest,
  type BrainMemoryProfile,
  type BrainMemoryReviewResult,
  type BrainMemoryRetrieval,
  type IngestionJob,
  type MemoryNodeType,
} from "./brain-memory-route.ts";

test("POST /api/brain/import stores private source chunks, memory nodes, edges, and profile signals", async () => {
  const service = createInMemoryBrainMemoryService();
  const response = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "markdown",
      label: "Penny product notes",
      fileName: "penny-notes.md",
      content: sampleNotes(),
    }),
    { service },
  );
  const payload = await responsePayload(response);
  const job = payload.data.job as IngestionJob;
  const profile = payload.data.profile as BrainMemoryProfile;

  assert.equal(response.status, 200);
  assert.equal(job.status, "completed");
  assert.equal(job.counts.sources, 1);
  assert.ok(job.counts.chunks >= 1);
  assert.ok(job.counts.memoryNodes >= 5);
  assert.ok(job.counts.memoryEdges >= 1);
  assert.equal(profile.sourceOfTruth, "private_user_memory_sources_chunks_nodes_edges_profile_signals");
  assert.equal(profile.stats.sourceCount, 1);
  assert.equal(profile.stats.chunkCount, job.counts.chunks);
  assert.equal(profile.sources[0]?.privacy.visibility, "private");
  assert.equal(profile.sources[0]?.privacy.trainingUse, false);
  assert.deepEqual(profile.sources[0]?.permission.allowedUses, ["private_memory", "create_retrieval"]);
  assert.match(profile.profile.privacySafeSummary, /no private global training is claimed or enabled/i);
  assert.ok(profile.profile.recurringInterests.length >= 1);
  assert.ok(profile.profile.commonFrustrations.length >= 1);
  assert.ok(hasNodeType(profile, "goal"));
  assert.ok(hasNodeType(profile, "preference"));
  assert.ok(hasNodeType(profile, "frustration"));
  assert.ok(hasNodeType(profile, "decision"));
  assert.ok(hasNodeType(profile, "rejected_direction"));
  assert.ok(profile.recentMemoryNodes.some((node) => node.labels.includes("preference")));
  assert.ok(profile.recentMemoryNodes.some((node) => node.labels.includes("frustration")));
  assert.ok(profile.recentMemoryNodes.some((node) => node.evidenceLevel === "user_confirmed"));

  const jobResponse = await handleBrainImportJobRequest(getRequest(`http://localhost/api/brain/import/${job.id}`), job.id, { service });
  const jobPayload = await responsePayload(jobResponse);

  assert.equal(jobResponse.status, 200);
  assert.equal(jobPayload.data.job.id, job.id);
});

test("Brain memory retrieval survives service reload when the backing store is retained", async () => {
  const backing = new Map() as Parameters<typeof createInMemoryBrainMemoryService>[0];
  const importingService = createInMemoryBrainMemoryService(backing);
  await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "text",
      label: "Reloaded founder notes",
      content:
        "Project: Penny Create should use private memory to ground startup options. I prefer source-backed cards over generic suggestions.",
    }),
    { service: importingService },
  );

  const reloadedService = createInMemoryBrainMemoryService(backing);
  const response = await handleBrainRetrieveRequest(
    jsonRequest("http://localhost/api/brain/retrieve", {
      query: "source-backed startup options",
      limit: 3,
    }),
    { service: reloadedService },
  );
  const payload = await responsePayload(response);
  const data = payload.data as BrainMemoryRetrieval;

  assert.equal(response.status, 200);
  assert.equal(data.contextLight, false);
  assert.ok(data.results.some((result) => result.sourceRef.label === "Reloaded founder notes"));
  assert.ok(data.results.some((result) => result.memoryRef.summary.includes("source-backed")));
});

test("POST /api/brain/import parses ChatGPT-style conversations.json and retrieval returns source-backed memory", async () => {
  const service = createInMemoryBrainMemoryService();
  await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "chatgpt_export",
      label: "ChatGPT export",
      fileName: "conversations.json",
      content: JSON.stringify(chatGptExportFixture()),
    }),
    { service },
  );

  const response = await handleBrainRetrieveRequest(
    jsonRequest("http://localhost/api/brain/retrieve", {
      query: "Penny should help founders avoid generic chatbot sidebars",
      limit: 5,
    }),
    { service },
  );
  const payload = await responsePayload(response);
  const data = payload.data as BrainMemoryRetrieval;

  assert.equal(response.status, 200);
  assert.equal(data.sourceOfTruth, "private_user_memory_retrieval");
  assert.equal(data.contextLight, false);
  assert.ok(data.results.length >= 1);
  assert.ok(data.results.some((result) => /founders|chatbot|penny/i.test(result.summary)));
  assert.ok(data.results.every((result) => result.sourceRef.kind === "source"));
  assert.ok(data.results.every((result) => result.sourceRef.sourceRange.startsWith("chunk ")));
  assert.ok(data.results.every((result) => result.permission.visibility === "private"));
  assert.ok(data.results.every((result) => result.permission.trainingUse === false));
});

test("Brain memory review can confirm, boost, weaken, and forget a memory", async () => {
  const service = createInMemoryBrainMemoryService();
  const importResponse = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "text",
      label: "Memory review notes",
      content: "Project: The frostline ledger app should convert field notes into source-backed coding prompts.",
    }),
    { service },
  );
  const importPayload = await responsePayload(importResponse);
  const importedProfile = importPayload.data.profile as BrainMemoryProfile;
  const memory = importedProfile.recentMemoryNodes.find((node) => /frostline/i.test(node.summary));

  assert.ok(memory);

  const correctResponse = await handleBrainMemoryReviewRequest(
    jsonRequest(`http://localhost/api/brain/memories/${memory.id}/review`, { action: "correct" }),
    memory.id,
    { service },
  );
  const correctPayload = await responsePayload(correctResponse);
  const correctResult = correctPayload.data as BrainMemoryReviewResult;

  assert.equal(correctResponse.status, 200);
  assert.equal(correctResult.reviewed, true);
  assert.equal(correctResult.memory?.evidenceLevel, "user_confirmed");
  assert.ok((correctResult.memory?.confidence ?? 0) >= 0.95);

  const boostResponse = await handleBrainMemoryReviewRequest(
    jsonRequest(`http://localhost/api/brain/memories/${memory.id}/review`, { action: "boost" }),
    memory.id,
    { service },
  );
  const boostPayload = await responsePayload(boostResponse);
  const boostResult = boostPayload.data as BrainMemoryReviewResult;

  assert.equal(boostResponse.status, 200);
  assert.ok((boostResult.memory?.confidence ?? 0) >= (correctResult.memory?.confidence ?? 0));

  const wrongResponse = await handleBrainMemoryReviewRequest(
    jsonRequest(`http://localhost/api/brain/memories/${memory.id}/review`, { action: "wrong" }),
    memory.id,
    { service },
  );
  const wrongPayload = await responsePayload(wrongResponse);
  const wrongResult = wrongPayload.data as BrainMemoryReviewResult;

  assert.equal(wrongResponse.status, 200);
  assert.equal(wrongResult.memory?.confidence, 0.05);
  assert.ok(!wrongResult.profile.recentMemoryNodes.some((node) => node.id === memory.id));

  const retrieveResponse = await handleBrainRetrieveRequest(
    jsonRequest("http://localhost/api/brain/retrieve", { query: "frostline ledger source-backed coding prompts", limit: 3 }),
    { service },
  );
  const retrievePayload = await responsePayload(retrieveResponse);

  assert.equal((retrievePayload.data as BrainMemoryRetrieval).contextLight, true);

  const forgetResponse = await handleBrainMemoryReviewRequest(
    jsonRequest(`http://localhost/api/brain/memories/${memory.id}/review`, { action: "forget" }),
    memory.id,
    { service },
  );
  const forgetPayload = await responsePayload(forgetResponse);
  const forgetResult = forgetPayload.data as BrainMemoryReviewResult;

  assert.equal(forgetResponse.status, 200);
  assert.equal(forgetResult.memory, null);
  assert.equal(forgetResult.profile.sources[0]?.memoryNodeCount, 0);

  const missingResponse = await handleBrainMemoryReviewRequest(
    jsonRequest(`http://localhost/api/brain/memories/${memory.id}/review`, { action: "boost" }),
    memory.id,
    { service },
  );

  assert.equal(missingResponse.status, 404);
});

test("Brain memory profile can delete an imported source and return to context-light retrieval", async () => {
  const service = createInMemoryBrainMemoryService();
  const importResponse = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "text",
      label: "Delete me",
      content: "Project: Penny remembers user taste. I prefer small reversible builds. Avoid generic chatbot sidebar claims.",
    }),
    { service },
  );
  const importPayload = await responsePayload(importResponse);
  const sourceId = (importPayload.data.job as IngestionJob).sourceId;
  assert.ok(sourceId);

  const deleteResponse = await handleBrainSourceDeleteRequest(deleteRequest(`http://localhost/api/brain/sources/${sourceId}`), sourceId, { service });
  const deletePayload = await responsePayload(deleteResponse);

  assert.equal(deleteResponse.status, 200);
  assert.equal(deletePayload.data.deleted, true);
  assert.equal((deletePayload.data.profile as BrainMemoryProfile).stats.sourceCount, 0);

  const profileResponse = await handleBrainMemoryProfileRequest(getRequest("http://localhost/api/brain/memory/profile"), { service });
  const profilePayload = await responsePayload(profileResponse);
  const profile = profilePayload.data as BrainMemoryProfile;

  assert.equal(profile.stats.sourceCount, 0);
  assert.match(profile.profile.privacySafeSummary, /context-light/i);

  const retrieveResponse = await handleBrainRetrieveRequest(jsonRequest("http://localhost/api/brain/retrieve", { query: "small builds" }), { service });
  const retrievePayload = await responsePayload(retrieveResponse);

  assert.equal((retrievePayload.data as BrainMemoryRetrieval).contextLight, true);
});

function sampleNotes(): string {
  return [
    "# Penny notes",
    "Goal: I want Penny to make rough ideas controllable before it generates options.",
    "I prefer small reversible builds with explicit provenance and direct tests.",
    "Frustration: Generic chatbot sidebars feel like slop and hide the thinking graph.",
    "Decision: We chose the Create kernel as rough idea to options to judgment to coding prompt.",
    "Avoid broad OAuth connectors before the MVP loop works end to end.",
    "Project: Penny Create should retrieve private user memory before generating options.",
  ].join("\n");
}

function chatGptExportFixture() {
  return [
    {
      title: "Penny founder workflow",
      mapping: {
        root: {
          id: "root",
          message: null,
        },
        user1: {
          id: "user1",
          message: {
            author: { role: "user" },
            content: {
              parts: [
                "I want Penny to help founders develop startup ideas while avoiding generic chatbot sidebar behavior.",
              ],
            },
          },
        },
        assistant1: {
          id: "assistant1",
          message: {
            author: { role: "assistant" },
            content: {
              parts: [
                "A useful direction is a controllable thinking graph that keeps assumptions, decisions, and rejected directions visible.",
              ],
            },
          },
        },
      },
    },
  ];
}

function hasNodeType(profile: BrainMemoryProfile, type: MemoryNodeType): boolean {
  return profile.recentMemoryNodes.some((node) => node.type === type);
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(body),
  });
}

function getRequest(url: string): Request {
  return new Request(url, {
    method: "GET",
    headers: requestHeaders(),
  });
}

function deleteRequest(url: string): Request {
  return new Request(url, {
    method: "DELETE",
    headers: requestHeaders(),
  });
}

function requestHeaders(): HeadersInit {
  return {
    "content-type": "application/json",
    "x-user-id": "test-user",
    "x-workspace-id": "test-workspace",
    "x-project-id": "test-project",
    "x-sphere-id": "test-sphere",
  };
}

async function responsePayload(response: Response): Promise<any> {
  return response.json();
}
