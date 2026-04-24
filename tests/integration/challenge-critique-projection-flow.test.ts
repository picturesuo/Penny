import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";

import { GET as getChallenge } from "../../apps/web/app/api/workspace/challenge/route.ts";
import { createClaim } from "../../server/commands/create-claim.ts";
import { createMap } from "../../server/commands/create-map.ts";
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

const PG_PORT = 62000 + Math.floor(Math.random() * 1000);
const PG_USER = "postgres";
const DB_NAME = "penny_challenge_critique_projection_flow_test";
const PGDATA_DIR = mkdtempSync(join(tmpdir(), "penny-pgdata-challenge-critique-projection-flow-"));

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

test("challenge flow stores a generated critique and exposes it in the challenge projection without live providers", async () => {
  const userId = "00000000-0000-0000-0000-000000001111";
  const db = createDbClient(databaseUrl);
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const map = await createMap(
      {
        userId,
        title: "  Critique projection flow map  ",
        requestId: "critique-flow-map-request",
      },
      db,
    );

    const claim = await createClaim(
      {
        userId,
        mapId: map.mapId,
        text: "  The challenge projection should expose the generated critique.  ",
        requestId: "critique-flow-claim-request",
      },
      db,
    );

    await setWorkspaceSelection(
      {
        userId,
        mode: "Challenge",
        mapId: map.mapId,
        claimId: claim.claimId,
        requestId: "critique-flow-selection-request",
      },
      db,
    );

    const round = await startChallengeRound(
      {
        userId,
        claimId: claim.claimId,
        requestId: "critique-flow-round-request",
      },
      createStartChallengeRoundRepository(db),
    );

    const critique = await requestChallengeCritique(
      {
        userId,
        roundId: round.roundId,
        requestId: "critique-flow-request",
      },
      db,
      {
        generateCritique: async () => ({
          body: JSON.stringify(
            {
              critique: {
                summary: "The current claim still needs a stronger boundary condition.",
                strongestCounterargument:
                  "A stored critique is not useful unless the projection surfaces it back to the user context.",
              },
              metadata: {
                provider: "test-provider",
                model: "test-model",
                promptVersion: "test-prompt-v1",
              },
            },
            null,
            2,
          ),
          metadata: {
            provider: "test-provider",
            model: "test-model",
            promptVersion: "test-prompt-v1",
          },
        }),
      },
    );

    assert.equal(critique.status, "ready");

    const response = await getChallenge(requestWithUser("http://localhost/api/workspace/challenge", userId));
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
      activeChallengeRound: {
        id: string;
        claimId: string;
        status: string;
      } | null;
      critiqueState: {
        status: string;
        critiqueId: string | null;
        body?: string;
        critiquePayload?: {
          critique?: {
            summary?: string;
            strongestCounterargument?: string;
          };
          metadata?: {
            provider?: string;
            model?: string;
            promptVersion?: string;
          };
        };
        provider?: string;
        model?: string;
        promptVersion?: string;
      };
    };

    assert.deepEqual(payload.shellContext, {
      mode: "challenge",
      mapId: map.mapId,
      claimId: claim.claimId,
      breadcrumbItems: [
        {
          kind: "map",
          id: map.mapId,
          label: "Critique projection flow map",
        },
        {
          kind: "claim",
          id: claim.claimId,
          label: "The challenge projection should expose the generated critique.",
        },
      ],
    });
    assert.equal(payload.activeChallengeRound?.id, round.roundId);
    assert.equal(payload.activeChallengeRound?.claimId, claim.claimId);
    assert.deepEqual(payload.critiqueState, {
      status: "ready",
      critiqueId: critique.critiqueId,
      body: JSON.stringify(
        {
          critique: {
            summary: "The current claim still needs a stronger boundary condition.",
            strongestCounterargument:
              "A stored critique is not useful unless the projection surfaces it back to the user context.",
          },
          metadata: {
            provider: "test-provider",
            model: "test-model",
            promptVersion: "test-prompt-v1",
          },
        },
        null,
        2,
      ),
      critiquePayload: {
        critique: {
          summary: "The current claim still needs a stronger boundary condition.",
          strongestCounterargument:
            "A stored critique is not useful unless the projection surfaces it back to the user context.",
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
