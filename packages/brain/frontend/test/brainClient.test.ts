import assert from "node:assert/strict";
import test from "node:test";
import {
  askPenny,
  createChallengeBrief,
  decideVerifyConfidence,
  fetchBrainHybridSearch,
  fetchBrainRecents,
  fetchClaimDetail,
  fetchSessionCanvas,
  fetchSessionCockpit,
  fetchSessionNote,
  keepBrainRecentIdea,
  issueChallengeFromCandidate,
  respondToChallenge,
  saveBrainObject,
  saveSessionNote,
  selectAutopilotNode,
  startAutopilotCandidate,
  tickAutopilot,
  verifyClaim,
} from "../src/api/brainClient";

test("frontend brain client uses session-scoped Autopilot command routes", async () => {
  const sessionId = uuidAt(101);
  const claimId = uuidAt(201);
  const previousSuggestionMoveId = uuidAt(601);
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    jsonResponse(thinkingModeState(sessionId)),
    jsonResponse(startCandidatePayload(sessionId)),
    jsonResponse(issueChallengePayload(sessionId)),
    jsonResponse(challengeRespondPayload(sessionId, "revise")),
    jsonResponse(challengeBriefPayload(sessionId)),
    jsonResponse(manualFocusPayload(sessionId, claimId)),
  ]);

  try {
    const tick = await tickAutopilot(sessionId, true);
    const started = await startAutopilotCandidate(sessionId, "next_candidate");
    const issued = await issueChallengeFromCandidate(sessionId, "next_candidate");
    const responded = await respondToChallenge({
      challengeId: uuidAt(701),
      response: "revise",
      revisedText: "Pre-seed founders will pay only during urgent fundraising decisions.",
      reasoning: "The broader claim overreached.",
    });
    const brief = await createChallengeBrief(sessionId);
    const manual = await selectAutopilotNode({ sessionId, claimId, previousSuggestionMoveId });

    assert.equal(tick.data.suggestion?.candidateId, "next_candidate");
    assert.equal(tick.data.suggestion?.why, "Challenge the paid founder workflow assumption.");
    assert.equal(tick.data.suggestion?.primaryActionLabel, "Start challenge");
    assert.deepEqual(tick.data.suggestion?.exitCriteria.acceptedMoveKinds, ["challenge_issued"]);
    assert.equal(started.data.move.kind, "autopilot_focus_started");
    assert.equal(issued.data.move.kind, "challenge_issued");
    assert.equal(responded.data.move.kind, "claim_revised");
    assert.equal(responded.data.focusCompletedMove.kind, "focus_completed");
    assert.equal(responded.data.receipt.previousClaimVersionId, uuidAt(401));
    assert.equal(responded.data.nextMove.requiredCommand, "tick_autopilot");
    assert.equal(responded.data.nextMove.expectedMoveKind, "next_move_recomputed");
    assert.equal(brief.data.artifact.kind, "challenge_brief");
    assert.equal(manual.data.move.kind, "manual_node_selected");
    assert.equal(calls[0]?.url, `/api/sessions/${sessionId}/autopilot/tick`);
    assert.equal(calls[0]?.method, "POST");
    assert.deepEqual(calls[0]?.body, { resume: true });
    assert.equal(calls[1]?.url, `/api/sessions/${sessionId}/next-move-candidates/next_candidate/start`);
    assert.equal(calls[1]?.method, "POST");
    assert.deepEqual(calls[1]?.body, {});
    assert.equal(calls[2]?.url, `/api/sessions/${sessionId}/next-move-candidates/next_candidate/challenge`);
    assert.equal(calls[2]?.method, "POST");
    assert.deepEqual(calls[2]?.body, {});
    assert.equal(calls[3]?.url, `/api/challenges/${uuidAt(701)}/respond`);
    assert.equal(calls[3]?.method, "POST");
    assert.deepEqual(calls[3]?.body, {
      response: "revise",
      revisedText: "Pre-seed founders will pay only during urgent fundraising decisions.",
      reasoning: "The broader claim overreached.",
    });
    assert.equal(calls[4]?.url, `/api/sessions/${sessionId}/challenge-brief`);
    assert.equal(calls[4]?.method, "POST");
    assert.deepEqual(calls[4]?.body, {});
    assert.equal(calls[5]?.url, `/api/sessions/${sessionId}/focus/manual`);
    assert.equal(calls[5]?.method, "POST");
    assert.deepEqual(calls[5]?.body, { claimId, previousSuggestionMoveId });

    for (const call of calls) {
      assert.equal(call.headers["content-type"], "application/json");
      assert.equal(call.headers["x-user-id"], undefined);
      assert.equal(call.headers["x-project-id"], undefined);
    }
  } finally {
    restoreFetch();
  }
});

test("frontend Ask Penny falls back locally when the request cannot reach the API", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    throw new TypeError("Failed to fetch");
  };

  try {
    const response = await askPenny({
      question: "why is the sky blue?",
      currentStepTitle: "Produce the final takeaway",
      localContext:
        "Goal: understand the current lesson. Current step: Produce the final takeaway. Core idea: explain the idea from local context.",
    });

    assert.equal(response.data.provider, "heuristic");
    assert.equal(response.data.model, null);
    assert.match(response.data.answer, /blue wavelengths/);
    assert.doesNotMatch(response.data.answer, /Failed to fetch/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("frontend Ask Penny local fallback answers conversational arithmetic", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    throw new TypeError("Failed to fetch");
  };

  try {
    const response = await askPenny({
      question: "Hello what is 4x4",
      currentStepTitle: "Name the program",
      localContext:
        "Goal: Understand what YC does. Current step: Name the program. Core idea: Separate program value from application scoring.",
    });

    assert.equal(response.data.provider, "heuristic");
    assert.equal(response.data.model, null);
    assert.match(response.data.answer, /4 x 4 = 16/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("frontend Ask Penny still uses the live API when it responds", async () => {
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    jsonResponse({
      answer: "Use the current lesson context to make one concrete distinction.",
      provider: "anthropic",
      model: "claude-test",
    }),
  ]);

  try {
    const response = await askPenny({
      question: "what does this mean?",
      currentStepTitle: "Produce the final takeaway",
      localContext: "Goal: understand the current lesson.",
    });

    assert.equal(calls[0]?.url, "/brain/learn/ask");
    assert.equal(calls[0]?.method, "POST");
    assert.deepEqual(calls[0]?.body, {
      question: "what does this mean?",
      currentStepTitle: "Produce the final takeaway",
      localContext: "Goal: understand the current lesson.",
    });
    assert.equal(response.data.provider, "anthropic");
    assert.equal(response.data.model, "claude-test");
  } finally {
    restoreFetch();
  }
});

test("frontend Ask Penny generic fallback gives the next step instead of prompt scaffolding", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    throw new TypeError("Failed to fetch");
  };

  try {
    const response = await askPenny({
      question: "Hello?",
      currentStepTitle: "Name the end state",
      localContext:
        "Goal: I want to write an expos essay at Harvard on neoliberalism at Harvard Current step: Name the end state Core idea: Neoliberalism manifests in distinct, citable ways at Harvard suitable for an undergraduate expository essay Keep the end state tied to: Neoliberalism manifests in distinct, citable ways at Harvard suitable for an undergraduate.",
    });

    assert.equal(response.data.provider, "heuristic");
    assert.match(response.data.answer, /Next step:/);
    assert.match(response.data.answer, /Neoliberalism manifests in distinct, citable ways/);
    assert.doesNotMatch(response.data.answer, /Use the lesson context as the boundary/);
    assert.ok(response.data.answer.length < 700);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("frontend brain client fetches Brain claim detail from the graph detail route", async () => {
  const claimId = uuidAt(201);
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [jsonResponse(claimDetailPayload(claimId))]);

  try {
    const detail = await fetchClaimDetail(claimId);

    assert.equal(calls[0]?.url, `/brain/claims/${claimId}/detail`);
    assert.equal(calls[0]?.method, "GET");
    assert.equal(detail.data.claim.id, claimId);
    assert.equal(detail.data.connectedClaims[0]?.edge.kind, "supports");
    assert.equal(detail.data.moves[0]?.payload?.reasoning, "The source note makes the support explicit.");
  } finally {
    restoreFetch();
  }
});

test("frontend brain client uses persisted recents and notes routes", async () => {
  const sessionId = uuidAt(101);
  const recentId = uuidAt(901);
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    jsonResponse({
      recents: [
        {
          id: recentId,
          rawIdea: "A raw founder strategy idea.",
          createdAt: "2026-04-30T00:00:00.000Z",
        },
      ],
    }),
    jsonResponse({
      recent: {
        id: recentId,
        rawIdea: "A raw founder strategy idea.",
        createdAt: "2026-04-30T00:00:00.000Z",
      },
    }),
    jsonResponse({
      note: {
        sessionId,
        content: "The key risk is willingness to pay.",
        updatedAt: "2026-04-30T00:00:01.000Z",
      },
    }),
    jsonResponse({
      note: {
        sessionId,
        content: "Preserve the founder workflow risk.",
        updatedAt: "2026-04-30T00:00:02.000Z",
      },
    }),
  ]);

  try {
    const recents = await fetchBrainRecents();
    const kept = await keepBrainRecentIdea("A raw founder strategy idea.");
    const note = await fetchSessionNote(sessionId);
    const savedNote = await saveSessionNote({ sessionId, content: "Preserve the founder workflow risk." });

    assert.equal(recents.data.recents[0]?.id, recentId);
    assert.equal(kept.data.recent.rawIdea, "A raw founder strategy idea.");
    assert.equal(note.data.note?.content, "The key risk is willingness to pay.");
    assert.equal(savedNote.data.note?.content, "Preserve the founder workflow risk.");
    assert.equal(calls[0]?.url, "/api/brain/recents");
    assert.equal(calls[0]?.method, "GET");
    assert.equal(calls[1]?.url, "/api/brain/recents");
    assert.equal(calls[1]?.method, "POST");
    assert.deepEqual(calls[1]?.body, { rawIdea: "A raw founder strategy idea." });
    assert.equal(calls[2]?.url, `/api/sessions/${sessionId}/notes`);
    assert.equal(calls[2]?.method, "GET");
    assert.equal(calls[3]?.url, `/api/sessions/${sessionId}/notes`);
    assert.equal(calls[3]?.method, "PUT");
    assert.deepEqual(calls[3]?.body, { content: "Preserve the founder workflow risk." });
  } finally {
    restoreFetch();
  }
});

test("frontend brain client uses session canvas, save object, and optional hybrid search contracts", async () => {
  const sessionId = uuidAt(101);
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    jsonResponse({
      nodes: [
        {
          id: `claim:${uuidAt(201)}`,
          kind: "assumption",
          title: "Load-bearing assumption",
          summary: "Founders will pay for structured thinking.",
          status: "exploratory",
          confidence: 42,
          refs: { claimId: uuidAt(201) },
          actions: ["check", "verify", "learn", "related"],
        },
      ],
      edges: [],
      recommendedPath: [`claim:${uuidAt(201)}`],
      selectedNodeId: `claim:${uuidAt(201)}`,
    }),
    jsonResponse({
      object: {
        id: uuidAt(901),
        objectType: "concept",
        sessionId,
        title: "Canvas node",
        summary: "Saved from canvas.",
        status: "saved",
        createdAt: "2026-04-30T00:00:00.000Z",
        updatedAt: "2026-04-30T00:00:00.000Z",
      },
    }),
    jsonResponse({
      sourceOfTruth: "brain_embeddings_plus_brain_objects_notes_claim_versions_recents_artifacts",
      mode: "hybrid_json_embedding_fallback",
      query: "Founders will pay for structured thinking.",
      results: [
        {
          objectId: "match-1",
          objectType: "claim_version",
          title: "Prior Brain claim",
          preview: "A related thought from Brain.",
          sessionId,
          score: 0.78,
          semanticScore: 0.5,
          lexicalScore: 0.28,
          source: "hybrid",
          metadata: { claimId: uuidAt(201) },
          updatedAt: "2026-04-30T00:00:00.000Z",
        },
      ],
    }),
    new Response(JSON.stringify({ error: { message: "not ready" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    }),
  ]);

  try {
    const canvas = await fetchSessionCanvas(sessionId);
    const saved = await saveBrainObject({
      sessionId,
      objectType: "concept",
      title: "Canvas node",
      summary: "Saved from canvas.",
      content: "Founders will pay for structured thinking.",
    });
    const related = await fetchBrainHybridSearch({
      query: "Founders will pay for structured thinking.",
      sessionId,
      claimId: uuidAt(201),
      mode: "learn",
      limit: 5,
    });
    const unavailable = await fetchBrainHybridSearch({ query: "No endpoint yet" });

    assert.equal(calls[0]?.url, `/api/sessions/${sessionId}/canvas`);
    assert.equal(calls[0]?.method, "GET");
    assert.equal(canvas.data.nodes[0]?.id, `claim:${uuidAt(201)}`);
    assert.deepEqual(canvas.data.recommendedPath, [`claim:${uuidAt(201)}`]);
    assert.equal(saved.data.object.id, uuidAt(901));
    assert.equal(related.data.available, true);
    assert.equal(related.data.results[0]?.title, "Prior Brain claim");
    assert.equal(unavailable.data.available, false);
    assert.equal(calls[1]?.url, "/api/brain/objects/save");
    assert.equal(calls[1]?.method, "POST");
    assert.deepEqual(calls[1]?.body, {
      sessionId,
      objectType: "concept",
      title: "Canvas node",
      summary: "Saved from canvas.",
      content: "Founders will pay for structured thinking.",
    });
    assert.equal(calls[2]?.url, "/api/brain/search?q=Founders+will+pay+for+structured+thinking.&limit=5");
    assert.equal(calls[2]?.method, "GET");
    assert.equal(calls[2]?.body, null);
    assert.equal(calls[3]?.url, "/api/brain/search?q=No+endpoint+yet");
  } finally {
    restoreFetch();
  }
});

test("frontend brain client runs Verify and decides confidence", async () => {
  const sessionId = uuidAt(101);
  const claimId = uuidAt(201);
  const verifyMoveId = uuidAt(901);
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    jsonResponse(verifyPayload({ claimId, sessionId, verifyMoveId })),
    jsonResponse(verifyConfidencePayload({ claimId, verifyMoveId })),
  ]);

  try {
    const verified = await verifyClaim({
      sessionId,
      claimId,
      currentClaimText: "Pre-seed founders will pay for structured thinking.",
    });
    const decision = await decideVerifyConfidence({
      verifyMoveId,
      decision: "accept",
      reason: "The citation directly tests the premise.",
    });

    assert.equal(verified.data.verdict, "mixed");
    assert.equal(verified.data.evidenceCards[0]?.stance, "supports");
    assert.equal(verified.data.citations[0]?.sourceUrl, "https://example.test/source");
    assert.equal(verified.data.citationSources[0]?.source.kind, "verification_citation");
    assert.equal(verified.data.citationSources[0]?.sourceSpan.label, "verify_evidence");
    assert.equal(verified.data.citationSources[0]?.sourceSpan.claimVersionId, uuidAt(401));
    assert.equal(verified.data.confidenceUpdate.decision, "pending_user_decision");
    assert.equal(decision.data.move.kind, "confidence_update_accepted");
    assert.equal(decision.data.confidenceUpdate.accepted, true);
    assert.equal(calls[0]?.url, "/brain/verify");
    assert.equal(calls[0]?.method, "POST");
    assert.deepEqual(calls[0]?.body, {
      sessionId,
      claimId,
      currentClaimText: "Pre-seed founders will pay for structured thinking.",
    });
    assert.equal(calls[1]?.url, "/brain/verify/confidence");
    assert.equal(calls[1]?.method, "POST");
    assert.deepEqual(calls[1]?.body, {
      verifyMoveId,
      decision: "accept",
      reason: "The citation directly tests the premise.",
    });
  } finally {
    restoreFetch();
  }
});

test("frontend brain client normalizes cockpit Autopilot state for the existing UI", async () => {
  const sessionId = uuidAt(101);
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [jsonResponse(cockpitPayload(sessionId))]);

  try {
    const cockpit = await fetchSessionCockpit(sessionId);

    assert.equal(calls[0]?.url, `/api/sessions/${sessionId}/cockpit`);
    assert.equal(calls[0]?.method, "GET");
    assert.equal(cockpit.data.ideaMap.claims[0]?.id, uuidAt(201));
    assert.equal(cockpit.data.moves[0]?.type, "challenge_issued");
    assert.equal(cockpit.data.autopilot.suggestion?.candidateId, "next_candidate");
    assert.equal(cockpit.data.autopilot.suggestion?.label, "Challenge");
    assert.equal(cockpit.data.autopilot.suggestion?.primaryActionLabel, "Start challenge");
    assert.equal(cockpit.data.autopilot.suggestion?.why, "Challenge the paid founder workflow assumption.");
    assert.equal(cockpit.data.autopilot.suggestion?.exitCriteria.label, "Issue a challenge.");
    assert.equal(cockpit.data.graphPath.layout, "top_down");
    assert.equal(cockpit.data.graphPath.nodes[0]?.role, "main_claim");
    assert.equal(cockpit.data.graphPath.nodes[0]?.selected, true);
    assert.equal(cockpit.data.graphPath.edges[0]?.edgeId, uuidAt(301));
    assert.equal(cockpit.data.activeChallenge?.targetClaimId, uuidAt(201));
    assert.equal(cockpit.data.activeChallenge?.challenge, "Admiration is not paid urgency.");
    assert.equal(cockpit.data.latestArtifact?.title, "Challenge Brief");
    assert.equal(cockpit.data.workStructure?.structureType, "startup");
    assert.equal(cockpit.data.workStructure?.steps[0]?.id, "challenge");
    assert.equal(cockpit.data.workStructure?.steps[0]?.detailChoices[0]?.label, "Defend choice");
  } finally {
    restoreFetch();
  }
});

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

function mockFetch(calls: FetchCall[], responses: Response[]): () => void {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const headers = headersRecord(init?.headers);
    const body = typeof init?.body === "string" && init.body.trim() ? JSON.parse(init.body) : null;
    const response = responses.shift();

    calls.push({ url, method, headers, body });

    if (!response) {
      return new Response(JSON.stringify({ error: { message: "Unexpected fetch call." } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    return response;
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

function headersRecord(headers: HeadersInit | undefined): Record<string, string> {
  const record: Record<string, string> = {};

  new Headers(headers).forEach((value, key) => {
    record[key] = value;
  });

  return record;
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function cockpitPayload(sessionId: string) {
  return {
    session: {
      id: sessionId,
      status: "open",
    },
    ideaMap: {
      claims: [
        {
          id: uuidAt(201),
          text: "Pre-seed founders will pay for structured thinking.",
          kind: "assumption",
          status: "exploratory",
          confidence: 42,
        },
      ],
      edges: [],
      keyInsight: "Founder urgency matters.",
    },
    workStructure: {
      structureType: "startup",
      label: "Startup Work Order",
      description: "A live order for turning the idea into a testable startup thesis.",
      activeStepId: "challenge",
      steps: [
        {
          id: "challenge",
          title: "Pressure-test the riskiest claim",
          purpose: "Attack the assumption that the rest of the startup depends on.",
          rank: 1,
          fragility: 100,
          importance: 100,
          status: "active",
          claimIds: [uuidAt(201)],
          edgeIds: [uuidAt(301)],
          whyNow: "The wedge depends on willingness to pay.",
          detailChoices: [
            {
              id: "defend",
              label: "Defend choice",
              description: "Choose evidence that would defend the claim.",
              claimIds: [uuidAt(201)],
              edgeIds: [uuidAt(301)],
            },
          ],
        },
      ],
    },
    graphPath: {
      layout: "top_down",
      generatedFrom: "claims_edges_moves",
      focusClaimId: uuidAt(201),
      nodes: [
        {
          id: `claim:${uuidAt(201)}`,
          claimId: uuidAt(201),
          label: "Pre-seed founders will pay for structured thinking.",
          role: "main_claim",
          kind: "assumption",
          status: "exploratory",
          confidence: 42,
          depth: 0,
          lane: 0,
          rank: 1,
          moveCount: 1,
          edgeIds: [uuidAt(301)],
          selected: true,
          suggested: true,
        },
      ],
      edges: [
        {
          id: `edge:${uuidAt(301)}`,
          edgeId: uuidAt(301),
          fromNodeId: `claim:${uuidAt(201)}`,
          toNodeId: `claim:${uuidAt(202)}`,
          kind: "challenges",
          status: "active",
          label: "shaky_assumption",
        },
      ],
      meta: {
        nodeCount: 1,
        edgeCount: 1,
        maxDepth: 0,
      },
    },
    moves: [
      {
        id: uuidAt(501),
        kind: "challenge_issued",
        summary: "Issued a challenge.",
        createdAt: "2026-04-29T00:00:05.000Z",
      },
    ],
    autopilot: thinkingModeState(sessionId),
    activeChallenge: {
      id: uuidAt(701),
      targetClaimId: uuidAt(201),
      failureType: "shaky_assumption",
      strength: "strong",
      critique: "Admiration is not paid urgency.",
      targetClaim: {
        id: uuidAt(201),
        text: "Pre-seed founders will pay for structured thinking.",
        kind: "assumption",
        status: "exploratory",
        confidence: 42,
      },
      critiqueClaim: null,
    },
    latestArtifact: {
      id: uuidAt(801),
      kind: "challenge_brief",
      title: "Challenge Brief",
      summary: "Founder paid workflow tightened.",
      payload: {},
      createdAt: "2026-04-29T00:00:10.000Z",
    },
  };
}

function claimDetailPayload(claimId: string) {
  const supportClaimId = uuidAt(202);
  const edgeId = uuidAt(301);

  return {
    claim: {
      id: claimId,
      text: "Neoliberalism at Harvard can be clearly defined and bounded.",
      kind: "belief",
      status: "exploratory",
      confidence: 64,
    },
    currentVersion: {
      id: uuidAt(401),
      claimId,
      sourceId: uuidAt(501),
      brainRunId: null,
      moveId: null,
      content: "Neoliberalism at Harvard can be clearly defined and bounded.",
      status: "exploratory",
      confidence: 64,
      state: "current",
      isCurrent: true,
      validFrom: "2026-04-29T00:00:00.000Z",
      validUntil: null,
      supersededByVersionId: null,
      createdAt: "2026-04-29T00:00:00.000Z",
    },
    oldVersions: [],
    versions: [],
    confidenceHistory: [],
    moves: [
      {
        id: uuidAt(601),
        kind: "claim.created",
        summary: "Created the bounded topic claim.",
        claimIds: [claimId],
        edgeIds: [edgeId],
        artifactIds: [],
        payload: {
          reasoning: "The source note makes the support explicit.",
        },
        createdAt: "2026-04-29T00:00:01.000Z",
      },
    ],
    provenance: {
      source: null,
      sources: [],
      spans: [],
    },
    artifactReferences: [],
    connectedClaims: [
      {
        edge: {
          id: edgeId,
          fromClaimId: supportClaimId,
          toClaimId: claimId,
          kind: "supports",
          status: "active",
          label: "institutional evidence",
          createdAt: "2026-04-29T00:00:02.000Z",
        },
        direction: "incoming",
        claim: {
          id: supportClaimId,
          text: "Harvard institutional practices provide concrete evidence.",
          kind: "assumption",
          status: "exploratory",
          confidence: 58,
        },
      },
    ],
    activeChallenges: [],
    learnedConcepts: [],
  };
}

function thinkingModeState(sessionId: string) {
  const selectedCandidate = candidate(sessionId);

  return {
    status: "ready",
    brainId: sessionId,
    sessionId,
    focusState: {
      sessionId,
      mode: "challenge",
      focusedClaimId: uuidAt(201),
      focusedEdgeId: uuidAt(301),
      source: "autopilot_suggestion",
      suggestionMoveId: uuidAt(601),
      manualMoveId: null,
      paused: false,
      reason: "Challenge the paid founder workflow assumption.",
      updatedAt: "2026-04-29T00:00:09.000Z",
    },
    candidates: [selectedCandidate],
    selectedCandidate,
    persistedMoveIds: [uuidAt(601)],
    move: {
      id: uuidAt(601),
      kind: "next_move_recomputed",
      summary: "Recomputed next moves.",
    },
  };
}

function startCandidatePayload(sessionId: string) {
  return {
    status: "started",
    brainId: sessionId,
    sessionId,
    focusState: {
      ...thinkingModeState(sessionId).focusState,
      source: "autopilot_started",
    },
    selectedCandidate: candidate(sessionId),
    move: {
      id: uuidAt(602),
      kind: "autopilot_focus_started",
      summary: "Started Autopilot focus.",
    },
  };
}

function issueChallengePayload(sessionId: string) {
  return {
    status: "issued",
    brainId: sessionId,
    sessionId,
    challengeRound: challengeRound(sessionId, "open"),
    targetClaim: claim(),
    critiqueClaim: {
      id: uuidAt(202),
      text: "Admiration is not paid urgency.",
      kind: "belief",
      status: "exploratory",
      confidence: 80,
    },
    challengeEdge: {
      id: uuidAt(301),
      fromClaimId: uuidAt(202),
      toClaimId: uuidAt(201),
      kind: "challenges",
      status: "active",
      label: "shaky_assumption",
    },
    critique: "Admiration is not paid urgency.",
    failureType: "shaky_assumption",
    strength: "strong",
    whyThis: "The wedge depends on willingness to pay.",
    whatWouldResolveIt: "Name the urgent paid moment.",
    suggestedNextMove: "Defend, Revise, or Absorb.",
    move: {
      id: uuidAt(501),
      kind: "challenge_issued",
      summary: "Issued a challenge.",
    },
  };
}

function challengeRespondPayload(sessionId: string, response: "defend" | "revise" | "absorb") {
  const moveKind =
    response === "defend" ? "user_defended" : response === "revise" ? "claim_revised" : "critique_absorbed";

  return {
    status: "responded",
    challengeRound: {
      ...challengeRound(sessionId, "responded"),
      response,
      responseMoveId: uuidAt(502),
      focusCompletedMoveId: uuidAt(503),
      respondedAt: "2026-04-29T00:00:15.000Z",
    },
    response,
    targetClaim: claim({
      text: "Pre-seed founders will pay only during urgent fundraising decisions.",
    }),
    critiqueClaimId: uuidAt(202),
    challengeEdge: {
      id: uuidAt(301),
      fromClaimId: uuidAt(202),
      toClaimId: uuidAt(201),
      kind: "challenges",
      status: "active",
      label: "shaky_assumption",
    },
    move: {
      id: uuidAt(502),
      kind: moveKind,
      summary: "Recorded challenge response.",
    },
    focusCompletedMove: {
      id: uuidAt(503),
      kind: "focus_completed",
      summary: "Completed challenge focus.",
    },
    derivedEffects: [
      {
        id: uuidAt(601),
        kind: "shape_candidate",
        status: "pending_review",
        version: 1,
        title: "Revision after pressure",
        summary: "The user changed a claim in response to a challenge.",
        payload: {},
        createdAt: "2026-04-29T00:00:16.000Z",
      },
    ],
    receipt: {
      response,
      moveKind,
      targetClaimId: uuidAt(201),
      challengeEdgeId: uuidAt(301),
      previousClaimVersionId: response === "revise" ? uuidAt(401) : null,
      currentClaimVersionId: response === "revise" ? uuidAt(402) : uuidAt(401),
      claimTextChanged: response === "revise",
      unresolvedRisk: response === "absorb",
    },
    nextMove: nextMoveDirective(sessionId),
  };
}

function challengeBriefPayload(sessionId: string) {
  return {
    status: "created",
    artifact: {
      id: uuidAt(801),
      sessionId,
      kind: "challenge_brief",
      title: "Challenge Brief",
      summary: "Founder paid workflow tightened.",
      payload: {},
      createdAt: "2026-04-29T00:00:20.000Z",
    },
    move: {
      id: uuidAt(802),
      kind: "artifact_created",
      summary: "Created Challenge Brief.",
    },
    brief: {},
  };
}

function manualFocusPayload(sessionId: string, claimId: string) {
  return {
    status: "paused",
    brainId: sessionId,
    sessionId,
    focusState: {
      ...thinkingModeState(sessionId).focusState,
      source: "manual_selection",
      manualMoveId: uuidAt(603),
      paused: true,
    },
    focusClaim: {
      id: claimId,
      text: "Pre-seed founders will pay for structured thinking.",
      kind: "assumption",
      status: "exploratory",
      confidence: 42,
    },
    move: {
      id: uuidAt(603),
      kind: "manual_node_selected",
      summary: "User manually selected a graph node.",
    },
  };
}

function verifyPayload({
  claimId,
  sessionId,
  verifyMoveId,
}: {
  claimId: string;
  sessionId: string;
  verifyMoveId: string;
}) {
  return {
    verdict: "mixed",
    summary: "The evidence supports the mechanism but not the full willingness-to-pay claim.",
    evidenceCards: [
      {
        title: "Founder workflow survey",
        summary: "The source supports urgency around fundraising decisions.",
        stance: "supports",
        sourceName: "Example Source",
        sourceUrl: "https://example.test/source",
        citation: "Founders report urgency around fundraising choices.",
      },
    ],
    citations: [
      {
        title: "Founder workflow survey",
        sourceName: "Example Source",
        sourceUrl: "https://example.test/source",
        citation: "Founders report urgency around fundraising choices.",
      },
    ],
    unsupportedParts: [
      {
        part: "Will pay",
        reason: "The citation shows urgency, not purchase intent.",
        neededEvidence: "A direct payment test.",
      },
    ],
    confidenceDeltaSuggestion: -4,
    whatWouldChangeThis: "A paid pilot would change the verdict.",
    nextQuestion: "Which founder segment has paid urgency?",
    recipe: {
      steps: [
        verifyRecipeStep("decompose_claim"),
        verifyRecipeStep("search_gather"),
        verifyRecipeStep("evaluate_evidence"),
        verifyRecipeStep("synthesize_verdict"),
        verifyRecipeStep("suggest_confidence_change"),
      ],
    },
    targetClaim: {
      id: claimId,
      versionId: uuidAt(401),
      kind: "assumption",
      status: "exploratory",
      text: "Pre-seed founders will pay for structured thinking.",
      confidence: 42,
    },
    move: {
      id: verifyMoveId,
      kind: "verify_run",
      summary: "Verified claim: mixed.",
      claimIds: [claimId],
      edgeIds: [],
      artifactIds: [],
    },
    brainRun: {
      id: uuidAt(902),
      status: "succeeded",
    },
    citationSources: [
      {
        evidenceTitle: "Founder workflow survey",
        source: {
          id: uuidAt(903),
          kind: "verification_citation",
          rawText: "Title: Founder workflow survey",
        },
        sourceSpan: {
          id: uuidAt(904),
          sourceId: uuidAt(903),
          claimId,
          claimVersionId: uuidAt(401),
          label: "verify_evidence",
        },
      },
    ],
    confidenceUpdate: {
      suggestedDelta: -4,
      autoApplied: false,
      decision: "pending_user_decision",
    },
  };
}

function verifyConfidencePayload({ claimId, verifyMoveId }: { claimId: string; verifyMoveId: string }) {
  return {
    decision: "accept",
    targetClaim: {
      id: claimId,
      versionId: uuidAt(402),
      kind: "assumption",
      status: "exploratory",
      text: "Pre-seed founders will pay for structured thinking.",
      confidence: 38,
    },
    move: {
      id: uuidAt(905),
      kind: "confidence_update_accepted",
      summary: "Accepted Verify confidence suggestion.",
      claimIds: [claimId],
      edgeIds: [],
      artifactIds: [],
    },
    confidenceUpdate: {
      verifyMoveId,
      suggestedDelta: -4,
      accepted: true,
      previousConfidence: 42,
      currentConfidence: 38,
      appliedDelta: -4,
      cascade: [],
    },
  };
}

function verifyRecipeStep(step: string) {
  return {
    step,
    title: step.replaceAll("_", " "),
    status: "completed",
    summary: "Completed.",
    inputs: [],
    outputs: [],
  };
}

function challengeRound(sessionId: string, status: "open" | "responded") {
  return {
    id: uuidAt(701),
    sessionId,
    status,
    response: null,
    targetClaimId: uuidAt(201),
    targetClaimVersionId: uuidAt(401),
    critiqueClaimId: uuidAt(202),
    critiqueClaimVersionId: uuidAt(402),
    challengeEdgeId: uuidAt(301),
    challengeMoveId: uuidAt(501),
    responseMoveId: null,
    focusCompletedMoveId: null,
    failureType: "shaky_assumption",
    strength: "strong",
    critique: "Admiration is not paid urgency.",
    whyThis: "The wedge depends on willingness to pay.",
    whatWouldResolveIt: "Name the urgent paid moment.",
    createdAt: "2026-04-29T00:00:10.000Z",
    respondedAt: null,
    updatedAt: "2026-04-29T00:00:10.000Z",
  };
}

function claim(overrides: Partial<{ text: string }> = {}) {
  return {
    id: uuidAt(201),
    text: overrides.text ?? "Pre-seed founders will pay for structured thinking.",
    kind: "assumption",
    status: "exploratory",
    confidence: 42,
  };
}

function nextMoveDirective(sessionId: string) {
  return {
    status: "client_tick_required",
    requiredCommand: "tick_autopilot",
    sessionId,
    method: "POST",
    endpoint: `/api/sessions/${sessionId}/autopilot/tick`,
    body: {
      resume: true,
    },
    reason: "Challenge response completed focus.",
    expectedMoveKind: "next_move_recomputed",
  };
}

function candidate(sessionId: string) {
  return {
    id: uuidAt(701),
    sessionId,
    candidateId: "next_candidate",
    action: "challenge",
    mode: "challenge",
    targetClaimId: uuidAt(201),
    targetEdgeId: uuidAt(301),
    score: 920,
    reason: "Challenge the paid founder workflow assumption.",
    reasonCodes: ["load_bearing"],
    exitCriteria: {
      label: "Issue a challenge.",
      acceptedMoveKinds: ["challenge_issued"],
    },
    selected: true,
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
