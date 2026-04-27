import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainRuns, claimEdges, claimVersions, claims, moves } from "./db/schema.ts";
import { FailureTypeSchema } from "./schema.ts";

const ChallengeRequestSchema = z
  .object({
    targetClaimId: z.string().uuid(),
  })
  .strict();

const ChallengeOutputSchema = z
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
export type ChallengeResponseRequest = z.infer<typeof ChallengeResponseRequestSchema>;

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

export async function persistChallenge(db: PennyDatabase, input: ChallengeRequest): Promise<PersistedChallenge> {
  return db.transaction(async (tx) => {
    const target = await loadClaimWithCurrentVersion(tx, input.targetClaimId);
    const challenge = buildChallengeOutput(target.version.content);
    const [brainRun] = await tx
      .insert(brainRuns)
      .values({
        sessionId: target.claim.sessionId,
        sourceId: target.claim.sourceId,
        operation: "brain.challenge",
        provider: "heuristic",
        model: null,
        status: "succeeded",
        input: {
          targetClaimId: target.claim.id,
          targetClaimVersionId: target.version.id,
        },
        output: challenge,
        completedAt: new Date(),
      })
      .returning();

    if (!brainRun) {
      throw new ChallengeConflictError("Failed to record challenge BrainRun.");
    }

    const [critiqueClaim] = await tx
      .insert(claims)
      .values({
        sessionId: target.claim.sessionId,
        sourceId: target.claim.sourceId,
        kind: "belief",
        status: "exploratory",
        text: challenge.critique,
        confidence: confidenceForStrength(challenge.strength),
      })
      .returning();

    if (!critiqueClaim) {
      throw new ChallengeConflictError("Failed to create critique claim.");
    }

    const [critiqueVersion] = await tx
      .insert(claimVersions)
      .values({
        claimId: critiqueClaim.id,
        sourceId: target.claim.sourceId,
        content: challenge.critique,
        status: "exploratory",
        confidence: critiqueClaim.confidence,
        isCurrent: true,
      })
      .returning();

    if (!critiqueVersion) {
      throw new ChallengeConflictError("Failed to create critique ClaimVersion.");
    }

    const [edge] = await tx
      .insert(claimEdges)
      .values({
        sessionId: target.claim.sessionId,
        fromClaimId: critiqueClaim.id,
        toClaimId: target.claim.id,
        kind: "challenges",
        status: "active",
        label: challenge.failureType,
      })
      .returning();

    if (!edge) {
      throw new ChallengeConflictError("Failed to create challenge edge.");
    }

    const move = await createChallengeMove(tx, {
      sessionId: target.claim.sessionId,
      kind: "challenge_issued",
      summary: "Issued a first challenge against the target claim.",
      claimIds: [target.claim.id, critiqueClaim.id],
      edgeIds: [edge.id],
      payload: {
        targetClaimId: target.claim.id,
        targetClaimVersionId: target.version.id,
        critiqueClaimId: critiqueClaim.id,
        critiqueClaimVersionId: critiqueVersion.id,
        challengeEdgeId: edge.id,
        brainRunId: brainRun.id,
        failureType: challenge.failureType,
        strength: challenge.strength,
        provenanceTag: challenge.provenanceTag,
      },
    });

    return {
      ...challenge,
      targetClaim: claimSlice(target.claim, target.version),
      critiqueClaim: claimSlice(critiqueClaim, critiqueVersion),
      challengeEdge: edgeSlice(edge),
      move,
      brainRun: {
        id: brainRun.id,
        status: brainRun.status,
      },
    };
  });
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
      const move = await createChallengeMove(tx, {
        sessionId: target.claim.sessionId,
        kind: "user_defended",
        summary: "User defended the target claim against the critique.",
        claimIds: [target.claim.id, critiqueClaim.id],
        edgeIds: [edge.id],
        payload: {
          response: response.response,
          reasoning: response.reasoning,
          targetClaimId: target.claim.id,
          targetClaimVersionId: target.version.id,
          critiqueClaimId: critiqueClaim.id,
          challengeEdgeId: edge.id,
        },
      });

      return {
        response: response.response,
        targetClaim: claimSlice(target.claim, target.version),
        critiqueClaimId: critiqueClaim.id,
        challengeEdge: edgeSlice(edge),
        move,
      };
    }

    if (response.response === "revise") {
      await tx
        .update(claimVersions)
        .set({ isCurrent: false })
        .where(and(eq(claimVersions.claimId, target.claim.id), eq(claimVersions.isCurrent, true)));

      const [newVersion] = await tx
        .insert(claimVersions)
        .values({
          claimId: target.claim.id,
          sourceId: target.version.sourceId ?? target.claim.sourceId,
          content: response.revisedText,
          status: "exploratory",
          confidence: target.version.confidence,
          isCurrent: true,
        })
        .returning();

      if (!newVersion) {
        throw new ChallengeConflictError("Failed to create revised ClaimVersion.");
      }

      const [updatedClaim] = await tx
        .update(claims)
        .set({
          text: newVersion.content,
          confidence: newVersion.confidence,
          status: newVersion.status,
          updatedAt: new Date(),
        })
        .where(eq(claims.id, target.claim.id))
        .returning();

      if (!updatedClaim) {
        throw new ChallengeConflictError("Failed to update revised target claim.");
      }

      const move = await createChallengeMove(tx, {
        sessionId: target.claim.sessionId,
        kind: "claim_revised",
        summary: "User revised the target claim in response to the critique.",
        claimIds: [target.claim.id, critiqueClaim.id],
        edgeIds: [edge.id],
        payload: {
          response: response.response,
          reasoning: response.reasoning ?? null,
          targetClaimId: target.claim.id,
          previousClaimVersionId: target.version.id,
          currentClaimVersionId: newVersion.id,
          critiqueClaimId: critiqueClaim.id,
          challengeEdgeId: edge.id,
        },
      });

      return {
        response: response.response,
        targetClaim: claimSlice(updatedClaim, newVersion),
        critiqueClaimId: critiqueClaim.id,
        challengeEdge: edgeSlice(edge),
        move,
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

    const move = await createChallengeMove(tx, {
      sessionId: target.claim.sessionId,
      kind: "critique_absorbed",
      summary: "User absorbed the critique as an acknowledged vulnerability.",
      claimIds: [target.claim.id, critiqueClaim.id],
      edgeIds: [acknowledgedEdge.id],
      payload: {
        response: response.response,
        reasoning: response.reasoning ?? null,
        targetClaimId: target.claim.id,
        targetClaimVersionId: target.version.id,
        critiqueClaimId: critiqueClaim.id,
        challengeEdgeId: acknowledgedEdge.id,
        edgeStatus: acknowledgedEdge.status,
      },
    });

    return {
      response: response.response,
      targetClaim: claimSlice(target.claim, target.version),
      critiqueClaimId: critiqueClaim.id,
      challengeEdge: edgeSlice(acknowledgedEdge),
      move,
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

async function createChallengeMove(
  tx: ChallengeTransaction,
  input: {
    sessionId: string;
    kind: PersistedMoveSlice["kind"];
    summary: string;
    claimIds: string[];
    edgeIds: string[];
    payload: Record<string, unknown>;
  },
): Promise<PersistedMoveSlice> {
  const [move] = await tx
    .insert(moves)
    .values({
      sessionId: input.sessionId,
      kind: input.kind,
      summary: input.summary,
      payload: {
        ...input.payload,
        claimIds: input.claimIds,
        edgeIds: input.edgeIds,
      },
    })
    .returning();

  if (!move) {
    throw new ChallengeConflictError("Failed to create challenge move.");
  }

  return {
    id: move.id,
    kind: move.kind as PersistedMoveSlice["kind"],
    summary: move.summary,
    claimIds: input.claimIds,
    edgeIds: input.edgeIds,
    artifactIds: [],
  };
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
