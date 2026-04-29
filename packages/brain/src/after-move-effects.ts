import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { PennyDatabase } from "./db/client.ts";
import { artifacts, claimEdges, claims, claimVersions, derivedEffectKindEnum, derivedEffects, moves } from "./db/schema.ts";

type MoveRow = typeof moves.$inferSelect;
type ClaimRow = typeof claims.$inferSelect;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = typeof claimEdges.$inferSelect;
type ArtifactRow = typeof artifacts.$inferSelect;
type DerivedEffectKind = (typeof derivedEffectKindEnum.enumValues)[number];

export type AfterMoveEffectsInput = {
  sessionId: string;
  moveId: string;
};

export type AfterMoveEffectsState = {
  sourceMove: MoveRow;
  moves: MoveRow[];
  claims: ClaimRow[];
  claimVersions: ClaimVersionRow[];
  edges: EdgeRow[];
  artifacts: ArtifactRow[];
  existingEffects: Array<typeof derivedEffects.$inferSelect>;
};

export type DerivedEffectDraft = {
  kind: DerivedEffectKind;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
};

export type PersistedDerivedEffect = typeof derivedEffects.$inferSelect;

export type AfterMoveEffectsResult = {
  sourceMoveId: string;
  effects: PersistedDerivedEffect[];
};

const DerivedEffectDraftSchema = z
  .object({
    kind: z.enum(derivedEffectKindEnum.enumValues),
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(700),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export class AfterMoveEffectsNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AfterMoveEffectsNotFoundError";
  }
}

export class AfterMoveEffectsValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super("Derived after-move effects failed validation.");
    this.name = "AfterMoveEffectsValidationError";
    this.issues = issues;
  }
}

export async function afterMoveEffects(
  db: PennyDatabase,
  input: AfterMoveEffectsInput,
): Promise<AfterMoveEffectsResult> {
  return db.transaction(async (tx) => {
    const state = await loadAfterMoveEffectsState(tx, input);
    const drafts = deriveAfterMoveEffects(state);
    const versionByKind = nextVersionsByKind(state.existingEffects);
    const insertedEffects =
      drafts.length > 0
        ? await tx
            .insert(derivedEffects)
            .values(
              drafts.map((draft) => ({
                sessionId: input.sessionId,
                sourceMoveId: input.moveId,
                kind: draft.kind,
                version: versionByKind.get(draft.kind) ?? 1,
                title: draft.title,
                summary: draft.summary,
                payload: draft.payload,
              })),
            )
            .returning()
        : [];

    return {
      sourceMoveId: input.moveId,
      effects: insertedEffects,
    };
  });
}

export function deriveAfterMoveEffects(state: AfterMoveEffectsState): DerivedEffectDraft[] {
  const currentVersions = currentVersionsByClaimId(state.claimVersions);
  const claimSlices = state.claims.flatMap((claim) => {
    const version = currentVersions.get(claim.id);

    return version ? [claimSlice(claim, version)] : [];
  });
  const claimsById = new Map(claimSlices.map((claim) => [claim.id, claim]));
  const drafts = [
    shapeCandidateEffect(state.sourceMove),
    confidenceCascadeEffect(state.sourceMove, state.edges, claimsById, currentVersions),
    unresolvedRiskEffect(state.edges, state.moves, claimSlices, claimsById),
    staleArtifactEffect(state.sourceMove, state.artifacts),
    nextMoveRecommendationEffect(state.edges, state.moves, claimSlices, claimsById),
  ].filter((draft): draft is DerivedEffectDraft => Boolean(draft));

  return validateDrafts(drafts);
}

async function loadAfterMoveEffectsState(
  db: Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0],
  input: AfterMoveEffectsInput,
): Promise<AfterMoveEffectsState> {
  const [sourceMove] = await db
    .select()
    .from(moves)
    .where(and(eq(moves.id, input.moveId), eq(moves.sessionId, input.sessionId)))
    .limit(1);

  if (!sourceMove) {
    throw new AfterMoveEffectsNotFoundError("Source move was not found in this session.");
  }

  const claimRows = await db.select().from(claims).where(eq(claims.sessionId, input.sessionId)).orderBy(asc(claims.createdAt));
  const claimVersionRows =
    claimRows.length > 0
      ? await db
          .select()
          .from(claimVersions)
          .where(eq(claimVersions.isCurrent, true))
          .orderBy(asc(claimVersions.createdAt))
      : [];
  const edgeRows = await db
    .select()
    .from(claimEdges)
    .where(eq(claimEdges.sessionId, input.sessionId))
    .orderBy(asc(claimEdges.createdAt));
  const moveRows = await db.select().from(moves).where(eq(moves.sessionId, input.sessionId)).orderBy(asc(moves.createdAt));
  const artifactRows = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.sessionId, input.sessionId))
    .orderBy(asc(artifacts.createdAt));
  const existingEffectRows = await db
    .select()
    .from(derivedEffects)
    .where(and(eq(derivedEffects.sessionId, input.sessionId), eq(derivedEffects.sourceMoveId, input.moveId)))
    .orderBy(desc(derivedEffects.createdAt));

  return {
    sourceMove,
    moves: moveRows,
    claims: claimRows,
    claimVersions: claimVersionRows.filter((version) => claimRows.some((claim) => claim.id === version.claimId)),
    edges: edgeRows,
    artifacts: artifactRows,
    existingEffects: existingEffectRows,
  };
}

function shapeCandidateEffect(move: MoveRow): DerivedEffectDraft | null {
  const shape = shapeSignalForMove(move);

  if (!shape) {
    return null;
  }

  return {
    kind: "shape_candidate",
    title: shape.label,
    summary: shape.summary,
    payload: {
      label: shape.label,
      signal: shape.signal,
      evidenceMoveIds: [move.id],
      reviewQuestion: shape.reviewQuestion,
    },
  };
}

function confidenceCascadeEffect(
  move: MoveRow,
  edges: EdgeRow[],
  claimsById: Map<string, ReturnType<typeof claimSlice>>,
  currentVersions: Map<string, ClaimVersionRow>,
): DerivedEffectDraft | null {
  const changedClaimId = firstString(move.payload, ["claimId", "targetClaimId", "currentClaimId"]);

  if (!changedClaimId) {
    return null;
  }

  const currentVersion = currentVersions.get(changedClaimId);
  const dependentEdges = edges.filter((edge) => edge.kind === "depends_on" && edge.toClaimId === changedClaimId);

  if (!currentVersion || dependentEdges.length === 0 || !confidenceRelevantMove(move)) {
    return null;
  }

  const impactedClaims = dependentEdges
    .map((edge) => claimsById.get(edge.fromClaimId))
    .filter((claim): claim is ReturnType<typeof claimSlice> => Boolean(claim));
  const changedClaim = claimsById.get(changedClaimId);

  return {
    kind: "confidence_cascade",
    title: "Review dependent confidence",
    summary: `${impactedClaims.length} dependent claim${impactedClaims.length === 1 ? "" : "s"} should be reviewed after "${clipText(changedClaim?.text ?? changedClaimId, 120)}" changed.`,
    payload: {
      changedClaimId,
      changedClaimVersionId: currentVersion.id,
      changedClaimStatus: currentVersion.status,
      changedClaimConfidence: currentVersion.confidence,
      sourceMoveId: move.id,
      dependentClaimIds: impactedClaims.map((claim) => claim.id),
      dependencyEdgeIds: dependentEdges.map((edge) => edge.id),
    },
  };
}

function unresolvedRiskEffect(
  edges: EdgeRow[],
  moveRows: MoveRow[],
  claimSlices: Array<ReturnType<typeof claimSlice>>,
  claimsById: Map<string, ReturnType<typeof claimSlice>>,
): DerivedEffectDraft | null {
  const openChallenge = edges.find(
    (edge) => isChallengeEdge(edge) && edge.status === "active" && !challengeResponseMove(moveRows, edge.id),
  );

  if (openChallenge) {
    const targetClaim = claimsById.get(openChallenge.toClaimId);
    const critiqueClaim = claimsById.get(openChallenge.fromClaimId);

    return {
      kind: "unresolved_risk",
      title: "Open challenge needs a response",
      summary: `The challenge on "${clipText(targetClaim?.text ?? openChallenge.toClaimId, 120)}" is still waiting for Defend, Revise, or Absorb.`,
      payload: {
        riskKind: "open_challenge",
        targetClaimId: openChallenge.toClaimId,
        critiqueClaimId: openChallenge.fromClaimId,
        challengeEdgeId: openChallenge.id,
        failureType: openChallenge.label,
        critique: critiqueClaim?.text ?? null,
      },
    };
  }

  const acknowledged = edges.find((edge) => isChallengeEdge(edge) && edge.status === "acknowledged_vulnerability");

  if (acknowledged) {
    return {
      kind: "unresolved_risk",
      title: "Absorbed critique remains open",
      summary: `The acknowledged vulnerability on "${clipText(claimsById.get(acknowledged.toClaimId)?.text ?? acknowledged.toClaimId, 120)}" should be revisited before synthesis.`,
      payload: {
        riskKind: "acknowledged_vulnerability",
        targetClaimId: acknowledged.toClaimId,
        critiqueClaimId: acknowledged.fromClaimId,
        challengeEdgeId: acknowledged.id,
        failureType: acknowledged.label,
      },
    };
  }

  const exploratoryAssumption = claimSlices.find((claim) => claim.kind === "assumption" && claim.status === "exploratory");

  if (!exploratoryAssumption) {
    return null;
  }

  return {
    kind: "unresolved_risk",
    title: "Assumption still needs review",
    summary: `The assumption "${clipText(exploratoryAssumption.text, 120)}" has not been confirmed, rejected, or refined.`,
    payload: {
      riskKind: "unreviewed_assumption",
      claimId: exploratoryAssumption.id,
      claimVersionId: exploratoryAssumption.versionId,
      confidence: exploratoryAssumption.confidence,
    },
  };
}

function staleArtifactEffect(move: MoveRow, artifactRows: ArtifactRow[]): DerivedEffectDraft | null {
  if (!materialChangeKinds.has(move.kind) || artifactRows.length === 0) {
    return null;
  }

  const staleArtifacts = artifactRows.filter((artifact) => artifact.createdAt < move.createdAt);

  if (staleArtifacts.length === 0) {
    return null;
  }

  return {
    kind: "stale_artifact",
    title: "Compiled artifact may be stale",
    summary: `${staleArtifacts.length} existing artifact${staleArtifacts.length === 1 ? "" : "s"} were created before this move and may need regeneration.`,
    payload: {
      sourceMoveKind: move.kind,
      sourceMoveId: move.id,
      artifactIds: staleArtifacts.map((artifact) => artifact.id),
    },
  };
}

function nextMoveRecommendationEffect(
  edges: EdgeRow[],
  moveRows: MoveRow[],
  claimSlices: Array<ReturnType<typeof claimSlice>>,
  claimsById: Map<string, ReturnType<typeof claimSlice>>,
): DerivedEffectDraft | null {
  const openChallenge = edges.find(
    (edge) => isChallengeEdge(edge) && edge.status === "active" && !challengeResponseMove(moveRows, edge.id),
  );

  if (openChallenge) {
    const targetClaim = claimsById.get(openChallenge.toClaimId);

    return {
      kind: "next_move_recommendation",
      title: "Answer the open challenge",
      summary: `Defend, Revise, or Absorb "${clipText(targetClaim?.text ?? openChallenge.toClaimId, 120)}".`,
      payload: {
        recommendedAction: "respond_to_challenge",
        targetClaimId: openChallenge.toClaimId,
        challengeEdgeId: openChallenge.id,
      },
    };
  }

  const weakestAssumption = claimSlices
    .filter((claim) => claim.kind === "assumption" && claim.status === "exploratory")
    .sort((left, right) => left.confidence - right.confidence)[0];

  if (weakestAssumption) {
    return {
      kind: "next_move_recommendation",
      title: "Review the weakest assumption",
      summary: `Confirm, reject, or refine "${clipText(weakestAssumption.text, 120)}".`,
      payload: {
        recommendedAction: "review_assumption",
        targetClaimId: weakestAssumption.id,
        confidence: weakestAssumption.confidence,
      },
    };
  }

  const weakestClaim = [...claimSlices].sort((left, right) => left.confidence - right.confidence)[0];

  if (!weakestClaim) {
    return null;
  }

  return {
    kind: "next_move_recommendation",
    title: "Challenge the weakest claim",
    summary: `Issue the next challenge against "${clipText(weakestClaim.text, 120)}".`,
    payload: {
      recommendedAction: "challenge_weakest_claim",
      targetClaimId: weakestClaim.id,
      confidence: weakestClaim.confidence,
    },
  };
}

function validateDrafts(drafts: DerivedEffectDraft[]): DerivedEffectDraft[] {
  const validated: DerivedEffectDraft[] = [];

  for (const draft of drafts) {
    const parsed = DerivedEffectDraftSchema.safeParse(draft);

    if (!parsed.success) {
      throw new AfterMoveEffectsValidationError(parsed.error.issues.map((issue) => issue.message));
    }

    validated.push(parsed.data);
  }

  return validated;
}

function nextVersionsByKind(existingEffects: Array<typeof derivedEffects.$inferSelect>): Map<DerivedEffectKind, number> {
  const versions = new Map<DerivedEffectKind, number>();

  for (const kind of derivedEffectKindEnum.enumValues) {
    const maxVersion = existingEffects
      .filter((effect) => effect.kind === kind)
      .reduce((max, effect) => Math.max(max, effect.version), 0);

    versions.set(kind, maxVersion + 1);
  }

  return versions;
}

function shapeSignalForMove(move: MoveRow): { label: string; signal: string; summary: string; reviewQuestion: string } | null {
  switch (move.kind) {
    case "user_defended":
      return {
        label: "Defense under critique",
        signal: "user_defended_challenge",
        summary: "The user defended a claim instead of revising or absorbing the critique.",
        reviewQuestion: "Is this a justified defense or a recurring resistance to updating?",
      };
    case "claim_revised":
      return {
        label: "Revision after pressure",
        signal: "claim_revised_after_challenge",
        summary: "The user changed a claim in response to a challenge.",
        reviewQuestion: "Which critique patterns most often lead this user to revise?",
      };
    case "critique_absorbed":
      return {
        label: "Risk absorption",
        signal: "critique_absorbed_as_vulnerability",
        summary: "The user accepted a critique as an open vulnerability without revising yet.",
        reviewQuestion: "Does this user tend to carry risks forward instead of resolving them?",
      };
    case "assumption_rejected":
      return {
        label: "Assumption pruning",
        signal: "assumption_rejected",
        summary: "The user rejected a load-bearing assumption instead of preserving it.",
        reviewQuestion: "What kinds of assumptions does this user discard quickly?",
      };
    case "assumption_refined":
      return {
        label: "Assumption sharpening",
        signal: "assumption_refined",
        summary: "The user narrowed or clarified an assumption.",
        reviewQuestion: "Does this refinement expose a recurring need for tighter definitions?",
      };
    case "verify_run":
      return {
        label: "Evidence-seeking move",
        signal: "verify_run_requested",
        summary: "The user checked a claim against evidence before mutating confidence.",
        reviewQuestion: "Which claims does this user choose to verify rather than debate internally?",
      };
    case "learning_triggered":
      return {
        label: "Concept grounding",
        signal: "inline_learn_used",
        summary: "The user paused to clarify a concept inside the active graph.",
        reviewQuestion: "Which concepts repeatedly block progress?",
      };
    default:
      return null;
  }
}

function currentVersionsByClaimId(versionRows: ClaimVersionRow[]): Map<string, ClaimVersionRow> {
  const versionsByClaimId = new Map<string, ClaimVersionRow>();

  for (const version of [...versionRows].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())) {
    if (version.isCurrent && !versionsByClaimId.has(version.claimId)) {
      versionsByClaimId.set(version.claimId, version);
    }
  }

  return versionsByClaimId;
}

function claimSlice(claim: ClaimRow, version: ClaimVersionRow) {
  return {
    id: claim.id,
    sessionId: claim.sessionId,
    versionId: version.id,
    kind: claim.kind,
    status: version.status,
    text: version.content,
    confidence: version.confidence,
  };
}

function confidenceRelevantMove(move: MoveRow): boolean {
  return [
    "assumption_confirmed",
    "assumption_rejected",
    "assumption_refined",
    "claim_revised",
    "critique_absorbed",
    "verify_run",
  ].includes(move.kind);
}

const materialChangeKinds = new Set([
  "assumption_confirmed",
  "assumption_rejected",
  "assumption_refined",
  "claim_revised",
  "critique_absorbed",
  "learning_triggered",
  "verify_run",
  "confidence_update_accepted",
]);

function challengeResponseMove(moveRows: MoveRow[], edgeId: string): MoveRow | undefined {
  return moveRows.find((move) => {
    if (!["user_defended", "claim_revised", "critique_absorbed"].includes(move.kind)) {
      return false;
    }

    return stringArrayPayloadValue(move.payload, "edgeIds").includes(edgeId) || firstString(move.payload, ["challengeEdgeId"]) === edgeId;
  });
}

function isChallengeEdge(edge: EdgeRow): boolean {
  return edge.kind === "challenges" || edge.kind === "contradicts";
}

function firstString(payload: unknown, keys: string[]): string | null {
  const record = objectRecord(payload);

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function stringArrayPayloadValue(payload: unknown, key: string): string[] {
  const value = objectRecord(payload)[key];

  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function clipText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}
