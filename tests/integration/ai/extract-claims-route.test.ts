import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { POST } from "../../../apps/web/app/ai/extract-claims/route.ts";
import { extractClaimsDeps } from "../../../server/ai/operations/extractClaims.ts";
import { createMockAiProvider } from "../../../server/ai/providers/mock.ts";

const PG_PORT = 63000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_extract_claims_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-extract-claims-route-"));

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

function snapshotDeps() {
  return { ...extractClaimsDeps };
}

function restoreDeps(originalDeps: ReturnType<typeof snapshotDeps>) {
  Object.assign(extractClaimsDeps, originalDeps);
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/ai/extract-claims", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function seedThought(sql: postgres.Sql, input: { mapId?: string; userId: string }) {
  const mapId = input.mapId ?? randomUUID();
  const thoughtId = randomUUID();
  const thoughtNodeId = randomUUID();

  await sql`
    insert into maps (id, user_id, title)
    values (${mapId}, ${input.userId}, ${"Extract claims map"})
  `;
  await sql`
    insert into thoughts (id, user_id, map_id, raw_text, source, metadata_json)
    values (
      ${thoughtId},
      ${input.userId},
      ${mapId},
      ${"Penny should preserve raw thought provenance for every extracted claim."},
      ${"ai.capture-thought"},
      ${JSON.stringify({ suggestedTitle: "Traceable claims", summary: "A thought about claim provenance." })}::jsonb
    )
  `;
  await sql`
    insert into graph_nodes (id, user_id, map_id, thought_id, kind, label, metadata_json)
    values (
      ${thoughtNodeId},
      ${input.userId},
      ${mapId},
      ${thoughtId},
      ${"thought"},
      ${"Traceable claims"},
      ${JSON.stringify({ source: "test" })}::jsonb
    )
  `;

  return { mapId, thoughtId, thoughtNodeId };
}

test("POST /ai/extract-claims authenticates before AI execution", async () => {
  const originalDeps = snapshotDeps();

  extractClaimsDeps.createProvider = () => {
    throw new Error("provider should not be created");
  };

  try {
    const response = await POST(request({ thoughtId: randomUUID() }));

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Authenticated user is required.",
    });
  } finally {
    restoreDeps(originalDeps);
  }
});

test("POST /ai/extract-claims creates claims, graph nodes, graph edges, activity events, and AI job output", async () => {
  const originalDeps = snapshotDeps();
  const sql = postgres(databaseUrl, { prepare: false });
  const userId = "00000000-0000-0000-0000-000000000901";

  extractClaimsDeps.createProvider = () =>
    createMockAiProvider({
      output: {
        claims: [
          {
            text: "Penny should preserve raw thought provenance for every extracted claim.",
            confidenceBps: 8400,
            rationale: "The thought directly states this claim.",
          },
          {
            text: "Claim extraction should create graph structure from the source thought.",
            confidenceBps: 7600,
            rationale: "The request asks for graph nodes and edges.",
          },
        ],
      },
    });
  extractClaimsDeps.createMockProvider = () => createMockAiProvider();

  try {
    const seeded = await seedThought(sql, { userId });
    const response = await POST(
      request(
        {
          thoughtId: seeded.thoughtId,
        },
        {
          "x-user-id": userId,
          "x-request-id": "extract-claims-route-1",
        },
      ),
    );

    assert.equal(response.status, 201);

    const payload = (await response.json()) as {
      aiJobId: string;
      thoughtId: string;
      claims: Array<{
        id: string;
        body: string;
        confidenceBps: number;
        graphNodeId: string;
        graphEdgeId: string;
      }>;
    };

    assert.match(payload.aiJobId, /^[0-9a-f-]{36}$/i);
    assert.equal(payload.thoughtId, seeded.thoughtId);
    assert.equal(payload.claims.length, 2);
    assert.equal(payload.claims[0]?.body, "Penny should preserve raw thought provenance for every extracted claim.");
    assert.equal(payload.claims[0]?.confidenceBps, 8400);

    const storedClaims = await sql<
      { id: string; map_id: string; thought_id: string | null; body: string; confidence_bps: number }[]
    >`select id, map_id, thought_id, body, confidence_bps from claims where thought_id = ${seeded.thoughtId} order by created_at, id`;
    const storedNodes = await sql<
      { id: string; claim_id: string | null; thought_id: string | null; kind: string; label: string }[]
    >`select id, claim_id, thought_id, kind, label from graph_nodes where claim_id = any(${payload.claims.map((claim) => claim.id)}::uuid[]) order by created_at, id`;
    const storedEdges = await sql<
      { id: string; source_node_id: string; target_node_id: string; kind: string; weight_bps: number | null }[]
    >`select id, source_node_id, target_node_id, kind, weight_bps from graph_edges where source_node_id = ${seeded.thoughtNodeId} order by created_at, id`;
    const storedActivity = await sql<
      { aggregate_type: string; aggregate_id: string | null; type: string; ai_job_id: string | null; graph_edge_id: string | null }[]
    >`select aggregate_type, aggregate_id, type, ai_job_id, graph_edge_id from activity_events where ai_job_id = ${payload.aiJobId} order by created_at, id`;
    const storedJobs = await sql<
      { id: string; status: string; operation: string; output_json: { createdClaims?: unknown[] } | null }[]
    >`select id, status, operation, output_json from ai_jobs where id = ${payload.aiJobId}`;

    const provenanceClaim = storedClaims.find((claim) => claim.body === "Penny should preserve raw thought provenance for every extracted claim.");

    assert.equal(storedClaims.length, 2);
    assert.ok(provenanceClaim);
    assert.equal(provenanceClaim.map_id, seeded.mapId);
    assert.equal(provenanceClaim.thought_id, seeded.thoughtId);
    assert.equal(provenanceClaim.confidence_bps, 8400);
    assert.equal(storedNodes.length, 2);
    assert.equal(storedNodes[0].kind, "claim");
    assert.equal(storedNodes[0].thought_id, seeded.thoughtId);
    assert.equal(storedEdges.length, 2);
    assert.equal(storedEdges.every((edge) => edge.source_node_id === seeded.thoughtNodeId), true);
    assert.equal(storedEdges.every((edge) => edge.kind === "extracted_claim"), true);
    assert.equal(storedEdges.some((edge) => edge.weight_bps === 8400), true);
    assert.equal(storedActivity.length, 2);
    assert.equal(storedActivity[0].aggregate_type, "claim");
    assert.equal(storedActivity[0].type, "claim.extracted");
    assert.equal(storedActivity[0].ai_job_id, payload.aiJobId);
    assert.equal(storedJobs.length, 1);
    assert.equal(storedJobs[0].status, "succeeded");
    assert.equal(storedJobs[0].operation, "extract_claims");
    assert.equal(storedJobs[0].output_json?.createdClaims?.length, 2);
  } finally {
    restoreDeps(originalDeps);
    await sql.end({ timeout: 1 });
  }
});

test("POST /ai/extract-claims falls back to mock provider when configured provider fails", async () => {
  const originalDeps = snapshotDeps();
  const sql = postgres(databaseUrl, { prepare: false });
  const userId = "00000000-0000-0000-0000-000000000902";

  extractClaimsDeps.createProvider = () => ({
    name: "openai",
    async invokeStructured() {
      throw new Error("configured provider failed");
    },
  });
  extractClaimsDeps.createMockProvider = () =>
    createMockAiProvider({
      output: {
        result: {
          claims: [
            {
              text: "Fallback claim from mock provider.",
              confidenceBps: 7300,
            },
          ],
        },
      },
    });

  try {
    const seeded = await seedThought(sql, { userId });
    const response = await POST(
      request(
        {
          thoughtId: seeded.thoughtId,
        },
        {
          "x-user-id": userId,
        },
      ),
    );

    assert.equal(response.status, 201);

    const payload = (await response.json()) as { claims: Array<{ body: string; confidenceBps: number }> };

    assert.equal(payload.claims.length, 1);
    assert.equal(payload.claims[0]?.body, "Fallback claim from mock provider.");
    assert.equal(payload.claims[0]?.confidenceBps, 7300);
  } finally {
    restoreDeps(originalDeps);
    await sql.end({ timeout: 1 });
  }
});

test("POST /ai/extract-claims validates thoughtId", async () => {
  const response = await POST(
    request(
      {
        thoughtId: "not-a-uuid",
      },
      {
        "x-user-id": "00000000-0000-0000-0000-000000000903",
      },
    ),
  );

  assert.equal(response.status, 400);

  const payload = (await response.json()) as { error: string; issues: string[] };

  assert.equal(payload.error, "thoughtId must be a UUID.");
  assert.deepEqual(payload.issues, ["thoughtId must be a UUID."]);
});

test("POST /ai/extract-claims returns 404 for another user's thought", async () => {
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const seeded = await seedThought(sql, { userId: "00000000-0000-0000-0000-000000000904" });
    const response = await POST(
      request(
        {
          thoughtId: seeded.thoughtId,
        },
        {
          "x-user-id": "00000000-0000-0000-0000-000000000905",
        },
      ),
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: "Thought not found for extractClaims.",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});
