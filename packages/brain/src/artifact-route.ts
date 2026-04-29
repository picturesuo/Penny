import { asc, eq, inArray } from "drizzle-orm";
import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { artifacts, brainRuns, claimEdges, claimVersions, claims, moves, sessions, shapes as shapeRows, sources } from "./db/schema.ts";
import { requireRecordedBrainRun, type BrainRunGuardOptions } from "./brain-run-guard.ts";
import { createMove } from "./move-payloads.ts";
import { flattenIssues } from "./schema.ts";
import {
  compiledShapesFromRows,
  inferredShapeSlices,
  persistInferredShapes,
  type CompiledShape,
  type PersistedShape,
} from "./shapes.ts";

export { inferShapesFromMoves } from "./shapes.ts";
export type { CompiledShape } from "./shapes.ts";

export const ArtifactRouteRequestSchema = z
  .object({
    kind: z.literal("challenge_brief").optional().default("challenge_brief"),
  })
  .strict();

export const ArtifactRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    kind: z.literal("challenge_brief").optional().default("challenge_brief"),
  })
  .strict();

const ArtifactFailureTypeSchema = z.enum([
  "weak_evidence",
  "missing_counterargument",
  "shaky_assumption",
  "analogy_break",
  "dependency_risk",
  "unaddressed_precedent",
  "premise_rejection",
  "definition_failure",
  "not_recorded",
]);

const ArtifactResponseStateSchema = z.enum(["unanswered", "defended", "revised", "absorbed", "mixed", "not_recorded"]);

export const ArtifactProviderSchema = z
  .object({
    kind: z.enum(["challenge_brief"]),
    title: z.string(),
    summary: z.string(),
    keyInsight: z.string(),
    challengeBrief: z
      .object({
        targetClaimId: z.string(),
        failureType: ArtifactFailureTypeSchema,
        challenge: z.string(),
        whyItMatters: z.string(),
        responseState: ArtifactResponseStateSchema,
      })
      .strict(),
    claimRefs: z.array(
      z
        .object({
          claimId: z.string(),
          role: z.enum(["seed", "assumption", "challenge", "concept", "question", "supporting"]),
          reason: z.string(),
        })
        .strict(),
    ),
    edgeRefs: z.array(
      z
        .object({
          edgeId: z.string(),
          reason: z.string(),
        })
        .strict(),
    ),
    nextMoves: z.array(
      z
        .object({
          title: z.string(),
          rationale: z.string(),
        })
        .strict(),
    ),
    caveats: z.array(z.string()),
  })
  .strict();

export const ArtifactOutputSchema = z
  .object({
    kind: z.literal("challenge_brief"),
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(1_000),
    keyInsight: z.string().trim().min(1).max(700),
    challengeBrief: z
      .object({
        targetClaimId: z.string().uuid(),
        failureType: ArtifactFailureTypeSchema,
        challenge: z.string().trim().min(1).max(900),
        whyItMatters: z.string().trim().min(1).max(700),
        responseState: ArtifactResponseStateSchema,
      })
      .strict(),
    claimRefs: z
      .array(
        z
          .object({
            claimId: z.string().uuid(),
            role: z.enum(["seed", "assumption", "challenge", "concept", "question", "supporting"]),
            reason: z.string().trim().min(1).max(400),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    edgeRefs: z
      .array(
        z
          .object({
            edgeId: z.string().uuid(),
            reason: z.string().trim().min(1).max(400),
          })
          .strict(),
      )
      .max(12),
    nextMoves: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(120),
            rationale: z.string().trim().min(1).max(420),
          })
          .strict(),
      )
      .min(1)
      .max(5),
    caveats: z.array(z.string().trim().min(1).max(360)).max(5),
  })
  .strict();

export type ArtifactRouteRequest = z.infer<typeof ArtifactRouteRequestSchema>;
export type ArtifactRequest = z.infer<typeof ArtifactRequestSchema>;
export type ArtifactRouteInput = ArtifactRouteRequest & { sessionId: string };
export type ArtifactProviderOutput = z.infer<typeof ArtifactProviderSchema>;
export type ArtifactOutput = z.infer<typeof ArtifactOutputSchema>;

type ClaimRow = typeof claims.$inferSelect;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = typeof claimEdges.$inferSelect;
type MoveRow = typeof moves.$inferSelect;
type ShapeRow = typeof shapeRows.$inferSelect;

export type SessionArtifactState = {
  session: typeof sessions.$inferSelect;
  claims: ClaimRow[];
  claimVersions: ClaimVersionRow[];
  edges: EdgeRow[];
  moves: MoveRow[];
  shapes?: ShapeRow[];
};

export type SessionArtifactContext = {
  session: {
    id: string;
    status: string;
    title: string | null;
    createdAt: string;
  };
  sources: Array<{
    id: string;
    kind: string;
    rawText: string;
    createdAt: string;
  }>;
  claims: Array<{
    id: string;
    versionId: string;
    kind: "belief" | "assumption" | "question" | "concept";
    status: "exploratory" | "committed" | "resolved" | "rejected";
    text: string;
    confidence: number;
    sourceId: string | null;
    createdAt: string;
  }>;
  claimVersions: Array<{
    id: string;
    claimId: string;
    sourceId: string | null;
    brainRunId: string | null;
    moveId: string | null;
    content: string;
    status: "exploratory" | "committed" | "resolved" | "rejected";
    confidence: number;
    isCurrent: boolean;
    createdAt: string;
  }>;
  edges: Array<{
    id: string;
    fromClaimId: string;
    toClaimId: string;
    kind: string;
    status: string;
    label: string | null;
    createdAt: string;
  }>;
  moves: Array<{
    id: string;
    kind: string;
    summary: string;
    payload: unknown;
    createdAt: string;
  }>;
  artifacts: Array<{
    id: string;
    kind: string;
    title: string;
    summary: string;
    createdAt: string;
  }>;
  shapes?: CompiledShape[];
};

export type ArtifactGenerationInput = SessionArtifactContext & {
  requestedKind: "challenge_brief";
};

const artifactOutputSpec = Output.object<ArtifactProviderOutput>({
  schema: ArtifactProviderSchema,
  name: "penny_session_artifact",
  description: "A Penny Challenge Brief synthesized only from persisted Brain session state.",
});

export type ArtifactGenerateText = (request: {
  model: LanguageModel;
  system: string;
  prompt: string;
  output: typeof artifactOutputSpec;
  maxRetries: number;
  providerOptions: {
    xai: {
      store: false;
    };
  };
}) => Promise<{ output: unknown }>;

export type ArtifactProvider = {
  name: string;
  generate(input: ArtifactGenerationInput): Promise<unknown>;
};

export const defaultXaiArtifactModel = "grok-4.20-reasoning";

export type PersistedArtifact = {
  artifact: PersistedArtifactSlice;
  move: PersistedArtifactMove;
  brainRun?: {
    id: string;
    status: string;
  };
};

export type ArtifactRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  provider?: ArtifactProvider;
  createArtifact?: (input: ArtifactRequest, options: { db?: PennyDatabase }) => Promise<PersistedArtifact>;
  compileArtifact?: (
    input: ArtifactRouteInput,
    options: { db?: PennyDatabase; provider: ArtifactProvider },
  ) => Promise<PersistedArtifact>;
};

type PersistedArtifactSlice = {
  id: string;
  kind: "challenge_brief" | "idea_map" | "idea_map_challenge_brief";
  title: string;
  summary: string;
  payload: CompiledArtifactPayload & {
    synthesis?: ArtifactOutput;
    generatedBy?: ArtifactGeneratedBy;
  };
  createdAt: string;
};

type ArtifactGeneratedBy = {
  brainRunId: string;
  sourceIds: string[];
  claimIds: string[];
  claimVersionIds: string[];
  edgeIds: string[];
  moveIds: string[];
  existingArtifactIds: string[];
};

export type CompiledArtifactPayload = {
  sessionId: string;
  generatedFrom: {
    claimCount: number;
    claimVersionCount: number;
    edgeCount: number;
    moveCount: number;
    challengeCount: number;
    learnedConceptCount: number;
  };
  ideaMap: {
    claims: CompiledClaim[];
    claimVersions: CompiledClaimVersion[];
    edges: CompiledEdge[];
  };
  challengeBrief: {
    challenges: CompiledChallenge[];
    unresolvedRisks: CompiledRisk[];
    whatChanged: CompiledChange[];
    recommendedNextMove: string;
  };
  learnedConcepts: CompiledLearnedConcept[];
  shapes: CompiledShape[];
};

type ArtifactDraft = {
  title: string;
  summary: string;
  payload: CompiledArtifactPayload;
  claimIds: string[];
  edgeIds: string[];
};

type CompiledClaim = {
  id: string;
  kind: ClaimRow["kind"];
  status: ClaimVersionRow["status"];
  text: string;
  confidence: number;
  currentVersionId: string;
  versions: Array<{
    id: string;
    content: string;
    confidence: number;
    status: ClaimVersionRow["status"];
    isCurrent: boolean;
    createdAt: string;
  }>;
};

type CompiledClaimVersion = {
  id: string;
  claimId: string;
  sourceId: string | null;
  brainRunId: string | null;
  moveId: string | null;
  content: string;
  status: ClaimVersionRow["status"];
  confidence: number;
  isCurrent: boolean;
  createdAt: string;
};

type CompiledEdge = {
  id: string;
  fromClaimId: string;
  toClaimId: string;
  kind: EdgeRow["kind"];
  status: EdgeRow["status"];
  label: string | null;
};

type CompiledChallenge = {
  edgeId: string;
  kind: "challenges" | "contradicts";
  status: EdgeRow["status"];
  failureType: string | null;
  strength: string | null;
  targetClaimId: string;
  target: string;
  critiqueClaimId: string;
  critique: string;
};

type CompiledRisk = {
  kind: "challenge" | "assumption";
  claimId: string;
  edgeId: string | null;
  status: string;
  text: string;
  reason: string;
};

type CompiledChange = {
  moveId: string;
  kind: string;
  summary: string;
  claimIds: string[];
  edgeIds: string[];
  createdAt: string;
};

type CompiledLearnedConcept = {
  claimId: string;
  versionId: string;
  term: string;
  explanation: string;
  teachesClaimIds: string[];
  edgeIds: string[];
};

type PersistedArtifactMove = {
  id: string;
  kind: "artifact_created";
  summary: string;
  claimIds: string[];
  edgeIds: string[];
  artifactIds: string[];
};

type ArtifactPrelude = {
  context: SessionArtifactContext;
  brainRun: typeof brainRuns.$inferSelect;
};

export async function handleSessionArtifactRequest(
  request: Request,
  sessionId: string,
  options: ArtifactRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /brain/session/:sessionId/artifact requires the POST method.");
  }

  const sessionIdResult = z.string().uuid().safeParse(sessionId);

  if (!sessionIdResult.success) {
    return jsonResponse(
      {
        error: {
          code: "invalid_session_id",
          message: "Artifact generation requires a valid session id.",
          issues: flattenIssues(sessionIdResult.error),
        },
      },
      400,
    );
  }

  const parsed = await parseJsonRequest(request, ArtifactRouteRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const provider = options.provider ?? createDefaultArtifactProvider();
  const db = resolveArtifactDb(options, Boolean(options.compileArtifact));
  const compileArtifact =
    options.compileArtifact ??
    ((input: ArtifactRouteInput, compileOptions: { db?: PennyDatabase; provider: ArtifactProvider }) =>
      persistSessionArtifact(requireArtifactDb(compileOptions.db), input, { provider: compileOptions.provider }));

  try {
    return jsonResponse(
      {
        data: await compileArtifact(
          {
            sessionId: sessionIdResult.data,
            ...parsed.data,
          },
          { ...dbOption(db), provider },
        ),
      },
      201,
    );
  } catch (error) {
    return artifactErrorResponse(error);
  }
}

export async function handleArtifactRequest(
  request: Request,
  options: ArtifactRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /brain/artifact requires the POST method.");
  }

  const parsed = await parseJsonRequest(request, ArtifactRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  if (options.createArtifact) {
    const db = resolveArtifactDb(options, true);

    try {
      return jsonResponse({ data: await options.createArtifact(parsed.data, dbOption(db)) }, 201);
    } catch (error) {
      return artifactErrorResponse(error);
    }
  }

  return handleSessionArtifactRequest(
    new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify({ kind: parsed.data.kind }),
    }),
    parsed.data.sessionId,
    options,
  );
}

export class ArtifactNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactNotFoundError";
  }
}

export class ArtifactConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactConflictError";
  }
}

export class ArtifactGenerationError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "ArtifactGenerationError";
  }
}

export class ArtifactProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactProviderError";
  }
}

export async function persistSessionArtifact(
  db: PennyDatabase,
  input: ArtifactRouteInput,
  options: { provider?: ArtifactProvider } = {},
): Promise<PersistedArtifact> {
  const provider = options.provider ?? createDefaultArtifactProvider();
  const prelude = await createArtifactPrelude(db, input, provider);

  try {
    const output = await generateArtifactOutput(
      {
        ...prelude.context,
        requestedKind: input.kind,
      },
      { provider, brainRunId: prelude.brainRun.id },
    );

    return await persistArtifactOutput(db, prelude, output);
  } catch (error) {
    await markArtifactRunFailed(db, prelude.brainRun.id, error);
    throw error;
  }
}

export async function generateArtifactOutput(
  input: ArtifactGenerationInput,
  options: { provider?: ArtifactProvider } & BrainRunGuardOptions = {},
): Promise<ArtifactOutput> {
  requireRecordedBrainRun("brain.artifact.challenge_brief", options);

  const provider = options.provider ?? createDefaultArtifactProvider();
  const providerOutput = await provider.generate(input);

  return parseArtifactOutput(providerOutput, input);
}

export function parseArtifactOutput(output: unknown, context: SessionArtifactContext): ArtifactOutput {
  const providerParsed = ArtifactProviderSchema.safeParse(output);

  if (!providerParsed.success) {
    throw new ArtifactGenerationError(
      "Artifact provider output failed validation.",
      flattenIssues(providerParsed.error),
    );
  }

  const strictParsed = ArtifactOutputSchema.safeParse(providerParsed.data);

  if (!strictParsed.success) {
    throw new ArtifactGenerationError("Artifact output failed strict validation.", flattenIssues(strictParsed.error));
  }

  const artifact = strictParsed.data;
  const issues = validateArtifactReferences(artifact, context);

  for (const [path, value] of [
    ["title", artifact.title],
    ["summary", artifact.summary],
    ["keyInsight", artifact.keyInsight],
    ["challengeBrief.challenge", artifact.challengeBrief.challenge],
    ["challengeBrief.whyItMatters", artifact.challengeBrief.whyItMatters],
  ] as const) {
    if (isGenericArtifactText(value)) {
      issues.push(`${path}: Artifact text is too generic for a durable Penny brief.`);
    }
  }

  if (issues.length > 0) {
    throw new ArtifactGenerationError("Artifact output failed local consistency validation.", issues);
  }

  return artifact;
}

export function buildCompiledArtifactPayload(
  context: SessionArtifactContext,
  output: ArtifactOutput,
  brainRunId: string,
): PersistedArtifactSlice["payload"] {
  return compiledArtifactPayload(context, output, brainRunId);
}

export function createDefaultArtifactProvider(
  env: Record<string, string | undefined> = process.env,
): ArtifactProvider {
  if (env.XAI_API_KEY?.trim()) {
    return createXaiArtifactProvider(env);
  }

  return createHeuristicArtifactProvider();
}

export function createHeuristicArtifactProvider(): ArtifactProvider {
  return {
    name: "heuristic",
    async generate(input) {
      return buildHeuristicArtifact(input);
    },
  };
}

export function createXaiArtifactProvider(
  env: Record<string, string | undefined> = process.env,
  options: { generateText?: ArtifactGenerateText } = {},
): ArtifactProvider {
  return {
    name: "xai",
    async generate(input) {
      const apiKey = env.XAI_API_KEY?.trim();

      if (!apiKey) {
        throw new ArtifactProviderError("XAI_API_KEY is required for the xAI artifact provider.");
      }

      const xai = createXai(createXaiSettings(apiKey, env));
      const callGenerateText = options.generateText ?? generateStructuredArtifact;

      try {
        const result = await callGenerateText({
          model: xai.responses(resolveXaiArtifactModel(env)),
          system: buildArtifactSystemPrompt(),
          prompt: buildArtifactPrompt(input),
          output: artifactOutputSpec,
          maxRetries: 1,
          providerOptions: {
            xai: {
              store: false,
            },
          },
        });

        return result.output;
      } catch (error) {
        if (error instanceof ArtifactProviderError) {
          throw error;
        }

        throw new ArtifactProviderError(`xAI artifact request failed: ${formatErrorMessage(error)}`);
      }
    },
  };
}

export function resolveXaiArtifactModel(env: Record<string, string | undefined> = process.env): string {
  return env.XAI_ARTIFACT_MODEL?.trim() || env.XAI_MODEL?.trim() || defaultXaiArtifactModel;
}

export function buildArtifactSystemPrompt(): string {
  return [
    "You are Penny, a controllable thinking instrument enhanced by AI.",
    "Generate one Challenge Brief from the persisted Brain session context only.",
    "Do not invent user history, claims, challenges, sources, facts, evidence, or decisions.",
    "Reference only claim ids and edge ids present in the provided JSON context.",
    "If a response, source, or challenge state is missing, mark it as not_recorded or add a caveat.",
    "Return only the structured artifact object.",
  ].join("\n");
}

export function buildArtifactPrompt(input: ArtifactGenerationInput): string {
  return [
    "Synthesize a Penny Challenge Brief from this structured DB session context.",
    "",
    "Rules:",
    "- Use the current claim version text in claims[].text.",
    "- Treat moves as immutable history, but do not infer events that are not present.",
    "- Make the brief useful for leaving with an Idea Map plus Challenge Brief.",
    "- claimRefs and edgeRefs must reference ids from the JSON context.",
    "",
    `Requested artifact kind: ${input.requestedKind}`,
    "Session context JSON:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

async function createArtifactPrelude(
  db: PennyDatabase,
  input: ArtifactRouteInput,
  provider: ArtifactProvider,
): Promise<ArtifactPrelude> {
  return db.transaction(async (tx) => {
    const context = await loadSessionArtifactContext(tx, input.sessionId);
    const [brainRun] = await tx
      .insert(brainRuns)
      .values({
        sessionId: input.sessionId,
        sourceId: context.sources[0]?.id ?? null,
        operation: "brain.artifact.challenge_brief",
        provider: provider.name,
        model: provider.name === "xai" ? resolveXaiArtifactModel() : null,
        status: "running",
        input: {
          requestedKind: input.kind,
          context,
        },
      })
      .returning();

    if (!brainRun) {
      throw new ArtifactConflictError("Failed to record artifact BrainRun.");
    }

    return { context, brainRun };
  });
}

async function persistArtifactOutput(
  db: PennyDatabase,
  prelude: ArtifactPrelude,
  output: ArtifactOutput,
): Promise<PersistedArtifact> {
  return db.transaction(async (tx) => {
    const claimIds = referencedClaimIds(output);
    const edgeIds = referencedEdgeIds(output);
    const persistedShapes = await persistInferredShapes(tx, {
      sessionId: prelude.context.session.id,
      moves: prelude.context.moves.map(compiledChange),
    });
    const context = withPersistedShapes(prelude.context, persistedShapes);
    const payload = artifactPayload(output, { ...prelude, context }, claimIds, edgeIds);
    const [artifact] = await tx
      .insert(artifacts)
      .values({
        sessionId: prelude.context.session.id,
        kind: "idea_map_challenge_brief",
        title: artifactTitle(output.title),
        summary: output.summary,
        payload,
      })
      .returning();

    if (!artifact) {
      throw new ArtifactConflictError("Failed to create session artifact.");
    }

    const move = await createMove(tx, "artifact_created", {
      sessionId: prelude.context.session.id,
      summary: "Generated a Challenge Brief artifact from persisted Brain state.",
      payload: {
        artifactId: artifact.id,
        artifactKind: artifact.kind,
        brainRunId: prelude.brainRun.id,
        claimIds,
        edgeIds,
        claimVersionIds: prelude.context.claimVersions.map((version) => version.id),
        artifactIds: [artifact.id],
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
      throw new ArtifactConflictError("Failed to complete artifact BrainRun.");
    }

    return {
      artifact: {
        id: artifact.id,
        kind: artifact.kind,
        title: artifact.title,
        summary: artifact.summary,
        payload,
        createdAt: artifact.createdAt.toISOString(),
      },
      move: {
        id: move.id,
        kind: "artifact_created",
        summary: move.summary,
        claimIds,
        edgeIds,
        artifactIds: [artifact.id],
      },
      brainRun: {
        id: completedBrainRun.id,
        status: completedBrainRun.status,
      },
    };
  });
}

type ArtifactTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];

async function loadSessionArtifactContext(
  tx: ArtifactTransaction,
  sessionId: string,
): Promise<SessionArtifactContext> {
  const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

  if (!session) {
    throw new ArtifactNotFoundError("Session was not found.");
  }

  const sourceRows = await tx.select().from(sources).where(eq(sources.sessionId, sessionId)).orderBy(asc(sources.createdAt));
  const claimRows = await tx.select().from(claims).where(eq(claims.sessionId, sessionId)).orderBy(asc(claims.createdAt));

  if (claimRows.length === 0) {
    throw new ArtifactConflictError("Session has no claims to compile into an artifact.");
  }

  const versionRows = await tx
    .select()
    .from(claimVersions)
    .where(inArray(claimVersions.claimId, claimRows.map((claim) => claim.id)))
    .orderBy(asc(claimVersions.createdAt));
  const versionsByClaimId = new Map<string, typeof claimVersions.$inferSelect>();

  for (const version of [...versionRows].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())) {
    if (version.isCurrent && !versionsByClaimId.has(version.claimId)) {
      versionsByClaimId.set(version.claimId, version);
    }
  }

  const contextClaims = claimRows.map((claim) => {
    const version = versionsByClaimId.get(claim.id);

    if (!version) {
      throw new ArtifactConflictError(`Claim ${claim.id} has no current ClaimVersion.`);
    }

    return {
      id: claim.id,
      versionId: version.id,
      kind: claim.kind,
      status: version.status,
      text: version.content,
      confidence: version.confidence,
      sourceId: version.sourceId ?? claim.sourceId,
      createdAt: claim.createdAt.toISOString(),
    };
  });

  const edgeRows = await tx
    .select()
    .from(claimEdges)
    .where(eq(claimEdges.sessionId, sessionId))
    .orderBy(asc(claimEdges.createdAt));
  const moveRows = await tx.select().from(moves).where(eq(moves.sessionId, sessionId)).orderBy(asc(moves.createdAt));
  const artifactRows = await tx
    .select()
    .from(artifacts)
    .where(eq(artifacts.sessionId, sessionId))
    .orderBy(asc(artifacts.createdAt));
  const persistedShapeRows = await tx
    .select()
    .from(shapeRows)
    .where(eq(shapeRows.sessionId, sessionId))
    .orderBy(asc(shapeRows.createdAt));

  return {
    session: {
      id: session.id,
      status: session.status,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
    },
    sources: sourceRows.map((source) => ({
      id: source.id,
      kind: source.kind,
      rawText: source.rawText,
      createdAt: source.createdAt.toISOString(),
    })),
    claims: contextClaims,
    claimVersions: versionRows.map((version) => ({
      id: version.id,
      claimId: version.claimId,
      sourceId: version.sourceId,
      brainRunId: version.brainRunId,
      moveId: version.moveId,
      content: version.content,
      status: version.status,
      confidence: version.confidence,
      isCurrent: version.isCurrent,
      createdAt: version.createdAt.toISOString(),
    })),
    edges: edgeRows.map((edge) => ({
      id: edge.id,
      fromClaimId: edge.fromClaimId,
      toClaimId: edge.toClaimId,
      kind: edge.kind,
      status: edge.status,
      label: edge.label,
      createdAt: edge.createdAt.toISOString(),
    })),
    moves: moveRows.map((move) => ({
      id: move.id,
      kind: move.kind,
      summary: move.summary,
      payload: move.payload,
      createdAt: move.createdAt.toISOString(),
    })),
    artifacts: artifactRows.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      summary: artifact.summary,
      createdAt: artifact.createdAt.toISOString(),
    })),
    shapes: compiledShapesFromRows(persistedShapeRows),
  };
}

export function buildArtifactDraft(state: SessionArtifactState): ArtifactDraft {
  if (state.claims.length === 0) {
    throw new ArtifactConflictError("Cannot compile an artifact for a session without claims.");
  }

  const versionsByClaimId = groupVersions(state.claimVersions);
  const currentVersions = new Map<string, ClaimVersionRow>();
  const claimSnapshots = state.claims.map((claim) => {
    const versions = versionsByClaimId.get(claim.id) ?? [];
    const currentVersion = currentVersionFor(claim, versions);
    currentVersions.set(claim.id, currentVersion);

    return compiledClaim(claim, currentVersion, versions);
  });
  const textByClaimId = new Map(claimSnapshots.map((claim) => [claim.id, claim.text]));
  const challengeEdges = state.edges.filter((edge) => edge.kind === "challenges" || edge.kind === "contradicts");
  const teachesEdges = state.edges.filter((edge) => edge.kind === "teaches");
  const movesByChallengeEdgeId = new Map(
    state.moves
      .map((move) => [stringPayloadValue(move.payload, "challengeEdgeId"), move] as const)
      .filter((entry): entry is [string, MoveRow] => Boolean(entry[0])),
  );
  const challenges = challengeEdges.map((edge) =>
    compiledChallenge(edge, textByClaimId, movesByChallengeEdgeId.get(edge.id)),
  );
  const learnedConcepts = state.claims
    .filter((claim) => claim.kind === "concept")
    .map((claim) => compiledLearnedConcept(claim, currentVersions, teachesEdges))
    .filter((concept): concept is CompiledLearnedConcept => Boolean(concept));
  const unresolvedRisks = buildUnresolvedRisks(claimSnapshots, state.edges, challenges, textByClaimId, state.moves);
  const whatChanged = state.moves.map(compiledStateChange);
  const recommendedNextMove = recommendNextMove(unresolvedRisks, claimSnapshots, learnedConcepts);
  const shapes = state.shapes?.length ? compiledShapesFromRows(state.shapes) : inferredShapeSlices(whatChanged);
  const payload: CompiledArtifactPayload = {
    sessionId: state.session.id,
    generatedFrom: {
      claimCount: state.claims.length,
      claimVersionCount: state.claimVersions.length,
      edgeCount: state.edges.length,
      moveCount: state.moves.length,
      challengeCount: challenges.length,
      learnedConceptCount: learnedConcepts.length,
    },
    ideaMap: {
      claims: claimSnapshots,
      claimVersions: state.claimVersions.map(compiledClaimVersion),
      edges: state.edges.map(compiledEdge),
    },
    challengeBrief: {
      challenges,
      unresolvedRisks,
      whatChanged,
      recommendedNextMove,
    },
    learnedConcepts,
    shapes,
  };
  const title = "Idea Map + Challenge Brief";
  const summary = artifactSummary(claimSnapshots, unresolvedRisks, learnedConcepts, recommendedNextMove);

  return {
    title,
    summary,
    payload,
    claimIds: state.claims.map((claim) => claim.id),
    edgeIds: state.edges.map((edge) => edge.id),
  };
}

function compiledClaimVersion(version: ClaimVersionRow): CompiledClaimVersion {
  return {
    id: version.id,
    claimId: version.claimId,
    sourceId: version.sourceId,
    brainRunId: version.brainRunId,
    moveId: version.moveId,
    content: version.content,
    status: version.status,
    confidence: version.confidence,
    isCurrent: version.isCurrent,
    createdAt: version.createdAt.toISOString(),
  };
}

function groupVersions(versions: ClaimVersionRow[]): Map<string, ClaimVersionRow[]> {
  const grouped = new Map<string, ClaimVersionRow[]>();

  for (const version of versions) {
    const claimVersionsForClaim = grouped.get(version.claimId) ?? [];
    claimVersionsForClaim.push(version);
    grouped.set(version.claimId, claimVersionsForClaim);
  }

  return grouped;
}

function currentVersionFor(claim: ClaimRow, versions: ClaimVersionRow[]): ClaimVersionRow {
  const current = [...versions].reverse().find((version) => version.isCurrent);

  if (current) {
    return current;
  }

  const latest = versions.at(-1);

  if (latest) {
    return latest;
  }

  throw new ArtifactConflictError(`Claim ${claim.id} has no ClaimVersion.`);
}

function compiledClaim(
  claim: ClaimRow,
  currentVersion: ClaimVersionRow,
  versions: ClaimVersionRow[],
): CompiledClaim {
  return {
    id: claim.id,
    kind: claim.kind,
    status: currentVersion.status,
    text: currentVersion.content,
    confidence: currentVersion.confidence,
    currentVersionId: currentVersion.id,
    versions: versions.map((version) => ({
      id: version.id,
      content: version.content,
      confidence: version.confidence,
      status: version.status,
      isCurrent: version.isCurrent,
      createdAt: version.createdAt.toISOString(),
    })),
  };
}

function compiledEdge(edge: EdgeRow): CompiledEdge {
  return {
    id: edge.id,
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    kind: edge.kind,
    status: edge.status,
    label: edge.label,
  };
}

function compiledChallenge(
  edge: EdgeRow,
  textByClaimId: Map<string, string>,
  move: MoveRow | undefined,
): CompiledChallenge {
  if (edge.kind !== "challenges" && edge.kind !== "contradicts") {
    throw new ArtifactConflictError("Expected challenge or contradiction edge.");
  }

  return {
    edgeId: edge.id,
    kind: edge.kind,
    status: edge.status,
    failureType: edge.label,
    strength: stringPayloadValue(move?.payload, "strength"),
    targetClaimId: edge.toClaimId,
    target: textByClaimId.get(edge.toClaimId) ?? "Unknown target claim.",
    critiqueClaimId: edge.fromClaimId,
    critique: textByClaimId.get(edge.fromClaimId) ?? "Unknown critique claim.",
  };
}

function compiledLearnedConcept(
  claim: ClaimRow,
  currentVersions: Map<string, ClaimVersionRow>,
  teachesEdges: EdgeRow[],
): CompiledLearnedConcept | null {
  const version = currentVersions.get(claim.id);

  if (!version) {
    return null;
  }

  const conceptEdges = teachesEdges.filter((edge) => edge.fromClaimId === claim.id || edge.toClaimId === claim.id);
  const teachesClaimIds = conceptEdges.map((edge) => (edge.fromClaimId === claim.id ? edge.toClaimId : edge.fromClaimId));

  return {
    claimId: claim.id,
    versionId: version.id,
    term: conceptTerm(conceptEdges[0]?.label, version.content),
    explanation: version.content,
    teachesClaimIds,
    edgeIds: conceptEdges.map((edge) => edge.id),
  };
}

function buildUnresolvedRisks(
  sessionClaims: CompiledClaim[],
  edges: EdgeRow[],
  challenges: CompiledChallenge[],
  textByClaimId: Map<string, string>,
  moveRows: ChallengeResponseMoveCandidate[],
): CompiledRisk[] {
  const challengeRisks = challenges
    .filter(
      (challenge) =>
        challenge.status === "acknowledged_vulnerability" ||
        (challenge.status === "active" && !challengeResponseMoveForEdge(moveRows, challenge.edgeId)),
    )
    .map((challenge) => ({
      kind: "challenge" as const,
      claimId: challenge.targetClaimId,
      edgeId: challenge.edgeId,
      status: challenge.status,
      text: challenge.critique,
      reason:
        challenge.status === "acknowledged_vulnerability"
          ? "Acknowledged challenge remains a vulnerability."
          : "Active challenge has not been defended, revised, or absorbed.",
    }));
  const challengedClaimIds = new Set(challengeRisks.map((risk) => risk.claimId));
  const assumptionClaimIds = new Set(sessionClaims.filter((claim) => claim.kind === "assumption").map((claim) => claim.id));
  const assumptionRisks = edges
    .filter((edge) => edge.kind === "depends_on" && assumptionClaimIds.has(edge.toClaimId) && !challengedClaimIds.has(edge.toClaimId))
    .slice(0, 3)
    .map((edge) => ({
      kind: "assumption" as const,
      claimId: edge.toClaimId,
      edgeId: edge.id,
      status: edge.status,
      text: textByClaimId.get(edge.toClaimId) ?? "Unknown assumption.",
      reason: "Dependency assumption still needs confirmation, rejection, or refinement.",
    }));

  return [...challengeRisks, ...assumptionRisks];
}

function compiledStateChange(move: MoveRow): CompiledChange {
  return {
    moveId: move.id,
    kind: move.kind,
    summary: move.summary,
    claimIds: stringArrayPayloadValue(move.payload, "claimIds"),
    edgeIds: stringArrayPayloadValue(move.payload, "edgeIds"),
    createdAt: move.createdAt.toISOString(),
  };
}

function recommendNextMove(
  risks: CompiledRisk[],
  claims: CompiledClaim[],
  learnedConcepts: CompiledLearnedConcept[],
): string {
  const challengeRisk = risks.find((risk) => risk.kind === "challenge");

  if (challengeRisk) {
    return `Respond to the unresolved challenge on "${clipText(challengeRisk.text, 120)}" with Defend, Revise, or Absorb.`;
  }

  const assumptionRisk = risks.find((risk) => risk.kind === "assumption");

  if (assumptionRisk) {
    return `Confirm, reject, or refine the assumption "${clipText(assumptionRisk.text, 120)}".`;
  }

  if (learnedConcepts.length === 0) {
    const target = claims.find((claim) => claim.kind === "assumption") ?? claims[0];

    return `Use Makes Cents on a term inside "${clipText(target?.text ?? "the current claim", 120)}" before the next challenge.`;
  }

  const weakestClaim = [...claims].sort((left, right) => left.confidence - right.confidence)[0];

  return `Issue the next challenge against "${clipText(weakestClaim?.text ?? "the weakest claim", 120)}".`;
}

function artifactSummary(
  claims: CompiledClaim[],
  risks: CompiledRisk[],
  learnedConcepts: CompiledLearnedConcept[],
  recommendedNextMove: string,
): string {
  return `${claims.length} claims, ${risks.length} unresolved risks, ${learnedConcepts.length} learned concepts. Next: ${recommendedNextMove}`;
}

function buildHeuristicArtifact(input: ArtifactGenerationInput): ArtifactOutput {
  const seedClaim = input.claims.find((claim) => claim.kind === "belief") ?? input.claims[0];
  const challengeEdges = input.edges.filter((edge) => edge.kind === "challenges" || edge.kind === "contradicts");
  const challengeEdge = challengeEdges.find((edge) => edge.status === "active") ?? challengeEdges[0];
  const targetClaim = input.claims.find((claim) => claim.id === challengeEdge?.toClaimId) ?? seedClaim;
  const critiqueClaim = input.claims.find((claim) => claim.id === challengeEdge?.fromClaimId);
  const assumptionRefs = input.claims.filter((claim) => claim.kind === "assumption").slice(0, 4);
  const responseState = inferResponseState(input.moves);
  const failureType = isArtifactFailureType(challengeEdge?.label) ? challengeEdge.label : "shaky_assumption";
  const claimRefs = uniqueClaimRefs([
    seedClaim ? { claimId: seedClaim.id, role: "seed" as const, reason: "Root idea behind the session." } : null,
    targetClaim
      ? {
          claimId: targetClaim.id,
          role: targetClaim.kind === "assumption" ? ("assumption" as const) : ("supporting" as const),
          reason: "Current target for the challenge brief.",
        }
      : null,
    critiqueClaim
      ? { claimId: critiqueClaim.id, role: "challenge" as const, reason: "Persisted challenge claim." }
      : null,
    ...assumptionRefs.map((claim) => ({
      claimId: claim.id,
      role: "assumption" as const,
      reason: `Assumption currently marked ${claim.status}.`,
    })),
  ]);
  const edgeRefs = challengeEdges.slice(0, 3).map((edge) => ({
    edgeId: edge.id,
    reason: `Challenge edge currently ${edge.status}.`,
  }));
  const targetText = targetClaim?.text ?? seedClaim?.text ?? "No target claim recorded.";
  const critiqueText = critiqueClaim?.text ?? `The weakest recorded part is whether "${clipText(targetText, 100)}" can survive its assumptions.`;
  const parsed = ArtifactOutputSchema.safeParse({
    kind: "challenge_brief",
    title: `Challenge Brief: ${clipText(seedClaim?.text ?? targetText, 82)}`,
    summary: `This brief compiles the persisted Brain state around "${clipText(targetText, 120)}" and its recorded challenge posture.`,
    keyInsight: `The strongest next thinking move is to pressure "${clipText(targetText, 120)}" rather than add a new unconnected idea.`,
    challengeBrief: {
      targetClaimId: targetClaim?.id ?? seedClaim?.id,
      failureType,
      challenge: critiqueText,
      whyItMatters: `This is load-bearing because the map currently depends on the target claim and its ${assumptionRefs.length} recorded assumptions.`,
      responseState,
    },
    claimRefs,
    edgeRefs,
    nextMoves: [
      {
        title: responseState === "unanswered" ? "Answer the challenge" : "Review the accepted weakness",
        rationale:
          responseState === "unanswered"
            ? "The challenge has not yet been resolved with Defend, Revise, or Absorb in the move history."
            : "The move history records a response, so the next pass should check whether the map changed enough.",
      },
      {
        title: "Recheck active assumptions",
        rationale: "Confirmed, rejected, and refined assumptions remain the clearest places to improve the idea map.",
      },
    ],
    caveats: input.moves.length === 0 ? ["No move history is recorded for this session."] : [],
  });

  if (!parsed.success) {
    throw new ArtifactConflictError("Generated heuristic artifact failed local validation.");
  }

  return parsed.data;
}

function inferResponseState(contextMoves: SessionArtifactContext["moves"]): z.infer<typeof ArtifactResponseStateSchema> {
  const responseMoves = contextMoves.filter((move) =>
    ["user_defended", "claim_revised", "critique_absorbed"].includes(move.kind),
  );
  const responseKinds = new Set(responseMoves.map((move) => move.kind));

  if (responseKinds.size > 1) {
    return "mixed";
  }

  if (responseKinds.has("user_defended")) {
    return "defended";
  }

  if (responseKinds.has("claim_revised")) {
    return "revised";
  }

  if (responseKinds.has("critique_absorbed")) {
    return "absorbed";
  }

  return "unanswered";
}

function validateArtifactReferences(artifact: ArtifactOutput, context: SessionArtifactContext): string[] {
  const claimIds = new Set(context.claims.map((claim) => claim.id));
  const edgeIds = new Set(context.edges.map((edge) => edge.id));
  const issues: string[] = [];

  if (!claimIds.has(artifact.challengeBrief.targetClaimId)) {
    issues.push("challengeBrief.targetClaimId must reference a persisted claim in this session.");
  }

  for (const [index, ref] of artifact.claimRefs.entries()) {
    if (!claimIds.has(ref.claimId)) {
      issues.push(`claimRefs.${index}.claimId must reference a persisted claim in this session.`);
    }
  }

  for (const [index, ref] of artifact.edgeRefs.entries()) {
    if (!edgeIds.has(ref.edgeId)) {
      issues.push(`edgeRefs.${index}.edgeId must reference a persisted edge in this session.`);
    }
  }

  return issues;
}

function referencedClaimIds(output: ArtifactOutput): string[] {
  return [
    ...new Set([
      output.challengeBrief.targetClaimId,
      ...output.claimRefs.map((ref) => ref.claimId),
    ]),
  ];
}

function referencedEdgeIds(output: ArtifactOutput): string[] {
  return [...new Set(output.edgeRefs.map((ref) => ref.edgeId))];
}

function artifactPayload(
  output: ArtifactOutput,
  prelude: ArtifactPrelude,
  claimIds: string[],
  edgeIds: string[],
): PersistedArtifactSlice["payload"] {
  return compiledArtifactPayload(prelude.context, output, prelude.brainRun.id, { claimIds, edgeIds });
}

function compiledArtifactPayload(
  context: SessionArtifactContext,
  output: ArtifactOutput,
  brainRunId: string,
  references: { claimIds?: string[]; edgeIds?: string[] } = {},
): PersistedArtifactSlice["payload"] {
  const claimIds = references.claimIds ?? referencedClaimIds(output);
  const edgeIds = references.edgeIds ?? referencedEdgeIds(output);
  const challenges = compiledChallenges(context);
  const unresolvedRisks = compiledRisks(context, challenges);
  const whatChanged = context.moves.map(compiledChange);
  const recommendedNextMove = recommendedMove(output, unresolvedRisks);
  const learnedConcepts = compiledLearnedConcepts(context);
  const shapes = context.shapes?.length ? context.shapes : inferredShapeSlices(whatChanged);

  return {
    sessionId: context.session.id,
    generatedFrom: {
      claimCount: context.claims.length,
      claimVersionCount: context.claimVersions.length,
      edgeCount: context.edges.length,
      moveCount: context.moves.length,
      challengeCount: challenges.length,
      learnedConceptCount: learnedConcepts.length,
    },
    ideaMap: {
      claims: compiledClaims(context),
      claimVersions: context.claimVersions,
      edges: compiledEdges(context),
    },
    challengeBrief: {
      challenges,
      unresolvedRisks,
      whatChanged,
      recommendedNextMove,
    },
    learnedConcepts,
    shapes,
    synthesis: output,
    generatedBy: {
      brainRunId,
      sourceIds: context.sources.map((source) => source.id),
      claimIds,
      claimVersionIds: context.claimVersions.map((version) => version.id),
      edgeIds,
      moveIds: context.moves.map((move) => move.id),
      existingArtifactIds: context.artifacts.map((artifact) => artifact.id),
    },
  };
}

function withPersistedShapes(context: SessionArtifactContext, persistedShapes: PersistedShape[]): SessionArtifactContext {
  return {
    ...context,
    shapes: compiledShapesFromRows(persistedShapes),
  };
}

function uniqueClaimRefs(refs: Array<ArtifactOutput["claimRefs"][number] | null>): ArtifactOutput["claimRefs"] {
  const seen = new Set<string>();
  const unique: ArtifactOutput["claimRefs"] = [];

  for (const ref of refs) {
    if (!ref || seen.has(ref.claimId)) {
      continue;
    }

    seen.add(ref.claimId);
    unique.push(ref);
  }

  return unique.slice(0, 12);
}

function compiledClaims(context: SessionArtifactContext): CompiledClaim[] {
  const versionsByClaimId = new Map<string, SessionArtifactContext["claimVersions"]>();

  for (const version of context.claimVersions) {
    const versions = versionsByClaimId.get(version.claimId) ?? [];
    versions.push(version);
    versionsByClaimId.set(version.claimId, versions);
  }

  return context.claims.map((claim) => ({
    id: claim.id,
    kind: claim.kind,
    status: claim.status,
    text: claim.text,
    confidence: claim.confidence,
    currentVersionId: claim.versionId,
    versions: (versionsByClaimId.get(claim.id) ?? []).map((version) => ({
      id: version.id,
      content: version.content,
      confidence: version.confidence,
      status: version.status,
      isCurrent: version.isCurrent,
      createdAt: version.createdAt,
    })),
  }));
}

function compiledEdges(context: SessionArtifactContext): CompiledEdge[] {
  return context.edges.map((edge) => ({
    id: edge.id,
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    kind: edge.kind as EdgeRow["kind"],
    status: edge.status as EdgeRow["status"],
    label: edge.label,
  }));
}

function compiledChallenges(context: SessionArtifactContext): CompiledChallenge[] {
  const claimsById = new Map(context.claims.map((claim) => [claim.id, claim]));

  return context.edges
    .filter((edge) => edge.kind === "challenges" || edge.kind === "contradicts")
    .map((edge) => {
      const target = claimsById.get(edge.toClaimId);
      const critique = claimsById.get(edge.fromClaimId);

      return {
        edgeId: edge.id,
        kind: edge.kind as "challenges" | "contradicts",
        status: edge.status as EdgeRow["status"],
        failureType: edge.label,
        strength: stringPayloadValue(challengeMoveForEdge(context.moves, edge.id)?.payload, "strength"),
        targetClaimId: edge.toClaimId,
        target: target?.text ?? "Unknown target claim.",
        critiqueClaimId: edge.fromClaimId,
        critique: critique?.text ?? "Unknown critique claim.",
      };
    });
}

function challengeMoveForEdge(
  contextMoves: SessionArtifactContext["moves"],
  edgeId: string,
): SessionArtifactContext["moves"][number] | undefined {
  return contextMoves.find((move) => stringPayloadValue(move.payload, "challengeEdgeId") === edgeId);
}

function compiledLearnedConcepts(context: SessionArtifactContext): CompiledLearnedConcept[] {
  const currentVersionsByClaimId = new Map(
    context.claimVersions.filter((version) => version.isCurrent).map((version) => [version.claimId, version]),
  );
  const teachesEdges = context.edges.filter((edge) => edge.kind === "teaches");

  return context.claims
    .filter((claim) => claim.kind === "concept")
    .map((claim) => {
      const version = currentVersionsByClaimId.get(claim.id);

      if (!version) {
        return null;
      }

      const conceptEdges = teachesEdges.filter((edge) => edge.fromClaimId === claim.id || edge.toClaimId === claim.id);

      return {
        claimId: claim.id,
        versionId: version.id,
        term: conceptTerm(conceptEdges[0]?.label, version.content),
        explanation: version.content,
        teachesClaimIds: conceptEdges.map((edge) => (edge.fromClaimId === claim.id ? edge.toClaimId : edge.fromClaimId)),
        edgeIds: conceptEdges.map((edge) => edge.id),
      };
    })
    .filter((concept): concept is CompiledLearnedConcept => Boolean(concept));
}

function conceptTerm(edgeLabel: string | null | undefined, content: string): string {
  if (edgeLabel?.trim()) {
    return edgeLabel.trim();
  }

  const firstLine = content.split("\n")[0]?.trim() ?? content.trim();
  const [term] = firstLine.split(":");

  return term?.trim() || "Concept";
}

function compiledRisks(context: SessionArtifactContext, challenges: CompiledChallenge[]): CompiledRisk[] {
  const claimsById = new Map(context.claims.map((claim) => [claim.id, claim]));
  const challengeRisks = challenges
    .filter(
      (challenge) =>
        challenge.status === "acknowledged_vulnerability" ||
        (challenge.status === "active" && !challengeResponseMoveForEdge(context.moves, challenge.edgeId)),
    )
    .map((challenge) => ({
      kind: "challenge" as const,
      claimId: challenge.targetClaimId,
      edgeId: challenge.edgeId,
      status: challenge.status,
      text: challenge.critique,
      reason:
        challenge.status === "acknowledged_vulnerability"
          ? "Acknowledged challenge remains a vulnerability."
          : "Active challenge has not been resolved by a response move.",
    }));
  const challengedClaimIds = new Set(challengeRisks.map((risk) => risk.claimId));
  const assumptionClaimIds = new Set(context.claims.filter((claim) => claim.kind === "assumption").map((claim) => claim.id));
  const assumptionRisks = context.edges
    .filter((edge) => edge.kind === "depends_on" && assumptionClaimIds.has(edge.toClaimId) && !challengedClaimIds.has(edge.toClaimId))
    .slice(0, 3)
    .map((edge) => {
      const claim = claimsById.get(edge.toClaimId);

      return {
        kind: "assumption" as const,
        claimId: edge.toClaimId,
        edgeId: edge.id,
        status: edge.status,
        text: claim?.text ?? "Unknown assumption.",
        reason: "Dependency assumption still needs confirmation, rejection, or refinement.",
      };
    });

  return [...challengeRisks, ...assumptionRisks];
}

function compiledChange(move: SessionArtifactContext["moves"][number]): CompiledChange {
  return {
    moveId: move.id,
    kind: move.kind,
    summary: move.summary,
    claimIds: stringArrayPayloadValue(move.payload, "claimIds"),
    edgeIds: stringArrayPayloadValue(move.payload, "edgeIds"),
    createdAt: move.createdAt,
  };
}

type ChallengeResponseMoveCandidate = {
  kind: string;
  payload: unknown;
};

function challengeResponseMoveForEdge(
  moveRows: ChallengeResponseMoveCandidate[],
  edgeId: string,
): ChallengeResponseMoveCandidate | undefined {
  return moveRows.find((move) => {
    if (!["user_defended", "claim_revised", "critique_absorbed"].includes(move.kind)) {
      return false;
    }

    return stringArrayPayloadValue(move.payload, "edgeIds").includes(edgeId) || stringPayloadValue(move.payload, "challengeEdgeId") === edgeId;
  });
}

function recommendedMove(output: ArtifactOutput, risks: CompiledRisk[]): string {
  const challengeRisk = risks.find((risk) => risk.kind === "challenge");

  if (challengeRisk) {
    return `Respond to "${clipText(challengeRisk.text, 120)}" with Defend, Revise, or Absorb.`;
  }

  const assumptionRisk = risks.find((risk) => risk.kind === "assumption");

  if (assumptionRisk) {
    return `Confirm, reject, or refine "${clipText(assumptionRisk.text, 120)}".`;
  }

  const next = output.nextMoves[0];

  return next ? `${next.title}: ${next.rationale}` : "Issue the next challenge against the weakest current claim.";
}

function artifactTitle(title: string): string {
  if (/idea map/i.test(title)) {
    return title;
  }

  return `Idea Map + ${title}`;
}

function isArtifactFailureType(value: string | null | undefined): value is z.infer<typeof ArtifactFailureTypeSchema> {
  return Boolean(value && ArtifactFailureTypeSchema.safeParse(value).success && value !== "not_recorded");
}

function isGenericArtifactText(value: string): boolean {
  return /\b(as an ai|generic response|cannot determine|insufficient information)\b/i.test(value);
}

async function markArtifactRunFailed(db: PennyDatabase, brainRunId: string, error: unknown): Promise<void> {
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

async function generateStructuredArtifact(request: Parameters<ArtifactGenerateText>[0]): Promise<{ output: unknown }> {
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
      ok: true,
      value: {},
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

function artifactErrorResponse(error: unknown): Response {
  if (error instanceof ArtifactNotFoundError) {
    return jsonResponse(
      {
        error: {
          code: "artifact_not_found",
          message: error.message,
        },
      },
      404,
    );
  }

  if (error instanceof ArtifactConflictError) {
    return jsonResponse(
      {
        error: {
          code: "artifact_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  if (error instanceof ArtifactGenerationError) {
    return jsonResponse(
      {
        error: {
          code: "invalid_artifact_output",
          message: error.message,
          issues: error.issues,
        },
      },
      502,
    );
  }

  if (error instanceof ArtifactProviderError) {
    return jsonResponse(
      {
        error: {
          code: "artifact_provider_failed",
          message: error.message,
        },
      },
      502,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "artifact_failed",
        message: formatErrorMessage(error),
      },
    },
    500,
  );
}

function resolveArtifactDb(
  options: { db?: PennyDatabase; databaseUrl?: string },
  hasInjectedCompileArtifact: boolean,
): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedCompileArtifact) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireArtifactDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for POST /brain/session/:sessionId/artifact.");
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

function stringPayloadValue(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === "string" ? value : null;
}

function stringArrayPayloadValue(payload: unknown, key: string): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const value = (payload as Record<string, unknown>)[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
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
