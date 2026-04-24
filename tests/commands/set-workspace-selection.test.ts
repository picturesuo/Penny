import assert from "node:assert/strict";
import test from "node:test";

import {
  SetWorkspaceSelectionClaimNotFoundError,
  SetWorkspaceSelectionMapNotFoundError,
  SetWorkspaceSelectionValidationError,
  setWorkspaceSelection,
  type SetWorkspaceSelectionRepository,
  type SetWorkspaceSelectionRepositoryTx,
  type WorkspaceContextRecord,
  type WorkspaceSelectionChangedEventRecord,
} from "../../server/commands/set-workspace-selection";

class FakeSetWorkspaceSelectionRepositoryTx implements SetWorkspaceSelectionRepositoryTx {
  constructor(
    private readonly maps: Array<{ id: string; userId: string }>,
    private readonly claims: Array<{ id: string; mapId: string; userId: string }>,
    private readonly contexts: WorkspaceContextRecord[],
    private readonly events: WorkspaceSelectionChangedEventRecord[],
  ) {}

  async findOwnedMap(input: { mapId: string; userId: string }) {
    return this.maps.find((map) => map.id === input.mapId && map.userId === input.userId) ?? null;
  }

  async findOwnedClaim(input: { claimId: string; mapId: string; userId: string }) {
    return this.claims.find(
      (claim) => claim.id === input.claimId && claim.mapId === input.mapId && claim.userId === input.userId,
    )
      ? { id: input.claimId }
      : null;
  }

  async getWorkspaceContext(input: { userId: string }) {
    return this.contexts.find((context) => context.userId === input.userId) ?? null;
  }

  async upsertWorkspaceContext(record: WorkspaceContextRecord) {
    const index = this.contexts.findIndex((context) => context.userId === record.userId);

    if (index >= 0) {
      this.contexts[index] = record;
      return;
    }

    this.contexts.push(record);
  }

  async insertMoveEvent(event: WorkspaceSelectionChangedEventRecord) {
    this.events.push(event);
  }
}

class FakeSetWorkspaceSelectionRepository implements SetWorkspaceSelectionRepository {
  readonly contexts: WorkspaceContextRecord[] = [];
  readonly events: WorkspaceSelectionChangedEventRecord[] = [];

  constructor(
    private readonly maps: Array<{ id: string; userId: string }>,
    private readonly claims: Array<{ id: string; mapId: string; userId: string }> = [],
  ) {}

  async transaction<T>(callback: (tx: SetWorkspaceSelectionRepositoryTx) => Promise<T>) {
    const tx = new FakeSetWorkspaceSelectionRepositoryTx(this.maps, this.claims, this.contexts, this.events);
    return callback(tx);
  }
}

test("setWorkspaceSelection sets Brain selection", async () => {
  const repository = new FakeSetWorkspaceSelectionRepository([{ id: "map-1", userId: "user-1" }]);
  const timestamp = new Date("2026-04-23T22:30:00.000Z");

  const result = await setWorkspaceSelection(
    {
      userId: "user-1",
      mode: "Brain",
      mapId: "map-1",
      requestId: "request-1",
    },
    repository,
    {
      createId: () => "event-1",
      now: () => timestamp,
    },
  );

  assert.deepEqual(result, {
    mode: "Brain",
    mapId: "map-1",
    claimId: null,
  });

  assert.deepEqual(repository.contexts[0], {
    userId: "user-1",
    mode: "Brain",
    mapId: "map-1",
    claimId: null,
    updatedAt: timestamp,
  });
});

test("setWorkspaceSelection switches Brain to Challenge without changing claimId", async () => {
  const repository = new FakeSetWorkspaceSelectionRepository(
    [{ id: "map-1", userId: "user-1" }],
    [{ id: "claim-1", mapId: "map-1", userId: "user-1" }],
  );
  const initialTimestamp = new Date("2026-04-23T22:31:00.000Z");
  const nextTimestamp = new Date("2026-04-23T22:32:00.000Z");

  await setWorkspaceSelection(
    {
      userId: "user-1",
      mode: "Brain",
      mapId: "map-1",
      claimId: "claim-1",
      requestId: "request-1",
    },
    repository,
    {
      createId: () => "event-1",
      now: () => initialTimestamp,
    },
  );

  const result = await setWorkspaceSelection(
    {
      userId: "user-1",
      mode: "Challenge",
      mapId: "map-1",
      requestId: "request-2",
    },
    repository,
    {
      createId: () => "event-2",
      now: () => nextTimestamp,
    },
  );

  assert.deepEqual(result, {
    mode: "Challenge",
    mapId: "map-1",
    claimId: "claim-1",
  });

  assert.deepEqual(repository.contexts[0], {
    userId: "user-1",
    mode: "Challenge",
    mapId: "map-1",
    claimId: "claim-1",
    updatedAt: nextTimestamp,
  });
});

test("setWorkspaceSelection emits workspace.selection.changed", async () => {
  const repository = new FakeSetWorkspaceSelectionRepository(
    [{ id: "map-1", userId: "user-1" }],
    [{ id: "claim-1", mapId: "map-1", userId: "user-1" }],
  );
  const timestamp = new Date("2026-04-23T22:33:00.000Z");

  await setWorkspaceSelection(
    {
      userId: "user-1",
      mode: "Brain",
      mapId: "map-1",
      claimId: "claim-1",
      requestId: "request-1",
    },
    repository,
    {
      createId: () => "event-1",
      now: () => timestamp,
    },
  );

  assert.equal(repository.events.length, 1);
  assert.deepEqual(repository.events[0], {
    userId: "user-1",
    aggregateId: "event-1",
    requestId: "request-1",
    type: "workspace.selection.changed",
    payload: {
      mode: "Brain",
      mapId: "map-1",
      claimId: "claim-1",
    },
    createdAt: timestamp,
  });
});

test("setWorkspaceSelection validates mode", async () => {
  const repository = new FakeSetWorkspaceSelectionRepository([{ id: "map-1", userId: "user-1" }]);

  await assert.rejects(
    () =>
      setWorkspaceSelection(
        {
          userId: "user-1",
          mode: "Focus",
          mapId: "map-1",
        },
        repository,
      ),
    SetWorkspaceSelectionValidationError,
  );
});

test("setWorkspaceSelection rejects an unowned map", async () => {
  const repository = new FakeSetWorkspaceSelectionRepository([{ id: "map-1", userId: "other-user" }]);

  await assert.rejects(
    () =>
      setWorkspaceSelection(
        {
          userId: "user-1",
          mode: "Brain",
          mapId: "map-1",
        },
        repository,
      ),
    SetWorkspaceSelectionMapNotFoundError,
  );
});

test("setWorkspaceSelection rejects an unowned claim", async () => {
  const repository = new FakeSetWorkspaceSelectionRepository([{ id: "map-1", userId: "user-1" }], []);

  await assert.rejects(
    () =>
      setWorkspaceSelection(
        {
          userId: "user-1",
          mode: "Challenge",
          mapId: "map-1",
          claimId: "claim-1",
        },
        repository,
      ),
    SetWorkspaceSelectionClaimNotFoundError,
  );
});
