import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CommandIdempotencyRequestFields,
  commandRequestHash,
  createDbCommandIdempotencyStore,
  createMemoryCommandIdempotencyStore,
  resolveCommandIdempotencyKey,
  runIdempotentCommand,
  stripCommandIdempotencyFields,
  type CommandIdempotencyStore,
} from "./command-idempotency.ts";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { rememberDevPersistedBrainSeed, shouldUseLocalInMemoryPennyData } from "./dev-brain-store.ts";
import {
  BrainSeedProviderError,
  BrainSeedValidationError,
  brainSeedSearchDecision,
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
import { buildExpertLearningPlan } from "./learn-plan.ts";
import { scopeValues } from "./scope.ts";

const memoryBrainSeedIdempotencyStore = createMemoryCommandIdempotencyStore();

export const BrainSeedRouteRequestSchema = z
  .object({
    rawIdea: z.string().trim().min(1).max(4_000),
    sessionId: z.string().uuid().optional(),
    userId: z.string().trim().min(1).max(120).optional(),
    workspaceId: z.string().trim().min(1).max(120).optional(),
    projectId: z.string().trim().min(1).max(120).optional(),
    sphereId: z.string().trim().min(1).max(120).optional(),
    ...CommandIdempotencyRequestFields,
  })
  .strict();

export type BrainSeedRouteRequest = Omit<
  z.infer<typeof BrainSeedRouteRequestSchema>,
  "idempotencyKey" | "commandId" | "customId"
>;

export type BrainSeedRouteContext = {
  userId: string;
  workspaceId: string;
  projectId: string;
  sphereId: string;
};

export type BrainSeedRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  provider?: BrainSeedProvider;
  generateSeed?: (
    input: BrainSeedInput,
    options: { provider?: BrainSeedProvider; brainRunId: string },
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
  idempotencyStore?: CommandIdempotencyStore;
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

  const keyResult = resolveCommandIdempotencyKey(request, parsed.data);

  if (!keyResult.ok) {
    return keyResult.response;
  }

  const routeInput = stripCommandIdempotencyFields(parsed.data) as BrainSeedRouteRequest;
  const context = resolveDevContext(request, routeInput);
  const seedInput: BrainSeedInput = {
    rawIdea: routeInput.rawIdea,
    sessionId: routeInput.sessionId ?? randomUUID(),
  };
  const provider = options.provider ?? createDefaultBrainSeedProvider();
  const generateSeed = options.generateSeed ?? generateBrainSeed;
  const db = resolveRouteDb(options);
  const memoryPersistence = !db && !options.prepareSeedRun && !options.persistSeed;
  const prepareSeedRun =
    options.prepareSeedRun ??
    (memoryPersistence
      ? ((input: BrainSeedInput, prepareOptions: { run: BrainSeedRunInput }) => createMemoryBrainSeedPrelude(input, prepareOptions.run))
      : ((input: BrainSeedInput, prepareOptions: { db?: PennyDatabase; run: BrainSeedRunInput }) =>
          createBrainSeedPrelude(requireRouteDb(prepareOptions.db), input, prepareOptions.run)));
  const persistSeed =
    options.persistSeed ??
    (memoryPersistence
      ? ((seed: BrainSeedOutput, persistOptions: { prelude: BrainSeedPrelude }) => persistMemoryBrainSeed(persistOptions.prelude, seed))
      : ((seed: BrainSeedOutput, persistOptions: { db?: PennyDatabase; prelude: BrainSeedPrelude }) =>
          persistBrainSeed(requireRouteDb(persistOptions.db), persistOptions.prelude, seed)));
  const failSeedRun =
    options.failSeedRun ??
    (memoryPersistence
      ? ((prelude: BrainSeedPrelude, error: unknown) => failMemoryBrainSeedRun(prelude, error))
      : ((prelude: BrainSeedPrelude, error: unknown, failOptions: { db?: PennyDatabase }) =>
          failBrainSeedRun(requireRouteDb(failOptions.db), prelude, error)));
  const idempotencyStore = options.idempotencyStore ?? (db ? createDbCommandIdempotencyStore(db) : memoryBrainSeedIdempotencyStore);

  return runIdempotentCommand({
    route: "POST /brain/seed",
    key: keyResult.key,
    requestHash: commandRequestHash("POST /brain/seed", routeInput),
    scope: context,
    store: idempotencyStore,
    execute: async () => {
      const startedAt = new Date();
      let prelude: BrainSeedPrelude | null = null;

      try {
        prelude = await prepareSeedRun(seedInput, {
          ...dbOption(db),
          run: buildBrainSeedRunInput(seedInput, provider, startedAt, context),
        });
        const seed = await generateSeed(seedInput, { provider, brainRunId: prelude.brainRun.id });
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
    },
  });
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
      ...scopeValues(persisted.session),
      sourceId: persisted.source.id,
      createdAt: persisted.session.createdAt.toISOString(),
    },
    source: {
      id: persisted.source.id,
      kind: persisted.source.kind,
      ...scopeValues(persisted.source),
      rawText: persisted.source.rawText,
    },
    brainRun: {
      id: persisted.brainRun.id,
      ...scopeValues(persisted.brainRun),
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
    learningPlan: buildExpertLearningPlan({
      rawIdea: persisted.source.rawText,
      keyInsight: seed.keyInsight,
      claims: seed.thoughtMap.claims,
      learnCandidates: seed.learnCandidates,
      explorationPaths: seed.explorationPaths,
    }),
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
    workspaceId:
      firstPresentHeader(request, ["x-workspace-id", "x-penny-workspace-id"]) ??
      body.workspaceId ??
      "dev-workspace",
    projectId:
      firstPresentHeader(request, ["x-project-id", "x-penny-project-id"]) ??
      body.projectId ??
      "dev-project",
    sphereId:
      firstPresentHeader(request, ["x-sphere-id", "x-penny-sphere-id"]) ??
      body.sphereId ??
      "dev-sphere",
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
  context: BrainSeedRouteContext,
): BrainSeedRunInput {
  return {
    operation: "brain.seed",
    provider: provider.name,
    model: provider.name === "xai" ? resolveXaiBrainSeedModel() : null,
    input: {
      ...input,
      scope: context,
      searchDecision: brainSeedSearchDecision(input),
    },
    scope: context,
    startedAt,
  };
}

function createMemoryBrainSeedPrelude(input: BrainSeedInput, run: BrainSeedRunInput): BrainSeedPrelude {
  const now = run.startedAt ?? new Date();
  const scope = scopeValues(run.scope);
  const sessionId = input.sessionId ?? randomUUID();
  const sourceId = randomUUID();

  return {
    session: {
      id: sessionId,
      ...scope,
      status: "open",
      title: input.rawIdea.slice(0, 120),
      createdAt: now,
      endedAt: null,
    },
    source: {
      id: sourceId,
      ...scope,
      sessionId,
      kind: "raw_idea",
      rawText: input.rawIdea,
      createdAt: now,
    },
    submittedSourceSpan: {
      id: randomUUID(),
      sourceId,
      claimId: null,
      claimVersionId: null,
      startOffset: 0,
      endOffset: input.rawIdea.length,
      label: "submitted_text",
      createdAt: now,
    },
    brainRun: {
      id: randomUUID(),
      ...scope,
      sessionId,
      sourceId,
      operation: run.operation,
      provider: run.provider,
      model: run.model ?? null,
      status: "running",
      input: run.input,
      output: null,
      error: null,
      createdAt: now,
      completedAt: null,
    },
  };
}

function persistMemoryBrainSeed(prelude: BrainSeedPrelude, seed: BrainSeedOutput): PersistedBrainSeed {
  const now = new Date();
  const sessionId = prelude.session.id;
  const sourceId = prelude.source.id;
  const scope = scopeValues(prelude.session);
  const claims = seed.thoughtMap.claims.map((claim) => ({
    id: randomUUID(),
    seedId: claim.id,
    ...scope,
    sessionId,
    sourceId,
    kind: claim.kind,
    createdAt: now,
  }));
  const claimIds = new Map(claims.map((claim) => [claim.seedId, claim.id]));
  const claimVersions = seed.thoughtMap.claims.map((claim) => ({
    id: randomUUID(),
    seedId: claim.id,
    claimId: requireMappedMemoryId(claimIds, claim.id),
    sourceId,
    brainRunId: prelude.brainRun.id,
    moveId: null,
    content: claim.text,
    status: "exploratory" as const,
    confidence: claim.confidence,
    isCurrent: true,
    validFrom: now,
    validUntil: null,
    supersededByVersionId: null,
    createdAt: now,
  }));
  const claimVersionIds = new Map(claimVersions.map((version) => [version.seedId, version.id]));
  const edges = seed.thoughtMap.edges.map((edge) => ({
    id: randomUUID(),
    seedId: edge.id,
    ...scope,
    sessionId,
    fromClaimId: requireMappedMemoryId(claimIds, edge.fromClaimId),
    toClaimId: requireMappedMemoryId(claimIds, edge.toClaimId),
    kind: edge.kind,
    status: "active" as const,
    label: edge.label,
    createdAt: now,
  }));
  const edgeIds = new Map(edges.map((edge) => [edge.seedId, edge.id]));
  const moves = [
    {
      id: randomUUID(),
      seedId: "move.source_recorded",
      ...scope,
      sessionId,
      kind: "source.recorded" as const,
      summary: "Submitted the raw seed idea as the session source.",
      payload: {
        sourceIds: [sourceId],
        sourceSpanIds: [prelude.submittedSourceSpan.id],
        claimIds: [],
        edgeIds: [],
      },
      createdAt: now,
    },
    {
      id: randomUUID(),
      seedId: "move.seed_claim_created",
      ...scope,
      sessionId,
      kind: "seed_claim_created" as const,
      summary: "Created the stable seed claim and its first current version.",
      payload: {
        claimIds: [requireMappedMemoryId(claimIds, seed.seedClaim.id)],
        edgeIds: [],
      },
      createdAt: now,
    },
    {
      id: randomUUID(),
      seedId: "move.assumptions_extracted",
      ...scope,
      sessionId,
      kind: "assumptions_extracted" as const,
      summary: "Created assumption claims and current versions from the seed extraction.",
      payload: {
        claimIds: seed.assumptions.map((assumption) => requireMappedMemoryId(claimIds, assumption.id)),
        edgeIds: Array.from(edgeIds.values()),
      },
      createdAt: now,
    },
    {
      id: randomUUID(),
      seedId: "move.first_challenge_suggested",
      ...scope,
      sessionId,
      kind: "first_challenge_suggested" as const,
      summary: "Suggested the first challenge against the weakest load-bearing claim.",
      payload: {
        claimIds: [requireMappedMemoryId(claimIds, seed.firstChallenge.targetClaimId)],
        edgeIds: [],
      },
      createdAt: now,
    },
  ];
  const persisted: PersistedBrainSeed = {
    session: prelude.session,
    source: prelude.source,
    submittedSourceSpan: prelude.submittedSourceSpan,
    claims,
    claimVersions,
    edges,
    moves,
    brainRun: {
      ...prelude.brainRun,
      status: "succeeded",
      output: seed,
      error: null,
      completedAt: now,
    },
    idMaps: {
      claimIds,
      claimVersionIds,
      edgeIds,
    },
  };

  rememberDevPersistedBrainSeed(persisted);
  return persisted;
}

function failMemoryBrainSeedRun(prelude: BrainSeedPrelude, error: unknown): Promise<void> {
  prelude.brainRun.status = "failed";
  prelude.brainRun.error = {
    name: error instanceof Error ? error.name : "Error",
    message: formatErrorMessage(error),
  };
  prelude.brainRun.completedAt = new Date();

  return Promise.resolve();
}

function requireMappedMemoryId(ids: Map<string, string>, seedId: string): string {
  const persistedId = ids.get(seedId);

  if (!persistedId) {
    throw new Error(`Missing persisted id for ${seedId}.`);
  }

  return persistedId;
}

function resolveRouteDb(options: BrainSeedRouteOptions): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (options.prepareSeedRun && options.persistSeed) {
    return undefined;
  }

  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl?.trim() || shouldUseLocalInMemoryPennyData(databaseUrl)) {
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
