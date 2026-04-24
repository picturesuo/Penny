import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";

import { createClaim } from "../../server/commands/create-claim.ts";
import { createMap } from "../../server/commands/create-map.ts";
import { generateChallengeCritique } from "../../server/commands/generate-challenge-critique.ts";
import { recordChallengeResponse } from "../../server/commands/record-challenge-response.ts";
import { requestChallengeCritique } from "../../server/commands/request-challenge-critique.ts";
import { setWorkspaceSelection } from "../../server/commands/set-workspace-selection.ts";
import {
  startChallengeRound,
  type ChallengeRoundRecord,
  type ChallengeRoundStartedEventRecord,
  type StartChallengeRoundRepository,
  type StartChallengeRoundRepositoryTx,
} from "../../server/commands/start-challenge-round.ts";
import { createDbClient } from "../../server/db/client.ts";
import { challengeRounds, claims, movesEvents } from "../../server/db/schema.ts";

const PG_PORT = 54000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_moves_events_command_matrix_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-moves-events-command-matrix-"));

function run(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  execFileSync(command, args, {
    cwd: "/Users/bensuo/Desktop/penny",
    env: env ? { ...process.env, ...env } : process.env,
    stdio: "pipe",
  });
}

function createStartChallengeRoundRepository(db: ReturnType<typeof createDbClient>): StartChallengeRoundRepository {
  return {
    async transaction<T>(callback: (tx: StartChallengeRoundRepositoryTx) => Promise<T>) {
      return db.transaction(async (tx) =>
        callback({
          async findOwnedClaim(input: { claimId: string; userId: string }) {
            const rows = await tx
              .select({
                id: claims.id,
                mapId: claims.mapId,
                userId: claims.userId,
              })
              .from(claims)
              .where(and(eq(claims.id, input.claimId), eq(claims.userId, input.userId)))
              .limit(1);

            return rows[0] ?? null;
          },
          async insertChallengeRound(record: ChallengeRoundRecord) {
            await tx.insert(challengeRounds).values(record);
          },
          async insertMoveEvent(event: ChallengeRoundStartedEventRecord) {
            await tx.insert(movesEvents).values({
              userId: event.userId,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              requestId: event.requestId,
              type: event.type,
              payloadJson: event.payload,
              createdAt: event.createdAt,
            });
          },
        }),
      );
    },
  };
}

run("initdb", ["-D", PGDATA_DIR, "-U", PG_USER, "-A", "trust"]);
run("pg_ctl", ["-D", PGDATA_DIR, "-l", join(PGDATA_DIR, "postgres.log"), "-o", `-p ${PG_PORT}`, "start"]);
run("createdb", ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", PG_USER, DB_NAME]);

const databaseUrl = `postgresql://${PG_USER}@127.0.0.1:${PG_PORT}/${DB_NAME}`;

run("pnpm", ["db:migrate"], {
  DATABASE_URL: databaseUrl,
  DATABASE_DIRECT_URL: databaseUrl,
});

after(async () => {
  try {
    run("pg_ctl", ["-D", PGDATA_DIR, "stop", "-m", "immediate"]);
  } finally {
    rmSync(PGDATA_DIR, { recursive: true, force: true });
  }
});

test("write commands produce the expected durable moves_events rows", async () => {
  const userId = "00000000-0000-0000-0000-000000000111";
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const map = await createMap(
      {
        userId,
        title: "  Event matrix map  ",
        requestId: "event-matrix-map-request",
      },
      db,
    );

    const claim = await createClaim(
      {
        userId,
        mapId: map.mapId,
        text: "  Event matrix claim  ",
        requestId: "event-matrix-claim-request",
      },
      db,
    );

    await setWorkspaceSelection(
      {
        userId,
        mode: "Challenge",
        mapId: map.mapId,
        claimId: claim.claimId,
        requestId: "event-matrix-workspace-request",
      },
      db as never,
    );

    const round = await startChallengeRound(
      {
        userId,
        claimId: claim.claimId,
        requestId: "event-matrix-round-request",
      },
      createStartChallengeRoundRepository(db),
    );

    const critique = await requestChallengeCritique(
      {
        userId,
        roundId: round.roundId,
        requestId: "event-matrix-critique-request",
      },
      db as never,
    );

    const generated = await generateChallengeCritique(
      {
        userId,
        critiqueId: critique.critiqueId,
        requestId: "event-matrix-generate-request",
      },
      db as never,
      {
        generateCritique: async () => ({
          body: "Generated critique body for the event log matrix.",
          critiqueJson: {
            body: "Generated critique body for the event log matrix.",
          },
          metadata: {
            provider: "test-provider",
            model: "test-model",
            promptVersion: "test-prompt.v1",
          },
        }),
      },
    );

    assert.equal(generated.status, "ready");

    const response = await recordChallengeResponse(
      {
        userId,
        roundId: round.roundId,
        response: "The founder answered the challenge directly.",
        responsePath: "direct",
        confidenceBps: 6600,
        requestId: "event-matrix-response-request",
      },
      db,
    );

    assert.equal(response.status, "responded");

    const eventRows = await sql<
      {
        type: string;
        aggregate_type: string;
        aggregate_id: string;
      }[]
    >`
      select type, aggregate_type, aggregate_id
      from moves_events
      where user_id = ${userId}
      order by created_at desc, id desc
      limit 20
    `;

    assert.ok(
      eventRows.some(
        (event) => event.type === "map.created" && event.aggregate_type === "map" && event.aggregate_id === map.mapId,
      ),
    );
    assert.ok(
      eventRows.some(
        (event) =>
          event.type === "claim.created" && event.aggregate_type === "claim" && event.aggregate_id === claim.claimId,
      ),
    );
    assert.ok(
      eventRows.some((event) => event.type === "workspace.selection.changed" && event.aggregate_type === "workspace_context"),
    );
    assert.ok(
      eventRows.some(
        (event) =>
          event.type === "challenge.round.started" &&
          event.aggregate_type === "challenge_round" &&
          event.aggregate_id === round.roundId,
      ),
    );
    assert.ok(
      eventRows.some(
        (event) =>
          event.type === "challenge.critique.requested" &&
          event.aggregate_type === "challenge_critique" &&
          event.aggregate_id === critique.critiqueId,
      ),
    );
    assert.ok(
      eventRows.some(
        (event) =>
          event.type === "challenge.critique.generated" &&
          event.aggregate_type === "challenge_critique" &&
          event.aggregate_id === critique.critiqueId,
      ),
    );
    assert.ok(
      eventRows.some(
        (event) =>
          event.type === "challenge.response.recorded" &&
          event.aggregate_type === "challenge_round" &&
          event.aggregate_id === round.roundId,
      ),
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("generateChallengeCritique writes challenge.critique.failed when generation fails", async () => {
  const userId = "00000000-0000-0000-0000-000000000222";
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const map = await createMap(
      {
        userId,
        title: "Failure path map",
        requestId: "event-failure-map-request",
      },
      db,
    );

    const claim = await createClaim(
      {
        userId,
        mapId: map.mapId,
        text: "Failure path claim",
        requestId: "event-failure-claim-request",
      },
      db,
    );

    const round = await startChallengeRound(
      {
        userId,
        claimId: claim.claimId,
        requestId: "event-failure-round-request",
      },
      createStartChallengeRoundRepository(db),
    );

    const critique = await requestChallengeCritique(
      {
        userId,
        roundId: round.roundId,
        requestId: "event-failure-critique-request",
      },
      db as never,
    );

    const failedResult = await generateChallengeCritique(
      {
        userId,
        critiqueId: critique.critiqueId,
        requestId: "event-failure-generate-request",
      },
      db as never,
      {
        generateCritique: async () => {
          throw new Error("Synthetic critique failure.");
        },
      },
    );

    assert.deepEqual(
      failedResult,
      {
        critiqueId: critique.critiqueId,
        status: "failed",
        body: null,
      },
    );

    const critiqueRows = await sql<
      {
        id: string;
        status: string;
        body: string | null;
      }[]
    >`
      select id, status, body
      from challenge_critiques
      where id = ${critique.critiqueId}
    `;

    assert.equal(critiqueRows.length, 1);
    assert.equal(critiqueRows[0]?.status, "failed");
    assert.equal(critiqueRows[0]?.body, null);

    const failedEventRows = await sql<
      {
        type: string;
        aggregate_type: string;
        aggregate_id: string;
        payload_json: Record<string, unknown>;
      }[]
    >`
      select type, aggregate_type, aggregate_id, payload_json
      from moves_events
      where aggregate_id = ${critique.critiqueId}
        and type = ${"challenge.critique.failed"}
      order by created_at desc, id desc
      limit 1
    `;

    assert.equal(failedEventRows.length, 1);
    assert.equal(failedEventRows[0]?.aggregate_type, "challenge_critique");
    assert.equal(failedEventRows[0]?.aggregate_id, critique.critiqueId);
    assert.deepEqual(failedEventRows[0]?.payload_json, {
      roundId: round.roundId,
      mapId: map.mapId,
      claimId: claim.claimId,
      status: "failed",
      errorMessage: "Synthetic critique failure.",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});
