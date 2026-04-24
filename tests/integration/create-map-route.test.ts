import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { POST } from "../../apps/web/app/api/commands/maps/create/route";

const PG_PORT = 57000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_create_map_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-route-"));

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

test("POST /api/commands/maps/create inserts a map row and map.created event", async () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const response = await POST(
      new Request("http://localhost/api/commands/maps/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "route-request-1",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          title: "  Route-created map  ",
        }),
      }),
    );

    assert.equal(response.status, 201);

    const payload = (await response.json()) as { mapId: string };
    assert.match(payload.mapId, /^[0-9a-f-]{36}$/i);

    const storedMaps = await sql<
      { id: string; user_id: string; title: string }[]
    >`select id, user_id, title from maps where id = ${payload.mapId}`;

    assert.equal(storedMaps.length, 1);
    assert.equal(storedMaps[0].user_id, userId);
    assert.equal(storedMaps[0].title, "Route-created map");

    const storedEvents = await sql<
      {
        aggregate_type: string;
        aggregate_id: string;
        type: string;
      }[]
    >`select aggregate_type, aggregate_id, type from moves_events where aggregate_id = ${payload.mapId}`;

    assert.equal(storedEvents.length, 1);
    assert.equal(storedEvents[0].aggregate_type, "map");
    assert.equal(storedEvents[0].aggregate_id, payload.mapId);
    assert.equal(storedEvents[0].type, "map.created");
  } finally {
    await sql.end({ timeout: 1 });
  }
});
