import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainRuns, claimEdges, claimVersions, claims } from "./db/schema.ts";
import { requireRecordedBrainRun, type BrainRunGuardOptions } from "./brain-run-guard.ts";
import { formatLensSnapshot, loadLensSnapshot, type LensSnapshot } from "./lens-snapshot.ts";
import { createMove } from "./move-payloads.ts";
import { flattenIssues } from "./schema.ts";
import { scopeValues } from "./scope.ts";

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
    term: z.string(),
    explanation: z.string(),
    whyItMattersHere: z.string(),
    example: z.string(),
    relatedConcepts: z.array(z.string()),
    saveSuggestion: z.string(),
  })
  .strict();

export const InlineLearnOutputSchema = z
  .object({
    term: z.string().trim().min(1).max(120),
    explanation: z.string().trim().min(1).max(360),
    whyItMattersHere: z.string().trim().min(1).max(360),
    example: z.string().trim().min(1).max(320),
    relatedConcepts: z.array(z.string().trim().min(1).max(80)).max(5),
    saveSuggestion: z.string().trim().min(1).max(220),
  })
  .strict();

export const InlineLearnSaveRequestSchema = InlineLearnOutputSchema.extend({
  currentClaimId: z.string().uuid(),
  sessionId: z.string().uuid(),
}).strict();

export type InlineLearnRequest = z.infer<typeof InlineLearnRequestSchema>;
export type InlineLearnSaveRequest = z.infer<typeof InlineLearnSaveRequestSchema>;
export type InlineLearnProviderOutput = z.infer<typeof InlineLearnProviderSchema>;
export type InlineLearnOutput = z.infer<typeof InlineLearnOutputSchema>;

export type InlineLearnGenerationInput = {
  term: string;
  currentClaimId: string;
  sessionId: string;
  localContext: string;
  currentClaimText: string;
  currentClaimKind: "belief" | "assumption" | "question" | "concept";
  lensSnapshot?: LensSnapshot;
};

export type InlineLearnProvider = {
  name: string;
  generate(input: InlineLearnGenerationInput): Promise<unknown>;
};

const inlineLearnOutputSpec = Output.object<InlineLearnProviderOutput>({
  schema: InlineLearnProviderSchema,
  name: "penny_inline_learn",
  description: "A short contextual explanation for one term inside the current Penny Brain claim.",
});

export type InlineLearnGenerateText = (request: {
  model: LanguageModel;
  system: string;
  prompt: string;
  output: typeof inlineLearnOutputSpec;
  maxRetries: number;
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
    const output = await generateInlineLearnOutput(learnGenerationInput(prelude.target, input, prelude.lensSnapshot), {
      provider,
      brainRunId: prelude.brainRun.id,
    });

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

  return parseInlineLearnOutput(providerOutput);
}

export function parseInlineLearnOutput(output: unknown): InlineLearnOutput {
  const providerParsed = InlineLearnProviderSchema.safeParse(output);

  if (!providerParsed.success) {
    throw new InlineLearnGenerationError(
      "Inline Learn provider output failed validation.",
      flattenIssues(providerParsed.error),
    );
  }

  const strictParsed = InlineLearnOutputSchema.safeParse(providerParsed.data);

  if (!strictParsed.success) {
    throw new InlineLearnGenerationError(
      "Inline Learn output failed strict validation.",
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
        throw new InlineLearnProviderError("XAI_API_KEY is required for the xAI Inline Learn provider.");
      }

      const xai = createXai(createXaiSettings(apiKey, env));
      const callGenerateText = options.generateText ?? generateStructuredInlineLearn;

      try {
        const result = await callGenerateText({
          model: xai.responses(resolveXaiInlineLearnModel(env)),
          system: buildInlineLearnSystemPrompt(),
          prompt: buildInlineLearnPrompt(input),
          output: inlineLearnOutputSpec,
          maxRetries: 1,
          providerOptions: {
            xai: {
              store: false,
            },
          },
        });

        return result.output;
      } catch (error) {
        if (error instanceof InlineLearnProviderError) {
          throw error;
        }

        throw new InlineLearnProviderError(`xAI Inline Learn request failed: ${formatErrorMessage(error)}`);
      }
    },
  };
}

export function resolveXaiInlineLearnModel(env: Record<string, string | undefined> = process.env): string {
  return env.XAI_INLINE_LEARN_MODEL?.trim() || env.XAI_MODEL?.trim() || defaultXaiInlineLearnModel;
}

export function buildInlineLearnSystemPrompt(): string {
  return [
    "You are Penny, a controllable thinking instrument enhanced by AI.",
    "Explain one confusing term inside the current Brain claim.",
    "Keep the explanation contextual, short, and operational.",
    "Do not start a separate Learn app, lesson, sidebar, curriculum, or chat.",
    "Do not invent citations, market facts, or external evidence.",
    "Return only the structured Inline Learn object.",
  ].join("\n");
}

export function buildInlineLearnPrompt(input: InlineLearnGenerationInput): string {
  return [
    "Create a short inline Learn explanation for this term.",
    "",
    "Return:",
    "- term: the exact term being explained.",
    "- explanation: one or two short sentences.",
    "- whyItMattersHere: why the term matters inside this claim.",
    "- example: one compact example tied to the local context.",
    "- relatedConcepts: up to five short concept names.",
    "- saveSuggestion: when the user should save this as a concept claim.",
    "",
    "Lens rules:",
    "- Use confirmed shapes to choose framing and examples that fit this user's history.",
    "- Treat candidate shapes as tentative and do not label the user with them.",
    "- If the lens suggests concept grounding or evidence checking patterns, make the explanation more operational.",
    "",
    `Term: ${input.term}`,
    `Current claim id: ${input.currentClaimId}`,
    `Current claim kind: ${input.currentClaimKind}`,
    `Current claim: ${input.currentClaimText}`,
    `Local context: ${input.localContext}`,
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
          lensSnapshot,
        },
      })
      .returning();

    if (!brainRun) {
      throw new InlineLearnConflictError("Failed to record Inline Learn BrainRun.");
    }

    return { target, brainRun, lensSnapshot };
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
      throw new InlineLearnConflictError("Failed to complete Inline Learn BrainRun.");
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

    return insertInlineLearnConcept(tx, input, input, target);
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
    summary: "Saved an inline Learn concept inside Brain.",
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
): InlineLearnGenerationInput {
  return {
    term: input.term,
    currentClaimId: target.claim.id,
    sessionId: input.sessionId,
    localContext: input.localContext,
    currentClaimText: target.version.content,
    currentClaimKind: target.claim.kind,
    lensSnapshot,
  };
}

async function completeInlineLearnRun(
  db: PennyDatabase,
  prelude: InlineLearnPrelude,
  output: InlineLearnOutput,
): Promise<typeof brainRuns.$inferSelect> {
  return db.transaction(async (tx) => {
    await createMove(tx, "learning_triggered", {
      sessionId: prelude.target.claim.sessionId,
      scope: prelude.target.claim,
      summary: "Asked Makes Cents inline for a concept explanation.",
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
      throw new InlineLearnConflictError("Failed to complete Inline Learn BrainRun.");
    }

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
      `Inline Learn fallback cannot safely teach "${term}" without xAI. Add XAI_API_KEY or save a supported concept.`,
    );
  }

  const parsed = InlineLearnOutputSchema.safeParse({
    term,
    explanation: concept.explanation,
    whyItMattersHere: conceptWhyItMatters(term, concept.pressure, claim),
    example: conceptExample(term, concept.example, context),
    relatedConcepts: relatedConceptsFor(term, context, concept.relatedConcepts),
    saveSuggestion: `Save ${term} if this definition will keep shaping assumptions, challenges, or the final brief.`,
  });

  if (!parsed.success) {
    throw new InlineLearnConflictError("Generated Inline Learn output failed local validation.");
  }

  return parsed.data;
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

function conceptExample(term: string, example: string, context: string): string {
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

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}
