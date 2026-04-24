import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { POST } from "../../apps/web/app/api/commands/challenge/respond/route";

const PG_PORT = 62000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_challenge_respond_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-challenge-respond-route-"));

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

process.env.DATABASE_URL = databaseUrl;
process.env.DATABASE_DIRECT_URL = databaseUrl;

after(async () => {
  try {
    run("pg_ctl", ["-D", PGDATA_DIR, "stop", "-m", "immediate"]);
  } finally {
    rmSync(PGDATA_DIR, { recursive: true, force: true });
  }
});

test("POST /api/commands/challenge/respond records a response event and updates the round", async () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  const mapId = "00000000-0000-0000-0000-000000000321";
  const claimId = "00000000-0000-0000-0000-000000000456";
  const roundId = "00000000-0000-0000-0000-000000000654";
  const requestId = "challenge-respond-request-1";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Challenge map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values (${claimId}, ${mapId}, ${userId}, ${"Selected challenge claim"}, ${6300})
    `;

    await sql`
      insert into challenge_rounds (id, map_id, claim_id, user_id, status)
      values (${roundId}, ${mapId}, ${claimId}, ${userId}, ${"ready"})
    `;

    const response = await POST(
      new Request("http://localhost/api/commands/challenge/respond", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
          "x-request-id": requestId,
        },
        body: JSON.stringify({
          roundId,
          response: "Here is the direct response to the challenge.",
          responsePath: "direct",
          confidenceBps: 6400,
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      roundId,
      status: "responded",
    });

    const roundRows = await sql`
      select status
      from challenge_rounds
      where id = ${roundId}
    `;

    assert.equal(roundRows.length, 1);
    assert.equal(roundRows[0]?.status, "responded");

    const eventRows = await sql`
      select type, request_id, payload_json
      from moves_events
      where aggregate_id = ${roundId}
      order by created_at desc, id desc
      limit 1
    `;

    assert.equal(eventRows.length, 1);
    assert.equal(eventRows[0]?.type, "challenge.response.recorded");
    assert.equal(eventRows[0]?.request_id, requestId);
    assert.deepEqual(eventRows[0]?.payload_json, {
      mapId,
      claimId,
      response: "Here is the direct response to the challenge.",
      responsePath: "direct",
      confidenceBps: 6400,
      previousStatus: "ready",
      status: "responded",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("POST /api/commands/challenge/respond replays the original result for the same idempotency key", async () => {
  const userId = "00000000-0000-0000-0000-000000000223";
  const mapId = "00000000-0000-0000-0000-000000000323";
  const claimId = "00000000-0000-0000-0000-000000000423";
  const roundId = "00000000-0000-0000-0000-000000000523";
  const idempotencyKey = "challenge-respond-idempotency-1";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Challenge response idempotency map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values (${claimId}, ${mapId}, ${userId}, ${"Challenge response idempotency claim"}, ${5400})
    `;

    await sql`
      insert into challenge_rounds (id, map_id, claim_id, user_id, status)
      values (${roundId}, ${mapId}, ${claimId}, ${userId}, ${"ready"})
    `;

    const firstResponse = await POST(
      new Request("http://localhost/api/commands/challenge/respond", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          roundId,
          response: "This response should only be recorded once.",
          responsePath: "direct",
          confidenceBps: 6100,
        }),
      }),
    );

    const secondResponse = await POST(
      new Request("http://localhost/api/commands/challenge/respond", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          roundId,
          response: "This response should only be recorded once.",
          responsePath: "direct",
          confidenceBps: 6100,
        }),
      }),
    );

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.deepEqual(await firstResponse.json(), {
      roundId,
      status: "responded",
    });
    assert.deepEqual(await secondResponse.json(), {
      roundId,
      status: "responded",
    });

    const roundRows = await sql`
      select status
      from challenge_rounds
      where id = ${roundId}
    `;

    const eventRows = await sql`
      select id
      from moves_events
      where user_id = ${userId}
        and request_id = ${idempotencyKey}
        and type = ${"challenge.response.recorded"}
    `;

    assert.equal(roundRows.length, 1);
    assert.equal(roundRows[0]?.status, "responded");
    assert.equal(eventRows.length, 1);
  } finally {
    await sql.end({ timeout: 1 });
  }
});
