import { z } from "zod";

export const brainRetrievalModes = ["learn", "verify", "check", "autopilot"] as const;
export const brainRetrievalDocumentKinds = [
  "claim",
  "source",
  "edge",
  "move",
  "artifact",
  "brain_object",
  "recent",
  "session_note",
] as const;

export const BrainRetrievalModeSchema = z.enum(brainRetrievalModes);
export const BrainRetrievalDocumentKindSchema = z.enum(brainRetrievalDocumentKinds);

export const BrainRetrievalMatchSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    kind: BrainRetrievalDocumentKindSchema,
    title: z.string().trim().min(1).max(180),
    text: z.string().trim().min(1).max(2_000),
    sessionId: z.string().uuid().nullable(),
    claimId: z.string().uuid().nullable(),
    sourceId: z.string().uuid().nullable(),
    score: z.number().min(0).max(1),
    lexicalScore: z.number().min(0).max(1),
    vectorScore: z.number().min(0).max(1),
    recencyScore: z.number().min(0).max(1),
    graphScore: z.number().min(0).max(1),
    matchedTerms: z.array(z.string().trim().min(1).max(80)).max(24),
    reasons: z.array(z.string().trim().min(1).max(80)).max(24),
  })
  .strict();

export const BrainRetrievalContextSchema = z
  .object({
    sourceOfTruth: z.literal("brain_rows_hybrid_retrieval"),
    mode: BrainRetrievalModeSchema,
    query: z.string().trim().min(1).max(4_000),
    strategy: z.literal("hybrid_lexical_vector"),
    vectorContract: z.literal("BrainVectorProvider"),
    vectorProvider: z.enum(["deterministic_mock", "external_provider"]),
    matchCount: z.number().int().min(0).max(12),
    matches: z.array(BrainRetrievalMatchSchema).max(12),
    summary: z.string().trim().min(1).max(1_400),
  })
  .strict()
  .superRefine((context, issueContext) => {
    if (context.matchCount !== context.matches.length) {
      issueContext.addIssue({
        code: "custom",
        message: "matchCount must equal matches.length",
        path: ["matchCount"],
      });
    }
  });

export type BrainRetrievalMode = z.infer<typeof BrainRetrievalModeSchema>;
export type BrainRetrievalDocumentKind = z.infer<typeof BrainRetrievalDocumentKindSchema>;
export type BrainRetrievalMatch = z.infer<typeof BrainRetrievalMatchSchema>;
export type BrainRetrievalContext = z.infer<typeof BrainRetrievalContextSchema>;

export type BrainRetrievalRequest = {
  mode: BrainRetrievalMode;
  query: string;
  sessionId?: string | null;
  currentClaimId?: string | null;
  limit?: number;
};

export type BrainRetrievalProvider = {
  /**
   * Wave 7 typed handoff. The retrieval implementation lane should replace
   * the empty fallback with hybrid lexical + vector matches over persisted
   * Brain rows while preserving this response shape for Learn/Verify callers.
   */
  retrieve(request: BrainRetrievalRequest): Promise<BrainRetrievalContext>;
};

export function emptyBrainRetrievalContext(request: BrainRetrievalRequest): BrainRetrievalContext {
  return {
    sourceOfTruth: "brain_rows_hybrid_retrieval",
    mode: request.mode,
    query: request.query.trim(),
    strategy: "hybrid_lexical_vector",
    vectorContract: "BrainVectorProvider",
    vectorProvider: "deterministic_mock",
    matchCount: 0,
    matches: [],
    summary: "No durable Brain rows were retrieved for this request.",
  };
}

export function formatBrainRetrievalContext(context: BrainRetrievalContext | null | undefined): string {
  if (!context || context.matches.length === 0) {
    return "Brain retrieval context: none.";
  }

  return [
    "Brain retrieval context:",
    `- sourceOfTruth: ${context.sourceOfTruth}`,
    `- mode: ${context.mode}`,
    `- strategy: ${context.strategy}`,
    `- vectorProvider: ${context.vectorProvider}`,
    `- query: ${context.query}`,
    `- summary: ${context.summary}`,
    ...context.matches.map(
      (match, index) =>
        `${index + 1}. [${match.kind}] ${match.title} | score=${match.score.toFixed(3)} | text=${clipText(match.text, 420)}`,
    ),
  ].join("\n");
}

function clipText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1).trimEnd()}.`;
}
