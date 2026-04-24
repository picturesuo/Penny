import { task } from "@trigger.dev/sdk";
import { isChallengeCritiqueValidationError } from "@/server/ai/challenge-critique-validation";
import {
  GenerateChallengeCritiqueJobPayloadSchema,
  runGenerateChallengeCritiqueJob,
  type GenerateChallengeCritiqueJobPayload,
} from "@/server/challenge-critique-workflow";

export const generateChallengeCritiqueTask = task({
  id: "challenge.critique.generate",
  description: "Generate and persist one Penny challenge critique asynchronously.",
  queue: {
    name: "challenge-critique",
    concurrencyLimit: 1,
  },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 30_000,
    randomize: false,
  },
  catchError: async ({ error }) => {
    if (isChallengeCritiqueValidationError(error)) {
      return {
        skipRetrying: true,
      };
    }

    return;
  },
  run: async (payload: GenerateChallengeCritiqueJobPayload, { ctx }) => {
    const parsed = GenerateChallengeCritiqueJobPayloadSchema.parse({
      ...payload,
      triggerRunId: payload.triggerRunId ?? ctx.run.id,
    });

    return runGenerateChallengeCritiqueJob(parsed);
  },
});
