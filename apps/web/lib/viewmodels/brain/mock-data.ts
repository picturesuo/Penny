import type { BrainProjectionView } from "./types";

export function createEmptyBrainProjection(): BrainProjectionView {
  return {
    currentContext: {
      mode: "brain",
      mapId: null,
      claimId: null,
    },
    workspaceContext: {
      mode: "brain",
      mapId: null,
      claimId: null,
    },
    mapSummary: null,
    claims: [],
    selectedClaim: null,
    recentEvents: [],
  };
}

export function createMockBrainProjection(): BrainProjectionView {
  const selectedClaim = {
    id: "mock-claim-founder-proof",
    mapId: "mock-map-investor-readiness",
    userId: "mock-user-brain",
    body: "Penny should make every investor-facing claim traceable to the original thought and its challenge history.",
    confidenceBps: 7800,
    createdAt: "2026-04-24T13:00:00.000Z",
    updatedAt: "2026-04-24T13:42:00.000Z",
  };

  return {
    currentContext: {
      mode: "brain",
      mapId: "mock-map-investor-readiness",
      claimId: selectedClaim.id,
    },
    workspaceContext: {
      mode: "brain",
      mapId: "mock-map-investor-readiness",
      claimId: selectedClaim.id,
    },
    mapSummary: {
      id: "mock-map-investor-readiness",
      title: "Investor readiness",
      claimCount: 4,
    },
    claims: [
      selectedClaim,
      {
        id: "mock-claim-onboarding",
        mapId: "mock-map-investor-readiness",
        userId: "mock-user-brain",
        body: "Founder onboarding should start with one raw decision journal, not a blank knowledge graph.",
        confidenceBps: 6900,
        createdAt: "2026-04-24T12:35:00.000Z",
        updatedAt: "2026-04-24T13:20:00.000Z",
      },
      {
        id: "mock-claim-audit",
        mapId: "mock-map-investor-readiness",
        userId: "mock-user-brain",
        body: "The audit trail is the product surface that makes Brain, Challenge, and Learn feel like one loop.",
        confidenceBps: 8400,
        createdAt: "2026-04-24T11:55:00.000Z",
        updatedAt: "2026-04-24T13:08:00.000Z",
      },
      {
        id: "mock-claim-demo",
        mapId: "mock-map-investor-readiness",
        userId: "mock-user-brain",
        body: "The MVP demo should prioritize state continuity over generative polish.",
        confidenceBps: 7200,
        createdAt: "2026-04-24T11:10:00.000Z",
        updatedAt: "2026-04-24T12:50:00.000Z",
      },
    ],
    selectedClaim,
    recentEvents: [],
  };
}

export function shouldUseMockBrainData(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("mock") ?? params.get("brainMock");

  return value === "1" || value === "true";
}
