import assert from "node:assert/strict";
import test from "node:test";

import {
  GenerateChallengeCritiqueClaimNotFoundError,
  GenerateChallengeCritiqueNotFoundError,
  GenerateChallengeCritiqueValidationError,
  generateChallengeCritique,
  type ChallengeCritiqueGeneratedEventRecord,
  type ChallengeCritiqueReadyRecord,
  type GenerateChallengeCritiqueRepository,
  type GenerateChallengeCritiqueRepositoryTx,
} from "../../server/commands/generate-challenge-critique.ts";

class FakeGenerateChallengeCritiqueRepositoryTx implements GenerateChallengeCritiqueRepositoryTx {
  constructor(
    private readonly critiques: Array<{
      id: string;
      roundId: string;
      mapId: string;
      claimId: string;
      userId: string;
      status: string;
      body: string | null;
    }>,
    private readonly claims: Array<{ id: string; mapId: string; userId: string; body: string }>,
    private readonly updates: ChallengeCritiqueReadyRecord[],
    private readonly events: ChallengeCritiqueGeneratedEventRecord[],
  ) {}

  async findOwnedCritique(input: { critiqueId: string; userId: string }) {
    return this.critiques.find((critique) => critique.id === input.critiqueId && critique.userId === input.userId) ?? null;
  }

  async findOwnedClaim(input: { claimId: string; mapId: string; userId: string }) {
    const claim = this.claims.find(
      (candidate) =>
        candidate.id === input.claimId && candidate.mapId === input.mapId && candidate.userId === input.userId,
    );

    return claim ? { body: claim.body } : null;
  }

  async updateChallengeCritique(record: ChallengeCritiqueReadyRecord) {
    this.updates.push(record);
  }

  async insertMoveEvent(event: ChallengeCritiqueGeneratedEventRecord) {
    this.events.push(event);
  }
}

class FakeGenerateChallengeCritiqueRepository implements GenerateChallengeCritiqueRepository {
  readonly updates: ChallengeCritiqueReadyRecord[] = [];
  readonly events: ChallengeCritiqueGeneratedEventRecord[] = [];

  constructor(
    private readonly critiques: Array<{
      id: string;
      roundId: string;
      mapId: string;
      claimId: string;
      userId: string;
      status: string;
      body: string | null;
    }>,
    private readonly claims: Array<{ id: string; mapId: string; userId: string; body: string }>,
  ) {}

  async transaction<T>(callback: (tx: GenerateChallengeCritiqueRepositoryTx) => Promise<T>) {
    const tx = new FakeGenerateChallengeCritiqueRepositoryTx(this.critiques, this.claims, this.updates, this.events);
    return callback(tx);
  }
}

test("generateChallengeCritique fills a pending critique and returns ready output", async () => {
  const repository = new FakeGenerateChallengeCritiqueRepository(
    [
      {
        id: "critique-1",
        roundId: "round-1",
        mapId: "map-1",
        claimId: "claim-1",
        userId: "user-1",
        status: "pending",
        body: null,
      },
    ],
    [
      {
        id: "claim-1",
        mapId: "map-1",
        userId: "user-1",
        body: "Enterprise buyers always need proof before committing.",
      },
    ],
  );
  const timestamp = new Date("2026-04-24T03:00:00.000Z");

  const result = await generateChallengeCritique(
    {
      userId: "user-1",
      critiqueId: "critique-1",
      requestId: "request-1",
    },
    repository,
    {
      now: () => timestamp,
    },
  );

  assert.equal(result.critiqueId, "critique-1");
  assert.equal(result.status, "ready");
  assert.match(result.body, /Main challenge:/);
  assert.match(result.body, /Pressure test:/);
  assert.match(result.body, /Fastest next test:/);

  assert.deepEqual(repository.updates, [
    {
      id: "critique-1",
      userId: "user-1",
      status: "ready",
      body: result.body,
      updatedAt: timestamp,
    },
  ]);
  assert.deepEqual(repository.events, [
    {
      userId: "user-1",
      aggregateType: "challenge_critique",
      aggregateId: "critique-1",
      requestId: "request-1",
      type: "challenge.critique.generated",
      payload: {
        roundId: "round-1",
        mapId: "map-1",
        claimId: "claim-1",
        status: "ready",
        body: result.body,
        critiqueJson: {
          body: result.body,
        },
        provider: "local",
        model: "heuristic-stub",
        promptVersion: "generateChallengeCritique.stub.v1",
      },
      createdAt: timestamp,
    },
  ]);
});

test("generateChallengeCritique is idempotent for a ready critique with an existing body", async () => {
  const repository = new FakeGenerateChallengeCritiqueRepository(
    [
      {
        id: "critique-2",
        roundId: "round-2",
        mapId: "map-2",
        claimId: "claim-2",
        userId: "user-2",
        status: "ready",
        body: "Already generated critique body.",
      },
    ],
    [],
  );

  const result = await generateChallengeCritique(
    {
      userId: "user-2",
      critiqueId: "critique-2",
    },
    repository,
  );

  assert.deepEqual(result, {
    critiqueId: "critique-2",
    status: "ready",
    body: "Already generated critique body.",
  });
  assert.equal(repository.updates.length, 0);
  assert.equal(repository.events.length, 0);
});

test("generateChallengeCritique rejects an unowned critique", async () => {
  const repository = new FakeGenerateChallengeCritiqueRepository(
    [
      {
        id: "critique-3",
        roundId: "round-3",
        mapId: "map-3",
        claimId: "claim-3",
        userId: "other-user",
        status: "pending",
        body: null,
      },
    ],
    [],
  );

  await assert.rejects(
    () =>
      generateChallengeCritique(
        {
          userId: "user-3",
          critiqueId: "critique-3",
        },
        repository,
      ),
    GenerateChallengeCritiqueNotFoundError,
  );
});

test("generateChallengeCritique rejects a critique with no readable claim", async () => {
  const repository = new FakeGenerateChallengeCritiqueRepository(
    [
      {
        id: "critique-4",
        roundId: "round-4",
        mapId: "map-4",
        claimId: "claim-4",
        userId: "user-4",
        status: "pending",
        body: null,
      },
    ],
    [],
  );

  await assert.rejects(
    () =>
      generateChallengeCritique(
        {
          userId: "user-4",
          critiqueId: "critique-4",
        },
        repository,
      ),
    GenerateChallengeCritiqueClaimNotFoundError,
  );
});

test("generateChallengeCritique validates critiqueId", async () => {
  const repository = new FakeGenerateChallengeCritiqueRepository([], []);

  await assert.rejects(
    () =>
      generateChallengeCritique(
        {
          userId: "user-5",
          critiqueId: "   ",
        },
        repository,
      ),
    GenerateChallengeCritiqueValidationError,
  );
});
