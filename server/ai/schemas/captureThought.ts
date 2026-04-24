import { z } from "zod";

const CaptureThoughtClaimSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    confidenceBps: z.number().int().min(0).max(10_000),
    rationale: z.string().trim().min(1).max(500).nullable(),
  })
  .strict();

export const CaptureThoughtOutputSchema = z
  .object({
    thought: z
      .object({
        title: z.string().trim().min(1).max(120),
        summary: z.string().trim().min(1).max(500),
      })
      .strict(),
    claims: z.array(CaptureThoughtClaimSchema).max(8),
  })
  .strict();

export type CaptureThoughtOutput = z.infer<typeof CaptureThoughtOutputSchema>;

const validCaptureThoughtOutputSample: z.input<typeof CaptureThoughtOutputSchema> = {
  thought: {
    title: "Investor proof loop",
    summary: "The user wants Penny to turn raw thought capture into investor-ready claim evidence.",
  },
  claims: [
    {
      text: "Penny should make raw founder thoughts traceable to investor-facing claims.",
      confidenceBps: 7600,
      rationale: "The thought explicitly connects capture, traceability, and investor use.",
    },
  ],
};

const invalidCaptureThoughtOutputSample: unknown = {
  thought: {
    title: "",
    summary: "Too loose.",
    extra: true,
  },
  claims: [
    {
      text: "",
      confidenceBps: 12_000,
      rationale: null,
    },
  ],
};

const validSampleResult = CaptureThoughtOutputSchema.safeParse(validCaptureThoughtOutputSample);

if (!validSampleResult.success) {
  throw new Error("CaptureThoughtOutputSchema rejected the valid sample.");
}

const invalidSampleResult = CaptureThoughtOutputSchema.safeParse(invalidCaptureThoughtOutputSample);

if (invalidSampleResult.success) {
  throw new Error("CaptureThoughtOutputSchema accepted the invalid sample.");
}
