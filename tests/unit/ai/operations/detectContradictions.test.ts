import assert from "node:assert/strict";
import test from "node:test";

import {
  DetectContradictionsRepository,
  DetectContradictionsValidationError,
  type CreatedContradictionEdge,
  type DetectContradictionsEntity,
  detectContradictions,
} from "../../../../server/ai/operations/detectContradictions.ts";

const userId = "11111111-1111-4111-8111-111111111111";

class FakeDetectContradictionsRepository implements DetectContradictionsRepository {
  public readonly insertedNodes: Array<{
    id: string;
    userId: string;
    entity: DetectContradictionsEntity;
    createdAt: Date;
  }> = [];

  public readonly insertedEdges: Array<{
    id: string;
    userId: string;
    mapId: string;
    sourceNodeId: string;
    targetNodeId: string;
    confidenceBps: number;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }> = [];

  public readonly insertedJobs: Array<{
    userId: string;
    inputJson: Record<string, unknown>;
    createdAt: Date;
  }> = [];

  public readonly completedJobs: Array<{
    id: string;
    outputJson: Record<string, unknown>;
    completedAt: Date;
  }> = [];

  public readonly failedJobs: Array<{
    id: string;
    errorMessage: string;
    completedAt: Date;
  }> = [];

  public readonly insertedActivityEvents: Array<{
    id: string;
    userId: string;
    aiJobId: string;
    target: DetectContradictionsEntity;
    graphEdgeId: string | null;
    outputJson: Record<string, unknown>;
    createdAt: Date;
  }> = [];

  private readonly graphNodes = new Map<string, { id: string }>();
  private readonly graphEdges = new Map<string, { id: string }>();

  constructor(
    private readonly targets: DetectContradictionsEntity[],
    private readonly claimCandidates: Array<{ id: string; mapId: string; text: string }>,
  ) {}

  async findTarget(input: { targetType: DetectContradictionsEntity["type"]; targetId: string }) {
    return this.targets.find((entity) => entity.type === input.targetType && entity.id === input.targetId) ?? null;
  }

  async findClaimCandidates() {
    return this.claimCandidates;
  }

  async findGraphNode(input: { userId: string; entity: DetectContradictionsEntity }) {
    return this.graphNodes.get(this.nodeKey(input.userId, input.entity)) ?? null;
  }

  async insertGraphNode(record: {
    id: string;
    userId: string;
    entity: DetectContradictionsEntity;
    createdAt: Date;
  }) {
    this.insertedNodes.push(record);
    this.graphNodes.set(this.nodeKey(record.userId, record.entity), { id: record.id });
  }

  async findGraphEdge(input: { userId: string; sourceNodeId: string; targetNodeId: string }) {
    return this.graphEdges.get(this.edgeKey(input)) ?? null;
  }

  async insertGraphEdge(record: {
    id: string;
    userId: string;
    mapId: string;
    sourceNodeId: string;
    targetNodeId: string;
    confidenceBps: number;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }) {
    this.insertedEdges.push(record);
    this.graphEdges.set(this.edgeKey(record), { id: record.id });
  }

  async insertAIJob(record: {
    userId: string;
    inputJson: Record<string, unknown>;
    createdAt: Date;
  }) {
    this.insertedJobs.push(record);

    return { id: `job-${this.insertedJobs.length}` };
  }

  async completeAIJob(record: {
    id: string;
    outputJson: Record<string, unknown>;
    completedAt: Date;
  }) {
    this.completedJobs.push(record);
  }

  async failAIJob(record: {
    id: string;
    errorMessage: string;
    completedAt: Date;
  }) {
    this.failedJobs.push(record);
  }

  async insertActivityEvent(record: {
    id: string;
    userId: string;
    aiJobId: string;
    target: DetectContradictionsEntity;
    graphEdgeId: string | null;
    outputJson: Record<string, unknown>;
    createdAt: Date;
  }) {
    this.insertedActivityEvents.push(record);
  }

  private nodeKey(user: string, entity: DetectContradictionsEntity) {
    return `${user}:${entity.type}:${entity.id}`;
  }

  private edgeKey(input: { userId: string; sourceNodeId: string; targetNodeId: string }) {
    return `${input.userId}:${input.sourceNodeId}:${input.targetNodeId}:contradicts`;
  }
}

test("detectContradictions returns deterministic contradiction candidates from existing claims", async () => {
  const repository = new FakeDetectContradictionsRepository(
    [
      {
        type: "thought",
        id: "thought-target",
        mapId: "map-1",
        text: "Users need proof before they buy the product.",
      },
    ],
    [
      {
        id: "claim-contradiction",
        mapId: "map-1",
        text: "Users do not need proof before they buy the product.",
      },
      {
        id: "claim-unrelated",
        mapId: "map-1",
        text: "Pricing pages should include annual discounts.",
      },
    ],
  );

  const result = await detectContradictions(
    {
      userId,
      targetType: "thought",
      targetId: "thought-target",
    },
    repository,
  );

  assert.equal(result.aiJobId, "job-1");
  assert.equal(result.target.id, "thought-target");
  assert.deepEqual(result.contradictions.map((candidate) => candidate.claimId), ["claim-contradiction"]);
  assert.ok(result.contradictions[0]?.confidenceBps && result.contradictions[0].confidenceBps > 6000);
  assert.deepEqual(result.contradictions[0]?.sharedTerms, ["users", "need", "proof", "before", "they", "buy", "product"]);
  assert.equal(repository.completedJobs.length, 1);
  assert.deepEqual(repository.insertedActivityEvents[0]?.outputJson, repository.completedJobs[0]?.outputJson);
});

test("detectContradictions can auto-create contradicts graph edges", async () => {
  const repository = new FakeDetectContradictionsRepository(
    [
      {
        type: "claim",
        id: "claim-target",
        mapId: "map-1",
        text: "Remote work increases focus for senior engineers.",
      },
    ],
    [
      {
        id: "claim-contradiction",
        mapId: "map-1",
        text: "Remote work does not increase focus for senior engineers.",
      },
    ],
  );
  let nextId = 0;

  const result = await detectContradictions(
    {
      userId,
      targetType: "claim",
      targetId: "claim-target",
      autoCreate: true,
    },
    repository,
    {
      createId: () => `generated-${++nextId}`,
      now: () => new Date("2026-04-24T12:00:00.000Z"),
    },
  );

  assert.equal(repository.insertedNodes.length, 2);
  assert.equal(repository.insertedEdges.length, 1);
  assert.deepEqual(result.createdEdges satisfies CreatedContradictionEdge[], [
    {
      id: "generated-3",
      relation: "contradicts",
      sourceNodeId: "generated-1",
      targetNodeId: "generated-2",
      claimId: "claim-contradiction",
    },
  ]);
  assert.equal(result.contradictions[0]?.autoCreated, true);
  assert.equal(repository.insertedActivityEvents[0]?.id, "generated-4");
  assert.equal(repository.insertedActivityEvents[0]?.graphEdgeId, "generated-3");
  assert.equal(repository.insertedEdges[0]?.metadata.operation, "detectContradictions");
});

test("detectContradictions rejects invalid input before repository access", async () => {
  const repository = new FakeDetectContradictionsRepository([], []);

  await assert.rejects(
    () =>
      detectContradictions(
        {
          userId,
          targetType: "note",
          targetId: "claim-target",
        },
        repository,
      ),
    (error) => {
      assert.ok(error instanceof DetectContradictionsValidationError);
      assert.equal(error.message, "targetType must be either thought or claim.");
      return true;
    },
  );
  assert.equal(repository.insertedJobs.length, 0);
});

test("detectContradictions marks the AI job failed when the target cannot be loaded", async () => {
  const repository = new FakeDetectContradictionsRepository([], []);
  const now = new Date("2026-04-24T12:00:00.000Z");

  await assert.rejects(() =>
    detectContradictions(
      {
        userId,
        targetType: "claim",
        targetId: "missing-claim",
      },
      repository,
      {
        now: () => now,
      },
    ),
  );

  assert.equal(repository.insertedJobs.length, 1);
  assert.deepEqual(repository.failedJobs, [
    {
      id: "job-1",
      errorMessage: "Target claim not found for detectContradictions: missing-claim",
      completedAt: now,
    },
  ]);
});
