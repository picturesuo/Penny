import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { POST as createGraphEdge } from "../../apps/web/app/api/graph/edges/route";

const PG_PORT = 62000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_graph_edge_validation_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-graph-edge-validation-"));

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

type EdgeKind = "supports" | "depends_on" | "contradicts";

const missingSourceNodeId = "00000000-0000-0000-0000-000000042499";
const missingTargetNodeId = "00000000-0000-0000-0000-000000042498";

type GraphEdgeFixture = {
  userId: string;
  mapId: string;
  sourceNodeId: string;
  targetNodeId: string;
};

async function seedValidGraphNodes(): Promise<GraphEdgeFixture> {
  const fixture = {
    userId: randomUUID(),
    mapId: randomUUID(),
    sourceNodeId: randomUUID(),
    targetNodeId: randomUUID(),
  };
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into graph_nodes (id, user_id, map_id, kind, label, metadata_json)
      values
        (${fixture.sourceNodeId}, ${fixture.userId}, ${fixture.mapId}, ${"thought"}, ${"Source thought"}, ${JSON.stringify({ cluster: "context" })}::jsonb),
        (${fixture.targetNodeId}, ${fixture.userId}, ${fixture.mapId}, ${"claim"}, ${"Target claim"}, ${JSON.stringify({ cluster: "claim" })}::jsonb)
    `;
  } finally {
    await sql.end({ timeout: 1 });
  }

  return fixture;
}

function edgeRequest(fixture: GraphEdgeFixture, body: Record<string, unknown>) {
  return new Request("http://localhost/api/graph/edges", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": fixture.userId,
    },
    body: JSON.stringify(body),
  });
}

async function createEdge(fixture: GraphEdgeFixture, kind: EdgeKind, suffix: string) {
  return createGraphEdge(
    edgeRequest(fixture, {
      sourceNodeId: fixture.sourceNodeId,
      targetNodeId: fixture.targetNodeId,
      type: kind,
      mapId: fixture.mapId,
      weightBps: 7000,
      metadata: {
        label: kind,
        testCase: suffix,
      },
    }),
  );
}

test("graph edge validation starts from two valid graph nodes", async () => {
  const fixture = await seedValidGraphNodes();

  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count
      from graph_nodes
      where user_id = ${fixture.userId}
        and map_id = ${fixture.mapId}
        and id in (${fixture.sourceNodeId}, ${fixture.targetNodeId})
    `;

    assert.equal(rows[0]?.count, "2");
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("POST /api/graph/edges creates a valid graph edge", async () => {
  const fixture = await seedValidGraphNodes();

  const response = await createEdge(fixture, "supports", "valid-edge");

  assert.equal(response.status, 201);

  const payload = (await response.json()) as {
    edge: {
      source: string;
      target: string;
      kind: string;
      label: string;
      weightBps: number;
    };
  };

  assert.deepEqual(
    {
      source: payload.edge.source,
      target: payload.edge.target,
      kind: payload.edge.kind,
      label: payload.edge.label,
      weightBps: payload.edge.weightBps,
    },
    {
      source: fixture.sourceNodeId,
      target: fixture.targetNodeId,
      kind: "supports",
      label: "supports",
      weightBps: 7000,
    },
  );
});

test("POST /api/graph/edges accepts supports edge type", async () => {
  const fixture = await seedValidGraphNodes();

  const response = await createEdge(fixture, "supports", "supports-type");
  const payload = (await response.json()) as { edge: { kind: string } };

  assert.equal(response.status, 201);
  assert.equal(payload.edge.kind, "supports");
});

test("POST /api/graph/edges accepts depends_on edge type", async () => {
  const fixture = await seedValidGraphNodes();

  const response = await createEdge(fixture, "depends_on", "depends-on-type");
  const payload = (await response.json()) as { edge: { kind: string } };

  assert.equal(response.status, 201);
  assert.equal(payload.edge.kind, "depends_on");
});

test("POST /api/graph/edges accepts contradicts edge type", async () => {
  const fixture = await seedValidGraphNodes();

  const response = await createEdge(fixture, "contradicts", "contradicts-type");
  const payload = (await response.json()) as { edge: { kind: string } };

  assert.equal(response.status, 201);
  assert.equal(payload.edge.kind, "contradicts");
});

test("POST /api/graph/edges rejects a missing source node", async () => {
  const fixture = await seedValidGraphNodes();

  const response = await createGraphEdge(
    edgeRequest(fixture, {
      sourceNodeId: missingSourceNodeId,
      targetNodeId: fixture.targetNodeId,
      type: "supports",
      mapId: fixture.mapId,
    }),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "Source or target graph node not found.",
  });
});

test("POST /api/graph/edges rejects a missing target node", async () => {
  const fixture = await seedValidGraphNodes();

  const response = await createGraphEdge(
    edgeRequest(fixture, {
      sourceNodeId: fixture.sourceNodeId,
      targetNodeId: missingTargetNodeId,
      type: "supports",
      mapId: fixture.mapId,
    }),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "Source or target graph node not found.",
  });
});

test("POST /api/graph/edges dedupes duplicate edges", async () => {
  const fixture = await seedValidGraphNodes();

  const firstResponse = await createEdge(fixture, "supports", "dedupe");
  const secondResponse = await createEdge(fixture, "supports", "dedupe");
  const firstPayload = (await firstResponse.json()) as { edge: { id: string } };
  const secondPayload = (await secondResponse.json()) as { edge: { id: string } };
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count
      from graph_edges
      where user_id = ${fixture.userId}
        and source_node_id = ${fixture.sourceNodeId}
        and target_node_id = ${fixture.targetNodeId}
        and kind = ${"supports"}
    `;

    assert.equal(firstResponse.status, 201);
    assert.equal(secondResponse.status, 200);
    assert.equal(secondPayload.edge.id, firstPayload.edge.id);
    assert.equal(rows[0]?.count, "1");
  } finally {
    await sql.end({ timeout: 1 });
  }
});
