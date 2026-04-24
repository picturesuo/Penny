export type SummarizeMapOutput = {
  summary: string;
  keyClaims: string[];
  tensions: string[];
  nextQuestions: string[];
};

export class SummarizeMapOutputValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Summarize map output failed validation: ${issues.join("; ")}`);
    this.name = "SummarizeMapOutputValidationError";
    this.issues = issues;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SummarizeMapOutputValidationError(["output must be an object"]);
  }

  return value as Record<string, unknown>;
}

function readStringArray(object: Record<string, unknown>, fieldName: keyof SummarizeMapOutput, issues: string[]) {
  const value = object[fieldName];

  if (!Array.isArray(value)) {
    issues.push(`${fieldName} must be an array`);
    return [];
  }

  const strings = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());

  if (strings.length === 0) {
    issues.push(`${fieldName} must include at least one non-empty string`);
  }

  return strings;
}

export function validateSummarizeMapOutput(value: unknown): SummarizeMapOutput {
  const object = asRecord(value);
  const issues: string[] = [];
  const summary = typeof object.summary === "string" ? object.summary.trim() : "";

  if (!summary) {
    issues.push("summary must be a non-empty string");
  }

  const output = {
    summary,
    keyClaims: readStringArray(object, "keyClaims", issues),
    tensions: readStringArray(object, "tensions", issues),
    nextQuestions: readStringArray(object, "nextQuestions", issues),
  };

  if (issues.length > 0) {
    throw new SummarizeMapOutputValidationError(issues);
  }

  return output;
}
