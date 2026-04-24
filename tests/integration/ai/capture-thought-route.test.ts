import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { POST } from "../../../apps/web/app/ai/capture-thought/route.ts";
import { captureThoughtDeps } from "../../../server/ai/operations/captureThought.ts";
import { PROMPT_VERSION } from "../../../server/ai/prompts/captureThought/v1.ts";

const PG_PORT = 62000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_capture_thought_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-capture-thought-route-"));

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
  return { ...captureThoughtDeps };
}

function restoreDeps(originalDeps: ReturnType<typeof snapshotDeps>) {
  Object.assign(captureThoughtDeps, originalDeps);
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/ai/capture-thought", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("POST /ai/capture-thought authenticates before AI execution", async () => {
  const originalDeps = snapshotDeps();

  captureThoughtDeps.invokeAnthropicStructured = async () => {
    throw new Error("provider should not be called");
  };

  try {
    const response = await POST(request({ text: "Capture this." }));

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Authenticated user is required.",
    });
  } finally {
    restoreDeps(originalDeps);
  }
});

test("POST /ai/capture-thought returns extracted thought and claims", async () => {
  const originalDeps = snapshotDeps();
  const sql = postgres(databaseUrl, { prepare: false });
  const userId = "00000000-0000-0000-0000-000000000123";
  const mapId = "00000000-0000-0000-0000-000000000456";
  const sessionId = "00000000-0000-0000-0000-000000000789";

  captureThoughtDeps.resolveModelPolicy = () => [
    {
      provider: "anthropic",
      model: "claude-capture-test",
      promptVersion: PROMPT_VERSION,
      tier: "default",
    },
  ];
  captureThoughtDeps.invokeAnthropicStructured = async () => ({
    output: {
      thought: {
        title: "Capture loop",
        summary: "The thought says Penny should capture raw ideas and extract reviewable claims.",
      },
      claims: [
        {
          text: "Penny should extract reviewable claims from raw captured thoughts.",
          confidenceBps: 8100,
          rationale: "The submitted text directly asks for capture and extraction.",
        },
      ],
    },
    usage: {
      inputTokens: 30,
      outputTokens: 20,
      totalTokens: 50,
    },
    cost: {
      totalUsd: 0.002,
      currency: "USD",
    },
  });
  captureThoughtDeps.invokeXaiStructured = async () => {
    throw new Error("xai should not be called");
  };

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Capture map"})
    `;
    await sql`
      insert into workspace_contexts (user_id, map_id, mode)
      values (${userId}, ${mapId}, ${"brain"})
      on conflict (user_id) do update set map_id = excluded.map_id, mode = excluded.mode
    `;

    const response = await POST(
      request(
        {
          text: "Penny should capture raw ideas and extract reviewable claims.",
          sessionId,
        },
        {
          "x-user-id": userId,
          "x-request-id": "capture-route-1",
        },
      ),
    );

    assert.equal(response.status, 201);

    const payload = (await response.json()) as {
      aiJobId: string;
      graphNodeId: string;
      suggestedTitle: string;
      thought: {
        id: string;
        userId: string;
        sessionId: string | null;
        mapId: string;
        rawText: string;
        suggestedTitle: string;
        summary: string;
      };
      claims: Array<{
        text: string;
        confidenceBps: number;
        rationale: string | null;
      }>;
      meta: {
        provider: string;
        model: string;
      };
    };

    assert.match(payload.aiJobId, /^[0-9a-f-]{36}$/i);
    assert.match(payload.graphNodeId, /^[0-9a-f-]{36}$/i);
    assert.equal(payload.suggestedTitle, "Capture loop");
    assert.equal(payload.thought.rawText, "Penny should capture raw ideas and extract reviewable claims.");
    assert.equal(payload.thought.userId, userId);
    assert.equal(payload.thought.sessionId, sessionId);
    assert.equal(payload.thought.mapId, mapId);
    assert.equal(payload.thought.suggestedTitle, "Capture loop");
    assert.equal(payload.claims.length, 1);
    assert.equal(payload.claims[0]?.confidenceBps, 8100);
    assert.equal(payload.meta.provider, "anthropic");
    assert.equal(payload.meta.model, "claude-capture-test");

    const storedJobs = await sql<
      { id: string; status: string; operation: string; output_json: { suggestedTitle?: string } | null }[]
    >`select id, status, operation, output_json from ai_jobs where id = ${payload.aiJobId}`;
    const storedThoughts = await sql<
      { id: string; user_id: string; session_id: string | null; map_id: string | null; raw_text: string; source: string | null }[]
    >`select id, user_id, session_id, map_id, raw_text, source from thoughts where id = ${payload.thought.id}`;
    const storedNodes = await sql<
      { id: string; user_id: string; session_id: string | null; map_id: string; thought_id: string | null; kind: string; label: string }[]
    >`select id, user_id, session_id, map_id, thought_id, kind, label from graph_nodes where id = ${payload.graphNodeId}`;
    const storedActivity = await sql<
      { aggregate_type: string; aggregate_id: string | null; type: string; thought_id: string | null; graph_node_id: string | null; ai_job_id: string | null }[]
    >`select aggregate_type, aggregate_id, type, thought_id, graph_node_id, ai_job_id from activity_events where ai_job_id = ${payload.aiJobId}`;

    assert.equal(storedJobs.length, 1);
    assert.equal(storedJobs[0].status, "succeeded");
    assert.equal(storedJobs[0].operation, "captureThought");
    assert.equal(storedJobs[0].output_json?.suggestedTitle, "Capture loop");
    assert.equal(storedThoughts.length, 1);
    assert.equal(storedThoughts[0].user_id, userId);
    assert.equal(storedThoughts[0].session_id, sessionId);
    assert.equal(storedThoughts[0].map_id, mapId);
    assert.equal(storedThoughts[0].raw_text, "Penny should capture raw ideas and extract reviewable claims.");
    assert.equal(storedThoughts[0].source, "ai.capture-thought");
    assert.equal(storedNodes.length, 1);
    assert.equal(storedNodes[0].user_id, userId);
    assert.equal(storedNodes[0].session_id, sessionId);
    assert.equal(storedNodes[0].map_id, mapId);
    assert.equal(storedNodes[0].thought_id, payload.thought.id);
    assert.equal(storedNodes[0].kind, "thought");
    assert.equal(storedNodes[0].label, "Capture loop");
    assert.equal(storedActivity.length, 1);
    assert.equal(storedActivity[0].aggregate_type, "thought");
    assert.equal(storedActivity[0].aggregate_id, payload.thought.id);
    assert.equal(storedActivity[0].type, "thought.captured");
    assert.equal(storedActivity[0].thought_id, payload.thought.id);
    assert.equal(storedActivity[0].graph_node_id, payload.graphNodeId);
    assert.equal(storedActivity[0].ai_job_id, payload.aiJobId);
  } finally {
    restoreDeps(originalDeps);
    await sql.end({ timeout: 1 });
  }
});

test("POST /ai/capture-thought uses the mock provider without OPENAI_API_KEY and records the AI job lifecycle", async () => {
  const originalDeps = snapshotDeps();
  const previousOpenAIKey = process.env.OPENAI_API_KEY;
  const previousMockModel = process.env.MOCK_AI_MODEL;
  const sql = postgres(databaseUrl, { prepare: false });
  const userId = "00000000-0000-0000-0000-000000000124";
  const mapId = "00000000-0000-0000-0000-000000000457";
  const sessionId = "00000000-0000-0000-0000-000000000790";
  let mockCalls = 0;

  delete process.env.OPENAI_API_KEY;
  process.env.MOCK_AI_MODEL = "mock-ai-job-test";

  captureThoughtDeps.invokeAnthropicStructured = async () => {
    throw new Error("anthropic should not be called when mock provider is forced");
  };
  captureThoughtDeps.invokeOpenAIStructured = async () => {
    throw new Error("openai should not be called without OPENAI_API_KEY");
  };
  captureThoughtDeps.invokeXaiStructured = async () => {
    throw new Error("xai should not be called when mock provider is forced");
  };
  captureThoughtDeps.invokeMockStructured = async () => {
    mockCalls += 1;

    return {
      output: {
        thought: {
          title: "Mock AI job lifecycle",
          summary: "The mock provider produced structured capture output without live API credentials.",
        },
        claims: [
          {
            text: "AI endpoint tests should persist structured AI job output without live provider keys.",
            confidenceBps: 8300,
            rationale: "The route is running under forced mock provider configuration.",
          },
        ],
      },
      usage: {
        inputTokens: 12,
        outputTokens: 18,
        totalTokens: 30,
      },
      cost: {
        totalUsd: 0,
        currency: "USD",
      },
    };
  };

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Mock AI job map"})
    `;
    await sql`
      insert into workspace_contexts (user_id, map_id, mode)
      values (${userId}, ${mapId}, ${"brain"})
      on conflict (user_id) do update set map_id = excluded.map_id, mode = excluded.mode
    `;

    const response = await POST(
      request(
        {
          text: "Test the AI job lifecycle with the mock provider.",
          sessionId,
        },
        {
          "x-user-id": userId,
          "x-request-id": "capture-route-mock-ai-job",
        },
      ),
    );

    assert.equal(response.status, 201);
    assert.equal(mockCalls, 1);

    const payload = (await response.json()) as {
      aiJobId: string;
      meta: {
        model: string;
        provider: string;
      };
    };

    assert.match(payload.aiJobId, /^[0-9a-f-]{36}$/i);
    assert.equal(payload.meta.provider, "mock");
    assert.equal(payload.meta.model, "mock-ai-job-test");

    const storedJobs = await sql<
      {
        id: string;
        status: string;
        operation: string;
        input_json: {
          mapId?: string;
          requestId?: string;
          sessionId?: string | null;
          text?: string;
        } | null;
        output_json: {
          claims?: Array<{ confidenceBps?: number; text?: string }>;
          meta?: { model?: string; provider?: string };
          suggestedTitle?: string;
          thought?: { summary?: string; title?: string };
        } | null;
        started_at: Date | null;
        completed_at: Date | null;
      }[]
    >`select id, status, operation, input_json, output_json, started_at, completed_at from ai_jobs where id = ${payload.aiJobId}`;

    assert.equal(storedJobs.length, 1);

    const job = storedJobs[0];

    assert.equal(job.id, payload.aiJobId);
    assert.equal(job.operation, "captureThought");
    assert.equal(job.status, "succeeded");
    assert.ok(job.started_at, "AI job should record when execution started");
    assert.ok(job.completed_at, "AI job should record when execution completed");
    assert.ok(job.completed_at >= job.started_at);
    assert.deepEqual(job.input_json, {
      text: "Test the AI job lifecycle with the mock provider.",
      sessionId,
      mapId,
      requestId: "capture-route-mock-ai-job",
    });
    assert.equal(job.output_json?.suggestedTitle, "Mock AI job lifecycle");
    assert.equal(job.output_json?.thought?.title, "Mock AI job lifecycle");
    assert.equal(job.output_json?.claims?.length, 1);
    assert.equal(job.output_json?.claims?.[0]?.confidenceBps, 8300);
    assert.equal(job.output_json?.meta?.provider, "mock");
    assert.equal(job.output_json?.meta?.model, "mock-ai-job-test");
  } finally {
    restoreDeps(originalDeps);
    restoreEnv("OPENAI_API_KEY", previousOpenAIKey);
    restoreEnv("MOCK_AI_MODEL", previousMockModel);
    await sql.end({ timeout: 1 });
  }
});

test("POST /ai/capture-thought requires a selected workspace map before provider execution", async () => {
  const originalDeps = snapshotDeps();
  const userId = "00000000-0000-0000-0000-000000000321";

  captureThoughtDeps.invokeAnthropicStructured = async () => {
    throw new Error("provider should not be called without a selected map");
  };

  try {
    const response = await POST(
      request(
        {
          text: "Capture without a selected map.",
        },
        {
          "x-user-id": userId,
        },
      ),
    );

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: "A selected workspace map is required to capture a thought.",
    });
  } finally {
    restoreDeps(originalDeps);
  }
});

test("POST /ai/capture-thought validates request body shape", async () => {
  const response = await POST(
    request(
      {
        text: "",
      },
      {
        "x-user-id": "00000000-0000-0000-0000-000000000123",
      },
    ),
  );

  assert.equal(response.status, 400);

  const payload = (await response.json()) as { error: string; issues: string[] };

  assert.equal(payload.error, "text must be at least 1 character(s).");
  assert.deepEqual(payload.issues, ["text must be at least 1 character(s)."]);
});
