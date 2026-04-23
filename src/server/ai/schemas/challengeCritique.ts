import { z } from "zod";

export const ChallengeCritiqueModeSchema = z.enum(["direct", "socratic", "red_team"]);
export const ChallengeResponsePathSchema = z.enum(["defend", "revise", "absorb"]);
export const ChallengeCritiqueQualityTierSchema = z.enum(["standard", "degraded"]);

export const ChallengeCritiqueNeighborClaimSchema = z.object({
  id: z.string().uuid("Invalid neighboring claim id."),
  text: z.string().trim().min(1).max(4000),
  confidence: z.number().int().min(0).max(100).nullable().optional().default(null),
  kind: z.string().trim().min(1).max(64).nullable().optional().default(null),
  relationship: z.string().trim().min(1).max(64).nullable().optional().default(null),
});

export const ChallengeCritiquePreviousRoundSchema = z.object({
  roundId: z.string().uuid("Invalid prior round id."),
  roundNumber: z.number().int().min(1),
  critiqueSummary: z.string().trim().min(1).max(800),
  userResponse: z.string().trim().max(1200).nullable().optional().default(null),
  responsePath: ChallengeResponsePathSchema.nullable().optional().default(null),
  confidenceDelta: z.number().int().min(-100).max(100).nullable().optional().default(null),
});

export const GenerateChallengeCritiqueInputSchema = z.object({
  mapTitle: z.string().trim().min(1).max(200),
  claimId: z.string().uuid("Invalid claim id."),
  claimText: z.string().trim().min(1).max(4000),
  claimConfidence: z.number().int().min(0).max(100),
  steelmanText: z.string().trim().max(6000).nullable().optional().default(null),
  neighboringClaims: z.array(ChallengeCritiqueNeighborClaimSchema).max(8).optional().default([]),
  previousRounds: z.array(ChallengeCritiquePreviousRoundSchema).max(6).optional().default([]),
  userGoal: z.string().trim().min(1).max(800).nullable().optional().default(null),
  critiqueMode: ChallengeCritiqueModeSchema.optional().default("direct"),
});

export const GenerateChallengeCritiqueOutputSchema = z.object({
  conciseCritiqueSummary: z.string().trim().min(1).max(240),
  strongestCounterargument: z.string().trim().min(1).max(2400),
  assumptions: z.array(z.string().trim().min(1).max(240)).max(6),
  likelyFailureModes: z.array(z.string().trim().min(1).max(240)).max(6),
  followUpQuestions: z.array(z.string().trim().min(1).max(240)).max(6),
  suggestedConfidenceDelta: z.number().int().min(-100).max(100),
  uncertaintyNote: z.string().trim().min(1).max(400),
});

export type GenerateChallengeCritiqueInput = z.infer<typeof GenerateChallengeCritiqueInputSchema>;
export type GenerateChallengeCritiqueOutput = z.infer<typeof GenerateChallengeCritiqueOutputSchema>;
export type ChallengeCritiqueMode = z.infer<typeof ChallengeCritiqueModeSchema>;
export type ChallengeCritiqueQualityTier = z.infer<typeof ChallengeCritiqueQualityTierSchema>;
export type ChallengeCritiqueNeighborClaim = z.infer<typeof ChallengeCritiqueNeighborClaimSchema>;
export type ChallengeCritiquePreviousRound = z.infer<typeof ChallengeCritiquePreviousRoundSchema>;
