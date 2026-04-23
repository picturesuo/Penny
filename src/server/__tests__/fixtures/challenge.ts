import type { GenerateChallengeCritiqueOutput } from "@/server/ai/schemas/challengeCritique";

export const challengeIds = {
  userId: "11111111-1111-4111-8111-111111111111",
  otherUserId: "22222222-2222-4222-8222-222222222222",
  mapId: "33333333-3333-4333-8333-333333333333",
  claimId: "44444444-4444-4444-8444-444444444444",
  neighborClaimId: "55555555-5555-4555-8555-555555555555",
  roundId: "66666666-6666-4666-8666-666666666666",
  priorRoundId: "77777777-7777-4777-8777-777777777777",
  workspaceContextId: "88888888-8888-4888-8888-888888888888",
  critiqueId: "99999999-9999-4999-8999-999999999999",
};

export const challengeTimes = {
  createdAt: new Date("2026-04-23T12:00:00.000Z"),
  updatedAt: new Date("2026-04-23T12:15:00.000Z"),
  priorRoundStartedAt: new Date("2026-04-22T10:00:00.000Z"),
  roundStartedAt: new Date("2026-04-23T14:00:00.000Z"),
  roundClosedAt: new Date("2026-04-22T10:30:00.000Z"),
};

export const critiqueOutputFixture: GenerateChallengeCritiqueOutput = {
  conciseCritiqueSummary: "The architecture likely over-optimizes modularity before the boundaries are proven.",
  strongestCounterargument: "A modular backend adds integration cost before Penny has enough stable seams to justify the split.",
  assumptions: ["The current service boundaries are stable.", "Operational overhead will stay low."],
  likelyFailureModes: ["Premature abstraction", "Cross-service latency"],
  followUpQuestions: ["Which boundaries already change independently?", "What workload needs isolation now?"],
  suggestedConfidenceDelta: -8,
  uncertaintyNote: "The plan depends on interface stability that the roadmap has not demonstrated yet.",
};

export function createMapRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: challengeIds.mapId,
    userId: challengeIds.userId,
    sphereId: null,
    title: "Penny OS Architecture",
    rawThought: "Evaluate the backend architecture for Penny.",
    status: "active",
    claimCount: 2,
    metadata: {},
    createdAt: challengeTimes.createdAt,
    updatedAt: challengeTimes.updatedAt,
    ...overrides,
  };
}

export function createClaimRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: challengeIds.claimId,
    userId: challengeIds.userId,
    mapId: challengeIds.mapId,
    parentClaimId: null,
    text: "A modular backend architecture is the right choice for Penny now.",
    note: null,
    kind: "claim",
    structureKind: null,
    provenance: "user",
    status: "open",
    confidence: 62,
    resolutionDate: null,
    lastChallengedAt: null,
    metadata: {},
    createdAt: challengeTimes.createdAt,
    updatedAt: challengeTimes.updatedAt,
    ...overrides,
  };
}

export function createNeighborClaimRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: challengeIds.neighborClaimId,
    userId: challengeIds.userId,
    mapId: challengeIds.mapId,
    parentClaimId: null,
    text: "Event-driven updates should stay inside the monolith until domain boundaries harden.",
    note: null,
    kind: "claim",
    structureKind: null,
    provenance: "user",
    status: "open",
    confidence: 55,
    resolutionDate: null,
    lastChallengedAt: null,
    metadata: {},
    createdAt: challengeTimes.createdAt,
    updatedAt: new Date("2026-04-23T13:30:00.000Z"),
    ...overrides,
  };
}

export function createRoundRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: challengeIds.roundId,
    userId: challengeIds.userId,
    mapId: challengeIds.mapId,
    claimId: challengeIds.claimId,
    workspaceContextId: challengeIds.workspaceContextId,
    priorRoundId: challengeIds.priorRoundId,
    roundNumber: 2,
    critiqueGenerated: "Pending critique.",
    critiqueFailureTypes: [],
    critiqueLens: "direct",
    critiqueStrength: "moderate",
    critiqueMode: "direct",
    voiceLabel: null,
    responsePath: null,
    userResponse: null,
    confidenceAtRoundStart: 62,
    confidenceAtRoundEnd: null,
    confidenceDelta: null,
    concessions: [],
    defenses: [],
    dismissals: [],
    engagementScore: null,
    followUpPrompt: null,
    uncertainty: {},
    startedAt: challengeTimes.roundStartedAt,
    closedAt: null,
    createdAt: challengeTimes.createdAt,
    updatedAt: challengeTimes.updatedAt,
    ...overrides,
  };
}

export function createPriorRoundRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: challengeIds.priorRoundId,
    userId: challengeIds.userId,
    mapId: challengeIds.mapId,
    claimId: challengeIds.claimId,
    workspaceContextId: challengeIds.workspaceContextId,
    priorRoundId: null,
    roundNumber: 1,
    critiqueGenerated: "Prior critique summary.",
    critiqueFailureTypes: ["Distribution risk"],
    critiqueLens: "direct",
    critiqueStrength: "moderate",
    critiqueMode: "direct",
    voiceLabel: null,
    responsePath: "revise",
    userResponse: "I need stronger evidence before committing to modularity.",
    confidenceAtRoundStart: 70,
    confidenceAtRoundEnd: 63,
    confidenceDelta: -7,
    concessions: [],
    defenses: [],
    dismissals: [],
    engagementScore: 80,
    followUpPrompt: null,
    uncertainty: {},
    startedAt: challengeTimes.priorRoundStartedAt,
    closedAt: challengeTimes.roundClosedAt,
    createdAt: challengeTimes.createdAt,
    updatedAt: challengeTimes.updatedAt,
    ...overrides,
  };
}

export function createCritiqueRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: challengeIds.critiqueId,
    userId: challengeIds.userId,
    mapId: challengeIds.mapId,
    claimId: challengeIds.claimId,
    roundId: challengeIds.roundId,
    workspaceContextId: challengeIds.workspaceContextId,
    provider: "xai",
    model: "grok-4-mini",
    promptVersion: "challenge-critique-v1",
    headline: critiqueOutputFixture.conciseCritiqueSummary,
    critiqueText: critiqueOutputFixture.strongestCounterargument,
    critiqueLens: "direct",
    failureTypes: critiqueOutputFixture.likelyFailureModes,
    dependencyRisks: critiqueOutputFixture.assumptions,
    whyNow: critiqueOutputFixture.uncertaintyNote,
    validatedOutput: {
      ...critiqueOutputFixture,
      _aiRun: {
        provider: "xai",
        model: "grok-4-mini",
        promptVersion: "challenge-critique-v1",
        release: "test",
        environment: "test",
        repairAttempted: false,
        traceId: "trace-123",
        observationId: "obs-123",
      },
    },
    createdAt: new Date("2026-04-23T14:01:00.000Z"),
    updatedAt: new Date("2026-04-23T14:01:00.000Z"),
    ...overrides,
  };
}
