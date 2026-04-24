import { z } from "zod";

export class ChallengeCritiqueValidationError extends Error {
  readonly name = "ChallengeCritiqueValidationError";
  readonly attempts: number;
  readonly issues: ReturnType<z.ZodError["flatten"]>;

  constructor(message: string, error: z.ZodError, attempts: number) {
    super(message);
    this.attempts = attempts;
    this.issues = error.flatten();
  }
}

export function isChallengeCritiqueValidationError(error: unknown): error is ChallengeCritiqueValidationError {
  return error instanceof ChallengeCritiqueValidationError;
}
