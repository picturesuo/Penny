import type { ChallengeGenerationInput, ChallengeGenerationOutput, ChallengeProvider } from "@/lib/ai/challenge-provider";

function summarizeText(text: string, maxLength: number) {
  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildRoundTitle(mode: ChallengeGenerationInput["critiqueMode"], roundNumber: number) {
  if (mode === "socratic") {
    return roundNumber === 1 ? "Socratic opening" : `Socratic round ${roundNumber}`;
  }

  if (mode === "red_team") {
    return roundNumber === 1 ? "Red-team opening" : `Red-team round ${roundNumber}`;
  }

  return roundNumber === 1 ? "Opening critique" : `Round ${roundNumber}`;
}

function buildPrompt(input: ChallengeGenerationInput) {
  const modeLead =
    input.critiqueMode === "socratic"
      ? "Ask the one question that exposes the weakest assumption before offering any explanation."
      : input.critiqueMode === "red_team"
        ? "Attack the structure like a hostile reviewer looking for the fastest credible failure."
        : "Name the sharpest pressure test directly and keep the weak point explicit.";
  const voiceLine = input.selectedVoice ? `Use the voice of ${input.selectedVoice}.` : "";
  const steelManLine = input.steelManText
    ? `Build from this steel man instead of repeating a generic objection: ${summarizeText(input.steelManText, 180)}.`
    : "No steel man is stored yet, so keep the challenge anchored in structure and evidence.";
  const priorLine = input.priorRoundSummaries.length
    ? `Recent thread: ${input.priorRoundSummaries.slice(-2).join(" | ")}.`
    : "This is the first recorded challenge on the claim.";

  return [
    modeLead,
    `Failure type: ${input.critiqueType}.`,
    `Claim in focus: "${input.claimText}"`,
    steelManLine,
    priorLine,
    `Start from ${input.confidenceAtRoundStart}% confidence and make the next move concrete.`,
    voiceLine,
  ]
    .filter((part) => part.trim().length > 0)
    .join(" ");
}

function buildWhy(input: ChallengeGenerationInput) {
  const claimTypeLine = input.targetClaimType ? `Claim shape: ${input.targetClaimType}.` : "Claim shape is still unclassified.";
  return [
    `${input.knowledgeDepthMessage} This pass is targeting ${input.targetDomain}.`,
    claimTypeLine,
    input.summary,
    input.disclosure,
  ]
    .filter((part) => part.trim().length > 0)
    .join(" ");
}

export class MockChallengeProvider implements ChallengeProvider {
  readonly name = "mock" as const;
  readonly label = "Mock AI";
  readonly model = "mock-challenge-v1";

  async generateChallenge(input: ChallengeGenerationInput): Promise<ChallengeGenerationOutput> {
    return {
      title: buildRoundTitle(input.critiqueMode, input.roundNumber),
      prompt: buildPrompt(input),
      why: buildWhy(input),
      critiqueType: input.critiqueType,
      critiqueStrength: input.critiqueStrength,
      voiceLabel: input.selectedVoice,
    };
  }
}
