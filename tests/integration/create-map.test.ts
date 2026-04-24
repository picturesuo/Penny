import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { createDbClient } from "../../server/db/client";
import { createMap } from "../../server/commands/create-map";

const PG_PORT = 56000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_create_map_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-"));

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

test("createMap inserts into maps and emits map.created", async () => {
  const userId = crypto.randomUUID();
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const result = await createMap(
      {
        userId,
        title: "  First map  ",
      },
      db,
    );

    assert.match(result.mapId, /^[0-9a-f-]{36}$/i);

    const storedMaps = await sql<
      { id: string; user_id: string; title: string }[]
    >`select id, user_id, title from maps where id = ${result.mapId}`;

    assert.equal(storedMaps.length, 1);
    assert.equal(storedMaps[0].id, result.mapId);
    assert.equal(storedMaps[0].user_id, userId);
    assert.equal(storedMaps[0].title, "First map");

    const storedEvents = await sql<
      {
        aggregate_type: string;
        aggregate_id: string;
        type: string;
      }[]
    >`select aggregate_type, aggregate_id, type from moves_events where aggregate_id = ${result.mapId}`;

    assert.equal(storedEvents.length, 1);
    assert.equal(storedEvents[0].aggregate_type, "map");
    assert.equal(storedEvents[0].aggregate_id, result.mapId);
    assert.equal(storedEvents[0].type, "map.created");
  } finally {
    await sql.end({ timeout: 1 });
  }
});
