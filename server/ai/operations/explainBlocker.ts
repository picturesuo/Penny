import { EXPLAIN_BLOCKER_PROMPT_VERSION, buildExplainBlockerPromptInput } from "../prompts/explainBlocker/v1.ts";
import { validateExplainBlockerOutput, type ExplainBlockerOutput } from "../schemas/explainBlocker.ts";

export type ExplainBlockerInput = {
  text: string;
  sessionId?: string;
};

export type ExplainBlockerResult = ExplainBlockerOutput;

export class ExplainBlockerValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = [message]) {
    super(message);
    this.name = "ExplainBlockerValidationError";
    this.issues = issues;
  }
}

type NormalizedExplainBlockerInput = {
  text: string;
  sessionId?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExplainBlockerValidationError("Request body must be a JSON object.");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new ExplainBlockerValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new ExplainBlockerValidationError(`${fieldName} must not be blank.`);
  }

  if (trimmed.length > maxLength) {
    throw new ExplainBlockerValidationError(`${fieldName} must be at most ${maxLength} characters.`);
  }

  return trimmed;
}

function readOptionalString(value: unknown, fieldName: string, maxLength: number) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ExplainBlockerValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new ExplainBlockerValidationError(`${fieldName} must not be blank.`);
  }

  if (trimmed.length > maxLength) {
    throw new ExplainBlockerValidationError(`${fieldName} must be at most ${maxLength} characters.`);
  }

  return trimmed;
}

function normalizeInput(input: unknown): NormalizedExplainBlockerInput {
  const object = asRecord(input);
  const text = readRequiredString(object.text, "text", 4000);
  const sessionId = readOptionalString(object.sessionId, "sessionId", 200);

  return {
    text,
    ...(sessionId ? { sessionId } : {}),
  };
}

function compactText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177).trim()}...`;
}

function deriveLikelyBlocker(text: string) {
  if (/\b(confus|unclear|not sure|stuck|don't understand)\b/i.test(text)) {
    return "The likely blocker is an unclear definition or success condition.";
  }

  if (/\b(can't|cannot|blocked|waiting|dependency|depends)\b/i.test(text)) {
    return "The likely blocker is an unresolved dependency that needs one explicit owner or answer.";
  }

  if (/\b(too much|overwhelmed|many|complex|complicated)\b/i.test(text)) {
    return "The likely blocker is too much scope competing for the next action.";
  }

  return "The likely blocker is a vague uncertainty that has not been turned into a testable question.";
}

function deriveMissingConcept(text: string) {
  if (/\b(metric|measure|number|data|evidence)\b/i.test(text)) {
    return "Evidence threshold";
  }

  if (/\b(user|customer|team|people|onboarding|example)\b/i.test(text)) {
    return "Concrete user example";
  }

  if (/\b(because|cause|why|therefore)\b/i.test(text)) {
    return "Causal mechanism";
  }

  return "Decision criterion";
}

function deriveNextExercise(text: string) {
  if (/\b(metric|measure|number|data|evidence)\b/i.test(text)) {
    return "Write one sentence naming the baseline, the metric, and the result that would change your mind.";
  }

  if (/\b(confus|unclear|not sure|stuck|don't understand)\b/i.test(text)) {
    return "Rewrite the blocker as one yes/no question and answer it with the smallest example you can find.";
  }

  return "Set a ten-minute timer, pick one concrete example, and write the next observable action.";
}

export function explainBlocker(input: unknown): ExplainBlockerResult {
  const normalized = normalizeInput(input);
  const promptInput = buildExplainBlockerPromptInput(normalized);
  const subject = compactText(normalized.text);
  const missingConcept = deriveMissingConcept(subject);
  const output = {
    likelyBlocker: deriveLikelyBlocker(subject),
    missingConcept,
    simplerExplanation: `You are probably stuck because "${subject}" needs a clearer ${missingConcept.toLowerCase()} before the next step is obvious.`,
    nextExercise: deriveNextExercise(subject),
  };

  void promptInput;
  void EXPLAIN_BLOCKER_PROMPT_VERSION;

  return validateExplainBlockerOutput(output);
}
