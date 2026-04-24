import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { GET } from "../../apps/web/app/api/workspace/challenge/route";

const PG_PORT = 60000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_workspace_challenge_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-challenge-route-"));

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

test("GET /api/workspace/challenge returns the selected claim and latest challenge round", async () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  const mapId = "00000000-0000-0000-0000-000000000321";
  const claimId = "00000000-0000-0000-0000-000000000456";
  const olderRoundId = "00000000-0000-0000-0000-000000000654";
  const latestRoundId = "00000000-0000-0000-0000-000000000777";
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
      insert into challenge_rounds (id, map_id, claim_id, user_id, status, created_at, updated_at)
      values
        (${olderRoundId}, ${mapId}, ${claimId}, ${userId}, ${"queued"}, ${"2026-04-23T22:40:00.000Z"}, ${"2026-04-23T22:40:00.000Z"}),
        (${latestRoundId}, ${mapId}, ${claimId}, ${userId}, ${"ready"}, ${"2026-04-23T22:41:00.000Z"}, ${"2026-04-23T22:41:00.000Z"})
    `;

    await sql`
      insert into workspace_contexts (user_id, map_id, claim_id, mode)
      values (${userId}, ${mapId}, ${claimId}, ${"challenge"})
    `;

    const response = await GET(
      new Request("http://localhost/api/workspace/challenge", {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      selectedClaim: {
        id: string;
        mapId: string;
        userId: string;
        body: string;
        confidenceBps: number;
        createdAt: string;
        updatedAt: string;
      } | null;
      challengeRound: {
        id: string;
        mapId: string;
        claimId: string;
        userId: string;
        status: string;
        createdAt: string;
        updatedAt: string;
      } | null;
    };

    assert.ok(payload.selectedClaim);
    assert.equal(payload.selectedClaim?.id, claimId);
    assert.equal(payload.selectedClaim?.body, "Selected challenge claim");
    assert.equal(payload.selectedClaim?.confidenceBps, 6300);

    assert.ok(payload.challengeRound);
    assert.equal(payload.challengeRound?.id, latestRoundId);
    assert.equal(payload.challengeRound?.claimId, claimId);
    assert.equal(payload.challengeRound?.status, "ready");
  } finally {
    await sql.end({ timeout: 1 });
  }
});
