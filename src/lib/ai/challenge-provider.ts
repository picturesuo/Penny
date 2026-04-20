import type { DialecticCritiqueStrength } from "@/types/thought-map";
import { MockChallengeProvider } from "@/lib/ai/mock-challenge-provider";

export type ChallengeProviderName = "mock" | "openai" | "anthropic";
export type ChallengeGenerationStatus = "generated" | "fallback";

export type ChallengeGenerationInput = {
  claimText: string;
  steelManText: string | null;
  critiqueMode: "direct" | "socratic" | "red_team";
  critiqueType: string;
  critiqueStrength: DialecticCritiqueStrength;
  critiqueIntensity: number;
  roundNumber: number;
  selectedVoice: string | null;
  targetDomain: string;
  targetClaimType: string | null;
  knowledgeDepth: string;
  knowledgeDepthMessage: string;
  disclosure: string;
  summary: string;
  confidenceAtRoundStart: number;
  priorRoundSummaries: string[];
};

export type ChallengeGenerationOutput = {
  title: string;
  prompt: string;
  why: string;
  critiqueType: string;
  critiqueStrength: DialecticCritiqueStrength;
  voiceLabel: string | null;
};

export type ChallengeGenerationResult = {
  status: ChallengeGenerationStatus;
  provider: ChallengeProviderName;
  providerLabel: string;
  fallbackReason: string | null;
  output: ChallengeGenerationOutput;
};

export interface ChallengeProvider {
  name: ChallengeProviderName;
  label: string;
  generateChallenge(input: ChallengeGenerationInput): Promise<ChallengeGenerationOutput>;
}

class UnsupportedChallengeProvider implements ChallengeProvider {
  readonly name: ChallengeProviderName;
  readonly label: string;

  constructor(name: Exclude<ChallengeProviderName, "mock">, label: string) {
    this.name = name;
    this.label = label;
  }

  async generateChallenge(): Promise<ChallengeGenerationOutput> {
    throw new Error(`${this.label} is not configured yet for Penny challenge generation.`);
  }
}

function configuredProviderName(): string {
  return (process.env.AI_PROVIDER ?? "mock").trim().toLowerCase();
}

function getPrimaryChallengeProvider(): ChallengeProvider {
  switch (configuredProviderName()) {
    case "anthropic":
      return new UnsupportedChallengeProvider("anthropic", "Anthropic");
    case "openai":
      return new UnsupportedChallengeProvider("openai", "OpenAI");
    case "heuristic":
    case "mock":
    default:
      return new MockChallengeProvider();
  }
}

function getFallbackChallengeProvider() {
  return new MockChallengeProvider();
}

export async function generateChallengeWithFallback(
  input: ChallengeGenerationInput,
): Promise<ChallengeGenerationResult> {
  const primaryProvider = getPrimaryChallengeProvider();

  try {
    const output = await primaryProvider.generateChallenge(input);
    return {
      status: "generated",
      provider: primaryProvider.name,
      providerLabel: primaryProvider.label,
      fallbackReason: null,
      output,
    };
  } catch (error) {
    const fallbackProvider = getFallbackChallengeProvider();

    if (fallbackProvider.name === primaryProvider.name) {
      throw error;
    }

    const output = await fallbackProvider.generateChallenge(input);
    return {
      status: "fallback",
      provider: fallbackProvider.name,
      providerLabel: fallbackProvider.label,
      fallbackReason: error instanceof Error ? error.message : "Challenge provider unavailable.",
      output,
    };
  }
}
