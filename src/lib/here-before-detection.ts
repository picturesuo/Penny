import { captureSnapshotForMap } from "@/lib/penny-insights";
import { classifyCalibrationDomain } from "@/lib/calibration";
import { listThoughtMaps } from "@/server/thought-map";
import type { HereBeforeOutcome, HereBeforeSignal, SimilarityReason } from "@/types/here-before-detection";
import type { ClaimStake, ThoughtMapModel } from "@/types/thought-map";

export type HereBeforeClaimDraft = {
  id: string;
  text: string;
  domain: string;
  claimType: string;
  stakesLevel: "light" | "moderate" | "heavy";
  structureKind: string;
  provenance: string;
  confidence: number;
};

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function asDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function confidenceBucket(confidence: number) {
  const start = Math.floor(Math.max(0, Math.min(100, confidence)) / 10) * 10;
  return `${start}-${Math.min(100, start + 10)}%`;
}

function computeTextSimilarity(a: string, b: string) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (!aTokens.size || !bTokens.size) {
    return 0;
  }

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(aTokens.size, bTokens.size);
}

function inferStakeLevel(stakes: ClaimStake[] | string[] | undefined) {
  const all = (stakes ?? []).map((stake) => String(stake));
  if (all.some((stake) => /money|reputation|existential/i.test(stake))) {
    return "heavy";
  }

  if (all.length > 0) {
    return "moderate";
  }

  return "light";
}

function explainDomain(domain: string, historicalDomain: string): SimilarityReason | null {
  if (domain !== historicalDomain) {
    return null;
  }

  return {
    dimension: "domain",
    explanation: `Both claims live in ${domain} territory.`,
    weight: 0.3,
  };
}

function explainClaimType(claimType: string, historicalClaimType: string): SimilarityReason | null {
  if (claimType !== historicalClaimType) {
    return null;
  }

  return {
    dimension: "claim_type",
    explanation: `Both claims use the ${claimType.replaceAll("_", " ")} structure.`,
    weight: 0.2,
  };
}

function explainStakeLevel(stakesLevel: string, historicalStakeLevel: string): SimilarityReason | null {
  if (stakesLevel !== historicalStakeLevel) {
    return null;
  }

  return {
    dimension: "stakes_level",
    explanation: `Both claims carry ${stakesLevel} stakes.`,
    weight: 0.1,
  };
}

function explainStructureKind(structureKind: string, historicalStructureKind: string): SimilarityReason | null {
  const comparable = historicalStructureKind ?? "";
  if (!comparable || structureKind !== comparable) {
    return null;
  }

  return {
    dimension: "structure_kind",
    explanation: `Both claims have the same structure kind: ${structureKind.replaceAll("_", " ")}.`,
    weight: 0.1,
  };
}

function explainProvenance(provenance: string, historicalProvenance: string): SimilarityReason | null {
  if (provenance !== historicalProvenance) {
    return null;
  }

  return {
    dimension: "provenance",
    explanation: `Both claims were grounded in ${provenance.replaceAll("_", " ")}.`,
    weight: 0.05,
  };
}

function explainConfidence(confidence: number, historicalConfidence: number): SimilarityReason | null {
  const diff = Math.abs(confidence - historicalConfidence);
  if (diff >= 12) {
    return null;
  }

  return {
    dimension: "confidence_level",
    explanation: `Both claims began around ${confidenceBucket(confidence)} confidence.`,
    weight: 0.1,
  };
}

function explainTextSimilarity(newText: string, historicalText: string): SimilarityReason | null {
  const score = computeTextSimilarity(newText, historicalText);
  if (score < 0.3) {
    return null;
  }

  return {
    dimension: "text_similarity",
    explanation: `The text overlaps structurally with a prior claim (${Math.round(score * 100)}% token overlap).`,
    weight: Number((score * 0.15).toFixed(2)),
  };
}

function buildConfidenceJourney(map: ThoughtMapModel) {
  const events = map.events.filter((event) => event.eventType === "claim_resolution" || event.eventType === "dialectic_round" || event.eventType === "move_applied");
  const confidenceSteps = events
    .map((event) => {
      const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : null;
      const value =
        typeof payload?.newConfidence === "number"
          ? payload.newConfidence
          : typeof payload?.confidenceAtRoundEnd === "number"
            ? payload.confidenceAtRoundEnd
            : typeof payload?.predictedConfidenceAtResolution === "number"
              ? payload.predictedConfidenceAtResolution
              : null;
      return value != null ? { date: asDate(event.createdAt), confidence: Math.round(value) } : null;
    })
    .filter((value): value is { date: Date; confidence: number } => value != null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (!confidenceSteps.length) {
    const capture = captureSnapshotForMap(map);
    return capture ? `Started and ended around ${Math.round(capture.confidence)}%.` : "Confidence was not updated.";
  }

  const first = confidenceSteps[0]!;
  const last = confidenceSteps[confidenceSteps.length - 1]!;
  const delta = last.confidence - first.confidence;

  if (Math.abs(delta) < 5) {
    return `Stayed around ${first.confidence}% across ${confidenceSteps.length} update${confidenceSteps.length === 1 ? "" : "s"}.`;
  }

  return delta < 0
    ? `Dropped from ${first.confidence}% to ${last.confidence}% after critique.`
    : `Rose from ${first.confidence}% to ${last.confidence}% after critique.`;
}

function buildOutcome(map: ThoughtMapModel): HereBeforeOutcome {
  const resolutionEvent = [...map.events]
    .reverse()
    .find((event) => event.eventType === "claim_resolution");
  const payload = resolutionEvent && resolutionEvent.payload && typeof resolutionEvent.payload === "object" ? (resolutionEvent.payload as Record<string, unknown>) : null;
  const resolutionType =
    payload?.resolutionType === "confirmed" ||
    payload?.resolutionType === "disconfirmed" ||
    payload?.resolutionType === "partially_confirmed" ||
    payload?.resolutionType === "inconclusive" ||
    payload?.resolutionType === "reframed" ||
    payload?.resolutionType === "superseded"
      ? String(payload.resolutionType)
      : null;
  const lessonsCaptured = Array.isArray(payload?.lessonsCaptured)
    ? payload.lessonsCaptured.filter((lesson) => typeof lesson === "string" && lesson.trim().length > 0)
    : [];
  const postMortem = payload?.postMortem && typeof payload.postMortem === "object" ? (payload.postMortem as Record<string, unknown>) : null;

  const roundCount = map.events.filter((event) => event.eventType === "dialectic_round").length;
  const concessionsMade = map.events.filter((event) => event.eventType === "dialectic_round").reduce((sum, event) => {
    const roundPayload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : null;
    const response = typeof roundPayload?.response === "string" ? String(roundPayload.response).toLowerCase() : "";
    return sum + (/(concede|concession|agree|you may be right|true)/.test(response) ? 1 : 0);
  }, 0);

  return {
    wasResolved: resolutionEvent != null,
    outcomeType: resolutionType,
    confidenceJourney: buildConfidenceJourney(map),
    roundCount,
    concessionsMade,
    finalLesson:
      lessonsCaptured[0] ??
      (typeof postMortem?.whatToDoNext === "string" ? String(postMortem.whatToDoNext) : null) ??
      null,
  };
}

function getLessonFromOutcome(outcome: HereBeforeOutcome) {
  if (!outcome.wasResolved) {
    return null;
  }

  if (outcome.finalLesson) {
    return outcome.finalLesson;
  }

  if (outcome.outcomeType === "disconfirmed" || outcome.outcomeType === "superseded") {
    return "The structure is worth revisiting whenever confidence outruns evidence.";
  }

  if (outcome.outcomeType === "confirmed") {
    return "This is a place where prior conviction matched the result, so Penny should keep the same framing visible.";
  }

  return "The last time this structure appeared, it needed a tighter update loop.";
}

function scoreHistoricalClaim(newClaim: HereBeforeClaimDraft, map: ThoughtMapModel) {
  const capture = captureSnapshotForMap(map);
  if (!capture) {
    return null;
  }
  const representativeClaim = map.nodes.find((node) => node.kind !== "root") ?? map.nodes[0] ?? null;

  const historicalDomain = classifyCalibrationDomain(`${map.title} ${map.rawThought} ${map.nodes.map((node) => node.content).join(" ")}`);
  const historicalClaimType = capture.structureKind ?? "assertion";
  const historicalStakeLevel = inferStakeLevel(capture.stakes);
  const historicalProvenance = capture.provenance;
  const historicalConfidence = capture.confidence;
  const reasons = [
    explainDomain(newClaim.domain, historicalDomain),
    explainClaimType(newClaim.claimType, historicalClaimType),
    explainStakeLevel(newClaim.stakesLevel, historicalStakeLevel),
    explainStructureKind(newClaim.structureKind, historicalClaimType),
    explainProvenance(newClaim.provenance, historicalProvenance),
    explainConfidence(newClaim.confidence, historicalConfidence),
    explainTextSimilarity(newClaim.text, map.rawThought || map.title),
  ].filter((reason): reason is SimilarityReason => reason != null);

  const score = reasons.reduce((sum, reason) => sum + reason.weight, 0);
  const structuralBonus = map.events.some((event) => event.eventType === "claim_resolution") ? 0.05 : 0;
  const totalScore = Math.min(1, Number((score + structuralBonus).toFixed(3)));

  return {
    claim: map,
    score: totalScore,
    reasons,
    capture,
    representativeClaim,
  };
}

export async function detectHereBeforeSignal(userId: string, newClaim: HereBeforeClaimDraft): Promise<HereBeforeSignal | null> {
  const historicalClaims = (await listThoughtMaps()).filter((map) => map.userId === userId);

  if (historicalClaims.length < 10) {
    return null;
  }

  const scored = historicalClaims
    .map((historical) => scoreHistoricalClaim(newClaim, historical))
    .filter((item): item is NonNullable<typeof item> => item != null)
    .sort((a, b) => b.score - a.score);

  const topMatch = scored.find((item) => item.score > 0.6) ?? null;
  if (!topMatch) {
    return null;
  }

  const outcome = buildOutcome(topMatch.claim);
  const lesson = getLessonFromOutcome(outcome);
  const urgency = topMatch.score > 0.85 || outcome.roundCount >= 3 ? "high" : topMatch.score > 0.7 ? "medium" : "low";

  return {
    triggeredFor: newClaim.id,
    similarMapId: topMatch.claim.id,
    similarClaimId: topMatch.representativeClaim?.id ?? topMatch.claim.nodes[0]?.id ?? topMatch.claim.id,
    similarClaimText: topMatch.representativeClaim?.content ?? topMatch.capture.title,
    similarityScore: topMatch.score,
    similarityReasons: topMatch.reasons,
    whatHappened: outcome,
    lesson,
    urgency,
  };
}
