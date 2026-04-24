import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { POST as extractClaims } from "../../apps/web/app/ai/extract-claims/route.ts";
import { GET as getClaims } from "../../apps/web/app/api/claims/route.ts";
import { POST as createMap } from "../../apps/web/app/api/commands/maps/create/route.ts";
import { GET as searchWorkspace } from "../../apps/web/app/api/search/route.ts";
import { extractClaimsDeps } from "../../server/ai/operations/extractClaims.ts";
import { createMockAiProvider } from "../../server/ai/providers/mock.ts";

const PG_PORT = 64000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_claims_maps_mvp_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-claims-maps-mvp-"));

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

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function seedThought(sql: postgres.Sql, input: { userId: string; mapId: string }) {
  const thoughtId = randomUUID();

  await sql`
    insert into thoughts (id, user_id, map_id, raw_text, source, metadata_json)
    values (
      ${thoughtId},
      ${input.userId},
      ${input.mapId},
      ${"Penny should preserve raw thought provenance when claims are created."},
      ${"test"},
      ${JSON.stringify({ summary: "A test thought about claim provenance." })}::jsonb
    )
  `;

  const thoughtNodes = await sql<{ id: string }[]>`
    select id
    from graph_nodes
    where user_id = ${input.userId}
      and map_id = ${input.mapId}
      and thought_id = ${thoughtId}
      and kind = ${"thought"}
  `;

  assert.ok(thoughtNodes[0]?.id, "seeded thought should create a graph node");

  return { thoughtId, thoughtNodeId: thoughtNodes[0].id };
}

test("MVP user can create and retrieve a map", async () => {
  const userId = "00000000-0000-0000-0000-000000041001";
  const title = "MVP map retrieval test";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const createResponse = await createMap(
      jsonRequest(
        "http://localhost/api/commands/maps/create",
        { title },
        {
          "x-user-id": userId,
          "x-request-id": "claims-maps-mvp-map-1",
        },
      ),
    );

    assert.equal(createResponse.status, 201);

    const createPayload = (await createResponse.json()) as { mapId: string };

    assert.match(createPayload.mapId, /^[0-9a-f-]{36}$/i);

    const searchResponse = await searchWorkspace(
      new Request(`http://localhost/api/search?q=${encodeURIComponent(title)}`, {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(searchResponse.status, 200);

    const searchPayload = (await searchResponse.json()) as {
      results: Array<{ id: string; type: string; title: string; subtitle: string | null }>;
    };
    const retrievedMap = searchPayload.results.find((result) => result.type === "map");

    assert.ok(retrievedMap);
    assert.deepEqual(
      {
        id: retrievedMap.id,
        type: retrievedMap.type,
        title: retrievedMap.title,
        subtitle: retrievedMap.subtitle,
      },
      {
        id: createPayload.mapId,
        type: "map",
        title,
        subtitle: "Map",
      },
    );

    const storedMaps = await sql<{ id: string; user_id: string; title: string }[]>`
      select id, user_id, title
      from maps
      where id = ${createPayload.mapId}
    `;

    assert.deepEqual(
      storedMaps.map((map) => ({
        id: map.id,
        user_id: map.user_id,
        title: map.title,
      })),
      [
        {
          id: createPayload.mapId,
          user_id: userId,
          title,
        },
      ],
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("MVP user can create and list claims linked to a thought", async () => {
  const originalDeps = snapshotDeps();
  const userId = "00000000-0000-0000-0000-000000041002";
  const mapId = randomUUID();
  const sql = postgres(databaseUrl, { prepare: false });

  extractClaimsDeps.createProvider = () =>
    createMockAiProvider({
      output: {
        claims: [
          {
            text: "Penny should preserve raw thought provenance when claims are created.",
            confidenceBps: 8200,
            rationale: "The source thought explicitly asks for provenance.",
          },
        ],
      },
    });
  extractClaimsDeps.createMockProvider = () => createMockAiProvider();

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"MVP thought claim map"})
    `;

    const seeded = await seedThought(sql, { userId, mapId });
    const createResponse = await extractClaims(
      jsonRequest(
        "http://localhost/ai/extract-claims",
        { thoughtId: seeded.thoughtId },
        {
          "x-user-id": userId,
          "x-request-id": "claims-maps-mvp-claim-1",
        },
      ),
    );

    assert.equal(createResponse.status, 201);

    const createPayload = (await createResponse.json()) as {
      thoughtId: string;
      claims: Array<{ id: string; body: string; confidenceBps: number; graphNodeId: string }>;
    };

    assert.equal(createPayload.thoughtId, seeded.thoughtId);
    assert.equal(createPayload.claims.length, 1);
    assert.equal(createPayload.claims[0]?.body, "Penny should preserve raw thought provenance when claims are created.");
    assert.equal(createPayload.claims[0]?.confidenceBps, 8200);

    const listResponse = await getClaims(
      new Request(`http://localhost/api/claims?thoughtId=${seeded.thoughtId}`, {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(listResponse.status, 200);

    const listPayload = (await listResponse.json()) as {
      claims: Array<{ id: string; mapId: string; thoughtId: string | null; body: string; confidenceBps: number }>;
    };

    assert.deepEqual(
      listPayload.claims.map((claim) => ({
        id: claim.id,
        mapId: claim.mapId,
        thoughtId: claim.thoughtId,
        body: claim.body,
        confidenceBps: claim.confidenceBps,
      })),
      [
        {
          id: createPayload.claims[0]?.id,
          mapId,
          thoughtId: seeded.thoughtId,
          body: "Penny should preserve raw thought provenance when claims are created.",
          confidenceBps: 8200,
        },
      ],
    );

    const storedGraphNodes = await sql<
      { id: string; claim_id: string | null; thought_id: string | null; kind: string; label: string }[]
    >`
      select id, claim_id, thought_id, kind, label
      from graph_nodes
      where claim_id = ${createPayload.claims[0]?.id}
    `;

    assert.deepEqual(
      storedGraphNodes.map((node) => ({
        id: node.id,
        claim_id: node.claim_id,
        thought_id: node.thought_id,
        kind: node.kind,
        label: node.label,
      })),
      [
        {
          id: createPayload.claims[0]?.graphNodeId,
          claim_id: createPayload.claims[0]?.id,
          thought_id: seeded.thoughtId,
          kind: "claim",
          label: "Penny should preserve raw thought provenance when claims are created.",
        },
      ],
    );
  } finally {
    restoreDeps(originalDeps);
    await sql.end({ timeout: 1 });
  }
});
