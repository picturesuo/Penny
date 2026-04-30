import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { CreatedMove } from "./move-payloads.ts";
import type { BrainRepository, CurrentClaimVersion, PersistedNextMoveCandidate } from "./domain/repository.ts";
import type { NextMoveCandidate } from "./domain/engine.ts";
import type { EntityId, FocusState, PennyYcDemoGraphFixture } from "./domain/types.ts";
import { ThinkingModeService } from "./services/thinking-mode-service.ts";

test("ThinkingModeService GET state is read-only", async () => {
  const repository = fakeRepository();
  const service = new ThinkingModeService(repository);
  const state = await service.getState(uuidAt(900), uuidAt(101));

  assert.equal(state.status, "empty");
  assert.equal(state.focusState.source, "none");
  assert.deepEqual(state.modeContract.validModes, ["Learn", "Check", "Brain"]);
  assert.equal(state.modeContract.activeMode, "Brain");
  assert.equal(repository.writes.length, 0);
});

test("ThinkingModeService tick recomputes and persists candidates without mutating truth", async () => {
  const repository = fakeRepository();
  const service = new ThinkingModeService(repository);
  const result = await service.tick({ brainId: uuidAt(900), sessionId: uuidAt(101), limit: 3 });

  assert.equal(result.status, "ready");
  assert.equal(result.candidates.length, 3);
  assert.equal(result.selectedCandidate?.action, "challenge");
  assert.equal(result.selectedCandidate?.mode, "challenge");
  assert.equal(result.selectedCandidate?.mvpMode, "Check");
  assert.equal(result.modeContract.activeMode, "Check");
  assert.equal(result.move?.kind, "next_move_recomputed");
  assert.equal(result.focusState.source, "autopilot_suggestion");
  assert.equal(repository.writes.includes("upsertNextMoveCandidates"), true);
  assert.equal(repository.writes.includes("markCandidateSelected"), true);
  assert.equal(repository.writes.includes("upsertFocusState"), true);
  assert.equal(repository.writes.includes("reviseClaim"), false);
});

test("ThinkingModeService startCandidate creates autopilot_focus_started and updates focus", async () => {
  const repository = fakeRepository();
  const service = new ThinkingModeService(repository);
  const tick = await service.tick({ brainId: uuidAt(900), sessionId: uuidAt(101), limit: 1 });
  const started = await service.startCandidate({
    brainId: uuidAt(900),
    sessionId: uuidAt(101),
    candidateId: tick.selectedCandidate?.candidateId ?? "",
  });

  assert.equal(started.status, "started");
  assert.equal(started.move.kind, "autopilot_focus_started");
  assert.equal(started.focusState.source, "autopilot_started");
  assert.equal(started.focusState.paused, false);
  assert.equal(started.modeContract.activeMode, "Check");
});

test("ThinkingModeService manualFocus creates manual_node_selected and pauses autopilot", async () => {
  const repository = fakeRepository();
  const service = new ThinkingModeService(repository);
  const result = await service.manualFocus({
    brainId: uuidAt(900),
    sessionId: uuidAt(101),
    claimId: uuidAt(202),
    reason: "Inspect this assumption first.",
  });

  assert.equal(result.status, "paused");
  assert.equal(result.move.kind, "manual_node_selected");
  assert.equal(result.focusState.source, "manual_selection");
  assert.equal(result.focusState.paused, true);
  assert.equal(result.focusClaim.id, uuidAt(202));
  assert.equal(result.modeContract.activeMode, "Brain");
});

function fakeRepository(): BrainRepository & { writes: string[] } {
  const graph = loadFixture();
  const writes: string[] = [];
  let focusState = defaultFocusState(graph.session.id);
  let candidates: PersistedNextMoveCandidate[] = [];
  let selectedCandidate: PersistedNextMoveCandidate | null = null;
  let moveCounter = 600;

  return {
    writes,
    async loadGraphSnapshot(sessionId) {
      assert.equal(sessionId, graph.session.id);

      return {
        ...graph,
        focusState,
      };
    },
    async getAutopilotState(sessionId) {
      assert.equal(sessionId, graph.session.id);

      return {
        sessionId,
        focusState,
        candidates,
        selectedCandidate,
      };
    },
    async upsertNextMoveCandidates(sessionId, nextCandidates) {
      writes.push("upsertNextMoveCandidates");
      assert.equal(sessionId, graph.session.id);
      candidates = nextCandidates.map((candidate, index) => persistedCandidate(candidate, index));

      return candidates;
    },
    async markCandidateSelected(sessionId, fingerprint) {
      writes.push("markCandidateSelected");
      assert.equal(sessionId, graph.session.id);
      candidates = candidates.map((candidate) => ({
        ...candidate,
        selected: candidate.fingerprint === fingerprint,
        selectedAt: candidate.fingerprint === fingerprint ? new Date("2026-04-29T00:00:10.000Z") : null,
      }));
      selectedCandidate = candidates.find((candidate) => candidate.fingerprint === fingerprint) ?? null;

      if (!selectedCandidate) {
        throw new Error("candidate not found");
      }

      return selectedCandidate;
    },
    async upsertFocusState(nextFocusState) {
      writes.push("upsertFocusState");
      focusState = nextFocusState;

      return focusState;
    },
    async createMove(kind, input) {
      writes.push(`createMove:${kind}`);
      moveCounter += 1;

      return {
        id: uuidAt(moveCounter),
        sessionId: input.sessionId,
        kind,
        summary: input.summary,
        payload: input.payload,
        userId: null,
        workspaceId: null,
        projectId: null,
        sphereId: null,
        createdAt: new Date("2026-04-29T00:00:11.000Z"),
      } as CreatedMove<typeof kind>;
    },
    async getClaimCurrentVersion(claimId) {
      assert.equal(claimId, uuidAt(202));

      return claimVersion(claimId);
    },
    async reviseClaim() {
      writes.push("reviseClaim");
      throw new Error("reviseClaim should not run in Thinking Mode service tests");
    },
  };
}

function persistedCandidate(candidate: NextMoveCandidate, index: number): PersistedNextMoveCandidate {
  return {
    id: uuidAt(800 + index),
    sessionId: uuidAt(101),
    userId: null,
    workspaceId: null,
    projectId: null,
    sphereId: null,
    candidateId: candidate.candidateId,
    fingerprint: candidate.fingerprint,
    graphHash: candidate.graphHash,
    action: candidate.action,
    mode: candidate.mode,
    targetClaimId: candidate.targetClaimId,
    targetEdgeId: candidate.targetEdgeId,
    score: candidate.score,
    rank: candidate.rank,
    reason: candidate.reason,
    reasonCodes: candidate.reasonCodes,
    exitCriteria: candidate.exitCriteria,
    scoreBreakdown: candidate.scoreBreakdown,
    provenance: candidate.provenance,
    selected: false,
    selectedAt: null,
    createdAt: new Date("2026-04-29T00:00:09.000Z"),
    updatedAt: new Date("2026-04-29T00:00:09.000Z"),
  };
}

function claimVersion(claimId: EntityId): CurrentClaimVersion {
  const claim = {
    id: claimId,
    userId: null,
    workspaceId: null,
    projectId: null,
    sphereId: null,
    sessionId: uuidAt(101),
    sourceId: null,
    kind: "assumption" as const,
    createdAt: new Date("2026-04-29T00:00:02.000Z"),
  };
  const version = {
    id: uuidAt(702),
    claimId,
    sourceId: null,
    brainRunId: null,
    moveId: null,
    content: "Founders will use structured thinking guidance during ambiguous company decisions.",
    status: "exploratory" as const,
    confidence: 42,
    isCurrent: true,
    validFrom: new Date("2026-04-29T00:00:02.000Z"),
    validUntil: null,
    supersededByVersionId: null,
    createdAt: new Date("2026-04-29T00:00:02.000Z"),
  };

  return {
    claim,
    version,
    snapshot: {
      id: version.id,
      claimId,
      text: version.content,
      confidence: version.confidence,
      status: version.status,
      isCurrent: version.isCurrent,
      validFrom: version.validFrom.toISOString(),
      validUntil: null,
      supersededByVersionId: null,
    },
  };
}

function defaultFocusState(sessionId: EntityId): FocusState {
  return {
    sessionId,
    mode: "brain",
    focusedClaimId: null,
    focusedEdgeId: null,
    source: "none",
    suggestionMoveId: null,
    manualMoveId: null,
    paused: false,
    reason: null,
    updatedAt: null,
  };
}

function loadFixture(): PennyYcDemoGraphFixture {
  return JSON.parse(
    readFileSync(new URL("../../../test/fixtures/penny-yc-demo-graph.json", import.meta.url), "utf8"),
  ) as PennyYcDemoGraphFixture;
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
