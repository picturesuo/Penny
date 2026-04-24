import test from "node:test";
import assert from "node:assert/strict";
import { emitEvent, EmitEventValidationError } from "../../server/events/emitEvent.ts";
import { movesEvents } from "../../server/db/schema.ts";

test("emitEvent inserts one event into moves_events", async () => {
  const inserts: Array<{ table: unknown; values: unknown }> = [];

  const db = {
    insert(table: unknown) {
      return {
        async values(value: unknown) {
          inserts.push({ table, values: value });
        },
      };
    },
  };

  await emitEvent({
    db,
    userId: "user-123",
    aggregateType: "claim",
    aggregateId: "claim-123",
    type: "claim.updated",
    payloadJson: { field: "title", previous: "old", next: "new" },
    requestId: "req-123",
  });

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0]?.table, movesEvents);
  assert.deepEqual(inserts[0]?.values, {
    userId: "user-123",
    aggregateType: "claim",
    aggregateId: "claim-123",
    type: "claim.updated",
    payloadJson: { field: "title", previous: "old", next: "new" },
    requestId: "req-123",
  });
});

test("emitEvent rejects an invalid event type", async () => {
  const db = {
    insert() {
      return {
        async values() {
          throw new Error("insert should not run for invalid input");
        },
      };
    },
  };

  await assert.rejects(
    emitEvent({
      db,
      userId: "user-123",
      aggregateType: "claim",
      aggregateId: "claim-123",
      type: "not.a.real.event" as never,
      payloadJson: { field: "title" },
      requestId: "req-123",
    }),
    (error: unknown) => {
      assert.ok(error instanceof EmitEventValidationError);
      assert.match((error as Error).message, /Invalid event type/);
      return true;
    },
  );
});

test("emitEvent accepts challenge.critique.failed as a durable event type", async () => {
  const inserts: Array<{ table: unknown; values: unknown }> = [];

  const db = {
    insert(table: unknown) {
      return {
        async values(value: unknown) {
          inserts.push({ table, values: value });
        },
      };
    },
  };

  await emitEvent({
    db,
    userId: "user-456",
    aggregateType: "challenge_critique",
    aggregateId: "critique-456",
    type: "challenge.critique.failed",
    payloadJson: {
      roundId: "round-456",
      mapId: "map-456",
      claimId: "claim-456",
      status: "failed",
      errorMessage: "Synthetic critique failure.",
    },
    requestId: "req-456",
  });

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0]?.table, movesEvents);
  assert.deepEqual(inserts[0]?.values, {
    userId: "user-456",
    aggregateType: "challenge_critique",
    aggregateId: "critique-456",
    type: "challenge.critique.failed",
    payloadJson: {
      roundId: "round-456",
      mapId: "map-456",
      claimId: "claim-456",
      status: "failed",
      errorMessage: "Synthetic critique failure.",
    },
    requestId: "req-456",
  });
});
