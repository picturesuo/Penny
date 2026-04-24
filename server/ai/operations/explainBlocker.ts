import { EXPLAIN_BLOCKER_PROMPT_VERSION, buildExplainBlockerPromptInput } from "../prompts/explainBlocker/v1.ts";
import { validateExplainBlockerOutput, type ExplainBlockerOutput } from "../schemas/explainBlocker.ts";

export type ExplainBlockerInput = {
  thoughtId?: string;
  claimId?: string;
  text?: string;
  blocker?: string;
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
  thoughtId?: string;
  claimId?: string;
  text?: string;
  blocker?: string;
  subject: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExplainBlockerValidationError("Request body must be a JSON object.");
  }

  return value as Record<string, unknown>;
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
  const thoughtId = readOptionalString(object.thoughtId, "thoughtId", 200);
  const claimId = readOptionalString(object.claimId, "claimId", 200);
  const text = readOptionalString(object.text, "text", 4000);
  const blocker = readOptionalString(object.blocker, "blocker", 4000);

  if (!thoughtId && !claimId && !text && !blocker) {
    throw new ExplainBlockerValidationError("Provide at least one of thoughtId, claimId, text, or blocker.");
  }

  return {
    ...(thoughtId ? { thoughtId } : {}),
    ...(claimId ? { claimId } : {}),
    ...(text ? { text } : {}),
    ...(blocker ? { blocker } : {}),
    subject: blocker ?? text ?? `the selected idea ${claimId ?? thoughtId}`,
  };
}

function compactSubject(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177).trim()}...`;
}

function deriveLikelyCause(subject: string) {
  if (/\b(don't understand|confus|unclear|not sure|stuck)\b/i.test(subject)) {
    return "The blocker is probably an undefined term, missing example, or unclear success condition.";
  }

  if (/\b(can't|cannot|blocked|waiting|dependency|depends)\b/i.test(subject)) {
    return "The blocker is probably an unresolved dependency rather than lack of effort.";
  }

  if (/\b(too much|overwhelmed|many|complex|complicated)\b/i.test(subject)) {
    return "The blocker is probably too much scope competing for one next action.";
  }

  return "The blocker is probably a hidden uncertainty that has not been turned into a testable question.";
}

function deriveMissingInformation(subject: string) {
  if (/\b(metric|measure|number|data|evidence)\b/i.test(subject)) {
    return "You need the source, comparison baseline, and threshold that would make the evidence decision-grade.";
  }

  if (/\b(user|customer|team|people)\b/i.test(subject)) {
    return "You need one concrete user or team example that shows where the confusion appears.";
  }

  return "You need the smallest concrete example, the expected outcome, and the condition that would prove it resolved.";
}

function deriveNextStep(subject: string) {
  if (/\b(can't|cannot|blocked|waiting|dependency|depends)\b/i.test(subject)) {
    return "Name the dependency owner and write the single question that would unblock the next decision.";
  }

  if (/\b(confus|unclear|not sure|stuck)\b/i.test(subject)) {
    return "Rewrite the blocker as one yes/no or either/or question, then answer only that question first.";
  }

  return "Run a ten-minute check: define the blocker, pick one example, and decide what evidence would change your mind.";
}

export function explainBlocker(input: unknown): ExplainBlockerResult {
  const normalized = normalizeInput(input);
  const promptInput = buildExplainBlockerPromptInput({
    thoughtId: normalized.thoughtId,
    claimId: normalized.claimId,
    text: normalized.text,
    blocker: normalized.blocker,
  });
  const subject = compactSubject(normalized.subject);
  const output = {
    blockerSummary: `The current blocker is: "${subject}".`,
    likelyCause: deriveLikelyCause(subject),
    missingInformation: deriveMissingInformation(subject),
    nextStep: deriveNextStep(subject),
    confidenceQuestion: `What answer would make you at least 20 points more confident about moving past "${subject}"?`,
  };

  void promptInput;
  void EXPLAIN_BLOCKER_PROMPT_VERSION;

  return validateExplainBlockerOutput(output);
}
