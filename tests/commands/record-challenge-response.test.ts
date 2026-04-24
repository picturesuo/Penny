import assert from "node:assert/strict";
import test from "node:test";

import {
  RecordChallengeResponseRoundForbiddenError,
  RecordChallengeResponseRoundNotFoundError,
  RecordChallengeResponseValidationError,
  recordChallengeResponse,
  type ChallengeResponseRecordedEventRecord,
  type RecordChallengeResponseRepository,
  type RecordChallengeResponseRepositoryTx,
  type RecordChallengeResponseRoundRecord,
} from "../../server/commands/record-challenge-response";

class FakeRecordChallengeResponseRepositoryTx implements RecordChallengeResponseRepositoryTx {
  constructor(
    private readonly rounds: Array<{ id: string; mapId: string; claimId: string; userId: string; status: string }>,
    private readonly updatedRounds: RecordChallengeResponseRoundRecord[],
    private readonly events: ChallengeResponseRecordedEventRecord[],
  ) {}

  async findRoundById(input: { roundId: string }) {
    return this.rounds.find((round) => round.id === input.roundId) ?? null;
  }

  async findOwnedRound(input: { roundId: string; userId: string }) {
    return this.rounds.find((round) => round.id === input.roundId && round.userId === input.userId) ?? null;
  }

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

  async updateChallengeRound(record: RecordChallengeResponseRoundRecord) {
    this.updatedRounds.push(record);
  }

  async insertMoveEvent(event: ChallengeResponseRecordedEventRecord) {
    this.events.push(event);
  }
}

class FakeRecordChallengeResponseRepository implements RecordChallengeResponseRepository {
  readonly updatedRounds: RecordChallengeResponseRoundRecord[] = [];
  readonly events: ChallengeResponseRecordedEventRecord[] = [];

  constructor(private readonly rounds: Array<{ id: string; mapId: string; claimId: string; userId: string; status: string }>) {}

  async transaction<T>(callback: (tx: RecordChallengeResponseRepositoryTx) => Promise<T>) {
    const tx = new FakeRecordChallengeResponseRepositoryTx(this.rounds, this.updatedRounds, this.events);
    return callback(tx);
  }
}

test("recordChallengeResponse updates the owned round status to responded", async () => {
  const repository = new FakeRecordChallengeResponseRepository([
    {
      id: "round-1",
      mapId: "map-1",
      claimId: "claim-1",
      userId: "user-1",
      status: "started",
    },
  ]);
  const timestamp = new Date("2026-04-24T01:00:00.000Z");

  const result = await recordChallengeResponse(
    {
      userId: "user-1",
      roundId: "round-1",
      response: "  Here is the user's challenge response.  ",
    },
    repository,
    {
      createId: () => "request-1",
      now: () => timestamp,
    },
  );

  assert.deepEqual(result, {
    roundId: "round-1",
    responseRecorded: true,
  });

  assert.deepEqual(repository.updatedRounds, [
    {
      id: "round-1",
      mapId: "map-1",
      claimId: "claim-1",
      userId: "user-1",
      status: "responded",
      updatedAt: timestamp,
    },
  ]);
});

test("recordChallengeResponse emits challenge.response.recorded with response metadata", async () => {
  const repository = new FakeRecordChallengeResponseRepository([
    {
      id: "round-2",
      mapId: "map-2",
      claimId: "claim-2",
      userId: "user-2",
      status: "ready",
    },
  ]);
  const timestamp = new Date("2026-04-24T01:01:00.000Z");

  await recordChallengeResponse(
    {
      userId: "user-2",
      roundId: "round-2",
      response: "Persist this response payload in the event log.",
      responsePath: "direct",
      confidenceBps: 7200,
      requestId: "request-2",
    },
    repository,
    {
      now: () => timestamp,
    },
  );

  assert.deepEqual(repository.events, [
    {
      userId: "user-2",
      aggregateType: "challenge_round",
      aggregateId: "round-2",
      requestId: "request-2",
      type: "challenge.response.recorded",
      payload: {
        mapId: "map-2",
        claimId: "claim-2",
        response: "Persist this response payload in the event log.",
        responsePath: "direct",
        confidenceBps: 7200,
        previousStatus: "ready",
        status: "responded",
      },
      createdAt: timestamp,
    },
  ]);
});

test("recordChallengeResponse replays a safe duplicate response for the same requestId", async () => {
  const repository = new FakeRecordChallengeResponseRepository([
    {
      id: "round-5",
      mapId: "map-5",
      claimId: "claim-5",
      userId: "user-5",
      status: "started",
    },
  ]);
  const timestamp = new Date("2026-04-24T14:15:00.000Z");

  const firstResult = await recordChallengeResponse(
    {
      userId: "user-5",
      roundId: "round-5",
      response: "Persist this only once.",
      requestId: "request-duplicate",
    },
    repository,
    {
      now: () => timestamp,
    },
  );

  const secondResult = await recordChallengeResponse(
    {
      userId: "user-5",
      roundId: "round-5",
      response: "Persist this only once.",
      requestId: "request-duplicate",
    },
    repository,
    {
      now: () => new Date("2026-04-24T14:16:00.000Z"),
    },
  );

  assert.deepEqual(firstResult, {
    roundId: "round-5",
    responseRecorded: true,
  });
  assert.deepEqual(secondResult, firstResult);
  assert.equal(repository.updatedRounds.length, 1);
  assert.equal(repository.events.length, 1);
});

test("recordChallengeResponse rejects an unowned round", async () => {
  const repository = new FakeRecordChallengeResponseRepository([
    {
      id: "round-3",
      mapId: "map-3",
      claimId: "claim-3",
      userId: "other-user",
      status: "started",
    },
  ]);

  await assert.rejects(
    () =>
      recordChallengeResponse(
        {
          userId: "user-3",
          roundId: "round-3",
          response: "This should not be accepted for a different user's round.",
        },
        repository,
      ),
    RecordChallengeResponseRoundForbiddenError,
  );

  assert.equal(repository.updatedRounds.length, 0);
  assert.equal(repository.events.length, 0);
});

test("recordChallengeResponse rejects a missing round", async () => {
  const repository = new FakeRecordChallengeResponseRepository([]);

  await assert.rejects(
    () =>
      recordChallengeResponse(
        {
          userId: "user-3",
          roundId: "round-3",
          response: "This should not be accepted for a missing round.",
        },
        repository,
      ),
    RecordChallengeResponseRoundNotFoundError,
  );

  assert.equal(repository.updatedRounds.length, 0);
  assert.equal(repository.events.length, 0);
});

test("recordChallengeResponse validates required response input", async () => {
  const repository = new FakeRecordChallengeResponseRepository([
    {
      id: "round-4",
      mapId: "map-4",
      claimId: "claim-4",
      userId: "user-4",
      status: "started",
    },
  ]);

  await assert.rejects(
    () =>
      recordChallengeResponse(
        {
          userId: "user-4",
          roundId: "round-4",
          response: "   ",
        },
        repository,
      ),
    RecordChallengeResponseValidationError,
  );
});
