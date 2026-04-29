import assert from "node:assert/strict";
import test from "node:test";
import type { PennyDatabase } from "./db/client.ts";
import {
  artifacts,
  brainRuns,
  challengeRounds,
  claimEdges,
  claims,
  claimVersions,
  focusStates,
  moves,
  nextMoveCandidates,
  sessions,
  sources,
} from "./db/schema.ts";
import {
  ChallengeBriefConflictError,
  compileChallengeBriefDraft,
  generateChallengeBrief,
  type ChallengeBriefState,
} from "./services/challenge-brief-service.ts";

test("compileChallengeBriefDraft builds all V0 sections from persisted Thinking Mode state", () => {
  const state = sampleState();
  const before = JSON.stringify(state);
  const draft = compileChallengeBriefDraft(state);
  const sections = draft.payload.sections;

  assert.equal(draft.title, "Challenge Brief");
  assert.equal(draft.payload.kind, "challenge_brief");
  assert.equal(sections.originalSeedIdea.sourceId, uuidAt(150));
  assert.match(sections.originalSeedIdea.text, /thinking autopilot/);
  assert.equal(sections.currentPrimaryClaim.claimVersionId, uuidAt(302));
  assert.equal(sections.currentPrimaryClaim.text, "Penny sells when it creates an urgent founder artifact.");
  assert.equal(sections.keyAssumptions[0]?.claimId, uuidAt(202));
  assert.ok(sections.keyAssumptions[0]?.markers.includes("low_confidence"));
  assert.equal(sections.selectedPressurePoint.targetClaimId, uuidAt(202));
  assert.equal(sections.selectedPressurePoint.failureType, "shaky_assumption");
  assert.match(sections.whyPennyChoseIt.join(" "), /willingness to pay/);
  assert.equal(sections.challengeIssued.challengeMoveId, uuidAt(602));
  assert.equal(sections.challengeIssued.strength, "strong");
  assert.equal(sections.userResponse.response, "Revise");
  assert.equal(sections.userResponse.moveId, uuidAt(603));
  assert.equal(sections.whatChanged[0]?.previousClaimVersionId, uuidAt(303));
  assert.equal(sections.whatChanged[0]?.currentClaimVersionId, uuidAt(304));
  assert.ok(sections.openRisks.some((risk) => risk.kind === "assumption"));
  assert.equal(sections.recommendedNextMove.action, "verify");
  assert.equal(sections.recommendedNextMove.expectedCompletionMove, "verify_run");
  assert.ok(sections.moveTimelineSummary.some((move) => move.kind === "focus_completed"));
  assert.deepEqual(draft.payload.inputs.challengeRoundIds, [uuidAt(901)]);
  assert.equal(draft.payload.inputs.latestSelectedCandidate?.candidateId, "verify-founder-wtp");
  assert.ok(draft.payload.refs.claimVersionIds.includes(uuidAt(303)));
  assert.equal(JSON.stringify(state), before);
});

test("compileChallengeBriefDraft records an unanswered challenge without changing claim text", () => {
  const base = sampleState();
  const state = {
    ...base,
    challengeRounds: [
      {
        ...base.challengeRounds[0]!,
        status: "open" as const,
        response: null,
        responseMoveId: null,
        respondedAt: null,
      },
    ],
    moves: base.moves.filter((move) => !["claim_revised", "focus_completed"].includes(move.kind)),
    latestSelectedCandidate: null,
  };
  const draft = compileChallengeBriefDraft(state);

  assert.equal(draft.payload.sections.userResponse.text, "No response recorded yet.");
  assert.equal(draft.payload.sections.whatChanged[0]?.text, "No claim text changed; no response recorded yet.");
  assert.equal(draft.payload.sections.recommendedNextMove.action, "respond_to_challenge");
  assert.equal(draft.payload.sections.recommendedNextMove.expectedCompletionMove, "user_defended|claim_revised|critique_absorbed");
});

test("compileChallengeBriefDraft rejects sessions without claims", () => {
  assert.throws(
    () =>
      compileChallengeBriefDraft({
        ...sampleState(),
        claims: [],
      }),
    ChallengeBriefConflictError,
  );
});

test("generateChallengeBrief persists a Challenge Brief after Revise without mutating claims", async () => {
  const state = sampleState();
  const { db, calls } = fakeChallengeBriefDb(state);

  const result = await generateChallengeBrief(db, state.session.id);
  const sections = result.brief.sections;

  assert.equal(result.status, "created");
  assert.equal(result.artifact.kind, "challenge_brief");
  assert.equal(sections.originalSeedIdea.text, "I'm building Penny, a thinking autopilot for founders.");
  assert.equal(sections.selectedPressurePoint.targetClaimId, uuidAt(202));
  assert.equal(sections.selectedPressurePoint.failureType, "shaky_assumption");
  assert.equal(sections.challengeIssued.text, "The risk is whether founders will pay before traction.");
  assert.equal(sections.challengeIssued.challengeRoundId, uuidAt(901));
  assert.equal(sections.userResponse.response, "Revise");
  assert.match(sections.userResponse.reasoning ?? "", /narrower/);
  assert.equal(sections.whatChanged[0]?.previousClaimVersionId, uuidAt(303));
  assert.equal(sections.whatChanged[0]?.currentClaimVersionId, uuidAt(304));
  assert.ok(sections.openRisks.some((risk) => risk.kind === "assumption" && risk.claimId === uuidAt(202)));
  assert.equal(sections.recommendedNextMove.action, "verify");
  assert.equal(sections.recommendedNextMove.expectedCompletionMove, "verify_run");

  const artifactInsert = calls.insert.find((call) => call.table === artifacts);
  assert.ok(artifactInsert);
  assert.equal(artifactInsert.values.kind, "challenge_brief");
  assert.deepEqual(artifactInsert.values.payload, result.brief);

  const moveInsert = calls.insert.find((call) => call.table === moves);
  assert.ok(moveInsert);
  assert.equal(moveInsert.values.kind, "artifact_created");
  const movePayload = asRecord(moveInsert.values.payload);
  assert.deepEqual(movePayload.artifactIds, [result.artifact.id]);
  assert.equal(result.move.kind, "artifact_created");
  assert.deepEqual(result.move.artifactIds, [result.artifact.id]);

  assert.equal(calls.insert.some((call) => call.table === claims || call.table === claimVersions), false);
  assert.equal(calls.update.some((call) => call.table === claims || call.table === claimVersions), false);
});

function sampleState(): ChallengeBriefState {
  return {
    session: {
      id: uuidAt(101),
      userId: "dev-user",
      workspaceId: "dev-workspace",
      projectId: "dev-project",
      sphereId: "dev-sphere",
      status: "open",
      title: "Penny founder wedge",
      createdAt: now(1),
    },
    sources: [
      {
        id: uuidAt(150),
        kind: "raw_idea",
        rawText: "I'm building Penny, a thinking autopilot for founders.",
        createdAt: now(1),
      },
    ],
    claims: [
      claim(uuidAt(201), "belief", uuidAt(302), "Penny sells when it creates an urgent founder artifact.", 70, [
        version(uuidAt(301), uuidAt(201), "Penny is a thinking autopilot for founders.", 68, false, uuidAt(302)),
        version(uuidAt(302), uuidAt(201), "Penny sells when it creates an urgent founder artifact.", 70),
      ]),
      claim(uuidAt(202), "assumption", uuidAt(304), "Pre-seed founders will pay during an urgent fundraising decision.", 48, [
        version(uuidAt(303), uuidAt(202), "Pre-seed founders will pay for structured thinking before traction.", 45, false, uuidAt(304)),
        version(uuidAt(304), uuidAt(202), "Pre-seed founders will pay during an urgent fundraising decision.", 48),
      ]),
      claim(uuidAt(203), "belief", uuidAt(305), "Founders may admire clarity but defer payment.", 82, [
        version(uuidAt(305), uuidAt(203), "Founders may admire clarity but defer payment.", 82),
      ]),
    ],
    edges: [
      edge(uuidAt(401), uuidAt(201), uuidAt(202), "depends_on", "willingness to pay"),
      edge(uuidAt(402), uuidAt(203), uuidAt(202), "challenges", "shaky_assumption"),
    ],
    moves: [
      move(uuidAt(600), "seed_claim_created", "Created the stable seed claim.", [uuidAt(201)], []),
      move(uuidAt(601), "next_move_recomputed", "Selected challenge as next move.", [uuidAt(202)], [uuidAt(401)]),
      move(uuidAt(602), "challenge_issued", "Issued a Thinking Mode challenge.", [uuidAt(202), uuidAt(203)], [uuidAt(402)], {
        challengeEdgeId: uuidAt(402),
        strength: "strong",
      }),
      move(uuidAt(603), "claim_revised", "User revised the target claim.", [uuidAt(202), uuidAt(203)], [uuidAt(402)], {
        reasoning: "The paid moment needs to be narrower.",
        previousClaimVersionId: uuidAt(303),
        currentClaimVersionId: uuidAt(304),
        challengeEdgeId: uuidAt(402),
      }),
      move(uuidAt(604), "focus_completed", "Completed challenge focus.", [uuidAt(202), uuidAt(203)], [uuidAt(402)]),
    ],
    challengeRounds: [
      {
        id: uuidAt(901),
        status: "responded",
        response: "revise",
        targetClaimId: uuidAt(202),
        targetClaimVersionId: uuidAt(303),
        critiqueClaimId: uuidAt(203),
        critiqueClaimVersionId: uuidAt(305),
        challengeEdgeId: uuidAt(402),
        challengeMoveId: uuidAt(602),
        responseMoveId: uuidAt(603),
        failureType: "shaky_assumption",
        strength: "strong",
        critique: "The risk is whether founders will pay before traction.",
        whyThis: "This is load-bearing because the founder wedge depends on willingness to pay.",
        whatWouldResolveIt: "Name the urgent founder moment and artifact.",
        createdAt: now(3),
        respondedAt: now(4),
      },
    ],
    focusState: {
      sessionId: uuidAt(101),
      mode: "challenge",
      focusedClaimId: uuidAt(202),
      focusedEdgeId: uuidAt(402),
      source: "challenge_response",
      suggestionMoveId: uuidAt(601),
      manualMoveId: null,
      paused: false,
      reason: "Challenge focus completed.",
      updatedAt: now(5),
    },
    latestSelectedCandidate: {
      id: uuidAt(801),
      candidateId: "verify-founder-wtp",
      fingerprint: "verify-founder-wtp-fingerprint",
      action: "verify",
      mode: "verify",
      targetClaimId: uuidAt(202),
      targetEdgeId: uuidAt(401),
      rank: 1,
      score: 880,
      reason: "Verify the revised willingness to pay claim.",
      reasonCodes: ["revised_claim", "market_risk"],
      exitCriteria: {
        acceptedMoveKinds: ["verify_run"],
      },
      selectedAt: now(6),
      updatedAt: now(6),
    },
    existingArtifacts: [],
  };
}

function claim(
  id: string,
  kind: "belief" | "assumption",
  currentVersionId: string,
  text: string,
  confidence: number,
  versions: ChallengeBriefState["claims"][number]["versions"],
): ChallengeBriefState["claims"][number] {
  return {
    id,
    kind,
    sourceId: uuidAt(150),
    createdAt: now(1),
    currentVersion: {
      id: currentVersionId,
      claimId: id,
      text,
      status: "exploratory",
      confidence,
      isCurrent: true,
      validFrom: now(1),
      validUntil: null,
      supersededByVersionId: null,
      moveId: null,
    },
    versions,
  };
}

function version(id: string, claimId: string, text: string, confidence: number, isCurrent = true, supersededByVersionId: string | null = null) {
  return {
    id,
    claimId,
    text,
    status: "exploratory" as const,
    confidence,
    isCurrent,
    validFrom: now(1),
    validUntil: isCurrent ? null : now(2),
    supersededByVersionId,
    moveId: null,
  };
}

function edge(id: string, fromClaimId: string, toClaimId: string, kind: "depends_on" | "challenges", label: string) {
  return {
    id,
    fromClaimId,
    toClaimId,
    kind,
    status: "active" as const,
    label,
    createdAt: now(2),
  };
}

function move(
  id: string,
  kind: string,
  summary: string,
  claimIds: string[],
  edgeIds: string[],
  extraPayload: Record<string, unknown> = {},
) {
  return {
    id,
    kind,
    summary,
    payload: {
      claimIds,
      edgeIds,
      ...extraPayload,
    },
    createdAt: now(3),
  };
}

type InsertRow = Record<string, unknown> | ((values: Record<string, unknown>) => Record<string, unknown>);
type UpdateRow = Record<string, unknown> | ((set: Record<string, unknown>) => Record<string, unknown>);

function fakeChallengeBriefDb(state: ChallengeBriefState) {
  const brainRunId = uuidAt(701);
  const artifactId = uuidAt(1001);
  const artifactMoveId = uuidAt(1002);
  const selectRows = [
    [sessionRow(state.session)],
    state.sources.map(sourceRow),
    state.claims.map(claimRow),
    state.claims.flatMap((claimForState) => claimForState.versions.map(versionRow)),
    state.edges.map(edgeRow),
    state.moves.map(moveRow),
    state.challengeRounds.map(challengeRoundRow),
    state.focusState ? [focusStateRow(state.focusState)] : [],
    state.latestSelectedCandidate ? [candidateRow(state.latestSelectedCandidate)] : [],
    state.existingArtifacts.map(existingArtifactRow),
  ];
  const insertRows: InsertRow[] = [
    (values) => ({
      id: brainRunId,
      output: null,
      error: null,
      completedAt: null,
      createdAt: dateAt(10),
      ...values,
    }),
    (values) => ({
      id: artifactId,
      createdAt: dateAt(11),
      ...values,
    }),
    (values) => ({
      id: artifactMoveId,
      createdAt: dateAt(12),
      ...values,
    }),
  ];
  const updateRows: UpdateRow[] = [
    (set) => ({
      id: brainRunId,
      userId: state.session.userId,
      workspaceId: state.session.workspaceId,
      projectId: state.session.projectId,
      sphereId: state.session.sphereId,
      sessionId: state.session.id,
      sourceId: state.sources[0]?.id ?? null,
      operation: "brain.artifact.challenge_brief",
      provider: "penny-template",
      model: "challenge-brief-v0",
      input: {},
      createdAt: dateAt(10),
      ...set,
    }),
  ];
  const calls: {
    select: number;
    insert: Array<{ table: unknown; values: Record<string, unknown> }>;
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
      const call = { table, values: {} };
      calls.insert.push(call);

      return {
        values(values: Record<string, unknown>) {
          call.values = values;

          return {
            returning() {
              return Promise.resolve([resolveRow(insertRows.shift(), values)]);
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
              return {
                returning() {
                  return Promise.resolve([resolveRow(updateRows.shift(), set)]);
                },
              };
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

function resolveRow(row: InsertRow | UpdateRow | undefined, values: Record<string, unknown>) {
  return typeof row === "function" ? row(values) : row;
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

function sessionRow(state: ChallengeBriefState["session"]) {
  return {
    ...state,
    createdAt: new Date(state.createdAt),
    endedAt: null,
  };
}

function sourceRow(sourceForState: ChallengeBriefState["sources"][number]) {
  return {
    id: sourceForState.id,
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    sessionId: uuidAt(101),
    kind: sourceForState.kind,
    rawText: sourceForState.rawText,
    createdAt: new Date(sourceForState.createdAt),
  };
}

function claimRow(claimForState: ChallengeBriefState["claims"][number]) {
  return {
    id: claimForState.id,
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    sessionId: uuidAt(101),
    sourceId: claimForState.sourceId,
    kind: claimForState.kind,
    createdAt: new Date(claimForState.createdAt),
  };
}

function versionRow(versionForState: ChallengeBriefState["claims"][number]["versions"][number]) {
  return {
    id: versionForState.id,
    claimId: versionForState.claimId,
    sourceId: uuidAt(150),
    brainRunId: null,
    moveId: versionForState.moveId,
    content: versionForState.text,
    status: versionForState.status,
    confidence: versionForState.confidence,
    isCurrent: versionForState.isCurrent,
    validFrom: new Date(versionForState.validFrom),
    validUntil: versionForState.validUntil ? new Date(versionForState.validUntil) : null,
    supersededByVersionId: versionForState.supersededByVersionId,
    createdAt: new Date(versionForState.validFrom),
  };
}

function edgeRow(edgeForState: ChallengeBriefState["edges"][number]) {
  return {
    id: edgeForState.id,
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    sessionId: uuidAt(101),
    fromClaimId: edgeForState.fromClaimId,
    toClaimId: edgeForState.toClaimId,
    kind: edgeForState.kind,
    status: edgeForState.status,
    label: edgeForState.label,
    createdAt: new Date(edgeForState.createdAt),
  };
}

function moveRow(moveForState: ChallengeBriefState["moves"][number]) {
  return {
    id: moveForState.id,
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    sessionId: uuidAt(101),
    kind: moveForState.kind,
    summary: moveForState.summary,
    payload: moveForState.payload,
    createdAt: new Date(moveForState.createdAt),
  };
}

function challengeRoundRow(roundForState: ChallengeBriefState["challengeRounds"][number]) {
  return {
    id: roundForState.id,
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    sessionId: uuidAt(101),
    nextMoveCandidateId: uuidAt(801),
    candidateId: "verify-founder-wtp",
    candidateFingerprint: "verify-founder-wtp-fingerprint",
    status: roundForState.status,
    response: roundForState.response,
    targetClaimId: roundForState.targetClaimId,
    targetClaimVersionId: roundForState.targetClaimVersionId,
    critiqueClaimId: roundForState.critiqueClaimId,
    critiqueClaimVersionId: roundForState.critiqueClaimVersionId,
    challengeEdgeId: roundForState.challengeEdgeId,
    brainRunId: uuidAt(700),
    challengeMoveId: roundForState.challengeMoveId,
    responseMoveId: roundForState.responseMoveId,
    focusCompletedMoveId: uuidAt(604),
    failureType: roundForState.failureType,
    strength: roundForState.strength,
    critique: roundForState.critique,
    whyThis: roundForState.whyThis,
    whatWouldResolveIt: roundForState.whatWouldResolveIt,
    createdAt: new Date(roundForState.createdAt),
    respondedAt: roundForState.respondedAt ? new Date(roundForState.respondedAt) : null,
    updatedAt: dateAt(9),
  };
}

function focusStateRow(focusStateForState: NonNullable<ChallengeBriefState["focusState"]>) {
  return {
    sessionId: focusStateForState.sessionId,
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    mode: focusStateForState.mode,
    focusedClaimId: focusStateForState.focusedClaimId,
    focusedEdgeId: focusStateForState.focusedEdgeId,
    source: focusStateForState.source,
    suggestionMoveId: focusStateForState.suggestionMoveId,
    manualMoveId: focusStateForState.manualMoveId,
    paused: focusStateForState.paused,
    reason: focusStateForState.reason,
    updatedAt: new Date(focusStateForState.updatedAt),
  };
}

function candidateRow(candidateForState: NonNullable<ChallengeBriefState["latestSelectedCandidate"]>) {
  return {
    id: candidateForState.id,
    sessionId: uuidAt(101),
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    candidateId: candidateForState.candidateId,
    fingerprint: candidateForState.fingerprint,
    graphHash: "stable-graph-hash",
    action: candidateForState.action,
    mode: candidateForState.mode,
    targetClaimId: candidateForState.targetClaimId,
    targetEdgeId: candidateForState.targetEdgeId,
    score: candidateForState.score,
    rank: candidateForState.rank,
    reason: candidateForState.reason,
    reasonCodes: candidateForState.reasonCodes,
    exitCriteria: candidateForState.exitCriteria,
    scoreBreakdown: {},
    provenance: {},
    selected: true,
    selectedAt: candidateForState.selectedAt ? new Date(candidateForState.selectedAt) : null,
    createdAt: dateAt(6),
    updatedAt: new Date(candidateForState.updatedAt),
  };
}

function existingArtifactRow(artifactForState: ChallengeBriefState["existingArtifacts"][number]) {
  return {
    id: artifactForState.id,
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    sessionId: uuidAt(101),
    kind: artifactForState.kind,
    title: artifactForState.title,
    summary: artifactForState.title,
    payload: {},
    createdAt: new Date(artifactForState.createdAt),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));

  return value as Record<string, unknown>;
}

function now(offset: number): string {
  return `2026-04-29T00:00:0${offset}.000Z`;
}

function dateAt(offset: number): Date {
  return new Date(`2026-04-29T00:00:${offset.toString().padStart(2, "0")}.000Z`);
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
