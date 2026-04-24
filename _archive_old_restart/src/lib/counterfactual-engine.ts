import type { ClaimCaptureSnapshot } from "@/lib/penny-insights";
import { captureSnapshotForMap } from "@/lib/penny-insights";
import { classifyCalibrationDomain } from "@/lib/calibration";
import type { ThoughtMapModel, ThoughtMapEvent, ThoughtNodeModel, ClaimResolution } from "@/types/thought-map";
import type {
  CounterfactualAnalysis,
  CounterfactualArchive,
  CounterfactualArchiveEntry,
  CounterfactualScenario,
  DecisionTimelinePoint,
  HindsightAssessment,
} from "@/types/counterfactual";

const TIMELINE_DAY_OFFSETS = [0, 30, 60, 90] as const;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function daysBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isPositiveResolution(resolutionType: ClaimResolution["resolutionType"]) {
  return resolutionType === "confirmed" || resolutionType === "partially_confirmed";
}

function isNegativeResolution(resolutionType: ClaimResolution["resolutionType"]) {
  return resolutionType === "disconfirmed" || resolutionType === "superseded";
}

function resolutionLabel(resolutionType: ClaimResolution["resolutionType"]) {
  return resolutionType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseConfidence(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? clampConfidence(value) : null;
}

type ConfidenceHistoryPoint = {
  date: Date;
  confidence: number;
  label: string;
  kind: "capture" | "dialectic_round" | "resolution";
  delta: number | null;
};

function parseDialecticRoundPoint(event: ThoughtMapEvent) {
  if (event.eventType !== "dialectic_round" || !event.payload || typeof event.payload !== "object") {
    return null;
  }

  const payload = event.payload as Record<string, unknown>;
  const dialecticRound = payload.dialecticRound && typeof payload.dialecticRound === "object" ? (payload.dialecticRound as Record<string, unknown>) : null;
  const roundTitle = typeof payload.title === "string" && payload.title.trim().length > 0 ? payload.title.trim() : "Dialectic round";
  const roundName = typeof payload.round === "string" && payload.round.trim().length > 0 ? payload.round.trim() : roundTitle;
  const confidenceAtRoundStart = parseConfidence(dialecticRound?.confidenceAtRoundStart ?? payload.confidenceAtRoundStart);
  const confidenceAtRoundEnd = parseConfidence(dialecticRound?.confidenceAtRoundEnd ?? payload.confidenceAtRoundEnd);
  const confidenceDelta =
    typeof dialecticRound?.confidenceDelta === "number"
      ? dialecticRound.confidenceDelta
      : typeof payload.confidenceDelta === "number"
        ? payload.confidenceDelta
        : null;

  const confidence = confidenceAtRoundEnd ?? confidenceAtRoundStart;

  if (confidence == null) {
    return null;
  }

  return {
    date: event.createdAt,
    confidence,
    label: `${roundName}: ${confidenceAtRoundStart != null && confidenceAtRoundEnd != null ? `${confidenceAtRoundStart}% → ${confidenceAtRoundEnd}%` : `${confidence}%`}`,
    kind: "dialectic_round" as const,
    delta: confidenceDelta,
  };
}

function captureConfidence(snapshot: ClaimCaptureSnapshot | null, claim: ThoughtNodeModel, resolution: ClaimResolution) {
  if (snapshot?.confidence != null) {
    return clampConfidence(snapshot.confidence);
  }

  if (claim.scores?.confidence != null) {
    return clampConfidence(claim.scores.confidence * 100);
  }

  return clampConfidence(resolution.predictedConfidenceAtResolution);
}

function buildConfidenceHistory(
  map: ThoughtMapModel,
  claim: ThoughtNodeModel,
  resolution: ClaimResolution,
  originalConfidence: number,
) {
  const history: ConfidenceHistoryPoint[] = [
    {
      date: claim.createdAt,
      confidence: originalConfidence,
      label: `Claim captured at ${originalConfidence}% confidence`,
      kind: "capture" as const,
      delta: 0,
    },
  ];

  for (const point of map.events
    .filter((event) => event.nodeId === claim.id)
    .map(parseDialecticRoundPoint)
    .filter((point): point is NonNullable<ReturnType<typeof parseDialecticRoundPoint>> => point !== null)) {
    history.push(point);
  }

  history.push({
    date: resolution.resolutionDate,
    confidence: resolution.predictedConfidenceAtResolution,
    label: `Resolved as ${resolutionLabel(resolution.resolutionType)} at ${resolution.predictedConfidenceAtResolution}%`,
    kind: "resolution" as const,
    delta: resolution.predictedConfidenceAtResolution - originalConfidence,
  });

  return history.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function confidenceAtDate(date: Date, history: Array<{ date: Date; confidence: number }>, fallback: number) {
  const available = history.filter((point) => point.date.getTime() <= date.getTime());
  if (!available.length) {
    return fallback;
  }

  return available[available.length - 1]!.confidence;
}

function latestEventAtDate(
  date: Date,
  history: ConfidenceHistoryPoint[],
) {
  const available = history.filter((point) => point.date.getTime() <= date.getTime());
  if (!available.length) {
    return null;
  }

  const latest = available[available.length - 1]!;
  return latest.label;
}

function assessHindsight(date: Date, resolutionDate: Date, confidence: number): HindsightAssessment {
  if (date.getTime() >= resolutionDate.getTime()) {
    return "too_late";
  }

  const daysUntilResolution = daysBetween(date, resolutionDate);
  if (confidence >= 70) {
    return daysUntilResolution > 15 ? "good_time_to_act" : "about_right";
  }

  if (confidence <= 45) {
    return daysUntilResolution > 30 ? "too_early" : "about_right";
  }

  return "about_right";
}

function scenarioActionType(confidence: number, resolutionType: ClaimResolution["resolutionType"]) {
  if (confidence >= 70) {
    return "act_on_belief" as const;
  }

  if (confidence <= 40) {
    return "do_opposite" as const;
  }

  if (isNegativeResolution(resolutionType) && confidence >= 55) {
    return "do_opposite" as const;
  }

  return "wait_for_more_evidence" as const;
}

function hypotheticalOutcome(
  actionType: CounterfactualScenario["actionType"],
  resolutionType: ClaimResolution["resolutionType"],
  confidence: number,
) {
  if (actionType === "act_on_belief") {
    return isPositiveResolution(resolutionType)
      ? `At ${confidence}% confidence, acting would likely have lined up with how the claim ultimately resolved.`
      : `At ${confidence}% confidence, acting would have committed you before the claim was ready.`;
  }

  if (actionType === "do_opposite") {
    return isNegativeResolution(resolutionType)
      ? `At ${confidence}% confidence, the opposite move would probably have saved you from a bad call.`
      : `At ${confidence}% confidence, the opposite move would have pushed against a claim that later held up.`;
  }

  return isPositiveResolution(resolutionType)
    ? `Waiting would have preserved optionality, but the eventual resolution suggests the claim was already becoming actionable.`
    : `Waiting would have been the safer move because the claim still needed more evidence.`;
}

function scenarioLesson(
  actionType: CounterfactualScenario["actionType"],
  resolutionType: ClaimResolution["resolutionType"],
  confidence: number,
  dayOffset: number,
) {
  if (actionType === "act_on_belief") {
    return isPositiveResolution(resolutionType)
      ? `Day ${dayOffset} was a real decision point. The claim was already strong enough to act on.`
      : `Day ${dayOffset} would have been too early; the confidence was high but the outcome did not support moving yet.`;
  }

  if (actionType === "do_opposite") {
    return isNegativeResolution(resolutionType)
      ? `Day ${dayOffset} would have rewarded reversal. The recorded confidence was too low for the eventual outcome.`
      : `Day ${dayOffset} still looked too tentative to reverse. The safer call was to keep collecting evidence.`;
  }

  return confidence >= 55
    ? `Day ${dayOffset} sat in the waiting zone: not weak enough to reject, not strong enough to commit.`
    : `Day ${dayOffset} still needed more evidence before it should have become a decision.`;
}

function buildScenarios(
  claim: ThoughtNodeModel,
  resolution: ClaimResolution,
  history: ConfidenceHistoryPoint[],
  originalConfidence: number,
): CounterfactualScenario[] {
  return TIMELINE_DAY_OFFSETS.map((dayOffset) => {
    const scenarioDate = addDays(claim.createdAt, dayOffset);
    const confidence = confidenceAtDate(scenarioDate, history, originalConfidence);
    const actionType = scenarioActionType(confidence, resolution.resolutionType);
    const outcomeIsPositive = isPositiveResolution(resolution.resolutionType);
    const outcomeIsNegative = isNegativeResolution(resolution.resolutionType);
    const wouldHaveBeenBetter =
      actionType === "act_on_belief"
        ? outcomeIsPositive
        : actionType === "do_opposite"
          ? outcomeIsNegative
          : null;

    return {
      id: `${claim.id}:${dayOffset}`,
      scenarioLabel: dayOffset === 0 ? "If you had acted at capture" : `If you had acted at day ${dayOffset}`,
      scenarioDayOffset: dayOffset,
      confidenceAtThatPoint: confidence,
      actionType,
      hypotheticalOutcome: hypotheticalOutcome(actionType, resolution.resolutionType, confidence),
      wasHigherConfidenceThanActual: confidence > resolution.predictedConfidenceAtResolution,
      wouldHaveBeenBetter,
      lesson: scenarioLesson(actionType, resolution.resolutionType, confidence, dayOffset),
    };
  });
}

function buildDecisionTimeline(
  resolution: ClaimResolution,
  history: ConfidenceHistoryPoint[],
  originalConfidence: number,
): DecisionTimelinePoint[] {
  const resolutionOffset = Math.max(0, daysBetween(history[0]?.date ?? resolution.resolutionDate, resolution.resolutionDate));
  const anchorOffsets = Array.from(new Set([...TIMELINE_DAY_OFFSETS, resolutionOffset])).sort((a, b) => a - b);

  return anchorOffsets.map((dayOffset) => {
    const date = addDays(history[0]?.date ?? resolution.resolutionDate, dayOffset);
    const confidenceAtPoint = confidenceAtDate(date, history, originalConfidence);

    return {
      date,
      dayOffset,
      confidenceAtPoint,
      eventAtPoint: latestEventAtDate(date, history),
      hindsightAssessment: assessHindsight(date, resolution.resolutionDate, confidenceAtPoint),
    };
  });
}

function synthesizeKeyInsight(
  scenarios: CounterfactualScenario[],
  timeline: DecisionTimelinePoint[],
  resolution: ClaimResolution,
  originalConfidence: number,
) {
  const bestBranch = scenarios.reduce<CounterfactualScenario | null>((best, scenario) => {
    if (!best) {
      return scenario;
    }

    return Math.abs(scenario.confidenceAtThatPoint - resolution.predictedConfidenceAtResolution) > Math.abs(best.confidenceAtThatPoint - resolution.predictedConfidenceAtResolution)
      ? scenario
      : best;
  }, null);

  const salientPoint = timeline.find((point) => point.dayOffset >= 30 && point.confidenceAtPoint >= 65) ?? timeline[timeline.length - 1] ?? null;

  if (!bestBranch) {
    return "There is not enough history yet to make the branch analysis meaningful.";
  }

  const branchText =
    bestBranch.actionType === "act_on_belief"
      ? "the record shows a branch where acting would have been rational"
      : bestBranch.actionType === "do_opposite"
        ? "the record shows a branch where reversal would have been the safer move"
        : "the record shows a branch that still needed more evidence";

  const timelineText = salientPoint
    ? `By day ${salientPoint.dayOffset}, confidence had reached ${salientPoint.confidenceAtPoint}%, so the timeline had already become decision-shaped.`
    : `The timeline never developed a clean decision point before resolution.`;

  return `This reconstruction is a plausible branch, not a causal proof. ${timelineText} ${branchText}; the original capture was ${originalConfidence}%, and the final resolution landed as ${resolutionLabel(resolution.resolutionType)}.`;
}

export function buildCounterfactualAnalysis(params: {
  map: ThoughtMapModel;
  claim: ThoughtNodeModel;
  resolution: ClaimResolution;
  userId: string;
  captureSnapshot?: ClaimCaptureSnapshot | null;
}): CounterfactualAnalysis {
  const snapshot = params.captureSnapshot ?? captureSnapshotForMap(params.map);
  const originalConfidence = captureConfidence(snapshot, params.claim, params.resolution);
  const domain = classifyCalibrationDomain(`${params.map.title} ${params.map.rawThought} ${params.claim.content}`);
  const history = buildConfidenceHistory(params.map, params.claim, params.resolution, originalConfidence);
  const scenarios = buildScenarios(params.claim, params.resolution, history, originalConfidence);
  const decisionTimeline = buildDecisionTimeline(params.resolution, history, originalConfidence);

  return {
    id: `cf-${params.map.id}-${params.claim.id}-${params.resolution.id}`,
    claimId: params.claim.id,
    userId: params.userId,
    claimText: params.claim.content,
    domain,
    actualOutcome: params.resolution.actualOutcome,
    actualResolutionDate: params.resolution.resolutionDate,
    confidenceAtResolution: params.resolution.predictedConfidenceAtResolution,
    originalConfidence,
    resolutionType: params.resolution.resolutionType,
    counterfactualScenarios: scenarios,
    decisionTimeline,
    keyInsight: synthesizeKeyInsight(scenarios, decisionTimeline, params.resolution, originalConfidence),
    generatedAt: new Date(),
  };
}

export function buildCounterfactualArchive(entries: Array<{
  map: ThoughtMapModel;
  claim: ThoughtNodeModel;
  resolution: ClaimResolution;
  userId: string;
  captureSnapshot?: ClaimCaptureSnapshot | null;
}>): CounterfactualArchive {
  const analyses: CounterfactualArchiveEntry[] = entries.map((entry) => {
    const analysis = buildCounterfactualAnalysis(entry);
    const daysSinceResolution = Math.max(0, daysBetween(entry.resolution.resolutionDate, new Date()));

    return {
      ...analysis,
      mapId: entry.map.id,
      mapTitle: entry.map.title,
      daysSinceResolution,
      resolutionLabel: resolutionLabel(entry.resolution.resolutionType),
      timelineSummary:
        analysis.decisionTimeline.length > 0
          ? analysis.decisionTimeline
              .map((point) => `${point.dayOffset}d:${point.confidenceAtPoint}%`)
              .join(" · ")
          : "No timeline available",
    };
  });

  analyses.sort((a, b) => b.actualResolutionDate.getTime() - a.actualResolutionDate.getTime());

  const archiveInsight =
    analyses.length > 0
      ? analyses[0]!.keyInsight
      : "No resolved claims have been archived yet, so the counterfactual engine has nothing to reconstruct.";

  return {
    userId: entries[0]?.userId ?? "demo-user",
    generatedAt: new Date(),
    totalAnalyses: analyses.length,
    analyses,
    archiveInsight,
  };
}
