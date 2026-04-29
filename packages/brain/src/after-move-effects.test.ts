import assert from "node:assert/strict";
import test from "node:test";
import { deriveAfterMoveEffects, type AfterMoveEffectsState } from "./after-move-effects.ts";

const sessionId = "00000000-0000-4000-8000-000000000001";
const seedClaimId = "00000000-0000-4000-8000-000000000101";
const assumptionClaimId = "00000000-0000-4000-8000-000000000102";
const challengeClaimId = "00000000-0000-4000-8000-000000000103";
const seedVersionId = "00000000-0000-4000-8000-000000000201";
const assumptionVersionId = "00000000-0000-4000-8000-000000000202";
const challengeVersionId = "00000000-0000-4000-8000-000000000203";
const dependencyEdgeId = "00000000-0000-4000-8000-000000000301";
const challengeEdgeId = "00000000-0000-4000-8000-000000000302";
const sourceMoveId = "00000000-0000-4000-8000-000000000401";
const artifactId = "00000000-0000-4000-8000-000000000501";

test("deriveAfterMoveEffects creates reviewable effects after a material claim revision", () => {
  const state = baseState({
    sourceMove: move({
      id: sourceMoveId,
      kind: "claim_revised",
      createdAt: new Date("2026-04-29T10:00:00.000Z"),
      payload: {
        response: "revise",
        reasoning: "The original assumption was too broad.",
        targetClaimId: assumptionClaimId,
        previousClaimVersionId: "00000000-0000-4000-8000-000000000299",
        currentClaimVersionId: assumptionVersionId,
        critiqueClaimId: challengeClaimId,
        challengeEdgeId,
        claimVersionIds: ["00000000-0000-4000-8000-000000000299", assumptionVersionId],
        claimIds: [assumptionClaimId, challengeClaimId],
        edgeIds: [challengeEdgeId],
      },
    }),
    artifacts: [
      {
        id: artifactId,
        sessionId,
        kind: "idea_map_challenge_brief",
        title: "Idea Map + Challenge Brief",
        summary: "Earlier compiled artifact.",
        payload: {},
        createdAt: new Date("2026-04-29T09:00:00.000Z"),
      },
    ],
  });

  const effects = deriveAfterMoveEffects(state);
  const kinds = effects.map((effect) => effect.kind);

  assert.deepEqual(kinds, [
    "shape_candidate",
    "confidence_cascade",
    "unresolved_risk",
    "stale_artifact",
    "next_move_recommendation",
  ]);
  assert.equal(effects[0]?.title, "Revision after pressure");
  assert.deepEqual(effects[1]?.payload.dependentClaimIds, [seedClaimId]);
  assert.deepEqual(effects[3]?.payload.artifactIds, [artifactId]);
});

test("deriveAfterMoveEffects recommends responding to open challenges before weaker assumptions", () => {
  const state = baseState({
    edges: [
      edge({
        id: dependencyEdgeId,
        fromClaimId: seedClaimId,
        toClaimId: assumptionClaimId,
        kind: "depends_on",
      }),
      edge({
        id: challengeEdgeId,
        fromClaimId: challengeClaimId,
        toClaimId: seedClaimId,
        kind: "challenges",
        label: "shaky_assumption",
      }),
    ],
  });

  const effects = deriveAfterMoveEffects(state);
  const risk = effects.find((effect) => effect.kind === "unresolved_risk");
  const nextMove = effects.find((effect) => effect.kind === "next_move_recommendation");

  assert.equal(risk?.payload.riskKind, "open_challenge");
  assert.equal(risk?.payload.challengeEdgeId, challengeEdgeId);
  assert.equal(nextMove?.payload.recommendedAction, "respond_to_challenge");
  assert.equal(nextMove?.payload.challengeEdgeId, challengeEdgeId);
});

function baseState(overrides: Partial<AfterMoveEffectsState> = {}): AfterMoveEffectsState {
  const sourceMove =
    overrides.sourceMove ??
    move({
      id: sourceMoveId,
      kind: "assumption_refined",
      payload: {
        action: "refine",
        claimId: assumptionClaimId,
        previousVersionId: "00000000-0000-4000-8000-000000000298",
        currentVersionId: assumptionVersionId,
        previousStatus: "exploratory",
        currentStatus: "exploratory",
        refined: true,
        claimIds: [assumptionClaimId],
        claimVersionIds: ["00000000-0000-4000-8000-000000000298", assumptionVersionId],
        edgeIds: [],
      },
    });

  return {
    sourceMove,
    moves: [sourceMove],
    claims: [
      claim({ id: seedClaimId, kind: "belief" }),
      claim({ id: assumptionClaimId, kind: "assumption" }),
      claim({ id: challengeClaimId, kind: "belief" }),
    ],
    claimVersions: [
      version({
        id: seedVersionId,
        claimId: seedClaimId,
        content: "Penny can become a compounding thinking instrument.",
        confidence: 70,
      }),
      version({
        id: assumptionVersionId,
        claimId: assumptionClaimId,
        content: "Penny notices where the user's reasoning changes under pressure.",
        confidence: 45,
      }),
      version({
        id: challengeVersionId,
        claimId: challengeClaimId,
        content: "This only compounds if derived effects influence later critique.",
        confidence: 65,
      }),
    ],
    edges: [
      edge({
        id: dependencyEdgeId,
        fromClaimId: seedClaimId,
        toClaimId: assumptionClaimId,
        kind: "depends_on",
      }),
    ],
    artifacts: [],
    existingEffects: [],
    ...overrides,
  };
}

function claim(input: { id: string; kind: "belief" | "assumption" | "question" | "concept" }) {
  return {
    id: input.id,
    sessionId,
    sourceId: null,
    kind: input.kind,
    createdAt: new Date("2026-04-29T08:00:00.000Z"),
  };
}

function version(input: {
  id: string;
  claimId: string;
  content: string;
  confidence: number;
  status?: "exploratory" | "committed" | "resolved" | "rejected";
}) {
  return {
    id: input.id,
    claimId: input.claimId,
    sourceId: null,
    brainRunId: null,
    moveId: null,
    content: input.content,
    status: input.status ?? "exploratory",
    confidence: input.confidence,
    isCurrent: true,
    validFrom: new Date("2026-04-29T08:05:00.000Z"),
    validUntil: null,
    supersededByVersionId: null,
    createdAt: new Date("2026-04-29T08:05:00.000Z"),
  };
}

function edge(input: {
  id: string;
  fromClaimId: string;
  toClaimId: string;
  kind: "depends_on" | "challenges";
  label?: string | null;
}) {
  return {
    id: input.id,
    sessionId,
    fromClaimId: input.fromClaimId,
    toClaimId: input.toClaimId,
    kind: input.kind,
    status: "active" as const,
    label: input.label ?? null,
    createdAt: new Date("2026-04-29T08:10:00.000Z"),
  };
}

function move(input: {
  id: string;
  kind: AfterMoveEffectsState["sourceMove"]["kind"];
  payload: Record<string, unknown>;
  createdAt?: Date;
}) {
  return {
    id: input.id,
    sessionId,
    kind: input.kind,
    summary: "Recorded a test move.",
    payload: input.payload,
    createdAt: input.createdAt ?? new Date("2026-04-29T08:15:00.000Z"),
  };
}
