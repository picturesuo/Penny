import assert from "node:assert/strict";
import test from "node:test";
import type { PennyDatabase } from "./db/client.ts";
import {
  brainEmbeddings,
  brainObjects,
  brainRecents,
  claimVersions,
  focusStates,
  moves,
  nextMoveCandidates,
  recipeRuns,
  recipeSteps,
} from "./db/schema.ts";
import { createBrainRepository, persistRecipeRun, recordLearnSessionOutput } from "./domain/repository.ts";
import type { NextMoveCandidate } from "./domain/engine.ts";
import type { FocusState } from "./domain/types.ts";
import type { BrainScope } from "./scope.ts";

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
  assert.deepEqual(targetNames(insert?.onConflict?.target), [
    nextMoveCandidates.sessionId.name,
    nextMoveCandidates.fingerprint.name,
  ]);
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
    insertRows: [
      focusStateRow({
        source: "autopilot_suggestion",
        focusedClaimId: uuidAt(201),
        reason: "Autopilot suggested the market assumption.",
      }),
      focusStateRow({
        source: "manual_selection",
        focusedClaimId: uuidAt(202),
        manualMoveId: uuidAt(512),
        paused: true,
        reason: "User manually selected a different node.",
      }),
    ],
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

test("recordLearnSessionOutput stores a save-ready Learn recent in the session scope", async () => {
  const { db, calls } = fakeRepositoryDb({
    selectRows: [[sessionRow()]],
    insertRows: [brainRecentRow()],
  });
  const output = await recordLearnSessionOutput(db, {
    sessionId: uuidAt(101),
    title: "Learn: cognitive load",
    summary: "The concept changes the local claim pressure.",
    content: "Cognitive load matters because the claim depends on reducing user effort.",
    term: "cognitive load",
    candidateBrainObjects: [
      {
        objectType: "learn_output",
        title: "Learn: cognitive load",
        content: "Cognitive load matters because the claim depends on reducing user effort.",
        source: "learn",
        refs: {
          sessionId: uuidAt(101),
          currentClaimId: uuidAt(201),
          term: "cognitive load",
        },
      },
    ],
  });
  const insert = calls.insert[0];
  const payload = insert?.values.payload as Record<string, unknown> | undefined;

  assert.equal(calls.select, 1);
  assert.equal(insert?.table, brainRecents);
  assert.equal(insert?.values.sessionId, uuidAt(101));
  assert.equal(insert?.values.userId, "test-user");
  assert.equal(insert?.values.kind, "learn_output");
  assert.equal(insert?.values.title, "Learn: cognitive load");
  assert.equal(payload?.source, "learn");
  assert.equal(Array.isArray(payload?.candidateBrainObjects), true);
  assert.equal(output.recent.id, uuidAt(950));
  assert.equal(output.saveCandidate.recentId, uuidAt(950));
  assert.equal(output.saveCandidate.sessionId, uuidAt(101));
  assert.equal(output.saveCandidate.objectType, "learn_output");
  assert.equal(output.saveCandidate.content, "Cognitive load matters because the claim depends on reducing user effort.");
});

test("persistRecipeRun stores scoped recipe runs and ordered recipe steps", async () => {
  const { db, calls } = fakeRepositoryDb({
    selectRows: [[sessionRow()], [claimRow()], [brainRunRow()]],
    insertRows: [
      recipeRunRow({
        status: "running",
        title: "Verify source-grounded claim",
        goal: "Evaluate the claim against local and external evidence.",
      }),
      recipeStepRow({ stepKey: "retrieve_local_context", position: 1, status: "completed" }),
      recipeStepRow({ stepKey: "evaluate_evidence", position: 2, status: "pending" }),
    ],
  });
  const run = await persistRecipeRun(db, {
    id: uuidAt(710),
    scope: scopeInput(),
    sessionId: uuidAt(101),
    targetClaimId: uuidAt(201),
    brainRunId: uuidAt(610),
    kind: "verify",
    title: "Verify source-grounded claim",
    goal: "Evaluate the claim against local and external evidence.",
    status: "running",
    input: { claimId: uuidAt(201) },
    steps: [
      {
        id: uuidAt(711),
        key: "retrieve_local_context",
        title: "Retrieve local context",
        status: "completed",
        inputs: { required: ["claimId"] },
        outputs: { resultCount: 3 },
      },
      {
        id: "recipe-run-step-2",
        key: "evaluate_evidence",
        title: "Evaluate evidence",
        inputs: { required: ["claimText", "sources"] },
      },
    ],
  });
  const runInsert = calls.insert[0];
  const firstStepInsert = calls.insert[1];
  const secondStepInsert = calls.insert[2];

  assert.equal(run.kind, "verify");
  assert.equal(run.status, "running");
  assert.equal(run.steps.length, 2);
  assert.equal(run.steps[0]?.key, "retrieve_local_context");
  assert.equal(run.steps[0]?.status, "completed");
  assert.deepEqual(run.input, { claimId: uuidAt(201) });
  assert.equal(calls.select, 3);
  assert.equal(runInsert?.table, recipeRuns);
  assert.equal(runInsert?.values.userId, "test-user");
  assert.equal(runInsert?.values.workspaceId, "test-workspace");
  assert.equal(runInsert?.values.sessionId, uuidAt(101));
  assert.equal(runInsert?.values.targetClaimId, uuidAt(201));
  assert.equal(runInsert?.values.brainRunId, uuidAt(610));
  assert.deepEqual(targetNames(runInsert?.onConflict?.target), [recipeRuns.id.name]);
  assert.equal(firstStepInsert?.table, recipeSteps);
  assert.equal(firstStepInsert?.values.recipeRunId, uuidAt(710));
  assert.equal(firstStepInsert?.values.status, "completed");
  assert.ok(firstStepInsert?.values.completedAt instanceof Date);
  assert.equal(secondStepInsert?.values.stepKey, "evaluate_evidence");
  assert.match(String(secondStepInsert?.values.id), /^[0-9a-f-]{36}$/);
  assert.deepEqual(targetNames(secondStepInsert?.onConflict?.target), [
    recipeSteps.recipeRunId.name,
    recipeSteps.stepKey.name,
  ]);
});

test("upsertEmbeddingForObject stores JSON/text fallback embeddings for searchable Brain objects", async () => {
  const { db, calls } = fakeRepositoryDb({
    insertRows: [embeddingRow({ objectType: "brain_object", objectId: uuidAt(960), title: "Saved founder insight" })],
  });
  const repository = createBrainRepository(db);
  const result = await repository.upsertEmbeddingForObject({
    scope: scopeInput(),
    objectType: "brain_object",
    objectId: uuidAt(960),
    sessionId: uuidAt(101),
    title: "Saved founder insight",
    content: "Founders need a concrete artifact before they pay.",
    embedding: [1, 0, 0],
    embeddingModel: "test-embedding",
    metadata: { source: "unit-test" },
  });
  const insert = calls.insert[0];

  assert.equal(result.objectType, "brain_object");
  assert.equal(result.objectId, uuidAt(960));
  assert.equal(insert?.table, brainEmbeddings);
  assert.equal(insert?.values.objectType, "brain_object");
  assert.deepEqual(insert?.values.embeddingJson, [1, 0, 0]);
  assert.equal(insert?.values.embeddingText, "[1,0,0]");
  assert.equal(typeof insert?.values.contentHash, "string");
  assert.deepEqual(targetNames(insert?.onConflict?.target), [
    brainEmbeddings.objectType.name,
    brainEmbeddings.objectId.name,
  ]);
});

test("searchBrainSemantic ranks stored fallback embeddings without mutating rows", async () => {
  const { db, calls } = fakeRepositoryDb({
    selectRows: [
      [
        embeddingRow({ objectType: "claim_version", objectId: uuidAt(701), title: "Willingness to pay", embeddingJson: [1, 0] }),
        embeddingRow({ objectType: "artifact", objectId: uuidAt(901), title: "Challenge Brief", embeddingJson: [0, 1] }),
      ],
    ],
  });
  const repository = createBrainRepository(db);
  const results = await repository.searchBrainSemantic({
    scope: scopeInput(),
    query: "founder payment",
    embedding: [1, 0],
  });

  assert.equal(results[0]?.objectType, "claim_version");
  assert.equal(results[0]?.semanticScore, 1);
  assert.equal(calls.select, 1);
  assert.equal(calls.insert.length, 0);
});

test("searchBrainHybrid covers saved objects, notes, current claims, live recents, and artifacts", async () => {
  const { db } = fakeRepositoryDb({
    selectRows: [
      [],
      [brainObjectRow({ title: "Saved payment insight", body: "Founders pay for urgent artifacts." })],
      [sessionNoteRow({ content: "Keep the founder payment thread visible." })],
      [
        brainRecentRow({
          title: "Recent Learn output",
          summary: null,
          body: "Autopilot should suggest the next founder payment check.",
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        }),
        brainRecentRow({
          id: uuidAt(951),
          title: "Expired recent",
          body: "Old irrelevant scratch.",
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
      ],
      [artifactRow({ title: "Founder payment Challenge Brief", summary: "Artifact for founder willingness to pay." })],
      [claimRow()],
      [claimVersionRow({ content: "Founders pay when a structured thinking artifact helps this week." })],
    ],
  });
  const repository = createBrainRepository(db);
  const results = await repository.searchBrainHybrid({
    scope: scopeInput(),
    query: "founder payment artifact",
    now: new Date("2026-05-01T00:00:00.000Z"),
  });

  assert.ok(results.some((result) => result.objectType === "brain_object"));
  assert.ok(results.some((result) => result.objectType === "session_note"));
  assert.ok(results.some((result) => result.objectType === "brain_recent"));
  assert.ok(results.some((result) => result.objectType === "artifact"));
  assert.ok(results.some((result) => result.objectType === "claim_version"));
  assert.equal(results.some((result) => result.title === "Expired recent"), false);
});

test("listCanvasNodesForSession returns the Wave 8 canvas node contract", async () => {
  const { db } = fakeRepositoryDb({
    selectRows: [
      [sessionRow()],
      [sourceRow()],
      [claimRow()],
      [edgeRow()],
      [sessionNoteRow()],
      [brainObjectRow({ objectType: "creative_direction", title: "YC angle" })],
      [artifactRow()],
      [claimVersionRow()],
    ],
  });
  const repository = createBrainRepository(db);
  const nodes = await repository.listCanvasNodesForSession(uuidAt(101), scopeInput());

  assert.ok(nodes.some((node) => node.type === "idea"));
  assert.ok(nodes.some((node) => node.type === "assumption" && node.claimId === uuidAt(201)));
  assert.ok(nodes.some((node) => node.type === "note"));
  assert.ok(nodes.some((node) => node.type === "creative_direction"));
  assert.ok(nodes.some((node) => node.type === "artifact"));
  assert.equal(nodes.every((node) => typeof node.x === "number" && typeof node.y === "number"), true);
});

test("listCanvasEdgesForSession maps claim edges into canvas edges", async () => {
  const { db } = fakeRepositoryDb({
    selectRows: [
      [sessionRow()],
      [sourceRow()],
      [claimRow()],
      [edgeRow()],
      [],
      [],
      [],
      [claimVersionRow()],
    ],
  });
  const repository = createBrainRepository(db);
  const edges = await repository.listCanvasEdgesForSession(uuidAt(101), scopeInput());

  assert.equal(edges[0]?.id, `claim_edge:${uuidAt(301)}`);
  assert.equal(edges[0]?.sourceId, `claim:${uuidAt(202)}`);
  assert.equal(edges[0]?.targetId, `claim:${uuidAt(201)}`);
  assert.equal(edges[0]?.type, "challenges");
  assert.equal(edges[0]?.provenance, "claim_edge");
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
    insertRows: [
      focusStateRow({
        source: "autopilot_started",
        focusedClaimId: uuidAt(201),
        suggestionMoveId: uuidAt(511),
        reason: "User clicked Go there.",
      }),
    ],
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
      onConflict: { target: unknown } | null;
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
        onConflict: { target: unknown } | null;
      } = { table, values: {}, onConflict: null };
      calls.insert.push(call);

      return {
        values(values: Record<string, unknown>) {
          call.values = values;

          return {
            onConflictDoUpdate(onConflict: { target: unknown }) {
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
    select: tx.select,
    insert: tx.insert,
    update: tx.update,
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
    whyPennyRecommendsThis: "Why Penny recommends this: the idea depends on a fragile assumption.",
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

function sourceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(601),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    kind: "raw_idea",
    rawText: "Penny should help founders stress-test payment assumptions.",
    createdAt: new Date("2026-04-29T00:00:00.500Z"),
    ...overrides,
  };
}

function sessionNoteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(970),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    content: "Keep the founder payment thread visible.",
    createdAt: new Date("2026-04-29T00:00:05.000Z"),
    updatedAt: new Date("2026-04-29T00:00:06.000Z"),
    ...overrides,
  };
}

function brainObjectRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(960),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    sourceRecentId: uuidAt(950),
    objectType: "saved_idea",
    title: "Saved founder insight",
    summary: "Founders pay when the artifact is urgent.",
    body: "Founders pay for structured thinking when it produces a concrete artifact this week.",
    payload: {
      refs: {
        claimIds: [uuidAt(201)],
      },
    },
    createdAt: new Date("2026-04-29T00:00:07.000Z"),
    updatedAt: new Date("2026-04-29T00:00:08.000Z"),
    ...overrides,
  };
}

function brainRecentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(950),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    kind: "learn_output",
    title: "Learn: cognitive load",
    summary: "The concept changes the local claim pressure.",
    body: "Cognitive load matters because the claim depends on reducing user effort.",
    payload: {
      source: "learn",
      candidateBrainObjects: [],
    },
    createdAt: new Date("2026-04-29T00:00:05.000Z"),
    updatedAt: new Date("2026-04-29T00:00:05.000Z"),
    ...overrides,
  };
}

function brainRunRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(610),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    sourceId: null,
    operation: "verify_run",
    provider: "test",
    model: "test-model",
    status: "running",
    input: {},
    output: null,
    error: null,
    createdAt: new Date("2026-04-29T00:00:06.000Z"),
    completedAt: null,
    ...overrides,
  };
}

function recipeRunRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(710),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    targetClaimId: uuidAt(201),
    brainRunId: uuidAt(610),
    kind: "verify",
    version: 1,
    title: "Verify source-grounded claim",
    goal: "Evaluate the claim against local and external evidence.",
    status: "pending",
    input: { claimId: uuidAt(201) },
    output: null,
    error: null,
    startedAt: new Date("2026-04-29T00:00:07.000Z"),
    completedAt: null,
    createdAt: new Date("2026-04-29T00:00:07.000Z"),
    updatedAt: new Date("2026-04-29T00:00:07.000Z"),
    ...overrides,
  };
}

function recipeStepRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(711),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    recipeRunId: uuidAt(710),
    sessionId: uuidAt(101),
    stepKey: "retrieve_local_context",
    title: "Retrieve local context",
    position: 1,
    status: "pending",
    inputs: { required: ["claimId"] },
    outputs: null,
    error: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date("2026-04-29T00:00:08.000Z"),
    updatedAt: new Date("2026-04-29T00:00:08.000Z"),
    ...overrides,
  };
}

function embeddingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(980),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    objectType: "brain_object",
    objectId: uuidAt(960),
    title: "Saved founder insight",
    content: "Founders pay for urgent artifacts.",
    contentHash: "content-hash",
    embeddingModel: "test-embedding",
    embeddingJson: [1, 0],
    embeddingText: "[1,0]",
    metadata: {},
    expiresAt: null,
    createdAt: new Date("2026-04-29T00:00:09.000Z"),
    updatedAt: new Date("2026-04-29T00:00:09.000Z"),
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

function scopeInput(): BrainScope {
  return {
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
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
