import { z } from "zod";

export const ChallengeCritiqueModeSchema = z.enum(["direct", "socratic", "red_team"]);

export const GenerateChallengeCritiqueInputSchema = z.object({
  claimText: z.string().trim().min(1).max(4000),
  steelmanText: z.string().trim().max(6000).nullable().optional().default(null),
  confidence: z.number().int().min(0).max(100),
  priorRounds: z.array(z.string().trim().min(1).max(800)).max(6).optional().default([]),
  critiqueMode: ChallengeCritiqueModeSchema.optional().default("direct"),
});

export const GenerateChallengeCritiqueOutputSchema = z.object({
  headline: z.string(),
  critique: z.string(),
  critiqueLens: z.string(),
  failureTypes: z.array(z.string()),
  dependencyRisks: z.array(z.string()),
  whyNow: z.string(),
});

export type GenerateChallengeCritiqueInput = z.infer<typeof GenerateChallengeCritiqueInputSchema>;
export type GenerateChallengeCritiqueOutput = z.infer<typeof GenerateChallengeCritiqueOutputSchema>;
export type ChallengeCritiqueMode = z.infer<typeof ChallengeCritiqueModeSchema>;
