import { and, desc, eq } from "drizzle-orm";
import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainRuns, claimVersions, claims, moves, sourceSpans, sources } from "./db/schema.ts";
import { flattenIssues } from "./schema.ts";

export const VerifyRequestSchema = z
  .object({
    claimId: z.string().uuid(),
    currentClaimText: z.string().trim().min(1).max(4_000),
    sessionId: z.string().uuid(),
  })
  .strict();

const VerifyVerdictSchema = z.enum(["supported", "weakened", "mixed", "not_enough_evidence"]);
const EvidenceStanceSchema = z.enum(["supports", "weakens", "mixed", "unclear"]);

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
    confidenceDeltaSuggestion: z.number(),
    whatWouldChangeThis: z.string(),
    nextQuestion: z.string(),
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

export const VerifyOutputSchema = z
  .object({
    verdict: VerifyVerdictSchema,
    summary: z.string().trim().min(1).max(900),
    evidenceCards: z.array(EvidenceCardSchema).min(1).max(6),
    confidenceDeltaSuggestion: z.number().int().min(-30).max(30),
    whatWouldChangeThis: z.string().trim().min(1).max(700),
    nextQuestion: z.string().trim().min(1).max(300),
  })
  .strict()
  .superRefine((output, context) => {
    const text = [
      output.summary,
      output.whatWouldChangeThis,
      output.nextQuestion,
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

export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;
export type VerifyOutput = z.infer<typeof VerifyOutputSchema>;
export type VerifyProviderOutput = z.infer<typeof VerifyProviderSchema>;
export type EvidenceCard = z.infer<typeof EvidenceCardSchema>;

export type VerifyGenerationInput = {
  claimId: string;
  sessionId: string;
  currentClaimText: string;
  currentClaimKind: "belief" | "assumption" | "question" | "concept";
  currentClaimStatus: "exploratory" | "committed" | "resolved" | "rejected";
  currentClaimConfidence: number;
};

const verifyOutputSpec = Output.object<VerifyProviderOutput>({
  schema: VerifyProviderSchema,
  name: "penny_verify_run",
  description: "A Penny Verify result with evidence cards and a pending confidence delta suggestion.",
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
      reasoningEffort: "medium";
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

export type VerifyRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  provider?: VerifyProvider;
  verifyClaim?: (
    input: VerifyRequest,
    options: { db?: PennyDatabase; provider: VerifyProvider },
  ) => Promise<PersistedVerify>;
};

type VerifyPrelude = {
  target: Awaited<ReturnType<typeof loadClaimWithCurrentVersion>>;
  brainRun: typeof brainRuns.$inferSelect;
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

  const provider = options.provider ?? defaultVerifyProvider();
  const db = resolveVerifyDb(options, Boolean(options.verifyClaim));
  const verifyClaim =
    options.verifyClaim ??
    ((input: VerifyRequest, verifyOptions: { db?: PennyDatabase; provider: VerifyProvider }) =>
      runVerify(requireVerifyDb(verifyOptions.db), input, { provider: verifyOptions.provider }));

  try {
    return jsonResponse({ data: await verifyClaim(parsed.data, { ...dbOption(db), provider }) }, 201);
  } catch (error) {
    return verifyErrorResponse(error);
  }
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
    const output = await generateVerifyOutput(verifyGenerationInput(prelude.target, input), { provider });

    return await persistVerifyResult(db, output, prelude);
  } catch (error) {
    await markVerifyRunFailed(db, prelude.brainRun.id, error);
    throw error;
  }
}

export async function generateVerifyOutput(
  input: VerifyGenerationInput,
  options: { provider?: VerifyProvider } = {},
): Promise<VerifyOutput> {
  const provider = options.provider ?? defaultVerifyProvider();
  const result = await provider.generate(input);

  return parseVerifyOutput(result.output, result.sources ?? []);
}

export function parseVerifyOutput(output: unknown, providerSources: unknown[] = []): VerifyOutput {
  const parsed = VerifyProviderSchema.safeParse(output);

  if (!parsed.success) {
    throw new VerifyGenerationError("Verify output failed provider validation.", flattenIssues(parsed.error));
  }

  const strictInput = {
    ...parsed.data,
    summary: parsed.data.summary.trim(),
    evidenceCards: normalizeEvidenceCards(parsed.data.evidenceCards, providerSources),
    whatWouldChangeThis: parsed.data.whatWouldChangeThis.trim(),
    nextQuestion: parsed.data.nextQuestion.trim(),
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
          confidenceDeltaSuggestion: 0,
          whatWouldChangeThis: "Run Verify with citation search enabled or attach reliable sources that directly test the claim.",
          nextQuestion: `What source would directly test "${clipText(input.currentClaimText, 120)}"?`,
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

      try {
        const request: Parameters<VerifyGenerateText>[0] = {
          model: xai.responses(resolveXaiVerifyModel(env)),
          system: buildVerifySystemPrompt(),
          prompt: buildVerifyPrompt(input),
          output: verifyOutputSpec,
          maxRetries: 1,
          providerOptions: {
            xai: {
              reasoningEffort: "medium",
              store: false,
            },
          },
        };

        if (webSearchTool) {
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
    "Verify the target claim with citation-backed evidence cards.",
    "Use the available web_search tool when present. Cite only retrieved sources.",
    "Do not change confidence, rewrite claims, create graph edges, or invent citations.",
    "Return only the structured Verify object.",
  ].join("\n");
}

export function buildVerifyPrompt(input: VerifyGenerationInput): string {
  return [
    "Check this stable Penny claim against external evidence.",
    "",
    "Return:",
    "- verdict: supported, weakened, mixed, or not_enough_evidence.",
    "- summary: the shortest useful evidence-grounded reading.",
    "- evidenceCards: 1 to 6 cards with title, summary, stance, sourceName, sourceUrl, and citation when available.",
    "- confidenceDeltaSuggestion: an integer from -30 to 30. This is only a suggestion.",
    "- whatWouldChangeThis: what evidence would alter the verdict.",
    "- nextQuestion: the next focused verification question.",
    "",
    `Session id: ${input.sessionId}`,
    `Claim id: ${input.claimId}`,
    `Current claim kind: ${input.currentClaimKind}`,
    `Current claim status: ${input.currentClaimStatus}`,
    `Current claim confidence: ${input.currentClaimConfidence}`,
    `Current claim text: ${input.currentClaimText}`,
  ].join("\n");
}

async function createVerifyPrelude(
  db: PennyDatabase,
  input: VerifyRequest,
  provider: VerifyProvider,
): Promise<VerifyPrelude> {
  return db.transaction(async (tx) => {
    const target = await loadClaimWithCurrentVersion(tx, input.claimId, input.sessionId);

    if (normalizeClaimText(target.version.content) !== normalizeClaimText(input.currentClaimText)) {
      throw new VerifyConflictError("Verify requires the current ClaimVersion text.");
    }

    const [brainRun] = await tx
      .insert(brainRuns)
      .values({
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
        },
      })
      .returning();

    if (!brainRun) {
      throw new VerifyConflictError("Failed to record Verify BrainRun.");
    }

    return { target, brainRun };
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
    const [move] = await tx
      .insert(moves)
      .values({
        sessionId: prelude.target.claim.sessionId,
        kind: "verify_run",
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
      })
      .returning();

    if (!move) {
      throw new VerifyConflictError("Failed to record Verify move.");
    }

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
): VerifyGenerationInput {
  return {
    claimId: target.claim.id,
    sessionId: input.sessionId,
    currentClaimText: target.version.content,
    currentClaimKind: target.claim.kind,
    currentClaimStatus: target.version.status,
    currentClaimConfidence: target.version.confidence,
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

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringRecordValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function verifyMoveSummary(output: VerifyOutput): string {
  const cardLabel = output.evidenceCards.length === 1 ? "1 evidence card" : `${output.evidenceCards.length} evidence cards`;

  return `Verified claim as ${output.verdict} with ${cardLabel}.`;
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

function requireVerifyDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for POST /brain/verify.");
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
