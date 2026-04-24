import assert from "node:assert/strict";
import test from "node:test";

import {
  setWorkspaceSelection,
  type SetWorkspaceSelectionRepository,
  type SetWorkspaceSelectionRepositoryTx,
  type WorkspaceContextRecord,
  type WorkspaceSelectionChangedEventRecord,
} from "../../server/commands/set-workspace-selection.ts";
import {
  buildShellView,
  type BuildShellViewRepository,
  type ShellBreadcrumbItem,
} from "../../server/projections/build-shell-view.ts";

type MapRecord = {
  id: string;
  userId: string;
  title: string;
};

type ClaimRecord = {
  id: string;
  mapId: string;
  userId: string;
  body: string;
};

class SharedWorkspaceRepositoryTx implements SetWorkspaceSelectionRepositoryTx {
  constructor(
    private readonly maps: MapRecord[],
    private readonly claims: ClaimRecord[],
    private readonly contexts: WorkspaceContextRecord[],
    private readonly events: WorkspaceSelectionChangedEventRecord[],
  ) {}

  async findOwnedMap(input: { mapId: string; userId: string }) {
    const map = this.maps.find((candidate) => candidate.id === input.mapId && candidate.userId === input.userId);
    return map ? { id: map.id, userId: map.userId } : null;
  }

  async findOwnedClaim(input: { claimId: string; mapId: string; userId: string }) {
    const claim = this.claims.find(
      (candidate) =>
        candidate.id === input.claimId && candidate.mapId === input.mapId && candidate.userId === input.userId,
    );

    return claim ? { id: claim.id } : null;
  }

  async getWorkspaceContext(input: { userId: string }) {
    return this.contexts.find((context) => context.userId === input.userId) ?? null;
  }

  async upsertWorkspaceContext(record: WorkspaceContextRecord) {
    const nextRecord: WorkspaceContextRecord = {
      ...record,
      mode: record.mode,
    };
    const index = this.contexts.findIndex((context) => context.userId === record.userId);

    if (index >= 0) {
      this.contexts[index] = nextRecord;
      return;
    }

    this.contexts.push(nextRecord);
  }

  async insertMoveEvent(event: WorkspaceSelectionChangedEventRecord) {
    this.events.push(event);
  }
}

class SharedWorkspaceRepository implements SetWorkspaceSelectionRepository, BuildShellViewRepository {
  readonly contexts: WorkspaceContextRecord[] = [];
  readonly events: WorkspaceSelectionChangedEventRecord[] = [];

  constructor(
    private readonly maps: MapRecord[],
    private readonly claims: ClaimRecord[],
  ) {}

  async transaction<T>(callback: (tx: SetWorkspaceSelectionRepositoryTx) => Promise<T>) {
    const tx = new SharedWorkspaceRepositoryTx(this.maps, this.claims, this.contexts, this.events);
    return callback(tx);
  }

  async getWorkspaceContext(input: { userId: string }) {
    const context = this.contexts.find((candidate) => candidate.userId === input.userId) ?? null;

    if (!context) {
      return null;
    }

    return {
      mode: context.mode,
      mapId: context.mapId,
      claimId: context.claimId,
    };
  }

  async findOwnedMap(input: { mapId: string; userId: string }) {
    const map = this.maps.find((candidate) => candidate.id === input.mapId && candidate.userId === input.userId);

    if (!map) {
      return null;
    }

    return {
      id: map.id,
      title: map.title,
    };
  }

  async findOwnedClaim(input: { claimId: string; mapId: string; userId: string }) {
    const claim = this.claims.find(
      (candidate) =>
        candidate.id === input.claimId && candidate.mapId === input.mapId && candidate.userId === input.userId,
    );

    if (!claim) {
      return null;
    }

    return {
      id: claim.id,
      body: claim.body,
    };
  }
}

test("buildShellView returns the same map and claim context after a mode switch", async () => {
  const repository = new SharedWorkspaceRepository(
    [{ id: "map-1", userId: "user-1", title: "Fundraising map" }],
    [{ id: "claim-1", mapId: "map-1", userId: "user-1", body: "Enterprise buyers need proof before committing." }],
  );

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
      now: () => new Date("2026-04-24T00:01:00.000Z"),
    },
  );

  await setWorkspaceSelection(
    {
      userId: "user-1",
      mode: "Challenge",
      mapId: "map-1",
      requestId: "request-2",
    },
    repository,
    {
      createId: () => "event-2",
      now: () => new Date("2026-04-24T00:02:00.000Z"),
    },
  );

  const shellView = await buildShellView(
    {
      userId: "user-1",
    },
    repository,
  );

  assert.deepEqual(shellView, {
    mode: "challenge",
    mapId: "map-1",
    claimId: "claim-1",
    breadcrumbItems: [
      {
        kind: "map",
        id: "map-1",
        label: "Fundraising map",
      },
      {
        kind: "claim",
        id: "claim-1",
        label: "Enterprise buyers need proof before committing.",
      },
    ] satisfies ShellBreadcrumbItem[],
  });
});
