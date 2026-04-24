import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { GET as getBrainView } from "../../../apps/web/app/api/workspace/brain/route.ts";
import { GET as getChallengeView } from "../../../apps/web/app/api/workspace/challenge/route.ts";
import { GET as getLearnView } from "../../../apps/web/app/api/workspace/learn/route.ts";
import { GET as getShellView } from "../../../apps/web/app/api/workspace/shell/route.ts";

const PG_PORT = 61000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_projection_workspace_read_routes_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-projection-routes-"));

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
    run("pg_ctl", ["-D", PGDATA_DIR, "stop", "-m", "fast"]);
  } finally {
    rmSync(PGDATA_DIR, { recursive: true, force: true });
  }
});

function requestFor(route: string, userId: string) {
  return new Request(`http://localhost${route}`, {
    method: "GET",
    headers: {
      "x-user-id": userId,
    },
  });
}

test("workspace GET routes return shell, brain, challenge, and learn projections", async () => {
  const userId = "00000000-0000-0000-0000-000000000901";
  const mapId = "00000000-0000-0000-0000-000000000902";
  const selectedClaimId = "00000000-0000-0000-0000-000000000903";
  const otherClaimId = "00000000-0000-0000-0000-000000000904";
  const roundId = "00000000-0000-0000-0000-000000000905";
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    await sql`
      insert into maps (id, user_id, title)
      values (${mapId}, ${userId}, ${"Projection route map"})
    `;

    await sql`
      insert into claims (id, map_id, user_id, body, confidence_bps)
      values
        (${selectedClaimId}, ${mapId}, ${userId}, ${"Selected projection claim"}, ${7200}),
        (${otherClaimId}, ${mapId}, ${userId}, ${"Other projection claim"}, ${4100})
    `;

    await sql`
      insert into challenge_rounds (id, map_id, claim_id, user_id, status)
      values (${roundId}, ${mapId}, ${selectedClaimId}, ${userId}, ${"responded"})
    `;

    await sql`
      insert into moves_events (user_id, aggregate_type, aggregate_id, type, payload_json, request_id)
      values (
        ${userId},
        ${"challenge_round"},
        ${roundId},
        ${"challenge.response.recorded"},
        ${JSON.stringify({
          mapId,
          claimId: selectedClaimId,
          response: "Route-level response to the active challenge.",
          responsePath: "direct",
          confidenceBps: 7600,
          previousStatus: "started",
          status: "responded",
        })}::jsonb,
        ${"projection-route-response-event"}
      )
    `;

    await sql`
      insert into workspace_contexts (user_id, map_id, claim_id, mode)
      values (${userId}, ${mapId}, ${selectedClaimId}, ${"challenge"})
    `;

    const [shellResponse, brainResponse, challengeResponse, learnResponse] = await Promise.all([
      getShellView(requestFor("/api/workspace/shell", userId)),
      getBrainView(requestFor("/api/workspace/brain", userId)),
      getChallengeView(requestFor("/api/workspace/challenge", userId)),
      getLearnView(requestFor("/api/workspace/learn", userId)),
    ]);

    assert.equal(shellResponse.status, 200);
    assert.equal(brainResponse.status, 200);
    assert.equal(challengeResponse.status, 200);
    assert.equal(learnResponse.status, 200);

    const shellPayload = (await shellResponse.json()) as {
      mode: string;
      mapId: string | null;
      claimId: string | null;
      breadcrumbItems: Array<{ kind: string; id: string; label: string }>;
    };
    const brainPayload = (await brainResponse.json()) as {
      workspaceContext: { mode: string; mapId: string | null; claimId: string | null };
      mapSummary: { id: string; title: string; claimCount: number } | null;
      claims: Array<{ id: string; body: string; confidenceBps: number }>;
      selectedClaim: { id: string; body: string } | null;
    };
    const challengePayload = (await challengeResponse.json()) as {
      currentContext: { mode: string; mapId: string | null; claimId: string | null };
      workspaceContext: { mode: string; mapId: string | null; claimId: string | null };
      activeClaim: { id: string; body: string; confidenceBps: number } | null;
      selectedClaim: { id: string; body: string; confidenceBps: number } | null;
      activeChallengeRound: { id: string; claimId: string; status: string } | null;
      latestChallengeRound: { id: string; claimId: string; status: string } | null;
      critiqueState: { status: string; critiqueId: string | null };
      critiqueStatus: string;
      responseState: { status: string; responsePayload?: Record<string, unknown> };
      responseStatus: string;
      responsePayload?: Record<string, unknown>;
    };
    const learnPayload = (await learnResponse.json()) as {
      workspaceContext: { mode: string; mapId: string | null; claimId: string | null };
      selectedMapId: string | null;
      selectedClaimId: string | null;
      selectedClaim: { id: string; body: string; confidenceBps: number } | null;
      learnState: { status: string; message: string };
      status: string;
      message: string;
    };

    assert.equal(shellPayload.mode, "challenge");
    assert.equal(shellPayload.mapId, mapId);
    assert.equal(shellPayload.claimId, selectedClaimId);
    assert.deepEqual(shellPayload.breadcrumbItems, [
      {
        kind: "map",
        id: mapId,
        label: "Projection route map",
      },
      {
        kind: "claim",
        id: selectedClaimId,
        label: "Selected projection claim",
      },
    ]);

    assert.deepEqual(brainPayload.workspaceContext, {
      mode: "challenge",
      mapId,
      claimId: selectedClaimId,
    });
    assert.deepEqual(brainPayload.mapSummary, {
      id: mapId,
      title: "Projection route map",
      claimCount: 2,
    });
    assert.deepEqual(
      brainPayload.claims.map((claim) => ({
        id: claim.id,
        body: claim.body,
        confidenceBps: claim.confidenceBps,
      })),
      [
        {
          id: selectedClaimId,
          body: "Selected projection claim",
          confidenceBps: 7200,
        },
        {
          id: otherClaimId,
          body: "Other projection claim",
          confidenceBps: 4100,
        },
      ],
    );
    assert.equal(brainPayload.selectedClaim?.id, selectedClaimId);

    assert.equal(challengePayload.currentContext.mode, "challenge");
    assert.equal(challengePayload.currentContext.mapId, mapId);
    assert.equal(challengePayload.currentContext.claimId, selectedClaimId);
    assert.equal(challengePayload.workspaceContext.mode, "challenge");
    assert.equal(challengePayload.workspaceContext.mapId, mapId);
    assert.equal(challengePayload.workspaceContext.claimId, selectedClaimId);
    assert.equal(challengePayload.activeClaim?.id, selectedClaimId);
    assert.equal(challengePayload.activeClaim?.confidenceBps, 7200);
    assert.equal(challengePayload.selectedClaim?.id, selectedClaimId);
    assert.equal(challengePayload.selectedClaim?.confidenceBps, 7200);
    assert.equal(challengePayload.activeChallengeRound?.id, roundId);
    assert.equal(challengePayload.activeChallengeRound?.claimId, selectedClaimId);
    assert.equal(challengePayload.activeChallengeRound?.status, "responded");
    assert.equal(challengePayload.latestChallengeRound?.id, roundId);
    assert.equal(challengePayload.latestChallengeRound?.claimId, selectedClaimId);
    assert.equal(challengePayload.latestChallengeRound?.status, "responded");
    assert.deepEqual(challengePayload.critiqueState, {
      status: "not_requested",
      critiqueId: null,
    });
    assert.equal(challengePayload.critiqueStatus, "not_requested");
    assert.equal(challengePayload.responseStatus, "responded");
    assert.deepEqual(challengePayload.responsePayload, {
      mapId,
      claimId: selectedClaimId,
      response: "Route-level response to the active challenge.",
      responsePath: "direct",
      confidenceBps: 7600,
      previousStatus: "started",
      status: "responded",
    });
    assert.deepEqual(challengePayload.responseState, {
      status: "responded",
      responsePayload: challengePayload.responsePayload,
    });

    assert.equal(learnPayload.workspaceContext.mode, "challenge");
    assert.equal(learnPayload.workspaceContext.mapId, mapId);
    assert.equal(learnPayload.workspaceContext.claimId, selectedClaimId);
    assert.equal(learnPayload.selectedMapId, mapId);
    assert.equal(learnPayload.selectedClaimId, selectedClaimId);
    assert.equal(learnPayload.selectedClaim?.id, selectedClaimId);
    assert.equal(learnPayload.selectedClaim?.confidenceBps, 7200);
    assert.equal(learnPayload.status, "placeholder");
    assert.equal(learnPayload.message, "Learn mode coming soon");
    assert.deepEqual(learnPayload.learnState, {
      status: "placeholder",
      message: "Learn mode coming soon",
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});
