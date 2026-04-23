import { task } from "@trigger.dev/sdk";
import {
  GenerateChallengeCritiqueJobPayloadSchema,
  runGenerateChallengeCritiqueJob,
  type GenerateChallengeCritiqueJobPayload,
} from "@/server/challenge-critique-workflow";

export const generateChallengeCritiqueTask = task({
  id: "generate-challenge-critique",
  description: "Generate and persist one Penny challenge critique asynchronously.",
  queue: {
    name: "challenge-critique",
    concurrencyLimit: 1,
  },
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 10_000,
    randomize: false,
  },
  run: async (payload: GenerateChallengeCritiqueJobPayload, { ctx }) => {
    const parsed = GenerateChallengeCritiqueJobPayloadSchema.parse({
      ...payload,
      triggerRunId: payload.triggerRunId ?? ctx.run.id,
    });

    return runGenerateChallengeCritiqueJob(parsed);
  },
});
