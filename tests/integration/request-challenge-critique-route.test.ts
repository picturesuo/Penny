import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { POST } from "../../apps/web/app/api/commands/challenge/request-critique/route.ts";

const PG_PORT = 61000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_request_challenge_critique_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-request-challenge-critique-"));

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

test("POST /api/commands/challenge/request-critique inserts a pending critique row and event", async () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  const mapId = "00000000-0000-0000-0000-000000000321";
  const claimId = "00000000-0000-0000-0000-000000000456";
  const roundId = "00000000-0000-0000-0000-000000000654";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Challenge request map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values (${claimId}, ${mapId}, ${userId}, ${"Challenge request claim"}, ${5000})
    `;

    await sql`
      insert into challenge_rounds (id, map_id, claim_id, user_id, status)
      values (${roundId}, ${mapId}, ${claimId}, ${userId}, ${"started"})
    `;

    const response = await POST(
      new Request("http://localhost/api/commands/challenge/request-critique", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "challenge-critique-request-1",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          roundId,
        }),
      }),
    );

    assert.equal(response.status, 201);

    const payload = (await response.json()) as {
      critiqueId: string;
      roundId: string;
      critiqueStatus: string;
    };

    assert.match(payload.critiqueId, /^[0-9a-f-]{36}$/i);
    assert.equal(payload.roundId, roundId);
    assert.equal(payload.critiqueStatus, "pending");

    const storedCritiques = await sql<
      {
        id: string;
        round_id: string;
        status: string;
      }[]
    >`select id, round_id, status from challenge_critiques where id = ${payload.critiqueId}`;

    assert.equal(storedCritiques.length, 1);
    assert.equal(storedCritiques[0].round_id, roundId);
    assert.equal(storedCritiques[0].status, "pending");

    const storedEvents = await sql<
      {
        aggregate_type: string;
        aggregate_id: string;
        type: string;
      }[]
    >`select aggregate_type, aggregate_id, type from moves_events where aggregate_id = ${payload.critiqueId}`;

    assert.equal(storedEvents.length, 1);
    assert.equal(storedEvents[0].aggregate_type, "challenge_critique");
    assert.equal(storedEvents[0].aggregate_id, payload.critiqueId);
    assert.equal(storedEvents[0].type, "challenge.critique.requested");
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("POST /api/commands/challenge/request-critique replays the original result for the same request ID", async () => {
  const userId = "00000000-0000-0000-0000-000000000222";
  const mapId = "00000000-0000-0000-0000-000000000322";
  const claimId = "00000000-0000-0000-0000-000000000422";
  const roundId = "00000000-0000-0000-0000-000000000522";
  const requestId = "challenge-critique-idempotency-1";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Challenge critique idempotency map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values (${claimId}, ${mapId}, ${userId}, ${"Challenge critique idempotency claim"}, ${5100})
    `;

    await sql`
      insert into challenge_rounds (id, map_id, claim_id, user_id, status)
      values (${roundId}, ${mapId}, ${claimId}, ${userId}, ${"started"})
    `;

    const firstResponse = await POST(
      new Request("http://localhost/api/commands/challenge/request-critique", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          roundId,
        }),
      }),
    );

    const secondResponse = await POST(
      new Request("http://localhost/api/commands/challenge/request-critique", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          roundId,
        }),
      }),
    );

    assert.equal(firstResponse.status, 201);
    assert.equal(secondResponse.status, 201);

    const firstPayload = (await firstResponse.json()) as { critiqueId: string; roundId: string; critiqueStatus: string };
    const secondPayload = (await secondResponse.json()) as { critiqueId: string; roundId: string; critiqueStatus: string };

    assert.deepEqual(secondPayload, firstPayload);
    assert.equal(firstPayload.roundId, roundId);
    assert.equal(firstPayload.critiqueStatus, "pending");

    const storedCritiques = await sql`
      select id
      from challenge_critiques
      where user_id = ${userId}
        and round_id = ${roundId}
    `;

    const storedEvents = await sql`
      select id
      from moves_events
      where user_id = ${userId}
        and request_id = ${requestId}
        and type = ${"challenge.critique.requested"}
    `;

    assert.equal(storedCritiques.length, 1);
    assert.equal(storedEvents.length, 1);
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("POST /api/commands/challenge/request-critique returns 403 when the round belongs to another user", async () => {
  const ownerUserId = "00000000-0000-0000-0000-000000000333";
  const otherUserId = "00000000-0000-0000-0000-000000000444";
  const mapId = "00000000-0000-0000-0000-000000000433";
  const claimId = "00000000-0000-0000-0000-000000000533";
  const roundId = "00000000-0000-0000-0000-000000000633";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${ownerUserId}, ${"Challenge critique ownership map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values (${claimId}, ${mapId}, ${ownerUserId}, ${"Challenge critique ownership claim"}, ${5100})
    `;

    await sql`
      insert into challenge_rounds (id, map_id, claim_id, user_id, status)
      values (${roundId}, ${mapId}, ${claimId}, ${ownerUserId}, ${"started"})
    `;

    const response = await POST(
      new Request("http://localhost/api/commands/challenge/request-critique", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "challenge-critique-ownership-request-1",
          "x-user-id": otherUserId,
        },
        body: JSON.stringify({
          roundId,
        }),
      }),
    );

    assert.equal(response.status, 403);

    const storedCritiques = await sql`
      select id
      from challenge_critiques
      where round_id = ${roundId}
        and user_id = ${otherUserId}
    `;

    assert.equal(storedCritiques.length, 0);
  } finally {
    await sql.end({ timeout: 1 });
  }
});
