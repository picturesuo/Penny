import assert from "node:assert/strict";
import test from "node:test";
import {
  askPenny,
  addCheckNode,
  commitCheckCycle,
  createChallengeBrief,
  createCheckCycle,
  createCheckSession,
  compareCreateProviders,
  createNext,
  createLearnSession,
  decideVerifyConfidence,
  deleteBrainSource,
  exportCodingPrompt,
  fetchBrainDemoFixtureImport,
  fetchBrainImportJob,
  fetchBrainHybridSearch,
  fetchBrainMemoryProfile,
  fetchBrainRecents,
  fetchCheckSession,
  fetchClaimDetail,
  fetchSessionCanvas,
  fetchSessionCockpit,
  fetchSessionNote,
  keepBrainRecentIdea,
  issueChallengeFromCandidate,
  importBrainSource,
  retrieveBrainMemory,
  reviewBrainMemory,
  respondToChallenge,
  runCheckSprint,
  saveBrainObject,
  saveCheckToBrain,
  saveSessionNote,
  selectAutopilotNode,
  startAutopilotCandidate,
  submitCreateExportFeedback,
  tickAutopilot,
  verifyClaim,
} from "../src/api/brainClient";

test("frontend brain client creates Learn sessions from landing prompts", async () => {
  const sessionId = uuidAt(101);
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    jsonResponse({
      session: { id: sessionId, status: "active" },
      source: { kind: "raw_idea", rawText: "Teach me pricing strategy." },
      ideaMap: { claims: [], edges: [], keyInsight: "Pricing needs a buyer, value unit, and test." },
      explorationPaths: [],
      firstChallenge: null,
      learn: {
        learningPlan: {
          expertRole: "A pricing expert teaching through examples.",
          goal: "I want to understand pricing strategy.",
          paragraphFit: "one_subgroup_per_page",
          groups: [],
        },
      },
      autopilot: thinkingModeState(sessionId),
    }),
  ]);

  try {
    const response = await createLearnSession("Teach me pricing strategy.");

    assert.equal(calls[0]?.url, "/api/learn/session");
    assert.equal(calls[0]?.method, "POST");
    assert.deepEqual(calls[0]?.body, {
      rawIdea: "Teach me pricing strategy.",
      autopilot: { limit: 6 },
    });
    assert.equal(response.data.session?.id, sessionId);
    assert.equal(response.data.learn?.learningPlan?.goal, "I want to understand pricing strategy.");
    assert.equal(response.data.autopilot?.selectedCandidate?.candidateId, "next_candidate");
  } finally {
    restoreFetch();
  }
});

test("frontend brain client sends source material for Learn file drops", async () => {
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    jsonResponse({
      session: { id: uuidAt(101), status: "active" },
      source: { kind: "raw_idea", rawText: "Teach this chapter." },
      ideaMap: { claims: [], edges: [], keyInsight: "A chapter can be clustered into local contexts." },
      explorationPaths: [],
      firstChallenge: null,
      learn: { learningPlan: { expertRole: "A teacher.", goal: "Learn the chapter.", paragraphFit: "one_subgroup_per_page", groups: [] } },
      autopilot: thinkingModeState(uuidAt(101)),
    }),
  ]);

  try {
    await createLearnSession("Teach this chapter.", {
      kind: "pdf",
      fileName: "chapter.pdf",
      extractedText: "Chapter text",
    });

    assert.deepEqual(calls[0]?.body, {
      rawIdea: "Teach this chapter.",
      sourceMaterial: {
        kind: "pdf",
        fileName: "chapter.pdf",
        extractedText: "Chapter text",
      },
      autopilot: { limit: 6 },
    });
  } finally {
    restoreFetch();
  }
});

test("frontend brain client uses Check V2 session, cycle, commit, sprint, node, and save routes", async () => {
  const sessionId = uuidAt(151);
  const cycleId = uuidAt(251);
  const recommendationId = uuidAt(351);
  const checkSession = checkSessionPayload(sessionId, cycleId, recommendationId);
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    jsonResponse({ session: checkSession }),
    jsonResponse({ session: checkSession }),
    jsonResponse({ session: checkSession, cycle: checkSession.cycles[0], reusedActiveCycle: true }),
    jsonResponse({
      session: checkSession,
      node: {
        id: uuidAt(451),
        kind: "question",
        title: "What would break first?",
        body: "Find the first objection.",
        status: "open",
        createdAt: "2026-05-05T12:00:00.000Z",
        updatedAt: "2026-05-05T12:00:00.000Z",
      },
    }),
    jsonResponse({
      session: checkSession,
      cycle: { ...checkSession.cycles[0], status: "committed" },
      breakthrough: null,
    }),
    jsonResponse({
      session: checkSession,
      cycle: { ...checkSession.cycles[0], status: "completed" },
      synthesis: {
        whatChanged: ["The claim got sharper."],
        possibleBreakthrough: null,
        nextSuggestedCheck: "Pressure-test the objection.",
        saveToBrain: { recommended: true, label: "Save Check synthesis to Brain" },
      },
    }),
    jsonResponse({
      session: { ...checkSession, status: "saved" },
      savedObject: {
        id: uuidAt(551),
        objectType: "check_breakthrough",
        title: "Check: Penny pitch",
        summary: "Sharper claim.",
        createdAt: "2026-05-05T12:00:00.000Z",
      },
    }),
  ]);

  try {
    const created = await createCheckSession({ rawText: "Penny needs a sharper investor pitch." });
    const fetched = await fetchCheckSession(sessionId);
    const cycle = await createCheckCycle(sessionId);
    const node = await addCheckNode(sessionId, {
      kind: "question",
      title: "What would break first?",
      body: "Find the first objection.",
    });
    const committed = await commitCheckCycle(cycleId, {
      commitment: "Rewrite the claim around investor readiness.",
      recommendationId,
      stance: "modify",
    });
    const sprint = await runCheckSprint(cycleId, {
      sprintText: "The new claim names one investor-readiness decision.",
    });
    const saved = await saveCheckToBrain(sessionId);

    assert.equal(created.data.session.id, sessionId);
    assert.equal(fetched.data.session.id, sessionId);
    assert.equal(cycle.data.reusedActiveCycle, true);
    assert.equal(node.data.node.kind, "question");
    assert.equal(committed.data.cycle.status, "committed");
    assert.equal(sprint.data.synthesis.whatChanged[0], "The claim got sharper.");
    assert.equal(saved.data.savedObject.objectType, "check_breakthrough");
    assert.equal(calls[0]?.url, "/api/check/session");
    assert.equal(calls[0]?.method, "POST");
    assert.deepEqual(calls[0]?.body, { rawText: "Penny needs a sharper investor pitch." });
    assert.equal(calls[1]?.url, `/api/check/session/${sessionId}`);
    assert.equal(calls[1]?.method, "GET");
    assert.equal(calls[2]?.url, `/api/check/session/${sessionId}/cycle`);
    assert.deepEqual(calls[2]?.body, {});
    assert.equal(calls[3]?.url, `/api/check/session/${sessionId}/node`);
    assert.deepEqual(calls[3]?.body, {
      kind: "question",
      title: "What would break first?",
      body: "Find the first objection.",
    });
    assert.equal(calls[4]?.url, `/api/check/cycle/${cycleId}/commit`);
    assert.deepEqual(calls[4]?.body, {
      commitment: "Rewrite the claim around investor readiness.",
      recommendationId,
      stance: "modify",
    });
    assert.equal(calls[5]?.url, `/api/check/cycle/${cycleId}/sprint`);
    assert.deepEqual(calls[5]?.body, {
      sprintText: "The new claim names one investor-readiness decision.",
    });
    assert.equal(calls[6]?.url, `/api/check/session/${sessionId}/save-to-brain`);
    assert.deepEqual(calls[6]?.body, {});
  } finally {
    restoreFetch();
  }
});

test("frontend brain client uses Create next and coding prompt export routes", async () => {
  const sessionId = uuidAt(101);
  const optionSetId = "create-options-test";
  const artifact = createArtifactPayload(sessionId);
  const optionSet = createOptionSetPayload(sessionId, optionSetId);
  const verification = {
    id: "verification-test",
    artifactId: artifact.id,
    createdAt: "2026-05-05T12:00:00.000Z",
    verdict: "ready",
    scores: {
      intentMatch: 92,
      personalMemoryGrounding: 78,
      buildability: 96,
      nonGenericness: 91,
      userAutonomyPreserved: 94,
      fakeClaimRisk: 95,
      promptCompleteness: 100,
    },
    checks: [
      { key: "intent_match", label: "Intent match", status: "pass", score: 92, summary: "Intent is visible." },
      { key: "personal_memory_grounding", label: "Personal memory grounding", status: "warn", score: 78, summary: "No durable memory was available." },
      { key: "buildability", label: "Buildability", status: "pass", score: 96, summary: "Buildable route and UI." },
      { key: "non_genericness", label: "Non-genericness", status: "pass", score: 91, summary: "Records judgment." },
      { key: "user_autonomy_preserved", label: "User autonomy preserved", status: "pass", score: 94, summary: "User chooses cards." },
      { key: "fake_claim_risk", label: "Fake claim risk", status: "pass", score: 95, summary: "No fake claims." },
      { key: "prompt_completeness", label: "Prompt completeness", status: "pass", score: 100, summary: "All sections present." },
    ],
    missingInfo: [],
    risks: [],
  };
  const qualitySignals = createPromptQualitySignalsPayload();
  const observability = {
    providerMode: "deterministic",
    providerName: "deterministic",
    schemaValidation: "not_run",
    schemaValidationErrors: [],
    fallbackReason: null,
    memoryCountUsed: 0,
    sourceCountUsed: 1,
    rejectedDirectionsUsed: [],
    generatedLenses: ["Personal", "Practical", "Valuable", "Critical", "Weird"],
    selectedOptionIds: [optionSet.options[0].id, optionSet.options[3].id],
    selectedLenses: ["Personal", "Critical"],
    exportQualitySignals: qualitySignals,
  };
  const judgmentEvent = {
    id: "judgment-test",
    projectId: "project-test",
    sessionId,
    optionSetId,
    selectedOptionIds: [optionSet.options[0].id, optionSet.options[3].id],
    userComment: "Make the selected cards visibly update the artifact.",
    inferredSignals: ["selected_personal", "selected_critical"],
    artifactDelta: {
      id: "delta-test",
      updatedSectionIds: ["section-user-intent"],
      selectedOptionIds: [optionSet.options[0].id, optionSet.options[3].id],
      summary: "Updated artifact.",
      createdAt: "2026-05-05T12:00:00.000Z",
    },
    createdAt: "2026-05-05T12:00:00.000Z",
  };
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    jsonResponse({
      sourceOfTruth: "create_options_judgments_artifacts_verification",
      optionSet,
      artifact,
      verification,
      judgmentEvent,
      observability,
      exportReady: true,
    }),
    jsonResponse({
      export: {
        id: "prompt-export-test",
        artifactId: artifact.id,
        format: "coding_agent_prompt",
        targets: ["Codex", "Claude Code", "Cursor"],
        text: "# Create prompt\n\n## Goal\nBuild Create.",
        fileName: "create-prompt.md",
        qualitySignals,
        createdAt: "2026-05-05T12:00:01.000Z",
      },
    }),
    jsonResponse({
      sourceOfTruth: "deterministic_model_backed_create_comparison",
      rawIdea: "Build Penny Create.",
      deterministic: {
        label: "deterministic",
        providerUsed: "deterministic",
        fallbackReason: null,
        optionSet,
        artifact,
        verification,
        promptExport: {
          id: "prompt-export-deterministic",
          artifactId: artifact.id,
          format: "coding_agent_prompt",
          targets: ["Codex", "Claude Code", "Cursor"],
          text: "# Deterministic prompt",
          fileName: "deterministic.md",
          qualitySignals,
          createdAt: "2026-05-05T12:00:02.000Z",
        },
        observability,
      },
      modelBacked: {
        label: "model_backed",
        providerUsed: "deterministic_fallback",
        fallbackReason: "Model-backed Create provider is not configured.",
        optionSet,
        artifact,
        verification,
        promptExport: {
          id: "prompt-export-model",
          artifactId: artifact.id,
          format: "coding_agent_prompt",
          targets: ["Codex", "Claude Code", "Cursor"],
          text: "# Model prompt",
          fileName: "model.md",
          qualitySignals,
          createdAt: "2026-05-05T12:00:02.000Z",
        },
        observability: {
          ...observability,
          providerMode: "deterministic_fallback",
          providerName: "disabled",
          fallbackReason: "Model-backed Create provider is not configured.",
        },
      },
    }),
    jsonResponse({
      feedback: {
        sourceOfTruth: "create_export_feedback",
        id: "feedback-1",
        projectId: "project-test",
        sessionId,
        artifactId: artifact.id,
        exportId: "prompt-export-1",
        rating: "useful",
        reasons: ["strong_output"],
        comment: null,
        promptCompletenessScore: 100,
        createdAt: "2026-05-05T12:00:03.000Z",
      },
    }),
  ]);

  try {
    const next = await createNext({
      rawIdea: "Build Penny Create.",
      projectId: "project-test",
      sessionId,
      optionSetId,
      selectedOptionIds: [optionSet.options[0].id, optionSet.options[3].id],
      userComment: "Make the selected cards visibly update the artifact.",
      artifact,
    });
    const exported = await exportCodingPrompt({
      artifact: next.data.artifact,
      verification: next.data.verification,
      judgmentEvent: next.data.judgmentEvent,
    });
    const compared = await compareCreateProviders({
      rawIdea: "Build Penny Create.",
      projectId: "project-test",
      sessionId,
    });
    const feedback = await submitCreateExportFeedback({
      projectId: "project-test",
      sessionId,
      artifactId: artifact.id,
      exportId: exported.data.export.id,
      rating: "useful",
      reasons: ["strong_output"],
      promptCompletenessScore: exported.data.export.qualitySignals.promptCompletenessScore,
    });

    assert.equal(next.data.optionSet.options.length, 5);
    assert.equal(next.data.judgmentEvent?.userComment, "Make the selected cards visibly update the artifact.");
    assert.equal(exported.data.export.format, "coding_agent_prompt");
    assert.equal(compared.data.deterministic.providerUsed, "deterministic");
    assert.equal(compared.data.modelBacked.providerUsed, "deterministic_fallback");
    assert.equal(feedback.data.feedback.rating, "useful");
    assert.equal(calls[0]?.url, "/api/create/next");
    assert.equal(calls[0]?.method, "POST");
    assert.deepEqual(calls[0]?.body, {
      rawIdea: "Build Penny Create.",
      projectId: "project-test",
      sessionId,
      optionSetId,
      selectedOptionIds: [optionSet.options[0].id, optionSet.options[3].id],
      userComment: "Make the selected cards visibly update the artifact.",
      artifact,
    });
    assert.equal(calls[1]?.url, "/api/create/export-coding-prompt");
    assert.equal(calls[1]?.method, "POST");
    assert.deepEqual(calls[1]?.body, {
      artifact,
      verification,
      judgmentEvent,
    });
    assert.equal(calls[2]?.url, "/api/create/compare");
    assert.equal(calls[2]?.method, "POST");
    assert.deepEqual(calls[2]?.body, {
      rawIdea: "Build Penny Create.",
      projectId: "project-test",
      sessionId,
    });
    assert.equal(calls[3]?.url, "/api/create/export-feedback");
    assert.equal(calls[3]?.method, "POST");
    assert.deepEqual(calls[3]?.body, {
      projectId: "project-test",
      sessionId,
      artifactId: artifact.id,
      exportId: "prompt-export-test",
      rating: "useful",
      reasons: ["strong_output"],
      promptCompletenessScore: 100,
    });
  } finally {
    restoreFetch();
  }
});

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

test("frontend Ask Penny sends active micro-lesson quick action context", async () => {
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    jsonResponse({ answer: "The visual compares signal with noise.", provider: "heuristic", model: null }),
  ]);

  try {
    const response = await askPenny({
      question: "Explain this visual.",
      quickAction: "explain_visual",
      currentStepTitle: "Read the signal",
      localContext: "Goal: understand pricing. Current step: Read the signal.",
      activeLesson: {
        lessonNumber: 1,
        totalLessons: 4,
        title: "Read the signal",
        explanation: "A signal is behavior that changes the pricing claim.",
        visual: {
          type: "comparison",
          title: "Signal vs noise",
          description: "A comparison of buyer behavior and compliments.",
          body: "behavior | compliment",
        },
        quickCheck: "Which behavior proves budget?",
        takeaway: "Behavior beats compliments.",
        sourceSpans: [{ label: "Interview", text: "A buyer asked for pricing.", sourceRange: "cluster 1" }],
      },
    });

    assert.equal(response.data.answer, "The visual compares signal with noise.");
    assert.equal(calls[0]?.url, "/brain/learn/ask");
    assert.deepEqual(calls[0]?.body, {
      question: "Explain this visual.",
      quickAction: "explain_visual",
      currentStepTitle: "Read the signal",
      localContext: "Goal: understand pricing. Current step: Read the signal.",
      activeLesson: {
        lessonNumber: 1,
        totalLessons: 4,
        title: "Read the signal",
        explanation: "A signal is behavior that changes the pricing claim.",
        visual: {
          type: "comparison",
          title: "Signal vs noise",
          description: "A comparison of buyer behavior and compliments.",
          body: "behavior | compliment",
        },
        quickCheck: "Which behavior proves budget?",
        takeaway: "Behavior beats compliments.",
        sourceSpans: [{ label: "Interview", text: "A buyer asked for pricing.", sourceRange: "cluster 1" }],
      },
    });
  } finally {
    restoreFetch();
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

test("frontend Ask Penny local fallback gives worked LaTeX for technical questions", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    throw new TypeError("Failed to fetch");
  };

  try {
    const response = await askPenny({
      question: "How do I solve a physics projectile motion question?",
      currentStepTitle: "Work the example",
      localContext: "Goal: understand physics word problems. Current step: Work the example.",
    });

    assert.equal(response.data.provider, "heuristic");
    assert.equal(response.data.model, null);
    assert.match(response.data.answer, /\$\$x = x_0 \+ v_0t \+ \\frac\{1\}\{2\}at\^2\$\$/);
    assert.match(response.data.answer, /units/);
    assert.doesNotMatch(response.data.answer, /Next step:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("frontend Ask Penny local fallback differentiates full polynomial questions", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    throw new TypeError("Failed to fetch");
  };

  try {
    const response = await askPenny({
      question: "how to do derivative of 16x^2+4x",
      currentStepTitle: "Work the example",
      localContext: "Goal: understand derivatives. Current step: Work the example.",
    });

    assert.equal(response.data.provider, "heuristic");
    assert.equal(response.data.model, null);
    assert.match(response.data.answer, /f\(x\)=16x\^2\+4x/);
    assert.match(response.data.answer, /f'\(x\)=32x\+4/);
    assert.match(response.data.answer, /\\frac\{d\}\{dx\}\(16x\^2\+4x\)=32x\+4/);
    assert.doesNotMatch(response.data.answer, /f'\(x\)=16/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("frontend Ask Penny local fallback differentiates bare polynomial follow-ups inside derivative context", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    throw new TypeError("Failed to fetch");
  };

  try {
    const response = await askPenny({
      question: "what about 12x^2+12x",
      currentStepTitle: "Use the power rule",
      localContext: "Goal: understand derivatives. Current step: Use the power rule. Core moves: derivative, slope, rate of change.",
    });

    assert.equal(response.data.provider, "heuristic");
    assert.equal(response.data.model, null);
    assert.match(response.data.answer, /f\(x\)=12x\^2\+12x/);
    assert.match(response.data.answer, /f'\(x\)=24x\+12/);
    assert.match(response.data.answer, /\\frac\{d\}\{dx\}\(12x\^2\+12x\)=24x\+12/);
    assert.doesNotMatch(response.data.answer, /Next step:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("frontend Ask Penny local fallback differentiates with respect to the requested variable", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    throw new TypeError("Failed to fetch");
  };

  try {
    const response = await askPenny({
      question: "what is derivative of 172xy^2+y^2+129030y with respect to y?",
      currentStepTitle: "Work the example",
      localContext: "Goal: understand derivatives. Current step: Work the example.",
    });

    assert.equal(response.data.provider, "heuristic");
    assert.equal(response.data.model, null);
    assert.match(response.data.answer, /with respect to \$y\$/);
    assert.match(response.data.answer, /f'\(y\)=344xy\+2y\+129030/);
    assert.match(response.data.answer, /\\frac\{d\}\{dy\}\(172xy\^2\+y\^2\+129030y\)=344xy\+2y\+129030/);
    assert.doesNotMatch(response.data.answer, /instantaneous rate of change:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("frontend Ask Penny local fallback handles expression-before-derivative phrasing", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    throw new TypeError("Failed to fetch");
  };

  try {
    const response = await askPenny({
      question: "4x^2y + 301498x derivative to x",
      currentStepTitle: "Work the example",
      localContext: "Goal: understand derivatives. Current step: Work the example.",
    });

    assert.equal(response.data.provider, "heuristic");
    assert.equal(response.data.model, null);
    assert.match(response.data.answer, /f\(x\)=4x\^2y\+301498x/);
    assert.match(response.data.answer, /f'\(x\)=8xy\+301498/);
    assert.match(response.data.answer, /\\frac\{d\}\{dx\}\(4x\^2y\+301498x\)=8xy\+301498/);
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

test("frontend Ask Penny retries the API origin before using the local fallback", async () => {
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    fetchError("Failed to fetch"),
    jsonResponse({
      answer: "The square root of a number is the value that multiplies by itself to make that number.",
      provider: "xai",
      model: "grok-test",
    }),
  ]);

  try {
    const response = await askPenny({
      question: "teach me how the square root works of a number",
      currentStepTitle: "Name the program",
      localContext:
        "Goal: Understand what YC does and whether its batch application is primarily evaluating investors, ideas, or people.",
    });

    assert.equal(calls[0]?.url, "/brain/learn/ask");
    assert.equal(calls[1]?.url, "http://localhost:3000/brain/learn/ask");
    assert.equal(response.data.provider, "xai");
    assert.equal(response.data.model, "grok-test");
    assert.match(response.data.answer, /multiplies by itself/);
    assert.doesNotMatch(response.data.answer, /Next step:/);
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

test("frontend brain client uses Brain memory import, profile, retrieval, and delete routes", async () => {
  const profile = brainMemoryProfilePayload();
  const job = profile.jobs[0];
  const source = profile.sources[0];
  assert.ok(job);
  assert.ok(source);
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    jsonResponse({ job, profile }),
    jsonResponse({ job }),
    jsonResponse(profile),
    jsonResponse({
      sourceOfTruth: "private_user_memory_retrieval",
      query: "small reversible builds",
      contextLight: false,
      results: [
        {
          id: "brain-retrieval-1",
          nodeId: "memory-node-1",
          sourceId: source.id,
          chunkId: "brain-chunk-1",
          type: "preference",
          title: "Preference - Small reversible builds",
          summary: "I prefer small reversible builds with explicit provenance.",
          excerpt: "I prefer small reversible builds with explicit provenance.",
          score: 4.2,
          memoryRef: {
            id: "memory-node-1",
            label: "Preference: Small reversible builds",
            kind: "preference",
            summary: "I prefer small reversible builds with explicit provenance.",
          },
          sourceRef: {
            id: source.id,
            label: source.label,
            kind: "source",
            excerpt: "I prefer small reversible builds with explicit provenance.",
            sourceRange: "chunk 1",
          },
          permission: source.permission,
        },
      ],
    }),
    jsonResponse({ reviewed: true, action: "correct", memory: profile.recentMemoryNodes[0], profile }),
    jsonResponse({ deleted: true, profile: { ...profile, sources: [], recentMemoryNodes: [], stats: { ...profile.stats, sourceCount: 0 } } }),
  ]);

  try {
    const imported = await importBrainSource({
      kind: "markdown",
      label: "Product notes",
      fileName: "notes.md",
      content: "I prefer small reversible builds with explicit provenance.",
    });
    const fetchedJob = await fetchBrainImportJob(job.id);
    const fetchedProfile = await fetchBrainMemoryProfile();
    const retrieved = await retrieveBrainMemory({ query: "small reversible builds", limit: 4, nodeTypes: ["preference"] });
    const reviewed = await reviewBrainMemory("memory-node-1", { action: "correct" });
    const deleted = await deleteBrainSource(source.id);

    assert.equal(imported.data.job.id, job.id);
    assert.equal(fetchedJob.data.job.sourceId, source.id);
    assert.equal(fetchedProfile.data.sources[0]?.label, "Product notes");
    assert.equal(retrieved.data.contextLight, false);
    assert.equal(retrieved.data.results[0]?.memoryRef.kind, "preference");
    assert.equal(reviewed.data.action, "correct");
    assert.equal(deleted.data.deleted, true);
    assert.equal(calls[0]?.url, "/api/brain/import");
    assert.equal(calls[0]?.method, "POST");
    assert.deepEqual(calls[0]?.body, {
      kind: "markdown",
      label: "Product notes",
      fileName: "notes.md",
      content: "I prefer small reversible builds with explicit provenance.",
    });
    assert.equal(calls[1]?.url, `/api/brain/import/${job.id}`);
    assert.equal(calls[1]?.method, "GET");
    assert.equal(calls[2]?.url, "/api/brain/memory/profile");
    assert.equal(calls[2]?.method, "GET");
    assert.equal(calls[3]?.url, "/api/brain/retrieve");
    assert.deepEqual(calls[3]?.body, { query: "small reversible builds", limit: 4, nodeTypes: ["preference"] });
    assert.equal(calls[4]?.url, "/api/brain/memories/memory-node-1/review");
    assert.equal(calls[4]?.method, "POST");
    assert.deepEqual(calls[4]?.body, { action: "correct" });
    assert.equal(calls[5]?.url, `/api/brain/sources/${source.id}`);
    assert.equal(calls[5]?.method, "DELETE");
  } finally {
    restoreFetch();
  }
});

test("frontend brain client loads the Brain demo fixture import payload", async () => {
  const calls: FetchCall[] = [];
  const restoreFetch = mockFetch(calls, [
    jsonResponse({
      importInput: {
        kind: "chatgpt_export",
        label: "Penny demo ChatGPT export",
        fileName: "conversations.json",
        content: "[]",
      },
    }),
  ]);

  try {
    const fixture = await fetchBrainDemoFixtureImport();

    assert.equal(fixture.data.importInput.kind, "chatgpt_export");
    assert.equal(fixture.data.importInput.fileName, "conversations.json");
    assert.equal(calls[0]?.url, "/api/brain/demo-fixture/penny");
    assert.equal(calls[0]?.method, "GET");
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

    if (response.status === 599) {
      throw new TypeError(response.statusText);
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

function brainMemoryProfilePayload() {
  const source = {
    id: "brain-source-1",
    kind: "markdown",
    label: "Product notes",
    scope: {
      userId: "test-user",
      workspaceId: "test-workspace",
      projectId: "test-project",
      sphereId: "test-sphere",
    },
    privacy: {
      visibility: "private",
      trainingUse: false,
      rawRetention: false,
    },
    permission: {
      visibility: "private",
      trainingUse: false,
      source: "user_upload",
      allowedUses: ["private_memory", "create_retrieval"],
    },
    textHash: "hash-1",
    contentLength: 64,
    chunkCount: 1,
    memoryNodeCount: 1,
    createdAt: "2026-05-05T12:00:00.000Z",
    updatedAt: "2026-05-05T12:00:00.000Z",
    fileName: "notes.md",
  };
  const job = {
    id: "brain-import-job-1",
    status: "completed",
    sourceImport: source,
    sourceId: source.id,
    errorMessages: [],
    importedAt: "2026-05-05T12:00:00.000Z",
    completedAt: "2026-05-05T12:00:01.000Z",
    counts: {
      sources: 1,
      chunks: 1,
      memoryNodes: 1,
      memoryEdges: 0,
      profileSignals: 1,
    },
  };
  const signal = {
    id: "profile-signal-1",
    kind: "preferred_build_style",
    label: "Small reversible builds",
    summary: "I prefer small reversible builds with explicit provenance.",
    weight: 0.88,
    sourceNodeIds: ["memory-node-1"],
    updatedAt: "2026-05-05T12:00:01.000Z",
  };

  return {
    sourceOfTruth: "private_user_memory_sources_chunks_nodes_edges_profile_signals",
    scope: source.scope,
    sources: [source],
    jobs: [job],
    recentMemoryNodes: [
      {
        id: "memory-node-1",
        type: "preference",
        title: "Preference - Small reversible builds",
        summary: "I prefer small reversible builds with explicit provenance.",
        text: "I prefer small reversible builds with explicit provenance.",
        sourceId: source.id,
        chunkIds: ["brain-chunk-1"],
        confidence: 0.88,
        tags: ["small", "reversible", "builds", "provenance"],
        labels: ["taste", "preference"],
        evidenceLevel: "grounded",
        permission: source.permission,
        createdAt: "2026-05-05T12:00:01.000Z",
        lastSeenAt: "2026-05-05T12:00:01.000Z",
      },
    ],
    memoryEdges: [],
    profile: {
      recurringInterests: [],
      activeIdeaClusters: [],
      tasteSignals: [signal],
      preferredBuildStyle: [signal],
      commonFrustrations: [],
      privacySafeSummary: "Private user memory from 1 imported source. No private global training is claimed or enabled.",
    },
    stats: {
      sourceCount: 1,
      chunkCount: 1,
      memoryNodeCount: 1,
      memoryEdgeCount: 0,
      profileSignalCount: 1,
    },
  };
}

function checkSessionPayload(sessionId: string, cycleId: string, recommendationId: string) {
  const now = "2026-05-05T12:00:00.000Z";
  const focusNode = {
    id: uuidAt(251),
    kind: "claim",
    title: "Penny needs a sharper investor pitch",
    body: "Penny needs a sharper investor pitch.",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  const cycle = {
    id: cycleId,
    sessionId,
    status: "active",
    currentFocus: focusNode.title,
    diagnosis: "The proof is still implicit.",
    recommendations: [
      {
        id: recommendationId,
        slot: "clarify",
        action: "Rewrite the claim.",
        whyItMatters: "The claim gives the work a target.",
        effort: "low",
        targetNodeId: focusNode.id,
      },
      {
        id: uuidAt(352),
        slot: "strengthen",
        action: "Add one proof point.",
        whyItMatters: "Evidence makes the claim inspectable.",
        effort: "medium",
        targetNodeId: focusNode.id,
      },
      {
        id: uuidAt(353),
        slot: "challenge",
        action: "Write the objection.",
        whyItMatters: "The objection tests the idea.",
        effort: "medium",
        targetNodeId: focusNode.id,
      },
      {
        id: uuidAt(354),
        slot: "reframe",
        action: "Restate for investors.",
        whyItMatters: "The audience frame exposes stakes.",
        effort: "low",
        targetNodeId: focusNode.id,
      },
      {
        id: uuidAt(355),
        slot: "advance",
        action: "Draft the next artifact.",
        whyItMatters: "The work changes only when the artifact changes.",
        effort: "high",
        targetNodeId: focusNode.id,
      },
    ],
    curveball: {
      id: uuidAt(356),
      slot: "curveball",
      action: "Invert the premise.",
      whyItMatters: "The inversion can reveal a better constraint.",
      effort: "medium",
      targetNodeId: focusNode.id,
    },
    userCommitment: null,
    workSprint: null,
    synthesis: null,
    createdAt: now,
    updatedAt: now,
  };

  return {
    id: sessionId,
    sourceOfTruth: "check_projects_cycles_nodes_breakthroughs",
    status: "open",
    input: {
      kind: "text",
      title: "Penny pitch",
      rawText: "Penny needs a sharper investor pitch.",
      fileName: null,
    },
    project: {
      id: uuidAt(150),
      northStar: "Make the pitch clear enough for investors to judge.",
      currentArtifactSummary: "Penny needs a sharper investor pitch.",
      audienceOrJudge: "Investors",
      successCriteria: ["One clear claim."],
      nodes: [focusNode],
      edges: [],
    },
    cycles: [cycle],
    activeCycleId: cycleId,
    breakthroughs: [],
    savedBrainObject: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createOptionSetPayload(sessionId: string, optionSetId: string) {
  const now = "2026-05-05T12:00:00.000Z";
  const source = {
    id: "source-rough-idea",
    label: "Rough idea",
    kind: "rough_idea",
    excerpt: "Build Penny Create.",
  };
  const lenses = ["Personal", "Practical", "Valuable", "Critical", "Weird"] as const;

  return {
    id: optionSetId,
    projectId: "project-test",
    sessionId,
    sourceOfTruth: "rough_idea_context_deterministic_create_lenses",
    rawIdea: "Build Penny Create.",
    memoryUsed: [],
    sourcesUsed: [source],
    createdAt: now,
    options: lenses.map((lens, index) => ({
      id: `create-option-${lens.toLowerCase()}`,
      lens,
      title: `${lens} direction`,
      oneLine: `${lens} one-line direction.`,
      rationale: `${lens} rationale.`,
      nextMove: `${lens} next move.`,
      risks: [`${lens} risk.`],
      memoryUsed: [],
      sourcesUsed: [source],
      scores: {
        intentMatch: 90 - index,
        buildability: 80,
        value: 80,
        novelty: 70,
        risk: 30 + index,
      },
    })),
  };
}

function createArtifactPayload(sessionId: string) {
  const now = "2026-05-05T12:00:00.000Z";
  const titles = [
    "Product goal",
    "User intent",
    "Target user",
    "Core loop",
    "UX requirements",
    "Frontend requirements",
    "Backend requirements",
    "Data model",
    "AI/memory orchestration",
    "Privacy constraints",
    "Verification constraints",
    "Implementation plan",
    "Acceptance tests",
    "Do-not-break list",
    "Final coding-agent prompt",
  ] as const;

  return {
    id: "create-artifact-test",
    projectId: "project-test",
    sessionId,
    title: "Create prompt: Build Penny Create",
    version: 2,
    rawIdea: "Build Penny Create.",
    sections: titles.map((title) => ({
      id: `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      title,
      body: `${title} body for Build Penny Create.`,
      status: title === "User intent" ? "updated" : "draft",
    })),
    sourceOptionSetIds: ["create-options-test"],
    judgmentEventIds: ["judgment-test"],
    updatedAt: now,
  };
}

function createPromptQualitySignalsPayload() {
  return {
    hasRoughIdea: true,
    hasSelectedOptionHistory: true,
    hasRelevantPersonalContext: true,
    hasRepeatedRejectedDirections: true,
    hasProductGoal: true,
    hasNonGoals: true,
    hasUxRequirements: true,
    hasFrontendRequirements: true,
    hasBackendRequirements: true,
    hasDataModel: true,
    hasPrivacyConstraints: true,
    hasVerificationRequirements: true,
    hasImplementationSequence: true,
    hasAcceptanceTests: true,
    hasDoNotBreakList: true,
    promptCompletenessScore: 100,
    missing: [],
  };
}

function fetchError(message: string): Response {
  return new Response(null, {
    status: 599,
    statusText: message,
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
