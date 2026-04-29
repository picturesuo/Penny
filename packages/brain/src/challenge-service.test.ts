import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PennyDatabase } from "./db/client.ts";
import { brainRuns, challengeRounds, claimEdges, claims, claimVersions, derivedEffects, moves, shapes } from "./db/schema.ts";
import { rankNextMoveCandidates } from "./domain/engine.ts";
import type { PennyYcDemoGraphFixture } from "./domain/types.ts";
import {
  buildTemplateChallenge,
  ChallengeRoundConflictError,
  ChallengeRoundService,
  type RespondToChallengeInput,
} from "./services/challenge-service.ts";
import { parseMovePayload } from "./move-payloads.ts";

test("ChallengeRoundService issueChallengeFromCandidate creates an explainable challenge_issued round", async () => {
  const { db, calls } = fakeChallengeDb({
    selectRows: [[candidateRow()], [claimRow()], [claimVersionRow()]],
    insertRows: [
      brainRunRow,
      (values: Record<string, unknown>) => claimRow({ id: uuidAt(203), kind: values.kind }),
      (values: Record<string, unknown>) => claimVersionRow({ id: uuidAt(703), claimId: uuidAt(203), ...values }),
      (values: Record<string, unknown>) => edgeRow({ id: uuidAt(302), ...values }),
      (values: Record<string, unknown>) => moveRow({ ...values, id: uuidAt(602) }),
      (values: Record<string, unknown>) => challengeRoundRow({ id: uuidAt(901), ...values }),
    ],
  });
  const service = new ChallengeRoundService(db);
  const result = await service.issueChallengeFromCandidate({
    brainId: uuidAt(900),
    sessionId: uuidAt(101),
    candidateId: "next_candidate",
  });

  assert.equal(result.status, "issued");
  assert.equal(result.move.kind, "challenge_issued");
  assert.equal(result.challengeRound.status, "open");
  assert.equal(result.failureType, "shaky_assumption");
  assert.equal(result.strength, "strong");
  assert.match(result.whyThis, /willingness to pay before traction/);
  assert.equal(result.challengeRound.failureType, result.failureType);
  assert.equal(result.challengeRound.strength, result.strength);
  assert.equal(result.challengeRound.whyThis, result.whyThis);
  assert.equal(calls.insert.some((call) => call.table === moves && insertValue(call).kind === "challenge_issued"), true);
  assert.equal(calls.insert.some((call) => call.table === challengeRounds), true);
});

test("ChallengeRoundService reuses an open challenge for the same candidate", async () => {
  const { db, calls } = fakeChallengeDb({
    selectRows: [
      [candidateRow()],
      [claimRow()],
      [claimVersionRow()],
      [challengeRoundRow()],
      [claimRow({ id: uuidAt(203), kind: "belief" })],
      [claimVersionRow({ id: uuidAt(703), claimId: uuidAt(203), brainRunId: uuidAt(950) })],
      [edgeRow()],
      [moveRow({ id: uuidAt(602), kind: "challenge_issued" })],
      [brainRunRow()],
    ],
  });
  const service = new ChallengeRoundService(db);
  const result = await service.issueChallengeFromCandidate({
    brainId: uuidAt(900),
    sessionId: uuidAt(101),
    candidateId: "next_candidate",
  });

  assert.equal(result.status, "issued");
  assert.equal(result.challengeRound.id, uuidAt(901));
  assert.equal(result.challengeRound.status, "open");
  assert.equal(result.move.id, uuidAt(602));
  assert.equal(result.move.kind, "challenge_issued");
  assert.equal(result.brainRun.id, uuidAt(950));
  assert.equal(calls.insert.length, 0);
  assert.equal(calls.update.length, 0);
});

test("ChallengeRoundService defend and absorb create response moves and complete focus", async () => {
  const defend = await respondWith({ response: "defend", reasoning: "The critique ignores urgent founder moments." });
  const absorb = await respondWith({ response: "absorb", reasoning: "This should remain a live market risk." });

  assert.equal(defend.result.move.kind, "user_defended");
  assert.equal(defend.result.focusCompletedMove.kind, "focus_completed");
  assert.equal(defend.result.challengeRound.response, "defend");
  assert.equal(defend.result.receipt.currentClaimVersionId, uuidAt(702));
  assert.equal(defend.result.nextMove.status, "client_tick_required");
  assert.equal(defend.result.nextMove.endpoint, `/api/sessions/${uuidAt(101)}/autopilot/tick`);
  assert.deepEqual(defend.result.nextMove.body, { resume: true });
  assert.equal(defend.result.nextMove.expectedMoveKind, "next_move_recomputed");
  assert.equal(defend.result.derivedEffects.some((effect) => effect.kind === "shape_candidate"), true);
  assert.equal(defend.calls.insert.some((call) => call.table === moves && insertValue(call).kind === "user_defended"), true);
  assert.equal(defend.calls.insert.some((call) => call.table === shapes), true);
  assert.equal(defend.calls.insert.some((call) => call.table === derivedEffects), true);
  assert.equal(defend.calls.insert.some((call) => call.table === moves && insertValue(call).kind === "focus_completed"), true);
  assert.equal(absorb.result.move.kind, "critique_absorbed");
  assert.equal(absorb.result.focusCompletedMove.kind, "focus_completed");
  assert.equal(absorb.result.challengeRound.response, "absorb");
  assert.equal(absorb.result.challengeEdge.status, "acknowledged_vulnerability");
  assert.equal(absorb.result.receipt.unresolvedRisk, true);
  assert.equal(absorb.result.derivedEffects.some((effect) => effect.kind === "shape_candidate"), true);
  assert.equal(absorb.calls.insert.some((call) => call.table === moves && insertValue(call).kind === "critique_absorbed"), true);
  assert.equal(absorb.calls.insert.some((call) => call.table === moves && insertValue(call).kind === "focus_completed"), true);
});

test("ChallengeRoundService revise preserves old version and creates a new current version", async () => {
  const revisedText =
    "Pre-seed founders will pay when Penny creates an immediate fundraising or decision artifact.";
  const { result, calls } = await respondWith({
    response: "revise",
    revisedText,
    reasoning: "The original claim was too broad.",
  });
  const oldVersionUpdate = calls.update.find((call) => call.table === claimVersions);
  const currentVersionUpdate = calls.update.find(
    (call) => call.table === claimVersions && call.set.isCurrent === true,
  );
  const newVersionInsert = calls.insert.find((call) => call.table === claimVersions);

  assert.equal(result.move.kind, "claim_revised");
  assert.equal(result.focusCompletedMove.kind, "focus_completed");
  assert.equal(result.receipt.previousClaimVersionId, uuidAt(702));
  assert.notEqual(result.receipt.currentClaimVersionId, uuidAt(702));
  assert.equal(result.receipt.claimTextChanged, true);
  assert.equal(result.nextMove.requiredCommand, "tick_autopilot");
  assert.equal(result.derivedEffects.some((effect) => effect.kind === "shape_candidate"), true);
  assert.equal(result.targetClaim.text, revisedText);
  assert.equal(oldVersionUpdate?.set.isCurrent, false);
  assert.ok(oldVersionUpdate?.set.validUntil instanceof Date);
  assert.equal(oldVersionUpdate?.set.supersededByVersionId, result.receipt.currentClaimVersionId);
  assert.equal(newVersionInsert ? insertValue(newVersionInsert).content : null, revisedText);
  assert.equal(newVersionInsert ? insertValue(newVersionInsert).isCurrent : null, false);
  assert.equal(newVersionInsert ? insertValue(newVersionInsert).id : null, result.receipt.currentClaimVersionId);
  assert.equal(currentVersionUpdate?.set.isCurrent, true);
});

test("ChallengeRoundService rejects already-responded challenges before writing", async () => {
  const { db, calls } = fakeChallengeDb({
    selectRows: [[challengeRoundRow({ status: "responded", response: "defend", respondedAt: dateAt(20) })]],
  });
  const service = new ChallengeRoundService(db);

  await assert.rejects(
    service.respondToChallenge({
      challengeId: uuidAt(901),
      response: "defend",
      reasoning: "A second answer should not be accepted.",
    }),
    ChallengeRoundConflictError,
  );
  assert.equal(calls.insert.length, 0);
  assert.equal(calls.update.length, 0);
});

test("buildTemplateChallenge returns the exact demo challenge when the target claim matches the spec", () => {
  const challenge = buildTemplateChallenge({
    targetClaimId: uuidAt(202),
    targetKind: "assumption",
    targetText: "Pre-seed founders will pay for structured thinking before traction.",
    targetConfidence: 42,
    candidateAction: "challenge",
    candidateReason: "The founder wedge depends on willingness to pay before traction.",
    candidateScore: 930,
  });

  assert.equal(challenge.failureType, "shaky_assumption");
  assert.equal(challenge.strength, "strong");
  assert.match(challenge.critique, /budget and attention usually go to building, selling, fundraising, or finding customers/);
  assert.match(challenge.whyThis, /willingness to pay before traction/);
  assert.match(challenge.whatWouldResolveIt, /urgent pre-seed moment/);
  assert.equal(challenge.provenanceTag, "penny:template.challenge.v0");
});

test("buildTemplateChallenge returns the exact demo challenge for the selected YC fixture candidate", () => {
  const graph = loadYcDemoFixture();
  const candidate = rankNextMoveCandidates(graph, 1)[0];

  assert.ok(candidate);
  assert.equal(candidate.targetClaimId, graph.expectedAutopilot.lowConfidenceMarketAssumptionId);

  const targetClaim = graph.claims.find((claim) => claim.id === candidate.targetClaimId);
  const targetVersion = targetClaim?.versions?.find(
    (version) => version.id === targetClaim.currentVersionId && version.isCurrent,
  );

  assert.ok(targetClaim);
  assert.ok(targetVersion);

  const challenge = buildTemplateChallenge({
    targetClaimId: targetClaim.id,
    targetKind: targetClaim.kind,
    targetText: targetVersion.text,
    targetConfidence: targetVersion.confidence,
    candidateAction: candidate.action,
    candidateReason: candidate.reason,
    candidateScore: candidate.score,
    scoreBreakdown: candidate.scoreBreakdown,
  });

  assert.equal(challenge.failureType, "shaky_assumption");
  assert.equal(challenge.strength, "strong");
  assert.match(challenge.critique, /budget and attention usually go to building, selling, fundraising, or finding customers/);
  assert.match(challenge.whyThis, /willingness to pay before traction/);
  assert.match(challenge.whatWouldResolveIt, /urgent pre-seed moment/);
});

test("buildTemplateChallenge infers explainable V0 challenge types from candidate action", () => {
  const clarify = buildTemplateChallenge({
    targetClaimId: uuidAt(203),
    targetKind: "belief",
    targetText: "Penny is better structured thinking.",
    targetConfidence: 50,
    candidateAction: "clarify",
    candidateReason: "The claim uses broad language.",
    candidateScore: 640,
  });
  const verify = buildTemplateChallenge({
    targetClaimId: uuidAt(204),
    targetKind: "belief",
    targetText: "The retention lift is already proven.",
    targetConfidence: 86,
    candidateAction: "verify",
    candidateReason: "Confidence is high without enough visible evidence.",
    candidateScore: 760,
  });

  assert.equal(clarify.failureType, "definition_failure");
  assert.equal(clarify.strength, "moderate");
  assert.match(clarify.whatWouldResolveIt, /defining/);
  assert.equal(verify.failureType, "weak_evidence");
  assert.equal(verify.strength, "strong");
  assert.match(verify.critique, /visible evidence/);
});

test("focus_completed payload validates the Wave 5 challenge response receipt", () => {
  const payload = parseMovePayload("focus_completed", {
    focusSource: "challenge_response",
    completedByMoveId: uuidAt(603),
    completedByMoveKind: "claim_revised",
    challengeRoundId: uuidAt(901),
    targetClaimId: uuidAt(202),
    targetEdgeId: uuidAt(302),
    outcome: "revise",
    claimIds: [uuidAt(202), uuidAt(203)],
    edgeIds: [uuidAt(302)],
    artifactIds: [],
  });

  assert.equal(payload.completedByMoveKind, "claim_revised");
  assert.equal(payload.outcome, "revise");
  assert.equal(payload.focusSource, "challenge_response");
});

type ChallengeResponseWithoutId =
  | Omit<Extract<RespondToChallengeInput, { response: "defend" }>, "challengeId">
  | Omit<Extract<RespondToChallengeInput, { response: "revise" }>, "challengeId">
  | Omit<Extract<RespondToChallengeInput, { response: "absorb" }>, "challengeId">;

async function respondWith(input: ChallengeResponseWithoutId) {
  const edgeStatus = input.response === "absorb" ? "acknowledged_vulnerability" : "active";
  const { db, calls } = fakeChallengeDb({
    insertRows:
      input.response === "revise"
        ? [
            (values: Record<string, unknown>) => moveRow({ ...values, id: uuidAt(603) }),
            (values: Record<string, unknown>) => claimVersionRow({ ...values }),
            (values: Record<string, unknown>) => shapeRow(values),
            (values: Record<string, unknown> | Record<string, unknown>[]) => derivedEffectRows(values),
            (values: Record<string, unknown>) => moveRow({ ...values, id: uuidAt(604) }),
          ]
        : [
            (values: Record<string, unknown>) => moveRow({ ...values, id: uuidAt(603) }),
            (values: Record<string, unknown>) => shapeRow(values),
            (values: Record<string, unknown> | Record<string, unknown>[]) => derivedEffectRows(values),
            (values: Record<string, unknown>) => moveRow({ ...values, id: uuidAt(604) }),
          ],
    selectRows: [
      [challengeRoundRow()],
      [claimRow()],
      [claimVersionRow()],
      [claimRow({ id: uuidAt(203), kind: "belief" })],
      [edgeRow()],
      [moveRow({ id: uuidAt(603), kind: responseMoveKind(input.response) })],
      [claimRow(), claimRow({ id: uuidAt(203), kind: "belief" })],
      [claimVersionRow()],
      [edgeRow({ status: edgeStatus })],
      [moveRow({ id: uuidAt(603), kind: responseMoveKind(input.response) })],
      [],
      [],
      [],
    ],
    updateRows: updateRowsForResponse(input.response),
  });
  const service = new ChallengeRoundService(db);
  const result = await service.respondToChallenge({ ...input, challengeId: uuidAt(901) } as RespondToChallengeInput);

  assert.equal(result.challengeEdge.status, edgeStatus);

  return { result, calls };
}

type InsertValues = Record<string, unknown> | Record<string, unknown>[];
type InsertRow = unknown | ((values: InsertValues) => unknown);

function updateRowsForResponse(response: "defend" | "revise" | "absorb"): unknown[] {
  const respondedRound = challengeRoundRow({
    status: "responded",
    response,
    responseMoveId: uuidAt(603),
    focusCompletedMoveId: uuidAt(604),
    respondedAt: dateAt(20),
  });

  if (response === "absorb") {
    return [edgeRow({ status: "acknowledged_vulnerability" }), respondedRound];
  }

  if (response === "revise") {
    return [{ id: uuidAt(999) }, respondedRound];
  }

  return [respondedRound];
}

function fakeChallengeDb(options: {
  selectRows?: unknown[][];
  insertRows?: InsertRow[];
  updateRows?: unknown[];
}) {
  const selectRows = [...(options.selectRows ?? [])];
  const insertRows = [...(options.insertRows ?? [])];
  const updateRows = [...(options.updateRows ?? [])];
  const calls: {
    select: number;
    insert: Array<{ table: unknown; values: InsertValues }>;
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
      const call: { table: unknown; values: InsertValues } = { table, values: {} };
      calls.insert.push(call);

      return {
        values(values: InsertValues) {
          call.values = values;

          return {
            returning() {
              return Promise.resolve(resolveInsertedRows(insertRows.shift(), values));
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
              return queryWithReturning(() => updateRows.shift());
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

function insertValue(call: { values: InsertValues }): Record<string, unknown> {
  return Array.isArray(call.values) ? (call.values[0] ?? {}) : call.values;
}

function resolveInsertedRows(row: InsertRow | undefined, values: InsertValues): unknown[] {
  const resolved = resolveInsertedRow(row, values);

  if (resolved === undefined) {
    return [];
  }

  return Array.isArray(resolved) ? resolved : [resolved];
}

function resolveInsertedRow(row: InsertRow | undefined, values: InsertValues) {
  return typeof row === "function" ? row(values) : row;
}

function responseMoveKind(response: "defend" | "revise" | "absorb") {
  if (response === "defend") {
    return "user_defended";
  }

  return response === "revise" ? "claim_revised" : "critique_absorbed";
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

function queryWithReturning(row: () => unknown) {
  const chain = {
    returning() {
      return Promise.resolve([row()]);
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

function candidateRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(801),
    sessionId: uuidAt(101),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    candidateId: "next_candidate",
    fingerprint: "fingerprint_123",
    graphHash: "graph_hash",
    action: "challenge",
    mode: "challenge",
    targetClaimId: uuidAt(202),
    targetEdgeId: uuidAt(302),
    score: 930,
    rank: 1,
    reason: "The founder wedge depends on willingness to pay before traction.",
    reasonCodes: ["load_bearing"],
    exitCriteria: { label: "Issue challenge.", acceptedMoveKinds: ["challenge_issued"] },
    scoreBreakdown: { leverage: 300 },
    provenance: { claimIds: [uuidAt(202)], edgeIds: [], moveIds: [], artifactIds: [] },
    selected: true,
    selectedAt: dateAt(9),
    createdAt: dateAt(8),
    updatedAt: dateAt(9),
    ...overrides,
  };
}

function brainRunRow(values: Record<string, unknown> = {}) {
  return {
    id: uuidAt(950),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    sourceId: uuidAt(601),
    operation: "brain.challenge",
    provider: "penny-template",
    model: "challenge-v0",
    status: "succeeded",
    input: {},
    output: {},
    error: null,
    createdAt: dateAt(10),
    completedAt: dateAt(10),
    ...values,
  };
}

function claimRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(202),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    sourceId: uuidAt(601),
    kind: "assumption",
    createdAt: dateAt(2),
    ...overrides,
  };
}

function claimVersionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(702),
    claimId: uuidAt(202),
    sourceId: uuidAt(601),
    brainRunId: null,
    moveId: null,
    content: "Pre-seed founders will pay for structured thinking before traction.",
    status: "exploratory",
    confidence: 42,
    isCurrent: true,
    validFrom: dateAt(2),
    validUntil: null,
    supersededByVersionId: null,
    createdAt: dateAt(2),
    ...overrides,
  };
}

function edgeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(302),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    fromClaimId: uuidAt(203),
    toClaimId: uuidAt(202),
    kind: "challenges",
    status: "active",
    label: "shaky_assumption",
    createdAt: dateAt(10),
    ...overrides,
  };
}

function challengeRoundRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(901),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    nextMoveCandidateId: uuidAt(801),
    candidateId: "next_candidate",
    candidateFingerprint: "fingerprint_123",
    status: "open",
    response: null,
    targetClaimId: uuidAt(202),
    targetClaimVersionId: uuidAt(702),
    critiqueClaimId: uuidAt(203),
    critiqueClaimVersionId: uuidAt(703),
    challengeEdgeId: uuidAt(302),
    brainRunId: uuidAt(950),
    challengeMoveId: uuidAt(602),
    responseMoveId: null,
    focusCompletedMoveId: null,
    failureType: "shaky_assumption",
    strength: "strong",
    critique: "The risky assumption is willingness to pay before traction.",
    whyThis: "This is load-bearing because the wedge depends on willingness to pay before traction.",
    whatWouldResolveIt: "Name the urgent paid moment and artifact.",
    createdAt: dateAt(10),
    respondedAt: null,
    updatedAt: dateAt(10),
    ...overrides,
  };
}

function moveRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: uuidAt(603),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    kind: "user_defended",
    summary: "Created move.",
    payload: {},
    createdAt: dateAt(11),
    ...overrides,
  };
}

function shapeRow(values: InsertValues) {
  const record = Array.isArray(values) ? (values[0] ?? {}) : values;

  return {
    id: uuidAt(1001),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    sourceMoveId: uuidAt(603),
    key: "challenge_response_loop",
    status: "candidate",
    version: 1,
    label: "Challenge response loop",
    description: "Recent moves are pressure-testing claims through challenge and explicit response.",
    confidence: 60,
    supportingMoveIds: [uuidAt(603)],
    payload: {},
    createdAt: dateAt(12),
    reviewedAt: null,
    ...record,
  };
}

function derivedEffectRows(values: InsertValues) {
  const rows = Array.isArray(values) ? values : [values];

  return rows.map((row, index) => ({
    id: uuidAt(1101 + index),
    userId: "test-user",
    workspaceId: "test-workspace",
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    sourceMoveId: uuidAt(603),
    kind: row.kind ?? "shape_candidate",
    status: "pending_review",
    version: row.version ?? index + 1,
    title: row.title ?? "Derived effect",
    summary: row.summary ?? "Derived after-move effect.",
    payload: row.payload ?? {},
    createdAt: dateAt(13 + index),
    reviewedAt: null,
  }));
}

function loadYcDemoFixture(): PennyYcDemoGraphFixture {
  return JSON.parse(
    readFileSync(new URL("../../../test/fixtures/penny-yc-demo-graph.json", import.meta.url), "utf8"),
  ) as PennyYcDemoGraphFixture;
}

function dateAt(seconds: number): Date {
  return new Date(`2026-04-29T00:00:${seconds.toString().padStart(2, "0")}.000Z`);
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
