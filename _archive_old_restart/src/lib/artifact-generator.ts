import type { ArtifactContent, Claim, DialecticRound, SteelMan } from "@/types/mvp-core";

export type ChallengeSummaryInput = {
  claim: Pick<Claim, "id" | "text" | "confidence">;
  rounds: Array<
    Pick<
      DialecticRound,
      | "roundNumber"
      | "critiqueGenerated"
      | "critiqueFailureTypes"
      | "userResponse"
      | "responseClassification"
      | "confidenceAtRoundStart"
      | "confidenceAtRoundEnd"
      | "confidenceDelta"
      | "followUpPrompt"
    >
  >;
  steelMan: Pick<SteelMan, "steelManText"> | null;
  mapTitle: string;
};

function truncate(text: string, maxLength: number) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatFailureType(value: string) {
  return value.replace(/_/g, " ");
}

function formatClassification(value: string) {
  return value.replace(/_/g, " ");
}

function formatConfidenceDelta(delta: number) {
  if (delta === 0) {
    return "unchanged";
  }

  return `${delta > 0 ? "+" : ""}${delta}%`;
}

export function generateChallengeSummary(input: ChallengeSummaryInput): ArtifactContent {
  const completedRounds = input.rounds.filter((round) => round.userResponse.trim().length > 0);
  const firstRound = input.rounds[0] ?? null;
  const lastCompletedRound = completedRounds[completedRounds.length - 1] ?? input.rounds[input.rounds.length - 1] ?? null;
  const initialConfidence = firstRound?.confidenceAtRoundStart ?? input.claim.confidence;
  const finalConfidence = lastCompletedRound?.confidenceAtRoundEnd ?? input.claim.confidence;
  const totalDelta = finalConfidence - initialConfidence;
  const lastFollowUp = [...completedRounds].reverse().find((round) => round.followUpPrompt?.trim().length);

  const challengeBody =
    input.rounds.length > 0
      ? input.rounds
          .map((round) => {
            const lines = [
              `Round ${round.roundNumber}: ${truncate(round.critiqueGenerated, 280)}`,
              round.critiqueFailureTypes.length > 0
                ? `Pressure point: ${round.critiqueFailureTypes.map(formatFailureType).join(", ")}`
                : "Pressure point: not specified",
            ];

            return lines.join("\n");
          })
          .join("\n\n")
      : "No challenge rounds were recorded yet.";

  const responseBody =
    completedRounds.length > 0
      ? completedRounds
          .map((round) => {
            const lines = [
              `Round ${round.roundNumber}: ${formatClassification(round.responseClassification.type)}`,
              `"${truncate(round.userResponse, 280)}"`,
              `Confidence: ${round.confidenceAtRoundStart}% -> ${round.confidenceAtRoundEnd}% (${formatConfidenceDelta(round.confidenceDelta)})`,
            ];

            return lines.join("\n");
          })
          .join("\n\n")
      : "No response has been recorded yet.";

  return {
    sections: [
      {
        id: "claim",
        title: "The claim",
        body: `"${input.claim.text}"\n\nInitial confidence: ${initialConfidence}%`,
        sourceClaimIds: [input.claim.id],
        sectionType: "claim",
      },
      {
        id: "steel_man",
        title: "Strongest opposing view",
        body: input.steelMan?.steelManText ?? "No steel man was written yet.",
        sourceClaimIds: [input.claim.id],
        sectionType: "steel_man",
      },
      {
        id: "challenge_history",
        title: "How it was challenged",
        body: challengeBody,
        sourceClaimIds: [input.claim.id],
        sectionType: "challenge_history",
      },
      {
        id: "response_history",
        title: "What you said back",
        body: responseBody,
        sourceClaimIds: [input.claim.id],
        sectionType: "response_history",
      },
      {
        id: "updated_position",
        title: "What changed",
        body:
          completedRounds.length > 0
            ? `After ${completedRounds.length} challenge round${completedRounds.length === 1 ? "" : "s"}: ${finalConfidence}% confident (${formatConfidenceDelta(totalDelta)} from initial).`
            : `Confidence remains ${finalConfidence}% because no challenge response has been completed yet.`,
        sourceClaimIds: [input.claim.id],
        sectionType: "updated_position",
      },
      {
        id: "next_move",
        title: "Next move",
        body: lastFollowUp?.followUpPrompt?.trim().length ? lastFollowUp.followUpPrompt.trim() : "No next move was captured yet.",
        sourceClaimIds: [input.claim.id],
        sectionType: "next_move",
      },
    ],
    metadata: {
      mapTitle: input.mapTitle,
      claimId: input.claim.id,
      claimText: input.claim.text,
      initialConfidence,
      finalConfidence,
      confidenceDelta: totalDelta,
      roundCount: input.rounds.length,
      completedRoundCount: completedRounds.length,
      generatedAt: new Date().toISOString(),
    },
  };
}
