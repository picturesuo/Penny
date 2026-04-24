import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";

import { createClaim } from "../../server/commands/create-claim.ts";
import { createMap } from "../../server/commands/create-map.ts";
import { recordChallengeResponse } from "../../server/commands/record-challenge-response.ts";
import { requestChallengeCritique } from "../../server/commands/request-challenge-critique.ts";
import { setWorkspaceSelection } from "../../server/commands/set-workspace-selection.ts";
import {
  startChallengeRound,
  type StartChallengeRoundRepository,
  type StartChallengeRoundRepositoryTx,
} from "../../server/commands/start-challenge-round.ts";
import { createDbClient } from "../../server/db/client.ts";
import { challengeRounds, claims, movesEvents } from "../../server/db/schema.ts";
import { buildBrainView } from "../../server/projections/build-brain-view.ts";
import { buildChallengeView } from "../../server/projections/build-challenge-view.ts";
import { buildLearnView } from "../../server/projections/build-learn-view.ts";
import { buildShellView } from "../../server/projections/build-shell-view.ts";

const PG_PORT = 63000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_backend_mvp_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-backend-mvp-"));

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

function createStartChallengeRoundRepository(db: ReturnType<typeof createDbClient>): StartChallengeRoundRepository {
  return {
    async transaction<T>(callback: (tx: StartChallengeRoundRepositoryTx) => Promise<T>) {
      return db.transaction(async (tx) =>
        callback({
          async findOwnedClaim(input) {
            const rows = await tx
              .select({
                id: claims.id,
                mapId: claims.mapId,
                userId: claims.userId,
              })
              .from(claims)
              .where(and(eq(claims.id, input.claimId), eq(claims.userId, input.userId)))
              .limit(1);

            return rows[0] ?? null;
          },
          async insertChallengeRound(record) {
            await tx.insert(challengeRounds).values(record);
          },
          async insertMoveEvent(event) {
            await tx.insert(movesEvents).values({
              userId: event.userId,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              requestId: event.requestId,
              type: event.type,
              payloadJson: event.payload,
              createdAt: event.createdAt,
            });
          },
        }),
      );
    },
  };
}

after(async () => {
  try {
    run("pg_ctl", ["-D", PGDATA_DIR, "stop", "-m", "immediate"]);
  } finally {
    rmSync(PGDATA_DIR, { recursive: true, force: true });
  }
});

test("backend MVP commands, projections, and required event trail stay coherent", async () => {
  const userId = "00000000-0000-0000-0000-000000000888";
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const map = await createMap(
      {
        userId,
        title: "  Backend MVP map  ",
        requestId: "mvp-map-request",
      },
      db,
    );

    const claim = await createClaim(
      {
        userId,
        mapId: map.mapId,
        text: "  Backend MVP selected claim  ",
        requestId: "mvp-claim-request",
      },
      db,
    );

    const brainSelection = await setWorkspaceSelection(
      {
        userId,
        mode: "Brain",
        mapId: map.mapId,
        claimId: claim.claimId,
        requestId: "mvp-brain-selection-request",
      },
      db,
    );

    assert.deepEqual(brainSelection, {
      mode: "Brain",
      mapId: map.mapId,
      claimId: claim.claimId,
    });

    const shellView = await buildShellView({ userId });

    assert.deepEqual(shellView, {
      mode: "brain",
      mapId: map.mapId,
      claimId: claim.claimId,
      breadcrumb: [
        {
          kind: "map",
          id: map.mapId,
          label: "Backend MVP map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Backend MVP selected claim",
        },
      ],
      breadcrumbItems: [
        {
          kind: "map",
          id: map.mapId,
          label: "Backend MVP map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Backend MVP selected claim",
        },
      ],
    });

    const brainView = await buildBrainView({ userId }, db);

    assert.equal(brainView.selectedClaim?.id, claim.claimId);
    assert.equal(brainView.selectedClaim?.body, "Backend MVP selected claim");

    const round = await startChallengeRound(
      {
        userId,
        claimId: claim.claimId,
        requestId: "mvp-round-request",
      },
      createStartChallengeRoundRepository(db),
    );

    const critique = await requestChallengeCritique(
      {
        userId,
        roundId: round.roundId,
        requestId: "mvp-critique-request",
      },
      db,
      { autoGenerate: false },
    );

    assert.equal(critique.critiqueStatus, "pending");

    const challengeSelection = await setWorkspaceSelection(
      {
        userId,
        mode: "Challenge",
        mapId: map.mapId,
        requestId: "mvp-challenge-selection-request",
      },
      db,
    );

    assert.deepEqual(challengeSelection, {
      mode: "Challenge",
      mapId: map.mapId,
      claimId: claim.claimId,
    });

    const challengeView = await buildChallengeView({ userId }, db);

    assert.deepEqual(challengeView.shellContext, {
      mode: "challenge",
      mapId: map.mapId,
      claimId: claim.claimId,
      breadcrumb: [
        {
          kind: "map",
          id: map.mapId,
          label: "Backend MVP map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Backend MVP selected claim",
        },
      ],
      breadcrumbItems: [
        {
          kind: "map",
          id: map.mapId,
          label: "Backend MVP map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Backend MVP selected claim",
        },
      ],
    });
    assert.equal(challengeView.activeClaim?.id, claim.claimId);
    assert.equal(challengeView.activeChallengeRound?.id, round.roundId);
    assert.deepEqual(challengeView.critiqueState, {
      status: "pending",
      critiqueId: critique.critiqueId,
    });

    const responseResult = await recordChallengeResponse(
      {
        userId,
        roundId: round.roundId,
        response: "  Direct response recorded through the backend MVP flow.  ",
        responsePath: "direct",
        confidenceBps: 7100,
        requestId: "mvp-response-request",
      },
      db,
    );

    assert.deepEqual(responseResult, {
      roundId: round.roundId,
      responseRecorded: true,
    });

    const learnSelection = await setWorkspaceSelection(
      {
        userId,
        mode: "Learn",
        mapId: map.mapId,
        requestId: "mvp-learn-selection-request",
      },
      db,
    );

    assert.deepEqual(learnSelection, {
      mode: "Learn",
      mapId: map.mapId,
      claimId: claim.claimId,
    });

    const learnView = await buildLearnView({ userId }, db);

    assert.deepEqual(learnView.shellContext, {
      mode: "learn",
      mapId: map.mapId,
      claimId: claim.claimId,
      breadcrumb: [
        {
          kind: "map",
          id: map.mapId,
          label: "Backend MVP map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Backend MVP selected claim",
        },
      ],
      breadcrumbItems: [
        {
          kind: "map",
          id: map.mapId,
          label: "Backend MVP map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Backend MVP selected claim",
        },
      ],
    });
    assert.equal(learnView.selectedMapId, map.mapId);
    assert.equal(learnView.selectedClaimId, claim.claimId);
    assert.deepEqual(learnView.learnState, {
      status: "placeholder",
      message: "Learn mode coming soon",
    });

    const storedCritiques = await sql<
      {
        id: string;
        round_id: string;
        status: string;
      }[]
    >`select id, round_id, status from challenge_critiques where id = ${critique.critiqueId}`;

    assert.equal(storedCritiques.length, 1);
    assert.equal(storedCritiques[0].round_id, round.roundId);
    assert.equal(storedCritiques[0].status, "pending");

    const storedRounds = await sql<
      {
        id: string;
        status: string;
      }[]
    >`select id, status from challenge_rounds where id = ${round.roundId}`;

    assert.equal(storedRounds.length, 1);
    assert.equal(storedRounds[0].status, "responded");

    const storedEvents = await sql<
      {
        type: string;
        aggregate_type: string;
      }[]
    >`select type, aggregate_type from moves_events where user_id = ${userId} order by created_at asc, id asc`;

    const eventTypes = storedEvents.map((event) => event.type);

    assert.ok(eventTypes.includes("map.created"));
    assert.ok(eventTypes.includes("claim.created"));
    assert.ok(eventTypes.includes("workspace.selection.changed"));
    assert.ok(eventTypes.includes("challenge.round.started"));
    assert.ok(eventTypes.includes("challenge.critique.requested"));
    assert.ok(eventTypes.includes("challenge.response.recorded"));

    assert.equal(
      storedEvents.filter((event) => event.type === "workspace.selection.changed").length,
      3,
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
});
