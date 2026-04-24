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
  bodyPreview: string;
  confidenceLabel: string;
  confidenceBps: number | null;
  mapId: string | null;
  createdAtLabel: string;
  updatedAtLabel: string;
  isSelected: boolean;
};

export type BrainRelatedClaimPreview = {
  id: string;
  title: string;
  confidenceLabel: string;
  brainMapHref: string;
};

export type BrainInspectorItem = {
  id: string;
  title: string;
  detail: string;
};

export type BrainSelectedClaimPanel = {
  title: string;
  body: string;
  confidenceLabel: string;
  dependenciesLabel: string;
  relatedClaims: BrainRelatedClaimPreview[];
  brainMapHref: string;
};

export type BrainSphereAffordance = {
  id: string;
  label: string;
  description: string;
  isSelected: boolean;
};

export type BrainSessionAffordance = {
  id: string;
  title: string;
  summary: string;
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
  selectedPanel: BrainSelectedClaimPanel | null;
  sphere: {
    workSphere: BrainSphereAffordance;
    recentSessions: BrainSessionAffordance[];
    selectedSessionId: string | null;
  };
  recentThoughts: BrainThoughtViewModel[];
  inspector: {
    status: string;
    selectedId: string | null;
    mapId: string | null;
    confidenceLabel: string;
    updatedAtLabel: string;
    keyConnections: BrainInspectorItem[];
    dependencies: BrainInspectorItem[];
    contradictionMarkers: BrainInspectorItem[];
    recentActivity: BrainInspectorItem[];
  };
};
