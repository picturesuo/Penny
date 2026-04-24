import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { GET as listSessions } from "../../apps/web/app/api/sessions/route.ts";
import { GET as listThoughts } from "../../apps/web/app/api/thoughts/route.ts";

const PG_PORT = 64000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_session_thoughts_mvp_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-session-thoughts-mvp-"));

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

test("MVP sessions and thoughts can be created, read, listed, updated, and projected into graph nodes", async () => {
  const sql = postgres(databaseUrl, { prepare: false });
  const userId = "00000000-0000-0000-0000-000000017001";
  const sessionId = "00000000-0000-0000-0000-000000017101";
  const mapId = "00000000-0000-0000-0000-000000017201";
  const thoughtId = "00000000-0000-0000-0000-000000017301";
  const headers = { "x-user-id": userId };

  try {
    await sql`
      insert into users (id, email, display_name)
      values (${userId}, ${"session-thoughts@example.com"}, ${"Session Thoughts"})
    `;
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Session thoughts map"})
    `;

    await sql`
      insert into sessions (id, user_id, token_hash, expires_at, created_at, updated_at)
      values (
        ${sessionId},
        ${userId},
        ${"session-thoughts-token-hash"},
        ${"2026-12-31T00:00:00.000Z"},
        ${"2026-04-24T10:00:00.000Z"},
        ${"2026-04-24T10:00:00.000Z"}
      )
    `;

    const listedSessionsResponse = await listSessions(new Request("http://localhost/api/sessions", { headers }));
    assert.equal(listedSessionsResponse.status, 200);
    assert.deepEqual(await listedSessionsResponse.json(), {
      sessions: [
        {
          id: sessionId,
          expiresAt: "2026-12-31T00:00:00.000Z",
          revokedAt: null,
          createdAt: "2026-04-24T10:00:00.000Z",
          updatedAt: "2026-04-24T10:00:00.000Z",
        },
      ],
    });

    const retrievedSessions = await sql<
      { id: string; user_id: string; token_hash: string; expires_at: Date; revoked_at: Date | null }[]
    >`select id, user_id, token_hash, expires_at, revoked_at from sessions where id = ${sessionId} and user_id = ${userId}`;
    assert.equal(retrievedSessions.length, 1);
    assert.equal(retrievedSessions[0].id, sessionId);
    assert.equal(retrievedSessions[0].user_id, userId);
    assert.equal(retrievedSessions[0].token_hash, "session-thoughts-token-hash");
    assert.equal(retrievedSessions[0].revoked_at, null);

    await sql`
      insert into thoughts (id, user_id, session_id, map_id, raw_text, source, metadata_json, created_at, updated_at)
      values (
        ${thoughtId},
        ${userId},
        ${sessionId},
        ${mapId},
        ${"First session-linked thought"},
        ${"manual"},
        ${JSON.stringify({ suggestedTitle: "Session-linked thought" })}::jsonb,
        ${"2026-04-24T10:01:00.000Z"},
        ${"2026-04-24T10:01:00.000Z"}
      )
    `;

    const listedThoughtsResponse = await listThoughts(
      new Request(`http://localhost/api/thoughts?sessionId=${sessionId}`, { headers }),
    );
    assert.equal(listedThoughtsResponse.status, 200);
    assert.deepEqual(await listedThoughtsResponse.json(), {
      thoughts: [
        {
          id: thoughtId,
          sessionId,
          mapId,
          rawText: "First session-linked thought",
          source: "manual",
          metadataJson: { suggestedTitle: "Session-linked thought" },
          createdAt: "2026-04-24T10:01:00.000Z",
          updatedAt: "2026-04-24T10:01:00.000Z",
        },
      ],
      pagination: {
        limit: 50,
        offset: 0,
        nextOffset: null,
      },
    });

    await sql`
      update thoughts
      set raw_text = ${"Updated session-linked thought"}, updated_at = ${"2026-04-24T10:02:00.000Z"}
      where id = ${thoughtId} and user_id = ${userId}
    `;

    const retrievedThoughts = await sql<
      { id: string; user_id: string; session_id: string | null; map_id: string | null; raw_text: string; source: string | null; updated_at: Date }[]
    >`select id, user_id, session_id, map_id, raw_text, source, updated_at from thoughts where id = ${thoughtId} and user_id = ${userId}`;
    assert.equal(retrievedThoughts.length, 1);
    assert.equal(retrievedThoughts[0].id, thoughtId);
    assert.equal(retrievedThoughts[0].session_id, sessionId);
    assert.equal(retrievedThoughts[0].map_id, mapId);
    assert.equal(retrievedThoughts[0].raw_text, "Updated session-linked thought");
    assert.equal(retrievedThoughts[0].source, "manual");

    const graphNodes = await sql<
      { user_id: string; session_id: string | null; map_id: string; thought_id: string | null; kind: string; label: string; metadata_json: { source?: string } | null }[]
    >`select user_id, session_id, map_id, thought_id, kind, label, metadata_json from graph_nodes where thought_id = ${thoughtId}`;
    assert.equal(graphNodes.length, 1);
    assert.equal(graphNodes[0].user_id, userId);
    assert.equal(graphNodes[0].session_id, sessionId);
    assert.equal(graphNodes[0].map_id, mapId);
    assert.equal(graphNodes[0].thought_id, thoughtId);
    assert.equal(graphNodes[0].kind, "thought");
    assert.equal(graphNodes[0].label, "First session-linked thought");
    assert.equal(graphNodes[0].metadata_json?.source, "data-consistency-trigger");
  } finally {
    await sql.end({ timeout: 1 });
  }
});
