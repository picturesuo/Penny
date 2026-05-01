import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { CandidateBrainObjectSchema, type CandidateBrainObject } from "./candidate-brain-object.ts";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainRuns } from "./db/schema.ts";
import { createBrainRepository } from "./domain/repository.ts";
import type { EntityId } from "./domain/types.ts";
import { runLearnRecipe, type LearnRecipeOutput } from "./learn-recipe.ts";
import {
  BrainSeedProviderError,
  BrainSeedValidationError,
  brainSeedSearchDecision,
  createDefaultBrainSeedProvider,
  generateBrainSeed,
  resolveXaiBrainSeedModel,
  type BrainSeedInput,
  type BrainSeedOutput,
  type BrainSeedProvider,
} from "./seed.ts";
import {
  buildBrainSeedUiPayload,
  type BrainSeedRouteContext,
  type BrainSeedUiPayload,
} from "./brain-seed-route.ts";
import {
  createBrainSeedPrelude,
  failBrainSeedRun,
  persistBrainSeed,
  type BrainSeedPrelude,
  type BrainSeedRunInput,
  type PersistedBrainSeed,
} from "./seed-persistence.ts";
import { ThinkingModeService, type ThinkingModeTickResponse } from "./services/thinking-mode-service.ts";

const UuidSchema = z.string().uuid();

export const LearnSessionRequestSchema = z
  .object({
    rawIdea: z.string().trim().min(1).max(4_000),
    sessionId: UuidSchema.optional(),
    userId: z.string().trim().min(1).max(120).optional(),
    workspaceId: z.string().trim().min(1).max(120).optional(),
    projectId: z.string().trim().min(1).max(120).optional(),
    sphereId: z.string().trim().min(1).max(120).optional(),
    autopilot: z
      .object({
        resume: z.boolean().optional().default(false),
        limit: z.number().int().min(1).max(20).optional(),
      })
      .strict()
      .optional()
      .default({ resume: false }),
  })
  .strict();

export type LearnSessionRequest = z.infer<typeof LearnSessionRequestSchema>;

export type LearnSessionClaim = {
  id: EntityId;
  kind: "belief" | "assumption" | "question" | "concept";
  text: string;
  confidence: number;
  status: string;
};

export type LearnSessionConcept = {
  id: string;
  term: string;
  claimId: EntityId;
  whyItMatters: string;
  explanation: string;
};

export type LearnSessionNextMove = {
  action: "learn" | "check" | "verify" | "save_to_brain";
  label: string;
  reason: string;
  source: "autopilot" | "learn_session";
  candidateId: string | null;
  targetClaimId: EntityId | null;
};

export type LearnSessionStructure = {
  coreIdea: string;
  claims: LearnSessionClaim[];
  assumptions: LearnSessionClaim[];
  questions: string[];
  concepts: LearnSessionConcept[];
  creativePotential: string[];
  nextMoves: LearnSessionNextMove[];
  candidateBrainObjects: CandidateBrainObject[];
};

export type LearnSessionPayload = {
  sourceOfTruth: "claims_claim_versions_edges_moves_next_move_candidates";
  session: BrainSeedUiPayload["session"];
  source: BrainSeedUiPayload["source"];
  brainRun: BrainSeedUiPayload["brainRun"];
  recipe: LearnRecipeOutput["recipe"];
  searchDecision: LearnRecipeOutput["searchDecision"];
  brainContext: LearnRecipeOutput["brainContext"];
  learn: LearnSessionStructure;
  ideaMap: BrainSeedUiPayload["ideaMap"];
  explorationPaths: BrainSeedUiPayload["explorationPaths"];
  firstChallenge: BrainSeedUiPayload["firstChallenge"];
  autopilot: ThinkingModeTickResponse;
  modeContract: ThinkingModeTickResponse["modeContract"];
  candidateBrainObjects: CandidateBrainObject[];
};

export type LearnSessionRouteService = {
  create(input: LearnSessionRequest, request: Request): Promise<LearnSessionPayload>;
};

export type LearnSessionRouteOptions = {
  service?: LearnSessionRouteService;
  db?: PennyDatabase;
  databaseUrl?: string;
  provider?: BrainSeedProvider;
  generateSeed?: (
    input: BrainSeedInput,
    options: { provider?: BrainSeedProvider; brainRunId: string },
  ) => Promise<BrainSeedOutput>;
  prepareSeedRun?: (
    input: BrainSeedInput,
    options: { db?: PennyDatabase; run: BrainSeedRunInput },
  ) => Promise<BrainSeedPrelude>;
  persistSeed?: (
    seed: BrainSeedOutput,
    options: { db?: PennyDatabase; prelude: BrainSeedPrelude },
  ) => Promise<PersistedBrainSeed>;
  failSeedRun?: (
    prelude: BrainSeedPrelude,
    error: unknown,
    options: { db?: PennyDatabase },
  ) => Promise<void>;
  tickAutopilot?: (input: { sessionId: EntityId; resume?: boolean; limit?: number }) => Promise<ThinkingModeTickResponse>;
};

export async function handleLearnSessionRequest(
  request: Request,
  options: LearnSessionRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/learn/session requires the POST method.", "POST");
  }

  const parsed = await parseJsonRequest(request, LearnSessionRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = options.service ?? createDefaultLearnSessionService(options);

    return jsonResponse({ data: await service.create(parsed.data, request) }, 201);
  } catch (error) {
    return learnSessionErrorResponse(error);
  }
}

export function buildLearnSessionPayload(
  seedPayload: BrainSeedUiPayload,
  autopilot: ThinkingModeTickResponse,
  recipeOutput: LearnRecipeOutput,
): LearnSessionPayload {
  const candidateBrainObjects = learnSessionCandidateBrainObjects(seedPayload);
  const learn = {
    coreIdea: seedPayload.ideaMap.keyInsight || seedPayload.source.rawText,
    claims: seedPayload.ideaMap.claims.map(learnClaim),
    assumptions: seedPayload.ideaMap.claims.filter((claim) => claim.kind === "assumption").map(learnClaim),
    questions: learnQuestions(seedPayload),
    concepts: seedPayload.learnCandidates.map((candidate) => ({
      id: candidate.id,
      term: candidate.term,
      claimId: candidate.claimId,
      whyItMatters: candidate.whyItMatters,
      explanation: candidate.unblockExplanation,
    })),
    creativePotential: seedPayload.explorationPaths.map(
      (path) => `${path.title}: ${path.expectedValue}`,
    ),
    nextMoves: learnSessionNextMoves(seedPayload, autopilot),
    candidateBrainObjects,
  };

  return {
    sourceOfTruth: "claims_claim_versions_edges_moves_next_move_candidates",
    session: seedPayload.session,
    source: seedPayload.source,
    brainRun: seedPayload.brainRun,
    recipe: recipeOutput.recipe,
    searchDecision: recipeOutput.searchDecision,
    brainContext: recipeOutput.brainContext,
    learn,
    ideaMap: seedPayload.ideaMap,
    explorationPaths: seedPayload.explorationPaths,
    firstChallenge: seedPayload.firstChallenge,
    autopilot,
    modeContract: autopilot.modeContract,
    candidateBrainObjects,
  };
}

function createDefaultLearnSessionService(options: LearnSessionRouteOptions): LearnSessionRouteService {
  const db = resolveRouteDb(options);

  return {
    async create(input, request) {
      const context = resolveDevContext(request, input);
      const seedInput: BrainSeedInput = {
        rawIdea: input.rawIdea,
        sessionId: input.sessionId ?? randomUUID(),
      };
      const provider = options.provider ?? createDefaultBrainSeedProvider();
      const prepareSeedRun =
        options.prepareSeedRun ??
        ((runInput: BrainSeedInput, prepareOptions: { db?: PennyDatabase; run: BrainSeedRunInput }) =>
          createBrainSeedPrelude(requireRouteDb(prepareOptions.db), runInput, prepareOptions.run));
      const generateSeed = options.generateSeed ?? generateBrainSeed;
      const persistSeedFn =
        options.persistSeed ??
        ((seed: BrainSeedOutput, persistOptions: { db?: PennyDatabase; prelude: BrainSeedPrelude }) =>
          persistBrainSeed(requireRouteDb(persistOptions.db), persistOptions.prelude, seed));
      const failSeedRun =
        options.failSeedRun ??
        ((prelude: BrainSeedPrelude, error: unknown, failOptions: { db?: PennyDatabase }) =>
          failBrainSeedRun(requireRouteDb(failOptions.db), prelude, error));
      const tickAutopilot =
        options.tickAutopilot ??
        (async (tickInput: { sessionId: EntityId; resume?: boolean; limit?: number }) => {
          const repository = createBrainRepository(requireRouteDb(db));
          const service = new ThinkingModeService(repository);

          return service.tick({
            brainId: tickInput.sessionId,
            sessionId: tickInput.sessionId,
            resume: tickInput.resume ?? false,
            ...(tickInput.limit !== undefined ? { limit: tickInput.limit } : {}),
          });
        });
      let prelude: BrainSeedPrelude | null = null;

      try {
        prelude = await prepareSeedRun(seedInput, {
          ...dbOption(db),
          run: {
            operation: "brain.seed",
            provider: provider.name,
            model: provider.name === "xai" ? resolveXaiBrainSeedModel() : null,
            input: {
              rawIdea: seedInput.rawIdea,
              sessionId: seedInput.sessionId,
              source: "learn_session",
              searchDecision: brainSeedSearchDecision(seedInput),
            },
            scope: context,
            startedAt: new Date(),
          },
        });
        const seed = await generateSeed(seedInput, { provider, brainRunId: prelude.brainRun.id });
        const persisted = await persistSeedFn(seed, { ...dbOption(db), prelude });
        const seedPayload = buildBrainSeedUiPayload(seed, persisted, context);
        const autopilot = await tickAutopilot({
          sessionId: persisted.session.id,
          resume: input.autopilot.resume,
          limit: input.autopilot.limit ?? 6,
        });
        const recipeOutput = await runLearnRecipe({
          rawIdea: input.rawIdea,
          seedPayload,
          nextMoves: learnSessionNextMoves(seedPayload, autopilot),
        });

        await recordLearnRecipeTrace(db, persisted.brainRun.id, seed, recipeOutput);

        return buildLearnSessionPayload(seedPayload, autopilot, recipeOutput);
      } catch (error) {
        if (prelude) {
          await failSeedRun(prelude, error, dbOption(db));
        }

        throw error;
      }
    },
  };
}

function learnClaim(claim: BrainSeedUiPayload["ideaMap"]["claims"][number]): LearnSessionClaim {
  return {
    id: claim.id,
    kind: claim.kind,
    text: claim.text,
    confidence: claim.confidence,
    status: claim.status,
  };
}

function learnQuestions(seedPayload: BrainSeedUiPayload): string[] {
  const claimQuestions = seedPayload.ideaMap.claims
    .filter((claim) => claim.kind === "question")
    .map((claim) => claim.text);
  const explorationQuestions = seedPayload.explorationPaths.map((path) => path.prompt);

  return uniqueStrings([...claimQuestions, ...explorationQuestions]).slice(0, 8);
}

function learnSessionNextMoves(
  seedPayload: BrainSeedUiPayload,
  autopilot: ThinkingModeTickResponse,
): LearnSessionNextMove[] {
  return [
    nextMoveForAction("learn", seedPayload, autopilot),
    nextMoveForAction("check", seedPayload, autopilot),
    nextMoveForAction("verify", seedPayload, autopilot),
    nextMoveForAction("save_to_brain", seedPayload, autopilot),
  ];
}

function nextMoveForAction(
  action: LearnSessionNextMove["action"],
  seedPayload: BrainSeedUiPayload,
  autopilot: ThinkingModeTickResponse,
): LearnSessionNextMove {
  const candidate = autopilot.candidates.find((nextCandidate) => nextCandidate.userAction === action);

  if (candidate) {
    return {
      action,
      label: candidate.label,
      reason: candidate.whyNow,
      source: "autopilot",
      candidateId: candidate.candidateId,
      targetClaimId: candidate.targetClaimId,
    };
  }

  const seedClaim = seedPayload.ideaMap.claims[0] ?? null;
  const firstAssumption = seedPayload.ideaMap.claims.find((claim) => claim.kind === "assumption") ?? seedClaim;
  const firstConcept = seedPayload.learnCandidates[0] ?? null;

  switch (action) {
    case "learn":
      return {
        action,
        label: firstConcept ? `Learn ${firstConcept.term}` : "Start Learn",
        reason: firstConcept?.whyItMatters ?? "Clarify the concept that unlocks the current idea.",
        source: "learn_session",
        candidateId: null,
        targetClaimId: firstConcept?.claimId ?? firstAssumption?.id ?? null,
      };
    case "check":
      return {
        action,
        label: "Check the weakest assumption",
        reason: seedPayload.firstChallenge.challenge,
        source: "learn_session",
        candidateId: null,
        targetClaimId: seedPayload.firstChallenge.targetClaimId,
      };
    case "verify":
      return {
        action,
        label: "Verify the riskiest claim",
        reason: `Find evidence for "${clipText(firstAssumption?.text ?? seedPayload.source.rawText, 180)}".`,
        source: "learn_session",
        candidateId: null,
        targetClaimId: firstAssumption?.id ?? null,
      };
    case "save_to_brain":
      return {
        action,
        label: "Save to Brain",
        reason: "Save the structured Learn output when it should become durable Brain material.",
        source: "learn_session",
        candidateId: null,
        targetClaimId: seedClaim?.id ?? null,
      };
  }
}

function learnSessionCandidateBrainObjects(seedPayload: BrainSeedUiPayload): CandidateBrainObject[] {
  const seedClaim = seedPayload.ideaMap.claims[0] ?? null;
  const assumptions = seedPayload.ideaMap.claims.filter((claim) => claim.kind === "assumption");
  const conceptList = seedPayload.learnCandidates.map((candidate) => `${candidate.term}: ${candidate.unblockExplanation}`);
  const candidates = [
    {
      objectType: "learn_session",
      title: `Learn: ${clipText(seedPayload.source.rawText, 96)}`,
      summary: seedPayload.ideaMap.keyInsight,
      content: [
        `Core idea: ${seedPayload.source.rawText}`,
        `Key insight: ${seedPayload.ideaMap.keyInsight}`,
        `First challenge: ${seedPayload.firstChallenge.challenge}`,
      ].join("\n"),
      suggestedSaveReason: "Save the structured Learn session as the durable entry point for this idea.",
      source: "learn" as const,
      refs: {
        sessionId: seedPayload.session.id,
        ...(seedClaim ? { currentClaimId: seedClaim.id } : {}),
      },
    },
    {
      objectType: "assumption_stack",
      title: "Assumptions to pressure-test",
      summary: `${assumptions.length} assumptions extracted from the dropped idea.`,
      content: assumptions.map((claim) => `- ${claim.text}`).join("\n") || seedPayload.ideaMap.keyInsight,
      suggestedSaveReason: "Save when the assumption stack should be reviewed or expanded later.",
      source: "learn" as const,
      refs: {
        sessionId: seedPayload.session.id,
        ...(assumptions[0] ? { currentClaimId: assumptions[0].id } : {}),
      },
    },
    {
      objectType: "concept_glossary",
      title: "Concepts to learn",
      summary: seedPayload.learnCandidates.map((candidate) => candidate.term).join(", "),
      content: conceptList.join("\n") || "No concepts were generated.",
      suggestedSaveReason: "Save if these concepts will keep shaping Learn, Check, or Verify.",
      source: "learn" as const,
      refs: {
        sessionId: seedPayload.session.id,
        ...(seedPayload.learnCandidates[0] ? { currentClaimId: seedPayload.learnCandidates[0].claimId } : {}),
        ...(seedPayload.learnCandidates[0] ? { term: seedPayload.learnCandidates[0].term } : {}),
      },
    },
  ];

  return candidates.map((candidate) => CandidateBrainObjectSchema.parse(candidate));
}

function resolveDevContext(request: Request, body: LearnSessionRequest): BrainSeedRouteContext {
  return {
    userId: firstPresentHeader(request, ["x-user-id", "x-penny-user-id"]) ?? body.userId ?? "dev-user",
    workspaceId:
      firstPresentHeader(request, ["x-workspace-id", "x-penny-workspace-id"]) ?? body.workspaceId ?? "dev-workspace",
    projectId: firstPresentHeader(request, ["x-project-id", "x-penny-project-id"]) ?? body.projectId ?? "dev-project",
    sphereId: firstPresentHeader(request, ["x-sphere-id", "x-penny-sphere-id"]) ?? body.sphereId ?? "dev-sphere",
  };
}

async function recordLearnRecipeTrace(
  db: PennyDatabase | undefined,
  brainRunId: string,
  seed: BrainSeedOutput,
  recipeOutput: LearnRecipeOutput,
): Promise<void> {
  if (!db) {
    return;
  }

  await db
    .update(brainRuns)
    .set({
      output: {
        ...seed,
        recipe: recipeOutput.recipe,
        searchDecision: recipeOutput.searchDecision,
        brainContext: recipeOutput.brainContext,
      },
    })
    .where(eq(brainRuns.id, brainRunId));
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

function learnSessionErrorResponse(error: unknown): Response {
  if (error instanceof BrainSeedValidationError) {
    return jsonResponse(
      {
        error: {
          code: "invalid_learn_session_output",
          message: error.message,
          issues: error.issues,
        },
      },
      502,
    );
  }

  if (error instanceof BrainSeedProviderError) {
    return jsonResponse(
      {
        error: {
          code: "learn_session_provider_failed",
          message: error.message,
        },
      },
      502,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "learn_session_failed",
        message: formatErrorMessage(error),
      },
    },
    500,
  );
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

function resolveRouteDb(options: LearnSessionRouteOptions): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (options.databaseUrl) {
    return createPennyDb(options.databaseUrl);
  }

  if (process.env.DATABASE_URL?.trim()) {
    return createPennyDb();
  }

  return undefined;
}

function requireRouteDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for POST /api/learn/session.");
  }

  return db;
}

function dbOption(db: PennyDatabase | undefined): { db?: PennyDatabase } {
  return db ? { db } : {};
}

function jsonResponse(payload: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clipText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1).trimEnd()}.`;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}

export { LearnRecipeOutputSchema, runLearnRecipe } from "./learn-recipe.ts";
export type { LearnRecipeInput, LearnRecipeOutput, LearnRecipeStepName } from "./learn-recipe.ts";
