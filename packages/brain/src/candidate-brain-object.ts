import { z } from "zod";

export const CandidateBrainObjectRefsSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    currentClaimId: z.string().uuid().optional(),
    targetClaimId: z.string().uuid().optional(),
    targetEdgeId: z.string().uuid().optional(),
    term: z.string().trim().min(1).max(120).optional(),
    candidateId: z.string().trim().min(1).max(180).optional(),
  })
  .strict();

export const CandidateBrainObjectSchema = z
  .object({
    objectType: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(360).optional(),
    content: z.string().trim().min(1).max(2_400),
    suggestedSaveReason: z.string().trim().min(1).max(280).optional(),
    source: z.enum(["learn", "autopilot"]).optional(),
    refs: CandidateBrainObjectRefsSchema.optional(),
  })
  .strict();

export type CandidateBrainObject = z.infer<typeof CandidateBrainObjectSchema>;
