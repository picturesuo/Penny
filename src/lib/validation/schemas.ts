import { z } from "zod";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateBody<T>(schema: z.ZodSchema<T>) {
  return async (body: unknown): Promise<T> => {
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", "));
    }
    return result.data;
  };
}

export const CreateMapSchema = z.object({
  rawThought: z.string().min(12).max(400),
});

export const UpdateMapSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  rawThought: z.string().min(12).max(1000).optional(),
  status: z.enum(["ready", "archived"]).optional(),
});

export const CreateClaimSchema = z.object({
  content: z.string().min(10).max(1000),
  note: z.string().max(500).nullable().optional(),
  kind: z.enum(["root", "core_claim", "why_it_matters", "assumption", "counter_argument", "research"]).optional(),
  nodeStatus: z.enum(["active", "weak", "superseded"]).optional(),
  parentId: z.string().min(1).nullable().optional(),
  branchOrder: z.number().int().min(0).optional(),
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
  mapId: z.string().min(1),
  nodeId: z.string().min(1).nullable().optional(),
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
  response: z.string().min(1).max(3000),
  confidenceAtRoundEnd: z.number().min(0).max(100).nullable().optional(),
});

export const RoundResponseSchema = z.object({
  roundId: z.string().min(1),
  userResponse: z.string().min(10).max(3000),
  newConfidence: z.number().min(0).max(100),
  confidenceChangeReason: z.string().max(500).nullable().optional(),
});

export const RecordMoveSchema = z.object({
  mapId: z.string().min(1),
  nodeId: z.string().min(1).nullable().optional(),
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
  mapId: z.string().min(1),
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
  userId: z.string().min(1).optional(),
});

export const StartSessionSchema = z.object({
  userId: z.string().min(1).optional(),
  mapId: z.string().min(1).nullable().optional(),
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
  scopedClaimIds: z.array(z.string().min(1)).default([]),
  timeBudgetMinutes: z.number().int().min(1).max(480).nullable().optional(),
});

export const CloseSessionSchema = z.object({
  sessionId: z.string().min(1),
  skipClosingRitual: z.boolean().optional(),
  questionsAnswered: z.array(
    z.object({
      question: z.string().min(1).max(240),
      answer: z.string().min(1).max(1000),
    }),
  ),
  openItemsNoted: z.array(z.string().min(1).max(400)),
  nextSessionIntention: z.string().min(1).max(400).nullable().optional(),
  energyRating: z.enum(["low", "medium", "high"]).nullable().optional(),
  focusRating: z.enum(["scattered", "moderate", "deep"]).nullable().optional(),
  productivityRating: z.number().int().min(1).max(5).nullable().optional(),
});
