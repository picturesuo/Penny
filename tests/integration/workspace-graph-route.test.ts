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

test("GET /api/graph returns the graph model for the current workspace mode", async () => {
  const userId = "00000000-0000-0000-0000-000000002123";
  const mapId = "00000000-0000-0000-0000-000000002321";
  const selectedClaimId = "00000000-0000-0000-0000-000000002456";
  const otherClaimId = "00000000-0000-0000-0000-000000002654";
  const roundId = "00000000-0000-0000-0000-000000002777";
  const critiqueId = "00000000-0000-0000-0000-000000002888";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Graph route map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values
        (${selectedClaimId}, ${mapId}, ${userId}, ${"Selected graph claim"}, ${7400}),
        (${otherClaimId}, ${mapId}, ${userId}, ${"Other graph claim"}, ${4900})
    `;

    await sql`
      insert into challenge_rounds (id, map_id, claim_id, user_id, status)
      values (${roundId}, ${mapId}, ${selectedClaimId}, ${userId}, ${"responded"})
    `;

    await sql`
      insert into challenge_critiques (id, round_id, map_id, claim_id, user_id, status, body)
      values (${critiqueId}, ${roundId}, ${mapId}, ${selectedClaimId}, ${userId}, ${"ready"}, ${"Main challenge: The graph claim needs tighter scope."})
    `;

    await sql`
      insert into moves_events (user_id, aggregate_type, aggregate_id, type, payload_json, request_id)
      values
        (
          ${userId},
          ${"challenge_critique"},
          ${critiqueId},
          ${"challenge.critique.generated"},
          ${JSON.stringify({
            roundId,
            mapId,
            claimId: selectedClaimId,
            status: "ready",
            body: "Main challenge: The graph claim needs tighter scope.",
            critiqueJson: {
              conciseCritiqueSummary: "The graph claim needs tighter scope.",
            },
            provider: "test-provider",
            model: "test-model",
            promptVersion: "test-prompt-v1",
          })}::jsonb,
          ${"workspace-graph-generated-event"}
        ),
        (
          ${userId},
          ${"challenge_round"},
          ${roundId},
          ${"challenge.response.recorded"},
          ${JSON.stringify({
            mapId,
            claimId: selectedClaimId,
            response: "The graph route should still show the response state.",
            responsePath: "direct",
            confidenceBps: 7100,
            previousStatus: "started",
            status: "responded",
          })}::jsonb,
          ${"workspace-graph-response-event"}
        )
    `;

    await sql`
      insert into workspace_contexts (user_id, map_id, claim_id, mode)
      values (${userId}, ${mapId}, ${selectedClaimId}, ${"brain"})
    `;

    const brainResponse = await GET(
      new Request("http://localhost/api/graph", {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(brainResponse.status, 200);

    const brainPayload = (await brainResponse.json()) as {
      id: string;
      title: string;
      selectedNodeId: string | null;
      nodes: Array<{ id: string; kind: string; cluster: string; status?: string }>;
      edges: Array<{ id: string; source: string; target: string }>;
    };

    assert.equal(brainPayload.id, `brain:${mapId}`);
    assert.equal(brainPayload.title, "Graph route map");
    assert.equal(brainPayload.selectedNodeId, selectedClaimId);
    assert.equal(brainPayload.nodes.length, 3);
    assert.equal(brainPayload.edges.length, 2);
    assert.deepEqual(
      brainPayload.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        cluster: node.cluster,
        status: node.status ?? null,
      })),
      [
        {
          id: mapId,
          kind: "map",
          cluster: "map",
          status: null,
        },
        {
          id: selectedClaimId,
          kind: "claim",
          cluster: "claim",
          status: "selected",
        },
        {
          id: otherClaimId,
          kind: "claim",
          cluster: "claim",
          status: null,
        },
      ],
    );

    await sql`
      update workspace_contexts
      set mode = ${"challenge"}, updated_at = now()
      where user_id = ${userId}
    `;

    const challengeResponse = await GET(
      new Request("http://localhost/api/graph", {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(challengeResponse.status, 200);

    const challengePayload = (await challengeResponse.json()) as {
      id: string;
      title: string;
      selectedNodeId: string | null;
      nodes: Array<{ id: string; kind: string; status?: string }>;
      edges: Array<{ source: string; target: string }>;
    };

    assert.equal(challengePayload.id, `challenge:${mapId}:${selectedClaimId}`);
    assert.equal(challengePayload.title, "Challenge graph");
    assert.equal(challengePayload.selectedNodeId, selectedClaimId);
    assert.ok(challengePayload.nodes.some((node) => node.id === selectedClaimId && node.kind === "claim" && node.status === "selected"));
    assert.ok(challengePayload.nodes.some((node) => node.id === roundId && node.kind === "round" && node.status === "responded"));
    assert.ok(challengePayload.nodes.some((node) => node.id === critiqueId && node.kind === "critique" && node.status === "ready"));
    assert.ok(
      challengePayload.nodes.some(
        (node) => node.id === `${roundId}:response` && node.kind === "response" && node.status === "responded",
      ),
    );
    assert.ok(challengePayload.edges.some((edge) => edge.source === roundId && edge.target === critiqueId));

    await sql`
      update workspace_contexts
      set mode = ${"learn"}, updated_at = now()
      where user_id = ${userId}
    `;

    const learnResponse = await GET(
      new Request("http://localhost/api/graph", {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(learnResponse.status, 200);

    const learnPayload = (await learnResponse.json()) as {
      id: string;
      title: string;
      selectedNodeId: string | null;
      nodes: Array<{ id: string; kind: string; status?: string }>;
      edges: Array<{ source: string; target: string; label?: string }>;
    };

    assert.equal(learnPayload.id, `learn:${mapId}:${selectedClaimId}`);
    assert.equal(learnPayload.title, "Learn graph");
    assert.equal(learnPayload.selectedNodeId, selectedClaimId);
    assert.ok(learnPayload.nodes.some((node) => node.id === mapId && node.kind === "map"));
    assert.ok(learnPayload.nodes.some((node) => node.id === selectedClaimId && node.kind === "claim" && node.status === "selected"));
    assert.ok(learnPayload.nodes.some((node) => node.id === "learn-placeholder" && node.kind === "learn" && node.status === "placeholder"));
    assert.ok(
      learnPayload.edges.some(
        (edge) => edge.source === selectedClaimId && edge.target === "learn-placeholder" && edge.label === "feeds",
      ),
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
});
