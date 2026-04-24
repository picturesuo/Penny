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

export type LearnExperienceStateId = "placeholder" | "active_concept" | "feedback_shown" | "loading" | "error";

export type LearnExperienceState = {
  id: LearnExperienceStateId;
  title: string;
  body: string;
};

export type LearnExperienceViewModel = {
  experienceState: LearnExperienceState;
  heroTitle: string;
  heroDetail: string;
  concept: {
    title: string;
    explanation: string;
  };
  selectedClaim: {
    body: string;
    confidenceLabel: string;
    confidenceBps: number | null;
  } | null;
  teachBackPrompt: string;
  feedback: {
    title: string;
    body: string;
  };
  practiceSteps: Array<{
    title: string;
    body: string;
  }>;
  retrievalCards: Array<{
    title: string;
    prompt: string;
  }>;
  relatedIdeas: Array<{
    title: string;
    body: string;
  }>;
  brainMiniMap: {
    current: string;
    neighbors: string[];
  };
  switchConcept: {
    label: string;
    disabled: true;
  };
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

function buildConceptTitle(selectedClaim: LearnClaimView | null, fallback: string): string {
  if (!selectedClaim) {
    return fallback;
  }

  const firstSentence = selectedClaim.body.split(/[.!?]/)[0]?.trim();

  if (firstSentence && firstSentence.length <= 72) {
    return firstSentence;
  }

  return `${selectedClaim.body.slice(0, 69).trim()}...`;
}

function buildLearnExperienceState(input: {
  selectedClaim: LearnClaimView | null;
  status: string;
  message: string;
}): LearnExperienceState {
  if (input.status === "loading") {
    return {
      id: "loading",
      title: "Loading concept",
      body: "Penny is reading the current Learn projection.",
    };
  }

  if (input.status === "error") {
    return {
      id: "error",
      title: "Learn unavailable",
      body: input.message || "Penny could not load this Learn concept.",
    };
  }

  if (!input.selectedClaim) {
    return {
      id: "placeholder",
      title: "Placeholder",
      body: "Select a claim before Learn can build an active concept.",
    };
  }

  return {
    id: "active_concept",
    title: "Active concept",
    body: "A concept is selected and ready for teach-back.",
  };
}

export function getVisibleLearnState(baseState: LearnExperienceState, teachBack: string): LearnExperienceState {
  if (baseState.id !== "active_concept" || !teachBack.trim()) {
    return baseState;
  }

  return {
    id: "feedback_shown",
    title: "Feedback shown",
    body: "Penny is responding to the current teach-back draft.",
  };
}

export function buildLearnExperienceViewModel(view: LearnProjectionView): LearnExperienceViewModel {
  const selectedClaim = view.selectedClaim;
  const status = view.status ?? view.learnState.status;
  const message = view.message ?? view.learnState.message;
  const conceptTitle = buildConceptTitle(selectedClaim, "No concept selected");
  const conceptExplanation = selectedClaim
    ? selectedClaim.body
    : "Choose a claim from Brain or Challenge so Learn can turn it into a teach-back concept.";

  return {
    experienceState: buildLearnExperienceState({
      selectedClaim,
      status,
      message,
    }),
    heroTitle: selectedClaim ? conceptTitle : message,
    heroDetail: selectedClaim
      ? "Turn the claim into a short explanation, then check whether it still holds when examples and edge cases move."
      : "Select a claim in Brain or Challenge to start a Learn pass.",
    concept: {
      title: conceptTitle,
      explanation: conceptExplanation,
    },
    selectedClaim: selectedClaim
      ? {
          body: selectedClaim.body,
          confidenceLabel: formatConfidence(selectedClaim.confidenceBps),
          confidenceBps: typeof selectedClaim.confidenceBps === "number" ? selectedClaim.confidenceBps : null,
        }
      : null,
    teachBackPrompt: selectedClaim
      ? `Explain this claim in your own words: ${selectedClaim.body}`
      : "Select a claim before writing a teach-back.",
    feedback: {
      title: selectedClaim ? "Penny feedback" : "Penny feedback pending",
      body: selectedClaim
        ? "Write a teach-back that explains the concept, gives one concrete example, and names the edge case you would watch."
        : "Select a concept before Penny can compare your explanation against the source claim.",
    },
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
    relatedIdeas: [
      {
        title: "Source claim",
        body: selectedClaim ? selectedClaim.body : "No source claim selected.",
      },
      {
        title: "Evidence to recall",
        body: "Name the observation that would make this concept easier to trust.",
      },
      {
        title: "Challenge memory",
        body: "Bring forward the counterargument before using this concept in a decision.",
      },
    ],
    brainMiniMap: {
      current: conceptTitle,
      neighbors: [
        view.selectedMapId ? `Map ${view.selectedMapId}` : "No map selected",
        view.selectedClaimId ? `Claim ${view.selectedClaimId}` : "No claim selected",
        "Challenge memory",
      ],
    },
    switchConcept: {
      label: "Switch concept",
      disabled: true,
    },
    reviewState: {
      status,
      mapLabel: view.selectedMapId ?? "No map selected",
      claimLabel: view.selectedClaimId ?? "No claim selected",
    },
  };
}
