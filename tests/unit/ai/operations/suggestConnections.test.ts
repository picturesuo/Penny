import assert from "node:assert/strict";
import test from "node:test";

import {
  SuggestConnectionsRepository,
  SuggestConnectionsValidationError,
  type CreatedConnectionEdge,
  type SuggestConnectionsEntity,
  suggestConnections,
} from "../../../../server/ai/operations/suggestConnections.ts";

const userId = "11111111-1111-4111-8111-111111111111";

class FakeSuggestConnectionsRepository implements SuggestConnectionsRepository {
  public readonly insertedNodes: Array<{
    id: string;
    userId: string;
    entity: SuggestConnectionsEntity;
    createdAt: Date;
  }> = [];

  public readonly insertedEdges: Array<{
    id: string;
    userId: string;
    mapId: string;
    sourceNodeId: string;
    targetNodeId: string;
    relation: CreatedConnectionEdge["relation"];
    confidenceBps: number;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }> = [];

  private readonly graphNodes = new Map<string, { id: string }>();
  private readonly graphEdges = new Map<string, { id: string }>();

  constructor(private readonly entities: SuggestConnectionsEntity[]) {}

  async findTarget(input: { targetType: SuggestConnectionsEntity["type"]; targetId: string }) {
    return this.entities.find((entity) => entity.type === input.targetType && entity.id === input.targetId) ?? null;
  }

  async findCandidates() {
    return this.entities;
  }

  async findGraphNode(input: { userId: string; entity: SuggestConnectionsEntity }) {
    return this.graphNodes.get(this.nodeKey(input.userId, input.entity)) ?? null;
  }

  async insertGraphNode(record: {
    id: string;
    userId: string;
    entity: SuggestConnectionsEntity;
    createdAt: Date;
  }) {
    this.insertedNodes.push(record);
    this.graphNodes.set(this.nodeKey(record.userId, record.entity), { id: record.id });
  }

  async findGraphEdge(input: {
    userId: string;
    sourceNodeId: string;
    targetNodeId: string;
    relation: CreatedConnectionEdge["relation"];
  }) {
    return this.graphEdges.get(this.edgeKey(input)) ?? null;
  }

  async insertGraphEdge(record: {
    id: string;
    userId: string;
    mapId: string;
    sourceNodeId: string;
    targetNodeId: string;
    relation: CreatedConnectionEdge["relation"];
    confidenceBps: number;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }) {
    this.insertedEdges.push(record);
    this.graphEdges.set(this.edgeKey(record), { id: record.id });
  }

  private nodeKey(user: string, entity: SuggestConnectionsEntity) {
    return `${user}:${entity.type}:${entity.id}`;
  }

  private edgeKey(input: {
    userId: string;
    sourceNodeId: string;
    targetNodeId: string;
    relation: CreatedConnectionEdge["relation"];
  }) {
    return `${input.userId}:${input.sourceNodeId}:${input.targetNodeId}:${input.relation}`;
  }
}

test("suggestConnections ranks likely contradictions first", async () => {
  const repository = new FakeSuggestConnectionsRepository([
    {
      type: "claim",
      id: "claim-target",
      mapId: "map-1",
      text: "Users need proof before they buy the product.",
    },
    {
      type: "claim",
      id: "claim-contradiction",
      mapId: "map-1",
      text: "Users do not need proof before they buy the product.",
    },
    {
      type: "thought",
      id: "thought-related",
      mapId: "map-1",
      text: "Proof can make users trust the product faster.",
    },
  ]);

  const result = await suggestConnections(
    {
      userId,
      targetType: "claim",
      targetId: "claim-target",
    },
    repository,
  );

  assert.equal(result.target.id, "claim-target");
  assert.equal(result.suggestions[0]?.targetId, "claim-contradiction");
  assert.equal(result.suggestions[0]?.relation, "contradicts");
  assert.ok(result.suggestions[0]?.confidenceBps && result.suggestions[0].confidenceBps > 6000);
  assert.deepEqual(result.suggestions[0]?.sharedTerms, ["users", "need", "proof", "before", "they", "buy", "product"]);
  assert.equal(result.suggestions.some((suggestion) => suggestion.targetId === "claim-target"), false);
});

test("suggestConnections can auto-create graph nodes and edges for suggestions in the target map", async () => {
  const repository = new FakeSuggestConnectionsRepository([
    {
      type: "claim",
      id: "claim-target",
      mapId: "map-1",
      text: "Remote work increases focus for senior engineers.",
    },
    {
      type: "thought",
      id: "thought-contradiction",
      mapId: "map-1",
      text: "Remote work does not increase focus for senior engineers.",
    },
  ]);
  let nextId = 0;

  const result = await suggestConnections(
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
  assert.deepEqual(result.createdEdges, [
    {
      id: "generated-3",
      relation: "contradicts",
      sourceNodeId: "generated-1",
      targetNodeId: "generated-2",
      targetType: "thought",
      targetId: "thought-contradiction",
    },
  ]);
  assert.equal(result.suggestions[0]?.autoCreated, true);
  assert.deepEqual(repository.insertedEdges[0]?.metadata.sharedTerms, ["remote", "work", "focus", "senior", "engineers"]);
});

test("suggestConnections rejects invalid input before repository access", async () => {
  const repository = new FakeSuggestConnectionsRepository([]);

  await assert.rejects(
    () =>
      suggestConnections(
        {
          userId,
          targetType: "note",
          targetId: "claim-target",
        },
        repository,
      ),
    (error) => {
      assert.ok(error instanceof SuggestConnectionsValidationError);
      assert.equal(error.message, "targetType must be either thought or claim.");
      return true;
    },
  );
});
