import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { GET } from "../../apps/web/app/api/graph/route";
import { POST as createGraphEdge } from "../../apps/web/app/api/graph/edges/route";
import { DELETE as deleteGraphEdge, PATCH as updateGraphEdge } from "../../apps/web/app/api/graph/edges/[id]/route";
import { GET as getNodeDetail } from "../../apps/web/app/api/graph/nodes/[id]/detail/route";

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

test("graph edges cannot reference missing graph nodes", async () => {
  const userId = "00000000-0000-0000-0000-000000004023";
  const mapId = "00000000-0000-0000-0000-000000004024";
  const sourceNodeId = "00000000-0000-0000-0000-000000004025";
  const missingNodeId = "00000000-0000-0000-0000-000000004026";
  const edgeId = "00000000-0000-0000-0000-000000004027";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into graph_nodes (id, user_id, map_id, kind, label)
      values (${sourceNodeId}, ${userId}, ${mapId}, ${"claim"}, ${"Existing node"})
    `;

    await assert.rejects(
      () =>
        sql`
          insert into graph_edges (id, user_id, map_id, source_node_id, target_node_id, kind)
          values (${edgeId}, ${userId}, ${mapId}, ${sourceNodeId}, ${missingNodeId}, ${"supports"})
        `,
      (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23503",
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("deleting thoughts and claims removes or updates graph edges safely", async () => {
  const userId = "00000000-0000-0000-0000-000000004033";
  const mapId = "00000000-0000-0000-0000-000000004034";
  const thoughtId = "00000000-0000-0000-0000-000000004035";
  const claimId = "00000000-0000-0000-0000-000000004036";
  const thoughtNodeId = "00000000-0000-0000-0000-000000004037";
  const claimNodeId = "00000000-0000-0000-0000-000000004038";
  const supportingNodeId = "00000000-0000-0000-0000-000000004039";
  const thoughtEdgeId = "00000000-0000-0000-0000-000000004040";
  const claimEdgeId = "00000000-0000-0000-0000-000000004041";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into thoughts (id, user_id, map_id, raw_text, source)
      values (${thoughtId}, ${userId}, ${mapId}, ${"Thought connected to a claim."}, ${"test"})
    `;
    await sql`
      insert into claims (id, user_id, map_id, thought_id, body, confidence_bps)
      values (${claimId}, ${userId}, ${mapId}, ${thoughtId}, ${"Claim connected to the thought."}, ${7000})
    `;
    await sql`
      insert into graph_nodes (id, user_id, map_id, thought_id, kind, label)
      values (${thoughtNodeId}, ${userId}, ${mapId}, ${thoughtId}, ${"thought"}, ${"Thought node"})
      on conflict (thought_id) where thought_id is not null and kind = 'thought'
      do update set id = excluded.id
    `;
    await sql`
      insert into graph_nodes (id, user_id, map_id, claim_id, thought_id, kind, label)
      values (${claimNodeId}, ${userId}, ${mapId}, ${claimId}, ${thoughtId}, ${"claim"}, ${"Claim node"})
      on conflict (claim_id) where claim_id is not null and kind = 'claim'
      do update set id = excluded.id
    `;
    await sql`
      insert into graph_nodes (id, user_id, map_id, kind, label)
      values (${supportingNodeId}, ${userId}, ${mapId}, ${"claim"}, ${"Supporting node"})
    `;
    await sql`
      insert into graph_edges (id, user_id, map_id, source_node_id, target_node_id, kind)
      values
        (${thoughtEdgeId}, ${userId}, ${mapId}, ${thoughtNodeId}, ${claimNodeId}, ${"extracted_claim"}),
        (${claimEdgeId}, ${userId}, ${mapId}, ${claimNodeId}, ${supportingNodeId}, ${"supports"})
    `;

    await sql`delete from thoughts where id = ${thoughtId}`;

    const afterThoughtDelete = await sql<
      { thought_nodes: string; claim_nodes_with_thought: string; claims_with_thought: string; thought_edges: string; claim_edges: string }[]
    >`
      select
        (select count(*)::text from graph_nodes where id = ${thoughtNodeId}) as thought_nodes,
        (select count(*)::text from graph_nodes where id = ${claimNodeId} and thought_id is not null) as claim_nodes_with_thought,
        (select count(*)::text from claims where id = ${claimId} and thought_id is not null) as claims_with_thought,
        (select count(*)::text from graph_edges where id = ${thoughtEdgeId}) as thought_edges,
        (select count(*)::text from graph_edges where id = ${claimEdgeId}) as claim_edges
    `;

    assert.deepEqual(afterThoughtDelete[0], {
      thought_nodes: "0",
      claim_nodes_with_thought: "0",
      claims_with_thought: "0",
      thought_edges: "0",
      claim_edges: "1",
    });

    await sql`delete from claims where id = ${claimId}`;

    const afterClaimDelete = await sql<{ claim_nodes: string; claim_edges: string }[]>`
      select
        (select count(*)::text from graph_nodes where id = ${claimNodeId}) as claim_nodes,
        (select count(*)::text from graph_edges where id = ${claimEdgeId}) as claim_edges
    `;

    assert.deepEqual(afterClaimDelete[0], {
      claim_nodes: "0",
      claim_edges: "0",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("GET /api/graph/nodes/:id/detail returns owned node detail with edges and confidence", async () => {
  const userId = "00000000-0000-0000-0000-000000004123";
  const otherUserId = "00000000-0000-0000-0000-000000004124";
  const mapId = "00000000-0000-0000-0000-000000004321";
  const sourceNodeId = "00000000-0000-0000-0000-000000004401";
  const targetNodeId = "00000000-0000-0000-0000-000000004402";
  const outgoingNodeId = "00000000-0000-0000-0000-000000004403";
  const otherUserNodeId = "00000000-0000-0000-0000-000000004404";
  const incomingEdgeId = "00000000-0000-0000-0000-000000004501";
  const outgoingEdgeId = "00000000-0000-0000-0000-000000004502";
  const ratingId = "00000000-0000-0000-0000-000000004601";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into graph_nodes (id, user_id, map_id, kind, label, metadata_json)
      values
        (
          ${sourceNodeId},
          ${userId},
          ${mapId},
          ${"thought"},
          ${"Source thought"},
          ${JSON.stringify({ cluster: "context" })}::jsonb
        ),
        (
          ${targetNodeId},
          ${userId},
          ${mapId},
          ${"claim"},
          ${"Detailed claim"},
          ${JSON.stringify({ cluster: "claim", status: "selected", confidenceBps: 8100, description: "Primary inspected node" })}::jsonb
        ),
        (
          ${outgoingNodeId},
          ${userId},
          ${mapId},
          ${"claim"},
          ${"Related claim"},
          ${JSON.stringify({ cluster: "claim" })}::jsonb
        ),
        (
          ${otherUserNodeId},
          ${otherUserId},
          ${mapId},
          ${"claim"},
          ${"Other user claim"},
          ${JSON.stringify({ cluster: "claim" })}::jsonb
        )
    `;

    await sql`
      insert into graph_edges (id, user_id, map_id, source_node_id, target_node_id, kind, weight_bps, metadata_json)
      values
        (
          ${incomingEdgeId},
          ${userId},
          ${mapId},
          ${sourceNodeId},
          ${targetNodeId},
          ${"supports"},
          ${6800},
          ${JSON.stringify({ label: "supports" })}::jsonb
        ),
        (
          ${outgoingEdgeId},
          ${userId},
          ${mapId},
          ${targetNodeId},
          ${outgoingNodeId},
          ${"depends_on"},
          ${7200},
          ${JSON.stringify({ label: "depends on", status: "active" })}::jsonb
        )
    `;

    await sql`
      insert into confidence_ratings (id, user_id, graph_node_id, rating_bps, rationale, source)
      values (${ratingId}, ${userId}, ${targetNodeId}, ${8100}, ${"The claim is backed by repeated founder notes."}, ${"manual"})
    `;

    const response = await getNodeDetail(
      new Request(`http://localhost/api/graph/nodes/${targetNodeId}/detail`, {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
      { params: { id: targetNodeId } },
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      node: {
        id: string;
        mapId: string;
        kind: string;
        label: string;
        cluster: string;
        status?: string;
        confidenceBps?: number;
        description?: string;
      };
      incomingEdges: Array<{ id: string; source: string; target: string; label: string; strength: number }>;
      outgoingEdges: Array<{ id: string; source: string; target: string; label: string; status?: string; strength: number }>;
      confidenceRatings: Array<{ id: string; ratingBps: number; rationale: string | null; source: string }>;
    };

    assert.deepEqual(payload.node, {
      id: targetNodeId,
      sessionId: null,
      mapId,
      claimId: null,
      thoughtId: null,
      label: "Detailed claim",
      kind: "claim",
      cluster: "claim",
      description: "Primary inspected node",
      status: "selected",
      confidenceBps: 8100,
      metadata: {
        cluster: "claim",
        status: "selected",
        confidenceBps: 8100,
        description: "Primary inspected node",
      },
      createdAt: payload.node.createdAt,
      updatedAt: payload.node.updatedAt,
    });
    assert.deepEqual(
      payload.incomingEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        strength: edge.strength,
      })),
      [
        {
          id: incomingEdgeId,
          source: sourceNodeId,
          target: targetNodeId,
          label: "supports",
          strength: 0.68,
        },
      ],
    );
    assert.deepEqual(
      payload.outgoingEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        status: edge.status ?? null,
        strength: edge.strength,
      })),
      [
        {
          id: outgoingEdgeId,
          source: targetNodeId,
          target: outgoingNodeId,
          label: "depends on",
          status: "active",
          strength: 0.72,
        },
      ],
    );
    assert.deepEqual(
      payload.confidenceRatings.map((rating) => ({
        id: rating.id,
        ratingBps: rating.ratingBps,
        rationale: rating.rationale,
        source: rating.source,
      })),
      [
        {
          id: ratingId,
          ratingBps: 8100,
          rationale: "The claim is backed by repeated founder notes.",
          source: "manual",
        },
      ],
    );

    const forbiddenResponse = await getNodeDetail(
      new Request(`http://localhost/api/graph/nodes/${otherUserNodeId}/detail`, {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
      { params: { id: otherUserNodeId } },
    );

    assert.equal(forbiddenResponse.status, 404);
    assert.deepEqual(await forbiddenResponse.json(), {
      error: "Graph node not found.",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("GET /api/graph/nodes/:id/detail rejects invalid node ids", async () => {
  const response = await getNodeDetail(
    new Request("http://localhost/api/graph/nodes/not-a-uuid/detail", {
      method: "GET",
      headers: {
        "x-user-id": "00000000-0000-0000-0000-000000004999",
      },
    }),
    { params: { id: "not-a-uuid" } },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Invalid node id. Expected a UUID.",
  });
});

test("POST /api/graph/edges creates an owned edge and replays duplicates", async () => {
  const userId = "00000000-0000-0000-0000-000000005123";
  const mapId = "00000000-0000-0000-0000-000000005321";
  const sourceNodeId = "00000000-0000-0000-0000-000000005401";
  const targetNodeId = "00000000-0000-0000-0000-000000005402";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into graph_nodes (id, user_id, map_id, kind, label, metadata_json)
      values
        (${sourceNodeId}, ${userId}, ${mapId}, ${"thought"}, ${"Source edge thought"}, ${JSON.stringify({ cluster: "context" })}::jsonb),
        (${targetNodeId}, ${userId}, ${mapId}, ${"claim"}, ${"Target edge claim"}, ${JSON.stringify({ cluster: "claim" })}::jsonb)
    `;

    const requestBody = {
      sourceNodeId,
      targetNodeId,
      type: "supports",
      mapId,
      weightBps: 6900,
      metadata: {
        label: "supports",
        status: "suggested",
      },
    };
    const firstResponse = await createGraphEdge(
      new Request("http://localhost/api/graph/edges", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify(requestBody),
      }),
    );

    assert.equal(firstResponse.status, 201);

    const firstPayload = (await firstResponse.json()) as {
      edge: {
        id: string;
        source: string;
        target: string;
        kind: string;
        label: string;
        status?: string;
        strength: number;
        weightBps: number;
      };
    };

    assert.match(firstPayload.edge.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(
      {
        source: firstPayload.edge.source,
        target: firstPayload.edge.target,
        kind: firstPayload.edge.kind,
        label: firstPayload.edge.label,
        status: firstPayload.edge.status,
        strength: firstPayload.edge.strength,
        weightBps: firstPayload.edge.weightBps,
      },
      {
        source: sourceNodeId,
        target: targetNodeId,
        kind: "supports",
        label: "supports",
        status: "suggested",
        strength: 0.69,
        weightBps: 6900,
      },
    );

    const storedRows = await sql<{ count: string }[]>`
      select count(*)::text as count
      from graph_edges
      where user_id = ${userId}
        and source_node_id = ${sourceNodeId}
        and target_node_id = ${targetNodeId}
        and kind = ${"supports"}
    `;

    assert.equal(storedRows[0]?.count, "1");

    const replayResponse = await createGraphEdge(
      new Request("http://localhost/api/graph/edges", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify(requestBody),
      }),
    );

    assert.equal(replayResponse.status, 200);

    const replayPayload = (await replayResponse.json()) as { edge: { id: string } };

    assert.equal(replayPayload.edge.id, firstPayload.edge.id);
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("POST /api/graph/edges rejects cross-map and cross-user edges", async () => {
  const userId = "00000000-0000-0000-0000-000000006123";
  const otherUserId = "00000000-0000-0000-0000-000000006124";
  const mapId = "00000000-0000-0000-0000-000000006321";
  const otherMapId = "00000000-0000-0000-0000-000000006322";
  const sourceNodeId = "00000000-0000-0000-0000-000000006401";
  const otherMapNodeId = "00000000-0000-0000-0000-000000006402";
  const otherUserNodeId = "00000000-0000-0000-0000-000000006403";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into graph_nodes (id, user_id, map_id, kind, label, metadata_json)
      values
        (${sourceNodeId}, ${userId}, ${mapId}, ${"thought"}, ${"Owned source"}, ${JSON.stringify({ cluster: "context" })}::jsonb),
        (${otherMapNodeId}, ${userId}, ${otherMapId}, ${"claim"}, ${"Other map target"}, ${JSON.stringify({ cluster: "claim" })}::jsonb),
        (${otherUserNodeId}, ${otherUserId}, ${mapId}, ${"claim"}, ${"Other user target"}, ${JSON.stringify({ cluster: "claim" })}::jsonb)
    `;

    const crossMapResponse = await createGraphEdge(
      new Request("http://localhost/api/graph/edges", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          sourceNodeId,
          targetNodeId: otherMapNodeId,
          kind: "supports",
        }),
      }),
    );

    assert.equal(crossMapResponse.status, 409);
    assert.deepEqual(await crossMapResponse.json(), {
      error: "Graph edge endpoints must belong to the same map.",
    });

    const crossUserResponse = await createGraphEdge(
      new Request("http://localhost/api/graph/edges", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          sourceNodeId,
          targetNodeId: otherUserNodeId,
          kind: "supports",
        }),
      }),
    );

    assert.equal(crossUserResponse.status, 404);
    assert.deepEqual(await crossUserResponse.json(), {
      error: "Source or target graph node not found.",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("POST /api/graph/edges validates request body", async () => {
  const response = await createGraphEdge(
    new Request("http://localhost/api/graph/edges", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "00000000-0000-0000-0000-000000007123",
      },
      body: JSON.stringify({
        sourceNodeId: "not-a-uuid",
        targetNodeId: "00000000-0000-0000-0000-000000007402",
        kind: "supports",
      }),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "sourceNodeId must be a UUID.",
  });

  const invalidKindResponse = await createGraphEdge(
    new Request("http://localhost/api/graph/edges", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "00000000-0000-0000-0000-000000007123",
      },
      body: JSON.stringify({
        sourceNodeId: "00000000-0000-0000-0000-000000007401",
        targetNodeId: "00000000-0000-0000-0000-000000007402",
        kind: "invalid_edge_type",
      }),
    }),
  );

  assert.equal(invalidKindResponse.status, 400);
  assert.deepEqual(await invalidKindResponse.json(), {
    error: "kind or type must be a valid graph edge type.",
  });
});

test("PATCH /api/graph/edges/:id updates mutable edge fields", async () => {
  const userId = "00000000-0000-0000-0000-000000008123";
  const mapId = "00000000-0000-0000-0000-000000008321";
  const sourceNodeId = "00000000-0000-0000-0000-000000008401";
  const targetNodeId = "00000000-0000-0000-0000-000000008402";
  const edgeId = "00000000-0000-0000-0000-000000008501";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into graph_nodes (id, user_id, map_id, kind, label, metadata_json)
      values
        (${sourceNodeId}, ${userId}, ${mapId}, ${"thought"}, ${"Patch source"}, ${JSON.stringify({ cluster: "context" })}::jsonb),
        (${targetNodeId}, ${userId}, ${mapId}, ${"claim"}, ${"Patch target"}, ${JSON.stringify({ cluster: "claim" })}::jsonb)
    `;

    await sql`
      insert into graph_edges (id, user_id, map_id, source_node_id, target_node_id, kind, weight_bps, metadata_json)
      values (
        ${edgeId},
        ${userId},
        ${mapId},
        ${sourceNodeId},
        ${targetNodeId},
        ${"supports"},
        ${5000},
        ${JSON.stringify({ label: "supports" })}::jsonb
      )
    `;

    const response = await updateGraphEdge(
      new Request(`http://localhost/api/graph/edges/${edgeId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          type: "contradicts",
          weightBps: 8200,
          metadata: {
            label: "contradicts",
            status: "confirmed",
          },
        }),
      }),
      { params: { id: edgeId } },
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      edge: {
        id: string;
        source: string;
        target: string;
        kind: string;
        label: string;
        status?: string;
        strength: number;
        weightBps: number;
      };
    };

    assert.deepEqual(
      {
        id: payload.edge.id,
        source: payload.edge.source,
        target: payload.edge.target,
        kind: payload.edge.kind,
        label: payload.edge.label,
        status: payload.edge.status,
        strength: payload.edge.strength,
        weightBps: payload.edge.weightBps,
      },
      {
        id: edgeId,
        source: sourceNodeId,
        target: targetNodeId,
        kind: "contradicts",
        label: "contradicts",
        status: "confirmed",
        strength: 0.82,
        weightBps: 8200,
      },
    );

    const storedRows = await sql<Array<{ kind: string; weight_bps: number; metadata_json: { status?: string } }>>`
      select kind, weight_bps, metadata_json
      from graph_edges
      where id = ${edgeId}
    `;

    assert.equal(storedRows[0]?.kind, "contradicts");
    assert.equal(storedRows[0]?.weight_bps, 8200);
    assert.equal(storedRows[0]?.metadata_json.status, "confirmed");
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("PATCH /api/graph/edges/:id rejects invalid ids and cross-user updates", async () => {
  const userId = "00000000-0000-0000-0000-000000009123";
  const otherUserId = "00000000-0000-0000-0000-000000009124";
  const mapId = "00000000-0000-0000-0000-000000009321";
  const sourceNodeId = "00000000-0000-0000-0000-000000009401";
  const targetNodeId = "00000000-0000-0000-0000-000000009402";
  const edgeId = "00000000-0000-0000-0000-000000009501";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into graph_nodes (id, user_id, map_id, kind, label)
      values
        (${sourceNodeId}, ${otherUserId}, ${mapId}, ${"claim"}, ${"Other user source"}),
        (${targetNodeId}, ${otherUserId}, ${mapId}, ${"claim"}, ${"Other user target"})
    `;

    await sql`
      insert into graph_edges (id, user_id, map_id, source_node_id, target_node_id, kind, weight_bps, metadata_json)
      values (${edgeId}, ${otherUserId}, ${mapId}, ${sourceNodeId}, ${targetNodeId}, ${"supports"}, ${5000}, ${JSON.stringify({ label: "supports" })}::jsonb)
    `;

    const notFoundResponse = await updateGraphEdge(
      new Request(`http://localhost/api/graph/edges/${edgeId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          weightBps: 6100,
        }),
      }),
      { params: { id: edgeId } },
    );

    assert.equal(notFoundResponse.status, 404);
    assert.deepEqual(await notFoundResponse.json(), {
      error: "Graph edge not found.",
    });

    const invalidIdResponse = await updateGraphEdge(
      new Request("http://localhost/api/graph/edges/not-a-uuid", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          weightBps: 6100,
        }),
      }),
      { params: { id: "not-a-uuid" } },
    );

    assert.equal(invalidIdResponse.status, 400);
    assert.deepEqual(await invalidIdResponse.json(), {
      error: "Invalid edge id. Expected a UUID.",
    });

    const invalidWeightResponse = await updateGraphEdge(
      new Request(`http://localhost/api/graph/edges/${edgeId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          weightBps: 12000,
        }),
      }),
      { params: { id: edgeId } },
    );

    assert.equal(invalidWeightResponse.status, 400);
    assert.deepEqual(await invalidWeightResponse.json(), {
      error: "weightBps must be an integer between 0 and 10000.",
    });

    const invalidKindResponse = await updateGraphEdge(
      new Request(`http://localhost/api/graph/edges/${edgeId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-user-id": otherUserId,
        },
        body: JSON.stringify({
          kind: "invalid_edge_type",
        }),
      }),
      { params: { id: edgeId } },
    );

    assert.equal(invalidKindResponse.status, 400);
    assert.deepEqual(await invalidKindResponse.json(), {
      error: "kind or type must be a valid graph edge type.",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("DELETE /api/graph/edges/:id deletes an owned edge", async () => {
  const userId = "00000000-0000-0000-0000-000000010123";
  const mapId = "00000000-0000-0000-0000-000000010321";
  const sourceNodeId = "00000000-0000-0000-0000-000000010401";
  const targetNodeId = "00000000-0000-0000-0000-000000010402";
  const edgeId = "00000000-0000-0000-0000-000000010501";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into graph_nodes (id, user_id, map_id, kind, label)
      values
        (${sourceNodeId}, ${userId}, ${mapId}, ${"claim"}, ${"Source claim"}),
        (${targetNodeId}, ${userId}, ${mapId}, ${"claim"}, ${"Target claim"})
    `;

    await sql`
      insert into graph_edges (id, user_id, map_id, source_node_id, target_node_id, kind, weight_bps, metadata_json)
      values (${edgeId}, ${userId}, ${mapId}, ${sourceNodeId}, ${targetNodeId}, ${"supports"}, ${5000}, ${JSON.stringify({ label: "supports" })}::jsonb)
    `;

    const response = await deleteGraphEdge(
      new Request(`http://localhost/api/graph/edges/${edgeId}`, {
        method: "DELETE",
        headers: {
          "x-user-id": userId,
        },
      }),
      { params: { id: edgeId } },
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      deleted: boolean;
      edge: {
        id: string;
        source: string;
        target: string;
        kind: string;
        label: string;
        strength: number;
      };
    };

    assert.deepEqual(
      {
        deleted: payload.deleted,
        id: payload.edge.id,
        source: payload.edge.source,
        target: payload.edge.target,
        kind: payload.edge.kind,
        label: payload.edge.label,
        strength: payload.edge.strength,
      },
      {
        deleted: true,
        id: edgeId,
        source: sourceNodeId,
        target: targetNodeId,
        kind: "supports",
        label: "supports",
        strength: 0.5,
      },
    );

    const storedRows = await sql<{ count: string }[]>`
      select count(*)::text as count
      from graph_edges
      where id = ${edgeId}
    `;

    assert.equal(storedRows[0]?.count, "0");
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("DELETE /api/graph/edges/:id rejects invalid ids and cross-user deletes", async () => {
  const userId = "00000000-0000-0000-0000-000000011123";
  const otherUserId = "00000000-0000-0000-0000-000000011124";
  const mapId = "00000000-0000-0000-0000-000000011321";
  const sourceNodeId = "00000000-0000-0000-0000-000000011401";
  const targetNodeId = "00000000-0000-0000-0000-000000011402";
  const edgeId = "00000000-0000-0000-0000-000000011501";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into graph_nodes (id, user_id, map_id, kind, label)
      values
        (${sourceNodeId}, ${otherUserId}, ${mapId}, ${"claim"}, ${"Other user source"}),
        (${targetNodeId}, ${otherUserId}, ${mapId}, ${"claim"}, ${"Other user target"})
    `;

    await sql`
      insert into graph_edges (id, user_id, map_id, source_node_id, target_node_id, kind, weight_bps, metadata_json)
      values (${edgeId}, ${otherUserId}, ${mapId}, ${sourceNodeId}, ${targetNodeId}, ${"supports"}, ${5000}, ${JSON.stringify({ label: "supports" })}::jsonb)
    `;

    const notFoundResponse = await deleteGraphEdge(
      new Request(`http://localhost/api/graph/edges/${edgeId}`, {
        method: "DELETE",
        headers: {
          "x-user-id": userId,
        },
      }),
      { params: { id: edgeId } },
    );

    assert.equal(notFoundResponse.status, 404);
    assert.deepEqual(await notFoundResponse.json(), {
      error: "Graph edge not found.",
    });

    const invalidIdResponse = await deleteGraphEdge(
      new Request("http://localhost/api/graph/edges/not-a-uuid", {
        method: "DELETE",
        headers: {
          "x-user-id": userId,
        },
      }),
      { params: { id: "not-a-uuid" } },
    );

    assert.equal(invalidIdResponse.status, 400);
    assert.deepEqual(await invalidIdResponse.json(), {
      error: "Invalid edge id. Expected a UUID.",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});
