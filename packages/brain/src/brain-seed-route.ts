import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
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
import {
  createBrainSeedPrelude,
  failBrainSeedRun,
  persistBrainSeed,
  type BrainSeedPrelude,
  type BrainSeedRunInput,
  type PersistedBrainSeed,
} from "./seed-persistence.ts";

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
  prepareSeedRun?: (
    input: BrainSeedInput,
    options: { db?: PennyDatabase; run: BrainSeedRunInput },
  ) => Promise<BrainSeedPrelude>;
  persistSeed?: (
    seed: BrainSeedOutput,
    options: { db?: PennyDatabase; prelude: BrainSeedPrelude },
  ) => Promise<PersistedBrainSeed>;
  failSeedRun?: (
    prelude: BrainSeedPrelude,
    error: unknown,
    options: { db?: PennyDatabase },
  ) => Promise<void>;
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
  const db = resolveRouteDb(options);
  const prepareSeedRun =
    options.prepareSeedRun ??
    ((input: BrainSeedInput, prepareOptions: { db?: PennyDatabase; run: BrainSeedRunInput }) =>
      createBrainSeedPrelude(requireRouteDb(prepareOptions.db), input, prepareOptions.run));
  const persistSeed =
    options.persistSeed ??
    ((seed: BrainSeedOutput, persistOptions: { db?: PennyDatabase; prelude: BrainSeedPrelude }) =>
      persistBrainSeed(requireRouteDb(persistOptions.db), persistOptions.prelude, seed));
  const failSeedRun =
    options.failSeedRun ??
    ((prelude: BrainSeedPrelude, error: unknown, failOptions: { db?: PennyDatabase }) =>
      failBrainSeedRun(requireRouteDb(failOptions.db), prelude, error));
  const startedAt = new Date();
  let prelude: BrainSeedPrelude | null = null;

  try {
    prelude = await prepareSeedRun(seedInput, {
      ...dbOption(db),
      run: buildBrainSeedRunInput(seedInput, provider, startedAt),
    });
    const seed = await generateSeed(seedInput, { provider });
    const persisted = await persistSeed(seed, { ...dbOption(db), prelude });

    return jsonResponse(
      {
        data: buildBrainSeedUiPayload(seed, persisted, context),
      },
      201,
    );
  } catch (error) {
    if (prelude) {
      await failSeedRun(prelude, error, dbOption(db));
    }

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
    brainRun: {
      id: persisted.brainRun.id,
      status: persisted.brainRun.status,
    },
    ideaMap: {
      artifactId: null,
      keyInsight: seed.keyInsight,
      claims: persisted.claims.map((claim) => {
        const persistedClaim = requirePersistedClaim(claimsBySeedId, claim.seedId);
        const persistedVersion = requirePersistedClaimVersion(claimVersionsBySeedId, claim.seedId);

        return {
          id: persistedClaim.id,
          versionId: persistedVersion.id,
          seedId: persistedClaim.seedId,
          kind: persistedClaim.kind,
          status: persistedVersion.status,
          text: persistedVersion.content,
          confidence: persistedVersion.confidence,
        };
      }),
      edges: persisted.edges.map((edge) => {
        const persistedEdge = requirePersistedEdge(edgesBySeedId, edge.seedId);

        return {
          id: persistedEdge.id,
          seedId: persistedEdge.seedId,
          fromClaimId: persistedEdge.fromClaimId,
          toClaimId: persistedEdge.toClaimId,
          kind: persistedEdge.kind,
          status: persistedEdge.status,
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
    challengeBrief: null,
    artifacts: [],
    moves: persisted.moves.map((move) => {
      const persistedMove = requirePersistedMove(movesBySeedId, move.seedId);

      return {
        id: persistedMove.id,
        seedId: persistedMove.seedId,
        kind: persistedMove.kind,
        summary: persistedMove.summary,
        claimIds: payloadIdArray(persistedMove.payload, "claimIds"),
        edgeIds: payloadIdArray(persistedMove.payload, "edgeIds"),
        artifactIds: [],
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

function buildBrainSeedRunInput(
  input: BrainSeedInput,
  provider: BrainSeedProvider,
  startedAt: Date,
): BrainSeedRunInput {
  return {
    operation: "brain.seed",
    provider: provider.name,
    model: provider.name === "xai" ? resolveXaiBrainSeedModel() : null,
    input,
    startedAt,
  };
}

function resolveRouteDb(options: BrainSeedRouteOptions): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (options.prepareSeedRun && options.persistSeed) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireRouteDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for POST /brain/seed persistence.");
  }

  return db;
}

function dbOption(db: PennyDatabase | undefined): { db?: PennyDatabase } {
  return db ? { db } : {};
}

function payloadIdArray(payload: unknown, key: "claimIds" | "edgeIds"): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const items = (payload as Record<string, unknown>)[key];

  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter((value: unknown): value is string => typeof value === "string");
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

function requirePersistedMove(movesBySeedId: Map<string, PersistedBrainSeed["moves"][number]>, seedId: string) {
  const move = movesBySeedId.get(seedId);

  if (!move) {
    throw new Error(`Missing persisted move for seed id ${seedId}.`);
  }

  return move;
}
