import { buildChallengeIdeaPromptInput, CHALLENGE_IDEA_PROMPT_VERSION } from "../prompts/challengeIdea/v1.ts";
import { validateChallengeIdeaOutput, type ChallengeIdeaOutput } from "../schemas/challengeIdea.ts";

export type ChallengeIdeaInput = {
  thoughtId?: string;
  claimId?: string;
  text?: string;
};

export type ChallengeIdeaResult = ChallengeIdeaOutput;

export class ChallengeIdeaValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = [message]) {
    super(message);
    this.name = "ChallengeIdeaValidationError";
    this.issues = issues;
  }
}

type NormalizedChallengeIdeaInput = {
  thoughtId?: string;
  claimId?: string;
  text?: string;
  subject: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ChallengeIdeaValidationError("Request body must be a JSON object.");
  }

  return value as Record<string, unknown>;
}

function readOptionalString(value: unknown, fieldName: string, maxLength: number) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ChallengeIdeaValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new ChallengeIdeaValidationError(`${fieldName} must not be blank.`);
  }

  if (trimmed.length > maxLength) {
    throw new ChallengeIdeaValidationError(`${fieldName} must be at most ${maxLength} characters.`);
  }

  return trimmed;
}

function normalizeInput(input: unknown): NormalizedChallengeIdeaInput {
  const object = asRecord(input);
  const thoughtId = readOptionalString(object.thoughtId, "thoughtId", 200);
  const claimId = readOptionalString(object.claimId, "claimId", 200);
  const text = readOptionalString(object.text, "text", 4000);

  if (!thoughtId && !claimId && !text) {
    throw new ChallengeIdeaValidationError("Provide at least one of thoughtId, claimId, or text.");
  }

  return {
    ...(thoughtId ? { thoughtId } : {}),
    ...(claimId ? { claimId } : {}),
    ...(text ? { text } : {}),
    subject: text ?? `the selected idea ${claimId ?? thoughtId}`,
  };
}

function compactSubject(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177).trim()}...`;
}

function sentence(value: string) {
  const trimmed = value.trim();

  if (/[.!?]$/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}.`;
}

function deriveObjection(subject: string) {
  if (/\b(always|never|all|every|none|guarantee|guaranteed|impossible)\b/i.test(subject)) {
    return "The idea is too absolute; one credible exception would force the claim to be softened.";
  }

  if (/\b(because|causes?|drives?|leads? to|therefore|results? in)\b/i.test(subject)) {
    return "The causal story may be backwards, confounded, or missing a stronger competing explanation.";
  }

  if (/\b(should|must|need to|ought to|recommend)\b/i.test(subject)) {
    return "The recommendation may ignore the tradeoff that would make a reasonable person choose the opposite path.";
  }

  return "The idea may be directionally right but too underspecified to survive contact with a concrete edge case.";
}

function deriveAssumption(subject: string) {
  if (/\d/.test(subject)) {
    return "The number is meaningful, comparable, and measured from a source strong enough to guide the decision.";
  }

  if (/\b(users?|customers?|teams?|people)\b/i.test(subject)) {
    return "The people affected by the idea behave consistently enough for one explanation to cover the important cases.";
  }

  return "The key terms in the idea mean the same thing across contexts, evidence sources, and decision makers.";
}

function deriveCounterexample(subject: string) {
  if (/\b(because|causes?|drives?|leads? to|therefore|results? in)\b/i.test(subject)) {
    return "Find a case where the proposed cause is present but the expected outcome does not appear.";
  }

  if (/\b(should|must|need to|ought to|recommend)\b/i.test(subject)) {
    return "Find a high-quality case where someone rejects the recommendation and gets a better result.";
  }

  return "Find one adjacent situation where the idea sounds plausible but fails under real constraints.";
}

function buildBetterVersion(subject: string) {
  return `A stronger version would say: "${sentence(subject)} This is most likely true when the context, evidence threshold, and exception case are explicit."`;
}

export function challengeIdea(input: unknown): ChallengeIdeaResult {
  const normalized = normalizeInput(input);
  const promptInput = buildChallengeIdeaPromptInput({
    thoughtId: normalized.thoughtId,
    claimId: normalized.claimId,
    text: normalized.text,
  });
  const subject = compactSubject(normalized.subject);
  const output = {
    strongestObjection: deriveObjection(subject),
    hiddenAssumption: deriveAssumption(subject),
    counterexample: deriveCounterexample(subject),
    betterVersion: buildBetterVersion(subject),
    confidenceQuestion: `What evidence would move your confidence in "${subject}" down by at least 20 points?`,
  };

  void promptInput;
  void CHALLENGE_IDEA_PROMPT_VERSION;

  return validateChallengeIdeaOutput(output);
}
