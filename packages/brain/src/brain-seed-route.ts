import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainRuns } from "./db/schema.ts";
import {
  BrainSeedProviderError,
  BrainSeedValidationError,
  createDefaultBrainSeedProvider,
  generateBrainSeed,
  resolveXaiBrainSeedModel,
  type BrainSeedInput,
  type BrainSeedOutput,
  type BrainSeedProvider,
} from "./seed.ts";
import { persistBrainSeed, type BrainSeedRunRecord, type PersistedBrainSeed } from "./seed-persistence.ts";

export const BrainSeedRouteRequestSchema = z
  .object({
    rawIdea: z.string().trim().min(1).max(4_000),
    sessionId: z.string().uuid().optional(),
    userId: z.string().trim().min(1).max(120).optional(),
    projectId: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type BrainSeedRouteRequest = z.infer<typeof BrainSeedRouteRequestSchema>;

export type BrainSeedRouteContext = {
  userId: string;
  projectId: string;
};

export type BrainSeedRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  provider?: BrainSeedProvider;
  generateSeed?: (
    input: BrainSeedInput,
    options: { provider?: BrainSeedProvider },
  ) => Promise<BrainSeedOutput>;
  persistSeed?: (
    seed: BrainSeedOutput,
    options: { db?: PennyDatabase; brainRun?: BrainSeedRunRecord },
  ) => Promise<PersistedBrainSeed>;
};

export type BrainSeedUiPayload = ReturnType<typeof buildBrainSeedUiPayload>;

export async function POST(request: Request, options: BrainSeedRouteOptions = {}): Promise<Response> {
  return handleBrainSeedRequest(request, options);
}

export async function handleBrainSeedRequest(request: Request, options: BrainSeedRouteOptions = {}): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: {
          code: "method_not_allowed",
          message: "POST /brain/seed requires the POST method.",
        },
      },
      405,
      { Allow: "POST" },
    );
  }

  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return jsonResponse(
      {
        error: {
          code: "invalid_json",
          message: bodyResult.message,
        },
      },
      400,
    );
  }

  const parsed = BrainSeedRouteRequestSchema.safeParse(bodyResult.value);

  if (!parsed.success) {
    return jsonResponse(
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
    );
  }

  const routeInput = parsed.data;
  const context = resolveDevContext(request, routeInput);
  const seedInput: BrainSeedInput = {
    rawIdea: routeInput.rawIdea,
    sessionId: routeInput.sessionId ?? randomUUID(),
  };
  const provider = options.provider ?? createDefaultBrainSeedProvider();
  const generateSeed = options.generateSeed ?? generateBrainSeed;
  const persistSeed =
    options.persistSeed ??
    ((seed: BrainSeedOutput, persistOptions: { db?: PennyDatabase; brainRun?: BrainSeedRunRecord }) =>
      persistBrainSeed(persistOptions.db ?? createPennyDb(options.databaseUrl), seed, {
        brainRun: persistOptions.brainRun,
      }));
  const startedAt = new Date();
  let pendingBrainRun = buildPendingBrainSeedRunRecord(seedInput, provider, startedAt);

  try {
    pendingBrainRun = await createPendingBrainRun(options, pendingBrainRun);
    const seed = await generateSeed(seedInput, { provider });
    const brainRun = buildSucceededBrainSeedRunRecord(pendingBrainRun, seed, new Date());
    const persisted = await persistSeed(seed, options.db ? { db: options.db, brainRun } : { brainRun });

    return jsonResponse(
      {
        data: buildBrainSeedUiPayload(seed, persisted, context),
      },
      201,
    );
  } catch (error) {
    await recordFailedBrainRun(options, buildFailedBrainSeedRunRecord(pendingBrainRun, error));

    if (error instanceof BrainSeedValidationError) {
      return jsonResponse(
        {
          error: {
            code: "invalid_seed_output",
            message: error.message,
            issues: error.issues,
          },
        },
        502,
      );
    }

    if (error instanceof BrainSeedProviderError) {
      return jsonResponse(
        {
          error: {
            code: "seed_provider_failed",
            message: error.message,
          },
        },
        502,
      );
    }

    return jsonResponse(
      {
        error: {
          code: "brain_seed_failed",
          message: formatErrorMessage(error),
        },
      },
      500,
    );
  }
}

export function buildBrainSeedUiPayload(
  seed: BrainSeedOutput,
  persisted: PersistedBrainSeed,
  context: BrainSeedRouteContext,
) {
  const claimsBySeedId = new Map(persisted.claims.map((claim) => [claim.seedId, claim]));
  const claimVersionsBySeedId = new Map(persisted.claimVersions.map((version) => [version.seedId, version]));
  const edgesBySeedId = new Map(persisted.edges.map((edge) => [edge.seedId, edge]));
  const movesBySeedId = new Map(persisted.moves.map((move) => [move.seedId, move]));
  const artifactsBySeedId = new Map(persisted.artifacts.map((artifact) => [artifact.seedId, artifact]));
  const ideaMap = seed.artifacts.find((artifact) => artifact.kind === "idea_map");
  const challengeBrief = seed.artifacts.find((artifact) => artifact.kind === "challenge_brief");

  return {
    context,
    session: {
      id: persisted.session.id,
      status: persisted.session.status,
      sourceId: persisted.source.id,
      createdAt: persisted.session.createdAt.toISOString(),
    },
    source: {
      id: persisted.source.id,
      kind: persisted.source.kind,
      rawText: persisted.source.rawText,
    },
    ideaMap: {
      artifactId: ideaMap ? requirePersistedArtifact(artifactsBySeedId, ideaMap.id).id : null,
      keyInsight: seed.keyInsight,
      claims: seed.thoughtMap.claims.map((claim) => {
        const persistedClaim = requirePersistedClaim(claimsBySeedId, claim.id);
        const persistedVersion = requirePersistedClaimVersion(claimVersionsBySeedId, claim.id);

        return {
          id: persistedClaim.id,
          versionId: persistedVersion.id,
          seedId: claim.id,
          kind: persistedClaim.kind,
          status: persistedVersion.status,
          text: persistedVersion.content,
          confidence: persistedVersion.confidence,
        };
      }),
      edges: seed.thoughtMap.edges.map((edge) => {
        const persistedEdge = requirePersistedEdge(edgesBySeedId, edge.id);

        return {
          id: persistedEdge.id,
          seedId: edge.id,
          fromClaimId: persistedEdge.fromClaimId,
          toClaimId: persistedEdge.toClaimId,
          kind: persistedEdge.kind,
          label: persistedEdge.label,
        };
      }),
    },
    explorationPaths: seed.explorationPaths,
    firstChallenge: {
      targetClaimId: requirePersistedClaim(claimsBySeedId, seed.firstChallenge.targetClaimId).id,
      targetSeedClaimId: seed.firstChallenge.targetClaimId,
      failureType: seed.firstChallenge.failureType,
      weakestPart: seed.firstChallenge.weakestPart,
      challenge: seed.firstChallenge.challenge,
      responseOptions: seed.firstChallenge.responseOptions,
    },
    learnCandidates: seed.learnCandidates.map((candidate) => ({
      ...candidate,
      claimId: requirePersistedClaim(claimsBySeedId, candidate.claimId).id,
      seedClaimId: candidate.claimId,
    })),
    challengeBrief: challengeBrief
      ? {
          artifactId: requirePersistedArtifact(artifactsBySeedId, challengeBrief.id).id,
          title: challengeBrief.title,
          summary: challengeBrief.summary,
        }
      : null,
    artifacts: seed.artifacts.map((artifact) => {
      const persistedArtifact = requirePersistedArtifact(artifactsBySeedId, artifact.id);

      return {
        id: persistedArtifact.id,
        seedId: artifact.id,
        kind: persistedArtifact.kind,
        title: persistedArtifact.title,
        summary: persistedArtifact.summary,
        claimIds: artifact.claimIds.map((claimId) => requirePersistedClaim(claimsBySeedId, claimId).id),
        edgeIds: artifact.edgeIds.map((edgeId) => requirePersistedEdge(edgesBySeedId, edgeId).id),
      };
    }),
    moves: seed.moves.map((move) => {
      const persistedMove = requirePersistedMove(movesBySeedId, move.id);

      return {
        id: persistedMove.id,
        seedId: move.id,
        kind: persistedMove.kind,
        summary: persistedMove.summary,
        claimIds: move.claimIds.map((claimId) => requirePersistedClaim(claimsBySeedId, claimId).id),
        edgeIds: move.edgeIds.map((edgeId) => requirePersistedEdge(edgesBySeedId, edgeId).id),
        artifactIds: move.artifactIds.map((artifactId) => requirePersistedArtifact(artifactsBySeedId, artifactId).id),
      };
    }),
  };
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

function resolveDevContext(request: Request, body: BrainSeedRouteRequest): BrainSeedRouteContext {
  return {
    userId:
      firstPresentHeader(request, ["x-user-id", "x-penny-user-id"]) ??
      body.userId ??
      "dev-user",
    projectId:
      firstPresentHeader(request, ["x-project-id", "x-penny-project-id"]) ??
      body.projectId ??
      "dev-project",
  };
}

function firstPresentHeader(request: Request, names: string[]): string | undefined {
  for (const name of names) {
    const value = request.headers.get(name)?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
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

function buildPendingBrainSeedRunRecord(
  input: BrainSeedInput,
  provider: BrainSeedProvider,
  startedAt: Date,
): BrainSeedRunRecord {
  return {
    operation: "brain.seed",
    provider: provider.name,
    model: provider.name === "xai" ? resolveXaiBrainSeedModel() : null,
    status: "pending",
    input,
    startedAt,
  };
}

async function createPendingBrainRun(
  options: BrainSeedRouteOptions,
  brainRun: BrainSeedRunRecord,
): Promise<BrainSeedRunRecord> {
  const db = resolveBrainRunDb(options);

  if (!db) {
    return brainRun;
  }

  const [created] = await db
    .insert(brainRuns)
    .values({
      operation: brainRun.operation,
      provider: brainRun.provider,
      model: brainRun.model,
      status: brainRun.status,
      input: brainRun.input,
      createdAt: brainRun.startedAt,
    })
    .returning();

  return {
    ...brainRun,
    id: created?.id,
  };
}

function buildSucceededBrainSeedRunRecord(
  pending: BrainSeedRunRecord,
  output: BrainSeedOutput,
  completedAt: Date,
): BrainSeedRunRecord {
  return {
    ...pending,
    status: "succeeded",
    output,
    completedAt,
  };
}

function buildFailedBrainSeedRunRecord(
  pending: BrainSeedRunRecord,
  error: unknown,
): BrainSeedRunRecord {
  return {
    ...pending,
    status: "failed",
    error: {
      name: error instanceof Error ? error.name : "Error",
      message: formatErrorMessage(error),
    },
    completedAt: new Date(),
  };
}

async function recordFailedBrainRun(options: BrainSeedRouteOptions, brainRun: BrainSeedRunRecord): Promise<void> {
  const db = resolveBrainRunDb(options);

  if (!db) {
    return;
  }

  try {
    const values = {
      operation: brainRun.operation,
      provider: brainRun.provider,
      model: brainRun.model,
      status: brainRun.status,
      input: brainRun.input,
      error: brainRun.error,
      createdAt: brainRun.startedAt,
      completedAt: brainRun.completedAt,
    };

    if (brainRun.id) {
      await db.update(brainRuns).set(values).where(eq(brainRuns.id, brainRun.id));
      return;
    }

    await db.insert(brainRuns).values(values);
  } catch {
    // Preserve the original API error; failed run recording is best-effort when no session exists yet.
  }
}

function resolveBrainRunDb(options: BrainSeedRouteOptions): PennyDatabase | null {
  if (options.db) {
    return options.db;
  }

  if (options.persistSeed) {
    return null;
  }

  if (!options.databaseUrl && !process.env.DATABASE_URL?.trim()) {
    return null;
  }

  try {
    return createPennyDb(options.databaseUrl);
  } catch {
    return null;
  }
}

function requirePersistedClaim(claimsBySeedId: Map<string, PersistedBrainSeed["claims"][number]>, seedId: string) {
  const claim = claimsBySeedId.get(seedId);

  if (!claim) {
    throw new Error(`Missing persisted claim for seed id ${seedId}.`);
  }

  return claim;
}

function requirePersistedClaimVersion(
  claimVersionsBySeedId: Map<string, PersistedBrainSeed["claimVersions"][number]>,
  seedId: string,
) {
  const claimVersion = claimVersionsBySeedId.get(seedId);

  if (!claimVersion) {
    throw new Error(`Missing persisted claim version for seed id ${seedId}.`);
  }

  return claimVersion;
}

function requirePersistedEdge(edgesBySeedId: Map<string, PersistedBrainSeed["edges"][number]>, seedId: string) {
  const edge = edgesBySeedId.get(seedId);

  if (!edge) {
    throw new Error(`Missing persisted edge for seed id ${seedId}.`);
  }

  return edge;
}

function requirePersistedArtifact(
  artifactsBySeedId: Map<string, PersistedBrainSeed["artifacts"][number]>,
  seedId: string,
) {
  const artifact = artifactsBySeedId.get(seedId);

  if (!artifact) {
    throw new Error(`Missing persisted artifact for seed id ${seedId}.`);
  }

  return artifact;
}

function requirePersistedMove(movesBySeedId: Map<string, PersistedBrainSeed["moves"][number]>, seedId: string) {
  const move = movesBySeedId.get(seedId);

  if (!move) {
    throw new Error(`Missing persisted move for seed id ${seedId}.`);
  }

  return move;
}
