import assert from "node:assert/strict";
import test from "node:test";

import {
  StartChallengeRoundClaimNotFoundError,
  StartChallengeRoundValidationError,
  startChallengeRound,
  type ChallengeRoundRecord,
  type ChallengeRoundStartedEventRecord,
  type StartChallengeRoundRepository,
  type StartChallengeRoundRepositoryTx,
} from "../../server/commands/start-challenge-round";

class FakeStartChallengeRoundRepositoryTx implements StartChallengeRoundRepositoryTx {
  constructor(
    private readonly claims: Array<{ id: string; mapId: string; userId: string }>,
    private readonly rounds: ChallengeRoundRecord[],
    private readonly events: ChallengeRoundStartedEventRecord[],
  ) {}

  async findOwnedClaim(input: { claimId: string; userId: string }) {
    return this.claims.find((claim) => claim.id === input.claimId && claim.userId === input.userId) ?? null;
  }

  async insertChallengeRound(record: ChallengeRoundRecord) {
    this.rounds.push(record);
  }

  async insertMoveEvent(event: ChallengeRoundStartedEventRecord) {
    this.events.push(event);
  }
}

class FakeStartChallengeRoundRepository implements StartChallengeRoundRepository {
  readonly rounds: ChallengeRoundRecord[] = [];
  readonly events: ChallengeRoundStartedEventRecord[] = [];

  constructor(private readonly claims: Array<{ id: string; mapId: string; userId: string }>) {}

  async transaction<T>(callback: (tx: StartChallengeRoundRepositoryTx) => Promise<T>) {
    const tx = new FakeStartChallengeRoundRepositoryTx(this.claims, this.rounds, this.events);
    return callback(tx);
  }
}

test("startChallengeRound creates a challenge round and returns its roundId", async () => {
  const repository = new FakeStartChallengeRoundRepository([{ id: "claim-1", mapId: "map-1", userId: "user-1" }]);
  const timestamp = new Date("2026-04-24T00:30:00.000Z");

  const result = await startChallengeRound(
    {
      userId: "user-1",
      claimId: "claim-1",
    },
    repository,
    {
      createId: () => "round-1",
      now: () => timestamp,
    },
  );

  assert.equal(result.roundId, "round-1");
  assert.equal(repository.rounds.length, 1);
  assert.deepEqual(repository.rounds[0], {
    id: "round-1",
    mapId: "map-1",
    claimId: "claim-1",
    userId: "user-1",
    status: "started",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
});

test("startChallengeRound emits challenge.round.started", async () => {
  const repository = new FakeStartChallengeRoundRepository([{ id: "claim-1", mapId: "map-1", userId: "user-1" }]);
  const timestamp = new Date("2026-04-24T00:31:00.000Z");

  const result = await startChallengeRound(
    {
      userId: "user-1",
      claimId: "claim-1",
      requestId: "request-1",
    },
    repository,
    {
      createId: () => "round-2",
      now: () => timestamp,
    },
  );

  assert.equal(repository.events.length, 1);
  assert.deepEqual(repository.events[0], {
    userId: "user-1",
    aggregateType: "challenge_round",
    aggregateId: result.roundId,
    requestId: "request-1",
    type: "challenge.round.started",
    payload: {
      mapId: "map-1",
      claimId: "claim-1",
      status: "started",
    },
    createdAt: timestamp,
  });
});

test("startChallengeRound rejects an unowned claim", async () => {
  const repository = new FakeStartChallengeRoundRepository([{ id: "claim-1", mapId: "map-1", userId: "other-user" }]);

  await assert.rejects(
    () =>
      startChallengeRound(
        {
          userId: "user-1",
          claimId: "claim-1",
        },
        repository,
      ),
    StartChallengeRoundClaimNotFoundError,
  );

  assert.equal(repository.rounds.length, 0);
  assert.equal(repository.events.length, 0);
});

test("startChallengeRound validates claimId", async () => {
  const repository = new FakeStartChallengeRoundRepository([{ id: "claim-1", mapId: "map-1", userId: "user-1" }]);

  await assert.rejects(
    () =>
      startChallengeRound(
        {
          userId: "user-1",
          claimId: "   ",
        },
        repository,
      ),
    StartChallengeRoundValidationError,
  );
});
