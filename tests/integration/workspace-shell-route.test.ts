import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { GET } from "../../apps/web/app/api/workspace/shell/route";

const PG_PORT = 58000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_workspace_shell_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-shell-route-"));

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

test("GET /api/workspace/shell returns the current workspace context", async () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  const mapId = "00000000-0000-0000-0000-000000000321";
  const claimId = "00000000-0000-0000-0000-000000000456";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Shell map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values (${claimId}, ${mapId}, ${userId}, ${"Shell claim"}, ${5500})
    `;

    await sql`
      insert into workspace_contexts (user_id, map_id, claim_id, mode)
      values (${userId}, ${mapId}, ${claimId}, ${"challenge"})
    `;

    const response = await GET(
      new Request("http://localhost/api/workspace/shell", {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      mode: string;
      mapId: string | null;
      claimId: string | null;
      breadcrumbItems: Array<{
        kind: string;
        id: string;
        label: string;
      }>;
    };

    assert.deepEqual(payload, {
      mode: "challenge",
      mapId,
      claimId,
      breadcrumbItems: [
        {
          kind: "map",
          id: mapId,
          label: "Shell map",
        },
        {
          kind: "claim",
          id: claimId,
          label: "Shell claim",
        },
      ],
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("workspace context preserves mapId and claimId when mode switches from brain to challenge", async () => {
  const userId = "00000000-0000-0000-0000-000000000124";
  const mapId = "00000000-0000-0000-0000-000000000654";
  const claimId = "00000000-0000-0000-0000-000000000655";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Critical workspace map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values (${claimId}, ${mapId}, ${userId}, ${"Critical workspace claim"}, ${6400})
    `;

    await sql`
      insert into workspace_contexts (user_id, map_id, claim_id, mode)
      values (${userId}, ${mapId}, ${claimId}, ${"brain"})
    `;

    await sql`
      update workspace_contexts
      set mode = ${"challenge"}, updated_at = now()
      where user_id = ${userId}
    `;

    const response = await GET(
      new Request("http://localhost/api/workspace/shell", {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      mode: string;
      mapId: string | null;
      claimId: string | null;
    };

    assert.equal(payload.mode, "challenge");
    assert.equal(payload.mapId, mapId);
    assert.equal(payload.claimId, claimId);
  } finally {
    await sql.end({ timeout: 1 });
  }
});
