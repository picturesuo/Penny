import type { PennyDatabase } from "./db/client.ts";
import { artifacts, claimEdges, claims, moves, sessions, sources } from "./db/schema.ts";
import type { BrainSeedOutput } from "./seed.ts";

export type PersistedBrainSeed = {
  session: typeof sessions.$inferSelect;
  source: typeof sources.$inferSelect;
  claims: Array<typeof claims.$inferSelect & { seedId: string }>;
  edges: Array<typeof claimEdges.$inferSelect & { seedId: string }>;
  moves: Array<typeof moves.$inferSelect & { seedId: string }>;
  artifacts: Array<typeof artifacts.$inferSelect & { seedId: string }>;
  idMaps: {
    claimIds: Map<string, string>;
    edgeIds: Map<string, string>;
    artifactIds: Map<string, string>;
  };
};

export class BrainSeedPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainSeedPersistenceError";
  }
}

export async function persistBrainSeed(db: PennyDatabase, seed: BrainSeedOutput): Promise<PersistedBrainSeed> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(sessions)
      .values({
        id: seed.session.id,
        status: seed.session.status,
        title: seed.seedClaim.text.slice(0, 120),
      })
      .returning();

    if (!session) {
      throw new BrainSeedPersistenceError("Failed to persist seed session.");
    }

    const [source] = await tx
      .insert(sources)
      .values({
        sessionId: session.id,
        kind: "raw_idea",
        rawText: seed.source.rawText,
      })
      .returning();

    if (!source) {
      throw new BrainSeedPersistenceError("Failed to persist seed source.");
    }

    const persistedClaimRows = await tx
      .insert(claims)
      .values(
        seed.thoughtMap.claims.map((claim) => ({
          sessionId: session.id,
          sourceId: source.id,
          kind: claim.kind,
          status: "exploratory" as const,
          text: claim.text,
          confidence: claim.confidence,
        })),
      )
      .returning();
    const persistedClaims = attachSeedIds(seed.thoughtMap.claims, persistedClaimRows, "claim");
    const claimIds = new Map(persistedClaims.map((claim) => [claim.seedId, claim.id]));

    const persistedEdges =
      seed.thoughtMap.edges.length > 0
        ? attachSeedIds(
            seed.thoughtMap.edges,
            await tx
              .insert(claimEdges)
              .values(
                seed.thoughtMap.edges.map((edge) => ({
                  sessionId: session.id,
                  fromClaimId: requireMappedId(claimIds, edge.fromClaimId, "edge.fromClaimId"),
                  toClaimId: requireMappedId(claimIds, edge.toClaimId, "edge.toClaimId"),
                  kind: edge.kind,
                  label: edge.label,
                })),
              )
              .returning(),
            "edge",
          )
        : [];
    const edgeIds = new Map(persistedEdges.map((edge) => [edge.seedId, edge.id]));

    const persistedArtifacts = attachSeedIds(
      seed.artifacts,
      await tx
        .insert(artifacts)
        .values(
          seed.artifacts.map((artifact) => ({
            sessionId: session.id,
            kind: artifact.kind,
            title: artifact.title,
            summary: artifact.summary,
            payload: {
              seedArtifactId: artifact.id,
              seedClaimIds: artifact.claimIds,
              seedEdgeIds: artifact.edgeIds,
              claimIds: artifact.claimIds.map((claimId) => requireMappedId(claimIds, claimId, "artifact.claimId")),
              edgeIds: artifact.edgeIds.map((edgeId) => requireMappedId(edgeIds, edgeId, "artifact.edgeId")),
              firstChallenge: artifact.kind === "challenge_brief" ? seed.firstChallenge : undefined,
              explorationPaths: artifact.kind === "idea_map" ? seed.explorationPaths : undefined,
              keyInsight: artifact.kind === "idea_map" ? seed.keyInsight : undefined,
            },
          })),
        )
        .returning(),
      "artifact",
    );
    const artifactIds = new Map(persistedArtifacts.map((artifact) => [artifact.seedId, artifact.id]));

    const persistedMoves = attachSeedIds(
      seed.moves,
      await tx
        .insert(moves)
        .values(
          seed.moves.map((move) => ({
            sessionId: session.id,
            kind: move.kind,
            summary: move.summary,
            payload: {
              seedMoveId: move.id,
              seedClaimIds: move.claimIds,
              seedEdgeIds: move.edgeIds,
              seedArtifactIds: move.artifactIds,
              claimIds: move.claimIds.map((claimId) => requireMappedId(claimIds, claimId, "move.claimId")),
              edgeIds: move.edgeIds.map((edgeId) => requireMappedId(edgeIds, edgeId, "move.edgeId")),
              artifactIds: move.artifactIds.map((artifactId) =>
                requireMappedId(artifactIds, artifactId, "move.artifactId"),
              ),
            },
          })),
        )
        .returning(),
      "move",
    );

    return {
      session,
      source,
      claims: persistedClaims,
      edges: persistedEdges,
      artifacts: persistedArtifacts,
      moves: persistedMoves,
      idMaps: {
        claimIds,
        edgeIds,
        artifactIds,
      },
    };
  });
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
