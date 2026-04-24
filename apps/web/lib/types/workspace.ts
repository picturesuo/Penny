export type WorkspaceMode = "brain" | "challenge" | "learn";

export type WorkspaceCommandMode = "Brain" | "Challenge" | "Learn";

export type BreadcrumbItem = {
  kind: "map" | "claim";
  id: string;
  label: string;
};

export type WorkspaceContext = {
  mode: WorkspaceMode | string;
  mapId: string | null;
  claimId: string | null;
};

export type ShellView = WorkspaceContext & {
  breadcrumb: BreadcrumbItem[];
  breadcrumbItems: BreadcrumbItem[];
};

export type ClaimView = {
  id: string;
  mapId?: string;
  userId?: string;
  body: string;
  confidenceBps?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type BrainView = {
  currentContext: WorkspaceContext;
  workspaceContext: WorkspaceContext;
  mapSummary: {
    id: string;
    title: string;
    claimCount: number;
  } | null;
  claims: ClaimView[];
  selectedClaim: ClaimView | null;
  recentEvents: unknown[];
};

export type ChallengeRoundView = {
  id: string;
  mapId?: string;
  claimId?: string;
  userId?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ChallengeCritiqueState =
  | {
      status: "not_requested";
      critiqueId: null;
    }
  | {
      status: "pending" | "failed";
      critiqueId: string;
      critiquePayload?: unknown;
      provider?: string;
      model?: string;
      promptVersion?: string;
    }
  | {
      status: "ready";
      critiqueId: string;
      body: string;
      critiquePayload?: unknown;
      provider?: string;
      model?: string;
      promptVersion?: string;
    };

export type ChallengeResponseState = {
  status: string;
  responsePayload?: Record<string, unknown>;
};

export type ChallengeView = {
  shellContext: ShellView;
  currentContext: ShellView;
  workspaceContext: ShellView;
  activeClaim: ClaimView | null;
  selectedClaim: ClaimView | null;
  activeChallengeRound: ChallengeRoundView | null;
  latestChallengeRound: ChallengeRoundView | null;
  critiqueState: ChallengeCritiqueState;
  critiqueStatus: ChallengeCritiqueState["status"];
  critiquePayload?: unknown;
  responseState: ChallengeResponseState;
  responseStatus: string;
  responsePayload?: Record<string, unknown>;
};

export type LearnView = {
  shellContext: ShellView;
  workspaceContext: ShellView;
  selectedMapId: string | null;
  selectedClaimId: string | null;
  selectedClaim: ClaimView | null;
  learnState: {
    status: "placeholder" | string;
    message: string;
  };
  status: "placeholder" | string;
  message?: string;
};

export type WorkspaceViewByMode = {
  brain: BrainView;
  challenge: ChallengeView;
  learn: LearnView;
};

export type WorkspaceProjectionView = WorkspaceViewByMode[WorkspaceMode];

export function toWorkspaceCommandMode(mode: WorkspaceMode): WorkspaceCommandMode {
  if (mode === "challenge") {
    return "Challenge";
  }

  if (mode === "learn") {
    return "Learn";
  }

  return "Brain";
}
