import { eq } from "drizzle-orm";
import type { PennyDatabase } from "./db/client.ts";
import {
  brainRuns,
  claimEdges,
  claims,
  claimVersions,
  moves,
  sessions,
  sources,
  sourceSpans,
} from "./db/schema.ts";
import type { BrainSeedInput, BrainSeedOutput } from "./seed.ts";

export type BrainSeedRunInput = {
  operation: string;
  provider: string;
  model?: string | null;
  input: unknown;
  startedAt?: Date;
};

export type BrainSeedPrelude = {
  session: typeof sessions.$inferSelect;
  source: typeof sources.$inferSelect;
  submittedSourceSpan: typeof sourceSpans.$inferSelect;
  brainRun: typeof brainRuns.$inferSelect;
};

export type PersistedBrainSeed = {
  session: typeof sessions.$inferSelect;
  source: typeof sources.$inferSelect;
  submittedSourceSpan: typeof sourceSpans.$inferSelect;
  claims: Array<typeof claims.$inferSelect & { seedId: string }>;
  claimVersions: Array<typeof claimVersions.$inferSelect & { seedId: string }>;
  edges: Array<typeof claimEdges.$inferSelect & { seedId: string }>;
  moves: Array<typeof moves.$inferSelect & { seedId: string }>;
  brainRun: typeof brainRuns.$inferSelect;
  idMaps: {
    claimIds: Map<string, string>;
    claimVersionIds: Map<string, string>;
    edgeIds: Map<string, string>;
  };
};

export class BrainSeedPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainSeedPersistenceError";
  }
}

export async function createBrainSeedPrelude(
  db: PennyDatabase,
  input: BrainSeedInput,
  run: BrainSeedRunInput,
): Promise<BrainSeedPrelude> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(sessions)
      .values({
        id: input.sessionId,
        status: "open",
        title: input.rawIdea.slice(0, 120),
      })
      .returning();

    if (!session) {
      throw new BrainSeedPersistenceError("Failed to create seed session.");
    }

    const [source] = await tx
      .insert(sources)
      .values({
        sessionId: session.id,
        kind: "raw_idea",
        rawText: input.rawIdea,
      })
      .returning();

    if (!source) {
      throw new BrainSeedPersistenceError("Failed to create seed source.");
    }

    const [submittedSourceSpan] = await tx
      .insert(sourceSpans)
      .values({
        sourceId: source.id,
        startOffset: 0,
        endOffset: input.rawIdea.length,
        label: "submitted_text",
      })
      .returning();

    if (!submittedSourceSpan) {
      throw new BrainSeedPersistenceError("Failed to create submitted source span.");
    }

    const [brainRun] = await tx
      .insert(brainRuns)
      .values({
        sessionId: session.id,
        sourceId: source.id,
        operation: run.operation,
        provider: run.provider,
        model: run.model,
        status: "running",
        input: run.input,
        createdAt: run.startedAt,
      })
      .returning();

    if (!brainRun) {
      throw new BrainSeedPersistenceError("Failed to create brain run.");
    }

    return {
      session,
      source,
      submittedSourceSpan,
      brainRun,
    };
  });
}

export async function persistBrainSeed(
  db: PennyDatabase,
  prelude: BrainSeedPrelude,
  seed: BrainSeedOutput,
): Promise<PersistedBrainSeed> {
  return db.transaction(async (tx) => {
    const seedClaims = [seed.seedClaim, ...seed.assumptions];
    const persistedClaimRows = await tx
      .insert(claims)
      .values(
        seedClaims.map((claim) => ({
          sessionId: prelude.session.id,
          sourceId: prelude.source.id,
          kind: claim.kind,
          status: "exploratory" as const,
          text: claim.text,
          confidence: claim.confidence,
        })),
      )
      .returning();
    const persistedClaims = attachSeedIds(seedClaims, persistedClaimRows, "claim");
    const claimIds = new Map(persistedClaims.map((claim) => [claim.seedId, claim.id]));

    const persistedClaimVersions = attachSeedIds(
      seedClaims,
      await tx
        .insert(claimVersions)
        .values(
          seedClaims.map((claim) => ({
            claimId: requireMappedId(claimIds, claim.id, "claimVersion.claimId"),
            sourceId: prelude.source.id,
            content: claim.text,
            status: "exploratory" as const,
            confidence: claim.confidence,
            isCurrent: true,
          })),
        )
        .returning(),
      "claimVersion",
    );
    const claimVersionIds = new Map(persistedClaimVersions.map((version) => [version.seedId, version.id]));

    const edgeSeeds = seed.thoughtMap.edges.filter(
      (edge) => edge.kind === "depends_on" && claimIds.has(edge.fromClaimId) && claimIds.has(edge.toClaimId),
    );
    const persistedEdges =
      edgeSeeds.length > 0
        ? attachSeedIds(
            edgeSeeds,
            await tx
              .insert(claimEdges)
              .values(
                edgeSeeds.map((edge) => ({
                  sessionId: prelude.session.id,
                  fromClaimId: requireMappedId(claimIds, edge.fromClaimId, "edge.fromClaimId"),
                  toClaimId: requireMappedId(claimIds, edge.toClaimId, "edge.toClaimId"),
                  kind: "depends_on" as const,
                  label: edge.label,
                })),
              )
              .returning(),
            "edge",
          )
        : [];
    const edgeIds = new Map(persistedEdges.map((edge) => [edge.seedId, edge.id]));
    const requiredMoves = buildRequiredMoves(seed, claimIds, edgeIds);
    const persistedMoves = attachSeedIds(
      requiredMoves,
      await tx
        .insert(moves)
        .values(
          requiredMoves.map((move) => ({
            sessionId: prelude.session.id,
            kind: move.kind,
            summary: move.summary,
            payload: {
              seedMoveId: move.id,
              brainRunId: prelude.brainRun.id,
              seedClaimIds: move.claimIds,
              seedEdgeIds: move.edgeIds,
              claimIds: move.claimIds.map((claimId) => requireMappedId(claimIds, claimId, "move.claimId")),
              edgeIds: move.edgeIds.map((edgeId) => requireMappedId(edgeIds, edgeId, "move.edgeId")),
            },
          })),
        )
        .returning(),
      "move",
    );
    const [brainRun] = await tx
      .update(brainRuns)
      .set({
        status: "succeeded",
        output: seed,
        error: null,
        completedAt: new Date(),
      })
      .where(eq(brainRuns.id, prelude.brainRun.id))
      .returning();

    if (!brainRun) {
      throw new BrainSeedPersistenceError("Failed to update brain run after seed persistence.");
    }

    return {
      session: prelude.session,
      source: prelude.source,
      submittedSourceSpan: prelude.submittedSourceSpan,
      claims: persistedClaims,
      claimVersions: persistedClaimVersions,
      edges: persistedEdges,
      moves: persistedMoves,
      brainRun,
      idMaps: {
        claimIds,
        claimVersionIds,
        edgeIds,
      },
    };
  });
}

export async function failBrainSeedRun(db: PennyDatabase, prelude: BrainSeedPrelude, error: unknown): Promise<void> {
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
    .where(eq(brainRuns.id, prelude.brainRun.id));
}

type RequiredMove = {
  id: string;
  kind: "seed_claim_created" | "assumptions_extracted" | "first_challenge_suggested";
  summary: string;
  claimIds: string[];
  edgeIds: string[];
};

function buildRequiredMoves(
  seed: BrainSeedOutput,
  claimIds: Map<string, string>,
  edgeIds: Map<string, string>,
): RequiredMove[] {
  const assumptionIds = seed.assumptions.map((assumption) => assumption.id).filter((claimId) => claimIds.has(claimId));
  const dependencyEdgeIds = seed.thoughtMap.edges
    .map((edge) => edge.id)
    .filter((edgeId) => edgeIds.has(edgeId));

  return [
    {
      id: "move.seed_claim_created",
      kind: "seed_claim_created",
      summary: "Created the stable seed claim and its first current version.",
      claimIds: [seed.seedClaim.id],
      edgeIds: [],
    },
    {
      id: "move.assumptions_extracted",
      kind: "assumptions_extracted",
      summary: "Created assumption claims and current versions from the seed extraction.",
      claimIds: assumptionIds,
      edgeIds: dependencyEdgeIds,
    },
    {
      id: "move.first_challenge_suggested",
      kind: "first_challenge_suggested",
      summary: "Suggested the first challenge against the weakest load-bearing claim.",
      claimIds: [seed.firstChallenge.targetClaimId],
      edgeIds: dependencyEdgeIds.filter((edgeId) => {
        const edge = seed.thoughtMap.edges.find((candidate) => candidate.id === edgeId);

        return edge?.toClaimId === seed.firstChallenge.targetClaimId;
      }),
    },
  ];
}

function attachSeedIds<Seed extends { id: string }, Persisted>(
  seeds: Seed[],
  persistedRows: Persisted[],
  label: string,
): Array<Persisted & { seedId: string }> {
  if (seeds.length !== persistedRows.length) {
    throw new BrainSeedPersistenceError(
      `Failed to persist all ${label} rows: expected ${seeds.length}, received ${persistedRows.length}.`,
    );
  }

  return persistedRows.map((row, index) => {
    const seed = seeds[index];

    if (!seed) {
      throw new BrainSeedPersistenceError(`Missing ${label} seed for persisted row ${index}.`);
    }

    return {
      ...row,
      seedId: seed.id,
    };
  });
}

function requireMappedId(ids: Map<string, string>, seedId: string, label: string): string {
  const persistedId = ids.get(seedId);

  if (!persistedId) {
    throw new BrainSeedPersistenceError(`${label} references unknown seed id ${seedId}.`);
  }

  return persistedId;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}
