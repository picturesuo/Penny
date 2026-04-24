import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { POST as challengeIdea } from "../../../apps/web/app/ai/challenge-idea/route.ts";
import { POST as detectContradictions } from "../../../apps/web/app/ai/detect-contradictions/route.ts";
import { POST as explainBlocker } from "../../../apps/web/app/ai/explain-blocker/route.ts";
import { POST as suggestConnections } from "../../../apps/web/app/ai/suggest-connections/route.ts";
import { POST as summarizeMap } from "../../../apps/web/app/ai/summarize-map/route.ts";
import { closeDb } from "../../../server/db/client.ts";
import { aiOperationLogDeps } from "../../../server/ai/services/ai-operation-log.ts";

const PG_PORT = 64000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_reasoning_endpoints_mvp_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-reasoning-endpoints-"));

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
  await closeDb();

  try {
    run("pg_ctl", ["-D", PGDATA_DIR, "stop", "-m", "immediate"]);
  } finally {
    rmSync(PGDATA_DIR, { recursive: true, force: true });
  }
});

function snapshotLogDeps() {
  return { ...aiOperationLogDeps };
}

function restoreLogDeps(originalDeps: ReturnType<typeof snapshotLogDeps>) {
  Object.assign(aiOperationLogDeps, originalDeps);
}

function aiRequest(path: string, body: unknown, userId: string, requestId: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
      "x-request-id": requestId,
    },
    body: JSON.stringify(body),
  });
}

async function seedReasoningWorkspace(sql: postgres.Sql, userId: string) {
  const mapId = randomUUID();
  const targetThoughtId = randomUUID();
  const blockerThoughtId = randomUUID();
  const targetClaimId = randomUUID();
  const contradictionClaimId = randomUUID();
  const dependencyClaimId = randomUUID();

  await sql`
    insert into maps (id, user_id, title)
    values (${mapId}, ${userId}, ${"Penny MVP reasoning map"})
  `;
  await sql`
    insert into thoughts (id, user_id, map_id, raw_text, source, metadata_json)
    values
      (
        ${targetThoughtId},
        ${userId},
        ${mapId},
        ${"Users need proof before they buy the product because trust drives activation."},
        ${"mvp-test"},
        ${JSON.stringify({ summary: "Proof and trust thought" })}::jsonb
      ),
      (
        ${blockerThoughtId},
        ${userId},
        ${mapId},
        ${"I am blocked because the buyer proof is unclear and the next exercise is not obvious."},
        ${"mvp-test"},
        ${JSON.stringify({ summary: "Blocker thought" })}::jsonb
      )
  `;
  await sql`
    insert into claims (id, map_id, user_id, thought_id, body, confidence_bps)
    values
      (
        ${targetClaimId},
        ${mapId},
        ${userId},
        ${targetThoughtId},
        ${"Users need proof before they buy the product because trust drives activation."},
        ${7600}
      ),
      (
        ${contradictionClaimId},
        ${mapId},
        ${userId},
        ${targetThoughtId},
        ${"Users do not need proof before they buy the product because trust does not drive activation."},
        ${4100}
      ),
      (
        ${dependencyClaimId},
        ${mapId},
        ${userId},
        ${blockerThoughtId},
        ${"The product depends on buyer proof before sales can increase."},
        ${6900}
      )
  `;

  return {
    mapId,
    targetThoughtId,
    blockerThoughtId,
    targetClaimId,
    contradictionClaimId,
    dependencyClaimId,
  };
}

test("MVP AI reasoning endpoints return contracts and create graph edges when requested", async () => {
  const originalLogDeps = snapshotLogDeps();
  const sql = postgres(databaseUrl, { prepare: false });
  const userId = "00000000-0000-4000-8000-000000009001";

  aiOperationLogDeps.runLoggedAIOperation = async (input) => ({
    aiJob: {} as never,
    output: await input.run(),
  });

  try {
    const seeded = await seedReasoningWorkspace(sql, userId);

    const suggestResponse = await suggestConnections(
      aiRequest(
        "/ai/suggest-connections",
        {
          targetType: "claim",
          targetId: seeded.targetClaimId,
        },
        userId,
        "reasoning-suggest-1",
      ),
    );

    assert.equal(suggestResponse.status, 200);

    const suggestPayload = (await suggestResponse.json()) as {
      suggestions: Array<{ targetId: string; relation: string; confidenceBps: number; autoCreated: boolean }>;
      createdEdges: unknown[];
    };

    assert.ok(suggestPayload.suggestions.some((candidate) => candidate.targetId === seeded.contradictionClaimId));
    assert.ok(suggestPayload.suggestions.every((candidate) => typeof candidate.confidenceBps === "number"));
    assert.deepEqual(suggestPayload.createdEdges, []);

    const suggestCreateResponse = await suggestConnections(
      aiRequest(
        "/ai/suggest-connections",
        {
          targetType: "claim",
          targetId: seeded.targetClaimId,
          autoCreate: true,
        },
        userId,
        "reasoning-suggest-2",
      ),
    );

    assert.equal(suggestCreateResponse.status, 200);

    const suggestCreatePayload = (await suggestCreateResponse.json()) as {
      suggestions: Array<{ targetId: string; autoCreated: boolean }>;
      createdEdges: Array<{ id: string; relation: string; targetId: string }>;
    };

    assert.ok(suggestCreatePayload.createdEdges.length >= 1);
    assert.ok(suggestCreatePayload.suggestions.some((candidate) => candidate.autoCreated));

    const createdSuggestionEdges = await sql<{ id: string; kind: string }[]>`
      select id, kind
      from graph_edges
      where id = any(${suggestCreatePayload.createdEdges.map((edge) => edge.id)}::uuid[])
      order by created_at, id
    `;

    assert.equal(createdSuggestionEdges.length, suggestCreatePayload.createdEdges.length);
    assert.ok(createdSuggestionEdges.every((edge) => ["related", "supports", "depends_on"].includes(edge.kind)));

    const contradictionResponse = await detectContradictions(
      aiRequest(
        "/ai/detect-contradictions",
        {
          targetType: "claim",
          targetId: seeded.targetClaimId,
        },
        userId,
        "reasoning-contradictions-1",
      ),
    );

    assert.equal(contradictionResponse.status, 200);

    const contradictionPayload = (await contradictionResponse.json()) as {
      contradictions: Array<{ claimId: string; confidenceBps: number; autoCreated: boolean }>;
      createdEdges: unknown[];
    };

    assert.ok(contradictionPayload.contradictions.some((candidate) => candidate.claimId === seeded.contradictionClaimId));
    assert.ok(contradictionPayload.contradictions.every((candidate) => typeof candidate.confidenceBps === "number"));
    assert.deepEqual(contradictionPayload.createdEdges, []);

    const contradictionCreateResponse = await detectContradictions(
      aiRequest(
        "/ai/detect-contradictions",
        {
          targetType: "claim",
          targetId: seeded.targetClaimId,
          autoCreate: true,
        },
        userId,
        "reasoning-contradictions-2",
      ),
    );

    assert.equal(contradictionCreateResponse.status, 200);

    const contradictionCreatePayload = (await contradictionCreateResponse.json()) as {
      contradictions: Array<{ claimId: string; autoCreated: boolean }>;
      createdEdges: Array<{ id: string; relation: "contradicts"; claimId: string }>;
    };

    assert.ok(contradictionCreatePayload.createdEdges.length >= 1);
    assert.ok(contradictionCreatePayload.createdEdges.every((edge) => edge.relation === "contradicts"));
    assert.ok(contradictionCreatePayload.contradictions.some((candidate) => candidate.autoCreated));

    const createdContradictionEdges = await sql<{ id: string; kind: string }[]>`
      select id, kind
      from graph_edges
      where id = any(${contradictionCreatePayload.createdEdges.map((edge) => edge.id)}::uuid[])
      order by created_at, id
    `;

    assert.equal(createdContradictionEdges.length, contradictionCreatePayload.createdEdges.length);
    assert.ok(createdContradictionEdges.every((edge) => edge.kind === "contradicts"));

    const challengeResponse = await challengeIdea(
      aiRequest(
        "/ai/challenge-idea",
        {
          claimId: seeded.targetClaimId,
          text: "Penny should rely on buyer proof because trust drives activation.",
        },
        userId,
        "reasoning-challenge-1",
      ),
    );

    assert.equal(challengeResponse.status, 200);

    const challengePayload = (await challengeResponse.json()) as Record<string, unknown>;

    assert.deepEqual(Object.keys(challengePayload).sort(), [
      "betterVersion",
      "confidenceQuestion",
      "counterexample",
      "hiddenAssumption",
      "strongestObjection",
    ]);
    assert.equal(typeof challengePayload.strongestObjection, "string");
    assert.equal(typeof challengePayload.hiddenAssumption, "string");
    assert.equal(typeof challengePayload.counterexample, "string");
    assert.equal(typeof challengePayload.betterVersion, "string");
    assert.equal(typeof challengePayload.confidenceQuestion, "string");

    const blockerResponse = await explainBlocker(
      aiRequest(
        "/ai/explain-blocker",
        {
          text: "I am stuck because the buyer proof is unclear and I need a simpler next exercise.",
        },
        userId,
        "reasoning-blocker-1",
      ),
    );

    assert.equal(blockerResponse.status, 200);

    const blockerPayload = (await blockerResponse.json()) as Record<string, unknown>;

    assert.deepEqual(Object.keys(blockerPayload).sort(), [
      "likelyBlocker",
      "missingConcept",
      "nextExercise",
      "simplerExplanation",
    ]);
    assert.equal(typeof blockerPayload.likelyBlocker, "string");
    assert.equal(typeof blockerPayload.missingConcept, "string");
    assert.equal(typeof blockerPayload.simplerExplanation, "string");
    assert.equal(typeof blockerPayload.nextExercise, "string");

    const summaryResponse = await summarizeMap(
      aiRequest(
        "/ai/summarize-map",
        {
          mapId: seeded.mapId,
        },
        userId,
        "reasoning-summary-1",
      ),
    );

    assert.equal(summaryResponse.status, 200);

    const summaryPayload = (await summaryResponse.json()) as Record<string, unknown>;

    assert.deepEqual(Object.keys(summaryPayload).sort(), ["keyClaims", "nextQuestions", "summary", "tensions"]);
    assert.equal(typeof summaryPayload.summary, "string");
    assert.ok(Array.isArray(summaryPayload.keyClaims));
    assert.ok(Array.isArray(summaryPayload.tensions));
    assert.ok(Array.isArray(summaryPayload.nextQuestions));
    assert.ok(summaryPayload.keyClaims.length >= 1);
  } finally {
    restoreLogDeps(originalLogDeps);
    await sql.end({ timeout: 1 });
  }
});
