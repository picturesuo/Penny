import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { GET as getActivity } from "../../apps/web/app/api/activity/route";
import { GET as getClaims } from "../../apps/web/app/api/claims/route";
import { GET as getThoughts } from "../../apps/web/app/api/thoughts/route";

const PG_PORT = 63000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_list_pagination_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-list-pagination-route-"));

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

test("list routes return bounded offset pagination metadata", async () => {
  const userId = "00000000-0000-0000-0000-000000016001";
  const mapId = "00000000-0000-0000-0000-000000016101";
  const thoughtIds = ["00000000-0000-0000-0000-000000016201", "00000000-0000-0000-0000-000000016202"];
  const claimIds = ["00000000-0000-0000-0000-000000016301", "00000000-0000-0000-0000-000000016302"];
  const activityIds = ["00000000-0000-0000-0000-000000016401", "00000000-0000-0000-0000-000000016402"];
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Pagination map"})
    `;

    await sql`
      insert into thoughts (id, user_id, map_id, raw_text, source, created_at, updated_at)
      values
        (${thoughtIds[0]}, ${userId}, ${mapId}, ${"Older thought"}, ${"capture"}, ${"2026-01-01T00:00:00.000Z"}, ${"2026-01-01T00:00:00.000Z"}),
        (${thoughtIds[1]}, ${userId}, ${mapId}, ${"Newer thought"}, ${"capture"}, ${"2026-01-02T00:00:00.000Z"}, ${"2026-01-02T00:00:00.000Z"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, thought_id, body, confidence_bps, created_at, updated_at)
      values
        (${claimIds[0]}, ${mapId}, ${userId}, ${thoughtIds[0]}, ${"Older claim"}, ${6400}, ${"2026-01-01T00:00:00.000Z"}, ${"2026-01-01T00:00:00.000Z"}),
        (${claimIds[1]}, ${mapId}, ${userId}, ${thoughtIds[1]}, ${"Newer claim"}, ${7400}, ${"2026-01-02T00:00:00.000Z"}, ${"2026-01-02T00:00:00.000Z"})
    `;

    await sql`
      insert into activity_events (id, user_id, map_id, claim_id, aggregate_type, aggregate_id, type, payload_json, created_at)
      values
        (${activityIds[0]}, ${userId}, ${mapId}, ${claimIds[0]}, ${"claim"}, ${claimIds[0]}, ${"claim.created"}, ${JSON.stringify({ order: "older" })}::jsonb, ${"2026-01-01T00:00:00.000Z"}),
        (${activityIds[1]}, ${userId}, ${mapId}, ${claimIds[1]}, ${"claim"}, ${claimIds[1]}, ${"claim.created"}, ${JSON.stringify({ order: "newer" })}::jsonb, ${"2026-01-02T00:00:00.000Z"})
    `;

    const headers = { "x-user-id": userId };
    const thoughtsResponse = await getThoughts(
      new Request(`http://localhost/api/thoughts?mapId=${mapId}&limit=1&offset=1`, { headers }),
    );
    const claimsResponse = await getClaims(
      new Request(`http://localhost/api/claims?mapId=${mapId}&limit=1&offset=1`, { headers }),
    );
    const activityResponse = await getActivity(
      new Request(`http://localhost/api/activity?mapId=${mapId}&limit=1&offset=1`, { headers }),
    );

    assert.equal(thoughtsResponse.status, 200);
    assert.equal(claimsResponse.status, 200);
    assert.equal(activityResponse.status, 200);

    assert.deepEqual(await thoughtsResponse.json(), {
      thoughts: [
        {
          id: thoughtIds[0],
          sessionId: null,
          mapId,
          rawText: "Older thought",
          source: "capture",
          metadataJson: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      pagination: { limit: 1, offset: 1, nextOffset: 2 },
    });

    assert.deepEqual(await claimsResponse.json(), {
      claims: [
        {
          id: claimIds[0],
          mapId,
          thoughtId: thoughtIds[0],
          body: "Older claim",
          confidenceBps: 6400,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      pagination: { limit: 1, offset: 1, nextOffset: 2 },
    });

    assert.deepEqual(await activityResponse.json(), {
      activity: [
        {
          id: activityIds[0],
          sessionId: null,
          mapId,
          thoughtId: null,
          claimId: claimIds[0],
          graphNodeId: null,
          graphEdgeId: null,
          confidenceRatingId: null,
          promptVersionId: null,
          aiJobId: null,
          aggregateType: "claim",
          aggregateId: claimIds[0],
          type: "claim.created",
          payloadJson: { order: "older" },
          requestId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      pagination: { limit: 1, offset: 1, nextOffset: 2 },
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("list routes reject invalid pagination", async () => {
  const headers = { "x-user-id": "00000000-0000-0000-0000-000000016999" };
  const thoughtsResponse = await getThoughts(new Request("http://localhost/api/thoughts?limit=101", { headers }));
  const claimsResponse = await getClaims(new Request("http://localhost/api/claims?offset=-1", { headers }));
  const activityResponse = await getActivity(new Request("http://localhost/api/activity?limit=0", { headers }));

  assert.equal(thoughtsResponse.status, 400);
  assert.equal(claimsResponse.status, 400);
  assert.equal(activityResponse.status, 400);
});
