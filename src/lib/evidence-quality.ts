import type { Evidence, EvidenceQualityComponent, EvidenceReplicationStatus, EvidenceType, ThoughtMapModel, ThoughtNodeModel } from "@/types/thought-map";

export interface EvidenceQualityInput {
  evidenceText: string;
  evidenceType: EvidenceType;
  sourceUrl?: string | null;
  sourceName?: string | null;
  publicationDate?: Date | string | null;
  authorCredentials?: string | null;
  sampleSize?: number | null;
  replicationStatus?: EvidenceReplicationStatus | null;
  addedAt?: Date | string | null;
  asOf?: Date | string | null;
}

export interface EvidenceTypeDistributionEntry {
  evidenceType: EvidenceType;
  count: number;
  averageQualityScore: number | null;
}

export interface ClaimEvidenceSummary {
  claimId: string;
  evidenceCount: number;
  averageQualityScore: number | null;
  evidenceTypeDistribution: EvidenceTypeDistributionEntry[];
  latestPublicationDate: Date | null;
  oldestPublicationDate: Date | null;
  warnings: string[];
  allEvidenceSameType: boolean;
  allEvidenceBelowThreshold: boolean;
  oldestEvidenceAgeYears: number | null;
}

export interface EvidenceGateClaim {
  claimId: string;
  claimText: string;
  averageQualityScore: number | null;
  evidenceCount: number;
  warnings: string[];
}

export interface EvidenceQualityGateResult {
  blocked: boolean;
  message: string | null;
  loadBearingClaims: EvidenceGateClaim[];
  lowQualityClaims: EvidenceGateClaim[];
}

type ScoredEvidenceQualityComponent = EvidenceQualityComponent & {
  rawScore: number;
};

const EVIDENCE_TYPE_SCORES: Record<EvidenceType, { raw: number; explanation: string }> = {
  peer_reviewed: { raw: 25, explanation: "Peer-reviewed evidence carries the strongest source-type signal." },
  expert_opinion: { raw: 20, explanation: "Relevant expert opinion is strong but still softer than peer review." },
  survey_data: { raw: 18, explanation: "Survey data is useful if the sample is large and well-formed." },
  case_study: { raw: 15, explanation: "A case study is informative but narrower than broad data." },
  first_hand_observation: { raw: 12, explanation: "Direct observation is useful, though it can still be narrow." },
  anecdote: { raw: 6, explanation: "An anecdote is directional, but it is not robust evidence." },
  analogy: { raw: 5, explanation: "An analogy can suggest structure, but it does not test the claim directly." },
  intuition: { raw: 4, explanation: "Intuition is useful for direction, but it is the least explicit evidence class." },
  hearsay: { raw: 2, explanation: "Hearsay is weak evidence and should be treated cautiously." },
};

const EVIDENCE_TYPE_BEST_RAW = 25;

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function yearsBetween(later: Date, earlier: Date) {
  return Math.max(0, (later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

function scoreSourceType(evidenceType: EvidenceType): ScoredEvidenceQualityComponent {
  const entry = EVIDENCE_TYPE_SCORES[evidenceType];
  return {
    dimension: "source_type",
    score: Math.round((entry.raw / EVIDENCE_TYPE_BEST_RAW) * 20),
    rawScore: entry.raw,
    explanation: entry.explanation,
  };
}

function scoreRecency(input: EvidenceQualityInput, asOf: Date) {
  const publicationDate = toDate(input.publicationDate);

  if (!publicationDate) {
    return {
      dimension: "recency" as const,
      score: 8,
      rawScore: 8,
      explanation: "No publication date was provided, so Penny treats recency as unknown rather than overconfident.",
    };
  }

  const ageYears = yearsBetween(asOf, publicationDate);
  let raw = 2;
  let explanation = "The evidence is older than 10 years, so its context may have shifted.";

  if (ageYears < 1) {
    raw = 20;
    explanation = "The evidence is less than a year old, so the context is very fresh.";
  } else if (ageYears <= 3) {
    raw = 15;
    explanation = "The evidence is between 1 and 3 years old, so it still carries useful recency.";
  } else if (ageYears <= 5) {
    raw = 10;
    explanation = "The evidence is between 3 and 5 years old, so it is somewhat dated.";
  } else if (ageYears <= 10) {
    raw = 5;
    explanation = "The evidence is between 5 and 10 years old, so the context may have drifted.";
  }

  return {
    dimension: "recency" as const,
    score: raw,
    rawScore: raw,
    explanation,
  };
}

function scoreSampleSize(input: EvidenceQualityInput) {
  if (typeof input.sampleSize !== "number" || Number.isNaN(input.sampleSize) || input.sampleSize <= 0) {
    return {
      dimension: "sample_size" as const,
      score: 5,
      rawScore: 5,
      explanation: "Sample size was not provided, so Penny uses a small neutral baseline instead of assuming robustness.",
    };
  }

  if (input.sampleSize > 1000) {
    return {
      dimension: "sample_size" as const,
      score: 20,
      rawScore: 20,
      explanation: "The sample is very large, which supports stronger generalization.",
    };
  }

  if (input.sampleSize > 100) {
    return {
      dimension: "sample_size" as const,
      score: 15,
      rawScore: 15,
      explanation: "The sample is reasonably large and likely supports a stable signal.",
    };
  }

  if (input.sampleSize > 10) {
    return {
      dimension: "sample_size" as const,
      score: 10,
      rawScore: 10,
      explanation: "The sample is modest, which is useful but not yet broad.",
    };
  }

  if (input.sampleSize > 1) {
    return {
      dimension: "sample_size" as const,
      score: 5,
      rawScore: 5,
      explanation: "The sample is very small, so Penny keeps the weight low.",
    };
  }

  return {
    dimension: "sample_size" as const,
    score: 2,
    rawScore: 2,
    explanation: "A sample size of one is extremely narrow and should not be overgeneralized.",
  };
}

function scoreReplication(input: EvidenceQualityInput) {
  const replicationStatus = input.replicationStatus ?? "unknown";

  if (replicationStatus === "replicated") {
    return {
      dimension: "replication" as const,
      score: 15,
      rawScore: 15,
      explanation: "The evidence has replicated, which strengthens confidence in the underlying pattern.",
    };
  }

  if (replicationStatus === "unreplicated") {
    return {
      dimension: "replication" as const,
      score: 4,
      rawScore: 4,
      explanation: "The evidence has not yet replicated, so Penny keeps it discounted.",
    };
  }

  if (replicationStatus === "contested") {
    return {
      dimension: "replication" as const,
      score: 2,
      rawScore: 2,
      explanation: "The evidence is contested, so Penny treats it as fragile.",
    };
  }

  return {
    dimension: "replication" as const,
    score: 8,
    rawScore: 8,
    explanation: "Replication status is unknown, so Penny uses a moderate baseline.",
  };
}

function scoreCredentials(input: EvidenceQualityInput) {
  const credentials = (input.authorCredentials ?? "").toLowerCase();

  if (!credentials.trim()) {
    return {
      dimension: "credentials" as const,
      score: 0,
      rawScore: 0,
      explanation: "No credentials were provided, so Penny cannot tell how closely the source sits to the claim domain.",
    };
  }

  if (/(ph\.?d|professor|researcher|scientist|doctor|md|engineer|specialist|expert|principal|director)/i.test(credentials)) {
    return {
      dimension: "credentials" as const,
      score: 10,
      rawScore: 10,
      explanation: "The source appears to be a relevant domain expert.",
    };
  }

  if (/(operator|manager|consultant|analyst|founder|founders|lead|senior)/i.test(credentials)) {
    return {
      dimension: "credentials" as const,
      score: 6,
      rawScore: 6,
      explanation: "The source appears adjacent to the domain, which is helpful but not definitive.",
    };
  }

  if (/(credible|credible observer|credible source|journalist|writer|employee|practitioner)/i.test(credentials)) {
    return {
      dimension: "credentials" as const,
      score: 3,
      rawScore: 3,
      explanation: "The source has general credibility, but the domain proximity is unclear.",
    };
  }

  return {
    dimension: "credentials" as const,
    score: 3,
    rawScore: 3,
    explanation: "The credentials are present but not clearly specific enough for Penny to rank them highly.",
  };
}

function scoreDirectness(input: EvidenceQualityInput) {
  const text = `${input.evidenceText} ${input.sourceName ?? ""}`.toLowerCase();
  const type = input.evidenceType;

  if (/(directly tests|directly shows|measured|measures|experiment|trial|survey|observed|replicated|data show|data suggests)/.test(text)) {
    return {
      dimension: "directness" as const,
      score: 10,
      rawScore: 10,
      explanation: "The evidence directly tests or measures the claim.",
    };
  }

  if (/(supports|indicates|suggests|implies|correlates|shows)/.test(text)) {
    return {
      dimension: "directness" as const,
      score: 6,
      rawScore: 6,
      explanation: "The evidence supports the claim, but it does not fully test it directly.",
    };
  }

  if (/(analogy|like|similar to|as if|resembles)/.test(text) || type === "analogy") {
    return {
      dimension: "directness" as const,
      score: 3,
      rawScore: 3,
      explanation: "The evidence is analogical rather than directly causal or observational.",
    };
  }

  return {
    dimension: "directness" as const,
    score: type === "peer_reviewed" || type === "survey_data" || type === "first_hand_observation" ? 8 : 5,
    rawScore: type === "peer_reviewed" || type === "survey_data" || type === "first_hand_observation" ? 8 : 5,
    explanation: "The evidence is somewhat related to the claim, but its directness is not fully explicit.",
  };
}

export function scoreEvidenceQuality(input: EvidenceQualityInput) {
  const asOf = toDate(input.asOf) ?? new Date();
  const sourceType = scoreSourceType(input.evidenceType);
  const recency = scoreRecency(input, asOf);
  const sampleSize = scoreSampleSize(input);
  const replication = scoreReplication(input);
  const credentials = scoreCredentials(input);
  const directness = scoreDirectness(input);

  const qualityScore = clampScore(
    sourceType.rawScore + recency.rawScore + sampleSize.rawScore + replication.rawScore + credentials.rawScore + directness.rawScore,
  );

  return {
    qualityScore,
    qualityComponents: [sourceType, recency, sampleSize, replication, credentials, directness].map(
      (component) => ({
        dimension: component.dimension,
        score: component.score,
        explanation: component.explanation,
      }),
    ),
  };
}

function scoreAverage(evidence: Evidence[]) {
  if (!evidence.length) {
    return null;
  }

  return Math.round((evidence.reduce((sum, entry) => sum + entry.qualityScore, 0) / evidence.length) * 10) / 10;
}

export function buildClaimEvidenceSummary(params: {
  claimId: string;
  evidence: Evidence[];
}): ClaimEvidenceSummary {
  const claimEvidence = params.evidence.filter((entry) => entry.claimId === params.claimId);
  const averageQualityScore = scoreAverage(claimEvidence);
  const evidenceTypeDistribution = (Object.keys(EVIDENCE_TYPE_SCORES) as EvidenceType[]).map((evidenceType) => {
    const entries = claimEvidence.filter((entry) => entry.evidenceType === evidenceType);
    return {
      evidenceType,
      count: entries.length,
      averageQualityScore: scoreAverage(entries),
    };
  });
  const publicationDates = claimEvidence
    .map((entry) => entry.publicationDate)
    .filter((date): date is Date => date != null)
    .sort((a, b) => a.getTime() - b.getTime());
  const oldestPublicationDate = publicationDates[0] ?? null;
  const latestPublicationDate = publicationDates[publicationDates.length - 1] ?? null;
  const oldestEvidenceAgeYears = oldestPublicationDate ? yearsBetween(new Date(), oldestPublicationDate) : null;
  const allEvidenceSameType = claimEvidence.length > 1 && new Set(claimEvidence.map((entry) => entry.evidenceType)).size === 1;
  const allEvidenceBelowThreshold = claimEvidence.length > 0 && claimEvidence.every((entry) => entry.qualityScore < 40);
  const warnings: string[] = [];

  if (allEvidenceBelowThreshold) {
    warnings.push("This claim is supported only by low-quality evidence.");
  }

  if (allEvidenceSameType) {
    const evidenceType = claimEvidence[0]?.evidenceType ?? "anecdote";
    warnings.push(`All evidence comes from ${evidenceType.replaceAll("_", " ")}. Consider seeking higher-quality sources.`);
  }

  if (oldestEvidenceAgeYears != null && oldestEvidenceAgeYears > 5) {
    warnings.push("Primary evidence for this claim is aging.");
  }

  return {
    claimId: params.claimId,
    evidenceCount: claimEvidence.length,
    averageQualityScore,
    evidenceTypeDistribution,
    latestPublicationDate,
    oldestPublicationDate,
    warnings,
    allEvidenceSameType,
    allEvidenceBelowThreshold,
    oldestEvidenceAgeYears,
  };
}

function activeNodes(map: ThoughtMapModel) {
  return map.nodes.filter((node) => node.nodeStatus !== "superseded");
}

function loadBearingNodes(map: ThoughtMapModel, limit = 5) {
  return [...activeNodes(map)]
    .filter((node) => node.kind !== "root")
    .sort(
      (a, b) =>
        ((b.scores?.centrality ?? 0) * 0.3 +
          (b.scores?.dependencyRisk ?? 0) * 0.3 +
          (b.scores?.strength ?? 0) * 0.2 +
          (b.scores?.confidence ?? 0) * 0.2) -
          ((a.scores?.centrality ?? 0) * 0.3 +
            (a.scores?.dependencyRisk ?? 0) * 0.3 +
            (a.scores?.strength ?? 0) * 0.2 +
            (a.scores?.confidence ?? 0) * 0.2),
    )
    .filter((node) => (node.scores?.confidence ?? 0) >= 0.4 || node.kind === "assumption" || node.kind === "core_claim")
    .slice(0, limit);
}

function evidenceSummaryForNode(map: ThoughtMapModel, node: ThoughtNodeModel) {
  return buildClaimEvidenceSummary({
    claimId: node.id,
    evidence: map.evidence,
  });
}

export function buildEvidenceQualityGate(map: ThoughtMapModel) {
  const loadBearingClaims = loadBearingNodes(map).map((node) => {
    const summary = evidenceSummaryForNode(map, node);
    return {
      claimId: node.id,
      claimText: node.content,
      averageQualityScore: summary.averageQualityScore,
      evidenceCount: summary.evidenceCount,
      warnings: summary.warnings,
    };
  });

  const lowQualityClaims = loadBearingClaims.filter((claim) => (claim.averageQualityScore ?? 0) < 30);

  return {
    blocked: lowQualityClaims.length > 0,
    message:
      lowQualityClaims.length > 0
        ? `This artifact depends on poorly evidenced claims. Consider strengthening the evidence before proceeding.${lowQualityClaims.length ? ` Weak claims: ${lowQualityClaims.map((claim) => `“${claim.claimText}”`).join("; ")}` : ""}`
        : null,
    loadBearingClaims,
    lowQualityClaims,
  } satisfies EvidenceQualityGateResult;
}
