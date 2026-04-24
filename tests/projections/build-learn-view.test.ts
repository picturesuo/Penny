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
import { buildLearnView } from "../../server/projections/build-learn-view.ts";

const PG_PORT = 63000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_build_learn_view_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-learn-view-"));

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

test("buildLearnView preserves mapId and claimId after a Brain to Learn switch", async () => {
  const userId = "00000000-0000-0000-0000-000000000990";
  const db = createDbClient(databaseUrl);

  const map = await createMap(
    {
      userId,
      title: "Learn view map",
      requestId: "learn-view-map-request",
    },
    db,
  );

  const claim = await createClaim(
    {
      userId,
      mapId: map.mapId,
      text: "Users retain concepts better when they teach them back.",
      requestId: "learn-view-claim-request",
    },
    db,
  );

  await setWorkspaceSelection(
    {
      userId,
      mode: "Brain",
      mapId: map.mapId,
      claimId: claim.claimId,
      requestId: "learn-view-brain-selection",
    },
    db,
  );

  await setWorkspaceSelection(
    {
      userId,
      mode: "Learn",
      mapId: map.mapId,
      requestId: "learn-view-learn-selection",
    },
    db,
  );

  const learnView = await buildLearnView({ userId }, db);

  assert.deepEqual(learnView, {
    shellContext: {
      mode: "learn",
      mapId: map.mapId,
      claimId: claim.claimId,
      breadcrumb: [
        {
          kind: "map",
          id: map.mapId,
          label: "Learn view map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Users retain concepts better when they teach them back.",
        },
      ],
      breadcrumbItems: [
        {
          kind: "map",
          id: map.mapId,
          label: "Learn view map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Users retain concepts better when they teach them back.",
        },
      ],
    },
    workspaceContext: {
      mode: "learn",
      mapId: map.mapId,
      claimId: claim.claimId,
      breadcrumb: [
        {
          kind: "map",
          id: map.mapId,
          label: "Learn view map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Users retain concepts better when they teach them back.",
        },
      ],
      breadcrumbItems: [
        {
          kind: "map",
          id: map.mapId,
          label: "Learn view map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Users retain concepts better when they teach them back.",
        },
      ],
    },
    selectedMapId: map.mapId,
    selectedClaimId: claim.claimId,
    selectedClaim: {
      id: claim.claimId,
      mapId: map.mapId,
      userId,
      body: "Users retain concepts better when they teach them back.",
      confidenceBps: 0,
      createdAt: learnView.selectedClaim?.createdAt ?? "",
      updatedAt: learnView.selectedClaim?.updatedAt ?? "",
    },
    learnState: {
      status: "placeholder",
      message: "Learn mode coming soon",
    },
    status: "placeholder",
    message: "Learn mode coming soon",
  });
});
