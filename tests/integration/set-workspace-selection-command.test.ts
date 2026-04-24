import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { createMap } from "../../server/commands/create-map.ts";
import {
  SetWorkspaceSelectionMapForbiddenError,
  setWorkspaceSelection,
} from "../../server/commands/set-workspace-selection.ts";
import { createDbClient } from "../../server/db/client.ts";

const PG_PORT = 64500 + Math.floor(Math.random() * 500);
const PG_USER = "postgres";
const DB_NAME = "penny_set_workspace_selection_command_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-set-workspace-selection-"));

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

test("setWorkspaceSelection rejects a map owned by another user in the DB path", async () => {
  const ownerUserId = "00000000-0000-0000-0000-000000001111";
  const otherUserId = "00000000-0000-0000-0000-000000001112";
  const db = createDbClient(databaseUrl);

  const map = await createMap(
    {
      userId: ownerUserId,
      title: "Workspace selection ownership map",
      requestId: "workspace-selection-owner-map",
    },
    db,
  );

  await assert.rejects(
    () =>
      setWorkspaceSelection(
        {
          userId: otherUserId,
          mode: "Brain",
          mapId: map.mapId,
          requestId: "workspace-selection-forbidden",
        },
        db,
      ),
    SetWorkspaceSelectionMapForbiddenError,
  );
});
