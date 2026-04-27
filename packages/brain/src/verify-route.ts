import { and, desc, eq } from "drizzle-orm";
import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainRuns, claimVersions, claims, moves, sources } from "./db/schema.ts";
import { flattenIssues } from "./schema.ts";

const VerifyRequestSchema = z
  .object({
    claimId: z.string().uuid(),
    question: z.string().trim().min(1).max(800).optional(),
  })
  .strict();

const EvidenceStanceSchema = z.enum(["supports", "contradicts", "mixed", "context"]);
const EvidenceReliabilitySchema = z.enum(["low", "medium", "high"]);
const VerifyVerdictSchema = z.enum(["supported", "contradicted", "mixed", "insufficient"]);
const EvidenceSourceTypeSchema = z.enum(["web", "x", "paper", "official", "other"]);

export const VerifyProviderSchema = z
  .object({
    verdict: VerifyVerdictSchema,
    summary: z.string(),
    evidenceCards: z.array(
      z
        .object({
          title: z.string(),
          url: z.string(),
          sourceType: EvidenceSourceTypeSchema,
          stance: EvidenceStanceSchema,
          quote: z.string(),
          summary: z.string(),
          reliability: EvidenceReliabilitySchema,
          publishedAt: z.string().optional(),
        })
        .strict(),
    ),
    followUpQuestions: z.array(z.string()),
  })
  .strict();

const EvidenceCardSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    url: z.string().trim().url().max(1_000),
    sourceType: EvidenceSourceTypeSchema,
    stance: EvidenceStanceSchema,
    quote: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(600),
    reliability: EvidenceReliabilitySchema,
    publishedAt: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const VerifyOutputSchema = z
  .object({
    verdict: VerifyVerdictSchema,
    summary: z.string().trim().min(1).max(800),
    evidenceCards: z.array(EvidenceCardSchema).max(8),
    followUpQuestions: z.array(z.string().trim().min(1).max(220)).max(5),
  })
  .strict()
  .superRefine((output, context) => {
    const text = [
      output.summary,
      ...output.followUpQuestions,
      ...output.evidenceCards.flatMap((card) => [card.title, card.quote, card.summary]),
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
  claimVersionId: string;
  claimKind: "belief" | "assumption" | "question" | "concept";
  claimStatus: "exploratory" | "committed" | "resolved" | "rejected";
  claimConfidence: number;
  claimText: string;
  question?: string | undefined;
};

const verifyOutputSpec = Output.object<VerifyProviderOutput>({
  schema: VerifyProviderSchema,
  name: "penny_verify_check",
  description: "A Penny Verify result grounded in citation-backed evidence cards.",
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

export type PersistedVerify = VerifyOutput & {
  targetClaim: PersistedClaimSlice;
  move: PersistedMoveSlice;
  brainRun: {
    id: string;
    status: string;
  };
};

export type VerifyRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  verifyClaim?: (input: VerifyRequest, options: { db?: PennyDatabase }) => Promise<PersistedVerify>;
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

  const db = resolveVerifyDb(options, Boolean(options.verifyClaim));
  const verifyClaim =
    options.verifyClaim ??
    ((input: VerifyRequest, verifyOptions: { db?: PennyDatabase }) => runVerify(requireVerifyDb(verifyOptions.db), input));

  try {
    return jsonResponse({ data: await verifyClaim(parsed.data, dbOption(db)) }, 201);
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
    evidenceCards: normalizeEvidenceCards(parsed.data.evidenceCards, providerSources),
    followUpQuestions: parsed.data.followUpQuestions.map((question) => question.trim()).filter(Boolean),
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
          verdict: "insufficient",
          summary: `No live citation search is configured for "${clipText(input.claimText, 120)}".`,
          evidenceCards: [],
          followUpQuestions: ["Run Verify with xAI search enabled before changing confidence."],
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
    "- verdict: supported, contradicted, mixed, or insufficient.",
    "- summary: the shortest useful evidence-grounded reading.",
    "- evidenceCards: citation cards with title, url, sourceType, stance, quote, summary, reliability, and optional publishedAt.",
    "- followUpQuestions: questions that would make verification sharper.",
    "",
    `Claim id: ${input.claimId}`,
    `Claim version id: ${input.claimVersionId}`,
    `Claim kind: ${input.claimKind}`,
    `Claim status: ${input.claimStatus}`,
    `Claim confidence: ${input.claimConfidence}`,
    `Claim text: ${input.claimText}`,
    input.question ? `User check question: ${input.question}` : "User check question: Verify the claim as stated.",
  ].join("\n");
}

async function createVerifyPrelude(
  db: PennyDatabase,
  input: VerifyRequest,
  provider: VerifyProvider,
): Promise<VerifyPrelude> {
  return db.transaction(async (tx) => {
    const target = await loadClaimWithCurrentVersion(tx, input.claimId);
    const [brainRun] = await tx
      .insert(brainRuns)
      .values({
        sessionId: target.claim.sessionId,
        sourceId: target.claim.sourceId,
        operation: "brain.verify.check",
        provider: provider.name,
        model: provider.name === "xai" ? resolveXaiVerifyModel() : null,
        status: "running",
        input: {
          claimId: target.claim.id,
          claimVersionId: target.version.id,
          question: input.question ?? null,
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
    const evidenceCards = await insertCitationSources(tx, prelude.target.claim.sessionId, output.evidenceCards);
    const persistedOutput = {
      ...output,
      evidenceCards,
    };
    const [move] = await tx
      .insert(moves)
      .values({
        sessionId: prelude.target.claim.sessionId,
        kind: "verify_run",
        summary: verifyMoveSummary(output),
        payload: {
          claimIds: [prelude.target.claim.id],
          claimId: prelude.target.claim.id,
          claimVersionId: prelude.target.version.id,
          brainRunId: prelude.brainRun.id,
          verdict: output.verdict,
          evidenceCards,
          citationSourceIds: evidenceCards.map((card) => card.sourceId),
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

async function insertCitationSources(db: PennyDatabase, sessionId: string, evidenceCards: EvidenceCard[]) {
  const cards = [];

  for (const card of evidenceCards) {
    const [source] = await db
      .insert(sources)
      .values({
        sessionId,
        kind: "verification_citation",
        rawText: citationRawText(card),
      })
      .returning();

    if (!source) {
      throw new VerifyConflictError("Failed to record verification citation source.");
    }

    cards.push({
      ...card,
      sourceId: source.id,
    });
  }

  return cards;
}

async function loadClaimWithCurrentVersion(db: PennyDatabase, claimId: string) {
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId)).limit(1);

  if (!claim) {
    throw new VerifyNotFoundError("Claim was not found.");
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

async function generateStructuredVerify(request: Parameters<VerifyGenerateText>[0]): Promise<{ output: unknown; sources?: unknown[] }> {
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
    claimVersionId: target.version.id,
    claimKind: target.claim.kind,
    claimStatus: target.version.status,
    claimConfidence: target.version.confidence,
    claimText: target.version.content,
    question: input.question,
  };
}

function normalizeEvidenceCards(cards: VerifyProviderOutput["evidenceCards"], providerSources: unknown[]): EvidenceCard[] {
  const normalizedCards = cards.map(normalizeEvidenceCard).filter((card): card is EvidenceCard => Boolean(card));

  if (normalizedCards.length > 0) {
    return normalizedCards;
  }

  return providerSources.map(sourceToEvidenceCard).filter((card): card is EvidenceCard => Boolean(card)).slice(0, 8);
}

function normalizeEvidenceCard(card: VerifyProviderOutput["evidenceCards"][number]): EvidenceCard | null {
  const parsed = EvidenceCardSchema.safeParse({
    ...card,
    title: card.title.trim(),
    url: card.url.trim(),
    quote: card.quote.trim(),
    summary: card.summary.trim(),
    publishedAt: card.publishedAt?.trim() || undefined,
  });

  return parsed.success ? parsed.data : null;
}

function sourceToEvidenceCard(source: unknown): EvidenceCard | null {
  const record = objectRecord(source);
  const url = stringRecordValue(record, "url");

  if (!url) {
    return null;
  }

  const title = stringRecordValue(record, "title") ?? url;
  const snippet = stringRecordValue(record, "snippet") ?? stringRecordValue(record, "description") ?? title;
  const parsed = EvidenceCardSchema.safeParse({
    title,
    url,
    sourceType: "web",
    stance: "context",
    quote: clipText(snippet, 480),
    summary: clipText(snippet, 560),
    reliability: "medium",
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

function citationRawText(card: EvidenceCard): string {
  return [
    `Title: ${card.title}`,
    `URL: ${card.url}`,
    `Stance: ${card.stance}`,
    `Reliability: ${card.reliability}`,
    `Quote: ${card.quote}`,
    `Summary: ${card.summary}`,
  ].join("\n");
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

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}

function clipText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value;
}
