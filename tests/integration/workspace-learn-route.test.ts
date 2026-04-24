import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { GET } from "../../apps/web/app/api/workspace/learn/route";

const PG_PORT = 62000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_workspace_learn_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-learn-route-"));

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

test("GET /api/workspace/learn returns shell context, selected IDs, and a placeholder learn payload", async () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  const mapId = "00000000-0000-0000-0000-000000000321";
  const claimId = "00000000-0000-0000-0000-000000000456";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Learn map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values (${claimId}, ${mapId}, ${userId}, ${"Selected learn claim"}, ${4700})
    `;

    await sql`
      insert into workspace_contexts (user_id, map_id, claim_id, mode)
      values (${userId}, ${mapId}, ${claimId}, ${"learn"})
    `;

    const response = await GET(
      new Request("http://localhost/api/workspace/learn", {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      shellContext: {
        mode: string;
        mapId: string | null;
        claimId: string | null;
        breadcrumbItems: Array<{
          kind: string;
          id: string;
          label: string;
        }>;
      };
      selectedMapId: string | null;
      selectedClaimId: string | null;
      learnState: {
        status: string;
        message: string;
      };
    };

    assert.deepEqual(payload.shellContext, {
      mode: "learn",
      mapId,
      claimId,
      breadcrumb: [
        {
          kind: "map",
          id: mapId,
          label: "Learn map",
        },
        {
          kind: "claim",
          id: claimId,
          label: "Selected learn claim",
        },
      ],
      breadcrumbItems: [
        {
          kind: "map",
          id: mapId,
          label: "Learn map",
        },
        {
          kind: "claim",
          id: claimId,
          label: "Selected learn claim",
        },
      ],
    });

    assert.equal(payload.selectedMapId, mapId);
    assert.equal(payload.selectedClaimId, claimId);
    assert.deepEqual(payload.learnState, {
      status: "placeholder",
      message: "Learn mode coming soon",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});
