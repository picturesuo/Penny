import { z } from "zod";
import {
  CLAIM_PROVENANCES,
  CLAIM_STATUSES,
  CLAIM_STAKES,
  EXPORT_FORMATS,
  EXPORT_TYPES,
  SOURCE_TRUST_LEVELS,
} from "@/types/thought-map";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateBody<T>(schema: z.ZodType<T>) {
  return async (body: unknown): Promise<T> => {
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", "));
    }
    return result.data;
  };
}

export const RouteIdSchema = z.string().cuid("Invalid identifier.");
export const UserIdSchema = RouteIdSchema;
export const MapIdSchema = RouteIdSchema;
export const ClaimIdSchema = RouteIdSchema;
export const NodeIdSchema = RouteIdSchema;
export const InterventionIdSchema = RouteIdSchema;
export const ArtifactIdSchema = RouteIdSchema;
export const SessionIdSchema = RouteIdSchema;
export const RoundIdSchema = RouteIdSchema;
export const LessonIdSchema = RouteIdSchema;
export const FragmentIdSchema = RouteIdSchema;

const CLAIM_STRUCTURE_KINDS = [
  "assertion",
  "conditional",
  "compound",
  "temporal",
  "merged_candidate",
  "split_candidate",
] as const;

export const MapParamsSchema = z.object({
  id: MapIdSchema,
});

export const MapClaimParamsSchema = z.object({
  id: MapIdSchema,
  claimId: ClaimIdSchema,
});

export const MapNodeParamsSchema = z.object({
  id: MapIdSchema,
  nodeId: NodeIdSchema,
});

export const MapInterventionParamsSchema = z.object({
  id: MapIdSchema,
  interventionId: InterventionIdSchema,
});

export const ArtifactParamsSchema = z.object({
  id: ArtifactIdSchema,
});

export const FragmentParamsSchema = z.object({
  id: FragmentIdSchema,
});

export const UserParamsSchema = z.object({
  id: UserIdSchema,
});

const ClaimCaptureMetadataSchema = z.object({
  insideViewEstimate: z.number().int().min(0).max(100),
  confidence: z.number().int().min(0).max(100),
  resolutionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().default(null),
  provenance: z.enum(CLAIM_PROVENANCES),
  provenanceDetail: z.string().max(200).default(""),
  sourceCitation: z.string().max(240).default(""),
  sourceTrustLevel: z.enum(SOURCE_TRUST_LEVELS).default("self"),
  stakes: z.array(z.enum(CLAIM_STAKES)).default([]),
  dependencyNotes: z.string().max(300).default(""),
  status: z.enum(CLAIM_STATUSES),
  temporalScope: z.string().max(120).optional(),
  conditionalStatement: z.string().max(200).optional(),
  structureKind: z.enum(CLAIM_STRUCTURE_KINDS).optional(),
});

const ReferenceClassSchema = z.object({
  promptShown: z.string().min(1).max(500),
  referenceClassType: z.string().min(1).max(80),
  benchmarkLow: z.number().min(0).max(100).nullable().optional().default(null),
  benchmarkHigh: z.number().min(0).max(100).nullable().optional().default(null),
  benchmarkSource: z.string().max(240).nullable().optional().default(null),
  userInsideViewEstimate: z.number().min(0).max(100),
  userReferenceClassEstimate: z.number().min(0).max(100).nullable().optional().default(null),
  userFinalConfidence: z.number().min(0).max(100),
  divergence: z.number(),
  divergenceDirection: z.enum(["higher_than_base_rate", "lower_than_base_rate", "aligned"]),
  userExplainedDivergence: z.string().max(400).nullable().optional().default(null),
});

export const CreateMapSchema = z.object({
  rawThought: z.string().min(12, "Give Penny one real thought, not a slogan.").max(400, "Keep the first thought under 400 characters."),
  claim: ClaimCaptureMetadataSchema,
  referenceClass: ReferenceClassSchema.optional(),
});

export const UpdateMapSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  rawThought: z.string().min(12).max(1000).optional(),
  status: z.enum(["ready", "archived"]).optional(),
});

export const CreateClaimCaptureSchema = z.object({
  text: z.string().min(10, "Claim must be at least 10 characters").max(1000, "Claim too long"),
  confidence: z.number().min(0).max(100),
  provenance: z.enum(CLAIM_PROVENANCES).default("intuition"),
  stakes: z.array(z.enum(CLAIM_STAKES)).default([]),
});

export const CreateClaimSchema = CreateClaimCaptureSchema.extend({
  note: z.string().max(500).nullable().optional(),
  context: z.string().trim().min(8, "Add brief provenance or context.").max(500),
  dependencyClaimIds: z.array(ClaimIdSchema).max(8, "Link at most 8 dependencies.").default([]),
});

export const UpdateClaimSchema = z.object({
  content: z.string().min(10).max(1000).optional(),
  note: z.string().max(500).nullable().optional(),
  nodeStatus: z.enum(["active", "weak", "superseded"]).optional(),
});

export const UpdateConfidenceSchema = z.object({
  confidence: z.number().min(0).max(100),
  reason: z.string().max(500).nullable().optional(),
});

export const CreateSteelManSchema = z.object({
  steelManText: z.string().min(50).max(2000),
  roundContext: z.string().max(200).nullable().optional(),
});

export const UpdateSteelManSchema = z.object({
  steelManText: z.string().min(50).max(2000),
});

export const CreateRoundSchema = z.object({
  mapId: z.string().cuid(),
  nodeId: z.string().cuid().nullable().optional(),
  round: z.string().min(1),
  roundIndex: z.number().int().nonnegative(),
  title: z.string().min(1),
  critiqueStrength: z.string().min(1),
  critiqueType: z.string().min(1).nullable().optional(),
  critiqueFailureTypes: z.array(z.string().min(1)).optional(),
  critiqueMode: z.enum(["direct", "socratic", "red_team"]).nullable().optional(),
  voiceLabel: z.string().min(1).nullable().optional(),
  prompt: z.string().min(1),
  why: z.string().min(1),
  responsePath: z.enum(["defend", "revise", "absorb"]),
  response: z.string().trim().min(10, "Response must be at least 10 characters.").max(1000),
  confidenceAtRoundEnd: z.number().min(0).max(100).nullable().optional(),
});

export const RoundResponseSchema = z.object({
  roundId: z.string().cuid(),
  userResponse: z.string().trim().min(10, "Response must be at least 10 characters.").max(3000),
  newConfidence: z.number().min(0).max(100),
  confidenceChangeReason: z.string().max(500).nullable().optional(),
});

export const ChallengeStartSchema = z.object({
  critiqueMode: z.enum(["direct", "socratic", "red_team"]).default("direct"),
  critiqueIntensity: z.number().int().min(1).max(5).default(3),
  selectedVoice: z.string().trim().max(120).nullable().optional().default(null),
  forceRegenerate: z.boolean().optional().default(false),
});

export const ChallengeResponseSchema = z.object({
  userResponse: z.string().trim().min(10, "Response must be at least 10 characters.").max(3000),
  newConfidence: z.number().min(0).max(100),
  confidenceChangeReason: z.string().max(500).nullable().optional(),
  responsePath: z.enum(["defend", "revise", "absorb"]).optional(),
});

export const RecordMoveSchema = z.object({
  mapId: z.string().cuid(),
  nodeId: z.string().cuid().nullable().optional(),
  eventType: z.enum([
    "map_created",
    "import_source",
    "import_review",
    "evidence_added",
    "intervention_shown",
    "intervention_completed",
    "intervention_dismissed",
    "bias_detected",
    "bias_resolved",
    "move_applied",
    "dialectic_round",
    "challenge_calibration",
    "confidence_override",
    "shape_feedback",
    "repair_action",
    "revisit_schedule",
    "revisit_action",
    "belief_propagation",
    "belief_propagation_decision",
    "belief_graph_cycle",
    "belief_graph_state",
    "meta_cognition_prompt",
    "meta_cognition_response",
    "critique_feedback",
    "critique_correction",
    "critique_quality_profile",
    "artifact_generated",
    "artifact_outcome",
    "claim_resolution",
    "lesson_applied",
    "vault_entry_registered",
  ]),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const CreateArtifactSchema = z.object({
  mapId: z.string().cuid(),
  artifactTypeId: z.enum([
    "founder_brief",
    "decision_memo",
    "investment_thesis",
    "research_proposal",
    "risk_register",
    "personal_decision_audit",
    "hypothesis_brief",
  ]),
  audience: z.string().trim().max(120).nullable().optional(),
  sectionOrder: z.array(z.string().trim().min(1)).optional(),
  narrativeGlue: z.string().trim().max(2000).nullable().optional(),
  userId: z.string().cuid().optional(),
});

export const StartSessionSchema = z.object({
  userId: z.string().cuid().optional(),
  mapId: z.string().cuid().nullable().optional(),
  declaredIntention: z.string().max(500),
  intentionType: z.enum([
    "stress_test",
    "explore_new_claim",
    "resolve_pending",
    "generate_artifact",
    "review_blind_spots",
    "revisit_queue",
    "open_exploration",
  ]),
  scopedClaimIds: z.array(z.string().cuid()).default([]),
  timeBudgetMinutes: z.number().int().min(1).max(480).nullable().optional(),
});

export const CloseSessionSchema = z.object({
  sessionId: z.string().cuid(),
  skipClosingRitual: z.boolean().optional().default(false),
  questionsAnswered: z
    .array(
      z.object({
        question: z.string().min(1).max(240),
        answer: z.string().min(1).max(1000),
      }),
    )
    .default([]),
  openItemsNoted: z.array(z.string().min(1).max(400)).default([]),
  nextSessionIntention: z.string().min(1).max(400).nullable().optional().default(null),
  energyRating: z.enum(["low", "medium", "high"]).nullable().optional().default(null),
  focusRating: z.enum(["scattered", "moderate", "deep"]).nullable().optional().default(null),
  productivityRating: z.number().int().min(1).max(5).nullable().optional().default(null),
});

export const SearchFiltersSchema = z.object({
  entityTypes: z.array(z.enum(["claim", "map", "artifact", "lesson", "session", "shape"])).default([]),
  domains: z.array(z.string().trim().min(1)).default([]),
  confidenceRange: z.tuple([z.number(), z.number()]).nullable().optional().default(null),
  dateRange: z.tuple([z.string(), z.string()]).nullable().optional().default(null),
  status: z.array(z.string().trim().min(1)).default([]),
  hasDialecticRounds: z.boolean().nullable().optional().default(null),
  hasResolutionDate: z.boolean().nullable().optional().default(null),
  stakeLevel: z.array(z.string().trim().min(1)).default([]),
});

export const SearchSchema = z.object({
  query: z.string().trim().default(""),
  userId: z.string().cuid().optional(),
  requestedAt: z.string().datetime().optional(),
  filters: SearchFiltersSchema.partial().optional().default({}),
});

export const LessonLibraryQuerySchema = z.object({
  claimText: z.string().trim().max(4000).optional(),
  claimDomain: z.string().trim().min(1).max(120).optional(),
  claimType: z.string().trim().min(1).max(120).optional(),
});

export const QuickCaptureListQuerySchema = z.object({
  userId: z.string().cuid().optional(),
});

export const SessionListQuerySchema = z.object({
  mapId: z.string().cuid().optional(),
});

export const VelocityQuerySchema = z.object({
  periodDays: z.coerce.number().int().min(7).max(365).default(30),
});

export const ExportQuerySchema = z.object({
  exportType: z.enum(EXPORT_TYPES),
  format: z.enum(EXPORT_FORMATS),
  includeHistory: z.enum(["true", "false"]).default("true"),
  includePrivate: z.enum(["true", "false"]).default("false"),
  mapId: z.string().cuid().optional(),
  claimId: z.string().cuid().optional(),
  sessionId: z.string().cuid().optional(),
});

export const NotificationScheduleSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
});

export const NotificationPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  revisitQueueDigest: z.enum(["daily", "every_3_days", "weekly", "off"]),
  resolutionReminders: z.enum(["always", "high_stakes_only", "off"]),
  blindSpotDigest: z.enum(["weekly", "biweekly", "off"]),
  featureUnlockAlerts: z.boolean(),
  sessionStartSuggestion: z.enum(["weekday_mornings", "custom", "off"]),
  customSchedule: NotificationScheduleSchema.nullable(),
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1),
});

export const BiographyAnnotationSchema = z.object({
  chapterId: z.string().cuid(),
  targetType: z.enum(["chapter", "belief_shift", "highlight"]),
  targetId: z.string().cuid(),
  annotationText: z.string().min(1).max(2000),
});

export const FingerprintReviewSchema = z.object({
  patternId: z.string().cuid(),
  disputeText: z.string().max(4000).nullable().optional(),
  falsificationCondition: z.string().max(2000).nullable().optional(),
  acknowledged: z.boolean().optional(),
});

export const HereBeforeDraftSchema = z.object({
  id: z.string().cuid(),
  text: z.string().min(1),
  domain: z.string().min(1),
  claimType: z.string().min(1),
  stakesLevel: z.enum(["light", "moderate", "heavy"]),
  structureKind: z.string().min(1),
  provenance: z.string().min(1),
  confidence: z.number().int().min(0).max(100),
});

export const VaultRegistrationSchema = z.object({
  mapId: z.string().cuid(),
  entryId: z.string().cuid(),
  entryType: z.enum(["claim", "map", "session"]),
  claimId: z.string().cuid().nullable().optional().default(null),
  sessionId: z.string().cuid().nullable().optional().default(null),
});
