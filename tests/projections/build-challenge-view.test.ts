import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import postgres from "postgres";

import { createClaim } from "../../server/commands/create-claim.ts";
import { createMap } from "../../server/commands/create-map.ts";
import { setWorkspaceSelection } from "../../server/commands/set-workspace-selection.ts";
import { createDbClient } from "../../server/db/client.ts";
import { buildChallengeView } from "../../server/projections/build-challenge-view.ts";

const PG_PORT = 61000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_build_challenge_view_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-challenge-view-"));

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

test("buildChallengeView preserves claimId after a Brain to Challenge switch", async () => {
  const userId = "00000000-0000-0000-0000-000000000888";
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const map = await createMap(
      {
        userId,
        title: "Challenge view map",
        requestId: "challenge-view-map-request",
      },
      db,
    );

    const claim = await createClaim(
      {
        userId,
        mapId: map.mapId,
        text: "  Challenge mode should preserve this claim.  ",
        requestId: "challenge-view-claim-request",
      },
      db,
    );

    await setWorkspaceSelection(
      {
        userId,
        mode: "Brain",
        mapId: map.mapId,
        claimId: claim.claimId,
        requestId: "challenge-view-brain-selection",
      },
      db,
    );

    const roundId = "00000000-0000-0000-0000-000000000999";

    await sql`
      insert into challenge_rounds (id, map_id, claim_id, user_id, status)
      values (${roundId}, ${map.mapId}, ${claim.claimId}, ${userId}, ${"started"})
    `;

    await setWorkspaceSelection(
      {
        userId,
        mode: "Challenge",
        mapId: map.mapId,
        requestId: "challenge-view-challenge-selection",
      },
      db,
    );

    const challengeView = await buildChallengeView({ userId }, db);

    assert.deepEqual(challengeView.shellContext, {
      mode: "challenge",
      mapId: map.mapId,
      claimId: claim.claimId,
      breadcrumb: [
        {
          kind: "map",
          id: map.mapId,
          label: "Challenge view map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Challenge mode should preserve this claim.",
        },
      ],
      breadcrumbItems: [
        {
          kind: "map",
          id: map.mapId,
          label: "Challenge view map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Challenge mode should preserve this claim.",
        },
      ],
    });
    assert.deepEqual(challengeView.workspaceContext, challengeView.shellContext);
    assert.deepEqual(challengeView.currentContext, challengeView.shellContext);

    assert.equal(challengeView.activeClaim?.id, claim.claimId);
    assert.equal(challengeView.activeClaim?.body, "Challenge mode should preserve this claim.");
    assert.equal(challengeView.selectedClaim?.id, claim.claimId);
    assert.equal(challengeView.selectedClaim?.body, "Challenge mode should preserve this claim.");
    assert.equal(challengeView.activeChallengeRound?.id, roundId);
    assert.equal(challengeView.activeChallengeRound?.claimId, claim.claimId);
    assert.equal(challengeView.latestChallengeRound?.id, roundId);
    assert.equal(challengeView.latestChallengeRound?.claimId, claim.claimId);
    assert.deepEqual(challengeView.critiqueState, {
      status: "not_requested",
      critiqueId: null,
    });
    assert.equal(challengeView.critiqueStatus, "not_requested");
    assert.equal(challengeView.critiquePayload, undefined);
    assert.deepEqual(challengeView.responseState, {
      status: "not_recorded",
    });
    assert.equal(challengeView.responseStatus, "not_recorded");
    assert.equal(challengeView.responsePayload, undefined);
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("buildChallengeView returns the latest ready critique state for the active round", async () => {
  const userId = "00000000-0000-0000-0000-000000000889";
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const map = await createMap(
      {
        userId,
        title: "Challenge critique map",
        requestId: "challenge-critique-map-request",
      },
      db,
    );

    const claim = await createClaim(
      {
        userId,
        mapId: map.mapId,
        text: "Buyers always need external proof before they commit.",
        requestId: "challenge-critique-claim-request",
      },
      db,
    );

    await setWorkspaceSelection(
      {
        userId,
        mode: "Challenge",
        mapId: map.mapId,
        claimId: claim.claimId,
        requestId: "challenge-critique-selection",
      },
      db,
    );

    const roundId = "00000000-0000-0000-0000-000000000998";
    const critiqueId = "00000000-0000-0000-0000-000000000997";

    await sql`
      insert into challenge_rounds (id, map_id, claim_id, user_id, status)
      values (${roundId}, ${map.mapId}, ${claim.claimId}, ${userId}, ${"started"})
    `;

    await sql`
      insert into challenge_critiques (id, round_id, map_id, claim_id, user_id, status, body)
      values (${critiqueId}, ${roundId}, ${map.mapId}, ${claim.claimId}, ${userId}, ${"ready"}, ${"Main challenge: The wording is too absolute."})
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
          mapId: map.mapId,
          claimId: claim.claimId,
          status: "ready",
          body: "Main challenge: The wording is too absolute.",
          critiqueJson: {
            conciseCritiqueSummary: "The wording is too absolute.",
            strongestCounterargument: "There are credible exceptions where buyers commit with trust instead of proof.",
            assumptions: ["Every buyer follows the same procurement process."],
            likelyFailureModes: ["The team overfits to enterprise sales."],
            followUpQuestions: ["Which segment actually requires proof before commitment?"],
            suggestedConfidenceDelta: -15,
            uncertaintyNote: "Segment mix could change the conclusion.",
          },
          provider: "test-provider",
          model: "test-model",
          promptVersion: "test-prompt-v1",
        })}::jsonb,
        ${"challenge-view-generated-event"}
      )
    `;

    const challengeView = await buildChallengeView({ userId }, db);

    assert.deepEqual(challengeView.critiqueState, {
      status: "ready",
      critiqueId,
      body: "Main challenge: The wording is too absolute.",
      critiquePayload: {
        critique: {
          conciseCritiqueSummary: "The wording is too absolute.",
          strongestCounterargument: "There are credible exceptions where buyers commit with trust instead of proof.",
          assumptions: ["Every buyer follows the same procurement process."],
          likelyFailureModes: ["The team overfits to enterprise sales."],
          followUpQuestions: ["Which segment actually requires proof before commitment?"],
          suggestedConfidenceDelta: -15,
          uncertaintyNote: "Segment mix could change the conclusion.",
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
    assert.equal(challengeView.critiqueStatus, "ready");
    assert.deepEqual(challengeView.critiquePayload, {
      critique: {
        conciseCritiqueSummary: "The wording is too absolute.",
        strongestCounterargument: "There are credible exceptions where buyers commit with trust instead of proof.",
        assumptions: ["Every buyer follows the same procurement process."],
        likelyFailureModes: ["The team overfits to enterprise sales."],
        followUpQuestions: ["Which segment actually requires proof before commitment?"],
        suggestedConfidenceDelta: -15,
        uncertaintyNote: "Segment mix could change the conclusion.",
      },
      metadata: {
        provider: "test-provider",
        model: "test-model",
        promptVersion: "test-prompt-v1",
      },
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});
