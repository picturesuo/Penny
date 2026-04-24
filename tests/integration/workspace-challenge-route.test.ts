import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { GET } from "../../apps/web/app/api/workspace/challenge/route";

const PG_PORT = 60000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_workspace_challenge_route_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-challenge-route-"));

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

test("GET /api/workspace/challenge returns shell context, active claim, latest challenge round, and placeholder critique state", async () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  const mapId = "00000000-0000-0000-0000-000000000321";
  const claimId = "00000000-0000-0000-0000-000000000456";
  const olderRoundId = "00000000-0000-0000-0000-000000000654";
  const latestRoundId = "00000000-0000-0000-0000-000000000777";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Challenge map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values (${claimId}, ${mapId}, ${userId}, ${"Selected challenge claim"}, ${6300})
    `;

    await sql`
      insert into challenge_rounds (id, map_id, claim_id, user_id, status, created_at, updated_at)
      values
        (${olderRoundId}, ${mapId}, ${claimId}, ${userId}, ${"queued"}, ${"2026-04-23T22:40:00.000Z"}, ${"2026-04-23T22:40:00.000Z"}),
        (${latestRoundId}, ${mapId}, ${claimId}, ${userId}, ${"ready"}, ${"2026-04-23T22:41:00.000Z"}, ${"2026-04-23T22:41:00.000Z"})
    `;

    await sql`
      insert into workspace_contexts (user_id, map_id, claim_id, mode)
      values (${userId}, ${mapId}, ${claimId}, ${"challenge"})
    `;

    const response = await GET(
      new Request("http://localhost/api/workspace/challenge", {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      shellContext: {
        mode: string;
        mapId: string | null;
        claimId: string | null;
        breadcrumbItems: Array<{
          kind: string;
          id: string;
          label: string;
        }>;
      };
      activeClaim: {
        id: string;
        mapId: string;
        userId: string;
        body: string;
        confidenceBps: number;
        createdAt: string;
        updatedAt: string;
      } | null;
      activeChallengeRound: {
        id: string;
        mapId: string;
        claimId: string;
        userId: string;
        status: string;
        createdAt: string;
        updatedAt: string;
      } | null;
      critiqueState: {
        status: string;
        critiqueId: string | null;
      };
    };

    assert.deepEqual(payload.shellContext, {
      mode: "challenge",
      mapId,
      claimId,
      breadcrumbItems: [
        {
          kind: "map",
          id: mapId,
          label: "Challenge map",
        },
        {
          kind: "claim",
          id: claimId,
          label: "Selected challenge claim",
        },
      ],
    });

    assert.ok(payload.activeClaim);
    assert.equal(payload.activeClaim?.id, claimId);
    assert.equal(payload.activeClaim?.body, "Selected challenge claim");
    assert.equal(payload.activeClaim?.confidenceBps, 6300);

    assert.ok(payload.activeChallengeRound);
    assert.equal(payload.activeChallengeRound?.id, latestRoundId);
    assert.equal(payload.activeChallengeRound?.claimId, claimId);
    assert.equal(payload.activeChallengeRound?.status, "ready");

    assert.deepEqual(payload.critiqueState, {
      status: "not_requested",
      critiqueId: null,
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("GET /api/workspace/challenge returns a ready critique when one exists for the active round", async () => {
  const userId = "00000000-0000-0000-0000-000000000124";
  const mapId = "00000000-0000-0000-0000-000000000322";
  const claimId = "00000000-0000-0000-0000-000000000457";
  const roundId = "00000000-0000-0000-0000-000000000778";
  const critiqueId = "00000000-0000-0000-0000-000000000779";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Challenge critique map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values (${claimId}, ${mapId}, ${userId}, ${"Selected critique claim"}, ${6100})
    `;

    await sql`
      insert into challenge_rounds (id, map_id, claim_id, user_id, status)
      values (${roundId}, ${mapId}, ${claimId}, ${userId}, ${"started"})
    `;

    await sql`
      insert into challenge_critiques (id, round_id, map_id, claim_id, user_id, status, body)
      values (${critiqueId}, ${roundId}, ${mapId}, ${claimId}, ${userId}, ${"ready"}, ${"Main challenge: The claim needs boundaries."})
    `;

    await sql`
      insert into moves_events (user_id, aggregate_type, aggregate_id, type, payload_json, request_id)
      values (
        ${userId},
        ${"challenge_critique"},
        ${critiqueId},
        ${"challenge.critique.generated"},
        ${JSON.stringify({
          roundId,
          mapId,
          claimId,
          status: "ready",
          body: "Main challenge: The claim needs boundaries.",
          critiqueJson: {
            conciseCritiqueSummary: "The claim needs boundaries.",
            strongestCounterargument: "Some users will commit before a hard boundary is clear.",
            assumptions: ["All users evaluate the same way."],
            likelyFailureModes: ["The team optimizes around one persona."],
            followUpQuestions: ["Which audience segment breaks the claim first?"],
            suggestedConfidenceDelta: -10,
            uncertaintyNote: "Behavior can differ by deal size.",
          },
          provider: "test-provider",
          model: "test-model",
          promptVersion: "test-prompt-v1",
        })}::jsonb,
        ${"workspace-challenge-generated-event"}
      )
    `;

    await sql`
      insert into workspace_contexts (user_id, map_id, claim_id, mode)
      values (${userId}, ${mapId}, ${claimId}, ${"challenge"})
    `;

    const response = await GET(
      new Request("http://localhost/api/workspace/challenge", {
        method: "GET",
        headers: {
          "x-user-id": userId,
        },
      }),
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      critiqueState: {
        status: string;
        critiqueId: string | null;
        body?: string;
        critiquePayload?: unknown;
        provider?: string;
        model?: string;
        promptVersion?: string;
      };
    };

    assert.deepEqual(payload.critiqueState, {
      status: "ready",
      critiqueId,
      body: "Main challenge: The claim needs boundaries.",
      critiquePayload: {
        critique: {
          conciseCritiqueSummary: "The claim needs boundaries.",
          strongestCounterargument: "Some users will commit before a hard boundary is clear.",
          assumptions: ["All users evaluate the same way."],
          likelyFailureModes: ["The team optimizes around one persona."],
          followUpQuestions: ["Which audience segment breaks the claim first?"],
          suggestedConfidenceDelta: -10,
          uncertaintyNote: "Behavior can differ by deal size.",
        },
        metadata: {
          provider: "test-provider",
          model: "test-model",
          promptVersion: "test-prompt-v1",
        },
      },
      provider: "test-provider",
      model: "test-model",
      promptVersion: "test-prompt-v1",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});
