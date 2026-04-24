import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { GET } from "../../apps/web/app/api/graph/route";

const PG_PORT = 62000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_workspace_graph_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-graph-route-"));

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

test("GET /api/graph supports mapId, sessionId, and type filters over persisted graph rows", async () => {
  const userId = "00000000-0000-0000-0000-000000003123";
  const mapId = "00000000-0000-0000-0000-000000003321";
  const otherMapId = "00000000-0000-0000-0000-000000003322";
  const sessionId = "00000000-0000-0000-0000-000000003777";
  const otherSessionId = "00000000-0000-0000-0000-000000003778";
  const thoughtNodeId = "00000000-0000-0000-0000-000000003401";
  const claimNodeId = "00000000-0000-0000-0000-000000003402";
  const supportingClaimNodeId = "00000000-0000-0000-0000-000000003403";
  const foreignNodeId = "00000000-0000-0000-0000-000000003404";
  const mapEdgeId = "00000000-0000-0000-0000-000000003501";
  const claimEdgeId = "00000000-0000-0000-0000-000000003502";
  const foreignEdgeId = "00000000-0000-0000-0000-000000003503";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into graph_nodes (id, user_id, session_id, map_id, kind, label, metadata_json)
      values
        (
          ${thoughtNodeId},
          ${userId},
          ${sessionId},
          ${mapId},
          ${"thought"},
          ${"Founder note"},
          ${JSON.stringify({ cluster: "context", x: -20, y: 15 })}::jsonb
        ),
        (
          ${claimNodeId},
          ${userId},
          ${sessionId},
          ${mapId},
          ${"claim"},
          ${"Distribution is the moat"},
          ${JSON.stringify({ cluster: "claim", status: "selected", confidenceBps: 7400 })}::jsonb
        ),
        (
          ${supportingClaimNodeId},
          ${userId},
          ${otherSessionId},
          ${mapId},
          ${"claim"},
          ${"Network density compounds"},
          ${JSON.stringify({ cluster: "claim" })}::jsonb
        ),
        (
          ${foreignNodeId},
          ${userId},
          ${sessionId},
          ${otherMapId},
          ${"claim"},
          ${"Unrelated map claim"},
          ${JSON.stringify({ cluster: "claim" })}::jsonb
        )
    `;

    await sql`
      insert into graph_edges (id, user_id, map_id, source_node_id, target_node_id, kind, weight_bps, metadata_json)
      values
        (
          ${mapEdgeId},
          ${userId},
          ${mapId},
          ${thoughtNodeId},
          ${claimNodeId},
          ${"supports"},
          ${6400},
          ${JSON.stringify({ label: "supports", strength: 0.64 })}::jsonb
        ),
        (
          ${claimEdgeId},
          ${userId},
          ${mapId},
          ${claimNodeId},
          ${supportingClaimNodeId},
          ${"relates_to"},
          ${5100},
          ${JSON.stringify({ label: "relates to" })}::jsonb
        ),
        (
          ${foreignEdgeId},
          ${userId},
          ${otherMapId},
          ${foreignNodeId},
          ${claimNodeId},
          ${"cross_map"},
          ${3000},
          ${JSON.stringify({ label: "cross map" })}::jsonb
        )
    `;

    const mapResponse = await GET(
      new Request(`http://localhost/api/graph?mapId=${mapId}`, {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(mapResponse.status, 200);

    const mapPayload = (await mapResponse.json()) as {
      nodes: Array<{ id: string; kind: string; cluster: string }>;
      edges: Array<{ id: string; source: string; target: string; label?: string }>;
    };

    assert.deepEqual(Object.keys(mapPayload).sort(), ["edges", "nodes"]);
    assert.deepEqual(
      mapPayload.nodes.map((node) => node.id),
      [thoughtNodeId, claimNodeId, supportingClaimNodeId],
    );
    assert.deepEqual(
      mapPayload.edges.map((edge) => edge.id),
      [mapEdgeId, claimEdgeId],
    );

    const sessionResponse = await GET(
      new Request(`http://localhost/api/graph?sessionId=${sessionId}`, {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(sessionResponse.status, 200);

    const sessionPayload = (await sessionResponse.json()) as {
      nodes: Array<{ id: string }>;
      edges: Array<{ id: string }>;
    };

    assert.deepEqual(
      sessionPayload.nodes.map((node) => node.id),
      [thoughtNodeId, claimNodeId, foreignNodeId],
    );
    assert.deepEqual(
      sessionPayload.edges.map((edge) => edge.id),
      [mapEdgeId, foreignEdgeId],
    );

    const typeResponse = await GET(
      new Request(`http://localhost/api/graph?mapId=${mapId}&type=claim`, {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(typeResponse.status, 200);

    const typePayload = (await typeResponse.json()) as {
      nodes: Array<{ id: string; kind: string; status?: string; confidenceBps?: number }>;
      edges: Array<{ id: string; label?: string; strength?: number }>;
    };

    assert.deepEqual(
      typePayload.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        status: node.status ?? null,
        confidenceBps: node.confidenceBps ?? null,
      })),
      [
        {
          id: claimNodeId,
          kind: "claim",
          status: "selected",
          confidenceBps: 7400,
        },
        {
          id: supportingClaimNodeId,
          kind: "claim",
          status: null,
          confidenceBps: null,
        },
      ],
    );
    assert.deepEqual(typePayload.edges, [
      {
        id: claimEdgeId,
        source: claimNodeId,
        target: supportingClaimNodeId,
        label: "relates to",
        strength: 0.51,
      },
    ]);
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("GET /api/graph rejects invalid UUID query params", async () => {
  const response = await GET(
    new Request("http://localhost/api/graph?mapId=not-a-uuid", {
      method: "GET",
      headers: {
        "x-user-id": "00000000-0000-0000-0000-000000003999",
      },
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Invalid mapId. Expected a UUID.",
  });
});
