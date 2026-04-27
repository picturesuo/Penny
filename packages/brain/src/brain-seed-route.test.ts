import assert from "node:assert/strict";
import test from "node:test";
import {
  handleBrainSeedRequest,
  type BrainSeedUiPayload,
} from "./brain-seed-route.ts";
import { createHeuristicBrainSeedProvider, generateBrainSeed, type BrainSeedInput, type BrainSeedOutput } from "./seed.ts";
import type { BrainSeedRunRecord, PersistedBrainSeed } from "./seed-persistence.ts";

test("POST /brain/seed rejects invalid request bodies before AI or DB work", async () => {
  let generated = false;
  let persisted = false;
  const response = await handleBrainSeedRequest(
    new Request("http://localhost/brain/seed", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    }),
    {
      async generateSeed() {
        generated = true;
        throw new Error("generateSeed should not run");
      },
      async persistSeed() {
        persisted = true;
        throw new Error("persistSeed should not run");
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string; issues: string[] } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_request");
  assert.match(payload.error.issues.join("\n"), /rawIdea/);
  assert.equal(generated, false);
  assert.equal(persisted, false);
});

test("POST /brain/seed persists the seed and returns a UI-ready payload", async () => {
  let generatedInput: BrainSeedInput | undefined;
  let persistedSeed: BrainSeedOutput | undefined;
  let persistedBrainRun: BrainSeedRunRecord | undefined;
  const response = await handleBrainSeedRequest(
    new Request("http://localhost/brain/seed", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "dev-user-1",
        "x-project-id": "dev-project-1",
      },
      body: JSON.stringify({
        rawIdea: "Penny should turn rough founder strategy into a stress-tested decision brief.",
      }),
    }),
    {
      provider: createHeuristicBrainSeedProvider(),
      async generateSeed(input) {
        generatedInput = input;
        return generateBrainSeed(input, { provider: createHeuristicBrainSeedProvider() });
      },
      async persistSeed(seed, options) {
        persistedSeed = seed;
        persistedBrainRun = options.brainRun;
        return createPersistedSeed(seed, options.brainRun);
      },
    },
  );
  const payload = (await response.json()) as { data: BrainSeedUiPayload };

  assert.equal(response.status, 201);
  assert.equal(payload.data.context.userId, "dev-user-1");
  assert.equal(payload.data.context.projectId, "dev-project-1");
  assert.match(generatedInput?.sessionId ?? "", /^[0-9a-f-]{36}$/);
  assert.equal(persistedSeed?.source.rawText, "Penny should turn rough founder strategy into a stress-tested decision brief.");
  assert.equal(payload.data.session.status, "open");
  assert.equal(payload.data.ideaMap.claims.length, 4);
  assert.equal(payload.data.ideaMap.edges.length, 3);
  assert.notEqual(payload.data.ideaMap.claims[0]?.id, "claim.seed");
  assert.match(payload.data.ideaMap.claims[0]?.versionId ?? "", /^[0-9a-f-]{36}$/);
  assert.equal(payload.data.firstChallenge.failureType, "definition_failure");
  assert.deepEqual(payload.data.firstChallenge.responseOptions, ["Defend", "Revise", "Absorb"]);
  assert.match(payload.data.firstChallenge.targetClaimId, /^[0-9a-f-]{36}$/);
  assert.equal(payload.data.learnCandidates.length, 1);
  assert.match(payload.data.learnCandidates[0]?.claimId ?? "", /^[0-9a-f-]{36}$/);
  assert.equal(payload.data.learnCandidates[0]?.seedClaimId, "claim.assumption.1");
  assert.ok(payload.data.artifacts.some((artifact) => artifact.kind === "idea_map"));
  assert.ok(payload.data.artifacts.some((artifact) => artifact.kind === "challenge_brief"));
  assert.ok(payload.data.moves.some((move) => move.kind === "source.recorded"));
  assert.ok(payload.data.moves.some((move) => move.kind === "artifact.created"));
  assert.equal(persistedBrainRun?.operation, "brain.seed");
  assert.equal(persistedBrainRun?.provider, "heuristic");
  assert.equal(persistedBrainRun?.status, "succeeded");
});

test("POST /brain/seed rejects non-POST methods", async () => {
  const response = await handleBrainSeedRequest(new Request("http://localhost/brain/seed"));
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.equal(payload.error.code, "method_not_allowed");
});

function createPersistedSeed(seed: BrainSeedOutput, brainRun?: BrainSeedRunRecord): PersistedBrainSeed {
  const now = new Date("2026-04-27T00:00:00.000Z");
  const sessionId = seed.session.id;
  const sourceId = uuidAt(101);
  const claims = seed.thoughtMap.claims.map((claim, index) => ({
    id: uuidAt(201 + index),
    seedId: claim.id,
    sessionId,
    sourceId,
    kind: claim.kind,
    status: "exploratory" as const,
    text: claim.text,
    confidence: claim.confidence,
    createdAt: now,
    updatedAt: now,
  }));
  const claimIds = new Map(claims.map((claim) => [claim.seedId, claim.id]));
  const claimVersions = seed.thoughtMap.claims.map((claim, index) => ({
    id: uuidAt(251 + index),
    seedId: claim.id,
    claimId: requireMappedId(claimIds, claim.id),
    sourceId,
    content: claim.text,
    status: "exploratory" as const,
    confidence: claim.confidence,
    isCurrent: true,
    createdAt: now,
  }));
  const claimVersionIds = new Map(claimVersions.map((version) => [version.seedId, version.id]));
  const sourceSpans = seed.thoughtMap.claims.map((claim, index) => ({
    id: uuidAt(351 + index),
    seedId: claim.id,
    sourceId,
    claimId: requireMappedId(claimIds, claim.id),
    claimVersionId: requireMappedId(claimVersionIds, claim.id),
    startOffset: 0,
    endOffset: seed.source.rawText.length,
    label: claim.id === seed.seedClaim.id ? "seed_claim" : "generated_claim",
    createdAt: now,
  }));
  const edges = seed.thoughtMap.edges.map((edge, index) => ({
    id: uuidAt(301 + index),
    seedId: edge.id,
    sessionId,
    fromClaimId: requireMappedId(claimIds, edge.fromClaimId),
    toClaimId: requireMappedId(claimIds, edge.toClaimId),
    kind: edge.kind,
    label: edge.label,
    createdAt: now,
  }));
  const edgeIds = new Map(edges.map((edge) => [edge.seedId, edge.id]));
  const persistedArtifacts = seed.artifacts.map((artifact, index) => ({
    id: uuidAt(401 + index),
    seedId: artifact.id,
    sessionId,
    kind: artifact.kind,
    title: artifact.title,
    summary: artifact.summary,
    payload: {},
    createdAt: now,
  }));
  const artifactIds = new Map(persistedArtifacts.map((artifact) => [artifact.seedId, artifact.id]));
  const persistedMoves = seed.moves.map((move, index) => ({
    id: uuidAt(501 + index),
    seedId: move.id,
    sessionId,
    kind: move.kind,
    summary: move.summary,
    payload: {},
    createdAt: now,
  }));

  return {
    session: {
      id: sessionId,
      status: "open",
      title: seed.seedClaim.text,
      createdAt: now,
      endedAt: null,
    },
    source: {
      id: sourceId,
      sessionId,
      kind: "raw_idea",
      rawText: seed.source.rawText,
      createdAt: now,
    },
    claims,
    claimVersions,
    edges,
    sourceSpans,
    artifacts: persistedArtifacts,
    moves: persistedMoves,
    brainRun: brainRun
      ? {
          id: uuidAt(701),
          sessionId,
          sourceId,
          operation: brainRun.operation,
          provider: brainRun.provider,
          model: brainRun.model ?? null,
          status: brainRun.status,
          input: brainRun.input,
          output: brainRun.output ?? null,
          error: brainRun.error ?? null,
          createdAt: brainRun.startedAt ?? now,
          completedAt: brainRun.completedAt ?? now,
        }
      : null,
    idMaps: {
      claimIds,
      claimVersionIds,
      edgeIds,
      artifactIds,
    },
  };
}

function requireMappedId(ids: Map<string, string>, seedId: string): string {
  const persistedId = ids.get(seedId);

  assert.ok(persistedId, `Missing persisted id for ${seedId}`);
  return persistedId;
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
