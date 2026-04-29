import assert from "node:assert/strict";
import test from "node:test";
import {
  handleBrainSeedRequest,
  type BrainSeedUiPayload,
} from "./brain-seed-route.ts";
import {
  BrainSeedValidationError,
  createHeuristicBrainSeedProvider,
  generateBrainSeed,
  type BrainSeedInput,
  type BrainSeedOutput,
} from "./seed.ts";
import type { BrainSeedPrelude, BrainSeedRunInput, PersistedBrainSeed } from "./seed-persistence.ts";

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
  let preparedRun: BrainSeedRunInput | undefined;
  let failedRun = false;
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
      async prepareSeedRun(input, options) {
        preparedRun = options.run;
        return createPersistedPrelude(input, options.run);
      },
      async generateSeed(input, options) {
        generatedInput = input;
        return generateBrainSeed(input, {
          provider: createHeuristicBrainSeedProvider(),
          brainRunId: options.brainRunId,
        });
      },
      async persistSeed(seed, options) {
        persistedSeed = seed;
        return createPersistedSeed(seed, options.prelude);
      },
      async failSeedRun() {
        failedRun = true;
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
  assert.equal(payload.data.ideaMap.edges[0]?.status, "active");
  assert.notEqual(payload.data.ideaMap.claims[0]?.id, "claim.seed");
  assert.match(payload.data.ideaMap.claims[0]?.versionId ?? "", /^[0-9a-f-]{36}$/);
  assert.equal(payload.data.firstChallenge.failureType, "definition_failure");
  assert.deepEqual(payload.data.firstChallenge.responseOptions, ["Defend", "Revise", "Absorb"]);
  assert.match(payload.data.firstChallenge.targetClaimId, /^[0-9a-f-]{36}$/);
  assert.equal(payload.data.learnCandidates.length, 1);
  assert.match(payload.data.learnCandidates[0]?.claimId ?? "", /^[0-9a-f-]{36}$/);
  assert.equal(payload.data.learnCandidates[0]?.seedClaimId, "claim.assumption.1");
  assert.equal(payload.data.brainRun.status, "succeeded");
  assert.deepEqual(payload.data.artifacts, []);
  assert.deepEqual(
    payload.data.moves.map((move) => move.kind),
    ["source.recorded", "seed_claim_created", "assumptions_extracted", "first_challenge_suggested"],
  );
  assert.equal(preparedRun?.operation, "brain.seed");
  assert.equal(preparedRun?.provider, "heuristic");
  assert.equal(failedRun, false);
});

test("POST /brain/seed rejects non-POST methods", async () => {
  const response = await handleBrainSeedRequest(new Request("http://localhost/brain/seed"));
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.equal(payload.error.code, "method_not_allowed");
});

test("POST /brain/seed marks the BrainRun failed without persisting claims when extraction validation fails", async () => {
  let persisted = false;
  let failedRun: { prelude: BrainSeedPrelude; error: unknown } | undefined;
  const response = await handleBrainSeedRequest(
    new Request("http://localhost/brain/seed", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        rawIdea: "Penny should pressure-test my expansion strategy.",
      }),
    }),
    {
      provider: createHeuristicBrainSeedProvider(),
      async prepareSeedRun(input, options) {
        return createPersistedPrelude(input, options.run);
      },
      async generateSeed() {
        throw new BrainSeedValidationError("Brain seed output failed strict validation.", ["assumptions: Too small"]);
      },
      async persistSeed() {
        persisted = true;
        throw new Error("persistSeed should not run");
      },
      async failSeedRun(prelude, error) {
        failedRun = { prelude, error };
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string; issues: string[] } };

  assert.equal(response.status, 502);
  assert.equal(payload.error.code, "invalid_seed_output");
  assert.equal(persisted, false);
  assert.equal(failedRun?.prelude.brainRun.status, "running");
  assert.ok(failedRun?.error instanceof BrainSeedValidationError);
});

function createPersistedPrelude(input: BrainSeedInput, run: BrainSeedRunInput): BrainSeedPrelude {
  const now = new Date("2026-04-27T00:00:00.000Z");
  const sessionId = input.sessionId ?? uuidAt(100);
  const sourceId = uuidAt(101);
  const brainRunId = uuidAt(701);

  return {
    session: {
      id: sessionId,
      status: "open",
      title: input.rawIdea,
      createdAt: now,
      endedAt: null,
    },
    source: {
      id: sourceId,
      sessionId,
      kind: "raw_idea",
      rawText: input.rawIdea,
      createdAt: now,
    },
    submittedSourceSpan: {
      id: uuidAt(151),
      sourceId,
      claimId: null,
      claimVersionId: null,
      startOffset: 0,
      endOffset: input.rawIdea.length,
      label: "submitted_text",
      createdAt: now,
    },
    brainRun: {
      id: brainRunId,
      sessionId,
      sourceId,
      operation: run.operation,
      provider: run.provider,
      model: run.model ?? null,
      status: "running",
      input: run.input,
      output: null,
      error: null,
      createdAt: run.startedAt ?? now,
      completedAt: null,
    },
  };
}

function createPersistedSeed(seed: BrainSeedOutput, prelude: BrainSeedPrelude): PersistedBrainSeed {
  const now = new Date("2026-04-27T00:00:00.000Z");
  const sessionId = prelude.session.id;
  const sourceId = prelude.source.id;
  const claims = seed.thoughtMap.claims.map((claim, index) => ({
    id: uuidAt(201 + index),
    seedId: claim.id,
	    sessionId,
	    sourceId,
	    kind: claim.kind,
	    createdAt: now,
	  }));
  const claimIds = new Map(claims.map((claim) => [claim.seedId, claim.id]));
  const claimVersions = seed.thoughtMap.claims.map((claim, index) => ({
    id: uuidAt(251 + index),
    seedId: claim.id,
	    claimId: requireMappedId(claimIds, claim.id),
	    sourceId,
	    brainRunId: prelude.brainRun.id,
	    moveId: null,
	    content: claim.text,
    status: "exploratory" as const,
    confidence: claim.confidence,
    isCurrent: true,
    validFrom: now,
    validUntil: null,
    supersededByVersionId: null,
    createdAt: now,
  }));
  const claimVersionIds = new Map(claimVersions.map((version) => [version.seedId, version.id]));
  const edges = seed.thoughtMap.edges.map((edge, index) => ({
    id: uuidAt(301 + index),
    seedId: edge.id,
    sessionId,
    fromClaimId: requireMappedId(claimIds, edge.fromClaimId),
    toClaimId: requireMappedId(claimIds, edge.toClaimId),
    kind: edge.kind,
    status: "active" as const,
    label: edge.label,
    createdAt: now,
  }));
  const edgeIds = new Map(edges.map((edge) => [edge.seedId, edge.id]));
  const moveSeeds = [
    {
      id: "move.source_recorded",
      kind: "source.recorded" as const,
      summary: "Submitted the raw seed idea as the session source.",
      claimIds: [],
      edgeIds: [],
      sourceIds: [sourceId],
      sourceSpanIds: [prelude.submittedSourceSpan.id],
    },
    {
      id: "move.seed_claim_created",
      kind: "seed_claim_created" as const,
      summary: "Created the stable seed claim and its first current version.",
      claimIds: [requireMappedId(claimIds, seed.seedClaim.id)],
      edgeIds: [],
      sourceIds: [],
      sourceSpanIds: [],
    },
    {
      id: "move.assumptions_extracted",
      kind: "assumptions_extracted" as const,
      summary: "Created assumption claims and current versions from the seed extraction.",
      claimIds: seed.assumptions.map((assumption) => requireMappedId(claimIds, assumption.id)),
      edgeIds: Array.from(edgeIds.values()),
      sourceIds: [],
      sourceSpanIds: [],
    },
    {
      id: "move.first_challenge_suggested",
      kind: "first_challenge_suggested" as const,
      summary: "Suggested the first challenge against the weakest load-bearing claim.",
      claimIds: [requireMappedId(claimIds, seed.firstChallenge.targetClaimId)],
      edgeIds: [],
      sourceIds: [],
      sourceSpanIds: [],
    },
  ];
  const persistedMoves = moveSeeds.map((move, index) => ({
    id: uuidAt(501 + index),
    seedId: move.id,
    sessionId,
    kind: move.kind,
    summary: move.summary,
    payload: {
      claimIds: move.claimIds,
      edgeIds: move.edgeIds,
      sourceIds: move.sourceIds,
      sourceSpanIds: move.sourceSpanIds,
    },
    createdAt: now,
  }));

  return {
    session: prelude.session,
    source: prelude.source,
    submittedSourceSpan: prelude.submittedSourceSpan,
    claims,
    claimVersions,
    edges,
    moves: persistedMoves,
    brainRun: {
      ...prelude.brainRun,
      status: "succeeded",
      output: seed,
      completedAt: now,
    },
    idMaps: {
      claimIds,
      claimVersionIds,
      edgeIds,
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
