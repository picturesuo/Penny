import assert from "node:assert/strict";
import test from "node:test";
import type { PennyDatabase } from "./db/client.ts";
import { shapes as shapeTable } from "./db/schema.ts";
import { compiledShapesFromRows, inferShapesFromMoves, reviewShape, type PersistedShape } from "./shapes.ts";

test("inferShapesFromMoves creates keyed candidate shapes with move evidence", () => {
  const inferred = inferShapesFromMoves([
    shapeMove(uuidAt(501), "seed_claim_created"),
    shapeMove(uuidAt(502), "assumptions_extracted"),
    shapeMove(uuidAt(503), "first_challenge_suggested"),
  ]);

  assert.equal(inferred[0]?.key, "initial_decomposition");
  assert.equal(inferred[0]?.status, "candidate");
  assert.deepEqual(inferred[0]?.supportingMoveIds, [uuidAt(501), uuidAt(502), uuidAt(503)]);
});

test("compiledShapesFromRows returns reusable active shapes and skips rejected rows", () => {
  const rows = [
    shapeRow({
      id: uuidAt(701),
      key: "challenge_response_loop",
      status: "candidate",
      confidence: 84,
      supportingMoveIds: [uuidAt(501)],
    }),
    shapeRow({
      id: uuidAt(702),
      key: "challenge_response_loop",
      status: "confirmed",
      confidence: 70,
      supportingMoveIds: [uuidAt(501)],
      version: 2,
    }),
    shapeRow({
      id: uuidAt(703),
      key: "evidence_checking",
      status: "rejected",
      confidence: 88,
      supportingMoveIds: [uuidAt(502)],
    }),
  ];
  const compiled = compiledShapesFromRows(rows);

  assert.deepEqual(
    compiled.map((shape) => shape.id),
    [uuidAt(702)],
  );
  assert.equal(compiled[0]?.status, "confirmed");
  assert.equal(compiled[0]?.version, 2);
});

test("reviewShape marks a durable shape as confirmed or rejected", async () => {
  const shapeId = uuidAt(701);
  let updateValues: { status?: string; reviewedAt?: Date } | undefined;
  const db = {
    update(table: unknown) {
      assert.equal(table, shapeTable);

      return {
        set(values: { status?: string; reviewedAt?: Date }) {
          updateValues = values;

          return {
            where() {
              return {
                returning() {
                  return [
                    {
                      ...shapeRow({ id: shapeId, status: "candidate" }),
                      ...values,
                    },
                  ];
                },
              };
            },
          };
        },
      };
    },
  } as unknown as PennyDatabase;
  const reviewed = await reviewShape(db, { shapeId, status: "confirmed" });

  assert.equal(updateValues?.status, "confirmed");
  assert.ok(updateValues?.reviewedAt instanceof Date);
  assert.equal(reviewed.id, shapeId);
  assert.equal(reviewed.status, "confirmed");
});

function shapeMove(moveId: string, kind: string) {
  return {
    moveId,
    kind,
    summary: `Recorded ${kind}.`,
    createdAt: "2026-04-27T00:00:00.000Z",
  };
}

function shapeRow(overrides: Partial<PersistedShape> = {}): PersistedShape {
  return {
    id: uuidAt(700),
    sessionId: uuidAt(100),
    sourceMoveId: uuidAt(501),
    key: "challenge_response_loop",
    status: "candidate",
    version: 1,
    label: "Challenge response loop",
    description: "Recent moves are pressure-testing claims through challenge and explicit response.",
    confidence: 70,
    supportingMoveIds: [uuidAt(501)],
    payload: {},
    createdAt: new Date("2026-04-27T00:00:00.000Z"),
    reviewedAt: null,
    ...overrides,
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
