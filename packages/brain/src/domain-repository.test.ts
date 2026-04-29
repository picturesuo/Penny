import assert from "node:assert/strict";
import test from "node:test";
import type { PennyDatabase } from "./db/client.ts";
import { nextMoveCandidates } from "./db/schema.ts";
import { createBrainRepository } from "./domain/repository.ts";
import type { NextMoveCandidate } from "./domain/engine.ts";

test("getAutopilotState is read-only and returns a default focus state when no row exists", async () => {
  const { db, calls } = fakeRepositoryDb({
    selectRows: [[sessionRow()], [], []],
  });
  const repository = createBrainRepository(db);
  const state = await repository.getAutopilotState(uuidAt(101));

  assert.equal(state.sessionId, uuidAt(101));
  assert.equal(state.focusState.source, "none");
  assert.equal(state.focusState.paused, false);
  assert.deepEqual(state.candidates, []);
  assert.equal(calls.select, 3);
  assert.equal(calls.insert.length, 0);
  assert.equal(calls.update.length, 0);
});

test("upsertNextMoveCandidates dedupes by sessionId and fingerprint while preserving scoring context", async () => {
  const candidate = nextMoveCandidate();
  const { db, calls } = fakeRepositoryDb({
    selectRows: [[sessionRow()]],
    insertRows: [candidateRow(candidate)],
  });
  const repository = createBrainRepository(db);
  const [persisted] = await repository.upsertNextMoveCandidates(uuidAt(101), [candidate]);
  const insert = calls.insert[0];

  assert.ok(persisted);
  assert.equal(persisted.fingerprint, candidate.fingerprint);
  assert.deepEqual(
    insert?.onConflict?.target.map((column: { name: string }) => column.name),
    [nextMoveCandidates.sessionId.name, nextMoveCandidates.fingerprint.name],
  );
  assert.equal(insert?.values.reason, candidate.reason);
  assert.deepEqual(insert?.values.scoreBreakdown, candidate.scoreBreakdown);
  assert.equal(insert?.values.graphHash, candidate.graphHash);
  assert.deepEqual(insert?.values.provenance, candidate.provenance);
});

test("markCandidateSelected clears prior selected rows before selecting the requested fingerprint", async () => {
  const candidate = nextMoveCandidate();
  const { db, calls } = fakeRepositoryDb({
    selectRows: [[sessionRow()]],
    updateRows: [[candidateRow(candidate, { selected: true })]],
  });
  const repository = createBrainRepository(db);
  const selected = await repository.markCandidateSelected(uuidAt(101), candidate.fingerprint);

  assert.equal(selected.selected, true);
  assert.equal(calls.update.length, 2);
  assert.deepEqual(calls.update[0]?.set, { selected: false, selectedAt: null, updatedAt: calls.update[0]?.set.updatedAt });
  assert.equal(calls.update[1]?.set.selected, true);
  assert.ok(calls.update[1]?.set.selectedAt instanceof Date);
});

function fakeRepositoryDb(options: {
  selectRows?: unknown[][];
  insertRows?: unknown[];
  updateRows?: unknown[][];
}) {
  const selectRows = [...(options.selectRows ?? [])];
  const insertRows = [...(options.insertRows ?? [])];
  const updateRows = [...(options.updateRows ?? [])];
  const calls: {
    select: number;
    insert: Array<{ table: unknown; values: Record<string, unknown>; onConflict: { target: Array<{ name: string }> } | null }>;
    update: Array<{ table: unknown; set: Record<string, unknown> }>;
  } = {
    select: 0,
    insert: [],
    update: [],
  };
  const tx = {
    select() {
      calls.select += 1;

      return query(selectRows.shift() ?? []);
    },
    insert(table: unknown) {
      const call: {
        table: unknown;
        values: Record<string, unknown>;
        onConflict: { target: Array<{ name: string }> } | null;
      } = { table, values: {}, onConflict: null };
      calls.insert.push(call);

      return {
        values(values: Record<string, unknown>) {
          call.values = values;

          return {
            onConflictDoUpdate(onConflict: { target: Array<{ name: string }> }) {
              call.onConflict = onConflict;

              return {
                returning() {
                  return Promise.resolve([insertRows.shift()]);
                },
              };
            },
          };
        },
      };
    },
    update(table: unknown) {
      const call = { table, set: {} };
      calls.update.push(call);

      return {
        set(set: Record<string, unknown>) {
          call.set = set;

          return {
            where() {
              return queryWithReturning(() => updateRows.shift() ?? []);
            },
          };
        },
      };
    },
  };
  const db = {
    transaction<T>(run: (transaction: typeof tx) => Promise<T> | T): Promise<T> {
      return Promise.resolve(run(tx));
    },
  } as unknown as PennyDatabase;

  return { db, calls };
}

function query(rows: unknown[]) {
  const chain = {
    from() {
      return chain;
    },
    where() {
      return chain;
    },
    orderBy() {
      return chain;
    },
    limit() {
      return chain;
    },
    then<TResult1 = unknown[], TResult2 = never>(
      onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(rows).then(onfulfilled, onrejected);
    },
  };

  return chain;
}

function queryWithReturning(rows: () => unknown[]) {
  const chain = {
    returning() {
      return Promise.resolve(rows());
    },
    then<TResult1 = unknown[], TResult2 = never>(
      onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve([]).then(onfulfilled, onrejected);
    },
  };

  return chain;
}

function nextMoveCandidate(): NextMoveCandidate {
  const graphHash = "graph_hash";

  return {
    candidateId: "next_candidate",
    rank: 1,
    targetClaimId: uuidAt(201),
    targetEdgeId: uuidAt(301),
    action: "challenge",
    mode: "challenge",
    score: 920,
    reason: "Challenge the load-bearing assumption.",
    reasonCodes: ["load_bearing", "low_confidence"],
    exitCriteria: {
      label: "Issue a challenge.",
      acceptedMoveKinds: ["challenge_issued"],
    },
    scoreBreakdown: {
      leverage: 300,
      fragility: 200,
      stakes: 120,
      readiness: 100,
      momentum: 90,
      novelty: 110,
      shape: 0,
      penalties: 0,
    },
    graphHash,
    fingerprint: "fingerprint_123",
    provenance: {
      engine: "thinking-mode-next-move-v1",
      graphHash,
      source: "thinking_graph_snapshot",
      ruleIds: ["challenge"],
      claimIds: [uuidAt(201)],
      edgeIds: [uuidAt(301)],
      moveIds: [uuidAt(501)],
      artifactIds: [],
    },
  };
}

function candidateRow(candidate: NextMoveCandidate, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(901),
    sessionId: uuidAt(101),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    candidateId: candidate.candidateId,
    fingerprint: candidate.fingerprint,
    graphHash: candidate.graphHash,
    action: candidate.action,
    mode: candidate.mode,
    targetClaimId: candidate.targetClaimId,
    targetEdgeId: candidate.targetEdgeId,
    score: candidate.score,
    rank: candidate.rank,
    reason: candidate.reason,
    reasonCodes: [...candidate.reasonCodes],
    exitCriteria: candidate.exitCriteria,
    scoreBreakdown: candidate.scoreBreakdown,
    provenance: candidate.provenance,
    selected: false,
    selectedAt: null,
    createdAt: new Date("2026-04-29T00:00:01.000Z"),
    updatedAt: new Date("2026-04-29T00:00:01.000Z"),
    ...overrides,
  };
}

function sessionRow() {
  return {
    id: uuidAt(101),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    status: "open",
    title: "Test session",
    createdAt: new Date("2026-04-29T00:00:00.000Z"),
    endedAt: null,
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
