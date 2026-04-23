import { z } from "zod";
import {
  GenerateChallengeCritiqueInputSchema,
  GenerateChallengeCritiqueOutputSchema,
} from "@/server/ai/schemas/challengeCritique";

export const GenerateChallengeCritiqueGoldenEntryMetadataSchema = z.object({
  prompt_version: z.string().trim().min(1).max(64),
  schema_version: z.string().trim().min(1).max(64),
  source: z.enum(["handcrafted", "captured", "synthetic"]).optional().default("handcrafted"),
  labels: z.array(z.string().trim().min(1).max(64)).max(24).optional().default([]),
  human_notes: z.string().trim().max(4000).nullable().optional().default(null),
});

export const GenerateChallengeCritiqueGoldenDatasetEntrySchema = z.object({
  id: z.string().trim().min(1).max(160),
  operation: z.literal("generateChallengeCritique").optional().default("generateChallengeCritique"),
  metadata: GenerateChallengeCritiqueGoldenEntryMetadataSchema,
  input: GenerateChallengeCritiqueInputSchema,
  expected_output: GenerateChallengeCritiqueOutputSchema,
});

export const GenerateChallengeCritiqueGoldenDatasetMetadataSchema = z.object({
  dataset_version: z.string().trim().min(1).max(64),
  prompt_version: z.string().trim().min(1).max(64).nullable().optional().default(null),
  schema_version: z.string().trim().min(1).max(64),
  created_at: z.string().datetime(),
  labels: z.array(z.string().trim().min(1).max(64)).max(24).optional().default([]),
  human_notes: z.string().trim().max(4000).nullable().optional().default(null),
});

export const GenerateChallengeCritiqueGoldenDatasetSchema = z.object({
  dataset_id: z.string().trim().min(1).max(160),
  operation: z.literal("generateChallengeCritique").optional().default("generateChallengeCritique"),
  description: z.string().trim().min(1).max(1000),
  metadata: GenerateChallengeCritiqueGoldenDatasetMetadataSchema,
  entries: z.array(GenerateChallengeCritiqueGoldenDatasetEntrySchema).min(1),
});

export type GenerateChallengeCritiqueGoldenDatasetEntry = z.infer<
  typeof GenerateChallengeCritiqueGoldenDatasetEntrySchema
>;
export type GenerateChallengeCritiqueGoldenDataset = z.infer<typeof GenerateChallengeCritiqueGoldenDatasetSchema>;
