import { z } from "zod";

export const CritiqueEvaluationMethodSchema = z.enum([
  "human_review",
  "heuristic_review",
  "llm_as_judge_review",
]);

export const CritiqueEvaluationStatusSchema = z.enum(["placeholder", "completed"]);

export const CritiqueReplayStatusSchema = z.enum([
  "planned",
  "succeeded",
  "provider_failed",
  "validation_failed",
]);

export const CritiqueEvaluationScoreSchema = z.number().min(0).max(5);

export const CritiqueReplayReferenceSchema = z.object({
  run_id: z.string().trim().min(1).max(160),
  entry_id: z.string().trim().min(1).max(160),
  provider: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(160),
  prompt_version: z.string().trim().min(1).max(64),
  replay_status: CritiqueReplayStatusSchema,
  replay_file: z.string().trim().min(1).max(400).nullable().optional().default(null),
});

export const CritiqueEvaluationSchema = z.object({
  score_id: z.string().trim().min(1).max(160),
  candidate_id: z.string().trim().min(1).max(240),
  replay_ref: CritiqueReplayReferenceSchema,
  method: CritiqueEvaluationMethodSchema,
  status: CritiqueEvaluationStatusSchema,
  reviewer_label: z.string().trim().min(1).max(160).nullable().optional().default(null),
  rubric_version: z.string().trim().min(1).max(64).default("v1"),
  overall_score: CritiqueEvaluationScoreSchema.nullable().optional().default(null),
  dimension_scores: z.record(z.string().trim().min(1).max(64), CritiqueEvaluationScoreSchema.nullable()).default({}),
  notes: z.string().trim().max(4000).nullable().optional().default(null),
  validation_failure_reason: z.string().trim().max(4000).nullable().optional().default(null),
  created_at: z.string().datetime(),
});

export const CritiqueEvaluationBatchSchema = z.object({
  batch_id: z.string().trim().min(1).max(160),
  run_id: z.string().trim().min(1).max(160),
  generated_at: z.string().datetime(),
  scores: z.array(CritiqueEvaluationSchema).default([]),
});

export type CritiqueEvaluationMethod = z.infer<typeof CritiqueEvaluationMethodSchema>;
export type CritiqueEvaluation = z.infer<typeof CritiqueEvaluationSchema>;
export type CritiqueEvaluationBatch = z.infer<typeof CritiqueEvaluationBatchSchema>;
export type CritiqueReplayReference = z.infer<typeof CritiqueReplayReferenceSchema>;

export function buildCritiqueCandidateId(reference: CritiqueReplayReference) {
  return [
    reference.run_id,
    reference.entry_id,
    reference.provider,
    reference.model,
    reference.prompt_version,
  ].join("::");
}

export function createCritiqueEvaluationPlaceholder(input: {
  createdAt?: string;
  method: CritiqueEvaluationMethod;
  replayRef: CritiqueReplayReference;
  reviewerLabel?: string | null;
  rubricVersion?: string;
  scoreId?: string;
}) {
  const replayRef = CritiqueReplayReferenceSchema.parse(input.replayRef);
  const createdAt = input.createdAt ?? new Date().toISOString();

  return CritiqueEvaluationSchema.parse({
    score_id: input.scoreId ?? buildCritiqueScoreId(replayRef, input.method),
    candidate_id: buildCritiqueCandidateId(replayRef),
    replay_ref: replayRef,
    method: input.method,
    status: "placeholder",
    reviewer_label: input.reviewerLabel ?? null,
    rubric_version: input.rubricVersion ?? "v1",
    overall_score: null,
    dimension_scores: {},
    notes: null,
    validation_failure_reason: replayRef.replay_status === "validation_failed" ? "Replay output failed schema validation." : null,
    created_at: createdAt,
  });
}

export function completeCritiqueEvaluation(
  placeholder: CritiqueEvaluation,
  update: {
    dimensionScores?: Record<string, number | null>;
    notes?: string | null;
    overallScore: number | null;
    validationFailureReason?: string | null;
  },
) {
  const parsed = CritiqueEvaluationSchema.parse(placeholder);

  return CritiqueEvaluationSchema.parse({
    ...parsed,
    status: "completed",
    overall_score: update.overallScore,
    dimension_scores: update.dimensionScores ?? parsed.dimension_scores,
    notes: update.notes ?? parsed.notes,
    validation_failure_reason: update.validationFailureReason ?? parsed.validation_failure_reason,
  });
}

export function createCritiqueEvaluationBatch(input: {
  batchId?: string;
  generatedAt?: string;
  runId: string;
  scores: CritiqueEvaluation[];
}) {
  return CritiqueEvaluationBatchSchema.parse({
    batch_id: input.batchId ?? `scored-${input.runId}`,
    run_id: input.runId,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    scores: input.scores,
  });
}

export function summarizeCritiqueEvaluationBatch(batch: CritiqueEvaluationBatch) {
  const parsed = CritiqueEvaluationBatchSchema.parse(batch);
  const byMethod = {
    human_review: 0,
    heuristic_review: 0,
    llm_as_judge_review: 0,
  } satisfies Record<CritiqueEvaluationMethod, number>;
  let completed = 0;
  let scoredCount = 0;
  let totalOverall = 0;

  for (const score of parsed.scores) {
    byMethod[score.method] += 1;

    if (score.status === "completed") {
      completed += 1;
    }

    if (typeof score.overall_score === "number") {
      totalOverall += score.overall_score;
      scoredCount += 1;
    }
  }

  return {
    batch_id: parsed.batch_id,
    run_id: parsed.run_id,
    total_scores: parsed.scores.length,
    completed_scores: completed,
    average_overall_score: scoredCount ? Number((totalOverall / scoredCount).toFixed(2)) : null,
    scores_by_method: byMethod,
  };
}

function buildCritiqueScoreId(reference: CritiqueReplayReference, method: CritiqueEvaluationMethod) {
  return `${buildCritiqueCandidateId(reference)}::${method}`;
}
