import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import { afterMoveEffectsInTransaction } from "./after-move-effects.ts";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainRuns, claimEdges, claimVersions, claims } from "./db/schema.ts";
import { requireRecordedBrainRun, type BrainRunGuardOptions } from "./brain-run-guard.ts";
import { formatLensSnapshot, loadLensSnapshot, type LensSnapshot } from "./lens-snapshot.ts";
import { createMove } from "./move-payloads.ts";
import { flattenIssues } from "./schema.ts";
import { scopeValues } from "./scope.ts";
import { CandidateBrainObjectSchema } from "./candidate-brain-object.ts";
import {
  formatHybridRetrievalContext,
  loadHybridRetrievalContext,
  type HybridRetrievalContext,
} from "./hybrid-retrieval.ts";
import { createSearchBroker } from "./search-broker.ts";
import { shouldUseWebSearch } from "./search-decision-service.ts";

export const LearnSuggestedNextMoveSchema = z
  .object({
    action: z.enum(["learn", "check", "verify", "save_to_brain"]),
    label: z.string().trim().min(1).max(120),
    reason: z.string().trim().min(1).max(320),
  })
  .strict();

const LegacyInlineLearnFieldsSchema = z.object({
  term: z.string(),
  explanation: z.string(),
  whyItMattersHere: z.string(),
  example: z.string(),
  relatedConcepts: z.array(z.string()),
  saveSuggestion: z.string(),
});

export const InlineLearnRequestSchema = z
  .object({
    term: z.string().trim().min(1).max(120),
    currentClaimId: z.string().uuid(),
    sessionId: z.string().uuid(),
    localContext: z.string().trim().min(1).max(2_000),
    save: z.boolean().optional().default(false),
  })
  .strict();

export const InlineLearnProviderSchema = z
  .object({
    ...LegacyInlineLearnFieldsSchema.shape,
    coreIdea: z.string().optional(),
    claims: z.array(z.string()).optional(),
    assumptions: z.array(z.string()).optional(),
    questions: z.array(z.string()).optional(),
    misconceptionsGaps: z.array(z.string()).optional(),
    creativeDirections: z.array(z.string()).optional(),
    suggestedNextMove: LearnSuggestedNextMoveSchema.optional(),
    candidateBrainObjects: z.array(CandidateBrainObjectSchema).optional(),
  })
  .strict();

export const LearnOutputSchema = z
  .object({
    term: z.string().trim().min(1).max(120),
    explanation: z.string().trim().min(1).max(360),
    whyItMattersHere: z.string().trim().min(1).max(360),
    example: z.string().trim().min(1).max(320),
    relatedConcepts: z.array(z.string().trim().min(1).max(80)).max(5),
    saveSuggestion: z.string().trim().min(1).max(220),
    coreIdea: z.string().trim().min(1).max(360),
    claims: z.array(z.string().trim().min(1).max(240)).max(5),
    assumptions: z.array(z.string().trim().min(1).max(240)).max(5),
    questions: z.array(z.string().trim().min(1).max(240)).max(5),
    misconceptionsGaps: z.array(z.string().trim().min(1).max(240)).max(5),
    creativeDirections: z.array(z.string().trim().min(1).max(240)).max(5),
    suggestedNextMove: LearnSuggestedNextMoveSchema,
    candidateBrainObjects: z.array(CandidateBrainObjectSchema).max(5),
  })
  .strict();

export const InlineLearnOutputSchema = LearnOutputSchema;

export const InlineLearnSaveRequestSchema = InlineLearnProviderSchema.extend({
  currentClaimId: z.string().uuid(),
  sessionId: z.string().uuid(),
}).strict();

export const AskPennyRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(1_000),
    currentStepTitle: z.string().trim().min(1).max(160),
    localContext: z.string().trim().min(1).max(4_000),
  })
  .strict();

export const AskPennyOutputSchema = z
  .object({
    answer: z.string().trim().min(1).max(2_000),
    provider: z.enum(["anthropic", "xai", "heuristic"]),
    model: z.string().trim().min(1).max(120).nullable(),
  })
  .strict();

export type InlineLearnRequest = z.infer<typeof InlineLearnRequestSchema>;
export type InlineLearnSaveRequest = z.infer<typeof InlineLearnSaveRequestSchema>;
export type InlineLearnProviderOutput = z.infer<typeof InlineLearnProviderSchema>;
export type LearnOutput = z.infer<typeof LearnOutputSchema>;
export type InlineLearnOutput = LearnOutput;
export type AskPennyRequest = z.infer<typeof AskPennyRequestSchema>;
export type AskPennyOutput = z.infer<typeof AskPennyOutputSchema>;

export type InlineLearnGenerationInput = {
  term: string;
  currentClaimId: string;
  sessionId: string;
  localContext: string;
  currentClaimText: string;
  currentClaimKind: "belief" | "assumption" | "question" | "concept";
  lensSnapshot?: LensSnapshot;
  retrievalContext?: HybridRetrievalContext;
};

export type InlineLearnProvider = {
  name: string;
  generate(input: InlineLearnGenerationInput): Promise<unknown>;
};

export type AskPennyProvider = {
  name: AskPennyOutput["provider"];
  model: string | null;
  generate(input: AskPennyRequest): Promise<AskPennyOutput>;
};

const inlineLearnOutputSpec = Output.object<InlineLearnProviderOutput>({
  schema: InlineLearnProviderSchema,
  name: "penny_inline_learn",
  description: "A contextual Learn output with structured thinking fields and candidate BrainObject suggestions.",
});

export type InlineLearnGenerateText = (request: {
  model: LanguageModel;
  system: string;
  prompt: string;
  output: typeof inlineLearnOutputSpec;
  maxRetries: number;
  tools?: ToolSet;
  providerOptions: {
    xai: {
      store: false;
    };
  };
}) => Promise<{ output: unknown }>;

export const defaultXaiInlineLearnModel = "grok-4.20-reasoning";

export type PersistedInlineLearn = InlineLearnOutput & {
  brainRun: {
    id: string;
    status: string;
  };
  saved?: {
    conceptClaim: PersistedClaimSlice;
    teachesEdge: PersistedTeachesEdge;
    move: PersistedMoveSlice;
  };
};

export type InlineLearnRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  provider?: InlineLearnProvider;
  learnInline?: (
    input: InlineLearnRequest,
    options: { db?: PennyDatabase; provider: InlineLearnProvider },
  ) => Promise<PersistedInlineLearn>;
};

export type AskPennyRouteOptions = {
  provider?: AskPennyProvider;
  askPenny?: (input: AskPennyRequest, options: { provider: AskPennyProvider }) => Promise<AskPennyOutput>;
};

export type InlineLearnSaveRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  saveInlineLearn?: (
    input: InlineLearnSaveRequest,
    options: { db?: PennyDatabase },
  ) => Promise<NonNullable<PersistedInlineLearn["saved"]>>;
};

type PersistedClaimSlice = {
  id: string;
  versionId: string;
  kind: "concept";
  status: "exploratory" | "committed" | "resolved" | "rejected";
  text: string;
  confidence: number;
};

type PersistedTeachesEdge = {
  id: string;
  fromClaimId: string;
  toClaimId: string;
  kind: "teaches";
  status: "active" | "acknowledged_vulnerability";
  label: string | null;
};

type PersistedMoveSlice = {
  id: string;
  kind: "learning_triggered";
  summary: string;
  claimIds: string[];
  edgeIds: string[];
  artifactIds: string[];
};

type InlineLearnPrelude = {
  target: Awaited<ReturnType<typeof loadClaimWithCurrentVersion>>;
  brainRun: typeof brainRuns.$inferSelect;
  lensSnapshot: LensSnapshot;
  retrievalContext: HybridRetrievalContext;
};

export async function handleInlineLearnRequest(
  request: Request,
  options: InlineLearnRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /brain/learn/inline requires the POST method.");
  }

  const parsed = await parseJsonRequest(request, InlineLearnRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const provider = options.provider ?? createDefaultInlineLearnProvider();
  const db = resolveInlineLearnDb(options, Boolean(options.learnInline));
  const learnInline =
    options.learnInline ??
    ((input: InlineLearnRequest, learnOptions: { db?: PennyDatabase; provider: InlineLearnProvider }) =>
      runInlineLearn(requireInlineLearnDb(learnOptions.db), input, { provider: learnOptions.provider }));

  try {
    return jsonResponse({ data: await learnInline(parsed.data, { ...dbOption(db), provider }) }, parsed.data.save ? 201 : 200);
  } catch (error) {
    return inlineLearnErrorResponse(error);
  }
}

export async function handleInlineLearnSaveRequest(
  request: Request,
  options: InlineLearnSaveRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /brain/learn/inline/save requires the POST method.");
  }

  const parsed = await parseJsonRequest(request, InlineLearnSaveRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const db = resolveInlineLearnDb(options, Boolean(options.saveInlineLearn));
  const saveInlineLearn =
    options.saveInlineLearn ??
    ((input: InlineLearnSaveRequest, saveOptions: { db?: PennyDatabase }) =>
      persistInlineLearnConcept(requireInlineLearnDb(saveOptions.db), input));

  try {
    return jsonResponse({ data: { saved: await saveInlineLearn(parsed.data, dbOption(db)) } }, 201);
  } catch (error) {
    return inlineLearnErrorResponse(error);
  }
}

export async function handleAskPennyRequest(
  request: Request,
  options: AskPennyRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /brain/learn/ask requires the POST method.");
  }

  const parsed = await parseJsonRequest(request, AskPennyRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const provider = options.provider ?? createDefaultAskPennyProvider();
  const askPenny =
    options.askPenny ??
    ((input: AskPennyRequest, askOptions: { provider: AskPennyProvider }) => askOptions.provider.generate(input));
  const immediateAnswer = simpleDirectAskPennyAnswer(parsed.data.question);

  if (immediateAnswer) {
    return jsonResponse({
      data: AskPennyOutputSchema.parse({
        answer: immediateAnswer,
        provider: "heuristic",
        model: null,
      }),
    }, 200);
  }

  try {
    const output = AskPennyOutputSchema.parse(await askPenny(parsed.data, { provider }));

    if (isAskPennyScaffoldAnswer(output.answer)) {
      return jsonResponse({ data: AskPennyOutputSchema.parse(await createHeuristicAskPennyProvider().generate(parsed.data)) }, 200);
    }

    return jsonResponse({ data: output }, 200);
  } catch (error) {
    if (error instanceof InlineLearnProviderError) {
      return jsonResponse({ data: AskPennyOutputSchema.parse(await createHeuristicAskPennyProvider().generate(parsed.data)) }, 200);
    }

    return inlineLearnErrorResponse(error);
  }
}

export class InlineLearnNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InlineLearnNotFoundError";
  }
}

export class InlineLearnConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InlineLearnConflictError";
  }
}

export class InlineLearnGenerationError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "InlineLearnGenerationError";
  }
}

export class InlineLearnProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InlineLearnProviderError";
  }
}

export async function runInlineLearn(
  db: PennyDatabase,
  input: InlineLearnRequest,
  options: { provider?: InlineLearnProvider } = {},
): Promise<PersistedInlineLearn> {
  const provider = options.provider ?? createDefaultInlineLearnProvider();
  const prelude = await createInlineLearnPrelude(db, input, provider);

  try {
    const output = await generateInlineLearnOutput(
      learnGenerationInput(prelude.target, input, prelude.lensSnapshot, prelude.retrievalContext),
      {
        provider,
        brainRunId: prelude.brainRun.id,
      },
    );

    if (input.save) {
      const saved = await persistSavedInlineLearn(db, input, output, prelude);

      return {
        ...output,
        brainRun: saved.brainRun,
        saved: saved.saved,
      };
    }

    const completedBrainRun = await completeInlineLearnRun(db, prelude, output);

    return {
      ...output,
      brainRun: {
        id: completedBrainRun.id,
        status: completedBrainRun.status,
      },
    };
  } catch (error) {
    await markInlineLearnRunFailed(db, prelude.brainRun.id, error);
    throw error;
  }
}

export async function generateInlineLearnOutput(
  input: InlineLearnGenerationInput,
  options: { provider?: InlineLearnProvider } & BrainRunGuardOptions = {},
): Promise<InlineLearnOutput> {
  requireRecordedBrainRun("brain.learn.inline", options);

  const provider = options.provider ?? createDefaultInlineLearnProvider();
  const providerOutput = await provider.generate(input);

  return parseInlineLearnOutput(providerOutput, input);
}

export function parseInlineLearnOutput(output: unknown, input?: Partial<InlineLearnGenerationInput>): InlineLearnOutput {
  const providerParsed = InlineLearnProviderSchema.safeParse(output);

  if (!providerParsed.success) {
    throw new InlineLearnGenerationError(
      "Learn provider output failed validation.",
      flattenIssues(providerParsed.error),
    );
  }

  const strictParsed = InlineLearnOutputSchema.safeParse(normalizeLearnOutput(providerParsed.data, input));

  if (!strictParsed.success) {
    throw new InlineLearnGenerationError(
      "Learn output failed strict validation.",
      flattenIssues(strictParsed.error),
    );
  }

  return strictParsed.data;
}

export function createDefaultInlineLearnProvider(
  env: Record<string, string | undefined> = process.env,
): InlineLearnProvider {
  if (env.XAI_API_KEY?.trim()) {
    return createXaiInlineLearnProvider(env);
  }

  return createHeuristicInlineLearnProvider();
}

export function createDefaultAskPennyProvider(env: Record<string, string | undefined> = process.env): AskPennyProvider {
  if (env.ANTHROPIC_API_KEY?.trim()) {
    return createAnthropicAskPennyProvider(env);
  }

  if (env.XAI_API_KEY?.trim()) {
    return createXaiAskPennyProvider(env);
  }

  return createHeuristicAskPennyProvider();
}

export function createHeuristicAskPennyProvider(): AskPennyProvider {
  return {
    name: "heuristic",
    model: null,
    async generate(input) {
      return {
        answer: heuristicAskPennyAnswer(input),
        provider: "heuristic",
        model: null,
      };
    },
  };
}

export function createHeuristicInlineLearnProvider(): InlineLearnProvider {
  return {
    name: "heuristic",
    async generate(input) {
      return buildHeuristicInlineLearnOutput(input);
    },
  };
}

export function createXaiInlineLearnProvider(
  env: Record<string, string | undefined> = process.env,
  options: { generateText?: InlineLearnGenerateText } = {},
): InlineLearnProvider {
  return {
    name: "xai",
    async generate(input) {
      const apiKey = env.XAI_API_KEY?.trim();

      if (!apiKey) {
        throw new InlineLearnProviderError("XAI_API_KEY is required for the xAI Learn provider.");
      }

      const xai = createXai(createXaiSettings(apiKey, env));
      const callGenerateText = options.generateText ?? generateStructuredInlineLearn;
      const searchBroker = createSearchBroker({
        providerName: "xai",
        webSearch: typeof xai.tools.webSearch === "function" ? xai.tools.webSearch : null,
      });
      const search = searchBroker.prepare(inlineLearnSearchInput(input), "learn", inlineLearnSearchContext(input));

      try {
        const request: Parameters<InlineLearnGenerateText>[0] = {
          model: xai.responses(resolveXaiInlineLearnModel(env)),
          system: buildInlineLearnSystemPrompt(),
          prompt: buildInlineLearnPrompt(input, search.instructions),
          output: inlineLearnOutputSpec,
          maxRetries: 1,
          providerOptions: {
            xai: {
              store: false,
            },
          },
        };

        if (search.tools) {
          request.tools = search.tools;
        }

        const result = await callGenerateText(request);

        return result.output;
      } catch (error) {
        if (error instanceof InlineLearnProviderError) {
          throw error;
        }

        throw new InlineLearnProviderError(`xAI Learn request failed: ${formatErrorMessage(error)}`);
      }
    },
  };
}

export function createXaiAskPennyProvider(
  env: Record<string, string | undefined> = process.env,
  options: { generateText?: typeof generateText } = {},
): AskPennyProvider {
  const model = resolveXaiAskPennyModel(env);

  return {
    name: "xai",
    model,
    async generate(input) {
      const apiKey = env.XAI_API_KEY?.trim();

      if (!apiKey) {
        throw new InlineLearnProviderError("XAI_API_KEY is required for the xAI Ask Penny provider.");
      }

      const xai = createXai(createXaiSettings(apiKey, env));
      const callGenerateText = options.generateText ?? generateText;

      try {
        const result = await callGenerateText({
          model: xai.responses(model),
          system: buildAskPennySystemPrompt(),
          prompt: buildAskPennyPrompt(input),
          maxRetries: 1,
          providerOptions: {
            xai: {
              store: false,
            },
          },
        });

        return AskPennyOutputSchema.parse({
          answer: result.text,
          provider: "xai",
          model,
        });
      } catch (error) {
        throw new InlineLearnProviderError(`xAI Ask Penny request failed: ${formatErrorMessage(error)}`);
      }
    },
  };
}

export function createAnthropicAskPennyProvider(
  env: Record<string, string | undefined> = process.env,
  options: { fetch?: typeof fetch } = {},
): AskPennyProvider {
  const model = resolveAnthropicAskPennyModel(env);

  return {
    name: "anthropic",
    model,
    async generate(input) {
      const apiKey = env.ANTHROPIC_API_KEY?.trim();

      if (!apiKey) {
        throw new InlineLearnProviderError("ANTHROPIC_API_KEY is required for the Anthropic Ask Penny provider.");
      }

      const callFetch = options.fetch ?? fetch;
      const response = await callFetch(`${env.ANTHROPIC_BASE_URL?.trim().replace(/\/+$/, "") || "https://api.anthropic.com"}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": env.ANTHROPIC_VERSION?.trim() || "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 700,
          system: buildAskPennySystemPrompt(),
          messages: [
            {
              role: "user",
              content: buildAskPennyPrompt(input),
            },
          ],
        }),
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new InlineLearnProviderError(`Anthropic Ask Penny request failed with ${response.status}: ${anthropicErrorMessage(payload)}`);
      }

      return AskPennyOutputSchema.parse({
        answer: anthropicText(payload),
        provider: "anthropic",
        model,
      });
    },
  };
}

export function resolveXaiInlineLearnModel(env: Record<string, string | undefined> = process.env): string {
  return env.XAI_INLINE_LEARN_MODEL?.trim() || env.XAI_MODEL?.trim() || defaultXaiInlineLearnModel;
}

export function resolveXaiAskPennyModel(env: Record<string, string | undefined> = process.env): string {
  return env.XAI_ASK_PENNY_MODEL?.trim() || env.XAI_INLINE_LEARN_MODEL?.trim() || env.XAI_MODEL?.trim() || defaultXaiInlineLearnModel;
}

export function resolveAnthropicAskPennyModel(env: Record<string, string | undefined> = process.env): string {
  return env.ANTHROPIC_ASK_PENNY_MODEL?.trim() || env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
}

export function buildAskPennySystemPrompt(): string {
  return [
    "You are Penny inside Learn Mode.",
    "Answer the user's question directly first. Do not rewrite the user's question into instructions.",
    "Use the current step and local lesson context only when it helps the answer.",
    "If the user asks a simple factual, arithmetic, or conversational question, answer it plainly before adding any lesson-specific note.",
    "Give the next useful step when the question is vague or conversational.",
    "Be concrete and brief. If the user asks for an example, give one compact example.",
    "Do not say you saved anything. Do not invent citations.",
    "Use plain text only. Do not mention prompts, boundaries, system messages, instructions, or what a useful answer would do.",
  ].join("\n");
}

export function buildAskPennyPrompt(input: AskPennyRequest): string {
  return [
    `Current step: ${input.currentStepTitle}`,
    `Local lesson context: ${input.localContext}`,
    `Question: ${input.question}`,
    "",
    "Answer the question itself. If it is answerable in one sentence, use one sentence.",
    "Answer in 1-3 short paragraphs or up to 3 bullets. Include only what the user needs to move forward.",
  ].join("\n\n");
}

export function buildInlineLearnSystemPrompt(): string {
  return [
    "You are Penny, a controllable thinking instrument enhanced by AI.",
    "Explain one confusing term inside the current Brain claim.",
    "Keep the explanation contextual, short, operational, and ready to become BrainObjects if the user saves it.",
    "Do not start a separate Learn app, lesson, sidebar, curriculum, or chat.",
    "Do not invent citations, market facts, or external evidence.",
    "Candidate BrainObjects are suggestions only; do not imply they have been saved.",
    "Return only the structured Learn object.",
  ].join("\n");
}

export function buildInlineLearnPrompt(input: InlineLearnGenerationInput, searchInstructions?: string): string {
  return [
    "Create a short contextual Learn explanation for this term.",
    "",
    "Return:",
    "- term: the exact term being explained.",
    "- explanation: one or two short sentences.",
    "- whyItMattersHere: why the term matters inside this claim.",
    "- example: one compact example tied to the local context.",
    "- relatedConcepts: up to five short concept names.",
    "- saveSuggestion: when the user should save this as a concept claim.",
    "- coreIdea: the central point Penny should remember.",
    "- claims: candidate claims that could become BrainObjects.",
    "- assumptions: hidden dependencies or load-bearing assumptions.",
    "- questions: follow-up questions this Learn pass opens.",
    "- misconceptionsGaps: likely misconceptions, missing distinctions, or gaps.",
    "- creativeDirections: useful new directions the user could explore.",
    "- suggestedNextMove: one action with action, label, and reason. Use action learn, check, verify, or save_to_brain.",
    "- candidateBrainObjects: unsaved candidates with objectType, title, summary, content, suggestedSaveReason, source, and refs.",
    "",
    "Lens rules:",
    "- Use confirmed shapes to choose framing and examples that fit this user's history.",
    "- Treat candidate shapes as tentative and do not label the user with them.",
    "- If the lens suggests concept grounding or evidence checking patterns, make the explanation more operational.",
    "- Use local Brain retrieval as memory context, not as external citation evidence.",
    "",
    searchInstructions ?? createSearchBroker().prepare(inlineLearnSearchInput(input), "learn", inlineLearnSearchContext(input)).instructions,
    "",
    `Term: ${input.term}`,
    `Current claim id: ${input.currentClaimId}`,
    `Current claim kind: ${input.currentClaimKind}`,
    `Current claim: ${input.currentClaimText}`,
    `Local context: ${input.localContext}`,
    formatHybridRetrievalContext(input.retrievalContext),
    `Lens snapshot JSON: ${formatLensSnapshot(input.lensSnapshot)}`,
  ].join("\n");
}

async function createInlineLearnPrelude(
  db: PennyDatabase,
  input: InlineLearnRequest,
  provider: InlineLearnProvider,
): Promise<InlineLearnPrelude> {
  return db.transaction(async (tx) => {
    const target = await loadClaimWithCurrentVersion(tx, input.currentClaimId, input.sessionId);
    const lensSnapshot = await loadLensSnapshot(tx, input.sessionId);
    const generationInputWithoutRetrieval = learnGenerationInput(target, input, lensSnapshot);
    const retrievalContext = await loadHybridRetrievalContext(tx, {
      mode: "learn",
      query: inlineLearnRetrievalQuery(generationInputWithoutRetrieval),
      sessionId: input.sessionId,
      currentClaimId: target.claim.id,
      projectId: target.claim.projectId,
      scope: target.claim,
      limit: 6,
    });
    const generationInput = {
      ...generationInputWithoutRetrieval,
      retrievalContext,
    };
    const searchDecision = shouldUseWebSearch(inlineLearnSearchInput(generationInput), "learn", inlineLearnSearchContext(generationInput));
    const [brainRun] = await tx
      .insert(brainRuns)
      .values({
        ...scopeValues(target.claim),
        sessionId: input.sessionId,
        sourceId: target.claim.sourceId,
        operation: "brain.learn.inline",
        provider: provider.name,
        model: provider.name === "xai" ? resolveXaiInlineLearnModel() : null,
        status: "running",
        input: {
          term: input.term,
          currentClaimId: input.currentClaimId,
          currentClaimVersionId: target.version.id,
          localContext: input.localContext,
          save: input.save,
          searchDecision,
          retrievalContext,
          lensSnapshot,
        },
      })
      .returning();

    if (!brainRun) {
      throw new InlineLearnConflictError("Failed to record Learn BrainRun.");
    }

    return { target, brainRun, lensSnapshot, retrievalContext };
  });
}

async function persistSavedInlineLearn(
  db: PennyDatabase,
  input: InlineLearnRequest,
  output: InlineLearnOutput,
  prelude: InlineLearnPrelude,
): Promise<{
  brainRun: {
    id: string;
    status: string;
  };
  saved: NonNullable<PersistedInlineLearn["saved"]>;
}> {
  return db.transaction(async (tx) => {
    const saved = await insertInlineLearnConcept(tx, input, output, prelude.target, prelude.brainRun.id);

    const [completedBrainRun] = await tx
      .update(brainRuns)
      .set({
        status: "succeeded",
        output,
        error: null,
        completedAt: new Date(),
      })
      .where(eq(brainRuns.id, prelude.brainRun.id))
      .returning();

    if (!completedBrainRun) {
      throw new InlineLearnConflictError("Failed to complete Learn BrainRun.");
    }

    return {
      brainRun: {
        id: completedBrainRun.id,
        status: completedBrainRun.status,
      },
      saved,
    };
  });
}

export async function persistInlineLearnConcept(
  db: PennyDatabase,
  input: InlineLearnSaveRequest,
): Promise<NonNullable<PersistedInlineLearn["saved"]>> {
  return db.transaction(async (tx) => {
    const target = await loadClaimWithCurrentVersion(tx, input.currentClaimId, input.sessionId);
    const output = normalizeLearnOutput(input, {
      term: input.term,
      currentClaimId: target.claim.id,
      sessionId: input.sessionId,
      localContext: target.version.content,
      currentClaimText: target.version.content,
      currentClaimKind: target.claim.kind,
    });

    return insertInlineLearnConcept(tx, input, output, target);
  });
}

type InlineLearnTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];

async function insertInlineLearnConcept(
  tx: InlineLearnTransaction,
  input: Pick<InlineLearnSaveRequest, "currentClaimId" | "sessionId">,
  output: InlineLearnOutput,
  target: Awaited<ReturnType<typeof loadClaimWithCurrentVersion>>,
  brainRunId?: string,
): Promise<NonNullable<PersistedInlineLearn["saved"]>> {
  const conceptClaimId = randomUUID();
  const conceptVersionId = randomUUID();
  const teachesEdgeId = randomUUID();
  const moveId = randomUUID();
  const conceptConfidence = 70;
  const [conceptClaim] = await tx
    .insert(claims)
    .values({
      id: conceptClaimId,
      ...scopeValues(target.claim),
      sessionId: input.sessionId,
      sourceId: target.claim.sourceId,
      kind: "concept",
    })
    .returning();

  if (!conceptClaim) {
    throw new InlineLearnConflictError("Failed to create inline concept claim.");
  }

  const [teachesEdge] = await tx
    .insert(claimEdges)
    .values({
      id: teachesEdgeId,
      ...scopeValues(target.claim),
      sessionId: input.sessionId,
      fromClaimId: conceptClaim.id,
      toClaimId: target.claim.id,
      kind: "teaches",
      status: "active",
      label: output.term,
    })
    .returning();

  if (!teachesEdge) {
    throw new InlineLearnConflictError("Failed to create inline teaches edge.");
  }

  const move = await createMove(tx, "learning_triggered", {
    id: moveId,
    sessionId: input.sessionId,
    scope: target.claim,
    summary: "Saved a Learn concept inside Brain.",
    payload: {
      term: output.term,
      currentClaimId: target.claim.id,
      currentClaimVersionId: target.version.id,
      conceptClaimId: conceptClaim.id,
      conceptClaimVersionId: conceptVersionId,
      teachesEdgeId: teachesEdge.id,
      ...(brainRunId ? { brainRunId } : {}),
      claimIds: [target.claim.id, conceptClaim.id],
      claimVersionIds: [target.version.id, conceptVersionId],
      edgeIds: [teachesEdge.id],
    },
  });

  const [conceptVersion] = await tx
    .insert(claimVersions)
    .values({
      id: conceptVersionId,
      claimId: conceptClaim.id,
      sourceId: target.claim.sourceId,
      brainRunId: brainRunId ?? null,
      moveId: move.id,
      content: conceptVersionContent(output),
      status: "exploratory",
      confidence: conceptConfidence,
      isCurrent: true,
    })
    .returning();

  if (!conceptVersion) {
    throw new InlineLearnConflictError("Failed to create inline concept ClaimVersion.");
  }

  await afterMoveEffectsInTransaction(tx, { sessionId: input.sessionId, moveId: move.id });

  return {
    conceptClaim: conceptClaimSlice(conceptClaim, conceptVersion),
    teachesEdge: teachesEdgeSlice(teachesEdge),
    move: {
      id: move.id,
      kind: "learning_triggered",
      summary: move.summary,
      claimIds: [target.claim.id, conceptClaim.id],
      edgeIds: [teachesEdge.id],
      artifactIds: [],
    },
  };
}

async function loadClaimWithCurrentVersion(tx: InlineLearnTransaction, claimId: string, sessionId: string) {
  const [claim] = await tx
    .select()
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.sessionId, sessionId)))
    .limit(1);

  if (!claim) {
    throw new InlineLearnNotFoundError("Current claim was not found in this session.");
  }

  const [version] = await tx
    .select()
    .from(claimVersions)
    .where(and(eq(claimVersions.claimId, claim.id), eq(claimVersions.isCurrent, true)))
    .orderBy(desc(claimVersions.createdAt))
    .limit(1);

  if (!version) {
    throw new InlineLearnConflictError("Current claim has no current ClaimVersion.");
  }

  return { claim, version };
}

function learnGenerationInput(
  target: Awaited<ReturnType<typeof loadClaimWithCurrentVersion>>,
  input: InlineLearnRequest,
  lensSnapshot: LensSnapshot,
  retrievalContext?: HybridRetrievalContext,
): InlineLearnGenerationInput {
  return {
    term: input.term,
    currentClaimId: target.claim.id,
    sessionId: input.sessionId,
    localContext: input.localContext,
    currentClaimText: target.version.content,
    currentClaimKind: target.claim.kind,
    lensSnapshot,
    ...(retrievalContext ? { retrievalContext } : {}),
  };
}

function inlineLearnRetrievalQuery(input: InlineLearnGenerationInput): string {
  return [input.term, input.currentClaimText, input.localContext].join("\n");
}

function inlineLearnSearchInput(input: InlineLearnGenerationInput) {
  return {
    query: `${input.term} ${input.currentClaimText}`,
    text: [input.term, input.currentClaimText, input.localContext].join("\n"),
    userRequest: input.localContext,
  };
}

function inlineLearnSearchContext(input: InlineLearnGenerationInput) {
  return {
    brainContext: [
      input.currentClaimText,
      input.localContext,
      formatHybridRetrievalContext(input.retrievalContext),
      formatLensSnapshot(input.lensSnapshot),
    ].join("\n"),
    brainContextSufficient: true,
  };
}

async function completeInlineLearnRun(
  db: PennyDatabase,
  prelude: InlineLearnPrelude,
  output: InlineLearnOutput,
): Promise<typeof brainRuns.$inferSelect> {
  return db.transaction(async (tx) => {
    const move = await createMove(tx, "learning_triggered", {
      sessionId: prelude.target.claim.sessionId,
      scope: prelude.target.claim,
      summary: "Asked Learn for a concept explanation.",
      payload: {
        term: output.term,
        currentClaimId: prelude.target.claim.id,
        currentClaimVersionId: prelude.target.version.id,
        brainRunId: prelude.brainRun.id,
        saved: false,
        claimIds: [prelude.target.claim.id],
        edgeIds: [],
      },
    });

    const [completedBrainRun] = await tx
      .update(brainRuns)
      .set({
        status: "succeeded",
        output,
        error: null,
        completedAt: new Date(),
      })
      .where(eq(brainRuns.id, prelude.brainRun.id))
      .returning();

    if (!completedBrainRun) {
      throw new InlineLearnConflictError("Failed to complete Learn BrainRun.");
    }

    await afterMoveEffectsInTransaction(tx, { sessionId: prelude.target.claim.sessionId, moveId: move.id });

    return completedBrainRun;
  });
}

async function markInlineLearnRunFailed(db: PennyDatabase, brainRunId: string, error: unknown): Promise<void> {
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

function buildHeuristicInlineLearnOutput(input: InlineLearnGenerationInput): InlineLearnOutput {
  const term = input.term.trim();
  const context = compactText(input.localContext || input.currentClaimText);
  const claim = compactText(input.currentClaimText);
  const concept = heuristicConceptFor(term);

  if (!concept) {
    throw new InlineLearnProviderError(
      `Learn fallback cannot safely teach "${term}" without xAI. Add XAI_API_KEY or save a supported concept.`,
    );
  }

  const parsed = InlineLearnOutputSchema.safeParse(
    normalizeLearnOutput(
      {
        term,
        explanation: concept.explanation,
        whyItMattersHere: conceptWhyItMatters(term, concept.pressure, claim),
        example: conceptExample(concept.example, context),
        relatedConcepts: relatedConceptsFor(term, context, concept.relatedConcepts),
        saveSuggestion: `Save ${term} if this definition will keep shaping assumptions, challenges, or the final brief.`,
      },
      input,
    ),
  );

  if (!parsed.success) {
    throw new InlineLearnConflictError("Generated Learn output failed local validation.");
  }

  return parsed.data;
}

function heuristicAskPennyAnswer(input: AskPennyRequest): string {
  const factualAnswer = simpleFactualAnswer(input.question);

  if (factualAnswer) {
    return factualAnswer;
  }

  const arithmeticAnswer = simpleArithmeticAnswer(input.question);

  if (arithmeticAnswer) {
    return arithmeticAnswer;
  }

  const shapedAnswer = shapedAskPennyAnswer(input);

  if (shapedAnswer) {
    return shapedAnswer;
  }

  const question = clipText(input.question, 220);
  const { goal, coreIdea } = askPennyContextParts(input.localContext);
  const step = clipText(input.currentStepTitle, 120);
  const focus = coreIdea ?? goal ?? contextBrief(input.localContext);

  return [
    `Next step: write one plain sentence for "${step}" that answers the question "${question}" from the lesson you are working on.`,
    `For this lesson, that sentence should stay focused on: ${focus}.`,
    "If the sentence still feels vague, add one specific example or source you could inspect next.",
  ].join("\n\n");
}

function shapedAskPennyAnswer(input: AskPennyRequest): string | null {
  const question = compactText(input.question);
  const compactQuestion = question.toLowerCase();
  const step = clipText(input.currentStepTitle, 120);
  const context = contextBrief(input.localContext);
  const definitionTerm = definitionQuestionTerm(question);
  const mechanismTerm = mechanismQuestionTerm(question);
  const tieTarget = tieInQuestionTarget(question);

  if (definitionTerm) {
    return [
      definitionAnswer(definitionTerm),
      `Here, connect it to ${context}.`,
      `A right-sized answer is a working definition plus one implication for "${step}".`,
    ].join("\n\n");
  }

  if (compactQuestion.includes("what does this mean") || compactQuestion.includes("what does it mean")) {
    return [
      `It means the current lesson is asking you to turn the idea into a usable distinction, not just recognize the words.`,
      `In context, focus on ${context}.`,
      `For "${step}", write the meaning in one sentence and add one example that would prove you understand it.`,
    ].join("\n\n");
  }

  if (mechanismTerm) {
    return [
      mechanismAnswer(mechanismTerm),
      `In this lesson, use ${context} as the case.`,
      `Trace it as: input -> mechanism -> observable result. Keep the answer to that chain unless a source check is needed.`,
    ].join("\n\n");
  }

  if (compactQuestion.includes("how does this work") || compactQuestion.includes("how does it work")) {
    return [
      `This works by turning the lesson context into a small reasoning loop: name the goal, isolate the key concept, apply it to the current case, then check the result.`,
      `For "${step}", the immediate job is to explain how ${context} changes what you should believe or do next.`,
    ].join("\n\n");
  }

  if (tieTarget) {
    return [
      tieInAnswer(tieTarget),
      `Use ${context} as the bridge: name the shared concept, say what changes, then state why ${tieTarget} now matters.`,
      `Keep it tight: one connection, one consequence, one next question.`,
    ].join("\n\n");
  }

  return null;
}

function definitionAnswer(term: string): string {
  const compactTerm = term.toLowerCase();

  if (compactTerm.includes("founder evidence")) {
    return "Founder evidence means concrete proof that a founder can notice a real problem, build or learn quickly, and turn that insight into action. It is stronger than adjectives like smart or driven because the reader can inspect what happened.";
  }

  if (compactTerm.includes("investor interest")) {
    return "Investor interest means outside people may see promise, but it is secondary evidence. It helps only when it points back to a stronger signal: user demand, founder insight, progress, or unusual execution.";
  }

  if (compactTerm.includes("yc evaluation")) {
    return "YC evaluation means reading an application for evidence that the team can become unusually effective during the batch. The useful signals are founder quality, problem insight, speed, clarity, and proof of progress.";
  }

  return `${capitalizeFirst(term)} means the concrete concept or signal you need to define well enough to use, test, or explain back. Do not leave it as a label; say what would count as evidence for it.`;
}

function mechanismAnswer(term: string): string {
  const compactTerm = term.toLowerCase();

  if (compactTerm.includes("yc")) {
    return "YC evaluation works by converting a short application into signals about team quality, problem insight, speed, and evidence of progress. Strong answers make those signals inspectable instead of asking the reader to trust broad claims.";
  }

  return `${capitalizeFirst(term)} works by separating the goal, the moving parts, and the signal that tells you whether it is working. Explain the input, the mechanism that changes it, and the observable result.`;
}

function tieInAnswer(target: string): string {
  const compactTarget = target.toLowerCase();

  if (compactTarget.includes("investor interest")) {
    return "It ties into investor interest by putting that interest in the right role: support signal, not main proof. The application should still show why the founders, problem, and progress are strong on their own.";
  }

  return `It ties into ${target} by showing what role the current lesson plays in that bigger frame.`;
}

function definitionQuestionTerm(question: string): string | null {
  const match = question.match(/^(?:what\s+(?:does|do|is)\s+)(.+?)(?:\s+mean|\?)\??$/i);
  const term = match?.[1]?.replace(/^["']|["']$/g, "").trim();

  if (!term || ["this", "it", "that"].includes(term.toLowerCase())) {
    return null;
  }

  return clipText(term, 80);
}

function mechanismQuestionTerm(question: string): string | null {
  const match = question.match(/^how\s+does\s+(.+?)\s+work\??$/i);
  const term = match?.[1]?.replace(/^["']|["']$/g, "").trim();

  if (!term || ["this", "it", "that"].includes(term.toLowerCase())) {
    return null;
  }

  return clipText(term, 80);
}

function tieInQuestionTarget(question: string): string | null {
  const match = question.match(/(?:tie|connect|relate)s?\s+(?:in\s+)?(?:with|to|into|back\s+to)\s+(.+?)\??$/i);
  const target = match?.[1]?.replace(/^["']|["']$/g, "").trim();

  return target ? clipText(target, 90) : null;
}

function contextBrief(localContext: string): string {
  const coreIdea = localContext.match(/Core idea:\s*([^.\n]+(?:\.[^.\n]+)?)/i)?.[1];
  const goal = localContext.match(/Goal:\s*([^.\n]+(?:\.[^.\n]+)?)/i)?.[1];
  const currentStep = localContext.match(/Current step:\s*([^.\n]+)/i)?.[1];
  const selected = coreIdea ?? goal ?? currentStep ?? localContext;

  return clipText(selected, 220);
}

function askPennyContextParts(localContext: string): { goal: string | null; coreIdea: string | null } {
  const goal = localContext.match(/Goal:\s*(.*?)(?:\s+Current step:|\s+Core idea:|$)/i)?.[1];
  const coreIdea = localContext.match(/Core idea:\s*(.*?)(?:\s+Keep the end state tied to:|$)/i)?.[1];

  return {
    goal: goal ? clipText(goal, 180) : null,
    coreIdea: coreIdea ? clipText(coreIdea, 220) : null,
  };
}

function capitalizeFirst(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function simpleFactualAnswer(question: string): string | null {
  const compact = question.trim().toLowerCase();

  if (/why\s+is\s+the\s+sky\s+blue\??/.test(compact)) {
    return "The sky looks blue because air molecules scatter shorter blue wavelengths of sunlight more than longer red wavelengths. That scattered blue light reaches your eyes from across the sky.";
  }

  return null;
}

function simpleDirectAskPennyAnswer(question: string): string | null {
  return simpleArithmeticAnswer(question) ?? simpleFactualAnswer(question);
}

function isAskPennyScaffoldAnswer(answer: string): boolean {
  const compact = answer.replace(/\s+/g, " ").trim().toLowerCase();

  return [
    "a useful way to answer",
    "use the lesson context as the boundary",
    "current lesson context as the boundary",
    "answer from the current lesson context",
    "keep it inside the current step",
    "then state one concrete implication",
    "the immediate job is to",
  ].some((phrase) => compact.includes(phrase));
}

function simpleArithmeticAnswer(question: string): string | null {
  const compact = question.trim().toLowerCase();
  const multiply = compact.match(/^what(?:'s| is)?\s+(-?\d+(?:\.\d+)?)\s*(?:x|\*|times|multiplied by)\s*(-?\d+(?:\.\d+)?)\??$/);

  if (!multiply) {
    return null;
  }

  const left = Number(multiply[1]);
  const right = Number(multiply[2]);

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return null;
  }

  return `${multiply[1]} x ${multiply[2]} = ${formatArithmeticNumber(left * right)}.`;
}

function formatArithmeticNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
}

function normalizeLearnOutput(output: InlineLearnProviderOutput, input?: Partial<InlineLearnGenerationInput>): InlineLearnOutput {
  const term = clipText(output.term, 120);
  const explanation = clipText(output.explanation, 360);
  const whyItMattersHere = clipText(output.whyItMattersHere, 360);
  const example = clipText(output.example, 320);
  const relatedConcepts = normalizedList(output.relatedConcepts, ["assumption", "evidence"], 5, 80);
  const saveSuggestion = clipText(output.saveSuggestion, 220);
  const coreIdea = clipText(output.coreIdea || `${term}: ${explanation}`, 360);
  const claims = normalizedList(
    output.claims,
    [`${term} changes the current claim because ${lowercaseFirst(whyItMattersHere)}`],
    5,
    240,
  );
  const assumptions = normalizedList(
    output.assumptions,
    [`The current claim depends on whether "${term}" works in this specific context.`],
    5,
    240,
  );
  const questions = normalizedList(
    output.questions,
    [`What evidence would show that "${term}" is helping or hurting this claim?`],
    5,
    240,
  );
  const misconceptionsGaps = normalizedList(
    output.misconceptionsGaps,
    [`Do not treat "${term}" as a generic definition; test the local mechanism.`],
    5,
    240,
  );
  const creativeDirections = normalizedList(
    output.creativeDirections,
    [`Turn "${term}" into a concrete test, example, or artifact inside Brain.`],
    5,
    240,
  );
  const suggestedNextMove = output.suggestedNextMove ?? {
    action: "save_to_brain" as const,
    label: "Save Learn output to Brain",
    reason: saveSuggestion,
  };
  const candidateBrainObjects =
    output.candidateBrainObjects?.length ? output.candidateBrainObjects : [learnCandidateBrainObject({
      term,
      explanation,
      whyItMattersHere,
      example,
      relatedConcepts,
      saveSuggestion,
      coreIdea,
      claims,
      assumptions,
      questions,
      misconceptionsGaps,
      creativeDirections,
      suggestedNextMove,
    }, input)];

  return {
    term,
    explanation,
    whyItMattersHere,
    example,
    relatedConcepts,
    saveSuggestion,
    coreIdea,
    claims,
    assumptions,
    questions,
    misconceptionsGaps,
    creativeDirections,
    suggestedNextMove,
    candidateBrainObjects: candidateBrainObjects.slice(0, 5),
  };
}

function learnCandidateBrainObject(output: Omit<InlineLearnOutput, "candidateBrainObjects">, input?: Partial<InlineLearnGenerationInput>) {
  return {
    objectType: "learn_output",
    title: `Learn: ${clipText(output.term, 120)}`,
    summary: output.coreIdea,
    content: learnOutputContent(output),
    suggestedSaveReason: output.saveSuggestion,
    source: "learn" as const,
    refs: {
      ...(input?.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input?.currentClaimId ? { currentClaimId: input.currentClaimId } : {}),
      term: output.term,
    },
  };
}

function learnOutputContent(output: Omit<InlineLearnOutput, "candidateBrainObjects">): string {
  return [
    output.coreIdea,
    "",
    `Explanation: ${output.explanation}`,
    `Why here: ${output.whyItMattersHere}`,
    `Example: ${output.example}`,
    `Claims: ${output.claims.join("; ")}`,
    `Assumptions: ${output.assumptions.join("; ")}`,
    `Questions: ${output.questions.join("; ")}`,
    `Gaps: ${output.misconceptionsGaps.join("; ")}`,
    `Directions: ${output.creativeDirections.join("; ")}`,
    `Next move: ${output.suggestedNextMove.label} - ${output.suggestedNextMove.reason}`,
  ].join("\n");
}

function normalizedList(values: string[] | undefined, fallback: string[], limit: number, maxLength: number): string[] {
  const normalized = (values?.length ? values : fallback)
    .map((value) => clipText(value, maxLength))
    .filter((value) => value.length > 0);

  return [...new Set(normalized)].slice(0, limit);
}

function lowercaseFirst(value: string): string {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value;
}

type HeuristicConcept = {
  explanation: string;
  pressure: string;
  example: string;
  relatedConcepts: string[];
};

const heuristicConcepts: Record<string, HeuristicConcept> = {
  "cognitive load": {
    explanation: "Cognitive load is the mental effort needed to hold information, choose what matters, and use it while doing a task.",
    pressure: "the claim must show Penny removes effort from studying instead of adding another thing to manage",
    example: "A study assistant lowers cognitive load when it turns scattered notes into the next useful step without hiding the hard concept.",
    relatedConcepts: ["working memory", "attention", "task complexity", "friction"],
  },
  "network effects": {
    explanation: "Network effects happen when each additional user can make the product more useful for other users.",
    pressure: "the claim must show value compounds through participation, not just that more users would be nice",
    example: "A tool has network effects if one student's saved explanation helps later students understand or improve the same idea.",
    relatedConcepts: ["supply growth", "demand loops", "marketplaces", "switching costs"],
  },
  "working memory": {
    explanation: "Working memory is the limited capacity people use to hold and manipulate information in the moment.",
    pressure: "the claim must account for what the user can keep in mind while using the product",
    example: "A study flow helps working memory when it keeps only the current step, key fact, and next action in view.",
    relatedConcepts: ["attention", "cognitive load", "chunking", "task complexity"],
  },
  scope: {
    explanation: "Scope is the boundary around where a claim applies and where it stops applying.",
    pressure: "the claim becomes testable only when the affected users, situation, and limits are explicit",
    example: "A study assistant may reduce load for novice users in dense material, while doing little for experts reviewing simple facts.",
    relatedConcepts: ["boundary", "audience", "use case", "assumption"],
  },
  "desirable difficulty": {
    explanation: "Desirable difficulty is effort that makes learning stronger because it forces useful retrieval or discrimination.",
    pressure: "the claim must distinguish productive effort from avoidable friction",
    example: "A quiz can add desirable difficulty if it makes a student retrieve a concept, but not if it merely buries the answer.",
    relatedConcepts: ["retrieval practice", "friction", "learning transfer", "cognitive load"],
  },
};

function heuristicConceptFor(term: string): HeuristicConcept | null {
  const normalized = normalizeConceptTerm(term);

  return heuristicConcepts[normalized] ?? null;
}

function normalizeConceptTerm(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function conceptWhyItMatters(term: string, pressure: string, claim: string): string {
  return `In "${clipText(claim, 92)}", ${term} matters because ${pressure}.`;
}

function conceptExample(example: string, context: string): string {
  return `${example} In this map, test that against "${clipText(context, 72)}".`;
}

function relatedConceptsFor(term: string, context: string, preferredConcepts: string[]): string[] {
  const normalizedTerm = term.toLowerCase();
  const contextWords = context
    .match(/[A-Za-z][A-Za-z-]{4,}/g)
    ?.map((word) => word.toLowerCase())
    .filter((word) => word !== normalizedTerm && !normalizedTerm.includes(word)) ?? [];
  const concepts = [...preferredConcepts, ...contextWords, "assumption", "evidence", "scope"];

  return [...new Set(concepts)].slice(0, 5);
}

function conceptClaimSlice(
  claim: typeof claims.$inferSelect,
  version: typeof claimVersions.$inferSelect,
): PersistedClaimSlice {
  if (claim.kind !== "concept") {
    throw new InlineLearnConflictError("Expected concept claim.");
  }

  return {
    id: claim.id,
    versionId: version.id,
    kind: "concept",
    status: version.status,
    text: version.content,
    confidence: version.confidence,
  };
}

function teachesEdgeSlice(edge: typeof claimEdges.$inferSelect): PersistedTeachesEdge {
  if (edge.kind !== "teaches") {
    throw new InlineLearnConflictError("Expected teaches edge.");
  }

  return {
    id: edge.id,
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    kind: "teaches",
    status: edge.status,
    label: edge.label,
  };
}

function conceptVersionContent(output: InlineLearnOutput): string {
  return [
    `${output.term}: ${output.explanation}`,
    `Why it matters here: ${output.whyItMattersHere}`,
    `Example: ${output.example}`,
    `Related concepts: ${output.relatedConcepts.join(", ")}`,
  ].join("\n");
}

async function generateStructuredInlineLearn(request: Parameters<InlineLearnGenerateText>[0]): Promise<{ output: unknown }> {
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

function inlineLearnErrorResponse(error: unknown): Response {
  if (error instanceof InlineLearnNotFoundError) {
    return jsonResponse(
      {
        error: {
          code: "inline_learn_not_found",
          message: error.message,
        },
      },
      404,
    );
  }

  if (error instanceof InlineLearnConflictError) {
    return jsonResponse(
      {
        error: {
          code: "inline_learn_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  if (error instanceof InlineLearnGenerationError) {
    return jsonResponse(
      {
        error: {
          code: "invalid_inline_learn_output",
          message: error.message,
          issues: error.issues,
        },
      },
      502,
    );
  }

  if (error instanceof InlineLearnProviderError) {
    return jsonResponse(
      {
        error: {
          code: "inline_learn_provider_failed",
          message: error.message,
        },
      },
      502,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "inline_learn_failed",
        message: formatErrorMessage(error),
      },
    },
    500,
  );
}

function resolveInlineLearnDb(
  options: { db?: PennyDatabase; databaseUrl?: string },
  hasInjectedLearnInline: boolean,
): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedLearnInline) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireInlineLearnDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for POST /brain/learn/inline.");
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

function jsonResponse(payload: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clipText(value: string, maxLength: number): string {
  const compact = compactText(value);

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1).trimEnd()}.`;
}

function anthropicText(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("content" in payload) || !Array.isArray(payload.content)) {
    throw new InlineLearnProviderError("Anthropic Ask Penny response did not include text content.");
  }

  const text = payload.content
    .map((item) => {
      if (item && typeof item === "object" && "type" in item && item.type === "text" && "text" in item && typeof item.text === "string") {
        return item.text;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!text) {
    throw new InlineLearnProviderError("Anthropic Ask Penny response text was empty.");
  }

  return text;
}

function anthropicErrorMessage(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }

  return "unknown error";
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}
