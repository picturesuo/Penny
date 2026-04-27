import type { PennyDatabase } from "./db/client.ts";
import {
  artifacts,
  brainRuns,
  claimEdges,
  claims,
  claimVersions,
  moves,
  sessions,
  sources,
  sourceSpans,
} from "./db/schema.ts";
import type { BrainSeedOutput } from "./seed.ts";

export type BrainSeedRunRecord = {
  operation: string;
  provider: string;
  model?: string | null;
  status: string;
  input: unknown;
  output?: unknown;
  error?: unknown;
  startedAt?: Date;
  completedAt?: Date;
};

export type PersistBrainSeedOptions = {
  brainRun?: BrainSeedRunRecord | undefined;
};

export type PersistedBrainSeed = {
  session: typeof sessions.$inferSelect;
  source: typeof sources.$inferSelect;
  claims: Array<typeof claims.$inferSelect & { seedId: string }>;
  claimVersions: Array<typeof claimVersions.$inferSelect & { seedId: string }>;
  edges: Array<typeof claimEdges.$inferSelect & { seedId: string }>;
  sourceSpans: Array<typeof sourceSpans.$inferSelect & { seedId: string }>;
  moves: Array<typeof moves.$inferSelect & { seedId: string }>;
  artifacts: Array<typeof artifacts.$inferSelect & { seedId: string }>;
  brainRun: typeof brainRuns.$inferSelect | null;
  idMaps: {
    claimIds: Map<string, string>;
    claimVersionIds: Map<string, string>;
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

export async function persistBrainSeed(
  db: PennyDatabase,
  seed: BrainSeedOutput,
  options: PersistBrainSeedOptions = {},
): Promise<PersistedBrainSeed> {
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
          // Temporary compatibility mirror. Canonical content lives in claim_versions.
          status: "exploratory" as const,
          text: claim.text,
          confidence: claim.confidence,
        })),
      )
      .returning();
    const persistedClaims = attachSeedIds(seed.thoughtMap.claims, persistedClaimRows, "claim");
    const claimIds = new Map(persistedClaims.map((claim) => [claim.seedId, claim.id]));

    const persistedClaimVersions = attachSeedIds(
      seed.thoughtMap.claims,
      await tx
        .insert(claimVersions)
        .values(
          seed.thoughtMap.claims.map((claim) => ({
            claimId: requireMappedId(claimIds, claim.id, "claimVersion.claimId"),
            sourceId: source.id,
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

    const persistedSourceSpans = attachSeedIds(
      seed.thoughtMap.claims,
      await tx
        .insert(sourceSpans)
        .values(
          seed.thoughtMap.claims.map((claim) => {
            const span = sourceSpanForClaim(seed.source.rawText, claim.text);

            return {
              sourceId: source.id,
              claimId: requireMappedId(claimIds, claim.id, "sourceSpan.claimId"),
              claimVersionId: requireMappedId(claimVersionIds, claim.id, "sourceSpan.claimVersionId"),
              startOffset: span.startOffset,
              endOffset: span.endOffset,
              label: claim.id === seed.seedClaim.id ? "seed_claim" : "generated_claim",
            };
          }),
        )
        .returning(),
      "sourceSpan",
    );

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
              learnCandidates:
                artifact.kind === "idea_map"
                  ? seed.learnCandidates.map((candidate) => ({
                      ...candidate,
                      claimId: requireMappedId(claimIds, candidate.claimId, "learnCandidate.claimId"),
                      seedClaimId: candidate.claimId,
                    }))
                  : undefined,
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

    const brainRun = options.brainRun
      ? ((await tx
          .insert(brainRuns)
          .values({
            sessionId: session.id,
            sourceId: source.id,
            operation: options.brainRun.operation,
            provider: options.brainRun.provider,
            model: options.brainRun.model,
            status: options.brainRun.status,
            input: options.brainRun.input,
            output: options.brainRun.output,
            error: options.brainRun.error,
            createdAt: options.brainRun.startedAt,
            completedAt: options.brainRun.completedAt,
          })
          .returning())[0] ?? null)
      : null;

    return {
      session,
      source,
      claims: persistedClaims,
      claimVersions: persistedClaimVersions,
      edges: persistedEdges,
      sourceSpans: persistedSourceSpans,
      artifacts: persistedArtifacts,
      moves: persistedMoves,
      brainRun,
      idMaps: {
        claimIds,
        claimVersionIds,
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

function sourceSpanForClaim(rawText: string, claimText: string): { startOffset: number; endOffset: number } {
  const startOffset = rawText.indexOf(claimText);

  if (startOffset >= 0) {
    return {
      startOffset,
      endOffset: startOffset + claimText.length,
    };
  }

  return {
    startOffset: 0,
    endOffset: rawText.length,
  };
}
