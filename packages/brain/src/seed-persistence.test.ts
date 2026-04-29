import assert from "node:assert/strict";
import test from "node:test";
import { brainRuns, claimEdges, claims, claimVersions, moves, sourceSpans } from "./db/schema.ts";
import type { PennyDatabase } from "./db/client.ts";
import type { BrainSeedInput, BrainSeedOutput } from "./seed.ts";
import { persistBrainSeed, type BrainSeedPrelude, type BrainSeedRunInput } from "./seed-persistence.ts";

test("persistBrainSeed persists every valid thought-map claim and edge kind", async () => {
  const input: BrainSeedInput = {
    rawIdea: "Penny should turn strategy notes into a defensible launch decision.",
    sessionId: uuidAt(100),
  };
  const prelude = createPersistedPrelude(input, {
    operation: "brain.seed",
    provider: "test",
    input,
    startedAt: new Date("2026-04-27T00:00:00.000Z"),
  });
  const recording = createRecordingSeedDb(prelude);
  const persisted = await persistBrainSeed(recording.db as unknown as PennyDatabase, prelude, graphRichSeed);

  assert.deepEqual(
    persisted.claims.map((claim) => claim.seedId),
    graphRichSeed.thoughtMap.claims.map((claim) => claim.id),
  );
  assert.deepEqual(
    persisted.claimVersions.map((version) => version.seedId),
    graphRichSeed.thoughtMap.claims.map((claim) => claim.id),
  );
  assert.deepEqual(
    persisted.edges.map((edge) => edge.seedId),
    graphRichSeed.thoughtMap.edges.map((edge) => edge.id),
  );
  assert.deepEqual(
    persisted.edges.map((edge) => edge.kind),
    ["depends_on", "supports", "questions", "challenges", "clarifies"],
  );
  assert.ok(persisted.idMaps.claimIds.get(graphRichSeed.firstChallenge.targetClaimId));
  assert.ok(persisted.idMaps.claimIds.get(graphRichSeed.learnCandidates[0]?.claimId ?? ""));

  const sourceSpanRows = recording.inserted.source_spans ?? [];
  assert.deepEqual(
    sourceSpanRows.map((row) => row.label),
    ["seed_claim", "extracted_assumption", "extracted_assumption", "extracted_assumption", "seed_question", "seed_concept"],
  );

  const assumptionsMove = persisted.moves.find((move) => move.seedId === "move.assumptions_extracted");
  assert.ok(assumptionsMove);
  assert.deepEqual(payloadStringArray(assumptionsMove.payload, "seedEdgeIds"), ["edge.seed.assumption.1"]);
});

const graphRichSeed: BrainSeedOutput = {
  source: {
    id: "source.raw_idea",
    rawText: "Penny should turn strategy notes into a defensible launch decision.",
  },
  session: {
    id: uuidAt(100),
    sourceId: "source.raw_idea",
    status: "open",
  },
  seedClaim: {
    id: "claim.seed",
    kind: "belief",
    text: "Penny should turn strategy notes into a defensible launch decision.",
    confidence: 70,
  },
  assumptions: [
    {
      id: "claim.assumption.1",
      kind: "assumption",
      text: "The notes contain enough specific claims to expose decision risk.",
      confidence: 62,
      pressure: "high",
      whyItMatters: "If the notes are too vague, Penny cannot make the launch decision more defensible.",
    },
    {
      id: "claim.assumption.2",
      kind: "assumption",
      text: "A defensible launch decision depends more on tradeoffs than on summarizing the notes.",
      confidence: 58,
      pressure: "high",
      whyItMatters: "If summary is the real need, a graph of pressure points may add avoidable work.",
    },
    {
      id: "claim.assumption.3",
      kind: "assumption",
      text: "The user will accept an explicit challenge before Penny has external verification.",
      confidence: 52,
      pressure: "medium",
      whyItMatters: "If early challenge feels premature, the first loop may lose trust before revision starts.",
    },
  ],
  thoughtMap: {
    claims: [
      {
        id: "claim.seed",
        kind: "belief",
        text: "Penny should turn strategy notes into a defensible launch decision.",
        confidence: 70,
      },
      {
        id: "claim.assumption.1",
        kind: "assumption",
        text: "The notes contain enough specific claims to expose decision risk.",
        confidence: 62,
      },
      {
        id: "claim.assumption.2",
        kind: "assumption",
        text: "A defensible launch decision depends more on tradeoffs than on summarizing the notes.",
        confidence: 58,
      },
      {
        id: "claim.assumption.3",
        kind: "assumption",
        text: "The user will accept an explicit challenge before Penny has external verification.",
        confidence: 52,
      },
      {
        id: "claim.question.tradeoffs",
        kind: "question",
        text: "Which launch tradeoff would reverse the decision if it moved the wrong way?",
        confidence: 65,
      },
      {
        id: "claim.concept.defensibility",
        kind: "concept",
        text: "Defensibility means the decision can name its assumptions, risks, and revision triggers.",
        confidence: 73,
      },
    ],
    edges: [
      {
        id: "edge.seed.assumption.1",
        fromClaimId: "claim.seed",
        toClaimId: "claim.assumption.1",
        kind: "depends_on",
        label: "depends on notes containing inspectable decision claims",
      },
      {
        id: "edge.assumption.2.seed",
        fromClaimId: "claim.assumption.2",
        toClaimId: "claim.seed",
        kind: "supports",
        label: "supports the launch-decision framing over summary",
      },
      {
        id: "edge.question.assumption.2",
        fromClaimId: "claim.question.tradeoffs",
        toClaimId: "claim.assumption.2",
        kind: "questions",
        label: "asks which tradeoff matters most",
      },
      {
        id: "edge.question.assumption.3",
        fromClaimId: "claim.question.tradeoffs",
        toClaimId: "claim.assumption.3",
        kind: "challenges",
        label: "challenges whether early pressure will be trusted",
      },
      {
        id: "edge.concept.question",
        fromClaimId: "claim.concept.defensibility",
        toClaimId: "claim.question.tradeoffs",
        kind: "clarifies",
        label: "clarifies what a defensible decision has to name",
      },
    ],
  },
  explorationPaths: [
    {
      id: "path.tradeoff",
      title: "Name the reversal tradeoff",
      prompt: "Which tradeoff would change the launch decision if the assumption failed?",
      expectedValue: "Focuses the map on a decision trigger instead of general notes.",
    },
    {
      id: "path-risk",
      title: "Rank the decision risk",
      prompt: "Which risk is most likely to make the current launch direction wrong?",
      expectedValue: "Separates critical pressure from background uncertainty.",
    },
    {
      id: "path-evidence",
      title: "Find the missing evidence",
      prompt: "What evidence would make the launch choice materially more defensible?",
      expectedValue: "Identifies what Verify should inspect after the first loop.",
    },
    {
      id: "path-stakeholder",
      title: "Locate stakeholder pressure",
      prompt: "Whose objection would force the launch decision to be revised?",
      expectedValue: "Keeps the challenge grounded in a real decision audience.",
    },
    {
      id: "path-timing",
      title: "Test launch timing",
      prompt: "What has to be true for launching now to beat waiting for more signal?",
      expectedValue: "Surfaces the time-sensitive assumption behind the decision.",
    },
    {
      id: "path-brief",
      title: "Shape the decision brief",
      prompt: "What would a brief need to show so the user can defend or revise the launch call?",
      expectedValue: "Connects graph structure to the final Challenge Brief.",
    },
  ],
  keyInsight: "The seed becomes useful when the map preserves the decision's reversal points, not just the claim summary.",
  firstChallenge: {
    targetClaimId: "claim.question.tradeoffs",
    failureType: "dependency_risk",
    weakestPart: "The launch decision has not named the tradeoff that would reverse it.",
    challenge: "Defend the launch call by naming the tradeoff that would make you reverse it, then explain why that tradeoff is not already failing.",
    responseOptions: ["Defend", "Revise", "Absorb"],
  },
  learnCandidates: [
    {
      id: "learn.defensibility",
      claimId: "claim.concept.defensibility",
      term: "defensibility",
      whyItMatters: "The seed depends on the user knowing what would make a launch decision defensible.",
      unblockExplanation:
        "Defensibility means the decision can show its assumptions, risks, and revision triggers clearly enough for someone else to challenge it.",
    },
  ],
};

type InsertRow = Record<string, unknown>;
type TableKey = "claims" | "claim_versions" | "source_spans" | "claim_edges" | "moves" | "brain_runs";

function createRecordingSeedDb(prelude: BrainSeedPrelude) {
  const now = new Date("2026-04-27T00:00:00.000Z");
  const counters: Record<TableKey, number> = {
    claims: 0,
    claim_versions: 0,
    source_spans: 0,
    claim_edges: 0,
    moves: 0,
    brain_runs: 0,
  };
  const inserted: Partial<Record<TableKey, InsertRow[]>> = {};
  const db = {
    async transaction<T>(callback: (tx: ReturnType<typeof createRecordingTx>) => Promise<T>): Promise<T> {
      return callback(createRecordingTx());
    },
  };

  function createRecordingTx() {
    return {
      insert(table: unknown) {
        const key = tableKey(table);

        return {
          values(values: InsertRow | InsertRow[]) {
            const rows = Array.isArray(values) ? values : [values];
            const persistedRows = rows.map((row) => persistedInsertRow(key, row));
            inserted[key] = [...(inserted[key] ?? []), ...persistedRows];

            return {
              async returning() {
                return persistedRows;
              },
            };
          },
        };
      },
      update(table: unknown) {
        const key = tableKey(table);

        return {
          set(values: InsertRow) {
            return {
              where(_condition: unknown) {
                return {
                  async returning() {
                    if (key !== "brain_runs") {
                      throw new Error(`Unexpected update table ${key}.`);
                    }

                    return [
                      {
                        ...prelude.brainRun,
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
    };
  }

  function persistedInsertRow(key: TableKey, row: InsertRow): InsertRow {
    const persisted = {
      ...row,
      id: uuidAt(tableOffset(key) + counters[key]),
      createdAt: now,
    };
    counters[key] += 1;

    if (key === "claim_versions") {
      return {
        ...persisted,
        moveId: null,
      };
    }

    if (key === "claim_edges") {
      return {
        ...persisted,
        status: "active",
      };
    }

    return persisted;
  }

  return { db, inserted };
}

function tableKey(table: unknown): TableKey {
  if (table === claims) {
    return "claims";
  }

  if (table === claimVersions) {
    return "claim_versions";
  }

  if (table === sourceSpans) {
    return "source_spans";
  }

  if (table === claimEdges) {
    return "claim_edges";
  }

  if (table === moves) {
    return "moves";
  }

  if (table === brainRuns) {
    return "brain_runs";
  }

  throw new Error("Unexpected table.");
}

function tableOffset(key: TableKey): number {
  switch (key) {
    case "claims":
      return 200;
    case "claim_versions":
      return 300;
    case "source_spans":
      return 400;
    case "claim_edges":
      return 500;
    case "moves":
      return 600;
    case "brain_runs":
      return 700;
  }
}

function createPersistedPrelude(input: BrainSeedInput, run: BrainSeedRunInput): BrainSeedPrelude {
  const now = new Date("2026-04-27T00:00:00.000Z");
  const sessionId = input.sessionId ?? uuidAt(100);
  const sourceId = uuidAt(101);
  const brainRunId = uuidAt(701);

  return {
    session: {
      id: sessionId,
      status: "open",
      title: input.rawIdea,
      createdAt: now,
      endedAt: null,
    },
    source: {
      id: sourceId,
      sessionId,
      kind: "raw_idea",
      rawText: input.rawIdea,
      createdAt: now,
    },
    submittedSourceSpan: {
      id: uuidAt(151),
      sourceId,
      claimId: null,
      claimVersionId: null,
      startOffset: 0,
      endOffset: input.rawIdea.length,
      label: "submitted_text",
      createdAt: now,
    },
    brainRun: {
      id: brainRunId,
      sessionId,
      sourceId,
      operation: run.operation,
      provider: run.provider,
      model: run.model ?? null,
      status: "running",
      input: run.input,
      output: null,
      error: null,
      createdAt: run.startedAt ?? now,
      completedAt: null,
    },
  };
}

function payloadStringArray(payload: unknown, key: string): string[] {
  assert.ok(payload && typeof payload === "object" && !Array.isArray(payload));
  const value = (payload as Record<string, unknown>)[key];

  assert.ok(Array.isArray(value), `Expected payload.${key} to be an array.`);
  return value.map((item) => {
    assert.equal(typeof item, "string");
    return item;
  });
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
