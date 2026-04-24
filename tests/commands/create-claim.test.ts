import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateClaimMapNotFoundError,
  CreateClaimValidationError,
  createClaim,
  type CreateClaimEventRecord,
  type CreateClaimRecord,
  type CreateClaimRepository,
  type CreateClaimRepositoryTx,
} from "../../server/commands/create-claim";

class FakeCreateClaimRepositoryTx implements CreateClaimRepositoryTx {
  constructor(
    private readonly maps: Array<{ id: string; userId: string }>,
    private readonly claims: CreateClaimRecord[],
    private readonly events: CreateClaimEventRecord[],
  ) {}

  async findOwnedMap(input: { mapId: string; userId: string }) {
    return this.maps.find((map) => map.id === input.mapId && map.userId === input.userId) ?? null;
  }

  async findMoveEventByRequestId() {
    return null;
  }

  async insertClaim(record: CreateClaimRecord) {
    this.claims.push(record);
  }

  async insertMoveEvent(event: CreateClaimEventRecord) {
    this.events.push(event);
  }
}

class FakeCreateClaimRepository implements CreateClaimRepository {
  readonly claims: CreateClaimRecord[] = [];
  readonly events: CreateClaimEventRecord[] = [];

  constructor(private readonly maps: Array<{ id: string; userId: string }>) {}

  async transaction<T>(callback: (tx: CreateClaimRepositoryTx) => Promise<T>) {
    const tx = new FakeCreateClaimRepositoryTx(this.maps, this.claims, this.events);
    return callback(tx);
  }
}

test("createClaim creates a claim and returns its claimId", async () => {
  const repository = new FakeCreateClaimRepository([{ id: "map-1", userId: "user-1" }]);
  const timestamp = new Date("2026-04-23T21:45:00.000Z");

  const result = await createClaim(
    {
      userId: "user-1",
      mapId: "map-1",
      text: "  Claims should be trimmed before insert.  ",
      note: "  Optional note.  ",
    },
    repository,
    {
      createId: () => "claim-1",
      now: () => timestamp,
    },
  );

  assert.equal(result.claimId, "claim-1");
  assert.equal(repository.claims.length, 1);
  assert.deepEqual(repository.claims[0], {
    id: "claim-1",
    userId: "user-1",
    mapId: "map-1",
    text: "Claims should be trimmed before insert.",
    note: "Optional note.",
    parentClaimId: null,
    kind: "claim",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
});

test("createClaim rejects a map the user does not own", async () => {
  const repository = new FakeCreateClaimRepository([{ id: "map-1", userId: "other-user" }]);

  await assert.rejects(
    () =>
      createClaim(
        {
          userId: "user-1",
          mapId: "map-1",
          text: "This insert should fail because the map is not owned by the user.",
        },
        repository,
      ),
    CreateClaimMapNotFoundError,
  );

  assert.equal(repository.claims.length, 0);
  assert.equal(repository.events.length, 0);
});

test("createClaim emits a claim.created event for the inserted claim", async () => {
  const repository = new FakeCreateClaimRepository([{ id: "map-1", userId: "user-1" }]);
  const timestamp = new Date("2026-04-23T21:46:00.000Z");

  const result = await createClaim(
    {
      userId: "user-1",
      mapId: "map-1",
      text: "Persist and emit the matching event.",
      parentClaimId: "parent-1",
      kind: "counterclaim",
      requestId: "request-1",
    },
    repository,
    {
      createId: () => "claim-2",
      now: () => timestamp,
    },
  );

  assert.equal(repository.events.length, 1);
  assert.deepEqual(repository.events[0], {
    userId: "user-1",
    aggregateType: "claim",
    aggregateId: result.claimId,
    requestId: "request-1",
    type: "claim.created",
    payload: {
      mapId: "map-1",
      parentClaimId: "parent-1",
      kind: "counterclaim",
    },
    createdAt: timestamp,
  });
});

test("createClaim validates required text input", async () => {
  const repository = new FakeCreateClaimRepository([{ id: "map-1", userId: "user-1" }]);

  await assert.rejects(
    () =>
      createClaim(
        {
          userId: "user-1",
          mapId: "map-1",
          text: "   ",
        },
        repository,
      ),
    CreateClaimValidationError,
  );
});
