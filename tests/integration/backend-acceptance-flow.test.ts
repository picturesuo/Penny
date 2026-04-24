import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";

import { GET as getBrain } from "../../apps/web/app/api/workspace/brain/route.ts";
import { GET as getChallenge } from "../../apps/web/app/api/workspace/challenge/route.ts";
import { GET as getLearn } from "../../apps/web/app/api/workspace/learn/route.ts";
import { createClaim } from "../../server/commands/create-claim.ts";
import { createMap } from "../../server/commands/create-map.ts";
import { recordChallengeResponse } from "../../server/commands/record-challenge-response.ts";
import { requestChallengeCritique } from "../../server/commands/request-challenge-critique.ts";
import { setWorkspaceSelection } from "../../server/commands/set-workspace-selection.ts";
import {
  startChallengeRound,
  type ChallengeRoundRecord,
  type ChallengeRoundStartedEventRecord,
  type StartChallengeRoundRepository,
  type StartChallengeRoundRepositoryTx,
} from "../../server/commands/start-challenge-round.ts";
import { createDbClient } from "../../server/db/client.ts";
import { challengeRounds, claims, movesEvents } from "../../server/db/schema.ts";

const PG_PORT = 64000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_backend_acceptance_flow_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-backend-acceptance-flow-"));

function run(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  execFileSync(command, args, {
    cwd: "/Users/bensuo/Desktop/penny",
    env: env ? { ...process.env, ...env } : process.env,
    stdio: "pipe",
  });
}

function createStartChallengeRoundRepository(db: ReturnType<typeof createDbClient>): StartChallengeRoundRepository {
  return {
    async transaction<T>(callback: (tx: StartChallengeRoundRepositoryTx) => Promise<T>) {
      return db.transaction(async (tx) =>
        callback({
          async findOwnedClaim(input: { claimId: string; userId: string }) {
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
          async insertChallengeRound(record: ChallengeRoundRecord) {
            await tx.insert(challengeRounds).values(record);
          },
          async insertMoveEvent(event: ChallengeRoundStartedEventRecord) {
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

function requestWithUser(url: string, userId: string) {
  return new Request(url, {
    method: "GET",
    headers: {
      "x-user-id": userId,
    },
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

test("backend acceptance flow preserves the same mapId and claimId across Brain, Challenge, Learn, and back to Brain", async () => {
  const userId = "00000000-0000-0000-0000-000000000999";
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const map = await createMap(
      {
        userId,
        title: "  Acceptance flow map  ",
        requestId: "acceptance-map-request",
      },
      db,
    );

    const claim = await createClaim(
      {
        userId,
        mapId: map.mapId,
        text: "  Acceptance flow claim  ",
        requestId: "acceptance-claim-request",
      },
      db,
    );

    await setWorkspaceSelection(
      {
        userId,
        mode: "Brain",
        mapId: map.mapId,
        claimId: claim.claimId,
        requestId: "acceptance-brain-select-request",
      },
      db,
    );

    const brainResponse = await getBrain(requestWithUser("http://localhost/api/workspace/brain", userId));
    assert.equal(brainResponse.status, 200);

    const brainPayload = (await brainResponse.json()) as {
      currentContext: {
        mode: string;
        mapId: string | null;
        claimId: string | null;
      };
      selectedClaim: {
        id: string;
        mapId: string;
        body: string;
      } | null;
    };

    assert.deepEqual(brainPayload.currentContext, {
      mode: "brain",
      mapId: map.mapId,
      claimId: claim.claimId,
    });
    assert.equal(brainPayload.selectedClaim?.id, claim.claimId);

    await setWorkspaceSelection(
      {
        userId,
        mode: "Challenge",
        mapId: map.mapId,
        requestId: "acceptance-challenge-select-request",
      },
      db,
    );

    const round = await startChallengeRound(
      {
        userId,
        claimId: claim.claimId,
        requestId: "acceptance-round-request",
      },
      createStartChallengeRoundRepository(db),
    );

    const critique = await requestChallengeCritique(
      {
        userId,
        roundId: round.roundId,
        requestId: "acceptance-critique-request",
      },
      db,
    );

    assert.equal(critique.critiqueStatus, "pending");

    const challengeResponse = await getChallenge(requestWithUser("http://localhost/api/workspace/challenge", userId));
    assert.equal(challengeResponse.status, 200);

    const challengePayload = (await challengeResponse.json()) as {
      shellContext: {
        mode: string;
        mapId: string | null;
        claimId: string | null;
        breadcrumb: Array<{
          kind: string;
          id: string;
          label: string;
        }>;
        breadcrumbItems: Array<{
          kind: string;
          id: string;
          label: string;
        }>;
      };
      activeClaim: {
        id: string;
        mapId: string;
        body: string;
      } | null;
      activeChallengeRound: {
        id: string;
        claimId: string;
        status: string;
      } | null;
    };

    assert.deepEqual(challengePayload.shellContext, {
      mode: "challenge",
      mapId: map.mapId,
      claimId: claim.claimId,
      breadcrumb: [
        {
          kind: "map",
          id: map.mapId,
          label: "Acceptance flow map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Acceptance flow claim",
        },
      ],
      breadcrumbItems: [
        {
          kind: "map",
          id: map.mapId,
          label: "Acceptance flow map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Acceptance flow claim",
        },
      ],
    });
    assert.equal(challengePayload.activeClaim?.id, claim.claimId);
    assert.equal(challengePayload.activeChallengeRound?.id, round.roundId);
    assert.equal(challengePayload.activeChallengeRound?.claimId, claim.claimId);

    const responseResult = await recordChallengeResponse(
      {
        userId,
        roundId: round.roundId,
        response: "  Acceptance flow response  ",
        responsePath: "direct",
        confidenceBps: 6700,
        requestId: "acceptance-response-request",
      },
      db,
    );

    assert.deepEqual(responseResult, {
      roundId: round.roundId,
      responseRecorded: true,
    });

    await setWorkspaceSelection(
      {
        userId,
        mode: "Learn",
        mapId: map.mapId,
        requestId: "acceptance-learn-select-request",
      },
      db,
    );

    const learnResponse = await getLearn(requestWithUser("http://localhost/api/workspace/learn", userId));
    assert.equal(learnResponse.status, 200);

    const learnPayload = (await learnResponse.json()) as {
      shellContext: {
        mode: string;
        mapId: string | null;
        claimId: string | null;
        breadcrumb: Array<{
          kind: string;
          id: string;
          label: string;
        }>;
        breadcrumbItems: Array<{
          kind: string;
          id: string;
          label: string;
        }>;
      };
      selectedMapId: string | null;
      selectedClaimId: string | null;
      learnState: {
        status: string;
        message: string;
      };
    };

    assert.deepEqual(learnPayload.shellContext, {
      mode: "learn",
      mapId: map.mapId,
      claimId: claim.claimId,
      breadcrumb: [
        {
          kind: "map",
          id: map.mapId,
          label: "Acceptance flow map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Acceptance flow claim",
        },
      ],
      breadcrumbItems: [
        {
          kind: "map",
          id: map.mapId,
          label: "Acceptance flow map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "Acceptance flow claim",
        },
      ],
    });
    assert.equal(learnPayload.selectedMapId, map.mapId);
    assert.equal(learnPayload.selectedClaimId, claim.claimId);
    assert.deepEqual(learnPayload.learnState, {
      status: "not_implemented",
      message: "Learn mode coming soon",
    });

    await setWorkspaceSelection(
      {
        userId,
        mode: "Brain",
        mapId: map.mapId,
        requestId: "acceptance-brain-return-request",
      },
      db,
    );

    const finalBrainResponse = await getBrain(requestWithUser("http://localhost/api/workspace/brain", userId));
    assert.equal(finalBrainResponse.status, 200);

    const finalBrainPayload = (await finalBrainResponse.json()) as {
      currentContext: {
        mode: string;
        mapId: string | null;
        claimId: string | null;
      };
      selectedClaim: {
        id: string;
      } | null;
    };

    assert.deepEqual(finalBrainPayload.currentContext, {
      mode: "brain",
      mapId: map.mapId,
      claimId: claim.claimId,
    });
    assert.equal(finalBrainPayload.selectedClaim?.id, claim.claimId);

    assert.deepEqual(
      [
        [brainPayload.currentContext.mapId, brainPayload.currentContext.claimId],
        [challengePayload.shellContext.mapId, challengePayload.shellContext.claimId],
        [learnPayload.shellContext.mapId, learnPayload.shellContext.claimId],
        [finalBrainPayload.currentContext.mapId, finalBrainPayload.currentContext.claimId],
      ],
      [
        [map.mapId, claim.claimId],
        [map.mapId, claim.claimId],
        [map.mapId, claim.claimId],
        [map.mapId, claim.claimId],
      ],
    );

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
  } finally {
    await sql.end({ timeout: 1 });
  }
});
