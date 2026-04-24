import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, type DbClient } from "../../db/client.ts";
import { activityEvents, aiJobs, claims, graphEdges, graphNodes, thoughts } from "../../db/schema.ts";
import { createConfiguredAiProvider } from "../providers/configured.ts";
import { createMockAiProvider } from "../providers/mock.ts";
import type { AiProvider, AiProviderResponse } from "../providers/types.ts";
import { PROMPT_VERSION, buildExtractClaimsPrompt } from "../prompts/extractClaims/v1.ts";
import { ExtractClaimsOutputSchema, type ExtractClaimsOutput } from "../schemas/extractClaims.ts";

export type ExtractClaimsInput = {
  thoughtId: string;
};

export type ExtractClaimsContext = {
  requestId?: string | null;
  userId: string;
};

export type CreatedExtractedClaim = {
  id: string;
  userId: string;
  mapId: string;
  thoughtId: string;
  body: string;
  confidenceBps: number;
  graphNodeId: string;
  graphEdgeId: string;
  createdAt: string;
  updatedAt: string;
};

export type ExtractClaimsResult = {
  aiJobId: string;
  claims: CreatedExtractedClaim[];
  thoughtId: string;
};

export class ExtractClaimsValidationError extends Error {
  issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = "ExtractClaimsValidationError";
    this.issues = issues;
  }
}

export class ExtractClaimsNotFoundError extends Error {
  constructor() {
    super("Thought not found for extractClaims.");
    this.name = "ExtractClaimsNotFoundError";
  }
}

export class ExtractClaimsWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractClaimsWorkspaceError";
  }
}

export class ExtractClaimsError extends Error {
  code: string;

  constructor(message = "Claim extraction failed.") {
    super(message);
    this.name = "ExtractClaimsError";
    this.code = "AI_EXTRACT_CLAIMS_FAILED";
  }
}

type ThoughtForExtraction = {
  id: string;
  userId: string;
  sessionId: string | null;
  mapId: string | null;
  rawText: string;
  metadataJson: unknown;
};

type ThoughtNodeForExtraction = {
  id: string;
};

const EXTRACT_CLAIMS_OPERATION = "extract_claims";
const EXTRACT_CLAIMS_SCHEMA_NAME = "extractClaims";

export const extractClaimsDeps = {
  createProvider: createConfiguredAiProvider as () => AiProvider,
  createMockProvider: createMockAiProvider as () => AiProvider,
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function extractClaims(
  input: unknown,
  context: ExtractClaimsContext,
  db: DbClient = getDb(),
): Promise<ExtractClaimsResult> {
  const normalized = validateExtractClaimsInput(input);
  const userId = readRequiredString(context.userId, "userId", 1, 200);
  const requestId = readOptionalString(context.requestId);
  const thought = await loadOwnedThought(db, { thoughtId: normalized.thoughtId, userId });

  if (!thought) {
    throw new ExtractClaimsNotFoundError();
  }

  if (!thought.mapId) {
    throw new ExtractClaimsWorkspaceError("Thought must belong to a map before claims can be extracted.");
  }

  const thoughtNode = await loadThoughtNode(db, { thoughtId: thought.id, userId, mapId: thought.mapId });

  if (!thoughtNode) {
    throw new ExtractClaimsWorkspaceError("Thought graph node is required before claims can be extracted.");
  }

  const aiJobId = randomUUID();
  const startedAt = new Date();

  await db.insert(aiJobs).values({
    id: aiJobId,
    userId,
    operation: EXTRACT_CLAIMS_OPERATION,
    status: "running",
    inputJson: {
      thoughtId: thought.id,
      mapId: thought.mapId,
      requestId,
    },
    createdAt: startedAt,
    updatedAt: startedAt,
    startedAt,
  });

  let output: ExtractClaimsOutput;
  let providerName = "unknown";
  let model = "unknown";

  try {
    const providerResult = await invokeExtractClaimsProvider(thought);
    output = providerResult.output;
    providerName = providerResult.providerName;
    model = providerResult.model;
  } catch (error) {
    await markAiJobFailed(db, aiJobId, error instanceof Error ? error.message : String(error));
    throw error;
  }

  const completedAt = new Date();
  const createdClaims: CreatedExtractedClaim[] = output.claims.map((claim) => {
    const claimId = randomUUID();
    const graphNodeId = randomUUID();
    const graphEdgeId = randomUUID();

    return {
      id: claimId,
      userId,
      mapId: thought.mapId as string,
      thoughtId: thought.id,
      body: claim.text,
      confidenceBps: claim.confidenceBps,
      graphNodeId,
      graphEdgeId,
      createdAt: completedAt.toISOString(),
      updatedAt: completedAt.toISOString(),
    };
  });

  await db.transaction(async (tx) => {
    for (const createdClaim of createdClaims) {
      const sourceOutput = output.claims.find((claim) => claim.text === createdClaim.body);

      await tx.insert(claims).values({
        id: createdClaim.id,
        userId,
        mapId: createdClaim.mapId,
        thoughtId: thought.id,
        body: createdClaim.body,
        confidenceBps: createdClaim.confidenceBps,
        createdAt: completedAt,
        updatedAt: completedAt,
      });

      await tx.insert(graphNodes).values({
        id: createdClaim.graphNodeId,
        userId,
        sessionId: thought.sessionId,
        mapId: createdClaim.mapId,
        claimId: createdClaim.id,
        thoughtId: thought.id,
        kind: "claim",
        label: createdClaim.body,
        metadataJson: {
          aiJobId,
          cluster: "claim",
          confidenceBps: createdClaim.confidenceBps,
          description: sourceOutput?.rationale ?? null,
          source: "ai.extract-claims",
        },
        createdAt: completedAt,
        updatedAt: completedAt,
      });

      await tx.insert(graphEdges).values({
        id: createdClaim.graphEdgeId,
        userId,
        mapId: createdClaim.mapId,
        sourceNodeId: thoughtNode.id,
        targetNodeId: createdClaim.graphNodeId,
        kind: "extracted_claim",
        weightBps: createdClaim.confidenceBps,
        metadataJson: {
          aiJobId,
          thoughtId: thought.id,
          claimId: createdClaim.id,
          source: "ai.extract-claims",
        },
        createdAt: completedAt,
        updatedAt: completedAt,
      });

      await tx.insert(activityEvents).values({
        userId,
        sessionId: thought.sessionId,
        mapId: createdClaim.mapId,
        thoughtId: thought.id,
        claimId: createdClaim.id,
        graphNodeId: createdClaim.graphNodeId,
        graphEdgeId: createdClaim.graphEdgeId,
        aiJobId,
        aggregateType: "claim",
        aggregateId: createdClaim.id,
        type: "claim.extracted",
        payloadJson: {
          body: createdClaim.body,
          confidenceBps: createdClaim.confidenceBps,
          graphNodeId: createdClaim.graphNodeId,
          graphEdgeId: createdClaim.graphEdgeId,
          thoughtId: thought.id,
        },
        requestId,
        createdAt: completedAt,
      });
    }

    await tx
      .update(aiJobs)
      .set({
        status: "succeeded",
        outputJson: {
          claims: output.claims,
          createdClaims,
          provider: providerName,
          model,
        },
        updatedAt: completedAt,
        completedAt,
      })
      .where(eq(aiJobs.id, aiJobId));
  });

  return {
    aiJobId,
    thoughtId: thought.id,
    claims: createdClaims,
  };
}

async function invokeExtractClaimsProvider(thought: ThoughtForExtraction): Promise<{
  model: string;
  output: ExtractClaimsOutput;
  providerName: string;
}> {
  const prompt = buildExtractClaimsPrompt({
    thoughtId: thought.id,
    rawText: thought.rawText,
    suggestedTitle: readOptionalString(asRecordOrNull(thought.metadataJson)?.suggestedTitle),
    summary: readOptionalString(asRecordOrNull(thought.metadataJson)?.summary),
  });
  const request = {
    jsonSchema: extractClaimsJsonSchema,
    maxTokens: 1200,
    model: process.env.OPENAI_EXTRACT_CLAIMS_MODEL?.trim() || "gpt-4.1-mini",
    schemaName: EXTRACT_CLAIMS_SCHEMA_NAME,
    systemPrompt: prompt.systemPrompt,
    temperature: 0.1,
    userPrompt: prompt.userPrompt,
  };
  const provider = extractClaimsDeps.createProvider();
  let response: AiProviderResponse;
  let providerName = provider.name;

  try {
    response = await provider.invokeStructured(request);
  } catch {
    const mockProvider = extractClaimsDeps.createMockProvider();
    response = await mockProvider.invokeStructured(request);
    providerName = mockProvider.name;
  }

  return {
    providerName,
    model: request.model,
    output: normalizeExtractClaimsOutput(response.output),
  };
}

function normalizeExtractClaimsOutput(output: unknown): ExtractClaimsOutput {
  const direct = ExtractClaimsOutputSchema.safeParse(output);

  if (direct.success) {
    return direct.data;
  }

  const envelope = asRecordOrNull(output);
  const nested = asRecordOrNull(envelope?.result);
  const nestedParsed = ExtractClaimsOutputSchema.safeParse(nested);

  if (nestedParsed.success) {
    return nestedParsed.data;
  }

  throw new ExtractClaimsValidationError(
    "extractClaims provider output failed validation.",
    direct.error.issues.map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`),
  );
}

async function loadOwnedThought(db: DbClient, input: { thoughtId: string; userId: string }): Promise<ThoughtForExtraction | null> {
  const rows = await db
    .select({
      id: thoughts.id,
      userId: thoughts.userId,
      sessionId: thoughts.sessionId,
      mapId: thoughts.mapId,
      rawText: thoughts.rawText,
      metadataJson: thoughts.metadataJson,
    })
    .from(thoughts)
    .where(and(eq(thoughts.id, input.thoughtId), eq(thoughts.userId, input.userId)))
    .limit(1);

  return rows[0] ?? null;
}

async function loadThoughtNode(
  db: DbClient,
  input: { thoughtId: string; userId: string; mapId: string },
): Promise<ThoughtNodeForExtraction | null> {
  const rows = await db
    .select({
      id: graphNodes.id,
    })
    .from(graphNodes)
    .where(
      and(
        eq(graphNodes.thoughtId, input.thoughtId),
        eq(graphNodes.userId, input.userId),
        eq(graphNodes.mapId, input.mapId),
        eq(graphNodes.kind, "thought"),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

async function markAiJobFailed(db: DbClient, aiJobId: string, errorMessage: string) {
  const failedAt = new Date();

  await db
    .update(aiJobs)
    .set({
      status: "failed",
      errorMessage,
      updatedAt: failedAt,
      completedAt: failedAt,
    })
    .where(eq(aiJobs.id, aiJobId));
}

function validateExtractClaimsInput(input: unknown): ExtractClaimsInput {
  const object = asRecord(input, "extractClaims input must be an object.");
  const thoughtId = readRequiredString(object.thoughtId, "thoughtId", 1, 200);

  if (!isUuid(thoughtId)) {
    throw new ExtractClaimsValidationError("thoughtId must be a UUID.", ["thoughtId must be a UUID."]);
  }

  return {
    thoughtId,
  };
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExtractClaimsValidationError(message, [message]);
  }

  return value as Record<string, unknown>;
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string, minLength: number, maxLength: number): string {
  if (typeof value !== "string") {
    throw new ExtractClaimsValidationError(`${fieldName} must be a string.`, [`${fieldName} must be a string.`]);
  }

  const trimmed = value.trim();

  if (trimmed.length < minLength) {
    throw new ExtractClaimsValidationError(`${fieldName} must be at least ${minLength} character(s).`, [
      `${fieldName} must be at least ${minLength} character(s).`,
    ]);
  }

  if (trimmed.length > maxLength) {
    throw new ExtractClaimsValidationError(`${fieldName} must be at most ${maxLength} character(s).`, [
      `${fieldName} must be at most ${maxLength} character(s).`,
    ]);
  }

  return trimmed;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const extractClaimsJsonSchema = {
  type: "object",
  required: ["claims"],
  additionalProperties: false,
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        required: ["text", "confidenceBps"],
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          confidenceBps: { type: "integer", minimum: 0, maximum: 10_000 },
          rationale: {
            anyOf: [{ type: "string" }, { type: "null" }],
          },
        },
      },
    },
  },
} as const;
