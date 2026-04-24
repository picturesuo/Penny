export type LearnClaimView = {
  id: string;
  body: string;
  confidenceBps?: number | null;
};

export type LearnProjectionView = {
  selectedMapId: string | null;
  selectedClaimId: string | null;
  selectedClaim: LearnClaimView | null;
  learnState: {
    status: string;
    message: string;
  };
  status: string;
  message?: string;
};

export type LearnExperienceViewModel = {
  heroTitle: string;
  heroDetail: string;
  selectedClaim: {
    body: string;
    confidenceLabel: string;
  } | null;
  teachBackPrompt: string;
  practiceSteps: Array<{
    title: string;
    body: string;
  }>;
  retrievalCards: Array<{
    title: string;
    prompt: string;
  }>;
  reviewState: {
    status: string;
    mapLabel: string;
    claimLabel: string;
  };
};

function formatConfidence(confidenceBps: number | null | undefined): string {
  if (typeof confidenceBps !== "number") {
    return "No confidence recorded";
  }

  return `${Math.round(confidenceBps / 100)}% confidence`;
}

export function buildLearnExperienceViewModel(view: LearnProjectionView): LearnExperienceViewModel {
  const selectedClaim = view.selectedClaim;
  const status = view.status ?? view.learnState.status;
  const message = view.message ?? view.learnState.message;

  return {
    heroTitle: selectedClaim ? "Teach back the selected claim" : message,
    heroDetail: selectedClaim
      ? "Turn the claim into a short explanation, then check whether it still holds when examples and edge cases move."
      : "Select a claim in Brain or Challenge to start a Learn pass.",
    selectedClaim: selectedClaim
      ? {
          body: selectedClaim.body,
          confidenceLabel: formatConfidence(selectedClaim.confidenceBps),
        }
      : null,
    teachBackPrompt: selectedClaim
      ? `Explain this claim in your own words: ${selectedClaim.body}`
      : "Select a claim before writing a teach-back.",
    practiceSteps: [
      {
        title: "Explain",
        body: "State the claim plainly without copying the original wording.",
      },
      {
        title: "Example",
        body: "Name one concrete situation where the claim should work.",
      },
      {
        title: "Edge case",
        body: "Name the condition that would make the claim weaker or false.",
      },
    ],
    retrievalCards: [
      {
        title: "Plain-language recall",
        prompt: "What is the claim saying if you had to teach it to a smart teammate?",
      },
      {
        title: "Evidence hook",
        prompt: "What observation would make you more confident this claim is true?",
      },
      {
        title: "Challenge memory",
        prompt: "Which counterargument should you remember before using this claim?",
      },
    ],
    reviewState: {
      status,
      mapLabel: view.selectedMapId ?? "No map selected",
      claimLabel: view.selectedClaimId ?? "No claim selected",
    },
  };
}
