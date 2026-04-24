import { buildCognitiveBiasProfile, derivePennyShapes } from "@/lib/penny-insights";
import { listThoughtMaps } from "@/server/thought-map";
import type {
  CognitiveFingerprint,
  CognitiveFingerprintEntry,
  FingerprintEvidence,
  PatternImprovementEvent,
  PatternTrajectoryPoint,
} from "@/types/cognitive-fingerprint";
import type { BiasEntry, BiasType } from "@/types/thought-map";

function asDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function patternCategoryForBias(biasType: BiasType): CognitiveFingerprintEntry["patternCategory"] {
  const text = `${biasType.name} ${biasType.description}`.toLowerCase();
  if (/(update|calibration|confidence)/.test(text)) return "update_pattern";
  if (/(evidence|proof|source|support|reference)/.test(text)) return "evidence_pattern";
  if (/(domain|market|technical|research|people|operational|founder)/.test(text)) return "domain_tendency";
  if (/(tone|emotion|frustration|pressure|anxiety|stress)/.test(text)) return "emotional_pattern";
  return "bias";
}

function patternCategoryForShape(label: string): CognitiveFingerprintEntry["patternCategory"] {
  if (/(update|revise|confidence|calibration)/i.test(label)) return "update_pattern";
  if (/(evidence|proof|support|research|source)/i.test(label)) return "evidence_pattern";
  if (/(market|domain|technical|people|operator|founder|research)/i.test(label)) return "domain_tendency";
  if (/(defensive|overconfident|skeptic|confirmation|anchoring|bias)/i.test(label)) return "bias";
  if (/(tone|emotion|frustration|anxiety|pressure)/i.test(label)) return "emotional_pattern";
  return "reasoning_style";
}

function patternStatusFromBias(entry: BiasEntry): CognitiveFingerprintEntry["status"] {
  if (entry.status === "retired") return "retired";
  if (entry.status === "confirmed") return entry.trend === "weakening" ? "weakening" : "confirmed";
  if (entry.status === "monitoring") return "strengthening";
  return "emerging";
}

function patternStatusFromShape(shapeConfidence: number, verdict: string): CognitiveFingerprintEntry["status"] {
  if (/rejected/i.test(verdict)) return "weakening";
  if (/confirmed/i.test(verdict)) return shapeConfidence >= 80 ? "confirmed" : "strengthening";
  if (/refined/i.test(verdict)) return "strengthening";
  return "emerging";
}

function biasEvidenceInstances(entry: BiasEntry): FingerprintEvidence[] {
  return entry.evidenceInstances.map((evidence) => ({
    id: evidence.eventId,
    eventType: evidence.eventType,
    eventDescription: evidence.description,
    claimContext: entry.biasType.name,
    signalStrength: evidence.signalStrength,
    timestamp: evidence.timestamp,
  }));
}

function shapeEvidenceInstances(shape: ReturnType<typeof derivePennyShapes>[number]): FingerprintEvidence[] {
  return shape.supportingNodes.slice(0, 8).map((node, index) => ({
    id: `${shape.id}:${node.id}:${index}`,
    eventType: "shape_support",
    eventDescription: `${shape.label} was supported by a node that repeatedly surfaced in the map.`,
    claimContext: node.content,
    signalStrength: Math.max(0.45, Math.min(0.95, shape.confidence / 100)),
    timestamp: asDate(node.updatedAt ?? node.createdAt),
  }));
}

function buildTrajectory(evidence: FingerprintEvidence[], baseConfidence: number): PatternTrajectoryPoint[] {
  if (!evidence.length) {
    return [
      {
        date: new Date(),
        strength: baseConfidence,
        eventTrigger: "derived",
      },
    ];
  }

  const sorted = [...evidence].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return sorted.map((instance, index) => ({
    date: instance.timestamp,
    strength: Math.max(10, Math.min(100, Math.round(baseConfidence + index * 2 - Math.max(0, sorted.length - index - 1)))),
    eventTrigger: instance.eventType,
  }));
}

function buildImprovementEvents(evidence: FingerprintEvidence[], category: CognitiveFingerprintEntry["patternCategory"]): PatternImprovementEvent[] {
  if (evidence.length < 2) {
    return [];
  }

  const last = evidence[evidence.length - 1];
  return [
    {
      date: last.timestamp,
      description: "This pattern weakened after repeated counter-signals and updates.",
      evidenceType: category,
      magnitudeOfImprovement: Math.min(24, Math.max(8, evidence.length * 2)),
    },
  ];
}

function buildBiasPattern(entry: BiasEntry, userId: string): CognitiveFingerprintEntry {
  const evidenceInstances = biasEvidenceInstances(entry);
  const confidence = Math.max(10, Math.min(100, entry.confidenceInBias));
  const trajectory = buildTrajectory(evidenceInstances, confidence);

  return {
    id: `bias:${entry.biasType.id}`,
    userId,
    patternName: entry.biasType.name,
    patternDescription: entry.biasType.description,
    patternCategory: patternCategoryForBias(entry.biasType),
    evidenceCount: entry.evidenceCount,
    firstDetected: entry.firstDetected,
    lastSignal: entry.lastSignal,
    strongestEvidenceEvent: entry.evidenceInstances[0]?.eventId ?? `bias:${entry.biasType.id}`,
    evidenceInstances,
    status: patternStatusFromBias(entry),
    confidenceInPattern: confidence,
    howItAffectsYou:
      entry.biasType.id === "overconfidence_bias"
        ? "You can move too fast on high-stakes claims when confidence outruns evidence."
        : entry.biasType.id === "anchoring_bias"
          ? "First impressions can hold too long, especially after critique has already changed the claim."
          : entry.biasType.id === "confirmation_bias"
            ? "You may privilege supporting evidence too early unless Penny keeps the counterevidence in view."
            : `This bias changes how you handle ${entry.biasType.claimDomains.slice(0, 2).join(" and ") || "hard"} claims.`,
    howPennyResponds:
      entry.biasType.mitigationPrompts[0] ??
      "Penny should slow the critique down, ask for a falsifier, and keep the strongest counterexample visible.",
    trajectory,
    hasEverImproved: entry.trend === "weakening" || entry.mitigationSuccesses > 0,
    improvementEvents: buildImprovementEvents(evidenceInstances, patternCategoryForBias(entry.biasType)),
    userAcknowledged: entry.status === "confirmed" || entry.status === "retired",
    userDisputeText: null,
    userFalsificationCondition: null,
  };
}

function buildShapePattern(shape: ReturnType<typeof derivePennyShapes>[number], userId: string): CognitiveFingerprintEntry {
  const evidenceInstances = shapeEvidenceInstances(shape);
  const confidence = Math.max(10, Math.min(100, Math.round(shape.confidence)));
  const trajectory = buildTrajectory(evidenceInstances, confidence);
  const patternCategory = patternCategoryForShape(shape.label);
  const status = patternStatusFromShape(confidence, shape.verdict);

  return {
    id: `shape:${shape.id}`,
    userId,
    patternName: shape.label,
    patternDescription: shape.summary,
    patternCategory,
    evidenceCount: Math.max(shape.evidenceNodeIds.length, evidenceInstances.length),
    firstDetected: evidenceInstances[0]?.timestamp ?? shape.derivation?.computedAt ?? new Date(),
    lastSignal: evidenceInstances.at(-1)?.timestamp ?? shape.derivation?.computedAt ?? new Date(),
    strongestEvidenceEvent: shape.evidenceNodeIds[0] ?? `shape:${shape.id}`,
    evidenceInstances,
    status,
    confidenceInPattern: confidence,
    howItAffectsYou:
      patternCategory === "update_pattern"
        ? "You are quick to revise when Penny makes the update concrete, but can stall if the next move is too abstract."
        : patternCategory === "evidence_pattern"
          ? "You want evidence to be visible before you treat a claim as load-bearing."
          : patternCategory === "emotional_pattern"
            ? "Pressure shifts your reasoning, so Penny should keep the next step short and grounded."
            : "This shape summarizes a recurring way your claims are organized and defended.",
    howPennyResponds:
      patternCategory === "update_pattern"
        ? "Penny should ask for the smallest credible update and the condition that would change it again."
        : patternCategory === "evidence_pattern"
          ? "Penny should surface the weakest missing comparison and the next testable source."
          : patternCategory === "emotional_pattern"
            ? "Penny should slow the cadence, reduce friction, and keep the claim legible."
            : "Penny should keep this shape visible and test whether the pattern still holds in a new map.",
    trajectory,
    hasEverImproved: status === "weakening",
    improvementEvents: buildImprovementEvents(evidenceInstances, patternCategory),
    userAcknowledged: status === "confirmed",
    userDisputeText: null,
    userFalsificationCondition: null,
  };
}

function dedupePatterns(patterns: CognitiveFingerprintEntry[]) {
  const bucket = new Map<string, CognitiveFingerprintEntry>();

  for (const pattern of patterns) {
    const key = pattern.patternName.toLowerCase();
    const existing = bucket.get(key);

    if (!existing) {
      bucket.set(key, pattern);
      continue;
    }

    const keepExisting =
      existing.evidenceCount > pattern.evidenceCount ||
      (existing.evidenceCount === pattern.evidenceCount && existing.confidenceInPattern >= pattern.confidenceInPattern);

    if (keepExisting) {
      continue;
    }

    bucket.set(key, pattern);
  }

  return [...bucket.values()].sort((a, b) => b.confidenceInPattern - a.confidenceInPattern || b.evidenceCount - a.evidenceCount);
}

function summarizePatterns(patterns: CognitiveFingerprintEntry[]) {
  if (patterns.length === 0) {
    return "Penny does not yet have enough history to describe your thinking confidently.";
  }

  const dominant = patterns[0]!;
  return `Penny has observed ${dominant.patternName.toLowerCase()} as a recurring part of how you think, and the evidence has become strong enough to name it.`;
}

function updateAggregate(entries: CognitiveFingerprintEntry[]) {
  const confirmedPatterns = entries.filter((entry) => entry.status === "confirmed" || entry.status === "strengthening");
  const emergingPatterns = entries.filter((entry) => entry.status === "emerging");
  const retiredPatterns = entries.filter((entry) => entry.status === "retired");
  const dominantPattern = entries[0] ?? null;
  const mostImprovedPattern =
    [...entries].sort((a, b) => {
      const aScore = a.hasEverImproved ? a.evidenceCount : 0;
      const bScore = b.hasEverImproved ? b.evidenceCount : 0;
      return bScore - aScore;
    })[0] ?? null;

  return { confirmedPatterns, emergingPatterns, retiredPatterns, dominantPattern, mostImprovedPattern };
}

export async function generateCognitiveFingerprint(userId: string): Promise<CognitiveFingerprint> {
  const maps = (await listThoughtMaps()).filter((map) => map.userId === userId);
  const allNodes = maps.flatMap((map) => map.nodes);
  const shapeCandidates = derivePennyShapes(allNodes).sort((a, b) => b.confidence - a.confidence).slice(0, 6);
  const biasProfile = maps.length ? buildCognitiveBiasProfile(maps, userId) : null;

  const entries = dedupePatterns([
    ...(biasProfile?.biasEntries ?? [])
      .filter((entry) => entry.evidenceCount > 0 || entry.status !== "suspected")
      .map((entry) => buildBiasPattern(entry, userId)),
    ...shapeCandidates.map((shape) => buildShapePattern(shape, userId)),
  ]);

  const aggregate = updateAggregate(entries);
  const uniqueCategories = new Set(entries.map((entry) => entry.patternCategory));
  const totalEvidence = entries.reduce((sum, entry) => sum + entry.evidenceCount, 0);

  return {
    userId,
    version: biasProfile?.profileVersion ?? 1,
    generatedAt: new Date(),
    totalPatternsDetected: entries.length,
    confirmedPatterns: aggregate.confirmedPatterns,
    emergingPatterns: aggregate.emergingPatterns,
    retiredPatterns: aggregate.retiredPatterns,
    dominantPattern: aggregate.dominantPattern,
    mostImprovedPattern: aggregate.mostImprovedPattern,
    uniquenessScore: Math.min(100, Math.round(entries.length * 6 + uniqueCategories.size * 8 + Math.min(20, totalEvidence))),
    summaryParagraph: summarizePatterns(entries),
    lensVersion: biasProfile?.profileVersion ?? 1,
  };
}
