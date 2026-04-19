import { prisma } from "@/db/prisma";
import { buildCounterfactualArchive } from "@/lib/counterfactual-engine";
import { captureSnapshotForMap } from "@/lib/penny-insights";
import { getThoughtMap } from "@/server/thought-map";
import type { CounterfactualArchive } from "@/types/counterfactual";
import type {
  ClaimResolution,
  ClaimResolutionType,
  CalibrationImpact,
  PostMortem,
  PropagationResult,
  ResolutionEvidence,
  ThoughtMapEvent,
  ThoughtMapModel,
  ThoughtNodeModel,
} from "@/types/thought-map";

function isClaimResolutionType(value: unknown): value is ClaimResolutionType {
  return (
    value === "confirmed" ||
    value === "disconfirmed" ||
    value === "partially_confirmed" ||
    value === "inconclusive" ||
    value === "reframed" ||
    value === "superseded"
  );
}

function parseResolutionEvidence(value: unknown): ResolutionEvidence[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const payload = entry as Record<string, unknown>;
      const evidenceText = typeof payload.evidenceText === "string" ? payload.evidenceText.trim() : "";
      if (!evidenceText) {
        return null;
      }

      return {
        evidenceText,
        sourceType:
          payload.sourceType === "observation" ||
          payload.sourceType === "report" ||
          payload.sourceType === "third_party" ||
          payload.sourceType === "personal_experience" ||
          payload.sourceType === "data"
            ? payload.sourceType
            : "observation",
        sourceUrl: typeof payload.sourceUrl === "string" ? payload.sourceUrl : null,
        addedAt: typeof payload.addedAt === "string" || payload.addedAt instanceof Date ? new Date(payload.addedAt) : new Date(),
      } satisfies ResolutionEvidence;
    })
    .filter((entry): entry is ResolutionEvidence => entry !== null);
}

function parsePropagationResults(value: unknown): PropagationResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const payload = entry as Record<string, unknown>;
      const claimId = typeof payload.claimId === "string" ? payload.claimId : "";
      const claimText = typeof payload.claimText === "string" ? payload.claimText : "";
      if (!claimId || !claimText) {
        return null;
      }

      return {
        claimId,
        claimText,
        relation: payload.relation === "direct" || payload.relation === "transitive" ? payload.relation : "direct",
        currentConfidence: typeof payload.currentConfidence === "number" ? payload.currentConfidence : null,
        suggestedConfidence: typeof payload.suggestedConfidence === "number" ? payload.suggestedConfidence : null,
        decision: payload.decision === "accept" || payload.decision === "override" || payload.decision === "decouple" ? payload.decision : "accept",
        confidenceDelta: typeof payload.confidenceDelta === "number" ? payload.confidenceDelta : null,
        downstreamArtifacts: Array.isArray(payload.downstreamArtifacts)
          ? payload.downstreamArtifacts.filter((item): item is string => typeof item === "string")
          : [],
      } satisfies PropagationResult;
    })
    .filter((entry): entry is PropagationResult => entry !== null);
}

function normalizeCalibrationImpact(value: unknown): CalibrationImpact {
  if (!value || typeof value !== "object") {
    return {
      domainAffected: "general",
      previousBrierScore: 0,
      newBrierScore: 0,
      directionOfChange: "unchanged",
      confidenceAdjustmentSuggested: null,
    };
  }

  const payload = value as Record<string, unknown>;
  return {
    domainAffected: typeof payload.domainAffected === "string" ? payload.domainAffected : "general",
    previousBrierScore: typeof payload.previousBrierScore === "number" ? payload.previousBrierScore : 0,
    newBrierScore: typeof payload.newBrierScore === "number" ? payload.newBrierScore : 0,
    directionOfChange:
      payload.directionOfChange === "improved" || payload.directionOfChange === "degraded" || payload.directionOfChange === "unchanged"
        ? payload.directionOfChange
        : "unchanged",
    confidenceAdjustmentSuggested:
      typeof payload.confidenceAdjustmentSuggested === "number" ? payload.confidenceAdjustmentSuggested : null,
  };
}

function normalizePostMortem(value: unknown): PostMortem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const whatHappened = typeof payload.whatHappened === "string" ? payload.whatHappened.trim() : "";
  const whatWasMissed = typeof payload.whatWasMissed === "string" ? payload.whatWasMissed.trim() : "";
  const whatToDoNextTime = typeof payload.whatToDoNextTime === "string" ? payload.whatToDoNextTime.trim() : "";

  if (!whatHappened || !whatWasMissed || !whatToDoNextTime) {
    return null;
  }

  return {
    whatHappened,
    whatWasMissed,
    shapesActiveAtPrediction: Array.isArray(payload.shapesActiveAtPrediction)
      ? payload.shapesActiveAtPrediction.filter((item): item is string => typeof item === "string")
      : [],
    biasesActiveAtPrediction: Array.isArray(payload.biasesActiveAtPrediction)
      ? payload.biasesActiveAtPrediction.filter((item): item is string => typeof item === "string")
      : [],
    keyAssumptionsThatWereWrong: Array.isArray(payload.keyAssumptionsThatWereWrong)
      ? payload.keyAssumptionsThatWereWrong.filter((item): item is string => typeof item === "string")
      : [],
    whatToDoNextTime,
    emotionalAssessment:
      payload.emotionalAssessment === "relieved" ||
      payload.emotionalAssessment === "unsurprised" ||
      payload.emotionalAssessment === "surprised" ||
      payload.emotionalAssessment === "frustrated" ||
      payload.emotionalAssessment === "uncertain"
        ? payload.emotionalAssessment
        : null,
    createdAt: typeof payload.createdAt === "string" || payload.createdAt instanceof Date ? new Date(payload.createdAt) : new Date(),
  };
}

function parseClaimResolutionEvent(event: ThoughtMapEvent): ClaimResolution | null {
  if (event.eventType !== "claim_resolution" || !event.payload || typeof event.payload !== "object") {
    return null;
  }

  const payload = event.payload as Record<string, unknown>;
  if (!isClaimResolutionType(payload.resolutionType)) {
    return null;
  }

  const id = typeof payload.id === "string" ? payload.id : event.id;
  const claimId = typeof payload.claimId === "string" ? payload.claimId : event.nodeId ?? "";
  const mapId = typeof payload.mapId === "string" ? payload.mapId : event.mapId;
  const actualOutcome = typeof payload.actualOutcome === "string" ? payload.actualOutcome.trim() : "";
  const predictedConfidenceAtResolution =
    typeof payload.predictedConfidenceAtResolution === "number" ? payload.predictedConfidenceAtResolution : 0;
  const brierScore = typeof payload.brierScore === "number" ? payload.brierScore : 0;
  const logScore = typeof payload.logScore === "number" ? payload.logScore : 0;

  if (!claimId || !mapId || !actualOutcome) {
    return null;
  }

  return {
    id,
    claimId,
    mapId,
    resolutionDate:
      typeof payload.resolutionDate === "string" || payload.resolutionDate instanceof Date
        ? new Date(payload.resolutionDate)
        : event.createdAt,
    resolutionType: payload.resolutionType,
    actualOutcome,
    predictedConfidenceAtResolution,
    brierScore,
    logScore,
    resolutionEvidence: parseResolutionEvidence(payload.resolutionEvidence),
    postMortem: normalizePostMortem(payload.postMortem),
    propagationTriggered: Boolean(payload.propagationTriggered),
    propagationResults: parsePropagationResults(payload.propagationResults),
    lessonsCaptured: Array.isArray(payload.lessonsCaptured)
      ? payload.lessonsCaptured.filter((item): item is string => typeof item === "string")
      : [],
    calibrationImpact: normalizeCalibrationImpact(payload.calibrationImpact),
    counterfactualAnalysis: null,
  };
}

export async function buildCounterfactualArchiveForUser(userId: string): Promise<CounterfactualArchive> {
  const mapIds = await prisma.thoughtMap.findMany({
    where: { userId },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });

  const maps = (await Promise.all(mapIds.map(async ({ id }) => await getThoughtMap(id)))).filter(Boolean) as ThoughtMapModel[];

  const archive = buildCounterfactualArchive(
    maps.flatMap((map) => {
      const snapshot = captureSnapshotForMap(map);
      return map.events
        .map((event) => {
          const resolution = parseClaimResolutionEvent(event);
          const claim = resolution ? map.nodes.find((node) => node.id === resolution.claimId) ?? null : null;

          if (!resolution || !claim) {
            return null;
          }

          return {
            map,
            claim,
            resolution,
            userId,
            captureSnapshot: snapshot,
          };
        })
        .filter(
          (entry): entry is {
            map: ThoughtMapModel;
            claim: ThoughtNodeModel;
            resolution: ClaimResolution;
            userId: string;
            captureSnapshot: ReturnType<typeof captureSnapshotForMap>;
          } => entry !== null,
        );
    }),
  );

  return {
    ...archive,
    userId,
  };
}
