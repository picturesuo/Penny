import { randomUUID } from "crypto";
import type { MarginFragment, Session } from "@prisma/client";
import { prisma } from "@/db/prisma";
import { track } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { cleanSentence, computeClarityScore, createMessage, dedupePoints, dedupeStrings, determineStage, safeJsonParse, titleFromIdea, DEMO_USER_ID } from "@/lib/penny";
import { MockLlmProvider } from "@/lib/ai/mock-provider";
import { MockContextProvider } from "@/lib/context/mock-context";
import { assertRateLimit } from "@/lib/rate-limiter";
import { generateSessionSummary } from "@/lib/session-summary";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import type {
  EvidenceScanResult,
  MarginFragmentContextSnapshot,
  MarginFragmentModel,
  SessionCardModel,
  SessionState,
  StructuredPoint,
} from "@/types/penny";
import type {
  ClosingRitual,
  SessionEvent,
  SessionSummary,
  SessionIntentionType,
} from "@/types/thought-map";

const llm = new MockLlmProvider();
const contextProvider = new MockContextProvider();

function parseSessionStatus(value: string | null | undefined): SessionState["status"] {
  return value === "active" || value === "brief-ready" || value === "reflection-logged" || value === "closed" ? value : "active";
}

function mapSession(record: Session): SessionState {
  const parseJson = <T,>(value: string | null, fallback: T): T => {
    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  };

  const sessionEvents = parseJson<SessionEvent[]>(record.sessionEvents ?? "[]", []).map((event) => ({
    ...event,
    timestamp: new Date(event.timestamp),
  }));
  const { status: _status, ...rest } = record;
  return {
    ...rest,
    mapId: record.mapId ?? null,
    declaredIntention: record.declaredIntention ?? "",
    intentionType: (record.intentionType as SessionIntentionType) ?? "open_exploration",
    scopedClaimIds: parseJson<string[]>(record.scopedClaimIds ?? "[]", []),
    timeBudgetMinutes: record.timeBudgetMinutes ?? null,
    startedAt: record.startedAt,
    endedAt: record.endedAt ?? null,
    actualDurationMinutes: record.actualDurationMinutes ?? null,
    sessionEvents,
    closingRitual: parseJson<ClosingRitual | null>(record.closingRitual ?? null, null),
    sessionSummary: parseJson<SessionSummary | null>(record.sessionSummary ?? null, null),
    energyRating: (record.energyRating as SessionState["energyRating"]) ?? null,
    focusRating: (record.focusRating as SessionState["focusRating"]) ?? null,
    productivityRating: record.productivityRating ?? null,
    currentStage: record.currentStage as SessionState["currentStage"],
    status: parseSessionStatus(record.status),
    category: record.category ?? null,
    extractedProblem: record.extractedProblem ?? null,
    extractedCustomer: record.extractedCustomer ?? null,
    extractedSolution: record.extractedSolution ?? null,
    ideaSummary: record.ideaSummary ?? null,
    targetUser: record.targetUser ?? null,
    problem: record.problem ?? null,
    solution: record.solution ?? null,
    assumptions: safeJsonParse(record.assumptions, []),
    resolvedAssumptions: safeJsonParse(record.resolvedAssumptions, []),
    risks: safeJsonParse(record.risks, []),
    unknowns: safeJsonParse(record.unknowns, []),
    evidenceFor: safeJsonParse(record.evidenceFor, []),
    evidenceAgainst: safeJsonParse(record.evidenceAgainst, []),
    marketPatterns: safeJsonParse(record.marketPatterns, []),
    questionsAsked: safeJsonParse(record.questionsAsked, []),
    answers: safeJsonParse(record.answers, []),
    conversation: safeJsonParse(record.conversation, []),
    conceptBrief: record.conceptBrief ?? null,
  };
}

function serializePoints(value: StructuredPoint[]) {
  return JSON.stringify(dedupePoints(value));
}

function serializeStrings(value: string[]) {
  return JSON.stringify(dedupeStrings(value));
}

function parseMarginContextSnapshot(value: string): MarginFragmentContextSnapshot {
  try {
    const parsed = JSON.parse(value) as Partial<MarginFragmentContextSnapshot> | null;

    return {
      currentStage: parsed?.currentStage ?? "dashboard",
      currentFocus: typeof parsed?.currentFocus === "string" ? parsed.currentFocus : "",
      currentSphere: typeof parsed?.currentSphere === "string" ? parsed.currentSphere : "work",
      currentContext: typeof parsed?.currentContext === "string" ? parsed.currentContext : "",
      currentResponse: typeof parsed?.currentResponse === "string" ? parsed.currentResponse : null,
      recentSessionMinutes:
        typeof parsed?.recentSessionMinutes === "number" && Number.isFinite(parsed.recentSessionMinutes)
          ? parsed.recentSessionMinutes
          : null,
      sourceSessionId: typeof parsed?.sourceSessionId === "string" ? parsed.sourceSessionId : null,
      sourceMapId: typeof parsed?.sourceMapId === "string" ? parsed.sourceMapId : null,
    };
  } catch {
    return {
      currentStage: "dashboard",
      currentFocus: "",
      currentSphere: "work",
      currentContext: "",
      currentResponse: null,
      recentSessionMinutes: null,
      sourceSessionId: null,
      sourceMapId: null,
    };
  }
}

function mapMarginFragment(record: MarginFragment): MarginFragmentModel {
  return {
    ...record,
    status: record.status as MarginFragmentModel["status"],
    contextSnapshot: parseMarginContextSnapshot(record.contextSnapshot),
    lastSurfacedAt: record.lastSurfacedAt,
    promotedAt: record.promotedAt,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function saveSession(session: SessionState) {
  return prisma.session.update({
    where: { id: session.id },
    data: {
      mapId: session.mapId ?? null,
      title: session.title,
      rawIdea: session.rawIdea,
      category: session.category,
      declaredIntention: session.declaredIntention,
      intentionType: session.intentionType,
      scopedClaimIds: JSON.stringify(session.scopedClaimIds ?? []),
      timeBudgetMinutes: session.timeBudgetMinutes,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      actualDurationMinutes: session.actualDurationMinutes,
      sessionEvents: JSON.stringify(session.sessionEvents ?? []),
      closingRitual: session.closingRitual ? JSON.stringify(session.closingRitual) : null,
      sessionSummary: session.sessionSummary ? JSON.stringify(session.sessionSummary) : null,
      energyRating: session.energyRating,
      focusRating: session.focusRating,
      productivityRating: session.productivityRating,
      status: session.status,
      currentStage: session.currentStage,
      questionBudget: session.questionBudget,
      clarityScore: session.clarityScore,
      extractedProblem: session.extractedProblem,
      extractedCustomer: session.extractedCustomer,
      extractedSolution: session.extractedSolution,
      ideaSummary: session.ideaSummary,
      targetUser: session.targetUser,
      problem: session.problem,
      solution: session.solution,
      assumptions: serializeStrings(session.assumptions),
      resolvedAssumptions: serializeStrings(session.resolvedAssumptions),
      risks: serializeStrings(session.risks),
      unknowns: serializeStrings(session.unknowns),
      evidenceFor: serializePoints(session.evidenceFor),
      evidenceAgainst: serializePoints(session.evidenceAgainst),
      marketPatterns: serializePoints(session.marketPatterns),
      questionsAsked: serializeStrings(session.questionsAsked),
      answers: serializeStrings(session.answers),
      conversation: JSON.stringify(session.conversation),
      conceptBrief: session.conceptBrief,
      logicOnlyMode: session.logicOnlyMode,
    },
  });
}

export async function listMarginFragments(userId?: string): Promise<MarginFragmentModel[]> {
  const activeUserId = userId ?? (await getCurrentAuthenticatedUserId());
  const fragments = await prisma.marginFragment.findMany({
    where: { userId: activeUserId },
    orderBy: [{ createdAt: "desc" }],
  });

  return fragments.map(mapMarginFragment);
}

export async function createMarginFragment(params: {
  userId?: string;
  content: string;
  sphere?: string;
  sourceSessionId?: string | null;
  sourceMapId?: string | null;
  contextSnapshot: MarginFragmentContextSnapshot;
}) {
  const content = cleanSentence(params.content);

  if (!content) {
    throw new Error("Fragment content is required");
  }

  const userId = params.userId ?? (await getCurrentAuthenticatedUserId());
  const created = await prisma.marginFragment.create({
    data: {
      userId,
      content,
      sphere: cleanSentence(params.sphere ?? params.contextSnapshot.currentSphere) || "work",
      sourceSessionId: params.sourceSessionId ?? null,
      sourceMapId: params.sourceMapId ?? null,
      contextSnapshot: JSON.stringify(params.contextSnapshot),
      status: "floating",
      priority: 0.55,
      surfaceCount: 0,
    },
  });

  return mapMarginFragment(created);
}

export async function updateMarginFragment(params: {
  fragmentId: string;
  status?: "floating" | "surfaced" | "promoted" | "merged" | "archived";
  priorityDelta?: number;
  mergedInto?: string | null;
}) {
  const updated = await prisma.marginFragment.update({
    where: { id: params.fragmentId },
    data: {
      status: params.status,
      priority:
        params.priorityDelta != null
          ? {
              increment: params.priorityDelta,
            }
          : undefined,
      mergedInto: params.mergedInto ?? undefined,
      lastSurfacedAt: params.status === "surfaced" ? new Date() : undefined,
      promotedAt: params.status === "promoted" ? new Date() : undefined,
      archivedAt: params.status === "archived" ? new Date() : undefined,
      surfaceCount: params.status === "surfaced" ? { increment: 1 } : undefined,
    },
  });

  return mapMarginFragment(updated);
}

async function appendAssistantTurn(session: SessionState) {
  // Penny is intentionally finite: it either asks a sharper question or closes with a brief.
  const shouldProduceBrief =
    session.questionsAsked.length >= session.questionBudget ||
    (session.answers.length >= 4 && session.evidenceFor.length + session.evidenceAgainst.length > 0);

  if (shouldProduceBrief) {
    const evidence = await generateContextEvidence(session);
    const conceptBrief = await generateConceptBrief(session, evidence);
    session.currentStage = "brief";
    session.status = "brief-ready";
    session.conceptBrief = conceptBrief;
    session.conversation.push(
      createMessage(
        "assistant",
        "brief",
        "You have enough signal for a first decision. The brief is below. Do not confuse this with validation.",
      ),
    );
    return;
  }

  const evidence = await generateContextEvidence(session);
  const pressureTest = await generatePressureTest(session, evidence);
  const nextQuestion = await generateNextQuestion(session);
  session.currentStage = nextQuestion.stage;
  session.questionsAsked.push(nextQuestion.question);
  session.conversation.push(
    createMessage(
      "assistant",
      "challenge",
      `${pressureTest.challenge}\n\n${pressureTest.followUp}\n\n${nextQuestion.question}`,
    ),
  );
}

export async function ensureSeedData() {
  const count = await prisma.session.count({
    where: { userId: DEMO_USER_ID },
  });

  if (count > 0) {
    return;
  }

  const seedIdeas = [
    {
      title: "Fitness accountability app",
      rawIdea: "I want to build a fitness accountability app for busy professionals who start workouts but fall off after two weeks.",
      category: "Consumer",
    },
    {
      title: "AI tool for compliance teams",
      rawIdea: "An AI assistant that turns regulatory changes into action plans for compliance teams at mid-sized fintech companies.",
      category: "B2B SaaS",
    },
    {
      title: "Vertical services marketplace",
      rawIdea: "A marketplace for local HVAC contractors that handles quoting and follow-up automatically.",
      category: "Marketplace",
    },
  ];

  for (const item of seedIdeas) {
    await createSession(item.rawIdea, item.category, item.title);
  }
}

export async function listSessions(userId?: string): Promise<SessionCardModel[]> {
  await ensureSeedData();
  const activeUserId = userId ?? (await getCurrentAuthenticatedUserId());
  const sessions = await prisma.session.findMany({
    where: { userId: activeUserId },
    orderBy: { updatedAt: "desc" },
  });

  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    currentStage: session.currentStage as SessionCardModel["currentStage"],
    status: parseSessionStatus(session.status),
    clarityScore: session.clarityScore,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    rawIdea: session.rawIdea,
    targetUser: session.targetUser,
    problem: session.problem,
  }));
}

export async function getSession(sessionId: string) {
  await ensureSeedData();
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    return null;
  }

  return mapSession(session);
}

export async function getActiveThinkingSession(params: { mapId: string | null; userId?: string }) {
  const session = await prisma.session.findFirst({
    where: {
      userId: params.userId ?? DEMO_USER_ID,
      mapId: params.mapId,
      endedAt: null,
    },
    orderBy: { startedAt: "desc" },
  });

  return session ? mapSession(session) : null;
}

export async function extractIdeaStructure(session: SessionState) {
  const structure = await llm.extractStructure(session);
  session.ideaSummary = structure.ideaSummary;
  session.targetUser = structure.targetUser;
  session.problem = structure.problem;
  session.solution = structure.solution;
  session.assumptions = dedupeStrings([...session.assumptions, ...structure.assumptions]);
  session.risks = dedupeStrings([...session.risks, ...structure.risks]);
  session.unknowns = dedupeStrings([...session.unknowns, ...structure.unknowns]);
  session.extractedCustomer = structure.targetUser;
  session.extractedProblem = structure.problem;
  session.extractedSolution = structure.solution;
  session.currentStage = determineStage({
    answersCount: session.answers.length,
    hasEvidence: session.evidenceFor.length + session.evidenceAgainst.length > 0,
    hasBrief: Boolean(session.conceptBrief),
    targetUser: session.targetUser,
    problem: session.problem,
    solution: session.solution,
    assumptions: session.assumptions,
  });
  session.clarityScore = computeClarityScore({
    targetUser: session.targetUser,
    problem: session.problem,
    solution: session.solution,
    assumptions: session.assumptions,
    evidenceFor: session.evidenceFor,
    evidenceAgainst: session.evidenceAgainst,
    answers: session.answers,
  });

  return structure;
}

export async function generateNextQuestion(session: SessionState) {
  return llm.generateNextQuestion(session);
}

export async function generatePressureTest(session: SessionState, evidence?: EvidenceScanResult) {
  const currentEvidence = evidence ?? (await generateContextEvidence(session));
  return llm.generatePressureTest(session, currentEvidence);
}

export async function generateContextEvidence(session: SessionState) {
  try {
    const evidence = await contextProvider.getEvidence(session);
    session.logicOnlyMode = false;
    session.evidenceFor = dedupePoints([...session.evidenceFor, ...evidence.supports]);
    session.evidenceAgainst = dedupePoints([
      ...session.evidenceAgainst,
      ...evidence.contradictions,
    ]);
    session.marketPatterns = dedupePoints([...session.marketPatterns, ...evidence.marketPatterns]);
    return evidence;
  } catch {
    session.logicOnlyMode = true;
    return {
      supports: session.evidenceFor,
      contradictions: [
        ...session.evidenceAgainst,
        {
          point: "Evidence retrieval failed, so this session is running in logic-only mode.",
          whyItMatters: "You should treat the pushback as structured reasoning, not external proof.",
        },
      ],
      marketPatterns: session.marketPatterns,
      confidenceNote: "Logic-only mode",
    };
  }
}

export async function generateConceptBrief(session: SessionState, evidence?: EvidenceScanResult) {
  const currentEvidence = evidence ?? (await generateContextEvidence(session));
  return llm.generateConceptBrief(session, currentEvidence);
}

export async function createSession(rawIdea: string, category?: string, presetTitle?: string, userId?: string) {
  const startedAt = Date.now();
  const sanitizedIdea = cleanSentence(rawIdea);
  const activeUserId = userId ?? (await getCurrentAuthenticatedUserId());
  assertRateLimit(activeUserId, "ai_extraction");
  const created = await prisma.session.create({
    data: {
      userId: activeUserId,
      title: presetTitle || titleFromIdea(sanitizedIdea),
      rawIdea: sanitizedIdea,
      category,
      declaredIntention: sanitizedIdea,
      intentionType: "open_exploration",
      scopedClaimIds: JSON.stringify([]),
      sessionEvents: JSON.stringify([]),
      conversation: JSON.stringify([
        createMessage(
          "assistant",
          "system",
          "Bring the messy idea. I’ll pressure-test it before you waste time building.",
        ),
      ]),
    },
  });

  const session = mapSession(created);
  await extractIdeaStructure(session);
  await appendAssistantTurn(session);
  await saveSession(session);
  logger.info("session_created", {
    userId: activeUserId,
    featureId: "sessions",
    durationMs: Date.now() - startedAt,
    data: {
      sessionId: session.id,
      category: category ?? null,
    },
  });
  return session.id;
}

async function persistThinkingSession(params: {
  userId: string;
  mapId: string | null;
  declaredIntention: string;
  intentionType: SessionIntentionType;
  scopedClaimIds: string[];
  timeBudgetMinutes: number | null;
}) {
  const created = await prisma.session.create({
    data: {
      userId: params.userId,
      mapId: params.mapId,
      title: params.declaredIntention.slice(0, 56) || "Thinking session",
      rawIdea: params.declaredIntention,
      category: params.mapId ? "map" : "exploration",
      declaredIntention: params.declaredIntention,
      intentionType: params.intentionType,
      scopedClaimIds: JSON.stringify(params.scopedClaimIds ?? []),
      timeBudgetMinutes: params.timeBudgetMinutes,
      sessionEvents: JSON.stringify([]),
    },
  });

  return mapSession(created);
}

async function appendThinkingSessionEvent(
  session: SessionState,
  event: Omit<SessionEvent, "id" | "sessionId" | "timestamp"> & { timestamp?: Date },
) {
  const nextEvent: SessionEvent = {
    id: randomUUID(),
    sessionId: session.id,
    eventType: event.eventType,
    claimId: event.claimId ?? null,
    description: event.description,
    timestamp: event.timestamp ?? new Date(),
  };

  session.sessionEvents = [...session.sessionEvents, nextEvent];
  await saveSession(session);
  return nextEvent;
}

export async function createThinkingSession(params: {
  userId: string;
  mapId: string | null;
  declaredIntention: string;
  intentionType: SessionIntentionType;
  scopedClaimIds: string[];
  timeBudgetMinutes: number | null;
}) {
  return persistThinkingSession(params);
}

export async function updateThinkingSession(params: {
  sessionId: string;
  declaredIntention?: string;
  intentionType?: SessionIntentionType;
  scopedClaimIds?: string[];
  timeBudgetMinutes?: number | null;
  energyRating?: "low" | "medium" | "high" | null;
  focusRating?: "scattered" | "moderate" | "deep" | null;
  productivityRating?: number | null;
  mapId?: string | null;
}) {
  const session = await getSession(params.sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  if (params.declaredIntention != null) {
    session.declaredIntention = cleanSentence(params.declaredIntention);
    session.rawIdea = session.declaredIntention;
    session.title = session.declaredIntention.slice(0, 56) || session.title;
  }

  if (params.intentionType != null) {
    session.intentionType = params.intentionType;
  }

  if (params.scopedClaimIds != null) {
    session.scopedClaimIds = params.scopedClaimIds.filter((claimId) => claimId.trim().length > 0);
  }

  if (params.timeBudgetMinutes !== undefined) {
    session.timeBudgetMinutes = params.timeBudgetMinutes;
  }

  if (params.energyRating !== undefined) {
    session.energyRating = params.energyRating;
  }

  if (params.focusRating !== undefined) {
    session.focusRating = params.focusRating;
  }

  if (params.productivityRating !== undefined) {
    session.productivityRating = params.productivityRating;
  }

  if (params.mapId !== undefined) {
    session.mapId = params.mapId;
  }

  return saveSession(session);
}

export async function appendSessionEvent(params: {
  sessionId: string;
  eventType: SessionEvent["eventType"];
  description: string;
  claimId?: string | null;
}) {
  const session = await getSession(params.sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  return appendThinkingSessionEvent(session, {
    eventType: params.eventType,
    description: params.description,
    claimId: params.claimId ?? null,
  });
}

export async function closeThinkingSession(params: {
  sessionId: string;
  skipClosingRitual?: boolean;
  closingRitual: Omit<ClosingRitual, "sessionId" | "completedAt"> & { completedAt?: Date };
  energyRating: "low" | "medium" | "high" | null;
  focusRating: "scattered" | "moderate" | "deep" | null;
  productivityRating: number | null;
}) {
  const startedAt = Date.now();
  const session = await getSession(params.sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  const endedAt = new Date();
  const summary = generateSessionSummary({
    sessionId: session.id,
    events: session.sessionEvents,
    scopedClaimIds: session.scopedClaimIds,
    generatedAt: endedAt,
  });

  session.endedAt = endedAt;
  session.actualDurationMinutes = Math.max(0, Math.round((endedAt.getTime() - session.startedAt.getTime()) / (1000 * 60)));
  session.closingRitual = params.skipClosingRitual
    ? null
    : {
        sessionId: session.id,
        questionsAnswered: params.closingRitual.questionsAnswered,
        openItemsNoted: params.closingRitual.openItemsNoted,
        nextSessionIntention: params.closingRitual.nextSessionIntention,
        completedAt: params.closingRitual.completedAt ?? endedAt,
      };
  session.sessionSummary = summary;
  session.energyRating = params.energyRating;
  session.focusRating = params.focusRating;
  session.productivityRating = params.productivityRating;
  session.status = "closed";

  if (params.skipClosingRitual) {
    await appendThinkingSessionEvent(session, {
      eventType: "session_dismissed",
      description: "User skipped the closing ritual.",
      claimId: null,
      timestamp: endedAt,
    });
  }

  await appendThinkingSessionEvent(session, {
    eventType: "session_closed",
    description: summary.keyInsight ?? "Session closed.",
    claimId: null,
    timestamp: endedAt,
  });

  await saveSession(session);
  logger.info("session_completed", {
    userId: session.userId,
    featureId: "sessions",
    durationMs: Date.now() - startedAt,
    data: {
      sessionId: session.id,
      durationMinutes: session.actualDurationMinutes ?? 0,
    },
  });
  void track(
    {
      event: "session_completed",
      properties: {
        sessionId: session.id,
        durationMinutes: session.actualDurationMinutes ?? 0,
      },
    },
    session.userId,
  );

  return session;
}

export async function submitAnswer(sessionId: string, answer: string) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const sanitizedAnswer = cleanSentence(answer);
  if (!sanitizedAnswer) {
    throw new Error("Answer is required");
  }

  assertRateLimit(await getCurrentAuthenticatedUserId(), "ai_critique");
  session.answers.push(sanitizedAnswer);
  session.conversation.push(createMessage("user", "answer", sanitizedAnswer));
  await extractIdeaStructure(session);
  await appendAssistantTurn(session);
  await saveSession(session);

  return session;
}

export async function advanceSessionState(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  assertRateLimit(await getCurrentAuthenticatedUserId(), "ai_critique");
  await extractIdeaStructure(session);
  await appendAssistantTurn(session);
  await saveSession(session);

  return session;
}

export async function regenerateChallenge(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  assertRateLimit(await getCurrentAuthenticatedUserId(), "ai_steel_man");
  const evidence = await generateContextEvidence(session);
  const pressureTest = await generatePressureTest(session, evidence);
  session.conversation.push(
    createMessage(
      "assistant",
      "challenge",
      `${pressureTest.challenge}\n\n${pressureTest.followUp}`,
    ),
  );
  await saveSession(session);
}

export async function markAssumptionResolved(sessionId: string, assumption: string) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  session.resolvedAssumptions = dedupeStrings([...session.resolvedAssumptions, assumption]);
  session.conversation.push(
    createMessage(
      "system",
      "system",
      `Marked assumption as resolved: ${assumption}`,
    ),
  );
  await saveSession(session);
}

export async function submitSessionReflection(
  sessionId: string,
  reflection: {
    worked?: string;
    resolved?: string;
    remains?: string;
    surprised?: string;
    resisted?: string;
    returnTo?: string;
  },
) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const worked = cleanSentence(reflection.worked || reflection.surprised || "");
  const resolved = cleanSentence(reflection.resolved || reflection.resisted || "");
  const remains = cleanSentence(reflection.remains || reflection.returnTo || "");

  if (!worked || !resolved || !remains) {
    throw new Error("Reflection fields are required");
  }

  session.conversation.push(
    createMessage(
      "system",
      "reflection",
      [
        "Session-end reflection ritual",
        `What was worked: ${worked}`,
        `What was resolved: ${resolved}`,
        `What remains: ${remains}`,
      ].join("\n"),
    ),
  );

  if (session.status === "brief-ready") {
    session.status = "brief-ready";
  } else {
    session.status = "reflection-logged";
  }

  await saveSession(session);

  return session;
}
