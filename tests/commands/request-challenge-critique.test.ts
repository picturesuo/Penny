import assert from "node:assert/strict";
import test from "node:test";

import {
  RequestChallengeCritiqueRoundForbiddenError,
  RequestChallengeCritiqueRoundNotFoundError,
  RequestChallengeCritiqueValidationError,
  requestChallengeCritique,
  type ChallengeCritiqueRecord,
  type ChallengeCritiqueRequestedEventRecord,
  type RequestChallengeCritiqueRepository,
  type RequestChallengeCritiqueRepositoryTx,
} from "../../server/commands/request-challenge-critique.ts";

class FakeRequestChallengeCritiqueRepositoryTx implements RequestChallengeCritiqueRepositoryTx {
  constructor(
    private readonly rounds: Array<{ id: string; mapId: string; claimId: string; userId: string }>,
    private readonly maps: Array<{ id: string; userId: string }>,
    private readonly claims: Array<{ id: string; mapId: string; userId: string }>,
    private readonly critiques: ChallengeCritiqueRecord[],
    private readonly events: ChallengeCritiqueRequestedEventRecord[],
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
          payload: event.payload,
        }
      : null;
  }

  async findOwnedCritique(input: { critiqueId: string; userId: string }) {
    return this.critiques.find((critique) => critique.id === input.critiqueId && critique.userId === input.userId) ?? null;
  }

  async findOwnedCritiqueByRound(input: { roundId: string; userId: string }) {
    return this.critiques.find((critique) => critique.roundId === input.roundId && critique.userId === input.userId) ?? null;
  }

  async findMapById(input: { mapId: string }) {
    return this.maps.find((map) => map.id === input.mapId) ?? null;
  }

  async findClaimById(input: { claimId: string }) {
    return this.claims.find((claim) => claim.id === input.claimId) ?? null;
  }

  async findRoundById(input: { roundId: string }) {
    return this.rounds.find((round) => round.id === input.roundId) ?? null;
  }

  async findOwnedRound(input: { roundId: string; userId: string }) {
    return this.rounds.find((round) => round.id === input.roundId && round.userId === input.userId) ?? null;
  }

  async insertChallengeCritique(record: ChallengeCritiqueRecord) {
    this.critiques.push(record);
  }

  async updateChallengeCritiquePlaceholder(record: {
    id: string;
    userId: string;
    status: "pending" | "ready" | "failed";
    body: string | null;
    updatedAt: Date;
  }) {
    const critique = this.critiques.find((candidate) => candidate.id === record.id && candidate.userId === record.userId);

    if (critique) {
      critique.status = record.status;
      critique.body = record.body;
      critique.updatedAt = record.updatedAt;
    }
  }

  async insertMoveEvent(event: ChallengeCritiqueRequestedEventRecord) {
    this.events.push(event);
  }
}

class FakeRequestChallengeCritiqueRepository implements RequestChallengeCritiqueRepository {
  readonly critiques: ChallengeCritiqueRecord[] = [];
  readonly events: ChallengeCritiqueRequestedEventRecord[] = [];

  constructor(
    private readonly rounds: Array<{ id: string; mapId: string; claimId: string; userId: string }>,
    private readonly maps = rounds.map((round) => ({ id: round.mapId, userId: round.userId })),
    private readonly claims = rounds.map((round) => ({ id: round.claimId, mapId: round.mapId, userId: round.userId })),
  ) {}

  async transaction<T>(callback: (tx: RequestChallengeCritiqueRepositoryTx) => Promise<T>) {
    const tx = new FakeRequestChallengeCritiqueRepositoryTx(this.rounds, this.maps, this.claims, this.critiques, this.events);
    return callback(tx);
  }
}

test("requestChallengeCritique inserts a pending placeholder critique", async () => {
  const repository = new FakeRequestChallengeCritiqueRepository([
    { id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "user-1" },
  ]);
  const timestamp = new Date("2026-04-24T02:10:00.000Z");

  const result = await requestChallengeCritique(
    {
      userId: "user-1",
      roundId: "round-1",
    },
    repository,
    {
      createId: () => "critique-1",
      now: () => timestamp,
    },
  );

  assert.deepEqual(result, {
    critiqueId: "critique-1",
    roundId: "round-1",
    critiqueStatus: "pending",
  });
  assert.deepEqual(repository.critiques[0], {
    id: "critique-1",
    roundId: "round-1",
    mapId: "map-1",
    claimId: "claim-1",
    userId: "user-1",
    status: "pending",
    body: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
});

test("requestChallengeCritique emits challenge.critique.requested", async () => {
  const repository = new FakeRequestChallengeCritiqueRepository([
    { id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "user-1" },
  ]);
  const timestamp = new Date("2026-04-24T02:11:00.000Z");

  const result = await requestChallengeCritique(
    {
      userId: "user-1",
      roundId: "round-1",
      requestId: "request-1",
    },
    repository,
    {
      createId: () => "critique-2",
      now: () => timestamp,
    },
  );

  assert.equal(repository.events.length, 1);
  assert.deepEqual(repository.events[0], {
    userId: "user-1",
    aggregateType: "challenge_critique",
    aggregateId: "critique-2",
    requestId: "request-1",
    type: "challenge.critique.requested",
    payload: {
      roundId: "round-1",
      mapId: "map-1",
      claimId: "claim-1",
      status: "pending",
    },
    createdAt: timestamp,
  });
});

test("requestChallengeCritique replays the original result for the same requestId", async () => {
  const repository = new FakeRequestChallengeCritiqueRepository([
    { id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "user-1" },
  ]);
  const timestamp = new Date("2026-04-24T14:10:00.000Z");
  const ids = ["critique-3", "critique-4"];

  const firstResult = await requestChallengeCritique(
    {
      userId: "user-1",
      roundId: "round-1",
      requestId: "request-duplicate",
    },
    repository,
    {
      createId: () => ids.shift() ?? "unexpected-critique-id",
      now: () => timestamp,
    },
  );

  const secondResult = await requestChallengeCritique(
    {
      userId: "user-1",
      roundId: "round-1",
      requestId: "request-duplicate",
    },
    repository,
    {
      createId: () => ids.shift() ?? "unexpected-critique-id",
      now: () => new Date("2026-04-24T14:11:00.000Z"),
    },
  );

  assert.deepEqual(firstResult, {
    critiqueId: "critique-3",
    roundId: "round-1",
    critiqueStatus: "pending",
  });
  assert.deepEqual(secondResult, firstResult);
  assert.equal(repository.critiques.length, 1);
  assert.equal(repository.events.length, 1);
});

test("requestChallengeCritique updates an existing critique placeholder for the round", async () => {
  const repository = new FakeRequestChallengeCritiqueRepository([
    { id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "user-1" },
  ]);
  const createdAt = new Date("2026-04-24T14:30:00.000Z");
  const updatedAt = new Date("2026-04-24T14:31:00.000Z");
  repository.critiques.push({
    id: "critique-existing",
    roundId: "round-1",
    mapId: "map-1",
    claimId: "claim-1",
    userId: "user-1",
    status: "ready",
    body: "Previous critique body",
    createdAt,
    updatedAt: createdAt,
  });

  const result = await requestChallengeCritique(
    {
      userId: "user-1",
      roundId: "round-1",
      requestId: "request-existing-placeholder",
    },
    repository,
    {
      createId: () => "unexpected-new-critique",
      now: () => updatedAt,
    },
  );

  assert.deepEqual(result, {
    critiqueId: "critique-existing",
    roundId: "round-1",
    critiqueStatus: "pending",
  });
  assert.equal(repository.critiques.length, 1);
  assert.deepEqual(repository.critiques[0], {
    id: "critique-existing",
    roundId: "round-1",
    mapId: "map-1",
    claimId: "claim-1",
    userId: "user-1",
    status: "pending",
    body: null,
    createdAt,
    updatedAt,
  });
  assert.equal(repository.events[0].aggregateId, "critique-existing");
});

test("requestChallengeCritique rejects an unowned round", async () => {
  const repository = new FakeRequestChallengeCritiqueRepository([
    { id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "other-user" },
  ]);

  await assert.rejects(
    () =>
      requestChallengeCritique(
        {
          userId: "user-1",
          roundId: "round-1",
        },
        repository,
      ),
    RequestChallengeCritiqueRoundForbiddenError,
  );
});

test("requestChallengeCritique rejects a round whose map is not owned by the user", async () => {
  const repository = new FakeRequestChallengeCritiqueRepository(
    [{ id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "user-1" }],
    [{ id: "map-1", userId: "other-user" }],
    [{ id: "claim-1", mapId: "map-1", userId: "user-1" }],
  );

  await assert.rejects(
    () =>
      requestChallengeCritique(
        {
          userId: "user-1",
          roundId: "round-1",
        },
        repository,
      ),
    RequestChallengeCritiqueRoundForbiddenError,
  );
});

test("requestChallengeCritique rejects a round whose claim is not owned by the user", async () => {
  const repository = new FakeRequestChallengeCritiqueRepository(
    [{ id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "user-1" }],
    [{ id: "map-1", userId: "user-1" }],
    [{ id: "claim-1", mapId: "map-1", userId: "other-user" }],
  );

  await assert.rejects(
    () =>
      requestChallengeCritique(
        {
          userId: "user-1",
          roundId: "round-1",
        },
        repository,
      ),
    RequestChallengeCritiqueRoundForbiddenError,
  );
});

test("requestChallengeCritique rejects a missing round", async () => {
  const repository = new FakeRequestChallengeCritiqueRepository([]);

  await assert.rejects(
    () =>
      requestChallengeCritique(
        {
          userId: "user-1",
          roundId: "round-1",
        },
        repository,
      ),
    RequestChallengeCritiqueRoundNotFoundError,
  );
});

test("requestChallengeCritique validates roundId", async () => {
  const repository = new FakeRequestChallengeCritiqueRepository([
    { id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "user-1" },
  ]);

  await assert.rejects(
    () =>
      requestChallengeCritique(
        {
          userId: "user-1",
          roundId: "   ",
        },
        repository,
      ),
    RequestChallengeCritiqueValidationError,
  );
});
