import type { GraphModel } from "../../lib/types/graph";
import type { BrainView, ChallengeView, LearnView, ShellView } from "../../lib/types/workspace";
import { createBrainGraph, createChallengeGraph, createLearnGraph } from "./graph-adapters";

const now = "2026-04-24T12:00:00.000Z";

export const mockShellView: ShellView = {
  mode: "challenge",
  mapId: "mock-map-investor-memo",
  claimId: "mock-claim-distribution",
  breadcrumb: [
    {
      kind: "map",
      id: "mock-map-investor-memo",
      label: "Investor memo",
    },
    {
      kind: "claim",
      id: "mock-claim-distribution",
      label: "Distribution is the durable moat",
    },
  ],
  breadcrumbItems: [
    {
      kind: "map",
      id: "mock-map-investor-memo",
      label: "Investor memo",
    },
    {
      kind: "claim",
      id: "mock-claim-distribution",
      label: "Distribution is the durable moat",
    },
  ],
};

export const mockBrainView: BrainView = {
  currentContext: {
    mode: "brain",
    mapId: "mock-map-investor-memo",
    claimId: "mock-claim-distribution",
  },
  workspaceContext: {
    mode: "brain",
    mapId: "mock-map-investor-memo",
    claimId: "mock-claim-distribution",
  },
  mapSummary: {
    id: "mock-map-investor-memo",
    title: "Investor memo",
    claimCount: 4,
  },
  claims: [
    {
      id: "mock-claim-retention",
      mapId: "mock-map-investor-memo",
      body: "Retention is improving because the workflow is becoming habitual.",
      confidenceBps: 6800,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "mock-claim-distribution",
      mapId: "mock-map-investor-memo",
      body: "Distribution is the durable moat.",
      confidenceBps: 7400,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "mock-claim-onboarding",
      mapId: "mock-map-investor-memo",
      body: "Onboarding friction is masking stronger activation.",
      confidenceBps: 5900,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "mock-claim-pricing",
      mapId: "mock-map-investor-memo",
      body: "Pricing can move upward once team workflows replace solo use.",
      confidenceBps: 6300,
      createdAt: now,
      updatedAt: now,
    },
  ],
  selectedClaim: {
    id: "mock-claim-distribution",
    mapId: "mock-map-investor-memo",
    body: "Distribution is the durable moat.",
    confidenceBps: 7400,
    createdAt: now,
    updatedAt: now,
  },
  recentEvents: [],
};

export const mockChallengeView: ChallengeView = {
  shellContext: mockShellView,
  currentContext: mockShellView,
  workspaceContext: mockShellView,
  activeClaim: mockBrainView.selectedClaim,
  selectedClaim: mockBrainView.selectedClaim,
  activeChallengeRound: {
    id: "mock-round-distribution",
    mapId: "mock-map-investor-memo",
    claimId: "mock-claim-distribution",
    status: "responded",
    createdAt: now,
    updatedAt: now,
  },
  latestChallengeRound: {
    id: "mock-round-distribution",
    mapId: "mock-map-investor-memo",
    claimId: "mock-claim-distribution",
    status: "responded",
    createdAt: now,
    updatedAt: now,
  },
  critiqueState: {
    status: "ready",
    critiqueId: "mock-critique-distribution",
    body: "The moat claim depends on whether acquisition channels stay defensible once competitors copy the message.",
    provider: "mock",
    model: "mock-graph",
    promptVersion: "mock-v1",
  },
  critiqueStatus: "ready",
  responseState: {
    status: "responded",
    responsePayload: {
      response: "I would watch whether branded search and referral share keep rising after paid spend normalizes.",
      responsePath: "direct",
    },
  },
  responseStatus: "responded",
  responsePayload: {
    response: "I would watch whether branded search and referral share keep rising after paid spend normalizes.",
    responsePath: "direct",
  },
};

export const mockLearnView: LearnView = {
  shellContext: mockShellView,
  workspaceContext: {
    ...mockShellView,
    mode: "learn",
  },
  selectedMapId: "mock-map-investor-memo",
  selectedClaimId: "mock-claim-distribution",
  selectedClaim: mockBrainView.selectedClaim,
  learnState: {
    status: "placeholder",
    message: "Learn mode coming soon",
  },
  status: "placeholder",
  message: "Learn mode coming soon",
};

export const mockBrainGraph = createBrainGraph(mockBrainView);
export const mockChallengeGraph = createChallengeGraph(mockChallengeView);
export const mockLearnGraph = createLearnGraph(mockLearnView);

export const mockGraph: GraphModel = {
  id: "mock-graph-combined",
  title: "Mock investor memo graph",
  selectedNodeId: "mock-claim-distribution",
  nodes: [
    {
      id: "mock-map-investor-memo",
      label: "Investor memo",
      kind: "map",
      cluster: "map",
      type: "map",
      description: "4 claims",
      x: -245,
      y: 0,
    },
    {
      id: "mock-claim-distribution",
      label: "Distribution is the durable moat",
      kind: "claim",
      cluster: "claim",
      type: "claim",
      confidence: 74,
      confidenceBps: 7400,
      activityAt: now,
      status: "selected",
      x: -70,
      y: -30,
    },
    {
      id: "mock-claim-onboarding",
      label: "Onboarding friction masks activation",
      kind: "claim",
      cluster: "claim",
      type: "claim",
      confidence: 59,
      confidenceBps: 5900,
      activityAt: now,
      x: -75,
      y: 118,
    },
    {
      id: "mock-round-distribution",
      label: "Challenge round",
      kind: "round",
      cluster: "challenge",
      type: "session",
      status: "responded",
      activityAt: now,
      x: 120,
      y: -92,
    },
    {
      id: "mock-critique-distribution",
      label: "Critique ready",
      kind: "critique",
      cluster: "critique",
      type: "thought",
      status: "contradiction",
      x: 304,
      y: -132,
    },
    {
      id: "mock-response-distribution",
      label: "Response recorded",
      kind: "response",
      cluster: "event",
      type: "session",
      status: "responded",
      activityAt: now,
      x: 290,
      y: 68,
    },
    {
      id: "mock-learn-placeholder",
      label: "Learn mode coming soon",
      kind: "learn",
      cluster: "learn",
      type: "thought",
      status: "placeholder",
      x: 108,
      y: 144,
    },
  ],
  edges: [
    {
      id: "mock-map-investor-memo:mock-claim-distribution",
      source: "mock-map-investor-memo",
      target: "mock-claim-distribution",
      label: "contains",
      type: "related",
      strength: 1.25,
    },
    {
      id: "mock-map-investor-memo:mock-claim-onboarding",
      source: "mock-map-investor-memo",
      target: "mock-claim-onboarding",
      label: "contains",
      type: "related",
    },
    {
      id: "mock-claim-distribution:mock-claim-onboarding",
      source: "mock-claim-distribution",
      target: "mock-claim-onboarding",
      label: "depends on",
      type: "depends_on",
      status: "dependency",
      strength: 1.08,
    },
    {
      id: "mock-claim-distribution:mock-round-distribution",
      source: "mock-claim-distribution",
      target: "mock-round-distribution",
      label: "challenged by",
      type: "related",
      strength: 1.2,
    },
    {
      id: "mock-round-distribution:mock-critique-distribution",
      source: "mock-round-distribution",
      target: "mock-critique-distribution",
      label: "requests",
      type: "contradicts",
      status: "contradiction",
    },
    {
      id: "mock-round-distribution:mock-response-distribution",
      source: "mock-round-distribution",
      target: "mock-response-distribution",
      label: "answered by",
      type: "related",
    },
    {
      id: "mock-claim-distribution:mock-learn-placeholder",
      source: "mock-claim-distribution",
      target: "mock-learn-placeholder",
      label: "feeds",
      type: "supports",
    },
  ],
};

export const mockGraphs = {
  brain: mockBrainGraph,
  challenge: mockChallengeGraph,
  learn: mockLearnGraph,
  combined: mockGraph,
} as const;
