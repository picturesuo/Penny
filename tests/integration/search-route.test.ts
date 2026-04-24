import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { GET } from "../../apps/web/app/api/search/route";

const PG_PORT = 63000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_search_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-search-route-"));

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

test("GET /api/search returns owned maps, claims, thoughts, and sessions for q", async () => {
  const userId = "00000000-0000-0000-0000-000000012123";
  const otherUserId = "00000000-0000-0000-0000-000000012124";
  const mapId = "00000000-0000-0000-0000-000000012321";
  const otherMapId = "00000000-0000-0000-0000-000000012322";
  const claimId = "00000000-0000-0000-0000-000000012401";
  const thoughtId = "00000000-0000-0000-0000-000000012501";
  const sessionId = "00000000-0000-0000-0000-000000012777";
  const otherSessionId = "00000000-0000-0000-0000-000000012778";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values
        (${mapId}, ${userId}, ${"Distribution memo"}),
        (${otherMapId}, ${otherUserId}, ${"Distribution from another user"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values
        (${claimId}, ${mapId}, ${userId}, ${"Distribution is the moat"}, ${7400}),
        (${"00000000-0000-0000-0000-000000012402"}, ${otherMapId}, ${otherUserId}, ${"Distribution should not leak"}, ${1200})
    `;

    await sql`
      insert into thoughts (id, user_id, session_id, map_id, raw_text, source)
      values
        (${thoughtId}, ${userId}, ${sessionId}, ${mapId}, ${"Founder note about distribution loops"}, ${"capture"}),
        (${"00000000-0000-0000-0000-000000012502"}, ${otherUserId}, ${otherSessionId}, ${otherMapId}, ${"Other distribution thought"}, ${"capture"})
    `;

    await sql`
      insert into sessions (id, user_id, token_hash, expires_at)
      values
        (${sessionId}, ${userId}, ${"search-route-session-token"}, ${"2030-01-01T00:00:00.000Z"}),
        (${otherSessionId}, ${otherUserId}, ${"search-route-other-session-token"}, ${"2030-01-01T00:00:00.000Z"})
    `;

    const response = await GET(
      new Request("http://localhost/api/search?q=distribution", {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      results: Array<{
        id: string;
        type: string;
        title: string;
        subtitle: string | null;
        confidence: number | null;
        href: string | null;
      }>;
    };

    for (const result of payload.results) {
      assert.deepEqual(Object.keys(result).sort(), ["confidence", "href", "id", "subtitle", "title", "type"]);
    }

    assert.deepEqual(
      payload.results
        .map((result) => ({
          id: result.id,
          type: result.type,
          title: result.title,
          subtitle: result.subtitle,
          confidence: result.confidence,
          href: result.href,
        }))
        .sort((left, right) => left.type.localeCompare(right.type)),
      [
        {
          id: claimId,
          type: "claim",
          title: "Distribution is the moat",
          subtitle: "Claim",
          confidence: 74,
          href: `/workspace?mapId=${mapId}&claimId=${claimId}`,
        },
        {
          id: mapId,
          type: "map",
          title: "Distribution memo",
          subtitle: "Map",
          confidence: null,
          href: `/workspace?mapId=${mapId}`,
        },
        {
          id: thoughtId,
          type: "thought",
          title: "Founder note about distribution loops",
          subtitle: "Thought from capture",
          confidence: null,
          href: `/workspace?mapId=${mapId}`,
        },
      ],
    );
    assert.ok(payload.results.every((result) => ![otherMapId, otherSessionId].includes(result.id)));

    const sessionResponse = await GET(
      new Request(`http://localhost/api/search?q=${sessionId.slice(-6)}`, {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(sessionResponse.status, 200);

    const sessionPayload = (await sessionResponse.json()) as {
      results: Array<{
        id: string;
        type: string;
        title: string;
        subtitle: string | null;
        confidence: number | null;
        href: string | null;
      }>;
    };

    assert.deepEqual(sessionPayload.results, [
      {
        id: sessionId,
        type: "session",
        title: "Session 00000000",
        subtitle: "Expires 2030-01-01T00:00:00.000Z",
        confidence: null,
        href: null,
      },
    ]);
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("GET /api/search returns no results for blank q", async () => {
  const response = await GET(
    new Request("http://localhost/api/search?q=   ", {
      method: "GET",
      headers: {
        "x-user-id": "00000000-0000-0000-0000-000000012999",
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    results: [],
  });
});
