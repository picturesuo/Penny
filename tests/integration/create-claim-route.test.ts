import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { POST } from "../../apps/web/app/api/commands/claims/create/route";
import { createMap } from "../../server/commands/create-map";
import { createDbClient } from "../../server/db/client";

const PG_PORT = 58000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_create_claim_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-claim-route-"));

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

test("POST /api/commands/claims/create inserts a claim row and claim.created event", async () => {
  const userId = "00000000-0000-0000-0000-000000000456";
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const map = await createMap(
      {
        userId,
        title: "Claim route parent map",
        requestId: "create-map-for-claim-route",
      },
      db,
    );

    const response = await POST(
      new Request("http://localhost/api/commands/claims/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "claim-route-request-1",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          mapId: map.mapId,
          text: "  Route-created claim body  ",
        }),
      }),
    );

    assert.equal(response.status, 201);

    const payload = (await response.json()) as { claimId: string };
    assert.match(payload.claimId, /^[0-9a-f-]{36}$/i);

    const storedClaims = await sql<
      { id: string; map_id: string; user_id: string; body: string }[]
    >`select id, map_id, user_id, body from claims where id = ${payload.claimId}`;

    assert.equal(storedClaims.length, 1);
    assert.equal(storedClaims[0].map_id, map.mapId);
    assert.equal(storedClaims[0].user_id, userId);
    assert.equal(storedClaims[0].body, "Route-created claim body");

    const storedEvents = await sql<
      {
        aggregate_type: string;
        aggregate_id: string;
        type: string;
      }[]
    >`select aggregate_type, aggregate_id, type from moves_events where aggregate_id = ${payload.claimId}`;

    assert.equal(storedEvents.length, 1);
    assert.equal(storedEvents[0].aggregate_type, "claim");
    assert.equal(storedEvents[0].aggregate_id, payload.claimId);
    assert.equal(storedEvents[0].type, "claim.created");
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("POST /api/commands/claims/create replays the original result for the same requestId", async () => {
  const userId = "00000000-0000-0000-0000-000000000654";
  const requestId = "claim-route-idempotency-1";
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const map = await createMap(
      {
        userId,
        title: "Claim idempotency parent map",
        requestId: "create-map-for-claim-idempotency",
      },
      db,
    );

    const firstResponse = await POST(
      new Request("http://localhost/api/commands/claims/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          mapId: map.mapId,
          text: "Retried claim body",
          requestId,
        }),
      }),
    );

    const secondResponse = await POST(
      new Request("http://localhost/api/commands/claims/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          mapId: map.mapId,
          text: "Retried claim body",
          requestId,
        }),
      }),
    );

    assert.equal(firstResponse.status, 201);
    assert.equal(secondResponse.status, 201);

    const firstPayload = (await firstResponse.json()) as { claimId: string };
    const secondPayload = (await secondResponse.json()) as { claimId: string };

    assert.equal(secondPayload.claimId, firstPayload.claimId);

    const storedClaims = await sql<
      {
        id: string;
        body: string;
      }[]
    >`
      select id, body
      from claims
      where user_id = ${userId}
        and map_id = ${map.mapId}
    `;

    const storedEvents = await sql<
      {
        aggregate_id: string;
      }[]
    >`
      select aggregate_id
      from moves_events
      where user_id = ${userId}
        and request_id = ${requestId}
        and type = ${"claim.created"}
    `;

    assert.equal(storedClaims.length, 1);
    assert.equal(storedClaims[0].id, firstPayload.claimId);
    assert.equal(storedClaims[0].body, "Retried claim body");
    assert.equal(storedEvents.length, 1);
    assert.equal(storedEvents[0].aggregate_id, firstPayload.claimId);
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("POST /api/commands/claims/create returns 403 when the map belongs to another user", async () => {
  const ownerUserId = "00000000-0000-0000-0000-000000000901";
  const otherUserId = "00000000-0000-0000-0000-000000000902";
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const map = await createMap(
      {
        userId: ownerUserId,
        title: "Claim route ownership map",
        requestId: "create-map-for-claim-ownership",
      },
      db,
    );

    const response = await POST(
      new Request("http://localhost/api/commands/claims/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "claim-route-ownership-request-1",
          "x-user-id": otherUserId,
        },
        body: JSON.stringify({
          mapId: map.mapId,
          text: "Unauthorized claim body",
        }),
      }),
    );

    assert.equal(response.status, 403);

    const storedClaims = await sql`
      select id
      from claims
      where map_id = ${map.mapId}
        and user_id = ${otherUserId}
    `;

    assert.equal(storedClaims.length, 0);
  } finally {
    await sql.end({ timeout: 1 });
  }
});
