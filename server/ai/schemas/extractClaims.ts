import { z } from "zod";

const ExtractedClaimSchema = z
  .object({
    text: z.string().trim().min(1).max(600),
    confidenceBps: z.number().int().min(0).max(10_000),
    rationale: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict();

export const ExtractClaimsOutputSchema = z
  .object({
    claims: z.array(ExtractedClaimSchema).min(1).max(8),
  })
  .strict();

export type ExtractClaimsOutput = z.infer<typeof ExtractClaimsOutputSchema>;

const validExtractClaimsOutputSample: z.input<typeof ExtractClaimsOutputSchema> = {
  claims: [
    {
      text: "Penny should preserve raw thought provenance for every extracted claim.",
      confidenceBps: 8400,
      rationale: "The thought explicitly asks for traceability.",
    },
  ],
};

const invalidExtractClaimsOutputSample: unknown = {
  confidence: 0.9,
  result: {
    claims: [
      {
        text: "",
        confidenceBps: 12_000,
      },
    ],
  },
};

if (!ExtractClaimsOutputSchema.safeParse(validExtractClaimsOutputSample).success) {
  throw new Error("ExtractClaimsOutputSchema rejected the valid sample.");
}

if (ExtractClaimsOutputSchema.safeParse(invalidExtractClaimsOutputSample).success) {
  throw new Error("ExtractClaimsOutputSchema accepted the invalid sample.");
}
