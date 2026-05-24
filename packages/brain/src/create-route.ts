import { createHash } from "node:crypto";
import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { resolveDefaultBrainRankerRecorder, type BrainRankerRecorder, type RecordBrainDevelopmentEventInput } from "./brain-ranker-persistence.ts";
import { rankBrainForCreate, type BrainGroundingLabel, type BrainRankedCandidate, type BrainRankerResult, type NextBestMove } from "./brain-ranker.ts";
import { retrieveBrainMemoryForCreate } from "./brain-memory-route.ts";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { createExportFeedback as createExportFeedbackTable } from "./db/schema.ts";
import { emitPennyLog } from "./observability.ts";
import { scopeValues, type BrainScope } from "./scope.ts";

export type CreateLens = "Personal" | "Practical" | "Valuable" | "Critical" | "Weird";
export type CreateCheckStatus = "pass" | "warn" | "fail";
export type CreateProviderMode = "deterministic" | "model_backed" | "deterministic_fallback";
export type CreateSchemaValidationStatus = "not_run" | "success" | "failure";
export type CreateExportFeedbackRating = "useful" | "not_useful";
export type CreateExportFeedbackReason =
  | "strong_output"
  | "too_generic"
  | "too_complex"
  | "not_personal_enough"
  | "wrong_memory"
  | "missing_constraints"
  | "ready_to_ship";

export type MemoryRef = {
  id: string;
  label: string;
  kind: "brain" | "session" | "preference" | "context";
  summary: string;
};

export type SourceRef = {
  id: string;
  label: string;
  kind: "rough_idea" | "session" | "source" | "user_comment";
  excerpt: string;
  url?: string | null | undefined;
  sourceRange?: string | null | undefined;
};

export type CandidateOption = {
  id: string;
  lens: CreateLens;
  title: string;
  oneLine: string;
  rationale: string;
  nextMove: string;
  topReason: string;
  grounding: BrainGroundingLabel;
  contextLabel: string;
  memoryCount: number;
  sourceCount: number;
  rankReasons: string[];
  uncertainty: string[];
  risks: string[];
  memoryUsed: MemoryRef[];
  sourcesUsed: SourceRef[];
  scores: {
    intentMatch: number;
    buildability: number;
    value: number;
    novelty: number;
    risk: number;
  };
};

export type PromptExportQualitySignals = {
  hasRoughIdea: boolean;
  hasSelectedOptionHistory: boolean;
  hasRelevantPersonalContext: boolean;
  hasRepeatedRejectedDirections: boolean;
  hasProductGoal: boolean;
  hasNonGoals: boolean;
  hasUxRequirements: boolean;
  hasFrontendRequirements: boolean;
  hasBackendRequirements: boolean;
  hasDataModel: boolean;
  hasPrivacyConstraints: boolean;
  hasVerificationRequirements: boolean;
  hasImplementationSequence: boolean;
  hasAcceptanceTests: boolean;
  hasDoNotBreakList: boolean;
  promptCompletenessScore: number;
  missing: string[];
};

export type CreateObservability = {
  providerMode: CreateProviderMode;
  providerName: "deterministic" | CreateOptionProvider["name"];
  schemaValidation: CreateSchemaValidationStatus;
  schemaValidationErrors: string[];
  fallbackReason: string | null;
  memoryCountUsed: number;
  sourceCountUsed: number;
  rejectedDirectionsUsed: string[];
  generatedLenses: CreateLens[];
  selectedOptionIds: string[];
  selectedLenses: CreateLens[];
  exportQualitySignals: PromptExportQualitySignals;
};

export type OptionSet = {
  id: string;
  projectId: string;
  sessionId: string;
  sourceOfTruth: "rough_idea_context_deterministic_create_lenses" | "rough_idea_context_model_backed_create_lenses";
  rawIdea: string;
  options: CandidateOption[];
  nextBestMove: NextBestMove;
  rankedCandidates: BrainRankedCandidate[];
  memoryUsed: MemoryRef[];
  sourcesUsed: SourceRef[];
  createdAt: string;
};

export type ArtifactSection = {
  id: string;
  title: ArtifactSectionTitle;
  body: string;
  status: "draft" | "updated" | "needs_input";
};

export type ArtifactDelta = {
  id: string;
  updatedSectionIds: string[];
  selectedOptionIds: string[];
  summary: string;
  createdAt: string;
};

export type CodingPromptArtifact = {
  id: string;
  projectId: string;
  sessionId: string;
  title: string;
  version: number;
  rawIdea: string;
  sections: ArtifactSection[];
  sourceOptionSetIds: string[];
  judgmentEventIds: string[];
  updatedAt: string;
};

export type JudgmentEvent = {
  id: string;
  projectId: string;
  sessionId: string;
  optionSetId: string;
  selectedOptionIds: string[];
  userComment: string;
  inferredSignals: string[];
  artifactDelta: ArtifactDelta;
  createdAt: string;
};

export type VerificationSummary = {
  id: string;
  artifactId: string;
  createdAt: string;
  verdict: "ready" | "needs_revision";
  scores: {
    intentMatch: number;
    personalMemoryGrounding: number;
    buildability: number;
    nonGenericness: number;
    userAutonomyPreserved: number;
    fakeClaimRisk: number;
    promptCompleteness: number;
  };
  checks: Array<{
    key:
      | "intent_match"
      | "personal_memory_grounding"
      | "buildability"
      | "non_genericness"
      | "user_autonomy_preserved"
      | "fake_claim_risk"
      | "prompt_completeness";
    label: string;
    status: CreateCheckStatus;
    score: number;
    summary: string;
  }>;
  missingInfo: string[];
  risks: string[];
};

export type PromptExport = {
  id: string;
  artifactId: string;
  format: "coding_agent_prompt";
  targets: Array<"Codex" | "Claude Code" | "Cursor">;
  text: string;
  fileName: string;
  qualitySignals: PromptExportQualitySignals;
  createdAt: string;
};

export type CreateExportFeedback = {
  sourceOfTruth: "create_export_feedback";
  id: string;
  projectId: string;
  sessionId: string;
  artifactId: string;
  exportId: string;
  rating: CreateExportFeedbackRating;
  reasons: CreateExportFeedbackReason[];
  comment: string | null;
  promptCompletenessScore: number | null;
  createdAt: string;
};

export type CreateNextInput = z.infer<typeof CreateNextBodySchema>;
export type ExportCodingPromptInput = z.infer<typeof ExportCodingPromptBodySchema>;
export type CreateExportFeedbackInput = z.infer<typeof CreateExportFeedbackBodySchema>;

export type CreateNextResult = {
  sourceOfTruth: "create_options_judgments_artifacts_verification";
  optionSet: OptionSet;
  artifact: CodingPromptArtifact;
  verification: VerificationSummary;
  judgmentEvent: JudgmentEvent | null;
  observability: CreateObservability;
  exportReady: boolean;
};

export type CreateRouteService = {
  next(input: CreateNextInput, request: Request): Promise<CreateNextResult>;
  compare(input: CreateNextInput, request: Request): Promise<CreateProviderComparisonResult>;
  exportCodingPrompt(input: ExportCodingPromptInput, request: Request): Promise<{ export: PromptExport }>;
};

export type CreateExportFeedbackService = {
  submit(input: CreateExportFeedbackInput, request: Request): Promise<{ feedback: CreateExportFeedback }>;
};

export type CreateProviderComparisonArm = {
  label: "deterministic" | "model_backed";
  providerUsed: CreateProviderMode;
  fallbackReason: string | null;
  optionSet: OptionSet;
  artifact: CodingPromptArtifact;
  verification: VerificationSummary;
  promptExport: PromptExport;
  observability: CreateObservability;
};

export type CreateProviderComparisonResult = {
  sourceOfTruth: "deterministic_model_backed_create_comparison";
  rawIdea: string;
  deterministic: CreateProviderComparisonArm;
  modelBacked: CreateProviderComparisonArm;
};

export type CreateRouteOptions = {
  service?: CreateRouteService;
  feedbackService?: CreateExportFeedbackService;
};

export type CreateOptionGenerationInput = {
  rawIdea: string;
  memoryUsed: MemoryRef[];
  sourcesUsed: SourceRef[];
  contextLight: boolean;
  nextBestMove: NextBestMove;
  rankedCandidates: BrainRankedCandidate[];
  baselineOptions: CandidateOption[];
};

export type CreateOptionProviderDraft = z.infer<typeof CreateOptionProviderDraftSchema>;
export type CreateOptionProviderOutput = z.infer<typeof CreateOptionProviderOutputSchema>;

export type CreateOptionProvider = {
  name: "xai" | "test" | "disabled";
  generateOptions(input: CreateOptionGenerationInput): Promise<unknown>;
};

export type CreateGenerateText = (request: {
  model: LanguageModel;
  system: string;
  prompt: string;
  output: typeof createOptionOutputSpec;
  maxRetries: number;
  providerOptions: {
    xai: {
      store: false;
    };
  };
}) => Promise<{ output: unknown }>;

export type XaiCreateOptionProviderOptions = {
  generateText?: CreateGenerateText;
};

export type CreateRouteServiceOptions = {
  optionProvider?: CreateOptionProvider | null;
  rankerRecorder?: BrainRankerRecorder | null;
};

type ArtifactSectionTitle = (typeof artifactSectionTitles)[number];

const artifactSectionTitles = [
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

const lensOrder: CreateLens[] = ["Personal", "Practical", "Valuable", "Critical", "Weird"];
export const defaultXaiCreateOptionModel = "grok-4.20-reasoning";

const MemoryRefSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    label: z.string().trim().min(1).max(160),
    kind: z.enum(["brain", "session", "preference", "context"]),
    summary: z.string().trim().min(1).max(1_200),
  })
  .strict();

const SourceRefSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    label: z.string().trim().min(1).max(160),
    kind: z.enum(["rough_idea", "session", "source", "user_comment"]),
    excerpt: z.string().trim().min(1).max(2_000),
    url: z.string().trim().url().nullable().optional(),
    sourceRange: z.string().trim().max(160).nullable().optional(),
  })
  .strict();

const CreateScoresSchema = z
  .object({
    intentMatch: z.number().int().min(0).max(100),
    buildability: z.number().int().min(0).max(100),
    value: z.number().int().min(0).max(100),
    novelty: z.number().int().min(0).max(100),
    risk: z.number().int().min(0).max(100),
  })
  .strict();

const CreateOptionProviderDraftSchema = z
  .object({
    lens: z.enum(lensOrder),
    title: z.string().trim().min(8).max(120),
    oneLine: z.string().trim().min(16).max(240),
    rationale: z.string().trim().min(24).max(700),
    nextMove: z.string().trim().min(12).max(260),
    risks: z.array(z.string().trim().min(8).max(220)).min(1).max(4),
    scores: CreateScoresSchema.optional(),
  })
  .strict();

const CreateOptionProviderOutputSchema = z
  .object({
    options: z.array(CreateOptionProviderDraftSchema).length(lensOrder.length),
  })
  .strict();

const createOptionOutputSpec = Output.object<CreateOptionProviderOutput>({
  schema: CreateOptionProviderOutputSchema,
  name: "penny_create_options",
  description: "Penny Create option copy for exactly the Personal, Practical, Valuable, Critical, and Weird lenses.",
});

const ArtifactSectionSchema: z.ZodType<ArtifactSection> = z
  .object({
    id: z.string().trim().min(1).max(160),
    title: z.enum(artifactSectionTitles),
    body: z.string().max(20_000),
    status: z.enum(["draft", "updated", "needs_input"]),
  })
  .strict();

const CodingPromptArtifactSchema: z.ZodType<CodingPromptArtifact> = z
  .object({
    id: z.string().trim().min(1).max(160),
    projectId: z.string().trim().min(1).max(160),
    sessionId: z.string().trim().min(1).max(160),
    title: z.string().trim().min(1).max(200),
    version: z.number().int().min(1).max(1_000),
    rawIdea: z.string().trim().min(1).max(120_000),
    sections: z.array(ArtifactSectionSchema).length(artifactSectionTitles.length),
    sourceOptionSetIds: z.array(z.string().trim().min(1).max(160)).max(200),
    judgmentEventIds: z.array(z.string().trim().min(1).max(160)).max(200),
    updatedAt: z.string().trim().min(1).max(80),
  })
  .strict();

const CreateContextSchema = z
  .object({
    summary: z.string().trim().max(4_000).optional(),
    sessionTitle: z.string().trim().max(240).optional(),
    activeClaim: z.string().trim().max(2_000).optional(),
    sourceText: z.string().trim().max(20_000).optional(),
  })
  .strict();

const CreateNextBodySchema = z
  .object({
    rawIdea: z.string().trim().max(120_000).optional(),
    roughIdea: z.string().trim().max(120_000).optional(),
    idea: z.string().trim().max(120_000).optional(),
    projectId: z.string().trim().min(1).max(160).nullable().optional(),
    sessionId: z.string().trim().min(1).max(160).nullable().optional(),
    optionSetId: z.string().trim().min(1).max(160).nullable().optional(),
    selectedOptionIds: z.array(z.string().trim().min(1).max(160)).max(5).optional().default([]),
    userComment: z.string().trim().max(8_000).optional().default(""),
    artifact: CodingPromptArtifactSchema.optional(),
    memory: z.array(MemoryRefSchema).max(12).optional().default([]),
    sources: z.array(SourceRefSchema).max(12).optional().default([]),
    context: CreateContextSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!sourceTextFromCreateInput(value)) {
      context.addIssue({
        code: "custom",
        path: ["rawIdea"],
        message: "Create needs a rough idea before it can generate directions.",
      });
    }
  });

const ExportCodingPromptBodySchema = z
  .object({
    artifact: CodingPromptArtifactSchema,
    verification: z.unknown().optional(),
    judgmentEvent: z.unknown().optional(),
  })
  .strict();

const createExportFeedbackReasons = [
  "strong_output",
  "too_generic",
  "too_complex",
  "not_personal_enough",
  "wrong_memory",
  "missing_constraints",
  "ready_to_ship",
] as const;

const CreateExportFeedbackBodySchema = z
  .object({
    projectId: z.string().trim().min(1).max(160),
    sessionId: z.string().trim().min(1).max(160),
    artifactId: z.string().trim().min(1).max(160),
    exportId: z.string().trim().min(1).max(160),
    rating: z.enum(["useful", "not_useful"]),
    reasons: z.array(z.enum(createExportFeedbackReasons)).max(8).optional().default([]),
    comment: z.string().trim().max(1_000).optional().default(""),
    promptCompletenessScore: z.number().int().min(0).max(100).nullable().optional().default(null),
  })
  .strict();

const defaultCreateRouteService = createInMemoryCreateRouteService();
const defaultCreateExportFeedbackStore = new Map<string, CreateExportFeedback>();
let defaultCreateExportFeedbackServiceCache: CreateExportFeedbackService | null = null;
let defaultCreateExportFeedbackServiceCacheKey: string | null = null;

export async function handleCreateNextRequest(request: Request, options: CreateRouteOptions = {}): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/create/next requires the POST method.", "POST");
  }

  const parsed = await parseJsonRequest(request, CreateNextBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = options.service ?? defaultCreateRouteService;
    const result = await service.next(parsed.data, request);
    emitCreateNextLogs(result);

    return jsonResponse({ data: result });
  } catch (error) {
    emitPennyLog("create.generate", { status: "error" }, { level: "error" });
    return createErrorResponse(error);
  }
}

export async function handleCreateCompareRequest(request: Request, options: CreateRouteOptions = {}): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/create/compare requires the POST method.", "POST");
  }

  const parsed = await parseJsonRequest(request, CreateNextBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = options.service ?? defaultCreateRouteService;
    return jsonResponse({ data: await service.compare(parsed.data, request) });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleExportCodingPromptRequest(
  request: Request,
  options: CreateRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/create/export-coding-prompt requires the POST method.", "POST");
  }

  const parsed = await parseJsonRequest(request, ExportCodingPromptBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = options.service ?? defaultCreateRouteService;
    const result = await service.exportCodingPrompt(parsed.data, request);
    emitPennyLog("create.prompt_export", {
      status: "completed",
      artifactId: result.export.artifactId,
      exportId: result.export.id,
      format: result.export.format,
      targetCount: result.export.targets.length,
      completenessScore: result.export.qualitySignals.promptCompletenessScore,
      missingCount: result.export.qualitySignals.missing.length,
    });

    return jsonResponse({ data: result });
  } catch (error) {
    emitPennyLog("create.prompt_export", { status: "error" }, { level: "error" });
    return createErrorResponse(error);
  }
}

export async function handleCreateExportFeedbackRequest(
  request: Request,
  options: CreateRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/create/export-feedback requires the POST method.", "POST");
  }

  const parsed = await parseJsonRequest(request, CreateExportFeedbackBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = options.feedbackService ?? resolveDefaultCreateExportFeedbackService();
    const result = await service.submit(parsed.data, request);

    return jsonResponse({ data: result }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
}

function emitCreateNextLogs(result: CreateNextResult): void {
  const observability = result.observability;

  emitPennyLog("create.generate", {
    status: "completed",
    optionSetId: result.optionSet.id,
    artifactId: result.artifact.id,
    providerMode: observability.providerMode,
    providerName: observability.providerName,
    schemaValidation: observability.schemaValidation,
    schemaValidationErrorCount: observability.schemaValidationErrors.length,
    memoryCountUsed: observability.memoryCountUsed,
    sourceCountUsed: observability.sourceCountUsed,
    rejectedDirectionCount: observability.rejectedDirectionsUsed.length,
    generatedLensCount: observability.generatedLenses.length,
    selectedOptionCount: observability.selectedOptionIds.length,
    exportReady: result.exportReady,
    completenessScore: observability.exportQualitySignals.promptCompletenessScore,
    missingCount: observability.exportQualitySignals.missing.length,
  });

  if (observability.providerMode === "deterministic_fallback") {
    emitPennyLog(
      "create.model_fallback",
      {
        status: "fallback",
        optionSetId: result.optionSet.id,
        providerName: observability.providerName,
        schemaValidation: observability.schemaValidation,
      },
      { level: "warn" },
    );
  }

  if (observability.schemaValidation === "failure") {
    emitPennyLog(
      "create.schema_validation_failure",
      {
        status: "failed",
        optionSetId: result.optionSet.id,
        providerName: observability.providerName,
        schemaValidationErrorCount: observability.schemaValidationErrors.length,
      },
      { level: "warn" },
    );
  }
}

export class CreateRouteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreateRouteValidationError";
  }
}

export function createInMemoryCreateRouteService(options: CreateRouteServiceOptions = {}): CreateRouteService {
  const optionSets = new Map<string, OptionSet>();
  const artifacts = new Map<string, CodingPromptArtifact>();
  const judgments = new Map<string, JudgmentEvent[]>();
  const optionProvider = options.optionProvider === undefined ? createDefaultCreateOptionProvider() : options.optionProvider;
  const rankerRecorder = options.rankerRecorder === undefined ? resolveDefaultBrainRankerRecorder() : options.rankerRecorder;

  async function runNext(input: CreateNextInput, request: Request, provider: CreateOptionProvider | null, persist: boolean): Promise<CreateNextResult> {
      const rawIdea = sourceTextFromCreateInput(input);
      if (!rawIdea) {
        throw new CreateRouteValidationError("Create needs a rough idea before it can generate directions.");
      }

      const scope = scopeFromRequest(request);
      const now = isoNow();
      const projectId = input.projectId ?? input.artifact?.projectId ?? stableId("create-project", scope.projectId ?? "project", rawIdea);
      const sessionId = input.sessionId ?? input.artifact?.sessionId ?? stableId("create-session", scope.userId ?? "user", rawIdea);
      const retrievedMemory = await retrieveBrainMemoryForCreate({ scope, query: rawIdea, limit: 5 });
      const memoryUsed = normalizeMemoryRefs([...input.memory, ...retrievedMemory.memoryRefs], input.context, sessionId);
      const sourcesUsed = normalizeSourceRefs([...input.sources, ...retrievedMemory.sourceRefs], input.context, rawIdea);
      const brainRank = rankBrainForCreate({
        rawIdea,
        memoryRefs: memoryUsed,
        sourceRefs: sourcesUsed,
        retrievalResults: retrievedMemory.results,
        now,
      });
      const scopedSessionKey = createScopeStorageKey(scope, sessionId);
      const existingOptionSet = persist && input.optionSetId ? optionSets.get(createScopeStorageKey(scope, input.optionSetId)) ?? null : null;
      const generated =
        existingOptionSet
          ? {
              optionSet: existingOptionSet,
              trace: deterministicProviderTrace(),
            }
          : await buildOptionSetWithProvider({
          projectId,
          sessionId,
          rawIdea,
          memoryUsed,
          sourcesUsed,
          contextLight: retrievedMemory.contextLight && input.memory.length === 0,
          brainRank,
          now,
              provider,
            });
      const optionSet = generated.optionSet;
      if (persist && !existingOptionSet && rankerRecorder) {
        await rankerRecorder.recordCreateRankerRun({
          scope,
          createProjectId: projectId,
          createSessionId: sessionId,
          optionSetId: optionSet.id,
          rawIdea,
          result: brainRank,
          occurredAt: now,
        });
      }

      const priorArtifact = input.artifact ?? artifacts.get(scopedSessionKey) ?? null;
      const selectedOptions = optionSet.options.filter((option) => input.selectedOptionIds.includes(option.id));
      const baseArtifact = priorArtifact ?? buildInitialArtifact({ projectId, sessionId, rawIdea, optionSet, now });
      let artifact = baseArtifact;
      let judgmentEvent: JudgmentEvent | null = null;

      if (selectedOptions.length || input.userComment.trim()) {
        const update = updateArtifactFromJudgment({
          artifact: baseArtifact,
          optionSet,
          selectedOptions,
          userComment: input.userComment.trim(),
          now,
        });
        artifact = update.artifact;
        judgmentEvent = {
          id: stableId("judgment", optionSet.id, input.selectedOptionIds.join("|"), input.userComment, String(artifact.version)),
          projectId,
          sessionId,
          optionSetId: optionSet.id,
          selectedOptionIds: selectedOptions.map((option) => option.id),
          userComment: input.userComment.trim(),
          inferredSignals: inferSignals(selectedOptions, input.userComment),
          artifactDelta: update.delta,
          createdAt: now,
        };
        artifact = {
          ...artifact,
          judgmentEventIds: unique([...artifact.judgmentEventIds, judgmentEvent.id]),
        };
        if (persist) {
          judgments.set(scopedSessionKey, [...(judgments.get(scopedSessionKey) ?? []), judgmentEvent]);
        }
        if (persist && rankerRecorder) {
          await recordCreateJudgmentDevelopmentEvents(rankerRecorder, {
            scope,
            projectId,
            sessionId,
            optionSet,
            selectedOptions,
            userComment: input.userComment.trim(),
            occurredAt: now,
          });
        }
      }

      artifact = {
        ...artifact,
        sourceOptionSetIds: unique([...artifact.sourceOptionSetIds, optionSet.id]),
        sections: artifact.sections.map((section) =>
          section.title === "Final coding-agent prompt"
            ? {
                ...section,
                body: clipText(buildPromptText(artifact), 12_000),
                status: artifact.version > 1 ? "updated" : section.status,
              }
            : section,
        ),
      };

      if (persist) {
        optionSets.set(createScopeStorageKey(scope, optionSet.id), optionSet);
        artifacts.set(scopedSessionKey, artifact);
      }
      const verification = verifyArtifact(artifact, optionSet, judgmentEvent);
      const observability = createObservability({
        trace: generated.trace,
        optionSet,
        artifact,
        selectedOptions,
      });

      return {
        sourceOfTruth: "create_options_judgments_artifacts_verification",
        optionSet,
        artifact,
        verification,
        judgmentEvent,
        observability,
        exportReady: verification.verdict === "ready",
      };
  }

  return {
    async next(input, request) {
      return runNext(input, request, optionProvider, true);
    },

    async compare(input, request) {
      const rawIdea = sourceTextFromCreateInput(input);
      if (!rawIdea) {
        throw new CreateRouteValidationError("Create needs a rough idea before it can compare providers.");
      }

      const comparisonInput = { ...input, optionSetId: null };
      const deterministic = await runNext(comparisonInput, request, null, false);
      const modelBackedBase = await runNext(comparisonInput, request, optionProvider, false);
      const modelBacked = optionProvider ? modelBackedBase : withDisabledProviderFallback(modelBackedBase);

      return {
        sourceOfTruth: "deterministic_model_backed_create_comparison",
        rawIdea,
        deterministic: comparisonArm("deterministic", deterministic),
        modelBacked: comparisonArm("model_backed", modelBacked),
      };
    },

    async exportCodingPrompt(input, request) {
      const artifact = input.artifact;
      const createdAt = isoNow();
      const promptExport = promptExportForArtifact(artifact, createdAt);
      if (rankerRecorder) {
        await rankerRecorder.recordDevelopmentEvent({
          scope: scopeFromRequest(request),
          kind: "prompt_exported",
          explicitness: "explicit",
          weight: 0.88,
          createProjectId: artifact.projectId,
          createSessionId: artifact.sessionId,
          artifactId: artifact.id,
          exportId: promptExport.id,
          summary: `Prompt exported for ${artifact.title}.`,
          occurredAt: createdAt,
          payload: {
            targetCount: promptExport.targets.length,
            promptCompletenessScore: promptExport.qualitySignals.promptCompletenessScore,
            missingCount: promptExport.qualitySignals.missing.length,
          },
        });
      }

      return {
        export: promptExport,
      };
    },
  };
}

export function createInMemoryCreateExportFeedbackService(
  store = new Map<string, CreateExportFeedback>(),
  rankerRecorder: BrainRankerRecorder | null = null,
): CreateExportFeedbackService {
  return {
    async submit(input, request) {
      const feedback = createExportFeedbackFromInput(input, request);
      store.set(createScopeStorageKey(scopeFromRequest(request), feedback.id), feedback);
      if (rankerRecorder) {
        await recordExportFeedbackDevelopmentEvent(rankerRecorder, feedback, scopeFromRequest(request));
      }

      return { feedback };
    },
  };
}

export function createDbCreateExportFeedbackService(
  db: PennyDatabase,
  rankerRecorder: BrainRankerRecorder | null = null,
): CreateExportFeedbackService {
  return {
    async submit(input, request) {
      const feedback = createExportFeedbackFromInput(input, request);
      const scope = scopeFromRequest(request);

      await db.insert(createExportFeedbackTable).values({
        ...scope,
        id: feedback.id,
        createProjectId: feedback.projectId,
        createSessionId: feedback.sessionId,
        artifactId: feedback.artifactId,
        exportId: feedback.exportId,
        rating: feedback.rating,
        reasons: feedback.reasons,
        comment: feedback.comment,
        promptCompletenessScore: feedback.promptCompletenessScore,
        createdAt: new Date(feedback.createdAt),
      });
      if (rankerRecorder) {
        await recordExportFeedbackDevelopmentEvent(rankerRecorder, feedback, scope);
      }

      return { feedback };
    },
  };
}

function resolveDefaultCreateExportFeedbackService(): CreateExportFeedbackService {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const cacheKey = databaseUrl ? `db:${databaseUrl}` : `memory:${createRuntimeKind()}`;

  if (defaultCreateExportFeedbackServiceCache && defaultCreateExportFeedbackServiceCacheKey === cacheKey) {
    return defaultCreateExportFeedbackServiceCache;
  }

  if (databaseUrl) {
    defaultCreateExportFeedbackServiceCache = createDbCreateExportFeedbackService(
      createPennyDb(databaseUrl),
      resolveDefaultBrainRankerRecorder(),
    );
    defaultCreateExportFeedbackServiceCacheKey = cacheKey;
    return defaultCreateExportFeedbackServiceCache;
  }

  if (createRuntimeKind() !== "dev-test") {
    throw new Error(
      "DATABASE_URL is required for Create export feedback in production. In-memory feedback is only for local dev/test.",
    );
  }

  defaultCreateExportFeedbackServiceCache = createInMemoryCreateExportFeedbackService(defaultCreateExportFeedbackStore);
  defaultCreateExportFeedbackServiceCacheKey = cacheKey;

  return defaultCreateExportFeedbackServiceCache;
}

function createExportFeedbackFromInput(input: CreateExportFeedbackInput, request: Request): CreateExportFeedback {
  const scope = scopeFromRequest(request);
  const createdAt = isoNow();
  const reasons = unique(input.reasons).filter((reason): reason is CreateExportFeedbackReason =>
    createExportFeedbackReasons.includes(reason as CreateExportFeedbackReason),
  );
  const comment = clipText(input.comment.trim(), 1_000);

  return {
    sourceOfTruth: "create_export_feedback",
    id: stableId(
      "create-export-feedback",
      scope.userId,
      scope.workspaceId,
      scope.projectId,
      scope.sphereId,
      input.exportId,
      input.rating,
      reasons.join("|"),
      comment,
      createdAt,
    ),
    projectId: input.projectId,
    sessionId: input.sessionId,
    artifactId: input.artifactId,
    exportId: input.exportId,
    rating: input.rating,
    reasons,
    comment: comment || null,
    promptCompletenessScore: input.promptCompletenessScore ?? null,
    createdAt,
  };
}

async function recordCreateJudgmentDevelopmentEvents(
  rankerRecorder: BrainRankerRecorder,
  input: {
    scope: BrainScope;
    projectId: string;
    sessionId: string;
    optionSet: OptionSet;
    selectedOptions: CandidateOption[];
    userComment: string;
    occurredAt: string;
  },
): Promise<void> {
  const selectedIds = new Set(input.selectedOptions.map((option) => option.id));
  const events: RecordBrainDevelopmentEventInput[] = [];

  for (const option of input.selectedOptions) {
    const refs = optionEventRefs(option);
    events.push({
      scope: input.scope,
      kind: "option_selected",
      explicitness: "explicit",
      weight: 0.95,
      createProjectId: input.projectId,
      createSessionId: input.sessionId,
      optionSetId: input.optionSet.id,
      memoryNodeIds: refs.memoryNodeIds,
      sourceReferenceIds: refs.sourceReferenceIds,
      summary: `User selected the ${option.lens} Create option: ${option.title}.`,
      occurredAt: input.occurredAt,
      payload: {
        optionId: option.id,
        lens: option.lens,
        topReason: option.topReason,
      },
    });
  }

  if (selectedIds.size > 0) {
    for (const option of input.optionSet.options.filter((item) => !selectedIds.has(item.id))) {
      const refs = optionEventRefs(option);
      events.push({
        scope: input.scope,
        kind: "option_rejected",
        explicitness: "implicit",
        weight: 0.45,
        createProjectId: input.projectId,
        createSessionId: input.sessionId,
        optionSetId: input.optionSet.id,
        memoryNodeIds: refs.memoryNodeIds,
        sourceReferenceIds: refs.sourceReferenceIds,
        summary: `User left the ${option.lens} Create option unselected: ${option.title}.`,
        occurredAt: input.occurredAt,
        payload: {
          optionId: option.id,
          lens: option.lens,
          selectedOptionIds: [...selectedIds],
        },
      });
    }
  }

  if (isDirectionChangeComment(input.userComment)) {
    events.push({
      scope: input.scope,
      kind: "user_changed_direction",
      explicitness: "explicit",
      weight: 0.86,
      createProjectId: input.projectId,
      createSessionId: input.sessionId,
      optionSetId: input.optionSet.id,
      memoryNodeIds: unique(input.selectedOptions.flatMap((option) => option.memoryUsed.map((memory) => memory.id))),
      sourceReferenceIds: unique(input.selectedOptions.flatMap((option) => option.sourcesUsed.map((source) => source.id))),
      summary: "User changed direction during Create judgment.",
      occurredAt: input.occurredAt,
      payload: {
        commentLength: input.userComment.length,
        selectedOptionIds: [...selectedIds],
        selectedLenses: input.selectedOptions.map((option) => option.lens),
      },
    });
  }

  for (const event of events) {
    await rankerRecorder.recordDevelopmentEvent(event);
  }
}

async function recordExportFeedbackDevelopmentEvent(
  rankerRecorder: BrainRankerRecorder,
  feedback: CreateExportFeedback,
  scope: BrainScope,
): Promise<void> {
  await rankerRecorder.recordDevelopmentEvent({
    scope,
    kind: "export_feedback",
    explicitness: "explicit",
    weight: feedback.rating === "not_useful" ? 0.92 : 0.82,
    createProjectId: feedback.projectId,
    createSessionId: feedback.sessionId,
    artifactId: feedback.artifactId,
    exportId: feedback.exportId,
    summary: `User marked exported prompt as ${feedback.rating.replace("_", " ")}.`,
    occurredAt: feedback.createdAt,
    payload: {
      rating: feedback.rating,
      reasons: feedback.reasons,
      hasComment: Boolean(feedback.comment),
      promptCompletenessScore: feedback.promptCompletenessScore,
    },
  });
}

function optionEventRefs(option: CandidateOption): Pick<RecordBrainDevelopmentEventInput, "memoryNodeIds" | "sourceReferenceIds"> {
  return {
    memoryNodeIds: unique(option.memoryUsed.map((memory) => memory.id)),
    sourceReferenceIds: unique(option.sourcesUsed.map((source) => source.id)),
  };
}

function isDirectionChangeComment(comment: string): boolean {
  return /\b(pivot|instead|change|revise|cut|combine|sharpen|keep|drop|avoid|prefer|focus|more|less|not)\b/i.test(comment);
}

type ProviderGenerationTrace = Pick<
  CreateObservability,
  "providerMode" | "providerName" | "schemaValidation" | "schemaValidationErrors" | "fallbackReason"
>;

type ProviderGenerationResult = {
  optionSet: OptionSet;
  trace: ProviderGenerationTrace;
};

async function buildOptionSetWithProvider(input: {
  projectId: string;
  sessionId: string;
  rawIdea: string;
  memoryUsed: MemoryRef[];
  sourcesUsed: SourceRef[];
  contextLight: boolean;
  brainRank: BrainRankerResult;
  now: string;
  provider: CreateOptionProvider | null;
}): Promise<ProviderGenerationResult> {
  const baseline = buildOptionSet(input);

  if (!input.provider) {
    return {
      optionSet: baseline,
      trace: deterministicProviderTrace(),
    };
  }

  try {
    const output = await input.provider.generateOptions({
      rawIdea: input.rawIdea,
      memoryUsed: input.memoryUsed,
      sourcesUsed: input.sourcesUsed,
      contextLight: input.contextLight,
      nextBestMove: input.brainRank.nextBestMove,
      rankedCandidates: input.brainRank.rankedCandidates,
      baselineOptions: baseline.options,
    });

    return {
      optionSet: optionSetFromProviderOutput(baseline, output),
      trace: {
        providerMode: "model_backed",
        providerName: input.provider.name,
        schemaValidation: "success",
        schemaValidationErrors: [],
        fallbackReason: null,
      },
    };
  } catch (error) {
    return {
      optionSet: baseline,
      trace: {
        providerMode: "deterministic_fallback",
        providerName: input.provider.name,
        schemaValidation: error instanceof CreateRouteValidationError ? "failure" : "not_run",
        schemaValidationErrors: error instanceof CreateRouteValidationError ? [error.message] : [],
        fallbackReason: `Model-backed Create provider fell back to deterministic options: ${formatErrorMessage(error)}`,
      },
    };
  }
}

function deterministicProviderTrace(): ProviderGenerationTrace {
  return {
    providerMode: "deterministic",
    providerName: "deterministic",
    schemaValidation: "not_run",
    schemaValidationErrors: [],
    fallbackReason: null,
  };
}

function createObservability(input: {
  trace: ProviderGenerationTrace;
  optionSet: OptionSet;
  artifact: CodingPromptArtifact;
  selectedOptions: CandidateOption[];
}): CreateObservability {
  return {
    ...input.trace,
    memoryCountUsed: input.optionSet.memoryUsed.length,
    sourceCountUsed: input.optionSet.sourcesUsed.length,
    rejectedDirectionsUsed: repeatedRejectedDirections(input.optionSet.memoryUsed),
    generatedLenses: input.optionSet.options.map((option) => option.lens),
    selectedOptionIds: input.selectedOptions.map((option) => option.id),
    selectedLenses: input.selectedOptions.map((option) => option.lens),
    exportQualitySignals: promptExportQualitySignals(buildPromptText(input.artifact)),
  };
}

function withDisabledProviderFallback(result: CreateNextResult): CreateNextResult {
  return {
    ...result,
    observability: {
      ...result.observability,
      providerMode: "deterministic_fallback",
      providerName: "disabled",
      fallbackReason: "Model-backed Create provider is not configured; set PENNY_CREATE_MODEL_BACKED=true and XAI_API_KEY to compare.",
    },
  };
}

function comparisonArm(label: CreateProviderComparisonArm["label"], result: CreateNextResult): CreateProviderComparisonArm {
  return {
    label,
    providerUsed: result.observability.providerMode,
    fallbackReason: result.observability.fallbackReason,
    optionSet: result.optionSet,
    artifact: result.artifact,
    verification: result.verification,
    promptExport: promptExportForArtifact(result.artifact, isoNow()),
    observability: result.observability,
  };
}

function promptExportForArtifact(artifact: CodingPromptArtifact, createdAt: string): PromptExport {
  const text = buildPromptText(artifact);

  return {
    id: stableId("prompt-export", artifact.id, artifact.version, text),
    artifactId: artifact.id,
    format: "coding_agent_prompt",
    targets: ["Codex", "Claude Code", "Cursor"],
    text,
    fileName: `${slugify(artifact.title)}-coding-prompt.md`,
    qualitySignals: promptExportQualitySignals(text),
    createdAt,
  };
}

function buildOptionSet(input: {
  projectId: string;
  sessionId: string;
  rawIdea: string;
  memoryUsed: MemoryRef[];
  sourcesUsed: SourceRef[];
  contextLight: boolean;
  brainRank: BrainRankerResult;
  now: string;
}): OptionSet {
  const subject = subjectFromText(input.rawIdea);
  const audience = audienceFromText(input.rawIdea);
  const contextPhrase = input.contextLight
    ? "Context-light: no imported Penny memory matched this idea, so use only the rough idea and supplied session context."
    : input.memoryUsed.length
    ? "Use the visible Penny context as constraints rather than inventing preferences."
    : "No durable Penny memory was provided; treat the rough idea as the only grounded source.";
  const sourceRefs = input.sourcesUsed;
  const memoryRefs = input.memoryUsed;
  const optionSeed = [input.projectId, input.sessionId, input.rawIdea].join("|");
  const profile = createProfileInsights(input.rawIdea, memoryRefs, sourceRefs, input.contextLight);
  const optionSubject = subjectForTitle(subject);
  const rankByLens = new Map(input.brainRank.rankedCandidates.map((candidate) => [candidate.lens, candidate]));
  const rankedMemory = (lens: CreateLens, fallback: MemoryRef[]) => {
    const candidateMemory = rankByLens.get(lens)?.memoryRefs ?? [];

    return candidateMemory.length ? candidateMemory : fallback;
  };
  const rankedMeta = (lens: CreateLens, fallbackMemory: MemoryRef[]) =>
    rankMetadataForLens(rankByLens.get(lens), rankedMemory(lens, fallbackMemory), sourceRefs, input.contextLight);
  const options: CandidateOption[] = [
    {
      id: stableId("create-option-personal", optionSeed),
      lens: "Personal",
      title: `Make ${optionSubject} personal`,
      oneLine: profile.hasMemory
        ? `Center the first loop on this remembered signal: ${profile.personalEvidence}.`
        : "Center the workflow on the rough idea and visibly mark that no durable Brain memory was used.",
      rationale: profile.hasMemory
        ? `${profile.groundedLine} Inferred move: shape Create around the user's own taste, active projects, and constraints instead of a blank prompt box.`
        : `${contextPhrase} The personal direction should ask for more private context before implying Penny knows the user.`,
      nextMove: profile.hasMemory
        ? `Pin ${profile.personalAnchor} as a visible constraint before generating or revising the artifact.`
        : "Ask the user which personal constraints Penny should preserve before generating or revising the artifact.",
      ...rankedMeta("Personal", profile.personalMemory),
      risks: ["Can overfit to weak or missing memory if the UI implies more context than Penny actually has."],
      memoryUsed: rankedMemory("Personal", profile.personalMemory),
      sourcesUsed: sourceRefs,
      scores: { intentMatch: 91, buildability: 74, value: 82, novelty: 78, risk: 42 },
    },
    {
      id: stableId("create-option-practical", optionSeed),
      lens: "Practical",
      title: `Ship the smallest ${subject} loop`,
      oneLine: `Prioritize the first buildable path in the user's preferred style: ${profile.buildStyleEvidence}.`,
      rationale: `${contextPhrase} This is the safest wedge because it makes the core loop testable without waiting for broad memory ingestion or advanced models. Practical constraint: ${profile.buildStyleEvidence}.`,
      nextMove: `Implement the narrow route and UI state machine, then verify the ${profile.buildStyleAnchor} path manually and with tests.`,
      ...rankedMeta("Practical", profile.practicalMemory),
      risks: ["May feel conservative if the artifact does not visibly improve after user judgment."],
      memoryUsed: rankedMemory("Practical", profile.practicalMemory),
      sourcesUsed: sourceRefs,
      scores: { intentMatch: 88, buildability: 94, value: 78, novelty: 58, risk: 28 },
    },
    {
      id: stableId("create-option-valuable", optionSeed),
      lens: "Valuable",
      title: `Make ${optionSubject} valuable`,
      oneLine: `Shape the artifact around the decision that gets easier: ${profile.valueEvidence}.`,
      rationale: profile.hasMemory
        ? `${profile.groundedLine} Inferred move: translate that memory into a target user, external payoff, and acceptance tests that prove usefulness.`
        : `${contextPhrase} The valuable direction forces the prompt artifact to name a real user, external payoff, and acceptance tests that prove usefulness.`,
      nextMove: `Rewrite the target user, core loop, and acceptance tests around ${profile.valueAnchor}.`,
      ...rankedMeta("Valuable", profile.valuableMemory),
      risks: ["Can drift into pitch language unless implementation constraints stay concrete."],
      memoryUsed: rankedMemory("Valuable", profile.valuableMemory),
      sourcesUsed: sourceRefs,
      scores: { intentMatch: 86, buildability: 78, value: 94, novelty: 64, risk: 36 },
    },
    {
      id: stableId("create-option-critical", optionSeed),
      lens: "Critical",
      title: `Stress-test ${optionSubject}`,
      oneLine: profile.hasMemory
        ? `Pressure-test generic GPT-wrapper risk against the user's remembered rejection: ${profile.criticalEvidence}.`
        : "Pressure-test whether the idea is truly memory-native or just a GPT wrapper with nicer furniture.",
      rationale: `${contextPhrase} Friendly critique: the idea gets stronger if it names what Penny records, how judgment changes the artifact, and what must not be faked. Treat generic GPT-wrapper behavior, fake connector claims, and unsupported memory claims as export blockers.`,
      nextMove: `Add explicit verification checks for source grounding, non-generic behavior, missing information, and ${profile.criticalAnchor} before export is allowed.`,
      ...rankedMeta("Critical", profile.criticalMemory),
      risks: ["If the critique dominates the UI, Create may feel punitive instead of generative.", "A generic wrapper can still pass if memory evidence is attached but never changes the artifact."],
      memoryUsed: rankedMemory("Critical", profile.criticalMemory),
      sourcesUsed: sourceRefs,
      scores: { intentMatch: 89, buildability: 82, value: 86, novelty: 70, risk: 52 },
    },
    {
      id: stableId("create-option-weird", optionSeed),
      lens: "Weird",
      title: `Make ${optionSubject} strange but buildable`,
      oneLine: `Use the unusual but still useful edge in the context: ${profile.weirdEvidence}.`,
      rationale: profile.hasMemory
        ? `${profile.groundedLine} Inferred move: bend the artifact through that taste signal while still producing implementation requirements and tests.`
        : `${contextPhrase} The weird direction keeps Penny from becoming a dashboard: selected lenses should leave visible traces in the prompt and verification brief.`,
      nextMove: `Give each selected card a distinct artifact mutation inspired by ${profile.weirdAnchor}, while keeping the coding prompt executable.`,
      ...rankedMeta("Weird", profile.weirdMemory),
      risks: ["Could become decorative unless every weird move still updates the coding prompt."],
      memoryUsed: rankedMemory("Weird", profile.weirdMemory),
      sourcesUsed: sourceRefs,
      scores: { intentMatch: 80, buildability: 68, value: 76, novelty: 94, risk: 58 },
    },
  ];

  return {
    id: stableId("create-options", optionSeed),
    projectId: input.projectId,
    sessionId: input.sessionId,
    sourceOfTruth: "rough_idea_context_deterministic_create_lenses",
    rawIdea: input.rawIdea,
    options,
    nextBestMove: input.brainRank.nextBestMove,
    rankedCandidates: input.brainRank.rankedCandidates,
    memoryUsed: memoryRefs,
    sourcesUsed: sourceRefs,
    createdAt: input.now,
  };
}

function rankMetadataForLens(
  candidate: BrainRankedCandidate | undefined,
  memoryUsed: MemoryRef[],
  sourceRefs: SourceRef[],
  contextLight: boolean,
): Pick<CandidateOption, "topReason" | "grounding" | "contextLabel" | "memoryCount" | "sourceCount" | "rankReasons" | "uncertainty"> {
  if (!candidate) {
    return {
      topReason: contextLight
        ? "Context-light: no relevant Brain memory matched this task."
        : "Ranker used the supplied rough idea and session context.",
      grounding: contextLight ? "context_light" : memoryUsed.length ? "grounded" : "inferred",
      contextLabel: contextLight ? "Context-light / search-needed / inferred" : memoryUsed.length ? "Grounded in Brain memory" : "Inferred from light context",
      memoryCount: memoryUsed.length,
      sourceCount: sourceRefs.length,
      rankReasons: [],
      uncertainty: contextLight ? ["No relevant Brain memory matched strongly."] : [],
    };
  }

  return {
    topReason: candidate.topReason,
    grounding: candidate.grounding,
    contextLabel: candidate.contextLabel,
    memoryCount: candidate.memoryCount,
    sourceCount: candidate.sourceCount,
    rankReasons: candidate.reasons,
    uncertainty: candidate.uncertainty,
  };
}

export function createDefaultCreateOptionProvider(env: Record<string, string | undefined> = process.env): CreateOptionProvider | null {
  if (env.PENNY_CREATE_MODEL_BACKED?.trim() === "true" && env.XAI_API_KEY?.trim()) {
    return createXaiCreateOptionProvider(env);
  }

  return null;
}

export function createXaiCreateOptionProvider(
  env: Record<string, string | undefined> = process.env,
  options: XaiCreateOptionProviderOptions = {},
): CreateOptionProvider {
  return {
    name: "xai",
    async generateOptions(input) {
      const apiKey = env.XAI_API_KEY?.trim();

      if (!apiKey) {
        throw new CreateRouteValidationError("XAI_API_KEY is required for the xAI Create option provider.");
      }

      const xai = createXai({ apiKey });
      const callGenerateText = options.generateText ?? generateStructuredCreateOptions;
      const result = await callGenerateText({
        model: xai.responses(resolveXaiCreateOptionModel(env)),
        system: buildCreateOptionSystemPrompt(),
        prompt: buildCreateOptionPrompt(input),
        output: createOptionOutputSpec,
        maxRetries: 1,
        providerOptions: {
          xai: {
            store: false,
          },
        },
      });

      return result.output;
    },
  };
}

export function resolveXaiCreateOptionModel(env: Record<string, string | undefined> = process.env): string {
  return env.XAI_CREATE_OPTION_MODEL?.trim() || env.XAI_MODEL?.trim() || defaultXaiCreateOptionModel;
}

export function optionSetFromProviderOutput(baseline: OptionSet, output: unknown): OptionSet {
  const parsed = parseCreateOptionProviderOutput(output);
  const draftsByLens = new Map(parsed.options.map((option) => [option.lens, option]));
  const options = baseline.options.map((baselineOption) => {
    const draft = draftsByLens.get(baselineOption.lens);

    if (!draft) {
      return baselineOption;
    }

    return {
      ...baselineOption,
      title: draft.title,
      oneLine: draft.oneLine,
      rationale: ensureGroundingLanguage(draft.rationale, baselineOption.rationale),
      nextMove: draft.nextMove,
      risks: draft.risks,
      scores: draft.scores ?? baselineOption.scores,
    };
  });

  return {
    ...baseline,
    sourceOfTruth: "rough_idea_context_model_backed_create_lenses",
    options,
  };
}

export function parseCreateOptionProviderOutput(output: unknown): CreateOptionProviderOutput {
  const parsed = CreateOptionProviderOutputSchema.safeParse(output);

  if (!parsed.success) {
    throw new CreateRouteValidationError(`Create option provider output failed validation: ${flattenIssues(parsed.error).join("; ")}`);
  }

  const lenses = parsed.data.options.map((option) => option.lens);
  const missing = lensOrder.filter((lens) => !lenses.includes(lens));
  const duplicates = lenses.filter((lens, index) => lenses.indexOf(lens) !== index);

  if (missing.length || duplicates.length) {
    throw new CreateRouteValidationError(
      `Create option provider output must include exactly one option per lens. Missing: ${missing.join(", ") || "none"}. Duplicate: ${unique(duplicates).join(", ") || "none"}.`,
    );
  }

  const unsafeText = parsed.data.options
    .map((option) => [option.title, option.oneLine, option.rationale, option.nextMove, ...option.risks].join(" "))
    .join("\n");

  if (hasUnsupportedConnectorClaim(unsafeText)) {
    throw new CreateRouteValidationError("Create option provider output invented unsupported connector, OAuth, or global-training claims.");
  }

  return parsed.data;
}

export function buildCreateOptionSystemPrompt(): string {
  return [
    "You are Penny's Create option copywriter.",
    "Return only the structured output schema.",
    "Write exactly five concise, differentiated options for Personal, Practical, Valuable, Critical, and Weird.",
    "Use only the supplied rough idea, memory refs, source refs, and baseline options.",
    "Do not invent Gmail, LinkedIn, WhatsApp, Slack, messages, OAuth, connector, global-training, hidden-memory, or external-source claims.",
    "Do not add broad new product modes. Keep Create focused on rough idea -> directions -> judgment -> artifact -> verification -> export.",
    "Preserve source grounding by naming grounded context separately from inferred moves.",
  ].join("\n");
}

export function buildCreateOptionPrompt(input: CreateOptionGenerationInput): string {
  return [
    "Refine this deterministic Penny Create option set.",
    "",
    `Rough idea: ${input.rawIdea}`,
    `Context-light: ${String(input.contextLight)}`,
    "",
    "Memory refs:",
    input.memoryUsed.length ? input.memoryUsed.map((memory) => `- ${memory.id} | ${memory.label}: ${memory.summary}`).join("\n") : "- none",
    "",
    "Source refs:",
    input.sourcesUsed.map((source) => `- ${source.id} | ${source.label}${source.sourceRange ? ` (${source.sourceRange})` : ""}: ${source.excerpt}`).join("\n"),
    "",
    "Brain Ranker next-best move:",
    `- ${input.nextBestMove.title}: ${input.nextBestMove.action}`,
    `- Why it matters: ${input.nextBestMove.whyItMatters}`,
    "",
    "Brain Ranker candidates:",
    input.rankedCandidates
      .map((candidate) =>
        `- ${candidate.lens} | ${candidate.contextLabel} | ${candidate.memoryCount} memories | ${candidate.sourceCount} sources | ${candidate.topReason}`,
      )
      .join("\n"),
    "",
    "Baseline options to improve without changing lenses, source refs, or memory refs:",
    JSON.stringify(
      input.baselineOptions.map((option) => ({
        lens: option.lens,
        title: option.title,
        oneLine: option.oneLine,
        rationale: option.rationale,
        nextMove: option.nextMove,
        risks: option.risks,
        scores: option.scores,
      })),
      null,
      2,
    ),
  ].join("\n");
}

function ensureGroundingLanguage(rationale: string, fallback: string): string {
  if (/\b(grounded|inferred|context-light|memory|source)\b/i.test(rationale)) {
    return rationale;
  }

  const groundingSentence = fallback.split(/(?<=[.!?])\s+/u).find((sentence) => /\b(grounded|context-light|memory|source)\b/i.test(sentence));

  return groundingSentence ? `${groundingSentence} ${rationale}` : rationale;
}

function hasUnsupportedConnectorClaim(text: string): boolean {
  return /\b(gmail|linkedin|whatsapp|slack|messages?|oauth|global training|shared training|trained on your data|hidden memory|background import)\b/i.test(text);
}

function hasFakeProvenanceClaim(text: string): boolean {
  return (
    /\b(imported|connected|read|pulled from|synced|scanned|analyzed)\b.{0,80}\b(gmail|linkedin|whatsapp|slack|messages?|oauth)\b/i.test(text)
    || /\b(global training|shared training|trained on your data|hidden memory|background import|secret memory|private inbox)\b/i.test(text)
  );
}

function flattenIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`);
}

async function generateStructuredCreateOptions(request: Parameters<CreateGenerateText>[0]): Promise<{ output: unknown }> {
  const result = await generateText(request);

  return { output: result.output };
}

type CreateProfileInsights = {
  hasMemory: boolean;
  groundedLine: string;
  personalAnchor: string;
  personalEvidence: string;
  buildStyleAnchor: string;
  buildStyleEvidence: string;
  valueAnchor: string;
  valueEvidence: string;
  criticalAnchor: string;
  criticalEvidence: string;
  weirdAnchor: string;
  weirdEvidence: string;
  personalMemory: MemoryRef[];
  practicalMemory: MemoryRef[];
  valuableMemory: MemoryRef[];
  criticalMemory: MemoryRef[];
  weirdMemory: MemoryRef[];
};

function createProfileInsights(
  rawIdea: string,
  memoryRefs: MemoryRef[],
  sourceRefs: SourceRef[],
  contextLight: boolean,
): CreateProfileInsights {
  const preferences = matchingMemoryRefs(memoryRefs, [
    /\b(prefer|preference|style|taste|aesthetic|should feel|care about|like)\b/i,
  ]);
  const projects = matchingMemoryRefs(memoryRefs, [
    /\b(project|product|app|startup|prototype|mvp|build|goal|active|launch|workflow)\b/i,
  ]);
  const frustrations = matchingMemoryRefs(memoryRefs, [
    /\b(frustrat|annoy|hate|pain|stuck|blocked|generic|slop|paperwork|bottleneck|too much)\b/i,
  ]);
  const rejected = matchingMemoryRefs(memoryRefs, [
    /\b(reject|rejected|avoid|instead of|do not|don't|not a generic|no generic|skip|fake|wrapper)\b/i,
  ]);
  const creative = matchingMemoryRefs(memoryRefs, [
    /\b(weird|creative|play|instrument|tactile|visual|zine|studio|surprising|novel|field|offline)\b/i,
  ]);
  const hasMemory = memoryRefs.length > 0;
  const firstMemory = memoryRefs[0] ?? null;
  const firstSource = sourceRefs.find((source) => source.kind !== "rough_idea") ?? null;
  const sourceEvidence = firstSource
    ? `${firstSource.label}${firstSource.sourceRange ? ` ${firstSource.sourceRange}` : ""}`
    : "the rough idea";
  const groundedLine = hasMemory
    ? `Grounded in ${memoryRefs.length} memory ref(s) and ${sourceEvidence}: ${evidencePhrase(firstMemory, rawIdea)}`
    : contextLight
      ? "Context-light: no imported Penny memory matched this idea, so only the rough idea is grounded."
      : "Grounded only in supplied session context and the rough idea.";
  const personalMemory = chooseMemoryRefs(memoryRefs, preferences, projects, creative);
  const practicalMemory = chooseMemoryRefs(memoryRefs, preferences, projects);
  const valuableMemory = chooseMemoryRefs(memoryRefs, projects, frustrations, preferences);
  const criticalMemory = chooseMemoryRefs(memoryRefs, rejected, frustrations, preferences);
  const weirdMemory = chooseMemoryRefs(memoryRefs, creative, preferences, projects);

  return {
    hasMemory,
    groundedLine,
    personalAnchor: anchorPhrase(personalMemory[0], "the user's actual context"),
    personalEvidence: evidencePhrase(personalMemory[0] ?? firstMemory, "No personal memory was supplied."),
    buildStyleAnchor: anchorPhrase(practicalMemory[0], "smallest usable loop"),
    buildStyleEvidence: evidencePhrase(practicalMemory[0], "small route, UI, verification, and export loop"),
    valueAnchor: anchorPhrase(valuableMemory[0], "the target user's real job"),
    valueEvidence: evidencePhrase(valuableMemory[0], "who benefits, what decision gets easier, and why it beats generic generation"),
    criticalAnchor: anchorPhrase(criticalMemory[0], "generic-wrapper risk"),
    criticalEvidence: evidencePhrase(criticalMemory[0], "avoid generic wrapper behavior and fake provenance"),
    weirdAnchor: anchorPhrase(weirdMemory[0], "a useful creative instrument"),
    weirdEvidence: evidencePhrase(weirdMemory[0], "make the lenses surprising without making the prompt decorative"),
    personalMemory,
    practicalMemory,
    valuableMemory,
    criticalMemory,
    weirdMemory,
  };
}

function matchingMemoryRefs(memoryRefs: MemoryRef[], patterns: RegExp[]): MemoryRef[] {
  return memoryRefs.filter((memory) => patterns.some((pattern) => pattern.test(`${memory.label} ${memory.summary}`)));
}

function chooseMemoryRefs(memoryRefs: MemoryRef[], ...groups: MemoryRef[][]): MemoryRef[] {
  const preferred = uniqueById(groups.flat()).slice(0, 4);

  return preferred.length ? preferred : memoryRefs.slice(0, 4);
}

function anchorPhrase(memory: MemoryRef | undefined, fallback: string): string {
  if (!memory) {
    return fallback;
  }

  const label = memory.label
    .replace(/^(Preference|Project|Goal|Frustration|Decision|Rejected direction|Idea|Source fact|Question)\s*[:\-]\s*/i, "")
    .replace(/^(Preference|Project|Goal|Frustration|Decision|Rejected direction|Idea|Source fact|Question)\s*[:\-]\s*/i, "")
    .trim();

  return clipText(label || memory.summary, 72).toLowerCase();
}

function evidencePhrase(memory: MemoryRef | null | undefined, fallback: string): string {
  return memory ? clipText(memory.summary, 180) : fallback;
}

function buildInitialArtifact(input: {
  projectId: string;
  sessionId: string;
  rawIdea: string;
  optionSet: OptionSet;
  now: string;
}): CodingPromptArtifact {
  const subject = subjectFromText(input.rawIdea);
  const audience = audienceFromText(input.rawIdea);
  const personalContext = formatPersonalContext(input.optionSet.memoryUsed, input.optionSet.sourcesUsed);
  const sections = sectionMap({
    "Product goal": `Build a focused Create flow for ${subject.toLowerCase()} that turns a rough idea into judged options, a coding-prompt artifact, verification, and export.`,
    "User intent": [
      `Rough idea: ${input.rawIdea}`,
      "",
      "User request: Turn this into memory-grounded Create directions and an exportable coding-agent prompt.",
      "",
      "Personal context used:",
      personalContext,
      "",
      "Brain next-best move:",
      `- ${input.optionSet.nextBestMove.title}: ${input.optionSet.nextBestMove.action}`,
      `- Why it matters: ${input.optionSet.nextBestMove.whyItMatters}`,
      "",
      "Selected option history:",
      "- No selected Create directions yet.",
    ].join("\n"),
    "Target user": `${audience}. Keep this explicit until the user narrows it further.`,
    "Core loop": "Rough idea -> five Create directions -> multi-select judgment plus comment -> incremental artifact update -> verification -> coding-agent prompt export.",
    "UX requirements": "Keep the flow compact: one rough idea input, five cards, multi-select, comment box, artifact panel, verification summary, and export button.",
    "Frontend requirements": "Use the existing React/Vite workspace and preserve the editorial/newsprint style. Reuse current mode shell and client conventions.",
    "Backend requirements": "Expose deterministic POST /api/create/next and POST /api/create/export-coding-prompt routes with strict local validation and replaceable generation logic.",
    "Data model": "Represent CandidateOption, OptionSet, JudgmentEvent, CodingPromptArtifact, ArtifactSection, ArtifactDelta, VerificationSummary, MemoryRef, SourceRef, and PromptExport.",
    "AI/memory orchestration": `Use available Penny memory/source/session context only when provided. Do not imply hidden memory. Store judgment as a durable signal for later model-backed generation.\n\nBrain next-best move:\n- ${input.optionSet.nextBestMove.title}: ${input.optionSet.nextBestMove.action}\n- ${input.optionSet.nextBestMove.whyItMatters}\n\nPersonal context available now:\n${personalContext}`,
    "Privacy constraints": "Do not send data to a model in v0 placeholder mode. Keep source and memory references explicit so the UI never claims provenance it lacks.",
    "Verification constraints": "Verify intent match, buildability, source/context grounding, non-generic GPT-wrapper risk, missing information, and implementation risks.",
    "Implementation plan": "1. Add contracts and route handlers. 2. Add client methods. 3. Render the Create workspace. 4. Add focused tests. 5. Run build, typecheck, and tests.",
    "Acceptance tests": "A user can enter a rough idea, see Personal/Practical/Valuable/Critical/Weird cards, select multiple, comment, see the artifact update, review verification, and export a usable prompt.",
    "Do-not-break list": "Do not break Brain, Learn, session recovery, existing auth/session/tenant headers, canvas actions, or current visual language.",
    "Final coding-agent prompt": "Generate directions first, then select options and update the artifact before exporting the final prompt.",
  });

  return {
    id: stableId("create-artifact", input.projectId, input.sessionId, input.rawIdea),
    projectId: input.projectId,
    sessionId: input.sessionId,
    title: `Create prompt: ${clipText(subject, 72)}`,
    version: 1,
    rawIdea: input.rawIdea,
    sections,
    sourceOptionSetIds: [input.optionSet.id],
    judgmentEventIds: [],
    updatedAt: input.now,
  };
}

function updateArtifactFromJudgment(input: {
  artifact: CodingPromptArtifact;
  optionSet: OptionSet;
  selectedOptions: CandidateOption[];
  userComment: string;
  now: string;
}): { artifact: CodingPromptArtifact; delta: ArtifactDelta } {
  const fallbackOption = input.optionSet.options[1] ?? input.optionSet.options[0] ?? null;
  const selected = input.selectedOptions.length ? input.selectedOptions : fallbackOption ? [fallbackOption] : [];
  const selectedLenses = selected.map((option) => option.lens).join(" + ") || "No selected lens";
  const userComment = input.userComment || "No additional comment supplied.";
  const selectedTitles = selected.map((option) => `${option.lens}: ${option.title}`).join("; ");
  const risks = unique(selected.flatMap((option) => option.risks));
  const nextMoves = selected.map((option) => `- ${option.nextMove}`).join("\n");
  const memoryUsed = uniqueById(selected.flatMap((option) => option.memoryUsed));
  const sourcesUsed = uniqueById(selected.flatMap((option) => option.sourcesUsed));
  const personalContext = formatPersonalContext(memoryUsed, sourcesUsed);
  const selectedHistory = formatSelectedOptionHistory(selected, userComment);
  const updatedSectionIds = new Set<string>();
  const nextSections = input.artifact.sections.map((section) => {
    const body = bodyForUpdatedSection({
      title: section.title,
      artifact: input.artifact,
      selected,
      selectedTitles,
      selectedLenses,
      userComment,
      risks,
      nextMoves,
      personalContext,
      selectedHistory,
    });

    if (body === section.body) {
      return section;
    }

    updatedSectionIds.add(section.id);
    return { ...section, body, status: "updated" as const };
  });
  const delta: ArtifactDelta = {
    id: stableId("artifact-delta", input.artifact.id, input.artifact.version + 1, selected.map((option) => option.id).join("|"), userComment),
    updatedSectionIds: [...updatedSectionIds],
    selectedOptionIds: selected.map((option) => option.id),
    summary: `Updated artifact toward ${selectedLenses}${input.userComment ? ` with comment: ${clipText(input.userComment, 180)}` : ""}.`,
    createdAt: input.now,
  };

  return {
    artifact: {
      ...input.artifact,
      version: input.artifact.version + 1,
      sections: nextSections,
      updatedAt: input.now,
    },
    delta,
  };
}

function bodyForUpdatedSection(input: {
  title: ArtifactSectionTitle;
  artifact: CodingPromptArtifact;
  selected: CandidateOption[];
  selectedTitles: string;
  selectedLenses: string;
  userComment: string;
  risks: string[];
  nextMoves: string;
  personalContext: string;
  selectedHistory: string;
}): string {
  const section = sectionByTitle(input.artifact, input.title);
  const rawIdea = input.artifact.rawIdea;

  switch (input.title) {
    case "Product goal":
      return `Build the Create kernel for: ${rawIdea}\n\nSelected direction mix: ${input.selectedTitles}.`;
    case "User intent":
      return [
        `Rough idea: ${rawIdea}`,
        "",
        `User judgment/comment: ${input.userComment}`,
        "",
        `Inferred priority: ${input.selectedLenses}.`,
        "",
        "Personal context used:",
        input.personalContext,
        "",
        "Selected option history:",
        input.selectedHistory,
      ].join("\n");
    case "Target user":
      return `${section.body}\n\nRefine target user around the selected lenses: ${input.selectedLenses}.`;
    case "Core loop":
      return "User enters a rough idea -> Penny shows Personal, Practical, Valuable, Critical, Weird -> user multi-selects and comments -> Penny records JudgmentEvent -> artifact updates -> verification summarizes readiness -> export produces a coding-agent prompt.";
    case "UX requirements":
      return `Compact Create UI requirements:\n- Rough idea input remains visible.\n- Exactly five cards are shown: Personal, Practical, Valuable, Critical, Weird.\n- Cards support multi-select.\n- Comment textarea influences artifact updates.\n- Artifact and verification panels update on the same screen.\n- Export button returns a Codex/Claude Code/Cursor-ready prompt.\n\nSelected UX pressure: ${input.selected.map((option) => option.oneLine).join(" ")}`;
    case "Frontend requirements":
      return "Use React/Vite, brainClient, existing mode shell, and newsprint styles. Keep Create accessible from current navigation while preserving Brain and Learn behavior.";
    case "Backend requirements":
      return "Add POST /api/create/next for option generation, judgment capture, artifact update, and verification. Add POST /api/create/export-coding-prompt for clean prompt export. Keep auth/session/tenant headers compatible with brainClient.";
    case "Data model":
      return "Use CandidateOption, OptionSet, JudgmentEvent, CodingPromptArtifact, ArtifactSection, ArtifactDelta, VerificationSummary, MemoryRef, SourceRef, and PromptExport. JudgmentEvent must include projectId, sessionId, optionSetId, selectedOptionIds, userComment, inferredSignals, artifactDelta, and createdAt.";
    case "AI/memory orchestration":
      return `V0 may use deterministic generation, but the contract must be model-replaceable. Only cite memoryUsed and sourcesUsed that are actually supplied by Penny context or the rough idea. Do not fake durable memory.\n\nPersonal context used in this artifact:\n${input.personalContext}\n\nSelected option history:\n${input.selectedHistory}`;
    case "Privacy constraints":
      return "Keep v0 deterministic and local unless a provider is explicitly wired. Preserve provenance arrays so exported prompts do not contain unsupported source claims.";
    case "Verification constraints":
      return `Verification must cover intent match, buildability, source/context grounding, non-generic/not-GPT-wrapper risk, missing info, and risks. Current selected risks: ${input.risks.join(" ") || "No selected-card risks."}`;
    case "Implementation plan":
      return `Implementation sequence:\n${input.nextMoves}\n- Wire the compact UI through the existing Create workspace.\n- Add focused tests for option generation, judgment, artifact update, verification, and export.\n- Run build, typecheck, and tests.`;
    case "Acceptance tests":
      return "Acceptance tests: Create is accessible; rough idea input works; five named cards render; multi-select and comment create a JudgmentEvent; artifact updates onscreen; verification appears; export returns a usable prompt; Brain and Learn still work; build/typecheck/tests pass.";
    case "Do-not-break list":
      return "Do not break Brain, Create, Learn, session recovery, current auth/session/tenant headers, canvas node actions, or the editorial/newsprint visual language.";
    case "Final coding-agent prompt":
      return clipText(
        buildPromptText({ ...input.artifact, sections: input.artifact.sections.filter((item) => item.title !== "Final coding-agent prompt") }),
        12_000,
      );
  }
}

function verifyArtifact(
  artifact: CodingPromptArtifact,
  optionSet: OptionSet,
  judgmentEvent: JudgmentEvent | null,
): VerificationSummary {
  const promptText = buildPromptText(artifact);
  const fullText = `${artifact.sections.map((section) => section.body).join("\n")}\n${promptText}`.toLowerCase();
  const ideaWords = importantWords(artifact.rawIdea);
  const intentHits = ideaWords.filter((word) => fullText.includes(word)).length;
  const selectedCount = judgmentEvent?.selectedOptionIds.length ?? 0;
  const missingInfo = missingInfoForArtifact(artifact, selectedCount);
  const selectedRisks = judgmentEvent
    ? optionSet.options.filter((option) => judgmentEvent.selectedOptionIds.includes(option.id)).flatMap((option) => option.risks)
    : optionSet.options.flatMap((option) => option.risks).slice(0, 2);
  const qualitySignals = promptExportQualitySignals(promptText);
  const personalOption = optionSet.options.find((option) => option.lens === "Personal") ?? null;
  const hasMemoryEvidence = optionSet.memoryUsed.length
    ? optionSet.memoryUsed.some((memory) => fullText.includes(memory.label.toLowerCase()) || fullText.includes(clipText(memory.summary, 48).toLowerCase()))
    : /no imported penny memories|no durable penny memory/i.test(fullText);
  const buildableSectionCount = ["Frontend requirements", "Backend requirements", "Data model", "Implementation plan", "Acceptance tests"].filter((title) =>
    hasSections(artifact, [title as ArtifactSectionTitle]),
  ).length;
  const nonGenericSignals = [
    /\bmemory\b/i.test(fullText),
    /\bjudgmentevent|selected option history|multi-select judgment\b/i.test(fullText),
    /\bnot-gpt-wrapper|generic gpt-wrapper|generic wrapper\b/i.test(fullText),
    /\bsource\b/i.test(fullText),
  ].filter(Boolean).length;
  const autonomySignals = [
    /\buser judgment|user comment|multi-select|selected option history\b/i.test(fullText),
    /\bask the user|user can|user enters|user multi-selects\b/i.test(fullText),
    !/\bmust accept|auto-approve|silently choose\b/i.test(fullText),
  ].filter(Boolean).length;
  const fakeClaimDetected = hasFakeProvenanceClaim(promptText);
  const scores = {
    intentMatch: ideaWords.length ? Math.round((intentHits / ideaWords.length) * 100) : 80,
    personalMemoryGrounding: optionSet.memoryUsed.length
      ? hasMemoryEvidence && (personalOption?.memoryUsed.length ?? 0) > 0
        ? 92
        : 48
      : hasMemoryEvidence
        ? 78
        : 45,
    buildability: Math.min(100, 20 + buildableSectionCount * 16),
    nonGenericness: Math.min(100, 30 + nonGenericSignals * 17),
    userAutonomyPreserved: Math.min(100, 40 + autonomySignals * 18),
    fakeClaimRisk: fakeClaimDetected ? 20 : 95,
    promptCompleteness: qualitySignals.promptCompletenessScore,
  };
  const checks: VerificationSummary["checks"] = [
    {
      key: "intent_match",
      label: "Intent match",
      status: statusForScore(scores.intentMatch),
      score: scores.intentMatch,
      summary: intentHits ? `Artifact keeps ${intentHits} rough-idea signal(s) visible.` : "Artifact needs more direct language from the rough idea.",
    },
    {
      key: "personal_memory_grounding",
      label: "Personal memory grounding",
      status: statusForScore(scores.personalMemoryGrounding),
      score: scores.personalMemoryGrounding,
      summary: optionSet.memoryUsed.length
        ? `Uses ${optionSet.memoryUsed.length} supplied or retrieved memory ref(s), including the Personal lens evidence.`
        : "No durable memory was available, and the prompt says so instead of implying hidden context.",
    },
    {
      key: "buildability",
      label: "Buildability",
      status: statusForScore(scores.buildability),
      score: scores.buildability,
      summary: "Prompt names frontend, backend, data, implementation, and test work.",
    },
    {
      key: "non_genericness",
      label: "Non-genericness",
      status: statusForScore(scores.nonGenericness),
      score: scores.nonGenericness,
      summary: "Checks for memory-native behavior, recorded judgment, and explicit wrapper risk.",
    },
    {
      key: "user_autonomy_preserved",
      label: "User autonomy preserved",
      status: statusForScore(scores.userAutonomyPreserved),
      score: scores.userAutonomyPreserved,
      summary: "The flow keeps user selection, comments, and judgment visible before export.",
    },
    {
      key: "fake_claim_risk",
      label: "Fake claim risk",
      status: statusForScore(scores.fakeClaimRisk),
      score: scores.fakeClaimRisk,
      summary: fakeClaimDetected ? "Prompt contains an unsupported positive connector, source, or hidden-memory claim." : "No unsupported positive connector, source, or hidden-memory claim detected.",
    },
    {
      key: "prompt_completeness",
      label: "Prompt completeness",
      status: statusForScore(scores.promptCompleteness),
      score: scores.promptCompleteness,
      summary: qualitySignals.missing.length ? `Missing export sections: ${qualitySignals.missing.join(", ")}.` : "Prompt export includes the required implementation sections.",
    },
  ];
  const verdict = checks.some((check) => check.status === "fail") || checks.filter((check) => check.status === "warn").length > 2 || missingInfo.length > 2
    ? "needs_revision"
    : "ready";

  return {
    id: stableId("verification", artifact.id, artifact.version, checks.map((check) => `${check.key}:${check.status}`).join("|")),
    artifactId: artifact.id,
    createdAt: isoNow(),
    verdict,
    scores,
    checks,
    missingInfo,
    risks: unique(selectedRisks),
  };
}

function buildPromptText(artifact: CodingPromptArtifact): string {
  const section = (title: ArtifactSectionTitle) => sectionByTitle(artifact, title).body;
  const userIntent = section("User intent");
  const personalContext = extractNamedBlock(userIntent, "Personal context used") || extractNamedBlock(section("AI/memory orchestration"), "Personal context used in this artifact") || section("AI/memory orchestration");
  const selectedHistory = extractNamedBlock(userIntent, "Selected option history") || "No selected Create directions were exported.";
  const rejectedDirectionText = formatRepeatedRejectedDirectionsForPrompt(personalContext);

  return [
    `# ${artifact.title}`,
    "",
    "## Product Goal",
    section("Product goal"),
    "",
    "## Rough User Idea",
    artifact.rawIdea,
    "",
    "## Non-Goals",
    buildNonGoalsText(artifact),
    "",
    "## User Intent",
    mainUserIntent(userIntent),
    "",
    "## YC Demo Spec",
    buildYcDemoSpecText(artifact, personalContext, selectedHistory, rejectedDirectionText),
    "",
    "## Personal Context Used",
    personalContext,
    "",
    "## Source / Memory Evidence",
    personalContext,
    "",
    "## Selected Option History",
    selectedHistory,
    "",
    "## Repeated Rejected Directions",
    rejectedDirectionText,
    "",
    "## Target User",
    section("Target user"),
    "",
    "## Core Loop",
    section("Core loop"),
    "",
    "## UX Requirements",
    section("UX requirements"),
    "",
    "## Frontend Requirements",
    section("Frontend requirements"),
    "",
    "## Backend Requirements",
    section("Backend requirements"),
    "",
    "## Data Model",
    section("Data model"),
    "",
    "## AI / Memory Orchestration",
    section("AI/memory orchestration"),
    "",
    "## Privacy Constraints",
    section("Privacy constraints"),
    "",
    "## Verification Constraints",
    section("Verification constraints"),
    "",
    "## Implementation Sequence",
    section("Implementation plan"),
    "",
    "## Acceptance Tests",
    section("Acceptance tests"),
    "",
    "## Do-Not-Break List",
    section("Do-not-break list"),
    "",
    "## Definition of Done",
    "Create is accessible; rough idea -> five directions -> multi-select judgment/comment -> JudgmentEvent -> updated CodingPromptArtifact -> VerificationSummary -> exported prompt works end to end; Brain and Learn remain intact; build, typecheck, and tests pass.",
  ].join("\n");
}

function buildYcDemoSpecText(
  artifact: CodingPromptArtifact,
  personalContext: string,
  selectedHistory: string,
  rejectedDirectionText: string,
): string {
  const section = (title: ArtifactSectionTitle): string => sectionByTitle(artifact, title).body;

  return [
    "### Product thesis",
    clipText(`${section("Product goal")} ${selectedHistory}`, 1_400),
    "",
    "### Target user",
    section("Target user"),
    "",
    "### Problem",
    "Founders and builders reach coding agents with vague ideas before the thinking has become explicit enough to implement.",
    "",
    "### Why now",
    "Coding agents make building faster, so the bottleneck moves upstream to context, assumptions, judgment, and spec quality.",
    "",
    "### Core loop",
    clipText(section("Core loop"), 1_200),
    "",
    "### Memory layer",
    clipText(section("AI/memory orchestration"), 1_400),
    "",
    "### Create mode",
    clipText(section("UX requirements"), 1_200),
    "",
    "### Learn bridge",
    "Brain Ranker weights explicit judgment events over implicit behavior. Learn should explain simply, show a worked example, and apply the concept back to this artifact.",
    "",
    "### Data sources",
    clipText(personalContext, 1_400),
    "",
    "### Moat",
    "Reusable memory, explicit human judgment, and rejected-direction history make Penny more than a generic prompt or chatbot wrapper.",
    "",
    "### Risks",
    clipText(`${section("Verification constraints")}\n\n${rejectedDirectionText}`, 1_400),
    "",
    "### MVP scope",
    clipText(`${section("Implementation plan")}\n\n${section("Do-not-break list")}`, 1_400),
    "",
    "### Demo script",
    "Start Create -> safe fixture synthesis -> evidence drawer -> Personal + Valuable + Critical judgment -> artifact -> Learn this -> Back to Create -> Canvas -> Export.",
    "",
    "### Build prompt/export",
    "Export this artifact as the copyable coding-agent prompt/spec that follows in the remaining sections.",
  ].join("\n");
}

function promptExportQualitySignals(text: string): PromptExportQualitySignals {
  const signals = {
    hasRoughIdea: hasPromptSection(text, "Rough User Idea"),
    hasSelectedOptionHistory: hasPromptSection(text, "Selected Option History"),
    hasRelevantPersonalContext: hasPromptSection(text, "Personal Context Used"),
    hasRepeatedRejectedDirections: hasPromptSection(text, "Repeated Rejected Directions"),
    hasProductGoal: hasPromptSection(text, "Product Goal"),
    hasNonGoals: hasPromptSection(text, "Non-Goals"),
    hasUxRequirements: hasPromptSection(text, "UX Requirements"),
    hasFrontendRequirements: hasPromptSection(text, "Frontend Requirements"),
    hasBackendRequirements: hasPromptSection(text, "Backend Requirements"),
    hasDataModel: hasPromptSection(text, "Data Model"),
    hasPrivacyConstraints: hasPromptSection(text, "Privacy Constraints"),
    hasVerificationRequirements: hasPromptSection(text, "Verification Constraints"),
    hasImplementationSequence: hasPromptSection(text, "Implementation Sequence"),
    hasAcceptanceTests: hasPromptSection(text, "Acceptance Tests"),
    hasDoNotBreakList: hasPromptSection(text, "Do-Not-Break List"),
  };
  const labels: Array<[keyof typeof signals, string]> = [
    ["hasRoughIdea", "rough idea"],
    ["hasSelectedOptionHistory", "selected option history"],
    ["hasRelevantPersonalContext", "relevant personal context"],
    ["hasRepeatedRejectedDirections", "repeated rejected directions"],
    ["hasProductGoal", "product goal"],
    ["hasNonGoals", "non-goals"],
    ["hasUxRequirements", "UX requirements"],
    ["hasFrontendRequirements", "frontend requirements"],
    ["hasBackendRequirements", "backend requirements"],
    ["hasDataModel", "data model"],
    ["hasPrivacyConstraints", "privacy constraints"],
    ["hasVerificationRequirements", "verification requirements"],
    ["hasImplementationSequence", "implementation sequence"],
    ["hasAcceptanceTests", "acceptance tests"],
    ["hasDoNotBreakList", "do-not-break list"],
  ];
  const missing = labels.filter(([key]) => !signals[key]).map(([, label]) => label);

  return {
    ...signals,
    promptCompletenessScore: Math.round(((labels.length - missing.length) / labels.length) * 100),
    missing,
  };
}

function hasPromptSection(text: string, title: string): boolean {
  return promptSectionText(text, title).trim().length > 0;
}

function promptSectionText(text: string, title: string): string {
  const marker = `## ${title}`;
  const start = text.indexOf(marker);

  if (start < 0) {
    return "";
  }

  const rest = text.slice(start + marker.length).trim();
  const next = rest.search(/\n##\s/u);

  return next >= 0 ? rest.slice(0, next).trim() : rest.trim();
}

function buildNonGoalsText(_artifact: CodingPromptArtifact): string {
  return [
    "- Do not build broad OAuth connectors, Gmail/LinkedIn/WhatsApp/SMS/iMessage/Slack ingestion, or background global memory import for this Create slice.",
    "- Do not turn Create into a generic chatbot sidebar; every AI output must feed the typed option, judgment, artifact, verification, and export loop.",
    "- Do not invent source, memory, connector, or global-training claims. Use only rough idea, session context, and provided Brain refs.",
    "- Do not redesign Brain, Learn, navigation, or unrelated data models while implementing the requested Create flow.",
  ].join("\n");
}

function repeatedRejectedDirections(memoryUsed: MemoryRef[]): string[] {
  return memoryUsed
    .filter((memory) => isRejectedDirectionText(`${memory.label} ${memory.summary}`))
    .map((memory) => `${memory.label}: ${clipText(memory.summary, 180)}`)
    .slice(0, 6);
}

function formatRepeatedRejectedDirectionsForPrompt(personalContext: string): string {
  const lines = personalContext
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => isRejectedDirectionText(line));

  return lines.length ? unique(lines).map((line) => (line.startsWith("-") ? line : `- ${line}`)).join("\n") : "- None supplied.";
}

function isRejectedDirectionText(text: string): boolean {
  return /\b(rejected direction|reject|rejected|avoid|do not|don't|not a generic|no generic|skip|fake|wrapper)\b/i.test(text);
}

function formatPersonalContext(memoryUsed: MemoryRef[], sourcesUsed: SourceRef[]): string {
  const memoryLines = memoryUsed.length
    ? memoryUsed.map((memory) => `- ${memory.label}: ${clipText(memory.summary, 260)}`)
    : ["- No imported Penny memories matched this Create request."];
  const sourceLines = sourcesUsed.length
    ? sourcesUsed.map((source) => {
        const range = source.sourceRange ? ` (${source.sourceRange})` : "";
        return `- ${source.label}${range}: ${clipText(source.excerpt, 260)}`;
      })
    : ["- No source references beyond the rough idea were supplied."];

  return ["Memories:", ...memoryLines, "", "Sources:", ...sourceLines].join("\n");
}

function formatSelectedOptionHistory(selected: CandidateOption[], userComment: string): string {
  const optionLines = selected.length
    ? selected.map((option) => `- ${option.lens}: ${option.title}. Next move: ${option.nextMove}`)
    : ["- No selected Create directions yet."];
  const comment = userComment === "No additional comment supplied." ? "No user comment supplied." : userComment;

  return [...optionLines, `User comment: ${comment}`].join("\n");
}

function mainUserIntent(body: string): string {
  const index = body.indexOf("\n\nPersonal context used:");

  return (index >= 0 ? body.slice(0, index) : body).trim();
}

function extractNamedBlock(body: string, label: string): string {
  const marker = `${label}:`;
  const start = body.indexOf(marker);

  if (start < 0) {
    return "";
  }

  const rest = body.slice(start + marker.length).trim();
  const nextSection = ["Personal context used:", "Personal context used in this artifact:", "Selected option history:"]
    .filter((boundary) => boundary !== marker)
    .map((boundary) => rest.indexOf(`\n\n${boundary}`))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? -1;

  return (nextSection >= 0 ? rest.slice(0, nextSection) : rest).trim();
}

function sectionMap(bodies: Record<ArtifactSectionTitle, string>): ArtifactSection[] {
  return artifactSectionTitles.map((title) => ({
    id: stableId("artifact-section", title),
    title,
    body: bodies[title],
    status: "draft",
  }));
}

function sectionByTitle(artifact: CodingPromptArtifact, title: ArtifactSectionTitle): ArtifactSection {
  return artifact.sections.find((section) => section.title === title) ?? { id: stableId("artifact-section", title), title, body: "", status: "needs_input" };
}

function normalizeMemoryRefs(memory: MemoryRef[], context: z.infer<typeof CreateContextSchema> | undefined, sessionId: string): MemoryRef[] {
  const refs = [...memory];

  if (context?.summary || context?.activeClaim || context?.sessionTitle) {
    refs.unshift({
      id: stableId("memory-session", sessionId, context.summary ?? context.activeClaim ?? context.sessionTitle ?? "session"),
      label: context.sessionTitle || "Current Penny session",
      kind: "session",
      summary: clipText([context.summary, context.activeClaim].filter(Boolean).join(" ") || "Current session context was supplied by Penny.", 1_200),
    });
  }

  return uniqueById(refs).slice(0, 12);
}

function normalizeSourceRefs(sources: SourceRef[], context: z.infer<typeof CreateContextSchema> | undefined, rawIdea: string): SourceRef[] {
  const refs: SourceRef[] = [
    {
      id: stableId("source-rough-idea", rawIdea),
      label: "Rough idea",
      kind: "rough_idea",
      excerpt: clipText(rawIdea, 1_200),
    },
    ...sources,
  ];

  if (context?.sourceText) {
    refs.push({
      id: stableId("source-session", context.sourceText),
      label: "Session/source context",
      kind: "session",
      excerpt: clipText(context.sourceText, 1_200),
    });
  }

  return uniqueById(refs).slice(0, 12);
}

function inferSignals(options: CandidateOption[], comment: string): string[] {
  const signals = options.map((option) => `selected_${option.lens.toLowerCase()}`);
  const lower = comment.toLowerCase();

  if (/ship|build|mvp|small|quick/.test(lower)) {
    signals.push("buildability_priority");
  }

  if (/weird|surprising|novel|creative/.test(lower)) {
    signals.push("novelty_priority");
  }

  if (/risk|verify|critique|proof|source/.test(lower)) {
    signals.push("verification_priority");
  }

  if (/user|customer|valuable|market/.test(lower)) {
    signals.push("external_value_priority");
  }

  return unique(signals.length ? signals : ["artifact_update_requested"]);
}

function missingInfoForArtifact(artifact: CodingPromptArtifact, selectedCount: number): string[] {
  const missing: string[] = [];
  const target = sectionByTitle(artifact, "Target user").body;

  if (!selectedCount) {
    missing.push("No direction has been selected yet.");
  }

  if (/skeptical judge|keep this explicit/i.test(target)) {
    missing.push("Target user may need narrowing.");
  }

  if (!sectionByTitle(artifact, "Acceptance tests").body.trim()) {
    missing.push("Acceptance tests are missing.");
  }

  return missing;
}

function hasSections(artifact: CodingPromptArtifact, titles: ArtifactSectionTitle[]): boolean {
  return titles.every((title) => sectionByTitle(artifact, title).body.trim().length > 20);
}

function statusForScore(score: number): CreateCheckStatus {
  if (score >= 80) {
    return "pass";
  }

  return score >= 55 ? "warn" : "fail";
}

function sourceTextFromCreateInput(input: {
  rawIdea?: string | undefined;
  roughIdea?: string | undefined;
  idea?: string | undefined;
  artifact?: CodingPromptArtifact | undefined;
}): string {
  return input.rawIdea?.trim() || input.roughIdea?.trim() || input.idea?.trim() || input.artifact?.rawIdea?.trim() || "";
}

function scopeFromRequest(request: Request): BrainScope {
  return scopeValues({
    userId: firstPresentHeader(request, ["x-user-id", "x-penny-user-id"]) ?? null,
    workspaceId: firstPresentHeader(request, ["x-workspace-id", "x-penny-workspace-id"]) ?? null,
    projectId: firstPresentHeader(request, ["x-project-id", "x-penny-project-id"]) ?? null,
    sphereId: firstPresentHeader(request, ["x-sphere-id", "x-penny-sphere-id"]) ?? null,
  });
}

function createScopeStorageKey(scope: BrainScope, id: string): string {
  return [scope.userId, scope.workspaceId, scope.projectId, scope.sphereId, id]
    .map((value) => value ?? "null")
    .join("\u001f");
}

function createRuntimeKind(): "dev-test" | "production" {
  return process.env.NODE_ENV === "production" ? "production" : "dev-test";
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
    return { ok: false, response: jsonResponse({ error: { code: "invalid_json", message: bodyResult.message } }, 400) };
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
            issues: parsed.error.issues.map((issue) => `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`),
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
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return { ok: false, message: `Request body is not valid JSON: ${formatErrorMessage(error)}` };
  }
}

function methodNotAllowed(message: string, allow: string): Response {
  return jsonResponse({ error: { code: "method_not_allowed", message } }, 405, { Allow: allow });
}

function createErrorResponse(error: unknown): Response {
  if (error instanceof CreateRouteValidationError) {
    return jsonResponse({ error: { code: "create_invalid", message: error.message } }, 400);
  }

  return jsonResponse({ error: { code: "create_failed", message: formatErrorMessage(error) } }, 500);
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

function stableId(prefix: string, ...parts: Array<string | number | null | undefined>): string {
  const digest = createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("\u001f"))
    .digest("hex")
    .slice(0, 16);

  return `${prefix}-${digest}`;
}

function importantWords(text: string): string[] {
  return unique(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 4 && !["should", "could", "would", "there", "their", "about", "rough", "idea"].includes(word))
      .slice(0, 10),
  );
}

function subjectFromText(text: string): string {
  const lower = text.toLowerCase();

  if (/\byc\b/.test(lower) && /\b(ideation|thinking|thinking instrument|workbench)\b/.test(lower)) {
    return /\bpenny\b/.test(lower) ? "Penny's YC ideation workbench" : "YC ideation workbench";
  }

  const clean = titleFromText(text).replace(/[^\w\s-]/g, "").trim();
  return clean.split(/\s+/).filter(Boolean).slice(0, 10).join(" ") || "this product";
}

function subjectForTitle(subject: string): string {
  return /^(a|an|the|this|penny's)\b/i.test(subject) ? subject : `the ${subject}`;
}

function titleFromText(text: string): string {
  const sentence = text
    .trim()
    .split(/(?<=[.!?])\s+/u)[0]
    ?.replace(/\s+/g, " ")
    .trim();

  return clipText(sentence || "Untitled Create project", 120);
}

function audienceFromText(text: string): string {
  const lower = text.toLowerCase();

  if (/\b(founder|startup|pitch|investor|yc)\b/.test(lower)) {
    return "Founders and startup teams";
  }

  if (/\b(coder|developer|engineer|codex|claude|cursor|code)\b/.test(lower)) {
    return "Builders using coding agents";
  }

  if (/\b(writer|essay|article|creator|creative)\b/.test(lower)) {
    return "Creative makers";
  }

  if (/\b(team|product|roadmap|pm|design)\b/.test(lower)) {
    return "Product teams";
  }

  return "A specific user segment to be narrowed by the next judgment";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "create-prompt";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    if (seen.has(value.id)) {
      continue;
    }

    seen.add(value.id);
    result.push(value);
  }

  return result;
}

function clipText(text: string, maxLength: number): string {
  const clean = text.replace(/\s+/g, " ").trim();

  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
