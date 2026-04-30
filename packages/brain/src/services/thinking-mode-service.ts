import type { CreatedMove } from "../move-payloads.ts";
import { rankNextMoveCandidates, type NextMoveCandidate } from "../domain/engine.ts";
import type {
  BrainRepository,
  PersistedNextMoveCandidate,
} from "../domain/repository.ts";
import type { EntityId, FocusState } from "../domain/types.ts";
import { mvpModeForThinkingMode, mvpModeValues, type MvpMode, type ThinkingMode } from "../modes.ts";

export type ThinkingModeStatus = "ready" | "paused" | "empty";

export type MvpModeContractDto = {
  validModes: ReadonlyArray<MvpMode>;
  activeMode: MvpMode;
};

export type ThinkingModeCandidateDto = {
  id: EntityId;
  candidateId: string;
  fingerprint: string;
  rank: number;
  targetClaimId: EntityId;
  targetEdgeId: EntityId | null;
  action: NextMoveCandidate["action"];
  mode: NextMoveCandidate["mode"];
  mvpMode: MvpMode;
  score: number;
  reason: string;
  reasonCodes: ReadonlyArray<string>;
  exitCriteria: NextMoveCandidate["exitCriteria"];
  scoreBreakdown: NextMoveCandidate["scoreBreakdown"];
  graphHash: string;
  provenance: NextMoveCandidate["provenance"];
  selected: boolean;
  selectedAt: string | null;
};

export type ThinkingModeMoveDto = {
  id: EntityId;
  kind: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ThinkingModeStateResponse = {
  status: ThinkingModeStatus;
  brainId: EntityId;
  sessionId: EntityId;
  focusState: FocusState;
  modeContract: MvpModeContractDto;
  candidates: ReadonlyArray<ThinkingModeCandidateDto>;
  selectedCandidate: ThinkingModeCandidateDto | null;
};

export type ThinkingModeTickInput = {
  brainId: EntityId;
  sessionId: EntityId;
  resume?: boolean;
  limit?: number;
};

export type ThinkingModeTickResponse = ThinkingModeStateResponse & {
  status: ThinkingModeStatus;
  graphHash: string | null;
  persistedMoveIds: ReadonlyArray<EntityId>;
  move: ThinkingModeMoveDto | null;
};

export type StartNextMoveInput = {
  brainId: EntityId;
  sessionId: EntityId;
  candidateId: string;
};

export type StartNextMoveResponse = {
  status: "started";
  brainId: EntityId;
  sessionId: EntityId;
  focusState: FocusState;
  modeContract: MvpModeContractDto;
  selectedCandidate: ThinkingModeCandidateDto;
  move: ThinkingModeMoveDto;
};

export type ManualFocusInput = {
  brainId: EntityId;
  sessionId: EntityId;
  claimId: EntityId;
  reason?: string | null;
  previousSuggestionMoveId?: EntityId | null;
};

export type ManualFocusResponse = {
  status: "paused";
  brainId: EntityId;
  sessionId: EntityId;
  focusState: FocusState;
  modeContract: MvpModeContractDto;
  focusClaim: {
    id: EntityId;
    versionId: EntityId;
    kind: string;
    status: string;
    text: string;
    confidence: number;
  };
  move: ThinkingModeMoveDto;
};

export class ThinkingModeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThinkingModeNotFoundError";
  }
}

export class ThinkingModeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThinkingModeConflictError";
  }
}

export class ThinkingModeService {
  constructor(private readonly repository: BrainRepository) {}

  async getState(brainId: EntityId, sessionId: EntityId): Promise<ThinkingModeStateResponse> {
    const state = await this.repository.getAutopilotState(sessionId);
    const candidates = state.candidates.map(candidateDto);
    const selectedCandidate = state.selectedCandidate ? candidateDto(state.selectedCandidate) : null;

    return {
      status: statusFor(state.focusState, candidates),
      brainId,
      sessionId,
      focusState: state.focusState,
      modeContract: modeContractFor(state.focusState.mode),
      candidates,
      selectedCandidate,
    };
  }

  async tick(input: ThinkingModeTickInput): Promise<ThinkingModeTickResponse> {
    const before = await this.repository.getAutopilotState(input.sessionId);

    if (before.focusState.paused && !input.resume) {
      return {
        ...this.statePayload(input.brainId, input.sessionId, before.focusState, before.candidates, before.selectedCandidate),
        status: "paused",
        graphHash: before.selectedCandidate?.graphHash ?? before.candidates[0]?.graphHash ?? null,
        persistedMoveIds: [],
        move: null,
      };
    }

    const graph = await this.repository.loadGraphSnapshot(input.sessionId);
    const computedCandidates = rankNextMoveCandidates(graph, input.limit ?? 8);
    const persistedCandidates = await this.repository.upsertNextMoveCandidates(input.sessionId, computedCandidates);
    const selectedCandidate = persistedCandidates[0] ?? null;
    const selected = selectedCandidate
      ? await this.repository.markCandidateSelected(input.sessionId, selectedCandidate.fingerprint)
      : null;
    const move = await this.repository.createMove("next_move_recomputed", {
      sessionId: input.sessionId,
      summary: selected
        ? `Recomputed next moves and selected ${selected.action}.`
        : "Recomputed next moves and found no available candidate.",
      payload: nextMoveRecomputedPayload(computedCandidates, selected),
    });
    const focusState = selected
      ? await this.repository.upsertFocusState({
          sessionId: input.sessionId,
          mode: selected.mode,
          focusedClaimId: selected.targetClaimId,
          focusedEdgeId: selected.targetEdgeId,
          source: "autopilot_suggestion",
          suggestionMoveId: move.id,
          manualMoveId: null,
          paused: false,
          reason: selected.reason,
          updatedAt: move.createdAt.toISOString(),
        })
      : before.focusState;

    return {
      ...this.statePayload(input.brainId, input.sessionId, focusState, persistedCandidates, selected),
      status: selected ? "ready" : "empty",
      graphHash: computedCandidates[0]?.graphHash ?? null,
      persistedMoveIds: [move.id],
      move: moveDto(move),
    };
  }

  async startCandidate(input: StartNextMoveInput): Promise<StartNextMoveResponse> {
    const state = await this.repository.getAutopilotState(input.sessionId);
    const candidate = findCandidate(state.candidates, input.candidateId);

    if (!candidate) {
      throw new ThinkingModeNotFoundError("Next move candidate was not found for this session.");
    }

    const selected = await this.repository.markCandidateSelected(input.sessionId, candidate.fingerprint);
    const move = await this.repository.createMove("autopilot_focus_started", {
      sessionId: input.sessionId,
      summary: `Started Autopilot focus: ${selected.action}.`,
      payload: {
        candidateId: selected.candidateId,
        candidateFingerprint: selected.fingerprint,
        action: selected.action,
        mode: selected.mode,
        targetClaimId: selected.targetClaimId,
        targetEdgeId: selected.targetEdgeId,
        graphHash: selected.graphHash,
        reason: selected.reason,
        score: selected.score,
        claimIds: uniqueIds([selected.targetClaimId, ...selected.provenance.claimIds]),
        edgeIds: uniqueIds([selected.targetEdgeId, ...selected.provenance.edgeIds].filter(isEntityId)),
        artifactIds: uniqueIds(selected.provenance.artifactIds),
      },
    });
    const focusState = await this.repository.upsertFocusState({
      sessionId: input.sessionId,
      mode: selected.mode,
      focusedClaimId: selected.targetClaimId,
      focusedEdgeId: selected.targetEdgeId,
      source: "autopilot_started",
      suggestionMoveId: move.id,
      manualMoveId: null,
      paused: false,
      reason: selected.reason,
      updatedAt: move.createdAt.toISOString(),
    });

    return {
      status: "started",
      brainId: input.brainId,
      sessionId: input.sessionId,
      focusState,
      modeContract: modeContractFor(focusState.mode),
      selectedCandidate: candidateDto(selected),
      move: moveDto(move),
    };
  }

  async manualFocus(input: ManualFocusInput): Promise<ManualFocusResponse> {
    const [state, claimVersion, graph] = await Promise.all([
      this.repository.getAutopilotState(input.sessionId),
      this.repository.getClaimCurrentVersion(input.claimId),
      this.repository.loadGraphSnapshot(input.sessionId),
    ]);

    if (claimVersion.claim.sessionId !== input.sessionId) {
      throw new ThinkingModeConflictError("Manual focus claim does not belong to the requested session.");
    }

    const edgeIds = graph.edges
      .filter((edge) => edge.fromClaimId === input.claimId || edge.toClaimId === input.claimId)
      .map((edge) => edge.id)
      .sort();
    const previousSuggestionMoveId = input.previousSuggestionMoveId ?? state.focusState.suggestionMoveId;
    const move = await this.repository.createMove("manual_node_selected", {
      sessionId: input.sessionId,
      scope: claimVersion.claim,
      summary: "User manually selected a graph node and paused autopilot.",
      payload: {
        claimId: input.claimId,
        previousSuggestionMoveId,
        reason: input.reason ?? null,
        pauseAutopilot: true,
        claimIds: [input.claimId],
        edgeIds,
        artifactIds: [],
      },
    });
    const focusState = await this.repository.upsertFocusState({
      sessionId: input.sessionId,
      mode: "brain",
      focusedClaimId: input.claimId,
      focusedEdgeId: edgeIds[0] ?? null,
      source: "manual_selection",
      suggestionMoveId: state.focusState.suggestionMoveId,
      manualMoveId: move.id,
      paused: true,
      reason: input.reason ?? null,
      updatedAt: move.createdAt.toISOString(),
    });

    return {
      status: "paused",
      brainId: input.brainId,
      sessionId: input.sessionId,
      focusState,
      modeContract: modeContractFor(focusState.mode),
      focusClaim: {
        id: claimVersion.claim.id,
        versionId: claimVersion.version.id,
        kind: claimVersion.claim.kind,
        status: claimVersion.version.status,
        text: claimVersion.version.content,
        confidence: claimVersion.version.confidence,
      },
      move: moveDto(move),
    };
  }

  private statePayload(
    brainId: EntityId,
    sessionId: EntityId,
    focusState: FocusState,
    candidates: ReadonlyArray<PersistedNextMoveCandidate>,
    selectedCandidate: PersistedNextMoveCandidate | null,
  ): ThinkingModeStateResponse {
    const candidateDtos = candidates.map(candidateDto);

    return {
      status: statusFor(focusState, candidateDtos),
      brainId,
      sessionId,
      focusState,
      modeContract: modeContractFor(focusState.mode),
      candidates: candidateDtos,
      selectedCandidate: selectedCandidate ? candidateDto(selectedCandidate) : null,
    };
  }
}

function nextMoveRecomputedPayload(
  candidates: ReadonlyArray<NextMoveCandidate>,
  selected: PersistedNextMoveCandidate | null,
) {
  return {
    graphHash: candidates[0]?.graphHash ?? selected?.graphHash ?? "empty",
    candidateCount: candidates.length,
    selectedCandidateId: selected?.candidateId ?? null,
    selectedFingerprint: selected?.fingerprint ?? null,
    candidateIds: candidates.map((candidate) => candidate.candidateId),
    candidateFingerprints: candidates.map((candidate) => candidate.fingerprint),
    candidates: candidates.slice(0, 12).map((candidate) => ({
      candidateId: candidate.candidateId,
      fingerprint: candidate.fingerprint,
      action: candidate.action,
      mode: candidate.mode,
      targetClaimId: candidate.targetClaimId,
      targetEdgeId: candidate.targetEdgeId,
      score: candidate.score,
      rank: candidate.rank,
      reason: candidate.reason,
      reasonCodes: [...candidate.reasonCodes],
      graphHash: candidate.graphHash,
    })),
    claimIds: uniqueIds(candidates.flatMap((candidate) => [candidate.targetClaimId, ...candidate.provenance.claimIds])),
    edgeIds: uniqueIds(
      candidates.flatMap((candidate) => [candidate.targetEdgeId, ...candidate.provenance.edgeIds].filter(isEntityId)),
    ),
    artifactIds: uniqueIds(candidates.flatMap((candidate) => candidate.provenance.artifactIds)),
  };
}

function candidateDto(candidate: PersistedNextMoveCandidate): ThinkingModeCandidateDto {
  return {
    id: candidate.id,
    candidateId: candidate.candidateId,
    fingerprint: candidate.fingerprint,
    rank: candidate.rank,
    targetClaimId: candidate.targetClaimId,
    targetEdgeId: candidate.targetEdgeId,
    action: candidate.action,
    mode: candidate.mode,
    mvpMode: mvpModeForThinkingMode(candidate.mode),
    score: candidate.score,
    reason: candidate.reason,
    reasonCodes: candidate.reasonCodes,
    exitCriteria: candidate.exitCriteria,
    scoreBreakdown: candidate.scoreBreakdown,
    graphHash: candidate.graphHash,
    provenance: candidate.provenance,
    selected: candidate.selected,
    selectedAt: candidate.selectedAt?.toISOString() ?? null,
  };
}

function moveDto(move: CreatedMove): ThinkingModeMoveDto {
  return {
    id: move.id,
    kind: move.kind,
    summary: move.summary,
    payload: move.payload,
    createdAt: move.createdAt.toISOString(),
  };
}

function modeContractFor(mode: ThinkingMode): MvpModeContractDto {
  return {
    validModes: mvpModeValues,
    activeMode: mvpModeForThinkingMode(mode),
  };
}

function statusFor(focusState: FocusState, candidates: ReadonlyArray<{ selected: boolean }>): ThinkingModeStatus {
  if (focusState.paused) {
    return "paused";
  }

  return candidates.length > 0 ? "ready" : "empty";
}

function findCandidate(candidates: ReadonlyArray<PersistedNextMoveCandidate>, candidateId: string) {
  return (
    candidates.find(
      (candidate) =>
        candidate.id === candidateId || candidate.candidateId === candidateId || candidate.fingerprint === candidateId,
    ) ?? null
  );
}

function uniqueIds(ids: ReadonlyArray<EntityId>): EntityId[] {
  return [...new Set(ids)].sort();
}

function isEntityId(value: EntityId | null): value is EntityId {
  return Boolean(value);
}
