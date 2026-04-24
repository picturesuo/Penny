import type {
  ChallengeCritiqueProviderName,
  GenerateChallengeCritiqueOutput,
  StructuredProviderCost,
  StructuredProviderUsage,
} from "./generateChallengeCritique.ts";

export type ChallengeCritiqueResultStatus = "succeeded" | "failed";

export type ChallengeCritiqueResultMetadata = {
  cost?: StructuredProviderCost | null;
  environment?: string | null;
  fallbackHopCount?: number | null;
  latencyMs?: number | null;
  observationId?: string | null;
  release?: string | null;
  repairAttempted?: boolean | null;
  routeTier?: string | null;
  traceId?: string | null;
  usage?: StructuredProviderUsage | null;
  validationResult?: "valid" | "repaired_valid" | null;
  [key: string]: unknown;
};

export type ChallengeCritiqueResult = {
  roundId?: string;
  status: ChallengeCritiqueResultStatus;
  critiqueJson: GenerateChallengeCritiqueOutput | null;
  provider: ChallengeCritiqueProviderName | string | null;
  model: string | null;
  promptVersion: string;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: ChallengeCritiqueResultMetadata;
};

export type ChallengeCritiqueSucceededResult = ChallengeCritiqueResult & {
  status: "succeeded";
  critiqueJson: GenerateChallengeCritiqueOutput;
  errorCode: null;
  errorMessage: null;
};

export type ChallengeCritiqueFailedResult = ChallengeCritiqueResult & {
  status: "failed";
  critiqueJson: null;
  errorCode: string;
  errorMessage: string;
};
