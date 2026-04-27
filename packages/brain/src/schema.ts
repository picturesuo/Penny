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

export const BrainSeedClaimSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
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
    id: z.string().trim().min(1).max(80),
    fromClaimId: z.string().trim().min(1).max(80),
    toClaimId: z.string().trim().min(1).max(80),
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
    id: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(120),
    prompt: z.string().trim().min(1).max(500),
    expectedValue: z.string().trim().min(1).max(400),
  })
  .strict();

export const BrainSeedChallengeSchema = z
  .object({
    targetClaimId: z.string().trim().min(1).max(80),
    weakestPart: z.string().trim().min(1).max(500),
    challenge: z.string().trim().min(1).max(900),
    responseOptions: z.tuple([z.literal("Defend"), z.literal("Revise"), z.literal("Absorb")]),
  })
  .strict();

export const BrainSeedOutputSchema = z
  .object({
    seedClaim: BrainSeedClaimSchema,
    assumptions: z.array(BrainSeedAssumptionSchema).min(1).max(6),
    thoughtMap: BrainSeedThoughtMapSchema,
    explorationPaths: z.array(BrainSeedExplorationPathSchema).min(1).max(5),
    keyInsight: z.string().trim().min(1).max(700),
    firstChallenge: BrainSeedChallengeSchema,
  })
  .strict()
  .superRefine((output, context) => {
    const claimIds = new Set(output.thoughtMap.claims.map((claim) => claim.id));

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
