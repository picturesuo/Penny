import assert from "node:assert/strict";
import test from "node:test";

import { activityEvents, aiJobs } from "../../../../server/db/schema.ts";
import { runLoggedAIOperation } from "../../../../server/ai/services/ai-operation-log.ts";

function createDb() {
  const state = {
    activityEvents: [] as Array<Record<string, unknown>>,
    aiJobs: [] as Array<Record<string, unknown>>,
  };

  const db = {
    state,
    async transaction<T>(callback: (tx: typeof db) => Promise<T>) {
      return callback(db);
    },
    insert(table: unknown) {
      return {
        values(record: Record<string, unknown>) {
          if (table === aiJobs) {
            const row = {
              id: "22222222-2222-4222-8222-222222222222",
              ...record,
            };

            state.aiJobs.push(row);

            return {
              async returning() {
                return [row];
              },
            };
          }

          if (table === activityEvents) {
            state.activityEvents.push(record);
            return Promise.resolve();
          }

          throw new Error("Unexpected insert table.");
        },
      };
    },
    update(table: unknown) {
      assert.equal(table, aiJobs);

      return {
        set(update: Record<string, unknown>) {
          return {
            where() {
              return {
                async returning() {
                  const row = {
                    ...state.aiJobs[0],
                    ...update,
                  };

                  state.aiJobs[0] = row;

                  return [row];
                },
              };
            },
          };
        },
      };
    },
  };

  return db;
}

test("runLoggedAIOperation stores the output in ai_jobs and writes an activity event", async () => {
  const db = createDb();

  const result = await runLoggedAIOperation(
    {
      userId: "11111111-1111-4111-8111-111111111111",
      operation: "challenge_idea",
      inputJson: { text: "Challenge this." },
      run: () => ({ strongestObjection: "Too broad." }),
      eventType: "ai.challenge_idea.completed",
      requestId: "request-1",
      claimId: "33333333-3333-4333-8333-333333333333",
    },
    db as never,
  );

  assert.equal(result.aiJob.status, "succeeded");
  assert.deepEqual(result.output, { strongestObjection: "Too broad." });
  assert.equal(db.state.aiJobs.length, 1);
  assert.equal(db.state.aiJobs[0]?.operation, "challenge_idea");
  assert.equal(db.state.aiJobs[0]?.status, "succeeded");
  assert.deepEqual(db.state.aiJobs[0]?.outputJson, { strongestObjection: "Too broad." });
  assert.equal(db.state.activityEvents.length, 1);
  assert.equal(db.state.activityEvents[0]?.type, "ai.challenge_idea.completed");
  assert.equal(db.state.activityEvents[0]?.aiJobId, "22222222-2222-4222-8222-222222222222");
  assert.equal(db.state.activityEvents[0]?.claimId, "33333333-3333-4333-8333-333333333333");
  assert.deepEqual(db.state.activityEvents[0]?.payloadJson, {
    operation: "challenge_idea",
    input: { text: "Challenge this." },
    output: { strongestObjection: "Too broad." },
  });
});

test("runLoggedAIOperation marks the AI job failed when execution throws", async () => {
  const db = createDb();

  await assert.rejects(
    () =>
      runLoggedAIOperation(
        {
          userId: "11111111-1111-4111-8111-111111111111",
          operation: "explain_blocker",
          inputJson: { blocker: "Unknown dependency." },
          run: () => {
            throw new Error("Could not explain blocker.");
          },
          eventType: "ai.explain_blocker.completed",
        },
        db as never,
      ),
    /Could not explain blocker/,
  );

  assert.equal(db.state.aiJobs.length, 1);
  assert.equal(db.state.aiJobs[0]?.status, "failed");
  assert.equal(db.state.aiJobs[0]?.errorMessage, "Could not explain blocker.");
  assert.equal(db.state.activityEvents.length, 0);
});
