import { z } from "zod";
import { type PennyDatabase } from "./db/client.ts";
import {
  artifactKindEnum,
  claimEdgeStatusEnum,
  claimStatusEnum,
  moveKindEnum,
  moves,
} from "./db/schema.ts";
import { scopeValues, type BrainScopeInput } from "./scope.ts";

const UuidSchema = z.string().uuid();
const UuidArraySchema = z.array(UuidSchema);
const SeedMoveIdSchema = z.string().trim().min(1).max(120);
const MoveSummarySchema = z.string().trim().min(1).max(500);
const ClaimStatusSchema = z.enum(claimStatusEnum.enumValues);
const ChallengeEdgeStatusSchema = z.enum(claimEdgeStatusEnum.enumValues);
const ArtifactKindSchema = z.enum(artifactKindEnum.enumValues);
const ConfidenceDeltaSchema = z.number().int().min(-100).max(100);
const ConfidencePercentSchema = z.number().int().min(0).max(100);
const DecisionReasonSchema = z.string().trim().min(1).max(2_000);
const FailureTypeSchema = z.enum([
  "weak_evidence",
  "missing_counterargument",
  "shaky_assumption",
  "analogy_break",
  "dependency_risk",
  "unaddressed_precedent",
  "premise_rejection",
  "definition_failure",
]);
const ChallengeStrengthSchema = z.enum(["weak", "moderate", "strong"]);
const EditPolicySchema = z.literal("compiled_view_only");
const AutopilotActionSchema = z.enum([
  "respond_to_challenge",
  "review_assumption",
  "challenge_claim",
  "verify_confidence",
  "create_challenge_brief",
  "revisit_absorbed_risk",
  "explore_claim",
]);
const AutopilotModeSchema = z.enum(["brain", "challenge", "verify", "artifact"]);
const AutopilotReasonCodeSchema = z.string().trim().min(1).max(120);
const AutopilotScoreSchema = z.number().int().min(0).max(2_000);
const ThinkingModeSchema = z.enum(["brain", "challenge", "verify", "learn", "artifact"]);
const NextMoveEngineActionSchema = z.enum(["resume_open_challenge", "learn", "clarify", "verify", "challenge"]);
const NextMoveFingerprintSchema = z.string().trim().min(1).max(160);
const GraphHashSchema = z.string().trim().min(1).max(160);

const SeedPersistencePayloadSchema = z
  .object({
    seedMoveId: SeedMoveIdSchema,
    brainRunId: UuidSchema,
    sourceIds: UuidArraySchema,
    sourceSpanIds: UuidArraySchema,
    seedClaimIds: z.array(SeedMoveIdSchema),
    seedEdgeIds: z.array(SeedMoveIdSchema),
    claimIds: UuidArraySchema,
    claimVersionIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
  })
  .strict();

const AssumptionResponsePayloadSchema = z
  .object({
    action: z.enum(["confirm", "reject", "refine"]),
    claimId: UuidSchema,
    previousVersionId: UuidSchema,
    currentVersionId: UuidSchema,
    previousStatus: ClaimStatusSchema,
    currentStatus: ClaimStatusSchema,
    refined: z.boolean(),
    claimIds: UuidArraySchema,
    claimVersionIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
  })
  .strict();

const ChallengeIssuedPayloadSchema = z
  .object({
    targetClaimId: UuidSchema,
    targetClaimVersionId: UuidSchema,
    critiqueClaimId: UuidSchema,
    critiqueClaimVersionId: UuidSchema,
    challengeEdgeId: UuidSchema,
    brainRunId: UuidSchema,
    failureType: FailureTypeSchema,
    strength: ChallengeStrengthSchema,
    provenanceTag: z.string().trim().min(1).max(120),
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
  })
  .strict();

const UserDefendedPayloadSchema = z
  .object({
    response: z.literal("defend"),
    reasoning: z.string().trim().min(1).max(2_000),
    targetClaimId: UuidSchema,
    targetClaimVersionId: UuidSchema,
    critiqueClaimId: UuidSchema,
    challengeEdgeId: UuidSchema,
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
  })
  .strict();

const ClaimRevisedPayloadSchema = z
  .object({
    response: z.literal("revise"),
    reasoning: z.string().trim().min(1).max(2_000).nullable(),
    targetClaimId: UuidSchema,
    previousClaimVersionId: UuidSchema,
    currentClaimVersionId: UuidSchema,
    critiqueClaimId: UuidSchema,
    challengeEdgeId: UuidSchema,
    claimVersionIds: UuidArraySchema,
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
  })
  .strict();

const CritiqueAbsorbedPayloadSchema = z
  .object({
    response: z.literal("absorb"),
    reasoning: z.string().trim().min(1).max(2_000).nullable(),
    targetClaimId: UuidSchema,
    targetClaimVersionId: UuidSchema,
    critiqueClaimId: UuidSchema,
    challengeEdgeId: UuidSchema,
    edgeStatus: ChallengeEdgeStatusSchema,
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
  })
  .strict();

const LearningTriggeredPayloadSchema = z
  .object({
    term: z.string().trim().min(1).max(120),
    currentClaimId: UuidSchema,
    currentClaimVersionId: UuidSchema,
    conceptClaimId: UuidSchema.optional(),
    conceptClaimVersionId: UuidSchema.optional(),
    teachesEdgeId: UuidSchema.optional(),
    brainRunId: UuidSchema.optional(),
    saved: z.boolean().optional(),
    claimIds: UuidArraySchema,
    claimVersionIds: UuidArraySchema.optional(),
    edgeIds: UuidArraySchema,
  })
  .strict();

const NextMoveCandidateSummarySchema = z
  .object({
    candidateId: z.string().trim().min(1).max(160),
    fingerprint: NextMoveFingerprintSchema,
    action: NextMoveEngineActionSchema,
    mode: ThinkingModeSchema,
    targetClaimId: UuidSchema,
    targetEdgeId: UuidSchema.nullable(),
    score: z.number().int().min(0).max(5_000),
    rank: z.number().int().min(1).max(100),
    reason: z.string().trim().min(1).max(1_200),
    reasonCodes: z.array(AutopilotReasonCodeSchema).min(1).max(16),
    graphHash: GraphHashSchema,
  })
  .strict();

const NextMoveRecomputedPayloadSchema = z
  .object({
    graphHash: GraphHashSchema,
    candidateCount: z.number().int().min(0).max(100),
    selectedCandidateId: z.string().trim().min(1).max(160).nullable(),
    selectedFingerprint: NextMoveFingerprintSchema.nullable(),
    candidateIds: z.array(z.string().trim().min(1).max(160)).max(100),
    candidateFingerprints: z.array(NextMoveFingerprintSchema).max(100),
    candidates: z.array(NextMoveCandidateSummarySchema).max(12),
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
    artifactIds: UuidArraySchema,
  })
  .strict();

const AutopilotCandidateScoreSchema = z
  .object({
    action: AutopilotActionSchema,
    mode: AutopilotModeSchema,
    targetClaimId: UuidSchema.nullable(),
    targetEdgeId: UuidSchema.nullable(),
    score: AutopilotScoreSchema,
    reasonCodes: z.array(AutopilotReasonCodeSchema).min(1).max(12),
  })
  .strict();

const AutopilotSuggestedPayloadSchema = z
  .object({
    suggestionId: UuidSchema,
    action: AutopilotActionSchema,
    mode: AutopilotModeSchema,
    label: z.string().trim().min(1).max(120),
    targetClaimId: UuidSchema.nullable(),
    targetEdgeId: UuidSchema.nullable(),
    score: AutopilotScoreSchema,
    why: z.string().trim().min(1).max(900),
    reasonCodes: z.array(AutopilotReasonCodeSchema).min(1).max(12),
    candidateScores: z.array(AutopilotCandidateScoreSchema).min(1).max(12),
    goThere: z
      .object({
        label: z.literal("Go there"),
        targetClaimId: UuidSchema.nullable(),
        targetEdgeId: UuidSchema.nullable(),
        mode: AutopilotModeSchema,
      })
      .strict(),
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
    artifactIds: UuidArraySchema,
  })
  .strict();

const AutopilotFocusStartedPayloadSchema = z
  .object({
    candidateId: z.string().trim().min(1).max(160),
    candidateFingerprint: NextMoveFingerprintSchema,
    action: NextMoveEngineActionSchema,
    mode: ThinkingModeSchema,
    targetClaimId: UuidSchema,
    targetEdgeId: UuidSchema.nullable(),
    graphHash: GraphHashSchema,
    reason: z.string().trim().min(1).max(1_200),
    score: z.number().int().min(0).max(5_000),
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
    artifactIds: UuidArraySchema,
  })
  .strict();

const ManualNodeSelectedPayloadSchema = z
  .object({
    claimId: UuidSchema,
    previousSuggestionMoveId: UuidSchema.nullable(),
    reason: z.string().trim().min(1).max(1_000).nullable(),
    pauseAutopilot: z.literal(true),
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
    artifactIds: UuidArraySchema,
  })
  .strict();

const FocusCompletedPayloadSchema = z
  .object({
    focusSource: z.literal("challenge_response"),
    completedByMoveId: UuidSchema,
    completedByMoveKind: z.enum(["user_defended", "claim_revised", "critique_absorbed"]),
    challengeRoundId: UuidSchema,
    targetClaimId: UuidSchema,
    targetEdgeId: UuidSchema,
    outcome: z.enum(["defend", "revise", "absorb"]),
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
    artifactIds: UuidArraySchema,
  })
  .strict();

const VerifyRunPayloadSchema = z
  .object({
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
    claimId: UuidSchema,
    claimVersionId: UuidSchema,
    brainRunId: UuidSchema,
    verdict: z.enum(["supported", "weakened", "mixed", "not_enough_evidence"]),
    confidenceDeltaSuggestion: ConfidenceDeltaSchema,
    confidenceDecision: z.literal("pending_user_decision"),
    autoAppliedConfidence: z.boolean(),
    sourceIds: UuidArraySchema,
    sourceSpanIds: UuidArraySchema,
  })
  .strict();

const ConfidenceCascadeAppliedSchema = z
  .object({
    claimId: UuidSchema,
    viaEdgeId: UuidSchema,
    depth: z.number().int().min(1).max(100),
    previousVersionId: UuidSchema,
    currentVersionId: UuidSchema,
    previousConfidence: ConfidencePercentSchema,
    currentConfidence: ConfidencePercentSchema,
    appliedDelta: ConfidenceDeltaSchema,
  })
  .strict();

const ConfidenceUpdateAcceptedPayloadSchema = z
  .object({
    decision: z.literal("accept"),
    verifyMoveId: UuidSchema,
    claimId: UuidSchema,
    previousVersionId: UuidSchema,
    currentVersionId: UuidSchema,
    brainRunId: UuidSchema,
    confidenceDeltaSuggestion: ConfidenceDeltaSchema,
    previousConfidence: ConfidencePercentSchema,
    currentConfidence: ConfidencePercentSchema,
    appliedDelta: ConfidenceDeltaSchema,
    cascade: z.array(ConfidenceCascadeAppliedSchema),
    reason: DecisionReasonSchema.optional(),
    claimIds: UuidArraySchema,
    claimVersionIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
  })
  .strict();

const ConfidenceUpdateRejectedPayloadSchema = z
  .object({
    decision: z.literal("reject"),
    verifyMoveId: UuidSchema,
    claimId: UuidSchema,
    claimVersionId: UuidSchema,
    brainRunId: UuidSchema,
    confidenceDeltaSuggestion: ConfidenceDeltaSchema,
    reason: DecisionReasonSchema.optional(),
    claimIds: UuidArraySchema,
    claimVersionIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
  })
  .strict();

const ArtifactCreatedPayloadSchema = z
  .object({
    artifactId: UuidSchema,
    artifactKind: ArtifactKindSchema,
    brainRunId: UuidSchema,
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
    claimVersionIds: UuidArraySchema,
    artifactIds: UuidArraySchema,
  })
  .strict();

const WikiPageCompiledPayloadSchema = z
  .object({
    wikiPageId: UuidSchema,
    claimIds: UuidArraySchema,
    claimVersionIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
    sourceMoveIds: UuidArraySchema,
    artifactIds: UuidArraySchema,
    sourceSpanIds: UuidArraySchema,
    editPolicy: EditPolicySchema,
  })
  .strict();

const LegacyClaimCreatedPayloadSchema = z
  .object({
    claimId: UuidSchema,
    claimVersionId: UuidSchema.optional(),
    sourceId: UuidSchema.optional(),
    brainRunId: UuidSchema.optional(),
    claimIds: UuidArraySchema,
    claimVersionIds: UuidArraySchema.optional(),
    edgeIds: UuidArraySchema,
  })
  .strict();

const LegacyEdgeCreatedPayloadSchema = z
  .object({
    edgeId: UuidSchema,
    fromClaimId: UuidSchema.optional(),
    toClaimId: UuidSchema.optional(),
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
  })
  .strict();

const LegacyAssumptionExtractedPayloadSchema = z
  .object({
    brainRunId: UuidSchema.optional(),
    claimIds: UuidArraySchema,
    claimVersionIds: UuidArraySchema.optional(),
    edgeIds: UuidArraySchema,
    sourceIds: UuidArraySchema.optional(),
    sourceSpanIds: UuidArraySchema.optional(),
  })
  .strict();

const LegacyExplorationSuggestedPayloadSchema = z
  .object({
    brainRunId: UuidSchema.optional(),
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
    explorationPathIds: z.array(SeedMoveIdSchema).optional(),
  })
  .strict();

const LegacyChallengeCreatedPayloadSchema = z
  .object({
    targetClaimId: UuidSchema,
    targetClaimVersionId: UuidSchema.optional(),
    critiqueClaimId: UuidSchema.optional(),
    critiqueClaimVersionId: UuidSchema.optional(),
    challengeEdgeId: UuidSchema.optional(),
    brainRunId: UuidSchema.optional(),
    failureType: FailureTypeSchema.optional(),
    strength: ChallengeStrengthSchema.optional(),
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
  })
  .strict();

const LegacyArtifactCreatedPayloadSchema = z
  .object({
    artifactId: UuidSchema,
    artifactKind: ArtifactKindSchema.optional(),
    brainRunId: UuidSchema.optional(),
    claimIds: UuidArraySchema,
    edgeIds: UuidArraySchema,
    claimVersionIds: UuidArraySchema.optional(),
    artifactIds: UuidArraySchema,
  })
  .strict();

const LegacyChallengeResponseDefendedPayloadSchema = UserDefendedPayloadSchema;
const LegacyChallengeResponseRevisedPayloadSchema = ClaimRevisedPayloadSchema;
const LegacyChallengeResponseAbsorbedPayloadSchema = CritiqueAbsorbedPayloadSchema;

export const MoveKindSchema = z.enum(moveKindEnum.enumValues);

export const MovePayloadSchemas = {
  "source.recorded": SeedPersistencePayloadSchema,
  seed_claim_created: SeedPersistencePayloadSchema,
  assumptions_extracted: SeedPersistencePayloadSchema,
  first_challenge_suggested: SeedPersistencePayloadSchema,
  assumption_confirmed: AssumptionResponsePayloadSchema,
  assumption_rejected: AssumptionResponsePayloadSchema,
  assumption_refined: AssumptionResponsePayloadSchema,
  challenge_issued: ChallengeIssuedPayloadSchema,
  user_defended: UserDefendedPayloadSchema,
  claim_revised: ClaimRevisedPayloadSchema,
  critique_absorbed: CritiqueAbsorbedPayloadSchema,
  learning_triggered: LearningTriggeredPayloadSchema,
  next_move_recomputed: NextMoveRecomputedPayloadSchema,
  autopilot_suggested: AutopilotSuggestedPayloadSchema,
  autopilot_focus_started: AutopilotFocusStartedPayloadSchema,
  manual_node_selected: ManualNodeSelectedPayloadSchema,
  focus_completed: FocusCompletedPayloadSchema,
  verify_run: VerifyRunPayloadSchema,
  confidence_update_accepted: ConfidenceUpdateAcceptedPayloadSchema,
  confidence_update_rejected: ConfidenceUpdateRejectedPayloadSchema,
  artifact_created: ArtifactCreatedPayloadSchema,
  wiki_page_compiled: WikiPageCompiledPayloadSchema,
  "claim.created": LegacyClaimCreatedPayloadSchema,
  "edge.created": LegacyEdgeCreatedPayloadSchema,
  "assumption.extracted": LegacyAssumptionExtractedPayloadSchema,
  "exploration.suggested": LegacyExplorationSuggestedPayloadSchema,
  "challenge.created": LegacyChallengeCreatedPayloadSchema,
  "artifact.created": LegacyArtifactCreatedPayloadSchema,
  "challenge.response.defended": LegacyChallengeResponseDefendedPayloadSchema,
  "challenge.response.revised": LegacyChallengeResponseRevisedPayloadSchema,
  "challenge.response.absorbed": LegacyChallengeResponseAbsorbedPayloadSchema,
} satisfies Record<MoveKind, z.ZodType>;

export type MoveKind = (typeof moveKindEnum.enumValues)[number];
export type MovePayload<K extends MoveKind = MoveKind> = z.infer<(typeof MovePayloadSchemas)[K]>;
export type CreatedMove<K extends MoveKind = MoveKind> = Omit<typeof moves.$inferSelect, "kind" | "payload"> & {
  kind: K;
  payload: MovePayload<K>;
};
export type CreateMoveInput<K extends MoveKind> = {
  id?: string;
  sessionId: string;
  scope?: BrainScopeInput;
  summary: string;
  payload: MovePayload<K>;
};

type MoveTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];

export class MovePayloadValidationError extends Error {
  constructor(kind: MoveKind, cause: z.ZodError) {
    super(`Invalid ${kind} move payload: ${z.prettifyError(cause)}`);
    this.name = "MovePayloadValidationError";
    this.cause = cause;
  }
}

export class MoveCreateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoveCreateError";
  }
}

export function parseMovePayload<K extends MoveKind>(kind: K, payload: unknown): MovePayload<K> {
  const parsed = MovePayloadSchemas[kind].safeParse(payload);

  if (!parsed.success) {
    throw new MovePayloadValidationError(kind, parsed.error);
  }

  return parsed.data as MovePayload<K>;
}

export async function createMove<K extends MoveKind>(
  tx: MoveTransaction,
  kind: K,
  input: CreateMoveInput<K>,
): Promise<CreatedMove<K>> {
  const payload = parseMovePayload(kind, input.payload);
  const summary = MoveSummarySchema.parse(input.summary);
  const sessionId = UuidSchema.parse(input.sessionId);
  const id = input.id ? UuidSchema.parse(input.id) : undefined;
  const [move] = await tx
    .insert(moves)
    .values({
      id,
      sessionId,
      ...scopeValues(input.scope),
      kind,
      summary,
      payload,
    })
    .returning();

  if (!move) {
    throw new MoveCreateError(`Failed to create ${kind} move.`);
  }

  return {
    ...move,
    kind,
    payload,
  };
}
