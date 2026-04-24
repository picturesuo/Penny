import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { startChallengeRound } from "../../server/commands/start-challenge-round.ts";
import { createDbClient } from "../../server/db/client.ts";

const PG_PORT = 63000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_start_challenge_round_command_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-start-challenge-round-"));

function run(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  execFileSync(command, args, {
    cwd: "/Users/bensuo/Desktop/penny",
    env: env ? { ...process.env, ...env } : process.env,
    stdio: "pipe",
  });
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

test("startChallengeRound inserts a challenge round and event for an owned claim", async () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  const mapId = "00000000-0000-0000-0000-000000000321";
  const claimId = "00000000-0000-0000-0000-000000000456";
  const requestId = "start-round-request-1";
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Challenge map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values (${claimId}, ${mapId}, ${userId}, ${"Challenge claim"}, ${5000})
    `;

    const result = await startChallengeRound(
      {
        userId,
        claimId,
        requestId,
      },
      db,
    );

    assert.match(result.roundId, /^[0-9a-f-]{36}$/i);

    const roundRows = await sql<
      { id: string; map_id: string; claim_id: string; user_id: string; status: string }[]
    >`select id, map_id, claim_id, user_id, status from challenge_rounds where id = ${result.roundId}`;

    assert.equal(roundRows.length, 1);
    assert.deepEqual(roundRows[0], {
      id: result.roundId,
      map_id: mapId,
      claim_id: claimId,
      user_id: userId,
      status: "started",
    });

    const eventRows = await sql<
      { aggregate_type: string; aggregate_id: string; type: string; payload_json: Record<string, unknown> }[]
    >`select aggregate_type, aggregate_id, type, payload_json from moves_events where aggregate_id = ${result.roundId}`;

    assert.equal(eventRows.length, 1);
    assert.equal(eventRows[0].aggregate_type, "challenge_round");
    assert.equal(eventRows[0].aggregate_id, result.roundId);
    assert.equal(eventRows[0].type, "challenge.round.started");
    assert.deepEqual(eventRows[0].payload_json, {
      mapId,
      claimId,
      status: "started",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("startChallengeRound rejects a claim owned by another user in the DB path", async () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  const otherUserId = "00000000-0000-0000-0000-000000000999";
  const mapId = "00000000-0000-0000-0000-000000000654";
  const claimId = "00000000-0000-0000-0000-000000000777";
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${otherUserId}, ${"Other user's map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values (${claimId}, ${mapId}, ${otherUserId}, ${"Other user's claim"}, ${5000})
    `;

    await assert.rejects(
      () =>
        startChallengeRound(
          {
            userId,
            claimId,
          },
          db,
        ),
      {
        name: "StartChallengeRoundClaimForbiddenError",
      },
    );

    const roundRows = await sql`select id from challenge_rounds where claim_id = ${claimId}`;
    assert.equal(roundRows.length, 0);
  } finally {
    await sql.end({ timeout: 1 });
  }
});
