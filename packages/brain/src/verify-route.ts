import { and, desc, eq } from "drizzle-orm";
import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainRuns, claimVersions, claims, moves, sources, sourceSpans } from "./db/schema.ts";
import { flattenIssues } from "./schema.ts";

export const VerifyRequestSchema = z
  .object({
    claimId: z.string().uuid(),
    currentClaimText: z.string().trim().min(1).max(4_000),
    sessionId: z.string().uuid(),
  })
  .strict();

const EvidenceStanceSchema = z.enum(["supports", "weakens", "mixed", "unclear"]);

export const VerifyProviderEvidenceCardSchema = z
  .object({
    title: z.string(),
    summary: z.string(),
    stance: EvidenceStanceSchema,
    sourceName: z.string().nullable().optional(),
    sourceUrl: z.string().nullable().optional(),
    citation: z.string().nullable().optional(),
  })
  .strict();

export const VerifyProviderSchema = z
  .object({
    verdict: z.enum(["supported", "weakened", "mixed", "not_enough_evidence"]),
    summary: z.string(),
    evidenceCards: z.array(VerifyProviderEvidenceCardSchema),
    confidenceDeltaSuggestion: z.number(),
    whatWouldChangeThis: z.string(),
    nextQuestion: z.string(),
  })
  .strict();

export const VerifyEvidenceCardSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(520),
    stance: EvidenceStanceSchema,
    sourceName: z.string().trim().min(1).max(180).nullable().optional(),
    sourceUrl: z.string().trim().min(1).max(500).nullable().optional(),
    citation: z.string().trim().min(1).max(1_000).nullable().optional(),
  })
  .strict();

export const VerifyOutputSchema = z
  .object({
    verdict: z.enum(["supported", "weakened", "mixed", "not_enough_evidence"]),
    summary: z.string().trim().min(1).max(700),
    evidenceCards: z.array(VerifyEvidenceCardSchema).min(1).max(6),
    confidenceDeltaSuggestion: z.number().int().min(-30).max(30),
    whatWouldChangeThis: z.string().trim().min(1).max(520),
    nextQuestion: z.string().trim().min(1).max(320),
  })
  .strict();

export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;
export type VerifyProviderOutput = z.infer<typeof VerifyProviderSchema>;
export type VerifyOutput = z.infer<typeof VerifyOutputSchema>;

export type VerifyGenerationInput = {
  claimId: string;
  sessionId: string;
  currentClaimText: string;
  currentClaimKind: "belief" | "assumption" | "question" | "concept";
  currentClaimStatus: "exploratory" | "committed" | "resolved" | "rejected";
  currentClaimConfidence: number;
};

export type VerifyProvider = {
  name: string;
  generate(input: VerifyGenerationInput): Promise<unknown>;
};

const verifyOutputSpec = Output.object<VerifyProviderOutput>({
  schema: VerifyProviderSchema,
  name: "penny_verify_claim",
  description: "A structured Verify pass for one Penny Brain claim. It suggests confidence changes but never applies them.",
});

export type VerifyGenerateText = (request: {
  model: LanguageModel;
  system: string;
  prompt: string;
  output: typeof verifyOutputSpec;
  maxRetries: number;
  providerOptions: {
    xai: {
      reasoningEffort: "medium";
      store: false;
    };
  };
}) => Promise<{ output: unknown }>;

export const defaultXaiVerifyModel = "grok-4.20-reasoning";

export type PersistedVerify = VerifyOutput & {
  targetClaim: PersistedClaimSlice;
  brainRun: {
    id: string;
    status: string;
  };
  move: PersistedMoveSlice;
  citationSources: PersistedCitationSource[];
  confidenceUpdate: {
    suggestedDelta: number;
    autoApplied: false;
    decision: "pending_user_decision";
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

type PersistedCitationSource = {
  evidenceCardIndex: number;
  source: {
    id: string;
    kind: "verification_citation";
    rawText: string;
  };
  sourceSpan: {
    id: string;
    sourceId: string;
    claimId: string;
    claimVersionId: string;
    startOffset: number;
    endOffset: number;
    label: string | null;
  };
};

type VerifyPrelude = {
  target: Awaited<ReturnType<typeof loadClaimWithCurrentVersion>>;
  brainRun: typeof brainRuns.$inferSelect;
};

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

  const provider = options.provider ?? createDefaultVerifyProvider();
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

export class VerifyGenerationError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "VerifyGenerationError";
  }
}

export class VerifyProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifyProviderError";
  }
}

export async function runVerify(
  db: PennyDatabase,
  input: VerifyRequest,
  options: { provider?: VerifyProvider } = {},
): Promise<PersistedVerify> {
  const provider = options.provider ?? createDefaultVerifyProvider();
  const prelude = await createVerifyPrelude(db, input, provider);

  try {
    const output = await generateVerifyOutput(verifyGenerationInput(prelude.target), { provider });

    return await persistVerifyOutput(db, prelude, output);
  } catch (error) {
    await markVerifyRunFailed(db, prelude.brainRun.id, error);
    throw error;
  }
}

export async function generateVerifyOutput(
  input: VerifyGenerationInput,
  options: { provider?: VerifyProvider } = {},
): Promise<VerifyOutput> {
  const provider = options.provider ?? createDefaultVerifyProvider();
  const providerOutput = await provider.generate(input);

  return parseVerifyOutput(providerOutput);
}

export function parseVerifyOutput(output: unknown): VerifyOutput {
  const providerParsed = VerifyProviderSchema.safeParse(output);

  if (!providerParsed.success) {
    throw new VerifyGenerationError("Verify provider output failed validation.", flattenIssues(providerParsed.error));
  }

  const strictParsed = VerifyOutputSchema.safeParse(providerParsed.data);

  if (!strictParsed.success) {
    throw new VerifyGenerationError("Verify output failed strict validation.", flattenIssues(strictParsed.error));
  }

  return strictParsed.data;
}

export function createDefaultVerifyProvider(env: Record<string, string | undefined> = process.env): VerifyProvider {
  if (env.XAI_API_KEY?.trim()) {
    return createXaiVerifyProvider(env);
  }

  return createHeuristicVerifyProvider();
}

export function createHeuristicVerifyProvider(): VerifyProvider {
  return {
    name: "heuristic",
    async generate(input) {
      return buildHeuristicVerifyOutput(input);
    },
  };
}

export function createXaiVerifyProvider(
  env: Record<string, string | undefined> = process.env,
  options: { generateText?: VerifyGenerateText } = {},
): VerifyProvider {
  return {
    name: "xai",
    async generate(input) {
      const apiKey = env.XAI_API_KEY?.trim();

      if (!apiKey) {
        throw new VerifyProviderError("XAI_API_KEY is required for the xAI Verify provider.");
      }

      const xai = createXai(createXaiSettings(apiKey, env));
      const callGenerateText = options.generateText ?? generateStructuredVerify;

      try {
        const result = await callGenerateText({
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
        });

        return result.output;
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
    "You are Penny Verify, a Check mode inside the Brain graph.",
    "Verify one current claim without changing it.",
    "Return structured evidence cards and a confidence delta suggestion only.",
    "Do not auto-update confidence or claim text.",
    "Use citations only when you can name the source text or citation precisely.",
    "Return only the structured Verify object.",
  ].join("\n");
}

export function buildVerifyPrompt(input: VerifyGenerationInput): string {
  return [
    "Run Verify for this Penny claim.",
    "",
    "Return:",
    "- verdict: supported, weakened, mixed, or not_enough_evidence.",
    "- summary: concise reason for the verdict.",
    "- evidenceCards: short structured cards. Include citation text when available.",
    "- confidenceDeltaSuggestion: integer from -30 to 30. This will not be applied automatically.",
    "- whatWouldChangeThis: what evidence would alter the verdict.",
    "- nextQuestion: the next focused check question.",
    "",
    `Session id: ${input.sessionId}`,
    `Claim id: ${input.claimId}`,
    `Claim kind: ${input.currentClaimKind}`,
    `Claim status: ${input.currentClaimStatus}`,
    `Current confidence: ${input.currentClaimConfidence}`,
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
    const normalizedInputText = compactText(input.currentClaimText);
    const normalizedCurrentText = compactText(target.version.content);

    if (normalizedInputText !== normalizedCurrentText) {
      throw new VerifyConflictError("Verify requires the current ClaimVersion text.");
    }

    const [brainRun] = await tx
      .insert(brainRuns)
      .values({
        sessionId: input.sessionId,
        sourceId: target.version.sourceId ?? target.claim.sourceId,
        operation: "verify_run",
        provider: provider.name,
        model: provider.name === "xai" ? resolveXaiVerifyModel() : null,
        status: "running",
        input: {
          claimId: target.claim.id,
          currentClaimVersionId: target.version.id,
          currentClaimText: target.version.content,
          currentConfidence: target.version.confidence,
        },
      })
      .returning();

    if (!brainRun) {
      throw new VerifyConflictError("Failed to record Verify BrainRun.");
    }

    return { target, brainRun };
  });
}

async function persistVerifyOutput(
  db: PennyDatabase,
  prelude: VerifyPrelude,
  output: VerifyOutput,
): Promise<PersistedVerify> {
  return db.transaction(async (tx) => {
    const citationSources = await insertCitationSources(tx, prelude.target, output);
    const citationSourceIds = citationSources.map((citation) => citation.source.id);
    const citationSourceSpanIds = citationSources.map((citation) => citation.sourceSpan.id);

    const [move] = await tx
      .insert(moves)
      .values({
        sessionId: prelude.target.claim.sessionId,
        kind: "verify_run",
        summary: `Verified claim: ${output.verdict.replaceAll("_", " ")}.`,
        payload: {
          claimId: prelude.target.claim.id,
          claimVersionId: prelude.target.version.id,
          brainRunId: prelude.brainRun.id,
          verdict: output.verdict,
          confidenceDeltaSuggestion: output.confidenceDeltaSuggestion,
          confidenceDecision: "pending_user_decision",
          autoAppliedConfidence: false,
          sourceIds: citationSourceIds,
          sourceSpanIds: citationSourceSpanIds,
          claimIds: [prelude.target.claim.id],
          edgeIds: [],
        },
      })
      .returning();

    if (!move) {
      throw new VerifyConflictError("Failed to create Verify move.");
    }

    const [completedBrainRun] = await tx
      .update(brainRuns)
      .set({
        status: "succeeded",
        output: {
          ...output,
          citationSourceIds,
          citationSourceSpanIds,
          confidenceUpdate: {
            suggestedDelta: output.confidenceDeltaSuggestion,
            autoApplied: false,
            decision: "pending_user_decision",
          },
        },
        error: null,
        completedAt: new Date(),
      })
      .where(eq(brainRuns.id, prelude.brainRun.id))
      .returning();

    if (!completedBrainRun) {
      throw new VerifyConflictError("Failed to complete Verify BrainRun.");
    }

    return {
      ...output,
      targetClaim: claimSlice(prelude.target.claim, prelude.target.version),
      brainRun: {
        id: completedBrainRun.id,
        status: completedBrainRun.status,
      },
      move: {
        id: move.id,
        kind: "verify_run",
        summary: move.summary,
        claimIds: [prelude.target.claim.id],
        edgeIds: [],
        artifactIds: [],
      },
      citationSources,
      confidenceUpdate: {
        suggestedDelta: output.confidenceDeltaSuggestion,
        autoApplied: false,
        decision: "pending_user_decision",
      },
    };
  });
}

type VerifyTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];

async function insertCitationSources(
  tx: VerifyTransaction,
  target: Awaited<ReturnType<typeof loadClaimWithCurrentVersion>>,
  output: VerifyOutput,
): Promise<PersistedCitationSource[]> {
  const persisted: PersistedCitationSource[] = [];

  for (const [index, card] of output.evidenceCards.entries()) {
    const citation = card.citation?.trim();

    if (!citation) {
      continue;
    }

    const rawText = citationSourceText(card);
    const citationStartOffset = Math.max(0, rawText.indexOf(citation));
    const citationEndOffset = citationStartOffset + citation.length;
    const [source] = await tx
      .insert(sources)
      .values({
        sessionId: target.claim.sessionId,
        kind: "verification_citation",
        rawText,
      })
      .returning();

    if (!source) {
      throw new VerifyConflictError("Failed to create Verify citation source.");
    }

    const [span] = await tx
      .insert(sourceSpans)
      .values({
        sourceId: source.id,
        claimId: target.claim.id,
        claimVersionId: target.version.id,
        startOffset: citationStartOffset,
        endOffset: citationEndOffset,
        label: "verify_evidence",
      })
      .returning();

    if (!span) {
      throw new VerifyConflictError("Failed to create Verify citation SourceSpan.");
    }

    persisted.push({
      evidenceCardIndex: index,
      source: {
        id: source.id,
        kind: "verification_citation",
        rawText: source.rawText,
      },
      sourceSpan: {
        id: span.id,
        sourceId: span.sourceId,
        claimId: target.claim.id,
        claimVersionId: target.version.id,
        startOffset: span.startOffset,
        endOffset: span.endOffset,
        label: span.label,
      },
    });
  }

  return persisted;
}

async function loadClaimWithCurrentVersion(tx: VerifyTransaction, claimId: string, sessionId: string) {
  const [claim] = await tx
    .select()
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.sessionId, sessionId)))
    .limit(1);

  if (!claim) {
    throw new VerifyNotFoundError("Claim was not found in this session.");
  }

  const [version] = await tx
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

function verifyGenerationInput(target: Awaited<ReturnType<typeof loadClaimWithCurrentVersion>>): VerifyGenerationInput {
  return {
    claimId: target.claim.id,
    sessionId: target.claim.sessionId,
    currentClaimText: target.version.content,
    currentClaimKind: target.claim.kind,
    currentClaimStatus: target.version.status,
    currentClaimConfidence: target.version.confidence,
  };
}

function buildHeuristicVerifyOutput(input: VerifyGenerationInput): VerifyOutput {
  const claim = compactText(input.currentClaimText);
  const parsed = VerifyOutputSchema.safeParse({
    verdict: "not_enough_evidence",
    summary: `Penny has the current claim text but no external evidence attached yet, so Verify cannot responsibly raise or lower confidence.`,
    evidenceCards: [
      {
        title: "Current Brain state",
        summary: `The claim "${clipText(claim, 120)}" is available for checking, but no citation-backed evidence has been supplied in this Verify pass.`,
        stance: "unclear",
        sourceName: "Penny Brain",
      },
    ],
    confidenceDeltaSuggestion: 0,
    whatWouldChangeThis: "Citation-backed support, contradiction, or measured user behavior tied directly to the claim.",
    nextQuestion: "What source or observation would most directly test this claim?",
  });

  if (!parsed.success) {
    throw new VerifyConflictError("Generated Verify output failed local validation.");
  }

  return parsed.data;
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

function citationSourceText(card: VerifyOutput["evidenceCards"][number]): string {
  return [
    `Title: ${card.title}`,
    card.sourceName ? `Source: ${card.sourceName}` : null,
    card.sourceUrl ? `URL: ${card.sourceUrl}` : null,
    card.citation ? `Citation: ${card.citation}` : null,
    `Summary: ${card.summary}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
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

async function generateStructuredVerify(request: Parameters<VerifyGenerateText>[0]): Promise<{ output: unknown }> {
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

function resolveVerifyDb(options: { db?: PennyDatabase; databaseUrl?: string }, hasInjectedVerify: boolean): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedVerify) {
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
