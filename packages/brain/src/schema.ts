import { z } from "zod";

export const BrainSeedInputSchema = z
  .object({
    rawIdea: z.string().trim().min(1).max(4_000),
    sessionId: z.string().uuid().optional(),
  })
  .strict();

export const ClaimKindSchema = z.enum(["belief", "assumption", "question", "concept"]);
export const EdgeKindSchema = z.enum(["assumes", "supports", "questions", "challenges", "clarifies"]);
export const PressureSchema = z.enum(["low", "medium", "high"]);
export const MoveKindSchema = z.enum([
  "source.recorded",
  "claim.created",
  "edge.created",
  "assumption.extracted",
  "exploration.suggested",
  "challenge.created",
  "artifact.created",
]);
export const ArtifactKindSchema = z.enum(["idea_map", "challenge_brief"]);

const IdSchema = z.string().trim().min(1).max(80);

export const BrainSeedClaimSchema = z
  .object({
    id: IdSchema,
    kind: ClaimKindSchema,
    text: z.string().trim().min(1).max(700),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const BrainSeedAssumptionSchema = BrainSeedClaimSchema.extend({
  kind: z.literal("assumption"),
  pressure: PressureSchema,
  whyItMatters: z.string().trim().min(1).max(600),
}).strict();

export const BrainSeedEdgeSchema = z
  .object({
    id: IdSchema,
    fromClaimId: IdSchema,
    toClaimId: IdSchema,
    kind: EdgeKindSchema,
    label: z.string().trim().min(1).max(160),
  })
  .strict();

export const BrainSeedThoughtMapSchema = z
  .object({
    claims: z.array(BrainSeedClaimSchema).min(1).max(12),
    edges: z.array(BrainSeedEdgeSchema).max(20),
  })
  .strict();

export const BrainSeedExplorationPathSchema = z
  .object({
    id: IdSchema,
    title: z.string().trim().min(1).max(120),
    prompt: z.string().trim().min(1).max(500),
    expectedValue: z.string().trim().min(1).max(400),
  })
  .strict();

export const BrainSeedChallengeSchema = z
  .object({
    targetClaimId: IdSchema,
    weakestPart: z.string().trim().min(1).max(500),
    challenge: z.string().trim().min(1).max(900),
    responseOptions: z.tuple([z.literal("Defend"), z.literal("Revise"), z.literal("Absorb")]),
  })
  .strict();

export const BrainSeedSourceSchema = z
  .object({
    id: IdSchema,
    rawText: z.string().trim().min(1).max(4_000),
  })
  .strict();

export const BrainSeedSessionSchema = z
  .object({
    id: z.string().uuid(),
    sourceId: IdSchema,
    status: z.literal("seeded"),
  })
  .strict();

export const BrainSeedMoveSchema = z
  .object({
    id: IdSchema,
    kind: MoveKindSchema,
    summary: z.string().trim().min(1).max(500),
    claimIds: z.array(IdSchema).max(12),
    edgeIds: z.array(IdSchema).max(20),
    artifactIds: z.array(IdSchema).max(4),
  })
  .strict();

export const BrainSeedArtifactSchema = z
  .object({
    id: IdSchema,
    kind: ArtifactKindSchema,
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(900),
    claimIds: z.array(IdSchema).min(1).max(12),
    edgeIds: z.array(IdSchema).max(20),
  })
  .strict();

export const BrainSeedOutputSchema = z
  .object({
    source: BrainSeedSourceSchema,
    session: BrainSeedSessionSchema,
    seedClaim: BrainSeedClaimSchema,
    assumptions: z.array(BrainSeedAssumptionSchema).min(1).max(6),
    thoughtMap: BrainSeedThoughtMapSchema,
    explorationPaths: z.array(BrainSeedExplorationPathSchema).min(1).max(5),
    keyInsight: z.string().trim().min(1).max(700),
    firstChallenge: BrainSeedChallengeSchema,
    moves: z.array(BrainSeedMoveSchema).min(1).max(24),
    artifacts: z.array(BrainSeedArtifactSchema).min(2).max(4),
  })
  .strict()
  .superRefine((output, context) => {
    const claimIds = new Set(output.thoughtMap.claims.map((claim) => claim.id));
    const edgeIds = new Set(output.thoughtMap.edges.map((edge) => edge.id));
    const artifactIds = new Set(output.artifacts.map((artifact) => artifact.id));

    if (output.session.sourceId !== output.source.id) {
      context.addIssue({
        code: "custom",
        message: "session.sourceId must reference source.id",
        path: ["session", "sourceId"],
      });
    }

    requireReferencedClaim(context, claimIds, output.seedClaim.id, ["seedClaim", "id"], "seedClaim");

    for (const [index, assumption] of output.assumptions.entries()) {
      requireReferencedClaim(context, claimIds, assumption.id, ["assumptions", index, "id"], "assumption");
    }

    requireReferencedClaim(
      context,
      claimIds,
      output.firstChallenge.targetClaimId,
      ["firstChallenge", "targetClaimId"],
      "firstChallenge.targetClaimId",
    );

    for (const [index, edge] of output.thoughtMap.edges.entries()) {
      requireReferencedClaim(context, claimIds, edge.fromClaimId, ["thoughtMap", "edges", index, "fromClaimId"], "edge.fromClaimId");
      requireReferencedClaim(context, claimIds, edge.toClaimId, ["thoughtMap", "edges", index, "toClaimId"], "edge.toClaimId");
    }

    for (const [artifactIndex, artifact] of output.artifacts.entries()) {
      for (const [claimIndex, claimId] of artifact.claimIds.entries()) {
        requireReferencedClaim(context, claimIds, claimId, ["artifacts", artifactIndex, "claimIds", claimIndex], "artifact.claimId");
      }

      for (const [edgeIndex, edgeId] of artifact.edgeIds.entries()) {
        requireReferencedEdge(context, edgeIds, edgeId, ["artifacts", artifactIndex, "edgeIds", edgeIndex], "artifact.edgeId");
      }
    }

    for (const [moveIndex, move] of output.moves.entries()) {
      for (const [claimIndex, claimId] of move.claimIds.entries()) {
        requireReferencedClaim(context, claimIds, claimId, ["moves", moveIndex, "claimIds", claimIndex], "move.claimId");
      }

      for (const [edgeIndex, edgeId] of move.edgeIds.entries()) {
        requireReferencedEdge(context, edgeIds, edgeId, ["moves", moveIndex, "edgeIds", edgeIndex], "move.edgeId");
      }

      for (const [artifactIndex, artifactId] of move.artifactIds.entries()) {
        requireReferencedArtifact(context, artifactIds, artifactId, ["moves", moveIndex, "artifactIds", artifactIndex], "move.artifactId");
      }
    }

    requireArtifactKind(context, output.artifacts, "idea_map");
    requireArtifactKind(context, output.artifacts, "challenge_brief");
    requireMoveKind(context, output.moves, "source.recorded");
    requireMoveKind(context, output.moves, "claim.created");
    requireMoveKind(context, output.moves, "edge.created");
    requireMoveKind(context, output.moves, "challenge.created");
    requireMoveKind(context, output.moves, "artifact.created");
  });

export type BrainSeedInput = z.infer<typeof BrainSeedInputSchema>;
export type BrainSeedOutput = z.infer<typeof BrainSeedOutputSchema>;

export class BrainSeedValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = "BrainSeedValidationError";
    this.issues = issues;
  }
}

export function flattenIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
}

function requireReferencedClaim(
  context: z.RefinementCtx,
  claimIds: Set<string>,
  claimId: string,
  path: Array<string | number>,
  label: string,
) {
  if (claimIds.has(claimId)) {
    return;
  }

  context.addIssue({
    code: "custom",
    message: `${label} must reference a thoughtMap claim`,
    path,
  });
}

function requireReferencedEdge(
  context: z.RefinementCtx,
  edgeIds: Set<string>,
  edgeId: string,
  path: Array<string | number>,
  label: string,
) {
  if (edgeIds.has(edgeId)) {
    return;
  }

  context.addIssue({
    code: "custom",
    message: `${label} must reference a thoughtMap edge`,
    path,
  });
}

function requireReferencedArtifact(
  context: z.RefinementCtx,
  artifactIds: Set<string>,
  artifactId: string,
  path: Array<string | number>,
  label: string,
) {
  if (artifactIds.has(artifactId)) {
    return;
  }

  context.addIssue({
    code: "custom",
    message: `${label} must reference an artifact`,
    path,
  });
}

function requireArtifactKind(
  context: z.RefinementCtx,
  artifacts: Array<z.infer<typeof BrainSeedArtifactSchema>>,
  kind: z.infer<typeof ArtifactKindSchema>,
) {
  if (artifacts.some((artifact) => artifact.kind === kind)) {
    return;
  }

  context.addIssue({
    code: "custom",
    message: `artifacts must include ${kind}`,
    path: ["artifacts"],
  });
}

function requireMoveKind(
  context: z.RefinementCtx,
  moves: Array<z.infer<typeof BrainSeedMoveSchema>>,
  kind: z.infer<typeof MoveKindSchema>,
) {
  if (moves.some((move) => move.kind === kind)) {
    return;
  }

  context.addIssue({
    code: "custom",
    message: `moves must include ${kind}`,
    path: ["moves"],
  });
}
