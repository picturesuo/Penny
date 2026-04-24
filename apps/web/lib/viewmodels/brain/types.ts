export type BrainProjectionContext = {
  mode: string;
  mapId: string | null;
  claimId: string | null;
};

export type BrainProjectionClaim = {
  id: string;
  mapId?: string;
  userId?: string;
  body: string;
  confidenceBps?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type BrainProjectionView = {
  currentContext?: BrainProjectionContext;
  workspaceContext?: BrainProjectionContext;
  mapSummary: {
    id: string;
    title: string;
    claimCount: number;
  } | null;
  claims: BrainProjectionClaim[];
  selectedClaim: BrainProjectionClaim | null;
  recentEvents?: unknown[];
};

export type BrainThoughtViewModel = {
  id: string;
  title: string;
  body: string;
  confidenceLabel: string;
  confidenceBps: number | null;
  mapId: string | null;
  createdAtLabel: string;
  updatedAtLabel: string;
  isSelected: boolean;
};

export type BrainViewModel = {
  context: {
    mode: string;
    mapId: string | null;
    claimId: string | null;
    mapTitle: string;
    sphereLabel: string;
    claimCountLabel: string;
  };
  stream: BrainThoughtViewModel[];
  selectedThought: BrainThoughtViewModel | null;
  recentThoughts: BrainThoughtViewModel[];
  inspector: {
    status: string;
    selectedId: string | null;
    mapId: string | null;
    confidenceLabel: string;
    updatedAtLabel: string;
  };
};
