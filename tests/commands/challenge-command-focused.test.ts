import assert from "node:assert/strict";
import test from "node:test";

import {
  RequestChallengeCritiqueRoundForbiddenError,
  requestChallengeCritique,
  type ChallengeCritiqueRecord,
  type ChallengeCritiqueRequestedEventRecord,
  type RequestChallengeCritiqueRepository,
  type RequestChallengeCritiqueRepositoryTx,
} from "../../server/commands/request-challenge-critique.ts";
import {
  RecordChallengeResponseRoundForbiddenError,
  recordChallengeResponse,
  type ChallengeResponseRecordedEventRecord,
  type RecordChallengeResponseRepository,
  type RecordChallengeResponseRepositoryTx,
  type RecordChallengeResponseRoundRecord,
} from "../../server/commands/record-challenge-response.ts";

type CritiqueRound = { id: string; mapId: string; claimId: string; userId: string };

class FocusedRequestCritiqueTx implements RequestChallengeCritiqueRepositoryTx {
  constructor(
    private readonly rounds: CritiqueRound[],
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

    return event ? { aggregateId: event.aggregateId, payload: event.payload } : null;
  }

  async findOwnedCritique(input: { critiqueId: string; userId: string }) {
    return this.critiques.find((critique) => critique.id === input.critiqueId && critique.userId === input.userId) ?? null;
  }

  async findOwnedCritiqueByRound(input: { roundId: string; userId: string }) {
    return this.critiques.find((critique) => critique.roundId === input.roundId && critique.userId === input.userId) ?? null;
  }

  async findMapById(input: { mapId: string }) {
    const round = this.rounds.find((candidate) => candidate.mapId === input.mapId);
    return round ? { id: round.mapId, userId: round.userId } : null;
  }

  async findClaimById(input: { claimId: string }) {
    const round = this.rounds.find((candidate) => candidate.claimId === input.claimId);
    return round ? { id: round.claimId, mapId: round.mapId, userId: round.userId } : null;
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

class FocusedRequestCritiqueRepository implements RequestChallengeCritiqueRepository {
  readonly critiques: ChallengeCritiqueRecord[] = [];
  readonly events: ChallengeCritiqueRequestedEventRecord[] = [];

  constructor(private readonly rounds: CritiqueRound[]) {}

  async transaction<T>(callback: (tx: RequestChallengeCritiqueRepositoryTx) => Promise<T>) {
    return callback(new FocusedRequestCritiqueTx(this.rounds, this.critiques, this.events));
  }
}

type ResponseRound = CritiqueRound & { status: string };

class FocusedRecordResponseTx implements RecordChallengeResponseRepositoryTx {
  constructor(
    private readonly rounds: ResponseRound[],
    private readonly updatedRounds: RecordChallengeResponseRoundRecord[],
    private readonly events: ChallengeResponseRecordedEventRecord[],
  ) {}

  async findMoveEventByRequestId(input: { userId: string; requestId: string; type: string }) {
    const event = this.events.find(
      (candidate) =>
        candidate.userId === input.userId &&
        candidate.requestId === input.requestId &&
        candidate.type === input.type,
    );

    return event ? { aggregateId: event.aggregateId } : null;
  }

  async findRoundById(input: { roundId: string }) {
    return this.rounds.find((round) => round.id === input.roundId) ?? null;
  }

  async findOwnedRound(input: { roundId: string; userId: string }) {
    return this.rounds.find((round) => round.id === input.roundId && round.userId === input.userId) ?? null;
  }

  async updateChallengeRound(record: RecordChallengeResponseRoundRecord) {
    this.updatedRounds.push(record);
  }

  async insertMoveEvent(event: ChallengeResponseRecordedEventRecord) {
    this.events.push(event);
  }
}

class FocusedRecordResponseRepository implements RecordChallengeResponseRepository {
  readonly updatedRounds: RecordChallengeResponseRoundRecord[] = [];
  readonly events: ChallengeResponseRecordedEventRecord[] = [];

  constructor(private readonly rounds: ResponseRound[]) {}

  async transaction<T>(callback: (tx: RecordChallengeResponseRepositoryTx) => Promise<T>) {
    return callback(new FocusedRecordResponseTx(this.rounds, this.updatedRounds, this.events));
  }
}

test("focused requestChallengeCritique happy path", async () => {
  const timestamp = new Date("2026-04-24T17:00:00.000Z");
  const repository = new FocusedRequestCritiqueRepository([
    { id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "user-1" },
  ]);

  const result = await requestChallengeCritique(
    { userId: "user-1", roundId: "round-1", requestId: "request-1" },
    repository,
    { createId: () => "critique-1", now: () => timestamp },
  );

  assert.deepEqual(result, {
    critiqueId: "critique-1",
    roundId: "round-1",
    critiqueStatus: "pending",
  });
  assert.equal(repository.critiques.length, 1);
  assert.equal(repository.critiques[0].status, "pending");
});

test("focused requestChallengeCritique wrong user fails", async () => {
  const repository = new FocusedRequestCritiqueRepository([
    { id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "owner-user" },
  ]);

  await assert.rejects(
    () => requestChallengeCritique({ userId: "other-user", roundId: "round-1" }, repository),
    RequestChallengeCritiqueRoundForbiddenError,
  );
  assert.equal(repository.critiques.length, 0);
  assert.equal(repository.events.length, 0);
});

test("focused requestChallengeCritique emits event", async () => {
  const timestamp = new Date("2026-04-24T17:01:00.000Z");
  const repository = new FocusedRequestCritiqueRepository([
    { id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "user-1" },
  ]);

  await requestChallengeCritique(
    { userId: "user-1", roundId: "round-1", requestId: "request-1" },
    repository,
    { createId: () => "critique-1", now: () => timestamp },
  );

  assert.deepEqual(repository.events, [
    {
      userId: "user-1",
      aggregateType: "challenge_critique",
      aggregateId: "critique-1",
      requestId: "request-1",
      type: "challenge.critique.requested",
      payload: {
        roundId: "round-1",
        mapId: "map-1",
        claimId: "claim-1",
        status: "pending",
      },
      createdAt: timestamp,
    },
  ]);
});

test("focused recordChallengeResponse happy path", async () => {
  const timestamp = new Date("2026-04-24T17:02:00.000Z");
  const repository = new FocusedRecordResponseRepository([
    { id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "user-1", status: "ready" },
  ]);

  const result = await recordChallengeResponse(
    { userId: "user-1", roundId: "round-1", response: "I accept the challenge.", requestId: "response-request-1" },
    repository,
    { now: () => timestamp },
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

test("focused recordChallengeResponse wrong user fails", async () => {
  const repository = new FocusedRecordResponseRepository([
    { id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "owner-user", status: "ready" },
  ]);

  await assert.rejects(
    () =>
      recordChallengeResponse(
        { userId: "other-user", roundId: "round-1", response: "This should not be recorded." },
        repository,
      ),
    RecordChallengeResponseRoundForbiddenError,
  );
  assert.equal(repository.updatedRounds.length, 0);
  assert.equal(repository.events.length, 0);
});

test("focused recordChallengeResponse emits event", async () => {
  const timestamp = new Date("2026-04-24T17:03:00.000Z");
  const repository = new FocusedRecordResponseRepository([
    { id: "round-1", mapId: "map-1", claimId: "claim-1", userId: "user-1", status: "ready" },
  ]);

  await recordChallengeResponse(
    {
      userId: "user-1",
      roundId: "round-1",
      response: "I will revise the claim.",
      responsePath: "revise",
      confidenceBps: 6200,
      requestId: "response-request-1",
    },
    repository,
    { now: () => timestamp },
  );

  assert.deepEqual(repository.events, [
    {
      userId: "user-1",
      aggregateType: "challenge_round",
      aggregateId: "round-1",
      requestId: "response-request-1",
      type: "challenge.response.recorded",
      payload: {
        mapId: "map-1",
        claimId: "claim-1",
        response: "I will revise the claim.",
        responsePath: "revise",
        confidenceBps: 6200,
        previousStatus: "ready",
        status: "responded",
      },
      createdAt: timestamp,
    },
  ]);
});
