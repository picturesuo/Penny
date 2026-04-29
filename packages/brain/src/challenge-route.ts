import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainRuns, claimEdges, claimVersions, claims } from "./db/schema.ts";
import { requireRecordedBrainRun, type BrainRunGuardOptions } from "./brain-run-guard.ts";
import { createMove, type CreatedMove } from "./move-payloads.ts";
import { FailureTypeSchema, flattenIssues } from "./schema.ts";

const ChallengeRequestSchema = z
  .object({
    targetClaimId: z.string().uuid(),
  })
  .strict();

export const ChallengeProviderSchema = z
  .object({
    critique: z.string(),
    failureType: FailureTypeSchema,
    strength: z.enum(["weak", "moderate", "strong"]),
    provenanceTag: z.string(),
    whyThisCritique: z.string(),
    whatWouldResolveIt: z.string(),
    suggestedNextMove: z.string(),
  })
  .strict();

export const ChallengeOutputSchema = z
  .object({
    critique: z.string().trim().min(1).max(900),
    failureType: FailureTypeSchema,
    strength: z.enum(["weak", "moderate", "strong"]),
    provenanceTag: z.string().trim().min(1).max(120),
    whyThisCritique: z.string().trim().min(1).max(700),
    whatWouldResolveIt: z.string().trim().min(1).max(700),
    suggestedNextMove: z.string().trim().min(1).max(500),
  })
  .strict();

const ChallengeResponseRequestSchema = z.discriminatedUnion("response", [
  z
    .object({
      challengeEdgeId: z.string().uuid(),
      response: z.literal("defend"),
      reasoning: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      challengeEdgeId: z.string().uuid(),
      response: z.literal("revise"),
      revisedText: z.string().trim().min(1).max(4_000),
      reasoning: z.string().trim().min(1).max(2_000).optional(),
    })
    .strict(),
  z
    .object({
      challengeEdgeId: z.string().uuid(),
      response: z.literal("absorb"),
      reasoning: z.string().trim().min(1).max(2_000).optional(),
    })
    .strict(),
]);

export type ChallengeRequest = z.infer<typeof ChallengeRequestSchema>;
export type ChallengeOutput = z.infer<typeof ChallengeOutputSchema>;
export type ChallengeProviderOutput = z.infer<typeof ChallengeProviderSchema>;
export type ChallengeResponseRequest = z.infer<typeof ChallengeResponseRequestSchema>;

export type ChallengeGenerationInput = {
  targetClaimId: string;
  targetKind: "belief" | "assumption" | "question" | "concept";
  targetText: string;
  targetStatus: "exploratory" | "committed" | "resolved" | "rejected";
  targetConfidence: number;
};

const challengeOutputSpec = Output.object<ChallengeProviderOutput>({
  schema: ChallengeProviderSchema,
  name: "penny_brain_challenge",
  description: "A targeted Penny challenge against one stable claim.",
});

export type ChallengeGenerateText = (request: {
  model: LanguageModel;
  system: string;
  prompt: string;
  output: typeof challengeOutputSpec;
  maxRetries: number;
  providerOptions: {
    xai: {
      store: false;
    };
  };
}) => Promise<{ output: unknown }>;

export type ChallengeProvider = {
  name: string;
  generate(input: ChallengeGenerationInput): Promise<unknown>;
};

export const defaultXaiBrainChallengeModel = "grok-4.20-reasoning";

export type PersistedChallenge = ChallengeOutput & {
  targetClaim: PersistedClaimSlice;
  critiqueClaim: PersistedClaimSlice;
  challengeEdge: PersistedChallengeEdge;
  move: PersistedMoveSlice;
  brainRun: {
    id: string;
    status: string;
  };
};

export type PersistedChallengeResponse = {
  response: ChallengeResponseRequest["response"];
  targetClaim: PersistedClaimSlice;
  critiqueClaimId: string;
  challengeEdge: PersistedChallengeEdge;
  move: PersistedMoveSlice;
};

export type ChallengeRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  issueChallenge?: (input: ChallengeRequest, options: { db?: PennyDatabase }) => Promise<PersistedChallenge>;
};

export type ChallengeRespondRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  persistResponse?: (
    response: ChallengeResponseRequest,
    options: { db?: PennyDatabase },
  ) => Promise<PersistedChallengeResponse>;
};

type PersistedClaimSlice = {
  id: string;
  versionId: string;
  kind: "belief" | "assumption" | "question" | "concept";
  status: "exploratory" | "committed" | "resolved" | "rejected";
  text: string;
  confidence: number;
};

type PersistedChallengeEdge = {
  id: string;
  fromClaimId: string;
  toClaimId: string;
  kind: "challenges" | "contradicts";
  status: "active" | "acknowledged_vulnerability";
  label: string | null;
};

type PersistedMoveSlice = {
  id: string;
  kind: "challenge_issued" | "user_defended" | "claim_revised" | "critique_absorbed";
  summary: string;
  claimIds: string[];
  edgeIds: string[];
  artifactIds: string[];
};

export async function handleChallengeRequest(
  request: Request,
  options: ChallengeRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /brain/challenge requires the POST method.");
  }

  const parsed = await parseJsonRequest(request, ChallengeRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const db = resolveChallengeDb(options, Boolean(options.issueChallenge));
  const issueChallenge =
    options.issueChallenge ??
    ((input: ChallengeRequest, issueOptions: { db?: PennyDatabase }) =>
      persistChallenge(requireChallengeDb(issueOptions.db), input));

  try {
    return jsonResponse({ data: await issueChallenge(parsed.data, dbOption(db)) }, 201);
  } catch (error) {
    return challengeErrorResponse(error);
  }
}

export async function handleChallengeRespondRequest(
  request: Request,
  options: ChallengeRespondRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /brain/challenge/respond requires the POST method.");
  }

  const parsed = await parseJsonRequest(request, ChallengeResponseRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const db = resolveChallengeDb(options, Boolean(options.persistResponse));
  const persistResponse =
    options.persistResponse ??
    ((response: ChallengeResponseRequest, responseOptions: { db?: PennyDatabase }) =>
      persistChallengeResponse(requireChallengeDb(responseOptions.db), response));

  try {
    return jsonResponse({ data: await persistResponse(parsed.data, dbOption(db)) }, 200);
  } catch (error) {
    return challengeErrorResponse(error);
  }
}

export class ChallengeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChallengeNotFoundError";
  }
}

export class ChallengeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChallengeConflictError";
  }
}

export class ChallengeGenerationError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "ChallengeGenerationError";
  }
}

export class ChallengeProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChallengeProviderError";
  }
}

export async function persistChallenge(db: PennyDatabase, input: ChallengeRequest): Promise<PersistedChallenge> {
  const prelude = await db.transaction(async (tx) => {
    const target = await loadClaimWithCurrentVersion(tx, input.targetClaimId);
    const [brainRun] = await tx
      .insert(brainRuns)
      .values({
        sessionId: target.claim.sessionId,
        sourceId: target.claim.sourceId,
        operation: "brain.challenge",
        provider: createDefaultChallengeProvider().name,
        model: process.env.XAI_API_KEY?.trim() ? resolveXaiBrainChallengeModel() : null,
        status: "running",
        input: {
          targetClaimId: target.claim.id,
          targetClaimVersionId: target.version.id,
          targetText: target.version.content,
        },
      })
      .returning();

    if (!brainRun) {
      throw new ChallengeConflictError("Failed to record challenge BrainRun.");
    }

    return { target, brainRun };
  });

  try {
    const challenge = await generateChallengeOutput(challengeGenerationInput(prelude.target), {
      brainRunId: prelude.brainRun.id,
    });

    return await db.transaction(async (tx) => {
      const critiqueConfidence = confidenceForStrength(challenge.strength);
      const [critiqueClaim] = await tx
        .insert(claims)
        .values({
          sessionId: prelude.target.claim.sessionId,
          sourceId: prelude.target.claim.sourceId,
          kind: "belief",
        })
        .returning();

      if (!critiqueClaim) {
        throw new ChallengeConflictError("Failed to create critique claim.");
      }

      const [critiqueVersion] = await tx
        .insert(claimVersions)
        .values({
          claimId: critiqueClaim.id,
          sourceId: prelude.target.claim.sourceId,
          brainRunId: prelude.brainRun.id,
          content: challenge.critique,
          status: "exploratory",
          confidence: critiqueConfidence,
          isCurrent: true,
        })
        .returning();

      if (!critiqueVersion) {
        throw new ChallengeConflictError("Failed to create critique ClaimVersion.");
      }

      const [edge] = await tx
        .insert(claimEdges)
        .values({
          sessionId: prelude.target.claim.sessionId,
          fromClaimId: critiqueClaim.id,
          toClaimId: prelude.target.claim.id,
          kind: "challenges",
          status: "active",
          label: challenge.failureType,
        })
        .returning();

      if (!edge) {
        throw new ChallengeConflictError("Failed to create challenge edge.");
      }

      const move = await createMove(tx, "challenge_issued", {
        sessionId: prelude.target.claim.sessionId,
        summary: "Issued a first challenge against the target claim.",
        payload: {
          targetClaimId: prelude.target.claim.id,
          targetClaimVersionId: prelude.target.version.id,
          critiqueClaimId: critiqueClaim.id,
          critiqueClaimVersionId: critiqueVersion.id,
          challengeEdgeId: edge.id,
          brainRunId: prelude.brainRun.id,
          failureType: challenge.failureType,
          strength: challenge.strength,
          provenanceTag: challenge.provenanceTag,
          claimIds: [prelude.target.claim.id, critiqueClaim.id],
          edgeIds: [edge.id],
        },
      });

      const [completedBrainRun] = await tx
        .update(brainRuns)
        .set({
          status: "succeeded",
          output: challenge,
          error: null,
          completedAt: new Date(),
        })
        .where(eq(brainRuns.id, prelude.brainRun.id))
        .returning();

      if (!completedBrainRun) {
        throw new ChallengeConflictError("Failed to complete challenge BrainRun.");
      }

      return {
        ...challenge,
        targetClaim: claimSlice(prelude.target.claim, prelude.target.version),
        critiqueClaim: claimSlice(critiqueClaim, critiqueVersion),
        challengeEdge: edgeSlice(edge),
        move: challengeMoveSlice(move),
        brainRun: {
          id: completedBrainRun.id,
          status: completedBrainRun.status,
        },
      };
    });
  } catch (error) {
    await markChallengeRunFailed(db, prelude.brainRun.id, error);
    throw error;
  }
}

export async function persistChallengeResponse(
  db: PennyDatabase,
  response: ChallengeResponseRequest,
): Promise<PersistedChallengeResponse> {
  return db.transaction(async (tx) => {
    const [edge] = await tx.select().from(claimEdges).where(eq(claimEdges.id, response.challengeEdgeId)).limit(1);

    if (!edge) {
      throw new ChallengeNotFoundError("Challenge edge was not found.");
    }

    if (edge.kind !== "challenges" && edge.kind !== "contradicts") {
      throw new ChallengeConflictError("Only challenge edges can receive challenge responses.");
    }

    const target = await loadClaimWithCurrentVersion(tx, edge.toClaimId);
    const [critiqueClaim] = await tx.select().from(claims).where(eq(claims.id, edge.fromClaimId)).limit(1);

    if (!critiqueClaim) {
      throw new ChallengeConflictError("Challenge edge has no critique claim.");
    }

    if (response.response === "defend") {
      const move = await createMove(tx, "user_defended", {
        sessionId: target.claim.sessionId,
        summary: "User defended the target claim against the critique.",
        payload: {
          response: response.response,
          reasoning: response.reasoning,
          targetClaimId: target.claim.id,
          targetClaimVersionId: target.version.id,
          critiqueClaimId: critiqueClaim.id,
          challengeEdgeId: edge.id,
          claimIds: [target.claim.id, critiqueClaim.id],
          edgeIds: [edge.id],
        },
      });

      return {
        response: response.response,
        targetClaim: claimSlice(target.claim, target.version),
        critiqueClaimId: critiqueClaim.id,
        challengeEdge: edgeSlice(edge),
        move: challengeMoveSlice(move),
      };
    }

    if (response.response === "revise") {
      const versionId = randomUUID();
      const moveId = randomUUID();
      const move = await createMove(tx, "claim_revised", {
        id: moveId,
        sessionId: target.claim.sessionId,
        summary: "User revised the target claim in response to the critique.",
        payload: {
          response: response.response,
          reasoning: response.reasoning ?? null,
          targetClaimId: target.claim.id,
          previousClaimVersionId: target.version.id,
          currentClaimVersionId: versionId,
          critiqueClaimId: critiqueClaim.id,
          challengeEdgeId: edge.id,
          claimVersionIds: [target.version.id, versionId],
          claimIds: [target.claim.id, critiqueClaim.id],
          edgeIds: [edge.id],
        },
      });

      await tx
        .update(claimVersions)
        .set({ isCurrent: false })
        .where(and(eq(claimVersions.claimId, target.claim.id), eq(claimVersions.isCurrent, true)));

      const [newVersion] = await tx
        .insert(claimVersions)
        .values({
          id: versionId,
          claimId: target.claim.id,
          sourceId: target.version.sourceId ?? target.claim.sourceId,
          moveId: move.id,
          content: response.revisedText,
          status: "exploratory",
          confidence: target.version.confidence,
          isCurrent: true,
        })
        .returning();

      if (!newVersion) {
        throw new ChallengeConflictError("Failed to create revised ClaimVersion.");
      }

      return {
        response: response.response,
        targetClaim: claimSlice(target.claim, newVersion),
        critiqueClaimId: critiqueClaim.id,
        challengeEdge: edgeSlice(edge),
        move: challengeMoveSlice(move),
      };
    }

    const [acknowledgedEdge] = await tx
      .update(claimEdges)
      .set({
        status: "acknowledged_vulnerability",
      })
      .where(eq(claimEdges.id, edge.id))
      .returning();

    if (!acknowledgedEdge) {
      throw new ChallengeConflictError("Failed to acknowledge challenge edge.");
    }

    const move = await createMove(tx, "critique_absorbed", {
      sessionId: target.claim.sessionId,
      summary: "User absorbed the critique as an acknowledged vulnerability.",
      payload: {
        response: response.response,
        reasoning: response.reasoning ?? null,
        targetClaimId: target.claim.id,
        targetClaimVersionId: target.version.id,
        critiqueClaimId: critiqueClaim.id,
        challengeEdgeId: acknowledgedEdge.id,
        edgeStatus: acknowledgedEdge.status,
        claimIds: [target.claim.id, critiqueClaim.id],
        edgeIds: [acknowledgedEdge.id],
      },
    });

    return {
      response: response.response,
      targetClaim: claimSlice(target.claim, target.version),
      critiqueClaimId: critiqueClaim.id,
      challengeEdge: edgeSlice(acknowledgedEdge),
      move: challengeMoveSlice(move),
    };
  });
}

type ChallengeTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];

async function loadClaimWithCurrentVersion(tx: ChallengeTransaction, claimId: string) {
  const [claim] = await tx.select().from(claims).where(eq(claims.id, claimId)).limit(1);

  if (!claim) {
    throw new ChallengeNotFoundError("Target claim was not found.");
  }

  const [version] = await tx
    .select()
    .from(claimVersions)
    .where(and(eq(claimVersions.claimId, claim.id), eq(claimVersions.isCurrent, true)))
    .orderBy(desc(claimVersions.createdAt))
    .limit(1);

  if (!version) {
    throw new ChallengeConflictError("Target claim has no current ClaimVersion.");
  }

  return { claim, version };
}

function challengeMoveSlice(move: CreatedMove<PersistedMoveSlice["kind"]>): PersistedMoveSlice {
  return {
    id: move.id,
    kind: move.kind,
    summary: move.summary,
    claimIds: move.payload.claimIds,
    edgeIds: move.payload.edgeIds,
    artifactIds: [],
  };
}

export async function generateChallengeOutput(
  input: ChallengeGenerationInput,
  options: { provider?: ChallengeProvider } & BrainRunGuardOptions = {},
): Promise<ChallengeOutput> {
  requireRecordedBrainRun("brain.challenge", options);

  const provider = options.provider ?? createDefaultChallengeProvider();
  const providerOutput = await provider.generate(input);

  return parseChallengeOutput(providerOutput);
}

export function parseChallengeOutput(output: unknown): ChallengeOutput {
  const providerParsed = ChallengeProviderSchema.safeParse(output);

  if (!providerParsed.success) {
    throw new ChallengeGenerationError(
      "Challenge provider output failed validation.",
      flattenIssues(providerParsed.error),
    );
  }

  const strictParsed = ChallengeOutputSchema.safeParse(providerParsed.data);

  if (!strictParsed.success) {
    throw new ChallengeGenerationError("Challenge output failed strict validation.", flattenIssues(strictParsed.error));
  }

  return strictParsed.data;
}

export function createDefaultChallengeProvider(
  env: Record<string, string | undefined> = process.env,
): ChallengeProvider {
  if (env.XAI_API_KEY?.trim()) {
    return createXaiChallengeProvider(env);
  }

  return createHeuristicChallengeProvider();
}

export function createHeuristicChallengeProvider(): ChallengeProvider {
  return {
    name: "heuristic",
    async generate(input) {
      return buildChallengeOutput(input.targetText);
    },
  };
}

export function createXaiChallengeProvider(
  env: Record<string, string | undefined> = process.env,
  options: { generateText?: ChallengeGenerateText } = {},
): ChallengeProvider {
  return {
    name: "xai",
    async generate(input) {
      const apiKey = env.XAI_API_KEY?.trim();

      if (!apiKey) {
        throw new ChallengeProviderError("XAI_API_KEY is required for the xAI challenge provider.");
      }

      const xai = createXai(createXaiSettings(apiKey, env));
      const callGenerateText = options.generateText ?? generateStructuredChallenge;

      try {
        const result = await callGenerateText({
          model: xai.responses(resolveXaiBrainChallengeModel(env)),
          system: buildChallengeSystemPrompt(),
          prompt: buildChallengePrompt(input),
          output: challengeOutputSpec,
          maxRetries: 1,
          providerOptions: {
            xai: {
              store: false,
            },
          },
        });

        return result.output;
      } catch (error) {
        if (error instanceof ChallengeProviderError) {
          throw error;
        }

        throw new ChallengeProviderError(`xAI challenge request failed: ${formatErrorMessage(error)}`);
      }
    },
  };
}

export function resolveXaiBrainChallengeModel(env: Record<string, string | undefined> = process.env): string {
  return env.XAI_BRAIN_CHALLENGE_MODEL?.trim() || env.XAI_MODEL?.trim() || defaultXaiBrainChallengeModel;
}

export function buildChallengeSystemPrompt(): string {
  return [
    "You are Penny, a controllable thinking instrument enhanced by AI.",
    "Challenge one stable claim inside Brain. Do not drift into generic advice or chat.",
    "Attack the weakest load-bearing structure in the target claim.",
    "Do not invent citations, market facts, or external evidence.",
    "Return only the structured challenge object.",
  ].join("\n");
}

export function buildChallengePrompt(input: ChallengeGenerationInput): string {
  return [
    "Create a Penny challenge for the target claim.",
    "",
    "Return:",
    "- critique: a direct challenge the user can Defend, Revise, or Absorb.",
    "- failureType: weak_evidence, missing_counterargument, shaky_assumption, analogy_break, dependency_risk, unaddressed_precedent, premise_rejection, or definition_failure.",
    "- strength: weak, moderate, or strong.",
    "- provenanceTag: a compact internal tag beginning with penny:challenge.",
    "- whyThisCritique: why this is the load-bearing weakness.",
    "- whatWouldResolveIt: what would make the critique weaker or resolved.",
    "- suggestedNextMove: a concise next action.",
    "",
    `Target claim id: ${input.targetClaimId}`,
    `Target kind: ${input.targetKind}`,
    `Target status: ${input.targetStatus}`,
    `Target confidence: ${input.targetConfidence}`,
    `Target text: ${input.targetText}`,
  ].join("\n");
}

function buildChallengeOutput(targetText: string): ChallengeOutput {
  const parsed = ChallengeOutputSchema.safeParse({
    critique: `This claim is vulnerable if "${targetText}" depends on a hidden premise the user has not defended yet.`,
    failureType: "shaky_assumption",
    strength: "moderate",
    provenanceTag: "penny:heuristic.challenge",
    whyThisCritique:
      "The challenge pressures the load-bearing premise instead of adding advice, so the user must decide whether the claim should stand, change, or absorb the weakness.",
    whatWouldResolveIt:
      "The critique weakens if the user can name concrete evidence, a narrower scope, or a revised version that survives the dependency risk.",
    suggestedNextMove: "Defend with reasoning, Revise the claim, or Absorb the critique as an acknowledged vulnerability.",
  });

  if (!parsed.success) {
    throw new ChallengeConflictError("Generated challenge failed local validation.");
  }

  return parsed.data;
}

function challengeGenerationInput(target: Awaited<ReturnType<typeof loadClaimWithCurrentVersion>>): ChallengeGenerationInput {
  return {
    targetClaimId: target.claim.id,
    targetKind: target.claim.kind,
    targetText: target.version.content,
    targetStatus: target.version.status,
    targetConfidence: target.version.confidence,
  };
}

async function markChallengeRunFailed(db: PennyDatabase, brainRunId: string, error: unknown): Promise<void> {
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

async function generateStructuredChallenge(request: Parameters<ChallengeGenerateText>[0]): Promise<{ output: unknown }> {
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

function confidenceForStrength(strength: ChallengeOutput["strength"]): number {
  switch (strength) {
    case "weak":
      return 45;
    case "moderate":
      return 65;
    case "strong":
      return 82;
  }
}

function claimSlice(claim: typeof claims.$inferSelect, version: typeof claimVersions.$inferSelect): PersistedClaimSlice {
  return {
    id: claim.id,
    versionId: version.id,
    kind: claim.kind,
    status: version.status,
    text: version.content,
    confidence: version.confidence,
  };
}

function edgeSlice(edge: typeof claimEdges.$inferSelect): PersistedChallengeEdge {
  if (edge.kind !== "challenges" && edge.kind !== "contradicts") {
    throw new ChallengeConflictError("Expected challenge or contradiction edge.");
  }

  return {
    id: edge.id,
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    kind: edge.kind,
    status: edge.status,
    label: edge.label,
  };
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

function challengeErrorResponse(error: unknown): Response {
  if (error instanceof ChallengeNotFoundError) {
    return jsonResponse(
      {
        error: {
          code: "challenge_not_found",
          message: error.message,
        },
      },
      404,
    );
  }

  if (error instanceof ChallengeConflictError) {
    return jsonResponse(
      {
        error: {
          code: "challenge_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  if (error instanceof ChallengeGenerationError) {
    return jsonResponse(
      {
        error: {
          code: "invalid_challenge_output",
          message: error.message,
          issues: error.issues,
        },
      },
      502,
    );
  }

  if (error instanceof ChallengeProviderError) {
    return jsonResponse(
      {
        error: {
          code: "challenge_provider_failed",
          message: error.message,
        },
      },
      502,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "challenge_failed",
        message: formatErrorMessage(error),
      },
    },
    500,
  );
}

function resolveChallengeDb(
  options: { db?: PennyDatabase; databaseUrl?: string },
  hasInjectedPersistence: boolean,
): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedPersistence) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireChallengeDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for challenge persistence.");
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

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}
