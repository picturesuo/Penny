import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { POST as captureThought } from "../../../apps/web/app/ai/capture-thought/route.ts";
import { POST as extractClaims } from "../../../apps/web/app/ai/extract-claims/route.ts";
import { captureThoughtDeps } from "../../../server/ai/operations/captureThought.ts";
import { extractClaimsDeps } from "../../../server/ai/operations/extractClaims.ts";
import { PROMPT_VERSION as CAPTURE_PROMPT_VERSION } from "../../../server/ai/prompts/captureThought/v1.ts";
import { createMockAiProvider } from "../../../server/ai/providers/mock.ts";

const PG_PORT = 64000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_mvp_ai_capture_extract_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-mvp-ai-capture-extract-"));

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

function captureRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/ai/capture-thought", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function extractRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/ai/extract-claims", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("MVP AI capture and claim extraction persist the thought graph flow", async () => {
  const originalCaptureDeps = { ...captureThoughtDeps };
  const originalExtractDeps = { ...extractClaimsDeps };
  const sql = postgres(databaseUrl, { prepare: false });
  const userId = "00000000-0000-4000-8000-000000001001";
  const mapId = "00000000-0000-4000-8000-000000001002";
  const sessionId = "00000000-0000-4000-8000-000000001003";

  captureThoughtDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-capture-mvp-test",
      promptVersion: CAPTURE_PROMPT_VERSION,
      tier: "default",
    },
  ];
  captureThoughtDeps.invokeAnthropicStructured = async () => ({
    output: {
      thought: {
        title: "Traceable launch risk",
        summary: "The thought says Penny needs traceable AI capture before investor demos.",
      },
      claims: [
        {
          text: "Penny needs traceable AI capture before investor demos.",
          confidenceBps: 8200,
          rationale: "The submitted thought directly asks for traceability.",
        },
      ],
    },
    usage: {
      inputTokens: 18,
      outputTokens: 22,
      totalTokens: 40,
    },
    cost: {
      totalUsd: 0.001,
      currency: "USD",
    },
  });
  captureThoughtDeps.invokeXaiStructured = async () => {
    throw new Error("fallback provider should not be called");
  };
  extractClaimsDeps.createProvider = () =>
    createMockAiProvider({
      output: {
        claims: [
          {
            text: "Penny needs traceable AI capture before investor demos.",
            confidenceBps: 8500,
            rationale: "The captured thought explicitly says this.",
          },
          {
            text: "Investor demo readiness depends on preserving provenance.",
            confidenceBps: 7600,
            rationale: "Traceability is framed as necessary for the demo.",
          },
        ],
      },
    });
  extractClaimsDeps.createMockProvider = () => createMockAiProvider();

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"MVP AI map"})
    `;
    await sql`
      insert into workspace_contexts (user_id, map_id, mode)
      values (${userId}, ${mapId}, ${"brain"})
      on conflict (user_id) do update set map_id = excluded.map_id, mode = excluded.mode
    `;

    const captureResponse = await captureThought(
      captureRequest(
        {
          text: "Penny needs traceable AI capture before investor demos.",
          sessionId,
        },
        {
          "x-user-id": userId,
          "x-request-id": "mvp-ai-capture-1",
        },
      ),
    );

    assert.equal(captureResponse.status, 201);

    const capturePayload = (await captureResponse.json()) as {
      aiJobId: string;
      graphNodeId: string;
      suggestedTitle: string;
      thought: {
        id: string;
        mapId: string;
        rawText: string;
        suggestedTitle: string;
      };
    };

    assert.equal(capturePayload.suggestedTitle, "Traceable launch risk");
    assert.equal(capturePayload.thought.suggestedTitle, "Traceable launch risk");

    const capturedRows = await sql<
      {
        thought_count: string;
        thought_node_count: string;
        capture_activity_count: string;
        capture_job_count: string;
      }[]
    >`
      select
        (select count(*)::text from thoughts where id = ${capturePayload.thought.id}) as thought_count,
        (
          select count(*)::text
          from graph_nodes
          where id = ${capturePayload.graphNodeId}
            and thought_id = ${capturePayload.thought.id}
            and kind = ${"thought"}
        ) as thought_node_count,
        (
          select count(*)::text
          from activity_events
          where ai_job_id = ${capturePayload.aiJobId}
            and thought_id = ${capturePayload.thought.id}
            and graph_node_id = ${capturePayload.graphNodeId}
            and type = ${"thought.captured"}
        ) as capture_activity_count,
        (
          select count(*)::text
          from ai_jobs
          where id = ${capturePayload.aiJobId}
            and operation = ${"captureThought"}
            and status = ${"succeeded"}
        ) as capture_job_count
    `;

    assert.deepEqual(capturedRows[0], {
      thought_count: "1",
      thought_node_count: "1",
      capture_activity_count: "1",
      capture_job_count: "1",
    });

    const extractResponse = await extractClaims(
      extractRequest(
        {
          thoughtId: capturePayload.thought.id,
        },
        {
          "x-user-id": userId,
          "x-request-id": "mvp-ai-extract-1",
        },
      ),
    );

    assert.equal(extractResponse.status, 201);

    const extractPayload = (await extractResponse.json()) as {
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

    assert.equal(extractPayload.thoughtId, capturePayload.thought.id);
    assert.equal(extractPayload.claims.length, 2);
    assert.deepEqual(
      extractPayload.claims.map((claim) => claim.body),
      [
        "Penny needs traceable AI capture before investor demos.",
        "Investor demo readiness depends on preserving provenance.",
      ],
    );

    const claimIds = extractPayload.claims.map((claim) => claim.id);
    const graphNodeIds = extractPayload.claims.map((claim) => claim.graphNodeId);
    const graphEdgeIds = extractPayload.claims.map((claim) => claim.graphEdgeId);

    const extractedRows = await sql<
      {
        claim_count: string;
        claim_node_count: string;
        thought_claim_edge_count: string;
        extract_activity_count: string;
        extract_job_count: string;
      }[]
    >`
      select
        (
          select count(*)::text
          from claims
          where id = any(${claimIds}::uuid[])
            and thought_id = ${capturePayload.thought.id}
            and map_id = ${mapId}
        ) as claim_count,
        (
          select count(*)::text
          from graph_nodes
          where id = any(${graphNodeIds}::uuid[])
            and claim_id = any(${claimIds}::uuid[])
            and thought_id = ${capturePayload.thought.id}
            and kind = ${"claim"}
        ) as claim_node_count,
        (
          select count(*)::text
          from graph_edges
          where id = any(${graphEdgeIds}::uuid[])
            and source_node_id = ${capturePayload.graphNodeId}
            and target_node_id = any(${graphNodeIds}::uuid[])
            and kind = ${"extracted_claim"}
        ) as thought_claim_edge_count,
        (
          select count(*)::text
          from activity_events
          where ai_job_id = ${extractPayload.aiJobId}
            and type = ${"claim.extracted"}
            and claim_id = any(${claimIds}::uuid[])
            and graph_node_id = any(${graphNodeIds}::uuid[])
            and graph_edge_id = any(${graphEdgeIds}::uuid[])
        ) as extract_activity_count,
        (
          select count(*)::text
          from ai_jobs
          where id = ${extractPayload.aiJobId}
            and operation = ${"extract_claims"}
            and status = ${"succeeded"}
        ) as extract_job_count
    `;

    assert.deepEqual(extractedRows[0], {
      claim_count: "2",
      claim_node_count: "2",
      thought_claim_edge_count: "2",
      extract_activity_count: "2",
      extract_job_count: "1",
    });
  } finally {
    Object.assign(captureThoughtDeps, originalCaptureDeps);
    Object.assign(extractClaimsDeps, originalExtractDeps);
    await sql.end({ timeout: 1 });
  }
});
