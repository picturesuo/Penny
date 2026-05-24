import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { CandidateBrainObjectSchema, type CandidateBrainObject } from "./candidate-brain-object.ts";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainRuns } from "./db/schema.ts";
import { createBrainRepository } from "./domain/repository.ts";
import type { EntityId } from "./domain/types.ts";
import { runLearnRecipe, type LearnRecipeOutput } from "./learn-recipe.ts";
import type { LearningSourceContext } from "./learn-plan.ts";
import {
  BrainSeedProviderError,
  BrainSeedValidationError,
  brainSeedSearchDecision,
  createDefaultBrainSeedProvider,
  createHeuristicBrainSeedProvider,
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
import { scopeValues } from "./scope.ts";

const UuidSchema = z.string().uuid();
const LearnSourceMaterialSchema = z
  .object({
    kind: z.enum(["text", "pdf", "slides", "document"]).optional().default("text"),
    fileName: z.string().trim().min(1).max(240).optional(),
    extractedText: z.string().trim().min(1).max(120_000),
  })
  .strict();

export const LearnSessionRequestSchema = z
  .object({
    rawIdea: z.string().trim().max(4_000).optional().default(""),
    sourceMaterial: LearnSourceMaterialSchema.optional(),
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
  .strict()
  .refine((value) => value.rawIdea.length > 0 || value.sourceMaterial?.extractedText, {
    message: "Provide rawIdea or sourceMaterial.extractedText.",
    path: ["rawIdea"],
  });

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
  learningPlan: LearnRecipeOutput["learningPlan"];
  sessionV2: LearnRecipeOutput["learnSessionV2"];
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
  sourceContext: LearnRecipeOutput["sourceContext"];
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
    learningPlan: recipeOutput.learningPlan,
    sessionV2: recipeOutput.learnSessionV2,
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
    sourceContext: recipeOutput.sourceContext,
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
  const localFallback = shouldUseLocalLearnSessionFallback(db);

  return {
    async create(input, request) {
      const context = resolveDevContext(request, input);
      const sourceContext = buildLearningSourceContext(input);
      const seedRawIdea = seedIdeaFromLearnInput(input, sourceContext);
      const seedInput: BrainSeedInput = {
        rawIdea: seedRawIdea,
        sessionId: input.sessionId ?? randomUUID(),
      };
      const provider = options.provider ?? (localFallback ? createHeuristicBrainSeedProvider() : createDefaultBrainSeedProvider());
      const prepareSeedRun =
        options.prepareSeedRun ??
        ((runInput: BrainSeedInput, prepareOptions: { db?: PennyDatabase; run: BrainSeedRunInput }) =>
          localFallback
            ? createLocalBrainSeedPrelude(runInput, prepareOptions.run)
            : createBrainSeedPrelude(requireRouteDb(prepareOptions.db), runInput, prepareOptions.run));
      const generateSeed = options.generateSeed ?? generateBrainSeed;
      const persistSeedFn =
        options.persistSeed ??
        ((seed: BrainSeedOutput, persistOptions: { db?: PennyDatabase; prelude: BrainSeedPrelude }) =>
          localFallback
            ? createLocalPersistedBrainSeed(seed, persistOptions.prelude)
            : persistBrainSeed(requireRouteDb(persistOptions.db), persistOptions.prelude, seed));
      const failSeedRun =
        options.failSeedRun ??
        ((prelude: BrainSeedPrelude, error: unknown, failOptions: { db?: PennyDatabase }) =>
          failOptions.db ? failBrainSeedRun(failOptions.db, prelude, error) : Promise.resolve());
      const tickAutopilot =
        options.tickAutopilot ??
        (async (tickInput: { sessionId: EntityId; resume?: boolean; limit?: number }) => {
          if (localFallback) {
            return localLearnAutopilotResponse(tickInput.sessionId);
          }

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
              sourceMaterial: input.sourceMaterial
                ? {
                    kind: input.sourceMaterial.kind,
                    fileName: input.sourceMaterial.fileName ?? null,
                    textLength: input.sourceMaterial.extractedText.length,
                  }
                : null,
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
          rawIdea: seedRawIdea,
          seedPayload,
          nextMoves: learnSessionNextMoves(seedPayload, autopilot),
          sourceContext,
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

function shouldUseLocalLearnSessionFallback(db: PennyDatabase | undefined): boolean {
  const authMode = process.env.PENNY_AUTH_MODE?.trim();

  return !db && readEnvFlag("PENNY_SKIP_DATABASE_PREP", false) && (!authMode || authMode === "dev");
}

function createLocalBrainSeedPrelude(input: BrainSeedInput, run: BrainSeedRunInput): BrainSeedPrelude {
  const now = new Date();
  const sessionId = input.sessionId ?? randomUUID();
  const sourceId = randomUUID();
  const scope = scopeValues(run.scope);

  return {
    session: {
      id: sessionId,
      ...scope,
      status: "open",
      title: input.rawIdea.slice(0, 120),
      createdAt: now,
      endedAt: null,
    },
    source: {
      id: sourceId,
      ...scope,
      sessionId,
      kind: "raw_idea",
      rawText: input.rawIdea,
      createdAt: now,
    },
    submittedSourceSpan: {
      id: randomUUID(),
      sourceId,
      claimId: null,
      claimVersionId: null,
      startOffset: 0,
      endOffset: input.rawIdea.length,
      label: "submitted_text",
      createdAt: now,
    },
    brainRun: {
      id: randomUUID(),
      ...scope,
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

function createLocalPersistedBrainSeed(seed: BrainSeedOutput, prelude: BrainSeedPrelude): PersistedBrainSeed {
  const now = new Date();
  const sessionId = prelude.session.id;
  const sourceId = prelude.source.id;
  const scope = scopeValues(prelude.session);
  const claims = seed.thoughtMap.claims.map((claim) => ({
    id: randomUUID(),
    seedId: claim.id,
    ...scope,
    sessionId,
    sourceId,
    kind: claim.kind,
    createdAt: now,
  }));
  const claimIds = new Map(claims.map((claim) => [claim.seedId, claim.id]));
  const claimVersions = seed.thoughtMap.claims.map((claim) => ({
    id: randomUUID(),
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
  const edges = seed.thoughtMap.edges.map((edge) => ({
    id: randomUUID(),
    seedId: edge.id,
    ...scope,
    sessionId,
    fromClaimId: requireMappedId(claimIds, edge.fromClaimId),
    toClaimId: requireMappedId(claimIds, edge.toClaimId),
    kind: edge.kind,
    status: "active" as const,
    label: edge.label,
    createdAt: now,
  }));
  const edgeIds = new Map(edges.map((edge) => [edge.seedId, edge.id]));
  const moves = [
    localSeedMove("move.source_recorded", "source.recorded", prelude, []),
    localSeedMove("move.seed_claim_created", "seed_claim_created", prelude, [requireMappedId(claimIds, seed.seedClaim.id)]),
    localSeedMove(
      "move.assumptions_extracted",
      "assumptions_extracted",
      prelude,
      seed.assumptions.map((assumption) => requireMappedId(claimIds, assumption.id)),
    ),
    localSeedMove("move.first_challenge_suggested", "first_challenge_suggested", prelude, [
      requireMappedId(claimIds, seed.firstChallenge.targetClaimId),
    ]),
  ];

  return {
    session: prelude.session,
    source: prelude.source,
    submittedSourceSpan: prelude.submittedSourceSpan,
    claims,
    claimVersions,
    edges,
    moves,
    brainRun: {
      ...prelude.brainRun,
      status: "succeeded",
      output: seed,
      error: null,
      completedAt: now,
    },
    idMaps: {
      claimIds,
      claimVersionIds,
      edgeIds,
    },
  };
}

function localSeedMove(
  seedId: string,
  kind: PersistedBrainSeed["moves"][number]["kind"],
  prelude: BrainSeedPrelude,
  claimIds: string[],
): PersistedBrainSeed["moves"][number] & { seedId: string } {
  return {
    id: randomUUID(),
    seedId,
    ...scopeValues(prelude.session),
    sessionId: prelude.session.id,
    kind,
    summary: seedId,
    payload: {
      claimIds,
      edgeIds: [],
      sourceIds: [prelude.source.id],
      sourceSpanIds: [prelude.submittedSourceSpan.id],
    },
    createdAt: new Date(),
  };
}

function localLearnAutopilotResponse(sessionId: EntityId): ThinkingModeTickResponse {
  const targetClaimId = randomUUID();
  const selectedCandidate = localLearnCandidate(sessionId, "learn", "learn", "Continue the Learn path", targetClaimId, 1);

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
      suggestionMoveId: randomUUID(),
      manualMoveId: null,
      paused: false,
      reason: "Local Learn fallback picked the next concept.",
      updatedAt: new Date().toISOString(),
    },
    modeContract: {
      validModes: ["Learn", "Create", "Brain"],
      activeMode: "Learn",
    },
    candidates: [
      selectedCandidate,
      localLearnCandidate(sessionId, "check", "challenge", "Pressure-test weakest claim", targetClaimId, 2),
      localLearnCandidate(sessionId, "verify", "verify", "Verify with evidence", targetClaimId, 3),
    ],
    selectedCandidate,
    graphHash: `local-learn-${sessionId}`,
    persistedMoveIds: [],
    move: {
      id: randomUUID(),
      kind: "next_move_recomputed",
      summary: "Local Learn fallback picked the next move.",
      payload: {},
      createdAt: new Date().toISOString(),
    },
  };
}

function localLearnCandidate(
  sessionId: EntityId,
  userAction: "learn" | "check" | "verify" | "save_to_brain",
  mode: "learn" | "challenge" | "verify" | "artifact",
  label: string,
  targetClaimId: string,
  rank: number,
): ThinkingModeTickResponse["candidates"][number] {
  const action = userAction === "check" ? "challenge" : userAction;
  const graphHash = `local-learn-${sessionId}`;

  return {
    id: randomUUID(),
    candidateId: `local-learn-${userAction}`,
    fingerprint: `local-learn-${sessionId}-${userAction}`,
    rank,
    title: label,
    targetClaimId,
    targetEdgeId: null,
    target: {
      type: "claim",
      id: targetClaimId,
      claimId: targetClaimId,
      edgeId: null,
    },
    action,
    userAction,
    mode,
    mvpMode: mode === "learn" ? "Learn" : "Create",
    label,
    ctaLabel: label,
    primaryActionLabel: label,
    score: 800 - rank,
    priority: {
      rank,
      score: 800 - rank,
      normalized: 80 - rank,
    },
    confidence: 80,
    reason: `${label}.`,
    whyNow: `${label}.`,
    whyPennyRecommendsThis: `Why Penny recommends this: ${label}.`,
    reasonCodes: [userAction],
    exitCriteria: {
      label: `${label} completes.`,
      acceptedMoveKinds: [],
    },
    scoreBreakdown: {
      leverage: 80,
      fragility: 70,
      stakes: 70,
      readiness: 80,
      momentum: 70,
      novelty: 60,
      shape: 0,
      penalties: 0,
    },
    graphHash,
    provenance: {
      engine: "thinking-mode-next-move-v1",
      graphHash,
      source: "thinking_graph_snapshot",
      ruleIds: [`local_${userAction}`],
      claimIds: [targetClaimId],
      edgeIds: [],
      moveIds: [],
      artifactIds: [],
    },
    candidateBrainObjects: [],
    selected: rank === 1,
    selectedAt: rank === 1 ? new Date().toISOString() : null,
  };
}

function seedIdeaFromLearnInput(input: LearnSessionRequest, sourceContext: LearningSourceContext | null): string {
  const prompt = input.rawIdea.trim();

  if (!sourceContext) {
    return prompt;
  }

  const sourceLabel = sourceContext.fileName ?? `${sourceContext.kind} source`;
  const clusterOutline = sourceContext.clusters
    .slice(0, 5)
    .map((cluster) => `${cluster.title}: ${cluster.summary}`)
    .join("\n");
  const requestedGoal = prompt || `Learn ${sourceLabel} as concise clustered lecture notes.`;

  return clipText(
    [
      requestedGoal,
      `Source file: ${sourceLabel}`,
      `Main idea: ${sourceContext.mainIdea}`,
      "Cluster outline:",
      clusterOutline,
    ].join("\n"),
    450,
  );
}

function buildLearningSourceContext(input: LearnSessionRequest): LearningSourceContext | null {
  const material = input.sourceMaterial;

  if (!material) {
    return null;
  }

  const text = normalizeSourceText(material.extractedText);
  const clusters = buildSourceClusters(text);
  const fileName = material.fileName ?? null;

  return {
    kind: material.kind,
    fileName,
    mainIdea: summarizeText(text, 360) || input.rawIdea || fileName || "Uploaded source",
    clusters,
  };
}

function buildSourceClusters(text: string): LearningSourceContext["clusters"] {
  const paragraphs = text
    .split(/\n{2,}|(?=Slide\s+\d+[:\n])/i)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 40);
  const units = paragraphs.length >= 3 ? paragraphs : chunkBySentences(text);
  const desiredCount = Math.min(7, Math.max(3, Math.ceil(units.length / 3)));
  const clusterSize = Math.max(1, Math.ceil(units.length / desiredCount));
  const clusters: LearningSourceContext["clusters"] = [];

  for (let index = 0; index < desiredCount; index += 1) {
    const chunk = units.slice(index * clusterSize, (index + 1) * clusterSize).join(" ");
    const fallback = units[index % Math.max(1, units.length)] ?? text;
    const body = chunk || fallback || "Source content needs review.";
    const title = inferClusterTitle(body, index + 1);

    clusters.push({
      id: `source-cluster-${index + 1}`,
      title,
      summary: summarizeText(body, 300) || title,
      sourceRange: `cluster ${index + 1} of ${desiredCount}`,
    });
  }

  return clusters;
}

function chunkBySentences(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const chunks: string[] = [];

  for (let index = 0; index < sentences.length; index += 4) {
    chunks.push(sentences.slice(index, index + 4).join(" "));
  }

  return chunks.length ? chunks : [text];
}

function inferClusterTitle(text: string, index: number): string {
  const heading = text.match(/^(?:slide\s+\d+[:\s-]*)?([A-Z][^.!?\n:]{8,80})[:\n.]/i)?.[1]?.trim();

  if (heading) {
    return clipText(heading, 80);
  }

  return `Source cluster ${index}`;
}

function summarizeText(text: string, maxLength: number): string {
  return clipText(text.replace(/\s+/g, " "), maxLength);
}

function normalizeSourceText(text: string): string {
  return text.replace(/\u0000/g, " ").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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
        label: "Pressure-test weakest assumption",
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
      suggestedSaveReason: "Save if these concepts will keep shaping Learn, Create, or Verify.",
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
        sourceContext: recipeOutput.sourceContext,
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

function requireMappedId(ids: Map<string, string>, seedId: string): string {
  const mappedId = ids.get(seedId);

  if (!mappedId) {
    throw new Error(`Missing local Learn persistence id for ${seedId}.`);
  }

  return mappedId;
}

function readEnvFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  return value === "1" || value === "true" || value === "yes" || value === "on";
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
