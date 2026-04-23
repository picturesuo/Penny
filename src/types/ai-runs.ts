export type InternalAiRunStatus = "requested" | "generated";

export type InternalAiRunSource = "challenge_critiques" | "moves_events";

export type InternalAiRunFilters = {
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  status: InternalAiRunStatus | null;
  dateFrom: string | null;
  dateTo: string | null;
  userId: string | null;
  claimId: string | null;
  roundId: string | null;
  limit: number;
};

export type InternalAiRunRecord = {
  id: string;
  source: InternalAiRunSource;
  status: InternalAiRunStatus;
  userId: string;
  mapId: string | null;
  claimId: string | null;
  roundId: string | null;
  workspaceContextId: string | null;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  requestId: string | null;
  critiqueId: string | null;
  traceId: string | null;
  observationId: string | null;
  requestedAt: string | null;
  generatedAt: string | null;
  occurredAt: string;
};

export type InternalAiRunsResponse = {
  runs: InternalAiRunRecord[];
  filters: InternalAiRunFilters;
  meta: {
    count: number;
    limit: number;
  };
};
