export type ChallengeClaimView = {
  id: string;
  body: string;
  confidenceBps?: number | null;
};

export type ChallengeRoundView = {
  id: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ChallengeCritiqueStateView = {
  status: string;
  critiqueId: string | null;
  body?: string;
  critiquePayload?: unknown;
  provider?: string;
  model?: string;
  promptVersion?: string;
};

export type ChallengeResponseStateView = {
  status: string;
  responsePayload?: Record<string, unknown>;
};

export type ChallengeProjectionView = {
  activeClaim: ChallengeClaimView | null;
  selectedClaim?: ChallengeClaimView | null;
  activeChallengeRound: ChallengeRoundView | null;
  critiqueStatus: string;
  critiqueState?: ChallengeCritiqueStateView;
  critiquePayload?: unknown;
  responseState?: ChallengeResponseStateView;
  responseStatus?: string;
  responsePayload?: Record<string, unknown>;
};

export type ChallengeResponseAction = {
  id: "defend" | "revise" | "absorb";
  label: string;
  prompt: string;
};

export type ChallengeExperienceStateId = "no_round_yet" | "round_started" | "critique_pending" | "critique_loaded" | "critique_failed";

export type ChallengeExperienceState = {
  id: ChallengeExperienceStateId;
  title: string;
  body: string;
  primaryAction: "start_challenge" | "request_critique" | "wait_for_critique" | "respond" | "retry_critique";
};

export type ChallengeExperienceViewModel = {
  challengeState: ChallengeExperienceState;
  selectedClaim: {
    body: string;
    confidenceLabel: string;
    confidenceBps: number | null;
  } | null;
  round: {
    id: string;
    status: string;
  } | null;
  strongestCounterargument: string;
  keyWeaknessSummary: string;
  whatsAtStake: {
    summary: string;
    items: string[];
  };
  critiqueTransparency: {
    status: string;
    critiqueId: string | null;
    provider: string;
    model: string;
    promptVersion: string;
    responseStatus: string;
  };
  dependencyCascade: {
    summary: string;
    assumptions: string[];
    likelyFailureModes: string[];
    followUpQuestions: string[];
  };
  responseActions: ChallengeResponseAction[];
  canStartChallenge: boolean;
  canRequestCritique: boolean;
  canRecordResponse: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(readString).filter((item): item is string => Boolean(item));
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatConfidence(confidenceBps: number | null | undefined): string {
  if (typeof confidenceBps !== "number") {
    return "No confidence recorded";
  }

  return `${Math.round(confidenceBps / 100)}% confidence`;
}

function getCritiquePayload(view: ChallengeProjectionView): Record<string, unknown> | null {
  return asRecord(view.critiqueState?.critiquePayload) ?? asRecord(view.critiquePayload);
}

function getCritiqueRecord(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  return asRecord(payload?.critique) ?? payload;
}

function getMetadata(view: ChallengeProjectionView, payload: Record<string, unknown> | null): Record<string, unknown> {
  const payloadMetadata = asRecord(payload?.metadata);

  return {
    provider: readString(view.critiqueState?.provider) ?? readString(payloadMetadata?.provider) ?? "Not recorded",
    model: readString(view.critiqueState?.model) ?? readString(payloadMetadata?.model) ?? "Not recorded",
    promptVersion: readString(view.critiqueState?.promptVersion) ?? readString(payloadMetadata?.promptVersion) ?? "Not recorded",
  };
}

function buildStakeSummary(input: {
  critique: Record<string, unknown> | null;
  claim: ChallengeClaimView | null;
}): { summary: string; items: string[] } {
  const likelyFailureModes = readStringArray(input.critique?.likelyFailureModes);
  const confidenceDelta = readNumber(input.critique?.suggestedConfidenceDelta);
  const uncertaintyNote = readString(input.critique?.uncertaintyNote);
  const items = [
    ...likelyFailureModes,
    confidenceDelta !== null ? `Suggested confidence move: ${confidenceDelta > 0 ? "+" : ""}${confidenceDelta} points.` : null,
    uncertaintyNote,
  ].filter((item): item is string => Boolean(item));

  if (items.length > 0) {
    return {
      summary: "This challenge is most useful if it changes what the team trusts next.",
      items,
    };
  }

  if (input.claim) {
    return {
      summary: "The claim is selected, but Penny has not generated enough critique detail to name the downstream risk yet.",
      items: ["Request critique to expose assumptions, failure modes, and follow-up questions."],
    };
  }

  return {
    summary: "Select a claim before judging what is at stake.",
    items: ["Challenge mode needs a selected claim from the workspace projection."],
  };
}

function buildChallengeState(input: {
  selectedClaim: ChallengeClaimView | null;
  round: ChallengeRoundView | null;
  critiqueStatus: string;
}): ChallengeExperienceState {
  if (!input.round) {
    return {
      id: "no_round_yet",
      title: input.selectedClaim ? "No challenge round yet" : "Select a claim to start",
      body: input.selectedClaim
        ? "Start a round before asking Penny to pressure-test this claim."
        : "Challenge mode needs a selected claim before it can create a round.",
      primaryAction: "start_challenge",
    };
  }

  if (input.critiqueStatus === "pending") {
    return {
      id: "critique_pending",
      title: "Critique pending",
      body: "Penny has a critique request for this round and is waiting for a generated result.",
      primaryAction: "wait_for_critique",
    };
  }

  if (input.critiqueStatus === "ready") {
    return {
      id: "critique_loaded",
      title: "Critique loaded",
      body: "The critique is ready. Choose whether to defend, revise, or absorb it into the claim.",
      primaryAction: "respond",
    };
  }

  if (input.critiqueStatus === "failed") {
    return {
      id: "critique_failed",
      title: "Critique failed",
      body: "The critique request failed. Retry the critique or record a manual response if the round still has enough context.",
      primaryAction: "retry_critique",
    };
  }

  return {
    id: "round_started",
    title: "Round started",
    body: "The round exists, but no critique has been requested yet.",
    primaryAction: "request_critique",
  };
}

export function buildChallengeExperienceViewModel(view: ChallengeProjectionView): ChallengeExperienceViewModel {
  const selectedClaim = view.activeClaim ?? view.selectedClaim ?? null;
  const payload = getCritiquePayload(view);
  const critique = getCritiqueRecord(payload);
  const metadata = getMetadata(view, payload);
  const assumptions = readStringArray(critique?.assumptions);
  const likelyFailureModes = readStringArray(critique?.likelyFailureModes);
  const followUpQuestions = readStringArray(critique?.followUpQuestions);
  const responseStatus = view.responseState?.status ?? view.responseStatus ?? "not_recorded";
  const critiqueStatus = view.critiqueState?.status ?? view.critiqueStatus;
  const hasRound = Boolean(view.activeChallengeRound);
  const critiqueBody = readString(view.critiqueState?.body);
  const challengeState = buildChallengeState({
    selectedClaim,
    round: view.activeChallengeRound,
    critiqueStatus,
  });
  const strongestCounterargument =
    readString(critique?.strongestCounterargument) ??
    critiqueBody ??
    "Request critique to generate the strongest counterargument for this claim.";
  const keyWeaknessSummary =
    readString(critique?.conciseCritiqueSummary) ??
    readString(critique?.uncertaintyNote) ??
    "No key weakness has been generated yet.";
  const cascadeCount = assumptions.length + likelyFailureModes.length + followUpQuestions.length;

  return {
    challengeState,
    selectedClaim: selectedClaim
      ? {
          body: selectedClaim.body,
          confidenceLabel: formatConfidence(selectedClaim.confidenceBps),
          confidenceBps: typeof selectedClaim.confidenceBps === "number" ? selectedClaim.confidenceBps : null,
        }
      : null,
    round: view.activeChallengeRound
      ? {
          id: view.activeChallengeRound.id,
          status: view.activeChallengeRound.status,
        }
      : null,
    strongestCounterargument,
    keyWeaknessSummary,
    whatsAtStake: buildStakeSummary({ critique, claim: selectedClaim }),
    critiqueTransparency: {
      status: critiqueStatus,
      critiqueId: view.critiqueState?.critiqueId ?? null,
      provider: String(metadata.provider),
      model: String(metadata.model),
      promptVersion: String(metadata.promptVersion),
      responseStatus,
    },
    dependencyCascade: {
      summary:
        cascadeCount > 0
          ? `${cascadeCount} critique signals can cascade into the current claim and its dependencies.`
          : "No dependency cascade has been inferred from this critique yet.",
      assumptions,
      likelyFailureModes,
      followUpQuestions,
    },
    responseActions: [
      {
        id: "defend",
        label: "Defend",
        prompt: "I still defend this claim because ",
      },
      {
        id: "revise",
        label: "Revise",
        prompt: "I would revise this claim to ",
      },
      {
        id: "absorb",
        label: "Absorb",
        prompt: "I absorb this critique and now believe ",
      },
    ],
    canStartChallenge: Boolean(selectedClaim && !hasRound),
    canRequestCritique: Boolean(hasRound && (critiqueStatus === "not_requested" || critiqueStatus === "failed")),
    canRecordResponse: Boolean(hasRound && (critiqueStatus === "ready" || critiqueStatus === "failed")),
  };
}
