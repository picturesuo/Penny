import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import {
  CommandIdempotencyRequestFields,
  commandRequestHash,
  commandScopeFromHeaders,
  createDbCommandIdempotencyStore,
  resolveCommandIdempotencyKey,
  runIdempotentCommand,
  stripCommandIdempotencyFields,
  type CommandIdempotencyStore,
} from "./command-idempotency.ts";
import { afterMoveEffectsInTransaction } from "./after-move-effects.ts";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainRuns, claimEdges, claimVersions, claims, moves, sourceSpans, sources } from "./db/schema.ts";
import { requireRecordedBrainRun, type BrainRunGuardOptions } from "./brain-run-guard.ts";
import { formatLensSnapshot, loadLensSnapshot, type LensSnapshot } from "./lens-snapshot.ts";
import { createMove, parseMovePayload } from "./move-payloads.ts";
import { flattenIssues } from "./schema.ts";
import { scopeValues } from "./scope.ts";

export const VerifyRequestSchema = z
  .object({
    claimId: z.string().uuid(),
    currentClaimText: z.string().trim().min(1).max(4_000),
    sessionId: z.string().uuid(),
    ...CommandIdempotencyRequestFields,
  })
  .strict();

export const VerifyConfidenceDecisionRequestSchema = z
  .object({
    verifyMoveId: z.string().uuid(),
    decision: z.enum(["accept", "reject"]),
    reason: z.string().trim().min(1).max(2_000).optional(),
    ...CommandIdempotencyRequestFields,
  })
  .strict();

const VerifyVerdictSchema = z.enum(["supported", "weakened", "mixed", "not_enough_evidence"]);
const EvidenceStanceSchema = z.enum(["supports", "weakens", "mixed", "unclear"]);
const VerifyRecipeStepNameSchema = z.enum([
  "decompose_claim",
  "search_gather",
  "evaluate_evidence",
  "synthesize_verdict",
  "suggest_confidence_change",
]);

const NullableProviderStringSchema = z.string().nullable().optional();

export const VerifyProviderSchema = z
  .object({
    verdict: VerifyVerdictSchema,
    summary: z.string(),
    evidenceCards: z.array(
      z
        .object({
          title: z.string(),
          summary: z.string(),
          stance: EvidenceStanceSchema,
          sourceName: NullableProviderStringSchema,
          sourceUrl: NullableProviderStringSchema,
          citation: NullableProviderStringSchema,
        })
        .strict(),
    ),
    citations: z
      .array(
        z
          .object({
            title: z.string(),
            sourceName: NullableProviderStringSchema,
            sourceUrl: NullableProviderStringSchema,
            citation: NullableProviderStringSchema,
          })
          .strict(),
      )
      .optional(),
    unsupportedParts: z
      .array(
        z
          .object({
            part: z.string(),
            reason: z.string(),
            neededEvidence: NullableProviderStringSchema,
          })
          .strict(),
      )
      .optional(),
    confidenceDeltaSuggestion: z.number(),
    whatWouldChangeThis: z.string(),
    nextQuestion: z.string(),
    recipe: z
      .object({
        steps: z.array(
          z
            .object({
              step: VerifyRecipeStepNameSchema,
              title: z.string(),
              status: z.enum(["completed", "limited", "skipped"]),
              summary: z.string(),
              inputs: z.array(z.string()).optional(),
              outputs: z.array(z.string()).optional(),
            })
            .strict(),
        ),
      })
      .strict()
      .optional(),
  })
  .strict();

const OptionalTextSchema = (maxLength: number) =>
  z.preprocess((value) => trimmedNullable(value), z.string().min(1).max(maxLength).nullable().optional());

const OptionalUrlSchema = z.preprocess(
  (value) => trimmedNullable(value),
  z.string().url().max(1_000).nullable().optional(),
);

const EvidenceCardSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    summary: z.string().trim().min(1).max(700),
    stance: EvidenceStanceSchema,
    sourceName: OptionalTextSchema(180),
    sourceUrl: OptionalUrlSchema,
    citation: OptionalTextSchema(700),
  })
  .strict();

const VerifyCitationSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    sourceName: OptionalTextSchema(180),
    sourceUrl: OptionalUrlSchema,
    citation: OptionalTextSchema(700),
  })
  .strict();

const UnsupportedPartSchema = z
  .object({
    part: z.string().trim().min(1).max(300),
    reason: z.string().trim().min(1).max(700),
    neededEvidence: OptionalTextSchema(700),
  })
  .strict();

const VerifyRecipeStepSchema = z
  .object({
    step: VerifyRecipeStepNameSchema,
    title: z.string().trim().min(1).max(120),
    status: z.enum(["completed", "limited", "skipped"]),
    summary: z.string().trim().min(1).max(500),
    inputs: z.array(z.string().trim().min(1).max(180)).max(6),
    outputs: z.array(z.string().trim().min(1).max(180)).max(6),
  })
  .strict();

const verifyRecipeStepOrder = [
  "decompose_claim",
  "search_gather",
  "evaluate_evidence",
  "synthesize_verdict",
  "suggest_confidence_change",
] as const;

const VerifyRecipeSchema = z
  .object({
    steps: z.array(VerifyRecipeStepSchema).length(verifyRecipeStepOrder.length),
  })
  .strict()
  .superRefine((recipe, context) => {
    recipe.steps.forEach((step, index) => {
      if (step.step !== verifyRecipeStepOrder[index]) {
        context.addIssue({
          code: "custom",
          path: ["steps", index, "step"],
          message: `verify recipe step ${index + 1} must be ${verifyRecipeStepOrder[index]}`,
        });
      }
    });
  });

export const VerifyOutputSchema = z
  .object({
    verdict: VerifyVerdictSchema,
    summary: z.string().trim().min(1).max(900),
    evidenceCards: z.array(EvidenceCardSchema).min(1).max(6),
    citations: z.array(VerifyCitationSchema).max(8),
    unsupportedParts: z.array(UnsupportedPartSchema).max(8),
    confidenceDeltaSuggestion: z.number().int().min(-30).max(30),
    whatWouldChangeThis: z.string().trim().min(1).max(700),
    nextQuestion: z.string().trim().min(1).max(300),
    recipe: VerifyRecipeSchema,
  })
  .strict()
  .superRefine((output, context) => {
    const text = [
      output.summary,
      output.whatWouldChangeThis,
      output.nextQuestion,
      ...output.citations.flatMap((citation) => [
        citation.title,
        citation.sourceName ?? "",
        citation.sourceUrl ?? "",
        citation.citation ?? "",
      ]),
      ...output.unsupportedParts.flatMap((part) => [part.part, part.reason, part.neededEvidence ?? ""]),
      ...output.recipe.steps.flatMap((step) => [
        step.title,
        step.summary,
        ...step.inputs,
        ...step.outputs,
      ]),
      ...output.evidenceCards.flatMap((card) => [
        card.title,
        card.summary,
        card.sourceName ?? "",
        card.citation ?? "",
      ]),
    ]
      .join("\n")
      .toLowerCase();

    for (const phrase of ["as an ai", "consult a professional", "more research is needed", "it depends on many factors"]) {
      if (text.includes(phrase)) {
        context.addIssue({
          code: "custom",
          message: `verify output contains generic response phrase: ${phrase}`,
        });
      }
    }
  });

type CommandIdempotencyFieldName = "idempotencyKey" | "commandId" | "customId";
type WithoutCommandIdempotencyFields<T> = T extends unknown ? Omit<T, CommandIdempotencyFieldName> : never;

export type VerifyRequest = WithoutCommandIdempotencyFields<z.infer<typeof VerifyRequestSchema>>;
export type VerifyConfidenceDecisionRequest = WithoutCommandIdempotencyFields<
  z.infer<typeof VerifyConfidenceDecisionRequestSchema>
>;
export type VerifyOutput = z.infer<typeof VerifyOutputSchema>;
export type VerifyProviderOutput = z.infer<typeof VerifyProviderSchema>;
export type EvidenceCard = z.infer<typeof EvidenceCardSchema>;
export type VerifyCitation = z.infer<typeof VerifyCitationSchema>;
export type UnsupportedPart = z.infer<typeof UnsupportedPartSchema>;
export type VerifyRecipe = z.infer<typeof VerifyRecipeSchema>;
export type VerifyRecipeStep = z.infer<typeof VerifyRecipeStepSchema>;

export type VerifyWebSearchDecision = {
  useWebSearch: boolean;
  reason: string;
  signals: ReadonlyArray<string>;
};

export type VerifyGenerationInput = {
  claimId: string;
  sessionId: string;
  currentClaimText: string;
  currentClaimKind: "belief" | "assumption" | "question" | "concept";
  currentClaimStatus: "exploratory" | "committed" | "resolved" | "rejected";
  currentClaimConfidence: number;
  lensSnapshot?: LensSnapshot;
};

const verifyOutputSpec = Output.object<VerifyProviderOutput>({
  schema: VerifyProviderSchema,
  name: "penny_verify_run",
  description: "A source-grounded Penny Verify result with evidence cards, unsupported parts, recipe steps, and a pending confidence delta suggestion.",
});

export type VerifyGenerateText = (request: {
  model: LanguageModel;
  system: string;
  prompt: string;
  output: typeof verifyOutputSpec;
  maxRetries: number;
  tools?: Record<string, unknown> | undefined;
  providerOptions: {
    xai: {
      store: false;
    };
  };
}) => Promise<{ output: unknown; sources?: unknown[] }>;

export type VerifyProvider = {
  name: string;
  searchEnabled: boolean;
  generate(input: VerifyGenerationInput): Promise<{ output: unknown; sources?: unknown[] }>;
};

export type ConfidenceUpdateDecision = {
  suggestedDelta: number;
  autoApplied: false;
  decision: "pending_user_decision";
};

export type PersistedVerify = VerifyOutput & {
  targetClaim: PersistedClaimSlice;
  move: PersistedMoveSlice;
  brainRun: {
    id: string;
    status: string;
  };
  citationSources: PersistedCitationSlice[];
  confidenceUpdate: ConfidenceUpdateDecision;
};

export type ConfidenceCascadeApplied = {
  claimId: string;
  viaEdgeId: string;
  depth: number;
  previousVersionId: string;
  currentVersionId: string;
  previousConfidence: number;
  currentConfidence: number;
  appliedDelta: number;
};

export type ConfidenceCascadeEdge = Pick<
  typeof claimEdges.$inferSelect,
  "id" | "userId" | "workspaceId" | "projectId" | "sphereId" | "fromClaimId" | "toClaimId" | "kind" | "status" | "createdAt"
>;

export type ConfidenceCascadePlanStep = {
  claimId: string;
  viaEdgeId: string;
  depth: number;
  appliedDelta: number;
};

export type ConfidenceCascadePolicy = {
  maxDepth: number;
  maxClaims: number;
};

export const verifyConfidenceCascadePolicy: ConfidenceCascadePolicy = {
  maxDepth: 2,
  maxClaims: 12,
};

export type PersistedVerifyConfidenceDecision = {
  decision: VerifyConfidenceDecisionRequest["decision"];
  targetClaim: PersistedClaimSlice;
  move: PersistedConfidenceDecisionMoveSlice;
  confidenceUpdate: {
    verifyMoveId: string;
    suggestedDelta: number;
    accepted: boolean;
    previousConfidence: number;
    currentConfidence: number;
    appliedDelta: number;
    cascade: ConfidenceCascadeApplied[];
  };
};

export type VerifyRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  provider?: VerifyProvider;
  verifyClaim?: (
    input: VerifyRequest,
    options: { db?: PennyDatabase; provider: VerifyProvider },
  ) => Promise<PersistedVerify>;
  idempotencyStore?: CommandIdempotencyStore;
};

export type VerifyConfidenceRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  decideConfidence?: (
    input: VerifyConfidenceDecisionRequest,
    options: { db?: PennyDatabase },
  ) => Promise<PersistedVerifyConfidenceDecision>;
  idempotencyStore?: CommandIdempotencyStore;
};

type VerifyPrelude = {
  target: Awaited<ReturnType<typeof loadClaimWithCurrentVersion>>;
  brainRun: typeof brainRuns.$inferSelect;
  lensSnapshot: LensSnapshot;
};

type VerifyTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];
type ScopedRecord = {
  userId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  sphereId: string | null;
};

type PersistedClaimSlice = {
  id: string;
  versionId: string;
  kind: "belief" | "assumption" | "question" | "concept";
  status: "exploratory" | "committed" | "resolved" | "rejected";
  text: string;
  confidence: number;
};

type PersistedMoveSlice = {
  id: string;
  kind: "verify_run";
  summary: string;
  claimIds: string[];
  edgeIds: string[];
  artifactIds: string[];
};

type PersistedConfidenceDecisionMoveSlice = {
  id: string;
  kind: "confidence_update_accepted" | "confidence_update_rejected";
  summary: string;
  claimIds: string[];
  edgeIds: string[];
  artifactIds: string[];
};

type PersistedCitationSlice = {
  evidenceTitle: string;
  source: {
    id: string;
    kind: "verification_citation";
    rawText: string;
  };
  sourceSpan: {
    id: string;
    sourceId: string;
    claimId: string | null;
    claimVersionId: string | null;
    label: string | null;
  };
};

export const defaultXaiVerifyModel = "grok-4.20-reasoning";

export async function handleVerifyRequest(
  request: Request,
  options: VerifyRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /brain/verify requires the POST method.");
  }

  const parsed = await parseJsonRequest(request, VerifyRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const keyResult = resolveCommandIdempotencyKey(request, parsed.data);

  if (!keyResult.ok) {
    return keyResult.response;
  }

  const commandInput = stripCommandIdempotencyFields(parsed.data) as VerifyRequest;
  const provider = options.provider ?? defaultVerifyProvider();
  const db = resolveVerifyDb(options, Boolean(options.verifyClaim));
  const verifyClaim =
    options.verifyClaim ??
    ((input: VerifyRequest, verifyOptions: { db?: PennyDatabase; provider: VerifyProvider }) =>
      runVerify(requireVerifyDb(verifyOptions.db), input, { provider: verifyOptions.provider }));
  const idempotencyStore = options.idempotencyStore ?? (db ? createDbCommandIdempotencyStore(db) : undefined);

  return runIdempotentCommand({
    route: "POST /brain/verify",
    key: keyResult.key,
    requestHash: commandRequestHash("POST /brain/verify", commandInput),
    scope: commandScopeFromHeaders(request),
    store: idempotencyStore,
    execute: async () => {
      try {
        return jsonResponse({ data: await verifyClaim(commandInput, { ...dbOption(db), provider }) }, 201);
      } catch (error) {
        return verifyErrorResponse(error);
      }
    },
  });
}

export async function handleVerifyConfidenceRequest(
  request: Request,
  options: VerifyConfidenceRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /brain/verify/confidence requires the POST method.");
  }

  const parsed = await parseJsonRequest(request, VerifyConfidenceDecisionRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const keyResult = resolveCommandIdempotencyKey(request, parsed.data);

  if (!keyResult.ok) {
    return keyResult.response;
  }

  const commandInput = stripCommandIdempotencyFields(parsed.data) as VerifyConfidenceDecisionRequest;
  const db = resolveVerifyConfidenceDb(options, Boolean(options.decideConfidence));
  const decideConfidence =
    options.decideConfidence ??
    ((input: VerifyConfidenceDecisionRequest, decisionOptions: { db?: PennyDatabase }) =>
      decideVerifyConfidence(requireVerifyConfidenceDb(decisionOptions.db), input));
  const idempotencyStore = options.idempotencyStore ?? (db ? createDbCommandIdempotencyStore(db) : undefined);

  return runIdempotentCommand({
    route: "POST /brain/verify/confidence",
    key: keyResult.key,
    requestHash: commandRequestHash("POST /brain/verify/confidence", commandInput),
    scope: commandScopeFromHeaders(request),
    store: idempotencyStore,
    execute: async () => {
      try {
        return jsonResponse({ data: await decideConfidence(commandInput, dbOption(db)) }, 200);
      } catch (error) {
        return verifyErrorResponse(error);
      }
    },
  });
}

export class VerifyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifyNotFoundError";
  }
}

export class VerifyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifyConflictError";
  }
}

export class VerifyProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifyProviderError";
  }
}

export class VerifyGenerationError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message);
    this.name = "VerifyGenerationError";
  }
}

export async function runVerify(
  db: PennyDatabase,
  input: VerifyRequest,
  options: { provider?: VerifyProvider } = {},
): Promise<PersistedVerify> {
  const provider = options.provider ?? defaultVerifyProvider();
  const prelude = await createVerifyPrelude(db, input, provider);

  try {
    const output = await generateVerifyOutput(verifyGenerationInput(prelude.target, input, prelude.lensSnapshot), {
      provider,
      brainRunId: prelude.brainRun.id,
    });

    return await persistVerifyResult(db, output, prelude);
  } catch (error) {
    await markVerifyRunFailed(db, prelude.brainRun.id, error);
    throw error;
  }
}

export async function decideVerifyConfidence(
  db: PennyDatabase,
  input: VerifyConfidenceDecisionRequest,
): Promise<PersistedVerifyConfidenceDecision> {
  return db.transaction(async (tx) => {
    const [verifyMove] = await tx.select().from(moves).where(eq(moves.id, input.verifyMoveId)).limit(1);

    if (!verifyMove) {
      throw new VerifyNotFoundError("Verify move was not found.");
    }

    if (verifyMove.kind !== "verify_run") {
      throw new VerifyConflictError("Confidence decisions can only target verify_run moves.");
    }

    const verifyPayload = parseMovePayload("verify_run", verifyMove.payload);
    if (verifyPayload.autoAppliedConfidence) {
      throw new VerifyConflictError("Verify confidence suggestion has already been applied automatically.");
    }

    await assertPendingConfidenceDecision(tx, verifyMove.sessionId, verifyMove.id);

    const target = await loadClaimWithCurrentVersion(tx, verifyPayload.claimId, verifyMove.sessionId);
    assertSameScope(verifyMove, target.claim, "Verify confidence decision is outside the target claim scope.");

    if (input.decision === "reject") {
      const move = await createMove(tx, "confidence_update_rejected", {
        sessionId: verifyMove.sessionId,
        scope: target.claim,
        summary: "Rejected a Verify confidence suggestion.",
        payload: {
          decision: "reject",
          verifyMoveId: verifyMove.id,
          claimId: verifyPayload.claimId,
          claimVersionId: verifyPayload.claimVersionId,
          brainRunId: verifyPayload.brainRunId,
          confidenceDeltaSuggestion: verifyPayload.confidenceDeltaSuggestion,
          ...(input.reason ? { reason: input.reason } : {}),
          claimIds: [verifyPayload.claimId],
          claimVersionIds: [verifyPayload.claimVersionId],
          edgeIds: [],
          sourceIds: verifyPayload.sourceIds,
          sourceSpanIds: verifyPayload.sourceSpanIds,
        },
      });
      await afterMoveEffectsInTransaction(tx, { sessionId: verifyMove.sessionId, moveId: move.id });

      return {
        decision: "reject",
        targetClaim: claimSlice(target.claim, target.version),
        move: confidenceDecisionMoveSlice(move, [verifyPayload.claimId], []),
        confidenceUpdate: {
          verifyMoveId: verifyMove.id,
          suggestedDelta: verifyPayload.confidenceDeltaSuggestion,
          accepted: false,
          previousConfidence: target.version.confidence,
          currentConfidence: target.version.confidence,
          appliedDelta: 0,
          cascade: [],
        },
      };
    }

    if (target.version.id !== verifyPayload.claimVersionId) {
      throw new VerifyConflictError("Verify confidence suggestion is stale for the current ClaimVersion.");
    }

    const targetMutation = confidenceMutation(target, verifyPayload.confidenceDeltaSuggestion);
    const edges = await tx
      .select()
      .from(claimEdges)
      .where(and(eq(claimEdges.sessionId, verifyMove.sessionId), eq(claimEdges.kind, "depends_on")));
    const scopedEdges = edges.filter((edge) => sameScope(edge, target.claim));
    const cascadePlan = buildConfidenceCascadePlan({
      changedClaimId: target.claim.id,
      delta: targetMutation.appliedDelta,
      edges: scopedEdges,
    });
    const cascadeMutations: Array<ReturnType<typeof confidenceMutation> & { viaEdgeId: string; depth: number }> = [];

    for (const step of cascadePlan) {
      const dependent = await loadClaimWithCurrentVersion(tx, step.claimId, verifyMove.sessionId);
      assertSameScope(target.claim, dependent.claim, "Verify confidence cascade crossed a scope boundary.");
      const mutation = confidenceMutation(dependent, step.appliedDelta);

      if (mutation.appliedDelta !== 0) {
        cascadeMutations.push({
          ...mutation,
          viaEdgeId: step.viaEdgeId,
          depth: step.depth,
        });
      }
    }

    const cascade = cascadeMutations.map(cascadeApplied);
    const claimIds = uniqueStrings([target.claim.id, ...cascade.map((entry) => entry.claimId)]);
    const claimVersionIds = uniqueStrings([
      targetMutation.previousVersionId,
      targetMutation.currentVersionId,
      ...cascade.flatMap((entry) => [entry.previousVersionId, entry.currentVersionId]),
    ]);
    const edgeIds = uniqueStrings(cascade.map((entry) => entry.viaEdgeId));
    const move = await createMove(tx, "confidence_update_accepted", {
      sessionId: verifyMove.sessionId,
      scope: target.claim,
      summary: acceptedConfidenceSummary(targetMutation.appliedDelta, cascade.length),
      payload: {
        decision: "accept",
        verifyMoveId: verifyMove.id,
        claimId: verifyPayload.claimId,
        previousVersionId: targetMutation.previousVersionId,
        currentVersionId: targetMutation.currentVersionId,
        brainRunId: verifyPayload.brainRunId,
        confidenceDeltaSuggestion: verifyPayload.confidenceDeltaSuggestion,
        previousConfidence: targetMutation.previousConfidence,
        currentConfidence: targetMutation.currentConfidence,
        appliedDelta: targetMutation.appliedDelta,
        cascade,
        ...(input.reason ? { reason: input.reason } : {}),
        claimIds,
        claimVersionIds,
        edgeIds,
        sourceIds: verifyPayload.sourceIds,
        sourceSpanIds: verifyPayload.sourceSpanIds,
      },
    });

    const currentTargetVersion = await applyConfidenceMutation(tx, targetMutation, move.id);
    await copyVerifyEvidenceSpansToCurrentVersion(
      tx,
      verifyPayload.sourceSpanIds,
      target.claim.id,
      currentTargetVersion.id,
    );

    for (const mutation of cascadeMutations) {
      await applyConfidenceMutation(tx, mutation, move.id);
    }

    await afterMoveEffectsInTransaction(tx, { sessionId: verifyMove.sessionId, moveId: move.id });

    return {
      decision: "accept",
      targetClaim: claimSlice(target.claim, currentTargetVersion),
      move: confidenceDecisionMoveSlice(move, claimIds, edgeIds),
      confidenceUpdate: {
        verifyMoveId: verifyMove.id,
        suggestedDelta: verifyPayload.confidenceDeltaSuggestion,
        accepted: true,
        previousConfidence: targetMutation.previousConfidence,
        currentConfidence: targetMutation.currentConfidence,
        appliedDelta: targetMutation.appliedDelta,
        cascade,
      },
    };
  });
}

export async function generateVerifyOutput(
  input: VerifyGenerationInput,
  options: { provider?: VerifyProvider } & BrainRunGuardOptions = {},
): Promise<VerifyOutput> {
  requireRecordedBrainRun("verify_run", options);

  const provider = options.provider ?? defaultVerifyProvider();
  const result = await provider.generate(input);

  return parseVerifyOutput(result.output, result.sources ?? [], input);
}

export function parseVerifyOutput(
  output: unknown,
  providerSources: unknown[] = [],
  input?: VerifyGenerationInput,
): VerifyOutput {
  const parsed = VerifyProviderSchema.safeParse(output);

  if (!parsed.success) {
    throw new VerifyGenerationError("Verify output failed provider validation.", flattenIssues(parsed.error));
  }

  const evidenceCards = normalizeEvidenceCards(parsed.data.evidenceCards, providerSources);
  const searchDecision = verifyWebSearchDecision(input);
  const strictInput = {
    ...parsed.data,
    summary: parsed.data.summary.trim(),
    evidenceCards,
    citations: normalizeVerifyCitations(parsed.data.citations, evidenceCards, providerSources),
    unsupportedParts: normalizeUnsupportedParts(parsed.data.unsupportedParts, parsed.data.verdict, input),
    whatWouldChangeThis: parsed.data.whatWouldChangeThis.trim(),
    nextQuestion: parsed.data.nextQuestion.trim(),
    recipe: normalizeVerifyRecipe(parsed.data.recipe, {
      input,
      output: parsed.data,
      evidenceCards,
      searchDecision,
    }),
  };
  const strict = VerifyOutputSchema.safeParse(strictInput);

  if (!strict.success) {
    throw new VerifyGenerationError("Verify output failed strict validation.", flattenIssues(strict.error));
  }

  return strict.data;
}

export function defaultVerifyProvider(env: Record<string, string | undefined> = process.env): VerifyProvider {
  if (env.XAI_API_KEY?.trim()) {
    return createXaiVerifyProvider(env);
  }

  return createHeuristicVerifyProvider();
}

export function createHeuristicVerifyProvider(): VerifyProvider {
  return {
    name: "heuristic",
    searchEnabled: false,
    async generate(input) {
      return {
        output: {
          verdict: "not_enough_evidence",
          summary: `No external verification provider is configured for "${clipText(input.currentClaimText, 120)}".`,
          evidenceCards: [
            {
              title: "Current Brain state",
              summary: "Penny can preserve the claim and record that no citation-backed verification was available.",
              stance: "unclear",
              sourceName: "Penny Brain",
              sourceUrl: null,
              citation: null,
            },
          ],
          citations: [],
          unsupportedParts: [
            {
              part: clipText(input.currentClaimText, 180),
              reason: "No search-capable verification provider is configured, so Penny cannot ground this claim in external sources.",
              neededEvidence: "Run Verify with citation search enabled or attach reliable sources that directly test the claim.",
            },
          ],
          confidenceDeltaSuggestion: 0,
          whatWouldChangeThis: "Run Verify with citation search enabled or attach reliable sources that directly test the claim.",
          nextQuestion: `What source would directly test "${clipText(input.currentClaimText, 120)}"?`,
          recipe: defaultVerifyRecipe({
            input,
            output: {
              verdict: "not_enough_evidence",
              confidenceDeltaSuggestion: 0,
            },
            evidenceCards: [],
            searchDecision: verifyWebSearchDecision(input),
          }),
        },
        sources: [],
      };
    },
  };
}

export function createXaiVerifyProvider(
  env: Record<string, string | undefined> = process.env,
  options: { generateText?: VerifyGenerateText } = {},
): VerifyProvider {
  return {
    name: "xai",
    searchEnabled: true,
    async generate(input) {
      const apiKey = env.XAI_API_KEY?.trim();

      if (!apiKey) {
        throw new VerifyProviderError("XAI_API_KEY is required for the xAI Verify provider.");
      }

      const xai = createXai(createXaiSettings(apiKey, env));
      const callGenerateText = options.generateText ?? generateStructuredVerify;
      const webSearchTool =
        typeof xai.tools.webSearch === "function"
          ? xai.tools.webSearch({ enableImageUnderstanding: false })
          : null;
      const searchDecision = verifyWebSearchDecision(input);

      try {
        const request: Parameters<VerifyGenerateText>[0] = {
          model: xai.responses(resolveXaiVerifyModel(env)),
          system: buildVerifySystemPrompt(),
          prompt: buildVerifyPrompt(input),
          output: verifyOutputSpec,
          maxRetries: 1,
          providerOptions: {
            xai: {
              store: false,
            },
          },
        };

        if (webSearchTool && searchDecision.useWebSearch) {
          request.tools = { web_search: webSearchTool };
        }

        return await callGenerateText(request);
      } catch (error) {
        if (error instanceof VerifyProviderError) {
          throw error;
        }

        throw new VerifyProviderError(`xAI Verify request failed: ${formatErrorMessage(error)}`);
      }
    },
  };
}

export function resolveXaiVerifyModel(env: Record<string, string | undefined> = process.env): string {
  return env.XAI_VERIFY_MODEL?.trim() || env.XAI_MODEL?.trim() || defaultXaiVerifyModel;
}

export function buildVerifySystemPrompt(): string {
  return [
    "You are Penny Check, a verification mode inside Brain.",
    "Verify the target claim with source-grounded evidence cards and action-ready confidence guidance.",
    "Use the available web_search tool when the prompt says search is needed. Cite only retrieved or provided sources.",
    "Follow the recipe order: decompose claim, search/gather, evaluate evidence, synthesize verdict, suggest confidence change.",
    "Do not change confidence, rewrite claims, create graph edges, or invent citations.",
    "Return only the structured Verify object.",
  ].join("\n");
}

export function buildVerifyPrompt(input: VerifyGenerationInput): string {
  const searchDecision = verifyWebSearchDecision(input);

  return [
    "Check this stable Penny claim against external evidence.",
    "",
    "Return:",
    "- verdict: supported, weakened, mixed, or not_enough_evidence.",
    "- summary: the shortest useful evidence-grounded reading.",
    "- evidenceCards: 1 to 6 cards with title, summary, stance, sourceName, sourceUrl, and citation when available.",
    "- citations: source/citation rows derived from retrieved or provided sources.",
    "- unsupportedParts: specific parts of the claim that evidence does not yet support.",
    "- confidenceDeltaSuggestion: an integer from -30 to 30. This is only a suggestion.",
    "- whatWouldChangeThis: what evidence would alter the verdict.",
    "- nextQuestion: the next focused verification question.",
    "- recipe.steps: exactly five steps in this order: decompose_claim, search_gather, evaluate_evidence, synthesize_verdict, suggest_confidence_change.",
    "",
    "Lens rules:",
    "- Use shapes only to choose what evidence to look for and what follow-up question to ask.",
    "- Do not let shapes bias the verdict; evidence must drive support, weakening, or uncertainty.",
    "- Candidate shapes are tentative and must not be stated as facts about the user.",
    "",
    "Search decision:",
    `- useWebSearch: ${searchDecision.useWebSearch}`,
    `- reason: ${searchDecision.reason}`,
    `- signals: ${searchDecision.signals.join(", ") || "none"}`,
    "- If useWebSearch is false, rely only on provided context and mark unsupported external parts clearly.",
    "",
    `Session id: ${input.sessionId}`,
    `Claim id: ${input.claimId}`,
    `Current claim kind: ${input.currentClaimKind}`,
    `Current claim status: ${input.currentClaimStatus}`,
    `Current claim confidence: ${input.currentClaimConfidence}`,
    `Current claim text: ${input.currentClaimText}`,
    `Lens snapshot JSON: ${formatLensSnapshot(input.lensSnapshot)}`,
  ].join("\n");
}

async function createVerifyPrelude(
  db: PennyDatabase,
  input: VerifyRequest,
  provider: VerifyProvider,
): Promise<VerifyPrelude> {
  return db.transaction(async (tx) => {
    const target = await loadClaimWithCurrentVersion(tx, input.claimId, input.sessionId);
    const lensSnapshot = await loadLensSnapshot(tx, input.sessionId);
    const generationInput = verifyGenerationInput(target, input, lensSnapshot);
    const searchDecision = verifyWebSearchDecision(generationInput);

    if (normalizeClaimText(target.version.content) !== normalizeClaimText(input.currentClaimText)) {
      throw new VerifyConflictError("Verify requires the current ClaimVersion text.");
    }

    const [brainRun] = await tx
      .insert(brainRuns)
      .values({
        ...scopeValues(target.claim),
        sessionId: input.sessionId,
        sourceId: target.claim.sourceId,
        operation: "verify_run",
        provider: provider.name,
        model: provider.name === "xai" ? resolveXaiVerifyModel() : null,
        status: "running",
        input: {
          claimId: target.claim.id,
          claimVersionId: target.version.id,
          sessionId: input.sessionId,
          currentClaimText: input.currentClaimText,
          currentClaimKind: target.claim.kind,
          currentClaimStatus: target.version.status,
          currentClaimConfidence: target.version.confidence,
          searchEnabled: provider.searchEnabled,
          searchDecision,
          recipe: defaultVerifyRecipe({
            input: generationInput,
            output: {
              verdict: "not_enough_evidence",
              confidenceDeltaSuggestion: 0,
            },
            evidenceCards: [],
            searchDecision,
          }),
          lensSnapshot,
        },
      })
      .returning();

    if (!brainRun) {
      throw new VerifyConflictError("Failed to record Verify BrainRun.");
    }

    return { target, brainRun, lensSnapshot };
  });
}

async function persistVerifyResult(
  db: PennyDatabase,
  output: VerifyOutput,
  prelude: VerifyPrelude,
): Promise<PersistedVerify> {
  return db.transaction(async (tx) => {
    const citationSources = await insertCitationSources(tx, prelude.target, output.evidenceCards);
    const confidenceUpdate = confidenceUpdateDecision(output);
    const persistedOutput = {
      ...output,
      citationSources,
      confidenceUpdate,
    };
    const move = await createMove(tx, "verify_run", {
      sessionId: prelude.target.claim.sessionId,
      scope: prelude.target.claim,
      summary: verifyMoveSummary(output),
      payload: {
        claimIds: [prelude.target.claim.id],
        edgeIds: [],
        claimId: prelude.target.claim.id,
        claimVersionId: prelude.target.version.id,
        brainRunId: prelude.brainRun.id,
        verdict: output.verdict,
        confidenceDeltaSuggestion: output.confidenceDeltaSuggestion,
        confidenceDecision: confidenceUpdate.decision,
        autoAppliedConfidence: confidenceUpdate.autoApplied,
        sourceIds: citationSources.map((citation) => citation.source.id),
        sourceSpanIds: citationSources.map((citation) => citation.sourceSpan.id),
      },
    });

    const [completedBrainRun] = await tx
      .update(brainRuns)
      .set({
        status: "succeeded",
        output: persistedOutput,
        error: null,
        completedAt: new Date(),
      })
      .where(eq(brainRuns.id, prelude.brainRun.id))
      .returning();

    if (!completedBrainRun) {
      throw new VerifyConflictError("Failed to complete Verify BrainRun.");
    }

    await afterMoveEffectsInTransaction(tx, { sessionId: prelude.target.claim.sessionId, moveId: move.id });

    return {
      ...persistedOutput,
      targetClaim: claimSlice(prelude.target.claim, prelude.target.version),
      move: moveSlice(move, prelude.target.claim.id),
      brainRun: {
        id: completedBrainRun.id,
        status: completedBrainRun.status,
      },
    };
  });
}

async function insertCitationSources(
  db: PennyDatabase,
  target: Awaited<ReturnType<typeof loadClaimWithCurrentVersion>>,
  evidenceCards: EvidenceCard[],
): Promise<PersistedCitationSlice[]> {
  const citations = [];

  for (const card of evidenceCards.filter(hasCitationProvenance)) {
    const rawText = citationRawText(card);
    const [source] = await db
      .insert(sources)
      .values({
        ...scopeValues(target.claim),
        sessionId: target.claim.sessionId,
        kind: "verification_citation",
        rawText,
      })
      .returning();

    if (!source) {
      throw new VerifyConflictError("Failed to record verification citation source.");
    }

    const [span] = await db
      .insert(sourceSpans)
      .values({
        sourceId: source.id,
        claimId: target.claim.id,
        claimVersionId: target.version.id,
        startOffset: 0,
        endOffset: rawText.length,
        label: "verify_evidence",
      })
      .returning();

    if (!span) {
      throw new VerifyConflictError("Failed to record verification citation span.");
    }

    citations.push({
      evidenceTitle: card.title,
      source: {
        id: source.id,
        kind: "verification_citation" as const,
        rawText: source.rawText,
      },
      sourceSpan: {
        id: span.id,
        sourceId: span.sourceId,
        claimId: span.claimId,
        claimVersionId: span.claimVersionId,
        label: span.label,
      },
    });
  }

  return citations;
}

async function loadClaimWithCurrentVersion(db: PennyDatabase, claimId: string, sessionId: string) {
  const [claim] = await db
    .select()
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.sessionId, sessionId)))
    .limit(1);

  if (!claim) {
    throw new VerifyNotFoundError("Claim was not found in this session.");
  }

  const [version] = await db
    .select()
    .from(claimVersions)
    .where(and(eq(claimVersions.claimId, claim.id), eq(claimVersions.isCurrent, true)))
    .orderBy(desc(claimVersions.createdAt))
    .limit(1);

  if (!version) {
    throw new VerifyConflictError("Claim has no current ClaimVersion.");
  }

  return { claim, version };
}

async function assertPendingConfidenceDecision(
  db: VerifyTransaction,
  sessionId: string,
  verifyMoveId: string,
): Promise<void> {
  const sessionMoves = await db.select().from(moves).where(eq(moves.sessionId, sessionId));
  const existingDecision = sessionMoves.find((move) => confidenceDecisionMoveTargets(move, verifyMoveId));

  if (existingDecision) {
    throw new VerifyConflictError("Verify confidence suggestion has already been accepted or rejected.");
  }
}

export function buildConfidenceCascadePlan(input: {
  changedClaimId: string;
  delta: number;
  edges: ConfidenceCascadeEdge[];
  policy?: Partial<ConfidenceCascadePolicy>;
}): ConfidenceCascadePlanStep[] {
  if (input.delta === 0) {
    return [];
  }

  const maxDepth = Math.max(0, Math.floor(input.policy?.maxDepth ?? verifyConfidenceCascadePolicy.maxDepth));
  const maxClaims = Math.max(0, Math.floor(input.policy?.maxClaims ?? verifyConfidenceCascadePolicy.maxClaims));

  if (maxDepth === 0 || maxClaims === 0) {
    return [];
  }

  const dependentsByDependency = new Map<string, ConfidenceCascadeEdge[]>();

  for (const edge of [...input.edges].sort(edgeOrder)) {
    if (edge.kind !== "depends_on" || edge.status !== "active") {
      continue;
    }

    const existing = dependentsByDependency.get(edge.toClaimId) ?? [];
    existing.push(edge);
    dependentsByDependency.set(edge.toClaimId, existing);
  }

  const queue: Array<{ claimId: string; depth: number }> = [{ claimId: input.changedClaimId, depth: 0 }];
  const visited = new Set<string>([input.changedClaimId]);
  const plan: ConfidenceCascadePlanStep[] = [];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    if (!current) {
      continue;
    }

    if (current.depth >= maxDepth) {
      continue;
    }

    const dependentEdges = dependentsByDependency.get(current.claimId) ?? [];

    for (const edge of dependentEdges) {
      if (plan.length >= maxClaims) {
        return plan;
      }

      if (visited.has(edge.fromClaimId)) {
        continue;
      }

      const depth = current.depth + 1;
      const appliedDelta = propagatedConfidenceDelta(input.delta, depth);

      visited.add(edge.fromClaimId);

      if (appliedDelta === 0) {
        continue;
      }

      plan.push({
        claimId: edge.fromClaimId,
        viaEdgeId: edge.id,
        depth,
        appliedDelta,
      });
      queue.push({ claimId: edge.fromClaimId, depth });
    }
  }

  return plan;
}

function edgeOrder(left: ConfidenceCascadeEdge, right: ConfidenceCascadeEdge): number {
  return left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id);
}

function propagatedConfidenceDelta(delta: number, depth: number): number {
  const magnitude = Math.round(Math.abs(delta) / 2 ** depth);

  return delta < 0 ? -magnitude : magnitude;
}

function confidenceMutation(target: Awaited<ReturnType<typeof loadClaimWithCurrentVersion>>, delta: number) {
  const currentConfidence = boundedConfidence(target.version.confidence + delta);
  const appliedDelta = currentConfidence - target.version.confidence;

  return {
    claim: target.claim,
    previousVersion: target.version,
    previousVersionId: target.version.id,
    currentVersionId: appliedDelta === 0 ? target.version.id : randomUUID(),
    previousConfidence: target.version.confidence,
    currentConfidence,
    appliedDelta,
  };
}

function cascadeApplied(
  mutation: ReturnType<typeof confidenceMutation> & { viaEdgeId: string; depth: number },
): ConfidenceCascadeApplied {
  return {
    claimId: mutation.claim.id,
    viaEdgeId: mutation.viaEdgeId,
    depth: mutation.depth,
    previousVersionId: mutation.previousVersionId,
    currentVersionId: mutation.currentVersionId,
    previousConfidence: mutation.previousConfidence,
    currentConfidence: mutation.currentConfidence,
    appliedDelta: mutation.appliedDelta,
  };
}

async function applyConfidenceMutation(
  db: VerifyTransaction,
  mutation: ReturnType<typeof confidenceMutation>,
  moveId: string,
): Promise<typeof claimVersions.$inferSelect> {
  if (mutation.appliedDelta === 0) {
    return mutation.previousVersion;
  }

  const validFrom = new Date();

  await db
    .update(claimVersions)
    .set({
      isCurrent: false,
      validUntil: validFrom,
      supersededByVersionId: mutation.currentVersionId,
    })
    .where(and(eq(claimVersions.claimId, mutation.claim.id), eq(claimVersions.isCurrent, true)));

  const [version] = await db
    .insert(claimVersions)
    .values({
      id: mutation.currentVersionId,
      claimId: mutation.claim.id,
      sourceId: mutation.previousVersion.sourceId ?? mutation.claim.sourceId,
      brainRunId: mutation.previousVersion.brainRunId,
      moveId,
      content: mutation.previousVersion.content,
      status: mutation.previousVersion.status,
      confidence: mutation.currentConfidence,
      isCurrent: true,
      validFrom,
    })
    .returning();

  if (!version) {
    throw new VerifyConflictError("Failed to apply confidence update.");
  }

  return version;
}

async function copyVerifyEvidenceSpansToCurrentVersion(
  db: VerifyTransaction,
  sourceSpanIds: string[],
  claimId: string,
  claimVersionId: string,
): Promise<void> {
  const uniqueSourceSpanIds = uniqueStrings(sourceSpanIds);

  if (uniqueSourceSpanIds.length === 0) {
    return;
  }

  const spans = await db.select().from(sourceSpans).where(inArray(sourceSpans.id, uniqueSourceSpanIds));

  if (spans.length !== uniqueSourceSpanIds.length) {
    throw new VerifyConflictError("Verify evidence source span was not found.");
  }

  for (const span of spans) {
    if (span.claimId !== claimId) {
      throw new VerifyConflictError("Verify evidence source span does not belong to the target claim.");
    }

    if (span.claimVersionId === claimVersionId) {
      continue;
    }

    const [copiedSpan] = await db
      .insert(sourceSpans)
      .values({
        sourceId: span.sourceId,
        claimId,
        claimVersionId,
        startOffset: span.startOffset,
        endOffset: span.endOffset,
        label: "verify_confidence_evidence",
      })
      .returning();

    if (!copiedSpan) {
      throw new VerifyConflictError("Failed to connect Verify evidence to the current ClaimVersion.");
    }
  }
}

function confidenceDecisionMoveTargets(move: typeof moves.$inferSelect, verifyMoveId: string): boolean {
  if (!["confidence_update_accepted", "confidence_update_rejected"].includes(move.kind)) {
    return false;
  }

  return objectRecord(move.payload).verifyMoveId === verifyMoveId;
}

function sameScope(left: ScopedRecord, right: ScopedRecord): boolean {
  return (
    left.userId === right.userId &&
    left.workspaceId === right.workspaceId &&
    left.projectId === right.projectId &&
    left.sphereId === right.sphereId
  );
}

function assertSameScope(left: ScopedRecord, right: ScopedRecord, message: string): void {
  if (!sameScope(left, right)) {
    throw new VerifyConflictError(message);
  }
}

async function markVerifyRunFailed(db: PennyDatabase, brainRunId: string, error: unknown): Promise<void> {
  await db
    .update(brainRuns)
    .set({
      status: "failed",
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: formatErrorMessage(error),
      },
      completedAt: new Date(),
    })
    .where(eq(brainRuns.id, brainRunId));
}

async function generateStructuredVerify(
  request: Parameters<VerifyGenerateText>[0],
): Promise<{ output: unknown; sources?: unknown[] }> {
  const result = await generateText(request as Parameters<typeof generateText>[0]);

  return {
    output: result.output,
    sources: result.sources,
  };
}

function verifyGenerationInput(
  target: Awaited<ReturnType<typeof loadClaimWithCurrentVersion>>,
  input: VerifyRequest,
  lensSnapshot: LensSnapshot,
): VerifyGenerationInput {
  return {
    claimId: target.claim.id,
    sessionId: input.sessionId,
    currentClaimText: target.version.content,
    currentClaimKind: target.claim.kind,
    currentClaimStatus: target.version.status,
    currentClaimConfidence: target.version.confidence,
    lensSnapshot,
  };
}

export function verifyWebSearchDecision(input?: VerifyGenerationInput): VerifyWebSearchDecision {
  if (!input) {
    return {
      useWebSearch: true,
      reason: "No generation context was provided, so Verify defaults to source search for grounding.",
      signals: ["verify_default_source_grounding"],
    };
  }

  const haystack = input.currentClaimText.toLowerCase();
  const signals: string[] = [];

  if (/[$%]|\b\d+(?:\.\d+)?\s*(?:percent|%|k|m|million|billion|users|customers|founders|months|days|weeks|dollars|usd)\b/.test(haystack)) {
    signals.push("quantitative_claim");
  }

  if (/\b(study|research|source|citation|evidence|survey|benchmark|according to|reported|data)\b/.test(haystack)) {
    signals.push("explicit_evidence_claim");
  }

  if (/\b(founder|customer|market|adoption|retention|conversion|revenue|sales|pricing|pay|users|companies)\b/.test(haystack)) {
    signals.push("market_or_customer_claim");
  }

  if (/\b(cognitive load|learning science|memory|attention|science|clinical|legal|tax|finance|security|regulation)\b/.test(haystack)) {
    signals.push("domain_factual_claim");
  }

  if (input.currentClaimKind === "belief" || input.currentClaimKind === "assumption") {
    signals.push("claim_kind_needs_grounding");
  }

  const personalOnly =
    /\b(i|my|we|our)\b/.test(haystack) &&
    !signals.some((signal) => signal !== "claim_kind_needs_grounding") &&
    !/\b(users|customers|market|study|data|percent|revenue|pay)\b/.test(haystack);

  if (personalOnly) {
    return {
      useWebSearch: false,
      reason: "The claim appears to be about local intent or preference rather than an external factual assertion.",
      signals: ["personal_or_local_claim"],
    };
  }

  return {
    useWebSearch: signals.length > 0,
    reason:
      signals.length > 0
        ? "The claim needs source grounding before Penny treats the verdict as stable."
        : "No external factual signal was detected, so Verify can proceed from local context and mark any gaps.",
    signals: uniqueStrings(signals),
  };
}

function normalizeEvidenceCards(cards: VerifyProviderOutput["evidenceCards"], providerSources: unknown[]): EvidenceCard[] {
  const normalizedCards = cards.map(normalizeEvidenceCard).filter((card): card is EvidenceCard => Boolean(card));

  if (normalizedCards.length > 0) {
    return normalizedCards.slice(0, 6);
  }

  return providerSources.map(sourceToEvidenceCard).filter((card): card is EvidenceCard => Boolean(card)).slice(0, 6);
}

function normalizeEvidenceCard(card: VerifyProviderOutput["evidenceCards"][number]): EvidenceCard | null {
  const parsed = EvidenceCardSchema.safeParse({
    ...card,
    title: card.title.trim(),
    summary: card.summary.trim(),
    sourceName: trimmedNullable(card.sourceName),
    sourceUrl: trimmedNullable(card.sourceUrl),
    citation: trimmedNullable(card.citation),
  });

  return parsed.success ? parsed.data : null;
}

function sourceToEvidenceCard(source: unknown): EvidenceCard | null {
  const record = objectRecord(source);
  const url =
    stringRecordValue(record, "url") ??
    stringRecordValue(record, "sourceUrl") ??
    stringRecordValue(record, "uri");

  if (!url) {
    return null;
  }

  const title = stringRecordValue(record, "title") ?? stringRecordValue(record, "name") ?? url;
  const snippet = stringRecordValue(record, "snippet") ?? stringRecordValue(record, "description") ?? title;
  const parsed = EvidenceCardSchema.safeParse({
    title,
    summary: clipText(snippet, 680),
    stance: "unclear",
    sourceName: title,
    sourceUrl: url,
    citation: clipText(snippet, 680),
  });

  return parsed.success ? parsed.data : null;
}

function normalizeVerifyCitations(
  citations: VerifyProviderOutput["citations"],
  evidenceCards: EvidenceCard[],
  providerSources: unknown[],
): VerifyCitation[] {
  const normalized = [
    ...(citations ?? []).map(normalizeVerifyCitation).filter((citation): citation is VerifyCitation => Boolean(citation)),
    ...evidenceCards.filter(hasCitationProvenance).map(evidenceCardToCitation),
    ...providerSources.map(sourceToVerifyCitation).filter((citation): citation is VerifyCitation => Boolean(citation)),
  ];
  const unique: VerifyCitation[] = [];
  const seen = new Set<string>();

  for (const citation of normalized) {
    const key = `${citation.sourceUrl ?? ""}|${citation.sourceName ?? ""}|${citation.title}|${citation.citation ?? ""}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(citation);
  }

  return unique.slice(0, 8);
}

function normalizeVerifyCitation(citation: NonNullable<VerifyProviderOutput["citations"]>[number]): VerifyCitation | null {
  const parsed = VerifyCitationSchema.safeParse({
    ...citation,
    title: citation.title.trim(),
    sourceName: trimmedNullable(citation.sourceName),
    sourceUrl: trimmedNullable(citation.sourceUrl),
    citation: trimmedNullable(citation.citation),
  });

  return parsed.success ? parsed.data : null;
}

function evidenceCardToCitation(card: EvidenceCard): VerifyCitation {
  return {
    title: card.title,
    sourceName: card.sourceName ?? null,
    sourceUrl: card.sourceUrl ?? null,
    citation: card.citation ?? card.summary,
  };
}

function sourceToVerifyCitation(source: unknown): VerifyCitation | null {
  const card = sourceToEvidenceCard(source);

  return card ? evidenceCardToCitation(card) : null;
}

function normalizeUnsupportedParts(
  parts: VerifyProviderOutput["unsupportedParts"],
  verdict: VerifyProviderOutput["verdict"],
  input?: VerifyGenerationInput,
): UnsupportedPart[] {
  const normalized = (parts ?? []).map(normalizeUnsupportedPart).filter((part): part is UnsupportedPart => Boolean(part));

  if (normalized.length > 0) {
    return normalized.slice(0, 8);
  }

  if (verdict === "supported") {
    return [];
  }

  const claimText = clipText(input?.currentClaimText ?? "The target claim", 260);
  const fallback =
    verdict === "not_enough_evidence"
      ? {
          part: claimText,
          reason: "Penny did not find enough source-grounded evidence to verify this part.",
          neededEvidence: "A reliable source or direct observation that specifically tests the claim.",
        }
      : {
          part: "The portion of the claim not directly covered by the evidence.",
          reason: "The available evidence is mixed or only addresses part of the claim.",
          neededEvidence: "More direct evidence that separates the supported and weakened parts of the claim.",
        };

  return [fallback];
}

function normalizeUnsupportedPart(part: NonNullable<VerifyProviderOutput["unsupportedParts"]>[number]): UnsupportedPart | null {
  const parsed = UnsupportedPartSchema.safeParse({
    ...part,
    part: part.part.trim(),
    reason: part.reason.trim(),
    neededEvidence: trimmedNullable(part.neededEvidence),
  });

  return parsed.success ? parsed.data : null;
}

function normalizeVerifyRecipe(
  recipe: VerifyProviderOutput["recipe"],
  context: {
    input: VerifyGenerationInput | undefined;
    output: Pick<VerifyProviderOutput, "verdict" | "confidenceDeltaSuggestion">;
    evidenceCards: EvidenceCard[];
    searchDecision: VerifyWebSearchDecision;
  },
): VerifyRecipe {
  const parsed = VerifyRecipeSchema.safeParse(recipe);

  if (parsed.success) {
    return parsed.data;
  }

  return defaultVerifyRecipe(context);
}

function defaultVerifyRecipe(context: {
  input: VerifyGenerationInput | undefined;
  output: Pick<VerifyProviderOutput, "verdict" | "confidenceDeltaSuggestion">;
  evidenceCards: ReadonlyArray<EvidenceCard>;
  searchDecision: VerifyWebSearchDecision;
}): VerifyRecipe {
  const claimText = clipText(context.input?.currentClaimText ?? "target claim", 140);
  const sourceCount = context.evidenceCards.filter(hasCitationProvenance).length;
  const searchStatus = context.searchDecision.useWebSearch ? "completed" : "limited";

  return {
    steps: [
      {
        step: "decompose_claim",
        title: "Decompose claim",
        status: "completed",
        summary: "Separated the target claim into the assertion to test and the evidence needed to support it.",
        inputs: [claimText],
        outputs: ["Target assertion", "Evidence need"],
      },
      {
        step: "search_gather",
        title: "Search and gather",
        status: searchStatus,
        summary: context.searchDecision.useWebSearch
          ? "Used available source search or provider citations to gather evidence."
          : "Search was not required or not available; Penny marked the source gap explicitly.",
        inputs: [...context.searchDecision.signals],
        outputs: [`${sourceCount} citation-backed evidence card${sourceCount === 1 ? "" : "s"}`],
      },
      {
        step: "evaluate_evidence",
        title: "Evaluate evidence",
        status: context.evidenceCards.length > 0 ? "completed" : "limited",
        summary: "Compared each evidence card against the exact claim and assigned a stance.",
        inputs: context.evidenceCards.map((card) => card.title).slice(0, 6),
        outputs: context.evidenceCards.map((card) => card.stance),
      },
      {
        step: "synthesize_verdict",
        title: "Synthesize verdict",
        status: "completed",
        summary: `Combined the evidence stances into a ${context.output.verdict} verdict.`,
        inputs: context.evidenceCards.map((card) => card.stance),
        outputs: [context.output.verdict],
      },
      {
        step: "suggest_confidence_change",
        title: "Suggest confidence change",
        status: "completed",
        summary: `Suggested a ${context.output.confidenceDeltaSuggestion} point confidence delta for user review.`,
        inputs: [context.output.verdict],
        outputs: [`delta ${context.output.confidenceDeltaSuggestion}`],
      },
    ],
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringRecordValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boundedConfidence(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function claimSlice(
  claim: typeof claims.$inferSelect,
  version: typeof claimVersions.$inferSelect,
): PersistedClaimSlice {
  return {
    id: claim.id,
    versionId: version.id,
    kind: claim.kind,
    status: version.status,
    text: version.content,
    confidence: version.confidence,
  };
}

function moveSlice(move: typeof moves.$inferSelect, claimId: string): PersistedMoveSlice {
  return {
    id: move.id,
    kind: "verify_run",
    summary: move.summary,
    claimIds: [claimId],
    edgeIds: [],
    artifactIds: [],
  };
}

function confidenceDecisionMoveSlice(
  move: typeof moves.$inferSelect,
  claimIds: string[],
  edgeIds: string[],
): PersistedConfidenceDecisionMoveSlice {
  return {
    id: move.id,
    kind: move.kind as PersistedConfidenceDecisionMoveSlice["kind"],
    summary: move.summary,
    claimIds,
    edgeIds,
    artifactIds: [],
  };
}

function verifyMoveSummary(output: VerifyOutput): string {
  const cardLabel = output.evidenceCards.length === 1 ? "1 evidence card" : `${output.evidenceCards.length} evidence cards`;

  return `Verified claim as ${output.verdict} with ${cardLabel}.`;
}

function acceptedConfidenceSummary(appliedDelta: number, cascadeCount: number): string {
  const direction = appliedDelta > 0 ? "raised" : appliedDelta < 0 ? "lowered" : "kept";
  const cascadeSummary =
    cascadeCount === 0
      ? "without dependent confidence changes"
      : `and cascaded to ${cascadeCount} dependent claim${cascadeCount === 1 ? "" : "s"}`;

  return `Accepted Verify confidence suggestion, ${direction} target confidence ${cascadeSummary}.`;
}

function confidenceUpdateDecision(output: VerifyOutput): ConfidenceUpdateDecision {
  return {
    suggestedDelta: output.confidenceDeltaSuggestion,
    autoApplied: false,
    decision: "pending_user_decision",
  };
}

function hasCitationProvenance(card: EvidenceCard): boolean {
  return Boolean(card.citation || card.sourceUrl || card.sourceName);
}

function citationRawText(card: EvidenceCard): string {
  return [
    `Title: ${card.title}`,
    card.sourceName ? `Source: ${card.sourceName}` : null,
    card.sourceUrl ? `URL: ${card.sourceUrl}` : null,
    `Stance: ${card.stance}`,
    card.citation ? `Citation: ${card.citation}` : null,
    `Summary: ${card.summary}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function createXaiSettings(apiKey: string, env: Record<string, string | undefined>) {
  const baseURL = env.XAI_BASE_URL?.trim();

  if (!baseURL) {
    return { apiKey };
  }

  return { apiKey, baseURL };
}

async function parseJsonRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<{ ok: true; data: z.infer<Schema> } | { ok: false; response: Response }> {
  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "invalid_json",
            message: bodyResult.message,
          },
        },
        400,
      ),
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
            message: "Verify request is invalid.",
            issues: flattenIssues(parsed.error),
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
    return { ok: false, message: "Request body must be JSON." };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }
}

function resolveVerifyDb(options: VerifyRouteOptions, hasInjectedVerifyClaim: boolean): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedVerifyClaim) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function resolveVerifyConfidenceDb(
  options: VerifyConfidenceRouteOptions,
  hasInjectedDecision: boolean,
): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedDecision) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireVerifyDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for POST /brain/verify.");
  }

  return db;
}

function requireVerifyConfidenceDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for POST /brain/verify/confidence.");
  }

  return db;
}

function dbOption(db: PennyDatabase | undefined): { db?: PennyDatabase } {
  return db ? { db } : {};
}

function methodNotAllowed(message: string): Response {
  return jsonResponse(
    {
      error: {
        code: "method_not_allowed",
        message,
      },
    },
    405,
    { Allow: "POST" },
  );
}

function verifyErrorResponse(error: unknown): Response {
  if (error instanceof VerifyNotFoundError) {
    return jsonResponse(
      {
        error: {
          code: "verify_not_found",
          message: error.message,
        },
      },
      404,
    );
  }

  if (error instanceof VerifyConflictError) {
    return jsonResponse(
      {
        error: {
          code: "verify_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  if (error instanceof VerifyProviderError) {
    return jsonResponse(
      {
        error: {
          code: "verify_provider_failed",
          message: error.message,
        },
      },
      502,
    );
  }

  if (error instanceof VerifyGenerationError) {
    return jsonResponse(
      {
        error: {
          code: "invalid_verify_output",
          message: error.message,
          issues: error.issues,
        },
      },
      502,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "verify_failed",
        message: formatErrorMessage(error),
      },
    },
    500,
  );
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

function trimmedNullable(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function normalizeClaimText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}

function clipText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value;
}
