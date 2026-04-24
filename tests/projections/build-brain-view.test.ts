import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { createClaim } from "../../server/commands/create-claim.ts";
import { createMap } from "../../server/commands/create-map.ts";
import { setWorkspaceSelection } from "../../server/commands/set-workspace-selection.ts";
import { createDbClient } from "../../server/db/client.ts";
import { buildBrainView } from "../../server/projections/build-brain-view.ts";

const PG_PORT = 60000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_build_brain_view_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-brain-view-"));

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

test("buildBrainView returns the selected claim after createClaim and setWorkspaceSelection", async () => {
  const userId = "00000000-0000-0000-0000-000000000777";
  const db = createDbClient(databaseUrl);

  const map = await createMap(
    {
      userId,
      title: "Brain view map",
      requestId: "brain-view-map-request",
    },
    db,
  );

  const claim = await createClaim(
    {
      userId,
      mapId: map.mapId,
      text: "  Brain view selected claim  ",
      requestId: "brain-view-claim-request",
    },
    db,
  );

  await setWorkspaceSelection(
    {
      userId,
      mode: "Brain",
      mapId: map.mapId,
      claimId: claim.claimId,
      requestId: "brain-view-selection-request",
    },
    db,
  );

  const brainView = await buildBrainView({ userId }, db);

  assert.deepEqual(brainView.currentContext, {
    mode: "brain",
    mapId: map.mapId,
    claimId: claim.claimId,
  });
  assert.deepEqual(brainView.workspaceContext, brainView.currentContext);
  assert.deepEqual(brainView.mapSummary, {
    id: map.mapId,
    title: "Brain view map",
    claimCount: 1,
  });
  assert.equal(brainView.claims.length, 1);
  assert.equal(brainView.selectedClaim?.id, claim.claimId);
  assert.equal(brainView.selectedClaim?.body, "Brain view selected claim");
  assert.deepEqual(brainView.recentEvents, []);
});
