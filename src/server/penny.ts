import type { Session } from "@prisma/client";
import { prisma } from "@/db/prisma";
import { cleanSentence, computeClarityScore, createMessage, dedupePoints, dedupeStrings, determineStage, safeJsonParse, titleFromIdea, DEMO_USER_ID } from "@/lib/penny";
import { MockLlmProvider } from "@/lib/ai/mock-provider";
import { MockContextProvider } from "@/lib/context/mock-context";
import type { EvidenceScanResult, SessionCardModel, SessionState, StructuredPoint } from "@/types/penny";

const llm = new MockLlmProvider();
const contextProvider = new MockContextProvider();

function mapSession(record: Session): SessionState {
  return {
    ...record,
    currentStage: record.currentStage as SessionState["currentStage"],
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

async function saveSession(session: SessionState) {
  return prisma.session.update({
    where: { id: session.id },
    data: {
      title: session.title,
      rawIdea: session.rawIdea,
      category: session.category,
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

export async function listSessions(userId = DEMO_USER_ID): Promise<SessionCardModel[]> {
  await ensureSeedData();
  const sessions = await prisma.session.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    currentStage: session.currentStage as SessionCardModel["currentStage"],
    status: session.status,
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

export async function createSession(rawIdea: string, category?: string, presetTitle?: string) {
  const sanitizedIdea = cleanSentence(rawIdea);
  const created = await prisma.session.create({
    data: {
      userId: DEMO_USER_ID,
      title: presetTitle || titleFromIdea(sanitizedIdea),
      rawIdea: sanitizedIdea,
      category,
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
  return session.id;
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
