export const GENERATE_CHALLENGE_CRITIQUE_OPERATION = "generateChallengeCritique" as const;

export const GENERATE_CHALLENGE_CRITIQUE_CONTRACT = {
  operationName: GENERATE_CHALLENGE_CRITIQUE_OPERATION,
  requiredBackendInput: [
    "userId",
    "mapId",
    "claimId",
    "roundId",
    "critiqueId",
    "claimText",
    "claimConfidence",
  ],
  outputFields: [
    "conciseCritiqueSummary",
    "strongestCounterargument",
    "assumptions",
    "likelyFailureModes",
    "followUpQuestions",
    "suggestedConfidenceDelta",
    "uncertaintyNote",
  ],
  persistenceFields: [
    "status",
    "body",
    "critiqueJson",
    "provider",
    "model",
    "promptVersion",
    "traceId",
    "observationId",
    "usage",
    "cost",
    "errorMessage",
  ],
  failureStates: ["input_validation_error", "provider_failure", "output_validation_error", "generation_failed"],
} as const;

export type ChallengeCritiqueProviderName = "anthropic" | "xai";
export type ChallengeCritiqueRouteTier = "default" | "fallback" | "cheap";
export type ChallengeCritiqueQualityTier = "default" | "fallback" | "cheap" | "standard" | "degraded";
export type ChallengeCritiqueMode = "direct" | "socratic" | "red_team";
export type ChallengeResponsePath = "defend" | "revise" | "absorb";

export type GenerateChallengeCritiqueNeighborClaim = {
  id: string;
  text: string;
  confidence?: number | null;
  kind?: string | null;
  relationship?: string | null;
};

export type GenerateChallengeCritiquePreviousRound = {
  roundId: string;
  roundNumber: number;
  critiqueSummary: string;
  userResponse?: string | null;
  responsePath?: ChallengeResponsePath | null;
  confidenceDelta?: number | null;
};

export type GenerateChallengeCritiqueInput = {
  claimId: string;
  claimText: string;
  claimConfidence: number;
  critiqueMode?: ChallengeCritiqueMode | null;
  mapTitle?: string | null;
  neighboringClaims?: GenerateChallengeCritiqueNeighborClaim[] | null;
  previousRounds?: GenerateChallengeCritiquePreviousRound[] | null;
  priorRoundContext?: GenerateChallengeCritiquePreviousRound | GenerateChallengeCritiquePreviousRound[] | null;
  steelmanText?: string | null;
  userGoal?: string | null;
};

export type GenerateChallengeCritiqueBackendInput = GenerateChallengeCritiqueInput & {
  critiqueId: string;
  mapId: string;
  requestId?: string | null;
  roundId: string;
  userId: string;
};

export type GenerateChallengeCritiqueOutput = {
  conciseCritiqueSummary: string;
  strongestCounterargument: string;
  assumptions: string[];
  likelyFailureModes: string[];
  followUpQuestions: string[];
  suggestedConfidenceDelta: number;
  uncertaintyNote: string;
};

export type GenerateChallengeCritiqueContext = {
  claimId?: string | null;
  mapId?: string | null;
  promptVersion?: string | null;
  qualityTier?: ChallengeCritiqueQualityTier | null;
  requestId?: string | null;
  roundId?: string | null;
  sessionId?: string | null;
  tags?: string[];
  userId?: string | null;
  workspaceContextId?: string | null;
};

export type GenerateChallengeCritiqueRoute = {
  model: string;
  promptVersion: string;
  provider: ChallengeCritiqueProviderName;
  tier: string;
};

export type StructuredProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type StructuredProviderCost = {
  currency: string | null;
  totalUsd: number | null;
};

export type StructuredProviderResponse = {
  cost: StructuredProviderCost;
  output: unknown;
  usage: StructuredProviderUsage;
};

export type GenerateChallengeCritiqueResult = {
  meta: {
    cost: StructuredProviderCost;
    environment: string;
    fallbackHopCount: number;
    latencyMs: number;
    model: string;
    observationId: string | null;
    promptVersion: string;
    provider: ChallengeCritiqueProviderName;
    repairAttempted: boolean;
    release: string;
    routeTier: string;
    traceId: string | null;
    usage: StructuredProviderUsage;
    validationResult: "valid" | "repaired_valid";
  };
  output: GenerateChallengeCritiqueOutput;
};

export type GenerateChallengeCritiqueReadyPersistence = {
  status: "ready";
  body: string;
  critiqueJson: GenerateChallengeCritiqueOutput;
  provider: ChallengeCritiqueProviderName | string | null;
  model: string | null;
  promptVersion: string | null;
  traceId?: string | null;
  observationId?: string | null;
  usage?: StructuredProviderUsage | null;
  cost?: StructuredProviderCost | null;
};

export type GenerateChallengeCritiqueFailedPersistence = {
  status: "failed";
  body: null;
  critiqueJson: null;
  errorMessage: string;
};

export type GenerateChallengeCritiquePersistence =
  | GenerateChallengeCritiqueReadyPersistence
  | GenerateChallengeCritiqueFailedPersistence;
