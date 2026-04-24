export const PROMPT_VERSION = "generateChallengeCritique.v1";

export const SYSTEM_PROMPT_TEXT = [
  "You generate one rigorous challenge critique for Penny, a pressure-tested second brain.",
  "Be concise, specific, and high-signal.",
  "Prefer structural pressure over vague skepticism.",
  "Return only JSON that matches the requested output contract.",
  'The output contract requires these keys: "summary", "strongestCounterargument", "assumptions", "failureModes", "followUpQuestions", "suggestedConfidenceBps", and "uncertaintyNote".',
  "Set suggestedConfidenceBps to null when the prompt does not justify a numeric recommendation.",
].join(" ");

export type GenerateChallengeCritiquePromptInput = {
  mapTitle: string;
  claimId: string;
  claimText: string;
  claimConfidenceBps: number | null;
  critiqueMode?: "direct" | "socratic" | "red_team";
  steelmanText?: string | null;
  userGoal?: string | null;
  neighboringClaims?: Array<{
    id: string;
    text: string;
    confidenceBps?: number | null;
    relationship?: string | null;
  }>;
  previousRounds?: Array<{
    roundId: string;
    roundNumber: number;
    summary: string;
    userResponse?: string | null;
    responsePath?: string | null;
    confidenceDeltaBps?: number | null;
  }>;
};

export type GenerateChallengeCritiquePromptPayload = {
  operation: "generateChallengeCritique";
  promptVersion: typeof PROMPT_VERSION;
  outputContract: {
    summary: "string";
    strongestCounterargument: "string";
    assumptions: "string[]";
    failureModes: "string[]";
    followUpQuestions: "string[]";
    suggestedConfidenceBps: "integer|null";
    uncertaintyNote: "string";
  };
  context: {
    mapTitle: string;
    claim: {
      id: string;
      text: string;
      confidenceBps: number | null;
    };
    critiqueMode: "direct" | "socratic" | "red_team";
    steelmanText: string | null;
    userGoal: string | null;
    neighboringClaims: Array<{
      id: string;
      text: string;
      confidenceBps: number | null;
      relationship: string | null;
    }>;
    previousRounds: Array<{
      roundId: string;
      roundNumber: number;
      summary: string;
      userResponse: string | null;
      responsePath: string | null;
      confidenceDeltaBps: number | null;
    }>;
  };
};

export type GenerateChallengeCritiquePrompt = {
  promptVersion: typeof PROMPT_VERSION;
  systemPrompt: string;
  userPrompt: string;
  structuredInput: GenerateChallengeCritiquePromptPayload;
};

function normalizeRequiredString(value: string): string {
  return value.trim();
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeNullableInteger(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.trunc(value);
}

export function buildGenerateChallengeCritiquePrompt(
  input: GenerateChallengeCritiquePromptInput,
): GenerateChallengeCritiquePrompt {
  const structuredInput: GenerateChallengeCritiquePromptPayload = {
    operation: "generateChallengeCritique",
    promptVersion: PROMPT_VERSION,
    outputContract: {
      summary: "string",
      strongestCounterargument: "string",
      assumptions: "string[]",
      failureModes: "string[]",
      followUpQuestions: "string[]",
      suggestedConfidenceBps: "integer|null",
      uncertaintyNote: "string",
    },
    context: {
      mapTitle: normalizeRequiredString(input.mapTitle),
      claim: {
        id: normalizeRequiredString(input.claimId),
        text: normalizeRequiredString(input.claimText),
        confidenceBps: normalizeNullableInteger(input.claimConfidenceBps),
      },
      critiqueMode: input.critiqueMode ?? "direct",
      steelmanText: normalizeOptionalString(input.steelmanText),
      userGoal: normalizeOptionalString(input.userGoal),
      neighboringClaims: (input.neighboringClaims ?? []).map((claim) => ({
        id: normalizeRequiredString(claim.id),
        text: normalizeRequiredString(claim.text),
        confidenceBps: normalizeNullableInteger(claim.confidenceBps),
        relationship: normalizeOptionalString(claim.relationship),
      })),
      previousRounds: (input.previousRounds ?? []).map((round) => ({
        roundId: normalizeRequiredString(round.roundId),
        roundNumber: Math.trunc(round.roundNumber),
        summary: normalizeRequiredString(round.summary),
        userResponse: normalizeOptionalString(round.userResponse),
        responsePath: normalizeOptionalString(round.responsePath),
        confidenceDeltaBps: normalizeNullableInteger(round.confidenceDeltaBps),
      })),
    },
  };

  return {
    promptVersion: PROMPT_VERSION,
    systemPrompt: SYSTEM_PROMPT_TEXT,
    userPrompt: JSON.stringify(structuredInput, null, 2),
    structuredInput,
  };
}

export const buildPrompt = buildGenerateChallengeCritiquePrompt;

const acceptanceInput: GenerateChallengeCritiquePromptInput = {
  mapTitle: "Retention Thesis",
  claimId: "claim-123",
  claimText: "Weekly active usage will keep climbing after the founder removes manual onboarding.",
  claimConfidenceBps: 6200,
  critiqueMode: "direct",
  steelmanText: "Power users adopted quickly during the pilot and reported clear value in week one.",
  userGoal: "Find the fastest way to falsify the retention thesis before rollout.",
  neighboringClaims: [
    {
      id: "claim-124",
      text: "Power users in the pilot received unusually high-touch onboarding.",
      confidenceBps: 7800,
      relationship: "tension",
    },
  ],
  previousRounds: [
    {
      roundId: "round-1",
      roundNumber: 1,
      summary: "The original evidence may be confounded by manual onboarding.",
      userResponse: "I need to check whether self-serve users retained as well.",
      responsePath: "revise",
      confidenceDeltaBps: -900,
    },
  ],
};

const firstAcceptancePrompt = buildGenerateChallengeCritiquePrompt(acceptanceInput);
const secondAcceptancePrompt = buildGenerateChallengeCritiquePrompt(acceptanceInput);

if (JSON.stringify(firstAcceptancePrompt) !== JSON.stringify(secondAcceptancePrompt)) {
  throw new Error("buildGenerateChallengeCritiquePrompt must return deterministic structured input.");
}
