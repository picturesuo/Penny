import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateMapValidationError,
  createMap,
  type CreateMapEventRecord,
  type CreateMapRecord,
  type CreateMapRepository,
  type CreateMapRepositoryTx,
} from "../../server/commands/create-map";

class FakeCreateMapRepositoryTx implements CreateMapRepositoryTx {
  constructor(
    private readonly maps: CreateMapRecord[],
    private readonly events: CreateMapEventRecord[],
  ) {}

  async findMoveEventByRequestId(input: { userId: string; requestId: string; type: string }) {
    const event = this.events.find(
      (candidate) =>
        candidate.userId === input.userId &&
        candidate.requestId === input.requestId &&
        candidate.type === input.type,
    );

    return event
      ? {
          aggregateId: event.aggregateId,
        }
      : null;
  }

  async insertMap(record: CreateMapRecord) {
    this.maps.push(record);
  }

  async insertMoveEvent(event: CreateMapEventRecord) {
    this.events.push(event);
  }
}

class FakeCreateMapRepository implements CreateMapRepository {
  readonly maps: CreateMapRecord[] = [];
  readonly events: CreateMapEventRecord[] = [];

  async transaction<T>(callback: (tx: CreateMapRepositoryTx) => Promise<T>) {
    const tx = new FakeCreateMapRepositoryTx(this.maps, this.events);
    return callback(tx);
  }
}

test("createMap creates a map and returns its mapId", async () => {
  const repository = new FakeCreateMapRepository();
  const timestamp = new Date("2026-04-23T22:10:00.000Z");

  const result = await createMap(
    {
      userId: "user-1",
      title: "  First map  ",
    },
    repository,
    {
      createId: () => "map-1",
      now: () => timestamp,
    },
  );

  assert.equal(result.mapId, "map-1");
  assert.equal(repository.maps.length, 1);
  assert.deepEqual(repository.maps[0], {
    id: "map-1",
    userId: "user-1",
    title: "First map",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
});

test("createMap emits a map.created event for the inserted map", async () => {
  const repository = new FakeCreateMapRepository();
  const timestamp = new Date("2026-04-23T22:11:00.000Z");

  const result = await createMap(
    {
      userId: "user-1",
      title: "Working title",
      requestId: "request-1",
    },
    repository,
    {
      createId: () => "map-2",
      now: () => timestamp,
    },
  );

  assert.equal(repository.events.length, 1);
  assert.deepEqual(repository.events[0], {
    userId: "user-1",
    aggregateType: "map",
    aggregateId: result.mapId,
    requestId: "request-1",
    type: "map.created",
    payload: {
      title: "Working title",
    },
    createdAt: timestamp,
  });
});

test("createMap replays the original result for the same requestId", async () => {
  const repository = new FakeCreateMapRepository();
  const timestamp = new Date("2026-04-24T14:00:00.000Z");
  const ids = ["map-3", "map-4"];

  const firstResult = await createMap(
    {
      userId: "user-1",
      title: "Stable map",
      requestId: "request-duplicate",
    },
    repository,
    {
      createId: () => ids.shift() ?? "unexpected-map-id",
      now: () => timestamp,
    },
  );

  const secondResult = await createMap(
    {
      userId: "user-1",
      title: "Stable map",
      requestId: "request-duplicate",
    },
    repository,
    {
      createId: () => ids.shift() ?? "unexpected-map-id",
      now: () => new Date("2026-04-24T14:01:00.000Z"),
    },
  );

  assert.deepEqual(firstResult, { mapId: "map-3" });
  assert.deepEqual(secondResult, firstResult);
  assert.equal(repository.maps.length, 1);
  assert.equal(repository.events.length, 1);
});

test("createMap validates required title input", async () => {
  const repository = new FakeCreateMapRepository();

  await assert.rejects(
    () =>
      createMap(
        {
          userId: "user-1",
          title: "   ",
        },
        repository,
      ),
    CreateMapValidationError,
  );
});
