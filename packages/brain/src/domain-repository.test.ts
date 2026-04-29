import assert from "node:assert/strict";
import test from "node:test";
import type { PennyDatabase } from "./db/client.ts";
import { claimVersions, focusStates, moves, nextMoveCandidates } from "./db/schema.ts";
import { createBrainRepository } from "./domain/repository.ts";
import type { NextMoveCandidate } from "./domain/engine.ts";
import type { FocusState } from "./domain/types.ts";

test("loadGraphSnapshot returns the Thinking Mode contract shape", async () => {
  const { db, calls } = fakeRepositoryDb({
    selectRows: [
      [sessionRow()],
      [claimRow()],
      [claimVersionRow()],
      [edgeRow()],
      [moveRow()],
      [artifactRow()],
      [focusStateRow()],
    ],
  });
  const repository = createBrainRepository(db);
  const snapshot = await repository.loadGraphSnapshot(uuidAt(101));

  assert.equal(snapshot.session.id, uuidAt(101));
  assert.equal(snapshot.session.status, "open");
  assert.equal(snapshot.focusState.source, "autopilot_started");
  assert.equal(snapshot.focusState.focusedClaimId, uuidAt(201));
  assert.equal(snapshot.claims[0]?.id, uuidAt(201));
  assert.equal(snapshot.claims[0]?.currentVersionId, uuidAt(701));
  assert.equal(snapshot.claims[0]?.text, "Founders will pay for structured thinking guidance.");
  assert.equal(snapshot.claims[0]?.confidence, 42);
  assert.equal(snapshot.claims[0]?.versions?.[0]?.isCurrent, true);
  assert.equal(snapshot.edges[0]?.id, uuidAt(301));
  assert.equal(snapshot.moves[0]?.kind, "manual_node_selected");
  assert.equal(snapshot.artifacts[0]?.kind, "challenge_brief");
  assert.equal(snapshot.artifacts[0]?.sections.challengeOutcome, "The claim changed.");
  assert.equal(calls.select, 7);
  assert.equal(calls.insert.length, 0);
  assert.equal(calls.update.length, 0);
});

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

test("upsertFocusState creates and updates the same session focus state", async () => {
  const initialFocus = focusStateInput({
    source: "autopilot_suggestion",
    focusedClaimId: uuidAt(201),
    reason: "Autopilot suggested the market assumption.",
  });
  const updatedFocus = focusStateInput({
    source: "manual_selection",
    focusedClaimId: uuidAt(202),
    manualMoveId: uuidAt(512),
    paused: true,
    reason: "User manually selected a different node.",
  });
  const { db, calls } = fakeRepositoryDb({
    selectRows: [[sessionRow()], [sessionRow()]],
    insertRows: [focusStateRow(initialFocus), focusStateRow(updatedFocus)],
  });
  const repository = createBrainRepository(db);
  const created = await repository.upsertFocusState(initialFocus);
  const updated = await repository.upsertFocusState(updatedFocus);

  assert.equal(created.sessionId, uuidAt(101));
  assert.equal(created.source, "autopilot_suggestion");
  assert.equal(updated.sessionId, uuidAt(101));
  assert.equal(updated.source, "manual_selection");
  assert.equal(updated.focusedClaimId, uuidAt(202));
  assert.equal(updated.paused, true);
  assert.equal(calls.insert.length, 2);
  assert.equal(calls.insert[0]?.table, focusStates);
  assert.equal(calls.insert[0]?.values.sessionId, uuidAt(101));
  assert.deepEqual(targetNames(calls.insert[0]?.onConflict?.target), [focusStates.sessionId.name]);
  assert.deepEqual(targetNames(calls.insert[1]?.onConflict?.target), [focusStates.sessionId.name]);
});

test("createMove appends an immutable move", async () => {
  const { db, calls } = fakeRepositoryDb({
    insertRows: [
      moveRow({
        id: uuidAt(520),
        kind: "manual_node_selected",
        payload: {
          claimId: uuidAt(201),
          previousSuggestionMoveId: null,
          reason: "I want to inspect this node.",
          pauseAutopilot: true,
          claimIds: [uuidAt(201)],
          edgeIds: [],
          artifactIds: [],
        },
      }),
    ],
  });
  const repository = createBrainRepository(db);
  const move = await repository.createMove("manual_node_selected", {
    id: uuidAt(520),
    sessionId: uuidAt(101),
    scope: sessionRow(),
    summary: "User manually selected a graph node.",
    payload: {
      claimId: uuidAt(201),
      previousSuggestionMoveId: null,
      reason: "I want to inspect this node.",
      pauseAutopilot: true,
      claimIds: [uuidAt(201)],
      edgeIds: [],
      artifactIds: [],
    },
  });

  assert.equal(move.id, uuidAt(520));
  assert.equal(move.kind, "manual_node_selected");
  assert.equal(move.payload.claimId, uuidAt(201));
  assert.equal(calls.insert.length, 1);
  assert.equal(calls.insert[0]?.table, moves);
  assert.equal(calls.insert[0]?.values.kind, "manual_node_selected");
  assert.equal(calls.update.length, 0);
});

test("starting focus does not mutate claim text or confidence", async () => {
  const startFocus = focusStateInput({
    source: "autopilot_started",
    focusedClaimId: uuidAt(201),
    suggestionMoveId: uuidAt(511),
    reason: "User clicked Go there.",
  });
  const { db, calls } = fakeRepositoryDb({
    selectRows: [[sessionRow()]],
    insertRows: [focusStateRow(startFocus)],
  });
  const repository = createBrainRepository(db);
  const focused = await repository.upsertFocusState(startFocus);

  assert.equal(focused.source, "autopilot_started");
  assert.equal(focused.focusedClaimId, uuidAt(201));
  assert.equal(calls.insert.length, 1);
  assert.equal(calls.insert[0]?.table, focusStates);
  assert.equal(calls.update.filter((call) => call.table === claimVersions).length, 0);
  assert.equal("content" in (calls.insert[0]?.values ?? {}), false);
  assert.equal("confidence" in (calls.insert[0]?.values ?? {}), false);
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
    insert: Array<{
      table: unknown;
      values: Record<string, unknown>;
      onConflict: { target: Array<{ name: string }> } | null;
    }>;
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
            returning() {
              return Promise.resolve([insertRows.shift()]);
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

function focusStateInput(overrides: Partial<FocusState> = {}): FocusState {
  return {
    sessionId: uuidAt(101),
    mode: "challenge" as const,
    focusedClaimId: uuidAt(201),
    focusedEdgeId: uuidAt(301),
    source: "autopilot_started" as const,
    suggestionMoveId: uuidAt(511),
    manualMoveId: null,
    paused: false,
    reason: "User started the suggested focus.",
    updatedAt: "2026-04-29T00:00:05.000Z",
    ...overrides,
  };
}

function focusStateRow(overrides: Partial<Record<string, unknown>> = {}) {
  const coerced = coerceFocusRowDates(overrides);
  const base = {
    sessionId: uuidAt(101),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    mode: "challenge",
    focusedClaimId: uuidAt(201),
    focusedEdgeId: uuidAt(301),
    source: "autopilot_started",
    suggestionMoveId: uuidAt(511),
    manualMoveId: null,
    paused: false,
    reason: "User started the suggested focus.",
    updatedAt: new Date("2026-04-29T00:00:05.000Z"),
  };

  return {
    ...base,
    ...coerced,
  };
}

function coerceFocusRowDates(record: Partial<Record<string, unknown>>) {
  if (typeof record.updatedAt !== "string") {
    return record;
  }

  return {
    ...record,
    updatedAt: new Date(record.updatedAt),
  };
}

function claimRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(201),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    sourceId: uuidAt(601),
    kind: "assumption",
    createdAt: new Date("2026-04-29T00:00:01.000Z"),
    ...overrides,
  };
}

function claimVersionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(701),
    claimId: uuidAt(201),
    sourceId: uuidAt(601),
    brainRunId: null,
    moveId: uuidAt(501),
    content: "Founders will pay for structured thinking guidance.",
    status: "exploratory",
    confidence: 42,
    isCurrent: true,
    validFrom: new Date("2026-04-29T00:00:01.000Z"),
    validUntil: null,
    supersededByVersionId: null,
    createdAt: new Date("2026-04-29T00:00:01.000Z"),
    ...overrides,
  };
}

function edgeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(301),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    fromClaimId: uuidAt(202),
    toClaimId: uuidAt(201),
    kind: "challenges",
    status: "active",
    label: "willingness_to_pay_gap",
    createdAt: new Date("2026-04-29T00:00:02.000Z"),
    ...overrides,
  };
}

function moveRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(511),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    kind: "manual_node_selected",
    summary: "User manually selected a graph node.",
    payload: {
      claimId: uuidAt(201),
      previousSuggestionMoveId: null,
      reason: "Inspect this node.",
      pauseAutopilot: true,
      claimIds: [uuidAt(201)],
      edgeIds: [],
      artifactIds: [],
    },
    createdAt: new Date("2026-04-29T00:00:03.000Z"),
    ...overrides,
  };
}

function artifactRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(901),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    kind: "challenge_brief",
    title: "Challenge Brief",
    summary: "The session produced a challenge brief.",
    payload: {
      ideaMap: {
        claims: [{ id: uuidAt(201) }],
        claimVersions: [{ id: uuidAt(701) }],
        edges: [{ id: uuidAt(301) }],
      },
      challengeBrief: {
        whatChanged: [{ id: uuidAt(511), summary: "The claim changed." }],
        unresolvedRisks: [{ summary: "Founder willingness to pay remains unresolved." }],
        recommendedNextMove: "Verify willingness to pay.",
      },
    },
    createdAt: new Date("2026-04-29T00:00:04.000Z"),
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

function targetNames(target: unknown): string[] {
  const targets = Array.isArray(target) ? target : [target];

  return targets.flatMap((column) => {
    if (column && typeof column === "object" && "name" in column && typeof column.name === "string") {
      return [column.name];
    }

    return [];
  });
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
