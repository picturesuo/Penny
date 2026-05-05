import { randomUUID } from "node:crypto";
import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

export type CheckNodeKind =
  | "claim"
  | "evidence"
  | "assumption"
  | "counterargument"
  | "tension"
  | "question"
  | "example"
  | "experiment"
  | "wild_idea"
  | "decision"
  | "task";

export type CheckRecommendationSlot = "clarify" | "strengthen" | "challenge" | "reframe" | "advance";
export type CheckCurveballSlot = "curveball";
export type CheckCycleStatus = "active" | "committed" | "completed";
export type CheckCommitStance = "accept" | "modify" | "reject" | "custom";

export type CheckScope = {
  userId: string;
  workspaceId: string;
  projectId: string;
  sphereId: string;
};

export type CheckProjectNode = {
  id: string;
  kind: CheckNodeKind;
  title: string;
  body: string;
  status: "open" | "active" | "resolved";
  createdAt: string;
  updatedAt: string;
};

export type CheckProjectEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: "supports" | "depends_on" | "challenges" | "raises" | "leads_to";
  label: string;
};

export type CheckProjectGraph = {
  id: string;
  northStar: string;
  currentArtifactSummary: string;
  audienceOrJudge: string;
  successCriteria: string[];
  nodes: CheckProjectNode[];
  edges: CheckProjectEdge[];
};

export type CheckRecommendation = {
  id: string;
  slot: CheckRecommendationSlot | CheckCurveballSlot;
  action: string;
  whyItMatters: string;
  effort: "low" | "medium" | "high";
  targetNodeId: string | null;
};

export type CheckWorkSprint = {
  prompt: string;
  steps: string[];
  commitment: string;
};

export type CheckBreakthrough = {
  id: string;
  title: string;
  summary: string;
  sourceCycleId: string;
  changedNodeIds: string[];
  createdAt: string;
};

export type CheckSynthesis = {
  whatChanged: string[];
  possibleBreakthrough: CheckBreakthrough | null;
  nextSuggestedCheck: string;
  saveToBrain: {
    recommended: boolean;
    label: string;
  };
};

export type CheckCycle = {
  id: string;
  sessionId: string;
  status: CheckCycleStatus;
  currentFocus: string;
  diagnosis: string;
  recommendations: CheckRecommendation[];
  curveball: CheckRecommendation;
  userCommitment: {
    text: string;
    stance: CheckCommitStance;
    recommendationId: string | null;
    createdAt: string;
  } | null;
  workSprint: CheckWorkSprint | null;
  synthesis: CheckSynthesis | null;
  createdAt: string;
  updatedAt: string;
};

export type CheckSession = {
  id: string;
  sourceOfTruth: "check_projects_cycles_nodes_breakthroughs";
  scope: CheckScope;
  status: "open" | "saved";
  input: {
    kind: "text" | "file" | "project";
    title: string;
    rawText: string;
    fileName: string | null;
  };
  project: CheckProjectGraph;
  cycles: CheckCycle[];
  activeCycleId: string | null;
  breakthroughs: CheckBreakthrough[];
  savedBrainObject: CheckSavedBrainObject | null;
  createdAt: string;
  updatedAt: string;
};

export type CheckSavedBrainObject = {
  id: string;
  objectType: "check_breakthrough";
  title: string;
  summary: string;
  createdAt: string;
};

export type CheckSessionCreateInput = z.infer<typeof CheckSessionBodySchema>;
export type CheckAddNodeInput = z.infer<typeof CheckAddNodeBodySchema>;
export type CheckCommitInput = z.infer<typeof CheckCommitBodySchema>;
export type CheckSprintInput = z.infer<typeof CheckSprintBodySchema>;

export type CheckRouteService = {
  createSession(input: CheckSessionCreateInput, request: Request): Promise<CheckSession>;
  getSession(sessionId: string, request: Request): Promise<CheckSession>;
  createCycle(sessionId: string, request: Request): Promise<{ session: CheckSession; cycle: CheckCycle; reusedActiveCycle: boolean }>;
  commitCycle(cycleId: string, input: CheckCommitInput, request: Request): Promise<{ session: CheckSession; cycle: CheckCycle; breakthrough: CheckBreakthrough | null }>;
  runSprint(cycleId: string, input: CheckSprintInput, request: Request): Promise<{ session: CheckSession; cycle: CheckCycle; synthesis: CheckSynthesis }>;
  addNode(sessionId: string, input: CheckAddNodeInput, request: Request): Promise<{ session: CheckSession; node: CheckProjectNode }>;
  saveToBrain(sessionId: string, request: Request): Promise<{ session: CheckSession; savedObject: CheckSavedBrainObject }>;
};

export type CheckRouteOptions = {
  service?: CheckRouteService;
};

export type CheckCycleProviderInput = {
  rawText: string;
  project: CheckProjectGraph;
  completedCycles: CheckCycle[];
  cycleNumber: number;
};

export type CheckCycleProviderRecommendation = {
  slot: CheckRecommendationSlot;
  action: string;
  whyItMatters: string;
  effort: "low" | "medium" | "high";
};

export type CheckCycleProviderCurveball = Omit<CheckCycleProviderRecommendation, "slot"> & {
  slot: CheckCurveballSlot;
};

export type CheckCycleProviderOutput = {
  currentFocus: string;
  diagnosis: string;
  recommendations: CheckCycleProviderRecommendation[];
  curveball: CheckCycleProviderCurveball;
};

export type CheckCycleProvider = {
  name: string;
  generateCycle(input: CheckCycleProviderInput): Promise<unknown>;
};

export type CheckGenerateText = (request: {
  model: LanguageModel;
  system: string;
  prompt: string;
  output: typeof checkCycleOutputSpec;
  maxRetries: number;
  providerOptions: {
    xai: {
      store: false;
    };
  };
}) => Promise<{ output: unknown }>;

export type XaiCheckCycleProviderOptions = {
  generateText?: CheckGenerateText;
};

export type CheckRouteServiceOptions = {
  aiProvider?: CheckCycleProvider;
};

const CheckSourceMaterialSchema = z
  .object({
    kind: z.enum(["text", "pdf", "slides", "document"]).optional().default("text"),
    fileName: z.string().trim().min(1).max(240).optional(),
    extractedText: z.string().trim().min(1).max(120_000),
  })
  .strict();

const CheckSessionBodySchema = z
  .object({
    rawText: z.string().trim().max(120_000).optional(),
    rawIdea: z.string().trim().max(120_000).optional(),
    text: z.string().trim().max(120_000).optional(),
    projectDescription: z.string().trim().max(120_000).optional(),
    sourceMaterial: CheckSourceMaterialSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!sourceTextFromSessionInput(value)) {
      context.addIssue({
        code: "custom",
        path: ["rawText"],
        message: "Provide pasted text, a project description, or uploaded source text.",
      });
    }
  });

const CheckAddNodeBodySchema = z
  .object({
    kind: z.enum([
      "claim",
      "evidence",
      "assumption",
      "counterargument",
      "tension",
      "question",
      "example",
      "experiment",
      "wild_idea",
      "decision",
      "task",
    ]),
    title: z.string().trim().min(1).max(180),
    body: z.string().trim().max(1_200).optional().default(""),
  })
  .strict();

const CheckCommitBodySchema = z
  .object({
    commitment: z.string().trim().min(1).max(2_000),
    stance: z.enum(["accept", "modify", "reject", "custom"]).optional().default("custom"),
    recommendationId: z.string().trim().min(1).max(120).nullable().optional().default(null),
  })
  .strict();

const CheckSprintBodySchema = z
  .object({
    sprintText: z.string().trim().max(8_000).optional().default(""),
    outcome: z.string().trim().max(8_000).optional().default(""),
  })
  .strict();

const CheckCycleProviderRecommendationSchema = z
  .object({
    slot: z.enum(["clarify", "strengthen", "challenge", "reframe", "advance"]),
    action: z.string().trim().min(8).max(260),
    whyItMatters: z.string().trim().min(8).max(560),
    effort: z.enum(["low", "medium", "high"]),
  })
  .strict();

const CheckCycleProviderCurveballSchema = CheckCycleProviderRecommendationSchema.extend({
  slot: z.literal("curveball"),
});

export const CheckCycleProviderOutputSchema = z
  .object({
    currentFocus: z.string().trim().min(8).max(180),
    diagnosis: z.string().trim().min(16).max(420),
    recommendations: z.array(CheckCycleProviderRecommendationSchema).length(5),
    curveball: CheckCycleProviderCurveballSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const expectedSlots: CheckRecommendationSlot[] = ["clarify", "strengthen", "challenge", "reframe", "advance"];
    const slots = value.recommendations.map((recommendation) => recommendation.slot);

    expectedSlots.forEach((slot, index) => {
      if (slots[index] !== slot) {
        context.addIssue({
          code: "custom",
          path: ["recommendations", index, "slot"],
          message: `Recommendation ${index + 1} must use slot ${slot}.`,
        });
      }
    });

    for (const [index, recommendation] of [...value.recommendations, value.curveball].entries()) {
      for (const field of ["action", "whyItMatters"] as const) {
        if (placeholderLikeText(recommendation[field])) {
          context.addIssue({
            code: "custom",
            path: index < 5 ? ["recommendations", index, field] : ["curveball", field],
            message: "Check AI output must not contain placeholder, mock, TBD, or fake content.",
          });
        }
      }
    }
  });

const checkCycleOutputSpec = Output.object<CheckCycleProviderOutput>({
  schema: CheckCycleProviderOutputSchema,
  name: "penny_check_cycle",
  description: "Penny Check cycle focus, diagnosis, five recommended moves, and one curveball.",
});

export const defaultXaiCheckModel = "grok-4.20-reasoning";

const defaultCheckRouteService = createInMemoryCheckRouteService();

export async function handleCheckSessionCollectionRequest(
  request: Request,
  options: CheckRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/check/session requires the POST method.", "POST");
  }

  const parsed = await parseJsonRequest(request, CheckSessionBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = options.service ?? defaultCheckRouteService;
    return jsonResponse({ data: { session: await service.createSession(parsed.data, request) } }, 201);
  } catch (error) {
    return checkErrorResponse(error);
  }
}

export async function handleCheckSessionRequest(
  request: Request,
  sessionId: string,
  options: CheckRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/check/session/:id requires the GET method.", "GET");
  }

  try {
    const service = options.service ?? defaultCheckRouteService;
    return jsonResponse({ data: { session: await service.getSession(sessionId, request) } });
  } catch (error) {
    return checkErrorResponse(error);
  }
}

export async function handleCheckCycleRequest(
  request: Request,
  sessionId: string,
  options: CheckRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/check/session/:id/cycle requires the POST method.", "POST");
  }

  try {
    const service = options.service ?? defaultCheckRouteService;
    const result = await service.createCycle(sessionId, request);
    const status = result.reusedActiveCycle ? 200 : 201;
    return jsonResponse({ data: result }, status);
  } catch (error) {
    return checkErrorResponse(error);
  }
}

export async function handleCheckCycleCommitRequest(
  request: Request,
  cycleId: string,
  options: CheckRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/check/cycle/:id/commit requires the POST method.", "POST");
  }

  const parsed = await parseJsonRequest(request, CheckCommitBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = options.service ?? defaultCheckRouteService;
    return jsonResponse({ data: await service.commitCycle(cycleId, parsed.data, request) });
  } catch (error) {
    return checkErrorResponse(error);
  }
}

export async function handleCheckCycleSprintRequest(
  request: Request,
  cycleId: string,
  options: CheckRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/check/cycle/:id/sprint requires the POST method.", "POST");
  }

  const parsed = await parseJsonRequest(request, CheckSprintBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = options.service ?? defaultCheckRouteService;
    return jsonResponse({ data: await service.runSprint(cycleId, parsed.data, request) });
  } catch (error) {
    return checkErrorResponse(error);
  }
}

export async function handleCheckNodeRequest(
  request: Request,
  sessionId: string,
  options: CheckRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/check/session/:id/node requires the POST method.", "POST");
  }

  const parsed = await parseJsonRequest(request, CheckAddNodeBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = options.service ?? defaultCheckRouteService;
    return jsonResponse({ data: await service.addNode(sessionId, parsed.data, request) }, 201);
  } catch (error) {
    return checkErrorResponse(error);
  }
}

export async function handleCheckSaveToBrainRequest(
  request: Request,
  sessionId: string,
  options: CheckRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/check/session/:id/save-to-brain requires the POST method.", "POST");
  }

  try {
    const service = options.service ?? defaultCheckRouteService;
    return jsonResponse({ data: await service.saveToBrain(sessionId, request) }, 201);
  } catch (error) {
    return checkErrorResponse(error);
  }
}

export class CheckRouteNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckRouteNotFoundError";
  }
}

export class CheckRouteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckRouteConflictError";
  }
}

export class CheckRouteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckRouteValidationError";
  }
}

export class CheckAiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckAiProviderError";
  }
}

export class CheckAiUnavailableError extends Error {
  constructor(message = "Check needs an AI provider to generate the next cycle. Configure XAI_API_KEY or enable PENNY_CHECK_DEMO_MODE for demo content.") {
    super(message);
    this.name = "CheckAiUnavailableError";
  }
}

export function createDefaultCheckCycleProvider(env: Record<string, string | undefined> = process.env): CheckCycleProvider {
  if (env.XAI_API_KEY?.trim()) {
    return createXaiCheckCycleProvider(env);
  }

  if (checkDemoModeEnabled(env)) {
    return createDemoCheckCycleProvider();
  }

  return createUnavailableCheckCycleProvider();
}

export function createUnavailableCheckCycleProvider(): CheckCycleProvider {
  return {
    name: "unavailable",
    async generateCycle() {
      throw new CheckAiUnavailableError();
    },
  };
}

export function createDemoCheckCycleProvider(): CheckCycleProvider {
  return {
    name: "demo",
    async generateCycle(input) {
      const focusNode = chooseFocusNode(input.project);

      return {
        currentFocus: focusNode.title,
        diagnosis: diagnosisForProject(input.project, focusNode),
        recommendations: normalRecommendations(input.project, focusNode).map(providerRecommendationFromCheckRecommendation),
        curveball: providerCurveballFromCheckRecommendation(curveballRecommendation(input.project, focusNode)),
      } satisfies CheckCycleProviderOutput;
    },
  };
}

export function createXaiCheckCycleProvider(
  env: Record<string, string | undefined> = process.env,
  options: XaiCheckCycleProviderOptions = {},
): CheckCycleProvider {
  return {
    name: "xai",
    async generateCycle(input) {
      const apiKey = env.XAI_API_KEY?.trim();

      if (!apiKey) {
        throw new CheckAiUnavailableError("XAI_API_KEY is required for the xAI Check provider.");
      }

      const xai = createXai(createXaiSettings(apiKey, env));
      const callGenerateText = options.generateText ?? generateStructuredCheckCycle;

      try {
        const result = await callGenerateText({
          model: xai.responses(resolveXaiCheckModel(env)),
          system: buildCheckCycleSystemPrompt(),
          prompt: buildCheckCyclePrompt(input),
          output: checkCycleOutputSpec,
          maxRetries: 1,
          providerOptions: {
            xai: {
              store: false,
            },
          },
        });

        return result.output;
      } catch (error) {
        if (error instanceof CheckAiUnavailableError || error instanceof CheckAiProviderError) {
          throw error;
        }

        throw new CheckAiProviderError(`xAI Check request failed: ${formatErrorMessage(error)}`);
      }
    },
  };
}

export function resolveXaiCheckModel(env: Record<string, string | undefined> = process.env): string {
  return env.XAI_CHECK_MODEL?.trim() || env.XAI_MODEL?.trim() || defaultXaiCheckModel;
}

export function buildCheckCycleSystemPrompt(): string {
  return [
    "You are Penny, a controllable thinking instrument enhanced by AI.",
    "Generate one focused Check cycle for a creative breakthrough workspace.",
    "The output must be specific to the user's project and must not contain placeholder, fake, mock, TBD, or generic filler content.",
    "Return exactly five recommended moves in this order: clarify, strengthen, challenge, reframe, advance.",
    "Return exactly one curveball that usefully breaks the frame without becoming random.",
    "Each move must be a single clear action row that the user could accept, modify, reject, or turn into a custom authored move.",
    "Do not invent external evidence, citations, metrics, or facts.",
    "Return only the structured Check cycle.",
  ].join("\n");
}

export function buildCheckCyclePrompt(input: CheckCycleProviderInput): string {
  const openNodes = input.project.nodes
    .slice(0, 14)
    .map((node) => `- ${node.kind}: ${node.title} :: ${node.body}`)
    .join("\n");
  const previousCycles = input.completedCycles
    .slice(-4)
    .map((cycle, index) => {
      const commitment = cycle.userCommitment?.text ? ` Commitment: ${cycle.userCommitment.text}` : "";
      const synthesis = cycle.synthesis?.nextSuggestedCheck ? ` Next suggested check: ${cycle.synthesis.nextSuggestedCheck}` : "";

      return `${index + 1}. Focus: ${cycle.currentFocus}.${commitment}${synthesis}`;
    })
    .join("\n");

  return [
    `Generate Check cycle ${input.cycleNumber}.`,
    "",
    "Project seed:",
    input.rawText,
    "",
    `North star: ${input.project.northStar}`,
    `Current artifact: ${input.project.currentArtifactSummary}`,
    `Audience or judge: ${input.project.audienceOrJudge}`,
    "",
    "Current graph nodes:",
    openNodes || "- No nodes yet.",
    "",
    "Previous Check cycles:",
    previousCycles || "- None yet.",
    "",
    "Output requirements:",
    "- currentFocus: a large, concrete focus title, not a generic label.",
    "- diagnosis: 1 short paragraph naming the structural blockage.",
    "- recommendations: exactly 5 rows in order: clarify, strengthen, challenge, reframe, advance.",
    "- Each recommendation action must be one sentence and directly act on the project.",
    "- curveball: exactly 1 useful frame-breaking move.",
    "- whyItMatters should explain why the move could unlock progress in this project.",
    "- No placeholder text, no fake content, no mock recommendations, no generic productivity advice.",
  ].join("\n");
}

export function createInMemoryCheckRouteService(options: CheckRouteServiceOptions = {}): CheckRouteService {
  const aiProvider = options.aiProvider ?? createDefaultCheckCycleProvider();
  const sessions = new Map<string, CheckSession>();

  function requireSession(sessionId: string): CheckSession {
    const session = sessions.get(sessionId);

    if (!session) {
      throw new CheckRouteNotFoundError("Check session was not found.");
    }

    return session;
  }

  function requireCycle(cycleId: string): { session: CheckSession; cycle: CheckCycle } {
    for (const session of sessions.values()) {
      const cycle = session.cycles.find((item) => item.id === cycleId);

      if (cycle) {
        return { session, cycle };
      }
    }

    throw new CheckRouteNotFoundError("Check cycle was not found.");
  }

  return {
    async createSession(input, request) {
      const rawText = sourceTextFromSessionInput(input);

      if (!rawText) {
        throw new CheckRouteValidationError("Check needs pasted text, an uploaded file, or a project description.");
      }

      const now = isoNow();
      const sessionId = randomUUID();
      const project = buildProjectGraph(rawText, now);
      const session: CheckSession = {
        id: sessionId,
        sourceOfTruth: "check_projects_cycles_nodes_breakthroughs",
        scope: scopeFromRequest(request),
        status: "open",
        input: {
          kind: input.sourceMaterial ? "file" : input.projectDescription ? "project" : "text",
          title: titleFromText(rawText),
          rawText,
          fileName: input.sourceMaterial?.fileName ?? null,
        },
        project,
        cycles: [],
        activeCycleId: null,
        breakthroughs: [],
        savedBrainObject: null,
        createdAt: now,
        updatedAt: now,
      };
      const cycle = await buildCycle(session, now, aiProvider);

      session.cycles.push(cycle);
      session.activeCycleId = cycle.id;
      sessions.set(session.id, session);

      return session;
    },

    async getSession(sessionId) {
      return requireSession(sessionId);
    },

    async createCycle(sessionId) {
      const session = requireSession(sessionId);
      const activeCycle = session.activeCycleId ? session.cycles.find((cycle) => cycle.id === session.activeCycleId) ?? null : null;

      if (activeCycle && activeCycle.status !== "completed") {
        return { session, cycle: activeCycle, reusedActiveCycle: true };
      }

      const now = isoNow();
      const cycle = await buildCycle(session, now, aiProvider);

      session.cycles.push(cycle);
      session.activeCycleId = cycle.id;
      session.updatedAt = now;

      return { session, cycle, reusedActiveCycle: false };
    },

    async commitCycle(cycleId, input) {
      const { session, cycle } = requireCycle(cycleId);

      if (cycle.status === "completed") {
        throw new CheckRouteConflictError("This Check cycle is already completed.");
      }

      const now = isoNow();
      const selectedRecommendation = recommendationById(cycle, input.recommendationId);
      const node = nodeFromCommitment(input.commitment, selectedRecommendation, now);
      const breakthrough = breakthroughFromCommitment(cycle, input, node, now);

      session.project.nodes.push(node);
      if (breakthrough) {
        session.breakthroughs.push(breakthrough);
      }

      cycle.status = "committed";
      cycle.userCommitment = {
        text: input.commitment,
        stance: input.stance,
        recommendationId: input.recommendationId ?? null,
        createdAt: now,
      };
      cycle.workSprint = {
        prompt: workSprintPrompt(input.commitment, selectedRecommendation),
        steps: workSprintSteps(input.commitment),
        commitment: input.commitment,
      };
      cycle.updatedAt = now;
      session.updatedAt = now;

      return { session, cycle, breakthrough };
    },

    async runSprint(cycleId, input) {
      const { session, cycle } = requireCycle(cycleId);

      if (!cycle.userCommitment) {
        throw new CheckRouteConflictError("Type a commitment before running the work sprint.");
      }

      if (cycle.status === "completed" && cycle.synthesis) {
        return { session, cycle, synthesis: cycle.synthesis };
      }

      const now = isoNow();
      const synthesis = synthesizeSprint(session, cycle, input);
      const synthesisNode = makeNode({
        kind: "decision",
        title: "Sprint synthesis",
        body: synthesis.whatChanged.join(" "),
        status: "resolved",
        now,
      });

      session.project.nodes.push(synthesisNode);
      cycle.status = "completed";
      cycle.synthesis = synthesis;
      cycle.updatedAt = now;
      session.activeCycleId = null;
      session.updatedAt = now;

      return { session, cycle, synthesis };
    },

    async addNode(sessionId, input) {
      const session = requireSession(sessionId);
      const now = isoNow();
      const node = makeNode({
        kind: input.kind,
        title: input.title,
        body: input.body || input.title,
        status: "open",
        now,
      });

      session.project.nodes.push(node);
      session.updatedAt = now;

      return { session, node };
    },

    async saveToBrain(sessionId) {
      const session = requireSession(sessionId);
      const now = isoNow();
      const latestBreakthrough = session.breakthroughs.at(-1);
      const savedObject: CheckSavedBrainObject = {
        id: randomUUID(),
        objectType: "check_breakthrough",
        title: latestBreakthrough?.title ?? `Check: ${session.input.title}`,
        summary: latestBreakthrough?.summary ?? session.project.northStar,
        createdAt: now,
      };

      session.status = "saved";
      session.savedBrainObject = savedObject;
      session.updatedAt = now;

      return { session, savedObject };
    },
  };
}

function buildProjectGraph(rawText: string, now: string): CheckProjectGraph {
  const subject = subjectFromText(rawText);
  const audience = audienceFromText(rawText);
  const claim = centralClaim(rawText);
  const projectId = randomUUID();
  const claimNode = makeNode({
    kind: "claim",
    title: claim,
    body: `Current best claim: ${claim}`,
    status: "active",
    now,
  });
  const nodes = [
    claimNode,
    makeNode({
      kind: "claim",
      title: strongerVersion(subject),
      body: "A sharper version should state the user, mechanism, and observable result.",
      status: "open",
      now,
    }),
    makeNode({
      kind: "evidence",
      title: "Proof currently implied",
      body: evidenceGuess(rawText),
      status: "open",
      now,
    }),
    makeNode({
      kind: "assumption",
      title: "Load-bearing assumption",
      body: assumptionGuess(subject),
      status: "open",
      now,
    }),
    makeNode({
      kind: "counterargument",
      title: "Skeptic's strongest objection",
      body: counterargumentGuess(subject, audience),
      status: "open",
      now,
    }),
    makeNode({
      kind: "tension",
      title: "Creative tension",
      body: `The work wants both clarity and ambition; ${audience.toLowerCase()} will need to see which one wins first.`,
      status: "open",
      now,
    }),
    makeNode({
      kind: "question",
      title: "Question that would unlock the next draft",
      body: `What would make ${audience.toLowerCase()} change their mind or act?`,
      status: "open",
      now,
    }),
    makeNode({
      kind: "example",
      title: "Concrete example needed",
      body: "Add one specific case, scene, user, or artifact that proves the idea is not abstract.",
      status: "open",
      now,
    }),
    makeNode({
      kind: "experiment",
      title: "Small test",
      body: `Run one test that can show whether ${subject.toLowerCase()} creates the intended response.`,
      status: "open",
      now,
    }),
    makeNode({
      kind: "wild_idea",
      title: "Wild alternate frame",
      body: `Treat ${subject.toLowerCase()} as a constraint to invert rather than a claim to defend.`,
      status: "open",
      now,
    }),
    makeNode({
      kind: "decision",
      title: "Decision still open",
      body: "Choose whether the next move should clarify, prove, challenge, reframe, or ship.",
      status: "open",
      now,
    }),
    makeNode({
      kind: "task",
      title: "Next visible task",
      body: "Write the smallest move that would make the project better in the next 20 minutes.",
      status: "open",
      now,
    }),
  ];

  return {
    id: projectId,
    northStar: `Make ${subject.toLowerCase()} clear enough for ${audience.toLowerCase()} to judge and act on.`,
    currentArtifactSummary: artifactSummary(rawText),
    audienceOrJudge: audience,
    successCriteria: [
      "One sentence names the claim, audience, and intended change.",
      "Evidence is specific enough that a skeptic can inspect it.",
      "The strongest counterargument is represented fairly.",
      "The next action is concrete enough to do without another planning pass.",
    ],
    nodes,
    edges: [
      {
        id: randomUUID(),
        fromNodeId: nodes[2]?.id ?? claimNode.id,
        toNodeId: claimNode.id,
        kind: "supports",
        label: "should prove",
      },
      {
        id: randomUUID(),
        fromNodeId: nodes[3]?.id ?? claimNode.id,
        toNodeId: claimNode.id,
        kind: "depends_on",
        label: "load-bearing",
      },
      {
        id: randomUUID(),
        fromNodeId: nodes[4]?.id ?? claimNode.id,
        toNodeId: claimNode.id,
        kind: "challenges",
        label: "tests",
      },
    ],
  };
}

async function buildCycle(session: CheckSession, now: string, aiProvider: CheckCycleProvider): Promise<CheckCycle> {
  const focusNode = chooseFocusNode(session.project);
  const providerOutput = await generateCheckCycleOutput(
    {
      rawText: session.input.rawText,
      project: session.project,
      completedCycles: session.cycles,
      cycleNumber: session.cycles.length + 1,
    },
    aiProvider,
  );
  const cycle: CheckCycle = {
    id: randomUUID(),
    sessionId: session.id,
    status: "active",
    currentFocus: providerOutput.currentFocus,
    diagnosis: providerOutput.diagnosis,
    recommendations: providerOutput.recommendations.map((recommendation) =>
      checkRecommendationFromProviderRecommendation(recommendation, session.project, focusNode),
    ),
    curveball: checkCurveballFromProviderCurveball(providerOutput.curveball, session.project, focusNode),
    userCommitment: null,
    workSprint: null,
    synthesis: null,
    createdAt: now,
    updatedAt: now,
  };

  validateCycleContract(cycle);
  return cycle;
}

async function generateCheckCycleOutput(
  input: CheckCycleProviderInput,
  aiProvider: CheckCycleProvider,
): Promise<CheckCycleProviderOutput> {
  let output: unknown;

  try {
    output = await aiProvider.generateCycle(input);
  } catch (error) {
    if (error instanceof CheckAiUnavailableError || error instanceof CheckAiProviderError) {
      throw error;
    }

    throw new CheckAiProviderError(`${aiProvider.name} Check provider failed: ${formatErrorMessage(error)}`);
  }

  const parsed = CheckCycleProviderOutputSchema.safeParse(output);

  if (!parsed.success) {
    throw new CheckAiProviderError(
      `Check provider output failed validation: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }

  return parsed.data;
}

function chooseFocusNode(project: CheckProjectGraph): CheckProjectNode {
  return (
    project.nodes.find((node) => node.kind === "claim" && node.status === "active") ??
    project.nodes.find((node) => node.kind === "assumption") ??
    project.nodes[0] ??
    makeNode({ kind: "claim", title: "Clarify the project", body: project.northStar, status: "active", now: isoNow() })
  );
}

function normalRecommendations(project: CheckProjectGraph, focusNode: CheckProjectNode): CheckRecommendation[] {
  const evidenceNode = project.nodes.find((node) => node.kind === "evidence") ?? focusNode;
  const counterNode = project.nodes.find((node) => node.kind === "counterargument") ?? focusNode;
  const experimentNode = project.nodes.find((node) => node.kind === "experiment") ?? focusNode;

  return [
    {
      id: randomUUID(),
      slot: "clarify",
      action: `Rewrite "${focusNode.title}" as one sentence with audience, mechanism, and result.`,
      whyItMatters: "A sharper claim gives every later proof, objection, and task a stable target.",
      effort: "low",
      targetNodeId: focusNode.id,
    },
    {
      id: randomUUID(),
      slot: "strengthen",
      action: `Attach one concrete proof point to "${evidenceNode.title}".`,
      whyItMatters: "Specific evidence keeps the project from sounding plausible but unearned.",
      effort: "medium",
      targetNodeId: evidenceNode.id,
    },
    {
      id: randomUUID(),
      slot: "challenge",
      action: `Write the strongest fair objection behind "${counterNode.title}".`,
      whyItMatters: "A fair objection shows whether the idea survives contact with a serious judge.",
      effort: "medium",
      targetNodeId: counterNode.id,
    },
    {
      id: randomUUID(),
      slot: "reframe",
      action: `Restate the project from the perspective of ${project.audienceOrJudge.toLowerCase()}.`,
      whyItMatters: "The audience frame exposes missing stakes, language, and proof standards.",
      effort: "low",
      targetNodeId: focusNode.id,
    },
    {
      id: randomUUID(),
      slot: "advance",
      action: `Run the smallest version of "${experimentNode.title}" or draft the first task artifact.`,
      whyItMatters: "Progress becomes real when the next move changes the artifact, not just the plan.",
      effort: "high",
      targetNodeId: experimentNode.id,
    },
  ];
}

function curveballRecommendation(project: CheckProjectGraph, focusNode: CheckProjectNode): CheckRecommendation {
  return {
    id: randomUUID(),
    slot: "curveball",
    action: `Invert the premise: assume "${focusNode.title}" is wrong and design the useful version anyway.`,
    whyItMatters: "The inversion can reveal a better constraint, stakeholder, or analogy than the original frame.",
    effort: "medium",
    targetNodeId: project.nodes.find((node) => node.kind === "wild_idea")?.id ?? focusNode.id,
  };
}

function providerRecommendationFromCheckRecommendation(
  recommendation: CheckRecommendation,
): CheckCycleProviderRecommendation {
  if (recommendation.slot === "curveball") {
    throw new CheckAiProviderError("Demo Check recommendation mapper received a curveball in a normal slot.");
  }

  return {
    slot: recommendation.slot,
    action: recommendation.action,
    whyItMatters: recommendation.whyItMatters,
    effort: recommendation.effort,
  };
}

function providerCurveballFromCheckRecommendation(recommendation: CheckRecommendation): CheckCycleProviderCurveball {
  return {
    slot: "curveball",
    action: recommendation.action,
    whyItMatters: recommendation.whyItMatters,
    effort: recommendation.effort,
  };
}

function checkRecommendationFromProviderRecommendation(
  recommendation: CheckCycleProviderRecommendation,
  project: CheckProjectGraph,
  focusNode: CheckProjectNode,
): CheckRecommendation {
  return {
    id: randomUUID(),
    slot: recommendation.slot,
    action: recommendation.action,
    whyItMatters: recommendation.whyItMatters,
    effort: recommendation.effort,
    targetNodeId: targetNodeIdForSlot(project, focusNode, recommendation.slot),
  };
}

function checkCurveballFromProviderCurveball(
  curveball: CheckCycleProviderCurveball,
  project: CheckProjectGraph,
  focusNode: CheckProjectNode,
): CheckRecommendation {
  return {
    id: randomUUID(),
    slot: "curveball",
    action: curveball.action,
    whyItMatters: curveball.whyItMatters,
    effort: curveball.effort,
    targetNodeId: targetNodeIdForSlot(project, focusNode, "curveball"),
  };
}

function targetNodeIdForSlot(
  project: CheckProjectGraph,
  focusNode: CheckProjectNode,
  slot: CheckRecommendationSlot | CheckCurveballSlot,
): string {
  switch (slot) {
    case "clarify":
    case "reframe":
      return focusNode.id;
    case "strengthen":
      return project.nodes.find((node) => node.kind === "evidence")?.id ?? focusNode.id;
    case "challenge":
      return project.nodes.find((node) => node.kind === "counterargument")?.id ?? focusNode.id;
    case "advance":
      return project.nodes.find((node) => node.kind === "experiment" || node.kind === "task")?.id ?? focusNode.id;
    case "curveball":
      return project.nodes.find((node) => node.kind === "wild_idea")?.id ?? focusNode.id;
  }
}

function validateCycleContract(cycle: CheckCycle): void {
  const slots = cycle.recommendations.map((recommendation) => recommendation.slot);

  if (cycle.recommendations.length !== 5) {
    throw new CheckRouteValidationError("A Check cycle must include exactly 5 normal recommendations.");
  }

  if (new Set(slots).size !== 5 || !slots.includes("clarify") || !slots.includes("strengthen") || !slots.includes("challenge") || !slots.includes("reframe") || !slots.includes("advance")) {
    throw new CheckRouteValidationError("A Check cycle must include clarify, strengthen, challenge, reframe, and advance recommendations.");
  }

  if (cycle.curveball.slot !== "curveball") {
    throw new CheckRouteValidationError("A Check cycle must include exactly 1 curveball.");
  }

  for (const recommendation of [...cycle.recommendations, cycle.curveball]) {
    if (!recommendation.action.trim() || !recommendation.whyItMatters.trim() || !recommendation.effort) {
      throw new CheckRouteValidationError("Each Check recommendation must include an action, why it matters, and effort.");
    }
  }
}

function recommendationById(cycle: CheckCycle, recommendationId: string | null | undefined): CheckRecommendation | null {
  if (!recommendationId) {
    return null;
  }

  return [...cycle.recommendations, cycle.curveball].find((recommendation) => recommendation.id === recommendationId) ?? null;
}

function nodeFromCommitment(commitment: string, recommendation: CheckRecommendation | null, now: string): CheckProjectNode {
  const slot = recommendation?.slot ?? "advance";
  const kind: CheckNodeKind =
    slot === "challenge"
      ? "counterargument"
      : slot === "curveball"
        ? "wild_idea"
        : slot === "advance"
          ? "task"
          : slot === "strengthen"
            ? "evidence"
            : "decision";

  return makeNode({
    kind,
    title: titleFromText(commitment),
    body: commitment,
    status: "active",
    now,
  });
}

function breakthroughFromCommitment(
  cycle: CheckCycle,
  input: CheckCommitInput,
  node: CheckProjectNode,
  now: string,
): CheckBreakthrough | null {
  const lower = input.commitment.toLowerCase();
  const selectedCurveball = input.recommendationId === cycle.curveball.id;
  const signalsBreakthrough =
    selectedCurveball ||
    input.stance === "custom" ||
    input.stance === "reject" ||
    /\b(instead|reframe|pivot|invert|constraint|realized|breakthrough)\b/.test(lower);

  if (!signalsBreakthrough) {
    return null;
  }

  return {
    id: randomUUID(),
    title: `Breakthrough: ${node.title}`,
    summary: `The user moved from diagnosis to a different working frame: ${input.commitment}`,
    sourceCycleId: cycle.id,
    changedNodeIds: [node.id],
    createdAt: now,
  };
}

function workSprintPrompt(commitment: string, recommendation: CheckRecommendation | null): string {
  const prefix = recommendation ? `${labelForSlot(recommendation.slot)} move` : "Custom move";

  return `${prefix}: ${commitment}`;
}

function workSprintSteps(commitment: string): string[] {
  return [
    "Make the move visible in one small artifact.",
    "Name what changed compared with the previous version.",
    `Stop when this is true: ${commitment}`,
  ];
}

function synthesizeSprint(session: CheckSession, cycle: CheckCycle, input: CheckSprintInput): CheckSynthesis {
  const sprintText = input.sprintText || input.outcome || cycle.userCommitment?.text || "The commitment was recorded.";
  const possibleBreakthrough = session.breakthroughs.find((breakthrough) => breakthrough.sourceCycleId === cycle.id) ?? null;

  return {
    whatChanged: [
      `Committed move: ${cycle.userCommitment?.text ?? "No commitment recorded."}`,
      `Sprint result: ${clipText(sprintText, 220)}`,
      `Graph update: added ${possibleBreakthrough ? "a breakthrough and decision node" : "a new working node and synthesis node"}.`,
    ],
    possibleBreakthrough,
    nextSuggestedCheck: nextSuggestedCheck(session.project),
    saveToBrain: {
      recommended: true,
      label: possibleBreakthrough ? "Save breakthrough to Brain" : "Save Check synthesis to Brain",
    },
  };
}

function nextSuggestedCheck(project: CheckProjectGraph): string {
  const openCounterargument = project.nodes.find((node) => node.kind === "counterargument" && node.status !== "resolved");

  if (openCounterargument) {
    return `Pressure-test "${openCounterargument.title}" against the revised move.`;
  }

  return "Create the next Check cycle around the clearest unresolved task.";
}

function makeNode(input: {
  kind: CheckNodeKind;
  title: string;
  body: string;
  status: CheckProjectNode["status"];
  now: string;
}): CheckProjectNode {
  return {
    id: randomUUID(),
    kind: input.kind,
    title: clipText(input.title, 160),
    body: clipText(input.body, 1_200),
    status: input.status,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function sourceTextFromSessionInput(input: {
  rawText?: string | undefined;
  rawIdea?: string | undefined;
  text?: string | undefined;
  projectDescription?: string | undefined;
  sourceMaterial?: { extractedText: string } | undefined;
}): string {
  return (
    input.sourceMaterial?.extractedText?.trim() ||
    input.rawText?.trim() ||
    input.rawIdea?.trim() ||
    input.text?.trim() ||
    input.projectDescription?.trim() ||
    ""
  );
}

function scopeFromRequest(request: Request): CheckScope {
  return {
    userId: firstPresentHeader(request, ["x-user-id", "x-penny-user-id"]) ?? "dev-user",
    workspaceId: firstPresentHeader(request, ["x-workspace-id", "x-penny-workspace-id"]) ?? "dev-workspace",
    projectId: firstPresentHeader(request, ["x-project-id", "x-penny-project-id"]) ?? "dev-project",
    sphereId: firstPresentHeader(request, ["x-sphere-id", "x-penny-sphere-id"]) ?? "dev-sphere",
  };
}

function firstPresentHeader(request: Request, names: string[]): string | undefined {
  for (const name of names) {
    const value = request.headers.get(name)?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

async function parseJsonRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<{ ok: true; data: z.infer<Schema> } | { ok: false; response: Response }> {
  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return {
      ok: false,
      response: jsonResponse({ error: { code: "invalid_json", message: bodyResult.message } }, 400),
    };
  }

  const parsed = schema.safeParse(bodyResult.value);

  if (!parsed.success) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "invalid_request",
            message: "Request body failed validation.",
            issues: parsed.error.issues.map((issue) => {
              const path = issue.path.length ? `${issue.path.join(".")}: ` : "";

              return `${path}${issue.message}`;
            }),
          },
        },
        400,
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

async function readJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  const text = await request.text();

  if (!text.trim()) {
    return {
      ok: false,
      message: "Request body must be JSON.",
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(text) as unknown,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Request body is not valid JSON: ${formatErrorMessage(error)}`,
    };
  }
}

function methodNotAllowed(message: string, allow: string): Response {
  return jsonResponse(
    {
      error: {
        code: "method_not_allowed",
        message,
      },
    },
    405,
    { Allow: allow },
  );
}

function checkErrorResponse(error: unknown): Response {
  if (error instanceof CheckRouteNotFoundError) {
    return jsonResponse({ error: { code: "not_found", message: error.message } }, 404);
  }

  if (error instanceof CheckRouteConflictError) {
    return jsonResponse({ error: { code: "check_conflict", message: error.message } }, 409);
  }

  if (error instanceof CheckRouteValidationError) {
    return jsonResponse({ error: { code: "check_invalid", message: error.message } }, 400);
  }

  if (error instanceof CheckAiUnavailableError) {
    return jsonResponse({ error: { code: "check_ai_required", message: error.message } }, 503);
  }

  if (error instanceof CheckAiProviderError) {
    return jsonResponse({ error: { code: "check_ai_failed", message: error.message } }, 502);
  }

  return jsonResponse({ error: { code: "check_failed", message: formatErrorMessage(error) } }, 500);
}

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function isoNow(): string {
  return new Date().toISOString();
}

function labelForSlot(slot: CheckRecommendationSlot | CheckCurveballSlot): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

function titleFromText(text: string): string {
  const sentence = text
    .trim()
    .split(/(?<=[.!?])\s+/u)[0]
    ?.replace(/\s+/g, " ")
    .trim();

  return clipText(sentence || "Untitled Check project", 90);
}

function subjectFromText(text: string): string {
  const words = titleFromText(text)
    .replace(/[^\w\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .join(" ");

  return words || "this project";
}

function artifactSummary(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();

  return clipText(clean, 260);
}

function centralClaim(text: string): string {
  const sentence = titleFromText(text);

  if (sentence.length > 18) {
    return sentence;
  }

  return `The core project is: ${sentence}`;
}

function strongerVersion(subject: string): string {
  return `The strongest version of ${subject.toLowerCase()}`;
}

function evidenceGuess(text: string): string {
  const hasNumber = /\d/.test(text);

  if (hasNumber) {
    return "The draft mentions a measurable signal; make that signal specific and inspectable.";
  }

  return "The current evidence is implied. Add a concrete proof point, example, source, or observed behavior.";
}

function assumptionGuess(subject: string): string {
  return `The audience will care about ${subject.toLowerCase()} once the mechanism and stakes are visible.`;
}

function counterargumentGuess(subject: string, audience: string): string {
  return `${audience} may see ${subject.toLowerCase()} as interesting but not yet proven, differentiated, or actionable.`;
}

function diagnosisForProject(project: CheckProjectGraph, focusNode: CheckProjectNode): string {
  const evidenceCount = project.nodes.filter((node) => node.kind === "evidence").length;
  const counterCount = project.nodes.filter((node) => node.kind === "counterargument").length;

  if (evidenceCount < 2) {
    return `"${focusNode.title}" is promising, but the proof is still too implicit for ${project.audienceOrJudge.toLowerCase()}.`;
  }

  if (counterCount < 2) {
    return `"${focusNode.title}" has direction, but the opposing case needs a fairer version.`;
  }

  return `"${focusNode.title}" is ready for a concrete advance move.`;
}

function audienceFromText(text: string): string {
  const lower = text.toLowerCase();

  if (/\b(investor|fundraise|yc|demo day|pitch)\b/.test(lower)) {
    return "Investors";
  }

  if (/\b(customer|buyer|user|users|market|sales)\b/.test(lower)) {
    return "Target users";
  }

  if (/\b(reader|essay|draft|article|story|audience)\b/.test(lower)) {
    return "Readers";
  }

  if (/\b(research|paper|study|teacher|professor|reviewer)\b/.test(lower)) {
    return "A critical reviewer";
  }

  if (/\b(team|strategy|roadmap|product|code|engineering)\b/.test(lower)) {
    return "The project team";
  }

  return "A skeptical judge";
}

function clipText(text: string, maxLength: number): string {
  const clean = text.replace(/\s+/g, " ").trim();

  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

async function generateStructuredCheckCycle(request: Parameters<CheckGenerateText>[0]): Promise<{ output: unknown }> {
  const result = await generateText(request);

  return { output: result.output };
}

function createXaiSettings(apiKey: string, env: Record<string, string | undefined>) {
  const baseURL = env.XAI_BASE_URL?.trim();

  if (!baseURL) {
    return { apiKey };
  }

  return { apiKey, baseURL: baseURL.replace(/\/+$/, "") };
}

function checkDemoModeEnabled(env: Record<string, string | undefined>): boolean {
  const value = env.PENNY_CHECK_DEMO_MODE?.trim() || env.PENNY_DEMO_MODE?.trim() || "";

  return /^(1|true|yes|on)$/i.test(value);
}

function placeholderLikeText(text: string): boolean {
  return /\b(?:placeholder|lorem ipsum|tbd|todo|mock|fake fallback|fake recommendation)\b/i.test(text);
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
