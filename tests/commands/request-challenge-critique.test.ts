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
    private readonly critiques: ChallengeCritiqueRecord[],
    private readonly events: ChallengeCritiqueRequestedEventRecord[],
  ) {}

  async findRoundById(input: { roundId: string }) {
    return this.rounds.find((round) => round.id === input.roundId) ?? null;
  }

  async findOwnedRound(input: { roundId: string; userId: string }) {
    return this.rounds.find((round) => round.id === input.roundId && round.userId === input.userId) ?? null;
  }

  async findMoveEventByRequestId() {
    return null;
  }

  async insertChallengeCritique(record: ChallengeCritiqueRecord) {
    this.critiques.push(record);
  }

  async insertMoveEvent(event: ChallengeCritiqueRequestedEventRecord) {
    this.events.push(event);
  }
}

class FakeRequestChallengeCritiqueRepository implements RequestChallengeCritiqueRepository {
  readonly critiques: ChallengeCritiqueRecord[] = [];
  readonly events: ChallengeCritiqueRequestedEventRecord[] = [];

  constructor(private readonly rounds: Array<{ id: string; mapId: string; claimId: string; userId: string }>) {}

  async transaction<T>(callback: (tx: RequestChallengeCritiqueRepositoryTx) => Promise<T>) {
    const tx = new FakeRequestChallengeCritiqueRepositoryTx(this.rounds, this.critiques, this.events);
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
    status: "pending",
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
    aggregateId: result.critiqueId,
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
