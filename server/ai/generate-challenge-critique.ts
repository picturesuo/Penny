export type GenerateChallengeCritiqueInput = {
  claim: string;
};

export type GenerateChallengeCritiqueResult = {
  body: string;
};

export class GenerateChallengeCritiqueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerateChallengeCritiqueValidationError";
  }
}

type NormalizedGenerateChallengeCritiqueInput = {
  claim: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GenerateChallengeCritiqueValidationError("generateChallengeCritique input must be an object.");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new GenerateChallengeCritiqueValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    throw new GenerateChallengeCritiqueValidationError(`${fieldName} must be at least ${options.minLength} character(s).`);
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new GenerateChallengeCritiqueValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
  }

  return trimmed;
}

function normalizeInput(input: unknown): NormalizedGenerateChallengeCritiqueInput {
  const object = asObject(input);

  return {
    claim: readRequiredString(object.claim, "claim", { minLength: 1, maxLength: 4000 }),
  };
}

function deriveMainChallenge(claim: string) {
  if (/\b(always|never|all|every|none|impossible|guarantee(?:d|s)?)\b/i.test(claim)) {
    return "The claim is framed too absolutely. It needs boundaries, exceptions, and a case where it stops being true.";
  }

  if (/\b(because|causes?|drives?|leads? to|results? in|therefore)\b/i.test(claim)) {
    return "The claim implies causality, but the mechanism and the evidence threshold are still underspecified.";
  }

  if (/\b(should|must|need to|ought to|recommend)\b/i.test(claim)) {
    return "The claim recommends action without making the tradeoffs or decision rule explicit.";
  }

  if (/\d/.test(claim)) {
    return "The claim sounds quantitative, but it does not yet name the source quality, sample, or acceptable error range.";
  }

  return "The claim is directionally plausible, but the key terms are still loose enough to hide disagreement.";
}

function derivePressureTest(claim: string) {
  if (/\b(because|causes?|drives?|leads? to|results? in|therefore)\b/i.test(claim)) {
    return "Ask what competing explanation could produce the same outcome even if the claim's causal story is wrong.";
  }

  if (/\b(should|must|need to|ought to|recommend)\b/i.test(claim)) {
    return "Ask what cost, downside, or opportunity cost would make a rational actor reject this recommendation.";
  }

  if (/\d/.test(claim)) {
    return "Ask which exact metric would have to move, by how much, and over what time window for this claim to count as supported.";
  }

  return "Ask for the narrowest concrete example where the claim clearly holds, then ask what adjacent case breaks it.";
}

function deriveFastestTest(claim: string) {
  if (/\b(always|never|all|every|none|impossible|guarantee(?:d|s)?)\b/i.test(claim)) {
    return "Look for one credible counterexample. A single solid exception is enough to force the wording to soften.";
  }

  if (/\b(because|causes?|drives?|leads? to|results? in|therefore)\b/i.test(claim)) {
    return "Separate correlation from cause: find one case with the claimed driver present but the outcome missing, or vice versa.";
  }

  if (/\b(should|must|need to|ought to|recommend)\b/i.test(claim)) {
    return "Define a reversible trial with a success metric and a pre-committed condition that would cause you to stop.";
  }

  if (/\d/.test(claim)) {
    return "Name the source, baseline, and confidence interval you would accept before repeating the number as fact.";
  }

  return "Rewrite the claim with one measurable term and one explicit boundary, then see whether the stronger version still feels true.";
}

export function generateChallengeCritique(input: unknown): GenerateChallengeCritiqueResult {
  const normalized = normalizeInput(input);
  const mainChallenge = deriveMainChallenge(normalized.claim);
  const pressureTest = derivePressureTest(normalized.claim);
  const fastestTest = deriveFastestTest(normalized.claim);

  return {
    body: [
      `Main challenge: ${mainChallenge}`,
      `Pressure test: ${pressureTest}`,
      `Fastest next test: ${fastestTest}`,
    ].join("\n\n"),
  };
}
