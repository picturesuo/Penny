import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createInMemoryBrainMemoryService,
  handleBrainDemoFixtureRequest,
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
import type { BrainRankerRecorder, RecordBrainDevelopmentEventInput } from "./brain-ranker-persistence.ts";

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
  assert.equal(profile.sources[0]?.preview?.status, "ready");
  assert.match(profile.sources[0]?.preview?.explanation ?? "", /markdown/i);
  assert.match(profile.sources[0]?.preview?.excerpt ?? "", /Goal: I want Penny/i);
  assert.deepEqual(profile.sources[0]?.permission.allowedUses, ["private_memory", "create_retrieval"]);
  assert.match(profile.profile.privacySafeSummary, /no private global training is claimed or enabled/i);
  assert.ok(profile.profile.recurringInterests.length >= 1);
  assert.ok(profile.profile.commonFrustrations.length >= 1);
  assert.ok(profile.profile.preferredBuildStyle.length >= 1);
  assert.ok(profile.profile.repeatedRejectedDirections.length >= 1);
  assert.ok(profile.profile.activeProjects.length >= 1);
  assert.ok(profile.profile.ideaClusters.length >= 1);
  assert.ok(profile.profile.highValueMemories.length >= 1);
  assert.ok(profile.profile.recentMeaningfulActivity.some((activity) => activity.kind === "source_imported"));
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

test("Brain memory profile exposes high-value, stale, superseded, and activity sections", async () => {
  const backing = new Map() as NonNullable<Parameters<typeof createInMemoryBrainMemoryService>[0]>;
  const service = createInMemoryBrainMemoryService(backing);
  const importResponse = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "text",
      label: "Profile ranker notes",
      content:
        "Preference: I prefer source-backed Create cards with visible proof. Preference: I prefer source-backed Create cards before polish. Project: Penny Create should rank memory into one next-best move. Rejected direction: Avoid generic chatbot sidebars.",
    }),
    { service },
  );
  const importPayload = await responsePayload(importResponse);
  const importedProfile = importPayload.data.profile as BrainMemoryProfile;
  const store = [...backing.values()][0];
  const sourceBackedNodes = [...(store?.nodes.values() ?? [])].filter((node) => /source-backed Create cards/i.test(node.summary));

  assert.equal(importResponse.status, 200);
  assert.ok(importedProfile.profile.highValueMemories.length >= 1);
  assert.ok(store);
  assert.ok(sourceBackedNodes.length >= 2);

  const older = sourceBackedNodes[0]!;
  const newer = sourceBackedNodes[1]!;
  store.nodes.set(older.id, {
    ...older,
    confidence: 0.62,
    lastSeenAt: "2025-01-01T00:00:00.000Z",
  });
  store.nodes.set(newer.id, {
    ...newer,
    confidence: 0.97,
    evidenceLevel: "user_confirmed",
    lastSeenAt: "2026-05-20T12:00:00.000Z",
  });

  const response = await handleBrainMemoryProfileRequest(getRequest("http://localhost/api/brain/memory/profile"), { service });
  const payload = await responsePayload(response);
  const profile = payload.data as BrainMemoryProfile;

  assert.equal(response.status, 200);
  assert.ok(profile.profile.highValueMemories.some((node) => node.id === newer.id));
  assert.ok(profile.profile.staleMemories.some((node) => node.id === older.id));
  assert.ok(profile.profile.supersededMemories.some((node) => node.id === older.id));
  assert.ok(profile.profile.ideaClusters.some((cluster) => cluster.currentMemoryNodeId === newer.id && cluster.supersededMemoryNodeIds.includes(older.id)));
  assert.ok(profile.profile.recentMeaningfulActivity.some((activity) => activity.kind === "memory_confirmed" && activity.memoryNodeIds.includes(newer.id)));
});

test("Brain memory import and review actions record development events", async () => {
  const events: RecordBrainDevelopmentEventInput[] = [];
  const rankerRecorder: BrainRankerRecorder = {
    async recordCreateRankerRun() {
      throw new Error("Brain memory should not record Create ranker runs.");
    },
    async recordDevelopmentEvent(input) {
      events.push(input);
    },
  };
  const service = createInMemoryBrainMemoryService(new Map(), rankerRecorder);
  const importResponse = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "text",
      label: "Development event notes",
      content:
        "Project: Penny should record source imports and memory reviews. Preference: I prefer explicit review actions to weigh more than implicit extraction. Rejected direction: Avoid generic chatbot sidebars.",
    }),
    { service },
  );
  const importPayload = await responsePayload(importResponse);
  const profile = importPayload.data.profile as BrainMemoryProfile;
  const firstMemory = profile.recentMemoryNodes[0];
  const secondMemory = profile.recentMemoryNodes[1];

  assert.equal(importResponse.status, 200);
  assert.ok(firstMemory);
  assert.ok(secondMemory);
  assert.ok(events.some((event) => event.kind === "source_imported" && event.explicitness === "explicit" && event.weight > 0.85));
  assert.ok(events.some((event) => event.kind === "memory_extracted" && event.explicitness === "implicit" && event.weight < 0.85));

  await handleBrainMemoryReviewRequest(
    jsonRequest(`http://localhost/api/brain/memories/${firstMemory.id}/review`, { action: "boost" }),
    firstMemory.id,
    { service },
  );
  await handleBrainMemoryReviewRequest(
    jsonRequest(`http://localhost/api/brain/memories/${firstMemory.id}/review`, { action: "wrong" }),
    firstMemory.id,
    { service },
  );
  await handleBrainMemoryReviewRequest(
    jsonRequest(`http://localhost/api/brain/memories/${secondMemory.id}/review`, { action: "forget" }),
    secondMemory.id,
    { service },
  );

  assert.ok(events.some((event) => event.kind === "memory_boosted" && event.explicitness === "explicit" && event.weight > 0.85));
  assert.ok(events.some((event) => event.kind === "memory_wrong" && event.explicitness === "explicit" && event.memoryNodeIds?.includes(firstMemory.id)));
  assert.ok(events.some((event) => event.kind === "memory_forgotten" && event.explicitness === "explicit" && event.memoryNodeIds?.includes(secondMemory.id)));
  assert.ok(events.every((event) => !("rawScore" in (event.payload ?? {}))));
});

test("Brain memory sync imports record source synced development events", async () => {
  const events: RecordBrainDevelopmentEventInput[] = [];
  const rankerRecorder: BrainRankerRecorder = {
    async recordCreateRankerRun() {
      throw new Error("Brain memory should not record Create ranker runs.");
    },
    async recordDevelopmentEvent(input) {
      events.push(input);
    },
  };
  const service = createInMemoryBrainMemoryService(new Map(), rankerRecorder);
  const response = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "docs_text",
      label: "Strategy doc",
      sourceUri: "google-drive:file:doc-1",
      content:
        "Project: Penny should use selected Google Docs as private source-backed memory. Preference: keep connector claims honest and provenance visible.",
    }),
    { service },
  );
  const payload = await responsePayload(response);
  const profile = payload.data.profile as BrainMemoryProfile;
  const syncedEvent = events.find((event) => event.kind === "source_synced");

  assert.equal(response.status, 200);
  assert.ok(syncedEvent);
  assert.equal(syncedEvent.explicitness, "implicit");
  assert.equal(syncedEvent.payload?.sourceUri, "google-drive:file:doc-1");
  assert.equal(events.some((event) => event.kind === "source_imported"), false);
  assert.ok(profile.profile.recentMeaningfulActivity.some((activity) => activity.kind === "source_synced" && activity.label === "Synced Strategy doc"));
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

test("default Brain memory service refuses production in-memory fallback", async () => {
  await withEnv({ NODE_ENV: "production", DATABASE_URL: undefined }, async () => {
    const response = await handleBrainMemoryProfileRequest(getRequest("http://localhost/api/brain/memory/profile"));
    const payload = await responsePayload(response);

    assert.equal(response.status, 500);
    assert.equal(payload.error.code, "brain_memory_failed");
    assert.match(payload.error.message, /DATABASE_URL is required for Brain memory in production/i);
    assert.match(payload.error.message, /in-memory Brain memory is only for local dev\/test/i);
  });
});

test("default Brain memory service uses local in-memory fallback when database prep is skipped", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://stale-user:stale-pass@invalid.invalid:5432/penny",
      PENNY_AUTH_MODE: "dev",
      PENNY_SKIP_DATABASE_PREP: "true",
    },
    async () => {
      const headers = requestHeaders({
        "x-user-id": "local-fallback-user",
        "x-workspace-id": "local-fallback-workspace",
        "x-project-id": "local-fallback-project",
        "x-sphere-id": "local-fallback-sphere",
      });
      const response = await handleBrainImportRequest(
        jsonRequest(
          "http://localhost/api/brain/import",
          {
            kind: "text",
            label: "Local fallback notes",
            content:
              "Project: Penny should use a safe local demo Brain when database prep is skipped. Preference: keep YC Create fixture imports working without stale remote database access.",
          },
          headers,
        ),
      );
      const payload = await responsePayload(response);
      const job = payload.data.job as IngestionJob;
      const profile = payload.data.profile as BrainMemoryProfile;

      assert.equal(response.status, 200);
      assert.equal(job.status, "completed");
      assert.equal(profile.stats.sourceCount, 1);
      assert.ok(profile.recentMemoryNodes.some((node) => /local demo Brain|YC Create fixture/i.test(node.summary)));
    },
  );
});

test("Brain memory jobs, reviews, retrieval, and source deletion are scoped by user", async () => {
  const service = createInMemoryBrainMemoryService();
  const userAHeaders = requestHeaders({
    "x-user-id": "brain-route-user-a",
    "x-workspace-id": "brain-route-workspace",
    "x-project-id": "brain-route-project",
    "x-sphere-id": "brain-route-sphere",
  });
  const userBHeaders = requestHeaders({
    "x-user-id": "brain-route-user-b",
    "x-workspace-id": "brain-route-workspace",
    "x-project-id": "brain-route-project",
    "x-sphere-id": "brain-route-sphere",
  });
  const importResponse = await handleBrainImportRequest(
    jsonRequest(
      "http://localhost/api/brain/import",
      {
        kind: "text",
        label: "Scoped source notes",
        content:
          "Project: The scoped source should only be visible to user A. I prefer private source-backed memory with no global training claims.",
      },
      userAHeaders,
    ),
    { service },
  );
  const importPayload = await responsePayload(importResponse);
  const job = importPayload.data.job as IngestionJob;
  const userAProfile = importPayload.data.profile as BrainMemoryProfile;
  const memory = userAProfile.recentMemoryNodes[0];

  assert.equal(importResponse.status, 200);
  assert.ok(job.sourceId);
  assert.ok(memory);

  const otherJobResponse = await handleBrainImportJobRequest(getRequest(`http://localhost/api/brain/import/${job.id}`, userBHeaders), job.id, {
    service,
  });
  const otherRetrieveResponse = await handleBrainRetrieveRequest(
    jsonRequest("http://localhost/api/brain/retrieve", { query: "scoped source private", limit: 5 }, userBHeaders),
    { service },
  );
  const otherReviewResponse = await handleBrainMemoryReviewRequest(
    jsonRequest(`http://localhost/api/brain/memories/${memory.id}/review`, { action: "boost" }, userBHeaders),
    memory.id,
    { service },
  );
  const otherDeleteResponse = await handleBrainSourceDeleteRequest(deleteRequest(`http://localhost/api/brain/sources/${job.sourceId}`, userBHeaders), job.sourceId, {
    service,
  });
  const otherProfileResponse = await handleBrainMemoryProfileRequest(getRequest("http://localhost/api/brain/memory/profile", userBHeaders), {
    service,
  });
  const ownerProfileResponse = await handleBrainMemoryProfileRequest(getRequest("http://localhost/api/brain/memory/profile", userAHeaders), {
    service,
  });
  const otherRetrieval = (await responsePayload(otherRetrieveResponse)).data as BrainMemoryRetrieval;
  const otherProfile = (await responsePayload(otherProfileResponse)).data as BrainMemoryProfile;
  const ownerProfile = (await responsePayload(ownerProfileResponse)).data as BrainMemoryProfile;

  assert.equal(otherJobResponse.status, 404);
  assert.equal(otherReviewResponse.status, 404);
  assert.equal(otherDeleteResponse.status, 404);
  assert.equal(otherRetrieveResponse.status, 200);
  assert.equal(otherRetrieval.contextLight, true);
  assert.equal(otherRetrieval.results.length, 0);
  assert.equal(otherProfile.stats.sourceCount, 0);
  assert.equal(ownerProfile.stats.sourceCount, 1);
  assert.ok(ownerProfile.sources.some((source) => source.id === job.sourceId));
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

test("POST /api/brain/import follows realistic ChatGPT current_node branches and returns source preview", async () => {
  const service = createInMemoryBrainMemoryService();
  const importResponse = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "chatgpt_export",
      label: "Real ChatGPT export",
      fileName: "conversations.json",
      content: JSON.stringify(realisticChatGptBranchFixture()),
    }),
    { service },
  );
  const importPayload = await responsePayload(importResponse);
  const profile = importPayload.data.profile as BrainMemoryProfile;

  assert.equal(importResponse.status, 200);
  assert.equal((importPayload.data.job as IngestionJob).status, "completed");
  assert.equal(profile.sources[0]?.preview?.status, "ready");
  assert.match(profile.sources[0]?.preview?.explanation ?? "", /ChatGPT conversation export/i);
  assert.match(profile.sources[0]?.preview?.excerpt ?? "", /source previews/i);
  assert.ok(!profile.recentMemoryNodes.some((node) => /enterprise CRM branch/i.test(node.summary)));
  assert.ok(profile.recentMemoryNodes.some((node) => /source previews|global training/i.test(node.summary)));

  const retrieveResponse = await handleBrainRetrieveRequest(
    jsonRequest("http://localhost/api/brain/retrieve", {
      query: "source previews fake global training",
      limit: 5,
    }),
    { service },
  );
  const retrievePayload = await responsePayload(retrieveResponse);
  const retrieval = retrievePayload.data as BrainMemoryRetrieval;

  assert.equal(retrieveResponse.status, 200);
  assert.equal(retrieval.contextLight, false);
  assert.ok(retrieval.results.some((result) => /source previews|global training/i.test(result.summary)));
});

test("POST /api/brain/import extracts conversations.json from ChatGPT ZIP exports", async () => {
  const service = createInMemoryBrainMemoryService();
  const archive = zipBase64({
    "README.txt": "Your ChatGPT export contains account metadata.",
    "conversations.json": JSON.stringify(chatGptExportFixture()),
  });
  const importResponse = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "zip",
      label: "ChatGPT ZIP export",
      fileName: "chatgpt-export.zip",
      mimeType: "application/zip",
      content: archive,
    }),
    { service },
  );
  const importPayload = await responsePayload(importResponse);
  const job = importPayload.data.job as IngestionJob;
  const profile = importPayload.data.profile as BrainMemoryProfile;

  assert.equal(importResponse.status, 200);
  assert.equal(job.status, "completed");
  assert.equal(profile.sources[0]?.kind, "zip");
  assert.equal(profile.sources[0]?.privacy.trainingUse, false);
  assert.match(profile.sources[0]?.preview?.explanation ?? "", /ZIP archive|conversations\.json/i);
  assert.ok(profile.recentMemoryNodes.some((node) => /generic chatbot sidebar|thinking graph|rejected directions/i.test(node.summary)));

  const retrieveResponse = await handleBrainRetrieveRequest(
    jsonRequest("http://localhost/api/brain/retrieve", {
      query: "generic chatbot sidebars source-backed",
      limit: 5,
    }),
    { service },
  );
  const retrievePayload = await responsePayload(retrieveResponse);
  const retrieval = retrievePayload.data as BrainMemoryRetrieval;

  assert.equal(retrieveResponse.status, 200);
  assert.equal(retrieval.contextLight, false);
  assert.ok(retrieval.results.every((result) => result.permission.trainingUse === false));
  assert.ok(retrieval.results.some((result) => result.sourceRef.label === "ChatGPT ZIP export"));
});

test("POST /api/brain/import returns guidance when ZIP has no readable export text", async () => {
  const service = createInMemoryBrainMemoryService();
  const response = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "zip",
      label: "Unsupported ZIP",
      fileName: "images.zip",
      content: zipBase64({ "images/screenshot.bin": "not readable text" }),
    }),
    { service },
  );
  const payload = await responsePayload(response);
  const job = payload.data.job as IngestionJob;

  assert.equal(response.status, 200);
  assert.equal(job.status, "failed");
  assert.match(job.errorMessages.join(" "), /conversations\.json|markdown|text files/i);
});

test("POST /api/brain/import parses Claude export chats and message content arrays", async () => {
  const service = createInMemoryBrainMemoryService();
  const importResponse = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "claude_export",
      label: "Claude export",
      fileName: "conversations.json",
      content: JSON.stringify(claudeExportFixture()),
    }),
    { service },
  );
  const importPayload = await responsePayload(importResponse);
  const profile = importPayload.data.profile as BrainMemoryProfile;

  assert.equal(importResponse.status, 200);
  assert.equal((importPayload.data.job as IngestionJob).status, "completed");
  assert.equal(profile.sources[0]?.preview?.status, "ready");
  assert.match(profile.sources[0]?.preview?.explanation ?? "", /Claude export/i);
  assert.ok(profile.recentMemoryNodes.some((node) => node.type === "project" && /field ops command center/i.test(node.summary)));
  assert.ok(profile.recentMemoryNodes.some((node) => node.type === "preference" && /audit trails/i.test(node.summary)));

  const retrieveResponse = await handleBrainRetrieveRequest(
    jsonRequest("http://localhost/api/brain/retrieve", { query: "field ops audit trails offline-first", limit: 5 }),
    { service },
  );
  const retrievePayload = await responsePayload(retrieveResponse);
  const retrieval = retrievePayload.data as BrainMemoryRetrieval;

  assert.equal(retrieveResponse.status, 200);
  assert.equal(retrieval.contextLight, false);
  assert.ok(retrieval.results.some((result) => result.sourceRef.label === "Claude export"));
});

test("POST /api/brain/import returns a clear failed job for raw PDF binary", async () => {
  const service = createInMemoryBrainMemoryService();
  const response = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "pdf",
      label: "Raw PDF",
      fileName: "notes.pdf",
      content: "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\nxref\n0 1",
    }),
    { service },
  );
  const payload = await responsePayload(response);
  const job = payload.data.job as IngestionJob;
  const profile = payload.data.profile as BrainMemoryProfile;

  assert.equal(response.status, 200);
  assert.equal(job.status, "failed");
  assert.match(job.errorMessages.join(" "), /raw PDF data|already been extracted|OCR/i);
  assert.equal(profile.stats.sourceCount, 0);
});

test("POST /api/brain/import returns a failed job for oversized normalized imports", async () => {
  const service = createInMemoryBrainMemoryService();
  const response = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "text",
      label: "Oversized notes",
      content: "Project: Penny dogfood import guard should reject oversized source-backed memory.\n".repeat(10_000),
    }),
    { service },
  );
  const payload = await responsePayload(response);
  const job = payload.data.job as IngestionJob;
  const profile = payload.data.profile as BrainMemoryProfile;

  assert.equal(response.status, 200);
  assert.equal(job.status, "failed");
  assert.match(job.errorMessages.join(" "), /too large after normalization|Split it into smaller files/i);
  assert.equal(profile.stats.sourceCount, 0);
});

test("POST /api/brain/import turns the Penny demo ChatGPT fixture into a useful Brain profile", async () => {
  const service = createInMemoryBrainMemoryService();
  const content = await readFile(new URL("../../../test/fixtures/penny-brain-demo-conversations.json", import.meta.url), "utf8");
  const importResponse = await handleBrainImportRequest(
    jsonRequest("http://localhost/api/brain/import", {
      kind: "chatgpt_export",
      label: "Penny demo ChatGPT export",
      fileName: "conversations.json",
      content,
    }),
    { service },
  );
  const importPayload = await responsePayload(importResponse);
  const profile = importPayload.data.profile as BrainMemoryProfile;

  assert.equal(importResponse.status, 200);
  assert.ok(profile.stats.memoryNodeCount >= 7);
  assert.ok(profile.profile.recurringInterests.some((signal) => /penny|memory|create|prompt/i.test(signal.label)));
  assert.ok(profile.profile.activeIdeaClusters.length >= 1);
  assert.ok(profile.profile.tasteSignals.length >= 1);
  assert.ok(profile.profile.commonFrustrations.length >= 1);
  assert.ok(profile.profile.preferredBuildStyle.length >= 1);
  assert.ok(profile.profile.repeatedRejectedDirections.some((signal) => /broad document ingestion|avoid|document/i.test(`${signal.label} ${signal.summary}`)));
  assert.ok(profile.recentMemoryNodes.some((node) => node.type === "preference" && /small reversible builds/i.test(node.summary)));
  assert.ok(profile.recentMemoryNodes.some((node) => node.type === "rejected_direction" && /broad document ingestion/i.test(node.summary)));

  const retrieveResponse = await handleBrainRetrieveRequest(
    jsonRequest("http://localhost/api/brain/retrieve", {
      query: "coding prompt acceptance tests do-not-break list memory-native creativity",
      limit: 5,
    }),
    { service },
  );
  const retrievePayload = await responsePayload(retrieveResponse);
  const retrieval = retrievePayload.data as BrainMemoryRetrieval;

  assert.equal(retrieveResponse.status, 200);
  assert.equal(retrieval.contextLight, false);
  assert.ok(retrieval.results.some((result) => result.sourceRef.label === "Penny demo ChatGPT export"));
  assert.ok(retrieval.results.some((result) => /coding prompt|acceptance tests|creativity/i.test(result.summary)));
});

test("GET /api/brain/demo-fixture/penny returns the existing demo fixture as an import payload", async () => {
  const response = await handleBrainDemoFixtureRequest(getRequest("http://localhost/api/brain/demo-fixture/penny"));
  const payload = await responsePayload(response);

  assert.equal(response.status, 200);
  assert.equal(payload.data.importInput.kind, "chatgpt_export");
  assert.equal(payload.data.importInput.label, "Penny demo ChatGPT export");
  assert.equal(payload.data.importInput.fileName, "conversations.json");
  assert.match(payload.data.importInput.content, /memory-native Create direction/);
});

test("GET /api/brain/demo-fixture/yc-founder returns a private YC founder fixture", async () => {
  const service = createInMemoryBrainMemoryService();
  const response = await handleBrainDemoFixtureRequest(getRequest("http://localhost/api/brain/demo-fixture/yc-founder"));
  const payload = await responsePayload(response);

  assert.equal(response.status, 200);
  assert.equal(payload.data.importInput.kind, "json");
  assert.equal(payload.data.importInput.label, "Penny YC founder fixture");
  assert.equal(payload.data.importInput.fileName, "penny-yc-founder-fixture.json");
  assert.match(payload.data.demoPrompt, /YC startup around ideation and thinking/i);
  assert.match(payload.data.safetyCopy, /Safe demo fixture only/i);
  assert.equal(payload.data.importInputs.length, 5);
  assert.deepEqual(
    payload.data.importInputs.map((input: { kind: string }) => input.kind),
    ["email_fixture", "linkedin_context", "manual_messages_transcript", "founder_notes", "founder_notes"],
  );
  assert.match(payload.data.importInputs.map((input: { label: string }) => input.label).join("\n"), /Email fixture/);
  assert.match(payload.data.importInputs.map((input: { label: string }) => input.label).join("\n"), /LinkedIn-style founder context fixture/);
  assert.match(payload.data.importInputs.map((input: { label: string }) => input.label).join("\n"), /Manual messages context for demo/);
  assert.match(payload.data.importInputs.map((input: { content: string }) => input.content).join("\n"), /trainingUse=false/);
  assert.ok(payload.data.importInputs.every((input: { privacy?: { visibility?: string; trainingUse?: boolean; rawRetention?: boolean; source?: string } }) => (
    input.privacy?.visibility === "private_memory"
    && input.privacy.trainingUse === false
    && input.privacy.rawRetention === false
    && input.privacy.source === "manual_import"
  )));

  let profile: BrainMemoryProfile | null = null;

  for (const importInput of payload.data.importInputs) {
    const importResponse = await handleBrainImportRequest(
      jsonRequest("http://localhost/api/brain/import", importInput),
      { service },
    );
    const importPayload = await responsePayload(importResponse);

    assert.equal(importResponse.status, 200);
    profile = importPayload.data.profile as BrainMemoryProfile;
  }

  assert.ok(profile);
  assert.ok(profile.stats.sourceCount >= 5);
  assert.ok(profile.stats.memoryNodeCount >= 14);
  assert.ok(profile.sources.every((source) => source.privacy.trainingUse === false));
  assert.ok(profile.sources.every((source) => source.privacy.rawRetention === false));
  assert.ok(profile.sources.every((source) => source.permission.source === "manual_import"));
  assert.ok(profile.recentMemoryNodes.every((node) => node.permission.trainingUse === false));
  const profileText = [
    ...profile.recentMemoryNodes.map((node) => node.summary),
    ...profile.sources.map((source) => source.preview?.excerpt ?? ""),
    ...profile.profile.recurringInterests.map((signal) => `${signal.label} ${signal.summary}`),
    ...profile.profile.activeIdeaClusters.map((signal) => `${signal.label} ${signal.summary}`),
    ...profile.profile.tasteSignals.map((signal) => `${signal.label} ${signal.summary}`),
    ...profile.profile.preferredBuildStyle.map((signal) => `${signal.label} ${signal.summary}`),
    ...profile.profile.commonFrustrations.map((signal) => `${signal.label} ${signal.summary}`),
    ...profile.profile.repeatedRejectedDirections.map((signal) => `${signal.label} ${signal.summary}`),
  ].join("\n");

  assert.match(
    profileText,
    /vague ideas|buildable specs|coding agents before they had a clear spec/i,
  );
  assert.match(profileText, /not a chatbot|human judgment|without taking judgment/i);
  assert.ok(profile.sources.some((source) => source.kind === "manual_messages_transcript"));
  assert.ok(profile.sources.some((source) => /Not live WhatsApp, SMS, iMessage, Slack, or social messages/i.test(source.preview?.excerpt ?? "")));
  assert.ok(profile.profile.repeatedRejectedDirections.some((signal) => /chatbot|dashboard|notes app|assistant/i.test(`${signal.label} ${signal.summary}`)));
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

function realisticChatGptBranchFixture() {
  return [
    {
      title: "Import source previews",
      current_node: "assistant2",
      mapping: {
        root: {
          id: "root",
          parent: null,
          children: ["user1"],
          message: null,
        },
        user1: {
          id: "user1",
          parent: "root",
          children: ["assistant1"],
          message: {
            create_time: 1,
            author: { role: "user" },
            content: {
              content_type: "text",
              parts: ["Project: Penny import should turn realistic ChatGPT exports into source-backed Brain profile signals."],
            },
          },
        },
        assistant1: {
          id: "assistant1",
          parent: "user1",
          children: ["altUser", "user2"],
          message: {
            create_time: 2,
            author: { role: "assistant" },
            content: { parts: ["The path should preserve selected branch order and source provenance."] },
          },
        },
        altUser: {
          id: "altUser",
          parent: "assistant1",
          children: [],
          message: {
            create_time: 3,
            author: { role: "user" },
            content: { parts: ["Project: This enterprise CRM branch should be ignored because it is not the current branch."] },
          },
        },
        user2: {
          id: "user2",
          parent: "assistant1",
          children: ["assistant2"],
          message: {
            create_time: 4,
            author: { role: "user" },
            content: {
              parts: ["I prefer source previews, import status, and clear failed-import explanations. Avoid fake global training claims."],
            },
          },
        },
        assistant2: {
          id: "assistant2",
          parent: "user2",
          children: [],
          message: {
            create_time: 5,
            author: { role: "assistant" },
            content: { parts: ["That should become grounded memory for Create options and prompt exports."] },
          },
        },
      },
    },
  ];
}

function claudeExportFixture() {
  return {
    chats: [
      {
        name: "Field ops product work",
        chat_messages: [
          {
            sender: "human",
            text: "Project: Build a field ops command center that turns rough inspection notes into an implementation plan.",
          },
          {
            sender: "assistant",
            content: [{ type: "text", text: "The plan should preserve site evidence and make every AI claim traceable." }],
          },
          {
            sender: "human",
            content: [{ type: "text", text: "I prefer offline-first capture, audit trails, and source-backed cards over magic AI summaries." }],
          },
        ],
      },
    ],
  };
}

function hasNodeType(profile: BrainMemoryProfile, type: MemoryNodeType): boolean {
  return profile.recentMemoryNodes.some((node) => node.type === type);
}

function zipBase64(entries: Record<string, string>): string {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, text] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(text, "utf8");
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt32LE(0, 34);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]).toString("base64");
}

function jsonRequest(url: string, body: unknown, headers: HeadersInit = requestHeaders()): Request {
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function getRequest(url: string, headers: HeadersInit = requestHeaders()): Request {
  return new Request(url, {
    method: "GET",
    headers,
  });
}

function deleteRequest(url: string, headers: HeadersInit = requestHeaders()): Request {
  return new Request(url, {
    method: "DELETE",
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

async function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]));

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
