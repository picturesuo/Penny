import { z } from "zod";

const ChallengeCritiqueListItemSchema = z.string().trim().min(1).max(240);

const ChallengeCritiqueListSchema = z.array(ChallengeCritiqueListItemSchema).max(6);

export const GenerateChallengeCritiqueOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(240),
    strongestCounterargument: z.string().trim().min(1).max(2400),
    assumptions: ChallengeCritiqueListSchema,
    failureModes: ChallengeCritiqueListSchema,
    followUpQuestions: ChallengeCritiqueListSchema,
    suggestedConfidenceBps: z.number().int().min(0).max(10_000).nullable(),
    uncertaintyNote: z.string().trim().min(1).max(400),
  })
  .strict();

export type GenerateChallengeCritiqueOutput = z.infer<typeof GenerateChallengeCritiqueOutputSchema>;

const validGenerateChallengeCritiqueOutputSample: z.input<typeof GenerateChallengeCritiqueOutputSchema> = {
  summary: "The claim depends on a retention improvement that has not been shown outside a narrow pilot cohort.",
  strongestCounterargument:
    "The early cohort may be unusually motivated, so the observed lift could disappear when the workflow reaches less engaged users.",
  assumptions: [
    "Pilot users are representative of the broader target segment.",
    "The measured retention lift comes from the product change rather than founder-driven onboarding.",
  ],
  failureModes: [
    "Retention gains vanish once manual onboarding is removed.",
    "The current workflow does not scale to lower-intent users.",
  ],
  followUpQuestions: [
    "What happened to retention after the most hands-on onboarding steps were removed?",
    "How does the lift compare across user segments with different starting intent levels?",
  ],
  suggestedConfidenceBps: 4_800,
  uncertaintyNote: "The available evidence is early and may overfit to a small, high-attention pilot group.",
};

const invalidGenerateChallengeCritiqueOutputSample: unknown = {
  summary: "Looks good.",
  strongestCounterargument: "",
  assumptions: ["", "Founder effort may be masking product weakness."],
  failureModes: "Retention may collapse.",
  followUpQuestions: ["What breaks at scale?"],
  suggestedConfidenceBps: -50,
  uncertaintyNote: "Unknown.",
  extraField: true,
};

const validSampleResult = GenerateChallengeCritiqueOutputSchema.safeParse(validGenerateChallengeCritiqueOutputSample);

if (!validSampleResult.success) {
  throw new Error("GenerateChallengeCritiqueOutputSchema rejected the valid sample.");
}

const invalidSampleResult = GenerateChallengeCritiqueOutputSchema.safeParse(invalidGenerateChallengeCritiqueOutputSample);

if (invalidSampleResult.success) {
  throw new Error("GenerateChallengeCritiqueOutputSchema accepted the invalid sample.");
}
