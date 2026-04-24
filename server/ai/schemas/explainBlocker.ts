export type ExplainBlockerOutput = {
  likelyBlocker: string;
  missingConcept: string;
  simplerExplanation: string;
  nextExercise: string;
};

export class ExplainBlockerOutputValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Explain blocker output failed validation: ${issues.join("; ")}`);
    this.name = "ExplainBlockerOutputValidationError";
    this.issues = issues;
  }
}

const requiredFields = [
  "likelyBlocker",
  "missingConcept",
  "simplerExplanation",
  "nextExercise",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExplainBlockerOutputValidationError(["output must be an object"]);
  }

  return value as Record<string, unknown>;
}

export function validateExplainBlockerOutput(value: unknown): ExplainBlockerOutput {
  const object = asRecord(value);
  const issues: string[] = [];
  const output: Partial<ExplainBlockerOutput> = {};

  for (const field of requiredFields) {
    const fieldValue = object[field];

    if (typeof fieldValue !== "string" || !fieldValue.trim()) {
      issues.push(`${field} must be a non-empty string`);
      continue;
    }

    output[field] = fieldValue.trim();
  }

  if (issues.length > 0) {
    throw new ExplainBlockerOutputValidationError(issues);
  }

  return output as ExplainBlockerOutput;
}
