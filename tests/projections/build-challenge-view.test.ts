import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { createClaim } from "../../server/commands/create-claim.ts";
import { createMap } from "../../server/commands/create-map.ts";
import { setWorkspaceSelection } from "../../server/commands/set-workspace-selection.ts";
import { createDbClient } from "../../server/db/client.ts";
import { buildChallengeView } from "../../server/projections/build-challenge-view.ts";

const PG_PORT = 61000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_build_challenge_view_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-challenge-view-"));

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

test("buildChallengeView preserves claimId after a Brain to Challenge switch", async () => {
  const userId = "00000000-0000-0000-0000-000000000888";
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const map = await createMap(
      {
        userId,
        title: "Challenge view map",
        requestId: "challenge-view-map-request",
      },
      db,
    );

    const claim = await createClaim(
      {
        userId,
        mapId: map.mapId,
        text: "  Challenge mode should preserve this claim.  ",
        requestId: "challenge-view-claim-request",
      },
      db,
    );

    await setWorkspaceSelection(
      {
        userId,
        mode: "Brain",
        mapId: map.mapId,
        claimId: claim.claimId,
        requestId: "challenge-view-brain-selection",
      },
      db,
    );

    const roundId = "00000000-0000-0000-0000-000000000999";

    await sql`
      insert into challenge_rounds (id, map_id, claim_id, user_id, status)
      values (${roundId}, ${map.mapId}, ${claim.claimId}, ${userId}, ${"started"})
    `;

    await setWorkspaceSelection(
      {
        userId,
        mode: "Challenge",
        mapId: map.mapId,
        requestId: "challenge-view-challenge-selection",
      },
      db,
    );

    const challengeView = await buildChallengeView({ userId }, db);

    assert.deepEqual(challengeView.shellContext, {
      mode: "challenge",
      mapId: map.mapId,
      claimId: claim.claimId,
      breadcrumbItems: [
        {
          kind: "map",
          id: map.mapId,
          label: "Challenge view map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Challenge mode should preserve this claim.",
        },
      ],
    });

    assert.equal(challengeView.activeClaim?.id, claim.claimId);
    assert.equal(challengeView.activeClaim?.body, "Challenge mode should preserve this claim.");
    assert.equal(challengeView.activeChallengeRound?.id, roundId);
    assert.equal(challengeView.activeChallengeRound?.claimId, claim.claimId);
    assert.deepEqual(challengeView.critiqueState, {
      status: "not_requested",
      critiqueId: null,
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});
