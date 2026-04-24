export type ChallengeIdeaOutput = {
  strongestObjection: string;
  hiddenAssumption: string;
  counterexample: string;
  betterVersion: string;
  confidenceQuestion: string;
};

export class ChallengeIdeaOutputValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Challenge idea output failed validation: ${issues.join("; ")}`);
    this.name = "ChallengeIdeaOutputValidationError";
    this.issues = issues;
  }
}

const requiredFields = [
  "strongestObjection",
  "hiddenAssumption",
  "counterexample",
  "betterVersion",
  "confidenceQuestion",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ChallengeIdeaOutputValidationError(["output must be an object"]);
  }

  return value as Record<string, unknown>;
}

export function validateChallengeIdeaOutput(value: unknown): ChallengeIdeaOutput {
  const object = asRecord(value);
  const issues: string[] = [];
  const output: Partial<ChallengeIdeaOutput> = {};

  for (const field of requiredFields) {
    const fieldValue = object[field];

    if (typeof fieldValue !== "string" || !fieldValue.trim()) {
      issues.push(`${field} must be a non-empty string`);
      continue;
    }

    output[field] = fieldValue.trim();
  }

  if (issues.length > 0) {
    throw new ChallengeIdeaOutputValidationError(issues);
  }

  return output as ChallengeIdeaOutput;
}
