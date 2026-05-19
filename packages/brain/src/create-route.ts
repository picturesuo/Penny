import { createHash } from "node:crypto";
import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { retrieveBrainMemoryForCreate } from "./brain-memory-route.ts";
import { scopeValues, type BrainScope } from "./scope.ts";

export type CreateLens = "Personal" | "Practical" | "Valuable" | "Critical" | "Weird";
export type CreateCheckStatus = "pass" | "warn" | "fail";

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

export type OptionSet = {
  id: string;
  projectId: string;
  sessionId: string;
  sourceOfTruth: "rough_idea_context_deterministic_create_lenses" | "rough_idea_context_model_backed_create_lenses";
  rawIdea: string;
  options: CandidateOption[];
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
  checks: Array<{
    key: "intent_match" | "buildability" | "source_context_grounding" | "non_generic" | "missing_info" | "risks";
    label: string;
    status: CreateCheckStatus;
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
  createdAt: string;
};

export type CreateNextInput = z.infer<typeof CreateNextBodySchema>;
export type ExportCodingPromptInput = z.infer<typeof ExportCodingPromptBodySchema>;

export type CreateNextResult = {
  sourceOfTruth: "create_options_judgments_artifacts_verification";
  optionSet: OptionSet;
  artifact: CodingPromptArtifact;
  verification: VerificationSummary;
  judgmentEvent: JudgmentEvent | null;
  exportReady: boolean;
};

export type CreateRouteService = {
  next(input: CreateNextInput, request: Request): Promise<CreateNextResult>;
  exportCodingPrompt(input: ExportCodingPromptInput, request: Request): Promise<{ export: PromptExport }>;
};

export type CreateRouteOptions = {
  service?: CreateRouteService;
};

export type CreateOptionGenerationInput = {
  rawIdea: string;
  memoryUsed: MemoryRef[];
  sourcesUsed: SourceRef[];
  contextLight: boolean;
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

const defaultCreateRouteService = createInMemoryCreateRouteService();

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
    return jsonResponse({ data: await service.next(parsed.data, request) });
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
    return jsonResponse({ data: await service.exportCodingPrompt(parsed.data, request) });
  } catch (error) {
    return createErrorResponse(error);
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

  return {
    async next(input, request) {
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
      const existingOptionSet = input.optionSetId ? optionSets.get(input.optionSetId) ?? null : null;
      const optionSet =
        existingOptionSet ??
        (await buildOptionSetWithProvider({
          projectId,
          sessionId,
          rawIdea,
          memoryUsed,
          sourcesUsed,
          contextLight: retrievedMemory.contextLight && input.memory.length === 0,
          now,
          provider: optionProvider,
        }));
      const priorArtifact = input.artifact ?? artifacts.get(sessionId) ?? null;
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
        judgments.set(sessionId, [...(judgments.get(sessionId) ?? []), judgmentEvent]);
      }

      artifact = {
        ...artifact,
        sourceOptionSetIds: unique([...artifact.sourceOptionSetIds, optionSet.id]),
        sections: artifact.sections.map((section) =>
          section.title === "Final coding-agent prompt"
            ? {
                ...section,
                body: buildPromptText(artifact),
                status: artifact.version > 1 ? "updated" : section.status,
              }
            : section,
        ),
      };

      optionSets.set(optionSet.id, optionSet);
      artifacts.set(sessionId, artifact);
      const verification = verifyArtifact(artifact, optionSet, judgmentEvent);

      return {
        sourceOfTruth: "create_options_judgments_artifacts_verification",
        optionSet,
        artifact,
        verification,
        judgmentEvent,
        exportReady: verification.verdict === "ready",
      };
    },

    async exportCodingPrompt(input) {
      const artifact = input.artifact;
      const createdAt = isoNow();
      const text = buildPromptText(artifact);

      return {
        export: {
          id: stableId("prompt-export", artifact.id, artifact.version, text),
          artifactId: artifact.id,
          format: "coding_agent_prompt",
          targets: ["Codex", "Claude Code", "Cursor"],
          text,
          fileName: `${slugify(artifact.title)}-coding-prompt.md`,
          createdAt,
        },
      };
    },
  };
}

async function buildOptionSetWithProvider(input: {
  projectId: string;
  sessionId: string;
  rawIdea: string;
  memoryUsed: MemoryRef[];
  sourcesUsed: SourceRef[];
  contextLight: boolean;
  now: string;
  provider: CreateOptionProvider | null;
}): Promise<OptionSet> {
  const baseline = buildOptionSet(input);

  if (!input.provider) {
    return baseline;
  }

  try {
    const output = await input.provider.generateOptions({
      rawIdea: input.rawIdea,
      memoryUsed: input.memoryUsed,
      sourcesUsed: input.sourcesUsed,
      contextLight: input.contextLight,
      baselineOptions: baseline.options,
    });

    return optionSetFromProviderOutput(baseline, output);
  } catch {
    return baseline;
  }
}

function buildOptionSet(input: {
  projectId: string;
  sessionId: string;
  rawIdea: string;
  memoryUsed: MemoryRef[];
  sourcesUsed: SourceRef[];
  contextLight: boolean;
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
  const options: CandidateOption[] = [
    {
      id: stableId("create-option-personal", optionSeed),
      lens: "Personal",
      title: profile.hasMemory
        ? `Make ${subject.toLowerCase()} honor ${profile.personalAnchor}`
        : `Make ${subject.toLowerCase()} feel personally steered`,
      oneLine: profile.hasMemory
        ? `Center the first loop on this remembered signal: ${profile.personalEvidence}.`
        : "Center the workflow on the rough idea and visibly mark that no durable Brain memory was used.",
      rationale: profile.hasMemory
        ? `${profile.groundedLine} Inferred move: shape Create around the user's own taste, active projects, and constraints instead of a blank prompt box.`
        : `${contextPhrase} The personal direction should ask for more private context before implying Penny knows the user.`,
      nextMove: profile.hasMemory
        ? `Pin ${profile.personalAnchor} as a visible constraint before generating or revising the artifact.`
        : "Ask the user which personal constraints Penny should preserve before generating or revising the artifact.",
      risks: ["Can overfit to weak or missing memory if the UI implies more context than Penny actually has."],
      memoryUsed: profile.personalMemory,
      sourcesUsed: sourceRefs,
      scores: { intentMatch: 91, buildability: 74, value: 82, novelty: 78, risk: 42 },
    },
    {
      id: stableId("create-option-practical", optionSeed),
      lens: "Practical",
      title: `Ship the smallest usable ${subject.toLowerCase()} loop`,
      oneLine: `Prioritize the first buildable path in the user's preferred style: ${profile.buildStyleEvidence}.`,
      rationale: `${contextPhrase} This is the safest wedge because it makes the core loop testable without waiting for broad memory ingestion or advanced models. Practical constraint: ${profile.buildStyleEvidence}.`,
      nextMove: `Implement the narrow route and UI state machine, then verify the ${profile.buildStyleAnchor} path manually and with tests.`,
      risks: ["May feel conservative if the artifact does not visibly improve after user judgment."],
      memoryUsed: profile.practicalMemory,
      sourcesUsed: sourceRefs,
      scores: { intentMatch: 88, buildability: 94, value: 78, novelty: 58, risk: 28 },
    },
    {
      id: stableId("create-option-valuable", optionSeed),
      lens: "Valuable",
      title: profile.hasMemory ? `Make value obvious for ${profile.valueAnchor}` : `Make ${audience.toLowerCase()} value obvious`,
      oneLine: `Shape the artifact around the decision that gets easier: ${profile.valueEvidence}.`,
      rationale: profile.hasMemory
        ? `${profile.groundedLine} Inferred move: translate that memory into a target user, external payoff, and acceptance tests that prove usefulness.`
        : `${contextPhrase} The valuable direction forces the prompt artifact to name a real user, external payoff, and acceptance tests that prove usefulness.`,
      nextMove: `Rewrite the target user, core loop, and acceptance tests around ${profile.valueAnchor}.`,
      risks: ["Can drift into pitch language unless implementation constraints stay concrete."],
      memoryUsed: profile.valuableMemory,
      sourcesUsed: sourceRefs,
      scores: { intentMatch: 86, buildability: 78, value: 94, novelty: 64, risk: 36 },
    },
    {
      id: stableId("create-option-critical", optionSeed),
      lens: "Critical",
      title: `De-bullshit the ${subject.toLowerCase()} promise`,
      oneLine: profile.hasMemory
        ? `Pressure-test generic GPT-wrapper risk against the user's remembered rejection: ${profile.criticalEvidence}.`
        : "Pressure-test whether the idea is truly memory-native or just a GPT wrapper with nicer furniture.",
      rationale: `${contextPhrase} Friendly critique: the idea gets stronger if it names what Penny records, how judgment changes the artifact, and what must not be faked. Treat generic GPT-wrapper behavior, fake connector claims, and unsupported memory claims as export blockers.`,
      nextMove: `Add explicit verification checks for source grounding, non-generic behavior, missing information, and ${profile.criticalAnchor} before export is allowed.`,
      risks: ["If the critique dominates the UI, Create may feel punitive instead of generative.", "A generic wrapper can still pass if memory evidence is attached but never changes the artifact."],
      memoryUsed: profile.criticalMemory,
      sourcesUsed: sourceRefs,
      scores: { intentMatch: 89, buildability: 82, value: 86, novelty: 70, risk: 52 },
    },
    {
      id: stableId("create-option-weird", optionSeed),
      lens: "Weird",
      title: profile.hasMemory
        ? `Make ${subject.toLowerCase()} weird in the user's own direction`
        : `Turn ${subject.toLowerCase()} into a creative instrument`,
      oneLine: `Use the unusual but still useful edge in the context: ${profile.weirdEvidence}.`,
      rationale: profile.hasMemory
        ? `${profile.groundedLine} Inferred move: bend the artifact through that taste signal while still producing implementation requirements and tests.`
        : `${contextPhrase} The weird direction keeps Penny from becoming a dashboard: selected lenses should leave visible traces in the prompt and verification brief.`,
      nextMove: `Give each selected card a distinct artifact mutation inspired by ${profile.weirdAnchor}, while keeping the coding prompt executable.`,
      risks: ["Could become decorative unless every weird move still updates the coding prompt."],
      memoryUsed: profile.weirdMemory,
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
    memoryUsed: memoryRefs,
    sourcesUsed: sourceRefs,
    createdAt: input.now,
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
    "Do not invent Gmail, Slack, messages, OAuth, connector, global-training, hidden-memory, or external-source claims.",
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
  return /\b(gmail|slack|messages?|oauth|global training|shared training|trained on your data|hidden memory|background import)\b/i.test(text);
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
      "Selected option history:",
      "- No selected Create directions yet.",
    ].join("\n"),
    "Target user": `${audience}. Keep this explicit until the user narrows it further.`,
    "Core loop": "Rough idea -> five Create directions -> multi-select judgment plus comment -> incremental artifact update -> verification -> coding-agent prompt export.",
    "UX requirements": "Keep the flow compact: one rough idea input, five cards, multi-select, comment box, artifact panel, verification summary, and export button.",
    "Frontend requirements": "Use the existing React/Vite workspace and preserve the editorial/newsprint style. Reuse current mode shell and client conventions.",
    "Backend requirements": "Expose deterministic POST /api/create/next and POST /api/create/export-coding-prompt routes with strict local validation and replaceable generation logic.",
    "Data model": "Represent CandidateOption, OptionSet, JudgmentEvent, CodingPromptArtifact, ArtifactSection, ArtifactDelta, VerificationSummary, MemoryRef, SourceRef, and PromptExport.",
    "AI/memory orchestration": `Use available Penny memory/source/session context only when provided. Do not imply hidden memory. Store judgment as a durable signal for later model-backed generation.\n\nPersonal context available now:\n${personalContext}`,
    "Privacy constraints": "Do not send data to a model in v0 placeholder mode. Keep source and memory references explicit so the UI never claims provenance it lacks.",
    "Verification constraints": "Check intent match, buildability, source/context grounding, non-generic GPT-wrapper risk, missing information, and implementation risks.",
    "Implementation plan": "1. Add contracts and route handlers. 2. Add client methods. 3. Render Create flow through the Check workspace wrapper. 4. Add focused tests. 5. Run build, typecheck, and tests.",
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
      return `Implementation sequence:\n${input.nextMoves}\n- Wire the compact UI through the existing Check workspace wrapper renamed as Create in copy.\n- Add focused tests for option generation, judgment, artifact update, verification, and export.\n- Run build, typecheck, and tests.`;
    case "Acceptance tests":
      return "Acceptance tests: Create is accessible; rough idea input works; five named cards render; multi-select and comment create a JudgmentEvent; artifact updates onscreen; verification appears; export returns a usable prompt; Brain and Learn still work; build/typecheck/tests pass.";
    case "Do-not-break list":
      return "Do not break Brain, Learn, session recovery, current auth/session/tenant headers, canvas node actions, existing Check backend routes, or the editorial/newsprint visual language.";
    case "Final coding-agent prompt":
      return buildPromptText({ ...input.artifact, sections: input.artifact.sections.filter((item) => item.title !== "Final coding-agent prompt") });
  }
}

function verifyArtifact(
  artifact: CodingPromptArtifact,
  optionSet: OptionSet,
  judgmentEvent: JudgmentEvent | null,
): VerificationSummary {
  const fullText = artifact.sections.map((section) => section.body).join("\n").toLowerCase();
  const ideaWords = importantWords(artifact.rawIdea);
  const intentHits = ideaWords.filter((word) => fullText.includes(word)).length;
  const selectedCount = judgmentEvent?.selectedOptionIds.length ?? 0;
  const missingInfo = missingInfoForArtifact(artifact, selectedCount);
  const selectedRisks = judgmentEvent
    ? optionSet.options.filter((option) => judgmentEvent.selectedOptionIds.includes(option.id)).flatMap((option) => option.risks)
    : optionSet.options.flatMap((option) => option.risks).slice(0, 2);
  const checks: VerificationSummary["checks"] = [
    {
      key: "intent_match",
      label: "Intent match",
      status: intentHits >= Math.min(3, ideaWords.length) ? "pass" : "warn",
      summary: intentHits ? `Artifact keeps ${intentHits} rough-idea signal(s) visible.` : "Artifact needs more direct language from the rough idea.",
    },
    {
      key: "buildability",
      label: "Buildability",
      status: hasSections(artifact, ["Frontend requirements", "Backend requirements", "Data model", "Implementation plan", "Acceptance tests"]) ? "pass" : "fail",
      summary: "Prompt names frontend, backend, data, implementation, and test work.",
    },
    {
      key: "source_context_grounding",
      label: "Source/context grounding",
      status: optionSet.sourcesUsed.length ? "pass" : "warn",
      summary: optionSet.sourcesUsed.length
        ? `Grounded in ${optionSet.sourcesUsed.map((source) => source.label).join(", ")}.`
        : "Only unreferenced context is available; add sources or session context when possible.",
    },
    {
      key: "non_generic",
      label: "Not a GPT wrapper",
      status: fullText.includes("memory") && fullText.includes("judgmentevent") && fullText.includes("not-gpt-wrapper") ? "pass" : "warn",
      summary: "Checks for memory-native behavior, recorded judgment, and explicit wrapper risk.",
    },
    {
      key: "missing_info",
      label: "Missing info",
      status: missingInfo.length <= 1 ? "pass" : "warn",
      summary: missingInfo.length ? missingInfo.join(" ") : "No blocking missing info found for v0.",
    },
    {
      key: "risks",
      label: "Risks",
      status: selectedRisks.length <= 4 ? "pass" : "warn",
      summary: selectedRisks.length ? selectedRisks.join(" ") : "No material risks surfaced yet.",
    },
  ];
  const verdict = checks.some((check) => check.status === "fail") || checks.filter((check) => check.status === "warn").length > 2
    ? "needs_revision"
    : "ready";

  return {
    id: stableId("verification", artifact.id, artifact.version, checks.map((check) => `${check.key}:${check.status}`).join("|")),
    artifactId: artifact.id,
    createdAt: isoNow(),
    verdict,
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
    "## Personal Context Used",
    personalContext,
    "",
    "## Source / Memory Evidence",
    personalContext,
    "",
    "## Selected Option History",
    selectedHistory,
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

function buildNonGoalsText(_artifact: CodingPromptArtifact): string {
  return [
    "- Do not build broad OAuth connectors, Gmail/Slack/messages ingestion, or background global memory import for this Create slice.",
    "- Do not turn Create into a generic chatbot sidebar; every AI output must feed the typed option, judgment, artifact, verification, and export loop.",
    "- Do not invent source, memory, connector, or global-training claims. Use only rough idea, session context, and provided Brain refs.",
    "- Do not redesign Brain, Learn, navigation, or unrelated data models while implementing the requested Create flow.",
  ].join("\n");
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
  const clean = titleFromText(text).replace(/[^\w\s-]/g, "").trim();
  return clean.split(/\s+/).filter(Boolean).slice(0, 10).join(" ") || "this product";
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
