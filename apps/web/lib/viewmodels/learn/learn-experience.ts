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

function readClaimBody(selectedClaim: LearnClaimView | null): string {
  return selectedClaim?.body?.trim() || "Untitled claim";
}

function buildConceptTitle(selectedClaim: LearnClaimView | null, fallback: string): string {
  if (!selectedClaim) {
    return fallback;
  }

  const body = readClaimBody(selectedClaim);
  const firstSentence = body.split(/[.!?]/)[0]?.trim();

  if (firstSentence && firstSentence.length <= 72) {
    return firstSentence;
  }

  return `${body.slice(0, 69).trim()}...`;
}

function buildLearnExperienceState(input: {
  selectedClaim: LearnClaimView | null;
  status: string;
  message: string;
}): LearnExperienceState {
  if (input.status === "loading") {
    return {
      id: "loading",
      title: "Loading Learn",
      body: "Loading the current claim.",
    };
  }

  if (input.status === "error") {
    return {
      id: "error",
      title: "Learn unavailable",
      body: input.message || "Penny could not load this claim.",
    };
  }

  if (!input.selectedClaim) {
    return {
      id: "placeholder",
      title: "Select a claim",
      body: "Learn needs one claim to explain.",
    };
  }

  return {
    id: "active_concept",
    title: "Ready to explain",
    body: "Write the idea in your own words.",
  };
}

export function getVisibleLearnState(baseState: LearnExperienceState, teachBack: string): LearnExperienceState {
  if (baseState.id !== "active_concept" || !teachBack.trim()) {
    return baseState;
  }

  return {
    id: "feedback_shown",
    title: "Draft ready",
    body: "Check the example and the edge case.",
  };
}

export function buildLearnExperienceViewModel(view: LearnProjectionView): LearnExperienceViewModel {
  const selectedClaim = view.selectedClaim;
  const selectedClaimBody = readClaimBody(selectedClaim);
  const status = view.status ?? view.learnState.status;
  const message = view.message ?? view.learnState.message;
  const conceptTitle = buildConceptTitle(selectedClaim, "No concept selected");
  const conceptExplanation = selectedClaim
    ? selectedClaimBody
    : "Choose a claim from Brain or Challenge to start.";

  return {
    experienceState: buildLearnExperienceState({
      selectedClaim,
      status,
      message,
    }),
    heroTitle: selectedClaim ? conceptTitle : message,
    heroDetail: selectedClaim
      ? "Explain the claim, then test it with an example and an edge case."
      : "Select a claim in Brain or Challenge to start a Learn pass.",
    concept: {
      title: conceptTitle,
      explanation: conceptExplanation,
    },
    selectedClaim: selectedClaim
      ? {
          body: selectedClaimBody,
          confidenceLabel: formatConfidence(selectedClaim.confidenceBps),
          confidenceBps: typeof selectedClaim.confidenceBps === "number" ? selectedClaim.confidenceBps : null,
        }
      : null,
    teachBackPrompt: selectedClaim
      ? `Explain this in your own words: ${selectedClaimBody}`
      : "Select a claim before writing a teach-back.",
    feedback: {
      title: selectedClaim ? "Review" : "Review pending",
      body: selectedClaim
        ? "Name the idea, one concrete example, and the edge case that would weaken it."
        : "Select a claim before Penny can compare your explanation.",
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
        prompt: "What changed your confidence?",
      },
      {
        title: "Tension",
        prompt: "Which objection should you remember before using this claim?",
      },
    ],
    relatedIdeas: [
      {
        title: "Source claim",
        body: selectedClaim ? selectedClaimBody : "No source claim selected.",
      },
      {
        title: "Evidence to recall",
        body: "Name what changed your confidence.",
      },
      {
        title: "Show the tension",
        body: "Bring the strongest objection into the decision.",
      },
    ],
    brainMiniMap: {
      current: conceptTitle,
      neighbors: [
        view.selectedMapId ? `Map ${view.selectedMapId}` : "No map selected",
        view.selectedClaimId ? `Claim ${view.selectedClaimId}` : "No claim selected",
        "Show the tension",
      ],
    },
    switchConcept: {
      label: "Switch claim",
      disabled: true,
    },
    reviewState: {
      status,
      mapLabel: view.selectedMapId ?? "No map selected",
      claimLabel: view.selectedClaimId ?? "No claim selected",
    },
  };
}
