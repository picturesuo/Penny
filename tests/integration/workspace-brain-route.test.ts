import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { GET } from "../../apps/web/app/api/workspace/brain/route";

const PG_PORT = 59000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_workspace_brain_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-brain-route-"));

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

test("GET /api/workspace/brain returns claims and the selected claim", async () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  const mapId = "00000000-0000-0000-0000-000000000321";
  const selectedClaimId = "00000000-0000-0000-0000-000000000456";
  const otherClaimId = "00000000-0000-0000-0000-000000000654";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Brain map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values
        (${selectedClaimId}, ${mapId}, ${userId}, ${"Selected claim"}, ${5500}),
        (${otherClaimId}, ${mapId}, ${userId}, ${"Other claim"}, ${4200})
    `;

    await sql`
      insert into workspace_contexts (user_id, map_id, claim_id, mode)
      values (${userId}, ${mapId}, ${selectedClaimId}, ${"brain"})
    `;

    const response = await GET(
      new Request("http://localhost/api/workspace/brain", {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      claims: Array<{
        id: string;
        mapId: string;
        userId: string;
        body: string;
        confidenceBps: number;
        createdAt: string;
        updatedAt: string;
      }>;
      selectedClaim: {
        id: string;
        mapId: string;
        userId: string;
        body: string;
        confidenceBps: number;
        createdAt: string;
        updatedAt: string;
      } | null;
    };

    assert.equal(payload.claims.length, 2);
    assert.deepEqual(
      payload.claims.map((claim) => ({
        id: claim.id,
        body: claim.body,
        confidenceBps: claim.confidenceBps,
      })),
      [
        {
          id: selectedClaimId,
          body: "Selected claim",
          confidenceBps: 5500,
        },
        {
          id: otherClaimId,
          body: "Other claim",
          confidenceBps: 4200,
        },
      ],
    );

    assert.ok(payload.selectedClaim);
    assert.equal(payload.selectedClaim?.id, selectedClaimId);
    assert.equal(payload.selectedClaim?.body, "Selected claim");
    assert.equal(payload.selectedClaim?.confidenceBps, 5500);
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("GET /api/workspace/brain does not expose another user's selected map", async () => {
  const ownerUserId = "00000000-0000-0000-0000-000000001123";
  const otherUserId = "00000000-0000-0000-0000-000000001124";
  const mapId = "00000000-0000-0000-0000-000000001321";
  const claimId = "00000000-0000-0000-0000-000000001456";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${ownerUserId}, ${"Owner-only Brain map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values (${claimId}, ${mapId}, ${ownerUserId}, ${"Owner-only claim"}, ${5800})
    `;

    await sql`
      insert into workspace_contexts (user_id, map_id, claim_id, mode)
      values (${otherUserId}, ${mapId}, ${claimId}, ${"brain"})
    `;

    const response = await GET(
      new Request("http://localhost/api/workspace/brain", {
        method: "GET",
        headers: {
          "x-user-id": otherUserId,
        },
      }),
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      currentContext: {
        mode: string;
        mapId: string | null;
        claimId: string | null;
      };
      mapSummary: { id: string } | null;
      claims: Array<{ id: string; mapId: string; userId: string }>;
      selectedClaim: { id: string } | null;
    };

    assert.deepEqual(payload.currentContext, {
      mode: "brain",
      mapId: null,
      claimId: null,
    });
    assert.equal(payload.mapSummary, null);
    assert.deepEqual(payload.claims, []);
    assert.equal(payload.selectedClaim, null);
  } finally {
    await sql.end({ timeout: 1 });
  }
});
