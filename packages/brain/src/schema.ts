import { z } from "zod";

export const BrainSeedInputSchema = z
  .object({
    rawIdea: z.string().trim().min(1).max(4_000),
    sessionId: z.string().uuid().optional(),
  })
  .strict();

export const ClaimKindSchema = z.enum(["belief", "assumption", "question", "concept"]);
export const EdgeKindSchema = z.enum(["depends_on", "supports", "questions", "challenges", "clarifies"]);
export const PressureSchema = z.enum(["low", "medium", "high"]);
export const FailureTypeSchema = z.enum([
  "weak_evidence",
  "missing_counterargument",
  "shaky_assumption",
  "analogy_break",
  "dependency_risk",
  "unaddressed_precedent",
  "premise_rejection",
  "definition_failure",
]);

const IdSchema = z.string().trim().min(1).max(80);

export const BrainSeedClaimSchema = z
  .object({
    id: IdSchema,
    kind: ClaimKindSchema,
    text: z.string().trim().min(1).max(700),
    confidence: z.number().int().min(0).max(100),
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
    failureType: FailureTypeSchema,
    weakestPart: z.string().trim().min(1).max(500),
    challenge: z.string().trim().min(1).max(900),
    responseOptions: z.tuple([z.literal("Defend"), z.literal("Revise"), z.literal("Absorb")]),
  })
  .strict();

export const BrainSeedLearnCandidateSchema = z
  .object({
    id: IdSchema,
    claimId: IdSchema,
    term: z.string().trim().min(1).max(120),
    whyItMatters: z.string().trim().min(1).max(500),
    unblockExplanation: z.string().trim().min(1).max(500),
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
    status: z.literal("open"),
  })
  .strict();

const SeedProviderClaimSchema = z.object({
  id: z.string(),
  kind: ClaimKindSchema,
  text: z.string(),
  confidence: z.number(),
});

const SeedProviderAssumptionSchema = z.object({
  id: z.string(),
  kind: z.enum(["assumption"]),
  text: z.string(),
  confidence: z.number(),
  pressure: PressureSchema,
  whyItMatters: z.string(),
});

const SeedProviderEdgeSchema = z.object({
  id: z.string(),
  fromClaimId: z.string(),
  toClaimId: z.string(),
  kind: EdgeKindSchema,
  label: z.string(),
});

export const SeedProviderSchema = z.object({
  source: z.object({
    id: z.string(),
    rawText: z.string(),
  }),
  session: z.object({
    id: z.string(),
    sourceId: z.string(),
    status: z.enum(["open"]),
  }),
  seedClaim: SeedProviderClaimSchema,
  assumptions: z.array(SeedProviderAssumptionSchema),
  thoughtMap: z.object({
    claims: z.array(SeedProviderClaimSchema),
    edges: z.array(SeedProviderEdgeSchema),
  }),
  explorationPaths: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      prompt: z.string(),
      expectedValue: z.string(),
    }),
  ),
  keyInsight: z.string(),
  firstChallenge: z.object({
    targetClaimId: z.string(),
    failureType: FailureTypeSchema,
    weakestPart: z.string(),
    challenge: z.string(),
    responseOptions: z.array(z.enum(["Defend", "Revise", "Absorb"])),
  }),
  learnCandidates: z.array(
    z.object({
      id: z.string(),
      claimId: z.string(),
      term: z.string(),
      whyItMatters: z.string(),
      unblockExplanation: z.string(),
    }),
  ),
});

export const SeedStrictSchema = z
  .object({
    source: BrainSeedSourceSchema,
    session: BrainSeedSessionSchema,
    seedClaim: BrainSeedClaimSchema,
    assumptions: z.array(BrainSeedAssumptionSchema).min(3).max(6),
    thoughtMap: BrainSeedThoughtMapSchema,
    explorationPaths: z.array(BrainSeedExplorationPathSchema).min(6).max(8),
    keyInsight: z.string().trim().min(1).max(700),
    firstChallenge: BrainSeedChallengeSchema,
    learnCandidates: z.array(BrainSeedLearnCandidateSchema).min(1).max(3),
  })
  .strict()
  .superRefine((output, context) => {
    const claimIds = new Set(output.thoughtMap.claims.map((claim) => claim.id));

    rejectGenericSeedOutput(context, output);

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

    for (const [index, candidate] of output.learnCandidates.entries()) {
      requireReferencedClaim(context, claimIds, candidate.claimId, ["learnCandidates", index, "claimId"], "learnCandidate.claimId");
    }

    for (const [index, edge] of output.thoughtMap.edges.entries()) {
      requireReferencedClaim(context, claimIds, edge.fromClaimId, ["thoughtMap", "edges", index, "fromClaimId"], "edge.fromClaimId");
      requireReferencedClaim(context, claimIds, edge.toClaimId, ["thoughtMap", "edges", index, "toClaimId"], "edge.toClaimId");
    }
  });

export const BrainSeedAiOutputSchema = SeedProviderSchema;
export const BrainSeedOutputSchema = SeedStrictSchema;

export type BrainSeedInput = z.infer<typeof BrainSeedInputSchema>;
export type SeedProviderOutput = z.infer<typeof SeedProviderSchema>;
export type SeedStrictOutput = z.infer<typeof SeedStrictSchema>;
export type BrainSeedAiOutput = SeedProviderOutput;
export type BrainSeedOutput = SeedStrictOutput;

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

function rejectGenericSeedOutput(context: z.RefinementCtx, output: z.infer<typeof SeedStrictSchema>) {
  requireNonGenericText(context, output.seedClaim.text, ["seedClaim", "text"], "seedClaim.text");
  requireNonGenericText(context, output.keyInsight, ["keyInsight"], "keyInsight");
  requireNonGenericText(context, output.firstChallenge.weakestPart, ["firstChallenge", "weakestPart"], "firstChallenge.weakestPart");
  requireNonGenericText(context, output.firstChallenge.challenge, ["firstChallenge", "challenge"], "firstChallenge.challenge");

  for (const [index, assumption] of output.assumptions.entries()) {
    requireNonGenericText(context, assumption.text, ["assumptions", index, "text"], "assumption.text");
    requireNonGenericText(context, assumption.whyItMatters, ["assumptions", index, "whyItMatters"], "assumption.whyItMatters");
  }

  for (const [index, claim] of output.thoughtMap.claims.entries()) {
    requireNonGenericText(context, claim.text, ["thoughtMap", "claims", index, "text"], "thoughtMap.claim.text");
  }

  for (const [index, edge] of output.thoughtMap.edges.entries()) {
    requireNonGenericText(context, edge.label, ["thoughtMap", "edges", index, "label"], "edge.label");
  }

  for (const [index, path] of output.explorationPaths.entries()) {
    requireNonGenericText(context, path.title, ["explorationPaths", index, "title"], "explorationPath.title");
    requireNonGenericText(context, path.prompt, ["explorationPaths", index, "prompt"], "explorationPath.prompt");
    requireNonGenericText(
      context,
      path.expectedValue,
      ["explorationPaths", index, "expectedValue"],
      "explorationPath.expectedValue",
    );
  }

  for (const [index, candidate] of output.learnCandidates.entries()) {
    requireNonGenericText(context, candidate.term, ["learnCandidates", index, "term"], "learnCandidate.term");
    requireNonGenericText(
      context,
      candidate.whyItMatters,
      ["learnCandidates", index, "whyItMatters"],
      "learnCandidate.whyItMatters",
    );
    requireNonGenericText(
      context,
      candidate.unblockExplanation,
      ["learnCandidates", index, "unblockExplanation"],
      "learnCandidate.unblockExplanation",
    );
  }

}

function requireNonGenericText(
  context: z.RefinementCtx,
  value: string,
  path: Array<string | number>,
  label: string,
) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  const genericPatterns = [
    /\bas an ai\b/,
    /\bi can help\b/,
    /\bgeneric (advice|answer|response)\b/,
    /\bhere is a chatty answer\b/,
    /\byour idea is interesting\b/,
    /\bit depends on many factors\b/,
  ];

  if (!genericPatterns.some((pattern) => pattern.test(normalized))) {
    return;
  }

  context.addIssue({
    code: "custom",
    message: `${label} must be specific structured seed content, not a generic response`,
    path,
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
