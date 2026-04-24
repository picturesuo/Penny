import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { POST } from "../../apps/web/app/api/confidence/route.ts";
import { GET as getConfidenceHistory } from "../../apps/web/app/api/confidence/[targetType]/[targetId]/history/route.ts";

const PG_PORT = 63000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_confidence_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-confidence-route-"));

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

function confidenceRequest(userId: string, body: Record<string, unknown>) {
  return new Request("http://localhost/api/confidence", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
      "x-request-id": "confidence-route-test-request",
    },
    body: JSON.stringify(body),
  });
}

function confidenceHistoryRequest(userId: string, targetType: string, targetId: string) {
  return new Request(`http://localhost/api/confidence/${targetType}/${targetId}/history`, {
    method: "GET",
    headers: {
      "x-user-id": userId,
    },
  });
}

let seedCounter = 0;

function testUuid(value: number) {
  return `00000000-0000-0000-0000-${String(value).padStart(12, "0")}`;
}

async function seedWorkspace(sql: postgres.Sql) {
  const base = 140_000 + seedCounter++ * 100;
  const userId = testUuid(base + 1);
  const otherUserId = testUuid(base + 2);
  const mapId = testUuid(base + 11);
  const otherMapId = testUuid(base + 12);
  const thoughtId = testUuid(base + 21);
  const claimId = testUuid(base + 31);
  const graphNodeId = testUuid(base + 41);
  const otherClaimId = testUuid(base + 32);

  await sql`
    insert into maps (id, user_id, title)
    values
      (${mapId}, ${userId}, ${"Confidence map"}),
      (${otherMapId}, ${otherUserId}, ${"Other confidence map"})
    on conflict (id) do nothing
  `;

  await sql`
    insert into thoughts (id, user_id, map_id, raw_text, source)
    values (${thoughtId}, ${userId}, ${mapId}, ${"Confidence thought"}, ${"capture"})
    on conflict (id) do nothing
  `;

  await sql`
    insert into claims (id, map_id, user_id, body, confidence_bps)
    values
      (${claimId}, ${mapId}, ${userId}, ${"Confidence should be explicit"}, ${5100}),
      (${otherClaimId}, ${otherMapId}, ${otherUserId}, ${"Other user claim"}, ${6200})
    on conflict (id) do nothing
  `;

  await sql`
    insert into graph_nodes (id, user_id, map_id, kind, label)
    values (${graphNodeId}, ${userId}, ${mapId}, ${"context"}, ${"Confidence graph node"})
    on conflict (id) do nothing
  `;

  const graphNodes = await sql<{ id: string }[]>`
    select id
    from graph_nodes
    where id = ${graphNodeId}
      and user_id = ${userId}
  `;

  assert.ok(graphNodes[0]?.id);

  return { userId, otherClaimId, thoughtId, claimId, graphNodeId: graphNodes[0].id };
}

test("POST /api/confidence records percent confidence for an owned claim", async () => {
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const seeded = await seedWorkspace(sql);
    const response = await POST(
      confidenceRequest(seeded.userId, {
        claimId: seeded.claimId,
        confidence: 74,
        rationale: "Enough evidence to proceed.",
      }),
    );

    assert.equal(response.status, 201);

    const payload = (await response.json()) as {
      confidence: {
        id: string;
        claimId: string | null;
        thoughtId: string | null;
        graphNodeId: string | null;
        ratingBps: number;
        confidence: number;
        rationale: string | null;
        source: string;
        createdAt: string;
      };
    };

    assert.equal(payload.confidence.claimId, seeded.claimId);
    assert.equal(payload.confidence.thoughtId, null);
    assert.equal(payload.confidence.graphNodeId, null);
    assert.equal(payload.confidence.ratingBps, 7400);
    assert.equal(payload.confidence.confidence, 74);
    assert.equal(payload.confidence.rationale, "Enough evidence to proceed.");
    assert.equal(payload.confidence.source, "manual");
    assert.match(payload.confidence.createdAt, /^\d{4}-\d{2}-\d{2}T/);

    const rows = await sql<Array<{ rating_bps: number; claim_id: string | null; source: string }>>`
      select rating_bps, claim_id, source
      from confidence_ratings
      where id = ${payload.confidence.id}
    `;
    assert.deepEqual([...rows], [{ rating_bps: 7400, claim_id: seeded.claimId, source: "manual" }]);

    const events = await sql<Array<{ type: string; aggregate_type: string; aggregate_id: string; request_id: string }>>`
      select type, aggregate_type, aggregate_id, request_id
      from moves_events
      where payload_json->>'confidenceRatingId' = ${payload.confidence.id}
    `;
    assert.deepEqual([...events], [
      {
        type: "confidence.recorded",
        aggregate_type: "claim",
        aggregate_id: seeded.claimId,
        request_id: "confidence-route-test-request",
      },
    ]);

    const activityEvents = await sql<
      Array<{
        type: string;
        aggregate_type: string;
        aggregate_id: string | null;
        claim_id: string | null;
        confidence_rating_id: string | null;
        request_id: string | null;
        payload_json: {
          confidenceRatingId?: unknown;
          ratingBps?: unknown;
          source?: unknown;
          target?: { type?: unknown; id?: unknown };
        };
      }>
    >`
      select type, aggregate_type, aggregate_id, claim_id, confidence_rating_id, request_id, payload_json
      from activity_events
      where confidence_rating_id = ${payload.confidence.id}
    `;
    assert.deepEqual([...activityEvents], [
      {
        type: "confidence.recorded",
        aggregate_type: "claim",
        aggregate_id: seeded.claimId,
        claim_id: seeded.claimId,
        confidence_rating_id: payload.confidence.id,
        request_id: "confidence-route-test-request",
        payload_json: {
          confidenceRatingId: payload.confidence.id,
          ratingBps: 7400,
          source: "manual",
          target: {
            type: "claim",
            id: seeded.claimId,
          },
        },
      },
    ]);
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("POST /api/confidence records ratingBps for an owned graph node", async () => {
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const seeded = await seedWorkspace(sql);
    const response = await POST(
      confidenceRequest(seeded.userId, {
        graphNodeId: seeded.graphNodeId,
        ratingBps: 8250,
        source: "graph-inspector",
      }),
    );

    assert.equal(response.status, 201);

    const payload = (await response.json()) as {
      confidence: {
        graphNodeId: string | null;
        ratingBps: number;
        confidence: number;
        source: string;
      };
    };

    assert.equal(payload.confidence.graphNodeId, seeded.graphNodeId);
    assert.equal(payload.confidence.ratingBps, 8250);
    assert.equal(payload.confidence.confidence, 82.5);
    assert.equal(payload.confidence.source, "graph-inspector");
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("POST /api/confidence records confidence for an owned thought", async () => {
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const seeded = await seedWorkspace(sql);
    const response = await POST(
      confidenceRequest(seeded.userId, {
        thoughtId: seeded.thoughtId,
        confidence: 25,
      }),
    );

    assert.equal(response.status, 201);

    const payload = (await response.json()) as {
      confidence: {
        thoughtId: string | null;
        ratingBps: number;
      };
    };

    assert.equal(payload.confidence.thoughtId, seeded.thoughtId);
    assert.equal(payload.confidence.ratingBps, 2500);
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("POST /api/confidence validates confidence as 0 through 100 inclusive", async () => {
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const seeded = await seedWorkspace(sql);
    const lowResponse = await POST(
      confidenceRequest(seeded.userId, {
        claimId: seeded.claimId,
        confidence: 0,
      }),
    );
    const highResponse = await POST(
      confidenceRequest(seeded.userId, {
        claimId: seeded.claimId,
        confidence: 100,
      }),
    );
    const decimalResponse = await POST(
      confidenceRequest(seeded.userId, {
        claimId: seeded.claimId,
        confidence: 75.5,
      }),
    );
    const negativeResponse = await POST(
      confidenceRequest(seeded.userId, {
        claimId: seeded.claimId,
        confidence: -1,
      }),
    );
    const overRangeResponse = await POST(
      confidenceRequest(seeded.userId, {
        claimId: seeded.claimId,
        confidence: 100.01,
      }),
    );

    assert.equal(lowResponse.status, 201);
    assert.equal(highResponse.status, 201);
    assert.equal(decimalResponse.status, 201);
    assert.equal(negativeResponse.status, 400);
    assert.equal(overRangeResponse.status, 400);

    const lowPayload = (await lowResponse.json()) as { confidence: { confidence: number; ratingBps: number } };
    const highPayload = (await highResponse.json()) as { confidence: { confidence: number; ratingBps: number } };
    const decimalPayload = (await decimalResponse.json()) as { confidence: { confidence: number; ratingBps: number } };

    assert.deepEqual(
      [
        { confidence: lowPayload.confidence.confidence, ratingBps: lowPayload.confidence.ratingBps },
        { confidence: highPayload.confidence.confidence, ratingBps: highPayload.confidence.ratingBps },
        { confidence: decimalPayload.confidence.confidence, ratingBps: decimalPayload.confidence.ratingBps },
      ],
      [
        { confidence: 0, ratingBps: 0 },
        { confidence: 100, ratingBps: 10_000 },
        { confidence: 75.5, ratingBps: 7550 },
      ],
    );

    assert.deepEqual(await negativeResponse.json(), {
      error: "confidence must be a number between 0 and 100.",
    });
    assert.deepEqual(await overRangeResponse.json(), {
      error: "confidence must be a number between 0 and 100.",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("POST /api/confidence rejects invalid target and rating input", async () => {
  const userId = "00000000-0000-0000-0000-000000014901";

  const responses = await Promise.all([
    POST(confidenceRequest(userId, { confidence: 50 })),
    POST(
      confidenceRequest(userId, {
        thoughtId: "00000000-0000-0000-0000-000000014902",
        claimId: "00000000-0000-0000-0000-000000014903",
        confidence: 50,
      }),
    ),
    POST(
      confidenceRequest(userId, {
        claimId: "not-a-uuid",
        confidence: 50,
      }),
    ),
    POST(
      confidenceRequest(userId, {
        claimId: "00000000-0000-0000-0000-000000014904",
        confidence: 101,
      }),
    ),
    POST(
      confidenceRequest(userId, {
        claimId: "00000000-0000-0000-0000-000000014905",
        ratingBps: 10_001,
      }),
    ),
    POST(
      confidenceRequest(userId, {
        claimId: "00000000-0000-0000-0000-000000014906",
        confidence: 50,
        ratingBps: 5000,
      }),
    ),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error: string };
    assert.match(payload.error, /required|UUID|between|Exactly one/);
  }
});

test("POST /api/confidence rejects missing or cross-user targets", async () => {
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const seeded = await seedWorkspace(sql);
    const response = await POST(
      confidenceRequest(seeded.userId, {
        claimId: seeded.otherClaimId,
        confidence: 50,
      }),
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: "Confidence target not found.",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("GET /api/confidence/:targetType/:targetId/history returns owned rating history newest first", async () => {
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const seeded = await seedWorkspace(sql);

    await sql`
      delete from confidence_ratings
      where user_id = ${seeded.userId}
    `;

    await sql`
      insert into confidence_ratings (id, user_id, claim_id, rating_bps, rationale, source, created_at)
      values
        (${"00000000-0000-0000-0000-000000014601"}, ${seeded.userId}, ${seeded.claimId}, ${5100}, ${"Initial estimate"}, ${"manual"}, ${"2026-04-24T10:00:00.000Z"}),
        (${"00000000-0000-0000-0000-000000014602"}, ${seeded.userId}, ${seeded.claimId}, ${7400}, ${"Evidence improved confidence"}, ${"challenge"}, ${"2026-04-24T11:00:00.000Z"}),
        (${"00000000-0000-0000-0000-000000014603"}, ${seeded.userId}, ${seeded.thoughtId}, ${2500}, ${"Thought-only rating"}, ${"manual"}, ${"2026-04-24T12:00:00.000Z"})
    `;

    const response = await getConfidenceHistory(confidenceHistoryRequest(seeded.userId, "claim", seeded.claimId), {
      params: {
        targetType: "claim",
        targetId: seeded.claimId,
      },
    });

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      target: { type: string; id: string };
      history: Array<{
        id: string;
        ratingBps: number;
        confidence: number;
        rationale: string | null;
        source: string;
        createdAt: string;
      }>;
    };

    assert.deepEqual(payload.target, {
      type: "claim",
      id: seeded.claimId,
    });
    assert.deepEqual(
      payload.history.map((rating) => ({
        id: rating.id,
        ratingBps: rating.ratingBps,
        confidence: rating.confidence,
        rationale: rating.rationale,
        source: rating.source,
        createdAt: rating.createdAt,
      })),
      [
        {
          id: "00000000-0000-0000-0000-000000014602",
          ratingBps: 7400,
          confidence: 74,
          rationale: "Evidence improved confidence",
          source: "challenge",
          createdAt: "2026-04-24T11:00:00.000Z",
        },
        {
          id: "00000000-0000-0000-0000-000000014601",
          ratingBps: 5100,
          confidence: 51,
          rationale: "Initial estimate",
          source: "manual",
          createdAt: "2026-04-24T10:00:00.000Z",
        },
      ],
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("GET /api/confidence/:targetType/:targetId/history supports graph node aliases", async () => {
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const seeded = await seedWorkspace(sql);

    await sql`
      insert into confidence_ratings (id, user_id, graph_node_id, rating_bps, rationale, source, created_at)
      values (${"00000000-0000-0000-0000-000000014701"}, ${seeded.userId}, ${seeded.graphNodeId}, ${8250}, ${null}, ${"graph-inspector"}, ${"2026-04-24T13:00:00.000Z"})
      on conflict (id) do nothing
    `;

    const response = await getConfidenceHistory(confidenceHistoryRequest(seeded.userId, "graph-node", seeded.graphNodeId), {
      params: {
        targetType: "graph-node",
        targetId: seeded.graphNodeId,
      },
    });

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      target: { type: string; id: string };
      history: Array<{ id: string; ratingBps: number; confidence: number; source: string }>;
    };

    assert.deepEqual(payload.target, {
      type: "graph_node",
      id: seeded.graphNodeId,
    });
    assert.ok(
      payload.history.some(
        (rating) =>
          rating.id === "00000000-0000-0000-0000-000000014701" &&
          rating.ratingBps === 8250 &&
          rating.confidence === 82.5 &&
          rating.source === "graph-inspector",
      ),
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("GET /api/confidence/:targetType/:targetId/history validates target params and ownership", async () => {
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const seeded = await seedWorkspace(sql);
    const invalidTypeResponse = await getConfidenceHistory(confidenceHistoryRequest(seeded.userId, "map", seeded.claimId), {
      params: {
        targetType: "map",
        targetId: seeded.claimId,
      },
    });
    const invalidIdResponse = await getConfidenceHistory(confidenceHistoryRequest(seeded.userId, "claim", "not-a-uuid"), {
      params: {
        targetType: "claim",
        targetId: "not-a-uuid",
      },
    });
    const crossUserResponse = await getConfidenceHistory(confidenceHistoryRequest(seeded.userId, "claim", seeded.otherClaimId), {
      params: {
        targetType: "claim",
        targetId: seeded.otherClaimId,
      },
    });

    assert.equal(invalidTypeResponse.status, 400);
    assert.deepEqual(await invalidTypeResponse.json(), {
      error: "targetType must be thought, claim, or graphNode.",
    });
    assert.equal(invalidIdResponse.status, 400);
    assert.deepEqual(await invalidIdResponse.json(), {
      error: "Invalid target id. Expected a UUID.",
    });
    assert.equal(crossUserResponse.status, 404);
    assert.deepEqual(await crossUserResponse.json(), {
      error: "Confidence target not found.",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});
