import assert from "node:assert/strict";
import test from "node:test";
import {
  handleBrainObjectsRequest,
  handleBrainRecentsRequest,
  handleSaveBrainObjectRequest,
  type BrainObjectDto,
  type BrainObjectsPayload,
  type BrainObjectsRouteService,
  type BrainRecentDto,
  type BrainRecentsPayload,
  type CreateBrainRecentInput,
  type SaveBrainObjectInput,
} from "./brain-objects-route.ts";
import { handleLearnSessionRequest, type LearnSessionPayload } from "./learn-session-route.ts";
import { handleSessionCanvasRequest, type SessionCanvasPayload } from "./session-canvas-route.ts";
import type { BrainSeedInput, BrainSeedOutput } from "./seed.ts";
import type { BrainSeedPrelude, BrainSeedRunInput, PersistedBrainSeed } from "./seed-persistence.ts";
import type { ThinkingModeCandidateDto, ThinkingModeTickResponse } from "./services/thinking-mode-service.ts";
import { type BrainScope, scopeValues } from "./scope.ts";
import { runVerifyRecipeTrace } from "./verify-recipe.ts";

const scope: BrainScope = {
  userId: "demo-user",
  workspaceId: "demo-workspace",
  projectId: "yc-demo",
  sphereId: "founder-flow",
};

test("MVP idea-drop Learn flow creates a session, suggests Autopilot, keeps recents, and saves to Brain", async () => {
  const idea = "Penny should help founders turn rough startup ideas into durable thinking artifacts.";
  const brainObjects = new MemoryBrainObjectsService();
  const learnedSessions = new Set<string>();
  const preparedRuns: BrainSeedRunInput[] = [];
  let tickedSessionId: string | null = null;

  const learnResponse = await handleLearnSessionRequest(scopedJsonRequest("http://localhost/api/learn/session", {
    rawIdea: idea,
    autopilot: { limit: 1 },
  }), {
    async prepareSeedRun(input, options) {
      preparedRuns.push(options.run);
      const prelude = createPersistedPrelude(input, options.run);
      learnedSessions.add(prelude.session.id);
      return prelude;
    },
    async generateSeed(input) {
      return demoSeedOutput(input.rawIdea, input.sessionId ?? uuidAt(100));
    },
    async persistSeed(seed, options) {
      return createPersistedSeed(seed, options.prelude);
    },
    async failSeedRun() {
      throw new Error("failSeedRun should not run in the MVP smoke flow");
    },
    async tickAutopilot(input) {
      tickedSessionId = input.sessionId;
      return demoAutopilotTick(input.sessionId, uuidAt(201));
    },
  });
  const learnBody = (await learnResponse.json()) as { data: LearnSessionPayload };
  const sessionId = learnBody.data.session.id;
  const autopilotCandidate = learnBody.data.autopilot.candidates[0];
  const saveCandidate = learnBody.data.candidateBrainObjects[0];

  assert.equal(learnResponse.status, 201);
  assert.equal(learnBody.data.source.rawText, idea);
  assert.match(sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(learnBody.data.session.status, "open");
  assert.equal(learnedSessions.has(sessionId), true);
  assert.equal(preparedRuns[0]?.operation, "brain.seed");
  assert.equal(preparedRuns[0]?.input && typeof preparedRuns[0].input === "object" && "source" in preparedRuns[0].input, true);
  assert.equal(tickedSessionId, sessionId);
  assert.equal(learnBody.data.learn.concepts[0]?.term, "thinking artifact");
  assert.equal(autopilotCandidate?.userAction, "learn");
  assert.equal(autopilotCandidate?.mvpMode, "Learn");
  assert.equal(learnBody.data.learn.nextMoves.find((move) => move.action === "learn")?.source, "autopilot");
  assert.ok(saveCandidate);
  assert.equal(saveCandidate.refs?.sessionId, sessionId);

  const kept = await handleBrainRecentsRequest(scopedJsonRequest("http://localhost/api/brain/recents", {
    rawIdea: saveCandidate.content,
    kind: saveCandidate.objectType,
    title: saveCandidate.title,
    summary: saveCandidate.summary,
    content: saveCandidate.content,
    sessionId,
    payload: {
      learnSessionOutput: {
        term: learnBody.data.learn.concepts[0]?.term,
        autopilotCandidateId: autopilotCandidate?.candidateId,
      },
    },
  }), { service: brainObjects });
  const keptBody = (await kept.json()) as { data: { recent: BrainRecentDto; recents: BrainRecentDto[] } };
  const listedRecents = await handleBrainRecentsRequest(scopedRequest("http://localhost/api/brain/recents"), {
    service: brainObjects,
  });
  const listedRecentsBody = (await listedRecents.json()) as { data: BrainRecentsPayload };

  assert.equal(kept.status, 201);
  assert.equal(keptBody.data.recent.sessionId, sessionId);
  assert.equal(keptBody.data.recent.kind, "learn_session");
  assert.equal(listedRecents.status, 200);
  assert.deepEqual(
    listedRecentsBody.data.recents.map((recent) => recent.id),
    [keptBody.data.recent.id],
  );

  const saved = await handleSaveBrainObjectRequest(scopedJsonRequest("http://localhost/api/brain/objects/save", {
    recentId: keptBody.data.recent.id,
    sessionId,
    objectType: "learn_session",
    title: "Learn: founder thinking artifact",
  }), { service: brainObjects });
  const savedBody = (await saved.json()) as { data: { object: BrainObjectDto } };
  const brain = await handleBrainObjectsRequest(scopedRequest("http://localhost/api/brain/objects"), {
    service: brainObjects,
  });
  const brainBody = (await brain.json()) as { data: BrainObjectsPayload };

  assert.equal(saved.status, 201);
  assert.equal(savedBody.data.object.sessionId, sessionId);
  assert.equal(savedBody.data.object.objectType, "learn_session");
  assert.equal(brain.status, 200);
  assert.equal(brainBody.data.meta.savedObjectCount, 1);
  assert.equal(
    brainBody.data.objects.some(
      (object) => object.id === savedBody.data.object.id && object.preview?.includes("durable thinking artifacts"),
    ),
    true,
  );
});

test("P2 smoke: idea drop, canvas fetch, recipe trace, and Brain context stay connected", async () => {
  const idea = "Penny should help solo founders see which assumption makes their launch plan fragile.";
  const brainObjects = new MemoryBrainObjectsService();
  let persistedSeed: PersistedBrainSeed | null = null;

  const learnResponse = await handleLearnSessionRequest(scopedJsonRequest("http://localhost/api/learn/session", {
    rawIdea: idea,
    autopilot: { limit: 1 },
  }), {
    async prepareSeedRun(input, options) {
      return createPersistedPrelude(input, options.run);
    },
    async generateSeed(input) {
      return demoSeedOutput(input.rawIdea, input.sessionId ?? uuidAt(120));
    },
    async persistSeed(seed, options) {
      persistedSeed = createPersistedSeed(seed, options.prelude);
      return persistedSeed;
    },
    async tickAutopilot(input) {
      return demoAutopilotTick(input.sessionId, uuidAt(201));
    },
  });
  const learnBody = (await learnResponse.json()) as { data: LearnSessionPayload };
  const sessionId = learnBody.data.session.id;
  const saveCandidate = learnBody.data.candidateBrainObjects[0];

  assert.equal(learnResponse.status, 201);
  assert.ok(saveCandidate);
  assert.ok(persistedSeed);

  const kept = await handleBrainRecentsRequest(scopedJsonRequest("http://localhost/api/brain/recents", {
    rawIdea: saveCandidate.content,
    kind: saveCandidate.objectType,
    title: saveCandidate.title,
    summary: saveCandidate.summary,
    content: saveCandidate.content,
    sessionId,
    payload: {
      source: "p2_smoke",
      candidateBrainObjects: [saveCandidate],
    },
  }), { service: brainObjects });
  const keptBody = (await kept.json()) as { data: { recent: BrainRecentDto } };
  const saved = await handleSaveBrainObjectRequest(scopedJsonRequest("http://localhost/api/brain/objects/save", {
    recentId: keptBody.data.recent.id,
    sessionId,
    objectType: saveCandidate.objectType,
    title: saveCandidate.title,
  }), { service: brainObjects });

  assert.equal(kept.status, 201);
  assert.equal(saved.status, 201);

  const canvasResponse = await handleSessionCanvasRequest(scopedRequest(`http://localhost/api/sessions/${sessionId}/canvas`), sessionId, {
    async loadSessionCanvas(targetSessionId, requestScope) {
      assert.equal(targetSessionId, sessionId);
      assert.deepEqual(requestScope, scope);

      return {
        nodes: [
          {
            id: `claim:${persistedSeed?.claims[0]?.id}`,
            kind: "claim",
            title: "Core idea",
            summary: persistedSeed?.claimVersions[0]?.content ?? idea,
            status: "exploratory",
            confidence: persistedSeed?.claimVersions[0]?.confidence ?? null,
            refs: {
              claimId: persistedSeed?.claims[0]?.id,
              sourceId: persistedSeed?.source.id,
            },
          },
          {
            id: `brain_object:${uuidAt(950)}`,
            kind: "learn_session",
            title: saveCandidate.title,
            summary: saveCandidate.summary,
            status: "saved",
            refs: {},
            actions: ["learn", "check", "verify", "save", "related"],
          },
        ],
        edges: [
          {
            id: "smoke-canvas-edge",
            source: `claim:${persistedSeed?.claims[0]?.id}`,
            target: `brain_object:${uuidAt(950)}`,
            kind: "supports",
            label: "feeds saved Brain context",
          },
        ],
        recommendedPath: [`claim:${persistedSeed?.claims[0]?.id}`, `brain_object:${uuidAt(950)}`],
        selectedNodeId: `claim:${persistedSeed?.claims[0]?.id}`,
      } satisfies SessionCanvasPayload;
    },
  });
  const canvasBody = (await canvasResponse.json()) as { data: SessionCanvasPayload };
  const recipe = runVerifyRecipeTrace({
    steps: [
      {
        step: "decompose_claim",
        title: "Decompose claim",
        status: "completed",
        summary: "Identified the fragile launch assumption from the canvas claim.",
        inputs: [canvasBody.data.nodes[0]?.summary ?? idea],
        outputs: ["testable launch assumption"],
      },
      {
        step: "search_gather",
        title: "Search and gather",
        status: "skipped",
        summary: "Used local Brain and canvas context for the smoke test.",
        inputs: [sessionId],
        outputs: ["local canvas context"],
      },
      {
        step: "evaluate_evidence",
        title: "Evaluate evidence",
        status: "completed",
        summary: "Checked that the saved Brain object still relates to the canvas claim.",
        inputs: [saveCandidate.title],
        outputs: ["brain context attached"],
      },
      {
        step: "synthesize_verdict",
        title: "Synthesize verdict",
        status: "completed",
        summary: "The P2 contracts can pass session context across Brain, Canvas, and recipe traces.",
        inputs: ["brain context attached"],
        outputs: ["supported"],
      },
      {
        step: "suggest_confidence_change",
        title: "Suggest confidence change",
        status: "completed",
        summary: "No confidence mutation happens in the smoke recipe.",
        inputs: ["supported"],
        outputs: ["delta 0"],
      },
    ],
  });
  const brain = await handleBrainObjectsRequest(scopedRequest("http://localhost/api/brain/objects"), {
    service: brainObjects,
  });
  const brainBody = (await brain.json()) as { data: BrainObjectsPayload };

  assert.equal(canvasResponse.status, 200);
  assert.equal(canvasBody.data.nodes.some((node) => node.id.startsWith("claim:")), true);
  assert.equal(canvasBody.data.nodes.some((node) => node.id.startsWith("brain_object:")), true);
  assert.equal(canvasBody.data.edges[0]?.kind, "supports");
  assert.equal(recipe.recipeTrace.status, "completed");
  assert.deepEqual(recipe.recipeTrace.steps.map((step) => step.step), [
    "decompose_claim",
    "search_gather",
    "evaluate_evidence",
    "synthesize_verdict",
    "suggest_confidence_change",
  ]);
  assert.equal(brain.status, 200);
  assert.equal(brainBody.data.meta.savedObjectCount, 1);
  assert.equal(brainBody.data.objects[0]?.sessionId, sessionId);
  assert.match(brainBody.data.objects[0]?.preview ?? "", /fragile|thinking artifacts|launch/i);
});

class MemoryBrainObjectsService implements BrainObjectsRouteService {
  private readonly recents: BrainRecentDto[] = [];
  private readonly objects: BrainObjectDto[] = [];

  async listObjects(requestScope: BrainScope): Promise<BrainObjectsPayload> {
    const objects = this.objects.filter((object) => sameScope(object.scope, requestScope));

    return {
      sourceOfTruth: "sessions_sources_claims_claim_versions_claim_edges_moves_artifacts_brain_objects_session_notes",
      objects,
      meta: {
        objectCount: objects.length,
        sessionCount: new Set(objects.map((object) => object.sessionId).filter(Boolean)).size,
        savedObjectCount: objects.length,
        noteCount: 0,
      },
    };
  }

  async saveObject(input: SaveBrainObjectInput): Promise<BrainObjectDto> {
    const recent = input.recentId
      ? this.recents.find((candidate) => candidate.id === input.recentId && sameScope(candidate.scope, input.scope))
      : null;
    const content = input.content ?? input.body ?? recent?.content ?? recent?.rawIdea ?? "";
    const id = uuidAt(950 + this.objects.length);
    const now = "2026-04-30T12:15:00.000Z";
    const object: BrainObjectDto = {
      id,
      objectType: input.objectType ?? recent?.kind ?? "learn_session",
      backing: { table: "brain_objects", id },
      scope: input.scope,
      sessionId: input.sessionId ?? recent?.sessionId ?? null,
      parentId: input.sessionId ?? recent?.sessionId ? `session:${input.sessionId ?? recent?.sessionId}` : null,
      title: input.title ?? recent?.title ?? "Saved Brain object",
      summary: input.summary ?? recent?.summary ?? null,
      preview: content,
      status: "saved",
      createdAt: now,
      updatedAt: now,
      refs: {
        claimIds: [],
        claimVersionIds: [],
        edgeIds: [],
        sourceIds: [],
        moveIds: [],
        artifactIds: [],
      },
    };

    this.objects.unshift(object);
    return object;
  }

  async listRecents(requestScope: BrainScope): Promise<BrainRecentsPayload> {
    return {
      recents: this.recents.filter((recent) => sameScope(recent.scope, requestScope)),
    };
  }

  async createRecent(input: CreateBrainRecentInput): Promise<{ recent: BrainRecentDto; recents: BrainRecentDto[] }> {
    const content = input.content ?? input.rawIdea ?? "";
    const now = "2026-04-30T12:10:00.000Z";
    const recent: BrainRecentDto = {
      id: uuidAt(900 + this.recents.length),
      scope: input.scope,
      sessionId: input.sessionId ?? null,
      kind: input.kind ?? "raw_idea",
      title: (input.title ?? content.slice(0, 80)) || "Recent idea",
      summary: input.summary ?? null,
      rawIdea: input.rawIdea ?? content,
      content,
      payload: input.payload ?? {},
      createdAt: now,
      updatedAt: now,
    };

    this.recents.unshift(recent);
    return { recent, recents: this.recents.filter((candidate) => sameScope(candidate.scope, input.scope)) };
  }

  async getSessionNote(): Promise<null> {
    return null;
  }

  async saveSessionNote(): Promise<never> {
    throw new Error("saveSessionNote is outside the MVP smoke flow");
  }
}

function demoSeedOutput(rawIdea: string, sessionId: string): BrainSeedOutput {
  return {
    source: {
      id: "source.seed",
      rawText: rawIdea,
    },
    session: {
      id: sessionId,
      sourceId: "source.seed",
      status: "open",
    },
    seedClaim: {
      id: "claim.seed",
      kind: "belief",
      text: "Penny should turn rough founder ideas into durable thinking artifacts.",
      confidence: 72,
    },
    assumptions: [
      {
        id: "claim.assumption.1",
        kind: "assumption",
        text: "Founders will drop messy ideas before they know the right structure.",
        confidence: 66,
        pressure: "high",
        whyItMatters: "The demo starts with idea drop, so the product must tolerate incomplete input.",
      },
      {
        id: "claim.assumption.2",
        kind: "assumption",
        text: "A short Learn pass can make the first confusing concept usable.",
        confidence: 62,
        pressure: "medium",
        whyItMatters: "Learn must produce useful structure before Check or Brain can preserve it.",
      },
      {
        id: "claim.assumption.3",
        kind: "assumption",
        text: "Saved learning output is valuable enough to revisit from Brain later.",
        confidence: 58,
        pressure: "high",
        whyItMatters: "The demo depends on Brain showing a durable result after Save to Brain.",
      },
    ],
    thoughtMap: {
      claims: [
        {
          id: "claim.seed",
          kind: "belief",
          text: "Penny should turn rough founder ideas into durable thinking artifacts.",
          confidence: 72,
        },
        {
          id: "claim.assumption.1",
          kind: "assumption",
          text: "Founders will drop messy ideas before they know the right structure.",
          confidence: 66,
        },
        {
          id: "claim.assumption.2",
          kind: "assumption",
          text: "A short Learn pass can make the first confusing concept usable.",
          confidence: 62,
        },
        {
          id: "claim.assumption.3",
          kind: "assumption",
          text: "Saved learning output is valuable enough to revisit from Brain later.",
          confidence: 58,
        },
        {
          id: "claim.question.1",
          kind: "question",
          text: "What makes a thinking artifact different from a generic note?",
          confidence: 70,
        },
      ],
      edges: [
        {
          id: "edge.depends.1",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.1",
          kind: "depends_on",
          label: "Seed depends on messy idea capture.",
        },
        {
          id: "edge.depends.2",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.2",
          kind: "depends_on",
          label: "Seed depends on Learn creating useful structure.",
        },
        {
          id: "edge.questions.1",
          fromClaimId: "claim.question.1",
          toClaimId: "claim.assumption.3",
          kind: "questions",
          label: "Brain value depends on the saved result being durable.",
        },
      ],
    },
    explorationPaths: [
      {
        id: "path.1",
        title: "Define the artifact",
        prompt: "What fields make this saved result more than a note?",
        expectedValue: "A clearer Brain object contract.",
      },
      {
        id: "path.2",
        title: "Find the first user",
        prompt: "Which founder moment makes idea drop urgent?",
        expectedValue: "A sharper demo user story.",
      },
      {
        id: "path.3",
        title: "Pressure-test persistence",
        prompt: "What should survive refresh and later Brain browsing?",
        expectedValue: "Persistence acceptance criteria.",
      },
      {
        id: "path.4",
        title: "Compare against notes",
        prompt: "Where does a generic note fail this workflow?",
        expectedValue: "A stronger product contrast.",
      },
      {
        id: "path.5",
        title: "Autopilot next move",
        prompt: "Which next move should appear without manual graph work?",
        expectedValue: "A demoable Autopilot candidate.",
      },
      {
        id: "path.6",
        title: "Brain retrieval",
        prompt: "How will the saved result show in Brain?",
        expectedValue: "A visible end state for the flow.",
      },
    ],
    keyInsight: "The MVP flow works when a dropped idea becomes Learn structure, an Autopilot move, and a saved Brain result.",
    firstChallenge: {
      targetClaimId: "claim.assumption.3",
      failureType: "shaky_assumption",
      weakestPart: "Saved learning output may not feel durable unless Brain can show it immediately.",
      challenge: "If Brain cannot surface the saved Learn result after the idea drop, the demo is only a transient session.",
      responseOptions: ["Defend", "Revise", "Absorb"],
    },
    learnCandidates: [
      {
        id: "learn.1",
        claimId: "claim.assumption.2",
        term: "thinking artifact",
        whyItMatters: "The user must understand what gets saved before Save to Brain is meaningful.",
        unblockExplanation: "A thinking artifact packages the idea, assumptions, challenge, and next move so it can be reused.",
      },
    ],
  };
}

function demoAutopilotTick(sessionId: string, targetClaimId: string): ThinkingModeTickResponse {
  const now = "2026-04-30T12:05:00.000Z";
  const graphHash = "graph:mvp-idea-drop-learn";
  const moveId = uuidAt(810);
  const candidate: ThinkingModeCandidateDto = {
    id: uuidAt(811),
    candidateId: "learn-thinking-artifact",
    fingerprint: "learn-thinking-artifact:fingerprint",
    rank: 1,
    title: "Learn the concept",
    targetClaimId,
    targetEdgeId: null,
    target: {
      type: "claim",
      id: targetClaimId,
      claimId: targetClaimId,
      edgeId: null,
    },
    action: "learn",
    userAction: "learn",
    mode: "learn",
    mvpMode: "Learn",
    label: "Learn the concept",
    ctaLabel: "Start Learn",
    primaryActionLabel: "Start Learn",
    score: 910,
    priority: {
      rank: 1,
      score: 910,
      normalized: 91,
    },
    confidence: 91,
    reason: "Clarify what a thinking artifact is before saving the result to Brain.",
    whyNow: "Clarify what a thinking artifact is before saving the result to Brain.",
    whyPennyRecommendsThis: "Why Penny recommends this: the idea contains a concept or gap that should be understood before the next reasoning step.",
    reasonCodes: ["learn", "concept_unlock"],
    exitCriteria: {
      label: "The founder can explain what will be saved to Brain.",
      acceptedMoveKinds: ["learning_triggered"],
    },
    scoreBreakdown: {
      leverage: 160,
      fragility: 120,
      stakes: 130,
      readiness: 220,
      momentum: 150,
      novelty: 90,
      shape: 40,
      penalties: 0,
    },
    graphHash,
    provenance: {
      engine: "thinking-mode-next-move-v1",
      graphHash,
      source: "thinking_graph_snapshot",
      ruleIds: ["learn_unclear_concept"],
      claimIds: [targetClaimId],
      edgeIds: [],
      moveIds: [],
      artifactIds: [],
    },
    candidateBrainObjects: [],
    selected: true,
    selectedAt: now,
  };

  return {
    status: "ready",
    brainId: sessionId,
    sessionId,
    focusState: {
      sessionId,
      mode: "learn",
      focusedClaimId: targetClaimId,
      focusedEdgeId: null,
      source: "autopilot_suggestion",
      suggestionMoveId: moveId,
      manualMoveId: null,
      paused: false,
      reason: candidate.reason,
      updatedAt: now,
    },
    modeContract: {
      validModes: ["Learn", "Check", "Brain"],
      activeMode: "Learn",
    },
    candidates: [candidate],
    selectedCandidate: candidate,
    graphHash,
    persistedMoveIds: [moveId],
    move: {
      id: moveId,
      kind: "next_move_recomputed",
      summary: "Recomputed next moves and selected Learn.",
      payload: {
        candidateId: candidate.candidateId,
      },
      createdAt: now,
    },
  };
}

function createPersistedPrelude(input: BrainSeedInput, run: BrainSeedRunInput): BrainSeedPrelude {
  const now = new Date("2026-04-30T12:00:00.000Z");
  const sessionId = input.sessionId ?? uuidAt(100);
  const sourceId = uuidAt(101);
  const brainRunId = uuidAt(701);
  const persistedScope = scopeValues(run.scope);

  return {
    session: {
      id: sessionId,
      ...persistedScope,
      status: "open",
      title: input.rawIdea,
      createdAt: now,
      endedAt: null,
    },
    source: {
      id: sourceId,
      ...persistedScope,
      sessionId,
      kind: "raw_idea",
      rawText: input.rawIdea,
      createdAt: now,
    },
    submittedSourceSpan: {
      id: uuidAt(151),
      sourceId,
      claimId: null,
      claimVersionId: null,
      startOffset: 0,
      endOffset: input.rawIdea.length,
      label: "submitted_text",
      createdAt: now,
    },
    brainRun: {
      id: brainRunId,
      ...persistedScope,
      sessionId,
      sourceId,
      operation: run.operation,
      provider: run.provider,
      model: run.model ?? null,
      status: "running",
      input: run.input,
      output: null,
      error: null,
      createdAt: run.startedAt ?? now,
      completedAt: null,
    },
  };
}

function createPersistedSeed(seed: BrainSeedOutput, prelude: BrainSeedPrelude): PersistedBrainSeed {
  const now = new Date("2026-04-30T12:01:00.000Z");
  const sessionId = prelude.session.id;
  const sourceId = prelude.source.id;
  const persistedScope = scopeValues(prelude.session);
  const claims = seed.thoughtMap.claims.map((claim, index) => ({
    id: uuidAt(201 + index),
    seedId: claim.id,
    ...persistedScope,
    sessionId,
    sourceId,
    kind: claim.kind,
    createdAt: now,
  }));
  const claimIds = new Map(claims.map((claim) => [claim.seedId, claim.id]));
  const claimVersions = seed.thoughtMap.claims.map((claim, index) => ({
    id: uuidAt(251 + index),
    seedId: claim.id,
    claimId: requireMappedId(claimIds, claim.id),
    sourceId,
    brainRunId: prelude.brainRun.id,
    moveId: null,
    content: claim.text,
    status: "exploratory" as const,
    confidence: claim.confidence,
    isCurrent: true,
    validFrom: now,
    validUntil: null,
    supersededByVersionId: null,
    createdAt: now,
  }));
  const claimVersionIds = new Map(claimVersions.map((version) => [version.seedId, version.id]));
  const edges = seed.thoughtMap.edges.map((edge, index) => ({
    id: uuidAt(301 + index),
    seedId: edge.id,
    ...persistedScope,
    sessionId,
    fromClaimId: requireMappedId(claimIds, edge.fromClaimId),
    toClaimId: requireMappedId(claimIds, edge.toClaimId),
    kind: edge.kind,
    status: "active" as const,
    label: edge.label,
    createdAt: now,
  }));
  const edgeIds = new Map(edges.map((edge) => [edge.seedId, edge.id]));
  const moveSeeds = [
    {
      id: "move.source_recorded",
      kind: "source.recorded" as const,
      summary: "Submitted the raw idea as the session source.",
      claimIds: [],
      edgeIds: [],
      sourceIds: [sourceId],
      sourceSpanIds: [prelude.submittedSourceSpan.id],
    },
    {
      id: "move.seed_claim_created",
      kind: "seed_claim_created" as const,
      summary: "Created the seed claim.",
      claimIds: [requireMappedId(claimIds, seed.seedClaim.id)],
      edgeIds: [],
      sourceIds: [],
      sourceSpanIds: [],
    },
    {
      id: "move.assumptions_extracted",
      kind: "assumptions_extracted" as const,
      summary: "Extracted assumption claims from the dropped idea.",
      claimIds: seed.assumptions.map((assumption) => requireMappedId(claimIds, assumption.id)),
      edgeIds: Array.from(edgeIds.values()),
      sourceIds: [],
      sourceSpanIds: [],
    },
    {
      id: "move.first_challenge_suggested",
      kind: "first_challenge_suggested" as const,
      summary: "Suggested the first challenge.",
      claimIds: [requireMappedId(claimIds, seed.firstChallenge.targetClaimId)],
      edgeIds: [],
      sourceIds: [],
      sourceSpanIds: [],
    },
  ];
  const persistedMoves = moveSeeds.map((move, index) => ({
    id: uuidAt(501 + index),
    seedId: move.id,
    ...persistedScope,
    sessionId,
    kind: move.kind,
    summary: move.summary,
    payload: {
      claimIds: move.claimIds,
      edgeIds: move.edgeIds,
      sourceIds: move.sourceIds,
      sourceSpanIds: move.sourceSpanIds,
    },
    createdAt: now,
  }));

  return {
    session: prelude.session,
    source: prelude.source,
    submittedSourceSpan: prelude.submittedSourceSpan,
    claims,
    claimVersions,
    edges,
    moves: persistedMoves,
    brainRun: {
      ...prelude.brainRun,
      status: "succeeded",
      output: seed,
      completedAt: now,
    },
    idMaps: {
      claimIds,
      claimVersionIds,
      edgeIds,
    },
  };
}

function scopedRequest(url: string, method = "GET"): Request {
  return new Request(url, { method, headers: scopeHeaders(scope) });
}

function scopedJsonRequest(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: {
      ...scopeHeaders(scope),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function scopeHeaders(requestScope: BrainScope): Record<string, string> {
  return {
    "x-user-id": requestScope.userId ?? "",
    "x-workspace-id": requestScope.workspaceId ?? "",
    "x-project-id": requestScope.projectId ?? "",
    "x-sphere-id": requestScope.sphereId ?? "",
  };
}

function sameScope(left: BrainScope, right: BrainScope): boolean {
  return (
    left.userId === right.userId &&
    left.workspaceId === right.workspaceId &&
    left.projectId === right.projectId &&
    left.sphereId === right.sphereId
  );
}

function requireMappedId(ids: Map<string, string>, seedId: string): string {
  const persistedId = ids.get(seedId);

  assert.ok(persistedId, `Missing persisted id for ${seedId}`);
  return persistedId;
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
