import type { SessionEvent, SessionSummary } from "@/types/thought-map";

function countEvents(events: SessionEvent[], eventType: SessionEvent["eventType"]) {
  return events.filter((event) => event.eventType === eventType).length;
}

function summarizeClaimFocus(events: SessionEvent[], scopedClaimIds: string[]) {
  const claimEvents = events.filter((event) => event.claimId != null);
  const focusedClaims = claimEvents.filter((event) => scopedClaimIds.includes(event.claimId ?? ""));
  const updatedClaim = [...focusedClaims]
    .reverse()
    .find((event) => event.eventType === "confidence_update" || event.eventType === "claim_created" || event.eventType === "critique_round");

  return updatedClaim?.claimId ?? null;
}

export function generateSessionSummary(params: {
  sessionId: string;
  events: SessionEvent[];
  scopedClaimIds: string[];
  loadBearingClaimIds?: string[];
  promotedShapeCount?: number;
  generatedAt?: Date;
}): SessionSummary {
  const claimsExamined = countEvents(params.events, "claim_opened");
  const claimsUpdated = countEvents(params.events, "confidence_update");
  const claimsCreated = countEvents(params.events, "claim_created");
  const critiquesRun = countEvents(params.events, "critique_round");
  const concessionsMade = params.events.filter(
    (event) => event.eventType === "critique_round" && /concede|concession|agree|you may be right/i.test(event.description),
  ).length;
  const artifactsGenerated = countEvents(params.events, "artifact_generated");
  const focusedClaimId = summarizeClaimFocus(params.events, params.scopedClaimIds);
  const focusNote =
    focusedClaimId != null
      ? `You moved the most on ${focusedClaimId}.`
      : params.loadBearingClaimIds?.length
        ? `You kept pressure on ${params.loadBearingClaimIds.length} scoped claims.`
        : null;
  const shapeNote =
    params.promotedShapeCount && params.promotedShapeCount > 0
      ? ` You also promoted ${params.promotedShapeCount} new shape${params.promotedShapeCount === 1 ? "" : "s"}.`
      : "";

  const keyInsight =
    claimsUpdated > 0
      ? `Today you updated your confidence on ${focusedClaimId ?? "a key claim"} after recorded session pressure.${shapeNote}`
      : focusNote
        ? `${focusNote}${shapeNote}`
        : artifactsGenerated > 0
          ? `You generated ${artifactsGenerated} artifact${artifactsGenerated === 1 ? "" : "s"} and kept the session moving.`
          : "You kept the session focused, but no high-signal claim move stood out yet.";

  return {
    sessionId: params.sessionId,
    claimsExamined,
    claimsUpdated,
    claimsCreated,
    critiquesRun,
    concessionsMade,
    artifactsGenerated,
    keyInsight,
    generatedAt: params.generatedAt ?? new Date(),
  };
}
